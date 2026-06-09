/**
 * Input mask ringan — pola tetap + slot editable (mis. ........./TKI/FGJ/...../......)
 * Konfigurasi via field.mask di FormBuilder atau preset JSON.
 */
(function (global) {
  'use strict';

  const DEFAULT_SLOT = '.';

  function normalizeConfig(mask) {
    if (!mask) return null;
    if (typeof mask === 'string') {
      return { pattern: mask, slotChar: DEFAULT_SLOT };
    }
    let slotTest = mask.slotTest || null;
    if (typeof slotTest === 'string') {
      try {
        slotTest = new RegExp(slotTest);
      } catch (e) {
        slotTest = null;
      }
    }
    return {
      pattern: mask.pattern || '',
      slotChar: mask.slotChar != null ? String(mask.slotChar) : DEFAULT_SLOT,
      slotTest,
      requireComplete: mask.requireComplete !== false,
      completeMessage: mask.completeMessage || 'Lengkapi seluruh format nomor surat'
    };
  }

  function countSlots(template, slotChar) {
    let n = 0;
    for (let i = 0; i < template.length; i++) {
      if (template[i] === slotChar) n++;
    }
    return n;
  }

  function formatFromSlots(template, slotChar, slots) {
    let si = 0;
    let out = '';
    for (let i = 0; i < template.length; i++) {
      if (template[i] === slotChar) {
        const v = slots[si];
        out += v != null && v !== '' ? v : slotChar;
        si++;
      } else {
        out += template[i];
      }
    }
    return out;
  }

  function slotsFromValue(value, template, slotChar) {
    const n = countSlots(template, slotChar);
    const slots = new Array(n).fill(slotChar);
    const v = String(value || '');
    if (!v) return slots;

    if (v.length === template.length) {
      let si = 0;
      for (let i = 0; i < template.length; i++) {
        if (template[i] === slotChar) {
          const ch = v[i];
          slots[si] = ch && ch !== slotChar ? ch : slotChar;
          si++;
        } else if (v[i] !== template[i]) {
          return new Array(n).fill(slotChar);
        }
      }
      return slots;
    }

    let si = 0;
    for (let i = 0; i < template.length && si < n; i++) {
      if (template[i] !== slotChar) continue;
      if (i < v.length && v[i] !== slotChar) slots[si] = v[i];
      si++;
    }
    return slots;
  }

  function isAllowedChar(ch, slotTest) {
    if (!ch || ch.length !== 1) return false;
    if (slotTest instanceof RegExp) return slotTest.test(ch);
    if (typeof slotTest === 'function') return slotTest(ch);
    return ch !== '\n' && ch !== '\r' && ch !== '\t';
  }

  function isComplete(value, maskConfig) {
    const cfg = normalizeConfig(maskConfig);
    if (!cfg || !cfg.pattern) return true;
    const { pattern, slotChar } = cfg;
    const slots = slotsFromValue(value, pattern, slotChar);
    return slots.every((s) => s !== slotChar && s != null && s !== '');
  }

  function attach(inputEl, maskConfig, onChange) {
    const cfg = normalizeConfig(maskConfig);
    if (!cfg || !cfg.pattern || !inputEl) return null;

    const { pattern, slotChar } = cfg;
    const slotCount = countSlots(pattern, slotChar);
    let slots = slotsFromValue(inputEl.value, pattern, slotChar);

    const render = () => {
      const formatted = formatFromSlots(pattern, slotChar, slots);
      inputEl.value = formatted;
      if (typeof onChange === 'function') onChange(formatted);
      return formatted;
    };

    const slotIndexFromCaret = (caret) => {
      let idx = 0;
      let lastSlot = 0;
      for (let i = 0; i < pattern.length && i < caret; i++) {
        if (pattern[i] === slotChar) {
          lastSlot = idx;
          idx++;
        }
      }
      return Math.min(lastSlot, slotCount - 1);
    };

    const caretAfterSlot = (slotIndex) => {
      let si = -1;
      for (let i = 0; i < pattern.length; i++) {
        if (pattern[i] === slotChar) {
          si++;
          if (si === slotIndex) return Math.min(i + 1, pattern.length);
        }
      }
      return pattern.length;
    };

    const firstEmptySlot = () => {
      const i = slots.findIndex((s) => s === slotChar);
      return i >= 0 ? i : 0;
    };

    const setCaret = (pos) => {
      try {
        inputEl.setSelectionRange(pos, pos);
      } catch (e) { /* readonly */ }
    };

    const onKeyDown = (e) => {
      if (inputEl.readOnly || inputEl.disabled) return;

      const start = inputEl.selectionStart ?? 0;
      const end = inputEl.selectionEnd ?? start;
      let slotIdx = slotIndexFromCaret(start);

      if (e.key === 'Backspace') {
        e.preventDefault();
        if (start !== end) {
          for (let i = 0; i < slotCount; i++) slots[i] = slotChar;
        } else {
          while (slotIdx >= 0 && slots[slotIdx] === slotChar) slotIdx--;
          if (slotIdx >= 0) slots[slotIdx] = slotChar;
        }
        render();
        setCaret(caretAfterSlot(Math.max(0, slotIdx)));
        return;
      }

      if (e.key === 'Delete') {
        e.preventDefault();
        slots[slotIdx] = slotChar;
        render();
        setCaret(caretAfterSlot(slotIdx));
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!isAllowedChar(e.key, cfg.slotTest)) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        if (start !== end) {
          for (let i = 0; i < slotCount; i++) slots[i] = slotChar;
          slotIdx = 0;
        }
        while (slotIdx < slotCount && slots[slotIdx] !== slotChar) slotIdx++;
        if (slotIdx < slotCount) {
          slots[slotIdx] = e.key;
          render();
          const next = slots.findIndex((s, i) => i > slotIdx && s === slotChar);
          setCaret(caretAfterSlot(next >= 0 ? next : slotIdx));
        }
      }
    };

    const onPaste = (e) => {
      e.preventDefault();
      const text = (e.clipboardData || global.clipboardData)?.getData('text') || '';
      const chars = text.replace(/\s/g, '').split('').filter((c) => isAllowedChar(c, cfg.slotTest));
      let si = firstEmptySlot();
      chars.forEach((c) => {
        if (si >= slotCount) return;
        slots[si] = c;
        si++;
      });
      render();
      setCaret(caretAfterSlot(Math.min(si, slotCount - 1)));
    };

    const onFocus = () => {
      const empty = firstEmptySlot();
      setCaret(caretAfterSlot(empty));
    };

    const onClick = () => {
      const idx = slotIndexFromCaret(inputEl.selectionStart ?? 0);
      // Jika slot di posisi klik masih kosong, lompat ke slot kosong PERTAMA
      // (mirip behavior jQuery Inputmask). Slot terisi tetap bisa di-klik untuk
      // di-edit di posisinya.
      if (slots[idx] === slotChar) {
        setCaret(caretAfterSlot(firstEmptySlot()));
      } else {
        setCaret(caretAfterSlot(idx));
      }
    };

    inputEl.addEventListener('keydown', onKeyDown);
    inputEl.addEventListener('paste', onPaste);
    inputEl.addEventListener('focus', onFocus);
    inputEl.addEventListener('click', onClick);

    render();

    return {
      setValue(val) {
        slots = slotsFromValue(val, pattern, slotChar);
        render();
      },
      getValue() {
        return formatFromSlots(pattern, slotChar, slots);
      },
      isComplete() {
        return slots.every((s) => s !== slotChar);
      },
      destroy() {
        inputEl.removeEventListener('keydown', onKeyDown);
        inputEl.removeEventListener('paste', onPaste);
        inputEl.removeEventListener('focus', onFocus);
        inputEl.removeEventListener('click', onClick);
      }
    };
  }

  const InputMask = {
    normalizeConfig,
    formatFromSlots,
    slotsFromValue,
    isComplete,
    attach
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = InputMask;
  }
  global.InputMask = InputMask;
})(typeof window !== 'undefined' ? window : global);
