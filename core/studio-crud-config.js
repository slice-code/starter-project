// Studio CRUD config — unified field model (schema + table + form round-trip)
(function (global) {
  'use strict';

  const SKIP = new Set(['id', 'created_at', 'updated_at']);
  const FORM_MANAGED_KEYS = new Set([
    'name', 'label', 'type', 'required', 'default', 'placeholder', 'helpText',
    'colspan', 'rows', 'options', 'optionsFrom', 'searchable'
  ]);

  function createEmptyField() {
    return {
      name: '',
      label: '',
      type: 'text',
      required: false,
      defaultValue: '',
      helpText: '',
      foreignKey: null,
      selectOptions: [],
      showInList: true,
      showInForm: true,
      sortable: true,
      searchable: true,
      columnWidth: '',
      columnType: '',
      badgeMap: null,
      placeholder: '',
      colspan: 1,
      rows: 3,
      optionsFrom: null,
      formSearchable: false,
      remoteSearch: false,
      minSearchLength: 0,
      customFormType: '',
      presetId: '',
      sectionIndex: 0,
      _formPreserve: null
    };
  }

  const STUDIO_TO_FORM = {
    text: 'text', long_text: 'textarea', number: 'number', decimal: 'number',
    email: 'email', date: 'date', datetime: 'datetime', boolean: 'checkbox',
    select: 'select', foreign_key: 'select', url: 'url', file: 'file',
    image: 'image', password: 'password'
  };

  function resolveCustomFormType(formField, studioType) {
    if (!formField?.type) return '';
    const mapped = STUDIO_TO_FORM[studioType] || 'text';
    if (formField.type !== mapped) return formField.type;
    return '';
  }

  /** Form JSON type wins over schema when UI differs (e.g. text schema + select form) */
  function detectFieldType(schemaField, formField) {
    if (formField?.optionsFrom?.resource) return 'foreign_key';
    if (formField?.type === 'password' || schemaField?.type === 'password') return 'password';
    if (formField?.type === 'select' && Array.isArray(formField.options) && formField.options.length) {
      return 'select';
    }
    if (formField?.type === 'textarea' || schemaField?.type === 'textarea') return 'long_text';
    if (formField?.type === 'checkbox' || schemaField?.type === 'boolean') return 'boolean';

    const t = String(schemaField?.type || formField?.type || '').toLowerCase();
    if (t === 'enum' || t === 'select') return 'select';
    if (t === 'email') return 'email';
    if (t === 'date') return 'date';
    if (t === 'datetime') return 'datetime';
    if (t === 'boolean') return 'boolean';
    if (t === 'number') return 'number';
    if (t === 'url') return 'url';
    if (t === 'file') return 'file';
    if (t === 'image') return 'image';
    if (formField?.type === 'select') return 'foreign_key';
    return 'text';
  }

  function parseSelectOptions(schemaField, formField) {
    const raw = schemaField?.options || formField?.options || [];
    if (!Array.isArray(raw)) return [];
    return raw.map((o) => {
      if (typeof o === 'string') return { value: o, label: o };
      return { value: o.value ?? o.label ?? '', label: o.label ?? o.value ?? '' };
    });
  }

  function cloneOptionsFrom(formField) {
    if (!formField?.optionsFrom || typeof formField.optionsFrom !== 'object') return null;
    return JSON.parse(JSON.stringify(formField.optionsFrom));
  }

  function parseForeignKey(schemaField, formField) {
    if (schemaField?.foreignKey) return { ...schemaField.foreignKey };
    const of = formField?.optionsFrom;
    if (!of?.resource) return null;
    return {
      table: of.resource,
      valueField: of.value || 'id',
      labelFormat: of.labelFormat || (of.label
        ? (Array.isArray(of.label) ? `{{${of.label[0]}}}` : `{{${of.label}}}`)
        : '{{name}}')
    };
  }

  function pickFormPreserve(formField) {
    if (!formField) return null;
    const out = {};
    for (const [k, v] of Object.entries(formField)) {
      if (!FORM_MANAGED_KEYS.has(k) && v !== undefined) out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  }

  function mergeField(schemaField, column, formField) {
    const name = schemaField?.name || column?.key || formField?.name || '';
    const type = detectFieldType(schemaField, formField);
    const f = createEmptyField();
    f.name = name;
    f.label = formField?.label || column?.label || schemaField?.label || name;
    f.type = type;
    f.required = !!(schemaField?.required || formField?.required);
    f.defaultValue = formField?.default ?? schemaField?.defaultValue ?? '';
    f.helpText = formField?.helpText || '';
    f.optionsFrom = cloneOptionsFrom(formField);
    f.foreignKey = parseForeignKey(schemaField, formField);
    f.selectOptions = type === 'select' ? parseSelectOptions(schemaField, formField) : [];
    f.showInList = column ? true : (!formField && !!schemaField);
    f.showInForm = !!formField || !!schemaField;
    f.sortable = column?.sortable !== false;
    f.searchable = column?.searchable === true;
    f.columnWidth = column?.width || '';
    f.columnType = column?.type === 'badge' ? 'badge' : '';
    f.badgeMap = column?.badgeMap ? { ...column.badgeMap } : null;
    f.placeholder = formField?.placeholder || '';
    f.colspan = formField?.colspan || (type === 'long_text' ? 2 : 1);
    f.rows = formField?.rows || 3;
    f.formSearchable = formField?.searchable === true;
    f.remoteSearch = formField?.remoteSearch === true;
    f.minSearchLength = formField?.minSearchLength ?? 0;
    f.customFormType = resolveCustomFormType(formField, type);
    f.presetId = formField?.preset || '';
    f._formPreserve = pickFormPreserve(formField);
    return f;
  }

  function extractFieldsFromSections(schema, appjson, formSections) {
    const config = appjson?.config || {};
    const tableCols = (config.table?.columns || []).filter((c) => c.key && c.type !== 'actions');
    const schemaFields = (schema?.fields || []).filter((f) => f.name && !SKIP.has(f.name));
    const colMap = Object.fromEntries(tableCols.map((c) => [c.key, c]));
    const schemaMap = Object.fromEntries(schemaFields.map((f) => [f.name, f]));
    const fields = [];

    formSections.forEach((section, sectionIndex) => {
      (section.fields || []).forEach((formField) => {
        const merged = mergeField(schemaMap[formField.name], colMap[formField.name], formField);
        merged.sectionIndex = sectionIndex;
        merged.showInForm = true;
        fields.push(merged);
      });
    });
    return fields;
  }

  function extractSectionMeta(formSections) {
    return (formSections || []).map((s) => ({
      title: s.title || '',
      icon: s.icon || 'fas fa-folder'
    }));
  }

  function extractFields(schema, appjson) {
    const config = appjson?.config || {};
    const tableCols = (config.table?.columns || []).filter((c) => c.key && c.type !== 'actions');
    const formFields = config.form?.fields || [];
    const schemaFields = (schema?.fields || []).filter((f) => f.name && !SKIP.has(f.name));

    const colMap = Object.fromEntries(tableCols.map((c) => [c.key, c]));
    const formMap = Object.fromEntries(formFields.map((f) => [f.name, f]));
    const schemaMap = Object.fromEntries(schemaFields.map((f) => [f.name, f]));

    const order = [];
    formFields.forEach((ff) => {
      if (!order.includes(ff.name)) order.push(ff.name);
    });
    tableCols.forEach((c) => {
      if (!order.includes(c.key)) order.push(c.key);
    });
    schemaFields.forEach((sf) => {
      if (!order.includes(sf.name)) order.push(sf.name);
    });

    return order.map((name) =>
      mergeField(schemaMap[name], colMap[name], formMap[name])
    );
  }

  function extractActions(appjson) {
    const cols = appjson?.config?.table?.columns || [];
    const actionsCol = cols.find((c) => c.type === 'actions');
    return actionsCol?.actions || ['edit', 'delete'];
  }

  function extractStudioConfig(schema, appjson) {
    const config = appjson?.config || {};
    const options = appjson?.options || {};
    const tableFeatures = config.table?.features || {};
    const form = config.form || {};
    const pagePath = appjson.path || ('/' + (config.resource || schema?.name || '').replace(/_/g, '-'));

    const base = {
      resource: schema?.name || config.resource || '',
      title: schema?.label || config.title || '',
      icon: config.icon || schema?.icon || 'fas fa-table',
      formDisplay: config.formDisplay || 'modal',
      modalSize: config.modalSize || 'large',
      perPage: tableFeatures.perPage || 25,
      perPageOptions: tableFeatures.perPageOptions || [10, 25, 50, 100],
      tableSearch: tableFeatures.search !== false,
      tablePagination: tableFeatures.pagination !== false,
      formColumns: form.columns || 2,
      formGap: form.gap || '1rem',
      formSubmitText: form.submitText || '',
      formCancelText: form.cancelText || '',
      formIntro: form.intro || '',
      formGridLayout: form.layout || '',
      formLayout: form.sections?.length ? 'sections' : 'fields',
      sections: form.sections?.length ? extractSectionMeta(form.sections) : [{ title: 'General', icon: 'fas fa-folder' }],
      permissions: options.permissions || [],
      actions: extractActions(appjson),
      menuRegister: {
        enabled: false,
        groupName: 'Data Master',
        menuRoles: [...(options.permissions || [])]
      },
      pagePath
    };

    base.fields = form.sections?.length
      ? extractFieldsFromSections(schema, appjson, form.sections)
      : extractFields(schema, appjson);

    return base;
  }

  function normalizeFormData(raw) {
    const base = {
      resource: '', title: '', icon: 'fas fa-table', formDisplay: 'modal', modalSize: 'large',
      perPage: 25, perPageOptions: [10, 25, 50, 100], tableSearch: true, tablePagination: true,
      formColumns: 2, formGap: '1rem', formSubmitText: '', formCancelText: '',
      formIntro: '', formGridLayout: '', formLayout: 'fields',
      sections: [{ title: 'General', icon: 'fas fa-folder' }],
      permissions: [], actions: ['edit', 'delete'], fields: [],
      pagePath: '',
      menuRegister: { enabled: false, groupName: 'Data Master', menuRoles: [] }
    };
    if (!raw || typeof raw !== 'object') return base;
    const out = { ...base, ...raw };
    if (!out.sections?.length) out.sections = [{ title: 'General', icon: 'fas fa-folder' }];
    if (!out.menuRegister) out.menuRegister = { ...base.menuRegister };
    out.fields = (raw.fields || []).map((f) => ({ ...createEmptyField(), ...f }));
    return out;
  }

  function applyPresetToField(field, preset) {
    if (!preset || typeof preset !== 'object') return field;
    const out = { ...field };
    const skip = new Set(['name']);
    for (const [k, v] of Object.entries(preset)) {
      if (skip.has(k)) continue;
      if (k === 'type') {
        const t = String(v);
        if (t === 'textarea') out.type = 'long_text';
        else if (t === 'checkbox') out.type = 'boolean';
        else if (STUDIO_TO_FORM[t]) out.type = t;
        else { out.type = 'text'; out.customFormType = t; }
      } else if (k === 'options') out.selectOptions = parseSelectOptions(null, { options: v });
      else if (k === 'optionsFrom') out.optionsFrom = JSON.parse(JSON.stringify(v));
      else if (k === 'default') out.defaultValue = v;
      else if (k === 'label' && v) out.label = v;
      else if (k === 'placeholder') out.placeholder = v;
      else if (k === 'colspan') out.colspan = v;
      else if (k === 'rows') out.rows = v;
      else if (k === 'searchable') out.formSearchable = v === true;
      else if (k === 'remoteSearch') out.remoteSearch = v === true;
      else if (k === 'minSearchLength') out.minSearchLength = v;
      else if (k === 'required') out.required = !!v;
    }
    if (out.optionsFrom?.resource) out.type = 'foreign_key';
    return out;
  }

  /** Build optionsFrom JSON for deploy from wizard field */
  function buildOptionsFromJson(field) {
    if (field.type !== 'foreign_key') return null;
    if (field.optionsFrom?.resource) {
      const of = { ...field.optionsFrom };
      if (field.formSearchable === true) of.searchable = true;
      else of.searchable = false;
      if (field.remoteSearch) of.remoteSearch = true;
      if (field.minSearchLength) of.minSearchLength = field.minSearchLength;
      return of;
    }
    const fk = field.foreignKey;
    if (!fk?.table) return null;
    const of = {
      resource: fk.table,
      value: fk.valueField || 'id'
    };
    if (fk.labelFormat) of.labelFormat = fk.labelFormat;
    if (field.formSearchable !== false) of.searchable = true;
    return of;
  }

  global.StudioCrudConfig = {
    createEmptyField,
    extractStudioConfig,
    extractFields,
    normalizeFormData,
    buildOptionsFromJson,
    applyPresetToField,
    detectFieldType,
    SKIP
  };
})(typeof window !== 'undefined' ? window : global);
