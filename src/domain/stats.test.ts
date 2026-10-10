import { describe, expect, it } from 'vitest';
import type { GoalUpdate, JournalEntry, Task, TaskMove } from './models';
import { compareToDate, consistency, periodRange, periodStats, personalBests, qualifyingDays } from './stats';

let n = 0;
function task(p: Partial<Task>): Task {
  return {
    id: `t${n++}`, seriesId: null, occurrenceDate: null, scheduledDate: null, originalScheduledDate: null, title: 'T', details: '', category: 'doing', priority: 0, effort: 'standard',
    dueTime: null, estimatedMinutes: null, tags: [], goalIds: [], status: 'todo', rank: 0, createdAt: '', updatedAt: '', completedAt: null, completionLocalDate: null,
    completionTimezone: null, award: null, deletedAt: null, revision: 1, ...p,
  } as Task;
}
const done = (d: string, p: Partial<Task> = {}) => task({ status: 'completed', completionLocalDate: d, scheduledDate: d, ...p });
function entry(d: string, p: Partial<JournalEntry> = {}): JournalEntry {
  return { id: `e${n++}`, dateKey: d, kind: 'learning', plainText: 'Learned a thing', documentedAt: '2026-10-01T00:00:00Z', deletedAt: null, taskIds: [], goalIds: [], tags: [], pinned: false, title: '', ...p } as unknown as JournalEntry;
}
const src = (tasks: Task[], entries: JournalEntry[] = [], updates: GoalUpdate[] = [], moves: TaskMove[] = []) => ({ tasks, entries, updates, moves });

describe('stats', () => {
  it('counts only completed tasks and documented nonblank entries as qualifying, never future ones', () => {
    const q = qualifyingDays(src([done('2026-10-08'), task({ scheduledDate: '2026-10-07' }), done('2026-10-12')], [entry('2026-10-09'), entry('2026-10-06', { documentedAt: null }), entry('2026-10-05', { plainText: '  ' })]), '2026-10-10');
    expect([...q.combined].sort()).toEqual(['2026-10-08', '2026-10-09']);
    expect([...q.learning]).toEqual(['2026-10-09']);
    expect([...q.doing]).toEqual(['2026-10-08']);
  });

  it('keeps the streak alive in the morning and counts N of 7', () => {
    const c = consistency(src([done('2026-10-07'), done('2026-10-08'), done('2026-10-09'), done('2026-10-03')]), '2026-10-10', 'monday');
    expect(c.streak).toMatchObject({ current: 3, activeToday: false });
    expect(c.last7).toBe(3);
    expect(c.thisWeek).toBe(3); // Mon Oct 5 .. Sat Oct 10
    expect(c.thisWeekElapsed).toBe(6);
  });

  it('defines completion rate over scheduled, noncanceled tasks and finds mistakes', () => {
    const week = periodRange('week', '2026-10-07', 'monday');
    const s = periodStats(
      src(
        [done('2026-10-05'), task({ scheduledDate: '2026-10-06' }), task({ scheduledDate: '2026-10-06', status: 'canceled' }), task({ scheduledDate: '2026-10-07', seriesId: 's1', title: 'Calls' }), task({ scheduledDate: '2026-10-09', seriesId: 's1' })],
        [],
        [],
        [{ id: 'm', taskId: 'x', fromDate: '2026-10-06', toDate: '2026-10-07', occurredAt: '', reason: 'carry-over' }],
      ),
      week,
      '2026-10-08',
    );
    expect(s.scheduled).toBe(4);
    expect(s.completionRate).toBe(0.25);
    expect(s.missedHabits.map((m) => m.date)).toEqual(['2026-10-07']); // Oct 9 has not happened yet
    expect(s.stillOpen).toBe(1);
    expect(s.carriedOver).toBe(1);
    expect(s.elapsedDays).toBe(4);
  });

  it('compares the same stretch of last week, not the whole week', () => {
    const c = compareToDate(src([done('2026-10-05'), done('2026-09-28'), done('2026-10-01')]), 'week', '2026-10-05', 'monday');
    expect(c.completed).toMatchObject({ now: 1, before: 1, direction: 'same' });
  });

  it('finds personal bests', () => {
    const b = personalBests(src([done('2026-10-01'), done('2026-10-01'), done('2026-10-08')], [entry('2026-10-01')]), '2026-10-10', 'monday');
    expect(b.bestDay).toEqual({ date: '2026-10-01', points: 3 });
    expect(b.bestWeek).toEqual({ start: '2026-09-28', completed: 2 });
    expect(b.totalDocumented).toBe(1);
  });
});
