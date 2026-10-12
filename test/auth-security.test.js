const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const logController = require('../controllers/logController');
const {
  confirmPasswordReset,
  completeStudentPasswordReset,
  generateOtpCode,
  generateTempPassword,
  login,
  publicStudent,
  requestPasswordReset,
  requestStudentPasswordReset,
  resendStudentPasswordResetOtp,
  verifyStudentPasswordResetOtp
} = require('../controllers/authController');
const emailUtils = require('../controllers/emailUtils');

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

test('legacy recovery cannot bypass parent verification for student accounts', async () => {
  const originalQuery = db.query;
  const originalSendResetEmail = emailUtils.sendPasswordResetEmail;
  let emailSent = false;
  db.query = async () => [{ id: 7, email: 'student@example.org', role: 'student' }];
  emailUtils.sendPasswordResetEmail = async () => {
    emailSent = true;
    return { delivered: true };
  };
  const res = createResponse();

  try {
    await requestPasswordReset({ body: { identifier: 'CRES/001/2026' }, ip: '127.0.0.1' }, res);
    assert.equal(res.payload.success, true);
    assert.equal(emailSent, false);
  } finally {
    db.query = originalQuery;
    emailUtils.sendPasswordResetEmail = originalSendResetEmail;
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

test('student recovery sends OTP only to the approved application parent email', async () => {
  const originalGetPool = db.getPool;
  const originalSendOtp = emailUtils.sendStudentParentPasswordResetOtp;
  const executed = [];
  let delivered;
  const connection = {
    async beginTransaction() {},
    async execute(sql, params) {
      executed.push({ sql, params });
      if (sql.includes('FROM students s')) {
        return [[{
          student_id: 7,
          admission_number: 'CRES/001/2026',
          application_id: 19,
          parent_email: 'Parent+Family@Example.org'
        }], []];
      }
      if (sql.includes('SELECT id FROM student_password_resets')) return [[], []];
      if (sql.includes('INSERT INTO student_password_resets')) return [{ insertId: 35 }, []];
      return [{ affectedRows: 1 }, []];
    },
    async commit() {},
    async rollback() {},
    release() {}
  };
  db.getPool = () => ({ getConnection: async () => connection });
  emailUtils.sendStudentParentPasswordResetOtp = async (message) => {
    delivered = message;
    return { delivered: true };
  };
  const res = createResponse();

  try {
    await requestStudentPasswordReset({
      body: { admissionNumber: 'CRES/001/2026', parentEmail: 'attacker@example.net' },
      ip: '127.0.0.1'
    }, res);
    assert.equal(res.payload.success, true);
    assert.equal(delivered.to, 'Parent+Family@Example.org');
    assert.equal(res.payload.emailSent, true);
    assert.equal(res.payload.message, 'Email sent to Parent+Family@Example.org.');
    assert.match(delivered.otp, /^\d{6}$/);
    assert.equal(delivered.applicationId, 19);
    assert.equal(Object.hasOwn(res.payload, 'email'), false);
    assert.equal(Object.hasOwn(res.payload, 'otp'), false);
    const insert = executed.find(({ sql }) => sql.includes('INSERT INTO student_password_resets'));
    assert.notEqual(insert.params[3], delivered.otp);
    assert.match(insert.params[3], /^\$2[aby]\$10\$/);
    assert.match(insert.sql, /INTERVAL 5 MINUTE/);
  } finally {
    db.getPool = originalGetPool;
    emailUtils.sendStudentParentPasswordResetOtp = originalSendOtp;
  }
});

test('student without a registered parent email receives generic recovery guidance', async () => {
  const originalGetPool = db.getPool;
  const originalSendOtp = emailUtils.sendStudentParentPasswordResetOtp;
  let delivered = false;
  const connection = {
    async beginTransaction() {},
    async execute(sql) {
      if (sql.includes('FROM students s')) {
        return [[{
          student_id: 7,
          admission_number: 'CRES/001/2026',
          application_id: 19,
          parent_email: null
        }], []];
      }
      throw new Error('A missing parent email must not create a reset transaction');
    },
    async commit() {},
    async rollback() {},
    release() {}
  };
  db.getPool = () => ({ getConnection: async () => connection });
  emailUtils.sendStudentParentPasswordResetOtp = async () => {
    delivered = true;
    return { delivered: true };
  };
  const res = createResponse();

  try {
    await requestStudentPasswordReset({ body: { admissionNumber: 'CRES/001/2026' }, ip: '127.0.0.1' }, res);
    assert.equal(res.payload.success, true);
    assert.match(res.payload.message, /contact school administration/i);
    assert.equal(res.payload.emailSent, undefined);
    assert.equal(res.payload.message.includes('guardian@example.org'), false);
    assert.equal(delivered, false);
  } finally {
    db.getPool = originalGetPool;
    emailUtils.sendStudentParentPasswordResetOtp = originalSendOtp;
  }
});

test('unknown admission numbers get the generic student recovery response', async () => {
  const originalGetPool = db.getPool;
  const originalSendOtp = emailUtils.sendStudentParentPasswordResetOtp;
  let delivered = false;
  const connection = {
    async beginTransaction() {},
    async execute(sql) {
      if (sql.includes('FROM students s')) return [[], []];
      throw new Error('An unknown admission must not create a recovery transaction');
    },
    async commit() {},
    async rollback() {},
    release() {}
  };
  db.getPool = () => ({ getConnection: async () => connection });
  emailUtils.sendStudentParentPasswordResetOtp = async () => {
    delivered = true;
    return { delivered: true };
  };
  const res = createResponse();

  try {
    await requestStudentPasswordReset({ body: { admissionNumber: 'CRES/999/2026' }, ip: '127.0.0.1' }, res);
    assert.equal(res.payload.success, true);
    assert.match(res.payload.message, /if the active student account is eligible/i);
    assert.equal(res.payload.emailSent, undefined);
    assert.equal(res.payload.message.includes('@'), false);
    assert.equal(delivered, false);
  } finally {
    db.getPool = originalGetPool;
    emailUtils.sendStudentParentPasswordResetOtp = originalSendOtp;
  }
});

test('student recovery resend confirms the exact application parent email', async () => {
  const originalGetPool = db.getPool;
  const originalSendOtp = emailUtils.sendStudentParentPasswordResetOtp;
  let delivered;
  const recipient = 'Parent+Family@Example.org';
  const connection = {
    async beginTransaction() {},
    async execute(sql) {
      if (sql.includes('SELECT r.*')) {
        return [[{
          id: 35,
          student_active: 1,
          student_role: 'student',
          application_status: 'approved',
          parent_email: recipient,
          seconds_since_sent: 90,
          resend_count: 0,
          verified_at: null,
          consumed_at: null,
          revoked_at: null,
          application_id: 19
        }], []];
      }
      return [{ affectedRows: 1 }, []];
    },
    async commit() {},
    async rollback() {},
    release() {}
  };
  db.getPool = () => ({ getConnection: async () => connection });
  emailUtils.sendStudentParentPasswordResetOtp = async (message) => {
    delivered = message;
    return { delivered: true };
  };
  const res = createResponse();

  try {
    await resendStudentPasswordResetOtp({
      body: { transactionToken: 'd'.repeat(64) },
      ip: '127.0.0.1'
    }, res);
    assert.equal(delivered.to, recipient);
    assert.equal(res.payload.emailSent, true);
    assert.equal(res.payload.message, `Email sent to ${recipient}.`);
  } finally {
    db.getPool = originalGetPool;
    emailUtils.sendStudentParentPasswordResetOtp = originalSendOtp;
  }
});

test('student recovery issues a short-lived authorization only after a correct OTP', async () => {
  const originalGetPool = db.getPool;
  const otp = '601328';
  const statements = [];
  const connection = {
    async beginTransaction() {},
    async execute(sql, params) {
      statements.push({ sql, params });
      if (sql.includes('SELECT r.*')) {
        return [[{
          id: 35,
          otp_hash: await bcrypt.hash(otp, 4),
          attempts: 0,
          revoked_at: null,
          consumed_at: null,
          verified_at: null,
          otp_not_expired: 1,
          student_active: 1,
          student_role: 'student',
          application_status: 'approved',
          parent_email: 'guardian@example.org'
        }], []];
      }
      return [{ affectedRows: 1 }, []];
    },
    async commit() {},
    async rollback() {},
    release() {}
  };
  db.getPool = () => ({ getConnection: async () => connection });
  const res = createResponse();

  try {
    await verifyStudentPasswordResetOtp({
      body: { transactionToken: 'a'.repeat(64), otp },
      ip: '127.0.0.1'
    }, res);
    assert.equal(res.payload.success, true);
    assert.match(res.payload.authorization, /^[a-f0-9]{64}$/);
    assert.equal(res.payload.authorizationExpiresInSeconds, 600);
    const authorizationUpdate = statements.find(({ sql }) => sql.includes('SET verified_at = NOW()'));
    assert.ok(authorizationUpdate);
    assert.notEqual(authorizationUpdate.params[0], res.payload.authorization);
  } finally {
    db.getPool = originalGetPool;
  }
});

test('student recovery enforces resend cooldown for an existing transaction', async () => {
  const originalGetPool = db.getPool;
  const originalSendOtp = emailUtils.sendStudentParentPasswordResetOtp;
  let delivered = false;
  const connection = {
    async beginTransaction() {},
    async execute(sql) {
      if (sql.includes('SELECT r.*')) {
        return [[{
          id: 35,
          student_active: 1,
          student_role: 'student',
          application_status: 'approved',
          parent_email: 'guardian@example.org',
          seconds_since_sent: 10,
          resend_count: 0,
          verified_at: null,
          consumed_at: null,
          revoked_at: null
        }], []];
      }
      throw new Error('A cooldown rejection must not issue another OTP');
    },
    async commit() {},
    async rollback() {},
    release() {}
  };
  db.getPool = () => ({ getConnection: async () => connection });
  emailUtils.sendStudentParentPasswordResetOtp = async () => {
    delivered = true;
    return { delivered: true };
  };
  const res = createResponse();

  try {
    await resendStudentPasswordResetOtp({
      body: { transactionToken: 'c'.repeat(64) },
      ip: '127.0.0.1'
    }, res);
    assert.equal(res.statusCode, 429);
    assert.match(res.payload.message, /wait 60 seconds/i);
    assert.equal(delivered, false);
  } finally {
    db.getPool = originalGetPool;
    emailUtils.sendStudentParentPasswordResetOtp = originalSendOtp;
  }
});

test('student recovery rejects an incorrect OTP and increments attempts', async () => {
  const originalGetPool = db.getPool;
  let attemptsUpdated = false;
  const connection = {
    async beginTransaction() {},
    async execute(sql) {
      if (sql.includes('SELECT r.*')) {
        return [[{
          id: 35,
          otp_hash: await bcrypt.hash('111111', 4),
          attempts: 0,
          revoked_at: null,
          consumed_at: null,
          verified_at: null,
          otp_not_expired: 1,
          student_active: 1,
          student_role: 'student',
          application_status: 'approved',
          parent_email: 'guardian@example.org'
        }], []];
      }
      if (sql.includes('SET revoked_at = IF(attempts >= 4')) attemptsUpdated = true;
      return [{ affectedRows: 1 }, []];
    },
    async commit() {},
    async rollback() {},
    release() {}
  };
  db.getPool = () => ({ getConnection: async () => connection });
  const res = createResponse();

  try {
    await verifyStudentPasswordResetOtp({
      body: { transactionToken: 'd'.repeat(64), otp: '222222' },
      ip: '127.0.0.1'
    }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.payload.message, /code is incorrect/i);
    assert.equal(attemptsUpdated, true);
  } finally {
    db.getPool = originalGetPool;
  }
});

test('student recovery rejects an expired OTP without issuing reset authorization', async () => {
  const originalGetPool = db.getPool;
  const connection = {
    async beginTransaction() {},
    async execute(sql) {
      if (sql.includes('SELECT r.*')) {
        return [[{
          id: 35,
          attempts: 0,
          revoked_at: null,
          consumed_at: null,
          verified_at: null,
          otp_not_expired: 0,
          student_active: 1,
          student_role: 'student',
          application_status: 'approved',
          parent_email: 'guardian@example.org'
        }], []];
      }
      throw new Error('Expired code must not generate authorization');
    },
    async commit() {},
    async rollback() {},
    release() {}
  };
  db.getPool = () => ({ getConnection: async () => connection });
  const res = createResponse();

  try {
    await verifyStudentPasswordResetOtp({
      body: { transactionToken: 'e'.repeat(64), otp: '123456' },
      ip: '127.0.0.1'
    }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.payload.message, /expired/i);
    assert.equal(res.payload.authorization, undefined);
  } finally {
    db.getPool = originalGetPool;
  }
});

test('student recovery locks a transaction after the fifth incorrect code', async () => {
  const originalGetPool = db.getPool;
  let transactionRevoked = false;
  const connection = {
    async beginTransaction() {},
    async execute(sql) {
      if (sql.includes('SELECT r.*')) {
        return [[{
          id: 35,
          otp_hash: await bcrypt.hash('111111', 4),
          attempts: 4,
          revoked_at: null,
          consumed_at: null,
          verified_at: null,
          otp_not_expired: 1,
          student_active: 1,
          student_role: 'student',
          application_status: 'approved',
          parent_email: 'guardian@example.org'
        }], []];
      }
      if (sql.includes('SET revoked_at = IF(attempts >= 4')) transactionRevoked = true;
      return [{ affectedRows: 1 }, []];
    },
    async commit() {},
    async rollback() {},
    release() {}
  };
  db.getPool = () => ({ getConnection: async () => connection });
  const res = createResponse();

  try {
    await verifyStudentPasswordResetOtp({
      body: { transactionToken: 'f'.repeat(64), otp: '222222' },
      ip: '127.0.0.1'
    }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.payload.message, /too many incorrect codes/i);
    assert.equal(transactionRevoked, true);
  } finally {
    db.getPool = originalGetPool;
  }
});

test('already-verified student recovery transactions cannot reuse the OTP', async () => {
  const originalGetPool = db.getPool;
  const connection = {
    async beginTransaction() {},
    async execute(sql) {
      if (sql.includes('SELECT r.*')) {
        return [[{
          id: 35,
          attempts: 0,
          revoked_at: null,
          consumed_at: null,
          verified_at: new Date(),
          otp_not_expired: 1,
          student_active: 1,
          student_role: 'student',
          application_status: 'approved',
          parent_email: 'guardian@example.org'
        }], []];
      }
      throw new Error('A reused code must not issue another authorization');
    },
    async commit() {},
    async rollback() {},
    release() {}
  };
  db.getPool = () => ({ getConnection: async () => connection });
  const res = createResponse();

  try {
    await verifyStudentPasswordResetOtp({
      body: { transactionToken: '9'.repeat(64), otp: '123456' },
      ip: '127.0.0.1'
    }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.payload.message, /already been used/i);
    assert.equal(res.payload.authorization, undefined);
  } finally {
    db.getPool = originalGetPool;
  }
});

test('student recovery completion updates only its authorized account and consumes authorization', async () => {
  const originalGetPool = db.getPool;
  const originalNotice = emailUtils.sendStudentPasswordChangedNotice;
  const originalLogActivity = logController.logActivity;
  const authorization = 'b'.repeat(64);
  const statements = [];
  let passwordHash;
  const connection = {
    async beginTransaction() {},
    async execute(sql, params) {
      statements.push({ sql, params });
      if (sql.includes('SELECT r.*')) {
        return [[{
          id: 35,
          student_id: 7,
          application_id: 19,
          authorization_hash: require('crypto').createHash('sha256').update(authorization).digest('hex'),
          verified_at: new Date(),
          authorization_not_expired: 1,
          consumed_at: null,
          revoked_at: null,
          student_active: 1,
          student_role: 'student',
          application_status: 'approved',
          parent_email: 'guardian@example.org',
          username: 'student-one',
          admission_number: 'CRES/001/2026'
        }], []];
      }
      if (sql.includes('SET password_hash = ?')) {
        passwordHash = params[0];
        return [{ affectedRows: 1 }, []];
      }
      return [{ affectedRows: 1 }, []];
    },
    async commit() {},
    async rollback() {},
    release() {}
  };
  db.getPool = () => ({ getConnection: async () => connection });
  emailUtils.sendStudentPasswordChangedNotice = async ({ to, applicationId }) => {
    assert.equal(to, 'guardian@example.org');
    assert.equal(applicationId, 19);
    return { delivered: true };
  };
  logController.logActivity = async () => {};
  const res = createResponse();
  const newPassword = 'Strong-Student-Password-72!';

  try {
    await completeStudentPasswordReset({
      body: { authorization, newPassword, studentId: 999 },
      ip: '127.0.0.1'
    }, res);
    assert.equal(res.payload.success, true);
    assert.equal(await bcrypt.compare(newPassword, passwordHash), true);
    assert.ok(statements.some(({ sql }) => sql.includes('SET consumed_at = NOW()')));
    assert.ok(statements.some(({ sql }) => sql.includes('UPDATE ict_sessions SET revoked_at')));
    const studentUpdate = statements.find(({ sql }) => sql.includes('SET password_hash = ?'));
    assert.deepEqual(studentUpdate.params.slice(1), [7]);
    assert.match(studentUpdate.sql, /role = 'student' AND active = 1/);
  } finally {
    db.getPool = originalGetPool;
    emailUtils.sendStudentPasswordChangedNotice = originalNotice;
    logController.logActivity = originalLogActivity;
  }
});

test('student recovery rejects invalid admission number before database access', async () => {
  const originalGetPool = db.getPool;
  db.getPool = () => {
    throw new Error('Invalid admission numbers must not query the database');
  };
  const res = createResponse();

  try {
    await requestStudentPasswordReset({ body: { admissionNumber: 'not a valid number' }, ip: '127.0.0.1' }, res);
    assert.equal(res.payload.success, true);
    assert.match(res.payload.message, /if the active student account is eligible/i);
  } finally {
    db.getPool = originalGetPool;
  }
});

test('student recovery rejects edge whitespace passwords to preserve student login compatibility', async () => {
  const originalGetPool = db.getPool;
  db.getPool = () => {
    throw new Error('Whitespace password validation must happen before database access');
  };
  const res = createResponse();

  try {
    await completeStudentPasswordReset({
      body: {
        authorization: 'a'.repeat(64),
        newPassword: ' Strong-Student-Password-72!'
      },
      ip: '127.0.0.1'
    }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.payload.message, /cannot begin or end with whitespace/i);
  } finally {
    db.getPool = originalGetPool;
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
