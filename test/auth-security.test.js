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

test('login accepts the environment-backed admin credentials even when the database is unavailable', async () => {
  const originalQuery = db.query;
  const originalAdminUsername = process.env.ADMIN_USERNAME;
  const originalAdminPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_PASSWORD = 'Admin@2026';
  db.query = async () => {
    throw new Error('database unavailable');
  };

  try {
    const req = {
      body: { name: 'admin', password: 'Admin@2026' },
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

    assert.equal(res.statusCode, null);
    assert.equal(res.payload.success, true);
    assert.equal(res.payload.student.role, 'admin');
  } finally {
    db.query = originalQuery;
    if (originalAdminUsername === undefined) delete process.env.ADMIN_USERNAME;
    else process.env.ADMIN_USERNAME = originalAdminUsername;
    if (originalAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalAdminPassword;
  }
});
