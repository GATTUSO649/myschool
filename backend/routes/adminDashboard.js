const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminDashboardController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authorizeRole } = require('../middleware/adminMiddleware');

// ============================================================================
// DASHBOARD ROUTES
// ============================================================================

// Get dashboard statistics
router.get('/stats', authenticateToken, authorizeRole(['admin']), adminController.getStats);

// Get activity logs
router.get('/logs', authenticateToken, authorizeRole(['admin']), adminController.getActivityLogs);

// ============================================================================
// STUDENT MANAGEMENT ROUTES
// ============================================================================

// List all students
router.get('/students', authenticateToken, authorizeRole(['admin']), adminController.getAllStudents);

// Register new student
router.post('/students/register', authenticateToken, authorizeRole(['admin']), adminController.registerStudent);

// Get student profile
router.get('/students/:studentId', authenticateToken, authorizeRole(['admin']), adminController.getStudentProfile);

// ============================================================================
// APPLICATION/ADMISSION ROUTES
// ============================================================================

// Get applications
router.get('/applications', authenticateToken, authorizeRole(['admin']), adminController.getApplications);

// Approve application
router.post('/applications/:applicationId/approve', authenticateToken, authorizeRole(['admin']), adminController.approveApplication);

// Reject application
router.post('/applications/:applicationId/reject', authenticateToken, authorizeRole(['admin']), adminController.rejectApplication);

// ============================================================================
// USER MANAGEMENT ROUTES
// ============================================================================

// Change user role
router.put('/users/:userId/role', authenticateToken, authorizeRole(['admin']), adminController.changeUserRole);

// Deactivate user
router.put('/users/:userId/deactivate', authenticateToken, authorizeRole(['admin']), adminController.deactivateUser);

// ============================================================================
// DATABASE ROUTES
// ============================================================================

// Get database info
router.get('/database/info', authenticateToken, authorizeRole(['admin']), adminController.getDatabaseInfo);

// Backup database
router.post('/database/backup', authenticateToken, authorizeRole(['admin']), adminController.backupDatabase);

module.exports = router;
