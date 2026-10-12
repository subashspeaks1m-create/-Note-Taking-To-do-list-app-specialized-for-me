import { expect, test, type Page } from '@playwright/test';
import { addTask, startAt } from './helpers';

// Sunday evening: the week (Mon Oct 5 to Sun Oct 11) is complete, so its report opens by default.
const EVENING = new Date('2026-10-11T19:00:00+05:30');

const NOTES = `## The week in one line
You shipped one real thing.

## Three moves for next week
1. Read before email.
2. Ship one screen.
3. Write before bed.`;

/** Stands in for claude.ai's runtime: `sample` answers as Claude would and records the prompts. */
async function insideClaude(page: Page) {
  const prompts: string[] = [];
  await page.exposeBinding('__sample', (_s, prompt: string) => {
    prompts.push(prompt);
    return prompt.includes('single word: ready') ? 'ready' : NOTES;
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __sample: (p: string) => Promise<string>; claude: unknown };
    const sample = async (input: string) => ({ text: await w.__sample(input), truncated: false });
    w.claude = { use: async (name: string) => (name === 'sample' ? sample : null) };
  });
  return prompts;
}

test('inside the Claude app the coach writes notes through Claude with no key', async ({ page }) => {
  const prompts = await insideClaude(page);
  let outside = 0;
  await page.route('https://openrouter.ai/**', (r) => {
    outside++;
    return r.abort();
  });
  await startAt(page, EVENING);
  await page.goto('/');
  await addTask(page, 'Ship the settings screen', 'Do');
  await page.getByRole('checkbox', { name: 'Complete: Ship the settings screen' }).click();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByText('Claude (in this app link)')).toBeVisible();
  await page.getByRole('button', { name: 'Test' }).first().click();
  await expect(page.getByText('Connected. Claude answered.')).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Insights' }).click();
  await page.getByRole('tab', { name: 'Weekly report' }).click();
  await page.getByRole('button', { name: "Write my week's notes" }).click();
  await expect(page.getByRole('heading', { name: 'Three moves for next week' })).toBeVisible();
  await expect(page.getByText(/by Claude · AI can be wrong/)).toBeVisible();
  expect(prompts.at(-1)).toContain('Ship the settings screen');
  expect(outside).toBe(0);
});

test('when OpenRouter cannot be reached the coach says so in plain words, once', async ({ page }) => {
  await page.route('https://openrouter.ai/**', (r) => r.abort());
  await startAt(page, EVENING);
  await page.goto('/settings');
  await page.locator('#coach-key').fill('sk-or-v1-test-0000000000000000000000000000');
  await page.getByRole('button', { name: 'Save key' }).click();
  await page.getByRole('button', { name: 'Test' }).click();
  await expect(page.getByText('Could not reach OpenRouter. Check your internet connection and try again.')).toBeVisible();
  await expect(page.getByText(/Load failed|Failed to fetch/)).toHaveCount(0);
});
