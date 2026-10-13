import { describe, expect, it } from 'vitest';
import type { EarningEntry, Goal, GoalUpdate, Task } from '../../domain/models';
import type { GoalView } from '../visions/boardModel';
import { buildPdfData, changeText } from './pdfModel';
import { niceMax, pdfText, renderReportPdf } from './pdfReport';
import { buildReport } from './reportModel';

let n = 0;
const done = (d: string, category = 'doing') => ({ id: `t${n++}`, title: `Task ${n}`, status: 'completed', completionLocalDate: d, scheduledDate: d, category, deletedAt: null, seriesId: null }) as unknown as Task;
const earned = (d: string, amount: number) => ({ id: `e${n++}`, dateKey: d, amount, note: '', deletedAt: null }) as unknown as EarningEntry;
const update = (d: string, value: number, previous: number | null) => ({ id: `u${n++}`, goalId: 'g1', dateKey: d, at: `${d}T10:00:00Z`, kind: 'value', value, previous, note: '' }) as GoalUpdate;

describe('the PDF report', () => {
  const tasks = [done('2026-10-02', 'learning'), done('2026-10-03'), done('2026-10-03'), done('2026-09-10')];
  const source = { tasks, entries: [], updates: [], moves: [] };
  const report = buildReport(source, 'month', '2026-10-01', '2026-11-02', 'monday', 600);
  const goal = { id: 'g1', title: 'Save money', measurementMode: 'numeric', unit: '$', status: 'active' } as unknown as Goal;
  const view = {
    goal,
    plan: { title: '2026 finish challenge' },
    progress: { fraction: 0.3, summary: '$3,000 of $10,000' },
    pace: { state: 'on-pace', label: 'On pace', expectedFraction: 0.3 },
    updates: [update('2026-09-20', 1000, 0), update('2026-10-15', 3000, 1000)],
  } as unknown as GoalView;
  const data = buildPdfData({
    kind: 'month',
    report,
    name: 'Prem',
    today: '2026-11-02',
    tasks,
    entries: [],
    goals: [view],
    earnings: [earned('2026-10-05', 500), earned('2026-10-20', 1500), earned('2026-09-05', 1000)],
    content: [],
    focus: 'Ship it',
    review: '',
    blockers: '',
    nextFocus: '',
    coachText: '## Wins\n- Shipped',
  });

  it('compares the month with the one before, like a business report', () => {
    expect(data.periodLabel).toBe('October 2026');
    expect(data.prevLabel).toBe('September');
    expect(data.fileName).toBe('pursuit-month-report-2026-10.pdf');
    expect(data.kpis.find((k) => k.label === 'Tasks completed')).toMatchObject({ value: '3', trend: 'up', change: '+200% vs September' });
    expect(data.kpis.find((k) => k.label === 'Money earned')).toMatchObject({ value: '$2,000', change: '+100% (+$1,000) vs September' });
    expect(data.earnings).toMatchObject({ total: 2000, prevTotal: 1000, allTime: 3000, entries: 2 });
    expect(data.earnings.running.at(-1)).toBe(2000);
    expect(data.learning).toBe(1);
    expect(data.doing).toBe(2);
    expect(data.completedTasks).toHaveLength(3);
  });

  it('shows where each goal started and ended the month', () => {
    expect(data.goals[0]).toMatchObject({ start: '$1,000', end: '$3,000', change: '+$2,000', pace: 'On pace' });
  });

  it('writes a readable change line when there is nothing to compare', () => {
    expect(changeText(0, 0, 'September')).toEqual({ change: 'nothing to compare yet', trend: 'none' });
    expect(changeText(5, 0, 'September').trend).toBe('up');
    expect(niceMax(37)).toBe(50);
    expect(pdfText('Rise → “win” ₹500 🚀')).toBe('Rise -> "win" Rs 500 ');
  });

  it('makes a real PDF file', async () => {
    const blob = await renderReportPdf(data);
    const head = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5));
    expect(head).toBe('%PDF-');
    expect(blob.size).toBeGreaterThan(3000);
  });
});
