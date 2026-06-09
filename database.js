// ============================================
// Database Module - SQLite via sql.js (WASM, tanpa native addon)
// ============================================
// Reads schema/*.json → creates tables → provides CRUD operations
// ============================================

const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");
const { HUB_TYPES, ALL_TYPES, isAllowed } = require("./upload-types");
const bcrypt = require("bcryptjs");
const pgDriver = require("./database/pg-driver");
const appConfig = require("./app-config");
// Inline stubs for legacy services
const biodataMenuConfig = {
  menuKeysToTabRows: () => [],
  getSectorMenuKeys: () => [],
  getAllowedMenuUrls: () => [],
  getAllSectorCodes: () => []
};

const {
  DASHBOARD_ROLES,
  normalizeRole,
  isOwnerRole,
  isAdminCabangRole,
} = require("./role-permissions");

const OWNER_ONLY_MENU_PATHS = new Set([
  "/users",
  "/datacabang",
  "/profil-perusahaan",
  "/menu-role-manager",
]);

const DB_PATH = path.join(__dirname, "data.db");
const SCHEMA_DIR = path.join(__dirname, "schema");

let sqlDb = null;
let db = null;
let dialect = "sqlite";

const _idTkiService = {
  resolveActiveIdBiodata: async () => null,
  isIdTki: () => false,
  ensureIdTkiBackfill: async () => ({})
};

function getIdTkiService() {
  return _idTkiService;
}

function getDbApi() {
  return {
    getByField,
    getById,
    create,
    update,
    list,
    queryAll: dbAllRows,
    getTableNames,
    getNextBiodataSequence,
    assertPersonalIdBiodataUnique,
  };
}

async function resolveBiodataInputId(input) {
  const key = String(input || "").trim();
  if (!key) return "";
  const resolved = await getIdTkiService().resolveActiveIdBiodata(
    getDbApi(),
    key,
  );
  if (resolved) return resolved;
  if (getIdTkiService().isIdTki(key)) return "";
  return key;
}

function isPostgres() {
  return dialect === "postgres";
}

// Normalisasi hasil query (pg mengembalikan bigint sebagai string)
function normalizeRow(row) {
  if (!row || !isPostgres()) return row;
  const out = { ...row };
  for (const key of Object.keys(out)) {
    if (typeof out[key] === "bigint") out[key] = Number(out[key]);
  }
  return out;
}

function normalizeRows(rows) {
  return (rows || []).map(normalizeRow);
}

async function q(stmt, method, ...params) {
  const result = stmt[method](...params);
  return result instanceof Promise ? result : result;
}

function persistDb() {
  if (!sqlDb) return;
  const data = sqlDb.export();
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, Buffer.from(data));
  fs.renameSync(tmpPath, DB_PATH);
}

function getLastInsertRowid() {
  const row = sqlDb.exec("SELECT last_insert_rowid() AS id");
  if (!row[0]?.values[0]) return 0;
  return row[0].values[0][0];
}

// sql.js named binds require keys with @ / : / $ prefix (e.g. @stage), not bare names
function toNamedBindParams(obj) {
  const bound = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith("@") || key.startsWith(":") || key.startsWith("$")) {
      bound[key] = value;
    } else {
      bound[`@${key}`] = value;
    }
  }
  return bound;
}

function bindStatement(stmt, params) {
  if (!params || (Array.isArray(params) && params.length === 0)) return;
  if (
    params.length === 1 &&
    params[0] != null &&
    typeof params[0] === "object" &&
    !Array.isArray(params[0])
  ) {
    stmt.bind(toNamedBindParams(params[0]));
    return;
  }
  if (params.length === 1 && Array.isArray(params[0])) {
    stmt.bind(params[0]);
    return;
  }
  stmt.bind(params);
}

function createStatement(sql) {
  return {
    all(...params) {
      const stmt = sqlDb.prepare(sql);
      try {
        bindStatement(stmt, params);
        const rows = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        return rows;
      } finally {
        stmt.free();
      }
    },
    get(...params) {
      const rows = this.all(...params);
      return rows[0];
    },
    run(...params) {
      const stmt = sqlDb.prepare(sql);
      try {
        bindStatement(stmt, params);
        stmt.step();
        const result = {
          changes: sqlDb.getRowsModified(),
          lastInsertRowid: getLastInsertRowid(),
        };
        persistDb();
        return result;
      } finally {
        stmt.free();
      }
    },
  };
}

function createDbWrapper() {
  return {
    exec(sql) {
      sqlDb.exec(sql);
      persistDb();
    },
    pragma(statement) {
      try {
        sqlDb.run(`PRAGMA ${statement}`);
      } catch {
        /* pragma opsional (mis. WAL) */
      }
    },
    prepare(sql) {
      return createStatement(sql);
    },
    transaction(fn) {
      return async (...args) => {
        sqlDb.run("BEGIN");
        try {
          const result = await Promise.resolve(fn(...args));
          sqlDb.run("COMMIT");
          persistDb();
          return result;
        } catch (e) {
          try {
            sqlDb.run("ROLLBACK");
          } catch {
            /* ignore */
          }
          throw e;
        }
      };
    },
  };
}

// SQLite type mapping from schema field types
function mapFieldType(field) {
  const raw = String(field.type || "text").toUpperCase();
  const sqlDirect = {
    INTEGER: "INTEGER",
    TEXT: "TEXT",
    REAL: "REAL",
    BLOB: "BLOB",
    BOOLEAN: "INTEGER",
    DATE: "TEXT",
    DATETIME: "TEXT",
  };
  if (sqlDirect[raw]) return sqlDirect[raw];

  const typeMap = {
    number:
      field.name.includes("price") ||
      field.name.includes("amount") ||
      field.name.includes("value") ||
      field.name.includes("revenue")
        ? "REAL"
        : "INTEGER",
    text: "TEXT",
    email: "TEXT",
    password: "TEXT",
    textarea: "TEXT",
    url: "TEXT",
    boolean: "INTEGER",
    date: "TEXT",
    datetime: "TEXT",
    time: "TEXT",
    select: "TEXT",
    radio: "TEXT",
    checkbox: "INTEGER",
    file: "TEXT",
    image: "TEXT",
    json: "TEXT",
    enum: "TEXT",
  };
  return typeMap[field.type] || "TEXT";
}

function getFieldDefault(field) {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.default !== undefined) return field.default;
  return undefined;
}

function formatDefault(defVal) {
  if (defVal === undefined) return undefined;
  if (typeof defVal === "boolean") return defVal ? 1 : 0;
  if (typeof defVal === "string")
    return `'${String(defVal).replace(/'/g, "''")}'`;
  return defVal;
}

// Generate CREATE TABLE SQL from schema JSON
function schemaToCreateSQL(schema) {
  const pk = schema.primaryKey || "id";
  const lines = [];

  for (const field of schema.fields) {
    const isPk = field.name === pk || field.primaryKey;
    if (isPk) {
      if (field.type === "text" || field.type === "string") {
        lines.push(`  "${field.name}" TEXT PRIMARY KEY`);
      } else if (isPostgres()) {
        lines.push(`  "${field.name}" SERIAL PRIMARY KEY`);
      } else {
        lines.push(`  "${field.name}" INTEGER PRIMARY KEY AUTOINCREMENT`);
      }
      continue;
    }

    let col = `  "${field.name}" ${mapFieldType(field)}`;
    if (field.required) col += " NOT NULL";
    const defVal = getFieldDefault(field);
    if (defVal !== undefined) {
      col += ` DEFAULT ${formatDefault(defVal)}`;
    }
    lines.push(col);
  }

  if (schema.timestamps) {
    if (schema.timestamps.createdAt) {
      lines.push(
        isPostgres()
          ? `  "${schema.timestamps.createdAt}" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
          : `  "${schema.timestamps.createdAt}" DATETIME DEFAULT CURRENT_TIMESTAMP`,
      );
    }
    if (schema.timestamps.updatedAt) {
      lines.push(
        isPostgres()
          ? `  "${schema.timestamps.updatedAt}" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
          : `  "${schema.timestamps.updatedAt}" DATETIME DEFAULT CURRENT_TIMESTAMP`,
      );
    }
  }

  return `CREATE TABLE IF NOT EXISTS "${schema.name}" (\n${lines.join(",\n")}\n);`;
}

/** Salin kolom legacy markf.tanggal → tgl_bank setelah rename schema */
async function migrateBukaRekeningIdTki() {
  if (!getTableNames().includes("buka_rekening_baru")) return;
  try {
    const sql = isPostgres()
      ? `UPDATE buka_rekening_baru br SET id_tki = UPPER(TRIM(p.id_tki))
         FROM personal p
         WHERE p.id_biodata = br.id_biodata
           AND (br.id_tki IS NULL OR TRIM(br.id_tki) = '')
           AND NULLIF(TRIM(p.id_tki), '') IS NOT NULL`
      : `UPDATE buka_rekening_baru SET id_tki = (
           SELECT UPPER(TRIM(p.id_tki)) FROM personal p
           WHERE p.id_biodata = buka_rekening_baru.id_biodata LIMIT 1
         ) WHERE (id_tki IS NULL OR TRIM(id_tki) = '') AND id_biodata IS NOT NULL`;
    await q(db.prepare(sql), "run");
  } catch (e) {
    console.warn("[DB] migrateBukaRekeningIdTki:", e.message);
  }
}

async function migrateMarkfTglBank() {
  const tables = getTableNames();
  if (!tables.includes("markf")) return;
  try {
    let cols = [];
    if (isPostgres()) {
      const rows = await q(
        db.prepare(`
          SELECT column_name AS name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'markf'
        `),
        "all",
      );
      cols = rows.map((c) => c.name);
    } else {
      cols = db
        .prepare('PRAGMA table_info("markf")')
        .all()
        .map((c) => c.name);
    }
    if (!cols.includes("tgl_bank") || !cols.includes("tanggal")) return;
    const sql = isPostgres()
      ? `UPDATE markf SET tgl_bank = tanggal
         WHERE (tgl_bank IS NULL OR TRIM(tgl_bank::text) = '')
           AND tanggal IS NOT NULL AND TRIM(tanggal::text) <> ''`
      : `UPDATE markf SET tgl_bank = tanggal
         WHERE (tgl_bank IS NULL OR TRIM(tgl_bank) = '')
           AND tanggal IS NOT NULL AND TRIM(tanggal) != ''`;
    const res = await q(db.prepare(sql), "run");
    const changed = res?.changes ?? res?.rowCount ?? 0;
    if (changed > 0) {
      console.log(`[DB] Migrated markf.tanggal → tgl_bank (${changed} rows)`);
    }
  } catch (e) {
    console.warn("[DB] migrateMarkfTglBank:", e.message);
  }
}

// Tambah kolom baru dari schema ke tabel yang sudah ada (migrasi ringan)
async function syncSchemaColumns(schemas) {
  for (const schema of Object.values(schemas)) {
    let existing = [];
    try {
      if (isPostgres()) {
        const rows = await q(
          db.prepare(`
            SELECT column_name AS name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ?
          `),
          "all",
          schema.name,
        );
        existing = rows.map((c) => c.name);
      } else {
        existing = db
          .prepare(`PRAGMA table_info("${schema.name}")`)
          .all()
          .map((c) => c.name);
      }
    } catch {
      continue;
    }
    if (existing.length === 0) continue;

    const pk = schema.primaryKey || "id";
    for (const field of schema.fields) {
      if (field.name === pk || field.autoIncrement) continue;
      if (existing.includes(field.name)) continue;

      let col = `"${field.name}" ${mapFieldType(field)}`;
      const defVal = getFieldDefault(field);
      if (defVal !== undefined) {
        col += ` DEFAULT ${formatDefault(defVal)}`;
      }
      try {
        const alterSql = isPostgres()
          ? `ALTER TABLE "${schema.name}" ADD COLUMN IF NOT EXISTS ${col}`
          : `ALTER TABLE "${schema.name}" ADD COLUMN ${col}`;
        await q(db.prepare(alterSql), "run");
        console.log(`[DB] Migrated column ${schema.name}.${field.name}`);
      } catch (e) {
        console.warn(
          `[DB] Skip migrate ${schema.name}.${field.name}:`,
          e.message,
        );
      }
    }
  }
}

/** SQL untuk CREATE atau ALTER kolom baru (tanpa eksekusi) */
function schemaToSyncSQL(schema, existingColumnNames = []) {
  const existing = new Set(existingColumnNames);
  const lines = [];
  if (!existing.size) {
    lines.push(schemaToCreateSQL(schema));
    return lines.join("\n");
  }
  const pk = schema.primaryKey || "id";
  for (const field of schema.fields) {
    if (field.name === pk || field.autoIncrement) continue;
    if (existing.has(field.name)) continue;
    let col = `"${field.name}" ${mapFieldType(field)}`;
    const defVal = getFieldDefault(field);
    if (defVal !== undefined) {
      col += ` DEFAULT ${formatDefault(defVal)}`;
    }
    lines.push(
      isPostgres()
        ? `ALTER TABLE "${schema.name}" ADD COLUMN IF NOT EXISTS ${col};`
        : `ALTER TABLE "${schema.name}" ADD COLUMN ${col};`,
    );
  }
  if (!lines.length) {
    lines.push(`-- Tabel "${schema.name}" sudah sinkron dengan schema JSON`);
  }
  return lines.join("\n");
}

/** Bandingkan schema JSON vs kolom aktual di DB */
async function getSchemaDbStatus(tableName) {
  const schema = getSchema(tableName);
  if (!schema) {
    return { success: false, error: `Schema "${tableName}" not found` };
  }
  const dbCols = await getTableColumnInfo(tableName);
  const schemaFieldNames = (schema.fields || []).map((f) => f.name);
  const ts = schema.timestamps || {};
  const tsNames = [ts.createdAt, ts.updatedAt].filter(Boolean);
  const dbColNames = dbCols.map((c) => c.name);
  const tableExists = dbColNames.length > 0;
  const missingInDb = schemaFieldNames.filter((n) => !dbColNames.includes(n));
  const extraInDb = dbColNames.filter(
    (n) => !schemaFieldNames.includes(n) && !tsNames.includes(n),
  );
  return {
    success: true,
    tableName,
    tableExists,
    schemaFieldCount: schemaFieldNames.length,
    dbColumnCount: dbColNames.length,
    missingInDb,
    extraInDb,
    dbColumns: dbCols,
    syncSql: schemaToSyncSQL(schema, dbColNames),
    inSync: missingInDb.length === 0,
  };
}

/** CREATE IF NOT EXISTS + tambah kolom baru untuk satu tabel */
async function syncSingleSchemaTable(tableName) {
  const schema = getSchema(tableName);
  if (!schema) {
    return { success: false, error: `Schema "${tableName}" not found` };
  }
  const before = (await getTableColumnInfo(tableName)).map((c) => c.name);
  const sql = schemaToCreateSQL(schema);
  if (isPostgres()) {
    await db.exec(sql);
  } else {
    db.exec(sql);
  }
  await syncSchemaColumns({ [tableName]: schema });
  const after = (await getTableColumnInfo(tableName)).map((c) => c.name);
  const addedColumns = after.filter((n) => !before.includes(n));
  return {
    success: true,
    message: `Database synced for "${tableName}"`,
    addedColumns,
    tableExists: after.length > 0,
  };
}

// Load all schemas from /schema folder
function loadSchemas() {
  const schemas = {};
  if (!fs.existsSync(SCHEMA_DIR)) return schemas;

  const files = fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    try {
      const content = JSON.parse(
        fs.readFileSync(path.join(SCHEMA_DIR, file), "utf8"),
      );
      if (content.name) {
        schemas[content.name] = content;
      }
    } catch (e) {
      console.warn(`Failed to parse schema file ${file}:`, e.message);
    }
  }
  return schemas;
}

async function migrateDatatkiMasterTable(schemas) {
  const schema = schemas?.datatki;
  if (!schema || !getTableNames().includes("datatki")) return;
  try {
    let idTkiType = "";
    if (isPostgres()) {
      const rows = await dbAllRows(
        `SELECT data_type FROM information_schema.columns WHERE table_name = 'datatki' AND column_name = 'id_tki' LIMIT 1`,
      );
      idTkiType = String(rows?.[0]?.data_type || "").toLowerCase();
    } else {
      const rows = sqlDb.exec(`PRAGMA table_info("datatki")`);
      const cols = rows?.[0]?.values || [];
      const col = cols.find((c) => c[1] === "id_tki");
      idTkiType = String(col?.[2] || "").toLowerCase();
    }
    if (
      idTkiType &&
      !["text", "character varying", "varchar"].includes(idTkiType)
    ) {
      if (isPostgres()) {
        await db.exec("DROP TABLE IF EXISTS datatki CASCADE");
      } else {
        db.exec("DROP TABLE IF EXISTS datatki");
      }
      await db.exec(schemaToCreateSQL(schema));
      console.log("[DB] Recreated datatki master table (id_tki TEXT PK)");
    }
  } catch (e) {
    console.warn("[DB] migrate datatki master:", e.message);
  }
}

async function initSqlite() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    sqlDb = new SQL.Database(fileBuffer);
  } else {
    sqlDb = new SQL.Database();
  }

  db = createDbWrapper();
  db.pragma("foreign_keys = ON");
  dialect = "sqlite";

  const schemas = loadSchemas();
  const tableNames = [];

  for (const [name, schema] of Object.entries(schemas)) {
    const sql = schemaToCreateSQL(schema);
    console.log(`[DB] Creating table if not exists: ${name}`);
    db.exec(sql);
    tableNames.push(name);
  }

  await syncSchemaColumns(schemas);
  await migrateDatatkiMasterTable(schemas);
  await migrateMarkfTglBank();
  await migrateBukaRekeningIdTki();
  await ensureIndexes();
  _papHeaderPkCol = null;
  _papDetailPkCol = null;

  console.log(
    `[DB] SQLite ready at ${DB_PATH} (tables: ${tableNames.join(", ")})`,
  );
  await seedSampleData();
  try {
    await require("./services/jurnal-keuangan-service").seedDefaultCoa(
      getDbApi(),
    );
  } catch (e) {
    console.warn("[DB] seedDefaultCoa:", e.message);
  }
  await backfillActivityDueDates();
  await backfillPersonalDemoSponsor();
  await backfillKriteriaPekerjaanId();
  await seedMasterPekerjaanDemo();
  await seedBiodataReadinessDemo();
  try {
    const backfill = await getIdTkiService().ensureIdTkiBackfill(getDbApi());
    if (backfill.personal || backfill.datatki) {
      console.log(
        `[DB] id_tki backfill: personal=${backfill.personal}, datatki=${backfill.datatki}`,
      );
    }
  } catch (e) {
    console.warn("[DB] id_tki backfill:", e.message);
  }
  persistDb();
  return db;
}

async function initPostgres() {
  dialect = "postgres";
  db = await pgDriver.connect();
  sqlDb = null;
  persistDb = () => {};

  const schemas = loadSchemas();
  const tableNames = [];

  for (const [name, schema] of Object.entries(schemas)) {
    const sql = schemaToCreateSQL(schema);
    console.log(`[DB] Creating table if not exists: ${name}`);
    await db.exec(sql);
    tableNames.push(name);
  }

  await syncSchemaColumns(schemas);
  await migrateDatatkiMasterTable(schemas);
  await migrateMarkfTglBank();
  await migrateBukaRekeningIdTki();
  await ensureIndexes();
  _papHeaderPkCol = null;
  _papDetailPkCol = null;

  console.log(`[DB] PostgreSQL ready (tables: ${tableNames.join(", ")})`);
  await seedSampleData();
  try {
    await require("./services/jurnal-keuangan-service").seedDefaultCoa(
      getDbApi(),
    );
  } catch (e) {
    console.warn("[DB] seedDefaultCoa:", e.message);
  }
  await backfillActivityDueDates();
  await backfillPersonalDemoSponsor();
  await backfillKriteriaPekerjaanId();
  await seedMasterPekerjaanDemo();
  await seedBiodataReadinessDemo();
  try {
    const backfill = await getIdTkiService().ensureIdTkiBackfill(getDbApi());
    if (backfill.personal || backfill.datatki) {
      console.log(
        `[DB] id_tki backfill: personal=${backfill.personal}, datatki=${backfill.datatki}`,
      );
    }
  } catch (e) {
    console.warn("[DB] id_tki backfill:", e.message);
  }
  return db;
}

// Initialize database: open connection + create tables from schemas
async function init() {
  if (pgDriver.usePostgres()) {
    return initPostgres();
  }
  return initSqlite();
}

const DUPLICATE_ID_BIODATA_MSG =
  "ID Biodata sudah digunakan. Gunakan kode unik (contoh: FF-0002).";
const INVALID_NIK_MSG = "NIK wajib diisi (16 digit angka).";

function normalizeNik(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 16 ? digits : "";
}

/** Validasi format NIK 16 digit */
function assertPersonalNikFormat(nik) {
  const normalized = normalizeNik(nik);
  if (!normalized) throw new Error(INVALID_NIK_MSG);
  return normalized;
}

/** Cegah duplikat NIK nasional di tabel personal */
async function assertPersonalNikUnique(nik, excludeRowId = null) {
  const normalized = assertPersonalNikFormat(nik);
  const existing = await getByField("personal", "nik", normalized);
  if (existing) {
    const isSameRow =
      excludeRowId != null && Number(existing.id) === Number(excludeRowId);
    if (!isSameRow) {
      const bid = existing.id_biodata || "—";
      const nama = existing.nama ? ` (${existing.nama})` : "";
      throw new Error(`NIK sudah terdaftar pada biodata ${bid}${nama}`);
    }
  }
  return normalized;
}

/** Normalisasi kode TKI agar konsisten (trim + huruf besar) */
function normalizeIdBiodata(value) {
  return String(value == null ? "" : value)
    .trim()
    .toUpperCase();
}

function isUniqueConstraintError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  if (err?.code === "23505") return true;
  return (
    msg.includes("unique constraint") ||
    msg.includes("duplicate key") ||
    msg.includes("unique failed")
  );
}

/** Cegah duplikat id_biodata di tabel personal */
async function assertPersonalIdBiodataUnique(idBiodata, excludeRowId = null) {
  const normalized = normalizeIdBiodata(idBiodata);
  if (!normalized) throw new Error("ID Biodata wajib diisi");

  const existing = await getByField("personal", "id_biodata", normalized);
  if (existing) {
    const isSameRow =
      excludeRowId != null && Number(existing.id) === Number(excludeRowId);
    if (!isSameRow) {
      throw new Error(DUPLICATE_ID_BIODATA_MSG);
    }
  }
  return normalized;
}

async function ensureUniquePersonalIdBiodataIndex() {
  try {
    const dupSql = isPostgres()
      ? `SELECT id_biodata FROM personal WHERE TRIM(COALESCE(id_biodata, '')) != ''
         GROUP BY id_biodata HAVING COUNT(*)::int > 1 LIMIT 5`
      : `SELECT id_biodata FROM personal WHERE TRIM(COALESCE(id_biodata, '')) != ''
         GROUP BY id_biodata HAVING COUNT(*) > 1 LIMIT 5`;
    const dups = await q(db.prepare(dupSql), "all");
    if (dups.length > 0) {
      const ids = dups.map((d) => d.id_biodata).join(", ");
      console.warn(
        `[DB] Duplikat id_biodata masih ada (${ids}) — perbaiki data lalu restart untuk unique index.`,
      );
      return;
    }
    const sql =
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_personal_id_biodata_unique ON personal(id_biodata)";
    if (isPostgres()) await db.exec(sql);
    else db.exec(sql);
  } catch (e) {
    console.warn("[DB] Unique index personal.id_biodata:", e.message);
  }
}

// Index performa — domain TKI
async function ensureIndexes() {
  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_personal_statusaktif ON personal(statusaktif)",
    "CREATE INDEX IF NOT EXISTS idx_personal_statterbang ON personal(statterbang)",
    "CREATE INDEX IF NOT EXISTS idx_personal_id_biodata ON personal(id_biodata)",
    "CREATE INDEX IF NOT EXISTS idx_datatki_tanggaldaftar ON datatki(tanggaldaftar)",
    "CREATE INDEX IF NOT EXISTS idx_datatki_kode_sektor ON datatki(kode_sektor)",
    "CREATE INDEX IF NOT EXISTS idx_datatki_kode_cabang ON datatki(kode_cabang)",
    "CREATE INDEX IF NOT EXISTS idx_pembayaran_tki_id_tki ON pembayaran_tki(id_tki)",
    "CREATE INDEX IF NOT EXISTS idx_piutang_tki_id_tki ON piutang_tki(id_tki)",
    "CREATE INDEX IF NOT EXISTS idx_buka_rekening_id_tki ON buka_rekening_baru(id_tki)",
    "CREATE INDEX IF NOT EXISTS idx_family_id_biodata ON family(id_biodata)",
    "CREATE INDEX IF NOT EXISTS idx_visa_id_biodata ON visa(id_biodata)",
    "CREATE INDEX IF NOT EXISTS idx_majikan_id_biodata ON majikan(id_biodata)",
    "CREATE INDEX IF NOT EXISTS idx_disnaker_id_biodata ON disnaker(id_biodata)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_datacabang_kode ON datacabang(kode_cabang)",
  ];
  for (const sql of indexes) {
    try {
      if (isPostgres()) await db.exec(sql);
      else db.exec(sql);
    } catch {
      /* tabel belum ada */
    }
  }
  await ensureUniquePersonalIdBiodataIndex();
}

const AUDIT_TABLES = new Set([
  "personal",
  "family",
  "visa",
  "majikan",
  "disnaker",
  "medical",
  "paspor",
  "dokumen",
]);

async function insertAuditLog(
  entityType,
  entityId,
  action,
  oldVals,
  newVals,
  userId = 1,
) {
  try {
    await q(
      db.prepare(`
      INSERT INTO activity_logs (entity_type, entity_id, action, old_values, new_values, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `),
      "run",
      entityType,
      entityId,
      action,
      oldVals ? JSON.stringify(oldVals) : null,
      newVals ? JSON.stringify(newVals) : null,
      userId,
    );
  } catch (e) {
    if (
      /activity_logs|relation .* does not exist|no such table/i.test(
        e.message || "",
      )
    )
      return;
    console.warn("[DB] Audit log skipped:", e.message);
  }
}

function prepareRowData(table, data) {
  const d = { ...data };
  const schema = getSchema(table);
  if (schema?.fields) {
    for (const field of schema.fields) {
      if (Object.prototype.hasOwnProperty.call(d, field.name)) {
        d[field.name] = coerceSchemaFieldValue(field, d[field.name]);
      }
    }
  }
  if (table === "deal_products") {
    const qty = parseFloat(d.quantity) || 1;
    const price = parseFloat(d.unit_price) || 0;
    const disc = parseFloat(d.discount) || 0;
    d.total_price = Math.max(0, qty * price - disc);
  }
  if (table === "quotes") {
    const sub = parseFloat(d.subtotal) || 0;
    const tax = parseFloat(d.tax) || 0;
    d.total = sub + tax;
  }
  return d;
}

/** Akun demo BLK — ditambahkan otomatis jika belum ada (DB lama) */
async function ensureDemoBlkUser() {
  try {
    const email = "blk.malang@pjtki.local";
    const exists = Number(
      (
        await q(
          db.prepare("SELECT COUNT(*) as c FROM users WHERE email = ?"),
          "get",
          email,
        )
      ).c,
    );
    if (exists > 0) return;
    const defaultPassword = "pjtki123";
    const hashedPassword = bcrypt.hashSync(defaultPassword, 10);
    const insUser = db.prepare(
      "INSERT INTO users (name, email, role, kode_cabang, phone, password, status) VALUES (?, ?, ?, ?, ?, ?, 'active')",
    );
    await q(
      insUser,
      "run",
      "Bagian BLK Malang",
      email,
      "blk",
      "MLG",
      "",
      hashedPassword,
    );
    console.log(
      `[DB] Seeded demo BLK user (${email}, password: ${defaultPassword})`,
    );
  } catch (err) {
    console.warn("[DB] ensureDemoBlkUser:", err.message);
  }
}

// Data contoh (hanya jika tabel kosong) — email admin dari env (app-config)
async function seedSampleData() {
  try {
    const branding = appConfig.getAppConfig();

    // Cek apakah demo users sudah ada (berdasarkan email super_admin)
    const superAdminExists = Number(
      (
        await q(
          db.prepare(
            "SELECT COUNT(*) as c FROM users WHERE email = 'admin@pjtki.local'",
          ),
          "get",
        )
      ).c,
    );

    if (superAdminExists === 0) {
      const defaultPassword = "pjtki123";
      const hashedPassword = bcrypt.hashSync(defaultPassword, 10);

      // Demo users sesuai RINGKASAN AKUN DEMO
      const demoUsers = [
        // [name, email, role, kode_cabang, phone]
        ["Super Admin", "admin@pjtki.local", "super_admin", null, ""],
        ["Admin Malang", "admin.malang@pjtki.local", "admin", "MLG", ""],
        ["Admin Surabaya", "admin.surabaya@pjtki.local", "admin", "SBY", ""],
        ["Admin Semarang", "admin.semarang@pjtki.local", "admin", "SMG", ""],
        ["Admin Jakarta", "admin.jakarta@pjtki.local", "admin", "JKT", ""],
        [
          "Bagian Bio Malang",
          "bio.malang@pjtki.local",
          "bagian_bio",
          "MLG",
          "",
        ],
        [
          "Bagian Bio Surabaya",
          "bio.surabaya@pjtki.local",
          "bagian_bio",
          "SBY",
          "",
        ],
        [
          "Bagian Foto Malang",
          "foto.malang@pjtki.local",
          "bagian_foto",
          "MLG",
          "",
        ],
        [
          "Marketing Malang",
          "marketing.malang@pjtki.local",
          "marketing",
          "MLG",
          "",
        ],
        [
          "Keuangan Malang",
          "keuangan.malang@pjtki.local",
          "keuangan",
          "MLG",
          "",
        ],
        ["Data Master", "datamaster@pjtki.local", "data_master", null, ""],
        ["Staff Malang", "staff.malang@pjtki.local", "staff", "MLG", ""],
        ["Agen 001", "agen001@pjtki.local", "agen", "MLG", ""],
        ["Bagian BLK Malang", "blk.malang@pjtki.local", "blk", "MLG", ""],
        ["Developer PJTKI", "developer@pjtki.com", "studio_admin", null, ""],
      ];

      const insUser = db.prepare(
        `INSERT INTO users (name, email, role, kode_cabang, phone, password, status) VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      );
      for (const user of demoUsers) {
        await q(insUser, "run", ...user, hashedPassword);
      }

      console.log(
        `[DB] Seeded ${demoUsers.length} demo user accounts (password: ${defaultPassword})`,
      );
    }

    await ensureDemoBlkUser();

    await seedDatasektorCore();
    await ensureBootstrapData();
    await seedMasterReferenceData();
    await migratePembatalanOppDemoAgency();

    // Seed katalog template Word/Excel dari folder files/
    const letterTplCount = Number(
      (await q(db.prepare("SELECT COUNT(*) as c FROM letter_templates"), "get"))
        .c,
    );
    if (letterTplCount === 0) {
      const letterTemplates = [
        [
          "biodata_word",
          "Biodata Formal",
          "biodata",
          "pdf",
          "biodata/admin_print_biodata.docx",
          "",
          "detailbio_print",
        ],
        [
          "biodata_im",
          "Biodata Informal",
          "biodata",
          "pdf",
          "biodata/admin_print_biodata_im.docx",
          "@informal",
          "detailbio_print",
        ],
        [
          "biodata_jp",
          "Biodata JP",
          "biodata",
          "pdf",
          "biodata/admin_print_biodata_jp.docx",
          "JP",
          "detailbio_print",
        ],
        [
          "biodata_male",
          "Biodata Male",
          "biodata",
          "pdf",
          "biodata/admin_print_biodata_male.docx",
          "MF,MH,MC,FF",
          "detailbio_print",
        ],
        [
          "biodata_cong_yi",
          "Biodata Chongyi",
          "biodata",
          "pdf",
          "biodatacongyi.docx",
          "",
          "biodata_cong_yi",
        ],
        [
          "biodata_baru",
          "Biodata Baru",
          "biodata",
          "pdf",
          "biodatabaru.docx",
          "",
          "tambahbio",
        ],
        [
          "biodata_hm",
          "Biodata HM",
          "biodata",
          "pdf",
          "biodata/hm.docx",
          "HM",
          "detailpersonal",
        ],
        [
          "biodata_los",
          "Letter of State",
          "biodata",
          "pdf",
          "biodata/los.docx",
          "HM,HF",
          "detailpersonal",
        ],
        [
          "biodata_los_lpk",
          "Letter of State LPK",
          "biodata",
          "pdf",
          "biodata/los-lpk.docx",
          "HM,HF",
          "detailpersonal",
        ],
        [
          "kirim_biodata_tw",
          "Kirim Biodata Taiwan",
          "biodata",
          "pdf",
          "kirim_biodata_ke_taiwan.docx",
          "",
          "printout",
        ],
        ["pk", "PK Surat", "surat", "word", "pk.docx", "", "printout"],
        [
          "perjanjian_tka",
          "Perjanjian TKA",
          "surat",
          "word",
          "PERJANJIAN TKA DAN AGEN TAIWAN.docx",
          "",
          "surat_perjanjian",
        ],
        [
          "surat_pernyataan_tka",
          "Surat Pernyataan TKI",
          "surat",
          "word",
          "SURAT PERNYATAAN TKA.docx",
          "",
          "surat_pernyataan",
        ],
        [
          "kontrak_kerja",
          "Kontrak Kerja",
          "surat",
          "word",
          "KONTRAK KERJA.docx",
          "",
          "surat_kerja",
        ],
        [
          "rekom_paspor",
          "Rekom Paspor",
          "surat",
          "word",
          "rekom_paspor.docx",
          "",
          "pembuatan_paspor",
        ],
        [
          "ketadm",
          "Keterangan Admin UJK",
          "surat",
          "word",
          "ketadm_print.docx",
          "",
          "cetak_ketadm",
        ],
        [
          "dl004_baru",
          "DL004 Baru",
          "disnaker",
          "word",
          "disnaker/dl004_baru.docx",
          "",
          "surat_disnaker",
        ],
        [
          "dl004_lama",
          "DL004 Lama",
          "disnaker",
          "word",
          "disnaker/dl004_lama.docx",
          "",
          "surat_disnaker",
        ],
        [
          "dokformal",
          "Dokumen Formal",
          "disnaker",
          "word",
          "dokformal.docx",
          "@formal",
          "format_disnaker_formal",
        ],
        [
          "dokinformal",
          "Dokumen Informal",
          "disnaker",
          "word",
          "dokinformal.docx",
          "@informal",
          "format_disnaker_informal",
        ],
        [
          "apendik_a",
          "Apendik A",
          "visa",
          "word",
          "apendik_a.docx",
          "",
          "apendik",
        ],
        [
          "apendik_b",
          "Apendik B",
          "visa",
          "word",
          "apendik_b.docx",
          "",
          "apendik",
        ],
        [
          "apendik_c",
          "Apendik C",
          "visa",
          "word",
          "apendik_c.docx",
          "",
          "apendik",
        ],
        [
          "apendik_d",
          "Apendik D",
          "visa",
          "word",
          "apendik_d.docx",
          "",
          "apendik",
        ],
        [
          "document_send_tw",
          "Document Send Taiwan",
          "visa",
          "word",
          "document_send_taiwan.docx",
          "",
          "detailvisa",
        ],
        [
          "document_sebelum_terbang",
          "Document Sebelum Terbang",
          "visa",
          "word",
          "document_sebelum_terbang.docx",
          "",
          "detailvisa",
        ],
        [
          "spbg_formal",
          "SPBG Formal",
          "spbg",
          "word",
          "spbg/spbg_formal.docx",
          "@formal",
          "detailmajikan_spbg",
        ],
        [
          "spbg_formal_jawa",
          "SPBG Formal Jawa",
          "spbg",
          "word",
          "spbg/spbg_formal_jawa.docx",
          "@formal",
          "detailmajikan_spbg",
        ],
        [
          "spbg_informal_jawa",
          "SPBG Informal Jawa",
          "spbg",
          "word",
          "spbg/spbg_informal_jawa.docx",
          "@informal",
          "detailmajikan_spbg",
        ],
        [
          "spbg_inf_luar_jawa",
          "SPBG Inf Luar Jawa",
          "spbg",
          "word",
          "spbg/SPBG_INF_LUAR_PULAU_JAWA.docx",
          "@informal",
          "detailmajikan_spbg",
        ],
        [
          "pp_formal",
          "PP Formal",
          "opp",
          "word",
          "pp/formal.docx",
          "@formal",
          "pembuatan_opp",
        ],
        [
          "pp_informal",
          "PP Informal",
          "opp",
          "word",
          "pp/informal.docx",
          "@informal",
          "pembuatan_opp",
        ],
        [
          "pp_hongkong",
          "PP Hongkong",
          "opp",
          "word",
          "pp/hongkong.docx",
          "HK",
          "pembuatan_opp",
        ],
        [
          "pp_malaysia",
          "PP Malaysia",
          "opp",
          "word",
          "pp/malaysia.docx",
          "IM",
          "pembuatan_opp",
        ],
        [
          "blk_jadwal1",
          "BLK Jadwal 1",
          "blk",
          "word",
          "blk_jadwal1.docx",
          "",
          "blk_jadwal",
        ],
        [
          "blk_sertifikat",
          "BLK Sertifikat",
          "blk",
          "word",
          "blk_sertifikat_formal.docx",
          "",
          "blk_sertifikat",
        ],
        [
          "blk_ujk",
          "BLK UJK Print",
          "blk",
          "word",
          "ujk_print.docx",
          "",
          "ujk_print",
        ],
        [
          "blk_kb",
          "BLK KB",
          "blk",
          "word",
          "blk_kb/blk_kb.docx",
          "",
          "blkijin",
        ],
        [
          "brifing_tpl",
          "Briefing Terbang",
          "blk",
          "word",
          "brifing/brifing_template.docx",
          "",
          "brifing",
        ],
        [
          "kwitansi_pt",
          "Kwitansi PT",
          "keuangan",
          "word",
          "biodata/kwitansi_pt.docx",
          "",
          "invoice",
        ],
        [
          "kwitansi",
          "Kwitansi",
          "keuangan",
          "word",
          "kwitansi.docx",
          "",
          "invoice",
        ],
        [
          "invoice_tpl",
          "Invoice",
          "keuangan",
          "word",
          "invoice/invoice.docx",
          "",
          "invoice",
        ],
        [
          "perincian_fee_terbang",
          "Perincian Fee Terbang",
          "keuangan",
          "word",
          "perincian_tki_terbang_pembayaran_bank.docx",
          "",
          "new_perincian_keuangan_pt",
        ],
        [
          "laprekdisnaker",
          "Laporan Rekap Disnaker",
          "laporan",
          "word",
          "laprekdisnaker_print.docx",
          "",
          "cetak_laprekdisnaker",
        ],
        [
          "laporan_registrasi",
          "Laporan Registrasi",
          "laporan",
          "word",
          "laporan_registrasi.docx",
          "",
          "laporan",
        ],
        [
          "majikan_printlist",
          "Daftar Majikan",
          "laporan",
          "word",
          "majikan_printlist.docx",
          "",
          "majikans",
        ],
        [
          "pgm_formal_xls",
          "PGM Formal Excel",
          "laporan",
          "xlsx",
          "dew_pgm_formal.xlsx",
          "@formal",
          "admin_mark2",
        ],
        [
          "pgm_informal_xls",
          "PGM Informal Excel",
          "laporan",
          "xlsx",
          "dew_pgm_informal.xlsx",
          "@informal",
          "abc",
        ],
      ];
      const insLetter = db.prepare(
        `INSERT INTO letter_templates (kode, nama, kategori, engine, file_path, sektor, modul_legacy, aktif) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      );
      for (const row of letterTemplates) {
        await q(insLetter, "run", ...row);
      }
    }

    try {
      const printSuratService = require("./print-surat-service");
      await syncPrintSuratLetterTemplates(printSuratService.loadConfig());
    } catch (e) {
      console.warn("[DB] sync print surat templates:", e.message);
    }

    const personalCount = Number(
      (await q(db.prepare("SELECT COUNT(*) as c FROM personal"), "get")).c,
    );
    await ensurePrimaryAdmin();

    try {
      await require("./services/spbg-service").seedSpbgMasterDefaults(
        getDbApi(),
      );
    } catch (e) {
      console.warn("[DB] seedSpbgMasterDefaults:", e.message);
    }

    if (personalCount === 0) {
      const today = new Date().toISOString().slice(0, 10);

      // Demo TKI untuk semua cabang
      const tkis = [
        // [id_biodata, kode_cabang, nama, nik, jeniskelamin, kode_sponsor, kode_pl, tanggaldaftar, statusaktif, statterbang, negara1]

        // === CABANG MALANG (MLG) - 8 TKI ===
        [
          "MLG-FF-0001",
          "MLG",
          "Siti Aminah",
          "3573123456780001",
          "P",
          "SP02",
          "",
          today,
          "PROSES",
          0,
          "Taiwan",
        ],
        [
          "MLG-FF-0002",
          "MLG",
          "Dewi Lestari",
          "3573123456780002",
          "P",
          "SP03",
          "",
          today,
          "TERPILIH",
          0,
          "Taiwan",
        ],
        [
          "MLG-FI-0001",
          "MLG",
          "Rina Wulandari",
          "3573123456780003",
          "P",
          "SP02",
          "",
          today,
          "PROSES",
          0,
          "Taiwan",
        ],
        [
          "MLG-MF-0001",
          "MLG",
          "Budi Santoso",
          "3573123456780004",
          "L",
          "SP03",
          "",
          today,
          "PROSES",
          0,
          "Taiwan",
        ],
        [
          "MLG-JP-0001",
          "MLG",
          "Maya Sari",
          "3573123456780005",
          "P",
          "SP02",
          "",
          today,
          "TERBANG",
          1,
          "Taiwan",
        ],
        [
          "MLG-MI-0001",
          "MLG",
          "Ahmad Fauzi",
          "3573123456780006",
          "L",
          "SP02",
          "",
          today,
          "PROSES",
          0,
          "Taiwan",
        ],
        [
          "MLG-FF-0003",
          "MLG",
          "Ani Rahayu",
          "3573123456780007",
          "P",
          "SP03",
          "",
          today,
          "MEDICAL",
          0,
          "Taiwan",
        ],
        [
          "MLG-MH-0001",
          "MLG",
          "Joko Prasetyo",
          "3573123456780008",
          "L",
          "SP02",
          "",
          today,
          "BLK",
          0,
          "Taiwan",
        ],

        // === CABANG SURABAYA (SBY) - 3 TKI ===
        [
          "SBY-FF-0001",
          "SBY",
          "Lina Susanti",
          "3578123456780001",
          "P",
          "SP02",
          "",
          today,
          "PROSES",
          0,
          "Taiwan",
        ],
        [
          "SBY-MF-0001",
          "SBY",
          "Agus Widodo",
          "3578123456780002",
          "L",
          "SP03",
          "",
          today,
          "TERPILIH",
          0,
          "Taiwan",
        ],
        [
          "SBY-FI-0001",
          "SBY",
          "Ratna Dewi",
          "3578123456780003",
          "P",
          "SP02",
          "",
          today,
          "MEDICAL",
          0,
          "Taiwan",
        ],

        // === CABANG SEMARANG (SMG) - 3 TKI ===
        [
          "SMG-FF-0001",
          "SMG",
          "Sri Handayani",
          "3374123456780001",
          "P",
          "SP02",
          "",
          today,
          "PROSES",
          0,
          "Taiwan",
        ],
        [
          "SMG-MH-0001",
          "SMG",
          "Tri Susilo",
          "3374123456780002",
          "L",
          "SP03",
          "",
          today,
          "BLK",
          0,
          "Taiwan",
        ],
        [
          "SMG-JP-0001",
          "SMG",
          "Dewi Kartika",
          "3374123456780003",
          "P",
          "SP02",
          "",
          today,
          "TERBANG",
          1,
          "Taiwan",
        ],

        // === CABANG JAKARTA (JKT) - 3 TKI ===
        [
          "JKT-FF-0001",
          "JKT",
          "Nurhaliza",
          "3175123456780001",
          "P",
          "SP02",
          "",
          today,
          "TERPILIH",
          0,
          "Taiwan",
        ],
        [
          "JKT-MF-0001",
          "JKT",
          "Rizki Ramadhan",
          "3175123456780002",
          "L",
          "SP03",
          "",
          today,
          "PROSES",
          0,
          "Taiwan",
        ],
        [
          "JKT-MI-0001",
          "JKT",
          "Hendra Gunawan",
          "3175123456780003",
          "L",
          "SP02",
          "",
          today,
          "PROSES",
          0,
          "Taiwan",
        ],
      ];

      const insPersonal = db.prepare(
        `INSERT INTO personal (id_tki, id_biodata, kode_cabang, nama, nik, jeniskelamin, kode_sponsor, kode_pl, tanggaldaftar, statusaktif, statterbang, negara1, kode_sektor, is_active, arsip_status, episode_seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insDatatki = db.prepare(
        `INSERT INTO datatki (id_tki, id_biodata, nama, nik, jeniskelamin, kode_cabang, kode_sektor, total_episode, statusaktif) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      let tkiSeq = 0;
      for (const row of tkis) {
        tkiSeq += 1;
        const idBio = row[0];
        const kodeSektor = String(idBio).split("-")[1] || "";
        const idTki = `TKI-202606-${String(tkiSeq).padStart(8, "0")}`;
        await q(insPersonal, "run", idTki, ...row, kodeSektor, 1, "active", 1);
        await q(
          insDatatki,
          "run",
          idTki,
          row[0],
          row[2],
          row[3],
          row[4],
          row[1],
          kodeSektor,
          1,
          row[8],
        );
      }

      console.log(
        `[DB] Seeded ${tkis.length} demo TKI accounts for all branches (MLG: 8, SBY: 3, SMG: 3, JKT: 3)`,
      );

      // Demo data pendukung untuk TKI pertama setiap cabang
      // MLG-FF-0001
      await q(
        db.prepare(
          `INSERT INTO family (id_biodata, nama_bapak, nama_ibu) VALUES (?, ?, ?)`,
        ),
        "run",
        "MLG-FF-0001",
        "Ahmad",
        "Siti",
      );
      await q(
        db.prepare(
          `INSERT INTO dokumen (id_biodata, ktp, kk) VALUES (?, ?, ?)`,
        ),
        "run",
        "MLG-FF-0001",
        "ktp_mlg_ff0001.jpg",
        "kk_mlg_ff0001.jpg",
      );
      await q(
        db.prepare(
          `INSERT INTO disnaker (id_biodata, nodisnaker, tglonline) VALUES (?, ?, ?)`,
        ),
        "run",
        "MLG-FF-0001",
        "DSK-MLG-2026-001",
        today,
      );
      await q(
        db.prepare(
          `INSERT INTO medical (id_biodata, jenismedical, tanggal, nama) VALUES (?, ?, ?, ?)`,
        ),
        "run",
        "MLG-FF-0001",
        "Pra-medical",
        today,
        "RS Higina",
      );
      await q(
        db.prepare(
          `INSERT INTO paspor (id_biodata, nopaspor, tglterbit, statuspengajuan) VALUES (?, ?, ?, ?)`,
        ),
        "run",
        "MLG-FF-0001",
        "A1234567",
        today,
        "Terbit",
      );
      await q(
        db.prepare(
          `INSERT INTO majikan (id_biodata, kode_agen, kode_majikan, namamajikan, tglterpilih) VALUES (?, ?, ?, ?, ?)`,
        ),
        "run",
        "MLG-FF-0001",
        "AG001",
        "MJ001",
        "Wang Family",
        today,
      );
      await q(
        db.prepare(
          `INSERT INTO majikan (id_biodata, kode_agen, namamajikan, tglterpilih) VALUES (?, ?, ?, ?)`,
        ),
        "run",
        "MLG-FF-0002",
        "AG001",
        "Huang Family",
        today,
      );
      await q(
        db.prepare(
          `INSERT INTO majikan (id_biodata, kode_agen, kode_majikan, namamajikan, tglterpilih) VALUES (?, ?, ?, ?, ?)`,
        ),
        "run",
        "MLG-FF-0003",
        "AG001",
        "MJ-CHONGYI",
        "Chong Yi Agency",
        today,
      );

      // SBY-FF-0001
      await q(
        db.prepare(
          `INSERT INTO family (id_biodata, nama_bapak, nama_ibu) VALUES (?, ?, ?)`,
        ),
        "run",
        "SBY-FF-0001",
        "Bambang",
        "Surti",
      );
      await q(
        db.prepare(
          `INSERT INTO dokumen (id_biodata, ktp, kk) VALUES (?, ?, ?)`,
        ),
        "run",
        "SBY-FF-0001",
        "ktp_sby_ff0001.jpg",
        "kk_sby_ff0001.jpg",
      );
      await q(
        db.prepare(
          `INSERT INTO disnaker (id_biodata, nodisnaker, tglonline) VALUES (?, ?, ?)`,
        ),
        "run",
        "SBY-FF-0001",
        "DSK-SBY-2026-001",
        today,
      );
      await q(
        db.prepare(
          `INSERT INTO medical (id_biodata, jenismedical, tanggal, nama) VALUES (?, ?, ?, ?)`,
        ),
        "run",
        "SBY-FF-0001",
        "Pra-medical",
        today,
        "RS Surabaya",
      );
      await q(
        db.prepare(
          `INSERT INTO paspor (id_biodata, nopaspor, tglterbit, statuspengajuan) VALUES (?, ?, ?, ?)`,
        ),
        "run",
        "SBY-FF-0001",
        "B2345678",
        today,
        "Terbit",
      );
      await q(
        db.prepare(
          `INSERT INTO majikan (id_biodata, kode_agen, namamajikan, tglterpilih) VALUES (?, ?, ?, ?)`,
        ),
        "run",
        "SBY-FF-0001",
        "AG001",
        "Chen Family",
        today,
      );

      // SMG-FF-0001
      await q(
        db.prepare(
          `INSERT INTO family (id_biodata, nama_bapak, nama_ibu) VALUES (?, ?, ?)`,
        ),
        "run",
        "SMG-FF-0001",
        "Slamet",
        "Wati",
      );
      await q(
        db.prepare(
          `INSERT INTO dokumen (id_biodata, ktp, kk) VALUES (?, ?, ?)`,
        ),
        "run",
        "SMG-FF-0001",
        "ktp_smg_ff0001.jpg",
        "kk_smg_ff0001.jpg",
      );
      await q(
        db.prepare(
          `INSERT INTO disnaker (id_biodata, nodisnaker, tglonline) VALUES (?, ?, ?)`,
        ),
        "run",
        "SMG-FF-0001",
        "DSK-SMG-2026-001",
        today,
      );
      await q(
        db.prepare(
          `INSERT INTO medical (id_biodata, jenismedical, tanggal, nama) VALUES (?, ?, ?, ?)`,
        ),
        "run",
        "SMG-FF-0001",
        "Pra-medical",
        today,
        "RS Semarang",
      );
      await q(
        db.prepare(
          `INSERT INTO paspor (id_biodata, nopaspor, tglterbit, statuspengajuan) VALUES (?, ?, ?, ?)`,
        ),
        "run",
        "SMG-FF-0001",
        "C3456789",
        today,
        "Terbit",
      );
      await q(
        db.prepare(
          `INSERT INTO majikan (id_biodata, kode_agen, namamajikan, tglterpilih) VALUES (?, ?, ?, ?)`,
        ),
        "run",
        "SMG-FF-0001",
        "AG001",
        "Lin Family",
        today,
      );

      // JKT-FF-0001
      await q(
        db.prepare(
          `INSERT INTO family (id_biodata, nama_bapak, nama_ibu) VALUES (?, ?, ?)`,
        ),
        "run",
        "JKT-FF-0001",
        "Hermawan",
        "Yuli",
      );
      await q(
        db.prepare(
          `INSERT INTO dokumen (id_biodata, ktp, kk) VALUES (?, ?, ?)`,
        ),
        "run",
        "JKT-FF-0001",
        "ktp_jkt_ff0001.jpg",
        "kk_jkt_ff0001.jpg",
      );
      await q(
        db.prepare(
          `INSERT INTO disnaker (id_biodata, nodisnaker, tglonline) VALUES (?, ?, ?)`,
        ),
        "run",
        "JKT-FF-0001",
        "DSK-JKT-2026-001",
        today,
      );
      await q(
        db.prepare(
          `INSERT INTO medical (id_biodata, jenismedical, tanggal, nama) VALUES (?, ?, ?, ?)`,
        ),
        "run",
        "JKT-FF-0001",
        "Pra-medical",
        today,
        "RS Jakarta",
      );
      await q(
        db.prepare(
          `INSERT INTO paspor (id_biodata, nopaspor, tglterbit, statuspengajuan) VALUES (?, ?, ?, ?)`,
        ),
        "run",
        "JKT-FF-0001",
        "D4567890",
        today,
        "Terbit",
      );
      await q(
        db.prepare(
          `INSERT INTO majikan (id_biodata, kode_agen, namamajikan, tglterpilih) VALUES (?, ?, ?, ?)`,
        ),
        "run",
        "JKT-FF-0001",
        "AG001",
        "Wu Family",
        today,
      );
      await q(
        db.prepare(
          `INSERT INTO visa (id_biodata, novisa, statuskocokan, tanggalterbang, statusterbang) VALUES (?, ?, ?, ?, ?)`,
        ),
        "run",
        "MLG-JP-0001",
        "VISA-MLG-JP-001",
        "Selesai",
        today,
        "Terbang",
      );
      await q(
        db.prepare(
          `INSERT INTO visa (id_biodata, novisa, statuskocokan, tanggalterbang, statusterbang) VALUES (?, ?, ?, ?, ?)`,
        ),
        "run",
        "SMG-JP-0001",
        "VISA-SMG-JP-001",
        "Selesai",
        today,
        "Terbang",
      );
    }
  } catch (e) {
    console.warn("[DB] Seed skipped:", e.message);
  }
}

function parseChongyiMajikanFlag(value) {
  const s = String(value || "")
    .trim()
    .toLowerCase();
  return s === "ya" || s === "y" || s === "1" || s === "true";
}

async function isChongyiMajikanByKode(kodeMajikan) {
  const km = String(kodeMajikan || "").trim();
  if (!km || !getTableNames().includes("datamajikan")) return false;
  const row = await getByField("datamajikan", "kode_majikan", km);
  return parseChongyiMajikanFlag(row?.is_chongyi);
}

async function isChongyiMajikanForBiodata(detail) {
  const m = detail?.majikan;
  if (!m) return false;
  const km = String(m.kode_majikan || "").trim();
  if (km) return isChongyiMajikanByKode(km);
  const nama = String(m.namamajikan || "").trim();
  if (!nama) return false;
  const rows = await list("datamajikan", {
    filters: { namamajikan: nama },
    limit: 5,
    sort: "id",
    order: "asc",
  });
  return (rows?.data || []).some((row) =>
    parseChongyiMajikanFlag(row?.is_chongyi),
  );
}

async function ensureChongyiMajikanMaster() {
  if (!getTableNames().includes("datamajikan")) return;
  const existing = await getByField(
    "datamajikan",
    "kode_majikan",
    "MJ-CHONGYI",
  );
  if (existing) return;
  const sektor = await q(
    db.prepare(`SELECT id FROM datasektor WHERE kode_jenis = 'FF' LIMIT 1`),
    "get",
  );
  const sektorId = sektor?.id || null;
  await q(
    db.prepare(
      `INSERT INTO datamajikan (kode_majikan, namamajikan, nama, datasektor_id, kode_agen, status, is_chongyi) VALUES (?, ?, ?, ?, ?, 'aktif', ?)`,
    ),
    "run",
    "MJ-CHONGYI",
    "Chong Yi Agency",
    "Chong Yi Agency",
    sektorId,
    "AG001",
    "ya",
  );
  console.log("[DB] Seeded master majikan Chongyi (MJ-CHONGYI)");
}

async function ensureDemoChongyiPenempatan() {
  if (
    !getTableNames().includes("majikan") ||
    !getTableNames().includes("personal")
  )
    return;
  const idBio = "MLG-FF-0003";
  const hasPersonal = await q(
    db.prepare("SELECT 1 AS ok FROM personal WHERE id_biodata = ? LIMIT 1"),
    "get",
    idBio,
  );
  if (!hasPersonal) return;
  const today = new Date().toISOString().slice(0, 10);
  const maj = await getByField("majikan", "id_biodata", idBio);
  if (!maj) {
    await q(
      db.prepare(
        "INSERT INTO majikan (id_biodata, kode_agen, kode_majikan, namamajikan, tglterpilih) VALUES (?, ?, ?, ?, ?)",
      ),
      "run",
      idBio,
      "AG001",
      "MJ-CHONGYI",
      "Chong Yi Agency",
      today,
    );
    return;
  }
  const km = String(maj.kode_majikan || "").trim();
  if (km === "MJ-CHONGYI") return;
  await q(
    db.prepare(
      `UPDATE majikan SET kode_majikan = ?, namamajikan = COALESCE(NULLIF(TRIM(namamajikan), ''), ?) WHERE id_biodata = ?`,
    ),
    "run",
    "MJ-CHONGYI",
    "Chong Yi Agency",
    idBio,
  );
}

// Seed master data referensi (plan §8.3, Fase 1)
async function seedMasterReferenceData() {
  try {
    if (!getTableNames().includes("datacabang")) return;
    const cabangCount = Number(
      (await q(db.prepare("SELECT COUNT(*) as c FROM datacabang"), "get")).c,
    );
    if (cabangCount === 0) {
      const insCabang = db.prepare(
        `INSERT INTO datacabang (kode_cabang, nama_cabang, kota, provinsi, alamat, telepon, email, urutan, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aktif')`,
      );
      await q(insCabang, "run", "HQ", "Kantor Pusat", "—", "—", "Jl. Contoh No. 1", "", "admin@localhost", 1);
      console.log("[DB] Seeded default branch HQ");
    }
  } catch (e) {
    console.warn("[DB] seedMasterReferenceData skipped:", e.message);
  }
}

function getKodeSektorFromBiodataId(idBiodata) {
  const id = String(idBiodata || "")
    .trim()
    .toUpperCase();
  if (!id) return "";
  if (id.includes("-")) {
    const parts = id.split("-").filter(Boolean);
    // CABANG-SEKTOR-NUM (mis. JKT-MI-0001) → sektor = bagian tengah
    if (parts.length >= 3) return parts[1];
    // SEKTOR-NUM legacy (mis. MI-0001) → sektor = prefix
    return parts[0];
  }
  return id.slice(0, 2);
}

async function getDatasektorByKode(kodeSektor) {
  const kode = String(kodeSektor || "")
    .trim()
    .toUpperCase();
  if (!kode) return null;
  return getByField("datasektor", "kode_jenis", kode);
}

async function getDatasektorByBiodataId(idBiodata) {
  return getDatasektorByKode(getKodeSektorFromBiodataId(idBiodata));
}

/** Nomor urut berikutnya per cabang+sektor — format CABANG-SEKTOR-NNNN */
async function getNextBiodataSequence(kodeCabang, kodeSektor) {
  const cabang = String(kodeCabang || "")
    .trim()
    .toUpperCase();
  const sektor = String(kodeSektor || "")
    .trim()
    .toUpperCase();
  if (!cabang || !sektor) return 1;

  let maxSeq = 0;
  const prefix = `${cabang}-${sektor}-`;

  try {
    const rows = await q(
      db.prepare(`SELECT id_biodata FROM personal WHERE id_biodata LIKE ?`),
      "all",
      `${prefix}%`,
    );
    for (const row of normalizeRows(rows)) {
      const tail = String(row.id_biodata || "").slice(prefix.length);
      const num = parseInt(tail, 10);
      if (Number.isFinite(num) && num > maxSeq) maxSeq = num;
    }

    // Legacy SEKTOR-NNNN pada cabang yang sama (mis. MI-0001 + kode_cabang JKT)
    const legacyRows = await q(
      db.prepare(
        `SELECT id_biodata FROM personal
         WHERE UPPER(TRIM(COALESCE(kode_cabang, ''))) = ?
           AND id_biodata LIKE ?
           AND id_biodata NOT LIKE ?`,
      ),
      "all",
      cabang,
      `${sektor}-%`,
      `${cabang}-%`,
    );
    for (const row of normalizeRows(legacyRows)) {
      const m = String(row.id_biodata || "").match(/-(\d+)$/);
      if (!m) continue;
      const num = parseInt(m[1], 10);
      if (Number.isFinite(num) && num > maxSeq) maxSeq = num;
    }
  } catch {
    /* fallback ke 1 */
  }

  return maxSeq + 1;
}

async function getSektorCodesByJenis(jenis, fallback = []) {
  const value = String(jenis || "")
    .trim()
    .toLowerCase();
  if (!value) return fallback;
  try {
    const rows = await q(
      db.prepare(`
        SELECT kode_jenis FROM datasektor
        WHERE lower(COALESCE(jenis_sektor, '')) = ?
          AND COALESCE(status, 'aktif') != 'nonaktif'
        ORDER BY id ASC
      `),
      "all",
      value,
    );
    const codes = normalizeRows(rows)
      .map((row) => String(row.kode_jenis || "").trim())
      .filter(Boolean);
    return codes.length ? codes : fallback;
  } catch {
    return fallback;
  }
}

async function getAllSektorCodes(fallback = []) {
  try {
    const rows = await q(
      db.prepare(`
        SELECT kode_jenis FROM datasektor
        WHERE COALESCE(status, 'aktif') != 'nonaktif'
        ORDER BY id ASC
      `),
      "all",
    );
    const codes = normalizeRows(rows)
      .map((row) => String(row.kode_jenis || "").trim())
      .filter(Boolean);
    return codes.length ? codes : fallback;
  } catch {
    return fallback;
  }
}

// Seed menu_mapping per sektor (plan §8A.5a — menudalam)
/** Master negara — dipakai dropdown negara1 / warganegara (parity operasional P3MI) */
const DATANEGARA_CORE_ROWS = [
  ["Taiwan", "台灣"],
  ["Hong Kong", "香港"],
  ["Malaysia", "馬來西亞"],
  ["Singapura", "新加坡"],
  ["Macau", "澳門"],
  ["Brunei Darussalam", "汶萊"],
  ["Jepang", "日本"],
  ["Korea Selatan", "韓國"],
  ["China", "中國"],
  ["Thailand", "泰國"],
  ["Filipina", "菲律賓"],
  ["Vietnam", "越南"],
  ["Indonesia", "印尼"],
  ["Arab Saudi", "沙特阿拉伯"],
  ["Uni Emirat Arab", "阿聯酋"],
  ["Qatar", "卡塔爾"],
  ["Oman", "阿曼"],
  ["Kuwait", "科威特"],
  ["Bahrain", "巴林"],
  ["Yordania", "約旦"],
  ["Lebanon", "黎巴嫩"],
  ["Mesir", "埃及"],
  ["Australia", "澳洲"],
  ["Selandia Baru", "紐西蘭"],
  ["Cyprus", "塞浦路斯"],
];

/** Lokasi kerja (pengalaman kerja) — tanpa Indonesia */
const DATALOKASIKERJA_CORE_ROWS = DATANEGARA_CORE_ROWS.filter(
  ([isi]) => isi !== "Indonesia",
);

/** Master bank — dropdown buka rekening, signing bank, keuangan */
const DATABANK_CORE_ROWS = [
  ["BCA", "印尼商業銀行"],
  ["Bank Mandiri", "曼迪利銀行"],
  ["Bank BRI", "印尼人民銀行"],
  ["Bank BNI", "印尼國家銀行"],
  ["Bank Syariah Indonesia (BSI)", "印尼伊斯蘭銀行"],
  ["Bank CIMB Niaga", "聯昌銀行"],
  ["Bank Danamon", "丹納蒙銀行"],
  ["Bank Permata", "寶石銀行"],
  ["Bank OCBC NISP", "華僑銀行"],
  ["Bank Maybank Indonesia", "馬來亞銀行"],
  ["Bank Panin", "帕寧銀行"],
  ["Bank Sinarmas", "金光銀行"],
  ["Bank Mega", "美佳銀行"],
  ["Bank BTPN", "BTPN銀行"],
  ["Bank SMBC Indonesia", "三井住友銀行"],
  ["Bank Tabungan Negara (BTN)", "國家儲蓄銀行"],
  ["Bank Jatim", "東爪哇銀行"],
  ["Bank Jatim Syariah", "東爪哇伊斯蘭銀行"],
  ["Bank Jateng", "中爪哇銀行"],
  ["Bank Jateng Syariah", "中爪哇伊斯蘭銀行"],
  ["Bank BJB", "西爪哇銀行"],
  ["Bank BJB Syariah", "西爪哇伊斯蘭銀行"],
  ["Bank DKI", "雅加達銀行"],
  ["Bank NTB", "西努沙登加拉銀行"],
  ["Bank Nagari", "水利銀行"],
  ["Bank Sumut", "北蘇門答臘銀行"],
  ["Bank Kalsel", "南加里曼丹銀行"],
  ["Bank Kalbar", "西加里曼丹銀行"],
  ["Bank Kaltimtara", "東加里曼丹銀行"],
  ["Bank Riau Kepri", "廖內群島銀行"],
  ["Bank Lampung", "楠榜銀行"],
  ["Bank Bengkulu", "明古魯銀行"],
  ["Bank Sulselbar", "南蘇拉威西銀行"],
  ["Bank Sulteng", "中蘇拉威西銀行"],
  ["Bank Sultra", "東南蘇拉威西銀行"],
  ["Bank Papua", "巴布亞銀行"],
  ["Bank Maluku Malut", "馬魯古銀行"],
  ["Bank Aceh Syariah", "亞齊伊斯蘭銀行"],
  ["Bank BPD Bali", "巴厘銀行"],
  ["Bank BPD DIY", "日惹銀行"],
  ["Bank Muamalat Indonesia", "穆阿拉馬特銀行"],
  ["Bank BRI Agro", "BRI農業銀行"],
  ["Bank Mandiri Taspen", "曼迪利退休銀行"],
  ["Bank Jago", "Jago銀行"],
  ["SeaBank Indonesia", "SeaBank"],
  ["Bank Neo Commerce", "新商務銀行"],
  ["Bank Allo", "Allo銀行"],
  ["Bank Bukopin", "國民銀行"],
  ["KB Bank", "KB銀行"],
  ["Bank Commonwealth", "澳洲聯邦銀行"],
  ["Bank UOB Indonesia", "大華銀行"],
  ["Bank HSBC Indonesia", "匯豐銀行"],
  ["Bank DBS Indonesia", "星展銀行"],
  ["Bank ANZ Indonesia", "ANZ銀行"],
  ["Bank Artha Graha", "阿爾塔格拉哈銀行"],
  ["Bank Woori Saudara", "友利銀行"],
  ["Bank Victoria", "維多利亞銀行"],
  ["Bank IBK Indonesia", "IBK印尼銀行"],
  ["Bank MNC Internasional", "MNC銀行"],
  ["Bank Sahabat Sampoerna", "三寶龍銀行"],
  ["Bank QNB Indonesia", "QNB銀行"],
  ["Bank Chinatrust Indonesia (CTBC)", "中國信託銀行"],
  ["Bank Maspion", "馬斯皮恩銀行"],
  ["Bank Mayapada", "瑪雅帕達銀行"],
  ["Bank Ina Perdana", "伊娜銀行"],
  ["Bank SBI Indonesia", "SBI印尼"],
  ["Bank Resona Perdania", "里索納銀行"],
  ["Bank JTrust Indonesia", "JTrust銀行"],
  ["Bank Index Selindo", "Index銀行"],
  ["Bank Capital Indonesia", "Capital銀行"],
  ["Bank Mestika Dharma", "Mestika銀行"],
  ["Bank Ganesha", "Ganesha銀行"],
  ["Bank Hibank Indonesia", "Hibank"],
  ["Bank Fama Internasional", "Fama銀行"],
  ["Bank Harda Internasional", "Harda銀行"],
  ["Bank Multiarta Sentosa", "Multiarta銀行"],
  ["Bank Oke Indonesia", "Oke銀行"],
  ["Bank Nationalnobu", "Nationalnobu銀行"],
  ["Bank Prima Master", "Prima銀行"],
  ["Bank Amar Indonesia", "Amar銀行"],
  ["Bank BCA Syariah", "BCA伊斯蘭銀行"],
  ["Bank BNI Syariah", "BNI伊斯蘭銀行"],
  ["Bank BRI Syariah", "BRI伊斯蘭銀行"],
  ["Bank Mandiri Syariah", "曼迪利伊斯蘭銀行"],
];

/** Master jenis usaha majikan — dropdown Working (we2) & Permohonan (p1) */
const JENIS_USAHA_CORE_ROWS = [
  ["Manufaktur", "製造業"],
  ["Pertanian", "農業"],
  ["Perkebunan", "種植業"],
  ["Peternakan", "畜牧業"],
  ["Konstruksi", "建築業"],
  ["Perhotelan", "飯店業"],
  ["Restoran & katering", "餐飲業"],
  ["Panti jompo / perawatan", "養老院"],
  ["Perdagangan", "貿易業"],
  ["Elektronik", "電子業"],
  ["Tekstil", "紡織業"],
  ["Logam & mesin", "金屬工業"],
];

/** Master posisi — dropdown tab Working / pengalaman kerja (parity P3MI Taiwan & sektor) */
const DATAPOSISI_CORE_ROWS = [
  ["PRT", "家務"],
  ["Caregiver", "護工"],
  ["Pengasuh Anak", "保母"],
  ["Babysitter", "保母"],
  ["Asisten Rumah Tangga", "家事幫傭"],
  ["Perawat Lansia di Rumah", "居家照護"],
  ["Asisten Dapur", "廚房助理"],
  ["Juru Masak", "廚師"],
  ["Domestic Helper", "家庭幫傭"],
  ["Pekerja Pabrik", "工廠工人"],
  ["Operator Mesin", "機台操作"],
  ["Quality Control", "品檢"],
  ["Packing", "包裝"],
  ["Assembly Line", "組裝線"],
  ["Operator Forklift", "堆高機操作"],
  ["Las / Welder", "焊接工"],
  ["Teknisi", "技術員"],
  ["Supervisor Line", "線長"],
  ["Pekerja Konstruksi", "建築工人"],
  ["Tukang Bangunan", "泥水工"],
  ["Helper Konstruksi", "建築助手"],
  ["Pekerja Pertanian", "農工"],
  ["Peternak", "畜牧"],
  ["Greenhouse Worker", "溫室工"],
  ["Housekeeping", "房務"],
  ["Room Attendant", "客房服務"],
  ["Kitchen Helper Hotel", "飯店廚助"],
  ["Waiter / Waitress", "服務生"],
  ["Bellboy", "行李員"],
  ["Driver", "司機"],
  ["Satpam", "保全"],
  ["Office Helper", "辦公室助理"],
  ["Perawat", "護士"],
  ["Care Worker", "照護員"],
  ["Worker", "工人"],
];

const SEKTOR_NEGARA_BY_KODE = {
  FF: "Taiwan",
  MF: "Taiwan",
  FI: "Taiwan",
  MI: "Taiwan",
  JP: "Taiwan",
  FH: "Taiwan",
  MH: "Taiwan",
  MC: "Taiwan",
  HM: "Taiwan",
  HF: "Taiwan",
  HK: "Hongkong",
  IM: "Malaysia",
};

const BIODATA_SEKTOR_ROWS = [
  ["FF", "Female Formal", "女性正式", "P", 2, "formal"],
  ["MF", "Male Formal", "男性正式", "L", 0, "formal"],
  ["FI", "Female Informal", "女性非正式", "P", 0, "informal"],
  ["MI", "Male Informal", "男性非正式", "L", 0, "formal"],
  ["JP", "Panti Jompo", "養老院", "P", 0, "lainnya"],
  ["FH", "Female Farming", "女性農場", "P", 0, "formal"],
  ["MH", "Male Farming", "男性農場", "L", 0, "formal"],
  ["MC", "Male Construction", "男性建築", "L", 0, "formal"],
  ["HM", "Hotel Male", "飯店男", "L", 0, "formal"],
  ["HF", "Hotel Female", "飯店女", "P", 0, "formal"],
  ["HK", "Hongkong", "香港", "P", 0, "formal"],
  ["IM", "Informal Malaysia", "馬來西亞非正式", "P", 0, "informal"],
];

const CORE_CABANG_ROWS = [
  [
    "MLG",
    "Malang",
    "Malang",
    "Jawa Timur",
    "Jl. Raya Malang No. 1",
    "0341-123456",
    "malang@pjtki.local",
    1,
  ],
  [
    "SBY",
    "Surabaya",
    "Surabaya",
    "Jawa Timur",
    "Jl. Raya Surabaya No. 2",
    "031-123456",
    "surabaya@pjtki.local",
    2,
  ],
  [
    "SMG",
    "Semarang",
    "Semarang",
    "Jawa Tengah",
    "Jl. Raya Semarang No. 3",
    "024-123456",
    "semarang@pjtki.local",
    3,
  ],
  [
    "JKT",
    "Jakarta",
    "Jakarta",
    "DKI Jakarta",
    "Jl. Raya Jakarta No. 4",
    "021-123456",
    "jakarta@pjtki.local",
    4,
  ],
];

/** Idempotent — lengkapi master posisi kerja + selaraskan mandarin */
async function seedDataposisiCore() {
  try {
    if (!getTableNames().includes("dataposisi")) return;
    const ins = db.prepare(
      "INSERT INTO dataposisi (isi, mandarin) VALUES (?, ?)",
    );
    const upd = db.prepare("UPDATE dataposisi SET mandarin = ? WHERE isi = ?");
    let added = 0;
    let updated = 0;
    for (const [isi, mandarin] of DATAPOSISI_CORE_ROWS) {
      const existing = await getByField("dataposisi", "isi", isi);
      if (!existing) {
        await q(ins, "run", isi, mandarin || "");
        added += 1;
        continue;
      }
      if (mandarin && String(existing.mandarin || "").trim() !== mandarin) {
        await q(upd, "run", mandarin, isi);
        updated += 1;
      }
    }
    if (added > 0) console.log(`[DB] seedDataposisiCore: ${added} posisi baru`);
    if (updated > 0)
      console.log(`[DB] seedDataposisiCore: ${updated} mandarin diselaraskan`);
  } catch (e) {
    console.warn("[DB] seedDataposisiCore skipped:", e.message);
  }
}

/** Idempotent — lengkapi master jenis usaha majikan */
async function seedJenisUsahaCore() {
  try {
    if (!getTableNames().includes("databarangdiproduksi")) return;
    const ins = db.prepare(
      "INSERT INTO databarangdiproduksi (isi, mandarin) VALUES (?, ?)",
    );
    const upd = db.prepare(
      "UPDATE databarangdiproduksi SET mandarin = ? WHERE isi = ?",
    );
    let added = 0;
    let updated = 0;
    for (const [isi, mandarin] of JENIS_USAHA_CORE_ROWS) {
      const existing = await getByField("databarangdiproduksi", "isi", isi);
      if (!existing) {
        await q(ins, "run", isi, mandarin || "");
        added += 1;
        continue;
      }
      if (mandarin && String(existing.mandarin || "").trim() !== mandarin) {
        await q(upd, "run", mandarin, isi);
        updated += 1;
      }
    }
    const legacy = await getByField("databarangdiproduksi", "isi", "Produk A");
    if (legacy) {
      const manufaktur = await getByField(
        "databarangdiproduksi",
        "isi",
        "Manufaktur",
      );
      if (!manufaktur) {
        await q(
          db.prepare(
            "UPDATE databarangdiproduksi SET isi = ?, mandarin = ? WHERE id = ?",
          ),
          "run",
          "Manufaktur",
          "製造業",
          legacy.id,
        );
        console.log(
          '[DB] seedJenisUsahaCore: contoh legacy "Produk A" diubah menjadi Manufaktur',
        );
      } else {
        await q(
          db.prepare("DELETE FROM databarangdiproduksi WHERE id = ?"),
          "run",
          legacy.id,
        );
        console.log('[DB] seedJenisUsahaCore: hapus contoh legacy "Produk A"');
      }
    }
    if (added > 0)
      console.log(`[DB] seedJenisUsahaCore: ${added} jenis usaha baru`);
    if (updated > 0)
      console.log(`[DB] seedJenisUsahaCore: ${updated} mandarin diselaraskan`);
  } catch (e) {
    console.warn("[DB] seedJenisUsahaCore skipped:", e.message);
  }
}

/** Master pilihan keadaan TKI — dropdown Keadaan TKI & laporan MD/Kabur/Interminate */
const KEADAAN_TKI_CORE_ROWS = [
  "MD",
  "Kabur",
  "Pulang",
  "Mengundurkan Diri",
  "Interminate",
  "Sakit",
  "Meninggal",
  "Selesai Kontrak",
  "PHK",
  "Mutasi Majikan",
  "Dalam Pengawasan",
];

/** Idempotent — lengkapi master keadaan TKI (MD, Mengundurkan Diri, dll.) */
async function seedKeadaanTkiCore() {
  try {
    if (!getTableNames().includes("admin_keadaan_tki_pilihan")) return;
    const ins = db.prepare(
      "INSERT INTO admin_keadaan_tki_pilihan (nama) VALUES (?)",
    );
    let added = 0;
    for (const nama of KEADAAN_TKI_CORE_ROWS) {
      const existing = await getByField(
        "admin_keadaan_tki_pilihan",
        "nama",
        nama,
      );
      if (!existing) {
        await q(ins, "run", nama);
        added += 1;
      }
    }
    if (added > 0)
      console.log(`[DB] seedKeadaanTkiCore: ${added} keadaan baru`);
  } catch (e) {
    console.warn("[DB] seedKeadaanTkiCore skipped:", e.message);
  }
}

/** Demo interview JP + wawancara teto untuk TKI sektor JP (idempotent). */
async function seedInterviewDemoCore() {
  try {
    if (!getTableNames().includes("interview")) return;
    const today = new Date().toISOString().slice(0, 10);
    const interviewDemos = [
      {
        id_biodata: "MLG-JP-0001",
        tgl_interview: today,
        sunction: "Ya",
        food: "Tidak",
        cateter: "Tidak",
        injection: "Ya",
        therapy: "Ya",
        helping: "Ya",
        bed: "Ya",
        stairs: "Tidak",
      },
      {
        id_biodata: "SMG-JP-0001",
        tgl_interview: today,
        sunction: "Tidak",
        food: "Tidak",
        cateter: "Tidak",
        injection: "Ya",
        therapy: "Ya",
        helping: "Ya",
        bed: "Ya",
        stairs: "Ya",
      },
    ];
    for (const row of interviewDemos) {
      const personal = await getByField(
        "personal",
        "id_biodata",
        row.id_biodata,
      );
      if (!personal) continue;
      const existing = await listByIdBiodata("interview", row.id_biodata);
      if (!existing.length) {
        await create("interview", row, { skipAudit: true });
      }
    }
    if (getTableNames().includes("interview_teto")) {
      const tetoDemos = [
        {
          id_biodata: "MLG-JP-0001",
          tanggal: today,
          pewawancara: "Petugas Seleksi JP",
          nilai: "85",
          hasil: "Lulus assessment teto — siap penempatan panti jompo.",
          keterangan: "Data demo seed.",
        },
        {
          id_biodata: "SMG-JP-0001",
          tanggal: today,
          pewawancara: "Koordinator Majikan",
          nilai: "Lulus",
          hasil: "Memenuhi standar wawancara teto.",
          keterangan: "Data demo seed.",
        },
      ];
      for (const row of tetoDemos) {
        const personal = await getByField(
          "personal",
          "id_biodata",
          row.id_biodata,
        );
        if (!personal) continue;
        const existing = await listByIdBiodata(
          "interview_teto",
          row.id_biodata,
        );
        if (!existing.length) {
          await create("interview_teto", row, { skipAudit: true });
        }
      }
    }
  } catch (e) {
    console.warn("[DB] seedInterviewDemoCore skipped:", e.message);
  }
}

/** Idempotent — lengkapi master negara + selaraskan terjemahan mandarin */
async function seedDatanegaraCore() {
  try {
    if (!getTableNames().includes("datanegara")) return;
    const ins = db.prepare(
      "INSERT INTO datanegara (isi, mandarin) VALUES (?, ?)",
    );
    const upd = db.prepare("UPDATE datanegara SET mandarin = ? WHERE isi = ?");
    let added = 0;
    let updated = 0;
    for (const [isi, mandarin] of DATANEGARA_CORE_ROWS) {
      const existing = await getByField("datanegara", "isi", isi);
      if (!existing) {
        await q(ins, "run", isi, mandarin || "");
        added += 1;
        continue;
      }
      if (mandarin && String(existing.mandarin || "").trim() !== mandarin) {
        await q(upd, "run", mandarin, isi);
        updated += 1;
      }
    }
    if (added > 0) console.log(`[DB] seedDatanegaraCore: ${added} negara baru`);
    if (updated > 0)
      console.log(`[DB] seedDatanegaraCore: ${updated} mandarin diselaraskan`);
  } catch (e) {
    console.warn("[DB] seedDatanegaraCore skipped:", e.message);
  }
}

/** Idempotent — lengkapi master bank (buka rekening, signing bank, keuangan) */
async function seedDatabankCore() {
  try {
    if (!getTableNames().includes("databank")) return;
    const ins = db.prepare(
      "INSERT INTO databank (isi, mandarin) VALUES (?, ?)",
    );
    const upd = db.prepare("UPDATE databank SET mandarin = ? WHERE isi = ?");
    let added = 0;
    let updated = 0;
    for (const [isi, mandarin] of DATABANK_CORE_ROWS) {
      const existing = await getByField("databank", "isi", isi);
      if (!existing) {
        await q(ins, "run", isi, mandarin || "");
        added += 1;
        continue;
      }
      if (mandarin && String(existing.mandarin || "").trim() !== mandarin) {
        await q(upd, "run", mandarin, isi);
        updated += 1;
      }
    }
    if (added > 0) console.log(`[DB] seedDatabankCore: ${added} bank baru`);
    if (updated > 0)
      console.log(`[DB] seedDatabankCore: ${updated} mandarin diselaraskan`);
  } catch (e) {
    console.warn("[DB] seedDatabankCore skipped:", e.message);
  }
}

/** Idempotent — lokasi kerja (negara penempatan, bukan Indonesia) */
async function seedDatalokasikerjaCore() {
  try {
    if (!getTableNames().includes("datalokasikerja")) return;
    const ins = db.prepare(
      "INSERT INTO datalokasikerja (isi, mandarin) VALUES (?, ?)",
    );
    const upd = db.prepare(
      "UPDATE datalokasikerja SET mandarin = ? WHERE isi = ?",
    );
    let added = 0;
    let updated = 0;
    for (const [isi, mandarin] of DATALOKASIKERJA_CORE_ROWS) {
      const existing = await getByField("datalokasikerja", "isi", isi);
      if (!existing) {
        await q(ins, "run", isi, mandarin || "");
        added += 1;
        continue;
      }
      if (mandarin && String(existing.mandarin || "").trim() !== mandarin) {
        await q(upd, "run", mandarin, isi);
        updated += 1;
      }
    }
    if (added > 0)
      console.log(`[DB] seedDatalokasikerjaCore: ${added} lokasi baru`);
    if (updated > 0)
      console.log(
        `[DB] seedDatalokasikerjaCore: ${updated} mandarin diselaraskan`,
      );
  } catch (e) {
    console.warn("[DB] seedDatalokasikerjaCore skipped:", e.message);
  }
}

/** Idempotent — insert sektor baru + update metadata dari BIODATA_SEKTOR_ROWS (plan §8A.5a) */
async function seedDatasektorCore() {
  try {
    const ins = db.prepare(
      `INSERT INTO datasektor (kode_jenis, isi, isi_taiwan, jeniskelamin, no_urut, jenis_sektor, negara_tujuan, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'aktif')`,
    );
    const upd = db.prepare(
      `UPDATE datasektor
       SET isi = ?, isi_taiwan = ?, jeniskelamin = ?, no_urut = ?, jenis_sektor = ?, negara_tujuan = ?, status = 'aktif'
       WHERE kode_jenis = ?`,
    );
    let added = 0;
    let updated = 0;
    for (const row of BIODATA_SEKTOR_ROWS) {
      const [kode, isi, isiTaiwan, jk, noUrut, jenisSektor] = row;
      const negaraTujuan = SEKTOR_NEGARA_BY_KODE[kode] || "Taiwan";
      const existing = await getByField("datasektor", "kode_jenis", kode);
      if (!existing) {
        await q(
          ins,
          "run",
          kode,
          isi,
          isiTaiwan,
          jk,
          noUrut,
          jenisSektor,
          negaraTujuan,
        );
        added += 1;
        continue;
      }
      const changed =
        String(existing.isi || "") !== String(isi || "") ||
        String(existing.isi_taiwan || "") !== String(isiTaiwan || "") ||
        String(existing.jeniskelamin || "") !== String(jk || "") ||
        Number(existing.no_urut || 0) !== Number(noUrut || 0) ||
        String(existing.jenis_sektor || "")
          .trim()
          .toLowerCase() !==
          String(jenisSektor || "")
            .trim()
            .toLowerCase() ||
        String(existing.negara_tujuan || "").trim() !== negaraTujuan;
      if (changed) {
        await q(
          upd,
          "run",
          isi,
          isiTaiwan,
          jk,
          noUrut,
          jenisSektor,
          negaraTujuan,
          kode,
        );
        updated += 1;
      }
    }
    if (added > 0) {
      console.log(`[DB] seedDatasektorCore: ${added} sektor baru`);
    }
    if (updated > 0) {
      console.log(`[DB] seedDatasektorCore: ${updated} sektor diselaraskan`);
    }
  } catch (e) {
    console.warn("[DB] seedDatasektorCore skipped:", e.message);
  }
}

/** Idempotent — cabang inti untuk create biodata & filter cabang */
async function ensureDatacabangCore() {
  try {
    const ins = db.prepare(
      `INSERT INTO datacabang (kode_cabang, nama_cabang, kota, provinsi, alamat, telepon, email, urutan, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aktif')`,
    );
    let added = 0;
    for (const row of CORE_CABANG_ROWS) {
      const existing = await getByField("datacabang", "kode_cabang", row[0]);
      if (existing) continue;
      await q(ins, "run", ...row);
      added += 1;
    }
    if (added > 0) {
      console.log(`[DB] ensureDatacabangCore: ${added} cabang baru`);
    }
  } catch (e) {
    console.warn("[DB] ensureDatacabangCore skipped:", e.message);
  }
}

async function upsertMenuMappingRow(
  kodeSektor,
  labelMenu,
  urlMenu,
  iconMenu,
  urutan,
) {
  const kode = String(kodeSektor || "")
    .trim()
    .toUpperCase();
  const url = String(urlMenu || "").trim();
  if (!kode || !url) return false;
  const existing = await q(
    db.prepare(
      `SELECT id FROM menu_mapping WHERE kode_sektor = ? AND url_menu = ? LIMIT 1`,
    ),
    "get",
    kode,
    url,
  );
  if (existing) return false;
  await q(
    db.prepare(
      `INSERT INTO menu_mapping (kode_sektor, label_menu, url_menu, icon_menu, urutan, aktif, parent_id, role)
       VALUES (?, ?, ?, ?, ?, 1, 0, 'all')`,
    ),
    "run",
    kode,
    labelMenu,
    url,
    iconMenu,
    urutan,
  );
  return true;
}

async function ensureMenuMappingForSector(kodeSektor, menuRows) {
  let inserted = 0;
  for (const row of menuRows || []) {
    const ok = await upsertMenuMappingRow(
      kodeSektor,
      row[0],
      row[1],
      row[2],
      row[3],
    );
    if (ok) inserted += 1;
  }
  return inserted;
}

/** Tab biodata — sumber default: config/biodata-menu-sektor.json; runtime: tabel menu_mapping */
function menuKeysToTabs(kodeSektor, keys) {
  const kode = String(kodeSektor || "")
    .trim()
    .toUpperCase();
  const rows = biodataMenuConfig.menuKeysToTabRows(kode, keys);
  return rows.map((row, idx) => ({
    id: idx + 1,
    kode_sektor: kode,
    label_menu: row.label_menu,
    url_menu: row.url_menu,
    icon_menu: row.icon_menu,
    urutan: row.urutan,
    aktif: 1,
    parent_id: 0,
    role: "all",
  }));
}

async function setMenuMappingRow(
  kodeSektor,
  labelMenu,
  urlMenu,
  iconMenu,
  urutan,
) {
  const kode = String(kodeSektor || "")
    .trim()
    .toUpperCase();
  const url = String(urlMenu || "").trim();
  if (!kode || !url) return;
  const existing = await q(
    db.prepare(
      `SELECT id FROM menu_mapping WHERE kode_sektor = ? AND url_menu = ? LIMIT 1`,
    ),
    "get",
    kode,
    url,
  );
  if (existing?.id != null) {
    await q(
      db.prepare(
        `UPDATE menu_mapping SET label_menu = ?, icon_menu = ?, urutan = ?, aktif = 1 WHERE id = ?`,
      ),
      "run",
      labelMenu,
      iconMenu,
      urutan,
      existing.id,
    );
    return;
  }
  await q(
    db.prepare(
      `INSERT INTO menu_mapping (kode_sektor, label_menu, url_menu, icon_menu, urutan, aktif, parent_id, role)
       VALUES (?, ?, ?, ?, ?, 1, 0, 'all')`,
    ),
    "run",
    kode,
    labelMenu,
    url,
    iconMenu,
    urutan,
  );
}

async function deleteMenuMappingRowsWithoutSektor() {
  const result = await q(
    db.prepare(
      `DELETE FROM menu_mapping WHERE TRIM(COALESCE(kode_sektor, '')) = ''`,
    ),
    "run",
  );
  return result?.changes || 0;
}

/** Seed hanya jika sektor belum punya baris menu_mapping */
async function seedMenuMappingForSector(kodeSektor) {
  const kode = String(kodeSektor || "")
    .trim()
    .toUpperCase();
  const keys = biodataMenuConfig.getSectorMenuKeys(kode);
  if (!keys?.length) return 0;

  const countRow = await q(
    db.prepare(`SELECT COUNT(*) as c FROM menu_mapping WHERE kode_sektor = ?`),
    "get",
    kode,
  );
  if (Number(countRow?.c || 0) > 0) return 0;

  let inserted = 0;
  const rows = biodataMenuConfig.menuKeysToTabRows(kode, keys);
  for (const row of rows) {
    const ok = await upsertMenuMappingRow(
      kode,
      row.label_menu,
      row.url_menu,
      row.icon_menu,
      row.urutan,
    );
    if (ok) inserted += 1;
  }
  return inserted;
}

/**
 * Selaraskan menu_mapping satu sektor dengan config/biodata-menu-sektor.json:
 * hapus tab orphan (mis. tugas RT di MH), tambah/update tab yang kurang.
 */
async function syncMenuMappingFromConfigForSector(kodeSektor) {
  await deleteMenuMappingRowsWithoutSektor();
  const kode = String(kodeSektor || "")
    .trim()
    .toUpperCase();
  const keys = biodataMenuConfig.getSectorMenuKeys(kode);
  if (!keys?.length) {
    return { kode, added: 0, removed: 0, updated: 0 };
  }

  const allowedSet = new Set(biodataMenuConfig.getAllowedMenuUrls(kode));
  const current = await q(
    db.prepare(`SELECT id, url_menu FROM menu_mapping WHERE kode_sektor = ? ORDER BY id ASC`),
    "all",
    kode,
  );

  let removed = 0;
  const seenUrls = new Set();
  for (const row of current || []) {
    const url = String(row.url_menu || "").trim();
    if (!url || !allowedSet.has(url) || seenUrls.has(url)) {
      await q(db.prepare(`DELETE FROM menu_mapping WHERE id = ?`), "run", row.id);
      removed += 1;
      continue;
    }
    seenUrls.add(url);
  }

  const configRows = biodataMenuConfig.menuKeysToTabRows(kode, keys);
  let added = 0;
  let updated = 0;
  for (const row of configRows) {
    const existing = await q(
      db.prepare(
        `SELECT id, label_menu, icon_menu, urutan FROM menu_mapping WHERE kode_sektor = ? AND url_menu = ? LIMIT 1`,
      ),
      "get",
      kode,
      row.url_menu,
    );
    if (existing?.id != null) {
      const changed =
        String(existing.label_menu || "") !== String(row.label_menu || "") ||
        String(existing.icon_menu || "") !== String(row.icon_menu || "") ||
        Number(existing.urutan || 0) !== Number(row.urutan || 0);
      if (changed) {
        await setMenuMappingRow(
          kode,
          row.label_menu,
          row.url_menu,
          row.icon_menu,
          row.urutan,
        );
        updated += 1;
      }
      continue;
    }
    const ok = await upsertMenuMappingRow(
      kode,
      row.label_menu,
      row.url_menu,
      row.icon_menu,
      row.urutan,
    );
    if (ok) added += 1;
  }

  return { kode, added, removed, updated };
}

async function syncMenuMappingPlanning() {
  let added = 0;
  let removed = 0;
  let updated = 0;
  for (const kode of biodataMenuConfig.getAllSectorCodes()) {
    const result = await syncMenuMappingFromConfigForSector(kode);
    added += result.added || 0;
    removed += result.removed || 0;
    updated += result.updated || 0;
  }
  if (added > 0 || removed > 0 || updated > 0) {
    console.log(
      `[DB] syncMenuMappingPlanning: +${added} -${removed} ~${updated} (${biodataMenuConfig.getAllSectorCodes().length} sektor)`,
    );
  }
  return { added, removed, updated };
}

/** Reset tab sektor dari config/biodata-menu-sektor.json (manual / npm run seed:menu-sektor -- --force) */
async function resetMenuMappingFromConfig(kodeSektor) {
  await deleteMenuMappingRowsWithoutSektor();
  const kode = String(kodeSektor || "")
    .trim()
    .toUpperCase();
  const keys = biodataMenuConfig.getSectorMenuKeys(kode);
  if (!keys?.length) {
    return {
      kode,
      synced: 0,
      error: `Sektor ${kode} tidak ada di config/biodata-menu-sektor.json`,
    };
  }

  await q(
    db.prepare(`DELETE FROM menu_mapping WHERE kode_sektor = ?`),
    "run",
    kode,
  );

  const rows = biodataMenuConfig.menuKeysToTabRows(kode, keys);
  for (const row of rows) {
    await setMenuMappingRow(
      kode,
      row.label_menu,
      row.url_menu,
      row.icon_menu,
      row.urutan,
    );
  }
  return { kode, synced: rows.length };
}

async function getDefaultMenuTabsForSektor(kodeSektor) {
  const kode = String(kodeSektor || "")
    .trim()
    .toUpperCase();
  if (!kode) return [];
  const keys = biodataMenuConfig.getSectorMenuKeys(kode);
  if (keys?.length) return menuKeysToTabs(kode, keys);
  return menuKeysToTabs(kode, [
    "personal",
    "family",
    "vaksin",
    "dokumen",
    "upload",
  ]);
}

async function seedMenuMapping() {
  try {
    const deleted = await deleteMenuMappingRowsWithoutSektor();
    if (deleted > 0) {
      console.log(`[DB] seedMenuMapping: removed ${deleted} invalid menu_mapping rows without sektor`);
    }
    const emptyTotal = [];
    for (const kode of biodataMenuConfig.getAllSectorCodes()) {
      const n = await seedMenuMappingForSector(kode);
      if (n > 0) emptyTotal.push(n);
    }
    const emptySum = emptyTotal.reduce((a, b) => a + b, 0);
    if (emptySum > 0) {
      console.log(
        `[DB] seedMenuMapping: ${emptySum} baris baru (sektor kosong)`,
      );
    }
    await syncMenuMappingPlanning();
  } catch (e) {
    console.warn("[DB] seedMenuMapping skipped:", e.message);
  }
}

/** Selaraskan katalog biodata ke engine PDF (bukan Word/LibreOffice) */
async function alignBiodataTemplateEnginePlanning() {
  try {
    await q(
      db.prepare(
        `UPDATE letter_templates SET engine = 'pdf' WHERE kategori = 'biodata' AND engine <> 'pdf'`,
      ),
      "run",
    );
  } catch (e) {
    console.warn("[DB] alignBiodataTemplateEnginePlanning skipped:", e.message);
  }
}

/** Jalankan ulang aman setelah migrasi DB / pindah server */
async function ensureBootstrapData() {
  await ensureDatacabangCore();
  await alignBiodataTemplateEnginePlanning();
  await seedMenuMapping();
  await seedInterviewDemoCore();
}

/** Reset semua sektor dari config — hanya dipanggil manual (script/API), bukan saat bootstrap */
async function patchMenuMappingPlanningMatrix() {
  let synced = 0;
  for (const kode of biodataMenuConfig.getAllSectorCodes()) {
    const result = await resetMenuMappingFromConfig(kode);
    synced += result.synced || 0;
  }
  if (synced > 0) {
    console.log(
      `[DB] patchMenuMappingPlanningMatrix: ${biodataMenuConfig.getAllSectorCodes().length} sektor direset dari config`,
    );
  }
  return synced;
}

async function patchMenuMappingUploadTab() {
  console.warn(
    "[DB] patchMenuMappingUploadTab deprecated — gunakan menu_mapping setting atau npm run seed:menu-sektor",
  );
  return 0;
}

async function patchMenuMappingIMSector() {
  console.warn(
    "[DB] patchMenuMappingIMSector deprecated — gunakan menu_mapping setting atau npm run seed:menu-sektor",
  );
  return 0;
}

async function patchMenuMappingBiodataExtras() {
  console.warn(
    "[DB] patchMenuMappingBiodataExtras deprecated — gunakan menu_mapping setting atau npm run seed:menu-sektor",
  );
  return 0;
}

async function listByIdBiodata(table, idBiodata) {
  try {
    const rows = await q(
      db.prepare(
        `SELECT * FROM "${table}" WHERE "id_biodata" = ? ORDER BY id DESC`,
      ),
      "all",
      idBiodata,
    );
    return normalizeRows(rows);
  } catch {
    return [];
  }
}

/** Tabel dengan kolom id_biodata (cache) — untuk cek keterikatan & cascade hapus */
let idBiodataTablesCache = null;
function getIdBiodataTables() {
  if (idBiodataTablesCache) return idBiodataTablesCache;
  const schemas = loadSchemas();
  idBiodataTablesCache = Object.keys(schemas).filter((name) => {
    if (name === "personal") return false;
    const fields = schemas[name]?.fields || [];
    return fields.some((f) => f.name === "id_biodata");
  });
  return idBiodataTablesCache;
}

const PERSONAL_DELETE_MARK_TABLES = [
  "marka",
  "markb",
  "markc",
  "marke",
  "markf",
  "markg",
];
const PERSONAL_DELETE_STUB_TABLES = new Set([
  "dokumen",
  "skck",
  "skck_polres",
  "disnaker",
  ...PERSONAL_DELETE_MARK_TABLES,
]);

function rowHasFilledFields(
  row,
  ignoreKeys = ["id", "id_biodata", "created_at", "updated_at"],
) {
  if (!row) return false;
  return Object.keys(row).some((k) => {
    if (ignoreKeys.includes(k)) return false;
    const v = row[k];
    return v != null && String(v).trim() !== "";
  });
}

function isDefaultDokumenStub(row) {
  if (!row) return true;
  const placeholderFields = [
    "ktp",
    "kk",
    "akte",
    "ijazah",
    "foto",
    "photo",
    "sim",
    "pasfoto",
  ];
  const isPlaceholder = (val) => {
    const s = String(val || "").trim();
    return !s || /^profile\.jpg$/i.test(s);
  };
  return Object.keys(row).every((k) => {
    if (["id", "id_biodata"].includes(k)) return true;
    const v = row[k];
    if (v == null || String(v).trim() === "") return true;
    if (placeholderFields.includes(k)) return isPlaceholder(v);
    return false;
  });
}

function isMarkProgressStubRow(row) {
  if (!row) return true;
  return !rowHasFilledFields(row);
}

function isPersonalRowBinding(table, row) {
  if (!row) return false;
  if (table === "dokumen") return !isDefaultDokumenStub(row);
  if (PERSONAL_DELETE_MARK_TABLES.includes(table))
    return !isMarkProgressStubRow(row);
  if (table === "skck" || table === "skck_polres" || table === "disnaker") {
    return rowHasFilledFields(row);
  }
  return rowHasFilledFields(row);
}

function isPersonalRecordLocked(personal) {
  if (!personal) return true;
  if (Number(personal.statterbang) === 1) return true;
  const status = String(personal.statusaktif || "")
    .trim()
    .toUpperCase();
  return status !== "" && status !== "PROSES";
}

/**
 * Cek apakah biodata masih "baru" (hanya stub auto-create) — boleh dihapus akun biodata.
 * Jika sudah ada keterikatan ke tabel lain, hanya administrator (super_admin/admin).
 */
async function getPersonalDeleteEligibility(idBiodata) {
  const id = String(idBiodata || "").trim();
  if (!id) {
    return {
      allowed: false,
      isNew: false,
      bindings: [],
      message: "ID biodata tidak valid.",
    };
  }

  const personal = await getByField("personal", "id_biodata", id);
  if (!personal) {
    return {
      allowed: false,
      isNew: false,
      bindings: [],
      message: "Biodata tidak ditemukan.",
    };
  }

  if (isPersonalRecordLocked(personal)) {
    return {
      allowed: false,
      isNew: false,
      bindings: [
        { table: "personal", reason: `Status ${personal.statusaktif || "—"}` },
      ],
      message:
        "Biodata sudah memiliki status proses lanjutan — hanya administrator yang dapat menghapus.",
    };
  }

  const bindings = [];
  for (const table of getIdBiodataTables()) {
    const rows = await listByIdBiodata(table, id);
    for (const row of rows) {
      if (PERSONAL_DELETE_STUB_TABLES.has(table)) {
        if (isPersonalRowBinding(table, row)) {
          bindings.push({ table, id: row.id, reason: "Data sudah diisi" });
        }
      } else if (isPersonalRowBinding(table, row)) {
        bindings.push({ table, id: row.id, reason: "Ada keterikatan data" });
      }
    }
  }

  if (bindings.length) {
    const labels = [...new Set(bindings.map((b) => b.table))];
    const preview = labels.slice(0, 4).join(", ");
    const suffix =
      labels.length > 4 ? ` (+${labels.length - 4} tabel lain)` : "";
    return {
      allowed: false,
      isNew: false,
      bindings,
      message: `Biodata sudah terhubung ke data lain (${preview}${suffix}). Hanya administrator yang dapat menghapus.`,
    };
  }

  return {
    allowed: true,
    isNew: true,
    bindings: [],
    message: "Biodata masih baru — dapat dihapus.",
  };
}

// Generate id_biodata baru & baris terkait (alur tambahbio)
async function createTkiBiodata(payload = {}) {
  const kodeSektor = String(payload.kode_sektor || "")
    .trim()
    .toUpperCase();
  const nama = String(payload.nama || "").trim();
  const tanggaldaftar = String(payload.tanggaldaftar || "").trim();
  const kodeCabang = String(payload.kode_cabang || "")
    .trim()
    .toUpperCase();

  if (!kodeSektor || !nama) {
    throw new Error("Sektor dan nama wajib diisi");
  }
  if (!tanggaldaftar) {
    throw new Error("Tanggal daftar wajib diisi");
  }
  if (!kodeCabang) {
    throw new Error("Kode cabang wajib diisi (auto-fill dari user login)");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggaldaftar)) {
    throw new Error("Format tanggal daftar tidak valid (YYYY-MM-DD)");
  }

  // Validate kode_cabang exists in datacabang table
  const cabangRow = await getByField("datacabang", "kode_cabang", kodeCabang);
  if (!cabangRow) {
    throw new Error(
      `Kode cabang '${kodeCabang}' tidak ditemukan. Pastikan user memiliki kode_cabang yang valid.`,
    );
  }

  const sektorRow = await getByField("datasektor", "kode_jenis", kodeSektor);
  if (!sektorRow) throw new Error(`Sektor ${kodeSektor} tidak ditemukan`);

  const nextNo = await getNextBiodataSequence(kodeCabang, kodeSektor);
  const idBiodata = `${kodeCabang}-${kodeSektor}-${String(nextNo).padStart(4, "0")}`;

  await assertPersonalIdBiodataUnique(idBiodata);

  const idTki = await getIdTkiService().generateIdTki(getDbApi());
  const today = new Date().toISOString().slice(0, 10);
  const jk = payload.jeniskelamin || sektorRow.jeniskelamin || "P";

  // Auto-detect status kawin dari NIK (digit 7-8) jika belum diisi (mis. input manual)
  // NIK format: 330706 DDMMYY CCCC NNNN — digit 7-8 >= 40 indikasi sudah kawin
  let statusKawin = String(payload.status || "").trim();
  const nik = await assertPersonalNikUnique(payload.nik);
  if (!statusKawin && nik.length === 16) {
    const digitStatus = parseInt(nik.substring(6, 8), 10);

    if (digitStatus >= 40) {
      statusKawin = "Kawin";
    } else {
      statusKawin = "Belum Kawin";
    }

    console.log(
      `[Auto Status] NIK: ${nik}, Digit 7-8: ${digitStatus}, Status: ${statusKawin}`,
    );
  }

  // Create personal record dengan data dari OCR (jika ada)
  await create("personal", {
    id_tki: idTki,
    id_biodata: idBiodata,
    kode_cabang: kodeCabang,
    kode_sektor: kodeSektor,
    is_active: 1,
    arsip_status: "active",
    episode_seq: 1,
    nama,
    nik: nik, // NIK dari OCR
    jeniskelamin: jk,
    kode_sponsor: payload.kode_sponsor || "",
    tanggaldaftar,
    tglinput: today,
    statusaktif: "PROSES",
    statterbang: 0,
    negara1:
      payload.negara1 ||
      getIdTkiService().resolveNegaraTujuanFromSektor(kodeSektor, sektorRow),
    warganegara: "Indonesia",
    // Data dari OCR KTP (jika ada)
    tempatlahir: payload.tempatlahir || "",
    tgllahir: payload.tgllahir || "",
    agama: payload.agama || "",
    status: statusKawin, // Dari OCR/form, atau auto-detect NIK jika kosong
    alamat: payload.alamat || "",
  });

  await create("dokumen", {
    id_biodata: idBiodata,
    ktp: "profile.jpg",
    kk: "profile.jpg",
    akte: "profile.jpg",
    ijazah: "profile.jpg",
  });

  await create("skck", { id_biodata: idBiodata });
  await create("skck_polres", { id_biodata: idBiodata });
  await create("disnaker", { id_biodata: idBiodata });

  await ensureMarkProgressForTki(idBiodata);

  // Jika ada file KTP dari OCR, simpan ke upload_ktp DAN update dokumen.ktp
  if (payload.ktp_file && payload.ktp_ocr_data) {
    try {
      const uploadService = require("./upload-service");
      const fs = require("fs");
      const path = require("path");

      // Decode base64 file
      const base64Data = payload.ktp_file.data.split(",")[1];
      const buffer = Buffer.from(base64Data, "base64");

      // Create upload directory
      const uploadDir = path.join(
        process.cwd(),
        "data",
        "uploads",
        "upload_ktp",
        idBiodata,
      );
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Save file
      const timestamp = Date.now();
      const filename = `ktp_${timestamp}.jpg`;
      const filePath = path.join(uploadDir, filename);
      fs.writeFileSync(filePath, buffer);

      // Create upload_ktp record
      const relativePath = `/uploads/upload_ktp/${idBiodata}/${filename}`;
      await create("upload_ktp", {
        id_biodata: idBiodata,
        namadok: "KTP dari OCR",
        file: relativePath,
        keterangan: "Auto-uploaded from OCR KTP",
        tglterima: today,
      });

      // UPDATE dokumen.ktp agar tampil di tab Dokumen
      await updateDokumenIdentitasFile(idBiodata, "ktp", relativePath);

      console.log(`[OCR KTP] Auto-uploaded for ${idBiodata}: ${filename}`);
      console.log(`[OCR KTP] Updated dokumen.ktp for ${idBiodata}`);
    } catch (error) {
      console.error("[OCR KTP] Failed to save KTP file:", error.message);
      // Don't fail the whole operation if file save fails
    }
  }

  return { id_tki: idTki, id_biodata: idBiodata, kode_sektor: kodeSektor };
}

/**
 * Auto-save family data dari OCR KK
 * @param {string} idBiodata - ID biodata TKI
 * @param {object} kkOcrData - Data hasil OCR KK
 */
async function saveFamilyFromKkOcr(idBiodata, kkOcrData = {}) {
  if (!idBiodata || !kkOcrData || Object.keys(kkOcrData).length === 0) {
    return;
  }

  try {
    // Cek apakah sudah ada record family untuk TKI ini
    let familyRecord = await getByField("family", "id_biodata", idBiodata);

    // Extract data dari OCR KK
    const familyData = {
      id_biodata: idBiodata,
      nama_bapak: kkOcrData.nama_kepala_keluarga || "",
      nama_ibu: "", // KK tidak selalu punya field ibu
      nama_istri_suami: "",
      data_anak: "",
    };

    // Build data anak dari anggota keluarga (skip Kepala Keluarga)
    const children = [];
    for (let i = 1; i <= 5; i++) {
      const nama = kkOcrData[`nama_anggota_${i}`];
      const hubungan = kkOcrData[`hubungan_${i}`];

      if (nama && hubungan && hubungan.toLowerCase() !== "kepala keluarga") {
        children.push(`${nama} (${hubungan})`);
      }
    }

    if (children.length > 0) {
      familyData.data_anak = children.join(", ");
    }

    // Cek apakah ada Istri/Suami
    for (let i = 1; i <= 5; i++) {
      const nama = kkOcrData[`nama_anggota_${i}`];
      const hubungan = kkOcrData[`hubungan_${i}`];

      if (
        nama &&
        (hubungan.toLowerCase().includes("istri") ||
          hubungan.toLowerCase().includes("suami"))
      ) {
        familyData.nama_istri_suami = nama;
        break;
      }
    }

    if (familyRecord) {
      // Update existing record
      await update("family", familyData, { id_biodata: idBiodata });
      console.log(`[OCR KK] Updated family data for ${idBiodata}`);
    } else {
      // Create new record
      await create("family", familyData);
      console.log(`[OCR KK] Created family data for ${idBiodata}`);
    }
  } catch (error) {
    console.error("[OCR KK] Failed to save family data:", error.message);
    // Don't fail the whole operation if family save fails
  }
}

/** Baris progress marketing kosong per TKI (plan §8A.2 — markb..markg + marka) */
const MARK_PROGRESS_TABLES = [
  "marka",
  "markb",
  "markc",
  "marke",
  "markf",
  "markg",
];

async function ensureMarkProgressForTki(idBiodata) {
  const id = String(idBiodata || "").trim();
  if (!id) return;
  for (const table of MARK_PROGRESS_TABLES) {
    try {
      const existing = await getByField(table, "id_biodata", id);
      if (!existing) {
        await create(table, { id_biodata: id, status: "" });
      }
    } catch (e) {
      console.warn(`[DB] ensureMarkProgressForTki ${table}:`, e.message);
    }
  }
}

async function getMenuMappingBySektor(kodeSektor) {
  const kode = String(kodeSektor || "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  if (!kode) return [];
  try {
    const rows = await q(
      db.prepare(
        `SELECT id, kode_sektor, label_menu, url_menu, icon_menu, urutan, aktif
         FROM menu_mapping WHERE kode_sektor = ? AND aktif = 1 ORDER BY urutan ASC, id ASC`,
      ),
      "all",
      kode,
    );
    const mapped = normalizeMenuMappingForSektor(kode, normalizeRows(rows));
    if (mapped.length) return mapped;
  } catch {
    /* fallback below */
  }
  return getDefaultMenuTabsForSektor(kode);
}

/** Dedupe + filter tab sesuai config — cegah tab informal (tugas RT) bocor ke sektor formal */
function normalizeMenuMappingForSektor(kodeSektor, rows) {
  const allowed = biodataMenuConfig.getAllowedMenuUrls(kodeSektor);
  const allowedSet = allowed ? new Set(allowed) : null;
  const byUrl = new Map();

  for (const row of rows || []) {
    const url = String(row.url_menu || "").trim();
    if (!url) continue;
    if (allowedSet && !allowedSet.has(url)) continue;
    const prev = byUrl.get(url);
    if (
      !prev ||
      Number(row.urutan) < Number(prev.urutan) ||
      (Number(row.urutan) === Number(prev.urutan) &&
        Number(row.id) < Number(prev.id))
    ) {
      byUrl.set(url, row);
    }
  }

  return Array.from(byUrl.values()).sort(
    (a, b) =>
      (Number(a.urutan) || 0) - (Number(b.urutan) || 0) ||
      Number(a.id) - Number(b.id),
  );
}

// Get the raw sql.js handle
function getDb() {
  return sqlDb;
}

// Get schema for a table
function getSchema(tableName) {
  const schemas = loadSchemas();
  return schemas[tableName] || null;
}

// Get all table names that have schemas
function getTableNames() {
  return Object.keys(loadSchemas());
}

// ============================================
// Generic CRUD operations
// ============================================

// List rows with pagination and search
async function list(table, options = {}) {
  const {
    page = 1,
    perPage = 10,
    search = "",
    searchFields = [],
    sort = "",
    order = "asc",
    filters = {},
  } = options;

  const conditions = [];
  const params = {};

  if (filters.id_biodata) {
    conditions.push(`"id_biodata" = @id_biodata`);
    params.id_biodata = filters.id_biodata;
  }

  const sektorPrefixes = mergeFilterValues(
    filters.id_biodata_prefix,
    filters.sektor_prefixes || filters.id_biodata_prefixes,
  )
    .map((p) => String(p).trim().toUpperCase())
    .filter(Boolean);
  const useKodeSektorFilter = table === "datatki" || table === "personal";
  if (useKodeSektorFilter && sektorPrefixes.length === 1) {
    conditions.push(`"kode_sektor" = @kode_sektor_flt`);
    params.kode_sektor_flt = sektorPrefixes[0];
  } else if (useKodeSektorFilter && sektorPrefixes.length > 1) {
    const orParts = sektorPrefixes.map((p, i) => {
      params[`kode_sektor_flt_${i}`] = p;
      return `"kode_sektor" = @kode_sektor_flt_${i}`;
    });
    conditions.push(`(${orParts.join(" OR ")})`);
  } else if (sektorPrefixes.length === 1) {
    conditions.push(`"id_biodata" LIKE @id_biodata_prefix`);
    params.id_biodata_prefix = `${sektorPrefixes[0]}%`;
  } else if (sektorPrefixes.length > 1) {
    const orParts = sektorPrefixes.map((p, i) => {
      params[`id_biodata_prefix_${i}`] = `${p}%`;
      return `"id_biodata" LIKE @id_biodata_prefix_${i}`;
    });
    conditions.push(`(${orParts.join(" OR ")})`);
  }

  if (table === "datatki") {
    const rkKey = String(
      filters.stage_filter || filters.tahap_filter || "",
    )
      .trim()
      .toLowerCase();
    if (rkKey === "belum_rekening" || rkKey === "sudah_rekening") {
      const bukaRekeningService = require("./services/buka-rekening-tki-service");
      const rkSql = bukaRekeningService.buildDatatkiRekeningStageSql(
        rkKey,
        "datatki.id_tki",
      );
      if (rkSql) conditions.push(rkSql);
    } else if (
      rkKey === "belum_pengajuan_spbg" ||
      rkKey === "sudah_pengajuan_spbg"
    ) {
      const spbgMarketingService = require("./services/spbg-marketing-service");
      const spbgSql = spbgMarketingService.buildDatatkiSpbgStageSql(
        rkKey,
        "datatki.id_tki",
      );
      if (spbgSql) conditions.push(spbgSql);
    } else if (filters.stage_filters || filters.stage_filter || filters.tahap_filter) {
      const stageSql = buildMultiStageFilterSql(
        mergeFilterValues(
          filters.stage_filter || filters.tahap_filter,
          filters.stage_filters,
        ),
        '"id_biodata"',
      );
      if (stageSql) conditions.push(stageSql);
    }
  }

  if (
    table === "personal" &&
    (filters.stage_filters || filters.stage_filter || filters.tahap_filter)
  ) {
    const stageSql = buildMultiStageFilterSql(
      mergeFilterValues(
        filters.stage_filter || filters.tahap_filter,
        filters.stage_filters,
      ),
      '"id_biodata"',
    );
    if (stageSql) conditions.push(stageSql);
  }

  const tableSchema = getSchema(table);
  const allowedFilterFields = tableSchema
    ? new Set(tableSchema.fields.map((f) => f.name))
    : null;
  const allowedSortFields = allowedFilterFields;

  // Suhan / visa permit per kode majikan (kolom id_majikan → datamajikan.kode_majikan)
  if (filters.kode_majikan) {
    const km = String(filters.kode_majikan).trim();
    if (km) {
      if (table === "datasuhan") {
        conditions.push(
          `"id_majikan" IN (SELECT id FROM "datamajikan" WHERE "kode_majikan" = @rel_kode_majikan)`,
        );
        params.rel_kode_majikan = km;
      } else if (table === "datavisapermit") {
        conditions.push(
          `"id_majikan" IN (SELECT id FROM "datamajikan" WHERE "kode_majikan" = @rel_kode_majikan)`,
        );
        params.rel_kode_majikan = km;
      }
    }
  }

  if ((table === "personal" || table === "datatki") && filters.kode_agen) {
    const ka = String(filters.kode_agen).trim();
    if (ka) {
      conditions.push(`(
        EXISTS (
          SELECT 1 FROM majikan mj
          WHERE mj.id_biodata = "${table}"."id_biodata"
            AND mj.kode_agen = @personal_kode_agen
            AND NULLIF(TRIM(mj.namamajikan), '') IS NOT NULL
        )
        OR (
          EXISTS (
            SELECT 1 FROM majikan mj
            WHERE mj.id_biodata = "${table}"."id_biodata"
              AND NULLIF(TRIM(mj.namamajikan), '') IS NOT NULL
          )
          AND EXISTS (
            SELECT 1 FROM marka_biotoagen mb
            WHERE mb.id_biodata = "${table}"."id_biodata"
              AND mb.kode_agen = @personal_kode_agen
          )
        )
      )`);
      params.personal_kode_agen = ka;
    }
  }

  if (
    (table === "personal" || table === "datatki") &&
    (filters.require_penempatan === "1" || filters.require_penempatan === true)
  ) {
    conditions.push(`(
      EXISTS (
        SELECT 1 FROM majikan mj
        WHERE mj.id_biodata = "${table}"."id_biodata"
          AND NULLIF(TRIM(mj.namamajikan), '') IS NOT NULL
          AND NULLIF(TRIM(mj.kode_agen), '') IS NOT NULL
      )
      OR (
        EXISTS (
          SELECT 1 FROM majikan mj
          WHERE mj.id_biodata = "${table}"."id_biodata"
            AND NULLIF(TRIM(mj.namamajikan), '') IS NOT NULL
        )
        AND EXISTS (
          SELECT 1 FROM marka_biotoagen mb
          WHERE mb.id_biodata = "${table}"."id_biodata"
            AND NULLIF(TRIM(mb.kode_agen), '') IS NOT NULL
        )
      )
    )`);
  }

  // Filter kolom generik (mis. datamajikan?kode_agen=AG01)
  for (const [key, val] of Object.entries(filters)) {
    if (
      key === "id_biodata" ||
      key === "id_biodata_prefix" ||
      key === "id_biodata_prefixes" ||
      key === "sektor_prefixes"
    )
      continue;
    if (
      key === "stage_filter" ||
      key === "stage_filters" ||
      key === "tahap_filter"
    )
      continue;
    if (
      key === "kode_majikan" &&
      (table === "datasuhan" || table === "datavisapermit")
    )
      continue;
    if (key === "kode_agen" && (table === "personal" || table === "datatki"))
      continue;
    if (key === "require_penempatan") continue;
    if (val == null || String(val).trim() === "") continue;
    if (!/^[A-Za-z0-9_]+$/.test(key)) continue;
    if (allowedFilterFields && !allowedFilterFields.has(key)) continue;
    const vals = parseCsvFilter(val);
    if (vals.length > 1) {
      const inParams = vals.map((v, i) => {
        const paramKey = `flt_${key}_${i}`;
        params[paramKey] = v;
        return `@${paramKey}`;
      });
      conditions.push(`"${key}" IN (${inParams.join(", ")})`);
      continue;
    }
    const paramKey = `flt_${key}`;
    conditions.push(`"${key}" = @${paramKey}`);
    params[paramKey] = vals[0] ?? val;
  }

  if (search && searchFields.length > 0) {
    const searchConds = searchFields.map((f, i) => {
      params[`search${i}`] = `%${search}%`;
      const col = isPostgres() ? `"${f}"::text` : `"${f}"`;
      return `${col} LIKE @search${i}`;
    });
    conditions.push(`(${searchConds.join(" OR ")})`);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const countSQL = `SELECT COUNT(*) as total FROM "${table}" ${whereClause}`;
  const countRow = await q(db.prepare(countSQL), "get", params);
  const total = Number(countRow.total);

  const pkCol = await resolveTablePkColumn(table);

  let orderClause = "";
  if (sort) {
    // Mendukung dua format:
    //  1) single  : sort=kolom            (+ order=asc|desc)
    //  2) multi   : sort=kolom1:asc,kolom2:desc
    // Kolom yang tidak alfanumerik/underscore di-skip supaya aman.
    const parts = String(sort)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const safe = [];
    for (const part of parts) {
      const [colRaw, dirRaw] = part.split(":");
      const col = String(colRaw || "").trim();
      if (!col || !/^[A-Za-z0-9_]+$/.test(col)) continue;
      if (allowedSortFields && !allowedSortFields.has(col)) continue;
      const dir =
        String(dirRaw || order || "asc").toLowerCase() === "desc"
          ? "DESC"
          : "ASC";
      safe.push(`"${col}" ${dir}`);
    }
    orderClause = safe.length
      ? `ORDER BY ${safe.join(", ")}`
      : `ORDER BY "${pkCol}" DESC`;
  } else {
    orderClause = `ORDER BY "${pkCol}" DESC`;
  }

  const limit = Math.max(1, parseInt(perPage, 10) || 10);
  const offset = Math.max(0, (parseInt(page, 10) || 1) - 1) * limit;

  const dataSQL = `SELECT * FROM "${table}" ${whereClause} ${orderClause} LIMIT ${limit} OFFSET ${offset}`;
  const data = normalizeRows(await q(db.prepare(dataSQL), "all", params));

  return {
    data,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage),
    },
  };
}

// Get single row by id
async function getById(table, id) {
  const pk = await resolveTablePkColumn(table);
  const row = await q(
    db.prepare(`SELECT * FROM "${table}" WHERE "${pk}" = ?`),
    "get",
    id,
  );
  return normalizeRow(row);
}

// Ambil satu baris berdasarkan kolom teks (mis. id_biodata)
async function getByField(table, field, value) {
  if (!value) return null;
  try {
    const row = await q(
      db.prepare(`SELECT * FROM "${table}" WHERE "${field}" = ? LIMIT 1`),
      "get",
      value,
    );
    return normalizeRow(row);
  } catch {
    return null;
  }
}

function isManualPrimaryKeyField(schema, fieldName) {
  const f = schema?.fields?.find((x) => x.name === fieldName);
  if (!f || f.autoIncrement) return false;
  return f.type === "text" || f.type === "string";
}

function getSchemaWritableFieldNames(schema, pk) {
  if (!schema?.fields) return null;
  return schema.fields
    .filter((f) => {
      if (!f.name || f.autoIncrement) return false;
      if (f.name === pk) return isManualPrimaryKeyField(schema, pk);
      return true;
    })
    .map((f) => f.name);
}

function pickDataForSchema(table, data, pk) {
  const schema = getSchema(table);
  const allowed = getSchemaWritableFieldNames(schema, pk);
  if (!allowed) return { ...data };
  const out = {};
  allowed.forEach((name) => {
    if (Object.prototype.hasOwnProperty.call(data, name)) {
      out[name] = data[name];
    }
  });
  return out;
}

/** Interview JP — satu baris per TKI; hapus duplikat legacy. */
async function dedupeInterviewByBiodata(idBiodata, keepId) {
  const id = String(idBiodata || "").trim();
  const keep = keepId != null ? Number(keepId) : null;
  if (!id || keep == null || Number.isNaN(keep)) return 0;
  const rows = await listByIdBiodata("interview", id);
  let removed = 0;
  for (const row of rows) {
    const rowId = row?.id != null ? Number(row.id) : null;
    if (rowId == null || rowId === keep) continue;
    await remove("interview", rowId, { skipAudit: true });
    removed += 1;
  }
  return removed;
}

/** Skill & kondisi — satu baris per TKI; hapus duplikat legacy. */
async function dedupeSkillconditionByBiodata(idBiodata, keepId) {
  const id = String(idBiodata || "").trim();
  const keep = keepId != null ? Number(keepId) : null;
  if (!id || keep == null || Number.isNaN(keep)) return 0;
  const rows = await listByIdBiodata("skillcondition", id);
  let removed = 0;
  for (const row of rows) {
    const rowId = row?.id != null ? Number(row.id) : null;
    if (rowId == null || rowId === keep) continue;
    await remove("skillcondition", rowId, { skipAudit: true });
    removed += 1;
  }
  return removed;
}

/** Permintaan kerja — satu baris per TKI; hapus duplikat legacy. */
async function dedupeRequestByBiodata(idBiodata, keepId) {
  const id = String(idBiodata || "").trim();
  const keep = keepId != null ? Number(keepId) : null;
  if (!id || keep == null || Number.isNaN(keep)) return 0;
  const rows = await listByIdBiodata("request", id);
  let removed = 0;
  for (const row of rows) {
    const rowId = row?.id != null ? Number(row.id) : null;
    if (rowId == null || rowId === keep) continue;
    await remove("request", rowId, { skipAudit: true });
    removed += 1;
  }
  return removed;
}

/** Vaksin — satu baris per TKI (dosis 1–3); hapus duplikat legacy. */
async function dedupeVaksinByBiodata(idBiodata, keepId) {
  const id = String(idBiodata || "").trim();
  const keep = keepId != null ? Number(keepId) : null;
  if (!id || keep == null || Number.isNaN(keep)) return 0;
  const rows = await listByIdBiodata("vaksin", id);
  let removed = 0;
  for (const row of rows) {
    const rowId = row?.id != null ? Number(row.id) : null;
    if (rowId == null || rowId === keep) continue;
    await remove("vaksin", rowId, { skipAudit: true });
    removed += 1;
  }
  return removed;
}

/** Ket. Tugas informal — satu baris per TKI; hapus duplikat legacy. */
async function dedupeKettugasByBiodata(idBiodata, keepId) {
  const id = String(idBiodata || "").trim();
  const keep = keepId != null ? Number(keepId) : null;
  if (!id || keep == null || Number.isNaN(keep)) return 0;
  const rows = await listByIdBiodata("kettugas", id);
  let removed = 0;
  for (const row of rows) {
    const rowId = row?.id != null ? Number(row.id) : null;
    if (rowId == null || rowId === keep) continue;
    await remove("kettugas", rowId, { skipAudit: true });
    removed += 1;
  }
  return removed;
}

// Insert a new row
async function create(table, data, auditOpts = {}) {
  data = prepareRowData(table, data);
  const schema = getSchema(table);
  const pk = await resolveTablePkColumn(table);
  data = pickDataForSchema(table, data, pk);

  if (table === "personal" && data.id_biodata !== undefined) {
    data.id_biodata = await assertPersonalIdBiodataUnique(data.id_biodata);
  }
  if (table === "personal" && data.nik !== undefined) {
    data.nik = await assertPersonalNikUnique(data.nik);
  }

  if (table === "majikan") {
    assertMajikanTglTerpilih(data);
  }

  if (table === "pembayaran_tki") {
    const pembayaranService = require("./services/pembayaran-tki-service");
    data = await pembayaranService.prepareCreate(
      getDbApi(),
      data,
      auditOpts.user || {},
    );
  }
  if (table === "piutang_tki") {
    const piutangService = require("./services/piutang-tki-service");
    data = await piutangService.prepareCreate(
      getDbApi(),
      data,
      auditOpts.user || {},
    );
  }
  if (table === "pembayaran_fee_agen") {
    const feeService = require("./services/fee-agen-service");
    data = await feeService.prepareCreate(
      getDbApi(),
      data,
      auditOpts.user || {},
    );
  }
  if (table === "gaji_tki") {
    const gajiService = require("./services/gaji-tki-service");
    data = await gajiService.prepareCreate(
      getDbApi(),
      data,
      auditOpts.user || {},
    );
  }
  if (table === "buka_rekening_baru") {
    const bukaRekeningService = require("./services/buka-rekening-tki-service");
    data = await bukaRekeningService.prepareWrite(getDbApi(), data);
  }

  if (
    (table === "jurnal_keuangan" || table === "jurnal_keuangan_detail") &&
    !auditOpts.allowJurnalInternal
  ) {
    throw new Error(
      "Jurnal hanya via menu Jurnal Umum / Kas Masuk / Kas Keluar.",
    );
  }

  // Satu baris per id_biodata — hindari duplikat saat create ulang
  const BIODATA_SINGLETON_TABLES = new Set([
    "family",
    "dokumen",
    "disnaker",
    "medical",
    "medical2",
    "medical3",
    "paspor",
    "pasporlama",
    "majikan",
    "visa",
    "skck",
    "skck_polres",
    "legalitas",
    "signingbank",
    "buka_rekening_baru",
    "asuransi_dan_hotel",
    "isichongyi",
    "pap",
    "bank",
    "marka",
    "markb",
    "markc",
    "marke",
    "markf",
    "markg",
    "interview",
    "kettugas",
    "skillcondition",
    "request",
    "vaksin",
  ]);
  if (table === "buka_rekening_baru" && data.id_tki) {
    const bukaRekeningService = require("./services/buka-rekening-tki-service");
    const existingByTki = await bukaRekeningService.getRecordByIdTki(
      getDbApi(),
      data.id_tki,
    );
    const existingId = existingByTki?.[pk] ?? existingByTki?.id;
    if (existingId != null) {
      return update(table, existingId, data, auditOpts);
    }
  }
  if (BIODATA_SINGLETON_TABLES.has(table) && data.id_biodata) {
    const existing = await getByField(
      table,
      "id_biodata",
      String(data.id_biodata).trim(),
    );
    const existingId = existing?.[pk] ?? existing?.id;
    if (existingId != null) {
      return update(table, existingId, data, auditOpts);
    }
  }

  // Filter out the primary key (autoIncrement) and unknown columns
  const validFields = schema
    ? schema.fields
        .map((f) => f.name)
        .filter((f) => f !== pk || isManualPrimaryKeyField(schema, pk))
    : Object.keys(data);
  let fields = validFields.filter((f) => data[f] !== undefined);

  // For required (NOT NULL) fields not provided, supply a default to avoid constraint errors
  if (schema) {
    for (const field of schema.fields) {
      if (field.name === pk && !isManualPrimaryKeyField(schema, pk)) continue;
      if (field.required && !fields.includes(field.name)) {
        fields.push(field.name);
        if (field.defaultValue !== undefined) {
          data[field.name] = field.defaultValue;
        } else if (field.type === "number") {
          data[field.name] = 0;
        } else {
          data[field.name] = "";
        }
      }
    }
  }

  // Add updatedAt timestamp if schema has it
  if (
    schema?.timestamps?.updatedAt &&
    !fields.includes(schema.timestamps.updatedAt)
  ) {
    fields.push(schema.timestamps.updatedAt);
    data[schema.timestamps.updatedAt] = new Date().toISOString();
  }
  if (
    schema?.timestamps?.createdAt &&
    !fields.includes(schema.timestamps.createdAt)
  ) {
    fields.push(schema.timestamps.createdAt);
    data[schema.timestamps.createdAt] = new Date().toISOString();
  }

  ({ data, fields } = await applyDbNotNullDefaults(table, data, fields));

  const placeholders = fields.map((f) => `@${f}`);
  const sql = `INSERT INTO "${table}" (${fields.map((f) => `"${f}"`).join(", ")}) VALUES (${placeholders.join(", ")})`;

  const params = {};
  for (const f of fields) {
    params[f] = data[f] !== undefined ? data[f] : null;
  }

  let result;
  try {
    result = await q(db.prepare(sql), "run", params);
  } catch (err) {
    if (table === "personal" && isUniqueConstraintError(err)) {
      throw new Error(DUPLICATE_ID_BIODATA_MSG);
    }
    throw err;
  }
  const insertId = result.insertedRow?.[pk] ?? result.lastInsertRowid;
  if (result.insertedRow || insertId) {
    const row = result.insertedRow
      ? normalizeRow(result.insertedRow)
      : await getById(table, insertId);
    if (AUDIT_TABLES.has(table) && !auditOpts.skipAudit && row) {
      const auditId = row[pk] ?? insertId;
      await insertAuditLog(
        table,
        auditId,
        "create",
        null,
        row,
        auditOpts.userId || 1,
      );
    }
    if (table === "majikan" && row?.id_biodata) {
      const sync = await syncPersonalStatusAfterMajikanSave(
        row.id_biodata,
        auditOpts,
      );
      if (sync.changed) row.status_auto_terpilih = true;
    }
    if (table === "interview" && row?.id_biodata) {
      await dedupeInterviewByBiodata(row.id_biodata, row[pk] ?? row.id);
    }
    if (table === "kettugas" && row?.id_biodata) {
      await dedupeKettugasByBiodata(row.id_biodata, row[pk] ?? row.id);
    }
    if (table === "skillcondition" && row?.id_biodata) {
      await dedupeSkillconditionByBiodata(row.id_biodata, row[pk] ?? row.id);
    }
    if (table === "request" && row?.id_biodata) {
      await dedupeRequestByBiodata(row.id_biodata, row[pk] ?? row.id);
    }
    if (table === "vaksin" && row?.id_biodata) {
      await dedupeVaksinByBiodata(row.id_biodata, row[pk] ?? row.id);
    }
    if (table === "personal" && row?.id_tki && Number(row.is_active) !== 0) {
      await getIdTkiService().syncDatatkiFromActivePersonal(getDbApi(), row);
    }
    if (table === "pembayaran_tki" && row) {
      try {
        await require("./services/piutang-tki-service").syncFromPembayaran(
          getDbApi(),
          row,
        );
      } catch (piutangErr) {
        console.warn("[Piutang] syncFromPembayaran:", piutangErr.message);
      }
      try {
        await require("./services/jurnal-keuangan-service").postingPembayaran(
          getDbApi(),
          row,
          auditOpts.user || {},
        );
      } catch (jurnalErr) {
        console.warn("[Jurnal] postingPembayaran:", jurnalErr.message);
        throw jurnalErr;
      }
    }
    return row;
  }

  const fallbackRow = normalizeRow({ ...data, [pk]: insertId || null });
  if (
    AUDIT_TABLES.has(table) &&
    !auditOpts.skipAudit &&
    fallbackRow[pk] != null
  ) {
    await insertAuditLog(
      table,
      fallbackRow[pk],
      "create",
      null,
      fallbackRow,
      auditOpts.userId || 1,
    );
  }
  return fallbackRow;
}

// Update a row by id
async function update(table, id, data, auditOpts = {}) {
  data = prepareRowData(table, data);
  const schema = getSchema(table);
  const pk = await resolveTablePkColumn(table);
  data = pickDataForSchema(table, data, pk);
  const oldRow =
    AUDIT_TABLES.has(table) && !auditOpts.skipAudit
      ? await getById(table, id)
      : null;

  if (table === "personal" && data.id_biodata !== undefined) {
    data.id_biodata = await assertPersonalIdBiodataUnique(data.id_biodata, id);
  }
  if (table === "personal" && data.nik !== undefined) {
    data.nik = await assertPersonalNikUnique(data.nik, id);
  }

  if (table === "majikan") {
    const existingMajikan = await getById(table, id);
    assertMajikanTglTerpilih(data, existingMajikan);
  }

  if (table === "piutang_tki") {
    const piutangService = require("./services/piutang-tki-service");
    data = await piutangService.prepareUpdate(getDbApi(), id, data);
  }
  if (table === "pembayaran_fee_agen") {
    const feeService = require("./services/fee-agen-service");
    data = await feeService.prepareUpdate(getDbApi(), id, data);
  }
  if (table === "gaji_tki") {
    const gajiService = require("./services/gaji-tki-service");
    data = await gajiService.prepareUpdate(getDbApi(), id, data);
  }
  if (table === "buka_rekening_baru") {
    const bukaRekeningService = require("./services/buka-rekening-tki-service");
    data = await bukaRekeningService.prepareWrite(getDbApi(), data);
  }

  if (
    table === "personal" &&
    data.statusaktif !== undefined &&
    !auditOpts.skipStatusValidation
  ) {
    const rowForStatus = oldRow || (await getById(table, id));
    if (rowForStatus) {
      const nextStatus = normalizePersonalStatus(data.statusaktif);
      const prevStatus = normalizePersonalStatus(rowForStatus.statusaktif);
      if (nextStatus !== prevStatus) {
        const validation = await validatePersonalStatusChange(
          rowForStatus.id_biodata,
          nextStatus,
          {
            force: auditOpts.force,
            isAdmin: auditOpts.isAdmin,
          },
        );
        if (!validation.ok) {
          throw new Error(
            validation.error || "Perubahan status tidak diizinkan.",
          );
        }
      }
    }
  }

  // Remove pk from update fields
  const fields = Object.keys(data).filter((f) => f !== pk);

  // Auto-update updatedAt
  if (schema?.timestamps?.updatedAt) {
    const uaField = schema.timestamps.updatedAt;
    if (!fields.includes(uaField)) {
      fields.push(uaField);
      data[uaField] = new Date().toISOString();
    }
  }

  if (fields.length === 0) return null;

  const setClause = fields.map((f) => `"${f}" = @${f}`).join(", ");
  const sql = `UPDATE "${table}" SET ${setClause} WHERE "${pk}" = @_pk_`;

  const params = { _pk_: id };
  for (const f of fields) {
    params[f] = data[f] !== undefined ? data[f] : null;
  }

  let result;
  try {
    result = await q(db.prepare(sql), "run", params);
  } catch (err) {
    if (table === "personal" && isUniqueConstraintError(err)) {
      throw new Error(DUPLICATE_ID_BIODATA_MSG);
    }
    throw err;
  }
  if (!result.changes) return null;
  const updated = await getById(table, id);

  if (oldRow && AUDIT_TABLES.has(table) && !auditOpts.skipAudit) {
    await insertAuditLog(
      table,
      id,
      "update",
      oldRow,
      updated,
      auditOpts.userId || 1,
    );
  }

  if (
    table === "personal" &&
    oldRow &&
    updated &&
    normalizePersonalStatus(oldRow.statusaktif) !==
      normalizePersonalStatus(updated.statusaktif)
  ) {
    await appendPersonalStatusHistory({
      id_biodata: updated.id_biodata || oldRow.id_biodata,
      status_dari: oldRow.statusaktif,
      status_ke: updated.statusaktif,
      alasan: auditOpts.statusAlasan || auditOpts.alasan,
      changed_by: auditOpts.changedBy || auditOpts.changed_by || "",
    });
  }

  if (table === "majikan" && updated?.id_biodata) {
    const sync = await syncPersonalStatusAfterMajikanSave(
      updated.id_biodata,
      auditOpts,
    );
    if (sync.changed) updated.status_auto_terpilih = true;
  }

  if (table === "interview" && updated?.id_biodata) {
    await dedupeInterviewByBiodata(
      updated.id_biodata,
      updated[pk] ?? updated.id ?? id,
    );
  }
  if (table === "kettugas" && updated?.id_biodata) {
    await dedupeKettugasByBiodata(
      updated.id_biodata,
      updated[pk] ?? updated.id ?? id,
    );
  }
  if (table === "skillcondition" && updated?.id_biodata) {
    await dedupeSkillconditionByBiodata(
      updated.id_biodata,
      updated[pk] ?? updated.id ?? id,
    );
  }
  if (table === "request" && updated?.id_biodata) {
    await dedupeRequestByBiodata(
      updated.id_biodata,
      updated[pk] ?? updated.id ?? id,
    );
  }
  if (table === "vaksin" && updated?.id_biodata) {
    await dedupeVaksinByBiodata(
      updated.id_biodata,
      updated[pk] ?? updated.id ?? id,
    );
  }
  if (
    table === "personal" &&
    updated?.id_tki &&
    Number(updated.is_active) !== 0
  ) {
    await getIdTkiService().syncDatatkiFromActivePersonal(getDbApi(), updated);
  }

  return updated;
}

// Delete a row by id
async function remove(table, id, auditOpts = {}) {
  const pk = await resolveTablePkColumn(table);
  const oldRow =
    AUDIT_TABLES.has(table) && !auditOpts.skipAudit
      ? await getById(table, id)
      : null;
  const result = await q(
    db.prepare(`DELETE FROM "${table}" WHERE "${pk}" = ?`),
    "run",
    id,
  );

  if (
    result.changes > 0 &&
    oldRow &&
    AUDIT_TABLES.has(table) &&
    !auditOpts.skipAudit
  ) {
    await insertAuditLog(
      table,
      id,
      "delete",
      oldRow,
      null,
      auditOpts.userId || 1,
    );
  }

  return result.changes > 0;
}

/** Hapus biodata beserta semua baris terkait id_biodata */
async function removePersonalCascade(idBiodata, auditOpts = {}) {
  const id = String(idBiodata || "").trim();
  if (!id) return false;

  const personal = await getByField("personal", "id_biodata", id);
  if (!personal) return false;

  const skipAudit = { ...auditOpts, skipAudit: true };
  for (const table of getIdBiodataTables()) {
    const rows = await listByIdBiodata(table, id);
    for (const row of rows) {
      if (row?.id != null) {
        await remove(table, row.id, skipAudit);
      }
    }
  }

  return remove("personal", personal.id, auditOpts);
}

// Kanban: kelompokkan baris per kolom stage/status
async function listKanban(table, groupField, options = {}) {
  const { valueField = "value", columnKeys = [] } = options;
  const rows = normalizeRows(
    await q(db.prepare(`SELECT * FROM "${table}" ORDER BY id DESC`), "all"),
  );
  const data = {};
  const totals = {};

  columnKeys.forEach((key) => {
    data[key] = [];
    totals[key] = { count: 0, value: 0 };
  });

  const unassignedKey = "_unassigned";
  data[unassignedKey] = [];
  totals[unassignedKey] = { count: 0, value: 0 };

  rows.forEach((row) => {
    let key = row[groupField];
    if (!key || !columnKeys.includes(key)) {
      key = unassignedKey;
    }
    if (!data[key]) {
      data[key] = [];
      totals[key] = { count: 0, value: 0 };
    }
    data[key].push(row);
    totals[key].count += 1;
    totals[key].value += parseFloat(row[valueField]) || 0;
  });

  if (data[unassignedKey].length === 0) {
    delete data[unassignedKey];
    delete totals[unassignedKey];
  }

  return { data, totals };
}

// Update kolom pipeline (stage / status)
async function updatePipelineField(table, id, fieldName, value) {
  return update(table, id, { [fieldName]: value });
}

// Reorder: pastikan semua id ada di stage yang sama
async function reorderInStage(table, ids, stageField, stageValue) {
  if (!Array.isArray(ids) || !ids.length) return { success: true, updated: 0 };
  let updated = 0;
  const stmt = db.prepare(
    `UPDATE "${table}" SET "${stageField}" = ? WHERE id = ?`,
  );
  const tx = db.transaction(async (idList) => {
    for (const id of idList) {
      const r = await q(stmt, "run", stageValue, id);
      updated += r.changes;
    }
  });
  await tx(ids);
  return { success: true, updated };
}

// Timeline 360° — aktivitas + audit log per entitas
async function getEntityTimeline(entityType, entityId, limit = 40) {
  const items = [];
  const fkMap = {
    customers: "customer_id",
    leads: "lead_id",
    deals: "deal_id",
  };

  const fk = fkMap[entityType];
  if (fk) {
    try {
      const acts = await q(
        db.prepare(`
        SELECT * FROM activities WHERE "${fk}" = ? ORDER BY datetime(created_at) DESC LIMIT ?
      `),
        "all",
        entityId,
        limit,
      );
      acts.forEach((a) =>
        items.push({
          kind: "activity",
          date: a.created_at || a.due_date,
          title: a.title,
          subtitle: `${a.activity_type} · ${a.status}`,
          data: a,
        }),
      );
    } catch {
      /* ignore */
    }
  }

  if (entityType === "companies") {
    try {
      const acts = await q(
        db.prepare(`
        SELECT a.* FROM activities a
        INNER JOIN customers c ON c.id = a.customer_id
        WHERE c.company_id = ?
        ORDER BY datetime(a.created_at) DESC LIMIT ?
      `),
        "all",
        entityId,
        limit,
      );
      acts.forEach((a) =>
        items.push({
          kind: "activity",
          date: a.created_at,
          title: a.title,
          subtitle: `${a.activity_type} · ${a.status}`,
          data: a,
        }),
      );
    } catch {
      /* ignore */
    }
  }

  try {
    const logs = await q(
      db.prepare(`
      SELECT * FROM activity_logs
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY datetime(created_at) DESC LIMIT ?
    `),
      "all",
      entityType,
      entityId,
      limit,
    );
    logs.forEach((l) =>
      items.push({
        kind: "log",
        date: l.created_at,
        title: `Log: ${l.action}`,
        subtitle: l.entity_type,
        data: l,
      }),
    );
  } catch {
    /* ignore */
  }

  items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return items.slice(0, limit);
}

// Isi due_date untuk aktivitas lama yang belum punya jadwal
async function backfillActivityDueDates() {
  try {
    const schemas = loadSchemas();
    if (!schemas.activities) return;

    const nullDueSql = isPostgres()
      ? `SELECT id FROM activities WHERE due_date IS NULL`
      : `SELECT id FROM activities WHERE due_date IS NULL OR trim(due_date) = ''`;
    const rows = await q(db.prepare(nullDueSql), "all");
    if (!rows.length) return;
    const stmt = db.prepare("UPDATE activities SET due_date = ? WHERE id = ?");
    const base = new Date();
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const d = new Date(
        base.getFullYear(),
        base.getMonth(),
        1 + (i % 25),
        9 + (i % 8),
        0,
        0,
      );
      const iso = d.toISOString().slice(0, 19).replace("T", " ");
      await q(stmt, "run", iso, row.id);
    }
    console.log(`[DB] Backfilled due_date for ${rows.length} activities`);
  } catch (e) {
    console.warn("[DB] backfillActivityDueDates:", e.message);
  }
}

/** Isi kode_sponsor demo untuk TKI lama; migrasi kode_pl lama ke sponsor */
async function seedBiodataReadinessDemo() {
  try {
    if (!getTableNames().includes("personal")) return;
    const check = await getByField("personal", "id_biodata", "MLG-FF-0001");
    if (!check) return;
    if (hasMeaningfulValue(check.tinggi)) return; // already seeded

    // MLG-FF-0001 → SIAP_PENEMPATAN
    await q(
      db.prepare(
        `UPDATE personal SET tinggi=?,berat=?,pendidikan=?,mandarin=?,notelpkel=?,skill1=? WHERE id_biodata=?`,
      ),
      "run",
      "160",
      "52",
      "SMA",
      "Bisa",
      "085111111111",
      "Memasak",
      "MLG-FF-0001",
    );
    await q(
      db.prepare(`UPDATE dokumen SET si=? WHERE id_biodata=?`),
      "run",
      "surat_ijin_demo.jpg",
      "MLG-FF-0001",
    );
    const pengsFF1 = await listByIdBiodata("pengalaman", "MLG-FF-0001");
    if (!pengsFF1.length) {
      await q(
        db.prepare(
          `INSERT INTO pengalaman (id_biodata, negara, lamakerja) VALUES (?,?,?)`,
        ),
        "run",
        "MLG-FF-0001",
        "Taiwan",
        "2 Tahun",
      );
    }

    // MLG-FF-0002 → SIAP_MARKETING
    const famFF2 = await getByField("family", "id_biodata", "MLG-FF-0002");
    if (!famFF2) {
      await q(
        db.prepare(
          `INSERT INTO family (id_biodata, nama_bapak, nama_ibu) VALUES (?,?,?)`,
        ),
        "run",
        "MLG-FF-0002",
        "Hasan",
        "Aminah",
      );
    }
    await q(
      db.prepare(
        `UPDATE personal SET notelpkel=?,pendidikan=? WHERE id_biodata=?`,
      ),
      "run",
      "085222222222",
      "SMP",
      "MLG-FF-0002",
    );
    const dokFF2 = await getByField("dokumen", "id_biodata", "MLG-FF-0002");
    if (dokFF2) {
      await q(
        db.prepare(`UPDATE dokumen SET ktp=?,kk=? WHERE id_biodata=?`),
        "run",
        "ktp_demo.jpg",
        "kk_demo.jpg",
        "MLG-FF-0002",
      );
    } else {
      await q(
        db.prepare(`INSERT INTO dokumen (id_biodata, ktp, kk) VALUES (?,?,?)`),
        "run",
        "MLG-FF-0002",
        "ktp_demo.jpg",
        "kk_demo.jpg",
      );
    }

    // MLG-FI-0001 → PERLU_REVISI (kawin tanpa surat nikah)
    await q(
      db.prepare(`UPDATE personal SET status=? WHERE id_biodata=?`),
      "run",
      "KAWIN",
      "MLG-FI-0001",
    );

    // SBY-FF-0001 → SIAP_ADMIN
    await q(
      db.prepare(
        `UPDATE personal SET notelpkel=?,pendidikan=? WHERE id_biodata=?`,
      ),
      "run",
      "085444444444",
      "SMA",
      "SBY-FF-0001",
    );
    await q(
      db.prepare(`UPDATE dokumen SET si=? WHERE id_biodata=?`),
      "run",
      "surat_ijin_demo.jpg",
      "SBY-FF-0001",
    );

    // MLG-FF-0003, MLG-JP-0001, MLG-MI-0001 → REVIEW_BIODATA (no extra data needed)

    console.log(
      "[DB] Seeded readiness demo: MLG-FF-0001=SIAP_PENEMPATAN, MLG-FF-0002=SIAP_MARKETING, MLG-FI-0001=PERLU_REVISI, SBY-FF-0001=SIAP_ADMIN, others=REVIEW_BIODATA",
    );
  } catch (e) {
    console.warn("[DB] seedBiodataReadinessDemo:", e.message);
  }
}

async function backfillPersonalDemoSponsor() {
  const tables = getTableNames();
  if (!tables.includes("personal") || !tables.includes("datasponsor")) return;
  try {
    if (tables.includes("datapl")) {
      await q(
        db.prepare(`UPDATE personal SET kode_sponsor = CASE
          WHEN TRIM(kode_pl) = 'PL01' THEN 'SP02'
          WHEN TRIM(kode_pl) = 'PL02' THEN 'SP03'
          ELSE kode_sponsor END
          WHERE (kode_sponsor IS NULL OR TRIM(kode_sponsor) = '')
            AND kode_pl IS NOT NULL AND TRIM(kode_pl) != ''`),
        "run",
      );
    }
    const demoMap = {
      "FF-0001": "SP02",
      "FF-0002": "SP03",
      "FI-0001": "SP02",
      "MF-0001": "SP03",
      "JP-0001": "SP02",
      "IM-0001": "SP02",
      "IM-0005": "SP03",
    };
    const emptyClause = `(kode_sponsor IS NULL OR TRIM(kode_sponsor) = '')`;
    let updated = 0;
    for (const [idBiodata, kodeSponsor] of Object.entries(demoMap)) {
      const res = await q(
        db.prepare(
          `UPDATE personal SET kode_sponsor = ? WHERE id_biodata = ? AND ${emptyClause}`,
        ),
        "run",
        kodeSponsor,
        idBiodata,
      );
      updated += Number(res?.changes || res?.rowCount || 0);
    }
    const fallback = await q(
      db.prepare(
        `UPDATE personal SET kode_sponsor = 'SP02' WHERE ${emptyClause}`,
      ),
      "run",
    );
    updated += Number(fallback?.changes || fallback?.rowCount || 0);
    if (updated > 0) {
      console.log(
        `[DB] Backfilled kode_sponsor for ${updated} personal record(s)`,
      );
    }
  } catch (e) {
    console.warn("[DB] backfillPersonalDemoSponsor:", e.message);
  }
}

/** Master demo: kategori, jenis pekerjaan, dan detail pekerjaan (idempotent by isi/kode) */
async function seedMasterPekerjaanDemo() {
  const tables = getTableNames();
  if (
    !tables.includes("kategoripekerjaan") ||
    !tables.includes("datapekerjaan") ||
    !tables.includes("kriteria_pekerjaan")
  ) {
    return;
  }

  const ensureKategori = async (isi, mandarin) => {
    const key = String(isi || "").trim();
    if (!key) return null;
    const existing = await q(
      db.prepare(`SELECT id FROM kategoripekerjaan WHERE isi = ? LIMIT 1`),
      "get",
      key,
    );
    if (existing?.id != null) return existing.id;
    const res = await q(
      db.prepare(`INSERT INTO kategoripekerjaan (isi, mandarin) VALUES (?, ?)`),
      "run",
      key,
      mandarin || null,
    );
    return res.lastInsertRowid;
  };

  const ensurePekerjaan = async (idKategori, isi, mandarin) => {
    const key = String(isi || "").trim();
    if (!key) return null;
    const existing = await q(
      db.prepare(`SELECT id FROM datapekerjaan WHERE isi = ? LIMIT 1`),
      "get",
      key,
    );
    if (existing?.id != null) return existing.id;
    const res = await q(
      db.prepare(
        `INSERT INTO datapekerjaan (id_kategori, isi, mandarin) VALUES (?, ?, ?)`,
      ),
      "run",
      idKategori,
      key,
      mandarin || null,
    );
    return res.lastInsertRowid;
  };

  const ensureKriteria = async (kode, nama, mandarin, idPekerjaan) => {
    const code = String(kode || "").trim();
    if (!code || idPekerjaan == null) return;
    const existing = await q(
      db.prepare(
        `SELECT id, id_pekerjaan FROM kriteria_pekerjaan WHERE kode = ? LIMIT 1`,
      ),
      "get",
      code,
    );
    if (existing?.id != null) {
      if (existing.id_pekerjaan == null) {
        await q(
          db.prepare(
            `UPDATE kriteria_pekerjaan SET id_pekerjaan = ? WHERE id = ?`,
          ),
          "run",
          idPekerjaan,
          existing.id,
        );
      }
      return;
    }
    await q(
      db.prepare(
        `INSERT INTO kriteria_pekerjaan (kode, nama, mandarin, id_pekerjaan) VALUES (?, ?, ?, ?)`,
      ),
      "run",
      code,
      nama,
      mandarin || null,
      idPekerjaan,
    );
  };

  try {
    const katPerawatan = await ensureKategori("Perawatan", "護理");
    const katRumahTangga = await ensureKategori("Rumah Tangga", "家務");
    const katIndustri = await ensureKategori("Industri", "工業");

    const pekerjaanDemo = [
      {
        kat: katPerawatan,
        isi: "Caregiver",
        mandarin: "護工",
        kriteria: [
          ["KP001", "Merawat lansia", "照顧老人"],
          ["KP002", "Memasak", "煮飯"],
          ["KP003", "Membersihkan rumah", "打掃"],
          ["KP004", "Mengurus anak", "照顧小孩"],
          ["KP005", "Menemani jalan-jalan", "陪同外出"],
          ["CG006", "Membantu mobilitas lansia", "協助行動"],
          ["CG007", "Memberikan obat tepat waktu", "給藥提醒"],
          ["CG008", "Menemani kontrol dokter", "陪同就醫"],
        ],
      },
      {
        kat: katPerawatan,
        isi: "Pengasuh Anak",
        mandarin: "保母",
        kriteria: [
          ["PA001", "Mengurus bayi", "照顧嬰兒"],
          ["PA002", "Mengurus anak balita", "照顧幼兒"],
          ["PA003", "Mengantar-jemput sekolah", "接送上下學"],
          ["PA004", "Membantu PR sekolah", "陪讀作業"],
          ["PA005", "Menyiapkan makanan anak", "準備兒童餐"],
        ],
      },
      {
        kat: katRumahTangga,
        isi: "Asisten Rumah Tangga",
        mandarin: "家事幫傭",
        kriteria: [
          ["RT001", "Membersihkan rumah", "打掃"],
          ["RT002", "Memasak sehari-hari", "日常煮飯"],
          ["RT003", "Mencuci dan setrika", "洗衣燙衣"],
          ["RT004", "Belanja kebutuhan rumah", "採買"],
          ["RT005", "Merawat hewan peliharaan", "照顧寵物"],
        ],
      },
      {
        kat: katIndustri,
        isi: "Pekerja Pabrik",
        mandarin: "工廠工人",
        kriteria: [
          ["PP001", "Operator mesin", "機台操作"],
          ["PP002", "Packing barang", "包裝"],
          ["PP003", "Quality control", "品檢"],
          ["PP004", "Assembly line", "組裝線"],
          ["PP005", "Kebersihan area kerja", "清潔工作區"],
        ],
      },
      {
        kat: katRumahTangga,
        isi: "Asisten Dapur",
        mandarin: "廚房助理",
        kriteria: [
          ["AD001", "Memasak menu Taiwan", "台灣料理"],
          ["AD002", "Memasak menu Indonesia", "印尼料理"],
          ["AD003", "Menyiapkan bahan masak", "備料"],
          ["AD004", "Membersihkan dapur", "清潔廚房"],
        ],
      },
      {
        kat: katPerawatan,
        isi: "Perawat Lansia di Rumah",
        mandarin: "居家照護",
        kriteria: [
          ["PL001", "Perawatan luka ringan", "簡易傷口護理"],
          ["PL002", "Pantau tanda vital", "量測生命徵象"],
          ["PL003", "Latihan rehabilitasi ringan", "復健協助"],
          ["PL004", "Pendampingan harian lansia", "日常陪伴"],
        ],
      },
    ];

    let pekerjaanAdded = 0;
    let kriteriaAdded = 0;
    for (const item of pekerjaanDemo) {
      if (item.kat == null) continue;
      const beforeP = await q(
        db.prepare(`SELECT id FROM datapekerjaan WHERE isi = ? LIMIT 1`),
        "get",
        item.isi,
      );
      const pid = await ensurePekerjaan(item.kat, item.isi, item.mandarin);
      if (pid != null && !beforeP?.id) pekerjaanAdded += 1;
      for (const [kode, nama, mandarin] of item.kriteria) {
        const beforeK = await q(
          db.prepare(
            `SELECT id FROM kriteria_pekerjaan WHERE kode = ? LIMIT 1`,
          ),
          "get",
          kode,
        );
        await ensureKriteria(kode, nama, mandarin, pid);
        if (!beforeK?.id) kriteriaAdded += 1;
      }
    }

    if (pekerjaanAdded > 0 || kriteriaAdded > 0) {
      console.log(
        `[DB] Master pekerjaan demo: +${pekerjaanAdded} jenis, +${kriteriaAdded} detail`,
      );
    }
  } catch (e) {
    console.warn("[DB] seedMasterPekerjaanDemo:", e.message);
  }
}

/** Isi id_pekerjaan pada master kriteria lama (relasi ke datapekerjaan) */
async function backfillKriteriaPekerjaanId() {
  const tables = getTableNames();
  if (
    !tables.includes("kriteria_pekerjaan") ||
    !tables.includes("datapekerjaan")
  )
    return;
  try {
    const caregiver = await q(
      db.prepare(
        `SELECT id FROM datapekerjaan WHERE isi = 'Caregiver' LIMIT 1`,
      ),
      "get",
    );
    const fallback =
      caregiver ||
      (await q(
        db.prepare(`SELECT id FROM datapekerjaan ORDER BY id LIMIT 1`),
        "get",
      ));
    if (!fallback?.id) return;
    const res = await q(
      db.prepare(
        `UPDATE kriteria_pekerjaan SET id_pekerjaan = ? WHERE id_pekerjaan IS NULL`,
      ),
      "run",
      fallback.id,
    );
    const n = Number(res?.changes || res?.rowCount || 0);
    if (n > 0) {
      console.log(
        `[DB] Backfilled id_pekerjaan for ${n} kriteria_pekerjaan row(s)`,
      );
    }
  } catch (e) {
    console.warn("[DB] backfillKriteriaPekerjaanId:", e.message);
  }
}

// Kalender aktivitas per bulan (due_date, fallback created_at)
async function getCalendarEvents(year, month) {
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  try {
    const calendarSql = isPostgres()
      ? `
      SELECT id, activity_code, title, activity_type, status, priority, due_date, created_at
      FROM activities
      WHERE to_char(COALESCE(due_date, created_at), 'YYYY-MM') = ?
      ORDER BY COALESCE(due_date, created_at) ASC
    `
      : `
      SELECT id, activity_code, title, activity_type, status, priority, due_date, created_at
      FROM activities
      WHERE substr(COALESCE(NULLIF(trim(due_date), ''), created_at), 1, 7) = ?
      ORDER BY COALESCE(NULLIF(trim(due_date), ''), created_at) ASC
    `;
    return normalizeRows(await q(db.prepare(calendarSql), "all", ym));
  } catch {
    return [];
  }
}

async function dbScalar(sql, field, ...params) {
  const row = await q(db.prepare(sql), "get", ...params);
  if (!row || row[field] == null) return 0;
  return Number(row[field]);
}

async function dbAllRows(sql, ...params) {
  return normalizeRows(await q(db.prepare(sql), "all", ...params));
}

// Laporan penjualan ringkas (KPI + agregasi untuk UI report CRM)
async function getSalesReport() {
  const report = {
    pipelineByStage: [],
    leadsBySource: [],
    quotesByStatus: [],
    topDeals: [],
    revenueWon: 0,
    revenueOpen: 0,
    weightedPipeline: 0,
    dealsWon: 0,
    dealsLost: 0,
    dealsOpen: 0,
    winRate: 0,
    avgDealSize: 0,
    totalLeads: 0,
    leadsConverted: 0,
    leadConversionRate: 0,
    totalQuotes: 0,
    quotesValue: 0,
    generatedAt: new Date().toISOString(),
  };

  try {
    report.pipelineByStage = await dbAllRows(`
      SELECT stage, COUNT(*) as count, COALESCE(SUM(value), 0) as total
      FROM deals GROUP BY stage ORDER BY total DESC
    `);
  } catch {
    /* ignore */
  }

  try {
    report.leadsBySource = await dbAllRows(`
      SELECT COALESCE(NULLIF(trim(source), ''), 'Tidak diketahui') as source, COUNT(*) as count
      FROM leads GROUP BY source ORDER BY count DESC LIMIT 8
    `);
  } catch {
    /* ignore */
  }

  try {
    report.quotesByStatus = await dbAllRows(`
      SELECT status, COUNT(*) as count, COALESCE(SUM(total), 0) as total
      FROM quotes GROUP BY status ORDER BY total DESC
    `);
    report.totalQuotes = await dbScalar(
      "SELECT COUNT(*) as c FROM quotes",
      "c",
    );
    report.quotesValue = await dbScalar(
      "SELECT COALESCE(SUM(total), 0) as t FROM quotes",
      "t",
    );
  } catch {
    /* ignore */
  }

  try {
    report.topDeals = await dbAllRows(`
      SELECT deal_code, title, value, stage, customer_name, probability
      FROM deals ORDER BY value DESC LIMIT 10
    `);
    report.revenueWon = await dbScalar(
      `SELECT COALESCE(SUM(value), 0) as t FROM deals WHERE stage = 'closed_won'`,
      "t",
    );
    report.revenueOpen = await dbScalar(
      `
      SELECT COALESCE(SUM(value), 0) as t FROM deals
      WHERE stage NOT IN ('closed_won', 'closed_lost')
    `,
      "t",
    );
    report.dealsWon = await dbScalar(
      `SELECT COUNT(*) as c FROM deals WHERE stage = 'closed_won'`,
      "c",
    );
    report.dealsLost = await dbScalar(
      `SELECT COUNT(*) as c FROM deals WHERE stage = 'closed_lost'`,
      "c",
    );
    report.dealsOpen = await dbScalar(
      `
      SELECT COUNT(*) as c FROM deals WHERE stage NOT IN ('closed_won', 'closed_lost')
    `,
      "c",
    );
    const closed = report.dealsWon + report.dealsLost;
    report.winRate =
      closed > 0 ? Math.round((report.dealsWon / closed) * 100) : 0;
    report.avgDealSize = await dbScalar(
      "SELECT COALESCE(AVG(value), 0) as a FROM deals WHERE value > 0",
      "a",
    );
    report.weightedPipeline = await dbScalar(
      `
      SELECT COALESCE(SUM(value * COALESCE(probability, 10) / 100.0), 0) as w
      FROM deals WHERE stage NOT IN ('closed_won', 'closed_lost')
    `,
      "w",
    );
  } catch {
    /* ignore */
  }

  try {
    report.totalLeads = await dbScalar("SELECT COUNT(*) as c FROM leads", "c");
    report.leadsConverted = await dbScalar(
      "SELECT COUNT(*) as c FROM leads WHERE is_converted = 1",
      "c",
    );
    report.leadConversionRate =
      report.totalLeads > 0
        ? Math.round((report.leadsConverted / report.totalLeads) * 100)
        : 0;
  } catch {
    /* ignore */
  }

  return report;
}

// Export CSV sederhana
async function exportTableCsv(table, options = {}) {
  const schema = getSchema(table);
  const searchFields = schema
    ? schema.fields
        .filter((f) => ["text", "email", "textarea", "number"].includes(f.type))
        .map((f) => f.name)
    : [];

  const result = await list(table, {
    page: 1,
    perPage: 10000,
    search: options.search || "",
    searchFields,
    sort: options.sort || "",
    order: options.order || "asc",
  });

  if (!result.data.length) return "";

  const cols = Object.keys(result.data[0]);
  const escape = (v) => {
    const s = v == null ? "" : String(v).replace(/"/g, '""');
    return `"${s}"`;
  };

  const lines = [cols.join(",")];
  result.data.forEach((row) => {
    lines.push(cols.map((c) => escape(row[c])).join(","));
  });
  return lines.join("\n");
}

// Aktivitas terbaru untuk dashboard
async function getRecentActivities(limit = 8) {
  try {
    return await dbAllRows(
      `
      SELECT id, activity_code, title, activity_type, status, priority, due_date, created_at
      FROM activities
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ?
    `,
      limit,
    );
  } catch {
    return [];
  }
}

// Konversi lead → customer (+ deal opsional)
async function convertLead(leadId, options = {}) {
  const lead = await getById("leads", leadId);
  if (!lead) return null;
  if (lead.is_converted) {
    throw new Error("Lead sudah dikonversi sebelumnya");
  }

  const createDeal = options.createDeal !== false;
  const txn = db.transaction(async () => {
    const codeSuffix = String(leadId).padStart(3, "0");
    const customer = await create("customers", {
      customer_code: `CU-LD-${codeSuffix}`,
      first_name: lead.first_name,
      last_name: lead.last_name,
      email: lead.email || "",
      phone: lead.phone || "",
      position: lead.position || "",
      status: "active",
      source: lead.source || "lead_conversion",
      notes: lead.notes || "",
      assigned_to: lead.assigned_to || 1,
      created_by: lead.created_by || 1,
    });

    let deal = null;
    if (createDeal && Number(lead.estimated_value) > 0) {
      deal = await create("deals", {
        deal_code: `DL-LD-${codeSuffix}`,
        title: `Deal — ${lead.full_name || `${lead.first_name} ${lead.last_name}`}`,
        customer_id: customer.id,
        customer_name:
          lead.full_name || `${lead.first_name} ${lead.last_name}`.trim(),
        value: lead.estimated_value,
        stage: "prospecting",
        priority: lead.priority || "medium",
        currency: lead.currency || "$",
        status: "open",
        probability: 30,
        assigned_to: lead.assigned_to || 1,
      });
    }

    await update(
      "leads",
      leadId,
      {
        is_converted: 1,
        status: "won",
        converted_to_customer_id: customer.id,
        converted_to_deal_id: deal ? deal.id : null,
        converted_at: new Date().toISOString(),
      },
      { skipAudit: true },
    );

    await create("activities", {
      activity_code: `ACT-CV-${Date.now()}`,
      title: `Lead dikonversi: ${lead.lead_code}`,
      activity_type: "note",
      status: "completed",
      priority: "medium",
      customer_id: customer.id,
      lead_id: leadId,
      deal_id: deal ? deal.id : null,
      assigned_to: lead.assigned_to || 1,
      description: `Konversi otomatis dari lead ${lead.lead_code}`,
    });

    return {
      customer: await getById("customers", customer.id),
      deal: deal ? await getById("deals", deal.id) : null,
      lead: await getById("leads", leadId),
    };
  });

  return txn();
}

// Ringkasan statistik dashboard starter
async function getDashboardStats(kodeCabang = null) {
  const branch = kodeCabang ? String(kodeCabang).trim() : "";
  if (branch && !/^[A-Za-z0-9_-]+$/.test(branch)) {
    throw new Error("Kode cabang tidak valid");
  }

  const countTable = async (table) => {
    try {
      if (!getTableNames().includes(table)) return 0;
      return await dbScalar(`SELECT COUNT(*) as c FROM "${table}"`, "c");
    } catch {
      return 0;
    }
  };

  const schemaDir = path.join(__dirname, "schema");
  let resources = 0;
  try {
    resources = fs
      .readdirSync(schemaDir)
      .filter((f) => f.endsWith(".json")).length;
  } catch {
    resources = 0;
  }

  return {
    users: await countTable("users"),
    branches: await countTable("datacabang"),
    categories: await countTable("categories"),
    resources,
    kode_cabang: branch || null,
  };
}

/** Notifikasi operasional untuk navbar (ringkasan alert TKI per cabang) */
async function createAppNotification(row = {}) {
  const payload = {
    kode_cabang: String(row.kode_cabang || "").trim(),
    type: ["info", "warning", "success"].includes(row.type) ? row.type : "info",
    title: String(row.title || "")
      .trim()
      .slice(0, 160),
    message: String(row.message || "")
      .trim()
      .slice(0, 600),
    link: String(row.link || "")
      .trim()
      .slice(0, 255),
    ref_type: String(row.ref_type || "")
      .trim()
      .slice(0, 64),
    ref_id: String(row.ref_id || "")
      .trim()
      .slice(0, 64),
    created_by: String(row.created_by || "")
      .trim()
      .slice(0, 120),
  };
  if (!payload.title) {
    throw new Error("Judul notifikasi wajib");
  }
  return create("app_notifications", payload);
}

async function listAppNotifications(kodeCabang = null, limit = 15) {
  const max = Math.min(Math.max(Number(limit) || 15, 1), 30);
  const branch = kodeCabang ? String(kodeCabang).trim() : "";
  if (branch && !/^[A-Za-z0-9_-]+$/.test(branch)) {
    throw new Error("Kode cabang tidak valid");
  }
  const filters = {};
  if (branch) filters.kode_cabang = branch;
  const result = await list("app_notifications", {
    page: 1,
    perPage: max,
    sort: "id",
    order: "desc",
    filters,
  });
  return (result.data || []).map((row) => ({
    id: `app-${row.id}`,
    type: row.type || "info",
    title: row.title || "Notifikasi",
    message: row.message || "",
    link: row.link || "",
    createdAt: row.created_at || row.updated_at || new Date().toISOString(),
  }));
}

async function getUserNotifications(kodeCabang = null, limit = 15) {
  const max = Math.min(Math.max(Number(limit) || 15, 1), 30);
  try {
    return await listAppNotifications(kodeCabang, max);
  } catch {
    return [];
  }
}

// Kolom file di tabel dokumen (identitas — satu baris per TKI)
const DOKUMEN_IDENTITAS_FIELDS = [
  "ktp",
  "kk",
  "akte",
  "ijazah",
  "si",
  "sn",
  "paspor",
  "arc",
  "asuransi",
  "medikal1",
  "medikal2",
  "medikal3",
  "skck",
  "fingerprint",
  "visa",
  "pap",
];

async function updateDokumenIdentitasFile(idBiodata, fieldName, filePath) {
  const id = String(idBiodata || "").trim();
  const field = String(fieldName || "").trim();
  if (!id) throw new Error("id_biodata wajib");
  if (!DOKUMEN_IDENTITAS_FIELDS.includes(field)) {
    throw new Error(`Kolom dokumen "${field}" tidak valid`);
  }

  let row = await getByField("dokumen", "id_biodata", id);
  if (!row) {
    const payload = { id_biodata: id };
    payload[field] = filePath;
    return create("dokumen", payload);
  }
  return update("dokumen", row.id, { [field]: filePath });
}

/** Placeholder seed — bukan file upload sungguhan */
function isPlaceholderDokumenPath(val) {
  if (!val || String(val).trim() === "") return true;
  const base = String(val).split("/").pop().toLowerCase();
  return base === "profile.jpg" || base === "profile.png";
}

/**
 * Tab Dokumen membaca kolom dokumen.* — sinkronkan KTP dari upload_ktp jika masih placeholder,
 * dan normalisasi path /data/uploads/ → /uploads/ agar bisa dilayani serveUploadedFile.
 */
async function enrichDokumenForBiodataDetail(idBiodata, dokumenRow) {
  const { normalizePublicUploadPath } = require("./upload-service");
  const id = String(idBiodata || "").trim();
  if (!id) return dokumenRow;

  let row = dokumenRow ? { ...dokumenRow } : null;

  if (isPlaceholderDokumenPath(row?.ktp)) {
    let rows = [];
    try {
      rows = await listByIdBiodata("upload_ktp", id);
    } catch {
      rows = [];
    }
    const latest = rows.find((r) => r.file && String(r.file).trim());
    if (latest) {
      const norm = normalizePublicUploadPath(latest.file);
      if (latest.id && String(latest.file || "").trim() !== norm) {
        try {
          await update("upload_ktp", latest.id, { file: norm });
        } catch (_) {
          /* abaikan */
        }
      }
      try {
        await updateDokumenIdentitasFile(id, "ktp", norm);
        row = await getByField("dokumen", "id_biodata", id);
      } catch (e) {
        console.warn("[DB] sync dokumen.ktp dari upload_ktp:", e.message);
        row = row || { id_biodata: id };
        row.ktp = norm;
      }
    }
  }

  if (!row) return null;
  const out = { ...row };
  for (const field of DOKUMEN_IDENTITAS_FIELDS) {
    if (out[field]) out[field] = normalizePublicUploadPath(out[field]);
  }
  return out;
}

async function clearDokumenIdentitasFile(idBiodata, fieldName) {
  return updateDokumenIdentitasFile(idBiodata, fieldName, "");
}

async function updatePersonalFoto(idBiodata, filePath) {
  const id = String(idBiodata || "").trim();
  if (!id) throw new Error("id_biodata wajib");
  const row = await getByField("personal", "id_biodata", id);
  if (!row) throw new Error("Biodata tidak ditemukan");
  return update("personal", row.id, { foto: filePath || "" });
}

// Ringkasan upload per jenis (Fase 1 — satu layanan)
async function getUploadSummaryForBiodata(idBiodata) {
  const id = String(idBiodata || "").trim();
  if (!id) return [];

  const tableNames = getTableNames();
  const tasks = ALL_TYPES.map(async (t) => {
    const type = t.type;
    if (!tableNames.includes(type)) {
      return { type, label: t.label, count: 0, hasFile: false };
    }
    try {
      const row = await q(
        db.prepare(
          `SELECT COUNT(*) as c,
            COUNT(CASE WHEN file IS NOT NULL AND TRIM(file) != '' THEN 1 END) as fc
           FROM "${type}" WHERE id_biodata = ?`,
        ),
        "get",
        id,
      );
      return {
        type,
        label: t.label,
        count: Number(row?.c) || 0,
        hasFile: Number(row?.fc) > 0,
      };
    } catch {
      return { type, label: t.label, count: 0, hasFile: false };
    }
  });

  return Promise.all(tasks);
}

const BIODATA_WORKFLOW_STATUSES = [
  "DRAFT",
  "REVIEW_BIODATA",
  "PERLU_REVISI",
  "SIAP_MARKETING",
  "SIAP_ADMIN",
  "SIAP_PENEMPATAN",
];
const BIODATA_WORKFLOW_ROLE_ALLOWED = {
  DRAFT: ["bagian_bio", "admin", "super_admin"],
  REVIEW_BIODATA: ["bagian_bio", "admin", "super_admin"],
  PERLU_REVISI: ["admin", "super_admin"],
  SIAP_MARKETING: ["admin", "super_admin"],
  SIAP_ADMIN: ["admin", "super_admin"],
  SIAP_PENEMPATAN: ["admin", "super_admin"],
};

async function setBiodataWorkflowStatus(idBiodata, newStatus, opts = {}) {
  const id = String(idBiodata || "").trim();
  if (!id) throw new Error("id_biodata wajib");

  const status = String(newStatus || "")
    .trim()
    .toUpperCase();
  if (!BIODATA_WORKFLOW_STATUSES.includes(status))
    throw new Error(`Status biodata tidak valid: ${status}`);

  const { role = "", changedBy = "", userId = null, note = "" } = opts;
  const normalizedRole = String(role || "").toLowerCase();
  const allowed = BIODATA_WORKFLOW_ROLE_ALLOWED[status] || [];
  if (!allowed.includes(normalizedRole))
    throw new Error(
      `Role '${normalizedRole}' tidak diizinkan mengubah status biodata ke '${status}'`,
    );

  const resolvedId = await resolveBiodataInputId(id);
  if (!resolvedId) throw new Error("Biodata tidak ditemukan");

  const row = await getByField("personal", "id_biodata", resolvedId);
  if (!row) throw new Error("Biodata tidak ditemukan");

  const now = new Date().toISOString();
  const patch = { biodata_status: status };
  if (note) patch.biodata_review_note = String(note).slice(0, 500);
  if (["SIAP_MARKETING", "SIAP_ADMIN", "SIAP_PENEMPATAN"].includes(status)) {
    patch.biodata_verified_at = now;
    patch.biodata_verified_by = String(changedBy || "").slice(0, 100);
  }

  await update("personal", row.id, patch, { changedBy, userId });

  // Sync datatki mirror
  const fresh = await getByField("personal", "id_biodata", resolvedId);
  if (fresh?.id_tki) {
    try {
      await getIdTkiService().upsertDatatkiFromPersonal(getDbApi(), fresh);
    } catch (e) {
      console.warn("[DB] setBiodataWorkflowStatus datatki sync:", e.message);
    }
  }

  console.log(
    `[DB] setBiodataWorkflowStatus: ${resolvedId} \u2192 ${status} by ${changedBy}`,
  );
  return { id_biodata: resolvedId, biodata_status: status };
}

function hasMeaningfulValue(value) {
  if (value == null) return false;
  const s = String(value).trim();
  return (
    s !== "" &&
    s !== "0" &&
    s.toLowerCase() !== "null" &&
    s.toLowerCase() !== "undefined"
  );
}

function buildUploadSummaryMap(uploadSummary) {
  const map = new Map();
  (uploadSummary || []).forEach((row) => {
    map.set(String(row.type || "").trim(), row || {});
  });
  return map;
}

function hasUploadFile(uploadMap, type) {
  const row = uploadMap?.get(String(type || "").trim());
  return Boolean(row?.hasFile || Number(row?.count) > 0);
}

function calcAgeYears(dateValue) {
  const s = String(dateValue || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const birth = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age >= 0 ? age : null;
}

function normalizeKeluargaStatus(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isMarriedStatus(value) {
  const s = normalizeKeluargaStatus(value);
  if (!s) return false;
  if (s.includes("BELUM")) return false;
  if (s.includes("TIDAK")) return false;
  return s.includes("KAWIN") || s.includes("MENIKAH") || s.includes("NIKAH");
}

async function getBiodataReadinessSummary(idBiodata, context = {}) {
  const id = String(idBiodata || "").trim();
  if (!id) return null;

  const personal =
    context.personal || (await getByField("personal", "id_biodata", id));
  if (!personal) return null;

  const family =
    context.family !== undefined
      ? context.family
      : await getByField("family", "id_biodata", id);
  const dokumen =
    context.dokumen !== undefined
      ? context.dokumen
      : await enrichDokumenForBiodataDetail(
          id,
          await getByField("dokumen", "id_biodata", id),
        );
  const uploadSummary =
    context.uploadSummary || (await getUploadSummaryForBiodata(id));
  const uploadMap = buildUploadSummaryMap(uploadSummary);
  const pengalaman = Array.isArray(context.pengalaman)
    ? context.pengalaman
    : await listByIdBiodata("pengalaman", id);
  const working = Array.isArray(context.working)
    ? context.working
    : await listByIdBiodata("working", id);

  const married = isMarriedStatus(personal.status);
  const hasFamilyBase = Boolean(
    family &&
    (hasMeaningfulValue(family.nama_bapak) ||
      hasMeaningfulValue(family.nama_ibu) ||
      hasMeaningfulValue(family.nama_istri_suami) ||
      hasMeaningfulValue(family.data_anak)),
  );
  const hasEmergencyContact =
    hasMeaningfulValue(personal.notelpkel) ||
    hasMeaningfulValue(personal.hpkel);
  const hasKtp =
    hasMeaningfulValue(dokumen?.ktp) || hasUploadFile(uploadMap, "upload_ktp");
  const hasKk =
    hasMeaningfulValue(dokumen?.kk) || hasUploadFile(uploadMap, "upload_kk");
  const hasIjazah =
    hasMeaningfulValue(dokumen?.ijazah) ||
    hasUploadFile(uploadMap, "upload_ijasah");
  const hasSuratIjin =
    hasMeaningfulValue(dokumen?.si) ||
    hasUploadFile(uploadMap, "upload_suratijinkeluarga");
  const hasSuratNikah =
    hasMeaningfulValue(dokumen?.sn) ||
    hasUploadFile(uploadMap, "upload_suratnikah");
  const hasArc =
    hasMeaningfulValue(dokumen?.arc) || hasUploadFile(uploadMap, "upload_arc");
  const hasPaspor =
    hasMeaningfulValue(dokumen?.paspor) ||
    hasUploadFile(uploadMap, "upload_pasporbaru");
  const hasEducation =
    hasMeaningfulValue(personal.pendidikan) ||
    hasMeaningfulValue(personal.statuspendidikan);
  const hasPhysical =
    hasMeaningfulValue(personal.tinggi) && hasMeaningfulValue(personal.berat);
  const hasLanguage =
    hasMeaningfulValue(personal.mandarin) ||
    hasMeaningfulValue(personal.taiyu) ||
    hasMeaningfulValue(personal.inggris) ||
    hasMeaningfulValue(personal.cantonese) ||
    hasMeaningfulValue(personal.hakka);
  const hasSkill =
    hasMeaningfulValue(personal.skill1) ||
    hasMeaningfulValue(personal.skill2) ||
    hasMeaningfulValue(personal.skill3);
  const hasExperience = Boolean(
    (pengalaman || []).length || (working || []).length,
  );

  const identitasItems = [
    {
      key: "nama",
      label: "Nama lengkap",
      ok: hasMeaningfulValue(personal.nama),
    },
    {
      key: "nik",
      label: "NIK valid",
      ok: /^\d{16}$/.test(String(personal.nik || "").trim()),
    },
    {
      key: "jk",
      label: "Jenis kelamin",
      ok: hasMeaningfulValue(personal.jeniskelamin),
    },
    {
      key: "sponsor",
      label: "Sponsor",
      ok: hasMeaningfulValue(personal.kode_sponsor),
    },
    {
      key: "tgl_daftar",
      label: "Tanggal daftar",
      ok: hasMeaningfulValue(personal.tanggaldaftar),
    },
    {
      key: "negara",
      label: "Negara tujuan",
      ok: hasMeaningfulValue(personal.negara1),
    },
  ];
  const keluargaItems = [
    { key: "family", label: "Keluarga inti", ok: hasFamilyBase },
    { key: "emergency", label: "Kontak keluarga", ok: hasEmergencyContact },
  ];
  const dokumenItems = [
    { key: "ktp", label: "KTP", ok: hasKtp },
    { key: "kk", label: "KK", ok: hasKk },
    { key: "ijazah", label: "Ijazah", ok: hasIjazah },
    { key: "surat_ijin", label: "Surat ijin keluarga", ok: hasSuratIjin },
    {
      key: "surat_nikah",
      label: "Surat nikah",
      ok: married ? hasSuratNikah : true,
    },
    { key: "paspor_arc", label: "Paspor / ARC", ok: hasPaspor || hasArc },
  ];
  const profilItems = [
    { key: "fisik", label: "Tinggi & berat", ok: hasPhysical },
    { key: "pendidikan", label: "Pendidikan", ok: hasEducation },
    { key: "bahasa", label: "Bahasa", ok: hasLanguage },
    { key: "skill", label: "Skill inti", ok: hasSkill || hasExperience },
    { key: "pengalaman", label: "Pengalaman kerja", ok: hasExperience },
  ];

  const warnings = [];
  if (married && !hasSuratNikah)
    warnings.push("Status kawin terisi, tetapi surat nikah belum tersedia.");
  if (!married && hasSuratNikah)
    warnings.push(
      "Surat nikah tersedia, tetapi status keluarga belum menunjukkan kawin.",
    );
  if (!hasFamilyBase && hasSuratIjin)
    warnings.push(
      "Surat ijin keluarga ada, tetapi data keluarga inti belum lengkap.",
    );
  if (
    hasKtp &&
    (!hasMeaningfulValue(personal.nama) ||
      !/^\d{16}$/.test(String(personal.nik || "").trim()))
  ) {
    warnings.push(
      "Dokumen KTP ada, tetapi identitas inti biodata belum lengkap/valid.",
    );
  }
  if (hasArc && !hasExperience)
    warnings.push(
      "Upload ARC ada, tetapi pengalaman kerja/riwayat EX belum terisi.",
    );

  const readyReview = identitasItems.every((x) => x.ok);
  const readyMarketing =
    readyReview &&
    keluargaItems.every((x) => x.ok) &&
    hasKtp &&
    hasKk &&
    (hasEducation || hasExperience || hasSkill);
  const readyAdmin =
    readyMarketing && hasSuratIjin && (!married || hasSuratNikah);
  const readyPlacement = readyAdmin && profilItems.every((x) => x.ok);

  let status = "DRAFT";
  if (warnings.length > 0 && readyReview) status = "PERLU_REVISI";
  else if (readyPlacement) status = "SIAP_PENEMPATAN";
  else if (readyAdmin) status = "SIAP_ADMIN";
  else if (readyMarketing) status = "SIAP_MARKETING";
  else if (readyReview) status = "REVIEW_BIODATA";

  const allItems = [
    ...identitasItems,
    ...keluargaItems,
    ...dokumenItems,
    ...profilItems,
  ];
  const okCount = allItems.filter((x) => x.ok).length;
  const score = allItems.length
    ? Math.round((okCount / allItems.length) * 100)
    : 0;

  return {
    status,
    score,
    warningCount: warnings.length,
    warnings,
    readyReview,
    readyMarketing,
    readyAdmin,
    readyPlacement,
    groups: [
      {
        key: "identitas",
        label: "Identitas",
        ok: identitasItems.filter((x) => x.ok).length,
        total: identitasItems.length,
        items: identitasItems,
      },
      {
        key: "keluarga",
        label: "Keluarga",
        ok: keluargaItems.filter((x) => x.ok).length,
        total: keluargaItems.length,
        items: keluargaItems,
      },
      {
        key: "dokumen",
        label: "Dokumen",
        ok: dokumenItems.filter((x) => x.ok).length,
        total: dokumenItems.length,
        items: dokumenItems,
      },
      {
        key: "profil",
        label: "Profil",
        ok: profilItems.filter((x) => x.ok).length,
        total: profilItems.length,
        items: profilItems,
      },
    ],
    screening: {
      umur: calcAgeYears(personal.tgllahir),
      tinggi: hasMeaningfulValue(personal.tinggi)
        ? String(personal.tinggi).trim()
        : "",
      berat: hasMeaningfulValue(personal.berat)
        ? String(personal.berat).trim()
        : "",
      pendidikan: String(
        personal.pendidikan || personal.statuspendidikan || "",
      ).trim(),
      bahasa: [
        personal.mandarin,
        personal.taiyu,
        personal.inggris,
        personal.cantonese,
        personal.hakka,
      ]
        .map((v) => String(v || "").trim())
        .filter(Boolean),
      pengalamanCount: (pengalaman || []).length + (working || []).length,
      exTaiwan: hasArc,
      married,
    },
  };
}

const PERSONAL_STATUS_VALUES = ["PROSES", "TERPILIH", "PENDING", "TERBANG"];

function normalizePersonalStatus(value) {
  const s = String(value || "PROSES")
    .trim()
    .toUpperCase();
  return PERSONAL_STATUS_VALUES.includes(s) ? s : "PROSES";
}

function isTglTerpilihFilled(value) {
  return String(value == null ? "" : value).trim() !== "";
}

function assertMajikanTglTerpilih(data, existingRow = null) {
  const merged = existingRow ? { ...existingRow, ...data } : data;
  if (!isTglTerpilihFilled(merged.tglterpilih)) {
    throw new Error("Tanggal Terpilih wajib diisi di data majikan.");
  }
}

/** Konteks status TKI untuk validasi UI / API */
async function getPersonalStatusContext(idBiodata, opts = {}) {
  const id = await resolveBiodataInputId(idBiodata);
  if (!id) return null;

  const personal = await getByField("personal", "id_biodata", id);
  if (!personal) return null;

  const majikan = await getByField("majikan", "id_biodata", id);
  const visa = await getByField("visa", "id_biodata", id);
  const tglterpilih = majikan?.tglterpilih
    ? String(majikan.tglterpilih).trim()
    : "";
  const canSetTerpilih = Boolean(majikan) && isTglTerpilihFilled(tglterpilih);
  const statterbang = Number(personal.statterbang) === 1;
  const hasDeparted = statterbang || isTglTerpilihFilled(visa?.tanggalterbang);
  const statusaktif = normalizePersonalStatus(personal.statusaktif);

  const transitions = {};
  for (const to of PERSONAL_STATUS_VALUES) {
    transitions[to] = evaluatePersonalStatusTransition(
      statusaktif,
      to,
      {
        canSetTerpilih,
        statterbang,
        hasDeparted,
      },
      opts,
    );
  }

  return {
    id_biodata: id,
    statusaktif,
    statterbang,
    canSetTerpilih,
    tglterpilih: tglterpilih || null,
    hasDeparted,
    transitions,
  };
}

function evaluatePersonalStatusTransition(
  fromStatus,
  toStatus,
  ctx,
  opts = {},
) {
  const from = normalizePersonalStatus(fromStatus);
  const to = normalizePersonalStatus(toStatus);
  const force = Boolean(opts.force);
  const isAdmin = Boolean(opts.isAdmin);

  if (from === to) {
    return { allowed: false, reason: "Sudah pada status ini." };
  }

  if (to === "TERBANG") {
    return {
      allowed: false,
      reason:
        "Status Terbang tidak bisa diubah manual. Gunakan menu Visa → Catat keberangkatan.",
    };
  }

  if (from === "TERBANG" && !force) {
    return {
      allowed: false,
      reason: "TKI sudah berangkat; status tidak dapat diturunkan.",
    };
  }

  if (to === "TERPILIH") {
    if (!ctx.canSetTerpilih) {
      return {
        allowed: false,
        reason: "Status Terpilih memerlukan tanggal terpilih di tab Majikan.",
      };
    }
    if (from === "PENDING") {
      return { allowed: true, reason: "" };
    }
    if (from === "PROSES") {
      if (opts.autoSync) return { allowed: true, reason: "" };
      return {
        allowed: false,
        reason:
          "Status Terpilih otomatis saat data majikan (tanggal terpilih) disimpan.",
      };
    }
    if (from === "TERBANG" && force) {
      return { allowed: true, reason: "" };
    }
    if (from === "TERPILIH") {
      return { allowed: false, reason: "Sudah pada status Terpilih." };
    }
    return { allowed: false, reason: "Perubahan ke Terpilih tidak diizinkan." };
  }

  if (to === "PENDING") {
    if (from !== "TERPILIH") {
      return {
        allowed: false,
        reason:
          "Status Pending hanya untuk TKI Terpilih yang tertunda berangkat (mis. sakit).",
      };
    }
    if (!ctx.canSetTerpilih) {
      return {
        allowed: false,
        reason: "Lengkapi tanggal terpilih di tab Majikan.",
      };
    }
    if (ctx.statterbang || ctx.hasDeparted) {
      return { allowed: false, reason: "TKI sudah tercatat terbang." };
    }
    return { allowed: true, reason: "" };
  }

  if (to === "PROSES") {
    if (from === "TERPILIH" || from === "PENDING") {
      if (!force || !isAdmin) {
        return {
          allowed: false,
          reason:
            "Mengembalikan ke Proses hanya boleh oleh admin (hubungi administrator).",
        };
      }
      return { allowed: true, reason: "" };
    }
    if (from === "TERBANG" && force && isAdmin) {
      return { allowed: true, reason: "" };
    }
    return { allowed: false, reason: "Perubahan ke Proses tidak diizinkan." };
  }

  return { allowed: false, reason: "Perubahan status tidak diizinkan." };
}

async function validatePersonalStatusChange(idBiodata, newStatus, opts = {}) {
  const to = normalizePersonalStatus(newStatus);
  const ctx = await getPersonalStatusContext(idBiodata, opts);
  if (!ctx) {
    return { ok: false, error: "Biodata tidak ditemukan", allowed: false };
  }
  const rule = ctx.transitions[to] || {
    allowed: false,
    reason: "Status tidak dikenali.",
  };
  if (!rule.allowed) {
    return {
      ok: false,
      error: rule.reason || "Perubahan status tidak diizinkan.",
      allowed: false,
      requires: rule,
    };
  }
  return { ok: true, allowed: true, from: ctx.statusaktif, to };
}

async function appendPersonalStatusHistory({
  id_biodata,
  status_dari,
  status_ke,
  alasan,
  changed_by,
}) {
  const id = String(id_biodata || "").trim();
  if (!id) return null;
  const ke = normalizePersonalStatus(status_ke);
  const dari = status_dari != null ? normalizePersonalStatus(status_dari) : "";
  if (!getTableNames().includes("personal_stat_history")) return null;

  return create(
    "personal_stat_history",
    {
      id_biodata: id,
      tanggal_ganti: new Date().toISOString().slice(0, 10),
      status_dari: dari,
      status_ke: ke,
      status: ke,
      alasan: String(alasan || "").trim(),
      changed_by: String(changed_by || "").trim(),
    },
    { skipAudit: true },
  );
}

async function listPersonalStatusHistory(idBiodata, limit = 30) {
  const id = await resolveBiodataInputId(idBiodata);
  if (!id || !getTableNames().includes("personal_stat_history")) return [];
  const rows = normalizeRows(
    await q(
      db.prepare(
        `SELECT * FROM personal_stat_history WHERE id_biodata = ? ORDER BY id DESC LIMIT ?`,
      ),
      "all",
      id,
      Math.min(Math.max(Number(limit) || 30, 1), 100),
    ),
  );
  return rows;
}

async function changePersonalStatus(idBiodata, newStatus, opts = {}) {
  const id = await resolveBiodataInputId(idBiodata);
  if (!id) throw new Error("Biodata tidak ditemukan");
  const personal = await getByField("personal", "id_biodata", id);
  if (!personal) throw new Error("Biodata tidak ditemukan");

  const from = normalizePersonalStatus(personal.statusaktif);
  const to = normalizePersonalStatus(newStatus);
  const validation = await validatePersonalStatusChange(id, to, opts);
  if (!validation.ok)
    throw new Error(validation.error || "Perubahan status tidak diizinkan");

  return update(
    "personal",
    personal.id,
    { statusaktif: to },
    {
      ...opts,
      skipStatusValidation: true,
      statusAlasan: opts.alasan,
      changedBy: opts.changedBy || opts.changed_by || "",
    },
  );
}

/** PROSES → TERPILIH otomatis setelah majikan + tglterpilih valid (plan4) */
async function syncPersonalStatusAfterMajikanSave(idBiodata, auditOpts = {}) {
  const id = String(idBiodata || "").trim();
  if (!id) return { changed: false };

  const personal = await getByField("personal", "id_biodata", id);
  if (!personal || normalizePersonalStatus(personal.statusaktif) !== "PROSES") {
    return { changed: false, statusaktif: personal?.statusaktif || null };
  }

  const ctx = await getPersonalStatusContext(id, auditOpts);
  if (!ctx?.canSetTerpilih)
    return { changed: false, statusaktif: ctx?.statusaktif || "PROSES" };

  await changePersonalStatus(id, "TERPILIH", {
    ...auditOpts,
    autoSync: true,
    alasan:
      auditOpts.alasan || "Otomatis: data majikan dan tanggal terpilih terisi",
  });

  return { changed: true, statusaktif: "TERPILIH" };
}

/** Sinkron status dari data majikan / visa / terbang (alur otomatis plan4) */
async function reconcilePersonalStatus(idBiodata, auditOpts = {}) {
  const id = await resolveBiodataInputId(idBiodata);
  if (!id) return { changed: false };

  const personal = await getByField("personal", "id_biodata", id);
  if (!personal) return { changed: false };

  let current = normalizePersonalStatus(personal.statusaktif);
  let changed = false;

  const visa = await getByField("visa", "id_biodata", id);
  const departed =
    Number(personal.statterbang) === 1 ||
    isTglTerpilihFilled(visa?.tanggalterbang);

  if (departed && current !== "TERBANG") {
    await update(
      "personal",
      personal.id,
      { statusaktif: "TERBANG", statterbang: 1 },
      {
        ...auditOpts,
        skipStatusValidation: true,
        statusAlasan:
          auditOpts.alasan || "Otomatis: data keberangkatan terpenuhi",
        changedBy: auditOpts.changedBy || "system",
      },
    );
    current = "TERBANG";
    changed = true;
  } else if (current !== "TERBANG") {
    const sync = await syncPersonalStatusAfterMajikanSave(id, auditOpts);
    if (sync.changed) {
      changed = true;
      current = "TERPILIH";
    }
  }

  return { changed, statusaktif: current };
}

/** Mapping kolom dokumen identitas → tabel upload (master /dokumen) */
const DOC_FIELD_UPLOAD_TYPES = {
  ktp: "upload_ktp",
  kk: "upload_kk",
  akte: "upload_aktelahir",
  ijazah: "upload_ijasah",
  paspor: "upload_pasporbaru",
  arc: "upload_arc",
};

async function latestUploadFileForBiodata(uploadTable, idBiodata) {
  const id = String(idBiodata || "").trim();
  if (!id || !getTableNames().includes(uploadTable)) return "";
  try {
    const rows = normalizeRows(
      await q(
        db.prepare(
          `SELECT file, id FROM "${uploadTable}" WHERE id_biodata = ? AND file IS NOT NULL AND TRIM(file) != '' ORDER BY id DESC`,
        ),
        "all",
        id,
      ),
    );
    return rows[0]?.file ? String(rows[0].file).trim() : "";
  } catch {
    return "";
  }
}

/** Gabungkan status file dokumen ke baris personal (upload_* + fallback dokumen) */
async function enrichPersonalListDocStatus(rows) {
  if (!rows?.length) return rows;
  const fields = Object.keys(DOC_FIELD_UPLOAD_TYPES);
  for (const row of rows) {
    const id = String(row.id_biodata || "").trim();
    if (!id) continue;
    let doc = null;
    try {
      doc = await getByField("dokumen", "id_biodata", id);
    } catch {
      doc = null;
    }
    for (const f of fields) {
      const uploadTable = DOC_FIELD_UPLOAD_TYPES[f];
      let val = await latestUploadFileForBiodata(uploadTable, id);
      if (!val && doc?.[f]) val = String(doc[f]).trim();
      row[f] = val;
    }
  }
  return rows;
}

/** Gabungkan pekerjaan (majikan) + detail kriteria ke baris personal */
async function enrichPersonalListDetailPekerjaan(rows) {
  if (!rows?.length) return rows;
  const ids = rows
    .map((r) => String(r.id_biodata || "").trim())
    .filter(Boolean);
  if (!ids.length) return rows;

  const placeholders = ids.map(() => "?").join(",");
  const majikanRows = await q(
    db.prepare(
      `SELECT id_biodata, pekerjaan FROM majikan WHERE id_biodata IN (${placeholders})`,
    ),
    "all",
    ...ids,
  );
  const majikanMap = Object.create(null);
  for (const m of majikanRows || []) {
    const key = String(m.id_biodata || "").trim();
    if (key) majikanMap[key] = m.pekerjaan || "";
  }

  const detailRows = await q(
    db.prepare(
      `SELECT mk.id_biodata, mk.kode, mk.nama AS mk_nama, kp.nama AS kp_nama
       FROM majikan_kriteria_pekerjaan mk
       LEFT JOIN kriteria_pekerjaan kp ON kp.kode = mk.kode
       WHERE mk.id_biodata IN (${placeholders})
       ORDER BY mk.id_biodata, mk.kode`,
    ),
    "all",
    ...ids,
  );
  const detailPartsMap = Object.create(null);
  for (const d of detailRows || []) {
    const key = String(d.id_biodata || "").trim();
    if (!key) continue;
    const label =
      String(d.mk_nama || "").trim() ||
      String(d.kp_nama || "").trim() ||
      String(d.kode || "").trim();
    if (!label) continue;
    if (!detailPartsMap[key]) detailPartsMap[key] = [];
    detailPartsMap[key].push(label);
  }
  const detailMap = Object.create(null);
  for (const [key, parts] of Object.entries(detailPartsMap)) {
    detailMap[key] = parts.join(", ");
  }

  for (const row of rows) {
    const id = String(row.id_biodata || "").trim();
    row.pekerjaan = majikanMap[id] || "";
    row.detail_pekerjaan = detailMap[id] || "";
  }
  return rows;
}

/** Gabungkan kolom episode aktif dari personal ke baris datatki (list TKI) */
async function enrichDatatkiListFromPersonal(rows) {
  if (!rows?.length) return rows;
  const ids = [
    ...new Set(
      rows.map((r) => String(r.id_biodata || "").trim()).filter(Boolean),
    ),
  ];
  if (!ids.length) return rows;

  const placeholders = ids.map(() => "?").join(",");
  const personalRows = await dbAllRows(
    `SELECT id_biodata, kode_sponsor, kode_pl, tanggaldaftar, statterbang
     FROM personal WHERE id_biodata IN (${placeholders})`,
    ...ids,
  );
  const map = Object.create(null);
  for (const p of personalRows || []) {
    const key = String(p.id_biodata || "").trim();
    if (key) map[key] = p;
  }

  for (const row of rows) {
    const id = String(row.id_biodata || "").trim();
    const personal = map[id];
    if (!personal) continue;
    row.kode_sponsor = personal.kode_sponsor ?? row.kode_sponsor;
    row.kode_pl = personal.kode_pl ?? row.kode_pl;
    row.tanggaldaftar = personal.tanggaldaftar ?? row.tanggaldaftar;
    row.statterbang = personal.statterbang ?? row.statterbang;
  }
  return rows;
}

/** Simpan jenis pekerjaan + detail kriteria multi-select per TKI */
async function syncDetailPekerjaanForBiodata(
  idBiodata,
  pekerjaan,
  kriteriaItems,
  auditOpts = {},
) {
  const id = String(idBiodata || "").trim();
  if (!id) throw new Error("id_biodata wajib diisi");

  const majikan = await getByField("majikan", "id_biodata", id);
  if (!majikan) {
    throw new Error(
      "Penempatan majikan belum ada. Set majikan terlebih dahulu.",
    );
  }

  await update(
    "majikan",
    majikan.id,
    { pekerjaan: String(pekerjaan || "").trim() },
    auditOpts,
  );

  const pekerjaanText = String(pekerjaan || "").trim();
  let pekerjaanId = null;
  if (pekerjaanText) {
    const pekerjaanRow = await getByField(
      "datapekerjaan",
      "isi",
      pekerjaanText,
    );
    pekerjaanId = pekerjaanRow?.id ?? null;
  }

  const existing = await listByIdBiodata("majikan_kriteria_pekerjaan", id);
  for (const row of existing) {
    if (row?.id != null) {
      await remove("majikan_kriteria_pekerjaan", row.id, auditOpts);
    }
  }

  const items = Array.isArray(kriteriaItems) ? kriteriaItems : [];
  let kriteriaCount = 0;
  for (const item of items) {
    const kode = String(item?.kode || "").trim();
    if (!kode) continue;
    if (pekerjaanId != null) {
      const kriteriaRow = await getByField("kriteria_pekerjaan", "kode", kode);
      if (
        kriteriaRow?.id_pekerjaan != null &&
        Number(kriteriaRow.id_pekerjaan) !== Number(pekerjaanId)
      ) {
        const label = String(kriteriaRow.nama || kode).trim();
        throw new Error(
          `Detail "${label}" tidak sesuai jenis pekerjaan "${pekerjaanText}"`,
        );
      }
    }
    await create(
      "majikan_kriteria_pekerjaan",
      {
        id_biodata: id,
        kode,
        nama: String(item?.nama || "").trim(),
      },
      auditOpts,
    );
    kriteriaCount += 1;
  }

  return {
    id_biodata: id,
    pekerjaan: String(pekerjaan || "").trim(),
    kriteriaCount,
  };
}

function pickFields(row, keys) {
  if (!row) return null;
  const out = {};
  keys.forEach((k) => {
    if (row[k] != null && row[k] !== "") out[k] = row[k];
  });
  return Object.keys(out).length ? out : null;
}

// Rekap FISKAL read-only (plan §8A.6c)
async function getBiodataFiskal(idBiodata) {
  const id = String(idBiodata || "").trim();
  const detail = await getBiodataDetail(id);
  if (!detail) return null;

  const p = detail.personal;
  const v = detail.visa;
  const uploadSummary = await getUploadSummaryForBiodata(id);
  const uploadFilled = uploadSummary.filter((u) => u.count > 0).length;

  let terbangInfo = null;
  if (v?.id_terbang) {
    terbangInfo = await getById("dataterbang", v.id_terbang);
  }

  return {
    id_biodata: id,
    generatedAt: new Date().toISOString(),
    personal: pickFields(p, [
      "nama",
      "id_biodata",
      "statusaktif",
      "statterbang",
      "negara1",
      "kode_sponsor",
      "tanggaldaftar",
    ]),
    family: detail.family
      ? pickFields(detail.family, [
          "namaayah",
          "namaibu",
          "namasuami",
          "namaistri",
        ])
      : null,
    dokumen: detail.dokumen
      ? pickFields(detail.dokumen, [
          "ktp",
          "kk",
          "akte",
          "ijazah",
          "paspor",
          "arc",
          "visa",
          "skck",
        ])
      : null,
    disnaker: pickFields(detail.disnaker, [
      "nodisnaker",
      "kantor",
      "lokasireg",
      "statuspengajuan",
      "tglonline",
      "tglterima",
      "statusterima",
      "statusexp",
      "ket",
    ]),
    medical: {
      medical1: pickFields(detail.medical, [
        "jenismedical",
        "tanggal",
        "nomor",
        "nama",
      ]),
      medical2: pickFields(detail.medical2, [
        "jenismedical",
        "tanggal",
        "nomor",
        "nama",
      ]),
      medical3: pickFields(detail.medical3, [
        "jenismedical",
        "tanggal",
        "nomor",
        "nama",
      ]),
    },
    paspor: {
      aktif: pickFields(detail.paspor, [
        "nopaspor",
        "office",
        "tglterbit",
        "tglpengajuan",
        "statuspengajuan",
        "tglterima",
        "statusterima",
        "masaaktif",
      ]),
      lama: pickFields(detail.pasporlama, ["nopaspor", "office", "tglterbit"]),
    },
    majikan: pickFields(detail.majikan, [
      "namamajikan",
      "kode_majikan",
      "kode_agen",
      "tglterpilih",
      "status",
    ]),
    visa: pickFields(v, [
      "novisa",
      "statuskocokan",
      "statuspap",
      "statusktkln",
      "tanggalterbang",
      "statusterbang",
      "airport",
      "tiket",
      "id_terbang",
    ]),
    terbang: terbangInfo
      ? pickFields(terbangInfo, ["isi", "mandarin", "tanggal"])
      : null,
    skck: pickFields(detail.skck, [
      "pengajuan",
      "statuspengajuan",
      "terima",
      "statusterima",
      "tglexp",
      "statusexp",
    ]),
    skckPolres: pickFields(detail.skckPolres, [
      "pengajuan",
      "statuspengajuan",
      "terima",
      "statusterima",
      "tglexp",
      "statusexp",
    ]),
    signingbank: pickFields(detail.signingbank, [
      "bank",
      "status",
      "tgl_signing",
      "keterangan",
    ]),
    legalitas: pickFields(detail.legalitas, [
      "tgl_legal",
      "nama_legal",
      "hub_legal",
      "notelp",
      "khusus_legal",
    ]),
    notarisan: pickFields(detail.notarisan, [
      "tgl_nota",
      "nama_nota",
      "hub_nota",
      "notelp",
      "khusus_nota",
    ]),
    bukaRekening: pickFields(detail.bukaRekening, [
      "bank",
      "norek",
      "tgl_buka",
      "status",
    ]),
    asuransiHotel: pickFields(detail.asuransiHotel, [
      "dakt",
      "daki",
      "dattt",
      "aju_ht",
      "idhotel",
      "adh_nohp",
      "adh_line",
      "adh_email",
    ]),
    isichongyi: pickFields(detail.isichongyi, ["kbm", "kbi", "sbt", "hub"]),
    upload: {
      jenisTerisi: uploadFilled,
      jenisTotal: uploadSummary.length,
      visaArrival:
        uploadSummary.find((u) => u.type === "upload_visaarrival") || null,
    },
  };
}

// Event keberangkatan — update visa + personal.statterbang (plan Fase 1)
async function recordVisaDeparture(payload = {}) {
  const id = String(payload.id_biodata || "").trim();
  if (!id) throw new Error("id_biodata wajib");

  const personal = await getByField("personal", "id_biodata", id);
  if (!personal) throw new Error("Biodata tidak ditemukan");

  const tanggal =
    payload.tanggalterbang || new Date().toISOString().slice(0, 10);
  let visa = await getByField("visa", "id_biodata", id);

  const visaData = {
    id_biodata: id,
    tanggalterbang: tanggal,
    statusterbang: payload.statusterbang || "Sudah terbang",
    airport: payload.airport || "",
    tiket: payload.tiket || "",
    id_terbang:
      payload.id_terbang != null && payload.id_terbang !== ""
        ? Number(payload.id_terbang)
        : null,
  };

  if (visa?.id) {
    visa = await update("visa", visa.id, visaData);
  } else {
    visa = await create("visa", visaData);
  }

  const nextStatus = "TERBANG";

  await update(
    "personal",
    personal.id,
    { statterbang: 1, statusaktif: nextStatus },
    {
      skipStatusValidation: true,
      changedBy: payload.changed_by || payload.changedBy || "",
      statusAlasan: payload.alasan || "Catat keberangkatan (visa)",
    },
  );

  return {
    id_biodata: id,
    visa,
    statterbang: 1,
    tanggalterbang: tanggal,
    statusaktif: nextStatus,
  };
}

function markRecordHasProgress(rec) {
  if (!rec) return false;
  const hasValue = (v) =>
    v != null && String(v).trim() !== "" && String(v) !== "0";
  if (hasValue(rec.status)) return true;
  const dateKeys = Object.keys(rec).filter(
    (k) =>
      k.startsWith("tgl_") ||
      k.endsWith("_perkiraan") ||
      k === "tanggal" ||
      k === "tgl_bank",
  );
  return dateKeys.some((k) => hasValue(rec[k]));
}

function countMarkawalStepsDone(markDetail) {
  let done = 0;
  if (markRecordHasProgress(markDetail.marka)) done += 1;
  if (
    Array.isArray(markDetail.markaBiotoagen) &&
    markDetail.markaBiotoagen.length > 0
  )
    done += 1;
  if (markRecordHasProgress(markDetail.markb)) done += 1;
  if (markRecordHasProgress(markDetail.markc)) done += 1;
  if (markRecordHasProgress(markDetail.marke)) done += 1;
  if (markRecordHasProgress(markDetail.markf)) done += 1;
  if (markRecordHasProgress(markDetail.markg)) done += 1;
  return done;
}

const MARKETING_UPLOAD_TYPES = [
  "upload_berkas",
  "upload_kehilanganpaspor",
  "upload_keterangan",
  "upload_ktp",
  "upload_kk",
  "upload_ijasah",
  "upload_suratijinkeluarga",
  "upload_suratnikah",
  "upload_arc",
  "upload_asuransilama",
];

function countMarketingUploadFilledFromSummary(uploadSummary) {
  const summary = Array.isArray(uploadSummary) ? uploadSummary : [];
  const filled = MARKETING_UPLOAD_TYPES.filter((type) => {
    const item = summary.find((s) => s.type === type);
    return Number(item?.count) > 0 || Boolean(item?.hasFile);
  }).length;
  return { filled, total: MARKETING_UPLOAD_TYPES.length };
}

async function computeMarketingFlowProgress(idBiodata) {
  const id = String(idBiodata || "").trim();
  const [
    marka,
    markaBiotoagen,
    markb,
    markc,
    marke,
    markf,
    markg,
    majikan,
    majikanKriteria,
    visa,
    uploadSummary,
    personal,
  ] = await Promise.all([
    getByField("marka", "id_biodata", id),
    listByIdBiodata("marka_biotoagen", id),
    getByField("markb", "id_biodata", id),
    getByField("markc", "id_biodata", id),
    getByField("marke", "id_biodata", id),
    getByField("markf", "id_biodata", id),
    getByField("markg", "id_biodata", id),
    getByField("majikan", "id_biodata", id),
    listByIdBiodata("majikan_kriteria_pekerjaan", id),
    getByField("visa", "id_biodata", id),
    getUploadSummaryForBiodata(id),
    getByField("personal", "id_biodata", id),
  ]);

  const markTotal = 7;
  const markDone = countMarkawalStepsDone({
    marka,
    markaBiotoagen,
    markb,
    markc,
    marke,
    markf,
    markg,
  });
  const m = majikan || {};
  const kriteriaCount = Array.isArray(majikanKriteria)
    ? majikanKriteria.length
    : 0;
  const majikanOk = Boolean(
    String(m.kode_suhan || "").trim() &&
    String(m.namamajikan || m.kode_majikan || "").trim() &&
    String(m.pekerjaan || "").trim() &&
    kriteriaCount > 0,
  );
  const v = visa || {};
  const visaOk = Boolean(
    v.id != null &&
    (String(v.novisa || "").trim() ||
      String(v.tanggalterbang || "").trim() ||
      String(v.tglberangkat || "").trim()),
  );
  const uploadStats = countMarketingUploadFilledFromSummary(uploadSummary);
  const checklistOk = uploadStats.filled >= 3;

  return {
    steps: {
      ringkasan: {
        ok: Boolean(personal && String(personal.nama || "").trim()),
      },
      markawal: {
        done: markDone,
        total: markTotal,
        ok: markDone >= markTotal,
        hint: `${markDone}/${markTotal} langkah`,
      },
      majikan: {
        ok: majikanOk,
        hint: m.kode_suhan ? `Suhan: ${m.kode_suhan}` : "Belum pilih suhan",
      },
      visa: {
        ok: visaOk,
        hint: v.novisa
          ? `Visa: ${v.novisa}`
          : v.tanggalterbang
            ? `Terbang: ${v.tanggalterbang}`
            : "Belum isi visa / jadwal",
      },
      checklist: {
        filled: uploadStats.filled,
        total: uploadStats.total,
        ok: checklistOk,
        hint: `${uploadStats.filled}/${uploadStats.total} checklist terisi`,
      },
    },
  };
}

/** Shell ringan detail marketing — personal + progress stepper (tanpa load semua relasi) */
async function getBiodataMarketingShell(idBiodata) {
  const input = String(idBiodata || "").trim();
  if (!input) return null;
  const id = await resolveBiodataInputId(input);

  const personal = await getByField("personal", "id_biodata", id);
  if (!personal) return null;

  const sektor = getKodeSektorFromBiodataId(id);
  const sektorInfo = await getDatasektorByKode(sektor);
  const marketingFlow = await computeMarketingFlowProgress(id);

  return {
    personal,
    sektor: sektorInfo,
    marketingFlow,
  };
}

const BIODATA_UPLOAD_MENU_KEYS = new Set([
  "upload",
  "upload_arc",
  "upload_keterangan",
]);

const ADMIN_FLOW_TAB_KEYS = [
  "fiskal",
  "keadaan_tki",
  "disnaker",
  "medical",
  "medical2",
  "medical3",
  "paspor",
  "pasporlama",
  "skck",
  "skckpolres",
  "legalitas",
  "visa",
  "pap",
  "signingbank",
  "bukarekening",
  "asuransihotel",
  "isichongyi",
  "majikan",
  "markawal",
  "upload",
];

const ADMIN_OPTIONAL_FLOW_KEYS = new Set(["fiskal", "upload"]);

function normalizeBiodataTabKey(section) {
  const key = String(section || "")
    .trim()
    .toLowerCase();
  const aliases = { hubungan: "family", keluarga: "family" };
  return aliases[key] || key;
}

function rowHasMeaningfulData(row) {
  if (!row) return false;
  if (row.id != null) return true;
  return Object.keys(row).some((k) => {
    if (k === "id_biodata" || k === "id") return false;
    const v = row[k];
    return v != null && String(v).trim() !== "";
  });
}

function interviewRowHasAnswers(row) {
  if (!row) return false;
  const keys = [
    "tgl_interview",
    "sunction",
    "food",
    "cateter",
    "injection",
    "therapy",
    "helping",
    "bed",
    "stairs",
  ];
  return keys.every((k) => row[k] != null && String(row[k]).trim() !== "");
}

const SKILL_BIODATA_PRINT_KEYS = [
  "keterampilan",
  "hobi",
  "alkohol",
  "merokok",
  "food",
  "alergi",
  "operasi",
  "tato",
  "peglihatan",
  "kidal",
  "butawarna",
];

const EXPERIENCE_TAB_KEYS = ["keterampilan", "hobi", "alkohol", "merokok"];

function skillconditionRowCompleteForPrint(row) {
  if (!row) return false;
  return SKILL_BIODATA_PRINT_KEYS.every(
    (k) => row[k] != null && String(row[k]).trim() !== "",
  );
}

function experienceTabComplete(row) {
  if (!row) return false;
  return EXPERIENCE_TAB_KEYS.every(
    (k) => row[k] != null && String(row[k]).trim() !== "",
  );
}

const REQUEST_PRINT_KEYS = [
  "usahamajikan",
  "jenispekerjaan",
  "waktukerja",
  "lokasikerja",
  "kondisikerja",
  "lembur",
];

const VAKSIN_PRINT_KEYS = ["nama1", "tgl1", "nama2", "tgl2", "nama3", "tgl3"];

const PPTK_PRINT_KEYS = ["tgl", "isi"];

function requestRowCompleteForPrint(row) {
  if (!row) return false;
  return REQUEST_PRINT_KEYS.every(
    (k) => row[k] != null && String(row[k]).trim() !== "",
  );
}

function vaksinRowCompleteForPrint(row) {
  if (!row) return false;
  return VAKSIN_PRINT_KEYS.every(
    (k) => row[k] != null && String(row[k]).trim() !== "",
  );
}

function pptkRowCompleteForPrint(row) {
  if (!row) return false;
  return PPTK_PRINT_KEYS.every(
    (k) => row[k] != null && String(row[k]).trim() !== "",
  );
}

async function pickSkillconditionRecordByBiodata(idBiodata) {
  const rows = await listByIdBiodata(
    "skillcondition",
    String(idBiodata || "").trim(),
  );
  return rows[0] || null;
}

async function pickRequestRecordByBiodata(idBiodata) {
  const rows = await listByIdBiodata("request", String(idBiodata || "").trim());
  return rows[0] || null;
}

async function pickVaksinRecordByBiodata(idBiodata) {
  const rows = await listByIdBiodata("vaksin", String(idBiodata || "").trim());
  return rows[0] || null;
}

async function enrichRequestRecord(row) {
  if (!row) return null;
  const out = { ...row };
  const usaha = row.usahamajikan;
  if (usaha != null && String(usaha).trim() !== "") {
    const byId = await getById("databarangdiproduksi", usaha);
    if (byId?.isi) out.usahamajikan_label = byId.isi;
    else {
      const byIsi = await getByField(
        "databarangdiproduksi",
        "isi",
        String(usaha).trim(),
      );
      out.usahamajikan_label = byIsi?.isi || String(usaha);
    }
  }
  const pekerjaan = row.jenispekerjaan;
  if (pekerjaan != null && String(pekerjaan).trim() !== "") {
    const byIsi = await getByField(
      "dataposisi",
      "isi",
      String(pekerjaan).trim(),
    );
    if (byIsi?.isi) out.jenispekerjaan_label = byIsi.isi;
    else {
      const byId = await getById("dataposisi", pekerjaan);
      out.jenispekerjaan_label = byId?.isi || String(pekerjaan);
    }
  }
  return out;
}

async function enrichWorkingRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows || [];
  const out = [];
  for (const w of rows) {
    const row = { ...w };
    if (row.jenis_usaha != null && String(row.jenis_usaha).trim() !== "") {
      const master = await getById("databarangdiproduksi", row.jenis_usaha);
      if (master?.isi) row.jenis_usaha_label = master.isi;
    }
    out.push(row);
  }
  return out;
}

async function enrichVaksinRecord(row) {
  if (!row) return null;
  const out = { ...row };
  for (const key of ["nama1", "nama2", "nama3"]) {
    const id = row[key];
    if (id != null && String(id).trim() !== "") {
      const v = await getById("setting_vaksinlist", id);
      if (v?.nama) out[`${key}_label`] = v.nama;
    }
  }
  return out;
}

/** Cek ringan apakah tab biodata sudah berisi data (progress stepper) */
async function biodataTabIsFilled(idBiodata, tabKey) {
  const id = String(idBiodata || "").trim();
  const key = normalizeBiodataTabKey(tabKey);
  if (!id) return false;
  if (key === "personal") {
    const p = await getByField("personal", "id_biodata", id);
    return Boolean(p && String(p.nama || "").trim());
  }
  if (BIODATA_UPLOAD_MENU_KEYS.has(key)) return false;
  const listTables = {
    working: "working",
    pengalaman: "pengalaman",
    pptk: "pptk",
    tugas: "tugas",
    interview_teto: "interview_teto",
  };
  if (listTables[key]) {
    const rows = await listByIdBiodata(listTables[key], id);
    return rows.some((r) => rowHasMeaningfulData(r));
  }
  if (key === "skillcondition") {
    return skillconditionRowCompleteForPrint(
      await pickSkillconditionRecordByBiodata(id),
    );
  }
  if (key === "experience") {
    return experienceTabComplete(await pickSkillconditionRecordByBiodata(id));
  }
  if (key === "request") {
    return requestRowCompleteForPrint(await pickRequestRecordByBiodata(id));
  }
  if (key === "vaksin") {
    return vaksinRowCompleteForPrint(await pickVaksinRecordByBiodata(id));
  }
  if (key === "pptk") {
    const rows = await listByIdBiodata("pptk", id);
    return pptkRowCompleteForPrint(rows[0] || null);
  }
  if (key === "interview") {
    const rows = await listByIdBiodata("interview", id);
    return rows.some((r) => interviewRowHasAnswers(r));
  }
  if (key === "kettugas") {
    const rows = await listByIdBiodata("kettugas", id);
    return rows.some((r) => rowHasMeaningfulData(r));
  }
  const singletonTables = { family: "family", dokumen: "dokumen" };
  if (singletonTables[key]) {
    return rowHasMeaningfulData(
      await getByField(singletonTables[key], "id_biodata", id),
    );
  }
  return false;
}

/** Progress alur biodata per menu sektor — tanpa load semua relasi */
async function computeBiodataFlowProgress(idBiodata, menuTabs) {
  const id = String(idBiodata || "").trim();
  const menus = (menuTabs || [])
    .filter(
      (m) =>
        String(m.url_menu || "")
          .trim()
          .toLowerCase() !== "admin",
    )
    .sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0));
  const trackable = menus.filter(
    (m) =>
      !BIODATA_UPLOAD_MENU_KEYS.has(
        String(m.url_menu || "")
          .trim()
          .toLowerCase(),
      ),
  );
  const filledResults = await Promise.all(
    trackable.map(async (m) => {
      const key = String(m.url_menu || "").trim();
      const filled = await biodataTabIsFilled(id, key);
      return { key, filled };
    }),
  );
  const steps = {};
  filledResults.forEach(({ key, filled }) => {
    steps[key] = { filled };
  });
  const done = filledResults.filter((r) => r.filled).length;
  return { steps, done, total: trackable.length };
}

/** Cek ringan apakah tahap administrasi sudah terisi */
async function adminTabIsFilled(idBiodata, tabKey) {
  const id = String(idBiodata || "").trim();
  const key = String(tabKey || "")
    .trim()
    .toLowerCase();
  if (!id) return false;
  if (ADMIN_OPTIONAL_FLOW_KEYS.has(key)) return false;

  switch (key) {
    case "keadaan_tki":
      return (await listByIdBiodata("admin_keadaan_tki", id)).length > 0;
    case "disnaker":
      return rowHasMeaningfulData(
        await getByField("disnaker", "id_biodata", id),
      );
    case "medical":
      return rowHasMeaningfulData(
        await getByField("medical", "id_biodata", id),
      );
    case "medical2":
      return rowHasMeaningfulData(
        await getByField("medical2", "id_biodata", id),
      );
    case "medical3":
      return rowHasMeaningfulData(
        await getByField("medical3", "id_biodata", id),
      );
    case "paspor": {
      if (rowHasMeaningfulData(await getByField("paspor", "id_biodata", id)))
        return true;
      const uploads = await listByIdBiodata("upload_pasporbaru", id);
      return uploads.some((u) => u.file && String(u.file).trim());
    }
    case "pasporlama": {
      const pl = await getByField("pasporlama", "id_biodata", id);
      if (rowHasMeaningfulData(pl)) return true;
      const uploads = await listByIdBiodata("upload_pasporlama", id);
      return uploads.some((u) => u.file && String(u.file).trim());
    }
    case "skck":
      return rowHasMeaningfulData(await getByField("skck", "id_biodata", id));
    case "skckpolres":
      return rowHasMeaningfulData(
        await getByField("skck_polres", "id_biodata", id),
      );
    case "legalitas": {
      const leg = await getByField("legalitas", "id_biodata", id);
      if (rowHasMeaningfulData(leg)) return true;
      const nota = await getByField("notarisan", "id_biodata", id);
      if (rowHasMeaningfulData(nota)) return true;
      const upLeg = await listByIdBiodata("upload_legalitas", id);
      if (upLeg.some((u) => u.file && String(u.file).trim())) return true;
      const upLegal = await listByIdBiodata("upload_legal", id);
      return upLegal.some((u) => u.file && String(u.file).trim());
    }
    case "visa":
      return rowHasMeaningfulData(await getByField("visa", "id_biodata", id));
    case "pap":
      return rowHasMeaningfulData(await getByField("pap", "id_biodata", id));
    case "signingbank":
      return rowHasMeaningfulData(
        await getByField("signingbank", "id_biodata", id),
      );
    case "bukarekening":
      return rowHasMeaningfulData(
        await require("./services/buka-rekening-tki-service").fetchForBiodata(
          getDbApi(),
          id,
        ),
      );
    case "asuransihotel":
      return rowHasMeaningfulData(
        await getByField("asuransi_dan_hotel", "id_biodata", id),
      );
    case "isichongyi":
      return rowHasMeaningfulData(
        await getByField("isichongyi", "id_biodata", id),
      );
    case "majikan":
      return rowHasMeaningfulData(
        await getByField("majikan", "id_biodata", id),
      );
    case "markawal": {
      const marka = await getByField("marka", "id_biodata", id);
      const agen = await listByIdBiodata("marka_biotoagen", id);
      return rowHasMeaningfulData(marka) || agen.length > 0;
    }
    default:
      return false;
  }
}

/** Progress alur administrasi — tanpa load semua modul sekaligus */
async function computeAdminFlowProgress(idBiodata) {
  const id = String(idBiodata || "").trim();
  const trackable = ADMIN_FLOW_TAB_KEYS.filter(
    (k) => !ADMIN_OPTIONAL_FLOW_KEYS.has(k),
  );
  const filledResults = await Promise.all(
    trackable.map(async (key) => ({
      key,
      filled: await adminTabIsFilled(id, key),
    })),
  );
  const steps = {};
  filledResults.forEach(({ key, filled }) => {
    steps[key] = { filled };
  });
  const done = filledResults.filter((r) => r.filled).length;
  return { steps, done, total: trackable.length };
}

/** Flag kelengkapan sidebar — query ringkas paralel */
async function getBiodataKelengkapanFlags(idBiodata) {
  const id = String(idBiodata || "").trim();
  if (!id) return {};
  const [
    family,
    dokumen,
    disnaker,
    medical,
    medical2,
    medical3,
    paspor,
    majikan,
    visa,
    marka,
    markaBiotoagen,
    working,
    skillcondition,
    requestRows,
    vaksinRows,
    pptkRows,
    interviewRows,
    interviewTetoRows,
  ] = await Promise.all([
    getByField("family", "id_biodata", id),
    getByField("dokumen", "id_biodata", id),
    getByField("disnaker", "id_biodata", id),
    getByField("medical", "id_biodata", id),
    getByField("medical2", "id_biodata", id),
    getByField("medical3", "id_biodata", id),
    getByField("paspor", "id_biodata", id),
    getByField("majikan", "id_biodata", id),
    getByField("visa", "id_biodata", id),
    getByField("marka", "id_biodata", id),
    listByIdBiodata("marka_biotoagen", id),
    listByIdBiodata("working", id),
    listByIdBiodata("skillcondition", id),
    listByIdBiodata("request", id),
    listByIdBiodata("vaksin", id),
    listByIdBiodata("pptk", id),
    listByIdBiodata("interview", id),
    listByIdBiodata("interview_teto", id),
  ]);
  return {
    family: rowHasMeaningfulData(family),
    dokumen: rowHasMeaningfulData(dokumen),
    disnaker: rowHasMeaningfulData(disnaker),
    medical: rowHasMeaningfulData(medical),
    medical2: rowHasMeaningfulData(medical2),
    medical3: rowHasMeaningfulData(medical3),
    paspor: rowHasMeaningfulData(paspor),
    majikan: rowHasMeaningfulData(majikan),
    visa: rowHasMeaningfulData(visa),
    marka:
      rowHasMeaningfulData(marka) ||
      (Array.isArray(markaBiotoagen) && markaBiotoagen.length > 0),
    working: Array.isArray(working) && working.length > 0,
    skill: skillconditionRowCompleteForPrint(
      Array.isArray(skillcondition) && skillcondition.length > 0
        ? skillcondition[0]
        : null,
    ),
    request: requestRowCompleteForPrint(
      Array.isArray(requestRows) && requestRows.length > 0
        ? requestRows[0]
        : null,
    ),
    vaksin: vaksinRowCompleteForPrint(
      Array.isArray(vaksinRows) && vaksinRows.length > 0 ? vaksinRows[0] : null,
    ),
    pptk: pptkRowCompleteForPrint(
      Array.isArray(pptkRows) && pptkRows.length > 0 ? pptkRows[0] : null,
    ),
    interview:
      Array.isArray(interviewRows) &&
      interviewRows.some((r) => interviewRowHasAnswers(r)),
    interviewTeto:
      Array.isArray(interviewTetoRows) &&
      interviewTetoRows.some((r) => rowHasMeaningfulData(r)),
  };
}

/** Shell ringan detail biodata — personal + menu + progress (tanpa relasi tab) */
async function getBiodataBiodataShell(idBiodata) {
  const input = String(idBiodata || "").trim();
  if (!input) return null;
  const id = await resolveBiodataInputId(input);

  let personal = await getByField("personal", "id_biodata", id);
  if (!personal) return null;

  const sektor = getKodeSektorFromBiodataId(id);
  const [sektorInfo, menuTabs] = await Promise.all([
    getDatasektorByKode(sektor),
    getMenuMappingBySektor(sektor),
  ]);

  await reconcilePersonalStatus(id, {
    changedBy: "system",
    alasan: "Otomatis: sinkron saat buka biodata",
  });
  personal = await getByField("personal", "id_biodata", id);

  const [biodataFlow, kelengkapan] = await Promise.all([
    computeBiodataFlowProgress(id, menuTabs),
    getBiodataKelengkapanFlags(id),
  ]);

  return {
    personal,
    sektor: sektorInfo,
    menuTabs,
    biodataFlow,
    kelengkapan,
  };
}

/** Shell ringan detail administrasi — personal + progress alur tahap */
async function getBiodataAdminShell(idBiodata) {
  const input = String(idBiodata || "").trim();
  if (!input) return null;
  const id = await resolveBiodataInputId(input);

  let personal = await getByField("personal", "id_biodata", id);
  if (!personal) return null;

  await reconcilePersonalStatus(id, {
    changedBy: "system",
    alasan: "Otomatis: sinkron saat buka administrasi",
  });
  personal = await getByField("personal", "id_biodata", id);

  const sektor = getKodeSektorFromBiodataId(id);
  const sektorInfo = await getDatasektorByKode(sektor);
  const adminFlow = await computeAdminFlowProgress(id);

  return { personal, sektor: sektorInfo, adminFlow };
}

/** Muat data per tab biodata saat dibuka (lazy) */
async function getBiodataBiodataSection(idBiodata, section) {
  const id = String(idBiodata || "").trim();
  if (!id) return null;
  const key = normalizeBiodataTabKey(section);

  if (BIODATA_UPLOAD_MENU_KEYS.has(key)) {
    return {};
  }

  if (key === "personal") {
    let personal = await getByField("personal", "id_biodata", id);
    if (!personal) return null;
    await reconcilePersonalStatus(id, {
      changedBy: "system",
      alasan: "Otomatis: sinkron tab personal",
    });
    personal = await getByField("personal", "id_biodata", id);
    return { personal };
  }

  const listTables = {
    working: "working",
    pengalaman: "pengalaman",
    pptk: "pptk",
    tugas: "tugas",
    interview_teto: "interview_teto",
  };
  if (listTables[key]) {
    const table = listTables[key];
    if (table === "working") {
      const rows = await enrichWorkingRows(await listByIdBiodata(table, id));
      return { [key]: rows };
    }
    return { [key]: await listByIdBiodata(table, id) };
  }

  if (key === "skillcondition" || key === "experience") {
    const rows = await listByIdBiodata("skillcondition", id);
    return { skillcondition: rows[0] || null };
  }
  if (key === "request") {
    const rows = await listByIdBiodata("request", id);
    const rec = rows[0] ? await enrichRequestRecord(rows[0]) : null;
    return { request: rec };
  }
  if (key === "vaksin") {
    const rows = await listByIdBiodata("vaksin", id);
    const rec = rows[0] ? await enrichVaksinRecord(rows[0]) : null;
    return { vaksin: rec };
  }

  if (key === "interview") {
    const rows = await listByIdBiodata("interview", id);
    return { interview: rows[0] || null };
  }
  if (key === "kettugas") {
    const rows = await listByIdBiodata("kettugas", id);
    return { kettugas: rows[0] || null };
  }

  if (key === "family") {
    return { family: await getByField("family", "id_biodata", id) };
  }
  if (key === "dokumen") {
    const dokumenRaw = await getByField("dokumen", "id_biodata", id);
    return { dokumen: await enrichDokumenForBiodataDetail(id, dokumenRaw) };
  }

  throw new Error(`Section biodata "${section}" tidak dikenali`);
}

/** Muat data per tab administrasi saat dibuka (lazy) */
async function getBiodataAdminSection(idBiodata, section) {
  const id = String(idBiodata || "").trim();
  if (!id) return null;
  const key = String(section || "")
    .trim()
    .toLowerCase();

  switch (key) {
    case "fiskal":
    case "upload":
      return {};
    case "keadaan_tki":
      return { keadaanTki: await listByIdBiodata("admin_keadaan_tki", id) };
    case "disnaker":
      return { disnaker: await getByField("disnaker", "id_biodata", id) };
    case "medical":
      return { medical: await getByField("medical", "id_biodata", id) };
    case "medical2":
      return { medical2: await getByField("medical2", "id_biodata", id) };
    case "medical3":
      return { medical3: await getByField("medical3", "id_biodata", id) };
    case "paspor":
      return { paspor: await getByField("paspor", "id_biodata", id) };
    case "pasporlama":
      return { pasporlama: await getByField("pasporlama", "id_biodata", id) };
    case "skck":
      return { skck: await getByField("skck", "id_biodata", id) };
    case "skckpolres":
      return { skckPolres: await getByField("skck_polres", "id_biodata", id) };
    case "legalitas":
      return {
        legalitas: await getByField("legalitas", "id_biodata", id),
        notarisan: await getByField("notarisan", "id_biodata", id),
      };
    case "visa":
      return { visa: await getByField("visa", "id_biodata", id) };
    case "pap":
      return { pap: await getByField("pap", "id_biodata", id) };
    case "signingbank":
      return { signingbank: await getByField("signingbank", "id_biodata", id) };
    case "bukarekening":
      return {
        bukaRekening: await require("./services/buka-rekening-tki-service").fetchForBiodata(
          getDbApi(),
          id,
        ),
      };
    case "asuransihotel":
      return {
        asuransiHotel: await getByField("asuransi_dan_hotel", "id_biodata", id),
      };
    case "isichongyi":
      return { isichongyi: await getByField("isichongyi", "id_biodata", id) };
    case "majikan":
      return {
        majikan: await getByField("majikan", "id_biodata", id),
        majikanKriteria: await listByIdBiodata(
          "majikan_kriteria_pekerjaan",
          id,
        ),
      };
    case "markawal":
      await ensureMarkProgressForTki(id);
      return {
        marka: await getByField("marka", "id_biodata", id),
        markaBiotoagen: await listByIdBiodata("marka_biotoagen", id),
        markb: await getByField("markb", "id_biodata", id),
        markc: await getByField("markc", "id_biodata", id),
        marke: await getByField("marke", "id_biodata", id),
        markf: await getByField("markf", "id_biodata", id),
        markg: await getByField("markg", "id_biodata", id),
      };
    default:
      throw new Error(`Section administrasi "${section}" tidak dikenali`);
  }
}

/** Dispatcher lazy load per scope: marketing | biodata | admin */
async function getBiodataSection(idBiodata, scope, section) {
  const id = await resolveBiodataInputId(idBiodata);
  if (!id) return null;
  const s = String(scope || "marketing")
    .trim()
    .toLowerCase();
  if (s === "biodata") return getBiodataBiodataSection(id, section);
  if (s === "admin") return getBiodataAdminSection(id, section);
  if (s === "marketing") return getBiodataMarketingSection(id, section);
  throw new Error(`Scope section "${scope}" tidak dikenali`);
}

/** Muat data per tab marketing saat dibuka (lazy) */
async function getBiodataMarketingSection(idBiodata, section) {
  const id = String(idBiodata || "").trim();
  if (!id) return null;
  const key = String(section || "")
    .trim()
    .toLowerCase();

  switch (key) {
    case "ringkasan":
      return getBiodataMarketingShell(id);
    case "markawal":
      await ensureMarkProgressForTki(id);
      return {
        marka: await getByField("marka", "id_biodata", id),
        markaBiotoagen: await listByIdBiodata("marka_biotoagen", id),
        markb: await getByField("markb", "id_biodata", id),
        markc: await getByField("markc", "id_biodata", id),
        marke: await getByField("marke", "id_biodata", id),
        markf: await getByField("markf", "id_biodata", id),
        markg: await getByField("markg", "id_biodata", id),
      };
    case "majikan":
      return {
        majikan: await getByField("majikan", "id_biodata", id),
        majikanKriteria: await listByIdBiodata(
          "majikan_kriteria_pekerjaan",
          id,
        ),
      };
    case "visa":
      return {
        visa: await getByField("visa", "id_biodata", id),
      };
    case "checklist":
      return {
        uploadSummary: await getUploadSummaryForBiodata(id),
      };
    default:
      throw new Error(`Section marketing "${section}" tidak dikenali`);
  }
}

// Ringkasan biodata satu TKI (personal + relasi inti)
async function resolveBiodataMasterLabels({
  personal,
  majikan,
  markaBiotoagen,
}) {
  const p = personal || {};
  const m = majikan || {};
  const bioAgen =
    Array.isArray(markaBiotoagen) && markaBiotoagen.length
      ? markaBiotoagen[0]
      : null;

  const sponsorKode = String(p.kode_sponsor || "").trim();
  const agenKode = String(bioAgen?.kode_agen || m.kode_agen || "").trim();
  const groupKode = String(bioAgen?.grup_to_agen || m.kode_group || "").trim();

  const [sponsorRow, agenRow, groupRow] = await Promise.all([
    sponsorKode ? getByField("datasponsor", "kode_sponsor", sponsorKode) : null,
    agenKode ? getByField("dataagen", "kode_agen", agenKode) : null,
    groupKode ? getByField("datagroup", "kode_group", groupKode) : null,
  ]);

  const sponsorLabel = sponsorRow?.isi || sponsorKode;
  return {
    sponsor: sponsorLabel,
    pl: sponsorLabel,
    agen: agenRow?.nama || agenKode,
    group: groupRow?.nama || groupKode,
  };
}

async function getBiodataDetail(idBiodata) {
  const input = String(idBiodata || "").trim();
  if (!input) return null;
  const id = await resolveBiodataInputId(input);

  let personal = await getByField("personal", "id_biodata", id);
  if (!personal) return null;

  const [
    family,
    dokumenRaw,
    disnaker,
    medical,
    medical2,
    medical3,
    paspor,
    pasporlama,
    majikan,
    visa,
    skck,
    skckPolres,
    signingbank,
    legalitas,
    notarisan,
    bukaRekening,
    asuransiHotel,
    isichongyi,
    pap,
    bankTki,
    marka,
    markaBiotoagen,
    markb,
    markc,
    marke,
    markf,
    markg,
    markonline,
    majikanKriteria,
    working,
    skillcondition,
    pengalaman,
    request,
    pptk,
    tugas,
    kettugas,
    interview,
    interviewTeto,
    vaksin,
    keadaanTki,
    uploadArc,
    uploadKeterangan,
  ] = await Promise.all([
    getByField("family", "id_biodata", id),
    getByField("dokumen", "id_biodata", id),
    getByField("disnaker", "id_biodata", id),
    getByField("medical", "id_biodata", id),
    getByField("medical2", "id_biodata", id),
    getByField("medical3", "id_biodata", id),
    getByField("paspor", "id_biodata", id),
    getByField("pasporlama", "id_biodata", id),
    getByField("majikan", "id_biodata", id),
    getByField("visa", "id_biodata", id),
    getByField("skck", "id_biodata", id),
    getByField("skck_polres", "id_biodata", id),
    getByField("signingbank", "id_biodata", id),
    getByField("legalitas", "id_biodata", id),
    getByField("notarisan", "id_biodata", id),
    require("./services/buka-rekening-tki-service").fetchForBiodata(getDbApi(), id),
    getByField("asuransi_dan_hotel", "id_biodata", id),
    getByField("isichongyi", "id_biodata", id),
    getByField("pap", "id_biodata", id),
    getByField("bank", "id_biodata", id),
    getByField("marka", "id_biodata", id),
    listByIdBiodata("marka_biotoagen", id),
    getByField("markb", "id_biodata", id),
    getByField("markc", "id_biodata", id),
    getByField("marke", "id_biodata", id),
    getByField("markf", "id_biodata", id),
    getByField("markg", "id_biodata", id),
    getByField("markonline", "id_biodata", id),
    listByIdBiodata("majikan_kriteria_pekerjaan", id),
    listByIdBiodata("working", id),
    listByIdBiodata("skillcondition", id),
    listByIdBiodata("pengalaman", id),
    listByIdBiodata("request", id),
    listByIdBiodata("pptk", id),
    listByIdBiodata("tugas", id),
    listByIdBiodata("kettugas", id),
    listByIdBiodata("interview", id),
    listByIdBiodata("interview_teto", id),
    listByIdBiodata("vaksin", id),
    listByIdBiodata("admin_keadaan_tki", id),
    listByIdBiodata("upload_arc", id),
    listByIdBiodata("upload_keterangan", id),
  ]);

  const dokumen = await enrichDokumenForBiodataDetail(id, dokumenRaw);

  const interviewRecord =
    Array.isArray(interview) && interview.length > 0 ? interview[0] : null;
  const kettugasRecord =
    Array.isArray(kettugas) && kettugas.length > 0 ? kettugas[0] : null;
  const skillconditionRecord =
    Array.isArray(skillcondition) && skillcondition.length > 0
      ? skillcondition[0]
      : null;
  const requestRaw =
    Array.isArray(request) && request.length > 0 ? request[0] : null;
  const requestRecord = requestRaw
    ? await enrichRequestRecord(requestRaw)
    : null;
  const vaksinRaw =
    Array.isArray(vaksin) && vaksin.length > 0 ? vaksin[0] : null;
  const vaksinRecord = vaksinRaw ? await enrichVaksinRecord(vaksinRaw) : null;
  const workingEnriched = await enrichWorkingRows(working);

  const sektor = getKodeSektorFromBiodataId(id);
  const sektorInfo = await getDatasektorByKode(sektor);
  const menuTabs = await getMenuMappingBySektor(sektor);

  await reconcilePersonalStatus(id, {
    changedBy: "system",
    alasan: "Otomatis: sinkron saat buka biodata",
  });
  personal = await getByField("personal", "id_biodata", id);

  const masterLabels = await resolveBiodataMasterLabels({
    personal,
    majikan,
    markaBiotoagen,
  });
  const chongyiBiodata = await isChongyiMajikanForBiodata({ majikan });

  return {
    personal,
    sektor: sektorInfo,
    masterLabels,
    printFlags: {
      chongyiBiodata,
    },
    family,
    dokumen,
    disnaker,
    medical,
    medical2,
    medical3,
    paspor,
    pasporlama,
    majikan,
    visa,
    skck,
    skckPolres,
    signingbank,
    legalitas,
    notarisan,
    bukaRekening,
    asuransiHotel,
    isichongyi,
    pap,
    bankTki,
    marka,
    markaBiotoagen,
    markb,
    markc,
    marke,
    markf,
    markg,
    markonline,
    majikanKriteria,
    working: workingEnriched,
    skillcondition: skillconditionRecord,
    pengalaman,
    request: requestRecord,
    pptk,
    tugas,
    kettugas: kettugasRecord,
    interview: interviewRecord,
    interview_teto: interviewTeto,
    vaksin: vaksinRecord,
    keadaanTki,
    uploads: {
      arc: uploadArc,
      keterangan: uploadKeterangan,
    },
    menuTabs,
  };
}

// Auth: cari user by email
async function findUserByEmail(email) {
  const row = await q(
    db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)"),
    "get",
    email,
  );
  return normalizeRow(row);
}

/** Akun admin utama — hanya jika ENSURE_PRIMARY_ADMIN=true (dev); pakai env ADMIN_* */
async function ensurePrimaryAdmin() {
  if (process.env.ENSURE_PRIMARY_ADMIN !== "true") {
    return null;
  }
  const branding = appConfig.getAppConfig();
  const email = branding.adminEmail;
  const plain = branding.adminPassword || "12345678";
  const hash = bcrypt.hashSync(plain, 10);
  const existing = await findUserByEmail(email);
  if (existing) {
    await updateUserPassword(existing.id, hash);
    if (existing.status !== "active") {
      await update(
        "users",
        existing.id,
        { status: "active" },
        { skipAudit: true },
      );
    }
    return existing;
  }
  return create(
    "users",
    {
      name: branding.adminName,
      email,
      role: "admin",
      phone: "",
      password: hash,
      status: "active",
    },
    { skipAudit: true },
  );
}

/** Jumlah baris per tabel cetak batch (legacy print_data hitung1–6 dan terkait) */
async function getPrintDataStats() {
  const tables = [
    "pembuatan_tabelpap",
    "pembuatan_tabelktkln",
    "pembuatan_tabelhapap",
    "pembuatan_tabeldis",
    "pembuatan_tabeldis2",
    "pembuatan_tabeldis3",
    "pembuatan_laporan",
    "surat_pengajuan",
    "pembuatan_tabungan",
    "pembuatan_ijin",
    "pembuatan_opp",
    "pembatalan_opp",
    "pembatalan_opp_sidoarjo",
    "majikan_spbg",
    "pembatalan_pp",
    "pembatalan_gabungan",
    "berita_acara_ntb",
    "srat_jalan_ntb",
    "leg_pk",
    "penghapusan_pp",
    "pplk",
    "pembuatan_paspor",
    "pembuatan_paspor_malang_print",
    "surat_pernyataan_malang",
    "spl_cost",
    "rekap_kabur_interminate_ambil_dok",
  ];
  const allowed = new Set(getTableNames());
  const stats = {};
  for (const table of tables) {
    if (!allowed.has(table)) continue;
    try {
      const row = await q(
        db.prepare(`SELECT COUNT(*) as c FROM "${table}"`),
        "get",
      );
      stats[table] = Number(row?.c || 0);
    } catch {
      stats[table] = 0;
    }
  }
  return stats;
}

const TKI_REPORT_KEYS = new Set([
  "daftar",
  "medical",
  "medical-belum-terbang",
  "majikan-md",
  "dokumen",
  "marketing-pipeline",
  "marketing-penempatan",
  "marketing-visa",
]);

function sanitizeTkiReportBranch(kodeCabang) {
  const branch = kodeCabang ? String(kodeCabang).trim() : "";
  if (!branch) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(branch)) {
    throw new Error("Kode cabang tidak valid");
  }
  return branch;
}

function parseTkiReportSort(sortRaw, allowed, fallback = "id_biodata") {
  const allowedSet = new Set(allowed);
  const parts = String(sortRaw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const part of parts) {
    const [colRaw, dirRaw] = part.split(":");
    const col = String(colRaw || "").trim();
    if (!allowedSet.has(col)) continue;
    const dir =
      String(dirRaw || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
    out.push(`"${col}" ${dir}`);
  }
  if (!out.length && allowedSet.has(fallback)) {
    out.push(`"${fallback}" ASC`);
  }
  return out.length
    ? `ORDER BY ${out.join(", ")}`
    : `ORDER BY "${fallback}" ASC`;
}

/** ORDER BY laporan matriks — pakai ekspresi SQL, bukan alias (kompatibel PostgreSQL) */
function parseTkiReportMatrixSort(
  sortRaw,
  matrixParts,
  fallback = "kode",
  defaultOrder = "asc",
) {
  const {
    exNonExSql,
    disnakerSql,
    medicalSql,
    pasporSql,
    agenSql,
    sponsorSql,
    majikanSql,
    papSql,
    visaSql,
    mdSql,
  } = matrixParts;
  const columnMap = {
    id_tki: tkiReportUsesDatatki() ? "dt.id_tki" : "p.id_tki",
    kode: "p.id_biodata",
    nama: "p.nama",
    alamat: "p.alamat",
    jeniskelamin: "p.jeniskelamin",
    negara1: "p.negara1",
    statusaktif: "p.statusaktif",
    tanggaldaftar: "p.tanggaldaftar",
    ex_non_ex: exNonExSql,
    disnaker: `COALESCE(${disnakerSql}, '-')`,
    medical: `COALESCE(${medicalSql}, '-')`,
    paspor: `COALESCE(${pasporSql}, '-')`,
    agen: `COALESCE(${agenSql}, '-')`,
    sponsor: `COALESCE(${sponsorSql}, '-')`,
    majikan: `COALESCE(${majikanSql}, '-')`,
    pap: `COALESCE(${papSql}, '-')`,
    visa: `COALESCE(${visaSql}, '-')`,
    md: `COALESCE(${mdSql}, '-')`,
  };
  const allowedSet = new Set(Object.keys(columnMap));
  const parts = String(sortRaw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const part of parts) {
    const [colRaw, dirRaw] = part.split(":");
    const col = String(colRaw || "").trim();
    if (!allowedSet.has(col)) continue;
    const dir =
      String(dirRaw || defaultOrder || "asc").toLowerCase() === "desc"
        ? "DESC"
        : "ASC";
    out.push(`${columnMap[col]} ${dir}`);
  }
  const fb = allowedSet.has(fallback) ? fallback : "kode";
  if (!out.length) {
    const dir =
      String(defaultOrder || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
    out.push(`${columnMap[fb]} ${dir}`);
  }
  return `ORDER BY ${out.join(", ")}`;
}

function parseCsvFilter(val) {
  if (val == null || val === "") return [];
  if (Array.isArray(val))
    return val.map((v) => String(v).trim()).filter(Boolean);
  return String(val)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function mergeFilterValues(single, multi) {
  const arr = [...parseCsvFilter(multi)];
  const one = String(single || "").trim();
  if (one && !arr.includes(one)) arr.unshift(one);
  return arr;
}

function appendInFilter(where, params, columnExpr, values) {
  const vals = parseCsvFilter(values);
  if (!vals.length) return;
  if (vals.length === 1) {
    where.push(`${columnExpr} = ?`);
    params.push(vals[0]);
    return;
  }
  where.push(`${columnExpr} IN (${vals.map(() => "?").join(", ")})`);
  vals.forEach((v) => params.push(v));
}

function pickTkiReportFilterOptions(options = {}) {
  return {
    search: options.search,
    sektorPrefix: options.sektorPrefix,
    sektorPrefixes: options.sektorPrefixes,
    stageKey: options.stageKey,
    stageKeys: options.stageKeys,
    jeniskelamin: options.jeniskelamin,
    statusaktif: options.statusaktif,
    kodeCabang: options.kodeCabang,
  };
}

function tkiReportUsesDatatki() {
  return getTableNames().includes("datatki");
}

function buildTkiReportBaseFrom(pAlias = "p", dtAlias = "dt") {
  if (tkiReportUsesDatatki()) {
    return `FROM datatki ${dtAlias} INNER JOIN personal ${pAlias} ON ${pAlias}.id_biodata = ${dtAlias}.id_biodata AND COALESCE(${pAlias}.is_active, 1) = 1`;
  }
  return `FROM personal ${pAlias}`;
}

function pickTkiReportFilterContext(extraSearchExprs = []) {
  const useDt = tkiReportUsesDatatki();
  const searchExprs = useDt
    ? [
        "dt.id_tki LIKE ?",
        "dt.id_biodata LIKE ?",
        "p.nama LIKE ?",
        ...extraSearchExprs,
      ]
    : ["p.id_biodata LIKE ?", "p.nama LIKE ?", ...extraSearchExprs];
  return {
    alias: "p",
    datatkiAlias: useDt ? "dt" : null,
    searchExprs,
  };
}

function buildTkiReportChartFilters(options = {}) {
  return buildTkiReportFilters({
    ...pickTkiReportFilterOptions(options),
    ...pickTkiReportFilterContext([]),
    search: "",
  });
}

function tkiReportChartSektorExpr() {
  if (tkiReportUsesDatatki()) return "dt.kode_sektor";
  return isPostgres() ? "LEFT(p.id_biodata, 2)" : "substr(p.id_biodata, 1, 2)";
}

function tkiReportChartDistinctCol() {
  return tkiReportUsesDatatki() ? "dt.id_tki" : "p.id_biodata";
}

function buildTkiReportFilters({
  search,
  sektorPrefix,
  sektorPrefixes,
  kodeCabang,
  stageKey,
  stageKeys,
  jeniskelamin,
  statusaktif,
  alias = "p",
  datatkiAlias = null,
  searchExprs = null,
}) {
  const where = [];
  const params = [];
  const branch = sanitizeTkiReportBranch(kodeCabang);
  const branchCol = datatkiAlias
    ? `${datatkiAlias}.kode_cabang`
    : `${alias}.kode_cabang`;
  if (branch) {
    where.push(`${branchCol} = ?`);
    params.push(branch);
  }
  const prefixes = mergeFilterValues(sektorPrefix, sektorPrefixes)
    .map((p) => String(p).trim().toUpperCase())
    .filter(Boolean);
  const sektorCol = datatkiAlias ? `${datatkiAlias}.kode_sektor` : null;
  if (prefixes.length === 1) {
    if (sektorCol) {
      where.push(`${sektorCol} = ?`);
      params.push(prefixes[0]);
    } else {
      where.push(`${alias}.id_biodata LIKE ?`);
      params.push(`${prefixes[0]}%`);
    }
  } else if (prefixes.length > 1) {
    if (sektorCol) {
      where.push(`(${prefixes.map(() => `${sektorCol} = ?`).join(" OR ")})`);
      prefixes.forEach((p) => params.push(p));
    } else {
      where.push(
        `(${prefixes.map(() => `${alias}.id_biodata LIKE ?`).join(" OR ")})`,
      );
      prefixes.forEach((p) => params.push(`${p}%`));
    }
  }
  const stageSql = buildMultiStageFilterSql(
    mergeFilterValues(stageKey, stageKeys),
    `${alias}.id_biodata`,
  );
  if (stageSql) where.push(stageSql);
  appendInFilter(where, params, `${alias}.jeniskelamin`, jeniskelamin);
  appendInFilter(
    where,
    params,
    datatkiAlias ? `${datatkiAlias}.statusaktif` : `${alias}.statusaktif`,
    statusaktif,
  );
  const q = String(search || "").trim();
  if (q) {
    const exprs =
      searchExprs ||
      (datatkiAlias
        ? [
            `${datatkiAlias}.id_tki LIKE ?`,
            `${datatkiAlias}.id_biodata LIKE ?`,
            `${alias}.nama LIKE ?`,
          ]
        : [`${alias}.id_biodata LIKE ?`, `${alias}.nama LIKE ?`]);
    where.push(`(${exprs.join(" OR ")})`);
    exprs.forEach(() => params.push(`%${q}%`));
  }
  return {
    whereClause: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

/** Filter laporan matriks berdasarkan tahap/kondisi TKI (MD, medical, EX, dll.) */
function buildTkiReportStageFilterSql(stageKey, biodataCol = "p.id_biodata") {
  const key = String(stageKey || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  const tables = getTableNames();

  const existsIn = (table, extraWhere = "") => {
    if (!tables.includes(table)) return "1=0";
    const w = extraWhere ? ` AND ${extraWhere}` : "";
    return `EXISTS (SELECT 1 FROM "${table}" t WHERE t.id_biodata = ${biodataCol}${w})`;
  };

  switch (key) {
    case "md":
      if (
        !tables.includes("admin_keadaan_tki") ||
        !tables.includes("admin_keadaan_tki_pilihan")
      ) {
        return "1=0";
      }
      return `EXISTS (
        SELECT 1 FROM admin_keadaan_tki a
        INNER JOIN admin_keadaan_tki_pilihan k ON k.id = a.keadaan_id
        WHERE a.id_biodata = ${biodataCol} AND UPPER(TRIM(k.nama)) = 'MD'
      )`;
    case "medical":
      return existsIn("medical");
    case "disnaker":
      return existsIn("disnaker");
    case "paspor":
      return existsIn("paspor");
    case "majikan":
      return existsIn("majikan");
    case "pap":
      return existsIn("pap");
    case "visa":
      return existsIn(
        "visa",
        `(NULLIF(TRIM(t.tanggalterbang), '') IS NOT NULL
          OR NULLIF(TRIM(t.novisa), '') IS NOT NULL
          OR NULLIF(TRIM(t.tglberlaku), '') IS NOT NULL
          OR NULLIF(TRIM(t.tglberangkat), '') IS NOT NULL)`,
      );
    case "markawal":
      return existsIn(
        "marka",
        `(NULLIF(TRIM(t.status), '') IS NOT NULL OR NULLIF(TRIM(t.tanggal), '') IS NOT NULL)`,
      );
    case "suhan":
      return existsIn(
        "majikan",
        `(NULLIF(TRIM(t.kode_suhan), '') IS NOT NULL)`,
      );
    case "pekerjaan":
      return existsIn("majikan", `(NULLIF(TRIM(t.pekerjaan), '') IS NOT NULL)`);
    case "visa_permit":
      return existsIn(
        "majikan",
        `(NULLIF(TRIM(t.kode_visapermit), '') IS NOT NULL)`,
      );
    case "agen": {
      const parts = [];
      if (tables.includes("marka_biotoagen")) {
        parts.push(
          `EXISTS (SELECT 1 FROM marka_biotoagen b WHERE b.id_biodata = ${biodataCol} AND NULLIF(TRIM(b.kode_agen), '') IS NOT NULL)`,
        );
      }
      if (tables.includes("majikan")) {
        parts.push(
          `EXISTS (SELECT 1 FROM majikan m WHERE m.id_biodata = ${biodataCol} AND NULLIF(TRIM(m.kode_agen), '') IS NOT NULL)`,
        );
      }
      return parts.length ? `(${parts.join(" OR ")})` : "1=0";
    }
    case "ex":
      return `${buildTkiExNonExSql(biodataCol)} = 'EX'`;
    case "non_ex":
      return `${buildTkiExNonExSql(biodataCol)} = 'NON EX'`;
    case "dokumen_lengkap": {
      if (!getTableNames().includes("dokumen")) return "1=0";
      const all = DOKUMEN_IDENTITAS_FIELDS.map((f) =>
        sqlDokumenFieldHasFile("d", f),
      ).join(" AND ");
      return `EXISTS (SELECT 1 FROM dokumen d WHERE d.id_biodata = ${biodataCol} AND ${all})`;
    }
    case "dokumen_belum": {
      if (!getTableNames().includes("dokumen")) return "1=1";
      const all = DOKUMEN_IDENTITAS_FIELDS.map((f) =>
        sqlDokumenFieldHasFile("d", f),
      ).join(" AND ");
      return `NOT EXISTS (SELECT 1 FROM dokumen d WHERE d.id_biodata = ${biodataCol} AND ${all})`;
    }
    case "dokumen_ada": {
      if (!getTableNames().includes("dokumen")) return "1=0";
      const any = DOKUMEN_IDENTITAS_FIELDS.map((f) =>
        sqlDokumenFieldHasFile("d", f),
      ).join(" OR ");
      return `EXISTS (SELECT 1 FROM dokumen d WHERE d.id_biodata = ${biodataCol} AND (${any}))`;
    }
    default:
      return null;
  }
}

/** Ekspresi SQL: kolom dokumen berisi file upload valid */
function sqlDokumenFieldHasFile(alias, field) {
  const c = `${alias}.${field}`;
  return `(${c} IS NOT NULL AND TRIM(${c}) != ''
    AND LOWER(${c}) NOT LIKE '%profile.jpg'
    AND LOWER(${c}) NOT LIKE '%profile.png'
    AND (LOWER(${c}) LIKE '/uploads/%' OR LOWER(${c}) LIKE '/data/uploads/%' OR LOWER(${c}) LIKE 'http%'))`;
}

function buildDokumenCountExpr(alias = "d") {
  return DOKUMEN_IDENTITAS_FIELDS.map(
    (f) => `CASE WHEN ${sqlDokumenFieldHasFile(alias, f)} THEN 1 ELSE 0 END`,
  ).join(" + ");
}

async function batchLatestUploadFiles(uploadTable, ids) {
  const list = (ids || []).map((id) => String(id || "").trim()).filter(Boolean);
  if (!list.length || !getTableNames().includes(uploadTable)) return {};
  const placeholders = list.map(() => "?").join(", ");
  try {
    const rows = normalizeRows(
      await dbAllRows(
        `SELECT id_biodata, file, id FROM "${uploadTable}"
         WHERE id_biodata IN (${placeholders})
           AND file IS NOT NULL AND TRIM(file) != ''
         ORDER BY id_biodata ASC, id DESC`,
        ...list,
      ),
    );
    const map = {};
    rows.forEach((row) => {
      const bid = String(row.id_biodata || "").trim();
      if (!bid || map[bid]) return;
      map[bid] = String(row.file || "").trim();
    });
    return map;
  } catch {
    return {};
  }
}

async function enrichTkiReportDokumenRows(rows) {
  if (!rows?.length) return rows;
  const total = REPORT_DOKUMEN_FIELDS.length;
  const ids = rows.map((r) => r.id_biodata).filter(Boolean);
  const uploadMaps = {};
  const uploadTables = [
    ...new Set(
      REPORT_DOKUMEN_FIELDS.filter((f) => f.upload).map((f) => f.upload),
    ),
  ];
  for (const tbl of uploadTables) {
    uploadMaps[tbl] = await batchLatestUploadFiles(tbl, ids);
  }

  for (const row of rows) {
    const id = String(row.id_biodata || "").trim();
    let ada = 0;
    for (const field of REPORT_DOKUMEN_FIELDS) {
      let has = false;
      if (field.upload && uploadMaps[field.upload]?.[id]) {
        const uploadVal = uploadMaps[field.upload][id];
        if (uploadVal && !isPlaceholderDokumenPath(uploadVal)) has = true;
      }
      if (!has && row[field.key] && !isPlaceholderDokumenPath(row[field.key]))
        has = true;
      row[`doc_${field.key}`] = has ? "Ada" : "Kosong";
      if (has) ada += 1;
    }
    row.jumlah_ada = ada;
    row.jumlah_total = total;
    row.kelengkapan = `${ada}/${total}`;
    row.persen_lengkap = total ? `${Math.round((ada / total) * 100)}%` : "0%";
  }
  return rows;
}

/** Laporan TKI — detail kelengkapan dokumen identitas per TKI */
async function listTkiReportDokumen(options = {}) {
  const tables = getTableNames();
  if (!tables.includes("personal")) {
    return {
      data: [],
      pagination: { page: 1, perPage: 10, total: 0, totalPages: 0 },
    };
  }
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const perPage = Math.max(1, parseInt(options.perPage, 10) || 10);
  const offset = (page - 1) * perPage;
  const { whereClause, params } = buildTkiReportFilters({
    ...pickTkiReportFilterOptions(options),
    ...pickTkiReportFilterContext(["p.negara1 LIKE ?"]),
  });
  const hasDokumen = tables.includes("dokumen");
  const jumlahAdaExpr = hasDokumen ? buildDokumenCountExpr("d") : "0";
  const docSelectParts = hasDokumen
    ? DOKUMEN_IDENTITAS_FIELDS.map((f) => `d.${f} AS ${f}`).join(", ")
    : DOKUMEN_IDENTITAS_FIELDS.map((f) => `NULL AS ${f}`).join(", ");
  const joinClause = hasDokumen
    ? "LEFT JOIN dokumen d ON d.id_biodata = p.id_biodata"
    : "";
  const baseFrom = `
    ${buildTkiReportBaseFrom("p", "dt")}
    ${joinClause}
    ${whereClause}
  `;
  const countRow = await dbAllRows(
    `SELECT COUNT(*) as total ${baseFrom}`,
    ...params,
  );
  const total = Number(countRow?.[0]?.total || 0);
  const orderClause = parseTkiReportSort(
    options.sort,
    [
      "id_tki",
      "id_biodata",
      "nama",
      "jeniskelamin",
      "statusaktif",
      "kode_cabang",
      "negara1",
      "jumlah_ada",
    ],
    "jumlah_ada",
  );
  const idTkiSelect = tkiReportUsesDatatki() ? "dt.id_tki" : "p.id_tki";
  const data = normalizeRows(
    await dbAllRows(
      `SELECT ${idTkiSelect} AS id_tki, p.id_biodata, p.nama, p.jeniskelamin, p.statusaktif, p.kode_cabang, p.negara1,
              COALESCE(${jumlahAdaExpr}, 0) AS jumlah_ada,
              ${docSelectParts}
       ${baseFrom}
       ${orderClause}
       LIMIT ${perPage} OFFSET ${offset}`,
      ...params,
    ),
  );
  await enrichTkiReportDokumenRows(data);
  return {
    data,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage) || 0,
    },
  };
}

function buildMultiStageFilterSql(stageKeys, biodataCol = "p.id_biodata") {
  const keys = parseCsvFilter(stageKeys)
    .map((k) => String(k).trim().toLowerCase())
    .filter(Boolean);
  if (!keys.length) return null;
  const parts = keys
    .map((k) => buildTkiReportStageFilterSql(k, biodataCol))
    .filter(Boolean);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : `(${parts.join(" OR ")})`;
}

/** Subquery nilai tahap proses terbaru per TKI (untuk laporan matriks) */
function buildLatestStageSql(
  table,
  valueExpr,
  extraJoin = "",
  extraWhere = "",
) {
  if (!getTableNames().includes(table)) return `'-'`;
  const join = extraJoin ? ` ${extraJoin}` : "";
  const where = extraWhere ? ` AND ${extraWhere}` : "";
  return `(SELECT ${valueExpr} FROM "${table}" t${join} WHERE t.id_biodata = p.id_biodata${where} ORDER BY t.id DESC LIMIT 1)`;
}

function coalesceTrimFields(...fields) {
  return `COALESCE(${fields.map((f) => `NULLIF(TRIM(${f}), '')`).join(", ")}, '-')`;
}

/** EX = punya paspor lama (pernah jadi TKI sebelumnya); NON EX = baru pertama kali */
function buildTkiExNonExSql(biodataCol = "p.id_biodata") {
  const tables = getTableNames();
  const parts = [];
  if (tables.includes("pasporlama")) {
    parts.push(
      `EXISTS (SELECT 1 FROM pasporlama pl WHERE pl.id_biodata = ${biodataCol} AND (
        NULLIF(TRIM(pl.nopaspor), '') IS NOT NULL
        OR NULLIF(TRIM(pl.office), '') IS NOT NULL
        OR NULLIF(TRIM(pl.tglterbit), '') IS NOT NULL
      ))`,
    );
  }
  if (tables.includes("upload_pasporlama")) {
    parts.push(
      `EXISTS (SELECT 1 FROM upload_pasporlama upl WHERE upl.id_biodata = ${biodataCol} AND NULLIF(TRIM(upl.file), '') IS NOT NULL)`,
    );
  }
  if (!parts.length) {
    return `'NON EX'`;
  }
  return `CASE WHEN ${parts.join(" OR ")} THEN 'EX' ELSE 'NON EX' END`;
}

/** Ringkasan dokumen identitas TKI untuk kolom laporan */
const REPORT_DOKUMEN_FIELDS = [
  { key: "ktp", label: "KTP", upload: "upload_ktp" },
  { key: "kk", label: "KK", upload: "upload_kk" },
  { key: "akte", label: "Akte", upload: "upload_aktelahir" },
  { key: "ijazah", label: "Ijazah", upload: "upload_ijasah" },
  { key: "si", label: "SI" },
  { key: "sn", label: "SN" },
  { key: "paspor", label: "Paspor", upload: "upload_pasporbaru" },
  { key: "arc", label: "ARC", upload: "upload_arc" },
  { key: "asuransi", label: "Asuransi" },
  { key: "medikal1", label: "Medikal1" },
  { key: "medikal2", label: "Medikal2" },
  { key: "medikal3", label: "Medikal3" },
  { key: "skck", label: "SKCK", upload: "upload_skck" },
  { key: "fingerprint", label: "Finger" },
  { key: "visa", label: "Visa" },
  { key: "pap", label: "PAP" },
];

async function summarizeReportDokumen(idBiodata) {
  const id = String(idBiodata || "").trim();
  if (!id) return "-";
  const tables = getTableNames();
  let doc = null;
  if (tables.includes("dokumen")) {
    try {
      doc = await getByField("dokumen", "id_biodata", id);
    } catch {
      doc = null;
    }
  }
  const owned = [];
  for (const field of REPORT_DOKUMEN_FIELDS) {
    let has = false;
    if (field.upload && tables.includes(field.upload)) {
      const uploadFile = await latestUploadFileForBiodata(field.upload, id);
      if (uploadFile) has = true;
    }
    if (!has && doc?.[field.key] && String(doc[field.key]).trim()) {
      has = true;
    }
    if (has) owned.push(field.label);
  }
  return owned.length ? owned.join(", ") : "-";
}

async function summarizeReportDokumenFromBatch(idBiodata, docRow, uploadCache) {
  const id = String(idBiodata || "").trim();
  if (!id) return "-";
  const tables = getTableNames();
  const owned = [];
  for (const field of REPORT_DOKUMEN_FIELDS) {
    let has = false;
    if (field.upload && tables.includes(field.upload)) {
      const uploadFile = uploadCache[`${field.upload}:${id}`] || "";
      if (uploadFile) has = true;
    }
    if (!has && docRow?.[field.key] && String(docRow[field.key]).trim()) {
      has = true;
    }
    if (has) owned.push(field.label);
  }
  return owned.length ? owned.join(", ") : "-";
}

async function enrichTkiReportMatrixRows(rows) {
  if (!rows?.length) return rows;
  const tables = getTableNames();
  const biodataCodes = rows.map(r => String(r.kode).trim()).filter(Boolean);
  
  if (!biodataCodes.length) return rows;
  
  // Batch 1: Fetch all dokumen records
  let allDocs = [];
  if (tables.includes("dokumen")) {
    try {
      const placeholders = biodataCodes.map(() => '?').join(',');
      allDocs = await dbAllRows(
        `SELECT id_biodata, ${REPORT_DOKUMEN_FIELDS.map(f => f.key).join(',')} 
         FROM dokumen 
         WHERE id_biodata IN (${placeholders})`,
        ...biodataCodes
      );
    } catch {
      allDocs = [];
    }
  }
  
  const docMap = new Map();
  normalizeRows(allDocs).forEach(doc => docMap.set(doc.id_biodata, doc));
  
  // Batch 2: Fetch all upload records
  const uploadCache = {};
  const uploadTables = [...new Set(REPORT_DOKUMEN_FIELDS.filter(f => f.upload).map(f => f.upload))];
  
  for (const uploadTable of uploadTables) {
    if (!tables.includes(uploadTable)) continue;
    try {
      const placeholders = biodataCodes.map(() => '?').join(',');
      const uploadRows = await dbAllRows(
        `SELECT id_biodata, file 
         FROM ${uploadTable} 
         WHERE id_biodata IN (${placeholders}) 
           AND file IS NOT NULL 
           AND TRIM(file) != ''`,
        ...biodataCodes
      );
      
      normalizeRows(uploadRows).forEach(row => {
        uploadCache[`${uploadTable}:${row.id_biodata}`] = String(row.file || '').trim();
      });
    } catch {
      // Skip if table doesn't exist or query fails
    }
  }
  
  // Enrich rows using cached data
  for (const row of rows) {
    const docRow = docMap.get(row.kode) || null;
    row.dokumen = await summarizeReportDokumenFromBatch(row.kode, docRow, uploadCache);
  }
  
  return rows;
}

function buildPersonalSponsorLabelSql() {
  const tables = getTableNames();
  if (tables.includes("datasponsor")) {
    return `(SELECT COALESCE(NULLIF(TRIM(d.isi), ''), NULLIF(TRIM(p.kode_sponsor), ''))
      FROM datasponsor d WHERE d.kode_sponsor = p.kode_sponsor LIMIT 1)`;
  }
  return `NULLIF(TRIM(p.kode_sponsor), '')`;
}

function buildLatestAgenLabelSql() {
  const tables = getTableNames();
  const parts = [];
  const agenLabelExpr = tables.includes("dataagen")
    ? `COALESCE(NULLIF(TRIM(d.nama), ''), NULLIF(TRIM(src.kode_agen), ''))`
    : `NULLIF(TRIM(src.kode_agen), '')`;
  if (tables.includes("marka_biotoagen")) {
    const join = tables.includes("dataagen")
      ? " LEFT JOIN dataagen d ON d.kode_agen = src.kode_agen"
      : "";
    parts.push(`(SELECT ${agenLabelExpr}
      FROM marka_biotoagen src${join}
      WHERE src.id_biodata = p.id_biodata
      ORDER BY src.id DESC LIMIT 1)`);
  }
  if (tables.includes("majikan")) {
    const join = tables.includes("dataagen")
      ? " LEFT JOIN dataagen d ON d.kode_agen = src.kode_agen"
      : "";
    parts.push(`(SELECT ${agenLabelExpr}
      FROM majikan src${join}
      WHERE src.id_biodata = p.id_biodata AND NULLIF(TRIM(src.kode_agen), '') IS NOT NULL
      ORDER BY src.id DESC LIMIT 1)`);
  }
  if (!parts.length) return `'-'`;
  if (parts.length === 1) return parts[0];
  return `COALESCE(${parts.join(", ")}, '-')`;
}

function buildTkiReportMatrixSelectParts() {
  const tables = getTableNames();
  const exNonExSql = buildTkiExNonExSql("p.id_biodata");
  const disnakerSql = buildLatestStageSql(
    "disnaker",
    coalesceTrimFields("t.nodisnaker", "t.tglonline"),
  );
  const medicalSql = buildLatestStageSql(
    "medical",
    coalesceTrimFields("t.tanggal", "t.jenismedical", "t.nomor"),
  );
  const pasporSql = buildLatestStageSql(
    "paspor",
    coalesceTrimFields("t.nopaspor", "t.tglterbit", "t.statuspengajuan"),
  );
  const agenSql = buildLatestAgenLabelSql();
  const sponsorSql = buildPersonalSponsorLabelSql();
  const majikanSql = buildLatestStageSql(
    "majikan",
    coalesceTrimFields(
      "t.namamajikan",
      "t.kode_majikan",
      "t.tglterpilih",
      "t.pekerjaan",
    ),
  );
  const papSql = buildLatestStageSql(
    "pap",
    coalesceTrimFields("t.nopap", "t.statuspap", "t.tgl_terima"),
  );
  const visaSql = buildLatestStageSql(
    "visa",
    coalesceTrimFields(
      "t.tanggalterbang",
      "t.tglberlaku",
      "t.tglsampai",
      "t.tglberangkat",
      "t.novisa",
    ),
  );
  let mdSql = `'-'`;
  if (
    tables.includes("admin_keadaan_tki") &&
    tables.includes("admin_keadaan_tki_pilihan")
  ) {
    mdSql = `(SELECT COALESCE(NULLIF(TRIM(a.keterangan), ''), 'MD')
      FROM admin_keadaan_tki a
      INNER JOIN admin_keadaan_tki_pilihan k ON k.id = a.keadaan_id
      WHERE a.id_biodata = p.id_biodata AND UPPER(TRIM(k.nama)) = 'MD'
      ORDER BY a.id DESC LIMIT 1)`;
  }
  return {
    exNonExSql,
    disnakerSql,
    medicalSql,
    pasporSql,
    agenSql,
    sponsorSql,
    majikanSql,
    papSql,
    visaSql,
    mdSql,
    selectSql: `
      ${tkiReportUsesDatatki() ? "dt.id_tki AS id_tki," : "p.id_tki AS id_tki,"}
      p.id_biodata AS kode,
      p.nama,
      p.alamat,
      p.jeniskelamin,
      p.negara1,
      p.statusaktif,
      p.tanggaldaftar,
      ${exNonExSql} AS ex_non_ex,
      COALESCE(${disnakerSql}, '-') AS disnaker,
      COALESCE(${medicalSql}, '-') AS medical,
      COALESCE(${pasporSql}, '-') AS paspor,
      COALESCE(${agenSql}, '-') AS agen,
      COALESCE(${sponsorSql}, '-') AS sponsor,
      COALESCE(${majikanSql}, '-') AS majikan,
      COALESCE(${papSql}, '-') AS pap,
      COALESCE(${visaSql}, '-') AS visa,
      COALESCE(${mdSql}, '-') AS md
    `,
  };
}

/** Laporan TKI — matriks daftar + EX/NON EX + tahap proses (Medical → PAP → Visa → MD) */
async function listTkiReportDaftar(options = {}) {
  const tables = getTableNames();
  if (!tables.includes("personal")) {
    return {
      data: [],
      pagination: { page: 1, perPage: 10, total: 0, totalPages: 0 },
    };
  }
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const perPage = Math.max(1, parseInt(options.perPage, 10) || 10);
  const offset = (page - 1) * perPage;
  const { whereClause, params } = buildTkiReportFilters({
    ...pickTkiReportFilterOptions(options),
    ...pickTkiReportFilterContext(["p.alamat LIKE ?", "p.negara1 LIKE ?"]),
  });
  const matrixParts = buildTkiReportMatrixSelectParts();
  const { selectSql } = matrixParts;
  const orderClause = parseTkiReportMatrixSort(
    options.sort,
    matrixParts,
    "kode",
    options.order || "asc",
  );
  const baseFrom = buildTkiReportBaseFrom("p", "dt");
  const countRow = await dbAllRows(
    `SELECT COUNT(*) as total ${baseFrom} ${whereClause}`,
    ...params,
  );
  const total = Number(countRow?.[0]?.total || 0);
  const data = normalizeRows(
    await dbAllRows(
      `SELECT ${selectSql}
       ${baseFrom}
       ${whereClause}
       ${orderClause}
       LIMIT ${perPage} OFFSET ${offset}`,
      ...params,
    ),
  );
  await enrichTkiReportMatrixRows(data);
  return {
    data,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage) || 0,
    },
  };
}

/** Laporan TKI — sudah medical */
async function listTkiReportMedical(options = {}) {
  const tables = getTableNames();
  if (!tables.includes("personal") || !tables.includes("medical")) {
    return {
      data: [],
      pagination: { page: 1, perPage: 10, total: 0, totalPages: 0 },
    };
  }
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const perPage = Math.max(1, parseInt(options.perPage, 10) || 10);
  const offset = (page - 1) * perPage;
  const { whereClause, params } = buildTkiReportFilters({
    ...pickTkiReportFilterOptions(options),
    ...pickTkiReportFilterContext([
      "p.notelp LIKE ?",
      "m.jenismedical LIKE ?",
      "m.nomor LIKE ?",
      "m.keterangan LIKE ?",
    ]),
  });
  const baseFrom = `
    ${buildTkiReportBaseFrom("p", "dt")}
    INNER JOIN medical m ON m.id_biodata = p.id_biodata
    ${whereClause}
  `;
  const countRow = await dbAllRows(
    `SELECT COUNT(*) as total ${baseFrom}`,
    ...params,
  );
  const total = Number(countRow?.[0]?.total || 0);
  const orderClause = parseTkiReportSort(
    options.sort,
    [
      "id_tki",
      "id_biodata",
      "nama",
      "jeniskelamin",
      "notelp",
      "negara1",
      "statusaktif",
      "kode_cabang",
      "tgl_medical",
      "jenismedical",
      "nomor_medical",
      "keterangan_medical",
    ],
    "tgl_medical",
  );
  const idTkiSelect = tkiReportUsesDatatki() ? "dt.id_tki" : "p.id_tki";
  const data = await dbAllRows(
    `SELECT ${idTkiSelect} AS id_tki, p.id_biodata, p.nama, p.jeniskelamin, p.notelp, p.negara1, p.statusaktif, p.kode_cabang,
            m.tanggal AS tgl_medical, m.jenismedical, m.nomor AS nomor_medical,
            m.keterangan AS keterangan_medical
     ${baseFrom}
     ${orderClause}
     LIMIT ${perPage} OFFSET ${offset}`,
    ...params,
  );
  return {
    data: normalizeRows(data),
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage) || 0,
    },
  };
}

/** Laporan TKI — sudah medical, belum terbang */
async function listTkiReportMedicalBelumTerbang(options = {}) {
  const tables = getTableNames();
  if (!tables.includes("personal") || !tables.includes("medical")) {
    return {
      data: [],
      pagination: { page: 1, perPage: 10, total: 0, totalPages: 0 },
    };
  }
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const perPage = Math.max(1, parseInt(options.perPage, 10) || 10);
  const offset = (page - 1) * perPage;
  const { whereClause, params } = buildTkiReportFilters({
    ...pickTkiReportFilterOptions(options),
    ...pickTkiReportFilterContext([
      "p.notelp LIKE ?",
      "p.statusaktif LIKE ?",
      "p.negara1 LIKE ?",
      "m.jenismedical LIKE ?",
      "m.nomor LIKE ?",
    ]),
  });
  const belumTerbangClause = whereClause
    ? `${whereClause} AND COALESCE(p.statterbang, 0) = 0`
    : "WHERE COALESCE(p.statterbang, 0) = 0";
  const baseFrom = `
    ${buildTkiReportBaseFrom("p", "dt")}
    INNER JOIN (
      SELECT id_biodata, MAX(tanggal) AS tgl_medical
      FROM medical
      GROUP BY id_biodata
    ) med ON med.id_biodata = p.id_biodata
    INNER JOIN medical m ON m.id_biodata = med.id_biodata AND m.tanggal = med.tgl_medical
    ${belumTerbangClause}
  `;
  const countRow = await dbAllRows(
    `SELECT COUNT(*) as total ${baseFrom}`,
    ...params,
  );
  const total = Number(countRow?.[0]?.total || 0);
  const orderClause = parseTkiReportSort(
    options.sort,
    [
      "id_tki",
      "id_biodata",
      "nama",
      "jeniskelamin",
      "notelp",
      "negara1",
      "statusaktif",
      "kode_cabang",
      "tgl_medical",
      "jenismedical",
      "nomor_medical",
    ],
    "tgl_medical",
  );
  const idTkiSelect = tkiReportUsesDatatki() ? "dt.id_tki" : "p.id_tki";
  const data = await dbAllRows(
    `SELECT ${idTkiSelect} AS id_tki, p.id_biodata, p.nama, p.jeniskelamin, p.notelp, p.negara1, p.statusaktif, p.kode_cabang,
            med.tgl_medical, m.jenismedical, m.nomor AS nomor_medical
     ${baseFrom}
     ${orderClause}
     LIMIT ${perPage} OFFSET ${offset}`,
    ...params,
  );
  return {
    data: normalizeRows(data),
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage) || 0,
    },
  };
}

/** Laporan TKI — terpilih majikan atau MD (alasan & keterangan) */
async function listTkiReportMajikanMd(options = {}) {
  const tables = getTableNames();
  if (!tables.includes("personal")) {
    return {
      data: [],
      pagination: { page: 1, perPage: 10, total: 0, totalPages: 0 },
    };
  }
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const perPage = Math.max(1, parseInt(options.perPage, 10) || 10);
  const offset = (page - 1) * perPage;
  const branch = sanitizeTkiReportBranch(options.kodeCabang);
  const prefix = String(options.sektorPrefix || "")
    .trim()
    .toUpperCase();
  const q = String(options.search || "").trim();

  const unionParts = [];
  const unionParams = [];

  if (tables.includes("majikan")) {
    const majWhere = ["p.statusaktif = ?"];
    const majParams = ["TERPILIH"];
    if (branch) {
      majWhere.push("p.kode_cabang = ?");
      majParams.push(branch);
    }
    if (prefix) {
      majWhere.push(
        "COALESCE(p.kode_sektor, SUBSTRING(p.id_biodata FROM POSITION('-' IN p.id_biodata)+1 FOR 2)) = ?",
      );
      majParams.push(prefix);
    }
    if (q) {
      majWhere.push(
        "(p.id_tki LIKE ? OR p.id_biodata LIKE ? OR p.nama LIKE ? OR m.namamajikan LIKE ?)",
      );
      majParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    unionParts.push(`
      SELECT p.id_tki, p.id_biodata, p.nama, p.jeniskelamin, p.notelp, p.negara1, p.statusaktif, p.kode_cabang,
             'Terpilih Majikan' AS jenis_laporan,
             m.kode_majikan,
             m.namamajikan,
             m.pekerjaan,
             m.marketing,
             m.tglterpilih AS tanggal_kejadian,
             m.notelpmajikan,
             m.alamatmajikan,
             '' AS alasan_md,
             COALESCE(NULLIF(TRIM(m.ketsuhan), ''), NULLIF(TRIM(m.ketpermit), ''), '') AS keterangan_md
      FROM personal p
      INNER JOIN majikan m ON m.id_biodata = p.id_biodata
      WHERE ${majWhere.join(" AND ")} AND COALESCE(p.is_active, 1) = 1
    `);
    unionParams.push(...majParams);
  }

  if (
    tables.includes("admin_keadaan_tki") &&
    tables.includes("admin_keadaan_tki_pilihan")
  ) {
    const mdWhere = [`UPPER(TRIM(k.nama)) = 'MD'`];
    const mdParams = [];
    if (branch) {
      mdWhere.push("p.kode_cabang = ?");
      mdParams.push(branch);
    }
    if (prefix) {
      mdWhere.push(
        "COALESCE(p.kode_sektor, SUBSTRING(p.id_biodata FROM POSITION('-' IN p.id_biodata)+1 FOR 2)) = ?",
      );
      mdParams.push(prefix);
    }
    if (q) {
      mdWhere.push(
        "(p.id_tki LIKE ? OR p.id_biodata LIKE ? OR p.nama LIKE ? OR a.keterangan LIKE ?)",
      );
      mdParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    unionParts.push(`
      SELECT p.id_tki, p.id_biodata, p.nama, p.jeniskelamin, p.notelp, p.negara1, p.statusaktif, p.kode_cabang,
             'MD' AS jenis_laporan,
             '' AS kode_majikan,
             k.nama AS namamajikan,
             '' AS pekerjaan,
             '' AS marketing,
             a.tanggal AS tanggal_kejadian,
             '' AS notelpmajikan,
             '' AS alamatmajikan,
             COALESCE(a.keterangan, '') AS alasan_md,
             COALESCE(a.keterangan, '') AS keterangan_md
      FROM personal p
      INNER JOIN admin_keadaan_tki a ON a.id_biodata = p.id_biodata
      INNER JOIN admin_keadaan_tki_pilihan k ON k.id = a.keadaan_id
      WHERE ${mdWhere.join(" AND ")} AND COALESCE(p.is_active, 1) = 1
    `);
    unionParams.push(...mdParams);
  }

  if (!unionParts.length) {
    return {
      data: [],
      pagination: { page: 1, perPage: 10, total: 0, totalPages: 0 },
    };
  }

  const unionSql = unionParts.join(" UNION ALL ");
  const countRow = await dbAllRows(
    `SELECT COUNT(*) as total FROM (${unionSql}) rep`,
    ...unionParams,
  );
  const total = Number(countRow?.[0]?.total || 0);
  const orderClause = parseTkiReportSort(
    options.sort,
    [
      "id_tki",
      "id_biodata",
      "nama",
      "jeniskelamin",
      "notelp",
      "negara1",
      "statusaktif",
      "kode_cabang",
      "jenis_laporan",
      "kode_majikan",
      "namamajikan",
      "pekerjaan",
      "marketing",
      "tanggal_kejadian",
      "notelpmajikan",
      "alasan_md",
      "keterangan_md",
    ],
    "tanggal_kejadian",
  );
  const data = await dbAllRows(
    `SELECT * FROM (${unionSql}) rep ${orderClause} LIMIT ${perPage} OFFSET ${offset}`,
    ...unionParams,
  );
  return {
    data: normalizeRows(data),
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage) || 0,
    },
  };
}

function buildTkiReportMarketingSelectParts() {
  const tables = getTableNames();
  const markawalSql = buildLatestStageSql(
    "marka",
    coalesceTrimFields("t.status", "t.tanggal"),
  );
  const agenSql = buildLatestAgenLabelSql();
  const majikanSql = buildLatestStageSql(
    "majikan",
    coalesceTrimFields("t.namamajikan", "t.kode_majikan", "t.tglterpilih"),
  );
  const suhanSql = buildLatestStageSql(
    "majikan",
    coalesceTrimFields("t.kode_suhan", "t.tglterbitsuhan"),
  );
  const pekerjaanSql = buildLatestStageSql(
    "majikan",
    coalesceTrimFields("t.pekerjaan"),
  );
  const visaPermitSql = buildLatestStageSql(
    "majikan",
    coalesceTrimFields("t.kode_visapermit", "t.tglterbitpermit"),
  );
  const visaSql = buildLatestStageSql(
    "visa",
    coalesceTrimFields(
      "t.novisa",
      "t.tanggalterbang",
      "t.tglberangkat",
      "t.tglberlaku",
    ),
  );
  const papSql = buildLatestStageSql(
    "pap",
    coalesceTrimFields("t.nopap", "t.statuspap", "t.tgl_terima"),
  );
  let mdSql = `'-'`;
  if (
    tables.includes("admin_keadaan_tki") &&
    tables.includes("admin_keadaan_tki_pilihan")
  ) {
    mdSql = `(SELECT COALESCE(NULLIF(TRIM(a.keterangan), ''), 'MD')
      FROM admin_keadaan_tki a
      INNER JOIN admin_keadaan_tki_pilihan k ON k.id = a.keadaan_id
      WHERE a.id_biodata = p.id_biodata AND UPPER(TRIM(k.nama)) = 'MD'
      ORDER BY a.id DESC LIMIT 1)`;
  }
  return {
    markawalSql,
    agenSql,
    majikanSql,
    suhanSql,
    pekerjaanSql,
    visaPermitSql,
    visaSql,
    papSql,
    mdSql,
    selectSql: `
      ${tkiReportUsesDatatki() ? "dt.id_tki AS id_tki," : "p.id_tki AS id_tki,"}
      p.id_biodata AS kode,
      p.nama,
      p.jeniskelamin,
      p.negara1,
      p.statusaktif,
      p.tanggaldaftar,
      COALESCE(${markawalSql}, '-') AS markawal,
      COALESCE(${agenSql}, '-') AS agen,
      COALESCE(${majikanSql}, '-') AS majikan,
      COALESCE(${suhanSql}, '-') AS suhan,
      COALESCE(${pekerjaanSql}, '-') AS pekerjaan,
      COALESCE(${visaPermitSql}, '-') AS visa_permit,
      COALESCE(${visaSql}, '-') AS visa,
      COALESCE(${papSql}, '-') AS pap,
      COALESCE(${mdSql}, '-') AS md
    `,
  };
}

function parseTkiReportMarketingSort(
  sortRaw,
  marketingParts,
  fallback = "kode",
  defaultOrder = "asc",
) {
  const {
    markawalSql,
    agenSql,
    majikanSql,
    suhanSql,
    pekerjaanSql,
    visaPermitSql,
    visaSql,
    papSql,
    mdSql,
  } = marketingParts;
  const columnMap = {
    id_tki: tkiReportUsesDatatki() ? "dt.id_tki" : "p.id_tki",
    kode: "p.id_biodata",
    nama: "p.nama",
    jeniskelamin: "p.jeniskelamin",
    negara1: "p.negara1",
    statusaktif: "p.statusaktif",
    tanggaldaftar: "p.tanggaldaftar",
    markawal: `COALESCE(${markawalSql}, '-')`,
    agen: `COALESCE(${agenSql}, '-')`,
    majikan: `COALESCE(${majikanSql}, '-')`,
    suhan: `COALESCE(${suhanSql}, '-')`,
    pekerjaan: `COALESCE(${pekerjaanSql}, '-')`,
    visa_permit: `COALESCE(${visaPermitSql}, '-')`,
    visa: `COALESCE(${visaSql}, '-')`,
    pap: `COALESCE(${papSql}, '-')`,
    md: `COALESCE(${mdSql}, '-')`,
  };
  const allowedSet = new Set(Object.keys(columnMap));
  const parts = String(sortRaw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const part of parts) {
    const [colRaw, dirRaw] = part.split(":");
    const col = String(colRaw || "").trim();
    if (!allowedSet.has(col)) continue;
    const dir =
      String(dirRaw || defaultOrder || "asc").toLowerCase() === "desc"
        ? "DESC"
        : "ASC";
    out.push(`${columnMap[col]} ${dir}`);
  }
  const fb = allowedSet.has(fallback) ? fallback : "kode";
  if (!out.length) {
    const dir =
      String(defaultOrder || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
    out.push(`${columnMap[fb]} ${dir}`);
  }
  return `ORDER BY ${out.join(", ")}`;
}

async function enrichMarketingReportRows(rows) {
  if (!rows?.length) return rows;
  const mapped = rows.map((r) => ({
    ...r,
    id_biodata: String(r.id_biodata || r.kode || "").trim(),
  }));
  await enrichPersonalListDetailPekerjaan(mapped);
  rows.forEach((row, idx) => {
    const detail = String(mapped[idx].detail_pekerjaan || "").trim();
    row.detail_pekerjaan = detail || "-";
    const pekerjaan = String(mapped[idx].pekerjaan || "").trim();
    if (pekerjaan && (!row.pekerjaan || row.pekerjaan === "-")) {
      row.pekerjaan = pekerjaan;
    }
  });
  return rows;
}

function sqlLatestMajikanJoin(alias = "m") {
  if (!getTableNames().includes("majikan")) return "";
  return `LEFT JOIN majikan ${alias} ON ${alias}.id = (
    SELECT t.id FROM majikan t WHERE t.id_biodata = p.id_biodata ORDER BY t.id DESC LIMIT 1
  )`;
}

function sqlLatestVisaJoin(alias = "v") {
  if (!getTableNames().includes("visa")) return "";
  return `LEFT JOIN visa ${alias} ON ${alias}.id = (
    SELECT t.id FROM visa t WHERE t.id_biodata = p.id_biodata ORDER BY t.id DESC LIMIT 1
  )`;
}

/** Laporan Marketing — matriks pipeline penempatan (markawal → agen → majikan → visa) */
async function listTkiReportMarketingPipeline(options = {}) {
  const tables = getTableNames();
  if (!tables.includes("personal")) {
    return {
      data: [],
      pagination: { page: 1, perPage: 10, total: 0, totalPages: 0 },
    };
  }
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const perPage = Math.max(1, parseInt(options.perPage, 10) || 10);
  const offset = (page - 1) * perPage;
  const { whereClause, params } = buildTkiReportFilters({
    ...pickTkiReportFilterOptions(options),
    ...pickTkiReportFilterContext(["p.negara1 LIKE ?"]),
  });
  const marketingParts = buildTkiReportMarketingSelectParts();
  const { selectSql } = marketingParts;
  const orderClause = parseTkiReportMarketingSort(
    options.sort,
    marketingParts,
    "kode",
    options.order || "asc",
  );
  const baseFrom = buildTkiReportBaseFrom("p", "dt");
  const countRow = await dbAllRows(
    `SELECT COUNT(*) as total ${baseFrom} ${whereClause}`,
    ...params,
  );
  const total = Number(countRow?.[0]?.total || 0);
  const data = normalizeRows(
    await dbAllRows(
      `SELECT ${selectSql}
       ${baseFrom}
       ${whereClause}
       ${orderClause}
       LIMIT ${perPage} OFFSET ${offset}`,
      ...params,
    ),
  );
  await enrichMarketingReportRows(data);
  return {
    data,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage) || 0,
    },
  };
}

/** Laporan Marketing — detail penempatan majikan per TKI */
async function listTkiReportMarketingPenempatan(options = {}) {
  const tables = getTableNames();
  if (!tables.includes("personal")) {
    return {
      data: [],
      pagination: { page: 1, perPage: 10, total: 0, totalPages: 0 },
    };
  }
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const perPage = Math.max(1, parseInt(options.perPage, 10) || 10);
  const offset = (page - 1) * perPage;
  const penempatanSearch = ["p.negara1 LIKE ?"];
  if (tables.includes("majikan")) {
    penempatanSearch.push(
      "m.kode_agen LIKE ?",
      "m.namamajikan LIKE ?",
      "m.kode_suhan LIKE ?",
      "m.pekerjaan LIKE ?",
    );
  }
  const { whereClause, params } = buildTkiReportFilters({
    ...pickTkiReportFilterOptions(options),
    ...pickTkiReportFilterContext(penempatanSearch),
  });
  const majikanJoin = sqlLatestMajikanJoin("m");
  const agenJoin = tables.includes("dataagen")
    ? "LEFT JOIN dataagen da ON da.kode_agen = m.kode_agen"
    : "";
  const agenLabel = tables.includes("dataagen")
    ? `COALESCE(NULLIF(TRIM(da.nama), ''), NULLIF(TRIM(m.kode_agen), ''), '-')`
    : `COALESCE(NULLIF(TRIM(m.kode_agen), ''), '-')`;
  const idTkiSelect = tkiReportUsesDatatki() ? "dt.id_tki" : "p.id_tki";
  const selectSql = `
    ${idTkiSelect} AS id_tki,
    p.id_biodata,
    p.nama,
    p.jeniskelamin,
    p.negara1,
    p.statusaktif,
    p.tanggaldaftar,
    COALESCE(NULLIF(TRIM(m.kode_agen), ''), '-') AS kode_agen,
    ${agenLabel} AS agen,
    COALESCE(NULLIF(TRIM(m.kode_majikan), ''), '-') AS kode_majikan,
    COALESCE(NULLIF(TRIM(m.namamajikan), ''), '-') AS namamajikan,
    COALESCE(NULLIF(TRIM(m.tglterpilih), ''), '-') AS tglterpilih,
    COALESCE(NULLIF(TRIM(m.kode_suhan), ''), '-') AS kode_suhan,
    COALESCE(NULLIF(TRIM(m.tglterbitsuhan), ''), '-') AS tglterbitsuhan,
    COALESCE(NULLIF(TRIM(m.pekerjaan), ''), '-') AS pekerjaan,
    COALESCE(NULLIF(TRIM(m.kode_visapermit), ''), '-') AS kode_visapermit,
    COALESCE(NULLIF(TRIM(m.marketing), ''), '-') AS marketing_pic
  `;
  const sortAllowed = [
    "id_tki",
    "id_biodata",
    "nama",
    "jeniskelamin",
    "negara1",
    "statusaktif",
    "tanggaldaftar",
    "kode_agen",
    "agen",
    "kode_majikan",
    "namamajikan",
    "tglterpilih",
    "kode_suhan",
    "tglterbitsuhan",
    "pekerjaan",
    "kode_visapermit",
    "marketing_pic",
  ];
  const orderClause = parseTkiReportSort(
    options.sort,
    sortAllowed,
    "id_biodata",
    options.order || "asc",
  );
  const fromSql = `${buildTkiReportBaseFrom("p", "dt")} ${majikanJoin} ${agenJoin} ${whereClause}`;
  const countRow = await dbAllRows(
    `SELECT COUNT(*) as total ${fromSql}`,
    ...params,
  );
  const total = Number(countRow?.[0]?.total || 0);
  const data = normalizeRows(
    await dbAllRows(
      `SELECT ${selectSql} ${fromSql} ${orderClause} LIMIT ${perPage} OFFSET ${offset}`,
      ...params,
    ),
  );
  await enrichPersonalListDetailPekerjaan(data);
  data.forEach((row) => {
    if (!String(row.detail_pekerjaan || "").trim()) row.detail_pekerjaan = "-";
  });
  return {
    data,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage) || 0,
    },
  };
}

/** Laporan Marketing — progress visa & rencana keberangkatan */
async function listTkiReportMarketingVisa(options = {}) {
  const tables = getTableNames();
  if (!tables.includes("personal")) {
    return {
      data: [],
      pagination: { page: 1, perPage: 10, total: 0, totalPages: 0 },
    };
  }
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const perPage = Math.max(1, parseInt(options.perPage, 10) || 10);
  const offset = (page - 1) * perPage;
  const visaSearch = ["p.negara1 LIKE ?"];
  if (tables.includes("visa")) {
    visaSearch.push("v.novisa LIKE ?");
  }
  if (tables.includes("majikan")) {
    visaSearch.push("m.namamajikan LIKE ?", "m.kode_visapermit LIKE ?");
  }
  const { whereClause, params } = buildTkiReportFilters({
    ...pickTkiReportFilterOptions(options),
    ...pickTkiReportFilterContext(visaSearch),
  });
  const visaJoin = sqlLatestVisaJoin("v");
  const majikanJoin = sqlLatestMajikanJoin("m");
  const idTkiSelect = tkiReportUsesDatatki() ? "dt.id_tki" : "p.id_tki";
  const selectSql = `
    ${idTkiSelect} AS id_tki,
    p.id_biodata,
    p.nama,
    p.negara1,
    p.statusaktif,
    COALESCE(NULLIF(TRIM(v.novisa), ''), '-') AS novisa,
    COALESCE(NULLIF(TRIM(v.tglberlaku), ''), '-') AS tglberlaku,
    COALESCE(NULLIF(TRIM(v.tglsampai), ''), '-') AS tglsampai,
    COALESCE(NULLIF(TRIM(v.tglberangkat), ''), '-') AS tglberangkat,
    COALESCE(NULLIF(TRIM(v.tanggalterbang), ''), '-') AS tanggalterbang,
    COALESCE(NULLIF(TRIM(v.statusterbang), ''), '-') AS statusterbang,
    COALESCE(NULLIF(TRIM(v.nopap), ''), '-') AS nopap,
    COALESCE(NULLIF(TRIM(v.statuspap), ''), '-') AS statuspap,
    COALESCE(NULLIF(TRIM(m.namamajikan), ''), '-') AS majikan,
    COALESCE(NULLIF(TRIM(m.kode_visapermit), ''), '-') AS kode_visapermit
  `;
  const sortAllowed = [
    "id_tki",
    "id_biodata",
    "nama",
    "negara1",
    "statusaktif",
    "novisa",
    "tglberlaku",
    "tglsampai",
    "tglberangkat",
    "tanggalterbang",
    "statusterbang",
    "nopap",
    "statuspap",
    "majikan",
    "kode_visapermit",
  ];
  const orderClause = parseTkiReportSort(
    options.sort,
    sortAllowed,
    "id_biodata",
    options.order || "asc",
  );
  const fromSql = `${buildTkiReportBaseFrom("p", "dt")} ${visaJoin} ${majikanJoin} ${whereClause}`;
  const countRow = await dbAllRows(
    `SELECT COUNT(*) as total ${fromSql}`,
    ...params,
  );
  const total = Number(countRow?.[0]?.total || 0);
  const data = normalizeRows(
    await dbAllRows(
      `SELECT ${selectSql} ${fromSql} ${orderClause} LIMIT ${perPage} OFFSET ${offset}`,
      ...params,
    ),
  );
  return {
    data,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage) || 0,
    },
  };
}

function countMarketingPipelineStages(rows) {
  const stageCounts = {
    markawal: 0,
    agen: 0,
    majikan: 0,
    suhan: 0,
    pekerjaan: 0,
    visa_permit: 0,
    visa: 0,
    pap: 0,
    md: 0,
  };
  (rows || []).forEach((row) => {
    if (row.markawal && row.markawal !== "-") stageCounts.markawal += 1;
    if (row.agen && row.agen !== "-") stageCounts.agen += 1;
    if (row.majikan && row.majikan !== "-") stageCounts.majikan += 1;
    if (row.suhan && row.suhan !== "-") stageCounts.suhan += 1;
    if (row.pekerjaan && row.pekerjaan !== "-") stageCounts.pekerjaan += 1;
    if (row.visa_permit && row.visa_permit !== "-")
      stageCounts.visa_permit += 1;
    if (row.visa && row.visa !== "-") stageCounts.visa += 1;
    if (row.pap && row.pap !== "-") stageCounts.pap += 1;
    if (row.md && row.md !== "-") stageCounts.md += 1;
  });
  return [
    { label: "Marketing Awal", value: stageCounts.markawal },
    { label: "Ke Agen", value: stageCounts.agen },
    { label: "Majikan", value: stageCounts.majikan },
    { label: "Suhan", value: stageCounts.suhan },
    { label: "Pekerjaan", value: stageCounts.pekerjaan },
    { label: "Visa Permit", value: stageCounts.visa_permit },
    { label: "Visa", value: stageCounts.visa },
    { label: "PAP", value: stageCounts.pap },
    { label: "MD", value: stageCounts.md },
  ];
}

async function listTkiReport(reportKey, options = {}) {
  const key = String(reportKey || "")
    .trim()
    .toLowerCase();
  if (!TKI_REPORT_KEYS.has(key)) {
    throw new Error("Jenis laporan tidak dikenal");
  }
  if (key === "daftar") return listTkiReportDaftar(options);
  if (key === "medical") return listTkiReportMedical(options);
  if (key === "medical-belum-terbang")
    return listTkiReportMedicalBelumTerbang(options);
  if (key === "dokumen") return listTkiReportDokumen(options);
  if (key === "marketing-pipeline")
    return listTkiReportMarketingPipeline(options);
  if (key === "marketing-penempatan")
    return listTkiReportMarketingPenempatan(options);
  if (key === "marketing-visa") return listTkiReportMarketingVisa(options);
  return listTkiReportMajikanMd(options);
}

async function getTkiReportChart(reportKey, options = {}) {
  const key = String(reportKey || "")
    .trim()
    .toLowerCase();
  if (!TKI_REPORT_KEYS.has(key)) {
    throw new Error("Jenis laporan tidak dikenal");
  }
  const sektorExpr = tkiReportChartSektorExpr();
  const distinctCol = tkiReportChartDistinctCol();

  if (key === "daftar") {
    const { exNonExSql } = buildTkiReportMatrixSelectParts();
    const { whereClause, params: filterParams } =
      buildTkiReportChartFilters(options);
    const baseFrom = buildTkiReportBaseFrom("p", "dt");
    const totalRow = await dbAllRows(
      `SELECT COUNT(*) as c ${baseFrom} ${whereClause}`,
      ...filterParams,
    );
    const byExNonEx = await dbAllRows(
      `SELECT ${exNonExSql} AS label, COUNT(*) AS value
       ${baseFrom} ${whereClause}
       GROUP BY ${exNonExSql}
       ORDER BY value DESC`,
      ...filterParams,
    );
    const stageCounts = {
      dokumen: 0,
      disnaker: 0,
      medical: 0,
      paspor: 0,
      agen: 0,
      sponsor: 0,
      majikan: 0,
      pap: 0,
      visa: 0,
      md: 0,
    };
    const matrixRows = await listTkiReportDaftar({
      ...options,
      page: 1,
      perPage: 100000,
      search: "",
      sort: "",
    });
    (matrixRows.data || []).forEach((row) => {
      if (row.dokumen && row.dokumen !== "-") stageCounts.dokumen += 1;
      if (row.disnaker && row.disnaker !== "-") stageCounts.disnaker += 1;
      if (row.medical && row.medical !== "-") stageCounts.medical += 1;
      if (row.paspor && row.paspor !== "-") stageCounts.paspor += 1;
      if (row.agen && row.agen !== "-") stageCounts.agen += 1;
      if (row.sponsor && row.sponsor !== "-") stageCounts.sponsor += 1;
      if (row.majikan && row.majikan !== "-") stageCounts.majikan += 1;
      if (row.pap && row.pap !== "-") stageCounts.pap += 1;
      if (row.visa && row.visa !== "-") stageCounts.visa += 1;
      if (row.md && row.md !== "-") stageCounts.md += 1;
    });
    const byStage = [
      { label: "Dokumen", value: stageCounts.dokumen },
      { label: "Disnaker", value: stageCounts.disnaker },
      { label: "Medical", value: stageCounts.medical },
      { label: "Paspor", value: stageCounts.paspor },
      { label: "Agen", value: stageCounts.agen },
      { label: "Sponsor", value: stageCounts.sponsor },
      { label: "Majikan", value: stageCounts.majikan },
      { label: "PAP", value: stageCounts.pap },
      { label: "Visa", value: stageCounts.visa },
      { label: "MD", value: stageCounts.md },
    ];
    return {
      total: Number(totalRow?.[0]?.c || 0),
      byExNonEx: normalizeRows(byExNonEx),
      byStage,
    };
  }

  if (key === "medical") {
    const { whereClause, params: filterParams } =
      buildTkiReportChartFilters(options);
    const baseFrom = `${buildTkiReportBaseFrom("p", "dt")} INNER JOIN medical m ON m.id_biodata = p.id_biodata`;
    const totalRow = await dbAllRows(
      `SELECT COUNT(DISTINCT ${distinctCol}) as c ${baseFrom} ${whereClause}`,
      ...filterParams,
    );
    const byJenis = await dbAllRows(
      `SELECT COALESCE(NULLIF(TRIM(m.jenismedical), ''), 'Lainnya') as label, COUNT(DISTINCT ${distinctCol}) as value
       ${baseFrom} ${whereClause}
       GROUP BY COALESCE(NULLIF(TRIM(m.jenismedical), ''), 'Lainnya')
       ORDER BY value DESC
       LIMIT 8`,
      ...filterParams,
    );
    const bySektor = await dbAllRows(
      `SELECT ${sektorExpr} as label, COUNT(DISTINCT ${distinctCol}) as value
       ${baseFrom} ${whereClause}
       GROUP BY ${sektorExpr}
       ORDER BY value DESC
       LIMIT 8`,
      ...filterParams,
    );
    return {
      total: Number(totalRow?.[0]?.c || 0),
      byJenis: normalizeRows(byJenis),
      bySektor: normalizeRows(bySektor),
    };
  }

  if (key === "medical-belum-terbang") {
    const { whereClause, params: filterParams } =
      buildTkiReportChartFilters(options);
    const baseFrom = `${buildTkiReportBaseFrom("p", "dt")} INNER JOIN medical m ON m.id_biodata = p.id_biodata`;
    const belumTerbangClause = whereClause
      ? `${whereClause} AND COALESCE(p.statterbang, 0) = 0`
      : "WHERE COALESCE(p.statterbang, 0) = 0";
    const totalRow = await dbAllRows(
      `SELECT COUNT(DISTINCT ${distinctCol}) as c ${baseFrom} ${belumTerbangClause}`,
      ...filterParams,
    );
    const bySektor = await dbAllRows(
      `SELECT ${sektorExpr} as label, COUNT(DISTINCT ${distinctCol}) as value
       ${baseFrom} ${belumTerbangClause}
       GROUP BY ${sektorExpr}
       ORDER BY value DESC
       LIMIT 8`,
      ...filterParams,
    );
    const byNegara = await dbAllRows(
      `SELECT COALESCE(NULLIF(TRIM(p.negara1), ''), 'Belum diisi') as label, COUNT(DISTINCT ${distinctCol}) as value
       ${baseFrom} ${belumTerbangClause}
       GROUP BY COALESCE(NULLIF(TRIM(p.negara1), ''), 'Belum diisi')
       ORDER BY value DESC
       LIMIT 8`,
      ...filterParams,
    );
    return {
      total: Number(totalRow?.[0]?.c || 0),
      bySektor: normalizeRows(bySektor),
      byNegara: normalizeRows(byNegara),
    };
  }

  if (key === "dokumen") {
    const tables = getTableNames();
    const { whereClause, params: filterParams } =
      buildTkiReportChartFilters(options);
    const baseFrom = buildTkiReportBaseFrom("p", "dt");
    const joinClause = tables.includes("dokumen")
      ? "LEFT JOIN dokumen d ON d.id_biodata = p.id_biodata"
      : "";
    const jumlahAdaExpr = tables.includes("dokumen")
      ? buildDokumenCountExpr("d")
      : "0";
    const totalRow = await dbAllRows(
      `SELECT COUNT(*) as c ${baseFrom} ${joinClause} ${whereClause}`,
      ...filterParams,
    );
    const bucketCase = `CASE
            WHEN COALESCE(${jumlahAdaExpr}, 0) = 0 THEN '0 dokumen'
            WHEN COALESCE(${jumlahAdaExpr}, 0) BETWEEN 1 AND 4 THEN '1–4 dokumen'
            WHEN COALESCE(${jumlahAdaExpr}, 0) BETWEEN 5 AND 8 THEN '5–8 dokumen'
            WHEN COALESCE(${jumlahAdaExpr}, 0) BETWEEN 9 AND 12 THEN '9–12 dokumen'
            WHEN COALESCE(${jumlahAdaExpr}, 0) BETWEEN 13 AND 15 THEN '13–15 dokumen'
            ELSE 'Lengkap (16)'
          END`;
    const bucketSql = tables.includes("dokumen")
      ? `SELECT ${bucketCase} AS label, COUNT(*) AS value
         ${baseFrom} ${joinClause} ${whereClause}
         GROUP BY ${bucketCase}
         ORDER BY value DESC`
      : null;
    const byKelengkapan = bucketSql
      ? normalizeRows(await dbAllRows(bucketSql, ...filterParams))
      : [];
    const byDocType = [];
    if (tables.includes("dokumen")) {
      const sumParts = REPORT_DOKUMEN_FIELDS.map(
        (field) =>
          `SUM(CASE WHEN ${sqlDokumenFieldHasFile("d", field.key)} THEN 1 ELSE 0 END) AS cnt_${field.key}`,
      ).join(", ");
      const sumRow =
        normalizeRows(
          await dbAllRows(
            `SELECT ${sumParts}
           ${baseFrom} LEFT JOIN dokumen d ON d.id_biodata = p.id_biodata
           ${whereClause}`,
            ...filterParams,
          ),
        )[0] || {};
      REPORT_DOKUMEN_FIELDS.forEach((field) => {
        byDocType.push({
          label: field.label,
          value: Number(sumRow[`cnt_${field.key}`] || 0),
        });
      });
      byDocType.sort((a, b) => b.value - a.value);
    }
    const bySektor = await dbAllRows(
      `SELECT ${sektorExpr} as label, ROUND(AVG(COALESCE(${jumlahAdaExpr}, 0)), 1) as value
       ${baseFrom} ${joinClause} ${whereClause}
       GROUP BY ${sektorExpr}
       ORDER BY value DESC
       LIMIT 8`,
      ...filterParams,
    );
    return {
      total: Number(totalRow?.[0]?.c || 0),
      byKelengkapan,
      byDocType,
      bySektor: normalizeRows(bySektor),
    };
  }

  if (key === "marketing-pipeline") {
    const { whereClause, params: filterParams } =
      buildTkiReportChartFilters(options);
    const baseFrom = buildTkiReportBaseFrom("p", "dt");
    const totalRow = await dbAllRows(
      `SELECT COUNT(*) as c ${baseFrom} ${whereClause}`,
      ...filterParams,
    );
    const listResult = await listTkiReportMarketingPipeline({
      ...options,
      page: 1,
      perPage: 100000,
      search: "",
      sort: "",
    });
    const rows = listResult.data || [];
    const byStage = countMarketingPipelineStages(rows);
    const bySektor = {};
    rows.forEach((row) => {
      const sektor =
        String(row.kode || row.id_biodata || "")
          .slice(0, 2)
          .toUpperCase() || "-";
      bySektor[sektor] = (bySektor[sektor] || 0) + 1;
    });
    return {
      total: Number(totalRow?.[0]?.c || 0),
      byStage,
      bySektor: Object.entries(bySektor)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    };
  }

  if (key === "marketing-penempatan") {
    const listResult = await listTkiReportMarketingPenempatan({
      ...options,
      page: 1,
      perPage: 100000,
      search: "",
      sort: "",
    });
    const rows = listResult.data || [];
    const tahap = {
      agen: 0,
      majikan: 0,
      suhan: 0,
      pekerjaan: 0,
      visa_permit: 0,
    };
    const bySektor = {};
    rows.forEach((row) => {
      if (row.kode_agen && row.kode_agen !== "-") tahap.agen += 1;
      if (row.namamajikan && row.namamajikan !== "-") tahap.majikan += 1;
      if (row.kode_suhan && row.kode_suhan !== "-") tahap.suhan += 1;
      if (row.pekerjaan && row.pekerjaan !== "-") tahap.pekerjaan += 1;
      if (row.kode_visapermit && row.kode_visapermit !== "-")
        tahap.visa_permit += 1;
      const sektor =
        String(row.id_biodata || "")
          .slice(0, 2)
          .toUpperCase() || "-";
      bySektor[sektor] = (bySektor[sektor] || 0) + 1;
    });
    return {
      total: rows.length,
      byTahap: [
        { label: "Ke Agen", value: tahap.agen },
        { label: "Majikan", value: tahap.majikan },
        { label: "Suhan", value: tahap.suhan },
        { label: "Pekerjaan", value: tahap.pekerjaan },
        { label: "Visa Permit", value: tahap.visa_permit },
      ],
      bySektor: Object.entries(bySektor)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    };
  }

  if (key === "marketing-visa") {
    const listResult = await listTkiReportMarketingVisa({
      ...options,
      page: 1,
      perPage: 100000,
      search: "",
      sort: "",
    });
    const rows = listResult.data || [];
    const byStatus = {};
    const bySektor = {};
    rows.forEach((row) => {
      const st = String(row.statusterbang || "").trim() || "Belum diisi";
      byStatus[st] = (byStatus[st] || 0) + 1;
      const sektor =
        String(row.id_biodata || "")
          .slice(0, 2)
          .toUpperCase() || "-";
      bySektor[sektor] = (bySektor[sektor] || 0) + 1;
    });
    const withVisa = rows.filter(
      (row) => row.novisa && row.novisa !== "-",
    ).length;
    return {
      total: rows.length,
      withVisa,
      byStatus: Object.entries(byStatus)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
      bySektor: Object.entries(bySektor)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    };
  }

  const listResult = await listTkiReportMajikanMd({
    ...options,
    page: 1,
    perPage: 100000,
    search: "",
    sort: "",
  });
  const rows = listResult.data || [];
  const byJenis = {};
  const bySektor = {};
  rows.forEach((row) => {
    const jenis = row.jenis_laporan || "Lainnya";
    byJenis[jenis] = (byJenis[jenis] || 0) + 1;
    const sektor =
      String(row.id_biodata || "")
        .slice(0, 2)
        .toUpperCase() || "-";
    bySektor[sektor] = (bySektor[sektor] || 0) + 1;
  });
  return {
    total: rows.length,
    byJenis: Object.entries(byJenis).map(([label, value]) => ({
      label,
      value,
    })),
    bySektor: Object.entries(bySektor)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
  };
}

/** Laporan print: TKI sudah medical, belum terbang */
async function getMedicalBelumTerbangReport() {
  const tables = getTableNames();
  if (!tables.includes("personal") || !tables.includes("medical")) return [];
  try {
    const idTkiSelect = tkiReportUsesDatatki() ? "dt.id_tki" : "p.id_tki";
    return await dbAllRows(`
      SELECT ${idTkiSelect} AS id_tki, p.id_biodata, p.nama, p.statusaktif, p.negara1,
             MAX(m.tanggal) AS tgl_medical
      ${buildTkiReportBaseFrom("p", "dt")}
      INNER JOIN medical m ON m.id_biodata = p.id_biodata
      WHERE COALESCE(p.statterbang, 0) = 0
      GROUP BY ${idTkiSelect}, p.id_biodata, p.nama, p.statusaktif, p.negara1
      ORDER BY ${idTkiSelect}, p.id_biodata
    `);
  } catch {
    return [];
  }
}

/** Laporan print: tgl online disnaker mendekati / lewat, belum terbang */
async function getExpireTglOnlineReport(daysAhead = 30) {
  const tables = getTableNames();
  if (!tables.includes("personal") || !tables.includes("disnaker")) return [];
  const days = Math.max(1, Number(daysAhead) || 30);
  try {
    const idTkiSelect = tkiReportUsesDatatki() ? "dt.id_tki" : "p.id_tki";
    const baseFrom = `${buildTkiReportBaseFrom("p", "dt")} INNER JOIN disnaker d ON d.id_biodata = p.id_biodata`;
    if (isPostgres()) {
      return await dbAllRows(`
        SELECT ${idTkiSelect} AS id_tki, p.id_biodata, p.nama, d.nodisnaker, d.tglonline
        ${baseFrom}
        WHERE d.tglonline IS NOT NULL AND TRIM(d.tglonline::text) != ''
          AND d.tglonline::date <= (CURRENT_DATE + INTERVAL '${days} days')
          AND COALESCE(p.statterbang, 0) = 0
        ORDER BY d.tglonline ASC
      `);
    }
    return await dbAllRows(
      `
      SELECT ${idTkiSelect} AS id_tki, p.id_biodata, p.nama, d.nodisnaker, d.tglonline
      ${baseFrom}
      WHERE d.tglonline IS NOT NULL AND TRIM(d.tglonline) != ''
        AND date(d.tglonline) <= date('now', '+' || ? || ' days')
        AND COALESCE(p.statterbang, 0) = 0
      ORDER BY d.tglonline ASC
    `,
      days,
    );
  } catch {
    return [];
  }
}

async function updateUserPassword(userId, hashedPassword) {
  await q(
    db.prepare(
      "UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?",
    ),
    "run",
    hashedPassword,
    userId,
  );
}

/** Daftar template surat Word aktif (letter_templates) */
async function listLetterTemplates(filters = {}) {
  const { kategori, sektor } = filters;
  let sql = `SELECT * FROM letter_templates WHERE aktif = 1`;
  const params = [];
  if (kategori) {
    sql += ` AND kategori = ?`;
    params.push(String(kategori));
  }
  sql += ` ORDER BY kategori ASC, nama ASC`;
  const rows = await dbAllRows(sql, ...params);
  if (!sektor) return rows;
  const code = String(sektor).toUpperCase().slice(0, 2);
  const sektorRow = await getDatasektorByKode(code);
  const jenisSektor = String(sektorRow?.jenis_sektor || "")
    .trim()
    .toLowerCase();
  return rows.filter((r) => {
    const f = String(r.sektor || "").trim();
    if (!f) return true;
    return f
      .split(",")
      .map((x) => x.trim())
      .some((token) => {
        if (!token) return false;
        const normalized = token.toLowerCase();
        if (
          normalized === `@${jenisSektor}` ||
          normalized === `jenis:${jenisSektor}`
        )
          return true;
        return token.toUpperCase() === code;
      });
  });
}

async function getLetterTemplateByKode(kode) {
  const k = String(kode || "").trim();
  if (!k) return null;
  return normalizeRow(
    await q(
      db.prepare("SELECT * FROM letter_templates WHERE kode = ? AND aktif = 1"),
      "get",
      k,
    ),
  );
}

async function listHtmlDocumentTemplates(filters = {}) {
  const { template_type } = filters;
  let sql = `SELECT id, name, description, template_type, page_size, orientation, is_active FROM document_templates WHERE is_active = 1`;
  const params = [];
  if (template_type) {
    sql += ` AND template_type = ?`;
    params.push(String(template_type));
  }
  sql += ` ORDER BY name ASC`;
  return dbAllRows(sql, ...params);
}

async function getHtmlDocumentTemplate(id) {
  const row = await getById("document_templates", id);
  if (!row || Number(row.is_active) !== 1) return null;
  return row;
}

let _papHeaderPkCol = null;
let _papDetailPkCol = null;

async function getTableColumnNames(tableName) {
  try {
    const info = await getTableColumnInfo(tableName);
    return info.map((c) => c.name);
  } catch {
    return [];
  }
}

/** Metadata kolom aktual di DB (untuk migrasi legacy vs schema JSON) */
async function getTableColumnInfo(tableName) {
  try {
    if (isPostgres()) {
      const rows = await q(
        db.prepare(`
          SELECT
            c.column_name AS name,
            c.data_type AS type,
            c.is_nullable,
            c.column_default AS dflt_value,
            CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS pk
          FROM information_schema.columns c
          LEFT JOIN (
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_schema = 'public'
              AND tc.table_name = $1
              AND tc.constraint_type = 'PRIMARY KEY'
          ) pk ON c.column_name = pk.column_name
          WHERE c.table_schema = 'public' AND c.table_name = $1
          ORDER BY c.ordinal_position
        `),
        "all",
        tableName,
      );
      return rows.map((c) => ({
        name: c.name,
        type: c.type || "text",
        notnull: String(c.is_nullable || "").toUpperCase() === "NO",
        pk: Boolean(c.pk),
        dflt_value: c.dflt_value,
      }));
    }
    return db
      .prepare(`PRAGMA table_info("${tableName}")`)
      .all()
      .map((c) => ({
        name: c.name,
        type: c.type || "TEXT",
        notnull: Boolean(c.notnull),
        pk: Boolean(c.pk),
        dflt_value: c.dflt_value,
      }));
  } catch {
    return [];
  }
}

/** PK sebenarnya di DB (schema bisa id_pembuatan, DB dev bisa id) */
async function resolveTablePkColumn(table) {
  const schema = getSchema(table);
  const cols = await getTableColumnNames(table);
  const candidates = [
    schema?.primaryKey,
    "id_surat_aju",
    "id_pembuatanpap",
    "id_pembuatan_desa",
    "id_pembuatan",
    "id",
  ].filter(Boolean);
  for (const c of candidates) {
    if (cols.includes(c)) return c;
  }
  return schema?.primaryKey || "id";
}

/** Konversi nilai ke 0/1 untuk kolom boolean/integer di DB */
function toDbFlag(value) {
  if (value === true || value === 1) return 1;
  if (value === false || value === 0 || value === null || value === undefined)
    return 0;
  const s = String(value).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes" || s === "t") return 1;
  return 0;
}

function coerceSchemaFieldValue(field, value) {
  if (!field) return value;
  if (field.type === "boolean" || field.type === "checkbox") {
    return toDbFlag(value);
  }
  if (field.type === "number" && typeof value === "string" && value !== "") {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? 0 : n;
  }
  return value;
}

function legacyNotNullDefault(col) {
  const t = String(col.type || "").toLowerCase();
  if (col.dflt_value != null && col.dflt_value !== "") {
    const raw = String(col.dflt_value);
    if (raw.toUpperCase().includes("NEXTVAL")) {
      return 0;
    }
    if (raw.toUpperCase() === "CURRENT_TIMESTAMP") {
      return new Date().toISOString();
    }
    if (t === "boolean") {
      return toDbFlag(raw);
    }
    if (
      t.includes("int") ||
      t.includes("numeric") ||
      t.includes("serial") ||
      t.includes("decimal")
    ) {
      const stripped = raw.replace(/^'(.*)'$/, "$1").toLowerCase();
      if (stripped === "true" || stripped === "false")
        return toDbFlag(stripped);
      const n = parseInt(stripped, 10);
      return Number.isNaN(n) ? 0 : n;
    }
    return raw.replace(/^'(.*)'$/, "$1");
  }
  if (
    t.includes("int") ||
    t.includes("real") ||
    t.includes("numeric") ||
    t.includes("serial")
  )
    return 0;
  if (t.includes("boolean")) return 0;
  if (t.includes("date") || t.includes("time"))
    return new Date().toISOString().slice(0, 10);
  return "";
}

/** Isi kolom NOT NULL di DB yang tidak ada di schema / payload (mis. id_biodata di header surat) */
async function applyDbNotNullDefaults(table, data, fields) {
  const dbCols = await getTableColumnInfo(table);
  const schema = getSchema(table);
  const outFields = [...fields];
  const outData = { ...data };

  for (const col of dbCols) {
    if (!col.notnull || col.pk) continue;
    if (outFields.includes(col.name)) continue;

    const schemaField = schema?.fields?.find((f) => f.name === col.name);
    // id_biodata wajib di tabel biodata (personal, visa, …) — jangan timpa nilai user
    if (col.name === "id_biodata" && schemaField?.required) continue;

    outFields.push(col.name);
    if (col.name === "id_biodata") {
      outData.id_biodata = "";
    } else {
      outData[col.name] = schemaField
        ? coerceSchemaFieldValue(schemaField, legacyNotNullDefault(col))
        : legacyNotNullDefault(col);
    }
  }
  return { data: outData, fields: outFields };
}

/** PK header PAP — DB lama: id; DB legacy MySQL: id_pembuatanpap */
async function resolvePapHeaderPkColumn() {
  if (_papHeaderPkCol) return _papHeaderPkCol;
  const cols = await getTableColumnNames("pembuatan_tabelpap");
  _papHeaderPkCol = cols.includes("id_pembuatanpap") ? "id_pembuatanpap" : "id";
  return _papHeaderPkCol;
}

async function resolvePapDetailPkColumn() {
  if (_papDetailPkCol) return _papDetailPkCol;
  const cols = await getTableColumnNames("detail_tabelpap");
  _papDetailPkCol = cols.includes("id_pembuatan") ? "id_pembuatan" : "id";
  return _papDetailPkCol;
}

async function papHeaderIdExpr(alias = "p") {
  const col = await resolvePapHeaderPkColumn();
  return `${alias}.${col}`;
}

async function listPapBatches(options = {}) {
  const { page = 1, perPage = 25, search = "", idBiodata = "" } = options;
  const idExpr = await papHeaderIdExpr("p");
  const conditions = [];
  const params = [];

  if (idBiodata) {
    const bid = String(idBiodata).trim();
    const headerCols = await getTableColumnNames("pembuatan_tabelpap");
    const parts = [
      `EXISTS (SELECT 1 FROM detail_tabelpap d WHERE d.id_tabelpap = ${idExpr} AND d.id_biodata = ?)`,
    ];
    params.push(bid);
    if (headerCols.includes("id_biodata")) {
      parts.push(`TRIM(COALESCE(p.id_biodata, '')) = ?`);
      params.push(bid);
    }
    conditions.push(`(${parts.join(" OR ")})`);
  }

  if (search) {
    const s = `%${String(search).toLowerCase()}%`;
    conditions.push(`(
      lower(COALESCE(p.nomor,'')) LIKE ? OR lower(COALESCE(p.nomorktkln,'')) LIKE ?
      OR lower(COALESCE(p.daerah,'')) LIKE ? OR lower(COALESCE(p.kepada,'')) LIKE ?
      OR lower(COALESCE(p.tanggal,'')) LIKE ? OR lower(COALESCE(p.tanggalpap,'')) LIKE ?
    )`);
    params.push(s, s, s, s, s, s);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const countSql = `SELECT COUNT(DISTINCT ${idExpr}) AS total FROM pembuatan_tabelpap p ${where}`;
  const countRow = await q(db.prepare(countSql), "get", ...params);
  const total = Number(countRow?.total || 0);

  const limit = Math.max(1, parseInt(perPage, 10) || 25);
  const offset = Math.max(0, (parseInt(page, 10) || 1) - 1) * limit;

  const dataSql = `
    SELECT p.*, ${idExpr} AS id_pembuatanpap,
      (SELECT COUNT(*) FROM detail_tabelpap d WHERE d.id_tabelpap = ${idExpr}) AS jumlah_ctki
    FROM pembuatan_tabelpap p
    ${where}
    ORDER BY ${idExpr} DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  const data = normalizeRows(await q(db.prepare(dataSql), "all", ...params));
  return {
    data,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

async function getPapBatch(id) {
  const idExpr = await papHeaderIdExpr("p");
  const row = normalizeRow(
    await q(
      db.prepare(
        `SELECT p.*, ${idExpr} AS id_pembuatanpap FROM pembuatan_tabelpap p WHERE ${idExpr} = ?`,
      ),
      "get",
      id,
    ),
  );
  return row;
}

async function createPapBatch(data) {
  const payload = {
    nomor: data.nomor || "",
    nomorktkln: data.nomorktkln || "",
    kepada: data.kepada || "",
    daerah: data.daerah || "",
    tanggal: data.tanggal || "",
    tanggalpap: data.tanggalpap || "",
  };
  const created = await create("pembuatan_tabelpap", payload);
  const id = created.id_pembuatanpap ?? created.id ?? created.lastInsertRowid;
  return getPapBatch(id);
}

async function updatePapBatch(id, data) {
  const row = await getPapBatch(id);
  if (!row) return null;
  const idExpr = await papHeaderIdExpr("pembuatan_tabelpap");
  await q(
    db.prepare(`
    UPDATE pembuatan_tabelpap SET
      nomor = ?, nomorktkln = ?, kepada = ?, daerah = ?, tanggal = ?, tanggalpap = ?
    WHERE ${idExpr} = ?
  `),
    "run",
    data.nomor ?? row.nomor,
    data.nomorktkln ?? row.nomorktkln,
    data.kepada ?? row.kepada,
    data.daerah ?? row.daerah,
    data.tanggal ?? row.tanggal,
    data.tanggalpap ?? row.tanggalpap,
    id,
  );
  return getPapBatch(id);
}

async function deletePapBatch(id) {
  const row = await getPapBatch(id);
  if (!row) return false;
  const pk = row.id_pembuatanpap;
  await q(
    db.prepare("DELETE FROM detail_tabelpap WHERE id_tabelpap = ?"),
    "run",
    pk,
  );
  const idExpr = await papHeaderIdExpr("pembuatan_tabelpap");
  await q(
    db.prepare(`DELETE FROM pembuatan_tabelpap WHERE ${idExpr} = ?`),
    "run",
    pk,
  );
  return true;
}

async function listPapDetails(idTabelpap) {
  const detailPk = await resolvePapDetailPkColumn();
  const cols = await getTableColumnNames("detail_tabelpap");
  if (!cols.includes("id_tabelpap")) return [];
  return dbAllRows(
    `
    SELECT d."${detailPk}" AS id_pembuatan, d.id_tabelpap, d.id_biodata, p.nama
    FROM detail_tabelpap d
    LEFT JOIN personal p ON p.id_biodata = d.id_biodata
    WHERE d.id_tabelpap = ?
    ORDER BY d."${detailPk}" DESC
  `,
    idTabelpap,
  );
}

async function addPapDetail(idTabelpap, idBiodata) {
  const id = String(idBiodata || "").trim();
  if (!id) throw new Error("id_biodata wajib");
  const detailPk = await resolvePapDetailPkColumn();
  const exists = await q(
    db.prepare(
      `SELECT "${detailPk}" FROM detail_tabelpap WHERE id_tabelpap = ? AND id_biodata = ?`,
    ),
    "get",
    idTabelpap,
    id,
  );
  if (exists) throw new Error("CTKI sudah ada di batch PAP ini");
  return create("detail_tabelpap", { id_tabelpap: idTabelpap, id_biodata: id });
}

async function updatePapDetail(idPembuatan, idBiodata) {
  const id = String(idBiodata || "").trim();
  if (!id) throw new Error("id_biodata wajib");
  const detailPk = await resolvePapDetailPkColumn();
  await q(
    db.prepare(
      `UPDATE detail_tabelpap SET id_biodata = ? WHERE "${detailPk}" = ?`,
    ),
    "run",
    id,
    idPembuatan,
  );
  return normalizeRow(
    await q(
      db.prepare(`SELECT * FROM detail_tabelpap WHERE "${detailPk}" = ?`),
      "get",
      idPembuatan,
    ),
  );
}

async function deletePapDetail(idPembuatan) {
  const detailPk = await resolvePapDetailPkColumn();
  await q(
    db.prepare(`DELETE FROM detail_tabelpap WHERE "${detailPk}" = ?`),
    "run",
    idPembuatan,
  );
  return true;
}

async function getPapPrintPayload(id, type = "ppad") {
  const header = await getPapBatch(id);
  if (!header) return null;
  const details = await listPapDetails(header.id_pembuatanpap);
  return { type, header, details };
}

async function listNamapapOptions() {
  const tables = getTableNames();
  if (!tables.includes("datanamapap")) return [];
  const cols = await getTableColumnNames("datanamapap");
  const idCol = cols.includes("id")
    ? "id"
    : cols.includes("id_namapap")
      ? "id_namapap"
      : "id";
  return dbAllRows(
    `SELECT "${idCol}" AS id, isi, mandarin FROM datanamapap WHERE TRIM(COALESCE(isi,'')) != '' ORDER BY isi ASC`,
  );
}

/** Definisi batch print surat (header + detail CTKI) — parity modul surat_rekom_* legacy */
const PRINT_BATCH_DEFS = {
  pembuatan_tabelpap: {
    headerTable: "pembuatan_tabelpap",
    detailTable: "detail_tabelpap",
    detailFk: "id_tabelpap",
    headerPkCandidates: ["id_pembuatanpap", "id_pembuatan", "id"],
    idResponseField: "id_pembuatanpap",
    headerFields: [
      "nomor",
      "nomorktkln",
      "kepada",
      "daerah",
      "tanggal",
      "tanggalpap",
    ],
    searchFields: [
      "nomor",
      "nomorktkln",
      "kepada",
      "daerah",
      "tanggal",
      "tanggalpap",
    ],
  },
  pembuatan_tabelktkln: {
    headerTable: "pembuatan_tabelktkln",
    detailTable: "detail_tabelktkln",
    detailFk: "id_tabelktkln",
    headerPkCandidates: ["id_pembuatan", "id"],
    idResponseField: "id_pembuatan",
    headerFields: ["nomor", "kepada", "daerah", "jumlah", "tanggal"],
    searchFields: ["nomor", "kepada", "daerah", "jumlah", "tanggal"],
  },
  pembuatan_tabeldis: {
    headerTable: "pembuatan_tabeldis",
    detailTable: "detail_tabeldis",
    detailFk: "id_tabeldis",
    headerPkCandidates: ["id_pembuatan", "id"],
    idResponseField: "id_pembuatan",
    headerFields: ["daerah", "tanggal", "asuransi", "biaya"],
    searchFields: ["daerah", "tanggal", "asuransi", "biaya"],
  },
  pembuatan_tabeldis2: {
    headerTable: "pembuatan_tabeldis2",
    detailTable: "detail_tabeldis2",
    detailFk: "id_tabeldis2",
    headerPkCandidates: ["id_pembuatan", "id"],
    idResponseField: "id_pembuatan",
    headerFields: ["daerah", "tanggal", "asuransi", "biaya"],
    searchFields: ["daerah", "tanggal", "asuransi", "biaya"],
  },
  pembuatan_tabeldis3: {
    headerTable: "pembuatan_tabeldis3",
    detailTable: "detail_tabeldis3",
    detailFk: "id_tabeldis3",
    headerPkCandidates: ["id_pembuatan", "id"],
    idResponseField: "id_pembuatan",
    headerFields: ["daerah", "tanggal", "asuransi", "biaya"],
    searchFields: ["daerah", "tanggal", "asuransi", "biaya"],
  },
  pembuatan_laporan: {
    headerTable: "pembuatan_laporan",
    detailTable: "detail_laporan",
    detailFk: "id_laporan",
    headerPkCandidates: ["id_pembuatan", "id"],
    idResponseField: "id_pembuatan",
    headerFields: ["nomor", "tanggal", "tglmulai", "tglakhir"],
    searchFields: ["nomor", "tanggal", "tglmulai", "tglakhir"],
  },
  pembuatan_tabelhapap: {
    headerTable: "pembuatan_tabelhapap",
    detailTable: "detail_tabelhapap",
    detailFk: "id_tabelhapap",
    headerPkCandidates: ["id_pembuatan", "id"],
    idResponseField: "id_pembuatan",
    headerFields: ["daerah", "tanggal"],
    searchFields: ["daerah", "tanggal"],
  },
  surat_pengajuan: {
    headerTable: "surat_pengajuan",
    detailTable: "surat_pengajuan_data",
    detailFk: "aju_id",
    headerPkCandidates: ["id_surat_aju", "id"],
    idResponseField: "id_surat_aju",
    headerFields: [
      "pptkis",
      "lembaga",
      "no_surat",
      "nomor",
      "tanggal",
      "kepada",
    ],
    searchFields: [
      "pptkis",
      "lembaga",
      "no_surat",
      "nomor",
      "tanggal",
      "kepada",
    ],
    detailFields: ["id_biodata", "jumlah_pinjaman", "loan"],
  },
  pembuatan_tabungan: {
    headerTable: "pembuatan_tabungan",
    detailTable: "detail_pembuatan_tabungan",
    detailFk: "id_tabungan",
    headerPkCandidates: ["id_pembuatan", "id"],
    idResponseField: "id_pembuatan",
    headerFields: ["nomor", "lampiran", "perihal", "jabatan", "kepada"],
    searchFields: ["nomor", "lampiran", "perihal", "jabatan", "kepada"],
  },
  berita_acara_ntb: {
    headerTable: "berita_acara_ntb",
    detailTable: "detail_berita_acara_ntb",
    detailFk: "id_berita",
    headerPkCandidates: ["id"],
    idResponseField: "id",
    headerFields: [
      "nomor",
      "tanggal",
      "lokasi_penerbitan",
      "kepada",
      "wilayah",
      "negara_tujuan",
      "pimpinan_nama",
      "pimpinan_jabatan",
      "pimpinan_alamat",
      "isi",
    ],
    searchFields: ["nomor", "tanggal", "kepada", "wilayah", "negara_tujuan"],
  },
  srat_jalan_ntb: {
    headerTable: "srat_jalan_ntb",
    detailTable: "detail_srat_jalan_ntb",
    detailFk: "id_surat",
    headerPkCandidates: ["id"],
    idResponseField: "id",
    headerFields: [
      "nomor",
      "tanggal",
      "lokasi_penerbitan",
      "negara_tujuan",
      "pimpinan_nama",
      "kepada",
      "jenis_kelamin",
      "jumlah_cpmi",
    ],
    searchFields: ["nomor", "tanggal", "negara_tujuan", "kepada"],
  },
  pembuatan_opp: {
    headerTable: "pembuatan_opp",
    detailTable: "detail_pembuatan_opp",
    detailFk: "id_opp",
    headerPkCandidates: ["id"],
    idResponseField: "id",
    headerFields: [
      "nomor",
      "tanggal",
      "kepada",
      "peserta",
      "isi",
      "jumlah_peserta",
    ],
    searchFields: ["nomor", "tanggal", "kepada", "isi"],
  },
  pembatalan_opp: {
    headerTable: "pembatalan_opp",
    detailTable: "detail_pembatalan_opp",
    detailFk: "id_batal",
    headerPkCandidates: ["id"],
    idResponseField: "id",
    headerFields: [
      "nomor",
      "kepada",
      "agency",
      "penanggung_jawab",
      "tanggal_surat",
      "jumlah_peserta",
    ],
    searchFields: ["nomor", "kepada", "agency", "tanggal_surat"],
  },
  majikan_spbg: {
    headerTable: "majikan_spbg",
    detailTable: "detailmajikan_spbg",
    detailFk: "id_spbg",
    headerPkCandidates: ["id"],
    idResponseField: "id",
    headerFields: [
      "nomor",
      "tanggal",
      "kode_majikan",
      "namamajikan",
      "kode_agen",
      "spbgnama",
      "spbgdirektur",
      "template_override",
      "keterangan",
      "jumlah_peserta",
    ],
    searchFields: [
      "nomor",
      "tanggal",
      "namamajikan",
      "kode_majikan",
      "kode_agen",
    ],
  },
};

const _batchMetaCache = {};

function pickPayloadFields(data, allowedCols, fieldNames) {
  const payload = {};
  for (const name of fieldNames) {
    if (!allowedCols.includes(name)) continue;
    if (data[name] !== undefined && data[name] !== null)
      payload[name] = data[name];
  }
  return payload;
}

/** Insert baris hanya kolom yang ada nilainya — hindari NOT NULL legacy (mis. id_biodata di header batch) */
async function insertDynamicRow(table, data) {
  let colInfo = await getTableColumnInfo(table);
  if (!colInfo.length) {
    const schema = getSchema(table);
    if (schema?.fields) {
      colInfo = schema.fields.map((f) => ({
        name: f.name,
        notnull: Boolean(f.required),
        pk: false,
        type: f.type,
      }));
    }
  }
  const cols = colInfo.map((c) => c.name);
  const keys = Object.keys(data).filter(
    (k) => cols.includes(k) && data[k] !== undefined && data[k] !== null,
  );
  const params = {};
  keys.forEach((k) => {
    params[k] = data[k];
  });

  const schema = getSchema(table);
  for (const col of colInfo) {
    if (!col.notnull || col.pk || keys.includes(col.name)) continue;
    const schemaField = schema?.fields?.find((f) => f.name === col.name);
    if (col.name === "id_biodata") {
      keys.push(col.name);
      params[col.name] =
        data.id_biodata != null && data.id_biodata !== ""
          ? String(data.id_biodata)
          : "";
      continue;
    }
    keys.push(col.name);
    params[col.name] = schemaField
      ? coerceSchemaFieldValue(schemaField, legacyNotNullDefault(col))
      : legacyNotNullDefault(col);
  }

  if (!keys.length) throw new Error("Tidak ada kolom untuk disimpan");
  const placeholders = keys.map((k) => `@${k}`).join(", ");
  const sql = `INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${placeholders})`;
  const result = await q(db.prepare(sql), "run", params);
  const pkCol = await resolveTablePkColumn(table);
  const insertId = result.insertedRow?.[pkCol] ?? result.lastInsertRowid;
  if (result.insertedRow) {
    return normalizeRow(result.insertedRow);
  }
  if (insertId) {
    return normalizeRow(
      await q(
        db.prepare(`SELECT * FROM ${table} WHERE "${pkCol}" = ?`),
        "get",
        insertId,
      ),
    );
  }
  return data;
}

async function resolvePrintBatchMeta(batchKey) {
  if (_batchMetaCache[batchKey]) return _batchMetaCache[batchKey];
  const def = PRINT_BATCH_DEFS[batchKey];
  if (!def) throw new Error(`Modul batch tidak dikenal: ${batchKey}`);

  const headerCols = await getTableColumnNames(def.headerTable);
  const headerPk =
    def.headerPkCandidates.find((c) => headerCols.includes(c)) || "id";

  let detailPk = "id_pembuatan";
  let detailFk = def.detailFk;
  let detailCols = [];
  if (def.detailTable) {
    detailCols = await getTableColumnNames(def.detailTable);
    if (detailCols.includes("id_pembuatan")) detailPk = "id_pembuatan";
    else if (detailCols.includes("id_surat_pengajuan_data"))
      detailPk = "id_surat_pengajuan_data";
    else if (detailCols.includes("id")) detailPk = "id";
    if (!detailCols.includes(detailFk)) {
      const fkCandidates = [
        detailFk,
        `id_${def.headerTable.replace(/^pembuatan_/, "")}`,
        "id_berita",
        "id_surat",
        "id_tabungan",
        "id_opp",
        "id_laporan",
        "id_tabeldis",
        "id_tabeldis2",
        "id_tabeldis3",
        "id_tabelpap",
        "id_tabelktkln",
        "id_tabelhapap",
        "aju_id",
      ];
      detailFk = fkCandidates.find((c) => detailCols.includes(c)) || detailFk;
    }
  }

  const idField = headerCols.includes(def.idResponseField)
    ? def.idResponseField
    : headerPk;

  const meta = {
    ...def,
    batchKey,
    headerPk,
    detailPk,
    detailFk,
    headerCols,
    detailCols,
    idField,
  };
  _batchMetaCache[batchKey] = meta;
  return meta;
}

function getPrintBatchKeys() {
  return Object.keys(PRINT_BATCH_DEFS);
}

async function listPrintBatches(batchKey, options = {}) {
  const meta = await resolvePrintBatchMeta(batchKey);
  const { page = 1, perPage = 25, search = "", idBiodata = "" } = options;
  const idExpr = `p.${meta.headerPk}`;
  const conditions = [];
  const params = [];

  if (
    idBiodata &&
    meta.detailTable &&
    meta.detailCols.includes(meta.detailFk)
  ) {
    const bid = String(idBiodata).trim();
    const parts = [
      `EXISTS (SELECT 1 FROM ${meta.detailTable} d WHERE d.${meta.detailFk} = ${idExpr} AND d.id_biodata = ?)`,
    ];
    params.push(bid);
    if (meta.headerCols.includes("id_biodata")) {
      parts.push(`TRIM(COALESCE(p.id_biodata, '')) = ?`);
      params.push(bid);
    }
    conditions.push(`(${parts.join(" OR ")})`);
  }

  if (search && meta.searchFields?.length) {
    const s = `%${String(search).toLowerCase()}%`;
    const parts = meta.searchFields
      .filter((f) => meta.headerCols.includes(f))
      .map((f) => `lower(COALESCE(p.${f},'')) LIKE ?`);
    if (parts.length) {
      conditions.push(`(${parts.join(" OR ")})`);
      parts.forEach(() => params.push(s));
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const countSql = `SELECT COUNT(DISTINCT ${idExpr}) AS total FROM ${meta.headerTable} p ${where}`;
  const countRow = await q(db.prepare(countSql), "get", ...params);
  const total = Number(countRow?.total || 0);

  const limit = Math.max(1, parseInt(perPage, 10) || 25);
  const offset = Math.max(0, (parseInt(page, 10) || 1) - 1) * limit;

  let detailCountSql = "0";
  if (meta.detailTable && meta.detailCols.includes(meta.detailFk)) {
    detailCountSql = `(SELECT COUNT(*) FROM ${meta.detailTable} d WHERE d.${meta.detailFk} = ${idExpr})`;
  }

  const dataSql = `
    SELECT p.*, ${idExpr} AS ${meta.idField}, ${detailCountSql} AS jumlah_ctki
    FROM ${meta.headerTable} p
    ${where}
    ORDER BY ${idExpr} DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  const data = normalizeRows(
    await q(db.prepare(dataSql), "all", ...params),
  ).map((row) => {
    const cnt = Number(row.jumlah_ctki || 0);
    if (meta.headerCols.includes("jumlah_cpmi")) row.jumlah_cpmi = cnt;
    if (meta.headerCols.includes("jumlah_peserta")) row.jumlah_peserta = cnt;
    return row;
  });
  return {
    data,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

async function getPrintBatch(batchKey, id) {
  const meta = await resolvePrintBatchMeta(batchKey);
  const idExpr = `p.${meta.headerPk}`;
  const row = normalizeRow(
    await q(
      db.prepare(
        `SELECT p.*, ${idExpr} AS ${meta.idField} FROM ${meta.headerTable} p WHERE ${idExpr} = ?`,
      ),
      "get",
      id,
    ),
  );
  return row;
}

async function enrichPembatalanOppHeader(batchKey, data) {
  if (batchKey !== "pembatalan_opp" || !data || typeof data !== "object")
    return data;
  const out = { ...data };
  const agency = String(out.agency || "").trim();
  if (!agency) {
    throw new Error(
      "Agency wajib diisi. Pilih agency di form batch terlebih dahulu.",
    );
  }
  if (String(out.penanggung_jawab || "").trim()) return out;
  try {
    const agen = await getByField("dataagen", "kode_agen", agency);
    if (agen?.direktur) out.penanggung_jawab = String(agen.direktur).trim();
  } catch {
    /* ignore */
  }
  return out;
}

/** Isi agency demo yang masih kosong (record lama sebelum kolom agency dipakai) */
async function migratePembatalanOppDemoAgency() {
  if (!getTableNames().includes("pembatalan_opp")) return;
  const cols = await getTableColumnNames("pembatalan_opp");
  if (!cols.includes("agency")) return;
  const rows = normalizeRows(
    await q(
      db.prepare(`
      SELECT id, nomor FROM pembatalan_opp
      WHERE NULLIF(TRIM(agency), '') IS NULL
    `),
      "all",
    ),
  );
  for (const row of rows) {
    const nomor = String(row.nomor || "").trim();
    const isDemo = /^(DEMO-PS|TEST)-/i.test(nomor) || /BATAL-OPP/i.test(nomor);
    if (!isDemo) continue;
    await q(
      db.prepare("UPDATE pembatalan_opp SET agency = ? WHERE id = ?"),
      "run",
      "AG001",
      row.id,
    );
    console.log(
      `[DB] Set agency AG001 on pembatalan_opp #${row.id} (${nomor})`,
    );
  }
}

async function createPrintBatch(batchKey, data) {
  const meta = await resolvePrintBatchMeta(batchKey);
  const enriched = await enrichPembatalanOppHeader(batchKey, data);
  const payload = pickPayloadFields(
    enriched,
    meta.headerCols,
    meta.headerFields,
  );
  const created = await insertDynamicRow(meta.headerTable, payload);
  const pkVal =
    created[meta.idField] ??
    created[meta.headerPk] ??
    created.id ??
    created.lastInsertRowid;
  return getPrintBatch(batchKey, pkVal);
}

async function updatePrintBatch(batchKey, id, data) {
  const row = await getPrintBatch(batchKey, id);
  if (!row) return null;
  const meta = await resolvePrintBatchMeta(batchKey);
  const merged = await enrichPembatalanOppHeader(batchKey, { ...row, ...data });
  const payload = pickPayloadFields(merged, meta.headerCols, meta.headerFields);
  const sets = Object.keys(payload)
    .map((f) => `${f} = ?`)
    .join(", ");
  if (!sets) return getPrintBatch(batchKey, id);
  const vals = Object.values(payload);
  await q(
    db.prepare(
      `UPDATE ${meta.headerTable} SET ${sets} WHERE ${meta.headerPk} = ?`,
    ),
    "run",
    ...vals,
    id,
  );
  return getPrintBatch(batchKey, id);
}

async function deletePrintBatch(batchKey, id) {
  const row = await getPrintBatch(batchKey, id);
  if (!row) return false;
  const meta = await resolvePrintBatchMeta(batchKey);
  const pk = row[meta.idField];
  if (meta.detailTable && meta.detailCols.includes(meta.detailFk)) {
    await q(
      db.prepare(`DELETE FROM ${meta.detailTable} WHERE ${meta.detailFk} = ?`),
      "run",
      pk,
    );
  }
  await q(
    db.prepare(`DELETE FROM ${meta.headerTable} WHERE ${meta.headerPk} = ?`),
    "run",
    pk,
  );
  return true;
}

async function listPrintBatchDetails(batchKey, headerId) {
  const meta = await resolvePrintBatchMeta(batchKey);
  if (!meta.detailTable || !meta.detailCols.includes(meta.detailFk)) return [];
  const extraCols = (meta.detailFields || [])
    .filter((f) => f !== "id_biodata" && meta.detailCols.includes(f))
    .map((f) => `d.${f}`)
    .join(", ");
  const extraSql = extraCols ? `, ${extraCols}` : "";
  return dbAllRows(
    `
    SELECT d.${meta.detailPk} AS id_pembuatan, d.${meta.detailFk}, d.id_biodata, p.nama${extraSql}
    FROM ${meta.detailTable} d
    LEFT JOIN personal p ON p.id_biodata = d.id_biodata
    WHERE d.${meta.detailFk} = ?
    ORDER BY d.${meta.detailPk} DESC
  `,
    headerId,
  );
}

async function syncPrintBatchHeaderCount(batchKey, headerId) {
  const meta = await resolvePrintBatchMeta(batchKey);
  if (!meta.detailTable || !meta.detailCols.includes(meta.detailFk)) return;
  const countRow = await q(
    db.prepare(
      `SELECT COUNT(*) AS c FROM ${meta.detailTable} WHERE ${meta.detailFk} = ?`,
    ),
    "get",
    headerId,
  );
  const count = Number(countRow?.c || 0);
  const updates = {};
  if (meta.headerCols.includes("jumlah_cpmi")) updates.jumlah_cpmi = count;
  if (meta.headerCols.includes("jumlah_peserta"))
    updates.jumlah_peserta = count;
  if (!Object.keys(updates).length) return;
  const sets = Object.keys(updates)
    .map((f) => `${f} = ?`)
    .join(", ");
  await q(
    db.prepare(
      `UPDATE ${meta.headerTable} SET ${sets} WHERE ${meta.headerPk} = ?`,
    ),
    "run",
    ...Object.values(updates),
    headerId,
  );
}

async function fillPrintBatchDetailFromPersonal(
  insertData,
  detailCols,
  idBiodata,
) {
  const personal = normalizeRow(
    await q(
      db.prepare("SELECT * FROM personal WHERE id_biodata = ?"),
      "get",
      idBiodata,
    ),
  );
  if (!personal) return insertData;
  const map = {
    nama: personal.nama,
    jeniskelamin: personal.jeniskelamin,
    tempatlahir: personal.tempatlahir,
    tgllahir: personal.tgllahir,
    alamat: personal.alamat,
    negara: personal.negara1 || personal.negara,
    nopaspor: personal.nopaspor,
    noidentitas: personal.nik || personal.noidentitas,
  };
  for (const [col, val] of Object.entries(map)) {
    if (
      detailCols.includes(col) &&
      (insertData[col] === undefined || insertData[col] === "")
    ) {
      if (val != null && val !== "") insertData[col] = val;
    }
  }
  return insertData;
}

function resolveTkiPenempatanKodeAgen(detail) {
  if (!detail) return "";
  const fromMajikan = String(detail.majikan?.kode_agen || "").trim();
  if (fromMajikan) return fromMajikan;
  const rows = detail.markaBiotoagen || detail.marka_biotoagen || [];
  if (!Array.isArray(rows)) return "";
  for (const r of rows) {
    const k = String(r?.kode_agen || "").trim();
    if (k) return k;
  }
  return "";
}

/** Validasi TKI siap Pembatalan OPP — sudah punya majikan dan kode agen */
function assertTkiPenempatanForOpp(detail, idBiodata) {
  const id =
    String(idBiodata || detail?.personal?.id_biodata || "").trim() || "TKI";
  const maj = detail?.majikan || {};
  const namaMajikan = String(maj.namamajikan || "").trim();
  const kodeAgen = resolveTkiPenempatanKodeAgen(detail);

  if (!namaMajikan && !kodeAgen) {
    throw new Error(
      `TKI ${id} belum punya data majikan atau agen. Lengkapi penempatan di biodata (Marketing) terlebih dahulu.`,
    );
  }
  if (!namaMajikan) {
    throw new Error(
      `TKI ${id} belum punya nama majikan. Lengkapi data majikan di biodata terlebih dahulu.`,
    );
  }
  if (!kodeAgen) {
    throw new Error(
      `TKI ${id} belum punya kode agen. Isi kode agen di data majikan atau penugasan agen (marka) terlebih dahulu.`,
    );
  }
  return kodeAgen;
}

async function assertPembatalanOppDetailAgency(batchKey, headerId, idBiodata) {
  if (batchKey !== "pembatalan_opp") return;
  const header = await getPrintBatch(batchKey, headerId);
  const agencyKey = String(header?.agency || "").trim();
  if (!agencyKey) {
    throw new Error(
      "Agency batch belum diisi. Edit header batch dan pilih agency terlebih dahulu.",
    );
  }
  const detail = await getBiodataDetail(idBiodata);
  if (!detail?.personal) {
    throw new Error(`Biodata TKI ${idBiodata} tidak ditemukan.`);
  }
  const tkiAgen = assertTkiPenempatanForOpp(detail, idBiodata);
  if (tkiAgen !== agencyKey) {
    let agenLabel = agencyKey;
    try {
      const agen = await getByField("dataagen", "kode_agen", agencyKey);
      if (agen?.nama) agenLabel = `${agen.nama} (${agencyKey})`;
    } catch {
      /* ignore */
    }
    throw new Error(
      `TKI bukan dari agency ${agenLabel}. Hanya TKI agency yang sama yang boleh ditambahkan.`,
    );
  }
}

async function addPrintBatchDetail(batchKey, headerId, body) {
  const meta = await resolvePrintBatchMeta(batchKey);
  const payload =
    body && typeof body === "object" ? body : { id_biodata: body };
  const id = String(payload.id_biodata || "").trim();
  if (!id) throw new Error("id_biodata wajib");
  if (!meta.detailTable) throw new Error("Tabel detail tidak tersedia");

  await assertPembatalanOppDetailAgency(batchKey, headerId, id);

  const exists = await q(
    db.prepare(
      `SELECT ${meta.detailPk} FROM ${meta.detailTable} WHERE ${meta.detailFk} = ? AND id_biodata = ?`,
    ),
    "get",
    headerId,
    id,
  );
  if (exists) throw new Error("CTKI sudah ada di batch ini");

  const insertData = { [meta.detailFk]: headerId, id_biodata: id };
  for (const f of meta.detailFields || []) {
    if (f === "id_biodata" || f === meta.detailFk) continue;
    if (payload[f] !== undefined && meta.detailCols.includes(f)) {
      insertData[f] = payload[f];
    }
  }
  await fillPrintBatchDetailFromPersonal(insertData, meta.detailCols, id);
  const row = await insertDynamicRow(meta.detailTable, insertData);
  await syncPrintBatchHeaderCount(batchKey, headerId);
  return row;
}

async function updatePrintBatchDetail(batchKey, detailId, idBiodata) {
  const meta = await resolvePrintBatchMeta(batchKey);
  const id = String(idBiodata || "").trim();
  if (!id) throw new Error("id_biodata wajib");
  await q(
    db.prepare(
      `UPDATE ${meta.detailTable} SET id_biodata = ? WHERE ${meta.detailPk} = ?`,
    ),
    "run",
    id,
    detailId,
  );
  return normalizeRow(
    await q(
      db.prepare(
        `SELECT * FROM ${meta.detailTable} WHERE ${meta.detailPk} = ?`,
      ),
      "get",
      detailId,
    ),
  );
}

async function deletePrintBatchDetail(batchKey, detailId) {
  const meta = await resolvePrintBatchMeta(batchKey);
  const existing = normalizeRow(
    await q(
      db.prepare(
        `SELECT ${meta.detailFk} FROM ${meta.detailTable} WHERE ${meta.detailPk} = ?`,
      ),
      "get",
      detailId,
    ),
  );
  await q(
    db.prepare(`DELETE FROM ${meta.detailTable} WHERE ${meta.detailPk} = ?`),
    "run",
    detailId,
  );
  if (existing?.[meta.detailFk] != null) {
    await syncPrintBatchHeaderCount(batchKey, existing[meta.detailFk]);
  }
  return true;
}

async function getPrintBatchPayload(batchKey, id, type = "default") {
  const meta = await resolvePrintBatchMeta(batchKey);
  const header = await getPrintBatch(batchKey, id);
  if (!header) return null;
  const details = await listPrintBatchDetails(batchKey, header[meta.idField]);
  return {
    type,
    batchKey,
    header,
    details,
    meta: { titleField: meta.idField },
  };
}

/** Sinkronkan katalog print surat ke letter_templates */
async function syncPrintSuratLetterTemplates(cfg) {
  const tables = getTableNames();
  if (!tables.includes("letter_templates") || !cfg?.templates?.length)
    return { synced: 0 };
  let synced = 0;
  const ins = db.prepare(
    `INSERT INTO letter_templates (kode, nama, kategori, engine, file_path, sektor, modul_legacy, aktif)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
  );
  for (const t of cfg.templates) {
    const exists = await getLetterTemplateByKode(t.kode);
    if (exists) continue;
    await q(
      ins,
      "run",
      t.kode,
      t.nama,
      t.kategori || "print_surat",
      t.engine || "word",
      t.file_path,
      "",
      t.modul_legacy || "",
    );
    synced++;
  }
  return { synced };
}

async function listIjinBatches(options = {}) {
  const { page = 1, perPage = 25, search = "" } = options;
  if (!getTableNames().includes("surat_rekom_ijin_batch")) {
    return { data: [], pagination: { page, perPage, total: 0, totalPages: 1 } };
  }
  const conditions = [];
  const params = [];
  if (search) {
    conditions.push(
      `(lower(COALESCE(tgl,'')) LIKE ? OR lower(COALESCE(tipe,'')) LIKE ? OR lower(COALESCE(tki,'')) LIKE ?)`,
    );
    const s = `%${String(search).toLowerCase()}%`;
    params.push(s, s, s);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const total = Number(
    (
      await q(
        db.prepare(`SELECT COUNT(*) AS c FROM surat_rekom_ijin_batch ${where}`),
        "get",
        ...params,
      )
    )?.c || 0,
  );
  const limit = Math.max(1, parseInt(perPage, 10) || 25);
  const offset = Math.max(0, (parseInt(page, 10) || 1) - 1) * limit;
  const rows = normalizeRows(
    await q(
      db.prepare(
        `SELECT * FROM surat_rekom_ijin_batch ${where} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`,
      ),
      "all",
      ...params,
    ),
  ).map((r) => ({
    ...r,
    jumlah_ctki: parseIjinBatchTkiCsv(r.tki).length,
  }));
  return {
    data: rows,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

async function getIjinBatch(id) {
  if (!getTableNames().includes("surat_rekom_ijin_batch")) return null;
  return normalizeRow(
    await q(
      db.prepare("SELECT * FROM surat_rekom_ijin_batch WHERE id = ?"),
      "get",
      id,
    ),
  );
}

async function createIjinBatch(data) {
  return create("surat_rekom_ijin_batch", {
    tgl: data.tgl || "",
    tki: data.tki || "",
    tipe: data.tipe || "LANDSCAPE",
  });
}

async function updateIjinBatch(id, data) {
  const row = await getIjinBatch(id);
  if (!row) return null;
  await update("surat_rekom_ijin_batch", id, {
    tgl: data.tgl ?? row.tgl,
    tki: data.tki ?? row.tki,
    tipe: data.tipe ?? row.tipe,
  });
  return getIjinBatch(id);
}

async function deleteIjinBatch(id) {
  return remove("surat_rekom_ijin_batch", id);
}

function parseIjinBatchTkiCsv(tkiCsv) {
  return String(tkiCsv || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function serializeIjinBatchTkiCsv(ids) {
  return [
    ...new Set((ids || []).map((x) => String(x).trim()).filter(Boolean)),
  ].join(",");
}

async function resolveIjinBatchPersonal(tkiCsv) {
  const ids = parseIjinBatchTkiCsv(tkiCsv);
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  return dbAllRows(
    `SELECT id_biodata, nama FROM personal WHERE id_biodata IN (${placeholders})`,
    ...ids,
  );
}

/** Daftar CTKI dalam batch ijin — parity detailtabelpap (bukan input CSV manual) */
async function listIjinBatchDetails(batchId) {
  const batch = await getIjinBatch(batchId);
  if (!batch) return null;
  const ids = parseIjinBatchTkiCsv(batch.tki);
  if (!ids.length) return { batch, details: [] };
  const placeholders = ids.map(() => "?").join(",");
  const rows = await dbAllRows(
    `SELECT p.id_biodata, p.nama, d.nodisnaker
     FROM personal p
     LEFT JOIN disnaker d ON d.id_biodata = p.id_biodata
     WHERE p.id_biodata IN (${placeholders})
     ORDER BY p.id_biodata`,
    ...ids,
  );
  const byId = new Map(rows.map((r) => [r.id_biodata, r]));
  const details = ids.map((id, i) => {
    const r = byId.get(id) || { id_biodata: id, nama: "", nodisnaker: "" };
    return {
      no: i + 1,
      id_biodata: r.id_biodata,
      nama: r.nama || "",
      nodisnaker: r.nodisnaker || "",
    };
  });
  return { batch, details };
}

async function addIjinBatchDetail(batchId, idBiodata) {
  const batch = await getIjinBatch(batchId);
  if (!batch) return null;
  const id = String(idBiodata || "").trim();
  if (!id) throw new Error("ID biodata wajib");
  const ids = parseIjinBatchTkiCsv(batch.tki);
  if (ids.includes(id)) return listIjinBatchDetails(batchId);
  ids.push(id);
  await updateIjinBatch(batchId, { tki: serializeIjinBatchTkiCsv(ids) });
  return listIjinBatchDetails(batchId);
}

async function removeIjinBatchDetail(batchId, idBiodata) {
  const batch = await getIjinBatch(batchId);
  if (!batch) return null;
  const id = String(idBiodata || "").trim();
  const ids = parseIjinBatchTkiCsv(batch.tki).filter((x) => x !== id);
  await updateIjinBatch(batchId, { tki: serializeIjinBatchTkiCsv(ids) });
  return listIjinBatchDetails(batchId);
}

/** Data export Excel surat pengajuan bank — parity surat_pengajuan_keuangan/printxls_test */
async function getSuratPengajuanExportPayload(id) {
  const tables = getTableNames();
  if (!tables.includes("surat_pengajuan")) return null;

  const headerCols = await getTableColumnNames("surat_pengajuan");
  const pk = await resolveTablePkColumn("surat_pengajuan");
  const header = normalizeRow(
    await q(
      db.prepare(`SELECT * FROM surat_pengajuan WHERE "${pk}" = ?`),
      "get",
      id,
    ),
  );
  if (!header) return null;

  const ajuId = header.id_surat_aju ?? header.id;
  const detailCols = tables.includes("surat_pengajuan_data")
    ? await getTableColumnNames("surat_pengajuan_data")
    : [];
  const legacyDetail = detailCols.includes("aju_id");

  const bank = header.lembaga || header.kepada || "";
  const tanggal = header.tanggal || header.tgl || "";
  const pptkis = header.pptkis || appConfig.getOrgName();

  function deriveStatus(idBiodata, fromDb) {
    if (fromDb) return fromDb;
    return "";
  }

  let rows = [];

  if (legacyDetail) {
    const sql = `
      SELECT
        dis.nodisnaker AS vid,
        b.notelp AS hp,
        upper(ds.jenis_sektor) AS status,
        b.warganegara AS negara,
        e.nodisnaker AS id,
        e.nama AS nama,
        COALESCE(dm.nama, m.namamajikan, '') AS majikan,
        c.nopaspor AS paspor,
        f.nama AS agen,
        a.jumlah_pinjaman AS pinjaman,
        a.loan AS load,
        fa.nama_ibu AS ibu
      FROM surat_pengajuan_data a
      LEFT JOIN personal b ON a.id_biodata = b.id_biodata
      LEFT JOIN paspor c ON a.id_biodata = c.id_biodata
      LEFT JOIN majikan m ON a.id_biodata = m.id_biodata
      LEFT JOIN datamajikan dm ON dm.id_majikan = m.kode_majikan
      LEFT JOIN disnaker e ON a.id_biodata = e.id_biodata
      LEFT JOIN dataagen f ON m.kode_agen = f.id_agen
      LEFT JOIN family fa ON fa.id_biodata = b.id_biodata
      LEFT JOIN disnaker dis ON dis.id_biodata = b.id_biodata
      LEFT JOIN datasektor ds ON ds.kode_jenis = CASE
        WHEN instr(b.id_biodata, '-') > 0 THEN substr(b.id_biodata, 1, instr(b.id_biodata, '-') - 1)
        ELSE substr(b.id_biodata, 1, 2) END
      WHERE a.aju_id = ?
    `;
    try {
      rows = await dbAllRows(sql, String(ajuId));
    } catch {
      rows = [];
    }
  }

  if (!rows.length && header.id_biodata) {
    const idBio = header.id_biodata;
    const sqlOne = `
      SELECT
        dis.nodisnaker AS vid,
        b.notelp AS hp,
        upper(ds.jenis_sektor) AS status,
        b.warganegara AS negara,
        e.nodisnaker AS id,
        e.nama AS nama,
        COALESCE(dm.nama, m.namamajikan, '') AS majikan,
        c.nopaspor AS paspor,
        f.nama AS agen,
        '' AS pinjaman,
        '' AS load,
        fa.nama_ibu AS ibu
      FROM personal b
      LEFT JOIN paspor c ON b.id_biodata = c.id_biodata
      LEFT JOIN majikan m ON b.id_biodata = m.id_biodata
      LEFT JOIN datamajikan dm ON dm.id_majikan = m.kode_majikan
      LEFT JOIN disnaker e ON b.id_biodata = e.id_biodata
      LEFT JOIN dataagen f ON m.kode_agen = f.id_agen
      LEFT JOIN family fa ON fa.id_biodata = b.id_biodata
      LEFT JOIN disnaker dis ON dis.id_biodata = b.id_biodata
      LEFT JOIN datasektor ds ON ds.kode_jenis = CASE
        WHEN instr(b.id_biodata, '-') > 0 THEN substr(b.id_biodata, 1, instr(b.id_biodata, '-') - 1)
        ELSE substr(b.id_biodata, 1, 2) END
      WHERE b.id_biodata = ?
    `;
    try {
      const one = await dbAllRows(sqlOne, idBio);
      if (one.length) {
        rows = [
          {
            ...one[0],
            pinjaman: header.jumlah_pinjaman || header.isi || "",
            load: header.loan || "",
          },
        ];
      }
    } catch {
      /* ignore */
    }
  }

  return {
    header: { bank, tanggal, pptkis },
    rows: rows.map((r) => ({
      vid: r.vid || "",
      hp: r.hp || "",
      status: deriveStatus(r.vid || r.id, r.status),
      negara: r.negara || "",
      id: r.id || "",
      nama: r.nama || "",
      majikan: r.majikan || "",
      paspor: r.paspor || "",
      agen: r.agen || "",
      pinjaman: r.pinjaman ?? "",
      load: r.load ?? "",
      ibu: r.ibu || "",
    })),
  };
}

// Bulk delete
async function bulkDelete(table, ids) {
  const pk = await resolveTablePkColumn(table);
  const placeholders = ids.map(() => "?").join(", ");
  const result = await q(
    db.prepare(`DELETE FROM "${table}" WHERE "${pk}" IN (${placeholders})`),
    "run",
    ...ids,
  );
  return result.changes;
}

// =====================================================
// MENU ROLE MAPPING HELPERS
// =====================================================

/**
 * Build menu structure from database mappings
 * @param {Array} mappings - Array of menu_role_mapping records
 * @returns {Array} Menu structure
 */
const DASHBOARD_MENU_ITEM = {
  name: "Dashboard",
  icon: "fas fa-home",
  page: "/",
};
const COMPANY_PROFILE_ITEM = {
  name: "Profil Perusahaan",
  icon: "fas fa-building",
  page: "/profil-perusahaan",
};
const MENU_SETTINGS_ITEM = {
  name: "Pengaturan Menu",
  icon: "fas fa-sitemap",
  page: "/menu-role-manager",
};
const PENGATURAN_GROUP_ICON = "fas fa-gear";
const ROLES_WITH_DASHBOARD = DASHBOARD_ROLES;

function menuMappingRowActive(row) {
  const v = row?.is_active;
  return (
    v !== false && v !== 0 && v !== "0" && String(v).toLowerCase() !== "false"
  );
}

function menuHasPath(items, path) {
  for (const it of items || []) {
    if (it.page === path) return true;
    if (it.children && menuHasPath(it.children, path)) return true;
  }
  return false;
}

/** Pastikan Dashboard (/) ada (super_admin/Owner & role monitoring cabang) */
function ensureDashboardInSideMenu(sideMenu, role) {
  const r = normalizeRole(role || "");
  if (!ROLES_WITH_DASHBOARD.includes(r)) {
    return sideMenu || [];
  }
  const menu = [...(sideMenu || [])];
  if (!menuHasPath(menu, "/")) {
    menu.unshift({ ...DASHBOARD_MENU_ITEM });
  }
  return menu;
}

/** Sembunyikan menu khusus Owner (Pengguna, Cabang, Pengaturan Menu) dari sidebar admin */
function stripOwnerOnlyFromSideMenu(sideMenu) {
  const filterChildren = (children) => {
    const out = [];
    for (const c of children || []) {
      if (c.page && OWNER_ONLY_MENU_PATHS.has(c.page)) continue;
      const copy = { ...c };
      if (copy.children?.length) {
        copy.children = filterChildren(copy.children);
        if (!copy.children.length && !copy.page) continue;
      }
      if (!copy.page && !copy.children?.length) continue;
      out.push(copy);
    }
    return out;
  };

  const out = [];
  for (const item of sideMenu || []) {
    const copy = { ...item };
    if (copy.page && OWNER_ONLY_MENU_PATHS.has(copy.page)) continue;
    if (copy.children?.length) {
      copy.children = filterChildren(copy.children);
      if (!copy.children.length && !copy.page) continue;
    }
    out.push(copy);
  }
  return out;
}

/** Owner (super_admin): pastikan Pengaturan Menu ada di grup Pengaturan */
function ensureOwnerSettingsInSideMenu(sideMenu, role) {
  if (normalizeRole(role) !== "super_admin") return sideMenu || [];
  const menu = [...(sideMenu || [])];
  let group = menu.find(
    (it) =>
      it.name === "Pengaturan" ||
      (it.children &&
        it.children.some(
          (c) => c.page === "/users" || c.page === "/datacabang",
        )),
  );
  if (!group) {
    group = { name: "Pengaturan", icon: PENGATURAN_GROUP_ICON, children: [] };
    menu.push(group);
  }
  if (!group.children) group.children = [];
  if (!group.icon || group.icon === "fas fa-folder")
    group.icon = PENGATURAN_GROUP_ICON;
  if (!menuHasPath(group.children, "/profil-perusahaan")) {
    group.children.push({ ...COMPANY_PROFILE_ITEM });
  }
  if (!menuHasPath(group.children, "/menu-role-manager")) {
    group.children.push({ ...MENU_SETTINGS_ITEM });
  }
  group.children.sort((a, b) => {
    const order = {
      "/users": 1,
      "/datacabang": 2,
      "/profil-perusahaan": 3,
      "/menu-role-manager": 4,
    };
    return (order[a.page] || 99) - (order[b.page] || 99);
  });
  return menu;
}

/** Hilangkan item menu ganda (path sama di level yang sama) */
function dedupeMenuByPage(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const copy = { ...item };
    if (copy.children?.length) {
      copy.children = dedupeMenuByPage(copy.children);
      const childPages = new Set(
        (copy.children || []).map((c) => c.page).filter(Boolean),
      );
      if (copy.page && childPages.has(copy.page)) {
        continue;
      }
      if (!copy.children.length && !copy.page) continue;
      out.push(copy);
      continue;
    }
    if (!copy.page) continue;
    if (seen.has(copy.page)) continue;
    seen.add(copy.page);
    out.push(copy);
  }
  return out;
}

function buildMenuFromMappings(mappings) {
  const rows = [...mappings]
    .filter(menuMappingRowActive)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const parentGroups = new Map();
  const topLevel = [];
  const topPaths = new Set();

  for (const mapping of rows) {
    const path = mapping.menu_path;
    if (!path) continue;
    const item = {
      name: mapping.menu_name,
      icon: path === "/" ? "fas fa-home" : mapping.icon || "fas fa-circle",
      page: path,
    };
    const parentKey = mapping.parent_path;
    if (!parentKey) {
      if (topPaths.has(path)) continue;
      topPaths.add(path);
      topLevel.push(item);
    } else {
      if (!parentGroups.has(parentKey)) {
        parentGroups.set(parentKey, {
          name: parentKey,
          icon:
            parentKey === "Pengaturan"
              ? PENGATURAN_GROUP_ICON
              : "fas fa-folder",
          children: [],
        });
      }
      const group = parentGroups.get(parentKey);
      if (group.children.some((c) => c.page === path)) continue;
      group.children.push(item);
    }
  }

  return dedupeMenuByPage([...topLevel, ...parentGroups.values()]);
}

function mappingRowToMenuFlags(row) {
  return {
    can_create: !!row.can_create,
    can_update: !!row.can_update,
    can_delete: !!row.can_delete,
  };
}

/** Permission CRUD per path menu untuk satu role */
async function loadMenuPermissionsForRole(role, options = {}) {
  const userRole = normalizeRole(role || "");
  if (
    !options.fromDbOnly &&
    (isOwnerRole(userRole) || isAdminCabangRole(userRole))
  ) {
    return null;
  }
  const result = await list("menu_role_mapping", {
    filters: { role: userRole },
    sort: "sort_order",
    order: "asc",
    perPage: 1000,
  });
  const perms = {};
  for (const row of (result?.data || []).filter(menuMappingRowActive)) {
    if (!row.menu_path) continue;
    perms[row.menu_path] = mappingRowToMenuFlags(row);
  }
  return perms;
}

/** Ubah flags menu → format permissions CrudEngine (role tunggal) */
function buildCrudPermissionsFromMenuFlags(flags, role) {
  const deny = ["__none__"];
  const r = String(role || "").toLowerCase();
  if (!flags) return null;
  return {
    _explicit: true,
    create: flags.can_create ? [r] : deny,
    read: [r],
    update: flags.can_update ? [r] : deny,
    delete: flags.can_delete ? [r] : deny,
  };
}

async function loadSideMenuForRole(role) {
  const userRole = normalizeRole(role || "");
  if (isOwnerRole(userRole)) return null;
  const result = await list("menu_role_mapping", {
    filters: { role: userRole },
    sort: "sort_order",
    order: "asc",
    perPage: 1000,
  });
  const rawRows = (result?.data || []).filter(menuMappingRowActive);
  if (!rawRows.length) return null;
  const seen = new Set();
  const rows = [];
  for (const row of rawRows) {
    const key = `${row.menu_path}|${row.parent_path || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  let built = ensureDashboardInSideMenu(buildMenuFromMappings(rows), userRole);
  if (isAdminCabangRole(userRole)) {
    built = stripOwnerOnlyFromSideMenu(built);
  }
  return ensureOwnerSettingsInSideMenu(built, userRole);
}

module.exports = {
  init,
  getDb,
  getSchema,
  getTableNames,
  loadSchemas,
  schemaToCreateSQL,
  schemaToSyncSQL,
  getSchemaDbStatus,
  syncSingleSchemaTable,
  getTableColumnInfo,
  // CRUD
  list,
  getById,
  create,
  update,
  remove,
  bulkDelete,
  // Kanban
  listKanban,
  updatePipelineField,
  reorderInStage,
  getDashboardStats,
  getUserNotifications,
  createAppNotification,
  listAppNotifications,
  getBiodataDetail,
  getBiodataBiodataShell,
  getBiodataAdminShell,
  getBiodataMarketingShell,
  getBiodataSection,
  getBiodataBiodataSection,
  getBiodataAdminSection,
  getBiodataMarketingSection,
  computeBiodataFlowProgress,
  computeAdminFlowProgress,
  computeMarketingFlowProgress,
  ensureMarkProgressForTki,
  getPrintDataStats,
  getMedicalBelumTerbangReport,
  getExpireTglOnlineReport,
  listTkiReport,
  getTkiReportChart,
  listBlkReport: (...args) =>
    require("./services/blk-report-service").listBlkReport(...args),
  getBlkReportChart: (...args) =>
    require("./services/blk-report-service").getBlkReportChart(...args),
  listKeuanganReport: (...args) =>
    require("./services/keuangan-report-service").listKeuanganReport(...args),
  getKeuanganReportChart: (...args) =>
    require("./services/keuangan-report-service").getKeuanganReportChart(
      ...args,
    ),
  queryAll: dbAllRows,
  listPapBatches,
  getPapBatch,
  createPapBatch,
  updatePapBatch,
  deletePapBatch,
  listPapDetails,
  addPapDetail,
  updatePapDetail,
  deletePapDetail,
  getPapPrintPayload,
  getPrintBatchKeys,
  listPrintBatches,
  getPrintBatch,
  createPrintBatch,
  updatePrintBatch,
  deletePrintBatch,
  listPrintBatchDetails,
  addPrintBatchDetail,
  updatePrintBatchDetail,
  deletePrintBatchDetail,
  getPrintBatchPayload,
  syncPrintSuratLetterTemplates,
  listIjinBatches,
  getIjinBatch,
  createIjinBatch,
  updateIjinBatch,
  deleteIjinBatch,
  resolveIjinBatchPersonal,
  listIjinBatchDetails,
  addIjinBatchDetail,
  removeIjinBatchDetail,
  getSuratPengajuanExportPayload,
  listNamapapOptions,
  listLetterTemplates,
  getLetterTemplateByKode,
  listHtmlDocumentTemplates,
  getHtmlDocumentTemplate,
  getBiodataFiskal,
  isChongyiMajikanByKode,
  isChongyiMajikanForBiodata,
  getUploadSummaryForBiodata,
  enrichPersonalListDocStatus,
  enrichPersonalListDetailPekerjaan,
  enrichDatatkiListFromPersonal,
  syncDetailPekerjaanForBiodata,
  DOC_FIELD_UPLOAD_TYPES,
  getPersonalStatusContext,
  validatePersonalStatusChange,
  changePersonalStatus,
  syncPersonalStatusAfterMajikanSave,
  reconcilePersonalStatus,
  appendPersonalStatusHistory,
  listPersonalStatusHistory,
  recordVisaDeparture,
  updateDokumenIdentitasFile,
  clearDokumenIdentitasFile,
  updatePersonalFoto,
  DOKUMEN_IDENTITAS_FIELDS,
  getKodeSektorFromBiodataId,
  getDatasektorByKode,
  getDatasektorByBiodataId,
  getSektorCodesByJenis,
  patchMenuMappingUploadTab,
  patchMenuMappingIMSector,
  patchMenuMappingBiodataExtras,
  patchMenuMappingPlanningMatrix,
  seedMenuMappingForSector,
  syncMenuMappingFromConfigForSector,
  syncMenuMappingPlanning,
  resetMenuMappingFromConfig,
  seedDatasektorCore,
  ensureDatacabangCore,
  seedMenuMapping,
  ensureBootstrapData,
  getByField,
  getMenuMappingBySektor,
  createTkiBiodata,
  getNextBiodataSequence,
  assertPersonalIdBiodataUnique,
  resolveBiodataInputId,
  ensureIdTkiBackfill: () => getIdTkiService().ensureIdTkiBackfill(getDbApi()),
  pindahSektorTki: (idTki, options) =>
    getIdTkiService().pindahSektorTki(getDbApi(), idTki, options),
  findAllEpisodesByIdTki: (idTki) =>
    getIdTkiService().findAllEpisodesByIdTki(getDbApi(), idTki),
  resolveIdTki: (input) => getIdTkiService().resolveIdTki(getDbApi(), input),
  listByIdBiodata,
  getPersonalDeleteEligibility,
  removePersonalCascade,
  getBiodataReadinessSummary,
  setBiodataWorkflowStatus,
  getRecentActivities,
  convertLead,
  getEntityTimeline,
  getCalendarEvents,
  getSalesReport,
  exportTableCsv,
  findUserByEmail,
  ensurePrimaryAdmin,
  updateUserPassword,
  saveFamilyFromKkOcr,
  buildMenuFromMappings,
  ensureDashboardInSideMenu,
  ensureOwnerSettingsInSideMenu,
  stripOwnerOnlyFromSideMenu,
  loadSideMenuForRole,
  loadMenuPermissionsForRole,
  buildCrudPermissionsFromMenuFlags,
  ROLES_WITH_DASHBOARD,
};
