/**
 * Frontend Configuration
 * Values are environment-aware so the app works in development and production.
 */

const fallbackApiUrl = (typeof window !== 'undefined' && window.location)
  ? `${window.location.origin}/api`
  : 'https://cresenthighschool.onrender.com/api';
const fallbackWsUrl = (typeof window !== 'undefined' && window.location)
  ? window.location.origin
  : 'https://cresenthighschool.onrender.com';

const CONFIG = {
  API_URL: (typeof window !== 'undefined' && window.__APP_API_URL__) || fallbackApiUrl,
  WS_URL: (typeof window !== 'undefined' && window.__APP_WS_URL__) || fallbackWsUrl,
  APP_URL: 'https://cresenthighschool.onrender.com',
  FRONTEND_URL: 'https://cresenthighschool.onrender.com',
  TOKEN_EXPIRY: 7 * 24 * 60 * 60 * 1000,
  PROTECTED_PAGES: [
    'dashboard.html',
    'academic.html',
    'finance.html',
    'exams.html',
    'admin-dashboard.html',
    'lecturer-dashboard.html'
  ]
};

window.CONFIG = CONFIG;
