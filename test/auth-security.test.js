const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');
const logController = require('../controllers/logController');
const { generateOtpCode, generateTempPassword, login, publicStudent } = require('../controllers/authController');

test('generateOtpCode returns a six-digit code', () => {
  const code = generateOtpCode();
  assert.match(code, /^\d{6}$/);
});

test('generateTempPassword returns a school-style temporary password', () => {
  const password = generateTempPassword();
  assert.ok(password.startsWith('Cres'));
  assert.ok(password.length >= 12);
});

test('public student profile formats date of birth for date inputs', () => {
  const student = publicStudent({
    id: 1,
    name: 'Student',
    role: 'student',
    active: 1,
    date_of_birth: new Date(2010, 8, 12)
  });

  assert.equal(student.dateOfBirth, '2010-09-12');
});

test('login rejects the hard-coded admin fallback credentials', async () => {
  const originalQuery = db.query;
  const originalLogActivity = logController.logActivity;
  const originalAdminUsername = process.env.ADMIN_USERNAME;
  const originalAdminPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_USERNAME = 'test-bootstrap-admin';
  process.env.ADMIN_PASSWORD = 'TestOnly-Admin-Pass-2026';
  db.query = async () => [];
  logController.logActivity = async () => {};

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
    logController.logActivity = originalLogActivity;
    if (originalAdminUsername === undefined) delete process.env.ADMIN_USERNAME;
    else process.env.ADMIN_USERNAME = originalAdminUsername;
    if (originalAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalAdminPassword;
  }
});

test('student login rejects environment-backed admin credentials and directs admins to their portal', async () => {
  const originalQuery = db.query;
  const originalLogActivity = logController.logActivity;
  const originalAdminUsername = process.env.ADMIN_USERNAME;
  const originalAdminPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_PASSWORD = 'Admin@2026';
  db.query = async () => {
    throw new Error('database unavailable');
  };
  logController.logActivity = async () => {};

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

    assert.equal(res.statusCode, 403);
    assert.equal(res.payload.success, false);
    assert.match(res.payload.message, /admin portal/i);
  } finally {
    db.query = originalQuery;
    logController.logActivity = originalLogActivity;
    if (originalAdminUsername === undefined) delete process.env.ADMIN_USERNAME;
    else process.env.ADMIN_USERNAME = originalAdminUsername;
    if (originalAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalAdminPassword;
  }
});
