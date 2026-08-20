const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { query, database: databaseName } = require('../config/db');
const { logActivity } = require('./logController');

const permissions = ['students.view', 'students.manage', 'finance.view', 'finance.manage', 'academics.view', 'academics.manage', 'users.manage', 'security.view', 'system.manage', 'backups.manage', 'maintenance.manage'];
const safeTableName = /^[a-zA-Z0-9_]+$/;

function safeError(error, fallback) {
  console.error(fallback, error);
  return { success: false, message: fallback };
}

async function dashboard(req, res) {
  try {
    const started = Date.now();
    const dbStarted = Date.now();
    await query('SELECT 1 AS ok');
    const dbMs = Date.now() - dbStarted;
    const [studentCount, staffCount, activeUsers, failedLogins, events, lastBackup, tableCount] = await Promise.all([
      query("SELECT COUNT(*) AS count FROM students WHERE role = 'student' AND active = 1"),
      query("SELECT COUNT(*) AS count FROM students WHERE role NOT IN ('student') AND active = 1"),
      query('SELECT COUNT(*) AS count FROM ict_sessions WHERE revoked_at IS NULL AND last_activity >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)'),
      query("SELECT COUNT(*) AS count FROM activity_logs WHERE action IN ('failed_login','login_lockout','blocked_admin_login','blocked_finance_login','blocked_ict_login') AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)"),
      query('SELECT id, user_id AS userId, action, details, ip_address AS ipAddress, created_at AS createdAt FROM activity_logs ORDER BY created_at DESC LIMIT 8'),
      query("SELECT id, filename, status, size_bytes AS sizeBytes, created_at AS createdAt, completed_at AS completedAt FROM ict_backups ORDER BY created_at DESC LIMIT 1"),
      query('SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [databaseName])
    ]);
    res.json({ success: true, checkedAt: new Date().toISOString(), responseMs: Date.now() - started, services: { backend: { status: 'ONLINE', responseMs: Date.now() - started }, database: { status: 'ONLINE', responseMs: dbMs }, authentication: { status: 'ONLINE' }, fileStorage: { status: 'ONLINE' }, email: { status: process.env.SMTP_HOST ? 'ONLINE' : 'WARNING' } }, metrics: { totalStudents: Number(studentCount[0]?.count || 0), totalStaff: Number(staffCount[0]?.count || 0), activeUsers: Number(activeUsers[0]?.count || 0), activeSessions: Number(activeUsers[0]?.count || 0), failedLogins24h: Number(failedLogins[0]?.count || 0), tableCount: Number(tableCount[0]?.count || 0) }, recentEvents: events, lastBackup: lastBackup[0] || null });
  } catch (error) { res.status(500).json(safeError(error, 'Unable to load ICT dashboard')); }
}

async function users(req, res) {
  try {
    const search = String(req.query.search || '').trim();
    const role = String(req.query.role || '').trim().toLowerCase();
    const active = req.query.active === undefined || req.query.active === '' ? null : Number(req.query.active) ? 1 : 0;
    const clauses = ['1=1']; const params = [];
    if (search) { clauses.push('(name LIKE ? OR email LIKE ? OR username LIKE ? OR admission_number LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
    if (role) { clauses.push('role = ?'); params.push(role); }
    if (active !== null) { clauses.push('active = ?'); params.push(active); }
    const rows = await query(`SELECT id, name, email, username, admission_number AS admissionNumber, staff_number AS staffNumber, role, active, last_login AS lastLogin, created_at AS createdAt FROM students WHERE ${clauses.join(' AND ')} ORDER BY name LIMIT 500`, params);
    res.json({ success: true, users: rows });
  } catch (error) { res.status(500).json(safeError(error, 'Unable to load users')); }
}

async function updateUser(req, res) {
  const userId = Number(req.params.id); const body = req.body || {};
  if (!userId) return res.status(400).json({ success: false, message: 'User id is required' });
  const allowedRoles = ['student', 'teacher', 'lecturer', 'finance', 'ict', 'admin', 'school_admin', 'super_admin'];
  const requestedRole = String(body.role || '').toLowerCase();
  if (body.role && !allowedRoles.includes(requestedRole)) return res.status(400).json({ success: false, message: 'Unsupported role' });
  if (['admin', 'school_admin', 'super_admin'].includes(requestedRole) && String(req.user.rawRole || '').toLowerCase() !== 'super_admin') return res.status(403).json({ success: false, message: 'Only a super administrator can assign elevated roles' });
  try {
    const fields = []; const params = [];
    if (body.name !== undefined) { fields.push('name = ?'); params.push(String(body.name).trim()); }
    if (body.email !== undefined) { fields.push('email = ?'); params.push(String(body.email || '').trim() || null); }
    if (body.role) { fields.push('role = ?'); params.push(String(body.role).toLowerCase()); }
    if (body.active !== undefined) { fields.push('active = ?'); params.push(body.active ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ success: false, message: 'No user changes supplied' });
    params.push(userId); await query(`UPDATE students SET ${fields.join(', ')} WHERE id = ?`, params);
    await logActivity(req.user.id, 'ict_user_modified', `Modified user ${userId}`, req.ip);
    res.json({ success: true, message: 'User updated' });
  } catch (error) { res.status(500).json(safeError(error, 'Unable to update user')); }
}

async function resetUser(req, res) {
  const userId = Number(req.params.id); const password = String(req.body.password || '');
  if (!userId || password.length < 12) return res.status(400).json({ success: false, message: 'A 12-character password is required' });
  const bcrypt = require('bcryptjs');
  try { await query('UPDATE students SET password_hash = ? WHERE id = ?', [await bcrypt.hash(password, 12), userId]); await logActivity(req.user.id, 'ict_password_reset', `Reset password for user ${userId}`, req.ip); res.json({ success: true, message: 'Password reset' }); }
  catch (error) { res.status(500).json(safeError(error, 'Unable to reset password')); }
}

async function sessions(req, res) {
  try { const rows = await query(`SELECT s.id, s.jti, s.user_id AS userId, u.name, u.username, s.role, s.login_at AS loginAt, s.last_activity AS lastActivity, s.ip_address AS ipAddress, s.user_agent AS userAgent, s.revoked_at AS revokedAt FROM ict_sessions s LEFT JOIN students u ON u.id = s.user_id ORDER BY s.last_activity DESC LIMIT 500`); res.json({ success: true, sessions: rows }); }
  catch (error) { res.status(500).json(safeError(error, 'Unable to load sessions')); }
}

async function revokeSession(req, res) {
  try { await query('UPDATE ict_sessions SET revoked_at = NOW() WHERE id = ?', [Number(req.params.id)]); await logActivity(req.user.id, 'ict_session_revoked', `Revoked session ${req.params.id}`, req.ip); res.json({ success: true, message: 'Session revoked' }); }
  catch (error) { res.status(500).json(safeError(error, 'Unable to revoke session')); }
}

async function auditLogs(req, res) {
  try { const search = String(req.query.search || '').trim(); const params = []; let where = '1=1'; if (search) { where += ' AND (action LIKE ? OR details LIKE ? OR ip_address LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); } const rows = await query(`SELECT id, user_id AS userId, action, details, ip_address AS ipAddress, created_at AS createdAt FROM activity_logs WHERE ${where} ORDER BY created_at DESC LIMIT 500`, params); res.json({ success: true, logs: rows }); }
  catch (error) { res.status(500).json(safeError(error, 'Unable to load audit logs')); }
}

async function permissionsList(req, res) {
  const rows = await query('SELECT role, permission_key AS permission, enabled FROM ict_permissions ORDER BY role, permission_key');
  res.json({ success: true, permissions, assignments: rows });
}

async function updatePermission(req, res) {
  const role = String(req.body.role || '').toLowerCase(); const permission = String(req.body.permission || '');
  if (!['ict'].includes(role) || !permissions.includes(permission)) return res.status(400).json({ success: false, message: 'Invalid role or permission' });
  await query('INSERT INTO ict_permissions (role, permission_key, enabled) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)', [role, permission, req.body.enabled ? 1 : 0]);
  await logActivity(req.user.id, 'ict_permission_modified', `Updated ${role}:${permission}`, req.ip);
  res.json({ success: true, message: 'Permission updated' });
}

async function health(req, res) { return dashboard(req, res); }

async function settings(req, res) {
  const rows = await query('SELECT setting_key AS settingKey, setting_value AS settingValue FROM app_settings ORDER BY setting_key');
  res.json({ success: true, settings: rows });
}

async function saveSettings(req, res) {
  const updates = req.body || {}; const allowed = ['schoolName', 'schoolMotto', 'footerText', 'contactEmail', 'contactPhone', 'contactAddress', 'landingHeroTitle', 'landingHeroText', 'landingAboutTitle', 'landingAboutText', 'academicYear', 'currentTerm', 'maintenanceMode', 'registrationStatus', 'sessionTimeout', 'maxUploadSize'];
  for (const key of allowed) if (updates[key] !== undefined) await query('INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', [key, String(updates[key])]);
  await logActivity(req.user.id, 'ict_settings_changed', 'Portal configuration updated', req.ip); res.json({ success: true, message: 'Configuration saved' });
}

async function maintenance(req, res) {
  const value = req.body.enabled ? 'true' : 'false';
  await query('INSERT INTO app_settings (setting_key, setting_value) VALUES (\'maintenanceMode\', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', [value]);
  await logActivity(req.user.id, 'maintenance_mode_changed', `Maintenance mode ${value}`, req.ip); res.json({ success: true, maintenanceMode: value === 'true' });
}

async function backupHistory(req, res) { const rows = await query('SELECT id, filename, status, size_bytes AS sizeBytes, created_at AS createdAt, completed_at AS completedAt, error_message AS errorMessage FROM ict_backups ORDER BY created_at DESC LIMIT 100'); res.json({ success: true, backups: rows }); }
async function createBackup(req, res) { const filename = `backup-request-${Date.now()}.json`; const result = await query('INSERT INTO ict_backups (filename, status, created_by) VALUES (?, \'requested\', ?)', [filename, req.user.id]); await logActivity(req.user.id, 'backup_requested', filename, req.ip); res.status(202).json({ success: true, id: result.insertId, message: 'Backup request recorded. Configure the deployment provider backup job for full database exports.' }); }

async function storage(req, res) {
  const root = path.join(__dirname, '..', 'uploads'); const categories = [];
  try { const folders = await fs.readdir(root, { withFileTypes: true }); for (const folder of folders.filter((entry) => entry.isDirectory())) { const files = await fs.readdir(path.join(root, folder.name), { withFileTypes: true }); let bytes = 0; for (const file of files.filter((entry) => entry.isFile())) { try { bytes += (await fs.stat(path.join(root, folder.name, file.name))).size; } catch {} } categories.push({ category: folder.name, files: files.filter((entry) => entry.isFile()).length, bytes }); } }
  catch (error) { return res.status(500).json(safeError(error, 'Unable to inspect file storage')); }
  res.json({ success: true, root: 'uploads', categories, totalFiles: categories.reduce((sum, item) => sum + item.files, 0), totalBytes: categories.reduce((sum, item) => sum + item.bytes, 0) });
}

async function database(req, res) {
  try {
    await query('SELECT 1 AS connected');
    const tables = await query(`SELECT TABLE_NAME AS tableName, TABLE_ROWS AS approximateRows, DATA_LENGTH + INDEX_LENGTH AS bytes FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`, [databaseName]);
    res.json({ success: true, database: databaseName, connection: 'ONLINE', tableCount: tables.length, tables });
  } catch (error) { res.status(500).json(safeError(error, 'Unable to inspect database')); }
}

async function tickets(req, res) { const rows = await query('SELECT id, title, module, description, priority, status, created_by AS createdBy, assigned_to AS assignedTo, created_at AS createdAt, updated_at AS updatedAt FROM ict_tickets ORDER BY created_at DESC LIMIT 500'); res.json({ success: true, tickets: rows }); }
async function createTicket(req, res) { const body = req.body || {}; if (!String(body.title || '').trim() || !String(body.description || '').trim()) return res.status(400).json({ success: false, message: 'Title and description are required' }); const result = await query('INSERT INTO ict_tickets (title, module, description, priority, created_by) VALUES (?, ?, ?, ?, ?)', [String(body.title).trim(), body.module || null, String(body.description).trim(), body.priority || 'normal', req.user.id]); await logActivity(req.user.id, 'support_ticket_created', `Created ticket ${result.insertId}`, req.ip); res.status(201).json({ success: true, id: result.insertId }); }
async function updateTicket(req, res) { const status = String(req.body.status || '').toUpperCase(); if (!['OPEN', 'ASSIGNED', 'IN PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid ticket status' }); await query('UPDATE ict_tickets SET status = ?, assigned_to = ? WHERE id = ?', [status, req.body.assignedTo || null, Number(req.params.id)]); await logActivity(req.user.id, 'support_ticket_updated', `Updated ticket ${req.params.id}`, req.ip); res.json({ success: true, message: 'Ticket updated' }); }

module.exports = { dashboard, users, updateUser, resetUser, sessions, revokeSession, auditLogs, permissionsList, updatePermission, health, settings, saveSettings, maintenance, backupHistory, createBackup, storage, database, tickets, createTicket, updateTicket };
