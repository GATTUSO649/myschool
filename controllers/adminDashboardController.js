const { query } = require('../config/db');
const bcrypt = require('bcryptjs');

async function getStats(req, res) {
  try {
    const [studentsRows] = await query('SELECT COUNT(*) AS count FROM students WHERE active = 1');
    const [classesRows] = await query('SELECT COUNT(*) AS count FROM classes WHERE active = 1');
    const [applicationsRows] = await query('SELECT COUNT(*) AS count FROM applications');
    const [resultsRows] = await query('SELECT COUNT(*) AS count FROM results');

    res.json({
      success: true,
      stats: {
        totalStudents: Number(studentsRows[0]?.count || 0),
        totalClasses: Number(classesRows[0]?.count || 0),
        totalApplications: Number(applicationsRows[0]?.count || 0),
        totalResults: Number(resultsRows[0]?.count || 0)
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
      SELECT id, name, username, email, admission_number AS admissionNumber, role, class_name AS className,
        stream, phone, guardian_name AS guardianName, guardian_phone AS guardianPhone, active, last_login AS lastLogin
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
    const admissionNumber = (body.admissionNumber || body.admission_number || '').trim().toUpperCase();

    if (!name || !username || !admissionNumber) {
      return res.status(400).json({ success: false, message: 'Name, username, and admission number are required' });
    }

    const existing = await query('SELECT id FROM students WHERE username = ? OR admission_number = ? LIMIT 1', [username, admissionNumber]);
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'A student with that username or admission number already exists' });
    }

    const password = (body.password || admissionNumber || 'student123').trim();
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO students (name, username, email, admission_number, password_hash, role, class_name, stream, phone, guardian_name, guardian_phone, active)
       VALUES (?, ?, ?, ?, ?, 'student', ?, ?, ?, ?, ?, 1)`,
      [name, username, body.email || null, admissionNumber, passwordHash, body.className || body.class_name || null, body.stream || null, body.phone || null, body.guardianName || body.guardian_name || null, body.guardianPhone || body.guardian_phone || null]
    );

    res.status(201).json({ success: true, message: 'Student registered successfully', studentId: result.insertId, admissionNumber, password });
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

module.exports = {
  getStats,
  getStudents,
  createStudent,
  deactivateStudent
};
