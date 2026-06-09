# Backend API Cheatsheet — Admin Starter

---

## 1. Request Flow

```
HTTP → security headers
  → /api/auth/* (public login)
  → /uploads/* (files)
  → requireApiAuth
  → handleApiRoutes (custom)
  → handleCrudRoutes (generic)
  → static / SPA
```

---

## 2. Auth (`auth.js`)

Cookie JWT `crm_token` (HttpOnly).

| Endpoint | Method | Auth |
|----------|--------|------|
| `/api/auth/login` | POST | Public |
| `/api/auth/logout` | POST | Yes |
| `/api/auth/me` | GET | Yes |

---

## 3. Menu & Config

| Endpoint | Fungsi |
|----------|--------|
| `GET /api/menu` | Menu sidebar + permissions per role |
| `GET /api/app-config` | Branding public |
| `GET /api/pages` | Daftar halaman appjson |
| `POST /api/pages/bulk` | Bulk load page config |

---

## 4. Dashboard & Notifikasi

| Endpoint | Fungsi |
|----------|--------|
| `GET /api/dashboard` | Stat users, branches, categories, resources |
| `GET /api/notifications` | Notifikasi navbar (`app_notifications`) |

---

## 5. Generic CRUD

Semua resource di `schema/`:

```
GET    /api/{resource}
GET    /api/{resource}/{id}
POST   /api/{resource}
PUT    /api/{resource}/{id}
DELETE /api/{resource}/{id}
```

Permission: `role-permissions.checkApiPermission(user, resource, method)`

---

## 6. Studio API

| Endpoint | Fungsi |
|----------|--------|
| `GET /api/studio/crud-list` | List appjson CRUD |
| `GET/POST /api/studio/crud` | Read/write CRUD config |
| `GET /api/studio/schema-list` | List schemas |
| `POST /api/studio/schema/{name}/sync-db` | Apply schema ke DB |
| `GET /api/studio/deploy-history` | Riwayat deploy |

Role: `studio_admin`, `super_admin`

---

## 7. Schema API

| Endpoint | Fungsi |
|----------|--------|
| `GET /api/schema` | List schemas |
| `GET /api/schema/{name}` | Read schema |
| `POST /api/schema` | Create |
| `PUT /api/schema/{name}` | Update |
| `DELETE /api/schema/{name}` | Delete |

---

## 8. Upload

| Endpoint | Fungsi |
|----------|--------|
| `GET /uploads/...` | Serve file |
| `GET /api/upload-types` | Daftar tipe upload |

Tipe starter: `upload_document`, `upload_image`, `upload_attachment` (`upload-types.js`).

---

## 9. Response Format

```json
{ "success": true, "data": { } }
{ "success": false, "error": "message" }
```

List:

```json
{
  "success": true,
  "data": [ ],
  "meta": { "page": 1, "perPage": 25, "total": 100 }
}
```

---

## 10. File Penting

| File | Fungsi |
|------|--------|
| `server.js` | Router utama |
| `database.js` | CRUD data layer |
| `auth.js` | JWT |
| `role-permissions.js` | API matrix |
| `menu-config-service.js` | Menu dari JSON |
