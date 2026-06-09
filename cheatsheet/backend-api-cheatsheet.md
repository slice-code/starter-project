# Backend API Cheatsheet

Referensi cepat untuk memahami `server.js`, route API, auth, response, dan pola endpoint tanpa membaca seluruh file backend.

---

## 1. Mental Model

```
HTTP request
  → addSecurityHeaders
  → handleAuthRoutes
  → serveUploadedFile khusus /uploads
  → requireApiAuth
  → handleApiRoutes
  → handleKanbanRoutes
  → handleCrudRoutes
  → handleUnmatchedApi
  → serveStaticOrSpa
```

| Layer | File | Fungsi |
|------|------|--------|
| HTTP server | `server.js` | Router utama dan static/SPA server |
| Auth helper | `auth.js` | JWT cookie, login session, password hash |
| Permission | `role-permissions.js` | API permission matrix dan branch restriction |
| Database | `database.js` | Generic CRUD + business logic data layer |
| Upload | `upload-service.js` | Root upload, path resolver, file handling |
| Print surat | `print-surat-service.js` | Template sync, DOCX/PDF generation |

---

## 2. Request Flow Utama

```js
const server = http.createServer((req, res) => {
  (async () => {
    addSecurityHeaders(req, res);

    if (await handleAuthRoutes(req, res)) return;

    if (uploadPath.startsWith('/uploads/')) {
      serveUploadedFile(req, res, uploadPath);
      return;
    }

    if (!requireApiAuth(req, res)) return;
    if (await handleApiRoutes(req, res)) return;
    if (await handleKanbanRoutes(req, res)) return;
    if (await handleCrudRoutes(req, res)) return;
    if (handleUnmatchedApi(req, res)) return;

    serveStaticOrSpa(req, res);
  })().catch(handleServerError);
});
```

Urutan penting:

1. Auth route (`/api/auth/login`, dll.) diproses dulu.
2. Upload file dilayani khusus sebelum static.
3. Semua `/api/*` selain public route wajib lolos `requireApiAuth`.
4. API custom diproses sebelum generic CRUD.
5. API yang tidak cocok dikembalikan JSON 404, bukan HTML.
6. Non-API fallback ke static atau shell SPA.

---

## 3. Auth API Pattern

Auth memakai cookie JWT `crm_token`.

```js
// auth.js
function signToken(user) {
  return jwt.sign({
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    kode_cabang: user.kode_cabang || null
  }, JWT_SECRET, { expiresIn: TOKEN_MAX_AGE_SEC });
}
```

Rules:

- Production wajib punya `JWT_SECRET`.
- Token disimpan di HttpOnly cookie.
- Session user dibaca via `auth.getUserFromRequest(req)`.
- Password harus bcrypt; plaintext ditolak.
- Payload user membawa `role` dan `kode_cabang` untuk permission dan branch filtering.

Public route:

```js
function isPublicApiRoute(pathname, method) {
  if (pathname === '/api/auth/login' && method === 'POST') return true;
  return false;
}
```

---

## 4. API Auth + Permission Gate

```js
function requireApiAuth(req, res) {
  if (!req.url.startsWith('/api/')) return true;
  if (isPublicApiRoute(pathname, req.method)) return true;

  const user = auth.getUserFromRequest(req);
  if (!user) return json401();

  const match = pathname.match(/^\/api\/([a-zA-Z_][a-zA-Z0-9_]*)(?:\/([^/]+))?$/);
  if (match) {
    const resource = match[1];
    if (!checkApiPermission(user, resource, req.method)) return json403();
  }

  req.authUser = user;
  return true;
}
```

Permission dicek berdasarkan:

- `role-permissions.js`.
- `config/menu-config.json` jika tersedia.
- Fallback `API_PERMISSIONS`.
- Special resource rules, contoh `users` hanya `super_admin`.

---

## 5. Generic CRUD API

Route generic:

| Method | Path | Fungsi |
|--------|------|--------|
| `GET` | `/api/:resource` | list data |
| `GET` | `/api/:resource/:id` | detail data |
| `POST` | `/api/:resource` | create data |
| `PUT` / `PATCH` | `/api/:resource/:id` | update data |
| `DELETE` | `/api/:resource/:id` | delete data |

Query umum list:

| Query | Fungsi |
|-------|--------|
| `page` | halaman aktif |
| `perPage` | jumlah row per halaman |
| `search` | keyword global |
| `sort` | nama kolom sort |
| `order` | `asc` / `desc` |
| custom filters | diteruskan ke `database.list()` bila didukung |

Response pattern:

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "perPage": 25,
    "total": 100,
    "totalPages": 4
  }
}
```

Error pattern:

```json
{
  "success": false,
  "error": "Message"
}
```

---

## 6. Custom API Routes

Gunakan custom route jika:

- Butuh proses lintas tabel.
- Butuh validasi khusus bisnis.
- Butuh upload/print/export/OCR.
- Endpoint tidak cocok dengan CRUD biasa.

Pattern:

```js
async function handleApiRoutes(req, res) {
  if (req.url === '/api/example' && req.method === 'GET') {
    try {
      const data = await database.list('resource', { perPage: 100 });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data }));
      return true;
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
      return true;
    }
  }

  return false;
}
```

Checklist custom route:

- Return `true` kalau route sudah handled.
- Return `false` kalau bukan route itu.
- Selalu response JSON untuk `/api/*`.
- Gunakan `req.authUser` untuk user login.
- Gunakan `dbAuditOptsFromReq(req)` untuk create/update/delete yang perlu audit/cabang.
- Jangan bypass `checkApiPermission` kecuali route benar-benar public.

---

## 7. appjson & schema API

Page config:

| Endpoint | Fungsi |
|----------|--------|
| `GET /api/pages` | list page dari `appjson` |
| `GET /api/pages/:path` | load config page berdasarkan route |

Schema:

| Endpoint | Fungsi |
|----------|--------|
| `GET /api/schema` | list schema metadata |
| `GET /api/schema/:name` | load schema tertentu |

Catatan:

- `appjson/menu.json` tidak dianggap page biasa.
- `buildPagesIndex()` cache index appjson.
- Tambah file appjson baru biasanya perlu restart server agar index terbangun ulang.

---

## 8. Upload File API & Static File Guard

Upload file dilayani dari `/uploads/*`, tetapi tetap wajib authenticated.

Rules:

- `/data/*` tidak boleh diakses langsung.
- Upload path dinormalisasi via `uploadService`.
- File response diberi header security seperti `X-Content-Type-Options: nosniff`.
- File access dilog dengan user dan path.

Jangan:

- Serve file upload lewat static biasa.
- Return absolute filesystem path ke client.
- Simpan path upload di luar root yang diizinkan.

---

## 9. Add New Backend Endpoint

Langkah aman:

1. Tentukan apakah cukup generic CRUD.
2. Jika custom, tambah handler di `handleApiRoutes` atau service khusus.
3. Pastikan route melewati `requireApiAuth`.
4. Tambahkan permission di `role-permissions.js` atau menu config jika perlu.
5. Gunakan `database.list/create/update/remove` atau service domain.
6. Return JSON `{ success, data }` atau `{ success: false, error }`.
7. Jika dipakai UI, update `appjson` / custom page / `ApiClient` call.
8. Restart server.

---

## 10. Common Pitfalls

| Masalah | Penyebab | Fix |
|--------|----------|-----|
| API return HTML 404 | route tidak match dan jatuh ke static | pastikan path mulai `/api/` dan handler return `true` |
| 401 Unauthorized | cookie JWT tidak ada/expired | login ulang, cek `crm_token` |
| 403 Forbidden | role tidak punya method/resource | cek `role-permissions.js` dan menu permission |
| Page config tidak update | appjson cache/server belum restart | restart server |
| Upload file tidak bisa dibuka | belum login atau path salah | cek cookie dan path `/uploads/...` |
| Role cabang lihat data cabang lain | branch filtering tidak diterapkan | cek `kode_cabang`, `BRANCH_AWARE_TABLES`, dan query filter |

---

## 11. File Referensi

| Kebutuhan | File |
|----------|------|
| Main server/router | `server.js` |
| JWT/auth/password | `auth.js` |
| Role permission API | `role-permissions.js` |
| Generic CRUD DB | `database.js` |
| Upload handling | `upload-service.js`, `upload-types.js` |
| Print surat | `print-surat-service.js`, `letter-service.js` |
| Menu config service | `menu-config-service.js` |
| Frontend API caller | `core/api-client.js` |
