const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { query } = require('../config/db');

const isProduction = process.env.NODE_ENV === 'production';

function isStrongPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 12) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

function createAuthRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many authentication attempts. Please try again later.' }
  });
}

function createGeneralRateLimiter() {
  return rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please slow down.' }
  });
}

const csrfMiddleware = csrf({
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction
  },
  value: (req) => req.headers['x-csrf-token'] || req.body?.csrfToken || req.query?.csrfToken || ''
});

function csrfProtection(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  const hasAuthHeader = Boolean(req.headers.authorization || req.headers['x-auth-token']);
  const hasAuthCookie = Boolean(req.cookies?.authToken || req.cookies?.token);
  if (hasAuthHeader || hasAuthCookie) {
    return next();
  }
  return csrfMiddleware(req, res, next);
}

// Allow configuring additional image sources via CSP_IMG_SRC env var (comma-separated)
const extraImgSrcs = (process.env.CSP_IMG_SRC || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// Allow the QR code generator host and the external image host used on the login page
// by default so externally-hosted images (QR and background) render correctly.
const defaultImgHosts = [
  'https://api.qrserver.com',
  'https://c8.alamy.com'
];

const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', ...defaultImgHosts, ...extraImgSrcs],
      connectSrc: ["'self'", 'https://cresenthighschool.onrender.com'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'same-origin' }
});

const parseCookies = cookieParser();

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

async function recordSecurityEvent(userId, action, details, req) {
  try {
    await query(
      'INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [userId || null, action, details, getClientIp(req)]
    );
  } catch (error) {
    console.warn('Security event logging failed:', error.message);
  }
}

function createSessionFingerprint(req) {
  const token = req.headers.authorization || req.headers.cookie || '';
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createLoginAttemptTracker(options = {}) {
  const maxAttempts = Number(options.maxAttempts || 5);
  const windowMs = Number(options.windowMs || 15 * 60 * 1000);
  const attempts = new Map();

  const trackLoginAttempt = function trackLoginAttempt(key) {
    const now = Date.now();
    const existing = attempts.get(key);

    if (!existing) {
      attempts.set(key, { count: 1, firstAttemptAt: now });
      return { allowed: true, blocked: false };
    }

    if (now - existing.firstAttemptAt > windowMs) {
      attempts.set(key, { count: 1, firstAttemptAt: now });
      return { allowed: true, blocked: false };
    }

    existing.count += 1;
    attempts.set(key, existing);
    return { allowed: existing.count <= maxAttempts, blocked: existing.count > maxAttempts };
  };

  trackLoginAttempt.reset = (key) => {
    attempts.delete(key);
  };

  return trackLoginAttempt;
}

module.exports = {
  isStrongPassword,
  createAuthRateLimiter,
  createGeneralRateLimiter,
  csrfProtection,
  securityHeaders,
  parseCookies,
  recordSecurityEvent,
  createSessionFingerprint,
  createLoginAttemptTracker,
  getClientIp
};
