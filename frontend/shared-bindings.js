// Shared data-attribute bindings for CSP-safe event handlers
(function () {
  function bindOnce(selector, handler) {
    document.querySelectorAll(selector).forEach((el) => {
      if (!el.__bound) {
        el.addEventListener('click', handler);
        el.__bound = true;
      }
    });
  }

  function safeCall(fnName, arg) {
    try {
      const fn = window[fnName];
      if (typeof fn === 'function') return fn(arg);
      console.warn(`Shared bindings: function ${fnName} not found`);
    } catch (err) {
      console.warn('Shared bindings error', err);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindOnce('[data-admin-logout]', (e) => { e.preventDefault(); if (typeof logout === 'function') logout(); });
    bindOnce('[data-close-modal]', (e) => { e.preventDefault(); const id = e.currentTarget.getAttribute('data-close-modal'); safeCall('closeModal', id); });
    bindOnce('[data-toggle-sidebar]', (e) => { e.preventDefault(); const sidebar = document.querySelector('.student-sidebar'); if (sidebar) sidebar.classList.toggle('is-open'); });
    bindOnce('[data-select-date]', (e) => { e.preventDefault(); const val = e.currentTarget.getAttribute('data-select-date'); safeCall('selectDate', val); });
    bindOnce('[data-view-event]', (e) => { e.preventDefault(); const id = e.currentTarget.getAttribute('data-view-event'); safeCall('viewEvent', Number(id)); });
    bindOnce('[data-open-topic]', (e) => { e.preventDefault(); const topic = e.currentTarget.getAttribute('data-open-topic'); safeCall('openTopic', topic); });
    bindOnce('[data-remove-parent]', (e) => { e.preventDefault(); const p = e.currentTarget.parentElement; if (p) p.remove(); });

    // Additional mapped actions
    bindOnce('[data-open-request]', (e) => { e.preventDefault(); safeCall('openRequestForm'); });
    bindOnce('[data-close-request]', (e) => { e.preventDefault(); safeCall('closeRequestForm'); });
    bindOnce('[data-go-apply]', (e) => { e.preventDefault(); safeCall('goApply'); });
    bindOnce('[data-mark-all-read]', (e) => { e.preventDefault(); safeCall('markAllRead'); });
    bindOnce('[data-clear-notifications]', (e) => { e.preventDefault(); safeCall('clearAllNotifications'); });
    bindOnce('[data-open-settings]', (e) => { e.preventDefault(); safeCall('openSettings'); });
    bindOnce('[data-load-notifications]', (e) => { e.preventDefault(); safeCall('loadNotifications'); });
    bindOnce('[data-upload-profile-pic]', (e) => { e.preventDefault(); safeCall('uploadProfilePicture'); });
    bindOnce('[data-remove-profile-pic]', (e) => { e.preventDefault(); safeCall('removeProfilePicture'); });
    bindOnce('[data-enable-2fa]', (e) => { e.preventDefault(); safeCall('enable2FA'); });
    bindOnce('[data-download-transcript]', (e) => { e.preventDefault(); safeCall('downloadTranscript'); });
    bindOnce('[data-test-health]', (e) => { e.preventDefault(); safeCall('testHealth'); });
    bindOnce('[data-test-signup]', (e) => { e.preventDefault(); safeCall('testSignup'); });
    bindOnce('[data-clear-results]', (e) => { e.preventDefault(); safeCall('clearResults'); });
    bindOnce('[data-view-notification]', (e) => { e.preventDefault(); const id = e.currentTarget.getAttribute('data-view-notification'); safeCall('viewNotification', Number(id)); });
    bindOnce('[data-toggle-read]', (e) => { e.preventDefault(); const id = e.currentTarget.getAttribute('data-toggle-read'); safeCall('toggleRead', Number(id)); });
    bindOnce('[data-delete-notification]', (e) => { e.preventDefault(); const id = e.currentTarget.getAttribute('data-delete-notification'); safeCall('deleteNotification', Number(id)); });
    bindOnce('[data-switch-tab]', (e) => { e.preventDefault(); const tab = e.currentTarget.getAttribute('data-switch-tab'); safeCall('switchTab', tab); });
    bindOnce('[data-navigate]', (e) => { e.preventDefault(); const href = e.currentTarget.getAttribute('data-navigate'); if (href) window.location.href = href; });
  });
})();
