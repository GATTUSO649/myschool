const { query } = require('../config/db');

async function listStudentResults(req, res) {
  const rows = await query('SELECT * FROM results WHERE student_id = ? ORDER BY academic_year DESC, term DESC', [req.user.id]);
  res.json(rows);
}

module.exports = { listStudentResults };
