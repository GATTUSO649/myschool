// Settings Page JavaScript

// Tab switching functionality
function switchTab(tabName, evt) {
    const targetItem = evt ? evt.target.closest('.settings-nav-item') : null;

    // Hide all sections
    const sections = document.querySelectorAll('.settings-section');
    sections.forEach(section => {
        section.classList.remove('active');
    });

    // Remove active class from all nav items
    const navItems = document.querySelectorAll('.settings-nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
    });

    // Set selected section active
    const selectedSection = document.getElementById(tabName);
    if (selectedSection) {
        selectedSection.classList.add('active');
    }

    // Add active class to clicked nav item
    if (targetItem) {
        targetItem.classList.add('active');
    }
}

// Show notification toast
function showNotification(message, type = 'success') {
    const toast = document.getElementById('notification');
    toast.textContent = message;
    toast.className = `notification-toast show ${type}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Password strength checker
const newPasswordInput = document.getElementById('newPassword');
if (newPasswordInput) {
    newPasswordInput.addEventListener('input', function() {
        const password = this.value;
        const strengthIndicator = document.getElementById('strengthIndicator');
        const strengthText = document.getElementById('strengthText');
        let strength = 0;

        // Check password length
        if (password.length >= 8) strength++;
        if (password.length >= 12) strength++;

        // Check for uppercase
        if (/[A-Z]/.test(password)) strength++;

        // Check for lowercase
        if (/[a-z]/.test(password)) strength++;

        // Check for numbers
        if (/[0-9]/.test(password)) strength++;

        // Check for special characters
        if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++;

        // Update strength indicator
        strengthIndicator.className = 'strength-fill';
        if (strength <= 2) {
            strengthIndicator.classList.add('weak');
            strengthText.textContent = 'Password strength: Weak';
        } else if (strength <= 4) {
            strengthIndicator.classList.add('medium');
            strengthText.textContent = 'Password strength: Medium';
        } else {
            strengthIndicator.classList.add('strong');
            strengthText.textContent = 'Password strength: Strong';
        }
    });
}

// Profile form submission
const profileForm = document.getElementById('profileForm');
if (profileForm) {
    profileForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Get form data
        const fullName = document.getElementById('fullName').value;
        const email = document.getElementById('email').value;
        const phone = document.getElementById('phone').value;
        const dateOfBirth = document.getElementById('dateOfBirth').value;
        const course = document.getElementById('course').value;

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showNotification('Please enter a valid email address', 'error');
            return;
        }

        // Validate phone
        if (phone && !/^\+?[\d\s\-()]{10,}$/.test(phone)) {
            showNotification('Please enter a valid phone number', 'error');
            return;
        }

        // Simulate API call
        showNotification('Profile updated successfully!', 'success');
        
        // Save to localStorage for persistence
        localStorage.setItem('studentProfile', JSON.stringify({
            fullName,
            email,
            phone,
            dateOfBirth,
            course,
            lastUpdated: new Date().toISOString()
        }));
    });

    // Load profile data if exists
    const savedProfile = localStorage.getItem('studentProfile');
    if (savedProfile) {
        const profile = JSON.parse(savedProfile);
        document.getElementById('fullName').value = profile.fullName || '';
        document.getElementById('email').value = profile.email || '';
        document.getElementById('phone').value = profile.phone || '';
        document.getElementById('dateOfBirth').value = profile.dateOfBirth || '';
        document.getElementById('course').value = profile.course || '';
    }
}

// Password form submission
const passwordForm = document.getElementById('passwordForm');
if (passwordForm) {
    passwordForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        // Validate passwords
        if (currentPassword === newPassword) {
            showNotification('New password must be different from current password', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            showNotification('Passwords do not match', 'error');
            return;
        }

        if (newPassword.length < 8) {
            showNotification('Password must be at least 8 characters long', 'error');
            return;
        }

        // Call backend change-password API
        (async () => {
            try {
                const resp = await fetchWithAuth('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
                const data = await resp.json();
                if (!resp.ok) {
                    showNotification(data.message || 'Could not change password', 'error');
                    return;
                }
                showNotification('Password changed successfully!', 'success');
                passwordForm.reset();
                const strengthIndicatorEl = document.getElementById('strengthIndicator');
                if (strengthIndicatorEl) strengthIndicatorEl.className = 'strength-fill';
                const strengthTextEl = document.getElementById('strengthText');
                if (strengthTextEl) strengthTextEl.textContent = 'Password strength: Weak';
            } catch (err) {
                console.error('Change password error', err);
                showNotification('Network error changing password', 'error');
            }
        })();
    });
}

// Enable 2FA
function enable2FA() {
    alert('2FA setup would open a configuration modal here.\nYou would scan a QR code with an authenticator app.');
    showNotification('2FA setup process initiated', 'success');
}

// Upload profile picture
function uploadProfilePicture() {
    // Create a hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            // Check file size
            if (file.size > 5 * 1024 * 1024) {
                showNotification('File size must be less than 5MB', 'error');
                return;
            }

            // Create preview
            const reader = new FileReader();
            reader.onload = function(event) {
                document.getElementById('profileImg').src = event.target.result;
                showNotification('Profile picture updated successfully!', 'success');
            };
            reader.readAsDataURL(file);
        }
    };
    
    input.click();
}

// Remove profile picture
function removeProfilePicture() {
    document.getElementById('profileImg').src = 'https://ui-avatars.com/api/?name=Student&background=1565c0&color=fff';
    showNotification('Profile picture removed', 'success');
}

// Theme switching
const themeOptions = document.querySelectorAll('input[name="theme"]');
themeOptions.forEach(option => {
    option.addEventListener('change', function() {
        const theme = this.value;
        localStorage.setItem('theme', theme);
        applyTheme(theme);
        showNotification(`Theme changed to ${theme}`, 'success');
    });
});

// Apply theme from localStorage
function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.style.backgroundColor = '#1a1a1a';
        document.body.style.color = '#fff';
    } else if (theme === 'light') {
        document.body.style.backgroundColor = '#fff';
        document.body.style.color = '#333';
    } else {
        // Auto - use system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(prefersDark ? 'dark' : 'light');
    }
}

// Load saved theme
const savedTheme = localStorage.getItem('theme') || 'light';
const themeRadio = document.querySelector(`input[name="theme"][value="${savedTheme}"]`);
if (themeRadio) {
    themeRadio.checked = true;
    applyTheme(savedTheme);
}

// Language selection
const languageSelect = document.querySelector('.language-select');
if (languageSelect) {
    languageSelect.addEventListener('change', function() {
        const language = this.value;
        localStorage.setItem('language', language);
        showNotification(`Language changed to ${language.toLowerCase()}`, 'success');
        // In a real app, this would trigger i18n translation
    });

    // Set saved language
    const savedLanguage = localStorage.getItem('language') || 'en';
    languageSelect.value = savedLanguage;
}

// Logout from session
const logoutButtons = document.querySelectorAll('.session-item .btn-danger');
logoutButtons.forEach(button => {
    if (button.textContent.includes('Logout')) {
        button.addEventListener('click', function() {
            if (confirm('Are you sure you want to logout from this session?')) {
                this.closest('.session-item').style.opacity = '0.5';
                this.disabled = true;
                showNotification('Session logged out', 'success');
            }
        });
    }
});

// Logout all sessions
const logoutAllButton = document.querySelector('.settings-section#sessions .btn-danger');
if (logoutAllButton) {
    logoutAllButton.addEventListener('click', function() {
        if (confirm('Are you sure? This will logout all sessions except the current one.')) {
            showNotification('All other sessions have been logged out', 'success');
        }
    });
}

// Initialize notifications toggle switches
const toggleSwitches = document.querySelectorAll('.toggle-switch input[type="checkbox"]');
toggleSwitches.forEach(toggle => {
    toggle.addEventListener('change', function() {
        const label = this.closest('.toggle-item').querySelector('strong').textContent;
        const status = this.checked ? 'enabled' : 'disabled';
        localStorage.setItem(`toggle_${label}`, this.checked);
    });
});

// Load saved toggle states
window.addEventListener('DOMContentLoaded', function() {
    toggleSwitches.forEach(toggle => {
        const label = toggle.closest('.toggle-item').querySelector('strong').textContent;
        const saved = localStorage.getItem(`toggle_${label}`);
        if (saved !== null) {
            toggle.checked = saved === 'true';
        }
    });
});

// Display toggle options
const displayToggles = document.querySelectorAll('.appearance #appearance .toggle-switch input');
displayToggles.forEach(toggle => {
    toggle.addEventListener('change', function() {
        const label = this.closest('.toggle-item').querySelector('strong').textContent;
        showNotification(`${label} ${this.checked ? 'enabled' : 'disabled'}`, 'success');
    });
});

// Notification frequency selection
const frequencyOptions = document.querySelectorAll('input[name="frequency"]');
frequencyOptions.forEach(option => {
    option.addEventListener('change', function() {
        const frequencyLabel = this.closest('.radio-option').querySelector('strong').textContent;
        localStorage.setItem('notificationFrequency', this.value);
        showNotification(`Notification frequency set to ${frequencyLabel}`, 'success');
    });
});

// Load saved frequency
const savedFrequency = localStorage.getItem('notificationFrequency') || 'instant';
document.querySelector(`input[name="frequency"][value="${savedFrequency}"]`).checked = true;

// Data download
const downloadButton = document.querySelector('.privacy-actions .btn-secondary:first-child');
if (downloadButton) {
    downloadButton.addEventListener('click', function() {
        showNotification('Preparing your data download...', 'success');
        setTimeout(() => {
            // Simulate download
            const data = {
                profile: localStorage.getItem('studentProfile'),
                preferences: {
                    theme: localStorage.getItem('theme'),
                    language: localStorage.getItem('language'),
                    frequency: localStorage.getItem('notificationFrequency')
                },
                downloadDate: new Date().toISOString()
            };
            
            const dataStr = JSON.stringify(data, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `cresent-data-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(url);
        }, 1000);
    });
}

// Smooth scroll for sidebar
const sidebarNav = document.querySelector('.settings-nav');
if (sidebarNav) {
    sidebarNav.addEventListener('scroll', function(e) {
        if (e.deltaY < 0) {
            sidebarNav.scrollLeft -= 50;
        }
    });
}

// Form validation on input
document.querySelectorAll('input[type="email"]').forEach(input => {
    input.addEventListener('blur', function() {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (this.value && !emailRegex.test(this.value)) {
            this.classList.add('error');
        } else {
            this.classList.remove('error');
        }
    });
});

// Initial setup
document.addEventListener('DOMContentLoaded', function() {
    // Set first nav item as active
    const firstNavItem = document.querySelector('.settings-nav-item');
    if (firstNavItem) {
        firstNavItem.classList.add('active');
    }

    // Populate student name from dashboard
    const studentName = localStorage.getItem('studentName') || 'Student';
    const fullNameInput = document.getElementById('fullName');
    if (fullNameInput && !fullNameInput.value) {
        fullNameInput.value = studentName;
    }
});

// Session logout functionality
document.querySelectorAll('.session-item .btn-danger').forEach(btn => {
    btn.addEventListener('click', function(e) {
        e.preventDefault();
        const sessionItem = this.closest('.session-item');
        if (confirm('Logout from this session?')) {
            sessionItem.style.opacity = '0.6';
            sessionItem.style.pointerEvents = 'none';
            showNotification('Session ended', 'success');
        }
    });
});
