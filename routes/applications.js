const express = require('express');
const controller = require('../controllers/applicationController');
const { documentsUpload } = require('../middleware/uploadMiddleware');
const authMiddleware = require('../middleware/authMiddleware');
const { authorizeRole } = require('../middleware/adminMiddleware');

const router = express.Router();

// Public: create application (file uploads supported)
router.post('/', documentsUpload.fields([
  { name: 'birthCertificate', maxCount: 1 },
  { name: 'kcpeCertificate', maxCount: 1 },
  { name: 'medicalForm', maxCount: 1 }
]), controller.createApplication);

// Admin: list, approve and reject applications (requires auth + admin/rba role)
router.get('/', authMiddleware, authorizeRole(['admin', 'rba']), controller.listApplications);
router.post('/pending/confirmation', authMiddleware, authorizeRole(['admin', 'rba']), controller.sendPendingApplicationConfirmations);
router.post('/:id/approve', authMiddleware, authorizeRole(['admin', 'rba']), controller.approveApplication);
router.post('/:id/reject', authMiddleware, authorizeRole(['admin', 'rba']), controller.rejectApplication);

module.exports = router;
