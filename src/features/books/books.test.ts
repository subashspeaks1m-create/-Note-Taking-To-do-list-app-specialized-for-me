import { describe, expect, it } from 'vitest';
import type { BookRecord } from './db';
import { bookToMarkdown } from './markdown';
import { layoutMindMap, wrap } from './mindMapLayout';
import { actionKey, currentDay, dayDone, planStats, weekOfDay } from './planMath';
import { bookText } from './prompts';
import { MindMapSchema, Plan7Schema } from './schema';
import { looksScanned, paginate, stripRunningHeaders, tidyText, titleFromFileName } from './textCleanup';

const map = MindMapSchema.parse({
  center: 'Small habits compound',
  branches: [
    { label: 'Identity', note: 'Become the person', children: [{ label: 'Votes', note: 'Each action is a vote', children: [{ label: 'Two-minute rule' }] }] },
    { label: 'Cues', note: 'Make it obvious', children: [{ label: 'Stacking', note: 'After X, I will Y', children: [] }] },
    { label: 'Craving', note: 'Make it attractive', children: [] },
  ],
});

const plan = Plan7Schema.parse({
  goal: 'Ship daily',
  days: [1, 2, 3].map((day) => ({ day, theme: `Day ${day}`, why: 'x', reflection: 'r', actions: [{ text: 'a', minutes: 5, kind: 'do' }, { text: 'b', minutes: 10, kind: 'reflect' }] })),
});

describe('text cleanup', () => {
  it('strips repeated headers, footers and page numbers', () => {
    const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];
    const pages = words.map((w, i) => `ATOMIC HABITS\n${w} starts here\nthe ${w} middle\n${w} ends\nChapter ${i + 1} | ${i + 10}`);
    const out = stripRunningHeaders(pages);
    expect(out[0]).toBe('alpha starts here\nthe alpha middle\nalpha ends');
    expect(out.every((p) => !p.includes('ATOMIC'))).toBe(true);
  });

  it('keeps short documents untouched', () => {
    expect(stripRunningHeaders(['a\nb', 'a\nc'])).toEqual(['a\nb', 'a\nc']);
  });

  it('joins hyphenated line breaks and tidies whitespace', () => {
    expect(tidyText('a habit- \n  forming   loop\n\n\n\nnext')).toBe('a habitforming loop\n\nnext');
    expect(tidyText('self-\ncontrol')).toBe('selfcontrol');
  });

  it('paginates plain text by paragraphs', () => {
    const pages = paginate(Array.from({ length: 10 }, (_, i) => `Paragraph ${i} `.repeat(40)).join('\n\n'), 1000);
    expect(pages.length).toBeGreaterThan(3);
    expect(pages.join('')).toContain('Paragraph 9');
  });

  it('detects scanned books and derives titles', () => {
    expect(looksScanned(['', ' ', 'x'])).toBe(true);
    expect(looksScanned(['word '.repeat(100)])).toBe(false);
    expect(titleFromFileName('Deep_Work  by Cal.pdf')).toBe('Deep Work by Cal');
  });
});

describe('plan math', () => {
  const progress = { startDate: '2026-10-14', done: { [actionKey(1, 0)]: true as const, [actionKey(1, 1)]: true as const, [actionKey(2, 0)]: true as const }, notes: {} };
  it('maps dates to plan days', () => {
    expect(currentDay(progress, '2026-10-14')).toBe(1);
    expect(currentDay(progress, '2026-10-20')).toBe(7);
    expect(currentDay(progress, '2026-10-13')).toBe(0);
  });
  it('counts progress', () => {
    expect(dayDone(progress, plan.days[0]!)).toBe(true);
    expect(dayDone(progress, plan.days[1]!)).toBe(false);
    expect(planStats(progress, plan.days)).toEqual({ actionsDone: 3, actionsTotal: 6, daysDone: 1 });
  });
  it('puts days 29–30 in week 4', () => {
    expect([1, 7, 8, 28, 29, 30].map(weekOfDay)).toEqual([1, 1, 2, 4, 4, 4]);
  });
});

describe('mind map layout', () => {
  it('wraps labels by width', () => {
    expect(wrap('one two three four', 9)).toEqual(['one two', 'three', 'four']);
  });
  it('places every visible node without overlap on each side', () => {
    const layout = layoutMindMap(map, new Set());
    expect(layout.nodes).toHaveLength(1 + 3 + 2 + 1);
    expect(layout.links).toHaveLength(layout.nodes.length - 1);
    const sides = new Set(layout.nodes.filter((n) => n.depth === 1).map((n) => Math.sign(n.x)));
    expect(sides.size).toBe(2);
    for (const a of layout.nodes) {
      for (const b of layout.nodes) {
        if (a === b) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
  });
  it('hides children of collapsed nodes', () => {
    const layout = layoutMindMap(map, new Set(['b0']));
    expect(layout.nodes.find((n) => n.id === 'b0')?.collapsed).toBe(true);
    expect(layout.nodes.some((n) => n.id === 'b0.0')).toBe(false);
  });
});

const book: BookRecord = {
  id: 'x',
  title: 'Test "Book"',
  author: 'A. Writer',
  fileName: 't.pdf',
  mode: 'text',
  pageCount: 3,
  wordCount: 9,
  charCount: 30,
  addedAt: 0,
  updatedAt: 0,
  range: { from: 2, to: 3 },
  goal: 'Ship more',
  sections: {},
  results: { mindmap: map, plan7: plan },
  practice: { plan7: { startDate: '2026-10-14', done: { '1:0': true }, notes: {} } },
};

describe('prompt book text', () => {
  it('includes only the chosen range with page and chapter markers', () => {
    const text = bookText(book, { bookId: 'x', pages: ['one', 'two', 'three'], chapters: [{ title: 'Start', page: 3 }] });
    expect(text).not.toContain('[Page 1]');
    expect(text).toContain('[Page 2]\ntwo');
    expect(text).toContain('=== Chapter: Start ===\n[Page 3]');
    expect(text).toContain(`title="Test 'Book'"`);
  });
});

describe('markdown export', () => {
  it('exports mind map and plan with check state', () => {
    const md = bookToMarkdown(book);
    expect(md).toContain('# Test "Book"');
    expect(md).toContain('- **Identity**: Become the person');
    expect(md).toContain('- [x] a (5 min, do)');
    expect(md).toContain('- [ ] b (10 min, reflect)');
  });
});
