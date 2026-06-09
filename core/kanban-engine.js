(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
      (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.KanbanEngine = factory());
})(this, (function () {
  'use strict';

  const KanbanEngine = {
    getStageField(schema, cardFields) {
      const kanban = schema.kanban || {};
      return kanban.stageField || cardFields.stage || (schema.resource === 'leads' ? 'status' : 'stage');
    },

    getPatchEndpoint(resource, stageField) {
      const segment = resource === 'leads' || stageField === 'status' ? 'status' : 'stage';
      return `${resource}`;
    },

    build(schema, options = {}) {
      const {
        apiClient = null,
        crudInstance = null,
        onRefresh = null
      } = options;

      const kanbanConfig = schema.kanban || {};
      const columns = kanbanConfig.columns || [];
      const cardFields = kanbanConfig.cardFields || {};
      const features = kanbanConfig.features || {};
      const stageField = this.getStageField(schema, cardFields);

      const ctx = {
        schema,
        apiClient,
        crudInstance,
        cardFields,
        features,
        stageField,
        boardData: {},
        columnElements: {},
        draggedCard: null,
        draggedFromColumn: null,
        searchQuery: '',
        allBoardData: {}
      };

      const boardContainer = el('div').css({
        display: 'flex',
        flexDirection: 'column',
        flex: '1',
        overflow: 'hidden',
        height: '100%'
      });

      const boardArea = el('div').css({
        display: 'flex',
        gap: '1rem',
        overflowX: 'auto',
        overflowY: 'hidden',
        padding: '1rem',
        flex: '1',
        minHeight: '0'
      });

      columns.forEach(column => {
        const columnEl = this.createColumn(column, ctx);
        ctx.columnElements[column.key] = columnEl;
        boardArea.child(columnEl.container);
      });

      boardContainer.child(this.createHeader(schema, ctx));
      boardContainer.child(boardArea);

      const refresh = () => this.loadBoardData(ctx);

      if (apiClient) {
        refresh();
      }

      return {
        el: boardContainer,
        get: () => boardContainer.get(),
        refresh,
        getData: () => ctx.boardData
      };
    },

    createHeader(schema, ctx) {
      const header = el('div').css({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.75rem 1rem',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#fff',
        flexShrink: '0',
        zIndex: '10'
      });

      header.child(el('h2').text(schema.title || 'Pipeline').css({
        margin: '0',
        fontSize: '1.25rem',
        fontWeight: '600',
        color: '#111827',
        whiteSpace: 'nowrap',
        flexShrink: '0'
      }));

      if (ctx.features.search !== false) {
        let debounceTimer = null;
        header.child(
          el('input')
            .attr('type', 'text')
            .attr('placeholder', 'Search cards...')
            .css({
              flex: '1',
              minWidth: '200px',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem'
            })
            .on('input', (e) => {
              clearTimeout(debounceTimer);
              debounceTimer = setTimeout(() => {
                ctx.searchQuery = (e.target.value || '').toLowerCase().trim();
                this.applySearchFilter(ctx);
              }, 300);
            })
        );
      }

      const createBtn = el('button')
        .css({
          padding: '0.5rem 1rem',
          borderRadius: '0.5rem',
          border: 'none',
          backgroundColor: '#2563eb',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flexShrink: '0'
        })
        .child([el('i').class('fas fa-plus'), el('span').text('Add')]);

      createBtn.click(() => {
        if (ctx.crudInstance && ctx.crudInstance.openCreateModal) {
          ctx.crudInstance.openCreateModal();
        } else if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('Create form is not available', { type: 'info' });
        }
      });
      header.child(createBtn);

      return header;
    },

    createColumn(column, ctx) {
      const columnContainer = el('div').css({
        minWidth: '300px',
        maxWidth: '300px',
        backgroundColor: '#f1f5f9',
        borderRadius: '0.5rem',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '100%',
        flexShrink: '0'
      });

      const columnHeader = el('div').css({
        padding: '1rem',
        borderBottom: `2px solid ${column.color || '#3b82f6'}`,
        backgroundColor: '#fff',
        borderRadius: '0.5rem 0.5rem 0 0'
      });

      const countBadge = el('span').text('0').css({
        padding: '0.2rem 0.5rem',
        borderRadius: '9999px',
        backgroundColor: '#e5e7eb',
        fontSize: '0.75rem',
        fontWeight: '600',
        color: '#6b7280'
      });

      columnHeader.child(
        el('div').css({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }).child([
          el('h3').text(column.label).css({ margin: '0', fontSize: '0.95rem', fontWeight: '600', color: '#1f2937' }),
          countBadge
        ])
      );

      let wipWarning = null;
      if (ctx.features.wipLimits && column.wipLimit) {
        wipWarning = el('div').css({ fontSize: '0.75rem', display: 'none' });
        columnHeader.child(wipWarning);
      }

      let totalValue = null;
      if (ctx.features.columnTotals) {
        totalValue = el('div').css({ fontSize: '0.875rem', fontWeight: '600', color: column.color || '#3b82f6' });
        columnHeader.child(totalValue);
      }

      columnContainer.child(columnHeader);

      const columnBody = el('div').css({
        flex: '1',
        overflowY: 'auto',
        padding: '0.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        minHeight: '100px'
      });

      columnBody.on('dragover', (e) => {
        e.preventDefault();
        columnContainer.css({ backgroundColor: '#e0e7ff', border: '2px dashed #3b82f6' });
      });

      columnBody.on('dragleave', () => {
        columnContainer.css({ backgroundColor: '#f1f5f9', border: 'none' });
      });

      columnBody.on('drop', (e) => {
        e.preventDefault();
        columnContainer.css({ backgroundColor: '#f1f5f9', border: 'none' });
        if (ctx.draggedCard) {
          const oldStage = ctx.draggedFromColumn;
          const newStage = column.key;
          this.handleCardDrop(ctx, ctx.draggedCard, oldStage, newStage);
        }
      });

      columnContainer.child(columnBody);

      return {
        container: columnContainer,
        body: columnBody,
        countBadge,
        wipWarning,
        totalValue,
        column
      };
    },

    cardMatchesSearch(card, query, cardFields) {
      if (!query) return true;
      const keys = [
        cardFields.title,
        cardFields.subtitle,
        cardFields.value,
        'email',
        'deal_code',
        'lead_code'
      ].filter(Boolean);
      return keys.some(k => String(card[k] || '').toLowerCase().includes(query));
    },

    applySearchFilter(ctx) {
      const filtered = {};
      Object.keys(ctx.allBoardData).forEach(colKey => {
        filtered[colKey] = (ctx.allBoardData[colKey] || []).filter(card =>
          this.cardMatchesSearch(card, ctx.searchQuery, ctx.cardFields)
        );
      });
      ctx.boardData = filtered;
      this.renderBoard(ctx);
    },

    createCard(card, ctx, columnColor) {
      const { cardFields, features, stageField } = ctx;
      const cardEl = el('div').css({
        backgroundColor: '#fff',
        borderRadius: '0.375rem',
        padding: '0.75rem',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        cursor: features.dragDrop !== false ? 'grab' : 'pointer',
        border: '1px solid #e5e7eb'
      });

      if (features.dragDrop !== false) {
        cardEl.attr('draggable', 'true');
        cardEl.on('dragstart', (e) => {
          ctx.draggedCard = card;
          ctx.draggedFromColumn = card[stageField];
          cardEl.css({ opacity: '0.5' });
          e.dataTransfer.effectAllowed = 'move';
        });
        cardEl.on('dragend', () => {
          cardEl.css({ opacity: '1' });
          ctx.draggedCard = null;
          ctx.draggedFromColumn = null;
        });
      }

      const titleField = cardFields.title || 'title';
      if (card[titleField]) {
        cardEl.child(el('div').text(card[titleField]).css({
          fontSize: '0.875rem',
          fontWeight: '600',
          color: '#1f2937',
          marginBottom: '0.35rem'
        }));
      }

      const subtitleField = cardFields.subtitle;
      if (subtitleField && card[subtitleField]) {
        cardEl.child(el('div').text(card[subtitleField]).css({
          fontSize: '0.75rem',
          color: '#6b7280',
          marginBottom: '0.35rem'
        }));
      }

      const valueField = cardFields.value;
      if (valueField && card[valueField] != null && card[valueField] !== '') {
        const currency = card[cardFields.currency] || '$';
        cardEl.child(el('div').text(`${currency}${parseFloat(card[valueField]).toLocaleString()}`).css({
          fontSize: '0.875rem',
          fontWeight: '700',
          color: columnColor || '#3b82f6'
        }));
      }

      if (features.cardClick === 'edit') {
        cardEl.click(() => {
          if (ctx.crudInstance && ctx.crudInstance.openEditModal) {
            ctx.crudInstance.openEditModal(card);
          }
        });
      }

      return cardEl;
    },

    async loadBoardData(ctx) {
      if (!ctx.apiClient) return;

      const resource = ctx.schema.resource;
      const stageField = ctx.stageField;

      try {
        let response;
        try {
          response = await ctx.apiClient.read(`${resource}/kanban`);
        } catch (e) {
          response = await ctx.apiClient.read(`${resource}?perPage=500`);
        }

        const grouped = {};
        Object.keys(ctx.columnElements).forEach(k => { grouped[k] = []; });

        if (response.data && !Array.isArray(response.data) && typeof response.data === 'object') {
          Object.keys(response.data).forEach(key => {
            if (grouped[key]) grouped[key] = response.data[key];
          });
        } else {
          let items = [];
          if (response.data && Array.isArray(response.data)) items = response.data;
          else if (Array.isArray(response)) items = response;

          items.forEach(item => {
            const stage = item[stageField];
            if (stage && grouped[stage]) grouped[stage].push(item);
          });
        }

        ctx.allBoardData = grouped;
        ctx.searchQuery = '';
        ctx.boardData = grouped;
        this.applySearchFilter(ctx);
      } catch (error) {
        console.error('Error loading kanban:', error);
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('Failed to load board', { type: 'error' });
        }
      }
    },

    renderBoard(ctx) {
      const { boardData, columnElements, cardFields, features } = ctx;

      Object.keys(columnElements).forEach(colKey => {
        const column = columnElements[colKey];
        const cards = boardData[colKey] || [];

        column.body.empty();
        cards.forEach(card => {
          column.body.child(this.createCard(card, ctx, column.column.color));
        });
        column.body.get();

        column.countBadge.text(String(cards.length));

        if (column.totalValue && cardFields.value) {
          const total = cards.reduce((sum, c) => sum + (parseFloat(c[cardFields.value]) || 0), 0);
          const currency = cards[0]?.[cardFields.currency] || '$';
          column.totalValue.text(`${currency}${total.toLocaleString()}`);
        }

        if (column.wipWarning && column.column.wipLimit) {
          const count = cards.length;
          const limit = column.column.wipLimit;
          if (count > limit) {
            column.wipWarning.text(`WIP exceeded: ${count}/${limit}`).css({ display: 'block', color: '#dc2626' });
          } else if (count >= limit * 0.8) {
            column.wipWarning.text(`${count}/${limit}`).css({ display: 'block', color: '#f59e0b' });
          } else {
            column.wipWarning.css({ display: 'none' });
          }
        }
      });
    },

    async handleCardDrop(ctx, card, oldStage, newStage) {
      if (!ctx.apiClient || oldStage === newStage) return;

      const resource = ctx.schema.resource;
      const cardId = card.id;
      const stageField = ctx.stageField;
      const patchSegment = resource === 'leads' ? 'status' : 'stage';

      const prevData = JSON.parse(JSON.stringify(ctx.allBoardData));

      // Optimistic UI
      if (ctx.allBoardData[oldStage]) {
        ctx.allBoardData[oldStage] = ctx.allBoardData[oldStage].filter(c => c.id !== cardId);
      }
      if (!ctx.allBoardData[newStage]) ctx.allBoardData[newStage] = [];
      const moved = { ...card, [stageField]: newStage };
      ctx.allBoardData[newStage].unshift(moved);
      this.applySearchFilter(ctx);

      try {
        await ctx.apiClient.patch(`${resource}/${cardId}/${patchSegment}`, {
          [stageField]: newStage
        });
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('Card moved', { type: 'success', duration: 2000 });
        }
      } catch (error) {
        console.error('Error moving card:', error);
        ctx.allBoardData = prevData;
        this.applySearchFilter(ctx);
        if (typeof layout !== 'undefined' && layout.toast) {
          layout.toast('Failed to move card', { type: 'error' });
        }
      }
    }
  };

  return KanbanEngine;
}));
