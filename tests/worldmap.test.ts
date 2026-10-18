import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CELL_H, CELL_W, cellPaths, cityOf, clearance, edgeRoad, highwayZ, isCityChunk, poseAt, slicesFor } from '../src/world/WorldMap';
import { generateChunk } from '../src/world/CityGenerator';
import { stripGeo } from '../src/render/RoadRibbon';

describe('WorldMap', () => {
  it('jede Stadt hat höchstens 6 × 5 Chunks und liegt in ihrer Zelle', () => {
    for (let rx = -3; rx <= 3; rx++) {
      for (let rz = -3; rz <= 3; rz++) {
        const c = cityOf(rx, rz);
        expect(c.w).toBeLessThanOrEqual(6);
        expect(c.h).toBeLessThanOrEqual(5);
        expect(c.cx0).toBeGreaterThanOrEqual(rx * CELL_W - CELL_W / 2);
        expect(c.cx0 + c.w).toBeLessThanOrEqual(rx * CELL_W + CELL_W / 2);
        expect(c.cz0).toBeGreaterThanOrEqual(rz * CELL_H - CELL_H / 2);
        expect(c.cz0 + c.h).toBeLessThanOrEqual(rz * CELL_H + CELL_H / 2);
      }
    }
  });

  it('Stadtchunks: höchstens 30 je Stadt, dazwischen Natur', () => {
    let n = 0;
    for (let cx = -9; cx < 9; cx++) for (let cz = -8; cz < 8; cz++) if (isCityChunk(cx, cz)) n++;
    expect(n).toBeLessThanOrEqual(30);
    expect(n).toBeGreaterThan(15);
    expect(isCityChunk(8, 0)).toBe(false);
  });

  it('Ringstraße an der Stadtgrenze, keine Straße mitten in der Natur', () => {
    const c = cityOf(0, 0);
    expect(edgeRoad('W', c.cx0, 0)).toBe(true); // Westrand der Stadt
    expect(edgeRoad('W', c.cx0 + c.w, 0)).toBe(true); // Ostrand gehört dem Chunk daneben
    expect(edgeRoad('N', 0, c.cz0 + c.h)).toBe(true); // Südrand
    expect(edgeRoad('W', 12, 0)).toBe(false);
    expect(edgeRoad('N', 12, 0)).toBe(false);
  });

  it('Autobahn ist kurvig und hält Abstand zur Stadt', () => {
    const zs: number[] = [];
    for (let x = -576; x < 576; x += 20) zs.push(highwayZ(x, 0));
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(40);
    const c = cityOf(0, 0);
    expect(Math.min(...zs)).toBeGreaterThan((c.cz0 + c.h) * 64 + 60);
  });

  it('Rampen sind Einbahnstraßen: Ausfahrt und Auffahrt zur Stadt, Rastplatz-Spur, Landstraßen bis zur Zellgrenze', () => {
    const paths = cellPaths(0, 0);
    const off = paths.find((p) => p.id.startsWith('roff'))!, on = paths.find((p) => p.id.startsWith('ron'))!;
    expect(off.oneway && on.oneway).toBe(true);
    const c = cityOf(0, 0);
    const ringS = (c.cz0 + c.h) * 64 + 8;
    // Ausfahrt: beginnt auf der Autobahn, endet an der Ringstraße; Auffahrt umgekehrt
    expect(off.pts[off.pts.length - 1].z).toBeCloseTo(ringS, 3);
    expect(on.pts[0].z).toBeCloseTo(ringS, 3);
    expect(Math.abs(off.pts[0].z - (highwayZ(off.pts[0].x, 0) - 6.75))).toBeLessThan(1);
    expect(Math.abs(on.pts[on.pts.length - 1].z - (highwayZ(on.pts[on.pts.length - 1].x, 0) - 6.75))).toBeLessThan(1);
    // Fahrtrichtung der Ausfahrt am Anfang = Westen, am Ende = Norden
    const a = poseAt(off, 0), b = poseAt(off, off.len);
    expect(a.tx).toBeLessThan(-0.85);
    expect(b.tz).toBeLessThan(-0.9);
    // Leitplanken-Lücken an den Abzweigen
    const hw = paths.find((p) => p.kind === 'highway')!;
    expect(hw.gaps!.length).toBeGreaterThanOrEqual(4);
    expect(paths.filter((p) => p.kind === 'service')).toHaveLength(1);
    const country = paths.filter((p) => p.kind === 'country');
    expect(country).toHaveLength(2);
    const east = paths.find((p) => p.id.startsWith('ce'))!;
    const west = cellPaths(1, 0).find((p) => p.id.startsWith('cw'))!;
    const e = east.pts[east.pts.length - 1], w = west.pts[west.pts.length - 1];
    expect(Math.hypot(e.x - w.x, e.z - w.z)).toBeLessThan(0.01);
  });

  it('keine verrückten Kurven: Mindest-Kurvenradius je Straßenart', () => {
    const minRadius = (pts: { x: number; z: number }[]) => {
      let min = Infinity;
      for (let i = 2; i < pts.length; i++) {
        const a = pts[i - 2], b = pts[i - 1], c = pts[i];
        const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z), ca = Math.hypot(c.x - a.x, c.z - a.z);
        const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
        if (area2 < 1e-9) continue;
        min = Math.min(min, (ab * bc * ca) / (2 * area2));
      }
      return min;
    };
    const limit: Record<string, number> = { highway: 100, rail: 120, country: 55, ramp: 45, service: 60 };
    for (let rx = -2; rx <= 2; rx++) {
      for (let rz = -1; rz <= 1; rz++) {
        for (const p of cellPaths(rx, rz)) {
          if (!(p.kind in limit)) continue;
          expect(minRadius(p.pts), `${p.id}`).toBeGreaterThan(limit[p.kind]);
        }
      }
    }
  });

  it('Pfade: Pose und Freiraum', () => {
    const hw = cellPaths(0, 0).find((p) => p.kind === 'highway')!;
    const q = poseAt(hw, hw.len / 2);
    expect(Math.hypot(q.tx, q.tz)).toBeCloseTo(1, 5);
    const sl = slicesFor(Math.floor(q.x / 64), Math.floor(q.z / 64));
    expect(clearance(sl, q.x, q.z)).toBeLessThan(-5); // mitten auf der Autobahn
    expect(clearance(sl, q.x, q.z + 140)).toBeGreaterThan(20);
  });

  it('Straßenband zeigt nach oben und passt auf den Pfad', () => {
    const hw = cellPaths(0, 0).find((p) => p.kind === 'highway')!;
    const sl = { path: hw, i0: 10, i1: 20 };
    const g = stripGeo(sl, 11, -11, { y: 0.03, tileU: 8, tileV: 22, vShift: 0.5 })!;
    const pos = g.attributes.position;
    const idx = g.index!;
    const a = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(0));
    const b = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(1));
    const c = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(2));
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    expect(n.y).toBeGreaterThan(0);
    expect(pos.count).toBe(40); // 10 Segmente × 4 Eckpunkte
  });

  it('Chunk an der Autobahn: keine Bäume auf der Fahrbahn', () => {
    for (let cx = -6; cx <= 6; cx++) {
      for (let cz = 4; cz <= 7; cz++) {
        const sp = generateChunk(cx, cz);
        for (const t of sp.trees) expect(clearance(sp.paths, t.x, t.z)).toBeGreaterThanOrEqual(2 - 1e-6);
      }
    }
  });

  it('Generator ist deterministisch', () => {
    const a = generateChunk(1, 1), b = generateChunk(1, 1);
    expect(b.buildings.length).toBe(a.buildings.length);
    expect(b.cars).toEqual(a.cars);
  });
});
