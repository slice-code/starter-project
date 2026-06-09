(function (global) {
  'use strict';

  const ROLE_KEY = 'crm_role';
  const BRANCH_KEY = 'crm_kode_cabang';
  const DEFAULT_ROLE = 'admin';

  function normalizeRole(role) {
    const r = String(role || '').trim().toLowerCase();
    if (r === 'owner') return 'super_admin';
    return r || DEFAULT_ROLE;
  }

  const CrmRbac = {
    getRole() {
      return normalizeRole(localStorage.getItem(ROLE_KEY));
    },

    getKodeCabang() {
      return localStorage.getItem(BRANCH_KEY) || '';
    },

    setSession(user) {
      if (!user) return;
      if (user.role) localStorage.setItem(ROLE_KEY, normalizeRole(user.role));
      if (user.kode_cabang) {
        localStorage.setItem(BRANCH_KEY, user.kode_cabang);
      } else {
        localStorage.removeItem(BRANCH_KEY);
      }
    },

    setRole(role) {
      if (role) localStorage.setItem(ROLE_KEY, normalizeRole(role));
    },

    clearSession() {
      localStorage.removeItem(ROLE_KEY);
      localStorage.removeItem(BRANCH_KEY);
    },

    hasRole(allowedRoles) {
      if (this.getRole() === 'super_admin') return true;
      if (!Array.isArray(allowedRoles) || !allowedRoles.length) return true;
      return allowedRoles.includes(this.getRole());
    },

    can(action, permissions) {
      if (this.getRole() === 'super_admin') return true;
      if (Array.isArray(permissions)) {
        return this.hasRole(permissions);
      }
      if (!permissions || !permissions[action]) return true;
      const allowed = permissions[action];
      if (!Array.isArray(allowed) || !allowed.length) return true;
      if (allowed.length === 1 && allowed[0] === '__none__') return false;
      return allowed.includes(this.getRole());
    },

    /** Bangun permissions CRUD dari mapping menu role (client) */
    buildMenuCrudPermissions(path, menuPermissions, role, fallback) {
      const r = normalizeRole(role || this.getRole());
      if (r === 'super_admin' || r === 'admin') return fallback || null;
      const flags = menuPermissions && menuPermissions[path];
      if (!flags) return fallback || null;
      const deny = ['__none__'];
      return {
        _explicit: true,
        create: flags.can_create ? [r] : deny,
        read: [r],
        update: flags.can_update ? [r] : deny,
        delete: flags.can_delete ? [r] : deny
      };
    }
  };

  global.CrmRbac = CrmRbac;
})(typeof window !== 'undefined' ? window : global);
