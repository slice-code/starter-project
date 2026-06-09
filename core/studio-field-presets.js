// ============================================
// Studio Field Presets Manager
// ============================================
// Manage reusable field configurations
// ============================================

(function(global) {
  'use strict';

  const API_BASE = typeof window !== 'undefined' ? window.location.origin : '';
  const PRESETS_FILE = 'form-field-presets.json';

  const StudioFieldPresets = {
    presets: [],

    async init() {
      await this.loadPresets();
      return this.render();
    },

    async loadPresets() {
      try {
        const res = await fetch(`/appjson/${PRESETS_FILE}`);
        if (res.ok) {
          const data = await res.json();
          this.presetsMap = data.presets && typeof data.presets === 'object' ? data.presets : {};
          this.presets = Object.entries(this.presetsMap).map(([id, cfg]) => ({ id, ...cfg }));
        } else {
          this.presets = [];
          this.presetsMap = {};
        }
      } catch (error) {
        console.error('Load presets error:', error);
        this.presets = [];
      }
    },

    async savePresets() {
      // Note: This requires backend API to save to appjson file
      // For now, we'll just show the JSON for manual update
      this.showExportModal();
    },

    createPreset() {
      if (typeof layout === 'undefined' || !layout.modal) return;

      const presetData = {
        id: '',
        type: 'text',
        label: '',
        config: {},
        autoMatch: {
          namePattern: '',
          type: ''
        }
      };

      this.openPresetEditor(presetData, false);
    },

    editPreset(index) {
      const presetData = { ...this.presets[index] };
      this.openPresetEditor(presetData, true, index);
    },

    openPresetEditor(presetData, isEdit, index) {
      const container = el('div').css({ padding: '1rem' });

      // Preset ID
      container.child(this.createFormField('Preset ID', 'preset_id', 'text', {
        placeholder: 'e.g., id_biodata (unique identifier)',
        value: presetData.id,
        onChange: (val) => presetData.id = val
      }));

      // Type
      const fieldTypes = [
        'text', 'long_text', 'number', 'decimal', 'email',
        'date', 'datetime', 'boolean', 'select', 'foreign_key',
        'url', 'file', 'image'
      ];
      container.child(this.createSelectField('Field Type', 'preset_type', fieldTypes.map(t => ({ value: t, label: t })), {
        value: presetData.type,
        onChange: (val) => presetData.type = val
      }));

      // Label
      container.child(this.createFormField('Default Label', 'preset_label', 'text', {
        placeholder: 'e.g., Biodata ID',
        value: presetData.label || '',
        onChange: (val) => presetData.label = val
      }));

      // Config JSON
      container.child(this.createFormField('Field Config (JSON)', 'preset_config', 'textarea', {
        placeholder: '{"required": true, "showInList": true}',
        value: JSON.stringify(presetData.config || {}, null, 2),
        onChange: (val) => {
          try {
            presetData.config = JSON.parse(val);
          } catch (e) {
            presetData.config = {};
          }
        }
      }));

      // Auto-match name pattern
      container.child(this.createFormField('Auto-match Name Pattern (optional)', 'match_name', 'text', {
        placeholder: 'e.g., id_biodata or starts_with:kode_',
        value: presetData.autoMatch?.namePattern || '',
        onChange: (val) => {
          if (!presetData.autoMatch) presetData.autoMatch = {};
          presetData.autoMatch.namePattern = val;
        }
      }));

      // Auto-match type
      container.child(this.createFormField('Auto-match Type (optional)', 'match_type', 'text', {
        placeholder: 'e.g., text, select',
        value: presetData.autoMatch?.type || '',
        onChange: (val) => {
          if (!presetData.autoMatch) presetData.autoMatch = {};
          presetData.autoMatch.type = val;
        }
      }));

      layout.modal({
        title: isEdit ? 'Edit Preset' : 'Create New Preset',
        size: 'medium',
        content: container.get(),
        footer: [
          {
            text: 'Cancel',
            style: 'secondary',
            action: () => layout.closeModal()
          },
          {
            text: isEdit ? 'Update Preset' : 'Create Preset',
            style: 'primary',
            action: () => {
              if (!presetData.id || !presetData.type) {
                if (typeof layout !== 'undefined' && layout.toast) {
                  layout.toast('Preset ID and Type are required', { type: 'error' });
                }
                return;
              }

              if (isEdit) {
                this.presets[index] = presetData;
              } else {
                // Check for duplicate ID
                if (this.presets.some(p => p.id === presetData.id)) {
                  if (typeof layout !== 'undefined' && layout.toast) {
                    layout.toast('Preset ID already exists', { type: 'error' });
                  }
                  return;
                }
                this.presets.push(presetData);
              }

              layout.closeModal();
              this.savePresets();
              this.renderTable();
            }
          }
        ]
      });
    },

    deletePreset(index) {
      if (typeof layout === 'undefined' || !layout.confirm) return;

      layout.confirm({
        title: 'Delete Preset',
        message: `Are you sure you want to delete preset "${this.presets[index].id}"?`,
        onConfirm: () => {
          this.presets.splice(index, 1);
          this.savePresets();
          this.renderTable();
        }
      });
    },

    testPreset(index) {
      const preset = this.presets[index];
      if (!preset.autoMatch || (!preset.autoMatch.namePattern && !preset.autoMatch.type)) {
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('No auto-match rules configured for this preset', { type: 'info' });
        }
        return;
      }

      // Show which fields would match
      const container = el('div').css({ padding: '1rem' });

      container.child(el('p').css({
        margin: '0 0 1rem',
        fontSize: '0.9375rem',
        color: '#475569'
      }).text(`Testing preset "${preset.id}" against common field patterns:`));

      const testFields = [
        { name: 'id_biodata', type: 'text' },
        { name: 'nama_lengkap', type: 'text' },
        { name: 'kode_cabang', type: 'text' },
        { name: 'email', type: 'email' },
        { name: 'tanggal_lahir', type: 'date' },
        { name: 'is_active', type: 'boolean' },
        { name: 'category_id', type: 'select' }
      ];

      const matches = testFields.filter(field => {
        const nameMatch = !preset.autoMatch.namePattern || 
          field.name === preset.autoMatch.namePattern ||
          (preset.autoMatch.namePattern.startsWith('starts_with:') && 
           field.name.startsWith(preset.autoMatch.namePattern.replace('starts_with:', '')));
        const typeMatch = !preset.autoMatch.type || field.type === preset.autoMatch.type;
        return nameMatch && typeMatch;
      });

      const results = el('div').css({
        backgroundColor: '#f8fafc',
        padding: '1rem',
        borderRadius: '0.5rem'
      });

      if (matches.length > 0) {
        results.child(el('h4').css({ margin: '0 0 0.5rem', color: '#10b981' }).child(el('i').class('fas fa-check-circle').css({ marginRight: '0.5rem' })).child(el('span').text('Matching Fields:')));
        matches.forEach(field => {
          results.child(el('p').css({ margin: '0.25rem 0', fontSize: '0.875rem', fontFamily: 'monospace' }).text(`✓ ${field.name} (${field.type})`));
        });
      } else {
        results.child(el('p').css({ margin: '0', color: '#94a3b8' }).text('No matching fields found'));
      }

      container.child(results);

      layout.modal({
        title: 'Test Preset: ' + preset.id,
        size: 'small',
        content: container.get()
      });
    },

    showExportModal() {
      if (typeof layout === 'undefined' || !layout.modal) return;

      const container = el('div').css({ padding: '1rem' });

      container.child(el('p').css({
        margin: '0 0 1rem',
        fontSize: '0.875rem',
        color: '#475569'
      }).text('Copy this JSON and add it to `appjson/form-field-presets.json`:' ));

      const jsonEditor = el('textarea').css({
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
      jsonEditor.el.value = JSON.stringify({ presets: this.presets }, null, 2);
      jsonEditor.el.readOnly = true;
      container.child(jsonEditor);

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
      copyBtn.child(el('span').text('Copy JSON'));
      copyBtn.click(() => {
        navigator.clipboard.writeText(jsonEditor.el.value).then(() => {
          if (typeof layout !== 'undefined' && layout.toast) {
            layout.toast('JSON copied to clipboard!', { type: 'success' });
          }
        });
      });

      container.child(copyBtn);

      layout.modal({
        title: 'Export Presets',
        size: 'large',
        content: container.get()
      });
    },

    renderTable() {
      const tableContainer = document.getElementById('presets-table-container');
      if (!tableContainer) return;

      tableContainer.innerHTML = '';

      if (this.presets.length === 0) {
        tableContainer.innerHTML = `
          <div style="text-align: center; padding: 3rem; color: #94a3b8;">
            <i class="fas fa-puzzle-piece" style="font-size: 3rem; margin-bottom: 1rem;"></i>
            <p>No presets created yet. Click "Create Preset" to start.</p>
          </div>
        `;
        return;
      }

      const table = el('table').css({
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.875rem'
      });

      // Header
      const thead = el('thead');
      const headerRow = el('tr').css({ backgroundColor: '#f1f5f9' });
      ['ID', 'Type', 'Label', 'Auto-match', 'Actions'].forEach(text => {
        const th = el('th').css({
          padding: '0.75rem',
          textAlign: 'left',
          fontWeight: '700',
          color: '#475569',
          borderBottom: '2px solid #e2e8f0'
        }).text(text);
        headerRow.child(th);
      });
      thead.child(headerRow);
      table.child(thead);

      // Body
      const tbody = el('tbody');
      this.presets.forEach((preset, index) => {
        const row = el('tr').css({
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: index % 2 === 0 ? '#fff' : '#f8fafc'
        });

        // ID
        row.child(el('td').css({ padding: '0.75rem', fontFamily: 'monospace', color: '#0e7490', fontWeight: '600' }).text(preset.id));

        // Type
        row.child(el('td').css({ padding: '0.75rem' }).child(el('code').css({
          backgroundColor: '#f1f5f9',
          padding: '0.25rem 0.5rem',
          borderRadius: '0.25rem',
          fontSize: '0.8125rem'
        }).text(preset.type)));

        // Label
        row.child(el('td').css({ padding: '0.75rem' }).text(preset.label || '-'));

        // Auto-match
        const autoMatchText = [];
        if (preset.autoMatch?.namePattern) autoMatchText.push(`name="${preset.autoMatch.namePattern}"`);
        if (preset.autoMatch?.type) autoMatchText.push(`type="${preset.autoMatch.type}"`);
        row.child(el('td').css({ padding: '0.75rem', fontSize: '0.8125rem', color: '#64748b' }).text(autoMatchText.length > 0 ? autoMatchText.join(' + ') : '-'));

        // Actions
        const actionsCell = el('td').css({ padding: '0.75rem' });
        const actionBtns = el('div').css({ display: 'flex', gap: '0.5rem' });

        const editBtn = el('button').attr('type', 'button').css({
          padding: '0.375rem 0.75rem',
          border: '1px solid #0e7490',
          backgroundColor: '#fff',
          color: '#0e7490',
          borderRadius: '0.375rem',
          cursor: 'pointer',
          fontSize: '0.75rem',
          fontWeight: '600'
        });
        editBtn.child(el('i').class('fas fa-edit'));
        editBtn.click(() => this.editPreset(index));

        const testBtn = el('button').attr('type', 'button').css({
          padding: '0.375rem 0.75rem',
          border: '1px solid #10b981',
          backgroundColor: '#fff',
          color: '#10b981',
          borderRadius: '0.375rem',
          cursor: 'pointer',
          fontSize: '0.75rem',
          fontWeight: '600'
        });
        testBtn.child(el('i').class('fas fa-vial'));
        testBtn.click(() => this.testPreset(index));

        const deleteBtn = el('button').attr('type', 'button').css({
          padding: '0.375rem 0.75rem',
          border: '1px solid #dc2626',
          backgroundColor: '#fff',
          color: '#dc2626',
          borderRadius: '0.375rem',
          cursor: 'pointer',
          fontSize: '0.75rem',
          fontWeight: '600'
        });
        deleteBtn.child(el('i').class('fas fa-trash'));
        deleteBtn.click(() => this.deletePreset(index));

        actionBtns.child(editBtn);
        actionBtns.child(testBtn);
        actionBtns.child(deleteBtn);
        actionsCell.child(actionBtns);
        row.child(actionsCell);

        tbody.child(row);
      });
      table.child(tbody);

      tableContainer.appendChild(table.get());
    },

    createFormField(label, name, type, options = {}) {
      const field = el('div').css({ marginBottom: '1rem' });
      field.child(el('label').css({
        display: 'block',
        marginBottom: '0.5rem',
        fontWeight: '600',
        color: '#374151',
        fontSize: '0.875rem'
      }).text(label));

      if (type === 'textarea') {
        const textarea = el('textarea').attr('placeholder', options.placeholder || '').css({
          width: '100%',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          border: '1px solid #d1d5db',
          fontSize: '0.8125rem',
          outline: 'none',
          minHeight: '100px',
          resize: 'vertical',
          fontFamily: 'monospace'
        });
        if (options.value) textarea.el.value = options.value;
        textarea.el.addEventListener('input', (e) => {
          if (options.onChange) options.onChange(e.target.value);
        });
        field.child(textarea);
      } else {
        const input = el('input').attr('type', type).attr('placeholder', options.placeholder || '').css({
          width: '100%',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          border: '1px solid #d1d5db',
          fontSize: '0.875rem',
          outline: 'none'
        });
        if (options.value) input.el.value = options.value;
        input.el.addEventListener('input', (e) => {
          if (options.onChange) options.onChange(e.target.value);
        });
        field.child(input);
      }

      return field.get();
    },

    createSelectField(label, name, options, config = {}) {
      const field = el('div').css({ marginBottom: '1rem' });
      field.child(el('label').css({
        display: 'block',
        marginBottom: '0.5rem',
        fontWeight: '600',
        color: '#374151',
        fontSize: '0.875rem'
      }).text(label));

      const select = el('select').css({
        width: '100%',
        padding: '0.75rem',
        borderRadius: '0.5rem',
        border: '1px solid #d1d5db',
        fontSize: '0.875rem',
        outline: 'none',
        backgroundColor: '#fff'
      });

      options.forEach(opt => {
        const option = el('option').attr('value', opt.value).text(opt.label);
        if (opt.value === config.value) option.el.selected = true;
        select.child(option);
      });

      select.el.addEventListener('change', (e) => {
        if (config.onChange) config.onChange(e.target.value);
      });

      field.child(select);
      return field.get();
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
      }).text('Field Presets Manager'));
      titleBlock.child(el('p').css({
        margin: '0.25rem 0 0',
        fontSize: '0.875rem',
        color: '#64748b'
      }).text('Manage reusable field configurations for auto-fill'));

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
      createBtn.child(el('span').text('Create Preset'));
      createBtn.click(() => this.createPreset());

      header.child(titleBlock);
      header.child(createBtn);
      container.child(header);

      // Info banner
      const infoBanner = el('div').css({
        padding: '1rem 2rem',
        backgroundColor: '#f0fdfa',
        borderBottom: '1px solid #14b8a6'
      });
      infoBanner.child(el('p').css({
        margin: '0',
        fontSize: '0.875rem',
        color: '#0f766e'
      }).child(el('i').class('fas fa-info-circle').css({ marginRight: '0.5rem' })).child(el('span').text('Field presets allow you to define reusable field configurations that can be automatically applied based on field name or type patterns.')));
      container.child(infoBanner);

      // Table container
      const tableContainer = el('div').attr('id', 'presets-table-container').css({
        flex: '1',
        padding: '1.5rem 2rem',
        overflow: 'auto'
      });
      container.child(tableContainer);

      setTimeout(() => this.renderTable(), 100);

      return container.get();
    }
  };

  global.StudioFieldPresets = StudioFieldPresets;

})(typeof window !== 'undefined' ? window : global);
