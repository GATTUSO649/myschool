const bcrypt = require('bcryptjs');
const crypto = require('crypto');
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
    staffNumber: row.staff_number || null,
    role: normalizeRole(row.role),
    rawRole: String(row.role || '').toLowerCase(),
    className: row.class_name,
    stream: row.stream,
    workingArea: row.finance_working_area || null,
    ictWorkingArea: row.ict_working_area || null,
    subject: row.subject || null,
    avatar: row.avatar,
    active: Boolean(row.active),
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
    if (!decoded?.jti) return;
    await query('INSERT INTO ict_sessions (jti, user_id, role, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)', [decoded.jti, user.id || null, normalizeRole(user.role), req.ip, String(req.headers['user-agent'] || '').slice(0, 255)]);
  } catch (error) {
    console.warn('Session registry update failed:', error.message || error);
  }
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
      await logActivity(null, 'blocked_admin_login', 'Bootstrap administrator attempted student portal login', req.ip);
      return res.status(403).json({ success: false, message: 'Administrators must use the admin portal.' });
    }

    if (student && ['admin', 'rba', 'school_admin', 'super_admin', 'superadmin', 'schooladmin'].includes(String(student.role || '').toLowerCase())) {
      await logActivity(student.id, 'blocked_admin_login', 'Administrator attempted student portal login', req.ip);
      return res.status(403).json({ success: false, message: 'Administrators must use the admin portal.' });
    }

    if (student && ['finance', 'accountant'].includes(String(student.role || '').toLowerCase()) && requestedPortal !== 'finance') {
      await logActivity(student.id, 'blocked_finance_login', 'Finance account attempted the general portal login', req.ip);
      return res.status(403).json({ success: false, message: 'Finance staff must use the finance portal.' });
    }

    if (student && String(student.role || '').toLowerCase() === 'ict' && requestedPortal !== 'ict') {
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
    const admissionFallback = password.toUpperCase() === String(student.admission_number || '').toUpperCase();
    if (!hashedMatch && !admissionFallback) {
      await logActivity(student.id, 'failed_login', 'Invalid password', req.ip);
      return res.status(401).json({ success: false, message: 'Invalid login details' });
    }

    await query('UPDATE students SET last_login = NOW() WHERE id = ?', [student.id]);
    await logActivity(student.id, 'login', 'Successful login', req.ip);

    const refreshed = (await query('SELECT * FROM students WHERE id = ?', [student.id]))[0];
    const token = signToken(refreshed);
    await recordSession(token, refreshed, req);
    if (requestedPortal === 'ict' || requestedPortal === 'finance') {
      res.cookie(requestedPortal === 'ict' ? 'ictSessionToken' : 'financeSessionToken', token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 10 * 60 * 1000, path: '/' });
    }
    return res.json({
      success: true,
      token,
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
    const admissionFallback = password.toUpperCase() === String(admin.admission_number || '').toUpperCase();
    
    if (!hashedMatch && !admissionFallback) {
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
        isAdmin: true,
        loginTime: Date.now()
      },
      process.env.JWT_SECRET || 'change-this-development-secret',
      { expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '30m' } // Shorter expiry for admin
    );

    const token = adminToken;
    await recordSession(token, refreshed, req);
    return res.json({
      success: true,
      token: adminToken,
      admin: publicStudent(refreshed),
      message: 'Admin login successful'
    });
  } catch (error) {
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
  publicStudent,
  signToken,
  generateOtpCode,
  generateTempPassword
};
