import { diffDays, type DateKey } from '../date/localDate';

export type SprintState = 'upcoming' | 'active' | 'final-day' | 'ended';

export interface SprintCountdown {
  state: SprintState;
  /** Exclusive count: calendar days after today until the end date. Never negative. */
  daysAfterToday: number;
  /** Inclusive alternative: calendar dates left counting today. */
  datesIncludingToday: number;
  label: string;
}

/** Exclusive sprint countdown, per the build spec: max(0, end − today) in calendar days. */
export function sprintCountdown(today: DateKey, startDate: DateKey, endDate: DateKey): SprintCountdown {
  const remaining = diffDays(today, endDate);
  const daysAfterToday = Math.max(0, remaining);
  const datesIncludingToday = Math.max(0, remaining + 1);
  if (remaining < 0) return { state: 'ended', daysAfterToday: 0, datesIncludingToday: 0, label: 'Sprint ended' };
  if (remaining === 0) return { state: 'final-day', daysAfterToday: 0, datesIncludingToday: 1, label: 'Final day' };
  const state: SprintState = diffDays(startDate, today) < 0 ? 'upcoming' : 'active';
  const label = `${daysAfterToday} ${daysAfterToday === 1 ? 'day' : 'days'} after today`;
  return { state, daysAfterToday, datesIncludingToday, label };
}

export interface PlanTimeline {
  totalDays: number;
  elapsedDays: number;
  /** Share of calendar time elapsed. This is time, not achievement. */
  timeFraction: number;
  status: 'not-started' | 'in-progress' | 'ended';
}

export function planTimeline(today: DateKey, startDate: DateKey, endDate: DateKey): PlanTimeline {
  const totalDays = Math.max(1, diffDays(startDate, endDate));
  const raw = diffDays(startDate, today);
  const elapsedDays = Math.min(totalDays, Math.max(0, raw));
  const status = raw < 0 ? 'not-started' : raw >= totalDays ? 'ended' : 'in-progress';
  return { totalDays, elapsedDays, timeFraction: elapsedDays / totalDays, status };
}
