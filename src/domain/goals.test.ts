import { describe, expect, it } from 'vitest';
import type { Goal, Milestone, Task } from './models';
import { computeStreak, dailyNeeded, descendantIds, formatAmount, goalActivityDates, goalPace, goalProgress, planAchievement, wouldCreateCycle } from './goals';

const goal = (patch: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  planId: 'p1',
  periodDirectionId: null,
  parentId: null,
  title: 'Make $1,000,000',
  why: '',
  category: 'doing',
  domain: 'Money',
  measurementMode: 'numeric',
  target: 1_000_000,
  current: 250_000,
  unit: '$',
  status: 'active',
  reviewDate: null,
  notes: '',
  sealedReward: '',
  achievedAt: null,
  rank: 1,
  createdAt: '',
  updatedAt: '',
  ...patch,
});

const task = (id: string, status: Task['status'], patch: Partial<Task> = {}): Task =>
  ({ id, status, deletedAt: null, completionLocalDate: status === 'completed' ? '2026-10-10' : null, ...patch }) as Task;

const ms = (id: string, weight: number, done: boolean, archived = false): Milestone => ({
  id,
  goalId: 'g1',
  title: id,
  weight,
  achievedAt: done ? 'x' : null,
  archivedAt: archived ? 'x' : null,
  rank: 1,
});

describe('goal progress', () => {
  it('numeric: current over target, clamped, with units', () => {
    expect(goalProgress(goal(), [], [])).toEqual({ fraction: 0.25, summary: '$250,000 of $1,000,000' });
    expect(goalProgress(goal({ current: 2_000_000 }), [], []).fraction).toBe(1);
    expect(goalProgress(goal({ target: 0 }), [], []).fraction).toBeNull();
  });

  it('manual: clamps percent and shows no-data honestly', () => {
    expect(goalProgress(goal({ measurementMode: 'manual', current: 140 }), [], []).fraction).toBe(1);
    expect(goalProgress(goal({ measurementMode: 'manual', current: null }), [], []).fraction).toBeNull();
  });

  it('milestones: weighted, ignores archived, empty is not 100%', () => {
    const g = goal({ measurementMode: 'milestones' });
    expect(goalProgress(g, [], []).fraction).toBeNull();
    expect(goalProgress(g, [ms('a', 1, true), ms('b', 3, false), ms('c', 5, true, true)], []).fraction).toBe(0.25);
  });

  it('tasks: counts each task once and skips canceled or deleted', () => {
    const g = goal({ measurementMode: 'tasks' });
    const t1 = task('1', 'completed');
    const tasks = [t1, t1, task('2', 'todo'), task('3', 'canceled'), task('4', 'completed', { deletedAt: 'x' })];
    expect(goalProgress(g, [], tasks)).toEqual({ fraction: 0.5, summary: '1 of 2 linked tasks done' });
    expect(goalProgress(g, [], []).fraction).toBeNull();
  });

  it('plan achievement averages only measured goals', () => {
    expect(planAchievement([{ fraction: 0.5, summary: '' }, { fraction: null, summary: '' }, { fraction: 1, summary: '' }])).toEqual({ fraction: 0.75, measured: 2, total: 3 });
    expect(planAchievement([]).fraction).toBeNull();
  });
});

describe('pace', () => {
  const plan = { startDate: '2026-10-10', endDate: '2027-10-10' };
  it('compares achievement with even progress over the plan, never using time as achievement', () => {
    // 73 of 365 days elapsed = 20%.
    expect(goalPace({ fraction: 0.25, summary: '' }, plan, '2026-12-22').state).toBe('on-pace');
    expect(goalPace({ fraction: 0.4, summary: '' }, plan, '2026-12-22').state).toBe('ahead');
    expect(goalPace({ fraction: 0.05, summary: '' }, plan, '2026-12-22').state).toBe('behind');
    expect(goalPace({ fraction: null, summary: '' }, plan, '2026-12-22').state).toBe('unmeasured');
    expect(goalPace({ fraction: 1, summary: '' }, plan, '2026-12-22').state).toBe('done');
  });

  it('works out the daily amount still needed', () => {
    expect(dailyNeeded(goal(), { endDate: '2027-10-10' }, '2026-10-10')).toBeCloseTo(750_000 / 365);
    expect(dailyNeeded(goal({ measurementMode: 'manual' }), { endDate: '2027-10-10' }, '2026-10-10')).toBeNull();
  });
});

describe('streaks', () => {
  it('counts the run ending today, or ending yesterday before today qualifies', () => {
    expect(computeStreak(['2026-10-08', '2026-10-09', '2026-10-10'], '2026-10-10')).toEqual({ current: 3, longest: 3, activeToday: true });
    expect(computeStreak(['2026-10-08', '2026-10-09'], '2026-10-10')).toEqual({ current: 2, longest: 2, activeToday: false });
    expect(computeStreak(['2026-10-07', '2026-10-08'], '2026-10-10').current).toBe(0);
  });

  it('keeps the longest run separately and ignores future days', () => {
    const s = computeStreak(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-10', '2026-10-11'], '2026-10-10');
    expect(s).toEqual({ current: 1, longest: 4, activeToday: true });
  });

  it('a goal day comes from completed linked tasks, progress logs and documented entries', () => {
    const dates = goalActivityDates({
      tasks: [task('1', 'completed', { completionLocalDate: '2026-10-09' }), task('2', 'todo'), task('3', 'canceled', { completionLocalDate: '2026-10-05' })],
      updates: [{ dateKey: '2026-10-10', kind: 'value' }, { dateKey: '2026-10-01', kind: 'status' }],
      entryDates: ['2026-10-08'],
    });
    expect([...dates].sort()).toEqual(['2026-10-08', '2026-10-09', '2026-10-10']);
  });
});

describe('hierarchy', () => {
  const goals = [goal({ id: 'a' }), goal({ id: 'b', parentId: 'a' }), goal({ id: 'c', parentId: 'b' })];
  it('finds descendants and blocks loops', () => {
    expect([...descendantIds(goals, 'a')].sort()).toEqual(['b', 'c']);
    expect(wouldCreateCycle(goals, 'a', 'c')).toBe(true);
    expect(wouldCreateCycle(goals, 'a', 'a')).toBe(true);
    expect(wouldCreateCycle(goals, 'c', 'a')).toBe(false);
    expect(wouldCreateCycle(goals, 'c', null)).toBe(false);
  });

  it('formats amounts with symbols in front and words after', () => {
    expect(formatAmount(1500, '$')).toBe('$1,500');
    expect(formatAmount(12.5, 'km')).toBe('12.5 km');
    expect(formatAmount(3, '')).toBe('3');
  });
});
