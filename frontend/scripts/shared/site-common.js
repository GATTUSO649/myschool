(function () {
  const SCHOOL_HTML = '<span class="cresent-brand">CRESENT</span> HIGH SCHOOL';
  const FOOTER_TEXT = '\u00a9 2026 CRESENT HIGH SCHOOL. All rights reserved.';
  const SIDEBAR_SECTIONS = [
    {
      title: 'Main',
      links: [
        ['dashboard.html', 'Dashboard']
      ]
    },
    {
      title: 'Academics',
      links: [
        ['academic.html', 'Academics'],
        ['notes.html', 'Notes'],
        ['transcript.html', 'Transcript']
      ]
    },
    {
      title: 'Finance',
      links: [
        ['finance.html', 'Finance'],
        ['feestatement.html', 'Fee Statements'],
        ['finance.html#payment', 'Fee Payment'],
        ['paymentreceipts.html', 'Receipts']
      ]
    },
    {
      title: 'Support',
      links: [
        ['help.html', 'Help']
      ]
    }
  ];

  function currentPage() {
    const path = window.location.pathname.split('/').pop();
    return decodeURIComponent(path || 'index.html').toLowerCase();
  }

  function getStudentDisplayName() {
    try {
      const student = JSON.parse(sessionStorage.getItem('student') || 'null');
      if (student?.name) return student.name.split(' ')[0];
    } catch (error) {
      // ignore
    }
    return 'Student';
  }

  function normalizeBrandText(root) {
    const brandTargets = root.querySelectorAll('.school-name, .portal-header h1, .admin-header h1');
    brandTargets.forEach((target) => {
      const text = target.textContent.replace(/\s+/g, ' ').trim().toUpperCase();
      if (text.includes('CRESENT HIGH SCHOOL') || text.includes('CARTER VI HIGHSCHOOL')) {
        target.innerHTML = SCHOOL_HTML;
      }
    });
  }

  function normalizeDashboardHeaders() {
    const page = currentPage();
    document.querySelectorAll('header.dashboard-header').forEach((header) => {
      if (page.startsWith('admin-')) return;
      const existingTagline = header.querySelector('.header-note')?.textContent.trim() || 'Student Portal';

      header.innerHTML = `
        <div class="header-content">
          <button class="mobile-sidebar-toggle" type="button" aria-label="Toggle menu">
            <i class="fas fa-bars"></i>
          </button>
          <div class="brand-bar header-brand">
            <div class="school-name">${SCHOOL_HTML}</div>
            <div class="header-note header-tagline">${existingTagline}</div>
          </div>
          <div class="header-actions">
            <span class="header-pill">${getStudentDisplayName()}</span>
            <button class="logout-button" type="button">Logout</button>
          </div>
        </div>
      `;
    });
  }

  function buildSidebarMarkup(page) {
    return SIDEBAR_SECTIONS.map((section) => {
      return `
        <div class="sidebar-section">
          <h3>${section.title}</h3>
          ${section.links.map(([href, label]) => {
            const hrefPath = href.split('?')[0].toLowerCase();
            const active = page === hrefPath ? ' active' : '';
            return `<a href="${href}" class="sidebar-link${active}">${label}</a>`;
          }).join('')}
        </div>
      `;
    }).join('');
  }

  function ensureStudentSidebar() {
    const page = currentPage();
    if (!document.querySelector('header.dashboard-header')) return;
    if (page.startsWith('admin-') || document.querySelector('.settings-sidebar') || document.querySelector('.admin-sidebar')) return;
    const existingSidebar = document.querySelector('.student-sidebar');
    const main = document.querySelector('main');

    if (existingSidebar) {
      existingSidebar.innerHTML = buildSidebarMarkup(page);
      const shell = existingSidebar.closest('.student-shell');
      if (!shell && main) {
        const wrapper = document.createElement('div');
        wrapper.className = 'student-shell';
        main.parentNode.insertBefore(wrapper, main);
        wrapper.appendChild(existingSidebar);
        wrapper.appendChild(main);
      }
      return;
    }

    if (!main) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'student-shell';
    main.parentNode.insertBefore(wrapper, main);
    const sidebar = document.createElement('aside');
    sidebar.className = 'student-sidebar';
    sidebar.innerHTML = buildSidebarMarkup(page);
    wrapper.appendChild(sidebar);
    wrapper.appendChild(main);
  }

  function ensureIconFont() {
    // Disabled remote Font Awesome injection because browser tracking prevention blocks CDN storage access.
    return;
  }

  function wireMenus() {
    const hasStudentSidebar = Boolean(document.querySelector('.student-sidebar'));
    let backdrop = document.querySelector('.mobile-sidebar-backdrop');
    if (!hasStudentSidebar && backdrop) {
      backdrop.remove();
      backdrop = null;
    }
    if (hasStudentSidebar && !backdrop) {
      backdrop = document.createElement('button');
      backdrop.type = 'button';
      backdrop.className = 'mobile-sidebar-backdrop';
      backdrop.setAttribute('aria-label', 'Close navigation menu');
      document.body.appendChild(backdrop);
    }

    const setSidebarOpen = (isOpen) => {
      const sidebar = document.querySelector('.student-sidebar');
      if (!sidebar) return;
      sidebar.classList.toggle('is-open', isOpen);
      backdrop.classList.toggle('is-visible', isOpen);
      document.body.classList.toggle('sidebar-open', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    };

    document.querySelectorAll('.mobile-sidebar-toggle').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const sidebar = document.querySelector('.student-sidebar');
        setSidebarOpen(!sidebar?.classList.contains('is-open'));
      });
    });

    if (backdrop) backdrop.addEventListener('click', () => setSidebarOpen(false));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    });

    document.querySelectorAll('.site-menu-toggle, .menu-toggle').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const wrapper = button.closest('.menu-dropdown-wrapper');
        const dropdown = wrapper ? wrapper.querySelector('.menu-dropdown') : document.getElementById('menuDropdown');
        if (!dropdown) return;
        const isOpen = dropdown.classList.toggle('active');
        dropdown.classList.toggle('is-open', isOpen);
        button.setAttribute('aria-expanded', String(isOpen));
      });
    });

    document.addEventListener('click', (event) => {
      document.querySelectorAll('.menu-dropdown.active, .menu-dropdown.is-open').forEach((dropdown) => {
        const wrapper = dropdown.closest('.menu-dropdown-wrapper');
        if (wrapper && wrapper.contains(event.target)) return;
        dropdown.classList.remove('active', 'is-open');
        const toggle = wrapper ? wrapper.querySelector('.site-menu-toggle, .menu-toggle') : null;
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      });

      const sidebar = document.querySelector('.student-sidebar');
      if (sidebar && sidebar.classList.contains('is-open') && !sidebar.contains(event.target) && !event.target.closest('.mobile-sidebar-toggle')) {
        setSidebarOpen(false);
      }
    });

    document.querySelectorAll('.student-sidebar a').forEach((link) => {
      link.addEventListener('click', () => setSidebarOpen(false));
    });

    document.querySelectorAll('.logout-button').forEach((button) => {
      button.addEventListener('click', () => {
        if (typeof window.logout === 'function') {
          window.logout();
          return;
        }
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('student');
        sessionStorage.removeItem('rememberMe');
        sessionStorage.removeItem('authSessionExpiresAt');
        window.location.href = 'login.html';
      });
    });
  }

  function renameCalendarCopy(root) {
    root.querySelectorAll('a[href="calendar.html"], a[href$="/calendar.html"]').forEach((link) => {
      const text = link.textContent.trim();
      if (/calendar/i.test(text)) {
        link.textContent = /view|academic/i.test(text) ? 'View Events' : 'Events';
      }
    });

    document.title = document.title.replace(/Academic Calendar|Calendar/g, 'Events');

    root.querySelectorAll('h1, h2, h3, strong, .stat-label').forEach((node) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE && /Calendar/.test(child.nodeValue)) {
          child.nodeValue = child.nodeValue.replace(/Academic Calendar|Calendar/g, 'Events');
        }
      });
    });
  }

  function cleanupLegacyLayout() {
    document.querySelectorAll('nav.dashboard-nav, .dashboard-top-nav, .portal-nav, .legacy-nav').forEach((nav) => nav.remove());

    const footers = [...document.querySelectorAll('footer')];
    if (footers.length > 1) {
      footers.slice(1).forEach((footer) => footer.remove());
    }

    const legacyFooters = [...document.querySelectorAll('.dashboard-footer, .site-footer')];
    if (legacyFooters.length > 1) {
      legacyFooters.slice(1).forEach((footer) => footer.remove());
    }
  }

  function ensureFooter() {
    document.body.classList.add('has-site-footer');
    cleanupLegacyLayout();

    let footer = document.querySelector('footer');
    if (!footer) {
      footer = document.createElement('footer');
      footer.className = 'site-footer dashboard-footer';
      footer.textContent = FOOTER_TEXT;
      document.body.appendChild(footer);
      return;
    }
    footer.classList.add('site-footer', 'dashboard-footer');
    if (!footer.textContent.trim()) {
      footer.textContent = FOOTER_TEXT;
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  async function loadReactPortal() {
    const supportedPages = new Set([
      'dashboard.html',
      'academic.html',
      'finance.html',
      'admin-dashboard.html'
    ]);
    if (!supportedPages.has(currentPage())) return;

    try {
      await loadScript('/scripts/shared/react-portal.js');
    } catch (error) {
      console.warn('React portal layer could not be loaded. Falling back to static page behavior.', error);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    cleanupLegacyLayout();
    ensureIconFont();
    normalizeDashboardHeaders();
    ensureStudentSidebar();
    normalizeBrandText(document);
    renameCalendarCopy(document);
    ensureFooter();
    wireMenus();
    loadReactPortal();
  });
  
  // Toast helper
  window.showToast = function(message, type = 'info', timeout = 4000) {
    try {
      let container = document.querySelector('.toast-container');
      if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
      }
      const t = document.createElement('div');
      t.className = `toast ${type}`;
      t.textContent = message;
      container.appendChild(t);
      setTimeout(() => { t.remove(); if (!container.children.length) container.remove(); }, timeout);
    } catch (e) { console.warn('Toast failed', e); }
  };
}());
