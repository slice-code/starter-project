(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
      (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.TableBuilder = factory());
})(this, (function () {
  'use strict';

  // Tema visual datatable (hanya styling, tidak mengubah layout/fungsi)
  const DT = {
    font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    paginationBg: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
    paginationBorder: '1px solid #e2e8f0',
    theadBg: '#f1f5f9',
    theadColor: '#475569',
    theadBorder: '2px solid #e2e8f0',
    rowBorder: '1px solid #f1f5f9',
    rowHover: '#f8fafc',
    rowAlt: '#fafbfc',
    rowSelected: '#eff6ff',
    text: '#0f172a',
    muted: '#64748b',
    accent: '#41c38c',
    accentSoft: '#eef9f3',
    dangerSoft: '#fef2f2',
    danger: '#dc2626',
    radius: '0.5rem',
    shadowSm: '0 1px 2px rgba(15, 23, 42, 0.05)',
    shadowMd: '0 4px 12px rgba(15, 23, 42, 0.06)'
  };

  let spinStyleInjected = false;
  function ensureTableStyles() {
    if (spinStyleInjected || document.querySelector('style[data-crud-table-style]')) return;
    spinStyleInjected = true;
    const style = document.createElement('style');
    style.setAttribute('data-crud-table-style', 'true');
    style.textContent = `
      @keyframes crud-table-spin {
        to { transform: rotate(360deg); }
      }
      .crud-dt-search-wrap:focus-within .crud-dt-search-icon {
        color: #41c38c !important;
      }
      .crud-dt-search:focus {
        border-color: #41c38c !important;
        box-shadow: 0 0 0 3px rgba(65, 195, 140, 0.18) !important;
      }
      .crud-dt-search-clear:hover {
        background: #eef9f3 !important;
        color: #2f3d58 !important;
      }
      .crud-dt-action-btn-solid:hover {
        filter: brightness(1.06);
        box-shadow: 0 2px 8px rgba(65, 195, 140, 0.35) !important;
      }
      .crud-dt-action-btn-danger:hover {
        filter: brightness(0.98);
        box-shadow: 0 2px 8px rgba(220, 38, 38, 0.18) !important;
      }
      .crud-dt-action-btn-warning:hover {
        filter: brightness(0.98);
        box-shadow: 0 2px 8px rgba(180, 83, 9, 0.16) !important;
      }
      .crud-dt-action-btn:hover {
        transform: translateY(-1px);
      }
      .crud-dt-action-btn-primary:hover {
        filter: brightness(1.04);
        box-shadow: 0 6px 16px rgba(65, 195, 140, 0.32) !important;
      }
      @media (min-width: 768px) {
        .crud-dt-search-kbd { display: inline-flex !important; align-items: center; }
      }
      @media (max-width: 640px) {
        .crud-dt-header { padding-left: 1rem !important; padding-right: 1rem !important; }
        .crud-dt-header-actions { width: 100%; justify-content: flex-start !important; }
      }
      .crud-dt-table-wrap .crud-dt-col-fixed {
        background-clip: padding-box;
      }
      .crud-dt-table-wrap thead th {
        background-color: #f1f5f9;
      }
      .crud-dt-table-wrap {
        scrollbar-width: auto;
        scrollbar-color: #94a3b8 #e2e8f0;
      }
      .crud-dt-table-wrap::-webkit-scrollbar {
        height: 12px;
        width: 12px;
      }
      .crud-dt-table-wrap::-webkit-scrollbar-track {
        background: linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%);
        border-radius: 999px;
      }
      .crud-dt-table-wrap::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, #94a3b8 0%, #64748b 100%);
        border-radius: 999px;
        border: 2px solid #e2e8f0;
      }
      .crud-dt-table-wrap::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(180deg, #64748b 0%, #475569 100%);
      }
      .crud-dt-scroll-fade {
        opacity: 0;
        transition: opacity 0.18s ease;
        pointer-events: none;
      }
      .crud-dt-scroll-fade.is-visible {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);
  }

  function isDokumenFilePath(filePath) {
    if (!filePath || String(filePath).trim() === '') return false;
    const s = String(filePath).trim();
    const base = s.split('/').pop().toLowerCase();
    if (base === 'profile.jpg' || base === 'profile.png') return false;
    return s.startsWith('/uploads/') || s.startsWith('/data/uploads/') || /^https?:\/\//i.test(s);
  }

  function resolveColumnFixedSide(column) {
    const fixed = column?.fixed;
    if (fixed === 'left' || fixed === 'right') return fixed;
    if (fixed === true) return column.type === 'actions' ? 'right' : 'left';
    return null;
  }

  function parseCssWidthPx(value, fallback) {
    if (value == null || value === '') return fallback;
    const n = parseInt(String(value), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function defaultFixedColumnWidth(column) {
    if (column.width && column.width !== 'auto') return parseCssWidthPx(column.width, 120);
    if (column.key === 'id_tki' || column.key === 'id_biodata') return 140;
    return 120;
  }

  function isActionsAutoWidth(column) {
    return column.type === 'actions' && (!column.width || column.width === 'auto');
  }

  function estimateActionsColumnWidth(column) {
    const cellPad = 24;
    const actions = column.actions || [];
    const count = Math.max(actions.length, 1);
    const showLabels = column.showActionLabels === true;
    const resolved = actions.filter((a) => a && typeof a === 'object');
    if (showLabels && resolved.length) {
      let total = cellPad;
      resolved.forEach((a, idx) => {
        const label = String(a.label || '').trim();
        total += Math.max(28, label.length * 7 + 22);
        if (idx > 0) total += 5;
      });
      if (resolved.some((a) => a.group === 'status') && resolved.some((a) => a.group !== 'status')) {
        total += 14;
      }
      return total;
    }
    const btn = 28;
    const gap = 5;
    const sep = resolved.some((a) => a.group === 'status') && resolved.some((a) => a.group !== 'status') ? 14 : 0;
    return cellPad + count * btn + Math.max(0, count - 1) * gap + sep;
  }

  function resolveColumnWidth(column) {
    if (isActionsAutoWidth(column)) {
      return { autoWidth: true, width: estimateActionsColumnWidth(column) };
    }
    if (column.width && column.width !== 'auto') {
      return { autoWidth: false, width: parseCssWidthPx(column.width, 120) };
    }
    return { autoWidth: false, width: defaultFixedColumnWidth(column) };
  }

  function buildFixedColumnLayout(schema) {
    const layout = {};
    const cols = schema.columns || [];
    let leftOffset = schema.features?.selectable ? 50 : 0;
    const leftIdx = [];
    const rightIdx = [];
    cols.forEach((col, i) => {
      const side = resolveColumnFixedSide(col);
      if (side === 'left') leftIdx.push(i);
      if (side === 'right') rightIdx.push(i);
    });
    leftIdx.forEach((i, pos) => {
      const col = cols[i];
      const spec = resolveColumnWidth(col);
      layout[i] = {
        side: 'left',
        offset: leftOffset,
        width: spec.width,
        autoWidth: spec.autoWidth,
        edgeShadow: pos === leftIdx.length - 1
      };
      leftOffset += spec.width;
    });
    let rightOffset = 0;
    for (let r = rightIdx.length - 1; r >= 0; r -= 1) {
      const i = rightIdx[r];
      const col = cols[i];
      const spec = resolveColumnWidth(col);
      layout[i] = {
        side: 'right',
        offset: rightOffset,
        width: spec.width,
        autoWidth: spec.autoWidth,
        edgeShadow: r === 0
      };
      rightOffset += spec.width;
    }
    return layout;
  }

  function applyFixedColumnStyle(cell, fixedInfo, opts = {}) {
    if (!fixedInfo) return;
    const isHeader = !!opts.isHeader;
    const bg = opts.bg || (isHeader ? DT.theadBg : '#fff');
    const style = {
      position: 'sticky',
      backgroundColor: bg,
      whiteSpace: 'nowrap'
    };
    if (fixedInfo.autoWidth) {
      style.width = 'max-content';
      style.minWidth = 'max-content';
      style.maxWidth = opts.maxWidth || 'none';
    } else {
      style.minWidth = `${fixedInfo.width}px`;
      style.width = `${fixedInfo.width}px`;
    }
    if (isHeader) {
      style.top = '0';
      style.zIndex = fixedInfo.side === 'right' ? '6' : '5';
    } else {
      style.zIndex = '2';
    }
    if (fixedInfo.side === 'left') {
      style.left = `${fixedInfo.offset}px`;
      if (fixedInfo.edgeShadow) style.boxShadow = '2px 0 8px rgba(15, 23, 42, 0.08)';
    } else {
      style.right = `${fixedInfo.offset}px`;
      if (fixedInfo.edgeShadow) style.boxShadow = '-2px 0 8px rgba(15, 23, 42, 0.08)';
    }
    cell.css(style);
    cell.class('crud-dt-col-fixed');
  }

  const TableBuilder = {
    // Build table from JSON schema
    build(schema, options = {}) {
      ensureTableStyles();
      const {
        data = [],
        onDataChange = () => {},
        onPageChange = () => {},
        onPerPageChange = () => {},
        onSort = () => {},
        onSortChange = () => {}, // New callback for sort state changes
        onSearch = () => {},
        onSelectionChange = () => {}
      } = options;

      let tableData = [...data];
      let currentPage = 1;
      let perPage = schema.features?.perPage || 10;
      let sortColumn = null;
      let sortDirection = 'asc';
      let sortColumns = []; // Multi-column sort: [{ column, direction }, ...]
      let searchQuery = '';
      let selectedRows = new Set();
      let isLoading = false;

      // Default sortable to true if not explicitly set
      const isSortable = schema.features?.sortable !== false;
      const isMultiSort = schema.features?.multiSort !== false; // Default enable multi-sort

      const tableHeight = schema.features?.tableHeight;
      const tableMinHeight = schema.features?.tableMinHeight;
      const tableScrollMinHeight = schema.features?.tableScrollMinHeight;
      const fixedColumnLayout = buildFixedColumnLayout(schema);
      schema._fixedColumnLayout = fixedColumnLayout;
      const hasFixedColumns = Object.keys(fixedColumnLayout).length > 0;

      // Table container
      const container = el('div').css({
        display: 'flex',
        flexDirection: 'column',
        flex: tableHeight ? '0 0 auto' : '1',
        width: '100%',
        minWidth: '0',
        overflow: 'hidden',
        fontFamily: DT.font,
        backgroundColor: '#fff',
        margin: '0',
        boxSizing: 'border-box',
        minHeight: tableHeight ? (tableMinHeight || tableHeight) : '0',
        height: tableHeight || '100%',
        maxHeight: tableHeight || undefined
      });

      // Search bar
      let searchInput = null;
      if (schema.features?.search) {
        const searchContainer = el('div').css({
          display: 'flex',
          gap: '0.5rem',
          padding: '0 0 0.75rem 0',
          backgroundColor: '#fff'
        });

        searchInput = el('input')
          .attr('type', 'text')
          .attr('placeholder', 'Search...')
          .css({
            flex: '1',
            padding: '0.65rem 0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid #d1d5db',
            fontSize: '0.95rem',
            outline: 'none'
          })
          .on('input', (e) => {
            searchQuery = e.target.value;
            currentPage = 1;
            onSearch(searchQuery);
            this.renderTableBody(tbody, schema, filteredData(), currentPage, perPage, selectedRows);
          });

        searchContainer.child(searchInput);
        container.child(searchContainer);
      }

      // Table wrapper (only tbody scrolls, thead stays fixed via sticky)
      const tableWrapper = el('div').class('crud-dt-table-wrap').css({
        overflowY: 'auto',
        overflowX: 'auto',
        flex: tableHeight ? '1 1 0%' : '1',
        minHeight: tableHeight ? (tableScrollMinHeight || '200px') : '0',
        width: '100%',
        minWidth: '0',
        boxSizing: 'border-box',
        position: 'relative',
        backgroundColor: '#fff',
        borderLeft: DT.paginationBorder,
        borderRight: DT.paginationBorder,
        borderBottom: DT.paginationBorder,
        borderRadius: '0'
      });

      const leftScrollFade = el('div')
        .class('crud-dt-scroll-fade')
        .css({
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 12,
          width: '28px',
          background: 'linear-gradient(90deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0) 100%)',
          zIndex: 8
        });
      const rightScrollFade = el('div')
        .class('crud-dt-scroll-fade')
        .css({
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 12,
          width: '34px',
          background: 'linear-gradient(270deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0) 100%)',
          zIndex: 8
        });
      function updateHorizontalScrollHints() {
        const wrapEl = tableWrapper.el;
        if (!wrapEl) return;
        const maxScrollLeft = Math.max(0, wrapEl.scrollWidth - wrapEl.clientWidth);
        const hasHorizontalOverflow = maxScrollLeft > 8;
        const scrollLeft = wrapEl.scrollLeft || 0;
        const showLeft = hasHorizontalOverflow && scrollLeft > 6;
        const showRight = hasHorizontalOverflow && scrollLeft < (maxScrollLeft - 6);

        leftScrollFade.class(showLeft ? 'crud-dt-scroll-fade is-visible' : 'crud-dt-scroll-fade');
        rightScrollFade.class(showRight ? 'crud-dt-scroll-fade is-visible' : 'crud-dt-scroll-fade');
      }

      // Table element
      const fitToContentWidth = !!(schema.readOnlyReport && schema.reportKey);
      const table = el('table').css({
        width: fitToContentWidth ? 'max-content' : '100%',
        minWidth: fitToContentWidth || hasFixedColumns ? 'max-content' : undefined,
        borderCollapse: 'separate',
        borderSpacing: '0',
        fontSize: '14px',
        color: DT.text
      });

      // Table header — sticky per th (bukan thead) agar z-index fixed kolom benar
      const thead = el('thead').css({
        backgroundColor: DT.theadBg,
        borderBottom: DT.theadBorder,
        boxShadow: DT.shadowSm
      });

      const headerRow = el('tr');

      // Selection checkbox column
      if (schema.features?.selectable) {
        headerRow.child(
          el('th').css({
            padding: '0.85rem 0.75rem',
            textAlign: 'left',
            fontWeight: '600',
            width: '50px',
            backgroundColor: DT.theadBg,
            color: DT.theadColor,
            fontSize: '14px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            position: 'sticky',
            top: '0',
            left: '0',
            zIndex: '7'
          }).child(
            el('input')
              .attr('type', 'checkbox')
              .css({ width: '1rem', height: '1rem', cursor: 'pointer' })
              .on('change', (e) => {
                if (e.target.checked) {
                  filteredData().forEach((row, idx) => selectedRows.add(idx));
                } else {
                  selectedRows.clear();
                }
                onSelectionChange(Array.from(selectedRows).map(idx => filteredData()[idx]));
                this.renderTableBody(tbody, schema, filteredData(), currentPage, perPage, selectedRows);
              })
          )
        );
      }

      // Data columns
      const columnSortUpdaters = []; // Store update functions for each column
      
      schema.columns.forEach((column, colIdx) => {
        // Default sortable to true for all columns EXCEPT actions type
        const columnSortable = column.sortable !== false && column.type !== 'actions';
        
        const thAlign = column.align || (column.type === 'actions' ? 'center' : 'left');
        const thStyle = {
          padding: '0.85rem 1rem',
          textAlign: thAlign,
          fontWeight: '600',
          whiteSpace: 'nowrap',
          cursor: columnSortable && isSortable ? 'pointer' : 'default',
          backgroundColor: DT.theadBg,
          color: DT.theadColor,
          fontSize: '14px',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          userSelect: 'none',
          transition: 'color 0.15s ease',
          position: 'sticky',
          top: '0'
        };
        if (!fixedColumnLayout[colIdx]) thStyle.zIndex = '4';
        if (column.width && column.width !== 'auto' && !fixedColumnLayout[colIdx]?.autoWidth) {
          thStyle.width = column.width;
          thStyle.minWidth = column.width;
        } else if (column.type === 'actions') {
          thStyle.width = '1%';
          thStyle.whiteSpace = 'nowrap';
        }
        const th = el('th').css(thStyle).text(column.label || '');
        applyFixedColumnStyle(th, fixedColumnLayout[colIdx], { isHeader: true, bg: DT.theadBg });

        if (columnSortable && isSortable) {
          // Sort icon container
          const sortIconWrap = el('span').css({
            display: 'inline-flex',
            alignItems: 'center',
            marginLeft: '0.35rem',
            gap: '0.15rem'
          });

          // Up arrow (asc)
          const iconAsc = el('i').class('fas fa-sort-up').css({
            fontSize: '0.65rem',
            opacity: '0.3',
            color: DT.theadColor,
            transition: 'opacity 0.15s, color 0.15s'
          });

          // Down arrow (desc)
          const iconDesc = el('i').class('fas fa-sort-down').css({
            fontSize: '0.65rem',
            opacity: '0.3',
            color: DT.theadColor,
            transition: 'opacity 0.15s, color 0.15s'
          });

          // Sort order badge (for multi-sort)
          const sortBadge = el('span').css({
            display: 'none',
            fontSize: '0.6rem',
            fontWeight: '700',
            backgroundColor: DT.accent,
            color: '#fff',
            borderRadius: '50%',
            width: '14px',
            height: '14px',
            textAlign: 'center',
            lineHeight: '14px',
            marginLeft: '0.2rem'
          });

          sortIconWrap.child([iconAsc, iconDesc]);
          th.child(sortIconWrap);
          th.child(sortBadge);

          // Update icon states based on current sort
          const updateSortIcons = () => {
            // Check if this column is in multi-sort array
            const sortIndex = sortColumns.findIndex(s => s.column === column.key);
            const isActive = sortIndex !== -1;
            
            if (isActive) {
              const direction = sortColumns[sortIndex].direction;
              if (direction === 'asc') {
                iconAsc.css({ opacity: '1', color: DT.accent });
                iconDesc.css({ opacity: '0.3', color: DT.theadColor });
              } else {
                iconAsc.css({ opacity: '0.3', color: DT.theadColor });
                iconDesc.css({ opacity: '1', color: DT.accent });
              }
              th.css({ color: DT.accent });
              
              // Show badge with sort order number
              if (isMultiSort && sortColumns.length > 1) {
                sortBadge.css({ display: 'inline-block' }).text(String(sortIndex + 1));
              } else {
                sortBadge.css({ display: 'none' });
              }
            } else {
              iconAsc.css({ opacity: '0.3', color: DT.theadColor });
              iconDesc.css({ opacity: '0.3', color: DT.theadColor });
              th.css({ color: DT.theadColor });
              sortBadge.css({ display: 'none' });
            }
          };
          
          // Store updater for external access
          columnSortUpdaters.push(updateSortIcons);

          // Initial state
          updateSortIcons();

          th.click((e) => {
            if (isMultiSort && e.shiftKey) {
              // Multi-column sort with Shift+Click
              const existingIndex = sortColumns.findIndex(s => s.column === column.key);
              
              if (existingIndex !== -1) {
                // Toggle direction for existing column
                sortColumns[existingIndex].direction = 
                  sortColumns[existingIndex].direction === 'asc' ? 'desc' : 'asc';
              } else {
                // Add new column to sort array
                sortColumns.push({ column: column.key, direction: 'asc' });
              }
              
              // Update legacy single-sort variables for backward compatibility
              sortColumn = sortColumns[0]?.column || null;
              sortDirection = sortColumns[0]?.direction || 'asc';
            } else {
              // Single-column sort (regular click) - reset multi-sort
              sortColumns = [{ column: column.key, direction: 'asc' }];
              
              if (sortColumn === column.key) {
                // Toggle direction
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                sortColumns[0].direction = sortDirection;
              } else {
                // New column, start with asc
                sortColumn = column.key;
                sortDirection = 'asc';
              }
            }
            
            // Update visual indicators for ALL sortable columns
            updateSortIcons();
            
            // Notify sort state change (for clear button visibility)
            onSortChange(sortColumns);
            
            // Call onSort with both single and multi-sort info
            onSort(sortColumn, sortDirection, sortColumns);
            this.renderTableBody(tbody, schema, filteredData(), currentPage, perPage, selectedRows);
          });
        }

        headerRow.child(th);
      });

      thead.child(headerRow);
      table.child(thead);

      // Table body
      const tbody = el('tbody');
      table.child(tbody);
      tableWrapper.child(table);

      // Loading overlay (centered on table) - add BEFORE tableWrapper is mounted
      const loadingOverlay = el('div').css({
        display: 'none',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(2px)',
        zIndex: 100,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        gap: '1rem',
        borderRadius: DT.radius
      }).child([
        el('div').css({
          width: '48px',
          height: '48px',
          border: `4px solid ${DT.theadBg}`,
          borderTop: `4px solid ${DT.accent}`,
          borderRadius: '50%',
          animation: 'crud-table-spin 0.8s linear infinite'
        }),
        el('div').css({
          fontSize: '0.875rem',
          color: DT.muted,
          fontWeight: '500'
        }).text('Memuat data...')
      ]);
      
      // Add overlay to tableWrapper BEFORE it gets mounted
      tableWrapper.child(loadingOverlay);
      tableWrapper.child([leftScrollFade, rightScrollFade]);

      // Pagination (above table)
      let paginationContainer = null;
      let handlePageChange = null;
      let loadingSpinner = null;
      if (schema.features?.pagination) {
        paginationContainer = el('div').css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.65rem 1rem',
          borderBottom: DT.paginationBorder,
          borderTop: DT.paginationBorder,
          borderLeft: DT.paginationBorder,
          borderRight: DT.paginationBorder,
          borderRadius: '0',
          background: DT.paginationBg,
          flexShrink: '0',
          fontSize: '0.8125rem',
          color: DT.muted,
          position: 'relative',
          zIndex: '5',
          boxShadow: DT.shadowSm
        });

        // Per page selector
        const perPageContainer = el('div').css({
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem'
        });

        perPageContainer.child(el('span').text('Tampilkan').css({ fontWeight: '500', color: DT.muted }));
        
        const perPageSelect = el('select')
          .css({
            padding: '0.35rem 0.55rem',
            borderRadius: '0.375rem',
            border: '1px solid #cbd5e1',
            fontSize: '0.8125rem',
            outline: 'none',
            backgroundColor: '#fff',
            color: DT.text,
            cursor: 'pointer',
            boxShadow: DT.shadowSm
          });

        const perPageOptions = schema.features?.perPageOptions || [5, 10, 25, 50, 100];
        perPageOptions.forEach(option => {
          const opt = el('option')
            .attr('value', option)
            .text(option);
          if (option === perPage) {
            opt.attr('selected', 'selected');
          }
          perPageSelect.child(opt);
        });

        perPageSelect.on('change', (e) => {
          perPage = parseInt(e.target.value);
          currentPage = 1;
          onPerPageChange(perPage, currentPage);
          this.renderTableBody(tbody, schema, filteredData(), currentPage, perPage, selectedRows);
          this.renderPagination(paginationContainer, schema, filteredData().length, currentPage, perPage, handlePageChange);
        });

        perPageContainer.child(perPageSelect);
        perPageContainer.child(el('span').text('baris').css({ color: DT.muted }));

        // Ensure select shows correct value
        perPageSelect.el.value = perPage;
        paginationContainer.child(perPageContainer);

        // Loading spinner (shown next to pagination info)
        loadingSpinner = el('div').css({
          display: 'none',
          width: '14px',
          height: '14px',
          border: '2px solid #e2e8f0',
          borderTop: `2px solid ${DT.accent}`,
          borderRadius: '50%',
          animation: 'crud-table-spin 0.65s linear infinite',
          flexShrink: '0',
          marginLeft: '0.5rem'
        });
        paginationContainer.child(loadingSpinner);

        // Page change handler
        handlePageChange = (page) => {
          currentPage = page;
          onPageChange(page);
        };

        // Pagination buttons
        const paginationButtons = this.createPaginationButtons(
          schema,
          filteredData().length,
          currentPage,
          perPage,
          handlePageChange
        );

        paginationContainer.child(paginationButtons);
        container.child(paginationContainer);
      }

      // Table wrapper after pagination
      container.child(tableWrapper);

      // Bulk actions
      let bulkActionsContainer = null;
      if (schema.features?.selectable && schema.features?.bulkActions?.length > 0) {
        bulkActionsContainer = el('div').css({
          display: 'none',
          gap: '0.5rem',
          padding: '0.75rem',
          backgroundColor: '#f0f9ff',
          borderRadius: '0.5rem',
          border: '1px solid #bae6fd'
        });

        schema.features.bulkActions.forEach(action => {
          const button = el('button')
            .text(action.label)
            .css({
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: '1px solid #0284c7',
              backgroundColor: '#fff',
              color: '#0284c7',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            });

          if (action.icon) {
            button.child(el('i').class(action.icon));
          }

          button.click(() => {
            const selected = Array.from(selectedRows).map(idx => filteredData()[idx]);
            action.onClick(selected);
          });

          bulkActionsContainer.child(button);
        });

        container.child(bulkActionsContainer);
      }

      // Initial render
      this.renderTableBody(tbody, schema, filteredData(), currentPage, perPage, selectedRows);
      setTimeout(updateHorizontalScrollHints, 0);
      tableWrapper.on('scroll', updateHorizontalScrollHints);
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', updateHorizontalScrollHints);
      }
      
      if (paginationContainer) {
        this.renderPagination(paginationContainer, schema, filteredData().length, currentPage, perPage, handlePageChange);
      }

      // Helper function to filter and sort data
      function filteredData() {
        let filtered = [...tableData];

        // Apply search
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          filtered = filtered.filter(row => {
            return schema.columns.some(column => {
              if (column.type === 'actions') return false;
              const value = row[column.key];
              return value && String(value).toLowerCase().includes(query);
            });
          });
        }

        // Apply multi-column sort
        if (sortColumns.length > 0) {
          filtered.sort((a, b) => {
            // Iterate through each sort column
            for (const sort of sortColumns) {
              const aVal = a[sort.column];
              const bVal = b[sort.column];
              
              if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
              if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
              // If equal, continue to next sort column
            }
            return 0;
          });
        }

        return filtered;
      }

      // Return table API
      return {
        el: container,
        get: () => container.get(),
        setData: (newData, serverPagination) => {
          tableData = [...newData];
          if (serverPagination) {
            // Server-side pagination: use server's page info
            currentPage = serverPagination.page || 1;
            perPage = serverPagination.perPage || perPage;
          } else {
            currentPage = 1;
          }
          selectedRows.clear();
          this.renderTableBody(tbody, schema, filteredData(), currentPage, perPage, selectedRows, serverPagination);
          if (paginationContainer) {
            const totalItems = serverPagination ? serverPagination.total : filteredData().length;
            this.renderPagination(paginationContainer, schema, totalItems, currentPage, perPage, handlePageChange);
          }
          setTimeout(updateHorizontalScrollHints, 0);
          onDataChange(tableData);
        },
        getData: () => [...tableData],
        getSelectedRows: () => Array.from(selectedRows).map(idx => filteredData()[idx]),
        setLoading: (loading) => {
          isLoading = loading;
          if (loading) {
            // Show overlay with fade-in effect
            if (loadingOverlay) {
              loadingOverlay.css({ 
                display: 'flex',
                opacity: '0',
                pointerEvents: 'auto', // Block interactions when visible
                transition: 'opacity 0.2s ease-in'
              });
              // Trigger fade-in
              setTimeout(() => {
                loadingOverlay.css({ opacity: '1' });
              }, 10);
            }
            // Dim table and show small spinner
            tbody.css({ opacity: '0.4', pointerEvents: 'none', transition: 'opacity 0.2s' });
            if (loadingSpinner) loadingSpinner.css({ display: 'block' });
          } else {
            // Hide overlay with fade-out effect
            if (loadingOverlay) {
              loadingOverlay.css({ opacity: '0' });
              setTimeout(() => {
                loadingOverlay.css({ 
                  display: 'none',
                  pointerEvents: 'none' // Don't block when hidden
                });
              }, 200);
            }
            // Restore table and hide small spinner
            tbody.css({ opacity: '1', pointerEvents: 'auto', transition: 'opacity 0.2s' });
            if (loadingSpinner) loadingSpinner.css({ display: 'none' });
          }
        },
        refresh: () => {
          this.renderTableBody(tbody, schema, filteredData(), currentPage, perPage, selectedRows);
        },
        resetSort: (column, direction) => {
          // Reset sort state to default
          if (column) {
            sortColumns = [{ column, direction }];
            sortColumn = column;
            sortDirection = direction;
          } else {
            sortColumns = [];
            sortColumn = null;
            sortDirection = 'asc';
          }
          
          // Update all column sort icons
          columnSortUpdaters.forEach(updater => updater());
          
          // Trigger sort change notification
          onSortChange(sortColumns);
          
          // Re-render table with new sort
          this.renderTableBody(tbody, schema, filteredData(), currentPage, perPage, selectedRows);
        },
        resetSelection: () => {
          selectedRows.clear();
          onSelectionChange([]);
          this.renderTableBody(tbody, schema, filteredData(), currentPage, perPage, selectedRows);
        }
      };
    },

    // Render table body
    renderTableBody(tbody, schema, data, page, perPage, selectedRows, serverPagination) {
      // Clear the existing tbody
      tbody.empty();
      const fixedColumnLayout = schema._fixedColumnLayout || buildFixedColumnLayout(schema);

      if (data.length === 0) {
        const colSpan = schema.columns.length + (schema.features?.selectable ? 1 : 0);
        tbody.child(
          el('tr').child(
            el('td')
              .attr('colspan', colSpan)
              .css({
                textAlign: 'center',
                padding: '3rem 1.5rem',
                color: DT.muted,
                backgroundColor: '#fafbfc'
              })
              .child([
                el('div').css({ fontSize: '2rem', color: '#cbd5e1', marginBottom: '0.75rem' }).child(
                  el('i').class('fas fa-inbox')
                ),
                el('div').text(schema.emptyText || 'No records found').css({
                  fontSize: '0.9375rem',
                  fontWeight: '500',
                  color: DT.muted
                })
              ])
          )
        ).get();
        return;
      }

      // Paginate (skip if server already paginated)
      let pageData;
      let startIdx;
      if (serverPagination) {
        pageData = data;
        startIdx = 0;
      } else {
        const start = (page - 1) * perPage;
        const end = start + perPage;
        pageData = data.slice(start, end);
        startIdx = start;
      }

      pageData.forEach((row, idx) => {
        const globalIdx = startIdx + idx;
        const isSelected = selectedRows.has(globalIdx);
        const isEven = idx % 2 === 1;
        const baseBg = isSelected ? DT.rowSelected : (isEven ? DT.rowAlt : '#ffffff');

        const tr = el('tr').css({
          borderBottom: DT.rowBorder,
          backgroundColor: baseBg,
          transition: 'background-color 0.15s ease, box-shadow 0.15s ease'
        }).hover(
          function() {
            if (!isSelected) this.style.backgroundColor = DT.rowHover;
          },
          function() {
            this.style.backgroundColor = isSelected ? DT.rowSelected : (isEven ? DT.rowAlt : '#ffffff');
          }
        );

        // Selection checkbox
        if (schema.features?.selectable) {
          tr.child(
            el('td').css({ padding: '0.75rem' }).child(
              el('input')
                .attr('type', 'checkbox')
                .attr('checked', selectedRows.has(globalIdx) ? 'checked' : null)
                .css({ width: '1rem', height: '1rem', cursor: 'pointer' })
                .on('change', (e) => {
                  if (e.target.checked) {
                    selectedRows.add(globalIdx);
                  } else {
                    selectedRows.delete(globalIdx);
                  }
                })
            )
          );
        }

        // Data cells
        schema.columns.forEach((column, colIdx) => {
          const tdAlign = column.align || (column.type === 'actions' ? 'center' : 'left');
          const tdStyle = {
            padding: column.type === 'actions' ? '0.55rem 0.75rem' : '0.8rem 1rem',
            color: column.type === 'actions' ? 'inherit' : DT.text,
            fontSize: '14px',
            verticalAlign: 'middle',
            textAlign: tdAlign
          };
          if (column.width && column.width !== 'auto' && !fixedColumnLayout[colIdx]?.autoWidth) {
            tdStyle.width = column.width;
            tdStyle.minWidth = column.width;
          } else if (column.type === 'actions') {
            tdStyle.width = '1%';
            tdStyle.whiteSpace = 'nowrap';
          }
          if (column.nowrap) tdStyle.whiteSpace = 'nowrap';
          const td = el('td').css(tdStyle);
          applyFixedColumnStyle(td, fixedColumnLayout[colIdx], { isHeader: false, bg: baseBg });

          if (column.type === 'actions') {
            const actionsContainer = el('div').css({
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.3rem',
              flexWrap: column.actionWrap === 'wrap' ? 'wrap' : 'nowrap',
              maxWidth: column.maxWidth || 'none',
              width: 'auto'
            });

            const actions = column.actions || [];
            const showActionLabels = column.showActionLabels === true;
            const visibleActions = actions.filter((action) => {
              if (typeof action.visible === 'function' && !action.visible(row)) return false;
              return true;
            });
            const statusActions = visibleActions.filter((action) => action.group === 'status');
            const otherActions = visibleActions.filter((action) => action.group !== 'status');

            const renderActionButton = (action) => {
              const isDanger = action.variant === 'danger';
              const isWarning = action.variant === 'warning';
              const isSolidGreen = !isDanger && !isWarning;
              const withLabel = showActionLabels || action.showLabel === true;
              const btnClass = [
                'crud-dt-action-btn',
                isDanger ? 'crud-dt-action-btn-danger' : '',
                isWarning ? 'crud-dt-action-btn-warning' : '',
                isSolidGreen ? 'crud-dt-action-btn-solid crud-dt-action-btn-primary' : ''
              ].filter(Boolean).join(' ');
              const button = el('button')
                .class(btnClass)
                .attr('title', action.label || '')
                .attr('type', 'button')
                .attr('aria-label', action.label || 'Aksi')
                .css({
                  width: withLabel ? 'auto' : '1.65rem',
                  minWidth: withLabel ? 'auto' : '1.65rem',
                  height: '1.65rem',
                  padding: withLabel ? '0 0.45rem' : '0',
                  borderRadius: '0.45rem',
                  border: '1px solid',
                  borderColor: isDanger ? '#fecaca' : isWarning ? '#fde68a' : DT.accent,
                  backgroundColor: isDanger ? DT.dangerSoft : isWarning ? '#fef3c7' : DT.accent,
                  color: isDanger ? DT.danger : isWarning ? '#b45309' : '#ffffff',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: withLabel ? '0.3rem' : '0',
                  whiteSpace: 'nowrap',
                  flexShrink: '0',
                  transition: 'transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease'
                });

              if (action.icon) {
                button.child(el('i').class(action.icon));
              } else if (!withLabel) {
                button.child(el('span').text((action.label || '?').charAt(0)));
              }
              if (withLabel && action.label) {
                button.child(
                  el('span').text(action.label).css({
                    fontSize: '0.7rem',
                    fontWeight: '600',
                    lineHeight: 1
                  })
                );
              }

              button.click(() => {
                if (action.confirm) {
                  if (typeof layout !== 'undefined' && layout.confirm) {
                    layout.confirm({
                      title: 'Confirm',
                      message: `Are you sure you want to ${action.label.toLowerCase()}?`,
                      onConfirm: () => action.onClick(row)
                    });
                  } else {
                    action.onClick(row);
                  }
                } else {
                  action.onClick(row);
                }
              });
              return button;
            };

            const appendGroup = (list) => {
              if (!list.length) return;
              const groupEl = el('div').css({
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                flexWrap: 'nowrap',
                flexShrink: '0'
              });
              list.forEach((action) => groupEl.child(renderActionButton(action)));
              actionsContainer.child(groupEl);
            };

            appendGroup(statusActions);
            if (statusActions.length && otherActions.length) {
              actionsContainer.child(el('span').text('|').css({
                color: '#cbd5e1',
                fontSize: '0.7rem',
                lineHeight: '1.65rem',
                flexShrink: '0',
                userSelect: 'none'
              }));
            }
            appendGroup(otherActions);

            td.child(actionsContainer);
          } else if (column.type === 'badge' || column.badgeMap) {
            const raw = row[column.key];
            const val = String(raw || '').trim().toUpperCase();
            const map = column.badgeMap?.[val] || column.badgeMap?.[raw] || null;
            const badgeStyle = {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.28rem',
              padding: '0.18rem 0.55rem',
              borderRadius: '999px',
              fontSize: '0.72rem',
              fontWeight: '700',
              letterSpacing: '0.01em',
              background: map?.bg || '#f1f5f9',
              color: map?.color || '#475569',
              border: `1px solid ${map?.border || '#e2e8f0'}`,
              whiteSpace: 'nowrap',
              lineHeight: 1.2
            };

            if (typeof column.badgeClick === 'function') {
              const badgeBtn = el('button')
                .attr('type', 'button')
                .attr('title', column.badgeClickTitle || 'Klik untuk ubah status')
                .attr('aria-label', column.badgeClickTitle || 'Ubah status')
                .css({
                  ...badgeStyle,
                  cursor: 'pointer',
                  transition: 'box-shadow 0.12s ease, transform 0.12s ease'
                });
              badgeBtn.child([
                el('span').text(map?.label || raw || '—'),
                el('i').class('fas fa-chevron-down').css({ fontSize: '0.55rem', opacity: '0.65' })
              ]);
              badgeBtn.click((e) => {
                e.stopPropagation();
                column.badgeClick(row, badgeBtn);
              });
              td.child(badgeBtn);
            } else {
              td.child(el('span').text(map?.label || raw || '—').css(badgeStyle));
            }
          } else if (column.type === 'docSlot') {
            const field = column.docField || column.key;
            const filePath = row[field];
            const hasFile = isDokumenFilePath(filePath);

            td.css({ textAlign: 'center' });

            const wrap = el('div').css({
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              flexWrap: 'nowrap'
            });

            wrap.child(
              el('span')
                .text(hasFile ? 'Ada' : 'Belum')
                .css({
                  fontSize: '0.7rem',
                  fontWeight: '600',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '999px',
                  background: hasFile ? '#dcfce7' : '#f1f5f9',
                  color: hasFile ? '#15803d' : '#64748b',
                  whiteSpace: 'nowrap'
                })
            );

            const uploadLabel = hasFile ? 'Ganti' : 'Upload';
            const uploadBtn = el('button')
              .attr('type', 'button')
              .attr('title', hasFile ? 'Ganti file' : 'Upload file')
              .css({
                height: '1.75rem',
                padding: '0 0.45rem',
                borderRadius: '0.375rem',
                border: '1px solid #bfdbfe',
                background: '#eff6ff',
                color: '#2563eb',
                cursor: 'pointer',
                fontSize: '0.7rem',
                fontWeight: '600',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.25rem',
                whiteSpace: 'nowrap'
              });
            uploadBtn.child(el('i').class('fas fa-cloud-arrow-up').css({ fontSize: '0.7rem' }));
            uploadBtn.child(el('span').text(uploadLabel));

            if (typeof column.onUpload === 'function') {
              uploadBtn.click((e) => {
                e.stopPropagation();
                column.onUpload(row);
              });
            }

            wrap.child(uploadBtn);
            td.child(wrap);
          } else if (column.type === 'currency') {
            const num = Number(row[column.key] || 0);
            td.css({ textAlign: column.align || 'right', fontWeight: '600' });
            td.text('Rp ' + num.toLocaleString('id-ID'));
          } else if (column.subKey) {
            const main = row[column.key];
            const sub = row[column.subKey];
            td.child(el('div').css({ lineHeight: 1.35 }).child([
              el('div').text(main || '—').css({ fontWeight: '600', color: '#0f172a', fontSize: '0.88rem' }),
              sub ? el('div').text(String(sub)).css({ fontSize: '0.72rem', color: '#64748b', marginTop: '0.1rem' }) : null
            ]));
          } else if (column.render) {
            td.html(column.render(row[column.key], row));
          } else {
            td.text(row[column.key] ?? '');
          }

          tr.child(td);
        });

        tbody.child(tr);
      });

      // Flush buffered children to DOM
      tbody.get();
    },

    // Create pagination buttons
    createPaginationButtons(schema, totalItems, currentPage, perPage, onPageChange) {
      const container = el('div').css({
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        flexWrap: 'wrap',
        justifyContent: 'flex-end'
      });

      const totalPages = Math.ceil(totalItems / perPage);

      // Info text
      container.child(
        el('span')
          .css({
            fontSize: '0.8125rem',
            color: DT.muted,
            marginRight: '0.65rem',
            padding: '0.25rem 0.6rem',
            backgroundColor: '#fff',
            borderRadius: '999px',
            border: '1px solid #e2e8f0',
            fontWeight: '500'
          })
          .text(`Halaman ${currentPage} / ${totalPages || 1} · ${totalItems} data`)
      );

      // Previous button
      const prevButton = el('button')
        .text('‹')
        .css({
          minWidth: '2rem',
          height: '2rem',
          padding: '0 0.5rem',
          borderRadius: '0.5rem',
          border: '1px solid #cbd5e1',
          backgroundColor: '#fff',
          color: currentPage === 1 ? '#94a3b8' : DT.text,
          cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
          fontSize: '1rem',
          lineHeight: '1',
          boxShadow: DT.shadowSm,
          transition: 'background-color 0.15s ease'
        });
      if (currentPage === 1) prevButton.attr('disabled', true);
      prevButton.click(() => {
        if (currentPage > 1) onPageChange(currentPage - 1);
      });

      container.child(prevButton);

      // Page numbers
      const maxButtons = 5;
      let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
      let endPage = Math.min(totalPages, startPage + maxButtons - 1);

      if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
      }

      if (startPage > 1) {
        container.child(this.createPageButton(1, currentPage, onPageChange));
        if (startPage > 2) {
          container.child(el('span').text('...').css({ color: '#6b7280' }));
        }
      }

      for (let i = startPage; i <= endPage; i++) {
        container.child(this.createPageButton(i, currentPage, onPageChange));
      }

      if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
          container.child(el('span').text('...').css({ color: '#6b7280' }));
        }
        container.child(this.createPageButton(totalPages, currentPage, onPageChange));
      }

      // Next button
      const nextButton = el('button')
        .text('›')
        .css({
          minWidth: '2rem',
          height: '2rem',
          padding: '0 0.5rem',
          borderRadius: '0.5rem',
          border: '1px solid #cbd5e1',
          backgroundColor: '#fff',
          color: currentPage === totalPages || totalPages === 0 ? '#94a3b8' : DT.text,
          cursor: currentPage === totalPages || totalPages === 0 ? 'not-allowed' : 'pointer',
          fontSize: '1rem',
          lineHeight: '1',
          boxShadow: DT.shadowSm,
          transition: 'background-color 0.15s ease'
        });
      if (currentPage === totalPages || totalPages === 0) nextButton.attr('disabled', true);
      nextButton.click(() => {
        if (currentPage < totalPages) onPageChange(currentPage + 1);
      });

      container.child(nextButton);

      return container;
    },

    // Create single page button
    createPageButton(page, currentPage, onPageChange) {
      const active = page === currentPage;
      return el('button')
        .text(page)
        .css({
          minWidth: '2rem',
          height: '2rem',
          padding: '0 0.35rem',
          borderRadius: '0.5rem',
          border: '1px solid',
          borderColor: active ? DT.accent : '#cbd5e1',
          backgroundColor: active ? DT.accent : '#fff',
          color: active ? '#fff' : DT.text,
          cursor: 'pointer',
          fontSize: '0.8125rem',
          fontWeight: active ? '600' : '500',
          lineHeight: '1',
          textAlign: 'center',
          boxShadow: active ? '0 2px 8px rgba(37, 99, 235, 0.35)' : DT.shadowSm,
          transition: 'all 0.15s ease'
        })
        .click(() => {
          if (page !== currentPage) {
            onPageChange(page);
          }
        });
    },

    // Render pagination
    renderPagination(container, schema, totalItems, currentPage, perPage, onPageChange) {
      // Remove old pagination buttons (keep per-page selector = first child)
      const children = container.el.children;
      // Remove all children except the first one (perPageContainer)
      while (children.length > 1) {
        children[children.length - 1].remove();
      }

      // Create new pagination
      const pagination = this.createPaginationButtons(
        schema,
        totalItems,
        currentPage,
        perPage,
        onPageChange || (() => {})
      );

      container.ch = [];
      container.child(pagination);
      container.get();
    }
  };

  return TableBuilder;
}));
