import { describe, expect, it } from 'vitest';
import { FORMS, SUITS, currentForm, formatMoney, isUnlocked, lookById, nextForm, progressToward, remainingText, type CharacterStats } from './character';

const zero: CharacterStats = { earned: 0, bestStreak: 0, tasksDone: 0, learningEntries: 0, entries: 0 };

describe('rank forms', () => {
  it('climbs with lifetime earnings', () => {
    expect(currentForm(zero).id).toBe('base');
    expect(nextForm(zero)?.id).toBe('scholar');
    expect(currentForm({ ...zero, earned: 100_000 }).id).toBe('scholar');
    expect(currentForm({ ...zero, earned: 2_500_000 }).id).toBe('builder');
    expect(currentForm({ ...zero, earned: 100_000_000 }).id).toBe('ascendant');
    expect(currentForm({ ...zero, earned: 1_000_000_000 }).id).toBe('sovereign');
    expect(nextForm({ ...zero, earned: 1_000_000_000 })).toBeNull();
  });

  it('reports progress and what is left', () => {
    const scholar = lookById('scholar');
    expect(progressToward(scholar, { ...zero, earned: 25_000 })).toBe(0.25);
    expect(remainingText(scholar, { ...zero, earned: 25_000 })).toBe('$75K to go');
    expect(remainingText(scholar, { ...zero, earned: 100_000 })).toBe('');
  });
});

describe('hero suits', () => {
  it('unlock from the best streak, so a broken streak keeps them', () => {
    const symbiote = lookById('symbiote');
    expect(isUnlocked(symbiote, { ...zero, bestStreak: 29 })).toBe(false);
    expect(isUnlocked(symbiote, { ...zero, bestStreak: 30 })).toBe(true);
  });

  it('has ten suits with unique ids, separate from the forms', () => {
    const ids = [...FORMS, ...SUITS].map((l) => l.id);
    expect(SUITS).toHaveLength(10);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('falls back to the first form for unknown ids', () => {
    expect(lookById('nope').id).toBe('base');
  });
});

describe('formatMoney', () => {
  it('abbreviates without rounding up', () => {
    expect(formatMoney(950)).toBe('$950');
    expect(formatMoney(99_999)).toBe('$99.9K');
    expect(formatMoney(1_000_000)).toBe('$1M');
    expect(formatMoney(1_500_000_000)).toBe('$1.5B');
  });
});
