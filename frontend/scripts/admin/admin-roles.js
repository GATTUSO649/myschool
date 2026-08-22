function escapeRoleText(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function getSelectedTeacherSubjects() {
  const checkboxes = document.querySelectorAll('input[name="teacherSubject"]');
  return Array.from(checkboxes).filter((input) => input.checked).map((input) => input.value.trim()).filter(Boolean);
}

async function loadTeachers() {
  const body = document.getElementById('teachersBody');
  try {
    const response = await fetchWithAuth('/admin/roles/teachers');
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load teachers');
    body.innerHTML = data.teachers.map((teacher) => {
      const subjects = [...new Set((teacher.assignments || []).map((item) => item.subject).filter(Boolean))];
      const classes = [...new Set((teacher.assignments || []).map((item) => item.className).filter(Boolean))];
      return `
        <tr><td>${escapeRoleText(teacher.name)}</td><td><strong>${escapeRoleText(teacher.staffNumber || teacher.username)}</strong></td><td>${escapeRoleText(subjects.join(', ') || teacher.subject || '')}</td><td>${escapeRoleText(classes.join(', '))}</td><td>${teacher.active ? 'Active' : 'Inactive'}</td></tr>
      `;
    }).join('') || '<tr><td colspan="5">No teacher accounts yet.</td></tr>';
  } catch (error) {
    body.innerHTML = `<tr><td colspan="5">${escapeRoleText(error.message)}</td></tr>`;
  }
}

function setFieldError(id, message) {
  const element = document.getElementById(id);
  if (element) element.textContent = message || '';
}

function validateTeacherForm(form) {
  const name = document.getElementById('teacherName').value.trim();
  const email = document.getElementById('teacherEmail').value.trim();
  const subjects = getSelectedTeacherSubjects();
  const academicYear = document.getElementById('teacherYear').value;
  const classes = Array.from(form.querySelectorAll('input[name="class"]:checked')).map((input) => input.value);
  let valid = true;

  setFieldError('teacherNameError', '');
  setFieldError('teacherEmailError', '');
  setFieldError('teacherSubjectError', '');
  setFieldError('teacherYearError', '');
  setFieldError('teacherClassesError', '');
  if (!name) { setFieldError('teacherNameError', 'Enter the teacher name.'); valid = false; }
  if (!email || !isValidEmail(email)) { setFieldError('teacherEmailError', 'Enter a valid email address.'); valid = false; }
  if (!subjects.length) { setFieldError('teacherSubjectError', 'Please select at least one subject.'); valid = false; }
  if (!academicYear) { setFieldError('teacherYearError', 'Please select an academic year.'); valid = false; }
  if (!classes.length) { setFieldError('teacherClassesError', 'Please select at least one form.'); valid = false; }
  return valid;
}

function populateAcademicYears() {
  const select = document.getElementById('teacherYear');
  const currentYear = new Date().getFullYear();
  for (let year = currentYear; year <= currentYear + 4; year += 1) {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    select.appendChild(option);
  }
  select.value = String(currentYear);
}

document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  const form = document.getElementById('teacherForm');
  const status = document.getElementById('teacherStatus');
  const button = document.getElementById('createTeacherButton');
  const teacherName = document.getElementById('teacherName');
  const teacherEmail = document.getElementById('teacherEmail');
  const teacherYear = document.getElementById('teacherYear');
  const teacherCreated = document.getElementById('teacherCreated');
  populateAcademicYears();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateTeacherForm(form)) return;
    const classes = Array.from(form.querySelectorAll('input[name="class"]:checked')).map((input) => input.value);
    const subjects = getSelectedTeacherSubjects();
    button.disabled = true;
    button.textContent = 'Creating...';
    status.textContent = '';
    status.className = 'status-message';
    try {
      const response = await fetchWithAuth('/admin/roles/teachers', {
        method: 'POST',
        body: JSON.stringify({ name: teacherName.value.trim(), email: teacherEmail.value.trim(), subject: subjects[0], subjects, academicYear: teacherYear.value, classes })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to create teacher account.');
      teacherCreated.innerHTML = `<strong>Teacher account created successfully.</strong><br>Teacher: ${escapeRoleText(data.teacher.name)}<br>Subjects: ${escapeRoleText((data.teacher.subjects || [data.teacher.subject]).join(', '))}<br>Assigned forms: ${escapeRoleText(data.teacher.classes.join(', '))}<br>Staff number: ${escapeRoleText(data.teacher.staffNumber)}`;
      teacherCreated.classList.add('is-visible');
      form.reset();
      teacherYear.value = String(new Date().getFullYear());
      status.textContent = 'Account created successfully.';
      status.classList.add('success');
      await loadTeachers();
    } catch (error) {
      status.textContent = error.message || 'Unable to create teacher account. Please check the information and try again.';
      status.classList.add('error');
    } finally {
      button.disabled = false;
      button.textContent = 'Create Staff Account';
    }
  });
  document.getElementById('refreshTeachers').addEventListener('click', loadTeachers);
  loadTeachers();
});
