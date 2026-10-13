import { formatTimeInZone } from '../date/localDate';
import { useCloudStatus, useProfile, useStorage } from '../storage/StorageProvider';

/**
 * Inside claude.ai: a quiet line saying every change is saved to your account,
 * or a clear warning when it can't be, so nothing is lost without you knowing.
 */
export function CloudNote() {
  const status = useCloudStatus();
  const { timeZone } = useProfile();
  const { memoryOnly } = useStorage();
  if (status.state === 'off') return null;
  if (memoryOnly && (status.state === 'unavailable' || status.state === 'error')) {
    return (
      <div className="cloud-warn" role="alert">
        <strong>Not saved yet</strong>
        <span>This browser won't let the app store anything on this device, and your account can't be reached right now. Keep this page open until it says saved, or reload to try again.</span>
      </div>
    );
  }
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
