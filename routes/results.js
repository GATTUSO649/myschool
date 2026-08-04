const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { query } = require('../config/db');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  const clauses = ['student_id = ?'];
  const params = [req.user.id];
  const term = String(req.query.term || '').trim();
  const academicYear = String(req.query.academic_year || req.query.academicYear || req.query.year || '').trim();

  if (term) {
    clauses.push('LOWER(TRIM(term)) = LOWER(TRIM(?))');
    params.push(term);
  }

  if (academicYear) {
    clauses.push('CAST(academic_year AS CHAR) = ?');
    params.push(academicYear);
  }

  const rows = await query(
    `SELECT * FROM results WHERE ${clauses.join(' AND ')} ORDER BY academic_year DESC, term DESC, subject ASC`,
    params
  );
  res.json(rows);
});

module.exports = router;
