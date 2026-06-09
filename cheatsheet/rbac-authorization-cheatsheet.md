# RBAC Authorization Cheatsheet

Referensi cepat role, menu permission, API permission, dan data isolation cabang.

---

## 1. Mental Model

```
login user
  → auth.js signs JWT (role + kode_cabang)
  → server.js requireApiAuth
  → role-permissions.js checkApiPermission
  → menu-config/menu_role_mapping controls menu + CRUD flags
  → PageLoader resolves frontend CRUD permissions
  → database/server applies branch-aware filtering
```

| Layer | File/Tabel | Fungsi |
|------|------------|--------|
| JWT session | `auth.js` | simpan role + `kode_cabang` di token |
| API matrix | `role-permissions.js` | method/resource permission |
| Menu config | `config/menu-config.json` | menu + permission source utama jika tersedia |
| Menu permission legacy | `menu_role_mapping` | fallback menu + CRUD flags per role/path |
| Frontend permission | `core/page-loader.js` | ubah menu flags jadi permission CrudEngine |
| UI RBAC | `core/rbac.js` | helper role/session di browser |
| Menu service | `menu-config-service.js` | baca config menu role-based |

---

## 2. Role List

Canonical roles:

| Role | Label | Karakter |
|------|-------|----------|
| `super_admin` | Owner | full access semua fitur dan semua cabang |
| `admin` | Administrator Cabang | akses operasional luas, data dibatasi cabang |
| `bagian_bio` | Bagian Biodata | input/edit biodata dan master data biodata |
| `bagian_foto` | Bagian Foto | akses foto/dokumen terbatas |
| `marketing` | Marketing | agen, majikan, visa, penempatan |
| `keuangan` | Keuangan | pembayaran, piutang, CoA, jurnal/report finance |
| `data_master` | Data Master | master data terpusat |
| `staff` | Staff | read-only umum |
| `agen` | Agen PPTKIS | read-only/terbatas |
| `blk` | Bagian BLK | modul BLK/training/UJK |
| `viewer` | Viewer | read-only |

Legacy role `owner` dinormalisasi menjadi `super_admin`.

---

## 3. Role Normalization

```js
function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'owner') return 'super_admin';
  return r;
}
```

Rules:

- Selalu bandingkan role setelah normalisasi.
- Jangan buat role baru tanpa update label, API permission, menu config, dan dashboard view.
- `super_admin` adalah owner, bukan sekadar admin cabang.

---

## 4. API Permission Matrix

`role-permissions.js` punya `API_PERMISSIONS`:

```js
const API_PERMISSIONS = {
  super_admin: {
    '*': ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  },
  keuangan: {
    personal: ['GET'],
    pembayaran_tki: ['GET', 'POST', 'PUT', 'PATCH'],
    coa: ['GET', 'POST', 'PUT', 'PATCH'],
    '*': ['GET']
  }
};
```

`checkApiPermission(user, resource, method)` flow:

1. User/role harus ada.
2. `users` hanya boleh non-GET tertentu untuk `super_admin`.
3. `dashboard` dan `reports` GET-only.
4. `menu_role_mapping` GET semua, POST hanya `super_admin`.
5. Coba permission dari `menu-config-service` jika tersedia.
6. Fallback ke `API_PERMISSIONS[role][resource]`.
7. Fallback ke wildcard `API_PERMISSIONS[role]['*']`.
8. Kalau tidak ada match, deny.

---

## 5. Menu Permission Source

Ada dua sumber menu permission:

| Source | Status | Keterangan |
|--------|--------|------------|
| `config/menu-config.json` | preferred | read-only source untuk UI Pengaturan Menu |
| `menu_role_mapping` | fallback/legacy | table DB untuk mapping role/path/CRUD flags |

Legacy config file lain:

| File | Fungsi |
|------|--------|
| `config/menu-permissions.json` | role → `menuPaths` + default/exceptions CRUD |
| `scripts/setup-menu-permissions.js` | sync JSON permission ke DB |
| `scripts/sync-menu-config.js` | sync menu config source |
| `appjson/menu.json` | struktur/menu page definitions |

---

## 6. menu_role_mapping Shape

Field penting:

| Field | Fungsi |
|-------|--------|
| `role` | role canonical |
| `menu_path` | path route, contoh `/personal` |
| `menu_name` | label menu |
| `parent_path` | grouping menu |
| `can_create` | allow create |
| `can_update` | allow update |
| `can_delete` | allow delete |
| `is_active` | aktif/tidak |
| `sort_order` | urutan menu |

CRUD flags diubah ke format `CrudEngine`:

```js
{
  _explicit: true,
  create: flags.can_create ? [role] : ['__none__'],
  read: [role],
  update: flags.can_update ? [role] : ['__none__'],
  delete: flags.can_delete ? [role] : ['__none__']
}
```

Catatan penting: kolomnya `can_*`, bukan `allow_*`.

---

## 7. Frontend Permission Flow

```
/api/menu
  → returns sideMenu + menuPermissions
  → index.js layout.addSideMenu(...)
  → PageLoader.resolveCrudPermissions(...)
  → CrudEngine.setPermissions(...)
  → buttons/actions hidden/disabled
```

Rules:

- Frontend permission hanya UX guard.
- Backend `requireApiAuth + checkApiPermission` tetap sumber keamanan utama.
- Kalau tombol hilang tapi API boleh, cek menu permission frontend.
- Kalau tombol ada tapi API 403, cek backend permission.

---

## 8. Branch Restriction

Branch restricted roles:

```js
[
  'admin',
  'bagian_bio',
  'bagian_foto',
  'marketing',
  'keuangan',
  'staff',
  'agen',
  'blk'
]
```

Access rule:

```js
function assertBranchRecordAccess(user, row) {
  if (!user || !row) return true;
  const role = normalizeRole(user.role);
  if (!isBranchRestricted(role)) return true;
  if (!user.kode_cabang || !row.kode_cabang) return true;
  return row.kode_cabang === user.kode_cabang;
}
```

Rules:

- `super_admin` tidak dibatasi cabang.
- Role operasional dibatasi kalau user dan row sama-sama punya `kode_cabang`.
- Data tanpa `kode_cabang` perlu diputuskan: master global atau data bocor.
- Master global jangan dipaksa branch-aware.

---

## 9. Branch-Aware Tables

Contoh tabel branch-aware:

- `personal`
- `datatki`
- `personalblk`
- `dokumen`
- `skck`
- `majikan`
- `visa`
- `paspor`
- `medical`
- `disnaker`
- `pembayaran_tki`
- `piutang_tki`
- `pembayaran_fee_agen`
- `spbg_keuangan_request`
- `gaji_tki`
- `jurnal_keuangan`

Catatan:

- `coa` sengaja tidak branch-aware karena master akun global.
- Tambah tabel ke list ini hanya jika data memang milik cabang.

---

## 10. Add Menu for Role

Pattern di `config/menu-permissions.json`:

```json
{
  "roles": {
    "bagian_bio": {
      "menuPaths": ["/", "/personal", "/keadaantki"],
      "permissions": {
        "default": { "can_create": 1, "can_update": 1, "can_delete": 1 },
        "exceptions": {
          "/personal": { "can_create": 0, "can_update": 1, "can_delete": 0 }
        }
      }
    }
  }
}
```

Steps:

1. Pastikan page ada di `appjson/*.json` dan `appjson/menu.json` / menu config.
2. Tambahkan path ke role `menuPaths`.
3. Set default CRUD flags atau exception per path.
4. Sync menu config/script sesuai source yang dipakai.
5. Login ulang atau refresh session/menu.
6. Test tombol UI dan API method.

---

## 11. Add API Permission for Role

Jika endpoint resource baru:

1. Tambahkan resource ke role di `role-permissions.js` atau menu config.
2. Tentukan method yang boleh: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
3. Jika resource masuk UI CRUD, pastikan menu permission cocok.
4. Jika data cabang, pastikan branch-aware dan `kode_cabang`.
5. Test role yang boleh dan role yang harus 403.

Example:

```js
marketing: {
  personal: ['GET'],
  datamajikan: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  '*': ['GET', 'POST']
}
```

---

## 12. Debug 403 / Missing Menu

### Menu tidak muncul

Cek:

- Path ada di config menu?
- Path ada di role `menuPaths`?
- Mapping `is_active` true?
- User role sudah canonical?
- `/api/menu` response berisi path itu?

### Tombol create/edit/delete hilang

Cek:

- `can_create`, `can_update`, `can_delete`.
- `hideCreateButton` di appjson.
- `options.permissions` di appjson.
- `PageLoader.resolveCrudPermissions()` result.

### API 403

Cek:

- `role-permissions.js` resource/method.
- `menu-config-service.checkApiMethodForRole()` jika config aktif.
- Resource name frontend sama dengan backend table/resource.
- Method khusus seperti POST sync mungkin dipetakan ke PATCH.

---

## 13. Security Rules

- Jangan percaya permission frontend saja.
- Semua mutate API wajib lewat auth + permission backend.
- Jangan beri wildcard CUD ke role sempit kecuali memang dimaksudkan.
- Jangan expose `users` ke non-owner.
- Jangan buka file upload tanpa auth.
- Jangan hilangkan branch filtering untuk role operasional.
- Jangan masukkan master global ke branch-aware tanpa alasan kuat.

---

## 14. File Referensi

| Kebutuhan | File |
|----------|------|
| API permission matrix | `role-permissions.js` |
| JWT role/cabang | `auth.js` |
| API auth gate | `server.js` |
| Menu config service | `menu-config-service.js` |
| JSON menu config | `config/menu-config.json` |
| Legacy role menu permission | `config/menu-permissions.json` |
| Menu JSON | `appjson/menu.json` |
| Frontend RBAC | `core/rbac.js` |
| Page permission resolver | `core/page-loader.js` |
| DB menu mapping helpers | `database.js` |
