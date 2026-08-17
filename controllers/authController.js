const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { logActivity } = require('./logController');
const { isStrongPassword, createLoginAttemptTracker } = require('../middleware/security');
const { normalizeRole } = require('../middleware/authMiddleware');
const { schoolEmail, sendPasswordResetEmail } = require('./emailUtils');

const loginTracker = createLoginAttemptTracker({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });

function publicStudent(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    admissionNumber: row.admission_number,
    role: normalizeRole(row.role),
    className: row.class_name,
    stream: row.stream,
    subject: row.subject || null,
    avatar: row.avatar,
    active: Boolean(row.active),
    last_login: row.last_login
  };
}

function signToken(student) {
  const payload = {
    id: student.id,
    role: student.role,
    username: student.username,
    bootstrapAdmin: Boolean(student.bootstrapAdmin)
  };
  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'change-this-development-secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateTempPassword() {
  return `Cres${Math.random().toString(36).slice(-8)}!`;
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
    if (!student) {
      rows = await query(
        `SELECT * FROM students
         WHERE username = ? OR email = ? OR name = ? OR admission_number = ?
         LIMIT 1`,
        [identifier, identifier, identifier, identifier.toUpperCase()]
      );
      student = rows[0];
    }

    if (student && student.bootstrapAdmin) {
      return res.cookie('authToken', signToken(student), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000
      }).json({
        success: true,
        token: signToken(student),
        student: publicStudent(student)
      });
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
    const admissionFallback = password.toUpperCase() === String(student.admission_number || '').toUpperCase();
    if (!hashedMatch && !admissionFallback) {
      await logActivity(student.id, 'failed_login', 'Invalid password', req.ip);
      return res.status(401).json({ success: false, message: 'Invalid login details' });
    }

    await query('UPDATE students SET last_login = NOW() WHERE id = ?', [student.id]);
    await logActivity(student.id, 'login', 'Successful login', req.ip);

    const refreshed = (await query('SELECT * FROM students WHERE id = ?', [student.id]))[0];
    return res.cookie('authToken', signToken(refreshed), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    }).json({
      success: true,
      token: signToken(refreshed),
      student: publicStudent(refreshed)
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
}

async function requestPasswordReset(req, res) {
  try {
    const identifier = String(req.body?.identifier || req.body?.email || req.body?.username || req.body?.studentId || '').trim();
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Student identifier is required' });
    }

    const rows = await query(
      `SELECT * FROM students WHERE id = ? OR username = ? OR email = ? OR admission_number = ? LIMIT 1`,
      [identifier, identifier, identifier, identifier.toUpperCase()]
    );
    const student = rows[0];
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student account not found' });
    }

    const otp = generateOtpCode();
    const temporaryPassword = generateTempPassword();
    const otpHash = await bcrypt.hash(otp, 10);
    const tempPasswordHash = await bcrypt.hash(temporaryPassword, 10);

    await query(
      `INSERT INTO password_reset_requests (student_id, email, otp_hash, temp_password_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE), NOW())`,
      [student.id, student.email || schoolEmail(student.email, student.admission_number), otpHash, tempPasswordHash]
    );

    const destinationEmail = student.email || schoolEmail(student.email, student.admission_number);
    if (destinationEmail) {
      await sendPasswordResetEmail({ to: destinationEmail, otp, temporaryPassword });
    }

    await logActivity(req.user?.id || student.id, 'password_reset_requested', `Password reset initiated for ${student.username || student.admission_number}`, req.ip);
    return res.json({ success: true, message: 'Password reset instructions have been sent to the student email.' });
  } catch (error) {
    console.error('Password reset request error:', error);
    return res.status(500).json({ success: false, message: 'Password reset request failed' });
  }
}

async function confirmPasswordReset(req, res) {
  try {
    const identifier = String(req.body?.identifier || req.body?.username || req.body?.email || '').trim();
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
      `SELECT * FROM students WHERE username = ? OR email = ? OR admission_number = ? LIMIT 1`,
      [identifier, identifier, identifier.toUpperCase()]
    );
    const student = rows[0];
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student account not found' });
    }

    const resetRows = await query(
      `SELECT * FROM password_reset_requests WHERE student_id = ? AND used_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
      [student.id]
    );
    const resetRequest = resetRows[0];
    if (!resetRequest) {
      return res.status(400).json({ success: false, message: 'No active password reset request was found' });
    }

    const otpMatch = await bcrypt.compare(otp, resetRequest.otp_hash);
    if (!otpMatch) {
      return res.status(400).json({ success: false, message: 'The OTP is invalid or expired' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE students SET password_hash = ? WHERE id = ?', [passwordHash, student.id]);
    await query('UPDATE password_reset_requests SET used_at = NOW() WHERE id = ?', [resetRequest.id]);
    await logActivity(student.id, 'password_reset_confirmed', `Password reset completed for ${student.username || student.admission_number}`, req.ip);
    return res.json({ success: true, message: 'Password reset completed successfully' });
  } catch (error) {
    console.error('Password reset confirm error:', error);
    return res.status(500).json({ success: false, message: 'Password reset confirmation failed' });
  }
}
async function me(req, res) {
  res.json({ success: true, student: publicStudent(req.user) });
}

async function changePassword(req, res) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: 'Missing fields' });

    if (!isStrongPassword(newPassword)) return res.status(400).json({ success: false, message: 'New password does not meet strength requirements' });

    const [rows] = await query('SELECT password_hash FROM students WHERE id = ?', [userId]);
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!match) return res.status(403).json({ success: false, message: 'Current password incorrect' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE students SET password_hash = ? WHERE id = ?', [newHash, userId]);
    await logActivity(userId, 'password_changed', 'User changed password', req.ip);
    return res.json({ success: true, message: 'Password changed' });
  } catch (error) {
    console.error('changePassword error', error);
    return res.status(500).json({ success: false, message: 'Could not change password' });
  }
}

async function me(req, res) {
  res.json({ success: true, student: publicStudent(req.user) });
}

module.exports = {
  login,
  signup,
  me,
  requestPasswordReset,
  confirmPasswordReset,
  changePassword,
  publicStudent,
  signToken,
  generateOtpCode,
  generateTempPassword
};
