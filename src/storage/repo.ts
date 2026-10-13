import type { JSONContent } from '@tiptap/core';
import { OUTFITS } from '../domain/wardrobe';
import { dateKeyInZone, type DateKey } from '../date/localDate';
import { PLAN_DEFAULTS, PROFILE_DEFAULTS, RULES_VERSION, type Category, type Effort } from '../domain/config';
import type {
  ContentEntry, EarningEntry, Instant, EntryKind, Principle, EntryRevision, Goal, GoalStatus, ID, JournalEntry, MeasurementMode, Milestone, PeriodDirection,
  Priority, Profile, RecurrenceRule, SchemaMeta, Task, TaskMove, TaskSeries, TaskStatus, VisionPlan, XPEvent,
} from '../domain/models';
import { wouldCreateCycle } from '../domain/goals';
import { RECURRENCE_HORIZON_DAYS, seriesOccursOn } from '../domain/recurrence';
import { normalizeTitle, rankBetween, ValidationError, withStatus } from '../domain/tasks';
import { addDays, compareKeys } from '../date/localDate';
import { desiredAwards, reconcile } from '../domain/ledger';
import { chestPlatform, cosmeticId, platformById, type Platform } from '../domain/unlocks';
import type { BadgeId } from '../domain/config';
import { exportBackup, importBackup, TABLES, type Backup, type ImportMode, type ImportResult } from './backup';
import { SCHEMA_VERSION, type AppDatabase } from './db';

export const uuid = (): ID => crypto.randomUUID();

/** Thrown when an entry was saved elsewhere (another tab) since this draft loaded. */
export class ConflictError extends Error {
  constructor(public readonly current: JournalEntry) {
    super('This entry was changed somewhere else.');
    this.name = 'ConflictError';
  }
}

/** Thrown when a task or goal was changed elsewhere (another tab or window) while an edit form was open. */
export class StaleEditError extends Error {
  constructor(what: 'task' | 'goal') {
    super(`This ${what} was changed in another tab or window while you were editing.`);
    this.name = 'StaleEditError';
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

export interface CoachNote {
  model: string;
  text: string;
  createdAt: Instant;
}

export const coachNoteKey = (kind: 'week' | 'month', start: DateKey) => `coach:${kind}:${start}`;

const KV = { profile: 'profile', meta: 'meta', outfit: 'outfit', wearing: 'wearing', platform: 'platform', principles: 'principles', preImport: 'preImportBackup', cloudBase: 'cloudBase' } as const;

/**
 * Typed storage operations. Components call these instead of touching
 * IndexedDB, so a sync service could later implement the same surface.
 * Every multi-record change runs in one transaction.
 */
/** Starter plans have fixed ids, so every device agrees on them. */
export const defaultPlanId = (kind: string) => `plan-${kind}`;

export class Repository {
  constructor(
    readonly db: AppDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private iso(): string {
    return this.now().toISOString();
  }

  // ---------- Setup ----------

  /**
   * Creates the profile, metadata and the three original plans exactly once.
   * Also safe after storage was emptied and refilled from the account: only
   * what is missing is added, nothing already there is overwritten.
   */
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
        id: defaultPlanId(p.kind),
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
      await this.db.kv.put({ key: KV.meta, value: meta });
      if (!(await this.db.kv.get(KV.profile))) await this.db.kv.put({ key: KV.profile, value: profile });
      const have = new Set(await this.db.plans.toCollection().primaryKeys());
      await this.db.plans.bulkAdd(plans.filter((p) => !have.has(p.id)));
    });
  }

  /**
   * Keeps exactly one of each starter plan. Starter plans used to get random
   * ids, so a device that opened with empty storage could add a second set
   * that then merged in. Copies of a starter plan (same kind and dates) are
   * folded into one with the fixed id: goals move to it, written text is kept
   * (the most-written copy wins; empty fields are filled from the others).
   * Returns how many copies were removed.
   */
  async dedupeStarterPlans(): Promise<number> {
    return this.db.transaction('rw', this.db.plans, this.db.goals, async () => {
      let removed = 0;
      const all = await this.db.plans.toArray();
      const goals = await this.db.goals.toArray();
      for (const d of PLAN_DEFAULTS) {
        const id = defaultPlanId(d.kind);
        const copies = all.filter((p) => p.kind === d.kind && p.startDate === d.startDate && p.endDate === d.endDate);
        if (!copies.length || (copies.length === 1 && copies[0]!.id === id)) continue;
        const TEXT = ['statement', 'notes', 'successCriteria', 'review'] as const;
        const score = (p: VisionPlan) => goals.filter((g) => g.planId === p.id).length * 10 + TEXT.filter((f) => p[f].trim()).length + (p.finishedAt ? 1 : 0) + (p.title !== d.title ? 1 : 0);
        const ranked = [...copies].sort((a, b) => score(b) - score(a) || (b.updatedAt > a.updatedAt ? 1 : b.updatedAt < a.updatedAt ? -1 : 0) || a.createdAt.localeCompare(b.createdAt));
        const best = ranked[0]!;
        const kept: VisionPlan = { ...best, id, createdAt: copies.reduce((min, p) => (p.createdAt < min ? p.createdAt : min), best.createdAt) };
        for (const f of TEXT) if (!kept[f].trim()) kept[f] = ranked.find((p) => p[f].trim())?.[f] ?? '';
        kept.finishedAt = kept.finishedAt ?? ranked.find((p) => p.finishedAt)?.finishedAt ?? null;
        const oldIds = new Set(copies.map((p) => p.id));
        for (const g of goals) if (g.planId && oldIds.has(g.planId) && g.planId !== id) await this.db.goals.update(g.id, { planId: id });
        await this.db.plans.bulkDelete(copies.map((p) => p.id).filter((x) => x !== id));
        await this.db.plans.put(kept);
        removed += copies.length - 1;
      }
      return removed;
    });
  }

  // ---------- XP ledger ----------

  /**
   * Appends whatever compensating events make the ledger match the source
   * records. Always runs inside the caller's transaction, which must include
   * tasks, entries and xpEvents.
   */
  private async syncLedger(): Promise<XPEvent[]> {
    const [tasks, entries, events] = await Promise.all([
      this.db.tasks.filter((t) => !!t.award).toArray(),
      this.db.entries.filter((e) => !!e.documentedAt).toArray(),
      this.db.xpEvents.toArray(),
    ]);
    const added = reconcile(desiredAwards(tasks, entries), events, uuid, this.iso());
    if (added.length) await this.db.xpEvents.bulkAdd(added);
    return added;
  }

  private async heldXp(sourceType: XPEvent['sourceType'], sourceId: string): Promise<number> {
    const events = await this.db.xpEvents.where('sourceId').equals(sourceId).toArray();
    return events.filter((e) => e.sourceType === sourceType).reduce((sum, e) => sum + e.delta, 0);
  }

  /** Brings the ledger up to date with the records (on startup, so data from before stage 5 earns its XP). */
  async repairLedger(): Promise<number> {
    return this.db.transaction('rw', this.db.tasks, this.db.entries, this.db.xpEvents, async () => (await this.syncLedger()).length);
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

  /** Name, time zone and week start. Past day keys never move when the zone changes. */
  async updateProfile(patch: Partial<Pick<Profile, 'displayName' | 'timeZone' | 'weekStart'>>): Promise<Profile> {
    return this.db.transaction('rw', this.db.kv, async () => {
      const current = await this.getProfile();
      const displayName = patch.displayName !== undefined ? patch.displayName.trim() : current.displayName;
      if (!displayName) throw new ValidationError('Enter a name.');
      if (displayName.length > 60) throw new ValidationError('Keep the name to 60 characters.');
      if (patch.timeZone !== undefined) {
        try {
          new Intl.DateTimeFormat('en', { timeZone: patch.timeZone });
        } catch {
          throw new ValidationError('That time zone is not recognised.');
        }
      }
      const next: Profile = { ...current, ...patch, displayName, updatedAt: this.iso() };
      await this.db.kv.put({ key: KV.profile, value: next });
      return next;
    });
  }

  // ---------- Backup, restore, reset ----------

  /** A full backup; also records when the last one was made. */
  async createBackup(): Promise<Backup> {
    const backup = await exportBackup(this.db, this.now());
    await this.db.transaction('rw', this.db.kv, async () => {
      const meta = await this.getMeta();
      if (meta) await this.db.kv.put({ key: KV.meta, value: { ...meta, lastBackupAt: backup.exportedAt } });
    });
    return backup;
  }

  /**
   * Restores a validated backup. A snapshot of the current data is kept first
   * so `undoImport` can put everything back.
   */
  async restoreBackup(backup: Backup, mode: ImportMode): Promise<ImportResult> {
    const snapshot = await exportBackup(this.db, this.now());
    await this.db.kv.put({ key: KV.preImport, value: snapshot });
    const result = await importBackup(this.db, backup, mode);
    await this.repairLedger();
    return result;
  }

  async preImportSnapshot(): Promise<Backup | null> {
    return ((await this.db.kv.get(KV.preImport))?.value as Backup | undefined) ?? null;
  }

  async undoImport(): Promise<void> {
    const snapshot = await this.preImportSnapshot();
    if (!snapshot) throw new ValidationError('There is no import to undo.');
    await importBackup(this.db, snapshot, 'replace');
    await this.db.kv.delete(KV.preImport);
    await this.repairLedger();
  }

  /** Erases every record on this device, then starts fresh with the original plans. */
  async eraseAll(): Promise<void> {
    await this.db.transaction('rw', TABLES.map((t) => this.db.table(t)), async () => {
      // Keeps the account-sync marker, so the empty state is saved as a deliberate erase, not mistaken for lost storage.
      const base = await this.db.kv.get(KV.cloudBase);
      for (const t of TABLES) await this.db.table(t).clear();
      if (base) await this.db.kv.put(base);
    });
    await this.ensureInitialized();
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

  /** `baseRevision`, when given, is the revision the edit form started from; a newer stored revision is a conflict. */
  async updateTask(id: ID, patch: TaskPatch, baseRevision?: number): Promise<Task> {
    return this.db.transaction('rw', this.db.tasks, this.db.entries, this.db.xpEvents, async () => {
      const task = await this.mustGetTask(id);
      if (baseRevision !== undefined && task.revision !== baseRevision) throw new StaleEditError('task');
      const next: Task = {
        ...task,
        ...patch,
        title: patch.title !== undefined ? normalizeTitle(patch.title) : task.title,
        updatedAt: this.iso(),
        revision: task.revision + 1,
      };
      await this.db.tasks.put(next);
      // Reclassifying a completed task moves its frozen award between tracks.
      if (next.award && next.category !== task.category) await this.syncLedger();
      return next;
    });
  }

  /**
   * Changes status and settles the XP ledger in the same transaction. `xp` is
   * the net change for this task's completion; `capped` means the task was
   * recorded but today's track cap held back some or all of its reward.
   */
  async setTaskStatus(id: ID, status: TaskStatus, timeZone: string): Promise<{ before: Task; after: Task; xp: number; capped: boolean }> {
    return this.db.transaction('rw', this.db.tasks, this.db.entries, this.db.xpEvents, async () => {
      const before = await this.mustGetTask(id);
      const after = withStatus(before, status, this.now(), timeZone);
      if (after !== before) await this.db.tasks.put(after);
      const added = await this.syncLedger();
      const xp = added.filter((e) => e.sourceId === id && e.sourceType === 'task-completion').reduce((sum, e) => sum + e.delta, 0);
      const held = await this.heldXp('task-completion', id);
      const capped = status === 'completed' && before.status !== 'completed' && !!after.award && held < after.award.nominalXp;
      return { before, after, xp, capped };
    });
  }

  /** Soft delete; `restoreTask` brings it back with its completion and award intact. */
  async deleteTasks(ids: ID[]): Promise<void> {
    await this.db.transaction('rw', this.db.tasks, this.db.entries, this.db.xpEvents, async () => {
      const at = this.iso();
      for (const id of ids) {
        const task = await this.db.tasks.get(id);
        if (task && !task.deletedAt) await this.db.tasks.put({ ...task, deletedAt: at, updatedAt: at, revision: task.revision + 1 });
      }
      await this.syncLedger();
    });
  }

  async restoreTasks(ids: ID[]): Promise<void> {
    await this.db.transaction('rw', this.db.tasks, this.db.entries, this.db.xpEvents, async () => {
      for (const id of ids) {
        const task = await this.db.tasks.get(id);
        if (task?.deletedAt) await this.db.tasks.put({ ...task, deletedAt: null, updatedAt: this.iso(), revision: task.revision + 1 });
      }
      // Undo restores the earlier allocation instead of awarding something new.
      await this.syncLedger();
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
    return this.db.transaction('rw', this.db.entries, this.db.entryRevisions, this.db.tasks, this.db.xpEvents, async () => {
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
      if (current.documentedAt && !next.documentedAt) await this.syncLedger();
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
    return this.db.transaction('rw', this.db.entries, this.db.entryRevisions, this.db.tasks, this.db.xpEvents, async () => {
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
    return this.db.transaction('rw', this.db.entries, this.db.tasks, this.db.xpEvents, async () => {
      const current = await this.db.entries.get(id);
      if (!current) throw new ValidationError('This entry no longer exists.');
      const next = { ...current, ...patch, updatedAt: this.iso(), revision: current.revision + 1 };
      await this.db.entries.put(next);
      if (current.documentedAt && (patch.taskIds || patch.kind)) await this.syncLedger();
      return next;
    });
  }

  /** Documented requires an explicit choice and nonblank text. */
  async setDocumented(id: ID, documented: boolean): Promise<JournalEntry> {
    return this.db.transaction('rw', this.db.entries, this.db.tasks, this.db.xpEvents, async () => {
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
      await this.syncLedger();
      return next;
    });
  }

  async deleteEntry(id: ID): Promise<void> {
    await this.db.transaction('rw', this.db.entries, this.db.entryRevisions, this.db.tasks, this.db.xpEvents, async () => {
      const current = await this.db.entries.get(id);
      if (!current || current.deletedAt) return;
      await this.checkpoint({ ...current, updatedAt: this.iso() }, 'before-delete');
      await this.db.entries.put({ ...current, deletedAt: this.iso(), updatedAt: this.iso(), revision: current.revision + 1 });
      if (current.documentedAt) await this.syncLedger();
    });
  }

  async restoreEntry(id: ID): Promise<void> {
    await this.db.transaction('rw', this.db.entries, this.db.tasks, this.db.xpEvents, async () => {
      const current = await this.db.entries.get(id);
      if (current?.deletedAt) await this.db.entries.put({ ...current, deletedAt: null, updatedAt: this.iso(), revision: current.revision + 1 });
      if (current?.documentedAt) await this.syncLedger();
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
    return this.db.transaction('rw', this.db.entries, this.db.entryRevisions, this.db.tasks, this.db.xpEvents, async () => {
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
      if (current.documentedAt) await this.syncLedger();
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

  /** `baseUpdatedAt`, when given, is the goal's updatedAt when the edit form opened; anything newer is a conflict. */
  async updateGoal(id: ID, patch: Partial<GoalInput>, baseUpdatedAt?: string): Promise<Goal> {
    return this.db.transaction('rw', this.db.goals, async () => {
      const all = await this.db.goals.toArray();
      const goal = all.find((g) => g.id === id);
      if (!goal) throw new ValidationError('That goal no longer exists.');
      if (baseUpdatedAt !== undefined && goal.updatedAt !== baseUpdatedAt) throw new StaleEditError('goal');
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

  // ---------- Principles ----------

  async listPrinciples(): Promise<Principle[]> {
    return ((await this.db.kv.get(KV.principles))?.value as Principle[] | undefined) ?? [];
  }

  /** Runs a change on the ordered list in one transaction, so two tabs can't interleave. */
  private async changePrinciples(fn: (list: Principle[]) => Principle[]): Promise<Principle[]> {
    return this.db.transaction('rw', this.db.kv, async () => {
      const next = fn(await this.listPrinciples());
      await this.db.kv.put({ key: KV.principles, value: next });
      return next;
    });
  }

  async addPrinciple(input: { text: string; why?: string; top?: boolean }): Promise<Principle> {
    const text = input.text.trim().replace(/\s+/g, ' ');
    if (!text) throw new ValidationError('Write the principle first.');
    if (text.length > 280) throw new ValidationError('Keep a principle under 280 characters.');
    const at = this.iso();
    const created: Principle = { id: uuid(), text, why: (input.why ?? '').trim().slice(0, 2000), createdAt: at, updatedAt: at };
    await this.changePrinciples((list) => (input.top ? [created, ...list] : [...list, created]));
    return created;
  }

  async updatePrinciple(id: ID, patch: { text?: string; why?: string }): Promise<void> {
    const text = patch.text?.trim().replace(/\s+/g, ' ');
    if (text !== undefined && !text) throw new ValidationError('A principle cannot be empty.');
    if (text && text.length > 280) throw new ValidationError('Keep a principle under 280 characters.');
    await this.changePrinciples((list) =>
      list.map((p) => (p.id === id ? { ...p, ...(text !== undefined ? { text } : {}), ...(patch.why !== undefined ? { why: patch.why.trim().slice(0, 2000) } : {}), updatedAt: this.iso() } : p)),
    );
  }

  /** Moves a principle to a position; index 0 makes it the topmost. */
  async movePrinciple(id: ID, toIndex: number): Promise<void> {
    await this.changePrinciples((list) => {
      const from = list.findIndex((p) => p.id === id);
      if (from < 0) return list;
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item!);
      return next;
    });
  }

  /** Removes a principle and returns where it was, so Undo can put it back. */
  async deletePrinciple(id: ID): Promise<{ principle: Principle; index: number } | null> {
    let removed: { principle: Principle; index: number } | null = null;
    await this.changePrinciples((list) => {
      const index = list.findIndex((p) => p.id === id);
      if (index < 0) return list;
      removed = { principle: list[index]!, index };
      return list.filter((p) => p.id !== id);
    });
    return removed;
  }

  async restorePrinciple(principle: Principle, index: number): Promise<void> {
    await this.changePrinciples((list) => {
      if (list.some((p) => p.id === principle.id)) return list;
      const next = [...list];
      next.splice(Math.min(index, next.length), 0, principle);
      return next;
    });
  }

  // ---------- Earnings and outfit ----------

  async addEarning(input: { dateKey: DateKey; amount: number; note?: string }): Promise<EarningEntry> {
    const amount = Math.round(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('Enter an amount above zero.');
    if (amount > 1e13) throw new ValidationError('That amount is too large.');
    const at = this.iso();
    const entry: EarningEntry = { id: uuid(), dateKey: input.dateKey, amount, note: (input.note ?? '').trim().slice(0, 200), createdAt: at, updatedAt: at, deletedAt: null };
    await this.db.earnings.add(entry);
    return entry;
  }

  async deleteEarning(id: ID): Promise<void> {
    const at = this.iso();
    await this.db.earnings.update(id, { deletedAt: at, updatedAt: at });
  }

  async restoreEarning(id: ID): Promise<void> {
    await this.db.earnings.update(id, { deletedAt: null, updatedAt: this.iso() });
  }

  // ---------- Content log ----------

  /** Posts published on a day and, optionally, the audience size then. At least one is needed. */
  async addContent(input: { dateKey: DateKey; posts: number; audience?: number | null; note?: string }): Promise<ContentEntry> {
    const posts = Math.round(input.posts || 0);
    const audience = input.audience == null || Number.isNaN(input.audience) ? null : Math.round(input.audience);
    if (!Number.isFinite(posts) || posts < 0) throw new ValidationError('Posts cannot be negative.');
    if (posts > 100_000) throw new ValidationError('That is too many posts for one entry.');
    if (audience !== null && (!Number.isFinite(audience) || audience < 0 || audience > 1e10)) throw new ValidationError('Enter a real audience number.');
    if (posts === 0 && audience === null) throw new ValidationError('Enter posts published, your audience size, or both.');
    const at = this.iso();
    const entry: ContentEntry = { id: uuid(), dateKey: input.dateKey, posts, audience, note: (input.note ?? '').trim().slice(0, 200), createdAt: at, updatedAt: at, deletedAt: null };
    await this.db.contentLog.add(entry);
    return entry;
  }

  async deleteContent(id: ID): Promise<void> {
    const at = this.iso();
    await this.db.contentLog.update(id, { deletedAt: at, updatedAt: at });
  }

  async restoreContent(id: ID): Promise<void> {
    await this.db.contentLog.update(id, { deletedAt: null, updatedAt: this.iso() });
  }

  /** The vault outfit worn today. Every outfit is open, so only the id is checked. */
  async setWearing(outfitId: string): Promise<void> {
    if (!OUTFITS.some((o) => o.id === outfitId)) throw new ValidationError('That outfit is not in the vault.');
    await this.db.kv.put({ key: KV.wearing, value: outfitId });
  }

  /** The AI coach's notes for one report period, kept with the record (and in backups). */
  async saveCoachNote(kind: 'week' | 'month', start: DateKey, note: { model: string; text: string }): Promise<void> {
    const text = note.text.trim().slice(0, 12_000);
    if (!text) throw new ValidationError('The coach sent back nothing to save.');
    await this.db.kv.put({ key: coachNoteKey(kind, start), value: { model: note.model, text, createdAt: this.iso() } });
  }

  async deleteCoachNote(kind: 'week' | 'month', start: DateKey): Promise<void> {
    await this.db.kv.delete(coachNoteKey(kind, start));
  }

  /** The look shown on the platform: a rank form or an unlocked suit. */
  async setOutfit(outfitId: string): Promise<void> {
    await this.db.kv.put({ key: KV.outfit, value: outfitId });
  }

  // ---------- Unlocks ----------

  /**
   * Stores newly earned badges and cosmetics. Earned records are permanent;
   * this only ever adds. Returns reveal keys (`badge:<id>` or the cosmetic id)
   * for what is new.
   */
  async recordUnlocks(badges: Map<BadgeId, ID[]>, cosmetics: string[]): Promise<string[]> {
    return this.db.transaction('rw', this.db.achievements, this.db.cosmetics, async () => {
      const at = this.iso();
      const fresh: string[] = [];
      const haveBadges = new Set((await this.db.achievements.toArray()).map((a) => a.achievementId));
      for (const [id, sources] of badges) {
        if (haveBadges.has(id)) continue;
        await this.db.achievements.add({ id: uuid(), achievementId: id, unlockedAt: at, triggeringSourceIds: sources, ruleVersion: RULES_VERSION });
        fresh.push(`badge:${id}`);
      }
      const haveCosmetics = new Set((await this.db.cosmetics.toArray()).map((c) => c.cosmeticId));
      for (const id of cosmetics) {
        if (haveCosmetics.has(id)) continue;
        await this.db.cosmetics.add({ id: uuid(), cosmeticId: id, unlockedAt: at, ruleVersion: RULES_VERSION });
        fresh.push(id);
      }
      return fresh;
    });
  }

  /** Opens an achieved goal's reward chest once. The platform inside is fixed per goal. */
  async openChest(goalId: ID): Promise<Platform> {
    return this.db.transaction('rw', this.db.goals, this.db.cosmetics, async () => {
      const goal = await this.db.goals.get(goalId);
      if (!goal || goal.status !== 'achieved') throw new ValidationError('This chest opens when the goal is achieved.');
      const all = await this.db.cosmetics.toArray();
      const chestKey = cosmeticId.chest(goalId);
      const opened = all.find((c) => c.cosmeticId === chestKey);
      if (opened?.contents) return platformById(opened.contents.slice('stage:'.length));
      const owned = new Set(all.map((c) => c.cosmeticId));
      const platform = chestPlatform(goalId, owned);
      const stageKey = cosmeticId.platform(platform.id);
      const at = this.iso();
      await this.db.cosmetics.add({ id: uuid(), cosmeticId: chestKey, unlockedAt: at, ruleVersion: RULES_VERSION, contents: stageKey });
      if (!owned.has(stageKey)) await this.db.cosmetics.add({ id: uuid(), cosmeticId: stageKey, unlockedAt: at, ruleVersion: RULES_VERSION });
      return platform;
    });
  }

  /** The platform under the character. Only owned platforms can be equipped. */
  async setPlatform(platformId: string): Promise<void> {
    if (platformId !== 'base' && !(await this.db.cosmetics.where('cosmeticId').equals(cosmeticId.platform(platformId)).first())) {
      throw new ValidationError('Unlock this platform first.');
    }
    await this.db.kv.put({ key: KV.platform, value: platformId });
  }

  /** Finish Strong is an explicit choice, available from the sprint's last day. */
  async setSprintFinished(planId: ID, finished: boolean, today: DateKey): Promise<void> {
    await this.db.transaction('rw', this.db.plans, async () => {
      const plan = await this.db.plans.get(planId);
      if (!plan || plan.kind !== 'sprint') throw new ValidationError('Only a sprint can be finished strong.');
      if (finished && compareKeys(today, plan.endDate) < 0) throw new ValidationError('You can mark the sprint finished from its last day.');
      await this.db.plans.put({ ...plan, finishedAt: finished ? this.iso() : null, updatedAt: this.iso() });
    });
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

  /** Saves the written part of a weekly or monthly review, keeping the period's intention. */
  async saveReview(input: { kind: 'week' | 'month'; periodKey: string; startDate: DateKey; endDate: DateKey; review: string; blockers: string }): Promise<PeriodDirection> {
    return this.db.transaction('rw', this.db.periodDirections, async () => {
      const existing = await this.db.periodDirections.where('[kind+periodKey]').equals([input.kind, input.periodKey]).first();
      const at = this.iso();
      const review = input.review.trim();
      const blockers = input.blockers.trim();
      const wrote = !!(review || blockers);
      if (!existing) {
        const created: PeriodDirection = {
          id: uuid(),
          kind: input.kind,
          periodKey: input.periodKey,
          startDate: input.startDate,
          endDate: input.endDate,
          intention: '',
          desiredOutcome: '',
          review,
          blockers,
          reviewedAt: wrote ? at : null,
          updatedAt: at,
          version: 1,
          history: [],
        };
        await this.db.periodDirections.add(created);
        return created;
      }
      const next: PeriodDirection = {
        ...existing,
        review,
        blockers,
        reviewedAt: existing.reviewedAt ?? (wrote ? at : null),
        updatedAt: at,
        version: existing.version + 1,
        history: [
          ...(existing.history ?? []),
          { at: existing.updatedAt, intention: existing.intention, desiredOutcome: existing.desiredOutcome, review: existing.review, blockers: existing.blockers ?? '' },
        ].slice(-MAX_DIRECTION_HISTORY),
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
