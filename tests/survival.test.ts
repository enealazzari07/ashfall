import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/player/Inventory';
import { Needs } from '../src/player/Needs';
import { Health } from '../src/player/Health';
import { rollLoot } from '../src/data/loot';
import { rng } from '../src/world/CityGenerator';

describe('Needs', () => {
  it('sinkt mit der Zeit, schneller beim Sprinten', () => {
    const a = new Needs(), b = new Needs();
    a.update(1, { sprinting: false, cold: 0 });
    b.update(1, { sprinting: true, cold: 0 });
    expect(a.values.hunger).toBeLessThan(85);
    expect(b.values.thirst).toBeLessThan(a.values.thirst);
  });

  it('kühlt bei Kälte aus und erholt sich bei Wärme', () => {
    const n = new Needs();
    n.update(2, { sprinting: false, cold: 0.8 });
    const cold = n.values.warmth;
    expect(cold).toBeLessThan(100);
    n.update(2, { sprinting: false, cold: 0 });
    expect(n.values.warmth).toBeGreaterThan(cold);
  });

  it('meldet Stufen', () => {
    const n = new Needs();
    n.values.hunger = 30;
    expect(n.level('hunger')).toBe('low');
    n.values.hunger = 10;
    expect(n.level('hunger')).toBe('critical');
  });
});

describe('Health', () => {
  it('verblutet an einer tiefen Wunde ohne Versorgung und nennt die Ursache', () => {
    const h = new Health(), n = new Needs();
    h.wound('torso', 'deep', 'Messer', () => 1);
    h.update(10, n, () => 1);
    expect(h.dead).toBe(true);
    expect(h.cause).toBe('Verblutet');
  });

  it('ein Verband stoppt die Blutung', () => {
    const h = new Health(), n = new Needs();
    const w = h.wound('armL', 'cut', 'Splitter', () => 0.5);
    w.bandaged = true;
    w.bandageLife = 8;
    expect(h.bleeding).toBe(false);
    h.update(1, n, () => 1);
    expect(h.dead).toBe(false);
  });

  it('Durst bei 0 schadet, regeneriert sonst', () => {
    const h = new Health(), n = new Needs();
    h.hp = 50;
    h.update(1, n);
    expect(h.hp).toBeGreaterThan(50);
    n.values.thirst = 0;
    const before = h.hp;
    h.update(1, n);
    expect(h.hp).toBeLessThan(before);
  });
});

describe('Loot', () => {
  it('ist bei gleicher RNG identisch und nutzt nur bekannte Items', () => {
    expect(rollLoot(rng(42))).toEqual(rollLoot(rng(42)));
    const inv = new Inventory(1000);
    for (let s = 0; s < 200; s++) for (const st of rollLoot(rng(s))) inv.add(st.id, st.qty);
    expect(inv.stacks.length).toBeGreaterThan(0);
  });
});
