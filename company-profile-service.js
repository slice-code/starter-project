'use strict';

const fs = require('fs');
const path = require('path');

const PROFILE_PATH = path.join(__dirname, 'config', 'company-profile.json');

const PROFILE_FIELDS = [
  { key: 'appName', env: 'APP_NAME' },
  { key: 'appTitle', env: 'APP_TITLE' },
  { key: 'orgName', env: 'ORG_NAME' },
  { key: 'orgSignatoryName', env: 'ORG_SIGNATORY_NAME' },
  { key: 'orgSignatoryTitle', env: 'ORG_SIGNATORY_TITLE' },
  { key: 'orgAddress', env: 'ORG_ADDRESS' },
  { key: 'orgEmail', env: 'ORG_EMAIL' },
  { key: 'orgPrintLocation', env: 'ORG_PRINT_LOCATION' },
  { key: 'loginSubtitle', env: 'APP_LOGIN_SUBTITLE' },
  { key: 'adminEmail', env: 'ADMIN_EMAIL' },
  { key: 'adminName', env: 'ADMIN_NAME' }
];

function trimOrEmpty(v) {
  return String(v ?? '').trim();
}

function loadProfileFile() {
  if (!fs.existsSync(PROFILE_PATH)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function pickValue(key, envKey, fileProfile, defaults = {}) {
  const fromFile = trimOrEmpty(fileProfile[key]);
  if (fromFile) return fromFile;
  const fromEnv = trimOrEmpty(process.env[envKey]);
  if (fromEnv) return fromEnv;
  return trimOrEmpty(defaults[key]);
}

function getProfileOverlay(defaults = {}) {
  const fileProfile = loadProfileFile();
  const out = {};
  for (const f of PROFILE_FIELDS) {
    out[f.key] = pickValue(f.key, f.env, fileProfile, defaults);
  }
  return out;
}

function applyProfileToProcessEnv(profile) {
  for (const f of PROFILE_FIELDS) {
    if (profile[f.key] !== undefined) {
      process.env[f.env] = String(profile[f.key] ?? '').trim();
    }
  }
}

function normalizePayload(body) {
  const src = body && typeof body === 'object' ? body : {};
  const out = {};
  for (const f of PROFILE_FIELDS) {
    out[f.key] = trimOrEmpty(src[f.key]);
  }
  return out;
}

function saveProfile(body) {
  const profile = normalizePayload(body);
  fs.mkdirSync(path.dirname(PROFILE_PATH), { recursive: true });
  fs.writeFileSync(PROFILE_PATH, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  applyProfileToProcessEnv(profile);
  return profile;
}

module.exports = {
  PROFILE_PATH,
  PROFILE_FIELDS,
  loadProfileFile,
  getProfileOverlay,
  saveProfile,
  applyProfileToProcessEnv
};
