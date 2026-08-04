const express = require('express');
const controller = require('../controllers/academicController');
const authMiddleware = require('../middleware/authMiddleware');
const { authorizeRole } = require('../middleware/adminMiddleware');
const { documentsUpload } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.get('/docs', authMiddleware, controller.listDocs);
router.get('/entry/students', authMiddleware, authorizeRole(['lecturer', 'admin', 'rba']), controller.listEntryStudents);
router.post('/entry/results', authMiddleware, authorizeRole(['lecturer', 'admin', 'rba']), controller.saveEntryResults);
router.get('/dashboard', authMiddleware, controller.academicDashboard);
router.get('/form-averages', authMiddleware, controller.formAverages);
router.get('/transcript', authMiddleware, controller.getStudentTranscript);
router.post('/docs', authMiddleware, documentsUpload.single('file'), controller.createDoc);
router.put('/docs/:id', authMiddleware, controller.updateDoc);
router.delete('/docs/:id', authMiddleware, controller.deleteDoc);
router.get('/files/:filename', controller.serveDoc);

module.exports = router;
