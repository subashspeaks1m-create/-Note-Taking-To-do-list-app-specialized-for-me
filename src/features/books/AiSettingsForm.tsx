import { useState } from 'react';
import { MODELS, setAiSettings, useAiSettings, type Depth } from './aiSettings';
import { describeError, testApiKey } from './claude';

export function AiSettingsForm({ compact = false }: { compact?: boolean }) {
  const settings = useAiSettings();
  const [draft, setDraft] = useState(settings.apiKey);
  const [reveal, setReveal] = useState(false);
  const [check, setCheck] = useState<{ state: 'idle' | 'checking' | 'ok' | 'error'; message?: string }>({ state: 'idle' });

  const save = async () => {
    const key = draft.trim();
    setAiSettings({ apiKey: key });
    if (!key) {
      setCheck({ state: 'idle' });
      return;
    }
    setCheck({ state: 'checking' });
    try {
      await testApiKey(key, settings.model);
      setCheck({ state: 'ok', message: 'Key saved and working.' });
    } catch (error) {
      setCheck({ state: 'error', message: describeError(error) });
    }
  };

  return (
    <div className="ai-form">
      <div className="ai-form__row">
        <label className="field">
          <span className="field__label">Claude API key</span>
          <span className="ai-form__key">
            <input
              type={reveal ? 'text' : 'password'}
              value={draft}
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void save()}
            />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReveal((v) => !v)}>
              {reveal ? 'Hide' : 'Show'}
            </button>
          </span>
        </label>
        <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={check.state === 'checking' || draft.trim() === settings.apiKey && check.state === 'ok'}>
          {check.state === 'checking' ? 'Checking…' : 'Save key'}
        </button>
      </div>
      {check.message && (
        <p className={`ai-form__status ai-form__status--${check.state}`} role="status">
          {check.message}
        </p>
      )}
      <p className="field__hint">
        Stored only in this browser. Requests go straight from here to Anthropic. Get a key at{' '}
        <a className="link-btn" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
          console.anthropic.com
        </a>
        .
      </p>

      {!compact && (
        <>
          <div className="setting">
            <span className="setting__label" id="ai-model">
              Model
            </span>
            <div className="segmented" role="group" aria-labelledby="ai-model">
              {MODELS.map((m) => (
                <button key={m.id} type="button" className="segmented__btn" aria-pressed={settings.model === m.id} title={m.blurb} onClick={() => setAiSettings({ model: m.id })}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <p className="field__hint">{MODELS.find((m) => m.id === settings.model)?.blurb}</p>
          <div className="setting">
            <span className="setting__label" id="ai-depth">
              Analysis depth
            </span>
            <div className="segmented" role="group" aria-labelledby="ai-depth">
              {(
                [
                  ['high', 'Deep'],
                  ['medium', 'Standard'],
                ] as [Depth, string][]
              ).map(([value, label]) => (
                <button key={value} type="button" className="segmented__btn" aria-pressed={settings.depth === value} onClick={() => setAiSettings({ depth: value })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
