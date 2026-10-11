import { isDateKey } from '../date/localDate';
import { SCHEMA_VERSION, type AppDatabase } from './db';

/**
 * Versioned JSON backups of everything: every table, including the XP ledger,
 * unlocks, revisions and preferences stored in the database. Restores are
 * validated in full before anything is written, run in one transaction (a
 * bad file changes nothing), and are preceded by an automatic snapshot of the
 * current data so an import can be undone.
 */

export const BACKUP_FORMAT = 'pursuit-of-greatness-backup';
export const BACKUP_FORMAT_VERSION = 1;

export const TABLES = [
  'kv', 'plans', 'goals', 'milestones', 'goalUpdates', 'periodDirections', 'taskSeries', 'tasks', 'taskMoves',
  'entries', 'entryRevisions', 'xpEvents', 'achievements', 'cosmetics', 'earnings',
  'contentLog',
] as const;
export type TableName = (typeof TABLES)[number];

export const TABLE_LABEL: Record<TableName, string> = {
  kv: 'Profile and settings',
  plans: 'Vision plans',
  goals: 'Goals',
  milestones: 'Milestones',
  goalUpdates: 'Goal check-ins',
  periodDirections: 'Directions and reviews',
  taskSeries: 'Repeating tasks',
  tasks: 'Tasks',
  taskMoves: 'Task moves',
  entries: 'Journal entries',
  entryRevisions: 'Entry history',
  xpEvents: 'XP ledger events',
  achievements: 'Badges',
  cosmetics: 'Unlocks',
  earnings: 'Earnings',
  contentLog: 'Content log',
};

type Row = Record<string, unknown>;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  app: string;
  tables: Record<TableName, Row[]>;
}

/** Key-value rows that belong to this device's install, never imported over the current ones. */
const LOCAL_ONLY_KV = new Set(['meta', 'preImportBackup']);

export async function exportBackup(db: AppDatabase, now: Date): Promise<Backup> {
  const tables = {} as Record<TableName, Row[]>;
  await db.transaction('r', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      const rows = (await db.table(t).toArray()) as Row[];
      tables[t] = t === 'kv' ? rows.filter((r) => r.key !== 'preImportBackup') : rows;
    }
  });
  return { format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), app: 'Pursuit of Greatness', tables };
}

export function backupFileName(day: string): string {
  return `pursuit-backup-${day}.json`;
}

// ---------- Validation ----------

export interface Validation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  backup: Backup | null;
  counts: Partial<Record<TableName, number>>;
}

const str = (v: unknown) => typeof v === 'string';
const strOrNull = (v: unknown) => v === null || v === undefined || typeof v === 'string';
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const strArr = (v: unknown) => Array.isArray(v) && v.every(str);

/** Minimal shape rules per table: enough that the app can open every imported record. */
const RULES: Partial<Record<TableName, (r: Row) => string | null>> = {
  plans: (r) => (!str(r.title) ? 'title' : !isDateKey(r.startDate as string) || !isDateKey(r.endDate as string) ? 'dates' : !['decade', 'year', 'sprint'].includes(r.kind as string) ? 'kind' : null),
  goals: (r) => (!str(r.title) ? 'title' : !strOrNull(r.planId) || !strOrNull(r.parentId) ? 'links' : !['active', 'achieved', 'paused', 'archived'].includes(r.status as string) ? 'status' : null),
  milestones: (r) => (!str(r.goalId) ? 'goalId' : !str(r.title) ? 'title' : null),
  taskSeries: (r) => (!str(r.title) && !str(r.titleTemplate) ? 'title' : null),
  tasks: (r) =>
    !str(r.title) ? 'title'
      : !['todo', 'in-progress', 'completed', 'canceled'].includes(r.status as string) ? 'status'
        : !['learning', 'doing'].includes(r.category as string) ? 'category'
          : r.scheduledDate != null && !isDateKey(r.scheduledDate as string) ? 'scheduledDate'
            : !strArr(r.goalIds ?? []) ? 'goalIds' : null,
  entries: (r) => (!isDateKey(r.dateKey as string) ? 'dateKey' : !str(r.plainText) ? 'plainText' : !strArr(r.taskIds) ? 'taskIds' : !['learning', 'doing', 'reflection'].includes(r.kind as string) ? 'kind' : null),
  entryRevisions: (r) => (!str(r.entryId) ? 'entryId' : null),
  xpEvents: (r) => (!str(r.eventKey) ? 'eventKey' : !num(r.delta) ? 'delta' : !isDateKey(r.earnedDate as string) ? 'earnedDate' : null),
  achievements: (r) => (!str(r.achievementId) ? 'achievementId' : null),
  cosmetics: (r) => (!str(r.cosmeticId) ? 'cosmeticId' : null),
  earnings: (r) => (!num(r.amount) || (r.amount as number) <= 0 ? 'amount' : !isDateKey(r.dateKey as string) ? 'dateKey' : null),
  contentLog: (r) =>
    !isDateKey(r.dateKey as string) ? 'dateKey'
      : !num(r.posts) || (r.posts as number) < 0 ? 'posts'
        : r.audience != null && (!num(r.audience) || (r.audience as number) < 0) ? 'audience' : null,
  goalUpdates: (r) => (!str(r.goalId) ? 'goalId' : null),
  taskMoves: (r) => (!str(r.taskId) ? 'taskId' : null),
  periodDirections: (r) => (!['day', 'week', 'month'].includes(r.kind as string) ? 'kind' : !str(r.periodKey) ? 'periodKey' : null),
};

/** Checks a parsed file without touching the database. */
export function validateBackup(raw: unknown): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const counts: Partial<Record<TableName, number>> = {};
  const fail = (msg: string): Validation => ({ ok: false, errors: [msg], warnings, backup: null, counts });

  if (!raw || typeof raw !== 'object') return fail('This file is not a backup.');
  const b = raw as Partial<Backup>;
  if (b.format !== BACKUP_FORMAT) return fail('This file is not a Pursuit of Greatness backup.');
  if (!num(b.formatVersion) || b.formatVersion! > BACKUP_FORMAT_VERSION) return fail('This backup was made by a newer version of the app. Update the app first.');
  if (!num(b.schemaVersion) || b.schemaVersion! > SCHEMA_VERSION) return fail('This backup uses a newer data format than this app understands.');
  if (!b.tables || typeof b.tables !== 'object') return fail('The backup has no data section.');

  for (const name of Object.keys(b.tables)) {
    if (!(TABLES as readonly string[]).includes(name)) warnings.push(`Ignored an unknown section "${name}".`);
  }
  const ids = new Map<TableName, Set<string>>();
  for (const t of TABLES) {
    const rows = (b.tables as Record<string, unknown>)[t];
    if (rows === undefined) {
      counts[t] = 0;
      ids.set(t, new Set());
      continue;
    }
    if (!Array.isArray(rows)) {
      errors.push(`${TABLE_LABEL[t]}: not a list.`);
      continue;
    }
    const keyField = t === 'kv' ? 'key' : 'id';
    const seen = new Set<string>();
    let bad = 0;
    let firstBad = '';
    for (const r of rows) {
      if (!r || typeof r !== 'object') {
        bad++;
        continue;
      }
      const key = (r as Row)[keyField];
      if (!str(key) || !(key as string)) {
        bad++;
        firstBad ||= `missing ${keyField}`;
        continue;
      }
      if (seen.has(key as string)) {
        errors.push(`${TABLE_LABEL[t]}: the same record appears twice (${key as string}).`);
        break;
      }
      seen.add(key as string);
      const problem = RULES[t]?.(r as Row);
      if (problem) {
        bad++;
        firstBad ||= `bad ${problem}`;
      }
    }
    if (bad) errors.push(`${TABLE_LABEL[t]}: ${bad} damaged record${bad === 1 ? '' : 's'} (${firstBad}).`);
    counts[t] = rows.length;
    ids.set(t, seen);
  }
  if (errors.length) return { ok: false, errors, warnings, backup: null, counts };

  // References: broken links are survivable (the app shows "Archived"), so they warn rather than block.
  const tables = b.tables as Record<TableName, Row[]>;
  const missing = (rows: Row[], field: string, target: TableName, many = false) =>
    rows.filter((r) => {
      const v = r[field];
      if (many) return ((v as string[] | undefined) ?? []).some((id) => !ids.get(target)!.has(id));
      return typeof v === 'string' && !ids.get(target)!.has(v);
    }).length;
  const links: [TableName, string, TableName, boolean][] = [
    ['milestones', 'goalId', 'goals', false],
    ['goals', 'planId', 'plans', false],
    ['tasks', 'seriesId', 'taskSeries', false],
    ['entries', 'taskIds', 'tasks', true],
    ['entryRevisions', 'entryId', 'entries', false],
  ];
  for (const [t, field, target, many] of links) {
    const n = missing(tables[t] ?? [], field, target, many);
    if (n) warnings.push(`${n} ${TABLE_LABEL[t].toLowerCase()} point to ${TABLE_LABEL[target].toLowerCase()} that are not in the file.`);
  }
  return { ok: true, errors, warnings, backup: b as Backup, counts };
}

export function parseBackupText(text: string): Validation {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['This file is not valid JSON, so it cannot be a backup.'], warnings: [], backup: null, counts: {} };
  }
  return validateBackup(raw);
}

// ---------- Comparing with current data ----------

export interface ImportPreview {
  /** Per table: records new to this device, and records present in both with different content. */
  added: Partial<Record<TableName, number>>;
  changed: Partial<Record<TableName, number>>;
  totalAdded: number;
  totalChanged: number;
}

const keyOf = (t: TableName, r: Row) => (t === 'kv' ? (r.key as string) : (r.id as string));

export async function previewImport(db: AppDatabase, backup: Backup): Promise<ImportPreview> {
  const added: ImportPreview['added'] = {};
  const changed: ImportPreview['changed'] = {};
  let totalAdded = 0;
  let totalChanged = 0;
  for (const t of TABLES) {
    const current = new Map(((await db.table(t).toArray()) as Row[]).map((r) => [keyOf(t, r), r]));
    let a = 0;
    let c = 0;
    for (const r of backup.tables[t] ?? []) {
      if (t === 'kv' && LOCAL_ONLY_KV.has(r.key as string)) continue;
      const mine = current.get(keyOf(t, r));
      if (!mine) a++;
      else if (JSON.stringify(mine) !== JSON.stringify(r)) c++;
    }
    if (a) added[t] = a;
    if (c) changed[t] = c;
    totalAdded += a;
    totalChanged += c;
  }
  return { added, changed, totalAdded, totalChanged };
}

// ---------- Restoring ----------

export type ImportMode = 'merge' | 'replace';

export interface ImportResult {
  added: number;
  updated: number;
  kept: number;
}

const stamp = (r: Row): string => (str(r.updatedAt) ? (r.updatedAt as string) : str(r.recordedAt) ? (r.recordedAt as string) : '');

/** Unique indexes other than the primary key: an incoming row that would collide is skipped in a merge. */
const UNIQUE: Partial<Record<TableName, (r: Row) => string | null>> = {
  xpEvents: (r) => r.eventKey as string,
  achievements: (r) => r.achievementId as string,
  cosmetics: (r) => r.cosmeticId as string,
  periodDirections: (r) => `${r.kind as string}|${r.periodKey as string}`,
  tasks: (r) => (r.seriesId && r.occurrenceDate ? `${r.seriesId as string}|${r.occurrenceDate as string}` : null),
};

/**
 * Writes a validated backup. Replace swaps all data for the file's. Merge
 * adds what is new and, for records in both, keeps whichever was changed
 * more recently. Either way it is one transaction: any failure leaves the
 * current data exactly as it was.
 */
export async function importBackup(db: AppDatabase, backup: Backup, mode: ImportMode): Promise<ImportResult> {
  const result: ImportResult = { added: 0, updated: 0, kept: 0 };
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      const table = db.table(t);
      const incoming = (backup.tables[t] ?? []).filter((r) => !(t === 'kv' && LOCAL_ONLY_KV.has(r.key as string)));
      if (mode === 'replace') {
        if (t === 'kv') {
          const keep = ((await table.toArray()) as Row[]).filter((r) => LOCAL_ONLY_KV.has(r.key as string));
          await table.clear();
          await table.bulkPut([...keep, ...incoming]);
        } else {
          await table.clear();
          await table.bulkAdd(incoming);
        }
        result.added += incoming.length;
        continue;
      }
      const currentRows = (await table.toArray()) as Row[];
      const current = new Map(currentRows.map((r) => [keyOf(t, r), r]));
      const unique = UNIQUE[t];
      const taken = new Map<string, string>();
      if (unique) for (const r of currentRows) {
        const u = unique(r);
        if (u) taken.set(u, keyOf(t, r));
      }
      const writes: Row[] = [];
      for (const r of incoming) {
        const k = keyOf(t, r);
        const mine = current.get(k);
        if (unique) {
          const u = unique(r);
          if (u && taken.has(u) && taken.get(u) !== k) {
            result.kept++;
            continue;
          }
        }
        if (!mine) {
          writes.push(r);
          result.added++;
        } else if (t === 'kv') {
          // Profile and choices on this device win; lists such as principles are combined.
          if (r.key === 'principles' && Array.isArray(r.value) && Array.isArray(mine.value)) {
            const have = new Set((mine.value as Row[]).map((p) => p.id));
            const extra = (r.value as Row[]).filter((p) => !have.has(p.id));
            if (extra.length) {
              writes.push({ key: 'principles', value: [...(mine.value as Row[]), ...extra] });
              result.updated++;
            } else result.kept++;
          } else result.kept++;
        } else if (stamp(r) > stamp(mine)) {
          writes.push(r);
          result.updated++;
        } else result.kept++;
      }
      if (writes.length) await table.bulkPut(writes);
    }
  });
  return result;
}
