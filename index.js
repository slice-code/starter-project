// Admin Starter — JSON-Driven UI Framework
// schema/*.json  → database DDL
// appjson/*.json → UI pages & CRUD configs

const API_BASE = window.location.origin;

let appBranding = {
  appName: 'Admin Starter',
  appTitle: 'Admin Starter',
  loginSubtitle: 'Masuk ke panel administrasi.',
  showLoginDemo: false,
  adminEmail: ''
};

async function loadAppBranding() {
  try {
    const response = await fetch(`${API_BASE}/api/app-config`);
    const result = await response.json();
    if (result.success && result.data) {
      appBranding = { ...appBranding, ...result.data };
      if (appBranding.appTitle) document.title = appBranding.appTitle;
    }
  } catch (e) {
    console.warn('Branding tidak dimuat:', e);
  }
  return appBranding;
}

function normalizeMenuRole(role) {
  const r = String(role || '').trim().toLowerCase();
  return r === 'owner' ? 'super_admin' : r;
}

const OWNER_ONLY_PATHS = new Set(['/users', '/datacabang', '/profil-perusahaan', '/menu-role-manager']);

const FEATURE_SCRIPTS = {
  settingsOwner: [
    './core/menu-role-manager.js?v=20260520a',
    './core/company-profile-settings.js?v=202605201600'
  ],
  studio: [
    './core/studio-crud-config.js?v=20260608a',
    './core/studio-preview.js?v=20260608a',
    './core/studio-crud-manager.js?v=20260608a',
    './core/studio-form-builder.js?v=20260608a',
    './core/studio-database-manager.js?v=20260608b',
    './core/studio-schema-designer.js?v=20260608b',
    './core/studio-field-presets.js?v=20260608a'
  ]
};

const STUDIO_SIDEBAR_CHILDREN = [
  { name: 'CRUD Manager', icon: 'fas fa-table', page: '/studio/crud-manager' },
  { name: 'Database Manager', icon: 'fas fa-database', page: '/studio/database-manager' },
  { name: 'Deploy History', icon: 'fas fa-history', page: '/studio/deploy-history' }
];

function menuHasPath(items, predicate) {
  for (const item of items || []) {
    if (item.page && predicate(item.page)) return true;
    if (item.children?.length && menuHasPath(item.children, predicate)) return true;
  }
  return false;
}

async function loadFeatureScripts(core, role) {
  if (typeof CoreScriptLoader === 'undefined') return;
  const menu = core.layoutConfig.sideMenu || [];
  const scripts = [];
  const push = (list) => scripts.push(...(list || []));
  const starts = (prefix) => menuHasPath(menu, (p) => String(p).startsWith(prefix));
  const r = normalizeMenuRole(role);

  if (r === 'super_admin' || r === 'studio_admin') push(FEATURE_SCRIPTS.settingsOwner);
  if (r === 'studio_admin' || r === 'super_admin' || starts('/studio/')) push(FEATURE_SCRIPTS.studio);

  await CoreScriptLoader.loadMany([...new Set(scripts)]);
}

function ensureStudioMenuSidebar(sideMenu, role) {
  const menuRole = normalizeMenuRole(role);
  if (!['super_admin', 'studio_admin'].includes(menuRole)) return sideMenu || [];
  const menu = [...(sideMenu || [])];
  const idx = menu.findIndex((it) => it.name === 'Studio');
  if (idx >= 0) {
    menu[idx] = { ...menu[idx], children: STUDIO_SIDEBAR_CHILDREN.map((c) => ({ ...c })) };
    return menu;
  }
  menu.push({ name: 'Studio', icon: 'fas fa-hammer', children: STUDIO_SIDEBAR_CHILDREN.map((c) => ({ ...c })) });
  return menu;
}

function ensureOwnerMenuSidebar(sideMenu, role) {
  const menuRole = normalizeMenuRole(role);
  if (menuRole === 'admin') {
    const out = [];
    for (const item of sideMenu || []) {
      const copy = { ...item };
      if (copy.page && OWNER_ONLY_PATHS.has(copy.page)) continue;
      if (copy.children?.length) {
        copy.children = copy.children.filter((c) => c.page && !OWNER_ONLY_PATHS.has(c.page));
        if (!copy.children.length && !copy.page) continue;
      } else if (!copy.page) continue;
      out.push(copy);
    }
    return out;
  }
  if (menuRole !== 'super_admin') return sideMenu || [];

  const menu = [...(sideMenu || [])];
  let group = menu.find(
    (it) => it.name === 'Pengaturan' || (it.children && it.children.some((c) => c.page === '/users'))
  );
  if (!group) {
    group = { name: 'Pengaturan', icon: 'fas fa-gear', children: [] };
    menu.push(group);
  }
  if (!group.children) group.children = [];
  if (!group.children.some((c) => c.page === '/profil-perusahaan')) {
    group.children.push({ name: 'Profil Perusahaan', icon: 'fas fa-building', page: '/profil-perusahaan', roles: ['super_admin'] });
  }
  if (!group.children.some((c) => c.page === '/menu-role-manager')) {
    group.children.push({ name: 'Menu & Role', icon: 'fas fa-sitemap', page: '/menu-role-manager', roles: ['super_admin'] });
  }
  group.children.sort((a, b) => {
    const order = { '/users': 1, '/datacabang': 2, '/profil-perusahaan': 3, '/menu-role-manager': 4 };
    return (order[a.page] || 99) - (order[b.page] || 99);
  });
  return ensureStudioMenuSidebar(menu, menuRole);
}

async function loadMenuConfig(core, roleHint) {
  try {
    const response = await fetch(`${API_BASE}/api/menu?t=${Date.now()}`, { credentials: 'include', cache: 'no-store' });
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Failed to load menu');

    const menuConfig = result.data;
    const menuRole = roleHint || (typeof CrmRbac !== 'undefined' && CrmRbac.getRole ? CrmRbac.getRole() : '');

    if (menuConfig.sideMenu) core.layoutConfig.sideMenu = ensureOwnerMenuSidebar(menuConfig.sideMenu, menuRole);
    if (menuConfig.menuPermissions) core.menuPermissions = menuConfig.menuPermissions;
    if (menuConfig.navbar) core.layoutConfig.navbar = menuConfig.navbar;
    if (menuConfig.theme) core.layoutConfig.theme = menuConfig.theme;
    if (menuConfig.navbarTitle) core.layoutConfig.navbarTitle = menuConfig.navbarTitle;
    if (menuConfig.app) {
      appBranding = { ...appBranding, ...menuConfig.app };
      if (appBranding.appTitle) document.title = appBranding.appTitle;
    }
    return menuConfig;
  } catch (error) {
    console.warn('Menu config fallback:', error);
    return null;
  }
}

function resetSessionForLogout(core) {
  if (core) {
    core._sessionRole = null;
    core.layoutConfig.sideMenu = [];
    core.menuPermissions = null;
    core._pageConfigCache = {};
    if (typeof PageLoader !== 'undefined' && PageLoader.resetCrudSchemaSessionState) {
      PageLoader.resetCrudSchemaSessionState(core);
    }
  }
  if (typeof layout.addSideMenu === 'function') layout.addSideMenu([]);
  if (typeof layout.setRole === 'function') layout.setRole(null);
  if (typeof layout.stopNotifications === 'function') layout.stopNotifications();
  if (window.adminApp) window.adminApp.user = null;
}

function refreshAuthenticatedNavbar(core) {
  if (!core || typeof layout === 'undefined') return false;
  if (typeof layout.addNavbar === 'function') layout.addNavbar(core.layoutConfig?.navbar || []);
  const role = core._sessionRole || (typeof CrmRbac !== 'undefined' && CrmRbac.getRole ? CrmRbac.getRole() : null);
  if (role && typeof layout.setRole === 'function') layout.setRole(role);
  return !!document.querySelector('#nav-bar .navbar-notif-wrap');
}

function ensureAuthenticatedNavbarRendered(core, maxAttempts = 60) {
  if (!core) return;
  let attempts = 0;
  const tick = () => {
    if (refreshAuthenticatedNavbar(core) || document.querySelector('#nav-bar .navbar-notif-wrap')) return;
    attempts += 1;
    if (attempts < maxAttempts) setTimeout(tick, 100);
  };
  tick();
}

async function bootstrapAuthenticatedApp(core, user) {
  const pagesReady = !!core._pagesBootstrapped;
  const role = user?.role || 'admin';

  if (typeof CrmRbac !== 'undefined') {
    CrmRbac.setSession(user);
    CrmRbac.setRole(role);
  }
  const effectiveRole = typeof CrmRbac !== 'undefined' && CrmRbac.getRole ? CrmRbac.getRole() : role;
  if (window.adminApp) window.adminApp.user = { ...user, role: effectiveRole };
  core._sessionRole = effectiveRole;
  if (typeof layout.setRole === 'function') layout.setRole(effectiveRole);

  await loadMenuConfig(core, effectiveRole);
  await loadFeatureScripts(core, effectiveRole);
  core.layoutConfig.sideMenu = ensureOwnerMenuSidebar(core.layoutConfig.sideMenu || [], effectiveRole);
  if (typeof PageLoader !== 'undefined' && PageLoader.resetCrudSchemaSessionState) {
    PageLoader.resetCrudSchemaSessionState(core);
  }
  layout.addSideMenu(core.layoutConfig.sideMenu?.length ? core.layoutConfig.sideMenu : []);
  if (core.layoutConfig.navbar) layout.addNavbar(core.layoutConfig.navbar);
  if (core.layoutConfig.theme) layout.setTheme(core.layoutConfig.theme);
  if (core.layoutConfig.navbarTitle) layout.setNavbarTitle(core.layoutConfig.navbarTitle);

  if (!pagesReady) {
    try {
      if (typeof PageLoader !== 'undefined') await PageLoader.bootstrap(core);
    } catch (err) {
      console.error('Gagal memuat halaman:', err);
    }
    loadHardcodedPages(core, user);
    core._pagesBootstrapped = true;
  }

  if (typeof registerStudioPages !== 'undefined') registerStudioPages({ force: true });
  if (typeof layout.initNotifications === 'function') layout.initNotifications();
  core._pagesBootstrapped = true;
}

window.addEventListener('DOMContentLoaded', async () => {
  await loadAppBranding();

  const currentHash = () => {
    let h = window.location.hash.replace('#', '') || '/';
    if (!h.startsWith('/')) h = '/' + h;
    return h;
  };

  let sessionUser = null;
  if (typeof CrmAuth !== 'undefined') {
    try { sessionUser = await CrmAuth.me(); } catch { sessionUser = null; }
  }
  if (!sessionUser && currentHash() !== '/login') window.location.hash = '#/login';

  const core = new CoreApp({
    api: { baseUrl: `${API_BASE}/api`, token: () => null },
    layout: { theme: 'teal', sideMenu: [], navbar: [] }
  });

  window.adminApp = { core, bootstrapAuthenticatedApp, resetSessionForLogout, refreshAuthenticatedNavbar, ensureAuthenticatedNavbarRendered, branding: appBranding };
  registerLoginPage(core);

  if (sessionUser) {
    if (typeof layout.showAuthBootstrapLoader === 'function') layout.showAuthBootstrapLoader('Memuat aplikasi...');
    try { await bootstrapAuthenticatedApp(core, sessionUser); } catch (err) { console.error(err); }
    if (typeof layout.hideAuthBootstrapLoader === 'function') layout.hideAuthBootstrapLoader();
    if (currentHash() === '/login') window.location.hash = '#/';
  }

  core.init();

  if (sessionUser) {
    if (core.layoutConfig.sideMenu?.length) {
      core.layoutConfig.sideMenu = ensureOwnerMenuSidebar(core.layoutConfig.sideMenu, core._sessionRole || sessionUser.role);
      layout.addSideMenu(core.layoutConfig.sideMenu);
    }
    ensureAuthenticatedNavbarRendered(core);
  }
});

function loadHardcodedPages(core, sessionUser) {
  if (sessionUser) {
    registerProfilePage(core);
    registerMenuRoleManagerPage(core, sessionUser);
    registerCompanyProfilePage(core, sessionUser);
  }
  registerLoginPage(core);
}

function registerMenuRoleManagerPage(core, sessionUser) {
  const role = typeof CrmRbac !== 'undefined' && CrmRbac.getRole ? CrmRbac.getRole() : sessionUser?.role;
  if (!['super_admin', 'studio_admin'].includes(normalizeMenuRole(role)) || typeof initMenuRoleManager !== 'function') return;
  layout.addPage({
    path: '/menu-role-manager',
    roles: ['super_admin', 'studio_admin'],
    pageContentPadding: '1.5rem',
    component: () => {
      const wrap = el('div').css({ maxWidth: '960px', margin: '0 auto' }).get();
      initMenuRoleManager(wrap);
      return wrap;
    }
  });
}

function registerCompanyProfilePage(core, sessionUser) {
  const role = typeof CrmRbac !== 'undefined' && CrmRbac.getRole ? CrmRbac.getRole() : sessionUser?.role;
  if (role !== 'super_admin' || typeof initCompanyProfileSettings !== 'function') return;
  layout.addPage({
    path: '/profil-perusahaan',
    roles: ['super_admin'],
    pageContentPadding: '1.5rem',
    component: () => {
      const wrap = el('div').css({ maxWidth: '960px', margin: '0 auto' }).get();
      initCompanyProfileSettings(wrap);
      return wrap;
    }
  });
}

function registerProfilePage(core) {
  layout.addPage({
    path: '/profile',
    pageContentPadding: '1.5rem',
    component: async () => {
      let user = typeof CrmAuth !== 'undefined' ? CrmAuth.getUser() : null;
      if (!user && typeof CrmAuth !== 'undefined') {
        try { user = await CrmAuth.me(); } catch { user = null; }
      }
      if (!user) {
        return el('div').css({ padding: '2rem', color: '#64748b' }).text('Sesi tidak valid.').get();
      }

      const roleLabels = { super_admin: 'Owner', admin: 'Administrator Cabang', studio_admin: 'Developer', viewer: 'Viewer' };
      const row = (label, value) => el('div').css({ display: 'flex', justifyContent: 'space-between', padding: '0.65rem 0', borderBottom: '1px solid #f1f5f9' }).child([
        el('span').text(label).css({ color: '#64748b', fontSize: '0.875rem' }),
        el('span').text(String(value || '-')).css({ fontWeight: '600', fontSize: '0.875rem' })
      ]);

      const card = el('div').css({ maxWidth: '640px', margin: '0 auto', background: '#fff', borderRadius: '1rem', boxShadow: '0 4px 24px rgba(15,23,42,0.08)' }).child([
        el('div').css({ padding: '1.75rem', borderBottom: '1px solid #e2e8f0' }).child([
          el('h1').text(user.name || 'User').css({ margin: 0, fontSize: '1.5rem', fontWeight: '800' }),
          el('p').text(user.email || '').css({ margin: '0.25rem 0 0', color: '#475569' })
        ]),
        el('div').css({ padding: '1.25rem 1.75rem' }).child([
          row('Role', roleLabels[user.role] || user.role),
          row('Cabang', user.kode_cabang || 'Semua cabang'),
          row('Status', user.status === 'active' ? 'Aktif' : user.status),
          row('ID', user.id)
        ]),
        el('div').css({ padding: '1rem 1.75rem', display: 'flex', gap: '0.75rem', borderTop: '1px solid #e2e8f0' }).child([
          el('button').text('Ke Dashboard').click(() => layout.navigate('/')).css({ padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: 'none', background: '#2563eb', color: '#fff', fontWeight: '600', cursor: 'pointer' }),
          el('button').text('Keluar').click(async () => {
            if (typeof CrmAuth !== 'undefined') await CrmAuth.logout();
            resetSessionForLogout(core);
            window.location.hash = '#/login';
          }).css({ padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: '600', cursor: 'pointer' })
        ])
      ]);

      return el('div').child([el('h2').text('Profil Saya').css({ margin: '0 0 1.25rem', fontWeight: '700' }), card]).get();
    }
  });
}

function registerLoginPage(core) {
  layout.addPage({
    path: '/login',
    hideLayout: true,
    pageContentPadding: '0',
    component: () => {
      const refs = {};
      const teal = { primary: '#0e7490', dark: '#155e75', deeper: '#164e63', accent: '#22d3ee', light: '#ecfeff' };
      const inputStyle = { width: '100%', padding: '0.72rem 0.95rem 0.72rem 2.55rem', borderRadius: '0.65rem', border: '1px solid #e2e8f0', boxSizing: 'border-box', fontSize: '0.9375rem' };

      const errEl = el('div').css({ display: 'none', padding: '0.65rem', borderRadius: '0.55rem', background: '#fef2f2', color: '#b91c1c', fontSize: '0.8125rem' }).link(refs, 'error');
      const emailInput = el('input').attr('type', 'email').attr('required', 'required').attr('placeholder', appBranding.adminEmail || 'admin@localhost').css(inputStyle);
      const passInput = el('input').attr('type', 'password').attr('required', 'required').attr('placeholder', 'Password').css(inputStyle);
      const submitBtn = el('button').attr('type', 'submit').text('Masuk').link(refs, 'submitBtn').css({ width: '100%', padding: '0.78rem', borderRadius: '0.65rem', border: 'none', background: teal.primary, color: '#fff', fontWeight: '700', cursor: 'pointer' });

      const form = el('form').css({ display: 'grid', gap: '1rem' }).submit(async (data) => {
        if (!(data.email || '').trim() || !data.password) {
          el(refs.error).text('Email dan password wajib.').css({ display: 'block' });
          return;
        }
        el(refs.submitBtn).disabled(true).text('Memproses...');
        el(refs.error).css({ display: 'none' });
        if (typeof layout.showAuthBootstrapLoader === 'function') layout.showAuthBootstrapLoader('Memuat...', { untilPageReady: true });
        try {
          await CrmAuth.login(data.email.trim(), data.password, async (user) => {
            await bootstrapAuthenticatedApp(core, user);
          });
          layout.navigate('/', true);
          ensureAuthenticatedNavbarRendered(core);
        } catch (e) {
          if (typeof layout.hideAuthBootstrapLoader === 'function') layout.hideAuthBootstrapLoader();
          el(refs.error).text(e.message || 'Login gagal').css({ display: 'block' });
          el(refs.submitBtn).disabled(false).text('Masuk');
        }
      });

      form.child([
        el('h2').text('Masuk').css({ margin: '0 0 0.25rem', fontWeight: '800', fontSize: '1.5rem' }),
        el('p').text('Gunakan kredensial administrator.').css({ margin: '0 0 1rem', color: '#64748b', fontSize: '0.875rem' }),
        el('label').child([el('span').text('Email').css({ fontSize: '0.8125rem', fontWeight: '600' }), emailInput]),
        el('label').child([el('span').text('Password').css({ fontSize: '0.8125rem', fontWeight: '600' }), passInput]),
        errEl,
        submitBtn
      ]);

      const brand = el('div').css({ flex: '1 1 340px', padding: '3rem', background: `linear-gradient(155deg, ${teal.deeper}, ${teal.primary})`, color: '#fff', minHeight: '280px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }).child([
        el('h1').text(appBranding.appName || 'Admin Starter').css({ margin: '0 0 0.5rem', fontSize: '2rem', fontWeight: '800' }),
        el('p').text(appBranding.loginSubtitle).css({ margin: '0 0 1.5rem', opacity: '0.9', lineHeight: '1.6' }),
        el('ul').css({ margin: 0, paddingLeft: '1.1rem', lineHeight: '1.8', fontSize: '0.875rem' }).child([
          el('li').text('CRUD dari JSON — tanpa coding halaman'),
          el('li').text('Role-based menu & permission'),
          el('li').text('Studio untuk generate resource baru')
        ])
      ]);

      const formPanel = el('div').css({ flex: '1 1 380px', padding: '3rem', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }).child([
        el('div').css({ width: '100%', maxWidth: '400px', padding: '2rem', background: '#fff', borderRadius: '1rem', border: '1px solid #e2e8f0' }).child([form])
      ]);

      return el('div').css({ display: 'flex', flexWrap: 'wrap', minHeight: '100vh' }).child([brand, formPanel]).get();
    }
  });
}
