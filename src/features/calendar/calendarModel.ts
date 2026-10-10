import { addDays, addMonths, compareKeys, endOfMonth, startOfMonth, startOfWeek, type DateKey, type WeekStart } from '../../date/localDate';
import type { Category } from '../../domain/config';
import type { JournalEntry, PeriodDirection, Task } from '../../domain/models';

/**
 * Pure calendar grouping: which tasks, entries and intentions belong to each
 * visible day. Planned activity (what was scheduled) and completed activity
 * (what got finished, on the day it was finished) are kept apart.
 */

export type CalendarView = 'month' | 'week';
export type DayRelation = 'past' | 'today' | 'future';

export type CalendarTask = Pick<
  Task,
  'id' | 'title' | 'category' | 'status' | 'scheduledDate' | 'completionLocalDate' | 'completedAt' | 'seriesId' | 'rank' | 'deletedAt'
>;
export type CalendarEntry = Pick<JournalEntry, 'id' | 'dateKey' | 'kind' | 'title' | 'plainText' | 'happenedAt' | 'createdAt' | 'deletedAt'>;
export type CalendarDirection = Pick<PeriodDirection, 'kind' | 'periodKey' | 'intention' | 'desiredOutcome'>;

export interface CategoryCount {
  done: number;
  total: number;
}

export interface DaySummary {
  date: DateKey;
  relation: DayRelation;
  /** Every task scheduled on this day, canceled ones included, in the user's order. */
  scheduled: CalendarTask[];
  /** Scheduled tasks that still count as planned (canceled ones do not). */
  planned: number;
  /** Planned tasks that are finished, wherever they were finished. */
  done: number;
  /** Open one-off tasks on a past day. Missed habit days never count as overdue. */
  overdue: number;
  /** Open occurrences of repeating tasks on a past day: left on their own day. */
  missedRepeats: number;
  byCategory: Record<Category, CategoryCount>;
  /** Tasks finished on this day that were scheduled on another day or none. */
  completedElsewhere: CalendarTask[];
  entries: CalendarEntry[];
  intention: string;
  desiredOutcome: string;
}

export function dayRelation(date: DateKey, today: DateKey): DayRelation {
  const cmp = compareKeys(date, today);
  return cmp < 0 ? 'past' : cmp > 0 ? 'future' : 'today';
}

/** Weeks of a month grid, from the week holding the 1st to the week holding the last day. */
export function monthWeeks(anchor: DateKey, weekStart: WeekStart): DateKey[][] {
  const last = endOfMonth(anchor);
  const rows: DateKey[][] = [];
  let day = startOfWeek(startOfMonth(anchor), weekStart);
  while (rows.length < 6 && (rows.length === 0 || compareKeys(day, last) <= 0)) {
    const row: DateKey[] = [];
    for (let i = 0; i < 7; i++) {
      row.push(day);
      day = addDays(day, 1);
    }
    rows.push(row);
  }
  return rows;
}

export function weekDays(anchor: DateKey, weekStart: WeekStart): DateKey[] {
  const first = startOfWeek(anchor, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** An entry is worth listing once it has a title or any text. */
export function hasContent(e: Pick<CalendarEntry, 'title' | 'plainText' | 'deletedAt'>): boolean {
  return !e.deletedAt && (!!e.title.trim() || !!e.plainText.trim());
}

const isDone = (t: CalendarTask) => t.status === 'completed';
const isOpenTask = (t: CalendarTask) => t.status === 'todo' || t.status === 'in-progress';

function emptyDay(date: DateKey, today: DateKey): DaySummary {
  return {
    date,
    relation: dayRelation(date, today),
    scheduled: [],
    planned: 0,
    done: 0,
    overdue: 0,
    missedRepeats: 0,
    byCategory: { learning: { done: 0, total: 0 }, doing: { done: 0, total: 0 } },
    completedElsewhere: [],
    entries: [],
    intention: '',
    desiredOutcome: '',
  };
}

export function buildDays(input: {
  dates: DateKey[];
  today: DateKey;
  tasks: CalendarTask[];
  entries: CalendarEntry[];
  directions: CalendarDirection[];
}): Map<DateKey, DaySummary> {
  const { today } = input;
  const days = new Map<DateKey, DaySummary>(input.dates.map((d) => [d, emptyDay(d, today)]));
  const seen = new Set<string>();

  for (const t of input.tasks) {
    if (t.deletedAt || seen.has(t.id)) continue;
    seen.add(t.id);
    const home = t.scheduledDate ? days.get(t.scheduledDate) : undefined;
    if (home) {
      home.scheduled.push(t);
      if (t.status !== 'canceled') {
        home.planned += 1;
        const cat = home.byCategory[t.category];
        cat.total += 1;
        if (isDone(t)) {
          home.done += 1;
          cat.done += 1;
        }
      }
      if (home.relation === 'past' && isOpenTask(t)) {
        if (t.seriesId) home.missedRepeats += 1;
        else home.overdue += 1;
      }
    }
    if (isDone(t) && t.completionLocalDate && t.completionLocalDate !== t.scheduledDate) {
      days.get(t.completionLocalDate)?.completedElsewhere.push(t);
    }
  }

  for (const e of input.entries) {
    if (hasContent(e)) days.get(e.dateKey)?.entries.push(e);
  }

  for (const d of input.directions) {
    if (d.kind !== 'day') continue;
    const day = days.get(d.periodKey);
    if (day) {
      day.intention = d.intention.trim();
      day.desiredOutcome = d.desiredOutcome.trim();
    }
  }

  for (const day of days.values()) {
    day.scheduled.sort((a, b) => a.rank - b.rank);
    day.completedElsewhere.sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''));
    day.entries.sort((a, b) => a.happenedAt.localeCompare(b.happenedAt) || a.createdAt.localeCompare(b.createdAt));
  }
  return days;
}

/** A short plain-text preview of an entry body. */
export function snippet(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function entryTitle(e: Pick<CalendarEntry, 'title' | 'plainText'>): string {
  return e.title.trim() || snippet(e.plainText, 48) || 'Untitled entry';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a day holds, in words, for screen readers and tooltips. Excludes the level, which the caller adds. */
export function describeDay(day: DaySummary | undefined): string {
  if (!day) return 'Nothing yet';
  const parts: string[] = [];
  if (day.planned > 0) {
    parts.push(day.relation === 'future' ? `${plural(day.planned, 'task')} planned` : `${day.done} of ${plural(day.planned, 'task')} done`);
  }
  if (day.overdue > 0) parts.push(`${day.overdue} still open`);
  if (day.completedElsewhere.length > 0) parts.push(`${day.completedElsewhere.length} finished from other days`);
  if (day.entries.length > 0) parts.push(plural(day.entries.length, 'journal entry', 'journal entries'));
  if (day.intention) parts.push('focus set');
  return parts.length ? parts.join(', ') : 'Nothing yet';
}

/** Next or previous month (landing on the 1st) or week. */
export function moveAnchor(anchor: DateKey, view: CalendarView, step: number): DateKey {
  return view === 'week' ? addDays(anchor, step * 7) : addMonths(startOfMonth(anchor), step);
}
