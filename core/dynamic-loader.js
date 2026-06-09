(function (global) {
  'use strict';

  // Simple sequential script loader using native <script> injection.
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve(src);
      s.onerror = () => reject(new Error('Failed to load script: ' + src));
      document.body.appendChild(s);
    });
  }

  // Ordered list of scripts required for the application.
  // Paths are relative to this loader (which lives in /core/).
  const SCRIPTS = [
    '/core/script-loader.js',
    '/core/api-client.js',
    '/core/auth-client.js',
    '/core/rich-text-editor.js',
    '/core/input-mask.js',
    '/core/form-builder.js',
    '/core/form-field-presets.js',
    '/core/table-builder.js',
    '/core/pjtki-theme.js',
    '/core/timeline-panel.js',
    '/core/crud-engine.js',
    '/core/kanban-engine.js',
    '/core/ui-builder.js',
    '/core/dashboard-ui.js',
    '/core/rbac.js',
    '/core/page-loader.js',
    '/core/core.js',
    '/index.js'
  ];

  // Load all scripts sequentially to preserve dependency order.
  function loadAll() {
    return SCRIPTS.reduce((p, src) => p.then(() => loadScript(src)), Promise.resolve());
  }

  // Auto‑run the loader.
  loadAll().catch(err => console.error('DynamicCoreLoader error:', err));

  // Expose minimal API for future extensions.
  global.DynamicCoreLoader = { loadAll };
})(typeof window !== 'undefined' ? window : global);
