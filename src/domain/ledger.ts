import type { DateKey } from '../date/localDate';
import { RULES_VERSION, XP_RULES, type Category } from './config';
import type { ID, JournalEntry, Task, XPEvent } from './models';

/**
 * The XP ledger (DATA_AND_GAME_RULES "XP defaults" and "Ledger and levels").
 *
 * Source records are the truth. `desiredAwards` works out, from them alone,
 * how much XP each source should hold right now after the daily caps;
 * `reconcile` compares that with what the append-only ledger already says
 * and returns the compensating events. Old events are never edited, so
 * complete/reopen, delete/undo and cap changes all leave an audit trail and
 * can never farm XP.
 */

export type SourceType = XPEvent['sourceType'];
export type Pool = Category | 'global';

export interface Award {
  sourceType: SourceType;
  sourceId: string;
  category: Pool;
  earnedDate: DateKey;
  /** XP before the cap. */
  nominal: number;
  /** XP after the cap. */
  amount: number;
  /** Earning order inside a cap bucket: first earned is first paid. */
  order: string;
}

const CAPS: Record<SourceType, number> = {
  'task-completion': XP_RULES.completionDailyCapPerTrack,
  documentation: XP_RULES.documentationDailyCapPerTrack,
  reflection: XP_RULES.dailyGlobalReflectionCap,
};

const isDocumented = (e: JournalEntry) => !e.deletedAt && !!e.documentedAt && e.plainText.trim().length > 0;
const isEarnedCompletion = (t: Task) => !t.deletedAt && t.status === 'completed' && !!t.award;

export const ledgerKey = (a: Pick<Award, 'sourceType' | 'sourceId' | 'category'>): string => `${a.sourceType}:${a.sourceId}:${a.category}`;

/** Every eligible source with its nominal reward, before caps. */
function eligibleSources(tasks: Task[], entries: JournalEntry[]): Omit<Award, 'amount'>[] {
  const out: Omit<Award, 'amount'>[] = [];
  const doneById = new Map<ID, Task>();
  for (const t of tasks) {
    if (!isEarnedCompletion(t)) continue;
    doneById.set(t.id, t);
    // The nominal amount, effort and earning day are frozen at first completion;
    // the current category decides the pool, so reclassifying moves the award.
    out.push({
      sourceType: 'task-completion',
      sourceId: t.id,
      category: t.category,
      earnedDate: t.award!.earnedDate,
      nominal: t.award!.nominalXp,
      order: `${t.award!.firstCompletedAt}|${t.id}`,
    });
  }

  // One documentation bonus per completed task, however many entries document it.
  const firstDoc = new Map<ID, JournalEntry>();
  const reflectionDays = new Map<DateKey, JournalEntry>();
  for (const e of entries) {
    if (!isDocumented(e)) continue;
    if (e.taskIds.length === 0) {
      if (e.kind !== 'reflection') continue;
      const prev = reflectionDays.get(e.dateKey);
      if (!prev || e.documentedAt! < prev.documentedAt!) reflectionDays.set(e.dateKey, e);
      continue;
    }
    for (const id of e.taskIds) {
      if (!doneById.has(id)) continue;
      const prev = firstDoc.get(id);
      if (!prev || e.documentedAt! < prev.documentedAt! || (e.documentedAt === prev.documentedAt && e.id < prev.id)) firstDoc.set(id, e);
    }
  }
  for (const [taskId, e] of firstDoc) {
    out.push({
      sourceType: 'documentation',
      sourceId: taskId,
      category: doneById.get(taskId)!.category,
      earnedDate: e.dateKey,
      nominal: XP_RULES.linkedDocumentationBonus,
      order: `${e.documentedAt}|${taskId}`,
    });
  }
  // A daily reflection is identified by its day, not the entry, so several reflections pay once.
  for (const [day, e] of reflectionDays) {
    out.push({
      sourceType: 'reflection',
      sourceId: `day:${day}`,
      category: 'global',
      earnedDate: day,
      nominal: XP_RULES.dailyReflectionBonus,
      order: `${e.documentedAt}|${e.id}`,
    });
  }
  return out;
}

/** What each source should hold now: nominal awards allocated in earning order until each day's cap runs out. */
export function desiredAwards(tasks: Task[], entries: JournalEntry[]): Map<string, Award> {
  const buckets = new Map<string, Omit<Award, 'amount'>[]>();
  for (const s of eligibleSources(tasks, entries)) {
    const bucket = `${s.sourceType}|${s.earnedDate}|${s.category}`;
    const list = buckets.get(bucket);
    if (list) list.push(s);
    else buckets.set(bucket, [s]);
  }
  const out = new Map<string, Award>();
  for (const list of buckets.values()) {
    list.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
    let left = CAPS[list[0]!.sourceType];
    for (const s of list) {
      const amount = Math.max(0, Math.min(s.nominal, left));
      left -= amount;
      out.set(ledgerKey(s), { ...s, amount });
    }
  }
  return out;
}

/** Ledger events still needed so every source's net XP equals its desired award. */
export function reconcile(
  desired: Map<string, Award>,
  existing: XPEvent[],
  newId: () => ID,
  recordedAt: string,
): XPEvent[] {
  const byKey = new Map<string, XPEvent[]>();
  for (const e of existing) {
    const key = ledgerKey(e);
    const list = byKey.get(key);
    if (list) list.push(e);
    else byKey.set(key, [e]);
  }
  const seq = (e: XPEvent) => Number(e.eventKey.split('#').pop()) || 0;
  for (const list of byKey.values()) list.sort((a, b) => seq(a) - seq(b));
  const keys = new Set([...byKey.keys(), ...desired.keys()]);
  const out: XPEvent[] = [];
  for (const key of [...keys].sort()) {
    const events = byKey.get(key) ?? [];
    const held = events.reduce((sum, e) => sum + e.delta, 0);
    const want = desired.get(key);
    const delta = (want?.amount ?? 0) - held;
    if (delta === 0) continue;
    const last = events.at(-1);
    const [sourceType, ...rest] = key.split(':');
    const category = rest.pop() as Pool;
    const lastPositive = [...events].reverse().find((e) => e.delta > 0);
    out.push({
      id: newId(),
      eventKey: `${key}#${(last ? seq(last) : 0) + 1}`,
      sourceType: (want?.sourceType ?? sourceType) as SourceType,
      sourceId: want?.sourceId ?? rest.join(':'),
      category,
      delta,
      // A reversal stays on the day the XP was originally earned.
      earnedDate: want?.earnedDate ?? last!.earnedDate,
      recordedAt,
      reversesEventId: delta < 0 ? (lastPositive?.id ?? null) : null,
      configVersion: RULES_VERSION,
    });
  }
  return out;
}

export interface XpTotals {
  global: number;
  learning: number;
  doing: number;
  /** XP earned on a given day, for "today" readouts. */
  byDay: Map<DateKey, number>;
}

/** Net totals. Global includes both tracks plus reflection XP; tracks are never added on top. */
export function xpTotals(events: XPEvent[]): XpTotals {
  let global = 0;
  let learning = 0;
  let doing = 0;
  const byDay = new Map<DateKey, number>();
  for (const e of events) {
    global += e.delta;
    if (e.category === 'learning') learning += e.delta;
    if (e.category === 'doing') doing += e.delta;
    byDay.set(e.earnedDate, (byDay.get(e.earnedDate) ?? 0) + e.delta);
  }
  return { global: Math.max(0, global), learning: Math.max(0, learning), doing: Math.max(0, doing), byDay };
}
