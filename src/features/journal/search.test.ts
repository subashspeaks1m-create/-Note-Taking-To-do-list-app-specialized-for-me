import { describe, expect, it } from 'vitest';
import type { JournalEntry, Task } from '../../domain/models';
import {
  activeFilterCount, buildSnippet, dateSpan, entryHeading, filterEntries, filtersToParams, groupByDay, hasAnyFilter, highlightParts, matchesTerms,
  NO_FILTERS, parseFilters, searchTerms, type TaskLookup,
} from './search';

let n = 0;
function entry(dateKey: string, p: Partial<JournalEntry> = {}): JournalEntry {
  n++;
  return {
    id: `e${n}`, dateKey, happenedAt: `${dateKey}T10:00:00.000Z`, recordedTimezone: 'Asia/Kolkata', createdAt: `${dateKey}T10:00:00.000Z`, updatedAt: '', kind: 'learning',
    title: '', doc: { type: 'doc', content: [] }, plainText: 'Some words', taskIds: [], goalIds: [], tags: [], documentedAt: null, pinned: false, deletedAt: null, revision: 1, ...p,
  };
}
const noTasks: TaskLookup = new Map();
const f = (p: Partial<typeof NO_FILTERS>) => ({ ...NO_FILTERS, ...p });

describe('URL filters', () => {
  it('round-trips through the query string and drops defaults', () => {
    const filters = f({ q: 'react hooks', view: 'learned', from: '2026-09-01', to: '2026-10-10', goal: 'g1', task: 't1', tag: 'deep work' });
    const params = filtersToParams(filters);
    expect(parseFilters(params)).toEqual(filters);
    expect(filtersToParams(NO_FILTERS).toString()).toBe('');
  });

  it('ignores malformed values', () => {
    const parsed = parseFilters(new URLSearchParams('view=bogus&from=2026-13-40&to=yesterday&goal=%20&tag='));
    expect(parsed).toEqual(NO_FILTERS);
  });

  it('counts filters separately from the view and search', () => {
    expect(activeFilterCount(f({ view: 'built', q: 'x' }))).toBe(0);
    expect(activeFilterCount(f({ from: '2026-01-01', tag: 'a' }))).toBe(2);
    expect(hasAnyFilter(f({ view: 'built' }))).toBe(false);
    expect(hasAnyFilter(f({ q: '  hi ' }))).toBe(true);
  });
});

describe('search', () => {
  it('splits into lower-case unique words', () => {
    expect(searchTerms('  React  react HOOKS ')).toEqual(['react', 'hooks']);
    expect(searchTerms('   ')).toEqual([]);
  });

  it('requires every word, case-insensitively, across title, text and tags', () => {
    const e = { title: 'Async patterns', plainText: 'Learned about Promise.all today', tags: ['javascript'] };
    expect(matchesTerms(e, ['promise.all', 'async'])).toBe(true);
    expect(matchesTerms(e, ['javascript', 'today'])).toBe(true);
    expect(matchesTerms(e, ['promise', 'rust'])).toBe(false);
    expect(matchesTerms(e, [])).toBe(true);
  });
});

describe('filterEntries', () => {
  const a = entry('2026-10-01', { kind: 'learning', plainText: 'Read about indexes', tags: ['db'] });
  const b = entry('2026-10-03', { kind: 'doing', plainText: 'Shipped the export', taskIds: ['t1'] });
  const c = entry('2026-10-03', { kind: 'reflection', plainText: 'A calm day', happenedAt: '2026-10-03T15:00:00.000Z', goalIds: ['g2'] });
  const deleted = entry('2026-10-04', { deletedAt: '2026-10-04T00:00:00.000Z' });
  const blank = entry('2026-10-05', { plainText: '  ' });
  const all = [a, b, c, deleted, blank];
  const tasks: TaskLookup = new Map([['t1', { id: 't1', goalIds: ['g1'], tags: ['work'] } as Pick<Task, 'id' | 'goalIds' | 'tags'>]]);

  it('returns written, undeleted entries newest first', () => {
    expect(filterEntries(all, NO_FILTERS, tasks).map((e) => e.id)).toEqual([c.id, b.id, a.id]);
  });

  it('filters by view', () => {
    expect(filterEntries(all, f({ view: 'learned' }), tasks)).toEqual([a]);
    expect(filterEntries(all, f({ view: 'built' }), tasks)).toEqual([b]);
    expect(filterEntries(all, f({ view: 'reflections' }), tasks)).toEqual([c]);
  });

  it('filters by an inclusive date range, even when reversed', () => {
    expect(filterEntries(all, f({ from: '2026-10-02' }), tasks)).toEqual([c, b]);
    expect(filterEntries(all, f({ to: '2026-10-01' }), tasks)).toEqual([a]);
    expect(filterEntries(all, f({ from: '2026-10-03', to: '2026-10-01' }), tasks)).toEqual([c, b, a]);
  });

  it('follows linked tasks to their goals and tags', () => {
    expect(filterEntries(all, f({ task: 't1' }), tasks)).toEqual([b]);
    expect(filterEntries(all, f({ goal: 'g1' }), tasks)).toEqual([b]);
    expect(filterEntries(all, f({ goal: 'g2' }), tasks)).toEqual([c]);
    expect(filterEntries(all, f({ tag: 'work' }), tasks)).toEqual([b]);
    expect(filterEntries(all, f({ tag: 'db' }), noTasks)).toEqual([a]);
  });

  it('combines search with other filters', () => {
    expect(filterEntries(all, f({ q: 'EXPORT shipped' }), tasks)).toEqual([b]);
    expect(filterEntries(all, f({ q: 'export', view: 'learned' }), tasks)).toEqual([]);
  });
});

describe('grouping', () => {
  it('groups consecutive days and reports the span', () => {
    const list = [entry('2026-10-03'), entry('2026-10-03'), entry('2026-09-30')];
    expect(groupByDay(list).map((g) => [g.dateKey, g.entries.length])).toEqual([
      ['2026-10-03', 2],
      ['2026-09-30', 1],
    ]);
    expect(dateSpan(list)).toEqual({ first: '2026-09-30', last: '2026-10-03' });
    expect(dateSpan([])).toBeNull();
  });
});

describe('entryHeading', () => {
  it('uses the title when there is one', () => {
    expect(entryHeading({ title: ' Hooks ', plainText: 'Body text' })).toEqual({ title: 'Hooks', body: 'Body text', derived: false });
  });

  it('borrows the first line of untitled entries and does not repeat it', () => {
    expect(entryHeading({ title: '', plainText: 'First line\nSecond line' })).toEqual({ title: 'First line', body: 'Second line', derived: true });
  });

  it('cuts a long first line at its first sentence', () => {
    const text = 'A focused day. The hardest part was saying no to a rabbit hole on CSS container queries.\nMore.';
    expect(entryHeading({ title: '', plainText: text })).toEqual({
      title: 'A focused day.',
      body: 'The hardest part was saying no to a rabbit hole on CSS container queries.\nMore.',
      derived: true,
    });
  });

  it('shortens a long first line and keeps the full body', () => {
    const long = 'word '.repeat(40).trim();
    const h = entryHeading({ title: '', plainText: long });
    expect(h.title.endsWith('…')).toBe(true);
    expect(h.title.length).toBeLessThanOrEqual(91);
    expect(h.body).toBe(long);
  });
});

describe('snippets', () => {
  it('marks every occurrence, keeping the original case', () => {
    expect(highlightParts('React and react', ['react'])).toEqual([
      { text: 'React', match: true },
      { text: ' and ', match: false },
      { text: 'react', match: true },
    ]);
    expect(highlightParts('a+b (c)', ['(c)'])).toEqual([
      { text: 'a+b ', match: false },
      { text: '(c)', match: true },
    ]);
  });

  it('keeps short text whole and collapses whitespace', () => {
    expect(buildSnippet('One\n\ntwo', [])).toEqual({ parts: [{ text: 'One two', match: false }], before: false, after: false });
  });

  it('starts long text at the beginning when not searching', () => {
    const text = `${'alpha '.repeat(60)}omega`;
    const s = buildSnippet(text, [], 100);
    expect(s.before).toBe(false);
    expect(s.after).toBe(true);
    expect(s.parts[0]!.text.startsWith('alpha')).toBe(true);
    expect(s.parts[0]!.text.length).toBeLessThanOrEqual(100);
  });

  it('centres on the first match with whole words on either side', () => {
    const text = `${'filler '.repeat(50)}the needle sits here ${'tail '.repeat(50)}`;
    const s = buildSnippet(text, ['needle'], 100);
    expect(s.before).toBe(true);
    expect(s.after).toBe(true);
    const joined = s.parts.map((p) => p.text).join('');
    expect(joined.startsWith('filler')).toBe(true);
    expect(joined.length).toBeLessThanOrEqual(100);
    expect(s.parts.filter((p) => p.match).map((p) => p.text)).toEqual(['needle']);
  });

  it('shows a match near the end of long text', () => {
    const text = `${'filler '.repeat(60)}needle`;
    const s = buildSnippet(text, ['needle'], 80);
    expect(s.after).toBe(false);
    expect(s.parts.at(-1)).toEqual({ text: 'needle', match: true });
  });
});
