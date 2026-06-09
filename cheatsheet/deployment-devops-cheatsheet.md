# Deployment & DevOps Cheatsheet

Referensi cepat untuk menjalankan, mengonfigurasi, backup/restore, dan troubleshooting environment PJTKI Bio.

---

## 1. Runtime Modes

| Mode | Command | Database | Keterangan |
|------|---------|----------|------------|
| Local simple | `npm start` | SQLite/sql.js | cepat untuk lokal tanpa PostgreSQL |
| Local dev | `npm run dev` | sesuai `.env.local` | nodemon server.js |
| Dev PostgreSQL | `npm run dev:db-up` + `npm run dev` | PostgreSQL port `5433` | pakai `docker-compose.dev.yml` |
| Production Docker | `docker compose up -d --build` | PostgreSQL internal `db:5432` | app expose `APP_PORT` default `8005` |

Package scripts penting:

| Script | Fungsi |
|--------|--------|
| `npm start` | run `node server.js` |
| `npm run dev` | run `nodemon server.js` |
| `npm run dev:db-up` | start PostgreSQL dev container |
| `npm run dev:db-down` | stop PostgreSQL dev container |
| `npm run dev:db-reset` | reset PostgreSQL dev volume |
| `npm run dev:setup` | start DB dev + copy `.env.dev` ke `.env.local` |
| `npm run dev:full` | start DB dev lalu nodemon |
| `npm run seed:bootstrap` | seed bootstrap data |
| `npm run seed:menu` | seed legacy menu mapping |
| `npm run menu:sync` | sync menu config |
| `npm run menu:sync:dry` | preview menu sync |

---

## 2. Production Docker Stack

`docker-compose.yml` services:

| Service | Container | Fungsi |
|---------|-----------|--------|
| `db` | `pjtki-postgres` | PostgreSQL 16 alpine |
| `app` | `pjtki-app` | Node.js app |

Network:

```txt
pjtki
```

Important mapping:

```yaml
app:
  ports:
    - "${APP_PORT:-8005}:3004"
  environment:
    DATABASE_URL: postgres://...@db:5432/...
```

Rules:

- PostgreSQL production tidak diexpose ke host.
- App connect ke DB pakai hostname internal `db`.
- External access ke app lewat `APP_PORT`, default `8005`.
- Container app root filesystem read-only; writable path lewat volume/tmpfs.

---

## 3. Production Volumes

| Volume/Mount | Purpose |
|--------------|---------|
| `pjtki_pgdata` | data PostgreSQL production |
| `./files:/app/files` | uploaded/generated files |
| `./data:/app/data` | local data folder |
| `./backups:/app/backups` | backup storage |
| `/tmp` tmpfs | runtime temp files |

Rules:

- Jangan simpan upload penting di dalam container filesystem non-volume.
- Backup harus menyertakan DB dan folder file/upload.
- Jangan delete named volume kecuali benar-benar ingin reset DB.

---

## 4. Required Environment Variables

Production essentials:

| Variable | Required | Fungsi |
|----------|----------|--------|
| `JWT_SECRET` | yes | secret JWT; wajib production |
| `APP_PORT` | optional | host port app, default `8005` |
| `POSTGRES_USER` | optional | default `pjtki` |
| `POSTGRES_PASSWORD` | optional | default `pjtki` |
| `POSTGRES_DB` | optional | default `pjtki` |
| `GOOGLE_API_KEY` | optional | OCR Gemini |
| `GEMINI_OCR_MODEL` | optional | default `gemini-2.5-flash` |

Production JWT rule:

```txt
JWT_SECRET is required. Generate with: openssl rand -base64 64
```

Catatan:

- Jangan commit secret production.
- `.env` dibaca oleh Docker compose app service.
- `.env.local` biasanya untuk local/dev runtime.
- `.env.dev` dipakai setup dev PostgreSQL.

---

## 5. Development PostgreSQL

`docker-compose.dev.yml`:

| Item | Value |
|------|-------|
| service | `postgres` |
| container | `pjtki-dev-db` |
| image | `postgres:16-alpine` |
| host port | `5433` |
| container port | `5432` |
| db | `pjtki_dev` |
| user | `pjtki_dev` |
| password | `dev_password_123` |
| volume | `dev_data` |

Typical flow:

```bash
npm run dev:db-up
npm run dev
```

Full setup:

```bash
npm run dev:setup
npm run dev
```

Reset dev DB:

```bash
npm run dev:db-reset
```

Warning:

- Reset dev DB removes dev volume data.
- Production volume must not be reset casually.

---

## 6. Nodemon Watch Scope

`package.json` nodemon watches:

- `server.js`
- `load-env.js`
- `database.js`
- `database/`
- `auth.js`
- `upload-service.js`
- `upload-types.js`
- `letter-service.js`
- `biodata-merge-context.js`
- `print-surat-service.js`
- `role-permissions.js`
- `menu-config-service.js`
- `config/menu-config.json`
- `app-config.js`
- `services/`

Ignored:

- `node_modules`
- `core`
- `data`
- `files`
- `library`
- `layouting`

Implication:

- Change backend/service files: nodemon restarts.
- Change frontend `core/*` or `layouting/*`: browser reload may be enough, server may not restart.
- Add new `appjson` page: server restart is safest because appjson index is cached.

---

## 7. Common Docker Commands

Production:

```bash
docker compose up -d --build
```

Logs:

```bash
docker compose logs -f app
```

Stop services:

```bash
docker compose down
```

Dev DB:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Stop dev DB:

```bash
docker compose -f docker-compose.dev.yml down
```

Do not use volume reset unless you want data loss.

---

## 8. Backup & Restore Files

Scripts available:

| Script | Fungsi |
|--------|--------|
| `backup-db.sh` | backup database |
| `backup-files.sh` | backup uploaded/generated files |
| `backup-all.sh` | backup DB + files |
| `backup-cron.sh` | cron-oriented backup wrapper |
| `restore-db.sh` | restore database |
| `restore-files.sh` | restore files |
| `restore-all.sh` | restore DB + files |

Backup checklist:

- Backup DB.
- Backup `files/`.
- Backup `data/` if local DB/data mode used.
- Store backup outside application container.
- Test restore on dev/staging before production.

---

## 9. Deployment Checklist

Before production deploy:

1. Set strong `JWT_SECRET`.
2. Confirm `.env` values.
3. Confirm `APP_PORT` is available.
4. Confirm `files/`, `data/`, `backups/` directories exist and writable by Docker volume mount.
5. Run DB backup if updating existing deployment.
6. Deploy with Docker compose.
7. Check app logs.
8. Login as owner/admin.
9. Verify menu loads.
10. Verify one CRUD list page.
11. Verify upload/print if deployment touches files/templates.

---

## 10. Menu/Config Sync After Deploy

If menu config changed:

```bash
npm run menu:sync:dry
npm run menu:sync
```

If using legacy menu role mapping:

```bash
npm run seed:menu
```

After sync:

- Logout/login user.
- Check `/api/menu` response.
- Verify sidebar and CRUD buttons.

---

## 11. AppJSON / Schema Change Deploy

When adding `appjson/*.json`:

- Restart app server/container.
- Ensure menu path exists.
- Ensure role permission allows it.
- Browser hard refresh if page config cached client-side.

When adding `schema/*.json`:

- Ensure DB table exists via init/migration.
- Add migration/backfill for existing deployments.
- Restart app server/container.
- Test `GET /api/resource`.

---

## 12. Troubleshooting

| Problem | Check | Fix |
|---------|-------|-----|
| App cannot start production | `JWT_SECRET` missing | set strong `JWT_SECRET` in `.env` |
| App cannot connect DB | `DATABASE_URL`, service health | check db container and network `pjtki` |
| Host cannot connect prod DB | by design DB not exposed | exec into network/container or use dev compose for host port |
| Port already used | `APP_PORT` conflict | change `APP_PORT` |
| Page baru tidak muncul | appjson index cached | restart app/server |
| Upload cannot write | volume permission/path | check `./files` mount and container logs |
| Menu tidak update | menu config not synced/session cache | run menu sync and login ulang |
| Dev DB old data | persistent `dev_data` volume | use `npm run dev:db-reset` if safe |

---

## 13. Safety Rules

- Never reset/delete production DB volume without explicit backup and approval.
- Never deploy production without `JWT_SECRET`.
- Never expose PostgreSQL production port unless explicitly required and secured.
- Never store uploaded files only inside container layer.
- Never assume appjson/schema changes are live without restart in server mode.
- Always test role/menu after permission config changes.

---

## 14. File Referensi

| Kebutuhan | File |
|----------|------|
| Production compose | `docker-compose.yml` |
| Dev DB compose | `docker-compose.dev.yml` |
| Docker image | `Dockerfile` |
| Container entrypoint | `docker-entrypoint.sh` |
| Env loader | `load-env.js` |
| App config | `app-config.js` |
| Package scripts | `package.json` |
| PostgreSQL prod tuning | `postgresql-prod.conf` |
| PostgreSQL dev tuning | `postgresql-dev.conf` |
| Backup scripts | `backup-*.sh` |
| Restore scripts | `restore-*.sh` |
| Setup script | `setup-dev.sh` |
