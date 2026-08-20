const express = require('express');
const auth = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const csrf = require('csurf');

const router = express.Router();

// CSRF token endpoint for secure login
router.get('/csrf-token', csrf(), (req, res) => {
  res.json({ token: req.csrfToken() });
});

router.post('/signup', auth.signup);
router.post('/login', auth.login);
router.post('/admin-login', auth.adminLogin);
router.post('/password-reset/request', auth.requestPasswordReset);
router.post('/password-reset/confirm', auth.confirmPasswordReset);
router.get('/me', authMiddleware, auth.me);

module.exports = router;
