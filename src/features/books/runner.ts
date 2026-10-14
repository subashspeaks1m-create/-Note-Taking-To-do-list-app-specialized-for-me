import { useSyncExternalStore } from 'react';
import { getAiSettings, hasKey } from './aiSettings';
import { describeError, generateSection } from './claude';
import { booksDb, updateBook } from './db';
import { IncompleteResultError } from './normalize';
import { OpenRouterError, type OrModel } from './openrouter';
import { orGenerateSection, prepareMaterial } from './orGenerate';
import { SECTION_IDS, type SectionId } from './schema';

/**
 * Runs analyses outside React so navigating between pages never cancels one.
 * Results are written to IndexedDB section by section; live streaming
 * progress lives here in memory only.
 */

interface LiveRun {
  controller: AbortController;
  chars: Partial<Record<SectionId, number>>;
  stage: string | null;
  stageChars: number;
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

export function useLiveRun(bookId: string): { running: boolean; chars: Partial<Record<SectionId, number>>; stage: string | null; stageChars: number } {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  const run = runs.get(bookId);
  return { running: !!run, chars: run?.chars ?? {}, stage: run?.stage ?? null, stageChars: run?.stageChars ?? 0 };
}

export function stopAnalysis(bookId: string): void {
  runs.get(bookId)?.controller.abort();
}

function errorText(error: unknown): string {
  if (error instanceof OpenRouterError || error instanceof IncompleteResultError) return error.message;
  if (error instanceof DOMException && error.name === 'AbortError') return 'Stopped.';
  if (error instanceof TypeError && /fetch/i.test(error.message)) return 'Could not reach the AI provider. Check your connection and retry.';
  return describeError(error);
}

/**
 * Generates every section that is not done yet (or only `only`, when given).
 * Claude: the summary writes the book to the prompt cache, the mind map and
 * insights read it in parallel, then both plans build on the insights.
 * OpenRouter: free models are rate-limited, so sections run one at a time.
 */
export async function runAnalysis(bookId: string, only?: SectionId[]): Promise<void> {
  if (runs.has(bookId)) return;
  const settings = getAiSettings();
  if (!hasKey(settings)) throw new Error('Add your API key in Settings first.');
  const [book, source] = await Promise.all([booksDb.books.get(bookId), booksDb.sources.get(bookId)]);
  if (!book || !source) throw new Error('Book not found.');

  const wanted = (id: SectionId) => (only ? only.includes(id) : book.sections[id]?.status !== 'done');
  const run: LiveRun = { controller: new AbortController(), chars: {}, stage: null, stageChars: 0 };
  runs.set(bookId, run);
  emit();

  const openrouter = settings.provider === 'openrouter';
  let prepared: { model: OrModel; material: string } | null = null;

  await updateBook(bookId, (b) => {
    for (const id of SECTION_IDS) {
      if (wanted(id)) b.sections[id] = { status: 'running', updatedAt: Date.now() };
    }
    b.model = openrouter ? settings.openrouterModel || 'openrouter' : settings.model;
  });

  const step = async (section: SectionId) => {
    if (!wanted(section) || run.controller.signal.aborted) return;
    try {
      const latest = (await booksDb.books.get(bookId)) ?? book;
      const onText = (chars: number) => {
        run.chars[section] = chars;
        emit();
      };
      let result;
      if (prepared) {
        result = await orGenerateSection({ section, book: latest, ...prepared, settings, insights: latest.results.insights, signal: run.controller.signal, onText });
      } else {
        result = await generateSection({ section, book: latest, source, settings, insights: latest.results.insights, signal: run.controller.signal, onText });
      }
      await updateBook(bookId, (b) => {
        (b.results as Record<SectionId, unknown>)[section] = result;
        b.sections[section] = { status: 'done', updatedAt: Date.now() };
        b.analyzedAt = Date.now();
      });
    } catch (error) {
      run.stage = null;
      await updateBook(bookId, (b) => {
        b.sections[section] = { status: 'error', error: errorText(error), updatedAt: Date.now() };
      });
    } finally {
      delete run.chars[section];
      emit();
    }
  };

  const failPlansWithoutInsights = () =>
    updateBook(bookId, (b) => {
      for (const id of ['plan7', 'plan30'] as SectionId[]) {
        if (b.sections[id]?.status === 'running') b.sections[id] = { status: 'error', error: 'Needs insights first. Retry once insights finish.' };
      }
    });

  try {
    if (openrouter) {
      try {
        prepared = await prepareMaterial(book, source, settings, run.controller.signal, (stage, chars) => {
          run.stage = stage;
          run.stageChars = chars ?? 0;
          emit();
        });
      } catch (error) {
        run.stage = null;
        await updateBook(bookId, (b) => {
          for (const id of SECTION_IDS) {
            if (b.sections[id]?.status === 'running') b.sections[id] = { status: 'error', error: errorText(error), updatedAt: Date.now() };
          }
        });
        return;
      }
      const modelId = prepared.model.id;
      await updateBook(bookId, (b) => {
        b.model = modelId;
      });
      for (const id of ['summary', 'mindmap', 'insights'] as SectionId[]) await step(id);
      if ((await booksDb.books.get(bookId))?.results.insights) {
        await step('plan7');
        await step('plan30');
      } else {
        await failPlansWithoutInsights();
      }
    } else {
      await step('summary');
      await Promise.all([step('mindmap'), step('insights')]);
      if ((await booksDb.books.get(bookId))?.results.insights) await Promise.all([step('plan7'), step('plan30')]);
      else await failPlansWithoutInsights();
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
