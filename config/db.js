const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true
};

const database = process.env.DB_NAME || 'cresent_high_school_portal';

let pool;

async function ensureDatabase() {
  const connection = await mysql.createConnection(dbConfig);
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.end();

  pool = mysql.createPool({ ...dbConfig, database });
  await runSchema();
  return pool;
}

function getPool() {
  if (!pool) {
    pool = mysql.createPool({ ...dbConfig, database });
  }
  return pool;
}

async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function runSchema() {
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  if (!fs.existsSync(schemaPath)) return;
  const schema = fs.readFileSync(schemaPath, 'utf8');
  if (schema.trim()) {
    await getPool().query(schema);
  }
  await runMigrations();
}

async function columnExists(tableName, columnName) {
  const [rows] = await getPool().execute(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [database, tableName, columnName]
  );
  return Number(rows[0].count) > 0;
}

async function addColumnIfMissing(tableName, columnName, definition) {
  if (await columnExists(tableName, columnName)) return;
  await getPool().query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
}

async function dropColumnIfExists(tableName, columnName) {
  const exists = await columnExists(tableName, columnName);
  if (!exists) return;
  await getPool().query(`ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``);
}

async function runMigrations() {
  await addColumnIfMissing('calendar_events', 'start_date', 'DATETIME NULL');
  await addColumnIfMissing('calendar_events', 'end_date', 'DATETIME NULL');
  await addColumnIfMissing('calendar_events', 'subject', 'VARCHAR(100) NULL');
  await addColumnIfMissing('calendar_events', 'location', 'VARCHAR(150) NULL');
  await addColumnIfMissing('results', 'exam_type', 'VARCHAR(80) NULL');
  await addColumnIfMissing('students', 'date_of_birth', 'DATE NULL');
  await addColumnIfMissing('students', 'address', 'TEXT NULL');
  await addColumnIfMissing('applications', 'birth_certificate_path', 'VARCHAR(255) NULL');
  await addColumnIfMissing('applications', 'kcpe_certificate_path', 'VARCHAR(255) NULL');
  await addColumnIfMissing('applications', 'medical_form_path', 'VARCHAR(255) NULL');
  await addColumnIfMissing('notes', 'topic', 'VARCHAR(150) NULL');
  await addColumnIfMissing('notes', 'file_size', 'BIGINT DEFAULT 0');
  await addColumnIfMissing('notes', 'downloads', 'INT DEFAULT 0');
  await addColumnIfMissing('revision_materials', 'exam_year', 'INT NULL');
  await addColumnIfMissing('revision_materials', 'estimated_time', 'INT NULL');
  await addColumnIfMissing('revision_materials', 'rating', 'DECIMAL(3,2) DEFAULT 0');
  await addColumnIfMissing('assignments', 'max_points', 'INT DEFAULT 100');
  await addColumnIfMissing('assignment_submissions', 'grade', 'DECIMAL(6,2) NULL');
  await addColumnIfMissing('assignment_submissions', 'feedback', 'TEXT NULL');

  const transcriptTables = ['form1_transcript', 'form2_transcript', 'form3_transcript', 'form4_transcript'];
  const transcriptColumns = [
    ['adm', 'VARCHAR(50) NOT NULL'],
    ['name', 'VARCHAR(150) NOT NULL'],
    ['stream', 'VARCHAR(40) NULL'],
    ['eng', 'DECIMAL(5,2) NULL'],
    ['kisw', 'DECIMAL(5,2) NULL'],
    ['mat', 'DECIMAL(5,2) NULL'],
    ['bio', 'DECIMAL(5,2) NULL'],
    ['che', 'DECIMAL(5,2) NULL'],
    ['phy', 'DECIMAL(5,2) NULL'],
    ['cre', 'DECIMAL(5,2) NULL'],
    ['his', 'DECIMAL(5,2) NULL'],
    ['geo', 'DECIMAL(5,2) NULL'],
    ['comp', 'DECIMAL(5,2) NULL'],
    ['bus', 'DECIMAL(5,2) NULL'],
    ['agr', 'DECIMAL(5,2) NULL'],
    ['total', 'DECIMAL(7,2) NULL'],
    ['avg', 'DECIMAL(5,2) NULL'],
    ['grade', 'VARCHAR(2) NULL']
  ];

  for (const table of transcriptTables) {
    for (const [columnName, definition] of transcriptColumns) {
      await addColumnIfMissing(table, columnName, definition);
    }

    await dropColumnIfExists(table, 'subject');
    await dropColumnIfExists(table, 'score');
    await dropColumnIfExists(table, 'exam_type');
    await dropColumnIfExists(table, 'filename');
    await dropColumnIfExists(table, 'generated_by');
    await dropColumnIfExists(table, 'generated_at');
  }

  await initializeFormData();
}

async function initializeFormData() {
  const currentYear = new Date().getFullYear();
  try {
    const existingClasses = await query('SELECT COUNT(*) as count FROM classes');
    if (existingClasses[0].count === 0) {
      const forms = [1, 2, 3, 4];
      for (const form of forms) {
        for (let i = 0; i < 3; i++) {
          const className = `Form ${form}${String.fromCharCode(65 + i)}`;
          await query('INSERT INTO classes (form, name, total_capacity, academic_year, active) VALUES (?, ?, ?, ?, 1)',
            [form, className, 50, currentYear]);
        }
      }
    }
  } catch (err) {
    console.log('Form data initialization skipped (may already exist):', err.message);
  }
}

module.exports = {
  database,
  ensureDatabase,
  getPool,
  query
};
