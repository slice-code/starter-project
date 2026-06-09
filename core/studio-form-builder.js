// ============================================
// Studio Form Builder - Visual CRUD Wizard
// ============================================
// Step-by-step wizard to create/edit CRUD pages
// ============================================

(function(global) {
  'use strict';

  const API_BASE = typeof window !== 'undefined' ? window.location.origin : '';
  const LOCAL_STORAGE_KEY = 'studio_form_builder_draft';

  const ICONS = [
    'fas fa-table', 'fas fa-database', 'fas fa-users', 'fas fa-user-tie',
    'fas fa-briefcase', 'fas fa-building', 'fas fa-calendar', 'fas fa-check-circle',
    'fas fa-cog', 'fas fa-file-alt', 'fas fa-folder', 'fas fa-home',
    'fas fa-id-card', 'fas fa-list', 'fas fa-money-bill', 'fas fa-paper-plane',
    'fas fa-clipboard', 'fas fa-chart-bar', 'fas fa-box', 'fas fa-car',
    'fas fa-tags', 'fas fa-medkit', 'fas fa-graduation-cap', 'fas fa-plane'
  ];

  const FIELD_TYPES = [
    { value: 'text', label: 'Text', icon: 'fas fa-font' },
    { value: 'long_text', label: 'Long Text', icon: 'fas fa-align-left' },
    { value: 'number', label: 'Number', icon: 'fas fa-hashtag' },
    { value: 'decimal', label: 'Decimal', icon: 'fas fa-dollar-sign' },
    { value: 'email', label: 'Email', icon: 'fas fa-envelope' },
    { value: 'password', label: 'Password', icon: 'fas fa-key' },
    { value: 'date', label: 'Date', icon: 'fas fa-calendar' },
    { value: 'datetime', label: 'DateTime', icon: 'fas fa-clock' },
    { value: 'boolean', label: 'Boolean', icon: 'fas fa-toggle-on' },
    { value: 'select', label: 'Select', icon: 'fas fa-list' },
    { value: 'foreign_key', label: 'Foreign Key', icon: 'fas fa-link' },
    { value: 'url', label: 'URL', icon: 'fas fa-globe' },
    { value: 'file', label: 'File', icon: 'fas fa-file-upload' },
    { value: 'image', label: 'Image', icon: 'fas fa-image' }
  ];

  const FORM_DISPLAY_OPTIONS = [
    { value: 'modal', label: 'Modal Popup' },
    { value: 'page', label: 'New Page' }
  ];

  const MODAL_SIZES = [
    { value: 'small', label: 'Small (600px)' },
    { value: 'medium', label: 'Medium (800px)' },
    { value: 'large', label: 'Large (1000px)' }
  ];

  const CUSTOM_FORM_TYPES = [
    { value: '', label: '— Auto (from field type) —' },
    { value: 'radio', label: 'radio' },
    { value: 'range', label: 'range' },
    { value: 'pptk_isi', label: 'pptk_isi' },
    { value: 'masa_kerja_duration', label: 'masa_kerja_duration' },
    { value: 'waktu_kerja', label: 'waktu_kerja' },
    { value: 'section', label: 'section (divider)' }
  ];

  const MENU_GROUP_OPTIONS = [
    'Data Master', 'Laporan', 'Transaksi Keuangan', 'Bagian BLK', 'Studio'
  ];

  const StudioFormBuilder = {
    mode: 'create',
    currentStep: 1,
    totalSteps: 6,
    formData: null,
    existingResource: null,
    presetsMap: {},

    init(mode, resourceName) {
      this.mode = mode || 'create';
      this.currentStep = 1;
      this.formData = this.getInitialState();
      this.loadFieldPresets();

      if (mode === 'edit' && resourceName) {
        return this.loadExisting(resourceName);
      }

      this.loadFromLocalStorage();
      return this.render();
    },

    async loadFieldPresets() {
      try {
        const res = await fetch(`${API_BASE}/appjson/form-field-presets.json?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          this.presetsMap = data.presets && typeof data.presets === 'object' ? data.presets : {};
        }
      } catch (e) {
        console.warn('Field presets load failed', e);
        this.presetsMap = {};
      }
    },

    getInitialState() {
      return typeof StudioCrudConfig !== 'undefined'
        ? StudioCrudConfig.normalizeFormData(null)
        : {
            resource: '', title: '', icon: 'fas fa-table', formDisplay: 'modal', modalSize: 'large',
            perPage: 25, perPageOptions: [10, 25, 50, 100], tableSearch: true, tablePagination: true,
            formColumns: 2, formGap: '1rem', permissions: [], actions: ['edit', 'delete'], fields: []
          };
    },

    emptyField() {
      return typeof StudioCrudConfig !== 'undefined'
        ? StudioCrudConfig.createEmptyField()
        : {
            name: '', label: '', type: 'text', required: false, showInList: true, showInForm: true,
            defaultValue: '', helpText: '', foreignKey: null, selectOptions: [],
            sortable: true, searchable: true, columnWidth: '', columnType: '', badgeMap: null,
            placeholder: '', colspan: 1, rows: 3, optionsFrom: null, formSearchable: false
          };
    },

    async loadExisting(resourceName) {
      try {
        const res = await fetch(`${API_BASE}/api/studio/crud/${resourceName}`, {
          credentials: 'include'
        });
        const json = await res.json();

        if (json.success) {
          this.existingResource = resourceName;
          this.formData = this.extractFromExisting(json);
          return this.render();
        } else {
          if (typeof layout !== 'undefined' && layout.toast) {
            layout.toast('Failed to load CRUD config', { type: 'error' });
          }
          layout.navigate('/studio/crud-manager');
        }
      } catch (error) {
        console.error('Load existing error:', error);
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('Network error', { type: 'error' });
        }
      }
    },

    extractFromExisting(data) {
      if (typeof StudioCrudConfig !== 'undefined') {
        return StudioCrudConfig.normalizeFormData(
          StudioCrudConfig.extractStudioConfig(data.schema || {}, data.appjson || {})
        );
      }
      const schema = data.schema || {};
      const appjson = data.appjson || {};
      const config = appjson.config || {};
      const options = appjson.options || {};
      const tableFeatures = config.table?.features || {};
      return {
        resource: schema.name || config.resource || '',
        title: schema.label || config.title || '',
        icon: config.icon || 'fas fa-table',
        formDisplay: config.formDisplay || 'modal',
        modalSize: config.modalSize || 'large',
        perPage: tableFeatures.perPage || 25,
        perPageOptions: tableFeatures.perPageOptions || [10, 25, 50, 100],
        tableSearch: tableFeatures.search !== false,
        tablePagination: tableFeatures.pagination !== false,
        formColumns: config.form?.columns || 2,
        formGap: config.form?.gap || '1rem',
        permissions: options.permissions || [],
        actions: ['edit', 'delete'],
        fields: []
      };
    },

    loadFromLocalStorage() {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) {
          const data = JSON.parse(saved);
          if (data && data.resource) {
            this.formData = typeof StudioCrudConfig !== 'undefined'
              ? StudioCrudConfig.normalizeFormData(data)
              : data;
            if (typeof layout !== 'undefined' && layout.toast) {
              layout.toast('Draft loaded from previous session', { type: 'info' });
            }
          }
        }
      } catch (error) {
        console.error('Load draft error:', error);
      }
    },

    saveToLocalStorage() {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.formData));
      } catch (error) {
        console.error('Save draft error:', error);
      }
    },

    clearLocalStorage() {
      try {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      } catch (error) {
        console.error('Clear draft error:', error);
      }
    },

    validateStep(step) {
      switch(step) {
        case 1:
          if (!this.formData.resource) return 'Resource name is required';
          if (!/^[a-z][a-z0-9_]*$/.test(this.formData.resource)) return 'Resource name must start with lowercase letter and contain only lowercase letters, numbers, and underscores';
          if (!this.formData.title) return 'Title is required';
          return null;
        case 2:
          if (this.formData.fields.length === 0) return 'At least one field is required';
          const fieldNames = this.formData.fields.map(f => f.name);
          if (new Set(fieldNames).size !== fieldNames.length) return 'Field names must be unique';
          for (const field of this.formData.fields) {
            if (!field.name) return 'All fields must have a name';
            if (!/^[a-z][a-z0-9_]*$/.test(field.name)) return `Field "${field.name}" must start with lowercase letter and contain only lowercase letters, numbers, and underscores`;
            if (field.type === 'select' && (!field.selectOptions || !field.selectOptions.length)) {
              return `Field "${field.label || field.name}" (select) needs at least one option`;
            }
          }
          return null;
        default:
          return null;
      }
    },

    async nextStep() {
      const error = this.validateStep(this.currentStep);
      if (error) {
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast(error, { type: 'error' });
        }
        return;
      }

      if (this.currentStep === this.totalSteps) {
        await this.deploy();
        return;
      }

      this.currentStep++;
      this.saveToLocalStorage();
      this.renderStep();
      this.updateWizardChrome();
    },

    prevStep() {
      if (this.currentStep > 1) {
        this.currentStep--;
        this.renderStep();
        this.updateWizardChrome();
      }
    },

    async deploy() {
      if (typeof layout === 'undefined' || !layout.toast) return;

      this.formData.pagePath = this.formData.pagePath || ('/' + String(this.formData.resource || '').replace(/_/g, '-'));
      if (this.formData.menuRegister?.enabled) {
        this.formData.menuRegister.menuRoles = this.formData.menuRegister.menuRoles?.length
          ? this.formData.menuRegister.menuRoles
          : [...(this.formData.permissions || [])];
      }

      const loadingMsg = this.mode === 'edit' ? 'Updating CRUD...' : 'Deploying CRUD...';
      layout.toast(loadingMsg, { type: 'info', duration: 0 });

      try {
        const res = await fetch(`${API_BASE}/api/studio/crud`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(this.formData)
        });

        const json = await res.json();

        if (json.success) {
          this.clearLocalStorage();
          let msg = json.message || 'Deployed';
          if (json.menuRegistration?.success) {
            msg += `\n\nMenu: ${json.menuRegistration.path} → ${json.menuRegistration.group} (${(json.menuRegistration.roles || []).join(', ')})`;
          }
          if (json.migrationPreview) {
            msg += '\n\nMigration SQL generated (see server logs or Schema Designer).';
          }
          layout.toast(msg.split('\n')[0], { type: 'success' });
          layout.confirm({
            title: 'Deployment Successful!',
            message: msg + `\n\nFiles:\n• schema/${this.formData.resource}.json\n• appjson/${this.formData.resource}.json\n\nRestart server agar tabel DB & manifest halaman terbaru.`,
            confirmText: 'View CRUD Manager',
            cancelText: 'Stay Here',
            onConfirm: () => {
              layout.navigate('/studio/crud-manager');
            }
          });
        } else {
          layout.toast(json.error || json.errors?.join(', ') || 'Deployment failed', { type: 'error' });
        }
      } catch (error) {
        console.error('Deploy error:', error);
        layout.toast('Network error during deployment', { type: 'error' });
      }
    },

    addField(fieldData) {
      if (fieldData.sectionIndex === undefined) {
        fieldData.sectionIndex = this.formData.formLayout === 'sections' ? 0 : 0;
      }
      this.formData.fields.push(fieldData);
      this.saveToLocalStorage();
      this.renderFieldsTable();
    },

    updateField(index, fieldData) {
      this.formData.fields[index] = fieldData;
      this.saveToLocalStorage();
      this.renderFieldsTable();
    },

    deleteField(index) {
      if (typeof layout !== 'undefined' && layout.confirm) {
        layout.confirm({
          title: 'Delete Field',
          message: `Are you sure you want to delete field "${this.formData.fields[index].label}"?`,
          onConfirm: () => {
            this.formData.fields.splice(index, 1);
            this.saveToLocalStorage();
            this.renderFieldsTable();
          }
        });
      }
    },

    moveField(index, direction) {
      const newIndex = index + direction;
      if (newIndex >= 0 && newIndex < this.formData.fields.length) {
        const temp = this.formData.fields[index];
        this.formData.fields[index] = this.formData.fields[newIndex];
        this.formData.fields[newIndex] = temp;
        this.saveToLocalStorage();
        this.renderFieldsTable();
      }
    },

    buildProgressRow() {
      const progress = el('div').css({
        padding: '1.5rem 2rem',
        backgroundColor: '#fff',
        borderBottom: '1px solid #e2e8f0',
        flexShrink: '0'
      });

      const stepsContainer = el('div').css({
        display: 'flex',
        gap: '1rem',
        alignItems: 'center',
        justifyContent: 'center'
      });

      const stepLabels = ['Basic', 'Fields', 'List View', 'Form View', 'Preview', 'Deploy'];

      for (let i = 1; i <= this.totalSteps; i++) {
        const stepCircle = el('div').css({
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
          flex: '1'
        });

        const circle = el('div').css({
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.875rem',
          fontWeight: '700',
          backgroundColor: i < this.currentStep ? '#0e7490' : (i === this.currentStep ? '#0e7490' : '#e2e8f0'),
          color: i <= this.currentStep ? '#fff' : '#94a3b8',
          transition: 'all 0.3s'
        });
        circle.child(el('span').text(i));

        const label = el('div').css({
          fontSize: '0.75rem',
          color: i <= this.currentStep ? '#0e7490' : '#94a3b8',
          fontWeight: i === this.currentStep ? '700' : '500'
        }).text(stepLabels[i - 1]);

        stepCircle.child(circle);
        stepCircle.child(label);
        stepsContainer.child(stepCircle);

        if (i < this.totalSteps) {
          stepsContainer.child(el('div').css({
            flex: '1',
            height: '2px',
            backgroundColor: i < this.currentStep ? '#0e7490' : '#e2e8f0',
            marginBottom: '1.5rem'
          }));
        }
      }

      progress.child(stepsContainer);
      return progress;
    },

    buildFooterRow() {
      const footer = el('div').css({
        display: 'flex',
        justifyContent: 'space-between',
        padding: '1.5rem 2rem',
        backgroundColor: '#fff',
        borderTop: '1px solid #e2e8f0',
        flexShrink: '0'
      });

      const prevBtn = el('button').attr('type', 'button').css({
        padding: '0.75rem 1.5rem',
        borderRadius: '0.5rem',
        border: '1px solid #d1d5db',
        backgroundColor: '#fff',
        color: '#64748b',
        fontSize: '0.9375rem',
        fontWeight: '600',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        visibility: this.currentStep === 1 ? 'hidden' : 'visible'
      });
      prevBtn.child(el('i').class('fas fa-arrow-left'));
      prevBtn.child(el('span').text('Previous'));
      prevBtn.click(() => this.prevStep());

      const nextBtn = el('button').attr('type', 'button').css({
        padding: '0.75rem 2rem',
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
        boxShadow: '0 4px 12px rgba(14, 116, 144, 0.28)'
      });

      if (this.currentStep === this.totalSteps) {
        nextBtn.child(el('i').class('fas fa-rocket'));
        nextBtn.child(el('span').text(this.mode === 'edit' ? 'Update CRUD' : 'Deploy CRUD'));
      } else {
        nextBtn.child(el('i').class('fas fa-arrow-right'));
        nextBtn.child(el('span').text('Next'));
      }
      nextBtn.click(() => this.nextStep());

      footer.child(prevBtn);
      footer.child(nextBtn);
      return footer;
    },

    updateWizardChrome() {
      if (this.progressSlot) {
        this.progressSlot.empty();
        this.progressSlot.child(this.buildProgressRow());
        this.progressSlot.get();
      }
      if (this.footerSlot) {
        this.footerSlot.empty();
        this.footerSlot.child(this.buildFooterRow());
        this.footerSlot.get();
      }
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
      }).text(this.mode === 'edit' ? 'Edit CRUD' : 'Create New CRUD'));
      titleBlock.child(el('p').css({
        margin: '0.25rem 0 0',
        fontSize: '0.875rem',
        color: '#64748b'
      }).text(this.mode === 'edit' ? `Editing: ${this.formData.resource}` : 'Build your CRUD page step by step'));

      const backBtn = el('button').attr('type', 'button').css({
        padding: '0.625rem 1rem',
        borderRadius: '0.5rem',
        border: '1px solid #d1d5db',
        backgroundColor: '#fff',
        color: '#64748b',
        fontSize: '0.875rem',
        fontWeight: '600',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      });
      backBtn.child(el('i').class('fas fa-arrow-left'));
      backBtn.child(el('span').text('Back to Manager'));
      backBtn.click(() => layout.navigate('/studio/crud-manager'));

      header.child(titleBlock);
      header.child(backBtn);
      container.child(header);

      this.progressSlot = el('div');
      container.child(this.progressSlot);

      this.contentSlot = el('div').css({
        flex: '1',
        minHeight: '0',
        padding: '2rem',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch'
      });
      container.child(this.contentSlot);

      this.footerSlot = el('div');
      container.child(this.footerSlot);

      const root = container.get();
      this.updateWizardChrome();
      this.renderStep();
      return root;
    },

    renderStep() {
      const slot = this.contentSlot;
      if (!slot) return;

      slot.empty();
      let node = null;
      switch (this.currentStep) {
        case 1: node = this.renderStep1(); break;
        case 2: node = this.renderStep2(); break;
        case 3: node = this.renderStep3(); break;
        case 4: node = this.renderStep4(); break;
        case 5: node = this.renderStep5(); break;
        case 6: node = this.renderStep6(); break;
        default: break;
      }
      if (node) slot.child(node);
      slot.get();
    },

    renderStep1() {
      const container = el('div').css({
        maxWidth: '800px',
        margin: '0 auto',
        backgroundColor: '#fff',
        borderRadius: '0.75rem',
        padding: '2rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      });

      // Resource name
      container.child(this.createFormField('Resource Name', 'resource', 'text', {
        placeholder: 'e.g., data_products (lowercase, underscores only)',
        value: this.formData.resource,
        onChange: (val) => {
          this.formData.resource = val.toLowerCase().replace(/[^a-z0-9_]/g, '_');
          this.formData.pagePath = '/' + this.formData.resource.replace(/_/g, '-');
          this.saveToLocalStorage();
        }
      }));

      // Title
      container.child(this.createFormField('Title', 'title', 'text', {
        placeholder: 'e.g., Products Management',
        value: this.formData.title,
        onChange: (val) => {
          this.formData.title = val;
          this.saveToLocalStorage();
        }
      }));

      // Icon
      container.child(this.createSelectField('Icon', 'icon', ICONS.map(i => ({ value: i, label: i })), {
        value: this.formData.icon,
        onChange: (val) => {
          this.formData.icon = val;
          this.saveToLocalStorage();
        }
      }));

      // Form display
      container.child(this.createRadioGroupField('Form Display', 'formDisplay', FORM_DISPLAY_OPTIONS, {
        value: this.formData.formDisplay,
        onChange: (val) => {
          this.formData.formDisplay = val;
          this.saveToLocalStorage();
        }
      }));

      // Modal size (conditional)
      if (this.formData.formDisplay === 'modal') {
        container.child(this.createSelectField('Modal Size', 'modalSize', MODAL_SIZES, {
          value: this.formData.modalSize,
          onChange: (val) => {
            this.formData.modalSize = val;
            this.saveToLocalStorage();
          }
        }));
      }

      // Permissions
      container.child(this.createPermissionsField());

      return container.get();
    },

    renderStep2() {
      const container = el('div').css({
        backgroundColor: '#fff',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      });

      // Header
      const header = el('div').css({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.5rem'
      });

      header.child(el('h2').css({
        margin: '0',
        fontSize: '1.25rem',
        fontWeight: '700',
        color: '#1e293b'
      }).text('Fields Designer'));

      const addBtn = el('button').attr('type', 'button').css({
        padding: '0.625rem 1.25rem',
        borderRadius: '0.5rem',
        border: 'none',
        background: 'linear-gradient(135deg, #0e7490 0%, #0891b2 100%)',
        color: '#fff',
        fontSize: '0.875rem',
        fontWeight: '700',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      });
      addBtn.child(el('i').class('fas fa-plus'));
      addBtn.child(el('span').text('Add Field'));
      addBtn.click(() => this.openFieldEditor());

      header.child(addBtn);
      container.child(header);

      this.fieldsTableSlot = el('div');
      container.child(this.fieldsTableSlot);
      this.renderFieldsTable();

      return container.get();
    },

    renderFieldsTable() {
      const slot = this.fieldsTableSlot;
      if (!slot) return;

      slot.empty();

      if (this.formData.fields.length === 0) {
        const empty = el('div').css({ textAlign: 'center', padding: '3rem', color: '#94a3b8' });
        empty.child(el('i').class('fas fa-inbox').css({ fontSize: '3rem', marginBottom: '1rem', display: 'block' }));
        empty.child(el('p').text('No fields added yet. Click "Add Field" to start.'));
        slot.child(empty);
        slot.get();
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
      ['Order', 'Name', 'Label', 'Type', 'Required', 'List', 'Actions'].forEach(text => {
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
      this.formData.fields.forEach((field, index) => {
        const row = el('tr').css({
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: index % 2 === 0 ? '#fff' : '#f8fafc'
        });

        // Order
        const orderCell = el('td').css({ padding: '0.75rem' });
        const orderActions = el('div').css({ display: 'flex', gap: '0.25rem' });
        const upBtn = el('button').attr('type', 'button').css({
          padding: '0.25rem 0.5rem',
          border: '1px solid #d1d5db',
          backgroundColor: '#fff',
          borderRadius: '0.25rem',
          cursor: 'pointer',
          fontSize: '0.75rem'
        });
        upBtn.child(el('i').class('fas fa-arrow-up'));
        upBtn.click(() => this.moveField(index, -1));
        const downBtn = el('button').attr('type', 'button').css({
          padding: '0.25rem 0.5rem',
          border: '1px solid #d1d5db',
          backgroundColor: '#fff',
          borderRadius: '0.25rem',
          cursor: 'pointer',
          fontSize: '0.75rem'
        });
        downBtn.child(el('i').class('fas fa-arrow-down'));
        downBtn.click(() => this.moveField(index, 1));
        orderActions.child(upBtn);
        orderActions.child(downBtn);
        orderCell.child(orderActions);
        row.child(orderCell);

        // Name
        row.child(el('td').css({ padding: '0.75rem', fontFamily: 'monospace', color: '#0e7490' }).text(field.name));

        // Label
        row.child(el('td').css({ padding: '0.75rem' }).text(field.label));

        // Type
        const typeInfo = FIELD_TYPES.find(t => t.value === field.type);
        row.child(el('td').css({ padding: '0.75rem' }).child(el('i').class(typeInfo?.icon || 'fas fa-font').css({ marginRight: '0.35rem', color: '#64748b' })).child(el('span').text(field.type)));

        // Required
        row.child(el('td').css({ padding: '0.75rem', textAlign: 'center' }).child(field.required ? el('i').class('fas fa-check-circle').css({ color: '#10b981' }) : el('span').text('-').css({ color: '#94a3b8' })));

        // Show in List
        row.child(el('td').css({ padding: '0.75rem', textAlign: 'center' }).child(field.showInList ? el('i').class('fas fa-check-circle').css({ color: '#10b981' }) : el('span').text('-').css({ color: '#94a3b8' })));

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
        editBtn.click(() => this.openFieldEditor(index));

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
        deleteBtn.click(() => this.deleteField(index));

        actionBtns.child(editBtn);
        actionBtns.child(deleteBtn);
        actionsCell.child(actionBtns);
        row.child(actionsCell);

        tbody.child(row);
      });
      table.child(tbody);

      slot.child(table);
      slot.get();
    },

    syncFieldRelations(fieldData) {
      if (fieldData.type === 'foreign_key') {
        if (!fieldData.optionsFrom) fieldData.optionsFrom = {};
        const of = fieldData.optionsFrom;
        const fk = fieldData.foreignKey || {};
        if (fk.table) of.resource = fk.table;
        if (fk.valueField) of.value = fk.valueField;
        if (fk.labelFormat) of.labelFormat = fk.labelFormat;
        if (fieldData.formSearchable === true) of.searchable = true;
        else delete of.searchable;
        if (fieldData.remoteSearch) of.remoteSearch = true;
        if (fieldData.minSearchLength) of.minSearchLength = fieldData.minSearchLength;
        if (!fk.table && of.resource) {
          fieldData.foreignKey = {
            table: of.resource,
            valueField: of.value || 'id',
            labelFormat: of.labelFormat || '{{name}}'
          };
        }
      }
    },

    openFieldEditor(editIndex = null) {
      if (typeof layout === 'undefined' || !layout.modal) return;

      const isEdit = editIndex !== null;
      const fieldData = isEdit ? { ...this.formData.fields[editIndex] } : this.emptyField();

      const container = el('div').css({ padding: '1rem' });

      // Field name
      container.child(this.createFormField('Field Name', 'field_name', 'text', {
        placeholder: 'e.g., product_name (lowercase, underscores)',
        value: fieldData.name,
        onChange: (val) => {
          fieldData.name = val.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        }
      }));

      // Label
      container.child(this.createFormField('Label', 'field_label', 'text', {
        placeholder: 'e.g., Product Name',
        value: fieldData.label,
        onChange: (val) => fieldData.label = val
      }));

      // Type
      container.child(this.createSelectField('Type', 'field_type', FIELD_TYPES.map(t => ({ value: t.value, label: t.label })), {
        value: fieldData.type,
        onChange: (val) => fieldData.type = val
      }));

      const presetIds = Object.keys(this.presetsMap || {});
      if (presetIds.length) {
        container.child(this.createSelectField('Apply preset (optional)', 'field_preset', [
          { value: '', label: '— None —' },
          ...presetIds.map((id) => ({ value: id, label: id }))
        ], {
          value: fieldData.presetId || '',
          onChange: (val) => {
            fieldData.presetId = val;
            if (val && this.presetsMap[val] && typeof StudioCrudConfig !== 'undefined') {
              const merged = StudioCrudConfig.applyPresetToField(fieldData, this.presetsMap[val]);
              Object.assign(fieldData, merged);
              fieldData.presetId = val;
            }
          }
        }));
      }

      container.child(this.createSelectField('Custom form JSON type (advanced)', 'field_custom_type', CUSTOM_FORM_TYPES, {
        value: fieldData.customFormType || '',
        onChange: (val) => { fieldData.customFormType = val; }
      }));

      if (this.formData.formLayout === 'sections' && (this.formData.sections || []).length) {
        container.child(this.createSelectField('Form section', 'field_section', this.formData.sections.map((s, i) => ({
          value: i,
          label: s.title || `Section ${i + 1}`
        })), {
          value: fieldData.sectionIndex ?? 0,
          onChange: (val) => { fieldData.sectionIndex = parseInt(val, 10) || 0; }
        }));
      }

      // Required
      container.child(this.createCheckboxField('Required', 'field_required', {
        checked: fieldData.required,
        onChange: (val) => fieldData.required = val
      }));

      // Show in List
      container.child(this.createCheckboxField('Show in List', 'field_show_in_list', {
        checked: fieldData.showInList,
        onChange: (val) => fieldData.showInList = val
      }));

      // Show in Form
      container.child(this.createCheckboxField('Show in Form', 'field_show_in_form', {
        checked: fieldData.showInForm,
        onChange: (val) => fieldData.showInForm = val
      }));

      // Default value
      container.child(this.createFormField('Default Value (optional)', 'field_default', 'text', {
        value: fieldData.defaultValue,
        onChange: (val) => fieldData.defaultValue = val
      }));

      // Help text
      container.child(this.createFormField('Help Text (optional)', 'field_help', 'textarea', {
        value: fieldData.helpText,
        onChange: (val) => fieldData.helpText = val
      }));

      container.child(this.createFormField('Placeholder (form)', 'field_placeholder', 'text', {
        value: fieldData.placeholder || '',
        onChange: (val) => { fieldData.placeholder = val; }
      }));

      if (fieldData.type === 'select') {
        container.child(this.createFormField('Options (value|label per line)', 'field_options', 'textarea', {
          value: (fieldData.selectOptions || []).map((o) => `${o.value}|${o.label || o.value}`).join('\n'),
          onChange: (val) => {
            fieldData.selectOptions = String(val || '').split('\n').filter(Boolean).map((line) => {
              const [v, ...rest] = line.split('|');
              const l = rest.join('|').trim();
              return { value: v.trim(), label: l || v.trim() };
            });
          }
        }));
      }

      if (fieldData.type === 'foreign_key') {
        if (!fieldData.optionsFrom) fieldData.optionsFrom = {};
        if (!fieldData.foreignKey) fieldData.foreignKey = { table: '', valueField: 'id', labelFormat: '{{name}}' };
        const of = fieldData.optionsFrom;
        const fk = fieldData.foreignKey;
        if (of.resource && !fk.table) fk.table = of.resource;
        if (of.value && !fk.valueField) fk.valueField = of.value;

        container.child(this.createFormField('Resource (lookup table)', 'fk_table', 'text', {
          value: fk.table || of.resource || '',
          onChange: (val) => {
            fk.table = val.trim();
            of.resource = val.trim();
          }
        }));
        container.child(this.createFormField('Value field', 'fk_value', 'text', {
          value: fk.valueField || of.value || 'id',
          onChange: (val) => {
            fk.valueField = val.trim() || 'id';
            of.value = val.trim() || 'id';
          }
        }));
        container.child(this.createFormField('Label field(s)', 'fk_label_field', 'text', {
          placeholder: 'nama_cabang or id,nama',
          value: Array.isArray(of.label) ? of.label.join(',') : (of.label || ''),
          onChange: (val) => {
            const v = val.trim();
            if (!v) delete of.label;
            else if (v.includes(',')) of.label = v.split(',').map((s) => s.trim()).filter(Boolean);
            else of.label = v;
          }
        }));
        container.child(this.createFormField('Label format', 'fk_label_fmt', 'text', {
          placeholder: '{{kode}} — {{nama}}',
          value: fk.labelFormat || of.labelFormat || '',
          onChange: (val) => {
            const v = val.trim();
            fk.labelFormat = v;
            if (v) of.labelFormat = v;
            else delete of.labelFormat;
          }
        }));
        container.child(this.createFormField('Value format (optional HTML)', 'fk_value_fmt', 'text', {
          value: of.valueFormat || '',
          onChange: (val) => {
            if (val.trim()) of.valueFormat = val.trim();
            else delete of.valueFormat;
          }
        }));
        container.child(this.createFormField('Sort field', 'fk_sort', 'text', {
          value: of.sort || '',
          onChange: (val) => { if (val.trim()) of.sort = val.trim(); else delete of.sort; }
        }));
        container.child(this.createSelectField('Sort order', 'fk_order', [
          { value: '', label: '— default —' },
          { value: 'asc', label: 'asc' },
          { value: 'desc', label: 'desc' }
        ], {
          value: of.order || '',
          onChange: (val) => { if (val) of.order = val; else delete of.order; }
        }));
        container.child(this.createFormField('Per page (lookup)', 'fk_perpage', 'number', {
          value: of.perPage || '',
          onChange: (val) => {
            const n = parseInt(val, 10);
            if (n > 0) of.perPage = n;
            else delete of.perPage;
          }
        }));
        container.child(this.createCheckboxField('Searchable select', 'fk_searchable', {
          checked: fieldData.formSearchable === true,
          onChange: (val) => { fieldData.formSearchable = val; }
        }));
        container.child(this.createCheckboxField('Remote search', 'fk_remote', {
          checked: !!fieldData.remoteSearch,
          onChange: (val) => { fieldData.remoteSearch = val; }
        }));
        container.child(this.createFormField('Min search length', 'fk_minlen', 'number', {
          value: fieldData.minSearchLength || 0,
          onChange: (val) => { fieldData.minSearchLength = parseInt(val, 10) || 0; }
        }));
      }

      layout.modal({
        title: isEdit ? 'Edit Field' : 'Add New Field',
        size: 'medium',
        content: container.get(),
        footer: [
          {
            text: 'Cancel',
            style: 'secondary',
            action: () => layout.closeModal()
          },
          {
            text: isEdit ? 'Update Field' : 'Add Field',
            style: 'primary',
            action: () => {
              if (!fieldData.name || !fieldData.label) {
                if (typeof layout !== 'undefined' && layout.toast) {
                  layout.toast('Field name and label are required', { type: 'error' });
                }
                return;
              }
              this.syncFieldRelations(fieldData);
              if (isEdit) {
                this.updateField(editIndex, fieldData);
              } else {
                this.addField(fieldData);
              }
              layout.closeModal();
            }
          }
        ]
      });
    },

    renderStep3() {
      const container = el('div').css({
        backgroundColor: '#fff',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      });

      container.child(el('h2').css({ margin: '0 0 1rem', fontSize: '1.25rem', fontWeight: '700', color: '#1e293b' }).text('List View (Datatable)'));

      const toggles = el('div').css({ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1.25rem' });
      toggles.child(this.createCheckboxField('Enable search', 'table_search', {
        checked: this.formData.tableSearch !== false,
        onChange: (v) => { this.formData.tableSearch = v; this.saveToLocalStorage(); }
      }));
      toggles.child(this.createCheckboxField('Enable pagination', 'table_pagination', {
        checked: this.formData.tablePagination !== false,
        onChange: (v) => { this.formData.tablePagination = v; this.saveToLocalStorage(); }
      }));
      container.child(toggles);

      container.child(this.createFormField('Items per page', 'per_page', 'number', {
        value: this.formData.perPage,
        onChange: (val) => { this.formData.perPage = parseInt(val, 10) || 25; this.saveToLocalStorage(); }
      }));

      const actionsField = el('div').css({ marginBottom: '1.25rem' });
      actionsField.child(el('label').css({ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151' }).text('Row actions'));
      const actionsContainer = el('div').css({ display: 'flex', gap: '1rem', flexWrap: 'wrap' });
      ['edit', 'delete', 'detail'].forEach((action) => {
        const label = el('label').css({ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' });
        const input = el('input').attr('type', 'checkbox');
        if (this.formData.actions.includes(action)) input.el.checked = true;
        input.el.addEventListener('change', (e) => {
          if (e.target.checked) {
            if (!this.formData.actions.includes(action)) this.formData.actions.push(action);
          } else {
            this.formData.actions = this.formData.actions.filter((a) => a !== action);
          }
          this.saveToLocalStorage();
        });
        label.child(input);
        label.child(el('span').text(action));
        actionsContainer.child(label);
      });
      actionsField.child(actionsContainer);
      container.child(actionsField);

      container.child(el('p').css({ margin: '0 0 0.75rem', fontSize: '0.875rem', color: '#64748b' }).text('Column settings (fields shown in list):'));

      this.listViewTableSlot = el('div');
      container.child(this.listViewTableSlot);
      this.renderListViewTable();

      return container.get();
    },

    renderListViewTable() {
      const slot = this.listViewTableSlot;
      if (!slot) return;
      slot.empty();
      const listFields = this.formData.fields.filter((f) => f.showInList !== false);
      if (!listFields.length) {
        slot.child(el('p').css({ color: '#94a3b8', padding: '1rem' }).text('No list columns. Enable "Show in List" on fields step.'));
        slot.get();
        return;
      }

      const table = el('table').css({ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' });
      const thead = el('thead');
      const hr = el('tr').css({ backgroundColor: '#f1f5f9' });
      ['Field', 'Label', 'Sortable', 'Searchable', 'Width', 'Badge'].forEach((h) => {
        hr.child(el('th').css({ padding: '0.5rem', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }).text(h));
      });
      thead.child(hr);
      table.child(thead);

      const tbody = el('tbody');
      listFields.forEach((field) => {
        const idx = this.formData.fields.indexOf(field);
        const row = el('tr').css({ borderBottom: '1px solid #e2e8f0' });
        row.child(el('td').css({ padding: '0.5rem', fontFamily: 'monospace', color: '#0e7490' }).text(field.name));

        const labelInput = el('input').attr('type', 'text').css({ width: '100%', padding: '0.35rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' });
        labelInput.el.value = field.label || '';
        labelInput.el.addEventListener('input', (e) => {
          this.formData.fields[idx].label = e.target.value;
          this.saveToLocalStorage();
        });
        row.child(el('td').css({ padding: '0.5rem' }).child(labelInput));

        const sortCb = el('input').attr('type', 'checkbox');
        sortCb.el.checked = field.sortable !== false;
        sortCb.el.addEventListener('change', (e) => {
          this.formData.fields[idx].sortable = e.target.checked;
          this.saveToLocalStorage();
        });
        row.child(el('td').css({ padding: '0.5rem', textAlign: 'center' }).child(sortCb));

        const searchCb = el('input').attr('type', 'checkbox');
        searchCb.el.checked = field.searchable === true;
        searchCb.el.addEventListener('change', (e) => {
          this.formData.fields[idx].searchable = e.target.checked;
          this.saveToLocalStorage();
        });
        row.child(el('td').css({ padding: '0.5rem', textAlign: 'center' }).child(searchCb));

        const widthInput = el('input').attr('type', 'text').attr('placeholder', '120px').css({ width: '80px', padding: '0.35rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' });
        widthInput.el.value = field.columnWidth || '';
        widthInput.el.addEventListener('input', (e) => {
          this.formData.fields[idx].columnWidth = e.target.value;
          this.saveToLocalStorage();
        });
        row.child(el('td').css({ padding: '0.5rem' }).child(widthInput));

        const badgeCb = el('input').attr('type', 'checkbox');
        badgeCb.el.checked = field.columnType === 'badge';
        badgeCb.el.addEventListener('change', (e) => {
          this.formData.fields[idx].columnType = e.target.checked ? 'badge' : '';
          this.saveToLocalStorage();
        });
        row.child(el('td').css({ padding: '0.5rem', textAlign: 'center' }).child(badgeCb));

        tbody.child(row);
      });
      table.child(tbody);
      slot.child(table);
      slot.get();
    },

    renderStep4() {
      const container = el('div').css({
        backgroundColor: '#fff',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      });

      container.child(el('h2').css({ margin: '0 0 1rem', fontSize: '1.25rem', fontWeight: '700', color: '#1e293b' }).text('Form View'));

      container.child(this.createRadioGroupField('Form layout', 'form_layout', [
        { value: 'fields', label: 'Flat fields (form.fields)' },
        { value: 'sections', label: 'Sections (form.sections)' }
      ], {
        value: this.formData.formLayout || 'fields',
        onChange: (val) => {
          this.formData.formLayout = val;
          if (val === 'sections' && (!this.formData.sections || !this.formData.sections.length)) {
            this.formData.sections = [{ title: 'General', icon: 'fas fa-folder' }];
          }
          this.saveToLocalStorage();
          this.renderStep();
        }
      }));

      if (this.formData.formLayout === 'sections') {
        const secWrap = el('div').css({ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '0.5rem' });
        secWrap.child(el('p').css({ margin: '0 0 0.75rem', fontSize: '0.875rem', fontWeight: '600', color: '#475569' }).text('Form sections'));
        (this.formData.sections || []).forEach((section, si) => {
          const row = el('div').css({ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' });
          row.child(el('span').css({ fontSize: '0.8125rem', color: '#64748b', minWidth: '1.5rem' }).text(String(si + 1)));
          const titleIn = el('input').attr('type', 'text').css({ flex: '1', padding: '0.35rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' });
          titleIn.el.value = section.title || '';
          titleIn.el.addEventListener('input', (e) => {
            this.formData.sections[si].title = e.target.value;
            this.saveToLocalStorage();
          });
          row.child(titleIn);
          const iconIn = el('input').attr('type', 'text').attr('placeholder', 'fas fa-folder').css({ width: '140px', padding: '0.35rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' });
          iconIn.el.value = section.icon || '';
          iconIn.el.addEventListener('input', (e) => {
            this.formData.sections[si].icon = e.target.value;
            this.saveToLocalStorage();
          });
          row.child(iconIn);
          secWrap.child(row);
        });
        const addSec = el('button').attr('type', 'button').css({
          marginTop: '0.5rem', padding: '0.375rem 0.75rem', border: '1px dashed #0e7490', background: '#fff',
          color: '#0e7490', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8125rem'
        }).text('+ Add section');
        addSec.click(() => {
          this.formData.sections.push({ title: `Section ${this.formData.sections.length + 1}`, icon: 'fas fa-folder' });
          this.saveToLocalStorage();
          this.renderStep();
        });
        secWrap.child(addSec);
        container.child(secWrap);

        container.child(this.createFormField('Form intro (optional)', 'form_intro', 'textarea', {
          value: this.formData.formIntro || '',
          onChange: (val) => { this.formData.formIntro = val; this.saveToLocalStorage(); }
        }));
        container.child(this.createFormField('Grid layout (optional)', 'form_grid', 'text', {
          value: this.formData.formGridLayout || '',
          placeholder: 'grid',
          onChange: (val) => { this.formData.formGridLayout = val; this.saveToLocalStorage(); }
        }));
      }

      container.child(this.createSelectField('Form columns', 'form_columns', [
        { value: 1, label: '1 column' },
        { value: 2, label: '2 columns' },
        { value: 3, label: '3 columns' }
      ], {
        value: this.formData.formColumns,
        onChange: (val) => { this.formData.formColumns = parseInt(val, 10) || 2; this.saveToLocalStorage(); }
      }));

      container.child(this.createFormField('Submit button text (optional)', 'form_submit', 'text', {
        value: this.formData.formSubmitText || '',
        placeholder: 'Save',
        onChange: (val) => { this.formData.formSubmitText = val; this.saveToLocalStorage(); }
      }));

      container.child(this.createFormField('Cancel button text (optional)', 'form_cancel', 'text', {
        value: this.formData.formCancelText || '',
        placeholder: 'Cancel',
        onChange: (val) => { this.formData.formCancelText = val; this.saveToLocalStorage(); }
      }));

      this.formViewTableSlot = el('div');
      container.child(this.formViewTableSlot);
      this.renderFormViewTable();

      return container.get();
    },

    renderFormViewTable() {
      const slot = this.formViewTableSlot;
      if (!slot) return;
      slot.empty();
      const formFields = this.formData.fields.filter((f) => f.showInForm !== false);
      if (!formFields.length) {
        slot.child(el('p').css({ color: '#94a3b8', padding: '1rem' }).text('No form fields. Enable "Show in Form" on fields step.'));
        slot.get();
        return;
      }

      const table = el('table').css({ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', marginTop: '0.75rem' });
      const thead = el('thead');
      const hr = el('tr').css({ backgroundColor: '#f1f5f9' });
      const headers = ['Field', 'Placeholder', 'Colspan', 'Rows'];
      if (this.formData.formLayout === 'sections') headers.push('Section');
      headers.forEach((h) => {
        hr.child(el('th').css({ padding: '0.5rem', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }).text(h));
      });
      thead.child(hr);
      table.child(thead);

      const tbody = el('tbody');
      formFields.forEach((field) => {
        const idx = this.formData.fields.indexOf(field);
        const row = el('tr').css({ borderBottom: '1px solid #e2e8f0' });
        row.child(el('td').css({ padding: '0.5rem' }).child(el('span').css({ fontFamily: 'monospace', color: '#0e7490' }).text(field.name)).child(el('span').css({ color: '#64748b', marginLeft: '0.35rem' }).text(`(${field.type})`)));

        const ph = el('input').attr('type', 'text').css({ width: '100%', padding: '0.35rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' });
        ph.el.value = field.placeholder || '';
        ph.el.addEventListener('input', (e) => { this.formData.fields[idx].placeholder = e.target.value; this.saveToLocalStorage(); });
        row.child(el('td').css({ padding: '0.5rem' }).child(ph));

        const cs = el('input').attr('type', 'number').attr('min', '1').attr('max', '3').css({ width: '60px', padding: '0.35rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' });
        cs.el.value = field.colspan || 1;
        cs.el.addEventListener('input', (e) => { this.formData.fields[idx].colspan = parseInt(e.target.value, 10) || 1; this.saveToLocalStorage(); });
        row.child(el('td').css({ padding: '0.5rem' }).child(cs));

        const rows = el('input').attr('type', 'number').attr('min', '2').css({ width: '60px', padding: '0.35rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' });
        rows.el.value = field.rows || 3;
        rows.el.disabled = field.type !== 'long_text';
        rows.el.addEventListener('input', (e) => { this.formData.fields[idx].rows = parseInt(e.target.value, 10) || 3; this.saveToLocalStorage(); });
        row.child(el('td').css({ padding: '0.5rem' }).child(rows));

        if (this.formData.formLayout === 'sections') {
          const secSel = el('select').css({ padding: '0.25rem', border: '1px solid #d1d5db', borderRadius: '0.25rem', fontSize: '0.8125rem' });
          (this.formData.sections || []).forEach((s, si) => {
            secSel.child(el('option').attr('value', String(si)).text(s.title || `Section ${si + 1}`));
          });
          secSel.get();
          secSel.el.value = String(field.sectionIndex ?? 0);
          secSel.el.addEventListener('change', (e) => {
            this.formData.fields[idx].sectionIndex = parseInt(e.target.value, 10) || 0;
            this.saveToLocalStorage();
          });
          row.child(el('td').css({ padding: '0.5rem' }).child(secSel));
        }

        tbody.child(row);
      });
      table.child(tbody);
      slot.child(table);
      slot.get();
    },

    mountWizardPreview() {
      const slot = this.previewHostSlot;
      if (!slot) return;
      slot.empty();
      slot.css({
        flex: '1',
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      });
      if (typeof StudioPreview !== 'undefined') {
        slot.child(StudioPreview.buildPreviewTabs(this.formData));
      } else {
        slot.child(el('p').text('Preview module not loaded'));
      }
      slot.get();
    },

    renderStep5() {
      const container = el('div').css({
        backgroundColor: '#fff',
        borderRadius: '0.75rem',
        padding: '1rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        minHeight: '520px',
        display: 'flex',
        flexDirection: 'column',
        flex: '1'
      });

      container.child(el('h2').css({ margin: '0 0 0.75rem', fontSize: '1.25rem', fontWeight: '700', color: '#1e293b', flexShrink: '0' }).text('Live Preview'));

      this.previewHostSlot = el('div');
      container.child(this.previewHostSlot);

      setTimeout(() => this.mountWizardPreview(), 0);

      return container.get();
    },

    renderStep6() {
      const container = el('div').css({
        maxWidth: '860px',
        margin: '0 auto',
        backgroundColor: '#fff',
        borderRadius: '0.75rem',
        padding: '2rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      });

      container.child(el('div').css({ textAlign: 'center', marginBottom: '1.5rem' }).child(el('i').class('fas fa-rocket').css({ fontSize: '3rem', color: '#0e7490' })));
      container.child(el('h2').css({ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: '800', color: '#1e293b', textAlign: 'center' }).text('Ready to Deploy'));
      container.child(el('p').css({ margin: '0 0 1.5rem', fontSize: '0.9375rem', color: '#64748b', textAlign: 'center' }).text(`"${this.formData.title}" · ${this.formData.fields.length} fields · path ${this.formData.pagePath || ('/' + (this.formData.resource || '').replace(/_/g, '-'))}`));

      if (!this.formData.menuRegister) {
        this.formData.menuRegister = { enabled: false, groupName: 'Data Master', menuRoles: [] };
      }

      container.child(this.createCheckboxField('Register to sidebar menu (menu-config.json)', 'menu_reg', {
        checked: !!this.formData.menuRegister.enabled,
        onChange: (val) => {
          this.formData.menuRegister.enabled = val;
          if (val && !this.formData.menuRegister.menuRoles?.length) {
            this.formData.menuRegister.menuRoles = [...(this.formData.permissions || [])];
          }
          this.saveToLocalStorage();
        }
      }));

      if (this.formData.menuRegister.enabled) {
        container.child(this.createSelectField('Menu group', 'menu_group', MENU_GROUP_OPTIONS.map((g) => ({ value: g, label: g })), {
          value: this.formData.menuRegister.groupName || 'Data Master',
          onChange: (val) => { this.formData.menuRegister.groupName = val; this.saveToLocalStorage(); }
        }));
        const rolesNote = el('p').css({ margin: '0 0 1rem', fontSize: '0.8125rem', color: '#64748b' }).text(
          `Menu path akan ditambahkan untuk role: ${(this.formData.menuRegister.menuRoles || this.formData.permissions || []).join(', ') || '(pilih permissions di step 1)'}`
        );
        container.child(rolesNote);
      }

      this.migrationPreviewSlot = el('div').css({
        marginTop: '1rem',
        textAlign: 'left'
      });
      container.child(this.migrationPreviewSlot);

      const warning = el('div').css({
        backgroundColor: '#fef3c7',
        border: '1px solid #f59e0b',
        borderRadius: '0.5rem',
        padding: '1rem',
        marginTop: '1rem',
        textAlign: 'left'
      });
      warning.child(el('p').css({ margin: 0, fontSize: '0.875rem', color: '#92400e' }).text('Restart server setelah deploy agar tabel DB, /api/pages, dan menu terbaru.'));
      container.child(warning);

      setTimeout(() => this.loadMigrationPreview(), 0);

      return container.get();
    },

    async loadMigrationPreview() {
      const slot = this.migrationPreviewSlot;
      if (!slot) return;
      slot.empty();
      try {
        const res = await fetch(`${API_BASE}/api/studio/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(this.formData)
        });
        const json = await res.json();
        if (json.success && json.migrationSql) {
          slot.child(el('p').css({ margin: '0 0 0.5rem', fontWeight: '600', fontSize: '0.875rem', color: '#475569' }).text(
            this.mode === 'edit' ? 'Migration SQL (schema saat ini):' : 'Migration SQL (CREATE TABLE):'
          ));
          const pre = el('pre').css({
            backgroundColor: '#f1f5f9', padding: '0.75rem', borderRadius: '0.5rem',
            fontSize: '0.7rem', overflow: 'auto', maxHeight: '160px', margin: 0
          });
          pre.el.textContent = json.migrationSql;
          slot.child(pre);
        }
      } catch (_) {
        /* ignore */
      }
      slot.get();
    },

    createFormField(label, name, type, options = {}) {
      const field = el('div').css({ marginBottom: '1.5rem' });
      field.child(el('label').css({
        display: 'block',
        marginBottom: '0.5rem',
        fontWeight: '600',
        color: '#374151'
      }).text(label));

      if (type === 'textarea') {
        const textarea = el('textarea').attr('placeholder', options.placeholder || '').css({
          width: '100%',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          border: '1px solid #d1d5db',
          fontSize: '0.9375rem',
          outline: 'none',
          minHeight: '80px',
          resize: 'vertical'
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
          fontSize: '0.9375rem',
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
      const field = el('div').css({ marginBottom: '1.5rem' });
      field.child(el('label').css({
        display: 'block',
        marginBottom: '0.5rem',
        fontWeight: '600',
        color: '#374151'
      }).text(label));

      const select = el('select').css({
        width: '100%',
        padding: '0.75rem',
        borderRadius: '0.5rem',
        border: '1px solid #d1d5db',
        fontSize: '0.9375rem',
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

    createRadioGroupField(label, name, options, config = {}) {
      const field = el('div').css({ marginBottom: '1.5rem' });
      field.child(el('label').css({
        display: 'block',
        marginBottom: '0.5rem',
        fontWeight: '600',
        color: '#374151'
      }).text(label));

      const optionsContainer = el('div').css({ display: 'flex', gap: '1rem', flexWrap: 'wrap' });

      options.forEach(opt => {
        const label_el = el('label').css({
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem 1rem',
          borderRadius: '0.5rem',
          border: opt.value === config.value ? '2px solid #0e7490' : '1px solid #d1d5db',
          backgroundColor: opt.value === config.value ? '#f0fdfa' : '#fff',
          cursor: 'pointer',
          flex: '1',
          minWidth: '120px'
        });

        const radio = el('input').attr('type', 'radio').attr('name', name).attr('value', opt.value);
        if (opt.value === config.value) radio.el.checked = true;
        radio.el.addEventListener('change', () => {
          if (config.onChange) config.onChange(opt.value);
          this.renderStep();
        });

        label_el.child(radio);
        label_el.child(el('span').css({ fontSize: '0.875rem', fontWeight: '600' }).text(opt.label));
        optionsContainer.child(label_el);
      });

      field.child(optionsContainer);
      return field.get();
    },

    createCheckboxField(label, name, config = {}) {
      const field = el('div').css({ marginBottom: '1.5rem' });
      const label_el = el('label').css({
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        cursor: 'pointer'
      });

      const checkbox = el('input').attr('type', 'checkbox');
      if (config.checked) checkbox.el.checked = true;
      checkbox.el.addEventListener('change', (e) => {
        if (config.onChange) config.onChange(e.target.checked);
      });

      label_el.child(checkbox);
      label_el.child(el('span').css({ fontWeight: '600', color: '#374151' }).text(label));
      field.child(label_el);

      return field.get();
    },

    createPermissionsField() {
      const field = el('div').css({ marginBottom: '1.5rem' });
      field.child(el('label').css({
        display: 'block',
        marginBottom: '0.5rem',
        fontWeight: '600',
        color: '#374151'
      }).text('Permissions (who can access this CRUD)'));

      const permissionsList = ['super_admin', 'admin', 'studio_admin', 'bagian_bio', 'bagian_hotel', 'bagian_pap', 'marketing', 'keuangan', 'data_master', 'blk'];
      const permissionsContainer = el('div').css({ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' });

      permissionsList.forEach(perm => {
        const label = el('label').css({
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          borderRadius: '0.375rem',
          border: this.formData.permissions.includes(perm) ? '1px solid #0e7490' : '1px solid #d1d5db',
          backgroundColor: this.formData.permissions.includes(perm) ? '#f0fdfa' : '#fff',
          cursor: 'pointer',
          fontSize: '0.875rem'
        });

        const checkbox = el('input').attr('type', 'checkbox');
        if (this.formData.permissions.includes(perm)) checkbox.el.checked = true;
        checkbox.el.addEventListener('change', (e) => {
          if (e.target.checked) {
            if (!this.formData.permissions.includes(perm)) {
              this.formData.permissions.push(perm);
            }
          } else {
            this.formData.permissions = this.formData.permissions.filter(p => p !== perm);
          }
          this.saveToLocalStorage();
        });

        label.child(checkbox);
        label.child(el('span').text(perm));
        permissionsContainer.child(label);
      });

      field.child(permissionsContainer);
      return field.get();
    }
  };

  global.StudioFormBuilder = StudioFormBuilder;

})(typeof window !== 'undefined' ? window : global);
