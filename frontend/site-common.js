(function () {
  const SCHOOL_HTML = '<span class="cresent-brand">CRESENT</span> HIGH SCHOOL';
  const FOOTER_TEXT = '\u00a9 2026 CRESENT HIGH SCHOOL. All rights reserved.';
  const TOP_NAV = [
    ['dashboard.html', 'Dashboard'],
    ['academic.html', 'Academics'],
    ['finance.html', 'Finance']
  ];
  const MENU_LINKS = [
    ['help.html', 'fa-question-circle', 'Help'],
    ['settings.html', 'fa-cog', 'Settings']
  ];

  const SIDEBAR_SECTIONS = [
    {
      title: 'Main',
      links: [
        ['dashboard.html', 'Dashboard'],
        ['academic.html', 'Academics']
      ]
    },
    {
      title: 'Academics',
      links: [
        ['notes.html', 'Notes'],
        ['revision.html', 'Revision'],
        ['exams.html', 'Exams'],
        ['student-transcript.html', 'Transcript']
      ]
    },
    {
      title: 'Finance',
      links: [
        ['finance.html', 'Fee Balance'],
        ['paymentreceipts.html', 'Receipts'],
        ['feestatement.html', 'Fee Statements']
      ]
    },
    {
      title: 'Support',
      links: [
        ['settings.html', 'Settings'],
        ['help.html', 'Help']
      ]
    }
  ];

  function currentPage() {
    const path = window.location.pathname.split('/').pop();
    return decodeURIComponent(path || 'index.html').toLowerCase();
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

  function buildNav(page) {
    return TOP_NAV.map(([href, label]) => {
      const active = page === href.toLowerCase() ? ' class="active"' : '';
      return `<a href="${href}"${active}>${label}</a>`;
    }).join('');
  }

  function buildDropdown(page) {
    const links = MENU_LINKS.map(([href, icon, label]) => {
      const active = page === href.toLowerCase() ? ' class="active"' : '';
      return `<a href="${href}"${active}>${label}</a>`;
    }).join('');

    return `
      <div class="menu-dropdown-wrapper">
        <button class="site-menu-toggle" type="button" aria-label="Open menu" aria-expanded="false">
          <i class="fas fa-ellipsis-v"></i>
        </button>
        <div class="menu-dropdown" id="menuDropdown">
          ${links}
          <button class="logout-button" type="button">Logout</button>
        </div>
      </div>
    `;
  }

  function normalizeDashboardHeaders() {
    const page = currentPage();
    document.querySelectorAll('header.dashboard-header').forEach((header) => {
      if (page === 'admin-dashboard.html') return;

      header.innerHTML = `
        <div class="header-content">
          <div class="header-brand">
            <div class="school-name">${SCHOOL_HTML}</div>
            <div class="header-tagline">Student Portal</div>
          </div>
          ${buildDropdown(page)}
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
            const active = page === href.toLowerCase() ? ' active' : '';
            return `<a href="${href}" class="sidebar-link${active}">${label}</a>`;
          }).join('')}
        </div>
      `;
    }).join('');
  }

  function ensureStudentSidebar() {
    const page = currentPage();
    if (!document.querySelector('header.dashboard-header')) return;
    if (document.querySelector('.student-sidebar') || document.querySelector('.settings-sidebar') || document.querySelector('.admin-sidebar')) return;

    const main = document.querySelector('main');
    if (!main) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'student-shell';
    wrapper.innerHTML = `<aside class="student-sidebar">${buildSidebarMarkup(page)}</aside>`;
    main.parentNode.insertBefore(wrapper, main);
    wrapper.appendChild(main);
  }

  function ensureIconFont() {
    // Disabled remote Font Awesome injection because browser tracking prevention blocks CDN storage access.
    return;
  }

  function wireMenus() {
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
    });

    document.querySelectorAll('.logout-button').forEach((button) => {
      button.addEventListener('click', () => {
        if (typeof window.logout === 'function') {
          window.logout();
          return;
        }
        localStorage.removeItem('authToken');
        localStorage.removeItem('student');
        localStorage.removeItem('rememberMe');
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

  function ensureFooter() {
    document.body.classList.add('has-site-footer');
    let footer = document.querySelector('footer');
    if (!footer) {
      footer = document.createElement('footer');
      footer.className = 'site-footer dashboard-footer';
      footer.textContent = FOOTER_TEXT;
      document.body.appendChild(footer);
      return;
    }
    footer.classList.add('site-footer');
    footer.textContent = FOOTER_TEXT;
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
      if (!window.React || !window.ReactDOM) {
        await loadScript('https://unpkg.com/react@18/umd/react.production.min.js');
        await loadScript('https://unpkg.com/react-dom@18/umd/react-dom.production.min.js');
      }
      await loadScript('react-portal.js');
    } catch (error) {
      console.warn('React portal layer could not be loaded. Falling back to static page behavior.', error);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureIconFont();
    normalizeDashboardHeaders();
    ensureStudentSidebar();
    normalizeBrandText(document);
    renameCalendarCopy(document);
    ensureFooter();
    wireMenus();
    loadReactPortal();
  });
}());
