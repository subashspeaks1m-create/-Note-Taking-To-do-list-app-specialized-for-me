import Dexie, { type EntityTable } from 'dexie';
import type {
  AchievementUnlock, CosmeticUnlock, EntryRevision, Goal, GoalUpdate, JournalEntry, KeyValue, Milestone, PeriodDirection,
  Task, TaskMove, TaskSeries, VisionPlan, XPEvent,
} from '../domain/models';

export const SCHEMA_VERSION = 2;

/**
 * IndexedDB schema. Every table the product needs is declared from version 1
 * so later stages add behavior, not migrations. Future schema changes add a
 * new `this.version(n)` block with an upgrade function; never edit an old one.
 */
export class AppDatabase extends Dexie {
  kv!: EntityTable<KeyValue, 'key'>;
  plans!: EntityTable<VisionPlan, 'id'>;
  goals!: EntityTable<Goal, 'id'>;
  milestones!: EntityTable<Milestone, 'id'>;
  goalUpdates!: EntityTable<GoalUpdate, 'id'>;
  periodDirections!: EntityTable<PeriodDirection, 'id'>;
  taskSeries!: EntityTable<TaskSeries, 'id'>;
  tasks!: EntityTable<Task, 'id'>;
  taskMoves!: EntityTable<TaskMove, 'id'>;
  entries!: EntityTable<JournalEntry, 'id'>;
  entryRevisions!: EntityTable<EntryRevision, 'id'>;
  xpEvents!: EntityTable<XPEvent, 'id'>;
  achievements!: EntityTable<AchievementUnlock, 'id'>;
  cosmetics!: EntityTable<CosmeticUnlock, 'id'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      kv: 'key',
      plans: 'id, kind',
      goals: 'id, planId, parentId, periodDirectionId',
      milestones: 'id, goalId',
      periodDirections: 'id, &[kind+periodKey]',
      taskSeries: 'id',
      // A recurring series can have only one occurrence per date.
      tasks: 'id, scheduledDate, status, seriesId, &[seriesId+occurrenceDate], completionLocalDate',
      taskMoves: 'id, taskId',
      entries: 'id, dateKey, kind, *taskIds, *goalIds, *tags',
      entryRevisions: 'id, entryId, [entryId+revision]',
      xpEvents: 'id, &eventKey, sourceId, earnedDate',
      achievements: 'id, &achievementId',
      cosmetics: 'id, &cosmeticId',
    });
    // Stage 3: goal progress history, and goal links indexed on tasks and series.
    this.version(2).stores({
      goalUpdates: 'id, goalId, dateKey',
      tasks: 'id, scheduledDate, status, seriesId, &[seriesId+occurrenceDate], completionLocalDate, *goalIds',
      taskSeries: 'id, *goalIds',
    }).upgrade(async (tx) => {
      await tx.table('plans').toCollection().modify((p: Partial<VisionPlan>) => {
        p.statement ??= '';
        p.review ??= '';
      });
    });
  }
}

export const REAL_DB_NAME = 'pursuit-of-greatness';
export const DEMO_DB_NAME = 'pursuit-of-greatness-demo';
