// Backend API URL - Change this if your backend is hosted elsewhere
function getApiUrl() {
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

// Helper for auth route prefix
function getAuthUrl() {
  return `${getApiUrl()}/auth`;
}

// Handle Login Form Submission
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const identifier = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const rememberMe = document.getElementById('rememberMe').checked;
    console.log('Login form values:', { identifier, password, rememberMe });
    if (!identifier || !password) {
      showAlert('Please enter both name/email and password', 'error');
      return;
    }
  
    const name = identifier;

    try {
      console.log('Attempting login with:', { name, password: '***' });
      console.log('API URL:', getApiUrl());
      
      const response = await fetch(`${getAuthUrl()}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        body: JSON.stringify({ name, password })
      });

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (data.success) {
        // Normalize student admission identifier in localStorage.
        const student = data.student || {};
        const normalizedAdmission = student.admission_number || student.adm || student.admissionNumber;
        if (!normalizedAdmission && password && student.role !== 'rba') {
          student.admission_number = password;
          student.adm = password;
        } else {
          student.admission_number = normalizedAdmission || student.admission_number || student.adm || student.admissionNumber;
          student.adm = student.admission_number;
        }

        // Save token and normalized student data to localStorage
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('student', JSON.stringify(student));

        const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
        document.cookie = `authToken=${encodeURIComponent(data.token)}; path=/; expires=${expires}; SameSite=Lax`;
        
        console.log('✅ Token saved to localStorage');
        console.log('authToken now =', localStorage.getItem('authToken'));
        console.log('student now =', localStorage.getItem('student'));
        
        if (rememberMe) {
          localStorage.setItem('rememberMe', 'true');
        }

        showAlert('Login successful! Redirecting...', 'success');
        
        // Redirect after 1 second.
        setTimeout(() => {
          try {
            const role = (data.student && data.student.role ? data.student.role : '').toLowerCase();
            const username = data.student && data.student.username;
            if (role === 'admin' || role === 'rba' || role === 'school_admin' || role === 'super_admin' || username === 'admin') {
              console.log('Redirecting admin to admin-dashboard.html');
              window.location.href = 'admin-dashboard.html';
            } else if (role === 'teacher' || role === 'lecturer') {
              console.log('Redirecting lecturer to lecturer-dashboard.html');
              window.location.href = 'lecturer-dashboard.html';
            } else {
              console.log('Redirecting student to dashboard.html');
              window.location.href = 'dashboard.html';
            }
          } catch (err) {
            console.error('Redirect error:', err);
            window.location.href = 'dashboard.html';
          }
        }, 1000);
      } else {
        showAlert(data.message || 'Login failed', 'error');
      }
    } catch (error) {
      console.error('Login error:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      showAlert(`Error: ${error.message}`, 'error');
    }
  });
}

// Handle Signup Form Submission
const registerForm = document.getElementById('registerForm');
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('regUsername').value.trim();
    const admissionNumber = document.getElementById('regAdmission').value.trim().toUpperCase();
    const password = document.getElementById('regPassword').value.trim();
    const confirm = document.getElementById('regConfirm').value.trim();

    // Validation
    if (!username || !admissionNumber || !password || !confirm) {
      showAlert('Please fill in all fields', 'error');
      return;
    }

    if (password.toUpperCase() !== admissionNumber || confirm.toUpperCase() !== admissionNumber) {
      showAlert('Use your assigned admission number as both password fields', 'error');
      return;
    }

    try {
      console.log('Attempting signup with:', { username, admissionNumber });
      console.log('API URL:', getApiUrl());
      
      const response = await fetch(`${getAuthUrl()}/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        body: JSON.stringify({ username, admissionNumber, password, confirm })
      });

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (data.success) {
        // Do NOT log user in automatically after signup. They should use the login page.
        showAlert('Account created successfully. Login with your username and admission number.', 'success');
        
        // Redirect to login after a brief delay so user sees the message
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 1500);
      } else {
        showAlert(data.message || 'Signup failed', 'error');
      }
    } catch (error) {
      console.error('Signup error:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      showAlert(`Error: ${error.message}`, 'error');
    }
  });
}

// Check if user is authenticated (call this on protected pages like dashboard)
function checkAuth() {
  const token = localStorage.getItem('authToken');
  const student = getStudentInfo();
  const path = window.location.pathname.toLowerCase();
  const page = path.split('/').pop();

  if (!token) {
    if (!page.includes('login.html') && !page.includes('signup.html')) {
      window.location.replace('login.html');
    }
    return false;
  }

  const role = (student && student.role ? student.role : '').toLowerCase();
  const normalizedRole = role === 'rba' || role === 'admin' || role === 'super_admin' || role === 'superadmin' || role === 'school_admin' || role === 'schooladmin' ? 'admin' : role;

  const protectedPages = {
    'dashboard.html': ['student', 'teacher', 'finance', 'admin', 'parent'],
    'finance.html': ['finance', 'admin', 'student'],
    'academic.html': ['teacher', 'admin', 'student'],
    'admissions.html': ['admin'],
    'admin-dashboard.html': ['admin'],
    'admin.html': ['admin'],
    'teacher.html': ['teacher', 'admin'],
    'student.html': ['admin', 'teacher'],
    'profile.html': ['student', 'teacher', 'finance', 'admin', 'parent'],
    'settings.html': ['student', 'teacher', 'finance', 'admin', 'parent'],
    'reports.html': ['admin', 'finance', 'teacher'],
    'notes.html': ['student', 'teacher', 'admin'],
    'transcript.html': ['student', 'teacher', 'admin'],
    'subject.html': ['student', 'teacher', 'admin'],
    'paymentreceipts.html': ['student', 'finance', 'admin'],
    'feestatement.html': ['student', 'finance', 'admin'],
    'feestructure.html': ['student', 'finance', 'admin'],
    'lecturer-dashboard.html': ['teacher', 'admin'],
    'student-transcript.html': ['admin', 'teacher', 'student'],
    'receipt_view.html': ['student', 'finance', 'admin'],
    'notifications.html': ['student', 'teacher', 'admin', 'parent'],
    'calendar.html': ['student', 'teacher', 'admin', 'parent'],
    'clearance-request.html': ['student', 'admin'],
    'revision.html': ['student', 'teacher', 'admin'],
    'exams.html': ['student', 'teacher', 'admin']
  };

  if (protectedPages[page] && !protectedPages[page].includes(normalizedRole)) {
    if (normalizedRole === 'admin') {
      window.location.replace('admin-dashboard.html');
    } else if (normalizedRole === 'teacher') {
      window.location.replace('lecturer-dashboard.html');
    } else {
      window.location.replace('dashboard.html');
    }
    return false;
  }

  return true;
}

function isAdminPath() {
  const path = window.location.pathname.toLowerCase();
  return path.includes('admin') || path.includes('login.html') || path.includes('signup.html') || path.endsWith('/') || path.includes('index.html');
}

async function enforceMaintenanceMode() {
  if (isAdminPath()) return;
  try {
    const response = await fetch(`${getApiUrl()}/admin/settings/public`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.maintenanceMode) return;
    document.body.innerHTML = `
      <main class="maintenance-lock">
        <section>
          <h1>Student portal under maintenance</h1>
          <p>The school portal is temporarily closed for updates. Please check again later.</p>
          <a href="login.html">Back to login</a>
        </section>
      </main>
    `;
  } catch (error) {
    console.warn('Maintenance mode check failed:', error);
  }
}

// Get current student info
function getStudentInfo() {
  const studentJson = localStorage.getItem('student');
  return studentJson ? JSON.parse(studentJson) : null;
}

// Get authentication token
function getAuthToken() {
  return localStorage.getItem('authToken');
}

function getCsrfToken() {
  const cookieValue = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('csrfToken='));
  if (!cookieValue) return '';
  return decodeURIComponent(cookieValue.split('=').slice(1).join('='));
}

async function fetchWithAuth(endpoint, options = {}) {
  const token = getAuthToken();
  const apiUrl = getApiUrl();
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const base = apiUrl.replace(/\/api$/, '');
  const url = normalizedEndpoint.startsWith('/api')
    ? `${base}${normalizedEndpoint}`
    : `${apiUrl}${normalizedEndpoint}`;
  const isForm = options.body instanceof FormData;
  const headers = isForm ? { ...(options.headers || {}) } : { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const csrfToken = getCsrfToken();
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let body = options.body;
  if (!isForm && body != null && Object.prototype.toString.call(body) === '[object Object]') {
    body = JSON.stringify(body);
  }

  return fetch(url, { ...options, headers, body });
}

window.SCHOOL_FORMS = window.SCHOOL_FORMS || ['Form 1', 'Form 2', 'Form 3', 'Form 4'];
window.EIGHT_FOUR_FOUR_SUBJECTS = window.EIGHT_FOUR_FOUR_SUBJECTS || [
  'English',
  'Kiswahili',
  'Mathematics',
  'Biology',
  'Physics',
  'Chemistry',
  'History and Government',
  'Geography',
  'Christian Religious Education',
  'Business Studies',
  'Computer Studies',
  'Agriculture'
];

function enforceSchoolAcademicOptions() {
  const subjectSelectors = ['select[name="subject"]', '#noteSubject', '#materialSubject', '#docSubject', '#docSubjectFilter'];
  document.querySelectorAll(subjectSelectors.join(',')).forEach((select) => {
    const firstLabel = select.id === 'docSubjectFilter' || select.id === 'subjectFilter' ? 'All Subjects' : 'Select Subject';
    const allowAll = select.id === 'docSubjectFilter' || select.id === 'subjectFilter';
    select.innerHTML = `<option value="${allowAll ? 'all' : ''}">${firstLabel}</option>` +
      window.EIGHT_FOUR_FOUR_SUBJECTS.map(subject => `<option value="${subject}">${subject}</option>`).join('');
  });

  const classSelectors = ['select[name="class"]', '#noteClass', '#docClass', '#newStudentClass', '#classFilter'];
  document.querySelectorAll(classSelectors.join(',')).forEach((select) => {
    const allowAll = select.id === 'classFilter' || select.id === 'docClass';
    select.innerHTML = `<option value="">${allowAll ? 'All Classes' : 'Select Class'}</option>` +
      window.SCHOOL_FORMS.map(form => `<option value="${form}">${form}</option>`).join('');
  });
}

// Display admin navigation link if current user has lecturer role
function showAdminLink(){
  const student = getStudentInfo();
  if(student && (student.role === 'lecturer' || student.role === 'rba')){
    const link = document.getElementById('adminLink');
    if(link) link.style.display = 'inline-block';
  }
}

// Logout function — GUARDED to prevent accidental logouts
function logout() {
  // Only logout if explicitly called (e.g., user clicks logout button)
  // Log the action for diagnostics
  console.log('logout() called explicitly');
  const confirmLogout = confirm('Do you want to logout?');
  if (!confirmLogout) {
    console.log('logout cancelled by user');
    return;
  }
  
  localStorage.removeItem('authToken');
  localStorage.removeItem('student');
  localStorage.removeItem('rememberMe');
  document.cookie = 'authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
  console.log('localStorage keys cleared for logout');
  window.location.href = 'login.html';
}

// Helper: Validate email
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Helper: Show alert messages
function showAlert(message, type = 'info') {
  // Create alert container if it doesn't exist
  let alertContainer = document.getElementById('alertContainer');
  if (!alertContainer) {
    alertContainer = document.createElement('div');
    alertContainer.id = 'alertContainer';
    alertContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      max-width: 400px;
    `;
    document.body.appendChild(alertContainer);
  }

  // Create alert element
  const alert = document.createElement('div');
  alert.style.cssText = `
    padding: 15px 20px;
    margin-bottom: 10px;
    border-radius: 8px;
    font-weight: 500;
    animation: slideIn 0.3s ease-out;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;

  if (type === 'success') {
    alert.style.backgroundColor = '#d4edda';
    alert.style.color = '#155724';
    alert.style.border = '1px solid #c3e6cb';
  } else if (type === 'error') {
    alert.style.backgroundColor = '#f8d7da';
    alert.style.color = '#721c24';
    alert.style.border = '1px solid #f5c6cb';
  } else {
    alert.style.backgroundColor = '#d1ecf1';
    alert.style.color = '#0c5460';
    alert.style.border = '1px solid #bee5eb';
  }

  alert.textContent = message;
  alertContainer.appendChild(alert);

  // Auto-remove after 4 seconds
  setTimeout(() => {
    alert.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => alert.remove(), 300);
  }, 4000);
}

// Add CSS animations for alerts
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Auto-login if rememberMe was enabled
window.addEventListener('load', () => {
  const token = localStorage.getItem('authToken');
  const student = getStudentInfo();
  const page = window.location.pathname.split('/').pop().toLowerCase();

  if (token && page.includes('login.html')) {
    const role = (student && student.role ? student.role : '').toLowerCase();
    const normalizedRole = role === 'rba' || role === 'admin' || role === 'super_admin' || role === 'superadmin' || role === 'school_admin' || role === 'schooladmin' ? 'admin' : role;
    if (normalizedRole === 'admin') {
      window.location.replace('admin-dashboard.html');
    } else if (normalizedRole === 'teacher') {
      window.location.replace('lecturer-dashboard.html');
    } else {
      window.location.replace('dashboard.html');
    }
  }
});

// Log storage events (helps debug unexpected clears of auth data)
window.addEventListener('storage', (e) => {
  if (!e) return;
  try {
    const action = e.newValue ? 'SET' : 'CLEARED';
    // Alert to auth-related keys
    if (e.key === 'authToken' || e.key === 'student' || e.key === 'rememberMe') {
      console.warn(`🔐 storage event [${e.key}]: ${action}`, {
        oldValue: e.oldValue ? e.oldValue.substring(0, 20) + '...' : null,
        newValue: e.newValue ? e.newValue.substring(0, 20) + '...' : null,
        url: e.url,
        key: e.key
      });
    } else {
      console.log(`storage event [${e.key}]: ${action}`);
    }
  } catch (err) {
    console.warn('storage event logging failed', err);
  }
});

// run showAdminLink on DOM load so nav is updated across pages
window.addEventListener('DOMContentLoaded', () => {
  enforceMaintenanceMode();
  enforceSchoolAcademicOptions();
  showAdminLink();
  const page = window.location.pathname.split('/').pop().toLowerCase();
  const protectedPages = new Set([
    'dashboard.html','finance.html','academic.html','academics.html','admissions.html','admin.html','admin-dashboard.html','admin-security.html','teacher.html','student.html','profile.html','settings.html','reports.html','notes.html','transcript.html','subject.html','paymentreceipts.html','feestatement.html','feestructure.html','lecturer-dashboard.html','student-transcript.html','receipt_view.html','notifications.html','calendar.html','clearance-request.html','revision.html','exams.html'
  ]);
  if (protectedPages.has(page)) {
    checkAuth();
  }
});
