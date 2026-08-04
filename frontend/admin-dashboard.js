const adminState = {
  stats: null,
  students: [],
  database: {
    tableName: null,
    columns: [],
    rows: [],
    editingId: null,
    editable: false
  },
  formPaymentSummary: [],
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

const ADMIN_MARK_SUBJECTS = [
  { key: 'eng', label: 'Eng', api: 'English' },
  { key: 'kis', label: 'Kis', api: 'Kiswahili' },
  { key: 'mat', label: 'Mat', api: 'Mathematics' },
  { key: 'bio', label: 'Bio', api: 'Biology' },
  { key: 'che', label: 'Che', api: 'Chemistry' },
  { key: 'phy', label: 'Phy', api: 'Physics' },
  { key: 'geo', label: 'Geo', api: 'Geography' },
  { key: 'his', label: 'His', api: 'History and Government' },
  { key: 'cre', label: 'CRE', api: 'Christian Religious Education' },
  { key: 'com', label: 'Com', api: 'Computer Studies' },
  { key: 'agr', label: 'Agr', api: 'Agriculture' },
  { key: 'bus', label: 'Bus', api: 'Business Studies' }
];

const DEFAULT_FEE_CATEGORIES = [
  ['Tuition', 40000],
  ['Development', 10000],
  ['Activity', 5000],
  ['Exam', 7000]
];

function currentAdminPage() {
  return window.location.pathname.split('/').pop().toLowerCase() || 'admin-dashboard.html';
}

function downloadAcademicsSheet() {
  const container = document.querySelector('.academics-sheet-card');
  if (!container) { showAlert('Nothing to download', 'error'); return; }
  // Gather styles (links and inline)
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) => {
    // preserve relative hrefs
    return `<link rel="stylesheet" href="${l.getAttribute('href')}">`;
  }).join('\n') + '\n' + Array.from(document.querySelectorAll('style')).map(s => `<style>${s.innerHTML}</style>`).join('\n');
  const newWin = window.open('', '_blank');
  if (!newWin) { showAlert('Unable to open print window', 'error'); return; }
  const content = container.outerHTML;
  newWin.document.open();
  newWin.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body style="background:#f4f7fb;padding:18px">${content}</body></html>`);
  newWin.document.close();
  newWin.onload = () => {
    // try to limit to two pages by slightly shrinking font if needed
    const sheet = newWin.document.querySelector('.academics-sheet-card');
    if (sheet) sheet.style.maxWidth = '900px';
    setTimeout(() => { newWin.print(); newWin.close(); }, 300);
  };
}

function normalizeAdminSidebar() {
  const sidebar = document.querySelector('.student-sidebar');
  if (!sidebar || !currentAdminPage().startsWith('admin-')) return;
  const page = currentAdminPage();
  const params = new URLSearchParams(window.location.search);
  const activeForm = params.get('form');
  const formLinks = [1, 2, 3, 4].map((form) => {
    const active = ['admin-management.html', 'admin-transcripts.html'].includes(page) && activeForm === String(form) ? ' active' : '';
    return `<a class="sidebar-link${active}" href="admin-management.html?form=${form}">Form ${form}</a>`;
  }).join('');

  sidebar.innerHTML = `
    <div class="sidebar-brand">Admin Control</div>
    <div class="sidebar-section">
      <h3>Main</h3>
      <a class="sidebar-link${page === 'admin-dashboard.html' ? ' active' : ''}" href="admin-dashboard.html">Dashboard</a>
    </div>
    <div class="sidebar-section">
      <h3>Student Management</h3>
      ${formLinks}
    </div>
    <div class="sidebar-section">
      <h3>Records</h3>
      <a class="sidebar-link${page === 'admin-students.html' ? ' active' : ''}" href="admin-students.html">All Students</a>
      <a class="sidebar-link${page === 'admin-applications.html' ? ' active' : ''}" href="admin-applications.html">Applications</a>
      <a class="sidebar-link${page === 'admin-database.html' ? ' active' : ''}" href="admin-database.html">Database</a>
    </div>
    <div class="sidebar-section">
      <h3>System</h3>
      <a class="sidebar-link${page === 'admin-settings.html' ? ' active' : ''}" href="admin-settings.html">Settings</a>
      <a class="sidebar-link" href="#" data-admin-logout>Logout</a>
    </div>
  `;
}

function getSelectedManagementForm() {
  const form = Number(new URLSearchParams(window.location.search).get('form') || 1);
  return Math.min(Math.max(form, 1), 4);
}

function applyManagementContext() {
  const root = document.getElementById('managementFormRoot');
  if (!root) return;
  const form = getSelectedManagementForm();
  const formName = `Form ${form}`;
  const title = document.getElementById('managementFormTitle');
  const summary = document.getElementById('managementFormSummary');
  if (title) title.textContent = `${formName} management`;
  if (summary) summary.textContent = `Manage academics and finance for students admitted into ${formName}.`;
  root.querySelectorAll('[data-form-label]').forEach((node) => { node.textContent = formName; });
  root.querySelectorAll('[data-form-link]').forEach((link) => {
    const target = link.dataset.formLink;
    if (target === 'academics') link.href = `admin-academics.html?className=${encodeURIComponent(formName)}`;
    if (target === 'finance') link.href = `admin-finance.html?className=${encodeURIComponent(formName)}`;
    if (target === 'uploads') link.href = `admin-academics.html?className=${encodeURIComponent(formName)}#academicDocumentForm`;
    if (target === 'transcripts') link.href = `admin-transcripts.html?form=${form}`;
    if (target === 'fee-statements') link.href = `admin-finance.html?className=${encodeURIComponent(formName)}#statementPanel`;
    if (target === 'fee-payment') link.href = `admin-finance.html?className=${encodeURIComponent(formName)}#feePaymentPanel`;
    if (target === 'fee-structure') link.href = `admin-finance.html?className=${encodeURIComponent(formName)}#feeStructurePanel`;
    if (target === 'receipts') link.href = `admin-finance.html?className=${encodeURIComponent(formName)}#paymentLedgerPanel`;
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function money(value) {
  return `KSh ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function gradeForAverage(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return 'N/A';
  if (numeric >= 80) return 'A';
  if (numeric >= 70) return 'A-';
  if (numeric >= 60) return 'B';
  if (numeric >= 50) return 'C';
  if (numeric >= 40) return 'D';
  if (numeric >= 30) return 'E';
  return 'F';
}

function normalizeStudentAdm(student) {
  return student.admissionNumber || student.admission_number || student.adm || '';
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
    totalApplications: Number(base.applicationCounts?.pending || base.totalApplications || 0) + Number(counts.reviews || 0),
    totalResults: Number(base.totalResults || 0) + Number(counts.results || 0),
    applicationCounts: base.applicationCounts || { pending: 0, approved: 0, rejected: 0 }
  };
}

function renderStatsCards() {
  const stats = adminState.stats || {};
  setText('totalStudents', Number(stats.totalStudents || 0));
  setText('totalClasses', Number(stats.totalClasses || 0));
  setText('totalApplications', Number(stats.applicationCounts?.pending || stats.totalApplications || 0));
  setText('approvedApplications', Number(stats.applicationCounts?.approved || 0));
  setText('rejectedApplications', Number(stats.applicationCounts?.rejected || 0));
  setText('totalResults', Number(stats.totalResults || 0));
  setText('totalCharged', `KSh ${Number(stats.totalCharged || 0).toLocaleString()}`);
  setText('totalPaid', `KSh ${Number(stats.totalPaid || 0).toLocaleString()}`);
}

function renderApplicationSummary() {
  const stats = adminState.stats || {};
  if (document.getElementById('pendingApplications')) {
    setText('pendingApplications', stats.applicationCounts?.pending ?? 0);
  }
  if (document.getElementById('approvedApplications')) {
    setText('approvedApplications', stats.applicationCounts?.approved ?? 0);
  }
  if (document.getElementById('rejectedApplications')) {
    setText('rejectedApplications', stats.applicationCounts?.rejected ?? 0);
  }
  if (document.getElementById('totalApplicationsCount')) {
    setText('totalApplicationsCount', stats.totalApplications ?? 0);
  }
}

function renderFinanceOverviewChart() {
  const chart = document.getElementById('financeOverviewChart');
  if (!chart) return;

  const billed = Number(adminState.stats?.totalCharged || adminState.stats?.totalBilled || 0);
  const paid = Number(adminState.stats?.totalPaid || 0);
  const balance = Math.max(billed - paid, 0);

  if (!billed && !paid && !balance) {
    chart.innerHTML = '<div class="empty-chart">No finance data is available yet.</div>';
    return;
  }

  const total = billed || paid || balance || 1;
  const paidPercent = Math.round((paid / total) * 100);
  const balancePercent = Math.round((balance / total) * 100);
  chart.innerHTML = `
    <div class="finance-overview-card">
      <div class="finance-pie-chart" style="--paid-percent:${paidPercent}%; --balance-percent:${balancePercent}%;">
        <div class="finance-pie-center">
          <strong>${paidPercent}%</strong>
          <span>Paid</span>
        </div>
      </div>
      <div class="finance-overview-legend">
        <div class="finance-legend-row">
          <span><i class="legend-dot paid"></i> Paid</span>
          <strong>${money(paid)}</strong>
        </div>
        <div class="finance-legend-row">
          <span><i class="legend-dot balance"></i> Balance</span>
          <strong>${money(balance)}</strong>
        </div>
        <div class="finance-legend-row">
          <span><i class="legend-dot pending"></i> Total billed</span>
          <strong>${money(billed)}</strong>
        </div>
      </div>
    </div>
  `;
}

function renderAcademicPerformanceChart() {
  const chart = document.getElementById('academicPerformanceChart');
  if (!chart) return;

  const summary = adminState.stats?.formAverages || [];
  if (!summary.length) {
    chart.innerHTML = '<div class="empty-chart">Academic results are not available yet.</div>';
    return;
  }

  const maxValue = Math.max(...summary.map((item) => Number(item.average || 0)), 1);
  chart.innerHTML = `
    <div class="academic-bar-list">
      ${summary.map((item) => {
        const average = Number(item.average || 0);
        const width = Math.max(6, Math.round((average / maxValue) * 100));
        return `
          <div class="academic-bar-row">
            <div class="academic-bar-label">${escapeHtml(item.className || 'Class')}</div>
            <div class="academic-bar-track" aria-label="${escapeHtml(item.className || 'Class')} average">
              <div class="academic-bar-fill" style="width:${width}%"></div>
            </div>
            <div class="academic-bar-value">${average.toFixed(1)}%</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderFinanceTrendChart() {
  const chart = document.getElementById('paymentTrendChart');
  if (!chart) return;

  const summary = adminState.stats?.formPaymentSummary || [];
  if (!summary.length) {
    chart.innerHTML = '<div class="empty-chart">Payment trend data is not available yet.</div>';
    return;
  }

  const cleaned = summary.map((item) => ({
    label: item.className || 'Class',
    value: Number(item.paidAmount || 0)
  }));
  const maxValue = Math.max(...cleaned.map((item) => item.value), 1);
  const width = 420;
  const height = 200;
  const margin = 28;
  const points = cleaned.map((item, index) => {
    const x = margin + ((width - margin * 2) / Math.max(cleaned.length - 1, 1)) * index;
    const y = height - margin - ((height - margin * 2) * item.value / maxValue);
    return { ...item, x, y };
  });

  const polyline = points.map((item) => `${item.x},${item.y}`).join(' ');
  const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(' ') + ` ${points[points.length - 1].x},${height - margin} ${points[0].x},${height - margin}`;

  chart.innerHTML = `
    <div class="line-chart-shell">
      <svg viewBox="0 0 ${width} ${height}" class="line-chart-svg" role="img" aria-label="Payment trend by form">
        <defs>
          <linearGradient id="trendGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.35" />
            <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
          </linearGradient>
        </defs>
        <polygon points="${polygonPoints}" fill="url(#trendGradient)" opacity="0.75"></polygon>
        <polyline points="${polyline}" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        ${points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#fff" stroke="#2563eb" stroke-width="3"></circle>`).join('')}
        ${Array.from({ length: 4 }, (_, idx) => {
          const y = margin + ((height - margin * 2) / 3) * idx;
          const value = Math.round(maxValue - (maxValue / 3) * idx);
          return `<line x1="${margin}" y1="${y}" x2="${width - margin}" y2="${y}" stroke="rgba(15, 23, 42, 0.08)" stroke-dasharray="3 6"></line><text x="${margin - 10}" y="${y + 4}" fill="#64748b" font-size="10" text-anchor="end">${money(value)}</text>`;
        }).join('')}
      </svg>
      <div class="line-chart-labels">
        ${points.map((point) => `<div class="line-chart-label">${escapeHtml(point.label)}</div>`).join('')}
      </div>
    </div>
  `;
}

async function loadAcademicEntryStudents() {
  const className = document.getElementById('entryClass')?.value;
  const body = document.getElementById('academicEntryTableBody');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="3"></td></tr>';
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
    `).join('') : '<tr><td colspan="3"></td></tr>';
  } catch (error) {
    body.innerHTML = '<tr><td colspan="3"></td></tr>';
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
    const moduleStudents = document.getElementById('academicModuleStudents');
    const moduleNotes = document.getElementById('academicModuleNotes');
    const moduleResults = document.getElementById('academicModuleResults');
    const moduleAverage = document.getElementById('academicModuleAverage');
    if (moduleStudents) moduleStudents.textContent = summary.totalStudents ?? 0;
    if (moduleNotes) moduleNotes.textContent = (Number(summary.notesUploaded ?? 0) + Number(summary.revisionPapers ?? 0));
    if (moduleResults) moduleResults.textContent = summary.resultsPublished ?? 0;
    if (moduleAverage) moduleAverage.textContent = `${Number(summary.averageSchoolMean || 0).toFixed(0)}%`;
    const chart = document.getElementById('academicsDashboardChart');
    if (chart) {
      chart.innerHTML = `
        <div class="chart-header"><strong>Performance mix</strong><span>${summary.averageSchoolMean ?? 0}% average</span></div>
        <div class="info-grid">
          <div class="info-box"><span>Results</span><strong>${summary.resultsPublished ?? 0}</strong></div>
          <div class="info-box"><span>Notes</span><strong>${summary.notesUploaded ?? 0}</strong></div>
        </div>
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
  const className = document.getElementById('financeEntryClass')?.value || document.getElementById('feeStructureClass')?.value || '';
  const studentSelect = document.getElementById('financeEntryStudent');
  const structureStudentSelect = document.getElementById('feeStructureStudent');
  const statementStudentSelect = document.getElementById('statementStudent');
  if (!studentSelect && !structureStudentSelect && !statementStudentSelect) return;
  const setLoading = (select, label = 'Select student') => {
    if (select) select.innerHTML = `<option value="">${label}</option>`;
  };
  setLoading(studentSelect);
  setLoading(structureStudentSelect, 'Optional student');
  setLoading(statementStudentSelect, 'All students');
  try {
    const response = await fetchWithAuth('/admin/students');
    const data = await response.json();
    const allStudents = (Array.isArray(data) ? data : data.students || []).filter((student) => student.role !== 'rba' && student.active !== false);
    const students = className ? allStudents.filter((student) => (student.className || student.class_name) === className) : allStudents;
    const options = students.map((student) => `<option value="${student.id}">${escapeHtml(student.name)} (${escapeHtml(normalizeStudentAdm(student))})</option>`).join('');
    if (studentSelect) studentSelect.innerHTML = '<option value="">Select student</option>' + options;
    if (structureStudentSelect) structureStudentSelect.innerHTML = '<option value="">Optional student</option>' + allStudents.map((student) => `<option value="${student.id}">${escapeHtml(student.name)} (${escapeHtml(normalizeStudentAdm(student))})</option>`).join('');
    if (statementStudentSelect) statementStudentSelect.innerHTML = '<option value="">All students</option>' + allStudents.map((student) => `<option value="${student.id}">${escapeHtml(student.name)} (${escapeHtml(normalizeStudentAdm(student))})</option>`).join('');
  } catch (error) {
    console.error('Finance student load error:', error);
  }
}

function renderFinanceChart() {
  const feed = document.getElementById('activityFeed');
  if (feed) renderActivityFeed();
  loadFeeEntryChart();
}

async function loadFeeEntryChart() {
  const container = document.getElementById('feeEntryChart');
  if (!container) return;

  try {
    const response = await fetchWithAuth('/finance/overview-charts');
    if (!response.ok) throw new Error('Failed to load fee chart');
    const data = await response.json();
    const colors = {
      'Form 1': '#1d4ed8',
      'Form 2': '#0ea5e9',
      'Form 3': '#047857',
      'Form 4': '#7c3aed'
    };
    const paidValues = data.forms.map((form) => Number(data.paid?.[form] || 0));
    const maxPaid = Math.max(...paidValues, 1);

    const items = data.forms.map((form) => {
      const paid = Number(data.paid?.[form] || 0);
      const width = maxPaid > 0 ? Math.min(100, Math.round((paid / maxPaid) * 100)) : 0;
      return `
        <div class="fee-entry-bar-row">
          <span class="fee-entry-bar-label">${escapeHtml(form)}</span>
          <span class="fee-entry-bar-track"><span class="fee-entry-bar" style="width:${width}%;background:${colors[form] || '#2563eb'}"></span></span>
          <strong class="fee-entry-bar-value">${money(paid)}</strong>
        </div>`;
    }).join('');

    const totalPaid = paidValues.reduce((sum, value) => sum + value, 0);

    container.innerHTML = `
      <div class="fee-entry-chart-shell">
        <div class="fee-entry-chart-title">Fee payments by form</div>
        <div class="fee-entry-chart-meta">Live payment totals from the finance ledger.</div>
        <div class="fee-entry-chart-items">${items}</div>
        <div class="fee-entry-chart-footer">Total paid this term: ${money(totalPaid)}</div>
      </div>`;
  } catch (error) {
    console.error('Fee entry chart load error:', error);
    container.innerHTML = '<div class="fee-entry-chart-empty">Unable to load fee payment overview.</div>';
  }
}

async function loadFinanceBalances() {
  const body = document.getElementById('financeBalancesBody');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="8">Loading balances...</td></tr>';
  try {
    const response = await fetchWithAuth('/finance/balances');
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load balances');
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="8">No balances found.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.admissionNumber || row.admission_number || '')}</td>
        <td>${escapeHtml(row.name || row.student_name || '')}</td>
        <td>${escapeHtml(row.className || row.class_name || '')}</td>
        <td>${escapeHtml(row.stream || '')}</td>
        <td>${money(row.total_charged || row.total_charges)}</td>
        <td>${money(row.total_paid || row.paid)}</td>
        <td><strong>${money(row.balance)}</strong></td>
        <td><button class="small-button" data-open-statement="${row.student_id || row.id}">Statement</button></td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Finance balances load error:', error);
    body.innerHTML = '<tr><td colspan="8">Unable to load balances.</td></tr>';
  }
}

async function loadFinancePayments() {
  const body = document.getElementById('financePaymentsBody');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="8">Loading payments...</td></tr>';
  try {
    const response = await fetchWithAuth('/finance/payments');
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load payments');
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="8">No payment records found.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((payment) => `
      <tr>
        <td>${escapeHtml(payment.receipt_number || payment.id)}</td>
        <td>${escapeHtml(payment.admission_number || '')}</td>
        <td>${escapeHtml(payment.student_name || '')}</td>
        <td>${escapeHtml(payment.class_name || '')}</td>
        <td>${money(payment.amount)}</td>
        <td>${escapeHtml(payment.payment_method || '')}</td>
        <td>${payment.payment_date || payment.created_at ? new Date(payment.payment_date || payment.created_at).toLocaleDateString() : ''}</td>
        <td><button class="small-button" data-open-receipt="${payment.id}">Open receipt</button></td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Finance payments load error:', error);
    body.innerHTML = '<tr><td colspan="8">Unable to load payments.</td></tr>';
  }
}

function addFeeCategoryRow(category = '', amount = '') {
  const list = document.getElementById('feeCategories');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'fee-category-row';
  row.innerHTML = `
    <label>Category<input name="category" value="${escapeHtml(category)}" placeholder="Tuition"></label>
    <label>Amount<input name="amount" type="number" min="1" step="1" value="${escapeHtml(amount)}" placeholder="40000"></label>
    <button type="button" class="small-button" data-remove-fee-category>Remove</button>
  `;
  list.appendChild(row);
}

function setupFeeCategories() {
  const list = document.getElementById('feeCategories');
  if (!list || list.children.length) return;
  DEFAULT_FEE_CATEGORIES.forEach(([category, amount]) => addFeeCategoryRow(category, amount));
}

function updateFeeStructureTargetFields() {
  const target = document.getElementById('feeStructureTarget')?.value;
  const classGroup = document.getElementById('feeStructureClass')?.closest('.admin-finance-form-group');
  const studentGroup = document.getElementById('feeStructureStudent')?.closest('.admin-finance-form-group');
  if (classGroup) classGroup.style.display = target === 'class' || target === 'students' ? '' : 'none';
  if (studentGroup) studentGroup.style.display = target === 'students' ? '' : 'none';
}

async function postFeeStructure(form) {
  const formData = new FormData(form);
  const target = formData.get('target');
  const className = formData.get('className');
  const studentId = formData.get('student_id');
  const categories = Array.from(document.querySelectorAll('.fee-category-row')).map((row) => ({
    category: row.querySelector('input[name="category"]')?.value.trim(),
    amount: Number(row.querySelector('input[name="amount"]')?.value)
  })).filter((item) => item.category && item.amount > 0);

  if (!categories.length) {
    showAlert('Add at least one fee category.', 'error');
    return;
  }

  try {
    let posted = 0;
    for (const item of categories) {
      const payload = {
        target,
        className,
        student_ids: target === 'students' && studentId ? [studentId] : [],
        description: item.category,
        category: item.category,
        amount: item.amount,
        academic_year: formData.get('academic_year'),
        term: formData.get('term'),
        due_date: formData.get('due_date') || null
      };
      const response = await fetchWithAuth('/finance/charges', { method: 'POST', body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Could not post ${item.category}`);
      posted += Number(data.count || 0);
    }

    const docData = new FormData();
    docData.append('type', 'feestructure');
    docData.append('title', `${formData.get('term')} Fee Structure`);
    docData.append('className', className || '');
    docData.append('term', formData.get('term') || '');
    docData.append('description', `Posted ${categories.length} fee categories`);
    docData.append('categories', JSON.stringify(categories));
    await fetchWithAuth('/finance/docs', { method: 'POST', body: docData });
    localStorage.setItem('financeDocsUpdated', String(Date.now()));

    showAlert(`Posted fee structure to ${posted} student records.`, 'success');
    loadFinanceSummary();
    loadFinanceBalances();
  } catch (error) {
    showAlert(error.message || 'Could not post fee structure', 'error');
  }
}

async function generateFeeStatement(form) {
  const formData = new FormData(form);
  const studentId = formData.get('student_id');
  const payload = {
    student_ids: studentId ? [studentId] : [],
    term: formData.get('term') || null,
    academic_year: formData.get('academic_year') || null
  };
  try {
    const response = await fetchWithAuth('/finance/generate-fee-statement', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not generate statement');
    const result = document.getElementById('statementResult');
    if (result) {
      result.innerHTML = (data.created || []).slice(0, 6).map((item) => `
        <div class="mini-card">
          <strong>Statement generated</strong>
          <span>Student ID ${item.student_id} - ${money(item.totals?.balance || 0)} balance</span>
        </div>
      `).join('') || '<div class="mini-card"><strong>No statements</strong><span>No matching student records were found.</span></div>';
    }
    showAlert(`Generated ${data.created?.length || 0} fee statement(s).`, 'success');
  } catch (error) {
    showAlert(error.message || 'Could not generate statement', 'error');
  }
}

function openReceipt(paymentId) {
  if (!paymentId) return;
  window.open(`receipt_view.html?receiptId=${encodeURIComponent(paymentId)}&mode=pdf`, '_blank');
}

function openStatement(studentId) {
  if (!studentId) {
    showAlert('Choose a student first.', 'error');
    return;
  }
  window.open(`feestatement.html?student_id=${encodeURIComponent(studentId)}`, '_blank');
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
    feed.innerHTML = '<div class="mini-card"><strong></strong><span></span></div>';
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
      adminState.formPaymentSummary = stats.formPaymentSummary || [];
      renderStatsCards();
      renderFinanceOverviewChart();
      renderAcademicPerformanceChart();
      renderFinanceTrendChart();
      renderApplicationSummary();
    }

    if (studentsRes.ok) {
      const studentsData = await studentsRes.json();
      adminState.students = studentsData.students || [];
      renderStudents();
      renderAcademicsPage();
    }
  } catch (error) {
    console.error('Admin portal load error:', error);
    renderStatsCards();
    renderDashboardChart();
  }

  renderFinanceOverviewChart();
  renderAcademicPerformanceChart();
}

function renderStudents() {
  const body = document.getElementById('studentsTableBody');
  if (!body) return;

  if (!adminState.students.length) {
    body.innerHTML = '<tr><td colspan="8">No student accounts found.</td></tr>';
    return;
  }

  body.innerHTML = adminState.students.map((student) => `
    <tr>
      <td>${student.name || '—'}</td>
      <td>${student.username || '—'}</td>
      <td>${student.admissionNumber || '—'}</td>
      <td>${student.className || '—'}</td>
      <td>${student.role || 'student'}</td>
      <td>${student.subject || '—'}</td>
      <td><span class="status-pill ${student.active ? 'active' : 'inactive'}">${student.active ? 'Active' : 'Inactive'}</span></td>
      <td>${student.active ? `<a class="action-link" href="#" data-id="${student.id}">Deactivate</a>` : '—'}</td>
    </tr>
  `).join('');
}

/* Student Records Manager */
function openStudentRecordsManager() {
  const panel = document.getElementById('studentRecordsManager');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? '' : 'none';
  if (panel.style.display !== 'none') loadStudentRecords();
}

async function loadStudentRecords() {
  const body = document.getElementById('studentRecordsBody');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="5">Loading records...</td></tr>';
  try {
    // Ensure we have current students
    if (!adminState.students || !adminState.students.length) {
      const resp = await fetchWithAuth('/admin/students');
      if (resp.ok) {
        const data = await resp.json();
        adminState.students = data.students || [];
      }
    }

    const classFilter = document.getElementById('recordManagerClassSelect')?.value || '';
    const search = (document.getElementById('recordManagerSearch')?.value || '').trim().toLowerCase();
    const rows = (adminState.students || []).filter((s) => {
      const matchesClass = !classFilter || (s.className || s.class_name || '').toString() === classFilter;
      const adm = (s.admissionNumber || s.admission_number || s.adm || '').toString();
      const name = (s.name || '').toLowerCase();
      const matchesSearch = !search || name.includes(search) || adm.toLowerCase().includes(search);
      return matchesClass && matchesSearch;
    });

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5">No matching student records.</td></tr>';
      return;
    }

    body.innerHTML = rows.map((s) => `
      <tr data-student-id="${s.id}">
        <td>${escapeHtml(s.admissionNumber || s.admission_number || s.adm || '')}</td>
        <td>${escapeHtml(s.name || '')}</td>
        <td>${escapeHtml(s.className || s.class_name || '')}</td>
        <td>${escapeHtml(s.stream || '')}</td>
        <td>
          <button class="small-button" data-edit-student="${s.id}">Edit</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    body.innerHTML = '<tr><td colspan="5">Unable to load student records.</td></tr>';
    console.error('loadStudentRecords error', error);
  }
}

function openEditStudentModal(studentId) {
  const student = (adminState.students || []).find((s) => String(s.id) === String(studentId));
  if (!student) {
    showAlert('Student not found', 'error');
    return;
  }

  createAdminModal({
    title: `Edit student: ${student.name || ''}`,
    description: 'Update student personal, academic, and finance tags. Changes will be saved to the server if available.',
    fields: [
      { label: 'Name', name: 'name', required: true, placeholder: student.name || '' },
      { label: 'Admission number', name: 'admissionNumber', placeholder: student.admissionNumber || student.admission_number || student.adm || '' },
      { label: 'Role', name: 'role', type: 'select', options: [
          { value: 'student', label: 'Student' },
          { value: 'lecturer', label: 'Lecturer' },
          { value: 'rba', label: 'RBA' },
          { value: 'admin', label: 'Admin' }
        ],
        value: student.role || 'student'
      },
      { label: 'Subject', name: 'subject', type: 'select', options: [
          { value: '', label: 'None' },
          ...(window.EIGHT_FOUR_FOUR_SUBJECTS || []).map((subject) => ({ value: subject, label: subject }))
        ]
      },
      { label: 'Class', name: 'className', required: true, placeholder: student.className || student.class_name || '' },
      { label: 'Stream', name: 'stream', placeholder: student.stream || '' },
      { label: 'Active', name: 'active', type: 'select', options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }], value: student.active ? 'true' : 'false' }
    ],
    submitLabel: 'Save changes',
    onSubmit: async (data) => {
      // normalize
      data.active = data.active === 'true' || data.active === true || data.active === 'on';
      try {
        const response = await fetchWithAuth(`/admin/students/${encodeURIComponent(studentId)}`, {
          method: 'PUT',
          body: JSON.stringify(data)
        });
        const respData = await response.json();
        if (response.ok) {
          // update local state
          const idx = (adminState.students || []).findIndex((s) => String(s.id) === String(studentId));
          if (idx >= 0) adminState.students[idx] = { ...adminState.students[idx], ...data };
          renderStudents();
          loadStudentRecords();
          showAlert(respData.message || 'Student updated', 'success');
        } else {
          // fallback: apply locally
          const idx = (adminState.students || []).findIndex((s) => String(s.id) === String(studentId));
          if (idx >= 0) adminState.students[idx] = { ...adminState.students[idx], ...data };
          renderStudents();
          loadStudentRecords();
          showAlert(respData.message || 'Could not update on server; changes applied locally', 'warning');
        }
      } catch (error) {
        console.error('update student error', error);
        showAlert('Unable to save student changes', 'error');
      }
    }
  });
}

let selectedAcademicsStream = 'A';

function normalizeStream(stream) {
  return String(stream || '').trim().replace(/^stream\s*/i, '').toUpperCase();
}

function populateAcademicSubjectSelect() {
  const select = document.getElementById('academicsSubjectSelect');
  if (!select) return;
  const subjects = window.EIGHT_FOUR_FOUR_SUBJECTS || [];
  select.innerHTML = subjects.map((subject) => `<option value="${subject}">${subject}</option>`).join('');
  if (!select.value && subjects.length) {
    select.value = subjects[0];
  }
}

async function saveAcademicsSheet() {
  const body = document.getElementById('academicsStudentsBody');
  const termSelect = document.getElementById('academicsTermSelect');
  const yearInput = document.getElementById('academicsYearInput');
  const examInput = document.getElementById('academicsExamTypeInput');
  if (!body) return;

  const rows = Array.from(body.querySelectorAll('tr[data-student-id]'));
  const term = termSelect?.value || 'Term 1';
  const academicYear = yearInput?.value || new Date().getFullYear();
  const examType = examInput?.value || 'End Term';

  if (!rows.length) {
    showAlert('No students are loaded for this stream.', 'error');
    return;
  }

  const subjectsPayload = ADMIN_MARK_SUBJECTS.map((subject) => {
    const entries = rows.map((row) => {
      const studentId = row.dataset.studentId;
      const input = row.querySelector(`.academics-mark-input[data-subject-key="${subject.key}"]`);
      const rawValue = input?.value;
      if (!studentId || rawValue === '' || rawValue === null) return null;
      return { student_id: Number(studentId), score: Number(rawValue) };
    }).filter(Boolean);
    return { subject, entries };
  }).filter((item) => item.entries.length);

  if (!subjectsPayload.length) {
    showAlert('Enter at least one mark before saving.', 'error');
    return;
  }

  try {
    let savedCount = 0;
    for (const item of subjectsPayload) {
      const response = await fetchWithAuth('/academics/entry/results', {
        method: 'POST',
        body: JSON.stringify({ subject: item.subject.api, term, academicYear, entries: item.entries, examType })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Could not save ${item.subject.label}`);
      savedCount += item.entries.length;
    }
    showAlert(`Saved ${savedCount} marks and synced transcripts.`, 'success');
    loadAcademicDashboard();
  } catch (error) {
    showAlert(error.message || 'Could not save marks', 'error');
  }
}

function setupAcademicUploadOptions() {
  const subjectSelect = document.getElementById('academicUploadSubject');
  const classSelect = document.getElementById('academicUploadClass');
  if (subjectSelect) {
    const subjects = ADMIN_MARK_SUBJECTS.map((subject) => subject.api);
    subjectSelect.innerHTML = '<option value="">General</option>' + subjects.map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`).join('');
  }
  if (classSelect) {
    const forms = window.SCHOOL_FORMS || ['Form 1', 'Form 2', 'Form 3', 'Form 4'];
    classSelect.innerHTML = '<option value="">All classes</option>' + forms.map((form) => `<option value="${escapeHtml(form)}">${escapeHtml(form)}</option>`).join('');
  }
}

function applyAdminQueryDefaults() {
  const params = new URLSearchParams(window.location.search);
  const className = params.get('className');
  if (!className) return;
  ['academicUploadClass', 'financeEntryClass', 'feeStructureClass'].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.value = className;
  });
  const heading = document.querySelector('[data-class-context]');
  if (heading) heading.textContent = className;
}

function updateMarksRowTotals(row) {
  const scores = Array.from(row.querySelectorAll('.academics-mark-input'))
    .map((input) => Number(input.value))
    .filter((value) => Number.isFinite(value));
  const total = scores.reduce((sum, value) => sum + value, 0);
  const avg = scores.length ? total / scores.length : 0;
  const grade = scores.length ? gradeForAverage(avg) : 'N/A';
  const totalCell = row.querySelector('[data-total-cell]');
  const avgCell = row.querySelector('[data-avg-cell]');
  const gradeCell = row.querySelector('[data-grade-cell]');
  if (totalCell) totalCell.textContent = scores.length ? total.toFixed(0) : '-';
  if (avgCell) avgCell.textContent = scores.length ? avg.toFixed(2) : '-';
  if (gradeCell) gradeCell.innerHTML = scores.length ? `<span class="grade-chip grade-${grade.charAt(0)}">${grade}</span>` : '-';
}


function getSavedSheets() {
  return JSON.parse(localStorage.getItem('academicsSavedSheets') || '[]');
}

function renderSavedSheets() {
  const list = document.getElementById('savedSheetsList');
  if (!list) return;
  const saved = getSavedSheets();
  if (!saved.length) {
    list.innerHTML = '<div class="saved-sheet-item"><span>No saved sheets yet.</span></div>';
    return;
  }
  const filter = document.getElementById('savedSheetFilter')?.value.trim().toLowerCase() || '';
  const items = saved.filter((sheet) => !filter || sheet.title.toLowerCase().includes(filter) || sheet.stream.toLowerCase().includes(filter));
  if (!items.length) {
    list.innerHTML = '<div class="saved-sheet-item"><span>No matching sheets.</span></div>';
    return;
  }
  list.innerHTML = items.map((sheet) => `
    <div class="saved-sheet-item">
      <div>
        <strong>${escapeHtml(sheet.title)}</strong>
        <div>${escapeHtml(sheet.stream)} • ${escapeHtml(sheet.term)} • ${escapeHtml(sheet.year)}</div>
      </div>
      <button type="button" class="secondary-button" data-load-sheet="${escapeHtml(sheet.id)}">Load</button>
    </div>
  `).join('');
}

function saveCurrentSheet() {
  const params = new URLSearchParams(window.location.search);
  const classFilter = params.get('className') || 'Form 1';
  const term = document.getElementById('academicsTermSelect')?.value || 'Term 1';
  const year = document.getElementById('academicsYearInput')?.value || String(new Date().getFullYear());
  const stream = selectedAcademicsStream;
  const title = `${classFilter} ${stream} ${term} ${year}`;
  const saved = getSavedSheets();
  const id = `sheet-${Date.now()}`;
  saved.unshift({ id, title, className: classFilter, stream, term, year, savedAt: new Date().toISOString() });
  localStorage.setItem('academicsSavedSheets', JSON.stringify(saved.slice(0, 20)));
  renderSavedSheets();
  showAlert('Sheet saved locally. Load it from the saved sheets panel.', 'success');
}

function loadSavedSheet(id) {
  const saved = getSavedSheets();
  const sheet = saved.find((item) => item.id === id);
  if (!sheet) return;
  selectedAcademicsStream = sheet.stream;
  document.getElementById('academicsTermSelect').value = sheet.term;
  document.getElementById('academicsYearInput').value = sheet.year;
  renderAcademicsPage();
  showAlert(`Loaded saved sheet: ${sheet.title}`, 'success');
}

function renderAcademicsPage() {
  const streamRow = document.getElementById('academicsStreamRow');
  const title = document.getElementById('academicsSheetTitle');
  const counts = document.getElementById('academicsStudentsCount');
  const subjectsCount = document.getElementById('academicsSubjectsCount');
  const tableHead = document.getElementById('academicsTableHead');
  const body = document.getElementById('academicsStudentsBody');

  if (!streamRow || !title || !counts || !subjectsCount || !tableHead || !body) return;

  const subjects = ADMIN_MARK_SUBJECTS;
  tableHead.innerHTML = `
    <tr>
      <th>Adm No.</th>
      <th>Student Name</th>
      <th>Class</th>
      <th>Stream</th>
      ${subjects.map((subject) => `<th>${subject.label}</th>`).join('')}
      <th>Total</th>
      <th>Avg</th>
      <th>Grade</th>
      <th>Remarks</th>
    </tr>
  `;

  const params = new URLSearchParams(window.location.search);
  const classFilter = params.get('className');
  const filteredStudents = adminState.students.filter((student) => {
    const studentStream = normalizeStream(student.stream);
    const studentClass = student.className || student.class_name || '';
    const matchesClass = !classFilter || studentClass === classFilter || studentClass.startsWith(`${classFilter} `);
    const matchesStream = !selectedAcademicsStream || studentStream === selectedAcademicsStream || studentStream === `STREAM ${selectedAcademicsStream}`;
    return matchesClass && matchesStream;
  });

  if (!filteredStudents.length) {
    body.innerHTML = '<tr><td colspan="' + (subjects.length + 8) + '">No students found for this stream yet.</td></tr>';
    counts.textContent = '0';
    subjectsCount.textContent = String(subjects.length);
    title.textContent = `${classFilter ? `${classFilter} ` : ''}Stream ${selectedAcademicsStream} marks sheet`;
    return;
  }

  body.innerHTML = filteredStudents.map((student) => {
    const subjectCells = subjects.map((subject) => `<td><input type="number" class="academics-mark-input" min="0" max="100" step="1" data-student-id="${student.id}" data-subject-key="${subject.key}" aria-label="${subject.label} mark" placeholder="-" /></td>`).join('');
    return `
      <tr data-student-id="${student.id}">
        <td>${student.admissionNumber || student.admission_number || '—'}</td>
        <td>${student.name || '—'}</td>
        <td>${student.className || student.class_name || '—'}</td>
        <td>${student.stream || '—'}</td>
        ${subjectCells}
        <td data-total-cell>-</td>
        <td data-avg-cell>-</td>
        <td data-grade-cell>-</td>
        <td><input type="text" class="academics-remark-input" placeholder="Ready"></td>
      </tr>
    `;
  }).join('');

  counts.textContent = String(filteredStudents.length);
  subjectsCount.textContent = String(subjects.length);
  title.textContent = `${classFilter ? `${classFilter} ` : ''}Stream ${selectedAcademicsStream} marks sheet`;
  body.querySelectorAll('.academics-mark-input').forEach((input) => {
    input.addEventListener('input', () => updateMarksRowTotals(input.closest('tr')));
  });
}

function setupAcademicsSavedSheets() {
  const createButton = document.getElementById('createNewSheetButton');
  const filterInput = document.getElementById('savedSheetFilter');
  if (createButton) createButton.addEventListener('click', openNewAcademicSheet);
  if (filterInput) filterInput.addEventListener('input', renderSavedSheets);
  document.addEventListener('click', (event) => {
    const loadButton = event.target.closest('[data-load-sheet]');
    if (!loadButton) return;
    event.preventDefault();
    loadSavedSheet(loadButton.dataset.loadSheet);
  });
  renderSavedSheets();
}

function openNewAcademicSheet() {
  const params = new URLSearchParams(window.location.search);
  const classFilter = params.get('className') || 'Form 1';
  const stream = selectedAcademicsStream || 'A';
  window.location.href = `admin-stream-entry.html?className=${encodeURIComponent(classFilter)}&stream=${encodeURIComponent(stream)}`;
}

function selectAcademicsStream(stream) {
  selectedAcademicsStream = stream;
  document.querySelectorAll('.academics-stream-card').forEach((button) => {
    button.classList.toggle('active', button.dataset.stream === stream);
  });
  renderAcademicsPage();
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
  if (action === 'refresh-finance') {
    await Promise.all([loadFinanceSummary(), loadFinanceBalances(), loadFinancePayments(), loadFinanceStudents()]);
    showAlert('Finance records refreshed.', 'success');
    return;
  }

  if (action === 'upload-academic-document') {
    window.location.href = 'admin-uploads.html';
    return;
  }

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
      acc[element.name] = element.type === 'checkbox' ? element.checked : element.value;
      return acc;
    }, {});
    try {
      const response = await fetchWithAuth('/admin/settings', { method: 'POST', body: JSON.stringify(values) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Settings could not be saved');
      localStorage.setItem('adminPortalSettings', JSON.stringify(values));
      showAlert(data.message || 'Settings saved', 'success');
    } catch (error) {
      showAlert(error.message || 'Settings could not be saved', 'error');
    }
  }
}

async function loadAdminSettings() {
  const form = document.querySelector('.admin-settings-form');
  if (!form) return;
  try {
    const response = await fetchWithAuth('/admin/settings');
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load settings');
    Object.entries(data.settings || {}).forEach(([key, value]) => {
      const input = form.querySelector(`[name="${key}"]`);
      if (!input) return;
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else input.value = value ?? '';
    });
  } catch (error) {
    const cached = JSON.parse(localStorage.getItem('adminPortalSettings') || '{}');
    Object.entries(cached).forEach(([key, value]) => {
      const input = form.querySelector(`[name="${key}"]`);
      if (!input) return;
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else input.value = value ?? '';
    });
  }
}

function renderTablePreview(container, rows, options = {}) {
  if (!container) return;
  if (!rows || !rows.length) {
    container.innerHTML = '<div class="empty-chart">No rows returned.</div>';
    return;
  }
  const columns = Object.keys(rows[0]);
  const editable = Boolean(options.editable);
  container.innerHTML = `
    <div class="sheet-table-wrapper">
      <table class="admin-table sheet-table">
        <thead><tr>${editable ? '<th>Actions</th>' : ''}${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>
            ${editable ? `<td class="table-actions">
              <button class="small-button" type="button" data-db-edit="${escapeHtml(row.id)}">Edit</button>
              <button class="small-button danger" type="button" data-db-delete="${escapeHtml(row.id)}">Delete</button>
            </td>` : ''}
            ${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;

  if (editable) {
    container.querySelectorAll('[data-db-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const row = adminState.database.rows.find((item) => String(item.id) === String(button.dataset.dbEdit));
        openDatabaseRecordForm(row || null);
      });
    });
    container.querySelectorAll('[data-db-delete]').forEach((button) => {
      button.addEventListener('click', () => deleteDatabaseRecord(button.dataset.dbDelete));
    });
  }
}

async function loadDatabasePage() {
  const tableList = document.getElementById('databaseTableList');
  if (!tableList) return;
  tableList.innerHTML = '<div class="mini-card"><strong>Loading tables...</strong><span>Please wait</span></div>';
  try {
    const response = await fetchWithAuth('/admin/database');
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load database');
    setText('databaseName', data.database || 'Database');
    tableList.innerHTML = (data.tables || []).map((table) => `
      <button class="database-table-button" type="button" data-table-name="${escapeHtml(table.tableName)}">
        <strong>${escapeHtml(table.tableName)}</strong>
        <span>${Number(table.approxRows || 0).toLocaleString()} rows</span>
      </button>
    `).join('');
    document.querySelectorAll('.database-table-button').forEach((button) => {
      button.addEventListener('click', () => {
        openDatabaseTable(button.dataset.tableName);
      });
    });
    const firstTableButton = document.querySelector('.database-table-button');
    if (firstTableButton) {
      openDatabaseTable(firstTableButton.dataset.tableName);
    }
  } catch (error) {
    tableList.innerHTML = `<div class="empty-chart">${escapeHtml(error.message || 'Could not load tables')}</div>`;
  }
}

async function openDatabaseTable(tableName) {
  const title = document.getElementById('databasePreviewTitle');
  const meta = document.getElementById('databasePreviewMeta');
  const output = document.getElementById('databasePreview');
  if (title) title.textContent = tableName;
  if (meta) meta.textContent = 'Loading table preview...';
  try {
    const response = await fetchWithAuth(`/admin/database/tables/${encodeURIComponent(tableName)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not open table');
    adminState.database = {
      tableName: data.tableName,
      columns: data.columns || [],
      rows: data.rows || [],
      editingId: null,
      editable: Boolean(data.editable)
    };
    if (meta) meta.textContent = `${data.columns.length} columns, first ${data.rows.length} rows${data.editable ? ' · editable' : ' · view-only'}`;
    renderDatabaseRecordFormShell();
    renderTablePreview(output, data.rows, { editable: data.editable });
  } catch (error) {
    if (output) output.innerHTML = `<div class="empty-chart">${escapeHtml(error.message || 'Could not open table')}</div>`;
  }
}

function renderDatabaseRecordFormShell() {
  const form = document.getElementById('databaseRecordForm');
  const fields = document.getElementById('databaseRecordFields');
  const submit = document.getElementById('databaseRecordSubmit');
  if (!form || !fields) return;
  form.classList.toggle('hidden', !adminState.database.editable);
  if (!adminState.database.editable) {
    fields.innerHTML = '';
    return;
  }
  if (submit) submit.textContent = 'Create record';
  adminState.database.editingId = null;
  fields.innerHTML = adminState.database.columns
    .filter((column) => column.columnName !== 'id')
    .map((column) => `
      <label>${escapeHtml(column.columnName)}
        <input name="${escapeHtml(column.columnName)}" placeholder="${escapeHtml(column.dataType || '')}">
      </label>
    `).join('');
}

function openDatabaseRecordForm(row) {
  const form = document.getElementById('databaseRecordForm');
  const submit = document.getElementById('databaseRecordSubmit');
  if (!form || !adminState.database.editable) return;
  adminState.database.editingId = row?.id || null;
  if (submit) submit.textContent = row ? `Update #${row.id}` : 'Create record';
  form.querySelectorAll('input, textarea, select').forEach((input) => {
    input.value = row ? (row[input.name] ?? '') : '';
  });
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function submitDatabaseRecord() {
  const form = document.getElementById('databaseRecordForm');
  if (!form || !adminState.database.tableName) return;
  const payload = Object.fromEntries(new FormData(form).entries());
  const id = adminState.database.editingId;
  const endpoint = id
    ? `/admin/database/tables/${encodeURIComponent(adminState.database.tableName)}/${encodeURIComponent(id)}`
    : `/admin/database/tables/${encodeURIComponent(adminState.database.tableName)}`;
  const response = await fetchWithAuth(endpoint, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Record could not be saved');
  showAlert(data.message || 'Record saved', 'success');
  await openDatabaseTable(adminState.database.tableName);
}

async function deleteDatabaseRecord(id) {
  if (!adminState.database.tableName || !id) return;
  if (!confirm(`Delete record #${id} from ${adminState.database.tableName}?`)) return;
  const response = await fetchWithAuth(`/admin/database/tables/${encodeURIComponent(adminState.database.tableName)}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const data = await response.json();
  if (!response.ok) {
    showAlert(data.message || 'Record could not be deleted', 'error');
    return;
  }
  showAlert(data.message || 'Record deleted', 'success');
  await openDatabaseTable(adminState.database.tableName);
}

async function runDatabaseConsole() {
  const sql = document.getElementById('databaseQueryInput')?.value;
  const output = document.getElementById('databaseQueryResult');
  if (output) output.innerHTML = '<div class="mini-card"><strong>Running query...</strong><span>Please wait</span></div>';
  try {
    const response = await fetchWithAuth('/admin/database/query', { method: 'POST', body: JSON.stringify({ sql }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Query failed');
    renderTablePreview(output, data.rows);
  } catch (error) {
    if (output) output.innerHTML = `<div class="empty-chart">${escapeHtml(error.message || 'Query failed')}</div>`;
  }
}

function setupTranscriptSheetPage() {
  const root = document.getElementById('transcriptSheetRoot');
  if (!root) return;
  const form = getSelectedManagementForm();
  const className = `Form ${form}`;
  setText('transcriptSheetTitle', `${className} transcript sheets`);
  const newSheet = document.getElementById('createNewTranscriptSheet');
  if (newSheet) newSheet.href = `admin-academics.html?className=${encodeURIComponent(className)}`;
}

function exportTranscriptSheet() {
  const form = getSelectedManagementForm();
  const className = `Form ${form}`;
  const rows = adminState.students.filter((student) => {
    const studentClass = student.className || student.class_name || '';
    return studentClass === className || studentClass.startsWith(`${className} `);
  });
  const header = ['Adm', 'Name', 'Class', 'Stream', ...ADMIN_MARK_SUBJECTS.map((subject) => subject.label), 'Total', 'Avg', 'Grade'];
  const body = rows.map((student) => [
    normalizeStudentAdm(student),
    student.name || '',
    student.className || student.class_name || className,
    student.stream || '',
    ...ADMIN_MARK_SUBJECTS.map(() => ''),
    '',
    '',
    ''
  ]);
  const csv = [header, ...body].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${className.toLowerCase().replace(/\s+/g, '-')}-transcript-sheet.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
  showAlert(`Existing ${className} transcript sheet opened as an Excel-compatible CSV.`, 'success');
}

document.addEventListener('DOMContentLoaded', () => {
  normalizeAdminSidebar();
  applyManagementContext();
  setupTranscriptSheetPage();
  loadAdminData();
  loadAcademicDashboard();
  loadFinanceSummary();
  loadAcademicEntryStudents();
  loadFinanceStudents();
  loadFinanceBalances();
  loadFinancePayments();
  setupFeeCategories();
  setupAcademicUploadOptions();
  applyAdminQueryDefaults();
  loadAdminSettings();
  loadDatabasePage();
  setupAcademicsSavedSheets();

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
        loadFinanceBalances();
        loadFinancePayments();
        if (data.id) openReceipt(data.id);
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

  const feeStructureClass = document.getElementById('feeStructureClass');
  if (feeStructureClass) {
    feeStructureClass.addEventListener('change', loadFinanceStudents);
  }

  const feeStructureTarget = document.getElementById('feeStructureTarget');
  if (feeStructureTarget) {
    feeStructureTarget.addEventListener('change', updateFeeStructureTargetFields);
  }

  updateFeeStructureTargetFields();

  const addFeeCategoryButton = document.getElementById('addFeeCategoryButton');
  if (addFeeCategoryButton) {
    addFeeCategoryButton.addEventListener('click', () => addFeeCategoryRow());
  }

  const feeStructureForm = document.getElementById('feeStructureForm');
  if (feeStructureForm) {
    feeStructureForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await postFeeStructure(feeStructureForm);
    });
  }

  const statementGenerateForm = document.getElementById('statementGenerateForm');
  if (statementGenerateForm) {
    statementGenerateForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await generateFeeStatement(statementGenerateForm);
    });
  }

  const openStudentStatementButton = document.getElementById('openStudentStatementButton');
  if (openStudentStatementButton) {
    openStudentStatementButton.addEventListener('click', () => {
      openStatement(document.getElementById('statementStudent')?.value);
    });
  }

  const financeDocumentForm = document.getElementById('financeDocumentForm');
  if (financeDocumentForm) {
    financeDocumentForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(financeDocumentForm);
      try {
        const response = await fetchWithAuth('/finance/docs', { method: 'POST', body: formData });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Upload failed');
        showAlert(data.message || 'Finance document uploaded', 'success');
        financeDocumentForm.reset();
        localStorage.setItem('financeDocsUpdated', String(Date.now()));
      } catch (error) {
        showAlert(error.message || 'Could not upload finance document', 'error');
      }
    });
  }

  const transcriptLookupForm = document.getElementById('transcriptLookupForm');
  if (transcriptLookupForm) {
    transcriptLookupForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const adm = document.getElementById('transcriptAdmInput')?.value.trim();
      if (!adm) return;
      const result = document.getElementById('transcriptLookupResult');
      if (result) {
        result.innerHTML = `<div class="mini-card"><strong>${escapeHtml(adm)}</strong><span>Opening transcript record...</span></div>`;
      }
      window.open(`student-transcript.html?adm=${encodeURIComponent(adm)}`, '_blank');
    });
  }

  const databaseQueryForm = document.getElementById('databaseQueryForm');
  if (databaseQueryForm) {
    databaseQueryForm.addEventListener('submit', (event) => {
      event.preventDefault();
      runDatabaseConsole();
    });
  }

  const databaseRecordForm = document.getElementById('databaseRecordForm');
  if (databaseRecordForm) {
    databaseRecordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await submitDatabaseRecord();
      } catch (error) {
        showAlert(error.message || 'Record could not be saved', 'error');
      }
    });
  }

  const databaseRecordCancel = document.getElementById('databaseRecordCancel');
  if (databaseRecordCancel) {
    databaseRecordCancel.addEventListener('click', () => renderDatabaseRecordFormShell());
  }

  const saveAcademicsButton = document.getElementById('saveAcademicsMarksButton');
  if (saveAcademicsButton) {
    saveAcademicsButton.addEventListener('click', saveAcademicsSheet);
  }
  const downloadAcademicsButton = document.getElementById('downloadAcademicsSheetButton');
  if (downloadAcademicsButton) {
    downloadAcademicsButton.addEventListener('click', (e) => { e.preventDefault(); downloadAcademicsSheet(); });
  }

  const openRecordManagerButton = document.getElementById('openRecordManagerButton');
  if (openRecordManagerButton) openRecordManagerButton.addEventListener('click', (e) => { e.preventDefault(); openStudentRecordsManager(); });

  const recordManagerSearch = document.getElementById('recordManagerSearch');
  if (recordManagerSearch) recordManagerSearch.addEventListener('input', () => loadStudentRecords());

  const recordManagerClassSelect = document.getElementById('recordManagerClassSelect');
  if (recordManagerClassSelect) recordManagerClassSelect.addEventListener('change', () => loadStudentRecords());

  const form = document.getElementById('studentForm');
  if (form) {
    const roleSelect = document.getElementById('studentRoleSelect');
    const subjectLabel = document.getElementById('studentSubjectLabel');
    const subjectSelect = document.getElementById('studentSubjectSelect');

    function refreshStudentSubjectField() {
      const role = roleSelect?.value || 'student';
      if (subjectLabel) {
        subjectLabel.style.display = role === 'lecturer' ? 'block' : 'none';
      }
      if (role !== 'lecturer' && subjectSelect) {
        subjectSelect.value = '';
      }
    }

    if (subjectSelect) {
      const subjects = window.EIGHT_FOUR_FOUR_SUBJECTS || [];
      subjectSelect.innerHTML = '<option value="">Select subject</option>' + subjects.map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`).join('');
    }

    if (roleSelect) {
      roleSelect.addEventListener('change', refreshStudentSubjectField);
    }
    refreshStudentSubjectField();

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
        refreshStudentSubjectField();
        loadAdminData();
      } else {
        showAlert(data.message || 'Could not create student', 'error');
      }
    });
  }

  document.addEventListener('click', async (event) => {
    const streamButton = event.target.closest('.academics-stream-card');
    if (streamButton) {
      event.preventDefault();
      selectAcademicsStream(streamButton.dataset.stream);
      return;
    }

    const scrollButton = event.target.closest('[data-scroll-target]');
    if (scrollButton) {
      event.preventDefault();
      document.getElementById(scrollButton.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const adminLogout = event.target.closest('[data-admin-logout]');
    if (adminLogout) {
      event.preventDefault();
      logout();
      return;
    }

    const tableButton = event.target.closest('[data-table-name]');
    if (tableButton) {
      event.preventDefault();
      openDatabaseTable(tableButton.dataset.tableName);
      return;
    }

    const exportTranscripts = event.target.closest('[data-export-transcripts]');
    if (exportTranscripts) {
      event.preventDefault();
      exportTranscriptSheet();
      return;
    }

    const removeFeeCategory = event.target.closest('[data-remove-fee-category]');
    if (removeFeeCategory) {
      event.preventDefault();
      removeFeeCategory.closest('.fee-category-row')?.remove();
      return;
    }

    const receiptButton = event.target.closest('[data-open-receipt]');
    if (receiptButton) {
      event.preventDefault();
      openReceipt(receiptButton.dataset.openReceipt);
      return;
    }

    const statementButton = event.target.closest('[data-open-statement]');
    if (statementButton) {
      event.preventDefault();
      openStatement(statementButton.dataset.openStatement);
      return;
    }

    const action = event.target.closest('a.action-link');
    if (!action) {
      // handle edit-student buttons
      const editBtn = event.target.closest('[data-edit-student]');
      if (editBtn) {
        event.preventDefault();
        openEditStudentModal(editBtn.dataset.editStudent);
        return;
      }
      return;
    }
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
