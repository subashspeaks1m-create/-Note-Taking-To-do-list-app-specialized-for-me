import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dateKeyInZone, type DateKey } from './localDate';

/** Testable source of "now". Business rules never call `new Date()` directly. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** A clock frozen at, or offset from, a given instant. Used by tests and the `?now=` dev override. */
export function fixedOffsetClock(start: Date, realStart = Date.now()): Clock {
  const offset = start.getTime() - realStart;
  return { now: () => new Date(Date.now() + offset) };
}

/**
 * In development builds, `?now=2026-12-31T10:00:00+05:30` simulates another
 * moment so date boundaries can be checked by hand. Production ignores it.
 */
function clockFromLocation(): Clock {
  if (!import.meta.env.DEV || typeof window === 'undefined') return systemClock;
  const raw = new URLSearchParams(window.location.search).get('now');
  if (!raw) return systemClock;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? systemClock : fixedOffsetClock(parsed);
}

const ClockContext = createContext<Clock>(systemClock);

export function ClockProvider({ clock, children }: { clock?: Clock; children: ReactNode }) {
  const value = useMemo(() => clock ?? clockFromLocation(), [clock]);
  return <ClockContext.Provider value={value}>{children}</ClockContext.Provider>;
}

export function useClock(): Clock {
  return useContext(ClockContext);
}

/** Today's local date key in the given zone; re-renders when the local day changes. */
export function useTodayKey(timeZone: string): DateKey {
  const clock = useClock();
  const [today, setToday] = useState(() => dateKeyInZone(clock.now(), timeZone));
  useEffect(() => {
    const check = () => setToday(dateKeyInZone(clock.now(), timeZone));
    check();
    const id = window.setInterval(check, 20_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, [clock, timeZone]);
  return today;
}
