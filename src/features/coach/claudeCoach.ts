import { useEffect, useState } from 'react';
import type { ChatMessage } from './openrouter';
import { CoachError } from './openrouter';

/**
 * Inside the claude.ai app link the page may not contact outside websites,
 * so OpenRouter can't be reached there. The coach asks Claude instead,
 * through the viewer's own Claude account (the page asks once for
 * permission). Outside claude.ai there is no `window.claude` and the
 * OpenRouter key is used as before.
 */
type SampleFn = (input: string, options?: { signal?: AbortSignal; modelTier?: 'quick' | 'default' | 'complex' }) => Promise<{ text: string; truncated: boolean }>;

export const CLAUDE_MODEL_LABEL = 'Claude';

let pending: Promise<SampleFn | null> | null = null;

/** Claude, when this page runs inside claude.ai and may ask it; otherwise null. */
export function claudeSample(): Promise<SampleFn | null> {
  const runtime = (window as unknown as { claude?: { use(name: string): Promise<unknown> } }).claude;
  if (typeof runtime?.use !== 'function') return Promise.resolve(null);
  pending ??= runtime.use('sample').then((s) => (typeof s === 'function' ? (s as SampleFn) : null)).catch(() => null);
  return pending;
}

/** undefined while checking, then whether the coach can use Claude here. */
export function useClaudeCoach(): boolean | undefined {
  const [ok, setOk] = useState<boolean | undefined>(() => (typeof (window as unknown as { claude?: unknown }).claude === 'object' ? undefined : false));
  useEffect(() => {
    let live = true;
    void claudeSample().then((s) => live && setOk(!!s));
    return () => {
      live = false;
    };
  }, []);
  return ok;
}

function explain(code: string | undefined, message: string): string {
  switch (code) {
    case 'not_granted':
      return 'Claude was not allowed for this page. Reopen the app and choose Allow when it asks, then try again.';
    case 'rate_limited':
      return 'Claude is busy right now. Try again in a minute.';
    case 'prompt_too_large':
      return 'This period holds too much text to send at once.';
    case 'unavailable':
      return 'Claude could not be reached. Check your connection and try again.';
    default:
      return message || 'Claude could not write the notes. Try again.';
  }
}

/** Ask Claude with the coach's instructions and this period's record in one prompt. */
export async function askClaudeCoach(messages: ChatMessage[], signal?: AbortSignal): Promise<{ model: string; text: string }> {
  const sample = await claudeSample();
  if (!sample) throw new CoachError('Claude is not available in this view.');
  const prompt = messages.map((m) => m.content).join('\n\n---\n\n');
  try {
    const { text } = await sample(prompt, { signal, modelTier: 'default' });
    if (!text.trim()) throw new CoachError('Claude sent back an empty answer. Try again.');
    return { model: CLAUDE_MODEL_LABEL, text: text.trim() };
  } catch (e) {
    if (e instanceof CoachError) throw e;
    const err = e as { code?: string; message?: string };
    throw new CoachError(explain(err.code, err.message ?? ''));
  }
}
