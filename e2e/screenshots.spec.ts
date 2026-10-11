import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { startAt } from './helpers';

/**
 * #31: screenshots at desktop, laptop, tablet and phone widths, in empty and
 * demo-filled states, plus a long paragraph, a locked rank form, a storage
 * error and reduced motion. Each shot also checks nothing spills sideways.
 * Shots land in e2e/.results/screens (open them to review by eye).
 */
const SIZES = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
] as const;
const PAGES = ['/', '/journal', '/visions', '/calendar', '/insights', '/character', '/vault', '/settings'] as const;
const SCREENS = fileURLToPath(new URL('./.results/screens/', import.meta.url));
const slug = (path: string) => (path === '/' ? 'today' : path.slice(1));

async function shoot(page: Page, name: string) {
  // Let entrance animations settle.
  await page.waitForTimeout(600);
  const spill = await page.evaluate(() => {
    const out: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push(`page is ${document.documentElement.scrollWidth}px wide`);
    // An element past the edge only matters if no ancestor clips it (glows and flashes are clipped on purpose).
    const clipped = (el: HTMLElement) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const o = getComputedStyle(a).overflowX;
        if (o !== 'visible' && a.getBoundingClientRect().right <= window.innerWidth + 1) return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll<HTMLElement>('main *')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > window.innerWidth + 1 && getComputedStyle(el).position !== 'fixed' && !clipped(el)) {
        out.push(`${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]} ends at ${Math.round(r.right)}px`);
      }
    }
    return out.slice(0, 5);
  });
  // Phones and tablets have a fixed bottom bar, which a full-page capture would paint mid-page.
  const wide = page.viewportSize()!.width >= 1024;
  await page.screenshot({ path: `${SCREENS}${name}.png`, fullPage: wide });
  expect(spill, `${name}: something runs off the side of the screen`).toEqual([]);
}

async function dismissStageNote(page: Page) {
  await expect(page.locator('main')).toBeVisible();
  const btn = page.getByRole('button', { name: 'Dismiss preview note' });
  await btn.waitFor({ timeout: 5_000 }).catch(() => undefined);
  if (await btn.isVisible()) await btn.click();
}

const pageReady = (page: Page) => expect(page.locator('main h1').first()).toBeVisible({ timeout: 30_000 });

for (const size of SIZES) {
  test(`#31 empty state at ${size.name}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await startAt(page);
    await page.goto('/');
    await dismissStageNote(page);
    for (const path of ['/', '/visions', '/character'] as const) {
      await page.goto(path);
      await pageReady(page);
      await shoot(page, `empty-${slug(path)}-${size.name}`);
    }
  });

  test(`#31 demo-filled at ${size.name}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    await page.addInitScript(() => localStorage.setItem('pog.demo', '1'));
    await startAt(page);
    await page.goto('/');
    await dismissStageNote(page);
    for (const path of PAGES) {
      await page.goto(path);
      await pageReady(page);
      await shoot(page, `demo-${slug(path)}-${size.name}`);
    }
  });
}

for (const size of [SIZES[0], SIZES[3]]) {
  test(`#31 a long paragraph stays readable at ${size.name}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await startAt(page);
    await page.goto('/');
    await dismissStageNote(page);
    // On a phone the journal sits behind the Log tab.
    const logTab = page.getByRole('tab', { name: /Log/ });
    if (await logTab.isVisible()) await logTab.click();
    await page.getByRole('button', { name: /What I learned/ }).first().click();
    await page.locator('.prose--editor').last().click();
    const long = 'Attention residue is what is left behind when you switch tasks: part of your mind stays on the last thing. '.repeat(14);
    await page.keyboard.insertText(long + 'Averyveryveryveryveryveryveryveryveryverylongwordwithoutanyspacesthatmustwrapinsteadofoverflowing.');
    await expect(page.locator('.save--ok').first()).toBeVisible({ timeout: 10_000 });
    await shoot(page, `long-paragraph-${size.name}`);
  });

  test(`#31 a locked rank form and reduced motion at ${size.name}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await startAt(page);
    await page.goto('/character');
    await dismissStageNote(page);
    await expect(page.getByText(/\$100K|100,000/).first()).toBeVisible();
    await shoot(page, `locked-rank-reduced-motion-${size.name}`);
  });

  test(`#31 storage error at ${size.name}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.addInitScript(() => {
      // Stands in for private browsing with storage blocked.
      IDBFactory.prototype.open = function () {
        throw new DOMException('Storage is blocked', 'SecurityError');
      };
    });
    await startAt(page);
    await page.goto('/');
    await expect(page.getByRole('alert').or(page.getByRole('heading', { name: /storage|save/i })).first()).toBeVisible({ timeout: 15_000 });
    await shoot(page, `storage-error-${size.name}`);
  });
}
