const nodemailer = require('nodemailer');
const { query } = require('../config/db');
const { logActivity } = require('./logController');

const STUDENT_EMAIL_DOMAIN = 'cresent.ac.ke';

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
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    } : undefined
  });
}

async function deliverMail({ to, subject, text, html }) {
  const transport = createTransport();
  if (transport) {
    try {
      const info = await transport.sendMail({
        from: process.env.SMTP_FROM || 'noreply@cresenthighschool.com',
        to,
        subject,
        text,
        html
      });
      return { delivered: true, messageId: info.messageId };
    } catch (error) {
      console.warn('Email delivery failed, falling back to local logging:', error.message);
    }
  }

  const fallbackMessage = `Email queued for ${to}\nSubject: ${subject}\n\n${text}`;
  console.log(fallbackMessage);
  return { delivered: false, messageId: null, fallbackMessage };
}

async function sendAdmissionApprovalEmail({ to, fullName, admissionNumber, username, password, stream }) {
  const subject = 'Admission Approved - Crescent High School';
  const text = [
    `Dear ${fullName},`,
    '',
    'Congratulations! Your admission to Crescent High School has been approved.',
    `Admission number: ${admissionNumber}`,
    `Username: ${username}`,
    `Password: ${password}`,
    `Stream: ${stream || 'Assigned by administration'}`,
    '',
    'Please sign in to the portal using your username and the password above.',
    'Kind regards,',
    'Crescent High School Administration'
  ].join('\n');

  const result = await deliverMail({ to, subject, text });
  await logActivity(null, 'admission_email_sent', `Admission approval email sent to ${to}`, null);
  return result;
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

  const result = await deliverMail({ to, subject, text });
  await logActivity(null, 'password_reset_email_sent', `Password reset email sent to ${to}`, null);
  return result;
}

async function sendApplicationConfirmationEmail({ to, fullName }) {
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

  const result = await deliverMail({ to, subject, text });
  await logActivity(null, 'application_confirmation_email_sent', `Application confirmation email sent to ${to}`, null);
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
  sendAdmissionApprovalEmail,
  sendPasswordResetEmail,
  sendApplicationConfirmationEmail,
  recordAuditEvent
};
