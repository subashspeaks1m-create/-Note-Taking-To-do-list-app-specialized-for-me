import { useLiveQuery } from 'dexie-react-hooks';
import { useStorage } from '../storage/StorageProvider';
import { levelProgress, type LevelProgress } from './config';
import { xpTotals } from './ledger';

/** Levels shown around the app, rebuilt from the XP ledger's net totals. */
export interface ProgressSummary {
  global: LevelProgress;
  learning: LevelProgress;
  doing: LevelProgress;
}

export function progressFromTotals(t: { global: number; learning: number; doing: number }): ProgressSummary {
  return { global: levelProgress(t.global), learning: levelProgress(t.learning), doing: levelProgress(t.doing) };
}

export function emptyProgressSummary(): ProgressSummary {
  return progressFromTotals({ global: 0, learning: 0, doing: 0 });
}

export function useProgressSummary(): ProgressSummary {
  const { db } = useStorage();
  const totals = useLiveQuery(async () => xpTotals(await db.xpEvents.toArray()), [db]);
  return totals ? progressFromTotals(totals) : emptyProgressSummary();
}
