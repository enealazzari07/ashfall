import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  BuildingSpec, FLOOR_H, generateChunk, innerRect, laneRect, rampHeight, doorPlacement,
} from '../src/world/CityGenerator';
import { ChunkManager } from '../src/world/ChunkManager';
import { buildLevel } from '../src/world/Interior';

function tall(): BuildingSpec[] {
  const out: BuildingSpec[] = [];
  for (let cx = -4; cx <= 4; cx++) for (const cz of [-1, 0, 1, 3]) out.push(...generateChunk(cx, cz).buildings.filter((b) => b.floors > 1));
  return out;
}

const overlap = (a: { x0: number; x1: number; z0: number; z1: number }, b: { x0: number; x1: number; z0: number; z1: number }) =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

describe('Treppen', () => {
  const buildings = tall();

  it('jedes mehrstöckige Haus hat einen Treppenplan im Innenraum', () => {
    expect(buildings.length).toBeGreaterThan(20);
    for (const b of buildings) {
      expect(b.stairs).not.toBeNull();
      const ir = innerRect(b);
      for (const lane of [0, 1] as const) {
        const r = laneRect(b.stairs!, lane);
        expect(r.x0).toBeGreaterThanOrEqual(ir.x0 - 1e-6);
        expect(r.x1).toBeLessThanOrEqual(ir.x1 + 1e-6);
        expect(r.z0).toBeGreaterThanOrEqual(ir.z0 - 1e-6);
        expect(r.z1).toBeLessThanOrEqual(ir.z1 + 1e-6);
      }
      expect(overlap(laneRect(b.stairs!, 0), laneRect(b.stairs!, 1))).toBe(false);
    }
  });

  it('Möbel stehen nie auf Treppen oder Podesten, und nicht vor der Tür', () => {
    for (const b of buildings) {
      const lanes = [laneRect(b.stairs!, 0), laneRect(b.stairs!, 1)];
      for (const p of b.props) {
        const r = { x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2 };
        for (const l of lanes) expect(overlap(r, l)).toBe(false);
      }
      // die Tür führt nicht direkt in einen Treppenlauf
      const dp = doorPlacement(b);
      const inward = [[0, -1], [0, 1], [-1, 0], [1, 0]][b.door];
      const zone = {
        x0: dp.x + inward[0] * 1.3 - (inward[0] ? 1.3 : 1.1), x1: dp.x + inward[0] * 1.3 + (inward[0] ? 1.3 : 1.1),
        z0: dp.z + inward[1] * 1.3 - (inward[1] ? 1.3 : 1.1), z1: dp.z + inward[1] * 1.3 + (inward[1] ? 1.3 : 1.1),
      };
      for (const l of lanes) expect(overlap(zone, l)).toBe(false);
    }
  });

  it('Rampenhöhe steigt über ein Stockwerk, Läufe wechseln die Richtung', () => {
    const b = buildings[0];
    const plan = b.stairs!;
    const mid = (r: ReturnType<typeof laneRect>) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
    const a = laneRect(plan, 0), c = laneRect(plan, 1);
    const at = (lane: 0 | 1, f: number, t: number) => {
      const r = lane ? c : a;
      const m = mid(r);
      const u = plan.u0 + (plan.u1 - plan.u0) * (lane === 0 ? t : 1 - t);
      return plan.axis === 'z' ? rampHeight(plan, f, m.x, u) : rampHeight(plan, f, u, m.z);
    };
    expect(at(0, 0, 0)).toBeCloseTo(0);
    expect(at(0, 0, 0.5)).toBeCloseTo(FLOOR_H / 2);
    expect(at(0, 0, 1)).toBeCloseTo(FLOOR_H);
    expect(at(1, 1, 0)).toBeCloseTo(FLOOR_H);
    expect(at(1, 1, 1)).toBeCloseTo(2 * FLOOR_H);
    expect(rampHeight(plan, 0, b.x + 100, b.z)).toBeNull();
  });

  it('oberes Stockwerk: Loch im Boden, Geländer und Kollision nur auf der richtigen Etage', () => {
    const b = buildings.find((x) => x.floors >= 3)!;
    const lvl = buildLevel(b, 1);
    expect(lvl.colliders.some((c) => c.lv === 1)).toBe(true);
    expect(lvl.group.position.y).toBeCloseTo(FLOOR_H);
    // ein Treppenlauf von Etage 1 nach oben existiert
    expect(lvl.colliders.some((c) => c.lv === 2)).toBe(true);
    const top = buildLevel(b, b.floors - 1);
    expect(top.colliders.every((c) => c.lv !== b.floors)).toBe(true);
  });
});

describe('Welt: Höhe und Etagen', () => {
  it('surfaceY folgt der Rampe und bleibt auf dem Etagenboden', () => {
    const cm = new ChunkManager();
    cm.preload(4, 4);
    const b = generateChunk(0, 0).buildings.find((x) => x.floors > 2)!;
    const plan = b.stairs!;
    const r = laneRect(plan, 0);
    const mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
    const at = (t: number) => (plan.axis === 'z' ? [mx, plan.u0 + (plan.u1 - plan.u0) * t] : [plan.u0 + (plan.u1 - plan.u0) * t, mz]);
    expect(cm.surfaceY(at(0.5)[0], at(0.5)[1], 0)).toBeCloseTo(FLOOR_H / 2, 1);
    expect(cm.surfaceY(at(0.999)[0], at(0.999)[1], FLOOR_H - 0.2)).toBeGreaterThan(FLOOR_H - 0.1);
    // draußen (Kreuzung) ist es immer eben
    expect(cm.surfaceY(4, 4, 5)).toBe(0);
    expect(cm.levelAt(4, 4, 3)).toBe(0);
  });

  it('Kollision gilt nur auf der Etage der Box', () => {
    const cm = new ChunkManager();
    cm.preload(4, 4);
    const far = (b: BuildingSpec, p: { x: number; z: number }) =>
      [0, 1].every((l) => {
        const r = laneRect(b.stairs!, l as 0 | 1);
        return p.x < r.x0 - 2 || p.x > r.x1 + 2 || p.z < r.z0 - 2 || p.z > r.z1 + 2;
      });
    const b = generateChunk(0, 0).buildings.find((x) => x.floors > 2 && x.props.some((p) => p.level === 0 && far(x, p)))!;
    const prop = b.props.find((p) => p.level === 0 && far(b, p))!;
    const p = new Vector3(prop.x, 0, prop.z);
    cm.resolve(p, 0.4, 0);
    expect(Math.abs(p.x - prop.x) >= prop.w / 2 || Math.abs(p.z - prop.z) >= prop.d / 2).toBe(true);
    // auf Etage 1 steht dort kein Möbelstück: das Ergebnis unterscheidet sich vom Erdgeschoss
    const q = new Vector3(prop.x, 0, prop.z);
    cm.resolve(q, 0.4, 1);
    expect(q.distanceTo(p)).toBeGreaterThan(0.05);
  });
});
