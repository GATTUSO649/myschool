function goLogin() {
  window.location.href = "login.html";   // or trigger animation
}

function goSignup() {
  window.location.href = "signup.html";  // or trigger animation
}

function goApply() {
  window.location.href = "application.html";
}

const loginBtn = document.getElementById('loginBtn');
const welcome = document.getElementById('welcome');

const landingMenuToggle = document.querySelector('.landing-menu-toggle');
const landingNav = document.querySelector('.landing-nav');
if (landingMenuToggle && landingNav) {
  landingMenuToggle.addEventListener('click', () => {
    const isOpen = landingNav.classList.toggle('is-open');
    landingMenuToggle.setAttribute('aria-expanded', String(isOpen));
  });

  landingNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      landingNav.classList.remove('is-open');
      landingMenuToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

if (loginBtn && welcome) {
  loginBtn.addEventListener('click', () => {
    welcome.classList.add('fade-out');
    setTimeout(goLogin, 600); // match with CSS animation duration
  });
}
