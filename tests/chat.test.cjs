const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/chat-core.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exported });
const c = exported;
// Objects built inside the vm sandbox have a different prototype, so compare their JSON.
const eq = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected));

const T0 = Date.parse('2026-11-04T10:00:00Z');
const iso = ms => new Date(ms).toISOString();
const call = (over = {}) => ({ id: 'c1', caller_id: 'alice', callee_id: 'bob', kind: 'video', status: 'ringing', created_at: iso(T0), answered_at: null, last_ping_at: iso(T0), ...over });

test('a pair is always ordered the same way round', () => {
  eq(c.pairOf('b', 'a'), ['a', 'b']);
  eq(c.pairOf('a', 'b'), ['a', 'b']);
});

test('chat needs a follow in BOTH directions', () => {
  const ab = { follower_id: 'a', followee_id: 'b' }, ba = { follower_id: 'b', followee_id: 'a' };
  assert.equal(c.isMutual([ab, ba], 'a', 'b'), true);
  assert.equal(c.isMutual([ab], 'a', 'b'), false);
  assert.equal(c.isMutual([ba], 'b', 'a'), false);
  assert.equal(c.isMutual([], 'a', 'b'), false);
  assert.equal(c.isMutual([ab, { follower_id: 'b', followee_id: 'z' }], 'a', 'b'), false);
});

test('only the person being called can answer or decline', () => {
  eq(c.nextCallStep(call(), 'accept', 'bob', T0 + 1000), { ok: true, to: 'accepted' });
  assert.equal(c.nextCallStep(call(), 'accept', 'alice', T0 + 1000).ok, false);
  assert.equal(c.nextCallStep(call(), 'decline', 'alice', T0 + 1000).status, 403);
  eq(c.nextCallStep(call(), 'decline', 'bob', T0 + 1000), { ok: true, to: 'declined', outcome: 'declined' });
});

test('only the caller can cancel a ringing call', () => {
  eq(c.nextCallStep(call(), 'cancel', 'alice', T0 + 1000), { ok: true, to: 'canceled', outcome: 'canceled' });
  assert.equal(c.nextCallStep(call(), 'cancel', 'bob', T0 + 1000).ok, false);
});

test('hanging up before it connects means cancel for the caller and decline for the callee', () => {
  assert.equal(c.nextCallStep(call(), 'end', 'alice', T0 + 1000).to, 'canceled');
  assert.equal(c.nextCallStep(call(), 'end', 'bob', T0 + 1000).to, 'declined');
});

test('strangers cannot touch a call', () => {
  for (const action of ['accept', 'decline', 'cancel', 'end', 'ping']) {
    const step = c.nextCallStep(call(), action, 'mallory', T0 + 1000);
    assert.equal(step.ok, false);
    assert.equal(step.status, 403);
  }
});

test('an unanswered call becomes missed after 45 seconds, whatever anyone tries', () => {
  const late = T0 + c.RING_MS + 1;
  const step = c.nextCallStep(call(), 'accept', 'bob', late);
  assert.equal(step.to, 'missed');
  assert.equal(step.outcome, 'missed');
  assert.equal(step.expired, true);
  assert.equal(c.isCallOpen(call(), late), false);
  assert.equal(c.isCallOpen(call(), T0 + c.RING_MS - 1), true);
});

test('ending a connected call from either side records how long it lasted', () => {
  const live = call({ status: 'accepted', answered_at: iso(T0 + 5000), last_ping_at: iso(T0 + 70000) });
  for (const who of ['alice', 'bob']) {
    const step = c.nextCallStep(live, 'end', who, T0 + 75000);
    assert.equal(step.to, 'ended');
    assert.equal(step.outcome, 'completed');
    assert.equal(step.durationMs, 70000);
  }
});

test('hangs up from the old ringing screen after the other side already answered: the call ends, not errors', () => {
  const live = call({ status: 'accepted', answered_at: iso(T0 + 2000), last_ping_at: iso(T0 + 2000) });
  assert.equal(c.nextCallStep(live, 'cancel', 'alice', T0 + 3000).to, 'ended');
  assert.equal(c.nextCallStep(live, 'decline', 'bob', T0 + 3000).to, 'ended');
});

test('heartbeats keep a call alive; silence for 45 seconds ends it', () => {
  const live = call({ status: 'accepted', answered_at: iso(T0), last_ping_at: iso(T0 + 60000) });
  eq(c.nextCallStep(live, 'ping', 'alice', T0 + 70000), { ok: true, to: null });
  const stale = c.nextCallStep(live, 'ping', 'alice', T0 + 60000 + c.STALE_MS + 1);
  assert.equal(stale.to, 'ended');
  assert.equal(stale.durationMs, 60000);
  assert.equal(c.isCallOpen(live, T0 + 60000 + c.STALE_MS + 1), false);
});

test('actions on a finished call change nothing (retries are safe)', () => {
  for (const status of ['declined', 'canceled', 'missed', 'ended']) {
    for (const action of ['accept', 'decline', 'cancel', 'end', 'ping']) {
      eq(c.nextCallStep(call({ status }), action, 'bob', T0 + 1000), { ok: true, to: null });
    }
  }
});

test('durations read naturally', () => {
  assert.equal(c.formatDuration(0), '0:00');
  assert.equal(c.formatDuration(272000), '4:32');
  assert.equal(c.formatDuration(3600000 + 61000), '1:01:01');
  assert.equal(c.formatDuration(null), '0:00');
});

test('a finished call reads differently for the caller and the callee', () => {
  assert.equal(c.callLabel('video', 'completed', 272000, true), 'Video call · 4:32');
  assert.equal(c.callLabel('audio', 'missed', null, true), 'No answer');
  assert.equal(c.callLabel('audio', 'missed', null, false), 'Missed voice call');
  assert.equal(c.callLabel('video', 'canceled', null, false), 'Missed video call');
  assert.equal(c.callLabel('video', 'canceled', null, true), 'Canceled video call');
  assert.equal(c.callLabel('audio', 'declined', null, true), 'Call declined');
  assert.equal(c.callLabel('audio', 'declined', null, false), 'Declined voice call');
});

test('conversation previews', () => {
  const base = { sender_id: 'a', body: '', call_kind: null, duration_ms: null };
  assert.equal(c.previewOf({ ...base, kind: 'text', body: '  hello\n  there  ' }, 'a'), 'hello there');
  assert.equal(c.previewOf({ ...base, kind: 'voice' }, 'a'), '🎤 Voice message');
  assert.equal(c.previewOf({ ...base, kind: 'call', body: 'completed', call_kind: 'video', duration_ms: 65000 }, 'a'), '🎥 Video call · 1:05');
  assert.equal(c.previewOf({ ...base, kind: 'call', body: 'missed', call_kind: 'audio' }, 'b'), '📞 Missed voice call');
  const long = c.previewOf({ ...base, kind: 'text', body: 'x'.repeat(200) }, 'a');
  assert.equal(long.length, 90);
  assert.ok(long.endsWith('…'));
});

test('unread counts ignore your own messages and anything you have already read', () => {
  const msgs = [
    { conversation_id: 'c1', sender_id: 'bob', created_at: '2026-11-04T10:00:00Z' },
    { conversation_id: 'c1', sender_id: 'bob', created_at: '2026-11-04T10:05:00Z' },
    { conversation_id: 'c1', sender_id: 'me', created_at: '2026-11-04T10:06:00Z' },
    { conversation_id: 'c2', sender_id: 'cy', created_at: '2026-11-04T09:00:00Z' },
  ];
  eq(c.countUnread(msgs, 'me', {}), { c1: 2, c2: 1 });
  eq(c.countUnread(msgs, 'me', { c1: '2026-11-04T10:02:00Z', c2: '2026-11-04T09:00:00Z' }), { c1: 1 });
  eq(c.countUnread([], 'me', {}), {});
});

test('text messages are trimmed and bounded', () => {
  eq(c.checkText('  hi  '), { ok: true, value: 'hi' });
  assert.equal(c.checkText('   ').ok, false);
  assert.equal(c.checkText(42).ok, false);
  assert.equal(c.checkText('x'.repeat(2001)).ok, false);
  assert.equal(c.checkText('x'.repeat(2000)).ok, true);
});

test('voice messages must be real audio of sensible size and length', () => {
  const payload = 'A'.repeat(200);
  const ok = c.checkVoice(`data:audio/webm;codecs=opus;base64,${payload}`, 4200);
  assert.equal(ok.ok, true);
  assert.equal(ok.value.mime, 'audio/webm;codecs=opus');
  assert.equal(ok.value.durationMs, 4200);
  assert.equal(c.checkVoice(`data:audio/mp4;codecs=mp4a.40.2;base64,${payload}`, 3000).ok, true);
  assert.equal(c.checkVoice(`data:image/png;base64,${payload}`, 3000).ok, false, 'images are not voice messages');
  assert.equal(c.checkVoice(`data:text/html;base64,${payload}`, 3000).ok, false);
  assert.equal(c.checkVoice('not a data url', 3000).ok, false);
  assert.equal(c.checkVoice(`data:audio/webm;base64,${payload}`, 100).ok, false, 'too short');
  assert.equal(c.checkVoice(`data:audio/webm;base64,${payload}`, 500000).ok, false, 'too long');
  assert.equal(c.checkVoice(`data:audio/webm;base64,${'A'.repeat(c.MAX_VOICE_CHARS)}`, 3000).ok, false, 'too large');
  assert.equal(c.checkVoice(`data:audio/webm;base64,<script>${payload}`, 3000).ok, false, 'not base64');
  assert.equal(c.checkVoice(`data:audio/webm;base64,${payload}`, 'abc').ok, false);
});
