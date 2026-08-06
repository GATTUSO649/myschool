const test = require('node:test');
const assert = require('node:assert/strict');
const { isStrongPassword, createLoginAttemptTracker } = require('../middleware/security');

test('accepts strong passwords', () => {
  assert.equal(isStrongPassword('StrongPassword1!'), true);
});

test('rejects weak passwords', () => {
  assert.equal(isStrongPassword('password1'), false);
  assert.equal(isStrongPassword('12345678'), false);
});

test('throttles repeated failed login attempts', () => {
  const tracker = createLoginAttemptTracker({ maxAttempts: 3, windowMs: 1000 });
  assert.equal(tracker('user:demo').blocked, false);
  assert.equal(tracker('user:demo').blocked, false);
  assert.equal(tracker('user:demo').blocked, false);
  assert.equal(tracker('user:demo').blocked, true);
  tracker.reset('user:demo');
  assert.equal(tracker('user:demo').blocked, false);
});
