import { useRouteError } from 'react-router-dom';
import { EmptyState } from '../components/Page';

/**
 * Shown if a screen crashes. Saved data lives in IndexedDB and unsaved journal
 * text has a local crash copy, so a reload recovers everything.
 */
export function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="page page--narrow">
      <EmptyState
        icon="orbit"
        title="Something broke on this screen."
        body="Your saved tasks and entries are safe. Any text you were writing is kept on this device and will be offered back when you reopen the entry."
      >
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          Reload the app
        </button>
        <p className="field__note">Details: {message}</p>
      </EmptyState>
    </div>
  );
}
