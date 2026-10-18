/**
 * Makro-Layout der Welt: Super-Zellen (18 × 16 Chunks) mit je einer Stadt (höchstens 6 × 5 Chunks),
 * drumherum Natur. Dazu geführte Straßen (Autobahn, Auffahrten, Landstraßen, Hauptstraße) und die Bahnstrecke
 * als Pfade (Polylinien). Alles ist deterministisch und frei von Abhängigkeiten zu den Chunk-Generatoren.
 */
export const CH = 64; // = CHUNK
export const RD = 8; // = ROAD
export const CELL_W = 18;
export const CELL_H = 16;
export const HIGHWAY_W = 22;
export const RAIL_W = 10;
export const COUNTRY_W = 7;
export const RAMP_W = 9;
export const BOULEVARD_W = 10;

export interface Pt { x: number; z: number }
export type PathKind = 'highway' | 'rail' | 'country' | 'ramp' | 'service' | 'boulevard';
export interface RoadPath {
  id: string;
  kind: PathKind;
  width: number;
  pts: Pt[];
  /** kumulierte Bogenlänge je Punkt */
  cum: number[];
  len: number;
  /** Einbahnstraße (Rampe, Servicespur): Fahrtrichtung = Pfadrichtung */
  oneway?: boolean;
  /** Breite läuft am Anfang bzw. Ende auf null zusammen (Aus-/Einfädelspur an der Autobahn) */
  taper?: { a: number; b: number };
  /** Abschnitte der Autobahn, an denen keine Leitplanke steht (Abzweige), je Seite */
  gaps?: { side: 1 | -1; s0: number; s1: number }[];
}
export interface PathSlice { path: RoadPath; i0: number; i1: number }
export interface Rect4 { x0: number; x1: number; z0: number; z1: number }

export const hf = (a: number, b: number, c = 0): number => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// --- Pfade -------------------------------------------------------------------------------

export function makePath(id: string, kind: PathKind, width: number, pts: Pt[]): RoadPath {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { id, kind, width, pts, cum, len: cum[cum.length - 1] };
}

export function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push({ x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, z: a * p0.z + b * p1.z + c * p2.z + d * p3.z });
  }
  return out;
}

/** Pose (Position + Fahrtrichtung) bei Bogenlänge s */
export function poseAt(path: RoadPath, s: number): { x: number; z: number; tx: number; tz: number } {
  const { pts, cum } = path;
  const ss = Math.max(0, Math.min(path.len, s));
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= ss) lo = mid;
    else hi = mid;
  }
  const a = pts[lo], b = pts[hi];
  const seg = cum[hi] - cum[lo] || 1;
  const t = (ss - cum[lo]) / seg;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: (b.x - a.x) / seg, tz: (b.z - a.z) / seg };
}

/** Auf den Rechteckbereich zugeschnittener Teil eines Pfades (zusammenhängender Index-Bereich) */
export function sliceFor(path: RoadPath, box: Rect4, pad: number): PathSlice | null {
  const x0 = box.x0 - pad, x1 = box.x1 + pad, z0 = box.z0 - pad, z1 = box.z1 + pad;
  const inside = (p: Pt) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1;
  let i0 = -1, i1 = -1;
  const { pts } = path;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    // Segment-Box-Test über die Segment-Bounding-Box (reicht bei kurzen Segmenten)
    if (Math.max(a.x, b.x) < x0 || Math.min(a.x, b.x) > x1 || Math.max(a.z, b.z) < z0 || Math.min(a.z, b.z) > z1) {
      if (!inside(a) && !inside(b)) continue;
    }
    if (i0 < 0) i0 = i;
    i1 = i + 1;
  }
  return i0 < 0 ? null : { path, i0, i1 };
}

/** Abstand eines Punktes zur Mittellinie des Ausschnitts und Bogenlänge dort */
export function sliceDist(sl: PathSlice, x: number, z: number): { d: number; s: number } {
  const { pts, cum } = sl.path;
  let best = Infinity, bs = 0;
  for (let i = sl.i0; i < sl.i1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
    if (d < best) {
      best = d;
      bs = cum[i] + t * (cum[i + 1] - cum[i]);
    }
  }
  return { d: best, s: bs };
}

/** Freiraum zur Fahrbahnkante (negativ = auf der Straße); Gleise und Autobahn haben mehr Rand */
export function clearance(slices: PathSlice[], x: number, z: number): number {
  let m = Infinity;
  for (const sl of slices) {
    const edge = sl.path.width / 2 + (sl.path.kind === 'boulevard' ? 2 : 0);
    const d = sliceDist(sl, x, z).d - edge;
    if (d < m) m = d;
  }
  return m;
}

// --- Städte ------------------------------------------------------------------------------

export interface City {
  rx: number; rz: number;
  cx0: number; cz0: number; w: number; h: number;
  notch: string[];
}

export function cellOf(cx: number, cz: number): { rx: number; rz: number } {
  return { rx: Math.floor((cx + CELL_W / 2) / CELL_W), rz: Math.floor((cz + CELL_H / 2) / CELL_H) };
}

const cityCache = new Map<string, City>();
export function cityOf(rx: number, rz: number): City {
  const key = `${rx},${rz}`;
  const hit = cityCache.get(key);
  if (hit) return hit;
  let c: City;
  if (rx === 0 && rz === 0) {
    // Die Startstadt ist kompakt: 5 × 4 Chunks mit einer abgeschnittenen Ecke
    c = { rx, rz, cx0: -3, cz0: -2, w: 5, h: 4, notch: ['1,-2'] };
  } else {
    const w = 4 + Math.floor(hf(rx, rz, 1) * 2);
    const h = 3 + Math.floor(hf(rx, rz, 2) * 2);
    const cx0 = rx * CELL_W - Math.floor(w / 2), cz0 = rz * CELL_H - Math.floor(h / 2);
    const corners = [[cx0, cz0], [cx0 + w - 1, cz0], [cx0, cz0 + h - 1], [cx0 + w - 1, cz0 + h - 1]];
    const notch: string[] = [];
    corners.forEach(([x, z], i) => {
      if (notch.length < 1 && hf(rx, rz, 20 + i) < 0.4) notch.push(`${x},${z}`);
    });
    c = { rx, rz, cx0, cz0, w, h, notch };
  }
  cityCache.set(key, c);
  return c;
}

export function isCityChunk(cx: number, cz: number): boolean {
  const { rx, rz } = cellOf(cx, cz);
  const c = cityOf(rx, rz);
  return cx >= c.cx0 && cx < c.cx0 + c.w && cz >= c.cz0 && cz < c.cz0 + c.h && !c.notch.includes(`${cx},${cz}`);
}

/**
 * Hat der Chunk (cx,cz) eine Straße an seiner West- ('W') bzw. Nordkante ('N')?
 * An der Stadtgrenze immer (Ringstraße, folgt auch Einkerbungen); in der Stadt meist; in der Natur nie.
 */
export function edgeRoad(side: 'W' | 'N', cx: number, cz: number): boolean {
  const a = isCityChunk(cx, cz);
  const b = side === 'W' ? isCityChunk(cx - 1, cz) : isCityChunk(cx, cz - 1);
  if (a !== b) return true;
  if (!a) return false;
  if (Math.abs(cx) <= 1 && Math.abs(cz) <= 1) return true;
  return hf(cx, cz, side === 'W' ? 11 : 12) < 0.86;
}

/** Statt der Straße gibt es nur eine schmale Gasse, die in einem Hinterhof endet (nur in der Stadt, nie am Rand) */
export function edgeAlley(side: 'W' | 'N', cx: number, cz: number): boolean {
  if (!isCityChunk(cx, cz) || edgeRoad(side, cx, cz)) return false;
  const nb = side === 'W' ? isCityChunk(cx - 1, cz) : isCityChunk(cx, cz - 1);
  return nb && hf(cx, cz, side === 'W' ? 13 : 14) < 0.7;
}

// --- Autobahn und Bahn (kurvig, nur von x abhängig) ----------------------------------------

const TAU = Math.PI * 2;
export function highwayZ(x: number, rz: number): number {
  const p1 = hf(rz, 3) * TAU, p2 = hf(rz, 4) * TAU;
  return rz * CELL_H * CH + 5.5 * CH + 42 * Math.sin((TAU * x) / 760 + p1) + 15 * Math.sin((TAU * x) / 400 + p2);
}
export function railZ(x: number, rz: number): number {
  const p1 = hf(rz, 5) * TAU, p2 = hf(rz, 6) * TAU;
  return rz * CELL_H * CH - 5.5 * CH + 30 * Math.sin((TAU * x) / 900 + p1) + 12 * Math.sin((TAU * x) / 380 + p2);
}

const cellCache = new Map<string, RoadPath[]>();

/** Z der Landstraßen-Übergabe an der Zellgrenze (gemeinsam für beide Nachbarzellen) */
function gateZ(boundary: number, rz: number): number {
  return rz * CELL_H * CH + (hf(boundary, rz, 7) - 0.5) * 180;
}

/** Zeile (Chunk-Z) der Haupt-Querstraße einer Stadt */
export function mainRow(c: City): number {
  return c.cz0 + Math.floor(c.h / 2);
}

function rowEdges(c: City, row: number): { west: number; east: number } | null {
  let west = Infinity, east = -Infinity;
  for (let x = c.cx0; x < c.cx0 + c.w; x++) {
    if (isCityChunk(x, row)) {
      west = Math.min(west, x);
      east = Math.max(east, x);
    }
  }
  return west === Infinity ? null : { west, east };
}

const smoothstep = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/**
 * Landstraße mit sanften Kurven: gerade Linie von A nach B plus zwei weiche Seitenschwünge, die an beiden Enden
 * auf null auslaufen (waagerechter Übergang zur Nachbarzelle). Der Kurvenradius bleibt über 50 m.
 */
function windy(from: Pt, to: Pt, seed: number): Pt[] {
  const L = Math.abs(to.x - from.x);
  const n = Math.max(8, Math.ceil(L / 9));
  const a1 = (hf(seed, 1, 1) < 0.5 ? -1 : 1) * (22 + hf(seed, 2, 2) * 16);
  const a2 = (hf(seed, 3, 3) < 0.5 ? -1 : 1) * (3 + hf(seed, 4, 4) * 4);
  const ph = hf(seed, 5, 5) * TAU;
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const env = Math.sin(Math.PI * t) ** 2;
    out.push({
      x: from.x + (to.x - from.x) * t,
      z: from.z + (to.z - from.z) * smoothstep(t) + env * (a1 * Math.sin(TAU * t) + a2 * Math.sin(2 * TAU * t + ph)),
    });
  }
  return out;
}

export function cellPaths(rx: number, rz: number): RoadPath[] {
  const key = `${rx},${rz}`;
  const hit = cellCache.get(key);
  if (hit) return hit;
  const out: RoadPath[] = [];
  const xs = (rx * CELL_W - CELL_W / 2) * CH, xe = xs + CELL_W * CH;
  const city = cityOf(rx, rz);

  const hw: Pt[] = [], rl: Pt[] = [];
  for (let x = xs; x <= xe + 0.01; x += 10) {
    hw.push({ x, z: highwayZ(x, rz) });
    rl.push({ x, z: railZ(x, rz) });
  }
  const hwPath = makePath(`hw${rx},${rz}`, 'highway', HIGHWAY_W, hw);
  hwPath.gaps = [];
  out.push(hwPath);
  out.push(makePath(`rl${rx},${rz}`, 'rail', RAIL_W, rl));

  /** Punkt auf der Autobahn bei x, seitlich um off versetzt (+ = Südseite = Ostrichtung), samt Fahrtrichtung nach Osten */
  const hwAt = (x: number, off: number) => {
    const z = highwayZ(x, rz);
    const dz = (highwayZ(x + 1, rz) - highwayZ(x - 1, rz)) / 2;
    const l = Math.hypot(1, dz);
    const tx = 1 / l, tz = dz / l;
    return { x: x - tz * off, z: z + tx * off, tx, tz };
  };
  const sAt = (x: number) => hwPath.cum[Math.max(0, Math.min(hwPath.pts.length - 1, Math.round((x - xs) / 10)))];
  const LANE = 6.75; // äußere Fahrspur

  // Anschlussstelle zur Stadt (nur die Nordfahrbahn, Richtung Westen): Ausfahrt im Osten, Auffahrt im Westen.
  // Beides sind Einbahnstraßen, die tangential abzweigen bzw. einfädeln; an den Übergängen steht keine Leitplanke.
  const ringS = (city.cz0 + city.h) * CH + RD; // Südkante der Ringstraße
  {
    const x3 = (city.cx0 + city.w - 1.5) * CH;
    const xo = x3 + 230;
    const p0 = hwAt(xo, -LANE);
    const pts = bezier(p0, { x: p0.x - p0.tx * 120, z: p0.z - p0.tz * 120 }, { x: x3, z: ringS + 140 }, { x: x3, z: ringS }, 44);
    const p = makePath(`roff${rx},${rz}`, 'ramp', RAMP_W, pts);
    p.oneway = true;
    p.taper = { a: 55, b: 0 };
    out.push(p);
    hwPath.gaps!.push({ side: -1, s0: sAt(xo) - 80, s1: sAt(xo) + 14 });
  }
  {
    const x3 = (city.cx0 + 1.5) * CH;
    const xi = x3 - 230;
    const p3 = hwAt(xi, -LANE);
    const pts = bezier({ x: x3, z: ringS }, { x: x3, z: ringS + 140 }, { x: p3.x + p3.tx * 120, z: p3.z + p3.tz * 120 }, p3, 44);
    const p = makePath(`ron${rx},${rz}`, 'ramp', RAMP_W, pts);
    p.oneway = true;
    p.taper = { a: 0, b: 55 };
    out.push(p);
    hwPath.gaps!.push({ side: -1, s0: sAt(xi) - 14, s1: sAt(xi) + 80 });
  }

  // Rastplatz auf der Südfahrbahn (Richtung Osten): Servicespur schwenkt aus, läuft parallel und fädelt wieder ein
  {
    const xr = (city.cx0 + city.w / 2) * CH;
    const sA = sAt(xr - 230), sB = sAt(xr + 230);
    const L = sB - sA, ramp = 165;
    const pts: Pt[] = [];
    for (let s = sA; s <= sB + 0.01; s += 8) {
      const u = s - sA;
      const off = LANE + 24 * smoothstep(u / ramp) * smoothstep((L - u) / ramp);
      const q = poseAt(hwPath, s);
      pts.push({ x: q.x - q.tz * off, z: q.z + q.tx * off });
    }
    const p = makePath(`rest${rx},${rz}`, 'service', RAMP_W, pts);
    p.oneway = true;
    p.taper = { a: 70, b: 70 };
    out.push(p);
    hwPath.gaps!.push({ side: 1, s0: sA - 10, s1: sA + 85 }, { side: 1, s0: sB - 85, s1: sB + 10 });
  }

  // Landstraßen: von der Stadt (Außenkante der Ringstraße) zu den Übergabepunkten an den Zellgrenzen im Osten und Westen
  const row = mainRow(city);
  const edges = rowEdges(city, row);
  if (edges) {
    const zc = (row + 0.5) * CH;
    const east = { x: (edges.east + 1) * CH + RD, z: zc };
    const west = { x: edges.west * CH, z: zc };
    const gE = { x: xe, z: gateZ(rx + 1, rz) }, gW = { x: xs, z: gateZ(rx, rz) };
    out.push(makePath(`ce${rx},${rz}`, 'country', COUNTRY_W, windy(east, gE, rx * 131 + rz * 17 + 1)));
    out.push(makePath(`cw${rx},${rz}`, 'country', COUNTRY_W, windy(west, gW, rx * 131 + rz * 17 + 2)));
  }
  cellCache.set(key, out);
  return out;
}

/** Alle Pfade, die den Chunk (samt Rand) berühren können, als zugeschnittene Ausschnitte */
export function slicesFor(cx: number, cz: number, pad = 12): PathSlice[] {
  const box: Rect4 = { x0: cx * CH, x1: (cx + 1) * CH, z0: cz * CH, z1: (cz + 1) * CH };
  const cells = new Map<string, [number, number]>();
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
    const c = cellOf(cx + dx * 2, cz + dz * 2);
    cells.set(`${c.rx},${c.rz}`, [c.rx, c.rz]);
  }
  const out: PathSlice[] = [];
  for (const [rx, rz] of cells.values()) {
    for (const p of cellPaths(rx, rz)) {
      const s = sliceFor(p, box, pad + p.width / 2);
      if (s) out.push(s);
    }
  }
  return out;
}

// --- Ortschaften: kleine Dörfer an den Landstraßen zwischen den Städten ----------------------------

const villageCache = new Map<string, { cx: number; cz: number }[]>();
function villagesOfCell(rx: number, rz: number): { cx: number; cz: number }[] {
  const key = `${rx},${rz}`;
  const hit = villageCache.get(key);
  if (hit) return hit;
  const out: { cx: number; cz: number }[] = [];
  for (const p of cellPaths(rx, rz)) {
    if (p.kind !== 'country') continue;
    const q = poseAt(p, p.len * (0.45 + hf(rx, rz, p.id.length + 60) * 0.15));
    out.push({ cx: Math.floor(q.x / CH), cz: Math.floor(q.z / CH) });
  }
  villageCache.set(key, out);
  return out;
}

/** Dorf: 3 × 3 Chunks um einen Punkt der Landstraße */
export function isVillageChunk(cx: number, cz: number): boolean {
  const { rx, rz } = cellOf(cx, cz);
  return villagesOfCell(rx, rz).some((v) => Math.abs(cx - v.cx) <= 1 && Math.abs(cz - v.cz) <= 1);
}
