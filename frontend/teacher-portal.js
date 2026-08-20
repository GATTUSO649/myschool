const teacherPortalState = { assignments: [], students: [] };
function teacherText(value) { return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
async function loadTeacherDashboard() {
  if (!checkAuth()) return;
  const user = getStudentInfo() || {};
  if (!['lecturer', 'teacher'].includes(String(user.role || '').toLowerCase())) { window.location.replace('dashboard.html'); return; }
  const response = await fetchWithAuth('/academics/teacher/dashboard');
  const data = await response.json();
  if (!response.ok) return showAlert(data.message || 'Could not load teacher dashboard', 'error');
  teacherPortalState.assignments = data.assignments || [];
  teacherPortalState.students = data.students || [];
  document.getElementById('teacherWelcome').textContent = `Welcome ${user.name || user.username || 'Teacher'}`;
  document.getElementById('teacherStaffNumber').textContent = user.staffNumber || user.username || 'Teacher';
  document.getElementById('teacherAssignments').textContent = teacherPortalState.assignments.map((item) => `${item.className} / ${item.subject}`).join(', ') || 'No assignments';
  document.getElementById('studentCount').textContent = teacherPortalState.students.length;
  document.getElementById('subjectCount').textContent = new Set(teacherPortalState.assignments.map((item) => item.subject)).size;
  document.getElementById('topStudent').textContent = data.topStudents?.[0]?.name || '-';
  document.getElementById('performanceChart').innerHTML = (data.performance || []).map((item) => `<div><div class="chart-bar" style="height:${Math.max(12, Number(item.average || 0) * 1.5)}px">${Number(item.average || 0).toFixed(1)}</div><small>${teacherText(item.subject)}</small></div>`).join('') || '<p>No marks recorded yet.</p>';
  document.getElementById('topStudentsBody').innerHTML = (data.topStudents || []).map((item) => `<tr><td>${teacherText(item.name)}</td><td>${teacherText(item.admissionNumber)}</td><td>${teacherText(item.className)}</td><td>${Number(item.average || 0).toFixed(1)}</td></tr>`).join('') || '<tr><td colspan="4">No performance records yet.</td></tr>';
  document.getElementById('notesClass').innerHTML = [...new Set(teacherPortalState.assignments.map((item) => item.className))].map((item) => `<option>${teacherText(item)}</option>`).join('');
  document.getElementById('attendanceList').innerHTML = teacherPortalState.students.map((student) => `<label class="attendance-item"><span>${teacherText(student.name)} (${teacherText(student.className)})</span><select data-student-id="${student.id}" data-class-name="${teacherText(student.className)}"><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select></label>`).join('') || '<p>No students in assigned classes.</p>';
}
async function saveStudentAttendance() { const date = document.getElementById('studentAttendanceDate').value; const entries = Array.from(document.querySelectorAll('[data-student-id]')).map((input) => ({ studentId: Number(input.dataset.studentId), className: input.dataset.className, status: input.value })); const response = await fetchWithAuth('/academics/teacher/student-attendance', { method: 'POST', body: JSON.stringify({ attendanceDate: date, entries }) }); const data = await response.json(); showAlert(data.message || 'Attendance saved', response.ok ? 'success' : 'error'); }
async function uploadNotes(event) { event.preventDefault(); const formData = new FormData(); formData.append('title', document.getElementById('notesTitle').value); formData.append('className', document.getElementById('notesClass').value); formData.append('subject', teacherPortalState.assignments[0]?.subject || ''); formData.append('file', document.getElementById('notesFile').files[0]); const response = await fetchWithAuth('/academics/docs', { method: 'POST', body: formData }); const data = await response.json(); showAlert(data.message || 'Notes uploaded', response.ok ? 'success' : 'error'); }
document.addEventListener('DOMContentLoaded', () => { document.getElementById('refreshTeacherDashboard').addEventListener('click', loadTeacherDashboard); document.getElementById('saveStudentAttendance').addEventListener('click', saveStudentAttendance); document.getElementById('lessonAttendanceForm').addEventListener('submit', async (event) => { event.preventDefault(); const response = await fetchWithAuth('/academics/teacher/lesson-attendance', { method: 'POST', body: JSON.stringify({ attendanceDate: lessonAttendanceDate.value, status: lessonAttendanceStatus.value, notes: lessonAttendanceNotes.value }) }); const data = await response.json(); showAlert(data.message || 'Attendance saved', response.ok ? 'success' : 'error'); }); document.getElementById('notesForm').addEventListener('submit', uploadNotes); loadTeacherDashboard(); });
