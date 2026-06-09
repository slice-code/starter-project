(function (global) {
  'use strict';

  const loaded = new Map();

  function normalizeSrc(src) {
    return String(src || '').trim();
  }

  function scriptBase(src) {
    return normalizeSrc(src).split('?')[0];
  }

  function removeScriptByBase(base) {
    if (!base) return;
    const fileName = base.split('/').pop();
    document.querySelectorAll('script[src]').forEach((node) => {
      const attr = node.getAttribute('src') || '';
      if (attr.split('?')[0] === base || attr.endsWith(base) || (fileName && attr.includes(fileName))) {
        node.remove();
      }
    });
    for (const key of [...loaded.keys()]) {
      if (key.split('?')[0] === base) loaded.delete(key);
    }
  }

  function isLoaded(src) {
    const clean = normalizeSrc(src);
    if (!clean) return false;
    const scripts = [...document.querySelectorAll('script[src]')];
    return scripts.some((node) => {
      const attr = node.getAttribute('src') || '';
      return attr === clean || node.src.endsWith(clean);
    });
  }

  function load(src) {
    const clean = normalizeSrc(src);
    if (!clean) return Promise.resolve();
    if (loaded.has(clean)) return loaded.get(clean);

    const base = scriptBase(clean);
    if (!isLoaded(clean)) {
      removeScriptByBase(base);
    }

    const promise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = clean;
      s.onload = () => resolve(clean);
      s.onerror = () => reject(new Error(`Gagal memuat script: ${clean}`));
      document.body.appendChild(s);
    });
    loaded.set(clean, promise);
    return promise;
  }

  async function loadMany(sources) {
    for (const src of sources || []) await load(src);
  }

  global.CoreScriptLoader = { load, loadMany, isLoaded };
})(typeof window !== 'undefined' ? window : global);
