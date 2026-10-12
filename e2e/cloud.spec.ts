import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { addTask, startAt } from './helpers';

/**
 * Inside claude.ai the page gets `window.claude`, whose `db` keeps the account
 * copy. Here it is stood in for by a store held by the test, so a second,
 * empty browser can show that everything comes back.
 */
type Store = Map<string, Record<string, unknown>>;

async function openWithAccount(context: BrowserContext, store: Store): Promise<Page> {
  await context.exposeBinding('__cloudGet', (_s, path: string) => store.get(path) ?? null);
  await context.exposeBinding('__cloudSet', (_s, path: string, data: Record<string, unknown>) => void store.set(path, data));
  await context.addInitScript(() => {
    const w = window as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    const db = {
      doc: (path: string) => ({
        get: async () => {
          const d = (await w.__cloudGet!(path)) as Record<string, unknown> | null;
          return { exists: !!d, data: () => d ?? undefined };
        },
        set: (data: Record<string, unknown>) => w.__cloudSet!(path, data),
      }),
    };
    const user = { id: async () => 'prem' };
    (window as unknown as { claude: unknown }).claude = { use: async (name: string) => (name === 'db' ? db : name === 'user' ? user : null) };
  });
  return context.newPage();
}

test('inside claude.ai everything is saved to the account and comes back in an empty browser', async ({ browser }) => {
  const store: Store = new Map();
  const first = await browser.newContext();
  const page = await openWithAccount(first, store);
  await startAt(page);
  await page.goto('/');
  await addTask(page, 'Read one chapter', 'Learn');
  // Moving around the app and adding elsewhere keeps the first task.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Journal' }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).click();
  await addTask(page, 'Call two clients', 'Do');
  // The status line says when the latest change has reached the account.
  const saved = () => (store.get('data/users/prem/manifest')?.savedAt as string | undefined) ?? '';
  await expect.poll(saved).not.toBe('');
  await expect(page.getByRole('status').filter({ hasText: /^Saved to your account/ })).toBeVisible({ timeout: 15_000 });
  await first.close();

  // A fresh browser has no local data at all, like storage that was cleared.
  const second = await browser.newContext();
  const again = await openWithAccount(second, store);
  await startAt(again);
  await again.goto('/');
  const list = again.getByRole('list', { name: /^Tasks for/ });
  await expect(list.getByText('Read one chapter', { exact: true })).toBeVisible();
  await expect(list.getByText('Call two clients', { exact: true })).toBeVisible();
  await again.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();
  await expect(again.getByText(/Up to date\. Last saved/)).toBeVisible();
  await second.close();
});

test('outside claude.ai nothing about the account shows', async ({ page }) => {
  await startAt(page);
  await page.goto('/');
  await addTask(page, 'Local only', 'Do');
  await expect(page.getByText(/your account/)).toHaveCount(0);
});
