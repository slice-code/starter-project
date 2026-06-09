(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
      (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.CoreApp = factory());
})(this, (function () {
  'use strict';

  class CoreApp {
    constructor(config = {}) {
      // API configuration
      this.apiConfig = config.api || { baseUrl: '/api' };
      this.apiClient = null;

      // Layout configuration
      this.layoutConfig = config.layout || {};
      
      // Pages configuration
      this.pages = config.pages || [];
      
      // Global data store
      this.globalData = {};
      
      // Component registry
      this.componentRegistry = {};

      // Schema storage
      this.schemas = {};

      // Check if el.js is loaded
      if (typeof el === 'undefined') {
        throw new Error('el.js is required. Please load el.js before core.js');
      }

      // Check if layout.js is loaded
      if (typeof layout === 'undefined') {
        throw new Error('layout.js is required. Please load layout.js before core.js');
      }
    }

    // Register a schema (used by schema-driven CRUD)
    registerSchema(name, schema) {
      this.schemas[name] = schema;
      console.log(`✓ Registered schema: ${name}`);
    }

    // Get all registered schemas
    getSchemas() {
      return this.schemas;
    }

    // Get a specific schema
    getSchema(name) {
      return this.schemas[name];
    }

    // Initialize the application
    init() {
      // Initialize API client
      this.apiClient = new ApiClient({
        baseUrl: this.apiConfig.baseUrl,
        token: this.apiConfig.token || (() => localStorage.getItem('token')),
        headers: this.apiConfig.headers || {},
        errorHandler: this.apiConfig.errorHandler || null
      });

      // Setup layout
      this.setupLayout();

      // Register pages
      this.registerPages();

      // Handle current route BEFORE layout.render()
      // This prevents dashboard from being rendered first
      let currentHash = window.location.hash.replace('#', '') || '/';
      // Ensure leading slash for consistent matching
      if (!currentHash.startsWith('/')) {
        currentHash = '/' + currentHash;
      }
      
      // Handle dynamic routes - show the list page UI
      if (layout.isCrudDynamicRoute(currentHash)) {
        // Extract list path (e.g., /products/create -> /products)
        const match = currentHash.match(/^\/([^\/]+)/);
        if (match) {
          const listPath = `/${match[1]}`;
          console.log(`Dynamic route '${currentHash}' - redirecting to '${listPath}' before render...`);
          window.location.replace('#' + listPath);
        }
      } else if (!layout.isValidRoute(currentHash)) {
        console.warn(`Route '${currentHash}' not found, redirecting to dashboard...`);
        window.location.replace('#/');
      }

      // Initialize layout (will use the redirected hash now)
      layout.render();

      // Register global trigger functions for CRUD dynamic routes
      window.triggerCrudCreate = (resourceSlug, prefill) => {
        const coreRef = window.pjtkiApp?.core || this;
        const pageData = coreRef.resolveCrudPage
          ? (coreRef.resolveCrudPage(resourceSlug)
            || coreRef.resolveCrudPage(String(resourceSlug || '').replace(/_/g, '-')))
          : null;
        if (!pageData?.instance) {
          console.warn('[CRUD] create page not found:', resourceSlug);
          if (typeof layout !== 'undefined' && layout.toast) {
            layout.toast('Halaman buat data tidak ditemukan.', { type: 'error' });
          }
          return;
        }
        if (typeof CrudEngine !== 'undefined' && CrudEngine.stashCrudCreatePrefill) {
          CrudEngine.stashCrudCreatePrefill(pageData.schema?.resource || resourceSlug, prefill || {});
        }
        if (typeof pageData.instance.openCreateAsNewPage === 'function') {
          pageData.instance.openCreateAsNewPage(prefill || {});
          return;
        }
        if (typeof CrudEngine !== 'undefined' && CrudEngine.openCreateAsNewPage) {
          const refresh = typeof pageData.instance.refresh === 'function'
            ? pageData.instance.refresh
            : () => {};
          CrudEngine.openCreateAsNewPage(
            pageData.schema,
            pageData.apiClient,
            pageData.instance.table,
            refresh,
            prefill || {}
          );
        }
      };

      window.triggerCrudEdit = (resourceSlug, id) => {
        const pageData = this.resolveCrudPage(resourceSlug);
        if (pageData && pageData.instance) {
          this._loadAndEditAsNewPage(pageData, id);
        }
      };

      console.log('CoreApp initialized successfully');
    }

    // Load entity by id and open edit as new page
    async _loadAndEditAsNewPage(pageData, id) {
      try {
        const response = await pageData.apiClient.read(`${pageData.schema.resource}/${id}`);
        if (response && response.data) {
          if (typeof pageData.instance.openEditAsNewPage === 'function') {
            pageData.instance.openEditAsNewPage(response.data);
          } else if (typeof CrudEngine !== 'undefined' && CrudEngine.openEditAsNewPage) {
            const refresh = typeof pageData.instance.refresh === 'function'
              ? pageData.instance.refresh
              : () => {};
            await CrudEngine.openEditAsNewPage(
              pageData.schema,
              pageData.apiClient,
              pageData.instance.table,
              response.data,
              refresh
            );
          }
        }
      } catch (error) {
        console.error('Error loading entity for edit:', error);
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('Error loading data', { type: 'error' });
        }
      }
    }

    // Setup layout configuration
    setupLayout() {
      // Set theme
      if (this.layoutConfig.theme) {
        if (this.layoutConfig.customTheme) {
          layout.setCustomTheme(this.layoutConfig.customTheme);
        } else {
          layout.setTheme(this.layoutConfig.theme);
        }
      }

      // Set side menu
      if (this.layoutConfig.sideMenu) {
        layout.addSideMenu(this.layoutConfig.sideMenu);
      }

      // Set navbar
      if (this.layoutConfig.navbar) {
        layout.addNavbar(this.layoutConfig.navbar);
      }

      // Set role
      if (this.layoutConfig.role) {
        layout.setRole(this.layoutConfig.role);
      }

      // Add middleware
      if (this.layoutConfig.middleware && typeof this.layoutConfig.middleware === 'function') {
        layout.middleware(this.layoutConfig.middleware);
      }
    }

    // Register all pages
    registerPages() {
      this.pages.forEach(page => {
        if (page.type === 'crud') {
          this.addCrudPage(page.path, page.schema, page.config);
        } else {
          this.addPage(page.path, page.schema, page.config);
        }
      });
    }

    // Add a regular page from UI schema
    addPage(path, schema, config = {}) {
      layout.addPage({
        path: path,
        component: async () => {
          // Dynamic dependency loading controlled via JSON
          const scripts = config.scripts || config.libraries || schema.scripts || schema.libraries;
          if (typeof CoreScriptLoader !== 'undefined' && scripts) {
            const arr = Array.isArray(scripts) ? scripts : (typeof scripts === 'string' && scripts.trim() ? [scripts.trim()] : []);
            if (arr.length) {
              await CoreScriptLoader.loadMany([...new Set(arr)]);
            }
          }

          // Auto-wrap schema with type: 'page' if not present
          const pageSchema = schema.type ? schema : { type: 'page', ...schema };
          
          return UiBuilder.build(pageSchema, {
            data: config.data || {},
            actions: config.actions || {},
            apiClient: this.apiClient
          }).get();
        },
        roles: config.roles || null,
        hideLayout: config.hideLayout || false,
        fullWidthDesktop: config.fullWidthDesktop || false,
        pageContentPadding: config.pageContentPadding
      });
    }

    /** Resolve permission CRUD sesuai role sesi aktif (bukan role saat halaman pertama kali didaftarkan) */
    resolveCrudPermissionsForPage(path, crudSchema, config = {}) {
      if (typeof PageLoader !== 'undefined' && PageLoader.resolveCrudPermissions) {
        return PageLoader.resolveCrudPermissions(this, path, {
          permissions: crudSchema?.permissions || config.permissions,
          roles: config.roles
        });
      }
      return config.permissions || null;
    }

    resolveCrudPage(slug) {
      if (!slug || !this.crudPages) return null;
      const key = String(slug).trim();
      return this.crudPages[key] || null;
    }

    registerCrudPageEntry(path, crudSchema, crud) {
      this.crudPages = this.crudPages || {};
      const schema = { ...crudSchema, path: crudSchema.path || path };
      const resource = schema.resource;
      const entry = {
        schema,
        apiClient: this.apiClient,
        instance: crud
      };
      if (resource) this.crudPages[resource] = entry;
      const slug = String(path || '').replace(/^\//, '').split('/')[0];
      if (slug) this.crudPages[slug] = entry;
    }

    // Add a CRUD page
    addCrudPage(path, crudSchema, config = {}) {
      this.crudPages = this.crudPages || {};
      const resource = crudSchema.resource;

      // Kanban + tabel CRUD dalam satu halaman
      if (crudSchema.viewType === 'kanban' || crudSchema.kanban) {
        layout.addPage({
          path: path,
          component: async () => {
            // Dynamic dependency loading controlled via JSON
            const scripts = config.scripts || config.libraries || crudSchema.scripts || crudSchema.libraries;
            if (typeof CoreScriptLoader !== 'undefined' && scripts) {
              const arr = Array.isArray(scripts) ? scripts : (typeof scripts === 'string' && scripts.trim() ? [scripts.trim()] : []);
              if (arr.length) {
                await CoreScriptLoader.loadMany([...new Set(arr)]);
              }
            }

            const viewKey = `crm_view_${resource}`;
            let currentView = localStorage.getItem(viewKey) || 'kanban';

            const shell = el('div').css({
              display: 'flex',
              flexDirection: 'column',
              flex: '1',
              overflow: 'hidden',
              height: '100%'
            });

            const toolbar = el('div').css({
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              borderBottom: '1px solid #e5e7eb',
              backgroundColor: '#f8fafc',
              flexShrink: '0'
            });

            const contentSlot = el('div').css({
              flex: '1',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              minHeight: '0'
            });

            const pagePermissions = this.resolveCrudPermissionsForPage(path, crudSchema, config);
            const crud = CrudEngine.build(crudSchema, {
              apiClient: this.apiClient,
              pagePath: path,
              permissions: pagePermissions
            });

            this.registerCrudPageEntry(path, crudSchema, crud);

            let kanbanInstance = null;

            const origCrudRefresh = crud.refresh;
            crud.refresh = () => {
              if (typeof origCrudRefresh === 'function') origCrudRefresh();
              if (kanbanInstance && typeof kanbanInstance.refresh === 'function') {
                kanbanInstance.refresh();
              }
            };

            const setActiveBtn = (kanbanBtn, tableBtn) => {
              kanbanBtn.css({ backgroundColor: '#2563eb', color: '#fff', border: 'none' });
              tableBtn.css({ backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db' });
            };

            const setActiveTable = (kanbanBtn, tableBtn) => {
              tableBtn.css({ backgroundColor: '#2563eb', color: '#fff', border: 'none' });
              kanbanBtn.css({ backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db' });
            };

            const btnStyle = {
              padding: '0.4rem 0.85rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: '600'
            };

            const kanbanBtn = el('button').text('Kanban').css({ ...btnStyle });
            const tableBtn = el('button').text('Table').css({ ...btnStyle });

            const renderView = () => {
              contentSlot.empty();
              if (currentView === 'kanban') {
                if (!kanbanInstance) {
                  kanbanInstance = KanbanEngine.build(crudSchema, {
                    apiClient: this.apiClient,
                    crudInstance: crud,
                    permissions: pagePermissions
                  });
                }
                setActiveBtn(kanbanBtn, tableBtn);
                contentSlot.child(kanbanInstance.get());
              } else {
                setActiveTable(kanbanBtn, tableBtn);
                contentSlot.child(crud.get());
              }
              contentSlot.get();
            };

            kanbanBtn.click(() => {
              currentView = 'kanban';
              localStorage.setItem(viewKey, 'kanban');
              renderView();
            });

            tableBtn.click(() => {
              currentView = 'table';
              localStorage.setItem(viewKey, 'table');
              renderView();
            });

            toolbar.child([kanbanBtn, tableBtn]);
            shell.child([toolbar, contentSlot]);
            renderView();

            return shell.get();
          },
          roles: config.roles || null,
          hideLayout: config.hideLayout || false,
          fullWidthDesktop: config.fullWidthDesktop || false,
          pageContentPadding: config.pageContentPadding !== undefined ? config.pageContentPadding : '0'
        });
      } else {
        // Regular CRUD table view
        layout.addPage({
          path: path,
          component: async () => {
            // Dynamic dependency loading controlled via JSON
            const scripts = config.scripts || config.libraries || crudSchema.scripts || crudSchema.libraries;
            if (typeof CoreScriptLoader !== 'undefined' && scripts) {
              const arr = Array.isArray(scripts) ? scripts : (typeof scripts === 'string' && scripts.trim() ? [scripts.trim()] : []);
              if (arr.length) {
                await CoreScriptLoader.loadMany([...new Set(arr)]);
              }
            }

            const pagePermissions = this.resolveCrudPermissionsForPage(path, crudSchema, config);
            const crud = CrudEngine.build(crudSchema, {
              apiClient: this.apiClient,
              pagePath: path,
              permissions: pagePermissions
            });

            if (resource) {
              this.registerCrudPageEntry(path, crudSchema, crud);
            }

            return crud.get();
          },
          roles: config.roles || null,
          hideLayout: config.hideLayout || false,
          fullWidthDesktop: config.fullWidthDesktop || false,
          pageContentPadding: config.pageContentPadding !== undefined ? config.pageContentPadding : '0'
        });
      }
    }

    // Update API configuration
    setApiConfig(config) {
      this.apiConfig = { ...this.apiConfig, ...config };
      
      if (this.apiClient) {
        if (config.baseUrl) {
          this.apiClient.baseUrl = config.baseUrl;
        }
        if (config.token) {
          this.apiClient.setToken(config.token);
        }
      }
    }

    // Update layout configuration
    setLayoutConfig(config) {
      this.layoutConfig = { ...this.layoutConfig, ...config };
      this.setupLayout();
    }

    // Register custom component
    registerComponent(type, renderer) {
      UiBuilder.registerComponent(type, renderer);
      this.componentRegistry[type] = renderer;
    }

    // Get global data
    getData(key) {
      return this.globalData[key];
    }

    // Set global data
    setData(key, value) {
      this.globalData[key] = value;
    }

    // Navigate to page
    navigate(path) {
      layout.navigate(path);
    }

    // Get current role
    getRole() {
      return layout.getRole();
    }

    // Set role
    setRole(role) {
      layout.setRole(role);
      this.layoutConfig.role = role;
    }

    // Show toast notification
    toast(message, options = {}) {
      if (layout.toast) {
        layout.toast(message, options);
      }
    }

    // Show confirm dialog
    confirm(options) {
      if (layout.confirm) {
        layout.confirm(options);
      }
    }

    // Show modal
    modal(options) {
      if (layout.modal) {
        layout.modal(options);
      }
    }

    // Close modal
    closeModal() {
      if (layout.closeModal) {
        layout.closeModal();
      }
    }

    // Get API client instance
    getApiClient() {
      return this.apiClient;
    }

    // Build UI from schema (utility)
    buildUI(schema, options = {}) {
      return UiBuilder.build(schema, {
        ...options,
        apiClient: this.apiClient
      });
    }

    // Build form from schema (utility)
    buildForm(schema, options = {}) {
      return FormBuilder.build(schema, options);
    }

    // Build table from schema (utility)
    buildTable(schema, options = {}) {
      return TableBuilder.build(schema, options);
    }

    // Build CRUD from schema (utility)
    buildCrud(schema, options = {}) {
      return CrudEngine.build(schema, {
        ...options,
        apiClient: this.apiClient
      });
    }
  }

  return CoreApp;
}));
