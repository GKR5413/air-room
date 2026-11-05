const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// lib/recommend.ts is pure (no imports), so it loads directly.
const mod = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync('lib/recommend.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { exports: mod },
);
const { reasonFor, reasonLabel } = mod;
// Results are created inside the vm sandbox (different Array prototype); normalise for deepEqual.
const plain = x => JSON.parse(JSON.stringify(x));
const rankRecommendations = (...a) => plain(mod.rankRecommendations(...a));

const c = (id, o = {}) => ({ id, followsYou: false, mutuals: 0, sharedRooms: 0, followers: 0, createdAt: '2026-01-01T00:00:00Z', ...o });

test('someone who follows you outranks any single other signal', () => {
  const r = rankRecommendations([c('mutual', { mutuals: 5 }), c('fan', { followsYou: true }), c('room', { sharedRooms: 5 })]);
  assert.equal(r[0].id, 'fan');
  assert.equal(r[0].reason, 'follows_you');
});

test('more mutual connections rank higher, and the reason says how many', () => {
  const r = rankRecommendations([c('a', { mutuals: 1 }), c('b', { mutuals: 3 })]);
  assert.deepEqual(r.map(x => x.id), ['b', 'a']);
  assert.equal(reasonLabel(r[0].reason, r[0].mutuals), '3 mutual connections');
  assert.equal(reasonLabel('mutual', 1), '1 mutual connection');
});

test('mutuals and shared rooms are capped so one signal cannot drown the rest', () => {
  const r = rankRecommendations([c('huge', { mutuals: 500 }), c('fan', { followsYou: true, mutuals: 5 })]);
  assert.equal(r[0].id, 'fan');
});

test('shared room beats a plain popular profile; popular beats new', () => {
  const r = rankRecommendations([c('new'), c('pop', { followers: 40 }), c('room', { sharedRooms: 1 })]);
  assert.deepEqual(r.map(x => x.id), ['room', 'pop', 'new']);
  assert.deepEqual(r.map(x => x.reason), ['same_room', 'popular', 'new']);
});

test('with no signals at all, the newest members come first (fresh apps still get suggestions)', () => {
  const r = rankRecommendations([c('old', { createdAt: '2026-01-01T00:00:00Z' }), c('newer', { createdAt: '2026-10-01T00:00:00Z' })]);
  assert.deepEqual(r.map(x => x.id), ['newer', 'old']);
  assert.equal(r[0].reason, 'new');
});

test('respects the limit and is stable for exact ties', () => {
  const list = ['d', 'b', 'a', 'c'].map(id => c(id));
  assert.deepEqual(rankRecommendations(list, 2).map(x => x.id), ['a', 'b']);
  assert.deepEqual(rankRecommendations([...list].reverse(), 2).map(x => x.id), ['a', 'b']);
});

test('reason picks the strongest applicable signal; bad data does not throw', () => {
  assert.equal(reasonFor(c('x', { followsYou: true, mutuals: 2 })), 'follows_you');
  assert.equal(reasonFor(c('x', { mutuals: 2, sharedRooms: 2 })), 'mutual');
  assert.doesNotThrow(() => rankRecommendations([c('x', { createdAt: 'garbage', followers: -5 })]));
  assert.deepEqual(rankRecommendations([]), []);
});
