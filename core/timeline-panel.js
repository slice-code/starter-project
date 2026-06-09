(function (global) {
  'use strict';

  const TimelinePanel = {
    async open(apiClient, entityType, row) {
      const id = row.id;
      const label = row.full_name || row.title || row.company_name
        || row.customer_code || row.lead_code || row.deal_code
        || `${row.first_name || ''} ${row.last_name || ''}`.trim()
        || `#${id}`;

      const overlay = el('div').css({
        position: 'fixed',
        inset: '0',
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        zIndex: '9999',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      });

      const panel = el('div').css({
        backgroundColor: '#fff',
        borderRadius: '0.875rem',
        width: 'min(520px, 100%)',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 50px rgba(15, 23, 42, 0.2)',
        overflow: 'hidden'
      });

      const header = el('div').css({
        padding: '1rem 1.25rem',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      });
      header.child(
        (() => {
          const ht = el('div').css({ minWidth: 0 });
          ht.child(el('h3').text('Timeline 360°').css({ margin: 0, fontSize: '1.05rem', fontWeight: '700' }));
          ht.child(el('p').text(`${entityType}: ${label}`).css({ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#64748b' }));
          return ht;
        })()
      );
      const closeBtn = el('button').attr('type', 'button').text('×').css({
        border: 'none',
        background: '#f1f5f9',
        width: '2rem',
        height: '2rem',
        borderRadius: '0.5rem',
        cursor: 'pointer',
        fontSize: '1.25rem',
        lineHeight: '1'
      });
      header.child(closeBtn);
      panel.child(header);

      const body = el('div').css({
        padding: '1rem 1.25rem',
        overflowY: 'auto',
        flex: '1'
      });
      body.child(el('p').text('Loading timeline...').css({ color: '#64748b', fontSize: '0.875rem' }));
      panel.child(body);
      overlay.child(panel);

      const close = () => overlay.get()?.remove();
      closeBtn.click(close);
      overlay.click((e) => { if (e.target === overlay.get()) close(); });

      document.body.appendChild(overlay.get());

      try {
        const res = await apiClient.request(`/timeline?entity_type=${encodeURIComponent(entityType)}&entity_id=${id}`);
        body.empty();
        const items = res.data || [];
        if (!items.length) {
          body.child(el('p').text('No activities or logs for this record yet.').css({ color: '#94a3b8', fontSize: '0.875rem' }));
          return;
        }

        items.forEach((item) => {
          const rowEl = el('div').css({
            display: 'flex',
            gap: '0.75rem',
            padding: '0.65rem 0',
            borderBottom: '1px solid #f1f5f9'
          });
          const dot = el('div').css({
            width: '0.5rem',
            height: '0.5rem',
            borderRadius: '999px',
            marginTop: '0.4rem',
            flexShrink: '0',
            backgroundColor: item.kind === 'activity' ? '#2563eb' : '#94a3b8'
          });
          const content = el('div').css({ flex: '1', minWidth: 0 });
          content.child(el('div').text(item.title || '—').css({ fontWeight: '600', fontSize: '0.875rem', color: '#0f172a' }));
          content.child(el('div').text(item.subtitle || '').css({ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }));
          if (item.date) {
            content.child(el('div').text(String(item.date)).css({ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.2rem' }));
          }
          rowEl.child(dot);
          rowEl.child(content);
          body.child(rowEl);
        });
      } catch (err) {
        body.empty();
        body.child(el('p').text(err.message || 'Failed to load timeline').css({ color: '#dc2626' }));
      }
    }
  };

  global.TimelinePanel = TimelinePanel;
})(typeof window !== 'undefined' ? window : global);
