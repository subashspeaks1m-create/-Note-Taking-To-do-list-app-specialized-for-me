import { expect, test, type Page } from '@playwright/test';
import { addTask, startAt, table, waitSaved, xp } from './helpers';

test.beforeEach(async ({ page }) => {
  await startAt(page);
  await page.goto('/');
});

const byRank = (rows: Record<string, unknown>[]) => rows.sort((a, b) => (a.rank as number) - (b.rank as number));
const editor = (page: Page) => page.locator('.prose--editor').last();
const sumBy = async (page: Page, type: string) => (await table(page, 'xpEvents')).filter((e) => e.sourceType === type).reduce((n, e) => n + (e.delta as number), 0);

async function writeLogFor(page: Page, title: string) {
  await page.getByRole('checkbox', { name: `Complete: ${title}` }).click();
  await page.getByRole('button', { name: /Write what happened/ }).first().click();
  await expect(editor(page)).toBeVisible();
}

test('#1 tasks keep order and category after reload and earn no XP', async ({ page }) => {
  await addTask(page, 'Read one chapter', 'Learn');
  await addTask(page, 'Ship the settings screen', 'Do');
  await page.reload();
  const list = page.getByRole('list', { name: /^Tasks for/ });
  await expect(list.locator('.task__title')).toHaveText(['Read one chapter', 'Ship the settings screen']);
  const tasks = byRank(await table(page, 'tasks'));
  expect(tasks.map((t) => [t.title, t.category, t.scheduledDate])).toEqual([
    ['Read one chapter', 'learning', '2026-10-10'],
    ['Ship the settings screen', 'doing', '2026-10-10'],
  ]);
  expect(await xp(page)).toEqual({});
});

test('#2 completing a standard Learning task gives 20 Learning XP and opens a linked draft', async ({ page }) => {
  await addTask(page, 'Read one chapter', 'Learn');
  await writeLogFor(page, 'Read one chapter');
  await expect.poll(() => xp(page)).toEqual({ learning: 20 });
  const [task] = await table(page, 'tasks');
  expect(task!.completedAt).toBeTruthy();
  expect(task!.completionLocalDate).toBe('2026-10-10');
  await expect(page.getByRole('button', { name: 'Unlink Read one chapter' })).toBeVisible();
});

test('#3 a three-paragraph documented log survives reload with one 5 XP documentation source', async ({ page }) => {
  await addTask(page, 'Read one chapter', 'Learn');
  await writeLogFor(page, 'Read one chapter');
  await editor(page).click();
  await page.keyboard.type('First paragraph about the chapter.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second paragraph with the key idea.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Third paragraph on what to try.');
  await page.getByRole('checkbox', { name: /Documented/ }).click();
  await expect(page.getByRole('checkbox', { name: /Documented/ })).toBeChecked();
  await waitSaved(page);
  await page.reload();
  const [entry] = await table(page, 'entries');
  const [task] = await table(page, 'tasks');
  expect(entry).toMatchObject({ kind: 'learning', dateKey: '2026-10-10', taskIds: [task!.id] });
  expect(entry!.documentedAt).toBeTruthy();
  expect((entry!.doc as { content: unknown[] }).content).toHaveLength(3);
  await expect(page.getByText('Third paragraph on what to try.')).toBeVisible();
  expect(await sumBy(page, 'documentation')).toBe(5);
});

test('#4 ten edits and ten complete/reopen cycles add no extra XP', async ({ page }) => {
  await addTask(page, 'Read one chapter', 'Learn');
  await writeLogFor(page, 'Read one chapter');
  await editor(page).click();
  await page.keyboard.type('Start.');
  await page.getByRole('checkbox', { name: /Documented/ }).click();
  await expect(page.getByRole('checkbox', { name: /Documented/ })).toBeChecked();
  await waitSaved(page);
  for (let i = 0; i < 10; i++) {
    await editor(page).click();
    await page.keyboard.type(` Edit ${i}.`);
    await expect(page.locator('.save--busy')).toHaveCount(0, { timeout: 10_000 });
  }
  await waitSaved(page);
  const box = () => page.getByRole('checkbox', { name: /: Read one chapter$/ });
  for (let i = 0; i < 10; i++) {
    await box().click();
    await expect(box()).toHaveAttribute('aria-label', i % 2 === 0 ? 'Complete: Read one chapter' : 'Mark not done: Read one chapter');
  }
  // Ten clicks from completed ends completed.
  await expect.poll(async () => (await table(page, 'tasks'))[0]!.status).toBe('completed');
  await expect.poll(() => sumBy(page, 'task-completion')).toBe(20);
  expect(await sumBy(page, 'documentation')).toBe(5);
  const entries = await table(page, 'entries');
  expect(entries).toHaveLength(1);
  expect(entries[0]!.plainText).toContain('Edit 9.');
});

test('#5 a standalone Doing log and a reflection persist and are searchable; only a documented reflection earns', async ({ page }) => {
  await page.getByRole('button', { name: /What I did/ }).first().click();
  await editor(page).click();
  await page.keyboard.type('Fixed the backup import bug on my own.');
  await waitSaved(page);
  await page.getByRole('button', { name: /Daily reflection/ }).first().click();
  await editor(page).click();
  await page.keyboard.type('Calm day. Kept the promise to write every night.');
  await waitSaved(page);
  expect(await sumBy(page, 'reflection')).toBe(0);
  await page.getByRole('checkbox', { name: /Documented/ }).click();
  await expect(page.getByRole('checkbox', { name: /Documented/ })).toBeChecked();
  await expect.poll(() => sumBy(page, 'reflection')).toBeGreaterThan(0);
  await page.reload();
  const entries = await table(page, 'entries');
  expect(entries.map((e) => e.kind).sort()).toEqual(['doing', 'reflection']);
  expect(entries.every((e) => (e.taskIds as string[]).length === 0)).toBe(true);
  await page.goto('/journal?q=backup%20import');
  await expect(page.getByText(/Fixed the backup import bug/)).toBeVisible();
});

test('#6 switching routes while typing loses nothing, and a failed save says so and keeps the text', async ({ page }) => {
  await page.getByRole('button', { name: /What I learned/ }).first().click();
  await editor(page).click();
  await page.keyboard.type('Typed right before leaving the page');
  await page.getByRole('link', { name: 'Calendar' }).first().click();
  await page.getByRole('link', { name: 'Today' }).first().click();
  await expect(page.getByText('Typed right before leaving the page')).toBeVisible();
  const [entry] = await table(page, 'entries');
  expect(entry!.plainText).toBe('Typed right before leaving the page');

  // Make every IndexedDB write fail, then keep typing.
  await page.getByRole('button', { name: /Edit/ }).first().click();
  await page.evaluate(() => {
    const fail = function () {
      throw new DOMException('Simulated storage failure', 'UnknownError');
    };
    IDBObjectStore.prototype.put = fail as never;
    IDBObjectStore.prototype.add = fail as never;
  });
  await editor(page).click();
  await page.keyboard.type(' and more');
  await expect(page.getByText(/Save failed\. Your text is still here/)).toBeVisible({ timeout: 10_000 });
  await expect(editor(page)).toContainText('Typed right before leaving the page and more');
});

test('#7 delete and undo restore task and rewards; deleting a documented log reverses only its bonus', async ({ page }) => {
  await addTask(page, 'Read one chapter', 'Learn');
  await writeLogFor(page, 'Read one chapter');
  await editor(page).click();
  await page.keyboard.type('What I learned.');
  await page.getByRole('checkbox', { name: /Documented/ }).click();
  await expect(page.getByRole('checkbox', { name: /Documented/ })).toBeChecked();
  await waitSaved(page);
  await expect.poll(() => xp(page)).toEqual({ learning: 25 });

  await page.getByRole('button', { name: 'Actions for Read one chapter' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect.poll(async () => (await xp(page)).learning ?? 0).toBe(0);
  expect(await table(page, 'entries')).toHaveLength(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => xp(page)).toEqual({ learning: 25 });
  const [task] = await table(page, 'tasks');
  expect(task).toMatchObject({ status: 'completed', deletedAt: null });

  await page.reload();
  await page.getByRole('button', { name: /Edit What I learned entry/ }).first().click();
  await page.getByRole('button', { name: 'Entry actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete entry' }).click();
  await expect.poll(() => sumBy(page, 'documentation')).toBe(0);
  expect(await sumBy(page, 'task-completion')).toBe(20);
  expect((await table(page, 'tasks'))[0]!.deletedAt).toBeNull();
});

test('#8 at midnight the open draft stays on its day and the new day is offered', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-10T23:59:20+05:30') });
  await page.goto('/');
  await page.getByRole('button', { name: /What I learned/ }).first().click();
  await editor(page).click();
  await page.keyboard.type('Written just before midnight');
  await waitSaved(page);
  await page.clock.fastForward(60_000);
  await expect(page.getByText(/It's a new day\. Your open entry stays on/)).toBeVisible({ timeout: 15_000 });
  await editor(page).click();
  await page.keyboard.type(', and finished after.');
  await page.clock.fastForward(2_000);
  await waitSaved(page);
  const [entry] = await table(page, 'entries');
  expect(entry).toMatchObject({ dateKey: '2026-10-10' });
  expect(entry!.plainText).toContain('finished after');
});

test('#9 moving a task keeps its id, original date and history, with no new reward', async ({ page }) => {
  await addTask(page, 'Ship the settings screen', 'Do');
  const [before] = await table(page, 'tasks');
  await page.getByRole('button', { name: 'Actions for Ship the settings screen' }).click();
  await page.getByRole('menuitem', { name: 'Move to tomorrow' }).click();
  await expect.poll(async () => (await table(page, 'tasks'))[0]!.scheduledDate).toBe('2026-10-11');
  const [after] = await table(page, 'tasks');
  expect(after!.id).toBe(before!.id);
  expect(after!.originalScheduledDate).toBe('2026-10-10');
  const moves = await table(page, 'taskMoves');
  expect(moves).toHaveLength(1);
  expect(moves[0]).toMatchObject({ taskId: before!.id, fromDate: '2026-10-10', toDate: '2026-10-11' });
  expect(await table(page, 'tasks')).toHaveLength(1);
  expect(await table(page, 'xpEvents')).toHaveLength(0);
});

test('#10 pasting three lines previews and creates exactly three tasks, ignoring blanks', async ({ page }) => {
  const input = page.getByPlaceholder(/one-line task/);
  await input.focus();
  await input.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'Read one chapter\n\nShip the settings screen\n   \nCall two clients\n');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  const dialog = page.getByRole('dialog', { name: 'Add several tasks' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Add 3 tasks' }).click();
  await expect.poll(async () => (await table(page, 'tasks')).length).toBe(3);
  expect(byRank(await table(page, 'tasks')).map((t) => t.title)).toEqual(['Read one chapter', 'Ship the settings screen', 'Call two clients']);
});
