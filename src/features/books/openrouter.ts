import { useEffect, useState } from 'react';

/**
 * OpenRouter client (OpenAI-compatible chat completions), called straight from
 * the browser with the user's key. Free models vary in context size and in
 * whether they support JSON output, so the model list is read live.
 */

const API = 'https://openrouter.ai/api/v1';
const MODELS_CACHE_KEY = 'pog.books.ormodels.v1';
const MODELS_TTL_MS = 6 * 60 * 60 * 1000;

export interface OrModel {
  id: string;
  name: string;
  context: number;
  maxOutput: number;
  free: boolean;
  structured: boolean;
  jsonMode: boolean;
}

interface RawModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
  top_provider?: { context_length?: number; max_completion_tokens?: number | null };
}

export function toOrModel(m: RawModel): OrModel {
  const params = m.supported_parameters ?? [];
  const free = m.id.endsWith(':free') || (Number(m.pricing?.prompt ?? 1) === 0 && Number(m.pricing?.completion ?? 1) === 0);
  return {
    id: m.id,
    name: m.name ?? m.id,
    context: m.context_length ?? m.top_provider?.context_length ?? 8192,
    maxOutput: m.top_provider?.max_completion_tokens ?? 0,
    free,
    structured: params.includes('structured_outputs'),
    jsonMode: params.includes('response_format'),
  };
}

/** Free text models, best first: JSON support, then the largest context. */
export function rankFreeModels(models: OrModel[]): OrModel[] {
  return models
    .filter((m) => m.free && m.id !== 'openrouter/auto')
    .sort((a, b) => Number(b.structured || b.jsonMode) - Number(a.structured || a.jsonMode) || b.context - a.context || a.id.localeCompare(b.id));
}

let memo: Promise<OrModel[]> | null = null;

export function fetchModels(): Promise<OrModel[]> {
  if (memo) return memo;
  try {
    const cached = JSON.parse(window.localStorage.getItem(MODELS_CACHE_KEY) ?? 'null') as { at: number; models: OrModel[] } | null;
    if (cached && Date.now() - cached.at < MODELS_TTL_MS && cached.models.length) return (memo = Promise.resolve(cached.models));
  } catch {
    // Ignore a broken cache.
  }
  memo = fetch(`${API}/models`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`OpenRouter model list failed (${res.status}).`);
      const body = (await res.json()) as { data: RawModel[] };
      const models = body.data.map(toOrModel);
      try {
        window.localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify({ at: Date.now(), models }));
      } catch {
        // Cache is optional.
      }
      return models;
    })
    .catch((e: unknown) => {
      memo = null;
      throw e;
    });
  return memo;
}

export function useOpenRouterModels(): { models: OrModel[]; free: OrModel[]; error: string | null; loading: boolean } {
  const [state, setState] = useState<{ models: OrModel[]; error: string | null; loading: boolean }>({ models: [], error: null, loading: true });
  useEffect(() => {
    let alive = true;
    fetchModels().then(
      (models) => alive && setState({ models, error: null, loading: false }),
      (e: unknown) => alive && setState({ models: [], error: e instanceof Error ? e.message : String(e), loading: false }),
    );
    return () => {
      alive = false;
    };
  }, []);
  return { ...state, free: rankFreeModels(state.models) };
}

/** The model to use: the saved choice, or the best free model. */
export async function resolveModel(saved: string): Promise<OrModel> {
  const models = await fetchModels().catch(() => [] as OrModel[]);
  if (saved) {
    return models.find((m) => m.id === saved) ?? { id: saved, name: saved, context: 32_000, maxOutput: 0, free: saved.endsWith(':free'), structured: false, jsonMode: false };
  }
  const best = rankFreeModels(models)[0];
  if (!best) throw new OpenRouterError('Could not load the OpenRouter model list. Pick a model in Settings.');
  return best;
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly retryable = false,
  ) {
    super(message);
  }
}

function explain(status: number, raw: string): OpenRouterError {
  let message = raw;
  try {
    const body = JSON.parse(raw) as { error?: { message?: string; metadata?: { raw?: string } } };
    message = body.error?.metadata?.raw || body.error?.message || raw;
  } catch {
    // Not JSON; keep the raw text.
  }
  if (status === 401) return new OpenRouterError('OpenRouter rejected the API key. Check it in Settings.', status);
  if (status === 402) return new OpenRouterError('This model needs OpenRouter credits. Pick a free model (marked "free") in Settings.', status);
  if (status === 429) return new OpenRouterError('The free model is rate-limited right now. Wait a minute and retry, or pick another free model in Settings.', status, true);
  if (/data policy|privacy/i.test(message)) {
    return new OpenRouterError('Free models need a privacy setting: open openrouter.ai/settings/privacy and allow free model providers, then retry.', status);
  }
  if (status === 404) return new OpenRouterError(`OpenRouter could not find an available endpoint for this model. Pick another model in Settings. (${message})`, status);
  if (status >= 500) return new OpenRouterError(`OpenRouter or the model provider had an error (${status}). Retry in a moment.`, status, true);
  return new OpenRouterError(`OpenRouter error ${status}: ${message}`, status);
}

/** Confirms the key and returns its label. */
export async function testOpenRouterKey(key: string): Promise<string> {
  const res = await fetch(`${API}/key`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw explain(res.status, await res.text());
  const body = (await res.json()) as { data?: { label?: string; is_free_tier?: boolean } };
  return body.data?.is_free_tier ? 'Key works (free tier: about 50 free-model requests a day).' : 'Key works.';
}

export interface CompleteOptions {
  key: string;
  model: OrModel;
  system: string;
  user: string;
  /** JSON schema the answer must follow; omit for plain text. */
  schema?: { name: string; schema: object };
  maxTokens?: number;
  signal?: AbortSignal;
  onText?: (chars: number) => void;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

/** Streams one chat completion and returns the full text. Retries rate limits and provider errors. */
export async function complete(opts: CompleteOptions): Promise<string> {
  let useFormat: 'schema' | 'json' | 'none' = !opts.schema ? 'none' : opts.model.structured ? 'schema' : opts.model.jsonMode ? 'json' : 'none';
  for (let attempt = 0; ; attempt++) {
    try {
      return await completeOnce(opts, useFormat);
    } catch (e) {
      if (!(e instanceof OpenRouterError)) throw e;
      // Some providers reject response_format even when listed; fall back to prompt-only JSON.
      if (e.status === 400 && useFormat !== 'none') {
        useFormat = useFormat === 'schema' && opts.model.jsonMode ? 'json' : 'none';
        continue;
      }
      if (e.retryable && attempt < 3) {
        await sleep([8_000, 20_000, 45_000][attempt]!, opts.signal);
        continue;
      }
      throw e;
    }
  }
}

async function completeOnce(opts: CompleteOptions, format: 'schema' | 'json' | 'none'): Promise<string> {
  const { key, model, system, user, schema, signal, onText } = opts;
  // Stay inside the model's output cap and the room its context leaves after the prompt.
  const promptTokens = Math.ceil((system.length + user.length) / 3.2);
  const room = model.context - promptTokens - 256;
  const maxTokens = Math.max(1_024, Math.min(opts.maxTokens ?? 16_000, model.maxOutput || 16_000, room));
  const body: Record<string, unknown> = {
    model: model.id,
    stream: true,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  if (format === 'schema' && schema) body.response_format = { type: 'json_schema', json_schema: { name: schema.name, strict: true, schema: schema.schema } };
  if (format === 'json') body.response_format = { type: 'json_object' };

  const res = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Pursuit of Greatness',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw explain(res.status, await res.text());

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finish: string | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue; // SSE comments keep the connection alive
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      let chunk: { error?: { message?: string; code?: number }; choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[] };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.error) throw explain(chunk.error.code ?? 500, JSON.stringify({ error: chunk.error }));
      const choice = chunk.choices?.[0];
      const delta = choice?.delta?.content;
      if (delta) {
        text += delta;
        onText?.(text.length);
      }
      if (choice?.finish_reason) finish = choice.finish_reason;
    }
  }
  if (finish === 'length') throw new OpenRouterError('The model ran out of output space before finishing. Retry, or pick a model with a larger output limit.');
  if (!text.trim()) throw new OpenRouterError('The model returned an empty answer. Retry, or pick another free model.', 0, true);
  return text;
}
