function financeApiUrl() {
  const configured = typeof CONFIG !== 'undefined' && CONFIG.API_URL ? CONFIG.API_URL : `${window.location.origin}/api`;
  return configured.replace(/\/+$/, '');
}

const financeLoginForm = document.getElementById('financeLoginForm');
if (financeLoginForm) {
  financeLoginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const identifier = document.getElementById('financeIdentifier').value.trim();
    const password = document.getElementById('financePassword').value;
    const status = document.getElementById('financeLoginStatus');
    const button = document.getElementById('financeLoginButton');
    status.textContent = '';
    button.disabled = true;
    button.textContent = 'Signing in...';

    try {
      const response = await fetch(`${financeApiUrl()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
        body: JSON.stringify({ name: identifier, password, portal: 'finance' })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Finance login failed');
      const role = String(data.student?.role || '').toLowerCase();
      if (!['finance', 'accountant'].includes(role)) throw new Error('This account is not assigned to the finance portal.');

      sessionStorage.setItem('adminAuthToken', data.token);
      sessionStorage.setItem('adminUser', JSON.stringify(data.student));
      sessionStorage.setItem('tokenTimestamp', String(Date.now()));
      const requestedRedirect = new URLSearchParams(window.location.search).get('redirect');
      const allowedRedirects = new Set(['admin-finance.html', 'admin-finance-balances.html', 'admin-finance-payments.html', 'admin-finance-receipts.html', 'admin-finance-statements.html', 'admin-finance-structure.html', 'admin-finance-upload.html']);
      window.location.replace(allowedRedirects.has(requestedRedirect) ? requestedRedirect : 'admin-finance.html');
    } catch (error) {
      status.textContent = error.message || 'Unable to sign in';
      document.getElementById('financePassword').value = '';
    } finally {
      button.disabled = false;
      button.textContent = 'Sign in';
    }
  });
}
