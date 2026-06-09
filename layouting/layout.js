(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
      (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.layout = factory());
})(this, (function () {
  'use strict';
  const layout = {};

  // define app
  let app = document.getElementById('app') || null;

  if(!app)
    throw new Error('App element not found');

  if(typeof el === 'undefined')
    throw new Error('el.js not load please load lib https://unpkg.com/@slice-code/el.js@1.0.6/el.js');

  // Routing state
  const pages = {};
  let currentPage = null;
  let sideMenus = [];
  let navbarMenus = [];
  let currentTheme = 'default';
  let navbarTitleText = 'Core App'; // Default navbar title
  let openDropdowns = new Set(); // Track which dropdowns are open
  let currentRole = null; // RBAC: current user role
  const middlewares = []; // Middleware stack

  /** super_admin = Owner; legacy string "owner" dinormalisasi ke super_admin */
  function effectiveRoleForRbac() {
    const r = String(currentRole || '').trim().toLowerCase();
    if (r === 'owner') return 'super_admin';
    return r;
  }

  /** Menu khusus Owner — tidak ditampilkan ke role operasional */
  const OWNER_ONLY_MENU_PATHS = new Set(['/users', '/datacabang', '/profil-perusahaan']);
  const DEV_MENU_PATHS = new Set(['/menu-role-manager']);

  function isOwnerOnlyMenuPath(page) {
    return !!page && OWNER_ONLY_MENU_PATHS.has(page);
  }

  function filterSideMenuByRole(item, rbacRole) {
    if (item.page && DEV_MENU_PATHS.has(item.page)) {
      return rbacRole === 'super_admin' || rbacRole === 'studio_admin';
    }
    if (isOwnerOnlyMenuPath(item.page) && rbacRole !== 'super_admin') return false;
    if (rbacRole === 'super_admin') return true;
    if (!item.roles || !item.roles.length) return true;
    if (!rbacRole) return true;
    return item.roles.includes(rbacRole);
  }

  // Notification / confirm state
  let toastContainer = null;
  let dialogContainer = null;
  const toastTimers = new Map();
  let currentConfirmOptions = null;
  let currentModalOptions = null;
  let notificationItems = [];
  let notificationPanelOpen = false;
  let notificationPollTimer = null;
  const NOTIF_READ_STORAGE_KEY = 'pjtki-notif-read';
  const NOTIF_PANEL_PREVIEW_LIMIT = 15;
  const NOTIF_HISTORY_LIMIT = 30;

  // Loader full-screen saat bootstrap sesi login (sidebar belum ditampilkan)
  let authBootstrapActive = false;
  let authBootstrapUntilPageReady = false;
  let authBootstrapOverlayEl = null;
  let authBootstrapTextEl = null;

  // Desktop hide sidebar state
  let desktopHideMode = false;
  let desktopHoverOpen = false;
  let sidebarTriggerArea = null;
  let sidebarHoverActive = false;
  let sidebarHoverTimeout = null;
  const desktopHideModeStorageKey = 'layoutDesktopHideMode';

  function saveDesktopHideMode() {
    try {
      window.localStorage.setItem(desktopHideModeStorageKey, desktopHideMode ? '1' : '0');
    } catch (error) {
      console.warn('Unable to save desktop hide mode:', error);
    }
  }

  function loadDesktopHideMode() {
    try {
      const stored = window.localStorage.getItem(desktopHideModeStorageKey);
      if (stored !== null) {
        desktopHideMode = stored === '1';
      }
    } catch (error) {
      console.warn('Unable to load desktop hide mode:', error);
    }
  }

  // Theme configurations
  const themes = {
    default: {
      navbar: {
        backgroundColor: 'rgb(15, 23, 42)',
        color: '#fff',
      },
      sidebar: {
        backgroundColor: 'rgb(15, 23, 42)',
        color: '#fff',
      },
    },
    blue: {
      navbar: {
        backgroundColor: 'rgb(30, 64, 175)',
        color: '#fff',
      },
      sidebar: {
        backgroundColor: 'rgb(30, 64, 175)',
        color: '#fff',
      },
    },
    dark: {
      navbar: {
        backgroundColor: '#000',
        color: '#fff',
      },
      sidebar: {
        backgroundColor: '#111',
        color: '#fff',
      },
    },
    light: {
      navbar: {
        backgroundColor: '#fff',
        color: '#333',
      },
      sidebar: {
        backgroundColor: '#f5f5f5',
        color: '#333',
      },
    },
    purple: {
      navbar: {
        backgroundColor: 'rgb(88, 28, 135)',
        color: '#fff',
      },
      sidebar: {
        backgroundColor: 'rgb(88, 28, 135)',
        color: '#fff',
      },
    },
    green: {
      navbar: {
        backgroundColor: 'rgb(22, 101, 52)',
        color: '#fff',
      },
      sidebar: {
        backgroundColor: 'rgb(22, 101, 52)',
        color: '#fff',
      },
    },
    red: {
      navbar: {
        backgroundColor: 'rgb(153, 27, 27)',
        color: '#fff',
      },
      sidebar: {
        backgroundColor: 'rgb(153, 27, 27)',
        color: '#fff',
      },
    },
    orange: {
      navbar: {
        backgroundColor: 'rgb(194, 65, 12)',
        color: '#fff',
      },
      sidebar: {
        backgroundColor: 'rgb(194, 65, 12)',
        color: '#fff',
      },
    },
    teal: {
      navbar: {
        backgroundColor: '#2f3d58',
        color: '#fff',
      },
      sidebar: {
        backgroundColor: '#2f3d58',
        color: '#fff',
      },
    },
    pink: {
      navbar: {
        backgroundColor: 'rgb(157, 23, 77)',
        color: '#fff',
      },
      sidebar: {
        backgroundColor: 'rgb(157, 23, 77)',
        color: '#fff',
      },
    },
    gray: {
      navbar: {
        backgroundColor: 'rgb(55, 65, 81)',
        color: '#fff',
      },
      sidebar: {
        backgroundColor: 'rgb(75, 85, 99)',
        color: '#fff',
      },
    },
  };

  function isColorLight(color) {
    const rgb = color.replace(/\s/g, '').match(/^rgba?\((\d+),(\d+),(\d+)/);
    if (rgb) {
      const r = parseInt(rgb[1], 10);
      const g = parseInt(rgb[2], 10);
      const b = parseInt(rgb[3], 10);
      return (r * 0.299 + g * 0.587 + b * 0.114) > 186;
    }

    const hexMatch = color.replace('#', '').match(/^([0-9a-fA-F]{6})$/);
    if (hexMatch) {
      const hex = hexMatch[1];
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return (r * 0.299 + g * 0.587 + b * 0.114) > 186;
    }

    return false;
  }

  function getSidebarAccentColor() {
    const accents = {
      teal: '#41c38c',
      blue: '#93c5fd',
      green: '#86efac',
      purple: '#d8b4fe',
      orange: '#fdba74',
      red: '#fca5a5',
      pink: '#f9a8d4',
      default: '#94a3b8',
      dark: '#cbd5e1',
      gray: '#e2e8f0',
      light: '#0d9488'
    };
    return accents[currentTheme] || accents.default;
  }

  function syncSidebarAccentVar() {
    try {
      document.documentElement.style.setProperty('--sidebar-accent', getSidebarAccentColor());
    } catch (error) {
      /* ignore */
    }
  }

  // CSS sidebar — navigasi profesional (teal / dark themes)
  const sidebarDropdownCSS = `
    .layout-sidebar {
      display: flex;
      flex-direction: column;
      gap: 0;
    }
    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.1rem 0.35rem 0.8rem;
      margin-bottom: 0.55rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .sidebar-brand-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--sidebar-accent, #41c38c);
      font-size: 15px;
      flex-shrink: 0;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    }
    .sidebar-brand-text {
      min-width: 0;
      flex: 1;
    }
    .sidebar-brand-title {
      display: block;
      font-size: 0.875rem;
      font-weight: 700;
      color: #fff;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sidebar-brand-sub {
      display: block;
      font-size: 0.65rem;
      color: rgba(255, 255, 255, 0.52);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .sidebar-search-btn {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.48rem 0.65rem;
      margin-bottom: 0.65rem;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(0, 0, 0, 0.12);
      color: rgba(255, 255, 255, 0.88);
      cursor: pointer;
      font-size: 0.8125rem;
      text-align: left;
      box-sizing: border-box;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .sidebar-search-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.2);
    }
    .sidebar-search-kbd {
      font-size: 10px;
      opacity: 0.55;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      letter-spacing: 0.02em;
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(0, 0, 0, 0.15);
    }
    .sidebar-nav {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding-right: 2px;
    }
    .sidebar-nav-label {
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.38);
      padding: 0.35rem 0.5rem 0.25rem;
      margin-top: 0.15rem;
    }
    .sidebar-item {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.48rem 0.6rem;
      color: rgba(255, 255, 255, 0.86) !important;
      font-size: 0.8125rem;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      border-radius: 8px;
      transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
      border: 1px solid transparent;
      box-sizing: border-box;
    }
    .sidebar-item:hover {
      background: rgba(255, 255, 255, 0.08) !important;
      color: #fff !important;
    }
    .sidebar-item.active {
      background: #3a4a66 !important;
      box-shadow: inset 3px 0 0 var(--sidebar-accent, #41c38c);
      color: #fff !important;
      font-weight: 600;
    }
    .sidebar-item-label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sidebar-icon-wrap {
      width: 28px;
      height: 28px;
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.07);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.82);
      transition: background 0.15s ease, color 0.15s ease;
    }
    .sidebar-item:hover .sidebar-icon-wrap {
      background: rgba(255, 255, 255, 0.12);
    }
    .sidebar-item.active .sidebar-icon-wrap {
      background: rgba(65, 195, 140, 0.22);
      color: var(--sidebar-accent, #41c38c);
    }
    .sidebar-dropdown-container {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .sidebar-dropdown-toggle {
      justify-content: space-between;
    }
    .sidebar-chevron {
      font-size: 10px;
      opacity: 0.5;
      transition: transform 0.2s ease;
      flex-shrink: 0;
    }
    .sidebar-dropdown-menu {
      display: none;
      margin: 2px 0 4px 0;
      padding: 4px 0 4px 0.65rem;
      border-left: 2px solid rgba(255, 255, 255, 0.12);
      margin-left: 1.15rem;
    }
    .sidebar-dropdown-menu.open {
      display: block;
    }
    .sidebar-dropdown-item {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.38rem 0.55rem;
      color: rgba(255, 255, 255, 0.72) !important;
      font-size: 0.78rem;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      border-radius: 6px;
      transition: background 0.15s ease, color 0.15s ease;
      box-sizing: border-box;
    }
    .sidebar-dropdown-item:hover {
      background: rgba(255, 255, 255, 0.08) !important;
      color: #fff !important;
    }
    .sidebar-dropdown-item.active {
      background: #3a4a66 !important;
      box-shadow: inset 2px 0 0 var(--sidebar-accent, #41c38c);
      color: #fff !important;
      font-weight: 600;
    }
    .sidebar-sub-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.28);
      flex-shrink: 0;
    }
    .sidebar-dropdown-item.active .sidebar-sub-dot {
      background: var(--sidebar-accent, #41c38c);
    }
    .sidebar-nested-dropdown {
      margin: 1px 0;
    }
    .sidebar-dropdown-menu-nested {
      margin-left: 0.85rem;
      padding-left: 0.45rem;
      border-left-color: rgba(255, 255, 255, 0.08);
    }
    .sidebar-dropdown-item-nested {
      font-size: 0.74rem;
      padding-left: 0.35rem;
    }
    .sidebar-nested-toggle {
      justify-content: space-between;
    }
    .dropdown-item {
      transition: background-color 0.2s;
      color: #333 !important;
      display: block;
      padding: 4px 12px;
      text-decoration: none;
    }
    .dropdown-item.active {
      background-color: rgba(0, 0, 0, 0.1) !important;
      font-weight: bold;
      color: #000 !important;
    }
    .navbar-notif-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .navbar-notif-btn {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      border-radius: 8px;
      cursor: pointer;
      color: #fff;
      transition: background 0.15s ease;
    }
    .navbar-notif-btn:hover {
      background: rgba(255, 255, 255, 0.12);
    }
    .navbar-notif-badge {
      position: absolute;
      top: 2px;
      right: 2px;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      border-radius: 999px;
      background: #ef4444;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      line-height: 16px;
      text-align: center;
      box-shadow: 0 0 0 2px rgba(14, 116, 144, 0.85);
      pointer-events: none;
    }
    .navbar-notif-panel {
      display: none;
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: min(320px, 88vw);
      max-height: min(68vh, 400px);
      background: #fff;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16);
      z-index: 1200;
      overflow: hidden;
      flex-direction: column;
      color: #0f172a;
    }
    .navbar-notif-panel.open {
      display: flex;
    }
    .navbar-notif-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.4rem;
      padding: 0.55rem 0.7rem;
      border-bottom: 1px solid #e8ecf1;
      background: #f8fafc;
    }
    .navbar-notif-head-title {
      font-size: 0.8125rem;
      font-weight: 700;
      color: #263247;
      letter-spacing: -0.01em;
    }
    .navbar-notif-mark-all {
      border: none;
      background: transparent;
      color: #41c38c;
      font-size: 0.6875rem;
      font-weight: 600;
      cursor: pointer;
      padding: 0.15rem 0.3rem;
      border-radius: 5px;
      white-space: nowrap;
    }
    .navbar-notif-mark-all:hover {
      background: #ecfdf5;
    }
    .navbar-notif-list {
      overflow-y: auto;
      max-height: 300px;
    }
    .navbar-notif-item {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      width: 100%;
      padding: 0.5rem 0.7rem;
      border: none;
      border-bottom: 1px solid #f1f5f9;
      background: #fff;
      text-align: left;
      cursor: pointer;
      box-sizing: border-box;
      transition: background 0.12s ease;
    }
    .navbar-notif-item:last-child {
      border-bottom: none;
    }
    .navbar-notif-item:hover {
      background: #f8fafc;
    }
    .navbar-notif-item.unread {
      background: #eef9f3;
    }
    .navbar-notif-item.unread:hover {
      background: #e3f5ec;
    }
    .navbar-notif-icon {
      width: 28px;
      height: 28px;
      border-radius: 7px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 12px;
      margin-top: 1px;
    }
    .navbar-notif-icon.info { background: #dbeafe; color: #1d4ed8; }
    .navbar-notif-icon.warning { background: #fef3c7; color: #b45309; }
    .navbar-notif-icon.success { background: #dcfce7; color: #15803d; }
    .navbar-notif-body {
      min-width: 0;
      flex: 1;
    }
    .navbar-notif-title {
      display: block;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #263247;
      line-height: 1.3;
    }
    .navbar-notif-msg {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
      margin-top: 0.12rem;
      font-size: 0.75rem;
      color: #64748b;
      line-height: 1.4;
    }
    .navbar-notif-time {
      display: block;
      margin-top: 0.18rem;
      font-size: 0.6875rem;
      color: #94a3b8;
      line-height: 1.2;
    }
    .navbar-notif-empty {
      padding: 1.35rem 0.75rem;
      text-align: center;
      color: #94a3b8;
      font-size: 0.8125rem;
    }
    .navbar-notif-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.45rem;
      padding: 0.4rem 0.7rem;
      border-top: 1px solid #e8ecf1;
      background: #f8fafc;
      font-size: 0.6875rem;
      color: #64748b;
      line-height: 1.35;
    }
    .navbar-notif-foot-hint {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .navbar-notif-read-more {
      border: none;
      background: transparent;
      color: #41c38c;
      font-size: 0.6875rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.28rem;
      padding: 0.15rem 0.25rem;
      border-radius: 5px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .navbar-notif-read-more:hover {
      background: #ecfdf5;
    }
    .notif-history-page {
      max-width: 760px;
      margin: 0 auto;
      width: 100%;
    }
    .notif-history-header {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 1rem;
      padding-bottom: 0.85rem;
      border-bottom: 1px solid #e8ecf1;
    }
    .notif-history-title {
      margin: 0;
      font-size: 1.35rem;
      font-weight: 800;
      color: #263247;
      letter-spacing: -0.02em;
    }
    .notif-history-subtitle {
      margin: 0.25rem 0 0;
      font-size: 0.8125rem;
      color: #64748b;
      line-height: 1.4;
    }
    .notif-history-unread-badge {
      display: inline-flex;
      align-items: center;
      margin-top: 0.45rem;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      background: #eef9f3;
      border: 1px solid #b8e6cf;
      color: #2f3d58;
      font-size: 0.6875rem;
      font-weight: 700;
    }
    .notif-history-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem;
    }
    .notif-history-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.45rem 0.8rem;
      border-radius: 0.5rem;
      border: 1px solid #e2e8f0;
      background: #fff;
      color: #334155;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .notif-history-btn:hover {
      border-color: #b8e6cf;
      box-shadow: 0 2px 8px rgba(65, 195, 140, 0.1);
    }
    .notif-history-btn-primary {
      border: none;
      background: linear-gradient(135deg, #41c38c 0%, #2ecc71 100%);
      color: #fff;
    }
    .notif-history-btn-primary:hover {
      filter: brightness(1.03);
      box-shadow: 0 4px 12px rgba(65, 195, 140, 0.25);
    }
    .notif-history-list {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }
    .notif-history-item {
      display: flex;
      align-items: flex-start;
      gap: 0.65rem;
      width: 100%;
      padding: 0.75rem 0.85rem;
      border: 1px solid #e8ecf1;
      border-radius: 0.65rem;
      background: #fff;
      text-align: left;
      cursor: pointer;
      box-sizing: border-box;
      transition: background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
    }
    .notif-history-item:hover {
      background: #f8fafc;
      border-color: #dbeafe;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
    }
    .notif-history-item.unread {
      background: #eef9f3;
      border-color: #b8e6cf;
    }
    .notif-history-item.unread:hover {
      background: #e3f5ec;
    }
    .notif-history-body {
      min-width: 0;
      flex: 1;
    }
    .notif-history-msg {
      display: block;
      margin-top: 0.2rem;
      font-size: 0.8125rem;
      color: #64748b;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .notif-history-empty {
      padding: 2.5rem 1rem;
      text-align: center;
      color: #94a3b8;
      font-size: 0.875rem;
      background: #fff;
      border: 1px dashed #e2e8f0;
      border-radius: 0.65rem;
    }
  `;

  // Routing helper
  function normalizePagePath(path) {
    const rawPath = String(path || '/');
    const pathOnly = rawPath.split('?')[0];
    return pathOnly || '/';
  }

  // Resolve dynamic routes like /customers/:id/history
  function resolvePageRoute(path) {
    if (pages[path]) return path;
    if (!path) return path;
    for (const pattern of Object.keys(pages)) {
      if (!pattern.includes(':')) continue;
      const patternParts = pattern.split('/');
      const pathParts = path.split('/');
      if (patternParts.length !== pathParts.length) continue;
      let match = true;
      for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) continue;
        if (patternParts[i] !== pathParts[i]) { match = false; break; }
      }
      if (match) return pattern;
    }
    return path;
  }

  // Routing functions
  layout.addPage = function(config) {
    pages[config.path] = config;
  };

  // Check if a route path is registered (termasuk pola dinamis /biodata/:id_biodata)
  layout.isValidRoute = function(path) {
    const normalized = normalizePagePath(path);
    const resolved = resolvePageRoute(normalized);
    return !!pages[resolved];
  };

  // Check if a route is a CRUD dynamic route (/resource/create, /resource/edit/:id)
  layout.isCrudDynamicRoute = function(path) {
    const pathOnly = normalizePagePath(path);
    const createPattern = /^\/[^\/]+\/create$/;
    const editPattern = /^\/[^\/]+\/edit\/[^\/]+$/;
    return createPattern.test(pathOnly) || editPattern.test(pathOnly);
  };

  layout.addSideMenu = function(menus) {
    sideMenus = menus;
    renderSideMenu();
  };

  layout.addNavbar = function(menus) {
    navbarMenus = menus;
    renderNavbar();
  };

  // RBAC: set current user role
  layout.setRole = function(role) {
    currentRole = role || null;
    renderSideMenu();
    renderNavbar();
  };

  // RBAC: get current user role
  layout.getRole = function() {
    return currentRole;
  };

  // Middleware: add a function that runs before each page render
  // fn(path, pageConfig) => { allowed: true/false, redirect: '/path' }
  layout.middleware = function(fn) {
    if (typeof fn === 'function') middlewares.push(fn);
  };

  function getNotificationReadIds() {
    try {
      const raw = window.localStorage.getItem(NOTIF_READ_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  function saveNotificationReadIds(ids) {
    try {
      window.localStorage.setItem(NOTIF_READ_STORAGE_KEY, JSON.stringify(Array.from(new Set(ids.map(String)))));
    } catch { /* ignore */ }
  }

  function countUnreadNotifications() {
    const read = new Set(getNotificationReadIds());
    return notificationItems.filter((n) => n && n.id && !read.has(String(n.id))).length;
  }

  function formatNotificationTime(value, full) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    if (full) {
      return d.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function notificationTypeIcon(type) {
    if (type === 'warning') return 'fas fa-exclamation-triangle';
    if (type === 'success') return 'fas fa-check-circle';
    return 'fas fa-info-circle';
  }

  function closeNotificationPanel() {
    notificationPanelOpen = false;
    if (connector.notificationPanel) {
      connector.notificationPanel.classList.remove('open');
    }
  }

  function closeUserDropdownMenu() {
    dropdownVisible = false;
    if (connector.dropdownMenu) {
      el(connector.dropdownMenu).css(cssLayouting[isMobile ? 'mobile' : 'desktop'].dropdownMenu).get();
    }
  }

  function updateNotificationBadge() {
    if (!connector.notificationBadge) return;
    const unread = countUnreadNotifications();
    if (unread > 0) {
      connector.notificationBadge.textContent = unread > 99 ? '99+' : String(unread);
      connector.notificationBadge.style.display = 'block';
    } else {
      connector.notificationBadge.style.display = 'none';
    }
  }

  function buildNotificationRowItem(item, options) {
    const opts = options || {};
    const variant = opts.variant === 'full' ? 'full' : 'compact';
    const read = opts.readSet || new Set(getNotificationReadIds());
    const isUnread = item && item.id && !read.has(String(item.id));
    const itemClass = variant === 'full'
      ? ('notif-history-item' + (isUnread ? ' unread' : ''))
      : ('navbar-notif-item' + (isUnread ? ' unread' : ''));
    const bodyClass = variant === 'full' ? 'notif-history-body' : 'navbar-notif-body';
    const msgClass = variant === 'full' ? 'notif-history-msg' : 'navbar-notif-msg';

    return el('button')
      .attr('type', 'button')
      .class(itemClass)
      .child([
        el('span').class('navbar-notif-icon ' + (item.type || 'info')).child(
          el('i').class(notificationTypeIcon(item.type))
        ),
        el('span').class(bodyClass).child([
          el('span').class('navbar-notif-title').text(item.title || 'Notifikasi'),
          el('span').class(msgClass).text(item.message || ''),
          el('span').class('navbar-notif-time').text(formatNotificationTime(item.createdAt, variant === 'full'))
        ])
      ])
      .click(() => {
        markNotificationRead(item.id, { skipPanelRender: variant === 'full', onAfterRead: opts.onAfterRead });
        if (variant === 'compact') closeNotificationPanel();
        if (item.link) layout.navigate(item.link);
      });
  }

  function openNotificationsHistoryPage() {
    closeNotificationPanel();
    layout.navigate('/notifications');
  }

  function renderNotificationList() {
    if (!connector.notificationList) return;
    const listEl = el(connector.notificationList).empty();
    const preview = notificationItems.slice(0, NOTIF_PANEL_PREVIEW_LIMIT);

    if (!preview.length) {
      listEl.child(
        el('div').class('navbar-notif-empty').child([
          el('i').class('fas fa-bell-slash').css({ display: 'block', fontSize: '1.1rem', marginBottom: '0.35rem', opacity: '0.45' }),
          el('span').text('Tidak ada notifikasi')
        ])
      );
      listEl.get();
      return;
    }

    preview.forEach((item) => {
      listEl.child(buildNotificationRowItem(item, { variant: 'compact' }));
    });
    listEl.get();
  }

  function renderNotificationLoading() {
    if (!connector.notificationList) return;
    el(connector.notificationList).empty().child(
      el('div').class('navbar-notif-empty').child([
        el('i').class('fas fa-spinner fa-spin').css({ display: 'block', fontSize: '1.1rem', marginBottom: '0.35rem', opacity: '0.55' }),
        el('span').text('Memuat notifikasi...')
      ])
    ).get();
  }

  function updateNotificationPanelVisibility() {
    if (!connector.notificationPanel) return;
    if (notificationPanelOpen) connector.notificationPanel.classList.add('open');
    else connector.notificationPanel.classList.remove('open');
  }

  function markNotificationRead(id, options) {
    if (!id) return;
    const opts = options || {};
    const ids = getNotificationReadIds();
    if (!ids.includes(String(id))) ids.push(String(id));
    saveNotificationReadIds(ids);
    updateNotificationBadge();
    if (!opts.skipPanelRender) renderNotificationList();
    if (typeof opts.onAfterRead === 'function') opts.onAfterRead();
  }

  function markAllNotificationsRead(options) {
    const opts = options || {};
    const ids = getNotificationReadIds();
    notificationItems.forEach((n) => {
      if (n && n.id && !ids.includes(String(n.id))) ids.push(String(n.id));
    });
    saveNotificationReadIds(ids);
    updateNotificationBadge();
    if (!opts.skipPanelRender) renderNotificationList();
    if (typeof opts.onAfterRead === 'function') opts.onAfterRead();
  }

  async function toggleNotificationPanel() {
    notificationPanelOpen = !notificationPanelOpen;
    if (notificationPanelOpen) {
      closeUserDropdownMenu();
      updateNotificationPanelVisibility();
      if (notificationItems.length) {
        renderNotificationList();
      } else {
        renderNotificationLoading();
      }
      await fetchNotifications(true);
      return;
    }
    updateNotificationPanelVisibility();
  }

  async function fetchNotifications(silent) {
    try {
      const res = await fetch(`/api/notifications?limit=${NOTIF_HISTORY_LIMIT}`, { credentials: 'include' });
      const json = await res.json();
      if (!json.success) return notificationItems;
      notificationItems = Array.isArray(json.data) ? json.data : [];
      updateNotificationBadge();
      if (notificationPanelOpen) renderNotificationList();
      return notificationItems;
    } catch (error) {
      if (!silent) console.warn('Gagal memuat notifikasi:', error);
      return notificationItems;
    }
  }

  function renderNotificationsHistoryList(listHost, state) {
    const host = listHost && listHost.el ? listHost.el : listHost;
    if (!host) return;
    const listEl = el(host).empty();

    if (state === 'loading') {
      listEl.child(
        el('div').class('notif-history-empty').child([
          el('i').class('fas fa-spinner fa-spin').css({ display: 'block', fontSize: '1.25rem', marginBottom: '0.5rem', opacity: '0.5' }),
          el('span').text('Memuat riwayat notifikasi...')
        ])
      );
      listEl.get();
      return;
    }

    if (state === 'error') {
      listEl.child(el('div').class('notif-history-empty').text('Gagal memuat notifikasi. Coba refresh.'));
      listEl.get();
      return;
    }

    if (!notificationItems.length) {
      listEl.child(
        el('div').class('notif-history-empty').child([
          el('i').class('fas fa-bell-slash').css({ display: 'block', fontSize: '1.25rem', marginBottom: '0.5rem', opacity: '0.45' }),
          el('span').text('Belum ada notifikasi')
        ])
      );
      listEl.get();
      return;
    }

    notificationItems.forEach((item) => {
      listEl.child(buildNotificationRowItem(item, {
        variant: 'full',
        onAfterRead: () => renderNotificationsHistoryList(listHost, 'ready')
      }));
    });
    listEl.get();
  }

  function syncNotificationsHistoryUnreadBadge(badgeEl) {
    if (!badgeEl) return;
    const unread = countUnreadNotifications();
    el(badgeEl).text(unread > 0 ? `${unread} belum dibaca` : '').css({ display: unread > 0 ? 'inline-flex' : 'none' });
  }

  async function buildNotificationsHistoryPage() {
    const listSlot = el('div').class('notif-history-list');
    const unreadBadge = el('span').class('notif-history-unread-badge').css({ display: 'none' });

    const refreshHistoryView = (state) => {
      renderNotificationsHistoryList(listSlot, state);
      syncNotificationsHistoryUnreadBadge(unreadBadge.el);
    };

    const markAllBtn = el('button')
      .attr('type', 'button')
      .class('notif-history-btn notif-history-btn-primary')
      .text('Tandai dibaca')
      .click(() => {
        markAllNotificationsRead({ skipPanelRender: true, onAfterRead: () => refreshHistoryView('ready') });
      });

    const refreshBtn = el('button')
      .attr('type', 'button')
      .class('notif-history-btn')
      .child([
        el('i').class('fas fa-sync-alt'),
        el('span').text('Refresh')
      ])
      .click(async () => {
        refreshHistoryView('loading');
        try {
          await fetchNotifications(true);
          refreshHistoryView('ready');
        } catch {
          refreshHistoryView('error');
        }
      });

    const page = el('div').class('notif-history-page').child([
      el('div').class('notif-history-header').child([
        el('div').child([
          el('h1').class('notif-history-title').text('Riwayat Notifikasi'),
          el('p').class('notif-history-subtitle').text('Alert operasional TKI — status, medical, biodata, dan tenggat disnaker'),
          unreadBadge
        ]),
        el('div').class('notif-history-actions').child([markAllBtn, refreshBtn])
      ]),
      listSlot
    ]);

    const dom = page.get();
    refreshHistoryView('loading');
    try {
      await fetchNotifications(true);
      refreshHistoryView('ready');
    } catch {
      refreshHistoryView('error');
    }
    return dom;
  }

  function stopNotificationPolling() {
    if (notificationPollTimer) {
      clearInterval(notificationPollTimer);
      notificationPollTimer = null;
    }
  }

  function initNotifications() {
    stopNotificationPolling();
    fetchNotifications(true);
    notificationPollTimer = setInterval(() => fetchNotifications(true), 90000);
  }

  layout.fetchNotifications = fetchNotifications;
  layout.initNotifications = initNotifications;
  layout.stopNotifications = stopNotificationPolling;
  layout.openNotificationsHistory = openNotificationsHistoryPage;

  layout.addPage({
    path: '/notifications',
    pageContentPadding: '1.25rem',
    component: () => buildNotificationsHistoryPage()
  });

  function buildNotificationBell() {
    const wrap = el('div').class('navbar-notif-wrap').link(connector, 'notificationWrap');
    const btn = el('a')
      .class('navbar-notif-btn')
      .link(connector, 'notificationBtn')
      .attr('title', 'Notifikasi')
      .click((e) => {
        e.stopPropagation();
        toggleNotificationPanel();
      })
      .child([
        el('i').class('fas fa-bell').size('18px'),
        el('span').class('navbar-notif-badge').link(connector, 'notificationBadge').css({ display: 'none' })
      ]);

    const markAllBtn = el('button')
      .attr('type', 'button')
      .class('navbar-notif-mark-all')
      .text('Tandai dibaca')
      .click((e) => {
        e.stopPropagation();
        markAllNotificationsRead();
      });

    const readMoreBtn = el('button')
      .attr('type', 'button')
      .class('navbar-notif-read-more')
      .child([
        el('span').text('Lihat semua'),
        el('i').class('fas fa-arrow-right').css({ fontSize: '0.62rem' })
      ])
      .click((e) => {
        e.stopPropagation();
        openNotificationsHistoryPage();
      });

    const panel = el('div')
      .class('navbar-notif-panel')
      .link(connector, 'notificationPanel')
      .child([
        el('div').class('navbar-notif-head').child([
          el('span').class('navbar-notif-head-title').text('Notifikasi'),
          markAllBtn
        ]),
        el('div').class('navbar-notif-list').link(connector, 'notificationList'),
        el('div').class('navbar-notif-foot').child([
          el('span').class('navbar-notif-foot-hint').text('Alert operasional TKI'),
          readMoreBtn
        ])
      ]);

    wrap.child([btn, panel]);
    updateNotificationBadge();
    updateNotificationPanelVisibility();
    if (notificationPanelOpen) renderNotificationList();
    return wrap;
  }

  function renderNavbar() {
    if (!connector.navbarActions) return;
    
    if (shouldHideLayoutForPage()) {
      if (connector.navbar) {
        el(connector.navbar).css({ display: 'none' }).get();
      }
      return;
    }

    if (connector.navbar) {
      el(connector.navbar).css(cssLayouting[isMobile ? 'mobile' : 'desktop'].navBar).get();
    }
    
    const dropdownColor = '#333';

    const switchTrackStyle = {
      display: isMobile ? 'none' : 'inline-flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
      width: '48px',
      height: '26px',
      padding: '3px',
      borderRadius: '999px',
      border: '1px solid rgba(255,255,255,0.35)',
      background: desktopHideMode ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.12)',
      cursor: 'pointer',
      flexShrink: '0',
      transition: 'background 0.2s ease, border-color 0.2s ease',
      boxSizing: 'border-box',
    };
    const switchHandleStyle = {
      width: '18px',
      height: '18px',
      borderRadius: '50%',
      background: '#fff',
      boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
      transition: 'transform 0.2s ease',
      transform: desktopHideMode ? 'translateX(22px)' : 'translateX(0)',
      flexShrink: '0',
    };

    el(connector.navbarActions).empty().child([
      buildNotificationBell(),
      el('div').css(cssLayouting[isMobile ? 'mobile' : 'desktop'].userDropdown).link(connector, 'userDropdown').child([
        el('a').link(connector, 'userIcon').cursor('pointer').padding('0 0.5rem').child(
          el('i').class('fas fa-user').size('18px')
        ).click(() => {
          closeNotificationPanel();
          dropdownVisible = !dropdownVisible;
          const dropdownCss = dropdownVisible ? cssLayouting[isMobile ? 'mobile' : 'desktop'].dropdownMenuOpen : cssLayouting[isMobile ? 'mobile' : 'desktop'].dropdownMenu;
          el(connector.dropdownMenu).css(dropdownCss).get();
        }),
        el('div').link(connector, 'dropdownMenu').css(cssLayouting[isMobile ? 'mobile' : 'desktop'].dropdownMenu).child(
          [
            ...navbarMenus.map((item) => {
              const isActive = currentPage === item.page;
              return el('a').css({ ...cssLayouting[isMobile ? 'mobile' : 'desktop'].dropdownItem, color: dropdownColor })
                .class('dropdown-item' + (isActive ? ' active' : ''))
                .text(item.name)
                .click(() => {
                  dropdownVisible = false;
                  el(connector.dropdownMenu).css(cssLayouting[isMobile ? 'mobile' : 'desktop'].dropdownMenu).get();
                  layout.navigate(item.page);
                });
            }),
            // Divider
            el('div').css({ borderTop: '1px solid #e5e7eb', margin: '4px 0' }),
            // Profile
            el('a').css({ ...cssLayouting[isMobile ? 'mobile' : 'desktop'].dropdownItem, color: dropdownColor, display: 'flex', alignItems: 'center', gap: '8px' })
              .class('dropdown-item' + (currentPage === '/profile' ? ' active' : ''))
              .child([
                el('i').class('fas fa-user-circle').css({ fontSize: '13px' }),
                el('span').text(resolveMenuName({ nameKey: 'sidebar.profile', name: 'Profile' })),
              ])
              .click(() => {
                dropdownVisible = false;
                el(connector.dropdownMenu).css(cssLayouting[isMobile ? 'mobile' : 'desktop'].dropdownMenu).get();
                layout.navigate('/profile');
              }),
            // Logout
            el('a').css({ ...cssLayouting[isMobile ? 'mobile' : 'desktop'].dropdownItem, color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' })
              .child([
                el('i').class('fas fa-sign-out-alt').css({ fontSize: '13px' }),
                el('span').text(resolveMenuName({ nameKey: 'profile.logout', name: 'Logout' })),
              ])
              .click(() => {
                dropdownVisible = false;
                el(connector.dropdownMenu).css(cssLayouting[isMobile ? 'mobile' : 'desktop'].dropdownMenu).get();
                (async () => {
                  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch (e) {}
                  if (typeof CrmAuth !== 'undefined' && CrmAuth.logout) {
                    try { await CrmAuth.logout(); } catch (e) {}
                  }
                  if (window.pjtkiApp?.resetSessionForLogout && window.pjtkiApp.core) {
                    window.pjtkiApp.resetSessionForLogout(window.pjtkiApp.core);
                  } else {
                    if (typeof layout.stopNotifications === 'function') layout.stopNotifications();
                    if (typeof layout.addSideMenu === 'function') layout.addSideMenu([]);
                    if (window.layout) window.layout.setRole(null);
                  }
                  window.location.hash = '#/login';
                })();
              }),
          ]
        )
      ])
    ]).get();

    // Render switch ke slot di sebelah kanan navbar title (desktop only)
    if (connector.sidebarHideSwitchSlot) {
      connector.sidebarHideSwitchSlot.innerHTML = '';
      if (!isMobile && !shouldHideSidebarForPage()) {
        el(connector.sidebarHideSwitchSlot).child([
          el('div').link(connector, 'sidebarHideToggle').css(switchTrackStyle).attr('title', 'Toggle sidebar hide mode').child([
            el('div').link(connector, 'sidebarHideToggleHandle').css(switchHandleStyle)
          ]).click(() => {
            setDesktopHideMode(!desktopHideMode);
            el(connector.sidebarHideToggle).css({
              background: desktopHideMode ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.12)',
            }).get();
            el(connector.sidebarHideToggleHandle).css({
              transform: desktopHideMode ? 'translateX(22px)' : 'translateX(0)',
            }).get();
          })
        ]).get();
      }
    }

    if (connector.navbarBackButton) {
      el(connector.navbarBackButton).css({ display: !isMobile && shouldHideSidebarForPage() ? 'inline-flex' : 'none' }).get();
    }
  }

  layout.render = function() {
    loadDesktopHideMode();
    setDesktopHideMode(desktopHideMode);
    syncSidebarAccentVar();

    // Load initial page
    const rawInitialPath = normalizePagePath(window.location.hash.slice(1) || '/');
    const initialPath = resolvePageRoute(rawInitialPath);
    if (pages[initialPath]) {
      currentPage = initialPath;
      renderPage(initialPath);
    } else if (pages['/']) {
      currentPage = '/';
      renderPage('/');
    }

    syncSidebarDropdowns();
    // Update menu active state after initial render
    renderSideMenu();
    renderNavbar();
    updateLayoutVisibility();

    // Make layout visible after all setup is done (prevents flash)
    el(connector.container).css({ visibility: 'visible' }).get();
  };

  layout.setTheme = function(themeName) {
    if (!themes[themeName]) {
      console.warn(`Theme '${themeName}' not found, using default`);
      themeName = 'default';
    }
    currentTheme = themeName;
    syncSidebarAccentVar();
    applyTheme();
  };

  // Set navbar title text
  layout.setNavbarTitle = function(title) {
    navbarTitleText = title || 'Core App';
    if (connector.navbarTitle) {
      el(connector.navbarTitle).text(navbarTitleText).get();
    }
    if (connector.sidebar && sideMenus.length) {
      renderSideMenu();
    }
  };

  layout.setCustomTheme = function(config) {
    const themeName = 'custom';
    themes[themeName] = {
      navbar: {
        backgroundColor: config.navbarBg || '#333',
        color: config.navbarColor || '#fff',
      },
      sidebar: {
        backgroundColor: config.sidebarBg || '#444',
        color: config.sidebarColor || '#fff',
      },
    };
    currentTheme = themeName;
    syncSidebarAccentVar();
    applyTheme();
  };
  layout.hideLoader = hideLoader;
  layout.toast = showToast;
  layout.notify = notify;
  layout.confirm = showConfirm;
  layout.closeConfirm = closeConfirm;
  layout.modal = showCustomModal;
  layout.customModal = showCustomModal;
  layout.closeModal = closeModal;
  layout.modal = showCustomModal;
  layout.customModal = showCustomModal;
  layout.closeModal = closeModal;

  function applyTheme() {
    const theme = themes[currentTheme];
    
    // Update navbar
    if (connector.navbar) {
      const navbarCss = cssLayouting[isMobile ? 'mobile' : 'desktop'].navBar;
      navbarCss.backgroundColor = theme.navbar.backgroundColor;
      navbarCss.color = theme.navbar.color;
      el(connector.navbar).css(navbarCss).get();
      
      // Update navbar title color
      if (connector.navbarTitle) {
        el(connector.navbarTitle).css({ color: theme.navbar.color }).get();
      }
    }
    
    // Update sidebar
    if (connector.sidebar) {
      const sidebarCss = cssLayouting[isMobile ? 'mobile' : 'desktop'].sidebar;
      sidebarCss.backgroundColor = theme.sidebar.backgroundColor;
      el(connector.sidebar).css(sidebarCss).get();
      
      // Update sidebar open state for mobile
      const sidebarOpenCss = cssLayouting.mobile.sidebarOpen;
      sidebarOpenCss.backgroundColor = theme.sidebar.backgroundColor;
      
      // Update sidebar text color
      const sidebarItems = connector.sidebar.querySelectorAll('a');
      sidebarItems.forEach(item => {
        el(item).css({ color: theme.sidebar.color }).get();
      });
    }
    
    // Update dropdown item colors consistently for white dropdown background
    const dropdownItems = document.querySelectorAll('.dropdown-item');
    dropdownItems.forEach(item => {
      el(item).css({ color: '#333' }).get();
    });
    const dropdownActiveItems = document.querySelectorAll('.dropdown-item.active');
    dropdownActiveItems.forEach(item => {
      el(item).css({ color: '#000', fontWeight: 'bold' }).get();
    });
    
    // Update hover styles based on navbar theme
    const styleEl = document.querySelector('style[data-theme-style]');
    if (styleEl) {
      styleEl.textContent = `${sidebarDropdownCSS}
${getThemeStyleCSS()}`;
    }
  }

  layout.navigate = function(path, replace = false) {
    const pathOnly = normalizePagePath(path);
    const pagePath = resolvePageRoute(pathOnly);
    const registeredPage = pages[pagePath];

    // Handle dynamic CRUD routes (/resource/create, /resource/edit/:id)
    const crudDynamic = isCrudDynamicRoute(pathOnly);
    if (crudDynamic && !registeredPage) {
      const currentHash = window.location.hash.slice(1) || '/';
      if (currentHash !== path) {
        showLoader();
        if (replace) {
          window.location.replace('#' + path);
        } else {
          window.location.hash = path;
        }
        return;
      }
      // Already on this path, trigger legacy create/edit handler
      triggerCrudDynamicRoute(path);
      return;
    }
    if (crudDynamic && registeredPage) {
      const currentHash = window.location.hash.slice(1) || '/';
      if (currentHash !== path) {
        showLoader();
        if (replace) {
          window.location.replace('#' + path);
        } else {
          window.location.hash = path;
        }
        return;
      }
      currentPage = pagePath;
      renderPage(pagePath);
      syncSidebarDropdowns();
      renderSideMenu();
      renderNavbar();
      updateLayoutVisibility();
      return;
    }
    
    if (!pages[pagePath]) return;

    const currentHash = window.location.hash.slice(1) || '/';
    if (currentHash !== path) {
      showLoader();
      if (replace) {
        window.location.replace('#' + path);
      } else {
        window.location.hash = path;
      }
      return;
    }

    currentPage = pagePath;
    renderPage(pagePath);
    syncSidebarDropdowns();
    // Re-render sidebar dan navbar to update active state
    renderSideMenu();
    renderNavbar();
    updateLayoutVisibility();
  };

  // Check if path is a CRUD dynamic route
  function isCrudDynamicRoute(path) {
    const pathOnly = normalizePagePath(path);
    const createPattern = /^\/[^/]+\/create$/;
    const editPattern = /^\/[^/]+\/edit\/[^/]+$/;
    return createPattern.test(pathOnly) || editPattern.test(pathOnly);
  }

  function parseCrudDynamicPath(path) {
    const raw = String(path || '');
    const pathOnly = normalizePagePath(raw);
    const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
    return { pathOnly, params: new URLSearchParams(query) };
  }

  // Trigger CRUD dynamic route (create or edit form)
  function triggerCrudDynamicRoute(path) {
    const { pathOnly, params } = parseCrudDynamicPath(path);
    const createMatch = pathOnly.match(/^\/([^\/]+)\/create$/);
    const editMatch = pathOnly.match(/^\/([^\/]+)\/edit\/(.+)$/);
    
    if (createMatch) {
      const resource = createMatch[1];
      const prefill = {};
      const idTki = params.get('id_tki');
      if (idTki) prefill.id_tki = idTki;
      if (typeof window.triggerCrudCreate === 'function') {
        window.triggerCrudCreate(resource, prefill);
      }
    } else if (editMatch) {
      const resource = editMatch[1];
      const id = editMatch[2];
      if (typeof window.triggerCrudEdit === 'function') {
        window.triggerCrudEdit(resource, id);
      }
    }
  }


  function resetPageScroll() {
    try {
      window.scrollTo(0, 0);
    } catch { /* ignore */ }
    if (document.documentElement) {
      document.documentElement.scrollTop = 0;
      document.documentElement.scrollLeft = 0;
    }
    if (document.body) {
      document.body.scrollTop = 0;
      document.body.scrollLeft = 0;
    }
    if (connector.content) {
      connector.content.scrollTop = 0;
      connector.content.scrollLeft = 0;
    }
    if (connector.pagecontent) {
      connector.pagecontent.scrollTop = 0;
      connector.pagecontent.scrollLeft = 0;
    }
  }

  function resetPageScrollAfterPaint() {
    resetPageScroll();
    requestAnimationFrame(() => resetPageScroll());
  }

  layout.resetPageScroll = resetPageScroll;

  function ensureAuthBootstrapOverlay() {
    if (authBootstrapOverlayEl) return authBootstrapOverlayEl;
    if (!document.querySelector('style[data-auth-bootstrap-style]')) {
      const style = document.createElement('style');
      style.setAttribute('data-auth-bootstrap-style', 'true');
      style.textContent = `
        .auth-bootstrap-overlay {
          position: fixed;
          inset: 0;
          z-index: 99999;
          display: none;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.85rem;
          background: linear-gradient(155deg, #164e63 0%, #155e75 38%, #0e7490 100%);
          color: #fff;
        }
        .auth-bootstrap-spinner {
          width: 46px;
          height: 46px;
          border: 4px solid rgba(255,255,255,0.22);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.85s linear infinite;
        }
        .auth-bootstrap-title {
          margin: 0.35rem 0 0;
          font-size: 1.05rem;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .auth-bootstrap-text {
          margin: 0;
          font-size: 0.875rem;
          font-weight: 500;
          opacity: 0.92;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
    const title = el('p').class('auth-bootstrap-title').text(navbarTitleText || 'PJTKI Bio');
    const text = el('p').class('auth-bootstrap-text').text('Memuat aplikasi...');
    authBootstrapTextEl = text.el;
    const overlay = el('div').class('auth-bootstrap-overlay').child([
      el('div').class('auth-bootstrap-spinner'),
      title,
      text
    ]).get();
    document.body.appendChild(overlay);
    authBootstrapOverlayEl = overlay;
    return overlay;
  }

  function showAuthBootstrapLoader(message, options) {
    const opts = options || {};
    authBootstrapActive = true;
    authBootstrapUntilPageReady = !!opts.untilPageReady;
    const overlay = ensureAuthBootstrapOverlay();
    if (authBootstrapTextEl) {
      authBootstrapTextEl.textContent = message || 'Memuat menu dan halaman...';
    }
    overlay.style.display = 'flex';
    updateLayoutVisibility();
  }

  function hideAuthBootstrapLoader() {
    authBootstrapActive = false;
    authBootstrapUntilPageReady = false;
    if (authBootstrapOverlayEl) {
      authBootstrapOverlayEl.style.display = 'none';
    }
    updateLayoutVisibility();
  }

  layout.showAuthBootstrapLoader = showAuthBootstrapLoader;
  layout.hideAuthBootstrapLoader = hideAuthBootstrapLoader;

  function showLoader() {
    if (!connector.pagecontent) return;
    resetPageScroll();

    const loader = el('div').css({
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100%',
      minHeight: '200px',
    }).child(
      el('div').css({
        border: '4px solid #f3f3f3',
        borderTop: '4px solid #3498db',
        borderRadius: '50%',
        width: '40px',
        height: '40px',
        animation: 'spin 1s linear infinite',
      })
    ).id('page-loader');
    
    // Add animation CSS if not exists
    if (!document.querySelector('style[data-loader-style]')) {
      const styleEl = el('style').textContent(`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `).attr('data-loader-style', 'true').get();
      document.head.appendChild(styleEl);
    }
    
    el(connector.pagecontent).empty().child(loader).get();
  }

  function hideLoader() {
    const loader = document.getElementById('page-loader');
    if (loader) {
      loader.remove();
    }
    if (authBootstrapUntilPageReady) {
      hideAuthBootstrapLoader();
    }
  }

  function getPageContentStyle() {
    const baseStyle = cssLayouting[isMobile ? 'mobile' : 'desktop'].pagecontent;
    const pageConfig = pages[resolvePageRoute(currentPage)] || {};
    const padding = pageConfig.pageContentPadding !== undefined ? pageConfig.pageContentPadding : baseStyle.padding;
    const style = {
      ...baseStyle,
      padding,
      minHeight: '0'
    };
    if (padding === '0' || padding === 0) {
      style.overflow = 'hidden';
    }
    return style;
  }

  function renderPage(path) {
    const pageConfig = pages[path];
    if (!pageConfig) return;

    // Show loader immediately before middleware and async component work.
    showLoader();

    // Run middleware stack
    (async () => {
      for (const mw of middlewares) {
        try {
          const result = await mw(path, pageConfig);
          if (result && result.allowed === false) {
            const redirect = result.redirect || '/';
            if (redirect !== path) {
              layout.navigate(redirect);
            }
            return;
          }
        } catch (e) {
          console.error('Middleware error:', e);
        }
      }

      // RBAC: check page role restriction (Owner = semua halaman)
      const rbacRole = effectiveRoleForRbac();
      if (rbacRole !== 'super_admin' && pageConfig.roles && pageConfig.roles.length > 0 && rbacRole) {
        if (!pageConfig.roles.includes(rbacRole)) {
          let allowedPage = null;
          if (rbacRole === 'cashier' && pages['/kasir']) {
            const kc = pages['/kasir'];
            if (!kc.roles || !kc.roles.length || kc.roles.includes(rbacRole)) {
              allowedPage = '/kasir';
            }
          }
          if (!allowedPage) {
            allowedPage = Object.keys(pages).find(p => {
              const pc = pages[p];
              if (!pc.roles || !pc.roles.length) return true;
              return pc.roles.includes(rbacRole);
            });
          }
          if (allowedPage && allowedPage !== path) {
            layout.navigate(allowedPage);
          }
          return;
        }
      }

      const component = pageConfig.component();

      // set page content padding override before render
      el(connector.pagecontent).css(getPageContentStyle()).get();

      // Check if component is a Promise (for async components)
      if (component && typeof component.then === 'function') {
        component.then((resolvedComponent) => {
          // Lazy routes may register real pageContentPadding inside the promise (PageLoader.applyPageConfig)
          el(connector.pagecontent).css(getPageContentStyle()).get();
          el(connector.pagecontent).empty().child(resolvedComponent).get();
          resetPageScrollAfterPaint();
          hideLoader();
        }).catch((error) => {
          console.error('Error loading page:', error);
          el(connector.pagecontent).css(getPageContentStyle()).get();
          el(connector.pagecontent).empty().child(
            el('div').text('Error loading page')
          ).get();
          resetPageScrollAfterPaint();
          hideLoader();
        });
      } else {
        el(connector.pagecontent).empty().child(component).get();
        resetPageScrollAfterPaint();
        hideLoader();
      }
    })();
  }

  function updateSidebarVisibility() {
    if (!connector.sidebar) return;
    if (isMobile) {
      const sidebarCss = sidebarVisible ? cssLayouting.mobile.sidebarOpen : cssLayouting.mobile.sidebar;
      el(connector.sidebar).css(sidebarCss).get();
    } else {
      // Reset to normal desktop sidebar — always in flex flow
      el(connector.sidebar).css({
        position: '',
        zIndex: '',
        top: '',
        left: '',
        height: '',
        boxShadow: '',
        width: '268px',
        padding: '0.75rem',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        borderRight: '1px solid rgba(0, 0, 0, 0.14)',
        backgroundColor: cssLayouting.desktop.sidebar.backgroundColor,
        minWidth: '',
        transition: 'width 0.2s ease',
        cursor: '',
      }).get();
    }
  }

  function shouldHideLayoutForPage() {
    const pageConfig = pages[resolvePageRoute(currentPage)];
    return Boolean(pageConfig?.hideLayout) || authBootstrapActive;
  }

  function shouldHideSidebarForPage() {
    const pageConfig = pages[resolvePageRoute(currentPage)];
    return Boolean(pageConfig?.fullWidthDesktop || pageConfig?.hideLayout || authBootstrapActive);
  }

  // Centralized layout visibility control
  function updateLayoutVisibility() {
    const hideLayout = shouldHideLayoutForPage();
    const hideSidebar = shouldHideSidebarForPage();

    // Navbar
    if (connector.navbar) {
      if (hideLayout) {
        el(connector.navbar).css({ display: 'none' }).get();
      } else {
        el(connector.navbar).css(cssLayouting[isMobile ? 'mobile' : 'desktop'].navBar).get();
      }
    }

    // Sidebar
    if (connector.sidebar) {
      if (hideSidebar) {
        el(connector.sidebar).css({ display: 'none' }).get();
      } else if (!isMobile && desktopHideMode) {
        updateDesktopSidebar();
      } else {
        updateSidebarVisibility();
      }
    }

    // Page content padding
    if (connector.pagecontent) {
      el(connector.pagecontent).css(getPageContentStyle()).get();
    }

    // Back button (show when sidebar is hidden on desktop)
    if (connector.navbarBackButton) {
      el(connector.navbarBackButton).css({ display: !isMobile && hideSidebar && !hideLayout ? 'inline-flex' : 'none' }).get();
    }
  }

  function updateSidebarState() {
    if (shouldHideSidebarForPage()) {
      if (!connector.sidebar) return;
      el(connector.sidebar).css({ display: 'none' }).get();
      el(connector.pagecontent).css(getPageContentStyle()).get();
      return;
    }

    if (!isMobile && desktopHideMode) {
      updateDesktopSidebar();
    } else {
      updateSidebarVisibility();
    }
  }

  function hideMobileSidebar() {
    if (!isMobile) return;
    sidebarVisible = false;
    updateSidebarVisibility();
  }

  function setDesktopHideMode(value) {
    desktopHideMode = Boolean(value);
    if (!desktopHideMode) {
      desktopHoverOpen = false;
      sidebarHoverActive = false;
      if (sidebarHoverTimeout) {
        clearTimeout(sidebarHoverTimeout);
        sidebarHoverTimeout = null;
      }
      updateDesktopSidebar();
      saveDesktopHideMode();
      return;
    }

    desktopHoverOpen = false;
    updateDesktopSidebar();
    saveDesktopHideMode();
  }

  function updateDesktopSidebar() {
    if (!connector.sidebar) return;
    if (shouldHideSidebarForPage()) {
      el(connector.sidebar).css({ display: 'none' }).get();
      return;
    }
    if (!isMobile && desktopHideMode) {
      if (desktopHoverOpen) {
        // Floating overlay on top of content
        el(connector.sidebar).css({
          position: 'fixed',
          zIndex: '1500',
          top: '50px',
          left: '0',
          width: '268px',
          height: 'calc(100dvh - 50px)',
          minWidth: '',
          padding: '1rem',
          overflow: 'auto',
          display: 'block',
          boxShadow: '4px 0 16px rgba(0,0,0,0.35)',
          backgroundColor: cssLayouting.desktop.sidebar.backgroundColor,
          transition: '',
          cursor: '',
        }).get();
      } else {
        // Collapse to 0 width strip — mouseenter on sidebar triggers hover
        el(connector.sidebar).css({
          position: 'relative',
          zIndex: '1',
          top: '',
          left: '',
          height: '',
          boxShadow: '',
          width: '4px',
          minWidth: '4px',
          padding: '0',
          overflow: 'hidden',
          display: 'block',
          cursor: 'ew-resize',
          transition: '',
          backgroundColor: 'transparent',
        }).get();
      }
      return;
    }

    updateSidebarVisibility();
  }

  function showDesktopSidebarHover() {
    if (!desktopHideMode || isMobile || shouldHideSidebarForPage()) return;
    sidebarHoverActive = true;
    desktopHoverOpen = true;
    if (sidebarHoverTimeout) {
      clearTimeout(sidebarHoverTimeout);
      sidebarHoverTimeout = null;
    }
    updateDesktopSidebar();
  }

  function hideDesktopSidebarHoverSoon() {
    if (!desktopHideMode || isMobile || shouldHideSidebarForPage()) return;
    sidebarHoverActive = false;
    if (sidebarHoverTimeout) clearTimeout(sidebarHoverTimeout);
    sidebarHoverTimeout = setTimeout(() => {
      if (!sidebarHoverActive) {
        desktopHoverOpen = false;
        updateDesktopSidebar();
      }
    }, 150);
  }

  function createSidebarHoverArea() {
    // Sidebar itself is now the hover trigger (2px strip in flex flow)
    // No separate trigger area needed
  }

  function updateDesktopHoverArea() {
    // No-op: sidebar handles its own hover trigger area as a 2px flex item
  }

  function updateSidebarVisibility() {
    if (!connector.sidebar) return;
    if (shouldHideSidebarForPage()) {
      el(connector.sidebar).css({ display: 'none' }).get();
      return;
    }
    if (isMobile) {
      const sidebarCss = sidebarVisible ? cssLayouting.mobile.sidebarOpen : cssLayouting.mobile.sidebar;
      el(connector.sidebar).css(sidebarCss).get();
    } else {
      // Wipe ALL inline styles then apply clean desktop base
      connector.sidebar.removeAttribute('style');
      el(connector.sidebar).css(cssLayouting.desktop.sidebar).get();
    }
  }

  function createToastContainer() {
    if (toastContainer) return;
    toastContainer = el('div')
      .id('layout-toast-container')
      .css({
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        zIndex: '1600',
        pointerEvents: 'none',
        maxWidth: '320px',
      })
      .get();
    app.appendChild(toastContainer);
  }

  function createDialogContainer() {
    if (dialogContainer) return;
    dialogContainer = el('div')
      .id('layout-dialog-container')
      .css({
        position: 'fixed',
        inset: '0',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        zIndex: '1700',
        pointerEvents: 'auto',
      })
      .get();

    dialogContainer.addEventListener('click', (e) => {
      if (e.target === dialogContainer && (currentConfirmOptions?.dismissible !== false || currentModalOptions?.dismissible !== false)) {
        closeModal();
      }
    });

    app.appendChild(dialogContainer);
  }

  function clearToast(toastEl) {
    if (!toastEl) return;
    const timer = toastTimers.get(toastEl);
    if (timer) {
      clearTimeout(timer);
      toastTimers.delete(toastEl);
    }
    el(toastEl).css({ opacity: '0', transform: 'translateX(16px)' }).get();
    setTimeout(() => {
      if (toastEl.parentNode) toastEl.remove();
    }, 200);
  }

  function showToast(message, options = {}) {
    if (!toastContainer) createToastContainer();

    const type = options.type || 'info';
    const title = options.title || '';
    const duration = typeof options.duration === 'number' ? options.duration : 3000;
    const colors = {
      success: '#16a34a',
      error: '#dc2626',
      warning: '#f59e0b',
      info: '#2563eb',
    };
    const backgroundColor = colors[type] || colors.info;

    const toastEl = el('div')
      .css({
        backgroundColor,
        color: '#fff',
        borderRadius: '0.85rem',
        padding: '0.85rem 1rem',
        boxShadow: '0 18px 50px rgba(0,0,0,0.18)',
        pointerEvents: 'auto',
        opacity: '0',
        transform: 'translateX(16px)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
      })
      .child([
        el('div').css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }).child([
          el('div').css({ flex: '1' }).child([
            title
              ? el('div').css({ fontWeight: '700', marginBottom: '0.25rem' }).text(title)
              : el('span'),
            el('div').css({ fontSize: '0.95rem', lineHeight: '1.4' }).text(message),
          ]),
          el('button')
            .text('×')
            .css({
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '1rem',
              cursor: 'pointer',
              lineHeight: '1',
              padding: '0',
              width: '1.5rem',
              height: '1.5rem',
            })
            .click(() => clearToast(toastEl)),
        ]),
      ])
      .get();

    toastContainer.appendChild(toastEl);
    requestAnimationFrame(() => {
      el(toastEl).css({ opacity: '1', transform: 'translateX(0)' }).get();
    });

    const timer = setTimeout(() => clearToast(toastEl), duration);
    toastTimers.set(toastEl, timer);
    return toastEl;
  }

  function closeModal() {
    if (!dialogContainer) return;
    dialogContainer.style.display = 'none';
    dialogContainer.innerHTML = '';
    dialogContainer.style.alignItems = 'center';
    dialogContainer.style.paddingTop = '';
    dialogContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.35)';
    currentConfirmOptions = null;
    currentModalOptions = null;
  }

  function closeConfirm() {
    closeModal();
  }

  function showCustomModal(options = {}) {
    if (!dialogContainer) createDialogContainer();

    if (typeof FormBuilder !== 'undefined' && FormBuilder.closeAllSearchSelects) {
      FormBuilder.closeAllSearchSelects();
    }

    const title = options.title || '';
    const content = options.content ?? options.message ?? '';
    const footer = options.footer || null; // Custom footer element
    const buttons = Array.isArray(options.buttons) ? options.buttons : [];
    const dismissible = options.dismissible !== false;
    const size = options.size || 'medium'; // 'small', 'medium', 'large', 'full'
    const isPalette = options.variant === 'palette';

    currentModalOptions = { dismissible };

    // Size configurations
    const sizeConfig = {
      small: { width: 'min(95%, 420px)', maxHeight: '70vh' },
      medium: { width: 'min(95%, 600px)', maxHeight: '80vh' },
      wide: { width: 'min(95%, 720px)', maxHeight: '82vh' },
      large: { width: 'min(95%, 900px)', maxHeight: '85vh' },
      full: { width: 'min(95%, 1200px)', maxHeight: '90vh' },
      palette: { width: 'min(95%, 640px)', maxHeight: 'min(70vh, 420px)' }
    };

    const config = isPalette ? sizeConfig.palette : (sizeConfig[size] || sizeConfig.medium);

    if (isPalette) {
      dialogContainer.style.alignItems = 'flex-start';
      dialogContainer.style.justifyContent = 'center';
      dialogContainer.style.paddingTop = '10vh';
      dialogContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.55)';
    } else {
      dialogContainer.style.alignItems = 'center';
      dialogContainer.style.paddingTop = '';
      dialogContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.35)';
    }

    // Create scrollable body container
    const bodyContainer = el('div').css(isPalette ? {
      overflow: 'hidden',
      marginBottom: '0',
      color: '#cccccc',
      padding: '0'
    } : {
      maxHeight: config.maxHeight,
      overflowY: 'auto',
      marginBottom: footer ? '0' : '1rem',
      color: '#374151',
      paddingRight: '0.5rem' // Space for scrollbar
    });

    if (typeof content === 'string') {
      bodyContainer.text(content);
    } else if (content && typeof content.get === 'function') {
      bodyContainer.child(content);
    } else if (content instanceof Node) {
      bodyContainer.child(el('div').child([content]));
    } else {
      bodyContainer.text('');
    }

    // Use custom footer or default buttons
    let footerElement;
    if (footer) {
      footerElement = footer;
    } else if (buttons.length) {
      const actionButtons = buttons.map((button) => {
        return el('button')
          .text(button.text || 'Action')
          .css({
            padding: '0.7rem 1rem',
            borderRadius: '0.75rem',
            border: button.variant === 'outline' ? '1px solid #d1d5db' : 'none',
            backgroundColor: button.variant === 'secondary' ? '#6b7280' : button.variant === 'outline' ? '#fff' : '#1d4ed8',
            color: button.variant === 'outline' ? '#111' : '#fff',
            cursor: 'pointer',
          })
          .click(() => {
            if (button.onClick) button.onClick();
            if (button.closeOnClick !== false) closeModal();
          });
      });
      footerElement = el('div').css({ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }).child(actionButtons);
    } else {
      footerElement = el('button')
        .text('Close')
        .css({
          padding: '0.7rem 1rem',
          borderRadius: '0.75rem',
          border: 'none',
          backgroundColor: '#1d4ed8',
          color: '#fff',
          cursor: 'pointer',
        })
        .click(closeModal);
    }

    const children = isPalette
      ? [bodyContainer]
      : [
        el('div').css({ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }).child([
          el('div').child([
            title ? el('h3').css({ margin: '0 0 0.75rem', fontSize: '1.2rem' }).text(title) : el('span'),
          ]),
          el('button')
            .text('×')
            .css({
              background: 'transparent',
              border: 'none',
              color: '#111',
              fontSize: '1.2rem',
              cursor: 'pointer',
              lineHeight: '1',
            })
            .click(closeModal),
        ]),
        bodyContainer
      ];

    // Add footer if exists
    if (footerElement) {
      children.push(footerElement);
    }

    const dialogBox = el('div')
      .css(isPalette ? {
        width: config.width,
        maxHeight: config.maxHeight,
        backgroundColor: '#252526',
        borderRadius: '8px',
        border: '1px solid #454545',
        padding: '0',
        boxShadow: '0 16px 48px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.04)',
        color: '#cccccc',
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      } : {
        width: config.width,
        maxHeight: config.maxHeight,
        backgroundColor: '#fff',
        borderRadius: '1rem',
        padding: '1.25rem',
        boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
        color: '#111',
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column'
      })
      .child(children)
      .get();

    dialogContainer.innerHTML = '';
    dialogContainer.appendChild(dialogBox);
    dialogContainer.style.display = 'flex';
  }

  function showConfirm(options = {}) {
    if (!dialogContainer) createDialogContainer();

    const title = options.title || 'Confirm';
    const message = options.message || '';
    const confirmText = options.confirmText || 'OK';
    const cancelText = options.cancelText || 'Cancel';
    const onConfirm = typeof options.onConfirm === 'function' ? options.onConfirm : () => {};
    const onCancel = typeof options.onCancel === 'function' ? options.onCancel : () => {};
    const dismissible = options.dismissible !== false;

    currentConfirmOptions = { dismissible };

    const dialogBox = el('div')
      .css({
        width: 'min(95%, 420px)',
        backgroundColor: '#fff',
        borderRadius: '1rem',
        padding: '1.25rem',
        boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
        color: '#111',
        pointerEvents: 'auto',
      })
      .child([
        el('h3').css({ margin: '0 0 0.75rem', fontSize: '1.2rem' }).text(title),
        el('p').css({ margin: '0 1px 1.35rem', lineHeight: '1.6', color: '#4b5563' }).text(message),
        el('div').css({ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }).child([
          el('button')
            .text(cancelText)
            .css({
              padding: '0.7rem 1rem',
              borderRadius: '0.75rem',
              border: '1px solid #d1d5db',
              backgroundColor: '#fff',
              color: '#111',
              cursor: 'pointer',
            })
            .click(() => {
              closeConfirm();
              onCancel();
            }),
          el('button')
            .text(confirmText)
            .css({
              padding: '0.7rem 1rem',
              borderRadius: '0.75rem',
              border: 'none',
              backgroundColor: '#1d4ed8',
              color: '#fff',
              cursor: 'pointer',
            })
            .click(() => {
              closeConfirm();
              onConfirm();
            }),
        ]),
      ])
      .get();

    dialogContainer.innerHTML = '';
    dialogContainer.appendChild(dialogBox);
    dialogContainer.style.display = 'flex';
  }

  function notify(options = {}) {
    if (typeof options === 'string') {
      options = { message: options };
    }
    const title = options.title;
    const message = options.message || options.text || '';
    return showToast(message, options.type ? { ...options } : { ...options, type: 'info', title });
  }

  function menuDropdownId(item, parentPrefix) {
    const slug = String(item.nameKey || item.name || 'menu')
      .toLowerCase()
      .replace(/\s+/g, '-');
    return parentPrefix ? `${parentPrefix}__${slug}` : `dropdown-${slug}`;
  }

  function menuNodeHasActivePage(node, page) {
    if (node.page === page) return true;
    if (node.children?.length) {
      return node.children.some((child) => menuNodeHasActivePage(child, page));
    }
    return false;
  }

  function syncSidebarDropdowns() {
    openDropdowns.clear();
    const page = currentPage;

    function walk(items, parentPrefix) {
      (items || []).forEach((item) => {
        if (!item.children?.length) return;
        const id = menuDropdownId(item, parentPrefix || '');
        if (item.children.some((child) => menuNodeHasActivePage(child, page))) {
          if (parentPrefix) openDropdowns.add(parentPrefix);
          openDropdowns.add(id);
        }
        walk(item.children, id);
      });
    }

    sideMenus.forEach((item) => {
      if (!item.children?.length) return;
      const parentId = menuDropdownId(item);
      if (item.children.some((child) => menuNodeHasActivePage(child, page))) {
        openDropdowns.add(parentId);
      }
      walk(item.children, parentId);
    });
  }

  function resolveMenuName(item) {
    if (item.nameKey && window.i18n && typeof window.i18n.t === 'function') {
      return window.i18n.t(item.nameKey);
    }
    return item.name || '';
  }

  // Ratakan sideMenus (termasuk children bersarang) jadi list datar untuk pencarian.
  function flattenSideMenuItems() {
    const rbacRole = effectiveRoleForRbac();
    const filterByRole = (item) => filterSideMenuByRole(item, rbacRole);
    const out = [];

    function walk(items, groupPath, groupIcon) {
      items.filter(filterByRole).forEach((item) => {
        const name = resolveMenuName(item);
        if (item.children?.length) {
          walk(
            item.children,
            groupPath ? `${groupPath} › ${name}` : name,
            item.icon || groupIcon
          );
          return;
        }
        if (!item.page) return;
        out.push({
          label: name,
          group: groupPath || '',
          icon: item.icon || groupIcon || 'fas fa-circle',
          page: item.page
        });
      });
    }

    sideMenus.filter(filterByRole).forEach((item) => {
      if (item.children?.length) {
        walk(item.children, resolveMenuName(item), item.icon);
      } else if (item.page) {
        out.push({
          label: resolveMenuName(item),
          group: '',
          icon: item.icon || 'fas fa-circle',
          page: item.page
        });
      }
    });
    return out;
  }

  function scoreMenuSearchItem(item, term) {
    if (!term) return 1;
    const label = String(item.label || '').toLowerCase();
    const group = String(item.group || '').toLowerCase();
    if (label.startsWith(term)) return 120;
    if (label.includes(term)) return 90;
    if (group.startsWith(term)) return 70;
    if (group.includes(term)) return 50;
    return 0;
  }

  function buildMenuSearchHighlightedLabel(label, term) {
    const wrap = el('span').css({ color: '#e8e8e8', fontWeight: '500' });
    const text = String(label || '');
    if (!term) {
      wrap.text(text);
      return wrap;
    }
    const lower = text.toLowerCase();
    const idx = lower.indexOf(term);
    if (idx === -1) {
      wrap.text(text);
      return wrap;
    }
    if (idx > 0) wrap.child(el('span').text(text.slice(0, idx)));
    wrap.child(el('span').text(text.slice(idx, idx + term.length)).css({
      color: '#4fc1ff',
      fontWeight: '700',
      textDecoration: 'underline',
      textUnderlineOffset: '2px'
    }));
    if (idx + term.length < text.length) {
      wrap.child(el('span').text(text.slice(idx + term.length)));
    }
    return wrap;
  }

  function buildPaletteKbd(text) {
    return el('kbd').text(text).css({
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: '1.35rem',
      padding: '0.1rem 0.35rem',
      borderRadius: '4px',
      border: '1px solid #555',
      background: '#3c3c3c',
      color: '#cccccc',
      fontSize: '0.68rem',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      lineHeight: '1.2',
      boxShadow: '0 1px 0 rgba(0,0,0,0.25)'
    });
  }

  function getMenuSearchShortcutLabel() {
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');
    // Ctrl+Shift+P tidak bisa di Firefox (reserved: Private Window). Pakai Ctrl+K seperti command palette web.
    return isMac ? '⌘K' : 'Ctrl+K';
  }

  function isTypingInEditableField(target) {
    if (!target) return false;
    const tag = String(target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return Boolean(target.isContentEditable);
  }

  function shouldOpenMenuSearchFromKeyboard(e) {
    if (shouldHideSidebarForPage()) return false;
    if (isTypingInEditableField(e.target)) return false;
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    if (!isCtrlOrCmd || e.shiftKey || e.altKey) return false;
    return (e.key || '').toLowerCase() === 'k';
  }

  // Modal pencarian menu — gaya Quick Open VS Code (Ctrl+K / ⌘K).
  function openMenuSearchModal() {
    const items = flattenSideMenuItems();
    if (!items.length) {
      showToast('Belum ada menu yang bisa dicari.', { type: 'info' });
      return;
    }

    const PALETTE = {
      border: '#3c3c3c',
      textMuted: '#858585',
      selectionBg: '#04395e',
      selectionBorder: '#007fd4'
    };

    let selectedIndex = 0;
    let currentResults = [];

    const statusEl = el('span').text(`${items.length} menu`).css({
      color: PALETTE.textMuted,
      fontSize: '0.72rem'
    });

    const inputEl = el('input')
      .attr('type', 'text')
      .attr('placeholder', 'Ketik nama menu…')
      .attr('autocomplete', 'off')
      .attr('spellcheck', 'false')
      .css({
        width: '100%',
        padding: '0.85rem 0.85rem 0.85rem 2.35rem',
        border: 'none',
        outline: 'none',
        background: 'transparent',
        color: '#f3f3f3',
        fontSize: '0.9375rem',
        fontFamily: 'inherit',
        boxSizing: 'border-box'
      });

    const searchRow = el('div').css({
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      borderBottom: `1px solid ${PALETTE.border}`,
      background: '#2d2d2d'
    }).child([
      el('i').class('fas fa-search').css({
        position: 'absolute',
        left: '0.85rem',
        top: '50%',
        transform: 'translateY(-50%)',
        color: '#858585',
        fontSize: '0.85rem',
        pointerEvents: 'none'
      }),
      inputEl
    ]);

    const listEl = el('div').css({
      display: 'flex',
      flexDirection: 'column',
      maxHeight: 'min(52vh, 320px)',
      overflowY: 'auto',
      overflowX: 'hidden',
      padding: '0.25rem 0'
    });

    function applySelectionHighlight() {
      if (!listEl.el) return;
      const rows = listEl.el.querySelectorAll('[data-menu-search-row]');
      rows.forEach((row, idx) => {
        const selected = idx === selectedIndex;
        row.style.background = selected ? PALETTE.selectionBg : 'transparent';
        row.style.boxShadow = selected ? `inset 0 0 0 1px ${PALETTE.selectionBorder}` : 'none';
      });
      const active = rows[selectedIndex];
      if (active && typeof active.scrollIntoView === 'function') {
        active.scrollIntoView({ block: 'nearest' });
      }
    }

    function openResult(item) {
      if (!item) return;
      closeModal();
      layout.navigate(item.page);
    }

    function buildResultRow(item, index) {
      const row = el('button')
        .attr('type', 'button')
        .attr('data-menu-search-row', '1')
        .css({
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          padding: '0.45rem 0.85rem',
          border: 'none',
          borderRadius: '0',
          background: 'transparent',
          color: '#cccccc',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: '0.8125rem',
          lineHeight: '1.35',
          boxSizing: 'border-box'
        })
        .child([
          el('i').class(item.icon).css({
            width: '18px',
            textAlign: 'center',
            color: '#569cd6',
            fontSize: '0.8rem',
            flexShrink: '0'
          }),
          el('div').css({
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flex: '1',
            minWidth: 0
          }).child([
            el('span').css({
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: '1',
              minWidth: 0
            }).child([buildMenuSearchHighlightedLabel(item.label, String(inputEl.el?.value || '').trim().toLowerCase())]),
            item.group
              ? el('span').text(item.group).css({
                color: '#858585',
                fontSize: '0.72rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flexShrink: '0',
                maxWidth: '42%'
              })
              : null
          ])
        ]);

      row.on('mouseenter', () => {
        selectedIndex = index;
        applySelectionHighlight();
      });
      row.click(() => openResult(item));
      return row;
    }

    function render(q, preserveSelection) {
      const term = String(q || '').trim().toLowerCase();
      const filtered = !term
        ? items.slice()
        : items.filter((i) => scoreMenuSearchItem(i, term) > 0);

      filtered.sort((a, b) => {
        const diff = scoreMenuSearchItem(b, term) - scoreMenuSearchItem(a, term);
        if (diff !== 0) return diff;
        return String(a.label).localeCompare(String(b.label), 'id');
      });

      currentResults = filtered.slice(0, 50);
      if (preserveSelection) {
        selectedIndex = Math.min(selectedIndex, Math.max(0, currentResults.length - 1));
      } else {
        selectedIndex = 0;
      }

      listEl.empty();
      statusEl.text(
        !term
          ? `${items.length} menu`
          : currentResults.length
            ? `${currentResults.length} hasil`
            : 'Tidak ada hasil'
      );

      if (!currentResults.length) {
        listEl.child(el('div').css({
          padding: '2rem 1rem',
          textAlign: 'center',
          color: '#858585',
          fontSize: '0.8125rem'
        }).child([
          el('i').class('fas fa-folder-open').css({ display: 'block', fontSize: '1.35rem', marginBottom: '0.65rem', opacity: '0.45' }),
          el('span').text(term ? `Tidak ada menu untuk "${term}"` : 'Tidak ada menu')
        ]));
        listEl.get();
        return;
      }

      currentResults.forEach((item, index) => {
        listEl.child(buildResultRow(item, index));
      });
      listEl.get();
      applySelectionHighlight();
    }

    inputEl.on('input', () => render(inputEl.el.value, false));
    inputEl.on('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!currentResults.length) return;
        selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
        applySelectionHighlight();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!currentResults.length) return;
        selectedIndex = Math.max(selectedIndex - 1, 0);
        applySelectionHighlight();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        openResult(currentResults[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    });

    const footer = el('div').css({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.75rem',
      padding: '0.45rem 0.85rem',
      borderTop: `1px solid ${PALETTE.border}`,
      background: '#2d2d2d',
      color: '#858585',
      fontSize: '0.72rem',
      flexWrap: 'wrap'
    }).child([
      el('div').css({ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }).child([
        buildPaletteKbd('↑'),
        buildPaletteKbd('↓'),
        el('span').text('navigasi'),
        el('span').text('·').css({ opacity: '0.5' }),
        buildPaletteKbd('↵'),
        el('span').text('buka'),
        el('span').text('·').css({ opacity: '0.5' }),
        buildPaletteKbd('Esc'),
        el('span').text('tutup')
      ]),
      statusEl
    ]);

    const body = el('div').css({ display: 'flex', flexDirection: 'column' }).child([searchRow, listEl]);
    render('');

    showCustomModal({
      variant: 'palette',
      content: body,
      footer,
      dismissible: true
    });

    setTimeout(() => {
      try {
        inputEl.el.focus();
        inputEl.el.select();
      } catch (_) { /* ignore */ }
    }, 50);
  }

  // Tombol pencarian menu yang di-mount di atas daftar sidebar.
  function buildSidebarBrand() {
    return el('div').class('sidebar-brand').child([
      el('div').class('sidebar-brand-icon').child(el('i').class('fas fa-globe-asia')),
      el('div').class('sidebar-brand-text').child([
        el('span').class('sidebar-brand-title').text(navbarTitleText || 'PJTKI Bio'),
        el('span').class('sidebar-brand-sub').text('Manajemen TKI')
      ])
    ]);
  }

  function buildSidebarIconWrap(iconClass) {
    return el('span').class('sidebar-icon-wrap').child(
      el('i').class(iconClass || 'fas fa-circle')
    );
  }

  function buildSidebarNavItem({ label, icon, isActive, onClick }) {
    return el('a')
      .class('sidebar-item' + (isActive ? ' active' : ''))
      .click(onClick)
      .child([
        buildSidebarIconWrap(icon),
        el('span').class('sidebar-item-label').text(label)
      ]);
  }

  function buildMenuSearchButton() {
    const shortcut = getMenuSearchShortcutLabel();
    return el('button')
      .attr('type', 'button')
      .class('sidebar-search-btn')
      .attr('title', `Cari menu (${shortcut})`)
      .child([
        el('i').class('fas fa-search').css({ fontSize: '12px', opacity: '0.85' }),
        el('span').text('Cari menu…').css({ flex: '1', opacity: '0.92' }),
        el('span').class('sidebar-search-kbd').text(shortcut)
      ])
      .click(() => openMenuSearchModal());
  }

  layout.openMenuSearch = openMenuSearchModal;

  function renderSideMenu() {
    if (!connector.sidebar) return;
    const activePage = currentPage || '/';

    const rbacRole = effectiveRoleForRbac();
    const filterByRole = (item) => filterSideMenuByRole(item, rbacRole);

    const menuChildren = sideMenus.filter(filterByRole).map((item) => {
      if (item.children && item.children.length > 0) {
        const filteredItem = { ...item, children: item.children.filter(filterByRole) };
        if (filteredItem.children.length === 0) return null;
        return createSidebarDropdown(filteredItem);
      }

      const isActive = activePage === item.page || (item.page !== '/' && activePage.startsWith(item.page + '/'));
      return buildSidebarNavItem({
        label: resolveMenuName(item),
        icon: item.icon,
        isActive,
        onClick: () => {
          hideMobileSidebar();
          layout.navigate(item.page);
        }
      });
    }).filter(Boolean);

    const navWrap = el('div').class('sidebar-nav');
    if (menuChildren.length) {
      navWrap.child(el('div').class('sidebar-nav-label').text('Navigasi'));
      menuChildren.forEach((node) => navWrap.child(node));
    }

    el(connector.sidebar).empty().child([
      buildSidebarBrand(),
      buildMenuSearchButton(),
      navWrap
    ]).get();

    // Don't call updateSidebarVisibility() here — updateLayoutVisibility() handles it
  }

  function buildSidebarLeafItem(child, extraClass) {
    const isActive = currentPage === child.page;
    return el('a')
      .class('sidebar-dropdown-item' + (isActive ? ' active' : '') + (extraClass ? ` ${extraClass}` : ''))
      .click(() => {
        hideMobileSidebar();
        layout.navigate(child.page);
      })
      .child([
        child.icon
          ? el('i').class(child.icon).css({ fontSize: '11px', width: '14px', textAlign: 'center', opacity: '0.85' })
          : el('span').class('sidebar-sub-dot'),
        el('span').class('sidebar-item-label').text(resolveMenuName(child))
      ]);
  }

  function createSidebarNestedDropdown(item, parentPrefix) {
    const dropdownId = menuDropdownId(item, parentPrefix);
    const hasActiveChild = item.children.some((child) => menuNodeHasActivePage(child, currentPage));
    if (hasActiveChild && !openDropdowns.has(dropdownId)) {
      openDropdowns.add(dropdownId);
    }
    let isOpen = openDropdowns.has(dropdownId);

    const container = el('div').class('sidebar-nested-dropdown');

    const menuContainer = el('div')
      .id(dropdownId)
      .class('sidebar-dropdown-menu sidebar-dropdown-menu-nested' + (isOpen ? ' open' : ''))
      .child(
        item.children.map((child) => {
          if (child.children?.length) {
            return createSidebarNestedDropdown(child, dropdownId);
          }
          return buildSidebarLeafItem(child, 'sidebar-dropdown-item-nested');
        })
      );

    const chevronIcon = el('i')
      .class('fas fa-chevron-right sidebar-chevron sidebar-chevron-nested')
      .css({ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: '10px' });

    const toggle = el('a')
      .class('sidebar-dropdown-item sidebar-dropdown-item-nested sidebar-nested-toggle' + (hasActiveChild ? ' active' : ''))
      .click((e) => {
        e.preventDefault();
        e.stopPropagation();
        isOpen = !isOpen;
        if (isOpen) openDropdowns.add(dropdownId);
        else openDropdowns.delete(dropdownId);
        if (isOpen) menuContainer.class('open');
        else menuContainer.removeClass('open');
        chevronIcon.css({ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' });
      })
      .child([
        item.icon
          ? el('i').class(item.icon).css({ fontSize: '10px', width: '14px', textAlign: 'center', opacity: '0.85' })
          : el('span').class('sidebar-sub-dot'),
        el('span').class('sidebar-item-label').text(resolveMenuName(item)).css({ flex: 1 }),
        chevronIcon
      ]);

    container.child([toggle, menuContainer]);
    return container;
  }

  function createSidebarDropdown(item) {
    const dropdownId = menuDropdownId(item);
    const hasActiveChild = item.children.some((child) => menuNodeHasActivePage(child, currentPage));
    if (hasActiveChild && !openDropdowns.has(dropdownId)) {
      openDropdowns.add(dropdownId);
    }
    let isOpen = openDropdowns.has(dropdownId);

    const container = el('div').class('sidebar-dropdown-container');

    const menuContainer = el('div')
      .id(dropdownId)
      .class('sidebar-dropdown-menu' + (isOpen ? ' open' : ''))
      .child(
        item.children.map((child) => {
          if (child.children?.length) {
            return createSidebarNestedDropdown(child, dropdownId);
          }
          return buildSidebarLeafItem(child);
        })
      );

    const chevronIcon = el('i')
      .class('fas fa-chevron-right sidebar-chevron')
      .css({ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' });

    const toggle = el('a')
      .class('sidebar-item sidebar-dropdown-toggle' + (hasActiveChild ? ' active' : ''))
      .click(() => {
        isOpen = !isOpen;
        if (isOpen) {
          openDropdowns.clear();
          openDropdowns.add(dropdownId);
        } else {
          openDropdowns.delete(dropdownId);
        }
        if (isOpen) menuContainer.class('open');
        else menuContainer.removeClass('open');
        chevronIcon.css({ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' });
      })
      .child([
        el('div').css({ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0, flex: 1 }).child([
          buildSidebarIconWrap(item.icon),
          el('span').class('sidebar-item-label').text(resolveMenuName(item))
        ]),
        chevronIcon
      ]);

    container.child([toggle, menuContainer]);
    return container;
  }

  function getThemeStyleCSS() {
    const theme = themes[currentTheme] || themes.default;
    const lightTheme = isColorLight(theme.navbar.backgroundColor) || isColorLight(theme.sidebar.backgroundColor);

    if (lightTheme) {
      return `
        .dropdown-item:hover {
          background-color: #e0e0e0;
          color: #333 !important;
        }
        .sidebar-item:hover {
          background-color: rgba(0, 0, 0, 0.05);
        }
        .sidebar-dropdown-item:hover {
          background-color: rgba(0, 0, 0, 0.05);
          color: #333 !important;
        }
      `;
    }

    return `
      .dropdown-item:hover {
        background-color: rgb(216, 195, 195);
        color: #000 !important;
      }
      .sidebar-item:hover {
        background-color: rgba(255, 255, 255, 0.1);
      }
      .sidebar-dropdown-item:hover {
        background-color: rgba(255, 255, 255, 0.1);
        color: #fff !important;
      }
    `;
  }

  const sidebarSwitchCSS = `
    .sidebar-switch {
      display: inline-flex;
      align-items: center;
      justify-content: flex-start;
      width: 48px;
      height: 26px;
      padding: 3px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.35);
      background: rgba(255,255,255,0.12);
      cursor: pointer;
      transition: background-color 0.2s ease, border-color 0.2s ease;
    }
    .sidebar-switch.active {
      background: rgba(255,255,255,0.3);
      border-color: rgba(255,255,255,0.55);
    }
    .sidebar-switch:hover {
      border-color: rgba(255,255,255,0.65);
    }
    .sidebar-switch-handle {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.18);
      transition: transform 0.2s ease;
    }
    .sidebar-switch.active .sidebar-switch-handle {
      transform: translateX(22px);
    }
    @media (max-width: 768px) {
      .sidebar-switch { display: none !important; }
    }
  `;

  // Add CSS untuk hover dropdown
  const styleEl = el('style').textContent(`${sidebarDropdownCSS}
${sidebarSwitchCSS}
${getThemeStyleCSS()}`).attr('data-theme-style', 'true').get();
  document.head.appendChild(styleEl);

  let isMobile = window.innerWidth <= 768 ? true : false;
  let sidebarVisible = false;
  let dropdownVisible = false;

  const connector = {};

  let cssLayouting = {
    desktop: {
      container: {
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        minHeight: '100dvh',
        maxHeight: '100dvh',
      },
      navBar: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 1rem',
        backgroundColor: 'rgb(15, 23, 42)',
        color: '#fff',
        fontSize: '1.2rem',
        fontWeight: 'bold',
        height: '50px',
        verticalAlign: 'middle',
        lineHeight: '50px',
      },
      content: {
        flex: '1',
        display: 'flex',
        flexDirection: 'row',
        overflow: 'hidden',
        minHeight: '0',
      },
      sidebar: {
        width: '268px',
        backgroundColor: 'rgb(15, 23, 42)',
        padding: '1rem',
        overflow: 'auto',
        display: 'block',
      },
      pagecontent: {
        flex: '1',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        padding: '10px',
        minHeight: '0',
        backgroundColor: '#f0f4f7',
      },
      userDropdown: {
        position: 'relative',
      },
      dropdownMenu: {
        display: 'none',
        position: 'absolute',
        top: '100%',
        right: '0',
        backgroundColor: '#fff',
        color: '#333',
        width: '120px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        borderRadius: '4px',
        zIndex: '1000',
        whiteSpace: 'nowrap',
        padding: '8px 12px',
        margin: '0',
      },
      dropdownMenuOpen: {
        display: 'block',
        position: 'absolute',
        top: '100%',
        right: '0',
        backgroundColor: '#fff',
        color: '#333',
        width: '120px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        borderRadius: '4px',
        zIndex: '1000',
        whiteSpace: 'nowrap',
        padding: '8px 0',
        margin: '0',
      },
      dropdownItem: {
        display: 'block',
        padding: '4px 12px',
        color: '#333',
        cursor: 'pointer',
        fontSize: '14px',
        lineHeight: '1.5',
        textDecoration: 'none',
      },
      dropdownItemHover: {
        backgroundColor: '#f0f0f0',
      },
    },
    mobile: {
      container: {
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        minHeight: '100dvh',
        maxHeight: '100dvh',
      },
      navBar: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 1rem',
        backgroundColor: 'rgb(15, 23, 42)',
        color: '#fff',
        fontSize: '1.2rem',
        fontWeight: 'bold',
        height: '50px',
        verticalAlign: 'middle',
        lineHeight: '50px',
      },
      content: {
        flex: '1',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: '0',
      },
      sidebar: {
        position: 'fixed',
        zIndex: '1000',
        top: '50px',
        left: '0',
        right: '0',
        bottom: '0',
        width: '100%',
        backgroundColor: 'rgb(15, 23, 42)',
        padding: '0.75rem',
        overflow: 'auto',
        display: 'none',
        flexDirection: 'column',
        boxSizing: 'border-box',
        boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
      },
      sidebarOpen: {
        position: 'fixed',
        zIndex: '1000',
        top: '50px',
        left: '0',
        right: '0',
        bottom: '0',
        width: '100%',
        backgroundColor: 'rgb(15, 23, 42)',
        padding: '0.75rem',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
      },
      pagecontent: {
        flex: '1',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        padding: '10px',
        minHeight: '0',
        backgroundColor: '#f0f4f7',
      },
      userDropdown: {
        position: 'relative',
      },
      dropdownMenu: {
        display: 'none',
        position: 'absolute',
        top: '100%',
        right: '0',
        backgroundColor: '#fff',
        color: '#333',
        width: '120px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        borderRadius: '4px',
        zIndex: '1000',
        whiteSpace: 'nowrap',
        padding: '8px 12px',
        margin: '0',
      },
      dropdownMenuOpen: {
        display: 'block',
        position: 'absolute',
        top: '100%',
        right: '0',
        backgroundColor: '#fff',
        color: '#333',
        width: '120px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        borderRadius: '4px',
        zIndex: '1000',
        whiteSpace: 'nowrap',
        padding: '8px 0',
        margin: '0',
      },
      dropdownItem: {
        display: 'block',
        padding: '4px 12px',
        color: '#333',
        cursor: 'pointer',
        fontSize: '14px',
        lineHeight: '1.5',
        textDecoration: 'none',
      },
      dropdownItemHover: {
        backgroundColor: '#f0f0f0',
      },
    }
  }

  let menuItem = [
    {
      name: 'Menu 1',
      url: '#',
    }
    ,{
      name: 'Menu 2',
      url: '#',
    }
    ,{
      name: 'Menu 3',
      url: '#',
    }
  ];

  let sidemenuItem = [
    {
      name: 'Menu 1',
      icon: 'fas fa-home',
      url: '#',
    }
    ,{
      name: 'Menu 2',
      url: '#',
    }
    ,{
      name: 'Menu 3',
      url: '#',
    }
  ];
  
  let layoutContainer = el('div')
  .link(connector, 'container')
  .id('layout-container')
  .css({ ...cssLayouting[isMobile ? 'mobile' : 'desktop'].container, visibility: 'hidden' });

  let navBar = el('nav')
  .link(connector, 'navbar')
  .id('nav-bar')
  .css(cssLayouting[isMobile ? 'mobile' : 'desktop'].navBar)
  .child([
    el('div').css({ display: 'flex', alignItems: 'center', gap: '0.75rem' }).child([
      el('a').link(connector, 'menuToggle').css({ display: isMobile ? 'inline' : 'none', paddingRight: '0.5rem', cursor: 'pointer' }).child(
        el('i').class('fas fa-bars')
      ).click(() => {
        sidebarVisible = !sidebarVisible;
        const sidebarCss = sidebarVisible ? cssLayouting.mobile.sidebarOpen : cssLayouting.mobile.sidebar;
        el(connector.sidebar).css(sidebarCss).get();
      }),
      el('a').link(connector, 'navbarBackButton').css({ display: 'none', paddingRight: '0.5rem', cursor: 'pointer', color: cssLayouting[isMobile ? 'mobile' : 'desktop'].navBar.color }).child(
        el('i').class('fas fa-arrow-left')
      ).click(() => {
        layout.navigate('/');
      }),
      el('a').link(connector, 'navbarTitle').size('16px').css({ color: cssLayouting[isMobile ? 'mobile' : 'desktop'].navBar.color, cursor: 'pointer' }).text(navbarTitleText).click(() => {
        layout.navigate('/');
      }),
      el('div').link(connector, 'sidebarHideSwitchSlot'),
    ]),
    el('div').link(connector, 'navbarActions').css({ display: 'flex', alignItems: 'center', gap: '0.75rem' }).child([])
  ]);


  layoutContainer.child(navBar);

  layoutContainer.child([
    el('div').link(connector, 'content').css(cssLayouting[isMobile ? 'mobile' : 'desktop'].content)
    .child([
      el('div').css(cssLayouting[isMobile ? 'mobile' : 'desktop'].sidebar).class('layout-sidebar').link(connector, 'sidebar')
      .child([]),
      el('div').css(cssLayouting[isMobile ? 'mobile' : 'desktop'].pagecontent).link(connector, 'pagecontent')
    ])
  ]);

  window.addEventListener('resize', () => {
    const wasMobile = isMobile;
    isMobile = window.innerWidth <= 768 ? true : false;
    
    if (wasMobile !== isMobile) {
      el(connector.container).css(cssLayouting[isMobile ? 'mobile' : 'desktop'].container).get();
      el(connector.content).css(cssLayouting[isMobile ? 'mobile' : 'desktop'].content).get();
      
      // Toggle hamburger menu visibility
      el(connector.menuToggle).css({ display: isMobile ? 'inline' : 'none' }).get();

      if (connector.sidebarHideSwitchSlot) {
        connector.sidebarHideSwitchSlot.style.display = isMobile ? 'none' : 'block';
      }
      renderNavbar();
      updateLayoutVisibility();
      
      el(connector.pagecontent).css(getPageContentStyle()).get();
    }
  });

  // Close dropdown saat click di luar area
  document.addEventListener('click', (e) => {
    if (notificationPanelOpen && connector.notificationWrap && !connector.notificationWrap.contains(e.target)) {
      closeNotificationPanel();
    }
    if (dropdownVisible && !connector.userDropdown?.contains(e.target)) {
      dropdownVisible = false;
      el(connector.dropdownMenu).css(cssLayouting[isMobile ? 'mobile' : 'desktop'].dropdownMenu).get();
    }
  });

  // Shortcut global: Ctrl+K / ⌘K (Firefox memblokir Ctrl+Shift+P untuk Private Window).
  document.addEventListener('keydown', (e) => {
    if (!shouldOpenMenuSearchFromKeyboard(e)) return;
    e.preventDefault();
    e.stopPropagation();
    openMenuSearchModal();
  }, true);

  // Handle hash change
  window.addEventListener('hashchange', () => {
    const rawHash = window.location.hash.slice(1) || '/';
    const hashOnly = normalizePagePath(rawHash);
    const hash = resolvePageRoute(hashOnly);
    if (pages[hash]) {
      currentPage = hash;
      renderPage(hash);
      syncSidebarDropdowns();
      renderSideMenu();
      renderNavbar();
      updateLayoutVisibility();
      return;
    }
    if (isCrudDynamicRoute(hashOnly)) {
      triggerCrudDynamicRoute(rawHash);
    }
  });

  app.appendChild(layoutContainer.get());
  createToastContainer();
  createDialogContainer();
  createSidebarHoverArea();

  if (connector.sidebar) {
    connector.sidebar.addEventListener('mouseenter', () => {
      showDesktopSidebarHover();
    });
    connector.sidebar.addEventListener('mouseleave', () => {
      hideDesktopSidebarHoverSoon();
    });
  }

  // expose to global
  if (typeof window !== 'undefined') {
    window.addNavbar = layout.addNavbar;
    window.setLayoutTheme = layout.setTheme;
    window.setCustomTheme = layout.setCustomTheme;
  }

  return layout;

}));
