# CRUD Page Cheatsheet — Admin Starter

Workflow menambah halaman CRUD baru di template starter.

---

## Arsitektur

```
schema/resource.json   → tabel database
appjson/resource.json  → UI (table + form)
config/menu-config.json → sidebar + permission
```

Resource name harus sama di ketiga layer (`categories`, `users`, dll.).

---

## Langkah: Tambah CRUD Baru

### 1. Schema (`schema/products.json`)

```json
{
  "name": "products",
  "label": "Produk",
  "primaryKey": "id",
  "fields": [
    { "name": "id", "type": "number", "autoIncrement": true },
    { "name": "nama", "type": "text", "required": true },
    { "name": "harga", "type": "number" },
    { "name": "aktif", "type": "enum", "options": [
      { "value": "1", "label": "Aktif" },
      { "value": "0", "label": "Nonaktif" }
    ]}
  ],
  "timestamps": { "createdAt": "created_at", "updatedAt": "updated_at" }
}
```

### 2. AppJSON (`appjson/products.json`)

Salin dari `appjson/categories.json`, ubah `path`, `resource`, `title`, `fields`, `columns`.

```json
{
  "path": "/products",
  "type": "crud",
  "config": {
    "resource": "products",
    "title": "Produk",
    "icon": "fas fa-box",
    "formDisplay": "modal",
    "table": { "columns": [], "features": { "search": true, "pagination": true } },
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

### 3. Menu (`config/menu-config.json`)

Tambah di `menuStructure` → grup `Data`:

```json
{
  "name": "Produk",
  "icon": "fas fa-box",
  "path": "/products",
  "sortOrder": 2
}
```

Tambah `/products` di `roles.admin.menuPaths` (dan role lain).

### 4. Deploy

```bash
npm run menu:sync    # jika PostgreSQL
# restart server
npm run dev
```

Atau pakai **Studio** → CRUD Manager (tanpa edit file manual).

---

## Memuat Library/Script Kustom (Page-Specific Libraries)

Jika halaman CRUD atau custom page tertentu membutuhkan library atau script kustom (misalnya library kalkulasi keuangan, grafik, xlsx, dll), daftarkan file script tersebut di dalam JSON halaman (`appjson/resource.json`) menggunakan properti `"libraries"` atau `"scripts"`.

Dengan cara ini, library tersebut **hanya akan dimuat ketika halaman tersebut dibuka**, sehingga menghemat resource memori saat startup.

### Contoh (`appjson/products.json`):
```json
{
  "path": "/products",
  "type": "crud",
  "libraries": [
    "./library/accounting.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"
  ],
  "config": {
    "resource": "products",
    "title": "Produk"
  }
}
```

*Catatan: File script lokal ditulis relatif terhadap root (`./library/...` atau `./core/...`), sedangkan link eksternal menggunakan URL penuh.*

---

## Starter Pages (Referensi)

| Route | Resource | File |
|-------|----------|------|
| `/categories` | `categories` | contoh minimal |
| `/users` | `users` | owner only |
| `/datacabang` | `datacabang` | master cabang |

---

## formDisplay

| Value | Perilaku |
|-------|----------|
| `modal` | Create/edit di modal |
| `newpage` | Navigate `/resource/create`, `/resource/edit/:id` |

---

## Permissions

- Owner menu: `/users`, `/datacabang` — hanya `super_admin`
- CRUD flags: dari `menu-config.json` + `appjson options.permissions`
- API: `role-permissions.js`

---

## Troubleshooting

| Masalah | Solusi |
|--------|--------|
| 404 halaman | Restart server |
| Tabel tidak ada | Cek schema, restart / studio sync-db |
| Menu tidak muncul | menu-config + menu:sync + role |
| Form field kosong | `config.form.fields` + schema field name match |

---

## Cheatsheet Terkait

- Form fields: `form-builder-cheatsheet.md`
- Table/crud config: `crud-builder-cheatsheet.md`
- RBAC: `rbac-authorization-cheatsheet.md`
