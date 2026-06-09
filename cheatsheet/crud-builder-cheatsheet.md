# CRUD Builder Cheatsheet — Admin Starter

Referensi `appjson/*.json` + engine CRUD. Contoh live: `appjson/categories.json`.

## Architecture

```
appjson/*.json  → UI config (CRUD pages)
core/crud-engine.js   → Orchestrator (build, load, create, edit, delete)
core/table-builder.js → DataTable rendering (sort, paginate, actions)
core/form-builder.js  → Form rendering (all field types, validation)
core/form-field-presets.js → Shared field presets
core/schema-manager.js → DB schema DDL generation
core/api-client.js    → REST API client
```

---

## Top-Level JSON Structure (appjson)

```json
{
  "path": "/resource-name",
  "type": "crud",
  "config": { /* ...see below... */ },
  "options": {
    "permissions": ["admin", "role_name"]
  }
}
```

### Permissions Formats

```json
// Array — roles allowed for ALL actions
"permissions": ["admin", "super_admin"]

// Object — per-action role control
"permissions": {
  "create": [],
  "read": ["super_admin", "admin", "keuangan"],
  "update": ["super_admin", "admin"],
  "delete": []
}
// Empty array [] = no one (disabled)
```

---

## Config Properties (schema-level)

| Property | Type | Description |
|----------|------|-------------|
| `resource` | string | **Required.** API endpoint name |
| `title` | string | Page title |
| `icon` | string | FontAwesome icon class |
| `formDisplay` | `"modal"` \| `"newpage"` | How create/edit forms open |
| `modalSize` | `"small"` \| `"medium"` \| `"large"` | Modal width |
| `listResource` | string | Override API endpoint for list (different from `resource`) |
| `listSubtitle` | string | Subtitle text below title |
| `hideListHeader` | boolean | Hide title/icon, compact mode |
| `hideCreateButton` | boolean | Hide the "+ Tambah Baru" button |
| `createButtonLabel` | string | Custom create button text |
| `createPath` | string | Custom navigation path for create |
| `searchPlaceholder` | string | Custom search input placeholder |
| `defaultSort` | `{ column, direction }` | Default sort column & direction |
| `listSektorFilters` | array | Filter chips opsional `[{label, prefix}]` |
| `listStageFilters` | array | Filter chips opsional `[{label, key}]` |
| `enableChartView` | boolean | Toggle chart (halaman report custom) |
| `reportKey` | string | Key report custom (jika dipakai) |
| `readOnlyReport` | boolean | Halaman report read-only |
| `useUploadHub` | boolean | DocumentUploadHub untuk kolom dokumen |
| `pageContentPadding` | string | Override padding konten (mis. `"0"`) |
| `listInfoComponent` | string | Komponen UiBuilder di atas tabel |
| `listInfoProps` | object | Props untuk listInfoComponent |

---

## Table Configuration

```json
"table": {
  "columns": [ /* ... */ ],
  "features": {
    "search": true,
    "pagination": true,
    "perPage": 25,
    "perPageOptions": [5, 10, 25, 50, 100],
    "sortable": true,
    "multiSort": true,
    "selectable": false,
    "bulkActions": [],
    "tableHeight": "400px",
    "tableMinHeight": "200px"
  },
  "defaultSort": { "column": "nama", "direction": "asc" }
}
```

### Column Types

| Type | Description |
|------|-------------|
| *(default)* | Plain text cell |
| `"actions"` | Action buttons column |
| `"badge"` | Colored badge with `badgeMap` |
| `"docSlot"` | Document upload slot (Ada/Belum + Upload button) |

### Column Properties

| Property | Type | Description |
|----------|------|-------------|
| `key` | string | Field name from API data |
| `label` | string | Column header text |
| `type` | string | Column type (see above) |
| `sortable` | boolean | Enable click-to-sort (default: true for non-actions) |
| `searchable` | boolean | Include in client-side search |
| `width` | string/number | Column width (e.g. `"120px"`) |
| `align` | `"left"` \| `"center"` \| `"right"` | Text alignment |
| `nowrap` | boolean | `white-space: nowrap` |
| `fixed` | `"left"` \| `"right"` \| `true` | Sticky column position |
| `subKey` | string | Secondary field shown below main (two-line cell) |
| `render` | function | Custom HTML renderer `(value, row) => html` |
| `actions` | array | Action definitions (for type: actions) |
| `showActionLabels` | boolean | Show text labels on action buttons |
| `badgeMap` | object | Badge style map (for type: badge) |
| `badgeClick` | function | Click handler for badge (opens menu) |
| `badgeClickTitle` | string | Tooltip for clickable badge |
| `docField` | string | Field name for document path (docSlot) |
| `onUpload` | function | Upload handler (docSlot) |

### Badge Map Format

```json
"badgeMap": {
  "aktif": {
    "label": "Sudah Ada",
    "bg": "#f0fdf4",
    "color": "#15803d",
    "border": "#bbf7d0"
  },
  "proses": {
    "label": "Proses",
    "bg": "#fef3c7",
    "color": "#b45309",
    "border": "#fde68a"
  }
}
```

### Built-in Action Strings (starter)

| String | Description |
|--------|-------------|
| `"edit"` | Buka edit modal/page |
| `"delete"` | Hapus dengan konfirmasi |

> Action domain-specific (biodata, SPBG, dll.) dihapus dari starter. Tambah custom action object atau handler di `crud-engine.js` untuk project fork.

### Custom Action Object

```json
{
  "label": "My Action",
  "icon": "fas fa-star",
  "variant": "primary",
  "group": "status",
  "confirm": true,
  "visible": "function(row) => boolean",
  "onClick": "function(row) { ... }"
}
```

**Variants:** `primary` (green), `danger` (red), `warning` (amber), default (green solid)
**Groups:** `"status"` actions are separated by a `|` divider from other actions

---

## Form Configuration

```json
"form": {
  "columns": 2,
  "gap": "1rem",
  "layout": "vertical",
  "hideButtons": false,
  "submitText": "Simpan",
  "cancelText": "Batal",
  "intro": "Info text shown at top of form",
  "fields": [ /* ... */ ],
  "linkedUpload": { /* ... */ },
  "applyFieldPresetRules": true,
  "fieldPresetByName": {}
}
```

### Field Types

| Type | Description | Extra Properties |
|------|-------------|------------------|
| `text` | Text input | `placeholder`, `mask` |
| `email` | Email input | `placeholder` |
| `number` | Number input | `min`, `max`, `step` |
| `password` | Password input | `placeholder` |
| `textarea` | Multi-line text | `rows`, `placeholder` |
| `select` | Dropdown (searchable) | `options`, `optionsFrom`, `multiple` |
| `date` | Date picker (custom popup) | `placeholder` |
| `datetime` | Date + time input (native) | `placeholder`, `readonly` |
| `url` | URL input | `placeholder` |
| `checkbox` | Checkbox | `label` |
| `radio` | Radio buttons | `options` |
| `range` | Range slider | `min`, `max`, `step`, `minLabel`, `maxLabel` |
| `section` | Section divider/header | `title`, `description` |
| `masa_kerja_duration` | Durasi tahun + bulan (komposit) | `bindBulan` |
| `waktu_kerja` | Jadwal kerja (komposit) | — |
| `pptk_isi` | Textarea pernyataan + template | — |

### Common Field Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | **Required.** Field name / API key |
| `label` | string\|false | Label text (false to hide) |
| `type` | string | Field type |
| `required` | boolean | Required validation |
| `placeholder` | string | Input placeholder |
| `default` | any | Default value |
| `readonly` | boolean | Read-only (grayed out) |
| `disabled` | boolean | Same as readonly |
| `colspan` | number | Span N columns in grid |
| `helpText` | string | Help text below field |
| `textInfo` | string | Additional info text |
| `helpLink` | `{path, label}` | Link below field |
| `mask` | object | Input mask config (for text type) |
| `options` | array | Static options `[{value, label}]` |
| `validation` | object | `{min, max}` validation |

---

## Select Field — Remote Options (`optionsFrom`)

The most powerful feature: load dropdown options from any API endpoint.

### Basic optionsFrom

```json
{
  "name": "kode_group",
  "label": "Group",
  "type": "select",
  "optionsFrom": {
    "resource": "datagroup",
    "value": "kode_group",
    "label": ["kode_group", "nama"],
    "labelFormat": "{{kode_group}} — {{nama}}",
    "sort": "kode_group",
    "order": "asc",
    "perPage": 500
  }
}
```

### optionsFrom Properties

| Property | Type | Description |
|----------|------|-------------|
| `resource` | string | API endpoint to fetch options |
| `value` | string | Field used as option value (default: `"id"`) |
| `valueFormat` | string | Template for value: `"{{field1}} {{field2}}"` |
| `label` | string\|array | Field(s) for display label |
| `labelFormat` | string | Template: `"{{field1}} — {{field2}}"` |
| `codeField` | string | Appended as `(code)` to label |
| `sort` | string | Sort field |
| `order` | `"asc"` \| `"desc"` | Sort direction |
| `perPage` | number | Items per page (default: 30 for remote, 500 for bulk) |
| `filterFromField` | string | Parent field name for dependent selects |
| `filterParam` | string | Query param name for parent filter |
| `optionsPerPage` | number | Override per-page for this field |
| `minSearchLength` | number | Min chars before search fires |

### Searchable Select (default)

All selects are searchable by default. Control with:

```json
{
  "searchable": true,
  "remoteSearch": true,
  "minSearchLength": 0,
  "searchPlaceholder": "Cari nama bank..."
}
```

- `remoteSearch: true` — search on server (for large datasets)
- `remoteSearch: false` — load all options at once, filter client-side

### Dependent (Cascading) Select

```json
{
  "name": "parent_id",
  "type": "select",
  "optionsFrom": {
    "resource": "categories",
    "value": "id",
    "labelFormat": "{{kode}} — {{nama}}",
    "filterFromField": "kode_cabang",
    "filterParam": "kode_cabang"
  },
  "waitParentLabel": "Pilih cabang terlebih dahulu"
}
```

### Multi-Select

```json
{
  "name": "skills",
  "type": "select",
  "multiple": true,
  "multipleDelimiter": ", ",
  "optionsFrom": { "resource": "categories", "value": "id", "labelFormat": "{{nama}}" }
}
```

### Quick Insert (Inline Add New)

```json
{
  "name": "kode_sektor",
  "type": "select",
  "quickInsert": true,
  "optionsFrom": { "resource": "datasektor", "value": "kode_jenis", "labelFormat": "{{isi}}" }
}
```

Or with custom config:

```json
"quickInsert": {
  "resource": "datasektor",
  "valueField": "kode_jenis",
  "title": "Tambah Sektor",
  "buttonLabel": "+ Tambah sektor baru",
  "fields": [
    { "name": "kode_jenis", "label": "Kode", "required": true },
    { "name": "isi", "label": "Nama Sektor", "required": true }
  ]
}
```

---

## Form Field Presets

Shared field configurations in `appjson/form-field-presets.json`. Avoids repeating the same field config across multiple CRUD pages.

### Preset Resolution Order

1. Field-level `preset` property
2. `form.fieldPresetByName[field.name]`
3. Global `fieldPresetByName[field.name]`
4. Rules matching `{name, type}` → preset

### Usage

```json
// Field references preset by name
{ "name": "kode_cabang", "type": "select", "preset": "kode_cabang" }

// Atau auto-resolved lewat rules di form-field-presets.json
```

### Starter presets

File `appjson/form-field-presets.json` kosong di starter — isi saat fork project:

```json
{
  "version": 1,
  "presets": {
    "kode_cabang": {
      "type": "select",
      "optionsFrom": { "resource": "datacabang", "value": "kode_cabang", "labelFormat": "{{kode_cabang}} — {{nama}}" }
    }
  },
  "rules": []
}
```

---

## Advanced Config Patterns

### listResource (endpoint list berbeda)

```json
{
  "resource": "order_items",
  "listResource": "orders"
}
```

List pakai `orders`, create/edit pakai `order_items`.

### Filter Chips (opsional)

```json
"listStageFilters": [
  { "label": "Semua", "key": "" },
  { "label": "Aktif", "key": "1" },
  { "label": "Nonaktif", "key": "0" }
]
```

### Fixed (Sticky) Columns

```json
{ "key": "kode", "label": "Kode", "fixed": "left" },
{ "key": "actions", "type": "actions", "fixed": "right" }
```

### Read-Only Fields

```json
{ "name": "id", "type": "text", "readonly": true, "helpText": "Auto-filled" }
```

### helpLink

```json
{
  "name": "bank",
  "type": "select",
  "helpLink": { "path": "/databank", "label": "Kelola master Bank →" }
}
```

### Masked Input

```json
{
  "name": "nik",
  "type": "text",
  "mask": { "pattern": "9999999999999999" }
}
```

---

## CRUD Engine API (returned object)

```javascript
const crudApi = CrudEngine.build(schema, { apiClient, container, permissions, pagePath });

crudApi.el              // DOM element wrapper
crudApi.get()           // Raw DOM element
crudApi.table           // TableBuilder instance
crudApi.loadData()      // Refresh data from API
crudApi.openCreateModal()
crudApi.openCreateAsNewPage(defaults)
crudApi.openEditModal(row)
crudApi.openEditAsNewPage(row)
crudApi.deleteRow(row)
crudApi.setPermissions(perms)
crudApi.refresh()       // Alias for loadData
```

---

## TableBuilder API

```javascript
const table = TableBuilder.build(schema, options);

table.el              // Container element
table.setData(data, serverPagination)
table.getData()
table.getSelectedRows()
table.setLoading(true/false)
table.refresh()
table.resetSort(column, direction)
table.resetSelection()
```

---

## API Query Parameters (sent by CRUD)

| Parameter | Description |
|-----------|-------------|
| `page` | Page number (1-based) |
| `perPage` | Rows per page |
| `search` | Search query |
| `sort` | Sort column (or `col1:asc,col2:desc` for multi) |
| `order` | Sort direction (single sort) |
| `stage_filter` | Filter chip (jika dikonfigurasi) |
| `sektor_prefix` | Filter chip prefix (jika dikonfigurasi) |

---

## Server Response Format

### List

```json
{
  "success": true,
  "data": [{ "id": 1, "nama": "John" }],
  "pagination": {
    "page": 1,
    "perPage": 25,
    "total": 100,
    "totalPages": 4
  }
}
```

### Single Item

```json
{ "success": true, "data": { "id": 1, "nama": "John" } }
```

### Create/Update/Delete

```json
{ "success": true, "message": "Created", "data": { "id": 1 } }
```

---

## Minimal CRUD Example (starter)

Lihat `appjson/categories.json` — salin dan ubah `resource`, `path`, `fields`, `columns`.

```json
{
  "path": "/categories",
  "type": "crud",
  "config": {
    "resource": "categories",
    "title": "Kategori",
    "icon": "fas fa-tags",
    "formDisplay": "modal",
    "table": {
      "columns": [
        { "key": "kode", "label": "Kode", "sortable": true },
        { "key": "nama", "label": "Nama", "sortable": true },
        { "key": "aktif", "label": "Status" },
        { "key": "actions", "type": "actions", "actions": ["edit", "delete"] }
      ],
      "features": { "search": true, "pagination": true, "perPage": 25 }
    },
    "form": {
      "columns": 2,
      "fields": [
        { "name": "kode", "label": "Kode", "type": "text" },
        { "name": "nama", "label": "Nama", "type": "text", "required": true },
        {
          "name": "aktif",
          "label": "Status",
          "type": "select",
          "default": "1",
          "options": [
            { "value": "1", "label": "Aktif" },
            { "value": "0", "label": "Nonaktif" }
          ]
        }
      ]
    }
  },
  "options": {
    "permissions": {
      "create": ["super_admin", "admin"],
      "read": ["super_admin", "admin", "viewer"],
      "update": ["super_admin", "admin"],
      "delete": ["super_admin"]
    }
  }
}
```
