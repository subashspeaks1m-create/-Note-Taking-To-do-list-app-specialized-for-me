import { addDays, diffDays, type DateKey } from '../../date/localDate';
import type { PlanProgress } from './db';
import type { PlanDay } from './schema';

export const actionKey = (day: number, index: number) => `${day}:${index}`;

export function dateForDay(progress: PlanProgress, day: number): DateKey {
  return addDays(progress.startDate, day - 1);
}

/** 1-based plan day for `today`; below 1 before the start, above the length after the end. */
export function currentDay(progress: PlanProgress, today: DateKey): number {
  return diffDays(progress.startDate, today) + 1;
}

export function dayDone(progress: PlanProgress, day: PlanDay): boolean {
  return day.actions.length > 0 && day.actions.every((_, i) => progress.done[actionKey(day.day, i)]);
}

export function planStats(progress: PlanProgress, days: PlanDay[]): { actionsDone: number; actionsTotal: number; daysDone: number } {
  let actionsDone = 0;
  let actionsTotal = 0;
  let daysDone = 0;
  for (const d of days) {
    actionsTotal += d.actions.length;
    d.actions.forEach((_, i) => {
      if (progress.done[actionKey(d.day, i)]) actionsDone++;
    });
    if (dayDone(progress, d)) daysDone++;
  }
  return { actionsDone, actionsTotal, daysDone };
}

/** Week index (1-based) for a day in a 30-day plan; days 29–30 belong to week 4. */
export function weekOfDay(day: number): number {
  return Math.min(4, Math.ceil(day / 7));
}
