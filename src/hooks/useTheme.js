// src/hooks/useTheme.js
// Manual light/dark/system toggle -- 'system' follows the OS setting
// live (via a matchMedia listener), 'light'/'dark' pin it regardless.
// Applies a `dark` class to <html> for Tailwind's dark: utilities, and
// a `light` class specifically to override the CSS custom properties'
// own @media (prefers-color-scheme: dark) block when the OS prefers
// dark but the user has explicitly chosen light (see index.css).
//
// index.html runs the same resolution synchronously before React mounts
// (kept in sync by hand, not imported, since it has to run before any
// JS bundle loads) so there's no flash of the wrong theme on page load.
import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'safebite-theme';

function systemPrefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function applyTheme(pref) {
  const root = document.documentElement;
  const resolvedDark = pref === 'dark' || (pref === 'system' && systemPrefersDark());
  root.classList.remove('dark', 'light');
  if (resolvedDark) root.classList.add('dark');
  else if (pref === 'light') root.classList.add('light');
}

export function useTheme() {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'system';
    } catch {
      return 'system';
    }
  });

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private browsing / storage disabled -- theme just won't persist across visits.
    }
  }, [theme]);

  // 'system' should track a live OS change (e.g. sunset auto dark-mode)
  // without needing a page reload.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next) => setThemeState(next), []);

  return { theme, setTheme };
}
