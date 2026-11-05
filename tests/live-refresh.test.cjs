const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function harness() {
  const effects = [], channels = [], timers = new Map(), removed = [];
  let next = 0;
  const user = '11111111-1111-1111-1111-111111111111';
  const exported = {};
  const supabase = {
    channel(topic, options) {
      const channel = { topic, options, on(_type, _filter, fn) { this.broadcast = fn; return this; }, subscribe(fn) { this.status = fn; return this; } };
      channels.push(channel); return channel;
    },
    removeChannel: channel => { removed.push(channel.topic); return Promise.resolve(); },
    auth: { getSession: async () => ({ data: { session: { user: { id: user } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  };
  const context = { exports: exported, require: name => name === 'react' ? { useRef: value => ({ current: value }), useEffect: fn => effects.push(fn) } : { supabase },
    setTimeout: fn => { const id = ++next; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    setInterval: () => ++next, clearInterval() {},
    window: { addEventListener() {}, removeEventListener() {} }, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/use-live-refresh.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return { hook: exported.useLiveRefresh, effects, channels, removed, user, flush() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); } };
}
test('bursts of room broadcasts cause one authorized API refresh; subscription is private', () => {
  const h = harness(); let count = 0;
  h.hook(['room:abcd1234'], () => count++);
  const cleanup = h.effects[0]();
  assert.equal(h.channels[0].options.config.private, true);
  h.channels[0].broadcast(); h.channels[0].broadcast(); h.channels[0].broadcast();
  h.flush(); assert.equal(count, 1);
  cleanup();
});
test('components share a channel, and one unmount does not disconnect other consumers', () => {
  const h = harness(); let first = 0, second = 0;
  h.hook(['profiles'], () => first++); h.hook(['profiles'], () => second++);
  const stopFirst = h.effects[0](), stopSecond = h.effects[1]();
  assert.equal(h.channels.length, 1);
  stopFirst(); assert.equal(h.removed.length, 0);
  h.channels[0].broadcast(); h.flush();
  assert.equal(first, 0); assert.equal(second, 1);
  stopSecond(); assert.equal(h.removed.length, 1);
});
test('reconnection reconciles missed updates and cleanup cancels queued refreshes', () => {
  const h = harness(); let count = 0;
  h.hook(['hallway'], () => count++);
  const cleanup = h.effects[0]();
  h.channels[0].status('SUBSCRIBED'); h.flush(); assert.equal(count, 1);
  h.channels[0].broadcast(); cleanup(); h.flush(); assert.equal(count, 1);
});
test('personal changes subscribe only to the current authenticated user', async () => {
  const h = harness();
  h.hook(['me'], () => {});
  const cleanup = h.effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.channels[0].topic, `airroom:user:${h.user}`);
  assert.equal(h.channels[0].options.config.private, true);
  cleanup();
});
test('slow refreshes serialize subsequent updates so older responses cannot finish last', async () => {
  const h = harness(); let calls = 0, complete;
  h.hook(['hallway'], () => { calls++; return calls === 1 ? new Promise(resolve => { complete = resolve; }) : undefined; });
  const cleanup = h.effects[0]();
  h.channels[0].broadcast(); h.flush();
  h.channels[0].broadcast(); h.flush();
  h.channels[0].broadcast(); h.flush();
  assert.equal(calls, 1);
  complete(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  cleanup();
});
