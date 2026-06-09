#!/usr/bin/env node
/**
 * Master Menu & Permission Sync Script
 * 
 * Reads config/menu-config.json and optionally syncs to PostgreSQL (legacy):
 * - menu_mapping table (menu structure)
 * - menu_role_mapping table (role permissions)
 *
 * Runtime pjtki-bio membaca JSON langsung (menu-config-service.js).
 * Sync DB hanya jika perlu mirror production / backup.
 * 
 * Usage:
 *   node scripts/sync-menu-config.js              # Full sync (all roles)
 *   node scripts/sync-menu-config.js --role=bagian_bio  # Specific role
 *   node scripts/sync-menu-config.js --dry-run    # Preview only
 *   node scripts/sync-menu-config.js --menu-only  # Sync menu structure only
 *   node scripts/sync-menu-config.js --perm-only  # Sync permissions only
 */
'use strict';

const path = require('path');
require(path.join(__dirname, '../load-env.js'));
const fs = require('fs');
const database = require(path.join(__dirname, '../database'));

// Parse CLI arguments
const args = process.argv.slice(2);
const SPECIFIC_ROLE = args.find(a => a.startsWith('--role='))?.split('=')[1];
const DRY_RUN = args.includes('--dry-run');
const MENU_ONLY = args.includes('--menu-only');
const PERM_ONLY = args.includes('--perm-only');

const CONFIG_PATH = path.join(__dirname, '../config/menu-config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`❌ Config file not found: ${CONFIG_PATH}`);
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  console.log(`📋 Loaded menu config v${config._version} (${config._lastUpdated})`);
  return config;
}

function flattenMenus(menuItems, parentPath = null, result = []) {
  menuItems.forEach(menu => {
    result.push({
      menu_path: menu.path,
      menu_name: menu.name,
      icon: menu.icon || '',
      parent_path: parentPath,
      sort_order: menu.sortOrder || 0,
      type: menu.type || 'single',
      owner_only: menu.ownerOnly ? 1 : 0
    });

    if (menu.children && menu.children.length > 0) {
      flattenMenus(menu.children, menu.path, result);
    }
  });
  return result;
}

async function syncMenuStructure(config) {
  console.log('\n' + '═'.repeat(70));
  console.log('  SYNC MENU STRUCTURE');
  console.log('═'.repeat(70));

  const flatMenus = flattenMenus(config.menuStructure);
  console.log(`📊 Total menu items: ${flatMenus.length}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would sync these menus:');
    flatMenus.forEach(menu => {
      const parent = menu.parent_path ? ` (child of ${menu.parent_path})` : ' (root)';
      console.log(`  ✓ ${menu.menu_path} - ${menu.menu_name}${parent}`);
    });
    return;
  }

  // Clear existing menu_mapping
  console.log('\n🗑️  Clearing menu_mapping table...');
  const existingMenus = await database.list('menu_mapping');
  if (existingMenus.data.length > 0) {
    for (const menu of existingMenus.data) {
      await database.remove('menu_mapping', menu.id);
    }
    console.log(`   Removed ${existingMenus.data.length} existing menus`);
  }

  // Insert new menus
  console.log('\n📝 Inserting new menus...');
  let inserted = 0;
  for (const menu of flatMenus) {
    try {
      await database.create('menu_mapping', {
        menu_path: menu.menu_path,
        menu_name: menu.menu_name,
        icon: menu.icon,
        parent_path: menu.parent_path,
        sort_order: menu.sort_order,
        type: menu.type,
        owner_only: menu.owner_only
      });
      inserted++;
      const indent = menu.parent_path ? '  ' : '';
      console.log(`   ✓ ${indent}${menu.menu_name} (${menu.menu_path})`);
    } catch (error) {
      console.error(`   ✗ Failed to insert ${menu.menu_path}: ${error.message}`);
    }
  }

  console.log(`\n✅ Menu structure synced: ${inserted}/${flatMenus.length} menus inserted`);
}

async function syncRolePermissions(config) {
  console.log('\n' + '═'.repeat(70));
  console.log('  SYNC ROLE PERMISSIONS');
  console.log('═'.repeat(70));

  const rolesToSync = SPECIFIC_ROLE ? [SPECIFIC_ROLE] : Object.keys(config.roles);
  console.log(`👥 Roles to sync: ${rolesToSync.join(', ')}`);

  let totalEntries = 0;

  for (const role of rolesToSync) {
    const roleConfig = config.roles[role];
    if (!roleConfig) {
      console.warn(`⚠️  Role config not found: ${role}`);
      continue;
    }

    // Skip admin (full access, no explicit mapping needed)
    if (roleConfig.canAccessAllMenus) {
      console.log(`\n👑 ${role} (Super Admin - full access, skipping explicit mapping)`);
      continue;
    }

    console.log(`\n🔧 Syncing role: ${role} (${roleConfig._description})`);
    console.log(`   Menu paths: ${roleConfig.menuPaths.length}`);

    if (DRY_RUN) {
      console.log('   [DRY RUN] Would sync these permissions:');
      roleConfig.menuPaths.forEach(menuPath => {
        const perm = getPermission(role, menuPath, config);
        console.log(`     ✓ ${menuPath} -> C:${perm.can_create} U:${perm.can_update} D:${perm.can_delete}`);
      });
      totalEntries += roleConfig.menuPaths.length;
      continue;
    }

    // Clear existing mappings for this role
    console.log(`   🗑️  Clearing existing mappings for ${role}...`);
    const existingMappings = await database.list('menu_role_mapping');
    const roleMappings = existingMappings.data.filter(m => m.role === role);
    for (const mapping of roleMappings) {
      await database.remove('menu_role_mapping', mapping.id);
    }
    console.log(`      Removed ${roleMappings.length} entries`);

    // Insert new mappings
    let inserted = 0;
    for (const menuPath of roleConfig.menuPaths) {
      const perm = getPermission(role, menuPath, config);
      
      // Find menu name from config
      const menuInfo = findMenuInfo(menuPath, config);

      try {
        await database.create('menu_role_mapping', {
          role: role,
          menu_path: menuPath,
          menu_name: menuInfo.name,
          parent_path: menuInfo.parent,
          is_active: 1,
          can_create: perm.can_create,
          can_update: perm.can_update,
          can_delete: perm.can_delete
        });
        inserted++;
        console.log(`      ✓ ${menuInfo.name} (${menuPath}) -> C:${perm.can_create} U:${perm.can_update} D:${perm.can_delete}`);
      } catch (error) {
        console.error(`      ✗ Failed to insert ${menuPath}: ${error.message}`);
      }
    }

    totalEntries += inserted;
    console.log(`   ✅ ${role}: ${inserted}/${roleConfig.menuPaths.length} permissions synced`);
  }

  console.log(`\n✅ Role permissions synced: ${totalEntries} total entries`);
}

function getPermission(role, menuPath, config) {
  const roleConfig = config.roles[role];
  if (!roleConfig) return config.metadata.defaultRolePermissions;

  // Check exceptions first
  if (roleConfig.permissions.exceptions && roleConfig.permissions.exceptions[menuPath]) {
    return roleConfig.permissions.exceptions[menuPath];
  }

  // Return default
  return roleConfig.permissions.default || config.metadata.defaultRolePermissions;
}

function findMenuInfo(menuPath, config) {
  function searchMenus(menus, parent = null) {
    for (const menu of menus) {
      if (menu.path === menuPath) {
        return { name: menu.name, parent: parent };
      }
      if (menu.children) {
        const found = searchMenus(menu.children, menu.path);
        if (found) return found;
      }
    }
    return { name: menuPath, parent: null };
  }
  return searchMenus(config.menuStructure);
}

async function main() {
  try {
    console.log('╔' + '═'.repeat(68) + '╗');
    console.log('║' + '  MASTER MENU & PERMISSION SYNC'.padEnd(68) + '║');
    console.log('╚' + '═'.repeat(68) + '╝');
    console.log(`   Config: ${CONFIG_PATH}`);
    console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (changes will be made)'}`);
    if (SPECIFIC_ROLE) console.log(`   Role: ${SPECIFIC_ROLE}`);
    if (MENU_ONLY) console.log(`   Scope: Menu structure only`);
    if (PERM_ONLY) console.log(`   Scope: Permissions only`);
    console.log('─'.repeat(70));

    // Initialize database
    await database.init();

    // Load config
    const config = loadConfig();

    // Sync menu structure (unless perm-only)
    if (!PERM_ONLY) {
      await syncMenuStructure(config);
    }

    // Sync role permissions (unless menu-only)
    if (!MENU_ONLY) {
      await syncRolePermissions(config);
    }

    console.log('\n' + '═'.repeat(70));
    console.log('  SUMMARY');
    console.log('═'.repeat(70));
    console.log(`   Total menu items: ${flattenMenus(config.menuStructure).length}`);
    console.log(`   Total roles: ${Object.keys(config.roles).length}`);
    console.log(`   Roles: ${Object.keys(config.roles).join(', ')}`);
    
    if (DRY_RUN) {
      console.log('\n⚠️  This was a DRY RUN. No changes were made.');
      console.log('   Remove --dry-run flag to apply changes.');
    } else {
      console.log('\n✅ Sync complete!');
    }
    console.log('═'.repeat(70) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
