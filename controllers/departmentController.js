const { getPool, query } = require('../config/db');
const bcrypt = require('bcryptjs');
const { logActivity } = require('./logController');

function clean(value) {
  return String(value || '').trim();
}

async function listDepartments(req, res) {
  const departments = await query(`
    SELECT d.id, d.name, d.code, d.description, d.active, d.created_at AS createdAt,
           d.updated_at AS updatedAt, s.id AS hodId, s.name AS hodName,
           (SELECT COUNT(*) FROM department_staff ds WHERE ds.department_id = d.id) AS staffCount,
           (SELECT COUNT(*) FROM department_subjects sub WHERE sub.department_id = d.id AND sub.active = 1) AS subjectCount
    FROM departments d
    LEFT JOIN students s ON s.id = d.hod_staff_id
    ORDER BY d.name
  `);
  res.json({ success: true, departments });
}

async function createDepartment(req, res) {
  const name = clean(req.body?.name);
  const code = clean(req.body?.code).toUpperCase();
  const description = clean(req.body?.description) || null;
  if (!name || !code) return res.status(400).json({ success: false, message: 'Department name and code are required' });

  try {
    const result = await query('INSERT INTO departments (name, code, description) VALUES (?, ?, ?)', [name, code, description]);
    await logActivity(req.user.id, 'department_created', `Created department ${code}`, req.ip);
    res.status(201).json({ success: true, department: { id: result.insertId, name, code, description, active: true } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'A department with that name or code already exists' });
    throw error;
  }
}

async function updateDepartment(req, res) {
  const id = Number(req.params.id);
  const name = clean(req.body?.name);
  const code = clean(req.body?.code).toUpperCase();
  const description = clean(req.body?.description) || null;
  const active = req.body?.active === undefined ? 1 : (req.body.active ? 1 : 0);
  if (!id || !name || !code) return res.status(400).json({ success: false, message: 'Department id, name, and code are required' });
  try {
    await query('UPDATE departments SET name = ?, code = ?, description = ?, active = ? WHERE id = ?', [name, code, description, active, id]);
    await logActivity(req.user.id, 'department_updated', `Updated department ${code}`, req.ip);
    res.json({ success: true, message: 'Department updated' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'A department with that name or code already exists' });
    throw error;
  }
}

async function listSubjects(req, res) {
  const departments = await query(`
    SELECT sub.id, sub.name, sub.code, sub.active, sub.department_id AS departmentId,
           d.name AS departmentName, d.code AS departmentCode
    FROM department_subjects sub
    JOIN departments d ON d.id = sub.department_id
    ORDER BY d.name, sub.name
  `);
  res.json({ success: true, subjects: departments });
}

async function createSubject(req, res) {
  const departmentId = Number(req.body?.departmentId);
  const name = clean(req.body?.name);
  const code = clean(req.body?.code).toUpperCase();
  if (!departmentId || !name || !code) return res.status(400).json({ success: false, message: 'Department, subject name, and code are required' });
  try {
    const result = await query('INSERT INTO department_subjects (department_id, name, code) VALUES (?, ?, ?)', [departmentId, name, code]);
    await logActivity(req.user.id, 'department_subject_created', `Created subject ${code}`, req.ip);
    res.status(201).json({ success: true, subject: { id: result.insertId, departmentId, name, code, active: true } });
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(404).json({ success: false, message: 'Department not found' });
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'That subject already exists in the department' });
    throw error;
  }
}

async function assignHod(req, res) {
  const departmentId = Number(req.params.id);
  const staffId = Number(req.body?.staffId);
  if (!departmentId || !staffId) return res.status(400).json({ success: false, message: 'Department and staff member are required' });
  const staff = await query(
    `SELECT s.id
     FROM students s
     LEFT JOIN user_roles ur ON ur.user_id = s.id AND ur.role_key = 'teacher' AND ur.active = 1
     WHERE s.id = ? AND s.active = 1
       AND (ur.user_id IS NOT NULL
         OR (LOWER(s.role) IN ('lecturer', 'teacher')
           AND NOT EXISTS (SELECT 1 FROM user_roles any_role WHERE any_role.user_id = s.id)))
     LIMIT 1`,
    [staffId]
  );
  if (!staff.length) return res.status(404).json({ success: false, message: 'Active teacher not found' });
  const departmentRows = await query('SELECT code FROM departments WHERE id = ? AND active = 1 LIMIT 1', [departmentId]);
  if (!departmentRows.length) return res.status(404).json({ success: false, message: 'Active department not found' });
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('UPDATE departments SET hod_staff_id = ? WHERE id = ?', [staffId, departmentId]);
    await connection.execute('INSERT IGNORE INTO department_staff (department_id, staff_id) VALUES (?, ?)', [departmentId, staffId]);
    await connection.execute(
      `INSERT INTO user_roles (user_id, role_key, assigned_by, active, is_primary)
       VALUES (?, 'department_head', ?, 1, 0)
       ON DUPLICATE KEY UPDATE assigned_by = VALUES(assigned_by), active = 1,
                               is_primary = IF(is_primary = 1, 1, 0), assigned_at = CURRENT_TIMESTAMP`,
      [staffId, Number(req.user?.id) > 0 ? Number(req.user.id) : null]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await logActivity(req.user.id, 'department_hod_assigned', `Assigned staff ${staffId} as HOD for department ${departmentRows[0]?.code || departmentId}`, req.ip);
  res.json({ success: true, message: 'HOD assigned' });
}

async function createDepartmentAccount(req, res) {
  const departmentId = Number(req.body?.departmentId);
  const name = clean(req.body?.name);
  const email = clean(req.body?.email).toLowerCase();
  const phone = clean(req.body?.phone) || null;
  if (!departmentId || !name || !email) return res.status(400).json({ success: false, message: 'Name, email, phone, and department are required' });

  const departments = await query('SELECT id, code, name FROM departments WHERE id = ? AND active = 1 LIMIT 1', [departmentId]);
  const department = departments[0];
  if (!department) return res.status(404).json({ success: false, message: 'Active department not found' });

  const nextRows = await query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(staff_number, '/', 3), '/', -1) AS UNSIGNED)), 0) + 1 AS nextNumber
     FROM students WHERE staff_number LIKE ?`,
    [`${department.code}/%`]
  );
  const staffNumber = `${department.code}/STAFF/${String(nextRows[0]?.nextNumber || 1).padStart(4, '0')}`;
  const passwordHash = await bcrypt.hash(staffNumber, 12);
  try {
    const result = await query(
      `INSERT INTO students (name, username, email, password_hash, role, staff_number, phone, active, must_change_password)
       VALUES (?, ?, ?, ?, 'teacher', ?, ?, 1, 1)`,
      [name, staffNumber, email, passwordHash, staffNumber, phone]
    );
    await query('INSERT INTO department_staff (department_id, staff_id) VALUES (?, ?)', [departmentId, result.insertId]);
    await logActivity(req.user.id, 'department_account_created', `Created ${staffNumber} for ${department.code}`, req.ip);
    res.status(201).json({ success: true, account: { id: result.insertId, name, email, phone, username: staffNumber, staffNumber, departmentId, departmentName: department.name, initialPasswordPolicy: 'Staff number; change it after first login' } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'That email or generated staff number is already in use' });
    throw error;
  }
}

async function portal(req, res) {
  const departmentId = Number(req.params.id);
  if (!departmentId) return res.status(400).json({ success: false, message: 'Department id is required' });

  const departments = await query(`
    SELECT d.id, d.name, d.code, d.description, d.active, d.hod_staff_id AS hodId,
           hod.name AS hodName
    FROM departments d
    LEFT JOIN students hod ON hod.id = d.hod_staff_id
    WHERE d.id = ? AND d.active = 1
    LIMIT 1
  `, [departmentId]);
  const department = departments[0];
  if (!department) return res.status(404).json({ success: false, message: 'Department not found' });

  const assignedRoles = Array.isArray(req.user?.roleKeys) ? req.user.roleKeys : [];
  const isAdmin = req.user?.role === 'admin'
    || assignedRoles.some((role) => ['school_admin', 'system_admin'].includes(role));
  const isHod = Number(department.hodId) === Number(req.user.id);
  const membership = await query(
    'SELECT 1 FROM department_staff WHERE department_id = ? AND staff_id = ? LIMIT 1',
    [departmentId, req.user.id]
  );
  if (!isAdmin && !isHod && !membership.length) {
    return res.status(403).json({ success: false, message: 'You are not assigned to this department' });
  }

  const canViewDepartmentWide = isAdmin || isHod;
  const subjects = canViewDepartmentWide
    ? await query(
      `SELECT id, name, code, active FROM department_subjects
       WHERE department_id = ? AND active = 1 ORDER BY name`,
      [departmentId]
    )
    : await query(
      `SELECT DISTINCT sub.id, sub.name, sub.code, sub.active
       FROM department_subjects sub
       JOIN teacher_assignments ta ON ta.subject = sub.name AND ta.active = 1
       WHERE sub.department_id = ? AND sub.active = 1 AND ta.teacher_id = ?
       ORDER BY sub.name`,
      [departmentId, req.user.id]
    );
  const subjectNames = subjects.map((subject) => subject.name);
  const subjectPlaceholders = subjectNames.map(() => '?').join(',');
  const assignmentFilter = subjectNames.length
    ? `WHERE ta.subject IN (${subjectPlaceholders}) AND ta.active = 1${canViewDepartmentWide ? '' : ' AND ta.teacher_id = ?'}`
    : 'WHERE 1 = 0';
  const assignmentParams = canViewDepartmentWide ? subjectNames : [...subjectNames, req.user.id];
  const assignments = subjectNames.length ? await query(
    `SELECT DISTINCT ta.teacher_id AS teacherId, ta.class_name AS className, ta.subject, ta.academic_year AS academicYear
     FROM teacher_assignments ta ${assignmentFilter} ORDER BY ta.subject, ta.class_name`,
    assignmentParams
  ) : [];
  const memberTeachers = canViewDepartmentWide
    ? await query(
      `SELECT DISTINCT s.id, s.name, s.staff_number AS staffNumber, s.email, s.phone, s.active
       FROM students s
       JOIN department_staff ds ON ds.staff_id = s.id
       WHERE ds.department_id = ? AND s.active = 1 AND s.role IN ('teacher', 'lecturer')
       ORDER BY s.name`,
      [departmentId]
    )
    : [];
  const teacherIds = [...new Set([...memberTeachers.map((teacher) => teacher.id), ...assignments.map((item) => item.teacherId)])];
  const teacherPlaceholders = teacherIds.map(() => '?').join(',');
  const teachers = teacherIds.length ? await query(
    `SELECT DISTINCT s.id, s.name, s.staff_number AS staffNumber, s.email, s.phone, s.active
     FROM students s WHERE s.id IN (${teacherPlaceholders}) ORDER BY s.name`, teacherIds
  ) : [];
  const classes = assignments.length ? await query(
    `SELECT DISTINCT ta.class_name AS className, COUNT(DISTINCT s.id) AS studentCount
     FROM teacher_assignments ta
     LEFT JOIN students s ON s.class_name = ta.class_name AND s.role = 'student' AND s.active = 1
     ${assignmentFilter}
     GROUP BY ta.class_name ORDER BY ta.class_name`,
    assignmentParams
  ) : [];
  const students = classes.length ? await query(
    `SELECT DISTINCT s.id, s.name, s.admission_number AS admissionNumber, s.class_name AS className, s.stream
     FROM students s JOIN teacher_assignments ta ON ta.class_name = s.class_name
     WHERE s.role = 'student' AND s.active = 1 AND ta.subject IN (${subjectPlaceholders}) AND ta.active = 1
       ${canViewDepartmentWide ? '' : 'AND ta.teacher_id = ?'}
     ORDER BY s.class_name, s.name`,
    assignmentParams
  ) : [];
  const performance = subjectNames.length ? await query(
    `SELECT r.subject, AVG(r.score) AS average, COUNT(*) AS resultCount
     FROM results r
     JOIN students s ON s.id = r.student_id AND s.active = 1
     ${canViewDepartmentWide ? '' : 'JOIN teacher_assignments ta ON ta.subject = r.subject AND ta.class_name = s.class_name AND ta.teacher_id = ? AND ta.active = 1'}
     WHERE r.subject IN (${subjectPlaceholders})
     GROUP BY r.subject ORDER BY r.subject`,
    canViewDepartmentWide ? subjectNames : [req.user.id, ...subjectNames]
  ) : [];
  const activity = canViewDepartmentWide ? await query(
    `SELECT al.action, al.details, al.created_at AS createdAt, s.name AS userName
     FROM activity_logs al LEFT JOIN students s ON s.id = al.user_id
     WHERE al.details LIKE ?
     ORDER BY al.created_at DESC LIMIT 15`,
    [`%${department.code}%`]
  ) : [];

  res.json({ success: true, department, isHod, subjects, teachers, assignments, classes, students, performance, activity });
}

module.exports = { listDepartments, createDepartment, updateDepartment, listSubjects, createSubject, assignHod, createDepartmentAccount, portal };