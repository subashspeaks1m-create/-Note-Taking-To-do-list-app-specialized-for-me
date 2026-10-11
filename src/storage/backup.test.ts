import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseBackupText, previewImport, validateBackup } from './backup';
import { AppDatabase } from './db';
import { Repository } from './repo';

const TZ = 'Asia/Kolkata';
let db: AppDatabase;
let repo: Repository;
const clock = new Date('2026-10-10T04:30:00Z');

beforeEach(async () => {
  db = new AppDatabase(`test-${crypto.randomUUID()}`);
  repo = new Repository(db, () => clock);
  await repo.ensureInitialized();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

async function seed() {
  const t = await repo.addTask({ title: 'Ship it', category: 'doing', scheduledDate: '2026-10-10' });
  await repo.setTaskStatus(t.id, 'completed', TZ);
  await repo.addPrinciple({ text: 'Do the hard thing first' });
  await repo.addEarning({ dateKey: '2026-10-10', amount: 500 });
  return t;
}

describe('backup', () => {
  it('round-trips every table and replaces data exactly', async () => {
    const t = await seed();
    const backup = await repo.createBackup();
    expect(validateBackup(JSON.parse(JSON.stringify(backup))).ok).toBe(true);
    expect((await repo.getMeta())!.lastBackupAt).toBe(backup.exportedAt);
    await repo.eraseAll();
    expect(await db.tasks.count()).toBe(0);
    await repo.restoreBackup(backup, 'replace');
    expect((await db.tasks.get(t.id))!.status).toBe('completed');
    expect(await db.xpEvents.count()).toBe(1);
    expect((await repo.listPrinciples())[0]!.text).toBe('Do the hard thing first');
  });

  it('rejects corrupted or foreign files without changing anything', async () => {
    await seed();
    expect(parseBackupText('{not json').ok).toBe(false);
    expect(validateBackup({ hello: 1 }).errors[0]).toMatch(/not a Pursuit/);
    const backup = JSON.parse(JSON.stringify(await repo.createBackup()));
    backup.tables.tasks[0].status = 'exploded';
    const v = validateBackup(backup);
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toMatch(/Tasks: 1 damaged/);
    backup.tables.tasks.push({ ...backup.tables.tasks[0] });
    expect(validateBackup(backup).errors.join()).toMatch(/appears twice/);
    expect(await db.tasks.count()).toBe(1);
  });

  it('refuses a backup from a newer app version', () => {
    expect(validateBackup({ format: 'pursuit-of-greatness-backup', formatVersion: 99, schemaVersion: 1, tables: {} }).ok).toBe(false);
  });

  it('merge adds new records, keeps the newer copy of shared ones, and never duplicates XP', async () => {
    const t = await seed();
    const backup = await repo.createBackup();
    // Here: rename the task later than the backup. In the file: a task this device never had.
    const later = new Repository(db, () => new Date('2026-10-11T04:30:00Z'));
    await later.updateTask(t.id, { title: 'Ship it today' });
    backup.tables.tasks.push({ ...backup.tables.tasks[0]!, id: 'from-phone', title: 'Phone task', award: null, status: 'todo', completedAt: null, completionLocalDate: null });
    const preview = await previewImport(db, backup);
    expect(preview.added.tasks).toBe(1);
    expect(preview.changed.tasks).toBe(1);
    const res = await repo.restoreBackup(backup, 'merge');
    expect(res.added).toBeGreaterThanOrEqual(1);
    expect((await db.tasks.get(t.id))!.title).toBe('Ship it today');
    expect(await db.tasks.get('from-phone')).toBeTruthy();
    const xp = (await db.xpEvents.toArray()).reduce((s, e) => s + e.delta, 0);
    expect(xp).toBe(20);
    expect((await repo.listPrinciples()).length).toBe(1);
  });

  it('undo import puts the previous data back', async () => {
    await seed();
    const empty = await (async () => {
      const other = new AppDatabase(`test-${crypto.randomUUID()}`);
      const r = new Repository(other, () => clock);
      await r.ensureInitialized();
      const b = await r.createBackup();
      other.close();
      await other.delete();
      return b;
    })();
    await repo.restoreBackup(empty, 'replace');
    expect(await db.tasks.count()).toBe(0);
    await repo.undoImport();
    expect(await db.tasks.count()).toBe(1);
    expect(await repo.preImportSnapshot()).toBeNull();
  });

  it('profile edits validate the time zone and name', async () => {
    await expect(repo.updateProfile({ timeZone: 'Mars/Olympus' })).rejects.toThrow(/time zone/);
    await expect(repo.updateProfile({ displayName: '  ' })).rejects.toThrow(/name/);
    expect((await repo.updateProfile({ displayName: 'Prem', weekStart: 'sunday' })).weekStart).toBe('sunday');
  });
});
