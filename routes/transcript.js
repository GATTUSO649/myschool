const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const controller = require('../controllers/portalController');
const transcripts = require('../controllers/transcriptController');

const router = express.Router();

router.get('/', authMiddleware, transcripts.listMyTranscripts);
router.get('/marks', authMiddleware, controller.transcriptMarks);
router.get('/:adm', authMiddleware, transcripts.getStudentTranscriptByAdm);

module.exports = router;
