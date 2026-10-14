/**
 * Decides how much of a book a model can read at once. Models with a smaller
 * context window read the book in parts and work from condensed notes.
 */

/** Conservative characters-per-token for budgeting across tokenizers. */
const CHARS_PER_TOKEN = 3.2;
/** Room for instructions, schema, extracted insights and the answer. */
const SECTION_OVERHEAD_TOKENS = 6_000;
const NOTES_OVERHEAD_TOKENS = 3_000;
const NOTES_OUTPUT_TOKENS = 5_000;
const MAX_PART_TOKENS = 120_000;

export interface ReadingPlan {
  /** Whole book fits: send the text directly. */
  direct: boolean;
  /** Page ranges (1-based, inclusive) read one request each when not direct. */
  parts: { from: number; to: number }[];
}

export function outputBudget(maxOutput: number): number {
  return Math.min(maxOutput || 16_000, 16_000);
}

export function planReading(pages: string[], range: { from: number; to: number }, context: number, maxOutput: number): ReadingPlan {
  const from = Math.max(1, range.from);
  const to = Math.min(pages.length, range.to);
  const chars = pages.slice(from - 1, to).reduce((n, p) => n + p.length + 12, 0);
  const available = context - outputBudget(maxOutput) - SECTION_OVERHEAD_TOKENS;
  if (chars / CHARS_PER_TOKEN <= available) return { direct: true, parts: [{ from, to }] };

  const partTokens = Math.min(MAX_PART_TOKENS, context - NOTES_OUTPUT_TOKENS - NOTES_OVERHEAD_TOKENS);
  if (partTokens < 4_000) throw new Error('This model reads too little at once for a book. Pick a model with a larger context.');
  const partChars = partTokens * CHARS_PER_TOKEN;
  const parts: { from: number; to: number }[] = [];
  let start = from;
  let size = 0;
  for (let p = from; p <= to; p++) {
    const len = (pages[p - 1]?.length ?? 0) + 12;
    if (size > 0 && size + len > partChars) {
      parts.push({ from: start, to: p - 1 });
      start = p;
      size = 0;
    }
    size += len;
  }
  parts.push({ from: start, to });
  return { direct: false, parts };
}
