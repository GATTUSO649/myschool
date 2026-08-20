const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

function normalizeRole(role) {
  const value = (role || '').toString().toLowerCase();
  if (['super_admin', 'superadmin', 'school_admin', 'schooladmin', 'admin', 'rba'].includes(value)) {
    return 'admin';
  }
  if (['finance', 'accountant', 'accounts'].includes(value)) {
    return 'finance';
  }
  if (['ict', 'it', 'ict_staff', 'technology'].includes(value)) {
    return 'ict';
  }
  if (['academics', 'academic', 'lecturer', 'teacher', 'teaching'].includes(value)) {
    return 'teacher';
  }
  if (['parent', 'guardian'].includes(value)) {
    return 'parent';
  }
  return value || 'student';
}

function getTokenFromRequest(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  if (req.path.startsWith('/ict-') && req.cookies?.ictSessionToken) return req.cookies.ictSessionToken;
  if (req.path.startsWith('/admin-finance') && req.cookies?.financeSessionToken) return req.cookies.financeSessionToken;
  return req.headers['x-auth-token'] || null;
}

function isHtmlRequest(req) {
  const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
  const isApiRoute = req.path.startsWith('/api');
  return !isApiRoute && req.method === 'GET' && (acceptsHtml || req.path.endsWith('.html'));
}

async function authMiddleware(req, res, next) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      if (isHtmlRequest(req)) {
        const redirectTo = req.originalUrl && req.originalUrl !== '/' ? req.originalUrl : '/dashboard.html';
        const loginPage = req.path.startsWith('/ict-') ? '/ict-login.html' : req.path.startsWith('/admin-finance') ? '/finance-login.html' : '/login.html';
        return res.redirect(`${loginPage}?redirect=${encodeURIComponent(redirectTo)}`);
      }
      return res.status(401).json({ success: false, message: 'Authentication token required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'change-this-development-secret');
    } catch (err) {
      // Log token snippet and error to help diagnose invalid/expired tokens during development
      try {
        const snippet = typeof token === 'string' ? `${token.slice(0, 12)}...${token.slice(-8)}` : String(token);
        console.warn('authMiddleware: token verification failed for token:', snippet, 'error:', err.message || err);
      } catch (e) {
        console.warn('authMiddleware: token verification failed (could not print token snippet)', err.message || err);
      }
      if (isHtmlRequest(req)) {
        const loginPage = req.path.startsWith('/ict-') ? '/ict-login.html' : req.path.startsWith('/admin-finance') ? '/finance-login.html' : '/login.html';
        return res.redirect(loginPage);
      }
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    try {
      const sessionRows = await query('SELECT id FROM ict_sessions WHERE jti = ? AND revoked_at IS NULL LIMIT 1', [decoded.jti || '']);
      if (decoded.jti && !sessionRows.length) return res.status(401).json({ success: false, message: 'Session revoked or expired' });
      if (decoded.jti) await query('UPDATE ict_sessions SET last_activity = NOW() WHERE jti = ?', [decoded.jti]);
    } catch (error) {
      console.warn('Session registry check unavailable:', error.message || error);
    }

    const adminUsername = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
    if (decoded.bootstrapAdmin && decoded.username && decoded.username.toLowerCase() === adminUsername) {
      req.user = {
        id: 0,
        name: 'Administrator',
        username: decoded.username,
        email: `${decoded.username}@cresenthighschool.com`,
        admission_number: 'ADMIN',
        role: 'admin',
        rawRole: 'super_admin',
        class_name: 'Administration',
        stream: null,
        avatar: null,
        active: 1
      };
      return next();
    }

    const rows = await query(
      'SELECT id, name, username, email, admission_number, staff_number, finance_working_area, ict_working_area, role, class_name, stream, avatar, subject, active FROM students WHERE id = ? LIMIT 1',
      [decoded.id]
    );
    const user = rows[0];
    if (!user || !user.active) {
      if (isHtmlRequest(req)) {
        return res.redirect('/login.html');
      }
      return res.status(401).json({ success: false, message: 'Account is not active' });
    }

    req.user = {
      ...user,
      rawRole: String(user.role || '').toLowerCase(),
      role: normalizeRole(user.role)
    };
    next();
  } catch (error) {
    if (isHtmlRequest(req)) {
      return res.redirect('/login.html');
    }
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
module.exports.normalizeRole = normalizeRole;
