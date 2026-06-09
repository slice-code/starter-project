/**
 * Muat env.local sebelum modul lain (npm start / node server.js)
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eq = trimmed.indexOf('=');
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"'))
    || (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  return { key, val };
}

function loadFile(filePath, { override = false } = {}) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    if (!override && process.env[parsed.key] !== undefined) continue;
    process.env[parsed.key] = parsed.val;
  }
  return true;
}

function loadLocalEnv() {
  const loaded = [];
  if (loadFile(path.join(ROOT, 'env.local'))) loaded.push('env.local');
  if (loadFile(path.join(ROOT, '.env.local'), { override: true })) loaded.push('.env.local');
  if (loaded.length) console.log(`[env] Loaded ${loaded.join(', ')}`);
  return loaded.length ? loaded[loaded.length - 1] : null;
}

module.exports = { loadLocalEnv };
