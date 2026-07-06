const express = require('express');
const controller = require('../controllers/applicationController');
const { documentsUpload } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.post('/', documentsUpload.fields([
  { name: 'birthCertificate', maxCount: 1 },
  { name: 'kcpeCertificate', maxCount: 1 },
  { name: 'medicalForm', maxCount: 1 }
]), controller.createApplication);

module.exports = router;
