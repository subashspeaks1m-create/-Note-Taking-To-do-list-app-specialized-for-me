import { describe, expect, it } from 'vitest';
import { planTimeline, sprintCountdown } from './plans';
import { levelForXp, levelProgress, levelThreshold } from './config';

describe('sprint countdown', () => {
  const start = '2026-10-10';
  const end = '2026-12-31';
  it('shows 82 days after today on October 10', () => {
    const c = sprintCountdown('2026-10-10', start, end);
    expect(c.daysAfterToday).toBe(82);
    expect(c.datesIncludingToday).toBe(83);
    expect(c.label).toBe('82 days after today');
  });
  it('counts down and never goes negative', () => {
    expect(sprintCountdown('2026-10-11', start, end).daysAfterToday).toBe(81);
    expect(sprintCountdown('2026-12-30', start, end).label).toBe('1 day after today');
    expect(sprintCountdown('2026-12-31', start, end).label).toBe('Final day');
    const ended = sprintCountdown('2027-01-01', start, end);
    expect(ended.label).toBe('Sprint ended');
    expect(ended.daysAfterToday).toBe(0);
  });
});

describe('plan timeline', () => {
  it('measures time elapsed, separately from achievement', () => {
    const t = planTimeline('2026-10-10', '2026-10-10', '2036-10-10');
    expect(t.elapsedDays).toBe(0);
    expect(t.timeFraction).toBe(0);
    expect(planTimeline('2040-01-01', '2026-10-10', '2036-10-10').status).toBe('ended');
  });
});

describe('levels', () => {
  it('uses 50 × (L − 1) × L thresholds', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(levelThreshold)).toEqual([0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500]);
  });
  it('picks the right level at boundaries', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(299)).toBe(2);
    expect(levelForXp(300)).toBe(3);
    expect(levelForXp(1500)).toBe(6);
    expect(levelForXp(-20)).toBe(1);
    for (let xp = 0; xp < 20000; xp += 7) {
      const l = levelForXp(xp);
      expect(levelThreshold(l)).toBeLessThanOrEqual(xp);
      expect(levelThreshold(l + 1)).toBeGreaterThan(xp);
    }
  });
  it('reports progress inside a level', () => {
    expect(levelProgress(200)).toMatchObject({ level: 2, levelStart: 100, nextLevelAt: 300, fraction: 0.5 });
  });
});
