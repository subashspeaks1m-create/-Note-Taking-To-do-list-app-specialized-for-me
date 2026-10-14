import { useSyncExternalStore } from 'react';

/**
 * AI settings for book analysis. Keys stay in this browser's localStorage and
 * are only ever sent to the provider they belong to.
 */
export type Provider = 'openrouter' | 'anthropic';
export type ModelId = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5';
export type Depth = 'medium' | 'high';

export interface AiSettings {
  provider: Provider;
  /** Anthropic API key. */
  apiKey: string;
  model: ModelId;
  depth: Depth;
  openrouterKey: string;
  /** OpenRouter model id; empty means "pick the best free model". */
  openrouterModel: string;
}

export const MODELS: readonly { id: ModelId; label: string; blurb: string; inputPerM: number; outputPerM: number; cacheReadPerM: number }[] = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5', blurb: 'Deepest insight. Recommended.', inputPerM: 4, outputPerM: 20, cacheReadPerM: 0.2 },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', blurb: 'Faster, about half the cost.', inputPerM: 2, outputPerM: 10, cacheReadPerM: 0.2 },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5', blurb: 'Fastest and cheapest. Lighter analysis.', inputPerM: 0.5, outputPerM: 2.5, cacheReadPerM: 0.05 },
];

const KEY = 'pog.books.ai.v1';
const DEFAULTS: AiSettings = { provider: 'openrouter', apiKey: '', model: 'claude-opus-5-5', depth: 'high', openrouterKey: '', openrouterModel: '' };

let current: AiSettings = read();
const listeners = new Set<() => void>();

function read(): AiSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AiSettings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function getAiSettings(): AiSettings {
  return current;
}

export function setAiSettings(patch: Partial<AiSettings>): void {
  current = { ...current, ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage blocked: settings last for this session only.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAiSettings(): AiSettings {
  return useSyncExternalStore(subscribe, getAiSettings, getAiSettings);
}

/** True when the selected provider has a key. */
export function hasKey(settings: AiSettings): boolean {
  return settings.provider === 'openrouter' ? !!settings.openrouterKey : !!settings.apiKey;
}

/** Rough token estimate (~3.6 characters per token for English prose). */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 3.6);
}

/**
 * Approximate Claude cost of a full analysis: one cache write of the book, four
 * cache reads, plus generated output (including thinking) across five sections.
 */
export function estimateCost(bookTokens: number, model: ModelId): number {
  const m = MODELS.find((x) => x.id === model) ?? MODELS[0]!;
  const write = (bookTokens * 1.25 * m.inputPerM) / 1e6;
  const reads = (bookTokens * 4 * m.cacheReadPerM) / 1e6;
  const output = (60_000 * m.outputPerM) / 1e6;
  return write + reads + output;
}

/** Short display name for a stored model id. */
export function modelLabel(id: string | undefined): string {
  if (!id) return '';
  const claude = MODELS.find((m) => m.id === id);
  if (claude) return claude.label;
  return id.replace(/^[^/]+\//, '').replace(/:free$/, ' (free)');
}
