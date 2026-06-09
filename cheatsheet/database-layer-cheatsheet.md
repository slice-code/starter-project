# Database Layer Cheatsheet

Referensi cepat untuk memahami `database.js`, schema JSON, generic CRUD, adapter SQLite/PostgreSQL, dan branch-aware filtering.

---

## 1. Mental Model

```
schema/*.json
  → database.init()
  → create/ensure tables
  → seed bootstrap/demo data
  → expose generic CRUD API
  → server.js handleCrudRoutes
```

| Bagian | File | Fungsi |
|--------|------|--------|
| DB runtime | `database.js` | Init adapter, table creation, CRUD, seed, business logic |
| DB schema | `schema/*.json` | Definisi tabel dan field |
| UI config | `appjson/*.json` | Definisi halaman yang memakai resource schema |
| Schema manager UI | `core/schema-manager.js` | Helper SQL/schema di frontend/core |
| Permissions | `role-permissions.js` | Branch-aware table list dan API matrix |
| Migrations | `migrations/*.js` | Patch struktur/data bertahap |

---

## 2. Adapter Strategy

Project bisa jalan dengan dua mode:

| Mode | Indikasi | Keterangan |
|------|----------|------------|
| SQLite/sql.js | tanpa `DATABASE_URL` PostgreSQL | Lokal/simple, file DB seperti `data.db` |
| PostgreSQL | ada `DATABASE_URL` | Docker/dev/prod, service `db` atau port dev `5433` |

Log init contoh:

```txt
[DB] SQLite ready at ...
[DB] PostgreSQL ready ...
```

Rules:

- Jangan hardcode syntax SQL yang hanya cocok untuk satu adapter jika fungsi dipakai global.
- Pakai helper yang sudah ada di `database.js` untuk quote, placeholder, dan query execution.
- Cek keberadaan tabel/kolom sebelum migration update/insert defensif.

---

## 3. Schema JSON Pattern

Minimal schema:

```json
{
  "name": "resource_name",
  "label": "Resource Label",
  "primaryKey": "id",
  "fields": [
    { "name": "id", "type": "number", "autoIncrement": true },
    { "name": "nama", "type": "text", "required": true },
    { "name": "created_at", "type": "datetime" }
  ]
}
```

Common field properties:

| Property | Fungsi |
|----------|--------|
| `name` | nama kolom |
| `type` | tipe logical (`text`, `number`, `date`, `datetime`, `boolean`, dll.) |
| `label` | label manusiawi |
| `required` | validasi/UI hint dan DB constraint jika diterapkan |
| `unique` | uniqueness |
| `autoIncrement` | auto increment PK |
| `defaultValue` | default value |
| `options` | enum/select options |
| `maxLength` | batas panjang |
| `description` | dokumentasi field |

---

## 4. Generic CRUD Functions

Core functions di `database.js`:

| Function | Fungsi |
|----------|--------|
| `list(table, options)` | list data dengan pagination/search/filter/sort |
| `getById(table, id)` | ambil 1 row berdasarkan PK |
| `getByField(table, field, value)` | ambil 1 row berdasarkan field |
| `create(table, data, auditOpts)` | insert row |
| `update(table, id, data, auditOpts)` | update row berdasarkan PK |
| `remove(table, id, auditOpts)` | delete row berdasarkan PK |

List options:

```js
await database.list('personal', {
  page: 1,
  perPage: 25,
  search: 'SITI',
  searchFields: ['id_biodata', 'nama', 'nik'],
  sort: 'tanggaldaftar',
  order: 'desc',
  filters: {
    kode_cabang: 'MLG',
    statusaktif: 'PROSES'
  }
});
```

Return list biasanya:

```js
{
  data: [],
  pagination: {
    page,
    perPage,
    total,
    totalPages
  }
}
```

---

## 5. Create / Update / Delete Pattern

Create:

```js
await database.create('resource_name', payload, dbAuditOptsFromReq(req));
```

Update:

```js
await database.update('resource_name', id, payload, dbAuditOptsFromReq(req));
```

Delete:

```js
await database.remove('resource_name', id, dbAuditOptsFromReq(req));
```

Rules:

- `prepareRowData()` membersihkan/menormalkan row sebelum disimpan.
- `pickDataForSchema()` membuang field yang tidak ada di schema.
- Beberapa tabel punya business validation khusus di dalam `create/update`.
- Untuk audit table, old/new value bisa dicatat otomatis.
- Jangan langsung query manual jika generic CRUD sudah cukup.

---

## 6. Branch-Aware Data Pattern

Branch restriction didefinisikan di `role-permissions.js`:

```js
const BRANCH_RESTRICTED_ROLES = [
  'admin', 'bagian_bio', 'bagian_foto', 'marketing',
  'keuangan', 'staff', 'agen', 'blk'
];
```

Branch-aware table contoh:

```js
const BRANCH_AWARE_TABLES = [
  'personal',
  'datatki',
  'personalblk',
  'dokumen',
  'skck',
  'majikan',
  'visa',
  'paspor',
  'medical',
  'disnaker',
  'pembayaran_tki',
  'piutang_tki',
  'jurnal_keuangan'
];
```

Rules:

- User cabang membawa `kode_cabang` di JWT.
- Resource branch-aware harus punya/terhubung ke `kode_cabang`.
- `super_admin` tidak dibatasi cabang.
- `admin` adalah admin cabang: operasional luas, data dibatasi cabang.
- `coa` sengaja bukan branch-aware karena master global.

Checklist saat tambah tabel branch-aware:

1. Tambahkan field `kode_cabang` di schema jika data memang milik cabang.
2. Pastikan create auto-inject `kode_cabang` dari auth jika perlu.
3. Tambahkan tabel ke `BRANCH_AWARE_TABLES` hanya jika data memang harus difilter cabang.
4. Pastikan list/detail/update/delete tidak bocor antar cabang.
5. Jangan masukkan master global seperti CoA ke branch-aware.

---

## 7. ID TKI / ID Biodata Pattern

Project memakai dua identitas penting:

| Field | Fungsi |
|-------|--------|
| `id_tki` | identitas TKI immutable lintas episode/sektor |
| `id_biodata` | identitas biodata/episode/sektor |
| `kode_cabang` | cabang pemilik data |
| `kode_sektor` | sektor/jenis biodata |

Rules:

- Financial module memakai `id_tki` sebagai linking key.
- Banyak modul administratif lama memakai `id_biodata`.
- Pindah sektor memakai pola copy/archive, bukan overwrite sembarang.
- Jangan membuat duplikasi TKI aktif dengan identitas yang sama.

---

## 8. Search, Filter, Sort

`list()` mendukung:

- `search` global.
- `searchFields` whitelist field pencarian.
- `filters` exact/khusus.
- `sort` dan `order`.
- pagination `page` + `perPage`.

Pattern filter exact:

```js
await database.list('menu_role_mapping', {
  filters: { role: 'bagian_bio' },
  sort: 'sort_order',
  order: 'asc',
  perPage: 1000
});
```

Pattern prefix/khusus ada di beberapa resource seperti `id_biodata_prefix`, sector/stage filters, dan report-specific filters.

---

## 9. Seed & Bootstrap Data

Database init menjalankan beberapa seed:

- Demo users.
- Demo branch offices (`datacabang`).
- Master reference data.
- Default CoA.
- Demo TKI data.
- Menu/config-related bootstrap.

Script terkait:

| Script | Fungsi |
|--------|--------|
| `npm run seed:bootstrap` | seed bootstrap utama |
| `npm run seed:menu` | seed legacy menu role mapping |
| `npm run seed:coa` | seed chart of accounts |
| `npm run seed:demo-flow` | seed demo workflow |
| `npm run menu:sync` | sync menu config |
| `npm run menu:sync:dry` | preview sync menu config |

---

## 10. Migration Safety Checklist

Sebelum ubah schema/data:

- Cek tabel ada sebelum `ALTER/UPDATE`.
- Cek kolom ada sebelum update column baru.
- Cek constraint/unique sebelum pakai `ON CONFLICT`.
- Cek `NOT NULL` sebelum insert row seed.
- Jangan drop field lama kalau masih dipakai appjson/UI.
- Backfill data sebelum field diwajibkan.
- Untuk PostgreSQL, gunakan transaksi kalau migration menyentuh banyak tabel.
- Untuk branch-aware, backfill `kode_cabang` dari `personal/datatki` jika data child belum punya cabang.

---

## 11. Add New Table Resource

Langkah umum:

1. Buat `schema/resource_name.json`.
2. Tentukan primary key dan field wajib.
3. Jika data cabang, tambahkan `kode_cabang`.
4. Tambah migration jika perlu untuk DB existing.
5. Buat `appjson/resource-name.json` untuk UI CRUD.
6. Tambahkan menu/permission.
7. Restart server agar schema/appjson terbaca.
8. Test GET/POST/PUT/DELETE via UI atau API.

---

## 12. Common Pitfalls

| Masalah | Penyebab | Fix |
|--------|----------|-----|
| Field tidak tersimpan | field tidak ada di `schema/*.json` | tambahkan field schema/migration |
| Data cabang bocor | resource belum branch-aware atau filter tidak ada | cek `BRANCH_AWARE_TABLES` dan `kode_cabang` |
| Insert gagal NOT NULL | seed/create payload kurang field wajib | cek schema dan default value |
| ON CONFLICT error | unique constraint belum ada | buat unique index dulu |
| CoA kosong untuk role cabang | CoA salah dibuat branch-aware | jangan masukkan `coa` ke `BRANCH_AWARE_TABLES` |
| Page list lambat | perPage terlalu besar/search tanpa index | tambah index dan gunakan pagination |

---

## 13. File Referensi

| Kebutuhan | File |
|----------|------|
| DB runtime utama | `database.js` |
| Schema tabel | `schema/*.json` |
| UI resource config | `appjson/*.json` |
| Branch permission | `role-permissions.js` |
| Migration | `migrations/*.js` |
| PostgreSQL dev config | `postgresql-dev.conf` |
| PostgreSQL prod config | `postgresql-prod.conf` |
| Docker DB dev | `docker-compose.dev.yml` |
| Docker DB prod | `docker-compose.yml` |
