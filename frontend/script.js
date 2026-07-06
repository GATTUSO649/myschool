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

if (loginBtn && welcome) {
  loginBtn.addEventListener('click', () => {
    welcome.classList.add('fade-out');
    setTimeout(goLogin, 600); // match with CSS animation duration
  });
}
