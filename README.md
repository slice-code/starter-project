# Core App — JSON-Driven SPA Framework

A lightweight JSON-driven SPA framework built on **el.js** and **layout.js**. Generate complete CRUD systems, custom pages, and REST API integrations from simple JSON configuration files — no complex templating needed.

---

## 📁 Project Structure

```
layouting-el.js/
├── core/                    # Core framework modules
│   ├── core.js              # CoreApp class, routing, page registration
│   ├── crud-engine.js       # CRUD page builder (table + form)
│   ├── table-builder.js     # Data table with pagination, sort, search
│   ├── form-builder.js      # Dynamic form generator
│   ├── ui-builder.js        # UI component renderer
│   ├── schema-manager.js    # Database schema manager
│   └── api-client.js        # REST API client
│
├── layouting/
│   ├── layout.js            # Layout engine (navbar, sidebar, routing, themes)
│   └── tailwind.js          # Tailwind CSS
│
├── schema/                  # Database schemas (DDL only)
│   ├── users.json           # Users table definition
│   └── products.json        # Products table definition
│
├── appjson/                 # UI page configurations
│   ├── users.json           # CRUD UI for users
│   ├── products.json        # CRUD UI for products
│   ├── about.json           # Regular page
│   └── dashboard.json       # Dashboard page
│
├── cheatsheet/
│   ├── eljs-cheatsheet.md   # el.js DOM library reference
│   ├── layout-cheatsheet.md # layout.js API reference
│   └── crud-page-cheatsheet.md # CRUD & Page JSON format reference
│
├── el.js                    # el.js DOM library
├── index.js                 # App entry point
├── server.js                # Development server (Node.js)
└── package.json
```

---

## 🚀 Quick Start

### Tanpa Docker (SQLite lokal)

```bash
npm install
# env.local sudah ada (PORT=3004, SQLite). Isi GOOGLE_API_KEY jika pakai OCR Gemini.
npm start
```

Open `http://localhost:3004` — database file `data.db` (sql.js, bukan Postgres).

### Dengan Docker + PostgreSQL

```bash
# opsional: cp .env.example .env  (ubah JWT_SECRET di production)
docker compose up -d --build
```

Aplikasi: **http://localhost:8005** (default `APP_PORT=8005`, mapping ke port internal container `3004`)  
PostgreSQL 16 di service `db`, jaringan Docker **`pjtki`** (hostname `db` — tidak di-expose ke host). Volume data: `pjtki_pgdata`. Folder `files/` dan `data/` di-mount ke container.

Perintah berguna:

| Perintah | Fungsi |
|----------|--------|
| `docker compose up -d` | Jalankan di background |
| `docker compose logs -f app` | Lihat log aplikasi |
| `docker compose down` | Stop & hapus container (volume DB tetap) |

Variabel penting:

| Variabel | Keterangan |
|----------|------------|
| `DATABASE_URL` | Otomatis di-set docker-compose → PostgreSQL |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Kredensial DB (default `pjtki`) |
| `JWT_SECRET` | Secret JWT (wajib diganti di production) |
| `APP_PORT` | Port host (default **8005**) |

Login demo: `admin@crm.local` / `admin123`

---

## 💡 Core Concept

### Schema vs AppJSON Separation

```
schema/     → Database DDL (table structure, fields, types)
appjson/    → UI pages & CRUD configs
```

- **Schema files** define database tables only (columns, types, constraints)
- **AppJSON files** define UI behavior (forms, tables, layouts)
- They share the same `resource` name to connect

---

## 📖 Usage

### 1. Define Database Schema (`schema/users.json`)

```json
{
  "name": "users",
  "fields": [
    { "name": "id", "type": "number", "autoIncrement": true },
    { "name": "name", "type": "text", "required": true },
    { "name": "email", "type": "email", "required": true },
    { "name": "role", "type": "enum", "options": ["admin", "user", "manager"] }
  ]
}
```

### 2. Define CRUD UI (`appjson/users.json`)

```json
{
  "path": "/users",
  "type": "crud",
  "config": {
    "resource": "users",
    "title": "User Management",
    "icon": "fas fa-users",
    "formDisplay": "modal",
    "table": {
      "columns": [
        { "key": "id", "label": "ID", "sortable": true },
        { "key": "name", "label": "Name", "sortable": true, "searchable": true },
        { "key": "email", "label": "Email" },
        { "key": "role", "label": "Role" },
        { "key": "actions", "type": "actions", "actions": ["edit", "delete"] }
      ],
      "features": {
        "search": true,
        "pagination": true,
        "perPage": 10
      }
    },
    "form": {
      "columns": 2,
      "fields": [
        { "name": "name", "label": "Full Name", "type": "text", "required": true },
        { "name": "email", "label": "Email", "type": "email", "required": true },
        { "name": "role", "label": "Role", "type": "select", "options": [
          { "value": "admin", "label": "Administrator" },
          { "value": "user", "label": "Regular User" }
        ]}
      ]
    }
  }
}
```

### 3. Define Regular Page (`appjson/about.json`)

```json
{
  "path": "/about",
  "type": "page",
  "config": {
    "title": "About",
    "children": [
      { "type": "heading", "level": 1, "text": "About Us" },
      { "type": "text", "text": "This is a JSON-driven page." }
    ]
  }
}
```

### 4. Initialize App (`index.js`)

```javascript
const core = new CoreApp({
  api: { baseUrl: '/api' },
  layout: { theme: 'blue', sideMenu: [...], navbar: [...] }
});

// Load pages from appjson/ via API
await loadAppJsonPages(core);

// Initialize
core.init();
```

---

## 🔧 Server API Requirements

The server must implement RESTful endpoints matching the `resource` name:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/{resource}` | List (pagination, search, sort) |
| `GET` | `/api/{resource}/{id}` | Get single item |
| `POST` | `/api/{resource}` | Create |
| `PUT` | `/api/{resource}/{id}` | Update |
| `DELETE` | `/api/{resource}/{id}` | Delete |

### List Response Format

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "perPage": 10,
    "total": 95,
    "totalPages": 10
  }
}
```

### Query Parameters

| Parameter | Description |
|-----------|-------------|
| `page` | Page number (1-based) |
| `perPage` | Rows per page |
| `search` | Search query string |
| `sort` | Column to sort by |
| `order` | Sort direction: `asc` or `desc` |

---

## 📄 Page Types

### CRUD Pages

- **Layout**: Zero-padding, fixed header (title + search + create), fixed pagination, scrollable table body
- **Features**: Server-side pagination, search (400ms debounce), column sorting, sticky thead
- **Form Display**: `modal` (inline dialog) or `newpage` (full page form)
- **State**: perPage setting persisted in localStorage, pagination state maintained after save/edit/delete
- **Routing**: `/resource` (list), `/resource/create` (create form), `/resource/edit/:id` (edit form)

### Regular Pages

- Built from JSON schema with components: `heading`, `text`, `card`, `grid`, `button`, `image`, `list`
- Supports nested layouts with grid columns

---

## 🎨 Layout Features

### Themes

11 built-in themes: `default`, `blue`, `dark`, `light`, `purple`, `green`, `red`, `orange`, `teal`, `pink`, `gray`

```js
setLayoutTheme('dark');
```

Custom themes:

```js
layout.setCustomTheme({
  navbarBg: '#1a1a2e',
  sidebarBg: '#16213e',
});
```

### Sidebar & Navbar

```js
layout.addSideMenu([
  { name: 'Home', page: '/', icon: 'fas fa-home' },
  { name: 'Users', page: '/users', icon: 'fas fa-users' }
]);

addNavbar([{ name: 'Home', page: '/' }]);
```

### RBAC / Roles

```js
layout.setRole('admin');

layout.addPage({
  path: '/admin',
  roles: ['admin'],
  component: () => el('div').text('Admin only')
});
```

### Toast & Confirm

```js
layout.toast('Saved!', { type: 'success' });

layout.confirm({
  title: 'Delete?',
  message: 'This cannot be undone.',
  onConfirm: () => { /* delete */ }
});
```

### Custom Modal

```js
layout.modal({
  title: 'My Modal',
  message: el('div').text('Content'),
  buttons: [
    { text: 'Cancel', variant: 'outline', onClick: () => layout.closeModal() },
    { text: 'Save', variant: 'primary', onClick: () => { /* save */ } }
  ]
});
```

### Desktop Sidebar Hide Toggle

- Collapses sidebar to 4px strip, hover to reveal as floating overlay
- State persisted to `localStorage`

### Mobile Behavior

- Full-screen overlay sidebar
- Auto-closes after menu click

---

## 📚 Cheatsheets

| Cheatsheet | Description |
|------------|-------------|
| [el.js](cheatsheet/eljs-cheatsheet.md) | DOM library API reference |
| [layout.js](cheatsheet/layout-cheatsheet.md) | Layout engine API reference |
| [CRUD & Pages](cheatsheet/crud-page-cheatsheet.md) | JSON format for CRUD and page configs |

---

## ✨ Features Summary

| Feature | Details |
|---|---|
| JSON-driven UI | Define entire apps with JSON configs |
| Auto CRUD | Generate CRUD systems from config in seconds |
| Server-side pagination | Efficient data handling for large datasets |
| Search | Debounced server-side search (400ms) |
| Form builder | Dynamic forms with validation, grid layouts |
| Table builder | Sortable columns, sticky headers, action buttons |
| REST API client | Automatic CRUD endpoint mapping |
| Schema manager | Database DDL generation from schema definitions |
| Hash routing | `#/path` based SPA navigation |
| Themes | 11 built-in + custom theming |
| RBAC | Page and menu access control by role |
| Toast/Confirm/Modal | Built-in UI primitives |
| Desktop hide toggle | Hover-reveal sidebar mode |
| localStorage persistence | perPage settings, sidebar state |

---

## Keamanan

Ringkasan perlindungan yang sudah diterapkan di aplikasi PJTKI Bio. Detail implementasi ada di `server.js`, `auth.js`, dan `role-permissions.js`.

### Autentikasi & sesi

| Aspek | Implementasi |
|-------|----------------|
| **Login** | `POST /api/auth/login` — password diverifikasi dengan **bcrypt** (`$2a$` / `$2b$`); password plain-text ditolak |
| **Token** | **JWT** disimpan di cookie **`crm_token`** (`HttpOnly`, `SameSite=Lax`, path `/`) |
| **Durasi sesi** | 24 jam (`TOKEN_MAX_AGE_SEC` di `auth.js`) |
| **Logout** | `POST /api/auth/logout` — cookie dihapus |
| **Cek sesi** | `GET /api/auth/me` — dipakai SPA saat load halaman |
| **Rate limit login** | Maks. **5 percobaan** per IP / **15 menit** lockout |
| **Validasi input login** | Sanitasi email, validasi format, panjang password |
| **JWT secret** | Wajib `JWT_SECRET` kuat di production (`NODE_ENV=production`); tanpa env → server **gagal start** |

Generate secret production:

```bash
openssl rand -base64 64
```

### Otorisasi (RBAC & cabang)

| Lapisan | Perilaku |
|---------|----------|
| **API** | Semua `/api/*` (kecuali login) wajib cookie JWT valid → `401` jika tidak ada sesi |
| **RBAC CRUD** | `checkApiPermission()` — izin create/update/delete per resource & role |
| **Menu & halaman** | Filter sidebar + `roles` per halaman di `layout.js` |
| **Isolasi cabang** | Role tertentu (`BRANCH_RESTRICTED_ROLES`) hanya akses data **`kode_cabang`** sendiri |
| **Audit** | Perubahan data tercatat dengan user/email dari JWT |

Konfigurasi permission: `config/menu-permissions.json`, `config/menu-config.json` — lihat [CONFIGURATION.md](CONFIGURATION.md) dan [MENU-CONFIG-SYSTEM.md](MENU-CONFIG-SYSTEM.md).

### Dokumen upload (foto KTP, paspor, dll.)

File disimpan di **`data/uploads/`** dan dilayani lewat URL **`/uploads/...`**.

| Aturan | Detail |
|--------|--------|
| **Wajib login** | Tanpa cookie JWT → **401 Unauthorized** |
| **Path alternatif diblok** | `/data/uploads/...` dan folder `/data/*` lain **tidak** bisa diakses langsung (403 / dialihkan ke auth) |
| **Anti-cache CDN** | Header `Cache-Control: private, no-store`, `CDN-Cache-Control: no-store`, `Cloudflare-CDN-Cache-Control: no-store`, `Vary: Cookie` |
| **Log akses** | Setiap unduhan tercatat: user, path file, IP |
| **Catatan** | Verifikasi kepemilikan biodata per cabang masih bisa diperketat (TODO di `serveUploadedFile`) |

**Cloudflare Tunnel / reverse proxy:** CDN bisa meng-cache gambar yang pernah diakses saat login. Wajib:

1. **Purge cache** `/uploads/*` setelah deploy perbaikan keamanan  
2. **Cache Rule** Cloudflare: path `/uploads/*` dan `/api/*` → **Bypass cache**

### HTTP security headers

Semua respons memakai header (`addSecurityHeaders` di `server.js`):

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy` (self + CDN Font Awesome / Quill)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (kamera/mikrofon/lokasi dinonaktifkan)

### Anti-cache respons sensitif

Path berikut **tidak boleh di-cache** browser maupun edge CDN:

| Path | Alasan |
|------|--------|
| `/uploads/*`, `/data/uploads/*` | Dokumen privat TKI |
| `/api/*` | Data & export terautentikasi |
| `/index.html`, `/index.js`, `/core/*`, `/el.js`, `/layouting/layout.js` | Shell SPA — deploy harus langsung terlihat |

### Production (Docker)

| Praktik | Status |
|---------|--------|
| `JWT_SECRET` wajib via env | ✓ (`docker-compose.yml` menolak start tanpa secret) |
| Postgres hanya jaringan internal Docker | ✓ tidak di-expose ke host |
| Container app `read_only: true` + volume terbatas | ✓ |
| Error production disanitasi | ✓ tidak bocorkan SQL/path/stack trace |
| Ganti password admin default | Wajib sebelum go-live |
| `SEED_ADMIN=false` | Disarankan di production setelah admin dibuat |

### Checklist sebelum go-live

- [ ] `JWT_SECRET` unik & kuat (bukan nilai contoh `.env.example`)
- [ ] `ADMIN_PASSWORD` diganti; nonaktifkan seed admin jika tidak perlu
- [ ] HTTPS aktif (Cloudflare Tunnel / reverse proxy + TLS)
- [ ] Cache Rule Cloudflare: bypass `/uploads/*` dan `/api/*`
- [ ] Purge cache CDN setelah update keamanan
- [ ] Backup rutin `data/uploads/` dan database (lihat `backup-files.sh`, `backup-db.sh`)
- [ ] Kredensial demo (`migrations/*-CREDENTIALS.md`) **tidak** dipakai di production

### Tanggung jawab operator

- Keamanan fisik / jaringan home server & tunnel Cloudflare
- Rotasi password user & review role berkala
- Pembatasan akses DNS / firewall ke domain dev vs production
- API key Gemini (`GOOGLE_API_KEY`) — jangan commit ke git

---

## 👨‍💻 Author

Built with ❤️ using [el.js](https://github.com/slice-code/el.js)
