import { asset } from './asset';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Per-device display preferences (layout, motion, density). These are view
 * state, not personal records, so they live in localStorage and the app works
 * normally if storage is unavailable.
 */
export interface DisplayPrefs {
  railCollapsed: boolean;
  headerCollapsed: boolean;
  splitRatio: number; // task pane share of the workbench, 0.3–0.6
  density: 'spacious' | 'compact';
  motion: 'system' | 'full' | 'reduced';
  lowGraphics: boolean;
  avatarPlayback: 'auto' | 'still';
  stageBannerDismissed: boolean;
}

const DEFAULTS: DisplayPrefs = {
  railCollapsed: false,
  headerCollapsed: false,
  splitRatio: 0.43,
  density: 'spacious',
  motion: 'system',
  lowGraphics: false,
  avatarPlayback: 'auto',
  stageBannerDismissed: false,
};

const KEY = 'pog.display.v1';

function load(): DisplayPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<DisplayPrefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

interface Ctx {
  prefs: DisplayPrefs;
  setPref: <K extends keyof DisplayPrefs>(key: K, value: DisplayPrefs[K]) => void;
}

const DisplayPrefsContext = createContext<Ctx | null>(null);

export function DisplayPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<DisplayPrefs>(load);

  const setPref = useCallback<Ctx['setPref']>((key, value) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Display preferences are a convenience; ignore storage failures.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.density = prefs.density;
    if (prefs.motion === 'system') delete root.dataset.motion;
    else root.dataset.motion = prefs.motion;
    root.dataset.graphics = prefs.lowGraphics ? 'low' : 'full';
    root.style.setProperty('--atmosphere', `url("${asset('/assets/ui/atmosphere.svg')}")`);
  }, [prefs.density, prefs.motion, prefs.lowGraphics]);

  const value = useMemo(() => ({ prefs, setPref }), [prefs, setPref]);
  return <DisplayPrefsContext.Provider value={value}>{children}</DisplayPrefsContext.Provider>;
}

export function useDisplayPrefs(): Ctx {
  const ctx = useContext(DisplayPrefsContext);
  if (!ctx) throw new Error('useDisplayPrefs outside provider');
  return ctx;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** True when motion should be minimized, from the OS setting or the in-app override. */
export function useReducedMotion(): boolean {
  const { prefs } = useDisplayPrefs();
  const systemReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  if (prefs.motion === 'reduced') return true;
  if (prefs.motion === 'full') return false;
  return systemReduced;
}

export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 899px)');
}

export { useMediaQuery };
