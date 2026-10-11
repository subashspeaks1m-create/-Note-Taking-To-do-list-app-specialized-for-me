/**
 * Equipment: five pieces of gear that upgrade from real numbers. Each slot
 * reads one measurement (Learning XP, Doing XP, principles, posts, money) and
 * climbs five tiers. Gear always shows what the numbers say today; the first
 * time a tier is reached it is revealed and remembered.
 */

import type { ArtName } from '../components/art/Art';
import { formatMoney } from './character';

export type SlotId = 'knowledge' | 'skills' | 'beliefs' | 'content' | 'earnings';

export interface EquipmentStats {
  learningXp: number;
  doingXp: number;
  principles: number;
  posts: number;
  /** Latest audience size logged, or 0. */
  audience: number;
  /** Lifetime earnings in whole US dollars. */
  earned: number;
}

export interface Tier {
  name: string;
  /** Amount of the slot's measurement needed. */
  at: number;
  art: ArtName;
}

export interface Slot {
  id: SlotId;
  name: string;
  /** What the gear stands for, in one line. */
  meaning: string;
  /** How the measurement is counted, for "how to upgrade" copy. */
  unit: (n: number) => string;
  measure: (s: EquipmentStats) => number;
  tiers: readonly Tier[];
  tone: 'learning' | 'doing' | 'violet' | 'crimson' | 'gold';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export const SLOTS: readonly Slot[] = [
  {
    id: 'knowledge',
    name: 'Knowledge',
    meaning: 'What you have learned',
    unit: (n) => `${n.toLocaleString('en-US')} Learning XP`,
    measure: (s) => s.learningXp,
    tone: 'learning',
    tiers: [
      { name: 'Pocket Notebook', at: 100, art: 'notebook' },
      { name: 'Open Grimoire', at: 500, art: 'open-book' },
      { name: 'Scholar Stack', at: 1_500, art: 'books' },
      { name: 'Arcane Scroll', at: 4_000, art: 'scroll' },
      { name: 'Oracle Orb', at: 10_000, art: 'crystal-ball' },
    ],
  },
  {
    id: 'skills',
    name: 'Skills',
    meaning: 'What you can build',
    unit: (n) => `${n.toLocaleString('en-US')} Doing XP`,
    measure: (s) => s.doingXp,
    tone: 'doing',
    tiers: [
      { name: 'Field Tools', at: 100, art: 'hammer-and-wrench' },
      { name: 'Builder Kit', at: 500, art: 'toolbox' },
      { name: 'Precision Gear', at: 1_500, art: 'gear' },
      { name: 'Power Arm', at: 4_000, art: 'mechanical-arm' },
      { name: 'Launch Engine', at: 10_000, art: 'rocket' },
    ],
  },
  {
    id: 'beliefs',
    name: 'Beliefs',
    meaning: 'The principles you live by',
    unit: (n) => plural(n, 'principle'),
    measure: (s) => s.principles,
    tone: 'violet',
    tiers: [
      { name: 'Inner Flame', at: 1, art: 'candle' },
      { name: 'Ward Amulet', at: 3, art: 'nazar-amulet' },
      { name: 'Iron Resolve', at: 5, art: 'shield' },
      { name: 'Guiding Star', at: 8, art: 'glowing-star' },
      { name: 'Crown of Conviction', at: 12, art: 'crown' },
    ],
  },
  {
    id: 'content',
    name: 'Content',
    meaning: 'What you publish',
    unit: (n) => plural(n, 'post'),
    measure: (s) => s.posts,
    tone: 'crimson',
    tiers: [
      { name: 'Creator Phone', at: 1, art: 'mobile-phone' },
      { name: 'Snap Camera', at: 10, art: 'camera' },
      { name: 'Cinema Rig', at: 50, art: 'movie-camera' },
      { name: 'Studio Mic', at: 150, art: 'studio-microphone' },
      { name: 'Broadcast Tower', at: 500, art: 'satellite-antenna' },
    ],
  },
  {
    id: 'earnings',
    name: 'Earnings',
    meaning: 'Money you have made',
    unit: (n) => `${formatMoney(n)} earned`,
    measure: (s) => s.earned,
    tone: 'gold',
    tiers: [
      { name: 'First Coin', at: 1_000, art: 'coin' },
      { name: 'Steel Chronograph', at: 10_000, art: 'watch' },
      { name: 'Vault Bag', at: 100_000, art: 'money-bag' },
      { name: 'Signet Ring', at: 1_000_000, art: 'ring' },
      { name: 'Diamond Crest', at: 10_000_000, art: 'gem-stone' },
    ],
  },
];

/** Audience marks shown as stars on the Content gear. */
export const AUDIENCE_STARS: readonly number[] = [1_000, 10_000, 100_000, 1_000_000, 10_000_000];

export interface GearState {
  slot: Slot;
  value: number;
  /** 0 (nothing yet) to 5. */
  tier: number;
  current: Tier | null;
  next: Tier | null;
  /** 0 to 1 from the current tier toward the next. */
  fraction: number;
  /** Content only: how many audience stars are lit. */
  stars?: number;
}

export function gearFor(slot: Slot, s: EquipmentStats): GearState {
  const value = Math.max(0, slot.measure(s));
  const tier = slot.tiers.filter((t) => value >= t.at).length;
  const current = tier > 0 ? slot.tiers[tier - 1]! : null;
  const next = slot.tiers[tier] ?? null;
  const from = current?.at ?? 0;
  const fraction = next ? Math.min(1, Math.max(0, (value - from) / (next.at - from))) : 1;
  const out: GearState = { slot, value, tier, current, next, fraction };
  if (slot.id === 'content') out.stars = AUDIENCE_STARS.filter((m) => s.audience >= m).length;
  return out;
}

export function allGear(s: EquipmentStats): GearState[] {
  return SLOTS.map((slot) => gearFor(slot, s));
}

/** "380 Learning XP to go". Empty when maxed. */
export function gearRemaining(g: GearState): string {
  if (!g.next) return '';
  const left = g.next.at - g.value;
  return g.slot.id === 'earnings' ? `${formatMoney(left)} to go` : `${g.slot.unit(left)} to go`;
}

export const gearCosmeticId = (slot: SlotId, tier: number) => `gear:${slot}:${tier}`;

/** Cosmetic ids for every gear tier reached right now, so first reaches can be revealed. */
export function earnedGear(s: EquipmentStats): string[] {
  return allGear(s).flatMap((g) => Array.from({ length: g.tier }, (_, i) => gearCosmeticId(g.slot.id, i + 1)));
}

export function gearByCosmeticId(id: string): { slot: Slot; tier: Tier; level: number } | null {
  const [kind, slotId, n] = id.split(':');
  if (kind !== 'gear') return null;
  const slot = SLOTS.find((x) => x.id === slotId);
  const level = Number(n);
  const tier = slot?.tiers[level - 1];
  return slot && tier ? { slot, tier, level } : null;
}

/** Audience shown short: 12.4K, 1.2M. */
export function formatCount(n: number): string {
  return formatMoney(n).slice(1);
}
