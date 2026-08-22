function ictApiUrl() {
  const configured = typeof CONFIG !== 'undefined' && CONFIG.API_URL ? CONFIG.API_URL : `${window.location.origin}/api`;
  return configured.replace(/\/+$/, '');
}

document.getElementById('ictLoginForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const identifier = document.getElementById('ictIdentifier').value.trim();
  const password = document.getElementById('ictPassword').value;
  const status = document.getElementById('ictLoginStatus');
  const button = document.getElementById('ictLoginButton');
  button.disabled = true; button.textContent = 'Signing in...'; status.textContent = '';
  try {
    const response = await fetch(`${ictApiUrl()}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include', body: JSON.stringify({ name: identifier, password, portal: 'ict' }) });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'ICT login failed');
    const rawRole = String(data.student?.rawRole || '').toLowerCase();
    if (String(data.student?.role || '').toLowerCase() !== 'ict' && rawRole !== 'super_admin') throw new Error('This account is not assigned to the ICT portal.');
    sessionStorage.setItem('authToken', data.token); sessionStorage.setItem('student', JSON.stringify(data.student)); sessionStorage.setItem('authSessionExpiresAt', String(Date.now() + 10 * 60 * 1000));
    window.location.replace('ict-portal.html');
  } catch (error) { status.textContent = error.message || 'Unable to sign in'; document.getElementById('ictPassword').value = ''; }
  finally { button.disabled = false; button.textContent = 'Sign in'; }
});
