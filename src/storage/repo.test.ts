import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from './db';
import { ConflictError, Repository, type EntryContent } from './repo';

const TZ = 'Asia/Kolkata';
let db: AppDatabase;
let repo: Repository;
let clock = new Date('2026-10-10T04:30:00Z'); // 10:00 IST

beforeEach(async () => {
  db = new AppDatabase(`test-${crypto.randomUUID()}`);
  clock = new Date('2026-10-10T04:30:00Z');
  repo = new Repository(db, () => clock);
  await repo.ensureInitialized();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

function content(text: string, extra: Partial<EntryContent> = {}): EntryContent {
  return {
    title: '',
    kind: 'learning',
    doc: { type: 'doc', content: text.split('\n\n').map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] })) },
    plainText: text,
    happenedAt: clock.toISOString(),
    taskIds: [],
    tags: [],
    ...extra,
  };
}

describe('setup', () => {
  it('creates profile and the three original plans exactly once', async () => {
    await repo.ensureInitialized();
    await repo.ensureInitialized();
    const plans = await db.plans.toArray();
    expect(plans).toHaveLength(3);
    expect(plans.map((p) => [p.kind, p.startDate, p.endDate]).sort()).toEqual([
      ['decade', '2026-10-10', '2036-10-10'],
      ['sprint', '2026-10-10', '2026-12-31'],
      ['year', '2026-10-10', '2027-10-10'],
    ]);
    expect((await repo.getProfile()).timeZone).toBe('Asia/Kolkata');
  });
});

describe('tasks', () => {
  it('adds tasks in order with their category and no reward', async () => {
    await repo.addTask({ title: 'Read one chapter', category: 'learning', scheduledDate: '2026-10-10' });
    await repo.addTask({ title: 'Ship the settings screen', category: 'doing', scheduledDate: '2026-10-10' });
    const tasks = await db.tasks.where('scheduledDate').equals('2026-10-10').sortBy('rank');
    expect(tasks.map((t) => [t.title, t.category])).toEqual([
      ['Read one chapter', 'learning'],
      ['Ship the settings screen', 'doing'],
    ]);
    expect(tasks.every((t) => t.award === null)).toBe(true);
    expect(await db.xpEvents.count()).toBe(0);
  });

  it('rejects an empty title without writing anything', async () => {
    await expect(repo.addTask({ title: '   ', category: 'doing', scheduledDate: '2026-10-10' })).rejects.toThrow(/needs a title/);
    expect(await db.tasks.count()).toBe(0);
  });

  it('bulk add creates exactly one task per title', async () => {
    const tasks = await repo.addTasks(['A', 'B', 'C'], 'doing', '2026-10-10');
    expect(tasks).toHaveLength(3);
    expect(await db.tasks.count()).toBe(3);
  });

  it('moving keeps identity, original date and history', async () => {
    const t = await repo.addTask({ title: 'Move me', category: 'doing', scheduledDate: '2026-10-10' });
    await repo.moveTasks([t.id], '2026-10-11', 'reschedule');
    const moved = await db.tasks.get(t.id);
    expect(moved!.scheduledDate).toBe('2026-10-11');
    expect(moved!.originalScheduledDate).toBe('2026-10-10');
    expect(await db.tasks.count()).toBe(1);
    const moves = await repo.taskMoves(t.id);
    expect(moves.map((m) => [m.fromDate, m.toDate])).toEqual([['2026-10-10', '2026-10-11']]);
  });

  it('delete and undo restore the task with its completion snapshot', async () => {
    const t = await repo.addTask({ title: 'Done then deleted', category: 'learning', scheduledDate: '2026-10-10' });
    const { after } = await repo.setTaskStatus(t.id, 'completed', TZ);
    await repo.deleteTasks([t.id]);
    expect((await db.tasks.get(t.id))!.deletedAt).not.toBeNull();
    await repo.restoreTasks([t.id]);
    const restored = await db.tasks.get(t.id);
    expect(restored!.deletedAt).toBeNull();
    expect(restored!.status).toBe('completed');
    expect(restored!.award).toEqual(after.award);
  });

  it('duplicate is a fresh task with no history', async () => {
    const t = await repo.addTask({ title: 'Repeat', category: 'learning', scheduledDate: '2026-10-10', effort: 'deep' });
    await repo.setTaskStatus(t.id, 'completed', TZ);
    const copy = await repo.duplicateTask(t.id);
    expect(copy.id).not.toBe(t.id);
    expect(copy.status).toBe('todo');
    expect(copy.award).toBeNull();
    expect(copy.effort).toBe('deep');
  });

  it('recurrence regeneration never duplicates an occurrence', async () => {
    await repo.createSeries({ title: 'Practice', category: 'learning', scheduledDate: '2026-10-10', rule: { freq: 'daily', interval: 1 } });
    for (let i = 0; i < 3; i++) {
      await repo.ensureOccurrences('2026-10-10', '2026-10-10');
      await repo.ensureOccurrences('2026-10-11', '2026-10-10');
    }
    const all = await db.tasks.toArray();
    expect(all.map((t) => t.occurrenceDate).sort()).toEqual(['2026-10-10', '2026-10-11']);
  });

  it('editing one occurrence leaves other occurrences alone', async () => {
    await repo.createSeries({ title: 'Practice', category: 'learning', scheduledDate: '2026-10-10', rule: { freq: 'daily', interval: 1 } });
    await repo.ensureOccurrences('2026-10-11', '2026-10-10');
    const [first, second] = await db.tasks.orderBy('scheduledDate').toArray();
    await repo.setTaskStatus(first!.id, 'completed', TZ);
    await repo.updateTask(second!.id, { title: 'Practice scales' });
    expect((await db.tasks.get(first!.id))!.title).toBe('Practice');
    expect((await db.tasks.get(first!.id))!.status).toBe('completed');
  });
});

describe('journal', () => {
  it('saves content and survives a fresh connection', async () => {
    const e = await repo.createEntry({ dateKey: '2026-10-10', kind: 'learning', timeZone: TZ });
    const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    await repo.saveEntry(e.id, content(text), e.revision);
    const reopened = new AppDatabase(db.name);
    const stored = await reopened.entries.get(e.id);
    reopened.close();
    expect(stored!.plainText).toBe(text);
    expect(stored!.dateKey).toBe('2026-10-10');
  });

  it('refuses a stale save and keeps the stored version unchanged', async () => {
    const e = await repo.createEntry({ dateKey: '2026-10-10', kind: 'doing', timeZone: TZ });
    const saved = await repo.saveEntry(e.id, content('From tab one'), e.revision);
    await expect(repo.saveEntry(e.id, content('From tab two'), e.revision)).rejects.toBeInstanceOf(ConflictError);
    expect((await db.entries.get(e.id))!.plainText).toBe('From tab one');
    const overwritten = await repo.saveEntryOverConflict(e.id, content('From tab two'));
    expect(overwritten.revision).toBe(saved.revision + 1);
    const history = await repo.entryRevisions(e.id);
    expect(history.some((r) => r.cause === 'conflict' && r.plainText === 'From tab one')).toBe(true);
  });

  it('documented needs nonblank text and is withdrawn when emptied', async () => {
    const e = await repo.createEntry({ dateKey: '2026-10-10', kind: 'reflection', timeZone: TZ });
    await expect(repo.setDocumented(e.id, true)).rejects.toThrow(/Write something/);
    const s = await repo.saveEntry(e.id, content('Something real'), e.revision);
    const d = await repo.setDocumented(s.id, true);
    expect(d.documentedAt).not.toBeNull();
    const emptied = await repo.saveEntry(e.id, content(''), d.revision);
    expect(emptied.documentedAt).toBeNull();
  });

  it('keeps bounded history and a recoverable copy before delete', async () => {
    const e = await repo.createEntry({ dateKey: '2026-10-10', kind: 'learning', timeZone: TZ });
    let rev = e.revision;
    for (let i = 0; i < 60; i++) {
      clock = new Date(clock.getTime() + 6 * 60 * 1000);
      rev = (await repo.saveEntry(e.id, content(`Version ${i}`), rev)).revision;
    }
    await repo.deleteEntry(e.id);
    const history = await repo.entryRevisions(e.id);
    expect(history.filter((r) => r.cause === 'checkpoint').length).toBeLessThanOrEqual(40);
    const beforeDelete = history.find((r) => r.cause === 'before-delete');
    expect(beforeDelete!.plainText).toBe('Version 59');
    const restored = await repo.restoreRevision(e.id, beforeDelete!.id);
    expect(restored.deletedAt).toBeNull();
    expect(restored.plainText).toBe('Version 59');
  });

  it('rapid autosaves refresh one checkpoint instead of piling up', async () => {
    const e = await repo.createEntry({ dateKey: '2026-10-10', kind: 'learning', timeZone: TZ });
    let rev = e.revision;
    for (let i = 0; i < 10; i++) {
      clock = new Date(clock.getTime() + 1000);
      rev = (await repo.saveEntry(e.id, content(`Typing ${i}`), rev)).revision;
    }
    const history = await repo.entryRevisions(e.id);
    expect(history).toHaveLength(1);
    expect(history[0]!.plainText).toBe('Typing 9');
  });
});

describe('plans and goals', () => {
  it('edits a plan but refuses an end date before the start', async () => {
    const decade = (await db.plans.toArray()).find((p) => p.kind === 'decade')!;
    const next = await repo.updatePlan(decade.id, { statement: 'Become someone who ships every day.' });
    expect(next.statement).toBe('Become someone who ships every day.');
    await expect(repo.updatePlan(decade.id, { endDate: '2020-01-01' })).rejects.toThrow(/end date/);
  });

  it('creates a numeric goal and keeps every update as history', async () => {
    const year = (await db.plans.toArray()).find((p) => p.kind === 'year')!;
    const g = await repo.createGoal({ title: 'Make $1,000,000', planId: year.id, measurementMode: 'numeric', target: 1_000_000, current: 0, unit: '$' }, '2026-10-10');
    await repo.logGoalValue(g.id, 25_000, 'First client', '2026-10-10');
    clock = new Date('2026-10-11T04:30:00Z');
    await repo.logGoalValue(g.id, 40_000, '', '2026-10-11');
    expect((await db.goals.get(g.id))!.current).toBe(40_000);
    const history = await db.goalUpdates.where('goalId').equals(g.id).sortBy('at');
    expect(history.map((u) => [u.previous, u.value, u.dateKey])).toEqual([
      [0, 25_000, '2026-10-10'],
      [25_000, 40_000, '2026-10-11'],
    ]);
    await expect(repo.createGoal({ title: 'No target', planId: year.id, measurementMode: 'numeric' }, '2026-10-10')).rejects.toThrow(/target/);
  });

  it('blocks goal loops', async () => {
    const a = await repo.createGoal({ title: 'A', planId: null, measurementMode: 'milestones' }, '2026-10-10');
    const b = await repo.createGoal({ title: 'B', planId: null, parentId: a.id, measurementMode: 'milestones' }, '2026-10-10');
    await expect(repo.updateGoal(a.id, { parentId: b.id })).rejects.toThrow(/own sub-goals/);
  });

  it('a habit creates a daily task linked to its goal', async () => {
    const g = await repo.createGoal({ title: 'Get fit', planId: null, measurementMode: 'tasks' }, '2026-10-10');
    const habit = await repo.addHabit({ goalId: g.id, title: '30 push-ups', category: 'doing', rule: { freq: 'daily', interval: 1 }, startDate: '2026-10-10' });
    await repo.ensureOccurrences('2026-10-11', '2026-10-10');
    const tasks = await db.tasks.where('goalIds').equals(g.id).sortBy('scheduledDate');
    expect(tasks.map((t) => [t.scheduledDate, t.seriesId])).toEqual([
      ['2026-10-10', habit.id],
      ['2026-10-11', habit.id],
    ]);
    await repo.stopSeries(habit.id);
    expect(await repo.ensureOccurrences('2026-10-12', '2026-10-10')).toBe(0);
    await repo.resumeSeries(habit.id, '2026-10-12');
    expect(await db.tasks.where('[seriesId+occurrenceDate]').equals([habit.id, '2026-10-12']).count()).toBe(1);
  });

  it('keeps old direction wordings when today\'s intention changes', async () => {
    const base = { kind: 'day' as const, periodKey: '2026-10-10', startDate: '2026-10-10', endDate: '2026-10-10' };
    await repo.saveDirection({ ...base, intention: 'Ship the habits screen' });
    const next = await repo.saveDirection({ ...base, intention: 'Ship habits and the mind map' });
    expect(next.version).toBe(2);
    expect(next.history.map((h) => h.intention)).toEqual(['Ship the habits screen']);
    expect(await db.periodDirections.count()).toBe(1);
  });

  it('saves a weekly review without touching the week\'s intention', async () => {
    const base = { kind: 'week' as const, periodKey: '2026-10-05', startDate: '2026-10-05', endDate: '2026-10-11' };
    await repo.saveDirection({ ...base, intention: 'Close two deals' });
    const r = await repo.saveReview({ ...base, review: 'Good week', blockers: 'Too many meetings' });
    expect(r).toMatchObject({ intention: 'Close two deals', review: 'Good week', blockers: 'Too many meetings' });
    expect(r.reviewedAt).toBeTruthy();
    const again = await repo.saveReview({ ...base, review: 'Great week', blockers: '' });
    expect(again.reviewedAt).toBe(r.reviewedAt);
    expect(again.history.at(-1)?.blockers).toBe('Too many meetings');
  });
});

describe('earnings and outfit', () => {
  it('logs whole-dollar earnings, rejects bad amounts and soft-deletes', async () => {
    const e = await repo.addEarning({ dateKey: '2026-10-10', amount: 2500.4, note: '  First client  ' });
    expect(e).toMatchObject({ amount: 2500, note: 'First client', deletedAt: null });
    await expect(repo.addEarning({ dateKey: '2026-10-10', amount: 0 })).rejects.toThrow();
    await expect(repo.addEarning({ dateKey: '2026-10-10', amount: Number.NaN })).rejects.toThrow();
    await repo.deleteEarning(e.id);
    expect((await db.earnings.get(e.id))?.deletedAt).toBeTruthy();
    await repo.restoreEarning(e.id);
    expect((await db.earnings.get(e.id))?.deletedAt).toBeNull();
  });

  it('remembers the equipped look', async () => {
    await repo.setOutfit('symbiote');
    expect((await db.kv.get('outfit'))?.value).toBe('symbiote');
  });
});
