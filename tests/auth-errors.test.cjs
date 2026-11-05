const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/auth-errors.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exported });
const { authErrorMessage } = exported;
test('email quota errors explain confirmation failure without claiming an account was created', () => {
  const result = authErrorMessage({ code: 'over_email_send_rate_limit', status: 429, message: 'Email rate limit exceeded' });
  assert.equal(result.rateLimited, true);
  assert.match(result.message, /confirmation emails are temporarily unavailable/);
  assert.doesNotMatch(result.message, /account (was|has been) created|60 seconds/);
});
test('legacy email rate-limit messages are recognized', () => {
  assert.equal(authErrorMessage({ message: 'email rate limit exceeded' }).rateLimited, true);
});
test('request limits are distinguished from email delivery limits', () => {
  for (const error of [{ code: 'over_request_rate_limit' }, { status: 429 }]) {
    const result = authErrorMessage(error);
    assert.equal(result.rateLimited, true);
    assert.match(result.message, /Too many attempts/);
    assert.doesNotMatch(result.message, /confirmation emails/);
  }
});
test('ordinary login failures preserve their message without rate-limit cooldown', () => {
  const result = authErrorMessage({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' });
  assert.equal(result.rateLimited, false);
  assert.equal(result.message, 'Invalid login credentials');
});
test('missing messages use a readable fallback', () => {
  assert.equal(authErrorMessage({}).message, 'Something went wrong. Please try again.');
});
