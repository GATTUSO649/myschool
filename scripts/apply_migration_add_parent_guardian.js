const { query, database } = require('../config/db');

async function columnExists(tableName, columnName) {
  const rows = await query(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [database, tableName, columnName]
  );
  return Number(rows[0].count) > 0;
}

async function addColumnIfMissing(tableName, columnName, definition) {
  if (await columnExists(tableName, columnName)) {
    console.log(`${tableName}.${columnName} already exists, skipping`);
    return;
  }
  console.log(`Adding column ${tableName}.${columnName} ...`);
  await query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  console.log(`Added ${tableName}.${columnName}`);
}

async function run() {
  try {
    await addColumnIfMissing('applications', 'parent_email', 'VARCHAR(150) NULL');
    await addColumnIfMissing('students', 'guardian_email', 'VARCHAR(150) NULL');
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

run();
