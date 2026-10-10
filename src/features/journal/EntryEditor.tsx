import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Menu } from '../../components/Menu';
import { useToast } from '../../components/Toasts';
import { formatTimeInZone, minutesInZone, minutesToHHMM, zonedTimeToInstant } from '../../date/localDate';
import type { EntryKind, JournalEntry, Task } from '../../domain/models';
import { useRepo } from '../../storage/StorageProvider';
import { DocView } from './DocView';
import { EntryHistory } from './EntryHistory';
import { ENTRY_KINDS, kindMeta } from './entryKinds';
import { clearDraft, contentOf, readDraft, useEntryAutosave, type SaveStatus } from './useEntryAutosave';

const RichEditor = lazy(() => import('./RichEditor'));

interface Props {
  entry: JournalEntry;
  dayTasks: Task[];
  timeZone: string;
  onClose: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}

function StatusLine({ status, timeZone, onRetry }: { status: SaveStatus; timeZone: string; onRetry: () => void }) {
  switch (status.kind) {
    case 'saved':
      return <span className="save save--ok">Saved at {formatTimeInZone(new Date(status.at), timeZone)}</span>;
    case 'pending':
    case 'saving':
      return <span className="save save--busy">Saving…</span>;
    case 'error':
      return (
        <span className="save save--error" role="alert">
          Save failed. Your text is still here and kept on this device.{' '}
          <button type="button" className="link-btn" onClick={onRetry}>
            Try again
          </button>
        </span>
      );
    case 'conflict':
      return (
        <span className="save save--error" role="alert">
          Not saved: changed in another tab
        </span>
      );
  }
}

export function EntryEditor({ entry, dayTasks, timeZone, onClose, expanded, onToggleExpanded }: Props) {
  const repo = useRepo();
  const toast = useToast();
  const autosave = useEntryAutosave(entry);
  const { status, update, saveNow } = autosave;
  const [kind, setKind] = useState<EntryKind>(entry.kind);
  const [title, setTitle] = useState(entry.title);
  const [taskIds, setTaskIds] = useState(entry.taskIds);
  const [time, setTime] = useState(() => minutesToHHMM(minutesInZone(new Date(entry.happenedAt), timeZone)));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [promptHidden, setPromptHidden] = useState(() => {
    try {
      return window.localStorage.getItem('pog.prompts.hidden') === '1';
    } catch {
      return false;
    }
  });
  const [recovery, setRecovery] = useState(() => {
    const draft = readDraft(entry.id);
    if (!draft) return null;
    const same = draft.content.plainText === entry.plainText && draft.content.title === entry.title;
    if (same) {
      clearDraft(entry.id);
      return null;
    }
    return draft;
  });

  const meta = kindMeta(kind);
  const linked = useMemo(() => dayTasks.filter((t) => taskIds.includes(t.id)), [dayTasks, taskIds]);
  const missingLinks = taskIds.length - linked.length;
  const linkable = dayTasks.filter((t) => !taskIds.includes(t.id));

  // Ctrl/Cmd+S saves immediately.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveNow();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [saveNow]);

  const [plain, setPlain] = useState(entry.plainText);
  const onEditorChange = useCallback(
    (c: { doc: JournalEntry['doc']; plainText: string }) => {
      setPlain(c.plainText);
      update(c);
    },
    [update, setPlain],
  );

  const setDocumented = async (on: boolean) => {
    try {
      await autosave.runAfterSave(() => repo.setDocumented(entry.id, on));
      toast({
        message: on ? 'Marked documented' : 'Documented mark removed',
        tone: on ? 'gold' : 'neutral',
      });
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    }
  };

  const remove = async () => {
    try {
      await saveNow();
      await repo.deleteEntry(entry.id);
      clearDraft(entry.id);
      onClose();
      toast({ message: 'Entry deleted', action: { label: 'Undo', run: () => repo.restoreEntry(entry.id) } });
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    }
  };

  const documented = !!entry.documentedAt;

  return (
    <article className={`entry entry--editing entry--${kind}`} aria-label={`${meta.label} entry`}>
      {recovery && (
        <div className="notice notice--warn" role="status">
          <span>Unsaved text from {formatTimeInZone(new Date(recovery.at), timeZone)} was found on this device.</span>
          <div className="notice__actions">
            <button
              type="button"
              className="btn btn--quiet btn--sm"
              onClick={() => {
                autosave.replaceContent({ ...contentOf(entry), ...recovery.content }, true);
                setPlain(recovery.content.plainText);
                setTitle(recovery.content.title);
                setKind(recovery.content.kind);
                setTaskIds(recovery.content.taskIds);
                setRecovery(null);
              }}
            >
              Restore it
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                clearDraft(entry.id);
                setRecovery(null);
              }}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {status.kind === 'conflict' && (
        <div className="notice notice--warn" role="alert">
          <span>This entry was changed in another tab or window. Choose which version to keep. The other one stays in this entry's history.</span>
          <div className="notice__actions">
            <button type="button" className="btn btn--quiet btn--sm" onClick={() => void autosave.keepMine()}>
              Keep mine
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={async () => {
                const theirs = status.theirs;
                await autosave.acceptTheirs(theirs);
                setTitle(theirs.title);
                setKind(theirs.kind);
                setTaskIds(theirs.taskIds);
                setPlain(theirs.plainText);
              }}
            >
              Use the other version
            </button>
          </div>
        </div>
      )}

      <div className="entry__bar">
        <div className="segmented segmented--kinds" role="group" aria-label="Entry type">
          {ENTRY_KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              className={`segmented__btn segmented__btn--${k.tone}`}
              aria-pressed={kind === k.kind}
              onClick={() => {
                setKind(k.kind);
                update({ kind: k.kind });
              }}
            >
              <Icon name={k.icon} size={14} />
              {k.short}
            </button>
          ))}
        </div>
        <div className="entry__bar-right">
          <label className="entry__time">
            <span className="visually-hidden">When this happened</span>
            <input
              id={`time-${entry.id}`}
              type="time"
              className="input input--sm"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                const [h, m] = e.target.value.split(':').map(Number);
                if (Number.isFinite(h) && Number.isFinite(m)) update({ happenedAt: zonedTimeToInstant(entry.dateKey, h! * 60 + m!, timeZone).toISOString() });
              }}
            />
          </label>
          <button type="button" className="icon-btn icon-btn--sm" aria-pressed={expanded} aria-label={expanded ? 'Exit writing mode' : 'Expand writing mode'} title={expanded ? 'Exit writing mode' : 'Writing mode'} onClick={onToggleExpanded}>
            <Icon name={expanded ? 'collapse' : 'expand'} size={18} />
          </button>
          <Menu
            label="Entry actions"
            trigger={<Icon name="more" size={18} />}
            items={[
              { label: entry.pinned ? 'Unpin' : 'Pin entry', onSelect: () => void autosave.runAfterSave(() => repo.updateEntryMeta(entry.id, { pinned: !entry.pinned })) },
              { label: 'Version history…', onSelect: () => setHistoryOpen(true) },
              'separator',
              { label: 'Delete entry', tone: 'danger', onSelect: () => void remove() },
            ]}
          />
        </div>
      </div>

      <label className="visually-hidden" htmlFor={`title-${entry.id}`}>
        Entry title (optional)
      </label>
      <input
        id={`title-${entry.id}`}
        className="entry__title-input"
        value={title}
        maxLength={160}
        placeholder={meta.titlePlaceholder}
        onChange={(e) => {
          setTitle(e.target.value);
          update({ title: e.target.value });
        }}
      />

      {(linked.length > 0 || missingLinks > 0 || linkable.length > 0) && (
        <div className="entry__links">
          {linked.map((t) => (
            <span key={t.id} className={`link-chip link-chip--${t.category}`}>
              <span aria-hidden="true">↗</span> {t.title}
              <button
                type="button"
                className="link-chip__x"
                aria-label={`Unlink ${t.title}`}
                onClick={() => {
                  const next = taskIds.filter((x) => x !== t.id);
                  setTaskIds(next);
                  update({ taskIds: next });
                }}
              >
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
          {missingLinks > 0 && <span className="link-chip">+{missingLinks} task{missingLinks > 1 ? 's' : ''} from other days</span>}
          {linkable.length > 0 && (
            <label className="link-add">
              <span className="visually-hidden">Link a task</span>
              <select
                id={`link-${entry.id}`}
                className="input input--sm"
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  const next = [...taskIds, e.target.value];
                  setTaskIds(next);
                  update({ taskIds: next });
                }}
              >
                <option value="">+ Link a task</option>
                {linkable.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {!promptHidden && (
        <p className="entry__prompt">
          <span>{meta.prompt}</span>
          <button
            type="button"
            className="link-btn link-btn--quiet"
            onClick={() => {
              setPromptHidden(true);
              try {
                window.localStorage.setItem('pog.prompts.hidden', '1');
              } catch {
                // ignore
              }
            }}
          >
            Hide prompts
          </button>
        </p>
      )}

      <Suspense fallback={<DocView doc={entry.doc} className="prose--loading" />}>
        <RichEditor
          initial={entry.doc}
          placeholder={meta.placeholder}
          label={`${meta.label}, ${title || 'untitled'}`}
          onChange={onEditorChange}
          resetKey={autosave.resetKey}
          resetDoc={autosave.resetDoc}
          autoFocus
        />
      </Suspense>

      <footer className="entry__foot">
        <label className={`documented ${documented ? 'is-on' : ''}`}>
          <input type="checkbox" checked={documented} onChange={(e) => void setDocumented(e.target.checked)} disabled={!plain.trim() && !documented} />
          <span className="documented__box" aria-hidden="true">
            {documented && <Icon name="check" size={13} />}
          </span>
          <span>
            Documented
            <span className="documented__hint">{plain.trim() ? (linked.length ? ' · counts as written evidence for the linked task' : ' · counts as written evidence') : ' · write something first'}</span>
          </span>
        </label>
        <div className="entry__foot-right">
          <StatusLine status={status} timeZone={timeZone} onRetry={() => void saveNow()} />
          <span className="entry__words tabular" aria-hidden="true">
            {plain.trim() ? plain.trim().split(/\s+/).length : 0} words
          </span>
          <button
            type="button"
            className="btn btn--quiet btn--sm"
            onClick={async () => {
              await saveNow();
              onClose();
            }}
          >
            Done
          </button>
        </div>
      </footer>

      {historyOpen && (
        <EntryHistory
          entryId={entry.id}
          timeZone={timeZone}
          onClose={() => setHistoryOpen(false)}
          onRestore={async (revisionId) => {
            const restored = await autosave.runAfterSave(() => repo.restoreRevision(entry.id, revisionId));
            autosave.replaceContent(contentOf(restored), false);
            setPlain(restored.plainText);
            setTitle(restored.title);
            setKind(restored.kind);
            setHistoryOpen(false);
            toast({ message: 'Earlier version restored. The version you replaced is in history.', tone: 'success' });
          }}
        />
      )}
    </article>
  );
}
