/**
 * Persisted source records. Instants are UTC ISO strings; calendar days are
 * `YYYY-MM-DD` keys in the profile's time zone at the time they were recorded.
 * Totals, levels and charts are projections rebuilt from these records.
 */
import type { JSONContent } from '@tiptap/core';
import type { DateKey, WeekStart } from '../date/localDate';
import type { Category, Effort, PlanKind } from './config';

export type ID = string;
export type Instant = string;

export interface Profile {
  id: 'me';
  displayName: string;
  timeZone: string;
  weekStart: WeekStart;
  createdAt: Instant;
  updatedAt: Instant;
}

export interface VisionPlan {
  id: ID;
  kind: PlanKind;
  title: string;
  startDate: DateKey;
  endDate: DateKey;
  /** "Who I am becoming": the vision in the user's own words. */
  statement: string;
  notes: string;
  successCriteria: string;
  /** The latest written review of this plan. */
  review: string;
  archivedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}

export type TaskStatus = 'todo' | 'in-progress' | 'completed' | 'canceled';
/** 0 none, 1 low, 2 medium, 3 high. */
export type Priority = 0 | 1 | 2 | 3;

export type RecurrenceRule =
  | { freq: 'daily'; interval: number }
  | { freq: 'weekly'; interval: number; byWeekday: number[] }
  | { freq: 'monthly'; interval: number; byMonthDay: number };

export interface TaskSeries {
  id: ID;
  title: string;
  details: string;
  category: Category;
  effort: Effort;
  priority: Priority;
  dueTime: string | null;
  estimatedMinutes: number | null;
  tags: string[];
  goalIds: ID[];
  rule: RecurrenceRule;
  startDate: DateKey;
  endDate: DateKey | null;
  createdAt: Instant;
  updatedAt: Instant;
  /** When set, no new occurrences are generated. Existing ones keep their history. */
  stoppedAt: Instant | null;
}

/**
 * The reward snapshot frozen at the first eligible completion. Reopening,
 * re-completing or editing the task never increases it.
 */
export interface CompletionAward {
  category: Category;
  effort: Effort;
  nominalXp: number;
  earnedDate: DateKey;
  firstCompletedAt: Instant;
}

export interface Task {
  id: ID;
  seriesId: ID | null;
  occurrenceDate: DateKey | null;
  scheduledDate: DateKey | null;
  originalScheduledDate: DateKey | null;
  title: string;
  details: string;
  category: Category;
  priority: Priority;
  effort: Effort;
  dueTime: string | null;
  estimatedMinutes: number | null;
  tags: string[];
  goalIds: ID[];
  status: TaskStatus;
  rank: number;
  createdAt: Instant;
  updatedAt: Instant;
  completedAt: Instant | null;
  completionLocalDate: DateKey | null;
  completionTimezone: string | null;
  award: CompletionAward | null;
  deletedAt: Instant | null;
  revision: number;
}

export interface TaskMove {
  id: ID;
  taskId: ID;
  fromDate: DateKey | null;
  toDate: DateKey | null;
  occurredAt: Instant;
  reason: 'reschedule' | 'carry-over' | 'bulk-move';
}

export type EntryKind = 'learning' | 'doing' | 'reflection';

export interface JournalEntry {
  id: ID;
  dateKey: DateKey;
  /** When the user says it happened. */
  happenedAt: Instant;
  recordedTimezone: string;
  createdAt: Instant;
  updatedAt: Instant;
  kind: EntryKind;
  title: string;
  doc: JSONContent;
  plainText: string;
  taskIds: ID[];
  goalIds: ID[];
  tags: string[];
  /** Set when the user explicitly marks the entry documented. */
  documentedAt: Instant | null;
  pinned: boolean;
  deletedAt: Instant | null;
  revision: number;
}

export interface EntryRevision {
  id: ID;
  entryId: ID;
  revision: number;
  title: string;
  kind: EntryKind;
  doc: JSONContent;
  plainText: string;
  savedAt: Instant;
  cause: 'checkpoint' | 'before-delete' | 'before-restore' | 'conflict';
}

export interface XPEvent {
  id: ID;
  eventKey: string;
  sourceType: 'task-completion' | 'documentation' | 'reflection';
  sourceId: ID;
  category: Category | 'global';
  delta: number;
  earnedDate: DateKey;
  recordedAt: Instant;
  reversesEventId: ID | null;
  configVersion: number;
}

export interface AchievementUnlock {
  id: ID;
  achievementId: string;
  unlockedAt: Instant;
  triggeringSourceIds: ID[];
  ruleVersion: number;
}

export interface CosmeticUnlock {
  id: ID;
  cosmeticId: string;
  unlockedAt: Instant;
  ruleVersion: number;
}

export type MeasurementMode = 'manual' | 'milestones' | 'numeric' | 'tasks';
export type GoalStatus = 'active' | 'achieved' | 'paused' | 'archived';

export interface Goal {
  id: ID;
  planId: ID | null;
  periodDirectionId: ID | null;
  parentId: ID | null;
  title: string;
  why: string;
  category: Category | 'both';
  /** Life area such as Work, Health or Money. Free text; never invented for the user. */
  domain: string;
  measurementMode: MeasurementMode;
  /** Numeric mode: the number to reach. */
  target: number | null;
  /** Numeric mode: the latest value. Manual mode: percent 0-100. */
  current: number | null;
  /** Numeric mode only, e.g. "$" or "km". */
  unit: string;
  status: GoalStatus;
  reviewDate: DateKey | null;
  notes: string;
  /** A real-life reward the user promises themselves; shown only once the goal is achieved. */
  sealedReward: string;
  achievedAt: Instant | null;
  rank: number;
  createdAt: Instant;
  updatedAt: Instant;
}

/** One progress check-in. History is append-only so old charts are never rewritten. */
export interface GoalUpdate {
  id: ID;
  goalId: ID;
  /** Local day the update counts for (drives the goal streak). */
  dateKey: DateKey;
  at: Instant;
  kind: 'value' | 'milestone' | 'note' | 'status';
  /** Value after the update (numeric current or manual percent). */
  value: number | null;
  previous: number | null;
  note: string;
}

export interface Milestone {
  id: ID;
  goalId: ID;
  title: string;
  weight: number;
  achievedAt: Instant | null;
  archivedAt: Instant | null;
  rank: number;
}

export interface PeriodDirection {
  id: ID;
  kind: 'day' | 'week' | 'month';
  periodKey: string;
  startDate: DateKey;
  endDate: DateKey;
  intention: string;
  desiredOutcome: string;
  review: string;
  /** Weekly/monthly review: what got in the way. Absent on records saved before stage 4. */
  blockers?: string;
  /** Set the first time a written weekly/monthly review is saved. */
  reviewedAt?: Instant | null;
  updatedAt: Instant;
  version: number;
  /** Earlier wordings, newest last; bounded. */
  history: { at: Instant; intention: string; desiredOutcome: string; review: string; blockers?: string }[];
}

/** Small singleton records live in one key-value table. */
/** A rule Prem lives by. The first in the list is the topmost principle. */
export interface Principle {
  id: ID;
  text: string;
  /** Optional: why it matters, or the story behind it. */
  why: string;
  createdAt: Instant;
  updatedAt: Instant;
}

/** Money earned, logged by hand. Lifetime total drives the character's rank form. */
export interface EarningEntry {
  id: ID;
  /** Local day the money came in. */
  dateKey: DateKey;
  /** Whole US dollars. */
  amount: number;
  note: string;
  createdAt: Instant;
  updatedAt: Instant;
  deletedAt: Instant | null;
}

export interface KeyValue {
  key: string;
  value: unknown;
}

export interface SchemaMeta {
  schemaVersion: number;
  rulesVersion: number;
  createdAt: Instant;
  migratedAt: Instant;
  lastBackupAt: Instant | null;
  persistence: 'granted' | 'denied' | 'unsupported' | 'not-requested';
}
