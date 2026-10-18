import { describe, expect, it } from 'vitest';
import { CHUNK, ROAD, SIDEWALK, buildingWalls, doorPlacement, generateChunk } from '../src/world/CityGenerator';
import { clearance, isCityChunk } from '../src/world/WorldMap';
import { gableRoof } from '../src/world/roofs';

describe('Stadtaufbau', () => {
  it('Spawn-Chunk liegt in der Stadt, die Stadt ist begrenzt', () => {
    expect(isCityChunk(0, 0)).toBe(true);
    expect(isCityChunk(0, 3)).toBe(false);
    expect(isCityChunk(10, 0)).toBe(false);
  });

  it('Gebäude bleiben von Straße und Gehweg weg', () => {
    for (let cx = -3; cx <= 3; cx++) {
      for (const cz of [-1, 0, 1, 3]) {
        const ox = cx * CHUNK, oz = cz * CHUNK;
        for (const b of generateChunk(cx, cz).buildings) {
          expect(b.x - b.w / 2).toBeGreaterThanOrEqual(ox + ROAD + SIDEWALK);
          expect(b.z - b.d / 2).toBeGreaterThanOrEqual(oz + ROAD + SIDEWALK);
          expect(b.x + b.w / 2).toBeLessThanOrEqual(ox + CHUNK - SIDEWALK);
          expect(b.z + b.d / 2).toBeLessThanOrEqual(oz + CHUNK - SIDEWALK);
        }
      }
    }
  });

  it('jedes Gebäude hat eine Tür in einer Wand mit Lücke', () => {
    const b = generateChunk(0, 0).buildings[0];
    const d = doorPlacement(b);
    const walls = buildingWalls(b);
    // Türmitte liegt in keiner Wand-Box
    expect(walls.some((w) => Math.abs(d.x - w.x) < w.w / 2 && Math.abs(d.z - w.z) < w.d / 2)).toBe(false);
  });

  it('Spawn-Kreuzung bleibt frei von Autos', () => {
    for (let cx = -2; cx <= 2; cx++) {
      for (const c of generateChunk(cx, 0).cars) {
        expect(Math.hypot(c.x - cx * CHUNK, c.z)).toBeGreaterThan(10);
      }
    }
  });

  it('Autobahn hat Autos und ein Portalschild, Häuser stehen nicht auf den Gleisen', () => {
    let gantry = false, cars = 0, railChunks = 0, railHouses = 0;
    for (let cx = -9; cx <= 8; cx++) {
      for (let cz = 4; cz <= 7; cz++) {
        const sp = generateChunk(cx, cz);
        if (!sp.paths.some((p) => p.path.kind === 'highway')) continue;
        gantry ||= sp.signs.some((x) => x.type === 'gantry');
        cars += sp.cars.length;
      }
      for (let cz = -7; cz <= -5; cz++) {
        const sp = generateChunk(cx, cz);
        if (sp.paths.some((p) => p.path.kind === 'rail')) {
          railChunks++;
          railHouses += sp.buildings.filter((b) => clearance(sp.paths, b.x, b.z) < 8).length;
        }
      }
    }
    expect(gantry).toBe(true);
    expect(cars).toBeGreaterThan(3);
    expect(railChunks).toBeGreaterThan(10);
    expect(railHouses).toBe(0);
  });

  it('Satteldach: First liegt über der Traufe', () => {
    const g = gableRoof(10, 8, true, 2);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBe(2);
    expect(g.boundingBox!.min.y).toBe(0);
  });
});
