import { useState } from 'react';
import { MODELS, setAiSettings, useAiSettings, type Depth, type Provider } from './aiSettings';
import { describeError, testApiKey } from './claude';
import { testOpenRouterKey, useOpenRouterModels } from './openrouter';

type Check = { state: 'idle' | 'checking' | 'ok' | 'error'; message?: string };

export function AiSettingsForm({ compact = false }: { compact?: boolean }) {
  const settings = useAiSettings();
  return (
    <div className="ai-form">
      <div className="setting">
        <span className="setting__label" id="ai-provider">
          AI provider
        </span>
        <div className="segmented" role="group" aria-labelledby="ai-provider">
          {(
            [
              ['openrouter', 'OpenRouter (free models)'],
              ['anthropic', 'Claude (Anthropic)'],
            ] as [Provider, string][]
          ).map(([value, label]) => (
            <button key={value} type="button" className="segmented__btn" aria-pressed={settings.provider === value} onClick={() => setAiSettings({ provider: value })}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {settings.provider === 'openrouter' ? <OpenRouterFields compact={compact} /> : <ClaudeFields compact={compact} />}
    </div>
  );
}

function KeyField({ label, value, placeholder, onSave, check }: { label: string; value: string; placeholder: string; onSave: (key: string) => void; check: Check }) {
  const [draft, setDraft] = useState(value);
  const [reveal, setReveal] = useState(false);
  return (
    <>
      <div className="ai-form__row">
        <label className="field">
          <span className="field__label">{label}</span>
          <span className="ai-form__key">
            <input
              type={reveal ? 'text' : 'password'}
              value={draft}
              autoComplete="off"
              spellCheck={false}
              placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSave(draft.trim())}
            />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReveal((v) => !v)}>
              {reveal ? 'Hide' : 'Show'}
            </button>
          </span>
        </label>
        <button type="button" className="btn btn--primary" onClick={() => onSave(draft.trim())} disabled={check.state === 'checking'}>
          {check.state === 'checking' ? 'Checking…' : 'Save key'}
        </button>
      </div>
      {check.message && (
        <p className={`ai-form__status ai-form__status--${check.state}`} role="status">
          {check.message}
        </p>
      )}
    </>
  );
}

function OpenRouterFields({ compact }: { compact: boolean }) {
  const settings = useAiSettings();
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const { free, models, error, loading } = useOpenRouterModels();
  const best = free[0];
  const selected = settings.openrouterModel;
  const known = !selected || models.some((m) => m.id === selected);

  const save = async (key: string) => {
    setAiSettings({ openrouterKey: key });
    if (!key) return setCheck({ state: 'idle' });
    setCheck({ state: 'checking' });
    try {
      setCheck({ state: 'ok', message: await testOpenRouterKey(key) });
    } catch (e) {
      setCheck({ state: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <>
      <KeyField label="OpenRouter API key" value={settings.openrouterKey} placeholder="sk-or-v1-…" onSave={(k) => void save(k)} check={check} />
      <p className="field__hint">
        Stored only in this browser and sent only to OpenRouter. Create a key at{' '}
        <a className="link-btn" href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">
          openrouter.ai/settings/keys
        </a>
        . For free models, also allow free providers at{' '}
        <a className="link-btn" href="https://openrouter.ai/settings/privacy" target="_blank" rel="noreferrer">
          openrouter.ai/settings/privacy
        </a>
        .
      </p>
      {!compact && (
        <>
          <label className="field">
            <span className="field__label">Model</span>
            <select value={known ? selected : '__custom'} onChange={(e) => e.target.value !== '__custom' && setAiSettings({ openrouterModel: e.target.value })} disabled={loading && !models.length}>
              <option value="">{best ? `Best free model (now: ${best.name}, ${Math.round(best.context / 1000)}k context)` : 'Best free model'}</option>
              {free.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {Math.round(m.context / 1000)}k context{m.structured || m.jsonMode ? '' : ' · no JSON mode'}
                </option>
              ))}
              {!known && <option value="__custom">{selected}</option>}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Or type any OpenRouter model ID</span>
            <input
              key={selected}
              defaultValue={known ? '' : selected}
              placeholder="e.g. google/gemini-2.5-flash (paid models need credits)"
              onBlur={(e) => e.target.value.trim() && setAiSettings({ openrouterModel: e.target.value.trim() })}
            />
          </label>
          <p className="field__hint">
            {loading ? 'Loading the free model list…' : error ? `Couldn't load models: ${error}` : `${free.length} free model${free.length === 1 ? '' : 's'} available.`} Free models change often; if one fails, pick another. A bigger context reads more of the book at once.
          </p>
        </>
      )}
    </>
  );
}

function ClaudeFields({ compact }: { compact: boolean }) {
  const settings = useAiSettings();
  const [check, setCheck] = useState<Check>({ state: 'idle' });

  const save = async (key: string) => {
    setAiSettings({ apiKey: key });
    if (!key) return setCheck({ state: 'idle' });
    setCheck({ state: 'checking' });
    try {
      await testApiKey(key, settings.model);
      setCheck({ state: 'ok', message: 'Key saved and working.' });
    } catch (e) {
      setCheck({ state: 'error', message: describeError(e) });
    }
  };

  return (
    <>
      <KeyField label="Claude API key" value={settings.apiKey} placeholder="sk-ant-…" onSave={(k) => void save(k)} check={check} />
      <p className="field__hint">
        Stored only in this browser and sent only to Anthropic. Get a key at{' '}
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
    </>
  );
}
