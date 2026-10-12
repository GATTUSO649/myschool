const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { publicStudent } = require('./authController');
const { logActivity } = require('./logController');
const { getNextAdmissionAssignment } = require('./admissionAllocator');
const { schoolEmail } = require('./emailUtils');

async function listStudents(req, res) {
  let query_str = `SELECT id, name, username, email, admission_number AS admissionNumber, role,
            class_name AS className, stream, phone, guardian_name AS guardianName,
            guardian_phone AS guardianPhone, avatar, active, last_login, created_at
     FROM students`;
  
  const queryParams = [];
  const classFilter = String(req.query.class_name || req.query.className || req.query.form || '').trim();

  if (classFilter) {
    const normalized = classFilter.replace(/\s+/g, ' ').trim();
    const formSectionMatch = normalized.match(/^([1-4])([A-D])$/i);
    const formLabelMatch = normalized.match(/^Form\s*([1-4])([A-D])?$/i);
    const formNumberMatch = normalized.match(/^([1-4])$/);

    if (formSectionMatch) {
      const formName = `Form ${formSectionMatch[1].toUpperCase()}${formSectionMatch[2].toUpperCase()}`;
      query_str += ' WHERE class_name = ?';
      queryParams.push(formName);
    } else if (formLabelMatch && formLabelMatch[2]) {
      const formName = `Form ${formLabelMatch[1]}${formLabelMatch[2].toUpperCase()}`;
      query_str += ' WHERE class_name = ?';
      queryParams.push(formName);
    } else if (formLabelMatch) {
      const formName = `Form ${formLabelMatch[1]}`;
      query_str += ' WHERE class_name = ? OR class_name LIKE ?';
      queryParams.push(formName, `${formName}%`);
    } else if (formNumberMatch) {
      const formName = `Form ${formNumberMatch[1]}`;
      query_str += ' WHERE class_name = ? OR class_name LIKE ?';
      queryParams.push(formName, `${formName}%`);
    } else {
      query_str += ' WHERE class_name = ?';
      queryParams.push(normalized);
    }
  }

  query_str += ` ORDER BY created_at DESC`;
  
  const rows = await query(query_str, queryParams);
  res.json(rows.map(row => ({ ...row, active: Boolean(row.active) })));
}

async function createStudent(req, res) {
  try {
    const body = req.body;
    const name = body.name || body.username;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
    const role = body.role || 'student';
    const assignment = role === 'student' && !(body.admissionNumber || body.admission_number)
      ? await getNextAdmissionAssignment()
      : {
          admissionNumber: body.admissionNumber || body.admission_number || null,
          stream: body.stream || null
        };
    const password = body.password || assignment.admissionNumber || 'password123';
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO students
       (name, username, email, admission_number, password_hash, role, class_name, stream, phone, guardian_name, guardian_phone, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        name,
        body.username || null,
        role === 'student' ? schoolEmail(body.email, assignment.admissionNumber || name) : (body.email || null),
        assignment.admissionNumber,
        passwordHash,
        role,
        body.className || body.class_name || null,
        assignment.stream,
        body.phone || null,
        body.guardianName || body.guardian_name || null,
        body.guardianPhone || body.guardian_phone || null
      ]
    );

    await logActivity(req.user?.id, 'student_created', `Created student #${result.insertId}`, req.ip);
    res.status(201).json({
      success: true,
      id: result.insertId,
      admissionNumber: assignment.admissionNumber,
      stream: assignment.stream
    });
  } catch (error) {
    console.error('Create student error:', error);
    res.status(500).json({ success: false, message: 'Could not create student' });
  }
}

async function updateStudent(req, res) {
  const body = req.body;
  await query(
    `UPDATE students
     SET name = ?, email = ?, admission_number = ?, class_name = ?, stream = ?,
         phone = ?, guardian_name = ?, guardian_phone = ?, role = ?
     WHERE id = ?`,
    [
      body.name || null,
      (body.role || 'student') === 'student' ? schoolEmail(body.email, body.admissionNumber || body.admission_number || body.name) : (body.email || null),
      body.admissionNumber || body.admission_number || null,
      body.className || body.class_name || null,
      body.stream || null,
      body.phone || null,
      body.guardianName || body.guardian_name || null,
      body.guardianPhone || body.guardian_phone || null,
      body.role || 'student',
      req.params.id
    ]
  );
  await logActivity(req.user.id, 'student_updated', `Updated student #${req.params.id}`, req.ip);
  res.json({ success: true });
}

async function updateRole(req, res) {
  await query('UPDATE students SET role = ? WHERE id = ?', [req.body.role, req.params.id]);
  await logActivity(req.user.id, 'role_updated', `Updated student #${req.params.id} role to ${req.body.role}`, req.ip);
  res.json({ success: true });
}

async function deactivateStudent(req, res) {
  await query('UPDATE students SET active = 0 WHERE id = ?', [req.params.id]);
  await logActivity(req.user.id, 'student_deactivated', `Deactivated student #${req.params.id}`, req.ip);
  res.json({ success: true });
}

async function profile(req, res) {
  res.json({ success: true, student: publicStudent(req.user) });
}

async function updateMyProfile(req, res) {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const dateOfBirth = String(req.body?.dateOfBirth || '').trim();

    if (!name || name.length > 150) {
      return res.status(400).json({ success: false, message: 'Name is required and must be 150 characters or fewer.' });
    }
    if (email && (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    if (phone.length > 40) {
      return res.status(400).json({ success: false, message: 'Phone number must be 40 characters or fewer.' });
    }
    if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      return res.status(400).json({ success: false, message: 'Enter a valid date of birth.' });
    }
    if (dateOfBirth) {
      const parsedDate = new Date(`${dateOfBirth}T00:00:00Z`);
      if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dateOfBirth) {
        return res.status(400).json({ success: false, message: 'Enter a valid date of birth.' });
      }
    }

    if (email) {
      const existingRows = await query(
        'SELECT id FROM students WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1',
        [email, req.user.id]
      );
      if (existingRows.length) {
        return res.status(409).json({ success: false, message: 'That email address is already in use.' });
      }
    }

    await query(
      'UPDATE students SET name = ?, email = ?, phone = ?, date_of_birth = ? WHERE id = ? AND active = 1',
      [name, email || null, phone || null, dateOfBirth || null, req.user.id]
    );
    await logActivity(req.user.id, 'profile_updated', 'Updated account profile details', req.ip);
    const rows = await query('SELECT * FROM students WHERE id = ? AND active = 1 LIMIT 1', [req.user.id]);
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }
    return res.json({ success: true, student: publicStudent(rows[0]) });
  } catch (error) {
    console.error('Update own profile error:', error);
    return res.status(500).json({ success: false, message: 'Could not save profile changes.' });
  }
}

async function studentFormStreamCounts(req, res) {
  try {
    const rows = await query(
      `SELECT class_name AS className, stream, COUNT(*) AS studentCount
       FROM students
       WHERE class_name IN ('Form 1','Form 2','Form 3','Form 4','Form1','Form2','Form3','Form4')
       GROUP BY class_name, stream
       ORDER BY class_name, stream`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching form stream counts:', err);
    res.status(500).json({ success: false, message: 'Could not fetch chart data' });
  }
}

module.exports = {
  listStudents,
  createStudent,
  updateStudent,
  updateRole,
  deactivateStudent,
  profile,
  updateMyProfile,
  studentFormStreamCounts
};
