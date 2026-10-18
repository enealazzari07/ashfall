import { describe, expect, it } from 'vitest';
import { LEVEL_MAX, PlayerLevel, levelFromXp, xpForLevel } from '../src/sim/Level';
import { RECIPES } from '../src/data/recipes';

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

  it('Rezepte sind nach Stufe sortiert und innerhalb der Maximalstufe', () => {
    const lv = RECIPES.map((r) => r.level ?? 1);
    expect([...lv].sort((a, b) => a - b)).toEqual(lv);
    expect(Math.max(...lv)).toBeLessThanOrEqual(LEVEL_MAX);
    expect(new Set(lv).size).toBeGreaterThan(5);
  });
});
