import { Box, BuildingSpec, ChunkSpec, CropKind, WALL, pick, sideFrame } from './CityGenerator';
import { LotRect, makeBuilding } from './Buildings';
import { rollLoot } from '../data/loot';
import { Stack } from '../data/items';

/** Zaun entlang einer Grundstückskante; `gateT` (0..1) legt fest, wo ein offenes Tor bleibt (-1 = keins). */
function fenceRect(spec: ChunkSpec, rect: Box, tall: boolean, door: 0 | 1 | 2 | 3 | null, doorPos: number, r: () => number): void {
  const x0 = rect.x - rect.w / 2, x1 = rect.x + rect.w / 2, z0 = rect.z - rect.d / 2, z1 = rect.z + rect.d / 2;
  const sides: [number, number, number, number, number][] = [
    [x0, z1, x1, z1, 0], // +z
    [x0, z0, x1, z0, 1], // -z
    [x1, z0, x1, z1, 2], // +x
    [x0, z0, x0, z1, 3], // -x
  ];
  for (const [ax, az, bx, bz, side] of sides) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 3));
    let gate = -1;
    if (door === side) {
      const t = side <= 1 ? (doorPos - ax) / (bx - ax) : (doorPos - az) / (bz - az);
      gate = Math.max(0, Math.min(n - 1, Math.floor(t * n)));
    }
    spec.fences.push({ x0: ax, z0: az, x1: bx, z1: bz, tall, gate, seed: Math.floor(r() * 1e6) });
  }
}

const SACK_LOOT = (r: () => number): Stack[] => {
  const out: Stack[] = [{ id: 'corn', qty: 1 + Math.floor(r() * 3) }];
  out.push(...rollLoot(r).filter((s) => s.id !== 'coin').slice(0, 2));
  return out;
};

/** Punkt vor der Wand `side` des Gebäudes: u = Versatz entlang der Wand, o = Abstand nach außen. */
function outside(b: BuildingSpec, side: number, u: number, o: number): { x: number; z: number; nx: number; nz: number } {
  const f = sideFrame(b, side);
  return { x: f.cx + f.ax * u + f.nx * (WALL / 2 + o), z: f.cz + f.az * u + f.nz * (WALL / 2 + o), nx: f.nx, nz: f.nz };
}

/** Ein Bauernhof-Grundstück: Scheune, Bauernhaus, Acker oder Weide mit Zäunen, Heu, Säcken, Leitern und Holzdecks. */
export function farmLot(r: () => number, spec: ChunkSpec, lot: LotRect, i: number, j: number): void {
  const roadSides = [i === 0 ? 3 : 2, j === 0 ? 1 : 0];
  const door = roadSides[r() < 0.5 ? 0 : 1] as 0 | 1 | 2 | 3;
  const inset = (pad: number): Box => ({ x: lot.x, z: lot.z, w: lot.w - pad * 2, d: lot.d - pad * 2 });
  const roll = r();
  const yard = () => spec.yards.push({ x: lot.x, z: lot.z, w: lot.w - 0.6, d: lot.d - 0.6 });
  const doorPos = (b: BuildingSpec) => (door <= 1 ? b.x : b.z);
  const hayAt = (x: number, z: number, kind: 'single' | 'two' | 'stack') => spec.hay.push({ x, z, rot: r() * Math.PI, kind });

  if (roll < 0.36) {
    // Scheune mit Hof
    const b = makeBuilding(r, lot, door, 'farm', 0, { kind: 'barn' });
    spec.buildings.push(b);
    yard();
    fenceRect(spec, inset(0.9), r() < 0.5, door, doorPos(b), r);
    const porch = outside(b, door, 0, 1.4);
    spec.decks.push({
      x: porch.x, z: porch.z, w: door <= 1 ? b.doorW + 2.4 : 2.6, d: door <= 1 ? 2.6 : b.doorW + 2.4, variant: pick(r, ['planks', 'old', 'hole'] as const),
    });
    for (const sgn of [-1, 1]) {
      if (r() < 0.75) {
        const p = outside(b, door, sgn * (b.doorW / 2 + 1.5), 1.0);
        spec.sacks.push({ x: p.x, z: p.z, rot: r() * Math.PI, crate: r() < 0.5, loot: SACK_LOOT(r) });
      }
    }
    const back = outside(b, door ^ 1, (r() - 0.5) * b.w * 0.6, 1.8);
    hayAt(back.x, back.z, pick(r, ['two', 'stack'] as const));
    if (r() < 0.6) {
      const b2 = outside(b, door ^ 1, (r() - 0.5) * b.w * 0.6, 3.4);
      hayAt(b2.x, b2.z, 'single');
    }
    const side = door <= 1 ? 2 : 0;
    const fr = sideFrame(b, side);
    const lp = outside(b, side, (r() - 0.5) * fr.len * 0.5, 0.2);
    spec.ladders.push({ x: lp.x, z: lp.z, rot: Math.atan2(lp.nx, lp.nz), kind: 'straight', h: b.h - 0.4 });
    return;
  }
  if (roll < 0.58) {
    // Bauernhaus mit Hof und niedrigem Zaun
    const b = makeBuilding(r, lot, door, 'farm', 0, { kind: 'house' });
    spec.buildings.push(b);
    yard();
    fenceRect(spec, inset(0.9), false, door, doorPos(b), r);
    const p = outside(b, door ^ 1, (r() - 0.5) * b.w * 0.5, 1.6);
    hayAt(p.x, p.z, pick(r, ['single', 'two'] as const));
    const s = outside(b, door, b.doorW / 2 + 2.2, 1.0);
    spec.sacks.push({ x: s.x, z: s.z, rot: r() * Math.PI, crate: false, loot: SACK_LOOT(r) });
    if (r() < 0.5) {
      const l = outside(b, door <= 1 ? 3 : 1, 0, 0.9);
      spec.ladders.push({ x: l.x, z: l.z, rot: Math.atan2(l.nx, l.nz) + Math.PI / 2, kind: r() < 0.5 ? 'stand' : 'standBroken', h: 1.5 });
    }
    return;
  }
  if (roll < 0.9) {
    // Acker
    const crop = pick<CropKind>(r, ['corn', 'corn', 'cornDouble', 'cornYoung', 'cornYoungDouble']);
    spec.fields.push({ x: lot.x, z: lot.z, w: lot.w - 2.6, d: lot.d - 2.6, crop });
    const e = inset(0.8);
    fenceRect(spec, e, false, door, door <= 1 ? lot.x : lot.z, r);
    const cx = lot.x + (r() < 0.5 ? -1 : 1) * (lot.w / 2 - 1.5), cz = lot.z + (r() < 0.5 ? -1 : 1) * (lot.d / 2 - 1.5);
    spec.yards.push({ x: lot.x, z: lot.z, w: lot.w - 0.6, d: lot.d - 0.6 });
    hayAt(cx, cz, pick(r, ['single', 'two', 'stack'] as const));
    if (r() < 0.5) spec.sacks.push({ x: lot.x + (r() - 0.5) * 6, z: lot.z + (door === 0 ? 1 : -1) * (lot.d / 2 - 1.8), rot: r() * Math.PI, crate: true, loot: SACK_LOOT(r) });
    return;
  }
  // Weide: hoher Zaun, Heu, kaputte Leiter
  yard();
  fenceRect(spec, inset(0.9), true, door, door <= 1 ? lot.x : lot.z, r);
  hayAt(lot.x - 3, lot.z - 2, 'stack');
  hayAt(lot.x + 4, lot.z + 3, 'two');
  spec.ladders.push({ x: lot.x + 1, z: lot.z - 5, rot: r() * 6.28, kind: r() < 0.5 ? 'stand' : 'standBroken', h: 1.5 });
  spec.sacks.push({ x: lot.x - 5, z: lot.z + 4, rot: r() * 6.28, crate: true, loot: SACK_LOOT(r) });
}
