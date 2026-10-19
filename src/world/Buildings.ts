import {
  Box, BuildingKind, BuildingSpec, Decor, DecorKind, FLOOR_H, RoofUnit, PROP_KINDS, Prop, Rect, Room, RoomType, StairPlan, WALL,
  DoorStyle, WallStyle, WindowState, Zone, innerRect, pick, sideFrame, carPaint,
} from './CityGenerator';
import { rollLoot } from '../data/loot';

export interface LotRect { x: number; z: number; w: number; d: number }

const PART_T = 0.2; // Dicke der Trennwände
const GAP = 1.1; // Breite von Türöffnungen zwischen Räumen
const PATH_W = 1.4;
const DEFAULT_DOOR_W = 1.3;

/** Haupttür je nach Gebäudeart; Geschäfte, Büros und Hotels haben breite Glastüren, Wohnhäuser schmale Holztüren */
function doorFor(kind: BuildingKind, x: number, z: number): { w: number; style: DoorStyle } {
  const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
  switch (kind) {
    case 'shop': return { w: 1.8, style: h < 0.75 ? 'glass' : 'window' };
    case 'office': return { w: 1.8, style: h < 0.8 ? 'glass' : 'steel' };
    case 'hotel': return { w: 2.0, style: 'glass' };
    case 'apartment': return { w: 1.4, style: h < 0.5 ? 'steel' : h < 0.8 ? 'window' : 'panel' };
    case 'industry': return { w: 3.6, style: 'steel' };
    case 'barn': return { w: 3.6, style: 'wood' };
    default: return { w: 1.2 + Math.floor(h * 3) * 0.05, style: h < 0.35 ? 'panel' : h < 0.65 ? 'window' : h < 0.85 ? 'wood' : 'steel' };
  }
}

const SIDING_COLORS = [0xe8e2d4, 0xc9d6c0, 0xb8c9d8, 0xd9c9a8, 0xd8b8a8, 0xaebba4];
const BRICK_COLORS = [0xffffff, 0xf0dcd0, 0xd8c0b0, 0xe8d0c0];
const PLASTER_COLORS = [0xe0d8c6, 0xd0c8b8, 0xcfd3d6, 0xe3cfa8, 0xb9c4b0];
const CONCRETE_COLORS = [0xb8b8b4, 0xa4a8ac, 0xc4c2ba, 0x9a9ea2];
const DARK_BRICK_COLORS = [0xb89888, 0xa88878, 0xc0a090];
const WOOD_COLORS = [0xffffff, 0xf0e2d4, 0xd8c6b4, 0xc4b09c];
const STUCCO_COLORS = [0xf0e2b8, 0xe8c9a0, 0xe0b8a8, 0xd8d8c0, 0xc8d8d0, 0xf2f0e6];
const CLINKER_COLORS = [0xffffff, 0xf4e6c8, 0xe0c8a0, 0xd0d0c8];
const PANEL_COLORS = [0xc8c8c4, 0xd4d0c4, 0xb8bcc0, 0xcfc8b8];
const STONE_COLORS = [0xffffff, 0xe4e0d8, 0xcfcac0, 0xd8d0c4];
const TRIM_COLORS = [0xf2efe6, 0xe9e2d0, 0x4a3a2c, 0x2f4a3a, 0x30445a, 0x6a2a24];
const AWNING_COLORS = [0xb83a3a, 0x2f6a4a, 0x2f4f7a, 0xc8962f, 0x6a3a6a];
const SIGN_COLORS = [0x1f3a5f, 0x6a1f24, 0x1f5a3a, 0x3a3a3f, 0x7a5a1f];
const ROOF_COLORS = [0xc4684e, 0x6f7884, 0x7d5f4c, 0x9a4b3c, 0x5b6470];
export const SHOP_NAMES = ['PIZZA', 'PHARMACY', 'GROCERY', 'HARDWARE', 'BAKERY', 'CAFE', 'LIQUOR', 'PAWN SHOP', 'DINER', 'BOOKS', 'DELI', 'LAUNDRY', 'GUNS & AMMO', 'MARKET'];
export const FACTORY_NAMES = ['ASHFALL STEEL', 'MILL & CO', 'NORTH CHEMICALS', 'RAIL WORKS', 'CITY POWER'];
export const HOTEL_NAMES = ['HOTEL ASTOR', 'GRAND HOTEL', 'MOTEL 9', 'HOTEL CENTRAL'];

const kindIndexCache = new Map<string, number>();
function kindIndex(id: string): number {
  let i = kindIndexCache.get(id);
  if (i === undefined) {
    i = PROP_KINDS.findIndex((k) => k.id === id);
    kindIndexCache.set(id, i);
  }
  return i;
}

const hit = (a: Box, b: Box, shrink = 0) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 - shrink && Math.abs(a.z - b.z) < (a.d + b.d) / 2 - shrink;

const area = (r: Rect) => (r.x1 - r.x0) * (r.z1 - r.z0);
const shrink = (r: Rect, m: number): Rect => ({ x0: r.x0 + m, x1: r.x1 - m, z0: r.z0 + m, z1: r.z1 - m });

function styleColor(r: () => number, style: WallStyle): number {
  return pick(r, style === 'siding' ? SIDING_COLORS : style === 'brick' ? BRICK_COLORS : style === 'plaster' ? PLASTER_COLORS
    : style === 'concrete' ? CONCRETE_COLORS : style === 'wood' ? WOOD_COLORS : style === 'stone' ? STONE_COLORS
    : style === 'stucco' ? STUCCO_COLORS : style === 'clinker' ? CLINKER_COLORS : style === 'panel' ? PANEL_COLORS : DARK_BRICK_COLORS);
}

// ---------------------------------------------------------------------------------------------------------------
// Fenster
// ---------------------------------------------------------------------------------------------------------------

function windowState(r: () => number, ground: boolean, house: boolean, storefront: boolean, fortified: boolean): WindowState {
  const v = r();
  if (storefront) return fortified ? (v < 0.7 ? 'boarded' : 'roll') : v < 0.34 ? 'glass' : v < 0.5 ? 'broken' : v < 0.72 ? 'boarded' : 'roll';
  if (ground) {
    if (fortified) return v < 0.8 ? 'boarded' : 'glass';
    return v < 0.42 ? 'glass' : v < 0.62 ? 'broken' : v < 0.84 ? 'boarded' : house ? 'shutter' : 'glass';
  }
  return v < 0.62 ? 'glass' : v < 0.8 ? 'broken' : v < 0.93 ? 'boarded' : 'shutter';
}

interface WinStyle { w: number; h: number; sill: number; spacing: number }

const WIN: Record<BuildingKind, WinStyle> = {
  house: { w: 1.7, h: 1.4, sill: 0.9, spacing: 3.9 },
  apartment: { w: 1.6, h: 1.5, sill: 0.85, spacing: 3.5 },
  hotel: { w: 1.6, h: 1.5, sill: 0.85, spacing: 3.9 },
  office: { w: 2.8, h: 1.6, sill: 0.8, spacing: 3.8 },
  shop: { w: 1.8, h: 1.5, sill: 0.85, spacing: 3.8 },
  industry: { w: 2.6, h: 1.0, sill: 1.75, spacing: 3.6 },
  garage: { w: 1.0, h: 0.8, sill: 1.3, spacing: 99 },
  barn: { w: 1.1, h: 1.1, sill: 1.5, spacing: 4.6 },
};

/** Verteilt Fenster gleichmäßig auf alle Wände und Stockwerke; große Scheiben statt vieler kleiner. */
function addWindows(b: BuildingSpec, r: () => number): void {
  const house = b.kind === 'house';
  const st = WIN[b.kind];
  for (let s = 0; s < 4; s++) {
    const len = sideFrame(b, s).len;
    const usable = len - 1.8 - st.w;
    if (usable < 0) continue;
    const n = Math.min(Math.floor(usable / st.spacing) + 1, b.kind === 'garage' ? 1 : 99);
    for (let i = 0; i < n; i++) {
      const u = (i - (n - 1) / 2) * st.spacing;
      for (let f = 0; f < b.floors; f++) {
        // Geschäfte: Erdgeschoss hat nur das Schaufenster an der Straße
        if (b.kind === 'shop' && f === 0) continue;
        if (b.kind === 'garage' && s === b.door) continue;
        if (f === 0 && s === b.door && Math.abs(u) < b.doorW / 2 + st.w / 2 + 0.6) continue;
        if (f === 0 && b.door2 && s === b.door2.side && Math.abs(u - b.door2.u) < (b.door2.w ?? b.doorW) / 2 + st.w / 2 + 0.6) continue;
        const state = windowState(r, f === 0, house, false, b.fortified && f === 0);
        b.windows.push({
          side: s as 0 | 1 | 2 | 3, u, floor: f, w: st.w, h: st.h, y0: f * FLOOR_H + st.sill, state,
          lit: state === 'glass' && (b.kind === 'industry' ? r() < 0.55 : r() < 0.16), storefront: false,
        });
      }
    }
  }
  if (b.kind === 'shop') {
    const len = sideFrame(b, b.door).len;
    const W = Math.min(4.6, len / 2 - b.doorW / 2 - 1.0);
    if (W >= 1.5) {
      for (const sgn of [-1, 1]) {
        b.windows.push({
          side: b.door, u: sgn * (b.doorW / 2 + 0.4 + W / 2), floor: 0, w: W, h: 2.2, y0: 0.4,
          state: windowState(r, true, false, true, b.fortified), lit: false, storefront: true,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Räume: Wände mit Türöffnungen, Aufteilung, Einrichtung
// ---------------------------------------------------------------------------------------------------------------

interface Walls { boxes: Box[]; lintels: Box[]; clear: Box[]; /** Türöffnungen aller Trennwände: Wandachse, Lage (c) und Mitte entlang der Wand (g) */ doors: { orient: 'x' | 'z'; c: number; g: number; lv: number }[] }

/** Wand von a0 bis a1 mit Türöffnungen (Mitten in `gaps`). orient 'x' = verläuft entlang x bei z = c, 'z' entlang z bei x = c. */
function addWall(W: Walls, orient: 'x' | 'z', c: number, a0: number, a1: number, gaps: number[], level: number): void {
  const mk = (s0: number, s1: number): Box =>
    orient === 'x'
      ? { x: (s0 + s1) / 2, z: c, w: s1 - s0, d: PART_T, lv: level }
      : { x: c, z: (s0 + s1) / 2, w: PART_T, d: s1 - s0, lv: level };
  let cur = a0;
  for (const g of [...gaps].sort((p, q) => p - q)) {
    if (g - GAP / 2 - cur > 0.05) W.boxes.push(mk(cur, g - GAP / 2));
    cur = g + GAP / 2;
    W.lintels.push({ ...mk(g - GAP / 2, g + GAP / 2), lv: level });
    W.doors.push({ orient, c, g, lv: level });
    // Freihalten: Möbel dürfen die Tür nicht blockieren
    W.clear.push(orient === 'x'
      ? { x: g, z: c, w: GAP + 0.8, d: 2.2, lv: level }
      : { x: c, z: g, w: 2.2, d: GAP + 0.8, lv: level });
  }
  if (a1 - cur > 0.05) W.boxes.push(mk(cur, a1));
}

type Axis = 'x' | 'z';

/**
 * Keine Wand vor der Haustür: Ragt eine Trennwand (z. B. die Wand am Treppenhaus) in den Bereich hinter der Tür,
 * wird dort ein Durchgang herausgeschnitten. Quer zum Weg liegende Wände bekommen eine Türöffnung genau gegenüber der Tür,
 * längs verlaufende werden im Türbereich entfernt.
 */
function carveDoorZone(W: Walls, zone: Box, level: number, pathAlongZ: boolean): void {
  const out: Box[] = [];
  const zx0 = zone.x - zone.w / 2, zx1 = zone.x + zone.w / 2, zz0 = zone.z - zone.d / 2, zz1 = zone.z + zone.d / 2;
  for (const b of W.boxes) {
    if (b.lv !== level || !hit(b, zone, 0.02)) {
      out.push(b);
      continue;
    }
    const alongX = b.w >= b.d;
    const cut = (a0: number, a1: number, c0: number, c1: number, cc: number, mk: (s0: number, s1: number) => Box): void => {
      if (c0 - a0 > 0.05) out.push(mk(a0, c0));
      if (a1 - c1 > 0.05) out.push(mk(c1, a1));
      void cc;
    };
    if (alongX) {
      const a0 = b.x - b.w / 2, a1 = b.x + b.w / 2;
      const crosses = pathAlongZ; // Wand quer zum Weg: Öffnung gegenüber der Tür
      const c0 = crosses ? zone.x - 0.75 : zx0, c1 = crosses ? zone.x + 0.75 : zx1;
      cut(a0, a1, Math.max(a0, c0), Math.min(a1, c1), 0, (s0, s1) => ({ ...b, x: (s0 + s1) / 2, w: s1 - s0 }));
      if (crosses) W.lintels.push({ x: zone.x, z: b.z, w: Math.min(a1, c1) - Math.max(a0, c0), d: b.d, lv: level });
    } else {
      const a0 = b.z - b.d / 2, a1 = b.z + b.d / 2;
      const crosses = !pathAlongZ;
      const c0 = crosses ? zone.z - 0.75 : zz0, c1 = crosses ? zone.z + 0.75 : zz1;
      cut(a0, a1, Math.max(a0, c0), Math.min(a1, c1), 0, (s0, s1) => ({ ...b, z: (s0 + s1) / 2, d: s1 - s0 }));
      if (crosses) W.lintels.push({ x: b.x, z: zone.z, w: b.w, d: Math.min(a1, c1) - Math.max(a0, c0), lv: level });
    }
  }
  W.boxes = out;
}

/** (u, v)-Koordinaten der Treppenachse → Welt */
const rectUV = (axis: Axis, u0: number, u1: number, v0: number, v1: number): Rect =>
  axis === 'z' ? { x0: v0, x1: v1, z0: u0, z1: u1 } : { x0: u0, x1: u1, z0: v0, z1: v1 };
const wallAtV = (W: Walls, axis: Axis, v: number, u0: number, u1: number, gaps: number[], lv: number) =>
  addWall(W, axis === 'z' ? 'z' : 'x', v, u0, u1, gaps, lv);
const wallAtU = (W: Walls, axis: Axis, u: number, v0: number, v1: number, gaps: number[], lv: number) =>
  addWall(W, axis === 'z' ? 'x' : 'z', u, v0, v1, gaps, lv);

interface BspOpts { minSide: number; maxArea: number; maxLeaves: number }

/** Teilt ein Rechteck in Zimmer; jede Trennwand bekommt eine Tür, damit alles verbunden bleibt. */
function bsp(rect: Rect, o: BspOpts, r: () => number, W: Walls, level: number, avoid: Box[]): Rect[] {
  /** Eine neue Wand bei s darf nicht auf eine Türöffnung der Wand treffen, an der sie endet (sonst steht sie in der Tür) */
  const meetsDoor = (orient: 'x' | 'z', edges: number[], s: number): boolean =>
    W.doors.some((dr) => dr.lv === level && dr.orient === orient && edges.some((e) => Math.abs(dr.c - e) < 0.35) && Math.abs(dr.g - s) < GAP / 2 + 0.5);
  const leaves: Rect[] = [];
  const queue: Rect[] = [rect];
  while (queue.length) {
    queue.sort((p, q) => area(q) - area(p));
    const rc = queue.shift()!;
    const w = rc.x1 - rc.x0, d = rc.z1 - rc.z0;
    const canX = w >= 2 * o.minSide + PART_T, canZ = d >= 2 * o.minSide + PART_T;
    if (area(rc) <= o.maxArea || (!canX && !canZ) || leaves.length + queue.length + 1 >= o.maxLeaves) {
      leaves.push(rc);
      continue;
    }
    const orderX = canX && (!canZ || (w >= d ? r() < 0.78 : r() < 0.22));
    let done = false;
    for (const axis of orderX ? (['x', 'z'] as const) : (['z', 'x'] as const)) {
      if (axis === 'x' && !canX) continue;
      if (axis === 'z' && !canZ) continue;
      for (let t = 0; t < 6 && !done; t++) {
        if (axis === 'x') {
          const s = rc.x0 + o.minSide + r() * (w - 2 * o.minSide);
          const test: Box = { x: s, z: (rc.z0 + rc.z1) / 2, w: PART_T, d };
          if (avoid.some((a) => hit(test, a)) || meetsDoor('x', [rc.z0, rc.z1], s)) continue;
          addWall(W, 'z', s, rc.z0, rc.z1, [rc.z0 + 0.9 + r() * Math.max(0, d - 1.8)], level);
          queue.push({ ...rc, x1: s }, { ...rc, x0: s });
        } else {
          const s = rc.z0 + o.minSide + r() * (d - 2 * o.minSide);
          const test: Box = { x: (rc.x0 + rc.x1) / 2, z: s, w, d: PART_T };
          if (avoid.some((a) => hit(test, a)) || meetsDoor('z', [rc.x0, rc.x1], s)) continue;
          addWall(W, 'x', s, rc.x0, rc.x1, [rc.x0 + 0.9 + r() * Math.max(0, w - 1.8)], level);
          queue.push({ ...rc, z1: s }, { ...rc, z0: s });
        }
        done = true;
      }
      if (done) break;
    }
    if (!done) leaves.push(rc);
  }
  return leaves;
}

type Want = [kind: string, min: number, max: number, mode: 'wall' | 'center'];

const FURNISH: Record<RoomType, Want[]> = {
  living: [['tvstand', 1, 1, 'wall'], ['table', 1, 1, 'center'], ['shelf', 0, 1, 'wall'], ['cabinet', 0, 1, 'wall']],
  kitchen: [['fridge', 1, 1, 'wall'], ['stove', 1, 1, 'wall'], ['kitchenunit', 0, 1, 'wall'], ['sink', 1, 1, 'wall'], ['trashcan', 0, 1, 'wall'], ['cabinet', 0, 1, 'wall'], ['table', 0, 1, 'center']],
  bedroom: [['bed', 1, 1, 'wall'], ['wardrobe', 1, 1, 'wall'], ['dresser', 0, 1, 'wall'], ['chest', 0, 1, 'wall'], ['desk', 0, 1, 'wall']],
  bath: [['toilet', 1, 1, 'wall'], ['sink', 1, 1, 'wall'], ['bathtub', 0, 1, 'wall'], ['washer', 0, 1, 'wall']],
  hall: [],
  corridor: [['cabinet', 0, 1, 'wall'], ['chest', 0, 1, 'wall'], ['dresser', 0, 1, 'wall']],
  storage: [['rack', 1, 2, 'wall'], ['crate', 1, 3, 'wall'], ['barrel', 0, 1, 'wall'], ['shelf', 0, 1, 'wall']],
  shop: [['counter', 1, 1, 'wall'], ['rack', 2, 3, 'center'], ['shelf', 2, 4, 'wall'], ['crate', 0, 1, 'wall'], ['fridge', 0, 1, 'wall']],
  office: [['desk', 1, 3, 'center'], ['cabinet', 0, 1, 'wall'], ['shelf', 0, 1, 'wall']],
  meeting: [['table', 1, 1, 'center'], ['cabinet', 0, 1, 'wall']],
  lobby: [['counter', 1, 1, 'wall'], ['sofa', 1, 2, 'wall'], ['table', 0, 1, 'center']],
  hotelroom: [['bed', 1, 1, 'wall'], ['wardrobe', 0, 1, 'wall'], ['toilet', 1, 1, 'wall'], ['sink', 1, 1, 'wall'], ['desk', 0, 1, 'wall']],
  factory: [['machine', 2, 3, 'center'], ['crate', 1, 3, 'center'], ['barrel', 0, 2, 'wall'], ['rack', 1, 2, 'wall'], ['locker', 0, 1, 'wall']],
  garage: [['car', 1, 1, 'center'], ['rack', 1, 2, 'wall'], ['crate', 1, 2, 'wall'], ['barrel', 0, 2, 'wall']],
  barn: [['crate', 1, 3, 'center'], ['barrel', 0, 2, 'wall'], ['rack', 1, 1, 'wall']],
};

interface FCtx { cap?: { room: Rect; total: number; loot: number }; r: () => number; level: number; placed: Prop[]; avoid: Box[]; /** Polizeirevier: Büros bekommen Waffenkisten */ police?: boolean; /** Raumtyp, der gerade eingerichtet wird (wählt die Loot-Liste) */ room?: string }

/**
 * Wie voll ein Raum werden darf: kleine Räume höchstens 3 Möbelstücke, davon höchstens 3 zum Durchsuchen;
 * größere Räume wachsen mit der Fläche. So stehen Kisten und Schränke nicht mehr Wand an Wand.
 */
const BOXY = new Set(['crate', 'cardbox', 'whcrates', 'whpallet', 'weaponcase', 'weaponcrate']);

function setCap(ctx: FCtx, room: Rect): void {
  const a = area(room);
  ctx.cap = { room, total: Math.max(3, Math.min(12, Math.round(a / 3.4))), loot: a < 14 ? 3 : Math.max(3, Math.min(8, Math.round(a / 4.5))) };
}

/** Passt noch ein Stück dieser Art in den Raum, ohne die Obergrenze zu sprengen? */
function capOk(ctx: FCtx, kindId: string): boolean {
  const c = ctx.cap;
  if (!c) return true;
  const inside = ctx.placed.filter((p) => p.x > c.room.x0 && p.x < c.room.x1 && p.z > c.room.z0 && p.z < c.room.z1);
  if (inside.length >= c.total) return false;
  // Kisten, Kartons und Paletten: wenige, nicht der halbe Raum
  if (BOXY.has(kindId) && inside.filter((p) => BOXY.has(PROP_KINDS[p.kind].id)).length >= (area(c.room) < 20 ? 2 : area(c.room) < 40 ? 3 : 5)) return false;
  const lootable = PROP_KINDS[kindIndex(kindId)].lootable;
  return !lootable || inside.filter((p) => PROP_KINDS[p.kind].lootable).length < c.loot;
}

function makeProp(ctx: FCtx, kindId: string, lw: number, ld: number, h: number, box: Box, yaw: number): Prop {
  const ki = kindIndex(kindId);
  const k = PROP_KINDS[ki];
  return {
    ...box, h, color: kindId === 'car' ? carPaint(ctx.r) : k.color, kind: ki,
    loot: k.lootable ? rollLoot(ctx.r, ctx.room, kindId) : [], level: ctx.level, yaw, lw, ld, lv: ctx.level,
  };
}

function rollSize(ctx: FCtx, kindId: string) {
  const k = PROP_KINDS[kindIndex(kindId)];
  const lw = k.w[0] + ctx.r() * (k.w[1] - k.w[0]);
  const ld = k.d[0] + ctx.r() * (k.d[1] - k.d[0]);
  const h = k.h[0] + ctx.r() * (k.h[1] - k.h[0]);
  return { lw, ld, h };
}

const free = (ctx: FCtx, box: Box, room: Rect): boolean =>
  box.x - box.w / 2 >= room.x0 - 1e-6 && box.x + box.w / 2 <= room.x1 + 1e-6 &&
  box.z - box.d / 2 >= room.z0 - 1e-6 && box.z + box.d / 2 <= room.z1 + 1e-6 &&
  !ctx.placed.some((p) => hit(box, p, 0.08)) && !ctx.avoid.some((a) => hit(box, a, 0.02));

/** An eine der vier Raumwände stellen, Front zum Raum. */
function placeAtWall(ctx: FCtx, room: Rect, kindId: string): boolean {
  if (!capOk(ctx, kindId)) return false;
  for (let attempt = 0; attempt < 16; attempt++) {
    const { lw, ld, h } = rollSize(ctx, kindId);
    const side = Math.floor(ctx.r() * 4);
    // side 0: Wand bei z1 (Raum davor, n = -1), 1: z0 (n = +1), 2: x1, 3: x0
    const alongX = side < 2;
    const a0 = alongX ? room.x0 : room.z0, a1 = alongX ? room.x1 : room.z1;
    if (a1 - a0 < lw + 0.3) continue;
    const t = a0 + lw / 2 + 0.1 + ctx.r() * (a1 - a0 - lw - 0.2);
    let box: Box, yaw: number;
    if (side === 0) { box = { x: t, z: room.z1 - ld / 2, w: lw, d: ld }; yaw = Math.PI; }
    else if (side === 1) { box = { x: t, z: room.z0 + ld / 2, w: lw, d: ld }; yaw = 0; }
    else if (side === 2) { box = { x: room.x1 - ld / 2, z: t, w: ld, d: lw }; yaw = -Math.PI / 2; }
    else { box = { x: room.x0 + ld / 2, z: t, w: ld, d: lw }; yaw = Math.PI / 2; }
    if (!free(ctx, box, room)) continue;
    ctx.placed.push(makeProp(ctx, kindId, lw, ld, h, box, yaw));
    return true;
  }
  return false;
}

/** Frei im Raum (mit Abstand zu den Wänden), in eine der vier Richtungen gedreht. */
function placeCentered(ctx: FCtx, room: Rect, kindId: string): boolean {
  if (!capOk(ctx, kindId)) return false;
  if (kindId === 'table' || kindId === 'desk') return placeOrdered(ctx, room, kindId);
  for (let attempt = 0; attempt < 16; attempt++) {
    const { lw, ld, h } = rollSize(ctx, kindId);
    const turn = Math.floor(ctx.r() * 4);
    const yaw = (turn * Math.PI) / 2;
    const sw = turn % 2 === 0 ? lw : ld, sd = turn % 2 === 0 ? ld : lw;
    const m = 0.7;
    if (room.x1 - room.x0 < sw + 2 * m || room.z1 - room.z0 < sd + 2 * m) continue;
    const box: Box = {
      x: room.x0 + m + sw / 2 + ctx.r() * (room.x1 - room.x0 - sw - 2 * m),
      z: room.z0 + m + sd / 2 + ctx.r() * (room.z1 - room.z0 - sd - 2 * m),
      w: sw, d: sd,
    };
    if (!free(ctx, box, room)) continue;
    ctx.placed.push(makeProp(ctx, kindId, lw, ld, h, box, yaw));
    return true;
  }
  return false;
}

/**
 * Tische und Schreibtische stehen geordnet: ausgerichtet an der langen Raumachse, der erste in der Mitte,
 * weitere in gleichmäßigen Reihen daneben (alle in die gleiche Richtung).
 */
function placeOrdered(ctx: FCtx, room: Rect, kindId: string): boolean {
  const { lw, ld, h } = rollSize(ctx, kindId);
  const wide = room.x1 - room.x0 >= room.z1 - room.z0;
  // Länge entlang der langen Raumachse; Front (yaw) zeigt zur kurzen Seite
  const yaw = wide ? 0 : Math.PI / 2;
  const sw = wide ? lw : ld, sd = wide ? ld : lw;
  const cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2;
  const gapA = 1.5, gapB = 1.7;
  const stepX = sw + (wide ? gapA : gapB), stepZ = sd + (wide ? gapB : gapA);
  const order: [number, number][] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [-1, 1], [1, -1], [2, 0], [-2, 0]];
  for (const [i, j] of order) {
    const box: Box = { x: cx + i * stepX, z: cz + j * stepZ, w: sw, d: sd };
    if (box.x - sw / 2 < room.x0 + 0.7 || box.x + sw / 2 > room.x1 - 0.7 || box.z - sd / 2 < room.z0 + 0.7 || box.z + sd / 2 > room.z1 - 0.7) continue;
    if (!free(ctx, box, room)) continue;
    ctx.placed.push(makeProp(ctx, kindId, lw, ld, h, box, yaw));
    return true;
  }
  return false;
}

const idOf = (p: Prop) => PROP_KINDS[p.kind].id;

/** Ein Möbelstück relativ zu einem anderen setzen: (lx, lz) im Koordinatensystem des Bezugsstücks, Blickrichtung = yaw + turn. */
function placeRelative(ctx: FCtx, room: Rect, ref: Prop, kindId: string, lx: number, lz: number, turn: number): Prop | null {
  if (kindId !== 'chair' && !capOk(ctx, kindId)) return null;
  const { lw, ld, h } = rollSize(ctx, kindId);
  const c = Math.cos(ref.yaw), s = Math.sin(ref.yaw);
  const x = ref.x + lx * c + lz * s, z = ref.z - lx * s + lz * c;
  const yaw = ref.yaw + turn;
  const quarter = ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;
  const w = quarter % 2 === 0 ? lw : ld, d = quarter % 2 === 0 ? ld : lw;
  const box: Box = { x, z, w, d };
  if (!free(ctx, box, room)) return null;
  const p = makeProp(ctx, kindId, lw, ld, h, box, yaw);
  ctx.placed.push(p);
  return p;
}

/** Stühle um Tische und Schreibtische, Nachttische am Bett, Sofa gegenüber dem Fernseher: Möbel, die zusammengehören. */
function arrange(ctx: FCtx, room: Rect, inner: Rect, mine: Prop[], type: RoomType): void {
  const tables = mine.filter((p) => idOf(p) === 'table');
  for (const t of tables) {
    const per = (len: number) => (len > 2.3 ? 3 : len > 1.5 ? 2 : 1);
    const nLong = type === 'meeting' ? per(t.lw) : Math.min(2, per(t.lw));
    for (const side of [1, -1]) {
      for (let i = 0; i < nLong; i++) {
        const off = nLong === 1 ? 0 : (i - (nLong - 1) / 2) * (t.lw / nLong);
        placeRelative(ctx, inner, t, 'chair', off, side * (t.ld / 2 + 0.3), side > 0 ? Math.PI : 0);
      }
    }
    if (type === 'meeting' || type === 'kitchen') {
      placeRelative(ctx, inner, t, 'chair', t.lw / 2 + 0.3, 0, -Math.PI / 2);
      placeRelative(ctx, inner, t, 'chair', -t.lw / 2 - 0.3, 0, Math.PI / 2);
    }
  }
  for (const d of mine.filter((p) => idOf(p) === 'desk')) {
    // Schreibtisch: Stuhl davor, mit Blick zum Tisch
    placeRelative(ctx, inner, d, 'chair', 0, d.ld / 2 + 0.32, Math.PI);
  }
  for (const bed of mine.filter((p) => idOf(p) === 'bed')) {
    for (const side of [1, -1]) {
      if (type === 'bedroom' || side > 0) placeRelative(ctx, inner, bed, 'nightstand', side * (bed.lw / 2 + 0.27), -bed.ld / 2 + 0.24, 0);
    }
  }
  for (const tv of mine.filter((p) => idOf(p) === 'tvstand')) {
    // Sofa mit Blick zum Fernseher, in 2,4 m Abstand
    const sofa = placeRelative(ctx, inner, tv, 'sofa', 0, 2.5, Math.PI) ?? placeRelative(ctx, inner, tv, 'sofa', 0, 3.1, Math.PI);
    if (!sofa) placeAtWall(ctx, inner, 'sofa');
  }
  if (type === 'living' && !mine.some((p) => idOf(p) === 'tvstand')) placeAtWall(ctx, inner, 'sofa');
  void room;
}

function furnish(ctx: FCtx, room: Rect, type: RoomType): void {
  const inner = shrink(room, 0.14);
  const a = area(inner);
  const before = ctx.placed.length;
  ctx.room = type;
  setCap(ctx, inner);
  for (const [kind, min, max, mode] of FURNISH[type]) {
    let n = min + Math.floor(ctx.r() * (max - min + 1));
    // kleine Räume bekommen weniger
    if (a < 9) n = Math.min(n, kind === 'chair' || kind === 'crate' ? 1 : Math.max(min, 1));
    // Möbel mit Mindestzahl 0 stehen nur manchmal, und pro Raum gibt es ein Budget nach Fläche
    if (min === 0 && ctx.r() < 0.4) n = 0;
    const budget = ctx.cap!.total;
    for (let i = 0; i < n; i++) {
      if (i >= min && ctx.placed.length - before >= budget) break;
      const ok = mode === 'wall' ? placeAtWall(ctx, inner, kind) : placeCentered(ctx, inner, kind) || placeAtWall(ctx, inner, kind);
      if (!ok && i < min) break;
    }
  }
  arrange(ctx, room, inner, ctx.placed.slice(before), type);
}

/** Lagerhaus-Objekte (Paletten, Kisten, Sackkarre, Gasflasche, Leiter, Werkbank) in Fabriken, Lagern, Garagen und Scheunen */
function addWarehouseProps(ctx: FCtx, inner: Rect, type: RoomType): void {
  if (type !== 'factory' && type !== 'storage' && type !== 'garage' && type !== 'barn') return;
  let s = (Math.imul(Math.round(inner.x0 * 37), 19349663) ^ Math.imul(Math.round(inner.z0 * 23), 83492791) ^ (ctx.level + 5) * 73856093) >>> 0 || 1;
  const rnd = (): number => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0) / 4294967296);
  const saved = ctx.r;
  ctx.r = rnd;
  const want: [string, number][] = type === 'garage'
    ? [['whtable', 0.5], ['whgas', 0.5], ['whtruck', 0.3], ['whladder', 0.3]]
    : [['whpallet', 0.9], ['whpallet', 0.5], ['whcrates', 0.7], ['whtruck', 0.4], ['whgas', 0.4], ['whladder', 0.35], ['whtable', type === 'factory' ? 0.5 : 0.2]];
  for (const [kind, chance] of want) if (rnd() < chance) placeAtWall(ctx, inner, kind);
  ctx.r = saved;
}

/** Kartons mit Krempel (Lager, Fabrik, Büro, Laden), ebenfalls mit eigenem Zufallsstrom */
function addCardboxes(ctx: FCtx, inner: Rect, type: RoomType): void {
  const chance: Partial<Record<RoomType, number>> = { storage: 0.8, factory: 0.7, office: 0.25, shop: 0.2, garage: 0.3 };
  const c = chance[type];
  if (!c) return;
  let s = (Math.imul(Math.round(inner.x0 * 29), 83492791) ^ Math.imul(Math.round(inner.z0 * 13), 19349663) ^ (ctx.level + 3) * 73856093) >>> 0 || 1;
  const rnd = (): number => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0) / 4294967296);
  if (rnd() > c) return;
  const saved = ctx.r;
  ctx.r = rnd;
  const n = type === 'storage' || type === 'factory' ? 1 + Math.floor(rnd() * 2) : 1;
  for (let i = 0; i < n; i++) placeAtWall(ctx, inner, 'cardbox');
  ctx.r = saved;
}

/**
 * Waffenkisten gibt es nur in Fabrikhallen (selten) und im Polizeirevier. Sie werden mit einem eigenen Zufallsstrom
 * gewürfelt, damit die übrige Einrichtung (und damit die ganze Welt) unverändert bleibt.
 */
function addWeaponCrates(ctx: FCtx, inner: Rect, type: RoomType): void {
  setCap(ctx, inner);
  addCardboxes(ctx, inner, type);
  addWarehouseProps(ctx, inner, type);
  const police = !!ctx.police && type === 'office';
  if (!police && type !== 'factory') return;
  if (police && ctx.level !== 0) return; // Waffenkisten stehen nur im Erdgeschoss des Reviers
  let s = (Math.imul(Math.round(inner.x0 * 31), 73856093) ^ Math.imul(Math.round(inner.z0 * 17), 19349663) ^ (ctx.level + 1) * 83492791) >>> 0 || 1;
  const rnd = (): number => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0) / 4294967296);
  const n = police ? 1 + (rnd() < 0.35 ? 1 : 0) : rnd() < 0.45 ? 1 : 0;
  const saved = ctx.r;
  ctx.r = rnd;
  for (let i = 0; i < n; i++) placeAtWall(ctx, inner, i === 0 ? 'weaponcrate' : 'weaponcase');
  if (police) for (let i = 0; i < 1 + Math.floor(rnd() * 2); i++) placeAtWall(ctx, inner, 'locker');
  ctx.r = saved;
}

// ---------------------------------------------------------------------------------------------------------------
// Aufteilung pro Gebäudetyp und Etage
// ---------------------------------------------------------------------------------------------------------------

interface Level { rooms: Room[]; walls: Walls; props: Prop[]; decor: Decor[] }

interface StripGeo {
  plan: StairPlan;
  /** +1: Treppe liegt an der niedrigen v-Seite */
  sgn: 1 | -1;
  vEdge: number;
  strip: Rect;
  rest: Rect;
  landingA: number;
  landingB: number;
}

function stripGeo(plan: StairPlan): StripGeo {
  const { inner: I } = plan;
  const sgn: 1 | -1 = plan.lanes[0].v0 < (I.v0 + I.v1) / 2 ? 1 : -1;
  const vEdge = sgn > 0 ? Math.max(plan.lanes[0].v1, plan.lanes[1].v1) + 0.4 : Math.min(plan.lanes[0].v0, plan.lanes[1].v0) - 0.4;
  const strip = sgn > 0 ? rectUV(plan.axis, I.u0, I.u1, I.v0, vEdge) : rectUV(plan.axis, I.u0, I.u1, vEdge, I.v1);
  const rest = sgn > 0 ? rectUV(plan.axis, I.u0, I.u1, vEdge, I.v1) : rectUV(plan.axis, I.u0, I.u1, I.v0, vEdge);
  return { plan, sgn, vEdge, strip, rest, landingA: I.u0 + (plan.u0 - I.u0) / 2, landingB: plan.u1 + (I.u1 - plan.u1) / 2 };
}

type Roles = RoomType[];

function assignRoles(leaves: Rect[], roles: Roles, withBath: boolean): { rect: Rect; type: RoomType }[] {
  const sorted = [...leaves].sort((p, q) => area(q) - area(p));
  const out: { rect: Rect; type: RoomType }[] = [];
  let bath: Rect | null = null;
  if (withBath && sorted.length >= 3) bath = sorted.pop()!;
  sorted.forEach((rc, i) => out.push({ rect: rc, type: roles[Math.min(i, roles.length - 1)] }));
  if (bath) out.push({ rect: bath, type: 'bath' });
  return out;
}

const GROUND_ROLES: Partial<Record<BuildingKind, Roles>> = {
  house: ['living', 'kitchen', 'bedroom', 'storage'],
  apartment: ['living', 'kitchen', 'bedroom', 'storage'],
  hotel: ['lobby', 'storage', 'office'],
  office: ['office', 'meeting', 'office', 'storage'],
  shop: ['shop', 'storage', 'storage'],
  industry: ['factory', 'office', 'storage'],
  barn: ['barn'],
};

/**
 * Die Haustür führt in einen Flur bzw. ins Wohnzimmer, nie in Bad, Schlafzimmer, Küche oder Lager:
 * Liegt hinter der Tür so ein Raum, wird er zum Flur. Fehlte dadurch das Bad, wird ein Lagerraum dazu.
 */
function fixEntryRoom(list: { rect: Rect; type: RoomType }[], zone: Box): void {
  const entry = list.find((q) => zone.x >= q.rect.x0 && zone.x <= q.rect.x1 && zone.z >= q.rect.z0 && zone.z <= q.rect.z1);
  if (!entry) return;
  const bad: RoomType[] = ['bath', 'bedroom', 'kitchen', 'storage'];
  if (!bad.includes(entry.type)) return;
  const lost = entry.type;
  entry.type = 'hall';
  if (lost === 'storage') return;
  const spare = list.filter((q) => q.type === 'storage').sort((p, q) => area(p.rect) - area(q.rect))[0];
  if (spare) spare.type = lost;
}

function layoutLevel(b: BuildingSpec, f: number, r: () => number, doorZone: Box | null, doorZone2: Box | null = null): Level {
  const W: Walls = { boxes: [], lintels: [], clear: [], doors: [] };
  const rooms: Room[] = [];
  const ir = innerRect(b);
  const plan = b.stairs;
  const avoid: Box[] = f === 0 ? [doorZone, doorZone2].filter((z): z is Box => !!z) : [];
  const addRoom = (rect: Rect, type: RoomType) => rooms.push({ level: f, ...rect, type });

  if (b.kind === 'garage') {
    addRoom(ir, 'garage');
  } else if (b.kind === 'barn') {
    // Scheune: ein großer Raum je Etage (Treppenhaus an der Wand), unten Erde, oben der Heuboden
    if (plan) {
      const g = stripGeo(plan);
      addRoom(g.strip, 'hall');
      wallAtV(W, plan.axis, g.vEdge, plan.inner.u0, plan.inner.u1, [g.landingA, g.landingB], f);
      addRoom(g.rest, 'barn');
    } else addRoom(ir, 'barn');
  } else if (plan && f > 0) {
    // Obergeschoss: Treppenhaus, Flur, Zimmerreihe mit Türen zum Flur
    const g = stripGeo(plan);
    const { inner: I } = plan;
    addRoom(g.strip, 'hall');
    wallAtV(W, plan.axis, g.vEdge, I.u0, I.u1, [g.landingA, g.landingB], f);
    const cw = 1.9;
    const vC1 = g.vEdge + g.sgn * cw;
    addRoom(rectUV(plan.axis, I.u0, I.u1, Math.min(g.vEdge, vC1), Math.max(g.vEdge, vC1)), 'corridor');
    const far = g.sgn > 0 ? I.v1 : I.v0;
    const tw = b.kind === 'apartment' || b.kind === 'shop' ? 7.2 : b.kind === 'office' ? 5.8 : b.kind === 'hotel' ? 3.9 : 4.4;
    const len = I.u1 - I.u0;
    const n = Math.max(1, Math.round(len / tw));
    const gaps: number[] = [];
    const bandLo = Math.min(vC1, far), bandHi = Math.max(vC1, far);
    const slots: Rect[] = [];
    for (let i = 0; i < n; i++) {
      const a = I.u0 + (len * i) / n, c = I.u0 + (len * (i + 1)) / n;
      slots.push(rectUV(plan.axis, a, c, bandLo, bandHi));
      gaps.push((a + c) / 2);
      if (i > 0) wallAtU(W, plan.axis, a, bandLo, bandHi, [], f);
    }
    wallAtV(W, plan.axis, vC1, I.u0, I.u1, gaps, f);
    const roomRoles: Record<BuildingKind, RoomType[]> = {
      house: ['bedroom', 'bedroom', 'bath', 'bedroom'],
      apartment: [], shop: [],
      hotel: ['hotelroom'],
      office: ['office', 'office', 'meeting', 'bath', 'office'],
      industry: ['office', 'bath'],
      garage: [],
      barn: [],
    };
    slots.forEach((slot, i) => {
      if (b.kind === 'apartment' || b.kind === 'shop') {
        // Wohnung: eigener kleiner Grundriss mit Wohnzimmer, Küche, Schlafzimmer, Bad
        const flatAvoid = [...avoid, ...W.clear.filter((c) => c.lv === f)];
        const leaves = bsp(slot, { minSide: 2.5, maxArea: 22, maxLeaves: 4 }, r, W, f, flatAvoid);
        for (const rc of assignRoles(leaves, ['living', 'bedroom', 'kitchen', 'bedroom'], true)) addRoom(rc.rect, rc.type);
      } else {
        const list = roomRoles[b.kind];
        addRoom(slot, list[i % list.length]);
      }
    });
  } else {
    // Erdgeschoss bzw. einstöckiges Gebäude: (Treppenhaus +) Zimmer
    let rest = ir;
    if (plan) {
      const g = stripGeo(plan);
      addRoom(g.strip, 'hall');
      wallAtV(W, plan.axis, g.vEdge, plan.inner.u0, plan.inner.u1, [g.landingA, g.landingB], f);
      rest = g.rest;
    }
    const roles = GROUND_ROLES[b.kind] ?? ['living', 'kitchen', 'bedroom'];
    if (b.kind === 'shop') {
      // Verkaufsraum vorn (Tür), Lager und WC hinten
      const doorSide = b.door;
      const depthAxis: Axis = doorSide <= 1 ? 'z' : 'x';
      const frontPos = doorSide === 0 || doorSide === 2 ? 1 : -1; // Tür bei hohem Wert?
      const lo = depthAxis === 'z' ? rest.z0 : rest.x0, hi = depthAxis === 'z' ? rest.z1 : rest.x1;
      const split = frontPos > 0 ? hi - (hi - lo) * 0.62 : lo + (hi - lo) * 0.62;
      const along0 = depthAxis === 'z' ? rest.x0 : rest.z0, along1 = depthAxis === 'z' ? rest.x1 : rest.z1;
      const gap = (along0 + along1) / 2 + (r() - 0.5) * 2;
      let sales: Rect, back: Rect;
      if (depthAxis === 'z') {
        addWall(W, 'x', split, rest.x0, rest.x1, [gap], f);
        sales = frontPos > 0 ? { ...rest, z0: split } : { ...rest, z1: split };
        back = frontPos > 0 ? { ...rest, z1: split } : { ...rest, z0: split };
      } else {
        addWall(W, 'z', split, rest.z0, rest.z1, [gap], f);
        sales = frontPos > 0 ? { ...rest, x0: split } : { ...rest, x1: split };
        back = frontPos > 0 ? { ...rest, x1: split } : { ...rest, x0: split };
      }
      addRoom(sales, 'shop');
      const leaves = bsp(back, { minSide: 2.4, maxArea: 20, maxLeaves: 3 }, r, W, f, []);
      for (const rc of assignRoles(leaves, ['storage', 'storage'], leaves.length >= 2)) addRoom(rc.rect, rc.type);
    } else {
      const maxArea = b.kind === 'industry' ? 160 : b.kind === 'office' ? 38 : b.kind === 'hotel' ? 70 : b.kind === 'house' ? 34 : 30;
      const maxLeaves = b.kind === 'industry' ? 3 : b.kind === 'house' ? 5 : 6;
      const leaves = bsp(rest, { minSide: b.kind === 'industry' ? 3.2 : 2.6, maxArea, maxLeaves }, r, W, f, avoid);
      const assigned = assignRoles(leaves, roles, b.kind !== 'industry');
      if ((b.kind === 'house' || b.kind === 'apartment') && f === 0) for (const z of [doorZone, doorZone2]) if (z) fixEntryRoom(assigned, z);
      for (const rc of assigned) addRoom(rc.rect, rc.type);
    }
  }

  if (doorZone && f === 0) carveDoorZone(W, doorZone, f, b.door <= 1);
  if (doorZone2 && f === 0 && b.door2) carveDoorZone(W, doorZone2, f, b.door2.side <= 1);

  // Einrichtung
  const ctx: FCtx = { r, level: f, placed: [], avoid: [...avoid, ...W.clear], police: b.police };
  for (const room of rooms) furnish(ctx, room, room.type);
  const decor = addDecor(rooms, ctx.placed, W, f, r, avoid);
  // Waffenkisten zuletzt, mit eigenem Zufallsstrom: so bleibt die übrige Welt unverändert
  for (const room of rooms) addWeaponCrates(ctx, shrink(room, 0.14), room.type);
  return { rooms, walls: W, props: ctx.placed, decor };
}

type DecorWant = [kind: DecorKind, min: number, max: number];

const DECOR: Record<RoomType, DecorWant[]> = {
  living: [['paper', 2, 5], ['books', 0, 2], ['bottle', 0, 2], ['cloth', 0, 1], ['rug', 1, 1], ['plant', 0, 1], ['picture', 1, 3], ['lamp', 0, 1], ['can', 0, 2]],
  kitchen: [['paper', 1, 3], ['bottle', 1, 3], ['can', 1, 4], ['carton', 0, 1], ['picture', 0, 1], ['trashbag', 0, 1]],
  bedroom: [['cloth', 1, 3], ['paper', 1, 3], ['books', 0, 2], ['rug', 0, 1], ['picture', 1, 2], ['lamp', 0, 1]],
  bath: [['cloth', 0, 1], ['paper', 0, 2], ['bottle', 0, 2]],
  storage: [['carton', 3, 7], ['paper', 2, 5], ['bottle', 0, 2], ['bucket', 0, 2], ['trashbag', 0, 2], ['plank', 0, 2]],
  shop: [['paper', 4, 8], ['carton', 2, 5], ['can', 2, 6], ['bottle', 1, 4], ['trashbag', 0, 1], ['picture', 1, 3]],
  office: [['paper', 6, 12], ['books', 1, 3], ['carton', 1, 3], ['can', 1, 3], ['picture', 1, 3], ['plant', 0, 1]],
  meeting: [['paper', 3, 6], ['bottle', 1, 3], ['picture', 1, 2]],
  lobby: [['paper', 3, 6], ['plant', 1, 2], ['picture', 1, 3], ['rug', 1, 1]],
  hotelroom: [['cloth', 0, 2], ['paper', 0, 2], ['bottle', 0, 1], ['picture', 1, 1], ['lamp', 0, 1]],
  factory: [['carton', 3, 7], ['paper', 3, 6], ['bucket', 1, 3], ['can', 1, 3], ['plank', 1, 4], ['bottle', 0, 2]],
  garage: [['bucket', 0, 2], ['carton', 1, 3], ['paper', 1, 3], ['plank', 0, 2]],
  corridor: [['paper', 1, 4], ['picture', 1, 2], ['plant', 0, 1]],
  hall: [['paper', 0, 3], ['picture', 0, 1]],
  barn: [['hay', 3, 6], ['sack', 2, 4], ['bucket', 1, 2], ['plank', 2, 4]],
};

const SURFACES = new Set(['table', 'desk', 'counter', 'nightstand', 'tvstand', 'cabinet', 'chest', 'crate']);
const SMALL = new Set<DecorKind>(['paper', 'books', 'bottle', 'can', 'plant', 'lamp']);
const SOLID: Record<string, number> = { carton: 0.55, trashbag: 0.6, bucket: 0.4, plant: 0.45, lamp: 0.35, plank: 0.5 };

/** Streut Papier, Kartons, Flaschen, Bilder, Teppiche und Pflanzen in die Räume (ohne Kollision). */
function addDecor(rooms: Room[], props: Prop[], W: Walls, level: number, r: () => number, avoid: Box[]): Decor[] {
  const out: Decor[] = [];
  const blockers: Box[] = [...W.clear, ...avoid];
  for (const room of rooms) {
    const inner = shrink(room, 0.35);
    if (inner.x1 - inner.x0 < 0.6 || inner.z1 - inner.z0 < 0.6) continue;
    const roomArea = (room.x1 - room.x0) * (room.z1 - room.z0);
    let solids = 0;
    const solidMax = roomArea < 14 ? 1 : roomArea < 30 ? 2 : 99;
    const here = props.filter((p) => p.x > room.x0 && p.x < room.x1 && p.z > room.z0 && p.z < room.z1);
    for (const [kind, min, max] of DECOR[room.type]) {
      const n = Math.ceil((min + Math.floor(r() * (max - min + 1))) * (kind === 'picture' ? 0.8 : 0.6));
      for (let i = 0; i < n; i++) {
        const v = Math.floor(r() * 4);
        const s = 0.85 + r() * 0.3;
        const yaw = r() * Math.PI * 2;
        if (kind === 'picture') {
          // an eine Zimmerwand, Front zum Raum, oberhalb von Möbeln
          const side = Math.floor(r() * 4);
          const alongX = side < 2;
          const a0 = (alongX ? room.x0 : room.z0) + 0.9, a1 = (alongX ? room.x1 : room.z1) - 0.9;
          if (a1 <= a0) continue;
          const t = a0 + r() * (a1 - a0);
          const y = 1.35 + r() * 0.35;
          let x: number, z: number, wy: number;
          if (side === 0) { x = t; z = room.z1 - 0.12; wy = Math.PI; }
          else if (side === 1) { x = t; z = room.z0 + 0.12; wy = 0; }
          else if (side === 2) { x = room.x1 - 0.12; z = t; wy = -Math.PI / 2; }
          else { x = room.x0 + 0.12; z = t; wy = Math.PI / 2; }
          const probe: Box = { x, z, w: 0.9, d: 0.9 };
          if (W.clear.some((c) => hit(probe, c))) continue;
          out.push({ kind, x, y, z, yaw: wy, s, level, v });
          continue;
        }
        // auf einer Tischplatte o. Ä.
        if (SMALL.has(kind) && r() < 0.42) {
          const tops = here.filter((p) => SURFACES.has(PROP_KINDS[p.kind].id));
          if (tops.length) {
            const p = tops[Math.floor(r() * tops.length)];
            out.push({
              kind, x: p.x + (r() - 0.5) * Math.max(0.05, p.w - 0.3), y: p.h, z: p.z + (r() - 0.5) * Math.max(0.05, p.d - 0.3), yaw, s, level, v,
            });
            continue;
          }
        }
        const size = SOLID[kind];
        if (size && solids >= solidMax) continue;
        for (let attempt = 0; attempt < 8; attempt++) {
          const x = inner.x0 + r() * (inner.x1 - inner.x0), z = inner.z0 + r() * (inner.z1 - inner.z0);
          const probe: Box = { x, z, w: size ?? 0.3, d: size ?? 0.3 };
          if (kind !== 'rug' && here.some((p) => hit(probe, p, 0.02))) continue;
          if (size && blockers.some((c) => hit(probe, c))) continue;
          out.push({ kind, x, y: 0, z, yaw: kind === 'rug' ? Math.floor(r() * 2) * (Math.PI / 2) : yaw, s: kind === 'rug' ? 1 : s, level, v });
          if (size) solids++;
          break;
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Gebäude
// ---------------------------------------------------------------------------------------------------------------

function planStairs(b: BuildingSpec, r: () => number): void {
  const ir = innerRect(b);
  const { x0: X0, x1: X1, z0: Z0, z1: Z1 } = ir;
  const door = b.door;
  const alongZ = b.d >= b.w;
  const U0 = alongZ ? Z0 : X0, U1 = alongZ ? Z1 : X1;
  const V0 = alongZ ? X0 : Z0, V1 = alongZ ? X1 : Z1;
  // Podeste von mindestens ~2,7 m an beiden Enden, damit die Tür nie direkt in die Treppe führt
  const run = Math.max(3.4, Math.min(4.4, U1 - U0 - 5.8));
  const u0 = U0 + (U1 - U0 - run) / 2;
  const doorOnLong = alongZ ? door >= 2 : door <= 1;
  const sgn = doorOnLong ? (door === 2 || door === 0 ? 1 : -1) : r() < 0.5 ? 1 : -1;
  const lw = 1.5, gap = 0.3;
  const lane = (k: number) => sgn > 0
    ? { v0: V0 + 0.05 + k * (lw + gap), v1: V0 + 0.05 + k * (lw + gap) + lw }
    : { v0: V1 - 0.05 - k * (lw + gap) - lw, v1: V1 - 0.05 - k * (lw + gap) };
  b.stairs = { axis: alongZ ? 'z' : 'x', u0, u1: u0 + run, lanes: [lane(0), lane(1)], inner: { u0: U0, u1: U1, v0: V0, v1: V1 } };
}

/** Bereich hinter der Tür im Erdgeschoss, in dem weder Wände noch Möbel stehen dürfen */
function doorZoneOf(b: BuildingSpec, door: 0 | 1 | 2 | 3, u = 0, width = b.doorW): Box {
  const ir = innerRect(b);
  const dw = width + 1.0;
  const fr = sideFrame(b, door);
  const ox = fr.ax * u, oz = fr.az * u; // Verschiebung entlang der Wand
  return [
    { x: b.x + ox, z: ir.z1 - 1.3, w: dw, d: 2.6 }, { x: b.x + ox, z: ir.z0 + 1.3, w: dw, d: 2.6 },
    { x: ir.x1 - 1.3, z: b.z + oz, w: 2.6, d: dw }, { x: ir.x0 + 1.3, z: b.z + oz, w: 2.6, d: dw },
  ][door];
}

/** Haus, Geschäft, Hotel, Fabrik … je nach Zone. u = Urbanität 0..1 */
export function makeBuilding(
  r: () => number, lot: LotRect, door: 0 | 1 | 2 | 3, zone: Zone, u: number,
  force?: {
    kind?: BuildingKind;
    /** Gebäude füllt das Grundstück genau aus (Reihenhaus, Flügel eines L-Hauses): Wände stoßen an die Nachbarn */
    exact?: boolean;
    /** Zweiter Eingang oder Durchgang (siehe BuildingSpec.door2) */
    door2?: { side: 0 | 1 | 2 | 3; u: number; leaf: boolean; passage?: boolean; w?: number };
    /** Zweiter Flügel eines L-Hauses: Höhe, Wandart, Farben und Dach wie beim ersten, damit es ein Haus ist */
    copy?: BuildingSpec;
    /** Ganzes Grundstück für den Weg zur Straße, wenn `lot` nur der Bauplatz ist */
    pathLot?: LotRect;
  },
): BuildingSpec {
  const lx = lot.x - lot.w / 2, lz = lot.z - lot.d / 2;
  const roll = r();
  let kind: BuildingKind;
  switch (zone) {
    case 'downtown': kind = roll < 0.26 ? 'office' : roll < 0.5 ? 'hotel' : roll < 0.74 ? 'apartment' : 'shop'; break;
    case 'mixed': kind = roll < 0.34 ? 'shop' : roll < 0.56 ? 'apartment' : roll < 0.74 ? 'house' : roll < 0.84 ? 'office' : 'hotel'; break;
    case 'industrial': kind = roll < 0.8 ? 'industry' : 'shop'; break;
    case 'farm': kind = 'house'; break;
    default: kind = roll < 0.84 ? 'house' : roll < 0.92 ? 'apartment' : 'shop';
  }
  if (force?.kind) kind = force.kind;
  // Hotels brauchen Platz für Flur und Zimmerreihe
  if (kind === 'hotel' && Math.min(lot.w, lot.d) < 20) kind = 'apartment';
  if (kind === 'industry' && Math.min(lot.w, lot.d) < 20) kind = 'shop';

  const floors0 = kind === 'barn' ? 2
    : kind === 'office' ? 3 + Math.floor(r() * 3)
    : kind === 'hotel' ? 3 + Math.floor(r() * 3)
    : kind === 'apartment' ? 2 + Math.floor(r() * 3)
    : kind === 'shop' ? 1 + Math.floor(r() * (zone === 'downtown' ? 3 : 2))
    : kind === 'industry' ? (r() < 0.25 ? 2 : 1)
    : r() < 0.4 ? 2 : 1;
  const floors = force?.copy?.floors ?? floors0;
  const w = force?.exact ? lot.w : kind === 'barn' ? Math.min(lot.w - 4, 15 + r() * 3)
    : kind === 'industry' ? Math.max(14, lot.w - 4.5 - r() * 2)
    : kind === 'house' ? Math.min(lot.w - 3, 9 + r() * 6)
    : Math.max(9.5, lot.w - 4.5 - r() * 2.5);
  const d = force?.exact ? lot.d : kind === 'barn' ? Math.min(lot.d - 4, 11 + r() * 3)
    : kind === 'industry' ? Math.max(14, lot.d - 4.5 - r() * 2)
    : kind === 'house' ? Math.min(lot.d - 3, 9 + r() * 6)
    : Math.max(9.5, lot.d - 4.5 - r() * 2.5);
  const x = force?.exact ? lot.x : lx + lot.w / 2 + (r() - 0.5) * Math.max(0, lot.w - w - 3);
  const z = force?.exact ? lot.z : lz + lot.d / 2 + (r() - 0.5) * Math.max(0, lot.d - d - 3);
  const style0: WallStyle = kind === 'barn' ? 'wood'
    : zone === 'farm' && kind === 'house' ? (r() < 0.75 ? 'wood' : 'stone')
    : kind === 'house' ? pick<WallStyle>(r, ['siding', 'siding', 'brick', 'stucco', 'stucco', 'clinker', 'stone', 'darkbrick', 'plaster'])
    : kind === 'office' ? pick<WallStyle>(r, ['concrete', 'concrete', 'darkbrick', 'plaster', 'stone', 'panel', 'panel'])
    : kind === 'industry' ? pick<WallStyle>(r, ['concrete', 'darkbrick', 'concrete'])
    : kind === 'hotel' ? pick<WallStyle>(r, ['brick', 'plaster', 'stone', 'stucco', 'clinker'])
    : kind === 'apartment' ? pick<WallStyle>(r, ['brick', 'darkbrick', 'plaster', 'panel', 'panel', 'clinker', 'stucco', 'stone'])
    : pick<WallStyle>(r, ['brick', 'plaster', 'siding', 'darkbrick', 'stone', 'stucco', 'clinker']);
  const style: WallStyle = force?.copy?.style ?? style0;

  // Etwa jedes sechste Büro im Zentrum ist ein Polizeirevier
  const police = kind === 'office' && (Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) < 0.17;
  const b: BuildingSpec = {
    x, z, w, d, h: floors * FLOOR_H, floors, kind, style, door, doorW: doorFor(kind, x, z).w, doorStyle: doorFor(kind, x, z).style,
    color: styleColor(r, style),
    trim: pick(r, TRIM_COLORS),
    windows: [],
    shopName: kind === 'shop' ? pick(r, SHOP_NAMES) : kind === 'hotel' ? pick(r, HOTEL_NAMES) : kind === 'industry' ? pick(r, FACTORY_NAMES) : police ? 'POLIZEI' : null,
    police,
    signColor: ((c) => (police ? 0x1f3a7a : c))(pick(r, SIGN_COLORS)),
    awning: kind === 'shop' && r() < 0.7 ? pick(r, AWNING_COLORS) : null,
    fortified: r() < 0.16,
    roofUnits: [],
    emitters: [],
    acs: [],
    rooms: [],
    partitions: [],
    decor: [],
    driveway: null,
    lot,
    props: [],
    roof: kind === 'barn' || (kind === 'house' && (floors === 1 || r() > 0.4)) ? 'gable' : 'flat',
    ridgeX: w >= d,
    roofColor: pick(r, ROOF_COLORS),
    stairs: null,
    path: null,
  };
  void u;
  // Flügel desselben Hauses: gleiche Farben, Fassade und Dach
  if (force?.copy) {
    const c = force.copy;
    Object.assign(b, { color: c.color, trim: c.trim, roofColor: c.roofColor, roof: c.roof, fortified: c.fortified, awning: c.awning });
  }
  // Zweiter Eingang: nur wenn die Wand lang genug ist (Haus, Wohnblock, Geschäft, Hotel, Büro)
  const d2 = force?.door2;
  if (d2 && ['house', 'apartment', 'shop', 'hotel', 'office'].includes(kind) && (d2.side <= 1 ? w : d) >= Math.abs(d2.u) * 2 + (d2.w ?? b.doorW) + 2.2) b.door2 = d2;

  if (floors > 1) planStairs(b, r);

  // Tür-Zonen im EG (nach innen), damit dort nichts im Weg steht
  const doorZone = doorZoneOf(b, door);
  const doorZone2 = b.door2 ? doorZoneOf(b, b.door2.side, b.door2.u, b.door2.w ?? b.doorW) : null;

  for (let f = 0; f < floors; f++) {
    const lvl = layoutLevel(b, f, r, doorZone, doorZone2);
    b.rooms.push(...lvl.rooms);
    // Türöffnungen im Erdgeschoss bekommen echte Türen; hinter der Haustür liegt der Durchgang frei (siehe carveDoorZone)
    const doors = lvl.walls.doors
      .filter((d) => d.lv === f && !(f === 0 && [doorZone, doorZone2].some((z) => z && z.x - z.w / 2 - 0.5 < (d.orient === 'x' ? d.g : d.c) && (d.orient === 'x' ? d.g : d.c) < z.x + z.w / 2 + 0.5 && z.z - z.d / 2 - 0.5 < (d.orient === 'x' ? d.c : d.g) && (d.orient === 'x' ? d.c : d.g) < z.z + z.d / 2 + 0.5)))
      .map((d) => ({ orient: d.orient, c: d.c, g: d.g, w: GAP, t: PART_T }));
    b.partitions.push({ level: f, boxes: lvl.walls.boxes, lintels: lvl.walls.lintels, doors });
    b.props.push(...lvl.props);
    b.decor.push(...lvl.decor);
  }

  addWindows(b, r);
  dropPicturesAtWindows(b);
  addRoofDetails(b, r);
  addWallAcs(b, r);
  finishPath(b, force?.pathLot ?? lot, door);
  // Weg vom zweiten Eingang zum Gehweg (nicht beim Durchgang zwischen zwei Flügeln)
  if (b.door2?.leaf && !b.door2.passage && force?.pathLot) {
    const saved = { path: b.path, w: b.pathW };
    finishPath(b, force.pathLot, b.door2.side, b.door2.u);
    b.path2 = b.path;
    b.path = saved.path;
    b.pathW = saved.w;
  }
  return b;
}

/** Dachaufbauten (Klimageräte, Wassertürme, Schornsteine, Schüsseln, Solarpaneele …) + Rauch- und Dampfquellen */
function addRoofDetails(b: BuildingSpec, r: () => number): void {
  const placed = b.roofUnits;
  const spot = (w: number, d: number): { x: number; z: number } | null => {
    for (let t = 0; t < 14; t++) {
      const x = b.x + (r() - 0.5) * Math.max(0, b.w - w - 2.2), z = b.z + (r() - 0.5) * Math.max(0, b.d - d - 2.2);
      if (!placed.some((p) => Math.abs(p.x - x) < (p.w + w) / 2 + 0.9 && Math.abs(p.z - z) < (p.d + d) / 2 + 0.9)) return { x, z };
    }
    return null;
  };
  const top = b.h + 0.3;
  const put = (kind: RoofUnit['kind'], w: number, d: number, h: number, y0 = top): RoofUnit | null => {
    const sp = spot(w, d);
    if (!sp) return null;
    const u: RoofUnit = { kind, x: sp.x, z: sp.z, w, d, h, y0 };
    placed.push(u);
    return u;
  };
  const smoke = (u: RoofUnit | null, kind: 'smoke' | 'steam', p: number, dy = 0) => {
    if (u && r() < p) b.emitters.push({ x: u.x, y: u.y0 + u.h + dy, z: u.z, kind });
  };

  if (b.roof === 'gable') {
    const rise = Math.min(2.6, 0.32 * Math.min(b.w, b.d) + 0.5);
    if (b.kind === 'house' && r() < 0.4) {
      const cx = b.x + (b.ridgeX ? (r() - 0.5) * b.w * 0.5 : 0.7);
      const cz = b.z + (b.ridgeX ? 0.7 : (r() - 0.5) * b.d * 0.5);
      const u: RoofUnit = { kind: 'chimney', x: cx, z: cz, w: 0.7, d: 0.7, h: rise + 1.0, y0: b.h };
      placed.push(u);
      smoke(u, 'smoke', 0.55, 0.35);
    }
    if (b.kind !== 'barn' && r() < 0.3) {
      const x = b.x + (b.ridgeX ? (r() - 0.5) * b.w * 0.4 : 0), z = b.z + (b.ridgeX ? 0 : (r() - 0.5) * b.d * 0.4);
      placed.push({ kind: r() < 0.5 ? 'antenna' : 'dish', x, z, w: 0.5, d: 0.5, h: 2, y0: b.h + rise - 0.15 });
    }
    return;
  }

  if (b.kind === 'industry') {
    for (let k = 0; k < 2; k++) {
      const h = 6 + r() * 3.5;
      smoke(put('stack', 1.5, 1.5, h), 'smoke', 1, 0.2);
    }
    for (let k = 0; k < 3; k++) smoke(put('vent', 0.9, 0.9, 1.5), 'steam', 0.6);
    for (let k = 0; k < 2 + Math.floor(r() * 2); k++) put('skylight', 2.4, 1.6, 0.3);
    put('duct', 5.5 + r() * 3, 4 + r() * 2, 0.7);
    for (let k = 0; k < 2; k++) smoke(put('ac', 1.9, 1.3, 1.05), 'steam', 0.5, 0.1);
    put('hatch', 1.2, 1.2, 0.8);
    if (r() < 0.5) put('solar', 6, 2.4, 0.6);
    return;
  }

  for (let k = 0; k < 1 + Math.floor(r() * 3); k++) {
    const big = r() < 0.4;
    smoke(put('ac', big ? 2.0 : 1.5, big ? 1.4 : 1.1, big ? 1.1 : 0.95), 'steam', 0.5, 0.1);
  }
  if (b.floors >= 2 && r() < 0.75) put('hatch', 1.1, 1.1, 0.8);
  if (b.floors >= 3 && r() < 0.45) put('tank', 2.4, 2.4, 3.6);
  if ((b.kind === 'apartment' || b.kind === 'hotel') && r() < 0.4) {
    for (let k = 0; k < 1 + Math.floor(r() * 2); k++) put('dish', 0.6, 0.6, 1.5);
  }
  if (r() < 0.25) put('antenna', 0.5, 0.5, 2.6);
  if ((b.kind === 'shop' || b.kind === 'office') && r() < 0.4) put('skylight', 2.2, 1.5, 0.3);
  if ((b.kind === 'office' || b.kind === 'hotel') && r() < 0.4) put('duct', 4.5, 3.5, 0.7);
  if (r() < 0.2) put('solar', 5.2, 2.2, 0.6);
  if ((b.kind === 'hotel' || b.kind === 'apartment') && r() < 0.5) {
    const c = put('chimney', 0.9, 0.9, 2.6);
    smoke(c, 'smoke', 0.5, 0.35);
  }
  if (r() < 0.5) smoke(put('vent', 0.8, 0.8, 1.4), 'steam', 0.6);
}

/** Klimageräte unter einzelnen Fenstern an der Außenwand */
function addWallAcs(b: BuildingSpec, r: () => number): void {
  if (b.kind !== 'apartment' && b.kind !== 'hotel' && b.kind !== 'office') return;
  for (const w of b.windows) {
    if (w.state !== 'glass' || w.floor === 0 || r() > 0.14) continue;
    b.acs.push({ side: w.side, u: w.u + w.w / 2 + 0.55, floor: w.floor, y: w.y0 });
    if (r() < 0.35) {
      const f = sideFrame(b, w.side);
      const u = w.u + w.w / 2 + 0.55;
      b.emitters.push({
        x: f.cx + f.ax * u + f.nx * (WALL / 2 + 0.45), y: w.y0 - 0.1, z: f.cz + f.az * u + f.nz * (WALL / 2 + 0.45), kind: 'steam',
      });
    }
  }
}

function finishPath(b: BuildingSpec, lot: LotRect, door: 0 | 1 | 2 | 3, u = 0): void {
  const lx = lot.x - lot.w / 2, lz = lot.z - lot.d / 2;
  const out = [[0, 1], [0, -1], [1, 0], [-1, 0]][door];
  const edge = [lz + lot.d, lz, lx + lot.w, lx][door];
  const face = [b.z + b.d / 2, b.z - b.d / 2, b.x + b.w / 2, b.x - b.w / 2][door];
  const len = Math.abs(edge - face);
  // Wohnhäuser: schmaler Weg; Geschäfte, Büros, Hotels, Fabriken: breiter Betonvorplatz bis zum Eingang
  const wide = b.kind === 'house' ? PATH_W : Math.max(PATH_W, Math.min((door <= 1 ? b.w : b.d) - 1, b.doorW + (b.kind === 'industry' ? 6 : 4.5)));
  b.pathW = wide;
  if (len > 0.5) {
    const mid = (edge + face) / 2;
    const fr = sideFrame(b, door);
    b.path = out[0] === 0 ? { x: b.x + fr.ax * u, z: mid, w: wide, d: len } : { x: mid, z: b.z + fr.az * u, w: len, d: wide };
  }
}

/** Blumenbeete an der Hauswand neben dem Weg und eine Hecke zur Straße (mit Lücken für Weg und Zufahrt). */
export function gardenFor(r: () => number, b: BuildingSpec, lot: LotRect, door: 0 | 1 | 2 | 3, garage: BuildingSpec | null): {
  beds: Box[]; hedges: Box[]; flowers: { x: number; z: number }[];
} {
  const beds: Box[] = [], hedges: Box[] = [], flowers: { x: number; z: number }[] = [];
  const along = door <= 1; // Eingangswand läuft entlang x
  const sgn = door === 0 || door === 2 ? 1 : -1; // Richtung nach außen
  const faceLen = along ? b.w : b.d;
  const bedW = Math.min(3.6, faceLen / 2 - PATH_W / 2 - 0.9);
  const keepOut: Box | null = garage ? { x: garage.x, z: garage.z, w: garage.w + 1.2, d: garage.d + 1.2 } : null;
  if (bedW >= 1.4) {
    for (const side of [-1, 1]) {
      const off = side * (PATH_W / 2 + 0.45 + bedW / 2);
      const out = 0.3 + 0.55;
      const face = door === 0 ? b.z + b.d / 2 : door === 1 ? b.z - b.d / 2 : door === 2 ? b.x + b.w / 2 : b.x - b.w / 2;
      const box: Box = along ? { x: b.x + off, z: face + sgn * out, w: bedW, d: 1.1 } : { x: face + sgn * out, z: b.z + off, w: 1.1, d: bedW };
      if (keepOut && hit(box, keepOut)) continue;
      beds.push(box);
      const n = 6 + Math.floor(r() * 5);
      for (let i = 0; i < n; i++) flowers.push({ x: box.x + (r() - 0.5) * (box.w - 0.3), z: box.z + (r() - 0.5) * (box.d - 0.3) });
    }
  }
  if (r() < 0.6) {
    // Hecke entlang der Straßenseite, in Segmenten zwischen den Lücken
    const edge = door === 0 ? lot.z + lot.d / 2 - 0.5 : door === 1 ? lot.z - lot.d / 2 + 0.5 : door === 2 ? lot.x + lot.w / 2 - 0.5 : lot.x - lot.w / 2 + 0.5;
    const lo = (along ? lot.x : lot.z) - (along ? lot.w : lot.d) / 2 + 0.4, hi = (along ? lot.x : lot.z) + (along ? lot.w : lot.d) / 2 - 0.4;
    const gaps: [number, number][] = [];
    const pc = along ? b.x : b.z;
    gaps.push([pc - ((b.pathW ?? PATH_W) / 2 + 0.6), pc + ((b.pathW ?? PATH_W) / 2 + 0.6)]);
    if (garage?.driveway) {
      const d = garage.driveway, dc = along ? d.x : d.z, dw = (along ? d.w : d.d) / 2 + 0.5;
      gaps.push([dc - dw, dc + dw]);
    }
    gaps.sort((p, q) => p[0] - q[0]);
    let cur = lo;
    const seg = (a0: number, a1: number) => {
      if (a1 - a0 < 1) return;
      hedges.push(along ? { x: (a0 + a1) / 2, z: edge, w: a1 - a0, d: 0.7 } : { x: edge, z: (a0 + a1) / 2, w: 0.7, d: a1 - a0 });
    };
    for (const [g0, g1] of gaps) {
      seg(cur, Math.min(g0, hi));
      cur = Math.max(cur, g1);
    }
    seg(cur, hi);
  }
  return { beds, hedges, flowers };
}

/**
 * Garage mit Zufahrt neben einem Haus: Tor zur selben Straße wie die Haustür. Gibt null zurück, wenn kein Platz ist.
 */
export function tryGarage(r: () => number, lot: LotRect, house: BuildingSpec, door: 0 | 1 | 2 | 3): BuildingSpec | null {
  const gw = 5.0, gd = 6.8; // Breite entlang der Straße, Tiefe ins Grundstück
  const lx0 = lot.x - lot.w / 2, lx1 = lot.x + lot.w / 2, lz0 = lot.z - lot.d / 2, lz1 = lot.z + lot.d / 2;
  const along = door <= 1; // Straße läuft entlang x
  const back = 2.6; // Platz für die Zufahrt zwischen Tor und Gehweg
  const side = r() < 0.5 ? -1 : 1;
  for (const sg of [side, -side]) {
    let x: number, z: number, w: number, d: number;
    if (along) {
      w = gw; d = gd;
      x = sg > 0 ? lx1 - 1.2 - gw / 2 : lx0 + 1.2 + gw / 2;
      z = door === 0 ? lz1 - back - gd / 2 : lz0 + back + gd / 2;
    } else {
      w = gd; d = gw;
      z = sg > 0 ? lz1 - 1.2 - gw / 2 : lz0 + 1.2 + gw / 2;
      x = door === 2 ? lx1 - back - gd / 2 : lx0 + back + gd / 2;
    }
    const box: Box = { x, z, w, d };
    if (hit(box, { x: house.x, z: house.z, w: house.w + 3, d: house.d + 3 })) continue;
    const g: BuildingSpec = {
      x, z, w, d, h: FLOOR_H, floors: 1, kind: 'garage', style: pick<WallStyle>(r, ['siding', 'concrete', 'brick']), door, doorW: 3.4, doorStyle: 'steel',
      color: 0, trim: pick(r, TRIM_COLORS), windows: [], shopName: null, police: false, signColor: 0, awning: null, fortified: false,
      roofUnits: [], emitters: [], acs: [], rooms: [], partitions: [], decor: [], driveway: null, lot, props: [], roof: 'gable',
      ridgeX: w >= d, roofColor: pick(r, ROOF_COLORS), stairs: null, path: null,
    };
    g.color = styleColor(r, g.style);
    const lvl = layoutLevel(g, 0, r, doorZoneOf(g, door));
    g.rooms.push(...lvl.rooms);
    g.props.push(...lvl.props);
    g.decor.push(...lvl.decor);
    g.partitions.push({ level: 0, boxes: [], lintels: [] });
    addWindows(g, r);
    // Zufahrt: vom Tor bis zum Gehweg
    const len = back + 0.2, dw = g.doorW + 0.5;
    g.driveway = along
      ? { x, z: door === 0 ? z + d / 2 + len / 2 : z - d / 2 - len / 2, w: dw, d: len }
      : { x: door === 2 ? x + w / 2 + len / 2 : x - w / 2 - len / 2, z, w: len, d: dw };
    return g;
  }
  return null;
}



/** Bilder hängen nicht vor Fenstern: Wanddeko an einer Außenwand, die in der Fensterbreite liegt, entfällt */
export function dropPicturesAtWindows(b: BuildingSpec): void {
  b.decor = b.decor.filter((d) => {
    if (d.kind !== 'picture') return true;
    for (const w of b.windows) {
      if (w.floor !== d.level) continue;
      const fr = sideFrame(b, w.side);
      const dx = d.x - fr.cx, dz = d.z - fr.cz;
      const along = dx * fr.ax + dz * fr.az;
      const normal = dx * fr.nx + dz * fr.nz; // negativ = im Haus
      if (Math.abs(normal + WALL / 2) < 0.6 && Math.abs(along - w.u) < w.w / 2 + 0.55) return false;
    }
    return true;
  });
}

/** Engste Gasse (m), in der Fenster noch zum Nachbarhaus zeigen dürfen; darunter schaut man nur gegen eine fremde Wand */
export const MIN_WINDOW_GAP = 3.6;

/**
 * Wo Häuser Wand an Wand stehen (Reihenhaus, Flügel eines L-Hauses) oder nur eine schmale Gasse trennt,
 * gibt es auf der Wand zum Nachbarn keine Fenster und keine Klimageräte: dahinter ist ja das Nachbarhaus.
 */
export function pruneTouchingWalls(list: BuildingSpec[]): void {
  const line = (b: BuildingSpec, s: number): number => (s === 0 ? b.z + b.d / 2 : s === 1 ? b.z - b.d / 2 : s === 2 ? b.x + b.w / 2 : b.x - b.w / 2);
  const span = (b: BuildingSpec, s: number): [number, number] => (s <= 1 ? [b.x - b.w / 2, b.x + b.w / 2] : [b.z - b.d / 2, b.z + b.d / 2]);
  const opposite = [1, 0, 3, 2];
  for (const a of list) {
    for (const o of list) {
      if (a === o) continue;
      for (let s = 0; s < 4; s++) {
        // Abstand der beiden Wände voneinander (negativ: sie überlappen leicht)
        const gap = (line(o, opposite[s]) - line(a, s)) * (s === 0 || s === 2 ? 1 : -1);
        if (gap < -0.6 || gap > MIN_WINDOW_GAP) continue;
        const [a0, a1] = span(a, s), [o0, o1] = span(o, opposite[s]);
        const lo = Math.max(a0, o0), hi = Math.min(a1, o1);
        if (hi - lo < 0.4) continue;
        const fr = sideFrame(a, s);
        const toWorld = (u: number): number => (s <= 1 ? a.x + fr.ax * u : a.z + fr.az * u);
        const covers = (u0: number, u1: number): boolean => {
          const m0 = Math.min(toWorld(u0), toWorld(u1)), m1 = Math.max(toWorld(u0), toWorld(u1));
          return m1 > lo - 0.15 && m0 < hi + 0.15;
        };
        a.windows = a.windows.filter((w) => !(w.side === s && covers(w.u - w.w / 2, w.u + w.w / 2)));
        a.acs = a.acs.filter((c) => !(c.side === s && covers(c.u - 0.6, c.u + 0.6)));
      }
    }
  }
}
