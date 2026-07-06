const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const controller = require('../controllers/studentController');

const router = express.Router();

router.get('/me', authMiddleware, controller.profile);
router.get('/dashboard-summary', authMiddleware, async (req, res) => {
  try {
    const [balanceRows] = await require('../config/db').query(
      `SELECT COALESCE(SUM(amount), 0) AS total_charges FROM fee_charges WHERE student_id = ?`,
      [req.user.id]
    );
    const [paymentRows] = await require('../config/db').query(
      `SELECT COALESCE(SUM(amount), 0) AS total_paid FROM fee_payments WHERE student_id = ?`,
      [req.user.id]
    );
    const [resultRows] = await require('../config/db').query(
      `SELECT AVG(score) AS average_score FROM results WHERE student_id = ? AND score IS NOT NULL`,
      [req.user.id]
    );
    const [latestResultRows] = await require('../config/db').query(
      `SELECT subject, score, term, academic_year FROM results WHERE student_id = ? ORDER BY academic_year DESC, term DESC, created_at DESC LIMIT 1`,
      [req.user.id]
    );
    const [notesRows] = await require('../config/db').query('SELECT COUNT(*) AS count FROM notes WHERE class_name = ? OR class_name IS NULL', [req.user.class_name]);
    const [revisionRows] = await require('../config/db').query('SELECT COUNT(*) AS count FROM revision_materials WHERE class_name = ? OR class_name IS NULL', [req.user.class_name]);

    res.json({
      success: true,
      balance: Number(balanceRows[0]?.total_charges || 0) - Number(paymentRows[0]?.total_paid || 0),
      totalCharged: Number(balanceRows[0]?.total_charges || 0),
      totalPaid: Number(paymentRows[0]?.total_paid || 0),
      averageScore: Number(resultRows[0]?.average_score || 0),
      latestResult: latestResultRows[0] || null,
      notesCount: Number(notesRows[0]?.count || 0),
      revisionCount: Number(revisionRows[0]?.count || 0)
    });
  } catch (error) {
    console.error('Student dashboard summary error:', error);
    res.status(500).json({ success: false, message: 'Could not load dashboard summary' });
  }
});

module.exports = router;
