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

test('CBE application approval requires explicit CBE placement confirmation', async () => {
  const originalGetPool = db.getPool;
  let committed = false;
  let rolledBack = false;
  const connection = {
    async beginTransaction() {},
    async commit() { committed = true; },
    async rollback() { rolledBack = true; },
    release() {},
    async query(sql) {
      assert.match(sql, /^SELECT \* FROM applications/);
      return [[{
        id: 24,
        status: 'pending',
        curriculum_type: 'CBE',
        intended_admission_level: 'Grade 10'
      }], []];
    }
  };
  db.getPool = () => ({ getConnection: async () => connection });
  const response = createResponse();

  try {
    await approveApplication({ params: { id: '24' }, body: {}, user: { id: 4 }, ip: '127.0.0.1' }, response);
    assert.equal(response.statusCode, 400);
    assert.match(response.payload.message, /Confirm a valid CBE admission placement/);
    assert.equal(committed, false);
    assert.equal(rolledBack, true);
  } finally {
    db.getPool = originalGetPool;
  }
});

test('CBE approval stores confirmed grade without assigning an 8-4-4 stream', async () => {
  const originalGetPool = db.getPool;
  const statements = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.startsWith('SELECT * FROM applications')) {
        return [[{
          id: 25,
          status: 'pending',
          curriculum_type: 'CBE',
          intended_admission_level: 'Grade 10',
          admission_number: 'CRES/100/2026',
          full_name: 'CBE Student',
          parent_email: null,
          email: null
        }], []];
      }
      if (sql.startsWith('SELECT id, username, email, admission_number FROM students')) return [[], []];
      if (sql.startsWith('INSERT INTO students')) return [{ insertId: 82 }, []];
      return [{ affectedRows: 1 }, []];
    }
  };
  db.getPool = () => ({ getConnection: async () => connection });
  const response = createResponse();

  try {
    await approveApplication({
      params: { id: '25' },
      body: { confirmedPlacement: 'Grade 10' },
      user: { id: 4 },
      ip: '127.0.0.1'
    }, response);

    const studentInsert = statements.find(({ sql }) => sql.startsWith('INSERT INTO students'));
    assert.match(studentInsert.sql, /curriculum_type, preferred_pathway/);
    assert.equal(studentInsert.params[6], 'Grade 10');
    assert.equal(studentInsert.params[7], null);
    assert.equal(studentInsert.params[8], 'CBE');

    const applicationUpdate = statements.find(({ sql }) => sql.startsWith('UPDATE applications'));
    assert.equal(applicationUpdate.params[1], null);
    assert.equal(applicationUpdate.params[3], 'confirmed');
    assert.equal(applicationUpdate.params[4], 'Grade 10');
    assert.equal(response.payload.success, true);
    assert.equal(response.payload.curriculumType, 'CBE');
  } finally {
    db.getPool = originalGetPool;
  }
});
