/**
 * Kompres gambar ke WebP untuk OCR / upload — hemat bandwidth & token vision.
 */
const sharp = require('sharp');

const MAX_SIDE = Math.min(4096, Math.max(400, parseInt(process.env.OCR_IMAGE_MAX_SIDE || '1000', 10) || 1000));
const WEBP_QUALITY = Math.min(100, Math.max(40, parseInt(process.env.OCR_IMAGE_WEBP_QUALITY || '85', 10) || 85));
/** Lewati re-encode jika sudah WebP kecil */
const SKIP_IF_WEBP_UNDER = parseInt(process.env.OCR_IMAGE_SKIP_UNDER || '180000', 10) || 180000;

function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * @param {Buffer} buffer
 * @param {string} [mimeType]
 * @returns {Promise<{ buffer: Buffer, mimeType: string, originalSize: number, compressedSize: number, width: number, height: number, originalWidth?: number, originalHeight?: number, skipped?: boolean }>}
 */
async function compressForOcr(buffer, mimeType = 'image/jpeg') {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Buffer gambar wajib');
  }
  const originalSize = buffer.length;
  const mime = String(mimeType || '').toLowerCase();

  if (mime === 'image/webp' && originalSize <= SKIP_IF_WEBP_UNDER) {
    try {
      const meta = await sharp(buffer, { failOn: 'none' }).metadata();
      return {
        buffer,
        mimeType: 'image/webp',
        originalSize,
        compressedSize: originalSize,
        width: meta.width || 0,
        height: meta.height || 0,
        originalWidth: meta.width,
        originalHeight: meta.height,
        skipped: true
      };
    } catch {
      /* lanjut kompres */
    }
  }

  const input = sharp(buffer, { failOn: 'none' }).rotate();
  const metaIn = await input.metadata();
  const { data, info } = await input
    .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: false })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    mimeType: 'image/webp',
    originalSize,
    compressedSize: data.length,
    width: info.width,
    height: info.height,
    originalWidth: metaIn.width,
    originalHeight: metaIn.height,
    skipped: false
  };
}

module.exports = {
  compressForOcr,
  formatBytes,
  MAX_SIDE,
  WEBP_QUALITY
};
