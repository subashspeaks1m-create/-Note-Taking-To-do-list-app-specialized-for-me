import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { addDays, compareKeys, diffDays, type DateKey } from '../../date/localDate';
import { useRepo, useStorage } from '../../storage/StorageProvider';
import type { CalendarDirection, CalendarEntry, CalendarTask } from './calendarModel';

export interface CalendarRecords {
  tasks: CalendarTask[];
  entries: CalendarEntry[];
  directions: CalendarDirection[];
}

/**
 * Everything the calendar draws for an inclusive date range: tasks scheduled
 * in it, tasks finished in it (wherever they were scheduled), journal entries
 * and day intentions. Live, so the grid follows edits made on Today.
 */
export function useCalendarRecords(start: DateKey, end: DateKey): CalendarRecords | undefined {
  const { db } = useStorage();
  return useLiveQuery(async () => {
    const [scheduled, finished, entries, directions] = await Promise.all([
      db.tasks.where('scheduledDate').between(start, end, true, true).toArray(),
      db.tasks.where('completionLocalDate').between(start, end, true, true).toArray(),
      db.entries.where('dateKey').between(start, end, true, true).toArray(),
      db.periodDirections.where('[kind+periodKey]').between(['day', start], ['day', end], true, true).toArray(),
    ]);
    const tasks = [...new Map([...scheduled, ...finished].filter((t) => !t.deletedAt).map((t) => [t.id, t])).values()].map(
      (t): CalendarTask => ({
        id: t.id,
        title: t.title,
        category: t.category,
        status: t.status,
        scheduledDate: t.scheduledDate,
        completionLocalDate: t.completionLocalDate,
        completedAt: t.completedAt,
        seriesId: t.seriesId,
        rank: t.rank,
        deletedAt: t.deletedAt,
      }),
    );
    return {
      tasks,
      entries: entries
        .filter((e) => !e.deletedAt)
        .map((e) => ({
          id: e.id,
          dateKey: e.dateKey,
          kind: e.kind,
          title: e.title,
          plainText: e.plainText,
          happenedAt: e.happenedAt,
          createdAt: e.createdAt,
          deletedAt: e.deletedAt,
        })),
      directions: directions.map((d) => ({ kind: d.kind, periodKey: d.periodKey, intention: d.intention, desiredOutcome: d.desiredOutcome })),
    };
  }, [db, start, end]);
}

/**
 * Repeating tasks only exist once their day is materialized. Generate today
 * and the visible future so upcoming habit days show as planned. Past days are
 * left as they were: the calendar records history, it does not invent it.
 */
export function useEnsureOccurrences(start: DateKey, end: DateKey, today: DateKey): void {
  const repo = useRepo();
  useEffect(() => {
    let cancelled = false;
    const from = compareKeys(start, today) < 0 ? today : start;
    const span = diffDays(from, end);
    (async () => {
      for (let i = 0; i <= span && !cancelled; i++) await repo.ensureOccurrences(addDays(from, i), today);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [repo, start, end, today]);
}
