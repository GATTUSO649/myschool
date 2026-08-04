const fs = require('fs/promises');
const path = require('path');
const xlsx = require('xlsx');
const { query } = require('../config/db');

function gradeFromScore(score) {
  const n = Number(score);
  if (Number.isNaN(n)) return '';
  if (n >= 80) return 'A';
  if (n >= 70) return 'B';
  if (n >= 60) return 'C';
  if (n >= 50) return 'D';
  return 'E';
}

function transcriptColumnForSubject(subject) {
  const normalized = String(subject || '').trim().toLowerCase();
  if (normalized.includes('eng')) return 'eng';
  if (normalized.includes('kis')) return 'kisw';
  if (normalized.includes('math') || normalized === 'mat') return 'mat';
  if (normalized.includes('bio')) return 'bio';
  if (normalized.includes('chem') || normalized === 'che') return 'che';
  if (normalized.includes('phy')) return 'phy';
  if (normalized.includes('cre') || normalized.includes('religious')) return 'cre';
  if (normalized.includes('hist') || normalized.includes('government')) return 'his';
  if (normalized.includes('geo')) return 'geo';
  if (normalized.includes('comp')) return 'comp';
  if (normalized.includes('bus')) return 'bus';
  if (normalized.includes('agr')) return 'agr';
  return null;
}

const TRANSCRIPT_TABLES = ['form1_transcript', 'form2_transcript', 'form3_transcript', 'form4_transcript'];
const SUBJECT_FIELDS = ['eng', 'kisw', 'mat', 'bio', 'che', 'phy', 'cre', 'his', 'geo', 'comp', 'bus', 'agr'];

function parseFormNumber(className) {
  if (!className) return null;
  const normalized = String(className).trim();
  const match = normalized.match(/(?:form\s*|^)([1-4])(?:\b|[A-Za-z]|$)/i) || normalized.match(/^([1-4])(?:\b|[A-Za-z]|$)/);
  return match ? Number(match[1]) : null;
}

function transcriptTableForFormNumber(formNumber) {
  if (!formNumber || formNumber < 1 || formNumber > 4) return null;
  return `form${formNumber}_transcript`;
}

async function getTranscriptTableForStudent(studentId) {
  const rows = await query('SELECT class_name FROM students WHERE id = ? LIMIT 1', [studentId]);
  const student = rows[0];
  if (!student) return null;
  return transcriptTableForFormNumber(parseFormNumber(student.class_name));
}

function transcriptTableForClassName(className) {
  return transcriptTableForFormNumber(parseFormNumber(className));
}

function transcriptSelectForTable(tableName) {
  return `SELECT t.id, t.student_id, t.adm AS admission_number, t.name AS student_name, t.stream,
                 t.eng, t.kisw, t.mat, t.bio, t.che, t.phy, t.cre, t.his, t.geo, t.comp, t.bus, t.agr,
                 t.total, t.avg, t.grade, t.term, t.academic_year AS year, t.created_at,
                 s.class_name
          FROM ${tableName} t
          LEFT JOIN students s ON s.id = t.student_id`;
}

async function transcriptSelectAll(where = '') {
  const selects = [];
  for (const table of TRANSCRIPT_TABLES) {
    if (await tableExists(table)) {
      selects.push(transcriptSelectForTable(table));
    }
  }
  if (!selects.length) {
    return '';
  }
  return `${selects.join('\nUNION ALL\n')} ${where} ORDER BY year DESC, term DESC, student_name`;
}

async function tableExists(tableName) {
  const rows = await query(
    `SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName]
  );
  return rows && rows[0] && Number(rows[0].c) > 0;
}

async function getSheet1Columns() {
  const rows = await query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sheet1'`,
    []
  );
  return rows.map(row => String(row.COLUMN_NAME).toLowerCase());
}

function coalesceColumns(prefix, columns, availableColumns, alias, defaultExpression = 'NULL') {
  const valid = columns
    .filter(col => availableColumns.includes(col.toLowerCase()))
    .map(col => `${prefix}.${col}`);
  if (!valid.length) return `${defaultExpression} AS ${alias}`;
  return `COALESCE(${valid.join(', ')}) AS ${alias}`;
}

async function buildSheet1UserFilter(userId) {
  const cols = await getSheet1Columns();
  const has = name => cols.includes(name.toLowerCase());

  if (has('student_id')) {
    return { clause: 'WHERE s1.student_id = ?', params: [userId] };
  }

  const studentRows = await query('SELECT admission_number, email, name FROM students WHERE id = ? LIMIT 1', [userId]);
  const student = studentRows[0] || {};

  if (has('admission_number') && student.admission_number) {
    return { clause: 'WHERE s1.admission_number = ?', params: [student.admission_number] };
  }

  if (has('email') && student.email) {
    return { clause: 'WHERE s1.email = ?', params: [student.email] };
  }

  if (has('name') && student.name) {
    return { clause: 'WHERE s1.name = ?', params: [student.name] };
  }

  return { clause: 'WHERE 1=0', params: [] };
}

async function buildSheet1ClassFilter(className) {
  if (!className) return { clause: '', params: [] };
  const cols = await getSheet1Columns();
  const has = name => cols.includes(name.toLowerCase());

  if (has('class_name')) {
    return { clause: 'WHERE s1.class_name = ?', params: [className] };
  }
  if (has('class')) {
    return { clause: 'WHERE s1.class = ?', params: [className] };
  }
  if (has('form')) {
    return { clause: 'WHERE s1.form = ?', params: [className] };
  }
  return { clause: '', params: [] };
}

async function transcriptSelectSheet1(where = '') {
  const cols = await getSheet1Columns();
  const has = name => cols.includes(name.toLowerCase());
  const select = [
    has('class_name') || has('class') || has('form')
      ? coalesceColumns('s1', ['class_name', 'class', 'form'], cols, 'class_name')
      : 'NULL AS class_name',
    has('stream') ? 's1.stream AS stream' : 'NULL AS stream',
    has('id') ? 's1.id AS id' : 'NULL AS id',
    has('student_id') ? 's1.student_id AS student_id' : 'NULL AS student_id',
    has('name') || has('student_name') || has('student')
      ? coalesceColumns('s1', ['name', 'student_name', 'student'], cols, 'student_name')
      : 'NULL AS student_name',
    has('email') || has('student_email')
      ? coalesceColumns('s1', ['email', 'student_email'], cols, 'student_email')
      : 'NULL AS student_email',
    has('admission_number') || has('adm_no')
      ? coalesceColumns('s1', ['admission_number', 'adm_no'], cols, 'admission_number')
      : 'NULL AS admission_number',
    has('subject') || has('course') || has('course_name') || has('title')
      ? coalesceColumns('s1', ['subject', 'course', 'course_name', 'title'], cols, 'course')
      : 'NULL AS course',
    has('grade') ? 'COALESCE(s1.grade, \'\') AS grade' : 'NULL AS grade',
    has('score') || has('marks') || has('mark')
      ? coalesceColumns('s1', ['score', 'marks', 'mark'], cols, 'score')
      : 'NULL AS score',
    has('academic_year') || has('year')
      ? coalesceColumns('s1', ['academic_year', 'year'], cols, 'year')
      : 'NULL AS year',
    has('term') ? 's1.term AS term' : 'NULL AS term',
    has('exam_type') || has('exam')
      ? coalesceColumns('s1', ['exam_type', 'exam'], cols, 'exam_type')
      : 'NULL AS exam_type',
    has('created_at') ? 's1.created_at AS created_at' : 'NULL AS created_at'
  ];

  return `SELECT
             ${select.join(',\n             ')}
           FROM sheet1 s1
           ${where}
           ORDER BY year DESC, term DESC, student_name, course`;
}

function buildSheetKey(className, term, year) {
  return `${String(className || '').trim()}||${String(term || '').trim()}||${String(year || '').trim()}`;
}

function normalizeSheetValue(value) {
  return String(value || '').trim();
}

async function groupSheets(rows) {
  const sheetMap = {};
  rows.forEach(row => {
    const className = normalizeSheetValue(row.class_name || row.className || row.form || row.student_class || 'Unknown');
    const term = normalizeSheetValue(row.term || 'Unknown');
    const year = normalizeSheetValue(row.year || row.academic_year || new Date().getFullYear());
    const key = buildSheetKey(className, term, year);
    if (!sheetMap[key]) {
      sheetMap[key] = {
        sheetId: `${className} - ${term} - ${year}`,
        sheetName: `${className} ${term} ${year}`,
        class_name: className,
        term,
        year,
        record_count: 0
      };
    }
    sheetMap[key].record_count += 1;
  });
  return Object.values(sheetMap).sort((a, b) => {
    if (a.year !== b.year) return b.year.localeCompare(a.year, undefined, { numeric: true });
    if (a.term !== b.term) return a.term.localeCompare(b.term, undefined, { numeric: true });
    return a.class_name.localeCompare(b.class_name, undefined, { numeric: true });
  });
}

async function listTranscripts(req, res) {
  const classFilter = req.query.className || req.query.class_name;
  const termFilter = req.query.term;
  const yearFilter = req.query.year;
  const filterParams = [];
  const whereClauses = [];
  
  if (classFilter) {
    // Use exact class name matching for filtering
    whereClauses.push('s.class_name = ?');
    filterParams.push(classFilter);
  }
  
  if (termFilter) {
    whereClauses.push('t.term = ?');
    filterParams.push(termFilter);
  }
  
  if (yearFilter) {
    whereClauses.push('t.academic_year = ?');
    filterParams.push(yearFilter);
  }

  const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const sql = await transcriptSelectAll(where);
  let rows = sql ? await query(sql, filterParams) : [];

  if ((!rows || rows.length === 0) && (await tableExists('sheet1'))) {
    const sheetFilter = await buildSheet1ClassFilter(classFilter);
    const sql = await transcriptSelectSheet1(sheetFilter.clause);
    rows = await query(sql, sheetFilter.params);
  }

  res.json(rows);
}

async function listMyTranscripts(req, res) {
  const termFilter = String(req.query.term || '').trim();
  const yearFilter = String(req.query.year || req.query.academic_year || '').trim();
  const filters = ['t.student_id = ?'];
  const filterParams = [req.user.id];

  if (termFilter) {
    filters.push('LOWER(TRIM(t.term)) = LOWER(TRIM(?))');
    filterParams.push(termFilter);
  }
  if (yearFilter) {
    filters.push('CAST(t.academic_year AS CHAR) = ?');
    filterParams.push(yearFilter);
  }

  const transcriptSql = await transcriptSelectAll(`WHERE ${filters.join(' AND ')}`);
  const transcriptRows = transcriptSql ? await query(transcriptSql, filterParams) : [];
  if (transcriptRows && transcriptRows.length) {
    return res.json(transcriptRows);
  }

  if (await tableExists('sheet1')) {
    const filter = await buildSheet1UserFilter(req.user.id);
    const sql = await transcriptSelectSheet1(filter.clause);
    const rows = await query(sql, filter.params);
    const filteredRows = rows.filter((row) => {
      if (termFilter && String(row.term || '').trim().toLowerCase() !== termFilter.toLowerCase()) return false;
      if (yearFilter && String(row.year || row.academic_year || '').trim() !== yearFilter) return false;
      return true;
    });
    if (filteredRows.length) {
      return res.json(filteredRows);
    }
  }

  const studentRows = await query('SELECT id, name, admission_number, class_name, stream FROM students WHERE id = ? LIMIT 1', [req.user.id]);
  const student = studentRows[0];
  if (!student) {
    return res.json([]);
  }

  const fallbackTranscript = await buildTranscriptFromResults(student, termFilter, yearFilter);
  if (fallbackTranscript) {
    return res.json([fallbackTranscript]);
  }

  res.json([]);
}

async function listTranscriptSheets(req, res) {
  const classFilter = req.query.class_name || req.query.form || req.query.className;
  const termFilter = req.query.term;
  const yearFilter = req.query.year;
  const sql = await transcriptSelectAll();
  const rows = sql ? await query(sql, []) : [];
  const sheets = await groupSheets(rows);

  const filtered = sheets.filter(sheet => {
    if (classFilter && normalizeSheetValue(sheet.class_name).toLowerCase() !== normalizeSheetValue(classFilter).toLowerCase()) {
      return false;
    }
    if (termFilter && normalizeSheetValue(sheet.term).toLowerCase() !== normalizeSheetValue(termFilter).toLowerCase()) {
      return false;
    }
    if (yearFilter && normalizeSheetValue(sheet.year).toLowerCase() !== normalizeSheetValue(yearFilter).toLowerCase()) {
      return false;
    }
    return true;
  });

  res.json(filtered);
}

async function getTranscriptSheet(req, res) {
  const className = req.query.class_name || req.query.form;
  const term = req.query.term;
  const year = req.query.year;
  if (!className || !term || !year) {
    return res.status(400).json({ success: false, message: 'Class, term and year are required' });
  }

  const table = transcriptTableForClassName(className);
  if (!table || !(await tableExists(table))) {
    return res.status(400).json({ success: false, message: 'Unable to determine transcript table for this class' });
  }

  // Exact filter: only records matching term and year for this specific form table
  const rows = await query(
    `SELECT * FROM ${table} WHERE term = ? AND academic_year = ? ORDER BY adm, name`,
    [term, year]
  );
  res.json(rows);
}

async function saveTranscriptSheet(req, res) {
  const { class_name, term, year, records } = req.body;
  if (!class_name || !term || !year || !Array.isArray(records)) {
    return res.status(400).json({ success: false, message: 'class_name, term, year and records are required' });
  }

  const table = transcriptTableForClassName(class_name);
  if (!table || !(await tableExists(table))) {
    return res.status(400).json({ success: false, message: 'Unable to determine transcript table for this class' });
  }

  let created = 0;
  let updated = 0;

  for (const row of records) {
    if (!row.student_id) continue;
    const record = buildTranscriptRecord({
      student_id: row.student_id,
      adm: row.adm,
      name: row.name,
      stream: row.stream,
      term,
      year,
      academic_year: year,
      grade: row.grade,
      eng: row.eng,
      kisw: row.kisw,
      mat: row.mat,
      bio: row.bio,
      che: row.che,
      phy: row.phy,
      cre: row.cre,
      his: row.his,
      geo: row.geo,
      comp: row.comp,
      bus: row.bus,
      agr: row.agr
    });

    const existing = await query(
      `SELECT id FROM ${table} WHERE student_id = ? AND term = ? AND academic_year = ? LIMIT 1`,
      [record.student_id, term, year]
    );

    if (existing.length) {
      await query(
        `UPDATE ${table}
         SET student_id = ?, adm = ?, name = ?, stream = ?, eng = ?, kisw = ?, mat = ?, bio = ?, che = ?, phy = ?, cre = ?, his = ?, geo = ?, comp = ?, bus = ?, agr = ?, total = ?, avg = ?, grade = ?, term = ?, academic_year = ?
         WHERE id = ?`,
        [
          record.student_id,
          record.adm,
          record.name,
          record.stream,
          record.eng,
          record.kisw,
          record.mat,
          record.bio,
          record.che,
          record.phy,
          record.cre,
          record.his,
          record.geo,
          record.comp,
          record.bus,
          record.agr,
          record.total,
          record.avg,
          record.grade,
          record.term,
          record.academic_year,
          existing[0].id
        ]
      );
      updated += 1;
    } else {
      await query(
        `INSERT INTO ${table} (student_id, adm, name, stream, eng, kisw, mat, bio, che, phy, cre, his, geo, comp, bus, agr, total, avg, grade, term, academic_year)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.student_id,
          record.adm,
          record.name,
          record.stream,
          record.eng,
          record.kisw,
          record.mat,
          record.bio,
          record.che,
          record.phy,
          record.cre,
          record.his,
          record.geo,
          record.comp,
          record.bus,
          record.agr,
          record.total,
          record.avg,
          record.grade,
          record.term,
          record.academic_year
        ]
      );
      created += 1;
    }
  }

  res.json({ success: true, created, updated });
}

async function getTranscriptTableById(id) {
  const sql = `SELECT '${TRANSCRIPT_TABLES[0]}' AS table_name FROM ${TRANSCRIPT_TABLES[0]} WHERE id = ?
               UNION ALL
               SELECT '${TRANSCRIPT_TABLES[1]}' AS table_name FROM ${TRANSCRIPT_TABLES[1]} WHERE id = ?
               UNION ALL
               SELECT '${TRANSCRIPT_TABLES[2]}' AS table_name FROM ${TRANSCRIPT_TABLES[2]} WHERE id = ?
               UNION ALL
               SELECT '${TRANSCRIPT_TABLES[3]}' AS table_name FROM ${TRANSCRIPT_TABLES[3]} WHERE id = ?`;
  const rows = await query(sql, [id, id, id, id]);
  return rows[0] ? rows[0].table_name : null;
}

function parseSubjectScore(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildTranscriptRecord(body) {
  const record = {
    student_id: body.student_id,
    adm: body.adm || body.admission_number || body.admissionNumber || '',
    name: body.name || body.student_name || body.studentName || '',
    stream: body.stream || null,
    term: body.term || null,
    academic_year: body.year || body.academic_year || new Date().getFullYear(),
    grade: body.grade || null
  };

  SUBJECT_FIELDS.forEach(field => {
    record[field] = parseSubjectScore(body[field]);
  });

  const scores = SUBJECT_FIELDS.map(field => record[field]).filter(value => value !== null);
  record.total = scores.length ? scores.reduce((sum, value) => sum + value, 0) : null;
  record.avg = scores.length ? Number((record.total / scores.length).toFixed(2)) : null;
  record.grade = record.grade || gradeFromScore(record.avg);

  return record;
}

async function buildTranscriptFromResults(student, termFilter, yearFilter) {
  const params = [student.id];
  let where = 'WHERE student_id = ?';
  if (termFilter && String(termFilter).trim()) {
    where += ' AND LOWER(term) = LOWER(?)';
    params.push(String(termFilter).trim());
  }
  if (yearFilter && String(yearFilter).trim()) {
    where += ' AND CAST(academic_year AS CHAR) = ?';
    params.push(String(yearFilter).trim());
  }

  const rows = await query(
    `SELECT subject, score, term, academic_year, created_at
     FROM results
     ${where}
     ORDER BY academic_year DESC, term DESC, created_at DESC`,
    params
  );

  if (!rows.length) return null;

  const targetYear = rows[0].academic_year;
  const targetTerm = rows[0].term;
  const selectedRows = rows.filter((row) => String(row.academic_year) === String(targetYear) && String(row.term || '') === String(targetTerm || ''));
  const transcript = {
    id: null,
    adm: student.admission_number,
    name: student.name,
    stream: student.stream,
    term: targetTerm,
    academic_year: targetYear,
    created_at: rows[0].created_at
  };

  selectedRows.forEach((row) => {
    const column = transcriptColumnForSubject(row.subject);
    const score = Number(row.score);
    if (column && Number.isFinite(score)) transcript[column] = score;
  });

  const scores = SUBJECT_FIELDS.map((field) => transcript[field]).filter((value) => Number.isFinite(Number(value)));
  transcript.total = scores.length ? scores.reduce((sum, value) => sum + Number(value), 0) : null;
  transcript.avg = scores.length ? Number((transcript.total / scores.length).toFixed(2)) : null;
  transcript.grade = gradeFromScore(transcript.avg);
  transcript.remark = scores.length
    ? `Generated from published result entries for ${targetTerm || 'the selected term'}.`
    : 'No subject marks are available for this academic period.';

  return transcript;
}

async function createTranscript(req, res) {
  const body = req.body;
  if (!body.student_id) {
    return res.status(400).json({ success: false, message: 'Student is required' });
  }

  const table = await getTranscriptTableForStudent(body.student_id);
  if (!table || !(await tableExists(table))) {
    return res.status(400).json({ success: false, message: 'Unable to determine transcript table for student form' });
  }

  const record = buildTranscriptRecord(body);
  const result = await query(
    `INSERT INTO ${table} (student_id, adm, name, stream, eng, kisw, mat, bio, che, phy, cre, his, geo, comp, bus, agr, total, avg, grade, term, academic_year)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.student_id,
      record.adm,
      record.name,
      record.stream,
      record.eng,
      record.kisw,
      record.mat,
      record.bio,
      record.che,
      record.phy,
      record.cre,
      record.his,
      record.geo,
      record.comp,
      record.bus,
      record.agr,
      record.total,
      record.avg,
      record.grade,
      record.term,
      record.academic_year
    ]
  );
  res.status(201).json({ success: true, id: result.insertId });
}

async function updateTranscript(req, res) {
  const body = req.body;
  const table = await getTranscriptTableById(req.params.id);
  if (!table) {
    return res.status(404).json({ success: false, message: 'Transcript record not found' });
  }

  const record = buildTranscriptRecord(body);
  await query(
    `UPDATE ${table}
     SET student_id = ?, adm = ?, name = ?, stream = ?, eng = ?, kisw = ?, mat = ?, bio = ?, che = ?, phy = ?, cre = ?, his = ?, geo = ?, comp = ?, bus = ?, agr = ?, total = ?, avg = ?, grade = ?, term = ?, academic_year = ?
     WHERE id = ?`,
    [
      record.student_id,
      record.adm,
      record.name,
      record.stream,
      record.eng,
      record.kisw,
      record.mat,
      record.bio,
      record.che,
      record.phy,
      record.cre,
      record.his,
      record.geo,
      record.comp,
      record.bus,
      record.agr,
      record.total,
      record.avg,
      record.grade,
      record.term,
      record.academic_year,
      req.params.id
    ]
  );
  res.json({ success: true });
}

async function deleteTranscript(req, res) {
  const table = await getTranscriptTableById(req.params.id);
  if (!table) {
    return res.status(404).json({ success: false, message: 'Transcript record not found' });
  }

  await query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
  res.json({ success: true });
}

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  values.push(value.trim());
  return values;
}

function normalizeHeader(header) {
  return String(header || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function normalizeRowKeys(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), String(value || '').trim()]));
}

async function uploadCsv(req, res) {
  if (!req.file) return res.status(400).json({ success: false, message: 'Transcript file is required' });

  const extension = path.extname(req.file.originalname || req.file.filename).toLowerCase();
  let rows = [];
  const errors = [];
  let imported = 0;

  if (extension === '.csv') {
    const text = await fs.readFile(req.file.path, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return res.status(400).json({ success: false, message: 'CSV has no data rows' });

    const headers = parseCsvLine(lines[0]).map(normalizeHeader);
    rows = lines.slice(1).map(line => {
      const values = parseCsvLine(line);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
    });
  } else if (extension === '.xlsx' || extension === '.xls') {
    const workbook = xlsx.readFile(req.file.path, { cellDates: true });
    const sheetName = workbook.SheetNames.find(name => name.toLowerCase() === 'sheet1') || workbook.SheetNames[0];
    if (!sheetName) return res.status(400).json({ success: false, message: 'Excel workbook contains no sheets' });

    const worksheet = workbook.Sheets[sheetName];
    rows = xlsx.utils.sheet_to_json(worksheet, { defval: '' })
      .map(normalizeRowKeys)
      .filter(row => Object.values(row).some(value => value !== ''));
    if (!rows.length) return res.status(400).json({ success: false, message: 'Excel sheet has no data rows' });
  } else {
    return res.status(400).json({ success: false, message: 'Unsupported transcript file type. Use CSV or XLSX.' });
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    try {
      const identifier = row.student_id || row.admission_number || row.adm_no || row.email || row.student || row.name;
      const students = await query(
        `SELECT id FROM students
         WHERE id = ? OR admission_number = ? OR email = ? OR name = ?
         LIMIT 1`,
        [identifier || 0, identifier, identifier, identifier]
      );
      if (!students.length) throw new Error(`Student not found: ${identifier || 'unknown'}`);

      const table = await getTranscriptTableForStudent(students[0].id);
      if (!table || !(await tableExists(table))) {
        throw new Error(`Unable to determine transcript table for student ${students[0].id}`);
      }

      const record = buildTranscriptRecord({
        student_id: students[0].id,
        adm: row.adm || row.admission_number || row.adm_no || '',
        name: row.name || row.student || row.student_name || '',
        stream: row.stream || row.class_name || row.class || row.form || '',
        term: row.term || '',
        academic_year: row.year || row.academic_year || row.academicYear || new Date().getFullYear(),
        grade: row.grade || '',
        eng: row.eng || row.english || row.eng_score || '',
        kisw: row.kisw || row.kiswahili || row.kisw_score || '',
        mat: row.mat || row.math || row.mat_score || '',
        bio: row.bio || '',
        che: row.che || '',
        phy: row.phy || '',
        cre: row.cre || '',
        his: row.his || '',
        geo: row.geo || '',
        comp: row.comp || row.computer || '',
        bus: row.bus || '',
        agr: row.agr || row.agriculture || ''
      });

      await query(
        `INSERT INTO ${table} (student_id, adm, name, stream, eng, kisw, mat, bio, che, phy, cre, his, geo, comp, bus, agr, total, avg, grade, term, academic_year)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.student_id,
          record.adm,
          record.name,
          record.stream,
          record.eng,
          record.kisw,
          record.mat,
          record.bio,
          record.che,
          record.phy,
          record.cre,
          record.his,
          record.geo,
          record.comp,
          record.bus,
          record.agr,
          record.total,
          record.avg,
          record.grade,
          record.term,
          record.academic_year
        ]
      );
      imported += 1;
    } catch (error) {
      errors.push({ row: i + 2, message: error.message });
    }
  }

  res.status(201).json({ success: true, imported, errors });
}

async function searchStudent(req, res) {
  const { query: searchQuery } = req.query;
  if (!searchQuery || String(searchQuery).trim().length === 0) {
    return res.json({ success: false, data: [] });
  }

  const search = `%${searchQuery.trim()}%`;
  const rows = await query(
    `SELECT id, admission_number AS adm, name, class_name, stream 
     FROM students 
     WHERE admission_number LIKE ? OR name LIKE ? 
     LIMIT 10`,
    [search, search]
  );

  const results = await Promise.all(rows.map(async (student) => {
    const table = transcriptTableForFormNumber(parseFormNumber(student.class_name));
    const transcriptRow = table ? await query(`SELECT * FROM ${table} WHERE student_id = ? LIMIT 1`, [student.id]) : [];
    return {
      id: student.id,
      adm: student.adm,
      name: student.name,
      stream: student.stream || '',
      class_name: student.class_name,
      existing_transcript: transcriptRow[0] || null
    };
  }));

  res.json({ success: true, data: results });
}

async function getStudentTranscriptByAdm(req, res) {
  const { adm } = req.params;
  const { form, term } = req.query;
  const requestedAdm = String(adm || '').trim();

  if (!requestedAdm) {
    return res.status(400).json({ success: false, message: 'Admission number is required' });
  }

  const canViewAny = ['admin', 'rba'].includes(req.user?.role);
  if (!canViewAny && (!req.user || !req.user.admission_number || String(req.user.admission_number).trim().toLowerCase() !== requestedAdm.toLowerCase())) {
    return res.status(403).json({ success: false, message: 'You are not authorized to view this transcript' });
  }

  try {
    const studentRows = await query(
      `SELECT id, name, admission_number, class_name, stream
       FROM students
       WHERE LOWER(admission_number) = LOWER(?)
       LIMIT 1`,
      [requestedAdm]
    );
    const student = studentRows[0];
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    let tableNames = TRANSCRIPT_TABLES;
    const currentFormTable = transcriptTableForFormNumber(parseFormNumber(student.class_name));
    if (form && String(form).trim().length > 0) {
      const formTable = transcriptTableForFormNumber(parseFormNumber(form));
      if (!formTable) {
        return res.status(400).json({ success: false, message: 'Invalid form selected' });
      }
      tableNames = [formTable];
    } else if (currentFormTable) {
      tableNames = [currentFormTable, ...TRANSCRIPT_TABLES.filter(t => t !== currentFormTable)];
    }

    const transcriptQueries = tableNames.map((table) => {
      let sql = `SELECT *, '${table}' AS source_table FROM ${table} WHERE LOWER(adm) = LOWER(?)`;
      const params = [requestedAdm];
      if (term && String(term).trim().length > 0) {
        sql += ' AND LOWER(term) = LOWER(?)';
        params.push(term.trim());
      }
      sql += ' ORDER BY academic_year DESC, term DESC LIMIT 1';
      return query(sql, params);
    });

    let results = await Promise.all(transcriptQueries);
    let transcriptRow = results.find(r => r && r.length > 0)?.[0];

    if (!transcriptRow) {
      const fallbackQueries = tableNames.map((table) => {
        let sql = `SELECT *, '${table}' AS source_table FROM ${table} WHERE student_id = ?`;
        const params = [student.id];
        if (term && String(term).trim().length > 0) {
          sql += ' AND LOWER(term) = LOWER(?)';
          params.push(term.trim());
        }
        sql += ' ORDER BY academic_year DESC, term DESC LIMIT 1';
        return query(sql, params);
      });
      const fallbackResults = await Promise.all(fallbackQueries);
      transcriptRow = fallbackResults.find(r => r && r.length > 0)?.[0];
    }
    
    const transcriptData = transcriptRow || await buildTranscriptFromResults(student, term);

    if (!transcriptData) {
      return res.status(404).json({ success: false, message: 'No transcript found for this admission number and selected filters' });
    }

    res.json({
      success: true,
      data: {
        student: {
          id: student.id,
          adm: student.admission_number,
          name: student.name,
          stream: student.stream,
          class: student.class_name
        },
        transcript: {
          id: transcriptData.id,
          adm: transcriptData.adm,
          name: transcriptData.name,
          stream: transcriptData.stream,
          eng: transcriptData.eng,
          kisw: transcriptData.kisw,
          mat: transcriptData.mat,
          bio: transcriptData.bio,
          che: transcriptData.che,
          phy: transcriptData.phy,
          cre: transcriptData.cre,
          his: transcriptData.his,
          geo: transcriptData.geo,
          comp: transcriptData.comp,
          bus: transcriptData.bus,
          agr: transcriptData.agr,
          total: transcriptData.total,
          avg: transcriptData.avg,
          grade: transcriptData.grade,
          term: transcriptData.term,
          academic_year: transcriptData.academic_year,
          created_at: transcriptData.created_at,
          remark: transcriptData.remark
        }
      }
    });
  } catch (err) {
    console.error('Error fetching transcript:', err);
    res.status(500).json({ success: false, message: 'Error fetching transcript data' });
  }
}

async function getStudentsForNewSheet(req, res) {
  try {
    const className = req.query.class_name || req.query.form;

    let students = [];
    
    if (className) {
      // Normalize the requested class name
      const normalizedRequestClass = String(className).trim().toLowerCase();
      
      // Get the form number if it's a form-based class name
      const formNumber = parseFormNumber(className);
      
      // Query students and filter by exact class match
      const allStudents = await query(
        `SELECT s.id, s.name, s.admission_number, s.class_name, s.stream, c.name as current_class
         FROM students s
         LEFT JOIN classes c ON s.class_name = c.name
         WHERE s.active = 1 AND s.role = 'student'
         ORDER BY s.class_name, s.name`,
        []
      );
      
      // Filter for exact class matches
      students = allStudents.filter(student => {
        const studentClass = String(student.class_name || student.current_class || '').trim().toLowerCase();
        
        // Try exact match first
        if (studentClass === normalizedRequestClass) {
          return true;
        }
        
        // If form number was detected, also match by form number in class name
        if (formNumber) {
          const studentFormNumber = parseFormNumber(student.class_name || student.current_class);
          if (studentFormNumber === formNumber) {
            return true;
          }
        }
        
        return false;
      });
    } else {
      // Get all active students from all forms
      students = await query(
        `SELECT s.id, s.name, s.admission_number, s.class_name, s.stream, c.name as current_class
         FROM students s
         LEFT JOIN classes c ON s.class_name = c.name
         WHERE s.active = 1 AND s.role = 'student'
         ORDER BY s.class_name, s.name`,
        []
      );
    }

    res.json({
      success: true,
      data: students.map(s => ({
        id: s.id,
        student_id: s.id,
        name: s.name,
        admission_number: s.admission_number,
        adm: s.admission_number,
        class_name: s.class_name || s.current_class || className || 'All Forms',
        stream: s.stream || 'A'  // Default to stream A if not assigned
      }))
    });
  } catch (err) {
    console.error('Error fetching students for new sheet:', err);
    res.status(500).json({ success: false, message: 'Error fetching students' });
  }
}

module.exports = {
  listTranscripts,
  listTranscriptSheets,
  getTranscriptSheet,
  saveTranscriptSheet,
  listMyTranscripts,
  createTranscript,
  updateTranscript,
  deleteTranscript,
  uploadCsv,
  searchStudent,
  getStudentTranscriptByAdm,
  getStudentsForNewSheet
};
