import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useClock, useTodayKey } from '../../date/clock';
import { compareKeys, dateKeyInZone, minutesInZone, type DateKey } from '../../date/localDate';
import { periodRange } from '../../domain/stats';
import { useProfile } from '../../storage/StorageProvider';
import { latestReadyAnchor, type ReportKind } from './reportModel';

/**
 * "Your report is ready" inbox. A weekly report lands on the week's last day
 * at 6 pm (Sunday night by default) and a monthly one on the month's last
 * day, and each stays new until opened. Seen keys are a per-browser
 * convenience kept in localStorage; losing them only re-shows a badge.
 */

const KEY = 'pog.reportsSeen';
const EVENT = 'pog:reports-seen';
const MAX_KEYS = 40;

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

let cache: string[] | null = null;
function snapshot(): string {
  cache ??= readSeen();
  return cache.join('|');
}

function subscribe(cb: () => void) {
  const onChange = () => {
    cache = null;
    cb();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function reportKey(kind: ReportKind, anchor: DateKey): string {
  return `${kind}:${kind === 'month' ? anchor.slice(0, 7) : anchor}`;
}

export function markReportSeen(key: string) {
  const seen = readSeen();
  if (seen.includes(key)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen, key].slice(-MAX_KEYS)));
  } catch {
    // Storage blocked (private mode): the badge simply shows again next time.
  }
  window.dispatchEvent(new Event(EVENT));
}

function useMinutesNow(timeZone: string): number {
  const clock = useClock();
  const [minutes, setMinutes] = useState(() => minutesInZone(clock.now(), timeZone));
  useEffect(() => {
    const id = window.setInterval(() => setMinutes(minutesInZone(clock.now(), timeZone)), 60_000);
    return () => window.clearInterval(id);
  }, [clock, timeZone]);
  return minutes;
}

export interface ReportInbox {
  week: { anchor: DateKey; key: string; isNew: boolean };
  month: { anchor: DateKey; key: string; isNew: boolean };
  unseen: number;
  markSeen: (key: string) => void;
  minutesNow: number;
  today: DateKey;
}

export function useReportInbox(): ReportInbox {
  const profile = useProfile();
  const today = useTodayKey(profile.timeZone);
  const minutesNow = useMinutesNow(profile.timeZone);
  const seen = useSyncExternalStore(subscribe, snapshot, () => '').split('|');
  const weekStart = profile.weekStart ?? 'monday';
  const weekAnchor = latestReadyAnchor('week', today, weekStart, minutesNow);
  const monthAnchor = latestReadyAnchor('month', today, weekStart, minutesNow);
  // A report is new only if the profile existed before its period ended.
  const joined = dateKeyInZone(new Date(profile.createdAt), profile.timeZone);
  const isNew = (kind: ReportKind, anchor: DateKey, key: string) => !seen.includes(key) && compareKeys(joined, periodRange(kind, anchor, weekStart).end) <= 0;
  const weekKey = reportKey('week', weekAnchor);
  const monthKey = reportKey('month', monthAnchor);
  const week = { anchor: weekAnchor, key: weekKey, isNew: isNew('week', weekAnchor, weekKey) };
  const month = { anchor: monthAnchor, key: monthKey, isNew: isNew('month', monthAnchor, monthKey) };
  const markSeen = useCallback((key: string) => markReportSeen(key), []);
  return { week, month, unseen: Number(week.isNew) + Number(month.isNew), markSeen, minutesNow, today };
}
