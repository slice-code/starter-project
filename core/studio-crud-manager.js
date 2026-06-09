// ============================================
// Studio CRUD Manager - Main Dashboard
// ============================================
// List, create, edit, delete CRUD pages
// ============================================

(function(global) {
  'use strict';

  const API_BASE = typeof window !== 'undefined' ? window.location.origin : '';

  const StudioCrudManager = {
    crudList: [],
    filteredList: [],
    searchQuery: '',

    async init() {
      await this.loadCrudList();
      return this.render();
    },

    async loadCrudList() {
      try {
        const res = await fetch(`${API_BASE}/api/studio/crud-list`, {
          credentials: 'include'
        });
        const json = await res.json();
        if (json.success) {
          this.crudList = json.data || [];
          this.filteredList = [...this.crudList];
        } else {
          if (typeof layout !== 'undefined' && layout.toast) {
            layout.toast('Failed to load CRUD list', { type: 'error' });
          }
        }
      } catch (error) {
        console.error('Load CRUD list error:', error);
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('Network error loading CRUD list', { type: 'error' });
        }
      }
    },

    filterList(query) {
      this.searchQuery = query.toLowerCase();
      if (!this.searchQuery) {
        this.filteredList = [...this.crudList];
      } else {
        this.filteredList = this.crudList.filter(item => {
          return (
            (item.name && item.name.toLowerCase().includes(this.searchQuery)) ||
            (item.title && item.title.toLowerCase().includes(this.searchQuery)) ||
            (item.resource && item.resource.toLowerCase().includes(this.searchQuery))
          );
        });
      }
      this.updateList();
    },

    updateList() {
      const slot = this.listSlot;
      if (!slot) return;

      slot.empty();

      if (this.filteredList.length === 0) {
        slot.child(
          el('div').css({ textAlign: 'center', padding: '3rem', color: '#94a3b8' }).child([
            el('i').class('fas fa-inbox').css({ fontSize: '3rem', marginBottom: '1rem', display: 'block' }),
            el('p').css({ margin: 0 }).text(
              this.searchQuery ? 'No CRUD pages match your search' : 'No CRUD pages yet. Create your first one!'
            )
          ])
        );
        slot.get();
        return;
      }

      this.filteredList.forEach((item) => {
        slot.child(this.createCrudCard(item));
      });
      slot.get();
    },

    createCrudCard(item) {
      const card = el('div').css({
        backgroundColor: '#fff',
        borderRadius: '0.75rem',
        padding: '1.25rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        border: '1px solid #e2e8f0',
        marginBottom: '1rem',
        transition: 'all 0.2s'
      });

      card.el.onmouseenter = () => {
        card.css({ boxShadow: '0 4px 12px rgba(0,0,0,0.15)', transform: 'translateY(-2px)' });
      };
      card.el.onmouseleave = () => {
        card.css({ boxShadow: '0 1px 3px rgba(0,0,0,0.1)', transform: 'translateY(0)' });
      };

      // Header
      const header = el('div').css({
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        marginBottom: '0.75rem'
      });

      const iconBox = el('div').css({
        width: '48px',
        height: '48px',
        borderRadius: '0.625rem',
        background: 'linear-gradient(135deg, #0e7490 0%, #0891b2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: '0'
      });
      iconBox.child(el('i').class(item.icon || 'fas fa-table').css({
        color: '#fff',
        fontSize: '1.25rem'
      }));

      const titleBlock = el('div').css({ flex: '1', minWidth: '0' });
      titleBlock.child(el('h3').css({
        margin: '0',
        fontSize: '1.125rem',
        fontWeight: '700',
        color: '#1e293b',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }).text(item.title || item.name));

      titleBlock.child(el('p').css({
        margin: '0.25rem 0 0',
        fontSize: '0.8125rem',
        color: '#64748b'
      }).text(`/${item.name || item.resource}`));

      header.child(iconBox);
      header.child(titleBlock);
      card.child(header);

      // Meta info
      const meta = el('div').css({
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem',
        marginBottom: '1rem',
        fontSize: '0.8125rem',
        color: '#475569'
      });

      meta.child(el('span').child(el('i').class('fas fa-columns').css({ marginRight: '0.35rem' })).child(el('span').text(`${item.fieldsCount || 0} fields`)));
      meta.child(el('span').child(el('i').class('fas fa-window-maximize').css({ marginRight: '0.35rem' })).child(el('span').text(item.formDisplay || 'modal')));
      
      if (item.permissions && item.permissions.length > 0) {
        meta.child(el('span').child(el('i').class('fas fa-users').css({ marginRight: '0.35rem' })).child(el('span').text(item.permissions.slice(0, 3).join(', ') + (item.permissions.length > 3 ? '...' : ''))));
      }

      card.child(meta);

      // Actions
      const actions = el('div').css({
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap'
      });

      // Edit button
      const editBtn = el('button').attr('type', 'button').css({
        padding: '0.5rem 1rem',
        borderRadius: '0.5rem',
        border: '1px solid #0e7490',
        background: '#fff',
        color: '#0e7490',
        fontSize: '0.8125rem',
        fontWeight: '600',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem'
      });
      editBtn.child(el('i').class('fas fa-edit'));
      editBtn.child(el('span').text('Edit'));
      editBtn.click(() => this.editCrud(item.name));
      actions.child(editBtn);

      // Preview button
      const previewBtn = el('button').attr('type', 'button').css({
        padding: '0.5rem 1rem',
        borderRadius: '0.5rem',
        border: '1px solid #64748b',
        background: '#fff',
        color: '#64748b',
        fontSize: '0.8125rem',
        fontWeight: '600',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem'
      });
      previewBtn.child(el('i').class('fas fa-eye'));
      previewBtn.child(el('span').text('Preview'));
      previewBtn.click(() => this.previewCrud(item.name));
      actions.child(previewBtn);

      // Delete button
      const deleteBtn = el('button').attr('type', 'button').css({
        padding: '0.5rem 1rem',
        borderRadius: '0.5rem',
        border: '1px solid #dc2626',
        background: '#fff',
        color: '#dc2626',
        fontSize: '0.8125rem',
        fontWeight: '600',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        marginLeft: 'auto'
      });
      deleteBtn.child(el('i').class('fas fa-trash'));
      deleteBtn.child(el('span').text('Delete'));
      deleteBtn.click(() => this.deleteCrud(item.name, item.title));
      actions.child(deleteBtn);

      card.child(actions);

      return card.get();
    },

    async editCrud(resourceName) {
      try {
        const res = await fetch(`${API_BASE}/api/studio/crud/${resourceName}`, {
          credentials: 'include'
        });
        const json = await res.json();
        
        if (json.success) {
          // Navigate to form builder with existing data
          if (typeof window !== 'undefined') {
            window.__studioEditData = json;
            layout.navigate('/studio/form-builder?mode=edit&resource=' + resourceName);
          }
        } else {
          if (typeof layout !== 'undefined' && layout.toast) {
            layout.toast('Failed to load CRUD config', { type: 'error' });
          }
        }
      } catch (error) {
        console.error('Edit CRUD error:', error);
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('Network error loading CRUD config', { type: 'error' });
        }
      }
    },

    async previewCrud(resourceName) {
      try {
        const res = await fetch(`${API_BASE}/api/studio/crud/${resourceName}`, {
          credentials: 'include'
        });
        const json = await res.json();

        if (json.success && typeof layout !== 'undefined') {
          const title = json.appjson?.config?.title || resourceName;
          let content;
          if (typeof StudioPreview !== 'undefined' && typeof StudioCrudConfig !== 'undefined') {
            const formData = StudioCrudConfig.normalizeFormData(
              StudioCrudConfig.extractStudioConfig(json.schema || {}, json.appjson || {})
            );
            content = StudioPreview.buildPreviewTabs(formData, json.appjson);
          } else {
            content = this.renderPreview(json);
          }
          layout.modal({
            title: `Preview: ${title}`,
            size: 'large',
            content
          });
        }
      } catch (error) {
        console.error('Preview CRUD error:', error);
      }
    },

    renderPreview(data) {
      const container = el('div').css({ padding: '1rem' });

      // Schema preview
      container.child(el('h4').css({ marginBottom: '0.5rem', color: '#1e293b' }).text('Schema'));
      const schemaPreview = el('pre').css({
        backgroundColor: '#f1f5f9',
        padding: '1rem',
        borderRadius: '0.5rem',
        fontSize: '0.75rem',
        overflow: 'auto',
        maxHeight: '300px',
        marginBottom: '1.5rem'
      });
      schemaPreview.el.textContent = JSON.stringify(data.schema, null, 2);
      container.child(schemaPreview);

      // AppJSON preview
      container.child(el('h4').css({ marginBottom: '0.5rem', color: '#1e293b' }).text('AppJSON'));
      const appjsonPreview = el('pre').css({
        backgroundColor: '#f1f5f9',
        padding: '1rem',
        borderRadius: '0.5rem',
        fontSize: '0.75rem',
        overflow: 'auto',
        maxHeight: '300px'
      });
      appjsonPreview.el.textContent = JSON.stringify(data.appjson, null, 2);
      container.child(appjsonPreview);

      return container.get();
    },

    async deleteCrud(resourceName, resourceTitle) {
      if (typeof layout === 'undefined' || !layout.confirm) {
        return;
      }

      layout.confirm({
        title: 'Delete CRUD Page',
        message: `Are you sure you want to delete "${resourceTitle}"? This will remove both schema and appjson files. A backup will be created automatically.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        onConfirm: async () => {
          try {
            const res = await fetch(`${API_BASE}/api/studio/crud/${resourceName}`, {
              method: 'DELETE',
              credentials: 'include'
            });
            const json = await res.json();

            if (json.success) {
              if (typeof layout !== 'undefined' && layout.toast) {
                layout.toast('CRUD page deleted successfully', { type: 'success' });
              }
              await this.loadCrudList();
              this.updateList();
            } else {
              if (typeof layout !== 'undefined' && layout.toast) {
                layout.toast(json.error || 'Failed to delete CRUD page', { type: 'error' });
              }
            }
          } catch (error) {
            console.error('Delete CRUD error:', error);
            if (typeof layout !== 'undefined' && layout.toast) {
              layout.toast('Network error deleting CRUD page', { type: 'error' });
            }
          }
        }
      });
    },

    render() {
      const container = el('div').css({
        display: 'flex',
        flexDirection: 'column',
        flex: '1',
        minHeight: '0',
        height: '100%',
        overflow: 'hidden',
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
      }).text('CRUD Manager'));
      titleBlock.child(el('p').css({
        margin: '0.25rem 0 0',
        fontSize: '0.875rem',
        color: '#64748b'
      }).text('Create and manage CRUD pages without coding'));

      const createBtn = el('button').attr('type', 'button').css({
        padding: '0.75rem 1.5rem',
        borderRadius: '0.625rem',
        border: 'none',
        background: 'linear-gradient(135deg, #0e7490 0%, #0891b2 100%)',
        color: '#fff',
        fontSize: '0.9375rem',
        fontWeight: '700',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        boxShadow: '0 4px 12px rgba(14, 116, 144, 0.28)'
      });
      createBtn.child(el('i').class('fas fa-plus'));
      createBtn.child(el('span').text('Create New CRUD'));
      createBtn.click(() => {
        layout.navigate('/studio/form-builder?mode=create');
      });

      header.child(titleBlock);
      header.child(createBtn);
      container.child(header);

      // Search bar
      const searchBar = el('div').css({
        padding: '1rem 2rem',
        backgroundColor: '#fff',
        borderBottom: '1px solid #e2e8f0',
        flexShrink: '0'
      });

      const searchInput = el('input').attr('type', 'search').attr('placeholder', 'Search CRUD pages by name, title, or resource...').css({
        width: '100%',
        padding: '0.75rem 1rem 0.75rem 2.5rem',
        borderRadius: '0.5rem',
        border: '1px solid #d1d5db',
        fontSize: '0.9375rem',
        outline: 'none',
        backgroundColor: '#f8fafc'
      });
      searchInput.el.addEventListener('input', (e) => {
        this.filterList(e.target.value);
      });

      const searchWrap = el('div').css({
        position: 'relative'
      });
      searchWrap.child(el('i').class('fas fa-search').css({
        position: 'absolute',
        left: '1rem',
        top: '50%',
        transform: 'translateY(-50%)',
        color: '#94a3b8',
        pointerEvents: 'none'
      }));
      searchWrap.child(searchInput);
      searchBar.child(searchWrap);
      container.child(searchBar);

      // Stats bar
      const statsBar = el('div').css({
        padding: '0.75rem 2rem',
        backgroundColor: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        gap: '2rem',
        fontSize: '0.8125rem',
        color: '#64748b',
        flexShrink: '0'
      });
      statsBar.child(el('span').child(el('i').class('fas fa-table').css({ marginRight: '0.35rem' })).child(el('span').text(`Total: ${this.crudList.length} CRUD pages`)));
      container.child(statsBar);

      // List container
      this.listSlot = el('div').attr('id', 'studio-crud-list').css({
        flex: '1',
        minHeight: '0',
        padding: '1.5rem 2rem',
        overflowY: 'auto'
      });
      container.child(this.listSlot);

      const root = container.get();
      this.updateList();
      return root;
    }
  };

  global.StudioCrudManager = StudioCrudManager;

})(typeof window !== 'undefined' ? window : global);
