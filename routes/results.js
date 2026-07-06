const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { query } = require('../config/db');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  const rows = await query('SELECT * FROM results WHERE student_id = ? ORDER BY academic_year DESC, term DESC', [req.user.id]);
  res.json(rows);
});

module.exports = router;
