function authorizeRole(allowedRoles = []) {
  return (req, res, next) => {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const userRole = req.user?.role;

    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    next();
  };
}

function authorizeFinanceRole() {
  return (req, res, next) => {
    if (!req.user || !['admin', 'finance'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Finance access required' });
    }
    next();
  };
}

function authorizeICT(permissions = []) {
  return async (req, res, next) => {
    const rawRole = String(req.user?.rawRole || req.user?.role || '').toLowerCase();
    if (!['ict', 'super_admin'].includes(rawRole)) {
      return res.status(403).json({ success: false, message: 'ICT administrator access required' });
    }
    if (rawRole === 'super_admin' || !permissions.length) return next();
    const { query } = require('../config/db');
    const placeholders = permissions.map(() => '?').join(',');
    const rows = await query(`SELECT permission_key FROM ict_permissions WHERE role = ? AND permission_key IN (${placeholders}) AND enabled = 1`, [rawRole, ...permissions]);
    if (rows.length !== permissions.length) return res.status(403).json({ success: false, message: 'Permission required' });
    next();
  };
}

module.exports = { authorizeRole, authorizeFinanceRole, authorizeICT };
