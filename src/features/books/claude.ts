import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { AiSettings } from './aiSettings';
import type { BookRecord, BookSource } from './db';
import { bookText, SYSTEM_PROMPT, taskPrompt } from './prompts';
import { SECTION_SCHEMAS, type BookInsights, type SectionId, type SectionResults } from './schema';

export function makeClient(apiKey: string): Anthropic {
  // The key belongs to the person using this local-only app and is sent only to Anthropic.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 3 });
}

/** Cheap call that confirms the key works without spending tokens. */
export async function testApiKey(apiKey: string, model: string): Promise<void> {
  await makeClient(apiKey).models.retrieve(model);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** The cached book block shared by every section request. */
async function bookBlock(book: BookRecord, source: BookSource): Promise<Anthropic.Beta.BetaContentBlockParam> {
  if (book.mode === 'pdf' && source.pdf) {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: await blobToBase64(source.pdf) },
      title: book.title,
      cache_control: { type: 'ephemeral' },
    };
  }
  return { type: 'text', text: bookText(book, source), cache_control: { type: 'ephemeral' } };
}

export class AnalysisError extends Error {}

export function describeError(error: unknown): string {
  if (error instanceof AnalysisError) return error.message;
  if (error instanceof Anthropic.AuthenticationError) return 'Claude rejected the API key. Check it in Settings.';
  if (error instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use the selected model.';
  if (error instanceof Anthropic.RateLimitError) return 'Rate limited by the API. Wait a minute and retry.';
  if (error instanceof Anthropic.BadRequestError) return `The request was rejected: ${error.message}`;
  if (error instanceof Anthropic.APIUserAbortError) return 'Stopped.';
  if (error instanceof Anthropic.APIConnectionError) return 'Could not reach the Claude API. Check your connection and retry.';
  if (error instanceof Anthropic.APIError) return `Claude API error${error.status ? ` ${error.status}` : ''}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

interface GenerateOptions<S extends SectionId> {
  section: S;
  book: BookRecord;
  source: BookSource;
  settings: AiSettings;
  insights?: BookInsights;
  signal?: AbortSignal;
  onText?: (chars: number) => void;
}

export async function generateSection<S extends SectionId>(opts: GenerateOptions<S>): Promise<SectionResults[S]> {
  const { section, book, source, settings, insights, signal, onText } = opts;
  const schema = SECTION_SCHEMAS[section];
  const client = makeClient(settings.apiKey);
  // Server-side refusal fallback keeps a false-positive safety decline from failing the run (not offered on Haiku).
  const fallback = settings.model === 'claude-haiku-5-5' ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

  const stream = client.beta.messages.stream(
    {
      model: settings.model,
      max_tokens: 64000,
      thinking: { type: 'adaptive' },
      output_config: { effort: settings.depth, format: betaZodOutputFormat(schema) },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [await bookBlock(book, source), { type: 'text', text: taskPrompt(section, book, insights) }],
        },
      ],
      ...fallback,
    },
    { signal },
  );

  let chars = 0;
  stream.on('text', (delta) => {
    chars += delta.length;
    onText?.(chars);
  });

  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw new AnalysisError('Claude declined to analyze this part of the book. Try another model in Settings.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new AnalysisError('The response was cut off before it finished. Retry, or narrow the page range.');
  }
  const parsed = schema.safeParse(message.parsed_output);
  if (!parsed.success) throw new AnalysisError('Claude returned an incomplete result. Retry this section.');
  return parsed.data as SectionResults[S];
}
