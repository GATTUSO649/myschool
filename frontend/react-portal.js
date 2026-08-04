(function () {
  if (!window.React || !window.ReactDOM) return;

  const { createElement: h, useEffect, useMemo, useState } = window.React;
  const { createRoot } = window.ReactDOM;

  const SCHOOL_FORMS = window.SCHOOL_FORMS || ['Form 1', 'Form 2', 'Form 3', 'Form 4'];
  const SUBJECTS = window.EIGHT_FOUR_FOUR_SUBJECTS || [
    'English',
    'Kiswahili',
    'Mathematics',
    'Biology',
    'Physics',
    'Chemistry',
    'History and Government',
    'Geography',
    'Computer Studies',
    'Business Studies'
  ];

  const studentServices = [
    {
      title: 'Academics',
      text: 'Check your subjects, notes, revision materials, results, and academic progress.',
      href: 'academic.html',
      action: 'Open Academics'
    },
    {
      title: 'Notes',
      text: 'Access lecture notes and class study materials uploaded by administration.',
      href: 'notes.html',
      action: 'View Notes'
    },
    {
      title: 'Revision',
      text: 'Use revision materials, past papers, and exam preparation resources.',
      href: 'revision.html',
      action: 'Study Resources'
    },
    {
      title: 'Events',
      text: 'View school events, academic dates, meetings, deadlines, and exam periods.',
      href: 'calendar.html',
      action: 'View Events'
    },
    {
      title: 'Finance',
      text: 'Review fees, balances, structures, statements, payments, and receipts.',
      href: 'finance.html',
      action: 'Open Finance'
    },
    {
      title: 'Exams',
      text: 'Access exam results, transcripts, marks, grades, and performance records.',
      href: 'exams.html',
      action: 'View Exams'
    },
    // Clearance removed from portal services
    {
      title: 'Lecturer Interaction',
      text: 'Communicate with lecturers and tutors about learning support.',
      href: 'lecturer interaction.html',
      action: 'Open Messages'
    }
  ];

  const academicServices = [
    {
      title: 'Course Registration',
      text: 'Confirm your registered subjects and class/form allocation.',
      href: 'academic.html#subjects',
      action: 'View Subjects'
    },
    {
      title: 'Lecturer Notes',
      text: 'Access notes and class learning materials.',
      href: 'notes.html',
      type: 'notes',
      action: 'Lecture Notes'
    },
    {
      title: 'Revision Papers',
      text: 'View revision papers and past exam papers.',
      href: 'revision.html',
      type: 'revision',
      action: 'Revision Papers'
    },
    {
      title: 'My Transcript',
      text: 'View your academic transcript with all subject marks.',
      href: 'transcript.html',
      action: 'View Transcript'
    },
    {
      title: 'Results',
      text: 'Check results and academic performance records.',
      href: 'exams.html',
      action: 'View Results'
    },
    {
      title: 'Events',
      text: 'View academic session events and key school dates.',
      href: 'calendar.html',
      action: 'View Events'
    },
    {
      title: 'Lecturer Interaction',
      text: 'Communicate with lecturers and tutors.',
      href: 'lecturer interaction.html',
      action: 'Interact'
    }
  ];

  const financeServices = [
    {
      title: 'Fee Statement',
      text: 'Review your personalized fee statement when uploaded by admin.',
      href: 'feestatement.html',
      bucket: 'statements',
      action: 'View All Statements'
    },
    {
      title: 'Fee Structure',
      text: 'Check the fee structure documents shared with you.',
      href: 'feestructure.html',
      bucket: 'structures',
      action: 'View Fee Structures'
    },
    {
      title: 'Payment & Receipts',
      text: 'Check your payment history and generated receipts.',
      href: 'paymentreceipts.html',
      bucket: 'payments',
      action: 'View Payment Receipts'
    }
  ];

  const adminQuickFlow = [
    ['Student Management', 'Admit, update, search, and review students by form.', 'students'],
    ['Admissions', 'Review applications and admission status.', 'admissions'],
    ['Academics', 'Upload notes, revision, assignments, events, and transcripts.', 'uploads'],
    ['Finance', 'Post charges, receive payments, generate statements, and manage structures.', 'finance'],
    ['Reports', 'Open reporting and system oversight tools.', 'reports'],
    ['Settings', 'Review system settings and portal configuration.', 'system']
  ];

  function pageName() {
    return decodeURIComponent(window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  }

  function money(amount) {
    return `KSh ${Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }

  function student() {
    try {
      return typeof getStudentInfo === 'function'
        ? getStudentInfo()
        : JSON.parse(localStorage.getItem('student') || '{}');
    } catch {
      return {};
    }
  }

  async function api(endpoint, options = {}) {
    if (typeof fetchWithAuth === 'function') return fetchWithAuth(endpoint, options);
    const token = localStorage.getItem('authToken');
    const base = typeof getApiUrl === 'function' ? getApiUrl() : `${window.location.origin}/api`;
    const cleanEndpoint = endpoint.startsWith('/api') ? endpoint.slice(4) : endpoint;
    const isForm = options.body instanceof FormData;
    const headers = isForm ? { ...(options.headers || {}) } : { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${base}${cleanEndpoint}`, { ...options, headers });
  }

  function mount(target, Component, props) {
    if (!target || target.dataset.reactMounted === 'true') return;
    target.dataset.reactMounted = 'true';
    createRoot(target).render(h(Component, props || {}));
  }

  function ProgressPanel() {
    const now = new Date();
    const year = now.getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const totalDays = Math.ceil((end - start) / 86400000) + 1;
    const elapsed = Math.max(0, Math.ceil((now - start) / 86400000) + 1);
    const percentage = Math.min(Math.max((elapsed / totalDays) * 100, 0), 100);
    const remaining = Math.max(totalDays - elapsed, 0);
    const month = now.getMonth() + 1;
    const term = month <= 4 ? 'Term 1' : month <= 8 ? 'Term 2' : 'Term 3';

    return h('div', { className: 'semester-progress' },
      h('h3', null, 'Academic Year Progress'),
      h('div', { className: 'progress-container' },
        h('div', { className: 'progress-bar', id: 'semesterProgressBar' },
          h('div', { className: 'progress-fill', id: 'progressFill', style: { width: `${percentage}%` } })
        ),
        h('div', { className: 'progress-text' },
          h('span', { id: 'progressPercentage' }, `${Math.round(percentage)}%`),
          h('span', { id: 'daysRemaining' }, `${remaining} days remaining`)
        )
      ),
      h('div', { className: 'progress-details' },
        h('span', { id: 'currentTerm' }, term),
        ' | ',
        h('span', { id: 'academicYear' }, `${year}-${year + 1}`)
      )
    );
  }

  function Welcome() {
    const currentStudent = student();
    return h(window.React.Fragment, null,
      h('h2', null, 'Welcome, ', h('span', { id: 'studentName' }, currentStudent?.name || 'Student')),
      h('p', null, 'This is your student self-service portal. Access academics, finance, results, events, requests, and personal services from one place.'),
      h(ProgressPanel)
    );
  }

  function CardGrid({ items, counts, summaries }) {
    return h(window.React.Fragment, null,
      items.map((item) => h('div', { className: 'dashboard-card finance-card', key: item.title, 'data-type': item.type || '' },
        h('h3', null, item.title),
        h('p', null, item.text),
        counts && item.type ? h('p', { className: 'doc-count' }, counts[item.type] || '') : null,
        summaries && item.bucket ? h('div', { className: 'card-records' }, summaries[item.bucket] || h('p', null, 'Loading...')) : null,
        h('a', { href: item.href }, item.action)
      ))
    );
  }

  function DashboardCards() {
    return h(CardGrid, { items: studentServices });
  }

  function AcademicsPage() {
    const [counts, setCounts] = useState({});

    useEffect(() => {
      let cancelled = false;
      Promise.all([
        api('/academics/docs?type=notes').then((r) => r.ok ? r.json() : []),
        api('/academics/docs?type=revision').then((r) => r.ok ? r.json() : [])
      ]).then(([notes, revision]) => {
        if (cancelled) return;
        setCounts({
          notes: `${Array.isArray(notes) ? notes.length : 0} available`,
          revision: `${Array.isArray(revision) ? revision.length : 0} available`
        });
      }).catch(() => setCounts({}));
      return () => { cancelled = true; };
    }, []);

    return h(window.React.Fragment, null,
      h(CardGrid, { items: academicServices, counts }),
      h('div', { id: 'subjects', className: 'portal-inline-panel' },
        h('h3', null, 'Registered 8-4-4 Subjects'),
        h('p', null, `Class/Form options: ${SCHOOL_FORMS.join(', ')}`),
        h('p', null, SUBJECTS.slice(0, 10).join(' | '))
      )
    );
  }

  function FinanceSummary() {
    const [summary, setSummary] = useState({ total_charges: 0, total_paid: 0, balance: 0 });

    useEffect(() => {
      let cancelled = false;
      api('/finance/balances')
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (!cancelled && data) setSummary(data);
        })
        .catch(() => {});
      return () => { cancelled = true; };
    }, []);

    return h(window.React.Fragment, null,
      h('div', { className: 'finance-summary-card' },
        h('span', null, 'Total Billed'),
        h('strong', { id: 'studentTotalBilled' }, money(summary.total_charges || summary.total_charged))
      ),
      h('div', { className: 'finance-summary-card' },
        h('span', null, 'Total Paid'),
        h('strong', { id: 'studentTotalPaid' }, money(summary.total_paid || summary.paid))
      ),
      h('div', { className: 'finance-summary-card' },
        h('span', null, 'Balance'),
        h('strong', { id: 'studentBalance' }, money(summary.balance))
      )
    );
  }

  function FinanceCards() {
    const [docs, setDocs] = useState([]);
    const [payments, setPayments] = useState([]);

    useEffect(() => {
      let cancelled = false;
      Promise.all([
        api('/finance/docs').then((r) => r.ok ? r.json() : []),
        api('/payments/receipts').then((r) => r.ok ? r.json() : [])
      ]).then(([docData, paymentData]) => {
        if (cancelled) return;
        setDocs(Array.isArray(docData) ? docData : []);
        setPayments(Array.isArray(paymentData) ? paymentData : []);
      }).catch(() => {});
      return () => { cancelled = true; };
    }, []);

    const summaries = useMemo(() => {
      const statements = docs.filter((doc) => doc.type === 'feestatement');
      const structures = docs.filter((doc) => doc.type === 'feestructure');
      const buildDocSummary = (items, empty) => {
        if (!items.length) return h('p', null, empty);
        const latest = items[0];
        const date = latest.uploaded_at ? new Date(latest.uploaded_at).toLocaleDateString() : 'Unknown date';
        return h('div', { className: 'document-summary' },
          h('p', null, h('strong', null, items.length), ` document${items.length === 1 ? '' : 's'} available`),
          h('p', { className: 'small-text' }, `Latest uploaded: ${date}`)
        );
      };
      const paymentSummary = payments.length
        ? h('div', { className: 'document-summary' },
            h('p', null, h('strong', null, payments.length), ` receipt${payments.length === 1 ? '' : 's'} available`),
            h('p', { className: 'small-text' }, `Latest payment: ${payments[0].payment_date ? new Date(payments[0].payment_date).toLocaleDateString() : 'Unknown date'}`)
          )
        : h('p', null, 'No payments have been recorded yet.');

      return {
        statements: buildDocSummary(statements, 'No fee statements have been uploaded yet.'),
        structures: buildDocSummary(structures, 'No fee structure documents have been uploaded yet.'),
        payments: paymentSummary
      };
    }, [docs, payments]);

    return h(CardGrid, { items: financeServices, summaries });
  }

  function AdminFlowPanel() {
    return h('div', { className: 'dashboard-panel portal-flow-panel' },
      h('div', { className: 'panel-header' },
        h('h3', null, 'Portal Flow'),
        h('span', { className: 'small-text' }, 'Grouped like a university self-service portal')
      ),
      h('div', { className: 'portal-flow-grid' },
        adminQuickFlow.map(([title, text, tab]) => h('button', {
          key: title,
          type: 'button',
          className: 'portal-flow-card',
          onClick: () => {
            if (typeof window.selectTab === 'function') window.selectTab(tab);
          }
        },
          h('strong', null, title),
          h('span', null, text)
        ))
      )
    );
  }

  function injectStyles() {
    if (document.getElementById('reactPortalStyles')) return;
    const style = document.createElement('style');
    style.id = 'reactPortalStyles';
    style.textContent = `
      .portal-inline-panel {
        background: rgba(255,255,255,0.97);
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(26,35,126,0.06);
        color: #333;
        margin: 24px auto 0;
        max-width: 980px;
        padding: 20px 24px;
        text-align: center;
      }
      .portal-inline-panel h3 { color: #1a237e; margin: 0 0 8px; }
      .portal-flow-panel { margin-top: 24px; }
      .portal-flow-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 12px;
      }
      .portal-flow-card {
        background: #fff;
        border: 1px solid rgba(26,35,126,0.12);
        border-radius: 8px;
        color: #333;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 14px;
        text-align: left;
      }
      .portal-flow-card strong { color: #1565c0; }
      .portal-flow-card span { font-size: 0.9rem; line-height: 1.35; }
      .portal-flow-card:hover {
        box-shadow: 0 4px 16px rgba(26,35,126,0.12);
        transform: translateY(-1px);
      }
    `;
    document.head.appendChild(style);
  }

  function boot() {
    injectStyles();
    const page = pageName();

    if (page === 'dashboard.html') {
      mount(document.getElementById('welcomeSection'), Welcome);
      mount(document.querySelector('.dashboard-cards'), DashboardCards);
      return;
    }

    if (page === 'academic.html') {
      mount(document.querySelector('.dashboard-cards'), AcademicsPage);
      return;
    }

    if (page === 'finance.html') {
      const currentStudent = student();
      const name = document.getElementById('studentName');
      if (name && currentStudent?.name) name.textContent = currentStudent.name;
      mount(document.querySelector('.finance-summary'), FinanceSummary);
      mount(document.querySelector('.finance-cards'), FinanceCards);
      return;
    }

    if (page === 'admin-dashboard.html') {
      const dashboard = document.getElementById('dashboard');
      if (!dashboard || document.getElementById('reactAdminFlowRoot')) return;
      const root = document.createElement('div');
      root.id = 'reactAdminFlowRoot';
      const pageHeader = dashboard.querySelector('.page-header');
      if (pageHeader && pageHeader.nextSibling) {
        pageHeader.parentNode.insertBefore(root, pageHeader.nextSibling);
      } else {
        dashboard.prepend(root);
      }
      mount(root, AdminFlowPanel);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
