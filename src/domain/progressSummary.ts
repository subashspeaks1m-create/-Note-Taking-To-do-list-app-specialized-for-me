import { levelProgress, type LevelProgress } from './config';

/**
 * Read model for the progress shown around the app. In stage 1 there is no
 * ledger yet, so every value is a true zero. Stage 5 replaces the source with
 * totals rebuilt from the XP ledger.
 */
export interface ProgressSummary {
  global: LevelProgress;
  learning: LevelProgress;
  doing: LevelProgress;
  currentStreak: number;
  longestStreak: number;
}

export function emptyProgressSummary(): ProgressSummary {
  return {
    global: levelProgress(0),
    learning: levelProgress(0),
    doing: levelProgress(0),
    currentStreak: 0,
    longestStreak: 0,
  };
}

export function useProgressSummary(): ProgressSummary {
  return emptyProgressSummary();
}
