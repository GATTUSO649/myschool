const passwordForm = document.getElementById('staffPasswordForm');
const passwordMessage = document.getElementById('passwordMessage');
const submitButton = document.getElementById('changePasswordButton');
const newPasswordInput = document.getElementById('newPassword');
const strengthBar = document.getElementById('strengthBar');
const identity = (() => {
  try {
    return JSON.parse(sessionStorage.getItem('adminUser') || 'null')
      || JSON.parse(sessionStorage.getItem('student') || 'null');
  } catch (error) {
    console.error('Could not read signed-in staff details:', error);
    return null;
  }
})();

document.getElementById('staffIdentity').textContent = identity?.staffNumber || identity?.username || 'Staff account';

document.querySelectorAll('[data-toggle-password]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.togglePassword);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? 'Hide' : 'Show';
    button.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} ${input.labels?.[0]?.textContent.trim() || 'password'}`);
  });
});

newPasswordInput.addEventListener('input', () => {
  const password = newPasswordInput.value;
  const requirements = [
    password.length >= 12,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password)
  ];
  strengthBar.style.width = `${requirements.filter(Boolean).length * 20}%`;
});

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  passwordMessage.className = 'message';
  passwordMessage.textContent = '';
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = newPasswordInput.value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  if (newPassword !== confirmPassword) {
    passwordMessage.textContent = 'The new passwords do not match.';
    return;
  }
  if (newPassword.length < 12 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
    passwordMessage.textContent = 'Use at least 12 characters including uppercase, lowercase, a number, and a symbol.';
    return;
  }

  const token = sessionStorage.getItem('adminAuthToken') || sessionStorage.getItem('authToken');
  if (!token) {
    passwordMessage.textContent = 'Your sign-in session has expired. Please sign in again.';
    return;
  }
  submitButton.disabled = true;
  submitButton.textContent = 'Updating...';
  try {
    const apiUrl = String(window.CONFIG?.API_URL || `${window.location.origin}/api`).replace(/\/+$/, '');
    const response = await fetch(`${apiUrl}/auth/password/change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      credentials: 'include',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Password change failed.');

    const account = identity || {};
    account.mustChangePassword = false;
    account.role = data.portalRole || account.role;
    if (Array.isArray(data.roleKeys)) account.roles = data.roleKeys;
    if (sessionStorage.getItem('adminUser')) sessionStorage.setItem('adminUser', JSON.stringify(account));
    else sessionStorage.setItem('student', JSON.stringify(account));
    passwordMessage.className = 'message success';
    passwordMessage.textContent = 'Password updated. Opening your assigned portal...';
    const role = String(data.portalRole || account.role || account.rawRole || '').toLowerCase();
    const destination = {
      admin: '/admin-dashboard.html',
      finance: '/admin-finance.html',
      ict: '/ict-portal.html',
      academics: '/admin-academics.html',
      teacher: '/teacher-portal.html',
      hod: '/department-portal.html',
      deputy: '/deputy-portal.html',
      registrar: '/admin-applications.html'
    }[role];
    if (!destination) {
      passwordMessage.textContent = 'Password updated. Contact the school administrator to confirm your portal assignment.';
      return;
    }
    window.location.replace(destination);
  } catch (error) {
    passwordMessage.textContent = error.message || 'Password change failed.';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Change password';
  }
});

document.getElementById('logoutButton').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.replace('/login.html');
});
