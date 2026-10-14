import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { EmptyState } from '../../components/Page';
import { estimateCost, estimateTokens, hasKey, MODELS, modelLabel, useAiSettings } from './aiSettings';
import { AiSettingsForm } from './AiSettingsForm';
import { booksDb, deleteBook, updateBook, type BookRecord } from './db';
import { InsightsView } from './InsightsView';
import { bookToMarkdown, downloadText, safeFileName } from './markdown';
import { planReading } from './material';
import { MindMapView } from './MindMapView';
import { useOpenRouterModels } from './openrouter';
import { PlanView } from './PlanView';
import { runAnalysis, stopAnalysis, useLiveRun } from './runner';
import { SECTION_IDS, SECTION_LABELS, type SectionId } from './schema';
import { SummaryView } from './SummaryView';

type Tab = SectionId;
const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'mindmap', label: 'Mind map' },
  { id: 'insights', label: 'Insights' },
  { id: 'plan7', label: '7-day plan' },
  { id: 'plan30', label: '30-day plan' },
];

export function BookPage() {
  const { bookId = '' } = useParams();
  // `null` once loaded and missing; `undefined` only while loading.
  const book = useLiveQuery(async () => (await booksDb.books.get(bookId)) ?? null, [bookId]);
  const live = useLiveRun(bookId);
  const [params, setParams] = useSearchParams();
  const [setupOpen, setSetupOpen] = useState(false);

  if (book === undefined) return <div className="page" aria-busy="true" />;
  if (book === null) {
    return (
      <div className="page page--narrow">
        <EmptyState icon="learning" title="This book isn't in your library." body="It may have been deleted on this device.">
          <Link to="/books" className="btn btn--primary">
            Back to Books
          </Link>
        </EmptyState>
      </div>
    );
  }

  const anyDone = SECTION_IDS.some((s) => book.sections[s]?.status === 'done');
  const showSetup = (!anyDone && !live.running) || setupOpen;
  const tabParam = params.get('tab') as Tab | null;
  const tab: Tab = tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : 'summary';

  return (
    <div className="page book-page">
      <BookHeader book={book} onSetup={() => setSetupOpen((v) => !v)} setupOpen={setupOpen} />

      {showSetup && <AnalyzePanel book={book} onStarted={() => setSetupOpen(false)} />}

      {(anyDone || live.running) && (
        <>
          <Progress book={book} />
          <div className="tabs book-tabs" role="tablist" aria-label="Book analysis">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="book-panel"
                className="tabs__tab"
                onClick={() => setParams({ tab: t.id }, { replace: true })}
              >
                {t.label}
                <SectionDot book={book} section={t.id} />
              </button>
            ))}
          </div>
          <div id="book-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="book-panel">
            <SectionPanel book={book} section={tab} />
          </div>
        </>
      )}
    </div>
  );
}

function BookHeader({ book, onSetup, setupOpen }: { book: BookRecord; onSetup: () => void; setupOpen: boolean }) {
  const navigate = useNavigate();
  const anyDone = SECTION_IDS.some((s) => book.sections[s]?.status === 'done');
  const model = modelLabel(book.model);
  return (
    <header className="book-head">
      <Link to="/books" className="book-head__back">
        <Icon name="chevronLeft" size={16} /> Books
      </Link>
      <div className="book-head__row">
        <div className="book-head__titles">
          <h1 className="page-head__title">{book.title}</h1>
          {book.author && <p className="book-head__author">{book.author}</p>}
          <p className="book-head__meta tabular">
            {book.pageCount} pages · {book.wordCount.toLocaleString()} words
            {book.mode === 'pdf' && ' · scanned PDF'}
            {book.analyzedAt && model && ` · analyzed with ${model}`}
          </p>
        </div>
        <div className="book-head__actions">
          {anyDone && (
            <>
              <button type="button" className="btn btn--quiet btn--sm" onClick={() => downloadText(`${safeFileName(book.title)}.md`, bookToMarkdown(book))}>
                Export Markdown
              </button>
              <button type="button" className="btn btn--quiet btn--sm" aria-expanded={setupOpen} onClick={onSetup}>
                Re-analyze
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={async () => {
              if (!window.confirm(`Delete "${book.title}" and its analysis from this device?`)) return;
              stopAnalysis(book.id);
              await deleteBook(book.id);
              navigate('/books');
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </header>
  );
}

function AnalyzePanel({ book, onStarted }: { book: BookRecord; onStarted: () => void }) {
  const settings = useAiSettings();
  const source = useLiveQuery(() => booksDb.sources.get(book.id), [book.id]);
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [goal, setGoal] = useState(book.goal);
  const [from, setFrom] = useState(book.range.from);
  const [to, setTo] = useState(book.range.to);
  const [error, setError] = useState<string | null>(null);
  const anyDone = SECTION_IDS.some((s) => book.sections[s]?.status === 'done');

  const openrouter = settings.provider === 'openrouter';
  const { free, models } = useOpenRouterModels();
  const orModel = openrouter ? (settings.openrouterModel ? models.find((m) => m.id === settings.openrouterModel) : free[0]) : undefined;
  const rangeChars = source ? source.pages.slice(from - 1, to).reduce((n, p) => n + p.length, 0) : book.charCount;
  const tokens = book.mode === 'pdf' ? book.pageCount * 2500 : estimateTokens(rangeChars);
  const cost = estimateCost(tokens, settings.model);
  const validRange = from >= 1 && to <= book.pageCount && from <= to;
  const tooBig = !openrouter && tokens > 850_000;
  let reading: ReturnType<typeof planReading> | null = null;
  if (openrouter && orModel && source && validRange) {
    try {
      reading = planReading(source.pages, { from, to }, orModel.context, orModel.maxOutput);
    } catch {
      reading = null;
    }
  }
  const scannedOnOpenRouter = openrouter && book.mode === 'pdf';

  const start = async () => {
    setError(null);
    await updateBook(book.id, (b) => {
      b.title = title.trim() || b.title;
      b.author = author.trim();
      b.goal = goal;
      b.range = { from, to };
      if (anyDone) {
        b.sections = {};
        b.results = {};
      }
    });
    onStarted();
    runAnalysis(book.id).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <section className="analyze" aria-labelledby="analyze-title">
      <h2 id="analyze-title" className="analyze__title">
        {anyDone ? 'Re-analyze this book' : 'Ready to analyze'}
      </h2>
      <div className="analyze__grid">
        <label className="field">
          <span className="field__label">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Author</span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Optional" />
        </label>
      </div>
      <label className="field">
        <span className="field__label">What do you want this book to change in your life?</span>
        <textarea
          rows={3}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Optional, but it makes the insights and roadmaps yours. e.g. I build apps in Python and Flutter and want to ship consistently instead of starting new projects."
        />
      </label>
      {book.mode === 'text' ? (
        <div className="analyze__range">
          <span className="field__label">Pages to analyze</span>
          <div className="analyze__range-inputs">
            <label>
              <span className="visually-hidden">From page</span>
              <input type="number" min={1} max={book.pageCount} value={from} onChange={(e) => setFrom(Number(e.target.value) || 1)} />
            </label>
            <span>to</span>
            <label>
              <span className="visually-hidden">To page</span>
              <input type="number" min={1} max={book.pageCount} value={to} onChange={(e) => setTo(Number(e.target.value) || book.pageCount)} />
            </label>
            <span className="muted">of {book.pageCount}. Skip the index and notes to save cost.</span>
          </div>
          {source && source.chapters.length > 0 && <p className="field__hint">{source.chapters.length} chapters found in the PDF bookmarks.</p>}
        </div>
      ) : (
        <p className="field__hint">This PDF has no text layer, so Claude will read the page images directly. This costs more than a text PDF.</p>
      )}

      {openrouter ? (
        <div className="analyze__estimate">
          <span className="tabular">≈ {Math.round(tokens / 1000).toLocaleString()}k tokens</span>
          <span>{orModel ? `${orModel.name}${orModel.free ? ' · free' : ''}` : settings.openrouterModel || 'Best free model'}</span>
          <span className="muted">
            {reading && !reading.direct
              ? `This model reads ${Math.round((orModel?.context ?? 0) / 1000)}k tokens at a time, so the book is first read in ${reading.parts.length} parts and condensed into notes (${reading.parts.length + 5} requests in all).`
              : 'Five requests: summary, mind map, insights, 7-day and 30-day plans.'}{' '}
            Free models allow about 50 requests a day.
          </span>
        </div>
      ) : (
        <div className="analyze__estimate">
          <span className="tabular">≈ {Math.round(tokens / 1000).toLocaleString()}k tokens</span>
          <span className="tabular">≈ ${cost.toFixed(2)} with {MODELS.find((m) => m.id === settings.model)?.label}</span>
          <span className="muted">Five sections: summary, mind map, insights, 7-day and 30-day plans. The book is cached so later sections cost less.</span>
        </div>
      )}

      {!hasKey(settings) && <AiSettingsForm compact />}
      {scannedOnOpenRouter && <p className="dropzone__error">This PDF is scanned (no text layer). OpenRouter models need text, so run OCR on it first, or switch to Claude in Settings.</p>}
      {tooBig && <p className="dropzone__error">This range is larger than Claude's context window. Narrow the page range.</p>}
      {error && (
        <p className="dropzone__error" role="alert">
          {error}
        </p>
      )}
      <div className="analyze__actions">
        <button type="button" className="btn btn--primary" disabled={!hasKey(settings) || tooBig || !validRange || scannedOnOpenRouter} onClick={() => void start()}>
          <Icon name="sparkle" size={16} /> {anyDone ? 'Re-analyze everything' : 'Analyze book'}
        </button>
        <span className="muted">Takes a few minutes. You can keep using the app meanwhile.</span>
      </div>
    </section>
  );
}

function effectiveStatus(book: BookRecord, section: SectionId, running: boolean) {
  const s = book.sections[section]?.status ?? 'idle';
  if (s === 'running' && !running) return 'interrupted';
  return s;
}

function Progress({ book }: { book: BookRecord }) {
  const live = useLiveRun(book.id);
  const statuses = SECTION_IDS.map((s) => ({ id: s, status: effectiveStatus(book, s, live.running) }));
  const done = statuses.filter((s) => s.status === 'done').length;
  if (done === SECTION_IDS.length && !live.running) return null;
  const retryable = statuses.some((s) => s.status !== 'done');
  return (
    <div className="run-status" role="status" aria-live="polite">
      {live.stage && (
        <p className="run-status__stage">
          <span className="spinner spinner--sm" aria-hidden="true" /> {live.stage}…{live.stageChars ? <span className="muted tabular"> {(live.stageChars / 1000).toFixed(1)}k chars of notes</span> : null}
        </p>
      )}
      <ol className="run-status__steps">
        {statuses.map(({ id, status }) => (
          <li key={id} className={`run-step run-step--${status}`}>
            <span className="run-step__dot" aria-hidden="true">
              {status === 'done' ? <Icon name="check" size={12} /> : null}
            </span>
            <span>{SECTION_LABELS[id]}</span>
            {status === 'running' && live.chars[id] ? <span className="muted tabular">{(live.chars[id]! / 1000).toFixed(1)}k chars</span> : null}
            {status === 'running' && !live.chars[id] && !live.stage ? <span className="muted">waiting…</span> : null}
            {status === 'error' && <span className="run-step__err">failed</span>}
          </li>
        ))}
      </ol>
      {live.running ? (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => stopAnalysis(book.id)}>
          Stop
        </button>
      ) : (
        retryable && (
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => void runAnalysis(book.id).catch(() => undefined)}>
            {statuses.some((s) => s.status === 'error') ? 'Retry failed sections' : 'Continue analysis'}
          </button>
        )
      )}
    </div>
  );
}

function SectionDot({ book, section }: { book: BookRecord; section: SectionId }) {
  const live = useLiveRun(book.id);
  const status = effectiveStatus(book, section, live.running);
  if (status === 'done') return null;
  return <span className={`tab-dot tab-dot--${status}`} aria-label={status} />;
}

function SectionPanel({ book, section }: { book: BookRecord; section: SectionId }) {
  const live = useLiveRun(book.id);
  const status = effectiveStatus(book, section, live.running);
  const r = book.results;

  if (section === 'summary' && r.summary) return <SummaryView summary={r.summary} />;
  if (section === 'mindmap' && r.mindmap) return <MindMapView map={r.mindmap} />;
  if (section === 'insights' && r.insights) return <InsightsView insights={r.insights} />;
  if (section === 'plan7' && r.plan7) return <PlanView book={book} planId="plan7" plan={r.plan7} />;
  if (section === 'plan30' && r.plan30) return <PlanView book={book} planId="plan30" plan={r.plan30} />;

  const err = book.sections[section]?.error;
  return (
    <div className="section-wait">
      {status === 'running' ? (
        <>
          <div className="spinner" aria-hidden="true" />
          <p>Claude is writing the {SECTION_LABELS[section].toLowerCase()}…</p>
        </>
      ) : status === 'error' ? (
        <>
          <p className="dropzone__error">{err ?? 'This section failed.'}</p>
          <button type="button" className="btn btn--quiet" disabled={live.running} onClick={() => void runAnalysis(book.id, [section]).catch(() => undefined)}>
            Retry {SECTION_LABELS[section].toLowerCase()}
          </button>
        </>
      ) : (
        <>
          <p className="muted">{status === 'interrupted' ? 'The analysis was interrupted (the page was closed or reloaded).' : 'Not generated yet.'}</p>
          <button type="button" className="btn btn--quiet" disabled={live.running} onClick={() => void runAnalysis(book.id).catch(() => undefined)}>
            Continue analysis
          </button>
        </>
      )}
    </div>
  );
}
