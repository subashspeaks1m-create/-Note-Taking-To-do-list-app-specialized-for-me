import { formatTimeInZone } from '../date/localDate';
import { useCloudStatus, useProfile } from '../storage/StorageProvider';

/**
 * Inside claude.ai: a quiet line saying every change is saved to your account,
 * or a clear warning when it can't be, so nothing is lost without you knowing.
 */
export function CloudNote() {
  const status = useCloudStatus();
  const { timeZone } = useProfile();
  if (status.state === 'off') return null;
  if (status.state === 'unavailable' || status.state === 'error') {
    return (
      <div className="cloud-warn" role="alert">
        <strong>Not saved to your account</strong>
        <span>
          {status.state === 'error'
            ? status.message
            : 'This view could not reach your account, so changes are only kept in this browser. Reload the page; if this stays, download a backup in Settings.'}
        </span>
      </div>
    );
  }
  return (
    <p className={`cloud-note save ${status.state === 'saved' ? 'save--ok' : 'save--busy'}`} role="status">
      {status.state === 'saved' ? `Saved to your account · ${formatTimeInZone(new Date(status.at), timeZone)}` : 'Saving to your account…'}
    </p>
  );
}
