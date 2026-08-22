function ictEscape(value) { return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }

async function loadICTRecipients() {
  const list = document.getElementById('ictRecipientList');
  if (!list) return;
  try {
    const response = await fetchWithAuth('/admin/email/recipients');
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load recipients');
    list.innerHTML = (data.recipients || []).map((recipient) => `<label><input type="checkbox" value="${ictEscape(recipient.email)}"><span>${ictEscape(recipient.name)}<small>${ictEscape(recipient.email)}</small></span></label>`).join('') || '<span>No email recipients available.</span>';
  } catch (error) { list.innerHTML = `<span>${ictEscape(error.message)}</span>`; }
}

async function ictRequest(endpoint, options = {}) {
  const response = await fetchWithAuth(`/admin/ict/${endpoint}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'ICT request failed');
  return data;
}

function ictStatus(status) { return `<span class="ict-status-badge ${String(status || '').toLowerCase()}">${ictEscape(status || 'UNKNOWN')}</span>`; }

async function loadICTWorkspace() {
  try {
    const [dashboard, users, sessions, audit, permissions, backups, storage, tickets, settings] = await Promise.all([
      ictRequest('dashboard'), ictRequest('users'), ictRequest('sessions'), ictRequest('audit-logs'), ictRequest('permissions'), ictRequest('backups'), ictRequest('storage'), ictRequest('tickets'), ictRequest('settings')
    ]);
    renderICTDashboard(dashboard); renderICTUsers(users.users); renderICTSessions(sessions.sessions); renderICTAudit(audit.logs); renderICTPermissions(permissions.assignments, permissions.permissions); renderICTBackups(backups.backups); renderICTStorage(storage); renderICTTickets(tickets.tickets); renderICTSettings(settings.settings);
  } catch (error) { document.getElementById('ictMailStatus').textContent = error.message || 'Unable to load ICT workspace'; }
}

function renderICTDashboard(data) {
  const services = document.getElementById('health');
  services.innerHTML = Object.entries(data.services || {}).map(([name, item]) => `<article class="ict-status-card"><span>${ictEscape(name)}</span><strong>${ictStatus(item.status)}</strong><small>${item.responseMs ? `${item.responseMs} ms` : 'Checked now'}</small></article>`).join('');
  document.getElementById('ictRecentEvents').innerHTML = (data.recentEvents || []).map((event) => `<div class="ict-event"><strong>${ictEscape(event.action)}</strong><span>${ictEscape(event.details || '')}</span><small>${ictEscape(event.createdAt || '')}</small></div>`).join('') || '<div class="ict-empty">No recent events.</div>';
  document.getElementById('ictSecurityMetrics').innerHTML = `<div class="ict-metric"><span>Total students</span><strong>${data.metrics.totalStudents}</strong></div><div class="ict-metric"><span>Total staff</span><strong>${data.metrics.totalStaff}</strong></div><div class="ict-metric"><span>Active sessions</span><strong>${data.metrics.activeSessions}</strong></div><div class="ict-metric"><span>Failed logins, 24h</span><strong>${data.metrics.failedLogins24h}</strong></div>`;
}
function renderICTUsers(rows = []) { document.getElementById('ictUsersBody').innerHTML = rows.map((user) => `<tr><td>${user.id}</td><td>${ictEscape(user.name)}</td><td>${ictEscape(user.email || '')}</td><td>${ictEscape(user.username || user.admissionNumber || '')}</td><td>${ictEscape(user.role)}</td><td>${user.active ? ictStatus('ONLINE') : ictStatus('OFFLINE')}</td><td>${ictEscape(user.lastLogin || 'Never')}</td><td><button type="button" data-ict-disable="${user.id}" data-ict-active="${user.active ? 1 : 0}">${user.active ? 'Disable' : 'Enable'}</button></td></tr>`).join('') || '<tr><td colspan="8">No users found.</td></tr>'; }
function renderICTSessions(rows = []) { document.getElementById('ictSessionsBody').innerHTML = rows.map((session) => `<tr><td>${ictEscape(session.name || session.userId || '')}</td><td>${ictEscape(session.role)}</td><td>${ictEscape(session.lastActivity)}</td><td>${session.revokedAt ? ictStatus('REVOKED') : ictStatus('ACTIVE')}</td><td>${session.revokedAt ? '' : `<button type="button" data-ict-revoke="${session.id}">Revoke</button>`}</td></tr>`).join('') || '<tr><td colspan="5">No sessions registered.</td></tr>'; }
function renderICTAudit(rows = []) { document.getElementById('ictAuditBody').innerHTML = rows.map((log) => `<tr><td>${ictEscape(log.createdAt)}</td><td>${ictEscape(log.action)}</td><td>${ictEscape(log.details || '')}</td><td>${ictEscape(log.ipAddress || '')}</td></tr>`).join('') || '<tr><td colspan="4">No audit events.</td></tr>'; }
function renderICTPermissions(assignments = [], keys = []) { const enabled = new Set(assignments.filter((row) => row.enabled).map((row) => row.permission)); document.getElementById('ictPermissionsBody').innerHTML = keys.map((key) => `<label class="ict-permission"><input type="checkbox" data-ict-permission="${ictEscape(key)}" ${enabled.has(key) ? 'checked' : ''}><span>${ictEscape(key)}</span></label>`).join(''); }
function renderICTBackups(rows = []) { document.getElementById('ictBackupsBody').innerHTML = rows.map((backup) => `<div class="ict-event"><strong>${ictEscape(backup.filename)}</strong>${ictStatus(backup.status)}<small>${ictEscape(backup.createdAt)}</small></div>`).join('') || '<div class="ict-empty">No backups recorded.</div>'; }
function renderICTStorage(data) { document.getElementById('ictStorageBody').innerHTML = `<div class="ict-metric"><span>Total files</span><strong>${data.totalFiles}</strong></div><div class="ict-metric"><span>Total storage</span><strong>${(Number(data.totalBytes || 0) / 1048576).toFixed(2)} MB</strong></div>` + (data.categories || []).map((item) => `<div class="ict-metric"><span>${ictEscape(item.category)}</span><strong>${item.files} files</strong></div>`).join(''); }
function renderICTTickets(rows = []) { document.getElementById('ictTicketsBody').innerHTML = rows.map((ticket) => `<div class="ict-event"><strong>#${ticket.id} ${ictEscape(ticket.title)}</strong><span>${ictEscape(ticket.status)} / ${ictEscape(ticket.priority)}</span><small>${ictEscape(ticket.createdAt)}</small></div>`).join('') || '<div class="ict-empty">No support tickets.</div>'; }
function renderICTSettings(rows = []) { const form = document.getElementById('ictConfigForm'); const values = Object.fromEntries(rows.map((row) => [row.settingKey, row.settingValue])); Object.entries(values).forEach(([key, value]) => { const field = form.elements[key]; if (field) field.value = value; }); document.getElementById('ictMaintenanceToggle').checked = values.maintenanceMode === 'true'; }

document.addEventListener('DOMContentLoaded', () => {
  if (typeof checkAuth === 'function' && !checkAuth()) return;
  const user = JSON.parse(sessionStorage.getItem('student') || 'null');
  const rawRole = String(user?.rawRole || '').toLowerCase();
  if (String(user?.role || '').toLowerCase() !== 'ict' && rawRole !== 'super_admin') { window.location.replace('staff-portals.html'); return; }
  const staffName = document.getElementById('ictStaffName');
  const workingArea = document.getElementById('ictWorkingArea');
  if (staffName) staffName.textContent = user.name || user.username || 'ICT staff';
  if (workingArea) workingArea.textContent = user.ictWorkingArea || 'Portal operations';
  loadICTRecipients();
  loadICTWorkspace();
  document.getElementById('ictReloadRecipients')?.addEventListener('click', loadICTRecipients);
  document.getElementById('ictLogout')?.addEventListener('click', (event) => { event.preventDefault(); logout(); });
  document.getElementById('ictLogoutLink')?.addEventListener('click', (event) => { event.preventDefault(); logout(); });
  document.getElementById('ictUserSearch')?.addEventListener('input', async (event) => { const data = await ictRequest(`users?search=${encodeURIComponent(event.target.value)}`); renderICTUsers(data.users); });
  document.getElementById('ictAuditSearch')?.addEventListener('input', async (event) => { const data = await ictRequest(`audit-logs?search=${encodeURIComponent(event.target.value)}`); renderICTAudit(data.logs); });
  document.querySelectorAll('[data-ict-action="health"]').forEach((button) => button.addEventListener('click', loadICTWorkspace));
  document.querySelectorAll('[data-ict-action="backup"]').forEach((button) => button.addEventListener('click', async () => { await ictRequest('backups', { method: 'POST', body: {} }); await loadICTWorkspace(); }));
  document.querySelectorAll('[data-ict-action="maintenance"]').forEach((button) => button.addEventListener('click', () => document.getElementById('maintenance').scrollIntoView({ behavior: 'smooth' })));
  document.querySelectorAll('[data-ict-action="security"]').forEach((button) => button.addEventListener('click', () => document.getElementById('audit').scrollIntoView({ behavior: 'smooth' })));
  document.getElementById('ictMaintenanceToggle')?.addEventListener('change', async (event) => { const data = await ictRequest('maintenance', { method: 'PUT', body: { enabled: event.target.checked } }); document.getElementById('ictMaintenanceStatus').textContent = `Maintenance mode ${data.maintenanceMode ? 'enabled' : 'disabled'}.`; });
  document.getElementById('ictConfigForm')?.addEventListener('submit', async (event) => { event.preventDefault(); await ictRequest('settings', { method: 'PUT', body: Object.fromEntries(new FormData(event.currentTarget).entries()) }); document.getElementById('ictConfigStatus').textContent = 'Configuration saved.'; });
  document.getElementById('ictTicketForm')?.addEventListener('submit', async (event) => { event.preventDefault(); await ictRequest('tickets', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget).entries()) }); event.currentTarget.reset(); document.getElementById('ictTicketStatus').textContent = 'Support ticket opened.'; await loadICTWorkspace(); });
  document.addEventListener('click', async (event) => { const revoke = event.target.closest('[data-ict-revoke]'); if (revoke) { await ictRequest(`sessions/${revoke.dataset.ictRevoke}/revoke`, { method: 'POST', body: {} }); await loadICTWorkspace(); } const toggle = event.target.closest('[data-ict-disable]'); if (toggle) { await ictRequest(`users/${toggle.dataset.ictDisable}`, { method: 'PUT', body: { active: toggle.dataset.ictActive !== '1' } }); await loadICTWorkspace(); } });
  document.getElementById('ictEmailForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget; const status = document.getElementById('ictMailStatus'); const button = form.querySelector('button[type="submit"]');
    const checked = [...document.querySelectorAll('#ictRecipientList input:checked')].map((input) => input.value);
    const manual = document.getElementById('ictManualRecipients').value.split(/[,;\n]/).map((value) => value.trim()).filter(Boolean);
    const payload = { to: [...new Set([...checked, ...manual])], subject: document.getElementById('ictEmailSubject').value.trim(), text: document.getElementById('ictEmailMessage').value.trim() };
    if (!payload.to.length || !payload.subject || !payload.text) { status.textContent = 'Choose or enter recipients and complete the subject and message.'; status.className = 'ict-mail-status error'; return; }
    button.disabled = true; status.textContent = 'Sending email...'; status.className = 'ict-mail-status';
    try { const response = await fetchWithAuth('/admin/email/send', { method: 'POST', body: payload }); const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Email could not be sent'); status.textContent = `Email processed for ${data.queued} recipient(s).`; status.className = 'ict-mail-status success'; form.reset(); document.querySelectorAll('#ictRecipientList input').forEach((input) => { input.checked = false; }); }
    catch (error) { status.textContent = error.message || 'Email could not be sent'; status.className = 'ict-mail-status error'; }
    finally { button.disabled = false; }
  });
});
