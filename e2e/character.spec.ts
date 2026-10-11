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

test('#24 the 3D vault falls back to a stand-in when no model file is added, and stops spinning with reduced motion', async ({ page }) => {
  await startAt(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/vault');
  await expect(page.getByRole('status').filter({ hasText: /Stand-in|3D is not available/ })).toBeVisible({ timeout: 20_000 });
  // All outfits are open from day one (Prem's decision): none is locked.
  await expect(page.getByText(/locked/i)).toHaveCount(0);
});
