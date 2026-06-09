# Project Mapping Cheatsheet — Admin Starter

Template admin JSON-driven. CRUD & halaman didefinisikan di `appjson/*.json`, tabel di `schema/*.json`.

---

## Struktur Direktori

```
admin-starter/
├── server.js              # HTTP server, API routing, static/SPA
├── index.js               # Frontend bootstrap, menu, login
├── index.html             # Entry HTML + core scripts
├── database.js            # DB runtime: SQLite/PostgreSQL, generic CRUD
├── auth.js                # JWT cookie, login session
├── role-permissions.js    # API permission matrix
├── app-config.js          # Branding dari env
├── menu-config-service.js # Menu + permission dari config/menu-config.json
├── upload-service.js      # Upload file handler
├── upload-types.js        # Daftar tipe upload (starter: 3 tipe generik)
│
├── schema/                # DDL tabel (*.json)
├── appjson/               # UI page & CRUD config (*.json)
├── config/                # menu-config.json, company-profile.json
├── core/                  # Frontend modules (~28 file)
├── services/              # studio-service, image-compress (+ stub legacy)
├── scripts/               # seed, menu sync, utility
├── files/                 # Upload & generated files
├── layouting/             # layout.js + CSS
├── library/               # Vendor lokal (xlsx lazy-load)
└── cheatsheet/            # Dokumentasi developer
```

---

## Frontend Stack

```
index.html
  → el.js
  → layouting/layout.js
  → core/dynamic-loader.js (Memuat core scripts & index.js secara sekuensial)
      → core/script-loader.js
      → core/api-client.js
      → core/auth-client.js
      → core/rich-text-editor.js
      → core/input-mask.js
      → core/form-builder.js
      → core/form-field-presets.js
      → core/table-builder.js
      → core/pjtki-theme.js
      → core/timeline-panel.js
      → core/crud-engine.js
      → core/kanban-engine.js
      → core/ui-builder.js
      → core/dashboard-ui.js
      → core/rbac.js
      → core/page-loader.js
      → core/core.js
      → index.js
```

Lazy load (via `CoreScriptLoader`):
- `settingsOwner` → menu-role-manager, company-profile-settings
- `studio` → studio-* modules

---

## Backend Stack

```
server.js
  → handleAuthRoutes
  → serveUploadedFile (/uploads)
  → requireApiAuth
  → handleApiRoutes (studio, schema, dashboard, notifications, …)
  → handleCrudRoutes (generic CRUD)
  → serveStaticOrSpa
```

---

## Starter Pages (`appjson/`)

| File | Route | Type |
|------|-------|------|
| `dashboard.json` | `/` | page (`admin-dashboard`) |
| `categories.json` | `/categories` | crud (contoh) |
| `users.json` | `/users` | crud |
| `datacabang.json` | `/datacabang` | crud |
| `about.json` | `/about` | page |
| `form-field-presets.json` | — | preset config |

Hardcoded pages (`index.js`):
- `/login`, `/profile`
- `/profil-perusahaan`, `/menu-role-manager` (owner)
- `/studio/*` (studio-pages.js)

---

## Starter Schemas (`schema/`)

| Schema | Tabel | Fungsi |
|--------|-------|--------|
| `users.json` | `users` | Auth & role |
| `datacabang.json` | `datacabang` | Multi-cabang |
| `categories.json` | `categories` | Contoh CRUD sederhana |
| `app_notifications.json` | `app_notifications` | Notifikasi navbar |
| `menu_role_mapping.json` | `menu_role_mapping` | Mirror permission menu (opsional DB) |

---

## Roles

| Role | Akses |
|------|-------|
| `super_admin` | Owner — semua menu + pengaturan |
| `admin` | Cabang — dashboard, categories, about |
| `studio_admin` | Developer — studio + menu manager |
| `viewer` | Read-only |

Config: `config/menu-config.json` → `roles{}` + `menuStructure[]`

---

## Scripts npm

| Script | Fungsi |
|--------|--------|
| `npm start` | Production server |
| `npm run dev` | Nodemon dev |
| `npm run dev:setup` | PostgreSQL dev + `.env.local` |
| `npm run seed` | bootstrap + menu:sync |
| `npm run seed:bootstrap` | Cabang HQ + owner admin |
| `npm run seed:developer` | Akun studio_admin |
| `npm run menu:sync` | Sync menu-config → PostgreSQL |

---

## Menambah Project / Resource Baru

1. Copy folder starter → rename `app-config.js` / env branding
2. `schema/my_resource.json` — definisi tabel
3. `appjson/my_resource.json` — halaman CRUD
4. Tambah path di `config/menu-config.json`
5. `npm run menu:sync` (jika pakai PostgreSQL mirror)
6. Restart server

Lihat: `cheatsheet/crud-page-cheatsheet.md`, `cheatsheet/ui-core-cheatsheet.md`

---

## File Referensi Cepat

| Kebutuhan | Baca |
|----------|------|
| UI bootstrap | `index.js`, `cheatsheet/ui-core-cheatsheet.md` |
| Form config | `cheatsheet/form-builder-cheatsheet.md` |
| CRUD config | `cheatsheet/crud-builder-cheatsheet.md` |
| Layout/router | `cheatsheet/layout-cheatsheet.md` |
| el.js mount | `cheatsheet/eljs-cheatsheet.md`, `cheatsheet/rule.md` |
| RBAC | `cheatsheet/rbac-authorization-cheatsheet.md` |
| Deploy | `cheatsheet/deployment-devops-cheatsheet.md` |
