const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { HUB_TYPES, isAllowed } = require('./upload-types');

const UPLOAD_ROOT = path.join(__dirname, 'data', 'uploads');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function safeSegment(name) {
  return String(name || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
}

/**
 * Parse multipart/form-data sederhana (file tunggal + field teks).
 */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!match) {
      reject(new Error('Content-Type multipart/form-data diperlukan'));
      return;
    }
    const boundary = match[1] || match[2];
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const delimiter = Buffer.from(`--${boundary}`);
        const parts = splitBuffer(body, delimiter).filter((p) => p.length > 4);
        const fields = {};
        let file = null;

        for (const part of parts) {
          if (part.slice(0, 2).toString() === '--') continue;
          const headerEnd = indexOfBuffer(part, Buffer.from('\r\n\r\n'));
          if (headerEnd < 0) continue;
          const headerText = part.slice(0, headerEnd).toString('utf8');
          let content = part.slice(headerEnd + 4);
          if (content.slice(-2).toString() === '\r\n') {
            content = content.slice(0, -2);
          }
          const nameMatch = headerText.match(/name="([^"]+)"/i);
          const filenameMatch = headerText.match(/filename="([^"]*)"/i);
          const fieldName = nameMatch ? nameMatch[1] : null;
          if (!fieldName) continue;

          if (filenameMatch) {
            file = {
              field: fieldName,
              filename: filenameMatch[1],
              buffer: content,
              mime: (headerText.match(/Content-Type:\s*([^\r\n]+)/i) || [])[1] || 'application/octet-stream'
            };
          } else {
            fields[fieldName] = content.toString('utf8');
          }
        }
        resolve({ fields, file });
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function indexOfBuffer(buf, search, from = 0) {
  for (let i = from; i <= buf.length - search.length; i++) {
    let ok = true;
    for (let j = 0; j < search.length; j++) {
      if (buf[i + j] !== search[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function splitBuffer(buf, delimiter) {
  const out = [];
  let start = 0;
  let idx = indexOfBuffer(buf, delimiter, start);
  while (idx >= 0) {
    if (idx > start) out.push(buf.slice(start, idx));
    start = idx + delimiter.length;
    idx = indexOfBuffer(buf, delimiter, start);
  }
  if (start < buf.length) out.push(buf.slice(start));
  return out;
}

function extFromName(name, mime) {
  const ext = path.extname(name || '').toLowerCase();
  if (ext && ext.length <= 8) return ext;
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf'
  };
  return map[mime] || '.bin';
}

/**
 * Simpan file ke data/uploads/{id_biodata}/{docType}/...
 * Mengembalikan path publik /uploads/...
 */
function saveUploadFile(idBiodata, docType, file) {
  if (!file || !file.buffer || !file.buffer.length) {
    throw new Error('File upload kosong');
  }
  const id = safeSegment(idBiodata);
  const type = safeSegment(docType);
  if (!id || !type) throw new Error('id_biodata dan docType wajib');

  const baseName = safeSegment(path.basename(file.filename || 'file')) || 'file';
  const ext = extFromName(baseName, file.mime);
  const stamp = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  const stored = `${stamp}_${rand}${ext}`;

  const dir = path.join(UPLOAD_ROOT, id, type);
  ensureDir(dir);
  const abs = path.join(dir, stored);
  fs.writeFileSync(abs, file.buffer);

  return `/uploads/${id}/${type}/${stored}`;
}

/** Simpan file dokumen identitas (satu baris per kolom di tabel dokumen) */
function saveDokumenIdentitasFile(idBiodata, fieldKey, file) {
  if (!file || !file.buffer || !file.buffer.length) {
    throw new Error('File upload kosong');
  }
  const id = safeSegment(idBiodata);
  const field = safeSegment(fieldKey);
  if (!id || !field) throw new Error('id_biodata dan field wajib');

  const ext = extFromName(file.filename, file.mime);
  const stamp = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  const stored = `${field}_${stamp}_${rand}${ext}`;

  const folder = 'dokumen-identitas';
  const dir = path.join(UPLOAD_ROOT, id, folder);
  ensureDir(dir);
  const abs = path.join(dir, stored);
  fs.writeFileSync(abs, file.buffer);

  return `/uploads/${id}/${folder}/${stored}`;
}

/** Foto profil TKI (kolom personal.foto) */
/** Bukti potongan gaji bulanan TKI — folder per id_tki */
function savePembayaranBuktiFile(idTki, file) {
  if (!file || !file.buffer || !file.buffer.length) {
    throw new Error('File upload kosong');
  }
  const id = safeSegment(idTki);
  if (!id) throw new Error('id_tki wajib');

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowed.includes(file.mime)) {
    throw new Error('Bukti harus berformat JPG, PNG, WebP, atau PDF.');
  }
  const maxBytes = 8 * 1024 * 1024;
  if (file.buffer.length > maxBytes) {
    throw new Error('Ukuran bukti maksimal 8 MB.');
  }

  const ext = extFromName(file.filename, file.mime);
  const stamp = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  const stored = `bukti_${stamp}_${rand}${ext}`;

  const folder = 'pembayaran-bukti';
  const dir = path.join(UPLOAD_ROOT, id, folder);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, stored), file.buffer);

  return {
    bukti_path: `/uploads/${id}/${folder}/${stored}`,
    bukti_nama: path.basename(file.filename || stored)
  };
}

function savePersonalFotoFile(idBiodata, file) {
  if (!file || !file.buffer || !file.buffer.length) {
    throw new Error('File upload kosong');
  }
  const id = safeSegment(idBiodata);
  if (!id) throw new Error('id_biodata wajib');

  const ext = extFromName(file.filename, file.mime);
  const stamp = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  const stored = `foto_${stamp}_${rand}${ext}`;

  const folder = 'personal-foto';
  const dir = path.join(UPLOAD_ROOT, id, folder);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, stored), file.buffer);

  return `/uploads/${id}/${folder}/${stored}`;
}

function resolveUploadAbsolute(publicPath) {
  const rel = String(publicPath || '').replace(/^\/uploads\//, '');
  const abs = path.resolve(UPLOAD_ROOT, rel);
  if (!abs.startsWith(path.resolve(UPLOAD_ROOT))) return null;
  return abs;
}

/** Path lama (/data/uploads/...) → URL yang dilayani serveUploadedFile (/uploads/...). */
function normalizePublicUploadPath(publicPath) {
  let p = String(publicPath || '').trim();
  if (!p) return p;
  if (p.startsWith('/data/uploads/')) return `/uploads/${p.slice('/data/uploads/'.length)}`;
  if (p.startsWith('data/uploads/')) return `/uploads/${p.slice('data/uploads/'.length)}`;
  return p;
}

module.exports = {
  UPLOAD_ROOT,
  HUB_TYPES,
  isAllowed,
  parseMultipart,
  saveUploadFile,
  saveDokumenIdentitasFile,
  savePembayaranBuktiFile,
  savePersonalFotoFile,
  resolveUploadAbsolute,
  normalizePublicUploadPath,
  ensureUploadRoot() {
    ensureDir(UPLOAD_ROOT);
  }
};
