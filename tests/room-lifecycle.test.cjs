const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function moduleFor(file, mocks) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, process, require: name => { if (!(name in mocks)) throw new Error(name); return mocks[name]; } });
  return exports;
}
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const room = { id: 'room', slug: 'panel', host_id: 'host', status: 'live', leader_seen_at: '2026-11-04T12:00:00Z' };
const member = (id, role) => ({ user_id: id, role, updated_at: '2026-11-04T12:00:00Z' });
function lifecycle({ connected = [], members = [], connectionError, membershipError, endError } = {}) {
  const events = [];
  const query = { select() { return this; }, eq() { return this; }, neq: async () => ({ data: members, error: membershipError }) };
  const mod = moduleFor('lib/room-lifecycle.ts', {
    './supabase-admin': { admin: { from: () => query } }, './auth': { fail },
    './api': { endRoom: async () => { if (endError) throw endError; events.push(['end']); } },
    './livekit': { listParticipants: async (_slug, strict) => { assert.equal(strict, true); if (connectionError) throw connectionError; return connected.map(identity => ({ identity })); } },
    './rooms': {
      ensureModerator: async (_room, online, speakers) => { events.push(['moderator', online, speakers]); return !online && speakers.length ? speakers[0].id : null; },
      logAction: async (...args) => events.push(['log', ...args]),
    },
  });
  return { reconcile: mod.reconcileRoom, events };
}

test('last panel member leaving ends the room even when listeners remain', async () => {
  const h = lifecycle({ connected: ['listener'], members: [member('gone', 'speaker')] });
  const result = await h.reconcile(room);
  assert.equal(result.room.status, 'ended');
  assert.equal(result.participants.length, 0);
  assert.equal(h.events[0][0], 'end');
  assert.equal(h.events[1].at(-1), 'auto_end_empty_panel');
});
test('an entirely empty started room ends', async () => {
  assert.equal((await lifecycle().reconcile(room)).room.status, 'ended');
});
test('an unstarted room stays open while the host is in the lobby or connecting', async () => {
  const h = lifecycle({ connected: ['listener'] });
  assert.equal((await h.reconcile({ ...room, leader_seen_at: null })).room.status, 'live');
  assert.ok(!h.events.some(e => e[0] === 'end'));
});
test('explicit last panel departure ends even before the first state refresh', async () => {
  assert.equal((await lifecycle().reconcile({ ...room, leader_seen_at: null }, true)).room.status, 'ended');
});
for (const role of ['host', 'moderator', 'speaker']) test(`a connected ${role} keeps the room running`, async () => {
  const id = role === 'host' ? 'host' : 'remaining';
  const h = lifecycle({ connected: [id, 'listener'], members: [member(id, role)] });
  const result = await h.reconcile(room, true);
  assert.equal(result.room.status, 'live');
  assert.ok(!h.events.some(e => e[0] === 'end'));
  assert.equal(result.promoted, role === 'speaker' ? id : null);
});
test('ending an already ended room does not repeat writes or promotion', async () => {
  const h = lifecycle();
  await h.reconcile({ ...room, status: 'ended' });
  assert.equal(h.events.length, 0);
});
for (const source of ['connectionError', 'membershipError', 'endError']) test(`${source} does not silently report the room ended`, async () => {
  const h = lifecycle({ [source]: new Error('service down') });
  await assert.rejects(h.reconcile(room));
  assert.ok(!h.events.some(e => e[0] === 'end' || e[0] === 'log'));
});

function livekit(options = {}) {
  const calls = [];
  class RoomServiceClient {
    async listParticipants() { if (options.error) throw options.error; return []; }
    async getParticipant() { if (options.error) throw options.error; return { sid: 'current-session' }; }
    async removeParticipant(...args) { calls.push(args); }
  }
  process.env.NEXT_PUBLIC_LIVEKIT_URL = 'wss://example.test';
  return { ...moduleFor('lib/livekit.ts', { 'livekit-server-sdk': { RoomServiceClient } }), calls };
}
test('a delayed leave for an old SID never kicks the rejoined connection', async () => {
  const h = livekit();
  assert.equal(await h.leaveParticipant('room', 'me', 'old-session'), false);
  assert.equal(h.calls.length, 0);
  assert.equal(await h.leaveParticipant('room', 'me', 'current-session'), true);
  assert.deepEqual(h.calls, [['room', 'me']]);
});
test('strict connectivity distinguishes a missing room from a service outage', async () => {
  assert.equal((await livekit({ error: { code: 'not_found' } }).listParticipants('room', true)).length, 0);
  await assert.rejects(livekit({ error: new Error('timeout') }).listParticipants('room', true), /timeout/);
});
test('departure is scoped to the authenticated identity, not a submitted identity', async () => {
  const calls = [];
  const mod = moduleFor('app/api/rooms/[slug]/depart/route.ts', {
    '@/lib/auth': { route: fn => fn, getIdentity: async () => ({ identity: { id: 'me', isGuest: false } }), fail },
    '@/lib/api': { body: async req => req.body },
    '@/lib/rooms': { getRoomBySlug: async () => room, getRole: async () => 'speaker' },
    '@/lib/livekit': { leaveParticipant: async (...args) => calls.push(args) },
    '@/lib/room-lifecycle': { reconcileRoom: async (r, left) => { assert.equal(left, true); return { room: { ...r, status: 'ended' } }; } },
  });
  const result = await mod.POST({ body: { participantSid: 'my-sid', identity: 'victim' } }, { params: Promise.resolve({ slug: 'panel' }) });
  assert.deepEqual(calls, [['panel', 'me', 'my-sid']]);
  assert.equal(result.ended, true);
  await assert.rejects(mod.POST({ body: {} }, { params: Promise.resolve({ slug: 'panel' }) }), { status: 400 });
});
