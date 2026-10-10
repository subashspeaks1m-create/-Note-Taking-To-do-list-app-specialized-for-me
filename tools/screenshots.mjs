// Captures review screenshots of the built app at the spec's four viewports.
// Usage: node tools/screenshots.mjs <baseUrl> <outDir> [query]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [base = 'http://localhost:4173', out = 'screenshots', query = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const sizes = [
  ['desktop', 1440, 900],
  ['laptop', 1024, 768],
  ['tablet', 768, 1024],
  ['mobile', 390, 844],
];
const routes = (process.env.ROUTES ?? '/').split(',');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const problems = [];
for (const [name, width, height] of sizes) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`${name} console: ${m.text()}`));
  for (const route of routes) {
    await page.goto(base + route + query, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) problems.push(`${name} ${route}: horizontal overflow ${overflow}px`);
    const slug = route === '/' ? 'today' : route.replace(/\W+/g, '');
    await page.screenshot({ path: `${out}/${slug}-${name}.png`, fullPage: process.env.FULL === '1' });
  }
  await ctx.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'no errors, no overflow');
