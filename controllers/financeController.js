const fs = require('fs/promises');
const path = require('path');
const { query } = require('../config/db');
const { logActivity } = require('./logController');

// Simple in-memory cache for overview charts (fallback)
const OVERVIEW_CHARTS_CACHE_TTL = 30 * 1000; // 30 seconds
let overviewChartsCache = { ts: 0, data: null };

// Optional Redis-backed cache (preferred when configured)
let redisClient = null;
let redisAvailable = false;
const REDIS_KEY = 'finance:overview_charts_v1';
try {
  const { createClient } = require('redis');
  const redisUrl = process.env.REDIS_URL || null;
  if (redisUrl) {
    redisClient = createClient({ url: redisUrl });
    // connect but don't block startup if connection fails
    redisClient.connect().then(() => {
      redisAvailable = true;
      console.log('Redis: connected for overview charts cache');
    }).catch((e) => {
      console.warn('Redis: could not connect, falling back to memory cache', e.message || e);
      redisAvailable = false;
      redisClient = null;
    });
  }
} catch (e) {
  // redis module not installed or other error — we'll use in-memory cache
  redisAvailable = false;
  redisClient = null;
}

// Socket IO instance (set by server)
let io = null;
function setIO(ioInstance) { io = ioInstance; }

async function getCachedOverviewCharts() {
  // try Redis first
  try {
    if (redisAvailable && redisClient) {
      const raw = await redisClient.get(REDIS_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Redis get failed, will fallback to memory cache', e.message || e);
  }
  // memory fallback
  if (overviewChartsCache.data && (Date.now() - overviewChartsCache.ts) < OVERVIEW_CHARTS_CACHE_TTL) {
    return overviewChartsCache.data;
  }
  return null;
}

async function setCachedOverviewCharts(data) {
  // set Redis and memory
  try {
    if (redisAvailable && redisClient) {
      await redisClient.set(REDIS_KEY, JSON.stringify(data), { EX: Math.round(OVERVIEW_CHARTS_CACHE_TTL / 1000) });
    }
  } catch (e) {
    console.warn('Redis set failed, stored in memory cache only', e.message || e);
  }
  overviewChartsCache = { ts: Date.now(), data };
}

function money(amount) {
  return `KSh ${Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function html(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function balanceRow(row) {
  const totalCharges = Number(row.total_charges || 0);
  const totalPaid = Number(row.total_paid || 0);
  return {
    student_id: row.student_id,
    id: row.student_id,
    name: row.name,
    student_name: row.name,
    admissionNumber: row.admission_number,
    admission_number: row.admission_number,
    className: row.class_name,
    class_name: row.class_name,
    stream: row.stream,
    total_charges: totalCharges,
    total_charged: totalCharges,
    total_paid: totalPaid,
    paid: totalPaid,
    balance: totalCharges - totalPaid
  };
}

function classMatchesExpression(alias = 'd') {
  return `(${alias}.target_class IS NULL OR ${alias}.target_class = ? OR ? LIKE CONCAT(${alias}.target_class, '%') OR ${alias}.target_class LIKE CONCAT(?, '%'))`;
}

async function getBalanceRows(filters = {}) {
  const params = [];
  let where = "WHERE s.role = 'student' AND s.active = 1";
  if (filters.className) {
    where += ' AND s.class_name = ?';
    params.push(filters.className);
  }
  if (filters.studentId) {
    where += ' AND s.id = ?';
    params.push(filters.studentId);
  }

  const rows = await query(
    `SELECT s.id AS student_id, s.name, s.admission_number, s.class_name, s.stream,
            COALESCE(c.total_charges, 0) AS total_charges,
            COALESCE(p.total_paid, 0) AS total_paid
     FROM students s
     LEFT JOIN (
       SELECT student_id, SUM(amount) total_charges
       FROM fee_charges
       WHERE LOWER(description) NOT LIKE '%test charge%'
         AND (category IS NULL OR LOWER(category) NOT LIKE '%test charge%')
       GROUP BY student_id
     ) c ON c.student_id = s.id
     LEFT JOIN (
       SELECT student_id, SUM(amount) total_paid
       FROM fee_payments
       GROUP BY student_id
     ) p ON p.student_id = s.id
     ${where}
     ORDER BY s.class_name, s.stream, s.name`, params);

  return rows.map(balanceRow);
}

async function getStatement(studentId, filters = {}) {
  const balance = (await getBalanceRows({ studentId }))[0];
  if (!balance) return null;

  const entryParams = [studentId];
  const termFilter = filters.term ? ' AND term = ?' : '';
  const yearFilter = filters.academic_year ? ' AND academic_year = ?' : '';
  if (filters.term) entryParams.push(filters.term);
  if (filters.academic_year) entryParams.push(filters.academic_year);

  const charges = await query(
    `SELECT id, 'charge' AS entry_type, description, amount, category, term, academic_year,
            due_date, created_at, NULL AS receipt_number, NULL AS payment_method, NULL AS reference
     FROM fee_charges
     WHERE student_id = ? AND (description IS NULL OR LOWER(description) NOT LIKE '%test charge%')${termFilter}${yearFilter}`,
    entryParams
  );

  const payments = await query(
    `SELECT id, 'payment' AS entry_type, description, amount, NULL AS category, term, academic_year,
            NULL AS due_date, created_at, receipt_number, payment_method, reference
     FROM fee_payments
     WHERE student_id = ?${termFilter}${yearFilter}`,
    entryParams
  );

  const entries = [...charges, ...payments]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((entry) => ({
      ...entry,
      debit: entry.entry_type === 'charge' ? Number(entry.amount) : 0,
      credit: entry.entry_type === 'payment' ? Number(entry.amount) : 0
    }));

  const totalCharges = entries.reduce((sum, entry) => sum + entry.debit, 0);
  const totalPaid = entries.reduce((sum, entry) => sum + entry.credit, 0);

  return {
    student: {
      id: balance.student_id,
      name: balance.name,
      admissionNumber: balance.admissionNumber,
      className: balance.className,
      stream: balance.stream
    },
    totals: {
      total_charges: totalCharges,
      total_paid: totalPaid,
      balance: totalCharges - totalPaid
    },
    lifetimeTotals: {
      total_charges: balance.total_charges,
      total_paid: balance.total_paid,
      balance: balance.balance
    },
    entries
  };
}

function renderStatementHtml(statement, filters = {}) {
  let running = 0;
  const rows = statement.entries.map((entry) => {
    running += entry.debit - entry.credit;
    return `
      <tr>
        <td>${html(new Date(entry.created_at).toLocaleDateString())}</td>
        <td>${html(entry.description || entry.entry_type)}</td>
        <td>${html(entry.term || '')}</td>
        <td>${html(entry.academic_year || '')}</td>
        <td class="num">${entry.debit ? money(entry.debit) : '-'}</td>
        <td class="num">${entry.credit ? money(entry.credit) : '-'}</td>
        <td class="num">${money(running)}</td>
      </tr>`;
  }).join('');

  const period = [
    filters.term || 'All terms',
    filters.academic_year || 'All years'
  ].join(' / ');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Fee Statement - ${html(statement.student.name)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
    header { border-bottom: 3px solid #0f766e; padding-bottom: 16px; margin-bottom: 24px; }
    h1, h2, p { margin: 0 0 8px; }
    .meta, .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 18px 0; }
    .box { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; }
    .label { color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .value { font-weight: 700; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    th, td { border: 1px solid #d1d5db; padding: 10px; text-align: left; }
    th { background: #f3f4f6; }
    .num { text-align: right; white-space: nowrap; }
    .balance { color: ${statement.totals.balance > 0 ? '#b91c1c' : '#047857'}; }
    footer { margin-top: 24px; color: #6b7280; font-size: 12px; }
    @media print { body { margin: 16px; } }
  </style>
</head>
<body>
  <header>
    <h1>CRESENT HIGH SCHOOL</h1>
    <p style="margin:4px 0 8px;color:#475569;font-size:0.95rem;">Official Fee Statement / School Letterhead</p>
    <h2>Fee Statement</h2>
    <p>Period: ${html(period)}</p>
  </header>
  <section class="meta">
    <div class="box"><div class="label">Student</div><div class="value">${html(statement.student.name)}</div></div>
    <div class="box"><div class="label">Admission No.</div><div class="value">${html(statement.student.admissionNumber)}</div></div>
    <div class="box"><div class="label">Class / Stream</div><div class="value">${html(statement.student.className || '-')} ${html(statement.student.stream || '')}</div></div>
  </section>
  <section class="summary">
    <div class="box"><div class="label">Total Billed</div><div class="value">${money(statement.totals.total_charges)}</div></div>
    <div class="box"><div class="label">Total Paid</div><div class="value">${money(statement.totals.total_paid)}</div></div>
    <div class="box"><div class="label">Balance</div><div class="value balance">${money(statement.totals.balance)}</div></div>
  </section>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th>Term</th>
        <th>Year</th>
        <th>Debit</th>
        <th>Credit</th>
        <th>Running Balance</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="7">No fee transactions found for this period.</td></tr>'}</tbody>
  </table>
  <footer>Generated on ${html(new Date().toLocaleString())}</footer>
</body>
</html>`;
}

async function overview(req, res) {
  const termFilter = req.query.term ? ' AND term = ?' : '';
  const yearFilter = req.query.academic_year ? ' AND academic_year = ?' : '';
  const classFilter = req.query.className || req.query.class_name ? ' AND student_id IN (SELECT id FROM students WHERE class_name = ?)' : '';

  const studentParams = [];
  let studentWhere = ' WHERE role = "student" AND active = 1';
  if (req.query.className || req.query.class_name) {
    studentWhere += ' AND class_name = ?';
    studentParams.push(req.query.className || req.query.class_name);
  }

  const params = [];
  if (req.query.term) params.push(req.query.term);
  if (req.query.academic_year) params.push(req.query.academic_year);
  if (req.query.className || req.query.class_name) params.push(req.query.className || req.query.class_name);

  const [students] = await query(`SELECT COUNT(*) AS count FROM students${studentWhere}`, studentParams);
  const [charges] = await query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM fee_charges WHERE 1=1${termFilter}${yearFilter}${classFilter}`,
    params
  );
  const [payments] = await query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM fee_payments WHERE 1=1${termFilter}${yearFilter}${classFilter}`,
    params
  );
  const [today] = await query('SELECT COUNT(*) AS count FROM fee_payments WHERE DATE(created_at) = CURDATE()');
  const billed = Number(charges.total);
  const paid = Number(payments.total);
  res.json({
    students: students.count,
    billed,
    paid,
    balance: billed - paid,
    total_charged: billed,
    total_charges: billed,
    total_paid: paid,
    total_balance: billed - paid,
    payments_today: Number(today.count)
  });
}

// Server-side aggregation for overview charts: per-form counts, paid/charged/outstanding and monthly trends
async function overviewCharts(req, res) {
  try {
    // allow bypassing cache with ?no_cache=1
    const bypass = req.query && (req.query.no_cache === '1' || req.query.no_cache === 'true');
    if (!bypass) {
      const cached = await getCachedOverviewCharts();
      if (cached) return res.json(cached);
    }
    // Forms to include
    const forms = ['Form 1','Form 2','Form 3','Form 4'];

    // Student counts per form
    const studentRows = await query(
      `SELECT class_name, COUNT(*) AS count FROM students WHERE role = 'student' AND active = 1 GROUP BY class_name`
    );
    const counts = {};
    forms.forEach(f => counts[f] = 0);
    studentRows.forEach(r => { if (r.class_name) counts[r.class_name] = Number(r.count || 0); });

    // Sum of charges per form
    const chargeRows = await query(
      `SELECT s.class_name, COALESCE(SUM(fc.amount),0) AS total_charged
       FROM fee_charges fc
       JOIN students s ON s.id = fc.student_id
       WHERE s.role = 'student' AND s.active = 1
       GROUP BY s.class_name`
    );
    const charged = {};
    forms.forEach(f => charged[f] = 0);
    chargeRows.forEach(r => { if (r.class_name) charged[r.class_name] = Number(r.total_charged || 0); });

    // Sum of payments per form
    const paymentRows = await query(
      `SELECT s.class_name, COALESCE(SUM(fp.amount),0) AS total_paid
       FROM fee_payments fp
       JOIN students s ON s.id = fp.student_id
       WHERE s.role = 'student' AND s.active = 1
       GROUP BY s.class_name`
    );
    const paid = {};
    forms.forEach(f => paid[f] = 0);
    paymentRows.forEach(r => { if (r.class_name) paid[r.class_name] = Number(r.total_paid || 0); });

    // Monthly trends per form (payments)
    const trendRows = await query(
      `SELECT s.class_name, MONTH(fp.created_at) AS month, COALESCE(SUM(fp.amount),0) AS total
       FROM fee_payments fp
       JOIN students s ON s.id = fp.student_id
       WHERE s.role = 'student' AND s.active = 1
       GROUP BY s.class_name, MONTH(fp.created_at)`
    );
    const trends = {};
    forms.forEach(f => trends[f] = Array(12).fill(0));
    trendRows.forEach(r => {
      const mn = Number(r.month || 0);
      const cls = r.class_name || 'Unknown';
      if (!trends[cls]) trends[cls] = Array(12).fill(0);
      if (mn >=1 && mn <=12) trends[cls][mn-1] = Number(r.total || 0);
    });

    // Compose response
    const result = {
      forms,
      counts,
      charged,
      paid,
      outstanding: forms.reduce((acc, f) => { acc[f] = charged[f] - paid[f]; return acc; }, {}),
      trends
    };

    // store in cache (Redis preferred)
    await setCachedOverviewCharts(result);
    res.json(result);
  } catch (err) {
    console.error('Error in overviewCharts:', err);
    res.status(500).json({ success: false, message: 'Could not compute overview charts' });
  }
}

async function balances(req, res) {
  const filters = { className: req.query.className || req.query.class_name };
  if (!['admin', 'finance', 'rba'].includes(req.user.role)) {
    const statement = await getStatement(req.user.id);
    if (!statement) return res.status(404).json({ success: false, message: 'Student balance not found' });
    return res.json({
      ...statement.totals,
      total_charged: statement.totals.total_charges,
      paid: statement.totals.total_paid,
      balance: statement.totals.balance,
      entries: statement.entries
    });
  }
  res.json(await getBalanceRows(filters));
}

async function statement(req, res) {
  const canViewStudent = ['admin', 'finance', 'rba'].includes(req.user.role);
  const studentId = canViewStudent && req.query.student_id ? req.query.student_id : req.user.id;
  const data = await getStatement(studentId, {
    term: req.query.term,
    academic_year: req.query.academic_year
  });
  if (!data) return res.status(404).json({ success: false, message: 'Statement not found' });
  res.json(data);
}

function getAuditUserId(user) {
  if (!user) return null;
  if (user.role === 'admin' || Number(user.id) <= 0) return null;
  return Number(user.id);
}

async function postCharges(req, res) {
  try {
    const body = req.body;
    if (!body.description || Number(body.amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Description and amount are required' });
    }

    let students = [];
    if (body.target === 'all') {
      students = await query("SELECT id FROM students WHERE role = 'student' AND active = 1");
    } else if (body.target === 'class') {
      students = await query("SELECT id FROM students WHERE role = 'student' AND active = 1 AND class_name = ?", [body.className || body.class_name]);
    } else {
      students = (body.student_ids || []).map(id => ({ id }));
    }

    const createdBy = getAuditUserId(req.user);
    for (const student of students) {
      await query(
        `INSERT INTO fee_charges (student_id, description, amount, category, academic_year, term, due_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [student.id, body.description, body.amount, body.category || null, body.academic_year || new Date().getFullYear(), body.term || null, body.due_date || null, createdBy]
      );
    }
    await logActivity(req.user.id, 'fee_charge_posted', `Posted ${body.description} to ${students.length} student(s)`, req.ip);
    res.json({ success: true, count: students.length });
  } catch (error) {
    console.error('Post charges error:', error);
    res.status(500).json({ success: false, message: 'Could not post charges' });
  }
}

async function recordPayment(req, res) {
  try {
    const body = req.body;
    if (!body.student_id || Number(body.amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Student and amount are required' });
    }

    const receipt = `RCPT-${Date.now()}`;
    const recordedBy = getAuditUserId(req.user);
    const result = await query(
      `INSERT INTO fee_payments
       (student_id, receipt_number, description, amount, payment_method, reference, academic_year, term, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [body.student_id, receipt, body.description || 'School fees payment', body.amount, body.payment_method || null, body.reference || null, body.academic_year || new Date().getFullYear(), body.term || null, recordedBy]
    );
    await logActivity(req.user.id, 'payment_recorded', `Recorded payment ${receipt}`, req.ip);
    res.status(201).json({ success: true, id: result.insertId, receipt_number: receipt });
  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({ success: false, message: 'Could not record payment' });
  }
}

async function payments(req, res) {
  const params = [];
  let where = '';
  if (!['admin', 'finance', 'rba'].includes(req.user.role)) {
    where = 'WHERE p.student_id = ?';
    params.push(req.user.id);
  } else if (req.query.className || req.query.class_name) {
    where = 'WHERE s.class_name = ?';
    params.push(req.query.className || req.query.class_name);
  }
  const rows = await query(
    `SELECT p.*, p.created_at AS payment_date, s.name AS student_name, s.admission_number, s.class_name
     FROM fee_payments p
     JOIN students s ON s.id = p.student_id
     ${where}
     ORDER BY p.created_at DESC`,
    params
  );
  res.json(rows);
}

async function listDocs(req, res) {
  try {
    const params = [];
    const clauses = [];
    const requestedType = req.query.type;
    const requestedClass = req.query.className || req.query.class_name;
    const requestedTerm = req.query.term;

    if (requestedType) {
      clauses.push('d.type = ?');
      params.push(requestedType);
    }

    if (requestedClass) {
      clauses.push(`(d.target_class IS NULL OR ${classMatchesExpression('d')})`);
      params.push(requestedClass, requestedClass, requestedClass);
    }

    if (requestedTerm) {
      clauses.push('(d.target_term IS NULL OR d.target_term = ?)');
      params.push(requestedTerm);
    }

    clauses.push('(LOWER(d.title) NOT LIKE ? AND (d.description IS NULL OR LOWER(d.description) NOT LIKE ?))');
    params.push('%test charge%', '%test charge%');

    const userIsStudent = req.user && req.user.role === 'student';
    if (!requestedClass && userIsStudent) {
      // Student viewing without explicit className parameter: show their form's documents + public + explicitly linked
      clauses.push(`(
        (d.target_class IS NULL AND NOT EXISTS (SELECT 1 FROM finance_document_students fds WHERE fds.document_id = d.id))
        OR ${classMatchesExpression('d')}
        OR EXISTS (SELECT 1 FROM finance_document_students fds WHERE fds.document_id = d.id AND fds.student_id = ?)
      )`);
      const studentClass = req.user.class_name || '';
      params.push(studentClass, studentClass, studentClass, req.user.id);
    }

    let sql = 'SELECT d.* FROM finance_documents d';
    if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`;
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const requestedOffset = Number.parseInt(req.query.offset, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 100;
    const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;
    // LIMIT/OFFSET are validated integers interpolated into the statement; all user filters remain bound parameters.
    sql += ` ORDER BY d.uploaded_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const docs = await query(sql, params);
    return res.json(docs);
  } catch (err) {
    console.error('Error in listDocs:', err, { query: req.query, user: req.user ? { id: req.user.id, role: req.user.role, class_name: req.user.class_name } : null });
    return res.status(500).json({ success: false, message: 'Unable to list finance documents' });
  }
}

async function createDoc(req, res) {
  let file = req.file;
  let manualCategories = null;

  if (!file && req.body.type === 'feestructure' && req.body.categories) {
    try {
      manualCategories = JSON.parse(req.body.categories);
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Invalid categories format' });
    }

    const structureData = {
      title: req.body.title || 'Fee Structure',
      className: req.body.className || '',
      description: req.body.description || '',
      categories: manualCategories,
      created_by: req.user?.id || null,
      created_at: new Date().toISOString()
    };

    const folder = path.join(__dirname, '..', 'uploads', 'documents');
    await fs.mkdir(folder, { recursive: true });

    const filename = `manual-feestructure-${Date.now()}.json`;
    const filePath = path.join(folder, filename);
    const jsonContent = JSON.stringify(structureData, null, 2);
    await fs.writeFile(filePath, jsonContent, 'utf8');

    file = {
      filename,
      originalname: `${filename}`,
      mimetype: 'application/json',
      size: Buffer.byteLength(jsonContent, 'utf8')
    };
  }

  if (!file) return res.status(400).json({ success: false, message: 'File or category data is required' });

  const classNameLabel = req.body.className ? `Form/Class: ${req.body.className}` : '';
  const summary = manualCategories ? manualCategories.map(c => `${c.category || 'Other'}: ${c.amount || 0}`).join(', ') : '';
  const descriptionParts = [classNameLabel, req.body.description || '', summary].filter(Boolean);
  const description = descriptionParts.join(' · ');

  const result = await query(
    `INSERT INTO finance_documents (title, type, target_class, target_term, description, filename, original_name, mime_type, file_size, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.body.title || file.originalname, req.body.type || 'other', req.body.className || null, req.body.term || null, description || null, file.filename, file.originalname, file.mimetype, file.size, req.user?.id || null]
  );

  if (req.body.student_ids) {
    const ids = JSON.parse(req.body.student_ids);
    for (const id of ids) {
      await query('INSERT IGNORE INTO finance_document_students (document_id, student_id) VALUES (?, ?)', [result.insertId, id]);
    }
  }

  res.status(201).json({ success: true, id: result.insertId, filename: file.filename });
  try {
    if (io) io.emit('new_finance_doc', { id: result.insertId, title: req.body.title || file.originalname, type: req.body.type || 'other', target_class: req.body.className || req.body.target_class || null });
  } catch (e) { console.warn('Could not emit new_finance_doc', e.message || e); }
}

async function deleteDoc(req, res) {
  await query('DELETE FROM finance_documents WHERE id = ?', [req.params.id]);
  res.json({ success: true });
}

async function serveFile(req, res) {
  res.sendFile(path.join(__dirname, '..', 'uploads', 'documents', path.basename(req.params.filename)));
}

async function downloadReceipt(req, res) {
  try {
    const id = req.params.id;
    const rows = await query(
      `SELECT p.*, s.name AS student_name, s.admission_number FROM fee_payments p JOIN students s ON s.id = p.student_id WHERE p.id = ? LIMIT 1`,
      [id]
    );
    if (!rows || rows.length === 0) return res.status(404).send('Receipt not found');
    const p = rows[0];

    const content = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Receipt ${p.receipt_number || p.id}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;padding:20px;color:#111}header{border-bottom:2px solid #0f766e;padding-bottom:8px;margin-bottom:12px}table{width:100%;border-collapse:collapse}td,th{padding:8px;border:1px solid #e5e7eb;text-align:left}</style>
</head>
<body>
  <header>
    <h1>CRESENT HIGH SCHOOL</h1>
    <p>Payment Receipt</p>
  </header>
  <section>
    <table>
      <tr><th>Receipt No.</th><td>${p.receipt_number || p.id}</td></tr>
      <tr><th>Student</th><td>${p.student_name || ''} (${p.admission_number || ''})</td></tr>
      <tr><th>Amount</th><td>KSh ${Number(p.amount).toLocaleString()}</td></tr>
      <tr><th>Method</th><td>${p.payment_method || 'N/A'}</td></tr>
      <tr><th>Reference</th><td>${p.reference || 'N/A'}</td></tr>
      <tr><th>Date</th><td>${new Date(p.created_at).toLocaleString()}</td></tr>
      <tr><th>Description</th><td>${p.description || ''}</td></tr>
    </table>
  </section>
  <footer style="margin-top:18px;color:#6b7280;font-size:12px">Generated on ${new Date().toLocaleString()}</footer>
</body>
</html>`;

    res.setHeader('Content-Disposition', `attachment; filename="receipt_${p.id}.html"`);
    res.setHeader('Content-Type', 'text/html');
    res.send(content);
  } catch (error) {
    console.error('Download receipt error:', error);
    res.status(500).send('Could not generate receipt');
  }
}

async function generateStatement(req, res) {
  try {
    const filters = {
      term: req.body.term || null,
      academic_year: req.body.academic_year || null
    };
    let students = req.body.student_ids || [];
    if (!Array.isArray(students) || students.length === 0) {
      const rows = await query("SELECT id FROM students WHERE role = 'student' AND active = 1 ORDER BY class_name, stream, name");
      students = rows.map(row => row.id);
    }

    const created = [];
    const folder = path.join(__dirname, '..', 'uploads', 'documents');
    await fs.mkdir(folder, { recursive: true });

    for (const studentId of students) {
      const data = await getStatement(studentId, filters);
      if (!data) continue;
      const filename = `fee-statement-${studentId}-${Date.now()}.html`;
      const content = renderStatementHtml(data, filters);
      await fs.writeFile(path.join(folder, filename), content, 'utf8');

      const uploadedBy = getAuditUserId(req.user);
      const result = await query(
        `INSERT INTO finance_documents (title, type, description, filename, original_name, mime_type, file_size, uploaded_by)
         VALUES (?, 'feestatement', ?, ?, ?, 'text/html', ?, ?)`,
        [
          `Fee Statement - ${data.student.name}`,
          `Billed ${money(data.totals.total_charges)}, paid ${money(data.totals.total_paid)}, balance ${money(data.totals.balance)}`,
          filename,
          filename,
          Buffer.byteLength(content),
          uploadedBy
        ]
      );
      await query('INSERT IGNORE INTO finance_document_students (document_id, student_id) VALUES (?, ?)', [result.insertId, studentId]);
      created.push({
        id: result.insertId,
        student_id: studentId,
        filename,
        totals: data.totals
      });
    }

    await logActivity(req.user.id, 'fee_statements_generated', `Generated ${created.length} statement(s)`, req.ip);
    try {
      if (io) io.emit('fee_statements_generated', { created });
    } catch (e) { console.warn('Could not emit fee_statements_generated', e.message || e); }
    res.json({ success: true, created });
  } catch (error) {
    console.error('Generate statement error:', error);
    res.status(500).json({ success: false, message: 'Could not generate fee statements' });
  }
}

async function getFeeStructure(req, res) {
  try {
    const params = [];
    const clauses = ["type = 'feestructure'"];
    const className = req.query.className || req.query.class_name || req.user?.class_name || null;
    const term = req.query.term || null;

    if (className) {
      clauses.push(classMatchesExpression('finance_documents'));
      params.push(className, className, className);
    }
    if (term) {
      clauses.push('(target_term IS NULL OR target_term = ?)');
      params.push(term);
    }

    const docs = await query(
      `SELECT * FROM finance_documents
       WHERE ${clauses.join(' AND ')}
       ORDER BY uploaded_at DESC
       LIMIT 1`,
      params
    );

    let structure = [];
    const latestDoc = docs[0] || null;
    if (latestDoc?.filename && latestDoc.mime_type === 'application/json') {
      const filePath = path.join(__dirname, '..', 'uploads', 'documents', path.basename(latestDoc.filename));
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        structure = (parsed.categories || []).map((item) => ({
          description: item.description || item.category || 'Fee item',
          amount: Number(item.amount || 0)
        })).filter((item) => item.amount > 0);
      } catch (error) {
        console.warn('Could not parse fee structure document:', error.message);
      }
    }

    if (!structure.length) {
      const chargeParams = [];
      let chargeWhere = 'WHERE fc.amount > 0'
        + ' AND (fc.description IS NULL OR LOWER(fc.description) NOT LIKE ? )'
        + ' AND (fc.category IS NULL OR LOWER(fc.category) NOT LIKE ? )';
      chargeParams.push('%test charge%', '%test charge%');
      if (className) {
        chargeWhere += ' AND (s.class_name = ? OR s.class_name LIKE ? OR ? LIKE CONCAT(s.class_name, "%"))';
        chargeParams.push(className, `${className}%`, className);
      }
      if (term) {
        chargeWhere += ' AND fc.term = ?';
        chargeParams.push(term);
      }
      const charges = await query(
        `SELECT COALESCE(fc.category, fc.description) AS description, MAX(fc.amount) AS amount
         FROM fee_charges fc
         JOIN students s ON s.id = fc.student_id
         ${chargeWhere}
         GROUP BY COALESCE(fc.category, fc.description)
         ORDER BY description`,
        chargeParams
      );
      structure = charges.map((item) => ({ description: item.description, amount: Number(item.amount || 0) }));
    }

    res.json({
      structure,
      document: latestDoc,
      total: structure.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load fee structure' });
  }
}

module.exports = {
  overview,
  overviewCharts,
  balances,
  statement,
  postCharges,
  recordPayment,
  payments,
  listDocs,
  createDoc,
  deleteDoc,
  serveFile,
  downloadReceipt,
  generateStatement,
  getFeeStructure
};
module.exports.setIO = setIO;
