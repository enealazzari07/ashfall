import { describe, expect, it } from 'vitest';
import { RECIPES, START_RECIPES, isKnown } from '../src/data/recipes';
import { TALENTS, pointsForLevel } from '../src/data/talents';
import { Talents } from '../src/sim/Talents';

describe('Talentbaum', () => {
  it('jedes Rezept ist Grundrezept oder genau einem Talent zugeordnet', () => {
    const owners = new Map<string, number>();
    for (const t of TALENTS) for (const r of t.recipes ?? []) owners.set(r, (owners.get(r) ?? 0) + 1);
    for (const r of RECIPES) {
      const n = owners.get(r.id) ?? 0;
      expect(START_RECIPES.has(r.id) ? n : n, r.id).toBe(START_RECIPES.has(r.id) ? 0 : 1);
    }
    for (const id of owners.keys()) expect(RECIPES.some((r) => r.id === id), id).toBe(true);
  });

  it('Vorgänger existieren, liegen im selben Zweig und es gibt keine Zyklen', () => {
    const byId = new Map(TALENTS.map((t) => [t.id, t]));
    for (const t of TALENTS) {
      for (const q of t.requires ?? []) {
        expect(byId.get(q), `${t.id} → ${q}`).toBeDefined();
        expect(byId.get(q)!.branch).toBe(t.branch);
        expect(byId.get(q)!.row).toBeLessThan(t.row);
      }
    }
  });

  it('kostet Punkte, braucht Vorgänger und schaltet Rezepte frei', () => {
    const t = new Talents();
    const bed = RECIPES.find((r) => r.id === 'piece_bed')!;
    expect(isKnown(bed, t.knownRecipes())).toBe(false);
    expect(t.unlock('carp_bed', 20).ok).toBe(false); // Vorgänger fehlt
    expect(t.unlock('carp_furniture', 1).ok).toBe(false); // Stufe 1: keine Punkte
    expect(t.unlock('carp_furniture', 2).ok).toBe(true);
    expect(t.free(2)).toBe(0);
    expect(t.unlock('carp_bed', 2).ok).toBe(false); // keine Punkte mehr
    expect(t.unlock('carp_bed', 3).ok).toBe(true);
    expect(isKnown(bed, t.knownRecipes())).toBe(true);
  });

  it('Vorteile werden zusammengerechnet und bleiben beim Speichern', () => {
    const t = new Talents();
    t.unlock('surv_carry1', 99);
    t.unlock('surv_carry2', 99);
    t.unlock('carp_furniture', 99);
    t.unlock('carp_defense', 99);
    t.unlock('carp_fast', 99);
    expect(t.perks().carry).toBe(7);
    expect(t.perks().build).toBeCloseTo(0.85);
    const u = new Talents();
    u.fromJSON(JSON.parse(JSON.stringify(t.toJSON())));
    expect(u.perks().carry).toBe(7);
    expect(u.spent).toBe(t.spent);
    expect(pointsForLevel(20)).toBeGreaterThanOrEqual(t.spent);
  });
});
