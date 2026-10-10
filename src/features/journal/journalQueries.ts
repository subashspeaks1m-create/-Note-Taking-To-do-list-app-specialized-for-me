import { useLiveQuery } from 'dexie-react-hooks';
import type { Goal, ID, JournalEntry, Task, VisionPlan } from '../../domain/models';
import { withGoalDefaults, withPlanDefaults } from '../../storage/queries';
import { useStorage } from '../../storage/StorageProvider';

export interface JournalData {
  /** Every entry that isn't deleted. Filtering and order happen in search.ts. */
  entries: JournalEntry[];
  /** Tasks linked from at least one entry, including deleted ones so old links keep their names. */
  tasks: Map<ID, Task>;
  goals: Goal[];
  plans: VisionPlan[];
}

/**
 * One live snapshot of the journal and what it links to. A personal journal
 * stays small enough (thousands of entries at most) to search in memory,
 * which keeps search instant and fully offline.
 */
export function useJournalData(): JournalData | undefined {
  const { db } = useStorage();
  return useLiveQuery(async () => {
    const [entries, goals, plans] = await Promise.all([db.entries.filter((e) => !e.deletedAt).toArray(), db.goals.toArray(), db.plans.toArray()]);
    const taskIds = [...new Set(entries.flatMap((e) => e.taskIds))];
    const tasks = taskIds.length ? (await db.tasks.bulkGet(taskIds)).filter((t): t is Task => !!t) : [];
    return {
      entries,
      tasks: new Map(tasks.map((t) => [t.id, t])),
      goals: goals.map(withGoalDefaults).sort((a, b) => a.rank - b.rank || a.createdAt.localeCompare(b.createdAt)),
      plans: plans.map(withPlanDefaults),
    };
  }, [db]);
}
