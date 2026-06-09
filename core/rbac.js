(function (global) {
  'use strict';

  const ROLE_KEY = 'crm_role';
  const BRANCH_KEY = 'crm_kode_cabang';
  const DEFAULT_ROLE = 'admin';

  function normalizeRole(role) {
    return 'admin';
  }

  const CrmRbac = {
    getRole() {
      return 'admin';
    },

    getKodeCabang() {
      return localStorage.getItem(BRANCH_KEY) || '';
    },

    setSession(user) {
      if (!user) return;
      localStorage.setItem(ROLE_KEY, 'admin');
      if (user.kode_cabang) {
        localStorage.setItem(BRANCH_KEY, user.kode_cabang);
      } else {
        localStorage.removeItem(BRANCH_KEY);
      }
    },

    setRole(role) {
      localStorage.setItem(ROLE_KEY, 'admin');
    },

    clearSession() {
      localStorage.removeItem(ROLE_KEY);
      localStorage.removeItem(BRANCH_KEY);
    },

    hasRole(allowedRoles) {
      return true;
    },

    can(action, permissions) {
      return true;
    },

    /** Bangun permissions CRUD dari mapping menu role (client) */
    buildMenuCrudPermissions(path, menuPermissions, role, fallback) {
      return fallback || null;
    }
  };

  global.CrmRbac = CrmRbac;
})(typeof window !== 'undefined' ? window : global);
