const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');
const { generateOtpCode, generateTempPassword, login } = require('../controllers/authController');

test('generateOtpCode returns a six-digit code', () => {
  const code = generateOtpCode();
  assert.match(code, /^\d{6}$/);
});

test('generateTempPassword returns a school-style temporary password', () => {
  const password = generateTempPassword();
  assert.ok(password.startsWith('Cres'));
  assert.ok(password.length >= 12);
});

test('login rejects the hard-coded admin fallback credentials', async () => {
  const originalQuery = db.query;
  db.query = async () => [];

  try {
    const req = {
      body: { name: 'pickens', password: '4982' },
      ip: '127.0.0.1'
    };
    const res = {
      statusCode: null,
      payload: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.payload = payload;
        return this;
      },
      cookie() {
        return this;
      }
    };

    await login(req, res);

    assert.equal(res.statusCode, 401);
    assert.equal(res.payload.success, false);
  } finally {
    db.query = originalQuery;
  }
});
