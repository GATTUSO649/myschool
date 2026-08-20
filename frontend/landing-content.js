document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('/api/admin/settings/public', { cache: 'no-store' });
    const data = await response.json();
    const settings = data.settings || {};
    const setText = (id, value) => { const element = document.getElementById(id); if (element && value) element.textContent = String(value); };
    setText('landingHeroTitle', settings.landingHeroTitle);
    setText('landingHeroText', settings.landingHeroText);
    setText('landingAboutText', settings.landingAboutText);
    setText('landingFooterText', settings.footerText);
    setText('landingSchoolName', settings.schoolName);
    setText('landingSchoolMotto', settings.schoolMotto);
    setText('landingContactAddress', settings.contactAddress);
    setText('landingContactPhone', settings.contactPhone ? `Phone: ${settings.contactPhone}` : '');
    setText('landingContactEmail', settings.contactEmail ? `Email: ${settings.contactEmail}` : '');
    if (settings.schoolName) document.title = `${settings.schoolName} | Student Portal`;
  } catch (error) {
    console.warn('Landing content unavailable:', error.message);
  }
});