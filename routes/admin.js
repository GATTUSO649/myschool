const express = require('express');
const controller = require('../controllers/adminDashboardController');
const authMiddleware = require('../middleware/authMiddleware');
const { authorizeRole } = require('../middleware/adminMiddleware');

const router = express.Router();

router.get('/stats', authMiddleware, authorizeRole(['admin', 'rba']), controller.getStats);
router.get('/students', authMiddleware, authorizeRole(['admin', 'rba']), controller.getStudents);
router.post('/students', authMiddleware, authorizeRole(['admin', 'rba']), controller.createStudent);
router.put('/students/:studentId/deactivate', authMiddleware, authorizeRole(['admin', 'rba']), controller.deactivateStudent);

module.exports = router;
