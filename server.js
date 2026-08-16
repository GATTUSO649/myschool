const path = require('path');
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

const app = express();
// Configure trust proxy based on environment (set TRUST_PROXY=true when behind a reverse proxy)
const trustProxy = (typeof process.env.TRUST_PROXY !== 'undefined')
  ? (String(process.env.TRUST_PROXY).toLowerCase() === 'true')
  : (!!process.env.RENDER || isProduction);
app.set('trust proxy', trustProxy);
console.log('Express trust proxy set to', trustProxy);
const server = http.createServer(app);
const isProduction = process.env.NODE_ENV === 'production';
const configuredCorsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  'https://cresenthighschool.onrender.com',
  'https://www.cresenthighschool.onrender.com',
  ...(isProduction ? [] : ['http://localhost:3000', 'http://localhost:5001', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5001']),
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
app.use(express.static(path.join(__dirname, 'frontend'), { index: false }));
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  return generalLimiter(req, res, next);
});
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(parseCookies);

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
  const isPublicAuthRoute = req.path.startsWith('/auth/login') || req.path.startsWith('/auth/signup');
  const isPublicApplicationCreate = req.method === 'POST' && req.path === '/applications';

  if (isPublicHealth || isPublicAuthRoute || isPublicApplicationCreate) {
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

const protectedPagePatterns = [
  '/dashboard.html',
  '/finance.html',
  '/academics.html',
  '/academic.html',
  '/admissions.html',
  '/admin.html',
  '/admin-dashboard.html',
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
    return res.status(403).redirect('/login.html');
  }
  const pagePath = path.join(__dirname, 'frontend', pathname.replace(/^\//, ''));
  res.sendFile(pagePath, (error) => {
    if (error) {
      next(error);
    }
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
