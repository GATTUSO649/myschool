const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const dbHost = process.env.DB_HOST || process.env.DB_HOSTNAME || 'localhost';
const dbUser = process.env.DB_USER || process.env.DB_USERNAME || 'root';

const dbConfig = {
  host: dbHost,
  port: Number(process.env.DB_PORT || 3306),
  user: dbUser,
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true,
  ...(process.env.DB_SSL === 'true'
    ? { ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } }
    : {})
};

const database = process.env.DB_NAME || process.env.DB_DATABASE || 'railway';

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
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(100) PRIMARY KEY,
      setting_value TEXT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS ict_permissions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      role VARCHAR(40) NOT NULL,
      permission_key VARCHAR(100) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      UNIQUE KEY uniq_ict_permission (role, permission_key)
    )
  `);
  const ictPermissionKeys = ['students.view', 'students.manage', 'finance.view', 'finance.manage', 'academics.view', 'academics.manage', 'users.manage', 'security.view', 'system.manage', 'backups.manage', 'maintenance.manage'];
  for (const permissionKey of ictPermissionKeys) {
    await getPool().query('INSERT IGNORE INTO ict_permissions (role, permission_key, enabled) VALUES (\'ict\', ?, 1)', [permissionKey]);
  }
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS ict_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      jti VARCHAR(80) NOT NULL UNIQUE,
      user_id INT NULL,
      role VARCHAR(40) NOT NULL,
      login_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_activity DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ip_address VARCHAR(80),
      user_agent VARCHAR(255),
      revoked_at DATETIME NULL,
      CONSTRAINT fk_ict_sessions_user FOREIGN KEY (user_id) REFERENCES students(id) ON DELETE SET NULL,
      INDEX idx_ict_sessions_user (user_id),
      INDEX idx_ict_sessions_active (revoked_at, last_activity)
    )
  `);
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS ict_backups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'requested',
      size_bytes BIGINT DEFAULT 0,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME NULL,
      error_message TEXT,
      CONSTRAINT fk_ict_backups_user FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL
    )
  `);
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS ict_tickets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(180) NOT NULL,
      module VARCHAR(80),
      description TEXT NOT NULL,
      priority VARCHAR(20) NOT NULL DEFAULT 'normal',
      status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
      created_by INT NULL,
      assigned_to INT NULL,
      attachment VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_ict_ticket_creator FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL,
      CONSTRAINT fk_ict_ticket_assignee FOREIGN KEY (assigned_to) REFERENCES students(id) ON DELETE SET NULL
    )
  `);

  await addColumnIfMissing('calendar_events', 'start_date', 'DATETIME NULL');
  await addColumnIfMissing('calendar_events', 'end_date', 'DATETIME NULL');
  await addColumnIfMissing('calendar_events', 'subject', 'VARCHAR(100) NULL');
  await addColumnIfMissing('calendar_events', 'location', 'VARCHAR(150) NULL');
  await addColumnIfMissing('results', 'exam_type', 'VARCHAR(80) NULL');
  await addColumnIfMissing('students', 'date_of_birth', 'DATE NULL');
  await addColumnIfMissing('students', 'address', 'TEXT NULL');
  await addColumnIfMissing('students', 'subject', 'VARCHAR(100) NULL');
  await addColumnIfMissing('students', 'staff_number', 'VARCHAR(30) NULL');
  await addColumnIfMissing('students', 'finance_working_area', 'VARCHAR(100) NULL');
  await addColumnIfMissing('students', 'ict_working_area', 'VARCHAR(100) NULL');
  try {
    await getPool().query(`ALTER TABLE students MODIFY role ENUM('student','lecturer','teacher','rba','admin','school_admin','super_admin','finance','accountant','ict') NOT NULL DEFAULT 'student'`);
  } catch (error) {
    console.warn('Could not update student role options:', error.message || error);
  }
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

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT NOT NULL,
      email VARCHAR(255) NULL,
      otp_hash VARCHAR(255) NOT NULL,
      temp_password_hash VARCHAR(255) NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS teacher_assignments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      teacher_id INT NOT NULL,
      class_name VARCHAR(40) NOT NULL,
      subject VARCHAR(100) NOT NULL,
      academic_year INT NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_teacher_assignment (teacher_id, class_name, subject, academic_year),
      INDEX idx_teacher_assignment_teacher (teacher_id),
      CONSTRAINT fk_teacher_assignment_teacher FOREIGN KEY (teacher_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS student_attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      teacher_id INT NOT NULL,
      student_id INT NOT NULL,
      class_name VARCHAR(40) NOT NULL,
      attendance_date DATE NOT NULL,
      status ENUM('present','absent','late') NOT NULL DEFAULT 'present',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_student_attendance (teacher_id, student_id, attendance_date),
      CONSTRAINT fk_student_attendance_teacher FOREIGN KEY (teacher_id) REFERENCES students(id) ON DELETE CASCADE,
      CONSTRAINT fk_student_attendance_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS teacher_lesson_attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      teacher_id INT NOT NULL,
      attendance_date DATE NOT NULL,
      status ENUM('present','absent','late') NOT NULL DEFAULT 'present',
      notes VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_teacher_lesson_attendance (teacher_id, attendance_date),
      CONSTRAINT fk_teacher_lesson_attendance_teacher FOREIGN KEY (teacher_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

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

  try {
    const adminRows = await query("SELECT id FROM students WHERE LOWER(username) = 'admin' OR LOWER(role) = 'admin' LIMIT 1");
    if (!adminRows.length) {
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash('Admin@2026', 10);
      await query(
        `INSERT INTO students (name, username, email, admission_number, password_hash, role, active, class_name, stream)
         VALUES (?, ?, ?, ?, ?, 'admin', 1, 'Administration', 'Administration')`,
        ['Administrator', 'admin', 'admin@cresenthighschool.com', 'ADMIN', passwordHash]
      );
      console.log('Seeded default admin account: username=admin password=Admin@2026');
    }
  } catch (err) {
    console.log('Admin seed skipped:', err.message);
  }
}

module.exports = {
  database,
  ensureDatabase,
  getPool,
  query
};
