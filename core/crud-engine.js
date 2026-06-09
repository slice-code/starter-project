(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
      (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.CrudEngine = factory());
})(this, (function () {
  'use strict';

  const T = typeof PjtkiTheme !== 'undefined' ? PjtkiTheme : {
    primary: '#0e7490', dark: '#155e75', mid: '#0891b2', accent: '#22d3ee', light: '#ecfeff',
    lightBorder: '#a5f3fc', lightBg: '#cffafe', gradientBtnStrong: 'linear-gradient(135deg, #0e7490 0%, #0891b2 100%)',
    shadowChip: 'rgba(14, 116, 144, 0.28)'
  };

  function resolveRecordId(schema, row) {
    const pk = schema?.printPkField || 'id';
    const val = row?.[pk] ?? row?.id ?? row?._id ?? row?.id_pembuatan ?? row?.id_pembuatanpap;
    return val != null && val !== '' ? val : null;
  }

  function resolveBiodataNavId(row) {
    const idBio = String(row?.id_biodata || row?.kode || '').trim();
    if (idBio) return idBio;
    return String(row?.id_tki || '').trim();
  }

  function stashCrudCreatePrefill(resource, data) {
    if (typeof window === 'undefined') return;
    window.__crudCreatePrefill = {
      resource: String(resource || ''),
      data: { ...(data || {}) },
      ts: Date.now()
    };
  }

  function takeCrudCreatePrefill(resource) {
    if (typeof window === 'undefined') return {};
    const stash = window.__crudCreatePrefill;
    if (!stash || stash.resource !== String(resource || '')) return {};
    if (Date.now() - (stash.ts || 0) > 600000) {
      delete window.__crudCreatePrefill;
      return {};
    }
    const out = { ...(stash.data || {}) };
    delete window.__crudCreatePrefill;
    return out;
  }

  function buildBukaRekeningPrefillFromRow(row) {
    const idTki = String(row?.id_tki || '').trim().toUpperCase();
    const rec = row?._rekening_record || null;
    const st = String(row?.status_rekening || rec?.status || 'proses').toLowerCase();
    return {
      nama_tki: row?.nama || '',
      id_tki: idTki,
      id_biodata: row?.id_biodata || rec?.id_biodata || '',
      bank: rec?.bank || row?.nama_bank || '',
      norek: rec?.norek || row?.no_rekening || '',
      tgl_buka: rec?.tgl_buka || row?.tgl_buka_rekening || '',
      status: st === 'belum' || !st ? 'proses' : st,
      keterangan: rec?.keterangan || ''
    };
  }

  function navigateBukaRekeningCreate(row) {
    const idTki = String(row?.id_tki || '').trim().toUpperCase();
    if (!idTki) {
      if (typeof layout !== 'undefined' && layout.toast) {
        layout.toast('ID TKI tidak ditemukan', { type: 'error' });
      }
      return;
    }
    const prefill = buildBukaRekeningPrefillFromRow(row);
    const core = typeof window !== 'undefined' ? window.pjtkiApp?.core : null;
    const pageData = core?.resolveCrudPage
      ? (core.resolveCrudPage('bukarekening') || core.resolveCrudPage('buka_rekening_baru'))
      : null;
    if (pageData?.instance) {
      if (row?.rekening_id != null && typeof pageData.instance.openEditAsNewPage === 'function') {
        const editRow = {
          ...(row._rekening_record || {}),
          id: row.rekening_id,
          ...prefill
        };
        pageData.instance.openEditAsNewPage(editRow);
        return;
      }
      if (typeof pageData.instance.openCreateAsNewPage === 'function') {
        pageData.instance.openCreateAsNewPage(prefill);
        return;
      }
    }
    stashCrudCreatePrefill('buka_rekening_baru', prefill);
    if (typeof window.triggerCrudCreate === 'function') {
      window.triggerCrudCreate('bukarekening', prefill);
      return;
    }
    if (typeof layout !== 'undefined' && layout.navigate) {
      layout.navigate(`/bukarekening/create?id_tki=${encodeURIComponent(idTki)}`);
    }
  }

  function buildBukaRekeningCreateAction() {
    return {
      icon: 'fas fa-plus-circle',
      label: 'Buat Rekening',
      variant: 'primary',
      onClick: (row) => navigateBukaRekeningCreate(row)
    };
  }

  function buildSpbgRequestPrefillFromRow(row) {
    return {
      id_tki: String(row?.id_tki || '').trim().toUpperCase(),
      id_biodata: row?.id_biodata || '',
      total_biaya: row?.total_spbg_sisa || row?.total_spbg || '',
      total_spbg_master: row?.total_spbg || '',
      total_terbayar: row?.total_spbg_terbayar || 0,
      rincian: row?.rincian_spbg || '',
      keterangan: row?.nama ? `Pengajuan SPBG untuk ${row.nama}` : ''
    };
  }

  function navigateSpbgRequestCreate(row) {
    const idTki = String(row?.id_tki || '').trim().toUpperCase();
    if (!idTki) {
      if (typeof layout !== 'undefined' && layout.toast) {
        layout.toast('ID TKI tidak ditemukan', { type: 'error' });
      }
      return;
    }
    const prefill = buildSpbgRequestPrefillFromRow(row);
    const core = typeof window !== 'undefined' ? window.pjtkiApp?.core : null;
    const pageData = core?.resolveCrudPage
      ? (core.resolveCrudPage('spbg-keuangan-request') || core.resolveCrudPage('spbg_keuangan_request'))
      : null;
    if (pageData?.instance && typeof pageData.instance.openCreateAsNewPage === 'function') {
      pageData.instance.openCreateAsNewPage(prefill);
      return;
    }
    stashCrudCreatePrefill('spbg_keuangan_request', prefill);
    if (typeof window.triggerCrudCreate === 'function') {
      window.triggerCrudCreate('spbg-keuangan-request', prefill);
      return;
    }
    if (typeof layout !== 'undefined' && layout.navigate) {
      layout.navigate(`/spbg-keuangan-request/create?id_tki=${encodeURIComponent(idTki)}`);
    }
  }

  function buildSpbgRequestCreateAction() {
    return {
      icon: 'fas fa-file-circle-plus',
      label: 'Buat Pengajuan',
      variant: 'primary',
      onClick: (row) => navigateSpbgRequestCreate(row)
    };
  }

  const CrudEngine = {
    refreshAppNotificationsIfNeeded(schema) {
      if (
        ['blk_izin_pulang', 'blk_izin', 'blk_detail_formulir', 'blk_sertifikat'].includes(schema?.resource)
        && typeof layout !== 'undefined'
        && typeof layout.fetchNotifications === 'function'
      ) {
        layout.fetchNotifications(true);
      }
    },

    applyBlkIzinPulangFormRules(form, initialData = {}) {
      const status = String(initialData.status || 'PENGAJUAN').trim().toUpperCase();
      const isSelesai = status === 'SELESAI';
      const fields = (form.fields || [])
        .filter((f) => {
          if (f.name === 'tgl_kembali_aktual') return isSelesai;
          return true;
        })
        .map((f) => {
          if (f.name === 'tgl_kembali_aktual') {
            return {
              ...f,
              readonly: true,
              label: 'Tanggal Kembali Aktual (di PT)',
              helpText: 'Terisi otomatis saat ditandai sudah kembali ke PT.'
            };
          }
          if (f.name === 'status') {
            return {
              ...f,
              readonly: isSelesai ? true : f.readonly,
              options: (f.options || []).filter((o) => o.value !== 'SELESAI')
            };
          }
          return f;
        });
      return { ...form, fields };
    },

    applyBlkIzinFormRules(form, initialData = {}) {
      const status = String(initialData.status || 'PENGAJUAN').trim().toUpperCase();
      const jenis = String(initialData.jenis_izin || 'KELUAR').trim().toUpperCase();
      const isSelesai = status === 'SELESAI';
      const isTidakHadir = jenis === 'TIDAK_HADIR';
      const fields = (form.fields || [])
        .filter((f) => {
          if (f.name === 'tgl_aktual') return isSelesai;
          if (f.name === 'lokasi_tujuan' && isTidakHadir) return false;
          return true;
        })
        .map((f) => {
          if (f.name === 'tgl_aktual') {
            return {
              ...f,
              readonly: true,
              helpText: 'Terisi otomatis saat ditandai selesai.'
            };
          }
          if (f.name === 'tgl_rencana') {
            return {
              ...f,
              required: !isTidakHadir,
              helpText: isTidakHadir
                ? 'Opsional untuk izin tidak hadir.'
                : (f.helpText || 'Wajib untuk jenis izin ini.')
            };
          }
          if (f.name === 'status') {
            return {
              ...f,
              readonly: isSelesai ? true : f.readonly,
              options: (f.options || []).filter((o) => o.value !== 'SELESAI')
            };
          }
          if (f.name === 'jenis_izin' && initialData._jenisLocked) {
            return { ...f, readonly: true };
          }
          return f;
        });
      return { ...form, fields };
    },

    applyBlkFormulirFormRules(form, initialData = {}) {
      const status = String(initialData.status || 'DRAFT').trim().toUpperCase();
      const isFinal = status === 'SELESAI' || status === 'BATAL';
      const fields = (form.fields || []).map((f) => {
        if (f.name === 'status') {
          return {
            ...f,
            readonly: isFinal ? true : f.readonly,
            options: (f.options || []).filter((o) => !['SELESAI', 'UJIAN'].includes(o.value))
          };
        }
        return f;
      });
      return { ...form, fields };
    },

    /** Preset field (JSON) lalu muat opsi select — sebelum FormBuilder.prepareFormSchema */
    async prepareFormSchemaForCrud(schema, apiClient, initialData = {}, opts = {}) {
      let form = schema.form || {};
      if (typeof FormFieldPresets !== 'undefined' && FormFieldPresets.resolveFormSchema) {
        form = await FormFieldPresets.resolveFormSchema(form, schema);
      }
      let data = { ...initialData };
      if (schema.resource === 'blk_izin_pulang') {
        if (!data.status) data.status = 'PENGAJUAN';
        form = this.applyBlkIzinPulangFormRules(form, data);
      }
      if (schema.resource === 'blk_izin') {
        if (!data.status) data.status = 'PENGAJUAN';
        if (!data.jenis_izin && schema._jenisFilter) {
          data.jenis_izin = schema._jenisFilter;
          data._jenisLocked = true;
        }
        form = this.applyBlkIzinFormRules(form, data);
      }
      if (schema.resource === 'blk_formulir') {
        if (!data.status) data.status = 'DRAFT';
        form = this.applyBlkFormulirFormRules(form, data);
      }
      if (schema.resource === 'blk_inventaris_barang') {
        if (!data.kode_barang) {
          data.kode_barang = `INV-BLK-${Date.now().toString(36).toUpperCase()}`;
        }
        if (!data.status) data.status = 'AKTIF';
        if (!data.kondisi) data.kondisi = 'BAIK';
        if (!data.sumber_dana) data.sumber_dana = 'Pembelian';
      }
      
      // Extract fields dari form.sections jika tidak ada fields
      let payload = { ...form, ...(opts.hideButtons ? { hideButtons: true } : {}) };
      if (!payload.fields && payload.sections && Array.isArray(payload.sections)) {
        payload.fields = payload.sections.flatMap(s => s.fields || []);
      }
      
      return FormBuilder.prepareFormSchema(payload, apiClient, data);
    },

    wireBlkPersonalAutofill(formOptions, apiClient, schemaRef = null) {
      const holder = { form: null };
      if (!apiClient) return holder;
      const prev = formOptions.onFieldChange;
      formOptions.onFieldChange = async (fieldName, value) => {
        if (fieldName === 'id_biodata' && holder.form) {
          const id = String(value || '').trim();
          const patch = { nodaftar: '', nama: '' };
          if (schemaRef?.resource === 'blk_sertifikat') {
            patch.sektor = id
              ? (String(id).trim().toUpperCase().slice(0, 2) === 'JP' ? 'J' : 'F')
              : '';
          }
          if (id) {
            try {
              const res = await apiClient.read(
                `personalblk?id_biodata=${encodeURIComponent(id)}&perPage=1`
              );
              const row = (res?.data || [])[0];
              if (row) {
                patch.nodaftar = String(row.nodaftar || row.id_biodata || '').trim();
                patch.nama = String(row.nama || '').trim();
                if (schemaRef?.resource === 'blk_sertifikat' && !patch.sektor) {
                  patch.sektor = String(row.id_biodata || id).trim().toUpperCase().slice(0, 2) === 'JP' ? 'J' : 'F';
                }
              }
            } catch (e) {
              console.warn('[BLK] Gagal muat personalblk:', e);
            }
          }
          holder.form.setData({ ...holder.form.getData(), ...patch });
        }
        if (typeof prev === 'function') prev(fieldName, value);
      };
      return holder;
    },

    wirePembayaranNominalAutofill(formOptions, apiClient, schemaRef = null) {
      const holder = { form: null, loading: false };
      if (!apiClient || schemaRef?.resource !== 'pembayaran_tki') return holder;
      const prev = formOptions.onFieldChange;
      formOptions.onFieldChange = async (fieldName, value) => {
        if (typeof prev === 'function') await prev(fieldName, value);
        if (!holder.form || holder.loading) return;
        if (fieldName !== 'id_tki' && fieldName !== 'jenis_biaya') return;
        const current = holder.form.getData ? holder.form.getData() : {};
        const idTki = String(current.id_tki || '').trim();
        const jenisBiaya = String(current.jenis_biaya || '').trim().toLowerCase();
        if (!idTki || !jenisBiaya) return;
        if (!['medical3', 'ujk', 'paspor', 'visa', 'asuransi', 'spbg', 'keberangkatan'].includes(jenisBiaya)) return;
        holder.loading = true;
        try {
          const res = await apiClient.read(
            `pembayaran-tki/default-nominal?id_tki=${encodeURIComponent(idTki)}&jenis_biaya=${encodeURIComponent(jenisBiaya)}`
          );
          const payload = res?.data || {};
          const patch = {};
          if (payload.id_biodata && !current.id_biodata_snapshot) {
            patch.id_biodata_snapshot = payload.id_biodata;
          }
          if (Number(payload.nominal) > 0) {
            patch.nominal = Number(payload.nominal);
          }
          if (Object.keys(patch).length) {
            holder.form.setData({ ...current, ...patch });
          }
        } catch (_) {
          /* ignore autofill */
        } finally {
          holder.loading = false;
        }
      };
      return holder;
    },

    // Build complete CRUD UI from JSON schema
    build(schema, options = {}) {
      const {
        apiClient = null,
        container = null,
        permissions = null,
        pagePath = null
      } = options;
      if (pagePath && !schema.path) {
        schema.path = pagePath;
      }

      const resource = schema.resource;
      let tableInstance = null;
      let currentPermissions = permissions || {};
      let lastPage = 1;
      let lastPerPage = parseInt(localStorage.getItem(`crud_perPage_${schema.listResource || schema.resource}`)) || schema.table?.features?.perPage || 10;
      let lastSearch = null;
      let lastSortColumn = schema.table?.defaultSort?.column || null;
      let lastSortDirection = schema.table?.defaultSort?.direction || 'asc';
      let refreshTable = () => Promise.resolve();

      const pagePerms = Array.isArray(currentPermissions) ? null : currentPermissions;
      const roleList = Array.isArray(currentPermissions) ? currentPermissions : null;

      const canCreate = this.checkPermission('create', pagePerms || schema.permissions, roleList);
      const canRead = this.checkPermission('read', pagePerms || schema.permissions, roleList);
      const canUpdate = this.checkPermission('update', pagePerms || schema.permissions, roleList);
      const canDelete = this.checkPermission('delete', pagePerms || schema.permissions, roleList);

      const isReportPage = !!(schema.readOnlyReport && schema.reportKey);
      let reportHeroApi = null;

      if (schema.listSektorFilters && schema.listSektorFilters.length) {
        if (typeof TkiReportUi !== 'undefined' && TkiReportUi.normalizeActiveFilters) {
          TkiReportUi.normalizeActiveFilters(schema);
        } else {
          schema._sektorPrefix = schema._sektorPrefix || '';
          schema._stageFilter = schema._stageFilter || '';
          schema._stageFilterLabel = schema._stageFilterLabel || 'Semua Tahap';
        }
      }

      const applyReportFilters = () => {
        lastPage = 1;
        if (typeof TkiReportUi !== 'undefined' && TkiReportUi.syncReportFilterLabels) {
          TkiReportUi.syncReportFilterLabels(schema);
        }
        if (tableInstance) {
          this.loadData(schema, apiClient, tableInstance, lastSearch, lastSortColumn, lastSortDirection, 1, lastPerPage);
        }
      };

      // Container - full height flex column
      const crudContainer = el('div').css({
        display: 'flex',
        flexDirection: 'column',
        flex: '1',
        width: '100%',
        minWidth: '0',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backgroundColor: isReportPage ? T.light : '#fff',
        minHeight: '0',
        height: '100%'
      });

      const hideListHeader = !!schema.hideListHeader;

      // Header datatable: baris judul/aksi + baris pencarian penuh
      const header = el('div').class('crud-dt-header').css({
        display: 'flex',
        flexDirection: 'column',
        gap: hideListHeader ? '0.55rem' : '0.85rem',
        padding: hideListHeader
          ? '0.7rem 1rem'
          : (isReportPage ? '0.85rem 1.25rem' : '1rem 1.35rem 0.95rem'),
        borderBottom: `1px solid ${T.cardBorder || '#e8ecf1'}`,
        background: isReportPage
          ? 'rgba(255,255,255,0.92)'
          : `linear-gradient(180deg, #ffffff 0%, ${T.lightBg || '#f8fafc'} 100%)`,
        flexShrink: '0',
        position: 'relative',
        zIndex: '10',
        boxShadow: isReportPage ? '0 2px 12px rgba(15, 23, 42, 0.06)' : '0 1px 3px rgba(15, 23, 42, 0.05)',
        backdropFilter: isReportPage ? 'blur(8px)' : 'none'
      });

      const topBar = el('div').class('crud-dt-header-top').css({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        width: '100%'
      });

      const titleBlock = el('div').css({
        display: 'flex',
        alignItems: 'center',
        gap: '0.8rem',
        flex: '1 1 220px',
        minWidth: '0'
      });

      if (!hideListHeader && isReportPage && typeof TkiReportUi !== 'undefined') {
        const reportBadge = el('span').css({
          padding: '0.35rem 0.65rem',
          borderRadius: '999px',
          background: `linear-gradient(135deg, ${T.lightBg} 0%, ${T.light} 100%)`,
          border: `1px solid ${T.lightBorder}`,
          color: T.primary,
          fontSize: '0.72rem',
          fontWeight: '800',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          flexShrink: '0'
        });
        reportBadge.child(el('i').class('fas fa-chart-bar').css({ marginRight: '0.35rem' }));
        reportBadge.child(el('span').text('Laporan'));
        titleBlock.child(reportBadge);
      } else if (!hideListHeader && !isReportPage) {
        const iconBox = el('div').css({
          width: '44px',
          height: '44px',
          borderRadius: '0.8rem',
          background: T.gradientBtnStrong,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: '0',
          boxShadow: `0 4px 14px ${T.shadowChip}`
        });
        iconBox.child(el('i').class(schema.icon || 'fas fa-table').css({
          color: '#fff',
          fontSize: '1.05rem'
        }));
        titleBlock.child(iconBox);
      }

      const titleTextWrap = el('div').css({ minWidth: '0', flex: '1' });
      if (!hideListHeader) {
        const titleEl = el('h2')
          .text(schema.title || 'CRUD')
          .css({
            margin: '0',
            fontSize: isReportPage ? '1.05rem' : '1.28rem',
            fontWeight: '800',
            color: T.textDark || T.text || '#263247',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          });
        titleTextWrap.child(titleEl);
        if (!isReportPage) {
          titleTextWrap.child(el('p').text(schema.listSubtitle || 'Cari dan kelola data tabel').css({
            margin: '0.2rem 0 0',
            fontSize: '0.8125rem',
            color: T.textMuted || '#94a3b8',
            lineHeight: 1.35
          }));
        }
        titleBlock.child(titleTextWrap);
        topBar.child(titleBlock);
      }

      const actionsBar = el('div').class('crud-dt-header-actions').css({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '0.45rem',
        flexShrink: '0'
      });

      const actionBtnBase = {
        padding: '0.5rem 0.95rem',
        borderRadius: '0.625rem',
        border: `1px solid ${T.cardBorder || '#e2e8f0'}`,
        backgroundColor: '#fff',
        color: T.text || '#334155',
        cursor: 'pointer',
        fontSize: '0.8125rem',
        fontWeight: '600',
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        whiteSpace: 'nowrap',
        flexShrink: '0',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)'
      };

      const hasReportPopupFilters =
        !!(
          schema.listSektorFilters?.length
          || schema.listStageFilters?.length
          || schema.listStatusFilters?.length
          || schema.listQuickFilters?.length
          || schema.listJenisFilters?.length
          || schema.listStatujkFilters?.length
          || schema.enablePopupFilters
        );

      if (hasReportPopupFilters
        && (isReportPage || schema.enablePopupFilters)
        && typeof TkiReportUi !== 'undefined'
        && TkiReportUi.buildReportFilterToolbar) {
        const filterToolbar = TkiReportUi.buildReportFilterToolbar(schema, {
          onApply: applyReportFilters,
          variant: 'header'
        });
        actionsBar.child(filterToolbar.el);
      }

      const clearSortBtn = el('button').attr('type', 'button').class('crud-dt-action-btn').css({
        ...actionBtnBase,
        border: '1px solid #fcd34d',
        backgroundColor: '#fffbeb',
        color: '#b45309',
        display: 'none'
      });
      clearSortBtn.child(el('i').class('fas fa-sort-amount-down-alt'));
      clearSortBtn.child(el('span').text('Reset Urutan'));
      clearSortBtn.click(() => {
        const defaultColumn = schema.table?.defaultSort?.column || null;
        const defaultDirection = schema.table?.defaultSort?.direction || 'asc';

        lastSortColumn = defaultColumn;
        lastSortDirection = defaultDirection;
        clearSortBtn.css({ display: 'none' });

        this.loadData(schema, apiClient, tableInstance, lastSearch, lastSortColumn, lastSortDirection, lastPage, lastPerPage);

        if (tableInstance && typeof tableInstance.resetSort === 'function') {
          tableInstance.resetSort(defaultColumn, defaultDirection);
        }
      });
      actionsBar.child(clearSortBtn);

      const refreshBtn = el('button')
        .attr('type', 'button')
        .attr('title', 'Muat ulang data tabel')
        .attr('aria-label', 'Refresh data tabel')
        .class('crud-dt-action-btn crud-dt-refresh-btn')
        .css(actionBtnBase);
      refreshBtn.child(el('i').class('fas fa-arrows-rotate').css({ fontSize: '0.875rem', minWidth: '0.875rem' }));
      refreshBtn.child(el('span').text('Refresh'));
      let refreshBusy = false;
      refreshBtn.click(async () => {
        if (refreshBusy || !apiClient || !tableInstance) return;
        refreshBusy = true;
        const icon = refreshBtn.el.querySelector('i');
        if (icon) icon.classList.add('fa-spin');
        refreshBtn.css({ opacity: '0.72', pointerEvents: 'none' });
        try {
          await refreshTable();
        } finally {
          refreshBusy = false;
          if (icon) icon.classList.remove('fa-spin');
          refreshBtn.css({ opacity: '1', pointerEvents: 'auto' });
        }
      });
      actionsBar.child(refreshBtn);

      if (typeof CrmExport !== 'undefined' && schema.resource && (!schema.reportKey || schema.readOnlyReport)) {
        const exportBtn = el('button').attr('type', 'button').class('crud-dt-action-btn').css(actionBtnBase);
        exportBtn.child(el('i').class('fas fa-file-excel').css({ color: '#16a34a' }));
        exportBtn.child(el('span').text('Export Excel'));
        exportBtn.click(() => {
          const searchQuery = String(searchInput.el?.value || lastSearch || '').trim();
          if (schema.reportKey) {
            CrmExport.runExport(() => CrmExport.exportTkiReportXlsx(apiClient, schema, {
              search: searchQuery,
              activeFilters: schema._activeFilters,
              sektorPrefix: schema._sektorPrefix || '',
              stageFilter: schema._stageFilter || '',
              statusFilter: schema._statusFilter || '',
              quickFilter: schema._quickFilter || '',
              jenisIzin: schema._jenisFilter || '',
              statujkFilter: schema._statujkFilter || '',
              sortColumn: lastSortColumn,
              sortDirection: lastSortDirection
            }));
          } else if (schema.table?.columns?.length || schema.export?.columns?.length) {
            CrmExport.runExport(() => CrmExport.exportCrudXlsx(apiClient, schema, {
              search: searchQuery,
              sortColumn: lastSortColumn,
              sortDirection: lastSortDirection
            }));
          } else {
            CrmExport.runExport(() => CrmExport.exportTableXlsx(schema.resource));
          }
        });
        actionsBar.child(exportBtn);
      }

      if (canCreate && !schema.hideCreateButton) {
        const createButton = el('button').class('crud-dt-action-btn crud-dt-action-btn-primary').css({
          ...actionBtnBase,
          padding: '0.52rem 1.05rem',
          border: 'none',
          background: T.gradientBtnStrong,
          color: '#fff',
          boxShadow: `0 4px 12px ${T.shadowChip}`
        });
        createButton.child(el('i').class('fas fa-plus'));
        createButton.child(el('span').text(schema.createButtonLabel || 'Tambah Baru'));
        createButton.click(() => {
          this.openCreateModal(schema, apiClient, tableInstance, refreshTable);
        });
        actionsBar.child(createButton);
      }

      const searchRow = el('div').class('crud-dt-header-search-row').css({
        display: 'flex',
        alignItems: 'center',
        gap: '0.65rem',
        width: '100%',
        paddingTop: hideListHeader ? '0' : '0.15rem',
        flexWrap: hideListHeader ? 'wrap' : 'nowrap'
      });

      const searchWrap = el('div').class('crud-dt-search-wrap').css({
        flex: '1',
        minWidth: '180px',
        display: 'flex',
        alignItems: 'center',
        position: 'relative'
      });
      searchWrap.child(el('i').class('fas fa-search crud-dt-search-icon').css({
        position: 'absolute',
        left: '0.95rem',
        color: T.textMuted || '#94a3b8',
        fontSize: '0.875rem',
        pointerEvents: 'none',
        zIndex: '1'
      }));
      const searchInput = el('input')
        .attr('type', 'search')
        .attr('placeholder', schema.searchPlaceholder || (schema.readOnlyReport ? 'Cari data laporan...' : 'Cari nama, ID, atau kata kunci...'))
        .attr('autocomplete', 'off')
        .attr('spellcheck', 'false')
        .class('crud-dt-search')
        .css({
          width: '100%',
          padding: '0.62rem 2.5rem 0.62rem 2.55rem',
          borderRadius: '0.75rem',
          border: `1px solid ${T.cardBorder || '#e2e8f0'}`,
          fontSize: '0.875rem',
          outline: 'none',
          backgroundColor: '#fff',
          color: T.textDark || '#263247',
          boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.03)',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
        });
      searchWrap.child(searchInput);

      const clearSearchBtn = el('button')
        .attr('type', 'button')
        .attr('aria-label', 'Hapus pencarian')
        .class('crud-dt-search-clear')
        .css({
          position: 'absolute',
          right: '0.45rem',
          width: '28px',
          height: '28px',
          borderRadius: '999px',
          border: 'none',
          background: 'transparent',
          color: T.textMuted || '#94a3b8',
          cursor: 'pointer',
          display: 'none',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.8rem',
          transition: 'background 0.15s ease, color 0.15s ease'
        });
      clearSearchBtn.child(el('i').class('fas fa-times'));
      searchWrap.child(clearSearchBtn);
      searchRow.child(searchWrap);

      if (!hideListHeader) {
        searchRow.child(el('span').class('crud-dt-search-kbd').text('Enter ↵').css({
          fontSize: '0.72rem',
          fontWeight: '600',
          color: T.textMuted || '#94a3b8',
          padding: '0.28rem 0.55rem',
          borderRadius: '0.45rem',
          border: `1px solid ${T.cardBorder || '#e8ecf1'}`,
          background: '#fff',
          whiteSpace: 'nowrap',
          flexShrink: '0',
          display: 'none'
        }));
      }

      if (hideListHeader) {
        searchRow.child(actionsBar);
        header.child(searchRow);
      } else {
        topBar.child(actionsBar);
        header.child(topBar);
        header.child(searchRow);
      }

      const chartSlot = el('div').css({
        display: 'none',
        flex: '1',
        overflow: 'hidden',
        flexDirection: 'column',
        minHeight: '0'
      });
      const tableSlot = el('div').css({
        display: 'flex',
        flexDirection: 'column',
        flex: '1',
        overflow: 'hidden',
        minHeight: '0',
        width: '100%',
        minWidth: '0',
        boxSizing: 'border-box'
      });
      let chartViewActive = false;

      if (schema.enableChartView && schema.reportKey && typeof TkiReportUi !== 'undefined') {
        const chartBtn = el('button').attr('type', 'button').css({
          padding: '0.55rem 1rem',
          borderRadius: '0.625rem',
          border: '1px solid #7c3aed',
          backgroundColor: '#f5f3ff',
          color: '#6d28d9',
          cursor: 'pointer',
          fontSize: '0.8125rem',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          whiteSpace: 'nowrap',
          flexShrink: '0'
        });
        chartBtn.child(el('i').class('fas fa-chart-column'));
        const chartBtnLabel = el('span').text('Lihat Grafik');
        chartBtn.child(chartBtnLabel);

        const renderChartView = async () => {
          chartSlot.empty();
          chartSlot.child(el('div').css({
            padding: '2rem',
            textAlign: 'center',
            color: '#64748b'
          }).text('Memuat grafik...'));
          chartSlot.get();
          try {
            const chartData = await TkiReportUi.fetchChartData(apiClient, schema.reportKey, schema);
            chartSlot.empty();
            chartSlot.child(TkiReportUi.buildChartPanel(schema.reportKey, chartData, schema));
            chartSlot.get();
          } catch (err) {
            chartSlot.empty();
            chartSlot.child(el('div').css({
              padding: '2rem',
              textAlign: 'center',
              color: '#dc2626'
            }).text(err.message || 'Gagal memuat grafik'));
            chartSlot.get();
          }
        };

        chartBtn.click(async () => {
          chartViewActive = !chartViewActive;
          if (chartViewActive) {
            chartBtnLabel.text('Lihat Tabel');
            chartBtn.css({ backgroundColor: '#6d28d9', color: '#fff', border: '1px solid #6d28d9' });
            tableSlot.css({ display: 'none' });
            chartSlot.css({ display: 'flex' });
            await renderChartView();
          } else {
            chartBtnLabel.text('Lihat Grafik');
            chartBtn.css({ backgroundColor: '#f5f3ff', color: '#6d28d9', border: '1px solid #7c3aed' });
            chartSlot.css({ display: 'none' });
            tableSlot.css({ display: 'flex' });
          }
        });
        actionsBar.child(chartBtn);
      }

      crudContainer.child(header);

      if (schema.listInfoComponent && typeof UiBuilder !== 'undefined' && UiBuilder.components?.[schema.listInfoComponent]) {
        crudContainer.child(
          UiBuilder.renderComponent(
            { type: schema.listInfoComponent, ...(schema.listInfoProps || {}) },
            { apiClient }
          )
        );
      }

      const tableContentHost = (isReportPage && typeof TkiReportUi !== 'undefined')
        ? TkiReportUi.buildReportTableCard().css({ width: '100%', minWidth: '0', boxSizing: 'border-box' })
        : null;

      if (isReportPage && typeof TkiReportUi !== 'undefined') {
        reportHeroApi = TkiReportUi.buildReportHero(schema);
        tableSlot.child(reportHeroApi.el);
      }

      const usePopupOnlyBlkReportFilters =
        schema.reportModule === 'blk'
        && schema.readOnlyReport
        && hasReportPopupFilters;

      if (!usePopupOnlyBlkReportFilters) {
        const usePopupOnlyBlkIzinPulangFilters =
          schema.reportModule === 'blk'
          && schema.reportKey === 'izin-pulang'
          && schema.readOnlyReport;
      }

      if (schema.listSektorFilters && schema.listSektorFilters.length
        && !usePopupOnlyBlkReportFilters
        && !(typeof TkiReportUi !== 'undefined' && TkiReportUi.buildReportFilterToolbar)) {

        const filtersWrap = el('div').css({
          borderBottom: '1px solid #e2e8f0',
          background: '#f8fafc'
        });

        const filterBar = el('div').css({
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.45rem',
          padding: isReportPage ? '0.75rem 1.15rem' : '0.75rem 1.25rem 0.75rem',
          borderBottom: schema.listStageFilters?.length ? '1px solid #eef2f7' : 'none'
        });
        if (isReportPage) {
          filterBar.child(el('span').text('Sektor:').css({
            fontSize: '0.75rem',
            fontWeight: '700',
            color: '#64748b',
            marginRight: '0.15rem',
            minWidth: '88px'
          }));
        }
        const chipButtons = [];
        schema.listSektorFilters.forEach((f) => {
          const active = (schema._sektorPrefix || '') === (f.prefix || '');
          const chip = el('button').attr('type', 'button').text(f.label).css({
            padding: isReportPage ? '0.4rem 0.85rem' : '0.35rem 0.7rem',
            borderRadius: '999px',
            border: active ? `1px solid ${T.primary}` : '1px solid #cbd5e1',
            background: active
              ? (isReportPage ? T.gradientBtnStrong : T.primary)
              : '#fff',
            color: active ? '#fff' : '#475569',
            fontSize: '0.75rem',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: active && isReportPage ? `0 4px 12px ${T.shadowChip}` : 'none',
            transition: 'all 0.15s ease'
          });
          chipButtons.push({ chip, prefix: f.prefix || '' });
          chip.click(() => {
            schema._sektorPrefix = f.prefix || '';
            chipButtons.forEach(({ chip: c, prefix }) => {
              const isOn = prefix === schema._sektorPrefix;
              c.css({
                border: isOn ? `1px solid ${T.primary}` : '1px solid #cbd5e1',
                background: isOn
                  ? (isReportPage ? T.gradientBtnStrong : T.primary)
                  : '#fff',
                color: isOn ? '#fff' : '#475569',
                boxShadow: isOn && isReportPage ? `0 4px 12px ${T.shadowChip}` : 'none'
              });
            });
            applyReportFilters();
          });
          filterBar.child(chip);
        });
        filtersWrap.child(filterBar);

        if (schema.listStageFilters && schema.listStageFilters.length) {
          const stageBar = el('div').css({
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.45rem',
            padding: isReportPage ? '0.75rem 1.15rem' : '0.75rem 1.25rem'
          });
          if (isReportPage) {
            stageBar.child(el('span').text('Tahap:').css({
              fontSize: '0.75rem',
              fontWeight: '700',
              color: '#64748b',
              marginRight: '0.15rem',
              minWidth: '88px'
            }));
          }
          const stageChips = [];
          schema.listStageFilters.forEach((f) => {
            const active = (schema._stageFilter || '') === (f.key || '');
            const chip = el('button').attr('type', 'button').text(f.label).css({
              padding: isReportPage ? '0.4rem 0.85rem' : '0.35rem 0.7rem',
              borderRadius: '999px',
              border: active ? '1px solid #7c3aed' : '1px solid #cbd5e1',
              background: active
                ? (isReportPage ? 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' : '#7c3aed')
                : '#fff',
              color: active ? '#fff' : '#475569',
              fontSize: '0.75rem',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: active && isReportPage ? '0 4px 12px rgba(124, 58, 237, 0.28)' : 'none',
              transition: 'all 0.15s ease'
            });
            stageChips.push({ chip, key: f.key || '', label: f.label });
            chip.click(() => {
              schema._stageFilter = f.key || '';
              schema._stageFilterLabel = f.label || 'Semua Tahap';
              stageChips.forEach(({ chip: c, key }) => {
                const isOn = key === schema._stageFilter;
                c.css({
                  border: isOn ? '1px solid #7c3aed' : '1px solid #cbd5e1',
                  background: isOn
                    ? (isReportPage ? 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' : '#7c3aed')
                    : '#fff',
                  color: isOn ? '#fff' : '#475569',
                  boxShadow: isOn && isReportPage ? '0 4px 12px rgba(124, 58, 237, 0.28)' : 'none'
                });
              });
              applyReportFilters();
            });
            stageBar.child(chip);
          });
          filtersWrap.child(stageBar);
        }

        if (tableContentHost) {
          tableContentHost.child(filtersWrap);
        } else {
          tableSlot.child(filtersWrap);
        }
      }

      // Quick filters for BLK izin pulang report (additional quick filter chip)
      if (schema.listQuickFilters && schema.listQuickFilters.length && !usePopupOnlyBlkReportFilters) {
        const quickFiltersWrap = el('div').css({
          borderBottom: '1px solid #e2e8f0',
          background: 'linear-gradient(to right, #fef3c7, #fde68a)'
        });
        const quickBar = el('div').css({
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem 1.25rem'
        });
        quickBar.child(el('span').text('Monitoring:').css({
          fontSize: '0.75rem',
          fontWeight: '700',
          color: '#92400e',
          marginRight: '0.15rem',
          minWidth: '100px'
        }));
        const quickChips = [];
        schema.listQuickFilters.forEach((f) => {
          const active = (schema._quickFilter || '') === (f.key || '');
          const chip = el('button').attr('type', 'button').css({
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.45rem 0.9rem',
            borderRadius: '9999px',
            border: `2px solid ${f.color || '#f59e0b'}`,
            background: active ? (f.color || '#f59e0b') : '#fff',
            color: active ? '#fff' : (f.color || '#f59e0b'),
            fontSize: '0.8rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap'
          }).attr('title', f.hint || '');
          chip.child([
            el('i').attr('class', f.icon || 'fas fa-filter'),
            el('span').text(f.label)
          ]);
          quickChips.push({ chip, key: f.key || '' });
          chip.click(() => {
            if (schema._quickFilter === f.key) {
              schema._quickFilter = '';
            } else {
              schema._quickFilter = f.key || '';
            }
            quickChips.forEach(({ chip: c, key }) => {
              const isOn = key === schema._quickFilter;
              const cfg = schema.listQuickFilters.find(q => q.key === key) || {};
              c.css({
                border: `2px solid ${cfg.color || '#f59e0b'}`,
                background: isOn ? (cfg.color || '#f59e0b') : '#fff',
                color: isOn ? '#fff' : (cfg.color || '#f59e0b')
              });
            });
            refreshTable();
          });
          quickBar.child(chip);
        });
        quickFiltersWrap.child(quickBar);
        if (tableContentHost) {
          tableContentHost.child(quickFiltersWrap);
        } else {
          tableSlot.child(quickFiltersWrap);
        }
      }

      // Status filters for BLK izin pulang (with monitoring options)
      if (schema.listStatusFilters && schema.listStatusFilters.length && !usePopupOnlyBlkReportFilters) {
        schema._statusFilter = schema._statusFilter || '';
        const statusWrap = el('div').css({
          borderBottom: '1px solid #e2e8f0',
          background: '#f8fafc'
        });
        const statusBar = el('div').css({
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.45rem',
          padding: '0.75rem 1.25rem'
        });
        statusBar.child(el('span').text('Status:').css({
          fontSize: '0.75rem',
          fontWeight: '700',
          color: '#64748b',
          marginRight: '0.15rem',
          minWidth: '56px'
        }));
        const statusChips = [];
        schema.listStatusFilters.forEach((f) => {
          const isMonitoring = f.type === 'monitoring';
          const active = (schema._statusFilter || '') === (f.key || '');
          const chip = el('button').attr('type', 'button').text(f.label).css({
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.35rem 0.7rem',
            borderRadius: '9999px',
            border: active
              ? `1px solid ${isMonitoring ? f.color : T.primary}`
              : `1px solid ${isMonitoring ? f.color : '#cbd5e1'}`,
            background: active
              ? (isMonitoring ? f.color : T.primary)
              : (isMonitoring ? '#fff' : '#fff'),
            color: active ? '#fff' : (isMonitoring ? f.color : '#475569'),
            fontSize: '0.75rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          });
          if (isMonitoring && f.icon) {
            chip.prepend(el('i').attr('class', f.icon).css({ fontSize: '0.7rem' }));
          }
          statusChips.push({ chip, key: f.key || '' });
          chip.click(() => {
            // Toggle off if same filter clicked
            if (schema._statusFilter === f.key) {
              schema._statusFilter = '';
              schema._quickFilter = ''; // Clear quick filter too
            } else {
              schema._statusFilter = f.key || '';
              // If monitoring filter, also set the corresponding quickFilter
              if (isMonitoring) {
                schema._quickFilter = f.key;
              } else {
                schema._quickFilter = '';
              }
            }
            statusChips.forEach(({ chip: c, key }) => {
              const isOn = key === schema._statusFilter;
              const cfg = schema.listStatusFilters.find(s => s.key === key) || {};
              const isMon = cfg.type === 'monitoring';
              c.css({
                border: `1px solid ${isOn ? (isMon ? cfg.color : T.primary) : (isMon ? cfg.color : '#cbd5e1')}`,
                background: isOn ? (isMon ? cfg.color : T.primary) : (isMon ? '#fff' : '#fff'),
                color: isOn ? '#fff' : (isMon ? cfg.color : '#475569')
              });
            });
            refreshTable();
          });
          statusBar.child(chip);
        });
        statusWrap.child(statusBar);
        if (tableContentHost) {
          tableContentHost.child(statusWrap);
        } else {
          tableSlot.child(statusWrap);
        }
      }

      // Refresh function that preserves current pagination and sort state
      refreshTable = (extraParams) => {
        // Support quickFilter param
        if (extraParams && extraParams.quick_filter) {
          schema._quickFilter = extraParams.quick_filter;
        }
        return this.loadData(schema, apiClient, tableInstance, lastSearch, lastSortColumn, lastSortDirection, lastPage, lastPerPage);
      };

      if (schema.listJenisFilters && schema.listJenisFilters.length && !usePopupOnlyBlkReportFilters) {
        schema._jenisFilter = schema._jenisFilter || '';
        const jenisWrap = el('div').css({
          borderBottom: '1px solid #e2e8f0',
          background: '#f8fafc'
        });
        const jenisBar = el('div').css({
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.45rem',
          padding: '0.75rem 1.25rem'
        });
        jenisBar.child(el('span').text('Jenis:').css({
          fontSize: '0.75rem',
          fontWeight: '700',
          color: '#64748b',
          marginRight: '0.15rem',
          minWidth: '56px'
        }));
        const jenisChips = [];
        schema.listJenisFilters.forEach((f) => {
          const active = (schema._jenisFilter || '') === (f.key || '');
          const chip = el('button').attr('type', 'button').text(f.label).css({
            padding: '0.35rem 0.7rem',
            borderRadius: '999px',
            border: active ? `1px solid ${T.primary}` : '1px solid #cbd5e1',
            background: active ? T.primary : '#fff',
            color: active ? '#fff' : '#475569',
            fontSize: '0.75rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          });
          jenisChips.push({ chip, key: f.key || '' });
          chip.click(() => {
            schema._jenisFilter = f.key || '';
            jenisChips.forEach(({ chip: c, key }) => {
              const isOn = key === schema._jenisFilter;
              c.css({
                border: isOn ? `1px solid ${T.primary}` : '1px solid #cbd5e1',
                background: isOn ? T.primary : '#fff',
                color: isOn ? '#fff' : '#475569'
              });
            });
            refreshTable();
          });
          jenisBar.child(chip);
        });
        jenisWrap.child(jenisBar);
        if (tableContentHost) {
          tableContentHost.child(jenisWrap);
        } else {
          tableSlot.child(jenisWrap);
        }
      }

      if (!schema.table || !Array.isArray(schema.table.columns)) {
        throw new Error('Konfigurasi CRUD tidak valid: schema.table.columns wajib ada');
      }

      // Prepare table columns with actions
      const tableSchema = {
        ...schema.table,
        columns: schema.table.columns.map(col => {
          const baseCol = isReportPage
            ? { ...col, nowrap: col.nowrap !== false }
            : col;

          if (baseCol.type === 'actions') {
            const actions = [];
            const usesPersonalList = (schema.resource === 'personal' || schema.listResource === 'personal' || schema.listResource === 'datatki') && !schema.readOnlyReport;
            const sessionRole = String(
              (typeof CrmRbac !== 'undefined' && CrmRbac.getRole ? CrmRbac.getRole() : '')
              || (typeof layout !== 'undefined' && layout.getRole ? layout.getRole() : '')
            ).trim().toLowerCase();
            const isMarketingRole = sessionRole === 'marketing';
            const isFotoRole = sessionRole === 'bagian_foto';
            const isKeuanganRole = sessionRole === 'keuangan';

            if (
              schema.resource === 'blk_izin_pulang'
              && canUpdate
              && typeof BlkIzinPulangActions !== 'undefined'
            ) {
              BlkIzinPulangActions.appendTableActions(actions, {
                schema,
                apiClient,
                tableInstance,
                refreshTable,
                canUpdate
              });
            }

            if (
              schema.resource === 'blk_izin'
              && canUpdate
              && typeof BlkIzinActions !== 'undefined'
            ) {
              BlkIzinActions.appendTableActions(actions, {
                schema,
                apiClient,
                tableInstance,
                refreshTable,
                canUpdate
              });
            }

            // Lazy load BlkUjkActions & PrintSuratClient saat dibutuhkan
            const isBlkUjkResource = ['blk_formulir', 'blk_detail_formulir', 'blk_pengajuan_ujk', 'blk_bayar_ujk', 'blk_sertifikat'].includes(schema.resource);
            if (isBlkUjkResource && (canUpdate || schema.resource === 'blk_sertifikat')) {
              if (typeof CoreScriptLoader !== 'undefined') {
                const scriptsToLoad = [];
                scriptsToLoad.push('./core/blk-ujk-actions.js?v=20260605c');
                if (typeof PrintSuratClient === 'undefined' && schema.resource === 'blk_sertifikat') scriptsToLoad.push('./core/print-surat-client.js?v=20260604a');
                
                if (scriptsToLoad.length > 0) {
                  CoreScriptLoader.loadMany(scriptsToLoad).catch(err => console.warn('Gagal load BLK scripts:', err));
                }
              }
              
              if (typeof BlkUjkActions !== 'undefined') {
                BlkUjkActions.appendTableActions(actions, {
                  schema,
                  apiClient,
                  tableInstance,
                  refreshTable,
                  canUpdate
                });
              }
            }
            
            const isBlkIzin = schema.resource === 'blk_izin_pulang' || schema.resource === 'blk_izin';
            const isBlkUjk = ['blk_formulir', 'blk_detail_formulir', 'blk_pengajuan_ujk', 'blk_bayar_ujk'].includes(schema.resource);
            const isBlkInventaris = schema.resource === 'blk_inventaris_barang';
            
            if (baseCol.actions) {
              baseCol.actions.forEach(action => {
                if (isBlkInventaris && canCreate) {
                  extraActions.push({
                    key: 'auto-code',
                    label: 'Generate Kode',
                    icon: 'fas fa-barcode',
                    hint: 'Auto-generate kode barang',
                    handler: () => {
                      const prefix = 'INV-BLK-';
                      const timestamp = Date.now().toString(36).toUpperCase();
                      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
                      const kode = `${prefix}${timestamp}-${random}`;
                      formFields.kode_barang?.input?.set ? formFields.kode_barang.input.set(kode) : null;
                    }
                  });
                }
                                
                if (action === 'edit' && canUpdate) {
                  actions.push({
                    icon: 'fas fa-edit',
                    label: isBlkIzin ? 'Edit data izin' : (isBlkUjk ? 'Edit data UJK' : 'Edit'),
                    group: (isBlkIzin || isBlkUjk) ? 'crud' : undefined,
                    onClick: (row) => this.openEditModal(schema, apiClient, tableInstance, row, refreshTable)
                  });
                } else if (action === 'delete' && canDelete) {
                  actions.push({
                    icon: 'fas fa-trash',
                    label: isBlkIzin ? 'Hapus izin' : 'Delete',
                    variant: 'danger',
                    group: isBlkIzin ? 'crud' : undefined,
                    confirm: true,
                    onClick: (row) => this.deleteRow(schema, apiClient, tableInstance, row, refreshTable)
                  });
                } else if (action === 'convert' && schema.resource === 'leads') {
                  actions.push({
                    icon: 'fas fa-random',
                    label: 'Convert',
                    onClick: (row) => this.convertLeadRow(apiClient, row, refreshTable)
                  });
                } else if (action === 'timeline') {
                  const timelineTypes = ['customers', 'leads', 'deals', 'companies'];
                  if (timelineTypes.includes(schema.resource) && typeof TimelinePanel !== 'undefined') {
                    actions.push({
                      icon: 'fas fa-history',
                      label: 'Timeline',
                      onClick: (row) => TimelinePanel.open(apiClient, schema.resource, row)
                    });
                  }
                } else if (action === 'detail' && usesPersonalList && !isKeuanganRole) {
                  actions.push({
                    icon: isMarketingRole ? 'fas fa-bullhorn' : 'fas fa-eye',
                    label: isMarketingRole ? 'Penempatan' : 'Detail',
                    onClick: (row) => {
                      const bid = resolveBiodataNavId(row);
                      if (bid && typeof layout !== 'undefined') {
                        const detailTab = schema.detailBiodataTab
                          || (schema.defaultListAction === 'set_majikan' ? 'majikan' : '')
                          || (schema.defaultListAction === 'set_detail_pekerjaan' ? 'majikan' : '');
                        let path = '/biodata/' + encodeURIComponent(bid);
                        if (detailTab) {
                          path += '?tab=' + encodeURIComponent(detailTab);
                        }
                        layout.navigate(path);
                      }
                    }
                  });
                } else if (action === 'admin' && schema.resource === 'personal' && !isMarketingRole && !isFotoRole && !isKeuanganRole) {
                  actions.push({
                    icon: 'fas fa-landmark',
                    label: 'Admin',
                    onClick: (row) => {
                      const bid = resolveBiodataNavId(row);
                      if (bid && typeof layout !== 'undefined') {
                        layout.navigate('/biodata/' + encodeURIComponent(bid) + '/admin');
                      }
                    }
                  });
                } else if (action === 'keuangan' && schema.resource === 'personal') {
                  actions.push({
                    icon: 'fas fa-coins',
                    label: 'Keuangan',
                    onClick: (row) => {
                      const keuLevel = String(row.keuangan_level || '').toUpperCase();
                      const idTki = String(row.id_tki || '').trim();
                      if (!idTki) {
                        if (typeof layout !== 'undefined') layout.toast('ID TKI tidak ditemukan pada baris ini.', { type: 'error' });
                        return;
                      }
                      if (typeof TkiKeuanganDetail !== 'undefined' && TkiKeuanganDetail.navigateTo) {
                        TkiKeuanganDetail.navigateTo(row);
                        return;
                      }
                      if (typeof layout !== 'undefined') {
                        layout.navigate('/personal/keuangan/' + encodeURIComponent(idTki));
                      }
                    }
                  });
                } else if (action === 'upload' && schema.resource === 'personal' && !isMarketingRole && !isKeuanganRole) {
                  actions.push({
                    icon: 'fas fa-cloud-arrow-up',
                    label: 'Dokumen',
                    onClick: (row) => {
                      const bid = resolveBiodataNavId(row);
                      if (bid && typeof layout !== 'undefined') {
                        layout.navigate('/biodata/' + encodeURIComponent(bid) + '/upload');
                      }
                    }
                  });
                } else if (action === 'set_keadaan' && schema.defaultListAction === 'set_keadaan') {
                  actions.push({
                    icon: 'fas fa-user-injured',
                    label: 'Set Keadaan',
                    variant: 'warning',
                    onClick: (row) => this.openSetKeadaanModal(schema, apiClient, tableInstance, row, refreshTable)
                  });
                } else if (action === 'set_pindah_sektor' && schema.defaultListAction === 'set_pindah_sektor') {
                  actions.push({
                    icon: 'fas fa-shuffle',
                    label: 'Pindah Sektor',
                    variant: 'primary',
                    onClick: (row) => this.openPindahSektorModal(schema, apiClient, tableInstance, row, refreshTable)
                  });
                } else if (action === 'set_pap' && schema.defaultListAction === 'set_pap') {
                  actions.push({
                    icon: 'fas fa-file-signature',
                    label: 'Set PAP',
                    variant: 'primary',
                    onClick: (row) => this.openSetPapModal(schema, apiClient, tableInstance, row, refreshTable)
                  });
                } else if (action === 'set_majikan' && schema.defaultListAction === 'set_majikan') {
                  actions.push({
                    icon: 'fas fa-briefcase',
                    label: 'Set Majikan',
                    variant: 'primary',
                    onClick: (row) => this.openSetMajikanModal(schema, apiClient, tableInstance, row, refreshTable)
                  });
                } else if (action === 'set_detail_pekerjaan' && schema.defaultListAction === 'set_detail_pekerjaan' && canUpdate) {
                  actions.push({
                    icon: 'fas fa-clipboard-list',
                    label: 'Set Detail',
                    variant: 'primary',
                    onClick: (row) => this.openSetDetailPekerjaanModal(schema, apiClient, tableInstance, row, refreshTable)
                  });
                } else if (action === 'create_spbg_request' && schema.resource === 'spbg_keuangan_request') {
                  actions.push(buildSpbgRequestCreateAction());
                } else if (action === 'history' && usesPersonalList && !isMarketingRole) {
                  actions.push({
                    icon: 'fas fa-history',
                    label: 'History',
                    onClick: (row) => {
                      const bid = resolveBiodataNavId(row);
                      const adminTab = schema.adminHistoryTab || 'keadaan_tki';
                      if (bid && typeof layout !== 'undefined') {
                        layout.navigate('/biodata/' + encodeURIComponent(bid) + '/admin?tab=' + adminTab);
                      }
                    }
                  });
                } else if (action === 'detail' && schema.resource === 'dokumen') {
                  actions.push({
                    icon: 'fas fa-eye',
                    label: 'Detail',
                    onClick: (row) => {
                      const bid = resolveBiodataNavId(row);
                      if (bid && typeof layout !== 'undefined') {
                        layout.navigate('/biodata/' + encodeURIComponent(bid) + '?tab=dokumen');
                      }
                    }
                  });
                } else if (action === 'printPdf' && schema.enableRecordPdf && typeof PrintSuratClient !== 'undefined') {
                  const pk = schema.printPkField || 'id';
                  actions.push({
                    icon: 'fas fa-file-pdf',
                    label: 'PDF',
                    variant: 'danger',
                    onClick: async (row) => {
                      const rid = row[pk] ?? row.id_pembuatan ?? row.id;
                      if (!rid) {
                        if (typeof layout !== 'undefined') layout.toast('ID record tidak ditemukan', { type: 'error' });
                        return;
                      }
                      try {
                        await PrintSuratClient.downloadRecordPdf(schema.resource, rid);
                        if (typeof layout !== 'undefined') layout.toast('PDF diunduh.', { type: 'success' });
                      } catch (e) {
                        if (typeof layout !== 'undefined') layout.toast(e.message || 'Gagal cetak PDF', { type: 'error' });
                      }
                    }
                  });
                } else if (action === 'exportPinjaman' && schema.enableSuratPengajuanExcel && typeof PrintSuratClient !== 'undefined') {
                  const pk = schema.printPkField || 'id';
                  actions.push({
                    icon: 'fas fa-file-excel',
                    label: 'Excel',
                    variant: 'success',
                    onClick: async (row) => {
                      const rid = row[pk] ?? row.id_surat_aju ?? row.id;
                      if (!rid) {
                        if (typeof layout !== 'undefined') layout.toast('ID record tidak ditemukan', { type: 'error' });
                        return;
                      }
                      try {
                        await PrintSuratClient.downloadSuratPengajuanExcel(rid);
                        if (typeof layout !== 'undefined') layout.toast('Excel diunduh.', { type: 'success' });
                      } catch (e) {
                        if (typeof layout !== 'undefined') layout.toast(e.message || 'Gagal export', { type: 'error' });
                      }
                    }
                  });
                } else if (action === 'print' && schema.enableRecordPrint && typeof PrintSuratClient !== 'undefined') {
                  const pk = schema.printPkField || 'id';
                  actions.push({
                    icon: 'fas fa-file-pdf',
                    label: 'Print PDF',
                    variant: 'warning',
                    onClick: async (row) => {
                      const rid = row[pk] ?? row.id_pembuatan ?? row.id_pembuatanpap ?? row.id;
                      if (!rid) {
                        if (typeof layout !== 'undefined') layout.toast('ID record tidak ditemukan', { type: 'error' });
                        return;
                      }
                      try {
                        await PrintSuratClient.downloadRecordPdf(schema.resource, rid);
                        if (typeof layout !== 'undefined') layout.toast('PDF diunduh.', { type: 'success' });
                      } catch (e) {
                        if (typeof layout !== 'undefined') layout.toast(e.message || 'Gagal cetak PDF', { type: 'error' });
                      }
                    }
                  });
                } else if (action === 'view_jurnal' && schema.resource === 'jurnal_keuangan') {
                  actions.push({
                    icon: 'fas fa-eye',
                    label: 'Detail',
                    onClick: async (row) => {
                      const id = row.id_jurnal ?? row.id;
                      if (!id) return;
                      try {
                        const res = await apiClient.get(`jurnal-keuangan/${id}/details`);
                        if (!res.success || !res.data) throw new Error(res.error || 'Gagal memuat');
                        const j = res.data;
                        const lines = (j.details || []).map((d) =>
                          `${d.kode_akun} ${d.nama_akun || ''}: D ${Number(d.debet || 0).toLocaleString('id-ID')} / K ${Number(d.kredit || 0).toLocaleString('id-ID')}`
                        ).join('\n');
                        if (typeof layout !== 'undefined' && layout.modal) {
                          layout.modal({
                            title: j.no_jurnal || 'Detail Jurnal',
                            content: el('div').css({ fontSize: '0.875rem', lineHeight: 1.6 }).child([
                              el('p').text(`Tanggal: ${j.tanggal || '—'} · ${j.sumber_label || j.sumber || ''}`),
                              el('p').text(j.keterangan || '—').css({ color: '#64748b' }),
                              el('pre').text(lines).css({ whiteSpace: 'pre-wrap', background: '#f8fafc', padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.8125rem' })
                            ]).el,
                            dismissible: true,
                            size: 'medium'
                          });
                        }
                      } catch (e) {
                        if (typeof layout !== 'undefined') layout.toast(e.message || 'Gagal', { type: 'error' });
                      }
                    }
                  });
                } else if (action === 'create_rekening' && schema.resource === 'buka_rekening_baru') {
                  actions.push(buildBukaRekeningCreateAction());
                } else if (action === 'mark_paid' && schema.resource === 'pembayaran_fee_agen' && canUpdate) {
                  actions.push({
                    icon: 'fas fa-check',
                    label: 'Tandai Dibayar',
                    variant: 'success',
                    onClick: async (row) => {
                      const pk = row.id_fee ?? row.id;
                      if (!pk) {
                        if (typeof layout !== 'undefined') layout.toast('ID tidak ditemukan', { type: 'error' });
                        return;
                      }
                      try {
                        await apiClient.update(`pembayaran_fee_agen/${pk}`, {
                          status: 'dibayar',
                          tanggal_bayar: new Date().toISOString().slice(0, 10)
                        });
                        if (typeof layout !== 'undefined') layout.toast('Fee ditandai dibayar', { type: 'success' });
                        refreshTable();
                      } catch (e) {
                        if (typeof layout !== 'undefined') layout.toast(e.message || 'Gagal update', { type: 'error' });
                      }
                    }
                  });
                } else if (typeof action === 'object') {
                  if (typeof action.onClick === 'string') {
                    const handlerKey = action.onClick;
                    const resolvedAction = Object.assign({}, action, {
                      onClick: (row) => {
                        const handlers = window.__inventarisActionHandlers || {};
                        if (typeof handlers[handlerKey] === 'function') {
                          handlers[handlerKey](row, refreshTable);
                        }
                      }
                    });
                    actions.push(resolvedAction);
                  } else {
                    actions.push(action);
                  }
                }
              });
            }

            if (schema.resource === 'pembayaran_tki' && schema.listResource === 'datatki') {
              actions.push({
                icon: 'fas fa-money-bill-wave',
                label: 'Alur Awal',
                onClick: (row) => {
                  if (typeof PembayaranTKIPage !== 'undefined' && PembayaranTKIPage.navigateToPayment) {
                    PembayaranTKIPage.navigateToPayment(row);
                  }
                }
              });
            }

            if (schema.resource === 'potongan_bulanan' && schema.listResource === 'datatki') {
              actions.push({
                icon: 'fas fa-calendar-check',
                label: 'Riwayat',
                onClick: (row) => {
                  if (typeof PotonganBulananPage !== 'undefined' && PotonganBulananPage.navigateToPotongan) {
                    PotonganBulananPage.navigateToPotongan(row);
                  }
                }
              });
            }

            if (schema.resource === 'piutang_monitor') {
              actions.push({
                icon: 'fas fa-scissors',
                label: 'Catat potongan',
                onClick: (row) => {
                  if (typeof PotonganBulananPage !== 'undefined' && PotonganBulananPage.navigateToPotongan) {
                    PotonganBulananPage.navigateToPotongan(row);
                  }
                }
              });
            }

            if (
              usesPersonalList
              && isKeuanganRole
              && schema.resource === 'personal'
            ) {
              actions.push({
                icon: 'fas fa-money-bill-wave',
                label: 'Bayar',
                variant: 'primary',
                onClick: (row) => {
                  const idTki = row.id_tki;
                  if (!idTki) {
                    if (typeof layout !== 'undefined') layout.toast('ID TKI tidak ditemukan', { type: 'error' });
                    return;
                  }
                  try {
                    sessionStorage.setItem('pembayaran_create_prefill', JSON.stringify({
                      id_tki: idTki,
                      tanggal_bayar: new Date().toISOString().slice(0, 10),
                      status: 'lunas'
                    }));
                  } catch {
                    /* ignore */
                  }
                  if (typeof layout !== 'undefined') layout.navigate('/pembayaran');
                }
              });
            }

            return {
              ...baseCol,
              actions: actions
            };
          }

          if (baseCol.type === 'docSlot') {
            const docField = baseCol.docField || baseCol.key;
            return {
              ...baseCol,
              type: 'docSlot',
              docField,
              onUpload: (row) => {
                const bid = row.id_biodata;
                if (!bid) return;
                if (schema.useUploadHub && typeof DocumentUploadHub !== 'undefined') {
                  DocumentUploadHub.openUploadForDocField({
                    idBiodata: bid,
                    docField,
                    label: baseCol.label,
                    onRefresh: refreshTable
                  });
                  return;
                }
                if (typeof DokumenIdentitasPanel !== 'undefined') {
                  DokumenIdentitasPanel.openFieldUpload({
                    idBiodata: bid,
                    field: docField,
                    record: row,
                    onRefresh: refreshTable
                  });
                  return;
                }
                if (typeof layout !== 'undefined') {
                  layout.toast('Modul upload belum dimuat.', { type: 'error' });
                }
              }
            };
          }

          if (
            baseCol.key === 'status'
            && schema.resource === 'blk_izin_pulang'
            && canUpdate
            && typeof BlkIzinPulangActions !== 'undefined'
          ) {
            return {
              ...baseCol,
              badgeClickTitle: 'Klik untuk ubah status izin',
              badgeClick: (row, anchorEl) => {
                BlkIzinPulangActions.openStatusMenu({
                  schema,
                  apiClient,
                  refreshTable,
                  canUpdate
                }, row, anchorEl);
              }
            };
          }

          if (
            baseCol.key === 'status'
            && schema.resource === 'blk_izin'
            && canUpdate
            && typeof BlkIzinActions !== 'undefined'
          ) {
            return {
              ...baseCol,
              badgeClickTitle: 'Klik untuk ubah status izin',
              badgeClick: (row, anchorEl) => {
                BlkIzinActions.openStatusMenu({
                  schema,
                  apiClient,
                  refreshTable,
                  canUpdate
                }, row, anchorEl);
              }
            };
          }

          if (
            canUpdate
            && typeof BlkUjkActions !== 'undefined'
            && (
              (baseCol.key === 'status' && ['blk_formulir', 'blk_pengajuan_ujk', 'blk_bayar_ujk'].includes(schema.resource))
              || (baseCol.key === 'statujk' && schema.resource === 'blk_detail_formulir')
            )
          ) {
            return {
              ...baseCol,
              badgeClickTitle: 'Klik untuk aksi UJK',
              badgeClick: (row, anchorEl) => {
                BlkUjkActions.openResourceStatusMenu({
                  schema,
                  apiClient,
                  refreshTable,
                  canUpdate
                }, row, anchorEl);
              }
            };
          }

          return baseCol;
        })
      };

      // Build table (search disabled - handled by CRUD header)
      const tableSchemaNoSearch = { 
        ...tableSchema, 
        features: { 
          ...tableSchema.features, 
          search: false, 
          perPage: lastPerPage,
          // Default sortable to true if not explicitly disabled
          sortable: tableSchema.features?.sortable !== false
        } 
      };
      tableInstance = TableBuilder.build(tableSchemaNoSearch, {
        data: [],
        onSearch: (query) => {
          lastSearch = query;
          lastPage = 1;
          this.loadData(schema, apiClient, tableInstance, query, lastSortColumn, lastSortDirection, 1, lastPerPage);
        },
        onSort: (column, direction, multiColumns) => {
          lastSortColumn = column;
          lastSortDirection = direction;
          // Use multi-column sort if available, otherwise fallback to single
          this.loadData(schema, apiClient, tableInstance, lastSearch, column, direction, lastPage, lastPerPage, multiColumns);
        },
        onSortChange: (sortColumns) => {
          // Show/hide clear sort button based on active sorting
          const hasActiveSort = sortColumns && sortColumns.length > 0;
          const hasDefaultSort = schema.table?.defaultSort?.column;
          
          // Show button if there's sorting AND it's different from default
          if (hasActiveSort && sortColumns[0]?.column !== hasDefaultSort) {
            clearSortBtn.css({ display: 'flex' });
          } else if (hasActiveSort && sortColumns[0]?.direction !== (schema.table?.defaultSort?.direction || 'asc')) {
            clearSortBtn.css({ display: 'flex' });
          } else {
            clearSortBtn.css({ display: 'none' });
          }
        },
        onPageChange: (page) => {
          lastPage = page;
          this.loadData(schema, apiClient, tableInstance, lastSearch, lastSortColumn, lastSortDirection, page, lastPerPage);
        },
        onPerPageChange: (newPerPage, page) => {
          lastPerPage = newPerPage;
          lastPage = page;
          localStorage.setItem(`crud_perPage_${schema.resource}`, newPerPage);
          this.loadData(schema, apiClient, tableInstance, lastSearch, lastSortColumn, lastSortDirection, page, newPerPage);
        }
      });

      if (reportHeroApi) {
        tableInstance._reportHeroApi = reportHeroApi;
      }

      // Wire search input from header to table (debounce + Enter langsung)
      let searchTimeout = null;
      const syncClearSearchBtn = () => {
        const hasVal = String(searchInput.el?.value || '').length > 0;
        clearSearchBtn.css({ display: hasVal ? 'flex' : 'none' });
      };
      const runHeaderSearch = (query, immediate) => {
        clearTimeout(searchTimeout);
        const exec = () => {
          lastSearch = query;
          lastPage = 1;
          this.loadData(schema, apiClient, tableInstance, query, lastSortColumn, lastSortDirection, 1, lastPerPage);
        };
        if (immediate) exec();
        else searchTimeout = setTimeout(exec, 400);
      };
      searchInput.on('input', (e) => {
        syncClearSearchBtn();
        runHeaderSearch(e.target.value, false);
      });
      searchInput.on('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          runHeaderSearch(e.target.value, true);
        }
      });
      clearSearchBtn.click(() => {
        if (searchInput.el) searchInput.el.value = '';
        syncClearSearchBtn();
        runHeaderSearch('', true);
      });

      // Table goes directly in container (table-builder handles its own scroll)
      tableInstance.el.css({ width: '100%', minWidth: '0', boxSizing: 'border-box' });
      if (tableContentHost) {
        tableContentHost.child(tableInstance.el);
        tableSlot.child(tableContentHost);
      } else {
        tableSlot.child(tableInstance.el);
      }
      crudContainer.child(tableSlot);
      crudContainer.child(chartSlot);

      // Load initial data with default sort
      if (canRead && apiClient) {
        this.loadData(schema, apiClient, tableInstance, lastSearch, lastSortColumn, lastSortDirection, lastPage, lastPerPage);
      }

      if (schema.resource === 'pembayaran_tki' && canCreate) {
        try {
          const raw = sessionStorage.getItem('pembayaran_create_prefill');
          if (raw) {
            sessionStorage.removeItem('pembayaran_create_prefill');
            const prefill = JSON.parse(raw);
            setTimeout(() => {
              if (schema.listResource === 'datatki' && prefill.id_tki
                && typeof PembayaranTKIPage !== 'undefined'
                && PembayaranTKIPage.navigateToPayment) {
                PembayaranTKIPage.navigateToPayment(prefill.id_tki, prefill.jenis_biaya);
              } else {
                this.openCreateAsModal(schema, apiClient, tableInstance, refreshTable, prefill);
              }
            }, 150);
          }
        } catch {
          /* ignore */
        }
      }

      const crudApi = {
        el: crudContainer,
        get: () => crudContainer.get(),
        table: tableInstance,
        loadData: refreshTable,
        openCreateModal: () => this.openCreateModal(schema, apiClient, tableInstance, refreshTable),
        openCreateAsNewPage: (extraDefaults) =>
          this.openCreateAsNewPage(schema, apiClient, tableInstance, refreshTable, extraDefaults),
        openEditModal: (row) => this.openEditModal(schema, apiClient, tableInstance, row, refreshTable),
        openEditAsNewPage: (row) =>
          this.openEditAsNewPage(schema, apiClient, tableInstance, row, refreshTable),
        deleteRow: (row) => this.deleteRow(schema, apiClient, tableInstance, row, refreshTable),
        setPermissions: (perms) => {
          currentPermissions = perms;
        },
        refresh: refreshTable
      };

      const regPath = pagePath || schema.path;
      if (regPath && typeof window !== 'undefined' && window.pjtkiApp?.core?.registerCrudPageEntry) {
        window.pjtkiApp.core.registerCrudPageEntry(regPath, schema, crudApi);
      }

      return crudApi;
    },

    // Load data from API
    async loadData(schema, apiClient, tableInstance, search = null, sortColumn = null, sortDirection = null, page = 1, perPageOverride = null, multiColumns = null) {
      if (!apiClient || !tableInstance) return;

      tableInstance.setLoading(true);

      try {
        const resource = schema.listResource || schema.resource;
        let endpoint = resource;

        if (schema.reportKey) {
          const mod = schema.reportModule === 'blk'
            ? 'blk'
            : schema.reportModule === 'keuangan'
              ? 'keuangan'
              : 'tki';
          endpoint = `reports/${mod}/${schema.reportKey}`;
        }

        // Build query parameters
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        
        // Support multi-column sort
        if (multiColumns && multiColumns.length > 0) {
          // Format: sort=column1:asc,column2:desc
          const sortParams = multiColumns.map(s => `${s.column}:${s.direction}`).join(',');
          params.set('sort', sortParams);
        } else if (sortColumn) {
          // Legacy single sort
          params.set('sort', sortColumn);
          if (sortDirection) params.set('order', sortDirection);
        }
        
        params.set('page', page);
        params.set('perPage', perPageOverride || schema.table.features?.perPage || 10);
        if (typeof TkiReportUi !== 'undefined' && TkiReportUi.appendFilterParams) {
          TkiReportUi.appendFilterParams(params, schema);
        } else {
          if (schema._sektorPrefix) params.set('sektor_prefix', schema._sektorPrefix);
          if (schema._stageFilter) params.set('stage_filter', schema._stageFilter);
          if (schema._jenisFilter) params.set('jenis_izin', schema._jenisFilter);
          if (schema._statusFilter) params.set('status_filter', schema._statusFilter);
        }
        // Support quickFilter for BLK izin pulang report
        if (schema._quickFilter) {
          params.set('quick_filter', schema._quickFilter);
        }
        if (schema.enrichDokumen) {
          params.set('enrich_dokumen', '1');
        }
        if (schema.enrichDetailPekerjaan) {
          params.set('enrich_detail_pekerjaan', '1');
        }
        if (schema.listDatatkiEnrich) {
          const enrichVal = Array.isArray(schema.listDatatkiEnrich)
            ? schema.listDatatkiEnrich.join(',')
            : String(schema.listDatatkiEnrich);
          params.set('enrich_datatki', enrichVal);
        }

        const queryString = params.toString();
        if (queryString) {
          endpoint = `${endpoint}?${queryString}`;
        }

        const response = await apiClient.read(endpoint);
        
        // Handle different response formats
        let data = [];
        if (Array.isArray(response)) {
          data = response;
        } else if (response.data && Array.isArray(response.data)) {
          data = response.data;
        } else if (response.items && Array.isArray(response.items)) {
          data = response.items;
        }

        // Pass server pagination info if available
        const serverPagination = response.pagination || null;
        tableInstance.setData(data, serverPagination);
        if (tableInstance._reportHeroApi && typeof tableInstance._reportHeroApi.updateStats === 'function') {
          if (typeof TkiReportUi !== 'undefined' && TkiReportUi.syncReportFilterLabels) {
            TkiReportUi.syncReportFilterLabels(schema);
          }
          tableInstance._reportHeroApi.updateStats(
            serverPagination,
            schema._sektorLabel || 'Semua',
            schema._filterSummaryText || schema._stageFilterLabel || 'Semua Tahap'
          );
        }
      } catch (error) {
        console.error('Error loading data:', error);
        tableInstance.setData([]);
      } finally {
        tableInstance.setLoading(false);
      }
    },

    // Open create modal or new page
    openCreateModal(schema, apiClient, tableInstance, refreshTable) {
      if (!apiClient) {
        console.error('ApiClient not provided');
        return;
      }

      if (schema.createPath && typeof layout !== 'undefined' && layout.navigate) {
        layout.navigate(schema.createPath);
        return;
      }

      const formDisplay = schema.formDisplay || 'modal'; // 'modal' or 'newpage'

      if (formDisplay === 'newpage') {
        this.openCreateAsNewPage(schema, apiClient, tableInstance, refreshTable);
      } else {
        this.openCreateAsModal(schema, apiClient, tableInstance, refreshTable);
      }
    },

    // Open create form as modal
    async openCreateAsModal(schema, apiClient, tableInstance, refreshTable, extraDefaults = {}) {
      const createDefaults = { ...(extraDefaults || {}) };
      if (schema._jenisFilter) createDefaults.jenis_izin = schema._jenisFilter;
      const formSchema = await this.prepareFormSchemaForCrud(schema, apiClient, createDefaults, { hideButtons: true });

      const formBuildOpts = {
        apiClient,
        initialData: createDefaults,
        onSubmit: async (formData) => {
          try {
            await apiClient.create(schema.resource, formData);
            
            if (typeof layout !== 'undefined' && layout.toast) {
              layout.toast('Data created successfully', { type: 'success' });
            }
            
            layout.closeModal();
            this.refreshAppNotificationsIfNeeded(schema);
            refreshTable();
          } catch (error) {
            console.error('Error creating data:', error);
            if (typeof layout !== 'undefined' && layout.toast) {
              layout.toast('Error creating data', { type: 'error' });
            }
          }
        }
      };
      const blkAutofill = ['blk_izin', 'blk_izin_pulang', 'blk_detail_formulir', 'blk_sertifikat'].includes(schema.resource)
        ? this.wireBlkPersonalAutofill(formBuildOpts, apiClient, schema)
        : null;
      const pembayaranAutofill = schema.resource === 'pembayaran_tki'
        ? this.wirePembayaranNominalAutofill(formBuildOpts, apiClient, schema)
        : null;
      const form = FormBuilder.build(formSchema, formBuildOpts);
      if (blkAutofill) blkAutofill.form = form;
      if (pembayaranAutofill) pembayaranAutofill.form = form;

      if (typeof layout !== 'undefined' && layout.modal) {
        layout.modal({
          title: `Create ${schema.title || 'New Item'}`,
          content: form.el,
          footer: this.createModalFooter(schema, apiClient, tableInstance, null, 'create'),
          dismissible: true,
          size: schema.modalSize || 'medium' // 'small', 'medium', 'large', 'full'
        });
      }
    },

    // Open create form as new page
    openCreateAsNewPage(schema, apiClient, tableInstance, refreshTable, extraDefaults = {}) {
      if (typeof window !== 'undefined' && window.__crudOpenCreateBusy) return;
      if (typeof window !== 'undefined') window.__crudOpenCreateBusy = true;

      stashCrudCreatePrefill(schema.resource, extraDefaults);

      const basePath = schema.path || `/${schema.resource}`;
      const formPagePath = `${basePath}/create`;
      const listPath = basePath;

      const releaseCreateLock = () => {
        if (typeof window !== 'undefined') {
          setTimeout(() => { window.__crudOpenCreateBusy = false; }, 300);
        }
      };

      if (typeof layout !== 'undefined') {
        layout.addPage({
          path: formPagePath,
          component: async () => {
            let defaults = {
              ...(takeCrudCreatePrefill(schema.resource) || {}),
              ...(extraDefaults || {})
            };
            if (
              schema.resource === 'buka_rekening_baru'
              && defaults.id_tki
              && !defaults.nama_tki
              && apiClient
            ) {
              try {
                const res = await apiClient.read(
                  `datatki?id_tki=${encodeURIComponent(defaults.id_tki)}&perPage=1&page=1`
                );
                const row = (res?.data || [])[0];
                if (row) defaults = buildBukaRekeningPrefillFromRow(row);
              } catch {
                /* ignore */
              }
            }
            if (
              schema.resource === 'spbg_keuangan_request'
              && defaults.id_tki
              && !defaults.id_biodata
              && apiClient
            ) {
              try {
                const res = await apiClient.read(
                  `datatki?id_tki=${encodeURIComponent(defaults.id_tki)}&perPage=1&page=1`
                );
                const row = (res?.data || [])[0];
                if (row) defaults = buildSpbgRequestPrefillFromRow(row);
              } catch {
                /* ignore */
              }
            }
            const preparedForm = await CrudEngine.prepareFormSchemaForCrud(schema, apiClient, defaults);
            const formBuildOpts = {
              apiClient,
              initialData: defaults,
              onSubmit: async (formData) => {
                try {
                  await apiClient.create(schema.resource, formData);
                  if (typeof layout !== 'undefined' && layout.toast) {
                    layout.toast('Data created successfully', { type: 'success' });
                  }
                  layout.navigate(listPath);
                  refreshTable();
                } catch (error) {
                  console.error('Error creating data:', error);
                  if (typeof layout !== 'undefined' && layout.toast) {
                    layout.toast('Error creating data', { type: 'error' });
                  }
                }
              },
              onCancel: () => layout.navigate(listPath)
            };
            const pembayaranAutofill = schema.resource === 'pembayaran_tki'
              ? CrudEngine.wirePembayaranNominalAutofill(formBuildOpts, apiClient, schema)
              : null;
            const form = FormBuilder.build(preparedForm, formBuildOpts);
            if (pembayaranAutofill) pembayaranAutofill.form = form;

            const pageContainer = el('div').css({
              width: '100%',
              padding: '2rem',
              boxSizing: 'border-box'
            });

            pageContainer.child(
              el('h1').css({ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' })
                .text(`Create ${schema.title || 'New Item'}`)
            );

            const card = el('div').css({
              backgroundColor: '#fff',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              width: '100%',
              boxSizing: 'border-box'
            });
            card.child(form.el.css({ width: '100%' }));
            pageContainer.child(card);

            return pageContainer.get();
          },
          hideLayout: false
        });

        layout.navigate(formPagePath);
        if (typeof layout.resetPageScroll === 'function') {
          layout.resetPageScroll();
        }
        releaseCreateLock();
      } else {
        releaseCreateLock();
      }
    },

    // Open edit modal or new page
    async openEditModal(schema, apiClient, tableInstance, row, refreshTable) {
      if (!apiClient) {
        console.error('ApiClient not provided');
        return;
      }

      const formDisplay = schema.formDisplay || 'modal';

      if (formDisplay === 'newpage') {
        await this.openEditAsNewPage(schema, apiClient, tableInstance, row, refreshTable);
      } else {
        await this.openEditAsModal(schema, apiClient, tableInstance, row, refreshTable);
      }
    },

    // Open edit form as modal
    async openEditAsModal(schema, apiClient, tableInstance, row, refreshTable) {
      // Fetch fresh data from API before opening edit form
      const id = resolveRecordId(schema, row);
      let freshData = row; // Fallback to row data if fetch fails
      
      // Show loading spinner overlay
      let loadingOverlayEl = null;
      if (typeof layout !== 'undefined') {
        // Create loading overlay
        const loadingOverlay = el('div').css({
          position: 'fixed',
          inset: '0',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: '9999',
          backdropFilter: 'blur(2px)'
        });
        
        // Spinner
        const spinner = el('div').css({
          width: '56px',
          height: '56px',
          border: '5px solid rgba(255, 255, 255, 0.3)',
          borderTop: `5px solid ${T.accent}`,
          borderRadius: '50%',
          animation: 'crud-spin 0.8s linear infinite'
        });
        
        loadingOverlay.child(spinner);
        
        // Add animation if not exists
        if (!document.getElementById('crud-spin-style')) {
          const style = document.createElement('style');
          style.id = 'crud-spin-style';
          style.textContent = '@keyframes crud-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
          document.head.appendChild(style);
        }
        
        // Store DOM element reference
        loadingOverlayEl = loadingOverlay.get();
        document.body.appendChild(loadingOverlayEl);
      }
      
      try {
        const response = await apiClient.read(`${schema.resource}/${id}`);
        if (response && response.data) {
          freshData = response.data;
        } else if (response && !response.data) {
          // Handle direct response (not wrapped in data property)
          freshData = response;
        }
      } catch (error) {
        console.warn('Failed to fetch fresh data, using cached row data:', error);
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('Using cached data (fetch failed)', { type: 'warning', duration: 2000 });
        }
        // Continue with cached data from table
      }

      // Hide loading spinner
      if (loadingOverlayEl && loadingOverlayEl.parentNode) {
        loadingOverlayEl.remove();
        loadingOverlayEl = null;
      }

      try {
        const formSchema = await this.prepareFormSchemaForCrud(schema, apiClient, freshData, { hideButtons: true });

        const formBuildOpts = {
          apiClient,
          initialData: freshData,
          onSubmit: async (formData) => {
            try {
              const updateId = resolveRecordId(schema, freshData);
              await apiClient.update(`${schema.resource}/${updateId}`, formData);
              
              if (typeof layout !== 'undefined' && layout.toast) {
                layout.toast('Data updated successfully', { type: 'success' });
              }
              
              layout.closeModal();
              this.refreshAppNotificationsIfNeeded(schema);
              refreshTable();
            } catch (error) {
              console.error('Error updating data:', error);
              if (typeof layout !== 'undefined' && layout.toast) {
                layout.toast('Error updating data', { type: 'error' });
              }
            }
          }
        };
        const blkAutofill = ['blk_izin', 'blk_izin_pulang'].includes(schema.resource)
          ? this.wireBlkPersonalAutofill(formBuildOpts, apiClient)
          : null;
        const pembayaranAutofill = schema.resource === 'pembayaran_tki'
          ? this.wirePembayaranNominalAutofill(formBuildOpts, apiClient, schema)
          : null;
        const form = FormBuilder.build(formSchema, formBuildOpts);
        if (blkAutofill) blkAutofill.form = form;
        if (pembayaranAutofill) pembayaranAutofill.form = form;

        if (typeof layout !== 'undefined' && layout.modal) {
          layout.modal({
            title: `Edit ${schema.title || 'Item'}`,
            content: form.el,
            footer: this.createModalFooter(schema, apiClient, tableInstance, freshData, 'edit'),
            dismissible: true,
            size: schema.modalSize || 'medium'
          });
        }
      } catch (error) {
        console.error('Error preparing form:', error);
        // Ensure overlay is removed even if form preparation fails
        if (loadingOverlayEl && loadingOverlayEl.parentNode) {
          loadingOverlayEl.remove();
          loadingOverlayEl = null;
        }
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('Failed to load form', { type: 'error' });
        }
      }
    },

    // Open modal untuk set keadaan TKI (MD/Kabur/Pulang)
    async openSetKeadaanModal(schema, apiClient, tableInstance, row, refreshTable) {
      if (!apiClient) {
        console.error('ApiClient not provided');
        return;
      }

      if (typeof layout === 'undefined' || !layout.modal) {
        console.error('Layout modal not available');
        return;
      }

      // Buat form schema untuk keadaan TKI
      const keadaanFormSchema = {
        resource: 'admin_keadaan_tki',
        title: 'Set Keadaan TKI',
        form: schema.form,
        modalSize: schema.modalSize || 'medium'
      };

      try {
        const initialData = {
          id_biodata: row.id_biodata || '',
          nama: row.nama || '',
          tanggal: new Date().toISOString().split('T')[0]
        };

        console.log('[openSetKeadaanModal] Initial data:', initialData);
        console.log('[openSetKeadaanModal] Row data:', row);

        const formSchema = await this.prepareFormSchemaForCrud(
          keadaanFormSchema,
          apiClient,
          initialData,
          { hideButtons: true }
        );

        console.log('[openSetKeadaanModal] Form schema prepared:', formSchema);

        const form = FormBuilder.build(formSchema, {
          apiClient,
          initialData: initialData,
          onSubmit: async (formData) => {
            try {
              await apiClient.create('admin_keadaan_tki', formData);

              if (typeof layout !== 'undefined' && layout.toast) {
                layout.toast('Keadaan TKI berhasil disimpan', { type: 'success' });
              }

              layout.closeModal();
              
              if (refreshTable) {
                refreshTable();
              }
            } catch (error) {
              console.error('Error saving keadaan:', error);
              if (typeof layout !== 'undefined' && layout.toast) {
                layout.toast('Error saving keadaan: ' + error.message, { type: 'error' });
              }
            }
          },
          onCancel: () => {
            if (typeof layout !== 'undefined' && layout.closeModal) {
              layout.closeModal();
            }
          }
        });

        if (typeof layout !== 'undefined' && layout.modal) {
          layout.modal({
            title: `Set Keadaan TKI - ${row.nama || row.id_biodata}`,
            content: form.el,
            footer: this.createModalFooter(schema, apiClient, tableInstance, null, 'create'),
            dismissible: true,
            size: keadaanFormSchema.modalSize || 'medium'
          });
        }
      } catch (error) {
        console.error('Error preparing keadaan form:', error);
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('Failed to load form', { type: 'error' });
        }
      }
    },

    async openPindahSektorModal(schema, apiClient, tableInstance, row, refreshTable) {
      if (!apiClient) return;
      if (typeof layout === 'undefined' || !layout.modal) return;

      const idTki = String(row.id_tki || '').trim();
      if (!idTki) {
        if (layout.toast) layout.toast('ID TKI tidak ditemukan pada baris ini.', { type: 'error' });
        return;
      }

      const formSchemaDef = {
        resource: 'personal',
        title: 'Pindah Sektor TKI',
        form: schema.form,
        modalSize: schema.modalSize || 'medium'
      };

      try {
        const sektorAktif = String(row.kode_sektor || '').trim().toUpperCase();
        const initialData = {
          id_tki: idTki,
          id_biodata: row.id_biodata || '',
          nama: row.nama || '',
          sektor_aktif: sektorAktif,
          kode_cabang: row.kode_cabang || '',
          kode_sektor: '',
          alasan: ''
        };

        const formSchema = await this.prepareFormSchemaForCrud(formSchemaDef, apiClient, initialData, { hideButtons: true });
        
        let formSubmitBtn = null;
        let formCancelBtn = null;
        
        const form = FormBuilder.build(formSchema, {
          apiClient,
          initialData,
          onSubmit: async (formData) => {
            try {
              const targetSektor = String(formData.kode_sektor || '').trim().toUpperCase();
              const alasan = String(formData.alasan || '').trim();
              if (!targetSektor) {
                if (layout.toast) layout.toast('Sektor tujuan wajib dipilih.', { type: 'error' });
                return;
              }
              if (!alasan) {
                if (layout.toast) layout.toast('Alasan pindah sektor wajib diisi.', { type: 'error' });
                return;
              }
              const payload = {
                kode_sektor: targetSektor,
                alasan
              };
              const cabang = String(formData.kode_cabang || '').trim();
              if (cabang) payload.kode_cabang = cabang;

              if (formSubmitBtn) formSubmitBtn.attr('disabled', true).text('Menyimpan...');

              const res = await apiClient.post(`personal/${encodeURIComponent(idTki)}/pindah-sektor`, payload);
              const newBio = res?.data?.new_id_biodata || res?.new_id_biodata || '';
              if (layout.toast) {
                layout.toast(
                  newBio ? `Pindah sektor berhasil. Biodata baru: ${newBio}` : 'Pindah sektor berhasil.',
                  { type: 'success' }
                );
              }
              layout.closeModal();
              if (refreshTable) refreshTable();
            } catch (error) {
              if (formSubmitBtn) formSubmitBtn.attr('disabled', false).text('Simpan');
              if (layout.toast) layout.toast('Gagal pindah sektor: ' + (error.message || error), { type: 'error' });
            }
          },
          onCancel: () => {
            if (layout.closeModal) layout.closeModal();
          }
        });

        // Create footer buttons
        const footerBtns = el('div').css({
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.5rem',
          paddingTop: '1rem',
          marginTop: 'auto',
          borderTop: '1px solid #e5e7eb'
        });

        formCancelBtn = el('button')
          .text('Batal')
          .css({
            padding: '0.6rem 1.2rem',
            borderRadius: '0.5rem',
            border: '1px solid #d1d5db',
            backgroundColor: '#fff',
            color: '#374151',
            fontSize: '0.875rem',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s'
          })
          .click(() => {
            if (layout.closeModal) layout.closeModal();
          })
          .on('mouseenter', function() {
            this.style.backgroundColor = '#f3f4f6';
          })
          .on('mouseleave', function() {
            this.style.backgroundColor = '#fff';
          });

        formSubmitBtn = el('button')
          .text('Simpan')
          .css({
            padding: '0.6rem 1.2rem',
            borderRadius: '0.5rem',
            border: 'none',
            backgroundColor: '#0891b2',
            color: '#fff',
            fontSize: '0.875rem',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s'
          })
          .click(() => {
            if (form && form.submit) form.submit();
          })
          .on('mouseenter', function() {
            this.style.backgroundColor = '#0e7490';
          })
          .on('mouseleave', function() {
            this.style.backgroundColor = '#0891b2';
          })
          .on('disabled', function() {
            this.style.opacity = '0.6';
            this.style.cursor = 'not-allowed';
          });

        footerBtns.child([formCancelBtn, formSubmitBtn]);

        // Wrap form content to allow scrolling inside modal body
        const contentWrapper = el('div').css({
          display: 'flex',
          flexDirection: 'column',
          flex: '1',
          minHeight: '0',
          overflow: 'hidden'
        });
        
        const scrollableBody = el('div').css({
          flex: '1',
          overflowY: 'auto',
          minHeight: '0',
          paddingRight: '0.5rem'
        });
        
        scrollableBody.child(form.el);
        contentWrapper.child(scrollableBody);

        layout.modal({
          title: `Pindah Sektor — ${row.nama || idTki}`,
          content: contentWrapper,
          footer: footerBtns,
          dismissible: true,
          size: formSchemaDef.modalSize || 'medium'
        });
      } catch (error) {
        if (layout.toast) layout.toast('Gagal memuat form pindah sektor.', { type: 'error' });
      }
    },

    // Open modal untuk set PAP UJK per TKI (upsert ke tabel pap)
    async openSetPapModal(schema, apiClient, tableInstance, row, refreshTable) {
      if (!apiClient) {
        console.error('ApiClient not provided');
        return;
      }

      if (typeof layout === 'undefined' || !layout.modal) {
        console.error('Layout modal not available');
        return;
      }

      const papResource = schema.resource || 'pap';
      const papFormSchema = {
        resource: papResource,
        title: 'Set PAP UJK',
        form: schema.form,
        modalSize: schema.modalSize || 'medium'
      };

      try {
        let existingPap = null;
        const bid = row.id_biodata;
        if (bid) {
          const listRes = await apiClient.read(`${papResource}?id_biodata=${encodeURIComponent(bid)}&perPage=1`);
          const rows = listRes?.data || listRes?.items || [];
          existingPap = Array.isArray(rows) ? rows[0] : null;
        }

        const initialData = {
          id_biodata: bid || '',
          nama: row.nama || '',
          nopap: existingPap?.nopap || '',
          statuspap: existingPap?.statuspap || '',
          tgl_terima: existingPap?.tgl_terima || '',
          tgl_berlaku: existingPap?.tgl_berlaku || '',
          keterangan: existingPap?.keterangan || ''
        };

        const formSchema = await this.prepareFormSchemaForCrud(
          papFormSchema,
          apiClient,
          initialData,
          { hideButtons: true }
        );

        const form = FormBuilder.build(formSchema, {
          apiClient,
          initialData,
          onSubmit: async (formData) => {
            try {
              const payload = { ...formData, id_biodata: bid };
              delete payload.nama;

              if (existingPap?.id != null) {
                await apiClient.update(`${papResource}/${existingPap.id}`, payload);
              } else {
                await apiClient.create(papResource, payload);
              }

              if (typeof layout !== 'undefined' && layout.toast) {
                layout.toast('Data PAP UJK berhasil disimpan', { type: 'success' });
              }

              layout.closeModal();

              if (refreshTable) {
                refreshTable();
              }
            } catch (error) {
              console.error('Error saving PAP:', error);
              if (typeof layout !== 'undefined' && layout.toast) {
                layout.toast('Error saving PAP: ' + (error.message || 'Gagal menyimpan'), { type: 'error' });
              }
            }
          },
          onCancel: () => {
            if (typeof layout !== 'undefined' && layout.closeModal) {
              layout.closeModal();
            }
          }
        });

        if (typeof layout !== 'undefined' && layout.modal) {
          layout.modal({
            title: `Set PAP UJK - ${row.nama || row.id_biodata}`,
            content: form.el,
            footer: this.createModalFooter(schema, apiClient, tableInstance, null, 'create'),
            dismissible: true,
            size: papFormSchema.modalSize || 'medium'
          });
        }
      } catch (error) {
        console.error('Error preparing PAP form:', error);
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('Failed to load form', { type: 'error' });
        }
      }
    },

    // Open modal penempatan majikan per TKI (upsert ke tabel majikan)
    async openSetMajikanModal(schema, apiClient, tableInstance, row, refreshTable) {
      if (!apiClient) {
        console.error('ApiClient not provided');
        return;
      }

      if (typeof layout === 'undefined' || !layout.modal) {
        console.error('Layout modal not available');
        return;
      }

      const majikanResource = schema.resource || 'majikan';
      const majikanFormSchema = {
        resource: majikanResource,
        title: 'Penempatan Majikan',
        form: schema.form,
        modalSize: schema.modalSize || 'large'
      };

      try {
        let existingMajikan = null;
        const bid = row.id_biodata;
        if (bid) {
          const listRes = await apiClient.read(`${majikanResource}?id_biodata=${encodeURIComponent(bid)}&perPage=1`);
          const rows = listRes?.data || listRes?.items || [];
          existingMajikan = Array.isArray(rows) ? rows[0] : null;
        }

        const initialData = {
          id_biodata: bid || '',
          nama: row.nama || '',
          kode_agen: existingMajikan?.kode_agen || '',
          kode_majikan: existingMajikan?.kode_majikan || '',
          kode_suhan: existingMajikan?.kode_suhan || '',
          namamajikan: existingMajikan?.namamajikan || '',
          namataiwan: existingMajikan?.namataiwan || '',
          notelpmajikan: existingMajikan?.notelpmajikan || '',
          tglterpilih: existingMajikan?.tglterpilih || '',
          tglterbitsuhan: existingMajikan?.tglterbitsuhan || '',
          tglterimasuhan: existingMajikan?.tglterimasuhan || '',
          tglterbang: existingMajikan?.tglterbang || '',
          ketsuhan: existingMajikan?.ketsuhan || '',
          kode_visapermit: existingMajikan?.kode_visapermit || ''
        };

        const formSchema = await this.prepareFormSchemaForCrud(
          majikanFormSchema,
          apiClient,
          initialData
        );

        const form = FormBuilder.build(formSchema, {
          apiClient,
          initialData,
          onSubmit: async (formData) => {
            try {
              const payload = { ...formData, id_biodata: bid };
              delete payload.nama;

              if (existingMajikan?.id != null) {
                await apiClient.update(`${majikanResource}/${existingMajikan.id}`, payload);
              } else {
                await apiClient.create(majikanResource, payload);
              }

              if (typeof layout !== 'undefined' && layout.toast) {
                layout.toast('Penempatan majikan berhasil disimpan', { type: 'success' });
              }

              layout.closeModal();

              if (refreshTable) {
                refreshTable();
              }
            } catch (error) {
              console.error('Error saving majikan:', error);
              if (typeof layout !== 'undefined' && layout.toast) {
                layout.toast('Error: ' + (error.message || 'Gagal menyimpan penempatan majikan'), { type: 'error' });
              }
            }
          },
          onCancel: () => {
            if (typeof layout !== 'undefined' && layout.closeModal) {
              layout.closeModal();
            }
          }
        });

        if (typeof layout !== 'undefined' && layout.modal) {
          layout.modal({
            title: `Penempatan Majikan — ${row.nama || row.id_biodata}`,
            content: form.el,
            dismissible: true,
            size: majikanFormSchema.modalSize || 'large'
          });
        }
      } catch (error) {
        console.error('Error preparing majikan form:', error);
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('Gagal memuat form penempatan majikan', { type: 'error' });
        }
      }
    },

    // Modal detail pekerjaan: jenis pekerjaan (majikan) + kriteria multi-select
    async openSetDetailPekerjaanModal(schema, apiClient, tableInstance, row, refreshTable) {
      if (!apiClient) {
        console.error('ApiClient not provided');
        return;
      }

      if (typeof layout === 'undefined' || !layout.modal) {
        console.error('Layout modal not available');
        return;
      }

      const bid = row.id_biodata;
      if (!bid) {
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('ID biodata tidak ditemukan', { type: 'error' });
        }
        return;
      }

      try {
        const [majikanRes, kriteriaMasterRes, existingRes, pekerjaanRes] = await Promise.all([
          apiClient.read(`majikan?id_biodata=${encodeURIComponent(bid)}&perPage=1`),
          apiClient.read('kriteria_pekerjaan?perPage=500&sort=kode&order=asc'),
          apiClient.read(`majikan_kriteria_pekerjaan?id_biodata=${encodeURIComponent(bid)}&perPage=500`),
          apiClient.read('datapekerjaan?perPage=500&sort=isi&order=asc')
        ]);

        const majikanRows = majikanRes?.data || majikanRes?.items || [];
        const existingMajikan = Array.isArray(majikanRows) ? majikanRows[0] : null;
        if (!existingMajikan) {
          if (typeof layout !== 'undefined' && layout.toast) {
            layout.toast('Set majikan terlebih dahulu sebelum detail pekerjaan', { type: 'warning' });
          }
          return;
        }

        const allKriteriaMaster = (kriteriaMasterRes?.data || kriteriaMasterRes?.items || [])
          .filter((item) => item && item.kode);
        const pekerjaanIdByIsi = Object.create(null);
        const pekerjaanRows = pekerjaanRes?.data || pekerjaanRes?.items || [];
        (Array.isArray(pekerjaanRows) ? pekerjaanRows : []).forEach((row) => {
          const isi = String(row.isi || '').trim();
          if (isi && row.id != null) pekerjaanIdByIsi[isi] = Number(row.id);
        });
        const existingRows = existingRes?.data || existingRes?.items || [];
        const selectedKodes = new Set(
          (Array.isArray(existingRows) ? existingRows : [])
            .map((item) => String(item.kode || '').trim())
            .filter(Boolean)
        );
        let currentPekerjaan = String(existingMajikan.pekerjaan || '').trim();

        const getSelectedPekerjaanId = () => {
          const isi = String(currentPekerjaan || '').trim();
          return pekerjaanIdByIsi[isi] ?? null;
        };

        const getFilteredKriteria = () => {
          const pid = getSelectedPekerjaanId();
          if (pid == null) return [];
          return allKriteriaMaster.filter((item) => Number(item.id_pekerjaan) === Number(pid));
        };

        const pruneInvalidSelections = () => {
          const valid = new Set(getFilteredKriteria().map((item) => String(item.kode || '').trim()));
          for (const kode of [...selectedKodes]) {
            if (!valid.has(kode)) selectedKodes.delete(kode);
          }
        };

        const mountModalChildren = (wrapper, nodes) => {
          wrapper.empty();
          const list = Array.isArray(nodes) ? nodes : [nodes];
          list.forEach((n) => { if (n != null) wrapper.child(n); });
          wrapper.get();
        };

        const wrap = el('div').css({ display: 'flex', flexDirection: 'column', gap: '1rem' });

        const info = el('div').css({
          padding: '0.75rem 1rem',
          borderRadius: '0.625rem',
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          color: '#1e3a8a',
          fontSize: '0.8125rem',
          lineHeight: '1.45'
        });
        info.child(el('div').text(`TKI: ${row.nama || bid} (${bid})`));
        info.child(el('div').text('Pilih jenis pekerjaan — detail kriteria menyesuaikan master Detail Pekerjaan per jenis.').css({
          marginTop: '0.35rem',
          color: '#334155'
        }));

        const pekerjaanFormSchema = await this.prepareFormSchemaForCrud(
          {
            resource: 'majikan',
            form: {
              columns: 1,
              hideButtons: true,
              fields: [{
                name: 'pekerjaan',
                label: 'Pekerjaan',
                type: 'select',
                placeholder: '— Pilih jenis pekerjaan —',
                searchPlaceholder: 'Cari jenis pekerjaan…',
                optionsFrom: {
                  resource: 'datapekerjaan',
                  value: 'isi',
                  label: ['isi', 'mandarin'],
                  labelFormat: '{{isi}} — {{mandarin}}',
                  sort: 'isi',
                  order: 'asc'
                }
              }]
            }
          },
          apiClient,
          { pekerjaan: currentPekerjaan }
        );

        const detailSection = el('div');
        detailSection.child(el('label').text('Detail Pekerjaan (multi-select)').css({
          display: 'block',
          fontSize: '0.8125rem',
          fontWeight: '700',
          color: '#334155',
          marginBottom: '0.35rem'
        }));
        detailSection.child(el('div').text('Detail tampil setelah jenis pekerjaan dipilih.').css({
          fontSize: '0.75rem',
          color: '#64748b',
          marginBottom: '0.65rem'
        }));

        const chipGrid = el('div').css({
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.45rem'
        });
        detailSection.child(chipGrid);

        const refreshChips = () => {
          chipGrid.empty();
          const kriteriaMaster = getFilteredKriteria();
          if (!getSelectedPekerjaanId()) {
            chipGrid.child(el('div').text('Pilih jenis pekerjaan terlebih dahulu.').css({
              color: '#64748b',
              fontSize: '0.8125rem'
            }));
            chipGrid.get();
            return;
          }
          if (!kriteriaMaster.length) {
            chipGrid.child(el('div').text('Belum ada detail pekerjaan untuk jenis ini. Tambahkan di Master Data → Detail Pekerjaan.').css({
              color: '#64748b',
              fontSize: '0.8125rem'
            }));
            chipGrid.get();
            return;
          }
          kriteriaMaster.forEach((item) => {
            const kode = String(item.kode || '').trim();
            if (!kode) return;
            const nama = String(item.nama || '').trim();
            const mandarin = String(item.mandarin || '').trim();
            const label = mandarin ? `${nama || kode} (${mandarin})` : (nama || kode);
            const active = selectedKodes.has(kode);
            const chip = el('button').attr('type', 'button').css({
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.45rem 0.75rem',
              borderRadius: '999px',
              border: active ? '1.5px solid #41c38c' : '1px solid #e2e8f0',
              background: active ? '#eef9f3' : '#f8fafc',
              color: active ? '#2f7a5a' : '#475569',
              fontSize: '0.78rem',
              fontWeight: active ? '700' : '600',
              cursor: 'pointer'
            });
            if (active) chip.child(el('i').class('fas fa-check').css({ fontSize: '0.65rem' }));
            chip.child(el('span').text(label));
            chip.click((e) => {
              if (e && e.preventDefault) e.preventDefault();
              if (selectedKodes.has(kode)) selectedKodes.delete(kode);
              else selectedKodes.add(kode);
              refreshChips();
            });
            chipGrid.child(chip);
          });
          chipGrid.get();
        };

        const onPekerjaanChange = (fieldName, val) => {
          if (fieldName !== 'pekerjaan') return;
          currentPekerjaan = String(val || '').trim();
          pruneInvalidSelections();
          refreshChips();
        };

        const pekerjaanForm = FormBuilder.build(pekerjaanFormSchema, {
          apiClient,
          initialData: { pekerjaan: currentPekerjaan },
          onFieldChange: onPekerjaanChange,
          onSubmit: () => {},
          onCancel: () => {}
        });
        refreshChips();

        const footer = el('div').css({
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.5rem',
          marginTop: '0.25rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid #e2e8f0'
        });
        const cancelBtn = el('button').attr('type', 'button').text('Batal').css({
          padding: '0.55rem 0.95rem',
          borderRadius: '0.5rem',
          border: '1px solid #cbd5e1',
          background: '#fff',
          cursor: 'pointer'
        });
        cancelBtn.click(() => layout.closeModal());
        const saveBtn = el('button').attr('type', 'button').text('Simpan').css({
          padding: '0.55rem 0.95rem',
          borderRadius: '0.5rem',
          border: 'none',
          background: 'linear-gradient(135deg, #41c38c 0%, #36a876 100%)',
          color: '#fff',
          fontWeight: '700',
          cursor: 'pointer'
        });
        saveBtn.click(async () => {
          try {
            saveBtn.attr('disabled', true);
            const pekerjaanVal = pekerjaanForm.getData().pekerjaan || '';
            if (!String(pekerjaanVal).trim()) {
              if (typeof layout !== 'undefined' && layout.toast) {
                layout.toast('Pilih jenis pekerjaan terlebih dahulu', { type: 'warning' });
              }
              return;
            }
            const kriteria = getFilteredKriteria()
              .filter((item) => selectedKodes.has(String(item.kode || '').trim()))
              .map((item) => ({
                kode: String(item.kode || '').trim(),
                nama: String(item.nama || '').trim()
              }));

            await apiClient.post('majikan_kriteria_pekerjaan/sync', {
              id_biodata: bid,
              pekerjaan: pekerjaanVal,
              kriteria
            });

            if (typeof layout !== 'undefined' && layout.toast) {
              layout.toast('Detail pekerjaan berhasil disimpan', { type: 'success' });
            }
            layout.closeModal();
            if (refreshTable) refreshTable();
          } catch (error) {
            console.error('Error saving detail pekerjaan:', error);
            if (typeof layout !== 'undefined' && layout.toast) {
              layout.toast('Error: ' + (error.data?.error || error.message || 'Gagal menyimpan detail pekerjaan'), { type: 'error' });
            }
          } finally {
            saveBtn.attrRemove('disabled');
          }
        });
        footer.child([cancelBtn, saveBtn]);

        mountModalChildren(wrap, [info, pekerjaanForm.el, detailSection, footer]);

        layout.modal({
          title: `Detail Pekerjaan — ${row.nama || bid}`,
          content: wrap.el,
          dismissible: true,
          size: schema.modalSize || 'large'
        });
      } catch (error) {
        console.error('Error preparing detail pekerjaan modal:', error);
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('Gagal memuat form detail pekerjaan', { type: 'error' });
        }
      }
    },

    // Open edit form as new page
    async openEditAsNewPage(schema, apiClient, tableInstance, row, refreshTable) {
      const id = resolveRecordId(schema, row);
      const formPagePath = `/${schema.resource}/edit/${id}`;
      const listPath = schema.path || `/${schema.resource}`;

      if (typeof layout !== 'undefined') {
        layout.addPage({
          path: formPagePath,
          component: async () => {
            // Show loading state
            const loadingContainer = el('div').css({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4rem',
              gap: '1rem'
            });
            
            // Spinner
            const spinner = el('div').css({
              width: '64px',
              height: '64px',
              border: '5px solid #e2e8f0',
              borderTop: `5px solid ${T.accent}`,
              borderRadius: '50%',
              animation: 'crud-spin 0.8s linear infinite'
            });
            
            const loadingText = el('p').css({
              fontSize: '1.125rem',
              color: '#64748b',
              fontWeight: '500'
            }).text('Loading data...');
            
            loadingContainer.child(spinner);
            loadingContainer.child(loadingText);
            
            // Add spin animation if not already added
            if (!document.getElementById('crud-spin-style')) {
              const style = document.createElement('style');
              style.id = 'crud-spin-style';
              style.textContent = '@keyframes crud-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
              document.head.appendChild(style);
            }

            // Fetch fresh data from API
            let freshData = row;
            try {
              const response = await apiClient.read(`${schema.resource}/${id}`);
              if (response && response.data) {
                freshData = response.data;
              } else if (response && !response.data) {
                freshData = response;
              }
            } catch (error) {
              console.warn('Failed to fetch fresh data, using cached row data:', error);
              if (typeof layout !== 'undefined' && layout.toast) {
                layout.toast('Using cached data (fetch failed)', { type: 'warning', duration: 2000 });
              }
            }

            const preparedForm = await CrudEngine.prepareFormSchemaForCrud(schema, apiClient, freshData);
            const form = FormBuilder.build(preparedForm, {
              apiClient,
              initialData: freshData,
              onSubmit: async (formData) => {
                try {
                  const updateId = resolveRecordId(schema, freshData);
                  await apiClient.update(`${schema.resource}/${updateId}`, formData);
                  if (typeof layout !== 'undefined' && layout.toast) {
                    layout.toast('Data updated successfully', { type: 'success' });
                  }
                  layout.navigate(listPath);
                  refreshTable();
                } catch (error) {
                  console.error('Error updating data:', error);
                  if (typeof layout !== 'undefined' && layout.toast) {
                    layout.toast('Error updating data', { type: 'error' });
                  }
                }
              },
              onCancel: () => layout.navigate(listPath)
            });

            const pageContainer = el('div').css({
              width: '100%',
              padding: '2rem',
              boxSizing: 'border-box'
            });

            pageContainer.child(
              el('h1').css({ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' })
                .text(`Edit ${schema.title || 'Item'}`)
            );

            const card = el('div').css({
              backgroundColor: '#fff',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              width: '100%',
              boxSizing: 'border-box'
            });
            card.child(form.el.css({ width: '100%' }));
            pageContainer.child(card);

            return pageContainer.get();
          },
          hideLayout: false
        });

        layout.navigate(formPagePath);
        if (typeof layout.resetPageScroll === 'function') {
          layout.resetPageScroll();
        }
      }
    },

    // Delete row
    async deleteRow(schema, apiClient, tableInstance, row, refreshTable) {
      if (!apiClient) {
        console.error('ApiClient not provided');
        return;
      }

      if (typeof layout !== 'undefined' && layout.confirm) {
        layout.confirm({
          title: 'Delete Confirmation',
          message: `Are you sure you want to delete this ${schema.title?.toLowerCase() || 'item'}?`,
          confirmText: 'Delete',
          cancelText: 'Cancel',
          onConfirm: async () => {
            try {
              const id = resolveRecordId(schema, row);
              await apiClient.delete(`${schema.resource}/${id}`);
              
              if (typeof layout !== 'undefined' && layout.toast) {
                layout.toast('Data deleted successfully', { type: 'success' });
              }

              this.refreshAppNotificationsIfNeeded(schema);
              refreshTable();
            } catch (error) {
              console.error('Error deleting data:', error);
              const msg = error?.data?.error || error?.message || 'Gagal menghapus data.';
              if (typeof layout !== 'undefined' && layout.toast) {
                layout.toast(msg, { type: 'error' });
              }
            }
          }
        });
      }
    },

    // Check permission
    checkPermission(action, schemaPerms, pagePermsOrRoles) {
      if (typeof CrmRbac !== 'undefined' && CrmRbac.getRole) {
        const r = CrmRbac.getRole();
        if (r === 'admin') return true;
      }
      if (pagePermsOrRoles && typeof pagePermsOrRoles === 'object' && pagePermsOrRoles._explicit) {
        const allowed = pagePermsOrRoles[action];
        if (Array.isArray(allowed)) {
          if (allowed.length === 1 && allowed[0] === '__none__') return false;
          return typeof CrmRbac !== 'undefined' ? CrmRbac.hasRole(allowed) : true;
        }
        return !!allowed;
      }
      if (typeof CrmRbac !== 'undefined') {
        if (Array.isArray(pagePermsOrRoles) && pagePermsOrRoles.length) {
          return CrmRbac.hasRole(pagePermsOrRoles);
        }
        if (pagePermsOrRoles && typeof pagePermsOrRoles === 'object' && pagePermsOrRoles[action]) {
          return CrmRbac.hasRole(pagePermsOrRoles[action]);
        }
        if (schemaPerms) {
          return CrmRbac.can(action, schemaPerms);
        }
        return true;
      }
      if (!schemaPerms || !schemaPerms[action]) return true;
      return true;
    },

    async convertLeadRow(apiClient, row, refreshTable) {
      if (row.is_converted) {
        const msg = 'This lead has already been converted.';
        if (typeof layout !== 'undefined' && layout.toast) layout.toast(msg, { type: 'warning' });
        else alert(msg);
        return;
      }
      const name = row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim();
      if (!confirm(`Convert lead "${name}" to a customer?`)) return;

      try {
        const res = await apiClient.request(`/leads/${row.id}/convert`, {
          method: 'POST',
          body: JSON.stringify({ createDeal: true })
        });
        const code = res.data?.customer?.customer_code || '';
        const msg = code ? `Customer ${code} created successfully.` : 'Lead converted successfully.';
        if (typeof layout !== 'undefined' && layout.toast) layout.toast(msg, { type: 'success' });
        else alert(msg);
        if (refreshTable) refreshTable();
      } catch (err) {
        const msg = err.data?.error || err.message || 'Failed to convert lead';
        if (typeof layout !== 'undefined' && layout.toast) layout.toast(msg, { type: 'error' });
        else alert(msg);
      }
    },

    // Create modal footer with save/cancel buttons
    createModalFooter(schema, apiClient, tableInstance, row, mode) {
      const footer = el('div').css({
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '0.75rem',
        paddingTop: '1rem',
        borderTop: '1px solid #e5e7eb'
      });

      // Cancel button
      const cancelButton = el('button')
        .text('Cancel')
        .css({
          padding: '0.65rem 1.25rem',
          borderRadius: '0.5rem',
          border: '1px solid #d1d5db',
          backgroundColor: '#fff',
          color: '#374151',
          cursor: 'pointer',
          fontSize: '0.95rem',
          fontWeight: '500'
        })
        .click(() => {
          if (typeof layout !== 'undefined') {
            layout.closeModal();
          }
        });

      // Save button
      const saveButton = el('button')
        .text(mode === 'create' ? 'Create' : 'Save')
        .css({
          padding: '0.65rem 1.25rem',
          borderRadius: '0.5rem',
          border: 'none',
          backgroundColor: T.primary,
          color: '#fff',
          cursor: 'pointer',
          fontSize: '0.95rem',
          fontWeight: '500'
        })
        .click(() => {
          // Trigger form submit - find form and dispatch submit event
          const form = document.querySelector('#crud-form');
          if (form) {
            form.requestSubmit();
          }
        });

      footer.child(cancelButton);
      footer.child(saveButton);

      return footer;
    }
  };

  CrudEngine.stashCrudCreatePrefill = stashCrudCreatePrefill;
  CrudEngine.takeCrudCreatePrefill = takeCrudCreatePrefill;
  CrudEngine.buildBukaRekeningPrefillFromRow = buildBukaRekeningPrefillFromRow;
  CrudEngine.navigateBukaRekeningCreate = navigateBukaRekeningCreate;

  return CrudEngine;
}));
