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
    if (clean.includes('.css') || clean.includes('stylesheet')) {
      const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
      return links.some((node) => {
        const attr = node.getAttribute('href') || '';
        return attr === clean || node.href.endsWith(clean);
      });
    }
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
    const hasCss = clean.includes('.css') || clean.includes('stylesheet');

    if (!isLoaded(clean)) {
      if (hasCss) {
        const promise = new Promise((resolve, reject) => {
          const l = document.createElement('link');
          l.rel = 'stylesheet';
          l.href = clean;
          l.onload = () => resolve(clean);
          l.onerror = () => reject(new Error(`Gagal memuat stylesheet: ${clean}`));
          document.head.appendChild(l);
        });
        loaded.set(clean, promise);
        return promise;
      }
      removeScriptByBase(base);
    } else if (hasCss) {
      return Promise.resolve(clean);
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
