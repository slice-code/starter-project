# UI Core Cheatsheet

Ringkasan inti UI project ini agar bisa memahami alur tanpa membaca seluruh codebase.

---

## 1. Mental Model

```
index.js
  → CoreApp
  → layouting/layout.js
  → PageLoader
  → appjson/*.json
  → UiBuilder / CrudEngine
  → FormBuilder + TableBuilder
  → ApiClient
```

| Layer | File | Fungsi |
|------|------|--------|
| DOM wrapper | `el.js` | Membuat dan mengatur DOM secara chainable |
| Layout/router | `layouting/layout.js` | Sidebar, navbar, route hash, page mounting |
| App runtime | `core/core.js` | Init API client, layout, page registry, schema registry |
| Page loader | `core/page-loader.js` | Lazy-load `appjson` page dan permission CRUD |
| JSON renderer | `core/ui-builder.js` | Render component `page`, `card`, `grid`, `form`, `table`, `crud` |
| CRUD engine | `core/crud-engine.js` | Orkestrasi list, search, sort, pagination, create/edit/delete |
| Form builder | `core/form-builder.js` | Render form dari JSON schema |
| Table builder | `core/table-builder.js` | Render datatable dari JSON schema |
| API client | `core/api-client.js` | HTTP client untuk CRUD/API |
| RBAC | `core/rbac.js` | Role dan permission helper |

---

## 2. Bootstrap Flow

```js
// index.js
const core = new CoreApp({ api, layout });
window.pjtkiApp = { core, bootstrapAuthenticatedApp, ... };
registerLoginPage(core);
await bootstrapAuthenticatedApp(core, sessionUser);
core.init();
```

Alur utama:

1. Load branding dan session user.
2. Buat `CoreApp`.
3. Register login page.
4. Kalau authenticated:
   - set role ke `CrmRbac` dan `layout`
   - load menu dari API
   - `PageLoader.bootstrap(core)` untuk page `appjson`
   - register hardcoded/custom pages
5. `core.init()`:
   - buat `ApiClient`
   - setup layout
   - register pages
   - validasi route aktif
   - `layout.render()`

---

## 3. el.js Core Rule

`el.js` bukan virtual DOM. Semua yang dibuat adalah DOM asli.

```js
const card = el('div')
  .class('card')
  .child([
    el('h3').text('Title'),
    el('p').text('Content')
  ]);

container.child(card);
container.get();
```

### Wajib Diingat

| Rule | Benar |
|------|-------|
| First mount | `.child(...) → .get()` |
| Rebuild host | `.empty() → .child(...) → .get()` |
| Add child setelah mounted | `.child(...) → .get()` |
| Bersihkan sebelum render ulang | pakai `.empty()`, bukan `.clear()` |
| Return component | boleh wrapper `el(...)` atau native DOM dari `.get()` |

### Anti-pattern

```js
// BAD: host sudah mounted, tapi child belum di-flush
slot.empty();
slot.child(el('p').text('Loading...'));
```

```js
// GOOD
slot.empty();
slot.child(el('p').text('Loading...'));
slot.get();
```

---

## 4. Safe Mount Pattern

Gunakan pola ini untuk tab, panel, async content, dan slot yang sering berubah.

```js
function mountChildren(wrapper, nodes, afterMount) {
  wrapper.empty();
  (Array.isArray(nodes) ? nodes : [nodes]).forEach((node) => {
    if (node != null) wrapper.child(node);
  });
  wrapper.get();
  wrapper.load(() => {
    if (typeof afterMount === 'function') afterMount(wrapper.el);
  });
}
```

Dipakai untuk:

- Tab biodata.
- Panel custom.
- Form slot.
- Async loading state.
- Mencegah listener/panel lama menumpuk.

---

## 5. Memory Leak Checklist

Sebelum bikin UI custom, cek ini:

- **Slot rebuild**: selalu `empty → child → get`.
- **Panel cache**: kalau ada `cachedPanel`, remove dulu sebelum build ulang.
- **Event listener**: hindari bind berulang ke DOM yang sama tanpa `.off()` atau rebuild wrapper.
- **Window listener**: `window.addEventListener` harus punya cleanup manual.
- **Modal/popover**: remove dari DOM saat close, jangan hanya hide.
- **Quill/rich editor**: init setelah form mounted via `.load()`, bukan saat create wrapper.
- **Polling**: `loopFunc` berhenti kalau marker DOM hilang; pastikan host benar-benar di-remove/empty.

Panel cache pattern:

```js
let cachedPanel = null;

function buildPanel(data) {
  if (cachedPanel) {
    try { el(cachedPanel).remove(); } catch (e) {}
    cachedPanel = null;
  }

  const root = el('div');
  root.child(el('p').text(data.label || '-'));

  cachedPanel = root.get();
  return root;
}
```

---

## 6. Layout Routing

```js
layout.addPage({
  path: '/example',
  component: () => el('div').text('Example Page'),
  roles: ['admin', 'super_admin'],
  pageContentPadding: '1.5rem',
  hideLayout: false,
  fullWidthDesktop: false
});
```

Navigation:

```js
layout.navigate('/example');
// URL menjadi #/example
```

Catatan:

- Route berbasis hash: `#/path`.
- Dynamic route pakai pola `/:id`.
- `component()` dipanggil saat route dibuka.
- Layout mount hasil component ke content slot.
- `roles` membatasi akses halaman.

---

## 7. appjson Page Pattern

Mayoritas halaman CRUD berasal dari `appjson/*.json`.

```json
{
  "path": "/resource-name",
  "type": "crud",
  "config": {
    "resource": "resource_name",
    "title": "Resource Name",
    "formDisplay": "modal",
    "table": { "columns": [] },
    "form": { "fields": [] }
  },
  "options": {
    "permissions": ["admin", "super_admin"]
  }
}
```

Load flow:

1. User buka route.
2. `PageLoader` load config dari API/cache.
3. Config dinormalisasi.
4. Page diregister ke layout.
5. `CrudEngine.build()` membuat UI.

Catatan penting:

- File baru di `appjson` biasanya butuh server restart.
- Page custom/hardcoded jangan ditimpa lazy loader.
- Permission bisa dari `options.permissions` atau menu role mapping.

---

## 8. UiBuilder Pattern

`UiBuilder` render JSON component non-CRUD atau composite UI.

Built-in types:

- `page`
- `card`
- `grid`
- `form`
- `table`
- `crud`
- `button`
- `text`
- `heading`
- `stats`
- `divider`
- `spacer`
- `custom`

Custom component:

```js
UiBuilder.registerComponent('myComponent', (schema, context) => {
  return el('div').text(schema.label || 'My Component');
});
```

Usage in JSON:

```json
{
  "type": "myComponent",
  "label": "Hello"
}
```

---

## 9. CrudEngine Responsibilities

`CrudEngine` adalah orchestrator UI CRUD.

Yang diurus:

- Header title/icon.
- Search input debounce.
- Create button.
- Filter chips.
- Table render.
- Server pagination.
- Single/multi sort.
- Edit/create modal atau new page.
- Delete confirmation.
- Row actions.
- Export/print/PDF jika dikonfigurasi.
- Permission create/read/update/delete.

Typical config:

```json
{
  "resource": "personal",
  "title": "Personal",
  "formDisplay": "modal",
  "modalSize": "large",
  "hideCreateButton": false,
  "defaultSort": { "column": "created_at", "direction": "desc" },
  "table": { "columns": [] },
  "form": { "fields": [] }
}
```

Return handle biasanya punya:

- `el` / `get()`
- `table`
- `loadData()`
- `refresh()`
- `openCreateModal()`
- `openEditModal(row)`
- `setPermissions()`

---

## 10. FormBuilder Essentials

Form diambil dari `config.form`.

```json
"form": {
  "columns": 2,
  "gap": "1rem",
  "intro": "Isi data dengan lengkap.",
  "submitText": "Simpan",
  "cancelText": "Batal",
  "fields": [
    {
      "name": "nama",
      "label": "Nama",
      "type": "text",
      "required": true,
      "placeholder": "Masukkan nama"
    }
  ]
}
```

Common field properties:

| Property | Fungsi |
|----------|--------|
| `name` | key data/API |
| `label` | label field |
| `type` | jenis input |
| `required` | validasi wajib |
| `readonly` / `disabled` | field tidak bisa diedit |
| `colspan` | lebar field di grid |
| `helpText` | teks bantuan |
| `preset` | ambil config dari field preset |
| `optionsFrom` | remote select dari resource API |
| `validation` | aturan validasi |
| `mask` | input mask |

Remote select minimal:

```json
{
  "name": "id_biodata",
  "label": "ID Biodata",
  "type": "select",
  "optionsFrom": {
    "resource": "personal",
    "valueKey": "id_biodata",
    "labelKey": "nama"
  }
}
```

---

## 11. TableBuilder Essentials

Table diambil dari `config.table`.

```json
"table": {
  "columns": [
    { "name": "id", "label": "ID", "sortable": true },
    { "name": "nama", "label": "Nama", "searchable": true },
    {
      "name": "actions",
      "label": "Aksi",
      "type": "actions",
      "actions": ["edit", "delete"]
    }
  ],
  "features": {
    "search": true,
    "pagination": true,
    "perPage": 25,
    "sortable": true,
    "multiSort": true,
    "selectable": false
  }
}
```

Common column types:

| Type | Fungsi |
|------|--------|
| default/text | tampilkan value biasa |
| `badge` | status badge |
| `actions` | tombol aksi row |
| `docSlot` | status dokumen/upload |
| custom render | render cell khusus dari JS |

---

## 12. Permission Pattern

Array = semua action untuk role itu.

```json
"permissions": ["admin", "super_admin"]
```

Object = per action.

```json
"permissions": {
  "create": ["super_admin", "admin"],
  "read": ["super_admin", "admin", "keuangan"],
  "update": ["super_admin", "admin"],
  "delete": []
}
```

Rules:

- `[]` berarti disabled/no one.
- `super_admin` biasanya owner/full access.
- Menu permission bisa mempersempit akses page/action.
- `PageLoader.resolveCrudPermissions()` menggabungkan role, menu, dan appjson permission.

---

## 13. Custom Page Pattern

Untuk UI yang terlalu kompleks untuk `appjson`, buat file custom di `core/*-page.js` atau `core/*-panel.js`.

```js
(function (global) {
  'use strict';

  function registerExamplePage(options = {}) {
    layout.addPage({
      path: '/example-custom',
      component: () => buildExamplePage(options),
      roles: ['admin', 'super_admin']
    });
  }

  function buildExamplePage(options) {
    const root = el('div');
    root.child(el('h2').text('Example Custom Page'));
    return root;
  }

  global.ExamplePage = { registerExamplePage };
})(window);
```

Register dari bootstrap:

```js
if (typeof ExamplePage !== 'undefined') {
  ExamplePage.registerExamplePage({ force: true });
}
```

---

## 14. Rich Editor / Biodata Form Mount Rule

Untuk form biodata dan rich textarea:

```js
wrapper.empty();
wrapper.child(formNode);
wrapper.get();
wrapper.load(() => {
  mountRichEditorsIn(wrapper.el);
  setupFormAutoFocusGuard(wrapper.el, scrollSnapshot);
  applyBiodataScrollSnapshot(scrollSnapshot);
});
```

Jangan:

- Init rich editor sebelum form mounted.
- Pakai `dangerouslyPasteHTML` untuk load value.
- Bikin observer/timer tanpa cleanup.
- Replace tab tanpa `teardownFormSlot` / cleanup guard.

---

## 15. Quick Recipes

### Add Simple CRUD Page

1. Buat/update `schema/resource.json` jika DB schema belum ada.
2. Buat `appjson/resource.json`.
3. Isi `path`, `type: crud`, `config.resource`, `table`, `form`, `options.permissions`.
4. Tambahkan menu jika perlu.
5. Restart server jika page baru tidak muncul.

### Add Field to Existing CRUD

1. Cek field di `schema/*.json`.
2. Tambahkan field di `appjson/*.json → config.form.fields`.
3. Tambahkan column di `config.table.columns` kalau perlu muncul di list.
4. Pakai `preset` jika field umum sudah ada.

### Add Custom Row Action

1. Tambahkan action di column `type: actions`.
2. Pastikan `CrudEngine` mendukung action itu, atau tambahkan handler custom di page/panel.
3. Refresh table setelah action sukses.

### Add Swappable Tab/Panel

1. Buat host wrapper sekali.
2. Saat ganti tab: `host.empty()`.
3. Build panel baru.
4. `host.child(panel)`.
5. `host.get()`.
6. Jalankan post-mount logic di `.load()`.

---

## 16. Troubleshooting Cepat

| Masalah | Cek |
|--------|-----|
| UI tidak muncul | Setelah `.child()` sudah `.get()`? |
| Konten lama ikut muncul | Pakai `.empty()`, bukan `.clear()`? |
| Button jalan dobel | Listener lama belum dibersihkan/rebuild? |
| Page baru tidak ada | Server sudah restart setelah tambah `appjson`? |
| Create button hilang | `hideCreateButton`, permission, menu permission |
| Remote select kosong | `optionsFrom.resource`, `valueKey`, `labelKey`, API response |
| Table tidak refresh | Panggil `refresh()` / `loadData()` setelah mutate |
| Scroll loncat di biodata | Rich editor init terlalu awal/autofocus guard hilang |
| Memory naik saat tab switch | Panel lama belum `empty/remove`, listener global belum cleanup |

---

## 17. File Referensi Cepat

| Kebutuhan | Baca |
|----------|------|
| DOM wrapper | `cheatsheet/eljs-cheatsheet.md` |
| CRUD config lengkap | `cheatsheet/crud-builder-cheatsheet.md` |
| Form config lengkap | `cheatsheet/form-builder-cheatsheet.md` |
| Layout/router | `cheatsheet/layout-cheatsheet.md` |
| CRUD page workflow | `cheatsheet/crud-page-cheatsheet.md` |
| Form rich editor mount | `cheatsheet/rule.md` |
| Runtime app | `index.js`, `core/core.js` |
| Lazy pages | `core/page-loader.js` |
| JSON UI | `core/ui-builder.js` |
| CRUD engine | `core/crud-engine.js` |
| Form builder | `core/form-builder.js` |
| Table builder | `core/table-builder.js` |

---

## 18. Core Module Loading Strategy (Lazy Load Rule)

**Aturan wajib:**

Jangan pernah menambahkan file core baru secara langsung ke `index.html`.

```html
<!-- SALAH -->
<script src="./core/modul-baru.js"></script>
```

**Gunakan lazy loading:**

1. Daftarkan di `FEATURE_SCRIPTS` di `index.js`
2. Load on-demand via `CoreScriptLoader.loadMany([...])` saat menu/page diakses
3. Atau manfaatkan `PageLoader` untuk halaman `appjson`

**Pola yang benar** (lihat `index.js`):

```js
const FEATURE_SCRIPTS = {
  blk: [
    './core/blk-dokumentasi-page.js',
    './core/blk-personal.js'
  ],
  keuangan: [ ... ],
  printSurat: [ ... ]
};
```

Keuntungan:
- Initial bundle lebih kecil
- Performa lebih baik
- Mudah di-maintain dan di-scale
