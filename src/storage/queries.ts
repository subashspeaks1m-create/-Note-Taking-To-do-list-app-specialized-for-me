import { useLiveQuery } from 'dexie-react-hooks';
import { compareKeys, type DateKey } from '../date/localDate';
import type { Goal, GoalUpdate, ID, JournalEntry, Milestone, PeriodDirection, Task, TaskSeries, VisionPlan } from '../domain/models';
import { isOpen } from '../domain/tasks';
import { useStorage } from './StorageProvider';

/** Live queries: they re-run when the data changes, in this tab or another. */

export function useTasksForDate(date: DateKey): Task[] | undefined {
  const { db } = useStorage();
  return useLiveQuery(
    async () => (await db.tasks.where('scheduledDate').equals(date).toArray()).filter((t) => !t.deletedAt).sort((a, b) => a.rank - b.rank),
    [db, date],
  );
}

/**
 * Open one-off tasks scheduled before today, plus unscheduled ones.
 * Missed recurring occurrences stay on their own day (see recurrence.ts).
 */
export function useCarryOverTasks(today: DateKey): Task[] | undefined {
  const { db } = useStorage();
  return useLiveQuery(async () => {
    const open = await db.tasks.where('status').anyOf('todo', 'in-progress').toArray();
    return open
      .filter((t) => isOpen(t) && !t.seriesId && (t.scheduledDate === null || compareKeys(t.scheduledDate, today) < 0))
      .sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? '') || a.rank - b.rank);
  }, [db, today]);
}

export function useEntriesForDate(date: DateKey): JournalEntry[] | undefined {
  const { db } = useStorage();
  return useLiveQuery(
    async () => (await db.entries.where('dateKey').equals(date).toArray()).filter((e) => !e.deletedAt).sort((a, b) => a.happenedAt.localeCompare(b.happenedAt) || a.createdAt.localeCompare(b.createdAt)),
    [db, date],
  );
}

export function useEntry(id: ID | null): JournalEntry | undefined | null {
  const { db } = useStorage();
  return useLiveQuery(async () => (id ? ((await db.entries.get(id)) ?? null) : null), [db, id]);
}

export function useTasksByIds(ids: ID[]): Task[] | undefined {
  const { db } = useStorage();
  const key = ids.join(',');
  return useLiveQuery(async () => (ids.length ? (await db.tasks.bulkGet(ids)).filter((t): t is Task => !!t) : []), [db, key]);
}

export function usePlans(): VisionPlan[] | undefined {
  const { db } = useStorage();
  return useLiveQuery(async () => (await db.plans.toArray()).filter((p) => !p.archivedAt), [db]);
}

export function useAllPlans(): VisionPlan[] | undefined {
  const { db } = useStorage();
  return useLiveQuery(async () => (await db.plans.toArray()).map(withPlanDefaults), [db]);
}

/** Records saved before stage 3 lack the newer text fields. */
export function withPlanDefaults(p: VisionPlan): VisionPlan {
  return { ...p, statement: p.statement ?? '', review: p.review ?? '' };
}

/** Records saved before stage 3 lack the newer goal fields. */
export function withGoalDefaults(g: Goal): Goal {
  return { ...g, domain: g.domain ?? '', sealedReward: g.sealedReward ?? '', achievedAt: g.achievedAt ?? null, rank: g.rank ?? 0 };
}

export interface GoalBoard {
  plans: VisionPlan[];
  goals: Goal[];
  milestones: Milestone[];
  /** Every non-deleted task linked to at least one goal. */
  tasks: Task[];
  updates: GoalUpdate[];
  series: TaskSeries[];
  /** Documented entries linked to a goal directly or through a linked task. */
  entries: Pick<JournalEntry, 'id' | 'dateKey' | 'goalIds' | 'taskIds' | 'documentedAt' | 'title' | 'kind' | 'plainText' | 'happenedAt'>[];
}

/**
 * Everything the Visions views need in one live snapshot. Goal data is small
 * (dozens of goals, a few thousand linked tasks), so one read keeps the cards,
 * goal page and mind map consistent with each other.
 */
export function useGoalBoard(): GoalBoard | undefined {
  const { db } = useStorage();
  return useLiveQuery(async () => {
    const [plans, goals, milestones, updates, series] = await Promise.all([
      db.plans.toArray(),
      db.goals.toArray(),
      db.milestones.toArray(),
      db.goalUpdates.toArray(),
      db.taskSeries.toArray(),
    ]);
    const goalIds = goals.map((g) => g.id);
    const tasks = goalIds.length ? (await db.tasks.where('goalIds').anyOf(goalIds).toArray()).filter((t) => !t.deletedAt) : [];
    const uniqueTasks = [...new Map(tasks.map((t) => [t.id, t])).values()];
    const taskIds = uniqueTasks.map((t) => t.id);
    const [byGoal, byTask] = await Promise.all([
      goalIds.length ? db.entries.where('goalIds').anyOf(goalIds).toArray() : Promise.resolve([]),
      taskIds.length ? db.entries.where('taskIds').anyOf(taskIds).toArray() : Promise.resolve([]),
    ]);
    const entries = [...new Map([...byGoal, ...byTask].filter((e) => !e.deletedAt).map((e) => [e.id, e])).values()].map((e) => ({
      id: e.id,
      dateKey: e.dateKey,
      goalIds: e.goalIds,
      taskIds: e.taskIds,
      documentedAt: e.documentedAt,
      title: e.title,
      kind: e.kind,
      plainText: e.plainText,
      happenedAt: e.happenedAt,
    }));
    return {
      plans: plans.map(withPlanDefaults),
      goals: goals.map(withGoalDefaults).sort((a, b) => a.rank - b.rank || a.createdAt.localeCompare(b.createdAt)),
      milestones: milestones.sort((a, b) => a.rank - b.rank),
      tasks: uniqueTasks,
      updates: updates.sort((a, b) => a.at.localeCompare(b.at)),
      series: series.filter((s) => s.goalIds.length > 0),
      entries,
    };
  }, [db]);
}

export function useGoalTitles(): Map<ID, string> | undefined {
  const { db } = useStorage();
  return useLiveQuery(async () => new Map((await db.goals.toArray()).filter((g) => g.status !== 'archived').map((g) => [g.id, g.title])), [db]);
}

export function useDirection(kind: PeriodDirection['kind'], periodKey: string): PeriodDirection | null | undefined {
  const { db } = useStorage();
  return useLiveQuery(async () => (await db.periodDirections.where('[kind+periodKey]').equals([kind, periodKey]).first()) ?? null, [db, kind, periodKey]);
}
