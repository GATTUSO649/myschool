const test = require('node:test');
const assert = require('node:assert/strict');
const { generateOtpCode, generateTempPassword } = require('../controllers/authController');

test('generateOtpCode returns a six-digit code', () => {
  const code = generateOtpCode();
  assert.match(code, /^\d{6}$/);
});

test('generateTempPassword returns a school-style temporary password', () => {
  const password = generateTempPassword();
  assert.ok(password.startsWith('Cres'));
  assert.ok(password.length >= 12);
});
