const express = require('express');
const finance = require('../controllers/financeController');
const authMiddleware = require('../middleware/authMiddleware');
const { documentsUpload } = require('../middleware/uploadMiddleware');
const { authorizePermission } = require('../middleware/adminMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/files/:filename', authorizePermission('financial_reports.view'), finance.serveFile);
router.get('/overview', authorizePermission('finance.dashboard.view'), finance.overview);
router.get('/overview-charts', authorizePermission('financial_reports.view'), finance.overviewCharts);
router.get('/balances', authorizePermission('financial_reports.view'), finance.balances);
router.get('/statement', authorizePermission('statements.view'), finance.statement);
router.get('/fee-structure', authorizePermission('fees.manage'), finance.getFeeStructure);
router.post('/charges', authorizePermission('fees.manage'), finance.postCharges);
router.get('/payments', authorizePermission('payments.verify'), finance.payments);
router.post('/payments', authorizePermission('payments.record'), finance.recordPayment);
router.get('/payments/:id/download', authorizePermission('receipts.generate'), finance.downloadReceipt);
router.get('/docs', authorizePermission('fees.manage'), finance.listDocs);
router.post('/docs', authorizePermission('fees.manage'), documentsUpload.single('file'), finance.createDoc);
router.delete('/docs/:id', authorizePermission('fees.manage'), finance.deleteDoc);
router.post('/generate-fee-statement', authorizePermission('statements.view'), finance.generateStatement);

module.exports = router;
