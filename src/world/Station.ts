import { Box, CHUNK, ChunkSpec, newCar, pick, rng } from './CityGenerator';
import { makeBuilding } from './Buildings';
import { PathSlice, Station, hf, poseAt, sliceDist } from './WorldMap';

/**
 * Raststätten und Tankstellen: Tankdach mit Zapfsäuleninseln, Preismast, Shop, Parkplätze, Picknicktische, Bäume.
 * Das Layout hängt nur von der Station ab (eigener Zufall), jeder Chunk übernimmt die Teile, deren Mitte bei ihm liegt.
 */

export interface Canopy { x: number; z: number; w: number; d: number }
/** Kleinkram am Shop: Getränkeautomat, Eistruhe, Luftdrucksäule (Front zeigt nach −z bei rot 0) */
export interface Vendor { x: number; z: number; rot: number; kind: 'drinks' | 'ice' | 'air' }
/** Zapfsäuleninsel: Betonsockel entlang z (rot 0) mit zwei Säulen */
export interface PumpIsland { x: number; z: number; rot: number }
export interface Pylon { x: number; z: number; rot: number; h: number }
export interface Picnic { x: number; z: number; rot: number }
/** Asphaltfläche dicht über dem Boden (liegt unter Fahrbahnen): Zufahrten */
export interface Apron { x: number; z: number; w: number; d: number }
/** Asphaltstück über einer Fahrbahnkante, das die Randlinie an Einfahrten unterbricht */
export interface EdgeCover { x: number; z: number; w: number; d: number; rot: number; y: number }

const GREEN = [0x3f7a43, 0x4c8a47, 0x35693c, 0x5a8f4a];
const FLOWERS = [0xf4f1e6, 0xf3d84a, 0xe58aae, 0xe8664a];

const inBox = (b: Box, x: number, z: number, pad: number) => Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad;
const hit = (a: Box, b: Box, pad: number) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + pad;

/** Räumt eine Fläche frei: Bäume, Büsche, Modelle, Gebäude, Felder, Zäune und Hofkram, die hineinragen */
export function clearArea(spec: ChunkSpec, area: Box, pad = 1.5): void {
  spec.trees = spec.trees.filter((t) => !inBox(area, t.x, t.z, pad + 1));
  spec.bushes = spec.bushes.filter((t) => !inBox(area, t.x, t.z, pad));
  spec.flowers = spec.flowers.filter((t) => !inBox(area, t.x, t.z, pad));
  spec.models = spec.models.filter((t) => !inBox(area, t.x, t.z, pad));
  spec.hay = spec.hay.filter((t) => !inBox(area, t.x, t.z, pad));
  spec.sacks = spec.sacks.filter((t) => !inBox(area, t.x, t.z, pad));
  spec.ladders = spec.ladders.filter((t) => !inBox(area, t.x, t.z, pad));
  spec.benches = spec.benches.filter((t) => !inBox(area, t.x, t.z, pad));
  spec.lamps = spec.lamps.filter((t) => !inBox(area, t.x, t.z, pad));
  spec.cars = spec.cars.filter((t) => !inBox(area, t.x, t.z, pad));
  spec.stalls = spec.stalls.filter((t) => !inBox(area, t.x, t.z, pad));
  spec.buildings = spec.buildings.filter((b) => !hit(area, b, pad));
  spec.decks = spec.decks.filter((b) => !hit(area, b, pad));
  spec.yards = spec.yards.filter((b) => !hit(area, b, pad));
  spec.fields = spec.fields.filter((b) => !hit(area, b, pad));
  spec.pads = spec.pads.filter((b) => !hit(area, b, 0));
  spec.beds = spec.beds.filter((b) => !hit(area, b, pad));
  spec.hedges = spec.hedges.filter((b) => !hit(area, b, pad));
  spec.fences = spec.fences.filter((f) => {
    const b: Box = { x: (f.x0 + f.x1) / 2, z: (f.z0 + f.z1) / 2, w: Math.abs(f.x1 - f.x0) + 0.2, d: Math.abs(f.z1 - f.z0) + 0.2 };
    return !hit(area, b, pad);
  });
}

/** Rechteck auf den Chunk zuschneiden (null, wenn nichts übrig bleibt) */
function clip(b: Box, ox: number, oz: number): Box | null {
  const x0 = Math.max(b.x - b.w / 2, ox), x1 = Math.min(b.x + b.w / 2, ox + CHUNK);
  const z0 = Math.max(b.z - b.d / 2, oz), z1 = Math.min(b.z + b.d / 2, oz + CHUNK);
  if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return null;
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}

/** Asphaltstücke über der Randlinie einer Straße (entlang des Pfades zwischen x0 und x1, Seite `side`) */
function edgeCovers(sl: PathSlice, x0: number, x1: number, zRef: number, inChunk: (x: number, z: number) => boolean, out: EdgeCover[]): void {
  const p = sl.path;
  const y = p.kind === 'country' ? 0.0235 : p.kind === 'lane' ? 0.0225 : 0.0372;
  for (let x = x0 + 1.5; x < x1 - 1.5; x += 3) {
    const q = sliceDist(sl, x, zRef);
    const ps = poseAt(p, q.s);
    const nx = -ps.tz, nz = ps.tx;
    // Seite, auf der die Station liegt
    const side = (x - ps.x) * nx + (zRef - ps.z) * nz >= 0 ? 1 : -1;
    const off = p.width / 2 - 0.45;
    const cx = ps.x + nx * side * off, cz = ps.z + nz * side * off;
    if (!inChunk(cx, cz)) continue;
    out.push({ x: cx, z: cz, w: 3.3, d: 0.75, rot: Math.atan2(-ps.tz, ps.tx), y });
  }
}

/** Teile der Station, die im Chunk (cx, cz) liegen, in die Chunk-Beschreibung eintragen. */
export function buildStation(spec: ChunkSpec, st: Station, cx: number, cz: number, slices: PathSlice[]): void {
  const ox = cx * CHUNK, oz = cz * CHUNK;
  const inChunk = (x: number, z: number) => x >= ox && x < ox + CHUNK && z >= oz && z < oz + CHUNK;
  const area: Box = { x: st.x, z: st.z, w: st.w, d: st.d };
  clearArea(spec, area, 2);
  const ap = st.apron;
  clearArea(spec, { x: (ap.x0 + ap.x1) / 2, z: (ap.z0 + ap.z1) / 2, w: ap.x1 - ap.x0, d: ap.z1 - ap.z0 }, 0.5);

  const seed = [...st.id].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 17) >>> 0;
  const r = rng(seed);
  const hw = st.kind === 'highway';
  const f = st.front;
  const frontZ = st.z + (f * st.d) / 2;
  /** Weltpunkt aus (u längs der Straße, v Tiefe von der Straßenkante ins Gelände) */
  const P = (u: number, v: number) => ({ x: st.x + u, z: frontZ - f * v });
  const rect = (u0: number, v0: number, u1: number, v1: number): Box => {
    const a = P(u0, v0), b = P(u1, v1);
    return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, w: Math.abs(b.x - a.x), d: Math.abs(b.z - a.z) };
  };
  const at = (u: number, v: number, fn: (x: number, z: number) => void) => {
    const q = P(u, v);
    if (inChunk(q.x, q.z)) fn(q.x, q.z);
  };
  const H = st.w / 2;

  // --- Zufahrt und Randlinie der Straße unterbrechen ---
  const apron: Box = { x: (ap.x0 + ap.x1) / 2, z: (ap.z0 + ap.z1) / 2, w: ap.x1 - ap.x0 - 4, d: ap.z1 - ap.z0 + 0.6 };
  const ac = clip(apron, ox, oz);
  if (ac) spec.aprons.push(ac);
  let road: PathSlice | null = null, best = Infinity;
  for (const sl of slices) {
    if (sl.path.kind !== (hw ? 'service' : 'country')) continue;
    const d = sliceDist(sl, st.x, frontZ).d;
    if (d < best) {
      best = d;
      road = sl;
    }
  }
  if (road) edgeCovers(road, st.x - H + 3, st.x + H - 3, st.z, inChunk, spec.edgeCovers);

  // --- Shop hinten; sein Grundstück wird so verschoben, dass es ganz in einem Chunk liegt
  // (Gebäude gehören genau einem Chunk). Alle Chunks rechnen dieselbe Verschiebung. ---
  const lot0 = rect(hw ? -14 : 3, hw ? 22 : 20, hw ? 14 : 25, st.d - 1);
  const lcx = Math.floor(lot0.x / CHUNK), lcz = Math.floor(lot0.z / CHUNK);
  const lot: Box = {
    ...lot0,
    x: Math.max(lcx * CHUNK + lot0.w / 2 + 0.5, Math.min((lcx + 1) * CHUNK - lot0.w / 2 - 0.5, lot0.x)),
    z: Math.max(lcz * CHUNK + lot0.d / 2 + 0.5, Math.min((lcz + 1) * CHUNK - lot0.d / 2 - 0.5, lot0.z)),
  };
  const shopU0 = lot.x - lot.w / 2 - st.x, shopU1 = lot.x + lot.w / 2 - st.x;
  const shopV0 = Math.min(Math.abs(lot.z - lot.d / 2 - frontZ), Math.abs(lot.z + lot.d / 2 - frontZ));
  clearArea(spec, lot, 1);

  // --- Flächen: Asphalt vorn über die ganze Breite, hinten nur neben dem Shop ---
  const padBack = hw ? 40 : 36;
  const padsW: Box[] = [rect(-H + 2, 0, H - 2, shopV0)];
  padsW.push(rect(-H + 2, shopV0, shopU0 - 1, padBack));
  if (hw) padsW.push(rect(shopU1 + 1, shopV0, 26, padBack));
  for (const b of padsW) {
    const c = clip(b, ox, oz);
    if (c) spec.pads.push(c);
  }

  // --- Tankdach mit Zapfsäuleninseln ---
  const canU = hw ? -32 : -11, canV = hw ? 13 : 12.5, canW = hw ? 26 : 20, canD = hw ? 13 : 12;
  at(canU, canV, (x, z) => spec.canopies.push({ x, z, w: canW, d: canD }));
  // heller Betonboden unter dem Dach (aufgeteilt auf die Chunks)
  const slab = clip(rect(canU - canW / 2 - 1, canV - canD / 2 - 1.5, canU + canW / 2 + 1, canV + canD / 2 + 1.5), ox, oz);
  if (slab) spec.slabs.push(slab);
  const islands = hw ? [-9.6, -3.2, 3.2, 9.6] : [-6.4, 0, 6.4];
  for (const du of islands) at(canU + du, canV, (x, z) => spec.pumps.push({ x, z, rot: 0 }));
  // ein Auto steht noch an der Säule
  if (r() < 0.7) {
    const du = pick(r, islands) + (r() < 0.5 ? -1.9 : 1.9);
    at(canU + du, canV + (r() - 0.5) * 1.5, (x, z) => spec.cars.push(newCar(r, x, z, r() < 0.5 ? Math.PI / 2 : -Math.PI / 2)));
  } else r();

  // --- Preismast an der Einfahrt, mit Beet und Blumen am Fuß ---
  const pyU = hw ? -H + 4 : H - 2.5;
  at(pyU, 1.2, (x, z) => spec.pylons.push({ x, z, rot: 0, h: hw ? 9 : 6.5 }));
  at(pyU, 1.2, (x, z) => spec.beds.push({ x, z, w: 3.6, d: 1.8 }));
  for (let k = 0; k < 8; k++) at(pyU + (r() < 0.5 ? -1 : 1) * (1.5 + r() * 0.2), 1.2 + (r() - 0.5) * 1.2, (x, z) => spec.flowers.push({ x, z, color: pick(r, FLOWERS) }));

  // --- Shop, Tür zum Platz ---
  if (inChunk(lot.x, lot.z)) {
    const b = makeBuilding(rng(seed ^ 0x5bd1e995), lot, f < 0 ? 1 : 0, 'mixed', 0.3, { kind: 'shop' });
    b.shopName = hw ? 'SERVICE AREA' : pick(r, ['FUEL & FOOD', 'GAS 24/7', 'QUICK STOP']);
    b.signColor = hw ? 0x1f5a8a : 0xb8322a;
    b.awning = null;
    spec.buildings.push(b);
  }
  // Mülleimer, Bank, Automat und Eistruhe vor dem Shop, Container dahinter
  const doorV = shopV0 - 1.2, mid = (shopU0 + shopU1) / 2;
  const face = f < 0 ? 0 : Math.PI; // Front der Automaten zeigt zum Platz
  at(shopU0 + 1.6, doorV + 0.4, (x, z) => spec.vendors.push({ x, z, rot: face, kind: 'drinks' }));
  at(shopU0 + 3.2, doorV + 0.4, (x, z) => spec.vendors.push({ x, z, rot: face, kind: 'ice' }));
  at(shopU1 + 2.2, shopV0 + 4, (x, z) => spec.models.push({ name: 'detail-dumpster-closed', x, z, rot: Math.PI / 2, solid: true }));
  at(canU + canW / 2 + 3, canV - canD / 2 + 1, (x, z) => spec.vendors.push({ x, z, rot: face, kind: 'air' }));
  at(mid - 3.2, doorV, (x, z) => spec.bins.push({ x, z }));
  at(mid + 3.2, doorV, (x, z) => spec.bins.push({ x, z }));
  at(mid + 5.5, doorV, (x, z) => spec.benches.push({ x, z, rot: f < 0 ? Math.PI : 0 }));

  // --- Stellplätze: Reihen mit Linien, teilweise belegt ---
  const row = (u0: number, u1: number, v: number, fill: number) => {
    for (let u = u0 + 1.4; u <= u1 - 1.4; u += 2.8) {
      const q = P(u, v);
      if (!inChunk(q.x, q.z)) {
        r();
        r();
        continue;
      }
      spec.stalls.push({ x: q.x, z: q.z, alongX: true });
      if (r() < fill) spec.cars.push(newCar(r, q.x, q.z, r() < 0.5 ? Math.PI / 2 : -Math.PI / 2));
      else r();
    }
  };
  if (hw) {
    row(-H + 3, shopU0 - 2, padBack - 3.2, 0.45);
    row(shopU1 + 2, 25, padBack - 3.2, 0.4);
    row(4, H - 3, 16.5, 0.3);
    // bepflanzte Inseln zwischen Lkw- und Pkw-Reihe, mit Durchfahrten
    for (const [u0, u1] of [[6, 20], [26, 40], [46, H - 4]]) {
      const isle = rect(u0, 11, u1, 12.8);
      if (inChunk(isle.x, isle.z)) spec.beds.push(isle);
      for (let u = u0 + 2.5; u < u1 - 1; u += 5) at(u, 11.9, (x, z) => spec.trees.push({ x, z, s: 0.7 + r() * 0.35 }));
    }
    // Lkw-Reihe vorn, parallel zur Straße
    for (const u of [14, 30, 46]) {
      const name = pick(r, ['truck-grey-cargo', 'truck-green-cargo', 'truck-flat']);
      if (r() < 0.75) at(u, 7.5, (x, z) => spec.models.push({ name, x, z, rot: 0, solid: true }));
    }
  } else {
    row(-H + 3, shopU0 - 2, padBack - 3.2, 0.5);
  }

  // --- Laternen über dem Platz ---
  const lampsAt = hw ? [-46, -18, 10, 38] : [-22, 0, 20];
  for (const u of lampsAt) at(u, 0.8, (x, z) => spec.lamps.push({ x, z, dx: 0, dz: -f }));

  // --- Grün: Baumreihe hinten und an den Seiten, Hecken, Picknickplatz ---
  for (let u = -H + 3; u <= H - 3; u += 5 + r() * 3) {
    if (u > shopU0 - 2 && u < shopU1 + 2) {
      r();
      continue;
    }
    at(u, st.d - 1.6, (x, z) => spec.trees.push({ x, z, s: 0.9 + r() * 0.6 }));
  }
  for (const su of [-1, 1]) {
    for (let v = 6; v < st.d - 3; v += 6 + r() * 3) at(su * (H - 0.9), v, (x, z) => spec.trees.push({ x, z, s: 0.8 + r() * 0.5 }));
  }
  for (let k = 0; k < 10; k++) {
    const u = -H + 1 + r() * (st.w - 2), v = padBack + 0.8 + r() * (st.d - padBack - 2);
    if (u > shopU0 - 1 && u < shopU1 + 1) continue;
    at(u, v, (x, z) => spec.bushes.push({ x, z, s: 0.6 + r() * 0.6, color: pick(r, GREEN) }));
  }
  // Picknicktische: Autobahn hinten rechts auf der Wiese, an der Landstraße an der Seite
  const picnicSpots = hw ? [[34, 32], [44, 30], [39, 41], [50, 38]] : [[-H + 3.5, 8], [-H + 3.5, 18]];
  for (const [u, v] of picnicSpots) at(u, v, (x, z) => spec.picnics.push({ x, z, rot: hf(Math.round(x), Math.round(z)) * Math.PI }));
  if (hw) {
    // Hecke zwischen Parkplatz und Picknickwiese
    at(28, (padBack + st.d) / 2, (x, z) => spec.hedges.push({ x, z, w: 1, d: st.d - padBack - 2 }));
  }
}

/** Kurze Zufahrt am Anfang einer Nebenstraße: unterbricht die Randlinie der Landstraße */
export function laneJunction(spec: ChunkSpec, lane: PathSlice, slices: PathSlice[], cx: number, cz: number): void {
  const ox = cx * CHUNK, oz = cz * CHUNK;
  const inChunk = (x: number, z: number) => x >= ox && x < ox + CHUNK && z >= oz && z < oz + CHUNK;
  const p0 = lane.path.pts[0];
  for (const sl of slices) {
    if (sl.path.kind !== 'country' || sliceDist(sl, p0.x, p0.z).d > 1) continue;
    const ps = poseAt(sl.path, sliceDist(sl, p0.x, p0.z).s);
    const p3 = lane.path.pts[Math.min(3, lane.path.pts.length - 1)];
    const nx = -ps.tz, nz = ps.tx;
    const side = (p3.x - p0.x) * nx + (p3.z - p0.z) * nz >= 0 ? 1 : -1;
    const off = sl.path.width / 2 - 0.45;
    const x = ps.x + nx * side * off, z = ps.z + nz * side * off;
    if (inChunk(x, z)) spec.edgeCovers.push({ x, z, w: lane.path.width + 3, d: 0.8, rot: Math.atan2(-ps.tz, ps.tx), y: 0.0235 });
  }
}

/** Ende einer Nebenstraße: Wendeplatz aus Schotter, manchmal ein Haus, ein abgestelltes Auto, Holz oder Heu */
export function laneEnd(spec: ChunkSpec, lane: PathSlice, cx: number, cz: number): void {
  const ox = cx * CHUNK, oz = cz * CHUNK;
  const pts = lane.path.pts;
  const e = pts[pts.length - 1], d = pts[pts.length - 2];
  if (!(e.x >= ox && e.x < ox + CHUNK && e.z >= oz && e.z < oz + CHUNK)) return;
  const r = rng(([...lane.path.id].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 3) >>> 0) ^ 0x2545f491);
  const tx = e.x - d.x, tz = e.z - d.z, l = Math.hypot(tx, tz) || 1;
  const yard: Box = { x: e.x + (tx / l) * 4, z: e.z + (tz / l) * 4, w: 14, d: 14 };
  clearArea(spec, yard, 1);
  spec.yards.push(yard);
  if (r() < 0.6) spec.cars.push(newCar(r, yard.x + (r() - 0.5) * 6, yard.z + (r() - 0.5) * 6, r() * Math.PI));
  if (r() < 0.5) spec.hay.push({ x: yard.x + (r() - 0.5) * 8, z: yard.z + (r() - 0.5) * 8, rot: r() * 3, kind: pick(r, ['single', 'two', 'stack'] as const) });
  if (r() < 0.55) {
    // Haus hinter dem Wendeplatz, Tür zum Platz
    const along = Math.abs(tx) > Math.abs(tz);
    const s = along ? Math.sign(tx) : Math.sign(tz);
    const lot: Box = along ? { x: yard.x + s * 18, z: yard.z, w: 20, d: 20 } : { x: yard.x, z: yard.z + s * 18, w: 20, d: 20 };
    const inside = lot.x - lot.w / 2 >= ox && lot.x + lot.w / 2 <= ox + CHUNK && lot.z - lot.d / 2 >= oz && lot.z + lot.d / 2 <= oz + CHUNK;
    if (inside && !spec.buildings.some((b) => hit(lot, b, 2))) {
      clearArea(spec, lot, 1);
      const door = (along ? (s > 0 ? 3 : 2) : s > 0 ? 1 : 0) as 0 | 1 | 2 | 3;
      spec.buildings.push(makeBuilding(r, { x: lot.x, z: lot.z, w: lot.w, d: lot.d }, door, 'farm', 0.1));
    }
  }
}
