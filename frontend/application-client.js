(function (global) {
  function buildApiUrl(endpoint, baseUrl) {
    if (!endpoint) return baseUrl || '';
    if (/^https?:\/\//i.test(endpoint)) return endpoint;

    const configuredBase = (baseUrl || global.CONFIG?.API_URL || `${global.location?.origin || ''}/api`).replace(/\/$/, '');
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const hasApiPrefix = /\/api(?:\/)?$/i.test(configuredBase);
    const base = hasApiPrefix ? configuredBase : `${configuredBase}/api`;
    const cleanedEndpoint = normalizedEndpoint.replace(/^\/api/, '');

    return `${base}${cleanedEndpoint.startsWith('/') ? cleanedEndpoint : `/${cleanedEndpoint}`}`;
  }

  function getCsrfToken() {
    try {
      const cookieValue = (global.document?.cookie || '')
        .split(';')
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith('csrfToken='));
      if (!cookieValue) return '';
      return decodeURIComponent(cookieValue.split('=').slice(1).join('='));
    } catch (error) {
      return '';
    }
  }

  function createHeaders(initialHeaders = {}) {
    if (typeof global.Headers === 'function') {
      return new global.Headers(initialHeaders);
    }
    return {
      ...initialHeaders,
      set(name, value) {
        this[name] = value;
      },
      get(name) {
        return this[name];
      }
    };
  }

  async function request(endpoint, options = {}, baseUrl) {
    const url = buildApiUrl(endpoint, baseUrl || global.CONFIG?.API_URL || `${global.location?.origin || ''}/api`);
    const headers = createHeaders(options.headers || {});
    const token = global.localStorage?.getItem('authToken');
    const csrfToken = getCsrfToken();

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken);
    }

    const isFormData = typeof global.FormData === 'function' && options.body instanceof global.FormData;
    if (!isFormData) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });

    if (!response.ok && response.status === 401) {
      throw new Error('Authentication required');
    }

    const contentType = response.headers.get('content-type') || '';
    let data = null;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = text ? { message: text } : null;
    }

    return { response, data };
  }

  global.CresentApplicationClient = {
    buildApiUrl,
    request,
    getCsrfToken
  };
})(typeof window !== 'undefined' ? window : globalThis);
