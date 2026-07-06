const express = require('express');
const controller = require('../controllers/academicController');
const authMiddleware = require('../middleware/authMiddleware');
const { documentsUpload } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.get('/docs', authMiddleware, controller.listDocs);
router.get('/entry/students', authMiddleware, controller.listEntryStudents);
router.post('/entry/results', authMiddleware, controller.saveEntryResults);
router.get('/dashboard', authMiddleware, controller.academicDashboard);
router.post('/docs', authMiddleware, documentsUpload.single('file'), controller.createDoc);
router.put('/docs/:id', authMiddleware, controller.updateDoc);
router.delete('/docs/:id', authMiddleware, controller.deleteDoc);
router.get('/files/:filename', controller.serveDoc);

module.exports = router;
