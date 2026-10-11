import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../../storage/db';
import { Repository } from '../../storage/repo';
import { buildBoard } from './boardModel';

const TZ = 'Asia/Kolkata';
let db: AppDatabase;
let repo: Repository;

beforeEach(async () => {
  db = new AppDatabase(`board-${crypto.randomUUID()}`);
  repo = new Repository(db, () => new Date('2026-10-10T04:30:00Z'));
  await repo.ensureInitialized();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

const board = async () =>
  buildBoard(
    {
      plans: await db.plans.toArray(),
      goals: await db.goals.toArray(),
      milestones: await db.milestones.toArray(),
      tasks: (await db.tasks.toArray()).filter((t) => !t.deletedAt && t.goalIds.length > 0),
      updates: await db.goalUpdates.toArray(),
      series: await db.taskSeries.toArray(),
      entries: [],
    },
    '2026-10-10',
  );

describe('goal board (acceptance #14)', () => {
  it('completing a linked task moves its goal and parent once, and leaves an unrelated goal alone', async () => {
    const [plan] = await db.plans.toArray();
    const parent = await repo.createGoal({ title: 'Publish a useful tool', planId: plan!.id, measurementMode: 'tasks' }, '2026-10-10');
    const a = await repo.createGoal({ title: 'Build it', planId: plan!.id, parentId: parent.id, measurementMode: 'tasks' }, '2026-10-10');
    const b = await repo.createGoal({ title: 'Ship it', planId: plan!.id, parentId: parent.id, measurementMode: 'tasks' }, '2026-10-10');
    await repo.addMilestone(parent.id, 'First user');
    const money = await repo.createGoal({ title: 'Earn $10,000', planId: plan!.id, measurementMode: 'numeric', target: 10_000, current: 0 }, '2026-10-10');
    // One task linked through both sub-goals, plus one more open task.
    const shared = await repo.addTask({ title: 'Ship the settings screen', category: 'doing', scheduledDate: '2026-10-10', goalIds: [a.id, b.id] });
    await repo.addTask({ title: 'Write the docs', category: 'doing', scheduledDate: '2026-10-10', goalIds: [a.id] });

    let views = (await board()).goalViews;
    expect(views.get(parent.id)!.progress.fraction).toBe(0);

    await repo.setTaskStatus(shared.id, 'completed', TZ);
    views = (await board()).goalViews;
    expect(views.get(parent.id)!.tasks).toHaveLength(2);
    expect(views.get(parent.id)!.progress).toEqual({ fraction: 0.5, summary: '1 of 2 linked tasks done' });
    expect(views.get(a.id)!.progress.fraction).toBe(0.5);
    expect(views.get(b.id)!.progress.fraction).toBe(1);
    expect(views.get(money.id)!.progress.fraction).toBe(0);
  });
});
