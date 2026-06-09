#!/usr/bin/env node
/**
 * Quick check SQLite database directly
 */
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, '../data/data.db');

async function checkSQLite() {
  try {
    console.log('=== CHECKING SQLITE DATABASE ===\n');
    console.log(`Database path: ${DB_PATH}`);
    console.log(`File exists: ${fs.existsSync(DB_PATH)}`);
    
    if (!fs.existsSync(DB_PATH)) {
      console.log('❌ Database file not found!');
      process.exit(1);
    }

    const SQL = await initSqlJs();
    const fileBuffer = fs.readFileSync(DB_PATH);
    const db = new SQL.Database(fileBuffer);

    // Check menu_role_mapping
    console.log('\n1. menu_role_mapping table:');
    const roleCount = db.exec('SELECT role, COUNT(*) as count FROM menu_role_mapping GROUP BY role');
    if (roleCount.length > 0) {
      console.log('Role'.padEnd(20) + 'Count');
      console.log('-'.repeat(30));
      roleCount[0].values.forEach(([role, count]) => {
        console.log(role.padEnd(20) + count);
      });
    } else {
      console.log('   Empty table');
    }

    // Check bagian_bio detail
    console.log('\n2. bagian_bio menus:');
    const bioMenus = db.exec('SELECT menu_path, menu_name, can_create, can_update, can_delete FROM menu_role_mapping WHERE role = "bagian_bio" ORDER BY menu_path');
    if (bioMenus.length > 0) {
      console.log('Path'.padEnd(40) + 'Name'.padEnd(25) + 'C U D');
      console.log('-'.repeat(80));
      bioMenus[0].values.forEach(([menuPath, menuName, c, u, d]) => {
        console.log(menuPath.padEnd(40) + (menuName || '').padEnd(25) + `${c} ${u} ${d}`);
      });
      console.log(`\nTotal: ${bioMenus[0].values.length} menus`);
    } else {
      console.log('   No entries for bagian_bio');
    }

    // Check menu_mapping
    console.log('\n3. menu_mapping table:');
    const menuCount = db.exec('SELECT COUNT(*) FROM menu_mapping');
    if (menuCount.length > 0) {
      console.log(`   Total menus: ${menuCount[0].values[0][0]}`);
    }

    db.close();
    console.log('\n=== DONE ===');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkSQLite();
