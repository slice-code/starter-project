(function (global) {
  'use strict';

  const API_BASE = () => (typeof window !== 'undefined' ? window.location.origin : '');

  // Halaman inti — dimuat segera setelah login (1 request bulk)
  /** Halaman custom JS — jangan timpa dengan lazy loader appjson */
  const HARDCODED_PAGE_PATHS = new Set([
    '/menu-role-manager',
    '/studio/crud-manager',
    '/studio/database-manager',
    '/studio/form-builder',
    '/studio/schema-designer',
    '/studio/field-presets',
    '/studio/deploy-history',
    '/jurnal-umum',
    '/kas-masuk',
    '/kas-keluar',
    '/pembayaran',
    '/pembayaran-tki',
    '/potongan-bulanan',
    '/gaji-tki',
    '/piutang',
    '/laporan/buku-besar',
    '/laporan/neraca',
    '/laporan/laba-rugi',
    '/laporan/arus-kas'
  ]);

  const EAGER_PATHS = [
    '/',
    '/personal',
    '/tambahbio',
    '/family',
    '/working',
    '/skillcondition',
    '/pengalaman',
    '/dokumen',
    '/disnaker',
    '/medical',
    '/paspor',
    '/majikan',
    '/visa',
    '/skck',
    '/printsurat',
    '/about',
    '/users'
  ];

  /** Perbaiki respons API lama yang membungkus seluruh file ke dalam `config` */
  function normalizePageConfig(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    const inner = raw.config;
    if (inner && typeof inner === 'object' && inner.config && inner.config.table && !inner.table) {
      return {
        path: raw.path || inner.path,
        type: raw.type || inner.type || 'crud',
        config: inner.config,
        options: raw.options || inner.options || {}
      };
    }
    return raw;
  }

  const PageLoader = {
    EAGER_PATHS,

    /** Reset filter/schema yang menempel di memori antar sesi login */
    resetCrudSchemaSessionState(core) {
      const resetSchema = (schema) => {
        if (!schema || typeof schema !== 'object') return;
        delete schema._sektorPrefix;
        delete schema._stageFilter;
        delete schema._stageFilterLabel;
        delete schema._filterSummaryText;
        delete schema._activeFilters;
      };
      if (core?.crudPages) {
        Object.values(core.crudPages).forEach(({ schema }) => resetSchema(schema));
      }
      if (core?._pageConfigCache) {
        Object.values(core._pageConfigCache).forEach((pageConfig) => resetSchema(pageConfig?.config));
      }
    },

    resolveCrudPermissions(core, pagePath, opts) {
      const role =
        typeof CrmRbac !== 'undefined' && CrmRbac.getRole
          ? CrmRbac.getRole()
          : core._sessionRole || null;
      if (role === 'super_admin' || role === 'admin') {
        return opts.permissions && typeof opts.permissions === 'object' && !Array.isArray(opts.permissions)
          ? opts.permissions
          : {
              create: [role],
              read: [role],
              update: [role],
              delete: [role]
            };
      }
      const base = opts.permissions || null;
      const menuPerms = core.menuPermissions || {};
      if (typeof CrmRbac !== 'undefined' && CrmRbac.buildMenuCrudPermissions) {
        return CrmRbac.buildMenuCrudPermissions(pagePath, menuPerms, role, base) || base;
      }
      return base;
    },

    applyPageConfig(core, pageConfig) {
      if (!pageConfig?.path) return;
      if (pageConfig.type === 'crud' && pageConfig.config) {
        pageConfig.config.path = pageConfig.config.path || pageConfig.path;
      }
      const opts = pageConfig.options || {};
      // roles = siapa boleh buka halaman; permissions (object) = CRUD create/update/delete
      const sessionRole =
        typeof CrmRbac !== 'undefined' && CrmRbac.getRole
          ? CrmRbac.getRole()
          : core._sessionRole || null;
      const menuPerms = core.menuPermissions || {};
      const pathAllowedByMenu =
        pageConfig.path && menuPerms[pageConfig.path] != null;
      const routeRoles =
        sessionRole === 'super_admin' || sessionRole === 'admin'
          ? null
          : pathAllowedByMenu
            ? null
            : opts.roles || (Array.isArray(opts.permissions) ? opts.permissions : null);
      const crudPermissions =
        pageConfig.type === 'crud'
          ? PageLoader.resolveCrudPermissions(core, pageConfig.path, opts)
          : opts.permissions && typeof opts.permissions === 'object' && !Array.isArray(opts.permissions)
            ? opts.permissions
            : null;
      const routeOpts = {
        ...opts,
        roles: routeRoles,
        permissions: crudPermissions
      };
      if (pageConfig.type === 'crud') {
        core.addCrudPage(pageConfig.path, pageConfig.config, routeOpts);
      } else if (pageConfig.type === 'page') {
        core.addPage(pageConfig.path, pageConfig.config, routeOpts);
      }
    },

    async fetchPageByPath(path) {
      const res = await fetch(
        `${API_BASE()}/api/pages/by-path?path=${encodeURIComponent(path)}`,
        { credentials: 'include' }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || `Halaman ${path} tidak ditemukan`);
      return normalizePageConfig(json.data);
    },

    async fetchBulk(paths) {
      if (!paths.length) return [];
      const res = await fetch(`${API_BASE()}/api/pages/bulk`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Gagal memuat halaman');
      return (json.data || []).map(normalizePageConfig);
    },

    async fetchManifest() {
      const res = await fetch(`${API_BASE()}/api/pages`, { credentials: 'include' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Gagal memuat daftar halaman');
      return json.data || [];
    },

    async mountCustomPage(pageConfig) {
      var _this = this;
      var moduleRelPath = pageConfig.module;
      var factory = pageConfig.options?.factory || pageConfig.factory;

      // Dynamic script loading
      if (moduleRelPath && typeof window !== 'undefined') {
        var src = moduleRelPath.startsWith('http') ? moduleRelPath : moduleRelPath;
        var isLoaded = !!document.querySelector('script[src*="' + moduleRelPath.replace(/"/g, '') + '"]');
        if (!isLoaded) {
          await new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = function () { reject(new Error('Gagal memuat modul: ' + moduleRelPath)); };
            document.head.appendChild(s);
          });
        }
      }

      // Call factory function
      if (factory && typeof window !== 'undefined') {
        var parts = factory.split('.');
        var fn = window;
        for (var i = 0; i < parts.length; i++) {
          fn = fn ? fn[parts[i]] : null;
          if (!fn) break;
        }
        if (typeof fn === 'function') {
          var result = fn();
          if (result && typeof result.then === 'function') {
            return await result;
          }
          return result;
        }
        throw new Error('Factory function ' + factory + ' tidak ditemukan untuk halaman ' + pageConfig.path);
      }

      throw new Error(
        'Halaman custom ' + pageConfig.path + ' tidak memiliki factory. ' +
        'Tambahkan "factory" di appjson (contoh: "NamaModule.initPage").'
      );
    },

    mountPageConfig(core, pageConfig) {
      if (pageConfig.type === 'crud') {
        const crud = CrudEngine.build(pageConfig.config, {
          apiClient: core.apiClient,
          pagePath: pageConfig.path,
          permissions: PageLoader.resolveCrudPermissions(core, pageConfig.path, pageConfig.options || {})
        });
        const resource = pageConfig.config?.resource;
        if (resource) {
          if (typeof core.registerCrudPageEntry === 'function') {
            core.registerCrudPageEntry(pageConfig.path, pageConfig.config, crud);
          } else {
            core.crudPages = core.crudPages || {};
            core.crudPages[resource] = {
              schema: pageConfig.config,
              apiClient: core.apiClient,
              instance: crud
            };
          }
        }
        return crud.get();
      }

      if (pageConfig.type === 'custom') {
        return this.mountCustomPage(pageConfig);
      }

      const pageSchema = pageConfig.config?.type
        ? pageConfig.config
        : { type: 'page', ...pageConfig.config };
      return UiBuilder.build(pageSchema, {
        data: pageConfig.options?.data || {},
        actions: pageConfig.options?.actions || {},
        apiClient: core.apiClient
      }).get();
    },

    async ensurePageDependencies(pageConfig) {
      if (typeof CoreScriptLoader === 'undefined' || !pageConfig) return;
      const cfg = pageConfig.config || {};
      const scripts = [];
      if (cfg.readOnlyReport && cfg.reportKey) {
        scripts.push(
          './core/tki-report-ui.js?v=202606041955',
          './core/blk-report-ui.js?v=202606011200',
          './library/xlsx.js',
          './core/crm-export.js?v=20260531f'
        );
      }
      if (pageConfig.path === '/') {
        scripts.push('./core/dashboard-ui.js?v=20260520f');
      }
      if (scripts.length) await CoreScriptLoader.loadMany([...new Set(scripts)]);
    },

    registerLazyRoute(core, path, pageName) {
      core._lazyRoutes = core._lazyRoutes || {};
      core._lazyRoutes[path] = pageName;
      core._pageConfigCache = core._pageConfigCache || {};

      layout.addPage({
        path,
        component: async () => {
          try {
            let pageConfig = core._pageConfigCache[path];
            if (!pageConfig) {
              if (pageName && core.apiClient) {
                const res = await core.apiClient.read(`pages/${pageName}`);
                pageConfig = normalizePageConfig(res?.data || res);
              } else {
                pageConfig = await PageLoader.fetchPageByPath(path);
              }
              pageConfig = normalizePageConfig(pageConfig);
              if (pageConfig?.type === 'crud' && !pageConfig?.config?.table) {
                throw new Error('Konfigurasi halaman CRUD tidak valid (table hilang)');
              }
              PageLoader.applyPageConfig(core, pageConfig);
              core._pageConfigCache[path] = pageConfig;
            }
            await PageLoader.ensurePageDependencies(pageConfig);
            return PageLoader.mountPageConfig(core, pageConfig);
          } catch (err) {
            console.error('Lazy page load failed:', path, err);
            return el('div').css({ padding: '2rem', color: '#dc2626' })
              .text(err.message || 'Gagal memuat halaman.').get();
          }
        },
        pageContentPadding: '0'
      });
    },

    collectMenuPaths(menuItems, out) {
      if (!menuItems) return;
      menuItems.forEach((item) => {
        if (item.page) out.add(item.page);
        if (item.children) PageLoader.collectMenuPaths(item.children, out);
      });
    },

    async bootstrap(core) {
      const manifest = await PageLoader.fetchManifest();
      const menuPaths = new Set();
      PageLoader.collectMenuPaths(core.layoutConfig?.sideMenu, menuPaths);

      let bulkPages = [];
      try {
        bulkPages = await PageLoader.fetchBulk(EAGER_PATHS);
      } catch (err) {
        console.warn('[PageLoader] bulk gagal, muat per halaman:', err.message);
        bulkPages = await Promise.all(
          EAGER_PATHS.map((p) => PageLoader.fetchPageByPath(p).catch(() => null))
        );
        bulkPages = bulkPages.filter(Boolean);
      }
      const loadedPaths = new Set();
      bulkPages.forEach((cfg) => {
        if (!cfg?.path) return;
        PageLoader.applyPageConfig(core, cfg);
        loadedPaths.add(cfg.path);
      });

      // Pastikan halaman eager (termasuk Dashboard /) benar-benar terdaftar
      for (const eagerPath of EAGER_PATHS) {
        if (loadedPaths.has(eagerPath)) continue;
        try {
          const cfg = await PageLoader.fetchPageByPath(eagerPath);
          PageLoader.applyPageConfig(core, cfg);
          loadedPaths.add(cfg.path);
        } catch (err) {
          console.warn(`[PageLoader] Gagal muat halaman wajib ${eagerPath}:`, err.message);
        }
      }

      const allPaths = new Set();
      manifest.forEach((m) => {
        if (m.path) allPaths.add(m.path);
      });
      menuPaths.forEach((p) => allPaths.add(p));

      let lazyCount = 0;
      allPaths.forEach((path) => {
        if (!path || path === '/login' || path.includes(':')) return;
        if (HARDCODED_PAGE_PATHS.has(path)) return;
        if (loadedPaths.has(path)) return;
        const entry = manifest.find((m) => m.path === path);
        PageLoader.registerLazyRoute(core, path, entry?.name || null);
        lazyCount += 1;
      });

      await PageLoader.ensureDashboardRegistered(core);

      console.log(`[PageLoader] Dimuat awal: ${loadedPaths.size}, lazy (saat diklik): ${lazyCount}`);
    },

    async ensureDashboardRegistered(core) {
      const dashPath = '/';
      try {
        const cfg = await PageLoader.fetchPageByPath(dashPath);
        PageLoader.applyPageConfig(core, cfg);
        console.log('[PageLoader] Dashboard (/) terdaftar');
      } catch (err) {
        console.error('[PageLoader] Gagal mendaftarkan Dashboard:', err.message);
      }
    }
  };

  PageLoader.HARDCODED_PAGE_PATHS = HARDCODED_PAGE_PATHS;

  global.PageLoader = PageLoader;
})(typeof window !== 'undefined' ? window : global);
