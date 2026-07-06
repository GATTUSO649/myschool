const adminState = {
  stats: null,
  students: [],
  portalItems: {
    reviews: [],
    announcements: [],
    notifications: [],
    payments: [],
    academics: [],
    logs: []
  }
};

const STORAGE_KEYS = {
  reviews: 'adminPortalReviews',
  announcements: 'adminPortalAnnouncements',
  notifications: 'adminPortalNotifications',
  payments: 'adminPortalPayments',
  academics: 'adminPortalAcademics',
  logs: 'adminPortalLogs',
  counts: 'adminPortalCounts'
};

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function readPortalStore(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : [];
  } catch (error) {
    return [];
  }
}

function writePortalStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadPortalState() {
  adminState.portalItems.reviews = readPortalStore(STORAGE_KEYS.reviews);
  adminState.portalItems.announcements = readPortalStore(STORAGE_KEYS.announcements);
  adminState.portalItems.notifications = readPortalStore(STORAGE_KEYS.notifications);
  adminState.portalItems.payments = readPortalStore(STORAGE_KEYS.payments);
  adminState.portalItems.academics = readPortalStore(STORAGE_KEYS.academics);
  adminState.portalItems.logs = readPortalStore(STORAGE_KEYS.logs);
}

function savePortalState() {
  writePortalStore(STORAGE_KEYS.reviews, adminState.portalItems.reviews);
  writePortalStore(STORAGE_KEYS.announcements, adminState.portalItems.announcements);
  writePortalStore(STORAGE_KEYS.notifications, adminState.portalItems.notifications);
  writePortalStore(STORAGE_KEYS.payments, adminState.portalItems.payments);
  writePortalStore(STORAGE_KEYS.academics, adminState.portalItems.academics);
  writePortalStore(STORAGE_KEYS.logs, adminState.portalItems.logs);
}

function updateCounter(key, delta) {
  const counts = JSON.parse(localStorage.getItem(STORAGE_KEYS.counts) || '{}');
  counts[key] = (Number(counts[key]) || 0) + delta;
  localStorage.setItem(STORAGE_KEYS.counts, JSON.stringify(counts));
}

function getStatsSnapshot() {
  const base = adminState.stats || {};
  const counts = JSON.parse(localStorage.getItem(STORAGE_KEYS.counts) || '{}');
  return {
    totalStudents: Number(base.totalStudents || 0) + Number(counts.students || 0),
    totalClasses: Number(base.totalClasses || 0),
    totalApplications: Number(base.totalApplications || 0) + Number(counts.reviews || 0),
    totalResults: Number(base.totalResults || 0) + Number(counts.results || 0)
  };
}

function renderStatsCards() {
  const stats = getStatsSnapshot();
  setText('totalStudents', stats.totalStudents ?? 0);
  setText('totalClasses', stats.totalClasses ?? 0);
  setText('totalApplications', stats.totalApplications ?? 0);
  setText('totalResults', stats.totalResults ?? 0);
}

function renderDashboardChart() {
  const chart = document.getElementById('dashboardChart');
  if (!chart) return;
  const stats = getStatsSnapshot();
  const values = [stats.totalApplications, stats.totalStudents, stats.totalResults, stats.totalClasses];
  const labels = ['Apps', 'Students', 'Results', 'Classes'];
  const max = Math.max(...values, 1);
  chart.innerHTML = `
    <div class="chart-header">
      <strong>Operations snapshot</strong>
      <span>Live admin summary</span>
    </div>
    <svg viewBox="0 0 260 120" class="mini-chart" role="img" aria-label="Admin activity chart">
      ${values.map((value, index) => `
        <g class="bar-group">
          <rect x="${18 + index * 58}" y="${108 - (value / max) * 76}" width="24" height="${(value / max) * 76}" rx="8" class="chart-bar chart-bar-${index}"></rect>
          <text x="${30 + index * 58}" y="122" text-anchor="middle" class="chart-label">${labels[index]}</text>
        </g>
      `).join('')}
    </svg>
  `;
}

function renderFinanceChart() {
  const chart = document.getElementById('financeChart');
  if (!chart) return;
  const payments = adminState.portalItems.payments || [];
  const billed = Number(document.getElementById('financeBilled')?.textContent?.replace(/[^0-9.-]+/g, '') || 0);
  const paid = Number(document.getElementById('financePaid')?.textContent?.replace(/[^0-9.-]+/g, '') || 0);
  const outstanding = Math.max(billed - paid, 0);
  chart.innerHTML = `
    <div class="chart-header">
      <strong>Fee outlook</strong>
      <span>${payments.length} payment records</span>
    </div>
    <svg viewBox="0 0 260 120" class="mini-chart" role="img" aria-label="Finance chart">
      <rect x="28" y="26" width="88" height="72" rx="16" class="chart-bar chart-bar-0"></rect>
      <rect x="138" y="44" width="88" height="54" rx="16" class="chart-bar chart-bar-2"></rect>
      <text x="72" y="116" text-anchor="middle" class="chart-label">Collected</text>
      <text x="182" y="116" text-anchor="middle" class="chart-label">Pending</text>
    </svg>
  `;
}

async function loadAcademicEntryStudents() {
  const className = document.getElementById('entryClass')?.value;
  const body = document.getElementById('academicEntryTableBody');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="3">Loading students…</td></tr>';
  try {
    const response = await fetchWithAuth(`/academics/entry/students?className=${encodeURIComponent(className || '')}`);
    const data = await response.json();
    const students = data.students || [];
    body.innerHTML = students.length ? students.map((student) => `
      <tr data-student-id="${student.id}">
        <td>${student.name}</td>
        <td>${student.admissionNumber || ''}</td>
        <td><input name="score_${student.id}" type="number" min="0" max="100" step="1" placeholder="0"></td>
      </tr>
    `).join('') : '<tr><td colspan="3">No students found for that class.</td></tr>';
  } catch (error) {
    body.innerHTML = '<tr><td colspan="3">Could not load student list.</td></tr>';
  }
}

async function loadAcademicDashboard() {
  try {
    const response = await fetchWithAuth('/academics/dashboard');
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'No data');
    const summary = data.summary || {};
    setText('academicStudentsCount', summary.totalStudents ?? 0);
    setText('academicNotesCount', summary.notesUploaded ?? 0);
    setText('academicRevisionCount', summary.revisionPapers ?? 0);
    setText('academicResultsCount', summary.resultsPublished ?? 0);
    const chart = document.getElementById('academicsDashboardChart');
    if (chart) {
      chart.innerHTML = `
        <div class="chart-header"><strong>Performance mix</strong><span>${summary.averageSchoolMean ?? 0}% average</span></div>
        <svg viewBox="0 0 260 120" class="mini-chart" role="img" aria-label="Academics chart">
          <circle cx="90" cy="60" r="34" fill="none" stroke="#3b82f6" stroke-width="20" stroke-dasharray="214" stroke-dashoffset="48"></circle>
          <circle cx="170" cy="60" r="34" fill="none" stroke="#0ea5a5" stroke-width="20" stroke-dasharray="214" stroke-dashoffset="92"></circle>
          <text x="90" y="60" text-anchor="middle" class="chart-label">Results</text>
          <text x="170" y="60" text-anchor="middle" class="chart-label">Notes</text>
        </svg>
      `;
    }
  } catch (error) {
    console.error('Academic dashboard load error:', error);
  }
}

async function loadFinanceSummary() {
  try {
    const response = await fetchWithAuth('/finance/overview');
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'No finance data');
    const billed = Number(data.total_charged || data.total_charges || data.billed || 0);
    const paid = Number(data.total_paid || data.paid || 0);
    const balance = Math.max(billed - paid, 0);
    setText('financeBilled', `KSh ${billed.toLocaleString()}`);
    setText('financePaid', `KSh ${paid.toLocaleString()}`);
    setText('financeBalance', `KSh ${balance.toLocaleString()}`);
    setText('financeToday', data.payments_today ?? 0);
    renderFinanceChart();
  } catch (error) {
    console.error('Finance summary load error:', error);
  }
}

async function loadFinanceStudents() {
  const className = document.getElementById('financeEntryClass')?.value;
  const studentSelect = document.getElementById('financeEntryStudent');
  if (!studentSelect) return;
  studentSelect.innerHTML = '<option value="">Select student</option>';
  try {
    const response = await fetchWithAuth(`/students?class_name=${encodeURIComponent(className || '')}`);
    const data = await response.json();
    const students = Array.isArray(data) ? data : data.students || [];
    studentSelect.innerHTML = '<option value="">Select student</option>' + students.map((student) => `<option value="${student.id}">${student.name} (${student.admissionNumber || student.admission_number || ''})</option>`).join('');
  } catch (error) {
    console.error('Finance student load error:', error);
  }
}

function renderActivityFeed() {
  const feed = document.getElementById('activityFeed');
  if (!feed) return;
  const combined = [
    ...adminState.portalItems.reviews.slice(-2).map((item) => ({ label: 'Review', detail: `${item.name} • ${item.status}` })),
    ...adminState.portalItems.payments.slice(-2).map((item) => ({ label: 'Payment', detail: `${item.student} • ${item.amount}` })),
    ...adminState.portalItems.academics.slice(-2).map((item) => ({ label: 'Academic', detail: item.title }))
  ].slice(0, 4);

  if (!combined.length) {
    feed.innerHTML = '<div class="mini-card"><strong>No activity yet</strong><span>Actions from reviews, uploads, and payments will appear here.</span></div>';
    return;
  }

  feed.innerHTML = combined.map((item) => `
    <div class="mini-card">
      <strong>${item.label}</strong>
      <span>${item.detail}</span>
    </div>
  `).join('');
}

async function loadAdminData() {
  if (!checkAuth()) return;

  loadPortalState();
  const student = getStudentInfo() || {};
  setText('adminName', student.name || 'Administrator');
  setText('adminNamePill', student.name || 'Administrator');
  setText('adminSummary', `${student.username || 'admin'} • Secure administration controls`);

  try {
    const [statsRes, studentsRes] = await Promise.all([
      fetchWithAuth('/admin/stats'),
      fetchWithAuth('/admin/students')
    ]);

    if (statsRes.ok) {
      const statsData = await statsRes.json();
      const stats = statsData.stats || {};
      adminState.stats = stats;
      renderStatsCards();
      renderDashboardChart();
    }

    if (studentsRes.ok) {
      const studentsData = await studentsRes.json();
      adminState.students = studentsData.students || [];
      renderStudents();
    }
  } catch (error) {
    console.error('Admin portal load error:', error);
    renderStatsCards();
    renderDashboardChart();
  }

  renderActivityFeed();
  renderFinanceChart();
}

function renderStudents() {
  const body = document.getElementById('studentsTableBody');
  if (!body) return;

  if (!adminState.students.length) {
    body.innerHTML = '<tr><td colspan="6">No student accounts found.</td></tr>';
    return;
  }

  body.innerHTML = adminState.students.map((student) => `
    <tr>
      <td>${student.name || '—'}</td>
      <td>${student.username || '—'}</td>
      <td>${student.admissionNumber || '—'}</td>
      <td>${student.className || '—'}</td>
      <td><span class="status-pill ${student.active ? 'active' : 'inactive'}">${student.active ? 'Active' : 'Inactive'}</span></td>
      <td>${student.active ? `<a class="action-link" href="#" data-id="${student.id}">Deactivate</a>` : '—'}</td>
    </tr>
  `).join('');
}

function createAdminModal({ title, description, fields, submitLabel = 'Save', onSubmit }) {
  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.innerHTML = `
    <div class="admin-modal-card">
      <h3>${title}</h3>
      <p>${description}</p>
      <form class="admin-modal-form">
        ${fields.map((field) => {
          if (field.type === 'textarea') {
            return `<label>${field.label}<textarea name="${field.name}" ${field.required ? 'required' : ''}></textarea></label>`;
          }
          if (field.type === 'select') {
            return `<label>${field.label}<select name="${field.name}" ${field.required ? 'required' : ''}>${field.options.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}</select></label>`;
          }
          return `<label>${field.label}<input type="${field.type || 'text'}" name="${field.name}" ${field.required ? 'required' : ''} ${field.placeholder ? `placeholder="${field.placeholder}"` : ''}></label>`;
        }).join('')}
        <div class="admin-modal-actions">
          <button type="button" class="secondary-button" data-close-modal>Cancel</button>
          <button type="submit" class="primary-button">${submitLabel}</button>
        </div>
      </form>
    </div>
  `;

  overlay.querySelector('[data-close-modal]').addEventListener('click', () => overlay.remove());
  overlay.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    onSubmit(data);
    overlay.remove();
  });

  document.body.appendChild(overlay);
}

async function handleButtonAction(action) {
  if (action === 'create-review') {
    createAdminModal({
      title: 'Review a student application',
      description: 'Capture a quick review decision for the admissions queue.',
      fields: [
        { label: 'Applicant name', name: 'name', required: true },
        { label: 'Status', name: 'status', type: 'select', options: [{ value: 'Pending', label: 'Pending' }, { value: 'Approved', label: 'Approved' }, { value: 'Rejected', label: 'Rejected' }] },
        { label: 'Notes', name: 'notes', type: 'textarea' }
      ],
      onSubmit: (data) => {
        adminState.portalItems.reviews.push({ ...data, createdAt: new Date().toLocaleString() });
        savePortalState();
        updateCounter('reviews', 1);
        renderStatsCards();
        renderDashboardChart();
        renderActivityFeed();
        showAlert('Application review saved', 'success');
      }
    });
    return;
  }

  if (action === 'export-students') {
    const rows = adminState.students.length ? adminState.students : [];
    const csv = ['name,username,admissionNumber,className,status'].concat(rows.map((student) => `${student.name || ''},${student.username || ''},${student.admissionNumber || ''},${student.className || ''},${student.active ? 'Active' : 'Inactive'}`)).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'student-export.csv';
    anchor.click();
    URL.revokeObjectURL(url);
    showAlert('Student list exported', 'success');
    return;
  }

  if (action === 'publish-results') {
    createAdminModal({
      title: 'Publish a results update',
      description: 'Create a simple results record for the academics board.',
      fields: [
        { label: 'Title', name: 'title', required: true },
        { label: 'Class', name: 'className', required: true },
        { label: 'Summary', name: 'summary', type: 'textarea' }
      ],
      onSubmit: (data) => {
        adminState.portalItems.academics.push({ ...data, createdAt: new Date().toLocaleString() });
        savePortalState();
        updateCounter('results', 1);
        renderStatsCards();
        renderDashboardChart();
        renderActivityFeed();
        showAlert('Academic update added', 'success');
      }
    });
    return;
  }

  if (action === 'upload-files') {
    createAdminModal({
      title: 'Upload a school document',
      description: 'Files are sent to the academic documents endpoint.',
      fields: [
        { label: 'Document title', name: 'title', required: true },
        { label: 'Description', name: 'description' },
        { label: 'Choose file', name: 'file', type: 'file', required: true }
      ],
      submitLabel: 'Upload',
      onSubmit: async (data) => {
        const formData = new FormData();
        formData.append('title', data.title || 'Admin upload');
        formData.append('description', data.description || 'Uploaded from admin portal');
        formData.append('file', data.file);
        try {
          const response = await fetchWithAuth('/academics/docs', { method: 'POST', body: formData });
          const uploadData = await response.json();
          if (!response.ok) throw new Error(uploadData.message || 'Upload failed');
          adminState.portalItems.academics.push({ title: uploadData.title || data.title, createdAt: new Date().toLocaleString() });
          savePortalState();
          renderActivityFeed();
          showAlert('File uploaded successfully', 'success');
        } catch (error) {
          showAlert(error.message || 'Upload failed', 'error');
        }
      }
    });
    return;
  }

  if (action === 'record-payment') {
    createAdminModal({
      title: 'Record a school payment',
      description: 'Add a quick fee payment record for the finance board.',
      fields: [
        { label: 'Student', name: 'student', required: true },
        { label: 'Amount', name: 'amount', required: true, placeholder: 'KSh 5000' },
        { label: 'Reference', name: 'reference' }
      ],
      onSubmit: (data) => {
        adminState.portalItems.payments.push({ ...data, createdAt: new Date().toLocaleString() });
        savePortalState();
        renderFinanceChart();
        renderActivityFeed();
        showAlert('Payment recorded', 'success');
      }
    });
    return;
  }

  if (action === 'create-announcement') {
    createAdminModal({
      title: 'Create an announcement',
      description: 'Post a notice for the school community.',
      fields: [
        { label: 'Title', name: 'title', required: true },
        { label: 'Message', name: 'message', type: 'textarea', required: true }
      ],
      onSubmit: (data) => {
        adminState.portalItems.announcements.push({ ...data, createdAt: new Date().toLocaleString() });
        savePortalState();
        renderActivityFeed();
        showAlert('Announcement published', 'success');
      }
    });
    return;
  }

  if (action === 'create-notification') {
    createAdminModal({
      title: 'Send a notification',
      description: 'Create an instant alert for students or staff.',
      fields: [
        { label: 'Title', name: 'title', required: true },
        { label: 'Audience', name: 'audience', required: true, placeholder: 'All students' },
        { label: 'Message', name: 'message', type: 'textarea', required: true }
      ],
      onSubmit: (data) => {
        adminState.portalItems.notifications.push({ ...data, createdAt: new Date().toLocaleString() });
        savePortalState();
        renderActivityFeed();
        showAlert('Notification queued', 'success');
      }
    });
    return;
  }

  if (action === 'generate-report') {
    const reportText = `Cresent High School report\nStudents: ${getStatsSnapshot().totalStudents}\nApplications: ${getStatsSnapshot().totalApplications}\nResults: ${getStatsSnapshot().totalResults}`;
    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'school-report.txt';
    anchor.click();
    URL.revokeObjectURL(url);
    showAlert('Report generated', 'success');
    return;
  }

  if (action === 'view-logs') {
    const logs = adminState.portalItems.logs.length ? adminState.portalItems.logs : [{ action: 'No logs yet', detail: 'Login, upload, and payment activity will appear here.' }];
    createAdminModal({
      title: 'Recent audit events',
      description: 'Live summary of the most recent actions.',
      fields: [{ label: 'Preview', name: 'preview', type: 'textarea' }],
      submitLabel: 'Close',
      onSubmit: () => {}
    });
    const form = document.querySelector('.admin-modal-form');
    if (form) {
      form.querySelector('textarea').value = logs.map((item) => `${item.action || 'Action'} — ${item.detail || ''}`).join('\n');
    }
    return;
  }

  if (action === 'save-settings') {
    const values = Array.from(document.querySelectorAll('.admin-settings-form input')).reduce((acc, element) => {
      acc[element.name] = element.value;
      return acc;
    }, {});
    localStorage.setItem('adminPortalSettings', JSON.stringify(values));
    showAlert('Settings saved', 'success');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadAdminData();
  loadAcademicDashboard();
  loadFinanceSummary();
  loadAcademicEntryStudents();
  loadFinanceStudents();

  document.querySelectorAll('[data-admin-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      handleButtonAction(button.dataset.adminAction);
    });
  });

  const academicEntryForm = document.getElementById('academicEntryForm');
  if (academicEntryForm) {
    academicEntryForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(academicEntryForm);
      const entries = [];
      academicEntryForm.querySelectorAll('tbody tr').forEach((row) => {
        const studentId = row.dataset.studentId;
        const score = row.querySelector('input')?.value;
        if (studentId && score !== '') entries.push({ student_id: studentId, score: Number(score) });
      });
      const payload = Object.fromEntries(formData.entries());
      const response = await fetchWithAuth('/academics/entry/results', { method: 'POST', body: JSON.stringify({ ...payload, entries }) });
      const data = await response.json();
      if (response.ok) {
        showAlert(data.message || 'Marks saved successfully', 'success');
        loadAcademicDashboard();
      } else {
        showAlert(data.message || 'Could not save marks', 'error');
      }
    });
  }

  const financeEntryForm = document.getElementById('financeEntryForm');
  if (financeEntryForm) {
    financeEntryForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(financeEntryForm).entries());
      const response = await fetchWithAuth('/finance/payments', { method: 'POST', body: JSON.stringify({ ...payload, student_id: payload.student_id, amount: Number(payload.amount) }) });
      const data = await response.json();
      if (response.ok) {
        showAlert(data.message || 'Payment recorded', 'success');
        financeEntryForm.reset();
        loadFinanceSummary();
      } else {
        showAlert(data.message || 'Could not record payment', 'error');
      }
    });
  }

  const entryClass = document.getElementById('entryClass');
  if (entryClass) {
    entryClass.addEventListener('change', loadAcademicEntryStudents);
  }

  const financeEntryClass = document.getElementById('financeEntryClass');
  if (financeEntryClass) {
    financeEntryClass.addEventListener('change', loadFinanceStudents);
  }

  const form = document.getElementById('studentForm');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      const response = await fetchWithAuth('/admin/students', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (response.ok) {
        updateCounter('students', 1);
        showAlert(data.message || 'Student created successfully', 'success');
        form.reset();
        loadAdminData();
      } else {
        showAlert(data.message || 'Could not create student', 'error');
      }
    });
  }

  document.addEventListener('click', async (event) => {
    const action = event.target.closest('a.action-link');
    if (!action) return;
    event.preventDefault();
    const studentId = action.getAttribute('data-id');
    const response = await fetchWithAuth(`/admin/students/${studentId}/deactivate`, { method: 'PUT' });
    const data = await response.json();
    if (response.ok) {
      showAlert(data.message || 'Student deactivated', 'success');
      loadAdminData();
    } else {
      showAlert(data.message || 'Could not deactivate student', 'error');
    }
  });
});
