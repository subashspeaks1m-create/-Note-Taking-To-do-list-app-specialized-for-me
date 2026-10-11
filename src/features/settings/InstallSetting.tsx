import { useInstall } from '../../app/install';
import { useToast } from '../../components/Toasts';

/** Installing puts the app on the home screen or dock, opening without browser bars, and it works offline either way. */
export function InstallSetting() {
  const { state, install } = useInstall();
  const toast = useToast();
  const help: Record<typeof state, string> = {
    installed: 'Installed. It opens like an app and works offline.',
    available: 'Add it to your home screen or dock. It works offline after the first visit.',
    ios: 'On iPhone or iPad: tap Share, then "Add to Home Screen".',
    manual: 'Use your browser menu: "Install app" or "Add to Home screen". Availability depends on the browser.',
  };
  return (
    <section className="settings-group" aria-labelledby="sg-app">
      <h2 id="sg-app" className="settings-group__title">
        App
      </h2>
      <div className="setting">
        <span className="setting__label">
          Install
          <span className="setting__help">{help[state]}</span>
        </span>
        {state === 'available' && (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => void install().then((ok) => ok && toast({ message: 'Installed. Find it on your home screen.', tone: 'success' }))}
          >
            Install app
          </button>
        )}
      </div>
    </section>
  );
}
