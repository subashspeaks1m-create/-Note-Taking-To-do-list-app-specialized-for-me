import { dateKeyInZone } from '../date/localDate';
import { TASK_TITLE_MAX, XP_RULES } from './config';
import type { Priority, Task, TaskStatus } from './models';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Task titles are one line of plain text, capped at 200 characters. */
export function normalizeTitle(raw: string): string {
  const title = raw.replace(/\s+/g, ' ').trim();
  if (!title) throw new ValidationError('A task needs a title.');
  if (title.length > TASK_TITLE_MAX) throw new ValidationError(`Keep the title to ${TASK_TITLE_MAX} characters or fewer (this one is ${title.length}).`);
  return title;
}

export interface BulkLine {
  line: number;
  title: string;
  error: string | null;
}

/** Splits pasted text into one task per nonblank line, with per-line validation. */
export function parseBulkLines(text: string): BulkLine[] {
  return text
    .split(/\r?\n/)
    .map((raw, i) => ({ raw, line: i + 1 }))
    .filter(({ raw }) => raw.trim() !== '')
    .map(({ raw, line }) => {
      // Strip common list markers so pasted checklists import cleanly.
      const cleaned = raw.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ xX]?\])\s+/, '');
      try {
        return { line, title: normalizeTitle(cleaned), error: null };
      } catch (e) {
        return { line, title: cleaned.trim(), error: (e as Error).message };
      }
    });
}

export function isOpen(task: Pick<Task, 'status' | 'deletedAt'>): boolean {
  return !task.deletedAt && (task.status === 'todo' || task.status === 'in-progress');
}

/**
 * Applies a status change. The first completion freezes the reward snapshot
 * (category, effort, nominal XP, earning date). Reopening clears the
 * completion but keeps that snapshot, so complete/reopen cycles can never
 * raise the reward or move it to a new earning day.
 */
export function withStatus(task: Task, status: TaskStatus, now: Date, timeZone: string): Task {
  if (task.status === status) return task;
  const nowIso = now.toISOString();
  const next: Task = { ...task, status, updatedAt: nowIso, revision: task.revision + 1 };
  if (status === 'completed') {
    const localDate = dateKeyInZone(now, timeZone);
    next.completedAt = nowIso;
    next.completionLocalDate = localDate;
    next.completionTimezone = timeZone;
    if (!task.award) {
      next.award = {
        category: task.category,
        effort: task.effort,
        nominalXp: XP_RULES.completionByEffort[task.effort],
        earnedDate: localDate,
        firstCompletedAt: nowIso,
      };
    }
  } else {
    next.completedAt = null;
    next.completionLocalDate = null;
    next.completionTimezone = null;
  }
  return next;
}

/** Rank between two neighbors (fractional ranks keep reorders to one write). */
export function rankBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1;
  if (before === null) return after! - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

export const PRIORITY_LABEL: Record<Priority, string> = { 0: 'None', 1: 'Low', 2: 'Medium', 3: 'High' };

export type TaskSort = 'manual' | 'priority' | 'time';

export function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  const list = [...tasks];
  const statusOrder = (t: Task) => (t.status === 'completed' || t.status === 'canceled' ? 1 : 0);
  list.sort((a, b) => {
    if (sort === 'priority') return b.priority - a.priority || a.rank - b.rank;
    if (sort === 'time') {
      const at = a.dueTime ?? '99:99';
      const bt = b.dueTime ?? '99:99';
      return at.localeCompare(bt) || a.rank - b.rank;
    }
    return a.rank - b.rank;
  });
  // Manual order is the user's order, done or not. Other sorts sink finished tasks.
  return sort === 'manual' ? list : list.sort((a, b) => statusOrder(a) - statusOrder(b));
}
