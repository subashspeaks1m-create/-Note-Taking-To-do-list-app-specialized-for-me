import { expect, type Page } from '@playwright/test';

/** 10:00 on Oct 10, 2026 in Asia/Kolkata: the day the acceptance list is written for. */
export const OCT10 = new Date('2026-10-10T10:00:00+05:30');

/** Starts the page's clock at `at` and lets it run in real time from there. */
export async function startAt(page: Page, at: Date = OCT10) {
  await page.clock.install({ time: at });
  await page.clock.resume();
}

export async function addTask(page: Page, title: string, category: 'Learn' | 'Do') {
  await page.getByRole('group', { name: 'Category for the new task' }).getByRole('button', { name: category }).click();
  const input = page.getByPlaceholder(/one-line task/);
  await input.fill(title);
  await input.press('Enter');
  await expect(page.getByRole('list', { name: /^Tasks for/ }).getByText(title, { exact: true })).toBeVisible();
}

type Row = Record<string, unknown>;

/** Reads a whole table straight from IndexedDB, to check what was really stored. */
export async function table(page: Page, name: string, db = 'pursuit-of-greatness'): Promise<Row[]> {
  return page.evaluate(
    ([dbName, store]) =>
      new Promise<Row[]>((resolve, reject) => {
        const rq = indexedDB.open(dbName!);
        rq.onerror = () => reject(rq.error);
        rq.onsuccess = () => {
          const tx = rq.result.transaction(store!, 'readonly');
          const all = tx.objectStore(store!).getAll();
          all.onsuccess = () => {
            resolve(all.result as Row[]);
            rq.result.close();
          };
          all.onerror = () => reject(all.error);
        };
      }),
    [db, name],
  );
}

/** Net XP by category from the ledger. */
export async function xp(page: Page): Promise<Record<string, number>> {
  const events = await table(page, 'xpEvents');
  const out: Record<string, number> = {};
  for (const e of events) out[e.category as string] = (out[e.category as string] ?? 0) + (e.delta as number);
  return out;
}

export async function waitSaved(page: Page) {
  await expect(page.locator('.save--ok').first()).toBeVisible({ timeout: 10_000 });
}
