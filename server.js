const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const { ensureDatabase, query } = require('./config/db');
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
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

app.use(cors());
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

app.use('/api/auth', wrapAsyncRoutes(authRoutes));

// Initialize Socket.IO for all route handlers
const applicationController = require('./controllers/applicationController');
applicationController.setIO(io);

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
app.use(express.static(path.join(__dirname, 'frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.use((err, req, res, next) => {
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
  server.listen(port, () => {
    console.log(`Cresent High School Portal running at http://localhost:${port}`);
    console.log(`MySQL database status: ${process.env.DB_NAME || 'cresent_high_school_portal'} (startup continued in fallback mode if unavailable)`);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
  });
}

start();

// Export io instance for use in routes and controllers
module.exports = { app, server, io };
