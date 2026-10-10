import type { JSONContent } from '@tiptap/core';
import { dateKeyInZone, type DateKey } from '../date/localDate';
import { PLAN_DEFAULTS, PROFILE_DEFAULTS, RULES_VERSION, type Category, type Effort } from '../domain/config';
import type {
  EntryKind, EntryRevision, Goal, GoalStatus, ID, JournalEntry, MeasurementMode, Milestone, PeriodDirection,
  Priority, Profile, RecurrenceRule, SchemaMeta, Task, TaskMove, TaskSeries, TaskStatus, VisionPlan,
} from '../domain/models';
import { wouldCreateCycle } from '../domain/goals';
import { RECURRENCE_HORIZON_DAYS, seriesOccursOn } from '../domain/recurrence';
import { normalizeTitle, rankBetween, ValidationError, withStatus } from '../domain/tasks';
import { addDays, compareKeys } from '../date/localDate';
import { SCHEMA_VERSION, type AppDatabase } from './db';

export const uuid = (): ID => crypto.randomUUID();

/** Thrown when an entry was saved elsewhere (another tab) since this draft loaded. */
export class ConflictError extends Error {
  constructor(public readonly current: JournalEntry) {
    super('This entry was changed somewhere else.');
    this.name = 'ConflictError';
  }
}

export interface NewTaskInput {
  title: string;
  category: Category;
  scheduledDate: DateKey | null;
  details?: string;
  priority?: Priority;
  effort?: Effort;
  dueTime?: string | null;
  estimatedMinutes?: number | null;
  tags?: string[];
  goalIds?: ID[];
}

export type TaskPatch = Partial<
  Pick<Task, 'title' | 'details' | 'category' | 'priority' | 'effort' | 'dueTime' | 'estimatedMinutes' | 'tags' | 'goalIds'>
>;

export interface GoalInput {
  title: string;
  planId: ID | null;
  parentId?: ID | null;
  why?: string;
  category?: Goal['category'];
  domain?: string;
  measurementMode: MeasurementMode;
  target?: number | null;
  current?: number | null;
  unit?: string;
  reviewDate?: DateKey | null;
  notes?: string;
  sealedReward?: string;
}

export type PlanPatch = Partial<Pick<VisionPlan, 'title' | 'startDate' | 'endDate' | 'statement' | 'notes' | 'successCriteria' | 'review'>>;

/** Earlier direction wordings kept per period. */
export const MAX_DIRECTION_HISTORY = 20;
const TITLE_MAX_GOAL = 160;

export interface EntryContent {
  title: string;
  kind: EntryKind;
  doc: JSONContent;
  plainText: string;
  happenedAt: string;
  taskIds: ID[];
  tags: string[];
}

/** Revisions kept per entry, plus the before-delete snapshot which is always kept. */
export const MAX_REVISIONS_PER_ENTRY = 40;
/** Autosaves closer together than this update the newest checkpoint instead of adding one. */
export const CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000;

const KV = { profile: 'profile', meta: 'meta' } as const;

/**
 * Typed storage operations. Components call these instead of touching
 * IndexedDB, so a sync service could later implement the same surface.
 * Every multi-record change runs in one transaction.
 */
export class Repository {
  constructor(
    readonly db: AppDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private iso(): string {
    return this.now().toISOString();
  }

  // ---------- Setup ----------

  /** Creates the profile, metadata and the three original plans exactly once. */
  async ensureInitialized(): Promise<void> {
    await this.db.transaction('rw', this.db.kv, this.db.plans, async () => {
      const existing = await this.db.kv.get(KV.meta);
      if (existing) return;
      const at = this.iso();
      const profile: Profile = { id: 'me', ...PROFILE_DEFAULTS, createdAt: at, updatedAt: at };
      const meta: SchemaMeta = {
        schemaVersion: SCHEMA_VERSION,
        rulesVersion: RULES_VERSION,
        createdAt: at,
        migratedAt: at,
        lastBackupAt: null,
        persistence: 'not-requested',
      };
      const plans: VisionPlan[] = PLAN_DEFAULTS.map((p) => ({
        id: uuid(),
        kind: p.kind,
        title: p.title,
        startDate: p.startDate,
        endDate: p.endDate,
        statement: '',
        notes: '',
        successCriteria: '',
        review: '',
        archivedAt: null,
        createdAt: at,
        updatedAt: at,
      }));
      await this.db.kv.bulkPut([
        { key: KV.meta, value: meta },
        { key: KV.profile, value: profile },
      ]);
      await this.db.plans.bulkAdd(plans);
    });
  }

  async getProfile(): Promise<Profile> {
    const row = await this.db.kv.get(KV.profile);
    return (row?.value as Profile | undefined) ?? { id: 'me', ...PROFILE_DEFAULTS, createdAt: this.iso(), updatedAt: this.iso() };
  }

  async getMeta(): Promise<SchemaMeta | undefined> {
    return (await this.db.kv.get(KV.meta))?.value as SchemaMeta | undefined;
  }

  async setPersistence(result: SchemaMeta['persistence']): Promise<void> {
    await this.db.transaction('rw', this.db.kv, async () => {
      const meta = await this.getMeta();
      if (meta) await this.db.kv.put({ key: KV.meta, value: { ...meta, persistence: result } });
    });
  }

  // ---------- Tasks ----------

  private async nextRank(date: DateKey | null): Promise<number> {
    const siblings = date === null ? await this.db.tasks.filter((t) => t.scheduledDate === null).toArray() : await this.db.tasks.where('scheduledDate').equals(date).toArray();
    return siblings.reduce((max, t) => Math.max(max, t.rank), 0) + 1;
  }

  private buildTask(input: NewTaskInput, rank: number): Task {
    const at = this.iso();
    return {
      id: uuid(),
      seriesId: null,
      occurrenceDate: null,
      scheduledDate: input.scheduledDate,
      originalScheduledDate: input.scheduledDate,
      title: normalizeTitle(input.title),
      details: input.details ?? '',
      category: input.category,
      priority: input.priority ?? 0,
      effort: input.effort ?? 'standard',
      dueTime: input.dueTime ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      tags: input.tags ?? [],
      goalIds: input.goalIds ?? [],
      status: 'todo',
      rank,
      createdAt: at,
      updatedAt: at,
      completedAt: null,
      completionLocalDate: null,
      completionTimezone: null,
      award: null,
      deletedAt: null,
      revision: 1,
    };
  }

  async addTask(input: NewTaskInput): Promise<Task> {
    return this.db.transaction('rw', this.db.tasks, async () => {
      const task = this.buildTask(input, await this.nextRank(input.scheduledDate));
      await this.db.tasks.add(task);
      return task;
    });
  }

  async addTasks(titles: string[], category: Category, scheduledDate: DateKey | null): Promise<Task[]> {
    if (titles.length === 0) return [];
    return this.db.transaction('rw', this.db.tasks, async () => {
      let rank = await this.nextRank(scheduledDate);
      const tasks = titles.map((title) => this.buildTask({ title, category, scheduledDate }, rank++));
      await this.db.tasks.bulkAdd(tasks);
      return tasks;
    });
  }

  private async mustGetTask(id: ID): Promise<Task> {
    const task = await this.db.tasks.get(id);
    if (!task) throw new ValidationError('That task no longer exists.');
    return task;
  }

  async updateTask(id: ID, patch: TaskPatch): Promise<Task> {
    return this.db.transaction('rw', this.db.tasks, async () => {
      const task = await this.mustGetTask(id);
      const next: Task = {
        ...task,
        ...patch,
        title: patch.title !== undefined ? normalizeTitle(patch.title) : task.title,
        updatedAt: this.iso(),
        revision: task.revision + 1,
      };
      await this.db.tasks.put(next);
      return next;
    });
  }

  async setTaskStatus(id: ID, status: TaskStatus, timeZone: string): Promise<{ before: Task; after: Task }> {
    return this.db.transaction('rw', this.db.tasks, async () => {
      const before = await this.mustGetTask(id);
      const after = withStatus(before, status, this.now(), timeZone);
      if (after !== before) await this.db.tasks.put(after);
      return { before, after };
    });
  }

  /** Soft delete; `restoreTask` brings it back with its completion and award intact. */
  async deleteTasks(ids: ID[]): Promise<void> {
    await this.db.transaction('rw', this.db.tasks, async () => {
      const at = this.iso();
      for (const id of ids) {
        const task = await this.db.tasks.get(id);
        if (task && !task.deletedAt) await this.db.tasks.put({ ...task, deletedAt: at, updatedAt: at, revision: task.revision + 1 });
      }
    });
  }

  async restoreTasks(ids: ID[]): Promise<void> {
    await this.db.transaction('rw', this.db.tasks, async () => {
      for (const id of ids) {
        const task = await this.db.tasks.get(id);
        if (task?.deletedAt) await this.db.tasks.put({ ...task, deletedAt: null, updatedAt: this.iso(), revision: task.revision + 1 });
      }
    });
  }

  /** A genuinely new task: new ID, open status, no completion history or reward. */
  async duplicateTask(id: ID): Promise<Task> {
    return this.db.transaction('rw', this.db.tasks, async () => {
      const src = await this.mustGetTask(id);
      const siblings = src.scheduledDate ? await this.db.tasks.where('scheduledDate').equals(src.scheduledDate).sortBy('rank') : [];
      const after = siblings.find((t) => t.rank > src.rank)?.rank ?? null;
      const copy = this.buildTask(
        {
          title: src.title,
          category: src.category,
          scheduledDate: src.scheduledDate,
          details: src.details,
          priority: src.priority,
          effort: src.effort,
          dueTime: src.dueTime,
          estimatedMinutes: src.estimatedMinutes,
          tags: [...src.tags],
          goalIds: [...src.goalIds],
        },
        rankBetween(src.rank, after),
      );
      await this.db.tasks.add(copy);
      return copy;
    });
  }

  /** Moving keeps the task's identity, original date and journal links; it records history. */
  async moveTasks(ids: ID[], toDate: DateKey | null, reason: TaskMove['reason']): Promise<void> {
    await this.db.transaction('rw', this.db.tasks, this.db.taskMoves, async () => {
      let rank = await this.nextRank(toDate);
      for (const id of ids) {
        const task = await this.mustGetTask(id);
        if (task.scheduledDate === toDate) continue;
        const at = this.iso();
        await this.db.taskMoves.add({ id: uuid(), taskId: id, fromDate: task.scheduledDate, toDate, occurredAt: at, reason });
        await this.db.tasks.put({
          ...task,
          scheduledDate: toDate,
          originalScheduledDate: task.originalScheduledDate ?? task.scheduledDate,
          rank: rank++,
          updatedAt: at,
          revision: task.revision + 1,
        });
      }
    });
  }

  async reorderTask(id: ID, beforeRank: number | null, afterRank: number | null): Promise<void> {
    await this.db.transaction('rw', this.db.tasks, async () => {
      const task = await this.mustGetTask(id);
      await this.db.tasks.put({ ...task, rank: rankBetween(beforeRank, afterRank), updatedAt: this.iso(), revision: task.revision + 1 });
    });
  }

  async taskMoves(taskId: ID): Promise<TaskMove[]> {
    return (await this.db.taskMoves.where('taskId').equals(taskId).toArray()).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  // ---------- Recurrence ----------

  async createSeries(input: NewTaskInput & { scheduledDate: DateKey; rule: RecurrenceRule; endDate?: DateKey | null }): Promise<TaskSeries> {
    const at = this.iso();
    const series: TaskSeries = {
      id: uuid(),
      title: normalizeTitle(input.title),
      details: input.details ?? '',
      category: input.category,
      effort: input.effort ?? 'standard',
      priority: input.priority ?? 0,
      dueTime: input.dueTime ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      tags: input.tags ?? [],
      goalIds: input.goalIds ?? [],
      rule: input.rule,
      startDate: input.scheduledDate,
      endDate: input.endDate ?? null,
      createdAt: at,
      updatedAt: at,
      stoppedAt: null,
    };
    await this.db.taskSeries.add(series);
    await this.ensureOccurrences(input.scheduledDate, input.scheduledDate);
    return series;
  }

  /** Stops future generation. Existing occurrences, done or not, are left as they are. */
  async stopSeries(id: ID): Promise<void> {
    const at = this.iso();
    await this.db.taskSeries.update(id, { stoppedAt: at, updatedAt: at });
  }

  /**
   * Materializes occurrences for the given dates. Idempotent: the unique
   * (seriesId, occurrenceDate) index rejects duplicates even across tabs.
   */
  async ensureOccurrences(date: DateKey, today: DateKey): Promise<number> {
    if (compareKeys(date, addDays(today, RECURRENCE_HORIZON_DAYS)) > 0) return 0;
    const all = await this.db.taskSeries.toArray();
    const active = all.filter((s) => !s.stoppedAt && seriesOccursOn(s, date));
    if (active.length === 0) return 0;
    let created = 0;
    await this.db.transaction('rw', this.db.tasks, async () => {
      for (const s of active) {
        const exists = await this.db.tasks.where('[seriesId+occurrenceDate]').equals([s.id, date]).count();
        if (exists) continue;
        const task = this.buildTask(
          {
            title: s.title,
            category: s.category,
            scheduledDate: date,
            details: s.details,
            priority: s.priority,
            effort: s.effort,
            dueTime: s.dueTime,
            estimatedMinutes: s.estimatedMinutes,
            tags: [...s.tags],
            goalIds: [...s.goalIds],
          },
          await this.nextRank(date),
        );
        await this.db.tasks.add({ ...task, seriesId: s.id, occurrenceDate: date });
        created++;
      }
    });
    return created;
  }

  // ---------- Journal ----------

  async createEntry(input: { dateKey: DateKey; kind: EntryKind; taskIds?: ID[]; timeZone: string; happenedAt?: string }): Promise<JournalEntry> {
    const at = this.iso();
    const entry: JournalEntry = {
      id: uuid(),
      dateKey: input.dateKey,
      happenedAt: input.happenedAt ?? at,
      recordedTimezone: input.timeZone,
      createdAt: at,
      updatedAt: at,
      kind: input.kind,
      title: '',
      doc: { type: 'doc', content: [{ type: 'paragraph' }] },
      plainText: '',
      taskIds: input.taskIds ?? [],
      goalIds: [],
      tags: [],
      documentedAt: null,
      pinned: false,
      deletedAt: null,
      revision: 1,
    };
    await this.db.entries.add(entry);
    return entry;
  }

  /**
   * Saves editor content if the stored revision still matches the draft's base.
   * Otherwise throws ConflictError and changes nothing, so neither version is lost.
   */
  async saveEntry(id: ID, content: EntryContent, baseRevision: number): Promise<JournalEntry> {
    return this.db.transaction('rw', this.db.entries, this.db.entryRevisions, async () => {
      const current = await this.db.entries.get(id);
      if (!current) throw new ValidationError('This entry no longer exists.');
      if (current.revision !== baseRevision) throw new ConflictError(current);
      const at = this.iso();
      const next: JournalEntry = {
        ...current,
        ...content,
        // Emptying a documented entry withdraws the documented mark.
        documentedAt: content.plainText.trim() ? current.documentedAt : null,
        updatedAt: at,
        revision: current.revision + 1,
      };
      await this.db.entries.put(next);
      await this.checkpoint(next, 'checkpoint');
      return next;
    });
  }

  /** Keeps a bounded history: one checkpoint per few minutes of writing. */
  private async checkpoint(entry: JournalEntry, cause: EntryRevision['cause']): Promise<void> {
    if (!entry.plainText.trim() && !entry.title.trim() && cause === 'checkpoint') return;
    const revisions = await this.db.entryRevisions.where('entryId').equals(entry.id).sortBy('savedAt');
    const latest = revisions.at(-1);
    const snapshot: EntryRevision = {
      id: uuid(),
      entryId: entry.id,
      revision: entry.revision,
      title: entry.title,
      kind: entry.kind,
      doc: entry.doc,
      plainText: entry.plainText,
      savedAt: entry.updatedAt,
      cause,
    };
    if (cause === 'checkpoint' && latest?.cause === 'checkpoint' && Date.parse(entry.updatedAt) - Date.parse(latest.savedAt) < CHECKPOINT_INTERVAL_MS) {
      // Same writing session: refresh the newest checkpoint instead of piling up copies.
      await this.db.entryRevisions.put({ ...snapshot, id: latest.id, savedAt: latest.savedAt });
      return;
    }
    await this.db.entryRevisions.add(snapshot);
    const prunable = [...revisions, snapshot].filter((r) => r.cause !== 'before-delete');
    const excess = prunable.length - MAX_REVISIONS_PER_ENTRY;
    if (excess > 0) await this.db.entryRevisions.bulkDelete(prunable.slice(0, excess).map((r) => r.id));
  }

  /** Overwrites with the local draft after a conflict, keeping the other version in history. */
  async saveEntryOverConflict(id: ID, content: EntryContent): Promise<JournalEntry> {
    return this.db.transaction('rw', this.db.entries, this.db.entryRevisions, async () => {
      const current = await this.db.entries.get(id);
      if (!current) throw new ValidationError('This entry no longer exists.');
      await this.db.entryRevisions.add({
        id: uuid(),
        entryId: id,
        revision: current.revision,
        title: current.title,
        kind: current.kind,
        doc: current.doc,
        plainText: current.plainText,
        savedAt: this.iso(),
        cause: 'conflict',
      });
      return this.saveEntry(id, content, current.revision);
    });
  }

  /** Files a version in the entry's history without changing the entry (used when resolving conflicts). */
  async stashRevision(entryId: ID, content: Pick<EntryContent, 'title' | 'kind' | 'doc' | 'plainText'>): Promise<void> {
    const current = await this.db.entries.get(entryId);
    await this.db.entryRevisions.add({
      id: uuid(),
      entryId,
      revision: current?.revision ?? 0,
      ...content,
      savedAt: this.iso(),
      cause: 'conflict',
    });
  }

  async updateEntryMeta(id: ID, patch: Partial<Pick<JournalEntry, 'kind' | 'happenedAt' | 'taskIds' | 'tags' | 'pinned' | 'title'>>): Promise<JournalEntry> {
    return this.db.transaction('rw', this.db.entries, async () => {
      const current = await this.db.entries.get(id);
      if (!current) throw new ValidationError('This entry no longer exists.');
      const next = { ...current, ...patch, updatedAt: this.iso(), revision: current.revision + 1 };
      await this.db.entries.put(next);
      return next;
    });
  }

  /** Documented requires an explicit choice and nonblank text. */
  async setDocumented(id: ID, documented: boolean): Promise<JournalEntry> {
    return this.db.transaction('rw', this.db.entries, async () => {
      const current = await this.db.entries.get(id);
      if (!current) throw new ValidationError('This entry no longer exists.');
      if (documented && !current.plainText.trim()) throw new ValidationError('Write something before marking this entry documented.');
      const next = {
        ...current,
        documentedAt: documented ? (current.documentedAt ?? this.iso()) : null,
        updatedAt: this.iso(),
        revision: current.revision + 1,
      };
      await this.db.entries.put(next);
      return next;
    });
  }

  async deleteEntry(id: ID): Promise<void> {
    await this.db.transaction('rw', this.db.entries, this.db.entryRevisions, async () => {
      const current = await this.db.entries.get(id);
      if (!current || current.deletedAt) return;
      await this.checkpoint({ ...current, updatedAt: this.iso() }, 'before-delete');
      await this.db.entries.put({ ...current, deletedAt: this.iso(), updatedAt: this.iso(), revision: current.revision + 1 });
    });
  }

  async restoreEntry(id: ID): Promise<void> {
    await this.db.transaction('rw', this.db.entries, async () => {
      const current = await this.db.entries.get(id);
      if (current?.deletedAt) await this.db.entries.put({ ...current, deletedAt: null, updatedAt: this.iso(), revision: current.revision + 1 });
    });
  }

  /** Deletes an entry that was never written in, leaving no history behind. */
  async discardEmptyEntry(id: ID): Promise<void> {
    await this.db.transaction('rw', this.db.entries, this.db.entryRevisions, async () => {
      const current = await this.db.entries.get(id);
      if (!current || current.plainText.trim() || current.title.trim()) return;
      await this.db.entries.delete(id);
      await this.db.entryRevisions.where('entryId').equals(id).delete();
    });
  }

  async entryRevisions(entryId: ID): Promise<EntryRevision[]> {
    return (await this.db.entryRevisions.where('entryId').equals(entryId).sortBy('savedAt')).reverse();
  }

  async restoreRevision(entryId: ID, revisionId: ID): Promise<JournalEntry> {
    return this.db.transaction('rw', this.db.entries, this.db.entryRevisions, async () => {
      const current = await this.db.entries.get(entryId);
      const rev = await this.db.entryRevisions.get(revisionId);
      if (!current || !rev) throw new ValidationError('That version is no longer available.');
      await this.checkpoint({ ...current, updatedAt: this.iso() }, 'before-restore');
      const next: JournalEntry = {
        ...current,
        title: rev.title,
        kind: rev.kind,
        doc: rev.doc,
        plainText: rev.plainText,
        deletedAt: null,
        documentedAt: rev.plainText.trim() ? current.documentedAt : null,
        updatedAt: this.iso(),
        revision: current.revision + 1,
      };
      await this.db.entries.put(next);
      return next;
    });
  }

  // ---------- Plans ----------

  async updatePlan(id: ID, patch: PlanPatch): Promise<VisionPlan> {
    return this.db.transaction('rw', this.db.plans, async () => {
      const plan = await this.db.plans.get(id);
      if (!plan) throw new ValidationError('That plan no longer exists.');
      const next: VisionPlan = { ...plan, ...patch, updatedAt: this.iso() };
      if (patch.title !== undefined && !next.title.trim()) throw new ValidationError('Give the plan a name.');
      if (compareKeys(next.startDate, next.endDate) >= 0) throw new ValidationError('The end date must be after the start date.');
      await this.db.plans.put({ ...next, title: next.title.trim() });
      return next;
    });
  }

  async createPlan(input: { kind: VisionPlan['kind']; title: string; startDate: DateKey; endDate: DateKey }): Promise<VisionPlan> {
    if (!input.title.trim()) throw new ValidationError('Give the plan a name.');
    if (compareKeys(input.startDate, input.endDate) >= 0) throw new ValidationError('The end date must be after the start date.');
    const at = this.iso();
    const plan: VisionPlan = {
      id: uuid(),
      kind: input.kind,
      title: input.title.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      statement: '',
      notes: '',
      successCriteria: '',
      review: '',
      archivedAt: null,
      createdAt: at,
      updatedAt: at,
    };
    await this.db.plans.add(plan);
    return plan;
  }

  async setPlanArchived(id: ID, archived: boolean): Promise<void> {
    const at = this.iso();
    await this.db.plans.update(id, { archivedAt: archived ? at : null, updatedAt: at });
  }

  // ---------- Goals ----------

  private validateGoal(g: Goal, all: Goal[]): void {
    if (!g.title.trim()) throw new ValidationError('Give the goal a name.');
    if (g.title.length > TITLE_MAX_GOAL) throw new ValidationError(`Keep the goal name under ${TITLE_MAX_GOAL} characters.`);
    if (g.measurementMode === 'numeric' && !(typeof g.target === 'number' && g.target > 0)) throw new ValidationError('A number goal needs a target above zero.');
    if (g.measurementMode === 'manual' && g.current !== null && (g.current < 0 || g.current > 100)) throw new ValidationError('Percent must be between 0 and 100.');
    if (wouldCreateCycle(all, g.id, g.parentId)) throw new ValidationError('A goal cannot sit under one of its own sub-goals.');
  }

  async createGoal(input: GoalInput, dateKey: DateKey): Promise<Goal> {
    return this.db.transaction('rw', this.db.goals, this.db.goalUpdates, async () => {
      const all = await this.db.goals.toArray();
      const at = this.iso();
      const siblings = all.filter((g) => g.planId === input.planId && (g.parentId ?? null) === (input.parentId ?? null));
      const goal: Goal = {
        id: uuid(),
        planId: input.planId,
        periodDirectionId: null,
        parentId: input.parentId ?? null,
        title: input.title.trim(),
        why: input.why?.trim() ?? '',
        category: input.category ?? 'both',
        domain: input.domain?.trim() ?? '',
        measurementMode: input.measurementMode,
        target: input.measurementMode === 'numeric' ? (input.target ?? null) : null,
        current: input.measurementMode === 'numeric' ? (input.current ?? 0) : input.measurementMode === 'manual' ? (input.current ?? null) : null,
        unit: input.measurementMode === 'numeric' ? (input.unit?.trim() ?? '') : '',
        status: 'active',
        reviewDate: input.reviewDate ?? null,
        notes: input.notes ?? '',
        sealedReward: input.sealedReward?.trim() ?? '',
        achievedAt: null,
        rank: siblings.reduce((m, g) => Math.max(m, g.rank), 0) + 1,
        createdAt: at,
        updatedAt: at,
      };
      this.validateGoal(goal, all);
      await this.db.goals.add(goal);
      if (goal.current !== null && goal.current !== 0) {
        await this.db.goalUpdates.add({ id: uuid(), goalId: goal.id, dateKey, at, kind: 'value', value: goal.current, previous: null, note: 'Starting point' });
      }
      return goal;
    });
  }

  async updateGoal(id: ID, patch: Partial<GoalInput>): Promise<Goal> {
    return this.db.transaction('rw', this.db.goals, async () => {
      const all = await this.db.goals.toArray();
      const goal = all.find((g) => g.id === id);
      if (!goal) throw new ValidationError('That goal no longer exists.');
      const mode = patch.measurementMode ?? goal.measurementMode;
      const next: Goal = {
        ...goal,
        ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
        title: (patch.title ?? goal.title).trim(),
        measurementMode: mode,
        updatedAt: this.iso(),
      };
      if (mode !== goal.measurementMode) {
        // Switching measure keeps history; the new mode starts from its own evidence.
        next.current = mode === 'numeric' ? (patch.current ?? 0) : mode === 'manual' ? (patch.current ?? null) : null;
        if (mode !== 'numeric') {
          next.target = null;
          next.unit = '';
        }
      }
      this.validateGoal(next, all);
      await this.db.goals.put(next);
      return next;
    });
  }

  /** Logs a new value (numeric total or manual percent) as an append-only update. */
  async logGoalValue(id: ID, value: number, note: string, dateKey: DateKey): Promise<Goal> {
    return this.db.transaction('rw', this.db.goals, this.db.goalUpdates, async () => {
      const goal = await this.db.goals.get(id);
      if (!goal) throw new ValidationError('That goal no longer exists.');
      if (goal.measurementMode !== 'numeric' && goal.measurementMode !== 'manual') throw new ValidationError('This goal is measured another way.');
      if (!Number.isFinite(value)) throw new ValidationError('Enter a number.');
      if (goal.measurementMode === 'manual' && (value < 0 || value > 100)) throw new ValidationError('Percent must be between 0 and 100.');
      const at = this.iso();
      await this.db.goalUpdates.add({ id: uuid(), goalId: id, dateKey, at, kind: 'value', value, previous: goal.current, note: note.trim() });
      const next = { ...goal, current: value, updatedAt: at };
      await this.db.goals.put(next);
      return next;
    });
  }

  /** A written check-in with no number: still counts for the goal's streak. */
  async logGoalNote(id: ID, note: string, dateKey: DateKey): Promise<void> {
    if (!note.trim()) throw new ValidationError('Write something first.');
    await this.db.goalUpdates.add({ id: uuid(), goalId: id, dateKey, at: this.iso(), kind: 'note', value: null, previous: null, note: note.trim() });
  }

  async setGoalStatus(id: ID, status: GoalStatus, dateKey: DateKey): Promise<Goal> {
    return this.db.transaction('rw', this.db.goals, this.db.goalUpdates, async () => {
      const goal = await this.db.goals.get(id);
      if (!goal) throw new ValidationError('That goal no longer exists.');
      const at = this.iso();
      const next: Goal = { ...goal, status, achievedAt: status === 'achieved' ? (goal.achievedAt ?? at) : status === 'active' ? null : goal.achievedAt, updatedAt: at };
      await this.db.goals.put(next);
      await this.db.goalUpdates.add({ id: uuid(), goalId: id, dateKey, at, kind: 'status', value: null, previous: null, note: status });
      return next;
    });
  }

  async addMilestone(goalId: ID, title: string, weight = 1): Promise<Milestone> {
    if (!title.trim()) throw new ValidationError('Give the milestone a name.');
    if (!(weight > 0)) throw new ValidationError('Weight must be above zero.');
    const existing = await this.db.milestones.where('goalId').equals(goalId).toArray();
    const m: Milestone = { id: uuid(), goalId, title: title.trim(), weight, achievedAt: null, archivedAt: null, rank: existing.reduce((x, e) => Math.max(x, e.rank), 0) + 1 };
    await this.db.milestones.add(m);
    return m;
  }

  async setMilestoneAchieved(id: ID, achieved: boolean, dateKey: DateKey): Promise<void> {
    await this.db.transaction('rw', this.db.milestones, this.db.goalUpdates, async () => {
      const m = await this.db.milestones.get(id);
      if (!m) return;
      const at = this.iso();
      await this.db.milestones.update(id, { achievedAt: achieved ? at : null });
      if (achieved) await this.db.goalUpdates.add({ id: uuid(), goalId: m.goalId, dateKey, at, kind: 'milestone', value: null, previous: null, note: m.title });
    });
  }

  async archiveMilestone(id: ID, archived: boolean): Promise<void> {
    await this.db.milestones.update(id, { archivedAt: archived ? this.iso() : null });
  }

  async setTaskGoals(taskId: ID, goalIds: ID[]): Promise<Task> {
    return this.updateTask(taskId, { goalIds: [...new Set(goalIds)] });
  }

  // ---------- Habits (repeating tasks tied to a goal) ----------

  async addHabit(input: { goalId: ID; title: string; category: Category; rule: RecurrenceRule; startDate: DateKey; effort?: Effort }): Promise<TaskSeries> {
    return this.createSeries({ title: input.title, category: input.category, effort: input.effort, scheduledDate: input.startDate, rule: input.rule, goalIds: [input.goalId] });
  }

  async resumeSeries(id: ID, fromDate: DateKey): Promise<void> {
    await this.db.taskSeries.update(id, { stoppedAt: null, updatedAt: this.iso() });
    await this.ensureOccurrences(fromDate, fromDate);
  }

  async renameSeries(id: ID, title: string): Promise<void> {
    await this.db.taskSeries.update(id, { title: normalizeTitle(title), updatedAt: this.iso() });
  }

  // ---------- Period direction (today, this week, this month) ----------

  async saveDirection(input: { kind: PeriodDirection['kind']; periodKey: string; startDate: DateKey; endDate: DateKey; intention: string; desiredOutcome?: string; review?: string }): Promise<PeriodDirection> {
    return this.db.transaction('rw', this.db.periodDirections, async () => {
      const existing = await this.db.periodDirections.where('[kind+periodKey]').equals([input.kind, input.periodKey]).first();
      const at = this.iso();
      if (!existing) {
        const created: PeriodDirection = {
          id: uuid(),
          kind: input.kind,
          periodKey: input.periodKey,
          startDate: input.startDate,
          endDate: input.endDate,
          intention: input.intention.trim(),
          desiredOutcome: input.desiredOutcome?.trim() ?? '',
          review: input.review?.trim() ?? '',
          updatedAt: at,
          version: 1,
          history: [],
        };
        await this.db.periodDirections.add(created);
        return created;
      }
      const next: PeriodDirection = {
        ...existing,
        intention: input.intention.trim(),
        desiredOutcome: input.desiredOutcome?.trim() ?? existing.desiredOutcome,
        review: input.review?.trim() ?? existing.review,
        updatedAt: at,
        version: existing.version + 1,
        history: [...(existing.history ?? []), { at: existing.updatedAt, intention: existing.intention, desiredOutcome: existing.desiredOutcome, review: existing.review }].slice(-MAX_DIRECTION_HISTORY),
      };
      await this.db.periodDirections.put(next);
      return next;
    });
  }

  /** The local date "now" in a zone, from this repository's clock. */
  todayIn(timeZone: string): DateKey {
    return dateKeyInZone(this.now(), timeZone);
  }
}
