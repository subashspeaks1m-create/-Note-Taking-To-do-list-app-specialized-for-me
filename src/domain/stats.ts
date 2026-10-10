import { addDays, compareKeys, diffDays, endOfMonth, startOfMonth, startOfWeek, type DateKey, type WeekStart } from '../date/localDate';
import { computeStreak, type Streak } from './goals';
import { dayActivity, type DayActivity } from './intensity';
import type { GoalUpdate, JournalEntry, Task, TaskMove } from './models';

/**
 * Honest numbers for Insights and the weekly/monthly reports. Everything is
 * recomputed from source records; nothing here is stored. Each figure keeps
 * its own denominator so the UI can show sample sizes.
 */

export interface ActivitySource {
  tasks: Task[];
  entries: JournalEntry[];
  updates: GoalUpdate[];
  moves: TaskMove[];
}

export interface DateRange {
  start: DateKey;
  end: DateKey;
}

const inRange = (d: DateKey | null | undefined, r: DateKey | DateRange, end?: DateKey): boolean => {
  if (!d) return false;
  const start = typeof r === 'string' ? r : r.start;
  const last = typeof r === 'string' ? end! : r.end;
  return compareKeys(d, start) >= 0 && compareKeys(d, last) <= 0;
};

const isDone = (t: Task) => t.status === 'completed' && !t.deletedAt && !!t.completionLocalDate;
const isDocumented = (e: JournalEntry) => !e.deletedAt && !!e.documentedAt && e.plainText.trim().length > 0;

export function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

// ---------- Consistency ----------

export interface QualifyingDays {
  combined: Set<DateKey>;
  learning: Set<DateKey>;
  doing: Set<DateKey>;
}

/**
 * A qualifying day has a completed task or an explicitly documented,
 * nonblank entry (DATA_AND_GAME_RULES "Streak and achievements"). Future
 * records never count before their day arrives.
 */
export function qualifyingDays(src: Pick<ActivitySource, 'tasks' | 'entries'>, today: DateKey): QualifyingDays {
  const out: QualifyingDays = { combined: new Set(), learning: new Set(), doing: new Set() };
  for (const t of src.tasks) {
    if (!isDone(t) || compareKeys(t.completionLocalDate!, today) > 0) continue;
    out.combined.add(t.completionLocalDate!);
    out[t.category].add(t.completionLocalDate!);
  }
  for (const e of src.entries) {
    if (!isDocumented(e) || compareKeys(e.dateKey, today) > 0) continue;
    out.combined.add(e.dateKey);
    if (e.kind === 'learning') out.learning.add(e.dateKey);
    if (e.kind === 'doing') out.doing.add(e.dateKey);
  }
  return out;
}

export interface Consistency {
  streak: Streak;
  learning: Streak;
  doing: Streak;
  /** Active days among the last 7 local days, today included. */
  last7: number;
  /** Active days so far in the current week. */
  thisWeek: number;
  /** Days of the current week that have started. */
  thisWeekElapsed: number;
}

export function consistency(src: Pick<ActivitySource, 'tasks' | 'entries'>, today: DateKey, weekStart: WeekStart): Consistency {
  const q = qualifyingDays(src, today);
  const week = startOfWeek(today, weekStart);
  let last7 = 0;
  for (let i = 0; i < 7; i++) if (q.combined.has(addDays(today, -i))) last7++;
  let thisWeek = 0;
  const thisWeekElapsed = diffDays(week, today) + 1;
  for (let i = 0; i < thisWeekElapsed; i++) if (q.combined.has(addDays(week, i))) thisWeek++;
  return {
    streak: computeStreak(q.combined, today),
    learning: computeStreak(q.learning, today),
    doing: computeStreak(q.doing, today),
    last7,
    thisWeek,
    thisWeekElapsed,
  };
}

// ---------- Period summaries ----------

export interface PeriodStats {
  range: DateRange;
  /** Days of the range that have started (0 for a future range). */
  elapsedDays: number;
  totalDays: number;
  completed: number;
  completedLearning: number;
  completedDoing: number;
  /** Tasks scheduled in the range, not canceled or deleted: the completion-rate denominator. */
  scheduled: number;
  scheduledDone: number;
  /** scheduledDone / scheduled, or null when nothing was scheduled. */
  completionRate: number | null;
  entries: number;
  documented: number;
  learnedEntries: number;
  didEntries: number;
  reflections: number;
  words: number;
  goalLogs: number;
  points: number;
  activeDays: number;
  /** Habit occurrences in the past part of the range that were not done. */
  missedHabits: { taskId: string; title: string; date: DateKey }[];
  /** Distinct tasks carried over from a day in this range. */
  carriedOver: number;
  /** One-off tasks scheduled in the past part of the range that are still open. */
  stillOpen: number;
  bestDay: { date: DateKey; points: number } | null;
  perDay: Map<DateKey, DayActivity>;
}

export function periodStats(src: ActivitySource, range: DateRange, today: DateKey): PeriodStats {
  const totalDays = diffDays(range.start, range.end) + 1;
  const elapsedDays = compareKeys(today, range.start) < 0 ? 0 : Math.min(totalDays, diffDays(range.start, today) + 1);
  const pastEnd = compareKeys(today, range.end) < 0 ? addDays(today, -1) : range.end;

  const done = src.tasks.filter((t) => isDone(t) && inRange(t.completionLocalDate, range));
  const scheduled = src.tasks.filter((t) => !t.deletedAt && t.status !== 'canceled' && inRange(t.scheduledDate, range));
  const scheduledDone = scheduled.filter((t) => t.status === 'completed').length;
  const entries = src.entries.filter((e) => !e.deletedAt && e.plainText.trim() && inRange(e.dateKey, range));
  const updates = src.updates.filter((u) => inRange(u.dateKey, range));
  const perDay = dayActivity({ tasks: done, entries, updates });

  const missedHabits = scheduled
    .filter((t) => t.seriesId && t.status !== 'completed' && inRange(t.scheduledDate, range.start, pastEnd))
    .map((t) => ({ taskId: t.id, title: t.title, date: t.scheduledDate! }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const stillOpen = scheduled.filter((t) => !t.seriesId && (t.status === 'todo' || t.status === 'in-progress') && inRange(t.scheduledDate, range.start, pastEnd)).length;
  const carried = new Set(src.moves.filter((m) => m.reason === 'carry-over' && inRange(m.fromDate, range)).map((m) => m.taskId));

  let points = 0;
  let bestDay: PeriodStats['bestDay'] = null;
  for (const [date, a] of perDay) {
    points += a.points;
    if (!bestDay || a.points > bestDay.points) bestDay = { date, points: a.points };
  }
  const q = qualifyingDays(src, today);
  let activeDays = 0;
  for (const d of q.combined) if (inRange(d, range)) activeDays++;

  return {
    range,
    elapsedDays,
    totalDays,
    completed: done.length,
    completedLearning: done.filter((t) => t.category === 'learning').length,
    completedDoing: done.filter((t) => t.category === 'doing').length,
    scheduled: scheduled.length,
    scheduledDone,
    completionRate: scheduled.length ? scheduledDone / scheduled.length : null,
    entries: entries.length,
    documented: entries.filter(isDocumented).length,
    learnedEntries: entries.filter((e) => e.kind === 'learning').length,
    didEntries: entries.filter((e) => e.kind === 'doing').length,
    reflections: entries.filter((e) => e.kind === 'reflection').length,
    words: entries.reduce((n, e) => n + wordCount(e.plainText), 0),
    goalLogs: [...perDay.values()].reduce((n, a) => n + a.goalLogs, 0),
    points,
    activeDays,
    missedHabits,
    carriedOver: carried.size,
    stillOpen,
    bestDay,
    perDay,
  };
}

// ---------- Periods ----------

export type PeriodKind = 'day' | 'week' | 'month';

export function periodRange(kind: PeriodKind, anchor: DateKey, weekStart: WeekStart): DateRange {
  if (kind === 'day') return { start: anchor, end: anchor };
  if (kind === 'week') {
    const start = startOfWeek(anchor, weekStart);
    return { start, end: addDays(start, 6) };
  }
  return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
}

export function previousRange(kind: PeriodKind, range: DateRange, weekStart: WeekStart): DateRange {
  if (kind === 'day') return periodRange('day', addDays(range.start, -1), weekStart);
  if (kind === 'week') return periodRange('week', addDays(range.start, -7), weekStart);
  return periodRange('month', addDays(range.start, -1), weekStart);
}

/** Storage key matching PeriodDirection.periodKey: the day, the week's first day, or YYYY-MM. */
export function periodKeyFor(kind: PeriodKind, range: DateRange): string {
  return kind === 'month' ? range.start.slice(0, 7) : range.start;
}

// ---------- Me vs past me ----------

export interface Delta {
  now: number;
  before: number;
  /** now - before */
  change: number;
  direction: 'up' | 'down' | 'same';
}

export function delta(now: number, before: number): Delta {
  const change = now - before;
  return { now, before, change, direction: change > 0 ? 'up' : change < 0 ? 'down' : 'same' };
}

/**
 * Compares a period that may still be running with the same stretch of the
 * one before it (e.g. Mon-Wed of this week vs Mon-Wed of last week), so a
 * Wednesday never looks worse than a full week.
 */
export function compareToDate(src: ActivitySource, kind: PeriodKind, today: DateKey, weekStart: WeekStart) {
  const cur = periodRange(kind, today, weekStart);
  const prev = previousRange(kind, cur, weekStart);
  const elapsed = diffDays(cur.start, today);
  const prevEnd = addDays(prev.start, Math.min(elapsed, diffDays(prev.start, prev.end)));
  const now = periodStats(src, { start: cur.start, end: today }, today);
  const before = periodStats(src, { start: prev.start, end: prevEnd }, today);
  return {
    now,
    before,
    completed: delta(now.completed, before.completed),
    entries: delta(now.entries, before.entries),
    points: delta(now.points, before.points),
    activeDays: delta(now.activeDays, before.activeDays),
    words: delta(now.words, before.words),
  };
}

// ---------- Personal bests ----------

export interface PersonalBests {
  bestDay: { date: DateKey; points: number } | null;
  bestWeek: { start: DateKey; completed: number } | null;
  longestStreak: number;
  totalCompleted: number;
  totalDocumented: number;
}

export function personalBests(src: ActivitySource, today: DateKey, weekStart: WeekStart): PersonalBests {
  const done = src.tasks.filter((t) => isDone(t) && compareKeys(t.completionLocalDate!, today) <= 0);
  const entries = src.entries.filter((e) => !e.deletedAt && e.plainText.trim() && compareKeys(e.dateKey, today) <= 0);
  const perDay = dayActivity({ tasks: done, entries, updates: src.updates.filter((u) => compareKeys(u.dateKey, today) <= 0) });
  let bestDay: PersonalBests['bestDay'] = null;
  for (const [date, a] of perDay) if (!bestDay || a.points > bestDay.points || (a.points === bestDay.points && date > bestDay.date)) bestDay = { date, points: a.points };
  const weeks = new Map<DateKey, number>();
  for (const t of done) {
    const w = startOfWeek(t.completionLocalDate!, weekStart);
    weeks.set(w, (weeks.get(w) ?? 0) + 1);
  }
  let bestWeek: PersonalBests['bestWeek'] = null;
  for (const [start, completed] of weeks) if (!bestWeek || completed > bestWeek.completed) bestWeek = { start, completed };
  return {
    bestDay,
    bestWeek,
    longestStreak: computeStreak(qualifyingDays(src, today).combined, today).longest,
    totalCompleted: done.length,
    totalDocumented: entries.filter(isDocumented).length,
  };
}

/** Points per week for the last `count` weeks, oldest first (trend charts). */
export function weeklyTrend(src: ActivitySource, today: DateKey, weekStart: WeekStart, count: number) {
  const out: { start: DateKey; completed: number; entries: number; points: number; activeDays: number }[] = [];
  let start = startOfWeek(today, weekStart);
  for (let i = 0; i < count; i++) {
    const s = periodStats(src, { start, end: addDays(start, 6) }, today);
    out.unshift({ start, completed: s.completed, entries: s.entries, points: s.points, activeDays: s.activeDays });
    start = addDays(start, -7);
  }
  return out;
}
