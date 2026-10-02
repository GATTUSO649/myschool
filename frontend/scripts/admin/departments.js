(() => {
  if (!checkAuth()) return;

  const status = document.getElementById('departmentStatus');
  const listStatus = document.getElementById('departmentListStatus');
  const subjectStatus = document.getElementById('subjectListStatus');
  const departmentRows = document.getElementById('departmentRows');
  const subjectRows = document.getElementById('subjectRows');
  const escapeValue = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));

  async function loadDepartments() {
    listStatus.textContent = 'Loading departments...';
    try {
      const response = await fetchWithAuth('/admin/departments');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load departments');
      const departments = data.departments || [];
      listStatus.textContent = departments.length ? '' : 'No departments have been created yet.';
      departmentRows.innerHTML = departments.map((department) => `
        <tr><td><strong>${escapeValue(department.name)}</strong><br><small>${escapeValue(department.description || 'No description')}</small></td>
        <td>${escapeValue(department.code)}</td><td>${escapeValue(department.hodName || 'Unassigned')}</td>
        <td>${Number(department.staffCount || 0)}</td><td>${Number(department.subjectCount || 0)}</td>
        <td><div class="department-actions"><a href="department-portal.html?id=${encodeURIComponent(department.id)}">Open portal</a><button type="button" data-hod-id="${department.id}">Assign HOD</button></div></td></tr>
      `).join('');
      departmentRows.querySelectorAll('[data-hod-id]').forEach((button) => button.addEventListener('click', () => assignHod(button.dataset.hodId)));
    } catch (error) {
      listStatus.textContent = error.message || 'Unable to load departments.';
      departmentRows.innerHTML = '';
    }
  }

  async function loadSubjects() {
    subjectStatus.textContent = 'Loading subjects...';
    try {
      const response = await fetchWithAuth('/admin/subjects');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load subjects');
      const subjects = data.subjects || [];
      subjectStatus.textContent = subjects.length ? '' : 'No department subjects have been created yet.';
      subjectRows.innerHTML = subjects.map((subject) => `<tr><td>${escapeValue(subject.name)}</td><td>${escapeValue(subject.code)}</td><td>${escapeValue(subject.departmentName)}</td><td>${subject.active ? 'Active' : 'Inactive'}</td></tr>`).join('');
    } catch (error) {
      subjectStatus.textContent = error.message || 'Unable to load subjects.';
      subjectRows.innerHTML = '';
    }
  }

  async function assignHod(departmentId) {
    const staffId = window.prompt('Enter the active teacher staff record ID to assign as HOD:');
    if (!staffId || !/^\d+$/.test(staffId)) return;
    try {
      const response = await fetchWithAuth(`/admin/departments/${departmentId}/hod`, { method: 'POST', body: { staffId: Number(staffId) } });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to assign HOD');
      listStatus.textContent = data.message;
      await loadDepartments();
    } catch (error) {
      listStatus.textContent = error.message || 'Unable to assign HOD.';
    }
  }

  document.getElementById('departmentForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    status.textContent = 'Creating department...';
    try {
      const response = await fetchWithAuth('/admin/departments', { method: 'POST', body: Object.fromEntries(form.entries()) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to create department');
      status.textContent = 'Department created successfully.';
      event.currentTarget.reset();
      await loadDepartments();
    } catch (error) {
      status.textContent = error.message || 'Unable to create department.';
    } finally {
      submit.disabled = false;
    }
  });

  const student = getStudentInfo() || {};
  const name = document.getElementById('adminNamePill');
  if (name) name.textContent = student.name || 'Administrator';
  document.querySelectorAll('[data-admin-logout]').forEach((element) => element.addEventListener('click', (event) => { event.preventDefault(); logout(); }));
  loadDepartments();
  loadSubjects();
})();
