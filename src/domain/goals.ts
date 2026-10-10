/**
 * Goal math. Pure functions so every view (cards, goal page, mind map,
 * later the weekly report) shows the same numbers.
 *
 * Achievement is always measured from the goal's own evidence. Calendar time
 * passing never fills an achievement bar.
 */
import { addDays, compareKeys, diffDays, type DateKey } from '../date/localDate';
import type { Goal, ID, MeasurementMode, Milestone, Task, TaskSeries, VisionPlan } from './models';
import { planTimeline } from './plans';

export const MEASUREMENT_LABEL: Record<MeasurementMode, string> = {
  numeric: 'A number to reach',
  milestones: 'Milestones to tick off',
  manual: 'Percent I update myself',
  tasks: 'Linked tasks completed',
};

export const DOMAIN_SUGGESTIONS = ['Work', 'Money', 'Learning', 'Health', 'Creativity', 'Relationships', 'Personal'] as const;

export interface GoalProgress {
  /** 0..1, or null when there is nothing to measure yet. */
  fraction: number | null;
  /** Short human summary, e.g. "$250,000 of $1,000,000". */
  summary: string;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function formatAmount(value: number, unit: string): string {
  const n = Number.isInteger(value) ? value.toLocaleString('en-US') : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const u = unit.trim();
  if (!u) return n;
  // Currency-like symbols read better in front.
  if (/^[$€£₹¥]$/.test(u)) return `${u}${n}`;
  return `${n} ${u}`;
}

/** Tasks counted for a goal: active, not deleted, not canceled. */
export function countableTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.deletedAt && t.status !== 'canceled');
}

export function goalProgress(goal: Goal, milestones: Milestone[], linkedTasks: Task[]): GoalProgress {
  switch (goal.measurementMode) {
    case 'numeric': {
      const target = goal.target ?? 0;
      if (!(target > 0)) return { fraction: null, summary: 'Set a target number' };
      const current = goal.current ?? 0;
      return { fraction: clamp01(current / target), summary: `${formatAmount(current, goal.unit)} of ${formatAmount(target, goal.unit)}` };
    }
    case 'manual': {
      if (goal.current === null) return { fraction: null, summary: 'No progress logged yet' };
      const pct = Math.min(100, Math.max(0, goal.current));
      return { fraction: pct / 100, summary: `${Math.round(pct)}%` };
    }
    case 'milestones': {
      const active = milestones.filter((m) => !m.archivedAt && m.weight > 0);
      if (active.length === 0) return { fraction: null, summary: 'No milestones yet' };
      const total = active.reduce((s, m) => s + m.weight, 0);
      const done = active.filter((m) => m.achievedAt).reduce((s, m) => s + m.weight, 0);
      const doneCount = active.filter((m) => m.achievedAt).length;
      return { fraction: clamp01(done / total), summary: `${doneCount} of ${active.length} milestones` };
    }
    case 'tasks': {
      // Sets of IDs: a task linked twice is still one task.
      const unique = new Map(countableTasks(linkedTasks).map((t) => [t.id, t]));
      if (unique.size === 0) return { fraction: null, summary: 'No linked tasks yet' };
      const done = [...unique.values()].filter((t) => t.status === 'completed').length;
      return { fraction: done / unique.size, summary: `${done} of ${unique.size} linked tasks done` };
    }
  }
}

/** Plan achievement: the average of its measured top-level goals. Unmeasured goals are listed, not counted as 0 or 100. */
export function planAchievement(progresses: GoalProgress[]): { fraction: number | null; measured: number; total: number } {
  const measured = progresses.filter((p) => p.fraction !== null);
  if (measured.length === 0) return { fraction: null, measured: 0, total: progresses.length };
  const fraction = measured.reduce((s, p) => s + (p.fraction ?? 0), 0) / measured.length;
  return { fraction, measured: measured.length, total: progresses.length };
}

// ---------- Pace: "am I on track to become my future self?" ----------

export type PaceState = 'not-started' | 'ahead' | 'on-pace' | 'behind' | 'done' | 'ended' | 'unmeasured';

export interface Pace {
  state: PaceState;
  /** Achievement expected by today if progress were spread evenly over the plan. */
  expectedFraction: number;
  label: string;
}

/** Within this band of the even-pace line counts as on pace. */
const PACE_TOLERANCE = 0.05;

export function goalPace(progress: GoalProgress, plan: Pick<VisionPlan, 'startDate' | 'endDate'> | null, today: DateKey): Pace {
  if (progress.fraction === null || !plan) return { state: 'unmeasured', expectedFraction: 0, label: 'Add a measure to see your pace' };
  const t = planTimeline(today, plan.startDate, plan.endDate);
  const expected = t.timeFraction;
  if (progress.fraction >= 1) return { state: 'done', expectedFraction: expected, label: 'Target reached' };
  if (t.status === 'not-started') return { state: 'not-started', expectedFraction: 0, label: 'Plan has not started yet' };
  if (t.status === 'ended') return { state: 'ended', expectedFraction: 1, label: 'Plan ended before the target' };
  const gap = progress.fraction - expected;
  if (gap > PACE_TOLERANCE) return { state: 'ahead', expectedFraction: expected, label: 'Ahead of pace' };
  if (gap < -PACE_TOLERANCE) return { state: 'behind', expectedFraction: expected, label: 'Behind pace' };
  return { state: 'on-pace', expectedFraction: expected, label: 'On pace' };
}

/** For numeric goals: how much is still needed per day to finish on time. */
export function dailyNeeded(goal: Goal, plan: Pick<VisionPlan, 'endDate'> | null, today: DateKey): number | null {
  if (goal.measurementMode !== 'numeric' || !plan || !(goal.target && goal.target > 0)) return null;
  const remaining = goal.target - (goal.current ?? 0);
  if (remaining <= 0) return 0;
  const days = diffDays(today, plan.endDate);
  if (days <= 0) return null;
  return remaining / days;
}

// ---------- Streaks ----------

export interface Streak {
  current: number;
  longest: number;
  /** True when today already counts. */
  activeToday: boolean;
}

/**
 * Current streak counts contiguous qualifying days ending today; if today has
 * nothing yet, the run ending yesterday still counts so mornings don't read as
 * broken. Future dates never count.
 */
export function computeStreak(dates: Iterable<DateKey>, today: DateKey): Streak {
  const set = new Set([...dates].filter((d) => compareKeys(d, today) <= 0));
  const activeToday = set.has(today);
  let current = 0;
  let cursor = activeToday ? today : addDays(today, -1);
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  let longest = 0;
  for (const d of set) {
    if (set.has(addDays(d, -1))) continue; // not the start of a run
    let len = 0;
    let c = d;
    while (set.has(c)) {
      len++;
      c = addDays(c, 1);
    }
    longest = Math.max(longest, len);
  }
  return { current, longest, activeToday };
}

/**
 * A goal's day counts when a linked task was completed that day, progress was
 * logged that day, or a documented entry linked to the goal was written.
 */
export function goalActivityDates(input: { tasks: Task[]; updates: { dateKey: DateKey; kind: string }[]; entryDates: DateKey[] }): Set<DateKey> {
  const dates = new Set<DateKey>();
  for (const t of countableTasks(input.tasks)) if (t.status === 'completed' && t.completionLocalDate) dates.add(t.completionLocalDate);
  for (const u of input.updates) if (u.kind !== 'status') dates.add(u.dateKey);
  for (const d of input.entryDates) dates.add(d);
  return dates;
}

// ---------- Hierarchy ----------

/** All goals under `rootId` (excluding it). Safe against bad data loops. */
export function descendantIds(goals: Goal[], rootId: ID): Set<ID> {
  const byParent = new Map<ID, Goal[]>();
  for (const g of goals) if (g.parentId) byParent.set(g.parentId, [...(byParent.get(g.parentId) ?? []), g]);
  const out = new Set<ID>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const child of byParent.get(id) ?? []) {
      if (out.has(child.id) || child.id === rootId) continue;
      out.add(child.id);
      stack.push(child.id);
    }
  }
  return out;
}

/** True if making `parentId` the parent of `goalId` would create a loop. */
export function wouldCreateCycle(goals: Goal[], goalId: ID, parentId: ID | null): boolean {
  if (!parentId) return false;
  if (parentId === goalId) return true;
  return descendantIds(goals, goalId).has(parentId);
}

/** Goal → parent goals → plan, for showing "why this task matters". */
export function goalChain(goals: Goal[], plans: VisionPlan[], goalId: ID): { goals: Goal[]; plan: VisionPlan | null } {
  const byId = new Map(goals.map((g) => [g.id, g]));
  const chain: Goal[] = [];
  const seen = new Set<ID>();
  let cur = byId.get(goalId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  const top = chain[chain.length - 1];
  const plan = top?.planId ? (plans.find((p) => p.id === top.planId) ?? null) : null;
  return { goals: chain, plan };
}

export function isLiveSeries(s: TaskSeries): boolean {
  return !s.stoppedAt;
}

export const PLAN_KIND_LABEL: Record<VisionPlan['kind'], string> = {
  decade: '10-year vision',
  year: '1-year vision',
  sprint: 'Sprint',
};
