import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { AppDatabase, REAL_DB_NAME } from './db';
import { DEMO_DB_NAME, seedDemo } from './demo';

describe('demo mode', () => {
  it('fills its own database once, with real ledger XP, and never the real one', async () => {
    const now = new Date('2026-10-10T04:30:00Z');
    const demo = new AppDatabase(DEMO_DB_NAME);
    await seedDemo(demo, now);
    const tasks = await demo.tasks.count();
    const xp = await demo.xpEvents.count();
    expect(tasks).toBeGreaterThan(15);
    expect(xp).toBeGreaterThan(10);
    expect(await demo.entries.count()).toBeGreaterThan(4);
    await seedDemo(demo, now);
    expect(await demo.tasks.count()).toBe(tasks);
    expect(await demo.xpEvents.count()).toBe(xp);

    const real = new AppDatabase(REAL_DB_NAME);
    await expect(seedDemo(real, now)).rejects.toThrow('demo database');
    expect(await real.tasks.count()).toBe(0);
    demo.close();
    real.close();
  });

  it('seeds once when start-up asks twice at the same moment', async () => {
    const now = new Date('2026-10-10T04:30:00Z');
    await new AppDatabase(DEMO_DB_NAME).delete();
    const demo = new AppDatabase(DEMO_DB_NAME);
    await Promise.all([seedDemo(demo, now), seedDemo(demo, now)]);
    const titles = (await demo.tasks.toArray()).map((t) => `${t.scheduledDate} ${t.title}`);
    expect(new Set(titles).size).toBe(titles.length);
    demo.close();
  });
});
