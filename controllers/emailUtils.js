const { Resend } = require('resend');
const { query } = require('../config/db');
const { logActivity } = require('./logController');

const STUDENT_EMAIL_DOMAIN = 'cresent.ac.ke';

function normalizeSmtpSecure(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(trimmed)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(trimmed)) return false;
  }
  return Boolean(fallback);
}

function sanitizeRecipientEmail(value) {
  return String(value || '').trim();
}

function isValidRecipientEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizeRecipientEmail(value));
}

function emailLocalPart(value, fallback = 'student') {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 50) || fallback;
}

function schoolEmail(value, fallback) {
  const email = String(value || '').trim().toLowerCase();
  if (email.endsWith('.ac.ke')) return email;
  return `${emailLocalPart(email || fallback)}@${STUDENT_EMAIL_DOMAIN}`;
}

function getSmtpConfiguration() {
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpSecure = String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true';
  const smtpFrom = String(process.env.SMTP_FROM || '').trim();
  const fromMatch = smtpFrom.match(/<([^<>\s]+@[^<>\s]+)>/);
  const configuredFromAddress = (fromMatch ? fromMatch[1] : smtpFrom).trim().toLowerCase();
  const fromAddress = isValidRecipientEmail(configuredFromAddress)
    ? configuredFromAddress
    : String(process.env.SMTP_USER || '').trim().toLowerCase();
  return {
    host: String(process.env.SMTP_HOST || '').trim(),
    port: smtpPort,
    secure: smtpSecure,
    user: String(process.env.SMTP_USER || '').trim(),
    password: String(process.env.SMTP_PASS || ''),
    from: isValidRecipientEmail(configuredFromAddress)
      ? smtpFrom
      : (process.env.SMTP_USER ? `Crescent High School <${process.env.SMTP_USER}>` : ''),
    fromAddress
  };
}

function getEmailConfiguration() {
  const provider = String(process.env.EMAIL_PROVIDER || (process.env.RESEND_API_KEY ? 'resend' : 'smtp')).trim().toLowerCase();
  if (provider === 'resend') {
    const from = String(process.env.EMAIL_FROM || '').trim();
    const fromMatch = from.match(/<([^<>\s]+@[^<>\s]+)>/);
    const fromAddress = (fromMatch ? fromMatch[1] : from).trim().toLowerCase();
    return {
      provider,
      apiKey: String(process.env.RESEND_API_KEY || ''),
      from: isValidRecipientEmail(fromAddress) ? from : '',
      fromAddress: isValidRecipientEmail(fromAddress) ? fromAddress : ''
    };
  }

  const smtp = getSmtpConfiguration();
  const from = String(process.env.EMAIL_FROM || smtp.from || '').trim();
  const fromMatch = from.match(/<([^<>\s]+@[^<>\s]+)>/);
  const fromAddress = (fromMatch ? fromMatch[1] : from).trim().toLowerCase();
  return {
    provider,
    apiKey: String(process.env.RESEND_API_KEY || ''),
    from: isValidRecipientEmail(fromAddress) ? from : smtp.from,
    fromAddress: isValidRecipientEmail(fromAddress) ? fromAddress : smtp.fromAddress
  };
}

function getSafeSmtpStatus() {
  const email = getEmailConfiguration();
  if (email.provider === 'resend') {
    return {
      provider: 'resend',
      apiConfigured: Boolean(email.apiKey),
      emailFromConfigured: Boolean(email.from),
      hostConfigured: false,
      portConfigured: false,
      secureConfigured: false,
      userConfigured: false,
      passwordConfigured: false,
      fromConfigured: Boolean(email.from),
      host: null,
      port: null,
      secure: null
    };
  }
  const configuration = getSmtpConfiguration();
  return {
    provider: email.provider,
    apiConfigured: Boolean(email.apiKey),
    emailFromConfigured: Boolean(email.from),
    hostConfigured: Boolean(configuration.host),
    portConfigured: Boolean(process.env.SMTP_PORT),
    secureConfigured: Boolean(process.env.SMTP_SECURE),
    userConfigured: Boolean(configuration.user),
    passwordConfigured: Boolean(configuration.password),
    fromConfigured: Boolean(configuration.from),
    host: configuration.host || null,
    port: configuration.port,
    secure: configuration.secure
  };
}

function createTransport() {
  const configuration = getSmtpConfiguration();
  if (!configuration.host || !configuration.user || !configuration.password) return null;
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.secure,
    requireTLS: configuration.port === 587,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: { user: configuration.user, pass: configuration.password },
    tls: { rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false' }
  });
}

function classifyEmailError(error) {
  const code = String(error?.code || '').toUpperCase();
  const responseCode = Number(error?.responseCode || 0);
  const message = String(error?.message || '').toLowerCase();
  if (['EAUTH', 'AUTH'].includes(code) || responseCode === 535 || message.includes('authentication')) return 'SMTP_AUTHENTICATION_FAILED';
  if (['ETIMEDOUT', 'ESOCKET', 'ECONNECTION'].includes(code) || message.includes('timeout')) return 'SMTP_CONNECTION_TIMEOUT';
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code) || message.includes('getaddrinfo')) return 'SMTP_DNS_FAILED';
  if (code === 'ETLS' || message.includes('tls') || message.includes('certificate')) return 'SMTP_TLS_FAILED';
  if (responseCode >= 500 || responseCode === 550 || responseCode === 553) return 'SMTP_MESSAGE_REJECTED';
  return 'SMTP_DELIVERY_FAILED';
}

function classifyProviderError(error) {
  const code = String(error?.code || '').toUpperCase();
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  if (name === 'validation_error' && message.includes('domain is not verified')) return 'EMAIL_SENDER_NOT_VERIFIED';
  if (code === 'ETIMEDOUT') return 'EMAIL_API_TIMEOUT';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'EMAIL_API_DNS_FAILED';
  if (code === 'HTTP_401' || code === 'HTTP_403' || code === 'INVALID_API_KEY') return 'EMAIL_API_AUTHENTICATION_FAILED';
  if (code.startsWith('HTTP_')) return 'EMAIL_API_REJECTED';
  return 'EMAIL_API_DELIVERY_FAILED';
}

async function recordEmailLog({ applicationId = null, recipient, emailType, subject, status = 'PENDING', failureReason = null, triggeredBy = null }) {
  const safeRecipient = sanitizeRecipientEmail(recipient) || 'unknown@missing.invalid';
  try {
    await query(
      `INSERT INTO email_logs (application_id, recipient, email_type, subject, status, failure_reason, triggered_by, sent_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [applicationId || null, safeRecipient, emailType, subject, status, failureReason || null, triggeredBy || null, status === 'SENT' ? new Date() : null]
    );
  } catch (error) {
    console.warn('Email log write failed:', error.message || error);
  }
}

async function verifyMailTransport() {
  const email = getEmailConfiguration();
  if (email.provider === 'resend') {
    const status = { ...getSafeSmtpStatus(), configured: Boolean(email.apiKey && email.from), reachable: false };
    if (!status.configured) return { ...status, message: 'EMAIL_API_REQUIRED_VARIABLES_MISSING' };
    try {
      const resend = new Resend(email.apiKey);
      const { data, error } = await resend.domains.list();
      if (error) return { ...status, failureReason: classifyProviderError(error), message: 'EMAIL_API_VERIFICATION_FAILED' };
      const senderDomain = email.fromAddress.split('@')[1];
      const verifiedDomain = Array.isArray(data) && data.some((domain) => String(domain.name || domain.domain || '').toLowerCase() === senderDomain);
      if (!verifiedDomain) return { ...status, failureReason: 'EMAIL_SENDER_NOT_VERIFIED', message: 'EMAIL_SENDER_NOT_VERIFIED' };
      return { ...status, reachable: true };
    } catch (error) {
      const failureReason = classifyProviderError(error);
      console.warn('Email provider verification failed:', failureReason);
      return { ...status, failureReason, message: 'EMAIL_API_VERIFICATION_FAILED' };
    }
  }
  const transport = createTransport();
  if (!transport) return { ...getSafeSmtpStatus(), configured: false, reachable: false, message: 'SMTP_REQUIRED_VARIABLES_MISSING' };
  try {
    await transport.verify();
    return { ...getSafeSmtpStatus(), configured: true, reachable: true };
  } catch (error) {
    const failureReason = classifyEmailError(error);
    console.warn('SMTP verification failed:', failureReason);
    return { ...getSafeSmtpStatus(), configured: true, reachable: false, failureReason, message: 'SMTP_VERIFICATION_FAILED' };
  }
}

async function deliverMail({ to, subject, text, html, applicationId = null, emailType = 'GENERAL', triggeredBy = null }) {
  const email = getEmailConfiguration();
  const transport = email.provider === 'smtp' ? createTransport() : null;
  const destination = sanitizeRecipientEmail(to);
  const safeSubject = String(subject || 'Portal Notification').trim() || 'Portal Notification';
  if (!destination) {
    await recordEmailLog({ applicationId, recipient: 'missing@invalid', emailType, subject: safeSubject, status: 'FAILED', failureReason: 'MISSING_RECIPIENT', triggeredBy });
    return { delivered: false, messageId: null, failureReason: 'MISSING_RECIPIENT' };
  }

  if (!isValidRecipientEmail(destination)) {
    await recordEmailLog({ applicationId, recipient: destination, emailType, subject: safeSubject, status: 'FAILED', failureReason: 'INVALID_RECIPIENT', triggeredBy });
    return { delivered: false, messageId: null, failureReason: 'INVALID_RECIPIENT' };
  }

  if (email.provider === 'resend') {
    if (!email.apiKey || !email.from) {
      const failureReason = 'EMAIL_API_REQUIRED_VARIABLES_MISSING';
      await recordEmailLog({ applicationId, recipient: destination, emailType, subject: safeSubject, status: 'FAILED', failureReason, triggeredBy });
      return { delivered: false, messageId: null, failureReason };
    }
    try {
      const resend = new Resend(email.apiKey);
      const result = await resend.emails.send({
        from: email.from,
        to: [destination],
        subject: safeSubject,
        text: String(text || '').trim() || 'Portal notification',
        html: html || '<p>Portal notification</p>'
      });
      if (result.error) throw result.error;
      await recordEmailLog({ applicationId, recipient: destination, emailType, subject: safeSubject, status: 'SENT', triggeredBy });
      console.log('Email sent successfully. provider: resend');
      return { delivered: true, messageId: result.data?.id || null };
    } catch (error) {
      const failureReason = classifyProviderError(error);
      console.warn('Email delivery failed:', failureReason);
      await recordEmailLog({ applicationId, recipient: destination, emailType, subject: safeSubject, status: 'FAILED', failureReason, triggeredBy });
      return { delivered: false, messageId: null, failureReason };
    }
  }

  if (!transport) {
    const failureReason = 'SMTP_REQUIRED_VARIABLES_MISSING';
    await recordEmailLog({ applicationId, recipient: destination, emailType, subject: safeSubject, status: 'FAILED', failureReason, triggeredBy });
    console.warn('SMTP is not configured. Email not delivered to:', destination);
    return { delivered: false, messageId: null, failureReason };
  }

  try {
    const info = await transport.sendMail({
      from: getSmtpConfiguration().from,
      to: destination,
      subject: safeSubject,
      text: String(text || '').trim() || 'Portal notification',
      html: html || '<p>Portal notification</p>'
    });
    await recordEmailLog({ applicationId, recipient: destination, emailType, subject: safeSubject, status: 'SENT', triggeredBy });
    return { delivered: true, messageId: info.messageId };
  } catch (error) {
    const failureReason = classifyEmailError(error);
    console.warn('Email delivery failed:', failureReason);
    await recordEmailLog({ applicationId, recipient: destination, emailType, subject: safeSubject, status: 'FAILED', failureReason, triggeredBy });
    return { delivered: false, messageId: null, failureReason };
  }
}

function escapeEmailHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function emailShell({ title, eyebrow, content, schoolEmailAddress }) {
  const schoolEmail = escapeEmailHtml(schoolEmailAddress || 'info@cresenthighschool.com');
  const schoolPhone = escapeEmailHtml(process.env.SCHOOL_PHONE || '');
  const schoolWebsite = escapeEmailHtml(process.env.APP_URL || 'https://cresenthighschool.onrender.com');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeEmailHtml(title)}</title></head><body style="margin:0;padding:0;background:#eef3f8;font-family:Arial,Helvetica,sans-serif;color:#172b4d;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f8;width:100%;"><tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #dbe4ee;">
      <tr><td style="background:#102a43;padding:30px 36px;color:#ffffff;"><div style="font-size:12px;letter-spacing:2px;color:#b9d8f2;font-weight:bold;">${escapeEmailHtml(eyebrow)}</div><h1 style="margin:10px 0 0;font-size:26px;line-height:1.2;letter-spacing:.5px;">CRESCENT HIGH SCHOOL</h1><div style="margin-top:8px;color:#d9e8f5;font-size:14px;">Student Admissions &amp; Administration</div></td></tr>
      <tr><td style="padding:36px 38px;">${content}</td></tr>
      <tr><td style="background:#f4f7fa;padding:22px 30px;text-align:center;color:#526579;font-size:12px;line-height:1.8;">Admissions Office &middot; Crescent High School<br>${schoolEmail}${schoolPhone ? ` &middot; ${schoolPhone}` : ''}<br><a href="${schoolWebsite}" style="color:#1b5d91;text-decoration:none;">${schoolWebsite}</a></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function emailDetailTable(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:14px 0 26px;font-size:14px;">${rows.map(([label, value]) => `<tr><td style="width:42%;padding:11px 12px;border-bottom:1px solid #e6edf3;color:#526579;font-weight:bold;">${escapeEmailHtml(label)}</td><td style="padding:11px 12px;border-bottom:1px solid #e6edf3;color:#172b4d;">${escapeEmailHtml(value)}</td></tr>`).join('')}</table>`;
}

function statusBanner(label, background, color) {
  return `<div style="margin:20px 0 28px;padding:16px 18px;background:${background};border-left:5px solid ${color};color:${color};font-size:15px;font-weight:bold;letter-spacing:1px;">${label}</div>`;
}

function buildReceivedEmailHtml({ fullName, applicationReference, submittedDate, schoolEmailAddress }) {
  const content = `<p style="margin:0 0 18px;font-size:16px;line-height:1.7;">Dear Parent/Guardian,</p>
    <p style="margin:0 0 18px;font-size:16px;line-height:1.7;">Thank you for choosing Crescent High School.</p>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.7;">We are pleased to confirm that the admission application for the following student has been successfully received:</p>
    <h2 style="margin:0;color:#102a43;font-size:15px;letter-spacing:1px;">STUDENT DETAILS</h2>
    ${emailDetailTable([['Student Name', fullName || 'Applicant'], ['Application Reference', applicationReference || 'N/A'], ['Date Submitted', submittedDate || new Date().toISOString().slice(0, 10)]])}
    ${statusBanner('PENDING REVIEW', '#fff7df', '#8a5a00')}
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">Your application has been successfully submitted and is now awaiting review by our admissions team.</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#526579;"><strong>Please note:</strong> This email confirms receipt of your application and does not constitute admission to Crescent High School.</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.7;">Once the application has been reviewed, you will receive another email informing you whether the application has been approved or rejected.</p>
    <p style="margin:0;font-size:15px;line-height:1.7;">Thank you for your interest in Crescent High School.</p>
    <p style="margin:28px 0 0;font-size:15px;line-height:1.7;">Kind regards,<br><strong>Admissions Office</strong><br>Crescent High School<br>Student Admissions &amp; Administration</p>`;
  return emailShell({ title: 'Application Received Successfully', eyebrow: 'APPLICATION RECEIVED', content, schoolEmailAddress });
}

function buildApprovalEmailHtml({ fullName, admissionNumber, className, stream, academicYear, portalUrl, loginLabel, initialPasswordText, schoolEmailAddress }) {
  const content = `<p style="margin:0 0 18px;font-size:16px;line-height:1.7;">Dear Parent/Guardian,</p>
    <p style="margin:0 0 6px;font-size:21px;line-height:1.4;color:#1d6b45;font-weight:bold;">Congratulations!</p>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.7;">We are pleased to inform you that the admission application for <strong>${escapeEmailHtml(fullName || 'the student')}</strong> has been approved.</p>
    <h2 style="margin:0;color:#102a43;font-size:15px;letter-spacing:1px;">STUDENT DETAILS</h2>
    ${emailDetailTable([['Student Name', fullName || 'Student'], ['Admission Number', admissionNumber || 'Pending'], ['Form', className || 'Assigned by administration'], ['Stream', stream || 'Assigned by administration'], ['Academic Year', academicYear || 'N/A']])}
    ${statusBanner('ADMISSION APPROVED', '#e7f6ed', '#1d6b45')}
    <h2 style="margin:0;color:#102a43;font-size:15px;letter-spacing:1px;">STUDENT PORTAL LOGIN DETAILS</h2>
    ${emailDetailTable([['Portal', portalUrl || 'Student Portal'], ['Username', loginLabel || admissionNumber || 'Student'], ['Password', initialPasswordText || 'Your admission number']])}
    <p style="margin:0 0 24px;padding:14px 16px;background:#f4f7fa;color:#526579;font-size:14px;line-height:1.7;">For security, the student should change the initial password after the first successful login if this feature is enabled.</p>
    <h2 style="margin:0;color:#102a43;font-size:15px;letter-spacing:1px;">IMPORTANT INFORMATION</h2>
    <ul style="margin:14px 0 24px;padding-left:20px;color:#334e68;font-size:15px;line-height:1.9;"><li>Keep your admission number safe.</li><li>Do not share your login credentials.</li><li>Use the official student portal.</li><li>Check the portal regularly for school updates.</li></ul>
    <p style="margin:0;font-size:15px;line-height:1.7;">We warmly welcome ${escapeEmailHtml(fullName || 'the student')} to Crescent High School and look forward to supporting their academic journey.</p>
    <p style="margin:28px 0 0;font-size:15px;line-height:1.7;">Kind regards,<br><strong>Admissions Office</strong><br>Crescent High School<br>Student Admissions &amp; Administration</p>`;
  return emailShell({ title: 'Admission Application Approved', eyebrow: 'ADMISSION APPROVED', content, schoolEmailAddress });
}

function buildRejectionEmailHtml({ fullName, applicationReference, className, decisionDate, reason, schoolEmailAddress }) {
  const safeReason = reason && String(reason).trim() ? String(reason).trim() : 'Please contact the school admissions office if you require further information regarding this decision.';
  const content = `<p style="margin:0 0 18px;font-size:16px;line-height:1.7;">Dear Parent/Guardian,</p>
    <p style="margin:0 0 18px;font-size:16px;line-height:1.7;">Thank you for your interest in Crescent High School and for taking the time to submit an admission application.</p>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.7;">After reviewing the application, we regret to inform you that the application for <strong>${escapeEmailHtml(fullName || 'the student')}</strong> was not approved.</p>
    <h2 style="margin:0;color:#102a43;font-size:15px;letter-spacing:1px;">STUDENT DETAILS</h2>
    ${emailDetailTable([['Student Name', fullName || 'Student'], ['Application Reference', applicationReference || 'N/A'], ['Applying For', className || 'As submitted'], ['Decision Date', decisionDate || new Date().toISOString().slice(0, 10)]])}
    ${statusBanner('NOT APPROVED', '#fff0f0', '#a33a3a')}
    <p style="margin:0 0 8px;font-size:15px;font-weight:bold;color:#102a43;">Reason:</p><p style="margin:0 0 24px;padding:16px;background:#f8fafc;color:#526579;font-size:15px;line-height:1.7;">${escapeEmailHtml(safeReason)}</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.7;">We understand that this may be disappointing, and we sincerely appreciate your interest in Crescent High School.</p>
    <p style="margin:0;font-size:15px;line-height:1.7;">If you require further clarification regarding this decision, please contact the school's admissions office using the official contact details below.</p>
    <p style="margin:28px 0 0;font-size:15px;line-height:1.7;">Kind regards,<br><strong>Admissions Office</strong><br>Crescent High School<br>Student Admissions &amp; Administration</p>`;
  return emailShell({ title: 'Admission Application Update', eyebrow: 'APPLICATION UPDATE', content, schoolEmailAddress });
}

async function sendAdmissionApprovalEmail({ to, fullName, admissionNumber, loginUsername, initialPassword, stream, className, academicYear, applicationReference, portalUrl, applicationId = null, triggeredBy = null }) {
  const subject = 'Crescent High School – Admission Application Approved';
  const loginText = String(initialPassword || '').trim();
  const initialPasswordDisplay = loginText && loginText !== 'undefined' ? loginText : 'Your admission number';
  const html = buildApprovalEmailHtml({
    fullName,
    admissionNumber,
    className,
    stream,
    academicYear,
    applicationReference,
    portalUrl: portalUrl || `${process.env.APP_URL || 'https://cresenthighschool.onrender.com'}/login.html`,
    loginLabel: loginUsername || admissionNumber || 'Student',
    initialPasswordText: initialPasswordDisplay,
    schoolEmailAddress: process.env.SMTP_FROM || 'info@cresenthighschool.com'
  });
  const text = [
    'Dear Parent/Guardian,',
    '',
    'Congratulations!',
    `We are pleased to inform you that the admission application for ${fullName || 'the student'} has been APPROVED.`,
    '',
    'STUDENT DETAILS',
    `Student Name: ${fullName}`,
    `Admission Number: ${admissionNumber || 'N/A'}`,
    `Form: ${className || 'Assigned by administration'}`,
    `Stream: ${stream || 'Assigned by administration'}`,
    `Academic Year: ${academicYear || 'N/A'}`,
    '',
    'STUDENT PORTAL LOGIN DETAILS',
    `Portal: ${portalUrl || `${process.env.APP_URL || 'https://cresenthighschool.onrender.com'}/login.html`}`,
    `Username: ${loginUsername || admissionNumber || 'Student'}`,
    `Password: ${initialPasswordDisplay}`,
    '',
    'IMPORTANT INFORMATION',
    '- Keep your admission number safe.',
    '- Do not share your login credentials.',
    '- Use the official student portal.',
    '- Check the portal regularly for school updates.',
    '',
    `We warmly welcome ${fullName || 'the student'} to Crescent High School and look forward to supporting their academic journey.`,
    '',
    'Kind regards,',
    'Admissions Office',
    'Crescent High School',
    'Student Admissions & Administration'
  ].join('\n');
  return deliverMail({ to, subject, text, html, applicationId, emailType: 'APPLICATION_APPROVED', triggeredBy });
}

async function sendApplicationRejectionEmail({ to, fullName, applicationReference, className, decisionDate, reason, applicationId = null, triggeredBy = null }) {
  const subject = 'Crescent High School – Admission Application Update';
  const html = buildRejectionEmailHtml({
    fullName,
    applicationReference,
    className: className || 'As submitted',
    decisionDate,
    reason,
    schoolEmailAddress: process.env.SMTP_FROM || 'info@cresenthighschool.com'
  });
  const text = [
    'Dear Parent/Guardian,',
    '',
    'Thank you for your interest in Crescent High School and for taking the time to submit an admission application.',
    `After reviewing the application, we regret to inform you that the application for ${fullName || 'the student'} was not approved.`,
    '',
    'STUDENT DETAILS',
    `Student Name: ${fullName}`,
    `Application Reference: ${applicationReference || 'N/A'}`,
    `Applying For: ${className || 'As submitted'}`,
    `Decision Date: ${decisionDate || new Date().toISOString().slice(0, 10)}`,
    '',
    'APPLICATION STATUS',
    'NOT APPROVED',
    '',
    `Reason: ${reason || 'Please contact the school admissions office if you require further information regarding this decision.'}`,
    '',
    'We understand that this may be disappointing, and we sincerely appreciate your interest in Crescent High School.',
    'If you require further clarification regarding this decision, please contact the school admissions office using the official contact details below.',
    '',
    'Kind regards,',
    'Admissions Office',
    'Crescent High School',
    'Student Admissions & Administration'
  ].join('\n');
  return deliverMail({ to, subject, text, html, applicationId, emailType: 'APPLICATION_REJECTED', triggeredBy });
}

async function sendPasswordResetEmail({ to, otp, temporaryPassword }) {
  const subject = 'Password Reset Instructions - Crescent High School';
  const text = [
    'A password reset was requested for your Crescent High School portal account.',
    `OTP: ${otp}`,
    `Temporary password: ${temporaryPassword}`,
    'Use the OTP and your new password on the portal reset page to finish the reset.',
    'If you did not request this, contact the school administration immediately.'
  ].join('\n');

  const result = await deliverMail({ to, subject, text, emailType: 'PASSWORD_RESET' });
  await logActivity(null, 'password_reset_email_sent', `Password reset email sent to ${to}`, null);
  return result;
}

async function sendApplicationConfirmationEmail({ to, fullName, applicationId = null, triggeredBy = null }) {
  const subject = 'Crescent High School – Application Received Successfully';
  const submittedDate = new Date().toISOString().slice(0, 10);
  const html = buildReceivedEmailHtml({
    fullName,
    applicationReference: applicationId ? String(applicationId).padStart(4, '0') : 'N/A',
    submittedDate,
    schoolEmailAddress: process.env.SMTP_FROM || 'info@cresenthighschool.com'
  });
  const text = [
    'Dear Parent/Guardian,',
    '',
    'Thank you for choosing Crescent High School.',
    'We are pleased to confirm that the admission application for the following student has been successfully received:',
    '',
    'STUDENT DETAILS',
    `Student Name: ${fullName || 'Applicant'}`,
    `Application Reference: ${applicationId ? String(applicationId).padStart(4, '0') : 'N/A'}`,
    `Date Submitted: ${submittedDate}`,
    '',
    'APPLICATION STATUS',
    'PENDING REVIEW',
    '',
    'Your application has been successfully submitted and is now awaiting review by our admissions team.',
    'Please note that this email confirms receipt of your application and does not constitute admission to Crescent High School.',
    'Once the application has been reviewed, you will receive another email informing you whether the application has been approved or rejected.',
    '',
    'Thank you for your interest in Crescent High School.',
    '',
    'Kind regards,',
    'Admissions Office',
    'Crescent High School',
    'Student Admissions & Administration'
  ].join('\n');

  const result = await deliverMail({ to, subject, text, html, applicationId, emailType: 'APPLICATION_SUBMITTED', triggeredBy });
  if (result.delivered) {
    await logActivity(triggeredBy, 'application_confirmation_email_sent', `Application confirmation email sent to ${to}`, null);
  }
  return result;
}

async function recordAuditEvent(userId, action, details, req) {
  try {
    await query(
      'INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [userId || null, action, details, req?.ip || null]
    );
  } catch (error) {
    console.warn('Audit log write failed:', error.message);
  }
}

module.exports = {
  STUDENT_EMAIL_DOMAIN,
  schoolEmail,
  sanitizeRecipientEmail,
  isValidRecipientEmail,
  normalizeSmtpSecure,
  getSmtpConfiguration,
  getEmailConfiguration,
  getSafeSmtpStatus,
  classifyEmailError,
  sendAdmissionApprovalEmail,
  sendApplicationRejectionEmail,
  sendPasswordResetEmail,
  sendApplicationConfirmationEmail,
  deliverMail,
  verifyMailTransport,
  recordAuditEvent,
  recordEmailLog
};
