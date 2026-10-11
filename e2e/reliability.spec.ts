import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { addTask, startAt, table, waitSaved, xp } from './helpers';

const netXp = async (page: Page) => Object.values(await xp(page)).reduce((a, b) => a + b, 0);

async function makeSomeData(page: Page) {
  await addTask(page, 'Read one chapter', 'Learn');
  await addTask(page, 'Ship the settings screen', 'Do');
  await page.getByRole('checkbox', { name: 'Complete: Read one chapter' }).click();
  await page.getByRole('button', { name: /Write what happened/ }).first().click();
  await page.locator('.prose--editor').last().click();
  await page.keyboard.type('Chapter three: attention residue.');
  await page.getByRole('checkbox', { name: /Documented/ }).click();
  await waitSaved(page);
  await page.getByRole('button', { name: /^Set today:/ }).click();
  await page.getByRole('textbox', { name: /Today:/ }).fill('Finish the backup screen');
  await page.getByRole('textbox', { name: /Today:/ }).press('Enter');
  await expect(page.getByRole('button', { name: /Today: Finish the backup screen/ })).toBeVisible();
}

async function restore(page: Page, file: string, mode: 'Merge' | 'Replace') {
  await page.goto('/settings');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose backup file' }).click();
  await (await chooser).setFiles(file);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (mode === 'Replace') await dialog.getByRole('radio', { name: /Replace/ }).check();
  await dialog.getByRole('button', { name: mode === 'Merge' ? 'Merge into my data' : 'Replace my data' }).click();
  await expect(dialog).toBeHidden();
}

test('#26 backup, clear, restore brings everything back; merging again duplicates nothing', async ({ page, browser }, info) => {
  await startAt(page);
  await page.goto('/');
  await makeSomeData(page);
  const before = { tasks: (await table(page, 'tasks')).length, entries: (await table(page, 'entries')).length, xp: await netXp(page), dirs: (await table(page, 'periodDirections')).length };

  await page.goto('/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download backup/ }).click();
  const file = info.outputPath('backup.json');
  await (await download).saveAs(file);
  const json = JSON.parse(await readFile(file, 'utf8'));
  expect(json.tables.tasks).toHaveLength(2);
  expect(JSON.stringify(json)).not.toContain('sk-or-');

  // A brand-new browser profile stands in for a cleared database.
  const fresh = await (await browser.newContext({ timezoneId: 'Asia/Kolkata', baseURL: info.project.use.baseURL })).newPage();
  await startAt(fresh);
  await fresh.goto('/');
  await expect(fresh.getByPlaceholder(/one-line task/)).toBeVisible();
  expect(await table(fresh, 'tasks')).toHaveLength(0);
  await restore(fresh, file, 'Replace');
  const after = { tasks: (await table(fresh, 'tasks')).length, entries: (await table(fresh, 'entries')).length, xp: await netXp(fresh), dirs: (await table(fresh, 'periodDirections')).length };
  expect(after).toEqual(before);
  const [entry] = await table(fresh, 'entries');
  const tasks = await table(fresh, 'tasks');
  expect(tasks.map((t) => t.id)).toContain((entry!.taskIds as string[])[0]);

  const xpEvents = (await table(fresh, 'xpEvents')).length;
  await restore(fresh, file, 'Merge');
  expect({ tasks: (await table(fresh, 'tasks')).length, entries: (await table(fresh, 'entries')).length, xp: await netXp(fresh), xpEvents: (await table(fresh, 'xpEvents')).length }).toEqual({
    tasks: before.tasks,
    entries: before.entries,
    xp: before.xp,
    xpEvents,
  });
});

test('#27 a corrupt file or a newer schema is refused before anything changes', async ({ page }, info) => {
  await startAt(page);
  await page.goto('/');
  await addTask(page, 'Keep me', 'Do');
  const bad = info.outputPath('bad.json');
  await writeFile(bad, '{"app":"pursuit-of-greatness","tables":{"tasks":[{"id":1}]}');
  await page.goto('/settings');
  let chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose backup file' }).click();
  await (await chooser).setFiles(bad);
  await expect(page.getByRole('dialog', { name: 'This file cannot be restored' })).toBeVisible();
  await expect(page.getByRole('dialog').getByText(/Nothing was changed/)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).last().click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download backup/ }).click();
  const good = info.outputPath('good.json');
  await (await download).saveAs(good);
  const newer = JSON.parse(await readFile(good, 'utf8'));
  newer.schemaVersion = 999;
  const newerFile = info.outputPath('newer.json');
  await writeFile(newerFile, JSON.stringify(newer));
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose backup file' }).click();
  await (await chooser).setFiles(newerFile);
  await expect(page.getByRole('dialog', { name: 'This file cannot be restored' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).last().click();
  expect((await table(page, 'tasks')).map((t) => t.title)).toEqual(['Keep me']);
});

test('#29 two tabs editing one entry never silently drop either draft', async ({ page, context }) => {
  await startAt(page);
  await page.goto('/');
  await page.getByRole('button', { name: /What I learned/ }).first().click();
  await page.locator('.prose--editor').last().click();
  await page.keyboard.type('Shared start.');
  await waitSaved(page);

  const other = await context.newPage();
  await startAt(other);
  await other.goto('/');
  await other.getByRole('button', { name: /Edit What I learned entry/ }).first().click();
  await expect(other.locator('.prose--editor').last()).toContainText('Shared start.');

  // Tab A has an unsaved edit (its autosave timer is held) while tab B saves.
  await page.evaluate(() => {
    const w = window as unknown as { __held: (() => void)[]; __setTimeout: typeof setTimeout };
    w.__held = [];
    w.__setTimeout = window.setTimeout;
    window.setTimeout = ((fn: () => void) => {
      w.__held.push(fn);
      return 0;
    }) as unknown as typeof setTimeout;
  });
  await page.locator('.prose--editor').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Written in tab A.');
  await other.locator('.prose--editor').last().click();
  await other.keyboard.press('End');
  await other.keyboard.type(' Written in tab B.');
  await waitSaved(other);
  await page.evaluate(() => {
    const w = window as unknown as { __held: (() => void)[]; __setTimeout: typeof setTimeout };
    window.setTimeout = w.__setTimeout;
    for (const fn of w.__held) fn();
  });

  await expect(page.getByText('Not saved: changed in another tab')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.prose--editor').last()).toContainText('Written in tab A.');
  const [entry] = await table(page, 'entries');
  expect(entry!.plainText).toContain('Written in tab B.');
  expect(entry!.plainText).not.toContain('Written in tab A.');

  // Choosing "Keep mine" saves tab A's text and keeps tab B's in the entry's history.
  await page.getByRole('button', { name: 'Keep mine' }).click();
  await expect.poll(async () => (await table(page, 'entries'))[0]!.plainText).toContain('Written in tab A.');
  const history = await table(page, 'entryRevisions');
  expect(history.some((r) => String(r.plainText).includes('Written in tab B.'))).toBe(true);
});

test('#30 keyboard only: add, complete, write, save, calendar, dialog, navigate', async ({ page }) => {
  await startAt(page);
  await page.goto('/');
  await expect(page.getByPlaceholder(/one-line task/)).toBeVisible();
  // The first Tab reaches the skip link.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  const input = page.getByPlaceholder(/one-line task/);
  await input.focus();
  await page.keyboard.type('Read one chapter');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Read one chapter', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Complete: Read one chapter' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('checkbox', { name: 'Mark not done: Read one chapter' })).toBeChecked();
  await page.getByRole('button', { name: /Write what happened/ }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.prose--editor').last()).toBeFocused();
  await page.keyboard.type('Typed with the keyboard only.');
  await waitSaved(page);

  await page.getByRole('link', { name: 'Calendar' }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/calendar/);
  const todayCell = page.getByRole('button', { name: /October 10, 2026, today/ });
  await todayCell.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(todayCell).toBeFocused();

  // Every button and form control has an accessible name.
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('button, input, select, textarea, a[href]')]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .filter((el) => {
        const e = el as HTMLElement;
        const label = e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.textContent?.trim() || (e as HTMLInputElement).labels?.length || e.getAttribute('title');
        return !label;
      })
      .map((el) => el.outerHTML.slice(0, 80)),
  );
  expect(unnamed).toEqual([]);
});
