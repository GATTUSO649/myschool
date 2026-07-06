const path = require('path');
const { query } = require('../config/db');
const { logActivity } = require('./logController');

function docFileResponse(res, filename, folder = 'documents') {
  const safeName = path.basename(filename);
  res.sendFile(path.join(__dirname, '..', 'uploads', folder, safeName));
}

function gradeForScore(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return 'N/A';
  if (numeric >= 80) return 'A';
  if (numeric >= 70) return 'A-';
  if (numeric >= 60) return 'B';
  if (numeric >= 50) return 'C';
  if (numeric >= 40) return 'D';
  if (numeric >= 30) return 'E';
  return 'F';
}

function gradePointsForScore(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric >= 80) return 12;
  if (numeric >= 70) return 10;
  if (numeric >= 60) return 8;
  if (numeric >= 50) return 6;
  if (numeric >= 40) return 4;
  if (numeric >= 30) return 2;
  return 0;
}

function transcriptColumnForSubject(subject) {
  const normalized = String(subject || '').trim().toLowerCase();
  if (normalized.includes('eng')) return 'eng';
  if (normalized.includes('kis')) return 'kisw';
  if (normalized.includes('math')) return 'mat';
  if (normalized.includes('bio')) return 'bio';
  if (normalized.includes('chem')) return 'che';
  if (normalized.includes('phy')) return 'phy';
  if (normalized.includes('cre')) return 'cre';
  if (normalized.includes('hist')) return 'his';
  if (normalized.includes('geo')) return 'geo';
  if (normalized.includes('comp')) return 'comp';
  if (normalized.includes('bus')) return 'bus';
  if (normalized.includes('agr')) return 'agr';
  return null;
}

function transcriptTableForClassName(className) {
  const normalized = String(className || '').trim();
  const formMatch = normalized.match(/form\s*([1-4])/i);
  if (formMatch) return `form${formMatch[1]}_transcript`;
  return null;
}

async function syncTranscriptForStudent(studentId, academicYear, term) {
  const studentRows = await query('SELECT id, name, admission_number, class_name, stream FROM students WHERE id = ? LIMIT 1', [studentId]);
  const student = studentRows[0];
  if (!student) return null;

  const tableName = transcriptTableForClassName(student.class_name);
  if (!tableName) return null;

  const rows = await query(
    `SELECT subject, score FROM results WHERE student_id = ? AND academic_year = ? AND term = ? ORDER BY subject`,
    [studentId, academicYear, term]
  );

  const subjectValues = {};
  const scoredEntries = rows.filter((row) => Number.isFinite(Number(row.score)) && Number(row.score) >= 0);
  scoredEntries.forEach((row) => {
    const column = transcriptColumnForSubject(row.subject);
    if (column) subjectValues[column] = Number(row.score);
  });

  const total = Object.values(subjectValues).reduce((sum, value) => sum + Number(value || 0), 0);
  const count = Object.keys(subjectValues).length;
  const avg = count ? total / count : null;
  const grade = avg !== null ? gradeForScore(avg) : null;

  const existing = await query(`SELECT id FROM ${tableName} WHERE student_id = ? AND academic_year = ? AND term = ? LIMIT 1`, [studentId, academicYear, term]);
  const values = [
    student.admission_number,
    student.name,
    student.stream,
    subjectValues.eng ?? null,
    subjectValues.kisw ?? null,
    subjectValues.mat ?? null,
    subjectValues.bio ?? null,
    subjectValues.che ?? null,
    subjectValues.phy ?? null,
    subjectValues.cre ?? null,
    subjectValues.his ?? null,
    subjectValues.geo ?? null,
    subjectValues.comp ?? null,
    subjectValues.bus ?? null,
    subjectValues.agr ?? null,
    total || null,
    avg,
    grade,
    term,
    academicYear,
    studentId
  ];

  if (existing.length) {
    await query(
      `UPDATE ${tableName}
       SET adm = ?, name = ?, stream = ?, eng = ?, kisw = ?, mat = ?, bio = ?, che = ?, phy = ?, cre = ?, his = ?, geo = ?, comp = ?, bus = ?, agr = ?, total = ?, avg = ?, grade = ?, term = ?, academic_year = ?
       WHERE id = ?`,
      [...values.slice(0, 19), existing[0].id]
    );
  } else {
    await query(
      `INSERT INTO ${tableName} (adm, name, stream, eng, kisw, mat, bio, che, phy, cre, his, geo, comp, bus, agr, total, avg, grade, term, academic_year, student_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values
    );
  }

  return { tableName, total, avg, grade };
}

async function listDocs(req, res) {
  const params = [];
  let sql = `SELECT id, title, type, subject, class_name, topic, category, description,
                    filename, original_name, due_date, uploaded_at, created_at
             FROM academic_documents`;
  if (req.query.type) {
    sql += ' WHERE type = ?';
    params.push(req.query.type);
  }
  sql += ' ORDER BY uploaded_at DESC LIMIT ? OFFSET ?';
  params.push(Number(req.query.limit || 100), Number(req.query.offset || 0));
  res.json(await query(sql, params));
}

async function listEntryStudents(req, res) {
  try {
    const filters = {
      className: req.query.className || req.query.class_name || null,
      stream: req.query.stream || null
    };

    const params = [];
    let where = "WHERE role = 'student' AND active = 1";
    if (filters.className) {
      where += ' AND class_name = ?';
      params.push(filters.className);
    }
    if (filters.stream) {
      where += ' AND stream = ?';
      params.push(filters.stream);
    }

    const rows = await query(
      `SELECT id, name, admission_number AS admissionNumber, class_name AS className, stream
       FROM students
       ${where}
       ORDER BY name`,
      params
    );
    res.json({ success: true, students: rows });
  } catch (error) {
    console.error('List academic entry students error:', error);
    res.status(500).json({ success: false, message: 'Could not load student list' });
  }
}

async function saveEntryResults(req, res) {
  try {
    const body = req.body || {};
    const entries = Array.isArray(body.entries) ? body.entries : [];
    const academicYear = body.academicYear || body.academic_year || null;
    const term = body.term || null;
    const examType = body.examType || body.exam_type || 'CAT 1';
    const subject = body.subject || null;
    const className = body.className || body.class_name || null;

    if (!subject || !entries.length) {
      return res.status(400).json({ success: false, message: 'Subject and student marks are required' });
    }

    const saved = [];
    for (const entry of entries) {
      const studentId = entry.student_id || entry.studentId;
      const score = Number(entry.score);
      if (!studentId || !Number.isFinite(score)) continue;

      await query('DELETE FROM results WHERE student_id = ? AND subject = ? AND academic_year = ? AND term = ? AND exam_type = ?', [studentId, subject, academicYear, term, examType]);
      const result = await query(
        `INSERT INTO results (student_id, subject, score, grade, term, academic_year, exam_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [studentId, subject, score, gradeForScore(score), term, academicYear, examType]
      );
      await syncTranscriptForStudent(studentId, academicYear, term);
      saved.push({ id: result.insertId, studentId, score, grade: gradeForScore(score) });
    }

    const summaryRows = await query(
      `SELECT AVG(score) AS average, MAX(score) AS highest, MIN(score) AS lowest
       FROM results
       WHERE subject = ? AND academic_year = ? AND term = ? AND exam_type = ?`,
      [subject, academicYear, term, examType]
    );
    const summary = summaryRows[0] || {};

    await logActivity(req.user?.id, 'results_entry', `Published ${subject} marks for ${saved.length} student(s)`, req.ip);
    res.json({
      success: true,
      saved,
      summary: {
        subject,
        academicYear,
        term,
        examType,
        className,
        average: Number(summary.average || 0).toFixed(2),
        highest: Number(summary.highest || 0),
        lowest: Number(summary.lowest || 0)
      }
    });
  } catch (error) {
    console.error('Save academic entry error:', error);
    res.status(500).json({ success: false, message: 'Could not save academic results' });
  }
}

async function academicDashboard(req, res) {
  try {
    const [studentsRows] = await query("SELECT COUNT(*) AS count FROM students WHERE active = 1");
    const [notesRows] = await query('SELECT COUNT(*) AS count FROM notes');
    const [revisionRows] = await query('SELECT COUNT(*) AS count FROM revision_materials');
    const [resultsRows] = await query('SELECT COUNT(*) AS count FROM results');
    const [averageRows] = await query('SELECT AVG(score) AS average FROM results WHERE score IS NOT NULL');
    const subjectRows = await query('SELECT subject, COUNT(*) AS count FROM results GROUP BY subject ORDER BY count DESC LIMIT 8');
    const gradeRows = await query('SELECT grade, COUNT(*) AS count FROM results WHERE grade IS NOT NULL GROUP BY grade ORDER BY count DESC');

    res.json({
      success: true,
      summary: {
        totalStudents: Number(studentsRows[0]?.count || 0),
        notesUploaded: Number(notesRows[0]?.count || 0),
        revisionPapers: Number(revisionRows[0]?.count || 0),
        resultsPublished: Number(resultsRows[0]?.count || 0),
        averageSchoolMean: Number(averageRows[0]?.average || 0).toFixed(2),
        subjectsOffered: subjectRows.length
      },
      subjects: subjectRows,
      grades: gradeRows
    });
  } catch (error) {
    console.error('Academic dashboard error:', error);
    res.status(500).json({ success: false, message: 'Could not load academic dashboard data' });
  }
}

async function createDoc(req, res) {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: 'File is required' });
    const body = req.body;
    const result = await query(
      `INSERT INTO academic_documents
       (title, type, subject, class_name, topic, category, description, filename, original_name, mime_type, file_size, due_date, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.title || file.originalname,
        body.type || 'notes',
        body.subject || null,
        body.class_name || body.className || null,
        body.topic || null,
        body.category || null,
        body.description || null,
        file.filename,
        file.originalname,
        file.mimetype,
        file.size,
        body.due_date || body.dueDate || null,
        req.user?.id || null
      ]
    );
    await logActivity(req.user?.id, 'upload', `Uploaded academic document ${file.originalname}`, req.ip);
    res.status(201).json({ success: true, id: result.insertId, filename: file.filename });
  } catch (error) {
    console.error('Create academic doc error:', error);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
}

async function updateDoc(req, res) {
  const body = req.body;
  await query(
    `UPDATE academic_documents
     SET title = ?, subject = ?, class_name = ?, topic = ?, description = ?, due_date = ?, category = ?
     WHERE id = ?`,
    [body.title, body.subject, body.class_name || body.className, body.topic, body.description, body.due_date || null, body.category, req.params.id]
  );
  res.json({ success: true });
}

async function deleteDoc(req, res) {
  await query('DELETE FROM academic_documents WHERE id = ?', [req.params.id]);
  res.json({ success: true });
}

async function serveDoc(req, res) {
  docFileResponse(res, req.params.filename);
}

module.exports = {
  listDocs,
  listEntryStudents,
  saveEntryResults,
  academicDashboard,
  createDoc,
  updateDoc,
  deleteDoc,
  serveDoc,
  docFileResponse
};
