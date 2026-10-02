(() => {
  if (!checkAuth()) return;
  const select = document.getElementById('departmentSelect');
  const form = document.getElementById('departmentRoleForm');
  const status = document.getElementById('roleStatus');
  const result = document.getElementById('accountResult');
  const button = document.getElementById('createRoleButton');
  const escapeValue = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));

  async function loadDepartments() {
    try {
      const response = await fetchWithAuth('/auth/departments');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load departments');
      select.innerHTML = '<option value="">Select department</option>' + (data.departments || []).map((department) => `<option value="${department.id}">${escapeValue(department.name)} (${escapeValue(department.code)})</option>`).join('');
    } catch (error) {
      select.innerHTML = '<option value="">Departments unavailable</option>';
      status.textContent = error.message || 'Unable to load departments.';
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    button.disabled = true;
    status.textContent = 'Assigning department role...';
    result.classList.remove('visible');
    try {
      const response = await fetchWithAuth('/admin/departments/accounts', { method: 'POST', body: values });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to assign department role');
      const account = data.account;
      result.innerHTML = `<strong>Department account created.</strong><br>Name: ${escapeValue(account.name)}<br>Department: ${escapeValue(account.departmentName)}<br>Username: ${escapeValue(account.username)}<br>Initial password: staff number, then change it after first login.`;
      result.classList.add('visible');
      status.textContent = 'Role assigned successfully.';
      form.reset();
    } catch (error) {
      status.textContent = error.message || 'Unable to assign department role.';
    } finally {
      button.disabled = false;
    }
  });

  const user = JSON.parse(sessionStorage.getItem('adminUser') || 'null') || getStudentInfo() || {};
  document.getElementById('adminNamePill').textContent = user.name || 'Administrator';
  document.querySelectorAll('[data-admin-logout]').forEach((element) => element.addEventListener('click', (event) => { event.preventDefault(); logout(); }));
  loadDepartments();
})();
