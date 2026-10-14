/**
 * Pure helpers that turn raw per-page PDF text into clean reading text.
 * Kept free of pdf.js so they are unit-testable.
 */

const EDGE_LINES = 2;

function normalizeEdge(line: string): string {
  return line.trim().toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ');
}

/** Removes running headers and footers: edge lines that repeat on many pages. */
export function stripRunningHeaders(pages: string[]): string[] {
  if (pages.length < 4) return pages;
  const counts = new Map<string, number>();
  const edgesOf = (lines: string[]) => [...lines.slice(0, EDGE_LINES), ...lines.slice(-EDGE_LINES)];
  const split = pages.map((p) => p.split('\n'));
  for (const lines of split) {
    for (const key of new Set(edgesOf(lines).map(normalizeEdge).filter(Boolean))) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.3));
  return split.map((lines) => {
    const out = [...lines];
    const isRepeated = (line: string) => (counts.get(normalizeEdge(line)) ?? 0) >= threshold;
    const isPageNumber = (line: string) => /^\s*(page\s*)?\d{1,4}\s*$/i.test(line);
    for (let i = 0; i < EDGE_LINES && out.length; i++) {
      if (isRepeated(out[0]!) || isPageNumber(out[0]!)) out.shift();
      else break;
    }
    for (let i = 0; i < EDGE_LINES && out.length; i++) {
      if (isRepeated(out[out.length - 1]!) || isPageNumber(out[out.length - 1]!)) out.pop();
      else break;
    }
    return out.join('\n');
  });
}

/** Joins words split by end-of-line hyphens and tidies whitespace. */
export function tidyText(text: string): string {
  return text
    .replace(/\u00ad/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/([A-Za-z])-\n([a-z])/g, '$1$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function cleanPages(pages: string[]): string[] {
  return stripRunningHeaders(pages.map((p) => p.replace(/\r\n?/g, '\n'))).map(tidyText);
}

export function countWords(text: string): number {
  const m = text.match(/\S+/g);
  return m ? m.length : 0;
}

/** Splits plain text into page-sized chunks so text files get page references too. */
export function paginate(text: string, size = 3000): string[] {
  const paragraphs = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const pages: string[] = [];
  let current = '';
  for (const para of paragraphs) {
    if (current && current.length + para.length > size) {
      pages.push(current);
      current = '';
    }
    current = current ? `${current}\n\n${para}` : para;
  }
  if (current.trim()) pages.push(current);
  return pages.map(tidyText);
}

/** Readable title from a file name when the PDF has no title metadata. */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base || 'Untitled book';
}

/** True when the extracted text is too thin to be a real text layer (scanned book). */
export function looksScanned(pages: string[]): boolean {
  if (pages.length === 0) return true;
  const chars = pages.reduce((n, p) => n + p.length, 0);
  return chars / pages.length < 200;
}
