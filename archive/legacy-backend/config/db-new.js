const mysql = require('mysql2/promise');
require('dotenv').config();

const dbHost = process.env.DB_HOST || process.env.DB_HOSTNAME || 'localhost';
const dbUser = process.env.DB_USER || process.env.DB_USERNAME || 'root';
const dbName = process.env.DB_NAME || process.env.DB_DATABASE || 'railway';

const pool = mysql.createPool({
  host: dbHost,
  user: dbUser,
  password: process.env.DB_PASSWORD || '',
  database: dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelayMs: 0,
  ...(process.env.DB_SSL === 'true'
    ? { ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } }
    : {})
});

// Test connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✓ MySQL Connection successful');
    connection.release();
    return true;
  } catch (error) {
    console.error('✗ MySQL Connection failed:', error.message);
    return false;
  }
}

// Ensure database exists
async function ensureDatabase() {
  try {
    const connection = await pool.getConnection();
    
    // Check if database exists
    const [databases] = await connection.query(`SHOW DATABASES LIKE '${dbName}'`);
    
    if (databases.length === 0) {
      console.log('Creating database...');
      await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`);
      console.log('✓ Database created');
    }
    
    connection.release();
  } catch (error) {
    console.error('Error ensuring database:', error);
  }
}

// Query helper
async function query(sql, values = []) {
  try {
    const connection = await pool.getConnection();
    const [results] = await connection.execute(sql, values);
    connection.release();
    return results;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Get connection for transactions
async function getConnection() {
  return await pool.getConnection();
}

module.exports = {
  pool,
  query,
  getConnection,
  testConnection,
  ensureDatabase
};
