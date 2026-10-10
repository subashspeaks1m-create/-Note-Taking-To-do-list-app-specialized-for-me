import { useDisplayPrefs, type DisplayPrefs } from '../../app/displayPrefs';
import { PageHeader, StageNote } from '../../components/Page';
import { APP_NAME, PROFILE_DEFAULTS } from '../../domain/config';

function Choice<K extends keyof DisplayPrefs>({ label, prefKey, options }: { label: string; prefKey: K; options: { value: DisplayPrefs[K]; label: string }[] }) {
  const { prefs, setPref } = useDisplayPrefs();
  return (
    <div className="setting">
      <span className="setting__label" id={`setting-${String(prefKey)}`}>
        {label}
      </span>
      <div className="segmented" role="group" aria-labelledby={`setting-${String(prefKey)}`}>
        {options.map((o) => (
          <button key={String(o.value)} type="button" className="segmented__btn" aria-pressed={prefs[prefKey] === o.value} onClick={() => setPref(prefKey, o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="page page--narrow">
      <PageHeader overline={APP_NAME} title="Settings" />

      <section className="settings-group" aria-labelledby="sg-profile">
        <h2 id="sg-profile" className="settings-group__title">
          Profile
        </h2>
        <div className="setting">
          <span className="setting__label">Name</span>
          <span className="setting__value">{PROFILE_DEFAULTS.displayName}</span>
        </div>
        <div className="setting">
          <span className="setting__label">Time zone</span>
          <span className="setting__value">{PROFILE_DEFAULTS.timeZone}</span>
        </div>
        <div className="setting">
          <span className="setting__label">Week starts on</span>
          <span className="setting__value">Monday</span>
        </div>
      </section>

      <section className="settings-group" aria-labelledby="sg-display">
        <h2 id="sg-display" className="settings-group__title">
          Display
        </h2>
        <Choice label="Density" prefKey="density" options={[{ value: 'spacious', label: 'Spacious' }, { value: 'compact', label: 'Compact' }]} />
        <Choice label="Motion" prefKey="motion" options={[{ value: 'system', label: 'Match device' }, { value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }]} />
        <Choice label="Character playback" prefKey="avatarPlayback" options={[{ value: 'auto', label: 'Animated' }, { value: 'still', label: 'Still image' }]} />
        <Choice label="Graphics" prefKey="lowGraphics" options={[{ value: false, label: 'Full' }, { value: true, label: 'Low' }]} />
      </section>

      <StageNote stage={6}>Profile editing, sound, sprint dates, backup and restore, storage status and reset arrive in stage 6.</StageNote>
    </div>
  );
}
