// Driver PostgreSQL — API kompatibel dengan wrapper sql.js (prepare/get/all/run)
const { Pool } = require('pg');

let pool = null;
let activeClient = null;

function usePostgres() {
  return !!(
    process.env.DATABASE_URL
    || process.env.DB_HOST
    || process.env.POSTGRES_HOST
  );
}

function buildPoolConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {
    host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.DB_USER || process.env.POSTGRES_USER || 'crm',
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'crm',
    database: process.env.DB_NAME || process.env.POSTGRES_DB || 'crm'
  };
}

function getQueryClient() {
  return activeClient || pool;
}

function normalizeSql(sql) {
  return sql
    .replace(/datetime\s*\(\s*'now'\s*\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/datetime\s*\(\s*([a-zA-Z0-9_."]+)\s*\)/gi, '($1::timestamp)')
    .replace(/\bORDER\s+BY\s+rowid\b/gi, 'ORDER BY id')
    .replace(/\browid\b/gi, 'id');
}

function compileQuery(sql, params) {
  const normalized = normalizeSql(sql);

  if (params.length === 1 && params[0] != null && typeof params[0] === 'object' && !Array.isArray(params[0])) {
    const obj = params[0];
    const order = [];
    const text = normalized.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
      order.push(name);
      return `$${order.length}`;
    });
    const values = order.map((name) => {
      if (Object.prototype.hasOwnProperty.call(obj, name)) return obj[name];
      if (Object.prototype.hasOwnProperty.call(obj, `@${name}`)) return obj[`@${name}`];
      return null;
    });
    return { text, values };
  }

  let index = 0;
  const text = normalized.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
  const values = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  return { text, values };
}

function createStatement(sql) {
  return {
    async all(...params) {
      const { text, values } = compileQuery(sql, params);
      const res = await getQueryClient().query(text, values);
      return res.rows;
    },

    async get(...params) {
      const rows = await this.all(...params);
      return rows[0];
    },

    async run(...params) {
      let { text, values } = compileQuery(sql, params);
      const trimmed = text.trim();
      const isInsert = /^INSERT\s/i.test(trimmed);
      const hasReturning = /\bRETURNING\b/i.test(text);

      if (isInsert && !hasReturning) {
        text = `${text} RETURNING *`;
      }

      const res = await getQueryClient().query(text, values);
      const inserted = res.rows[0] || null;
      const lastInsertRowid =
        inserted?.id ??
        inserted?.id_pembuatan ??
        inserted?.id_pembuatanpap ??
        inserted?.id_surat_aju ??
        0;
      return {
        changes: res.rowCount || 0,
        lastInsertRowid,
        insertedRow: inserted
      };
    }
  };
}

function createDbFacade() {
  return {
    async exec(sql) {
      const statements = normalizeSql(sql)
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const statement of statements) {
        try {
          await getQueryClient().query(statement);
        } catch (err) {
          // Ignore "table already exists" errors (CREATE TABLE IF NOT EXISTS)
          if (err.code === '42P07') {
            continue;
          }
          // Ignore duplicate key errors for schema objects that already exist
          if (err.code === '23505') {
            continue;
          }
          throw err;
        }
      }
    },

    prepare(sql) {
      return createStatement(sql);
    },

    transaction(fn) {
      return async (...args) => {
        if (activeClient) {
          return fn(...args);
        }

        const client = await pool.connect();
        const previous = activeClient;
        activeClient = client;
        try {
          await client.query('BEGIN');
          const result = await fn(...args);
          await client.query('COMMIT');
          return result;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          activeClient = previous;
          client.release();
        }
      };
    }
  };
}

async function connect() {
  const config = buildPoolConfig();
  // Add connection timeout and idle timeout for better reliability
  config.connectionTimeoutMillis = 10000; // 10 seconds
  config.idleTimeoutMillis = 30000; // 30 seconds
  
  pool = new Pool(config);
  
  // Test connection with retry logic
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[DB] Attempting PostgreSQL connection (attempt ${attempt}/${maxRetries})...`);
      await pool.query('SELECT 1');
      console.log('[DB] PostgreSQL connection successful');
      return createDbFacade();
    } catch (err) {
      console.error(`[DB] Connection attempt ${attempt} failed: ${err.message}`);
      
      if (attempt === maxRetries) {
        console.error('[DB] All connection attempts failed');
        throw err;
      }
      
      console.log(`[DB] Retrying in ${retryDelay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  usePostgres,
  connect,
  close,
  createDbFacade,
  normalizeSql
};
