const teacherPortalState = { assignments: [], students: [], selected: null };

function teacherEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function teacherUser() { return getStudentInfo() || {}; }
function teacherSet(id, value) { const element = document.getElementById(id); if (element) element.textContent = value; }
function gradeForMark(mark) { const score = Number(mark); if (!Number.isFinite(score)) return '-'; if (score >= 80) return 'A'; if (score >= 70) return 'A-'; if (score >= 60) return 'B'; if (score >= 50) return 'C'; if (score >= 40) return 'D'; if (score >= 30) return 'E'; return 'F'; }
function selectedOptions() { return { term: document.getElementById('teacherTermSelect').value, academicYear: document.getElementById('teacherYearInput').value, examType: document.getElementById('teacherExamInput').value.trim() || 'End Term' }; }

function getExistingSavedSheets() {
  try {
    const sheets = JSON.parse(localStorage.getItem('academicsSavedSheets') || '[]');
    return Array.isArray(sheets) ? sheets : [];
  } catch (error) {
    return [];
  }
}

function renderExistingSavedSheets() {
  const list = document.getElementById('savedSheetList');
  if (!list) return;
  const assignedClasses = new Set(teacherPortalState.assignments.map((assignment) => String(assignment.className).toLowerCase()));
  const sheets = getExistingSavedSheets().filter((sheet) => assignedClasses.has(String(sheet.className || '').toLowerCase()));
  teacherSet('savedSheetCount', `${sheets.length} sheet${sheets.length === 1 ? '' : 's'}`);
  if (!sheets.length) {
    list.innerHTML = '<div class="teacher-empty">No saved sheets match your assigned classes.</div>';
    return;
  }
  list.innerHTML = sheets.slice(0, 20).map((sheet) => `<div class="saved-sheet-row"><div><strong>${teacherEscape(sheet.title)}</strong><small>${teacherEscape(sheet.className)} · Stream ${teacherEscape(sheet.stream)} · ${teacherEscape(sheet.term)} · ${teacherEscape(sheet.year)}</small></div><button type="button" class="teacher-button secondary" data-open-saved-sheet="${teacherEscape(sheet.id)}">Open</button></div>`).join('');
  list.querySelectorAll('[data-open-saved-sheet]').forEach((button) => button.addEventListener('click', () => openExistingSavedSheet(button.dataset.openSavedSheet)));
}

async function openExistingSavedSheet(id) {
  const sheet = getExistingSavedSheets().find((item) => String(item.id) === String(id));
  if (!sheet) return showAlert('Saved sheet could not be found.', 'error');
  const assignmentIndex = teacherPortalState.assignments.findIndex((assignment) => String(assignment.className).toLowerCase() === String(sheet.className || '').toLowerCase());
  if (assignmentIndex < 0) return showAlert('This saved sheet is outside your assigned classes.', 'error');
  document.getElementById('teacherTermSelect').value = sheet.term || 'Term 1';
  document.getElementById('teacherYearInput').value = sheet.year || new Date().getFullYear();
  teacherPortalState.selected = assignmentIndex;
  renderAssignments();
  await loadAssignedStudents();
  showAlert(`Opened saved sheet: ${sheet.title}`, 'success');
}

function renderAssignments() {
  const container = document.getElementById('assignmentList');
  if (!teacherPortalState.assignments.length) { container.innerHTML = '<div class="teacher-empty">No active teaching assignments were found. Contact an administrator.</div>'; return; }
  container.innerHTML = teacherPortalState.assignments.map((assignment, index) => `<button type="button" class="assignment-card${teacherPortalState.selected === index ? ' is-active' : ''}" data-assignment-index="${index}"><strong>${teacherEscape(assignment.subject)}</strong><span>${teacherEscape(assignment.className)} · Academic year ${teacherEscape(assignment.academicYear || selectedOptions().academicYear)}</span></button>`).join('');
  container.querySelectorAll('[data-assignment-index]').forEach((button) => button.addEventListener('click', () => selectAssignment(Number(button.dataset.assignmentIndex))));
}

function renderGradebook() {
  const body = document.getElementById('gradebookBody');
  const assignment = teacherPortalState.assignments[teacherPortalState.selected];
  if (!assignment) { body.innerHTML = '<tr><td class="teacher-empty" colspan="5">Choose an assignment to begin.</td></tr>'; return; }
  if (!teacherPortalState.students.length) { body.innerHTML = '<tr><td class="teacher-empty" colspan="5">No active students are in this assigned class.</td></tr>'; return; }
  body.innerHTML = teacherPortalState.students.map((student) => { const existing = student.results?.[assignment.subject]?.score; const mark = Number.isFinite(Number(existing)) ? existing : ''; return `<tr><td>${teacherEscape(student.admissionNumber)}</td><td>${teacherEscape(student.name)}</td><td>${teacherEscape(student.stream || '-')}</td><td><input class="grade-input" type="number" min="0" max="100" step="1" value="${teacherEscape(mark)}" data-student-id="${student.id}" placeholder="0-100"></td><td class="grade-value">${gradeForMark(mark)}</td></tr>`; }).join('');
  body.querySelectorAll('.grade-input').forEach((input) => input.addEventListener('input', () => { const mark = Number(input.value); input.classList.toggle('invalid', input.value !== '' && (!Number.isFinite(mark) || mark < 0 || mark > 100)); input.closest('tr').querySelector('.grade-value').textContent = gradeForMark(input.value); }));
}

function renderAttendance() {
  const list = document.getElementById('attendanceList');
  list.innerHTML = teacherPortalState.students.length ? teacherPortalState.students.map((student) => `<label class="attendance-row"><span>${teacherEscape(student.name)}<br><small>${teacherEscape(student.admissionNumber)} · ${teacherEscape(student.stream || 'No stream')}</small></span><select data-student-id="${student.id}" data-class-name="${teacherEscape(student.className)}"><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select></label>`).join('') : '<div class="teacher-empty">No students loaded.</div>';
}

async function loadAssignedStudents() {
  const assignment = teacherPortalState.assignments[teacherPortalState.selected];
  if (!assignment) return;
  const options = selectedOptions();
  const query = new URLSearchParams({ className: assignment.className, subject: assignment.subject, academicYear: options.academicYear, term: options.term, examType: options.examType });
  teacherSet('teacherSyncStatus', 'Loading assigned class...');
  const response = await fetchWithAuth(`/academics/entry/students?${query}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Could not load assigned students');
  teacherPortalState.students = data.students || [];
  document.getElementById('teacherClassSelect').innerHTML = `<option value="${teacherEscape(assignment.className)}">${teacherEscape(assignment.className)}</option>`;
  document.getElementById('teacherClassSelect').disabled = false;
  document.getElementById('saveMarksButton').disabled = false;
  document.getElementById('saveAttendanceButton').disabled = false;
  document.getElementById('uploadNotesButton').disabled = false;
  teacherSet('studentCount', teacherPortalState.students.length);
  teacherSet('gradebookScope', `${assignment.subject} · ${assignment.className}`);
  teacherSet('gradebookTitle', `${assignment.subject} gradebook`);
  teacherSet('gradebookDescription', `Only ${assignment.subject} marks for ${assignment.className} can be saved here.`);
  renderGradebook(); renderAttendance(); teacherSet('teacherSyncStatus', 'Assignment loaded');
}

async function selectAssignment(index) { teacherPortalState.selected = index; renderAssignments(); try { await loadAssignedStudents(); } catch (error) { teacherSet('teacherSyncStatus', error.message); showAlert(error.message, 'error'); } }

async function loadTeacherWorkspace() {
  if (!checkAuth()) return;
  const user = teacherUser();
  if (!['teacher', 'lecturer'].includes(String(user.role || '').toLowerCase())) return;
  teacherSet('teacherName', user.name || user.username || 'Teacher'); teacherSet('teacherWelcome', (user.name || user.username || 'Teacher').split(' ')[0]); teacherSet('teacherStaffNumber', user.staffNumber || user.staff_number || 'Teaching staff');
  const year = document.getElementById('teacherYearInput').value;
  const response = await fetchWithAuth(`/academics/teacher/dashboard?academicYear=${encodeURIComponent(year)}`);
  const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Could not load teacher workspace');
  teacherPortalState.assignments = data.assignments || [];
  teacherSet('assignedClassCount', new Set(teacherPortalState.assignments.map((item) => item.className)).size); teacherSet('assignedSubjectCount', new Set(teacherPortalState.assignments.map((item) => item.subject)).size);
  renderAssignments(); renderExistingSavedSheets(); if (teacherPortalState.assignments.length) await selectAssignment(0);
}

async function saveMarks() {
  const assignment = teacherPortalState.assignments[teacherPortalState.selected]; if (!assignment) return showAlert('Select an assigned class first.', 'error');
  const entries = [...document.querySelectorAll('.grade-input')].filter((input) => input.value !== '').map((input) => ({ student_id: Number(input.dataset.studentId), score: Number(input.value) }));
  if (!entries.length || entries.some((entry) => !Number.isFinite(entry.score) || entry.score < 0 || entry.score > 100)) return showAlert('Enter marks from 0 to 100 before saving.', 'error');
  const options = selectedOptions(); const response = await fetchWithAuth('/academics/entry/results', { method:'POST', body:JSON.stringify({ ...options, className:assignment.className, subject:assignment.subject, entries }) }); const data = await response.json();
  if (!response.ok) return showAlert(data.message || 'Could not save marks.', 'error'); showAlert(`Saved ${data.saved?.length || entries.length} ${assignment.subject} marks.`, 'success'); await loadAssignedStudents();
}

async function saveAttendance() {
  const date = document.getElementById('attendanceDate').value; const entries = [...document.querySelectorAll('.attendance-row select')].map((select) => ({ studentId:Number(select.dataset.studentId), className:select.dataset.className, status:select.value }));
  if (!date || !entries.length) return showAlert('Choose a date and assigned class first.', 'error'); const response = await fetchWithAuth('/academics/teacher/student-attendance', { method:'POST', body:JSON.stringify({ attendanceDate:date, entries }) }); const data = await response.json(); showAlert(data.message || 'Attendance saved.', response.ok ? 'success' : 'error');
}

async function saveLesson(event) { event.preventDefault(); const response = await fetchWithAuth('/academics/teacher/lesson-attendance', { method:'POST', body:JSON.stringify({ attendanceDate:lessonDate.value, status:lessonStatus.value, notes:lessonNotes.value }) }); const data = await response.json(); showAlert(data.message || 'Lesson log saved.', response.ok ? 'success' : 'error'); }

async function uploadNotes(event) { event.preventDefault(); const assignment = teacherPortalState.assignments[teacherPortalState.selected]; const formData = new FormData(); formData.append('title', notesTitle.value); formData.append('className', assignment.className); formData.append('subject', assignment.subject); formData.append('academicYear', selectedOptions().academicYear); formData.append('file', notesFile.files[0]); const response = await fetchWithAuth('/academics/docs', { method:'POST', body:formData }); const data = await response.json(); showAlert(data.message || 'Learning material uploaded.', response.ok ? 'success' : 'error'); if (response.ok) event.target.reset(); }

document.addEventListener('DOMContentLoaded', () => { document.getElementById('refreshTeacherDashboard').addEventListener('click', () => loadTeacherWorkspace().catch((error) => showAlert(error.message, 'error'))); document.getElementById('saveMarksButton').addEventListener('click', () => saveMarks().catch((error) => showAlert(error.message, 'error'))); document.getElementById('clearMarksButton').addEventListener('click', () => document.querySelectorAll('.grade-input').forEach((input) => { input.value = ''; input.closest('tr').querySelector('.grade-value').textContent = '-'; })); document.getElementById('saveAttendanceButton').addEventListener('click', () => saveAttendance().catch((error) => showAlert(error.message, 'error'))); document.getElementById('lessonForm').addEventListener('submit', saveLesson); document.getElementById('notesForm').addEventListener('submit', uploadNotes); document.getElementById('teacherTermSelect').addEventListener('change', () => loadAssignedStudents().catch((error) => showAlert(error.message, 'error'))); loadTeacherWorkspace().catch((error) => { teacherSet('teacherSyncStatus', 'Could not load workspace'); showAlert(error.message, 'error'); }); });
