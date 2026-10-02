(() => {
  if (!checkAuth()) return;

  const escapeValue = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
  const setText = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
  const emptyRows = (id, columns, message) => { const element = document.getElementById(id); if (element) element.innerHTML = `<tr><td colspan="${columns}" class="portal-empty">${escapeValue(message)}</td></tr>`; };
  const params = new URLSearchParams(window.location.search);
  const departmentId = Number(params.get('id'));

  function renderPortal(data) {
    const department = data.department || {};
    setText('departmentName', department.name || 'Department portal');
    setText('departmentCode', department.code || '');
    setText('departmentDescription', department.description || 'Department profile and academic operations');
    setText('portalEyebrow', data.isHod ? 'Head of department workspace' : 'Department workspace');
    setText('teacherCount', (data.teachers || []).length);
    setText('subjectCount', (data.subjects || []).length);
    setText('classCount', (data.classes || []).length);
    setText('studentCount', (data.students || []).length);
    setText('portalStatus', data.isHod ? 'HOD access confirmed' : 'Department assignment confirmed');

    setText('profileBody', '');
    document.getElementById('profileBody').innerHTML = `<p><strong>Head of department:</strong> ${escapeValue(department.hodName || 'Not assigned')}</p><p><strong>Access:</strong> ${data.isHod ? 'HOD management and monitoring' : 'Assigned department workspace'}</p><p><strong>Active:</strong> ${department.active ? 'Yes' : 'No'}</p>`;
    const teacherRows = document.getElementById('teacherRows');
    const teachers = data.teachers || [];
    teacherRows.innerHTML = teachers.length ? teachers.map((teacher) => `<tr><td>${escapeValue(teacher.name)}</td><td>${escapeValue(teacher.staffNumber || 'Not assigned')}</td><td>${escapeValue(teacher.email || 'No email')}</td></tr>`).join('') : `<tr><td colspan="3" class="portal-empty">No teachers are assigned yet.</td></tr>`;
    const subjectRows = document.getElementById('subjectRows');
    const subjects = data.subjects || [];
    subjectRows.innerHTML = subjects.length ? subjects.map((subject) => `<tr><td>${escapeValue(subject.name)}</td><td>${escapeValue(subject.code)}</td><td>${subject.active ? 'Active' : 'Inactive'}</td></tr>`).join('') : `<tr><td colspan="3" class="portal-empty">No department subjects are configured.</td></tr>`;
    const classRows = document.getElementById('classRows');
    const classes = data.classes || [];
    classRows.innerHTML = classes.length ? classes.map((item) => `<tr><td>${escapeValue(item.className)}</td><td>${Number(item.studentCount || 0)}</td></tr>`).join('') : `<tr><td colspan="2" class="portal-empty">No assigned classes are available.</td></tr>`;
    const studentRows = document.getElementById('studentRows');
    const students = data.students || [];
    studentRows.innerHTML = students.length ? students.map((student) => `<tr><td>${escapeValue(student.name)}</td><td>${escapeValue(student.admissionNumber)}</td><td>${escapeValue(student.className)}</td><td>${escapeValue(student.stream || 'Unassigned')}</td></tr>`).join('') : `<tr><td colspan="4" class="portal-empty">No students are in department-assigned classes.</td></tr>`;
    const resultRows = document.getElementById('resultRows');
    const performance = data.performance || [];
    resultRows.innerHTML = performance.length ? performance.map((item) => `<tr><td>${escapeValue(item.subject)}</td><td>${Number(item.resultCount || 0)}</td><td>${Number(item.average || 0).toFixed(1)}%</td></tr>`).join('') : `<tr><td colspan="3" class="portal-empty">No results are recorded for department subjects.</td></tr>`;
    const performanceBody = document.getElementById('performanceBody');
    performanceBody.innerHTML = performance.length ? performance.map((item) => { const average = Math.max(0, Math.min(100, Number(item.average || 0))); return `<div class="performance-row"><span>${escapeValue(item.subject)}</span><div class="performance-track"><span style="width:${average}%"></span></div><strong>${average.toFixed(1)}%</strong></div>`; }).join('') : '<div class="portal-empty">No performance data is available yet.</div>';
    const activity = data.activity || [];
    document.getElementById('activityList').innerHTML = activity.length ? activity.map((item) => `<div class="activity-item"><strong>${escapeValue(item.action)}</strong><span>${escapeValue(item.details || 'Recorded department activity')}</span><small>${escapeValue(item.userName || 'System')} · ${escapeValue(item.createdAt || '')}</small></div>`).join('') : '<div class="portal-empty">No recent department activity is available.</div>';
  }

  async function load() {
    if (!departmentId) {
      setText('portalStatus', 'Open a department portal from the department list.');
      return;
    }
    try {
      const response = await fetchWithAuth(`/departments/${departmentId}/portal`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load department portal');
      renderPortal(data);
    } catch (error) {
      setText('portalStatus', error.message || 'Unable to load department portal.');
      document.querySelectorAll('tbody').forEach((body) => { body.innerHTML = `<tr><td colspan="4" class="portal-error">${escapeValue(error.message || 'Unable to load data.')}</td></tr>`; });
    }
  }

  const user = getStudentInfo() || JSON.parse(sessionStorage.getItem('adminUser') || 'null') || {};
  setText('portalUser', user.name || user.username || 'Administrator');
  document.querySelectorAll('[data-admin-logout]').forEach((element) => element.addEventListener('click', (event) => { event.preventDefault(); logout(); }));
  load();
})();
