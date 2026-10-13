const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeFinanceRole, authorizePermission, authorizeRole } = require('../middleware/adminMiddleware');
const { ROLE_PERMISSIONS } = require('../config/rbac');
const { normalizeRole } = require('../middleware/authMiddleware');
const { createStaff } = require('../controllers/staffController');

function response() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

test('role authorization accepts a canonical secondary role', () => {
  const req = { user: { role: 'teacher', roleKeys: ['academics_admin'], roles: ['academics'] } };
  const res = response();
  let continued = false;

  authorizeRole(['academics'])(req, res, () => { continued = true; });

  assert.equal(continued, true);
  assert.equal(res.statusCode, null);
});

test('role authorization denies users without an allowed role', () => {
  const req = { user: { role: 'teacher', roleKeys: ['teacher'] } };
  const res = response();

  authorizeRole(['finance'])(req, res, () => assert.fail('Unauthorized request continued'));

  assert.equal(res.statusCode, 403);
});

test('permission authorization requires the exact granted permission', () => {
  const req = { user: { permissions: ['finance.dashboard.view'] } };
  const res = response();
  let continued = false;

  authorizePermission('finance.dashboard.view')(req, res, () => { continued = true; });
  assert.equal(continued, true);

  const denied = response();
  authorizePermission('fees.manage')(req, denied, () => assert.fail('Unauthorized request continued'));
  assert.equal(denied.statusCode, 403);
});

test('finance authorization accepts finance role but does not infer access from unrelated roles', () => {
  const allowed = response();
  let continued = false;
  authorizeFinanceRole()(
    { user: { role: 'teacher', roleKeys: ['finance_admin'] } },
    allowed,
    () => { continued = true; }
  );
  assert.equal(continued, true);

  const denied = response();
  authorizeFinanceRole()({ user: { role: 'academics_admin' } }, denied, () => assert.fail('Unauthorized request continued'));
  assert.equal(denied.statusCode, 403);
});

test('canonical staff roles normalize without inheriting unrelated teacher access', () => {
  assert.equal(normalizeRole('academics_admin'), 'academics');
  assert.equal(normalizeRole('department_head'), 'hod');
  assert.equal(normalizeRole('finance_admin'), 'finance');
  assert.equal(ROLE_PERMISSIONS.finance_admin.includes('marks.enter'), false);
  assert.equal(ROLE_PERMISSIONS.teacher.includes('payments.record'), false);
  assert.equal(ROLE_PERMISSIONS.school_admin.includes('payments.record'), false);
});

test('staff appointment rejects invalid date and privileged role assignments before database access', async () => {
  const invalidDateResponse = response();
  await createStaff({
    body: {
      name: 'Staff Member',
      email: 'staff@example.org',
      roles: ['teacher'],
      startDate: '2025-02-30'
    },
    user: { id: 2 }
  }, invalidDateResponse);
  assert.equal(invalidDateResponse.statusCode, 400);

  const privilegedRoleResponse = response();
  await createStaff({
    body: {
      name: 'Staff Member',
      email: 'staff@example.org',
      roles: ['school_admin']
    },
    user: { id: 2 }
  }, privilegedRoleResponse);
  assert.equal(privilegedRoleResponse.statusCode, 400);
});
