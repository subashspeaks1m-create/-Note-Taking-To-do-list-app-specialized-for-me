import { compareKeys, type DateKey } from '../../date/localDate';
import type { JournalEntry, Task } from '../../domain/models';
import type { DateRange, PeriodStats } from '../../domain/stats';
import type { ChatMessage } from './openrouter';

/** Journal text sent to the model, in characters. Free models have small windows. */
export const JOURNAL_BUDGET = 12_000;
const PER_ENTRY = 1_500;

export interface CoachGoal {
  title: string;
  progress: string;
  pace: string;
}

export interface CoachInput {
  name: string;
  kind: 'week' | 'month';
  range: DateRange;
  stats: PeriodStats;
  prevStats: PeriodStats;
  streakAtEnd: number;
  streakBreaks: number;
  tasks: Task[];
  entries: JournalEntry[];
  goals: CoachGoal[];
  principles: string[];
  focus: string;
  review: string;
  blockers: string;
}

const within = (d: DateKey | null | undefined, r: DateRange) => !!d && compareKeys(d, r.start) >= 0 && compareKeys(d, r.end) <= 0;

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Everything the coach reads, as plain text. Prem chose that it may read all of it, journal text included. */
export function coachContext(input: CoachInput): string {
  const { stats: s, prevStats: p, range } = input;
  const lines: string[] = [];
  const pct = (v: number | null) => (v === null ? 'n/a' : `${Math.round(v * 100)}%`);
  lines.push(`Period: ${input.kind} ${range.start} to ${range.end} (${s.elapsedDays} of ${s.totalDays} days elapsed).`);
  lines.push(
    `Numbers (previous ${input.kind} in brackets): tasks completed ${s.completed} [${p.completed}] (learning ${s.completedLearning}, doing ${s.completedDoing}); ` +
      `completion rate ${pct(s.completionRate)} [${pct(p.completionRate)}]; active days ${s.activeDays} [${p.activeDays}]; journal entries ${s.entries} [${p.entries}], ${s.words} words; ` +
      `points ${s.points} [${p.points}]; carried-over tasks ${s.carriedOver}; still open ${s.stillOpen}; missed habit days ${s.missedHabits.length}; ` +
      `streak at end ${input.streakAtEnd} days, streak breaks ${input.streakBreaks}.`,
  );
  if (s.bestDay) lines.push(`Best day: ${s.bestDay.date} (${s.bestDay.points} points).`);
  if (input.focus.trim()) lines.push(`Planned focus: "${clip(input.focus, 280)}"`);
  if (input.review.trim()) lines.push(`Own review: "${clip(input.review, 800)}"`);
  if (input.blockers.trim()) lines.push(`What got in the way (own words): "${clip(input.blockers, 600)}"`);
  if (input.principles.length) lines.push(`Principles, most important first: ${input.principles.slice(0, 8).map((t, i) => `${i + 1}. ${clip(t, 140)}`).join(' ')}`);
  if (input.goals.length) {
    lines.push('Goals:');
    for (const g of input.goals.slice(0, 12)) lines.push(`- ${clip(g.title, 120)}: ${g.progress}; ${g.pace}`);
  }

  const done = input.tasks.filter((t) => t.status === 'completed' && within(t.completionLocalDate, range) && !t.deletedAt);
  const open = input.tasks.filter((t) => (t.status === 'todo' || t.status === 'in-progress') && within(t.scheduledDate, range) && !t.deletedAt);
  if (done.length) {
    lines.push('Completed tasks:');
    for (const t of done.slice(0, 60)) lines.push(`- [${t.category}] ${clip(t.title, 120)} (${t.completionLocalDate})`);
  }
  if (open.length) {
    lines.push('Planned but not done:');
    for (const t of open.slice(0, 30)) lines.push(`- [${t.category}] ${clip(t.title, 120)} (${t.scheduledDate})`);
  }

  const entries = input.entries
    .filter((e) => !e.deletedAt && e.plainText.trim() && within(e.dateKey, range))
    .sort((a, b) => compareKeys(a.dateKey, b.dateKey));
  if (entries.length) {
    lines.push('Journal (own words):');
    let budget = JOURNAL_BUDGET;
    let skipped = 0;
    for (const e of entries) {
      if (budget <= 0) {
        skipped++;
        continue;
      }
      const text = clip(e.plainText, Math.min(PER_ENTRY, budget));
      budget -= text.length;
      lines.push(`- ${e.dateKey} ${e.kind}${e.title ? ` "${clip(e.title, 80)}"` : ''}: ${text}`);
    }
    if (skipped) lines.push(`(${skipped} more entries not included for length.)`);
  }
  return lines.join('\n');
}

export const COACH_SYSTEM = `You are a direct, warm performance coach for one person building a serious life. You read their real record for one period: numbers, tasks, journal entries, goals and principles.

Rules:
- Use only what is in the record. Never invent events, numbers or feelings. If the record is thin, say so plainly and keep it short.
- Quote or name concrete things from the record (a task title, a journal line, a date) so every point is checkable.
- Be honest about what slipped, without shaming. Tie advice to their own stated focus, goals and principles.
- Plain English, short sentences, no filler, no emojis.

Answer in exactly these sections, each starting with "## ":
## The week in one line
## What went well
## What slipped
## A pattern I noticed
## Three moves for next week
Use "- " bullets inside sections. The last section has exactly three numbered moves, each one small and specific. Under 350 words in total.`;

export function coachMessages(input: CoachInput): ChatMessage[] {
  const system = input.kind === 'month' ? COACH_SYSTEM.replace('## The week in one line', '## The month in one line').replace('next week', 'next month') : COACH_SYSTEM;
  return [
    { role: 'system', content: system },
    { role: 'user', content: `Name: ${input.name}\n\n${coachContext(input)}` },
  ];
}

export type CoachBlock = { type: 'heading'; text: string } | { type: 'item'; text: string; n?: number } | { type: 'para'; text: string };

/** Turns the model's answer into safe blocks to render: no HTML is ever injected. */
export function parseCoach(text: string): CoachBlock[] {
  const out: CoachBlock[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/\*\*(.+?)\*\*/g, '$1');
    if (!line) continue;
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    if (h) {
      out.push({ type: 'heading', text: h[1]! });
      continue;
    }
    const num = /^(\d+)[.)]\s+(.*)$/.exec(line);
    if (num) {
      out.push({ type: 'item', text: num[2]!, n: Number(num[1]) });
      continue;
    }
    const b = /^[-*•]\s+(.*)$/.exec(line);
    if (b) {
      out.push({ type: 'item', text: b[1]! });
      continue;
    }
    out.push({ type: 'para', text: line });
  }
  return out;
}
