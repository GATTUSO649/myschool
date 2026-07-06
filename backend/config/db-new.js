const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cresent_school',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelayMs: 0
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
    const [databases] = await connection.query(`SHOW DATABASES LIKE '${process.env.DB_NAME || 'cresent_school'}'`);
    
    if (databases.length === 0) {
      console.log('Creating database...');
      await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'cresent_school'}`);
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
