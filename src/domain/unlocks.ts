import { compareKeys, type DateKey } from '../date/localDate';
import { ALL_LOOKS, type CharacterStats, type Look } from './character';
import { BADGES, type BadgeId } from './config';
import type { ID, JournalEntry, Milestone, PeriodDirection, Task, VisionPlan } from './models';

/**
 * What has been earned, worked out from source records. Earned badges,
 * hero suits, transformations and platforms are then stored as permanent
 * unlock records, so a later reversal or a broken streak never takes them
 * away. Money-based looks are the exception: they follow the earnings log,
 * because that log is typed by hand and must stay correctable.
 */

export interface Transformation {
  id: 'spark' | 'awakened' | 'godhead' | 'legend';
  name: string;
  days: number;
  description: string;
}

/** Streak transformations. Earned forever at the best streak; the aura is lit while the current streak holds. */
export const TRANSFORMATIONS: readonly Transformation[] = [
  { id: 'spark', name: 'Spark', days: 7, description: 'A cyan spark aura flickers around you.' },
  { id: 'awakened', name: 'Awakened', days: 30, description: 'Your eyes burn bright and a storm aura rises.' },
  { id: 'godhead', name: 'Godhead', days: 90, description: 'A golden halo and rising light columns.' },
  { id: 'legend', name: 'Legend', days: 365, description: 'A full-body radiant flame. Few ever see it.' },
];

export interface Platform {
  id: string;
  name: string;
  description: string;
  /** How it is earned. Chest platforms come only from a reward chest. */
  how: string;
  chest?: boolean;
}

export const PLATFORMS: readonly Platform[] = [
  { id: 'base', name: 'Rune Disc', description: 'The original glowing rune platform.', how: 'Yours from the start' },
  { id: 'orbit-focus', name: 'Orbit Focus', description: 'A thin ring orbits the platform.', how: 'Reach global level 2' },
  { id: 'prism-balance', name: 'Prism Balance', description: 'Cyan and coral light split across the disc.', how: 'Finish a Learning and a Doing task on the same day' },
  { id: 'horizon-gold', name: 'Horizon Gold', description: 'A gold horizon ring.', how: 'Achieve your first goal milestone' },
  { id: 'nebula', name: 'Nebula Gate', description: 'Violet star dust swirling under your feet.', how: 'Found in a reward chest', chest: true },
  { id: 'ember-throne', name: 'Ember Throne', description: 'A ring of slow-burning embers.', how: 'Found in a reward chest', chest: true },
  { id: 'storm-ring', name: 'Storm Ring', description: 'Blue lightning crawling round the rim.', how: 'Found in a reward chest', chest: true },
  { id: 'crystal-dais', name: 'Crystal Dais', description: 'Ice-blue crystal facets that catch the light.', how: 'Found in a reward chest', chest: true },
  { id: 'void-gate', name: 'Void Gate', description: 'A black hole platform rimmed with white fire.', how: 'Found in a reward chest', chest: true },
  { id: 'sunforge', name: 'Sunforge', description: 'Molten gold that pulses like a heartbeat.', how: 'Found in a reward chest', chest: true },
];

export const CHEST_PLATFORMS = PLATFORMS.filter((p) => p.chest);

export const platformById = (id: string | null | undefined): Platform => PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0]!;

export const cosmeticId = {
  look: (id: string) => `look:${id}`,
  transformation: (id: string) => `form:${id}`,
  platform: (id: string) => `stage:${id}`,
  chest: (goalId: ID) => `chest:${goalId}`,
};

export interface UnlockSource {
  tasks: Task[];
  entries: JournalEntry[];
  milestones: Milestone[];
  directions: PeriodDirection[];
  plans: VisionPlan[];
}

export interface GameFacts {
  stats: CharacterStats;
  globalLevel: number;
  today: DateKey;
}

const isDone = (t: Task) => t.status === 'completed' && !t.deletedAt && !!t.completionLocalDate;

export function earnedBadges(src: UnlockSource, facts: GameFacts): Map<BadgeId, ID[]> {
  const out = new Map<BadgeId, ID[]>();
  const done = src.tasks.filter(isDone).sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''));
  if (done[0]) out.set('first-step', [done[0].id]);

  const doneIds = new Set(done.map((t) => t.id));
  const documented = src.entries.find((e) => !e.deletedAt && e.documentedAt && e.plainText.trim() && e.taskIds.some((id) => doneIds.has(id)));
  if (documented) out.set('written-evidence', [documented.id]);

  const byDay = new Map<DateKey, { learning?: ID; doing?: ID }>();
  for (const t of done) {
    const day = byDay.get(t.completionLocalDate!) ?? {};
    day[t.category] ??= t.id;
    byDay.set(t.completionLocalDate!, day);
  }
  const balanced = [...byDay.values()].find((d) => d.learning && d.doing);
  if (balanced) out.set('balanced-day', [balanced.learning!, balanced.doing!]);

  if (facts.stats.bestStreak >= 7) out.set('seven-days', []);

  const milestone = src.milestones.find((m) => m.achievedAt && !m.archivedAt);
  if (milestone) out.set('first-milestone', [milestone.id]);

  const review = src.directions.find((d) => (d.kind === 'week' || d.kind === 'month') && d.reviewedAt);
  if (review) out.set('reviewed', [review.id]);

  const sprint = src.plans.find((p) => p.kind === 'sprint' && p.finishedAt && compareKeys(facts.today, p.endDate) >= 0);
  if (sprint) out.set('finish-strong', [sprint.id]);
  return out;
}

export function hasBalancedDay(src: Pick<UnlockSource, 'tasks'>): boolean {
  const seen = new Map<DateKey, Set<string>>();
  for (const t of src.tasks) {
    if (!isDone(t)) continue;
    const s = seen.get(t.completionLocalDate!) ?? new Set();
    s.add(t.category);
    if (s.size === 2) return true;
    seen.set(t.completionLocalDate!, s);
  }
  return false;
}

/** Cosmetic ids earned right now (excluding chests, which open by hand). */
export function earnedCosmetics(src: UnlockSource, facts: GameFacts, isLookUnlocked: (look: Look) => boolean): string[] {
  const out: string[] = [];
  for (const look of ALL_LOOKS) {
    if (look.requirement.kind === 'start' || look.requirement.kind === 'earned') continue;
    if (isLookUnlocked(look)) out.push(cosmeticId.look(look.id));
  }
  for (const t of TRANSFORMATIONS) if (facts.stats.bestStreak >= t.days) out.push(cosmeticId.transformation(t.id));
  if (facts.globalLevel >= 2) out.push(cosmeticId.platform('orbit-focus'));
  if (hasBalancedDay(src)) out.push(cosmeticId.platform('prism-balance'));
  if (src.milestones.some((m) => m.achievedAt && !m.archivedAt)) out.push(cosmeticId.platform('horizon-gold'));
  return out;
}

/** The platform a chest holds: fixed per goal, preferring ones not owned yet. */
export function chestPlatform(goalId: ID, owned: Set<string>): Platform {
  let h = 0;
  for (const ch of goalId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const fresh = CHEST_PLATFORMS.filter((p) => !owned.has(cosmeticId.platform(p.id)));
  const pool = fresh.length ? fresh : CHEST_PLATFORMS;
  return pool[h % pool.length]!;
}

/** The highest transformation earned, and whether its aura is lit right now. */
export function transformationState(bestStreak: number, currentStreak: number): { earned: Transformation | null; lit: boolean; next: Transformation | null } {
  const earned = [...TRANSFORMATIONS].reverse().find((t) => bestStreak >= t.days) ?? null;
  const next = TRANSFORMATIONS.find((t) => bestStreak < t.days) ?? null;
  return { earned, lit: !!earned && currentStreak >= earned.days, next };
}

export interface RevealItem {
  key: string;
  kind: 'badge' | 'look' | 'transformation' | 'platform';
  title: string;
  detail: string;
  art: string;
}

/** Copy for the unlock reveal: what was earned and the action that earned it. */
export function revealFor(id: string): RevealItem | null {
  const [kind, raw] = id.includes(':') ? (id.split(':') as [string, string]) : ['badge', id];
  if (kind === 'badge') {
    const b = BADGES.find((x) => x.id === raw);
    return b ? { key: id, kind: 'badge', title: `Badge earned: ${b.name}`, detail: `${b.requirement}. Done.`, art: 'trophy' } : null;
  }
  if (kind === 'look') {
    const l = ALL_LOOKS.find((x) => x.id === raw);
    return l ? { key: id, kind: 'look', title: `New suit: ${l.name}`, detail: `Unlocked for: ${requirementLabel(l)}. Equip it on the Character page.`, art: 'shield' } : null;
  }
  if (kind === 'form') {
    const t = TRANSFORMATIONS.find((x) => x.id === raw);
    return t ? { key: id, kind: 'transformation', title: `Transformation: ${t.name}`, detail: `A ${t.days}-day streak. ${t.description} It's yours for good.`, art: 'high-voltage' } : null;
  }
  if (kind === 'stage') {
    const p = PLATFORMS.find((x) => x.id === raw);
    return p ? { key: id, kind: 'platform', title: `New platform: ${p.name}`, detail: `${p.how}. ${p.description}`, art: 'sparkles' } : null;
  }
  return null;
}

function requirementLabel(l: Look): string {
  const r = l.requirement;
  switch (r.kind) {
    case 'streak':
      return `a ${r.days}-day streak`;
    case 'tasks':
      return `${r.count} finished tasks`;
    case 'learningEntries':
      return `${r.count} learning entries`;
    case 'entries':
      return `${r.count} journal entries`;
    default:
      return 'your progress';
  }
}
