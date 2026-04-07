import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'simplyfiles-theme';
const MODES = ['auto', 'light', 'dark'];

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(mode) {
  return mode === 'auto' ? getSystemTheme() : mode;
}

export function useTheme() {
  const [mode, setModeState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return MODES.includes(saved) ? saved : 'auto';
  });

  const applyTheme = useCallback((m) => {
    document.documentElement.setAttribute('data-theme', resolveTheme(m));
  }, []);

  // Apply on mount and mode change
  useEffect(() => {
    applyTheme(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode, applyTheme]);

  // Listen for system theme changes when in auto mode
  useEffect(() => {
    if (mode !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('auto');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode, applyTheme]);

  const cycleTheme = useCallback(() => {
    setModeState(prev => {
      const idx = MODES.indexOf(prev);
      return MODES[(idx + 1) % MODES.length];
    });
  }, []);

  return { mode, cycleTheme };
}
