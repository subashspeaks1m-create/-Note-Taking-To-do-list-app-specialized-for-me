import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { CloudSpace, CloudSync, type CloudDb, type CloudDocRef } from './cloud';
import { AppDatabase } from './db';
import { Repository } from './repo';

const clock = new Date('2026-10-12T09:00:00Z');
const open: AppDatabase[] = [];

/** An in-memory stand-in for the artifact database, with switchable outages. */
class FakeCloud implements CloudDb {
  docs = new Map<string, Record<string, unknown>>();
  down = false;
  writes = 0;
  doc(path: string): CloudDocRef {
    return {
      get: async () => {
        if (this.down) throw { code: 'unavailable' };
        const d = this.docs.get(path);
        return { exists: !!d, data: () => (d ? structuredClone(d) : undefined) };
      },
      set: async (data) => {
        if (this.down) throw { code: 'unavailable' };
        this.writes++;
        this.docs.set(path, structuredClone(data));
      },
    };
  }
}

async function device(cloud: FakeCloud) {
  const db = new AppDatabase(`cloud-${crypto.randomUUID()}`);
  open.push(db);
  const repo = new Repository(db, () => clock);
  await repo.ensureInitialized();
  const sync = new CloudSync(db, new CloudSpace(cloud, 'data/users/u1'), () => clock, () => repo.dedupeStarterPlans());
  return { db, repo, sync };
}

const titles = async (db: AppDatabase) => (await db.tasks.toArray()).map((t) => t.title).sort();

afterEach(async () => {
  for (const db of open.splice(0)) {
    db.close();
    await db.delete();
  }
});

describe('account sync', () => {
  it('a device that opens empty gets everything back from the account', async () => {
    const cloud = new FakeCloud();
    const a = await device(cloud);
    await a.sync.initial();
    await a.repo.addTask({ title: 'Read one chapter', category: 'learning', scheduledDate: '2026-10-12' });
    await a.repo.addEarning({ dateKey: '2026-10-12', amount: 250 });
    await a.sync.flush();
    expect(a.sync.getStatus().state).toBe('saved');

    // Browser storage wiped (or a second device): a brand-new database.
    const b = await device(cloud);
    await b.sync.initial();
    expect(await titles(b.db)).toEqual(['Read one chapter']);
    expect(await b.db.earnings.count()).toBe(1);
  });

  it('keeps edits from each device and saves only real changes', async () => {
    const cloud = new FakeCloud();
    const a = await device(cloud);
    await a.sync.initial();
    await a.repo.addTask({ title: 'From A', category: 'doing', scheduledDate: '2026-10-12' });
    await a.sync.flush();
    const b = await device(cloud);
    await b.sync.initial();
    await b.repo.addTask({ title: 'From B', category: 'doing', scheduledDate: '2026-10-12' });
    await b.sync.flush();
    // A has its own unsaved edit when it catches up: both survive.
    await a.repo.addTask({ title: 'Also A', category: 'doing', scheduledDate: '2026-10-12' });
    await a.sync.pull();
    expect(await titles(a.db)).toEqual(['Also A', 'From A', 'From B']);
    const c = await device(cloud);
    await c.sync.initial();
    expect(await titles(c.db)).toEqual(['Also A', 'From A', 'From B']);

    const before = cloud.writes;
    await c.sync.flush();
    expect(cloud.writes).toBe(before);
  });

  it('never overwrites the account with an empty device while the account is unreachable', async () => {
    const cloud = new FakeCloud();
    const a = await device(cloud);
    await a.sync.initial();
    await a.repo.addTask({ title: 'Precious', category: 'doing', scheduledDate: '2026-10-12' });
    await a.sync.flush();

    cloud.down = true;
    const b = await device(cloud);
    await b.sync.initial();
    expect(b.sync.getStatus().state).toBe('error');
    b.sync.stop();
    cloud.down = false;
    await b.sync.flush(); // the retry catches up first instead of saving the empty device
    expect(await titles(b.db)).toEqual(['Precious']);
  });

  it('a save cut off halfway falls back to the last good copy', async () => {
    const cloud = new FakeCloud();
    const a = await device(cloud);
    await a.sync.initial();
    await a.repo.addTask({ title: 'Good copy', category: 'doing', scheduledDate: '2026-10-12' });
    await a.sync.flush();
    await a.repo.addTask({ title: 'Newer', category: 'doing', scheduledDate: '2026-10-12' });
    await a.sync.flush();
    const m = cloud.docs.get('data/users/u1/manifest')!;
    cloud.docs.set(`data/users/u1/${m.slot as string}-0`, { id: 'something else', text: '' });

    const b = await device(cloud);
    await b.sync.initial();
    expect(await titles(b.db)).toEqual(['Good copy']);
  });

  it('every device ends up with one of each starter plan, goals and writing kept', async () => {
    const cloud = new FakeCloud();
    const a = await device(cloud);
    await a.sync.initial();
    // Copies like the ones older versions made: random ids, one holding a goal, another holding writing.
    const copies = async (n: number) => {
      const base = (await a.db.plans.toArray()).map((p) => ({ ...p }));
      for (let i = 0; i < n; i++) await a.db.plans.bulkAdd(base.map((p) => ({ ...p, id: `old-${i}-${p.kind}`, createdAt: `2026-10-12T1${i}:00:00.000Z` })));
    };
    await copies(2);
    await a.db.plans.update('old-0-year', { statement: 'Ship the app and earn the first $10K.' });
    const goal = await a.repo.createGoal({ planId: 'old-1-year', title: 'First $10K', category: 'doing' } as Parameters<typeof a.repo.createGoal>[0], '2026-10-12');
    expect(await a.db.plans.count()).toBe(9);

    expect(await a.repo.dedupeStarterPlans()).toBe(6);
    const plans = await a.db.plans.toArray();
    expect(plans.map((p) => p.id).sort()).toEqual(['plan-decade', 'plan-sprint', 'plan-year']);
    expect(plans.find((p) => p.kind === 'year')!.statement).toBe('Ship the app and earn the first $10K.');
    expect((await a.db.goals.get(goal.id))!.planId).toBe('plan-year');
    await a.sync.flush();

    // A fresh device and the account both agree: three plans, nothing added back.
    const b = await device(cloud);
    await b.sync.initial();
    await b.repo.dedupeStarterPlans();
    expect(await b.db.plans.count()).toBe(3);
    expect(await a.repo.dedupeStarterPlans()).toBe(0);
  });

  it('an erase keeps the copy before it, and that copy brings everything back', async () => {
    const cloud = new FakeCloud();
    const a = await device(cloud);
    await a.sync.initial();
    for (const t of ['One', 'Two', 'Three', 'Four']) await a.repo.addTask({ title: t, category: 'doing', scheduledDate: '2026-10-12' });
    await a.sync.flush();
    await a.repo.eraseAll();
    await a.sync.flush();
    expect(await titles(a.db)).toEqual([]);

    const copies = await a.sync.earlierCopies();
    const drop = copies.find((c) => c.kind === 'drop');
    expect(drop?.records).toBeGreaterThanOrEqual(7);
    await a.sync.restoreEarlier(drop!);
    expect(await titles(a.db)).toEqual(['Four', 'One', 'Three', 'Two']);
    expect((await a.db.plans.toArray()).length).toBe(3);

    // The restored data reached the account too.
    const b = await device(cloud);
    await b.sync.initial();
    expect(await titles(b.db)).toEqual(['Four', 'One', 'Three', 'Two']);
  });

  it('a device holding data is never wiped by an emptier account copy', async () => {
    const cloud = new FakeCloud();
    const a = await device(cloud);
    await a.sync.initial();
    await a.repo.addTask({ title: 'Kept on phone', category: 'doing', scheduledDate: '2026-10-12' });
    await a.sync.flush();

    // Another device erases everything and saves.
    const b = await device(cloud);
    await b.sync.initial();
    await b.repo.eraseAll();
    await b.sync.flush();

    // The phone opens again, untouched since its last save: it keeps its task and puts it back in the account.
    const again = new CloudSync(a.db, new CloudSpace(cloud, 'data/users/u1'), () => clock, () => a.repo.dedupeStarterPlans());
    await again.initial();
    expect(await titles(a.db)).toEqual(['Kept on phone']);
    const c = await device(cloud);
    await c.sync.initial();
    expect(await titles(c.db)).toEqual(['Kept on phone']);
  });

  it('never writes over an account copy it could not read', async () => {
    const cloud = new FakeCloud();
    const a = await device(cloud);
    await a.sync.initial();
    await a.repo.addTask({ title: 'Precious', category: 'doing', scheduledDate: '2026-10-12' });
    await a.sync.flush();
    const manifest = structuredClone(cloud.docs.get('data/users/u1/manifest'));
    // The saved pieces go missing for a moment (a failed read).
    const pieces = [...cloud.docs.keys()].filter((k) => /\/[ab]-\d+$/.test(k));
    const saved = new Map(pieces.map((k) => [k, cloud.docs.get(k)!]));
    for (const k of pieces) cloud.docs.delete(k);

    const b = await device(cloud);
    await b.sync.initial();
    expect(b.sync.getStatus().state).toBe('error');
    expect(cloud.docs.get('data/users/u1/manifest')).toEqual(manifest);
    b.sync.stop();
    for (const [k, v] of saved) cloud.docs.set(k, v);
  });
});
