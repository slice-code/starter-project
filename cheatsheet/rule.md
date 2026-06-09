---
description: Mount form & rich editor — cegah autofocus/scroll dan memory leak
globs: core/form-builder.js, core/rich-text-editor.js
alwaysApply: false
---

# Form & Rich Editor Mount

## el.js mount order

```js
wrapper.empty();
wrapper.child(nodes);
wrapper.get();
wrapper.load(() => {
  mountRichEditorsIn(wrapper.el);
});
```

- `.get()` = flush ke DOM. `.load()` = callback setelah mount.
- Setelah mount host live: **selalu** `.get()` setelah `.child()`.

## Quill / textarea — JANGAN

```js
// BAD — init saat create(), sebelum form di-mount
wrapper.load(() => tryInit());

// BAD — paste HTML saat load value (autofocus + scroll)
quill.clipboard.dangerouslyPasteHTML(html);
```

## Quill / textarea — WAJIB

```js
// Init setelah form mount
wrapper.el._richEditorMount = () => { /* tryInit */ };

// Load value tanpa focus
const delta = quill.clipboard.convert(html);
quill.setContents(delta, 'silent');
quill.setSelection(null, 'silent');

// Teardown sebelum remount
teardownFormSlot(formSlot);
```

## Checklist

1. Rich editor init lewat `_richEditorMount`, bukan saat `RichTextEditor.create()`.
2. Value load pakai `setContents(..., 'silent')`, bukan `dangerouslyPasteHTML`.
3. Remount: `teardownFormSlot` → `empty` → `child` → `get`.
4. Guard/timer punya pasangan cleanup.
5. Tab/panel swap: teardown sebelum `empty`.

Referensi: `cheatsheet/eljs-cheatsheet.md`
