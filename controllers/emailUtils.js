const nodemailer = require('nodemailer');
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

function createTransport() {
  const host = process.env.SMTP_HOST || process.env.SMTP_HOSTNAME;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = normalizeSmtpSecure(process.env.SMTP_SECURE, port === 465);
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    } : undefined,
    tls: { rejectUnauthorized: false }
  });
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
  const transport = createTransport();
  if (!transport) return { configured: false, reachable: false, message: 'SMTP is not configured' };
  try {
    await transport.verify();
    return { configured: true, reachable: true, host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: normalizeSmtpSecure(process.env.SMTP_SECURE, Number(process.env.SMTP_PORT || 587) === 465) };
  } catch (error) {
    const safe = error && error.message ? error.message : 'SMTP connection could not be verified';
    console.warn('SMTP verification failed:', safe.replace(process.env.SMTP_PASS || '', '[REDACTED]').replace(process.env.SMTP_USER || '', '[REDACTED]'));
    return { configured: true, reachable: false, host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: normalizeSmtpSecure(process.env.SMTP_SECURE, Number(process.env.SMTP_PORT || 587) === 465), message: 'SMTP connection failed. Check the SMTP host, port, credentials, and security mode in Render.' };
  }
}

async function deliverMail({ to, subject, text, html, applicationId = null, emailType = 'GENERAL', triggeredBy = null }) {
  const transport = createTransport();
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

  if (!transport) {
    const failureReason = 'SMTP_NOT_CONFIGURED';
    await recordEmailLog({ applicationId, recipient: destination, emailType, subject: safeSubject, status: 'FAILED', failureReason, triggeredBy });
    console.warn('SMTP is not configured. Email not delivered to:', destination);
    return { delivered: false, messageId: null, failureReason };
  }

  try {
    const info = await transport.sendMail({
      from: process.env.SMTP_FROM || 'noreply@cresenthighschool.com',
      to: destination,
      subject: safeSubject,
      text: String(text || '').trim() || 'Portal notification',
      html: html || '<p>Portal notification</p>'
    });
    await recordEmailLog({ applicationId, recipient: destination, emailType, subject: safeSubject, status: 'SENT', triggeredBy });
    return { delivered: true, messageId: info.messageId };
  } catch (error) {
    const fallbackReason = error && error.message ? error.message.replace(process.env.SMTP_PASS || '', '[REDACTED]').replace(process.env.SMTP_USER || '', '[REDACTED]') : 'Unable to deliver email';
    console.warn('Email delivery failed:', fallbackReason);
    await recordEmailLog({ applicationId, recipient: destination, emailType, subject: safeSubject, status: 'FAILED', failureReason: fallbackReason.slice(0, 255), triggeredBy });
    return { delivered: false, messageId: null, failureReason: fallbackReason.slice(0, 255) };
  }
}

function buildApprovalEmailHtml({ fullName, admissionNumber, className, stream, academicYear, applicationReference, portalUrl, loginLabel, initialPasswordText, schoolEmailAddress }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Admission Application Approved</title></head><body style="margin:0;padding:0;background:#edf5ff;font-family:Arial,sans-serif;color:#102a43;">
  <div style="max-width:640px;margin:32px auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dfeaf6;">
    <div style="background:#102a43;padding:28px 32px;color:#ffffff;">
      <h1 style="margin:0;font-size:28px;letter-spacing:0.04em;">CRESENT HIGH SCHOOL</h1>
      <p style="margin:8px 0 0;color:#dfeaf6;">Student Admissions</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 12px;font-size:16px;">Dear ${fullName},</p>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Congratulations! We are pleased to inform you that your application to Cresent High School has been APPROVED.</p>
      <h2 style="margin:18px 0 10px;font-size:20px;color:#102a43;">APPLICATION DETAILS</h2>
      <table role="presentation" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="width:45%;font-weight:bold;border-bottom:1px solid #e7edf5;">Student Name</td><td style="border-bottom:1px solid #e7edf5;">${fullName}</td></tr>
        <tr><td style="font-weight:bold;border-bottom:1px solid #e7edf5;">Admission Number</td><td style="border-bottom:1px solid #e7edf5;">${admissionNumber || 'Pending'}</td></tr>
        <tr><td style="font-weight:bold;border-bottom:1px solid #e7edf5;">Form/Class</td><td style="border-bottom:1px solid #e7edf5;">${className || 'Assigned by administration'}</td></tr>
        <tr><td style="font-weight:bold;border-bottom:1px solid #e7edf5;">Stream</td><td style="border-bottom:1px solid #e7edf5;">${stream || 'Assigned by administration'}</td></tr>
        <tr><td style="font-weight:bold;border-bottom:1px solid #e7edf5;">Academic Year</td><td style="border-bottom:1px solid #e7edf5;">${academicYear || 'N/A'}</td></tr>
        <tr><td style="font-weight:bold;">Application Reference</td><td>${applicationReference || 'N/A'}</td></tr>
      </table>
      <h2 style="margin:26px 0 10px;font-size:20px;color:#102a43;">PORTAL LOGIN DETAILS</h2>
      <p style="margin:0 0 10px;line-height:1.6;">Portal: <a href="${portalUrl}" style="color:#1d4ed8;">${portalUrl}</a></p>
      <p style="margin:0 0 10px;line-height:1.6;">Username: ${loginLabel}</p>
      <p style="margin:0 0 8px;line-height:1.6;">Initial Password: ${initialPasswordText}</p>
      <p style="margin:12px 0 0;color:#4b5563;font-size:13px;">If your account requires a password change, you will be prompted to set a new password after your first login.</p>
      <h2 style="margin:26px 0 10px;font-size:20px;color:#102a43;">WHAT TO DO NEXT</h2>
      <ol style="padding-left:20px;line-height:1.8;margin:0 0 20px;">
        <li>Visit the student portal.</li>
        <li>Log in using the credentials above.</li>
        <li>Change your password if required.</li>
        <li>Complete any required student information.</li>
        <li>Check your academic and finance information.</li>
      </ol>
      <p style="margin:0 0 18px;line-height:1.6;">If you have any questions, please contact the school administration.</p>
      <p style="margin:0 0 4px;line-height:1.6;font-weight:bold;">Regards,</p>
      <p style="margin:0;line-height:1.6;">CRESENT HIGH SCHOOL<br>Student Admissions Office</p>
    </div>
    <div style="background:#edf5ff;padding:16px 24px;text-align:center;font-size:12px;color:#4b5563;">${schoolEmailAddress || 'info@cresenthighschool.com'}</div>
  </div>
</body></html>`;
}

function buildRejectionEmailHtml({ fullName, applicationReference, decisionDate, reason, schoolEmailAddress }) {
  const safeReason = reason && String(reason).trim() ? `Reason: ${String(reason).trim()}` : 'Please contact the school administration if you require further information regarding this decision.';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Admission Application Update</title></head><body style="margin:0;padding:0;background:#edf5ff;font-family:Arial,sans-serif;color:#102a43;">
  <div style="max-width:640px;margin:32px auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dfeaf6;">
    <div style="background:#102a43;padding:28px 32px;color:#ffffff;">
      <h1 style="margin:0;font-size:28px;letter-spacing:0.04em;">CRESENT HIGH SCHOOL</h1>
      <p style="margin:8px 0 0;color:#dfeaf6;">Admissions Office</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 12px;font-size:16px;">Dear ${fullName},</p>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Thank you for applying to Cresent High School. After careful consideration of your application, we regret to inform you that your application has not been successful at this time.</p>
      <h2 style="margin:18px 0 10px;font-size:20px;color:#102a43;">APPLICATION DETAILS</h2>
      <table role="presentation" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="width:45%;font-weight:bold;border-bottom:1px solid #e7edf5;">Student Name</td><td style="border-bottom:1px solid #e7edf5;">${fullName}</td></tr>
        <tr><td style="font-weight:bold;border-bottom:1px solid #e7edf5;">Application Reference</td><td style="border-bottom:1px solid #e7edf5;">${applicationReference || 'N/A'}</td></tr>
        <tr><td style="font-weight:bold;border-bottom:1px solid #e7edf5;">Application Status</td><td style="border-bottom:1px solid #e7edf5;">NOT APPROVED</td></tr>
        <tr><td style="font-weight:bold;">Decision Date</td><td>${decisionDate || new Date().toISOString().slice(0, 10)}</td></tr>
      </table>
      <p style="margin:18px 0 12px;line-height:1.6;">${safeReason}</p>
      <p style="margin:0;line-height:1.6;">Regards,</p>
      <p style="margin:0;line-height:1.6;font-weight:bold;">CRESENT HIGH SCHOOL<br>Admissions Office</p>
    </div>
    <div style="background:#edf5ff;padding:16px 24px;text-align:center;font-size:12px;color:#4b5563;">${schoolEmailAddress || 'info@cresenthighschool.com'}</div>
  </div>
</body></html>`;
}

async function sendAdmissionApprovalEmail({ to, fullName, admissionNumber, loginUsername, initialPassword, stream, className, academicYear, applicationReference, portalUrl, applicationId = null, triggeredBy = null }) {
  const subject = 'Admission Application Approved – Cresent High School';
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
    `Dear ${fullName},`,
    '',
    'Congratulations!',
    'We are pleased to inform you that your application to Cresent High School has been APPROVED.',
    '',
    'APPLICATION DETAILS',
    `Student Name: ${fullName}`,
    `Admission Number: ${admissionNumber || 'N/A'}`,
    `Form/Class: ${className || 'Assigned by administration'}`,
    `Stream: ${stream || 'Assigned by administration'}`,
    `Academic Year: ${academicYear || 'N/A'}`,
    `Application Reference: ${applicationReference || 'N/A'}`,
    '',
    'PORTAL LOGIN DETAILS',
    `Portal: ${process.env.APP_URL || 'https://cresenthighschool.onrender.com'}/login.html`,
    `Username: ${loginUsername || admissionNumber || 'Student'}`,
    `Initial Password: ${initialPasswordDisplay}`,
    '',
    'Please log in and follow the school instructions.',
    '',
    'Regards,',
    'CRESENT HIGH SCHOOL',
    'Student Admissions Office'
  ].join('\n');
  return deliverMail({ to, subject, text, html, applicationId, emailType: 'APPLICATION_APPROVED', triggeredBy });
}

async function sendApplicationRejectionEmail({ to, fullName, applicationReference, decisionDate, reason, applicationId = null, triggeredBy = null }) {
  const subject = 'Admission Application Update – Cresent High School';
  const html = buildRejectionEmailHtml({
    fullName,
    applicationReference,
    decisionDate,
    reason,
    schoolEmailAddress: process.env.SMTP_FROM || 'info@cresenthighschool.com'
  });
  const text = [
    `Dear ${fullName},`,
    '',
    'Thank you for applying to Cresent High School.',
    'After careful consideration of your application, we regret to inform you that your application has not been successful at this time.',
    '',
    'APPLICATION DETAILS',
    `Student Name: ${fullName}`,
    `Application Reference: ${applicationReference || 'N/A'}`,
    'Application Status: NOT APPROVED',
    `Decision Date: ${decisionDate || new Date().toISOString().slice(0, 10)}`,
    reason ? `Reason: ${reason}` : 'Please contact the school administration if you require further information regarding this decision.',
    '',
    'Regards,',
    'CRESENT HIGH SCHOOL',
    'Admissions Office'
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
  const subject = 'Application Submitted - Crescent High School';
  const text = [
    `Dear ${fullName || 'Applicant'},`,
    '',
    'Thank you for applying!',
    'Your application has been submitted successfully and is now pending approval.',
    '',
    'Kind regards,',
    'Crescent High School Administration'
  ].join('\n');

  const result = await deliverMail({ to, subject, text, applicationId, emailType: 'APPLICATION_SUBMITTED', triggeredBy });
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
  sendAdmissionApprovalEmail,
  sendApplicationRejectionEmail,
  sendPasswordResetEmail,
  sendApplicationConfirmationEmail,
  deliverMail,
  verifyMailTransport,
  recordAuditEvent,
  recordEmailLog
};
