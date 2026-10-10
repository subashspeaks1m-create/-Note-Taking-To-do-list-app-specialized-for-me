import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { dateKeyInZone, formatShort, formatTimeInZone } from '../../date/localDate';
import type { ID } from '../../domain/models';
import { useRepo } from '../../storage/StorageProvider';
import { DocView } from './DocView';

const CAUSE: Record<string, string> = {
  checkpoint: 'Autosave',
  'before-delete': 'Before delete',
  'before-restore': 'Before restore',
  conflict: 'Other version',
};

interface Props {
  entryId: ID;
  timeZone: string;
  onClose: () => void;
  onRestore: (revisionId: ID) => Promise<void>;
}

export function EntryHistory({ entryId, timeZone, onClose, onRestore }: Props) {
  const repo = useRepo();
  const revisions = useLiveQuery(() => repo.entryRevisions(entryId), [repo, entryId]);
  const [selected, setSelected] = useState<ID | null>(null);
  const [busy, setBusy] = useState(false);
  const current = revisions?.find((r) => r.id === selected) ?? revisions?.[0];

  return (
    <Dialog
      open
      onClose={onClose}
      title="Version history"
      description="Saved versions of this entry on this device. Restoring keeps the current text in history too."
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!current || busy}
            onClick={async () => {
              if (!current) return;
              setBusy(true);
              try {
                await onRestore(current.id);
              } finally {
                setBusy(false);
              }
            }}
          >
            Restore this version
          </button>
        </>
      }
    >
      {revisions && revisions.length === 0 ? (
        <p className="empty__body">No earlier versions yet. Versions are kept as you write, about every five minutes.</p>
      ) : (
        <div className="history">
          <ul className="history__list" aria-label="Versions">
            {revisions?.map((r) => {
              const at = new Date(r.savedAt);
              return (
                <li key={r.id}>
                  <button type="button" className="history__item" aria-pressed={current?.id === r.id} onClick={() => setSelected(r.id)}>
                    <span className="history__when">
                      {formatShort(dateKeyInZone(at, timeZone))} · {formatTimeInZone(at, timeZone)}
                    </span>
                    <span className="history__cause">{CAUSE[r.cause] ?? r.cause}</span>
                    <span className="history__words tabular">{r.plainText.trim() ? r.plainText.trim().split(/\s+/).length : 0} words</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="history__preview">{current && <DocView doc={current.doc} />}</div>
        </div>
      )}
    </Dialog>
  );
}
