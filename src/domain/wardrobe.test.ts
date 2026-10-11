import { describe, expect, it } from 'vitest';
import { DEFAULT_OUTFIT, OUTFITS, matchesOutfit, nextTier, outfitById, tierForLevel } from './wardrobe';

describe('wardrobe', () => {
  it('has fourteen outfits with unique ids, starting from the default', () => {
    const ids = OUTFITS.map((o) => o.id);
    expect(ids).toHaveLength(14);
    expect(new Set(ids).size).toBe(14);
    expect(ids[0]).toBe(DEFAULT_OUTFIT);
  });

  it('falls back to the default outfit for unknown ids', () => {
    expect(outfitById('dark-knight').name).toBe('Dark Knight');
    expect(outfitById('nope').id).toBe(DEFAULT_OUTFIT);
    expect(outfitById(null).id).toBe(DEFAULT_OUTFIT);
  });

  it('searches names, descriptions and tags, ignoring case and spaces', () => {
    const dk = outfitById('dark-knight');
    expect(matchesOutfit(dk, '')).toBe(true);
    expect(matchesOutfit(dk, '  KNIGHT ')).toBe(true);
    expect(matchesOutfit(dk, 'cape')).toBe(true);
    expect(matchesOutfit(dk, 'tropical')).toBe(false);
  });
});

describe('tiers', () => {
  it.each([
    [1, 'normal'],
    [4, 'normal'],
    [5, 'pro'],
    [9, 'pro'],
    [10, 'advanced'],
    [19, 'advanced'],
    [20, 'legendary'],
    [99, 'legendary'],
  ])('level %i is %s', (level, tier) => {
    expect(tierForLevel(level).id).toBe(tier);
  });

  it('names the next tier until the top', () => {
    expect(nextTier(4)?.id).toBe('pro');
    expect(nextTier(5)?.id).toBe('advanced');
    expect(nextTier(20)).toBeNull();
  });
});
