const bcrypt = require('bcryptjs');
const { getPool, query } = require('../config/db');
const { ROLE_NAMES } = require('../config/rbac');
const { logActivity } = require('./logController');

const ASSIGNABLE_ROLES = Object.keys(ROLE_NAMES).filter((role) => !['system_admin', 'school_admin'].includes(role));
const STAFF_NUMBER_KEY = 'CRE/STAFF';

function clean(value) {
  return String(value || '').trim();
}

function normalizeRoleKeys(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((role) => clean(role).toLowerCase()).filter(Boolean))];
}

function primaryStoredRole(roleKeys) {
  return roleKeys[0];
}

async function nextStaffNumber(connection) {
  await connection.execute(
    `INSERT IGNORE INTO staff_number_sequences (sequence_key, last_number)
     SELECT ?, COALESCE(MAX(CAST(SUBSTRING_INDEX(staff_number, '/', -1) AS UNSIGNED)), 0)
     FROM students
     WHERE staff_number REGEXP '^CRE/STAFF/[0-9]+$'`,
    [STAFF_NUMBER_KEY]
  );
  const [rows] = await connection.execute(
    'SELECT last_number AS lastNumber FROM staff_number_sequences WHERE sequence_key = ? FOR UPDATE',
    [STAFF_NUMBER_KEY]
  );
  const [existingRows] = await connection.execute(
    `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(staff_number, '/', -1) AS UNSIGNED)), 0) AS lastNumber
     FROM students
     WHERE staff_number REGEXP '^CRE/STAFF/[0-9]+$'`
  );
  const lastNumber = Math.max(Number(rows[0]?.lastNumber || 0), Number(existingRows[0]?.lastNumber || 0));
  const nextNumber = lastNumber + 1;
  await connection.execute(
    'UPDATE staff_number_sequences SET last_number = ? WHERE sequence_key = ?',
    [nextNumber, STAFF_NUMBER_KEY]
  );
  return `CRE/STAFF/${String(nextNumber).padStart(4, '0')}`;
}

async function listStaff(req, res) {
  const rows = await query(`
    SELECT s.id, s.name, s.email, s.phone, s.username, s.staff_number AS staffNumber,
           s.role AS legacyRole, s.active, s.must_change_password AS mustChangePassword,
           s.last_login AS lastLogin, s.created_at AS createdAt,
           GROUP_CONCAT(DISTINCT ur.role_key ORDER BY ur.role_key SEPARATOR ',') AS assignedRoles,
           GROUP_CONCAT(DISTINCT d.name ORDER BY d.name SEPARATOR ',') AS departments
    FROM students s
    LEFT JOIN user_roles ur ON ur.user_id = s.id AND ur.active = 1
    LEFT JOIN department_staff ds ON ds.staff_id = s.id
    LEFT JOIN departments d ON d.id = ds.department_id AND d.active = 1
    WHERE s.role <> 'student'
       OR s.staff_number IS NOT NULL
       OR ur.role_key IS NOT NULL
    GROUP BY s.id
    ORDER BY s.name
  `);
  res.json({
    success: true,
    staff: rows.map((row) => ({
      ...row,
      active: Boolean(row.active),
      mustChangePassword: Boolean(row.mustChangePassword),
      roles: row.assignedRoles ? row.assignedRoles.split(',') : []
    })),
    roleOptions: ASSIGNABLE_ROLES.map((key) => ({ key, name: ROLE_NAMES[key] }))
  });
}

async function createStaff(req, res) {
  const name = clean(req.body?.name);
  const email = clean(req.body?.email).toLowerCase();
  const phone = clean(req.body?.phone) || null;
  const roleKeys = normalizeRoleKeys(req.body?.roles);
  const startDate = clean(req.body?.startDate) || new Date().toISOString().slice(0, 10);
  const startDateMatch = startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsedStartDate = startDateMatch ? new Date(`${startDate}T00:00:00.000Z`) : null;
  const startDateIsValid = parsedStartDate
    && !Number.isNaN(parsedStartDate.getTime())
    && parsedStartDate.toISOString().slice(0, 10) === startDate;
  if (!name || name.length > 150 || !email || email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'A valid staff name and official email are required' });
  }
  if (phone && phone.length > 40) return res.status(400).json({ success: false, message: 'Phone number is too long' });
  if (!startDateIsValid) return res.status(400).json({ success: false, message: 'Appointment start date must be a valid calendar date' });
  if (!roleKeys.length || roleKeys.some((role) => !ASSIGNABLE_ROLES.includes(role))) {
    return res.status(400).json({ success: false, message: 'Choose one or more valid staff roles' });
  }

  const connection = await getPool().getConnection();
  let staffNumber;
  let staffId;
  try {
    await connection.beginTransaction();
    staffNumber = await nextStaffNumber(connection);
    const passwordHash = await bcrypt.hash(staffNumber, 12);
    const [insertResult] = await connection.execute(
      `INSERT INTO students
        (name, username, email, password_hash, role, staff_number, phone, active, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`,
      [name, staffNumber, email, passwordHash, primaryStoredRole(roleKeys), staffNumber, phone]
    );
    staffId = insertResult.insertId;
    const assignedBy = Number(req.user?.id) > 0 ? Number(req.user.id) : null;
    for (const roleKey of roleKeys) {
      await connection.execute(
        'INSERT INTO user_roles (user_id, role_key, assigned_by, active, is_primary) VALUES (?, ?, ?, 1, ?)',
        [staffId, roleKey, assignedBy, roleKey === roleKeys[0] ? 1 : 0]
      );
    }
    await connection.execute(
      `INSERT INTO staff_appointments
        (staff_id, staff_number, category, role_snapshot, start_date, appointed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [staffId, staffNumber, ROLE_NAMES[roleKeys[0]], JSON.stringify(roleKeys), startDate, assignedBy]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'That staff email or staff number is already in use' });
    }
    throw error;
  } finally {
    connection.release();
  }

  await logActivity(req.user?.id || null, 'staff_appointed', `Created staff account ${staffNumber} with roles ${roleKeys.join(', ')}`, req.ip);
  return res.status(201).json({
    success: true,
    staff: { id: staffId, name, email, phone, username: staffNumber, staffNumber, roles: roleKeys, startDate, active: true, mustChangePassword: true },
    temporaryCredentialPolicy: 'The staff number is the one-time initial password; it must be changed at first login.'
  });
}

async function getAppointments(req, res) {
  const staffId = Number(req.params.staffId);
  if (!Number.isInteger(staffId) || staffId <= 0) return res.status(400).json({ success: false, message: 'Invalid staff account' });
  const appointments = await query(
    `SELECT id, staff_number AS staffNumber, category, role_snapshot AS roleSnapshot,
            start_date AS startDate, status, appointed_at AS appointedAt, ended_at AS endedAt
     FROM staff_appointments WHERE staff_id = ? ORDER BY appointed_at DESC`,
    [staffId]
  );
  res.json({
    success: true,
    appointments: appointments.map((item) => ({
      ...item,
      roles: JSON.parse(item.roleSnapshot || '[]')
    }))
  });
}

async function updateStaffRoles(req, res) {
  const staffId = Number(req.params.staffId);
  const roleKeys = normalizeRoleKeys(req.body?.roles);
  if (!Number.isInteger(staffId) || staffId <= 0) return res.status(400).json({ success: false, message: 'Invalid staff account' });
  if (!roleKeys.length || roleKeys.some((role) => !ASSIGNABLE_ROLES.includes(role))) {
    return res.status(400).json({ success: false, message: 'Choose one or more valid staff roles' });
  }

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [staffRows] = await connection.execute(
      `SELECT id FROM students WHERE id = ? AND active = 1
       AND (role <> 'student' OR staff_number IS NOT NULL) LIMIT 1 FOR UPDATE`,
      [staffId]
    );
    if (!staffRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Active staff account not found' });
    }
    await connection.execute('UPDATE students SET role = ? WHERE id = ?', [primaryStoredRole(roleKeys), staffId]);
    await connection.execute('UPDATE user_roles SET active = 0, is_primary = 0 WHERE user_id = ?', [staffId]);
    const assignedBy = Number(req.user?.id) > 0 ? Number(req.user.id) : null;
    for (const roleKey of roleKeys) {
      await connection.execute(
        `INSERT INTO user_roles (user_id, role_key, assigned_by, active, is_primary)
         VALUES (?, ?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE assigned_by = VALUES(assigned_by), active = 1,
                                 is_primary = VALUES(is_primary), assigned_at = CURRENT_TIMESTAMP`,
        [staffId, roleKey, assignedBy, roleKey === roleKeys[0] ? 1 : 0]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await logActivity(req.user?.id || null, 'staff_roles_updated', `Updated staff ${staffId} roles to ${roleKeys.join(', ')}`, req.ip);
  return res.json({ success: true, staffId, roles: roleKeys });
}

async function updateStaffStatus(req, res) {
  const staffId = Number(req.params.staffId);
  const active = req.body?.active;
  if (!Number.isInteger(staffId) || staffId <= 0 || typeof active !== 'boolean') {
    return res.status(400).json({ success: false, message: 'A valid staff account and active status are required' });
  }
  if (staffId === Number(req.user?.id) && !active) {
    return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
  }
  const result = await query(
    `UPDATE students SET active = ?
     WHERE id = ? AND (role <> 'student' OR staff_number IS NOT NULL)`,
    [active ? 1 : 0, staffId]
  );
  if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Staff account not found' });
  await logActivity(req.user?.id || null, active ? 'staff_activated' : 'staff_deactivated', `Changed staff ${staffId} active status to ${active}`, req.ip);
  return res.json({ success: true, staffId, active });
}

module.exports = { createStaff, getAppointments, listStaff, updateStaffRoles, updateStaffStatus };
