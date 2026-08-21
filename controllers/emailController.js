const { query } = require('../config/db');
const { deliverMail, verifyMailTransport, getSmtpConfiguration, isValidRecipientEmail } = require('./emailUtils');

function cleanRecipients(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[,;\n]/);
  return [...new Set(values.map((item) => String(item || '').trim().toLowerCase()).filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)))];
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

async function recipients(req, res) {
  const rows = await query(
    `SELECT id, name, email, role, class_name AS className
     FROM students WHERE active = 1 AND email IS NOT NULL AND email <> ''
     ORDER BY name LIMIT 500`
  );
  res.json({ success: true, recipients: rows });
}

async function status(req, res) {
  res.json({ success: true, email: await verifyMailTransport() });
}

async function send(req, res) {
  const to = cleanRecipients(req.body.to || req.body.recipients);
  const subject = String(req.body.subject || '').trim();
  const text = String(req.body.text || '').trim();
  const html = String(req.body.html || '').trim() || `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
  if (!to.length || !subject || !text) {
    return res.status(400).json({ success: false, message: 'At least one valid recipient, subject, and message are required' });
  }
  const results = [];
  for (const address of to) {
    results.push({ address, ...(await deliverMail({ to: address, subject, text, html })) });
  }
  const sent = results.filter((result) => result.delivered).length;
  res.status(sent ? 200 : 502).json({ success: sent > 0, sent, queued: results.length, results, message: sent ? 'Email processed' : 'Email delivery failed' });
}

async function test(req, res) {
  const recipient = String(req.body?.to || '').trim().toLowerCase();
  const configuration = getSmtpConfiguration();
  const authorizedRecipients = new Set([
    configuration.user.toLowerCase(),
    configuration.fromAddress.toLowerCase(),
    String(process.env.SMTP_TEST_RECIPIENT || '').trim().toLowerCase()
  ].filter(Boolean));

  if (!isValidRecipientEmail(recipient) || !authorizedRecipients.has(recipient)) {
    return res.status(403).json({ success: false, message: 'Test recipient is not authorized' });
  }

  const result = await deliverMail({
    to: recipient,
    subject: 'Crescent High School SMTP Test',
    text: 'This is a test email from the Crescent High School portal email service.',
    html: '<p>This is a test email from the Crescent High School portal email service.</p>',
    emailType: 'SMTP_TEST',
    triggeredBy: req.user?.id || null
  });

  if (!result.delivered) {
    return res.status(502).json({ success: false, message: 'Email delivery failed', reason: result.failureReason || 'SMTP_DELIVERY_FAILED' });
  }

  console.log('SMTP test email sent. messageId:', result.messageId || 'not provided');
  res.json({ success: true, message: 'Test email sent successfully' });
}

module.exports = { recipients, status, send, test };
