const { query, database } = require('../config/db');
const bcrypt = require('bcryptjs');
const { getNextAdmissionAssignment, getNextStaffAssignment } = require('./admissionAllocator');

const EDITABLE_TABLES = new Set([
  'students',
  'applications',
  'notes',
  'revision_materials',
  'assignments',
  'fee_charges',
  'fee_payments',
  'finance_documents',
  'academic_documents',
  'calendar_events',
  'results',
  'exams'
]);

async function getStats(req, res) {
  try {
    const [studentsRows] = await query('SELECT COUNT(*) AS count FROM students WHERE active = 1');
    const [classesRows] = await query('SELECT COUNT(*) AS count FROM classes WHERE active = 1');
    const [applicationsRows] = await query('SELECT COUNT(*) AS count FROM applications');
    const [pendingAppsRows] = await query("SELECT COUNT(*) AS count FROM applications WHERE status = 'pending'");
    const [approvedAppsRows] = await query("SELECT COUNT(*) AS count FROM applications WHERE status = 'approved'");
    const [rejectedAppsRows] = await query("SELECT COUNT(*) AS count FROM applications WHERE status = 'rejected'");
    const [resultsRows] = await query('SELECT COUNT(*) AS count FROM results');
    const [chargedRows] = await query('SELECT COALESCE(SUM(amount), 0) AS totalCharged FROM fee_charges');
    const [paidRows] = await query('SELECT COALESCE(SUM(amount), 0) AS totalPaid FROM fee_payments');
    const formPaymentRows = await query(`
      SELECT s.class_name AS className,
             COUNT(DISTINCT s.id) AS studentCount,
             COALESCE(SUM(fp.amount), 0) AS paidAmount
      FROM students s
      LEFT JOIN fee_payments fp ON fp.student_id = s.id
      WHERE s.active = 1
      GROUP BY s.class_name
      ORDER BY CASE s.class_name
        WHEN 'Form 1' THEN 1
        WHEN 'Form 2' THEN 2
        WHEN 'Form 3' THEN 3
        WHEN 'Form 4' THEN 4
        ELSE 5
      END, s.class_name
    `);
    const classAverageRows = await query(`
      SELECT s.class_name AS className, AVG(r.score) AS average
      FROM results r
      JOIN students s ON s.id = r.student_id
      WHERE s.class_name IN ('Form 1', 'Form 2', 'Form 3', 'Form 4')
      GROUP BY s.class_name
      ORDER BY s.class_name
    `);

    const formPaymentSummary = (formPaymentRows || []).map((row) => ({
      className: row.className || 'Unassigned',
      studentCount: Number(row.studentCount || 0),
      paidAmount: Number(row.paidAmount || 0)
    }));

    const formAverages = (classAverageRows || []).map((row) => ({
      className: row.className || 'Class',
      average: Number(row.average || 0)
    }));

    res.json({
      success: true,
      stats: {
        totalStudents: Number(studentsRows[0]?.count || 0),
        totalClasses: Number(classesRows[0]?.count || 0),
        totalApplications: Number(applicationsRows[0]?.count || 0),
        totalResults: Number(resultsRows[0]?.count || 0),
        totalCharged: Number(chargedRows[0]?.totalCharged || 0),
        totalPaid: Number(paidRows[0]?.totalPaid || 0),
        applicationCounts: {
          pending: Number(pendingAppsRows[0]?.count || 0),
          approved: Number(approvedAppsRows[0]?.count || 0),
          rejected: Number(rejectedAppsRows[0]?.count || 0)
        },
        formPaymentSummary,
        formAverages
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ success: false, message: 'Could not load admin statistics' });
  }
}

async function getStudents(req, res) {
  try {
    const rows = await query(`
      SELECT id, name, username, email, admission_number AS admissionNumber, role, subject,
        class_name AS className, stream, phone, guardian_name AS guardianName,
        guardian_phone AS guardianPhone, active, last_login AS lastLogin
      FROM students
      ORDER BY created_at DESC
    `);

    res.json({ success: true, students: rows.map((row) => ({ ...row, active: Boolean(row.active) })) });
  } catch (error) {
    console.error('Admin students error:', error);
    res.status(500).json({ success: false, message: 'Could not load students' });
  }
}

async function createStudent(req, res) {
  try {
    const body = req.body || {};
    const name = (body.name || body.username || '').trim();
    const username = (body.username || body.email || '').trim();
    const role = (body.role || 'student').trim();
    let admissionNumber = (body.admissionNumber || body.admission_number || '').trim().toUpperCase();
    const subject = (body.subject || '').trim() || null;

    if (!name || !username) {
      return res.status(400).json({ success: false, message: 'Name and username are required' });
    }

    if (role === 'lecturer' && !subject) {
      return res.status(400).json({ success: false, message: 'Lecturer subject is required' });
    }

    if (!admissionNumber) {
      if (role === 'student') {
        const assignment = await getNextAdmissionAssignment();
        admissionNumber = assignment.admissionNumber;
      } else if (role === 'lecturer') {
        const assignment = await getNextStaffAssignment();
        admissionNumber = assignment.admissionNumber;
      }
    }

    const existing = await query('SELECT id FROM students WHERE username = ? OR admission_number = ? LIMIT 1', [username, admissionNumber]);
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'A student with that username or admission number already exists' });
    }

    const password = (body.password || admissionNumber || 'student123').trim();
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO students (name, username, email, admission_number, password_hash, role, subject, class_name, stream, phone, guardian_name, guardian_phone, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        name,
        username,
        body.email || null,
        admissionNumber,
        passwordHash,
        role,
        subject,
        body.className || body.class_name || null,
        body.stream || null,
        body.phone || null,
        body.guardianName || body.guardian_name || null,
        body.guardianPhone || body.guardian_phone || null
      ]
    );

    res.status(201).json({ success: true, message: `${role === 'lecturer' ? 'Lecturer' : 'Student'} registered successfully`, studentId: result.insertId, admissionNumber, password });
  } catch (error) {
    console.error('Create student error:', error);
    res.status(500).json({ success: false, message: 'Could not create student' });
  }
}

async function deactivateStudent(req, res) {
  try {
    const studentId = req.params.studentId;
    await query('UPDATE students SET active = 0 WHERE id = ?', [studentId]);
    res.json({ success: true, message: 'Student account deactivated' });
  } catch (error) {
    console.error('Deactivate student error:', error);
    res.status(500).json({ success: false, message: 'Could not deactivate student' });
  }
}

async function getSettings(req, res) {
  const rows = await query('SELECT setting_key AS settingKey, setting_value AS settingValue FROM app_settings');
  const settings = rows.reduce((acc, row) => {
    acc[row.settingKey] = row.settingValue;
    return acc;
  }, {});
  res.json({
    success: true,
    settings: {
      schoolName: settings.schoolName || 'Cresent High School',
      academicYear: settings.academicYear || String(new Date().getFullYear()),
      currentTerm: settings.currentTerm || 'Term 1',
      systemTheme: settings.systemTheme || 'Modern Blue',
      maintenanceMode: settings.maintenanceMode === 'true'
    }
  });
}

async function saveSettings(req, res) {
  const body = req.body || {};
  const settings = {
    schoolName: body.schoolName || 'Cresent High School',
    academicYear: body.academicYear || String(new Date().getFullYear()),
    currentTerm: body.currentTerm || 'Term 1',
    systemTheme: body.systemTheme || 'Modern Blue',
    maintenanceMode: body.maintenanceMode ? 'true' : 'false'
  };

  for (const [key, value] of Object.entries(settings)) {
    await query(
      `INSERT INTO app_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, String(value)]
    );
  }

  res.json({ success: true, message: 'Settings saved', settings: { ...settings, maintenanceMode: settings.maintenanceMode === 'true' } });
}

async function getPublicSettings(req, res) {
  const rows = await query("SELECT setting_value AS settingValue FROM app_settings WHERE setting_key = 'maintenanceMode' LIMIT 1");
  res.json({ success: true, maintenanceMode: rows[0]?.settingValue === 'true' });
}

async function getDatabaseOverview(req, res) {
  const tables = await query(
    `SELECT TABLE_NAME AS tableName, TABLE_ROWS AS approxRows, CREATE_TIME AS createdAt, UPDATE_TIME AS updatedAt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME`,
    [database]
  );
  res.json({ success: true, database, tables });
}

async function getDatabaseTable(req, res) {
  const tableName = String(req.params.tableName || '').replace(/`/g, '');
  const exists = await query(
    `SELECT TABLE_NAME AS tableName
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     LIMIT 1`,
    [database, tableName]
  );

  if (!exists.length) {
    return res.status(404).json({ success: false, message: 'Table not found' });
  }

  const columns = await query(
    `SELECT COLUMN_NAME AS columnName, DATA_TYPE AS dataType, IS_NULLABLE AS nullable, COLUMN_KEY AS columnKey
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [database, tableName]
  );
  const rows = await query(`SELECT * FROM \`${tableName}\` LIMIT 50`);
  res.json({ success: true, tableName, columns, rows, editable: EDITABLE_TABLES.has(tableName) });
}

function assertSafeTable(tableName) {
  const clean = String(tableName || '').trim();
  if (!EDITABLE_TABLES.has(clean)) {
    const error = new Error('This table is view-only in the admin editor.');
    error.status = 403;
    throw error;
  }
  return clean;
}

async function getTableColumns(tableName) {
  return query(
    `SELECT COLUMN_NAME AS columnName, IS_NULLABLE AS nullable, COLUMN_KEY AS columnKey, EXTRA AS extraInfo
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [database, tableName]
  );
}

function filterWritableValues(columns, values, { includePrimary = false } = {}) {
  const columnMap = new Map(columns.map((column) => [column.columnName, column]));
  const entries = Object.entries(values || {}).filter(([key, value]) => {
    const column = columnMap.get(key);
    if (!column) return false;
    if (!includePrimary && column.columnKey === 'PRI') return false;
    if (String(column.extraInfo || '').toLowerCase().includes('auto_increment')) return false;
    return value !== undefined;
  });
  return entries;
}

async function createDatabaseRecord(req, res) {
  try {
    const tableName = assertSafeTable(req.params.tableName);
    const columns = await getTableColumns(tableName);
    const entries = filterWritableValues(columns, req.body || {}).filter(([, value]) => value !== '');
    if (!entries.length) return res.status(400).json({ success: false, message: 'No editable values were provided.' });

    const fields = entries.map(([key]) => `\`${key}\``).join(', ');
    const placeholders = entries.map(() => '?').join(', ');
    const values = entries.map(([, value]) => value === '' ? null : value);
    const result = await query(`INSERT INTO \`${tableName}\` (${fields}) VALUES (${placeholders})`, values);
    res.status(201).json({ success: true, id: result.insertId, message: 'Record created successfully' });
  } catch (error) {
    console.error('Database create error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Could not create record' });
  }
}

async function updateDatabaseRecord(req, res) {
  try {
    const tableName = assertSafeTable(req.params.tableName);
    const id = req.params.id;
    const columns = await getTableColumns(tableName);
    const entries = filterWritableValues(columns, req.body || {});
    if (!entries.length) return res.status(400).json({ success: false, message: 'No editable values were provided.' });

    const sets = entries.map(([key]) => `\`${key}\` = ?`).join(', ');
    const values = entries.map(([, value]) => value === '' ? null : value);
    await query(`UPDATE \`${tableName}\` SET ${sets} WHERE id = ? LIMIT 1`, [...values, id]);
    res.json({ success: true, message: 'Record updated successfully' });
  } catch (error) {
    console.error('Database update error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Could not update record' });
  }
}

async function deleteDatabaseRecord(req, res) {
  try {
    const tableName = assertSafeTable(req.params.tableName);
    await query(`DELETE FROM \`${tableName}\` WHERE id = ? LIMIT 1`, [req.params.id]);
    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Database delete error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Could not delete record' });
  }
}

async function runDatabaseQuery(req, res) {
  const sql = String(req.body?.sql || '').trim();
  if (!sql) {
    return res.status(400).json({ success: false, message: 'Enter a query first' });
  }

  const allowed = /^(select|show|describe|desc)\b/i.test(sql);
  const singleStatement = !sql.replace(/;$/, '').includes(';');
  if (!allowed || !singleStatement) {
    return res.status(400).json({ success: false, message: 'Only one read-only SELECT, SHOW, or DESCRIBE query is allowed here.' });
  }

  const rows = await query(sql);
  res.json({ success: true, rows: Array.isArray(rows) ? rows.slice(0, 200) : rows });
}

module.exports = {
  getStats,
  getStudents,
  createStudent,
  deactivateStudent,
  getSettings,
  saveSettings,
  getPublicSettings,
  getDatabaseOverview,
  getDatabaseTable,
  runDatabaseQuery,
  createDatabaseRecord,
  updateDatabaseRecord,
  deleteDatabaseRecord
};
