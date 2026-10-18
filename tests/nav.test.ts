import { describe, expect, it } from 'vitest';
import { NavGrid, NavSource } from '../src/world/Nav';
import type { Box } from '../src/world/CityGenerator';

/** Ein Chunk (0,0) von 64 m mit einer langen Wand bei z = 20 und einer Lücke bei x = 50 */
function world(colliders: Box[], soft: { box: Box; kind: 'door' | 'climb' }[] = []): NavSource {
  return { chunkSize: 64, version: () => 1, chunk: (cx, cz) => (cx === 0 && cz === 0 ? { colliders, soft } : undefined) };
}

const wall = (x0: number, x1: number, z: number): Box => ({ x: (x0 + x1) / 2, z, w: x1 - x0, d: 0.3, sight: true });

describe('Wegfindung', () => {
  it('geht durch die Lücke statt gegen die Wand', () => {
    const nav = new NavGrid(world([wall(0, 28, 20), wall(32, 64, 20)]));
    expect(nav.clearWorld(10, 10, 10, 30)).toBe(false);
    const path = nav.findPath(10, 10, 10, 30);
    expect(path).not.toBeNull();
    // der Weg führt durch die Lücke bei x = 30
    expect(path!.some((p) => p.x > 27 && p.x < 33)).toBe(true);
    const last = path![path!.length - 1];
    expect(Math.hypot(last.x - 10, last.z - 30)).toBeLessThan(1);
  });

  it('freie Bahn braucht keinen Umweg', () => {
    const nav = new NavGrid(world([wall(2, 48, 20)]));
    expect(nav.clearWorld(10, 10, 30, 12)).toBe(true);
  });

  it('Türen sind begehbar, kosten aber extra: lieber die offene Lücke', () => {
    const door: Box = { x: 20, z: 20, w: 1.2, d: 0.4 };
    const nav = new NavGrid(world([wall(0, 19.4, 20), wall(20.6, 48, 20), wall(52, 64, 20)], [{ box: door, kind: 'door' }]));
    const direct = nav.findPath(20, 12, 20, 28);
    expect(direct).not.toBeNull(); // durch die Tür
    expect(direct!.some((p) => Math.abs(p.z - 20) < 1)).toBe(true);
  });

  it('eingeschlossenes Ziel liefert keinen Weg', () => {
    const ring = [wall(28, 36, 28), wall(28, 36, 36), { x: 28, z: 32, w: 0.3, d: 8 }, { x: 36, z: 32, w: 0.3, d: 8 }];
    const nav = new NavGrid(world(ring));
    expect(nav.findPath(10, 10, 32, 32)).toBeNull();
  });
});
