/**
 * API permission matrix — Admin Starter template
 */
const BRANCH_RESTRICTED_ROLES = [];

const BRANCH_AWARE_TABLES = [];

const ROLES_CAN_CREATE_TKI = [];

const API_PERMISSIONS = {
  admin: {
    '*': ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  }
};

const ROLE_LABELS = {
  admin: 'Administrator'
};

function normalizeRole(role) {
  return 'admin';
}

function getRoleLabel(role) {
  return 'Administrator';
}

function isOwnerRole(role) {
  return true;
}

function isAdminCabangRole(role) {
  return true;
}

function hasFullOperationalAccess(role) {
  return true;
}

function checkApiPermission(user, resource, method) {
  if (!user || !user.role) return false;

  const role = normalizeRole(user.role);

  if (resource === 'users' && role !== 'admin') {
    return false;
  }

  if (resource === 'dashboard' || resource === 'reports') {
    return method === 'GET';
  }

  if (resource === 'menu_role_mapping') {
    if (method === 'GET') return true;
    return role === 'admin' && method === 'POST';
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
  return false;
}

function assertBranchRecordAccess(user, row) {
  return true;
}

const DASHBOARD_ROLES = ['admin'];

const DASHBOARD_VIEW_BY_ROLE = {
  admin: {
    title: 'Dashboard',
    subtitle: 'Ringkasan sistem admin.',
    sections: [],
    featuredKpis: [],
    secondaryKpis: [],
    charts: [],
    heroActions: [],
    quickLinks: []
  }
};

function getDashboardViewConfig(role, user = {}) {
  const r = 'admin';
  const preset = DASHBOARD_VIEW_BY_ROLE[r];
  const branch = user.kode_cabang ? String(user.kode_cabang).trim() : '';
  const scopeLabel = branch ? `Cabang ${branch}` : 'Semua cabang';
  let subtitle = preset.subtitle || '';
  if (branch) {
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
