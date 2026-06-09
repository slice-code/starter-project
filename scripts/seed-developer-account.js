#!/usr/bin/env node
/**
 * Seed studio_admin developer account.
 * Run: npm run seed:developer
 */
'use strict';

require('../load-env').loadLocalEnv();
const db = require('../database');
const bcrypt = require('bcryptjs');

const DEVELOPER_EMAIL = 'developer@localhost';
const DEVELOPER_PASSWORD = 'dev123';
const DEVELOPER_ROLE = 'studio_admin';

async function main() {
  console.log('[seed:developer] Seeding developer account...\n');
  await db.init();

  const existing = await db.getByField('users', 'email', DEVELOPER_EMAIL);

  if (existing) {
    if (existing.role !== DEVELOPER_ROLE) {
      await db.update('users', existing.id, { role: DEVELOPER_ROLE, updated_at: new Date().toISOString() });
    }
    const hashedPassword = bcrypt.hashSync(DEVELOPER_PASSWORD, 10);
    await db.update('users', existing.id, { password: hashedPassword, updated_at: new Date().toISOString() });
    console.log(`[seed:developer] Updated: ${DEVELOPER_EMAIL}`);
  } else {
    const hashedPassword = bcrypt.hashSync(DEVELOPER_PASSWORD, 10);
    await db.create('users', {
      name: 'Developer',
      email: DEVELOPER_EMAIL,
      role: DEVELOPER_ROLE,
      kode_cabang: null,
      phone: '',
      password: hashedPassword,
      status: 'active'
    });
    console.log(`[seed:developer] Created: ${DEVELOPER_EMAIL}`);
  }

  console.log(`\n  Email:    ${DEVELOPER_EMAIL}`);
  console.log(`  Password: ${DEVELOPER_PASSWORD}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed:developer] Failed:', err.message);
  process.exit(1);
});
