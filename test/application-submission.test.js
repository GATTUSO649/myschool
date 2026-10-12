const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');
const logController = require('../controllers/logController');
const emailUtils = require('../controllers/emailUtils');

const originalQuery = db.query;
const originalLogActivity = logController.logActivity;
const originalConfirmationEmail = emailUtils.sendApplicationConfirmationEmail;
const statements = [];

db.query = async (sql, params = []) => {
  statements.push({ sql, params });
  if (sql.includes('SELECT setting_value FROM app_settings')) return [];
  if (sql.includes('INSERT INTO applications')) return { insertId: 123 };
  throw new Error(`Unexpected SQL in application submission test: ${sql}`);
};
logController.logActivity = async () => {};
emailUtils.sendApplicationConfirmationEmail = async () => {};

const { createApplication } = require('../controllers/applicationController');
db.query = originalQuery;
logController.logActivity = originalLogActivity;
emailUtils.sendApplicationConfirmationEmail = originalConfirmationEmail;

function createResponse() {
  return {
    statusCode: 200,
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

test('submits a valid 8-4-4 application with all SQL parameters bound', async () => {
  statements.length = 0;
  const response = createResponse();
  await createApplication({
    body: {
      curriculumType: '8-4-4',
      fullName: 'Test Applicant',
      intendedAdmissionLevel: 'Form 1',
      dob: '2012-05-18',
      gender: 'Female',
      previousSchool: 'Previous School',
      completionYear: String(new Date().getFullYear() - 1),
      previousEducationStage: 'Primary School',
      previousGradeOrForm: 'Standard 8',
      parentName: 'Test Parent',
      parentPhone: '0712345678',
      parentEmail: 'parent@example.com'
    },
    ip: '127.0.0.1'
  }, response);

  const insert = statements.find(({ sql }) => sql.includes('INSERT INTO applications'));
  assert.ok(insert);
  assert.equal((insert.sql.match(/\?/g) || []).length, insert.params.length);
  assert.equal(response.statusCode, 201);
  assert.equal(response.payload.success, true);
  assert.equal(response.payload.id, 123);
});

test('rejects a missing curriculum before inserting the application', async () => {
  statements.length = 0;
  const response = createResponse();
  await createApplication({
    body: {
      fullName: 'Test Applicant',
      parentEmail: 'parent@example.com',
      dob: '2012-05-18',
      gender: 'Female',
      parentName: 'Test Parent',
      parentPhone: '0712345678'
    },
    ip: '127.0.0.1'
  }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.payload.message, 'Select a valid education curriculum.');
  assert.equal(statements.some(({ sql }) => sql.includes('INSERT INTO applications')), false);
});
