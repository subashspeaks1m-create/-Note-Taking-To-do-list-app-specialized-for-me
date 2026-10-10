import { describe, expect, it } from 'vitest';
import {
  addDays, addMonths, dateKeyInZone, dayOfWeek, diffDays, fromDayNumber, dayNumber,
  isDateKey, startOfWeek, formatLong,
} from './localDate';

describe('calendar arithmetic', () => {
  it('round-trips day numbers across centuries', () => {
    for (const key of ['1970-01-01', '2000-02-29', '2026-10-10', '2036-10-10', '2100-03-01', '1899-12-31']) {
      expect(fromDayNumber(dayNumber(key))).toBe(key);
    }
  });
  it('counts calendar days, including leap days', () => {
    expect(diffDays('2026-10-10', '2027-10-10')).toBe(365);
    expect(diffDays('2026-10-10', '2036-10-10')).toBe(3653); // 2028, 2032, 2036 leap days
    expect(diffDays('2026-10-10', '2026-12-31')).toBe(82);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('clamps month addition to the month length', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-10-10', 12)).toBe('2027-10-10');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
  });
  it('knows weekdays and week starts', () => {
    expect(dayOfWeek('2026-10-10')).toBe(6); // Saturday
    expect(startOfWeek('2026-10-10', 'monday')).toBe('2026-10-05');
    expect(startOfWeek('2026-10-10', 'sunday')).toBe('2026-10-04');
    expect(startOfWeek('2026-10-05', 'monday')).toBe('2026-10-05');
  });
  it('validates keys', () => {
    expect(isDateKey('2026-02-29')).toBe(false);
    expect(isDateKey('2028-02-29')).toBe(true);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('26-1-1')).toBe(false);
  });
  it('formats without shifting the day', () => {
    expect(formatLong('2026-10-10')).toBe('Saturday, October 10, 2026');
  });
});

describe('local date in a time zone', () => {
  it('uses the profile zone, not UTC', () => {
    // 2026-10-09 19:00 UTC is already Oct 10 00:30 in Kolkata.
    const instant = new Date('2026-10-09T19:00:00Z');
    expect(dateKeyInZone(instant, 'Asia/Kolkata')).toBe('2026-10-10');
    expect(dateKeyInZone(instant, 'UTC')).toBe('2026-10-09');
  });
  it('handles a DST transition with calendar math', () => {
    // US spring-forward 2027-03-14: the local day is 23 hours long, still one calendar day.
    const before = dateKeyInZone(new Date('2027-03-14T06:30:00Z'), 'America/New_York');
    const after = dateKeyInZone(new Date('2027-03-15T05:30:00Z'), 'America/New_York');
    expect(before).toBe('2027-03-14');
    expect(after).toBe('2027-03-15');
    expect(diffDays(before, after)).toBe(1);
  });
});
