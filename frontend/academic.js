// Academic Dashboard JS

let subjectChart = null;
let trendChart = null;
let academicData = {};
let availableResultYears = [];

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value ?? '';
  }
}

function setBarWidth(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.style.width = `${Math.min(100, Math.max(0, value || 0))}%`;
  }
}

// Initialize academic page
document.addEventListener('DOMContentLoaded', async () => {
  if (!checkAuth()) {
    window.location.href = 'login.html';
    return;
  }

  // Load student info from the backend or fallback to local cache
  const serverStudent = await loadStudentProfile();
  const student = serverStudent || getStudentInfo();
  populateStudentInfo(student);
  initializeResultFilters();

  // Fetch and display academic and finance data
  await loadAcademicData();
  await loadStudentDashboardSummary();
  initializeCharts();
});

async function loadStudentProfile() {
  try {
    const response = await fetchWithAuth('/students/me');
    if (!response.ok) return null;
    const profile = await response.json();
    if (profile && profile.id) {
      localStorage.setItem('student', JSON.stringify(profile));
      return profile;
    }
  } catch (error) {
    console.warn('Could not refresh student profile:', error);
  }
  return null;
}

// Populate student information in the hero section
function populateStudentInfo(student) {
  if (!student) return;

  const name = student.name || 'Student';
  const admNo = student.admission_number || student.admissionNumber || '-';
  const form = student.className || student.class || 'Form 1';

  // Update welcome section
  setText('welcomeTitle', `Welcome, ${name}`);
  setText('studentForm', form);
  setText('studentAdmNo', admNo);
  setText('formBadge', form);
}

// Fetch academic data for the student
async function loadAcademicData() {
  try {
    const student = getStudentInfo();
    if (!student) throw new Error('Student info not found');

    const term = document.getElementById('resultsTermFilter')?.value || '';
    const year = document.getElementById('resultsYearFilter')?.value || '';
    const params = new URLSearchParams();
    if (term) params.set('term', term);
    if (year) params.set('academic_year', year);

    // Fetch results for current term from API (uses auth token)
    const resultsRes = await fetchWithAuth(`/api/results${params.toString() ? `?${params}` : ''}`);

    if (resultsRes.ok) {
      const results = await resultsRes.json();
      updateResultYearOptions(results);
      academicData = parseAcademicResults(results);
      updateAcademicStats();
      populateSubjectTable();
    } else {
      console.warn('No results found for current term');
      academicData = emptyAcademicData();
      updateAcademicStats();
      populateSubjectTable();
    }
  } catch (err) {
    console.error('Error loading academic data:', err);
    academicData = emptyAcademicData();
    updateAcademicStats();
    populateSubjectTable();
  }
}

// Parse results from API response
function parseAcademicResults(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return emptyAcademicData();
  }

  const subjects = [];
  let totalMarks = 0;

  results.forEach(result => {
    const mark = Number(result.score || result.mark || 0);
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

function emptyAcademicData() {
  return {
    subjects: [],
    average: 0,
    bestSubject: { subject: '-', mark: 0, grade: '-' },
    gpa: 0,
    subjectCount: 0,
    termData: [
      { term: 'Term 1', average: 0 },
      { term: 'Term 2', average: 0 },
      { term: 'Term 3', average: 0 }
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

  setText('overallAverage', `${average}%`);
  setText('subjectCount', academicData.subjectCount || 0);
  setText('studentMarks', `${average}%`);
  setText('overallPerformanceValue', `${average}%`);
  setText('performanceSummary', `${performanceLabel} performance across this term with steady academic progress.`);
  setText('performanceStatus', performanceLabel);
  setBarWidth('overallPerformanceBar', average);
  
  if (academicData.bestSubject) {
    setText('bestSubject', academicData.bestSubject.subject || '-');
    setText('bestSubjectGrade', `Grade: ${academicData.bestSubject.grade || '-'}`);
  }
}

function getPerformanceLabel(average) {
  if (average >= 80) return 'Excellent';
  if (average >= 70) return 'Very good';
  if (average >= 60) return 'Good';
  if (average >= 50) return 'Satisfactory';
  return 'Needs improvement';
}

// Retained for compatibility with older cached markup.
function populateSubjectTable() {
  const tbody = document.getElementById('subjectTableBody');

  if (!tbody) return;
  
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

function initializeResultFilters() {
  const termFilter = document.getElementById('resultsTermFilter');
  const yearFilter = document.getElementById('resultsYearFilter');
  const searchButton = document.getElementById('resultsSearchButton');
  if (!termFilter || !yearFilter || !searchButton) return;

  searchButton.addEventListener('click', searchFilteredTranscript);
}

async function searchFilteredTranscript() {
  const term = document.getElementById('resultsTermFilter')?.value || '';
  const year = document.getElementById('resultsYearFilter')?.value || '';
  const searchButton = document.getElementById('resultsSearchButton');
  const status = document.getElementById('transcriptFilterStatus');

  const params = new URLSearchParams();
  if (year) params.set('year', year);
  if (term) params.set('term', term);

  searchButton.disabled = true;
  searchButton.textContent = 'Searching...';
  if (status) {
    status.textContent = year || term ? 'Loading transcript records...' : 'Loading all transcript records...';
  }

  try {
    await loadAcademicData();
    const response = await fetchWithAuth(`/transcript?${params.toString()}`);
    const records = await response.json();
    if (!response.ok || !Array.isArray(records)) {
      throw new Error(records.message || 'Could not load transcript records');
    }
    renderFilteredTranscript(records);
    if (status) {
      status.textContent = records.length
        ? `${records.length} transcript record${records.length === 1 ? '' : 's'} found for ${term || 'all terms'}, ${year}.`
        : `No transcript records found for ${term || 'all terms'}, ${year}.`;
    }
  } catch (error) {
    console.error('Transcript search error:', error);
    renderFilteredTranscript([]);
    if (status) status.textContent = error.message || 'Could not load transcript records.';
  } finally {
    searchButton.disabled = false;
    searchButton.textContent = 'Search';
  }
}

function renderFilteredTranscript(records) {
  const wrap = document.getElementById('filteredTranscriptWrap');
  const body = document.getElementById('filteredTranscriptBody');
  const count = document.getElementById('filteredTranscriptCount');
  if (!wrap || !body || !count) return;

  wrap.hidden = false;
  count.textContent = `${records.length} record${records.length === 1 ? '' : 's'}`;
  body.innerHTML = records.length
    ? records.map((record) => `
        <tr>
          <td>${record.year || record.academic_year || '-'}</td>
          <td>${record.term || '-'}</td>
          <td>${record.total ?? '-'}</td>
          <td>${record.avg ?? '-'}</td>
          <td>${record.grade || '-'}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="5" class="text-center">No transcript records found.</td></tr>';
}

function updateResultYearOptions(results) {
  const yearFilter = document.getElementById('resultsYearFilter');
  if (!yearFilter || !Array.isArray(results)) return;

  const selectedYear = yearFilter.value;
  const years = results
    .map((result) => result.academic_year ?? result.year)
    .filter((year) => year !== null && year !== undefined && String(year).trim() !== '')
    .map((year) => String(year))
    .filter((year, index, values) => values.indexOf(year) === index)
    .sort((first, second) => Number(second) - Number(first));

  if (years.join('|') === availableResultYears.join('|')) return;
  availableResultYears = years;
  yearFilter.innerHTML = '<option value="">All years</option>';
  years.forEach((year) => {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    yearFilter.appendChild(option);
  });
  yearFilter.value = years.includes(selectedYear) ? selectedYear : '';
}