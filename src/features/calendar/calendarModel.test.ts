import { describe, expect, it } from 'vitest';
import { buildDays, describeDay, entryTitle, monthWeeks, moveAnchor, snippet, weekDays, type CalendarEntry, type CalendarTask } from './calendarModel';

const TODAY = '2026-10-10';

let n = 0;
function task(over: Partial<CalendarTask>): CalendarTask {
  n += 1;
  return {
    id: `t${n}`,
    title: `Task ${n}`,
    category: 'learning',
    status: 'todo',
    scheduledDate: TODAY,
    completionLocalDate: null,
    completedAt: null,
    seriesId: null,
    rank: n,
    deletedAt: null,
    ...over,
  };
}

function entry(over: Partial<CalendarEntry>): CalendarEntry {
  n += 1;
  return {
    id: `e${n}`,
    dateKey: TODAY,
    kind: 'reflection',
    title: '',
    plainText: 'Something happened.',
    happenedAt: `${over.dateKey ?? TODAY}T10:00:00Z`,
    createdAt: `${over.dateKey ?? TODAY}T10:00:00Z`,
    deletedAt: null,
    ...over,
  };
}

const done = (date: string) => ({ status: 'completed' as const, completionLocalDate: date, completedAt: `${date}T12:00:00Z` });

describe('calendar grid', () => {
  it('lays out a month from the configured week start', () => {
    const mon = monthWeeks('2026-10-10', 'monday');
    expect(mon[0]![0]).toBe('2026-09-28');
    expect(mon.at(-1)![6]).toBe('2026-11-01');
    const sun = monthWeeks('2026-10-10', 'sunday');
    expect(sun[0]![0]).toBe('2026-09-27');
    expect(sun.at(-1)![6]).toBe('2026-10-31');
  });

  it('builds a week and steps by month or week', () => {
    expect(weekDays('2026-10-10', 'monday')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    expect(weekDays('2026-10-10', 'sunday')[0]).toBe('2026-10-04');
    expect(moveAnchor('2026-01-31', 'month', 1)).toBe('2026-02-01');
    expect(moveAnchor('2026-01-15', 'month', -1)).toBe('2025-12-01');
    expect(moveAnchor('2026-10-10', 'week', -1)).toBe('2026-10-03');
  });
});

describe('buildDays', () => {
  const dates = ['2026-10-08', '2026-10-09', TODAY, '2026-10-11', '2026-10-12'];

  it('separates planned from completed and counts categories', () => {
    const days = buildDays({
      dates,
      today: TODAY,
      tasks: [
        task({ ...done(TODAY), category: 'learning' }),
        task({ ...done(TODAY), category: 'doing' }),
        task({ category: 'doing' }),
        task({ status: 'canceled', category: 'doing' }),
      ],
      entries: [],
      directions: [],
    });
    const d = days.get(TODAY)!;
    expect(d.scheduled).toHaveLength(4);
    expect(d).toMatchObject({ planned: 3, done: 2, overdue: 0, relation: 'today' });
    expect(d.byCategory).toEqual({ learning: { done: 1, total: 1 }, doing: { done: 1, total: 2 } });
  });

  it('includes days with only a journal and days with only tasks', () => {
    const days = buildDays({
      dates,
      today: TODAY,
      tasks: [task({ scheduledDate: '2026-10-09', ...done('2026-10-09') })],
      entries: [entry({ dateKey: '2026-10-08', title: 'Read the paper' }), entry({ dateKey: '2026-10-08', title: '', plainText: '  ' })],
      directions: [],
    });
    expect(days.get('2026-10-08')).toMatchObject({ planned: 0, entries: [{ title: 'Read the paper' }] });
    expect(days.get('2026-10-09')).toMatchObject({ planned: 1, done: 1, entries: [] });
  });

  it('marks open one-off tasks on past days overdue, but never missed habit days', () => {
    const days = buildDays({
      dates,
      today: TODAY,
      tasks: [task({ scheduledDate: '2026-10-08' }), task({ scheduledDate: '2026-10-08', seriesId: 's1' }), task({ scheduledDate: '2026-10-12', seriesId: 's1' })],
      entries: [],
      directions: [],
    });
    expect(days.get('2026-10-08')).toMatchObject({ overdue: 1, missedRepeats: 1, planned: 2 });
    expect(days.get('2026-10-12')).toMatchObject({ overdue: 0, planned: 1, relation: 'future' });
    expect(describeDay(days.get('2026-10-12'))).toBe('1 task planned');
  });

  it('lists tasks finished on a day that were scheduled elsewhere, once', () => {
    const late = task({ scheduledDate: '2026-10-08', ...done(TODAY) });
    const days = buildDays({ dates, today: TODAY, tasks: [late, late, task({ scheduledDate: null, ...done(TODAY) })], entries: [], directions: [] });
    expect(days.get('2026-10-08')).toMatchObject({ planned: 1, done: 1, overdue: 0 });
    expect(days.get(TODAY)!.completedElsewhere.map((t) => t.scheduledDate)).toEqual(['2026-10-08', null]);
    expect(days.get(TODAY)!.planned).toBe(0);
  });

  it('ignores deleted records and picks up day intentions only', () => {
    const days = buildDays({
      dates,
      today: TODAY,
      tasks: [task({ deletedAt: '2026-10-10T00:00:00Z' })],
      entries: [entry({ deletedAt: '2026-10-10T00:00:00Z' })],
      directions: [
        { kind: 'day', periodKey: '2026-10-11', intention: ' Ship the calendar ', desiredOutcome: '' },
        { kind: 'week', periodKey: '2026-10-11', intention: 'Not a day', desiredOutcome: '' },
      ],
    });
    expect(days.get(TODAY)).toMatchObject({ planned: 0, entries: [] });
    expect(days.get('2026-10-11')!.intention).toBe('Ship the calendar');
    expect(describeDay(days.get(TODAY))).toBe('Nothing yet');
  });
});

describe('entry text', () => {
  it('shortens long text on a word boundary and falls back for untitled entries', () => {
    expect(snippet('one  two\nthree')).toBe('one two three');
    expect(snippet('alpha beta gamma delta', 12)).toBe('alpha beta…');
    expect(entryTitle({ title: '', plainText: '' })).toBe('Untitled entry');
    expect(entryTitle({ title: '  Notes ', plainText: 'x' })).toBe('Notes');
  });
});
