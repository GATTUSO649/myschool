function getStudentRecoveryApiUrl() {
  const configured = window.CONFIG?.API_URL
    ? window.CONFIG.API_URL
    : `${window.location.origin}/api`;
  return configured.replace(/\/+$/, '');
}

const requestForm = document.getElementById('studentRecoveryRequestForm');
const otpForm = document.getElementById('studentOtpForm');
const passwordForm = document.getElementById('studentPasswordForm');
const admissionInput = document.getElementById('admissionNumber');
const otpInput = document.getElementById('studentOtp');
const statusMessage = document.getElementById('studentRecoveryStatus');
const deliveryMessage = document.getElementById('studentOtpDeliveryMessage');
const resendButton = document.getElementById('resendStudentOtpButton');
const otpSection = document.getElementById('studentOtpSection');
const passwordSection = document.getElementById('studentPasswordSection');
const completePanel = document.getElementById('studentRecoveryComplete');
let transactionToken = '';
let resetAuthorization = '';
let resendTimer = null;
let expiryTimer = null;
let otpExpiresAt = 0;
let resendAvailableAt = 0;
let csrfToken = '';

function showDeliveryMessage(data) {
  deliveryMessage.textContent = data.emailSent
    ? data.message
    : 'If the active student account is eligible, a verification code will be sent to the registered parent/guardian email. Check that inbox or contact school administration.';
  statusMessage.textContent = '';
}

async function recoveryRequest(endpoint, payload) {
  if (!csrfToken) {
    const tokenResponse = await fetch(`${getStudentRecoveryApiUrl()}/auth/csrf-token`, {
      credentials: 'include'
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.token) {
      throw new Error('Could not start a secure recovery session. Refresh the page and try again.');
    }
    csrfToken = tokenData.token;
  }
  const response = await fetch(`${getStudentRecoveryApiUrl()}/auth/student-password-reset/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    const error = new Error(data.message || 'The recovery request could not be completed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function startCountdowns(otpSeconds = 300, cooldownSeconds = 60) {
  window.clearInterval(resendTimer);
  window.clearInterval(expiryTimer);
  otpExpiresAt = Date.now() + otpSeconds * 1000;
  resendAvailableAt = Date.now() + cooldownSeconds * 1000;
  const countdown = document.getElementById('otpCountdown');
  const update = () => {
    const remaining = Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000));
    countdown.textContent = remaining
      ? `Code expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
      : 'This code may have expired. The server will confirm whether it is still valid.';

    const cooldown = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000));
    resendButton.disabled = cooldown > 0;
    resendButton.textContent = cooldown ? `Resend code in ${cooldown}s` : 'Resend code';
  };
  update();
  expiryTimer = window.setInterval(update, 1000);
  resendTimer = window.setInterval(update, 1000);
}

requestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const admissionNumber = admissionInput.value.trim().toUpperCase();
  if (!/^[A-Z0-9]+(?:[/-][A-Z0-9]+)*$/.test(admissionNumber)) {
    statusMessage.textContent = 'Enter a valid admission number, for example CRES/001/2026.';
    admissionInput.focus();
    return;
  }

  const button = document.getElementById('continueRecoveryButton');
  button.disabled = true;
  statusMessage.textContent = 'Submitting recovery request...';
  try {
    const data = await recoveryRequest('request', { admissionNumber });
    transactionToken = data.transactionToken;
    requestForm.hidden = true;
    otpSection.hidden = false;
    showDeliveryMessage(data);
    startCountdowns(data.otpExpiresInSeconds || 300, 60);
    otpInput.focus();
  } catch (error) {
    statusMessage.textContent = error.message || 'Could not start recovery. Please try again later.';
  } finally {
    button.disabled = false;
  }
});

resendButton.addEventListener('click', async () => {
  if (!transactionToken || resendButton.disabled) return;
  resendButton.disabled = true;
  statusMessage.textContent = 'Requesting a new verification code...';
  try {
    const data = await recoveryRequest('resend', { transactionToken });
    showDeliveryMessage(data);
    otpInput.value = '';
    startCountdowns(data.otpExpiresInSeconds || 300, 60);
    otpInput.focus();
  } catch (error) {
    statusMessage.textContent = error.message || 'Could not resend the code.';
    if (error.status === 429) startCountdowns(Math.max(1, Math.ceil((otpExpiresAt - Date.now()) / 1000)), 60);
    else resendButton.disabled = false;
  }
});

document.getElementById('backToAdmissionButton').addEventListener('click', () => {
  otpSection.hidden = true;
  requestForm.hidden = false;
  transactionToken = '';
  otpInput.value = '';
  deliveryMessage.textContent = '';
  statusMessage.textContent = '';
  window.clearInterval(resendTimer);
  window.clearInterval(expiryTimer);
  document.getElementById('continueRecoveryButton').focus();
});

otpForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const otp = otpInput.value.trim();
  if (!/^\d{6}$/.test(otp)) {
    statusMessage.textContent = 'Enter the six-digit verification code.';
    otpInput.focus();
    return;
  }

  const button = document.getElementById('verifyStudentOtpButton');
  button.disabled = true;
  statusMessage.textContent = 'Verifying code...';
  try {
    const data = await recoveryRequest('verify', { transactionToken, otp });
    resetAuthorization = data.authorization;
    otpSection.hidden = true;
    passwordSection.hidden = false;
    window.clearInterval(resendTimer);
    window.clearInterval(expiryTimer);
    statusMessage.textContent = '';
    document.getElementById('newStudentPassword').focus();
  } catch (error) {
    statusMessage.textContent = error.message || 'Could not verify the code.';
  } finally {
    button.disabled = false;
  }
});

document.getElementById('showStudentPassword').addEventListener('change', (event) => {
  const type = event.currentTarget.checked ? 'text' : 'password';
  document.getElementById('newStudentPassword').type = type;
  document.getElementById('confirmStudentPassword').type = type;
});

document.getElementById('newStudentPassword').addEventListener('input', (event) => {
  const password = event.currentTarget.value;
  const strong = password.length >= 12
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /[0-9]/.test(password)
    && /[^A-Za-z0-9]/.test(password)
    && password === password.trim();
  const indicator = document.getElementById('studentPasswordStrength');
  indicator.dataset.strength = strong ? 'strong' : (password ? 'weak' : '');
  indicator.textContent = strong
    ? 'Strong password'
    : password && password !== password.trim()
      ? 'Password cannot begin or end with whitespace.'
    : 'Use at least 12 characters, including uppercase, lowercase, a number, and a symbol.';
});

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const newPassword = document.getElementById('newStudentPassword').value;
  const confirmPassword = document.getElementById('confirmStudentPassword').value;
  if (newPassword !== confirmPassword) {
    statusMessage.textContent = 'The passwords do not match.';
    return;
  }

  const button = document.getElementById('completeStudentResetButton');
  button.disabled = true;
  statusMessage.textContent = 'Updating your password...';
  try {
    const data = await recoveryRequest('complete', { authorization: resetAuthorization, newPassword });
    passwordSection.hidden = true;
    requestForm.hidden = true;
    completePanel.hidden = false;
    document.getElementById('studentBackToLogin').hidden = true;
    statusMessage.textContent = data.message;
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('student');
    sessionStorage.removeItem('rememberMe');
    sessionStorage.removeItem('authSessionExpiresAt');
    transactionToken = '';
    resetAuthorization = '';
    window.setTimeout(() => {
      window.location.assign('/login.html');
    }, 2000);
  } catch (error) {
    statusMessage.textContent = error.message || 'Could not reset the password. Verify your code again.';
  } finally {
    button.disabled = false;
  }
});
