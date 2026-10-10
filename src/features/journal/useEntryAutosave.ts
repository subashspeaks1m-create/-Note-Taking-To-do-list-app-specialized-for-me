import { useCallback, useEffect, useRef, useState } from 'react';
import { JOURNAL_AUTOSAVE_MS } from '../../domain/config';
import type { ID, JournalEntry } from '../../domain/models';
import { ConflictError, type EntryContent } from '../../storage/repo';
import { useRepo } from '../../storage/StorageProvider';
import { requestPersistenceOnce } from '../../storage/persistence';

export type SaveStatus =
  | { kind: 'saved'; at: string }
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string }
  | { kind: 'conflict'; theirs: JournalEntry };

const DRAFT_PREFIX = 'pog.draft.v1.';

interface StoredDraft {
  content: EntryContent;
  baseRevision: number;
  at: string;
}

export function contentOf(entry: JournalEntry): EntryContent {
  return {
    title: entry.title,
    kind: entry.kind,
    doc: entry.doc,
    plainText: entry.plainText,
    happenedAt: entry.happenedAt,
    taskIds: entry.taskIds,
    tags: entry.tags,
  };
}

/** Local crash copy: written synchronously on every change, removed once the database has it. */
export function readDraft(id: ID): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_PREFIX + id);
    return raw ? (JSON.parse(raw) as StoredDraft) : null;
  } catch {
    return null;
  }
}

function writeDraft(id: ID, draft: StoredDraft): void {
  try {
    window.localStorage.setItem(DRAFT_PREFIX + id, JSON.stringify(draft));
  } catch {
    // The in-memory draft still exists; the database save path reports real failures.
  }
}

export function clearDraft(id: ID): void {
  try {
    window.localStorage.removeItem(DRAFT_PREFIX + id);
  } catch {
    // ignore
  }
}

/**
 * Autosave for one journal entry. Edits are debounced (600 ms), saves are
 * serialized, and "Saved" is shown only after IndexedDB commits. A failed or
 * conflicting save keeps the draft in memory and in a local crash copy.
 */
export function useEntryAutosave(entry: JournalEntry) {
  const repo = useRepo();
  const id = entry.id;
  const content = useRef<EntryContent>(contentOf(entry));
  const baseRevision = useRef(entry.revision);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | null>(null);
  const [status, setStatus] = useState<SaveStatus>({ kind: 'saved', at: entry.updatedAt });
  const [resetKey, setResetKey] = useState(0);
  const [resetDoc, setResetDoc] = useState(entry.doc);
  const mounted = useRef(true);
  // Lets a finished save schedule the next one without referring to itself.
  const saveRef = useRef<() => Promise<void>>(async () => {});

  const safeSet = useCallback((s: SaveStatus) => {
    if (mounted.current) setStatus(s);
  }, []);

  const saveNow = useCallback(async (): Promise<void> => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (inFlight.current) {
      await inFlight.current;
      if (!dirty.current) return;
    }
    if (!dirty.current) return;
    const snapshot = content.current;
    dirty.current = false;
    safeSet({ kind: 'saving' });
    const run = (async () => {
      try {
        const saved = await repo.saveEntry(id, snapshot, baseRevision.current);
        baseRevision.current = saved.revision;
        if (!dirty.current) {
          clearDraft(id);
          safeSet({ kind: 'saved', at: saved.updatedAt });
        }
        void requestPersistenceOnce(repo);
      } catch (e) {
        dirty.current = true;
        if (e instanceof ConflictError) safeSet({ kind: 'conflict', theirs: e.current });
        else safeSet({ kind: 'error', message: (e as Error).message || 'The browser refused to save.' });
      }
    })();
    inFlight.current = run;
    await run;
    inFlight.current = null;
    // Edits that arrived during the save get their own save.
    if (dirty.current && mounted.current && timer.current === null) {
      timer.current = window.setTimeout(() => void saveRef.current(), JOURNAL_AUTOSAVE_MS);
    }
  }, [repo, id, safeSet]);

  useEffect(() => {
    saveRef.current = saveNow;
  }, [saveNow]);

  const update = useCallback(
    (patch: Partial<EntryContent>) => {
      content.current = { ...content.current, ...patch };
      dirty.current = true;
      writeDraft(id, { content: content.current, baseRevision: baseRevision.current, at: new Date().toISOString() });
      setStatus((s) => (s.kind === 'conflict' || s.kind === 'error' ? s : { kind: 'pending' }));
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void saveNow(), JOURNAL_AUTOSAVE_MS);
    },
    [id, saveNow],
  );

  /** Replace the editor's content (restore, recovery, other tab). */
  const replaceContent = useCallback((next: EntryContent, markDirty: boolean) => {
    content.current = next;
    setResetDoc(next.doc);
    setResetKey((k) => k + 1);
    if (markDirty) {
      dirty.current = true;
      writeDraft(id, { content: next, baseRevision: baseRevision.current, at: new Date().toISOString() });
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void saveNow(), JOURNAL_AUTOSAVE_MS);
    }
  }, [id, saveNow]);

  /** Another tab or a restore changed the stored entry while nothing local is pending. */
  useEffect(() => {
    if (entry.revision <= baseRevision.current) return;
    if (dirty.current || inFlight.current) return; // a later save will surface the conflict
    baseRevision.current = entry.revision;
    const incoming = contentOf(entry);
    const changedText = JSON.stringify(incoming.doc) !== JSON.stringify(content.current.doc);
    content.current = incoming;
    if (changedText) {
      setResetDoc(incoming.doc);
      setResetKey((k) => k + 1);
    }
    setStatus({ kind: 'saved', at: entry.updatedAt });
  }, [entry]);

  const keepMine = useCallback(async () => {
    try {
      const saved = await repo.saveEntryOverConflict(id, content.current);
      baseRevision.current = saved.revision;
      dirty.current = false;
      clearDraft(id);
      safeSet({ kind: 'saved', at: saved.updatedAt });
    } catch (e) {
      safeSet({ kind: 'error', message: (e as Error).message });
    }
  }, [repo, id, safeSet]);

  const acceptTheirs = useCallback(
    async (theirs: JournalEntry) => {
      // Our text goes into history first, so choosing the other version loses nothing.
      await repo.stashRevision(id, content.current);
      baseRevision.current = theirs.revision;
      dirty.current = false;
      clearDraft(id);
      replaceContent(contentOf(theirs), false);
      safeSet({ kind: 'saved', at: theirs.updatedAt });
    },
    [repo, id, replaceContent, safeSet],
  );

  /** Runs a metadata change (documented, pin, restore) after pending text is saved. */
  const runAfterSave = useCallback(
    async (op: () => Promise<JournalEntry>): Promise<JournalEntry> => {
      await saveNow();
      if (dirty.current) throw new Error('Save your writing first; the last save did not go through.');
      const result = await op();
      baseRevision.current = result.revision;
      content.current = contentOf(result);
      return result;
    },
    [saveNow],
  );

  // Flush on unmount (switching entry, date, tab or page) and before the page unloads.
  useEffect(() => {
    mounted.current = true;
    const onHide = () => {
      if (document.visibilityState === 'hidden' && dirty.current) void saveNow();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) {
        void saveNow();
        e.preventDefault();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (dirty.current) void saveNow();
    };
  }, [saveNow]);

  return { status, update, saveNow, keepMine, acceptTheirs, runAfterSave, replaceContent, resetKey, resetDoc, current: content };
}
