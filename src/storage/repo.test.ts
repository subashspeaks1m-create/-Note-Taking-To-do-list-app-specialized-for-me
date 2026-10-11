import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from './db';
import { ConflictError, Repository, StaleEditError, type EntryContent } from './repo';

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

describe('two open tabs', () => {
  it('refuses a task edit based on an older revision, then allows an explicit overwrite', async () => {
    const t = await repo.addTask({ title: 'Plan the week', category: 'doing', scheduledDate: '2026-10-10' });
    await repo.updateTask(t.id, { title: 'Plan the week (tab B)' }, t.revision);
    await expect(repo.updateTask(t.id, { title: 'Plan the week (tab A)' }, t.revision)).rejects.toBeInstanceOf(StaleEditError);
    expect((await db.tasks.get(t.id))!.title).toBe('Plan the week (tab B)');
    await repo.updateTask(t.id, { title: 'Plan the week (tab A)' });
    expect((await db.tasks.get(t.id))!.title).toBe('Plan the week (tab A)');
  });

  it('refuses a goal edit when the goal changed since the form opened', async () => {
    const g = await repo.createGoal({ title: 'Read 12 books', planId: null, measurementMode: 'milestones' }, '2026-10-10');
    clock = new Date(clock.getTime() + 60_000);
    await repo.updateGoal(g.id, { title: 'Read 24 books' }, g.updatedAt);
    await expect(repo.updateGoal(g.id, { title: 'Read 6 books' }, g.updatedAt)).rejects.toBeInstanceOf(StaleEditError);
    expect((await db.goals.get(g.id))!.title).toBe('Read 24 books');
  });
});

describe('content log', () => {
  it('logs posts and audience, refuses empty or negative lines, and deletes with undo', async () => {
    const a = await repo.addContent({ dateKey: '2026-10-09', posts: 2, audience: 900 });
    await repo.addContent({ dateKey: '2026-10-10', posts: 1, note: 'YouTube' });
    await expect(repo.addContent({ dateKey: '2026-10-10', posts: 0 })).rejects.toThrow(/posts/i);
    await expect(repo.addContent({ dateKey: '2026-10-10', posts: -1 })).rejects.toThrow(/negative/);
    expect(await db.contentLog.count()).toBe(2);
    await repo.deleteContent(a.id);
    expect((await db.contentLog.get(a.id))!.deletedAt).not.toBeNull();
    await repo.restoreContent(a.id);
    expect((await db.contentLog.get(a.id))!.deletedAt).toBeNull();
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

describe('principles', () => {
  it('keeps an ordered list where the first is the topmost', async () => {
    const a = await repo.addPrinciple({ text: '  Never   miss twice ' });
    const b = await repo.addPrinciple({ text: 'Do the hard thing first', top: true });
    const c = await repo.addPrinciple({ text: 'Tell the truth' });
    expect(a.text).toBe('Never miss twice');
    expect((await repo.listPrinciples()).map((p) => p.id)).toEqual([b.id, a.id, c.id]);
    await repo.movePrinciple(c.id, 0);
    expect((await repo.listPrinciples())[0]!.id).toBe(c.id);
    await expect(repo.addPrinciple({ text: '   ' })).rejects.toThrow();
  });

  it('edits, deletes and restores a principle in place', async () => {
    const a = await repo.addPrinciple({ text: 'One' });
    const b = await repo.addPrinciple({ text: 'Two' });
    await repo.addPrinciple({ text: 'Three' });
    await repo.updatePrinciple(b.id, { text: 'Two, edited', why: 'Because' });
    const removed = await repo.deletePrinciple(b.id);
    expect(removed?.index).toBe(1);
    expect((await repo.listPrinciples()).map((p) => p.text)).toEqual(['One', 'Three']);
    await repo.restorePrinciple(removed!.principle, removed!.index);
    expect((await repo.listPrinciples()).map((p) => p.text)).toEqual(['One', 'Two, edited', 'Three']);
    expect((await repo.listPrinciples())[1]!.why).toBe('Because');
    expect(a.id).toBeTruthy();
  });
});

describe('XP ledger', () => {
  const totals = async () => {
    const { xpTotals } = await import('../domain/ledger');
    return xpTotals(await db.xpEvents.toArray());
  };

  it('awards completion XP once; reopen reverses and re-complete restores without farming', async () => {
    const t = await repo.addTask({ title: 'Ship it', category: 'doing', scheduledDate: '2026-10-10', effort: 'standard' });
    const first = await repo.setTaskStatus(t.id, 'completed', TZ);
    expect(first.xp).toBe(20);
    expect((await totals()).doing).toBe(20);
    for (let i = 0; i < 3; i++) {
      await repo.setTaskStatus(t.id, 'todo', TZ);
      expect((await totals()).global).toBe(0);
      await repo.setTaskStatus(t.id, 'completed', TZ);
    }
    expect((await totals()).doing).toBe(20);
    // Every change is an appended event; nothing old is edited.
    expect(await db.xpEvents.count()).toBe(7);
    const keys = (await db.xpEvents.toArray()).map((e) => e.eventKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('changing effort after completion cannot raise the reward', async () => {
    const t = await repo.addTask({ title: 'Small thing', category: 'learning', scheduledDate: '2026-10-10', effort: 'small' });
    await repo.setTaskStatus(t.id, 'completed', TZ);
    await repo.updateTask(t.id, { effort: 'deep' });
    await repo.setTaskStatus(t.id, 'todo', TZ);
    await repo.setTaskStatus(t.id, 'completed', TZ);
    expect((await totals()).learning).toBe(10);
  });

  it('caps completion XP at 200 per track per day and refills from the next task when one is reversed', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) {
      const t = await repo.addTask({ title: `Deep ${i}`, category: 'doing', scheduledDate: '2026-10-10', effort: 'deep' });
      ids.push(t.id);
      clock = new Date(clock.getTime() + 60_000);
      await repo.setTaskStatus(t.id, 'completed', TZ);
    }
    expect((await totals()).doing).toBe(200); // 7 × 35 = 245, capped
    const last = await db.xpEvents.where('sourceId').equals(ids[6]!).toArray();
    expect(last.reduce((s, e) => s + e.delta, 0)).toBe(0);
    const capped = await repo.setTaskStatus(ids[6]!, 'todo', TZ).then(() => repo.setTaskStatus(ids[6]!, 'completed', TZ));
    expect(capped.capped).toBe(true);
    await repo.deleteTasks([ids[0]!]);
    expect((await totals()).doing).toBe(200); // the 7th task now gets its XP
    await repo.restoreTasks([ids[0]!]);
    expect((await totals()).doing).toBe(200);
  });

  it('pays one documentation bonus per completed task and withdraws it when the entry is deleted', async () => {
    const t = await repo.addTask({ title: 'Read', category: 'learning', scheduledDate: '2026-10-10', effort: 'small' });
    await repo.setTaskStatus(t.id, 'completed', TZ);
    const a = await repo.createEntry({ dateKey: '2026-10-10', kind: 'learning', taskIds: [t.id], timeZone: TZ });
    const b = await repo.createEntry({ dateKey: '2026-10-10', kind: 'learning', taskIds: [t.id], timeZone: TZ });
    await repo.saveEntry(a.id, content('Learned a lot', { taskIds: [t.id] }), 1);
    await repo.saveEntry(b.id, content('And more', { taskIds: [t.id] }), 1);
    await repo.setDocumented(a.id, true);
    await repo.setDocumented(b.id, true);
    expect((await totals()).learning).toBe(15);
    await repo.deleteEntry(a.id);
    expect((await totals()).learning).toBe(15); // b still documents it
    await repo.deleteEntry(b.id);
    expect((await totals()).learning).toBe(10);
  });

  it('pays a documented reflection once per day, globally', async () => {
    for (let i = 0; i < 2; i++) {
      const e = await repo.createEntry({ dateKey: '2026-10-10', kind: 'reflection', timeZone: TZ });
      await repo.saveEntry(e.id, content('A thought', { kind: 'reflection' }), 1);
      await repo.setDocumented(e.id, true);
    }
    const t = await totals();
    expect([t.global, t.learning, t.doing]).toEqual([5, 0, 0]);
  });

  it('reclassifying a completed task moves its XP between tracks without adding any', async () => {
    const t = await repo.addTask({ title: 'Course', category: 'learning', scheduledDate: '2026-10-10', effort: 'standard' });
    await repo.setTaskStatus(t.id, 'completed', TZ);
    await repo.updateTask(t.id, { category: 'doing' });
    const now = await totals();
    expect([now.global, now.learning, now.doing]).toEqual([20, 0, 20]);
  });

  it('repairLedger backfills completions made before the ledger existed, once', async () => {
    const t = await repo.addTask({ title: 'Old', category: 'doing', scheduledDate: '2026-10-10' });
    await repo.setTaskStatus(t.id, 'completed', TZ);
    await db.xpEvents.clear();
    expect(await repo.repairLedger()).toBe(1);
    expect(await repo.repairLedger()).toBe(0);
    expect((await totals()).doing).toBe(20);
  });
});

describe('unlocks and chests', () => {
  it('records each badge and cosmetic once, permanently', async () => {
    const first = await repo.recordUnlocks(new Map([['first-step', ['t1']]]), ['look:web-runner']);
    expect(first).toEqual(['badge:first-step', 'look:web-runner']);
    expect(await repo.recordUnlocks(new Map([['first-step', ['t1']]]), ['look:web-runner'])).toEqual([]);
    expect(await db.achievements.count()).toBe(1);
  });

  it('opens an achieved goal chest once and always shows the same prize', async () => {
    const sprint = (await db.plans.toArray()).find((p) => p.kind === 'sprint')!;
    const goal = await repo.createGoal({ title: 'Ship v1', planId: sprint.id, category: 'doing', measurementMode: 'manual', sealedReward: 'New headphones' }, '2026-10-10');
    await expect(repo.openChest(goal.id)).rejects.toThrow(/achieved/);
    await repo.setGoalStatus(goal.id, 'achieved', '2026-10-10');
    const prize = await repo.openChest(goal.id);
    expect(prize.chest).toBe(true);
    expect((await repo.openChest(goal.id)).id).toBe(prize.id);
    await repo.setPlatform(prize.id);
    await expect(repo.setPlatform('void-gate' === prize.id ? 'sunforge' : 'void-gate')).rejects.toThrow(/Unlock/);
  });

  it('Finish Strong can only be marked from the sprint last day', async () => {
    const sprint = (await db.plans.toArray()).find((p) => p.kind === 'sprint')!;
    await expect(repo.setSprintFinished(sprint.id, true, '2026-12-30')).rejects.toThrow(/last day/);
    await repo.setSprintFinished(sprint.id, true, '2026-12-31');
    expect((await db.plans.get(sprint.id))!.finishedAt).toBeTruthy();
  });
});

describe('vault', () => {
  it('wears any outfit from the vault and refuses unknown ones', async () => {
    await repo.setWearing('dark-knight');
    expect((await db.kv.get('wearing'))?.value).toBe('dark-knight');
    await expect(repo.setWearing('nope')).rejects.toThrow('not in the vault');
    expect((await db.kv.get('wearing'))?.value).toBe('dark-knight');
  });
});

describe('coach notes', () => {
  it('saves notes per period, rejects empty ones and deletes them', async () => {
    await repo.saveCoachNote('week', '2026-10-05', { model: 'm:free', text: '  ## Notes  ' });
    expect((await db.kv.get('coach:week:2026-10-05'))?.value).toMatchObject({ model: 'm:free', text: '## Notes' });
    await expect(repo.saveCoachNote('week', '2026-10-05', { model: 'm:free', text: '  ' })).rejects.toThrow('nothing to save');
    await repo.deleteCoachNote('week', '2026-10-05');
    expect(await db.kv.get('coach:week:2026-10-05')).toBeUndefined();
  });
});
