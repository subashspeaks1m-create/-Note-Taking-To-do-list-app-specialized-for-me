import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Icon } from '../components/Icon';

/**
 * Offline support. The service worker caches the app after the first load.
 * A new version never takes over by itself: a quiet bar offers the reload,
 * so an entry being written is never interrupted (journal text autosaves
 * within a second, and the reload waits a moment to let that finish).
 */
export function PwaUpdater() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for a new version every hour while the app stays open.
      if (registration) window.setInterval(() => void registration.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (!offlineReady) return;
    const t = window.setTimeout(() => setOfflineReady(false), 6000);
    return () => window.clearTimeout(t);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh && !offlineReady) return null;
  return (
    <div className="pwa-bar" role="status">
      <Icon name={needRefresh ? 'sparkle' : 'check'} size={16} />
      <span>{needRefresh ? 'A new version of the app is ready.' : 'Ready to work offline.'}</span>
      {needRefresh && (
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={reloading}
          onClick={() => {
            setReloading(true);
            (document.activeElement as HTMLElement | null)?.blur();
            window.setTimeout(() => void updateServiceWorker(true), 900);
          }}
        >
          {reloading ? 'Saving…' : 'Reload'}
        </button>
      )}
      <button type="button" className="icon-btn icon-btn--sm" aria-label="Dismiss" onClick={() => (needRefresh ? setNeedRefresh(false) : setOfflineReady(false))}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
