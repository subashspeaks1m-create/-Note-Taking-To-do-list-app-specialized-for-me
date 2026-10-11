import { describe, expect, it } from 'vitest';
import type { Task } from './models';
import { chestPlatform, CHEST_PLATFORMS, cosmeticId, earnedBadges, earnedCosmetics, transformationState } from './unlocks';

const task = (over: Partial<Task>): Task => ({
  id: crypto.randomUUID(), seriesId: null, occurrenceDate: null, scheduledDate: '2026-10-10', originalScheduledDate: '2026-10-10',
  title: 't', details: '', category: 'doing', priority: 0, effort: 'standard', dueTime: null, estimatedMinutes: null, tags: [], goalIds: [],
  status: 'completed', rank: 1, createdAt: '', updatedAt: '', completedAt: '2026-10-10T05:00:00Z', completionLocalDate: '2026-10-10',
  completionTimezone: 'Asia/Kolkata', award: null, deletedAt: null, revision: 1, ...over,
});

const stats = { earned: 0, bestStreak: 0, tasksDone: 0, learningEntries: 0, entries: 0 };
const empty = { tasks: [], entries: [], milestones: [], directions: [], plans: [] };

describe('badges', () => {
  it('awards First Step and Balanced Day from completed work only', () => {
    const src = { ...empty, tasks: [task({ category: 'learning' }), task({ category: 'doing' }), task({ status: 'todo', completionLocalDate: null })] };
    const got = earnedBadges(src, { stats, globalLevel: 1, today: '2026-10-10' });
    expect([...got.keys()].sort()).toEqual(['balanced-day', 'first-step']);
  });

  it('never awards Finish Strong for time passing alone', () => {
    const plan = { id: 'p', kind: 'sprint', endDate: '2026-12-31', finishedAt: null } as never;
    expect(earnedBadges({ ...empty, plans: [plan] }, { stats, globalLevel: 1, today: '2027-01-05' }).has('finish-strong')).toBe(false);
  });
});

describe('transformations', () => {
  it('keeps the best form and lights it only while the current streak holds', () => {
    expect(transformationState(35, 3)).toMatchObject({ earned: { id: 'awakened' }, lit: false, next: { id: 'godhead' } });
    expect(transformationState(35, 31).lit).toBe(true);
    expect(transformationState(6, 6).earned).toBeNull();
  });

  it('lists earned forms and platforms as cosmetics', () => {
    const ids = earnedCosmetics(empty, { stats: { ...stats, bestStreak: 30 }, globalLevel: 2, today: '2026-10-10' }, () => false);
    expect(ids).toEqual(expect.arrayContaining([cosmeticId.transformation('spark'), cosmeticId.transformation('awakened'), cosmeticId.platform('orbit-focus')]));
    expect(ids).not.toContain(cosmeticId.transformation('godhead'));
  });
});

describe('chests', () => {
  it('is fixed per goal and prefers platforms not owned yet', () => {
    const a = chestPlatform('goal-a', new Set());
    expect(chestPlatform('goal-a', new Set()).id).toBe(a.id);
    const owned = new Set(CHEST_PLATFORMS.filter((p) => p.id !== 'sunforge').map((p) => cosmeticId.platform(p.id)));
    expect(chestPlatform('goal-a', owned).id).toBe('sunforge');
  });
});
