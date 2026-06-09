#!/usr/bin/env node
/**
 * Seed idempotent: cabang default HQ + owner admin (jika belum ada).
 * Jalankan: npm run seed:bootstrap
 */
'use strict';

require('../load-env').loadLocalEnv();
const database = require('../database');
const bcrypt = require('bcryptjs');
const appConfig = require('../app-config');

async function main() {
  console.log('[seed:bootstrap] Memulai...');
  await database.init();

  const tables = database.getTableNames();
  if (tables.includes('datacabang')) {
    const existing = await database.getByField('datacabang', 'kode_cabang', 'HQ');
    if (!existing) {
      await database.create('datacabang', {
        kode_cabang: 'HQ',
        nama_cabang: 'Kantor Pusat',
        kota: '—',
        provinsi: '—',
        alamat: 'Jl. Contoh No. 1',
        telepon: '',
        email: 'admin@localhost',
        urutan: 1,
        status: 'aktif'
      });
      console.log('[seed:bootstrap] Cabang HQ dibuat');
    }
  }

  if (tables.includes('users')) {
    const cfg = appConfig.getAppConfig();
    const email = cfg.adminEmail || 'demo@mail.com';
    const password = cfg.adminPassword || 'demo123';
    let user = await database.getByField('users', 'email', email);
    if (!user) {
      const hash = bcrypt.hashSync(password, 10);
      await database.create('users', {
        name: cfg.adminName || 'Administrator',
        email,
        role: 'admin',
        kode_cabang: null,
        phone: '',
        password: hash,
        status: 'active'
      });
      console.log(`[seed:bootstrap] Owner dibuat: ${email}`);
      console.log('[seed:bootstrap] Password dari ADMIN_PASSWORD env atau default admin123');
    } else {
      await database.update('users', user.id, { role: 'admin' });
      console.log(`[seed:bootstrap] Owner updated to admin: ${email}`);
    }
  }

  console.log('[seed:bootstrap] Selesai');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed:bootstrap] Gagal:', err.message);
  process.exit(1);
});
