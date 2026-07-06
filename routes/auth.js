const express = require('express');
const auth = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/signup', auth.signup);
router.post('/login', auth.login);
router.get('/me', authMiddleware, auth.me);

module.exports = router;
