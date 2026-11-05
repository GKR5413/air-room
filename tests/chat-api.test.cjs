const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const ME = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const MALLORY = '33333333-3333-4333-8333-333333333333';
const CONV = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CALL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MSG = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/** Run a TypeScript file in a sandbox with fake imports. */
function loadTs(file, mocks) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText,
    { exports, Buffer, Uint8Array, process: { env: { NEXT_PUBLIC_LIVEKIT_URL: 'wss://example.livekit.test' } }, require: name => { if (!(name in mocks)) throw new Error(`unmocked import: ${name}`); return mocks[name]; } });
  return exports;
}

/** A tiny in-memory stand-in for the database: enough query syntax for the chat routes. */
function makeDb(seed) {
  const tables = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map(r => ({ ...r }));
  const log = [];
  let serial = 0;
  const matches = (row, f) => {
    const [op, col, val] = f;
    if (op === 'eq') return row[col] === val;
    if (op === 'neq') return row[col] !== val;
    if (op === 'in') return val.includes(row[col]);
    if (op === 'lt') return row[col] < val;
    if (op === 'notnull') return row[col] != null;
    if (op === 'or') return val.some(([c, v]) => row[c] === v);
    return true;
  };
  function run(q) {
    const rows = (tables[q.table] ??= []);
    const hit = rows.filter(r => q.filters.every(f => matches(r, f)));
    let out;
    if (q.op === 'insert') {
      const row = { id: `00000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`, created_at: new Date(Date.UTC(2026, 10, 4, 10, 0, serial)).toISOString(), ...q.payload };
      rows.push(row); log.push({ table: q.table, op: 'insert', payload: q.payload, row }); out = [row];
    } else if (q.op === 'update') {
      hit.forEach(r => Object.assign(r, q.payload)); log.push({ table: q.table, op: 'update', payload: q.payload, filters: q.filters, count: hit.length }); out = hit;
    } else if (q.op === 'upsert') {
      rows.push({ ...q.payload }); log.push({ table: q.table, op: 'upsert', payload: q.payload }); out = [q.payload];
    } else { out = hit; log.push({ table: q.table, op: 'select', cols: q.cols, filters: q.filters }); }
    if (q.single) return { data: out[0] ?? null, error: null };
    return { data: out, error: null, count: out.length };
  }
  const from = table => {
    const q = { table, op: 'select', filters: [], cols: '' };
    const chain = new Proxy({}, { get: (_, key) => {
      if (key === 'then') return (res, rej) => Promise.resolve(run(q)).then(res, rej);
      return (...a) => {
        if (key === 'select') { if (q.op === 'select') q.cols = a[0]; }
        else if (key === 'insert' || key === 'update' || key === 'upsert') { q.op = key; q.payload = a[0]; }
        else if (['eq', 'neq', 'in', 'lt'].includes(key)) q.filters.push([key, a[0], a[1]]);
        else if (key === 'not' && a[1] === 'is') q.filters.push(['notnull', a[0]]);
        else if (key === 'or') {
          // "user_a.eq.X,user_b.eq.X" style lists; and(...) groups (the follows pair lookup) are left to the seed data.
          if (!a[0].includes('and(')) q.filters.push(['or', null, a[0].split(',').map(p => { const [c, , v] = p.split('.'); return [c, v]; })]);
        }
        else if (key === 'maybeSingle' || key === 'single') { q.single = true; return Promise.resolve(run(q)); }
        return chain;
      };
    } });
    return chain;
  };
  return { admin: { from }, tables, log };
}

function setup(seed, { as = ME } = {}) {
  const db = makeDb(seed);
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  const core = loadTs('lib/chat-core.ts', {});
  const isUuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const closed = [];
  const base = {
    '@/lib/supabase-admin': { admin: db.admin }, './supabase-admin': { admin: db.admin },
    '@/lib/auth': { route: fn => fn, requireUser: async req => req.signedOut ? fail(401, 'Sign in required') : { id: as, name: 'Me' }, getUser: async req => req.signedOut ? null : { id: as, name: 'Me' }, fail },
    './auth': { fail },
    '@/lib/api': { body: async req => req.body ?? {}, isUuid }, './api': { isUuid },
    '@/lib/avatar': { avatarUrl: (id, s) => s ?? null }, './avatar': { avatarUrl: (id, s) => s ?? null },
    './livekit': { callRoomName: id => `call-${id}`, closeRoom: async name => { closed.push(name); } },
    '@/lib/livekit': { mintCallToken: async o => `token-for-${o.identity}` },
    '@/lib/chat-core': core, './chat-core': core,
    'next/server': { NextResponse: class { constructor(body, init) { this.body = body; this.init = init; this.status = init?.status ?? 200; } static json(b, init) { const r = new this(JSON.stringify(b), init); r.json = b; return r; } } },
  };
  const chat = loadTs('lib/chat.ts', base);
  base['@/lib/chat'] = chat;
  const route = file => loadTs(file, base);
  return { db, route, closed, chat };
}

const mutual = [{ follower_id: ME, followee_id: BOB }, { follower_id: BOB, followee_id: ME }];
const oneWay = [{ follower_id: ME, followee_id: BOB }];
const conv = { id: CONV, user_a: ME, user_b: BOB, last_message_id: null, last_message_at: '2026-11-04T09:00:00Z' };
const ctx = id => ({ params: Promise.resolve({ id }) });
const profiles = [{ id: ME, display_name: 'Me', username: 'me', avatar_url: null }, { id: BOB, display_name: 'Bob', username: 'bob', avatar_url: null }];

/* ── Starting a conversation ───────────────────────────── */
test('you cannot start a chat with yourself or with a bad id', async () => {
  const { route } = setup({ follows: mutual });
  const { POST } = route('app/api/chat/conversations/route.ts');
  await assert.rejects(POST({ body: { userId: ME } }), { status: 400 });
  await assert.rejects(POST({ body: { userId: 'nope' } }), { status: 400 });
  await assert.rejects(POST({ body: {}, signedOut: true }), { status: 401 });
});

test('you cannot start a chat with someone who does not follow you back', async () => {
  const { route, db } = setup({ follows: oneWay });
  const { POST } = route('app/api/chat/conversations/route.ts');
  await assert.rejects(POST({ body: { userId: BOB } }), { status: 403 });
  assert.equal(db.log.filter(l => l.op === 'insert').length, 0);
});

test('friends get one conversation, stored in a fixed order, and reuse it afterwards', async () => {
  const { route, db } = setup({ follows: mutual, conversations: [] });
  const { POST } = route('app/api/chat/conversations/route.ts');
  const first = await POST({ body: { userId: BOB } });
  const made = db.log.find(l => l.table === 'conversations' && l.op === 'insert');
  assert.ok(made.payload.user_a < made.payload.user_b, 'smaller id first');
  assert.deepEqual([made.payload.user_a, made.payload.user_b].sort(), [ME, BOB].sort());
  const second = await POST({ body: { userId: BOB } });
  assert.equal(second.json ? second.json.id : second.id, first.json ? first.json.id : first.id);
  assert.equal(db.log.filter(l => l.table === 'conversations' && l.op === 'insert').length, 1, 'no duplicate');
});

/* ── Sending messages ──────────────────────────────────── */
test('a stranger cannot read or write in someone else’s conversation (it looks like it does not exist)', async () => {
  const { route, db } = setup({ follows: mutual, conversations: [conv], messages: [], profiles }, { as: MALLORY });
  const { GET, POST } = route('app/api/chat/conversations/[id]/messages/route.ts');
  await assert.rejects(GET({ nextUrl: { searchParams: new URLSearchParams() } }, ctx(CONV)), { status: 404 });
  await assert.rejects(POST({ body: { kind: 'text', body: 'hi' } }, ctx(CONV)), { status: 404 });
  assert.equal(db.log.filter(l => l.op === 'insert').length, 0);
});

test('people who do not both follow each other cannot send messages, even in an old conversation', async () => {
  const { route, db } = setup({ follows: oneWay, conversations: [conv], messages: [], profiles });
  const { POST } = route('app/api/chat/conversations/[id]/messages/route.ts');
  await assert.rejects(POST({ body: { kind: 'text', body: 'hi' } }, ctx(CONV)), { status: 403 });
  assert.equal(db.log.filter(l => l.op === 'insert').length, 0);
});

test('a text message is trimmed, sent as you, and becomes the conversation’s latest', async () => {
  const { route, db } = setup({ follows: mutual, conversations: [conv], messages: [], profiles });
  const { POST } = route('app/api/chat/conversations/[id]/messages/route.ts');
  const res = await POST({ body: { kind: 'text', body: '  hello  ', sender_id: BOB, conversation_id: 'other' } }, ctx(CONV));
  const sent = db.log.find(l => l.table === 'messages' && l.op === 'insert').payload;
  assert.equal(sent.body, 'hello');
  assert.equal(sent.sender_id, ME, 'the sender comes from your sign-in, never from the request');
  assert.equal(sent.conversation_id, CONV, 'and the conversation from the address');
  assert.equal(sent.kind, 'text');
  const bump = db.log.find(l => l.table === 'conversations' && l.op === 'update');
  assert.equal(bump.payload.last_message_id, (res.message ?? res.json.message).id);
});

test('empty, oversized and malformed messages are rejected before anything is stored', async () => {
  const { route, db } = setup({ follows: mutual, conversations: [conv], messages: [], profiles });
  const { POST } = route('app/api/chat/conversations/[id]/messages/route.ts');
  await assert.rejects(POST({ body: { kind: 'text', body: '   ' } }, ctx(CONV)), { status: 400 });
  await assert.rejects(POST({ body: { kind: 'text', body: 'x'.repeat(2001) } }, ctx(CONV)), { status: 400 });
  await assert.rejects(POST({ body: { kind: 'voice', audio: 'data:image/png;base64,' + 'A'.repeat(200), duration_ms: 3000 } }, ctx(CONV)), { status: 400 });
  await assert.rejects(POST({ body: { kind: 'voice', audio: 'data:text/html;base64,' + 'A'.repeat(200), duration_ms: 3000 } }, ctx(CONV)), { status: 400 });
  await assert.rejects(POST({ body: { kind: 'voice', audio: 'data:audio/webm;base64,' + 'A'.repeat(200), duration_ms: 50 } }, ctx(CONV)), { status: 400 });
  assert.equal(db.log.filter(l => l.op === 'insert').length, 0);
});

test('a voice message is stored with its length, and the message list never carries the audio itself', async () => {
  const { route, db } = setup({ follows: mutual, conversations: [conv], messages: [], profiles, conversation_reads: [] });
  const { GET, POST } = route('app/api/chat/conversations/[id]/messages/route.ts');
  await POST({ body: { kind: 'voice', audio: 'data:audio/webm;codecs=opus;base64,' + 'A'.repeat(300), duration_ms: 4200 } }, ctx(CONV));
  const sent = db.log.find(l => l.table === 'messages' && l.op === 'insert').payload;
  assert.equal(sent.kind, 'voice');
  assert.equal(sent.duration_ms, 4200);
  assert.ok(sent.audio.startsWith('data:audio/webm'));
  await GET({ nextUrl: { searchParams: new URLSearchParams() } }, ctx(CONV));
  const read = db.log.find(l => l.table === 'messages' && l.op === 'select');
  assert.ok(read.cols && !/audio/.test(read.cols), `message list selects: ${read.cols}`);
});

/* ── Voice message audio ───────────────────────────────── */
test('voice audio is served only to the two people in the conversation', async () => {
  const seed = { conversations: [conv], messages: [
    { id: MSG, conversation_id: CONV, sender_id: BOB, kind: 'voice', audio: 'data:audio/webm;codecs=opus;base64,AAAA' },
    { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', conversation_id: CONV, sender_id: BOB, kind: 'text', audio: null },
  ] };
  const { route } = setup(seed);
  const { GET } = route('app/api/chat/media/[id]/route.ts');
  const ok = await GET({}, ctx(MSG));
  assert.equal(ok.status, 200);
  assert.equal(ok.init.headers['Content-Type'], 'audio/webm;codecs=opus');
  assert.match(ok.init.headers['Cache-Control'], /private/, 'never cached publicly');
  assert.equal((await GET({}, ctx('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'))).status, 404, 'a text message has no audio');
  assert.equal((await GET({ signedOut: true }, ctx(MSG))).status, 404, 'signed out');
  const stranger = setup(seed, { as: MALLORY });
  assert.equal((await stranger.route('app/api/chat/media/[id]/route.ts').GET({}, ctx(MSG))).status, 404, 'a stranger');
});

/* ── Calls ─────────────────────────────────────────────── */
const ringing = { id: CALL, conversation_id: CONV, caller_id: BOB, callee_id: ME, kind: 'video', status: 'ringing', created_at: new Date().toISOString(), answered_at: null, last_ping_at: new Date().toISOString() };

test('you can only call a friend', async () => {
  const { route, db } = setup({ follows: oneWay, conversations: [conv], calls: [], profiles });
  const { POST } = route('app/api/chat/calls/route.ts');
  await assert.rejects(POST({ body: { conversationId: CONV, kind: 'video' } }), { status: 403 });
  await assert.rejects(POST({ body: { conversationId: CONV, kind: 'hologram' } }), { status: 400 });
  assert.equal(db.log.filter(l => l.table === 'calls' && l.op === 'insert').length, 0);
});

test('starting a call records who is calling whom', async () => {
  const { route, db } = setup({ follows: mutual, conversations: [conv], calls: [], profiles });
  const { POST } = route('app/api/chat/calls/route.ts');
  await POST({ body: { conversationId: CONV, kind: 'audio', caller_id: BOB } });
  const made = db.log.find(l => l.table === 'calls' && l.op === 'insert').payload;
  assert.equal(made.caller_id, ME, 'the caller is you, whatever the request says');
  assert.equal(made.callee_id, BOB);
  assert.equal(made.kind, 'audio');
});

test('a second call is refused while either of you is already on one', async () => {
  const mine = { ...ringing, id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', caller_id: ME, callee_id: BOB };
  const a = setup({ follows: mutual, conversations: [conv], calls: [mine], profiles });
  await assert.rejects(a.route('app/api/chat/calls/route.ts').POST({ body: { conversationId: CONV, kind: 'audio' } }), { status: 409 });
  const theirs = { ...mine, caller_id: BOB, callee_id: MALLORY, id: 'ffffffff-ffff-4fff-8fff-fffffffffff0' };
  const b = setup({ follows: mutual, conversations: [conv], calls: [theirs], profiles });
  await assert.rejects(b.route('app/api/chat/calls/route.ts').POST({ body: { conversationId: CONV, kind: 'audio' } }), { status: 409 });
});

test('a call that rang out unanswered no longer blocks new calls and is logged as missed', async () => {
  const old = { ...ringing, caller_id: ME, callee_id: BOB, created_at: new Date(Date.now() - 120000).toISOString(), last_ping_at: new Date(Date.now() - 120000).toISOString() };
  const { route, db } = setup({ follows: mutual, conversations: [conv], calls: [old], messages: [], profiles });
  await route('app/api/chat/calls/route.ts').POST({ body: { conversationId: CONV, kind: 'audio' } });
  assert.equal(db.tables.calls.find(c => c.id === CALL).status, 'missed');
  const note = db.log.find(l => l.table === 'messages' && l.op === 'insert').payload;
  assert.equal(note.kind, 'call');
  assert.equal(note.body, 'missed');
});

test('only the person being called can answer; answering is a guarded status change', async () => {
  const callee = setup({ conversations: [conv], calls: [ringing], messages: [], profiles });
  await callee.route('app/api/chat/calls/[id]/route.ts').POST({ body: { action: 'accept' } }, ctx(CALL));
  const upd = callee.db.log.find(l => l.table === 'calls' && l.op === 'update');
  assert.equal(upd.payload.status, 'accepted');
  assert.ok(upd.filters.some(f => f[0] === 'eq' && f[1] === 'status' && f[2] === 'ringing'), 'only succeeds if it was still ringing');
  const caller = setup({ conversations: [conv], calls: [{ ...ringing, caller_id: ME, callee_id: BOB }], messages: [], profiles });
  await assert.rejects(caller.route('app/api/chat/calls/[id]/route.ts').POST({ body: { action: 'accept' } }, ctx(CALL)), { status: 403 });
  const stranger = setup({ conversations: [conv], calls: [ringing], messages: [], profiles }, { as: MALLORY });
  await assert.rejects(stranger.route('app/api/chat/calls/[id]/route.ts').POST({ body: { action: 'accept' } }, ctx(CALL)), { status: 404 });
  await assert.rejects(callee.route('app/api/chat/calls/[id]/route.ts').POST({ body: { action: 'explode' } }, ctx(CALL)), { status: 400 });
});

test('declining or ending a call is written into the chat and frees the audio room', async () => {
  const d = setup({ conversations: [conv], calls: [ringing], messages: [], profiles });
  await d.route('app/api/chat/calls/[id]/route.ts').POST({ body: { action: 'decline' } }, ctx(CALL));
  const note = d.db.log.find(l => l.table === 'messages' && l.op === 'insert').payload;
  assert.equal(note.kind, 'call');
  assert.equal(note.body, 'declined');
  assert.equal(note.sender_id, BOB, 'call notes are from the caller');
  assert.deepEqual(d.closed, [`call-${CALL}`]);

  const live = { ...ringing, status: 'accepted', answered_at: new Date(Date.now() - 65000).toISOString(), last_ping_at: new Date().toISOString() };
  const e = setup({ conversations: [conv], calls: [live], messages: [], profiles });
  await e.route('app/api/chat/calls/[id]/route.ts').POST({ body: { action: 'end' } }, ctx(CALL));
  const done = e.db.log.find(l => l.table === 'messages' && l.op === 'insert').payload;
  assert.equal(done.body, 'completed');
  assert.ok(done.duration_ms >= 64000 && done.duration_ms <= 70000, `duration ${done.duration_ms}`);
  // ending again changes nothing and logs nothing new
  await e.route('app/api/chat/calls/[id]/route.ts').POST({ body: { action: 'end' } }, ctx(CALL));
  assert.equal(e.db.log.filter(l => l.table === 'messages' && l.op === 'insert').length, 1);
});

test('call tokens: the caller may join while it rings, the callee only after answering, strangers never', async () => {
  const tokenRoute = (seed, as) => setup(seed, { as }).route('app/api/chat/calls/[id]/token/route.ts').POST;
  const seed = c => ({ conversations: [conv], calls: [c], messages: [], profiles });
  const caller = { ...ringing, caller_id: ME, callee_id: BOB };
  assert.ok((await tokenRoute(seed(caller), ME)({}, ctx(CALL))).token, 'caller while ringing');
  await assert.rejects(tokenRoute(seed(ringing), ME)({}, ctx(CALL)), { status: 410 });
  const answered = { ...ringing, status: 'accepted', answered_at: new Date().toISOString() };
  assert.ok((await tokenRoute(seed(answered), ME)({}, ctx(CALL))).token, 'callee after answering');
  await assert.rejects(tokenRoute(seed(answered), MALLORY)({}, ctx(CALL)), { status: 404 });
  await assert.rejects(tokenRoute(seed({ ...answered, status: 'ended' }), ME)({}, ctx(CALL)), { status: 410 });
});

/* ── Unread ────────────────────────────────────────────── */
test('the unread badge counts only other people’s messages you have not read', async () => {
  const msgs = [
    { conversation_id: CONV, sender_id: BOB, created_at: '2026-11-04T10:00:00Z' },
    { conversation_id: CONV, sender_id: BOB, created_at: '2026-11-04T10:05:00Z' },
    { conversation_id: CONV, sender_id: ME, created_at: '2026-11-04T10:06:00Z' },
  ];
  const fresh = setup({ conversations: [{ ...conv, last_message_id: 'x' }], conversation_reads: [], messages: msgs });
  assert.equal((await fresh.route('app/api/chat/unread/route.ts').GET({})).count ?? (await fresh.route('app/api/chat/unread/route.ts').GET({})).json.count, 2);
  const partly = setup({ conversations: [{ ...conv, last_message_id: 'x' }], conversation_reads: [{ conversation_id: CONV, user_id: ME, last_read_at: '2026-11-04T10:02:00Z' }], messages: msgs });
  const res = await partly.route('app/api/chat/unread/route.ts').GET({});
  assert.equal(res.count ?? res.json.count, 1);
});
