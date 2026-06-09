# Form Builder Cheatsheet — Admin Starter

Referensi `core/form-builder.js` + `config.form` di `appjson/*.json`. Contoh: `appjson/categories.json`.

---

## 1. Where Form Builder Is Used

Form Builder renders the `config.form` section inside CRUD JSON pages.

```json
{
  "path": "/resource-page",
  "type": "crud",
  "config": {
    "resource": "resource_name",
    "formDisplay": "modal",
    "form": {
      "columns": 2,
      "intro": "Short form explanation shown above fields.",
      "fields": []
    }
  }
}
```

Main related files:

| File | Purpose |
|------|---------|
| `core/form-builder.js` | Builds forms, fields, validation, submit lifecycle |
| `core/form-field-presets.js` | Applies reusable field presets before rendering |
| `appjson/form-field-presets.json` | Central preset definitions |
| `core/input-mask.js` | Optional masked text input support |
| `core/rich-text-editor.js` | Optional rich textarea editor |
| `core/document-upload-hub.js` | Optional linked upload section |

---

## 2. Basic Form Structure

```json
"form": {
  "columns": 2,
  "gap": "1rem",
  "intro": "Isi data dengan lengkap.",
  "submitText": "Simpan",
  "cancelText": "Batal",
  "fields": [
    {
      "name": "nama",
      "label": "Nama Lengkap",
      "type": "text",
      "required": true,
      "placeholder": "Masukkan nama",
      "helpText": "Nama sesuai dokumen resmi."
    }
  ]
}
```

| Property | Type | Description |
|----------|------|-------------|
| `columns` | number | Number of grid columns, default `1` |
| `gap` | string | CSS grid gap, default `1rem` |
| `layout` | string | Supports default vertical, `horizontal`, or `grid` behavior |
| `intro` | string | Informational text above fields |
| `submitText` | string | Submit button label |
| `cancelText` | string\|false | Cancel label; `false` hides cancel button |
| `hideButtons` | boolean | Hide built-in submit/cancel buttons |
| `fields` | array | Field definitions |
| `linkedUpload` | object | Mount document upload hub inside form |
| `fieldPresetByName` | object | Page-level preset mapping |
| `applyFieldPresetRules` | boolean | Disable auto preset rules with `false` |

---

## 3. Common Field Properties

Most fields support these properties:

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Required. Key stored in `formData` and sent to API |
| `label` | string\|false | Field label. `false` hides label |
| `type` | string | Field type; default is text input behavior |
| `required` | boolean | Adds required marker and validation |
| `placeholder` | string | Placeholder or empty-state text |
| `default` | any | Default value when no initial data exists |
| `readonly` | boolean | Makes this field read-only/disabled |
| `disabled` | boolean | Same practical effect as readonly |
| `colspan` | number | Span multiple grid columns |
| `helpText` | string | Help text below field |
| `help`, `description`, `hint` | string | Alternative help text aliases |
| `textInfo` / `textinfo` | string | Additional info text below field |
| `helpLink` | object | Link below help text |
| `helpMaster` | boolean | Auto-link to master page from `optionsFrom.resource` |
| `validation` | object | Length and pattern validation |
| `mask` | object | InputMask config for text input |

Example:

```json
{
  "name": "nik",
  "label": "NIK",
  "type": "text",
  "required": true,
  "placeholder": "16 digit NIK dari KTP",
  "validation": {
    "pattern": "^[0-9]{16}$",
    "patternMessage": "NIK harus 16 digit angka"
  },
  "helpText": "Nomor Induk Kependudukan 16 digit."
}
```

---

## 4. Supported Field Types

| Type | Description | Main Config |
|------|-------------|-------------|
| `text` | Standard input | `placeholder`, `mask`, `validation` |
| `number` | Numeric input; saved as number when typed | `min`, `max`, `step` |
| `email` | Email input | `placeholder` |
| `password` | Password input | `placeholder` |
| `url` | URL input | `placeholder` |
| `datetime-local` | Native date-time input via default input path | `placeholder`, `readonly` |
| `textarea` | Multiline text or rich editor | `rows`, `richText` |
| `select` | Searchable/native dropdown | `options`, `optionsFrom`, `multiple` |
| `checkbox` | Boolean checkbox | `label`, `default` |
| `radio` | Radio option group | `options` |
| `range` | Slider with badge and clear button | `min`, `max`, `step`, `minLabel`, `maxLabel` |
| `date` | Custom date picker popup | `placeholder`, `required`, `readonly` |
| `section` | Visual section divider, not submitted | `title`, `description`, `variant` |
| `masa_kerja_duration` | Composite year/month duration | `maxTahun`, `maxBulan`, `bindBulan` |
| `waktu_kerja` | Composite work schedule field | Built-in time/day presets |
| `pptk_isi` | PPTK statement textarea with templates | `rows`, `placeholder` |

> Note: `datetime` is not a custom FormBuilder case. If native browser date-time is needed, prefer `type: "datetime-local"` because unknown/default types pass through `createInput()` as native input types.

---

## 5. Text / Number / Email / URL Inputs

```json
{
  "name": "telepon",
  "label": "Telepon",
  "type": "text",
  "placeholder": "08xxxxxxxxxx",
  "helpText": "Nomor kontak aktif."
}
```

Number input:

```json
{
  "name": "total_biaya",
  "label": "Total Biaya",
  "type": "number",
  "required": true,
  "readonly": true
}
```

Behavior:

- Text-like fields update `formData[field.name]` on input.
- `type: "number"` stores `Number(value)` when value is not empty.
- `readonly` or `disabled` sets both readonly and disabled attributes.
- `mask` uses `InputMask` if available.

---

## 6. Textarea and Rich Text

```json
{
  "name": "keterangan",
  "label": "Keterangan",
  "type": "textarea",
  "rows": 4,
  "colspan": 2,
  "placeholder": "Tulis catatan...",
  "richText": false
}
```

Behavior:

- If `RichTextEditor` is available and `richText !== false`, textarea may render as rich editor.
- Use `"richText": false` for plain textarea.
- Required validation checks real text content; HTML-empty rich text counts as empty.

---

## 7. Custom Date Picker

```json
{
  "name": "tanggaldaftar",
  "label": "Tanggal Daftar",
  "type": "date",
  "required": true,
  "helpText": "Tanggal pendaftaran di sistem."
}
```

Features:

- Custom popup calendar, not native HTML date.
- Internal value format: `YYYY-MM-DD`.
- Display format: `DD/MM/YYYY`.
- Month/year navigation.
- `Hari Ini` button.
- `Hapus` clear button.
- Popup uses viewport-aware positioning and can flip above input.
- Respects `readonly` / `disabled`.

---

## 8. Static Select

```json
{
  "name": "statusaktif",
  "label": "Status Aktif",
  "type": "select",
  "placeholder": "— Pilih status —",
  "options": [
    { "value": "PROSES", "label": "Proses" },
    { "value": "TERPILIH", "label": "Terpilih" },
    { "value": "TERBANG", "label": "Terbang" }
  ],
  "default": "PROSES"
}
```

Default select behavior:

- `searchable !== false` renders custom searchable combobox.
- `searchable: false` renders native `<select>`.
- Placeholder is shown when configured.
- Without placeholder, first option may become default.

Native select:

```json
{
  "name": "status",
  "type": "select",
  "searchable": false,
  "options": [
    { "value": "0", "label": "Tidak" },
    { "value": "1", "label": "Ya" }
  ]
}
```

---

## 9. Remote Select with `optionsFrom`

```json
{
  "name": "kode_sponsor",
  "label": "Sponsor",
  "type": "select",
  "required": true,
  "placeholder": "— Pilih sponsor —",
  "remoteSearch": false,
  "optionsFrom": {
    "resource": "datasponsor",
    "value": "kode_sponsor",
    "label": ["kode_sponsor", "isi"],
    "labelFormat": "{{kode_sponsor}} — {{isi}}",
    "sort": "kode_sponsor",
    "order": "asc",
    "perPage": 500
  }
}
```

`optionsFrom` properties:

| Property | Description |
|----------|-------------|
| `resource` | API resource to read |
| `value` | Field used as option value; defaults to `id` |
| `label` | String or array of fields for label |
| `labelFormat` | Template label, e.g. `{{kode}} — {{nama}}` |
| `valueFormat` | Template value, useful for composed values |
| `codeField` | Extra code appended to label |
| `sort` | Sort column |
| `order` | `asc` or `desc` |
| `perPage` | Number of records loaded |
| `filterFromField` | Parent field for dependent selects |
| `filterParam` | Query parameter sent for parent value |

Remote select modes:

| Config | Behavior |
|--------|----------|
| `remoteSearch: true` or omitted | Search via API as user types for large relations |
| `remoteSearch: false` | Load list once from API |
| `minSearchLength` | Minimum search characters before API query |
| `searchPlaceholder` | Search input placeholder in dropdown |

---

## 10. Searchable Select Behavior

Searchable select renders a custom combobox:

- Trigger button shows selected label.
- Dropdown is fixed-position with search input.
- Only one dropdown stays open at a time.
- Panel repositions on scroll/resize.
- Outside click closes the dropdown.
- Remote search is debounced and race-safe.
- Existing edit values are resolved to labels through API.
- Numeric unresolved values show as `#123`; string values show directly.

Internal API exposed on wrapper:

```js
selectEl._crudSelectApi.open()
selectEl._crudSelectApi.close()
selectEl._crudSelectApi.setOptions(options, selectedValue)
selectEl._crudSelectApi.setValue(value)
```

---

## 11. Multi Select

```json
{
  "name": "skill",
  "label": "Skill",
  "type": "select",
  "multiple": true,
  "multipleDelimiter": ", ",
  "options": [
    { "value": "masak", "label": "Masak" },
    { "value": "jompo", "label": "Jaga Jompo" },
    { "value": "anak", "label": "Jaga Anak" }
  ]
}
```

Behavior:

- Values are stored as a delimited string, default delimiter `, `.
- Existing data can be array, comma string, or delimiter string.
- Searchable display shows `N dipilih: ...`.
- Native select uses `multiple` and `size`.

---

## 12. Dependent / Cascading Select

Child select waits for parent value before loading options.

```json
{
  "name": "kode_cabang",
  "label": "Cabang",
  "type": "select",
  "optionsFrom": {
    "resource": "datacabang",
    "value": "kode_cabang",
    "labelFormat": "{{kode_cabang}} — {{nama}}"
  }
},
{
  "name": "parent_id",
  "label": "Kategori Induk",
  "type": "select",
  "waitParentLabel": "Pilih cabang terlebih dahulu",
  "optionsFrom": {
    "resource": "categories",
    "value": "id",
    "labelFormat": "{{kode}} — {{nama}}",
    "filterFromField": "kode_cabang",
    "filterParam": "kode_cabang"
  }
}
```

Behavior:

- Parent changes clear child value.
- Child reloads options with query param from parent.
- If parent is empty, child shows `waitParentLabel` / placeholder.

---

## 13. Quick Insert for Select

Quick insert adds a `+ Tambah baru` button below a select and saves a new master record inline.

```json
{
  "name": "kode_cabang",
  "label": "Cabang",
  "type": "select",
  "optionsFrom": {
    "resource": "datacabang",
    "value": "kode_cabang",
    "labelFormat": "{{kode_cabang}} — {{nama}}"
  },
  "quickInsert": {
    "title": "Tambah Cabang",
    "buttonLabel": "+ Tambah cabang",
    "resource": "datacabang",
    "valueField": "kode_cabang",
    "fields": [
      { "name": "kode_cabang", "label": "Kode", "required": true },
      { "name": "nama", "label": "Nama", "required": true }
    ]
  }
}
```

Behavior:

- Opens small modal.
- Validates required quick-insert fields.
- Checks duplicate value first.
- Creates via `apiClient.create(resource, payload)`.
- Reloads select options and selects new/existing value.

---

## 14. Checkbox and Radio

Checkbox:

```json
{
  "name": "aktif",
  "label": "Aktif",
  "type": "checkbox",
  "default": true
}
```

Radio:

```json
{
  "name": "jenis_kelamin",
  "label": "Jenis Kelamin",
  "type": "radio",
  "options": [
    { "value": "L", "label": "Laki-laki" },
    { "value": "P", "label": "Perempuan" }
  ]
}
```

---

## 15. Range Slider

```json
{
  "name": "nilai",
  "label": "Nilai",
  "type": "range",
  "min": 0,
  "max": 100,
  "step": 5,
  "minLabel": "Rendah",
  "maxLabel": "Tinggi",
  "default": 50
}
```

Features:

- Value badge.
- `Kosongkan` clear button.
- `minLabel` / `maxLabel` below slider.
- Stored as string value or empty string when cleared.

---

## 16. Section Divider

```json
{
  "type": "section",
  "title": "Data Dokumen",
  "description": "Isi status dan tanggal dokumen.",
  "variant": "default",
  "colspan": 2
}
```

Behavior:

- Visual-only field.
- Not stored in `formData`.
- Skipped during validation.
- `variant: "compact"` uses tighter spacing.

---

## 17. Special Composite Fields

### `masa_kerja_duration`

```json
{
  "name": "masa_kerja",
  "label": "Masa Kerja",
  "type": "masa_kerja_duration",
  "required": true,
  "maxTahun": 20,
  "maxBulan": 11,
  "bindBulan": "masa_kerja_bulan"
}
```

Features:

- Two dropdowns: tahun and bulan.
- Preview label like `Durasi: 2 tahun 3 bulan`.
- Can bind total month value through `bindBulan`.
- Required validation fails when both year and month are `0`.

### `waktu_kerja`

```json
{
  "name": "waktu_kerja",
  "label": "Waktu Kerja",
  "type": "waktu_kerja",
  "colspan": 2
}
```

Features:

- Start time and end time dropdowns.
- Optional note field.
- Day chips: Sen, Sel, Rab, Kam, Jum, Sab, Min.
- Built-in presets:
  - `Sen–Sab 08–17`
  - `24 jam / live-in`
- Preview of print-ready text.

### `pptk_isi`

```json
{
  "name": "isi",
  "label": "Isi Pernyataan PPTK",
  "type": "pptk_isi",
  "rows": 8,
  "required": true,
  "colspan": 2
}
```

Features:

- Textarea with template buttons.
- Character count preview.
- Textarea pernyataan dengan template (opsional, untuk dokumen cetak custom).

---

## 18. Input Mask

```json
{
  "name": "kode",
  "label": "Kode",
  "type": "text",
  "mask": {
    "pattern": "AAA-0000",
    "requireComplete": true
  }
}
```

Behavior:

- Uses `InputMask` only when available.
- Mask formats input as user types.
- Validation checks completeness when:
  - field is required, or
  - `mask.requireComplete !== false`
- Preset masks can be removed with:

```json
{
  "name": "nomor",
  "preset": "nomor_pap",
  "mask": false
}
```

or:

```json
{
  "name": "nomor",
  "preset": "nomor_pap",
  "noMask": true
}
```

---

## 19. Help Text and Help Links

Basic help:

```json
{
  "name": "kategori",
  "label": "Kategori",
  "type": "select",
  "helpText": "Pilih dari master kategori."
}
```

Manual help link:

```json
{
  "name": "kategori",
  "label": "Kategori",
  "type": "select",
  "helpLink": {
    "path": "/categories",
    "label": "Kelola kategori",
    "newTab": true
  }
}
```

Auto master link:

```json
{
  "name": "kode_cabang",
  "type": "select",
  "helpMaster": true,
  "helpMasterLabel": "Buka master cabang",
  "optionsFrom": {
    "resource": "datacabang",
    "value": "kode_cabang",
    "labelFormat": "{{kode_cabang}} — {{nama}}"
  }
}
```

---

## 20. Validation Rules

```json
{
  "name": "nik",
  "label": "NIK",
  "type": "text",
  "required": true,
  "validation": {
    "minLength": 16,
    "maxLength": 16,
    "pattern": "^[0-9]{16}$",
    "patternMessage": "NIK harus 16 digit angka"
  }
}
```

Supported validation:

| Rule | Description |
|------|-------------|
| `required` | Field cannot be empty |
| `validation.minLength` | Minimum text length |
| `validation.maxLength` | Maximum text length |
| `validation.pattern` | Regex string |
| `validation.patternMessage` | Custom regex error |
| `mask.requireComplete` | Complete masked value required |

Special validation:

- `textarea` and `pptk_isi` strip/check text content.
- `masa_kerja_duration` requires non-zero year/month if required.
- `waktu_kerja` requires composed schedule text if required.
- `section` fields are ignored.

---

## 21. Readonly / Disabled Fields

```json
{
  "name": "id",
  "label": "ID",
  "type": "text",
  "readonly": true,
  "disabled": true,
  "helpText": "Terisi otomatis, tidak bisa diubah."
}
```

Rules:

- Per-field `readonly` / `disabled` is respected by FormBuilder.
- Global `readOnly` option makes the whole form read-only.
- Date picker, select, range, and composite fields also respect readonly.
- For safest behavior use both `readonly: true` and `disabled: true` for fields that must never be edited.

---

## 22. Form Field Presets

Presets avoid repeating common field configs.

Central file: `appjson/form-field-presets.json`

Use explicit preset:

```json
{
  "name": "kode_cabang",
  "preset": "kode_cabang",
  "label": "Cabang",
  "required": true
}
```

Page-level mapping:

```json
"form": {
  "fieldPresetByName": {
    "kode_cabang": "kode_cabang"
  },
  "fields": [
    { "name": "kode_cabang", "required": true }
  ]
}
```

Global preset mapping:

```json
"fieldPresetByName": {
  "kode_cabang": "kode_cabang"
}
```

Auto rules example:

```json
{
  "match": { "name": "kode_cabang", "type": "select" },
  "preset": "kode_cabang"
}
```

Preset merge behavior:

- Preset provides base config.
- Field config overrides preset config.
- `mask: false` or `noMask: true` removes preset mask.
- Fields with explicit `type: "select"` and `optionsFrom` are not auto-overwritten by presets unless `preset` is specified.

---

## 23. Linked Upload Section

A form can mount `DocumentUploadHub` and sync the latest uploaded file into a form field.

```json
"form": {
  "columns": 2,
  "linkedUpload": {
    "label": "Upload dokumen",
    "textInfo": "Upload file terkait record ini.",
    "idBiodataField": "id",
    "uploadType": "upload_document",
    "syncFileField": "file_path",
    "emptyText": "Simpan record terlebih dahulu atau isi ID."
  },
  "fields": [
    { "name": "id", "type": "text", "readonly": true },
    { "name": "file_path", "label": "File", "type": "text", "readonly": true }
  ]
}
```

Behavior:

- Shows upload hub after fields.
- Watches `idBiodataField` changes.
- Filters uploads by `uploadType`.
- If `syncFileField` is configured, latest uploaded file path is copied into `formData[syncFileField]` before submit.

---

## 24. FormBuilder API

The builder is called internally by CrudEngine, but can be used directly:

```js
const form = FormBuilder.build(schema, {
  initialData: {},
  readOnly: false,
  apiClient,
  onSubmit: async (data) => {
    await apiClient.create('resource', data);
  },
  onCancel: () => {},
  onFieldChange: (fieldName, value) => {}
});

container.appendChild(form.get());
```

Build options:

| Option | Description |
|--------|-------------|
| `onSubmit(formData)` | Called after validation passes |
| `onCancel()` | Called when cancel button is clicked |
| `onFieldChange(fieldName, value)` | Called on field changes |
| `initialData` | Initial values for edit/prefill |
| `readOnly` | Whole-form readonly mode |
| `apiClient` | Needed for remote selects, quick insert, linked upload |

Returned API:

| Method | Description |
|--------|-------------|
| `el` | el.js form wrapper |
| `get()` | Raw DOM form element |
| `getData()` | Returns copy of current `formData` |
| `setData(data)` | Merge values and update rendered fields |
| `reset()` | Restore initial data and clear errors |
| `validate()` | Validate and show errors |
| `setLoading(loading)` | Toggle submit loading state |

Important pitfall:

```js
// Correct
FormBuilder.build(schema, {
  onSubmit: async (data) => {}
});

// Wrong
const form = FormBuilder.build(schema);
form.onSubmit(...); // not supported
```

---

## 25. Submit Lifecycle

When the form submits:

1. Browser submit is prevented.
2. Duplicate submit is blocked with `isSubmitting`.
3. `validate(fields, formData)` runs.
4. Errors are displayed below fields.
5. Submit button text becomes `Loading...`.
6. `linkedUpload.syncFileField` is synced if configured.
7. `onSubmit(formData)` is awaited.
8. Button state is restored.

---

## 26. Practical Minimal Example

```json
{
  "path": "/dataagama",
  "type": "crud",
  "config": {
    "resource": "dataagama",
    "title": "Data Agama",
    "formDisplay": "modal",
    "modalSize": "medium",
    "form": {
      "columns": 1,
      "fields": [
        {
          "name": "isi",
          "label": "Nama Agama",
          "type": "text",
          "required": true,
          "placeholder": "Contoh: Islam"
        },
        {
          "name": "keterangan",
          "label": "Keterangan",
          "type": "textarea",
          "rows": 3,
          "richText": false
        }
      ],
      "submitText": "Simpan",
      "cancelText": "Batal"
    }
  }
}
```

---

## 27. Common Gotchas

| Gotcha | Fix |
|--------|-----|
| `onSubmit` called as method | Pass it inside `FormBuilder.build(schema, { onSubmit })` |
| Remote select loads too much data | Use `remoteSearch: true` and `minSearchLength` |
| Select should load all master data | Set `remoteSearch: false` and reasonable `perPage` |
| Child select is empty | Ensure parent field has value and child uses correct `filterFromField` / `filterParam` |
| Textarea becomes rich editor unexpectedly | Set `richText: false` |
| Preset mask not wanted | Add `mask: false` or `noMask: true` |
| Date value looks different | Stored as `YYYY-MM-DD`, displayed as `DD/MM/YYYY` |
| `datetime` not behaving consistently | Prefer native `datetime-local` |
| Readonly field still must never change | Use both `readonly: true` and `disabled: true` |
| Field spans not working | Ensure form has `columns > 1`, then use `colspan` |
