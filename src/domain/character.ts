/**
 * The character's looks. Rank forms are earned from lifetime earnings; hero
 * suits from streaks, finished work, learning and money. Everything is
 * computed from recorded data, and once a look is unlocked it stays unlocked:
 * streak rules use the best streak ever, not the current one.
 */

export type Accent = 'neutral' | 'learning' | 'doing' | 'gold' | 'crimson' | 'violet' | 'ink' | 'ember' | 'storm';

export interface CharacterStats {
  /** Lifetime earnings in whole US dollars. */
  earned: number;
  bestStreak: number;
  tasksDone: number;
  learningEntries: number;
  entries: number;
}

export type Requirement =
  | { kind: 'start' }
  | { kind: 'earned'; amount: number }
  | { kind: 'streak'; days: number }
  | { kind: 'tasks'; count: number }
  | { kind: 'learningEntries'; count: number }
  | { kind: 'entries'; count: number };

export interface Look {
  id: string;
  name: string;
  /** One line describing the outfit. */
  description: string;
  requirement: Requirement;
  accent: Accent;
  /** Still portrait, when the art exists. */
  image?: string;
  /** 360° turntable clip, when it exists: the stage scrubs it as you drag. */
  spin?: string;
}

/** The rank ladder: who he is becoming, driven by money earned. */
export const FORMS: readonly Look[] = [
  { id: 'base', name: 'Initiate', description: 'Black hoodie. Where it starts.', requirement: { kind: 'start' }, accent: 'neutral' },
  { id: 'scholar', name: 'Scholar', description: 'Graphite technical suit with cyan seams.', requirement: { kind: 'earned', amount: 100_000 }, accent: 'learning' },
  { id: 'builder', name: 'Builder', description: 'Modular work suit with coral and copper seams.', requirement: { kind: 'earned', amount: 1_000_000 }, accent: 'doing' },
  { id: 'ascendant', name: 'Ascendant', description: 'Graphite and gold armored suit.', requirement: { kind: 'earned', amount: 100_000_000 }, accent: 'gold' },
  { id: 'sovereign', name: 'Sovereign', description: 'White-gold crowned armor with a light cape.', requirement: { kind: 'earned', amount: 1_000_000_000 }, accent: 'gold' },
];

/**
 * Hero suits: original designs in the spirit of the references, switchable
 * any time once unlocked.
 */
export const SUITS: readonly Look[] = [
  { id: 'web-runner', name: 'Web Runner', description: 'Red and navy web-lined stealth suit.', requirement: { kind: 'streak', days: 7 }, accent: 'crimson' },
  { id: 'mercenary', name: 'Mercenary', description: 'Red and black tactical suit with twin blades.', requirement: { kind: 'tasks', count: 50 }, accent: 'crimson' },
  { id: 'sorcerer', name: 'Sorcerer', description: 'Deep blue robes, crimson cloak, glowing amulet.', requirement: { kind: 'learningEntries', count: 30 }, accent: 'violet' },
  { id: 'symbiote', name: 'Symbiote', description: 'Living black suit with a white emblem. It takes over your body.', requirement: { kind: 'streak', days: 30 }, accent: 'ink' },
  { id: 'thunder', name: 'Thunder Lord', description: 'Black plate armor, crimson cape, storm hammer.', requirement: { kind: 'tasks', count: 150 }, accent: 'storm' },
  { id: 'arc-armor', name: 'Arc Armor', description: 'Red and gold powered armor with a glowing core.', requirement: { kind: 'earned', amount: 250_000 }, accent: 'gold' },
  { id: 'showman', name: 'Showman', description: 'Purple long coat, green vest, pinstripes.', requirement: { kind: 'entries', count: 100 }, accent: 'violet' },
  { id: 'mech-arms', name: 'Mech Arms', description: 'Green trench coat with four mechanical arms.', requirement: { kind: 'learningEntries', count: 100 }, accent: 'storm' },
  { id: 'dark-knight', name: 'Dark Knight', description: 'Matte black armor, cowl and long cape.', requirement: { kind: 'streak', days: 90 }, accent: 'ink' },
  { id: 'flame-rider', name: 'Flame Rider', description: 'Spiked leather jacket, chains and a burning head.', requirement: { kind: 'earned', amount: 10_000_000 }, accent: 'ember' },
];

export const ALL_LOOKS: readonly Look[] = [...FORMS, ...SUITS];

export function lookById(id: string | null | undefined): Look {
  return ALL_LOOKS.find((l) => l.id === id) ?? FORMS[0]!;
}

function have(r: Requirement, s: CharacterStats): number {
  switch (r.kind) {
    case 'start':
      return 0;
    case 'earned':
      return s.earned;
    case 'streak':
      return s.bestStreak;
    case 'tasks':
      return s.tasksDone;
    case 'learningEntries':
      return s.learningEntries;
    case 'entries':
      return s.entries;
  }
}

function need(r: Requirement): number {
  switch (r.kind) {
    case 'start':
      return 0;
    case 'earned':
      return r.amount;
    case 'streak':
      return r.days;
    case 'tasks':
    case 'learningEntries':
    case 'entries':
      return r.count;
  }
}

export function isUnlocked(look: Look, s: CharacterStats): boolean {
  return have(look.requirement, s) >= need(look.requirement);
}

/** 0 to 1 toward the look's requirement. */
export function progressToward(look: Look, s: CharacterStats): number {
  const n = need(look.requirement);
  return n === 0 ? 1 : Math.min(1, have(look.requirement, s) / n);
}

export function formatMoney(n: number): string {
  if (n >= 1e9) return `$${trim(n / 1e9)}B`;
  if (n >= 1e6) return `$${trim(n / 1e6)}M`;
  if (n >= 1e3) return `$${trim(n / 1e3)}K`;
  return `$${n.toLocaleString('en-US')}`;
}

function trim(v: number): string {
  return (Math.floor(v * 10) / 10).toString();
}

export function requirementText(r: Requirement): string {
  switch (r.kind) {
    case 'start':
      return 'Yours from the start';
    case 'earned':
      return `Earn ${formatMoney(r.amount)} in total`;
    case 'streak':
      return `Reach a ${r.days}-day streak`;
    case 'tasks':
      return `Finish ${r.count} tasks`;
    case 'learningEntries':
      return `Write ${r.count} learning entries`;
    case 'entries':
      return `Write ${r.count} journal entries`;
  }
}

/** "$40K to go", "12 days to go"; empty once unlocked. */
export function remainingText(look: Look, s: CharacterStats): string {
  const r = look.requirement;
  const left = need(r) - have(r, s);
  if (left <= 0) return '';
  switch (r.kind) {
    case 'earned':
      return `${formatMoney(left)} to go`;
    case 'streak':
      return `best streak ${s.bestStreak} of ${r.days} days`;
    case 'tasks':
      return `${left} more task${left === 1 ? '' : 's'}`;
    case 'learningEntries':
    case 'entries':
      return `${left} more entr${left === 1 ? 'y' : 'ies'}`;
    default:
      return '';
  }
}

/** The highest rank form the earnings have reached. */
export function currentForm(s: CharacterStats): Look {
  return [...FORMS].reverse().find((f) => isUnlocked(f, s)) ?? FORMS[0]!;
}

export function nextForm(s: CharacterStats): Look | null {
  return FORMS.find((f) => !isUnlocked(f, s)) ?? null;
}
