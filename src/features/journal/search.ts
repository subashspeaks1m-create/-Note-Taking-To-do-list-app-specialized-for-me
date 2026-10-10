/**
 * Journal feed logic: URL filters, local full-text matching, filtering,
 * day grouping and search snippets. Pure functions so they can be tested
 * without a database or a browser.
 */
import { isDateKey, type DateKey } from '../../date/localDate';
import type { EntryKind, ID, JournalEntry, Task } from '../../domain/models';

export type JournalView = 'all' | 'learned' | 'built' | 'reflections';

export const JOURNAL_VIEWS: readonly { view: JournalView; label: string; kind: EntryKind | null }[] = [
  { view: 'all', label: 'All entries', kind: null },
  { view: 'learned', label: 'Learned', kind: 'learning' },
  { view: 'built', label: 'Built / Did', kind: 'doing' },
  { view: 'reflections', label: 'Reflections', kind: 'reflection' },
];

export interface JournalFilters {
  q: string;
  view: JournalView;
  from: DateKey | null;
  to: DateKey | null;
  goal: ID | null;
  task: ID | null;
  tag: string | null;
}

export const NO_FILTERS: JournalFilters = { q: '', view: 'all', from: null, to: null, goal: null, task: null, tag: null };

const isView = (v: string | null): v is JournalView => JOURNAL_VIEWS.some((x) => x.view === v);
const nonEmpty = (v: string | null) => (v && v.trim() ? v.trim() : null);

/** Reads filters from `?q=&view=&from=&to=&goal=&task=&tag=`, ignoring anything malformed. */
export function parseFilters(params: URLSearchParams): JournalFilters {
  const view = params.get('view');
  const from = params.get('from');
  const to = params.get('to');
  return {
    q: params.get('q') ?? '',
    view: isView(view) ? view : 'all',
    from: from && isDateKey(from) ? from : null,
    to: to && isDateKey(to) ? to : null,
    goal: nonEmpty(params.get('goal')),
    task: nonEmpty(params.get('task')),
    tag: nonEmpty(params.get('tag')),
  };
}

/** The query string for a set of filters; defaults are left out so URLs stay short. */
export function filtersToParams(f: JournalFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q);
  if (f.view !== 'all') p.set('view', f.view);
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.goal) p.set('goal', f.goal);
  if (f.task) p.set('task', f.task);
  if (f.tag) p.set('tag', f.tag);
  return p;
}

/** Filters beyond the view tab and the search box. */
export function activeFilterCount(f: JournalFilters): number {
  return [f.from, f.to, f.goal, f.task, f.tag].filter(Boolean).length;
}

export function hasAnyFilter(f: JournalFilters): boolean {
  return activeFilterCount(f) > 0 || searchTerms(f.q).length > 0;
}

/** Lower-cased, de-duplicated search words. Every word must match. */
export function searchTerms(q: string): string[] {
  return [...new Set(q.toLowerCase().split(/\s+/).filter(Boolean))];
}

/** Linked tasks, so filters can follow an entry's task to its goals and tags. */
export type TaskLookup = Map<ID, Pick<Task, 'id' | 'goalIds' | 'tags'>>;

/** Goals an entry belongs to: linked directly, or through one of its linked tasks. */
export function entryGoalIds(entry: JournalEntry, tasks: TaskLookup): Set<ID> {
  const out = new Set(entry.goalIds);
  for (const id of entry.taskIds) for (const g of tasks.get(id)?.goalIds ?? []) out.add(g);
  return out;
}

/** The entry's own tags plus the tags of its linked tasks. */
export function entryTags(entry: JournalEntry, tasks: TaskLookup): string[] {
  const out = new Set(entry.tags);
  for (const id of entry.taskIds) for (const t of tasks.get(id)?.tags ?? []) out.add(t);
  return [...out];
}

/** Search covers the title, the written text and the entry's tags. */
export function matchesTerms(entry: Pick<JournalEntry, 'title' | 'plainText' | 'tags'>, terms: string[]): boolean {
  if (!terms.length) return true;
  const hay = `${entry.title}\n${entry.plainText}\n${entry.tags.join(' ')}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

/** An entry with no title and no text is an abandoned draft, not part of the record. */
export function isBlankEntry(entry: Pick<JournalEntry, 'title' | 'plainText'>): boolean {
  return !entry.title.trim() && !entry.plainText.trim();
}

export function compareNewestFirst(a: JournalEntry, b: JournalEntry): number {
  return b.dateKey.localeCompare(a.dateKey) || b.happenedAt.localeCompare(a.happenedAt) || b.createdAt.localeCompare(a.createdAt);
}

/** Entries matching every filter, newest first. Deleted and blank entries never appear. */
export function filterEntries(entries: JournalEntry[], f: JournalFilters, tasks: TaskLookup): JournalEntry[] {
  const kind = JOURNAL_VIEWS.find((v) => v.view === f.view)?.kind ?? null;
  const terms = searchTerms(f.q);
  // A reversed range still means "between these two days".
  const [from, to] = f.from && f.to && f.from > f.to ? [f.to, f.from] : [f.from, f.to];
  return entries
    .filter(
      (e) =>
        !e.deletedAt &&
        !isBlankEntry(e) &&
        (!kind || e.kind === kind) &&
        (!from || e.dateKey >= from) &&
        (!to || e.dateKey <= to) &&
        (!f.task || e.taskIds.includes(f.task)) &&
        (!f.goal || entryGoalIds(e, tasks).has(f.goal)) &&
        (!f.tag || entryTags(e, tasks).includes(f.tag)) &&
        matchesTerms(e, terms),
    )
    .sort(compareNewestFirst);
}

export interface DayGroup {
  dateKey: DateKey;
  entries: JournalEntry[];
}

/** Consecutive entries of the same day, keeping the incoming order. */
export function groupByDay(entries: JournalEntry[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.dateKey === e.dateKey) last.entries.push(e);
    else groups.push({ dateKey: e.dateKey, entries: [e] });
  }
  return groups;
}

/** Earliest and latest day among entries, or null when there are none. */
export function dateSpan(entries: Pick<JournalEntry, 'dateKey'>[]): { first: DateKey; last: DateKey } | null {
  if (!entries.length) return null;
  let first = entries[0]!.dateKey;
  let last = first;
  for (const e of entries) {
    if (e.dateKey < first) first = e.dateKey;
    if (e.dateKey > last) last = e.dateKey;
  }
  return { first, last };
}

/* ---------- Headings and snippets ---------- */

const MAX_DERIVED_TITLE = 90;

/**
 * What a card shows as its heading and body. Untitled entries borrow their
 * first line as the heading, and the body then starts after it so the card
 * doesn't repeat itself.
 */
export function entryHeading(entry: Pick<JournalEntry, 'title' | 'plainText'>): { title: string; body: string; derived: boolean } {
  const title = entry.title.trim();
  const text = entry.plainText.trim();
  if (title) return { title, body: text, derived: false };
  const nl = text.indexOf('\n');
  const first = (nl === -1 ? text : text.slice(0, nl)).trim();
  // A long opening line reads better as a heading when cut at its first sentence.
  const sentence = first.length > 60 ? /^.{12,90}?[.!?](?=\s)/.exec(first) : null;
  if (sentence) return { title: sentence[0], body: text.slice(sentence[0].length).trim(), derived: true };
  if (first.length <= MAX_DERIVED_TITLE) return { title: first, body: nl === -1 ? '' : text.slice(nl + 1).trim(), derived: true };
  const cut = first.lastIndexOf(' ', MAX_DERIVED_TITLE);
  return { title: `${first.slice(0, cut > 40 ? cut : MAX_DERIVED_TITLE).trimEnd()}…`, body: text, derived: true };
}

export interface TextPart {
  text: string;
  match: boolean;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function termPattern(terms: string[]): RegExp | null {
  if (!terms.length) return null;
  // Longest first so "learning" wins over "learn" at the same position.
  return new RegExp([...terms].sort((a, b) => b.length - a.length).map(escapeRe).join('|'), 'gi');
}

/** Splits text into plain and matched parts for `<mark>` highlighting. */
export function highlightParts(text: string, terms: string[]): TextPart[] {
  const re = termPattern(terms);
  if (!re || !text) return text ? [{ text, match: false }] : [];
  const parts: TextPart[] = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > at) parts.push({ text: text.slice(at, i), match: false });
    parts.push({ text: m[0], match: true });
    at = i + m[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), match: false });
  return parts;
}

export interface Snippet {
  parts: TextPart[];
  /** Text was cut before or after the snippet. */
  before: boolean;
  after: boolean;
}

/**
 * A short excerpt of the body. When searching, the excerpt is centred on the
 * first match so the reason an entry matched is visible; otherwise it is the
 * opening of the text. Cuts land on word boundaries.
 */
export function buildSnippet(body: string, terms: string[], maxLength = 220): Snippet {
  const text = body.replace(/\s+/g, ' ').trim();
  if (!text) return { parts: [], before: false, after: false };
  if (text.length <= maxLength) return { parts: highlightParts(text, terms), before: false, after: false };

  const re = termPattern(terms);
  const hit = re ? re.exec(text) : null;
  let start = 0;
  if (hit) {
    const lead = Math.floor(maxLength * 0.35);
    start = Math.max(0, Math.min(hit.index - lead, text.length - maxLength));
    if (start > 0) {
      const space = text.indexOf(' ', start);
      // Snap forward to a word start, but never past the match itself.
      start = space !== -1 && space < hit.index ? space + 1 : start;
    }
  }
  let end = Math.min(text.length, start + maxLength);
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space > start + maxLength * 0.6) end = space;
  }
  const slice = text.slice(start, end).trim();
  return { parts: highlightParts(slice, terms), before: start > 0, after: end < text.length };
}
