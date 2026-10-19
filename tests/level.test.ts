import { describe, expect, it } from 'vitest';
import { LEVEL_MAX, PlayerLevel, levelFromXp, xpForLevel } from '../src/sim/Level';
import { pointsForLevel } from '../src/data/talents';

describe('Charakterstufe', () => {
  it('startet auf Stufe 1 und steigt mit XP auf', () => {
    const l = new PlayerLevel();
    expect(l.level).toBe(1);
    expect(l.add(xpForLevel(2))).toBe(2);
    expect(l.level).toBe(2);
    expect(l.progress).toBeCloseTo(0);
  });

  it('ist bei der Maximalstufe gedeckelt und speichert verlustfrei', () => {
    const l = new PlayerLevel();
    l.add(1e9);
    expect(l.level).toBe(LEVEL_MAX);
    expect(levelFromXp(l.xp)).toBe(LEVEL_MAX);
    const k = new PlayerLevel();
    k.fromJSON(l.toJSON());
    expect(k.level).toBe(LEVEL_MAX);
  });

  it('Talentpunkte wachsen mit der Stufe', () => {
    expect(pointsForLevel(1)).toBe(0);
    expect(pointsForLevel(2)).toBe(1);
    expect(pointsForLevel(5)).toBe(4 + 2);
    expect(pointsForLevel(LEVEL_MAX)).toBeGreaterThan(20);
  });
});
