import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { isDateKey, formatMedium, type DateKey } from '../../date/localDate';
import type { Category } from '../../domain/config';
import { parseBulkLines } from '../../domain/tasks';

interface Props {
  text: string;
  defaultCategory: Category;
  defaultDate: DateKey;
  onCancel: () => void;
  onConfirm: (titles: string[], category: Category, date: DateKey) => Promise<void>;
}

/** Preview for multi-line paste: one task per nonblank line, confirmed before anything is saved. */
export function BulkPasteDialog({ text, defaultCategory, defaultDate, onCancel, onConfirm }: Props) {
  const [draft, setDraft] = useState(text);
  const [category, setCategory] = useState<Category>(defaultCategory);
  const [date, setDate] = useState<DateKey>(defaultDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lines = parseBulkLines(draft);
  const valid = lines.filter((l) => !l.error);
  const invalid = lines.filter((l) => l.error);

  return (
    <Dialog
      open
      onClose={onCancel}
      title="Add several tasks"
      description="Each nonblank line becomes one task. Blank lines are ignored."
      size="md"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || valid.length === 0 || invalid.length > 0}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm(valid.map((l) => l.title), category, date);
              } catch (e) {
                setError((e as Error).message || 'Could not save these tasks.');
                setBusy(false);
              }
            }}
          >
            {busy ? 'Adding…' : `Add ${valid.length} ${valid.length === 1 ? 'task' : 'tasks'}`}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field field--full">
          <span className="field__label">Lines</span>
          <textarea id="bulk-lines" className="input input--area" rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} />
        </label>
        <div className="field">
          <span className="field__label" id="bulk-cat">
            Category for all
          </span>
          <div className="segmented" role="group" aria-labelledby="bulk-cat">
            <button type="button" className="segmented__btn segmented__btn--learning" aria-pressed={category === 'learning'} onClick={() => setCategory('learning')}>
              Learning
            </button>
            <button type="button" className="segmented__btn segmented__btn--doing" aria-pressed={category === 'doing'} onClick={() => setCategory('doing')}>
              Doing
            </button>
          </div>
        </div>
        <label className="field">
          <span className="field__label">Day</span>
          <input id="bulk-date" className="input" type="date" value={date} onChange={(e) => isDateKey(e.target.value) && setDate(e.target.value)} />
        </label>
      </div>

      <div className="bulk-preview" aria-live="polite">
        <p className="bulk-preview__summary">
          {valid.length} {valid.length === 1 ? 'task' : 'tasks'} for {formatMedium(date)}
          {invalid.length > 0 && <span className="text-error"> · {invalid.length} to fix</span>}
        </p>
        <ol className="bulk-preview__list">
          {lines.map((l) => (
            <li key={l.line} className={l.error ? 'is-error' : ''}>
              <span className={`bulk-preview__dot bulk-preview__dot--${category}`} aria-hidden="true" />
              <span className="bulk-preview__title">{l.title || '(empty)'}</span>
              {l.error && <span className="bulk-preview__err">Line {l.line}: {l.error}</span>}
            </li>
          ))}
        </ol>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error} Nothing was added; your lines are still here.
        </p>
      )}
    </Dialog>
  );
}
