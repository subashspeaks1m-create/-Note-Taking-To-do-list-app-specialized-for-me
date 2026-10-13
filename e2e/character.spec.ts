import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { addTask, startAt } from './helpers';

const portrait = (page: Page) => page.locator('.portrait--strip');

/**
 * The open-source Chromium used for these checks has no H.264 decoder, so the
 * real MP4 always takes the still fallback here. To test playback rules, the
 * MP4 request is answered with a short VP9 copy of the same loop.
 */
async function playableVideo(page: Page) {
  const webm = await readFile(new URL('./fixtures/portrait-test.webm', import.meta.url));
  await page.route('**/figure-center-loop.mp4', (r) => r.fulfill({ body: webm, contentType: 'video/webm' }));
}

test('#23 the character video keeps its proportions and has a still fallback', async ({ page }) => {
  await startAt(page);
  await playableVideo(page);
  await page.goto('/');
  const video = portrait(page).locator('video');
  await expect(video).toBeVisible();
  const look = await video.evaluate((v: HTMLVideoElement) => ({ fit: getComputedStyle(v).objectFit, muted: v.muted, poster: v.poster, loop: v.loop }));
  // Never stretched: contain shows the whole bust, cover is the deliberate head crop of the collapsed strip.
  expect(['contain', 'cover']).toContain(look.fit);
  expect(look).toMatchObject({ muted: true, loop: true });
  expect(look.poster).toMatch(/base-poster\.webp/);

  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
  const box = await video.boundingBox();
  expect(box!.width).toBeGreaterThan(0);

  // If the video cannot load (or the browser can't decode it), the still frame takes its place.
  await page.unroute('**/figure-center-loop.mp4');
  await page.route('**/figure-center-loop.mp4', (r) => r.abort());
  await page.reload();
  const still = portrait(page).locator('img');
  await expect(still).toBeVisible();
  expect(['contain', 'cover']).toContain(await still.evaluate((i: HTMLImageElement) => getComputedStyle(i).objectFit));
  await expect.poll(() => still.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
});

test('#24 reduced motion, missing media, hidden page and offscreen all fall back quietly', async ({ page }) => {
  await startAt(page);

  // Reduced motion: a still image, no video at all.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(portrait(page).locator('img')).toBeVisible();
  await expect(portrait(page).locator('video')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // Every portrait file missing: a labeled placeholder, the page still works.
  await page.route(/figure-center-loop\.mp4|base-poster\.(webp|jpg)/, (r) => r.abort());
  await page.reload();
  await expect(page.getByRole('img', { name: 'Character image could not load' })).toBeVisible();
  await addTask(page, 'Still works without the portrait', 'Do');
  await page.unroute(/figure-center-loop\.mp4|base-poster\.(webp|jpg)/);

  // Hidden page pauses the video; showing it again resumes.
  await playableVideo(page);
  await page.reload();
  const video = portrait(page).locator('video');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  const setHidden = (hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await setHidden(true);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await setHidden(false);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);

  // Offscreen pauses it too.
  await page.setViewportSize({ width: 1440, height: 400 });
  await page.evaluate(() => document.querySelector('.portrait--strip')!.closest('main')!.scrollTo(0, 99_999));
  await page.evaluate(() => window.scrollTo(0, 99_999));
  const offscreen = await portrait(page).evaluate((el) => el.getBoundingClientRect().bottom < 0);
  expect(offscreen).toBe(true);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);

  // Nothing makes sound on its own: every media element is muted and chimes are off by default.
  const loud = await page.evaluate(() => [...document.querySelectorAll('video, audio')].filter((m) => !(m as HTMLMediaElement).muted).length);
  expect(loud).toBe(0);
  await page.goto('/settings');
  await expect(page.getByRole('group', { name: 'Sounds' }).getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true');
});

test('the Vault loads your 3D model, switches outfits and the mask, and keeps auto-rotate off with reduced motion', async ({ page }) => {
  test.setTimeout(120_000);
  await startAt(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/vault');
  // The picture character is the default; the 3D model is one tap away.
  await expect(page.getByRole('status').filter({ hasText: /^Picture ·/ })).toBeVisible();
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.getByRole('button', { name: '3D', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const status = page.getByRole('status').filter({ hasText: /3D model ·|Stand-in|3D is not available|could not/ });
  await expect(status).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Auto-rotate' })).toBeDisabled();
  // All outfits are open from day one (Prem's decision): none is locked.
  await expect(page.getByText(/locked/i)).toHaveCount(0);
  if (!/3D model ·/.test((await status.textContent()) ?? '')) {
    test.info().annotations.push({ type: 'note', description: 'No WebGL in this browser: the stand-in fallback was checked instead.' });
    return;
  }
  // Initiate has no mask; Web Runner does, and it can be switched on.
  await expect(page.getByRole('button', { name: 'Mask' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Web Runner/ }).first().click();
  await expect(page.getByRole('status').filter({ hasText: /3D model ·/ })).toBeVisible();
  const mask = page.getByRole('button', { name: 'Mask' });
  await expect(mask).toHaveAttribute('aria-pressed', 'false');
  await mask.click();
  await expect(mask).toHaveAttribute('aria-pressed', 'true');
});

test("you stand on the platform as a picture in today's outfit, turn with the platform, and a missing picture says so", async ({ page }) => {
  await startAt(page);
  await page.goto('/character');
  const figure = page.locator('.pfig');
  await expect(figure).toHaveAttribute('data-outfit', 'initiate');
  await expect.poll(() => figure.locator('img.is-on').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole('link', { name: 'change outfit in the Vault' })).toBeVisible();

  // Every outfit is listed on the Character page too; tapping one tries it on, and it can be worn from there.
  await expect(page.locator('.outfit-card')).toHaveCount(15);
  await page.locator('.outfit-card').filter({ hasText: 'Showman' }).getByRole('button').click();
  await expect(figure).toHaveAttribute('data-outfit', 'showman');
  await page.getByRole('button', { name: 'Wear today' }).click();
  await expect(page.locator('.outfit-card.is-worn')).toContainText('Showman');

  // An outfit without its picture yet shows your outline, clearly labeled.
  await page.goto('/vault');
  await page.getByRole('button', { name: /^Mercenary/ }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Picture coming' })).toBeVisible();

  // The Training Tee has all eight sides: turning the platform turns him.
  await page.getByRole('button', { name: /^Training Tee/ }).first().click();
  await page.getByRole('button', { name: 'Wear today' }).click();
  await expect(page.getByText("You're wearing this today")).toBeVisible();
  await page.goto('/character');
  await expect(figure).toHaveAttribute('data-outfit', 'training-tee');
  const side = () => figure.locator('img.is-on').getAttribute('src');
  const before = await side();
  await page.getByRole('group', { name: /Drag or use the left and right arrow keys/ }).focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(side).not.toBe(before);
});
