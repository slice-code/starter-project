// Studio Database Manager — schema JSON ↔ DB sync
(function (global) {
  'use strict';

  const API_BASE = typeof window !== 'undefined' ? window.location.origin : '';

  const StudioDatabaseManager = {
    schemas: [],
    selected: null,
    schemaData: null,
    dbStatus: null,
    search: '',
    listSlot: null,
    detailSlot: null,

  async init() {
    this.schemas = [];
    this.loadError = null;
    const dom = this.render();
    await this.loadSchemas();
    this.updateList();
    this.updateHeaderMeta();
    return dom;
  },

  normalizeSchemaItem(s) {
    return {
      name: s.name || '',
      label: s.label || s.name || '',
      fieldCount: s.fieldCount ?? s.fieldsCount ?? 0,
      primaryKey: s.primaryKey || 'id',
      hasCrud: !!s.hasCrud,
      icon: s.icon || 'fas fa-database'
    };
  },

  async loadSchemas() {
    this.loadError = null;
    try {
      let json = null;
      const studioRes = await fetch(`${API_BASE}/api/studio/schema-list`, { credentials: 'include' });
      if (studioRes.ok) {
        json = await studioRes.json();
      }
      if (!json?.success) {
        const pubRes = await fetch(`${API_BASE}/api/schema`, { credentials: 'include' });
        if (!pubRes.ok) {
          throw new Error(`HTTP ${pubRes.status}`);
        }
        json = await pubRes.json();
      }
      if (json?.success && Array.isArray(json.data)) {
        this.schemas = json.data.map((s) => this.normalizeSchemaItem(s));
      } else {
        this.schemas = [];
        this.loadError = json?.error || 'Gagal memuat daftar schema';
      }
    } catch (e) {
      console.error('Load schemas error:', e);
      this.schemas = [];
      this.loadError = e.message || 'Network error';
    }
  },

    filteredSchemas() {
      const q = this.search.trim().toLowerCase();
      if (!q) return this.schemas;
      return this.schemas.filter((s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.label || '').toLowerCase().includes(q)
      );
    },

    async selectSchema(name) {
      this.selected = name;
      this.schemaData = null;
      this.dbStatus = null;
      this.renderDetail();
      try {
        let json = null;
        const studioRes = await fetch(`${API_BASE}/api/studio/schema/${encodeURIComponent(name)}`, { credentials: 'include' });
        if (studioRes.ok) json = await studioRes.json();
        if (!json?.success) {
          const pubRes = await fetch(`${API_BASE}/api/schema/${encodeURIComponent(name)}`, { credentials: 'include' });
          if (pubRes.ok) {
            const pub = await pubRes.json();
            if (pub.success) {
              json = { success: true, schema: pub.data, dbStatus: null };
            }
          }
        }
        if (json?.success) {
          this.schemaData = json.schema;
          this.dbStatus = json.dbStatus || null;
          if (!this.dbStatus) await this.refreshDbStatus();
          else this.renderDetail();
        } else {
          layout?.toast?.('Schema tidak ditemukan', { type: 'error' });
        }
      } catch (e) {
        console.error('Load schema detail error:', e);
        layout?.toast?.('Gagal memuat schema', { type: 'error' });
      }
    },

    statusBadge(item) {
      if (!item._dbLoaded) return { text: '—', color: '#94a3b8', bg: '#f1f5f9' };
      if (!item._tableExists) return { text: 'No table', color: '#b45309', bg: '#fef3c7' };
      if (item._inSync) return { text: 'Synced', color: '#047857', bg: '#d1fae5' };
      return { text: 'Pending', color: '#b91c1c', bg: '#fee2e2' };
    },

    async refreshDbStatus() {
      if (!this.selected) return;
      try {
        const res = await fetch(`${API_BASE}/api/studio/schema/${encodeURIComponent(this.selected)}/db-status`, { credentials: 'include' });
        const json = await res.json();
        if (json.success) {
          this.dbStatus = json;
          this.renderDetail();
        }
      } catch (_) { /* ignore */ }
    },

    async saveSchema() {
      if (!this.schemaEditorSlot) return;
      const ta = this.schemaEditorSlot.el.querySelector('textarea');
      if (!ta) return;
      try {
        const schemaJson = JSON.parse(ta.value);
        const res = await fetch(`${API_BASE}/api/studio/schema/${encodeURIComponent(schemaJson.name || this.selected)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(schemaJson)
        });
        const json = await res.json();
        if (json.success) {
          layout?.toast?.('Schema saved', { type: 'success' });
          this.schemaData = schemaJson;
          await this.loadSchemas();
          await this.refreshDbStatus();
          this.updateList();
        } else {
          layout?.toast?.(json.error || 'Save failed', { type: 'error' });
        }
      } catch (e) {
        layout?.toast?.('Invalid JSON: ' + e.message, { type: 'error' });
      }
    },

    async showSyncSql() {
      if (!this.selected) return;
      const res = await fetch(`${API_BASE}/api/studio/schema/${encodeURIComponent(this.selected)}/sync-sql`, { credentials: 'include' });
      const json = await res.json();
      if (!json.success || !layout?.modal) return;

      const pre = el('pre').css({
        backgroundColor: '#f1f5f9', padding: '1rem', borderRadius: '0.5rem',
        fontSize: '0.75rem', overflow: 'auto', maxHeight: '60vh', margin: 0
      });
      pre.el.textContent = json.sql || '';
      layout.modal({ title: `Migration SQL: ${this.selected}`, size: 'large', content: pre });
    },

    async applySync() {
      if (!this.selected || !layout?.confirm) return;
      layout.confirm({
        title: 'Sync to Database',
        message: `Apply schema "${this.selected}" ke database? (CREATE TABLE + ADD kolom baru)`,
        confirmText: 'Sync',
        onConfirm: async () => {
          const res = await fetch(`${API_BASE}/api/studio/schema/${encodeURIComponent(this.selected)}/sync-db`, {
            method: 'POST',
            credentials: 'include'
          });
          const json = await res.json();
          if (json.success) {
            layout?.toast?.(json.message || 'Synced', { type: 'success' });
            await this.refreshDbStatus();
          } else {
            layout?.toast?.(json.error || 'Sync failed', { type: 'error' });
          }
        }
      });
    },

    renderFieldsTable(schema) {
      const wrap = el('div').css({ overflowX: 'auto', marginBottom: '1rem' });
      const table = el('table').css({ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' });
      const hr = el('tr').css({ backgroundColor: '#f1f5f9' });
      ['Field', 'Type', 'Required', 'PK', 'Default'].forEach((h) => {
        hr.child(el('th').css({ padding: '0.5rem', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }).text(h));
      });
      table.child(hr);
      const pk = schema.primaryKey || 'id';
      (schema.fields || []).forEach((f) => {
        const row = el('tr').css({ borderBottom: '1px solid #e2e8f0' });
        row.child(el('td').css({ padding: '0.5rem', fontFamily: 'monospace', color: '#0e7490' }).text(f.name));
        row.child(el('td').css({ padding: '0.5rem' }).text(f.type || 'text'));
        row.child(el('td').css({ padding: '0.5rem', textAlign: 'center' }).text(f.required ? '✓' : ''));
        row.child(el('td').css({ padding: '0.5rem', textAlign: 'center' }).text(f.name === pk || f.autoIncrement ? '✓' : ''));
        row.child(el('td').css({ padding: '0.5rem', color: '#64748b' }).text(f.defaultValue !== undefined ? String(f.defaultValue) : '—'));
        table.child(row);
      });
      wrap.child(table);
      return wrap;
    },

    renderDbCompare() {
      const st = this.dbStatus;
      if (!st) {
        return el('p').css({ color: '#94a3b8' }).text('Memuat status DB...');
      }
      const box = el('div').css({
        padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '0.5rem',
        border: '1px solid #e2e8f0', marginBottom: '1rem'
      });

      const grid = el('div').css({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' });
      [
        ['Tabel DB', st.tableExists ? 'Ada' : 'Belum ada'],
        ['Kolom schema', String(st.schemaFieldCount || 0)],
        ['Kolom DB', String(st.dbColumnCount || 0)],
        ['Status', st.inSync ? 'Sinkron' : 'Perlu sync']
      ].forEach(([k, v]) => {
        const cell = el('div').css({ padding: '0.5rem', backgroundColor: '#fff', borderRadius: '0.375rem', border: '1px solid #e2e8f0' });
        cell.child(el('div').css({ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.15rem' }).text(k));
        cell.child(el('div').css({ fontWeight: '700', color: '#1e293b', fontSize: '0.875rem' }).text(v));
        grid.child(cell);
      });
      box.child(grid);

      if (st.missingInDb?.length) {
        box.child(el('p').css({ margin: '0 0 0.35rem', fontSize: '0.8125rem', fontWeight: '600', color: '#b91c1c' }).text('Kolom di schema, belum di DB:'));
        box.child(el('p').css({ margin: '0 0 0.75rem', fontFamily: 'monospace', fontSize: '0.8125rem', color: '#475569' }).text(st.missingInDb.join(', ')));
      }
      if (st.extraInDb?.length) {
        box.child(el('p').css({ margin: '0 0 0.35rem', fontSize: '0.8125rem', fontWeight: '600', color: '#b45309' }).text('Kolom di DB, tidak di schema (legacy):'));
        box.child(el('p').css({ margin: 0, fontFamily: 'monospace', fontSize: '0.8125rem', color: '#475569' }).text(st.extraInDb.join(', ')));
      }
      return box;
    },

    renderDetail() {
      const slot = this.detailSlot;
      if (!slot) return;
      slot.empty();

      if (!this.selected || !this.schemaData) {
        slot.child(el('div').css({ textAlign: 'center', padding: '3rem', color: '#94a3b8' })
          .child(el('i').class('fas fa-database').css({ fontSize: '3rem', marginBottom: '1rem', display: 'block' }))
          .child(el('p').text('Pilih schema dari daftar kiri')));
        slot.get();
        return;
      }

      const schema = this.schemaData;
      const header = el('div').css({ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' });
      const titleBlock = el('div');
      titleBlock.child(el('h2').css({ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: '#1e293b' }).text(schema.label || schema.name));
      titleBlock.child(el('p').css({ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: '#64748b', fontFamily: 'monospace' }).text(`table: ${schema.name} · PK: ${schema.primaryKey || 'id'}`));

      const actions = el('div').css({ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' });
      const mkBtn = (label, icon, style, fn) => {
        const b = el('button').attr('type', 'button').css({
          padding: '0.5rem 0.875rem', borderRadius: '0.375rem', cursor: 'pointer',
          fontSize: '0.8125rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.35rem',
          ...style
        });
        b.child(el('i').class(icon));
        b.child(el('span').text(label));
        b.click(fn);
        return b;
      };

      actions.child(mkBtn('Save JSON', 'fas fa-save', { border: 'none', background: 'linear-gradient(135deg, #0e7490, #0891b2)', color: '#fff' }, () => this.saveSchema()));
      actions.child(mkBtn('SQL', 'fas fa-code', { border: '1px solid #10b981', background: '#fff', color: '#10b981' }, () => this.showSyncSql()));
      actions.child(mkBtn('Sync DB', 'fas fa-sync', { border: '1px solid #6366f1', background: '#fff', color: '#6366f1' }, () => this.applySync()));
      if (schema.name) {
        actions.child(mkBtn('Form Builder', 'fas fa-hammer', { border: '1px solid #d1d5db', background: '#fff', color: '#475569' }, () => {
          layout?.navigate?.(`/studio/form-builder#?mode=edit&resource=${encodeURIComponent(schema.name)}`);
        }));
      }

      header.child(titleBlock);
      header.child(actions);
      slot.child(header);

      slot.child(this.renderDbCompare());
      slot.child(el('h3').css({ margin: '0 0 0.5rem', fontSize: '0.9375rem', fontWeight: '700', color: '#475569' }).text('Fields'));
      slot.child(this.renderFieldsTable(schema));

      slot.child(el('h3').css({ margin: '1rem 0 0.5rem', fontSize: '0.9375rem', fontWeight: '700', color: '#475569' }).text('Schema JSON'));
      this.schemaEditorSlot = el('div');
      const ta = el('textarea').css({
        width: '100%', minHeight: '280px', padding: '1rem', fontFamily: 'monospace',
        fontSize: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.5rem',
        backgroundColor: '#f8fafc', resize: 'vertical', outline: 'none', boxSizing: 'border-box'
      });
      ta.el.value = JSON.stringify(schema, null, 2);
      this.schemaEditorSlot.child(ta);
      slot.child(this.schemaEditorSlot);

      slot.get();
    },

    createSchemaRow(item) {
      const row = el('div').css({
        padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', cursor: 'pointer',
        backgroundColor: this.selected === item.name ? '#ecfeff' : '#fff',
        transition: 'background 0.15s'
      });
      row.click(() => this.selectSchema(item.name));

      const top = el('div').css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' });
      top.child(el('span').css({ fontWeight: '700', fontSize: '0.875rem', color: '#1e293b' }).text(item.label || item.name));
      if (item.hasCrud) {
        top.child(el('span').css({ fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '0.25rem', backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: '600' }).text('CRUD'));
      }
      row.child(top);
      row.child(el('div').css({ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace', marginTop: '0.2rem' }).text(`${item.name} · ${item.fieldCount} fields`));
      return row;
    },

    updateHeaderMeta() {
      if (!this.metaSlot) return;
      this.metaSlot.empty();
      const n = this.schemas.length;
      const txt = this.loadError
        ? `Error: ${this.loadError}`
        : `${n} schema di folder schema/`;
      this.metaSlot.child(el('span').css({
        fontSize: '0.8125rem',
        color: this.loadError ? '#dc2626' : '#64748b'
      }).text(txt));
      this.metaSlot.get();
    },

    updateList() {
      const slot = this.listSlot;
      if (!slot) return;
      slot.empty();
      if (this.loadError) {
        slot.child(el('p').css({ padding: '1rem', color: '#dc2626', fontSize: '0.875rem' }).text(this.loadError));
        slot.get();
        return;
      }
      const items = this.filteredSchemas();
      if (!items.length) {
        slot.child(el('p').css({ padding: '1rem', color: '#94a3b8' }).text(
          this.search ? 'Tidak ada schema cocok' : 'Memuat schema...'
        ));
      } else {
        items.forEach((item) => slot.child(this.createSchemaRow(item)));
      }
      slot.get();
    },

    render() {
      const root = el('div').css({ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#f8fafc' });

      const header = el('div').css({
        padding: '1.25rem 1.5rem', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0
      });
      header.child(el('h1').css({ margin: 0, fontSize: '1.35rem', fontWeight: '800', color: '#1e293b' }).text('Database Manager'));
      this.metaSlot = el('div');
      header.child(this.metaSlot);
      header.child(el('p').css({ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#64748b' }).text('Kelola schema JSON (schema/) dan sinkronisasi ke database'));
      root.child(header);

      const body = el('div').css({ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' });

      const sidebar = el('div').css({
        width: '320px', flexShrink: 0, backgroundColor: '#fff', borderRight: '1px solid #e2e8f0',
        display: 'flex', flexDirection: 'column', minHeight: 0
      });

      const searchWrap = el('div').css({ padding: '0.75rem', borderBottom: '1px solid #e2e8f0' });
      const searchInput = el('input').attr('type', 'text').attr('placeholder', 'Cari tabel...').css({
        width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.375rem',
        border: '1px solid #d1d5db', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box'
      });
      searchInput.el.value = this.search;
      searchInput.el.addEventListener('input', (e) => {
        this.search = e.target.value;
        this.updateList();
      });
      searchWrap.child(searchInput);
      sidebar.child(searchWrap);

      this.listSlot = el('div').css({ flex: 1, overflowY: 'auto' });
      sidebar.child(this.listSlot);

      this.detailSlot = el('div').css({ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1.25rem 1.5rem' });
      body.child(sidebar);
      body.child(this.detailSlot);
      root.child(body);

      const dom = root.get();
      this.updateHeaderMeta();
      this.updateList();
      this.renderDetail();
      return dom;
    }
  };

  global.StudioDatabaseManager = StudioDatabaseManager;
})(typeof window !== 'undefined' ? window : global);
