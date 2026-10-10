/**
 * Calendar-date helpers.
 *
 * A DateKey is a local calendar date written as `YYYY-MM-DD`. Date arithmetic
 * here works on whole calendar days (civil day numbers), never on elapsed
 * milliseconds, so daylight-saving shifts and leap days cannot skew results.
 */

export type DateKey = string;

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface CivilDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string') return false;
  const m = KEY_RE.exec(value);
  if (!m) return false;
  const { year, month, day } = { year: +m[1]!, month: +m[2]!, day: +m[3]! };
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function parseKey(key: DateKey): CivilDate {
  const m = KEY_RE.exec(key);
  if (!m) throw new Error(`Invalid date key: ${key}`);
  return { year: +m[1]!, month: +m[2]!, day: +m[3]! };
}

export function toKey({ year, month, day }: CivilDate): DateKey {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}

/** Days since 1970-01-01 for a civil date (Howard Hinnant's algorithm). */
export function dayNumber(key: DateKey): number {
  const { year, month, day } = parseKey(key);
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromDayNumber(n: number): DateKey {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return toKey({ year, month, day });
}

export function addDays(key: DateKey, days: number): DateKey {
  return fromDayNumber(dayNumber(key) + days);
}

/** Calendar difference `b - a` in whole days. */
export function diffDays(a: DateKey, b: DateKey): number {
  return dayNumber(b) - dayNumber(a);
}

export function addMonths(key: DateKey, months: number): DateKey {
  const { year, month, day } = parseKey(key);
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return toKey({ year: y, month: m, day: Math.min(day, daysInMonth(y, m)) });
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(key: DateKey): number {
  return (((dayNumber(key) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

export type WeekStart = 'monday' | 'sunday';

export function startOfWeek(key: DateKey, weekStart: WeekStart): DateKey {
  const dow = dayOfWeek(key);
  const offset = weekStart === 'monday' ? (dow + 6) % 7 : dow;
  return addDays(key, -offset);
}

export function startOfMonth(key: DateKey): DateKey {
  const { year, month } = parseKey(key);
  return toKey({ year, month, day: 1 });
}

export function endOfMonth(key: DateKey): DateKey {
  const { year, month } = parseKey(key);
  return toKey({ year, month, day: daysInMonth(year, month) });
}

export function compareKeys(a: DateKey, b: DateKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The local calendar date of an instant in an IANA time zone. */
export function dateKeyInZone(instant: Date, timeZone: string): DateKey {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Minutes since local midnight for an instant in a zone. */
export function minutesInZone(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

function keyAsUtcDate(key: DateKey): Date {
  const { year, month, day } = parseKey(key);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/** Formats a date key without any time-zone shifting. */
export function formatKey(key: DateKey, options: Intl.DateTimeFormatOptions, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(keyAsUtcDate(key));
}

export const formatLong = (key: DateKey) =>
  formatKey(key, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
export const formatMedium = (key: DateKey) => formatKey(key, { month: 'short', day: 'numeric', year: 'numeric' });
export const formatShort = (key: DateKey) => formatKey(key, { month: 'short', day: 'numeric' });
export const formatMonthYear = (key: DateKey) => formatKey(key, { month: 'long', year: 'numeric' });
export const formatWeekday = (key: DateKey) => formatKey(key, { weekday: 'long' });

export function formatTimeInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(instant);
}

/** Offset of a zone from UTC at an instant, in minutes (e.g. +330 for Asia/Kolkata). */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** The instant when a local wall-clock time occurs on a date in a zone. */
export function zonedTimeToInstant(key: DateKey, minutesOfDay: number, timeZone: string): Date {
  const { year, month, day } = parseKey(key);
  const wall = Date.UTC(year, month - 1, day, 0, minutesOfDay);
  let guess = wall - zoneOffsetMinutes(new Date(wall), timeZone) * 60000;
  // A second pass settles times near a DST change.
  guess = wall - zoneOffsetMinutes(new Date(guess), timeZone) * 60000;
  return new Date(guess);
}

export function minutesToHHMM(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
