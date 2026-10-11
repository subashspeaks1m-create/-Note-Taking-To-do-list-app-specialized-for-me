/**
 * OpenRouter access for the AI coach. The key lives only in this browser's
 * localStorage: it is never written to the database, a backup or the server,
 * and only free (":free") models are ever called, so nothing is billed.
 */

const KEY_STORAGE = 'pog.openrouterKey';
const MODEL_STORAGE = 'pog.coachModel';
const API = 'https://openrouter.ai/api/v1';

/** Tried in order when the coach is on "Best free model"; the live list fills in after these. */
export const PREFERRED_FREE_MODELS = [
  'deepseek/deepseek-chat-v3.1:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'mistralai/mistral-small-3.2-24b-instruct:free',
];

export const AUTO_MODEL = 'auto';

export function isFreeModel(id: string): boolean {
  return id.endsWith(':free');
}

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function write(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Storage blocked (private window): the key simply isn't remembered.
  }
}

export const coachKey = {
  get: () => read(KEY_STORAGE),
  set: (k: string) => write(KEY_STORAGE, k.trim()),
  clear: () => write(KEY_STORAGE, ''),
};

export const coachModel = {
  get: () => read(MODEL_STORAGE) || AUTO_MODEL,
  set: (m: string) => write(MODEL_STORAGE, m === AUTO_MODEL ? '' : m),
};

/** Shown instead of the key: enough to recognise it, not enough to use it. */
export function maskKey(k: string): string {
  if (k.length <= 10) return '••••';
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

export class CoachError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

function explain(status: number, body: string): string {
  if (status === 401) return 'OpenRouter did not accept the key. Check it in Settings.';
  if (status === 402) return 'OpenRouter says this needs credits. Only free models are used, so try another free model.';
  if (status === 429) return 'The free model is busy right now. Try again in a minute.';
  if (status === 404) return 'That free model is no longer available.';
  return `OpenRouter error ${status}${body ? `: ${body.slice(0, 160)}` : ''}`;
}

/** Free models OpenRouter offers right now, by id. */
export async function listFreeModels(signal?: AbortSignal): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`${API}/models`, { signal });
  if (!res.ok) throw new CoachError(explain(res.status, ''), res.status);
  const json = (await res.json()) as { data?: { id: string; name?: string }[] };
  return (json.data ?? []).filter((m) => isFreeModel(m.id)).map((m) => ({ id: m.id, name: m.name ?? m.id }));
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

async function complete(key: string, model: string, messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  if (!isFreeModel(model)) throw new CoachError('Only free models are allowed.');
  const res = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-Title': 'Pursuit of Greatness',
    },
    body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: 1400 }),
  });
  if (!res.ok) {
    let body = '';
    try {
      body = ((await res.json()) as { error?: { message?: string } }).error?.message ?? '';
    } catch {
      // not JSON
    }
    throw new CoachError(explain(res.status, body), res.status);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  const text = json.choices?.[0]?.message?.content?.trim();
  // 204 marks an empty answer: worth trying the next free model.
  if (!text) throw new CoachError(json.error?.message ? explain(0, json.error.message) : 'The model sent back an empty answer. Try again.', 204);
  return text;
}

/**
 * Ask the coach. On "auto", walks the preferred free models (then any other
 * free model) until one answers; a busy or retired model is skipped, a bad
 * key stops at once.
 */
export async function askCoach(
  key: string,
  choice: string,
  messages: ChatMessage[],
  opts: { signal?: AbortSignal; available?: string[] } = {},
): Promise<{ model: string; text: string }> {
  if (!key) throw new CoachError('Add your OpenRouter key in Settings first.');
  const tried = new Set<string>();
  let last: unknown = null;
  const attempt = async (models: string[]) => {
    for (const model of models) {
      if (tried.has(model) || tried.size >= 6) continue;
      tried.add(model);
      try {
        return { model, text: await complete(key, model, messages, opts.signal) };
      } catch (e) {
        if (opts.signal?.aborted) throw e;
        if (e instanceof CoachError && (e.status === 401 || e.status === 0)) throw e;
        last = e;
      }
    }
    return null;
  };
  if (choice !== AUTO_MODEL) {
    const r = await attempt([choice]);
    if (r) return r;
  } else {
    const r = await attempt(PREFERRED_FREE_MODELS.filter((m) => !opts.available || opts.available.includes(m)));
    if (r) return r;
    // The preferred ones may have been retired: ask OpenRouter which free models exist now.
    let available = opts.available;
    if (!available) {
      try {
        available = (await listFreeModels(opts.signal)).map((m) => m.id);
      } catch {
        available = [];
      }
    }
    const r2 = await attempt(available);
    if (r2) return r2;
  }
  throw last instanceof Error ? last : new CoachError('No free model answered. Try again later.');
}
