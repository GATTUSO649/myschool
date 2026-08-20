document.addEventListener('DOMContentLoaded', () => {
  const user = JSON.parse(sessionStorage.getItem('student') || 'null');
  const role = String(user?.role || '').toLowerCase();
  const name = document.getElementById('staffName');
  if (name) name.textContent = ['teacher', 'lecturer'].includes(role) ? (user.name || user.username || 'staff member') : 'staff member';
  const logout = document.getElementById('staffLogout');
  if (!sessionStorage.getItem('authToken')) logout?.remove();
  logout?.addEventListener('click', (event) => {
    event.preventDefault();
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('student');
    sessionStorage.removeItem('authSessionExpiresAt');
    window.location.replace('staff-portals.html');
  });
});