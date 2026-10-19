import { describe, expect, it } from 'vitest';
import { BuildingSpec, generateChunk } from '../src/world/CityGenerator';
import { MIN_WINDOW_GAP } from '../src/world/Buildings';
import { wearLevel } from '../src/world/Facade';

function chunks(): BuildingSpec[][] {
  const out: BuildingSpec[][] = [];
  for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) out.push(generateChunk(cx, cz).buildings);
  return out;
}

const line = (b: BuildingSpec, s: number): number => (s === 0 ? b.z + b.d / 2 : s === 1 ? b.z - b.d / 2 : s === 2 ? b.x + b.w / 2 : b.x - b.w / 2);
const span = (b: BuildingSpec, s: number): [number, number] => (s <= 1 ? [b.x - b.w / 2, b.x + b.w / 2] : [b.z - b.d / 2, b.z + b.d / 2]);

describe('Häuser', () => {
  it('kein Fenster blickt auf die Wand eines Nachbarhauses', () => {
    const opposite = [1, 0, 3, 2];

    for (const list of chunks()) {
      for (const a of list) {
        for (const o of list) {
          if (a === o) continue;
          for (const w of a.windows) {
            const gap = (line(o, opposite[w.side]) - line(a, w.side)) * (w.side === 0 || w.side === 2 ? 1 : -1);
            if (gap < -0.6 || gap > MIN_WINDOW_GAP) continue;
            const [a0, a1] = span(a, w.side), [o0, o1] = span(o, opposite[w.side]);
            const lo = Math.max(a0, o0), hi = Math.min(a1, o1);
            if (hi - lo < 0.4) continue;
            // Lage des Fensters entlang der Wand in Weltkoordinaten
            const along = w.side <= 1 ? a.x + (w.side === 0 ? 1 : -1) * w.u : a.z + (w.side === 3 ? 1 : -1) * w.u;
            const half = w.w / 2;

            expect(along + half <= lo + 0.15 || along - half >= hi - 0.15, `Fenster an Seite ${w.side} bei ${a.x.toFixed(0)}/${a.z.toFixed(0)}`).toBe(true);
          }
        }
      }
    }
  });

  it('Häuser stehen mit Gassen dazwischen: freistehende Gebäude haben mindestens 2,5 m Abstand', () => {
    for (const list of chunks()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], o = list[j];
          const dx = Math.abs(a.x - o.x) - (a.w + o.w) / 2, dz = Math.abs(a.z - o.z) - (a.d + o.d) / 2;
          // Gebäude, die sich in einer Richtung überlappen, trennt in der anderen eine Gasse oder gar nichts (Wand an Wand)
          if (dx > 0.6 && dz > -0.5 && dz < 0.3) expect(dx > 2.5 || a.kind === 'garage' || o.kind === 'garage', `Spalt ${dx.toFixed(1)} m`).toBe(true);
          if (dz > 0.6 && dx > -0.5 && dx < 0.3) expect(dz > 2.5 || a.kind === 'garage' || o.kind === 'garage', `Spalt ${dz.toFixed(1)} m`).toBe(true);
        }
      }
    }
  });

  it('Wandarten sind abwechslungsreich und Verschleiß ist ungleich verteilt', () => {
    const styles = new Set<string>();
    let worn = 0, total = 0;
    for (const list of chunks()) {
      for (const b of list) {
        styles.add(b.style);
        total++;
        if (wearLevel(b) >= 0.22) worn++;
      }
    }
    expect(styles.size).toBeGreaterThanOrEqual(8);
    expect(worn / total).toBeGreaterThan(0.5);
    expect(worn / total).toBeLessThan(0.95);
  });
});
