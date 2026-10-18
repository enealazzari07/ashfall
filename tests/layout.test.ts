import { describe, expect, it } from 'vitest';
import { generateChunk, doorPlacement, PROP_KINDS } from '../src/world/CityGenerator';
import type { Box, BuildingSpec } from '../src/world/CityGenerator';

const hit = (a: Box, b: Box, g = 0): boolean => Math.abs(a.x - b.x) < (a.w + b.w) / 2 - g && Math.abs(a.z - b.z) < (a.d + b.d) / 2 - g;

/** Grundrisse: freie Wege hinter der Haustür und an Zimmerdurchgängen, nicht überfüllte kleine Räume */
describe('Gebäude-Grundrisse', () => {
  const buildings: BuildingSpec[] = [];
  for (let cx = -5; cx <= 5; cx++) for (let cz = -5; cz <= 5; cz++) buildings.push(...generateChunk(cx, cz).buildings);

  it('hinter der Haustür steht weder Wand noch Möbel', () => {
    for (const b of buildings) {
      const dp = doorPlacement(b);
      const alongX = Math.abs(Math.sin(dp.rot)) < 0.5;
      const ux = alongX ? 0 : Math.sign(b.x - dp.x), uz = alongX ? Math.sign(b.z - dp.z) : 0;
      const w = Math.max(0.8, b.doorW - 0.1);
      const probe: Box = { x: dp.x + ux * 1.2, z: dp.z + uz * 1.2, w: alongX ? w : 2.0, d: alongX ? 2.0 : w };
      for (const part of b.partitions) if (part.level === 0) expect(part.boxes.some((q) => hit(probe, q, 0.02))).toBe(false);
      expect(b.props.some((p) => p.level === 0 && hit(probe, p, 0.02))).toBe(false);
    }
  });

  it('Zimmerdurchgänge führen nicht in Wände oder Möbel', () => {
    for (const b of buildings) {
      for (const part of b.partitions) {
        for (const l of part.lintels) {
          const horiz = l.w >= l.d;
          for (const side of [-1, 1]) {
            const pr: Box = horiz ? { x: l.x, z: l.z + side * 0.7, w: 1.0, d: 0.6 } : { x: l.x + side * 0.7, z: l.z, w: 0.6, d: 1.0 };
            expect(part.boxes.some((q) => hit(pr, q, 0.05))).toBe(false);
            expect(b.props.some((p) => p.level === part.level && hit(pr, p, 0.02))).toBe(false);
          }
        }
      }
    }
  });

  it('kleine Räume haben höchstens 3 durchsuchbare Möbel', () => {
    for (const b of buildings) {
      for (const room of b.rooms) {
        const a = (room.x1 - room.x0) * (room.z1 - room.z0);
        if (a >= 14) continue;
        const loot = b.props.filter((p) => p.level === room.level && p.x > room.x0 && p.x < room.x1 && p.z > room.z0 && p.z < room.z1 && PROP_KINDS[p.kind].lootable);
        expect(loot.length).toBeLessThanOrEqual(3);
      }
    }
  });
});
