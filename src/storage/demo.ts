import type { JSONContent } from '@tiptap/core';
import { addDays, dateKeyInZone, type DateKey } from '../date/localDate';
import type { Category, Effort } from '../domain/config';
import type { EntryKind } from '../domain/models';
import { periodKeyFor, periodRange } from '../domain/stats';
import type { AppDatabase } from './db';
import { Repository } from './repo';

/**
 * Demo mode: fictional records in a separate database, so the app can be shown
 * filled in without touching real data, real XP or real unlocks. It is a
 * per-device switch and always labeled while on.
 */
export const DEMO_DB_NAME = 'pursuit-of-greatness-demo';
const FLAG = 'pog.demo';
const SEEDED = 'demoSeeded';
const TZ = 'Asia/Kolkata';

export function isDemo(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

export function setDemo(on: boolean) {
  try {
    if (on) localStorage.setItem(FLAG, '1');
    else localStorage.removeItem(FLAG);
  } catch {
    // Storage blocked: demo mode simply can't be remembered.
  }
}

const doc = (text: string): JSONContent => ({ type: 'doc', content: text.split('\n\n').map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] })) });

interface DemoDay {
  /** Days before today. */
  ago: number;
  tasks: [string, Category, Effort?, boolean?][];
  entries?: [EntryKind, string, string][];
}

/** Ten days of fictional work, adapted from the kit's demo data. */
const DAYS: DemoDay[] = [
  { ago: 9, tasks: [['Understand local-first storage', 'learning'], ['Sketch the daily planner layout', 'doing']], entries: [['learning', 'Local-first, in one line', 'Local-first means the data lives on the device first. The app works with no network, and sync is an extra, not a requirement.']] },
  { ago: 8, tasks: [['Read one chapter of Deep Work', 'learning'], ['Ship the task list', 'doing', 'deep']] },
  { ago: 7, tasks: [['Watch a talk on IndexedDB', 'learning', 'small'], ['Write the backup format', 'doing']], entries: [['doing', 'Backup format', 'Wrote the backup format as plain JSON with a schema version, so an old backup can always be read and a newer one is refused before anything changes.']] },
  { ago: 6, tasks: [['Call two potential clients', 'doing']] },
  { ago: 4, tasks: [['Read one chapter of Deep Work', 'learning'], ['Design the report card', 'doing', 'deep'], ['Post a build update', 'doing', 'small']], entries: [['reflection', 'Two days off', 'Skipped two days. Not lazy, just no plan the night before. Writing tomorrow’s three tasks before bed from now on.']] },
  { ago: 3, tasks: [['Learn how service workers cache', 'learning'], ['Make the app work offline', 'doing', 'deep']] },
  { ago: 2, tasks: [['Read one chapter of Deep Work', 'learning'], ['Ship the settings screen', 'doing']], entries: [['learning', 'Deep Work, chapter 3', 'Attention residue: switching tasks leaves part of your attention behind. Batch small tasks and protect one long block a day.']] },
  { ago: 1, tasks: [['Review the week', 'learning', 'small'], ['Send the first invoice', 'doing']] },
  { ago: 0, tasks: [['Read one chapter', 'learning', 'standard', false], ['Ship the character screen', 'doing', 'deep', false], ['Understand one new idea', 'learning', 'small']], entries: [['doing', 'Morning block', 'Two focused hours on the character screen. The platform turns now; the outfits come next.']] },
];

const seeding = new WeakMap<AppDatabase, Promise<void>>();

/** Fills the demo database once. Never called on the real database. */
export function seedDemo(db: AppDatabase, now: Date): Promise<void> {
  if (db.name !== DEMO_DB_NAME) return Promise.reject(new Error('Demo data only goes in the demo database.'));
  // Start-up can ask twice at once (React runs effects twice in development); both share one run.
  let run = seeding.get(db);
  if (!run) {
    run = fill(db, now);
    seeding.set(db, run);
  }
  return run;
}

async function fill(db: AppDatabase, now: Date): Promise<void> {
  if (await db.kv.get(SEEDED)) return;
  let at = now;
  const repo = new Repository(db, () => at);
  await repo.ensureInitialized();
  await repo.updateProfile({ displayName: 'Subash', timeZone: TZ, weekStart: 'monday' });
  const today = dateKeyInZone(now, TZ);
  const atDay = (key: DateKey, hour: number) => new Date(`${key}T${String(hour).padStart(2, '0')}:00:00+05:30`);

  const plans = await db.plans.toArray();
  const sprint = plans.find((p) => p.kind === 'sprint') ?? plans[0]!;
  const year = plans.find((p) => p.kind === 'year') ?? plans[0]!;
  at = atDay(addDays(today, -10), 9);
  const tool = await repo.createGoal({ title: 'Publish a useful personal tool', planId: year.id, why: 'Prove I can finish what I start.', measurementMode: 'tasks', category: 'doing' }, addDays(today, -10));
  const money = await repo.createGoal({ title: 'Earn $10,000 from clients', planId: sprint.id, measurementMode: 'numeric', target: 10_000, current: 0, unit: '$', category: 'doing' }, addDays(today, -10));
  const habit = await repo.createGoal({ title: 'Read 12 books', planId: year.id, measurementMode: 'milestones', category: 'learning' }, addDays(today, -10));
  for (const m of ['Book 1', 'Book 2', 'Book 3', 'Book 4']) await repo.addMilestone(habit.id, m);
  await repo.addPrinciple({ text: 'Finish what I start before starting something new.', why: 'Half-done work teaches nothing.', top: true });
  await repo.addPrinciple({ text: 'Write it down the same day.' });

  for (const d of DAYS) {
    const key = addDays(today, -d.ago);
    at = atDay(key, 8);
    for (const [i, [title, category, effort = 'standard', finish = true]] of d.tasks.entries()) {
      const t = await repo.addTask({ title, category, effort, scheduledDate: key, goalIds: category === 'doing' && i === 0 ? [tool.id] : [] });
      if (finish) {
        at = atDay(key, 10 + i * 2);
        await repo.setTaskStatus(t.id, 'completed', TZ);
      }
    }
    for (const [kind, title, text] of d.entries ?? []) {
      at = atDay(key, 21);
      const e = await repo.createEntry({ dateKey: key, kind, timeZone: TZ });
      const saved = await repo.saveEntry(e.id, { title, kind, doc: doc(text), plainText: text, happenedAt: at.toISOString(), taskIds: [], tags: [] }, e.revision);
      await repo.setDocumented(saved.id, true);
    }
  }

  at = atDay(addDays(today, -6), 18);
  await repo.logGoalValue(money.id, 1_500, 'First client paid', addDays(today, -6));
  await repo.addEarning({ dateKey: addDays(today, -6), amount: 1_500, note: 'First client' });
  at = atDay(addDays(today, -1), 18);
  await repo.logGoalValue(money.id, 2_500, 'Second invoice sent', addDays(today, -1));

  at = now;
  const week = periodRange('week', today, 'monday');
  const month = periodRange('month', today, 'monday');
  await repo.saveDirection({ kind: 'day', periodKey: today, startDate: today, endDate: today, intention: 'Make one useful thing and understand one new idea.' });
  await repo.saveDirection({ kind: 'week', periodKey: periodKeyFor('week', week), startDate: week.start, endDate: week.end, intention: 'Finish the core daily workflow.' });
  await repo.saveDirection({ kind: 'month', periodKey: periodKeyFor('month', month), startDate: month.start, endDate: month.end, intention: 'Turn a personal idea into a usable tool.' });
  await db.kv.put({ key: SEEDED, value: now.toISOString() });
}
