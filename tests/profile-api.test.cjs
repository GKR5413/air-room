const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const me = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
function load(file, result = { data: { id: other }, error: null }) {
  const calls = [];
  const chain = new Proxy({}, { get: (_, key) => key === 'then'
    ? (resolve) => Promise.resolve(result).then(resolve)
    : (...args) => { calls.push([key, ...args]); return chain; } });
  const exports = {};
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  const mocks = {
    '@/lib/auth': { route: fn => fn, requireUser: async req => req.signedOut ? fail(401, 'Sign in required') : { id: me }, fail },
    '@/lib/api': { body: async req => req.body, isUuid: value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value) },
    '@/lib/supabase-admin': { admin: { from: table => { calls.push(['from', table]); return chain; } } },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, require: name => { if (!mocks[name]) throw new Error(name); return mocks[name]; } });
  return { handler: exports.POST, calls };
}
const connectionFile = 'app/api/people/[id]/route.ts';
const context = id => ({ params: Promise.resolve({ id }) });
for (const [action, follower, followee] of [['unfollow', me, other], ['remove_follower', other, me]]) {
  test(`${action} only deletes the current user's connection`, async () => {
    const { handler, calls } = load(connectionFile);
    await handler({ body: { action, follower_id: other, followee_id: other } }, context(other));
    assert.ok(calls.some(c => c[0] === 'delete'));
    assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'follower_id' && c[2] === follower));
    assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'followee_id' && c[2] === followee));
  });
}
test('follow is idempotent and uses the authenticated follower', async () => {
  const { handler, calls } = load(connectionFile);
  await handler({ body: { action: 'follow' } }, context(other));
  const call = calls.find(c => c[0] === 'upsert');
  assert.equal(call[1].follower_id, me);
  assert.equal(call[1].followee_id, other);
  assert.equal(call[2].ignoreDuplicates, true);
});
test('rejects self follow, invalid targets and unauthenticated changes', async () => {
  const { handler, calls } = load(connectionFile);
  for (const id of [me, 'bad-id']) await assert.rejects(handler({ body: { action: 'follow' } }, context(id)), { status: 400 });
  await assert.rejects(handler({ signedOut: true }, context(other)), { status: 401 });
  assert.equal(calls.length, 0);
});
test('rejects following a deleted user', async () => {
  const { handler } = load(connectionFile, { data: null, error: null });
  await assert.rejects(handler({ body: { action: 'follow' } }, context(other)), { status: 404 });
});
test('normalizes username and scopes profile updates to the current user', async () => {
  const { handler, calls } = load('app/api/me/route.ts');
  await handler({ body: { display_name: ' Alice ', username: ' Alice_1 ', avatar_url: null } });
  const update = calls.find(c => c[0] === 'update')[1];
  assert.equal(update.username, 'alice_1');
  assert.equal(update.display_name, 'Alice');
  assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'id' && c[2] === me));
});
test('reports concurrent duplicate usernames as a conflict', async () => {
  const { handler } = load('app/api/me/route.ts', { data: null, error: { code: '23505' } });
  await assert.rejects(handler({ body: { display_name: 'Alice', username: 'alice' } }), { status: 409 });
});
test('rejects invalid usernames, SVG and oversized photos before database writes', async () => {
  const { handler, calls } = load('app/api/me/route.ts');
  for (const patch of [{ username: 'ab' }, { username: 'has space' }, { avatar_url: 'data:image/svg+xml;base64,PHN2Zz4=' }, { avatar_url: 'data:image/png;base64,' + 'A'.repeat(700001) }]) {
    await assert.rejects(handler({ body: { display_name: 'Alice', ...patch } }), { status: 400 });
  }
  assert.equal(calls.length, 0);
});
test('profile photo can be saved and removed without requiring a new username', async () => {
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0aUAAAAASUVORK5CYII=';
  for (const avatar_url of [photo, null]) {
    const { handler, calls } = load('app/api/me/route.ts');
    await handler({ body: { display_name: 'Alice', avatar_url } });
    const update = calls.find(c => c[0] === 'update')[1];
    assert.equal(update.avatar_url, avatar_url);
    assert.ok(!('username' in update));
    assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'id' && c[2] === me));
  }
});
