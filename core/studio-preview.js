// Studio live preview — CrudEngine + mock API
(function (global) {
  'use strict';

  function sampleValue(field, rowIndex) {
    const n = field.name;
    const t = field.type;
    if (n === 'id') return rowIndex;
    switch (t) {
      case 'number':
      case 'decimal':
        return rowIndex * 10;
      case 'boolean':
        return rowIndex % 2 === 0;
      case 'email':
        return `user${rowIndex}@example.com`;
      case 'date':
        return '2026-06-01';
      case 'datetime':
        return '2026-06-01T10:00:00';
      case 'select':
        if (field.selectOptions?.length) {
          const o = field.selectOptions[(rowIndex - 1) % field.selectOptions.length];
          return o.value;
        }
        return 'option_a';
      case 'foreign_key':
        return `ref_${rowIndex}`;
      case 'long_text':
        return `Sample long text row ${rowIndex}`;
      case 'url':
        return 'https://example.com';
      default:
        return `${field.label || n} ${rowIndex}`;
    }
  }

  function buildMockRows(formData, count) {
    const rows = [];
    for (let i = 1; i <= count; i++) {
      const row = { id: i };
      (formData.fields || []).forEach((f) => {
        if (f.name) row[f.name] = sampleValue(f, i);
      });
      rows.push(row);
    }
    return rows;
  }

  function createMockApiClient(formData) {
    const rows = buildMockRows(formData, 5);
    return {
      async read(endpoint) {
        const path = String(endpoint || '').split('?')[0];
        if (path.includes('/')) {
          return { success: true, data: rows[0] || {} };
        }
        return {
          success: true,
          data: rows,
          pagination: { page: 1, perPage: formData.perPage || 25, total: rows.length, totalPages: 1 }
        };
      },
      async list(resource, params) {
        return this.read(resource);
      },
      async get(path) {
        return this.read(path);
      }
    };
  }

  function appjsonToCrudSchema(appjson) {
    const cfg = appjson?.config || appjson;
    return {
      resource: cfg.resource,
      title: cfg.title,
      icon: cfg.icon,
      formDisplay: cfg.formDisplay,
      modalSize: cfg.modalSize,
      table: cfg.table,
      form: cfg.form,
      hideListHeader: false
    };
  }

  async function fetchPreviewAppjson(formData) {
    const API_BASE = typeof window !== 'undefined' ? window.location.origin : '';
    const res = await fetch(`${API_BASE}/api/studio/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(formData)
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.errors?.join(', ') || json.error || 'Preview failed');
    return json.appjson;
  }

  async function mountListPreview(slot, formData, existingAppjson) {
    slot.empty();
    slot.css({
      flex: '1',
      minHeight: 0,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    });

    if (typeof CrudEngine === 'undefined') {
      slot.child(el('p').text('CrudEngine not loaded'));
      slot.get();
      return;
    }

    let appjson = existingAppjson;
    if (!appjson) appjson = await fetchPreviewAppjson(formData);
    const schema = appjsonToCrudSchema(appjson);
    const mockClient = createMockApiClient(formData);
    const page = CrudEngine.build(schema, {
      apiClient: mockClient,
      pagePath: '/studio/preview',
      permissions: { can_create: false, can_update: false, can_delete: false }
    });
    slot.child(page);
    slot.get();
  }

  async function mountFormPreview(slot, formData, existingAppjson) {
    slot.empty();
    slot.css({
      flex: '1',
      minHeight: 0,
      overflow: 'auto',
      padding: '1rem',
      backgroundColor: '#f8fafc',
      borderRadius: '0.5rem'
    });

    if (typeof FormBuilder === 'undefined' || typeof CrudEngine === 'undefined') {
      slot.child(el('p').text('FormBuilder not loaded'));
      slot.get();
      return;
    }

    let appjson = existingAppjson;
    if (!appjson) appjson = await fetchPreviewAppjson(formData);
    const schema = appjsonToCrudSchema(appjson);
    const mockClient = createMockApiClient(formData);

    try {
      const formSchema = await CrudEngine.prepareFormSchemaForCrud(schema, mockClient, {}, { hideButtons: true });
      const formEl = FormBuilder.build(formSchema, {
        apiClient: mockClient,
        readOnly: false
      });
      slot.child(formEl);
    } catch (err) {
      slot.child(el('p').css({ color: '#dc2626' }).text(err.message || 'Form preview error'));
    }
    slot.get();
  }

  function buildPreviewTabs(formData, existingAppjson) {
    const root = el('div').css({
      display: 'flex',
      flexDirection: 'column',
      flex: '1',
      minHeight: 0,
      height: '100%'
    });

    const tabBar = el('div').css({
      display: 'flex',
      gap: '0.5rem',
      marginBottom: '1rem',
      borderBottom: '1px solid #e2e8f0',
      paddingBottom: '0.5rem',
      flexShrink: '0'
    });

    const body = el('div').css({
      flex: '1',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    });

    const listSlot = el('div').css({
      flex: '1',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    });
    const formSlot = el('div').css({ display: 'none', flex: '1', minHeight: 0, overflow: 'hidden' });
    const jsonSlot = el('div').css({ display: 'none', flex: '1', minHeight: 0, overflow: 'auto' });

    let active = 'list';
    const btnStyle = (key) => ({
      padding: '0.5rem 1rem',
      borderRadius: '0.375rem',
      border: 'none',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '0.8125rem',
      backgroundColor: active === key ? '#0e7490' : '#e2e8f0',
      color: active === key ? '#fff' : '#475569'
    });

    const listBtn = el('button').attr('type', 'button').css(btnStyle('list')).text('List View');
    const formBtn = el('button').attr('type', 'button').css(btnStyle('form')).text('Form View');
    const jsonBtn = el('button').attr('type', 'button').css(btnStyle('json')).text('JSON');

    const refresh = () => {
      listBtn.css(btnStyle('list'));
      formBtn.css(btnStyle('form'));
      jsonBtn.css(btnStyle('json'));
      listSlot.css({ display: active === 'list' ? 'flex' : 'none' });
      formSlot.css({ display: active === 'form' ? 'flex' : 'none' });
      jsonSlot.css({ display: active === 'json' ? 'block' : 'none' });
    };

    const show = async (tab) => {
      active = tab;
      refresh();
      if (tab === 'list' && !listSlot.el.dataset.loaded) {
        listSlot.el.dataset.loaded = '1';
        await mountListPreview(listSlot, formData, existingAppjson);
      }
      if (tab === 'form' && !formSlot.el.dataset.loaded) {
        formSlot.el.dataset.loaded = '1';
        await mountFormPreview(formSlot, formData, existingAppjson);
      }
      if (tab === 'json' && !jsonSlot.el.dataset.loaded) {
        jsonSlot.el.dataset.loaded = '1';
        jsonSlot.empty();
        try {
          const appjson = existingAppjson || await fetchPreviewAppjson(formData);
          const pre = el('pre').css({
            backgroundColor: '#f1f5f9',
            padding: '1rem',
            borderRadius: '0.5rem',
            fontSize: '0.75rem',
            overflow: 'auto',
            maxHeight: '100%',
            margin: 0
          });
          pre.el.textContent = JSON.stringify(appjson, null, 2);
          jsonSlot.child(pre);
        } catch (err) {
          jsonSlot.child(el('p').css({ color: '#dc2626' }).text(err.message));
        }
        jsonSlot.get();
      }
    };

    listBtn.click(() => show('list'));
    formBtn.click(() => show('form'));
    jsonBtn.click(() => show('json'));

    tabBar.child(listBtn);
    tabBar.child(formBtn);
    tabBar.child(jsonBtn);
    body.child(listSlot);
    body.child(formSlot);
    body.child(jsonSlot);
    root.child(tabBar);
    root.child(body);

    setTimeout(() => show('list'), 50);
    return root;
  }

  global.StudioPreview = {
    buildMockRows,
    createMockApiClient,
    fetchPreviewAppjson,
    mountListPreview,
    mountFormPreview,
    buildPreviewTabs,
    appjsonToCrudSchema
  };
})(typeof window !== 'undefined' ? window : global);
