import { useSyncExternalStore } from 'react';
import { getAiSettings } from './aiSettings';
import { describeError, generateSection } from './claude';
import { booksDb, updateBook } from './db';
import type { SectionId } from './schema';

/**
 * Runs analyses outside React so navigating between pages never cancels one.
 * Results are written to IndexedDB section by section; live streaming
 * progress lives here in memory only.
 */

interface LiveRun {
  controller: AbortController;
  chars: Partial<Record<SectionId, number>>;
}

const runs = new Map<string, LiveRun>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export function isRunning(bookId: string): boolean {
  return runs.has(bookId);
}

export function useLiveRun(bookId: string): { running: boolean; chars: Partial<Record<SectionId, number>> } {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  const run = runs.get(bookId);
  return { running: !!run, chars: run?.chars ?? {} };
}

export function stopAnalysis(bookId: string): void {
  runs.get(bookId)?.controller.abort();
}

/**
 * Generates every section that is not done yet (or only `only`, when given).
 * Order matters for caching and dependencies: the summary writes the book to
 * the prompt cache, the mind map and insights read it in parallel, then both
 * plans build on the insights.
 */
export async function runAnalysis(bookId: string, only?: SectionId[]): Promise<void> {
  if (runs.has(bookId)) return;
  const settings = getAiSettings();
  if (!settings.apiKey) throw new Error('Add your Claude API key in Settings first.');
  const [book, source] = await Promise.all([booksDb.books.get(bookId), booksDb.sources.get(bookId)]);
  if (!book || !source) throw new Error('Book not found.');

  const wanted = (id: SectionId) => (only ? only.includes(id) : book.sections[id]?.status !== 'done');
  const run: LiveRun = { controller: new AbortController(), chars: {} };
  runs.set(bookId, run);
  emit();

  await updateBook(bookId, (b) => {
    for (const id of ['summary', 'mindmap', 'insights', 'plan7', 'plan30'] as SectionId[]) {
      if (wanted(id)) b.sections[id] = { status: 'running', updatedAt: Date.now() };
    }
    b.model = settings.model;
  });

  const step = async (section: SectionId) => {
    if (!wanted(section)) return;
    try {
      const latest = (await booksDb.books.get(bookId)) ?? book;
      const result = await generateSection({
        section,
        book: latest,
        source,
        settings,
        insights: latest.results.insights,
        signal: run.controller.signal,
        onText: (chars) => {
          run.chars[section] = chars;
          emit();
        },
      });
      await updateBook(bookId, (b) => {
        (b.results as Record<SectionId, unknown>)[section] = result;
        b.sections[section] = { status: 'done', updatedAt: Date.now() };
        b.analyzedAt = Date.now();
      });
    } catch (error) {
      await updateBook(bookId, (b) => {
        b.sections[section] = { status: 'error', error: describeError(error), updatedAt: Date.now() };
      });
    } finally {
      delete run.chars[section];
      emit();
    }
  };

  const notAborted = () => !run.controller.signal.aborted;
  try {
    await step('summary');
    if (notAborted()) await Promise.all([step('mindmap'), step('insights')]);
    const fresh = await booksDb.books.get(bookId);
    if (notAborted()) {
      if (fresh?.results.insights) {
        await Promise.all([step('plan7'), step('plan30')]);
      } else {
        await updateBook(bookId, (b) => {
          for (const id of ['plan7', 'plan30'] as SectionId[]) {
            if (b.sections[id]?.status === 'running') b.sections[id] = { status: 'error', error: 'Needs insights first. Retry once insights finish.' };
          }
        });
      }
    }
  } finally {
    // Anything still marked running (stopped early) goes back to idle.
    await updateBook(bookId, (b) => {
      for (const [id, state] of Object.entries(b.sections)) {
        if (state?.status === 'running') b.sections[id as SectionId] = { status: 'idle' };
      }
    });
    runs.delete(bookId);
    emit();
  }
}
