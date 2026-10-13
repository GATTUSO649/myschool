const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const logController = require('./logController');
const { isStrongPassword, createLoginAttemptTracker } = require('../middleware/security');
const { normalizeRole } = require('../middleware/authMiddleware');
const emailUtils = require('./emailUtils');

const query = (...args) => db.query(...args);
const logActivity = (...args) => logController.logActivity(...args);
const loginTracker = createLoginAttemptTracker({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });

function cleanLoginValue(value) {
  return String(value || '').trim();
}

function formatDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function publicStudent(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    admissionNumber: row.admission_number,
    staffNumber: row.staff_number || null,
    role: normalizeRole(row.role),
    rawRole: String(row.role || '').toLowerCase(),
    className: row.class_name,
    curriculumType: row.curriculum_type || null,
    stream: row.stream,
    workingArea: row.finance_working_area || null,
    ictWorkingArea: row.ict_working_area || null,
    subject: row.subject || null,
    avatar: row.avatar,
    phone: row.phone || null,
    dateOfBirth: formatDateOnly(row.date_of_birth),
    active: Boolean(row.active),
    mustChangePassword: Boolean(row.must_change_password),
    last_login: row.last_login
  };
}

function signToken(student) {
  const jti = crypto.randomUUID();
  const payload = {
    id: student.id,
    role: student.role,
    username: student.username,
    jti,
    bootstrapAdmin: Boolean(student.bootstrapAdmin)
  };
  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'change-this-development-secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '10m' }
  );
}

async function recordSession(token, user, req) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded?.jti) {
      const error = new Error('Session token is missing its identifier');
      error.code = 'SESSION_REGISTRY_UNAVAILABLE';
      throw error;
    }
    await query('INSERT INTO ict_sessions (jti, user_id, role, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)', [decoded.jti, user.id || null, normalizeRole(user.role), req.ip, String(req.headers['user-agent'] || '').slice(0, 255)]);
  } catch (error) {
    console.error('Session registry update failed:', error.code || error.name || 'DATABASE_ERROR');
    if (error.code === 'SESSION_REGISTRY_UNAVAILABLE') throw error;
    const sessionError = new Error('Authentication session could not be registered');
    sessionError.code = 'SESSION_REGISTRY_UNAVAILABLE';
    throw sessionError;
  }
}

function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function generateTempPassword() {
  return `Cres${Math.random().toString(36).slice(-8)}!`;
}

function hashRecoverySecret(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isAdmissionNumber(value) {
  return /^[A-Z0-9]+(?:[/-][A-Z0-9]+)*$/.test(value) && value.length <= 50;
}

function genericStudentRecoveryResponse(transactionToken) {
  return {
    success: true,
    message: 'If the active student account is eligible, a verification code will be sent to the registered parent/guardian email. Check that inbox or contact school administration.',
    transactionToken,
    otpExpiresInSeconds: 300
  };
}

async function findApprovedStudentRecoveryRecord(connection, admissionNumber) {
  const [rows] = await connection.execute(
    `SELECT s.id AS student_id, s.admission_number, a.id AS application_id, a.parent_email
     FROM students s
     JOIN applications a
       ON UPPER(a.admission_number) = UPPER(s.admission_number)
      AND a.status = 'approved'
     WHERE UPPER(s.admission_number) = ?
       AND s.role = 'student'
       AND s.active = 1
     ORDER BY a.reviewed_at DESC, a.id DESC
     LIMIT 2
     FOR UPDATE`,
    [admissionNumber]
  );
  return rows.length === 1 ? rows[0] : null;
}

async function getStudentResetTransaction(connection, transactionHash, lookup = 'transaction') {
  const lookupColumn = lookup === 'authorization' ? 'r.authorization_hash' : 'r.reset_transaction_id';
  const [rows] = await connection.execute(
    `SELECT r.*, s.name, s.username, s.admission_number,
            s.active AS student_active, s.role AS student_role,
            a.parent_email, a.status AS application_status,
            (r.expires_at > NOW()) AS otp_not_expired,
            (r.authorization_expires_at > NOW()) AS authorization_not_expired,
            TIMESTAMPDIFF(SECOND, r.last_sent_at, NOW()) AS seconds_since_sent
     FROM student_password_resets r
     JOIN students s ON s.id = r.student_id
     JOIN applications a
       ON a.id = r.application_id
      AND UPPER(a.admission_number) = UPPER(s.admission_number)
     WHERE ${lookupColumn} = ?
       AND r.transaction_expires_at > NOW()
     LIMIT 1
     FOR UPDATE`,
    [transactionHash]
  );
  return rows[0] || null;
}

function validStudentResetRecord(reset) {
  return reset
    && Number(reset.student_active) === 1
    && String(reset.student_role || '').toLowerCase() === 'student'
    && String(reset.application_status || '').toLowerCase() === 'approved'
    && emailUtils.isValidRecipientEmail(reset.parent_email);
}

async function requestStudentPasswordReset(req, res) {
  const admissionNumber = String(req.body?.admissionNumber || '').trim().toUpperCase();
  if (!admissionNumber) {
    return res.status(400).json({ success: false, message: 'Enter your admission number.' });
  }

  const transactionToken = crypto.randomBytes(32).toString('hex');
  const genericResponse = genericStudentRecoveryResponse(transactionToken);
  if (!isAdmissionNumber(admissionNumber)) return res.json(genericResponse);

  let connection;
  let resetId = null;
  let recoveryRecord = null;
  try {
    connection = await db.getPool().getConnection();
    await connection.beginTransaction();
    recoveryRecord = await findApprovedStudentRecoveryRecord(connection, admissionNumber);
    if (!recoveryRecord || !emailUtils.isValidRecipientEmail(recoveryRecord.parent_email)) {
      await connection.rollback();
      return res.json(genericResponse);
    }
    const otp = generateOtpCode();
    const otpHash = await bcrypt.hash(otp, 10);
    await connection.execute(
      `UPDATE student_password_resets
       SET revoked_at = NOW()
       WHERE student_id = ? AND consumed_at IS NULL AND revoked_at IS NULL`,
      [recoveryRecord.student_id]
    );
    const [result] = await connection.execute(
      `INSERT INTO student_password_resets
         (student_id, application_id, reset_transaction_id, otp_hash, attempts,
          expires_at, transaction_expires_at, last_sent_at, created_at)
       VALUES (?, ?, ?, ?, 0, DATE_ADD(NOW(), INTERVAL 5 MINUTE),
               DATE_ADD(NOW(), INTERVAL 30 MINUTE), NOW(), NOW())`,
      [
        recoveryRecord.student_id,
        recoveryRecord.application_id,
        hashRecoverySecret(transactionToken),
        otpHash
      ]
    );
    resetId = result.insertId;
    await connection.commit();

    const delivery = await emailUtils.sendStudentParentPasswordResetOtp({
      to: recoveryRecord.parent_email,
      otp,
      applicationId: recoveryRecord.application_id
    });
    if (!delivery.delivered) {
      await query('UPDATE student_password_resets SET revoked_at = NOW() WHERE id = ? AND consumed_at IS NULL', [resetId]);
      console.error('Student parent password recovery email was not delivered:', delivery.failureReason || 'unknown delivery failure');
      return res.json(genericResponse);
    }
    return res.json({
      ...genericResponse,
      emailSent: true,
      message: `Email sent to ${recoveryRecord.parent_email}.`
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Student password recovery request rollback failed:', rollbackError);
      }
    }
    if (resetId) {
      try {
        await query('UPDATE student_password_resets SET revoked_at = NOW() WHERE id = ? AND consumed_at IS NULL', [resetId]);
      } catch (revokeError) {
        console.error('Could not revoke undelivered student recovery transaction:', revokeError.message || revokeError);
      }
    }
    console.error('Student password recovery request failed:', error.message || error);
    return res.status(500).json({ success: false, message: 'Could not process the recovery request. Please try again later.' });
  } finally {
    connection?.release();
  }
}

async function resendStudentPasswordResetOtp(req, res) {
  const transactionToken = String(req.body?.transactionToken || '');
  const transactionHash = /^[a-f0-9]{64}$/i.test(transactionToken)
    ? hashRecoverySecret(transactionToken)
    : '';
  if (!transactionHash) {
    return res.json({ success: true, message: 'If the recovery request is still active, a new code will be sent to the registered parent/guardian email.' });
  }

  let connection;
  let resetId = null;
  let otp;
  let recipient;
  let applicationId;
  try {
    connection = await db.getPool().getConnection();
    await connection.beginTransaction();
    const reset = await getStudentResetTransaction(connection, transactionHash);
    if (!validStudentResetRecord(reset)
      || reset.revoked_at
      || reset.consumed_at
      || reset.verified_at) {
      await connection.rollback();
      return res.json({ success: true, message: 'If the recovery request is still active, a new code will be sent to the registered parent/guardian email.' });
    }
    if (Number(reset.resend_count) >= 5) {
      await connection.rollback();
      return res.status(429).json({ success: false, message: 'This recovery request has reached its resend limit. Start a new recovery request.' });
    }
    if (Number(reset.seconds_since_sent) < 60) {
      await connection.rollback();
      return res.status(429).json({ success: false, message: 'Please wait 60 seconds between code requests.' });
    }

    otp = generateOtpCode();
    const otpHash = await bcrypt.hash(otp, 10);
    await connection.execute(
      `UPDATE student_password_resets
       SET otp_hash = ?, attempts = 0, expires_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE),
           verified_at = NULL, authorization_hash = NULL, authorization_expires_at = NULL,
           transaction_expires_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE),
           last_sent_at = NOW(), resend_count = resend_count + 1
       WHERE id = ?`,
      [otpHash, reset.id]
    );
    resetId = reset.id;
    recipient = reset.parent_email;
    applicationId = reset.application_id;
    await connection.commit();

    const delivery = await emailUtils.sendStudentParentPasswordResetOtp({ to: recipient, otp, applicationId });
    if (!delivery.delivered) {
      await query('UPDATE student_password_resets SET revoked_at = NOW() WHERE id = ? AND consumed_at IS NULL', [resetId]);
      console.error('Resent student parent password recovery email was not delivered:', delivery.failureReason || 'unknown delivery failure');
      return res.status(503).json({ success: false, message: 'The verification email could not be sent. Start a new recovery request or contact school administration.' });
    }
    return res.json({
      success: true,
      emailSent: true,
      message: `Email sent to ${recipient}.`,
      otpExpiresInSeconds: 300
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Student password recovery resend rollback failed:', rollbackError);
      }
    }
    if (resetId) {
      try {
        await query('UPDATE student_password_resets SET revoked_at = NOW() WHERE id = ? AND consumed_at IS NULL', [resetId]);
      } catch (revokeError) {
        console.error('Could not revoke undelivered resent recovery transaction:', revokeError.message || revokeError);
      }
    }
    console.error('Student password recovery resend failed:', error.message || error);
    return res.status(500).json({ success: false, message: 'Could not resend the verification code. Please try again later.' });
  } finally {
    connection?.release();
  }
}

async function verifyStudentPasswordResetOtp(req, res) {
  const transactionToken = String(req.body?.transactionToken || '');
  const otp = String(req.body?.otp || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(transactionToken) || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ success: false, message: 'Enter the six-digit code sent to the registered parent/guardian email.' });
  }

  let connection;
  try {
    connection = await db.getPool().getConnection();
    await connection.beginTransaction();
    const reset = await getStudentResetTransaction(connection, hashRecoverySecret(transactionToken));
    if (!validStudentResetRecord(reset) || reset.revoked_at || reset.consumed_at) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'This recovery request is invalid, expired, or already used. Start again from student login.' });
    }
    if (reset.verified_at) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'This code has already been used. Start a new recovery request.' });
    }
    if (Number(reset.otp_not_expired) !== 1) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'This verification code has expired. Request a new code.' });
    }
    if (Number(reset.attempts) >= 5) {
      await connection.execute('UPDATE student_password_resets SET revoked_at = NOW() WHERE id = ?', [reset.id]);
      await connection.commit();
      return res.status(429).json({ success: false, message: 'Too many incorrect codes. Start a new recovery request.' });
    }

    const matches = await bcrypt.compare(otp, reset.otp_hash);
    if (!matches) {
      await connection.execute(
        `UPDATE student_password_resets
         SET revoked_at = IF(attempts >= 4, NOW(), revoked_at),
             attempts = attempts + 1
         WHERE id = ? AND verified_at IS NULL AND consumed_at IS NULL`,
        [reset.id]
      );
      await connection.commit();
      const attemptsRemaining = Math.max(0, 4 - Number(reset.attempts));
      return res.status(400).json({
        success: false,
        message: attemptsRemaining
          ? `The code is incorrect. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining.`
          : 'Too many incorrect codes. Start a new recovery request.'
      });
    }

    const authorization = crypto.randomBytes(32).toString('hex');
    await connection.execute(
      `UPDATE student_password_resets
       SET verified_at = NOW(), authorization_hash = ?,
           authorization_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
       WHERE id = ? AND verified_at IS NULL AND consumed_at IS NULL AND revoked_at IS NULL`,
      [hashRecoverySecret(authorization), reset.id]
    );
    await connection.commit();
    return res.json({
      success: true,
      authorization,
      authorizationExpiresInSeconds: 600
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Student password code verification rollback failed:', rollbackError);
      }
    }
    console.error('Student password code verification failed:', error.message || error);
    return res.status(500).json({ success: false, message: 'Could not verify the code. Please try again later.' });
  } finally {
    connection?.release();
  }
}

async function completeStudentPasswordReset(req, res) {
  const authorization = String(req.body?.authorization || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!/^[a-f0-9]{64}$/i.test(authorization)) {
    return res.status(400).json({ success: false, message: 'A valid parent-verified reset authorization is required.' });
  }
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 12 characters and include uppercase, lowercase, a number, and a symbol.'
    });
  }
  if (newPassword !== newPassword.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Password cannot begin or end with whitespace.'
    });
  }

  let connection;
  let parentEmail = null;
  let applicationId = null;
  let studentId = null;
  try {
    connection = await db.getPool().getConnection();
    await connection.beginTransaction();
    const reset = await getStudentResetTransaction(connection, hashRecoverySecret(authorization), 'authorization');
    if (!validStudentResetRecord(reset)
      || !reset.verified_at
      || reset.consumed_at
      || reset.revoked_at
      || Number(reset.authorization_not_expired) !== 1
      || !reset.authorization_hash
      || reset.authorization_hash !== hashRecoverySecret(authorization)) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'The reset authorization is invalid, expired, or already used. Verify a new code to continue.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const [updateResult] = await connection.execute(
      `UPDATE students
       SET password_hash = ?, must_change_password = 0
       WHERE id = ? AND role = 'student' AND active = 1`,
      [passwordHash, reset.student_id]
    );
    if (!updateResult.affectedRows) throw new Error('The student account is no longer active.');

    await connection.execute(
      `UPDATE student_password_resets
       SET consumed_at = NOW(), authorization_hash = NULL
       WHERE id = ? AND consumed_at IS NULL AND revoked_at IS NULL`,
      [reset.id]
    );
    await connection.execute(
      `UPDATE student_password_resets
       SET revoked_at = NOW()
       WHERE student_id = ? AND id <> ? AND consumed_at IS NULL AND revoked_at IS NULL`,
      [reset.student_id, reset.id]
    );
    await connection.execute(
      'UPDATE ict_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
      [reset.student_id]
    );
    parentEmail = reset.parent_email;
    applicationId = reset.application_id;
    studentId = reset.student_id;
    await connection.commit();

    const notice = await emailUtils.sendStudentPasswordChangedNotice({ to: parentEmail, applicationId });
    if (!notice.delivered) {
      console.error('Student password-change parent notification was not delivered:', notice.failureReason || 'unknown delivery failure');
    }
    await logActivity(studentId, 'student_password_reset_completed', 'Student password reset completed after parent email verification', req.ip);
    return res.json({ success: true, message: 'Password reset completed. You can now sign in with your new password.' });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Student password reset completion rollback failed:', rollbackError);
      }
    }
    console.error('Student password reset completion failed:', error.message || error);
    return res.status(500).json({ success: false, message: 'Could not reset the password. Please try again later.' });
  } finally {
    connection?.release();
  }
}

async function signup(req, res) {
  try {
    const username = (req.body.username || req.body.name || '').trim();
    const admissionNumber = (req.body.admissionNumber || req.body.admission_number || '').trim().toUpperCase();
    const password = (req.body.password || '').trim();

    if (!username || !admissionNumber || !password) {
      return res.status(400).json({ success: false, message: 'Username, admission number, and password are required' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 12 characters and include uppercase, lowercase, a number, and a symbol.'
      });
    }

    const usernameOwner = await query('SELECT id FROM students WHERE username = ? LIMIT 1', [username]);
    if (usernameOwner.length) {
      return res.status(409).json({ success: false, message: 'That username is already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const approvedRows = await query(
      `SELECT id, username FROM students
       WHERE admission_number = ? AND role = 'student' AND active = 1
       LIMIT 1`,
      [admissionNumber]
    );

    if (approvedRows.length) {
      const student = approvedRows[0];
      if (student.username && student.username !== username) {
        return res.status(409).json({ success: false, message: 'This admission number already has an account. Please log in.' });
      }

      await query(
        `UPDATE students
         SET username = ?, password_hash = ?, name = COALESCE(NULLIF(name, ''), ?)
         WHERE id = ?`,
        [username, passwordHash, username, student.id]
      );
      await logActivity(student.id, 'signup_claimed_approved_student', `Activated portal account for ${admissionNumber}`, req.ip);
      return res.status(201).json({ success: true, message: 'Account created successfully. You can now log in.' });
    }

    const approvedApplication = await query(
      `SELECT id FROM applications
       WHERE admission_number = ? AND status = 'approved'
       LIMIT 1`,
      [admissionNumber]
    );

    if (!approvedApplication.length) {
      return res.status(403).json({
        success: false,
        message: 'This admission number has not been approved by admin yet.'
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Approved admission found, but no student record exists. Ask admin to re-approve or create the student record.'
    });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ success: false, message: 'Signup failed' });
  }
}

function getBootstrapAdminUser(identifier, password) {
  const adminUsername = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const adminPassword = (process.env.ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@2026').trim();
  if (String(identifier).trim().toLowerCase() !== adminUsername) {
    return null;
  }
  if (String(password).trim() !== adminPassword) {
    return null;
  }

  return {
    id: 0,
    name: 'Administrator',
    username: adminUsername,
    email: `${adminUsername}@cresenthighschool.com`,
    admission_number: 'ADMIN',
    role: 'admin',
    class_name: 'Administration',
    stream: null,
    avatar: null,
    active: 1,
    last_login: new Date(),
    bootstrapAdmin: true
  };
}

async function ensureBootstrapAdminAccount(identifier, password) {
  const adminUser = getBootstrapAdminUser(identifier, password);
  if (!adminUser) {
    return null;
  }

  try {
    const existingRows = await query(
      `SELECT * FROM students WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) OR LOWER(admission_number) = LOWER(?) LIMIT 1`,
      [adminUser.username, adminUser.email, adminUser.admission_number]
    );
    if (existingRows[0]) {
      return { ...existingRows[0], bootstrapAdmin: true };
    }

    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@2026', 10);
    await query(
      `INSERT INTO students (name, username, email, admission_number, password_hash, role, active, class_name, stream)
       VALUES (?, ?, ?, ?, ?, 'rba', 1, 'Administration', 'Administration')`,
      [adminUser.name, adminUser.username, adminUser.email, adminUser.admission_number, passwordHash]
    );
  } catch (error) {
    console.warn('Bootstrap admin account check failed:', error.message);
  }

  return adminUser;
}

async function login(req, res) {
  try {
    const identifier = (req.body.name || req.body.username || req.body.email || '').trim();
    const password = (req.body.password || '').trim();
    const requestedPortal = String(req.body.portal || '').trim().toLowerCase();
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Name/email and password are required' });
    }

    const attemptKey = `login:${String(identifier).toLowerCase()}`;
    const attemptStatus = loginTracker(attemptKey);
    if (attemptStatus.blocked) {
      await logActivity(null, 'login_lockout', 'Blocked due to repeated failed attempts', req.ip);
      return res.status(429).json({ success: false, message: 'Too many failed login attempts. Please try again later.' });
    }

    let student = await ensureBootstrapAdminAccount(identifier, password);

    let rows = [];
    if (!student || String(student.role || '').toLowerCase() === 'student') {
      rows = await query(
        `SELECT * FROM students
         WHERE username = ? OR email = ? OR name = ? OR admission_number = ?
         LIMIT 1`,
        [identifier, identifier, identifier, identifier.toUpperCase()]
      );
      student = rows[0];
    }

    if (student && student.bootstrapAdmin) {
      await logActivity(null, 'blocked_admin_login', 'Bootstrap administrator attempted student portal login', req.ip);
      return res.status(403).json({ success: false, message: 'Administrators must use the admin portal.' });
    }

    if (student && ['admin', 'rba', 'school_admin', 'super_admin', 'superadmin', 'schooladmin', 'system_admin'].includes(String(student.role || '').toLowerCase())) {
      await logActivity(student.id, 'blocked_admin_login', 'Administrator attempted student portal login', req.ip);
      return res.status(403).json({ success: false, message: 'Administrators must use the admin portal.' });
    }

    if (student && ['finance', 'finance_admin', 'accountant'].includes(String(student.role || '').toLowerCase()) && requestedPortal !== 'finance') {
      await logActivity(student.id, 'blocked_finance_login', 'Finance account attempted the general portal login', req.ip);
      return res.status(403).json({ success: false, message: 'Finance staff must use the finance portal.' });
    }

    if (student && ['ict', 'ict_admin'].includes(String(student.role || '').toLowerCase()) && requestedPortal !== 'ict') {
      await logActivity(student.id, 'blocked_ict_login', 'ICT account attempted the general portal login', req.ip);
      return res.status(403).json({ success: false, message: 'ICT staff must use the ICT portal.' });
    }

    if (!student) {
      const lecturerRows = await query(
        `SELECT * FROM students
         WHERE role = 'lecturer' AND LOWER(subject) = LOWER(?)
         LIMIT 1`,
        [identifier]
      );
      student = lecturerRows[0];
    }

    if (!student || !student.active) {
      await logActivity(null, 'failed_login', `Invalid login identifier: ${identifier}`, req.ip);
      return res.status(401).json({ success: false, message: 'Invalid login details' });
    }

    const hashedMatch = student.password_hash ? await bcrypt.compare(password, student.password_hash) : false;
    if (!hashedMatch) {
      await logActivity(student.id, 'failed_login', 'Invalid password', req.ip);
      return res.status(401).json({ success: false, message: 'Invalid login details' });
    }

    await query('UPDATE students SET last_login = NOW() WHERE id = ?', [student.id]);
    await logActivity(student.id, 'login', 'Successful login', req.ip);

    const refreshed = (await query('SELECT * FROM students WHERE id = ?', [student.id]))[0];
    const token = signToken(refreshed);
    await recordSession(token, refreshed, req);
    res.cookie('authToken', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000,
      path: '/'
    });
    if (requestedPortal === 'ict' || requestedPortal === 'finance') {
      res.cookie(requestedPortal === 'ict' ? 'ictSessionToken' : 'financeSessionToken', token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 10 * 60 * 1000, path: '/' });
    }
    return res.json({
      success: true,
      token,
      student: publicStudent(refreshed)
    });
  } catch (error) {
    if (error.code === 'SESSION_REGISTRY_UNAVAILABLE') {
      return res.status(503).json({ success: false, message: 'Authentication is temporarily unavailable. Please try again.' });
    }
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
}

async function departmentLogin(req, res) {
  try {
    const identifier = cleanLoginValue(req.body?.username || req.body?.email);
    const password = cleanLoginValue(req.body?.password);
    const departmentId = Number(req.body?.departmentId);
    if (!identifier || !password || !departmentId) return res.status(400).json({ success: false, message: 'Department, username, and password are required' });
    const rows = await query(`
      SELECT s.*, d.id AS department_id, d.name AS department_name, d.code AS department_code
      FROM students s
      JOIN department_staff ds ON ds.staff_id = s.id
      JOIN departments d ON d.id = ds.department_id AND d.active = 1
      WHERE d.id = ? AND (s.username = ? OR s.email = ?) AND s.active = 1
      LIMIT 1`, [departmentId, identifier, identifier.toLowerCase()]);
    const staff = rows[0];
    if (!staff || !staff.password_hash || !(await bcrypt.compare(password, staff.password_hash))) {
      await logActivity(staff?.id || null, 'failed_department_login', `Failed department login for ${identifier}`, req.ip);
      return res.status(401).json({ success: false, message: 'Invalid department login details' });
    }
    await query('UPDATE students SET last_login = NOW() WHERE id = ?', [staff.id]);
    await logActivity(staff.id, 'department_login', `Successful login to ${staff.department_code}`, req.ip);
    const token = signToken(staff);
    await recordSession(token, staff, req);
    res.cookie('departmentSessionToken', token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 60 * 1000, path: '/' });
    res.json({ success: true, token, student: publicStudent(staff), department: { id: staff.department_id, name: staff.department_name, code: staff.department_code } });
  } catch (error) {
    if (error.code === 'SESSION_REGISTRY_UNAVAILABLE') {
      return res.status(503).json({ success: false, message: 'Authentication is temporarily unavailable. Please try again.' });
    }
    console.error('Department login error:', error);
    res.status(500).json({ success: false, message: 'Department login failed' });
  }
}

async function loginDepartments(req, res) {
  const departments = await query('SELECT id, name, code FROM departments WHERE active = 1 ORDER BY name');
  res.json({ success: true, departments });
}

async function requestPasswordReset(req, res) {
  let connection;
  try {
    const identifier = String(req.body?.identifier || req.body?.email || req.body?.username || req.body?.studentId || '').trim();
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Enter your username, email, admission number, or staff number.' });
    }

    const rows = await query(
      `SELECT id, email, role FROM students
       WHERE active = 1 AND (
         id = ? OR LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) OR
         UPPER(admission_number) = UPPER(?) OR UPPER(staff_number) = UPPER(?)
       )
       LIMIT 1`,
      [identifier, identifier, identifier, identifier, identifier]
    );
    const student = rows[0];
    const genericMessage = 'If an active account matches those details and has a registered email, password reset instructions will be sent shortly.';
    if (!student || String(student.role || '').toLowerCase() === 'student' || !emailUtils.isValidRecipientEmail(student.email)) {
      return res.json({ success: true, message: genericMessage });
    }

    connection = await db.getPool().getConnection();
    await connection.beginTransaction();
    const [activeRows] = await connection.execute(
      'SELECT id FROM students WHERE id = ? AND active = 1 FOR UPDATE',
      [student.id]
    );
    if (!activeRows.length) {
      await connection.rollback();
      return res.json({ success: true, message: genericMessage });
    }
    const [recentRequests] = await connection.execute(
      `SELECT id FROM password_reset_requests
       WHERE student_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 60 SECOND)
       LIMIT 1`,
      [student.id]
    );
    if (recentRequests.length) {
      await connection.commit();
      return res.json({ success: true, message: genericMessage });
    }

    const otp = generateOtpCode();
    const otpHash = await bcrypt.hash(otp, 10);
    await connection.execute(
      `UPDATE password_reset_requests SET used_at = NOW()
       WHERE student_id = ? AND used_at IS NULL`,
      [student.id]
    );
    const [result] = await connection.execute(
      `INSERT INTO password_reset_requests
         (student_id, email, otp_hash, expires_at, created_at, attempt_count)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE), NOW(), 0)`,
      [student.id, student.email, otpHash]
    );
    await connection.commit();

    const delivery = await emailUtils.sendPasswordResetEmail({ to: student.email, otp });
    if (!delivery.delivered) {
      await query('UPDATE password_reset_requests SET used_at = NOW() WHERE id = ?', [result.insertId]);
      console.error('Password reset email was not delivered:', delivery.failureReason || 'unknown delivery failure');
      return res.json({ success: true, message: genericMessage });
    }

    await logActivity(student.id, 'password_reset_requested', 'Password reset instructions sent', req.ip);
    return res.json({ success: true, message: genericMessage });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Password reset request transaction rollback failed:', rollbackError);
      }
    }
    console.error('Password reset request error:', error);
    return res.status(500).json({ success: false, message: 'Password reset request failed' });
  } finally {
    connection?.release();
  }
}

async function confirmPasswordReset(req, res) {
  let connection;
  try {
    const identifier = String(req.body?.identifier || req.body?.username || req.body?.email || req.body?.studentId || '').trim();
    const otp = String(req.body?.otp || '').trim();
    const newPassword = String(req.body?.newPassword || '').trim();

    if (!identifier || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'Identifier, OTP, and a new password are required' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 12 characters and include uppercase, lowercase, a number, and a symbol.'
      });
    }

    const rows = await query(
      `SELECT id, username, admission_number, role
       FROM students
       WHERE active = 1 AND (
         id = ? OR LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) OR
         UPPER(admission_number) = UPPER(?) OR UPPER(staff_number) = UPPER(?)
       )
       LIMIT 1`,
      [identifier, identifier, identifier, identifier, identifier]
    );
    const student = rows[0];
    if (!student) {
      return res.status(400).json({ success: false, message: 'The reset code is invalid or expired. Request a new code and try again.' });
    }

    connection = await db.getPool().getConnection();
    await connection.beginTransaction();
    const [resetRows] = await connection.execute(
      `SELECT id, otp_hash, attempt_count
       FROM password_reset_requests
       WHERE student_id = ? AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [student.id]
    );
    const resetRequest = resetRows[0];
    if (!resetRequest || Number(resetRequest.attempt_count) >= 5) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'The reset code is invalid or expired. Request a new code and try again.' });
    }

    const otpMatch = await bcrypt.compare(otp, resetRequest.otp_hash);
    if (!otpMatch) {
      await connection.execute(
        `UPDATE password_reset_requests
         SET used_at = IF(attempt_count >= 4, NOW(), used_at),
             attempt_count = attempt_count + 1
         WHERE id = ? AND used_at IS NULL`,
        [resetRequest.id]
      );
      await connection.commit();
      return res.status(400).json({ success: false, message: 'The reset code is invalid or expired. Request a new code and try again.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const [updateResult] = await connection.execute(
      'UPDATE students SET password_hash = ?, must_change_password = 0 WHERE id = ? AND active = 1',
      [passwordHash, student.id]
    );
    if (!updateResult.affectedRows) throw new Error('The account was deactivated during password reset.');
    await connection.execute('UPDATE password_reset_requests SET used_at = NOW() WHERE id = ?', [resetRequest.id]);
    await connection.execute('UPDATE ict_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [student.id]);
    await connection.commit();
    await logActivity(student.id, 'password_reset_confirmed', `Password reset completed for ${student.username || student.admission_number}`, req.ip);
    return res.json({ success: true, message: 'Password reset completed successfully' });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Password reset transaction rollback failed:', rollbackError);
      }
    }
    console.error('Password reset confirm error:', error);
    return res.status(500).json({ success: false, message: 'Password reset confirmation failed' });
  } finally {
    connection?.release();
  }
}

async function me(req, res) {
  res.json({ success: true, student: publicStudent(req.user) });
}

async function changePassword(req, res) {
  try {
    const currentPassword = String(req.body?.currentPassword || '').trim();
    const newPassword = String(req.body?.newPassword || '').trim();
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new passwords are required' });
    }
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ success: false, message: 'Password must be at least 12 characters and include uppercase, lowercase, a number, and a symbol.' });
    }

    const connection = await db.getPool().getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        'SELECT password_hash FROM students WHERE id = ? AND active = 1 LIMIT 1 FOR UPDATE',
        [req.user.id]
      );
      if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash || ''))) {
        await connection.rollback();
        return res.status(401).json({ success: false, message: 'Current password is incorrect' });
      }
      await connection.execute(
        'UPDATE students SET password_hash = ?, must_change_password = 0 WHERE id = ?',
        [await bcrypt.hash(newPassword, 12), req.user.id]
      );
      if (req.authSessionJti) {
        await connection.execute(
          `UPDATE ict_sessions SET revoked_at = NOW()
           WHERE user_id = ? AND jti <> ? AND revoked_at IS NULL`,
          [req.user.id, req.authSessionJti]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    await logActivity(req.user.id, 'password_changed', 'User changed their password', req.ip);
    return res.json({
      success: true,
      message: 'Password changed successfully',
      portalRole: req.user.role,
      roleKeys: req.user.roleKeys
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ success: false, message: 'Password change failed' });
  }
}

async function revokeOtherSessions(req, res) {
  try {
    if (!req.authSessionJti) {
      return res.status(401).json({ success: false, message: 'Current session could not be identified. Please sign in again.' });
    }
    const result = await query(
      'UPDATE ict_sessions SET revoked_at = NOW() WHERE user_id = ? AND jti <> ? AND revoked_at IS NULL',
      [req.user.id, req.authSessionJti]
    );
    const revokedCount = Number(result?.affectedRows || 0);
    await logActivity(req.user.id, 'other_sessions_revoked', `Revoked ${revokedCount} other session(s)`, req.ip);
    return res.json({ success: true, revokedCount, message: `${revokedCount} other session(s) signed out.` });
  } catch (error) {
    console.error('Revoke other sessions error:', error);
    return res.status(500).json({ success: false, message: 'Could not sign out other sessions' });
  }
}

/**
 * Admin-specific login with enhanced security
 * Enforces admin role verification and enhanced logging
 */
async function adminLogin(req, res) {
  try {
    const identifier = (req.body.username || req.body.name || req.body.email || '').trim();
    const password = (req.body.password || '').trim();
    
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Admin username/email and password are required' });
    }

    // Admin-specific rate limiting (server-side)
    const attemptKey = `admin_login:${String(identifier).toLowerCase()}`;
    const attemptStatus = loginTracker(attemptKey);
    if (attemptStatus.blocked) {
      await logActivity(null, 'admin_login_lockout', 'Admin login blocked due to repeated failed attempts', req.ip);
      return res.status(429).json({ success: false, message: 'Too many failed admin login attempts. Please try again later.' });
    }

    // Query for admin user
    let admin = await query(
      `SELECT * FROM students
       WHERE (username = ? OR email = ? OR name = ?) AND (role IN ('admin', 'rba', 'school_admin', 'super_admin') OR username = 'admin')
       LIMIT 1`,
      [identifier, identifier, identifier]
    );
    admin = admin[0];

    if (!admin || !admin.active) {
      await logActivity(null, 'failed_admin_login', `Unauthorized admin login attempt for: ${identifier}`, req.ip);
      return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
    }

    // Verify admin role
    const role = (admin.role || '').toLowerCase();
    if (!['admin', 'rba', 'school_admin', 'super_admin'].includes(role) && admin.username !== 'admin') {
      await logActivity(admin.id, 'failed_admin_login', 'Non-admin user attempted admin login', req.ip);
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    // Password verification
    const hashedMatch = admin.password_hash ? await bcrypt.compare(password, admin.password_hash) : false;
    if (!hashedMatch) {
      await logActivity(admin.id, 'failed_admin_login', 'Invalid password', req.ip);
      return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
    }

    // Update last login timestamp
    await query('UPDATE students SET last_login = NOW() WHERE id = ?', [admin.id]);
    
    // Log successful admin login with security details
    await logActivity(admin.id, 'admin_login', `Successful admin login from ${req.ip}`, req.ip);

    // Fetch updated admin data
    const refreshed = (await query('SELECT * FROM students WHERE id = ?', [admin.id]))[0];
    
    // Create admin-specific token with shorter expiry
    const adminToken = jwt.sign(
      {
        id: refreshed.id,
        role: normalizeRole(refreshed.role),
        username: refreshed.username,
        jti: crypto.randomUUID(),
        isAdmin: true,
        loginTime: Date.now()
      },
      process.env.JWT_SECRET || 'change-this-development-secret',
      { expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '30m' } // Shorter expiry for admin
    );

    const token = adminToken;
    await recordSession(token, refreshed, req);
    res.cookie('adminSessionToken', adminToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 60 * 1000,
      path: '/'
    });
    return res.json({
      success: true,
      token: adminToken,
      admin: publicStudent(refreshed),
      message: 'Admin login successful'
    });
  } catch (error) {
    if (error.code === 'SESSION_REGISTRY_UNAVAILABLE') {
      return res.status(503).json({ success: false, message: 'Authentication is temporarily unavailable. Please try again.' });
    }
    console.error('Admin login error:', error);
    return res.status(500).json({ success: false, message: 'Admin login failed' });
  }
}

module.exports = {
  login,
  signup,
  me,
  adminLogin,
  requestPasswordReset,
  confirmPasswordReset,
  requestStudentPasswordReset,
  resendStudentPasswordResetOtp,
  verifyStudentPasswordResetOtp,
  completeStudentPasswordReset,
  changePassword,
  revokeOtherSessions,
  departmentLogin,
  loginDepartments,
  publicStudent,
  signToken,
  generateOtpCode,
  generateTempPassword
};
