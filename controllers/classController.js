const { query } = require('../config/db');

async function listClasses(req, res) {
  try {
    const { form, academicYear } = req.query;
    let sql = 'SELECT * FROM classes WHERE active = 1';
    const params = [];
    if (form) {
      sql += ' AND form = ?';
      params.push(form);
    }
    if (academicYear) {
      sql += ' AND academic_year = ?';
      params.push(academicYear);
    }
    sql += ' ORDER BY form, name';
    const classes = await query(sql, params);
    res.json({ success: true, data: classes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getClassDetails(req, res) {
  try {
    const { classId } = req.params;
    const classData = await query('SELECT * FROM classes WHERE id = ?', [classId]);
    if (!classData.length) return res.status(404).json({ success: false, error: 'Class not found' });

    const students = await query(
      `SELECT s.*, ce.stream_name, ce.status FROM class_enrollment ce
       JOIN students s ON ce.student_id = s.id WHERE ce.class_id = ? AND ce.status = 'active'`,
      [classId]
    );

    res.json({ success: true, data: { ...classData[0], students } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function enrollStudent(req, res) {
  try {
    const { studentId, classId, streamName } = req.body;
    if (!studentId || !classId) {
      return res.status(400).json({ success: false, error: 'Missing studentId or classId' });
    }

    await query(
      `INSERT INTO class_enrollment (student_id, class_id, stream_name, enrollment_date, status)
       VALUES (?, ?, ?, NOW(), 'active') ON DUPLICATE KEY UPDATE status = 'active'`,
      [studentId, classId, streamName || null]
    );

    await query('UPDATE students SET class_name = (SELECT name FROM classes WHERE id = ?) WHERE id = ?', [classId, studentId]);

    res.json({ success: true, message: 'Student enrolled successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getStudentsInClass(req, res) {
  try {
    const { classId } = req.params;
    const { form } = req.query;
    let sql = `SELECT s.*, ce.stream_name, ce.status, ce.enrollment_date
               FROM class_enrollment ce
               JOIN students s ON ce.student_id = s.id
               WHERE ce.class_id = ?`;
    const params = [classId];

    if (form) {
      sql = `SELECT s.*, c.form, c.name as class_name, ce.stream_name, ce.status, ce.enrollment_date
             FROM class_enrollment ce
             JOIN students s ON ce.student_id = s.id
             JOIN classes c ON ce.class_id = c.id
             WHERE c.form = ? ORDER BY c.name, s.name`;
      params[0] = form;
    }

    const students = await query(sql, params);
    res.json({ success: true, data: students });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getCoursesByForm(req, res) {
  try {
    const { form, stream } = req.query;
    let sql = 'SELECT * FROM courses WHERE form = ? AND active = 1';
    const params = [form];

    if (stream) {
      sql += ' AND (stream_requirement IS NULL OR stream_requirement = ?)';
      params.push(stream);
    }
    sql += ' ORDER BY code';

    const courses = await query(sql, params);
    res.json({ success: true, data: courses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getFormSummary(req, res) {
  try {
    const currentYear = new Date().getFullYear();
    const summary = {};

    for (let form = 1; form <= 4; form++) {
      const classCount = await query(
        'SELECT COUNT(*) as count FROM classes WHERE form = ? AND academic_year = ?',
        [form, currentYear]
      );

      const studentCount = await query(
        `SELECT COUNT(*) as count FROM class_enrollment ce
         JOIN classes c ON ce.class_id = c.id
         WHERE c.form = ? AND c.academic_year = ? AND ce.status = 'active'`,
        [form, currentYear]
      );

      summary[`Form${form}`] = {
        form,
        classCount: classCount[0].count,
        studentCount: studentCount[0].count
      };
    }

    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function addCourse(req, res) {
  try {
    const { code, name, form, stream, instructorId, academicYear } = req.body;
    if (!code || !name || !form) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const result = await query(
      `INSERT INTO courses (code, name, form, stream_requirement, instructor_id, academic_year, active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [code, name, form, stream || null, instructorId || null, academicYear || new Date().getFullYear()]
    );

    res.json({ success: true, message: 'Course created', id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  listClasses,
  getClassDetails,
  enrollStudent,
  getStudentsInClass,
  getCoursesByForm,
  getFormSummary,
  addCourse
};
