/**
 * Admin Authentication Security Module
 * Implements enhanced security for admin login with:
 * - CSRF token protection
 * - Rate limiting and brute-force protection
 * - Session timeout warnings
 * - Admin role verification
 * - Secure token storage
 * - Activity logging
 */

// Security Configuration
const ADMIN_AUTH_CONFIG = {
  maxAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15 minutes
  sessionWarningTime: 10 * 60 * 1000, // 10 minutes
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  minPasswordLength: 8,
  tokenRefreshThreshold: 5 * 60 * 1000, // 5 minutes before expiry
};

// In-memory rate limiting store (use server-side in production)
const adminLoginAttempts = {};

/**
 * Get API URL for authentication requests
 */
function getAdminApiUrl() {
  const config = (typeof window !== 'undefined' && window.CONFIG)
    || (typeof globalThis !== 'undefined' && globalThis.CONFIG)
    || (typeof CONFIG !== 'undefined' ? CONFIG : null);

  const configuredUrl = config && config.API_URL ? config.API_URL : null;
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, '');
  }

  const fallbackUrl = (typeof window !== 'undefined' && window.location)
    ? `${window.location.origin}/api`
    : 'https://cresenthighschool.onrender.com/api';
  return fallbackUrl;
}

/**
 * Initialize CSRF token from server
 */
async function initializeCSRFToken() {
  try {
    const response = await fetch(`${getAdminApiUrl()}/auth/csrf-token`, {
      method: 'GET',
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      const tokenField = document.getElementById('csrfToken');
      if (tokenField) {
        tokenField.value = data.token || '';
      }
      sessionStorage.setItem('csrfToken', data.token || '');
    }
  } catch (error) {
    console.error('Failed to initialize CSRF token:', error);
  }
}

/**
 * Check if admin login is locked due to brute force attempts
 */
function isLoginLocked(username) {
  const key = `admin_${username.toLowerCase()}`;
  const attempts = adminLoginAttempts[key];
  
  if (!attempts) return false;
  
  const now = Date.now();
  if (now - attempts.firstAttempt > ADMIN_AUTH_CONFIG.lockoutDuration) {
    delete adminLoginAttempts[key];
    return false;
  }
  
  return attempts.count >= ADMIN_AUTH_CONFIG.maxAttempts;
}

/**
 * Record failed login attempt
 */
function recordFailedAttempt(username) {
  const key = `admin_${username.toLowerCase()}`;
  const now = Date.now();
  
  if (!adminLoginAttempts[key]) {
    adminLoginAttempts[key] = {
      count: 1,
      firstAttempt: now,
      lastAttempt: now
    };
  } else {
    adminLoginAttempts[key].count++;
    adminLoginAttempts[key].lastAttempt = now;
  }
  
  return adminLoginAttempts[key].count;
}

/**
 * Clear failed login attempts
 */
function clearFailedAttempts(username) {
  const key = `admin_${username.toLowerCase()}`;
  delete adminLoginAttempts[key];
}

/**
 * Validate input before submission
 */
function validateAdminLoginInput(username, password) {
  const errors = [];
  
  // Username validation
  if (!username || username.trim().length === 0) {
    errors.push('Admin username is required');
  } else if (username.length > 100) {
    errors.push('Invalid username format');
  }
  
  // Password validation
  if (!password || password.length === 0) {
    errors.push('Password is required');
  } else if (password.length < ADMIN_AUTH_CONFIG.minPasswordLength) {
    errors.push(`Password must be at least ${ADMIN_AUTH_CONFIG.minPasswordLength} characters`);
  }
  
  return errors;
}

/**
 * Safely store admin session token
 */
function storeAdminToken(token, rememberMe = false) {
  // Token stored in sessionStorage (cleared on browser close)
  sessionStorage.setItem('adminAuthToken', token);
  sessionStorage.setItem('tokenTimestamp', Date.now().toString());
  
  if (rememberMe) {
    // Additional 7-day cookie for device recognition (no token stored)
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `adminDeviceTrusted=true; path=/; expires=${expires}; SameSite=Strict; Secure`;
  }
  
  // Also set secure HTTP-only cookie (server will set this)
  const expires = new Date(Date.now() + ADMIN_AUTH_CONFIG.sessionTimeout).toUTCString();
  document.cookie = `adminSessionId=${token}; path=/; expires=${expires}; SameSite=Strict; HttpOnly; Secure`;
}

/**
 * Retrieve admin token securely
 */
function getAdminToken() {
  return sessionStorage.getItem('adminAuthToken');
}

/**
 * Start session timeout warning
 */
function initializeSessionTimeoutWarning() {
  const tokenTimestamp = parseInt(sessionStorage.getItem('tokenTimestamp') || '0');
  const now = Date.now();
  
  // Warn if session is about to expire
  const timeRemaining = (tokenTimestamp + ADMIN_AUTH_CONFIG.sessionTimeout) - now;
  
  if (timeRemaining > 0 && timeRemaining < ADMIN_AUTH_CONFIG.sessionWarningTime) {
    const minutesLeft = Math.ceil(timeRemaining / 60000);
    showAlert(`Your admin session will expire in ${minutesLeft} minutes`, 'warn');
  }
  
  // Auto-logout on session timeout
  setTimeout(() => {
    sessionStorage.clear();
    showAlert('Your admin session has expired. Please log in again.', 'error');
    window.location.href = 'admin-login.html';
  }, timeRemaining);
}

/**
 * Show alert message
 */
function showAlert(message, type = 'error') {
  const alertDiv = document.createElement('div');
  alertDiv./styles/shared/style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 1rem;
    border-radius: 8px;
    background: ${type === 'error' ? '#fee2e2' : type === 'success' ? '#dcfce7' : type === 'warn' ? '#fef3c7' : '#dbeafe'};
    color: ${type === 'error' ? '#991b1b' : type === 'success' ? '#166534' : type === 'warn' ? '#92400e' : '#1e40af'};
    border: 1px solid ${type === 'error' ? '#fca5a5' : type === 'success' ? '#86efac' : type === 'warn' ? '#fcd34d' : '#93c5fd'};
    max-width: 400px;
    z-index: 9999;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  `;
  alertDiv.textContent = message;
  document.body.appendChild(alertDiv);
  
  // Auto-remove after 5 seconds
  setTimeout(() => alertDiv.remove(), 5000);
}

/**
 * Handle admin login form submission
 */
const adminLoginForm = document.getElementById('adminLoginForm');
if (adminLoginForm) {
  // Initialize CSRF token on page load
  document.addEventListener('DOMContentLoaded', initializeCSRFToken);
  
  adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    const loginBtn = document.getElementById('loginBtn');
    
    // Validate input
    const validationErrors = validateAdminLoginInput(username, password);
    if (validationErrors.length > 0) {
      showAlert(validationErrors.join('; '), 'error');
      return;
    }
    
    // Check rate limiting
    if (isLoginLocked(username)) {
      const attemptsData = adminLoginAttempts[`admin_${username.toLowerCase()}`];
      const remainingTime = Math.ceil((ADMIN_AUTH_CONFIG.lockoutDuration - (Date.now() - attemptsData.firstAttempt)) / 60000);
      showAlert(`Too many failed attempts. Please try again in ${remainingTime} minutes.`, 'error');
      document.getElementById('failedAttempts').textContent = `Account locked. Try again in ${remainingTime} minutes.`;
      document.getElementById('failedAttempts').style.display = 'block';
      return;
    }
    
    // Disable button during submission
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    
    try {
      const csrfToken = document.getElementById('csrfToken').value;
      
      const response = await fetch(`${getAdminApiUrl()}/auth/admin-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      
      if (data.success && data.token && data.admin) {
        // Verify admin role
        const role = (data.admin.role || '').toLowerCase();
        if (!['admin', 'rba', 'school_admin', 'super_admin'].includes(role)) {
          showAlert('Unauthorized: Admin access required', 'error');
          recordFailedAttempt(username);
          return;
        }
        
        // Store token and admin data
        storeAdminToken(data.token, rememberMe);
        sessionStorage.setItem('adminUser', JSON.stringify(data.admin));
        
        // Clear failed attempts
        clearFailedAttempts(username);
        
        // Log security event
        console.log('✅ Admin login successful', { username: data.admin.username, timestamp: new Date().toISOString() });
        
        showAlert('Admin login successful! Redirecting...', 'success');
        
        // Redirect to admin dashboard
        setTimeout(() => {
          window.location.href = 'admin-dashboard.html';
        }, 1000);
      } else {
        // Record failed attempt
        const attemptCount = recordFailedAttempt(username);
        const remaining = ADMIN_AUTH_CONFIG.maxAttempts - attemptCount;
        
        showAlert(data.message || 'Login failed. Invalid credentials.', 'error');
        
        if (remaining > 0) {
          document.getElementById('failedAttempts').textContent = `Failed login attempts: ${attemptCount}/${ADMIN_AUTH_CONFIG.maxAttempts}`;
          document.getElementById('failedAttempts').style.display = 'block';
        }
      }
    } catch (error) {
      console.error('Admin login error:', error);
      recordFailedAttempt(username);
      showAlert(`Error: ${error.message}`, 'error');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login';
      // Clear password field
      document.getElementById('password').value = '';
    }
  });
}

// Export functions for global use
window.adminAuth = {
  getToken: getAdminToken,
  initializeSessionTimeout: initializeSessionTimeoutWarning
};
