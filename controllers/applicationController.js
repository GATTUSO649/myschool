const { query } = require('../config/db');
const bcrypt = require('bcryptjs');
const { logActivity } = require('./logController');
const { getAdmissionAssignmentForApplication } = require('./admissionAllocator');
const { schoolEmail, isValidRecipientEmail, sendAdmissionApprovalEmail, sendApplicationRejectionEmail, sendApplicationConfirmationEmail } = require('./emailUtils');

function getDocumentValue(req, fieldName, fallbackValue) {
  const uploaded = req.files?.[fieldName]?.[0];
  if (uploaded) {
    const appBaseUrl = process.env.APP_URL || 'https://cresenthighschool.onrender.com';
    return `${appBaseUrl.replace(/\/$/, '')}/uploads/applications/${uploaded.filename}`;
  }

  const bodyValue = req.body?.[fieldName] || req.body?.[fieldName.replace(/([A-Z])/g, '_$1').toLowerCase()];
  if (typeof bodyValue === 'string' && bodyValue.trim()) {
    return bodyValue.trim();
  }

  return fallbackValue || null;
}

// Get io instance
let io = null;
const setIO = (ioInstance) => {
  io = ioInstance;
};

async function createApplication(req, res) {
  try {
    const body = req.body || {};
    console.log('DEBUG application req.body:', body);
    console.log('DEBUG application req.files:', req.files);
    const fullName = body.fullName || body.full_name || body.name;
    if (!fullName) {
      return res.status(400).json({ success: false, message: 'Student full name is required' });
    }

    const recipientEmail = String(body.email || '').trim();
    if (!isValidRecipientEmail(recipientEmail)) {
      return res.status(400).json({ success: false, message: 'A valid recipient email address is required' });
    }

    const birthCertificateValue = getDocumentValue(req, 'birthCertificate', body.birthCertificateUrl || body.birth_certificate_url || body.birthCertificate || body.birth_certificate || null);
    const kcpeCertificateValue = getDocumentValue(req, 'kcpeCertificate', body.kcpeCertificateUrl || body.kcpe_certificate_url || body.kcpeCertificate || body.kcpe_certificate || null);
    const medicalFormValue = getDocumentValue(req, 'medicalForm', body.medicalFormUrl || body.medical_form_url || body.medicalForm || body.medical_form || null);

    const result = await query(
      `INSERT INTO applications
       (full_name, email, phone, date_of_birth, gender, class_name, previous_school, parent_name, parent_phone, address, requirements, medical_notes, birth_certificate_path, kcpe_certificate_path, medical_form_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fullName,
        recipientEmail,
        body.phone || body.phoneNumber || null,
        body.dateOfBirth || body.date_of_birth || body.dob || null,
        body.gender || null,
        body.className || body.class_name || body.class || null,
        body.previousSchool || body.previous_school || null,
        body.parentName || body.parent_name || body.guardianName || null,
        body.parentPhone || body.parent_phone || body.guardianPhone || null,
        body.address || null,
        body.requirements || null,
        body.medicalNotes || body.medical_notes || null,
        birthCertificateValue,
        kcpeCertificateValue,
        medicalFormValue
      ]
    );

    await logActivity(null, 'application_created', `Application #${result.insertId} submitted`, req.ip);

    const emailResult = await sendApplicationConfirmationEmail({
      to: recipientEmail,
      fullName: fullName || body.full_name || body.name || 'Applicant',
      applicationId: result.insertId
    });

    if (!emailResult.delivered) {
      return res.status(201).json({
        success: true,
        id: result.insertId,
        email: 'FAILED',
        reason: emailResult.failureReason || 'Unable to deliver confirmation email.',
        message: 'Application submitted successfully, but the confirmation email could not be delivered.'
      });
    }

    res.status(201).json({ success: true, id: result.insertId, email: 'SENT', message: 'Application submitted successfully and a confirmation email was sent.' });
  } catch (error) {
    console.error('Application create error:', error);
    res.status(500).json({ success: false, message: 'Could not submit application' });
  }
}

async function listApplications(req, res) {
  const params = [];
  let sql = 'SELECT * FROM applications';
  if (req.query.status) {
    sql += ' WHERE status = ?';
    params.push(req.query.status);
  }
  sql += ' ORDER BY created_at DESC';
  const rows = await query(sql, params);
  res.json(rows);
}

async function approveApplication(req, res) {
  let connection;
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid application id' });

    const pool = require('../config/db').getPool();
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [apps] = await connection.query('SELECT * FROM applications WHERE id = ? FOR UPDATE', [id]);
    const app = apps[0];
    if (!app) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    if (String(app.status || '').toLowerCase() === 'approved') {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Application already approved. Duplicate approval is not allowed.' });
    }

    if (String(app.status || '').toLowerCase() === 'rejected') {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Application is already rejected.' });
    }

    const assignment = app.admission_number && app.stream
      ? { admissionNumber: app.admission_number, stream: app.stream }
      : await getAdmissionAssignmentForApplication(app);
    const { admissionNumber, stream } = assignment;
    const reviewerId = req.user?.id && Number(req.user.id) > 0 ? Number(req.user.id) : null;

    const [existingStudentRows] = await connection.query(
      'SELECT id, username, email, admission_number FROM students WHERE admission_number = ? OR email = ? LIMIT 1',
      [admissionNumber, app.email || null]
    );

    let studentAccount = existingStudentRows[0] || null;
    if (!studentAccount) {
      const emailValue = app.email ? schoolEmail(app.email, admissionNumber || app.full_name) : null;
      const baseUsername = String(app.full_name || app.fullName || 'student')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 12) || 'student';
      const username = `${baseUsername}${String(admissionNumber || '').replace(/[^0-9]/g, '').slice(-4) || Math.floor(1000 + Math.random() * 9000)}`;
      const loginPassword = String(app.email || emailValue || admissionNumber || '').trim();
      const passwordHash = await bcrypt.hash(loginPassword, 10);
      const [insertResult] = await connection.query(
        `INSERT INTO students (name, username, email, admission_number, password_hash, role, class_name, stream, phone, guardian_name, guardian_phone, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          app.full_name || app.fullName || null,
          username,
          emailValue || null,
          admissionNumber,
          passwordHash,
          'student',
          app.class_name || app.className || null,
          stream,
          app.phone || null,
          app.parent_name || app.parentName || null,
          app.parent_phone || app.parentPhone || null
        ]
      );
      studentAccount = { id: insertResult.insertId, username, email: emailValue || app.email || null, admission_number: admissionNumber };
      await logActivity(reviewerId, 'student_created_from_application', `Created student record ${admissionNumber}`, req.ip);
    }

    await connection.query(
      `UPDATE applications
       SET status = 'approved', admission_number = ?, stream = ?, reviewed_by = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [admissionNumber, stream, reviewerId, id]
    );

    await connection.commit();
    await logActivity(reviewerId, 'application_approved', `Approved application #${id}`, req.ip);

    const recipientEmail = String(app.email || studentAccount?.email || '').trim();
    const safeStudentName = app.full_name || app.fullName || 'Student';
    const emailResult = recipientEmail
      ? await sendAdmissionApprovalEmail({
          to: recipientEmail,
          fullName: safeStudentName,
          admissionNumber,
          loginUsername: studentAccount?.username || app.full_name || 'student',
          initialPassword: studentAccount?.admission_number || admissionNumber || recipientEmail,
          stream,
          className: app.class_name || app.className || 'Assigned by administration',
          academicYear: new Date().getFullYear(),
          applicationReference: String(app.id || '').padStart(4, '0'),
          portalUrl: `${process.env.APP_URL || 'https://cresenthighschool.onrender.com'}/login.html`,
          applicationId: id,
          triggeredBy: reviewerId
        })
      : { delivered: false, failureReason: 'MISSING_RECIPIENT' };

    if (!emailResult.delivered) {
      const reason = emailResult.failureReason || 'Unable to deliver notification email.';
      await logActivity(reviewerId, 'application_approval_email_failed', `Approval email failed for application #${id}: ${reason}`, req.ip);
      return res.json({
        success: true,
        admissionNumber,
        stream,
        email: 'FAILED',
        reason,
        message: 'Application approved successfully, but the notification email could not be delivered.'
      });
    }

    if (io) {
      io.to('role:rba').emit('student_approved', {
        studentName: safeStudentName,
        admissionNumber: admissionNumber,
        className: app.class_name,
        stream: stream,
        email: 'SENT',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      admissionNumber,
      stream,
      email: 'SENT',
      message: 'Application approved successfully.'
    });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('Approve application error:', error);
    res.status(500).json({ success: false, message: 'Approval failed' });
  } finally {
    if (connection) connection.release();
  }
}

async function rejectApplication(req, res) {
  let connection;
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid application id' });

    const pool = require('../config/db').getPool();
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [apps] = await connection.query('SELECT * FROM applications WHERE id = ? FOR UPDATE', [id]);
    const app = apps[0];
    if (!app) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    if (String(app.status || '').toLowerCase() === 'rejected') {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Application already rejected. Duplicate rejection is not allowed.' });
    }

    const rejectionReason = String(req.body?.rejectionReason || req.body?.reason || '').trim();
    await connection.query(
      `UPDATE applications SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
      [req.user.id, id]
    );

    if (rejectionReason) {
      await connection.query('UPDATE applications SET rejection_reason = ? WHERE id = ?', [rejectionReason, id]);
    }

    await connection.commit();
    await logActivity(req.user.id, 'application_rejected', `Rejected application #${id}`, req.ip);

    const recipientEmail = String(app.email || '').trim();
    let emailResult = { delivered: false, failureReason: 'MISSING_RECIPIENT' };
    if (recipientEmail) {
      emailResult = await sendApplicationRejectionEmail({
        to: recipientEmail,
        fullName: app.full_name || 'Student',
        applicationReference: String(app.id || '').padStart(4, '0'),
        decisionDate: new Date().toISOString().slice(0, 10),
        reason: rejectionReason || '',
        applicationId: id,
        triggeredBy: req.user.id
      });
    }

    if (!emailResult.delivered) {
      return res.json({
        success: true,
        email: 'FAILED',
        reason: emailResult.failureReason || 'Unable to deliver notification email.',
        message: 'Application rejected successfully, but the notification email could not be delivered.'
      });
    }

    return res.json({ success: true, email: 'SENT', message: 'Application rejected successfully.' });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('Reject application error:', error);
    res.status(500).json({ success: false, message: 'Rejection failed' });
  } finally {
    if (connection) connection.release();
  }
}

module.exports = {
  createApplication,
  listApplications,
  approveApplication,
  rejectApplication,
  setIO
};
