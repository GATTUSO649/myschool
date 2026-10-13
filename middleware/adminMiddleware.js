function authorizeRole(allowedRoles = []) {
  return (req, res, next) => {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const userRoles = new Set([
      req.user?.role,
      ...(Array.isArray(req.user?.roles) ? req.user.roles : []),
      ...(Array.isArray(req.user?.roleKeys) ? req.user.roleKeys : [])
    ]);

    if (!roles.some((role) => userRoles.has(role))) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    next();
  };
}

function authorizeFinanceRole() {
  return (req, res, next) => {
    const userRoles = new Set([
      req.user?.role,
      ...(Array.isArray(req.user?.roles) ? req.user.roles : []),
      ...(Array.isArray(req.user?.roleKeys) ? req.user.roleKeys : [])
    ]);
    if (!req.user || !['admin', 'finance', 'school_admin', 'system_admin', 'finance_admin'].some((role) => userRoles.has(role))) {
      return res.status(403).json({ success: false, message: 'Finance access required' });
    }
    next();
  };
}

function authorizePermission(permission) {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions?.includes(permission)) {
      return res.status(403).json({ success: false, message: 'Permission required' });
    }
    next();
  };
}

function authorizeICT(permissions = []) {
  return async (req, res, next) => {
    const rawRole = String(req.user?.rawRole || req.user?.role || '').toLowerCase();
    const roleKeys = Array.isArray(req.user?.roleKeys) ? req.user.roleKeys : [];
    const isSystemAdmin = ['super_admin', 'system_admin'].includes(rawRole) || roleKeys.includes('system_admin');
    const isICTAdmin = rawRole === 'ict' || roleKeys.includes('ict_admin');
    if (!isICTAdmin && !isSystemAdmin) {
      return res.status(403).json({ success: false, message: 'ICT administrator access required' });
    }
    if (isSystemAdmin || !permissions.length) return next();
    const { query } = require('../config/db');
    const placeholders = permissions.map(() => '?').join(',');
    const rows = await query(`SELECT permission_key FROM ict_permissions WHERE role = 'ict' AND permission_key IN (${placeholders}) AND enabled = 1`, permissions);
    if (rows.length !== permissions.length) return res.status(403).json({ success: false, message: 'Permission required' });
    next();
  };
}

module.exports = { authorizeRole, authorizeFinanceRole, authorizeICT, authorizePermission };
