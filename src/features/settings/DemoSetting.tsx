import { isDemo, setDemo } from '../../storage/demo';

/** Switches this device between real data and the fictional demo database. */
export function DemoSetting() {
  const on = isDemo();
  const flip = () => {
    setDemo(!on);
    window.location.reload();
  };
  return (
    <section className="settings-group" aria-labelledby="sg-demo">
      <h2 id="sg-demo" className="settings-group__title">
        Demo mode
      </h2>
      <div className="setting">
        <span className="setting__label">
          {on ? 'Showing fictional demo data' : 'See the app filled with fictional data'}
          <span className="setting__help">
            Demo data lives in a separate database, so it never mixes with your real tasks, journal, XP or unlocks. A banner shows while it is on.
          </span>
        </span>
        <button type="button" className={`btn btn--sm ${on ? 'btn--primary' : 'btn--quiet'}`} onClick={flip}>
          {on ? 'Back to my data' : 'Try demo mode'}
        </button>
      </div>
    </section>
  );
}
