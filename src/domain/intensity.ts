import type { DateKey } from '../date/localDate';
import type { GoalUpdate, JournalEntry, Task } from './models';

/**
 * Day intensity: how much real work a day holds, shown on the calendar as
 * ember, blaze and crystal. Points come only from things you did, never from
 * things you planned.
 */
export type IntensityLevel = 0 | 1 | 2 | 3;

export interface DayActivity {
  /** Finished tasks and habits whose completion falls on this day. */
  completed: number;
  entries: number;
  /** Goal progress logs, milestones and check-ins. */
  goalLogs: number;
  points: number;
  level: IntensityLevel;
}

/** Lowest point total for each level (index 1..3). */
export const LEVEL_THRESHOLDS = [0, 1, 3, 6] as const;

export const LEVEL_NAME: Record<IntensityLevel, string> = { 0: 'Quiet', 1: 'Ember', 2: 'Blaze', 3: 'Crystal' };

export function levelFor(points: number): IntensityLevel {
  if (points >= LEVEL_THRESHOLDS[3]) return 3;
  if (points >= LEVEL_THRESHOLDS[2]) return 2;
  if (points >= LEVEL_THRESHOLDS[1]) return 1;
  return 0;
}

/** Counts a goal update unless it is a status change or the automatic starting point. */
function countsAsGoalLog(u: Pick<GoalUpdate, 'kind' | 'previous' | 'note'>): boolean {
  if (u.kind === 'status') return false;
  if (u.kind === 'value' && u.previous === null && u.note === 'Starting point') return false;
  return true;
}

export function dayActivity(input: {
  tasks: Pick<Task, 'status' | 'completionLocalDate' | 'deletedAt'>[];
  entries: Pick<JournalEntry, 'dateKey' | 'deletedAt'>[];
  updates: Pick<GoalUpdate, 'dateKey' | 'kind' | 'previous' | 'note'>[];
}): Map<DateKey, DayActivity> {
  const out = new Map<DateKey, DayActivity>();
  const bump = (d: DateKey, key: 'completed' | 'entries' | 'goalLogs') => {
    const a = out.get(d) ?? { completed: 0, entries: 0, goalLogs: 0, points: 0, level: 0 };
    a[key] += 1;
    a.points += 1;
    a.level = levelFor(a.points);
    out.set(d, a);
  };
  for (const t of input.tasks) if (t.status === 'completed' && t.completionLocalDate && !t.deletedAt) bump(t.completionLocalDate, 'completed');
  for (const e of input.entries) if (!e.deletedAt) bump(e.dateKey, 'entries');
  for (const u of input.updates) if (countsAsGoalLog(u)) bump(u.dateKey, 'goalLogs');
  return out;
}
