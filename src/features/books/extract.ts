import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Chapter } from './db';
import { cleanPages, looksScanned, paginate, titleFromFileName } from './textCleanup';

GlobalWorkerOptions.workerSrc = workerUrl;

export interface ExtractedBook {
  title: string;
  author: string;
  fileName: string;
  pages: string[];
  chapters: Chapter[];
  scanned: boolean;
  pdf?: Blob;
}

interface TextItemLike {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
}

function pageText(items: TextItemLike[]): string {
  let out = '';
  let lastY: number | null = null;
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const y = item.transform?.[5] ?? null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && !out.endsWith('\n')) out += '\n';
    out += item.str;
    if (item.hasEOL) out += '\n';
    if (y !== null) lastY = y;
  }
  return out;
}

interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items?: OutlineNode[];
}

async function readOutline(doc: PDFDocumentProxy): Promise<Chapter[]> {
  try {
    const outline = (await doc.getOutline()) as OutlineNode[] | null;
    if (!outline?.length) return [];
    // Use the top level, or the second level when the top is a single wrapper entry.
    const level = outline.length === 1 && outline[0]!.items?.length ? outline[0]!.items! : outline;
    const chapters: Chapter[] = [];
    for (const node of level.slice(0, 200)) {
      try {
        const dest = typeof node.dest === 'string' ? await doc.getDestination(node.dest) : node.dest;
        const ref = Array.isArray(dest) ? dest[0] : null;
        if (!ref || typeof ref !== 'object') continue;
        const index = await doc.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0]);
        chapters.push({ title: node.title.trim(), page: index + 1 });
      } catch {
        // Broken bookmark; skip it.
      }
    }
    return chapters.sort((a, b) => a.page - b.page);
  } catch {
    return [];
  }
}

export async function extractBook(file: File, onProgress: (done: number, total: number) => void): Promise<ExtractedBook> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) {
    const text = await file.text();
    const pages = paginate(text);
    return { title: titleFromFileName(file.name), author: '', fileName: file.name, pages, chapters: [], scanned: false };
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const task = getDocument({ data: data.slice() });
  const doc = await task.promise;
  try {
    const raw: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      raw.push(pageText(content.items as TextItemLike[]));
      page.cleanup();
      onProgress(i, doc.numPages);
    }
    const pages = cleanPages(raw);
    let title = '';
    let author = '';
    try {
      const meta = await doc.getMetadata();
      const info = meta.info as { Title?: string; Author?: string };
      title = (info.Title ?? '').trim();
      author = (info.Author ?? '').trim();
    } catch {
      // Metadata is optional.
    }
    if (!title || /^(untitled|microsoft word|document)/i.test(title)) title = titleFromFileName(file.name);
    const chapters = await readOutline(doc);
    const scanned = looksScanned(pages);
    return { title, author, fileName: file.name, pages, chapters, scanned, pdf: scanned ? new Blob([data], { type: 'application/pdf' }) : undefined };
  } finally {
    await task.destroy();
  }
}
