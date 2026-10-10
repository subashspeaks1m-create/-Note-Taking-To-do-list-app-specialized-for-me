import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { formatLong, formatTimeInZone, type DateKey } from '../../date/localDate';
import type { EntryKind, ID, JournalEntry, Task } from '../../domain/models';
import type { DayRelation } from '../today/useSelectedDate';
import { DocView } from './DocView';
import { EntryEditor } from './EntryEditor';
import { ENTRY_KINDS, kindMeta } from './entryKinds';

interface Props {
  date: DateKey;
  relation: DayRelation;
  timeZone: string;
  entries: JournalEntry[] | undefined;
  dayTasks: Task[];
  activeEntryId: ID | null;
  onActivate: (id: ID | null) => void;
  onCloseEntry: (entry: JournalEntry) => void;
  onNewEntry: (kind: EntryKind) => void;
  justCompleted: Task | null;
  onWriteLog: (task: Task) => void;
  onDismissCompleted: () => void;
}

/** Right side of the workbench: a page of paragraph logs for the selected day. */
export function JournalPane({
  date, relation, timeZone, entries, dayTasks, activeEntryId, onActivate, onCloseEntry, onNewEntry, justCompleted, onWriteLog,
  onDismissCompleted,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const taskById = useMemo(() => new Map(dayTasks.map((t) => [t.id, t])), [dayTasks]);
  const list = entries ?? [];
  const active = list.find((e) => e.id === activeEntryId) ?? null;
  const showCompletedPrompt = justCompleted && !list.some((e) => e.taskIds.includes(justCompleted.id));

  return (
    <section className={`pane pane--journal ${expanded && active ? 'pane--expanded' : ''}`} aria-labelledby="journal-heading">
      <header className="pane__head">
        <h2 id="journal-heading" className="pane__title">
          What happened
        </h2>
        <span className="pane__meta tabular">{list.length === 0 ? 'No entries' : `${list.length} ${list.length === 1 ? 'entry' : 'entries'}`}</span>
      </header>

      <div className="pane__scroll journal-page">
        <div className="journal-page__head">
          <p className="journal-page__date">{formatLong(date)}</p>
          {relation !== 'today' && <p className="journal-page__belongs">Entries here belong to {formatLong(date).replace(/^\w+, /, '')}.</p>}
        </div>

        {showCompletedPrompt && (
          <div className="completed-prompt" role="status">
            <div className="completed-prompt__text">
              <span className="completed-prompt__label">
                <Icon name="check" size={14} /> Completed
              </span>
              <span className="completed-prompt__title">{justCompleted.title}</span>
            </div>
            <div className="completed-prompt__actions">
              <button type="button" className="btn btn--primary btn--sm" onClick={() => onWriteLog(justCompleted)}>
                <Icon name="pen" size={14} /> Write what happened
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={onDismissCompleted}>
                Later
              </button>
            </div>
          </div>
        )}

        {entries === undefined ? (
          <div className="skeleton-list" aria-hidden="true">
            <span />
          </div>
        ) : list.length === 0 && !active ? (
          <div className="empty empty--journal">
            <p className="empty__title empty__title--read">{relation === 'future' ? 'This page is waiting.' : 'Leave a trace of today.'}</p>
            <p className="empty__body">Write what you actually learned or did, in your own words. Each entry gets its own time, category and links.</p>
          </div>
        ) : (
          <ol className="entries">
            {list.map((e) =>
              e.id === activeEntryId ? (
                <li key={e.id}>
                  <EntryEditor
                    key={e.id}
                    entry={e}
                    dayTasks={dayTasks}
                    timeZone={timeZone}
                    expanded={expanded}
                    onToggleExpanded={() => setExpanded((v) => !v)}
                    onClose={() => {
                      setExpanded(false);
                      onCloseEntry(e);
                    }}
                  />
                </li>
              ) : (
                <li key={e.id}>
                  <EntryCard entry={e} taskById={taskById} timeZone={timeZone} onOpen={() => onActivate(e.id)} />
                </li>
              ),
            )}
          </ol>
        )}

        <div className="entry-starters-wrap">
          <p className="overline">{list.length ? 'Add another entry' : 'Start an entry'}</p>
          <ul className={`entry-starters ${list.length ? 'entry-starters--compact' : ''}`}>
            {ENTRY_KINDS.map((k) => (
              <li key={k.kind}>
                <button type="button" className={`entry-starter entry-starter--${k.kind}`} onClick={() => onNewEntry(k.kind)}>
                  <span className="entry-starter__icon">
                    <Icon name={k.icon} size={18} />
                  </span>
                  <span className="entry-starter__text">
                    <span className="entry-starter__label">{k.label}</span>
                    {!list.length && <span className="entry-starter__prompt">{k.prompt}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function EntryCard({ entry, taskById, timeZone, onOpen }: { entry: JournalEntry; taskById: Map<ID, Task>; timeZone: string; onOpen: () => void }) {
  const meta = kindMeta(entry.kind);
  const empty = !entry.plainText.trim();
  return (
    <article className={`entry entry--reading entry--${entry.kind}`}>
      <div className="entry__meta">
        <span className={`entry__kind entry__kind--${meta.tone}`}>
          <Icon name={meta.icon} size={14} /> {meta.label}
        </span>
        <span className="entry__when">{formatTimeInZone(new Date(entry.happenedAt), timeZone)}</span>
        {entry.documentedAt && <span className="entry__badge">Documented</span>}
        {entry.pinned && <span className="entry__badge entry__badge--quiet">Pinned</span>}
      </div>
      {entry.title && <h3 className="entry__title">{entry.title}</h3>}
      {entry.taskIds.length > 0 && (
        <div className="entry__links">
          {entry.taskIds.map((id) => {
            const t = taskById.get(id);
            return (
              <span key={id} className={`link-chip ${t ? `link-chip--${t.category}` : ''}`}>
                <span aria-hidden="true">↗</span> {t ? t.title : 'Task from another day'}
              </span>
            );
          })}
        </div>
      )}
      {empty ? <p className="entry__empty">Nothing written yet.</p> : <DocView doc={entry.doc} className="prose--reading" />}
      <button type="button" className="entry__edit" onClick={onOpen}>
        <Icon name="pen" size={14} /> Edit<span className="visually-hidden"> {meta.label} entry{entry.title ? `: ${entry.title}` : ''}</span>
      </button>
    </article>
  );
}
