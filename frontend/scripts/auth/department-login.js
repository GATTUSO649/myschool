(() => {
  const api = (typeof getApiUrl === 'function' ? getApiUrl() : `${window.location.origin}/api`);
  const departmentSelect = document.getElementById('departmentId');
  const loginForm = document.getElementById('departmentLoginForm');
  const loginStatus = document.getElementById('departmentLoginStatus');
  const loginButton = document.getElementById('departmentLoginButton');
  const resetStatus = document.getElementById('resetStatus');
  const escapeValue = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));

  async function loadDepartments() {
    try {
      const response = await fetch(`${api}/auth/departments`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load departments');
      departmentSelect.innerHTML = '<option value="">Select department</option>' + (data.departments || []).map((department) => `<option value="${department.id}">${escapeValue(department.name)} (${escapeValue(department.code)})</option>`).join('');
    } catch (error) {
      departmentSelect.innerHTML = '<option value="">Departments unavailable</option>';
      loginStatus.textContent = error.message || 'Unable to load departments.';
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginButton.disabled = true;
    loginStatus.textContent = 'Signing in...';
    try {
      const response = await fetch(`${api}/auth/department-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ departmentId: departmentSelect.value, username: document.getElementById('departmentUsername').value.trim(), password: document.getElementById('departmentPassword').value }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Invalid department login details');
      sessionStorage.setItem('authToken', data.token);
      sessionStorage.setItem('student', JSON.stringify(data.student));
      sessionStorage.setItem('departmentId', String(data.department.id));
      sessionStorage.setItem('department', JSON.stringify(data.department));
      sessionStorage.setItem('authSessionExpiresAt', String(Date.now() + 30 * 60 * 1000));
      window.location.href = data.student.mustChangePassword ? 'settings.html' : `department-portal.html?id=${encodeURIComponent(data.department.id)}`;
    } catch (error) {
      loginStatus.textContent = error.message || 'Department login failed.';
    } finally {
      loginButton.disabled = false;
    }
  });

  document.getElementById('departmentResetForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    resetStatus.textContent = 'Requesting reset instructions...';
    try {
      const response = await fetch(`${api}/auth/password-reset/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ identifier: document.getElementById('resetIdentifier').value.trim() }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Reset request failed');
      resetStatus.textContent = data.message;
    } catch (error) {
      resetStatus.textContent = error.message || 'Reset request failed.';
    }
  });

  loadDepartments();
})();
