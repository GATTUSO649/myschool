const path = require('path');
const { query } = require('../config/db');
const { logActivity } = require('./logController');
const { parseConfiguredOptions, validateCbeAssessment } = require('../services/cbeAssessment');

// Socket IO instance (set by server)
let io = null;
function setIO(ioInstance) { io = ioInstance; }

function docFileResponse(res, filename, folder = 'documents') {
  const safeName = path.basename(filename);
  res.sendFile(path.join(__dirname, '..', 'uploads', folder, safeName));
}

async function getCbeAssessmentSettings() {
  const rows = await query(
    `SELECT setting_key AS settingKey, setting_value AS settingValue
     FROM app_settings
     WHERE setting_key IN ('cbeLearningAreas', 'cbePerformanceDescriptors')`
  );
  return rows.reduce((settings, row) => {
    settings[row.settingKey] = row.settingValue || '';
    return settings;
  }, { cbeLearningAreas: '', cbePerformanceDescriptors: '' });
}

async function listCbeAssessmentStudents(req, res) {
  const role = String(req.user?.role || '').toLowerCase();
  const year = new Date().getFullYear();
  const settings = await getCbeAssessmentSettings();
  let rows;
  let learningAreas = parseConfiguredOptions(settings.cbeLearningAreas);
  if (role === 'teacher' || role === 'lecturer') {
    const assignments = await query(
      `SELECT DISTINCT class_name AS className, subject
       FROM teacher_assignments
       WHERE teacher_id = ? AND academic_year = ? AND active = 1`,
      [req.user.id, year]
    );
    const assignedSubjects = new Set(assignments.map((assignment) => String(assignment.subject || '').trim().toLowerCase()));
    learningAreas = learningAreas.filter((area) => assignedSubjects.has(String(area).trim().toLowerCase()));
    const classes = [...new Set(assignments.map((assignment) => assignment.className).filter(Boolean))];
    rows = classes.length && learningAreas.length
      ? await query(
      `SELECT DISTINCT s.id, s.name, s.admission_number AS admissionNumber, s.class_name AS className
       FROM students s
       WHERE s.class_name IN (${classes.map(() => '?').join(',')})
         AND s.role = 'student' AND s.active = 1 AND s.curriculum_type = 'CBE'
       ORDER BY s.class_name, s.name`,
      classes
    )
      : [];
  } else {
    rows = await query(
      `SELECT id, name, admission_number AS admissionNumber, class_name AS className
       FROM students
       WHERE role = 'student' AND active = 1 AND curriculum_type = 'CBE'
       ORDER BY class_name, name`
    );
  }
  res.json({
    success: true,
    students: rows,
    learningAreas,
    performanceDescriptors: parseConfiguredOptions(settings.cbePerformanceDescriptors)
  });
}

async function listCbeAssessments(req, res) {
  const role = String(req.user?.role || '').toLowerCase();
  const isStudent = role === 'student';
  if (!isStudent && !['admin', 'rba', 'teacher', 'lecturer'].includes(role)) {
    return res.status(403).json({ success: false, message: 'You are not authorized to view CBE assessments.' });
  }

  const studentId = isStudent ? Number(req.user.id) : Number(req.query.studentId);
  if (!Number.isSafeInteger(studentId) || studentId < 1) {
    return res.status(400).json({ success: false, message: 'Select a valid student.' });
  }

  const students = await query(
    `SELECT id, class_name AS className FROM students
     WHERE id = ? AND role = 'student' AND active = 1 AND curriculum_type = 'CBE' LIMIT 1`,
    [studentId]
  );
  if (!students.length) {
    return res.json({ success: true, isCbeStudent: false, assessments: [] });
  }
  if (['teacher', 'lecturer'].includes(role)) {
    const assignmentFilter = `AND EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = ? AND ta.class_name = ?
        AND ta.academic_year = ca.academic_year AND ta.active = 1
        AND LOWER(TRIM(ta.subject)) = LOWER(TRIM(ca.learning_area))
    )`;
    const assessments = await query(
      `SELECT ca.id, ca.academic_year AS academicYear, ca.education_level AS educationLevel,
              ca.learning_area AS learningArea, ca.assessment_title AS assessmentTitle,
              ca.performance_descriptor AS performanceDescriptor, ca.evidence, ca.feedback,
              ca.created_at AS createdAt, assessor.name AS assessedBy
       FROM cbe_assessments ca
       LEFT JOIN students assessor ON assessor.id = ca.assessed_by
       WHERE ca.student_id = ? AND ca.curriculum_type = 'CBE' ${assignmentFilter}
       ORDER BY ca.created_at DESC, ca.id DESC
       LIMIT 200`,
      [studentId, req.user.id, students[0].className]
    );
    return res.json({ success: true, isCbeStudent: true, assessments });
  }

  const assessments = await query(
    `SELECT ca.id, ca.academic_year AS academicYear, ca.education_level AS educationLevel,
            ca.learning_area AS learningArea, ca.assessment_title AS assessmentTitle,
            ca.performance_descriptor AS performanceDescriptor, ca.evidence, ca.feedback,
            ca.created_at AS createdAt, assessor.name AS assessedBy
     FROM cbe_assessments ca
     LEFT JOIN students assessor ON assessor.id = ca.assessed_by
     WHERE ca.student_id = ? AND ca.curriculum_type = 'CBE'
     ORDER BY ca.created_at DESC, ca.id DESC
     LIMIT 200`,
    [studentId]
  );
  res.json({ success: true, isCbeStudent: true, assessments });
}

async function createCbeAssessment(req, res) {
  const settings = await getCbeAssessmentSettings();
  const validation = validateCbeAssessment(req.body || {}, settings);
  if (validation.error) {
    return res.status(400).json({ success: false, message: validation.error });
  }

  const { studentId, academicYear, learningArea, assessmentTitle, performanceDescriptor, evidence, feedback } = validation.value;
  const students = await query(
    `SELECT id, class_name AS className
     FROM students
     WHERE id = ? AND role = 'student' AND active = 1 AND curriculum_type = 'CBE'
     LIMIT 1`,
    [studentId]
  );
  if (!students.length) {
    return res.status(400).json({ success: false, message: 'The selected learner is not an active CBE student.' });
  }
  if (['teacher', 'lecturer'].includes(String(req.user?.role || '').toLowerCase())) {
    const assignment = await query(
      `SELECT id FROM teacher_assignments
       WHERE teacher_id = ? AND class_name = ? AND academic_year = ? AND active = 1
         AND LOWER(TRIM(subject)) = LOWER(TRIM(?))
       LIMIT 1`,
      [req.user.id, students[0].className, academicYear, learningArea]
    );
    if (!assignment.length) {
      return res.status(403).json({ success: false, message: 'You can only assess learning areas assigned to you for this learner and academic year.' });
    }
  }

  const result = await query(
    `INSERT INTO cbe_assessments
      (student_id, curriculum_type, education_level, academic_year, learning_area,
       assessment_title, performance_descriptor, evidence, feedback, assessed_by)
     VALUES (?, 'CBE', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [studentId, students[0].className || null, academicYear, learningArea, assessmentTitle,
      performanceDescriptor, evidence, feedback, req.user.id]
  );
  await logActivity(req.user.id, 'cbe_assessment_created', `Recorded ${learningArea} assessment for CBE student #${studentId}`, req.ip);
  res.status(201).json({ success: true, id: result.insertId, message: 'CBE assessment saved.' });
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
  const formMatch = normalized.match(/(?:form\s*|^)([1-4])(?:\b|[A-Za-z]|$)/i) || normalized.match(/^([1-4])(?:\b|[A-Za-z]|$)/);
  if (formMatch) return `form${formMatch[1]}_transcript`;
  return null;
}

async function findStudentIdByAdmissionNumber(admissionNumber) {
  if (!admissionNumber) return null;
  const rows = await query(
    `SELECT id FROM students WHERE LOWER(admission_number) = LOWER(?) LIMIT 1`,
    [String(admissionNumber).trim()]
  );
  return rows[0] ? rows[0].id : null;
}

async function cleanupTranscriptDuplicates(tableName, studentId, academicYear, term) {
  const duplicateRows = await query(
    `SELECT id FROM ${tableName} WHERE student_id = ? AND academic_year = ? AND term = ? ORDER BY created_at DESC`,
    [studentId, academicYear, term]
  );
  if (duplicateRows.length <= 1) return;
  const idsToKeep = duplicateRows.map((row) => row.id);
  const idsToRemove = idsToKeep.slice(1);
  await query(
    `DELETE FROM ${tableName} WHERE id IN (${idsToRemove.map(() => '?').join(',')})`,
    idsToRemove
  );
}

async function syncTranscriptForStudent(studentId, academicYear, term, examType = null) {
  const studentRows = await query('SELECT id, name, admission_number, class_name, stream, curriculum_type FROM students WHERE id = ? LIMIT 1', [studentId]);
  const student = studentRows[0];
  if (!student || student.curriculum_type === 'CBE') return null;

  const tableName = transcriptTableForClassName(student.class_name);
  if (!tableName) return null;

  let sql = `SELECT subject, score FROM results WHERE student_id = ? AND academic_year = ? AND term = ?`;
  const params = [studentId, academicYear, term];
  if (examType) {
    sql += ' AND exam_type = ?';
    params.push(examType);
  }
  sql += ' ORDER BY subject';

  const rows = await query(sql, params);

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
      [...values.slice(0, 20), existing[0].id]
    );
  } else {
    await query(
      `INSERT INTO ${tableName} (adm, name, stream, eng, kisw, mat, bio, che, phy, cre, his, geo, comp, bus, agr, total, avg, grade, term, academic_year, student_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values
    );
  }

  await cleanupTranscriptDuplicates(tableName, student.id, academicYear, term);
  return { tableName, total, avg, grade };
}

async function listDocs(req, res) {
  try {
    const params = [];
    let whereClauses = [];
    let sql = `SELECT id, title, type, subject, class_name, topic, category, description,
                    filename, original_name, due_date, uploaded_at, created_at
             FROM academic_documents`;

    if (req.query.type) {
      whereClauses.push('type = ?');
      params.push(req.query.type);
    }

    if (req.query.subject) {
      whereClauses.push('LOWER(subject) = LOWER(?)');
      params.push(req.query.subject);
    }

    if (req.query.className || req.query.class_name) {
      const className = req.query.className || req.query.class_name;
      whereClauses.push('(class_name IS NULL OR class_name = ? OR class_name LIKE ?)');
      params.push(className, `${className}%`);
    } else if (req.user?.role === 'student' && req.user?.class_name) {
      whereClauses.push('(class_name IS NULL OR class_name = ? OR ? LIKE CONCAT(class_name, "%"))');
      params.push(req.user.class_name, req.user.class_name);
    }

    if (whereClauses.length) sql += ' WHERE ' + whereClauses.join(' AND ');

    const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit || 100, 10), 500));
    const offset = Math.max(0, Number.parseInt(req.query.offset || 0, 10));
    sql += ` ORDER BY uploaded_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('List academic docs error:', err);
    res.status(500).json({ success: false, message: 'Could not load documents' });
  }
}

async function listEntryStudents(req, res) {
  try {
    const filters = {
      className: req.query.className || req.query.class_name || null,
      stream: req.query.stream || null,
      subject: req.query.subject || null
    };
    const academicYear = req.query.academicYear || req.query.academic_year || String(new Date().getFullYear());
    const term = req.query.term || 'Term 1';
    const examType = req.query.examType || req.query.exam_type || 'End-Term';

    if (['lecturer', 'teacher'].includes(req.user?.role)) {
      const assignments = await query(
        `SELECT class_name AS className, subject FROM teacher_assignments
         WHERE teacher_id = ? AND academic_year = ? AND active = 1`,
        [req.user.id, academicYear]
      );
      const matching = assignments.filter((assignment) => {
        const classMatches = !filters.className || assignment.className.toLowerCase() === String(filters.className).toLowerCase();
        const subjectMatches = !filters.subject || assignment.subject.toLowerCase() === String(filters.subject).toLowerCase();
        return classMatches && subjectMatches;
      });
      if (!matching.length) return res.status(403).json({ success: false, message: 'This class is not assigned to you' });
      filters.className = matching[0].className;
      filters.subject = matching[0].subject;
    }

    const params = [];
    let where = "WHERE role = 'student' AND active = 1 AND COALESCE(curriculum_type, '8-4-4') = '8-4-4'";
    if (filters.className) {
      where += ' AND class_name = ?';
      params.push(filters.className);
    }
    if (filters.stream) {
      where += ' AND stream = ?';
      params.push(filters.stream);
    }

    const students = await query(
      `SELECT id, name, admission_number AS admissionNumber, class_name AS className, stream
       FROM students
       ${where}
       ORDER BY name`,
      params
    );

    if (students.length) {
      const studentIds = students.map((student) => student.id);
      const placeholders = studentIds.map(() => '?').join(',');
      const resultsRows = await query(
        `SELECT student_id, subject, score, grade
         FROM results
         WHERE academic_year = ? AND term = ? AND exam_type = ? AND student_id IN (${placeholders})
           ${filters.subject ? 'AND subject = ?' : ''}`,
        [academicYear, term, examType, ...studentIds, ...(filters.subject ? [filters.subject] : [])]
      );

      const resultsByStudent = {};
      resultsRows.forEach((row) => {
        resultsByStudent[row.student_id] = resultsByStudent[row.student_id] || {};
        resultsByStudent[row.student_id][row.subject] = {
          score: row.score,
          grade: row.grade
        };
      });

      students.forEach((student) => {
        student.results = resultsByStudent[student.id] || {};
      });
    }

    res.json({ success: true, students });
  } catch (error) {
    console.error('List academic entry students error:', error);
    res.status(500).json({ success: false, message: 'Could not load student list' });
  }
}

async function saveEntryResults(req, res) {
  try {
    const body = req.body || {};
    let entries = Array.isArray(body.entries) ? body.entries : [];
    const academicYear = body.academicYear || body.academic_year || null;
    const term = body.term || null;
    const examType = body.examType || body.exam_type || 'CAT 1';
    let subject = body.subject || null;
    const className = body.className || body.class_name || null;
    const admissionNumber = body.admissionNumber || body.admission_number || null;

    if (['lecturer', 'teacher'].includes(req.user?.role)) {
      if (!subject || !className) return res.status(400).json({ success: false, message: 'Assigned class and subject are required' });
      const assignmentRows = await query(
        `SELECT id FROM teacher_assignments
         WHERE teacher_id = ? AND class_name = ? AND subject = ? AND academic_year = ? AND active = 1 LIMIT 1`,
        [req.user.id, className, subject, academicYear]
      );
      if (!assignmentRows.length) return res.status(403).json({ success: false, message: 'This class and subject are not assigned to you' });

    }

    if (!subject || !entries.length) {
      return res.status(400).json({ success: false, message: 'Subject and student marks are required' });
    }

    // If the payload specifies a student by admission number, resolve that student.
    let defaultStudentId = null;
    if (admissionNumber) {
      defaultStudentId = await findStudentIdByAdmissionNumber(admissionNumber);
      if (!defaultStudentId) {
        return res.status(404).json({ success: false, message: 'Student not found for the provided admission number' });
      }
    }

    const resolvedEntries = entries.map((entry) => ({
      ...entry,
      resolvedStudentId: Number(entry.student_id || entry.studentId || defaultStudentId)
    }));
    if (resolvedEntries.some((entry) => !Number.isInteger(entry.resolvedStudentId) || entry.resolvedStudentId <= 0 || !Number.isFinite(Number(entry.score)))) {
      return res.status(400).json({ success: false, message: 'Every mark entry must include a valid student and score' });
    }
    const targetStudentIds = [...new Set(resolvedEntries.map((entry) => entry.resolvedStudentId))];
    if (targetStudentIds.length) {
      const placeholders = targetStudentIds.map(() => '?').join(',');
      if (['lecturer', 'teacher'].includes(req.user?.role)) {
        const assignedStudents = await query(
          `SELECT id FROM students
           WHERE id IN (${placeholders}) AND role = 'student' AND active = 1
             AND class_name = ? AND COALESCE(curriculum_type, '8-4-4') = '8-4-4'`,
          [...targetStudentIds, className]
        );
        if (assignedStudents.length !== targetStudentIds.length) {
          return res.status(403).json({ success: false, message: 'One or more students are outside your assigned class' });
        }
      }
      const compatibleStudents = await query(
        `SELECT id FROM students
         WHERE id IN (${placeholders}) AND role = 'student' AND active = 1
           AND COALESCE(curriculum_type, '8-4-4') = '8-4-4'`,
        targetStudentIds
      );
      if (compatibleStudents.length !== targetStudentIds.length) {
        return res.status(400).json({
          success: false,
          message: 'The existing examination-results module supports 8-4-4 students only; CBE records require a configured CBE assessment process.'
        });
      }
    }

    const saved = [];
    const syncedStudents = new Set();
    for (const entry of resolvedEntries) {
      const studentId = entry.resolvedStudentId;
      const score = Number(entry.score);

      await query('DELETE FROM results WHERE student_id = ? AND subject = ? AND academic_year = ? AND term = ? AND exam_type = ?', [studentId, subject, academicYear, term, examType]);
      const result = await query(
        `INSERT INTO results (student_id, subject, score, grade, term, academic_year, exam_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [studentId, subject, score, gradeForScore(score), term, academicYear, examType]
      );
      syncedStudents.add(studentId);
      saved.push({ id: result.insertId, studentId, score, grade: gradeForScore(score) });
    }

    for (const studentId of syncedStudents) {
      await syncTranscriptForStudent(studentId, academicYear, term, examType);
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
      transcriptSyncCount: syncedStudents.size,
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

async function teacherDashboard(req, res) {
  try {
    const year = Number(req.query.academicYear || new Date().getFullYear());
    const assignments = await query(
      `SELECT DISTINCT class_name AS className, subject
       FROM teacher_assignments
       WHERE teacher_id = ? AND academic_year = ? AND active = 1`,
      [req.user.id, year]
    );
    if (!assignments.length) return res.json({ success: true, assignments: [], performance: [], topStudents: [], students: [] });
    const classes = [...new Set(assignments.map((item) => item.className))];
    const classPlaceholders = classes.map(() => '?').join(',');
    const assignedResultScope = `EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id = ? AND ta.academic_year = ? AND ta.active = 1
        AND ta.class_name = s.class_name AND ta.subject = r.subject
    )`;
    const performance = await query(
      `SELECT r.subject, AVG(r.score) AS average
       FROM results r JOIN students s ON s.id = r.student_id
       WHERE s.role = 'student' AND s.active = 1 AND r.academic_year = ? AND ${assignedResultScope}
       GROUP BY r.subject ORDER BY r.subject`,
      [year, req.user.id, year]
    );
    const termPerformance = await query(
      `SELECT r.term, AVG(r.score) AS average
       FROM results r JOIN students s ON s.id = r.student_id
       WHERE s.role = 'student' AND s.active = 1 AND r.academic_year = ? AND ${assignedResultScope}
       GROUP BY r.term
       ORDER BY CASE r.term WHEN 'Term 1' THEN 1 WHEN 'Term 2' THEN 2 WHEN 'Term 3' THEN 3 ELSE 4 END`,
      [year, req.user.id, year]
    );
    const topStudents = await query(
      `SELECT s.name, s.admission_number AS admissionNumber, s.class_name AS className, AVG(r.score) AS average
       FROM results r JOIN students s ON s.id = r.student_id
       WHERE s.role = 'student' AND s.active = 1 AND r.academic_year = ? AND ${assignedResultScope}
       GROUP BY s.id ORDER BY average DESC LIMIT 10`,
      [year, req.user.id, year]
    );
    const students = await query(`SELECT id, name, admission_number AS admissionNumber, class_name AS className, stream FROM students WHERE role = 'student' AND active = 1 AND class_name IN (${classPlaceholders}) ORDER BY class_name, name`, classes);
    res.json({ success: true, assignments, performance, termPerformance, topStudents, students });
  } catch (error) {
    console.error('Teacher dashboard error:', error);
    res.status(500).json({ success: false, message: 'Could not load teacher dashboard' });
  }
}

async function saveStudentAttendance(req, res) {
  try {
    const attendanceDate = String(req.body.attendanceDate || '').trim();
    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
    const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(attendanceDate);
    const validDate = dateParts && new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3])))
      .toISOString().slice(0, 10) === attendanceDate;
    if (!validDate || !entries.length) return res.status(400).json({ success: false, message: 'A valid attendance date and at least one entry are required' });
    const normalizedEntries = entries.map((entry) => ({
      studentId: Number(entry.studentId),
      className: String(entry.className || '').trim(),
      status: String(entry.status || '').trim().toLowerCase()
    }));
    if (normalizedEntries.some((entry) => !Number.isInteger(entry.studentId) || entry.studentId <= 0 || !entry.className || !['present', 'late', 'absent'].includes(entry.status))) {
      return res.status(400).json({ success: false, message: 'Each entry must include a valid student, class, and attendance status' });
    }
    const entryKeys = normalizedEntries.map((entry) => `${entry.className}\u0000${entry.studentId}`);
    if (new Set(entryKeys).size !== entryKeys.length) {
      return res.status(400).json({ success: false, message: 'Duplicate student attendance entries are not allowed' });
    }
    if (['lecturer', 'teacher'].includes(req.user?.role)) {
      const classNames = [...new Set(normalizedEntries.map((entry) => entry.className))];
      const placeholders = classNames.map(() => '?').join(',');
      const assignments = await query(
        `SELECT DISTINCT class_name FROM teacher_assignments WHERE teacher_id = ? AND academic_year = ? AND active = 1 AND class_name IN (${placeholders})`,
        [req.user.id, new Date().getFullYear(), ...classNames]
      );
      if (assignments.length !== classNames.length) return res.status(403).json({ success: false, message: 'Attendance is limited to your assigned classes' });
    }
    const ownershipPredicate = normalizedEntries.map(() => '(id = ? AND class_name = ?)').join(' OR ');
    const ownedStudents = await query(
      `SELECT id, class_name FROM students
       WHERE role = 'student' AND active = 1 AND (${ownershipPredicate})`,
      normalizedEntries.flatMap((entry) => [entry.studentId, entry.className])
    );
    if (ownedStudents.length !== normalizedEntries.length) {
      return res.status(403).json({ success: false, message: 'One or more students do not belong to the submitted class' });
    }
    for (const entry of normalizedEntries) {
      await query(`INSERT INTO student_attendance (teacher_id, student_id, class_name, attendance_date, status) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status)`, [req.user.id, entry.studentId, entry.className, attendanceDate, entry.status]);
    }
    res.json({ success: true, message: `Saved ${normalizedEntries.length} attendance records` });
  } catch (error) {
    console.error('Student attendance error:', error);
    res.status(500).json({ success: false, message: 'Could not save student attendance' });
  }
}

async function saveLessonAttendance(req, res) {
  try {
    const attendanceDate = String(req.body.attendanceDate || '').trim();
    const status = String(req.body.status || '').trim().toLowerCase();
    const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';
    const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(attendanceDate);
    const validDate = dateParts && new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3])))
      .toISOString().slice(0, 10) === attendanceDate;
    if (!validDate || !['present', 'late', 'absent'].includes(status) || notes.length > 2000) {
      return res.status(400).json({ success: false, message: 'Provide a valid date, lesson status, and note under 2,000 characters' });
    }
    await query(`INSERT INTO teacher_lesson_attendance (teacher_id, attendance_date, status, notes) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), notes = VALUES(notes)`, [req.user.id, attendanceDate, status, notes || null]);
    res.json({ success: true, message: 'Lesson attendance saved' });
  } catch (error) {
    console.error('Lesson attendance error:', error);
    res.status(500).json({ success: false, message: 'Could not save lesson attendance' });
  }
}

// New: Average score per form (Form 1..4) for charting
async function formAverages(req, res) {
  try {
    const rows = await query(
      `SELECT s.class_name AS className, AVG(r.score) AS average
       FROM results r
       JOIN students s ON s.id = r.student_id
       WHERE s.class_name IN ('Form 1','Form 2','Form 3','Form 4')
       GROUP BY s.class_name
       ORDER BY s.class_name`
    );
    const result = { forms: ['Form 1','Form 2','Form 3','Form 4'], averages: {} };
    result.forms.forEach(f => { result.averages[f] = 0; });
    rows.forEach(r => { if (r.className) result.averages[r.className] = Number(r.average || 0).toFixed(2); });
    res.json(result);
  } catch (err) {
    console.error('Error computing form averages:', err);
    res.status(500).json({ success: false, message: 'Could not compute form averages' });
  }
}

async function createDoc(req, res) {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: 'File is required' });
    const body = req.body;
    if (['lecturer', 'teacher'].includes(req.user?.role)) {
      const assignmentRows = await query(
        `SELECT id FROM teacher_assignments
         WHERE teacher_id = ? AND class_name = ? AND subject = ? AND academic_year = ? AND active = 1 LIMIT 1`,
        [req.user.id, body.class_name || body.className, body.subject, Number(body.academicYear || new Date().getFullYear())]
      );
      if (!assignmentRows.length) return res.status(403).json({ success: false, message: 'You can only upload notes for assigned classes and subjects' });
    }
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
    const doc = { id: result.insertId, title: body.title || file.originalname, subject: body.subject || null, filename: file.filename };
    // Emit real-time event for student viewers
    try {
      if (io) io.emit('new_academic_doc', doc);
    } catch (e) { console.warn('Could not emit new_academic_doc', e.message || e); }
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

async function getStudentTranscript(req, res) {
  try {
    const studentId = req.user?.id;
    if (!studentId) return res.status(401).json({ error: 'Not authenticated' });

    const academicYear = req.query.academicYear || new Date().getFullYear();
    const className = req.query.className || 'Form 4';

    const studentRows = await query(
      'SELECT id, name, admission_number, stream, class_name, curriculum_type FROM students WHERE id = ? LIMIT 1',
      [studentId]
    );
    const student = studentRows[0];
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (student.curriculum_type === 'CBE') {
      return res.status(400).json({ error: 'CBE learners use the descriptive learning-assessment view, not the 8-4-4 numeric transcript.' });
    }

    // Fetch results grouped by term
    const results = await query(
      `SELECT term, subject, score, created_at FROM results
       WHERE student_id = ? AND academic_year = ?
       ORDER BY term, subject`,
      [studentId, academicYear]
    );

    // Group by term and compute averages
    const termMap = {};
    results.forEach(r => {
      if (!termMap[r.term]) termMap[r.term] = [];
      termMap[r.term].push(r);
    });

    const terms = Object.entries(termMap).map(([termName, subjects]) => {
      const scores = subjects
        .map(s => Number(s.score))
        .filter(s => Number.isFinite(s) && s >= 0);
      const average = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      
      return {
        term: termName,
        subjects: subjects.map(s => ({
          subject: s.subject,
          score: s.score,
          grade: gradeForScore(s.score),
          remarks: Number(s.score) >= 70 ? 'Good' : (Number(s.score) >= 50 ? 'Fair' : 'Needs improvement')
        })),
        average: average
      };
    });

    res.json({
      student: {
        id: student.id,
        name: student.name,
        admissionNumber: student.admission_number,
        className: student.class_name,
        stream: student.stream
      },
      academicYear,
      terms
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load transcript' });
  }
}

module.exports = {
  listDocs,
  listEntryStudents,
  saveEntryResults,
  academicDashboard,
  teacherDashboard,
  saveStudentAttendance,
  saveLessonAttendance,
  formAverages,
  createDoc,
  updateDoc,
  deleteDoc,
  serveDoc,
  docFileResponse,
  getStudentTranscript,
  listCbeAssessmentStudents,
  listCbeAssessments,
  createCbeAssessment
};
// export setter for io
module.exports.setIO = setIO;
