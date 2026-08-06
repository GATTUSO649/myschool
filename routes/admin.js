const express = require('express');
const controller = require('../controllers/adminDashboardController');
const transcripts = require('../controllers/transcriptController');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const { authorizeRole } = require('../middleware/adminMiddleware');
const { documentsUpload } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.get('/stats', authMiddleware, authorizeRole(['admin', 'rba']), controller.getStats);
router.get('/security-dashboard', authMiddleware, authorizeRole(['admin', 'rba']), controller.getSecurityDashboard);
router.post('/password-reset/request', authMiddleware, authorizeRole(['admin', 'rba']), authController.requestPasswordReset);
router.post('/password-reset/direct', authMiddleware, authorizeRole(['admin', 'rba']), controller.resetStudentPassword);
router.get('/students', authMiddleware, authorizeRole(['admin', 'rba']), controller.getStudents);
router.post('/students', authMiddleware, authorizeRole(['admin', 'rba']), controller.createStudent);
router.put('/students/:studentId/deactivate', authMiddleware, authorizeRole(['admin', 'rba']), controller.deactivateStudent);
router.get('/settings/public', controller.getPublicSettings);
router.get('/settings', authMiddleware, authorizeRole(['admin', 'rba']), controller.getSettings);
router.post('/settings', authMiddleware, authorizeRole(['admin', 'rba']), controller.saveSettings);
router.get('/database', authMiddleware, authorizeRole(['admin', 'rba']), controller.getDatabaseOverview);
router.get('/database/tables/:tableName', authMiddleware, authorizeRole(['admin', 'rba']), controller.getDatabaseTable);
router.post('/database/tables/:tableName', authMiddleware, authorizeRole(['admin', 'rba']), controller.createDatabaseRecord);
router.put('/database/tables/:tableName/:id', authMiddleware, authorizeRole(['admin', 'rba']), controller.updateDatabaseRecord);
router.delete('/database/tables/:tableName/:id', authMiddleware, authorizeRole(['admin', 'rba']), controller.deleteDatabaseRecord);
router.post('/database/query', authMiddleware, authorizeRole(['admin', 'rba']), controller.runDatabaseQuery);
router.get('/transcripts', authMiddleware, authorizeRole(['admin', 'rba']), transcripts.listTranscripts);
router.get('/transcripts/sheets', authMiddleware, authorizeRole(['admin', 'rba']), transcripts.listTranscriptSheets);
router.get('/transcripts/sheet', authMiddleware, authorizeRole(['admin', 'rba']), transcripts.getTranscriptSheet);
router.post('/transcripts/sheet', authMiddleware, authorizeRole(['admin', 'rba']), transcripts.saveTranscriptSheet);
router.post('/transcripts', authMiddleware, authorizeRole(['admin', 'rba']), transcripts.createTranscript);
router.put('/transcripts/:id', authMiddleware, authorizeRole(['admin', 'rba']), transcripts.updateTranscript);
router.delete('/transcripts/:id', authMiddleware, authorizeRole(['admin', 'rba']), transcripts.deleteTranscript);
router.post('/transcripts/upload_csv', authMiddleware, authorizeRole(['admin', 'rba']), documentsUpload.single('file'), transcripts.uploadCsv);
router.get('/transcripts/students', authMiddleware, authorizeRole(['admin', 'rba']), transcripts.getStudentsForNewSheet);

module.exports = router;
