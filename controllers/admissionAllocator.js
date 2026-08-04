const { query } = require('../config/db');

const STREAMS = ['A', 'B', 'C', 'D'];

function normalizeStream(value) {
  const stream = String(value || '').trim().toUpperCase();
  return stream && /^[A-D]$/.test(stream) ? stream : 'A';
}

function getClassFormAndStream(application) {
  const classValue = String(application?.class_name || application?.className || application?.class || '').trim();
  const directMatch = classValue.match(/([1-4])\s*([A-D])?/i);
  if (directMatch) {
    return {
      formNumber: directMatch[1],
      stream: normalizeStream(directMatch[2] || application?.stream || application?.stream_name || application?.student_stream)
    };
  }

  const formMatch = classValue.match(/form\s*([1-4])/i);
  if (formMatch) {
    return {
      formNumber: formMatch[1],
      stream: normalizeStream(application?.stream || application?.stream_name || application?.student_stream)
    };
  }

  return null;
}

async function getNextAdmissionAssignment() {
  const year = new Date().getFullYear();
  const rows = await query(
    `SELECT admission_number
     FROM students
     WHERE admission_number LIKE ?
     ORDER BY id ASC`,
    [`CRES/%/${year}`]
  );

  let highest = 0;
  for (const row of rows) {
    const match = String(row.admission_number || '').match(/^CRES\/(\d+)\/\d{4}$/);
    if (match) highest = Math.max(highest, Number(match[1]));
  }

  const sequence = highest + 1;
  return {
    admissionNumber: `CRES/${String(sequence).padStart(3, '0')}/${year}`,
    stream: STREAMS[(sequence - 1) % STREAMS.length],
    sequence
  };
}

async function getAdmissionAssignmentForApplication(application) {
  const parsed = getClassFormAndStream(application);
  const assignment = await getNextAdmissionAssignment();
  return {
    ...assignment,
    stream: parsed?.stream || assignment.stream,
    formNumber: parsed?.formNumber || null
  };
}

async function getNextStaffAssignment() {
  const rows = await query(
    `SELECT admission_number FROM students WHERE admission_number LIKE 'STAFF/%' ORDER BY id ASC`
  );

  let highest = 0;
  for (const row of rows) {
    const match = String(row.admission_number || '').match(/^STAFF\/(\d+)$/i);
    if (match) highest = Math.max(highest, Number(match[1]));
  }

  const sequence = highest + 1;
  return {
    admissionNumber: `STAFF/${String(sequence).padStart(3, '0')}`,
    sequence
  };
}

module.exports = {
  STREAMS,
  getNextAdmissionAssignment,
  getAdmissionAssignmentForApplication,
  getNextStaffAssignment
};
