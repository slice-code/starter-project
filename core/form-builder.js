(function (global, factory) {
  typeof exports === "object" && typeof module !== "undefined"
    ? (module.exports = factory())
    : typeof define === "function" && define.amd
      ? define(factory)
      : ((global =
          typeof globalThis !== "undefined" ? globalThis : global || self),
        (global.FormBuilder = factory()));
})(this, function () {
  "use strict";

  let formLayoutStylesInjected = false;

  function ensureFormLayoutStyles() {
    if (
      formLayoutStylesInjected ||
      document.querySelector("style[data-crud-form-layout]")
    )
      return;
    formLayoutStylesInjected = true;
    const style = document.createElement("style");
    style.setAttribute("data-crud-form-layout", "true");
    style.textContent = `
      .crud-form-fields-grid {
        grid-auto-rows: minmax(min-content, auto);
        align-items: start;
      }
      .crud-form-field {
        min-width: 0;
        width: 100%;
        align-self: start;
      }
      .crud-field-rich-text {
        margin-bottom: 0.35rem;
      }
      .crud-field-rich-text .crud-rich-editor {
        min-height: 168px;
      }
      .crud-masa-kerja-duration {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
        align-items: flex-end;
      }
      .crud-masa-kerja-duration .crud-masa-kerja-part {
        flex: 1 1 140px;
        min-width: 120px;
      }
      .crud-masa-kerja-duration .crud-masa-kerja-part label {
        display: block;
        font-size: 0.72rem;
        color: #64748b;
        margin-bottom: 0.25rem;
        font-weight: 600;
      }
      .crud-masa-kerja-duration select {
        width: 100%;
        padding: 0.65rem 0.75rem;
        border-radius: 0.5rem;
        border: 1px solid #d1d5db;
        font-size: 0.95rem;
        background: #fff;
      }
      .crud-masa-kerja-preview {
        flex: 1 1 100%;
        font-size: 0.82rem;
        color: #475569;
        min-height: 1.1rem;
      }
      .crud-waktu-kerja {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
      }
      .crud-waktu-kerja-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
        align-items: flex-end;
      }
      .crud-waktu-kerja-part {
        flex: 1 1 140px;
        min-width: 120px;
      }
      .crud-waktu-kerja-part label {
        display: block;
        font-size: 0.72rem;
        color: #64748b;
        margin-bottom: 0.25rem;
        font-weight: 600;
      }
      .crud-waktu-kerja-part select,
      .crud-waktu-kerja-part input[type="text"] {
        width: 100%;
        padding: 0.65rem 0.75rem;
        border-radius: 0.5rem;
        border: 1px solid #d1d5db;
        font-size: 0.95rem;
        background: #fff;
      }
      .crud-waktu-kerja-days {
        flex: 1 1 100%;
      }
      .crud-waktu-kerja-days label {
        display: block;
        font-size: 0.72rem;
        color: #64748b;
        margin-bottom: 0.35rem;
        font-weight: 600;
      }
      .crud-waktu-kerja-day-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }
      .crud-waktu-kerja-day-chip {
        padding: 0.35rem 0.55rem;
        border-radius: 999px;
        border: 1px solid #cbd5e1;
        background: #fff;
        color: #475569;
        font-size: 0.78rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
      }
      .crud-waktu-kerja-day-chip.is-active {
        background: #dbeafe;
        border-color: #2563eb;
        color: #1d4ed8;
      }
      .crud-waktu-kerja-day-chip:disabled {
        cursor: not-allowed;
        opacity: 0.65;
      }
      .crud-waktu-kerja-presets {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }
      .crud-waktu-kerja-preset {
        padding: 0.3rem 0.55rem;
        border-radius: 0.45rem;
        border: 1px dashed #94a3b8;
        background: #fff;
        color: #2563eb;
        font-size: 0.74rem;
        font-weight: 600;
        cursor: pointer;
      }
      .crud-waktu-kerja-preset:hover {
        background: #eff6ff;
        border-color: #2563eb;
      }
      .crud-waktu-kerja-preset:disabled {
        cursor: not-allowed;
        opacity: 0.65;
      }
      .crud-waktu-kerja-preview {
        font-size: 0.82rem;
        color: #475569;
        min-height: 1.1rem;
      }
      .crud-pptk-isi {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }
      .crud-pptk-isi-label {
        font-size: 0.72rem;
        color: #64748b;
        font-weight: 600;
      }
      .crud-pptk-isi-presets {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }
      .crud-pptk-isi-preset {
        padding: 0.35rem 0.6rem;
        border-radius: 0.45rem;
        border: 1px dashed #94a3b8;
        background: #fff;
        color: #2563eb;
        font-size: 0.74rem;
        font-weight: 600;
        cursor: pointer;
      }
      .crud-pptk-isi-preset:hover {
        background: #eff6ff;
        border-color: #2563eb;
      }
      .crud-pptk-isi-preset:disabled {
        cursor: not-allowed;
        opacity: 0.65;
      }
      .crud-pptk-isi textarea {
        width: 100%;
        padding: 0.65rem 0.75rem;
        border-radius: 0.5rem;
        border: 1px solid #d1d5db;
        font-size: 0.95rem;
        resize: vertical;
        font-family: inherit;
        line-height: 1.5;
      }
      .crud-pptk-isi-preview {
        font-size: 0.78rem;
        color: #64748b;
      }
      .crud-select-quick-add-btn {
        align-self: flex-start;
        margin-top: 0.35rem;
        padding: 0.35rem 0.7rem;
        border-radius: 0.45rem;
        border: 1px dashed #94a3b8;
        background: #fff;
        color: #2563eb;
        font-weight: 600;
        font-size: 0.78rem;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
      }
      .crud-select-quick-add-btn:hover {
        background: #eff6ff;
        border-color: #2563eb;
      }
      .crud-field-textinfo {
        font-size: 0.75rem;
        color: #64748b;
        line-height: 1.45;
        margin-top: 0.35rem;
      }
      .crud-form-intro {
        font-size: 0.8125rem;
        color: #475569;
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        border-radius: 0.5rem;
        padding: 0.65rem 0.75rem;
        line-height: 1.5;
        margin-bottom: 0.25rem;
      }
      .crud-linked-upload {
        grid-column: 1 / -1;
      }
      .crud-date-picker-form-root {
        position: relative;
        overflow: visible;
      }
      .crud-date-picker-form-root.is-date-picker-open {
        z-index: 0;
      }
      .crud-date-picker {
        position: relative;
        width: 100%;
      }
      .crud-date-picker.is-open {
        z-index: 2;
      }
      .crud-date-picker-input {
        padding: 0.65rem 0.75rem;
        padding-right: 2.5rem;
        border-radius: 0.5rem;
        border: 1px solid #d1d5db;
        font-size: 0.95rem;
        outline: none;
        transition: border-color 0.2s;
        width: 100%;
        box-sizing: border-box;
        cursor: pointer;
        background: #fff;
      }
      .crud-date-picker-input:focus {
        border-color: #2563eb;
      }
      .crud-date-picker-input:disabled {
        cursor: not-allowed;
        background: #f3f4f6;
      }
      .crud-date-picker-trigger {
        position: absolute;
        right: 0.5rem;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.25rem;
        color: #6b7280;
      }
      .crud-date-picker-trigger:disabled {
        cursor: not-allowed;
      }
      .crud-date-picker-popup {
        position: fixed;
        z-index: 10050;
        background: #fff;
        border: 1px solid #cbd5e1;
        border-radius: 0.65rem;
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
        padding: 0.85rem;
        box-sizing: border-box;
        width: 19.5rem;
        min-width: 19.5rem;
        max-width: 19.5rem;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        user-select: none;
      }
      .crud-date-picker-popup .crud-date-picker-header {
        display: flex !important;
        flex-direction: row !important;
        flex-wrap: nowrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.35rem;
        margin-bottom: 0.75rem;
      }
      .crud-date-picker-popup .crud-date-picker-nav {
        display: inline-flex !important;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        width: 1.85rem;
        height: 1.85rem;
        border: 1px solid #e2e8f0;
        border-radius: 0.45rem;
        background: #fff;
        color: #475569;
        cursor: pointer;
        padding: 0;
      }
      .crud-date-picker-popup .crud-date-picker-nav:hover {
        background: #f8fafc;
        border-color: #cbd5e1;
      }
      .crud-date-picker-popup .crud-date-picker-title {
        display: flex !important;
        flex-direction: row !important;
        flex: 1 1 auto;
        gap: 0.35rem;
        justify-content: center;
        min-width: 0;
      }
      .crud-date-picker-popup .crud-date-picker-title select {
        flex: 1 1 auto;
        min-width: 0;
        max-width: 7.5rem;
        border: 1px solid #e2e8f0;
        border-radius: 0.45rem;
        padding: 0.3rem 0.45rem;
        font-size: 0.82rem;
        font-weight: 600;
        color: #1e293b;
        background: #fff;
        cursor: pointer;
      }
      .crud-date-picker-popup .crud-date-picker-weekdays,
      .crud-date-picker-popup .crud-date-picker-days {
        display: grid !important;
        grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
        gap: 0.15rem;
        width: 100%;
      }
      .crud-date-picker-popup .crud-date-picker-weekdays {
        margin-bottom: 0.35rem;
      }
      .crud-date-picker-popup .crud-date-picker-weekday {
        display: block !important;
        text-align: center;
        font-size: 0.72rem;
        font-weight: 700;
        color: #64748b;
        padding: 0.2rem 0;
        line-height: 1.2;
      }
      .crud-date-picker-popup .crud-date-picker-day {
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 2rem;
        min-height: 2rem;
        padding: 0;
        border: none;
        border-radius: 0.45rem;
        background: transparent;
        color: #1e293b;
        font-size: 0.82rem;
        line-height: 1;
        cursor: pointer;
        transition: background 0.12s, color 0.12s;
      }
      .crud-date-picker-popup .crud-date-picker-day:hover:not(:disabled) {
        background: #f1f5f9;
      }
      .crud-date-picker-popup .crud-date-picker-day.is-other-month {
        color: #94a3b8;
      }
      .crud-date-picker-popup .crud-date-picker-day.is-today {
        background: #dbeafe;
        color: #1d4ed8;
        font-weight: 700;
      }
      .crud-date-picker-popup .crud-date-picker-day.is-selected {
        background: #2563eb;
        color: #fff;
        font-weight: 700;
      }
      .crud-date-picker-popup .crud-date-picker-day.is-selected.is-today {
        background: #1d4ed8;
        color: #fff;
      }
      .crud-date-picker-popup .crud-date-picker-day:disabled {
        color: #cbd5e1;
        cursor: not-allowed;
        background: transparent;
      }
      .crud-date-picker-popup .crud-date-picker-footer {
        display: flex !important;
        flex-direction: row !important;
        margin-top: 0.75rem;
        padding-top: 0.65rem;
        border-top: 1px solid #e2e8f0;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .crud-date-picker-popup .crud-date-picker-footer button {
        padding: 0.42rem 0.75rem;
        border-radius: 0.45rem;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid transparent;
      }
      .crud-date-picker-popup .crud-date-picker-clear {
        background: #fff;
        border-color: #e2e8f0;
        color: #64748b;
      }
      .crud-date-picker-popup .crud-date-picker-clear:hover {
        background: #f8fafc;
      }
      .crud-date-picker-popup .crud-date-picker-today {
        background: #2563eb;
        color: #fff;
      }
      .crud-date-picker-popup .crud-date-picker-today:hover {
        background: #1d4ed8;
      }
    `;
    document.head.appendChild(style);
  }

  function resolveDatePickerFormRoot(node) {
    if (!node || !node.closest) return null;
    return node.closest("#crud-form, form[data-crud-form], form");
  }

  function ensureDatePickerFormRoot(node) {
    let root = resolveDatePickerFormRoot(node);
    if (!root && node?.closest) {
      root = node.closest(".crud-date-picker");
    }
    if (!root) return null;
    root.classList.add("crud-date-picker-form-root");
    return root;
  }

  function getDatePickerScrollRoot() {
    try {
      if (typeof layout !== "undefined" && layout.connector?.pagecontent) {
        return layout.connector.pagecontent;
      }
    } catch {
      /* ignore */
    }
    return document.scrollingElement || document.documentElement;
  }

  function scrollDatePickerIntoView(popupEl) {
    if (!popupEl) return;
    try {
      const scrollRoot = getDatePickerScrollRoot();
      if (!scrollRoot) {
        popupEl.scrollIntoView({ block: "nearest" });
        return;
      }
      const rootRect = scrollRoot.getBoundingClientRect();
      const popupRect = popupEl.getBoundingClientRect();
      if (popupRect.bottom > rootRect.bottom - 12) {
        scrollRoot.scrollTop += popupRect.bottom - rootRect.bottom + 20;
      }
      if (popupRect.top < rootRect.top + 12) {
        scrollRoot.scrollTop -= rootRect.top + 12 - popupRect.top;
      }
    } catch {
      /* ignore */
    }
  }

  function parseIsoDate(str) {
    if (str == null || str === "") return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str).trim());
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function parseDateValue(str) {
    if (str == null || str === "") return "";
    const fromIso = parseIsoDate(str);
    if (fromIso) return formatIsoDateLocal(fromIso);
    const displayMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(
      String(str).trim(),
    );
    if (displayMatch) {
      const date = new Date(
        Number(displayMatch[3]),
        Number(displayMatch[2]) - 1,
        Number(displayMatch[1]),
      );
      if (!Number.isNaN(date.getTime())) return formatIsoDateLocal(date);
    }
    return "";
  }

  function formatIsoDateLocal(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function formatDateDisplay(iso) {
    const date = parseIsoDate(iso);
    if (!date) return iso || "";
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  }

  function todayIsoLocal() {
    return formatIsoDateLocal(new Date());
  }

  // Pemetaan FK umum → resource API (jika optionsFrom tidak didefinisikan)
  const FK_RELATION_MAP = {
    customer_id: {
      resource: "customers",
      value: "id",
      labelFormat: "{{first_name}} {{last_name}}",
      codeField: "customer_code",
      optionsPerPage: 30,
    },
    company_id: {
      resource: "companies",
      value: "id",
      label: "company_name",
      codeField: "company_code",
      optionsPerPage: 30,
    },
    assigned_to: {
      resource: "users",
      value: "id",
      label: "name",
      optionsPerPage: 30,
    },
    created_by: {
      resource: "users",
      value: "id",
      label: "name",
    },
    product_id: {
      resource: "products",
      value: "id",
      label: "name",
    },
    lead_id: {
      resource: "leads",
      value: "id",
      label: "full_name",
      codeField: "lead_code",
      labelFormat: "{{first_name}} {{last_name}}",
      optionsPerPage: 30,
    },
    deal_id: {
      resource: "deals",
      value: "id",
      label: "title",
      codeField: "deal_code",
      optionsPerPage: 30,
    },
    tag_id: {
      resource: "tags",
      value: "id",
      label: "name",
      optionsPerPage: 30,
    },
    parent_company_id: {
      resource: "companies",
      value: "id",
      label: "company_name",
      codeField: "company_code",
      optionsPerPage: 30,
    },
  };

  let selectSearchStylesInjected = false;
  let selectOutsideClickBound = false;
  const openSearchSelects = new Set();

  function ensureSelectSearchStyles() {
    if (
      selectSearchStylesInjected ||
      document.querySelector("style[data-crud-select-search]")
    )
      return;
    selectSearchStylesInjected = true;
    const style = document.createElement("style");
    style.setAttribute("data-crud-select-search", "true");
    style.textContent = `
      .crud-search-select.is-open .crud-search-select-trigger {
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
      }
      .crud-search-select-item:hover {
        background-color: #f1f5f9;
      }
      .crud-search-select-item.is-selected {
        background-color: #eff6ff;
        color: #1d4ed8;
        font-weight: 500;
      }
    `;
    document.head.appendChild(style);
  }

  function bindSelectOutsideClick() {
    if (selectOutsideClickBound) return;
    selectOutsideClickBound = true;
    document.addEventListener("click", (e) => {
      openSearchSelects.forEach((api) => {
        if (typeof api.isClickInside === "function" && api.isClickInside(e))
          return;
        if (typeof api.close === "function") api.close();
        openSearchSelects.delete(api);
      });
    });
  }

  function parseDurationUnit(raw, unit) {
    const s = String(raw || "").trim();
    if (!s) return 0;
    if (unit === "tahun") {
      if (/bulan/i.test(s) && !/tahun|thn/i.test(s)) return 0;
      const labeled = s.match(/(\d+)\s*(?:tahun|thn|year)/i);
      if (labeled) return Math.max(0, parseInt(labeled[1], 10));
      if (/^\d+$/.test(s)) return Math.max(0, parseInt(s, 10));
      const any = s.match(/(\d+)/);
      return any ? Math.max(0, parseInt(any[1], 10)) : 0;
    }
    if (unit === "bulan") {
      const labeled = s.match(/(\d+)\s*(?:bulan|bln|month)/i);
      if (labeled) return Math.max(0, parseInt(labeled[1], 10));
      return 0;
    }
    return 0;
  }

  function parseMasaKerjaDuration(formData, field) {
    const bulanField = field?.bindBulan || "masabulan";
    const rawTahun = formData?.[field?.name || "masa_kerja"];
    const rawBulan = formData?.[bulanField];
    let tahun = parseDurationUnit(rawTahun, "tahun");
    let bulan = parseDurationUnit(rawBulan, "bulan");
    const combined = String(rawTahun || "");
    if (/bulan/i.test(combined)) {
      const bm = combined.match(/(\d+)\s*(?:bulan|bln|month)/i);
      if (bm) bulan = Math.max(bulan, parseInt(bm[1], 10));
    }
    if (/tahun|thn/i.test(combined)) {
      const tm = combined.match(/(\d+)\s*(?:tahun|thn|year)/i);
      if (tm) tahun = Math.max(tahun, parseInt(tm[1], 10));
    }
    return { tahun, bulan };
  }

  function formatMasaKerjaLabel(tahun, bulan) {
    const parts = [];
    if (tahun > 0) parts.push(`${tahun} tahun`);
    if (bulan > 0) parts.push(`${bulan} bulan`);
    return parts.join(" ");
  }

  function applyMasaKerjaDuration(formData, field, tahun, bulan) {
    const bulanField = field.bindBulan || "masabulan";
    formData[field.name] = tahun > 0 ? `${tahun} tahun` : "";
    formData[bulanField] = bulan > 0 ? `${bulan} bulan` : "";
  }

  const WAKTU_KERJA_HARI = [
    { key: "sen", label: "Sen", full: "Senin" },
    { key: "sel", label: "Sel", full: "Selasa" },
    { key: "rab", label: "Rab", full: "Rabu" },
    { key: "kam", label: "Kam", full: "Kamis" },
    { key: "jum", label: "Jum", full: "Jumat" },
    { key: "sab", label: "Sab", full: "Sabtu" },
    { key: "min", label: "Min", full: "Minggu" },
  ];

  const WAKTU_KERJA_JAM_OPTIONS = (() => {
    const opts = [];
    for (let h = 5; h <= 23; h += 1) {
      for (const m of [0, 30]) {
        if (h === 23 && m > 0) break;
        opts.push(
          `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        );
      }
    }
    return opts;
  })();

  function normalizeJamValue(raw) {
    const s = String(raw || "").trim();
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return "";
    const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  function formatWaktuKerjaHariLabel(activeKeys) {
    const keys = WAKTU_KERJA_HARI.map((d) => d.key);
    const active = keys.filter((k) => activeKeys.includes(k));
    if (!active.length) return "";
    if (active.length === 7) return "Senin–Minggu";
    const weekday = ["sen", "sel", "rab", "kam", "jum", "sab"];
    if (active.length === 6 && weekday.every((k) => active.includes(k))) {
      return "Senin–Sabtu (libur Minggu)";
    }
    return active
      .map((k) => WAKTU_KERJA_HARI.find((d) => d.key === k)?.label || k)
      .join(", ");
  }

  function parseWaktuKerjaValue(raw) {
    const text = String(raw || "").trim();
    const state = {
      jamMulai: "",
      jamSelesai: "",
      hari: [],
      catatan: text,
    };
    if (!text) return state;

    const range = text.match(/(\d{1,2}:\d{2})\s*[–\-~]\s*(\d{1,2}:\d{2})/);
    if (range) {
      state.jamMulai = normalizeJamValue(range[1]);
      state.jamSelesai = normalizeJamValue(range[2]);
      state.catatan = text
        .replace(range[0], "")
        .replace(/^[\s,;]+|[\s,;]+$/g, "");
    }

    const lower = text.toLowerCase();
    if (/senin\s*[–\-]\s*sabtu/i.test(text)) {
      state.hari = ["sen", "sel", "rab", "kam", "jum", "sab"];
    } else if (/senin\s*[–\-]\s*minggu/i.test(lower)) {
      state.hari = WAKTU_KERJA_HARI.map((d) => d.key);
    } else {
      WAKTU_KERJA_HARI.forEach((d) => {
        if (
          new RegExp(`\\b${d.full}\\b`, "i").test(text) ||
          new RegExp(`\\b${d.label}\\b`, "i").test(text)
        ) {
          state.hari.push(d.key);
        }
      });
    }

    if (state.catatan) {
      const stripped = state.catatan
        .replace(/senin\s*[–\-]\s*sabtu(\s*\(libur\s*minggu\))?/gi, "")
        .replace(/senin\s*[–\-]\s*minggu/gi, "")
        .replace(
          /\b(sen|sel|rab|kam|jum|sab|min)(,\s*(sen|sel|rab|kam|jum|sab|min))*\b/gi,
          "",
        )
        .replace(/^[\s,;]+|[\s,;]+$/g, "");
      state.catatan = stripped;
    }
    return state;
  }

  function composeWaktuKerjaValue(jamMulai, jamSelesai, hariKeys, catatan) {
    const parts = [];
    if (jamMulai && jamSelesai) parts.push(`${jamMulai}–${jamSelesai}`);
    else if (jamMulai) parts.push(`Mulai ${jamMulai}`);
    else if (jamSelesai) parts.push(`Selesai ${jamSelesai}`);
    const hariLabel = formatWaktuKerjaHariLabel(hariKeys);
    if (hariLabel) parts.push(hariLabel);
    const extra = String(catatan || "").trim();
    if (extra) parts.push(extra);
    return parts.join(", ");
  }

  function applyWaktuKerja(formData, field, state) {
    formData[field.name] = composeWaktuKerjaValue(
      state.jamMulai,
      state.jamSelesai,
      state.hari,
      state.catatan,
    );
  }

  const PPTK_ISI_TEMPLATES = [
    {
      label: "Standar penempatan",
      text: "Saya yang bertanda tangan di bawah ini menyatakan dengan sebenarnya bahwa saya bersedia ditempatkan bekerja di luar negeri melalui agen penempatan resmi, mematuhi peraturan majikan dan perjanjian penempatan, serta menjamin kebenaran seluruh data biodata yang saya isi.",
    },
    {
      label: "Sesuai permohonan kerja",
      text: "Saya menyatakan bersedia bekerja sesuai jenis usaha, posisi, waktu kerja, lokasi, dan kondisi kerja sebagaimana tercantum dalam bagian Permohonan biodata ini, serta mematuhi ketentuan lembur apabila diperlukan majikan.",
    },
    {
      label: "Tidak menarik diri",
      text: "Saya menyatakan tidak akan menarik diri atau mengundurkan diri dari proses penempatan tanpa persetujuan agen penempatan dan majikan, kecuali force majeure yang dapat dibuktikan secara sah.",
    },
  ];

  const FormBuilder = {
    /** Tutup semua searchable select terbuka (panel fixed z-index tinggi bisa menutup modal) */
    closeAllSearchSelects() {
      openSearchSelects.forEach((api) => {
        if (typeof api.close === "function") api.close();
      });
      openSearchSelects.clear();
      if (typeof document !== "undefined") {
        document
          .querySelectorAll(".crud-search-select.is-open")
          .forEach((node) => {
            node.classList.remove("is-open");
          });
        document
          .querySelectorAll(".crud-search-select-panel")
          .forEach((panel) => {
            panel.style.display = "none";
          });
      }
    },

    // Set disabled dengan benar (jangan pakai attr('disabled', false) — tetap nonaktif di HTML)
    setDisabled(elWrap, isDisabled) {
      if (elWrap && typeof elWrap.disabled === "function") {
        elWrap.disabled(!!isDisabled);
      }
    },

    getSelectControl(element) {
      return element?._selectControl || element;
    },

    resolveQuickInsertConfig(field) {
      if (!field?.quickInsert) return null;
      const rel = field.optionsFrom || this.getRelationConfig(field);
      if (!rel?.resource) return null;
      const valueField = rel.value || "isi";
      const defaultQuickInsertFields = [
        {
          name: valueField,
          label: "Nama",
          required: true,
          placeholder: "Ketik nama…",
        },
        { name: "mandarin", label: "Mandarin (opsional)", placeholder: "" },
      ];
      if (field.quickInsert === true) {
        return {
          resource: rel.resource,
          valueField,
          title: `Tambah ${field.label || "Master"}`,
          buttonLabel: "+ Tambah baru",
          fields: defaultQuickInsertFields,
        };
      }
      const qi = field.quickInsert;
      return {
        resource: qi.resource || rel.resource,
        valueField: qi.valueField || valueField,
        title: qi.title || `Tambah ${field.label || "Master"}`,
        buttonLabel: qi.buttonLabel || "+ Tambah baru",
        fields: qi.fields || defaultQuickInsertFields,
      };
    },

    async reloadSelectAndPick(
      field,
      apiClient,
      formData,
      selectControl,
      newVal,
    ) {
      const loaded = await this.loadSelectOptions(
        field,
        apiClient,
        newVal,
        formData,
      );
      this.fillSelectOptions(selectControl, field, loaded, newVal, formData);
      const notifyFieldChange = this._buildOnFieldChange;
      if (typeof notifyFieldChange === "function") {
        notifyFieldChange(field.name, formData[field.name]);
      }
    },

    openSelectQuickInsertModal(field, formData, apiClient, cfg, selectControl) {
      if (typeof layout === "undefined" || !layout.modal) return;

      const body = el("div").css({
        display: "flex",
        flexDirection: "column",
        gap: "0.85rem",
      });
      const msg = el("p").css({
        margin: 0,
        fontSize: "0.78rem",
        color: "#64748b",
        minHeight: "1.1rem",
      });
      const inputs = {};
      let firstInputEl = null;

      cfg.fields.forEach((f) => {
        const wrap = el("div");
        const labelText = f.required
          ? `${f.label || f.name} *`
          : f.label || f.name;
        wrap.child(
          el("label").text(labelText).css({
            display: "block",
            fontSize: "0.85rem",
            fontWeight: "600",
            color: "#374151",
            marginBottom: "0.35rem",
          }),
        );
        const inp = el("input")
          .attr("type", "text")
          .attr("placeholder", f.placeholder || "")
          .css({
            width: "100%",
            padding: "0.65rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #d1d5db",
            fontSize: "0.95rem",
            boxSizing: "border-box",
            outline: "none",
          });
        inputs[f.name] = inp;
        wrap.child(inp);
        body.child(wrap);
        if (!firstInputEl) firstInputEl = inp.el;
      });
      body.child(msg);

      const footer = el("div").css({
        display: "flex",
        justifyContent: "flex-end",
        gap: "0.55rem",
        flexWrap: "wrap",
      });

      const cancelBtn = el("button").attr("type", "button").text("Batal").css({
        padding: "0.55rem 1rem",
        borderRadius: "0.5rem",
        border: "1px solid #cbd5e1",
        background: "#fff",
        color: "#334155",
        fontWeight: "600",
        fontSize: "0.875rem",
        cursor: "pointer",
      });

      const saveBtn = el("button").attr("type", "button").text("Simpan").css({
        padding: "0.55rem 1rem",
        borderRadius: "0.5rem",
        border: "none",
        background: "#2563eb",
        color: "#fff",
        fontWeight: "600",
        fontSize: "0.875rem",
        cursor: "pointer",
      });

      const setMsg = (text, color) => {
        msg.text(text).css({ color: color || "#64748b" });
      };

      const doSave = async () => {
        const payload = {};
        for (const f of cfg.fields) {
          const val = String(inputs[f.name]?.el?.value || "").trim();
          if (f.required && !val) {
            setMsg(`${f.label || f.name} wajib diisi.`, "#dc2626");
            inputs[f.name]?.el?.focus();
            return;
          }
          if (val) payload[f.name] = val;
        }

        const newLabel = payload[cfg.valueField];
        if (!newLabel) {
          setMsg("Data tidak valid.", "#dc2626");
          return;
        }

        saveBtn.disabled(true).css({ opacity: "0.7", cursor: "wait" });
        setMsg("Menyimpan…", "#64748b");

        try {
          const existing = await this.loadSelectOptions(
            field,
            apiClient,
            newLabel,
            formData,
          );
          const dup = (existing || []).find(
            (o) =>
              String(o.value).trim().toLowerCase() ===
              String(newLabel).trim().toLowerCase(),
          );
          const pickedVal = dup
            ? dup.value
            : (await apiClient.create(cfg.resource, payload))?.data?.[
                cfg.valueField
              ] || newLabel;

          await this.reloadSelectAndPick(
            field,
            apiClient,
            formData,
            selectControl,
            pickedVal,
          );
          layout.closeModal();
          if (layout.toast) {
            layout.toast(
              dup
                ? "Sudah ada di master — langsung dipilih."
                : "Ditambahkan ke master dan dipilih.",
              { type: "success" },
            );
          }
        } catch (e) {
          setMsg(e?.message || "Gagal menambah ke master.", "#dc2626");
        } finally {
          saveBtn.disabled(false).css({ opacity: "1", cursor: "pointer" });
        }
      };

      cancelBtn.click(() => layout.closeModal());
      saveBtn.click(doSave);

      Object.values(inputs).forEach((inp) => {
        inp.on("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            doSave();
          }
        });
      });

      footer.child([cancelBtn, saveBtn]);

      layout.modal({
        title: cfg.title,
        content: body,
        footer,
        dismissible: true,
        size: "small",
      });

      setTimeout(() => firstInputEl?.focus(), 50);
    },

    mountSelectQuickInsert(
      parentWrap,
      field,
      formData,
      apiClient,
      cfg,
      selectControl,
    ) {
      const addBtn = el("button")
        .attr("type", "button")
        .class("crud-select-quick-add-btn")
        .text(cfg.buttonLabel || "+ Tambah baru");

      addBtn.click((e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openSelectQuickInsertModal(
          field,
          formData,
          apiClient,
          cfg,
          selectControl,
        );
      });

      parentWrap.child(addBtn);
    },

    // Ambil konfigurasi relasi dari field (optionsFrom eksplisit atau inferensi nama field)
    getRelationConfig(field) {
      if (field.optionsFrom) {
        if (typeof field.optionsFrom === "string") {
          const inferred = FK_RELATION_MAP[field.name];
          if (inferred && inferred.resource === field.optionsFrom) {
            return inferred;
          }
          return { resource: field.optionsFrom, value: "id", label: "name" };
        }
        return field.optionsFrom;
      }
      return FK_RELATION_MAP[field.name] || null;
    },

    needsRemoteOptions(field) {
      if (field.type !== "select") return false;
      const relation = this.getRelationConfig(field);
      if (!relation) return false;
      if (!field.options || field.options.length === 0) return true;
      // Opsi statis hanya placeholder kosong (mis. "Semua TKI") — tetap muat dari API
      const hasRealOption = field.options.some((o) => {
        const v = o.value;
        return v != null && String(v).trim() !== "";
      });
      return !hasRealOption;
    },

    // Relasi besar: cari via API (tidak load semua baris)
    usesRemoteSearch(field) {
      return this.needsRemoteOptions(field) && field.remoteSearch !== false;
    },

    /** Select bertingkat: butuh nilai field induk (mis. kode_agen) sebelum muat opsi */
    needsParentForOptions(field, formData) {
      const config = this.getRelationConfig(field);
      if (!config?.filterFromField || !formData) return false;
      const parentVal = formData[config.filterFromField];
      return parentVal == null || String(parentVal).trim() === "";
    },

    appendRelationFilterParams(params, field, config, formData) {
      if (!config?.filterFromField || !formData) return;
      const parentVal = formData[config.filterFromField];
      if (parentVal == null || String(parentVal).trim() === "") return;
      const filterKey = config.filterParam || config.filterFromField;
      params.set(filterKey, String(parentVal).trim());
    },

    formatTemplate(row, template) {
      if (!row || !template) return "";
      return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const v = row[key];
        return v != null ? String(v) : "";
      });
    },

    formatOptionValue(row, config) {
      if (!row) return "";
      if (config.valueFormat) {
        return this.formatTemplate(row, config.valueFormat);
      }
      const valueKey = config.value || "id";
      return row[valueKey] != null ? String(row[valueKey]) : "";
    },

    formatOptionLabel(row, config) {
      if (!row) return "";
      if (config.labelFormat) {
        const text = this.formatTemplate(row, config.labelFormat).trim();
        if (config.codeField && row[config.codeField]) {
          return `${text} (${row[config.codeField]})`.trim();
        }
        return (
          text ||
          this.formatOptionValue(row, config) ||
          String(row[config.value || "id"] ?? "")
        );
      }
      if (Array.isArray(config.label)) {
        return config.label
          .map((k) => row[k])
          .filter((v) => v != null && v !== "")
          .join(" ")
          .trim();
      }
      const main = row[config.label || "name"] ?? row.id;
      if (config.codeField && row[config.codeField]) {
        return `${main} (${row[config.codeField]})`;
      }
      return String(main ?? "");
    },

    /** Muat label opsi terpilih (mis. id_biodata FF-0001) via API personal */
    async resolveRemoteSelectValue(
      field,
      apiClient,
      currentValue,
      formData = null,
    ) {
      const config = this.getRelationConfig(field);
      if (
        !config ||
        !apiClient ||
        currentValue == null ||
        currentValue === ""
      ) {
        return null;
      }
      if (this.needsParentForOptions(field, formData)) return null;
      const valueKey = config.value || "id";
      const val = String(currentValue);

      if (valueKey === "id" && /^\d+$/.test(val) && !config.valueFormat) {
        return this.loadSelectOptionById(field, apiClient, currentValue);
      }

      if (config.valueFormat) {
        try {
          const bulkField = { ...field, remoteSearch: false, options: [] };
          const options = await this.loadSelectOptions(
            bulkField,
            apiClient,
            null,
            formData,
          );
          const found = options.find((o) => String(o.value) === val);
          if (found) return found;
        } catch (e) {
          /* lanjut fallback */
        }
      }

      try {
        const params = new URLSearchParams();
        params.set("search", val);
        params.set("perPage", "30");
        params.set("page", "1");
        this.appendRelationFilterParams(params, field, config, formData);
        const response = await apiClient.read(
          `${config.resource}?${params.toString()}`,
        );
        const rows =
          response.data && Array.isArray(response.data) ? response.data : [];
        const row = rows.find((r) => {
          if (config.valueFormat)
            return this.formatOptionValue(r, config) === val;
          return String(r[valueKey]) === val;
        });
        if (row) {
          return {
            value: val,
            label: this.formatOptionLabel(row, config) || val,
          };
        }
      } catch (e) {
        /* fallback label = value */
      }
      return { value: val, label: val };
    },

    // Satu opsi terpilih (mode edit)
    async loadSelectOptionById(field, apiClient, id) {
      const config = this.getRelationConfig(field);
      if (!config || !apiClient || id == null || id === "") return null;

      const resource = config.resource;
      const valueKey = config.value || "id";

      try {
        const one = await apiClient.read(`${resource}/${id}`);
        const row = one.data || one;
        if (!row) return null;
        const optValue = config.valueFormat
          ? this.formatOptionValue(row, config)
          : row[valueKey] != null
            ? String(row[valueKey])
            : "";
        if (!optValue) return null;
        return {
          value: optValue,
          label: this.formatOptionLabel(row, config) || `#${id}`,
        };
      } catch (e) {
        return { value: String(id), label: `#${id}` };
      }
    },

    // Cari opsi di server (pagination + search) — untuk data besar
    async searchSelectOptions(field, apiClient, search = "", formData = null) {
      const config = this.getRelationConfig(field);
      if (!config || !apiClient) return { options: [], total: 0 };
      if (this.needsParentForOptions(field, formData)) {
        return { options: [], total: 0 };
      }

      const resource = config.resource;
      const valueKey = config.value || "id";
      const perPage = config.optionsPerPage || field.optionsPerPage || 30;
      const minLen = field.minSearchLength ?? config.minSearchLength ?? 0;
      const q = String(search || "").trim();

      if (q.length > 0 && q.length < minLen) {
        return { options: [], total: 0, needsMoreChars: true, minLen };
      }

      try {
        const params = new URLSearchParams();
        params.set("perPage", String(perPage));
        params.set("page", "1");
        if (q) params.set("search", q);
        this.appendRelationFilterParams(params, field, config, formData);

        const response = await apiClient.read(
          `${resource}?${params.toString()}`,
        );
        let rows = [];
        if (response.data && Array.isArray(response.data)) rows = response.data;
        else if (Array.isArray(response)) rows = response;

        const options = rows
          .map((row) => ({
            value: this.formatOptionValue(row, config),
            label: this.formatOptionLabel(row, config),
          }))
          .filter((opt) => opt.label && opt.value !== "");

        const total = response.pagination?.total ?? options.length;
        return {
          options,
          total,
          hasMore: total > options.length,
          perPage,
        };
      } catch (error) {
        console.error(`Gagal search optionsFrom ${resource}:`, error);
        return { options: [], total: 0 };
      }
    },

    // Muat opsi select dari API (bulk — hanya jika remoteSearch dimatikan)
    async loadSelectOptions(
      field,
      apiClient,
      currentValue = null,
      formData = null,
    ) {
      if (this.needsParentForOptions(field, formData)) {
        return field.prependEmptyOption ? [field.prependEmptyOption] : [];
      }

      if (this.usesRemoteSearch(field)) {
        if (currentValue != null && currentValue !== "") {
          const selectedValues = this.normalizeSelectValues(
            field,
            currentValue,
          );
          const resolved = [];
          for (const selectedValue of selectedValues) {
            const one = await this.resolveRemoteSelectValue(
              field,
              apiClient,
              selectedValue,
              formData,
            );
            if (one) resolved.push(one);
          }
          return resolved;
        }
        return [];
      }

      const config = this.getRelationConfig(field);
      if (!config || !apiClient) return field.options || [];

      const resource = config.resource;
      const valueKey = config.value || "id";
      const perPage = config.perPage || field.optionsPerPage || 500;
      const sort = config.sort || field.sort || "";
      const order = config.order || field.order || "asc";

      try {
        const params = new URLSearchParams();
        params.set("perPage", String(perPage));
        params.set("page", "1");
        if (sort) params.set("sort", sort);
        if (order) params.set("order", order);
        this.appendRelationFilterParams(params, field, config, formData);

        const response = await apiClient.read(
          `${resource}?${params.toString()}`,
        );
        let rows = [];
        if (response.data && Array.isArray(response.data)) rows = response.data;
        else if (Array.isArray(response)) rows = response;

        const options = rows
          .map((row) => ({
            value: this.formatOptionValue(row, config),
            label: this.formatOptionLabel(row, config),
          }))
          .filter((opt) => opt.label && opt.value !== "");

        if (currentValue != null && currentValue !== "") {
          const selectedValues = this.normalizeSelectValues(
            field,
            currentValue,
            options,
          );
          for (const selectedValue of selectedValues) {
            if (
              !options.some((o) => String(o.value) === String(selectedValue))
            ) {
              const one = await this.resolveRemoteSelectValue(
                field,
                apiClient,
                selectedValue,
                formData,
              );
              if (one) options.unshift(one);
            }
          }
        }

        if (field.prependEmptyOption) {
          const emptyOpt = field.prependEmptyOption;
          if (
            !options.some((o) => String(o.value) === String(emptyOpt.value))
          ) {
            options.unshift(emptyOpt);
          }
        }

        return options;
      } catch (error) {
        console.error(`Gagal memuat optionsFrom ${resource}:`, error);
        return [];
      }
    },

    // Siapkan schema form: isi field.options dari tabel terkait
    async prepareFormSchema(formSchema, apiClient, initialData = {}) {
      if (!formSchema || !formSchema.fields || !apiClient) {
        return formSchema;
      }

      const fields = await Promise.all(
        formSchema.fields.map(async (field) => {
          if (!this.needsRemoteOptions(field)) return field;
          const currentValue = initialData[field.name];
          const options = await this.loadSelectOptions(
            field,
            apiClient,
            currentValue,
            initialData,
          );
          return { ...field, options };
        }),
      );

      return { ...formSchema, fields };
    },

    wireDependentSelects(fields, fieldElements, formData, apiClient, readOnly) {
      if (!fields || !fieldElements || !apiClient) return;

      const reloadChildrenOf = async (parentName) => {
        for (const childField of fields) {
          const cfg = this.getRelationConfig(childField);
          if (cfg?.filterFromField !== parentName) continue;

          formData[childField.name] = "";
          const childEl = this.getSelectControl(fieldElements[childField.name]);
          const waitLabel =
            childField.waitParentLabel ||
            childField.placeholder ||
            "Pilih agen terlebih dahulu";

          if (this.needsParentForOptions(childField, formData)) {
            const emptyOpts = [{ value: "", label: waitLabel }];
            if (childEl?._crudSelectApi) {
              childEl._crudSelectApi.setOptions(emptyOpts, "");
            } else if (childEl) {
              this.fillSelectOptions(
                childEl,
                childField,
                emptyOpts,
                "",
                formData,
              );
            }
            continue;
          }

          try {
            const opts = await this.loadSelectOptions(
              childField,
              apiClient,
              null,
              formData,
            );
            if (childEl?._crudSelectApi) {
              childEl._crudSelectApi.setOptions(opts, "");
            } else if (childEl) {
              this.fillSelectOptions(childEl, childField, opts, "", formData);
            }
          } catch (e) {
            console.error("Gagal memuat opsi dependen:", childField.name, e);
          }
        }
      };

      const parentNames = new Set();
      fields.forEach((f) => {
        const cfg = this.getRelationConfig(f);
        if (cfg?.filterFromField) parentNames.add(cfg.filterFromField);
      });

      parentNames.forEach((parentName) => {
        const parentEl = fieldElements[parentName];
        if (!parentEl) return;

        const onParentChange = () => {
          reloadChildrenOf(parentName);
        };

        parentEl._crudOnChange = onParentChange;

        const selectEl =
          parentEl.el?.tagName === "SELECT"
            ? parentEl.el
            : parentEl.tagName === "SELECT"
              ? parentEl
              : null;
        if (selectEl) {
          selectEl.addEventListener("change", onParentChange);
        }
      });
    },

    isMultiSelect(field) {
      return field?.type === "select" && field.multiple === true;
    },

    getMultiSelectDelimiter(field) {
      return field?.multipleDelimiter || ", ";
    },

    normalizeSelectValues(field, value, options = []) {
      if (!this.isMultiSelect(field)) {
        return value == null || value === "" ? [] : [String(value)];
      }
      if (Array.isArray(value))
        return value.map((v) => String(v).trim()).filter(Boolean);
      const raw = String(value || "").trim();
      if (!raw) return [];
      if ((options || []).some((o) => String(o.value) === raw)) return [raw];
      const delimiter = this.getMultiSelectDelimiter(field).trim();
      const parts = delimiter ? raw.split(delimiter) : raw.split(",");
      return parts
        .flatMap((part) => String(part).split(","))
        .map((part) => part.trim())
        .filter(Boolean);
    },

    formatMultiSelectValue(field, values) {
      return (values || [])
        .map((v) => String(v).trim())
        .filter(Boolean)
        .join(this.getMultiSelectDelimiter(field));
    },

    useSearchableSelect(field) {
      return field.type === "select" && field.searchable !== false;
    },

    // Perbarui isi <select> setelah opsi dimuat (untuk pola async)
    fillSelectOptions(selectWrapper, field, options, selectedValue, formData) {
      if (selectWrapper && selectWrapper._crudSelectApi) {
        selectWrapper._crudSelectApi.setOptions(options, selectedValue);
        if (formData && selectedValue != null && selectedValue !== "") {
          const values = this.normalizeSelectValues(
            field,
            selectedValue,
            options,
          );
          formData[field.name] = this.isMultiSelect(field)
            ? this.formatMultiSelectValue(field, values)
            : String(selectedValue);
        }
        return;
      }

      const selectEl = selectWrapper.el || selectWrapper;
      if (!selectEl || selectEl.tagName !== "SELECT") return;

      selectEl.innerHTML = "";
      const selectedValues = this.normalizeSelectValues(
        field,
        selectedValue,
        options,
      );

      if (field.placeholder && !this.isMultiSelect(field)) {
        const ph = document.createElement("option");
        ph.value = "";
        ph.textContent = field.placeholder;
        selectEl.appendChild(ph);
      }

      options.forEach((opt) => {
        const option = document.createElement("option");
        option.value = String(opt.value);
        option.textContent = opt.label;
        if (selectedValues.includes(String(opt.value))) {
          option.selected = true;
        }
        selectEl.appendChild(option);
      });

      if (selectedValue != null && selectedValue !== "") {
        if (this.isMultiSelect(field)) {
          if (formData)
            formData[field.name] = this.formatMultiSelectValue(
              field,
              selectedValues,
            );
        } else {
          selectEl.value = String(selectedValue);
          if (formData) formData[field.name] = selectEl.value;
        }
      }
    },

    // Build form from JSON schema
    build(schema, options = {}) {
      const {
        onSubmit = () => {},
        onCancel = () => {},
        onFieldChange = null,
        initialData = {},
        readOnly = false,
        apiClient = null,
      } = options;

      const fieldChangeHandler =
        typeof onFieldChange === "function" ? onFieldChange : null;
      this._buildOnFieldChange = fieldChangeHandler;

      const formData = { ...initialData };
      const fieldElements = {};
      const errorElements = {};
      let isSubmitting = false;

      // Create form container
      const formContainer = el("form")
        .attr("id", "crud-form") // Add ID for modal footer to trigger submit
        .class("crud-date-picker-form-root")
        .css({
          display: "flex",
          flexDirection: schema.layout === "horizontal" ? "row" : "column",
          gap: schema.layout === "grid" ? "0" : "1rem",
          flexWrap: schema.layout === "grid" ? "wrap" : "nowrap",
        });

      // Create fields container with grid support
      ensureFormLayoutStyles();
      const columns = schema.columns || 1;
      const fieldsContainer = el("div")
        .class("crud-form-fields-grid")
        .css({
          display: "grid",
          gridTemplateColumns: columns > 1 ? `repeat(${columns}, 1fr)` : "1fr",
          gap: schema.gap || "1rem",
          width: "100%",
        });

      if (schema.intro) {
        const introEl = el("div")
          .class("crud-form-intro")
          .text(String(schema.intro));
        formContainer.child(introEl);
      }

      schema.fields.forEach((field) => {
        const fieldWrapper = this.createField(
          field,
          formData,
          fieldElements,
          errorElements,
          readOnly,
          apiClient,
        );

        // Support field colspan (span multiple columns)
        if (field.colspan) {
          fieldWrapper.css({ gridColumn: `span ${field.colspan}` });
        }

        fieldsContainer.child(fieldWrapper);
      });

      formContainer.child(fieldsContainer);

      if (schema.linkedUpload) {
        this.mountLinkedUploadSection(
          schema,
          formData,
          fieldsContainer,
          readOnly,
          apiClient,
        );
      }

      if (apiClient && !readOnly) {
        this.wireDependentSelects(
          schema.fields,
          fieldElements,
          formData,
          apiClient,
          readOnly,
        );
      }

      // Create buttons (hide if using modal footer)
      let submitButton = null;
      if (!readOnly && !schema.hideButtons) {
        const buttonsContainer = el("div").css({
          display: "flex",
          justifyContent: "flex-end",
          gap: "0.75rem",
          marginTop: "1.5rem",
          paddingTop: "1rem",
          borderTop: "1px solid #e5e7eb",
        });

        // Cancel button
        if (schema.cancelText !== false) {
          const cancelButton = el("button")
            .type("button")
            .text(schema.cancelText || "Cancel")
            .css({
              padding: "0.65rem 1.25rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              backgroundColor: "#fff",
              color: "#374151",
              cursor: "pointer",
              fontSize: "0.95rem",
              fontWeight: "500",
            })
            .click((e) => {
              e.preventDefault();
              onCancel();
            });
          buttonsContainer.child(cancelButton);
        }

        // Submit button
        submitButton = el("button")
          .type("submit")
          .text(schema.submitText || "Submit")
          .css({
            padding: "0.65rem 1.25rem",
            borderRadius: "0.5rem",
            border: "none",
            backgroundColor: "#2563eb",
            color: "#fff",
            cursor: "pointer",
            fontSize: "0.95rem",
            fontWeight: "500",
            opacity: "1",
            transition: "opacity 0.2s",
          });

        buttonsContainer.child(submitButton);
        formContainer.child(buttonsContainer);
      }

      // Form submit handler
      formContainer.el.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (isSubmitting) return;

        // Validate
        const errors = this.validate(schema.fields, formData);
        if (Object.keys(errors).length > 0) {
          this.showErrors(errors, errorElements);
          return;
        }

        // Clear errors
        this.clearErrors(errorElements);

        // Submit
        isSubmitting = true;
        if (submitButton)
          submitButton.text("Loading...").css({ opacity: "0.6" });

        try {
          if (schema.linkedUpload?.syncFileField && apiClient) {
            await this.syncLinkedUploadFile(schema, formData, apiClient);
          }
          await onSubmit(formData);
        } catch (error) {
          console.error("Form submit error:", error);
        } finally {
          isSubmitting = false;
          if (submitButton)
            submitButton
              .text(schema.submitText || "Submit")
              .css({ opacity: "1" });
        }
      });

      // Return form API
      return {
        el: formContainer,
        get: () => formContainer.get(),
        getData: () => ({ ...formData }),
        setData: (data) => {
          Object.assign(formData, data);
          this.updateFieldValues(schema.fields, formData, fieldElements);
        },
        reset: () => {
          Object.keys(formData).forEach((key) => delete formData[key]);
          Object.assign(formData, initialData);
          this.updateFieldValues(schema.fields, formData, fieldElements);
          this.clearErrors(errorElements);
        },
        validate: () => {
          const errors = this.validate(schema.fields, formData);
          this.showErrors(errors, errorElements);
          return errors;
        },
        setLoading: (loading) => {
          isSubmitting = loading;
          if (submitButton) {
            submitButton
              .text(loading ? "Loading..." : schema.submitText || "Submit")
              .css({ opacity: loading ? "0.6" : "1" });
          }
        },
      };
    },

    getFieldHelpText(field) {
      if (!field) return "";
      const raw =
        field.helpText ??
        field.textinfo ??
        field.textInfo ??
        field.hint ??
        field.description ??
        field.help ??
        "";
      return typeof raw === "string" ? raw.trim() : "";
    },

    getFieldTextinfo(field) {
      if (!field) return "";
      const raw = field.textinfo ?? field.textInfo ?? "";
      return typeof raw === "string" ? raw.trim() : "";
    },

    appendFieldTextinfo(wrapper, field) {
      const infoCopy = this.getFieldTextinfo(field);
      if (!infoCopy) return;
      wrapper.child(
        el("div")
          .class("crud-field-textinfo")
          .attr("data-field-textinfo", field.name || "")
          .text(infoCopy),
      );
    },

    resolveHelpLink(field) {
      if (!field) return null;
      const explicit = field.helpLink || field.helpMasterLink;
      if (explicit?.path) {
        return {
          path: String(explicit.path).trim(),
          label: explicit.label || "Buka master data",
          newTab: explicit.newTab !== false,
        };
      }
      if (field.helpMaster === true || field.helpMasterLink === true) {
        const cfg = field.optionsFrom;
        const resource = typeof cfg === "string" ? cfg : cfg?.resource;
        if (resource) {
          return {
            path: `/${String(resource).trim()}`,
            label: field.helpMasterLabel || `Kelola master ${resource}`,
            newTab: true,
          };
        }
      }
      return null;
    },

    appendFieldHelp(wrapper, field) {
      const helpCopy = this.getFieldHelpText(field);
      const helpLink = this.resolveHelpLink(field);
      if (!helpCopy && !helpLink) return;

      const helpEl = el("div")
        .class("crud-field-help")
        .attr("data-field-help", field.name || "")
        .css({
          fontSize: "0.75rem",
          color: "#64748b",
          lineHeight: 1.45,
          marginTop: "0.35rem",
        });

      if (helpCopy) {
        helpEl.child(el("span").text(helpCopy));
      }

      if (helpLink?.path) {
        if (helpCopy) {
          helpEl.child(el("span").text(" · "));
        }

        const link = el("a").attr("href", "#").text(helpLink.label).css({
          color: "#2563eb",
          fontWeight: "600",
          textDecoration: "none",
          cursor: "pointer",
        });
        link.on("mouseenter", function () {
          this.style.textDecoration = "underline";
        });
        link.on("mouseleave", function () {
          this.style.textDecoration = "none";
        });
        link.click((e) => {
          e.preventDefault();
          e.stopPropagation();
          const path = helpLink.path.startsWith("/")
            ? helpLink.path
            : `/${helpLink.path}`;
          if (helpLink.newTab !== false) {
            const base = `${window.location.pathname}${window.location.search}`;
            window.open(`${base}#${path}`, "_blank", "noopener,noreferrer");
            return;
          }
          if (
            typeof layout !== "undefined" &&
            typeof layout.navigate === "function"
          ) {
            layout.navigate(path);
          } else {
            window.location.hash = path;
          }
        });
        helpEl.child(link);
      }

      wrapper.child(helpEl);
    },

    async syncLinkedUploadFile(schema, formData, apiClient) {
      const lu = schema.linkedUpload;
      if (!lu?.syncFileField || !apiClient) return;
      const idField = lu.idBiodataField || "id_biodata";
      const idBio = String(formData[idField] || "").trim();
      if (!idBio) return;
      const uploadType = lu.uploadType || "upload_pk";
      try {
        const res = await apiClient.read(
          `${uploadType}?search=${encodeURIComponent(idBio)}&perPage=50`,
        );
        const rows = (res?.data || res?.rows || [])
          .filter(
            (r) =>
              String(r.id_biodata || "").trim() === idBio &&
              String(r.file || "").trim(),
          )
          .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
        if (rows[0]?.file) formData[lu.syncFileField] = rows[0].file;
      } catch {
        /* abaikan — simpan tanpa path file */
      }
    },

    mountLinkedUploadSection(
      schema,
      formData,
      fieldsContainer,
      readOnly,
      apiClient,
    ) {
      const lu = schema.linkedUpload;
      if (!lu || typeof DocumentUploadHub === "undefined") return null;

      const idField = lu.idBiodataField || "id_biodata";
      const uploadType = lu.uploadType || "upload_pk";
      const wrap = el("div").class("crud-linked-upload").css({
        display: "flex",
        flexDirection: "column",
        gap: "0.65rem",
        paddingTop: "0.35rem",
        borderTop: "1px solid #e2e8f0",
        marginTop: "0.15rem",
      });

      wrap.child(
        el("div")
          .text(lu.label || "Upload dokumen")
          .css({
            fontSize: "0.875rem",
            fontWeight: "600",
            color: "#374151",
            lineHeight: 1.35,
          }),
      );

      const infoText = lu.textinfo || lu.textInfo || "";
      if (infoText) {
        wrap.child(el("div").class("crud-field-textinfo").text(infoText));
      }

      const hubMount = el("div").class("crud-linked-upload-hub");
      wrap.child(hubMount);

      const renderHub = async () => {
        hubMount.empty();
        const idBio = String(formData[idField] || "").trim();
        if (!idBio) {
          hubMount.child(
            el("p")
              .text(
                lu.emptyText ||
                  "Isi ID biodata TKI terlebih dahulu untuk unggah dokumen.",
              )
              .css({
                margin: 0,
                fontSize: "0.8125rem",
                color: "#64748b",
                lineHeight: 1.5,
              }),
          );
          return;
        }
        if (lu.syncFileField && apiClient) {
          await this.syncLinkedUploadFile(schema, formData, apiClient);
        }
        hubMount.child(
          DocumentUploadHub.buildUploadHub({
            idBiodata: idBio,
            filterTypes: [uploadType],
            compact: true,
            readOnly,
            onRefresh: async () => {
              if (lu.syncFileField && apiClient) {
                await this.syncLinkedUploadFile(schema, formData, apiClient);
              }
            },
          }),
        );
      };

      renderHub();

      const prevHandler = this._buildOnFieldChange;
      this._buildOnFieldChange = (name, value) => {
        if (name === idField) renderHub();
        if (typeof prevHandler === "function") prevHandler(name, value);
      };

      fieldsContainer.child(wrap);
      return wrap;
    },

    // Judul blok form — bukan input (tidak disimpan ke DB)
    createSectionField(field) {
      const variant = field.variant || "default";
      const wrapper = el("div")
        .class("crud-form-section")
        .css({
          display: "flex",
          flexDirection: "column",
          gap: "0.35rem",
          minWidth: 0,
          width: "100%",
          padding: variant === "compact" ? "0.15rem 0" : "0.5rem 0",
          marginTop: variant === "default" ? "0.5rem" : 0,
          borderTop: variant === "default" ? "1px solid #e8ecf1" : undefined,
          paddingTop: variant === "default" ? "0.75rem" : undefined,
        });

      if (field.label) {
        wrapper.child(
          el("div")
            .text(field.label)
            .css({
              fontSize: variant === "compact" ? "0.8125rem" : "0.9rem",
              fontWeight: variant === "compact" ? "600" : "700",
              color: variant === "compact" ? "#475569" : "#1e293b",
              lineHeight: 1.45,
            }),
        );
      }
      if (field.helpText) {
        wrapper.child(
          el("p").text(field.helpText).css({
            margin: 0,
            fontSize: "0.78rem",
            color: "#64748b",
            lineHeight: 1.45,
          }),
        );
      }
      if (variant === "columns" && Array.isArray(field.columns)) {
        const row = el("div").css({
          display: "grid",
          gridTemplateColumns: `repeat(${field.columns.length}, 1fr)`,
          gap: "0.5rem",
          marginTop: "0.25rem",
        });
        field.columns.forEach((col) => {
          row.child(
            el("div").text(col).css({
              fontSize: "0.78rem",
              fontWeight: "600",
              color: "#92400e",
              textAlign: "center",
              padding: "0.4rem 0.35rem",
              background: "#fff7ed",
              borderRadius: "0.35rem",
              border: "1px solid #fed7aa",
            }),
          );
        });
        wrapper.child(row);
      }
      return wrapper;
    },

    // Create single field
    createField(
      field,
      formData,
      fieldElements,
      errorElements,
      readOnly,
      apiClient,
    ) {
      if (field.type === "section") {
        return this.createSectionField(field);
      }

      const wrapper = el("div").class("crud-form-field").css({
        display: "flex",
        flexDirection: "column",
        gap: "0.35rem",
        minWidth: 0,
        width: "100%",
        alignSelf: "start",
      });

      // Label
      if (field.label !== false) {
        const label = el("label")
          .css({
            fontSize: "0.875rem",
            fontWeight: "500",
            color: "#374151",
            lineHeight: 1.35,
          })
          .text(field.label || field.name);

        if (field.required) {
          label.child(el("span").text(" *").css({ color: "#dc2626" }));
        }

        wrapper.child(label);
      }

      // Input element
      let input;
      const value = formData[field.name] || "";

      // Check per-field readonly/disabled (override global readOnly)
      const fieldReadOnly =
        field.readonly === true || field.disabled === true || readOnly;

      switch (field.type) {
        case "textarea":
          input = this.createTextarea(field, value, fieldReadOnly, formData);
          break;
        case "select":
          input = this.createSelect(
            field,
            value,
            fieldReadOnly,
            formData,
            apiClient,
          );
          break;
        case "range":
          input = this.createRange(field, value, fieldReadOnly, formData);
          break;
        case "checkbox":
          input = this.createCheckbox(field, value, fieldReadOnly, formData);
          break;
        case "radio":
          input = this.createRadio(field, value, fieldReadOnly, formData);
          break;
        case "masa_kerja_duration":
          input = this.createMasaKerjaDuration(
            field,
            value,
            fieldReadOnly,
            formData,
          );
          break;
        case "waktu_kerja":
          input = this.createWaktuKerja(field, value, fieldReadOnly, formData);
          break;
        case "pptk_isi":
          input = this.createPptkIsi(field, value, fieldReadOnly, formData);
          break;
        case "date":
          input = this.createDatePicker(field, value, fieldReadOnly, formData);
          break;
        case "image":
        case "file":
          input = this.createFileUpload(field, value, fieldReadOnly, formData);
          break;
        default:
          input = this.createInput(field, value, fieldReadOnly, formData);
      }

      if (input?.el?.classList?.contains("crud-rich-editor")) {
        wrapper.class("crud-field-rich-text");
      }

      if (field.type === "select" && apiClient && !fieldReadOnly) {
        const qiCfg = this.resolveQuickInsertConfig(field);
        if (qiCfg) {
          const qiWrap = el("div").css({
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
            width: "100%",
          });
          qiWrap.child(input);
          qiWrap._selectControl = input;
          this.mountSelectQuickInsert(
            qiWrap,
            field,
            formData,
            apiClient,
            qiCfg,
            input,
          );
          input = qiWrap;
        }
      }

      fieldElements[field.name] = input;
      wrapper.child(input);

      this.appendFieldTextinfo(wrapper, field);

      const helpCopy = this.getFieldHelpText(field);
      const textinfoCopy = this.getFieldTextinfo(field);
      if (helpCopy && helpCopy !== textinfoCopy) {
        this.appendFieldHelp(wrapper, field);
      }

      // Error message
      const errorEl = el("div").css({
        fontSize: "0.75rem",
        color: "#dc2626",
        minHeight: "1rem",
        display: "none",
      });
      errorElements[field.name] = errorEl;
      wrapper.child(errorEl);

      return wrapper;
    },

    // Input dengan pola mask (config field.mask — lihat core/input-mask.js)
    createMaskedInput(field, value, readOnly, formData) {
      const maskCfg =
        typeof InputMask !== "undefined"
          ? InputMask.normalizeConfig(field.mask)
          : null;
      const placeholder =
        field.placeholder || (maskCfg && maskCfg.pattern) || "";

      const input = el("input")
        .attr("type", "text")
        .attr("name", field.name)
        .attr("placeholder", placeholder)
        .attr("autocomplete", "off")
        .value(value || "");
      if (field.required) input.attr("required", true);
      if (readOnly) input.attr("readonly", true).attr("disabled", true);
      input
        .css({
          padding: "0.65rem 0.75rem",
          borderRadius: "0.5rem",
          border: "1px solid #d1d5db",
          fontSize: "0.95rem",
          outline: "none",
          transition: "border-color 0.2s",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          letterSpacing: "0.02em",
        })
        .on("focus", function () {
          this.style.borderColor = "#2563eb";
        })
        .on("blur", function () {
          this.style.borderColor = "#d1d5db";
        });

      let maskApi = null;
      if (maskCfg && typeof InputMask !== "undefined" && !readOnly) {
        maskApi = InputMask.attach(input.el, maskCfg, (formatted) => {
          formData[field.name] = formatted;
        });
        if (value) maskApi.setValue(value);
        else formData[field.name] = maskApi.getValue();
      } else {
        input.on("input", function () {
          formData[field.name] = this.value;
        });
        if (value != null && value !== "") formData[field.name] = String(value);
      }

      input._inputMaskApi = maskApi;
      return input;
    },

    createRange(field, value, readOnly, formData) {
      const min = Number(field.min ?? 0);
      const max = Number(field.max ?? 100);
      const step = Number(field.step ?? 1);
      const initial = value != null && value !== "" ? String(value) : "";
      const sliderValue = initial || String(field.default ?? min);

      const wrap = el("div").css({
        display: "flex",
        flexDirection: "column",
        gap: "0.45rem",
      });
      const top = el("div").css({
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "0.75rem",
      });
      const valueBadge = el("span")
        .text(initial || "Belum dipilih")
        .css({
          padding: "0.25rem 0.55rem",
          borderRadius: "999px",
          background: initial ? "#dbeafe" : "#f1f5f9",
          color: initial ? "#1d4ed8" : "#64748b",
          fontSize: "0.78rem",
          fontWeight: "700",
        });
      const clearBtn = el("button")
        .attr("type", "button")
        .text("Kosongkan")
        .css({
          border: "none",
          background: "transparent",
          color: "#64748b",
          fontSize: "0.75rem",
          fontWeight: "600",
          cursor: readOnly ? "not-allowed" : "pointer",
          padding: 0,
        });
      top.child([valueBadge, clearBtn]);

      const input = el("input")
        .attr("type", "range")
        .attr("name", field.name)
        .attr("min", min)
        .attr("max", max)
        .attr("step", step)
        .value(sliderValue)
        .css({
          width: "100%",
          accentColor: "#2563eb",
          cursor: readOnly ? "not-allowed" : "pointer",
        });
      if (readOnly) input.attr("disabled", true);

      const labels = el("div").css({
        display: "flex",
        justifyContent: "space-between",
        color: "#64748b",
        fontSize: "0.75rem",
        fontWeight: "600",
      });
      labels.child([
        el("span").text(field.minLabel || String(min)),
        el("span").text(field.maxLabel || String(max)),
      ]);

      const applyValue = (next) => {
        const val = next == null || next === "" ? "" : String(next);
        formData[field.name] = val;
        valueBadge.text(val || "Belum dipilih").css({
          background: val ? "#dbeafe" : "#f1f5f9",
          color: val ? "#1d4ed8" : "#64748b",
        });
      };

      if (initial) applyValue(initial);
      input.on("input", function () {
        applyValue(this.value);
      });
      clearBtn.click((e) => {
        e.preventDefault();
        if (readOnly) return;
        input.el.value = String(field.default ?? min);
        applyValue("");
      });

      wrap._rangeInputApi = {
        setValue: (next) => {
          input.el.value = next || String(field.default ?? min);
          applyValue(next || "");
        },
      };
      wrap.child([top, input, labels]);
      return wrap;
    },

    // Create input element
    createInput(field, value, readOnly, formData) {
      if (field.mask && typeof InputMask !== "undefined") {
        return this.createMaskedInput(field, value, readOnly, formData);
      }

      const input = el("input")
        .attr("type", field.type || "text")
        .attr("name", field.name)
        .attr("placeholder", field.placeholder || "")
        .attr("tabindex", "-1")
        .value(value);
      if (field.required) input.attr("required", true);
      if (readOnly) input.attr("readonly", true).attr("disabled", true);
      input
        .css({
          padding: "0.65rem 0.75rem",
          borderRadius: "0.5rem",
          border: "1px solid #d1d5db",
          fontSize: "0.95rem",
          outline: "none",
          transition: "border-color 0.2s",
        })
        .on("focus", function () {
          this.style.borderColor = "#2563eb";
        })
        .on("blur", function () {
          this.style.borderColor = "#d1d5db";
        })
        .on("input", function (e) {
          formData[field.name] =
            field.type === "number"
              ? this.value === ""
                ? ""
                : Number(this.value)
              : this.value;
        })
        .on("focus", function handler() {
          this.removeAttribute("tabindex");
          this.removeEventListener("focus", handler);
        });
      return input;
    },

    // Create file/image upload element
    createFileUpload(field, value, readOnly, formData) {
      const wrapper = el("div").css({
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem"
      });

      const isImage = field.type === "image";
      const acceptAttr = isImage ? "image/*" : (field.accept || "*");

      // File input
      const fileInput = el("input")
        .attr("type", "file")
        .attr("name", field.name + "_file")
        .attr("accept", acceptAttr)
        .attr("tabindex", "-1")
        .css({
          padding: "0.5rem",
          borderRadius: "0.5rem",
          border: "2px dashed #d1d5db",
          fontSize: "0.9rem",
          cursor: readOnly ? "not-allowed" : "pointer",
          backgroundColor: "#f9fafb"
        });

      if (readOnly) {
        fileInput.attr("disabled", true);
      }

      // Current file preview
      const previewContainer = el("div").css({
        marginTop: "0.5rem",
        padding: "0.75rem",
        backgroundColor: "#f3f4f6",
        borderRadius: "0.5rem",
        display: "none"
      });

      if (value) {
        formData[field.name] = value;
        if (isImage) {
          const img = el("img")
            .attr("src", value)
            .attr("alt", field.label)
            .css({
              maxWidth: "100%",
              maxHeight: "200px",
              borderRadius: "0.375rem",
              objectFit: "contain"
            });
          previewContainer.child(img);
        } else {
          const fileName = value.split("/").pop() || value;
          const fileLink = el("a")
            .attr("href", value)
            .attr("target", "_blank")
            .css({
              color: "#2563eb",
              textDecoration: "underline"
            })
            .text(fileName);
          previewContainer.child(fileLink);
        }
        previewContainer.css("display", "block");
      }

      // Upload status
      const statusText = el("div")
        .css({
          fontSize: "0.85rem",
          color: "#6b7280",
          display: "none"
        });

      // Handle file selection
      fileInput.on("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file size (max 5MB default)
        const maxSize = field.maxSize || 5 * 1024 * 1024;
        if (file.size > maxSize) {
          statusText
            .css({ color: "#dc2626", display: "block" })
            .text(`Ukuran file terlalu besar. Maksimal ${Math.round(maxSize / 1024 / 1024)}MB`);
          return;
        }

        statusText
          .css({ color: "#2563eb", display: "block" })
          .text("Mengupload...");

        try {
          const uploadFormData = new FormData();
          uploadFormData.append("file", file);
          uploadFormData.append("field", field.name);

          const response = await fetch("/api/upload", {
            method: "POST",
            body: uploadFormData
          });

          if (!response.ok) {
            throw new Error("Upload gagal");
          }

          const result = await response.json();
          formData[field.name] = result.path || result.url;
          
          statusText
            .css({ color: "#059669", display: "block" })
            .text("✓ Upload berhasil");

          // Update preview
          previewContainer.empty();
          if (isImage) {
            const img = el("img")
              .attr("src", result.path || result.url)
              .attr("alt", field.label)
              .css({
                maxWidth: "100%",
                maxHeight: "200px",
                borderRadius: "0.375rem",
                objectFit: "contain"
              });
            previewContainer.child(img);
          } else {
            const fileName = file.name;
            const fileLink = el("a")
              .attr("href", result.path || result.url)
              .attr("target", "_blank")
              .css({
                color: "#2563eb",
                textDecoration: "underline"
              })
              .text(fileName);
            previewContainer.child(fileLink);
          }
          previewContainer.css("display", "block");

        } catch (error) {
          console.error("Upload error:", error);
          statusText
            .css({ color: "#dc2626", display: "block" })
            .text("✗ Upload gagal: " + error.message);
        }
      });

      wrapper.child(fileInput);
      wrapper.child(statusText);
      wrapper.child(previewContainer);

      return wrapper;
    },

    // Create custom date picker
    createDatePicker(field, value, readOnly, formData) {
      ensureFormLayoutStyles();
      const wrapper = el("div").class("crud-date-picker");

      const input = el("input")
        .class("crud-date-picker-input")
        .attr("type", "text")
        .attr("name", field.name)
        .attr("placeholder", field.placeholder || "DD/MM/YYYY")
        .attr("tabindex", "-1")
        .attr("readonly", true);

      const applyValue = (isoValue) => {
        const normalized = isoValue || "";
        input.value(formatDateDisplay(normalized));
        formData[field.name] = normalized;
      };

      applyValue(value || "");

      if (field.required) input.attr("required", true);
      if (readOnly) input.attr("disabled", true);

      const iconBtn = el("button")
        .class("crud-date-picker-trigger")
        .attr("type", "button")
        .attr("tabindex", "-1")
        .child([
          el("i").class("fas fa-calendar-alt").css({ fontSize: "1rem" }),
        ]);
      if (readOnly) iconBtn.attr("disabled", true);

      let calendarPopup = null;
      let formRoot = null;
      let resizeHandler = null;
      let scrollHandler = null;
      let outsideClickHandler = null;

      const layoutPopup = () => {
        if (!calendarPopup) return;
        const gap = 6;
        const pad = 8;
        const popupEl = calendarPopup.el;
        const popupHeight = popupEl.offsetHeight || 360;
        const popupWidth = popupEl.offsetWidth || 312;
        const inputRect = input.el.getBoundingClientRect();

        const spaceBelow = window.innerHeight - inputRect.bottom - pad;
        const spaceAbove = inputRect.top - pad;
        const showAbove =
          spaceBelow < popupHeight + gap && spaceAbove > spaceBelow;

        let top = showAbove
          ? inputRect.top - popupHeight - gap
          : inputRect.bottom + gap;

        let left = inputRect.left;
        if (left + popupWidth > window.innerWidth - pad) {
          left = Math.max(pad, window.innerWidth - popupWidth - pad);
        }
        if (left < pad) left = pad;
        if (top < pad) top = pad;
        if (top + popupHeight > window.innerHeight - pad) {
          top = Math.max(pad, window.innerHeight - popupHeight - pad);
        }

        popupEl.style.position = "fixed";
        popupEl.style.top = `${top}px`;
        popupEl.style.left = `${left}px`;
        popupEl.style.width = "19.5rem";
        popupEl.style.minWidth = "19.5rem";
        popupEl.style.maxWidth = "19.5rem";
        popupEl.dataset.placement = showAbove ? "above" : "below";
      };

      const closePopup = () => {
        if (!calendarPopup) return;
        calendarPopup.remove();
        calendarPopup = null;
        wrapper.el.classList.remove("is-open");
        if (formRoot) {
          formRoot.classList.remove("is-date-picker-open");
          formRoot = null;
        }
        if (resizeHandler) {
          window.removeEventListener("resize", resizeHandler);
          resizeHandler = null;
        }
        if (scrollHandler) {
          window.removeEventListener("scroll", scrollHandler, true);
          scrollHandler = null;
        }
        if (outsideClickHandler) {
          document.removeEventListener("mousedown", outsideClickHandler);
          outsideClickHandler = null;
        }
      };

      const openCalendar = (e) => {
        if (e) e.stopPropagation();
        if (readOnly) return;

        if (calendarPopup) {
          closePopup();
          return;
        }

        formRoot = ensureDatePickerFormRoot(input.el);
        if (!formRoot) return;

        const currentValue =
          parseDateValue(formData[field.name]) ||
          parseDateValue(input.getValue ? input.getValue() : input.el.value);
        calendarPopup = this.createCalendarPopup(
          field,
          currentValue,
          (selectedDate) => {
            applyValue(selectedDate);
            closePopup();
          },
          () => {
            layoutPopup();
          },
        );

        wrapper.el.classList.add("is-open");
        if (formRoot) formRoot.classList.add("is-date-picker-open");
        document.body.appendChild(calendarPopup.get());
        calendarPopup.on("mousedown", (evt) => evt.stopPropagation());

        layoutPopup();
        requestAnimationFrame(() => layoutPopup());

        resizeHandler = () => layoutPopup();
        window.addEventListener("resize", resizeHandler);
        scrollHandler = () => layoutPopup();
        window.addEventListener("scroll", scrollHandler, true);

        outsideClickHandler = (evt) => {
          if (!calendarPopup) return;
          if (calendarPopup.el.contains(evt.target)) return;
          if (evt.target === input.el || iconBtn.el.contains(evt.target))
            return;
          closePopup();
        };
        document.addEventListener("mousedown", outsideClickHandler);
      };

      input.on("click", openCalendar);
      iconBtn.on("click", openCalendar);
      input.on("focus", function handler() {
        this.removeAttribute("tabindex");
        this.removeEventListener("focus", handler);
      });

      wrapper.child([input, iconBtn]).get();
      wrapper._datePickerApi = {
        setValue: (val) => applyValue(val || ""),
      };

      return wrapper;
    },

    createCalendarPopup(field, currentValue, onSelect, onReposition) {
      ensureFormLayoutStyles();
      const popup = el("div").class("crud-date-picker-popup");
      const monthNames = [
        "Januari",
        "Februari",
        "Maret",
        "April",
        "Mei",
        "Juni",
        "Juli",
        "Agustus",
        "September",
        "Oktober",
        "November",
        "Desember",
      ];
      const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
      const minDate = parseIsoDate(field.min);
      const maxDate = parseIsoDate(field.max);
      const todayIso = todayIsoLocal();

      let selectedValue = parseDateValue(currentValue);
      const seedDate = parseIsoDate(selectedValue) || new Date();
      let currentMonth = seedDate.getMonth();
      let currentYear = seedDate.getFullYear();

      const isDisabledDate = (dateStr) => {
        const date = parseIsoDate(dateStr);
        if (!date) return true;
        if (minDate && date < minDate) return true;
        if (maxDate && date > maxDate) return true;
        return false;
      };

      const notifyReposition = () => {
        if (typeof onReposition === "function") {
          requestAnimationFrame(() => onReposition());
        }
      };

      const render = () => {
        popup.empty();

        const header = el("div").class("crud-date-picker-header");
        const prevBtn = el("button")
          .class("crud-date-picker-nav")
          .attr("type", "button")
          .child([el("i").class("fas fa-chevron-left")]);
        const nextBtn = el("button")
          .class("crud-date-picker-nav")
          .attr("type", "button")
          .child([el("i").class("fas fa-chevron-right")]);
        const title = el("div").class("crud-date-picker-title");

        const monthSelect = el("select");
        monthNames.forEach((name, idx) => {
          monthSelect.child(el("option").attr("value", String(idx)).text(name));
        });
        monthSelect.on("change", function () {
          currentMonth = Number(this.value);
          render();
        });

        const yearSelect = el("select");
        const yearNow = new Date().getFullYear();
        const yearStart =
          field.minYear != null ? Number(field.minYear) : yearNow - 120;
        const yearEnd =
          field.maxYear != null ? Number(field.maxYear) : yearNow + 20;
        for (let year = yearStart; year <= yearEnd; year += 1) {
          yearSelect.child(
            el("option").attr("value", String(year)).text(String(year)),
          );
        }
        yearSelect.on("change", function () {
          currentYear = Number(this.value);
          render();
        });

        prevBtn.on("click", (evt) => {
          evt.stopPropagation();
          currentMonth -= 1;
          if (currentMonth < 0) {
            currentMonth = 11;
            currentYear -= 1;
          }
          render();
        });
        nextBtn.on("click", (evt) => {
          evt.stopPropagation();
          currentMonth += 1;
          if (currentMonth > 11) {
            currentMonth = 0;
            currentYear += 1;
          }
          render();
        });

        title.child([monthSelect, yearSelect]);
        header.child([prevBtn, title, nextBtn]);
        popup.child(header);

        const dayHeader = el("div").class("crud-date-picker-weekdays");
        dayNames.forEach((day) => {
          dayHeader.child(
            el("div").class("crud-date-picker-weekday").text(day),
          );
        });
        popup.child(dayHeader);

        const daysGrid = el("div").class("crud-date-picker-days");
        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(
          currentYear,
          currentMonth + 1,
          0,
        ).getDate();
        const daysInPrevMonth = new Date(
          currentYear,
          currentMonth,
          0,
        ).getDate();

        for (let i = firstDay - 1; i >= 0; i -= 1) {
          const day = daysInPrevMonth - i;
          const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
          const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
          appendDayCell(daysGrid, prevYear, prevMonth, day, true);
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
          appendDayCell(daysGrid, currentYear, currentMonth, day, false);
        }

        const trailing = 42 - (firstDay + daysInMonth);
        for (let day = 1; day <= trailing; day += 1) {
          const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
          const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
          appendDayCell(daysGrid, nextYear, nextMonth, day, true);
        }

        popup.child(daysGrid);

        const footer = el("div").class("crud-date-picker-footer");
        const clearBtn = el("button")
          .class("crud-date-picker-clear")
          .attr("type", "button")
          .text("Hapus");
        const todayBtn = el("button")
          .class("crud-date-picker-today")
          .attr("type", "button")
          .text("Hari Ini");

        clearBtn.on("click", (evt) => {
          evt.stopPropagation();
          selectedValue = "";
          onSelect("");
        });
        todayBtn.on("click", (evt) => {
          evt.stopPropagation();
          if (isDisabledDate(todayIso)) return;
          onSelect(todayIso);
        });

        footer.child([clearBtn, todayBtn]);
        popup.child(footer);
        // el.js: wajib .get() setelah .empty() + .child() agar DOM ter-update
        popup.get();
        // Set value select setelah option ter-mount (el.js flush via .get())
        monthSelect.el.value = String(currentMonth);
        if (currentYear < yearStart) currentYear = yearStart;
        if (currentYear > yearEnd) currentYear = yearEnd;
        yearSelect.el.value = String(currentYear);
        notifyReposition();
      };

      const appendDayCell = (grid, year, month, day, otherMonth) => {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const isToday = dateStr === todayIso;
        const isSelected = dateStr === selectedValue;
        const disabled = isDisabledDate(dateStr);

        const dayBtn = el("button")
          .class("crud-date-picker-day")
          .attr("type", "button")
          .text(String(day));

        if (otherMonth) dayBtn.class("is-other-month");
        if (isToday) dayBtn.class("is-today");
        if (isSelected) dayBtn.class("is-selected");
        if (disabled) dayBtn.attr("disabled", true);

        dayBtn.on("click", (evt) => {
          evt.stopPropagation();
          if (disabled) return;
          selectedValue = dateStr;
          onSelect(dateStr);
        });

        grid.child(dayBtn);
      };

      render();
      return popup;
    },

    // Rich text kosong (untuk validasi)
    isTextareaEmpty(value) {
      if (value == null || value === "") return true;
      if (typeof RichTextEditor !== "undefined" && RichTextEditor.isHtmlEmpty) {
        return RichTextEditor.isHtmlEmpty(value);
      }
      return String(value).trim() === "";
    },

    normalizeTextareaValue(value) {
      if (value == null) return "";
      const raw = String(value);
      if (!/[<&]/.test(raw)) return raw;
      const tmp = document.createElement("div");
      tmp.innerHTML = raw.replace(/<br\s*\/?>/gi, "\n");
      return (tmp.textContent || tmp.innerText || "").replace(/\u200B/g, "").trim();
    },

    // Create textarea — use rich editor only when explicitly enabled.
    // Otherwise fall back to plain textarea to avoid layout / load issues.
    createTextarea(field, value, readOnly, formData) {
      if (
        typeof RichTextEditor !== "undefined" &&
        RichTextEditor.isAvailable() &&
        field.richText === true
      ) {
        const editor = RichTextEditor.create(field, value, readOnly, formData);
        if (editor) return editor;
      }

      const textarea = el("textarea")
        .attr("name", field.name)
        .attr("placeholder", field.placeholder || "")
        .attr("rows", field.rows || 4)
        .attr("tabindex", "-1");
      if (field.required) textarea.attr("required", true);
      if (readOnly) textarea.attr("readonly", true).attr("disabled", true);
      const normalizedValue = this.normalizeTextareaValue(value);
      textarea
        .text(normalizedValue)
        .css({
          padding: "0.65rem 0.75rem",
          borderRadius: "0.5rem",
          border: "1px solid #d1d5db",
          fontSize: "0.95rem",
          outline: "none",
          resize: "vertical",
          fontFamily: "inherit",
          transition: "border-color 0.2s",
        })
        .on("input", function () {
          formData[field.name] = this.value;
        })
        .on("focus", function handler() {
          this.removeAttribute("tabindex");
          this.removeEventListener("focus", handler);
        });
      if (normalizedValue != null && normalizedValue !== "") {
        formData[field.name] = normalizedValue;
      }
      return textarea;
    },

    // Create select element (searchable by default)
    createSelect(field, value, readOnly, formData, apiClient) {
      if (this.useSearchableSelect(field)) {
        return this.createSearchableSelect(
          field,
          value,
          readOnly,
          formData,
          apiClient,
        );
      }
      return this.createNativeSelect(
        field,
        value,
        readOnly,
        formData,
        apiClient,
      );
    },

    createNativeSelect(field, value, readOnly, formData, apiClient) {
      const options = field.options || [];

      const select = el("select").attr("name", field.name);
      if (this.isMultiSelect(field))
        select.attr("multiple", true).attr("size", field.size || 6);
      if (field.required) select.attr("required", true);
      if (readOnly) select.attr("readonly", true).attr("disabled", true);
      select.css({
        padding: "0.65rem 0.75rem",
        borderRadius: "0.5rem",
        border: "1px solid #d1d5db",
        fontSize: "0.95rem",
        outline: "none",
        backgroundColor: "#fff",
        cursor: readOnly ? "not-allowed" : "pointer",
      });

      const selectedValues = this.normalizeSelectValues(field, value, options);

      // Placeholder option
      if (field.placeholder && !this.isMultiSelect(field)) {
        select.child(el("option").attr("value", "").text(field.placeholder));
      }

      // Options
      options.forEach((opt) => {
        const option = el("option")
          .attr("value", String(opt.value))
          .text(opt.label);

        if (selectedValues.includes(String(opt.value))) {
          option.attr("selected", "selected");
        }

        select.child(option);
      });

      const notifyFieldChange = this._buildOnFieldChange;
      select.on("change", () => {
        const nextValue = this.isMultiSelect(field)
          ? this.formatMultiSelectValue(
              field,
              Array.from(select.el.selectedOptions).map((opt) => opt.value),
            )
          : select.el.value;
        formData[field.name] = nextValue;
        if (typeof notifyFieldChange === "function") {
          notifyFieldChange(field.name, nextValue);
        }
      });

      // Sync nilai awal ke formData
      if (value != null && value !== "") {
        formData[field.name] = this.isMultiSelect(field)
          ? this.formatMultiSelectValue(field, selectedValues)
          : String(value);
      } else if (
        !formData[field.name] &&
        options.length > 0 &&
        !field.placeholder &&
        !this.isMultiSelect(field)
      ) {
        formData[field.name] = String(options[0].value);
      }

      // Muat opsi dari tabel lain secara async jika belum ada opsi
      if (apiClient && this.needsRemoteOptions(field)) {
        select.get();
        if (this.needsParentForOptions(field, formData)) {
          const waitLabel =
            field.waitParentLabel ||
            field.placeholder ||
            "Pilih agen terlebih dahulu";
          this.fillSelectOptions(
            select,
            field,
            [{ value: "", label: waitLabel }],
            "",
            formData,
          );
        } else {
          this.fillSelectOptions(
            select,
            field,
            [{ value: "", label: "Loading..." }],
            "",
            formData,
          );
          this.setDisabled(select, true);

          this.loadSelectOptions(field, apiClient, value, formData)
            .then((loaded) => {
              this.setDisabled(select, readOnly);
              this.fillSelectOptions(
                select,
                field,
                loaded,
                value ?? formData[field.name],
                formData,
              );
              select.get();
            })
            .catch(() => {
              this.setDisabled(select, readOnly);
              this.fillSelectOptions(select, field, [], value, formData);
              select.get();
            });
        }
      }

      return select;
    },

    // Select dengan kotak pencarian (combobox)
    createSearchableSelect(field, value, readOnly, formData, apiClient) {
      ensureSelectSearchStyles();
      bindSelectOutsideClick();

      let allOptions = [...(field.options || [])];
      const isMultiple = this.isMultiSelect(field);
      let selectedValues = this.normalizeSelectValues(
        field,
        value ?? formData[field.name],
        allOptions,
      );
      let isOpen = false;
      const isRemoteSearch = Boolean(apiClient && this.usesRemoteSearch(field));
      let remoteDebounceTimer = null;
      let remoteFetchSeq = 0;
      let remoteMeta = { total: 0, hasMore: false };
      let remoteCache = null;
      let remoteFetchInFlight = null;
      let suppressSearchInput = false;
      const minSearchLength =
        field.minSearchLength ??
        this.getRelationConfig(field)?.minSearchLength ??
        0;

      const wrapper = el("div").class("crud-search-select").css({
        position: "relative",
        width: "100%",
      });

      const hiddenInput = el("input")
        .attr("type", "hidden")
        .attr("name", field.name);
      if (field.required) hiddenInput.attr("required", true);

      const labelSpan = el("span").css({
        flex: "1",
        textAlign: "left",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: "#0f172a",
      });

      const chevron = el("i").class("fas fa-chevron-down").css({
        fontSize: "0.7rem",
        color: "#94a3b8",
        transition: "transform 0.2s",
        flexShrink: "0",
      });

      const trigger = el("button")
        .attr("type", "button")
        .class("crud-search-select-trigger")
        .css({
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          padding: "0.65rem 0.75rem",
          borderRadius: "0.5rem",
          border: "1px solid #d1d5db",
          fontSize: "0.95rem",
          backgroundColor: "#fff",
          cursor: readOnly ? "not-allowed" : "pointer",
          outline: "none",
          boxSizing: "border-box",
        });

      trigger.child([labelSpan, chevron]);

      const panel = el("div").class("crud-search-select-panel").css({
        display: "none",
        position: "fixed",
        zIndex: "10050",
        backgroundColor: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "0.5rem",
        boxShadow: "0 10px 40px rgba(15, 23, 42, 0.15)",
        overflow: "hidden",
        boxSizing: "border-box",
      });

      const searchInput = el("input")
        .attr("type", "text")
        .attr(
          "placeholder",
          field.searchPlaceholder ||
            (isRemoteSearch ? "Type name or code to search..." : "Search..."),
        )
        .attr("autocomplete", "off")
        .css({
          width: "100%",
          padding: "0.55rem 0.75rem",
          border: "none",
          borderBottom: "1px solid #e2e8f0",
          fontSize: "0.875rem",
          outline: "none",
          boxSizing: "border-box",
        });

      const list = el("div").class("crud-search-select-list").css({
        maxHeight: "220px",
        overflowY: "auto",
        padding: "0.25rem 0",
      });

      const getLabel = (val) => {
        if (val == null || val === "") return "";
        const found = allOptions.find((o) => String(o.value) === String(val));
        return found ? found.label : "";
      };

      const getMultiLabel = (values) =>
        (values || [])
          .map(
            (v) =>
              getLabel(v) || (/^\d+$/.test(String(v)) ? "#" + v : String(v)),
          )
          .filter(Boolean)
          .join(", ");

      const setDisplayValue = (val, labelText) => {
        let v = val == null || val === "" ? "" : String(val);
        let text = "";

        if (isMultiple) {
          selectedValues = this.normalizeSelectValues(field, val, allOptions);
          v = this.formatMultiSelectValue(field, selectedValues);
          text = labelText || getMultiLabel(selectedValues);
        } else {
          selectedValues = v ? [v] : [];
          // Fallback "#<value>" hanya untuk ID numeric (mis. relasi belum ter-resolve).
          // Untuk value string (mis. "Islam"), tampilkan apa adanya tanpa prefix.
          text =
            labelText ||
            getLabel(v) ||
            (v ? (/^\d+$/.test(v) ? "#" + v : v) : "");
        }

        hiddenInput.el.value = v;
        if (v && text) {
          labelSpan
            .text(
              isMultiple ? selectedValues.length + " dipilih: " + text : text,
            )
            .css({ color: "#0f172a" });
        } else if (field.placeholder) {
          labelSpan.text(field.placeholder).css({ color: "#94a3b8" });
        } else {
          labelSpan.text("Pilih...").css({ color: "#94a3b8" });
        }
        formData[field.name] = v;
        hiddenInput.get();
        if (typeof wrapper._crudOnChange === "function")
          wrapper._crudOnChange();
        if (typeof this._buildOnFieldChange === "function") {
          this._buildOnFieldChange(field.name, v);
        }
      };

      // el.js: wajib .empty() — innerHTML saja tidak mengosongkan antrian .ch (lihat cheatsheet)
      const resetList = () => list.empty();

      const renderOptionsList = (options, footerText = "") => {
        resetList();

        if (options.length === 0) {
          list.child(
            el("div")
              .text(footerText || "No results")
              .css({
                padding: "0.65rem 0.85rem",
                fontSize: "0.875rem",
                color: "#94a3b8",
              }),
          );
          list.get();
          return;
        }

        options.forEach((opt) => {
          const isSelected = isMultiple
            ? selectedValues.includes(String(opt.value))
            : String(opt.value) === String(formData[field.name]);
          const item = el("button")
            .attr("type", "button")
            .class(`crud-search-select-item${isSelected ? " is-selected" : ""}`)
            .text((isMultiple ? (isSelected ? "✓ " : "○ ") : "") + opt.label)
            .css({
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "0.55rem 0.85rem",
              border: "none",
              background: "transparent",
              fontSize: "0.875rem",
              color: "#0f172a",
              cursor: "pointer",
            });

          item.click((e) => {
            e.stopPropagation();
            if (isMultiple) {
              const optValue = String(opt.value);
              const next = selectedValues.includes(optValue)
                ? selectedValues.filter((v) => v !== optValue)
                : [...selectedValues, optValue];
              setDisplayValue(next);
              renderList(searchInput.el.value);
              return;
            }
            setDisplayValue(opt.value, opt.label);
            api.close();
          });

          list.child(item);
        });

        if (footerText) {
          list.child(
            el("div").text(footerText).css({
              padding: "0.45rem 0.85rem",
              fontSize: "0.75rem",
              color: "#94a3b8",
              borderTop: "1px solid #f1f5f9",
              backgroundColor: "#f8fafc",
            }),
          );
        }

        list.get();
      };

      const showListLoading = () => {
        resetList();
        list.child(
          el("div").text("Loading...").css({
            padding: "0.65rem 0.85rem",
            fontSize: "0.875rem",
            color: "#64748b",
          }),
        );
        list.get();
      };

      const renderList = (query = "") => {
        if (isRemoteSearch) {
          renderOptionsList(allOptions, remoteMeta.footer || "");
          return;
        }

        const q = String(query).trim().toLowerCase();
        const filtered = allOptions.filter((opt) => {
          if (!q) return true;
          return (
            String(opt.label || "")
              .toLowerCase()
              .includes(q) ||
            String(opt.value || "")
              .toLowerCase()
              .includes(q)
          );
        });
        renderOptionsList(filtered);
      };

      const fetchRemoteOptions = async (query = "", force = false) => {
        if (!isRemoteSearch) return;

        const q = String(query ?? "");
        const cacheKey = q;

        if (!force && remoteCache && remoteCache.key === cacheKey) {
          allOptions = remoteCache.options;
          remoteMeta = remoteCache.meta;
          renderList();
          return;
        }

        if (
          !force &&
          remoteFetchInFlight &&
          remoteFetchInFlight.key === cacheKey
        ) {
          return remoteFetchInFlight.promise;
        }

        const seq = ++remoteFetchSeq;
        showListLoading();

        const run = (async () => {
          const result = await this.searchSelectOptions(
            field,
            apiClient,
            q,
            formData,
          );
          if (seq !== remoteFetchSeq) return;

          if (result.needsMoreChars) {
            allOptions = [];
            remoteMeta = { total: 0, hasMore: false, footer: "" };
            remoteCache = { key: cacheKey, options: [], meta: remoteMeta };
            renderOptionsList(
              [],
              `Type at least ${result.minLen} characters to search`,
            );
            return;
          }

          allOptions = result.options || [];
          if (field.prependEmptyOption) {
            const emptyOpt = field.prependEmptyOption;
            allOptions = [
              emptyOpt,
              ...allOptions.filter(
                (o) => String(o.value) !== String(emptyOpt.value),
              ),
            ];
          }
          const total = result.total || 0;
          let footer = "";
          if (total > allOptions.length) {
            footer = `Showing ${allOptions.length} of ${total} — refine your search`;
          } else if (total > 0 && !q.trim()) {
            footer = `${total} data — ketik untuk memfilter`;
          }
          remoteMeta = { total, hasMore: result.hasMore, footer };
          remoteCache = {
            key: cacheKey,
            options: allOptions,
            meta: remoteMeta,
          };
          renderList();
        })();

        remoteFetchInFlight = { key: cacheKey, promise: run };
        try {
          await run;
        } finally {
          if (remoteFetchInFlight && remoteFetchInFlight.promise === run) {
            remoteFetchInFlight = null;
          }
        }
      };

      const scheduleRemoteSearch = (query) => {
        clearTimeout(remoteDebounceTimer);
        remoteDebounceTimer = setTimeout(() => fetchRemoteOptions(query), 350);
      };

      const positionPanel = () => {
        const rect = trigger.el.getBoundingClientRect();
        const maxH = 280;
        const spaceBelow = window.innerHeight - rect.bottom - 8;
        const spaceAbove = rect.top - 8;
        const openUp = spaceBelow < maxH && spaceAbove > spaceBelow;

        panel.css({
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          top: openUp ? "auto" : `${rect.bottom + 4}px`,
          bottom: openUp ? `${window.innerHeight - rect.top + 4}px` : "auto",
          maxHeight: `${Math.min(maxH, openUp ? spaceAbove : spaceBelow)}px`,
        });
      };

      const api = {
        isClickInside(e) {
          return wrapper.el && wrapper.el.contains(e.target);
        },
        open() {
          if (readOnly || isOpen) return;
          openSearchSelects.forEach((other) => {
            if (other !== api && typeof other.close === "function")
              other.close();
          });
          openSearchSelects.delete(api);
          isOpen = true;
          wrapper.el.classList.add("is-open");
          chevron.css({ transform: "rotate(180deg)" });
          panel.css({ display: "block" });
          positionPanel();
          suppressSearchInput = true;
          searchInput.el.value = "";
          suppressSearchInput = false;
          if (isRemoteSearch) {
            fetchRemoteOptions("");
          } else {
            renderList("");
          }
          openSearchSelects.add(api);
          setTimeout(() => searchInput.el.focus(), 0);
        },
        close() {
          if (!isOpen) return;
          isOpen = false;
          clearTimeout(remoteDebounceTimer);
          remoteDebounceTimer = null;
          remoteFetchSeq += 1;
          remoteFetchInFlight = null;
          wrapper.el.classList.remove("is-open");
          chevron.css({ transform: "rotate(0deg)" });
          panel.css({ display: "none" });
          openSearchSelects.delete(api);
        },
        setOptions(options, selectedValue) {
          allOptions = (options || []).filter((o) => o.value !== "" || o.label);
          const sel =
            selectedValue != null ? selectedValue : formData[field.name];
          if (sel != null && sel !== "") {
            if (isMultiple) {
              setDisplayValue(sel);
            } else {
              const found = allOptions.find(
                (o) => String(o.value) === String(sel),
              );
              // Untuk value bertipe string (mis. "Islam") tampilkan apa adanya;
              // prefix "#" hanya dipakai bila value-nya angka murni (ID relasi
              // yang belum ter-resolve), agar tidak salah dianggap noise.
              const fallbackLabel = /^\d+$/.test(String(sel))
                ? "#" + sel
                : String(sel);
              setDisplayValue(
                found ? found.value : sel,
                found ? found.label : fallbackLabel,
              );
            }
          } else {
            setDisplayValue("", "");
          }
          if (isOpen) renderList(searchInput.el.value);
        },
        setValue(val) {
          api.setOptions(allOptions, val);
        },
      };

      wrapper._crudSelectApi = api;

      trigger.click((e) => {
        e.preventDefault();
        e.stopPropagation();
        if (readOnly) return;
        if (isOpen) return;
        api.open();
      });

      wrapper.el.addEventListener("mousedown", (e) => e.stopPropagation());
      searchInput.click((e) => e.stopPropagation());
      searchInput.on("input", () => {
        if (suppressSearchInput) return;
        const q = searchInput.el.value;
        if (isRemoteSearch) {
          scheduleRemoteSearch(q);
        } else {
          renderList(q);
        }
      });
      panel.click((e) => e.stopPropagation());

      const onReposition = () => {
        if (isOpen) positionPanel();
      };
      window.addEventListener("resize", onReposition);
      window.addEventListener("scroll", onReposition, true);

      panel.child([searchInput, list]);

      wrapper.child([hiddenInput, trigger, panel]);

      const initial =
        value != null && value !== "" ? value : formData[field.name];
      if (initial != null && initial !== "") {
        setDisplayValue(initial, getLabel(initial));
      } else if (field.placeholder) {
        setDisplayValue("", "");
      } else if (allOptions.length > 0 && !field.placeholder) {
        setDisplayValue(allOptions[0].value, allOptions[0].label);
      } else {
        setDisplayValue("", "");
      }

      if (readOnly) {
        this.setDisabled(trigger, true);
        this.setDisabled(searchInput, true);
      }

      if (apiClient && this.needsRemoteOptions(field)) {
        if (isRemoteSearch) {
          const initialId = value ?? formData[field.name];
          const hasPreset = allOptions.some(
            (o) => String(o.value) === String(initialId),
          );
          if (initialId != null && initialId !== "" && !hasPreset) {
            this.setDisabled(trigger, true);
            const relCfg = this.getRelationConfig(field);
            const valueKey = relCfg?.value || "id";
            const useIdLookup =
              valueKey === "id" && /^\d+$/.test(String(initialId));
            const finishPreset = (opt) => {
              this.setDisabled(trigger, readOnly);
              if (opt) {
                allOptions = [opt];
                setDisplayValue(opt.value, opt.label);
              }
            };
            if (useIdLookup) {
              this.loadSelectOptionById(field, apiClient, initialId).then(
                finishPreset,
              );
            } else {
              finishPreset({
                value: String(initialId),
                label: String(initialId),
              });
            }
          } else if (hasPreset) {
            const preset = allOptions.find(
              (o) => String(o.value) === String(initialId),
            );
            if (preset) setDisplayValue(preset.value, preset.label);
          }
        } else if (this.needsParentForOptions(field, formData)) {
          const waitLabel =
            field.waitParentLabel ||
            field.placeholder ||
            "Pilih agen terlebih dahulu";
          api.setOptions([{ value: "", label: waitLabel }], "");
        } else {
          api.setOptions([{ value: "", label: "Loading..." }], "");
          this.setDisabled(trigger, true);
          this.loadSelectOptions(field, apiClient, value, formData)
            .then((loaded) => {
              this.setDisabled(trigger, readOnly);
              api.setOptions(loaded, value ?? formData[field.name]);
            })
            .catch(() => {
              this.setDisabled(trigger, readOnly);
              api.setOptions([], value);
            });
        }
      }

      return wrapper;
    },

    // Create checkbox element
    createCheckbox(field, value, readOnly, formData) {
      const container = el("div").css({
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
      });

      const checkbox = el("input")
        .attr("type", "checkbox")
        .attr("name", field.name)
        .attr("checked", !!value);
      if (readOnly) checkbox.attr("readonly", true).attr("disabled", true);
      checkbox
        .css({
          width: "1rem",
          height: "1rem",
          cursor: readOnly ? "not-allowed" : "pointer",
        })
        .on("change", function (e) {
          formData[field.name] = this.checked;
        });

      const label = el("span")
        .css({
          fontSize: "0.95rem",
          color: "#374151",
        })
        .text(field.label || field.name);

      container.child([checkbox, label]);
      return container;
    },

    // Create radio group
    createRadio(field, value, readOnly, formData) {
      const container = el("div").css({
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      });

      const options = field.options || [];
      options.forEach((opt) => {
        const row = el("div").css({
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        });

        const radio = el("input")
          .attr("type", "radio")
          .attr("name", field.name)
          .attr("value", opt.value)
          .attr("checked", opt.value === value)
          .css({
            width: "1rem",
            height: "1rem",
            cursor: readOnly ? "not-allowed" : "pointer",
          })
          .on("change", function (e) {
            formData[field.name] = this.value;
          });
        if (readOnly) radio.attr("disabled", true);

        const label = el("span")
          .css({
            fontSize: "0.95rem",
            color: "#374151",
          })
          .text(opt.label);

        row.child([radio, label]);
        container.child(row);
      });

      return container;
    },

    createMasaKerjaDuration(field, value, readOnly, formData) {
      const maxTahun = Number(field.maxTahun) > 0 ? Number(field.maxTahun) : 30;
      const maxBulan =
        Number(field.maxBulan) >= 0 ? Number(field.maxBulan) : 11;
      const parsed = parseMasaKerjaDuration(formData, field);
      let tahunVal = parsed.tahun;
      let bulanVal = parsed.bulan;
      applyMasaKerjaDuration(formData, field, tahunVal, bulanVal);

      const container = el("div").class("crud-masa-kerja-duration");

      const buildSelect = (partLabel, partName, max, suffix, selected) => {
        const part = el("div").class("crud-masa-kerja-part");
        part.child(
          el("label").text(partLabel).attr("for", `${field.name}_${partName}`),
        );
        const select = el("select")
          .attr("id", `${field.name}_${partName}`)
          .attr("name", `${field.name}_${partName}`);
        if (readOnly) select.attr("disabled", true);
        select.child(el("option").attr("value", "").text(`— ${partLabel} —`));
        for (let i = 0; i <= max; i += 1) {
          select.child(
            el("option").attr("value", String(i)).text(`${i} ${suffix}`),
          );
        }
        select.el.value = String(selected);
        part.child(select);
        return { part, select };
      };

      const preview = el("div").class("crud-masa-kerja-preview");
      const syncPreview = () => {
        const label = formatMasaKerjaLabel(tahunVal, bulanVal);
        preview.text(label ? `Durasi: ${label}` : "Durasi: —");
      };

      const tahunPart = buildSelect(
        "Tahun",
        "tahun",
        maxTahun,
        "tahun",
        tahunVal,
      );
      const bulanPart = buildSelect(
        "Bulan",
        "bulan",
        maxBulan,
        "bulan",
        bulanVal,
      );

      const syncValues = () => {
        tahunVal = Number(tahunPart.select.el.value || 0);
        bulanVal = Number(bulanPart.select.el.value || 0);
        applyMasaKerjaDuration(formData, field, tahunVal, bulanVal);
        syncPreview();
        if (typeof this._buildOnFieldChange === "function") {
          this._buildOnFieldChange(field.name, formData[field.name]);
        }
      };

      if (!readOnly) {
        tahunPart.select.on("change", syncValues);
        bulanPart.select.on("change", syncValues);
      }

      container.child([tahunPart.part, bulanPart.part, preview]);
      syncPreview();

      container._masaKerjaApi = {
        setFromFormData(data) {
          const next = parseMasaKerjaDuration(data, field);
          tahunVal = next.tahun;
          bulanVal = next.bulan;
          tahunPart.select.el.value = String(tahunVal);
          bulanPart.select.el.value = String(bulanVal);
          applyMasaKerjaDuration(formData, field, tahunVal, bulanVal);
          syncPreview();
        },
      };

      return container;
    },

    createWaktuKerja(field, value, readOnly, formData) {
      let state = parseWaktuKerjaValue(formData[field.name] || value);
      applyWaktuKerja(formData, field, state);

      const container = el("div").class("crud-waktu-kerja");

      const buildJamSelect = (partLabel, partName, selected) => {
        const part = el("div").class("crud-waktu-kerja-part");
        part.child(
          el("label").text(partLabel).attr("for", `${field.name}_${partName}`),
        );
        const select = el("select")
          .attr("id", `${field.name}_${partName}`)
          .attr("name", `${field.name}_${partName}`);
        if (readOnly) select.attr("disabled", true);
        select.child(el("option").attr("value", "").text(`— ${partLabel} —`));
        WAKTU_KERJA_JAM_OPTIONS.forEach((jam) => {
          select.child(el("option").attr("value", jam).text(jam));
        });
        select.el.value = selected || "";
        part.child(select);
        return { part, select };
      };

      const preview = el("div").class("crud-waktu-kerja-preview");
      const syncPreview = () => {
        const composed = composeWaktuKerjaValue(
          state.jamMulai,
          state.jamSelesai,
          state.hari,
          state.catatan,
        );
        preview.text(
          composed ? `Preview cetak: ${composed}` : "Preview cetak: —",
        );
      };

      const syncValues = () => {
        applyWaktuKerja(formData, field, state);
        syncPreview();
        if (typeof this._buildOnFieldChange === "function") {
          this._buildOnFieldChange(field.name, formData[field.name]);
        }
      };

      const jamMulaiPart = buildJamSelect(
        "Jam mulai",
        "jam_mulai",
        state.jamMulai,
      );
      const jamSelesaiPart = buildJamSelect(
        "Jam selesai",
        "jam_selesai",
        state.jamSelesai,
      );

      const catatanPart = el("div").class("crud-waktu-kerja-part");
      catatanPart.child(
        el("label")
          .text("Catatan (opsional)")
          .attr("for", `${field.name}_catatan`),
      );
      const catatanInput = el("input")
        .attr("type", "text")
        .attr("id", `${field.name}_catatan`)
        .attr("name", `${field.name}_catatan`)
        .attr("placeholder", "Contoh: shift malam, istirahat 1 jam")
        .value(state.catatan || "");
      if (readOnly) catatanInput.attr("readonly", true).attr("disabled", true);
      catatanPart.child(catatanInput);

      const daysWrap = el("div").class("crud-waktu-kerja-days");
      daysWrap.child(el("label").text("Hari kerja"));
      const chips = el("div").class("crud-waktu-kerja-day-chips");
      const chipButtons = {};

      WAKTU_KERJA_HARI.forEach((day) => {
        const btn = el("button")
          .attr("type", "button")
          .class("crud-waktu-kerja-day-chip")
          .text(day.label);
        if (state.hari.includes(day.key)) btn.class("is-active");
        if (readOnly) btn.attr("disabled", true);
        btn.on("click", () => {
          if (readOnly) return;
          if (state.hari.includes(day.key)) {
            state.hari = state.hari.filter((k) => k !== day.key);
            btn.el.classList.remove("is-active");
          } else {
            state.hari = [...state.hari, day.key];
            btn.el.classList.add("is-active");
          }
          syncValues();
        });
        chipButtons[day.key] = btn;
        chips.child(btn);
      });
      daysWrap.child(chips);

      const presetsWrap = el("div").class("crud-waktu-kerja-presets");
      const presets = [
        {
          label: "Sen–Sab 08–17",
          apply() {
            state.jamMulai = "08:00";
            state.jamSelesai = "17:00";
            state.hari = ["sen", "sel", "rab", "kam", "jum", "sab"];
            state.catatan = "";
          },
        },
        {
          label: "24 jam / live-in",
          apply() {
            state.jamMulai = "";
            state.jamSelesai = "";
            state.hari = WAKTU_KERJA_HARI.map((d) => d.key);
            state.catatan = "Live-in / siap 24 jam";
          },
        },
      ];
      presets.forEach((preset) => {
        const btn = el("button")
          .attr("type", "button")
          .class("crud-waktu-kerja-preset")
          .text(preset.label);
        if (readOnly) btn.attr("disabled", true);
        btn.on("click", () => {
          if (readOnly) return;
          preset.apply();
          jamMulaiPart.select.el.value = state.jamMulai || "";
          jamSelesaiPart.select.el.value = state.jamSelesai || "";
          catatanInput.el.value = state.catatan || "";
          WAKTU_KERJA_HARI.forEach((day) => {
            const active = state.hari.includes(day.key);
            chipButtons[day.key].el.classList.toggle("is-active", active);
          });
          syncValues();
        });
        presetsWrap.child(btn);
      });

      const rowJam = el("div").class("crud-waktu-kerja-row");
      rowJam.child([jamMulaiPart.part, jamSelesaiPart.part, catatanPart]);
      container.child([rowJam, daysWrap, presetsWrap, preview]);

      if (!readOnly) {
        jamMulaiPart.select.on("change", function () {
          state.jamMulai = normalizeJamValue(this.value);
          syncValues();
        });
        jamSelesaiPart.select.on("change", function () {
          state.jamSelesai = normalizeJamValue(this.value);
          syncValues();
        });
        catatanInput.on("input", function () {
          state.catatan = this.value;
          syncValues();
        });
      }

      syncPreview();

      container._waktuKerjaApi = {
        setFromFormData(data) {
          state = parseWaktuKerjaValue(data?.[field.name] || "");
          jamMulaiPart.select.el.value = state.jamMulai || "";
          jamSelesaiPart.select.el.value = state.jamSelesai || "";
          catatanInput.el.value = state.catatan || "";
          WAKTU_KERJA_HARI.forEach((day) => {
            chipButtons[day.key].el.classList.toggle(
              "is-active",
              state.hari.includes(day.key),
            );
          });
          applyWaktuKerja(formData, field, state);
          syncPreview();
        },
      };

      return container;
    },

    createPptkIsi(field, value, readOnly, formData) {
      const container = el("div").class("crud-pptk-isi");
      container.child(
        el("div")
          .class("crud-pptk-isi-label")
          .text("Template pernyataan (klik untuk isi)"),
      );

      const presetsWrap = el("div").class("crud-pptk-isi-presets");
      const preview = el("div").class("crud-pptk-isi-preview");

      const textarea = el("textarea")
        .attr("name", field.name)
        .attr("rows", field.rows || 8)
        .attr(
          "placeholder",
          field.placeholder || "Tulis atau pilih template pernyataan PPTK…",
        );
      if (field.required) textarea.attr("required", true);
      if (readOnly) textarea.attr("readonly", true).attr("disabled", true);
      textarea.text(value || formData[field.name] || "");

      const syncValue = () => {
        const text = String(textarea.el.value || "").trim();
        formData[field.name] = textarea.el.value;
        preview.text(
          text
            ? `${text.length} karakter — akan tampil di biodata cetak`
            : "Belum ada teks pernyataan",
        );
      };

      PPTK_ISI_TEMPLATES.forEach((tpl) => {
        const btn = el("button")
          .attr("type", "button")
          .class("crud-pptk-isi-preset")
          .text(tpl.label);
        if (readOnly) btn.attr("disabled", true);
        btn.on("click", () => {
          if (readOnly) return;
          textarea.el.value = tpl.text;
          syncValue();
        });
        presetsWrap.child(btn);
      });

      if (!readOnly) {
        textarea.on("input", syncValue);
      }

      container.child([presetsWrap, textarea, preview]);
      syncValue();

      container._pptkIsiApi = {
        setValue(next) {
          textarea.el.value = next || "";
          syncValue();
        },
      };

      return container;
    },

    // Validate form data
    validate(fields, formData) {
      const errors = {};

      fields.forEach((field) => {
        if (field.type === "section" || !field.name) return;
        const value = formData[field.name];
        const fieldErrors = [];

        if (field.type === "masa_kerja_duration") {
          const dur = parseMasaKerjaDuration(formData, field);
          if (field.required && dur.tahun === 0 && dur.bulan === 0) {
            fieldErrors.push(`${field.label || field.name} wajib diisi`);
          }
          if (fieldErrors.length) errors[field.name] = fieldErrors;
          return;
        }

        if (field.type === "waktu_kerja") {
          const composed = String(formData[field.name] || "").trim();
          if (field.required && !composed) {
            fieldErrors.push(`${field.label || field.name} wajib diisi`);
          }
          if (fieldErrors.length) errors[field.name] = fieldErrors;
          return;
        }

        if (field.type === "pptk_isi") {
          const composed = String(formData[field.name] || "").trim();
          if (field.required && !composed) {
            fieldErrors.push(`${field.label || field.name} wajib diisi`);
          }
          if (fieldErrors.length) errors[field.name] = fieldErrors;
          return;
        }

        const isEmpty =
          field.type === "textarea" || field.type === "pptk_isi"
            ? this.isTextareaEmpty(value)
            : !value || (typeof value === "string" && value.trim() === "");

        // Required validation
        if (field.required && isEmpty) {
          fieldErrors.push(`${field.label || field.name} is required`);
        }

        // Skip other validations if empty and not required
        if (isEmpty && !field.required) return;

        const textLen =
          (field.type === "textarea" || field.type === "pptk_isi") &&
          typeof value === "string"
            ? (() => {
                const tmp = document.createElement("div");
                tmp.innerHTML = value;
                return (tmp.textContent || "").length;
              })()
            : typeof value === "string"
              ? value.length
              : 0;

        // Min length (teks tanpa tag HTML)
        if (field.validation?.minLength) {
          if (textLen < field.validation.minLength) {
            fieldErrors.push(
              `Minimum ${field.validation.minLength} characters`,
            );
          }
        }

        // Max length
        if (field.validation?.maxLength) {
          if (textLen > field.validation.maxLength) {
            fieldErrors.push(
              `Maximum ${field.validation.maxLength} characters`,
            );
          }
        }

        // Pattern
        if (field.validation?.pattern && typeof value === "string") {
          const regex = new RegExp(field.validation.pattern);
          if (!regex.test(value)) {
            fieldErrors.push(
              field.validation.patternMessage || "Invalid format",
            );
          }
        }

        // Input mask — semua slot harus terisi
        if (field.mask && typeof InputMask !== "undefined") {
          const mustComplete =
            field.required || field.mask.requireComplete !== false;
          if (mustComplete && !InputMask.isComplete(value, field.mask)) {
            const cfg = InputMask.normalizeConfig(field.mask);
            fieldErrors.push(
              cfg.completeMessage || "Lengkapi seluruh format nomor",
            );
          }
        }

        // Email
        if (field.type === "email" && value) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value)) {
            fieldErrors.push("Invalid email format");
          }
        }

        // Min number
        if (field.validation?.min && typeof value === "number") {
          if (value < field.validation.min) {
            fieldErrors.push(`Minimum value is ${field.validation.min}`);
          }
        }

        // Max number
        if (field.validation?.max && typeof value === "number") {
          if (value > field.validation.max) {
            fieldErrors.push(`Maximum value is ${field.validation.max}`);
          }
        }

        // Custom validation
        if (
          field.validation?.custom &&
          typeof field.validation.custom === "function"
        ) {
          const customError = field.validation.custom(value, formData);
          if (customError) {
            fieldErrors.push(customError);
          }
        }

        if (fieldErrors.length > 0) {
          errors[field.name] = fieldErrors;
        }
      });

      return errors;
    },

    // Show validation errors
    showErrors(errors, errorElements) {
      Object.keys(errorElements).forEach((fieldName) => {
        const errorEl = errorElements[fieldName];
        if (errors[fieldName]) {
          errorEl.text(errors[fieldName].join(", ")).css({ display: "block" });
        } else {
          errorEl.css({ display: "none" });
        }
      });
    },

    // Clear all errors
    clearErrors(errorElements) {
      Object.values(errorElements).forEach((errorEl) => {
        errorEl.css({ display: "none" });
      });
    },

    // Update field values (for edit mode)
    updateFieldValues(fields, formData, fieldElements) {
      fields.forEach((field) => {
        const element = fieldElements[field.name];
        if (!element) return;

        const value = formData[field.name];

        if (field.type === "checkbox") {
          element.el.querySelector('input[type="checkbox"]').checked = !!value;
        } else if (field.type === "radio") {
          element.el
            .querySelectorAll('input[type="radio"]')
            .forEach((radio) => {
              radio.checked = radio.value === value;
            });
        } else if (field.type === "select") {
          const selectEl = this.getSelectControl(element);
          if (selectEl._crudSelectApi) {
            selectEl._crudSelectApi.setValue(value || "");
          } else if (selectEl.el && selectEl.el.tagName === "SELECT") {
            if (this.isMultiSelect(field)) {
              const selectedValues = this.normalizeSelectValues(
                field,
                value,
                field.options || [],
              );
              Array.from(selectEl.el.options).forEach((option) => {
                option.selected = selectedValues.includes(String(option.value));
              });
            } else {
              selectEl.el.value = value || "";
            }
          }
        } else if (field.type === "textarea") {
          if (element._richEditorApi) {
            element._richEditorApi.setValue(value || "");
          } else if (element.el && element.el.tagName === "TEXTAREA") {
            element.el.value = value || "";
          }
        } else if (field.type === "range" && element._rangeInputApi) {
          element._rangeInputApi.setValue(value || "");
        } else if (
          field.type === "masa_kerja_duration" &&
          element._masaKerjaApi
        ) {
          element._masaKerjaApi.setFromFormData(formData);
        } else if (field.type === "pptk_isi" && element._pptkIsiApi) {
          element._pptkIsiApi.setValue(value || "");
        } else if (field.type === "waktu_kerja" && element._waktuKerjaApi) {
          element._waktuKerjaApi.setFromFormData(formData);
        } else if (field.type === "date" && element._datePickerApi) {
          element._datePickerApi.setValue(value || "");
        } else if (element._inputMaskApi) {
          element._inputMaskApi.setValue(value || "");
        } else {
          element.el.value = value || "";
        }
      });
    },
  };

  return FormBuilder;
});
