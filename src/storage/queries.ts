import { useLiveQuery } from 'dexie-react-hooks';
import { compareKeys, type DateKey } from '../date/localDate';
import type { ID, JournalEntry, Task, VisionPlan } from '../domain/models';
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
