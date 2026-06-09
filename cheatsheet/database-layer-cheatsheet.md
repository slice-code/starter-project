# Database Layer Cheatsheet — Admin Starter

---

## 1. Mental Model

```
schema/*.json
  → database.init()
  → create tables
  → seed bootstrap (HQ cabang)
  → generic CRUD API
```

| File | Fungsi |
|------|--------|
| `database.js` | Init, CRUD, seed |
| `schema/*.json` | Definisi tabel |
| `role-permissions.js` | API + branch filter |

---

## 2. Adapter

| Mode | Kondisi |
|------|---------|
| SQLite | Tanpa `DATABASE_URL` PostgreSQL → `data.db` |
| PostgreSQL | Ada `DATABASE_URL` |

---

## 3. Starter Schemas

| Schema | PK | Catatan |
|--------|-----|---------|
| `users.json` | `id` | role, kode_cabang, password bcrypt |
| `datacabang.json` | `id` | kode_cabang unique |
| `categories.json` | `id` | contoh CRUD |
| `app_notifications.json` | `id` | notifikasi navbar |
| `menu_role_mapping.json` | — | mirror menu permission |

### Schema minimal

```json
{
  "name": "categories",
  "label": "Kategori",
  "primaryKey": "id",
  "fields": [
    { "name": "id", "type": "number", "autoIncrement": true },
    { "name": "nama", "type": "text", "required": true }
  ],
  "timestamps": { "createdAt": "created_at", "updatedAt": "updated_at" }
}
```

---

## 4. Generic CRUD API

| Method | Endpoint |
|--------|----------|
| GET | `/api/{resource}` — list (search, sort, page) |
| GET | `/api/{resource}/{id}` |
| POST | `/api/{resource}` |
| PUT/PATCH | `/api/{resource}/{id}` |
| DELETE | `/api/{resource}/{id}` |

Query list: `?page=1&perPage=25&search=...&sort=nama&order=asc`

Resource name = `schema.name` = `appjson.config.resource`.

---

## 5. Seed

| Script | Isi |
|--------|-----|
| `npm run seed:bootstrap` | Cabang HQ + owner admin |
| `npm run seed:developer` | studio_admin |
| Init DB otomatis | `seedMasterReferenceData()` — cabang HQ jika kosong |

Env seed owner:
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`

---

## 6. Studio Schema Sync

Via UI `/studio/database-manager` atau API:
- `GET /api/studio/schema-list`
- `POST /api/studio/schema/{name}/sync-db`

Atau manual: tambah `schema/foo.json` → restart server.

---

## 7. Menambah Tabel Baru

1. Buat `schema/my_table.json`
2. Restart server (atau studio sync-db)
3. Buat `appjson/my_table.json` untuk UI
4. Test `GET /api/my_table`

---

## 8. Troubleshooting

| Masalah | Cek |
|--------|-----|
| Tabel tidak ada | Restart server, cek schema JSON valid |
| Column missing | Update schema + sync/migrate manual |
| 403 API | `role-permissions.js`, resource name |
| SQLite vs PG syntax | Pakai helper di `database.js` |
