import { describe, expect, it } from 'vitest';
import { StatRegister } from '../src/sim/StatRegister';
import { MOODLES, evalMoodles, moodleLevel } from '../src/data/moodles';
import { GameTime } from '../src/core/Time';
import { LOOT_LISTS, LOOT_ROUTES, lootListFor, rollList, rollLoot } from '../src/data/loot';
import { ITEMS, hasTag, item } from '../src/data/items';
import { RECIPES, Recipe, missingFor } from '../src/data/recipes';
import { Needs } from '../src/player/Needs';
import { Inventory } from '../src/player/Inventory';
import { rng } from '../src/world/CityGenerator';

describe('StatRegister', () => {
  it('begrenzt Werte, kennt Standard und Anteil', () => {
    const s = new StatRegister();
    s.define('x', 0, 10, 4);
    expect(s.get('x')).toBe(4);
    expect(s.set('x', 99)).toBe(true);
    expect(s.get('x')).toBe(10);
    expect(s.isAtMax('x')).toBe(true);
    expect(s.set('x', 20)).toBe(false); // keine Änderung
    s.add('x', -15);
    expect(s.isAtMin('x')).toBe(true);
    s.reset('x');
    expect(s.get('x')).toBe(4);
    expect(s.ratio('x')).toBeCloseTo(0.4);
  });

  it('lehnt doppelte, unbekannte und unsinnige Werte ab', () => {
    const s = new StatRegister();
    s.define('x', 0, 1);
    expect(() => s.define('x', 0, 1)).toThrow();
    expect(() => s.get('y')).toThrow();
    expect(() => s.define('z', 0, 1, 5)).toThrow();
  });

  it('Momentaufnahme und Wiederherstellen', () => {
    const s = new StatRegister();
    s.define('a', 0, 100, 10);
    s.define('b', -1, 1, 0);
    s.set('a', 70);
    const snap = s.snapshot();
    s.resetAll();
    s.restore(snap);
    expect(s.get('a')).toBe(70);
    expect(s.get('b')).toBe(0);
  });

  it('Needs liegen im Register und bleiben begrenzt', () => {
    const n = new Needs();
    expect(n.stats.ids()).toEqual(['hunger', 'thirst', 'energy', 'warmth']);
    n.values.hunger = 500;
    expect(n.stats.get('hunger')).toBe(100);
    n.stats.set('thirst', 33);
    expect(n.values.thirst).toBe(33);
    n.update(100, { sprinting: true, cold: 1 });
    for (const k of n.stats.ids()) expect(n.stats.get(k)).toBeGreaterThanOrEqual(0);
  });
});

describe('Moodles', () => {
  const def = (id: string) => MOODLES.find((m) => m.id === id)!;

  it('Stufen bei fallenden Werten (Hunger)', () => {
    const h = def('hunger');
    expect([90, 65, 50, 35, 15, 0].map((v) => moodleLevel(h, v))).toEqual([0, 1, 2, 3, 4, 4]);
  });

  it('Stufen bei steigenden Werten (Last)', () => {
    const l = def('load');
    expect([0.5, 0.7, 0.8, 0.95, 1.2].map((v) => moodleLevel(l, v))).toEqual([0, 1, 2, 3, 4]);
  });

  it('liefert nur aktive Moodles, schlimmste zuerst', () => {
    const list = evalMoodles({ hunger: 80, thirst: 10, tired: 60, load: 0.75, bleeding: 0 });
    expect(list.map((m) => m.id)).toEqual(['thirst', 'tired', 'load']);
    expect(list[0].level).toBe(4);
    expect(list[0].label).toBe('Verdurstend');
  });

  it('Schwellen sind sortiert', () => {
    for (const m of MOODLES) {
      const l = [...m.limits];
      expect(m.dir === 'low' ? [...l].sort((a, b) => b - a) : [...l].sort((a, b) => a - b)).toEqual(l);
    }
  });
});

describe('Spiel-Takt', () => {
  it('meldet Minuten-, Stunden- und Tageswechsel', () => {
    const t = new GameTime();
    t.timeScale = 1;
    t.seconds = 3599;
    const log: string[] = [];
    t.on('minute', () => log.push('m'));
    t.on('hour', () => log.push('h'));
    t.on('day', () => log.push('d'));
    t.advance(1); // 3600 s: neue Minute und neue Stunde
    expect(log).toEqual(['m', 'h']);
    t.advance(30);
    expect(log).toEqual(['m', 'h']);
    t.advance(60);
    expect(log.filter((x) => x === 'm').length).toBe(2);
  });

  it('holt bei großen Sprüngen nach und löst den Tageswechsel aus', () => {
    const t = new GameTime();
    t.timeScale = 1;
    t.seconds = 86400 - 30;
    let days = 0, minutes = 0;
    t.on('day', () => days++);
    t.on('minute', () => minutes++);
    t.advance(120);
    expect(days).toBe(1);
    expect(t.day).toBe(2);
    expect(minutes).toBe(2);
  });

  it('Abmelden funktioniert', () => {
    const t = new GameTime();
    t.timeScale = 1;
    let n = 0;
    const off = t.on('minute', () => n++);
    t.advance(60);
    off();
    t.advance(60);
    expect(n).toBe(1);
  });
});

describe('Items mit Tags', () => {
  it('jedes Item trägt seine Kategorie als Tag', () => {
    for (const d of Object.values(ITEMS)) expect(d.tags).toContain(d.category);
  });
  it('Zusatz-Tags und hasTag', () => {
    expect(hasTag('wood', 'fuel')).toBe(true);
    expect(hasTag('apple', 'fuel')).toBe(false);
    expect(item('flashlight').tags).toContain('light');
  });
});

describe('Rezepte', () => {
  it('missingFor nennt fehlendes Werkzeug und Zutaten', () => {
    const r: Recipe = { id: 't', inputs: [{ id: 'cloth', qty: 2 }], output: { id: 'bandage', qty: 1 }, tools: ['light'] };
    const inv = new Inventory(14);
    expect(missingFor(r, inv)).toEqual(['Werkzeug: light', 'cloth']);
    inv.add('cloth', 2);
    inv.wear('flashlight');
    expect(missingFor(r, inv)).toEqual([]);
  });

  it('vorhandene Rezepte verweisen auf bekannte Items', () => {
    for (const r of RECIPES) {
      for (const i of [...r.inputs, r.output]) expect(() => item(i.id)).not.toThrow();
    }
  });
});

describe('Loot-Tabellen', () => {
  it('alle Listen verwenden bekannte Items und sinnvolle Werte', () => {
    for (const [name, list] of Object.entries(LOOT_LISTS)) {
      expect(list.empty, name).toBeGreaterThanOrEqual(0);
      expect(list.empty, name).toBeLessThan(1);
      expect(list.rolls[0], name).toBeLessThanOrEqual(list.rolls[1]);
      for (const [id, w, min, max] of list.items) {
        expect(() => item(id), `${name}:${id}`).not.toThrow();
        expect(w).toBeGreaterThan(0);
        expect(min).toBeLessThanOrEqual(max);
      }
    }
  });

  it('Routen zeigen auf vorhandene Listen', () => {
    for (const [route, list] of Object.entries(LOOT_ROUTES)) expect(LOOT_LISTS[list], route).toBeDefined();
  });

  it('wählt die Liste nach Raum und Behälter', () => {
    expect(lootListFor('bedroom', 'wardrobe')).toBe(LOOT_LISTS.clothes);
    expect(lootListFor('kitchen', 'cabinet')).toBe(LOOT_LISTS.food);
    expect(lootListFor('bath', 'sink')).toBe(LOOT_LISTS.medical);
    expect(lootListFor('shop', 'fridge')).toBe(LOOT_LISTS.food);
    expect(lootListFor('living', 'shelf')).toBe(LOOT_LISTS.generic);
    expect(lootListFor()).toBe(LOOT_LISTS.generic);
  });

  it('Küche liefert nur Essbares, Bad vor allem Medizin', () => {
    const food = new Set(LOOT_LISTS.food.items.map((e) => e[0]));
    for (let s = 0; s < 150; s++) for (const st of rollLoot(rng(s), 'kitchen', 'cabinet')) expect(food.has(st.id)).toBe(true);
    let bandages = 0;
    for (let s = 0; s < 150; s++) bandages += rollLoot(rng(s), 'bath', 'sink').filter((x) => x.id === 'bandage').length;
    expect(bandages).toBeGreaterThan(20);
  });

  it('Würfeln ist bei gleicher RNG deterministisch; Mengen liegen in den Grenzen', () => {
    expect(rollLoot(rng(7), 'storage', 'crate')).toEqual(rollLoot(rng(7), 'storage', 'crate'));
    const list = { rolls: [1, 1] as [number, number], empty: 0, items: [['coin', 1, 3, 5] as [string, number, number, number]] };
    for (let s = 0; s < 50; s++) {
      const [st] = rollList(list, rng(s));
      expect(st.id).toBe('coin');
      expect(st.qty).toBeGreaterThanOrEqual(3);
      expect(st.qty).toBeLessThanOrEqual(5);
    }
  });
});
