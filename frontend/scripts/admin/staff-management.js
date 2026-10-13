const staffState = { records: [], roleOptions: [], editingStaffId: null };
const staffBody = document.getElementById('staffTableBody');
const roleDialog = document.getElementById('roleDialog');
const roleForm = document.getElementById('roleForm');

function staffEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function staffMessage(elementId, message, isError = true) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('is-error', isError);
  element.classList.toggle('is-success', Boolean(message) && !isError);
}

function roleChoices(container, selectedRoles = []) {
  const selected = new Set(selectedRoles);
  container.innerHTML = staffState.roleOptions.map((role) => `
    <label class="role-choice"><input type="checkbox" value="${staffEscape(role.key)}"${selected.has(role.key) ? ' checked' : ''}><span>${staffEscape(role.name)}</span></label>
  `).join('') || '<p>No assignable roles are configured.</p>';
}

async function loadStaff() {
  staffMessage('directoryMessage', '');
  staffBody.innerHTML = '<tr><td colspan="6">Loading staff…</td></tr>';
  try {
    const response = await fetchWithAuth('/admin/staff');
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Could not load the staff directory.');
    staffState.records = Array.isArray(data.staff) ? data.staff : [];
    staffState.roleOptions = Array.isArray(data.roleOptions) ? data.roleOptions : [];
    roleChoices(document.getElementById('newStaffRoles'));
    const filter = document.getElementById('staffRoleFilter');
    const selectedRole = filter.value;
    filter.innerHTML = '<option value="">All roles</option>' + staffState.roleOptions
      .map((role) => `<option value="${staffEscape(role.key)}">${staffEscape(role.name)}</option>`).join('');
    filter.value = selectedRole;
    renderStaff();
  } catch (error) {
    staffBody.innerHTML = '<tr><td colspan="6">Staff records could not be loaded.</td></tr>';
    staffMessage('directoryMessage', error.message || 'Could not load the staff directory.');
  }
}

function formatLastLogin(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

function renderStaff() {
  const search = document.getElementById('staffSearch').value.trim().toLowerCase();
  const role = document.getElementById('staffRoleFilter').value;
  const status = document.getElementById('staffStatusFilter').value;
  const rows = staffState.records.filter((staff) => {
    const matchesSearch = !search || [staff.name, staff.email, staff.staffNumber, staff.username]
      .some((value) => String(value || '').toLowerCase().includes(search));
    const matchesRole = !role || staff.roles.includes(role);
    const matchesStatus = !status || (staff.active ? 'active' : 'inactive') === status;
    return matchesSearch && matchesRole && matchesStatus;
  });
  document.getElementById('staffCount').textContent = `${rows.length} of ${staffState.records.length} staff records`;
  if (!rows.length) {
    staffBody.innerHTML = '<tr><td colspan="6">No staff match the selected search and filters.</td></tr>';
    return;
  }
  const roleNames = new Map(staffState.roleOptions.map((item) => [item.key, item.name]));
  staffBody.innerHTML = rows.map((staff) => `
    <tr>
      <td><strong>${staffEscape(staff.name)}</strong><span>${staffEscape(staff.staffNumber || staff.username || '')}</span><span>${staffEscape(staff.email || '')}</span></td>
      <td>${(staff.roles || []).map((key) => `<span class="staff-role-badge">${staffEscape(roleNames.get(key) || key)}</span>`).join('') || 'No assigned role'}</td>
      <td>${staffEscape(staff.departments || '—')}</td>
      <td><span class="staff-status ${staff.active ? 'is-active' : 'is-inactive'}">${staff.active ? 'Active' : 'Inactive'}</span>${staff.mustChangePassword ? '<span class="staff-temporary">Password change required</span>' : ''}</td>
      <td>${staffEscape(formatLastLogin(staff.lastLogin))}</td>
      <td class="staff-actions">
        <button type="button" class="secondary-button" data-edit-roles="${Number(staff.id)}">Roles</button>
        <button type="button" class="secondary-button" data-appointments="${Number(staff.id)}">History</button>
        <button type="button" class="secondary-button" data-toggle-status="${Number(staff.id)}" data-active="${staff.active ? 'true' : 'false'}">${staff.active ? 'Deactivate' : 'Activate'}</button>
      </td>
    </tr>
  `).join('');
}

function selectedRoles(container) {
  return [...container.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
}

document.getElementById('staffAppointmentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  staffMessage('appointmentMessage', '');
  const form = event.currentTarget;
  const formData = new FormData(form);
  const roles = selectedRoles(document.getElementById('newStaffRoles'));
  if (!roles.length) {
    staffMessage('appointmentMessage', 'Assign at least one role.');
    return;
  }
  const button = document.getElementById('createStaffButton');
  button.disabled = true;
  try {
    const response = await fetchWithAuth('/admin/staff', {
      method: 'POST',
      body: {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        startDate: formData.get('startDate'),
        roles
      }
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Staff appointment could not be created.');
    staffMessage('appointmentMessage', `Created ${data.staff.staffNumber}. Give the staff member this username; it is also the one-time initial password.`, false);
    form.reset();
    await loadStaff();
  } catch (error) {
    staffMessage('appointmentMessage', error.message || 'Staff appointment could not be created.');
  } finally {
    button.disabled = false;
  }
});

document.getElementById('refreshStaff').addEventListener('click', loadStaff);
document.getElementById('staffSearch').addEventListener('input', renderStaff);
document.getElementById('staffRoleFilter').addEventListener('change', renderStaff);
document.getElementById('staffStatusFilter').addEventListener('change', renderStaff);
document.getElementById('staffTableBody').addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const staffId = Number(button.dataset.editRoles || button.dataset.appointments || button.dataset.toggleStatus);
  const staff = staffState.records.find((record) => Number(record.id) === staffId);
  if (!staff) return;
  if (button.hasAttribute('data-edit-roles')) {
    staffState.editingStaffId = staffId;
    document.getElementById('roleDialogStaff').textContent = `${staff.name} · ${staff.staffNumber || staff.username}`;
    roleChoices(document.getElementById('editStaffRoles'), staff.roles);
    staffMessage('roleMessage', '');
    roleDialog.showModal();
    return;
  }
  if (button.hasAttribute('data-appointments')) {
    const history = document.getElementById('appointmentHistory');
    history.textContent = 'Loading appointment history…';
    document.getElementById('appointmentDialog').showModal();
    try {
      const response = await fetchWithAuth(`/admin/staff/${staffId}/appointments`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not load appointment history.');
      history.innerHTML = data.appointments.length ? data.appointments.map((item) => `
        <article class="appointment-record"><strong>${staffEscape(item.category)}</strong><span>Started ${staffEscape(item.startDate)}</span><span>${staffEscape((item.roles || []).join(', '))}</span><span>Status: ${staffEscape(item.status)}</span></article>
      `).join('') : '<p>No appointment history is available.</p>';
    } catch (error) {
      history.textContent = error.message || 'Could not load appointment history.';
    }
    return;
  }
  const activate = button.dataset.active !== 'true';
  if (!window.confirm(`${activate ? 'Activate' : 'Deactivate'} access for ${staff.name}?`)) return;
  try {
    const response = await fetchWithAuth(`/admin/staff/${staffId}/status`, { method: 'PATCH', body: { active: activate } });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Staff status could not be updated.');
    await loadStaff();
  } catch (error) {
    staffMessage('directoryMessage', error.message || 'Staff status could not be updated.');
  }
});

document.getElementById('saveRolesButton').addEventListener('click', async () => {
  const roles = selectedRoles(document.getElementById('editStaffRoles'));
  if (!roles.length) {
    staffMessage('roleMessage', 'Staff must retain at least one role.');
    return;
  }
  const button = document.getElementById('saveRolesButton');
  button.disabled = true;
  try {
    const response = await fetchWithAuth(`/admin/staff/${staffState.editingStaffId}/roles`, { method: 'PUT', body: { roles } });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Role assignments could not be updated.');
    roleDialog.close();
    await loadStaff();
  } catch (error) {
    staffMessage('roleMessage', error.message || 'Role assignments could not be updated.');
  } finally {
    button.disabled = false;
  }
});

document.querySelectorAll('[data-toggle-sidebar]').forEach((button) => {
  button.addEventListener('click', () => {
    const sidebar = document.querySelector('.student-sidebar');
    const open = sidebar.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(open));
  });
});
document.querySelectorAll('[data-admin-logout]').forEach((button) => button.addEventListener('click', (event) => {
  event.preventDefault();
  if (typeof logout === 'function') logout();
  else window.location.replace('/admin-login.html');
}));

if (typeof checkAuth === 'function') checkAuth();
loadStaff();
