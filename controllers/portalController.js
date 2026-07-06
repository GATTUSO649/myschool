const path = require('path');
const { query } = require('../config/db');

async function exams(req, res) {
  res.json(await query('SELECT * FROM exams ORDER BY exam_date DESC, start_time DESC'));
}

async function calendarEvents(req, res) {
  const rows = await query(
    `SELECT id, title, description, type, subject, location, class_name,
            COALESCE(start_date, TIMESTAMP(event_date, COALESCE(event_time, '00:00:00'))) AS start_date,
            COALESCE(end_date, COALESCE(start_date, TIMESTAMP(event_date, COALESCE(event_time, '00:00:00')))) AS end_date,
            event_date, event_time, created_at
     FROM calendar_events
     ORDER BY COALESCE(start_date, TIMESTAMP(event_date, COALESCE(event_time, '00:00:00'))) ASC`
  );
  res.json(rows);
}

async function createCalendarEvent(req, res) {
  const body = req.body;
  const startDate = body.start_date || body.startDate || body.event_date || body.date;
  const endDate = body.end_date || body.endDate || startDate;
  const eventDate = String(startDate || '').slice(0, 10);
  const eventTime = String(startDate || '').includes('T') ? String(startDate).slice(11, 16) : (body.event_time || body.time || null);
  const result = await query(
    `INSERT INTO calendar_events
     (title, description, event_date, event_time, start_date, end_date, type, subject, location, class_name, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      body.title,
      body.description || null,
      eventDate,
      eventTime,
      startDate || null,
      endDate || null,
      body.type || 'event',
      body.subject || null,
      body.location || null,
      body.className || body.class_name || null,
      req.user.id
    ]
  );
  res.status(201).json({ success: true, id: result.insertId });
}

async function assignments(req, res) {
  const rows = await query(
    `SELECT a.*,
            CASE WHEN sub.id IS NULL THEN 'pending' ELSE 'submitted' END AS submission_status,
            sub.grade, sub.feedback
     FROM assignments a
     LEFT JOIN (
       SELECT assignment_id, student_id, grade, feedback, id
       FROM assignment_submissions
       WHERE student_id = ?
     ) sub ON sub.assignment_id = a.id
     ORDER BY a.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
}

async function createAssignment(req, res) {
  const file = req.file;
  const body = req.body;
  const result = await query(
    `INSERT INTO assignments (title, subject, class_name, description, due_date, filename, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [body.title, body.subject || null, body.class_name || body.className || null, body.description || null, body.due_date || body.dueDate || null, file?.filename || null, req.user.id]
  );
  res.status(201).json({ success: true, id: result.insertId });
}

async function submitAssignment(req, res) {
  const file = req.file;
  const result = await query(
    `INSERT INTO assignment_submissions (assignment_id, student_id, filename, notes)
     VALUES (?, ?, ?, ?)`,
    [req.params.id, req.user.id, file?.filename || null, req.body.notes || null]
  );
  res.status(201).json({ success: true, id: result.insertId });
}

async function downloadAssignment(req, res) {
  const rows = await query('SELECT filename FROM assignments WHERE id = ?', [req.params.id]);
  if (!rows[0]?.filename) return res.status(404).json({ success: false, message: 'File not found' });
  res.sendFile(path.join(__dirname, '..', 'uploads', 'assignments', path.basename(rows[0].filename)));
}

async function notes(req, res) {
  res.json(await query(
    `SELECT n.id, n.title, n.subject, n.class_name, n.class_name AS class,
            n.topic, n.description, n.filename, n.file_size, n.downloads,
            n.created_at, n.created_at AS upload_date,
            s.name AS lecturer_name
     FROM notes n
     LEFT JOIN students s ON s.id = n.uploaded_by
     ORDER BY n.created_at DESC`
  ));
}

async function uploadNote(req, res) {
  const file = req.file;
  const result = await query(
    `INSERT INTO notes (title, subject, class_name, topic, description, filename, file_size, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.body.title || file?.originalname,
      req.body.subject || null,
      req.body.class_name || req.body.className || req.body.class || null,
      req.body.topic || null,
      req.body.description || null,
      file?.filename || null,
      file?.size || 0,
      req.user.id
    ]
  );
  const created = await query(
    `SELECT id, title, subject, class_name, class_name AS class, topic, description, filename,
            file_size, downloads, created_at, created_at AS upload_date
     FROM notes WHERE id = ?`,
    [result.insertId]
  );
  res.status(201).json(created[0]);
}

async function deleteNote(req, res) {
  await query('DELETE FROM notes WHERE id = ?', [req.params.id]);
  res.json({ success: true });
}

async function downloadNote(req, res) {
  await query('UPDATE notes SET downloads = downloads + 1 WHERE id = ?', [req.params.id]);
  const rows = await query('SELECT filename FROM notes WHERE id = ?', [req.params.id]);
  if (!rows[0]?.filename) return res.status(404).json({ success: false, message: 'File not found' });
  res.sendFile(path.join(__dirname, '..', 'uploads', 'documents', path.basename(rows[0].filename)));
}

async function revisionMaterials(req, res) {
  res.json(await query(
    `SELECT r.id, r.title, r.subject, r.class_name, r.topic,
            r.category, r.category AS type, r.exam_year, r.difficulty, r.description,
            r.filename, r.downloads, r.estimated_time, r.rating,
            r.created_at, r.created_at AS upload_date,
            s.name AS lecturer_name
     FROM revision_materials r
     LEFT JOIN students s ON s.id = r.uploaded_by
     ORDER BY r.created_at DESC`
  ));
}

async function uploadRevision(req, res) {
  const file = req.file;
  const result = await query(
    `INSERT INTO revision_materials
     (title, subject, class_name, topic, category, exam_year, difficulty, description, filename, estimated_time, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.body.title || file?.originalname,
      req.body.subject || null,
      req.body.class_name || req.body.className || null,
      req.body.topic || null,
      req.body.category || req.body.type || null,
      req.body.exam_year || null,
      req.body.difficulty || 'intermediate',
      req.body.description || null,
      file?.filename || null,
      req.body.estimated_time || null,
      req.user.id
    ]
  );
  const created = await query(
    `SELECT id, title, subject, class_name, topic, category, category AS type,
            exam_year, difficulty, description, filename, downloads, estimated_time,
            rating, created_at, created_at AS upload_date
     FROM revision_materials WHERE id = ?`,
    [result.insertId]
  );
  res.status(201).json(created[0]);
}

async function markStudied(req, res) {
  await query(
    `INSERT INTO study_progress (student_id, material_id, studied, studied_at)
     VALUES (?, ?, 1, NOW())
     ON DUPLICATE KEY UPDATE studied = 1, studied_at = NOW()`,
    [req.user.id, req.params.id]
  );
  res.json({ success: true });
}

async function studyProgress(req, res) {
  const rows = await query('SELECT * FROM study_progress WHERE student_id = ?', [req.user.id]);
  res.json({
    records: rows,
    studiedMaterials: rows.filter(row => row.studied).length,
    completedSubjects: 0,
    completedTests: 0
  });
}

async function deleteRevision(req, res) {
  await query('DELETE FROM revision_materials WHERE id = ?', [req.params.id]);
  res.json({ success: true });
}

async function downloadRevision(req, res) {
  await query('UPDATE revision_materials SET downloads = downloads + 1 WHERE id = ?', [req.params.id]);
  const rows = await query('SELECT filename FROM revision_materials WHERE id = ?', [req.params.id]);
  if (!rows[0]?.filename) return res.status(404).json({ success: false, message: 'File not found' });
  res.sendFile(path.join(__dirname, '..', 'uploads', 'documents', path.basename(rows[0].filename)));
}

async function notifications(req, res) {
  res.json(await query(
    `SELECT * FROM notifications
     WHERE user_id = ? OR role_target = ? OR role_target IS NULL
     ORDER BY created_at DESC`,
    [req.user.id, req.user.role]
  ));
}

async function markNotificationRead(req, res) {
  await query('UPDATE notifications SET is_read = 1 WHERE id = ? AND (user_id = ? OR user_id IS NULL)', [req.params.id, req.user.id]);
  res.json({ success: true });
}

async function markAllNotificationsRead(req, res) {
  await query('UPDATE notifications SET is_read = 1 WHERE user_id = ? OR role_target = ? OR role_target IS NULL', [req.user.id, req.user.role]);
  res.json({ success: true });
}

async function clearNotifications(req, res) {
  await query('DELETE FROM notifications WHERE user_id = ?', [req.user.id]);
  res.json({ success: true });
}

async function notificationSettings(req, res) {
  res.json({ success: true, settings: req.body || {} });
}

async function consultation(req, res) {
  res.status(201).json({ success: true, message: 'Consultation request received' });
}

async function transcriptMarks(req, res) {
  const params = [];
  let where = '';
  if (req.user.role !== 'rba' && req.user.role !== 'lecturer') {
    where = 'WHERE r.student_id = ?';
    params.push(req.user.id);
  }
  const rows = await query(
    `SELECT s.id AS student_id, s.name AS student_name, s.admission_number,
            MAX(CASE WHEN LOWER(r.subject) LIKE 'eng%' THEN r.score END) AS eng,
            MAX(CASE WHEN LOWER(r.subject) LIKE 'mat%' THEN r.score END) AS mat,
            MAX(CASE WHEN LOWER(r.subject) LIKE 'kis%' THEN r.score END) AS kisw,
            MAX(CASE WHEN LOWER(r.subject) LIKE 'bio%' THEN r.score END) AS bio,
            MAX(CASE WHEN LOWER(r.subject) LIKE 'che%' THEN r.score END) AS che,
            MAX(CASE WHEN LOWER(r.subject) LIKE 'phy%' THEN r.score END) AS phy,
            MAX(r.created_at) AS created_at
     FROM results r
     JOIN students s ON s.id = r.student_id
     ${where}
     GROUP BY s.id, s.name, s.admission_number
     ORDER BY s.name`,
    params
  );
  res.json(rows);
}

module.exports = {
  exams,
  calendarEvents,
  createCalendarEvent,
  assignments,
  createAssignment,
  submitAssignment,
  notes,
  uploadNote,
  deleteNote,
  downloadNote,
  revisionMaterials,
  uploadRevision,
  markStudied,
  studyProgress,
  deleteRevision,
  downloadRevision,
  notifications,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications,
  notificationSettings,
  consultation,
  transcriptMarks
  , downloadAssignment
};
