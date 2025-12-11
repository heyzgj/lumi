let __dockThemeMode = 'light'; // 'light' | 'dark'

export function setDockThemeMode(mode = 'auto') {
  // Normalize to explicit light/dark; treat legacy 'auto' as light.
  __dockThemeMode = (mode === 'dark') ? 'dark' : 'light';
  try {
    const root = document.documentElement;
    if (__dockThemeMode === 'dark') {
      root.classList.add('dark-dock');
    } else {
      root.classList.remove('dark-dock');
    }
  } catch (_) {}
  return __dockThemeMode;
}
