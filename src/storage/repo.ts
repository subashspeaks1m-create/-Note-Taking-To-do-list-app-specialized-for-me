import type { JSONContent } from '@tiptap/core';
import { dateKeyInZone, type DateKey } from '../date/localDate';
import { PLAN_DEFAULTS, PROFILE_DEFAULTS, RULES_VERSION, type Category, type Effort } from '../domain/config';
import type {
  EntryKind, EntryRevision, ID, JournalEntry, Priority, Profile, RecurrenceRule, SchemaMeta, Task, TaskMove, TaskSeries,
  TaskStatus, VisionPlan,
} from '../domain/models';
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
        notes: '',
        successCriteria: '',
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

  /** The local date "now" in a zone, from this repository's clock. */
  todayIn(timeZone: string): DateKey {
    return dateKeyInZone(this.now(), timeZone);
  }
}
