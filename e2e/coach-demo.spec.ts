import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type Route } from '@playwright/test';
import { addTask, startAt, table, waitSaved } from './helpers';

const FAKE_KEY = 'sk-or-v1-test-0000000000000000000000000000';
// Sunday evening: the week (Mon Oct 5 to Sun Oct 11) is complete, so its report opens by default.
const EVENING = new Date('2026-10-11T19:00:00+05:30');

const NOTES = `## The week in one line
You shipped one real thing and wrote it down.

## What went well
- Finished "Ship the settings screen".

## What slipped
- Reading only happened once.

## A pattern I noticed
Work done before noon got written up.

## Three moves for next week
1. Read before email.
2. Ship one screen.
3. Write before bed.`;

/** Answers OpenRouter calls locally and records what the app sent. */
async function fakeOpenRouter(page: Page) {
  const sent: { url: string; auth: string | null; body: Record<string, unknown> | null }[] = [];
  await page.route('https://openrouter.ai/api/v1/**', async (route: Route) => {
    const req = route.request();
    sent.push({ url: req.url(), auth: req.headers()['authorization'] ?? null, body: req.postDataJSON() as Record<string, unknown> | null });
    if (req.url().endsWith('/models')) {
      return route.fulfill({ json: { data: [{ id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)' }, { id: 'openai/gpt-5', name: 'Paid model' }] } });
    }
    const body = req.postDataJSON() as { model: string };
    return route.fulfill({ json: { model: body.model, choices: [{ message: { role: 'assistant', content: NOTES } }] } });
  });
  return sent;
}

test('AI coach: key stays in this browser, only free models are called, notes are saved with the report', async ({ page }, info) => {
  const sent = await fakeOpenRouter(page);
  await startAt(page, EVENING);
  await page.goto('/');
  await addTask(page, 'Ship the settings screen', 'Do');
  await page.getByRole('checkbox', { name: 'Complete: Ship the settings screen' }).click();
  await page.getByRole('button', { name: /Write what happened/ }).first().click();
  await page.locator('.prose--editor').last().click();
  await page.keyboard.type('Private journal line the coach may read.');
  await waitSaved(page);

  // A key that isn't OpenRouter's is refused; a real-looking one is saved and shown masked.
  await page.goto('/settings');
  await page.locator('#coach-key').fill('not-a-key');
  await page.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByText(/does not look like an OpenRouter key/)).toBeVisible();
  await page.locator('#coach-key').fill(FAKE_KEY);
  await page.getByRole('button', { name: 'Save key' }).click();
  await expect(page.getByText(FAKE_KEY)).toHaveCount(0);
  await page.getByRole('button', { name: 'Test' }).click();
  await expect(page.getByText(/Connected\./)).toBeVisible();
  // The model list only offers free models.
  const options = await page.locator('#coach-model option').allTextContents();
  expect(options.join(' ')).not.toContain('Paid model');

  await page.goto('/insights');
  await page.getByRole('tab', { name: 'Weekly report' }).click();
  await page.getByRole('button', { name: "Write my week's notes" }).click();
  await expect(page.getByRole('heading', { name: 'Three moves for next week' })).toBeVisible();
  await expect(page.getByText(/AI can be wrong; your record is the truth/)).toBeVisible();

  const chats = sent.filter((s) => s.url.endsWith('/chat/completions'));
  expect(chats.length).toBeGreaterThan(0);
  for (const c of chats) {
    expect(c.auth).toBe(`Bearer ${FAKE_KEY}`);
    expect(String(c.body!.model)).toMatch(/:free$/);
  }
  expect(JSON.stringify(chats.at(-1)!.body)).toContain('Private journal line the coach may read.');

  // Saved with the record; survives reload. The key is never in the database or a backup.
  await page.reload();
  await page.getByRole('tab', { name: 'Weekly report' }).click();
  await expect(page.getByRole('heading', { name: 'Three moves for next week' })).toBeVisible();
  const kv = await table(page, 'kv');
  expect(kv.some((r) => String(r.key).startsWith('coach:week:'))).toBe(true);
  expect(JSON.stringify(kv)).not.toContain(FAKE_KEY);
  await page.goto('/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download backup/ }).click();
  const file = info.outputPath('backup.json');
  await (await download).saveAs(file);
  expect(await readFile(file, 'utf8')).not.toContain(FAKE_KEY);
});

test('Demo mode shows fictional data in its own database and leaves real data untouched', async ({ page }) => {
  await startAt(page);
  await page.goto('/');
  await addTask(page, 'My real task', 'Do');

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Try demo mode' }).click();
  await expect(page.getByRole('button', { name: 'Exit demo' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('list', { name: /^Tasks for/ }).getByText('Ship the character screen', { exact: true })).toBeVisible();
  await expect(page.getByText('My real task', { exact: true })).toHaveCount(0);
  // The banner can't be dismissed while demo data is showing.
  await page.goto('/visions');
  await expect(page.getByRole('button', { name: 'Exit demo' })).toBeVisible();
  await expect(page.getByText('Earn $10,000 from clients').first()).toBeVisible();

  // Real database: still only the real task and no demo XP.
  const real = await table(page, 'tasks');
  expect(real.map((t) => t.title)).toEqual(['My real task']);
  expect(await table(page, 'xpEvents')).toHaveLength(0);
  expect((await table(page, 'tasks', 'pursuit-of-greatness-demo')).length).toBeGreaterThan(10);

  await page.getByRole('button', { name: 'Exit demo' }).click();
  await expect(page.getByRole('button', { name: 'Exit demo' })).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByText('My real task', { exact: true })).toBeVisible();
});
