# Deployment & DevOps Cheatsheet — Admin Starter

---

## 1. Runtime Modes

| Mode | Command | Database |
|------|---------|----------|
| Local SQLite | `npm start` | `data.db` (tanpa `DATABASE_URL`) |
| Local dev | `npm run dev` | nodemon |
| Dev PostgreSQL | `npm run dev:setup` lalu `npm run dev` | port `5433` |
| Production Docker | `docker compose up -d --build` | PostgreSQL internal |

---

## 2. npm Scripts

| Script | Fungsi |
|--------|--------|
| `npm start` | `node server.js` |
| `npm run dev` | nodemon |
| `npm run dev:db-up` | Start PostgreSQL dev container |
| `npm run dev:db-down` | Stop dev DB |
| `npm run dev:db-reset` | Reset dev DB volume |
| `npm run dev:setup` | DB up + copy `.env.dev` → `.env.local` |
| `npm run dev:full` | DB up + nodemon |
| `npm run seed` | bootstrap + menu:sync |
| `npm run seed:bootstrap` | Cabang HQ + owner |
| `npm run seed:developer` | Akun studio_admin |
| `npm run menu:sync` | Sync menu-config → PostgreSQL |

---

## 3. Environment Variables

| Variable | Required | Fungsi |
|----------|----------|--------|
| `JWT_SECRET` | production | Secret JWT |
| `APP_PORT` | optional | Host port Docker (default `8005`) |
| `DATABASE_URL` | optional | PostgreSQL; kosong = SQLite |
| `ADMIN_EMAIL` | optional | Default `admin@localhost` |
| `ADMIN_PASSWORD` | optional | Password owner seed |
| `APP_NAME` | optional | Branding |
| `APP_SHOW_LOGIN_DEMO` | optional | Hint login di dev |

File: `.env.local` (dev), `.env.example` (template)

---

## 4. Docker Production

`docker-compose.yml`:
- `db` — PostgreSQL 16
- `app` — Node.js, port `${APP_PORT:-8005}:3004`

Entrypoint: `docker-entrypoint.sh` (tunggu DB → `node server.js`)

```bash
docker compose up -d --build
# http://localhost:8005
```

Volumes: `files/`, `data/`, `backups/` (jika dibuat manual)

---

## 5. Dev PostgreSQL

```bash
npm run dev:setup
npm run dev
# DATABASE_URL di .env.local → localhost:5433
```

`docker-compose.dev.yml` — Postgres dev di port host `5433` (nama container/user masih `pjtki_*` legacy — ganti saat fork).

---

## 6. First-Time Setup

```bash
npm install
cp .env.example .env.local   # atau npm run dev:setup
npm run seed:bootstrap
npm run menu:sync              # jika PostgreSQL
npm run dev
```

Login: `admin@localhost` / `admin123` (atau `ADMIN_PASSWORD`)

Developer: `npm run seed:developer` → `developer@localhost` / `dev123`

---

## 7. Backup Manual (tanpa script .sh)

Database PostgreSQL:

```bash
docker compose exec db pg_dump -U ${POSTGRES_USER:-pjtki} ${POSTGRES_DB:-pjtki} | gzip > backups/db_$(date +%Y%m%d).sql.gz
```

Files upload:

```bash
tar -czf backups/files_$(date +%Y%m%d).tar.gz files/ data/uploads/
```

---

## 8. Troubleshooting

| Masalah | Solusi |
|--------|--------|
| DB connection refused | `npm run dev:db-up`, cek `DATABASE_URL` |
| JWT error production | Set `JWT_SECRET` |
| Menu kosong setelah deploy | `npm run menu:sync`, cek `config/menu-config.json` |
| Page 404 | Restart server setelah tambah appjson |
| SQLite locked | Satu proses server saja |

---

## 9. File Penting

| File | Fungsi |
|------|--------|
| `server.js` | HTTP server |
| `docker-compose.yml` | Production stack |
| `docker-compose.dev.yml` | Dev PostgreSQL |
| `Dockerfile` | App image |
| `docker-entrypoint.sh` | Container startup |
| `load-env.js` | Load `.env.local` |
