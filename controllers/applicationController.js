const { query } = require('../config/db');
const bcrypt = require('bcryptjs');
const { logActivity } = require('./logController');
const { getAdmissionAssignmentForApplication } = require('./admissionAllocator');
const { schoolEmail, sendAdmissionApprovalEmail } = require('./emailUtils');

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

    const birthCertificateValue = getDocumentValue(req, 'birthCertificate', body.birthCertificateUrl || body.birth_certificate_url || body.birthCertificate || body.birth_certificate || null);
    const kcpeCertificateValue = getDocumentValue(req, 'kcpeCertificate', body.kcpeCertificateUrl || body.kcpe_certificate_url || body.kcpeCertificate || body.kcpe_certificate || null);
    const medicalFormValue = getDocumentValue(req, 'medicalForm', body.medicalFormUrl || body.medical_form_url || body.medicalForm || body.medical_form || null);

    const result = await query(
      `INSERT INTO applications
       (full_name, email, phone, date_of_birth, gender, class_name, previous_school, parent_name, parent_phone, address, requirements, medical_notes, birth_certificate_path, kcpe_certificate_path, medical_form_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fullName,
        body.email || null,
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
    res.status(201).json({ success: true, id: result.insertId, message: 'Application submitted successfully' });
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
  try {
    const id = req.params.id;
    const apps = await query('SELECT * FROM applications WHERE id = ?', [id]);
    const app = apps[0];
    if (!app) return res.status(404).json({ success: false, message: 'Application not found' });

    const assignment = app.admission_number && app.stream
      ? { admissionNumber: app.admission_number, stream: app.stream }
      : await getAdmissionAssignmentForApplication(app);
    const { admissionNumber, stream } = assignment;

    const reviewerId = req.user?.id && Number(req.user.id) > 0 ? req.user.id : null;

    await query(
      `UPDATE applications
       SET status = 'approved', admission_number = ?, stream = ?, reviewed_by = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [admissionNumber, stream, reviewerId, id]
    );
    
    await logActivity(reviewerId, 'application_approved', `Approved application #${id}`, req.ip);

    let studentAccount = null;
    try {
      const existing = await query('SELECT id, username, email, admission_number FROM students WHERE admission_number = ? OR email = ? LIMIT 1', [admissionNumber, app.email || null]);
      studentAccount = existing && existing.length ? existing[0] : null;
      if (!studentAccount) {
        const emailValue = schoolEmail(app.email, admissionNumber || app.full_name);
        const baseUsername = String(app.full_name || app.fullName || 'student')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '')
          .slice(0, 12) || 'student';
        const username = `${baseUsername}${String(admissionNumber || '').replace(/[^0-9]/g, '').slice(-4) || Math.floor(1000 + Math.random() * 9000)}`;
        const loginPassword = String(app.email || emailValue || admissionNumber || '').trim();
        const passwordHash = await bcrypt.hash(loginPassword, 10);
        const insertRes = await query(
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
        studentAccount = { id: insertRes.insertId, username, email: emailValue };
        await logActivity(req.user.id, 'student_created_from_application', `Created student record ${admissionNumber}`, req.ip);
      }

      const recipientEmail = String(app.email || studentAccount?.email || '').trim();
      if (recipientEmail) {
        await sendAdmissionApprovalEmail({
          to: recipientEmail,
          fullName: app.full_name || app.fullName || 'Student',
          admissionNumber,
          username: studentAccount?.username || app.full_name || 'student',
          password: String(app.email || recipientEmail || admissionNumber || '').trim(),
          stream
        });
      }
    } catch (e) {
      console.warn('Could not auto-create student on approval:', e.message || e);
    }

    // Emit real-time event to admin dashboard
    if (io) {
      io.to('role:rba').emit('student_approved', {
        studentName: app.full_name,
        admissionNumber: admissionNumber,
        className: app.class_name,
        stream: stream,
        timestamp: new Date().toISOString()
      });
    }

    res.json({ success: true, admissionNumber, stream, message: 'Application approved successfully' });
  } catch (error) {
    console.error('Approve application error:', error);
    res.status(500).json({ success: false, message: 'Approval failed' });
  }
}

async function rejectApplication(req, res) {
  await query(
    `UPDATE applications SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
    [req.user.id, req.params.id]
  );
  await logActivity(req.user.id, 'application_rejected', `Rejected application #${req.params.id}`, req.ip);
  res.json({ success: true, message: 'Application rejected' });
}

module.exports = {
  createApplication,
  listApplications,
  approveApplication,
  rejectApplication,
  setIO
};
