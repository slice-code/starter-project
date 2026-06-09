# RBAC Authorization Cheatsheet — Admin Starter

---

## 1. Mental Model

```
login → JWT (role + kode_cabang)
  → requireApiAuth (server.js)
  → checkApiPermission (role-permissions.js)
  → menu-config.json (menu + CRUD flags)
  → PageLoader.resolveCrudPermissions (frontend)
  → CrudEngine (hide create/edit/delete)
```

| Layer | File |
|------|------|
| JWT | `auth.js` |
| API matrix | `role-permissions.js` |
| Menu config | `config/menu-config.json` |
| Menu service | `menu-config-service.js` |
| Frontend RBAC | `core/rbac.js`, `core/page-loader.js` |

---

## 2. Roles (Starter)

| Role | Label | Menu |
|------|-------|------|
| `super_admin` | Owner | `*` (semua) |
| `admin` | Administrator Cabang | `/`, `/categories`, `/about` |
| `studio_admin` | Developer | `*` + studio |
| `viewer` | Viewer | read-only |

Legacy `owner` → dinormalisasi ke `super_admin`.

```js
function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  return r === 'owner' ? 'super_admin' : r;
}
```

---

## 3. Menu Config (`config/menu-config.json`)

```json
{
  "menuStructure": [ /* sidebar items */ ],
  "roles": {
    "super_admin": {
      "menuPaths": ["*"],
      "permissions": {
        "default": { "can_create": 1, "can_update": 1, "can_delete": 1 }
      }
    },
    "admin": {
      "menuPaths": ["/", "/categories", "/about"],
      "permissions": {
        "default": { "can_create": 1, "can_update": 1, "can_delete": 0 }
      }
    }
  }
}
```

Owner-only paths (client fallback di `index.js`):
- `/users`, `/datacabang`, `/profil-perusahaan`, `/menu-role-manager`

---

## 4. appjson Permissions

Array = semua action:

```json
"permissions": ["super_admin"]
```

Per action:

```json
"permissions": {
  "create": ["super_admin", "admin"],
  "read": ["super_admin", "admin", "viewer"],
  "update": ["super_admin", "admin"],
  "delete": ["super_admin"]
}
```

`PageLoader` menggabungkan role + menu config + appjson.

---

## 5. API Permission (`role-permissions.js`)

```js
const API_PERMISSIONS = {
  super_admin: { '*': ['GET','POST','PUT','PATCH','DELETE'] },
  studio_admin: { '*': ['GET','POST','PUT','PATCH','DELETE'] },
  admin: {
    categories: ['GET','POST','PUT','PATCH','DELETE'],
    '*': ['GET','POST','PUT','PATCH']
  },
  viewer: { '*': ['GET'] }
};
```

Khusus:
- `users` → hanya `super_admin` (non-GET)
- `dashboard`, `reports` → GET only

---

## 6. Branch / Cabang

| Role | `kode_cabang` |
|------|---------------|
| `super_admin` | null = semua cabang |
| `admin` | terikat cabang di JWT |
| `studio_admin` | null |

Field `kode_cabang` di `users` + `datacabang` schema.

`BRANCH_AWARE_TABLES` di starter: `[]` (kosong — tambah resource jika perlu isolasi cabang).

---

## 7. Layout Page RBAC

```js
layout.addPage({
  path: '/admin-only',
  roles: ['super_admin'],
  component: () => el('div').text('Admin').get()
});
```

Menu sidebar juga bisa `roles: ['super_admin']` per item.

---

## 8. Sync Menu ke DB

Runtime baca `config/menu-config.json` langsung.

Opsional mirror PostgreSQL:

```bash
npm run menu:sync
npm run menu:sync:dry   # preview
npm run menu:view
```

---

## 9. Menambah Role Baru

1. Tambah di `schema/users.json` enum `role`
2. Tambah di `appjson/users.json` form options
3. Tambah block `roles.{nama}` di `menu-config.json`
4. Tambah di `role-permissions.js` → `API_PERMISSIONS`
5. `npm run menu:sync`

---

## 10. Troubleshooting

| Masalah | Cek |
|--------|-----|
| Menu tidak muncul | `menuPaths` role di menu-config |
| CRUD action hilang | `permissions` appjson + menu role flags |
| API 403 | `checkApiPermission`, resource name |
| Admin lihat menu owner | `ensureOwnerMenuSidebar` di index.js |
