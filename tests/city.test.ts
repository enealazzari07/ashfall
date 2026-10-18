import { describe, expect, it } from 'vitest';
import { Mesh } from 'three';
import {
  BuildingSpec, CHUNK, FLOOR_H, generateChunk, sideFrame, urbanity,
} from '../src/world/CityGenerator';
import { buildFacade } from '../src/world/Facade';

function allBuildings(range = 6): BuildingSpec[] {
  const out: BuildingSpec[] = [];
  for (let cx = -range; cx <= range; cx++) for (const cz of [-1, 0, 1, 3, 5, 7]) out.push(...generateChunk(cx, cz).buildings);
  return out;
}

describe('Stadtzonen', () => {
  it('Innenstadt liegt am Start, Vororte weiter draußen', () => {
    expect(urbanity(0, 0)).toBeGreaterThan(0.6);
    expect(urbanity(40, 40)).toBeLessThan(0.45);
    for (let i = -20; i < 20; i++) {
      const u = urbanity(i, i * 2);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
    }
  });

  it('der Startbereich hat Hochhäuser, der Rand hat Wohnhäuser', () => {
    const centre = [0, 1].flatMap((cz) => [-1, 0, 1].flatMap((cx) => generateChunk(cx, cz).buildings));
    expect(Math.max(...centre.map((b) => b.floors))).toBeGreaterThanOrEqual(4);
    const kinds = new Set(allBuildings(12).map((b) => b.kind));
    for (const k of ['house', 'shop', 'apartment', 'garage', 'industry', 'office', 'hotel']) expect(kinds.has(k as never)).toBe(true);
  });

  it('Chunk (0,0) hat immer ein Gebäude am Spawn-Grundstück', () => {
    expect(generateChunk(0, 0).buildings.length).toBeGreaterThan(0);
  });
});

describe('Fenster', () => {
  const all = allBuildings();

  it('liegen innerhalb der Wand und überlappen weder sich noch die Tür', () => {
    expect(all.length).toBeGreaterThan(50);
    for (const b of all) {
      for (const w of b.windows) {
        const len = sideFrame(b, w.side).len;
        expect(Math.abs(w.u) + w.w / 2).toBeLessThanOrEqual(len / 2 - 0.4);
        expect(w.floor).toBeLessThan(b.floors);
        expect(w.y0 + w.h).toBeLessThanOrEqual((w.floor + 1) * FLOOR_H - 0.2);
        if (w.side === b.door && w.floor === 0) expect(Math.abs(w.u) - w.w / 2).toBeGreaterThanOrEqual(b.doorW / 2 + 0.1);
      }
      const bySlot = new Map<string, typeof b.windows>();
      for (const w of b.windows) bySlot.set(`${w.side}:${w.floor}`, [...(bySlot.get(`${w.side}:${w.floor}`) ?? []), w]);
      for (const list of bySlot.values()) {
        list.sort((p, q) => p.u - q.u);
        for (let i = 1; i < list.length; i++) expect(list[i].u - list[i].w / 2).toBeGreaterThan(list[i - 1].u + list[i - 1].w / 2);
      }
    }
  });

  it('es gibt Glas, zerbrochene, vernagelte und mit Läden verschlossene Fenster', () => {
    const states = new Set(all.flatMap((b) => b.windows.map((w) => w.state)));
    expect(states).toEqual(new Set(['glass', 'broken', 'boarded', 'shutter', 'roll']));
  });

  it('verbarrikadierte Häuser haben im Erdgeschoss überwiegend Bretter', () => {
    const forts = all.filter((b) => b.fortified);
    expect(forts.length).toBeGreaterThan(5);
    let boarded = 0, total = 0;
    for (const b of forts) for (const w of b.windows) if (w.floor === 0) { total++; if (w.state === 'boarded' || w.state === 'roll') boarded++; }
    expect(boarded / total).toBeGreaterThan(0.6);
  });

  it('Geschäfte haben Schild und Schaufenster neben der Tür', () => {
    const shops = all.filter((b) => b.kind === 'shop');
    expect(shops.length).toBeGreaterThan(5);
    for (const b of shops) {
      expect(b.shopName).toBeTruthy();
      const sf = b.windows.filter((w) => w.storefront);
      expect(sf.length === 0 || sf.length === 2).toBe(true);
    }
  });
});

describe('Fassade', () => {
  it('baut vier Wände mit Öffnungen und obere Stockwerke getrennt', () => {
    const tall = allBuildings().find((b) => b.floors >= 4)!;
    const f = buildFacade(tall, 1);
    expect(f.sides).toHaveLength(4);
    expect(f.tower.children.length).toBeGreaterThan(0);
    const normals = f.sides.map((s) => `${s.nx},${s.nz}`).sort();
    expect(normals).toEqual(['-1,0', '0,-1', '0,1', '1,0']);
    for (const s of f.sides) {
      let meshes = 0;
      s.group.traverse((c) => { if (c instanceof Mesh) meshes++; });
      expect(meshes).toBeGreaterThan(0);
      expect(s.low.children.length + s.high.children.length).toBeGreaterThan(0);
    }
  });

  it('einstöckige Häuser haben keine obere Hülle', () => {
    const low = allBuildings().find((b) => b.floors === 1)!;
    expect(buildFacade(low, 2).tower.children.length).toBe(0);
  });

  it('Chunks bleiben deterministisch', () => {
    expect(generateChunk(2, 1)).toEqual(generateChunk(2, 1));
    expect(CHUNK).toBe(64);
  });
});
