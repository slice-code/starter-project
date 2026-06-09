/**
 * Read all menu and role mapping tables to understand current structure
 */
const path = require('path');
require(path.join(__dirname, '../load-env.js'));
const database = require(path.join(__dirname, '../database'));

async function readMenuTables() {
  try {
    await database.init();
    
    console.log('=== CURRENT MENU & ROLE MAPPING STRUCTURE ===\n');
    
    // 1. Read menu_mapping table
    console.log('1. MENU_MAPPING TABLE (Menu Definitions):');
    console.log('='.repeat(100));
    const menuMapping = await database.list('menu_mapping');
    console.log(`Total menus: ${menuMapping.data.length}\n`);
    
    if (menuMapping.data.length > 0) {
      // Group by parent
      const parentMap = {};
      menuMapping.data.forEach(menu => {
        const parent = menu.parent_path || '(root)';
        if (!parentMap[parent]) parentMap[parent] = [];
        parentMap[parent].push(menu);
      });
      
      Object.keys(parentMap).sort().forEach(parent => {
        console.log(`\nParent: ${parent}`);
        console.log('-'.repeat(100));
        console.log('Path'.padEnd(40) + 'Name'.padEnd(30) + 'Icon'.padEnd(25) + 'Sort');
        console.log('-'.repeat(100));
        parentMap[parent].forEach(menu => {
          console.log(
            (menu.menu_path || '').padEnd(40) + 
            (menu.menu_name || '').padEnd(30) + 
            (menu.icon || '').padEnd(25) + 
            String(menu.sort_order || 0)
          );
        });
      });
    } else {
      console.log('Table is empty or not used. Menu structure is defined in appjson/menu.json');
    }
    
    console.log('\n\n');
    
    // 2. Read menu_role_mapping table
    console.log('2. MENU_ROLE_MAPPING TABLE (Role Permissions):');
    console.log('='.repeat(100));
    const roleMapping = await database.list('menu_role_mapping');
    console.log(`Total entries: ${roleMapping.data.length}\n`);
    
    // Summary by role
    const roleSummary = {};
    roleMapping.data.forEach(entry => {
      if (!roleSummary[entry.role]) {
        roleSummary[entry.role] = {
          total: 0,
          can_create: 0,
          can_update: 0,
          can_delete: 0,
          menus: []
        };
      }
      roleSummary[entry.role].total++;
      if (entry.can_create === 1) roleSummary[entry.role].can_create++;
      if (entry.can_update === 1) roleSummary[entry.role].can_update++;
      if (entry.can_delete === 1) roleSummary[entry.role].can_delete++;
      roleSummary[entry.role].menus.push(entry.menu_path);
    });
    
    console.log('ROLE SUMMARY:');
    console.log('-'.repeat(100));
    console.log('Role'.padEnd(20) + 'Total'.padStart(8) + 'Create'.padStart(8) + 'Update'.padStart(8) + 'Delete'.padStart(8));
    console.log('-'.repeat(100));
    Object.keys(roleSummary).sort().forEach(role => {
      const summary = roleSummary[role];
      console.log(
        role.padEnd(20) + 
        String(summary.total).padStart(8) + 
        String(summary.can_create).padStart(8) + 
        String(summary.can_update).padStart(8) + 
        String(summary.can_delete).padStart(8)
      );
    });
    
    console.log('\n\n');
    
    // 3. Detailed menu list for each role
    console.log('3. DETAILED MENU LIST PER ROLE:');
    console.log('='.repeat(100));
    
    Object.keys(roleSummary).sort().forEach(role => {
      console.log(`\n${role.toUpperCase()} (${roleSummary[role].total} menus):`);
      console.log('-'.repeat(100));
      console.log('Path'.padEnd(40) + 'Name'.padEnd(30) + 'C'.padStart(3) + 'U'.padStart(3) + 'D'.padStart(3) + 'Active');
      console.log('-'.repeat(100));
      
      const roleMenus = roleMapping.data
        .filter(e => e.role === role)
        .sort((a, b) => a.menu_path.localeCompare(b.menu_path));
      
      roleMenus.forEach(entry => {
        console.log(
          entry.menu_path.padEnd(40) + 
          (entry.menu_name || '').padEnd(30) + 
          String(entry.can_create).padStart(3) + 
          String(entry.can_update).padStart(3) + 
          String(entry.can_delete).padStart(3) + 
          String(entry.is_active).padStart(3)
        );
      });
    });
    
    console.log('\n\n=== ANALYSIS COMPLETE ===');
    console.log('\nKey Findings:');
    console.log(`- Total menu definitions: ${menuMapping.data.length}`);
    console.log(`- Total role-menu mappings: ${roleMapping.data.length}`);
    console.log(`- Total roles: ${Object.keys(roleSummary).length}`);
    console.log(`- Roles: ${Object.keys(roleSummary).sort().join(', ')}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

readMenuTables();
