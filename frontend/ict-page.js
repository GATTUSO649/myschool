function ictPageEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

async function ictPageRequest(endpoint, options = {}) {
  const response = await fetchWithAuth(`/admin/ict/${endpoint}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'ICT data could not be loaded');
  return data;
}

const ICT_PAGE_GROUPS = [
  ['MAIN', [['ict-dashboard.html', 'Dashboard'], ['ict-health.html', 'System Health'], ['ict-activity.html', 'Activity Monitor']]],
  ['USER MANAGEMENT', [['ict-users.html', 'Users'], ['ict-permissions.html', 'Roles & Permissions'], ['ict-sessions.html', 'Active Sessions']]],
  ['SECURITY', [['ict-security.html', 'Security Center'], ['ict-audit.html', 'Audit Logs'], ['ict-security.html', 'Login Activity']]],
  ['SYSTEM', [['ict-configuration.html', 'Portal Configuration'], ['ict-logs.html', 'System Logs'], ['ict-integrations.html', 'API & Integrations'], ['ict-updates.html', 'System Updates']]],
  ['DATA', [['ict-database.html', 'Database'], ['ict-backups.html', 'Backups & Recovery'], ['ict-storage.html', 'File Storage']]],
  ['COMMUNICATION', [['ict-email.html', 'Email & Notifications'], ['ict-messages.html', 'System Messages']]],
  ['MAINTENANCE', [['ict-maintenance.html', 'Maintenance Mode'], ['ict-tickets.html', 'Support Tickets'], ['ict-history.html', 'Maintenance History']]],
  ['ACCOUNT', [['ict-profile.html', 'ICT Profile'], ['#', 'Logout']]]
];

function renderICTPageNav(currentPage) {
  return `<div class="sidebar-brand">ICT CONTROL</div>${ICT_PAGE_GROUPS.map(([title, links]) => `<div class="sidebar-section"><h3>${title}</h3>${links.map(([href, label]) => `<a class="sidebar-link${href === currentPage ? ' active' : ''}" href="${href}">${label}</a>`).join('')}</div>`).join('')}`;
}

function tableRows(rows, columns) {
  return rows.map((row) => `<tr>${columns.map(([key, format]) => `<td>${format ? format(row[key], row) : ictPageEscape(row[key] ?? '')}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${columns.length}">No records found.</td></tr>`;
}

function pageTable(title, description, headers, rows, columns) {
  return `<section class="ict-page-panel"><div class="ict-section-head"><div><h2>${title}</h2><p>${description}</p></div></div><div class="ict-table-wrap"><table class="ict-table"><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${tableRows(rows, columns)}</tbody></table></div></section>`;
}

async function renderICTPage() {
  if (!checkAuth()) return;
  const page = document.body.dataset.ictPage || 'ict-dashboard.html';
  const user = JSON.parse(sessionStorage.getItem('student') || 'null');
  const rawRole = String(user?.rawRole || '').toLowerCase();
  if (String(user?.role || '').toLowerCase() !== 'ict' && rawRole !== 'super_admin') { window.location.replace('ict-login.html'); return; }
  document.getElementById('ictStaffName').textContent = user?.name || user?.username || 'ICT staff';
  document.querySelector('.ict-sidebar').innerHTML = renderICTPageNav(page);
  document.getElementById('ictLogout').addEventListener('click', (event) => { event.preventDefault(); logout(); });
  const sidebarLogout = [...document.querySelectorAll('.ict-sidebar .sidebar-link')].find((link) => link.textContent === 'Logout');
  sidebarLogout?.addEventListener('click', (event) => { event.preventDefault(); logout(); });
  const content = document.getElementById('ictPageContent');
  try {
    if (page === 'ict-dashboard.html' || page === 'ict-health.html' || page === 'ict-activity.html' || page === 'ict-security.html') {
      const data = await ictPageRequest('dashboard');
      const serviceRows = Object.entries(data.services || {}).map(([name, item]) => ({ name, status: item.status, response: item.responseMs ? `${item.responseMs} ms` : 'Checked' }));
      const metrics = Object.entries(data.metrics || {}).map(([name, value]) => `<div class="ict-page-metric"><span>${name.replace(/[A-Z]/g, ' $&')}</span><strong>${value}</strong></div>`).join('');
      if (page === 'ict-dashboard.html') content.innerHTML = `<div class="ict-hero"><div><p class="eyebrow">ICT CONTROL / DASHBOARD</p><h1>Portal operations at a glance.</h1><p>Real-time service, security, and usage signals.</p></div><span class="ict-hero-badge">LIVE CONTROL</span></div><section class="ict-page-status-grid">${serviceRows.map((row) => `<article class="ict-status-card"><span>${row.name}</span><strong>${ictPageEscape(row.status)}</strong><small>${row.response}</small></article>`).join('')}</section><section class="ict-page-panel"><h2>Operational metrics</h2><div class="ict-page-metric-grid">${metrics}</div></section>`;
      else if (page === 'ict-health.html') content.innerHTML = pageTable('System Health', 'Live checks from the backend and connected services.', ['Service', 'Status', 'Response'], serviceRows, [['name'], ['status'], ['response']]);
      else if (page === 'ict-security.html') content.innerHTML = `<section class="ict-page-panel"><h2>Security Center</h2><p>Recent login and access risk indicators.</p><div class="ict-page-metric-grid">${metrics}</div></section>` + pageTable('Recent security events', 'Events recorded by the portal security stream.', ['Action', 'Details', 'IP', 'Time'], data.recentEvents || [], [['action'], ['details'], ['ipAddress'], ['createdAt']]);
      else content.innerHTML = pageTable('Activity Monitor', 'Most recent recorded portal events.', ['Action', 'Details', 'IP', 'Time'], data.recentEvents || [], [['action'], ['details'], ['ipAddress'], ['createdAt']]);
    } else if (page === 'ict-users.html') {
      const data = await ictPageRequest('users'); content.innerHTML = pageTable('Users', 'Active portal accounts and access status.', ['ID', 'Name', 'Email', 'Username', 'Role', 'Status', 'Last login'], data.users, [['id'], ['name'], ['email'], ['username'], ['role'], ['active', (value) => value ? 'ONLINE' : 'OFFLINE'], ['lastLogin']]);
    } else if (page === 'ict-sessions.html') {
      const data = await ictPageRequest('sessions'); content.innerHTML = pageTable('Active Sessions', 'Registered sessions and recent activity.', ['User', 'Role', 'Login', 'Last activity', 'IP', 'Status'], data.sessions, [['name'], ['role'], ['loginAt'], ['lastActivity'], ['ipAddress'], ['revokedAt', (value) => value ? 'REVOKED' : 'ACTIVE']]);
    } else if (page === 'ict-audit.html' || page === 'ict-logs.html' || page === 'ict-history.html') {
      const data = await ictPageRequest('audit-logs'); content.innerHTML = pageTable(page === 'ict-audit.html' ? 'Audit Logs' : page === 'ict-logs.html' ? 'System Logs' : 'Maintenance History', 'Searchable events from the portal audit trail.', ['Time', 'Action', 'Details', 'IP'], data.logs, [['createdAt'], ['action'], ['details'], ['ipAddress']]);
    } else if (page === 'ict-permissions.html') {
      const data = await ictPageRequest('permissions'); content.innerHTML = `<section class="ict-page-panel"><h2>Roles &amp; Permissions</h2><p>Permissions currently assigned to the ICT role.</p><div class="ict-page-permissions">${data.permissions.map((permission) => `<div><strong>${permission}</strong><span>${data.assignments.some((item) => item.permission === permission && item.enabled) ? 'Enabled' : 'Disabled'}</span></div>`).join('')}</div></section>`;
    } else if (page === 'ict-backups.html') {
      const data = await ictPageRequest('backups'); content.innerHTML = `<section class="ict-page-panel"><div class="ict-section-head"><div><h2>Backups &amp; Recovery</h2><p>Backup requests and provider-managed recovery records.</p></div><button data-ict-backup>Request backup</button></div>${pageTable('', '', ['Filename', 'Status', 'Size', 'Created'], data.backups, [['filename'], ['status'], ['sizeBytes'], ['createdAt']])}</section>`; content.querySelector('[data-ict-backup]').addEventListener('click', async () => { await ictPageRequest('backups', { method: 'POST', body: {} }); window.location.reload(); });
    } else if (page === 'ict-storage.html') {
      const data = await ictPageRequest('storage'); content.innerHTML = `<section class="ict-page-panel"><h2>File Storage</h2><p>Actual upload directory usage.</p><div class="ict-page-metric-grid"><div class="ict-page-metric"><span>Total files</span><strong>${data.totalFiles}</strong></div><div class="ict-page-metric"><span>Total bytes</span><strong>${data.totalBytes}</strong></div></div>${pageTable('', '', ['Category', 'Files', 'Bytes'], data.categories, [['category'], ['files'], ['bytes']])}</section>`;
    } else if (page === 'ict-database.html') {
      const data = await ictPageRequest('database'); content.innerHTML = `<section class="ict-page-panel"><h2>Database</h2><p>Live metadata from the configured database connection.</p><div class="ict-page-metric-grid"><div class="ict-page-metric"><span>Connection</span><strong>${ictPageEscape(data.connection)}</strong></div><div class="ict-page-metric"><span>Database</span><strong>${ictPageEscape(data.database)}</strong></div><div class="ict-page-metric"><span>Tables</span><strong>${data.tableCount}</strong></div></div>${pageTable('', '', ['Table', 'Approximate rows', 'Bytes'], data.tables, [['tableName'], ['approximateRows'], ['bytes']])}</section>`;
    } else if (page === 'ict-email.html') {
      content.innerHTML = `<section class="ict-page-panel"><h2>Email &amp; Notifications</h2><p>Send a message through the configured SMTP service.</p><form class="ict-mail-form" id="ictStandaloneEmail"><label>Recipients<textarea name="to" rows="3" placeholder="name@example.com, another@example.com" required></textarea></label><label>Subject<input name="subject" required></label><label>Message<textarea name="text" rows="8" required></textarea></label><button type="submit">Send email</button><span id="ictStandaloneEmailStatus" class="ict-mail-status"></span></form></section>`;
      content.querySelector('form').addEventListener('submit', async (event) => { event.preventDefault(); const status = document.getElementById('ictStandaloneEmailStatus'); try { const data = await fetchWithAuth('/admin/email/send', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget).entries()) }).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.message || 'Email failed'); return result; }); status.textContent = `Email processed for ${data.queued} recipient(s).`; status.className = 'ict-mail-status success'; event.currentTarget.reset(); } catch (error) { status.textContent = error.message; status.className = 'ict-mail-status error'; } });
    } else if (page === 'ict-tickets.html') {
      const data = await ictPageRequest('tickets'); content.innerHTML = pageTable('Support Tickets', 'ICT help-desk queue.', ['ID', 'Title', 'Module', 'Priority', 'Status', 'Created'], data.tickets, [['id'], ['title'], ['module'], ['priority'], ['status'], ['createdAt']]);
    } else if (page === 'ict-configuration.html') {
      const data = await ictPageRequest('settings');
      const values = Object.fromEntries(data.settings.map((row) => [row.settingKey, row.settingValue]));
      const field = (key, label, type = 'text') => `<label class="ict-config-field">${label}<${type === 'textarea' ? 'textarea' : 'input'} name="${key}" ${type === 'textarea' ? 'rows="4"' : `type="${type}"`}>${type === 'textarea' ? ictPageEscape(values[key] || '') : ''}</${type === 'textarea' ? 'textarea' : 'input'}></label>`;
      content.innerHTML = `<section class="ict-page-panel"><h2>Portal Configuration</h2><p>Edit public homepage, footer, contact, and operational settings. Secrets remain in environment configuration.</p><form class="ict-config-form" id="ictPageConfigForm">${field('schoolName', 'School name')}${field('schoolMotto', 'School motto')}${field('landingHeroTitle', 'Homepage hero title')}${field('landingHeroText', 'Homepage hero text', 'textarea')}${field('landingAboutText', 'Homepage about text', 'textarea')}${field('footerText', 'Footer text', 'textarea')}${field('contactEmail', 'Contact email', 'email')}${field('contactPhone', 'Contact phone')}${field('contactAddress', 'Contact address')}${field('academicYear', 'Academic year')}${field('currentTerm', 'Current term')}<label class="ict-config-field">Maintenance mode<select name="maintenanceMode"><option value="false" ${values.maintenanceMode !== 'true' ? 'selected' : ''}>Disabled</option><option value="true" ${values.maintenanceMode === 'true' ? 'selected' : ''}>Enabled</option></select></label><div class="ict-form-actions"><button type="submit">Save changes</button><span id="ictConfigPageStatus" class="ict-mail-status"></span></div></form></section>`;
      content.querySelector('form').addEventListener('submit', async (event) => { event.preventDefault(); const status = document.getElementById('ictConfigPageStatus'); try { await ictPageRequest('settings', { method: 'PUT', body: Object.fromEntries(new FormData(event.currentTarget).entries()) }); status.textContent = 'Changes saved. Refresh the homepage to see updates.'; status.className = 'ict-mail-status success'; } catch (error) { status.textContent = error.message; status.className = 'ict-mail-status error'; } });
    } else {
      content.innerHTML = `<section class="ict-page-panel"><h2>${page.replace('ict-', '').replace('.html', '').replace(/-/g, ' ')}</h2><p>This ICT workspace page is ready for its connected operational view.</p></section>`;
    }
  } catch (error) { content.innerHTML = `<section class="ict-page-panel"><h2>Unable to load this page</h2><p>${ictPageEscape(error.message)}</p></section>`; }
}

document.addEventListener('DOMContentLoaded', renderICTPage);