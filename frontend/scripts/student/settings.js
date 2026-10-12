/* global fetchWithAuth */

const settingsParams = new URLSearchParams(window.location.search);
const passwordChangeRequired = settingsParams.get('passwordChangeRequired') === '1';
const studentKey = (() => {
    try {
        const student = JSON.parse(sessionStorage.getItem('student') || 'null');
        return student?.id ? String(student.id) : 'current';
    } catch (error) {
        console.error('Could not read the signed-in profile:', error);
        return 'current';
    }
})();
const preferencePrefix = `cresent.settings.${studentKey}.`;
let savedProfile = null;

function preferenceKey(name) {
    return `${preferencePrefix}${name}`;
}

function readPreference(name) {
    try {
        return localStorage.getItem(preferenceKey(name));
    } catch (error) {
        console.error('Could not read a saved settings preference:', error);
        return null;
    }
}

function savePreference(name, value) {
    try {
        localStorage.setItem(preferenceKey(name), value);
        return true;
    } catch (error) {
        console.error('Could not save a settings preference:', error);
        showNotification('Your browser could not save this preference on this device.', 'error');
        return false;
    }
}

function showNotification(message, type = 'success') {
    const toast = document.getElementById('notification');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `notification-toast show ${type}`;
    window.setTimeout(() => toast.classList.remove('show'), 3500);
}

function switchTab(tabName, trigger) {
    const section = document.getElementById(tabName);
    if (!section) return;
    document.querySelectorAll('.settings-section').forEach((item) => item.classList.toggle('active', item === section));
    document.querySelectorAll('.settings-nav-item').forEach((item) => {
        const active = item.dataset.settingsTab === tabName;
        item.classList.toggle('active', active);
        item.setAttribute('aria-current', active ? 'page' : 'false');
    });
    if (trigger) trigger.blur();
    const sidebar = document.getElementById('settingsSidebar');
    const menuToggle = document.getElementById('settingsMenuToggle');
    if (sidebar) sidebar.classList.remove('is-open');
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
}

function initialsImage(name) {
    const initials = String(name || 'Student')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0] || '')
        .join('')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '') || 'S';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" rx="80" fill="#dbeafe"/><text x="80" y="96" text-anchor="middle" font-family="Arial,sans-serif" font-size="54" font-weight="700" fill="#123a56">${initials}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function displayProfile(student) {
    savedProfile = {
        name: student.name || '',
        email: student.email || '',
        phone: student.phone || '',
        dateOfBirth: student.dateOfBirth ? String(student.dateOfBirth).slice(0, 10) : '',
        admissionNumber: student.admissionNumber || '',
        className: student.className || ''
    };
    document.getElementById('fullName').value = savedProfile.name;
    document.getElementById('email').value = savedProfile.email;
    document.getElementById('phone').value = savedProfile.phone;
    document.getElementById('dateOfBirth').value = savedProfile.dateOfBirth;
    document.getElementById('studentID').value = savedProfile.admissionNumber;
    document.getElementById('course').value = savedProfile.className;
    document.getElementById('profileImg').src = readPreference('profile-photo') || initialsImage(savedProfile.name);
}

async function loadProfile() {
    try {
        const response = await fetchWithAuth('/students/me');
        const data = await response.json();
        if (!response.ok || !data.success || !data.student) {
            throw new Error(data.message || 'Could not load your profile.');
        }
        displayProfile(data.student);
    } catch (error) {
        console.error('Settings profile load failed:', error);
        showNotification(error.message || 'Could not load your profile.', 'error');
    }
}

async function compressPhoto(file) {
    const source = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('The selected photo could not be read.'));
        reader.onload = () => {
            const image = new Image();
            image.onerror = () => reject(new Error('The selected file is not a valid image.'));
            image.onload = () => resolve(image);
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
    const scale = Math.min(1, 512 / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not process this photo.');
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
}

function applyTheme(theme) {
    const resolvedTheme = theme === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : theme;
    document.body.dataset.theme = resolvedTheme;
}

function loadPreferences() {
    document.querySelectorAll('[data-setting]').forEach((control) => {
        const key = control.dataset.setting;
        const saved = readPreference(key);
        if (saved === null) return;
        if (control.type === 'checkbox') {
            control.checked = saved === 'true';
        } else if (control.type === 'radio') {
            control.checked = control.value === saved;
        } else {
            control.value = saved;
        }
    });

    const theme = readPreference('theme') || 'light';
    const themeControl = Array.from(document.querySelectorAll('input[name="theme"]')).find((control) => control.value === theme);
    if (themeControl) themeControl.checked = true;
    applyTheme(theme);
    document.body.classList.toggle('compact-settings', readPreference('compact-view') === 'true');
    document.body.classList.toggle('reduce-settings-motion', readPreference('animations') === 'false');
}

document.querySelectorAll('[data-settings-tab]').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.settingsTab, button));
});

document.querySelectorAll('[data-settings-tab-link]').forEach((link) => {
    link.addEventListener('click', (event) => {
        event.preventDefault();
        switchTab(link.dataset.settingsTabLink);
        document.getElementById(link.dataset.settingsTabLink)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

const settingsSidebar = document.getElementById('settingsSidebar');
const settingsMenuToggle = document.getElementById('settingsMenuToggle');
settingsMenuToggle?.addEventListener('click', () => {
    const isOpen = settingsSidebar?.classList.toggle('is-open') || false;
    settingsMenuToggle.setAttribute('aria-expanded', String(isOpen));
});

if (passwordChangeRequired) {
    switchTab('password');
    const requiredNotice = document.getElementById('passwordChangeRequiredNotice');
    if (requiredNotice) requiredNotice.hidden = false;
}

const profileForm = document.getElementById('profileForm');
profileForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = profileForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    const profile = {
        name: document.getElementById('fullName').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        dateOfBirth: document.getElementById('dateOfBirth').value
    };
    try {
        const response = await fetchWithAuth('/students/me', { method: 'PUT', body: profile });
        const data = await response.json();
        if (!response.ok || !data.success || !data.student) {
            throw new Error(data.message || 'Could not save your profile.');
        }
        displayProfile(data.student);
        const sessionStudent = JSON.parse(sessionStorage.getItem('student') || '{}');
        sessionStudent.name = data.student.name;
        sessionStudent.email = data.student.email;
        sessionStudent.phone = data.student.phone;
        sessionStudent.dateOfBirth = data.student.dateOfBirth;
        sessionStorage.setItem('student', JSON.stringify(sessionStudent));
        showNotification('Profile changes saved.', 'success');
    } catch (error) {
        console.error('Profile update failed:', error);
        showNotification(error.message || 'Could not save your profile.', 'error');
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
});

profileForm?.addEventListener('reset', (event) => {
    if (!savedProfile) {
        event.preventDefault();
        return;
    }
    window.setTimeout(() => {
        document.getElementById('fullName').value = savedProfile.name;
        document.getElementById('email').value = savedProfile.email;
        document.getElementById('phone').value = savedProfile.phone;
        document.getElementById('dateOfBirth').value = savedProfile.dateOfBirth;
    });
});

const photoInput = document.getElementById('profilePhotoInput');
document.getElementById('uploadProfilePhoto')?.addEventListener('click', () => photoInput?.click());
photoInput?.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        showNotification('Choose a JPG, PNG, or WebP photo under 5 MB.', 'error');
        photoInput.value = '';
        return;
    }
    try {
        const photo = await compressPhoto(file);
        if (!savePreference('profile-photo', photo)) return;
        document.getElementById('profileImg').src = photo;
        showNotification('Profile photo saved on this device.', 'success');
    } catch (error) {
        console.error('Profile photo update failed:', error);
        showNotification(error.message || 'Could not save this photo.', 'error');
    } finally {
        photoInput.value = '';
    }
});

document.getElementById('removeProfilePhoto')?.addEventListener('click', () => {
    try {
        localStorage.removeItem(preferenceKey('profile-photo'));
        document.getElementById('profileImg').src = initialsImage(savedProfile?.name || 'Student');
        showNotification('Profile photo removed from this device.', 'success');
    } catch (error) {
        console.error('Could not remove the saved profile photo:', error);
        showNotification('Could not remove the saved profile photo.', 'error');
    }
});

const newPasswordInput = document.getElementById('newPassword');
newPasswordInput?.addEventListener('input', () => {
    const password = newPasswordInput.value;
    const strength = [
        password.length >= 8,
        password.length >= 12,
        /[A-Z]/.test(password),
        /[a-z]/.test(password),
        /[0-9]/.test(password),
        /[^A-Za-z0-9]/.test(password)
    ].filter(Boolean).length;
    const indicator = document.getElementById('strengthIndicator');
    const text = document.getElementById('strengthText');
    indicator.className = `strength-fill ${strength <= 2 ? 'weak' : strength <= 4 ? 'medium' : 'strong'}`;
    text.textContent = `Password strength: ${strength <= 2 ? 'Weak' : strength <= 4 ? 'Medium' : 'Strong'}`;
});

const passwordForm = document.getElementById('passwordForm');
passwordForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    if (currentPassword === newPassword) {
        showNotification('New password must be different from current password.', 'error');
        return;
    }
    if (newPassword !== confirmPassword) {
        showNotification('Passwords do not match.', 'error');
        return;
    }
    if (newPassword.length < 12 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
        showNotification('Use at least 12 characters with uppercase, lowercase, a number, and a symbol.', 'error');
        return;
    }

    const submitButton = passwordForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
        const response = await fetchWithAuth('/auth/password/change', {
            method: 'POST',
            body: { currentPassword, newPassword }
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Password change failed.');
        showNotification(data.message || 'Password changed successfully.', 'success');
        passwordForm.reset();
        document.getElementById('strengthIndicator').className = 'strength-fill';
        document.getElementById('strengthText').textContent = 'Password strength: Weak';
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('student');
        sessionStorage.removeItem('rememberMe');
        sessionStorage.removeItem('authSessionExpiresAt');
        document.cookie = 'authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
        window.setTimeout(() => window.location.replace('/login.html'), 2000);
    } catch (error) {
        console.error('Password update failed:', error);
        showNotification(error.message || 'Password change failed.', 'error');
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
});

document.querySelectorAll('[data-setting]').forEach((control) => {
    const key = control.dataset.setting;
    control.addEventListener('change', () => {
        const value = control.type === 'checkbox' ? String(control.checked) : control.value;
        if (!savePreference(key, value)) return;
        if (key === 'theme') applyTheme(value);
        if (key === 'compact-view') document.body.classList.toggle('compact-settings', control.checked);
        if (key === 'animations') document.body.classList.toggle('reduce-settings-motion', !control.checked);
        if (key === 'language') {
            showNotification('Language preference saved on this device. Portal text is currently available in English.', 'success');
        } else {
            showNotification('Preference saved on this device.', 'success');
        }
    });
});

const savedTheme = readPreference('theme');
if (savedTheme === 'auto' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme('auto'));
}

document.getElementById('downloadMyData')?.addEventListener('click', () => {
    if (!savedProfile) {
        showNotification('Your profile has not loaded yet. Try again in a moment.', 'error');
        return;
    }
    const preferences = {};
    document.querySelectorAll('[data-setting]').forEach((control) => {
        const key = control.dataset.setting;
        if (control.type === 'radio' && !control.checked) return;
        preferences[key] = control.type === 'checkbox' ? control.checked : control.value;
    });
    const exportData = {
        profile: savedProfile,
        preferences,
        profilePhotoStoredOnThisDevice: Boolean(readPreference('profile-photo')),
        exportedAt: new Date().toISOString()
    };
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `cresent-account-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    showNotification('Your profile and settings export has been downloaded.', 'success');
});

document.getElementById('clearSavedPreferences')?.addEventListener('click', () => {
    if (!window.confirm('Reset saved preferences and the locally stored profile photo on this device?')) return;
    try {
        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
            const key = localStorage.key(index);
            if (key?.startsWith(preferencePrefix)) localStorage.removeItem(key);
        }
        loadPreferences();
        document.getElementById('profileImg').src = initialsImage(savedProfile?.name || 'Student');
        showNotification('Saved preferences and local profile photo were reset.', 'success');
    } catch (error) {
        console.error('Could not reset saved preferences:', error);
        showNotification('Could not reset saved preferences.', 'error');
    }
});

document.getElementById('logoutOtherSessions')?.addEventListener('click', async (event) => {
    if (!window.confirm('Sign out this account from all other devices? This device will stay signed in.')) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
        const response = await fetchWithAuth('/auth/sessions/revoke-others', { method: 'POST', body: {} });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Could not sign out other sessions.');
        showNotification(data.message || 'Other sessions signed out.', 'success');
    } catch (error) {
        console.error('Other sessions could not be signed out:', error);
        showNotification(error.message || 'Could not sign out other sessions.', 'error');
    } finally {
        button.disabled = false;
    }
});

loadPreferences();
loadProfile();
