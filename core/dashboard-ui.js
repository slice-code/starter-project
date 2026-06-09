(function (global) {
  'use strict';

  function navButton(label, icon, path) {
    return el('button')
      .attr('type', 'button')
      .css({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        padding: '0.55rem 1rem',
        borderRadius: '0.55rem',
        border: '1px solid rgba(255,255,255,0.25)',
        background: 'rgba(255,255,255,0.12)',
        color: '#fff',
        fontWeight: '600',
        fontSize: '0.8125rem',
        cursor: 'pointer'
      })
      .child([
        el('i').class(icon),
        el('span').text(label)
      ])
      .click(() => layout.navigate(path));
  }

  function statCard({ icon, label, value, color }) {
    return el('div').css({
      padding: '1.1rem 1.25rem',
      borderRadius: '0.85rem',
      background: '#fff',
      border: '1px solid #e2e8f0',
      boxShadow: '0 4px 16px rgba(15,23,42,0.04)'
    }).child([
      el('div').css({ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem' }).child([
        el('div').css({
          width: '36px',
          height: '36px',
          borderRadius: '0.55rem',
          background: color || '#ecfeff',
          color: '#0e7490',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }).child(el('i').class(icon)),
        el('span').text(label).css({ fontSize: '0.8125rem', color: '#64748b', fontWeight: '600' })
      ]),
      el('div').text(String(value ?? '—')).css({ fontSize: '1.65rem', fontWeight: '800', color: '#0f172a', lineHeight: '1.1' })
    ]);
  }

  function buildAdminDashboard() {
    const root = el('div').css({
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem',
      maxWidth: '1100px',
      margin: '0 auto',
      width: '100%'
    });

    const appName = (typeof window !== 'undefined' && window.adminApp?.branding?.appName) || 'Admin Starter';

    const hero = el('div').css({
      borderRadius: '1rem',
      padding: '1.75rem 2rem',
      background: 'linear-gradient(155deg, #164e63 0%, #155e75 38%, #0e7490 100%)',
      color: '#fff',
      boxShadow: '0 12px 40px rgba(14,116,144,0.22)'
    }).child([
      el('p').text('Selamat datang').css({ margin: '0 0 0.35rem', fontSize: '0.8rem', opacity: '0.85', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '600' }),
      el('h1').text(appName).css({ margin: '0 0 0.5rem', fontSize: 'clamp(1.35rem, 3vw, 1.85rem)', fontWeight: '800' }),
      el('p').text('Starter template admin berbasis JSON. Tambah halaman CRUD lewat appjson + schema.').css({ margin: '0 0 1.25rem', fontSize: '0.9375rem', opacity: '0.9', maxWidth: '36rem', lineHeight: '1.55' }),
      el('div').css({ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }).child([
        navButton('Kategori', 'fas fa-tags', '/categories'),
        navButton('Pengguna', 'fas fa-user-shield', '/users'),
        navButton('Tentang', 'fas fa-circle-info', '/about')
      ])
    ]);
    root.child(hero);

    const statsSlot = el('div').css({
      display: 'grid',
      gap: '1rem',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'
    });
    statsSlot.child(el('div').text('Memuat...').css({ color: '#64748b', padding: '1rem' }));
    root.child(statsSlot);

    const tips = el('div').css({
      padding: '1.25rem 1.5rem',
      borderRadius: '0.85rem',
      background: '#f8fafc',
      border: '1px solid #e2e8f0'
    }).child([
      el('h3').text('Quick start').css({ margin: '0 0 0.65rem', fontSize: '1rem', fontWeight: '700', color: '#0f172a' }),
      el('ol').css({ margin: 0, paddingLeft: '1.25rem', color: '#475569', fontSize: '0.875rem', lineHeight: '1.7' }).child([
        el('li').text('Duplikasi appjson/categories.json + schema/categories.json'),
        el('li').text('Tambah menu di config/menu-config.json'),
        el('li').text('Jalankan npm run menu:sync dan restart server')
      ])
    ]);
    root.child(tips);

    fetch(`${window.location.origin}/api/dashboard`, { credentials: 'include' })
      .then((r) => r.json())
      .then((res) => {
        statsSlot.empty();
        const d = res.success ? res.data : {};
        statsSlot.child([
          statCard({ icon: 'fas fa-users', label: 'Pengguna', value: d.users ?? 0, color: '#eff6ff' }),
          statCard({ icon: 'fas fa-code-branch', label: 'Cabang', value: d.branches ?? 0, color: '#f0fdf4' }),
          statCard({ icon: 'fas fa-tags', label: 'Kategori', value: d.categories ?? 0, color: '#ecfeff' }),
          statCard({ icon: 'fas fa-table', label: 'Resource', value: d.resources ?? 0, color: '#fef3c7' })
        ]);
        statsSlot.get();
      })
      .catch(() => {
        statsSlot.empty();
        statsSlot.child(el('div').text('Statistik tidak dimuat.').css({ color: '#94a3b8', padding: '0.5rem' }));
        statsSlot.get();
      });

    return root;
  }

  if (typeof UiBuilder !== 'undefined') {
    UiBuilder.registerComponent('admin-dashboard', () => buildAdminDashboard().get());
  }

  global.AdminDashboard = { buildAdminDashboard };
})(typeof window !== 'undefined' ? window : global);
