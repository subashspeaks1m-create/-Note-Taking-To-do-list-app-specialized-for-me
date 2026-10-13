import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { addTask, startAt, waitSaved } from './helpers';

/**
 * Inside the claude.ai app link a page can't download files itself; it hands
 * them to the viewer's save prompt (`downloads`). The stand-in here records
 * what was offered.
 */
type Saved = { name: string; bytes: Buffer }[];

async function openInClaude(context: BrowserContext, saved: Saved): Promise<Page> {
  const docs = new Map<string, Record<string, unknown>>();
  await context.exposeBinding('__cloudGet', (_s, path: string) => docs.get(path) ?? null);
  await context.exposeBinding('__cloudSet', (_s, path: string, data: Record<string, unknown>) => void docs.set(path, data));
  await context.exposeBinding('__saved', (_s, name: string, b64: string) => void saved.push({ name, bytes: Buffer.from(b64, 'base64') }));
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
    const downloads = {
      save: async ({ filename, data }: { filename: string; data: Blob | string }) => {
        const blob = typeof data === 'string' ? new Blob([data]) : data;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let bin = '';
        for (const b of bytes) bin += String.fromCharCode(b);
        await w.__saved!(filename, btoa(bin));
        return { status: 'saved' };
      },
    };
    const user = { id: async () => 'prem' };
    (window as unknown as { claude: unknown }).claude = { use: async (name: string) => ({ db, user, downloads })[name] ?? null };
  });
  return context.newPage();
}

test('inside claude.ai the Markdown, backup and monthly PDF exports reach the save prompt', async ({ browser }) => {
  const saved: Saved = [];
  const context = await browser.newContext();
  const page = await openInClaude(context, saved);
  await startAt(page, new Date('2026-10-20T10:00:00+05:30'));
  await page.goto('/');
  await addTask(page, 'Call three clients', 'Do');
  await page.getByRole('checkbox', { name: 'Complete: Call three clients' }).click();
  await page.getByRole('button', { name: /Write what happened/ }).first().click();
  await page.locator('.prose--editor').last().click();
  await page.keyboard.type('Two said yes to a call next week.');
  await waitSaved(page);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Journal' }).click();
  await page.getByRole('button', { name: /Export Markdown/ }).click();
  await expect.poll(() => saved.map((s) => s.name)).toContainEqual(expect.stringMatching(/\.md$/));
  expect(saved.find((s) => s.name.endsWith('.md'))!.bytes.toString('utf8')).toContain('Two said yes to a call next week.');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: /Download backup/ }).click();
  await expect.poll(() => saved.map((s) => s.name)).toContainEqual(expect.stringMatching(/\.json$/));

  // October is still running on Oct 20; the report can be saved for it any time.
  await page.goto('/insights?tab=month&p=2026-10-01');
  await page.getByRole('button', { name: /Save full report \(PDF\)/ }).click();
  await expect.poll(() => saved.map((s) => s.name), { timeout: 15_000 }).toContain('pursuit-month-report-2026-10.pdf');
  const pdf = saved.find((s) => s.name.endsWith('.pdf'))!.bytes;
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(5000);
  await expect(page.getByText('Monthly report saved as PDF')).toBeVisible();
  await context.close();
});

test('in a normal browser the monthly PDF downloads as a file', async ({ page }) => {
  await startAt(page, new Date('2026-10-20T10:00:00+05:30'));
  await page.goto('/');
  await addTask(page, 'Read one chapter', 'Learn');
  await page.getByRole('checkbox', { name: 'Complete: Read one chapter' }).click();
  await page.goto('/insights?tab=month&p=2026-10-01');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save full report \(PDF\)/ }).click();
  expect((await download).suggestedFilename()).toBe('pursuit-month-report-2026-10.pdf');
});
