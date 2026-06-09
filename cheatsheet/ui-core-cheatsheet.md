# UI Core Cheatsheet — Admin Starter

---

## 1. Mental Model

```
index.js
  → CoreApp (core/core.js)
  → layouting/layout.js
  → PageLoader
  → appjson/*.json
  → CrudEngine / UiBuilder
  → FormBuilder + TableBuilder
  → ApiClient
```

| Layer | File |
|------|------|
| DOM | `el.js` |
| Layout/router | `layouting/layout.js` |
| App runtime | `core/core.js` |
| Page loader | `core/page-loader.js` |
| CRUD | `core/crud-engine.js` |
| Form | `core/form-builder.js` |
| Table | `core/table-builder.js` |
| JSON UI | `core/ui-builder.js` |
| Dashboard | `core/dashboard-ui.js` (`admin-dashboard`) |
| API | `core/api-client.js` |
| RBAC | `core/rbac.js` |

---

## 2. Bootstrap Flow

```js
// index.js
window.adminApp = { core, bootstrapAuthenticatedApp, ... };
registerLoginPage(core);
await bootstrapAuthenticatedApp(core, sessionUser);
core.init();
```

1. `loadAppBranding()` → `/api/app-config`
2. `CrmAuth.me()` → redirect `#/login` jika belum auth
3. `new CoreApp({ api, layout })`
4. Jika authenticated:
   - `CrmRbac.setSession(user)`
   - `loadMenuConfig()` → `/api/menu`
   - `loadFeatureScripts()` → studio / settingsOwner
   - `PageLoader.bootstrap(core)`
   - `loadHardcodedPages()` → profile, profil-perusahaan, menu-role-manager
   - `registerStudioPages()`
5. `core.init()` → `layout.render()`

---

## 3. el.js Core Rule

| Rule | Benar |
|------|-------|
| First mount | `.child(...) → .get()` |
| Rebuild | `.empty() → .child(...) → .get()` |
| Bersihkan | `.empty()`, bukan `.clear()` |

```js
slot.empty();
slot.child(el('p').text('Loading...'));
slot.get();
slot.load(() => { /* post-mount */ });
```

---

## 4. Lazy Load Scripts

Jangan tambah `<script src="core/baru.js">` di `index.html`.

```js
// index.js — FEATURE_SCRIPTS
settingsOwner: ['./core/menu-role-manager.js', './core/company-profile-settings.js']
studio: ['./core/studio-*.js', ...]
```

`CoreScriptLoader.loadMany()` dipanggil dari `loadFeatureScripts()` berdasarkan role/menu.

---

## 5. appjson CRUD Pattern

```json
{
  "path": "/categories",
  "type": "crud",
  "config": {
    "resource": "categories",
    "title": "Kategori",
    "formDisplay": "modal",
    "table": { "columns": [], "features": {} },
    "form": { "fields": [] }
  },
  "options": {
    "permissions": {
      "create": ["super_admin", "admin"],
      "read": ["super_admin", "admin", "viewer"],
      "update": ["super_admin", "admin"],
      "delete": ["super_admin"]
    }
  }
}
```

File baru di `appjson/` → **restart server**.

---

## 6. Custom Page Pattern

```js
// core/my-page.js
(function (global) {
  function registerMyPage() {
    layout.addPage({
      path: '/my-page',
      component: () => el('div').text('Hello').get(),
      roles: ['super_admin', 'admin']
    });
  }
  global.MyPage = { registerMyPage };
})(window);
```

Daftarkan di `index.js` atau lazy load via `FEATURE_SCRIPTS`.

---

## 7. Dashboard Component

`appjson/dashboard.json`:

```json
{ "type": "admin-dashboard" }
```

Terdaftar di `core/dashboard-ui.js`. Fetch `/api/dashboard` → stat users, branches, categories, resources.

---

## 8. Quick Recipes

### Tambah CRUD
1. `schema/resource.json`
2. `appjson/resource.json`
3. Menu di `config/menu-config.json`
4. `npm run menu:sync` + restart

### Tambah field
1. Field di `schema/*.json`
2. `appjson → config.form.fields`
3. Column di `config.table.columns` (opsional)

---

## 9. Troubleshooting

| Masalah | Cek |
|--------|-----|
| UI tidak update | `.get()` setelah `.child()`? |
| Page baru tidak muncul | Server restart? |
| Menu kosong | `config/menu-config.json`, role user |
| Create button hilang | `options.permissions`, menu role |
| `adminApp` undefined | Pakai `window.adminApp`, bukan `pjtkiApp` |

---

## 10. Cheatsheet Lain

| Topik | File |
|-------|------|
| Form | `form-builder-cheatsheet.md` |
| CRUD config | `crud-builder-cheatsheet.md` |
| Layout | `layout-cheatsheet.md` |
| el.js | `eljs-cheatsheet.md` |
| RBAC | `rbac-authorization-cheatsheet.md` |
