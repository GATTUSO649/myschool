function resetApiUrl() {
  const configured = window.CONFIG?.API_URL
    ? window.CONFIG.API_URL
    : `${window.location.origin}/api`;
  return configured.replace(/\/+$/, '');
}

const allowedReturnPages = new Set([
  'login.html',
  'admin-login.html',
  'finance-login.html',
  'ict-login.html',
  'teacher-login.html',
  'department-login.html'
]);
const requestedReturnPage = new URLSearchParams(window.location.search).get('returnTo');
const returnPage = allowedReturnPages.has(requestedReturnPage) ? requestedReturnPage : 'login.html';
const identifierInput = document.getElementById('resetIdentifier');
const requestForm = document.getElementById('resetRequestForm');
const confirmForm = document.getElementById('resetConfirmForm');
const requestStatus = document.getElementById('resetRequestStatus');
const confirmStatus = document.getElementById('resetConfirmStatus');
const sendCodeButton = document.getElementById('sendResetCodeButton');
const confirmButton = document.getElementById('confirmResetButton');
const completePanel = document.getElementById('resetComplete');
let resendCooldownActive = false;
document.getElementById('returnToLogin').href = returnPage;
document.getElementById('backToLogin').href = returnPage;

function startResendCooldown() {
  let secondsRemaining = 60;
  resendCooldownActive = true;
  sendCodeButton.disabled = true;
  sendCodeButton.textContent = `Resend code in ${secondsRemaining}s`;
  const timer = window.setInterval(() => {
    secondsRemaining -= 1;
    if (secondsRemaining <= 0) {
      window.clearInterval(timer);
      resendCooldownActive = false;
      sendCodeButton.disabled = false;
      sendCodeButton.textContent = 'Resend code';
      return;
    }
    sendCodeButton.textContent = `Resend code in ${secondsRemaining}s`;
  }, 1000);
}

requestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const identifier = identifierInput.value.trim();
  if (!identifier) {
    requestStatus.textContent = 'Enter your username, email, admission number, or staff number.';
    return;
  }

  sendCodeButton.disabled = true;
  requestStatus.textContent = 'Submitting reset request...';
  confirmStatus.textContent = '';
  try {
    const response = await fetch(`${resetApiUrl()}/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identifier })
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Could not submit your reset request.');
    confirmForm.hidden = false;
    requestStatus.textContent = `${data.message} Check your inbox and spam folder. If no email is registered, contact school administration.`;
    document.getElementById('resetOtp').focus();
    startResendCooldown();
  } catch (error) {
    console.error('Password reset request failed:', error);
    requestStatus.textContent = error.message || 'Could not submit your reset request. Try again later.';
  } finally {
    if (!resendCooldownActive) sendCodeButton.disabled = false;
  }
});

confirmForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const identifier = identifierInput.value.trim();
  const otp = document.getElementById('resetOtp').value.trim();
  const newPassword = document.getElementById('resetNewPassword').value;
  const confirmPassword = document.getElementById('resetConfirmPassword').value;

  if (!/^\d{6}$/.test(otp)) {
    confirmStatus.textContent = 'Enter the six-digit code from your email.';
    return;
  }
  if (newPassword.length < 12 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
    confirmStatus.textContent = 'Use at least 12 characters with uppercase, lowercase, a number, and a symbol.';
    return;
  }
  if (newPassword !== confirmPassword) {
    confirmStatus.textContent = 'The passwords do not match.';
    return;
  }

  confirmButton.disabled = true;
  confirmStatus.textContent = 'Verifying code and updating password...';
  try {
    const response = await fetch(`${resetApiUrl()}/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identifier, otp, newPassword })
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Could not reset your password.');
    requestForm.hidden = true;
    confirmForm.hidden = true;
    requestStatus.hidden = true;
    confirmStatus.hidden = true;
    completePanel.hidden = false;
    document.getElementById('backToLogin').hidden = true;
  } catch (error) {
    console.error('Password reset confirmation failed:', error);
    confirmStatus.textContent = error.message || 'Could not reset your password. Try again later.';
  } finally {
    confirmButton.disabled = false;
  }
});
