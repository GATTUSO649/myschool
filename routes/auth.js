const express = require('express');
const auth = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const csrf = require('csurf');
const { createPasswordResetRateLimiter } = require('../middleware/security');

const router = express.Router();

const csrfTokenProtection = csrf({
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
});
const passwordResetRequestLimiter = createPasswordResetRateLimiter(5, 'Too many reset requests. Please wait before trying again.');
const passwordResetConfirmLimiter = createPasswordResetRateLimiter(15, 'Too many code attempts. Please wait before trying again.');
const studentResetRequestLimiter = createPasswordResetRateLimiter(5, 'Too many recovery requests. Please try again later.');
const studentResetTransactionLimiter = createPasswordResetRateLimiter(20, 'Too many recovery attempts. Please try again later.');

// CSRF token endpoint for secure login
router.get('/csrf-token', csrfTokenProtection, (req, res) => {
  res.json({ token: req.csrfToken() });
});

router.post('/signup', auth.signup);
router.post('/login', auth.login);
router.post('/department-login', auth.departmentLogin);
router.get('/departments', auth.loginDepartments);
router.post('/admin-login', auth.adminLogin);
router.post('/password-reset/request', passwordResetRequestLimiter, auth.requestPasswordReset);
router.post('/password-reset/confirm', passwordResetConfirmLimiter, auth.confirmPasswordReset);
router.post('/student-password-reset/request', studentResetRequestLimiter, auth.requestStudentPasswordReset);
router.post('/student-password-reset/resend', studentResetTransactionLimiter, auth.resendStudentPasswordResetOtp);
router.post('/student-password-reset/verify', studentResetTransactionLimiter, auth.verifyStudentPasswordResetOtp);
router.post('/student-password-reset/complete', studentResetTransactionLimiter, auth.completeStudentPasswordReset);
router.post('/password/change', authMiddleware, auth.changePassword);
router.post('/sessions/revoke-others', authMiddleware, auth.revokeOtherSessions);
router.get('/me', authMiddleware, auth.me);

module.exports = router;
