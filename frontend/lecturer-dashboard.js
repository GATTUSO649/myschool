const lecturerState = {
  studentSubject: null,
  students: [],
  className: 'Form 1',
  stream: 'A',
  term: 'Term 1',
  academicYear: String(new Date().getFullYear()),
  examType: 'End Term'
};

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getStudentInfoSafe() {
  try {
    return getStudentInfo() || {};
  } catch (error) {
    return {};
  }
}

function buildLecturerTable(students = []) {
  const body = document.getElementById('lecturerStudentsBody');
  if (!body) return;
  if (!students.length) {
    body.innerHTML = '<tr><td colspan="5">No students found for this class and stream.</td></tr>';
    setText('lecturerStudentsCount', '0 students');
    return;
  }

  body.innerHTML = students.map((student) => {
    const existingMark = student.results?.[lecturerState.studentSubject]?.score;
    const markValue = Number.isFinite(Number(existingMark)) ? existingMark : '';
    return `
      <tr data-student-id="${student.id}">
        <td>${escapeHtml(student.admissionNumber || student.admission_number || '')}</td>
        <td>${escapeHtml(student.name || '')}</td>
        <td>${escapeHtml(student.className || student.class_name || '')}</td>
        <td>${escapeHtml(student.stream || '')}</td>
        <td><input type="number" class="lecturer-mark-input" min="0" max="100" step="1" placeholder="Enter mark" value="${escapeHtml(markValue)}" data-student-id="${student.id}" /></td>
      </tr>
    `;
  }).join('');
  setText('lecturerStudentsCount', `${students.length} students`);
}

function getSelectedLecturerOptions() {
  lecturerState.className = document.getElementById('lecturerClassSelect')?.value || lecturerState.className;
  lecturerState.stream = document.getElementById('lecturerStreamSelect')?.value || lecturerState.stream;
  lecturerState.term = document.getElementById('lecturerTermSelect')?.value || lecturerState.term;
  lecturerState.academicYear = document.getElementById('lecturerYearInput')?.value || lecturerState.academicYear;
  lecturerState.examType = document.getElementById('lecturerExamInput')?.value || lecturerState.examType;
  return { className: lecturerState.className, stream: lecturerState.stream, term: lecturerState.term, academicYear: lecturerState.academicYear, examType: lecturerState.examType };
}

async function loadLecturerStudents() {
  if (!checkAuth()) return;
  const user = getStudentInfoSafe();
  lecturerState.studentSubject = user.subject || user.subjects || null;
  if (!lecturerState.studentSubject) {
    showAlert('Lecturer subject not configured. Contact admin.', 'error');
    setText('lecturerSubjectBadge', 'Subject missing');
    setText('lecturerSubjectTitle', 'Subject');
    return;
  }

  setText('lecturerNamePill', user.name || user.username || 'Lecturer');
  setText('lecturerWelcomeTitle', `Hello ${user.name || user.username || 'Lecturer'}`);
  setText('lecturerSubjectBadge', lecturerState.studentSubject);
  setText('lecturerSubjectTitle', lecturerState.studentSubject);

  const opts = getSelectedLecturerOptions();
  const url = `/academics/entry/students?className=${encodeURIComponent(opts.className)}&stream=${encodeURIComponent(opts.stream)}&academicYear=${encodeURIComponent(opts.academicYear)}&term=${encodeURIComponent(opts.term)}&examType=${encodeURIComponent(opts.examType)}`;

  try {
    const response = await fetchWithAuth(url);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Could not load students');
    }
    lecturerState.students = data.students || [];
    buildLecturerTable(lecturerState.students);
  } catch (error) {
    console.error('Could not load lecturer students:', error);
    showAlert(error.message || 'Failed to load student list', 'error');
    buildLecturerTable([]);
  }
}

function readLecturerMarks() {
  return Array.from(document.querySelectorAll('.lecturer-mark-input')).map((input) => {
    const studentId = Number(input.dataset.studentId);
    const score = input.value.trim();
    if (!studentId || score === '') return null;
    const numberScore = Number(score);
    if (!Number.isFinite(numberScore)) return null;
    return { student_id: studentId, score: numberScore };
  }).filter(Boolean);
}

async function saveLecturerMarks() {
  const entries = readLecturerMarks();
  if (!entries.length) {
    showAlert('Enter at least one mark before saving.', 'error');
    return;
  }

  if (!lecturerState.studentSubject) {
    const user = getStudentInfoSafe();
    lecturerState.studentSubject = user.subject || user.subjects || null;
  }

  if (!lecturerState.studentSubject) {
    showAlert('Unable to determine lecturer subject. Check your account settings.', 'error');
    return;
  }

  const opts = getSelectedLecturerOptions();

  try {
    const response = await fetchWithAuth('/academics/entry/results', {
      method: 'POST',
      body: JSON.stringify({
        subject: lecturerState.studentSubject,
        entries,
        academicYear: opts.academicYear,
        term: opts.term,
        examType: opts.examType,
        className: opts.className
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Could not save marks');
    }
    showAlert(`Saved ${entries.length} marks for ${lecturerState.studentSubject}.`, 'success');
    await loadLecturerStudents();
  } catch (error) {
    console.error('Save lecturer marks failed:', error);
    showAlert(error.message || 'Could not save lecturer marks', 'error');
  }
}

async function initLecturerDashboard() {
  if (!checkAuth()) {
    window.location.href = 'login.html';
    return;
  }

  const user = getStudentInfoSafe();
  if (user.role !== 'lecturer') {
    if (user.role === 'admin' || user.role === 'rba') {
      window.location.href = 'admin-dashboard.html';
    } else {
      window.location.href = 'dashboard.html';
    }
    return;
  }

  document.getElementById('lecturerClassSelect')?.addEventListener('change', loadLecturerStudents);
  document.getElementById('lecturerStreamSelect')?.addEventListener('change', loadLecturerStudents);
  document.getElementById('lecturerTermSelect')?.addEventListener('change', loadLecturerStudents);
  document.getElementById('lecturerYearInput')?.addEventListener('change', loadLecturerStudents);
  document.getElementById('lecturerExamInput')?.addEventListener('change', loadLecturerStudents);
  document.getElementById('refreshStudentsButton')?.addEventListener('click', async () => {
    await loadLecturerStudents();
    showAlert('Student list refreshed', 'success');
  });
  document.getElementById('saveLecturerMarksButton')?.addEventListener('click', async (event) => {
    event.preventDefault();
    await saveLecturerMarks();
  });
  document.getElementById('previewTranscriptButton')?.addEventListener('click', (event) => {
    event.preventDefault();
    const firstStudent = lecturerState.students[0];
    if (firstStudent && (firstStudent.admissionNumber || firstStudent.admission_number)) {
      window.open(`student-transcript.html?adm=${encodeURIComponent(firstStudent.admissionNumber || firstStudent.admission_number)}`,'_blank');
    } else {
      showAlert('No student loaded to preview yet.', 'info');
    }
  });

  await loadLecturerStudents();
}

document.addEventListener('DOMContentLoaded', initLecturerDashboard);
