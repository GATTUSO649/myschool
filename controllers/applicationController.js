const { query } = require('../config/db');
const { logActivity } = require('./logController');
const { getAdmissionAssignmentForApplication } = require('./admissionAllocator');
const { schoolEmail } = require('./emailUtils');

function getDocumentValue(req, fieldName, fallbackValue) {
  const uploaded = req.files?.[fieldName]?.[0];
  if (uploaded) {
    return `/uploads/applications/${uploaded.filename}`;
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

    await query(
      `UPDATE applications
       SET status = 'approved', admission_number = ?, stream = ?, reviewed_by = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [admissionNumber, stream, req.user.id, id]
    );
    
    await logActivity(req.user.id, 'application_approved', `Approved application #${id}`, req.ip);
    
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
