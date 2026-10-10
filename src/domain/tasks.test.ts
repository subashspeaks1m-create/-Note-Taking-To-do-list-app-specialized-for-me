import { describe, expect, it } from 'vitest';
import type { Task, TaskSeries } from './models';
import { occurrenceDates, occursOn, describeRule } from './recurrence';
import { normalizeTitle, parseBulkLines, rankBetween, withStatus } from './tasks';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1', seriesId: null, occurrenceDate: null, scheduledDate: '2026-10-10', originalScheduledDate: '2026-10-10',
    title: 'Read one chapter', details: '', category: 'learning', priority: 0, effort: 'standard', dueTime: null,
    estimatedMinutes: null, tags: [], goalIds: [], status: 'todo', rank: 1, createdAt: '2026-10-10T04:00:00.000Z',
    updatedAt: '2026-10-10T04:00:00.000Z', completedAt: null, completionLocalDate: null, completionTimezone: null,
    award: null, deletedAt: null, revision: 1, ...overrides,
  };
}

describe('task titles and bulk paste', () => {
  it('keeps titles to one trimmed line of at most 200 characters', () => {
    expect(normalizeTitle('  Read   one\nchapter ')).toBe('Read one chapter');
    expect(() => normalizeTitle('   ')).toThrow(/needs a title/);
    expect(() => normalizeTitle('x'.repeat(201))).toThrow(/200/);
    expect(normalizeTitle('x'.repeat(200))).toHaveLength(200);
  });
  it('makes one task per nonblank line and explains bad lines', () => {
    const lines = parseBulkLines('Read one chapter\n\n  - Ship the settings screen\n[ ] Walk 5 km\n' + 'y'.repeat(250));
    expect(lines.map((l) => l.title).slice(0, 3)).toEqual(['Read one chapter', 'Ship the settings screen', 'Walk 5 km']);
    expect(lines.filter((l) => !l.error)).toHaveLength(3);
    expect(lines[3]!.error).toMatch(/200/);
    expect(lines[3]!.line).toBe(5);
  });
});

describe('completion snapshot', () => {
  const tz = 'Asia/Kolkata';
  it('freezes the award on first completion, in the profile time zone', () => {
    const done = withStatus(task(), 'completed', new Date('2026-10-10T19:00:00Z'), tz); // Oct 11 00:30 IST
    expect(done.completionLocalDate).toBe('2026-10-11');
    expect(done.award).toMatchObject({ nominalXp: 20, category: 'learning', earnedDate: '2026-10-11' });
  });
  it('cannot farm or inflate rewards by reopening and editing', () => {
    let t = task();
    t = withStatus(t, 'completed', new Date('2026-10-10T05:00:00Z'), tz);
    const award = t.award;
    for (let i = 0; i < 10; i++) {
      t = withStatus(t, 'todo', new Date('2026-10-12T05:00:00Z'), tz);
      t = { ...t, effort: 'deep' };
      t = withStatus(t, 'completed', new Date('2026-10-12T06:00:00Z'), tz);
    }
    expect(t.award).toEqual(award);
    expect(t.award!.earnedDate).toBe('2026-10-10');
    expect(t.completionLocalDate).toBe('2026-10-12');
  });
  it('clears completion fields on reopen', () => {
    const reopened = withStatus(withStatus(task(), 'completed', new Date(), tz), 'todo', new Date(), tz);
    expect(reopened.completedAt).toBeNull();
    expect(reopened.status).toBe('todo');
  });
});

describe('ranks', () => {
  it('places items between neighbors', () => {
    expect(rankBetween(null, null)).toBe(1);
    expect(rankBetween(2, null)).toBe(3);
    expect(rankBetween(null, 2)).toBe(1);
    expect(rankBetween(1, 2)).toBe(1.5);
  });
});

describe('recurrence', () => {
  const base: TaskSeries = {
    id: 's1', title: 'Practice', details: '', category: 'learning', effort: 'small', priority: 0, dueTime: null,
    estimatedMinutes: null, tags: [], goalIds: [], rule: { freq: 'daily', interval: 1 }, startDate: '2026-10-10',
    endDate: null, createdAt: '', updatedAt: '', stoppedAt: null,
  };
  it('daily makes exactly one date per day from the start', () => {
    expect(occurrenceDates(base, '2026-10-08', '2026-10-14')).toEqual([
      '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14',
    ]);
  });
  it('every other day and end dates', () => {
    const s = { ...base, rule: { freq: 'daily' as const, interval: 2 }, endDate: '2026-10-15' };
    expect(occurrenceDates(s, '2026-10-10', '2026-10-20')).toEqual(['2026-10-10', '2026-10-12', '2026-10-14']);
  });
  it('weekly on chosen weekdays', () => {
    const s = { ...base, rule: { freq: 'weekly' as const, interval: 1, byWeekday: [1, 3, 5] } };
    expect(occurrenceDates(s, '2026-10-10', '2026-10-18')).toEqual(['2026-10-12', '2026-10-14', '2026-10-16']);
    expect(describeRule({ freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] })).toBe('Every week on weekdays');
  });
  it('monthly on the 31st lands on the last day of short months', () => {
    expect(occursOn({ freq: 'monthly', interval: 1, byMonthDay: 31 }, '2026-10-31', '2026-11-30')).toBe(true);
    expect(occursOn({ freq: 'monthly', interval: 1, byMonthDay: 31 }, '2026-10-31', '2027-02-28')).toBe(true);
    expect(occursOn({ freq: 'monthly', interval: 1, byMonthDay: 31 }, '2026-10-31', '2026-11-29')).toBe(false);
  });
});
