import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { EmptyState, PageHeader } from '../../components/Page';
import { useToast } from '../../components/Toasts';
import { useTodayKey } from '../../date/clock';
import { formatLong, formatMedium, formatShort, formatTimeInZone, type DateKey } from '../../date/localDate';
import type { ID, JournalEntry, Task } from '../../domain/models';
import { useProfile } from '../../storage/StorageProvider';
import { useJournalData, type JournalData } from './journalQueries';
import { downloadText, goalGroups, KindChip, Marked, readingHref, SnippetText, useJournalFilters } from './journalParts';
import { entriesToMarkdown, exportFileName } from './markdown';
import {
  activeFilterCount, buildSnippet, dateSpan, entryGoalIds, entryHeading, entryTags, filterEntries, groupByDay, hasAnyFilter, highlightParts,
  isBlankEntry, JOURNAL_VIEWS, searchTerms, type JournalFilters,
} from './search';

const PAGE_SIZE = 40;

const VIEW_TONE: Record<JournalFilters['view'], string> = { all: '', learned: 'learning', built: 'doing', reflections: 'gold' };

export function JournalPage() {
  const data = useJournalData();
  const profile = useProfile();
  const today = useTodayKey(profile.timeZone);
  const toast = useToast();
  const { filters, search, update, clear } = useJournalFilters();
  const [filtersOpen, setFiltersOpen] = useState(() => activeFilterCount(filters) > 0);
  const commitQuery = useCallback((q: string) => update({ q }), [update]);

  const terms = useMemo(() => searchTerms(filters.q), [filters.q]);
  const results = useMemo(() => (data ? filterEntries(data.entries, filters, data.tasks) : []), [data, filters]);
  const pinned = useMemo(() => results.filter((e) => e.pinned), [results]);
  const written = useMemo(() => (data ? data.entries.filter((e) => !isBlankEntry(e)).length : 0), [data]);

  if (!data) {
    return (
      <div className="page page--journal">
        <PageHeader overline="Your written record" title="Journal" art="scroll" artMotion="wiggle" />
        <div className="skeleton-list" aria-hidden="true">
          <span />
          <span />
        </div>
      </div>
    );
  }

  const goalTitle = (id: ID) => data.goals.find((g) => g.id === id)?.title;
  const taskTitle = (id: ID) => data.tasks.get(id)?.title;
  const exportMarkdown = () => {
    const md = entriesToMarkdown(results, { timeZone: profile.timeZone, exportedOn: today, scope: describeScope(filters, data), taskTitle, goalTitle });
    downloadText(md, exportFileName(today));
    toast({ message: `Exported ${results.length} ${results.length === 1 ? 'entry' : 'entries'} as Markdown`, tone: 'success' });
  };
  const filterCount = activeFilterCount(filters);
  const view = JOURNAL_VIEWS.find((v) => v.view === filters.view)!;

  return (
    <div className="page page--journal">
      <PageHeader overline="Your written record" title="Journal" art="scroll" artMotion="wiggle">
        {written > 0 && (
          <button type="button" className="btn btn--quiet" onClick={exportMarkdown} disabled={!results.length}>
            <Icon name="journal" size={16} /> Export Markdown
            <span className="visually-hidden"> of the {results.length} entries shown</span>
          </button>
        )}
      </PageHeader>

      {written === 0 ? (
        <EmptyState icon="journal" title="Your journal is empty." body="Entries you write on Today appear here as a chronological feed you can search, filter and export.">
          <Link to="/" className="btn btn--primary">
            <Icon name="pen" size={16} /> Write on Today
          </Link>
        </EmptyState>
      ) : (
        <>
          <div className="journal-tools">
            <SearchBox value={filters.q} onCommit={commitQuery} />
            <div className="journal-tools__row">
              <div className="segmented" role="group" aria-label="Journal view">
                {JOURNAL_VIEWS.map((v) => (
                  <button
                    key={v.view}
                    type="button"
                    className={`segmented__btn ${VIEW_TONE[v.view] ? `segmented__btn--${VIEW_TONE[v.view]}` : ''}`}
                    aria-pressed={filters.view === v.view}
                    onClick={() => update({ view: v.view })}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn--quiet journal-filters__toggle"
                aria-expanded={filtersOpen}
                aria-controls="journal-filters"
                onClick={() => setFiltersOpen((o) => !o)}
              >
                Filters{filterCount > 0 && <span className="journal-filters__count tabular">{filterCount}</span>}
                <Icon name={filtersOpen ? 'chevronUp' : 'chevronDown'} size={16} />
              </button>
            </div>
            <Filters id="journal-filters" open={filtersOpen} filters={filters} data={data} onChange={update} onClear={() => clear(true)} />
          </div>

          {(view.view === 'learned' || view.view === 'built') && (
            <p className="journal-evidence">
              <Icon name={view.view === 'learned' ? 'learning' : 'doing'} size={16} />
              <span>
                {view.view === 'learned' ? 'Learning evidence: what you wrote about what you learned.' : 'Doing evidence: what you wrote about what you built or did.'} A written record shows the
                work; it does not certify mastery.
              </span>
            </p>
          )}

          <ResultSummary results={results} filters={filters} />

          {results.length === 0 ? (
            <div className="journal-noresults">
              <EmptyState icon="search" title="No entries match." body={noResultsBody(filters)}>
                <div className="journal-noresults__actions">
                  {hasAnyFilter(filters) && (
                    <button type="button" className="btn btn--primary" onClick={() => clear(true)}>
                      Clear filters
                    </button>
                  )}
                  {filters.view !== 'all' && (
                    <button type="button" className="btn btn--quiet" onClick={() => update({ view: 'all' })}>
                      Show all entries
                    </button>
                  )}
                </div>
              </EmptyState>
            </div>
          ) : (
            <>
              {pinned.length > 0 && <PinnedStrip entries={pinned} terms={terms} search={search} />}
              <Feed key={search} entries={results} terms={terms} search={search} data={data} timeZone={profile.timeZone} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Typing filters locally; the URL (and the feed) follow after a short pause. */
function SearchBox({ value, onCommit }: { value: string; onCommit: (q: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  const [pushed, setPushed] = useState(value);
  // Follow outside changes (Clear filters, back/forward) without undoing our own pending typing.
  if (value !== seen) {
    setSeen(value);
    if (value !== pushed) setDraft(value);
  }
  useEffect(() => {
    if (draft === value) return;
    const t = window.setTimeout(() => {
      setPushed(draft);
      onCommit(draft);
    }, 150);
    return () => window.clearTimeout(t);
  }, [draft, value, onCommit]);

  return (
    <div className="journal-search">
      <label className="search">
        <Icon name="search" size={18} />
        <span className="visually-hidden">Search your journal</span>
        <input
          type="search"
          placeholder="Search titles, text and tags"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && draft) {
              e.preventDefault();
              setDraft('');
            }
          }}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
    </div>
  );
}

function Filters({
  id, open, filters, data, onChange, onClear,
}: { id: string; open: boolean; filters: JournalFilters; data: JournalData; onChange: (patch: Partial<JournalFilters>) => void; onClear: () => void }) {
  const tasks = useMemo(() => linkedTasks(data), [data]);
  const tags = useMemo(() => [...new Set(data.entries.flatMap((e) => entryTags(e, data.tasks)))].sort((a, b) => a.localeCompare(b)), [data]);
  const groups = useMemo(() => goalGroups(data.goals, data.plans, filters.goal), [data, filters.goal]);
  const count = activeFilterCount(filters);

  return (
    <div id={id} className={`journal-filters ${open ? 'is-open' : ''}`} role="group" aria-label="Filters">
      <label className="field">
        <span className="field__label">From</span>
        <input type="date" className="input" value={filters.from ?? ''} max={filters.to ?? undefined} onChange={(e) => onChange({ from: e.target.value || null })} />
      </label>
      <label className="field">
        <span className="field__label">To</span>
        <input type="date" className="input" value={filters.to ?? ''} min={filters.from ?? undefined} onChange={(e) => onChange({ to: e.target.value || null })} />
      </label>
      <label className="field">
        <span className="field__label">Linked task</span>
        <select className="input" value={filters.task ?? ''} onChange={(e) => onChange({ task: e.target.value || null })} disabled={!tasks.length && !filters.task}>
          <option value="">{tasks.length ? 'Any task' : 'No linked tasks yet'}</option>
          {filters.task && !tasks.some((t) => t.id === filters.task) && <option value={filters.task}>A task that is no longer here</option>}
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
              {t.scheduledDate ? ` · ${formatShort(t.scheduledDate)}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Vision goal</span>
        <select className="input" value={filters.goal ?? ''} onChange={(e) => onChange({ goal: e.target.value || null })} disabled={!groups.length && !filters.goal}>
          <option value="">{groups.length ? 'Any goal' : 'No goals yet'}</option>
          {filters.goal && !data.goals.some((g) => g.id === filters.goal) && <option value={filters.goal}>A goal that is no longer here</option>}
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Tag</span>
        <select className="input" value={filters.tag ?? ''} onChange={(e) => onChange({ tag: e.target.value || null })} disabled={!tags.length && !filters.tag}>
          <option value="">{tags.length ? 'Any tag' : 'No tags yet'}</option>
          {filters.tag && !tags.includes(filters.tag) && <option value={filters.tag}>#{filters.tag}</option>}
          {tags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>
      </label>
      <div className="journal-filters__clear">
        <button type="button" className="btn btn--ghost" onClick={onClear} disabled={count === 0 && !filters.q}>
          <Icon name="close" size={16} /> Clear all
        </button>
      </div>
    </div>
  );
}

function linkedTasks(data: JournalData): Task[] {
  const used = new Set(data.entries.filter((e) => !isBlankEntry(e)).flatMap((e) => e.taskIds));
  return [...data.tasks.values()].filter((t) => used.has(t.id)).sort((a, b) => a.title.localeCompare(b.title) || (b.scheduledDate ?? '').localeCompare(a.scheduledDate ?? ''));
}

function ResultSummary({ results, filters }: { results: JournalEntry[]; filters: JournalFilters }) {
  const span = dateSpan(results);
  const from = filters.from ?? span?.first;
  const to = filters.to ?? span?.last;
  const count = `${results.length} ${results.length === 1 ? 'entry' : 'entries'}`;
  let range = '';
  if (from && to) range = from === to ? formatMedium(from) : `${formatRangeStart(from, to)} to ${formatMedium(to)}`;
  else if (from) range = `from ${formatMedium(from)}`;
  else if (to) range = `until ${formatMedium(to)}`;
  return (
    <p className="journal-summary" role="status">
      <span className="tabular">{count}</span>
      {range && <span> · {range}</span>}
      {filters.q.trim() && <span className="journal-summary__q"> · matching “{filters.q.trim()}”</span>}
    </p>
  );
}

const formatRangeStart = (from: DateKey, to: DateKey) => (from.slice(0, 4) === to.slice(0, 4) ? formatShort(from) : formatMedium(from));

function noResultsBody(f: JournalFilters): string {
  if (searchTerms(f.q).length) return 'Every word you search for has to appear in the title, text or tags. Try fewer words or clear the filters.';
  if (activeFilterCount(f)) return 'Nothing written matches these filters. Widen the date range or clear the filters.';
  if (f.view === 'learned') return 'No learning entries yet. Write one on Today with “What I learned”.';
  if (f.view === 'built') return 'No doing entries yet. Write one on Today with “What I did”.';
  if (f.view === 'reflections') return 'No reflections yet. Write one on Today with “Daily reflection”.';
  return 'Nothing to show here.';
}

function describeScope(f: JournalFilters, data: JournalData): string {
  const bits: string[] = [];
  if (f.view !== 'all') bits.push(JOURNAL_VIEWS.find((v) => v.view === f.view)!.label);
  if (f.from && f.to) bits.push(`${formatMedium(f.from)} to ${formatMedium(f.to)}`);
  else if (f.from) bits.push(`from ${formatMedium(f.from)}`);
  else if (f.to) bits.push(`until ${formatMedium(f.to)}`);
  if (f.task) bits.push(`task: ${data.tasks.get(f.task)?.title ?? 'removed task'}`);
  if (f.goal) bits.push(`goal: ${data.goals.find((g) => g.id === f.goal)?.title ?? 'removed goal'}`);
  if (f.tag) bits.push(`tag: #${f.tag}`);
  if (f.q.trim()) bits.push(`matching "${f.q.trim()}"`);
  return bits.length ? bits.join(' · ') : 'All entries';
}

function PinnedStrip({ entries, terms, search }: { entries: JournalEntry[]; terms: string[]; search: string }) {
  return (
    <section className="journal-pins" aria-labelledby="pins-heading">
      <h2 id="pins-heading" className="journal-pins__title">
        Pinned <span className="journal-pins__count tabular">{entries.length}</span>
      </h2>
      <ul className="journal-pins__list">
        {entries.map((e) => {
          const { title } = entryHeading(e);
          return (
            <li key={e.id} className={`journal-pin journal-pin--${e.kind}`}>
              <KindChip kind={e.kind} />
              <Link to={readingHref(e.id, search)} className="journal-pin__title">
                <Marked parts={highlightParts(title, terms)} />
              </Link>
              <span className="journal-pin__date">{formatMedium(e.dateKey)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Feed({ entries, terms, search, data, timeZone }: { entries: JournalEntry[]; terms: string[]; search: string; data: JournalData; timeZone: string }) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const groups = useMemo(() => groupByDay(entries.slice(0, limit)), [entries, limit]);
  const goalTitles = useMemo(() => new Map(data.goals.map((g) => [g.id, g.title])), [data.goals]);

  return (
    <>
      <ol className="journal-days">
        {groups.map((g) => (
          <li key={g.dateKey} className="journal-day">
            <div className="journal-day__head">
              <h2 className="journal-day__date">{formatLong(g.dateKey)}</h2>
              <Link to={`/?date=${g.dateKey}`} className="journal-day__open">
                Open day<span className="visually-hidden"> {formatLong(g.dateKey)} on Today</span>
                <Icon name="chevronRight" size={14} />
              </Link>
            </div>
            <ol className="journal-feed">
              {g.entries.map((e) => (
                <li key={e.id}>
                  <FeedCard entry={e} terms={terms} search={search} tasks={data.tasks} goalTitles={goalTitles} timeZone={timeZone} />
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
      {entries.length > limit && (
        <div className="journal-more">
          <button type="button" className="btn btn--quiet" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
            Show older entries
          </button>
          <span className="journal-more__count tabular">
            Showing {limit} of {entries.length}
          </span>
        </div>
      )}
    </>
  );
}

function FeedCard({
  entry, terms, search, tasks, goalTitles, timeZone,
}: { entry: JournalEntry; terms: string[]; search: string; tasks: Map<ID, Task>; goalTitles: Map<ID, string>; timeZone: string }) {
  const { title, body } = entryHeading(entry);
  const snippet = buildSnippet(body, terms);
  const goals = [...entryGoalIds(entry, tasks)].filter((id) => goalTitles.has(id));

  return (
    <article className={`entry journal-card entry--${entry.kind}`}>
      <div className="entry__meta">
        <KindChip kind={entry.kind} />
        <span className="entry__when">{formatTimeInZone(new Date(entry.happenedAt), entry.recordedTimezone || timeZone)}</span>
        {entry.documentedAt && <span className="entry__badge">Documented</span>}
        {entry.pinned && <span className="entry__badge entry__badge--quiet">Pinned</span>}
      </div>
      <h3 className="journal-card__title">
        <Link to={readingHref(entry.id, search)} className="journal-card__link">
          <Marked parts={highlightParts(title, terms)} />
        </Link>
      </h3>
      {snippet.parts.length > 0 && (
        <p className="journal-card__snippet">
          <SnippetText snippet={snippet} />
        </p>
      )}
      {(entry.taskIds.length > 0 || goals.length > 0 || entry.tags.length > 0) && (
        <div className="entry__links journal-card__links">
          {entry.taskIds.map((id) => {
            const t = tasks.get(id);
            return (
              <span key={id} className={`link-chip ${t ? `link-chip--${t.category}` : ''}`}>
                <span aria-hidden="true">↗</span>
                <span className="visually-hidden">Task: </span>
                {t ? t.title : 'Removed task'}
              </span>
            );
          })}
          {goals.map((id) => (
            <span key={id} className="link-chip link-chip--goal">
              <Icon name="vision" size={12} />
              <span className="visually-hidden">Goal: </span>
              {goalTitles.get(id)}
            </span>
          ))}
          {entry.tags.map((t) => (
            <span key={t} className="link-chip link-chip--tag">
              <Marked parts={highlightParts(`#${t}`, terms)} />
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
