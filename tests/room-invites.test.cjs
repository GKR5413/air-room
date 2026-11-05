const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const me = '11111111-1111-1111-1111-111111111111';
const friend = '22222222-2222-2222-2222-222222222222';
const inviteId = '33333333-3333-3333-3333-333333333333';
function load(file, options = {}) {
  const calls = [];
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  const admin = { from(table) {
    const call = { table, methods: [] }; calls.push(call);
    const chain = new Proxy({}, { get: (_, key) => key === 'then' ? resolve => {
      let data = null;
      if (table === 'room_memberships') data = options.nonMember ? null : { user_id: me };
      if (table === 'follows') data = options.notFollowing ? null : { followee_id: friend };
      if (table === 'room_bans') data = options.banned ? { user_id: friend } : null;
      if (table === 'rooms') data = { slug: 'test', status: options.ended ? 'ended' : 'live' };
      if (table === 'room_invites') data = call.methods.some(m => m[0] === 'update') ? [{ id: inviteId }] : options.noInvite ? null : { room_id: 'room' };
      return Promise.resolve({ data, error: null }).then(resolve);
    } : (...args) => { call.methods.push([key, ...args]); return chain; } });
    return chain;
  } };
  const mocks = {
    '@/lib/supabase-admin': { admin },
    '@/lib/auth': { route: fn => fn, requireUser: async req => req.signedOut ? fail(401, 'Sign in required') : { id: me }, fail },
    '@/lib/api': { body: async req => req.body, isUuid: s => typeof s === 'string' && /^[a-f0-9-]{36}$/.test(s), requireLive: room => { if (room.status !== 'live') fail(410, 'Ended'); } },
    '@/lib/rooms': { getRoomBySlug: async () => ({ id: 'room', host_id: options.nonMember ? friend : me, status: options.ended ? 'ended' : 'live' }) },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, require: name => { if (!mocks[name]) throw new Error(name); return mocks[name]; } });
  return { handler: exports.POST, calls };
}
const send = 'app/api/rooms/[slug]/friends/route.ts';
const respond = 'app/api/invitations/[id]/route.ts';
const roomContext = { params: Promise.resolve({ slug: 'test' }) };
const inviteContext = { params: Promise.resolve({ id: inviteId }) };
for (const [name, options, req, status] of [
  ['signed out', {}, { signedOut: true }, 401],
  ['not a member', { nonMember: true }, {}, 403],
  ['not following', { notFollowing: true }, {}, 403],
  ['banned', { banned: true }, {}, 403],
  ['ended', { ended: true }, {}, 410],
]) test(`cannot send an invite when ${name}`, async () => {
  const { handler, calls } = load(send, options);
  await assert.rejects(handler({ body: { recipientId: friend }, ...req }, roomContext), { status });
  assert.ok(!calls.some(c => c.methods.some(m => m[0] === 'upsert')));
});
test('invites persist the authenticated sender and deduplicate per room and recipient', async () => {
  const { handler, calls } = load(send);
  await handler({ body: { recipientId: friend, sender_id: friend } }, roomContext);
  const upsert = calls.find(c => c.table === 'room_invites').methods.find(m => m[0] === 'upsert');
  assert.equal(upsert[1].sender_id, me);
  assert.equal(upsert[1].recipient_id, friend);
  assert.equal(upsert[2].onConflict, 'room_id,recipient_id');
  assert.equal(upsert[2].ignoreDuplicates, true);
});
test('dismissal is scoped to the signed-in recipient and pending status', async () => {
  const { handler, calls } = load(respond);
  await handler({ body: { action: 'dismiss' } }, inviteContext);
  for (const call of calls.filter(c => c.table === 'room_invites')) {
    assert.ok(call.methods.some(m => m[0] === 'eq' && m[1] === 'recipient_id' && m[2] === me));
    assert.ok(call.methods.some(m => m[0] === 'eq' && m[1] === 'status' && m[2] === 'pending'));
  }
});
for (const [name, options, status] of [['ended', { ended: true }, 410], ['banned', { banned: true }, 403], ['missing or owned by someone else', { noInvite: true }, 404]]) {
  test(`cannot accept an invite when ${name}`, async () => {
    const { handler, calls } = load(respond, options);
    await assert.rejects(handler({ body: { action: 'accept' } }, inviteContext), { status });
    assert.ok(!calls.some(c => c.methods.some(m => m[0] === 'update')));
  });
}
test('acceptance returns the room slug for direct joining without granting stage access', async () => {
  const { handler, calls } = load(respond);
  const result = await handler({ body: { action: 'accept' } }, inviteContext);
  assert.equal(result.slug, 'test');
  assert.ok(!calls.some(c => c.table === 'room_memberships' || c.table === 'stage_invitations'));
});
