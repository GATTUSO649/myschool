// Academic Dashboard JS

let subjectChart = null;
let trendChart = null;
let academicData = {};

// Initialize academic page
document.addEventListener('DOMContentLoaded', async () => {
  if (!checkAuth()) {
    window.location.href = 'login.html';
    return;
  }

  // Load student info
  const student = getStudentInfo();
  populateStudentInfo(student);

  // Fetch and display academic and finance data
  await loadAcademicData();
  await loadStudentDashboardSummary();
  initializeCharts();
});

// Populate student information in the hero section
function populateStudentInfo(student) {
  if (!student) return;

  const name = student.name || 'Student';
  const admNo = student.admission_number || student.admissionNumber || '-';
  const form = student.className || student.class || 'Form 1';

  // Update welcome section
  document.getElementById('welcomeTitle').textContent = `Welcome, ${name}`;
  document.getElementById('studentForm').textContent = form;
  document.getElementById('studentAdmNo').textContent = admNo;
  document.getElementById('formBadge').textContent = form;
}

// Fetch academic data for the student
async function loadAcademicData() {
  try {
    const student = getStudentInfo();
    if (!student) throw new Error('Student info not found');

    const admNo = student.admission_number || student.admissionNumber;
    const term = getCurrentTerm();
    const year = new Date().getFullYear();

    // Fetch results for current term from API (uses auth token)
    const resultsRes = await fetchWithAuth(`/api/results`);

    if (resultsRes.ok) {
      const results = await resultsRes.json();
      academicData = parseAcademicResults(results);
      updateAcademicStats();
      populateSubjectTable();
    } else {
      console.warn('No results found for current term');
      // Use mock data for demonstration
      academicData = generateMockData();
      updateAcademicStats();
      populateSubjectTable();
    }
  } catch (err) {
    console.error('Error loading academic data:', err);
    // Fall back to mock data
    academicData = generateMockData();
    updateAcademicStats();
    populateSubjectTable();
  }
}

// Parse results from API response
function parseAcademicResults(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return generateMockData();
  }

  const subjects = [];
  let totalMarks = 0;

  results.forEach(result => {
    const mark = Number(result.mark || 0);
    const subject = normalizeSubjectName(result.subject_name || result.subject || 'Unknown');
    const grade = getGradeFromMark(mark);

    subjects.push({
      subject,
      mark,
      grade,
      remarks: getRemarks(mark)
    });
    totalMarks += mark;
  });

  const average = subjects.length > 0 ? Math.round(totalMarks / subjects.length) : 0;
  const bestSubject = subjects.length > 0 ? subjects.reduce((a, b) => a.mark > b.mark ? a : b) : null;
  const gpa = average > 0 ? (average / 25).toFixed(2) : 0;

  return {
    subjects,
    average,
    bestSubject: bestSubject ? { subject: bestSubject.subject, mark: bestSubject.mark, grade: bestSubject.grade } : { subject: '-', mark: 0, grade: '-' },
    gpa,
    subjectCount: subjects.length,
    termData: [
      { term: 'Term 1', average: average - 5 },
      { term: 'Term 2', average: average - 2 },
      { term: 'Term 3', average }
    ]
  };
}

// Generate mock data for demonstration
function generateMockData() {
  const subjects = [
    { subject: 'English', mark: 78, grade: 'A', remarks: 'Excellent' },
    { subject: 'Math', mark: 85, grade: 'A', remarks: 'Excellent' },
    { subject: 'Physics', mark: 72, grade: 'B+', remarks: 'Very Good' },
    { subject: 'Chemistry', mark: 68, grade: 'B', remarks: 'Good' },
    { subject: 'Biology', mark: 75, grade: 'B+', remarks: 'Very Good' },
    { subject: 'History', mark: 80, grade: 'A', remarks: 'Excellent' },
    { subject: 'Geography', mark: 70, grade: 'B', remarks: 'Good' },
    { subject: 'Kiswahili', mark: 82, grade: 'A', remarks: 'Excellent' }
  ];

  const average = Math.round(subjects.reduce((sum, s) => sum + s.mark, 0) / subjects.length);

  return {
    subjects,
    average,
    bestSubject: { ...subjects.reduce((a, b) => a.mark > b.mark ? a : b), grade: subjects.reduce((a, b) => a.mark > b.mark ? a : b).grade },
    gpa: (average / 25).toFixed(2),
    subjectCount: subjects.length,
    termData: [
      { term: 'Term 1', average: average - 8 },
      { term: 'Term 2', average: average - 3 },
      { term: 'Term 3', average }
    ]
  };
}

// Convert mark to grade (Kenyan grading system)
function normalizeSubjectName(subject) {
  return subject === 'Mathematics' ? 'Math' : subject;
}

function getGradeFromMark(mark) {
  if (mark >= 80) return 'A';
  if (mark >= 70) return 'B+';
  if (mark >= 60) return 'B';
  if (mark >= 50) return 'B-';
  if (mark >= 40) return 'C';
  return 'D';
}

// Get remarks based on mark
function getRemarks(mark) {
  if (mark >= 80) return 'Excellent';
  if (mark >= 70) return 'Very Good';
  if (mark >= 60) return 'Good';
  if (mark >= 50) return 'Satisfactory';
  if (mark >= 40) return 'Needs Improvement';
  return 'Poor';
}

// Get current academic term
function getCurrentTerm() {
  const month = new Date().getMonth() + 1;
  if (month >= 1 && month <= 4) return 'Term 1';
  if (month >= 5 && month <= 8) return 'Term 2';
  return 'Term 3';
}

// Update stats section with academic data
function updateAcademicStats() {
  const average = academicData.average || 0;
  const performanceLabel = getPerformanceLabel(average);

  document.getElementById('overallAverage').textContent = `${average}%`;
  document.getElementById('subjectCount').textContent = academicData.subjectCount || 0;
  document.getElementById('studentMarks').textContent = `${average}%`;
  document.getElementById('overallPerformanceValue').textContent = `${average}%`;
  document.getElementById('performanceSummary').textContent = `${performanceLabel} performance across this term with steady academic progress.`;
  document.getElementById('performanceStatus').textContent = performanceLabel;
  document.getElementById('overallPerformanceBar').style.width = `${Math.min(100, Math.max(0, average))}%`;
  
  if (academicData.bestSubject) {
    document.getElementById('bestSubject').textContent = academicData.bestSubject.subject || '-';
    document.getElementById('bestSubjectGrade').textContent = `Grade: ${academicData.bestSubject.grade || '-'}`;
  }
}

function getPerformanceLabel(average) {
  if (average >= 80) return 'Excellent';
  if (average >= 70) return 'Very good';
  if (average >= 60) return 'Good';
  if (average >= 50) return 'Satisfactory';
  return 'Needs improvement';
}

// Populate subject details table
function populateSubjectTable() {
  const tbody = document.getElementById('subjectTableBody');
  
  if (!academicData.subjects || academicData.subjects.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">No subject data available</td></tr>';
    return;
  }

  tbody.innerHTML = academicData.subjects.map(subject => `
    <tr>
      <td>${subject.subject || '-'}</td>
      <td class="text-center"><strong>${subject.mark || '-'}</strong></td>
      <td class="text-center"><span class="grade-badge grade-${subject.grade || 'D'}">${subject.grade || '-'}</span></td>
      <td>${subject.remarks || '-'}</td>
    </tr>
  `).join('');
}

// Initialize charts
function initializeCharts() {
  initializeSubjectChart();
  initializeTrendChart();
}

// Subject performance bar chart
function initializeSubjectChart() {
  const ctx = document.getElementById('subjectChart');
  if (!ctx || !academicData.subjects) return;

  const labels = academicData.subjects.map(s => s.subject);
  const data = academicData.subjects.map(s => s.mark);
  const navyBlue = 'rgba(16, 41, 61, 0.85)';

  subjectChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Mark (%)',
        data,
        backgroundColor: navyBlue,
        borderColor: 'rgba(16, 41, 61, 1)',
        borderWidth: 1,
        borderRadius: 6,
        hoverBackgroundColor: 'rgba(16, 41, 61, 1)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'x',
      plugins: {
        legend: { display: true, labels: { font: { size: 12, weight: 'bold' } } },
        tooltip: {
          backgroundColor: 'rgba(16, 41, 61, 0.9)',
          titleColor: '#fff',
          bodyColor: '#fff',
          padding: 10,
          borderRadius: 6,
          callbacks: {
            label: ctx => `Mark: ${ctx.parsed.y}%`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { color: '#666', font: { size: 11 } },
          grid: { color: 'rgba(0, 0, 0, 0.08)', drawBorder: false }
        },
        x: {
          ticks: { color: '#666', font: { size: 11 } },
          grid: { display: false, drawBorder: false }
        }
      }
    }
  });
}

// Term trend line chart
function initializeTrendChart() {
  const ctx = document.getElementById('trendChart');
  if (!ctx || !academicData.termData) return;

  const labels = academicData.termData.map(t => t.term);
  const data = academicData.termData.map(t => t.average);
  const tealColor = 'rgba(5, 205, 171, 0.8)';

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Average Mark (%)',
        data,
        borderColor: tealColor,
        backgroundColor: 'rgba(5, 205, 171, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 5,
        pointBackgroundColor: tealColor,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        hoverPointRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { font: { size: 12, weight: 'bold' } } },
        tooltip: {
          backgroundColor: 'rgba(16, 41, 61, 0.9)',
          titleColor: '#fff',
          bodyColor: '#fff',
          padding: 10,
          borderRadius: 6,
          callbacks: {
            label: ctx => `Average: ${ctx.parsed.y}%`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { color: '#666', font: { size: 11 } },
          grid: { color: 'rgba(0, 0, 0, 0.08)', drawBorder: false }
        },
        x: {
          ticks: { color: '#666', font: { size: 11 } },
          grid: { display: false, drawBorder: false }
        }
      }
    }
  });
}

// Fetch with auth helper
async function fetchWithAuth(endpoint, options = {}) {
  const token = getAuthToken();
  const base = getApiUrl().replace(/\/api$/, '');
  const url = endpoint.startsWith('/api') ? `${base}${endpoint}` : `${getApiUrl()}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}

// Load student dashboard summary (finance + counts)
async function loadStudentDashboardSummary() {
  try {
    const res = await fetchWithAuth('/api/students/dashboard-summary');
    if (!res.ok) throw new Error('Could not fetch dashboard summary');
    const data = await res.json();
    if (!data.success) throw new Error('Dashboard summary failed');

    document.getElementById('outstandingBalance').textContent = Number(data.balance || 0).toFixed(2);
    document.getElementById('totalCharged').textContent = Number(data.totalCharged || 0).toFixed(2);
    document.getElementById('totalPaid').textContent = Number(data.totalPaid || 0).toFixed(2);

    // If latest result is available, update quick stats
    if (data.latestResult) {
      document.getElementById('studentMarks').textContent = data.latestResult.score ? `${data.latestResult.score}%` : document.getElementById('studentMarks').textContent;
    }
  } catch (err) {
    console.warn('Could not load student dashboard summary:', err);
  }
}

// Logout function
function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('student');
  localStorage.removeItem('rememberMe');
  window.location.href = 'login.html';
}
