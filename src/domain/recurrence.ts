import { addDays, compareKeys, dayOfWeek, diffDays, parseKey, startOfWeek, type DateKey } from '../date/localDate';
import type { RecurrenceRule, TaskSeries } from './models';

/**
 * Recurrence works on calendar dates in the profile's time zone. Each date a
 * series lands on becomes one task occurrence, stored with a unique
 * (seriesId, occurrenceDate) pair, so regenerating never duplicates.
 *
 * Missed-day policy: an occurrence that passes without completion stays on its
 * own date. It is not carried into later days or counted as overdue, so a
 * daily habit never piles up a backlog.
 */

/** How far ahead occurrences may be generated, in days. */
export const RECURRENCE_HORIZON_DAYS = 400;

export function occursOn(rule: RecurrenceRule, startDate: DateKey, date: DateKey): boolean {
  const offset = diffDays(startDate, date);
  if (offset < 0) return false;
  const interval = Math.max(1, Math.floor(rule.interval));
  switch (rule.freq) {
    case 'daily':
      return offset % interval === 0;
    case 'weekly': {
      if (!rule.byWeekday.includes(dayOfWeek(date))) return false;
      const weeks = Math.floor(diffDays(startOfWeek(startDate, 'monday'), startOfWeek(date, 'monday')) / 7);
      return weeks % interval === 0;
    }
    case 'monthly': {
      const s = parseKey(startDate);
      const d = parseKey(date);
      const months = (d.year - s.year) * 12 + (d.month - s.month);
      if (months % interval !== 0) return false;
      // A 31st-of-month rule lands on the last day of shorter months.
      const lastDay = new Date(Date.UTC(d.year, d.month, 0)).getUTCDate();
      return d.day === Math.min(rule.byMonthDay, lastDay);
    }
  }
}

export function seriesOccursOn(series: TaskSeries, date: DateKey): boolean {
  if (series.endDate && compareKeys(date, series.endDate) > 0) return false;
  return occursOn(series.rule, series.startDate, date);
}

/** Dates in [from, to] (inclusive) where the series has an occurrence. */
export function occurrenceDates(series: TaskSeries, from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  const span = diffDays(from, to);
  for (let i = 0; i <= span && i <= RECURRENCE_HORIZON_DAYS; i++) {
    const d = addDays(from, i);
    if (seriesOccursOn(series, d)) out.push(d);
  }
  return out;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeRule(rule: RecurrenceRule): string {
  const every = (n: number, unit: string) => (n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`);
  switch (rule.freq) {
    case 'daily':
      return every(rule.interval, 'day');
    case 'weekly': {
      const days = [...rule.byWeekday].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      const weekdays = days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d));
      const label = weekdays ? 'weekdays' : days.map((d) => WEEKDAY_SHORT[d]).join(', ');
      return `${every(rule.interval, 'week')} on ${label}`;
    }
    case 'monthly':
      return `${every(rule.interval, 'month')} on day ${rule.byMonthDay}`;
  }
}
