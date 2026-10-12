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
  const sync = new CloudSync(db, new CloudSpace(cloud, 'data/users/u1'), () => clock);
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
});
