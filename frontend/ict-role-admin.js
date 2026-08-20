async function loadICTAccounts() {
  const body = document.getElementById('ictAccountsBody');
  if (!body) return;
  try {
    const response = await fetchWithAuth('/admin/roles/ict');
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load ICT accounts');
    body.innerHTML = (data.accounts || []).map((account) => `<tr><td>${escapeRoleText(account.name)}</td><td>${escapeRoleText(account.workingArea || '')}</td><td>${escapeRoleText(account.username)}</td><td>${escapeRoleText(account.staffNumber || '')}</td><td>${account.lastLogin ? new Date(account.lastLogin).toLocaleString() : 'Never'}</td><td>${account.active ? 'Active' : 'Inactive'}</td></tr>`).join('') || '<tr><td colspan="6">No ICT accounts assigned yet.</td></tr>';
  } catch (error) {
    body.innerHTML = `<tr><td colspan="6">${escapeRoleText(error.message)}</td></tr>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('ictRoleForm');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.getElementById('ictRoleStatus');
    const button = form.querySelector('button[type="submit"]');
    const payload = { name: document.getElementById('ictRoleName').value.trim(), email: document.getElementById('ictRoleEmail').value.trim(), workingArea: document.getElementById('ictRoleWorkingArea').value };
    if (!payload.name || !payload.email || !payload.workingArea) { status.textContent = 'Complete the name, email, and working area.'; status.className = 'status-message error'; return; }
    button.disabled = true; status.textContent = 'Assigning ICT role...'; status.className = 'status-message';
    try {
      const response = await fetchWithAuth('/admin/roles/ict', { method: 'POST', body: payload });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not assign ICT role');
      status.textContent = `ICT role assigned. Username and initial password: ${data.account.staffNumber}`;
      status.className = 'status-message success'; form.reset(); await loadICTAccounts();
    } catch (error) { status.textContent = error.message || 'Could not assign ICT role'; status.className = 'status-message error'; }
    finally { button.disabled = false; }
  });
  loadICTAccounts();
});