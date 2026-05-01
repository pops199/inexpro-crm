#!/usr/bin/env node
/**
 * Initial seed — creates default admin user.
 * Run with: npm run seed
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const bcrypt = require('bcryptjs');
const { initDb } = require('./database');

async function seed() {
  const db = initDb();

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (existing) {
    console.log('Admin user already exists. Skipping seed.');
    return;
  }

  const passwordHash = await bcrypt.hash('admin123', 12);

  db.prepare(`
    INSERT INTO users (username, email, password_hash, full_name, role)
    VALUES (?, ?, ?, ?, ?)
  `).run('admin', 'admin@inexpro.co.za', passwordHash, 'System Administrator', 'admin');

  console.log('✅ Default admin created.');
  console.log('   Username: admin');
  console.log('   Password: admin123');
  console.log('   ⚠️  Change this password immediately after first login.');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
