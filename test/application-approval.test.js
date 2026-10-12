const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');
const logController = require('../controllers/logController');

const originalLogActivity = logController.logActivity;
logController.logActivity = async () => {};
const { approveApplication } = require('../controllers/applicationController');
logController.logActivity = originalLogActivity;

function createResponse() {
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

test('approving an existing admission assigns it the student role without matching by parent email', async () => {
  const originalGetPool = db.getPool;
  const statements = [];
  const admissionNumber = 'CRES/099/2026';
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.startsWith('SELECT * FROM applications')) {
        return [[{
          id: 23,
          status: 'pending',
          admission_number: admissionNumber,
          stream: 'A',
          full_name: 'Test Student',
          parent_email: null,
          email: null
        }], []];
      }
      if (sql.startsWith('SELECT id, username, email, admission_number FROM students')) {
        return [[{
          id: 81,
          username: 'Test Student',
          email: null,
          admission_number: admissionNumber
        }], []];
      }
      return [{ affectedRows: 1 }, []];
    }
  };
  db.getPool = () => ({ getConnection: async () => connection });
  const response = createResponse();

  try {
    await approveApplication({ params: { id: '23' }, user: { id: 4 }, ip: '127.0.0.1' }, response);

    const accountLookup = statements.find(({ sql }) => sql.startsWith('SELECT id, username, email, admission_number FROM students'));
    assert.match(accountLookup.sql, /WHERE admission_number = \? LIMIT 1/);
    assert.deepEqual(accountLookup.params, [admissionNumber]);

    const accountUpdate = statements.find(({ sql }) => sql.startsWith('UPDATE students'));
    assert.match(accountUpdate.sql, /role = 'student'/);
    assert.match(accountUpdate.sql, /active = 1/);
    assert.equal(response.payload.success, true);
  } finally {
    db.getPool = originalGetPool;
  }
});
