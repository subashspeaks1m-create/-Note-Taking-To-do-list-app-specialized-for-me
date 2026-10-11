import { useMemo } from 'react';
import { useTodayKey } from '../../date/clock';
import { isUnlocked, type CharacterStats, type Look } from '../../domain/character';
import type { BadgeId } from '../../domain/config';
import type { AchievementUnlock, CosmeticUnlock, ID } from '../../domain/models';
import { useProgressSummary, type ProgressSummary } from '../../domain/progressSummary';
import { consistency, type Consistency } from '../../domain/stats';
import { cosmeticId, earnedBadges, earnedCosmetics } from '../../domain/unlocks';
import { useActivitySource, useEarnings, useUnlockRecords, type UnlockRecords } from '../../storage/queries';
import { useProfile } from '../../storage/StorageProvider';

export interface GameState {
  stats: CharacterStats;
  habit: Consistency;
  progress: ProgressSummary;
  records: UnlockRecords;
  /** Badges whose rule is met by the records right now. */
  badgesMet: Map<BadgeId, ID[]>;
  /** Cosmetics whose rule is met right now (chests excluded). */
  cosmeticsMet: string[];
  badgeUnlocks: Map<string, AchievementUnlock>;
  owned: Map<string, CosmeticUnlock>;
  /** Money looks follow the earnings log; everything else stays once earned. */
  lookUnlocked: (look: Look) => boolean;
}

/** Everything the game layer judges on, from live records. Undefined while loading. */
export function useGameState(): GameState | undefined {
  const profile = useProfile();
  const today = useTodayKey(profile.timeZone);
  const source = useActivitySource();
  const earnings = useEarnings();
  const records = useUnlockRecords();
  const progress = useProgressSummary();

  return useMemo(() => {
    if (!source || !earnings || !records) return undefined;
    const habit = consistency(source, today, profile.weekStart ?? 'monday');
    const stats: CharacterStats = {
      earned: earnings.reduce((sum, e) => sum + e.amount, 0),
      bestStreak: habit.streak.longest,
      tasksDone: source.tasks.filter((t) => t.status === 'completed').length,
      learningEntries: source.entries.filter((e) => e.kind === 'learning' && e.plainText.trim()).length,
      entries: source.entries.filter((e) => e.plainText.trim()).length,
    };
    const owned = new Map(records.cosmetics.map((c) => [c.cosmeticId, c]));
    const lookUnlocked = (look: Look) =>
      isUnlocked(look, stats) || (look.requirement.kind !== 'earned' && owned.has(cosmeticId.look(look.id)));
    const unlockSource = { tasks: source.tasks, entries: source.entries, milestones: records.milestones, directions: records.directions, plans: records.plans };
    const facts = { stats, globalLevel: progress.global.level, today };
    return {
      stats,
      habit,
      progress,
      records,
      badgesMet: earnedBadges(unlockSource, facts),
      cosmeticsMet: earnedCosmetics(unlockSource, facts, (look) => isUnlocked(look, stats)),
      badgeUnlocks: new Map(records.achievements.map((a) => [a.achievementId, a])),
      owned,
      lookUnlocked,
    };
  }, [source, earnings, records, progress, today, profile.weekStart]);
}

