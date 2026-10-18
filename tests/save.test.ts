import { beforeEach, describe, expect, it } from 'vitest';
import { Inventory } from '../src/player/Inventory';
import { Health } from '../src/player/Health';
import { Skills } from '../src/sim/Skills';
import { StatRegister } from '../src/sim/StatRegister';
import { Explored } from '../src/world/Explored';

/** Minimaler localStorage-Ersatz für die Tests (Node hat keinen) */
function installStorage(): void {
  const m = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

describe('Spielstände: Zustand', () => {
  it('Inventar übersteht Speichern und Laden mit Rucksack, Seitentaschen und Schnellleiste', () => {
    const inv = new Inventory(14);
    inv.wear('hikingpack');
    inv.addTo('bag', 'bread', 3);
    inv.addTo('side', 'bandage', 2);
    inv.addTo('main', 'apple', 2);
    inv.hotbar[0] = 'bread';
    const copy = new Inventory(14);
    copy.fromJSON(JSON.parse(JSON.stringify(inv.toJSON())));
    expect(copy.list('bag')).toEqual(inv.list('bag'));
    expect(copy.list('side')).toEqual(inv.list('side'));
    expect(copy.list('main')).toEqual(inv.list('main'));
    expect(copy.equipment.back).toBe('hikingpack');
    expect(copy.hotbar[0]).toBe('bread');
    expect(copy.weight).toBe(inv.weight);
  });

  it('Gesundheit mit Wunden und Infektion bleibt erhalten', () => {
    const h = new Health();
    h.hp = 61;
    h.infect(() => 0.5);
    h.parts.armL.wounds.push({ kind: 'cut', label: 'Schnitt', depth: 1, bleed: 1, bandaged: false, infection: 12 } as never);
    const c = new Health();
    c.fromJSON(JSON.parse(JSON.stringify(h.toJSON())));
    expect(c.hp).toBe(61);
    expect(c.virus).toBe(h.virus);
    expect(c.parts.armL.wounds.length).toBe(1);
    expect(c.parts.armL.wounds[0]).toEqual(h.parts.armL.wounds[0]);
  });

  it('Fertigkeiten und Werte-Register werden zurückgesetzt und geladen', () => {
    const s = new Skills();
    s.add('strength', 40);
    const c = new Skills();
    c.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    expect(c.level('strength')).toBe(s.level('strength'));
    const r = new StatRegister();
    r.define('hunger', 0, 100, 85);
    r.set('hunger', 33);
    const r2 = new StatRegister();
    r2.define('hunger', 0, 100, 85);
    r2.fromJSON(JSON.parse(JSON.stringify(r.toJSON())));
    expect(r2.get('hunger')).toBe(33);
  });

  it('Erkundete Karte wird verlustfrei gespeichert', () => {
    const a = new Explored();
    a.reveal(30, 40);
    const b = new Explored();
    b.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
    expect(b.at(30, 40)).toBe(a.at(30, 40));
    expect(b.at(30, 40)).toBeGreaterThan(0.9);
  });
});

describe('Spielstände: Speicher', () => {
  beforeEach(installStorage);

  it('speichert, listet (neueste zuerst), benennt um und löscht', async () => {
    const S = await import('../src/core/SaveSystem');
    const mk = (id: string, t: number): import('../src/core/SaveSystem').SaveFile => ({
      meta: { id, name: id, savedAt: t, day: 2, seconds: 3600 * 9, playtime: 125, hp: 80, who: 'Test', thumb: '', auto: false, version: S.SAVE_VERSION },
      data: { hello: id },
    });
    expect(await S.writeSave(mk('a', 1000))).toBe(true);
    expect(await S.writeSave(mk('b', 2000))).toBe(true);
    expect((await S.listSaves()).map((m) => m.id)).toEqual(['b', 'a']);
    expect((await S.readSave('a'))!.data).toEqual({ hello: 'a' });
    expect(await S.renameSave('a', '  Mein <b>Stand</b>  ')).toBe(true);
    expect((await S.readSave('a'))!.meta.name).toBe('Mein bStand/b');
    await S.deleteSave('b');
    expect((await S.listSaves()).map((m) => m.id)).toEqual(['a']);
    expect(await S.readSave('gibtsnicht')).toBeNull();
  });

  it('Beschriftungen für Zeit und Spieldauer', async () => {
    const S = await import('../src/core/SaveSystem');
    expect(S.whenLabel({ day: 4, seconds: 8 * 3600 + 30 * 60 })).toBe('Tag 4, 08:30');
    expect(S.playLabel(125)).toBe('2 Min.');
    expect(S.playLabel(7500)).toBe('2 Std. 05 Min.');
  });
});
