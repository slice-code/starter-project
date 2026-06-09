---
description: Cegah autofocus/scroll Quill & memory leak saat mount form biodata
globs: core/biodata-tab-editor.js,core/biodata-detail.js,core/rich-text-editor.js,core/form-builder.js
alwaysApply: false
---

# Biodata Form & Rich Editor Mount

## el.js mount order

```js
// GOOD — flush DOM, post-mount di .load()
wrapper.empty();
wrapper.child(nodes);
wrapper.get();
wrapper.load(() => {
  mountRichEditorsIn(wrapper.el);
  setupFormAutoFocusGuard(wrapper.el, scrollSnapshot);
  applyBiodataScrollSnapshot(scrollSnapshot);
});
```

- `.get()` = flush ke DOM. `.load()` = callback setelah mount (bukan load value).
- Setelah mount host yang sudah live: **selalu** `.get()` setelah `.child()`, atau pakai `mountPanelChildren`.

## Quill / textarea alamat — JANGAN

```js
// BAD — init saat create(), sebelum form di-mount
wrapper.load(() => tryInit());

// BAD — paste HTML saat load value (autofocus + scroll)
quill.clipboard.dangerouslyPasteHTML(html);

// BAD — observer/timer tanpa cleanup saat slot di-replace
new MutationObserver(...); // tanpa clearFormAutoFocusGuard
```

## Quill / textarea alamat — WAJIB

```js
// Init setelah form mount
wrapper.el._richEditorMount = () => { /* tryInit */ };
// dipanggil dari mountRichEditorsIn(root) di callback .load()

// Load value tanpa focus
const delta = quill.clipboard.convert(html);
quill.setContents(delta, 'silent');
quill.setSelection(null, 'silent');
blur + restore scroll snapshot

// Teardown sebelum remount
teardownFormSlot(formSlot); // clear guard + _richEditorDestroy + empty
```

## Checklist sebelum merge

1. Rich editor init hanya lewat `_richEditorMount`, bukan saat `RichTextEditor.create()`.
2. Value load pakai `setContents(..., 'silent')`, bukan `dangerouslyPasteHTML`.
3. Form slot remount pakai `teardownFormSlot` → `mountPanelChildren`.
4. Guard/timer/observer punya pasangan `clearFormAutoFocusGuard`.
5. Tab/panel swap panggil `teardownFormAutoFocusIn` sebelum `empty`.

Referensi: `cheatsheet/eljs-cheatsheet.md`, helper di `core/biodata-tab-editor.js`.
