/**
 * Quick script to view menu_role_mapping table contents
 */
const path = require('path');
require(path.join(__dirname, '../load-env.js'));
const database = require(path.join(__dirname, '../database'));

async function viewMenuRoleMapping() {
  try {
    console.log('=== MENU ROLE MAPPING TABLE CONTENTS ===\n');
    
    // Initialize database first
    await database.init();
    
    // Get all data
    const allData = await database.list('menu_role_mapping');
    
    // 1. Summary by role
    console.log('1. SUMMARY BY ROLE:');
    console.log('-'.repeat(80));
    
    const roleMap = {};
    allData.data.forEach(row => {
      if (!roleMap[row.role]) {
        roleMap[row.role] = {
          role: row.role,
          total: 0,
          create: 0,
          update: 0,
          delete: 0,
          active: 0
        };
      }
      roleMap[row.role].total++;
      if (row.can_create === 1) roleMap[row.role].create++;
      if (row.can_update === 1) roleMap[row.role].update++;
      if (row.can_delete === 1) roleMap[row.role].delete++;
      if (row.is_active === 1) roleMap[row.role].active++;
    });
    
    console.log('Role'.padEnd(20) + 'Total'.padStart(8) + 'Create'.padStart(8) + 'Update'.padStart(8) + 'Delete'.padStart(8) + 'Active'.padStart(8));
    console.log('-'.repeat(80));
    Object.values(roleMap).sort((a, b) => a.role.localeCompare(b.role)).forEach(row => {
      console.log(
        row.role.padEnd(20) + 
        String(row.total).padStart(8) + 
        String(row.create).padStart(8) + 
        String(row.update).padStart(8) + 
        String(row.delete).padStart(8) + 
        String(row.active).padStart(8)
      );
    });
    console.log();

    // 2. Detail for specific role (bagian_bio)
    console.log('2. DETAIL FOR bagian_bio:');
    console.log('-'.repeat(80));
    const bioData = allData.data.filter(r => r.role === 'bagian_bio').sort((a, b) => a.menu_path.localeCompare(b.menu_path));
    
    console.log('Path'.padEnd(35) + 'Name'.padEnd(30) + 'C'.padStart(3) + 'U'.padStart(3) + 'D'.padStart(3) + 'Active');
    console.log('-'.repeat(80));
    bioData.forEach(row => {
      console.log(
        row.menu_path.padEnd(35) + 
        (row.menu_name || '').padEnd(30) + 
        String(row.can_create).padStart(3) + 
        String(row.can_update).padStart(3) + 
        String(row.can_delete).padStart(3) + 
        String(row.is_active).padStart(3)
      );
    });
    console.log(`\nTotal: ${bioData.length} menus`);
    console.log();

    // 3. Check if /datanamapap exists for all roles
    console.log('3. /datanamapap PERMISSIONS FOR ALL ROLES:');
    console.log('-'.repeat(80));
    const papData = allData.data.filter(r => r.menu_path === '/datanamapap').sort((a, b) => a.role.localeCompare(b.role));
    
    if (papData.length === 0) {
      console.log('NO ENTRIES FOUND for /datanamapap');
    } else {
      console.log('Role'.padEnd(20) + 'Path'.padEnd(20) + 'Name'.padEnd(15) + 'C'.padStart(3) + 'U'.padStart(3) + 'D'.padStart(3) + 'Active');
      console.log('-'.repeat(80));
      papData.forEach(row => {
        console.log(
          row.role.padEnd(20) + 
          row.menu_path.padEnd(20) + 
          (row.menu_name || '').padEnd(15) + 
          String(row.can_create).padStart(3) + 
          String(row.can_update).padStart(3) + 
          String(row.can_delete).padStart(3) + 
          String(row.is_active).padStart(3)
        );
      });
    }
    console.log();

    // 4. Total entries in table
    console.log(`TOTAL ENTRIES IN TABLE: ${allData.data.length}`);

    console.log('\n=== DONE ===');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

viewMenuRoleMapping();
