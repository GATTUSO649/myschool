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

module.exports = { authorizeRole };
