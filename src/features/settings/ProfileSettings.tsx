import { useMemo, useState, type FormEvent } from 'react';
import { useToast } from '../../components/Toasts';
import { useProfile, useRepo } from '../../storage/StorageProvider';

function zones(current: string): string[] {
  let list: string[] = [];
  try {
    list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    list = [];
  }
  return list.includes(current) ? list : [current, ...list];
}

/** Name, time zone and week start, saved to the profile record. */
export function ProfileSettings() {
  const profile = useProfile();
  const repo = useRepo();
  const toast = useToast();
  const [name, setName] = useState(profile.displayName);
  const zoneList = useMemo(() => zones(profile.timeZone), [profile.timeZone]);

  const save = async (patch: Parameters<typeof repo.updateProfile>[0], message: string) => {
    try {
      await repo.updateProfile(patch);
      toast({ message, tone: 'success' });
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    }
  };

  const submitName = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && name.trim() !== profile.displayName) void save({ displayName: name }, 'Name saved');
  };

  return (
    <section className="settings-group" aria-labelledby="sg-profile">
      <h2 id="sg-profile" className="settings-group__title">
        Profile
      </h2>
      <form className="setting" onSubmit={submitName}>
        <label className="setting__label" htmlFor="set-name">
          Name
        </label>
        <div className="setting__inline">
          <input id="set-name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={submitName} />
        </div>
      </form>
      <div className="setting">
        <label className="setting__label" htmlFor="set-zone">
          Time zone
          <span className="setting__help">Decides when your day starts. Days you already logged keep their dates.</span>
        </label>
        <select id="set-zone" className="input setting__select" value={profile.timeZone} onChange={(e) => void save({ timeZone: e.target.value }, `Time zone set to ${e.target.value}`)}>
          {zoneList.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>
      <div className="setting">
        <span className="setting__label" id="set-week">
          Week starts on
        </span>
        <div className="segmented" role="group" aria-labelledby="set-week">
          {(['monday', 'sunday'] as const).map((w) => (
            <button key={w} type="button" className="segmented__btn" aria-pressed={profile.weekStart === w} onClick={() => void save({ weekStart: w }, 'Week start saved')}>
              {w === 'monday' ? 'Monday' : 'Sunday'}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
