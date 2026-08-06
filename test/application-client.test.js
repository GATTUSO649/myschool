const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadClient() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'application-client.js'), 'utf8');
  const context = {
    window: {},
    console,
    location: { origin: 'http://localhost:5001' },
    document: { cookie: 'csrfToken=test-token' },
    fetch: async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ success: true }) }),
    Headers: class Headers {
      constructor(init = {}) {
        this.values = init;
      }
      set(name, value) {
        this.values[name] = value;
      }
      get(name) {
        return this.values[name];
      }
    },
    FormData: class FormData {}
  };
  context.window = context;
  context.globalThis = context;
  context.global = context;

  vm.createContext(context);
  vm.runInContext(source, context);
  return { client: context.window.CresentApplicationClient, context };
}

test('application client builds API URLs without duplicating /api', () => {
  const { client } = loadClient();
  assert.ok(client);
  assert.equal(client.buildApiUrl('/api/applications', 'http://localhost:5001'), 'http://localhost:5001/api/applications');
  assert.equal(client.buildApiUrl('/applications', 'http://localhost:5001'), 'http://localhost:5001/api/applications');
  assert.equal(client.buildApiUrl('/api/applications', 'http://localhost:5001/api'), 'http://localhost:5001/api/applications');
});

test('application client forwards the CSRF token when present', async () => {
  const { client, context } = loadClient();
  let capturedHeaders = null;
  context.fetch = async (url, options = {}) => {
    capturedHeaders = options.headers;
    return {
      ok: true,
      status: 200,
      headers: new context.Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true })
    };
  };

  await client.request('/api/applications', { method: 'POST', body: new context.FormData() });
  assert.equal(capturedHeaders.get('X-CSRF-Token'), 'test-token');
});
