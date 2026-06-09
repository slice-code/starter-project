/**
 * Menu Role Manager — lihat menu & izin Create / Update / Delete per role (read-only)
 * Sumber konfigurasi: config/menu-config.json (edit manual oleh developer)
 */
function initMenuRoleManager(container) {
  if (!container) return;

  const allRoles = [
    { value: 'admin', label: 'Administrator' }
  ];

  let menuConfig = { sideMenu: [] };
  let currentRole = 'admin';
  /** @type {Map<string, { enabled: boolean, can_create: boolean, can_update: boolean, can_delete: boolean, name: string, parent_path: string|null }>} */
  let menuStates = new Map();
  let viewMeta = {
    readOnly: true,
    fullAccess: false,
    source: 'config/menu-config.json',
    note: null,
    description: null
  };
  let loading = true;

  function defaultState(name, parentPath = null) {
    return {
      enabled: false,
      can_create: false,
      can_update: false,
      can_delete: false,
      name: name || '',
      parent_path: parentPath
    };
  }

  function getState(path) {
    return menuStates.get(path) || defaultState('');
  }

  async function loadMenuConfig() {
    const res = await fetch('/api/menu?master=1', { credentials: 'include' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Gagal memuat daftar menu');
    return json.data || { sideMenu: [] };
  }

  async function loadRoleMapping(role) {
    const res = await fetch(`/api/menu/role-mapping?role=${encodeURIComponent(role)}`, {
      credentials: 'include'
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Gagal memuat mapping menu');

    const data = json.data || {};
    viewMeta = {
      readOnly: data.readOnly !== false,
      fullAccess: !!data.fullAccess,
      source: data.source || 'config/menu-config.json',
      note: data.note || null,
      description: data.description || null
    };

    const states = new Map();
    const metaByPath = new Map();
    collectAllPaths(menuConfig.sideMenu).forEach(({ path, name, parent_path }) => {
      metaByPath.set(path, { name, parent_path });
    });

    if (data.fullAccess) {
      collectAllPaths(menuConfig.sideMenu).forEach(({ path, name, parent_path }) => {
        states.set(path, {
          enabled: true,
          can_create: true,
          can_update: true,
          can_delete: true,
          name: name || path,
          parent_path: parent_path
        });
      });
      return states;
    }

    const perms = data.menuPermissions || {};
    for (const [menuPath, flags] of Object.entries(perms)) {
      const meta = metaByPath.get(menuPath) || {};
      states.set(menuPath, {
        enabled: true,
        can_create: !!flags.can_create,
        can_update: !!flags.can_update,
        can_delete: !!flags.can_delete,
        name: meta.name || menuPath,
        parent_path: meta.parent_path ?? null
      });
    }

    return states;
  }

  function injectStyles() {
    if (document.getElementById('menu-role-manager-styles')) return;
    const style = document.createElement('style');
    style.id = 'menu-role-manager-styles';
    style.textContent = `
      .menu-role-manager { font-family: inherit; color: #1e293b; }
      .menu-role-manager .manager-header { margin-bottom: 1.5rem; }
      .menu-role-manager .manager-header h2 { margin: 0 0 0.25rem; font-size: 1.5rem; }
      .menu-role-manager .subtitle { margin: 0; color: #64748b; font-size: 0.9rem; }
      .menu-role-manager .manager-content {
        display: grid; gap: 1.25rem;
        background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.25rem;
      }
      .menu-role-manager .role-selector select { width: 100%; max-width: 320px; margin: 0.5rem 0 1rem; padding: 0.5rem; }
      .menu-role-manager .menu-tree {
        max-height: 480px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem;
      }
      .menu-role-manager .menu-group-label { font-weight: 600; color: #475569; margin: 0.5rem 0 0.25rem; font-size: 0.85rem; }
      .menu-role-manager .menu-row {
        display: grid;
        grid-template-columns: minmax(200px, 1fr) repeat(3, 88px);
        align-items: center; gap: 0.5rem;
        padding: 0.45rem 0; border-bottom: 1px solid #f1f5f9;
      }
      .menu-role-manager .menu-row:last-child { border-bottom: none; }
      .menu-role-manager .menu-access {
        display: flex; align-items: center; gap: 0.4rem; font-weight: 500; min-width: 0;
      }
      .menu-role-manager .menu-access code { font-size: 0.7rem; color: #94a3b8; font-weight: 400; }
      .menu-role-manager .perm-cell {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 0.2rem; padding: 0.2rem 0;
      }
      .menu-role-manager .menu-row.perms-off .perm-cell { opacity: 0.35; }
      .menu-role-manager .perm-text {
        font-size: 0.72rem; font-weight: 600; color: #64748b;
        text-transform: uppercase; letter-spacing: 0.03em;
      }
      .menu-role-manager .perm-check { width: 1rem; height: 1rem; accent-color: #2563eb; cursor: default; }
      .menu-role-manager .col-header {
        display: grid;
        grid-template-columns: minmax(200px, 1fr) repeat(3, 88px);
        gap: 0.5rem; padding: 0.35rem 0 0.5rem; font-size: 0.72rem;
        color: #94a3b8; text-transform: uppercase; letter-spacing: 0.04em;
        border-bottom: 2px solid #e2e8f0; margin-bottom: 0.35rem;
      }
      .menu-role-manager .col-header span:not(:first-child) { text-align: center; }
      .menu-role-manager .config-banner,
      .menu-role-manager .owner-hint {
        padding: 0.65rem 0.85rem; margin-bottom: 1rem; border-radius: 8px;
        background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; font-size: 0.85rem;
      }
      .menu-role-manager .config-banner code,
      .menu-role-manager .owner-hint code {
        background: rgba(255,255,255,0.6); padding: 0.1rem 0.35rem; border-radius: 4px;
      }
      .menu-role-manager .btn { padding: 0.5rem 1rem; border-radius: 8px; border: none; cursor: pointer; font-size: 0.875rem; }
      .menu-role-manager .btn-primary { background: #2563eb; color: #fff; }
      .menu-role-manager .loading { color: #64748b; padding: 2rem; text-align: center; }
      .menu-role-manager .read-only-badge {
        display: inline-block; margin-left: 0.5rem; padding: 0.15rem 0.5rem;
        font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
        background: #f1f5f9; color: #64748b; border-radius: 999px; vertical-align: middle;
      }
    `;
    document.head.appendChild(style);
  }

  function renderMenuTree(menus, depth = 0, parentName = null) {
    if (!menus?.length) {
      return '<p class="text-muted">Tidak ada menu di menu.json</p>';
    }

    let html = '';
    if (depth === 0) {
      html += `
        <div class="col-header">
          <span>Menu</span>
          <span>Create</span>
          <span>Update</span>
          <span>Delete</span>
        </div>`;
    }

    function permCell(path, permKey, checked, label) {
      return `
        <div class="perm-cell">
          <span class="perm-text">${label}</span>
          <input type="checkbox" class="perm-check" disabled ${checked ? 'checked' : ''} aria-label="${label} ${checked ? 'ya' : 'tidak'}">
        </div>`;
    }

    for (const menu of menus) {
      const menuPath = menu.page || menu.path;
      const paddingLeft = depth * 16;

      if (!menuPath && menu.children?.length) {
        html += `<div class="menu-group-label" style="padding-left:${paddingLeft}px">${menu.icon ? `<i class="${menu.icon}"></i> ` : ''}${menu.name}</div>`;
        html += renderMenuTree(menu.children, depth + 1, menu.name);
        continue;
      }

      if (!menuPath) continue;

      const st = getState(menuPath);
      if (!menuStates.has(menuPath)) {
        menuStates.set(menuPath, { ...defaultState(menu.name, parentName), ...st });
      }

      const rowOff = !st.enabled ? ' perms-off' : '';
      html += `
        <div class="menu-row${rowOff}" style="padding-left:${paddingLeft}px" data-path="${menuPath}">
          <label class="menu-access">
            <input type="checkbox" disabled ${st.enabled ? 'checked' : ''} aria-label="Menu ${st.enabled ? 'aktif' : 'nonaktif'}">
            <span>${menu.icon ? `<i class="${menu.icon}"></i> ` : ''}${menu.name}</span>
            <code>${menuPath}</code>
          </label>
          ${permCell(menuPath, 'create', st.can_create, 'Create')}
          ${permCell(menuPath, 'update', st.can_update, 'Update')}
          ${permCell(menuPath, 'delete', st.can_delete, 'Delete')}
        </div>
      `;

      if (menu.children?.length) {
        html += renderMenuTree(menu.children, depth + 1, menu.name);
      }
    }
    return html;
  }

  function collectAllPaths(menus, parentName = null, out = []) {
    for (const menu of menus || []) {
      const path = menu.page || menu.path;
      if (menu.children?.length) {
        collectAllPaths(menu.children, menu.name, out);
        continue;
      }
      if (path) out.push({ path, name: menu.name, parent_path: parentName });
    }
    return out;
  }

  function bindEvents() {
    document.getElementById('roleSelect')?.addEventListener('change', async (e) => {
      currentRole = e.target.value;
      loading = true;
      render();
      try {
        menuStates = await loadRoleMapping(currentRole);
        collectAllPaths(menuConfig.sideMenu).forEach(({ path, name, parent_path }) => {
          if (!menuStates.has(path)) {
            menuStates.set(path, defaultState(name, parent_path));
          }
        });
      } catch (err) {
        container.innerHTML = `<div style="padding:2rem;color:#dc2626">${err.message || 'Gagal memuat mapping'}</div>`;
        return;
      } finally {
        loading = false;
        render();
      }
    });

    document.getElementById('loadRoleBtn')?.addEventListener('click', async () => {
      try {
        menuStates = await loadRoleMapping(currentRole);
        collectAllPaths(menuConfig.sideMenu).forEach(({ path, name, parent_path }) => {
          if (!menuStates.has(path)) {
            menuStates.set(path, defaultState(name, parent_path));
          }
        });
        render();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed; top: 20px; right: 20px; padding: 12px 20px; border-radius: 8px;
      color: white; z-index: 9999;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function renderConfigBanner() {
    const note = viewMeta.note
      ? `<br><span>${viewMeta.note}</span>`
      : '';
    const desc = viewMeta.description
      ? `<br><span><strong>Deskripsi role:</strong> ${viewMeta.description}</span>`
      : '';

    return `
      <div class="config-banner">
        <i class="fas fa-lock"></i>
        <strong>Mode lihat saja.</strong>
        Konfigurasi menu disimpan di <code>${viewMeta.source || 'config/menu-config.json'}</code>.
        Edit file JSON secara manual, lalu restart dev server.
        Mirror opsional ke PostgreSQL: <code>npm run menu:sync</code>.
        ${desc}${note}
      </div>`;
  }

  function render() {
    injectStyles();

    if (loading) {
      container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Memuat menu...</div>';
      return;
    }

    container.innerHTML = `
      <div class="menu-role-manager">
        <div class="manager-header">
          <h2>
            <i class="fas fa-sitemap"></i> Pengaturan Menu
            <span class="read-only-badge">Lihat saja</span>
          </h2>
          <p class="subtitle">
            Lihat menu dan izin Create / Update / Delete per role.
            Perubahan dilakukan lewat <code>config/menu-config.json</code>, bukan dari halaman ini.
          </p>
        </div>
        <div class="manager-content">
          ${renderConfigBanner()}
          <div class="role-selector">
            <h3><i class="fas fa-user-tag"></i> Pilih Role</h3>
            <select id="roleSelect" class="form-control">
              ${allRoles.map((r) => `<option value="${r.value}" ${r.value === currentRole ? 'selected' : ''}>${r.label}</option>`).join('')}
            </select>
            <button type="button" id="loadRoleBtn" class="btn btn-primary">
              <i class="fas fa-sync"></i> Muat ulang
            </button>
          </div>
          ${viewMeta.fullAccess ? `
          <div class="owner-hint">
            <i class="fas fa-crown"></i>
            Role ini memakai <strong>menu.json penuh</strong> saat login (akses penuh tanpa mapping terbatas di JSON).
          </div>` : ''}
          <div class="menu-tree">
            <h3><i class="fas fa-bars"></i> Menu &amp; Izin</h3>
            <div class="menu-checkboxes">${renderMenuTree(menuConfig.sideMenu)}</div>
          </div>
        </div>
      </div>
    `;
    bindEvents();
  }

  (async function bootstrap() {
    try {
      loading = true;
      render();
      menuConfig = await loadMenuConfig();
      menuStates = await loadRoleMapping(currentRole);
      collectAllPaths(menuConfig.sideMenu).forEach(({ path, name, parent_path }) => {
        if (!menuStates.has(path)) {
          menuStates.set(path, defaultState(name, parent_path));
        }
      });
    } catch (err) {
      console.error('[MenuRoleManager]', err);
      container.innerHTML = `<div style="padding:2rem;color:#dc2626">${err.message || 'Gagal memuat Menu Role Manager'}</div>`;
      return;
    } finally {
      loading = false;
      render();
    }
  })();
}

if (typeof window !== 'undefined') {
  window.initMenuRoleManager = initMenuRoleManager;
}
