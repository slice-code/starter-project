// ============================================
// Studio Schema Designer - Advanced JSON Editor
// ============================================
// Direct schema editing for power users
// ============================================

(function(global) {
  'use strict';

  const API_BASE = typeof window !== 'undefined' ? window.location.origin : '';

  const StudioSchemaDesigner = {
    schemaList: [],
    selectedResource: null,
    currentSchema: null,
    currentAppjson: null,

    async init() {
      await this.loadSchemaList();
      return this.render();
    },

    async loadSchemaList() {
      try {
        let json = null;
        const studioRes = await fetch(`${API_BASE}/api/studio/schema-list`, { credentials: 'include' });
        if (studioRes.ok) json = await studioRes.json();
        if (!json?.success) {
          const pubRes = await fetch(`${API_BASE}/api/schema`, { credentials: 'include' });
          if (pubRes.ok) json = await pubRes.json();
        }
        if (json?.success) {
          this.schemaList = json.data || [];
        }
      } catch (error) {
        console.error('Load schema list error:', error);
      }
    },

    async loadCrudConfig(resourceName) {
      this.selectedResource = resourceName;
      
      try {
        const res = await fetch(`${API_BASE}/api/studio/crud/${resourceName}`, {
          credentials: 'include'
        });
        const json = await res.json();

        if (json.success) {
          this.currentSchema = json.schema;
          this.currentAppjson = json.appjson;
          this.renderEditor();
        } else {
          try {
            const pubRes = await fetch(`${API_BASE}/api/schema/${encodeURIComponent(resourceName)}`, { credentials: 'include' });
            const pub = await pubRes.json();
            if (pub.success) {
              this.currentSchema = pub.data;
              this.currentAppjson = {
                path: '/' + resourceName.replace(/_/g, '-'),
                type: 'crud',
                config: { resource: resourceName, title: pub.data.label || resourceName },
                options: { permissions: ['super_admin'] }
              };
              this.renderEditor();
              if (typeof layout !== 'undefined' && layout.toast) {
                layout.toast('Hanya schema — appjson belum ada (template dibuat)', { type: 'info' });
              }
              return;
            }
          } catch (_) { /* ignore */ }
          if (typeof layout !== 'undefined' && layout.toast) {
            layout.toast('Failed to load schema', { type: 'error' });
          }
        }
      } catch (error) {
        console.error('Load CRUD config error:', error);
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('Network error loading CRUD config', { type: 'error' });
        }
      }
    },

    async validate() {
      if (!this.currentSchema) {
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('No schema loaded', { type: 'error' });
        }
        return;
      }

      try {
        const schemaJson = JSON.parse(this.getSchemaEditorValue());
        
        const res = await fetch(`${API_BASE}/api/studio/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            resource: this.selectedResource,
            title: schemaJson.label || this.selectedResource,
            fields: schemaJson.fields || []
          })
        });

        const json = await res.json();

        if (json.success) {
          if (json.validation.valid) {
            if (typeof layout !== 'undefined' && layout.toast) {
              layout.toast('Schema is valid!', { type: 'success' });
            }
          } else {
            if (typeof layout !== 'undefined' && layout.toast) {
              layout.toast('Validation failed: ' + json.validation.errors.join(', '), { type: 'error' });
            }
          }
        }
      } catch (error) {
        console.error('Validate error:', error);
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('Invalid JSON: ' + error.message, { type: 'error' });
        }
      }
    },

    async generateMigration(dbType = 'postgresql') {
      if (!this.selectedResource) {
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('No schema selected', { type: 'error' });
        }
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/studio/generate-migration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            resourceName: this.selectedResource,
            dbType: dbType
          })
        });

        const json = await res.json();

        if (json.success) {
          this.showMigrationModal(json.sql, dbType);
        } else {
          if (typeof layout !== 'undefined' && layout.toast) {
            layout.toast('Failed to generate migration', { type: 'error' });
          }
        }
      } catch (error) {
        console.error('Generate migration error:', error);
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('Network error generating migration', { type: 'error' });
        }
      }
    },

    showMigrationModal(sql, dbType) {
      if (typeof layout === 'undefined' || !layout.modal) return;

      const container = el('div').css({ padding: '1rem' });

      const info = el('div').css({
        backgroundColor: '#f0fdfa',
        border: '1px solid #14b8a6',
        borderRadius: '0.5rem',
        padding: '1rem',
        marginBottom: '1rem'
      });
      info.child(el('p').css({ margin: '0', fontSize: '0.875rem', color: '#0f766e' }).child(el('i').class('fas fa-info-circle').css({ marginRight: '0.5rem' })).child(el('span').text(`Database: ${dbType.toUpperCase()}`)));
      container.child(info);

      const sqlEditor = el('textarea').css({
        width: '100%',
        minHeight: '400px',
        padding: '1rem',
        fontFamily: 'monospace',
        fontSize: '0.8125rem',
        border: '1px solid #d1d5db',
        borderRadius: '0.5rem',
        backgroundColor: '#f8fafc',
        resize: 'vertical',
        outline: 'none'
      });
      sqlEditor.el.value = sql;
      sqlEditor.el.readOnly = true;
      container.child(sqlEditor);

      const copyBtn = el('button').attr('type', 'button').css({
        marginTop: '1rem',
        padding: '0.75rem 1.5rem',
        borderRadius: '0.5rem',
        border: 'none',
        background: 'linear-gradient(135deg, #0e7490 0%, #0891b2 100%)',
        color: '#fff',
        fontSize: '0.9375rem',
        fontWeight: '700',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        margin: '1rem auto 0'
      });
      copyBtn.child(el('i').class('fas fa-copy'));
      copyBtn.child(el('span').text('Copy to Clipboard'));
      copyBtn.click(() => {
        navigator.clipboard.writeText(sql).then(() => {
          if (typeof layout !== 'undefined' && layout.toast) {
            layout.toast('SQL copied to clipboard!', { type: 'success' });
          }
        });
      });

      container.child(copyBtn);

      layout.modal({
        title: 'Generated Migration SQL',
        size: 'large',
        content: container.get()
      });
    },

    async save() {
      if (!this.currentSchema) {
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('No schema loaded', { type: 'error' });
        }
        return;
      }

      if (typeof layout === 'undefined' || !layout.confirm) return;

      layout.confirm({
        title: 'Save Changes',
        message: 'Are you sure you want to save changes to this schema? This will overwrite the existing files.',
        confirmText: 'Save',
        onConfirm: async () => {
          try {
            const schemaJson = JSON.parse(this.getSchemaEditorValue());
            const appjsonJson = JSON.parse(this.getAppjsonEditorValue());

            const res = await fetch(`${API_BASE}/api/studio/import`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ schema: schemaJson, appjson: appjsonJson })
            });

            const json = await res.json();

            if (json.success) {
              if (typeof layout !== 'undefined' && layout.toast) {
                layout.toast('Schema saved successfully!', { type: 'success' });
              }
              await this.loadCrudConfig(this.selectedResource);
            } else {
              if (typeof layout !== 'undefined' && layout.toast) {
                layout.toast(json.error || 'Failed to save schema', { type: 'error' });
              }
            }
          } catch (error) {
            console.error('Save error:', error);
            if (typeof layout !== 'undefined' && layout.toast) {
              layout.toast('Invalid JSON: ' + error.message, { type: 'error' });
            }
          }
        }
      });
    },

    getSchemaEditorValue() {
      const editor = document.getElementById('schema-editor');
      return editor ? editor.value : '';
    },

    getAppjsonEditorValue() {
      const editor = document.getElementById('appjson-editor');
      return editor ? editor.value : '';
    },

    renderEditor() {
      const editorContainer = document.getElementById('schema-designer-editor');
      if (!editorContainer) return;

      editorContainer.innerHTML = '';

      // Editors container
      const editorsWrapper = el('div').css({
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '1rem',
        height: '100%'
      });

      // Schema editor
      const schemaPanel = el('div').css({
        display: 'flex',
        flexDirection: 'column'
      });

      schemaPanel.child(el('h4').css({
        margin: '0 0 0.5rem',
        fontSize: '0.9375rem',
        fontWeight: '700',
        color: '#1e293b'
      }).text('Schema JSON'));

      const schemaEditor = el('textarea').attr('id', 'schema-editor').css({
        flex: '1',
        padding: '1rem',
        fontFamily: 'monospace',
        fontSize: '0.8125rem',
        border: '1px solid #d1d5db',
        borderRadius: '0.5rem',
        backgroundColor: '#f8fafc',
        resize: 'none',
        outline: 'none',
        minHeight: '400px'
      });
      schemaEditor.el.value = JSON.stringify(this.currentSchema, null, 2);
      schemaPanel.child(schemaEditor);

      editorsWrapper.child(schemaPanel);

      // AppJSON editor
      const appjsonPanel = el('div').css({
        display: 'flex',
        flexDirection: 'column'
      });

      appjsonPanel.child(el('h4').css({
        margin: '0 0 0.5rem',
        fontSize: '0.9375rem',
        fontWeight: '700',
        color: '#1e293b'
      }).text('AppJSON Configuration'));

      const appjsonEditor = el('textarea').attr('id', 'appjson-editor').css({
        flex: '1',
        padding: '1rem',
        fontFamily: 'monospace',
        fontSize: '0.8125rem',
        border: '1px solid #d1d5db',
        borderRadius: '0.5rem',
        backgroundColor: '#f8fafc',
        resize: 'none',
        outline: 'none',
        minHeight: '400px'
      });
      appjsonEditor.el.value = JSON.stringify(this.currentAppjson, null, 2);
      appjsonPanel.child(appjsonEditor);

      editorsWrapper.child(appjsonPanel);

      editorContainer.appendChild(editorsWrapper.get());
    },

    render() {
      const container = el('div').css({
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#f8fafc'
      });

      // Header
      const header = el('div').css({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1.5rem 2rem',
        backgroundColor: '#fff',
        borderBottom: '1px solid #e2e8f0',
        flexShrink: '0'
      });

      const titleBlock = el('div');
      titleBlock.child(el('h1').css({
        margin: '0',
        fontSize: '1.5rem',
        fontWeight: '800',
        color: '#1e293b'
      }).text('Schema Designer'));
      titleBlock.child(el('p').css({
        margin: '0.25rem 0 0',
        fontSize: '0.875rem',
        color: '#64748b'
      }).text('Advanced schema editor for power users'));

      header.child(titleBlock);
      container.child(header);

      // Toolbar
      const toolbar = el('div').css({
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '1rem 2rem',
        backgroundColor: '#fff',
        borderBottom: '1px solid #e2e8f0',
        flexShrink: '0'
      });

      // CRUD selector
      const selectorWrap = el('div').css({
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        flex: '1'
      });

      selectorWrap.child(el('label').css({
        fontWeight: '600',
        color: '#374151',
        fontSize: '0.875rem',
        whiteSpace: 'nowrap'
      }).text(`Select schema (${this.schemaList.length}):`));

      const select = el('select').css({
        padding: '0.625rem 1rem',
        borderRadius: '0.5rem',
        border: '1px solid #d1d5db',
        fontSize: '0.875rem',
        outline: 'none',
        backgroundColor: '#fff',
        minWidth: '280px',
        maxWidth: '420px'
      });

      const defaultOption = el('option').attr('value', '').text('-- Pilih schema / tabel --');
      select.child(defaultOption);

      this.schemaList.forEach(item => {
        const nm = item.name || item.resource;
        const label = item.hasCrud
          ? `${item.label || nm} (${nm})`
          : `${item.label || nm} (${nm}) · schema only`;
        const option = el('option').attr('value', nm).text(label);
        if (nm === this.selectedResource) option.el.selected = true;
        select.child(option);
      });

      select.el.addEventListener('change', (e) => {
        if (e.target.value) {
          this.loadCrudConfig(e.target.value);
        }
      });

      selectorWrap.child(select);
      toolbar.child(selectorWrap);

      // Action buttons
      const actionsWrap = el('div').css({ display: 'flex', gap: '0.5rem' });

      const validateBtn = el('button').attr('type', 'button').css({
        padding: '0.625rem 1rem',
        borderRadius: '0.5rem',
        border: '1px solid #64748b',
        backgroundColor: '#fff',
        color: '#64748b',
        fontSize: '0.875rem',
        fontWeight: '600',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      });
      validateBtn.child(el('i').class('fas fa-check-circle'));
      validateBtn.child(el('span').text('Validate'));
      validateBtn.click(() => this.validate());

      const migrationBtn = el('button').attr('type', 'button').css({
        padding: '0.625rem 1rem',
        borderRadius: '0.5rem',
        border: '1px solid #10b981',
        backgroundColor: '#fff',
        color: '#10b981',
        fontSize: '0.875rem',
        fontWeight: '600',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      });
      migrationBtn.child(el('i').class('fas fa-database'));
      migrationBtn.child(el('span').text('Generate Migration'));
      migrationBtn.click(() => this.generateMigration('postgresql'));

      const saveBtn = el('button').attr('type', 'button').css({
        padding: '0.625rem 1.5rem',
        borderRadius: '0.5rem',
        border: 'none',
        background: 'linear-gradient(135deg, #0e7490 0%, #0891b2 100%)',
        color: '#fff',
        fontSize: '0.875rem',
        fontWeight: '700',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        boxShadow: '0 4px 12px rgba(14, 116, 144, 0.28)'
      });
      saveBtn.child(el('i').class('fas fa-save'));
      saveBtn.child(el('span').text('Save'));
      saveBtn.click(() => this.save());

      actionsWrap.child(validateBtn);
      actionsWrap.child(migrationBtn);
      actionsWrap.child(saveBtn);
      toolbar.child(actionsWrap);

      container.child(toolbar);

      // Warning banner
      if (!this.selectedResource) {
        const warning = el('div').css({
          padding: '1rem 2rem',
          backgroundColor: '#fef3c7',
          borderBottom: '1px solid #f59e0b'
        });
        warning.child(el('p').css({
          margin: '0',
          fontSize: '0.875rem',
          color: '#92400e'
        }).child(el('i').class('fas fa-exclamation-triangle').css({ marginRight: '0.5rem' })).child(el('span').text('Warning: Direct schema editing requires understanding of the schema structure. Use Form Builder for guided CRUD creation.')));
        container.child(warning);
      }

      // Editor container
      const editorContainer = el('div').attr('id', 'schema-designer-editor').css({
        flex: '1',
        padding: '1.5rem 2rem',
        overflow: 'auto'
      });

      if (!this.selectedResource) {
        editorContainer.child(el('div').css({
          textAlign: 'center',
          padding: '3rem',
          color: '#94a3b8'
        }).child(el('i').class('fas fa-code').css({ fontSize: '3rem', marginBottom: '1rem' })).child(el('p').text('Select a CRUD page to edit its schema')));
      }

      container.child(editorContainer);

      if (this.selectedResource) {
        setTimeout(() => this.renderEditor(), 100);
      }

      return container.get();
    }
  };

  global.StudioSchemaDesigner = StudioSchemaDesigner;

})(typeof window !== 'undefined' ? window : global);
