const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function render(file, mocks, stateOverrides = {}) {
  let index = 0;
  const writes = [];
  const react = {
    createContext: () => ({ Provider: 'provider' }), useContext: () => ({}), useEffect() {},
    useState(initial) { const i = index++; return [i in stateOverrides ? stateOverrides[i] : initial, value => writes.push([i, value])]; },
    useRef: current => ({ current }), useCallback: fn => fn, useMemo: fn => fn(),
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: name => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : mocks[name] ?? {} });
  return { value: exports.default({ children: null }).props.value, writes };
}
const invitation = { id: 'invite', room: { slug: 'new-room', title: 'Room title' } };
function inbox(options = {}) {
  const events = [];
  const h = render('components/RoomInvitations.tsx', {
    'next/navigation': { usePathname: () => '/', useRouter: () => ({ push: url => events.push(['navigate', url]) }) },
    '@/lib/supabase-browser': { api: async (url, body) => { events.push(['request', url, body?.action]); if (options.error) throw new Error('Room has ended'); return {}; } },
    '@/lib/use-live-refresh': { useLiveRefresh() {} },
    './RoomSession': { useRoomSession: () => ({ slug: null, join: async (slug, beforeJoin) => {
      events.push(['join-requested', slug]);
      if (options.cancelled) return false;
      await beforeJoin(); events.push(['session-joined', slug]); return true;
    } }) },
    './CallProvider': { useCall: () => ({ inCall: options.inCall ?? false }) },
    './Providers': { useToast: () => (...args) => events.push(['toast', ...args]) },
  });
  return { ...h, events };
}
test('Join accepts the invitation, starts a room session, and navigates directly to that room', async () => {
  const h = inbox();
  await h.value.respond(invitation, 'accept');
  assert.deepEqual(h.events, [
    ['join-requested', 'new-room'], ['request', '/api/invitations/invite', 'accept'],
    ['session-joined', 'new-room'], ['navigate', '/r/new-room'],
  ]);
});
test('cancelling a room switch leaves the invitation pending', async () => {
  const h = inbox({ cancelled: true });
  await h.value.respond(invitation, 'accept');
  assert.deepEqual(h.events, [['join-requested', 'new-room']]);
});
test('expired invitation errors do not join or navigate', async () => {
  const h = inbox({ error: true });
  await h.value.respond(invitation, 'accept');
  assert.ok(h.events.some(e => e[0] === 'toast'));
  assert.ok(!h.events.some(e => e[0] === 'session-joined' || e[0] === 'navigate'));
});
test('dismissal never joins a room', async () => {
  const h = inbox();
  await h.value.respond(invitation, 'dismiss');
  assert.deepEqual(h.events, [['request', '/api/invitations/invite', 'dismiss']]);
});
test('a person in a private call must end it before joining from a notification', async () => {
  const h = inbox({ inCall: true });
  await h.value.respond(invitation, 'accept');
  assert.equal(h.events.length, 1);
  assert.equal(h.events[0][0], 'toast');
});

function session(confirmResult, current = 'old-room') {
  const events = [];
  const h = render('components/RoomSession.tsx', {
    'next/dynamic': { default: () => () => null },
    'next/navigation': { useRouter: () => ({}), usePathname: () => '/' },
    './Providers': { useConfirm: () => async () => { events.push('confirmed'); return confirmResult; } },
  }, { 0: current });
  return { ...h, events };
}
test('room session confirms before accepting an invitation or switching rooms', async () => {
  const h = session(true);
  assert.equal(await h.value.join('new-room', async () => { h.events.push('accepted'); }), true);
  assert.deepEqual(h.events, ['confirmed', 'accepted']);
  assert.ok(h.writes.some(([index, value]) => index === 0 && value === 'new-room'));
});
test('room session keeps the current room if confirmation is cancelled or acceptance fails', async () => {
  const cancelled = session(false);
  assert.equal(await cancelled.value.join('new-room', async () => { throw new Error('must not accept'); }), false);
  assert.equal(cancelled.writes.length, 0);
  const failed = session(true);
  await assert.rejects(failed.value.join('new-room', async () => { throw new Error('room ended'); }), /room ended/);
  assert.equal(failed.writes.length, 0);
});
test('accepting an invitation to the current room does not reconnect', async () => {
  const h = session(true, 'new-room');
  assert.equal(await h.value.join('new-room', async () => { h.events.push('accepted'); }), true);
  assert.deepEqual(h.events, ['accepted']);
  assert.equal(h.writes.length, 0);
});
