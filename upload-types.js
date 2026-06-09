/**
 * Daftar jenis upload — starter template (perluas sesuai project).
 */
(function (root, factory) {
  const types = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = types;
  } else {
    root.UploadTypes = types;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const HUB_TYPES = [
    { type: 'upload_document', label: 'Dokumen' },
    { type: 'upload_image', label: 'Gambar' },
    { type: 'upload_attachment', label: 'Lampiran' }
  ];

  const EXTRA_TYPES = [];

  const byType = {};
  HUB_TYPES.forEach((t) => { byType[t.type] = t; });
  EXTRA_TYPES.forEach((t) => { byType[t.type] = t; });

  function isAllowed(type) {
    return !!byType[String(type || '').trim()];
  }

  return {
    HUB_TYPES,
    EXTRA_TYPES,
    ALL_TYPES: [...HUB_TYPES, ...EXTRA_TYPES],
    byType,
    isAllowed
  };
});
