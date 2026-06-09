# el.js Cheat Sheet — Admin Starter

Pola DOM untuk `core/*`, `layouting/layout.js`, dan halaman JSON-driven.

## What it is
- `el.js` is a lightweight DOM wrapper library.
- `el(tag)` returns a chainable wrapper object.
- Wrapper object fields:
  - `.el` = actual DOM node
  - `.ch` = queued child elements
- Use it to build HTML/SVG elements and attach behavior.

## Core pattern
```js
const box = el('div')
  .css({ padding: '10px', background: '#fff' })
  .text('Hello');

const root = el('div')
  .child(box)
  .get();

document.body.appendChild(root);
```

## Important methods
- `el('div')` — create a new element
- `el(node)` — wrap an existing DOM node
- `.text('text')` — set element text
- `.textContent('text')` — set raw text content
- `.html('<b>hi</b>')` — set inner HTML
- `.css({ prop: value })` — apply styles
- `.style({...})` — alias for `.css()`
- `.attr(name, value)` — set an attribute
- `.attrRemove(name)` — remove an attribute
- `.data(name, value)` — set a `data-*` attribute
- `.aria(name, value)` — set an `aria-*` attribute
- `.class('a b')` — add classes
- `.clearClass()` — remove all classes
- `.removeClass('a')`
- `.toggleClass('a')`
- `.hasClass('a')`
- `.on(event, fn)` — attach a generic event listener
- `.click(fn)` — attach a click handler
- `.hover(enterFn, leaveFn)` — attach mouse enter/leave callbacks
- `.focus(fn)` / `.blur(fn)` — focus/blur event handlers
- `.change(fn)` — attach a change listener
- `.keydown(fn)`, `.keyup(fn)`, `.keypress(fn)`, `.input(fn)` — keyboard/input events
- `.paste(fn)` — paste event
- `.mouseover(fn)`, `.mouseout(fn)`, `.mousedown(fn)`, `.mouseup(fn)` — mouse events
- `.touchstart(fn)`, `.touchend(fn)`, `.touchmove(fn)` — touch events
- `.dblclick(fn)` — double click
- `.contextmenu(fn)` — right-click menu
- `.wheel(fn)` — wheel event
- `.scroll(fn)` — scroll event
- `.resize(fn)` — window resize helper
- `.load(fn)` — run callback after initial load
- `.submit(fn)` — form submit helper
- `.find(selector)` — query inside the wrapper
- `.findAll(selector)` — query all descendants
- `.closest(selector)` — ancestor lookup
- `.next()`, `.prev()` — sibling traversal
- `.first()`, `.last()`, `.eq(index)` — child access
- `.getParent()`, `.getChildren()`, `.getSiblings()` — DOM traversal helpers
- `.getIndex()` — index among siblings
- `.getWidth()`, `.getHeight()` — element dimensions

## Child handling
- `.child(elObject)` accepts:
  - wrapper objects created by `el(..)`
  - native `HTMLElement`
  - arrays of wrappers/elements
  - `Promise` values that resolve to wrappers/elements
- Child nodes are queued in `.ch`.
- Use `.get()` to attach queued children to `.el`.

## `.get()` behavior
- `.get()` appends all queued children in `.ch` to `.el`.
- Returns the actual DOM node.
- Call `.get()` on the root wrapper before appending it into the page.
- If a wrapper is already attached to DOM and you later add children with `.child()`, **you must call `.get()` again** to flush the new queue into the live DOM.
- Calling `.get()` again on an already-mounted wrapper **moves** queued nodes into `.el`; it does not always duplicate them, but **orphaned nodes stay in memory** if you never flush or remove them.

## `.link()` helper
- `.link(obj, name)` stores the wrapper's real DOM node in `obj[name]`.
- It does not change the wrapper return value, so you can still chain methods after `.link()`.
- Use it when you want an external reference to the actual DOM element for later DOM manipulation.
- This is especially useful if you need to update the element after it has already been attached to the page.

Example:
```js
const ref = {};
el('input')
  .type('checkbox')
  .link(ref, 'el')
  .text('Toggle');

console.log(ref.el); // actual <input> DOM node
```

### Using `.link()` for DOM manipulation
```js
const connectorLink = {};
const listHtml = el('ul')
  .link(connectorLink, 'list')
  .child(
    data.map(item => el('li').text(item.name))
  );

app.appendChild(listHtml.get());

const thisListHtml = connectorLink.list;
el(thisListHtml).clear();
```

- `connectorLink.list` is the real `<ul>` DOM node stored by `.link()`.
- `el(thisListHtml)` wraps that DOM node again so you can use el.js helper methods like `.clear()`.
- This pattern is useful when you need a persistent DOM reference across later updates.

## Shortcut style methods
- `.width(value)`, `.height(value)`
- `.margin(value)`, `.padding(value)`
- `.border(value)`, `.borderTop(value)`, `.borderBottom(value)`, `.borderLeft(value)`, `.borderRight(value)`
- `.radius(value)` — border-radius
- `.background(value)`, `.backgroundImage(url)`, `.backgroundSize(value)`, `.backgroundRepeat(value)`, `.backgroundPosition(value)`
- `.color(value)`
- `.font(value)`, `.fontWeight(value)`
- `.align(value)`, `.size(value)`
- `.display(value)`, `.flex(direction)`, `.grid(columns)`
- `.justify(value)`, `.items(value)`, `.self(value)`, `.gap(value)`, `.wrap(value)`
- `.cursor(value)`, `.opacity(value)`, `.zIndex(value)`, `.overflow(value)`, `.transform(value)`, `.transition(value)`

## Other DOM helpers
- `.prepend(child)` — insert before existing content
- `.remove()` — remove element from DOM
- `.off(event, fn)` — remove event listener
- `.selectAll()` — select text inside input
- `.scrollTo(x, y)` — scroll element
- `.scrollIntoView(options)` — bring element into view
- `.styleRemove(name)` — remove inline style property
- `.cssText(text)` — set full inline CSS text

## Value and property getters
- `.getValue()` / `.getVal()` — read input value
- `.getText()` — read inner text
- `.getHtml()` — read innerHTML
- `.getAttr(name)` — read attribute
- `.getData(name)` — read data-* value
- `.getStyle(name)` — read computed style

## Useful helpers
- `.clear()` — clears inner HTML
- `.empty()` — clears content and resets child queue
- `.replace(child)` — replace wrapper content
- `.show()`, `.hide()`, `.toggle()`
- `.disabled(bool)`
- `.required(bool)`
- `.checked(bool)`

## Best practices
- Build children first.
- Call `.get()` once at the end.
- If the wrapper is already mounted and you add children later, call `.get()` again.
- Avoid mixing raw DOM and wrapper logic without using `.link()`.
- Use `.child([a, b])` for grouped children.
- Keep event callbacks using native `this`.
- Prefer `.empty()` over `.clear()` when you will rebuild with `.child()` — `.clear()` only wipes inner HTML and **does not reset `.ch`**.
- Before replacing a whole panel or slot, remove the old DOM subtree (`.remove()` or `.empty()` on the host wrapper).

## Memory leaks & dynamic updates

`el.js` is not a virtual DOM. Every wrapper, queued child, and event listener is a **real DOM concern**. Leaks usually come from (1) nodes/listeners left alive after navigation, (2) updating UI with `.child()` but forgetting `.get()`, or (3) module-level caches that rebuild without tearing down the previous tree.

### Mental model: two layers

| Layer | Field | What happens |
|-------|-------|--------------|
| Queue | `.ch` | Children waiting to be attached |
| Live DOM | `.el` | What the user actually sees |

Rules:
1. **First mount:** `.child(...)` → `.get()` → append `.el` to the page.
2. **Full replace inside a mounted host:** `.empty()` → `.child(...)` → `.get()`.
3. **Incremental add after mount:** `.child(...)` → `.get()`, **or** append via `.link()` / `appendChild`, **not** `.child()` alone.

### Anti-pattern: `.child()` without `.get()` after mount

Symptom: UI does not update (chips, list rows, loading text invisible) even though JS runs without error.

```js
// BAD — listEl is already in the page from an earlier .get()
listEl.empty();
listEl.child(el('p').text('Memuat…'));
// missing listEl.get() → nothing appears in DOM
```

Fix (full rebuild of that host):

```js
listEl.empty();
listEl.child(el('p').text('Memuat…'));
listEl.get();
listEl.load(() => {
  // blur / scroll restore / guard setup after DOM settle
});
```

Fix (append one node — helper umum):

```js
function appendToEl(container, node) {
  const host = container && container.el ? container.el : container;
  if (!host) return;
  const dom = node && typeof node.get === 'function' ? node.get() : node;
  if (dom instanceof HTMLElement) host.appendChild(dom);
}
```

### Anti-pattern: `.clear()` / `innerHTML` instead of `.empty()`

`.clear()` sets `innerHTML = ''` but **does not clear `.ch`**. The next `.child()` may queue on top of stale state.

```js
// BAD for el.js rebuild loops
list.innerHTML = '';

// GOOD
list.empty();
list.child(newRows);
list.get();
```

See `core/form-builder.js` — search-select dropdown uses `const resetList = () => list.empty()` before re-rendering options.

### Safe replace helper (`mountChildren`)

Gunakan saat slot mengganti seluruh konten (tab panel, async load):

```js
function mountChildren(wrapper, nodes) {
  wrapper.empty();
  const list = Array.isArray(nodes) ? nodes : [nodes];
  list.forEach((n) => {
    if (n != null) wrapper.child(n);
  });
  wrapper.get();
  wrapper.load(() => {
    // post-mount: blur autofocus, restore scroll, setup guards
  });
}
```

Tab/panel swap: panggil `mountChildren(tabPanelSlot, panel)` agar subtree lama dibuang sebelum mount baru.

### Quill rich editor (autofocus / scroll ke alamat)

Gejala: form sudah tampil, lalu ~0.5–1s kemudian halaman scroll ke field textarea/Quill saat value di-load.

Penyebab umum:
- Quill di-init **sebelum** form di-mount (`.load()` saat `create()`, bukan setelah `formSlot.get()`).
- Value di-load dengan `dangerouslyPasteHTML` → cursor/focus + browser scroll into view.
- `window.dispatchEvent(new Event('resize'))` setelah init Quill.

Pola benar (`core/form-builder.js` + `core/rich-text-editor.js`):

```js
// 1. Mount form
mountPanelChildren(formSlot, parts, (root, scrollSnapshot) => {
  setupFormAutoFocusGuard(root, scrollSnapshot);
});

// 2. Di callback .load() mountPanelChildren — init Quill SETELAH get()
mountRichEditorsIn(wrapper.el); // memanggil node._richEditorMount()

// 3. Load value Quill
const delta = quill.clipboard.convert(html);
quill.setContents(delta, 'silent');
quill.setSelection(null, 'silent');
// blur + restore scroll snapshot

// 4. Remount — teardown dulu
teardownFormSlot(formSlot);
```

Jangan stack `MutationObserver` / `setTimeout` tanpa `clearFormAutoFocusGuard(formRoot)`.

### Case study: Panel dinamis (dashboard / custom page)

Sub-panel yang di-rebuild saat refresh data tanpa cleanup → **detached DOM + listener menumpuk**.

```js
let cachedPanel = null;

function buildPanel(data) {
  if (cachedPanel) {
    try { el(cachedPanel).remove(); } catch (e) { /* ignore */ }
    cachedPanel = null;
  }
  const root = el('div');
  // ... build ...
  cachedPanel = root.get();
  return root;
}

async function loadAndRender(slot, id) {
  slot.empty();
  slot.child(buildPanel(data));
  slot.get();
}
```

Checklist:
- Simpan referensi DOM hanya jika akan `.remove()` saat build berikutnya.
- `slot.empty()` di parent sebelum attach panel baru.
- Form slot: `teardownFormSlot()` + `empty` → `child` → `get` sebelum remount.

### Event listeners

- Each `.click(fn)` / `.on(type, fn)` registers on the **live** `.el`.
- Re-rendering by creating a **new** wrapper and replacing the old node is usually enough (browser drops listeners with the node).
- Reusing the **same** wrapper and rebinding without cleanup stacks handlers → duplicate actions and leaks.

```js
// Rebind on same node — remove old handler first
btn.off('click', handleSave);
btn.click(handleSave);
```

When in doubt, `.empty()` the host and build fresh children instead of rebinding on stale nodes.

### `loopFunc` — must stop when UI is torn down

`el.js` `loopFunc` polls with `setTimeout` until its marker `<noscript>` disappears from the DOM:

```js
// Stops automatically when parent is removed from document
panel.loopFunc(async () => {
  await refreshSomething();
}, 2000);
```

To stop the loop: **remove the element that contains the marker** (typically the whole panel via `.remove()` or `wrapper.empty()` on an ancestor that destroys the subtree). Leaving the panel in a detached state but still referenced from JS keeps the loop alive.

### Global / document listeners

`.resize(fn)`, `.scroll(fn)`, or manual `window.addEventListener` must be removed when the page component unmounts:

```js
const onResize = () => { /* ... */ };
window.addEventListener('resize', onResize);
// on cleanup:
window.removeEventListener('resize', onResize);
```

Layout route changes (`layouting/layout.js` → `pagecontent.empty()`) remove in-page DOM but **not** window listeners you registered elsewhere.

### Modals and floating UI

Before opening a new overlay, close dropdowns/popovers that attach to `document` (e.g. `FormBuilder.closeAllSearchSelects()` in `layouting/layout.js`). Orphaned popovers keep listeners and DOM outside the modal tree.

### Quick checklist (before shipping dynamic UI)

1. After first mount, does every `.child()` have a matching `.get()` or `appendToEl`?
2. Rebuild paths use `.empty()`, not `.clear()` / `innerHTML` alone?
3. Module caches (`cachedPanel`, singleton slots) call `.remove()` before rebuild?
4. Tab/route change replaces content via `empty → child → get` on the host slot?
5. `loopFunc` / `setInterval` / `window` listeners stopped when the host is removed?
6. Same button/node not `.click()`-bound repeatedly without `.off()`?

## Quick example
```js
const card = el('div')
  .css({ padding: '20px', border: '1px solid #ddd' });

const title = el('h2').text('Title');
const button = el('button')
  .text('Click')
  .click(() => alert('ok'));

card.child([title, button]);
document.body.appendChild(card.get());
```

## Summary
`el.js` is not a virtual DOM library. It is a small builder around real DOM nodes with a queued child tree and fluent API. `.child()` collects children, `.get()` materializes them, and `.link()` gives outside access to the actual DOM element. **Memory safety** depends on tearing down old subtrees (`.remove()` / `.empty()`), always flushing `.ch` after dynamic updates (`.get()` or direct `appendChild`), and stopping async loops and global listeners when the host leaves the page.
