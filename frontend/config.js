/**
 * Frontend Configuration
 * Change these values based on your deployment environment
 */

const CONFIG = {
  // Backend API URL
  // Local development: http://localhost:5001/api
  // Production: Update this to your production backend URL
  API_URL: 'http://localhost:5001/api',
  
  // Token expiration time (optional, for UI purposes)
  TOKEN_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  
  // Pages that require authentication
  PROTECTED_PAGES: [
    'dashboard.html',
    'academic.html',
    'finance.html',
    'exams.html',
    'admin-dashboard.html'
  ]
};

// Make CONFIG global
window.CONFIG = CONFIG;
