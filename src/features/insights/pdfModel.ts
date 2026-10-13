import { addDays, compareKeys, diffDays, formatShort, type DateKey } from '../../date/localDate';
import { formatAmount } from '../../domain/goals';
import type { ContentEntry, EarningEntry, JournalEntry, Task } from '../../domain/models';
import { periodKeyFor, type DateRange } from '../../domain/stats';
import type { GoalView } from '../visions/boardModel';
import type { Report, ReportKind } from './reportModel';

/**
 * Everything the PDF report shows, worked out from the records. Kept apart
 * from drawing so the numbers can be tested without a PDF library.
 */

export interface Kpi {
  label: string;
  value: string;
  /** e.g. "+34% vs September", or "first month" when there is nothing to compare. */
  change: string;
  trend: 'up' | 'down' | 'same' | 'none';
}

export interface GoalRow {
  title: string;
  plan: string;
  start: string;
  end: string;
  change: string;
  progress: string;
  pace: string;
}

export interface PdfReportData {
  kind: ReportKind;
  title: string;
  periodLabel: string;
  prevLabel: string;
  name: string;
  generatedOn: string;
  fileName: string;
  kpis: Kpi[];
  summary: string[];
  /** Cumulative points per day, this period and the one before. */
  growth: (number | null)[];
  prevGrowth: number[];
  dayLabels: string[];
  pointsPerDay: number[];
  learning: number;
  doing: number;
  earnings: {
    total: number;
    prevTotal: number;
    entries: number;
    biggest: { amount: number; date: string; note: string } | null;
    allTime: number;
    /** Running total by day inside the period. */
    running: number[];
    perActiveDay: number | null;
  };
  content: { posts: number; prevPosts: number; audienceStart: number | null; audienceEnd: number | null };
  goals: GoalRow[];
  habits: { missed: number; carriedOver: number; stillOpen: number };
  focus: string;
  review: string;
  blockers: string;
  nextFocus: string;
  completedTasks: string[];
  learned: string[];
  did: string[];
  coachText: string | null;
}

export interface PdfInput {
  kind: ReportKind;
  report: Report;
  name: string;
  today: DateKey;
  tasks: Task[];
  entries: JournalEntry[];
  goals: GoalView[];
  earnings: EarningEntry[];
  content: ContentEntry[];
  focus: string;
  review: string;
  blockers: string;
  nextFocus: string;
  coachText: string | null;
}

const within = (d: DateKey | null | undefined, r: DateRange) => !!d && compareKeys(d, r.start) >= 0 && compareKeys(d, r.end) <= 0;

const monthName = (key: DateKey) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function periodLabel(kind: ReportKind, r: DateRange): string {
  return kind === 'month' ? monthName(r.start) : `${formatShort(r.start)} to ${formatShort(r.end)}`;
}

/** "+34%", "-12%", or the plain difference when the old value was zero. */
export function changeText(now: number, before: number, prevLabel: string, money = false): Pick<Kpi, 'change' | 'trend'> {
  if (now === before) return { change: before === 0 ? 'nothing to compare yet' : `same as ${prevLabel}`, trend: before === 0 ? 'none' : 'same' };
  const trend = now > before ? 'up' : 'down';
  if (before === 0) return { change: `new this ${prevLabel === 'last week' ? 'week' : 'month'} (was 0)`, trend };
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  const diff = money ? `$${Math.abs(now - before).toLocaleString('en-US')}` : '';
  return { change: `${pct > 0 ? '+' : ''}${pct}%${diff ? ` (${now > before ? '+' : '-'}${diff})` : ''} vs ${prevLabel}`, trend };
}

const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const pctText = (f: number | null) => (f === null ? 'n/a' : `${Math.round(f * 100)}%`);

function goalValueAt(view: GoalView, day: DateKey): number | null {
  let value: number | null = null;
  let firstAfter: number | null = null;
  const updates = [...view.updates].filter((u) => u.value !== null).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.at.localeCompare(b.at));
  for (const u of updates) {
    if (compareKeys(u.dateKey, day) <= 0) value = u.value;
    else if (firstAfter === null) firstAfter = u.previous;
  }
  return value ?? firstAfter;
}

function goalRows(goals: GoalView[], range: DateRange, lastDay: DateKey): GoalRow[] {
  return goals.map((v) => {
    const g = v.goal;
    const fmt = (n: number | null) => {
      if (n === null) return '-';
      if (g.measurementMode === 'numeric') return formatAmount(n, g.unit);
      return `${Math.round(n)}%`;
    };
    const start = goalValueAt(v, addDays(range.start, -1));
    const end = goalValueAt(v, lastDay);
    let change = '-';
    if (end !== null && start !== null && end !== start) change = `${end > start ? '+' : '-'}${fmt(Math.abs(end - start)).replace(/^-/, '')}`;
    else if (end !== null && start === null) change = 'started';
    else if (end !== null) change = 'no change';
    return {
      title: g.title,
      plan: v.plan?.title ?? 'Standalone',
      start: fmt(start),
      end: fmt(end),
      change,
      progress: v.progress.fraction === null ? v.progress.summary || 'not measured' : `${pctText(v.progress.fraction)} · ${v.progress.summary}`,
      pace: g.status === 'achieved' ? 'Achieved' : v.pace.label,
    };
  });
}

export function buildPdfData(input: PdfInput): PdfReportData {
  const { kind, report, today } = input;
  const { range, previous, stats: s, prevStats: p } = report;
  const prevLabel = kind === 'month' ? monthName(previous.start).split(' ')[0]! : 'last week';
  const lastDay = compareKeys(today, range.end) < 0 ? today : range.end;
  const days = diffDays(range.start, range.end) + 1;

  const live = (e: { deletedAt: string | null }) => !e.deletedAt;
  const earnNow = input.earnings.filter((e) => live(e) && within(e.dateKey, range));
  const earnPrev = input.earnings.filter((e) => live(e) && within(e.dateKey, previous));
  const total = earnNow.reduce((n, e) => n + e.amount, 0);
  const prevTotal = earnPrev.reduce((n, e) => n + e.amount, 0);
  const biggestEntry = earnNow.reduce<EarningEntry | null>((b, e) => (!b || e.amount > b.amount ? e : b), null);
  const running: number[] = [];
  let run = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(range.start, i);
    run += earnNow.filter((e) => e.dateKey === d).reduce((n, e) => n + e.amount, 0);
    running.push(run);
  }
  const allTime = input.earnings.filter((e) => live(e) && compareKeys(e.dateKey, range.end) <= 0).reduce((n, e) => n + e.amount, 0);

  const contentNow = input.content.filter((c) => live(c) && within(c.dateKey, range));
  const contentPrev = input.content.filter((c) => live(c) && within(c.dateKey, previous));
  const audienceAt = (day: DateKey) =>
    [...input.content]
      .filter((c) => live(c) && c.audience !== null && compareKeys(c.dateKey, day) <= 0)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .at(-1)?.audience ?? null;

  const kpis: Kpi[] = [
    { label: 'Points earned', value: s.points.toLocaleString('en-US'), ...changeText(s.points, p.points, prevLabel) },
    { label: 'Tasks completed', value: String(s.completed), ...changeText(s.completed, p.completed, prevLabel) },
    {
      label: 'Completion rate',
      value: pctText(s.completionRate),
      change: s.scheduled ? `${s.scheduledDone} of ${s.scheduled} planned tasks` : 'no tasks were planned',
      trend: s.completionRate === null || p.completionRate === null ? 'none' : s.completionRate > p.completionRate ? 'up' : s.completionRate < p.completionRate ? 'down' : 'same',
    },
    { label: 'Active days', value: `${s.activeDays} of ${s.elapsedDays}`, ...changeText(s.activeDays, p.activeDays, prevLabel) },
    { label: 'Journal entries', value: String(s.entries), change: `${s.words.toLocaleString('en-US')} words written`, trend: s.entries > p.entries ? 'up' : s.entries < p.entries ? 'down' : 'none' },
    { label: 'Money earned', value: money(total), ...changeText(total, prevTotal, prevLabel, true) },
  ];

  const summary: string[] = [];
  const pts = changeText(s.points, p.points, prevLabel);
  summary.push(
    p.points
      ? `You earned ${s.points.toLocaleString('en-US')} points, ${pts.trend === 'up' ? 'up' : pts.trend === 'down' ? 'down' : 'level'} from ${p.points.toLocaleString('en-US')} in ${prevLabel} (${pts.change.split(' vs')[0]}).`
      : `You earned ${s.points.toLocaleString('en-US')} points. This is the first period with a record to compare against next time.`,
  );
  if (s.scheduled) summary.push(`You finished ${s.scheduledDone} of the ${s.scheduled} tasks you planned (${pctText(s.completionRate)})${p.completionRate !== null ? `, against ${pctText(p.completionRate)} in ${prevLabel}` : ''}.`);
  summary.push(`You were active on ${s.activeDays} of ${s.elapsedDays} days. Your streak stood at ${report.streakAtEnd} day${report.streakAtEnd === 1 ? '' : 's'}${report.bestStreakInPeriod ? `, with a best run of ${report.bestStreakInPeriod}` : ''}${report.streakBreaks ? ` and ${report.streakBreaks} break${report.streakBreaks === 1 ? '' : 's'}` : ' and no breaks'}.`);
  if (s.bestDay && s.bestDay.points > 0) summary.push(`Your best day was ${formatShort(s.bestDay.date)} with ${s.bestDay.points} points.`);
  if (total || prevTotal) summary.push(`You logged ${money(total)} earned${prevTotal ? `, against ${money(prevTotal)} in ${prevLabel}` : ''}. Total logged so far: ${money(allTime)}.`);
  if (s.completed) summary.push(`Split of finished tasks: ${s.completedLearning} learning and ${s.completedDoing} doing.`);
  if (s.missedHabits.length || s.carriedOver || s.stillOpen) summary.push(`Leaks to fix: ${s.missedHabits.length} missed habit day${s.missedHabits.length === 1 ? '' : 's'}, ${s.carriedOver} task${s.carriedOver === 1 ? '' : 's'} carried over, ${s.stillOpen} still open.`);

  const pointsPerDay: number[] = [];
  const dayLabels: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(range.start, i);
    pointsPerDay.push(compareKeys(d, lastDay) <= 0 ? (s.perDay.get(d)?.points ?? 0) : 0);
    dayLabels.push(kind === 'month' ? String(Number(d.slice(8))) : new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }));
  }

  const entryTitle = (e: JournalEntry) => (e.title.trim() || e.plainText.trim().slice(0, 90)).replace(/\s+/g, ' ');
  const inPeriod = input.entries.filter((e) => !e.deletedAt && e.plainText.trim() && within(e.dateKey, range));

  return {
    kind,
    title: kind === 'month' ? 'Monthly performance report' : 'Weekly performance report',
    periodLabel: periodLabel(kind, range),
    prevLabel,
    name: input.name,
    generatedOn: formatShort(today),
    fileName: `pursuit-${kind}-report-${periodKeyFor(kind, range)}.pdf`,
    kpis,
    summary,
    growth: report.growth,
    prevGrowth: report.prevGrowth,
    dayLabels,
    pointsPerDay,
    learning: s.completedLearning,
    doing: s.completedDoing,
    earnings: {
      total,
      prevTotal,
      entries: earnNow.length,
      biggest: biggestEntry ? { amount: biggestEntry.amount, date: formatShort(biggestEntry.dateKey), note: biggestEntry.note } : null,
      allTime,
      running,
      perActiveDay: s.activeDays ? Math.round(total / s.activeDays) : null,
    },
    content: {
      posts: contentNow.reduce((n, c) => n + c.posts, 0),
      prevPosts: contentPrev.reduce((n, c) => n + c.posts, 0),
      audienceStart: audienceAt(addDays(range.start, -1)),
      audienceEnd: audienceAt(lastDay),
    },
    goals: goalRows(input.goals, range, lastDay),
    habits: { missed: s.missedHabits.length, carriedOver: s.carriedOver, stillOpen: s.stillOpen },
    focus: input.focus,
    review: input.review,
    blockers: input.blockers,
    nextFocus: input.nextFocus,
    completedTasks: input.tasks
      .filter((t) => t.status === 'completed' && !t.deletedAt && within(t.completionLocalDate, range))
      .sort((a, b) => (a.completionLocalDate ?? '').localeCompare(b.completionLocalDate ?? ''))
      .map((t) => `${formatShort(t.completionLocalDate!)}  ${t.title}`),
    learned: inPeriod.filter((e) => e.kind === 'learning').map((e) => `${formatShort(e.dateKey)}  ${entryTitle(e)}`),
    did: inPeriod.filter((e) => e.kind === 'doing').map((e) => `${formatShort(e.dateKey)}  ${entryTitle(e)}`),
    coachText: input.coachText,
  };
}
