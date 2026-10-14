import type { BookRecord, BookSource } from './db';
import type { BookInsights, SectionId } from './schema';

/**
 * The system prompt and book block are identical for every section so the
 * book is cached once and re-read cheaply by the later requests. Anything
 * that varies per section goes after the cached block.
 */
export const SYSTEM_PROMPT = `You are an expert book analyst and behavior-change coach. You read whole books closely and turn them into material that changes how the reader acts, not just what they know. Learning is changing behavior.

How you work:
- Stay faithful to the book. Every idea, example and framework must come from the text. Never invent studies, stories or quotes. Quotes are verbatim.
- Cite where things are using the [Page N] markers (these are PDF page numbers).
- Be specific: use the book's own names, numbers, examples, steps and terminology rather than generic advice.
- Write for a busy, ambitious reader: plain language, short sentences, no filler or hype.
- Actions must be small, concrete, observable and doable in the stated time, and each must trace back to an idea in the book.
- If the reader shared a goal, tailor insights and plans to it without distorting what the book says.`;

/** The book text with page and chapter markers, limited to the chosen page range. */
export function bookText(book: BookRecord, source: BookSource, range = book.range): string {
  const from = Math.max(1, range.from);
  const to = Math.min(source.pages.length, range.to);
  const chapterAt = new Map(source.chapters.map((c) => [c.page, c.title]));
  const parts: string[] = [];
  for (let p = from; p <= to; p++) {
    const chapter = chapterAt.get(p);
    const text = source.pages[p - 1] ?? '';
    if (text.trim() || chapter) parts.push(`${chapter ? `=== Chapter: ${chapter} ===\n` : ''}[Page ${p}]\n${text}`);
  }
  const header = `<book title="${escapeAttr(book.title)}"${book.author ? ` author="${escapeAttr(book.author)}"` : ''} pages="${from}-${to}">`;
  return `${header}\n${parts.join('\n\n')}\n</book>`;
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "'");
}

function readerContext(book: BookRecord): string {
  const goal = book.goal.trim();
  return goal
    ? `About the reader and what they want from this book:\n<reader_goal>\n${goal}\n</reader_goal>`
    : 'The reader did not share a specific goal. Write for a motivated person who wants to apply this book to work and life.';
}

const TASKS: Record<SectionId, string> = {
  summary: `Write a complete summary of the book above.
- oneSentence: the whole book in one sentence.
- bigIdea: the core thesis and why it matters, one short paragraph.
- whoItIsFor: who benefits most and what problem it solves for them.
- overview: 5–9 paragraphs that walk through the full argument from start to finish, so someone who never reads the book understands it.
- chapters: one entry per chapter or major part, in order (use the chapter markers if present, otherwise infer the sections). Each gets a 2–4 sentence summary and 3–6 key points with the specific examples, numbers and steps the book gives.
- keyConcepts: 6–15 terms, frameworks or models the book introduces, each explained plainly.
- quotes: 5–10 of the most powerful lines, copied verbatim, with page and why each matters.
- caveats: 2–5 fair limits — weak evidence, contested claims, or where the advice may not apply.`,

  mindmap: `Build a mind map of the whole book.
- center: the book's central idea in at most 8 words.
- branches: 4–7 main themes or parts, in the order a reader should learn them. Each has a label (at most 5 words), a note (one sentence, at most 25 words), and 2–5 children.
- children: the key ideas under each theme, each with a label (at most 6 words), a note (at most 25 words) and 0–4 leaf children.
- leaf children: concrete specifics — examples, steps, techniques, numbers — labels of at most 7 words.
Cover the entire book; the map should let someone recall its full structure at a glance.`,

  insights: `Extract the insights from this book that most change behavior — not facts to remember, but changes in what the reader does.
- insights: the 8–14 most behavior-changing ideas, ranked by impact (highest first). For each:
  - title: a short imperative (e.g. "Design the cue, not the willpower").
  - idea: what the book says, in its own terms and examples.
  - whyItMatters: the payoff and the mechanism behind it.
  - shiftFrom / shiftTo: the old default behavior and the new one, each one short sentence.
  - action: one concrete thing to do this week, with a clear finish line.
  - ifThenPlan: an implementation intention in the form "When [specific cue], I will [specific action]."
  - obstacle: the most likely way this fails in real life, and the counter-move.
  - reflection: one question worth journaling on.
  - pages: where the idea is in the book.
- identityShift: "I am the kind of person who …" — the identity the book invites.
- keystoneHabit: the single habit that would carry most of the book's value, with its cue and a two-minute starter version.
- startDoing / stopDoing / keepDoing: 3–6 crisp items each.`,

  plan7: `Design a 7-day starter roadmap that turns this book into action. Use the insights below; reference them by title in "why".
- goal: what will be different after 7 days, stated as observable behavior.
- days: exactly 7 entries, day 1 to 7. Day 1 is the easiest win (start with the keystone habit's two-minute version). Build gradually. Day 7 is a review: what worked, what to keep, what to adjust.
- each day: a theme, why (the book idea it practices), 2–4 actions, and an evening reflection question.
- actions: specific and checkable ("Write tomorrow's 3 priorities on a card before 9pm", not "plan better"). minutes is a realistic estimate; keep each day's total under 60 minutes. kind is "do" (behavior in real life), "reflect" (writing or review) or "learn" (re-read a specific part — name the pages).`,

  plan30: `Design a 30-day roadmap that makes this book's behaviors stick. Use the insights below; reference them by title in "why".
- goal: who the reader will be after 30 days, stated as observable behavior.
- weeks: exactly 4 entries. Week 1 installs the keystone habit at a tiny size; week 2 adds the next most important behaviors; week 3 applies them in harder, real situations; week 4 (days 22–30) integrates everything into identity and routine. Each week has a focus and a measurable milestone.
- days: exactly 30 entries, day 1 to 30, each with a theme, why, 1–3 actions and an evening reflection question. Days 7, 14, 21 and 28 include a short weekly review. Day 30 is a retrospective with next steps.
- actions: specific and checkable; minutes realistic; keep each day under 60 minutes. kind is "do", "reflect" or "learn" (name the pages to revisit).
- Keep every string brief (actions under 20 words) so all 30 days fit.
- successSigns: 4–8 observable signs that behavior actually changed.`,
};

export function taskPrompt(section: SectionId, book: BookRecord, insights?: BookInsights): string {
  const parts = [TASKS[section], readerContext(book)];
  if ((section === 'plan7' || section === 'plan30') && insights) {
    parts.push(`Insights already extracted from this book:\n<insights>\n${JSON.stringify(insights)}\n</insights>`);
  }
  return parts.join('\n\n');
}

/** Asks a model to condense one part of a long book into study notes. */
export function notesPrompt(book: BookRecord, part: number, parts: number, from: number, to: number): string {
  return `This is part ${part} of ${parts} of "${book.title}" (pages ${from}–${to}). The book is too long to read at once, so write study notes on this part that keep everything needed later to summarize the whole book, build a mind map, and extract behavior-changing insights.

- Use a heading for each chapter or section, with its page numbers.
- Under each, list every key idea, framework, step, example, story and number, as specific bullets.
- Copy the most memorable lines word for word in quotes, with [Page N].
- Aim for 1,200–2,500 words. Write only the notes.`;
}

/** Wraps condensed notes so section prompts know what they are reading. */
export function notesMaterial(book: BookRecord, notes: string): string {
  return `<book_notes title="${escapeAttr(book.title)}"${book.author ? ` author="${escapeAttr(book.author)}"` : ''}>
These are detailed notes of the whole book, written part by part because the book is longer than you can read at once. Page markers refer to the original book.

${notes}
</book_notes>`;
}

export function jsonInstruction(schema: object): string {
  return `Reply with only one JSON object, no other text. It must follow this JSON Schema:\n${JSON.stringify(schema)}`;
}
