/**
 * Menu & permission dari config/menu-config.json (dev: edit JSON, tanpa PostgreSQL).
 * Acuan: planning/alur.txt §12, config/menu-config.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const printSuratModules = {
  getSideMenuChildren: () => [],
  PROSES_KEBERANGKATAN_MENU_NAME: 'Proses Keberangkatan',
  PRINT_SURAT_MENU_NAME: 'Print Surat',
  getMenuPaths: () => [],
  getSideMenuGroup: () => ({ name: 'Print Surat', children: [] }),
  getResourceNames: () => []
};

const CONFIG_PATH = path.join(__dirname, 'config', 'menu-config.json');
const APPJSON_DIR = path.join(__dirname, 'appjson');

let resourcePathMapCache = null;

function buildResourcePathMap() {
  if (resourcePathMapCache) return resourcePathMapCache;
  resourcePathMapCache = {};
  if (!fs.existsSync(APPJSON_DIR)) return resourcePathMapCache;

  for (const file of fs.readdirSync(APPJSON_DIR)) {
    if (!file.endsWith('.json') || file === 'menu.json') continue;
    try {
      const content = JSON.parse(fs.readFileSync(path.join(APPJSON_DIR, file), 'utf8'));
      const pagePath = content.path;
      if (!pagePath) continue;
      const resource = content.config?.resource || file.replace(/\.json$/, '');
      const isReportPath = String(pagePath).startsWith('/report/');
      const existingPath = resourcePathMapCache[resource];
      const existingIsReportPath = String(existingPath || '').startsWith('/report/');
      if (!existingPath || (existingIsReportPath && !isReportPath)) {
        resourcePathMapCache[resource] = pagePath;
      }
    } catch (_) {
      /* skip invalid json */
    }
  }
  return resourcePathMapCache;
}

function getMenuPathForResource(resource) {
  const key = String(resource || '').trim();
  if (!key) return null;
  const map = buildResourcePathMap();
  if (map[key]) return map[key];
  return key.startsWith('/') ? key : `/${key.replace(/_/g, '-')}`;
}

function clearResourcePathMapCache() {
  resourcePathMapCache = null;
}

/** Daftarkan path CRUD baru ke menu-config.json (Studio deploy) */
function registerCrudMenuPath(options = {}) {
  const config = loadConfig();
  if (!config) throw new Error('config/menu-config.json tidak ditemukan');

  const pagePath = String(options.path || getMenuPathForResource(options.resource) || '').trim();
  if (!pagePath) throw new Error('path menu wajib');

  const title = String(options.title || options.resource || 'CRUD').trim();
  const icon = options.icon || 'fas fa-table';
  const groupName = String(options.groupName || 'Data').trim();
  const roles = (options.roles || []).filter(Boolean);

  if (!config.menuStructure) config.menuStructure = [];

  let group = config.menuStructure.find(
    (g) => g.type === 'group' && g.name === groupName
  );
  if (!group) {
    group = {
      name: groupName,
      icon: 'fas fa-folder',
      type: 'group',
      sortOrder: 50,
      children: []
    };
    config.menuStructure.push(group);
  }
  if (!group.children) group.children = [];

  const exists = group.children.find((c) => c.path === pagePath);
  if (!exists) {
    group.children.push({
      name: title,
      icon,
      path: pagePath,
      sortOrder: group.children.length + 1
    });
  } else {
    exists.name = title;
    exists.icon = icon;
  }

  const updatedRoles = [];
  for (const roleKey of roles) {
    if (!config.roles[roleKey]) {
      config.roles[roleKey] = {
        _description: roleKey,
        accessLevel: 'partial',
        menuPaths: ['/'],
        permissions: {
          default: { can_create: 1, can_update: 1, can_delete: 1 },
          exceptions: {}
        }
      };
    }
    const roleConfig = config.roles[roleKey];
    if (!roleConfig.menuPaths) roleConfig.menuPaths = ['/'];
    if (!roleConfig.menuPaths.includes(pagePath)) {
      roleConfig.menuPaths.push(pagePath);
    }
    updatedRoles.push(roleKey);
  }

  saveConfig(config);
  clearResourcePathMapCache();

  return {
    success: true,
    path: pagePath,
    group: groupName,
    roles: updatedRoles
  };
}

function isConfigAvailable() {
  return fs.existsSync(CONFIG_PATH);
}

function loadConfig() {
  if (!isConfigAvailable()) return null;
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function saveConfig(config) {
  config._lastUpdated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function getRoleConfig(config, role) {
  return config?.roles?.[role] || null;
}

function getPermissionForPath(roleConfig, menuPath, config) {
  const fallback = config.metadata?.defaultRolePermissions || {
    can_create: 0,
    can_update: 0,
    can_delete: 0
  };
  if (!roleConfig?.permissions) return fallback;
  if (roleConfig.permissions.exceptions?.[menuPath]) {
    return roleConfig.permissions.exceptions[menuPath];
  }
  return roleConfig.permissions.default || fallback;
}

function flagsToBool(flags) {
  return {
    can_create: !!flags.can_create,
    can_update: !!flags.can_update,
    can_delete: !!flags.can_delete
  };
}

/** Sidebar Print Surat — planning/biodata-surat/print-surat-overview.txt */
const PRINT_SURAT_SIDE_MENU_CHILDREN = printSuratModules.getSideMenuChildren().map((item) => ({
  name: item.name,
  icon: item.icon,
  path: item.path
}));

const PROSES_KEBERANGKATAN_MENU_NAME = printSuratModules.PROSES_KEBERANGKATAN_MENU_NAME;
const PRINT_SURAT_MENU_NAME = printSuratModules.PRINT_SURAT_MENU_NAME;

function getPrintSuratMenuPaths() {
  return printSuratModules.getMenuPaths();
}

function getPrintSuratSideMenuGroup() {
  return printSuratModules.getSideMenuGroup();
}

function expandPrintSuratMenuAccess(allowedPaths) {
  if (!allowedPaths || !allowedPaths.has('/printsurat')) return allowedPaths;
  const expanded = new Set([...allowedPaths, ...getPrintSuratMenuPaths()]);
  expanded.delete('/keadaantki');
  return expanded;
}

function roleHasPrintSuratAccess(roleConfig) {
  return (roleConfig?.menuPaths || []).includes('/printsurat');
}

/** Resource API print surat (tabel batch, CRUD per TKI, detail batch) */
function getPrintSuratResourceNames() {
  return printSuratModules.getResourceNames();
}

function isPrintSuratResource(resource) {
  const key = String(resource || '').trim();
  if (!key) return false;
  return getPrintSuratResourceNames().includes(key);
}

function resolvePrintSuratPermissionPath(roleConfig, resource, config) {
  if (!roleHasPrintSuratAccess(roleConfig)) return null;
  if (!isPrintSuratResource(resource)) return null;
  return '/printsurat';
}

/** Bersihkan Print Surat jika masih tersisa di dalam Proses Keberangkatan (versi lama) */
function stripPrintSuratFromKeberangkatan(sideMenu) {
  return (sideMenu || []).map((item) => {
    if (item.name !== PROSES_KEBERANGKATAN_MENU_NAME || !item.children?.length) return item;
    const children = item.children.filter((c) => c.name !== PRINT_SURAT_MENU_NAME);
    if (children.length === item.children.length) return item;
    return { ...item, children };
  });
}

function findPrintSuratInsertIndex(menu) {
  const pkIdx = menu.findIndex((item) => item.name === PROSES_KEBERANGKATAN_MENU_NAME);
  if (pkIdx !== -1) return pkIdx + 1;
  const refIdx = menu.findIndex((item) => item.name === 'Referensi');
  if (refIdx !== -1) return refIdx;
  const dtkiIdx = menu.findIndex((item) => item.name === 'Data TKI');
  if (dtkiIdx !== -1) return dtkiIdx + 1;
  return menu.length;
}

/** Sisipkan grup Print Surat sebagai menu terpisah tepat di bawah Proses Keberangkatan */
function ensurePrintSuratMenuGroup(sideMenu, allowedPaths) {
  let menu = stripPrintSuratFromKeberangkatan([...(sideMenu || [])]);
  menu = menu.filter((item) => item.name !== PRINT_SURAT_MENU_NAME);

  const printGroup = getPrintSuratSideMenuGroup();
  if (allowedPaths) {
    printGroup.children = printGroup.children.filter((c) => allowedPaths.has(c.page));
    if (!printGroup.children.length) return menu;
  }

  menu.splice(findPrintSuratInsertIndex(menu), 0, printGroup);
  return menu;
}

/** @deprecated — gunakan ensurePrintSuratMenuGroup */
function ensurePrintSuratUnderKeberangkatan(sideMenu, allowedPaths) {
  return ensurePrintSuratMenuGroup(sideMenu, allowedPaths);
}

function mapMenuNodeForRole(node, allowed) {
  if (node.children?.length) {
    const children = node.children
      .map((child) => mapMenuNodeForRole(child, allowed))
      .filter(Boolean);
    if (!children.length) return null;
    if ((node.path || node.page) === '/data-tki' && children.length === 1) return children[0];
    return {
      name: node.name,
      icon: node.icon || 'fas fa-folder',
      children
    };
  }
  const menuPath = node.path || node.page;
  if (!menuPath || !allowed.has(menuPath)) return null;
  return {
    name: node.name,
    icon: node.icon || 'fas fa-circle',
    page: menuPath,
    roles: node.roles
  };
}

/** Sidebar operasional untuk role (bagian_bio, marketing, …) */
function getSideMenuForRole(role) {
  const config = loadConfig();
  if (!config) return null;

  const roleConfig = getRoleConfig(config, role);
  if (!roleConfig || roleConfig.canAccessAllMenus) return null;

  const allowed = new Set(roleConfig.menuPaths || []);
  const out = [];

  const sortedStructure = [...(config.menuStructure || [])].sort(
    (a, b) => (Number(a.sortOrder) || 999) - (Number(b.sortOrder) || 999)
  );
  for (const item of sortedStructure) {
    const mapped = mapMenuNodeForRole(item, allowed);
    if (mapped) out.push(mapped);
  }
  const hasPrintAccess =
    allowed.has('/printsurat') ||
    getPrintSuratMenuPaths().some((p) => allowed.has(p));
  if (hasPrintAccess) {
    return ensurePrintSuratMenuGroup(out, expandPrintSuratMenuAccess(allowed));
  }
  return out.length ? out : null;
}

/** CRUD flags per path untuk CrudEngine */
function getMenuPermissionsForRole(role) {
  const config = loadConfig();
  if (!config) return null;

  const roleConfig = getRoleConfig(config, role);
  if (!roleConfig || roleConfig.canAccessAllMenus) return null;

  const perms = {};
  const printFlags = roleHasPrintSuratAccess(roleConfig)
    ? flagsToBool(getPermissionForPath(roleConfig, '/printsurat', config))
    : null;

  for (const menuPath of roleConfig.menuPaths || []) {
    perms[menuPath] = flagsToBool(getPermissionForPath(roleConfig, menuPath, config));
  }

  if (printFlags) {
    const expanded = expandPrintSuratMenuAccess(new Set(roleConfig.menuPaths || []));
    expanded.forEach((menuPath) => {
      if (menuPath.startsWith('/print')) {
        perms[menuPath] = printFlags;
      }
    });
  }

  return Object.keys(perms).length ? perms : null;
}

/** Daftar master untuk Pengaturan Menu (Owner) */
function getMasterSideMenu() {
  const config = loadConfig();
  if (!config) return null;

  const mapMasterNode = (node) => {
    if (node.children?.length) {
      return {
        name: node.name,
        icon: node.icon || 'fas fa-folder',
        children: node.children.map(mapMasterNode)
      };
    }
    return {
      name: node.name,
      icon: node.icon || 'fas fa-circle',
      page: node.path,
      roles: node.roles,
      ownerOnly: node.ownerOnly
    };
  };

  return ensurePrintSuratMenuGroup((config.menuStructure || []).map(mapMasterNode));
}

/** Simpan mapping role dari UI Pengaturan Menu → tulis ke JSON */
function saveRoleFromEntries(role, entries) {
  const config = loadConfig();
  if (!config) {
    throw new Error('config/menu-config.json tidak ditemukan');
  }

  const roleKey = String(role || '').trim();
  if (!roleKey) throw new Error('role wajib diisi');

  if (!config.roles[roleKey]) {
    config.roles[roleKey] = {
      _description: roleKey,
      accessLevel: 'partial',
      menuPaths: [],
      permissions: {
        default: { can_create: 0, can_update: 0, can_delete: 0 },
        exceptions: {}
      }
    };
  }

  const roleConfig = config.roles[roleKey];
  const defaultPerm = roleConfig.permissions?.default ||
    config.metadata?.defaultRolePermissions || {
      can_create: 0,
      can_update: 0,
      can_delete: 0
    };

  const menuPaths = [];
  const exceptions = {};

  for (const ent of entries || []) {
    const p = String(ent.menu_path || ent.path || '').trim();
    if (!p) continue;
    menuPaths.push(p);

    const flags = {
      can_create: ent.can_create ? 1 : 0,
      can_update: ent.can_update ? 1 : 0,
      can_delete: ent.can_delete ? 1 : 0
    };
    const differs =
      flags.can_create !== (defaultPerm.can_create ? 1 : 0) ||
      flags.can_update !== (defaultPerm.can_update ? 1 : 0) ||
      flags.can_delete !== (defaultPerm.can_delete ? 1 : 0);
    if (differs) exceptions[p] = flags;
  }

  roleConfig.menuPaths = menuPaths;
  if (!roleConfig.permissions) roleConfig.permissions = {};
  roleConfig.permissions.default = defaultPerm;
  roleConfig.permissions.exceptions = exceptions;

  saveConfig(config);
  return { role: roleKey, count: menuPaths.length };
}

/** Payload untuk halaman Pengaturan Menu (read-only) */
function getRoleViewPayload(role) {
  const config = loadConfig();
  if (!config) return null;

  const roleConfig = getRoleConfig(config, role);
  if (!roleConfig) {
    return {
      menuPermissions: {},
      sideMenu: null,
      readOnly: true,
      source: 'config/menu-config.json',
      note: `Role "${role}" belum didefinisikan di menu-config.json`
    };
  }

  if (roleConfig.canAccessAllMenus) {
    return {
      menuPermissions: {},
      sideMenu: null,
      readOnly: true,
      fullAccess: true,
      source: 'config/menu-config.json',
      description: roleConfig._description || role,
      note:
        'Role ini memakai menu.json penuh saat login. Tidak ada daftar menuPaths terbatas di JSON.'
    };
  }

  return {
    menuPermissions: getMenuPermissionsForRole(role) || {},
    sideMenu: getSideMenuForRole(role),
    readOnly: true,
    source: 'config/menu-config.json',
    description: roleConfig._description || role,
    menuPathCount: (roleConfig.menuPaths || []).length
  };
}

/**
 * Cek izin API CRUD dari menu-config.json (null = tidak ada aturan, pakai fallback)
 */
function checkApiMethodForRole(role, resource, method) {
  const config = loadConfig();
  if (!config) return null;

  const roleConfig = getRoleConfig(config, role);
  if (!roleConfig || roleConfig.canAccessAllMenus) return null;

  const menuPaths = roleConfig.menuPaths || [];
  let menuPath = getMenuPathForResource(resource);
  const printPermPath = resolvePrintSuratPermissionPath(roleConfig, resource, config);
  if (printPermPath) {
    menuPath = printPermPath;
  } else if (!menuPath || !menuPaths.includes(menuPath)) {
    return null;
  }

  const flags = flagsToBool(getPermissionForPath(roleConfig, menuPath, config));
  const httpMethod = String(method || '').toUpperCase();

  if (httpMethod === 'GET' || httpMethod === 'HEAD') return true;
  if (httpMethod === 'POST') return flags.can_create;
  if (httpMethod === 'PUT' || httpMethod === 'PATCH') return flags.can_update;
  if (httpMethod === 'DELETE') return flags.can_delete;
  return null;
}

module.exports = {
  CONFIG_PATH,
  isConfigAvailable,
  loadConfig,
  saveConfig,
  getSideMenuForRole,
  getMenuPermissionsForRole,
  getMasterSideMenu,
  getRoleViewPayload,
  getMenuPathForResource,
  clearResourcePathMapCache,
  registerCrudMenuPath,
  checkApiMethodForRole,
  saveRoleFromEntries,
  PRINT_SURAT_SIDE_MENU_CHILDREN,
  getPrintSuratMenuPaths,
  getPrintSuratSideMenuGroup,
  ensurePrintSuratMenuGroup,
  ensurePrintSuratUnderKeberangkatan,
  expandPrintSuratMenuAccess,
  roleHasPrintSuratAccess,
  getPrintSuratResourceNames,
  isPrintSuratResource
};
