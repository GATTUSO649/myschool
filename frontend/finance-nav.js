document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('.student-sidebar');
  if (!sidebar) return;
  const current = window.location.pathname.split('/').pop().toLowerCase();
  const isAdmin = ['admin', 'rba'].includes(String(JSON.parse(sessionStorage.getItem('adminUser') || '{}').role || '').toLowerCase());
  const links = [
    ['admin-finance.html', 'Dashboard'],
    ['admin-finance-balances.html', 'Balances'],
    ['admin-finance-receipts.html', 'Receipt ledger'],
    ['admin-finance-payments.html', 'Record payment'],
    ['admin-finance-structure.html', 'Fee structures'],
    ['admin-finance-statements.html', 'Statements'],
    ['admin-finance-upload.html', 'Documents']
  ];
  const overview = links.slice(0, 3);
  const operations = links.slice(3);
  const renderLinks = (items) => items.map(([href, label]) => `<a class="sidebar-link${current === href ? ' active' : ''}" href="${href}">${label}</a>`).join('');
  sidebar.className = `${sidebar.className} finance-sidebar`.trim();
  sidebar.innerHTML = `<div class="sidebar-brand">Finance workspace</div><div class="sidebar-section"><h3>Overview</h3>${renderLinks(overview)}</div><div class="sidebar-section"><h3>Operations</h3>${renderLinks(operations)}</div>${isAdmin ? '<div class="sidebar-section"><h3>Administration</h3><a class="sidebar-link" href="admin-roles.html">Staff roles</a><a class="sidebar-link" href="admin-dashboard.html">Admin portal</a></div>' : ''}<div class="sidebar-section"><a class="sidebar-link" href="#" data-admin-logout>Sign out</a></div>`;
  sidebar.querySelector('[data-admin-logout]')?.addEventListener('click', (event) => { event.preventDefault(); logout(); });
});
