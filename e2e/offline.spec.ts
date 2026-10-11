import { expect, test } from '@playwright/test';
import { addTask, startAt } from './helpers';

/**
 * Runs against the production build (`vite preview`), the only one with a
 * service worker. Dates are left real here: the clock is not faked, because
 * service-worker caching does not need a fixed day.
 */
test('#28 after the first visit the app reopens offline: Today, dates, journal, visions, art and settings', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByPlaceholder(/one-line task/)).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  // The first visit precaches every page and image; reload once so the worker controls the page.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await addTask(page, 'Written while online', 'Do');

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Written while online', { exact: true })).toBeVisible();
  await addTask(page, 'Written while offline', 'Learn');

  // Date navigation.
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.getByText('Written while offline', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.getByText('Written while offline', { exact: true })).toBeVisible();

  // Every main page opens offline, including on a direct load (SPA fallback from the cache).
  for (const [path, heading] of [
    ['/journal', /Journal/],
    ['/visions', /Visions/],
    ['/calendar', /Calendar|October|November|December/],
    ['/character', /character/i],
    ['/settings', /Settings/],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(heading);
  }

  // Art is precached: app icons and the character still decode with no network.
  const broken = await page.evaluate(async () => {
    const urls = ['/icons/icon-192.png', '/assets/character/base-poster.webp'];
    const bad: string[] = [];
    for (const u of urls) {
      const ok = await new Promise<boolean>((res) => {
        const img = new Image();
        img.onload = () => res(img.naturalWidth > 0);
        img.onerror = () => res(false);
        img.src = u;
      });
      if (!ok) bad.push(u);
    }
    return bad;
  });
  expect(broken).toEqual([]);

  // The character clip was never played online here, so it is not cached: the still frame shows instead.
  await page.goto('/');
  await expect(page.locator('.portrait--strip img, .portrait--strip video').first()).toBeVisible();
  await context.setOffline(false);
});

test('#28 the production build ignores the development clock override', async ({ page }) => {
  // `?now=` only works in development; in the real app it must be ignored.
  await startAt(page);
  await page.goto('/?now=2030-01-01T10:00');
  await expect(page.getByText(/2030/)).toHaveCount(0);
});
