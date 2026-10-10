import { addDays, compareKeys, diffDays, type DateKey, type WeekStart } from '../../date/localDate';
import { computeStreak } from '../../domain/goals';
import { periodRange, periodStats, previousRange, qualifyingDays, type ActivitySource, type DateRange, type PeriodStats } from '../../domain/stats';

export type ReportKind = 'week' | 'month';

/** Reports are "ready" from this local time on the period's last day (Sunday night, end of month). */
export const REPORT_READY_MINUTES = 18 * 60;

export interface Report {
  kind: ReportKind;
  range: DateRange;
  previous: DateRange;
  stats: PeriodStats;
  prevStats: PeriodStats;
  /** Cumulative points per day, for the growth line. Future days are null. */
  growth: (number | null)[];
  prevGrowth: number[];
  /** Times an active run ended inside this period. */
  streakBreaks: number;
  /** Streak as of the period's last elapsed day. */
  streakAtEnd: number;
  bestStreakInPeriod: number;
  ready: boolean;
  finished: boolean;
}

export function isReportReady(range: DateRange, today: DateKey, minutesNow: number): boolean {
  const c = compareKeys(today, range.end);
  return c > 0 || (c === 0 && minutesNow >= REPORT_READY_MINUTES);
}

function cumulative(stats: PeriodStats, range: DateRange, upTo: DateKey | null): (number | null)[] {
  const days = diffDays(range.start, range.end) + 1;
  const out: (number | null)[] = [];
  let total = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(range.start, i);
    if (upTo && compareKeys(d, upTo) > 0) {
      out.push(null);
      continue;
    }
    total += stats.perDay.get(d)?.points ?? 0;
    out.push(total);
  }
  return out;
}

export function buildReport(src: ActivitySource, kind: ReportKind, anchor: DateKey, today: DateKey, weekStart: WeekStart, minutesNow: number): Report {
  const range = periodRange(kind, anchor, weekStart);
  const previous = previousRange(kind, range, weekStart);
  const stats = periodStats(src, range, today);
  const prevStats = periodStats(src, previous, today);
  const finished = compareKeys(today, range.end) > 0;
  const lastDay = finished ? range.end : today;

  const active = qualifyingDays(src, today).combined;
  let streakBreaks = 0;
  let run = 0;
  let bestStreakInPeriod = 0;
  const yesterday = addDays(today, -1);
  for (let d = range.start; compareKeys(d, lastDay) <= 0; d = addDays(d, 1)) {
    if (active.has(d)) {
      run++;
      bestStreakInPeriod = Math.max(bestStreakInPeriod, run);
    } else {
      // Today isn't over, so an empty today is not a break yet.
      if (compareKeys(d, yesterday) <= 0 && active.has(addDays(d, -1))) streakBreaks++;
      run = 0;
    }
  }

  return {
    kind,
    range,
    previous,
    stats,
    prevStats,
    growth: cumulative(stats, range, compareKeys(today, range.start) < 0 ? range.start : lastDay),
    prevGrowth: cumulative(prevStats, previous, null) as number[],
    streakBreaks,
    streakAtEnd: computeStreak(active, lastDay).current,
    bestStreakInPeriod,
    ready: isReportReady(range, today, minutesNow),
    finished,
  };
}

/** The newest report that is ready: this period if it is ready now, otherwise the last one. */
export function latestReadyAnchor(kind: ReportKind, today: DateKey, weekStart: WeekStart, minutesNow: number): DateKey {
  const current = periodRange(kind, today, weekStart);
  if (isReportReady(current, today, minutesNow)) return current.start;
  return previousRange(kind, current, weekStart).start;
}
