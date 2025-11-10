let __dockThemeMode = 'auto'; // 'auto' | 'light' | 'dark'

export function applyDockThemeAuto() {
  try {
    if (__dockThemeMode !== 'auto') return; // respect manual override
    const parseRGB = (str) => {
      if (!str) return null;
      const m = String(str).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
    };
    const luminance = ([r, g, b]) => {
      const s = [r, g, b]
        .map((v) => v / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
    };
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const rgb = parseRGB(bodyBg);
    const preferDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const isDark = rgb ? luminance(rgb) < 0.5 : preferDark;
    document.documentElement.classList.toggle('dark-dock', !!isDark);
  } catch (_) {
    // best effort only
  }
}

export function watchDockTheme() {
  try {
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', () => { if (__dockThemeMode === 'auto') applyDockThemeAuto(); });
      } else if (typeof mq.addListener === 'function') {
        mq.addListener(() => { if (__dockThemeMode === 'auto') applyDockThemeAuto(); });
      }
    }
    const ro = new MutationObserver(() => { if (__dockThemeMode === 'auto') applyDockThemeAuto(); });
    ro.observe(document.documentElement, { attributes: true, attributeFilter: ['class'], subtree: false });
    // Also watch body style changes that could flip background dramatically
    const bo = new MutationObserver(() => { if (__dockThemeMode === 'auto') applyDockThemeAuto(); });
    bo.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
  } catch (_) {}
}

export function setDockThemeMode(mode = 'auto') {
  __dockThemeMode = (mode === 'dark' || mode === 'light') ? mode : 'auto';
  if (__dockThemeMode === 'dark') {
    try { document.documentElement.classList.add('dark-dock'); } catch (_) {}
    return 'dark';
  }
  if (__dockThemeMode === 'light') {
    try { document.documentElement.classList.remove('dark-dock'); } catch (_) {}
    return 'light';
  }
  applyDockThemeAuto();
  return 'auto';
}
