import { useEffect, useState } from 'react';
import { useToast } from '../../components/Toasts';
import { AUTO_MODEL, askCoach, coachKey, coachModel, listFreeModels, maskKey } from '../coach/openrouter';

/**
 * The AI coach's key and model. The key is kept in this browser only: never
 * in the database, a backup or anywhere else. Only free models are offered.
 */
export function CoachSettings() {
  const toast = useToast();
  const [saved, setSaved] = useState(() => coachKey.get());
  const [draft, setDraft] = useState('');
  const [model, setModel] = useState(() => coachModel.get());
  const [models, setModels] = useState<{ id: string; name: string }[] | null>(null);
  const [busy, setBusy] = useState<'test' | 'models' | null>(null);

  useEffect(() => {
    if (!saved || models) return;
    const ctl = new AbortController();
    listFreeModels(ctl.signal)
      .then(setModels)
      .catch(() => undefined);
    return () => ctl.abort();
  }, [saved, models]);

  const save = () => {
    const k = draft.trim();
    if (!/^sk-or-/.test(k)) {
      toast({ message: 'That does not look like an OpenRouter key (it starts with "sk-or-").', tone: 'error' });
      return;
    }
    coachKey.set(k);
    setSaved(k);
    setDraft('');
    toast({ message: 'Key saved in this browser only', tone: 'success' });
  };

  const remove = () => {
    coachKey.clear();
    setSaved('');
    toast({ message: 'Key removed from this browser', tone: 'success' });
  };

  const choose = (m: string) => {
    coachModel.set(m);
    setModel(m);
  };

  const test = async () => {
    setBusy('test');
    try {
      const r = await askCoach(saved, model, [{ role: 'user', content: 'Reply with the single word: ready' }], { available: models?.map((m) => m.id) });
      toast({ message: `Connected. ${r.model} answered.`, tone: 'success' });
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const loadModels = async () => {
    setBusy('models');
    try {
      setModels(await listFreeModels());
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="settings-group" aria-labelledby="sg-coach">
      <h2 id="sg-coach" className="settings-group__title">
        AI coach
      </h2>
      <p className="settings-group__lede">
        Writes coach's notes on your weekly and monthly reports through your own OpenRouter key, using free models only. It reads everything in that period, journal text included, and sends it to OpenRouter and the model's provider when you ask for notes.
      </p>

      {saved ? (
        <div className="setting">
          <span className="setting__label">
            OpenRouter key
            <span className="setting__help">
              <span className="tabular">{maskKey(saved)}</span> · stored in this browser only, never in backups
            </span>
          </span>
          <div className="setting__actions">
            <button type="button" className="btn btn--quiet btn--sm" onClick={() => void test()} disabled={busy !== null}>
              {busy === 'test' ? 'Testing…' : 'Test'}
            </button>
            <button type="button" className="btn btn--quiet btn--sm" onClick={remove}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <form
          className="setting setting--stack"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="setting__label" htmlFor="coach-key">
            OpenRouter key
            <span className="setting__help">Paste it here, not in any chat. It stays in this browser and is not included in backups.</span>
          </label>
          <div className="setting__inline">
            <input
              id="coach-key"
              className="input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-or-…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="btn btn--primary btn--sm" disabled={!draft.trim()}>
              Save key
            </button>
          </div>
        </form>
      )}

      <div className="setting">
        <label className="setting__label" htmlFor="coach-model">
          Model
          <span className="setting__help">Best free model tries a few in turn when one is busy.</span>
        </label>
        <div className="setting__actions">
          <select id="coach-model" className="input setting__select" value={model} onChange={(e) => choose(e.target.value)}>
            <option value={AUTO_MODEL}>Best free model</option>
            {model !== AUTO_MODEL && !models?.some((m) => m.id === model) && <option value={model}>{model}</option>}
            {models?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {!models && (
            <button type="button" className="btn btn--quiet btn--sm" onClick={() => void loadModels()} disabled={busy !== null}>
              {busy === 'models' ? 'Loading…' : 'List free models'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
