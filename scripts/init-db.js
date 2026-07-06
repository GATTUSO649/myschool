const bcrypt = require('bcryptjs');
const { ensureDatabase, query, database } = require('../config/db');
require('dotenv').config();

async function main() {
  await ensureDatabase();

  const username = process.env.DEFAULT_ADMIN_USERNAME || 'pickens';
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
  const passwordHash = await bcrypt.hash(password, 10);

  await query(
    `INSERT INTO students (name, username, email, admission_number, password_hash, role, active)
     VALUES ('School Admin', ?, ?, 'ADMIN/001', ?, 'rba', 1)
     ON DUPLICATE KEY UPDATE role = 'rba', password_hash = VALUES(password_hash), active = 1`,
    [username, process.env.DEFAULT_ADMIN_EMAIL || 'admin@cresent.local', passwordHash]
  );

  console.log(`Database "${database}" is ready.`);
  console.log(`Admin login: ${username} / ${password}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
