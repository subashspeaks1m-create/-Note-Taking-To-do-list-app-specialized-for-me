import { expect, test, type Page } from '@playwright/test';
import { addTask, startAt, table } from './helpers';

const at = (iso: string) => new Date(iso);

async function setDirection(page: Page, slot: RegExp, text: string) {
  await page.getByRole('button', { name: slot }).click();
  const box = page.getByRole('textbox', { name: /:/ }).last();
  await box.fill(text);
  await box.press('Enter');
  await expect(page.getByRole('button', { name: new RegExp(`${text}\\. Edit`) })).toBeVisible();
}

test('#11 plans keep their exact original dates, even when opened in a later year', async ({ page }) => {
  await startAt(page);
  await page.goto('/visions');
  await expect(page.getByText(/82 days after today/).first()).toBeVisible();
  const dates = async () =>
    (await table(page, 'plans')).map((p) => [p.kind, p.startDate, p.endDate]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const expected = [
    ['decade', '2026-10-10', '2036-10-10'],
    ['sprint', '2026-10-10', '2026-12-31'],
    ['year', '2026-10-10', '2027-10-10'],
  ];
  expect(await dates()).toEqual(expected);

  const later = await page.context().newPage();
  await later.clock.install({ time: at('2027-03-01T09:00:00+05:30') });
  await later.goto('/visions');
  await expect(later.getByText(/Sprint ended/).first()).toBeVisible();
  expect(await dates()).toEqual(expected);
});

for (const [when, label] of [
  ['2026-10-10T10:00:00+05:30', '82 days after today'],
  ['2026-10-11T10:00:00+05:30', '81 days after today'],
  ['2026-12-31T10:00:00+05:30', 'Final day'],
  ['2027-01-01T10:00:00+05:30', 'Sprint ended'],
] as const) {
  test(`#12 countdown on ${when.slice(0, 10)} reads "${label}"`, async ({ page }) => {
    await startAt(page, at(when));
    await page.goto('/');
    await expect(page.locator('.horizon__count').first()).toContainText(label);
    await expect(page.getByText(/-\d+ days/)).toHaveCount(0);
  });
}

test('#13 direction for a day, week and month never overwrites another period', async ({ page }) => {
  await startAt(page);
  await page.goto('/');
  await setDirection(page, /^Set today:/, 'Ship the settings screen');
  await setDirection(page, /^Set this week:/, 'Finish the core daily workflow');
  await setDirection(page, /^Set this month:/, 'Turn an idea into a tool');

  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.getByRole('button', { name: /^Set oct 11:/i })).toBeVisible();
  // Same week and month, so those carry; the day is blank and the old day is untouched.
  await expect(page.getByRole('button', { name: /This week: Finish the core daily workflow/ })).toBeVisible();
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.getByRole('button', { name: /Today: Ship the settings screen\. Edit/ })).toBeVisible();

  // Editing today's wording keeps the earlier one in history.
  await page.getByRole('button', { name: /Today: Ship the settings screen\. Edit/ }).click();
  const box = page.getByRole('textbox', { name: /Today:/ });
  await box.fill('Ship settings and the backup screen');
  await box.press('Enter');
  const dirs = await table(page, 'periodDirections');
  const day = dirs.find((d) => d.kind === 'day' && d.periodKey === '2026-10-10')!;
  expect(day.intention).toBe('Ship settings and the backup screen');
  expect(JSON.stringify(day.history)).toContain('Ship the settings screen');
  expect(dirs.filter((d) => d.kind === 'day')).toHaveLength(1);
  expect(dirs.find((d) => d.kind === 'week')).toMatchObject({ periodKey: '2026-10-05', intention: 'Finish the core daily workflow' });
  expect(dirs.find((d) => d.kind === 'month')).toMatchObject({ periodKey: '2026-10', intention: 'Turn an idea into a tool' });
});

test('#16 the calendar shows journal-only, task-only, future and completed days and opens each', async ({ page }) => {
  await startAt(page);
  await page.goto('/');
  await addTask(page, 'Ship the settings screen', 'Do');
  await page.getByRole('checkbox', { name: 'Complete: Ship the settings screen' }).click();
  await page.getByRole('button', { name: 'Previous day' }).click();
  await page.getByRole('button', { name: /What I learned/ }).first().click();
  await page.locator('.prose--editor').last().click();
  await page.keyboard.type('Only a journal on this day.');
  await expect(page.locator('.save--ok').first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Next day' }).click();
  await page.getByRole('button', { name: 'Next day' }).click();
  await page.getByRole('button', { name: 'Next day' }).click();
  await addTask(page, 'Call two clients', 'Do');

  await page.goto('/calendar');
  await expect(page.getByRole('button', { name: /October 9, 2026.*1 journal entry/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /October 10, 2026, today.*1 of 1 task done/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /October 12, 2026.*1 task planned/ })).toBeVisible();
  await page.getByRole('button', { name: /October 9, 2026/ }).click();
  await expect(page.getByRole('dialog').getByText('Only a journal on this day.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /October 12, 2026/ }).click();
  await expect(page.getByRole('dialog').getByText('Call two clients')).toBeVisible();
});
