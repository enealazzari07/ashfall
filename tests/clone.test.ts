import { describe, expect, it } from 'vitest';
import { ActionQueue, MOVE_LIMIT, transferTime } from '../src/sim/Actions';
import { ZombieKind, createZombie, zombieKind } from '../src/render/Character';
import { lootListFor, rollLoot } from '../src/data/loot';
import { chunkRng } from '../src/world/ZombieWorld';
import { CAR_MODELS, makeCar } from '../src/render/CarModel';

describe('Zeitaktionen', () => {
  it('führt Aktionen nacheinander aus', () => {
    const q = new ActionQueue();
    const log: string[] = [];
    q.add({ label: 'a', duration: 1, run: () => log.push('a') });
    q.add({ label: 'b', duration: 0.5, run: () => log.push('b') });
    const p = { x: 0, z: 0 };
    q.update(0.9, p);
    expect(log).toEqual([]);
    expect(q.progress).toBeGreaterThan(0.8);
    q.update(0.2, p);
    expect(log).toEqual(['a']);
    expect(q.waiting).toBe(0);
    q.update(0.6, p);
    expect(log).toEqual(['a', 'b']);
    expect(q.busy).toBe(false);
  });

  it('bricht ab, wenn der Spieler losläuft', () => {
    const q = new ActionQueue();
    let ran = false;
    q.add({ label: 'x', duration: 2, run: () => (ran = true) });
    q.update(0.1, { x: 0, z: 0 });
    const r = q.update(0.1, { x: MOVE_LIMIT + 0.5, z: 0 });
    expect(r.cancelled).toBe(true);
    expect(q.busy).toBe(false);
    expect(ran).toBe(false);
  });

  it('schwere Dinge dauern länger', () => {
    expect(transferTime(5)).toBeGreaterThan(transferTime(0.1));
  });
});

describe('Zombie-Look', () => {
  it('alle Typen kommen vor und lassen sich bauen', () => {
    const kinds = new Set<ZombieKind>();
    for (let i = 0; i < 40; i++) {
      kinds.add(zombieKind(i));
      expect(createZombie(i).children.length).toBeGreaterThan(0);
    }
    expect(kinds.size).toBe(7);
  });

  it('negative Seeds funktionieren', () => {
    expect(() => createZombie(-17)).not.toThrow();
  });
});

describe('Leichen und Kofferraum', () => {
  it('Leichen haben eine eigene Beuteliste', () => {
    expect(lootListFor(undefined, 'corpse')).not.toBe(lootListFor(undefined, 'wardrobe'));
  });

  it('Kofferraum-Loot ist deterministisch', () => {
    const a = rollLoot(chunkRng(10, 20, 33), undefined, 'car');
    const b = rollLoot(chunkRng(10, 20, 33), undefined, 'car');
    expect(a).toEqual(b);
  });

  it('Deckel öffnet und schließt wieder', () => {
    const rig = makeCar(0x884444, 0);
    const lid = rig.group.getObjectByProperty('type', 'Group');
    expect(lid).toBeTruthy();
    expect(() => {
      rig.setLid('trunk', 1);
      rig.setLid('hood', 1);
      rig.setLid('trunk', 0);
    }).not.toThrow();
    for (let m = 0; m < CAR_MODELS.length; m++) expect(() => makeCar(0x444444, m).setLid('trunk', 0.5)).not.toThrow();
  });
});

describe('Charakter-Look', () => {
  it('Zombies unterscheiden sich in Statur und Gangart', async () => {
    const { createZombie, animateZombie } = await import('../src/render/Character');
    const sizes = new Set<string>(), styles = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const z = createZombie(i);
      sizes.add(z.scale.y.toFixed(2));
      styles.add(z.userData.rig.zstyle);
      for (let k = 0; k < 5; k++) animateZombie(z, k % 2 ? 1.2 : 0, 0.05, k / 4);
    }
    expect(sizes.size).toBeGreaterThan(5);
    expect(styles.size).toBe(4);
  });

  it('Kleidung ändert Ärmel und Zusatzteile', async () => {
    const { createCharacter, dressCharacter } = await import('../src/render/Character');
    const c = createCharacter({ jacket: 0x333333 });
    const slot = c.userData.rig.slots.body;
    dressCharacter(c, { body: 'jacket' });
    const jacketParts = slot.children.length;
    expect(jacketParts).toBeGreaterThan(0);
    dressCharacter(c, { body: 'hoodie' });
    expect(slot.children.length).not.toBe(jacketParts);
    dressCharacter(c, {});
    expect(slot.children.length).toBe(0);
    expect(c.userData.rig.cuffs.every((m: { visible: boolean }) => !m.visible)).toBe(true);
  });
});

describe('Möbel', () => {
  it('jede Möbelart hat ein Modell und die neuen Arten stehen in der Raumeinrichtung', async () => {
    const { PROP_KINDS } = await import('../src/world/CityGenerator');
    const { propsGeometry } = await import('../src/world/Props');
    PROP_KINDS.forEach((k, i) => {
      const p = { x: 0, z: 0, w: 1, d: 1, lw: k.w[0], ld: k.d[0], h: k.h[0], color: k.color, kind: i, yaw: 0, loot: [], level: 0 };
      const geo = propsGeometry([p]);
      expect(geo, k.id).toBeTruthy();
      expect(geo!.attributes.position.count, k.id).toBeGreaterThan(8);
    });
    for (const id of ['dresser', 'kitchenunit', 'washer', 'trashcan']) expect(PROP_KINDS.some((k) => k.id === id)).toBe(true);
  });
});

describe('Autos: Livery und Verschleiß', () => {
  it('Aufleger gibt es nur für Liveries und Verschleiß, gleiche Parameter ergeben dasselbe Netz', async () => {
    const { decalGeo, CAR_MODELS } = await import('../src/render/CarModel');
    expect(decalGeo(0, 'none', 0)).toBeNull();
    for (let m = 0; m < CAR_MODELS.length; m++) {
      for (const lv of ['police', 'taxi', 'ambulance'] as const) expect(decalGeo(m, lv, 0), `${m} ${lv}`).toBeTruthy();
      expect(decalGeo(m, 'none', 3)!.attributes.position.count).toBeGreaterThan(decalGeo(m, 'none', 1)!.attributes.position.count);
    }
    expect(decalGeo(2, 'taxi', 1)).toBe(decalGeo(2, 'taxi', 1));
  });

  it('parkende Autos tragen Dienst-Lackierungen und Verschleiß', async () => {
    const { newCar } = await import('../src/world/CityGenerator');
    const { rng } = await import('../src/world/CityGenerator');
    const r = rng(12345);
    const seen = new Set<string>(), tiers = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const c = newCar(r, i, i, 0);
      seen.add(c.livery ?? 'none');
      tiers.add(c.tier ?? 0);
    }
    expect([...seen].sort()).toEqual(['ambulance', 'none', 'police', 'taxi']);
    expect(tiers.size).toBe(4);
  });

  it('Verschleiß färbt den Lack ins Braune', async () => {
    const { weathered } = await import('../src/render/CarModel');
    const clean = weathered(0x3a6fb8, 0), worn = weathered(0x3a6fb8, 3);
    expect(clean).toBe(0x3a6fb8);
    expect((worn >> 16) & 255).toBeGreaterThan(0x3a * 0.8);
    expect(worn & 255).toBeLessThan(0xb8);
  });
});

describe('Fassaden', () => {
  it('Farbmischung und Fassaden aller Gebäudearten bauen fehlerfrei', async () => {
    const { mixColor, buildFacade } = await import('../src/world/Facade');
    expect(mixColor(0xffffff, 0x000000, 0)).toBe(0xffffff);
    expect(mixColor(0xffffff, 0x000000, 1)).toBe(0x000000);
    const mid = mixColor(0xff0000, 0x0000ff, 0.5);
    expect((mid >> 16) & 255).toBeGreaterThan(120);
    expect(mid & 255).toBeGreaterThan(120);
    expect((mid >> 8) & 255).toBe(0);
    const { generateChunk } = await import('../src/world/CityGenerator');
    const kinds = new Set<string>();
    for (let cx = 0; cx < 4 && kinds.size < 5; cx++) {
      for (const b of generateChunk(cx, 1).buildings) {
        kinds.add(b.kind);
        const f = buildFacade(b, 1);
        expect(f.sides.length).toBe(4);
      }
    }
    expect(kinds.size).toBeGreaterThan(1);
  });
});
