import type { AiSettings } from './aiSettings';
import { booksDb, type BookRecord, type BookSource } from './db';
import { planReading } from './material';
import { extractJson, normalizeSection, sectionJsonSchema } from './normalize';
import { complete, OpenRouterError, resolveModel, type OrModel } from './openrouter';
import { bookText, jsonInstruction, notesMaterial, notesPrompt, SYSTEM_PROMPT, taskPrompt } from './prompts';
import type { BookInsights, SectionId, SectionResults } from './schema';

/**
 * The text the model works from: the book itself when it fits, otherwise
 * notes condensed part by part (saved, so retries don't re-read the book).
 */
export async function prepareMaterial(
  book: BookRecord,
  source: BookSource,
  settings: AiSettings,
  signal: AbortSignal,
  onStage: (stage: string | null, chars?: number) => void,
): Promise<{ model: OrModel; material: string }> {
  if (book.mode === 'pdf') throw new OpenRouterError('This PDF is scanned (no text layer). OpenRouter models need text: run OCR on the PDF first, or use Claude in Settings.');
  const model = await resolveModel(settings.openrouterModel);
  const plan = planReading(source.pages, book.range, model.context, model.maxOutput);
  if (plan.direct) return { model, material: bookText(book, source) };

  const key = `${model.id}|${book.range.from}-${book.range.to}`;
  if (source.notes?.key === key) return { model, material: notesMaterial(book, source.notes.text) };

  const notes: string[] = [];
  for (const [i, part] of plan.parts.entries()) {
    onStage(`Reading part ${i + 1} of ${plan.parts.length}`);
    const text = await complete({
      key: settings.openrouterKey,
      model,
      system: SYSTEM_PROMPT,
      user: `${bookText(book, source, part)}\n\n${notesPrompt(book, i + 1, plan.parts.length, part.from, part.to)}`,
      maxTokens: 6_000,
      signal,
      onText: (chars) => onStage(`Reading part ${i + 1} of ${plan.parts.length}`, chars),
    });
    notes.push(`## Part ${i + 1} (pages ${part.from}–${part.to})\n\n${text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()}`);
  }
  onStage(null);
  const joined = notes.join('\n\n');
  await booksDb.sources.update(book.id, { notes: { key, text: joined } });
  return { model, material: notesMaterial(book, joined) };
}

export async function orGenerateSection<S extends SectionId>(opts: {
  section: S;
  book: BookRecord;
  model: OrModel;
  material: string;
  settings: AiSettings;
  insights?: BookInsights;
  signal: AbortSignal;
  onText: (chars: number) => void;
}): Promise<SectionResults[S]> {
  const { section, book, model, material, settings, insights, signal, onText } = opts;
  const schema = sectionJsonSchema(section);
  const text = await complete({
    key: settings.openrouterKey,
    model,
    system: SYSTEM_PROMPT,
    user: `${material}\n\n${taskPrompt(section, book, insights)}\n\n${jsonInstruction(schema)}`,
    schema: { name: section, schema },
    signal,
    onText,
  });
  return normalizeSection(section, extractJson(text));
}
