(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
      (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.UiBuilder = factory());
})(this, (function () {
  'use strict';

  const UiBuilder = {
    // Component registry
    components: {},

    // Register custom component
    registerComponent(type, renderer) {
      this.components[type] = renderer;
    },

    // Build UI from JSON schema
    build(schema, options = {}) {
      const {
        data = {},
        actions = {},
        apiClient = null
      } = options;

      return this.renderComponent(schema, { data, actions, apiClient });
    },

    // Render single component
    renderComponent(componentSchema, context) {
      const { data, actions, apiClient } = context;
      const type = componentSchema?.type;

      // Handle undefined/null type
      if (!type) {
        console.warn('Component schema missing type:', componentSchema);
        return el('div').css({ padding: '1rem', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '0.5rem' })
          .text('⚠️ Component type is missing');
      }

      // Check if custom component
      if (this.components[type]) {
        return this.components[type](componentSchema, context);
      }

      // Built-in components
      switch (type) {
        case 'page':
          return this.renderPage(componentSchema, context);
        case 'card':
          return this.renderCard(componentSchema, context);
        case 'grid':
          return this.renderGrid(componentSchema, context);
        case 'form':
          return this.renderForm(componentSchema, context);
        case 'table':
          return this.renderTable(componentSchema, context);
        case 'crud':
          return this.renderCrud(componentSchema, context);
        case 'button':
          return this.renderButton(componentSchema, context);
        case 'text':
          return this.renderText(componentSchema, context);
        case 'heading':
          return this.renderHeading(componentSchema, context);
        case 'stats':
          return this.renderStats(componentSchema, context);
        case 'divider':
          return this.renderDivider(componentSchema, context);
        case 'spacer':
          return this.renderSpacer(componentSchema, context);
        case 'custom':
          return this.renderCustom(componentSchema, context);
        default:
          console.warn(`Unknown component type: ${type}`);
          return el('div').css({ padding: '1rem', backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '0.5rem' })
            .text(`⚠️ Unknown component: ${type}`);
      }
    },

    // Page component
    renderPage(schema, context) {
      const container = el('div').css({
        display: 'flex',
        flexDirection: 'column',
        gap: schema.gap || '1.5rem'
      });

      // Title
      if (schema.title) {
        container.child(
          el('h1')
            .text(schema.title)
            .css({
              margin: '0',
              fontSize: '2rem',
              fontWeight: '700',
              color: '#111827'
            })
        );
      }

      // Subtitle
      if (schema.subtitle) {
        container.child(
          el('p')
            .text(schema.subtitle)
            .css({
              margin: '0',
              fontSize: '1rem',
              color: '#6b7280'
            })
        );
      }

      // Children components
      if (schema.children && schema.children.length > 0) {
        schema.children.forEach((child, index) => {
          if (!child) {
            console.warn(`Child at index ${index} is null/undefined`);
            return;
          }
          container.child(this.renderComponent(child, context));
        });
      }

      return container;
    },

    // Card component
    renderCard(schema, context) {
      const card = el('div').css({
        backgroundColor: '#fff',
        borderRadius: '0.75rem',
        border: '1px solid #e5e7eb',
        padding: schema.padding || '1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      });

      // Header
      if (schema.title || schema.header) {
        const header = el('div').css({
          marginBottom: '1rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid #e5e7eb'
        });

        if (schema.title) {
          header.child(
            el('h3')
              .text(schema.title)
              .css({
                margin: '0',
                fontSize: '1.25rem',
                fontWeight: '600',
                color: '#111827'
              })
          );
        }

        if (schema.header) {
          header.child(this.renderComponent(schema.header, context));
        }

        card.child(header);
      }

      // Content/children
      if (schema.children && schema.children.length > 0) {
        const content = el('div').css({
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        });

        schema.children.forEach((child, index) => {
          if (!child) {
            console.warn(`Card child at index ${index} is null/undefined`);
            return;
          }
          content.child(this.renderComponent(child, context));
        });

        card.child(content);
      }

      // Footer
      if (schema.footer) {
        const footer = el('div').css({
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid #e5e7eb'
        });

        footer.child(this.renderComponent(schema.footer, context));
        card.child(footer);
      }

      return card;
    },

    // Grid component
    renderGrid(schema, context) {
      const grid = el('div').css({
        display: 'grid',
        gap: schema.gap || '1rem',
        gridTemplateColumns: schema.columns || 'repeat(auto-fit, minmax(250px, 1fr))'
      });

      if (schema.children && schema.children.length > 0) {
        schema.children.forEach((child, index) => {
          if (!child) {
            console.warn(`Grid child at index ${index} is null/undefined`);
            return;
          }
          grid.child(this.renderComponent(child, context));
        });
      }

      return grid;
    },

    // Form component
    renderForm(schema, context) {
      const { actions, apiClient } = context;

      return FormBuilder.build(schema, {
        onSubmit: async (formData) => {
          if (schema.onSubmit) {
            await schema.onSubmit(formData);
          }
          if (actions.onSubmit) {
            await actions.onSubmit(formData);
          }
        },
        onCancel: () => {
          if (schema.onCancel) {
            schema.onCancel();
          }
          if (actions.onCancel) {
            actions.onCancel();
          }
        },
        initialData: schema.initialData || {},
        apiClient
      }).el;
    },

    // Table component
    renderTable(schema, context) {
      const { data = [], actions, apiClient } = context;

      return TableBuilder.build(schema, {
        data,
        ...actions,
        apiClient
      }).el;
    },

    // CRUD component
    renderCrud(schema, context) {
      const { apiClient } = context;

      return CrudEngine.build(schema, {
        apiClient
      }).el;
    },

    // Button component
    renderButton(schema, context) {
      const { actions } = context;

      const button = el('button')
        .text(schema.text || 'Button')
        .css({
          padding: schema.padding || '0.65rem 1.25rem',
          borderRadius: schema.borderRadius || '0.5rem',
          border: schema.variant === 'outline' ? '1px solid #d1d5db' : 'none',
          backgroundColor: this.getButtonBackgroundColor(schema.variant),
          color: this.getButtonTextColor(schema.variant),
          cursor: 'pointer',
          fontSize: schema.fontSize || '0.95rem',
          fontWeight: '500',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem'
        });

      if (schema.icon) {
        button.child(el('i').class(schema.icon));
      }

      // Handle action string (e.g., "navigate:/full")
      if (schema.action && typeof schema.action === 'string') {
        const [actionType, actionValue] = schema.action.split(':');
        
        if (actionType === 'navigate' && typeof layout !== 'undefined') {
          button.click(() => {
            layout.navigate(actionValue);
          });
        } else if (actions[actionType]) {
          button.click(() => {
            actions[actionType](actionValue);
          });
        }
      }
      // Handle onClick function
      else if (schema.onClick) {
        button.click(schema.onClick);
      }
      // Handle action from actions object
      else if (actions[schema.action]) {
        button.click(actions[schema.action]);
      }

      if (schema.disabled) {
        button.attr('disabled', 'disabled').css({ opacity: '0.5', cursor: 'not-allowed' });
      }

      return button;
    },

    // Text component
    renderText(schema, context) {
      const { data } = context;
      const text = this.resolveData(schema.text, data);

      return el('p')
        .text(text)
        .css({
          margin: '0',
          fontSize: schema.fontSize || '1rem',
          color: schema.color || '#374151',
          lineHeight: schema.lineHeight || '1.5'
        });
    },

    // Heading component
    renderHeading(schema, context) {
      const { data } = context;
      const text = this.resolveData(schema.text, data);
      const level = schema.level || 2;

      const heading = el(`h${level}`)
        .text(text)
        .css({
          margin: '0',
          fontSize: schema.fontSize || this.getHeadingFontSize(level),
          fontWeight: schema.fontWeight || '600',
          color: schema.color || '#111827'
        });

      return heading;
    },

    // Stats component
    renderStats(schema, context) {
      const grid = el('div').css({
        display: 'grid',
        gap: schema.gap || '1rem',
        gridTemplateColumns: schema.columns || 'repeat(auto-fit, minmax(220px, 1fr))'
      });

      if (schema.items && schema.items.length > 0) {
        schema.items.forEach(stat => {
          const accent = stat.color || '#2563eb';
          const statCard = el('div').css({
            backgroundColor: '#fff',
            borderRadius: '0.875rem',
            border: '1px solid #e2e8f0',
            padding: '1.25rem 1.35rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
            transition: 'box-shadow 0.2s, transform 0.2s',
            cursor: stat.action ? 'pointer' : 'default'
          });

          const topRow = el('div').css({
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '0.75rem'
          });

          if (stat.icon) {
            topRow.child(
              el('div').css({
                width: '2.75rem',
                height: '2.75rem',
                borderRadius: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `${accent}18`,
                flexShrink: '0'
              }).child(
                el('i').class(stat.icon).css({ fontSize: '1.15rem', color: accent })
              )
            );
          }

          const textCol = el('div').css({
            flex: '1',
            minWidth: '0',
            textAlign: stat.icon ? 'right' : 'left'
          });

          textCol.child(
            el('div').text(String(stat.value ?? '—')).css({
              fontSize: '1.75rem',
              fontWeight: '800',
              color: '#0f172a',
              lineHeight: '1.1',
              letterSpacing: '-0.02em'
            })
          );

          textCol.child(
            el('div').text(stat.label).css({
              fontSize: '0.8125rem',
              color: '#64748b',
              marginTop: '0.2rem',
              fontWeight: '500'
            })
          );

          if (stat.subtext) {
            textCol.child(
              el('div').text(stat.subtext).css({
                fontSize: '0.75rem',
                color: '#94a3b8',
                marginTop: '0.15rem'
              })
            );
          }

          topRow.child(textCol);
          statCard.child(topRow);

          if (stat.action && typeof stat.action === 'string') {
            const [actionType, actionValue] = stat.action.split(':');
            if (actionType === 'navigate' && typeof layout !== 'undefined') {
              statCard.click(() => layout.navigate(actionValue));
              statCard.on('mouseenter', function () {
                this.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.1)';
                this.style.transform = 'translateY(-2px)';
              });
              statCard.on('mouseleave', function () {
                this.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.06)';
                this.style.transform = 'translateY(0)';
              });
            }
          }

          grid.child(statCard);
        });
      }

      return grid;
    },

    // Divider component
    renderDivider(schema, context) {
      return el('hr').css({
        border: 'none',
        borderTop: schema.style || '1px solid #e5e7eb',
        margin: schema.margin || '1rem 0'
      });
    },

    // Spacer component
    renderSpacer(schema, context) {
      return el('div').css({
        height: schema.height || '1rem'
      });
    },

    // Custom component
    renderCustom(schema, context) {
      if (schema.render && typeof schema.render === 'function') {
        return schema.render(context.data, context);
      }
      return el('div').text('Custom component without render function');
    },

    // Utility: Resolve data bindings
    resolveData(text, data) {
      if (!text || typeof text !== 'string') return text;
      
      // Replace {{key}} with data.value
      return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return data[key] !== undefined ? data[key] : match;
      });
    },

    // Utility: Get button background color
    getButtonBackgroundColor(variant) {
      const colors = {
        primary: '#2563eb',
        secondary: '#6b7280',
        success: '#16a34a',
        danger: '#dc2626',
        warning: '#f59e0b',
        info: '#0ea5e9',
        outline: '#fff',
        ghost: 'transparent'
      };
      return colors[variant] || colors.primary;
    },

    // Utility: Get button text color
    getButtonTextColor(variant) {
      const colors = {
        primary: '#fff',
        secondary: '#fff',
        success: '#fff',
        danger: '#fff',
        warning: '#fff',
        info: '#fff',
        outline: '#374151',
        ghost: '#374151'
      };
      return colors[variant] || colors.primary;
    },

    // Utility: Get heading font size
    getHeadingFontSize(level) {
      const sizes = {
        1: '2.5rem',
        2: '2rem',
        3: '1.5rem',
        4: '1.25rem',
        5: '1.125rem',
        6: '1rem'
      };
      return sizes[level] || sizes[2];
    }
  };

  return UiBuilder;
}));
