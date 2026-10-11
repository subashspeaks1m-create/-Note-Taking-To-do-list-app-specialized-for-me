import { useEffect, useRef } from 'react';

/**
 * Shown in an edit form when the same record was saved from another tab or
 * window meanwhile. Nothing is overwritten until the person chooses.
 */
export function StaleNotice({ what, onKeepTheirs, onKeepMine }: { what: 'task' | 'goal'; onKeepTheirs: () => void; onKeepMine: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // The form can be long; bring the choice into view instead of leaving it below the fold.
  useEffect(() => ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), []);
  return (
    <div ref={ref} className="stale" role="alert">
      <p>
        This {what} was changed in another tab or window while you were editing. Your edits are still in this form.
      </p>
      <div className="stale__actions">
        <button type="button" className="btn btn--quiet btn--sm" onClick={onKeepTheirs}>
          Discard mine, keep the other version
        </button>
        <button type="button" className="btn btn--primary btn--sm" onClick={onKeepMine}>
          Use mine (then press Save)
        </button>
      </div>
    </div>
  );
}
