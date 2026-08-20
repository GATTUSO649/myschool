const { query } = require('../config/db');
const { deliverMail, verifyMailTransport } = require('./emailUtils');

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
  res.json({ success: true, sent: results.filter((result) => result.delivered).length, queued: results.length, results });
}

module.exports = { recipients, status, send };
