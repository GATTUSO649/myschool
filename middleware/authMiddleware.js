const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'change-this-development-secret');

    if (decoded.role === 'admin' && decoded.id === 0) {
      req.user = {
        id: 0,
        name: 'Administrator',
        username: 'admin',
        email: 'admin@cresenthighschool.com',
        admission_number: 'ADMIN',
        role: 'admin',
        class_name: 'Administration',
        stream: null,
        avatar: null,
        active: 1
      };
      return next();
    }

    const rows = await query(
      'SELECT id, name, username, email, admission_number, role, class_name, stream, avatar, active FROM students WHERE id = ? LIMIT 1',
      [decoded.id]
    );
    const user = rows[0];
    if (!user || !user.active) {
      return res.status(401).json({ success: false, message: 'Account is not active' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
