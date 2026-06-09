/**
 * API permission matrix — Admin Starter template
 */
const BRANCH_RESTRICTED_ROLES = ['admin'];

const BRANCH_AWARE_TABLES = [];

const ROLES_CAN_CREATE_TKI = [];

const API_PERMISSIONS = {
  super_admin: {
    '*': ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  },
  studio_admin: {
    studio: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    schema: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    pages: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    menu: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    config: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    appjson: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    '*': ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  },
  admin: {
    categories: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    datacabang: ['GET'],
    '*': ['GET', 'POST', 'PUT', 'PATCH']
  },
  viewer: {
    '*': ['GET']
  }
};

const ROLE_LABELS = {
  super_admin: 'Owner',
  owner: 'Owner',
  admin: 'Administrator Cabang',
  studio_admin: 'Developer',
  viewer: 'Viewer'
};

function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'owner') return 'super_admin';
  return r;
}

function getRoleLabel(role) {
  const r = normalizeRole(role);
  return ROLE_LABELS[r] || r || '—';
}

function isOwnerRole(role) {
  return normalizeRole(role) === 'super_admin';
}

function isAdminCabangRole(role) {
  return normalizeRole(role) === 'admin';
}

function hasFullOperationalAccess(role) {
  const r = normalizeRole(role);
  return r === 'super_admin' || r === 'admin';
}

function checkApiPermission(user, resource, method) {
  if (!user || !user.role) return false;

  const role = normalizeRole(user.role);

  if (resource === 'users' && role !== 'super_admin') {
    return false;
  }

  if (resource === 'dashboard' || resource === 'reports') {
    return method === 'GET';
  }

  if (resource === 'menu_role_mapping') {
    if (method === 'GET') return true;
    return role === 'super_admin' && method === 'POST';
  }

  try {
    const menuConfigService = require('./menu-config-service');
    if (menuConfigService.isConfigAvailable()) {
      const fromMenuConfig = menuConfigService.checkApiMethodForRole(role, resource, method);
      if (fromMenuConfig !== null) return fromMenuConfig;
    }
  } catch (_) {
    /* fallback */
  }

  const permissions = API_PERMISSIONS[role];
  if (!permissions) return false;

  if (permissions[resource]) {
    return permissions[resource].includes(method);
  }

  if (permissions['*']) {
    return permissions['*'].includes(method);
  }

  return false;
}

function isBranchRestricted(role) {
  return BRANCH_RESTRICTED_ROLES.includes(normalizeRole(role));
}

function assertBranchRecordAccess(user, row) {
  if (!user || !row) return true;
  const role = normalizeRole(user.role);
  if (!isBranchRestricted(role)) return true;
  const userBranch = user.kode_cabang;
  if (!userBranch || !row.kode_cabang) return true;
  return row.kode_cabang === userBranch;
}

const DASHBOARD_ROLES = ['super_admin', 'admin', 'studio_admin', 'viewer'];

const DASHBOARD_VIEW_BY_ROLE = {
  super_admin: {
    title: 'Dashboard',
    subtitle: 'Ringkasan sistem admin.',
    sections: [],
    featuredKpis: [],
    secondaryKpis: [],
    charts: [],
    heroActions: [],
    quickLinks: []
  },
  admin: {
    title: 'Dashboard Cabang',
    subtitle: 'Ringkasan cabang Anda.',
    sections: [],
    featuredKpis: [],
    secondaryKpis: [],
    charts: [],
    heroActions: [],
    quickLinks: []
  },
  studio_admin: {
    title: 'Dashboard Developer',
    subtitle: 'Studio CRUD & schema manager.',
    sections: [],
    featuredKpis: [],
    secondaryKpis: [],
    charts: [],
    heroActions: [
      { label: 'CRUD Manager', icon: 'fas fa-hammer', path: '/studio/crud-manager', variant: 'primary' }
    ],
    quickLinks: []
  },
  viewer: {
    title: 'Dashboard',
    subtitle: 'Tampilan read-only.',
    sections: [],
    featuredKpis: [],
    secondaryKpis: [],
    charts: [],
    heroActions: [],
    quickLinks: []
  }
};

function getDashboardViewConfig(role, user = {}) {
  const r = normalizeRole(role || 'viewer');
  const preset = DASHBOARD_VIEW_BY_ROLE[r] || DASHBOARD_VIEW_BY_ROLE.viewer;
  const branch = user.kode_cabang ? String(user.kode_cabang).trim() : '';
  const scopeLabel = branch ? `Cabang ${branch}` : 'Semua cabang';
  let subtitle = preset.subtitle || '';
  if (branch && r !== 'super_admin') {
    subtitle = subtitle ? `${subtitle} (${scopeLabel})` : scopeLabel;
  }
  return {
    role: r,
    roleLabel: ROLE_LABELS[r] || r,
    scopeLabel,
    title: preset.title,
    subtitle,
    sections: [...(preset.sections || [])],
    featuredKpis: [...(preset.featuredKpis || [])],
    secondaryKpis: [...(preset.secondaryKpis || [])],
    charts: [...(preset.charts || [])],
    heroActions: [...(preset.heroActions || [])],
    quickLinks: [...(preset.quickLinks || [])]
  };
}

module.exports = {
  API_PERMISSIONS,
  BRANCH_RESTRICTED_ROLES,
  BRANCH_AWARE_TABLES,
  ROLES_CAN_CREATE_TKI,
  ROLE_LABELS,
  normalizeRole,
  getRoleLabel,
  isOwnerRole,
  isAdminCabangRole,
  hasFullOperationalAccess,
  DASHBOARD_ROLES,
  DASHBOARD_VIEW_BY_ROLE,
  getDashboardViewConfig,
  checkApiPermission,
  isBranchRestricted,
  assertBranchRecordAccess
};
