import { describe, expect, it } from 'vitest';
import { allGear, earnedGear, gearByCosmeticId, gearRemaining, type EquipmentStats } from './equipment';
import { revealFor } from './unlocks';

const zero: EquipmentStats = { learningXp: 0, doingXp: 0, principles: 0, posts: 0, audience: 0, earned: 0 };
const bySlot = (s: EquipmentStats) => Object.fromEntries(allGear(s).map((g) => [g.slot.id, g]));

describe('equipment', () => {
  it('starts with five empty slots', () => {
    const gear = allGear(zero);
    expect(gear.map((g) => g.slot.id)).toEqual(['knowledge', 'skills', 'beliefs', 'content', 'earnings']);
    expect(gear.every((g) => g.tier === 0 && g.current === null)).toBe(true);
    expect(earnedGear(zero)).toEqual([]);
  });

  it('climbs tiers exactly at the thresholds and reports what is left', () => {
    const g = bySlot({ ...zero, learningXp: 499, doingXp: 500, principles: 3, posts: 10, earned: 1_000 });
    expect(g.knowledge!.tier).toBe(1);
    expect(gearRemaining(g.knowledge!)).toBe('1 Learning XP to go');
    expect(g.skills!.current!.name).toBe('Builder Kit');
    expect(g.beliefs!.current!.name).toBe('Ward Amulet');
    expect(g.content!.current!.name).toBe('Snap Camera');
    expect(g.earnings!.current!.name).toBe('First Coin');
    expect(gearRemaining(g.earnings!)).toBe('$9K to go');
  });

  it('caps at level five and lights audience stars', () => {
    const g = bySlot({ ...zero, learningXp: 50_000, posts: 600, audience: 120_000 });
    expect(g.knowledge!.tier).toBe(5);
    expect(g.knowledge!.next).toBeNull();
    expect(g.knowledge!.fraction).toBe(1);
    expect(g.content!.stars).toBe(3);
  });

  it('turns reached tiers into revealable unlock ids', () => {
    const ids = earnedGear({ ...zero, principles: 5 });
    expect(ids).toEqual(['gear:beliefs:1', 'gear:beliefs:2', 'gear:beliefs:3']);
    expect(gearByCosmeticId('gear:beliefs:3')!.tier.name).toBe('Iron Resolve');
    expect(gearByCosmeticId('gear:beliefs:9')).toBeNull();
    expect(revealFor('gear:beliefs:3')!.title).toBe('Beliefs gear: Iron Resolve');
  });
});
