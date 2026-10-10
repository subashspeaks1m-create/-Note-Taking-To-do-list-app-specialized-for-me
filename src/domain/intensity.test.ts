import { describe, expect, it } from 'vitest';
import { dayActivity, levelFor } from './intensity';

const done = (d: string) => ({ status: 'completed' as const, completionLocalDate: d, deletedAt: null });

describe('day intensity', () => {
  it('maps points to levels', () => {
    expect([0, 1, 2, 3, 5, 6, 20].map(levelFor)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it('counts finished tasks, entries and goal logs on their own day', () => {
    const map = dayActivity({
      tasks: [done('2026-10-20'), done('2026-10-20'), { status: 'todo', completionLocalDate: null, deletedAt: null }, { ...done('2026-10-20'), deletedAt: '2026-10-21T00:00:00Z' }],
      entries: [{ dateKey: '2026-10-20', deletedAt: null }, { dateKey: '2026-10-21', deletedAt: null }],
      updates: [
        { dateKey: '2026-10-20', kind: 'value', previous: 0, note: '' },
        { dateKey: '2026-10-20', kind: 'status', previous: null, note: '' },
        { dateKey: '2026-10-20', kind: 'value', previous: null, note: 'Starting point' },
      ],
    });
    expect(map.get('2026-10-20')).toMatchObject({ completed: 2, entries: 1, goalLogs: 1, points: 4, level: 2 });
    expect(map.get('2026-10-21')).toMatchObject({ points: 1, level: 1 });
    expect(map.has('2026-10-22')).toBe(false);
  });
});
