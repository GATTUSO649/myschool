function escapeRoleText(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

async function loadTeachers() {
  const body = document.getElementById('teachersBody');
  try {
    const response = await fetchWithAuth('/admin/roles/teachers');
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load teachers');
    body.innerHTML = data.teachers.map((teacher) => `
      <tr><td>${escapeRoleText(teacher.name)}</td><td><strong>${escapeRoleText(teacher.staffNumber || teacher.username)}</strong></td><td>${escapeRoleText(teacher.assignments?.[0]?.subject || '')}</td><td>${escapeRoleText((teacher.assignments || []).map((item) => item.className).join(', '))}</td><td>${teacher.active ? 'Active' : 'Inactive'}</td></tr>
    `).join('') || '<tr><td colspan="5">No teacher accounts yet.</td></tr>';
  } catch (error) {
    body.innerHTML = `<tr><td colspan="5">${escapeRoleText(error.message)}</td></tr>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  const form = document.getElementById('teacherForm');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const classes = Array.from(form.querySelectorAll('input[name="class"]:checked')).map((input) => input.value);
    const response = await fetchWithAuth('/admin/roles/teachers', {
      method: 'POST',
      body: JSON.stringify({ name: teacherName.value, email: teacherEmail.value, subject: teacherSubject.value, academicYear: teacherYear.value, classes })
    });
    const data = await response.json();
    if (!response.ok) return showAlert(data.message || 'Could not create teacher', 'error');
    teacherCreated.textContent = `Created ${data.teacher.name}: username and password ${data.teacher.staffNumber}`;
    form.reset();
    teacherYear.value = new Date().getFullYear();
    await loadTeachers();
  });
  document.getElementById('refreshTeachers').addEventListener('click', loadTeachers);
  loadTeachers();
});
