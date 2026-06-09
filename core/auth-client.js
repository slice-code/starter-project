(function (global) {
  'use strict';

  const API_BASE = () => (global.location ? global.location.origin : '');

  const CrmAuth = {
    _user: null,

    getUser() {
      return this._user;
    },

    async me() {
      const res = await fetch(`${API_BASE()}/api/auth/me`, {
        method: 'GET',
        credentials: 'include'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        this._user = null;
        const err = new Error(data.error || 'Not authenticated');
        err.status = res.status;
        throw err;
      }
      this._user = data.data;
      if (typeof CrmRbac !== 'undefined' && CrmRbac.setSession) {
        CrmRbac.setSession(data.data);
      }
      return data.data;
    },

    /**
     * POST /api/auth/login — server set HttpOnly cookie (crm_token).
     * @param {Function} [onSuccess] callback setelah cookie terset & user valid
     */
    async login(email, password, onSuccess) {
      const res = await fetch(`${API_BASE()}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Login gagal');
      }
      this._user = data.data;
      if (typeof CrmRbac !== 'undefined' && CrmRbac.setSession) {
        CrmRbac.setSession(data.data);
      }
      if (typeof onSuccess === 'function') {
        await onSuccess(data.data);
      }
      return data.data;
    },

    async logout() {
      try {
        await fetch(`${API_BASE()}/api/auth/logout`, {
          method: 'POST',
          credentials: 'include'
        });
      } catch { /* abaikan */ }
      this._user = null;
      localStorage.removeItem('token');
      if (typeof CrmRbac !== 'undefined' && CrmRbac.clearSession) {
        CrmRbac.clearSession();
      } else {
        localStorage.removeItem('crm_role');
      }
    }
  };

  global.CrmAuth = CrmAuth;
})(typeof window !== 'undefined' ? window : global);
