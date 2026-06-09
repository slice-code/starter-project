# Core App - CRUD & Page Cheatsheet

## Architecture Overview

```
/schema/     → Database DDL (table structure, fields, types)
/appjson/    → UI configuration (CRUD pages, regular pages)
```

- **Schema files** define database tables only (DDL).
- **AppJSON files** define UI pages and CRUD behavior.
- They share the same `resource` name to connect.

---

## Folder Structure

```
layouting-el.js/
├── schema/           # Database schemas (DDL)
│   ├── users.json    # users table definition
│   └── products.json # products table definition
│
├── appjson/          # UI page configurations
│   ├── users.json    # CRUD page for users
│   ├── products.json # CRUD page for products
│   ├── about.json    # Regular page
│   └── dashboard.json
│
├── core/             # Core framework
│   ├── core.js       # CoreApp class
│   ├── crud-engine.js# CRUD page builder
│   ├── table-builder.js
│   ├── form-builder.js
│   └── api-client.js
│
└── index.js          # App entry point
```

---

## CRUD Page JSON Format

```json
{
  "path": "/users",
  "type": "crud",
  "config": {
    "resource": "users",        # Must match API endpoint
    "title": "User Management", # Page title
    "icon": "fas fa-users",     # Sidebar icon
    "formDisplay": "modal",     # "modal" | "newpage"
    "modalSize": "large",       # "small" | "medium" | "large" (modal only)
    "table": { ... },
    "form": { ... }
  },
  "options": {
    "permissions": ["admin"]    # RBAC roles allowed
  }
}
```

### Table Configuration

```json
"table": {
  "columns": [
    { "key": "id", "label": "ID", "sortable": true },
    { "key": "name", "label": "Name", "sortable": true, "searchable": true },
    { "key": "email", "label": "Email", "sortable": true },
    { "key": "role", "label": "Role" },
    {
      "key": "actions",
      "type": "actions",
      "actions": ["edit", "delete"]
    }
  ],
  "features": {
    "search": true,             # Enable search (400ms debounce)
    "pagination": true,         # Enable pagination
    "perPage": 10,              # Default rows per page (persisted in localStorage)
    "perPageOptions": [5, 10, 25, 50, 100]  # Optional: custom options
  }
}
```

#### Column Properties

| Property | Type | Description |
|----------|------|-------------|
| `key` | string | Field name from API response |
| `label` | string | Column header text |
| `sortable` | boolean | Enable column sorting |
| `searchable` | boolean | Include in search filter |
| `type` | string | `"actions"` for action buttons column |
| `actions` | array | `["edit", "delete"]` or custom action objects |

#### Actions Column

```json
{
  "key": "actions",
  "type": "actions",
  "actions": [
    "edit",              # Built-in edit button
    "delete",            # Built-in delete button (with confirm)
    {
      "label": "View",   # Custom action
      "icon": "fas fa-eye",
      "onClick": "customHandler"
    }
  ]
}
```

### Form Configuration

```json
"form": {
  "columns": 2,           # Grid columns (1 or 2)
  "gap": "1rem",          # Gap between fields
  "fields": [ ... ],
  "layout": "vertical",   # "vertical" | "horizontal"
  "submitText": "Save",   # Submit button text
  "cancelText": "Cancel"  # Cancel button text
}
```

#### Field Types

| Type | Description | Properties |
|------|-------------|------------|
| `text` | Text input | `placeholder`, `required` |
| `email` | Email input | `placeholder`, `required` |
| `number` | Number input | `min`, `max`, `step`, `required` |
| `password` | Password input | `placeholder`, `required` |
| `textarea` | Multi-line text | `rows`, `placeholder`, `colspan` |
| `select` | Dropdown | `options: [{value, label}]`, `required` |
| `date` | Date picker | `required` |
| `url` | URL input | `placeholder`, `required` |

#### Field Properties

```json
{
  "name": "role",
  "label": "Role",
  "type": "select",
  "required": true,
  "placeholder": "Select a role",
  "colspan": 2,           # Span across 2 columns (grid)
  "options": [
    { "value": "admin", "label": "Administrator" },
    { "value": "user", "label": "Regular User" }
  ],
  "validation": {
    "min": 0,
    "max": 100
  }
}
```

---

## Regular Page JSON Format

```json
{
  "path": "/about",
  "type": "page",
  "config": {
    "title": "About",
    "children": [
      {
        "type": "card",
        "children": [
          { "type": "heading", "level": 2, "text": "Title" },
          { "type": "text", "text": "Content here" }
        ]
      }
    ]
  },
  "options": {
    "permissions": ["admin", "user"]
  }
}
```

### Supported Component Types

| Type | Description | Properties |
|------|-------------|------------|
| `heading` | Heading text | `level` (1-6), `text` |
| `text` | Paragraph | `text` |
| `card` | Card container | `children` (array) |
| `grid` | CSS Grid layout | `columns`, `children` |
| `button` | Button | `text`, `onClick`, `variant` |
| `image` | Image | `src`, `alt`, `width`, `height` |
| `list` | List | `items` (array) |
| `divider` | Horizontal line | — |

### Grid Layout

```json
{
  "type": "grid",
  "columns": "repeat(auto-fit, minmax(200px, 1fr))",
  "children": [
    { "type": "card", "children": [...] },
    { "type": "card", "children": [...] }
  ]
}
```

---

## Server API Requirements

### CRUD Endpoints

The server must implement RESTful endpoints matching the `resource` name:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/{resource}` | List (with pagination, search, sort) |
| `GET` | `/api/{resource}/{id}` | Get single item |
| `POST` | `/api/{resource}` | Create new item |
| `PUT` | `/api/{resource}/{id}` | Update item |
| `DELETE` | `/api/{resource}/{id}` | Delete item |

### List Response Format

```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "John", "email": "john@example.com" }
  ],
  "pagination": {
    "page": 1,
    "perPage": 10,
    "total": 95,
    "totalPages": 10
  }
}
```

### List Query Parameters

| Parameter | Description |
|-----------|-------------|
| `page` | Page number (1-based) |
| `perPage` | Rows per page |
| `search` | Search query string |
| `sort` | Column name to sort |
| `order` | Sort direction: `asc` or `desc` |

### Single Item Response

```json
{
  "success": true,
  "data": { "id": 1, "name": "John", "email": "john@example.com" }
}
```

### Create/Update Request Body

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "role": "admin"
}
```

### Delete Response

```json
{
  "success": true,
  "message": "Item deleted successfully"
}
```

---

## Loading Pages (index.js)

### App Initialization Flow

```javascript
window.addEventListener('DOMContentLoaded', async () => {
  const core = new CoreApp({
    api: { baseUrl: `${API_BASE}/api` },
    layout: { theme: 'blue', sideMenu: [...], navbar: [...] }
  });

  // 1. Load database schemas (for DDL only)
  await loadSchemasForDatabase(core);

  // 2. Load UI pages from appjson
  const crudMenuItems = await loadAppJsonPages(core);

  // 3. Update sidebar menu with CRUD items
  // 4. Load hardcoded pages
  // 5. Initialize app
  core.init();
});
```

### Page Loading Logic

```javascript
// Load pages from /api/pages
const response = await fetch(`${API_BASE}/api/pages`);
const pages = await response.json();

for (const page of pages.data) {
  if (page.type === 'crud') {
    core.addCrudPage(page.path, page.config, page.options);
  } else if (page.type === 'page') {
    core.addPage(page.path, page.config, page.options);
  }
}
```

---

## Form Display Modes

### Modal Mode (Default)

```json
"formDisplay": "modal",
"modalSize": "large"  # small | medium | large
```

- Create/Edit opens in a modal dialog
- Table stays visible behind modal
- Buttons in modal footer only

### New Page Mode

```json
"formDisplay": "newpage"
```

- Create navigates to `/resource/create`
- Edit navigates to `/resource/edit/:id`
- On refresh, auto-redirects back to `/resource`
- Full page form (not modal)

---

## Routing Behavior

### Normal Navigation

```
/users          → List page
/users/create   → Create form (newpage mode)
/users/edit/5   → Edit form for ID 5
```

### Refresh Behavior

| URL | On Refresh |
|-----|-----------|
| `/users` | Stays on `/users` |
| `/users/create` | Redirects to `/users` |
| `/users/edit/5` | Redirects to `/users` |
| `/about` | Stays on `/about` |
| `/unknown` | Redirects to `/` (dashboard) |

---

## State Persistence

### perPage Setting

- Stored in `localStorage` as `crud_perPage_{resource}`
- Example: `crud_perPage_users = 5`
- Survives page reload and navigation
- Default: `10` (if not in localStorage)

### Pagination State (per session)

- `lastPage`, `lastPerPage`, `lastSearch` tracked in closure
- After save/edit/delete, table reloads with same page/perPage
- Search state preserved until manually cleared

---

## CRUD Engine Features

### Search

- Debounced: 400ms delay after typing stops
- Server-side search via `?search=query`
- Resets to page 1 on new search

### Sorting

- Click column header to sort
- Toggles asc/desc
- Server-side via `?sort=column&order=asc`

### Pagination

- Compact UI above table
- "Show X entries" selector (left)
- Page numbers + prev/next (right)
- Loading spinner during API calls

### Loading State

- Smooth opacity fade (not DOM replacement)
- Small spinner next to pagination
- No table flicker on save

---

## Table Layout Structure

```
──────────────────────────────────────────────┐
│ Title    [Search........]   [+ Create New]   │ ← FIXED (z-index: 10)
├──────────────────────────────────────────────┤
│ Show [5▾] entries   🔄  1/2 (5) ‹ [1][2] › │ ← FIXED (z-index: 5)
├──────────────────────────────────────────────┤
│ ID │ Name │ Email │ Role │ Actions          │ ← FIXED (sticky thead)
├──────────────────────────────────────────────┤
│    │      │       │      │                  │ ← SCROLLABLE
│    │      │       │      │                  │   (tbody only)
└──────────────────────────────────────────────┘
```

- Page padding: `0` (full-width CRUD)
- Header + pagination = fixed group
- Only table body scrolls
- Sticky thead with opaque background

---

## Best Practices

1. **Separate concerns**: `schema/` = database, `appjson/` = UI
2. **Match resource names**: Schema `name` must match CRUD `resource`
3. **Use consistent keys**: Field `name` in form = API field name
4. **Set searchable columns**: Only mark columns that need search filtering
5. **Choose formDisplay wisely**: `modal` for quick edits, `newpage` for complex forms
6. **Handle permissions**: Use `options.permissions` for RBAC
7. **Test refresh behavior**: Ensure dynamic routes redirect correctly
8. **Custom perPage options**: Use `perPageOptions` for specific needs
9. **Colspan for wide fields**: Use `colspan: 2` for textarea in 2-column forms
10. **Validate on server**: Always validate even if client-side validation exists

---

## Quick Examples

### Minimal CRUD

```json
{
  "path": "/items",
  "type": "crud",
  "config": {
    "resource": "items",
    "title": "Items",
    "table": {
      "columns": [
        { "key": "id", "label": "ID" },
        { "key": "name", "label": "Name" },
        { "key": "actions", "type": "actions", "actions": ["edit", "delete"] }
      ],
      "features": { "search": true, "pagination": true, "perPage": 10 }
    },
    "form": {
      "fields": [
        { "name": "name", "label": "Name", "type": "text", "required": true }
      ]
    }
  }
}
```

### Minimal Page

```json
{
  "path": "/hello",
  "type": "page",
  "config": {
    "title": "Hello",
    "children": [
      { "type": "heading", "level": 1, "text": "Hello World" },
      { "type": "text", "text": "This is a simple page." }
    ]
  }
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Page shows dashboard on refresh | Check `layout.isValidRoute()` is being used |
| Columns misaligned | Ensure all columns rendered in header and body |
| Buttons bleed through header | Check z-index on header/pagination |
| perPage resets to 100 | Check localStorage + select default logic |
| Search fires on every keystroke | Ensure debounce is implemented |
| Create page shows blank on refresh | Verify `isCrudDynamicRoute` redirects correctly |
