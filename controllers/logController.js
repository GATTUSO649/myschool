const { query } = require('../config/db');

async function logActivity(userId, action, details = null, ipAddress = null) {
  try {
    await query(
      'INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [userId || null, action, details, ipAddress]
    );
  } catch (error) {
    console.error('Activity log failed:', error.message);
  }
}

module.exports = { logActivity };
