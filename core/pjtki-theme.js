/**
 * Palet admin panel PJTKI — navy sidebar + teal accent + glass hero (laporan)
 */
(function (global) {
  'use strict';

  global.PjtkiTheme = {
    navy: '#2f3d58',
    navyActive: '#3a4a66',
    navyMuted: '#64748b',
    primary: '#41c38c',
    dark: '#2f3d58',
    deeper: '#1e293b',
    mid: '#41c38c',
    accent: '#41c38c',
    accentPink: '#e84393',
    accentAmber: '#f1c40f',
    accentBlue: '#3498db',
    light: '#eef9f3',
    lightBorder: '#b8e6cf',
    lightBg: '#f0f4f7',
    pageBg: '#f0f4f7',
    cardBorder: '#e8ecf1',
    text: '#2f3d58',
    textDark: '#263247',
    textMuted: '#94a3b8',
    gradient: 'linear-gradient(135deg, #1e293b 0%, #263247 38%, #059669 100%)',
    gradientHero: 'linear-gradient(135deg, #1e293b 0%, #263247 38%, #059669 100%)',
    gradientBtn: 'linear-gradient(135deg, #41c38c 0%, #36a876 100%)',
    gradientBtnStrong: 'linear-gradient(135deg, #41c38c 0%, #2ecc71 100%)',
    shadow: 'rgba(47, 61, 88, 0.25)',
    shadowSoft: 'rgba(15, 23, 42, 0.18)',
    shadowChip: 'rgba(65, 195, 140, 0.28)',
    glassBg: 'rgba(255, 255, 255, 0.14)',
    glassBorder: '1px solid rgba(255, 255, 255, 0.22)',
    glassShadow: '0 4px 16px rgba(15, 23, 42, 0.12)',
    hintBg: 'linear-gradient(135deg, #eef9f3 0%, #f0f4f7 100%)',
    hintBorder: '#b8e6cf',
    hintText: '#2f3d58',
    chipBorder: '#b8e6cf',
    chipText: '#2f3d58',
    statusProsesBg: '#eef9f3',
    statusProsesFg: '#41c38c',
    chartColors: ['#41c38c', '#e84393', '#f1c40f', '#3498db', '#9b59b6', '#e67e22']
  };

  /** Kartu glass & hero banner — selaras laporan TKI */
  if (typeof el !== 'undefined') {
    global.PjtkiUi = {
      buildGlassKpiChip(label, initialValue, iconClass, opts) {
        const o = opts || {};
        const T = global.PjtkiTheme;
        const valueEl = el('div').text(initialValue).css({
          fontSize: o.valueSize || '1.4rem',
          fontWeight: '800',
          color: '#fff',
          lineHeight: 1.1,
          letterSpacing: '-0.02em'
        });
        const chip = el('div').css({
          background: T.glassBg,
          border: T.glassBorder,
          borderRadius: '0.875rem',
          padding: o.compact ? '0.65rem 0.85rem' : '0.8rem 1rem',
          minWidth: o.minWidth || '110px',
          flex: o.flex !== undefined ? o.flex : '1',
          boxShadow: T.glassShadow,
          cursor: o.onClick ? 'pointer' : 'default',
          transition: o.onClick ? 'transform 0.15s ease, box-shadow 0.15s ease' : undefined
        });
        const top = el('div').css({
          display: 'flex',
          alignItems: 'center',
          gap: o.compact ? '0.35rem' : '0.45rem',
          marginBottom: o.compact ? '0.2rem' : '0.35rem'
        });
        if (iconClass) {
          top.child(el('i').class(iconClass).css({ color: 'rgba(255,255,255,0.85)', fontSize: o.compact ? '0.72rem' : '0.8rem' }));
        }
        top.child(el('span').text(label).css({
          fontSize: o.compact ? '0.66rem' : '0.72rem',
          fontWeight: '700',
          color: 'rgba(255,255,255,0.82)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }));
        chip.child(top);
        chip.child(valueEl);
        if (o.hint) {
          chip.child(el('div').text(o.hint).css({
            marginTop: '0.2rem',
            fontSize: '0.68rem',
            color: 'rgba(255,255,255,0.58)',
            lineHeight: 1.35
          }));
        }
        if (o.onClick) {
          chip.click(o.onClick);
          chip.on('mouseenter', function () { this.style.transform = 'translateY(-2px)'; });
          chip.on('mouseleave', function () { this.style.transform = 'translateY(0)'; });
        }
        return {
          el: chip,
          setValue(v) { valueEl.text(String(v)); },
          valueEl
        };
      },

      buildHeroDecor(parent) {
        parent.child(el('div').css({
          position: 'absolute',
          right: '-2rem',
          top: '-2rem',
          width: '140px',
          height: '140px',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
          pointerEvents: 'none'
        }));
      },

      buildHeroIconBox(iconClass) {
        const box = el('div').css({
          width: '52px',
          height: '52px',
          borderRadius: '0.875rem',
          background: 'rgba(255,255,255,0.18)',
          border: '1px solid rgba(255,255,255,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: '0'
        });
        box.child(el('i').class(iconClass).css({ color: '#fff', fontSize: '1.35rem' }));
        return box;
      }
    };
  }
})(typeof window !== 'undefined' ? window : global);
