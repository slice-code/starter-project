# Project Mapping Cheatsheet — PJTKI Bio

## Struktur Direktori Utama

```
pjtki-bio/
├── server.js              # HTTP server, semua routing API, static/SPA server
├── index.js               # Frontend bootstrap, menu loader, page registrar
├── database.js            # DB runtime: adapter SQLite/PostgreSQL, generic CRUD
├── auth.js                # JWT cookie, login session, bcrypt password
├── role-permissions.js    # API permission matrix, branch restriction
├── app-config.js          # Branding & env config (nama app, logo, dll)
├── menu-config-service.js # Menu config + API permission dari config/menu-config.json
├── biodata-merge-context.js # Build context data TKI untuk cetak/merge dokumen
├── print-surat-service.js # Orkestrasi cetak DOCX/PDF dari template
├── letter-service.js      # Generate surat (legacy letter)
├── upload-service.js      # Root upload, path resolver, file guard
├── upload-types.js        # Definisi tipe upload per field
│
├── schema/                # DDL tabel DB (*.json) — ~430 file
├── appjson/               # UI page config (CRUD + page JSON) — ~172 file
├── config/                # menu-config.json, menu-permissions.json
├── core/                  # Frontend JS modules (~61 file)
├── services/              # Backend service domain (~26 file)
├── migrations/            # Migration script bertahap
├── scripts/               # Seed, sync menu, utility
├── files/                 # Upload & generated files (DOCX, PDF, foto)
├── layouting/             # layout.js + CSS (sidebar, navbar, router hash)
├── library/               # Vendor lib lokal (pdfmake, xlsx, dll)
└── cheatsheet/            # Dokumentasi cepat developer
```

---

## Frontend Stack

```
index.html
  → el.js              (DOM wrapper)
  → layouting/layout.js (router, sidebar, navbar, modal, toast)
  → core/core.js        (CoreApp: ApiClient, page registry)
  → core/page-loader.js (lazy load appjson pages)
  → core/crud-engine.js (CRUD orchestrator: table + form)
  → core/form-builder.js
  → core/table-builder.js
  → core/ui-builder.js  (render JSON component non-CRUD)
  → core/api-client.js
  → core/rbac.js
  → index.js            (bootstrap, menu, hardcoded pages)
```

---

## Backend Stack

```
server.js
  → addSecurityHeaders
  → handleAuthRoutes     (auth.js)
  → serveUploadedFile    (upload-service.js)
  → requireApiAuth       (role-permissions.js)
  → handleApiRoutes      (custom endpoints)
  → handleKanbanRoutes
  → handleCrudRoutes     (database.js)
  → handleUnmatchedApi
  → serveStaticOrSpa
```

---

## Module Domain Utama

### Core Frontend (`core/`)

| File | Fungsi |
|------|--------|
| `core.js` | CoreApp class, init ApiClient, layout, page registry |
| `page-loader.js` | Lazy load appjson + resolve CRUD permission |
| `crud-engine.js` | List, search, sort, paginate, create/edit/delete |
| `form-builder.js` | Render form semua field type dari JSON |
| `table-builder.js` | Render datatable dari JSON |
| `ui-builder.js` | Render component `page`, `card`, `grid`, `stats`, `custom` |
| `api-client.js` | HTTP REST client |
| `rbac.js` | Role/session helper browser |
| `biodata-detail.js` | Halaman detail TKI (tab: personal, dokumen, admin, keuangan) |
| `biodata-tab-editor.js` | Tab editor biodata (rich editor, mount/teardown) |
| `pembayaran-tki-page.js` | Halaman pembayaran TKI (step keuangan per TKI) |
| `print-surat-client.js` | UI cetak surat (frontend orchestrator) |
| `print-batch-engine.js` | Engine batch cetak (ZIP DOCX per majikan/grup) |
| `print-data-registry.js` | Registry semua template cetak & halaman print |
| `dashboard-ui.js` | Dashboard tiles per role |
| `jurnal-keuangan-page.js` | Halaman jurnal umum/kas |
| `laporan-akuntansi-page.js` | Halaman laporan buku besar, neraca, laba rugi, arus kas |
| `tki-keuangan-detail.js` | Detail keuangan TKI (piutang, pembayaran, SPBG) |
| `tki-report-ui.js` | Report tabulasi TKI (pipeline, penempatan, dll) |
| `spbg-batch-page.js` | Halaman batch print SPBG |
| `spbg-keuangan-approval-page.js` | Halaman approval SPBG untuk keuangan |
| `blk-*.js` | Modul BLK (pelatihan, UJK, sertifikat, izin) |
| `document-upload-hub.js` | Upload dokumen TKI (multi-slot) |
| `tambah-bio.js` | Form tambah biodata baru |

### Backend Services (`services/`)

| File | Fungsi |
|------|--------|
| `jurnal-keuangan-service.js` | Buat/baca jurnal akuntansi |
| `pembayaran-tki-service.js` | Logika pembayaran TKI, piutang, fee agen |
| `piutang-tki-service.js` | Manajemen piutang TKI |
| `spbg-service.js` | Print SPBG (pilih template formal/informal, Java/non-Java) |
| `spbg-keuangan-service.js` | Approval SPBG: buat pembayaran + jurnal |
| `spbg-marketing-service.js` | SPBG marketing flow |
| `biodata-pdf.js` | Generate PDF biodata (formal) |
| `biodata-pdf-informal.js` | Generate PDF biodata (informal) |
| `biodata-pdf-chongyi.js` | Generate PDF biodata (format Chongyi) |
| `blk-ujk-service.js` | Service UJK BLK |
| `id-tki-service.js` | Generate & resolve ID TKI |
| `gemini-ocr.js` | OCR KTP via Google Gemini API |
| `fee-agen-service.js` | Hitung/simpan fee agen |
| `gaji-tki-service.js` | Gaji TKI |
| `keuangan-report-service.js` | Agregasi laporan keuangan |
| `coa-pjtki-data.js` | Data default CoA PJTKI |

---

## appjson → Route Mapping (halaman utama)

| appjson | Route | Keterangan |
|---------|-------|------------|
| `personal.json` | `/personal` | List biodata TKI |
| `majikan.json` | `/majikan` | Data majikan |
| `visa.json` | `/visa` | Proses visa |
| `paspor.json` | `/paspor` | Proses paspor |
| `medical.json` | `/medical` | Data medical |
| `disnaker.json` | `/disnaker` | Data disnaker |
| `skck.json` | `/skck` | Data SKCK |
| `pap.json` | `/pap` | PAP UJK |
| `pembayaran.json` | `/pembayaran` | Pembayaran TKI awal |
| `pembayaran-tki.json` | `/pembayaran-tki` | Custom page pembayaran TKI |
| `spbg-keuangan-request.json` | `/spbg-keuangan-request` | Pengajuan SPBG (marketing) |
| `spbg-keuangan-approval.json` | `/spbg-keuangan-approval` | Approval SPBG (keuangan) |
| `coa.json` | `/coa` | Chart of Accounts |
| `jurnal.json` | `/jurnal` | Daftar jurnal |
| `users.json` | `/users` | Manajemen pengguna (super_admin) |
| `datacabang.json` | `/datacabang` | Manajemen cabang (super_admin) |
| `datasektor.json` | `/datasektor` | Master sektor |
| `dataagen.json` | `/dataagen` | Master agen |
| `datamajikan.json` | `/datamajikan` | Master majikan |
| `dashboard.json` | `/` | Dashboard |
| `menu.json` | *(config)* | Definisi sidebar/navbar menu |

---

## Schema → Tabel DB Penting

| Schema | Tabel | Fungsi |
|--------|-------|--------|
| `personal.json` | `personal` | Data biodata TKI utama |
| `datatki.json` | `datatki` | TKI lintas episode/sektor |
| `dokumen.json` | `dokumen` | Status dokumen TKI |
| `majikan.json` | `majikan` | Data majikan |
| `pembayaran_tki.json` | `pembayaran_tki` | Rekam pembayaran TKI |
| `piutang_tki.json` | `piutang_tki` | Piutang TKI |
| `jurnal_keuangan.json` | `jurnal_keuangan` | Jurnal akuntansi |
| `coa.json` | `coa` | Chart of Accounts |
| `spbg_keuangan_request.json` | `spbg_keuangan_request` | Request SPBG |
| `users.json` | `users` | Pengguna sistem |
| `datacabang.json` | `datacabang` | Cabang |
| `menu_role_mapping.json` | `menu_role_mapping` | Legacy menu permission per role |
| `gaji_tki.json` | `gaji_tki` | Gaji TKI (potongan bulanan) |
| `pembayaran_fee_agen.json` | `pembayaran_fee_agen` | Fee agen |

---

## Domain Flow Utama

### 1. Registrasi & Biodata TKI
```
marketing → /personal (tambah TKI)
  → tambah-bio.js / tambah-bio page
  → schema/personal.json + schema/datatki.json
  → server.js: POST /api/personal (create + generate id_tki)
  → id-tki-service.js
```

### 2. Proses Keberangkatan
```
/visa, /paspor, /medical, /disnaker, /pap, /majikan
  → appjson CRUD masing-masing
  → schema/visa.json, paspor.json, medical.json, dll
  → database generic CRUD
```

### 3. Keuangan TKI
```
/pembayaran-tki (custom page)
  → core/pembayaran-tki-page.js
  → services/pembayaran-tki-service.js
  → schema/pembayaran_tki.json + piutang_tki.json + jurnal_keuangan.json
```

### 4. SPBG Flow
```
marketing → /spbg-keuangan-request
  → appjson/spbg-keuangan-request.json
  → schema/spbg_keuangan_request.json

keuangan → /spbg-keuangan-approval
  → core/spbg-keuangan-approval-page.js
  → POST /api/spbg-keuangan/approve
  → services/spbg-keuangan-service.js
    → buat pembayaran_tki (jenis_biaya=spbg)
    → jurnal: debit 1210, credit 4230

print → /print/majikan_spbg (batch)
  → core/spbg-batch-page.js
  → GET /api/print/batch/majikan_spbg/:id/docx
  → services/spbg-service.js (pilih template formal/informal, Java/non-Java)
```

### 5. Akuntansi
```
/jurnal-umum, /laporan/buku-besar, /laporan/neraca, dll
  → core/jurnal-keuangan-page.js
  → core/laporan-akuntansi-page.js
  → services/jurnal-keuangan-service.js
  → services/keuangan-report-service.js
  → schema/jurnal_keuangan.json + coa.json
```

### 6. Cetak Surat
```
/printsurat → core/print-surat-client.js + core/document-print-panel.js
  → appjson/print-surat-templates.json
  → print-surat-service.js → files/templates/*.docx

Batch print → core/print-batch-engine.js
  → appjson/print-batch-templates.json
  → /api/print/batch/:key/:id/docx
```

### 7. BLK
```
/blk-* pages
  → core/blk-*.js
  → services/blk-*.js
  → schema/blk_*.json
```

---

## RBAC: Role & Akses Menu

| Role | Akses Utama |
|------|------------|
| `super_admin` | Semua fitur + semua cabang + Pengaturan |
| `admin` | Semua fitur cabang, tanpa Pengaturan super |
| `marketing` | Biodata, majikan, visa, SPBG request, print |
| `keuangan` | Laporan keuangan, transaksi, approval SPBG, CoA, jurnal |
| `bagian_bio` | Input/edit biodata, dokumen |
| `bagian_foto` | Foto/dokumen terbatas |
| `blk` | Modul BLK |
| `data_master` | Master data |
| `staff` | Read-only umum |

---

## File Konfigurasi Penting

| File | Fungsi |
|------|--------|
| `appjson/menu.json` | Struktur sidebar/navbar semua role |
| `config/menu-config.json` | Permission menu per role (source utama) |
| `config/menu-permissions.json` | Legacy permission JSON |
| `.env` / `.env.local` | Environment variables |
| `docker-compose.yml` | Production stack |
| `docker-compose.dev.yml` | Dev PostgreSQL |
| `package.json` | Scripts npm |
| `Dockerfile` | Container image |
