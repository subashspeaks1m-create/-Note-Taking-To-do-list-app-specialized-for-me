import { useDisplayPrefs, type DisplayPrefs } from '../../app/displayPrefs';
import { Art } from '../../components/art/Art';
import { PageHeader } from '../../components/Page';
import { APP_NAME } from '../../domain/config';
import { CoachSettings } from './CoachSettings';
import { DataSettings } from './DataSettings';
import { InstallSetting } from './InstallSetting';
import { ProfileSettings } from './ProfileSettings';

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
      <PageHeader overline={APP_NAME} title="Settings" art="gear" artMotion="spin" />

      <ProfileSettings />

      <section className="settings-group" aria-labelledby="sg-display">
        <h2 id="sg-display" className="settings-group__title">
          Display
        </h2>
        <Choice label="Density" prefKey="density" options={[{ value: 'spacious', label: 'Spacious' }, { value: 'compact', label: 'Compact' }]} />
        <Choice label="Motion" prefKey="motion" options={[{ value: 'system', label: 'Match device' }, { value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }]} />
        <Choice label="Character playback" prefKey="avatarPlayback" options={[{ value: 'auto', label: 'Animated' }, { value: 'still', label: 'Still image' }]} />
        <Choice label="Graphics" prefKey="lowGraphics" options={[{ value: false, label: 'Full' }, { value: true, label: 'Low' }]} />
        <Choice label="Sounds" prefKey="sound" options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'Soft chimes' }]} />
      </section>

      <CoachSettings />

      <InstallSetting />

      <DataSettings />

      <section className="settings-group" aria-labelledby="sg-credits">
        <h2 id="sg-credits" className="settings-group__title">
          Art credits
        </h2>
        <div className="credits__art">
          {(['fire', 'gem-stone', 'trophy', 'crystal-ball', 'shield', 'rocket', 'party-popper', 'wrapped-gift'] as const).map((n) => (
            <Art key={n} name={n} size={30} motion="bounce" />
          ))}
        </div>
        <ul className="credits">
          <li>
            Color art: <a href="https://github.com/microsoft/fluentui-emoji">Fluent Emoji</a> by Microsoft, MIT License.
          </li>
          <li>
            Self-drawing navigation icons: <a href="https://github.com/cyberalien/line-md">Material Line Icons (line-md)</a> by Vjacheslav Trushkin, MIT License.
          </li>
          <li>Logo, task emblem, calendar levels and bursts: drawn for this app.</li>
        </ul>
      </section>

    </div>
  );
}
