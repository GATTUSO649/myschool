const { query, getConnection } = require('../config/db-new');
const bcrypt = require('bcryptjs');

// ============================================================================
// DASHBOARD STATISTICS
// ============================================================================

exports.getStats = async (req, res) => {
  try {
    // Total Students
    const [students] = await query(
      'SELECT COUNT(*) as count FROM students WHERE status = "active"'
    );
    const totalStudents = students[0]?.count || 0;

    // Total Teachers
    const [teachers] = await query(
      'SELECT COUNT(*) as count FROM users WHERE role = "teacher" AND active = 1'
    );
    const totalTeachers = teachers[0]?.count || 0;

    // Total Classes
    const [classes] = await query(
      'SELECT COUNT(*) as count FROM classes WHERE active = 1'
    );
    const totalClasses = classes[0]?.count || 0;

    // Application counts by status
    const [pendingAppsRows] = await query("SELECT COUNT(*) AS count FROM applications WHERE status = 'pending'");
    const [approvedAppsRows] = await query("SELECT COUNT(*) AS count FROM applications WHERE status = 'approved'");
    const [rejectedAppsRows] = await query("SELECT COUNT(*) AS count FROM applications WHERE status = 'rejected'");

    // Fee totals
    const [chargedRows] = await query('SELECT COALESCE(SUM(amount), 0) AS totalCharged FROM fee_charges');
    const [paidRows] = await query('SELECT COALESCE(SUM(amount), 0) AS totalPaid FROM fee_payments');

    // Academic counts and averages
    const [resultsRows] = await query('SELECT COUNT(*) AS count FROM results');
    const formAverageRows = await query(
      `SELECT s.class_name AS className, AVG(r.score) AS average
       FROM results r
       JOIN students s ON r.student_id = s.id
       WHERE r.score IS NOT NULL
       GROUP BY s.class_name
       ORDER BY FIELD(s.class_name, 'Form 1', 'Form 2', 'Form 3', 'Form 4')`
    );

    const paymentRows = await query(
      `SELECT s.class_name AS className, COALESCE(SUM(fp.amount), 0) AS total_paid
       FROM fee_payments fp
       JOIN students s ON fp.student_id = s.id
       GROUP BY s.class_name
       ORDER BY FIELD(s.class_name, 'Form 1', 'Form 2', 'Form 3', 'Form 4')`
    );

    const formAverages = formAverageRows.map((row) => ({
      className: row.className || 'Class',
      average: Number(row.average || 0).toFixed(1)
    }));

    const formPaymentSummary = paymentRows.map((row) => ({
      className: row.className || 'Class',
      paidAmount: Number(row.total_paid || 0)
    }));

    res.json({
      totalStudents,
      totalTeachers,
      totalClasses,
      applicationCounts: {
        pending: pendingAppsRows[0]?.count || 0,
        approved: approvedAppsRows[0]?.count || 0,
        rejected: rejectedAppsRows[0]?.count || 0
      },
      totalResults: resultsRows[0]?.count || 0,
      totalCharged: chargedRows[0]?.totalCharged || 0,
      totalPaid: paidRows[0]?.totalPaid || 0,
      totalBilled: chargedRows[0]?.totalCharged || 0,
      balance: Math.max((chargedRows[0]?.totalCharged || 0) - (paidRows[0]?.totalPaid || 0), 0),
      formAverages,
      formPaymentSummary
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// STUDENT MANAGEMENT
// ============================================================================

exports.getAllStudents = async (req, res) => {
  try {
    const { classId, form, stream, status } = req.query;
    let sql = `
      SELECT s.*, u.name, u.email, u.phone, u.username
      FROM students s
      JOIN users u ON s.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (classId) {
      sql += ' AND s.class_id = ?';
      params.push(classId);
    }
    if (form) {
      const normalizedForm = form.trim();
      const formMatch = normalizedForm.match(/^form\s*([1-4])$/i)
        ? `Form ${RegExp.$1}`
        : normalizedForm.match(/^([1-4])$/)
        ? `Form ${RegExp.$1}`
        : normalizedForm;
      sql += ' AND s.class_name = ?';
      params.push(formMatch);
    }
    if (stream) {
      sql += ' AND s.stream = ?';
      params.push(stream);
    }
    if (status) {
      sql += ' AND s.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY u.name ASC';

    const students = await query(sql, params);
    res.json(students);
  } catch (error) {
    console.error('Error getting students:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.registerStudent = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    const {
      full_name,
      email,
      date_of_birth,
      gender,
      class_id,
      stream,
      category,
      phone,
      parent_name,
      parent_phone,
      guardian_name,
      guardian_phone,
      address,
      medical_notes
    } = req.body;

    // Create user account first
    const hashedPassword = await bcrypt.hash('default123', 10);
    const username = email.split('@')[0];

    const userResult = await connection.execute(
      'INSERT INTO users (name, email, username, password_hash, role, phone, active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [full_name, email, username, hashedPassword, 'student', phone || '']
    );

    const userId = userResult[0].insertId;
    const admissionNumber = `CHM${Date.now()}`.substring(0, 15);

    // Create student record
    const studentResult = await connection.execute(
      `INSERT INTO students (user_id, admission_number, date_of_birth, gender, class_id, stream, category, 
       parent_name, parent_phone, guardian_name, guardian_phone, address, medical_notes, admission_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'active')`,
      [userId, admissionNumber, date_of_birth, gender, class_id, stream, category,
       parent_name, parent_phone, guardian_name, guardian_phone, address, medical_notes]
    );

    // Log activity
    await connection.execute(
      'INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)',
      [req.user?.id, 'register_student', `Student ${full_name} registered with admission #${admissionNumber}`]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Student registered successfully',
      studentId: studentResult[0].insertId,
      admissionNumber,
      username,
      defaultPassword: 'default123'
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error registering student:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

exports.getStudentProfile = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // Student info
    const students = await query(
      `SELECT s.*, u.name, u.email, u.phone, u.username, c.class_name
       FROM students s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN classes c ON s.class_id = c.id
       WHERE s.id = ?`,
      [studentId]
    );

    if (students.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const student = students[0];

    // Academic performance
    const results = await query(
      `SELECT AVG(marks) as avg_marks, COUNT(*) as subjects
       FROM marks WHERE student_id = ? AND academic_year_id = 
       (SELECT id FROM academic_years WHERE is_current = 1)`,
      [studentId]
    );

    // Fee balance
    const fees = await query(
      `SELECT 
        SUM(CASE WHEN type='charge' THEN amount ELSE 0 END) as total_fees,
        SUM(CASE WHEN type='payment' THEN amount ELSE 0 END) as paid_fees
       FROM (
         SELECT amount, 'charge' as type FROM fee_charges WHERE student_id = ? AND status != 'paid'
         UNION ALL
         SELECT amount, 'payment' as type FROM fee_payments WHERE student_id = ?
       ) as fees_union`,
      [studentId, studentId]
    );

    res.json({
      ...student,
      academics: results[0] || {},
      fees: fees[0] || { total_fees: 0, paid_fees: 0 }
    });
  } catch (error) {
    console.error('Error getting student profile:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// ACTIVITY LOGS
// ============================================================================

exports.getActivityLogs = async (req, res) => {
  try {
    const { limit = 100, offset = 0, action, userId } = req.query;
    let sql = 'SELECT * FROM activity_logs WHERE 1=1';
    const params = [];

    if (action) {
      sql += ' AND action LIKE ?';
      params.push(`%${action}%`);
    }
    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const logs = await query(sql, params);
    res.json(logs);
  } catch (error) {
    console.error('Error getting logs:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.logActivity = async (userId, action, details, ipAddress) => {
  try {
    await query(
      'INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [userId, action, details, ipAddress || '']
    );
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

exports.getDatabaseInfo = async (req, res) => {
  try {
    // Get table info
    const tables = await query(`
      SELECT TABLE_NAME, TABLE_ROWS as row_count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
    `, [process.env.DB_NAME || 'cresent_school']);

    // Get storage info
    const [storage] = await query(`
      SELECT 
        SUM(ROUND(((data_length + index_length) / 1024 / 1024), 2)) as size_mb,
        COUNT(*) as table_count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
    `, [process.env.DB_NAME || 'cresent_school']);

    res.json({
      tables,
      storage: storage[0] || { size_mb: 0, table_count: 0 }
    });
  } catch (error) {
    console.error('Error getting database info:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.backupDatabase = async (req, res) => {
  try {
    // This would typically trigger a backup process
    // For now, we'll just log it
    await exports.logActivity(req.user?.id, 'database_backup', 'Database backup requested');
    
    res.json({
      success: true,
      message: 'Database backup initiated',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error backing up database:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// APPLICATIONS/ADMISSIONS
// ============================================================================

exports.getApplications = async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const applications = await query(
      'SELECT * FROM applications WHERE status = ? ORDER BY created_at DESC',
      [status]
    );
    res.json(applications);
  } catch (error) {
    console.error('Error getting applications:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.approveApplication = async (req, res) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    const { applicationId } = req.params;
    const { class_id } = req.body;

    // Get application
    const apps = await connection.query(
      'SELECT * FROM applications WHERE id = ?',
      [applicationId]
    );

    if (apps[0].length === 0) {
      throw new Error('Application not found');
    }

    const app = apps[0][0];

    // Create user and student
    const hashedPassword = await bcrypt.hash('default123', 10);
    const username = app.email.split('@')[0];

    const userResult = await connection.execute(
      'INSERT INTO users (name, email, username, password_hash, role, phone, active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [app.full_name, app.email, username, hashedPassword, 'student', app.phone || '']
    );

    const userId = userResult[0].insertId;
    const admissionNumber = `CHM${Date.now()}`.substring(0, 15);

    await connection.execute(
      `INSERT INTO students (user_id, admission_number, date_of_birth, gender, class_id, stream, 
       parent_name, parent_phone, address, admission_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'active')`,
      [userId, admissionNumber, app.date_of_birth, app.gender, class_id, app.stream_preference,
       app.parent_name, app.parent_phone, app.address]
    );

    // Update application status
    await connection.execute(
      'UPDATE applications SET status = ?, admission_number = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
      ['approved', admissionNumber, req.user?.id, applicationId]
    );

    // Log activity
    await connection.execute(
      'INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)',
      [req.user?.id, 'approve_application', `Application ${applicationId} approved. Admission #${admissionNumber}`]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Application approved',
      admissionNumber,
      username
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error approving application:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
};

exports.rejectApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;
    
    await query(
      'UPDATE applications SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
      ['rejected', req.user?.id, applicationId]
    );

    await exports.logActivity(req.user?.id, 'reject_application', `Application ${applicationId} rejected`);

    res.json({ success: true, message: 'Application rejected' });
  } catch (error) {
    console.error('Error rejecting application:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// MISCELLANEOUS
// ============================================================================

exports.changeUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['student', 'teacher', 'admin', 'accountant'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    await query('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
    await exports.logActivity(req.user?.id, 'change_user_role', `Changed user ${userId} role to ${role}`);

    res.json({ success: true, message: 'User role updated' });
  } catch (error) {
    console.error('Error changing user role:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.deactivateUser = async (req, res) => {
  try {
    const { userId } = req.params;

    await query('UPDATE users SET active = 0 WHERE id = ?', [userId]);
    await exports.logActivity(req.user?.id, 'deactivate_user', `Deactivated user ${userId}`);

    res.json({ success: true, message: 'User deactivated' });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({ error: error.message });
  }
};
