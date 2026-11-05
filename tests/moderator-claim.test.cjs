const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(claimed, error = null) {
  const calls = [];
  const exports = {};
  const mocks = {
    './supabase-admin': { admin: { rpc: async (name, args) => { calls.push(['claim', name, args]); return { data: claimed, error }; } } },
    './auth': { fail: (status, message) => { throw Object.assign(new Error(message), { status }); } },
    './livekit': { setParticipantRole: async (...args) => calls.push(['permissions', ...args]) },
    './succession': { decideSuccession: () => ({ kind: 'promote', id: 'next-speaker' }) },
  };
  // Log persistence is stubbed independently; the claim and permission behavior are the subject.
  mocks['./supabase-admin'].admin.from = () => ({ insert: async row => calls.push(['log', row]) });
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/rooms.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, require: name => mocks[name] });
  return { promote: exports.ensureModerator, calls };
}
const room = { id: 'room', slug: 'abcd1234', leader_seen_at: null };
test('successful atomic claim updates LiveKit permissions and logs promotion', async () => {
  const { promote, calls } = load(true);
  assert.equal(await promote(room, false, []), 'next-speaker');
  assert.equal(calls[0][1], 'claim_room_moderator');
  assert.equal(calls[0][2].p_seen_at, null);
  assert.equal(calls[1][0], 'permissions');
  assert.equal(calls[1][3], 'moderator');
  assert.equal(calls[2][1].action, 'auto_promote_mod');
});
test('losing a concurrent claim does not assign permissions or log another promotion', async () => {
  const { promote, calls } = load(false);
  assert.equal(await promote(room, false, []), null);
  assert.equal(calls.length, 1);
});
test('failed claim reports failure rather than pretending promotion succeeded', async () => {
  const { promote, calls } = load(null, { message: 'missing migration' });
  await assert.rejects(promote(room, false, []), { status: 500 });
  assert.equal(calls.length, 1);
});
