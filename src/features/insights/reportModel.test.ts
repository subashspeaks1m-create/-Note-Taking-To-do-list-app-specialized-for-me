import { describe, expect, it } from 'vitest';
import type { Task } from '../../domain/models';
import { buildReport, isReportReady, latestReadyAnchor } from './reportModel';

let n = 0;
const done = (d: string) => ({ id: `t${n++}`, status: 'completed', completionLocalDate: d, scheduledDate: d, category: 'doing', deletedAt: null, seriesId: null }) as unknown as Task;
const src = (tasks: Task[]) => ({ tasks, entries: [], updates: [], moves: [] });

describe('weekly and monthly reports', () => {
  it('is ready from 6 pm on the last day', () => {
    const week = { start: '2026-10-05', end: '2026-10-11' };
    expect(isReportReady(week, '2026-10-11', 17 * 60 + 59)).toBe(false);
    expect(isReportReady(week, '2026-10-11', 18 * 60)).toBe(true);
    expect(isReportReady(week, '2026-10-12', 0)).toBe(true);
    expect(latestReadyAnchor('week', '2026-10-08', 'monday', 600)).toBe('2026-09-28');
    expect(latestReadyAnchor('month', '2026-11-01', 'monday', 0)).toBe('2026-10-01');
  });

  it('builds growth, streak breaks and the comparison with last week', () => {
    const r = buildReport(src([done('2026-10-05'), done('2026-10-06'), done('2026-10-08'), done('2026-09-29')]), 'week', '2026-10-07', '2026-10-09', 'monday', 600);
    expect(r.range).toEqual({ start: '2026-10-05', end: '2026-10-11' });
    expect(r.growth).toEqual([1, 2, 2, 3, 3, null, null]);
    expect(r.prevGrowth.at(-1)).toBe(1);
    expect(r.streakBreaks).toBe(1); // Oct 7 ended a run; an empty today is not a break yet
    expect(r.bestStreakInPeriod).toBe(2);
    expect(r.finished).toBe(false);
    expect(r.ready).toBe(false);
  });
});
