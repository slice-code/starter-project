// ============================================
// Studio Pages Registration
// ============================================
// Register all Studio UI pages in routing system
// ============================================

(function(global) {
  'use strict';

  function registerStudioPages(options = {}) {
    if (typeof layout === 'undefined') return;
    if (registerStudioPages._done && !options.force) return;

    const roles = ['super_admin', 'studio_admin'];
    const force = !!options.force;
    const STUDIO_V = '20260608b';

    async function loadStudioDeps(extra) {
      const base = [
        `./core/studio-crud-config.js?v=${STUDIO_V}`,
        `./core/studio-preview.js?v=${STUDIO_V}`
      ];
      const list = extra ? [...base, extra] : base;
      if (typeof CoreScriptLoader !== 'undefined') {
        await CoreScriptLoader.loadMany(list);
        return;
      }
      for (const src of list) await import(src);
    }

    function wrapStudioPage(pageEl) {
      return el('div').css({
        display: 'flex',
        flexDirection: 'column',
        flex: '1',
        minHeight: '0',
        height: '100%',
        overflow: 'hidden'
      }).child(pageEl).get();
    }

    function addStudioPage(path, pageConfig) {
      if (force || !layout.isValidRoute(path)) {
        layout.addPage(pageConfig);
      }
    }

    // 1. CRUD Manager
    addStudioPage('/studio/crud-manager', {
        path: '/studio/crud-manager',
        roles: roles,
        pageContentPadding: '0',
        component: async () => {
          try {
            await loadStudioDeps(`./core/studio-crud-manager.js?v=${STUDIO_V}`);
            if (typeof StudioCrudManager === 'undefined') {
              throw new Error('StudioCrudManager failed to load');
            }
            
            const pageEl = await StudioCrudManager.init();
            return wrapStudioPage(pageEl);
          } catch (error) {
            console.error('Failed to load Studio CRUD Manager:', error);
            return el('div').css({ padding: '2rem', color: '#dc2626' }).html(`
              <h2>Failed to Load Studio CRUD Manager</h2>
              <p>${error.message}</p>
              <pre>${error.stack}</pre>
            `);
          }
        }
      });

    // 2. Form Builder
    addStudioPage('/studio/form-builder', {
        path: '/studio/form-builder',
        roles: roles,
        pageContentPadding: '0',
        component: async () => {
          try {
            await loadStudioDeps(`./core/studio-form-builder.js?v=${STUDIO_V}`);
            if (typeof StudioFormBuilder === 'undefined') {
              throw new Error('StudioFormBuilder failed to load');
            }

            const hash = window.location.hash;
            const params = new URLSearchParams(hash.split('?')[1] || '');
            const mode = params.get('mode') || 'create';
            const resource = params.get('resource') || null;
            
            const pageEl = await StudioFormBuilder.init(mode, resource);
            return wrapStudioPage(pageEl);
          } catch (error) {
            console.error('Failed to load Studio Form Builder:', error);
            return el('div').css({ padding: '2rem', color: '#dc2626' }).html(`
              <h2>Failed to Load Studio Form Builder</h2>
              <p>${error.message}</p>
              <pre>${error.stack}</pre>
            `);
          }
        }
      });

    // 3. Schema Designer
    addStudioPage('/studio/schema-designer', {
        path: '/studio/schema-designer',
        roles: roles,
        pageContentPadding: '0',
        component: async () => {
          try {
            if (typeof StudioSchemaDesigner === 'undefined') {
              if (typeof CoreScriptLoader !== 'undefined') {
                await CoreScriptLoader.load(`./core/studio-schema-designer.js?v=${STUDIO_V}`);
              } else {
                await import(`./core/studio-schema-designer.js?v=${STUDIO_V}`);
              }
            }
            
            const pageEl = await StudioSchemaDesigner.init();
            return wrapStudioPage(pageEl);
          } catch (error) {
            console.error('Failed to load Studio Schema Designer:', error);
            return el('div').css({ padding: '2rem', color: '#dc2626' }).html(`
              <h2>Failed to Load Studio Schema Designer</h2>
              <p>${error.message}</p>
              <pre>${error.stack}</pre>
            `);
          }
        }
      });

    // 4. Field Presets
    addStudioPage('/studio/field-presets', {
        path: '/studio/field-presets',
        roles: roles,
        pageContentPadding: '0',
        component: async () => {
          try {
            if (typeof StudioFieldPresets === 'undefined') {
              if (typeof CoreScriptLoader !== 'undefined') {
                await CoreScriptLoader.load(`./core/studio-field-presets.js?v=${STUDIO_V}`);
              } else {
                await import(`./core/studio-field-presets.js?v=${STUDIO_V}`);
              }
            }
            
            const pageEl = await StudioFieldPresets.init();
            return wrapStudioPage(pageEl);
          } catch (error) {
            console.error('Failed to load Studio Field Presets:', error);
            return el('div').css({ padding: '2rem', color: '#dc2626' }).html(`
              <h2>Failed to Load Studio Field Presets</h2>
              <p>${error.message}</p>
              <pre>${error.stack}</pre>
            `);
          }
        }
      });

    // 5. Database Manager
    addStudioPage('/studio/database-manager', {
        path: '/studio/database-manager',
        roles: roles,
        pageContentPadding: '0',
        component: async () => {
          try {
            await loadStudioDeps(`./core/studio-database-manager.js?v=${STUDIO_V}`);
            if (typeof StudioDatabaseManager === 'undefined') {
              throw new Error('StudioDatabaseManager failed to load');
            }
            const pageEl = await StudioDatabaseManager.init();
            return wrapStudioPage(pageEl);
          } catch (error) {
            console.error('Failed to load Studio Database Manager:', error);
            return el('div').css({ padding: '2rem', color: '#dc2626' }).html(`
              <h2>Failed to Load Database Manager</h2>
              <p>${error.message}</p>
            `);
          }
        }
      });

    // 6. Deploy History
    addStudioPage('/studio/deploy-history', {
        path: '/studio/deploy-history',
        roles: roles,
        pageContentPadding: '1rem',
        component: async () => {
          try {
            const res = await fetch('/api/studio/deploy-history', { credentials: 'include' });
            const json = await res.json();

            if (!json.success) {
              return el('div').css({ padding: '1rem' }).child(
                el('p').css({ color: '#dc2626' }).text('Failed to load deploy history')
              );
            }

            const history = json.data || [];
            const container = el('div').css({ padding: '1rem' });

            if (history.length === 0) {
              return container.child(
                el('div').css({ textAlign: 'center', padding: '3rem', color: '#94a3b8' }).child([
                  el('i').class('fas fa-history').css({ fontSize: '3rem', marginBottom: '1rem', display: 'block' }),
                  el('p').text('No deployment history yet')
                ])
              );
            }

            // Header
            const header = el('div').css({ marginBottom: '1.5rem' }).child([
              el('h1').css({ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }).text('Deploy History'),
              el('p').css({ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#64748b' }).text('Track all CRUD deployment operations')
            ]);
            container.child(header);

            // Table
            const table = el('table').css({
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.875rem',
              backgroundColor: '#fff',
              borderRadius: '0.5rem',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            });

            // Header row
            const thead = el('thead').css({ backgroundColor: '#f1f5f9' });
            const headerRow = el('tr');
            ['Action', 'Resource', 'Title', 'Fields', 'User', 'Timestamp'].forEach(text => {
              const th = el('th').css({
                padding: '0.75rem',
                textAlign: 'left',
                fontWeight: 700,
                color: '#475569',
                borderBottom: '2px solid #e2e8f0'
              }).text(text);
              headerRow.child(th);
            });
            thead.child(headerRow);
            table.child(thead);

            // Body rows
            const tbody = el('tbody');
            history.forEach((entry, index) => {
              const row = el('tr').css({
                borderBottom: '1px solid #e2e8f0',
                backgroundColor: index % 2 === 0 ? '#fff' : '#f8fafc'
              });

              // Action badge
              const badgeColors = {
                create: { bg: '#d1fae5', color: '#065f46' },
                update: { bg: '#dbeafe', color: '#1e40af' },
                delete: { bg: '#fee2e2', color: '#991b1b' }
              };
              const colors = badgeColors[entry.action] || { bg: '#f3f4f6', color: '#374151' };
              
              const badge = el('span').css({
                padding: '0.25rem 0.75rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'capitalize',
                backgroundColor: colors.bg,
                color: colors.color
              }).text(entry.action);
              
              row.child(el('td').css({ padding: '0.75rem' }).child(badge));
              row.child(el('td').css({ padding: '0.75rem', fontFamily: 'monospace', color: '#0e7490' }).text(entry.resource));
              row.child(el('td').css({ padding: '0.75rem' }).text(entry.title));
              row.child(el('td').css({ padding: '0.75rem' }).text(entry.fields || '-'));
              row.child(el('td').css({ padding: '0.75rem' }).text(entry.user || '-'));
              
              const date = new Date(entry.timestamp);
              const timeStr = date.toLocaleString('id-ID', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
              row.child(el('td').css({ padding: '0.75rem', color: '#64748b' }).text(timeStr));

              tbody.child(row);
            });
            table.child(tbody);
            container.child(table);

            return container;
          } catch (error) {
            console.error('Failed to load Deploy History:', error);
            return el('div').css({ padding: '2rem', color: '#dc2626' }).html(`
              <h2>Failed to Load Deploy History</h2>
              <p>${error.message}</p>
              <pre>${error.stack}</pre>
            `);
          }
        }
      });

    registerStudioPages._done = true;
    console.log('✅ Studio pages registered successfully');
  }

  global.registerStudioPages = registerStudioPages;

})(typeof window !== 'undefined' ? window : global);
