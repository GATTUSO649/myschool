const express = require('express');
const finance = require('../controllers/financeController');
const authMiddleware = require('../middleware/authMiddleware');
const { documentsUpload } = require('../middleware/uploadMiddleware');

const router = express.Router();

// Public file serving for finance documents (keep before auth middleware)
router.get('/files/:filename', finance.serveFile);

router.use(authMiddleware);

router.get('/overview', finance.overview);
router.get('/overview-charts', finance.overviewCharts);
router.get('/balances', finance.balances);
router.get('/statement', finance.statement);
router.get('/fee-structure', finance.getFeeStructure);
router.post('/charges', finance.postCharges);
router.get('/payments', finance.payments);
router.post('/payments', finance.recordPayment);
router.get('/payments/:id/download', finance.downloadReceipt);
router.get('/docs', finance.listDocs);
router.post('/docs', documentsUpload.single('file'), finance.createDoc);
router.delete('/docs/:id', finance.deleteDoc);
router.post('/generate-fee-statement', finance.generateStatement);

module.exports = router;
