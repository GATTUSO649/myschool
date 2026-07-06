const express = require('express');
const controller = require('../controllers/portalController');
const finance = require('../controllers/financeController');
const transcripts = require('../controllers/transcriptController');
const authMiddleware = require('../middleware/authMiddleware');
const { documentsUpload, assignmentsUpload } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.get('/exams', controller.exams);

router.get('/calendar/events', authMiddleware, controller.calendarEvents);
router.post('/calendar/events', authMiddleware, controller.createCalendarEvent);

router.get('/assignments', authMiddleware, controller.assignments);
router.post('/assignments', authMiddleware, assignmentsUpload.single('file'), controller.createAssignment);
router.post('/assignments/:id/submit', authMiddleware, assignmentsUpload.single('file'), controller.submitAssignment);

router.get('/notes', authMiddleware, controller.notes);
router.post('/notes/upload', authMiddleware, documentsUpload.single('file'), controller.uploadNote);
router.delete('/notes/:id', authMiddleware, controller.deleteNote);
router.get('/notes/:id/download', authMiddleware, controller.downloadNote);

router.get('/revision-materials', authMiddleware, controller.revisionMaterials);
router.post('/revision-materials/upload', authMiddleware, documentsUpload.single('file'), controller.uploadRevision);
router.delete('/revision-materials/:id', authMiddleware, controller.deleteRevision);
router.get('/revision-materials/:id/download', authMiddleware, controller.downloadRevision);
router.post('/study-progress/:id/studied', authMiddleware, controller.markStudied);
router.get('/study-progress', authMiddleware, controller.studyProgress);

router.get('/notifications', authMiddleware, controller.notifications);
router.put('/notifications/:id/read', authMiddleware, controller.markNotificationRead);
router.post('/notifications/mark-all-read', authMiddleware, controller.markAllNotificationsRead);
router.delete('/notifications/clear-all', authMiddleware, controller.clearNotifications);
router.delete('/notifications/:id', authMiddleware, controller.markNotificationRead);
router.post('/notifications/settings', authMiddleware, controller.notificationSettings);

router.post('/consultations', authMiddleware, controller.consultation);
router.get('/transcript/marks', authMiddleware, controller.transcriptMarks);
router.get('/transcript/:adm', authMiddleware, transcripts.getStudentTranscriptByAdm);

router.get('/finance/files/:filename', finance.serveFile);
router.get('/payments/receipts', authMiddleware, finance.payments);
router.get('/payments/receipts/:id/download', authMiddleware, finance.downloadReceipt);
router.post('/payments/receipts/:id/email', authMiddleware, (req, res) => res.json({ success: true }));

module.exports = router;
