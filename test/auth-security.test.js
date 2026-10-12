const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const logController = require('../controllers/logController');
const {
  confirmPasswordReset,
  generateOtpCode,
  generateTempPassword,
  login,
  publicStudent,
  requestPasswordReset
} = require('../controllers/authController');

function createResponse() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

test('generateOtpCode returns a six-digit code', () => {
  const code = generateOtpCode();
  assert.match(code, /^\d{6}$/);
});

test('generateTempPassword returns a school-style temporary password', () => {
  const password = generateTempPassword();
  assert.ok(password.startsWith('Cres'));
  assert.ok(password.length >= 12);
});

test('password reset request uses a generic response for unknown accounts', async () => {
  const originalQuery = db.query;
  db.query = async () => [];
  const res = createResponse();

  try {
    await requestPasswordReset({ body: { identifier: 'not-a-real-account' }, ip: '127.0.0.1' }, res);
    assert.equal(res.statusCode, null);
    assert.equal(res.payload.success, true);
    assert.match(res.payload.message, /if an active account matches/i);
    assert.doesNotMatch(res.payload.message, /not found|does not exist/i);
  } finally {
    db.query = originalQuery;
  }
});

test('password reset rejects a weak password before accessing the database', async () => {
  const originalQuery = db.query;
  db.query = async () => {
    throw new Error('Database should not be queried for a weak password');
  };
  const res = createResponse();

  try {
    await confirmPasswordReset({
      body: { identifier: 'student@example.com', otp: '123456', newPassword: 'weak' },
      ip: '127.0.0.1'
    }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.payload.message, /at least 12 characters/i);
  } finally {
    db.query = originalQuery;
  }
});

test('password reset consumes the code, updates the password, and revokes sessions atomically', async () => {
  const originalQuery = db.query;
  const originalGetPool = db.getPool;
  const originalLogActivity = logController.logActivity;
  const otp = '381604';
  const statements = [];
  let committed = false;
  let released = false;
  const connection = {
    async beginTransaction() {},
    async execute(sql, params) {
      statements.push({ sql, params });
      if (sql.includes('SELECT id, otp_hash, attempt_count')) {
        return [[{ id: 17, otp_hash: await bcrypt.hash(otp, 4), attempt_count: 0 }], []];
      }
      if (sql.startsWith('UPDATE students SET password_hash')) {
        return [{ affectedRows: 1 }, []];
      }
      return [{ affectedRows: 1 }, []];
    },
    async commit() { committed = true; },
    async rollback() {},
    release() { released = true; }
  };
  db.query = async () => [{ id: 17, username: 'student1', admission_number: 'ADM001' }];
  db.getPool = () => ({ getConnection: async () => connection });
  logController.logActivity = async () => {};
  const res = createResponse();

  try {
    await confirmPasswordReset({
      body: {
        identifier: 'ADM001',
        otp,
        newPassword: 'A-new-strong-password-91!'
      },
      ip: '127.0.0.1'
    }, res);
    assert.equal(res.statusCode, null);
    assert.equal(res.payload.success, true);
    assert.equal(committed, true);
    assert.equal(released, true);
    assert.ok(statements.some(({ sql }) => sql.includes('UPDATE password_reset_requests SET used_at')));
    assert.ok(statements.some(({ sql }) => sql.includes('UPDATE ict_sessions SET revoked_at')));
    const passwordUpdate = statements.find(({ sql }) => sql.startsWith('UPDATE students SET password_hash'));
    assert.ok(passwordUpdate);
    assert.notEqual(passwordUpdate.params[0], 'A-new-strong-password-91!');
  } finally {
    db.query = originalQuery;
    db.getPool = originalGetPool;
    logController.logActivity = originalLogActivity;
  }
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
