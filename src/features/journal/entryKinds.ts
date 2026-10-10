import type { IconName } from '../../components/Icon';
import type { EntryKind } from '../../domain/models';

export interface EntryKindMeta {
  kind: EntryKind;
  label: string;
  short: string;
  prompt: string;
  placeholder: string;
  titlePlaceholder: string;
  icon: IconName;
  tone: 'learning' | 'doing' | 'gold';
}

/** Prompts are gentle helpers; the app never writes the entry for you. */
export const ENTRY_KINDS: readonly EntryKindMeta[] = [
  {
    kind: 'learning',
    label: 'What I learned',
    short: 'Learned',
    prompt: 'What changed in your understanding?',
    placeholder: 'Write what you learned, in your own words…',
    titlePlaceholder: 'Title (optional)',
    icon: 'learning',
    tone: 'learning',
  },
  {
    kind: 'doing',
    label: 'What I did',
    short: 'Did',
    prompt: 'What did you make or finish?',
    placeholder: 'Write what you did and how it went…',
    titlePlaceholder: 'Title (optional)',
    icon: 'doing',
    tone: 'doing',
  },
  {
    kind: 'reflection',
    label: 'Daily reflection',
    short: 'Reflection',
    prompt: 'What was difficult, and what is your next step?',
    placeholder: 'Reflect on the day…',
    titlePlaceholder: 'Title (optional)',
    icon: 'reflection',
    tone: 'gold',
  },
];

export function kindMeta(kind: EntryKind): EntryKindMeta {
  return ENTRY_KINDS.find((k) => k.kind === kind) ?? ENTRY_KINDS[0]!;
}
