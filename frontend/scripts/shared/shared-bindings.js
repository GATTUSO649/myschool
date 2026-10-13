// Shared data-attribute bindings for CSP-safe event handlers
(function () {
  const adminNavigationGroups = [
    {
      title: 'Overview',
      links: [['admin-dashboard.html', 'Dashboard', ['admin']]]
    },
    {
      title: 'Admissions and students',
      links: [
        ['admin-applications.html', 'Applications', ['admin']],
        ['admin-management.html', 'Student management', ['admin']],
        ['admin-students.html', 'All students', ['admin']]
      ]
    },
    {
      title: 'Academics',
      links: [
        ['admin-academics.html', 'Academic management', ['admin', 'academics']],
        ['admin-stream-entry.html', 'Stream marks entry', ['admin', 'academics', 'teacher']],
        ['admin-transcripts.html', 'Transcripts', ['admin']],
        ['admin-uploads.html', 'Academic uploads', ['admin']]
      ]
    },
    {
      title: 'Finance',
      links: [
        ['admin-finance.html', 'Finance dashboard', ['admin', 'finance']],
        ['admin-finance-balances.html', 'Balances', ['admin', 'finance', 'system_admin']],
        ['admin-finance-payments.html', 'Record payments', ['admin', 'finance', 'system_admin']],
        ['admin-finance-receipts.html', 'Receipt ledger', ['admin', 'finance', 'system_admin']],
        ['admin-finance-statements.html', 'Statements', ['admin', 'finance', 'system_admin']],
        ['admin-finance-structure.html', 'Fee structures', ['admin', 'finance', 'system_admin']],
        ['admin-finance-upload.html', 'Finance documents', ['admin', 'finance', 'system_admin']]
      ]
    },
    {
      title: 'Staff and departments',
      links: [
        ['admin-staff.html', 'Staff management', ['admin']],
        ['admin-roles.html', 'Roles and access', ['admin']],
        ['department-roles.html', 'Department roles', ['admin']],
        ['admin-departments.html', 'Departments', ['admin']],
        ['department-portal.html', 'Department portal', ['admin', 'teacher']]
      ]
    },
    {
      title: 'Communications',
      links: [
        ['admin-announcements.html', 'Announcements', ['admin']],
        ['admin-notifications.html', 'Notifications', ['admin']]
      ]
    },
    {
      title: 'Reports and system',
      links: [
        ['admin-reports.html', 'Reports', ['admin']],
        ['admin-logs.html', 'Audit logs', ['admin']],
        ['admin-security.html', 'Security', ['admin']],
        ['admin-database.html', 'Database', ['admin']],
        ['admin-settings.html', 'Settings', ['admin']]
      ]
    },
    {
      title: 'ICT operations',
      links: [
        ['ict-portal.html', 'ICT portal', ['admin', 'ict']],
        ['ict-dashboard.html', 'ICT dashboard', ['admin', 'ict']],
        ['ict-health.html', 'System health', ['admin', 'ict']],
        ['ict-activity.html', 'Activity monitor', ['admin', 'ict']],
        ['ict-users.html', 'User accounts', ['admin', 'ict']],
        ['ict-permissions.html', 'Roles and permissions', ['admin', 'ict']],
        ['ict-sessions.html', 'Active sessions', ['admin', 'ict']],
        ['ict-security.html', 'Security center', ['admin', 'ict']],
        ['ict-audit.html', 'ICT audit logs', ['admin', 'ict']],
        ['ict-configuration.html', 'Portal configuration', ['admin', 'ict']],
        ['ict-logs.html', 'System logs', ['admin', 'ict']],
        ['ict-integrations.html', 'API and integrations', ['admin', 'ict']],
        ['ict-updates.html', 'System updates', ['admin', 'ict']],
        ['ict-database.html', 'ICT database', ['admin', 'ict']],
        ['ict-backups.html', 'Backups and recovery', ['admin', 'ict']],
        ['ict-storage.html', 'File storage', ['admin', 'ict']],
        ['ict-email.html', 'Email and notifications', ['admin', 'ict']],
        ['ict-messages.html', 'System messages', ['admin', 'ict']],
        ['ict-maintenance.html', 'Maintenance mode', ['admin', 'ict']],
        ['ict-tickets.html', 'Support tickets', ['admin', 'ict']],
        ['ict-history.html', 'Maintenance history', ['admin', 'ict']],
        ['ict-profile.html', 'ICT profile', ['admin', 'ict']]
      ]
    }
  ];

  function renderAdminNavigation() {
    if (!document.body.classList.contains('admin-dashboard-page')) return;
    const sidebar = document.querySelector('.student-sidebar');
    if (!sidebar) return;

    sidebar.classList.remove('ict-sidebar', 'finance-sidebar');
    const storedUser = sessionStorage.getItem('student');
    const user = storedUser ? JSON.parse(storedUser) : {};
    const rawRole = String(user.rawRole || '').toLowerCase();
    const userRoles = [
      user.role,
      ...(Array.isArray(user.roles) ? user.roles : []),
      ...(Array.isArray(user.roleKeys) ? user.roleKeys : [])
    ].map((role) => String(role || '').toLowerCase());
    const isAdmin = userRoles.some((role) => ['admin', 'super_admin', 'superadmin', 'school_admin', 'schooladmin', 'rba'].includes(role))
      || ['admin', 'super_admin', 'superadmin', 'school_admin', 'schooladmin', 'rba'].includes(rawRole);
    if (isAdmin) userRoles.push('admin');
    if (rawRole === 'super_admin') userRoles.push('system_admin');

    const currentPage = decodeURIComponent(window.location.pathname.split('/').pop() || '').toLowerCase();
    const renderLink = ([href, label, allowedRoles]) => {
      if (!isAdmin && !allowedRoles.some((role) => userRoles.includes(role))) return '';
      const current = href.toLowerCase() === currentPage;
      return `<a class="sidebar-link${current ? ' active' : ''}" href="/${href}"${current ? ' aria-current="page"' : ''}>${label}</a>`;
    };

    const sections = adminNavigationGroups.map(({ title, links }) => {
      const renderedLinks = links.map(renderLink).filter(Boolean).join('');
      if (!renderedLinks) return '';
      const isCurrentSection = links.some(([href, , allowedRoles]) => href.toLowerCase() === currentPage
        && (isAdmin || allowedRoles.some((role) => userRoles.includes(role))));
      return `<details class="sidebar-section admin-nav-group"${isCurrentSection ? ' open' : ''}><summary>${title}</summary>${renderedLinks}</details>`;
    }).join('');

    sidebar.setAttribute('aria-label', 'Main dashboard navigation');
    sidebar.innerHTML = `<div class="sidebar-brand">CRESENT ADMIN</div>${sections}<div class="sidebar-section admin-nav-logout"><a class="sidebar-link" href="#" data-admin-logout>Sign out</a></div>`;
  }

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

    if (document.body.classList.contains('admin-dashboard-page')) {
      window.setTimeout(renderAdminNavigation, 0);
    }
  });

  document.addEventListener('click', (event) => {
    const logoutLink = event.target.closest('.student-sidebar [data-admin-logout]');
    if (!logoutLink) return;
    event.preventDefault();
    if (typeof window.logout === 'function') window.logout();
    else console.warn('Admin navigation: logout function is not available');
  });
})();
