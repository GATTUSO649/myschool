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
  });
})();
