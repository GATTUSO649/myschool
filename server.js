const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const { ensureDatabase, query } = require('./config/db');
const authMiddleware = require('./middleware/authMiddleware');
const {
  createAuthRateLimiter,
  createGeneralRateLimiter,
  csrfProtection,
  securityHeaders,
  parseCookies,
  recordSecurityEvent
} = require('./middleware/security');
const authRoutes = require('./routes/auth');
const applicationRoutes = require('./routes/applications');
const studentRoutes = require('./routes/students');
const academicRoutes = require('./routes/academics');
const financeRoutes = require('./routes/fees');
const portalRoutes = require('./routes/portal');
const resultRoutes = require('./routes/results');
const transcriptRoutes = require('./routes/transcript');
const courseRoutes = require('./routes/courses');
const classRoutes = require('./routes/classes');
const adminRoutes = require('./routes/admin');
const { getEmailConfiguration, verifyMailTransport } = require('./controllers/emailUtils');

const app = express();
// Determine production early
const isProduction = process.env.NODE_ENV === 'production';
// Configure trust proxy safely. Avoid using the permissive boolean `true` value
// which express-rate-limit treats as insecure. Accept explicit values via
// TRUST_PROXY env var (e.g. 'loopback', '127.0.0.1', '1' for hops), otherwise
// default to 'loopback' when running on known platforms or in production.
let trustProxyValue = false;
if (typeof process.env.TRUST_PROXY !== 'undefined' && process.env.TRUST_PROXY !== '') {
  const raw = String(process.env.TRUST_PROXY).trim();
  if (raw.toLowerCase() === 'true') {
    trustProxyValue = 1;
  } else if (/^\d+$/.test(raw)) {
    trustProxyValue = Number(raw);
  } else {
    trustProxyValue = raw;
  }
} else if (process.env.RENDER || isProduction) {
  trustProxyValue = 1;
}
app.set('trust proxy', trustProxyValue);
console.log('Express trust proxy set to', trustProxyValue);
const server = http.createServer(app);
const configuredCorsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  'https://cresenthighschool.onrender.com',
  'https://www.cresenthighschool.onrender.com',
  ...(isProduction ? [] : ['http://localhost:3000', 'http://localhost:5001', 'http://localhost:8000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5001', 'http://127.0.0.1:8000']),
  ...configuredCorsOrigins
]);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    if (!isProduction && /^(http:\/\/localhost|http:\/\/127\.0\.0\.1)/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: true
};

const io = new Server(server, {
  cors: {
    origin: Array.from(allowedOrigins),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true
  }
});

const authLimiter = createAuthRateLimiter();
const generalLimiter = createGeneralRateLimiter();

app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(parseCookies);
app.use((req, res, next) => {
  if (!req.path.endsWith('.html') || !req.path.startsWith('/ict-') || req.path === '/ict-login.html') return next();
  return authMiddleware(req, res, (error) => {
    if (error) return next(error);
    const rawRole = String(req.user?.rawRole || '').toLowerCase();
    if (!['ict', 'super_admin'].includes(rawRole)) return res.redirect('/ict-login.html');
    return next();
  });
});
app.use('/pages', (req, res, next) => {
  if (!req.path.toLowerCase().endsWith('.html')) return next();
  const pageName = path.basename(req.path);
  const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  return res.redirect(`/${pageName}${query}`);
});
app.use(express.static(path.join(__dirname, 'frontend'), { index: false }));
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  return generalLimiter(req, res, next);
});
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

function wrapAsyncRoutes(router) {
  router.stack.forEach((layer) => {
    if (layer.route && layer.route.stack) {
      layer.route.stack.forEach((routeLayer) => {
        const originalHandler = routeLayer.handle;
        routeLayer.handle = async function (req, res, next) {
          try {
            await originalHandler(req, res, next);
          } catch (error) {
            next(error);
          }
        };
      });
    }
  });
  return router;
}

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Cresent High School Portal API is running' });
});

app.post('/api/auth/login', authLimiter, (req, res, next) => {
  next();
});

app.post('/api/auth/signup', authLimiter, (req, res, next) => {
  next();
});

const publicApiPaths = new Set([
  '/health',
  '/auth/login',
  '/auth/signup',
  '/applications'
]);

app.use('/api', (req, res, next) => {
  const isPublicHealth = req.path === '/health';
  const isPublicAuthRoute = req.path.startsWith('/auth/login')
    || req.path.startsWith('/auth/signup')
    || req.path.startsWith('/auth/admin-login')
    || req.path.startsWith('/auth/csrf-token');
  const isPublicMaintenanceSettings = req.method === 'GET' && req.path === '/admin/settings/public';
  const isPublicApplicationCreate = req.method === 'POST' && req.path === '/applications';

  if (isPublicHealth || isPublicAuthRoute || isPublicMaintenanceSettings || isPublicApplicationCreate) {
    return next();
  }

  return authMiddleware(req, res, next);
});

app.use('/api/auth', wrapAsyncRoutes(authRoutes));

app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  if (req.path.startsWith('/api/auth/login') || req.path.startsWith('/api/auth/signup')) {
    return next();
  }
  if (req.method === 'POST' && req.path === '/api/applications') {
    return next();
  }
  return csrfProtection(req, res, next);
});

// Initialize Socket.IO for all route handlers
const applicationController = require('./controllers/applicationController');
applicationController.setIO(io);
// Attach io to other controllers that emit events
try {
  const academicController = require('./controllers/academicController');
  if (academicController && typeof academicController.setIO === 'function') academicController.setIO(io);
} catch (e) { console.warn('Could not set IO on academicController', e.message || e); }
try {
  const financeController = require('./controllers/financeController');
  if (financeController && typeof financeController.setIO === 'function') financeController.setIO(io);
} catch (e) { console.warn('Could not set IO on financeController', e.message || e); }
try {
  const portalController = require('./controllers/portalController');
  if (portalController && typeof portalController.setIO === 'function') portalController.setIO(io);
} catch (e) { console.warn('Could not set IO on portalController', e.message || e); }

app.use('/api/applications', wrapAsyncRoutes(applicationRoutes));
app.use('/api/students', wrapAsyncRoutes(studentRoutes));
app.use('/api/academics', wrapAsyncRoutes(academicRoutes));
app.use('/api/finance', wrapAsyncRoutes(financeRoutes));
app.use('/api/results', wrapAsyncRoutes(resultRoutes));
app.use('/api/transcript', wrapAsyncRoutes(transcriptRoutes));
app.use('/api/courses', wrapAsyncRoutes(courseRoutes));
app.use('/api/classes', wrapAsyncRoutes(classRoutes));
app.use('/api/admin', wrapAsyncRoutes(adminRoutes));
app.use('/api', wrapAsyncRoutes(portalRoutes));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

function collectFrontendPageTargets(relativeDirectory) {
  const directory = path.join(__dirname, 'frontend', relativeDirectory);
  if (!fs.existsSync(directory)) return {};
  return Object.fromEntries(fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return Object.entries(collectFrontendPageTargets(relativePath));
    if (!entry.name.toLowerCase().endsWith('.html')) return [];
    return [[`/${entry.name.toLowerCase()}`, relativePath]];
  }));
}

const frontendPageTargets = collectFrontendPageTargets('pages');

const protectedPagePatterns = [
  '/dashboard.html',
  '/finance.html',
  '/academics.html',
  '/academic.html',
  '/admissions.html',
  '/admin.html',
  '/admin-dashboard.html',
  '/admin-applications.html',
  '/admin-roles.html',
  '/admin-finance.html',
  '/admin-finance-balances.html',
  '/admin-finance-payments.html',
  '/admin-finance-receipts.html',
  '/admin-finance-statements.html',
  '/admin-finance-structure.html',
  '/admin-finance-upload.html',
  '/ict-portal.html',
  '/ict-dashboard.html', '/ict-health.html', '/ict-activity.html', '/ict-users.html', '/ict-permissions.html', '/ict-sessions.html', '/ict-security.html', '/ict-audit.html', '/ict-configuration.html', '/ict-logs.html', '/ict-integrations.html', '/ict-updates.html', '/ict-database.html', '/ict-backups.html', '/ict-storage.html', '/ict-email.html', '/ict-messages.html', '/ict-maintenance.html', '/ict-tickets.html', '/ict-history.html', '/ict-profile.html',
  '/teacher.html',
  '/student.html',
  '/profile.html',
  '/settings.html',
  '/reports.html',
  '/admin-security.html',
  '/notes.html',
  '/transcript.html',
  '/subject.html',
  '/paymentreceipts.html',
  '/feestatement.html',
  '/feestructure.html',
  '/lecturer-dashboard.html',
  '/teacher-portal.html',
  '/student-transcript.html',
  '/receipt_view.html',
  '/notifications.html',
  '/calendar.html',
  '/clearance-request.html',
  '/revision.html',
  
];

const protectedPageRoleMap = {
  '/dashboard.html': ['student', 'teacher', 'finance', 'admin', 'parent'],
  '/finance.html': ['finance', 'admin', 'student'],
  '/academics.html': ['teacher', 'admin', 'student'],
  '/academic.html': ['teacher', 'admin', 'student'],
  '/admissions.html': ['admin'],
  '/admin.html': ['admin'],
  '/admin-dashboard.html': ['admin'],
  '/admin-applications.html': ['admin'],
  '/admin-roles.html': ['admin'],
  '/admin-finance.html': ['finance', 'admin'],
  '/admin-finance-balances.html': ['finance', 'admin'],
  '/admin-finance-payments.html': ['finance', 'admin'],
  '/admin-finance-receipts.html': ['finance', 'admin'],
  '/admin-finance-statements.html': ['finance', 'admin'],
  '/admin-finance-structure.html': ['finance', 'admin'],
  '/admin-finance-upload.html': ['finance', 'admin'],
  '/ict-portal.html': ['ict'],
  '/ict-dashboard.html': ['ict', 'admin'],
  '/ict-health.html': ['ict', 'admin'],
  '/ict-activity.html': ['ict', 'admin'],
  '/ict-users.html': ['ict', 'admin'],
  '/ict-permissions.html': ['ict', 'admin'],
  '/ict-sessions.html': ['ict', 'admin'],
  '/ict-security.html': ['ict', 'admin'],
  '/ict-audit.html': ['ict', 'admin'],
  '/ict-configuration.html': ['ict', 'admin'],
  '/ict-logs.html': ['ict', 'admin'],
  '/ict-integrations.html': ['ict', 'admin'],
  '/ict-updates.html': ['ict', 'admin'],
  '/ict-database.html': ['ict', 'admin'],
  '/ict-backups.html': ['ict', 'admin'],
  '/ict-storage.html': ['ict', 'admin'],
  '/ict-email.html': ['ict', 'admin'],
  '/ict-messages.html': ['ict', 'admin'],
  '/ict-maintenance.html': ['ict', 'admin'],
  '/ict-tickets.html': ['ict', 'admin'],
  '/ict-history.html': ['ict', 'admin'],
  '/ict-profile.html': ['ict', 'admin'],
  '/teacher.html': ['teacher', 'admin'],
  '/student.html': ['admin', 'teacher'],
  '/profile.html': ['student', 'teacher', 'finance', 'admin', 'parent'],
  '/settings.html': ['student', 'teacher', 'finance', 'admin', 'parent'],
  '/reports.html': ['admin', 'finance', 'teacher'],
  '/admin-security.html': ['admin'],
  '/notes.html': ['student', 'teacher', 'admin'],
  '/transcript.html': ['student', 'teacher', 'admin'],
  '/subject.html': ['student', 'teacher', 'admin'],
  '/paymentreceipts.html': ['student', 'finance', 'admin'],
  '/feestatement.html': ['student', 'finance', 'admin'],
  '/feestructure.html': ['student', 'finance', 'admin'],
  '/lecturer-dashboard.html': ['teacher', 'admin'],
  '/teacher-portal.html': ['teacher'],
  '/student-transcript.html': ['admin', 'teacher', 'student'],
  '/receipt_view.html': ['student', 'finance', 'admin'],
  '/notifications.html': ['student', 'teacher', 'admin', 'parent'],
  '/calendar.html': ['student', 'teacher', 'admin', 'parent'],
  '/clearance-request.html': ['student', 'admin'],
  '/revision.html': ['student', 'teacher', 'admin'],
  
};

app.get(protectedPagePatterns, authMiddleware, (req, res, next) => {
  const pathname = req.path.toLowerCase();
  const allowedRoles = protectedPageRoleMap[pathname];
  if (!allowedRoles) {
    return res.redirect('/login.html');
  }
  const userRole = req.user?.role;
  if (!userRole || !allowedRoles.includes(userRole)) {
    const loginPage = pathname.startsWith('/ict-') ? '/ict-login.html' : pathname.startsWith('/admin-finance') ? '/finance-login.html' : '/login.html';
    return res.status(403).redirect(loginPage);
  }
  const pagePath = path.join(__dirname, 'frontend', frontendPageTargets[pathname] || pathname.replace(/^\//, ''));
  res.sendFile(pagePath, (error) => {
    if (error) {
      next(error);
    }
  });
});

const publicFrontendPagePaths = Object.keys(frontendPageTargets).filter((pathname) => !protectedPagePatterns.includes(pathname));
app.get(publicFrontendPagePaths, (req, res, next) => {
  const pagePath = path.join(__dirname, 'frontend', frontendPageTargets[req.path.toLowerCase()]);
  res.sendFile(pagePath, (error) => {
    if (error) next(error);
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.use((err, req, res, next) => {
  if (err && err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ success: false, message: 'Invalid CSRF token' });
  }
  console.error('Express error:', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
});

io.on('connection', (socket) => {
  socket.emit('connected', { message: 'Connected to Cresent portal real-time server' });

  socket.on('join_user_room', ({ user_id }) => {
    if (user_id) socket.join(`user:${user_id}`);
  });

  socket.on('join_role_room', ({ role }) => {
    if (role) socket.join(`role:${role}`);
  });

  socket.on('send_notification', ({ target_user_id, target_role, notification }) => {
    if (target_user_id) io.to(`user:${target_user_id}`).emit('notification', notification);
    else if (target_role) io.to(`role:${target_role}`).emit('notification', notification);
    else io.emit('notification', notification);
  });
});

async function start() {
  try {
    await ensureDatabase();
  } catch (error) {
    console.warn('Database initialization skipped:', error.message);
    console.warn('The portal will start in a limited mode until MySQL is configured.');
  }

  const port = Number(process.env.PORT || 5001);
  const host = process.env.HOST || '0.0.0.0';
  const appUrl = process.env.APP_URL || (isProduction ? 'https://cresenthighschool.onrender.com' : 'http://localhost:3000');
  const emailConfiguration = getEmailConfiguration();
  if (emailConfiguration.provider === 'SMTP') {
    console.log('Email provider: SMTP');
    console.log(`SMTP endpoint: ${emailConfiguration.host || '(not configured)'}:${emailConfiguration.port || '(not configured)'}`);
    verifyMailTransport().then((verification) => {
      console.log('SMTP verification:', verification.reachable ? 'passed' : `failed (${verification.failureReason || verification.message})`);
    }).catch(() => {
      console.warn('SMTP verification failed: SMTP_VERIFICATION_ERROR');
    });
  } else {
    console.warn('Email provider configuration missing');
  }
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Stop the old Node server before starting a new one.`);
      process.exit(1);
    }

    console.error('Server startup error:', error);
    process.exit(1);
  });

  server.listen(port, host, () => {
    console.log(`Cresent High School Portal listening on ${host}:${port}`);
    console.log(`Application URL: ${appUrl}`);
    console.log(`MySQL database status: ${process.env.DB_NAME || process.env.DB_DATABASE || 'railway'} (startup continued in fallback mode if unavailable)`);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
  });
}

if (require.main === module) {
  start();
}

// Export io instance for use in routes and controllers
module.exports = { app, server, io, start };
