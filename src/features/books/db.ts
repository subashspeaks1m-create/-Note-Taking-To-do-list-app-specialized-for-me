import Dexie, { type Table } from 'dexie';
import type { DateKey } from '../../date/localDate';
import type { SectionId, SectionResults } from './schema';

export type SectionStatus = 'idle' | 'running' | 'done' | 'error';

export interface SectionState {
  status: SectionStatus;
  error?: string;
  updatedAt?: number;
}

export interface PlanProgress {
  startDate: DateKey;
  /** Completed actions, keyed `${day}:${actionIndex}`. */
  done: Record<string, true>;
  /** Evening check-in notes, keyed by day number. */
  notes: Record<string, string>;
}

export type PlanId = 'plan7' | 'plan30';

export interface BookRecord {
  id: string;
  title: string;
  author: string;
  fileName: string;
  /** `text`: extracted text is sent. `pdf`: the PDF itself is sent (scanned books). */
  mode: 'text' | 'pdf';
  pageCount: number;
  wordCount: number;
  charCount: number;
  addedAt: number;
  updatedAt: number;
  range: { from: number; to: number };
  goal: string;
  model?: string;
  analyzedAt?: number;
  sections: Partial<Record<SectionId, SectionState>>;
  results: Partial<SectionResults>;
  practice: Partial<Record<PlanId, PlanProgress>>;
}

export interface Chapter {
  title: string;
  /** 1-based page number. */
  page: number;
}

/** Heavy source material, kept apart so listing books stays cheap. */
export interface BookSource {
  bookId: string;
  pages: string[];
  chapters: Chapter[];
  pdf?: Blob;
  /** Condensed notes for models that can't read the whole book at once. */
  notes?: { key: string; text: string };
}

class BooksDatabase extends Dexie {
  books!: Table<BookRecord, string>;
  sources!: Table<BookSource, string>;

  constructor() {
    super('pog-books');
    this.version(1).stores({ books: 'id, addedAt', sources: 'bookId' });
  }
}

export const booksDb = new BooksDatabase();

export async function updateBook(id: string, patch: (book: BookRecord) => void): Promise<void> {
  await booksDb.transaction('rw', booksDb.books, async () => {
    const book = await booksDb.books.get(id);
    if (!book) return;
    patch(book);
    book.updatedAt = Date.now();
    await booksDb.books.put(book);
  });
}

export async function deleteBook(id: string): Promise<void> {
  await booksDb.transaction('rw', booksDb.books, booksDb.sources, async () => {
    await booksDb.books.delete(id);
    await booksDb.sources.delete(id);
  });
}
