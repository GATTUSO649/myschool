const test = require('node:test');
const assert = require('node:assert/strict');
const { csrfProtection } = require('../middleware/security');

test('csrfProtection skips enforcement when auth cookie is present', async () => {
  let nextCalled = false;
  const req = {
    method: 'POST',
    headers: {},
    cookies: { authToken: 'abc123' },
    body: {}
  };
  const res = {};

  await new Promise((resolve) => {
    csrfProtection(req, res, () => {
      nextCalled = true;
      resolve();
    });
  });

  assert.equal(nextCalled, true);
});
