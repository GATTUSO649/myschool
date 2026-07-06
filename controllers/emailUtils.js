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

module.exports = {
  STUDENT_EMAIL_DOMAIN,
  schoolEmail
};
