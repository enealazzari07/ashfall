import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ITEMS } from '../src/data/items';
import { WEAPONS } from '../src/data/weapons';
import { LOOT_LISTS } from '../src/data/loot';
import { PZ_ITEMS, PZ_ICONS, PZ_FIREARMS, PZ_MELEE, PZ_TOOL_BUILD, WEAPON_ICON_IDS, PZ_WEAPON_ITEMS, PZ_MAGAZINES, PZ_BOX_CONTENT, PZ_LOOT_ADD, ICON_KINDS, registerPz, newGun, fire, reload, falloff, unpack } from '../src/pz';

describe('PZ-Items', () => {
  it('hat hunderte Items mit Icon-Motiv und ohne Kollision mit bestehenden Ids', () => {
    const ids = Object.keys(PZ_ITEMS);
    expect(ids.length).toBeGreaterThan(500);
    for (const id of ids) {
      expect(id.startsWith('pz_')).toBe(true);
      expect(ITEMS[id]).toBeUndefined();
      const d = PZ_ITEMS[id];
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.weight).toBeGreaterThan(0);
      expect(ICON_KINDS).toContain(PZ_ICONS[id][0]);
    }
  });
  it('Waffen, Magazine, Boxen und Loot verweisen auf existierende Items', () => {
    for (const f of Object.values(PZ_FIREARMS)) {
      expect(PZ_ITEMS[f.id]).toBeDefined();
      expect(PZ_ITEMS[f.ammo]).toBeDefined();
      if (f.magItem) expect(PZ_MAGAZINES[f.magItem][0]).toBe(f.mag);
    }
    for (const id of Object.keys(PZ_MELEE)) expect(PZ_ITEMS[id].equip?.slot).toBe('hand');
    for (const [box, [inner]] of Object.entries(PZ_BOX_CONTENT)) { expect(PZ_ITEMS[box]).toBeDefined(); expect(PZ_ITEMS[inner]).toBeDefined(); }
    for (const list of Object.values(PZ_LOOT_ADD)) for (const [id] of list) expect(PZ_ITEMS[id], id).toBeDefined();
  });
  it('registerPz ist idempotent und verändert nur die übergebenen Tabellen', () => {
    const items = { ...ITEMS };
    const weapons = { ...WEAPONS };
    const loot = structuredClone(LOOT_LISTS);
    registerPz({ items, weapons, loot });
    const n = loot.food.items.length;
    registerPz({ items, weapons, loot });
    expect(loot.food.items.length).toBe(n);
    expect(items.pz_katana.tags).toContain('weapon');
    expect(weapons.pz_katana.max).toBeGreaterThan(0);
    expect(ITEMS.pz_katana).toBeUndefined();
  });
  it('unpack liefert Schachtelinhalt', () => {
    expect(unpack('pz_box_9mm')).toEqual({ id: 'pz_bullets_9mm', qty: 20 });
    expect(unpack('pz_katana')).toBeNull();
  });
});

describe('PZ-Schusswaffen', () => {
  const rngSeq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };
  it('schießt, verbraucht Munition und beachtet Cooldown', () => {
    const def = PZ_FIREARMS.pz_pistol_m9;
    const st = newGun(def, 2);
    const a = fire(st, def, 0, 1, 0, rngSeq(0.5));
    expect(a.fired).toBe(true);
    expect(a.shots).toHaveLength(1);
    expect(a.shots[0].dx).toBeCloseTo(1);
    expect(fire(st, def, 0.01, 1, 0).why).toBe('cooldown');
    expect(fire(st, def, 1, 1, 0).fired).toBe(true);
    expect(fire(st, def, 2, 1, 0).why).toBe('empty');
  });
  it('Schrot streut in mehrere Kugeln innerhalb des Öffnungswinkels', () => {
    const def = PZ_FIREARMS.pz_shotgun;
    const r = fire(newGun(def, 5), def, 0, 0, 1);
    expect(r.shots).toHaveLength(def.pellets);
    for (const s of r.shots) {
      expect(Math.hypot(s.dx, s.dz)).toBeCloseTo(1);
      expect(Math.acos(Math.min(1, s.dz)) * 180 / Math.PI).toBeLessThanOrEqual(def.spread + 0.01);
    }
  });
  it('Nachladen füllt nur bis zur Magazingröße und nur mit Vorrat', () => {
    const def = PZ_FIREARMS.pz_pistol_m9;
    const st = newGun(def, 10);
    expect(reload(st, def, 100)).toMatchObject({ loaded: 15, used: 5 });
    expect(reload(st, def, 3)).toMatchObject({ loaded: 13, used: 3 });
    expect(reload(st, def, 0).used).toBe(0);
    const sg = PZ_FIREARMS.pz_shotgun;
    expect(reload(newGun(sg, 0), sg, 9).time).toBeCloseTo(sg.reload * 5);
  });
  it('Schaden fällt jenseits der Reichweite ab', () => {
    const def = PZ_FIREARMS.pz_rifle_hunting;
    expect(falloff(def, def.range)).toBe(1);
    expect(falloff(def, def.range * 1.5)).toBeLessThan(1);
    expect(falloff(def, def.range * 10)).toBe(0.25);
  });
});

describe('PZ-Waffen: Icons und Handmodelle', () => {
  it('jede Waffe hat ein eigenes Icon-Motiv und ein Handmodell', () => {
    for (const w of PZ_WEAPON_ITEMS) {
      expect(WEAPON_ICON_IDS, w.id).toContain(w.id);
      expect(PZ_TOOL_BUILD[w.id], w.id).toBeDefined();
    }
  });
  it('Handmodelle bauen ohne Fehler und haben sinnvolle Größe', () => {
    for (const w of PZ_WEAPON_ITEMS) {
      const g = new THREE.Group();
      g.add(...PZ_TOOL_BUILD[w.id]());
      g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g);
      const size = box.getSize(new THREE.Vector3());
      expect(Number.isFinite(size.x + size.y + size.z), w.id).toBe(true);
      const longest = Math.max(size.x, size.y, size.z);
      expect(longest, w.id).toBeGreaterThan(0.08);
      expect(longest, w.id).toBeLessThan(1.8);
      let meshes = 0;
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
      expect(meshes, w.id).toBeGreaterThanOrEqual(w.tags?.includes('firearm') ? 6 : 4);
    }
  });
});

import { Shooter, rayBox, rayTarget } from '../src/pz/pzShooter';
describe('PZ-Schießen: Treffer entlang des Strahls', () => {
  const zed = (x: number, z: number, hp = 30) => {
    const t = { x, z, alive: true, hp, hit(d: number) { t.hp -= d; if (t.hp <= 0) t.alive = false; return !t.alive; } };
    return t;
  };
  it('trifft das nächste Ziel auf dem Strahl, nicht das seitlich versetzte', () => {
    const a = zed(0, 10), b = zed(0, 5), c = zed(3, 5);
    expect(rayTarget(0, 0, 0, 1, 30, [a, b, c])?.target).toBe(b);
  });
  it('Wände halten Kugeln auf', () => {
    const wall = { x: 0, z: 3, w: 4, d: 0.2 };
    expect(rayBox(0, 0, 0, 1, wall)).toBeCloseTo(2.9);
    expect(rayTarget(0, 0, 0, 1, 30, [zed(0, 6)], [wall])).toBeNull();
    expect(rayTarget(0, 0, 0, 1, 30, [zed(0, 2)], [wall])).not.toBeNull();
  });
  it('Shooter: Schuss tötet, Munition sinkt, Speichern/Laden stellt den Stand her', () => {
    const def = PZ_FIREARMS.pz_rifle_hunting;
    const sh = new Shooter();
    sh.finishReload(def, 3);
    const z = zed(0, 8, 20);
    const r = sh.shoot(def, 0, 0, 0, 0, [z], () => 0.5, 1);
    expect(r.fired).toBe(true);
    expect(r.hits[0].killed).toBe(true);
    expect(sh.loaded(def.id)).toBe(2);
    const s2 = new Shooter();
    s2.load(sh.save());
    expect(s2.loaded(def.id)).toBe(2);
  });
});
