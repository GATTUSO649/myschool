const test = require('node:test');
const assert = require('node:assert/strict');
const { csrfProtection } = require('../middleware/security');

test('csrfProtection skips enforcement when bearer authentication is present', async () => {
  let nextCalled = false;
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer abc123' },
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
