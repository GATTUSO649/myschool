const express = require('express');
const auth = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/signup', auth.signup);
router.post('/login', auth.login);
router.post('/password-reset/request', auth.requestPasswordReset);
router.post('/password-reset/confirm', auth.confirmPasswordReset);
router.get('/me', authMiddleware, auth.me);

module.exports = router;
