import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import type { JournalEntry } from '../../domain/models';
import { docToMarkdown, entriesToMarkdown, entryBodyMarkdown, escapeInline, exportFileName } from './markdown';

const t = (text: string, ...marks: (string | { type: string; attrs: Record<string, unknown> })[]): JSONContent => ({
  type: 'text',
  text,
  ...(marks.length ? { marks: marks.map((m) => (typeof m === 'string' ? { type: m } : m)) } : {}),
});
const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content });
const li = (...content: JSONContent[]): JSONContent => ({ type: 'listItem', content });

describe('docToMarkdown', () => {
  it('separates paragraphs and headings with blank lines', () => {
    const d = doc({ type: 'heading', attrs: { level: 2 }, content: [t('Plan')] }, p(t('First.')), p(t('Second.')));
    expect(docToMarkdown(d)).toBe('## Plan\n\nFirst.\n\nSecond.');
    expect(docToMarkdown(d, { headingOffset: 2 })).toBe('#### Plan\n\nFirst.\n\nSecond.');
  });

  it('renders bold, italic, code and links, nesting marks across text nodes', () => {
    const d = doc(p(t('Plain '), t('bold ', 'bold'), t('both', 'bold', 'italic'), t(' and '), t('x()', 'code'), t(' see '), t('docs', { type: 'link', attrs: { href: 'https://example.com/a b' } })));
    expect(docToMarkdown(d)).toBe('Plain **bold *both*** and `x()` see [docs](https://example.com/a%20b)');
  });

  it('keeps whitespace outside emphasis delimiters', () => {
    expect(docToMarkdown(doc(p(t('a'), t(' b ', 'italic'), t('c'))))).toBe('a *b* c');
  });

  it('drops unsafe links but keeps their text', () => {
    expect(docToMarkdown(doc(p(t('click', { type: 'link', attrs: { href: 'javascript:alert(1)' } }))))).toBe('click');
  });

  it('renders bullet and ordered lists, including nested lists', () => {
    const d = doc(
      { type: 'bulletList', content: [li(p(t('One'))), li(p(t('Two')), { type: 'bulletList', content: [li(p(t('Inner')))] })] },
      { type: 'orderedList', attrs: { start: 3 }, content: [li(p(t('Third'))), li(p(t('Fourth')))] },
    );
    expect(docToMarkdown(d)).toBe('- One\n- Two\n  - Inner\n\n3. Third\n4. Fourth');
  });

  it('renders blockquotes, code blocks, rules and hard breaks', () => {
    const d = doc(
      { type: 'blockquote', content: [p(t('Quoted')), p(t('More'))] },
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [t('const a = 1;\nconst b = `x`;')] },
      { type: 'horizontalRule' },
      p(t('line one'), { type: 'hardBreak' }, t('line two')),
    );
    expect(docToMarkdown(d)).toBe('> Quoted\n>\n> More\n\n```ts\nconst a = 1;\nconst b = `x`;\n```\n\n---\n\nline one\\\nline two');
  });

  it('escapes text that would otherwise become Markdown', () => {
    expect(docToMarkdown(doc(p(t('# not a heading')), p(t('1. not a list')), p(t('use *stars* and [brackets]')), p(t('snake_case stays'))))).toBe(
      '\\# not a heading\n\n1\\. not a list\n\nuse \\*stars\\* and \\[brackets\\]\n\nsnake_case stays',
    );
    expect(escapeInline('_lead and trail_')).toBe('\\_lead and trail\\_');
  });

  it('returns an empty string for empty or missing documents', () => {
    expect(docToMarkdown(doc())).toBe('');
    expect(docToMarkdown(null)).toBe('');
    expect(docToMarkdown(doc(p()))).toBe('');
  });
});

describe('entryBodyMarkdown', () => {
  it('falls back to the plain text when the document is empty', () => {
    expect(entryBodyMarkdown({ doc: doc(), plainText: 'Only text\n\nTwo *parts*' })).toBe('Only text\n\nTwo \\*parts\\*');
    expect(entryBodyMarkdown({ doc: undefined as unknown as JSONContent, plainText: 'Kept' })).toBe('Kept');
  });
});

describe('entriesToMarkdown', () => {
  const base: Omit<JournalEntry, 'id' | 'dateKey' | 'happenedAt' | 'kind' | 'title' | 'doc' | 'plainText'> = {
    recordedTimezone: 'Asia/Kolkata', createdAt: '', updatedAt: '', taskIds: [], goalIds: [], tags: [], documentedAt: null, pinned: false, deletedAt: null, revision: 1,
  };

  it('writes day headings, entry headings, facts, text and links', () => {
    const entries: JournalEntry[] = [
      { ...base, id: 'a', dateKey: '2026-10-10', happenedAt: '2026-10-10T16:12:00.000Z', kind: 'learning', title: 'Hooks', doc: doc(p(t('useMemo is a cache.'))), plainText: 'useMemo is a cache.', documentedAt: '2026-10-10T16:30:00.000Z', taskIds: ['t1'], goalIds: ['g1'], tags: ['react'] },
      { ...base, id: 'b', dateKey: '2026-10-10', happenedAt: '2026-10-10T04:00:00.000Z', kind: 'doing', title: '', doc: doc(p(t('Shipped.'))), plainText: 'Shipped.', pinned: true },
      { ...base, id: 'c', dateKey: '2026-10-08', happenedAt: '2026-10-08T04:00:00.000Z', kind: 'reflection', title: '', doc: doc(), plainText: 'Calm.' },
    ];
    const md = entriesToMarkdown(entries, {
      timeZone: 'Asia/Kolkata',
      exportedOn: '2026-10-10',
      scope: 'All entries',
      taskTitle: (id) => (id === 't1' ? 'Read the docs' : undefined),
      goalTitle: (id) => (id === 'g1' ? 'Master React' : undefined),
    });
    expect(md).toBe(
      [
        '# Pursuit of Greatness journal',
        '',
        'Exported Oct 10, 2026 · 3 entries · All entries',
        '',
        '## Saturday, October 10, 2026',
        '',
        '### Hooks',
        '',
        '*What I learned · 9:42 PM · Documented*',
        '',
        'useMemo is a cache.',
        '',
        'Linked tasks: Read the docs  ',
        'Goals: Master React  ',
        'Tags: #react',
        '',
        '### What I did',
        '',
        '*What I did · 9:30 AM · Pinned*',
        '',
        'Shipped.',
        '',
        '## Thursday, October 8, 2026',
        '',
        '### Daily reflection',
        '',
        '*Daily reflection · 9:30 AM*',
        '',
        'Calm.',
        '',
      ].join('\n'),
    );
  });

  it('names the file by export date', () => {
    expect(exportFileName('2026-10-10')).toBe('pursuit-journal-2026-10-10.md');
  });
});
