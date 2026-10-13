const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { LEGACY_ROLE_MAP, ROLE_LEGACY_ALIASES, ROLE_PERMISSIONS } = require('../config/rbac');

function normalizeRole(role) {
  const value = (role || '').toString().toLowerCase();
  if (['super_admin', 'superadmin', 'system_admin', 'school_admin', 'schooladmin', 'admin', 'rba'].includes(value)) {
    return 'admin';
  }
  if (['finance', 'finance_admin', 'accountant', 'accounts'].includes(value)) {
    return 'finance';
  }
  if (['ict', 'ict_admin', 'it', 'ict_staff', 'technology'].includes(value)) {
    return 'ict';
  }
  if (['academics', 'academic'].includes(value)) {
    return 'academics';
  }
  if (['academics_admin'].includes(value)) {
    return 'academics';
  }
  if (['lecturer', 'teacher', 'teaching'].includes(value)) {
    return 'teacher';
  }
  if (value === 'department_head') return 'hod';
  if (value === 'deputy_principal') return 'deputy';
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
  if ((req.path.startsWith('/admin') || req.path.startsWith('/admissions')) && req.cookies?.adminSessionToken) return req.cookies.adminSessionToken;
  if (req.cookies?.authToken) return req.cookies.authToken;
  return req.headers['x-auth-token'] || null;
}

function isHtmlRequest(req) {
  const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
  const isApiRoute = req.path.startsWith('/api');
  return !isApiRoute && req.method === 'GET' && (acceptsHtml || req.path.endsWith('.html'));
}

function getLoginPage(req) {
  if (req.path.startsWith('/ict-')) return '/ict-login.html';
  if (req.path.startsWith('/department-portal')) return '/department-login.html';
  if (req.path.startsWith('/department-roles')) return '/admin-login.html';
  if (req.path.startsWith('/admin-finance')) return '/finance-login.html';
  if (['/teacher.html', '/teacher-portal.html', '/lecturer-dashboard.html'].includes(req.path.toLowerCase())) return '/teacher-login.html';
  return '/login.html';
}

async function authMiddleware(req, res, next) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      if (isHtmlRequest(req)) {
        const redirectTo = req.originalUrl && req.originalUrl !== '/' ? req.originalUrl : '/dashboard.html';
        const loginPage = getLoginPage(req);
        return res.redirect(`${loginPage}?redirect=${encodeURIComponent(redirectTo)}`);
      }
      return res.status(401).json({ success: false, message: 'Authentication token required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'change-this-development-secret');
    } catch {
      if (isHtmlRequest(req)) {
        const loginPage = getLoginPage(req);
        return res.redirect(loginPage);
      }
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    try {
      const sessionRows = await query('SELECT id FROM ict_sessions WHERE jti = ? AND revoked_at IS NULL LIMIT 1', [decoded.jti || '']);
      if (decoded.jti && !sessionRows.length) return res.status(401).json({ success: false, message: 'Session revoked or expired' });
      if (decoded.jti) await query('UPDATE ict_sessions SET last_activity = NOW() WHERE jti = ?', [decoded.jti]);
    } catch (error) {
      console.error('Session registry check failed:', error);
      return res.status(503).json({ success: false, message: 'Session validation is temporarily unavailable' });
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
        roleKeys: ['system_admin'],
        permissions: ROLE_PERMISSIONS.system_admin,
        class_name: 'Administration',
        stream: null,
        avatar: null,
        active: 1
      };
      return next();
    }

    const rows = await query(
      'SELECT id, name, username, email, admission_number, staff_number, finance_working_area, ict_working_area, role, class_name, curriculum_type, stream, avatar, phone, date_of_birth, subject, active, must_change_password FROM students WHERE id = ? LIMIT 1',
      [decoded.id]
    );
    const user = rows[0];
    if (!user || !user.active) {
      if (isHtmlRequest(req)) {
        return res.redirect('/login.html');
      }
      return res.status(401).json({ success: false, message: 'Account is not active' });
    }

    let assignedRoles = [];
    let assignedPermissions = [];
    let roleGrants = [];
    try {
      roleGrants = await query(
        `SELECT ur.role_key AS roleKey, ur.active, ur.is_primary AS isPrimary, rp.permission_key AS permissionKey
         FROM user_roles ur
         LEFT JOIN role_permissions rp ON rp.role_key = ur.role_key AND ur.active = 1
         WHERE ur.user_id = ?`,
        [user.id]
      );
      assignedRoles = [...new Set(roleGrants.filter((grant) => Number(grant.active) === 1).map((grant) => grant.roleKey))];
      assignedPermissions = [...new Set(roleGrants.map((grant) => grant.permissionKey).filter(Boolean))];
      if (!roleGrants.length) {
        const legacyMappedRole = LEGACY_ROLE_MAP[String(user.role || '').toLowerCase()];
        if (legacyMappedRole) {
          assignedRoles.push(legacyMappedRole);
          const legacyGrants = await query(
            'SELECT permission_key AS permissionKey FROM role_permissions WHERE role_key = ?',
            [legacyMappedRole]
          );
          assignedPermissions = legacyGrants.map((grant) => grant.permissionKey);
        }
      }
    } catch (error) {
      console.error('RBAC assignments could not be loaded:', error);
      return res.status(503).json({ success: false, message: 'Authorization data is temporarily unavailable' });
    }

    const primaryAssignedRole = assignedRoles.length
      ? (roleGrants.find((grant) => Number(grant.active) === 1 && Number(grant.isPrimary) === 1)?.roleKey || assignedRoles[0])
      : (roleGrants.length ? 'unassigned' : null);
    const effectiveRole = primaryAssignedRole || String(user.role || '').toLowerCase();
    req.user = {
      ...user,
      rawRole: effectiveRole,
      role: normalizeRole(effectiveRole),
      roleKeys: [...new Set(assignedRoles)],
      roles: [...new Set(assignedRoles.flatMap((roleKey) => ROLE_LEGACY_ALIASES[roleKey] || []))],
      permissions: [...new Set(assignedPermissions)]
    };
    req.authSessionJti = decoded.jti || null;
    const path = req.path.toLowerCase();
    const isStaffPasswordPage = path === '/staff-change-password.html' || path === '/staff/change-password';
    const isStudentPasswordSettingsPage = path.endsWith('/settings.html') && ['student', 'parent'].includes(req.user.role);
    const isLogoutRequest = path === '/logout' || path === '/sessions/logout';
    if (req.user.must_change_password && !path.endsWith('/password/change') && !isStaffPasswordPage && !isStudentPasswordSettingsPage && !isLogoutRequest) {
      if (isHtmlRequest(req)) {
        const redirectTo = req.originalUrl && req.originalUrl !== '/' ? req.originalUrl : '/dashboard.html';
        const page = ['student', 'parent'].includes(req.user.role) ? '/settings.html' : '/staff/change-password';
        return res.redirect(`${page}?passwordChangeRequired=1&redirect=${encodeURIComponent(redirectTo)}`);
      }
      return res.status(403).json({ success: false, code: 'PASSWORD_CHANGE_REQUIRED', message: 'You must change your temporary password before continuing.' });
    }
    next();
  } catch (error) {
    console.error('Authentication data lookup failed:', error);
    if (isHtmlRequest(req)) {
      return res.status(503).send('Authentication is temporarily unavailable. Please try again.');
    }
    return res.status(503).json({ success: false, message: 'Authentication is temporarily unavailable' });
  }
}

module.exports = authMiddleware;
module.exports.normalizeRole = normalizeRole;
