async function loadFinanceAccounts() {
  const body = document.getElementById('financeAccountsBody');
  if (!body) return;
  try {
    const response = await fetchWithAuth('/admin/roles/finance');
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load finance accounts');
    body.innerHTML = (data.accounts || []).map((account) => `<tr><td>${escapeRoleText(account.name)}</td><td>${escapeRoleText(account.workingArea || '')}</td><td>${escapeRoleText(account.username)}</td><td>${escapeRoleText(account.staffNumber || '')}</td><td>${account.lastLogin ? new Date(account.lastLogin).toLocaleString() : 'Never'}</td><td>${account.active ? 'Active' : 'Inactive'}</td></tr>`).join('') || '<tr><td colspan="6">No finance accounts assigned yet.</td></tr>';
  } catch (error) {
    body.innerHTML = `<tr><td colspan="6">${escapeRoleText(error.message)}</td></tr>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('financeRoleForm');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.getElementById('financeRoleStatus');
    const button = form.querySelector('button[type="submit"]');
    const payload = {
      name: document.getElementById('financeRoleName').value.trim(),
      email: document.getElementById('financeRoleEmail').value.trim(),
      workingArea: document.getElementById('financeRoleWorkingArea').value
    };
    if (!payload.name || !payload.email || !payload.workingArea) {
      status.textContent = 'Complete the name, email, and working area.';
      status.className = 'status-message error';
      return;
    }
    button.disabled = true;
    status.textContent = 'Assigning role...';
    status.className = 'status-message';
    try {
      const response = await fetchWithAuth('/admin/roles/finance', { method: 'POST', body: payload });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not assign finance role');
      status.textContent = `Finance role assigned. Staff number: ${data.account.staffNumber}`;
      status.className = 'status-message success';
      form.reset();
      await loadFinanceAccounts();
    } catch (error) {
      status.textContent = error.message || 'Could not assign finance role';
      status.className = 'status-message error';
    } finally {
      button.disabled = false;
    }
  });
  loadFinanceAccounts();
});