import { useEffect, useState } from 'react';
import { customColors, seedById } from './color';
import { usePrefs } from './store';

interface ThemeElement extends HTMLElement {
  color: string; scheme: string; variant: string; contrast: string; motion: string;
}

/** Whether the dashboard is in dark mode (the theme setting, or the device when it is on automatic). */
export function useIsDark() {
  const theme = usePrefs(s => s.theme);
  const [sysDark, setSysDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return theme === 'dark' || (theme === 'auto' && sysDark);
}

/** Feeds the user's choices to <m3e-theme>, which generates every Material 3 colour from them. */
export function useApplyTheme() {
  const { seed, colorStyle, contrast, expressive } = usePrefs();
  const dark = useIsDark();
  useEffect(() => {
    const el = document.getElementById('theme') as ThemeElement | null;
    if (!el) return;
    el.color = seedById(seed).hex;
    el.scheme = dark ? 'dark' : 'light';
    el.variant = colorStyle;
    el.contrast = contrast;
    el.motion = expressive ? 'expressive' : 'standard';
    for (const [k, v] of Object.entries(customColors(dark))) el.style.setProperty(k, v);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    // the browser's address bar follows the page colour
    requestAnimationFrame(() => document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.body).backgroundColor));
  }, [seed, colorStyle, contrast, expressive, dark]);
  return dark;
}
