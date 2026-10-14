import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/Page';
import { useTodayKey } from '../../date/clock';
import { PROFILE_DEFAULTS } from '../../domain/config';
import { hasKey, useAiSettings } from './aiSettings';
import { booksDb, type BookRecord } from './db';
import { extractBook } from './extract';
import { actionKey, currentDay, planStats } from './planMath';
import { toggleAction } from './practice';
import { SECTION_IDS } from './schema';
import { countWords } from './textCleanup';

const MAX_PDF_BYTES = 22 * 1024 * 1024;

export function LibraryPage() {
  const books = useLiveQuery(() => booksDb.books.orderBy('addedAt').reverse().toArray(), []);
  const settings = useAiSettings();

  return (
    <div className="page">
      <PageHeader overline="Learning is changing behavior" title="Books" />
      <p className="page-lede">Upload a book. Get the summary, a mind map, the insights that change behavior, and 7-day and 30-day roadmaps you can check off.</p>

      {!hasKey(settings) && (
        <div className="notice" role="note">
          <Icon name="sparkle" size={18} />
          <span>Add your {settings.provider === 'openrouter' ? 'OpenRouter' : 'Claude'} API key in Settings to analyze books.</span>
          <Link to="/settings#ai" className="btn btn--quiet btn--sm">
            Open settings
          </Link>
        </div>
      )}

      <Uploader />
      {books && <TodayPractice books={books} />}

      <h2 className="section-title">Your library</h2>
      {books && books.length === 0 && <p className="muted">No books yet. Your first upload appears here.</p>}
      <div className="book-grid">
        {books?.map((b) => (
          <BookCard key={b.id} book={b} />
        ))}
      </div>
    </div>
  );
}

function Uploader() {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<{ done: number; total: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = async (file: File | undefined) => {
    if (!file || busy) return;
    setError(null);
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const isText = /\.(txt|md|markdown)$/i.test(file.name) || file.type.startsWith('text/');
    if (!isPdf && !isText) {
      setError('Choose a PDF (or a .txt / .md file).');
      return;
    }
    setBusy({ done: 0, total: 0, name: file.name });
    try {
      const book = await extractBook(file, (done, total) => setBusy({ done, total, name: file.name }));
      if (book.scanned && (!book.pdf || book.pdf.size > MAX_PDF_BYTES || book.pages.length > 600)) {
        throw new Error('This PDF has no readable text layer (it looks scanned) and is too large to send as images. Run it through OCR first, then upload again.');
      }
      const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const text = book.pages.join('\n');
      const now = Date.now();
      const record: BookRecord = {
        id,
        title: book.title,
        author: book.author,
        fileName: book.fileName,
        mode: book.scanned ? 'pdf' : 'text',
        pageCount: book.pages.length,
        wordCount: countWords(text),
        charCount: text.length,
        addedAt: now,
        updatedAt: now,
        range: { from: 1, to: book.pages.length },
        goal: '',
        sections: {},
        results: {},
        practice: {},
      };
      await booksDb.transaction('rw', booksDb.books, booksDb.sources, async () => {
        await booksDb.books.add(record);
        await booksDb.sources.add({ bookId: id, pages: book.pages, chapters: book.chapters, pdf: book.pdf });
      });
      navigate(`/books/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this file.');
    } finally {
      setBusy(null);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    void handle(e.dataTransfer.files[0]);
  };

  return (
    <div
      className={`dropzone ${drag ? 'dropzone--over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      <div className="dropzone__art" aria-hidden="true">
        <Icon name="learning" size={28} />
      </div>
      {busy ? (
        <div className="dropzone__busy" role="status">
          <p className="dropzone__title">Reading {busy.name}…</p>
          <div className="meter__track" aria-hidden="true">
            <div className="meter__fill dropzone__fill" style={{ width: busy.total ? `${(busy.done / busy.total) * 100}%` : '8%' }} />
          </div>
          <p className="muted tabular">{busy.total ? `Page ${busy.done} of ${busy.total}` : 'Opening file'}</p>
        </div>
      ) : (
        <>
          <p className="dropzone__title">Drop a book PDF here</p>
          <p className="muted">Text stays on this device until you choose to analyze it.</p>
          <button type="button" className="btn btn--primary" onClick={() => input.current?.click()}>
            <Icon name="plus" size={18} /> Choose PDF
          </button>
        </>
      )}
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf,.txt,.md,text/plain"
        className="visually-hidden"
        tabIndex={-1}
        onChange={(e) => {
          void handle(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error && (
        <p className="dropzone__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function BookCard({ book }: { book: BookRecord }) {
  const done = SECTION_IDS.filter((s) => book.sections[s]?.status === 'done').length;
  const running = SECTION_IDS.some((s) => book.sections[s]?.status === 'running');
  const status = running ? 'Analyzing…' : done === SECTION_IDS.length ? 'Ready' : done === 0 ? 'Not analyzed' : `${done} of ${SECTION_IDS.length} sections`;
  const plan30 = book.results.plan30 && book.practice.plan30 ? planStats(book.practice.plan30, book.results.plan30.days) : null;
  const plan7 = book.results.plan7 && book.practice.plan7 ? planStats(book.practice.plan7, book.results.plan7.days) : null;
  return (
    <Link to={`/books/${book.id}`} className="book-card">
      <div className="book-card__spine" aria-hidden="true">
        {book.title.slice(0, 1).toUpperCase()}
      </div>
      <div className="book-card__body">
        <p className="book-card__title">{book.title}</p>
        {book.author && <p className="book-card__author">{book.author}</p>}
        <p className="book-card__meta tabular">
          {book.pageCount} pages · {Math.round(book.wordCount / 1000)}k words
        </p>
        <p className={`chip ${done === SECTION_IDS.length ? 'chip--gold' : 'chip--quiet'} book-card__status`}>{status}</p>
        {(plan7 || plan30) && (
          <p className="book-card__practice tabular">
            {plan7 && `7-day: ${plan7.daysDone}/7 days`}
            {plan7 && plan30 && ' · '}
            {plan30 && `30-day: ${plan30.daysDone}/30 days`}
          </p>
        )}
      </div>
    </Link>
  );
}

function TodayPractice({ books }: { books: BookRecord[] }) {
  const today = useTodayKey(PROFILE_DEFAULTS.timeZone);
  const items = books.flatMap((b) =>
    (['plan7', 'plan30'] as const).flatMap((planId) => {
      const progress = b.practice[planId];
      const plan = b.results[planId];
      if (!progress || !plan) return [];
      const n = currentDay(progress, today);
      const day = plan.days.find((d) => d.day === n);
      return day ? [{ book: b, planId, progress, day, length: plan.days.length }] : [];
    }),
  );
  if (!items.length) return null;
  return (
    <section className="today-practice" aria-labelledby="tp-title">
      <h2 id="tp-title" className="section-title">
        Today's practice
      </h2>
      <div className="today-practice__list">
        {items.map(({ book, planId, progress, day, length }) => (
          <article key={`${book.id}-${planId}`} className="practice-card">
            <p className="overline">
              {book.title} · Day {day.day} of {length}
            </p>
            <p className="practice-card__theme">{day.theme}</p>
            <ul className="checklist">
              {day.actions.map((a, i) => {
                const checked = !!progress.done[actionKey(day.day, i)];
                return (
                  <li key={i}>
                    <label className={`check ${checked ? 'check--done' : ''}`}>
                      <input type="checkbox" checked={checked} onChange={() => void toggleAction(book.id, planId, day.day, i)} />
                      <span className="check__box" aria-hidden="true">
                        <Icon name="check" size={14} />
                      </span>
                      <span className="check__text">{a.text}</span>
                      <span className="check__meta tabular">{a.minutes} min</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <Link to={`/books/${book.id}?tab=${planId}`} className="link-btn">
              Open plan
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
