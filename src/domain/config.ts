/**
 * Every product default and game rule lives here, versioned, so scoring and
 * dates are never scattered through components. Values follow
 * docs/DATA_AND_GAME_RULES.md from the build kit.
 */
import type { DateKey } from '../date/localDate';
import { asset } from '../app/asset';

export const APP_NAME = 'Pursuit of Greatness';
export const APP_SHORT_NAME = 'Greatness';

export const PROFILE_DEFAULTS = {
  displayName: 'Subash',
  timeZone: 'Asia/Kolkata',
  weekStart: 'monday' as const,
};

export type PlanKind = 'decade' | 'year' | 'sprint';

export interface PlanDefault {
  kind: PlanKind;
  title: string;
  shortTitle: string;
  startDate: DateKey;
  endDate: DateKey;
}

/** The original plans. Stored once at setup; never silently re-dated. */
export const PLAN_DEFAULTS: readonly PlanDefault[] = [
  { kind: 'decade', title: '10-Year Vision', shortTitle: '10-year vision', startDate: '2026-10-10', endDate: '2036-10-10' },
  { kind: 'year', title: '1-Year Vision', shortTitle: '1-year foundation', startDate: '2026-10-10', endDate: '2027-10-10' },
  { kind: 'sprint', title: '2026 Finish Strong', shortTitle: 'Finish 2026 strong', startDate: '2026-10-10', endDate: '2026-12-31' },
];

export const TASK_TITLE_MAX = 200;
export const JOURNAL_AUTOSAVE_MS = 600;

export type Category = 'learning' | 'doing';
export type Effort = 'small' | 'standard' | 'deep';

export const RULES_VERSION = 1;

export const XP_RULES = {
  completionByEffort: { small: 10, standard: 20, deep: 35 } satisfies Record<Effort, number>,
  linkedDocumentationBonus: 5,
  dailyReflectionBonus: 5,
  completionDailyCapPerTrack: 200,
  documentationDailyCapPerTrack: 20,
  dailyGlobalReflectionCap: 5,
} as const;

/** Level L begins at 50 × (L − 1) × L XP. */
export function levelThreshold(level: number): number {
  return 50 * (level - 1) * level;
}

export function levelForXp(xp: number): number {
  const safe = Math.max(0, Math.floor(xp));
  // Solve 50L² − 50L − xp ≤ 0 for the largest integer L, then guard rounding.
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + safe / 12.5)) / 2));
  while (levelThreshold(level + 1) <= safe) level++;
  while (level > 1 && levelThreshold(level) > safe) level--;
  return level;
}

export interface LevelProgress {
  level: number;
  xp: number;
  levelStart: number;
  nextLevelAt: number;
  fraction: number;
}

export function levelProgress(xp: number): LevelProgress {
  const safe = Math.max(0, Math.floor(xp));
  const level = levelForXp(safe);
  const levelStart = levelThreshold(level);
  const nextLevelAt = levelThreshold(level + 1);
  const fraction = Math.min(1, Math.max(0, (safe - levelStart) / (nextLevelAt - levelStart)));
  return { level, xp: safe, levelStart, nextLevelAt, fraction };
}

export function rankLabel(level: number): string {
  if (level >= 10) return 'Ascendant';
  if (level >= 7) return 'Pathfinder';
  if (level >= 5) return 'Builder';
  if (level >= 3) return 'Focused';
  return 'Initiate';
}

export const CHARACTER_MEDIA = {
  video: asset('/assets/character/figure-center-loop.mp4'),
  poster: asset('/assets/character/base-poster.webp'),
  posterFallback: asset('/assets/character/base-poster.jpg'),
} as const;

export type BadgeId =
  | 'first-step'
  | 'written-evidence'
  | 'balanced-day'
  | 'seven-days'
  | 'first-milestone'
  | 'reviewed'
  | 'finish-strong';

export const BADGES: readonly { id: BadgeId; name: string; requirement: string; image: string }[] = [
  { id: 'first-step', name: 'First Step', requirement: 'Complete your first task', image: asset('/assets/ui/badge-first-step.svg') },
  { id: 'written-evidence', name: 'Written Evidence', requirement: 'Document a completed task with a log', image: asset('/assets/ui/badge-written-evidence.svg') },
  { id: 'balanced-day', name: 'Balanced Day', requirement: 'Complete a Learning and a Doing task on the same day', image: asset('/assets/ui/badge-balanced-day.svg') },
  { id: 'seven-days', name: 'Seven Days', requirement: 'Seven qualifying days in a row', image: asset('/assets/ui/badge-seven-days.svg') },
  { id: 'first-milestone', name: 'First Milestone', requirement: 'Achieve a goal milestone', image: asset('/assets/ui/badge-first-milestone.svg') },
  { id: 'reviewed', name: 'Reviewed', requirement: 'Save a weekly or monthly review', image: asset('/assets/ui/badge-reviewed.svg') },
  { id: 'finish-strong', name: 'Finish Strong', requirement: 'Complete the sprint and meet its success criteria', image: asset('/assets/ui/badge-finish-strong.svg') },
];
