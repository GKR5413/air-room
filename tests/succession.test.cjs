const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/succession.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exported });
const { decideSuccession, pickSuccessor } = exported;
const now = Date.parse('2026-11-03T12:00:00Z');
const speakers = [{ id: 'b', since: '2026-11-03T11:30:00Z' }, { id: 'a', since: '2026-11-03T11:00:00Z' }];
test('host disconnection immediately promotes the longest-serving connected speaker', () => {
  const decision = decideSuccession({ now, seenAt: new Date(now - 1).toISOString(), leaderOnline: false, speakers });
  assert.equal(decision.kind, 'promote');
  assert.equal(decision.id, 'a');
});
test('a room without a leadership timestamp also promotes immediately', () => {
  assert.equal(decideSuccession({ now, seenAt: null, leaderOnline: false, speakers }).id, 'a');
});
test('existing host or moderator prevents automatic promotion', () => {
  assert.equal(decideSuccession({ now, seenAt: new Date(now).toISOString(), leaderOnline: true, speakers }).kind, 'none');
});
test('no connected speakers means no promotion', () => {
  assert.equal(decideSuccession({ now, seenAt: null, leaderOnline: false, speakers: [] }).kind, 'none');
});
test('speaker order is stable at equal timestamps and does not mutate stage ordering', () => {
  const tied = [{ id: 'b', since: speakers[0].since }, { id: 'a', since: speakers[0].since }];
  assert.equal(pickSuccessor(tied), 'a');
  assert.equal(tied[0].id, 'b');
});
test('connected leaders refresh presence bookkeeping only when needed', () => {
  assert.equal(decideSuccession({ now, seenAt: new Date(now - 11000).toISOString(), leaderOnline: true, speakers }).kind, 'touch');
  assert.equal(decideSuccession({ now, seenAt: new Date(now - 1000).toISOString(), leaderOnline: true, speakers }).kind, 'none');
});
