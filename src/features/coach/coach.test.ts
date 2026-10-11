import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JournalEntry, Task } from '../../domain/models';
import { periodStats } from '../../domain/stats';
import { JOURNAL_BUDGET, coachContext, coachMessages, parseCoach, type CoachInput } from './coachPrompt';
import { AUTO_MODEL, askCoach, coachKey, isFreeModel, maskKey } from './openrouter';

let n = 0;
function task(p: Partial<Task>): Task {
  return {
    id: `t${n++}`, seriesId: null, occurrenceDate: null, scheduledDate: null, originalScheduledDate: null, title: 'T', details: '', category: 'doing', priority: 0, effort: 'standard',
    dueTime: null, estimatedMinutes: null, tags: [], goalIds: [], status: 'todo', rank: 0, createdAt: '', updatedAt: '', completedAt: null, completionLocalDate: null,
    completionTimezone: null, award: null, deletedAt: null, revision: 1, ...p,
  } as Task;
}
function entry(d: string, p: Partial<JournalEntry> = {}): JournalEntry {
  return { id: `e${n++}`, dateKey: d, kind: 'learning', plainText: 'Learned a thing', documentedAt: null, deletedAt: null, taskIds: [], goalIds: [], tags: [], pinned: false, title: '', ...p } as unknown as JournalEntry;
}

const range = { start: '2026-10-05', end: '2026-10-11' };
function input(tasks: Task[], entries: JournalEntry[]): CoachInput {
  const src = { tasks, entries, updates: [], moves: [] };
  return {
    name: 'Subash', kind: 'week', range,
    stats: periodStats(src, range, '2026-10-11'), prevStats: periodStats(src, { start: '2026-09-28', end: '2026-10-04' }, '2026-10-11'),
    streakAtEnd: 3, streakBreaks: 1, tasks, entries,
    goals: [{ title: 'Earn $100K', progress: '25% ($25,000 of $100,000)', pace: 'Behind' }],
    principles: ['Ship daily'], focus: 'Finish the settings screen', review: 'Good week', blockers: 'Late nights',
  };
}

describe('coach prompt', () => {
  it('includes the period record and nothing outside it', () => {
    const tasks = [
      task({ title: 'Ship the settings screen', status: 'completed', completionLocalDate: '2026-10-08', scheduledDate: '2026-10-08' }),
      task({ title: 'Old task', status: 'completed', completionLocalDate: '2026-09-20', scheduledDate: '2026-09-20' }),
      task({ title: 'Read one chapter', category: 'learning', scheduledDate: '2026-10-10' }),
      task({ title: 'Deleted one', status: 'completed', completionLocalDate: '2026-10-08', deletedAt: '2026-10-09T00:00:00Z' }),
    ];
    const entries = [entry('2026-10-09', { plainText: 'Learned how IndexedDB transactions work.' }), entry('2026-09-30', { plainText: 'Last week text' })];
    const ctx = coachContext(input(tasks, entries));
    expect(ctx).toContain('Ship the settings screen');
    expect(ctx).toContain('Planned but not done:\n- [learning] Read one chapter');
    expect(ctx).toContain('IndexedDB transactions');
    expect(ctx).toContain('Earn $100K: 25% ($25,000 of $100,000); Behind');
    expect(ctx).toContain('1. Ship daily');
    expect(ctx).toContain('Planned focus: "Finish the settings screen"');
    expect(ctx).not.toContain('Old task');
    expect(ctx).not.toContain('Last week text');
    expect(ctx).not.toContain('Deleted one');
  });

  it('keeps journal text within the budget and says how many entries were left out', () => {
    const long = 'x'.repeat(5000);
    const entries = Array.from({ length: 20 }, () => entry('2026-10-07', { plainText: long }));
    const ctx = coachContext(input([], entries));
    const journal = ctx.slice(ctx.indexOf('Journal'));
    expect(journal.length).toBeLessThan(JOURNAL_BUDGET + 2000);
    expect(ctx).toMatch(/\(\d+ more entries not included for length\.\)/);
  });

  it('asks for monthly sections on a monthly report', () => {
    const m = coachMessages({ ...input([], []), kind: 'month' });
    expect(m[0]!.content).toContain('## The month in one line');
    expect(m[0]!.content).toContain('next month');
    expect(m[1]!.content.startsWith('Name: Subash')).toBe(true);
  });

  it('parses headings, bullets and numbered moves as plain text', () => {
    expect(parseCoach('## What went well\n- **Shipped** settings\n\n1. Sleep by 11\n<b>x</b>')).toEqual([
      { type: 'heading', text: 'What went well' },
      { type: 'item', text: 'Shipped settings' },
      { type: 'item', text: 'Sleep by 11', n: 1 },
      { type: 'para', text: '<b>x</b>' },
    ]);
  });
});

describe('openrouter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    coachKey.clear();
  });

  const ok = (text: string) => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });
  const fail = (status: number) => new Response(JSON.stringify({ error: { message: 'nope' } }), { status });

  it('only ever calls free models', async () => {
    expect(isFreeModel('meta-llama/llama-3.3-70b-instruct:free')).toBe(true);
    expect(isFreeModel('openai/gpt-4o')).toBe(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(askCoach('sk-or-x', 'openai/gpt-4o', [])).rejects.toThrow('Only free models');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('moves on to the next free model when one is busy, and sends the key only to OpenRouter', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(ok('## Notes'));
    vi.stubGlobal('fetch', fetchMock);
    const r = await askCoach('sk-or-secret', AUTO_MODEL, [{ role: 'user', content: 'hi' }]);
    expect(r.text).toBe('## Notes');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(JSON.parse((init as RequestInit).body as string).model).toMatch(/:free$/);
      expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer sk-or-secret' });
    }
  });

  it('asks OpenRouter for its current free models when the preferred ones are retired', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'new/model:free' }, { id: 'paid/model' }] }), { status: 200 });
      return JSON.parse(init!.body as string).model === 'new/model:free' ? ok('fresh') : fail(404);
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await askCoach('sk-or-x', AUTO_MODEL, [])).toEqual({ model: 'new/model:free', text: 'fresh' });
    expect(fetchMock.mock.calls.some(([u, i]) => !String(u).endsWith('/models') && JSON.parse((i as RequestInit).body as string).model === 'paid/model')).toBe(false);
  });

  it('stops at once on a rejected key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(401));
    vi.stubGlobal('fetch', fetchMock);
    await expect(askCoach('sk-or-bad', AUTO_MODEL, [])).rejects.toThrow('did not accept the key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the key in this browser only and masks it for display', () => {
    coachKey.set('  sk-or-v1-abcdef1234567890  ');
    expect(coachKey.get()).toBe('sk-or-v1-abcdef1234567890');
    expect(maskKey(coachKey.get())).toBe('sk-or-…7890');
    coachKey.clear();
    expect(coachKey.get()).toBe('');
  });
});
