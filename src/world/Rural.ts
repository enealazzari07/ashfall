import { Box, BuildingSpec, ChunkSpec, pick, newCar } from './CityGenerator';
import { LotRect } from './Buildings';
import { CAR_MODEL_COUNT } from '../render/CarModel';

const GREEN = [0x3f7a43, 0x4c8a47, 0x35693c, 0x5a8f4a];

/** Waldgrundstück: dichter Baumbestand, Unterholz und ein paar Modellbäume. */
export function forestLot(r: () => number, spec: ChunkSpec, lot: LotRect, density = 1): void {
  const n = Math.round((16 + Math.floor(r() * 12)) * density);
  for (let k = 0; k < n; k++) {
    spec.trees.push({ x: lot.x + (r() - 0.5) * (lot.w - 2), z: lot.z + (r() - 0.5) * (lot.d - 2), s: 0.9 + r() * 0.9 });
  }
  for (let k = 0; k < Math.max(1, Math.round(5 * density)); k++) {
    spec.bushes.push({ x: lot.x + (r() - 0.5) * (lot.w - 2), z: lot.z + (r() - 0.5) * (lot.d - 2), s: 0.6 + r() * 0.7, color: pick(r, GREEN) });
  }
}

/** Wanderparkplatz im Wald: kleiner Asphaltplatz mit Stellplätzen, Picknicktische auf der Lichtung, Mülleimer, Bänke, Laternen. */
export function restLot(r: () => number, spec: ChunkSpec, lot: LotRect, i: number, j: number): void {
  if (i !== 0 || j !== 0) {
    forestLot(r, spec, lot, i === j ? 0.6 : 1);
    return;
  }
  const z0 = lot.z - lot.d / 2;
  const pad: Box = { x: lot.x, z: z0 + 7, w: lot.w - 4, d: 10 };
  spec.pads.push(pad);
  stallRow(r, spec, { x: pad.x, z: pad.z + 0.6, w: pad.w - 2, d: STALL_D }, true, 0.45);
  spec.models.push({ name: 'detail-light-single', x: pad.x - pad.w / 2 + 1, z: pad.z - 3.6, rot: 0 });
  // Lichtung mit Picknicktischen
  for (const [u, v] of [[-7, 17], [0, 19.5], [7, 17], [-3, 23.5]]) spec.picnics.push({ x: lot.x + u, z: z0 + v, rot: r() * Math.PI });
  spec.bins.push({ x: lot.x - 4, z: z0 + 13 }, { x: lot.x + 9, z: z0 + 13 });
  spec.benches.push({ x: lot.x + 10, z: z0 + 22, rot: Math.PI / 2 });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    spec.trees.push({ x: lot.x + Math.cos(a) * 12.5, z: z0 + 19 + Math.sin(a) * 6.5, s: 1 + r() * 0.6 });
  }
  for (let k = 0; k < 6; k++) spec.bushes.push({ x: lot.x + (r() - 0.5) * (lot.w - 4), z: z0 + 2 + r() * 2, s: 0.6 + r() * 0.5, color: pick(r, GREEN) });
}

/** Leerer Platz in der Industrie: abgestellter Lkw, Paletten, Container, Absperrungen. */
export function yardClutter(r: () => number, spec: ChunkSpec, lot: LotRect): void {
  const at = (t: number, s: number) => ({ x: lot.x + (t - 0.5) * (lot.w - 4), z: lot.z + (s - 0.5) * (lot.d - 4) });
  spec.pads.push({ x: lot.x, z: lot.z, w: lot.w - 0.6, d: lot.d - 0.6 });
  for (let k = 0; k < 3; k++) spec.models.push({ name: pick(r, ['pallet', 'pallet-small', 'planks', 'detail-block']), ...at(r(), 0.6 + r() * 0.4), rot: r() * 6 });
  spec.models.push({ name: 'detail-barrier-strong-type-a', ...at(0.6, 0.1), rot: 0, solid: true });
}

const STALL_W = 2.8, STALL_D = 5.4;

const overlap = (a: Box, b: Box, pad = 0.3) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + pad;

/** Eine Reihe Stellplätze auf einem Streifen; `alongX`: Plätze liegen nebeneinander entlang x (Autos zeigen entlang z). */
function stallRow(r: () => number, spec: ChunkSpec, pad: Box, alongX: boolean, fill: number, maxStalls = 99): void {
  const len = alongX ? pad.w : pad.d;
  const n = Math.min(maxStalls, Math.floor((len - 0.6) / STALL_W));
  const start = -((n - 1) * STALL_W) / 2;
  for (let k = 0; k < n; k++) {
    const o = start + k * STALL_W;
    const x = alongX ? pad.x + o : pad.x, z = alongX ? pad.z : pad.z + o;
    spec.stalls.push({ x, z, alongX });
    if (r() < fill) spec.cars.push(newCar(r, x, z, alongX ? Math.PI / 2 : 0));
  }
}

/** Ganzes leeres Grundstück als Parkplatz: Asphalt, zwei Stellplatzreihen, Lampen. */
export function parkingLot(r: () => number, spec: ChunkSpec, lot: LotRect): void {
  spec.pads.push({ x: lot.x, z: lot.z, w: lot.w - 0.6, d: lot.d - 0.6 });
  const fill = 0.35 + r() * 0.4;
  for (const dz of [-6.2, 6.2]) stallRow(r, spec, { x: lot.x, z: lot.z + dz, w: lot.w - 3, d: STALL_D }, true, fill);
  spec.models.push({ name: 'detail-light-double', x: lot.x - lot.w / 2 + 2, z: lot.z, rot: 0 }, { name: 'detail-light-double', x: lot.x + lot.w / 2 - 2, z: lot.z, rot: Math.PI });
  if (r() < 0.4) spec.models.push({ name: 'detail-barrier-type-a', x: lot.x, z: lot.z + lot.d / 2 - 1.5, rot: 0, solid: true });
}

/** Stellplätze auf dem größten freien Streifen eines Grundstücks neben dem Gebäude (nicht auf Wegen oder Einfahrten). */
export function parkingBeside(r: () => number, spec: ChunkSpec, lot: LotRect, b: BuildingSpec, avoid: Box[], maxStalls = 99): void {
  const margins = [
    lot.z + lot.d / 2 - (b.z + b.d / 2), // +z
    b.z - b.d / 2 - (lot.z - lot.d / 2), // -z
    lot.x + lot.w / 2 - (b.x + b.w / 2), // +x
    b.x - b.w / 2 - (lot.x - lot.w / 2), // -x
  ];
  const order = [0, 1, 2, 3].sort((a, c) => margins[c] - margins[a]);
  for (const side of order) {
    if (margins[side] < STALL_D + 1.6) break;
    const alongX = side <= 1;
    const len = Math.min(alongX ? b.w : b.d, (alongX ? lot.w : lot.d) - 2);
    const pad: Box = alongX
      ? { x: b.x, z: side === 0 ? lot.z + lot.d / 2 - 0.9 - STALL_D / 2 : lot.z - lot.d / 2 + 0.9 + STALL_D / 2, w: len, d: STALL_D }
      : { x: side === 2 ? lot.x + lot.w / 2 - 0.9 - STALL_D / 2 : lot.x - lot.w / 2 + 0.9 + STALL_D / 2, z: b.z, w: STALL_D, d: len };
    if (len < STALL_W * 2 + 0.6 || avoid.some((a) => overlap(a, pad))) continue;
    spec.pads.push(pad);
    stallRow(r, spec, pad, alongX, 0.6, maxStalls);
    return;
  }
}
