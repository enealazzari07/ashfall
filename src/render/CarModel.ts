import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { streetTextures } from './StreetTextures';

/**
 * Autos aus einer Modelltabelle. Koordinaten: x = Fahrtrichtung (vorn +), y = oben, z = rechts (links = -z).
 * Die Karosserie besteht aus zwei dünnen Seitenhäuten (mit Radausschnitten und Türöffnungen), dunklen Blöcken
 * unter Haube und Kofferraum, Dachplatte, Säulen und Scheiben. Der Innenraum ist sichtbar.
 */
export interface SeatRow { x: number; n: number }

export interface CarModelSpec {
  id: string;
  name: string;
  len: number;
  W: number;
  noseX: number;
  tailX: number;
  frontAxle: number;
  rearAxle: number;
  wheelR: number;
  wheelW: number;
  /** Unterkante der Seitenhaut */
  sill: number;
  belt: number;
  roof: number;
  hoodFront: number;
  deck: number;
  /** Fußpunkt der Frontscheibe, Dachbeginn vorn, Dachende hinten, Fußpunkt der Heckscheibe */
  cowlX: number;
  aTopX: number;
  cTopX: number;
  cBaseX: number;
  rear: 'trunk' | 'hatch' | 'box' | 'bed';
  /** Vordertür (x0 hinten, x1 vorn = Scharnier) */
  doorX0: number;
  doorX1: number;
  /** Fugen der hinteren Türen / B-Säule */
  seams: number[];
  bPillar: boolean;
  rows: SeatRow[];
  bedFloor?: number;
}

export const CAR_MODELS: CarModelSpec[] = [
  {
    id: 'sedan', name: 'Limousine', len: 4.5, W: 1.8, noseX: 2.25, tailX: -2.25, frontAxle: 1.38, rearAxle: -1.38, wheelR: 0.33, wheelW: 0.26,
    sill: 0.3, belt: 0.95, roof: 1.43, hoodFront: 0.8, deck: 0.93, cowlX: 0.85, aTopX: 0.42, cTopX: -1.15, cBaseX: -1.62, rear: 'trunk',
    doorX0: -0.4, doorX1: 0.45, seams: [-0.44, -1.3], bPillar: true, rows: [{ x: -0.2, n: 2 }, { x: -1.05, n: 3 }],
  },
  {
    id: 'compact', name: 'Kompakt', len: 3.9, W: 1.72, noseX: 1.95, tailX: -1.95, frontAxle: 1.15, rearAxle: -1.15, wheelR: 0.31, wheelW: 0.24,
    sill: 0.28, belt: 0.9, roof: 1.42, hoodFront: 0.74, deck: 0.9, cowlX: 0.55, aTopX: 0.12, cTopX: -1.45, cBaseX: -1.9, rear: 'hatch',
    doorX0: -0.55, doorX1: 0.3, seams: [-0.59, -1.25], bPillar: true, rows: [{ x: -0.45, n: 2 }, { x: -1.25, n: 3 }],
  },
  {
    id: 'coupe', name: 'Coupé', len: 4.4, W: 1.84, noseX: 2.2, tailX: -2.2, frontAxle: 1.42, rearAxle: -1.36, wheelR: 0.33, wheelW: 0.28,
    sill: 0.3, belt: 0.9, roof: 1.26, hoodFront: 0.72, deck: 0.9, cowlX: 1.0, aTopX: 0.38, cTopX: -0.85, cBaseX: -1.55, rear: 'trunk',
    doorX0: -0.78, doorX1: 0.6, seams: [], bPillar: false, rows: [{ x: -0.05, n: 2 }, { x: -0.95, n: 2 }],
  },
  {
    id: 'suv', name: 'Geländewagen', len: 4.6, W: 1.95, noseX: 2.3, tailX: -2.3, frontAxle: 1.45, rearAxle: -1.4, wheelR: 0.4, wheelW: 0.3,
    sill: 0.42, belt: 1.14, roof: 1.82, hoodFront: 1.05, deck: 1.14, cowlX: 1.0, aTopX: 0.72, cTopX: -1.95, cBaseX: -2.25, rear: 'box',
    doorX0: -0.45, doorX1: 0.55, seams: [-0.5, -1.35], bPillar: true, rows: [{ x: -0.1, n: 2 }, { x: -1.0, n: 3 }],
  },
  {
    id: 'van', name: 'Kleinbus', len: 5.2, W: 1.95, noseX: 2.45, tailX: -2.75, frontAxle: 1.58, rearAxle: -1.5, wheelR: 0.36, wheelW: 0.26,
    sill: 0.32, belt: 1.0, roof: 1.98, hoodFront: 0.9, deck: 1.0, cowlX: 1.5, aTopX: 1.25, cTopX: -2.5, cBaseX: -2.7, rear: 'box',
    doorX0: 0.35, doorX1: 1.08, seams: [0.3, -0.55, -1.25], bPillar: true, rows: [{ x: 0.45, n: 2 }, { x: -0.4, n: 3 }, { x: -1.3, n: 3 }],
  },
  {
    id: 'pickup', name: 'Pick-up', len: 5.2, W: 1.95, noseX: 2.5, tailX: -2.7, frontAxle: 1.65, rearAxle: -1.55, wheelR: 0.38, wheelW: 0.3,
    sill: 0.4, belt: 1.08, roof: 1.8, hoodFront: 0.98, deck: 1.08, cowlX: 0.95, aTopX: 0.5, cTopX: -0.4, cBaseX: -0.65, rear: 'bed',
    doorX0: -0.4, doorX1: 0.45, seams: [-0.45], bPillar: false, rows: [{ x: -0.05, n: 3 }], bedFloor: 0.66,
  },
  {
    id: 'wagon', name: 'Kombi', len: 4.8, W: 1.82, noseX: 2.25, tailX: -2.55, frontAxle: 1.38, rearAxle: -1.45, wheelR: 0.33, wheelW: 0.26,
    sill: 0.3, belt: 0.95, roof: 1.5, hoodFront: 0.8, deck: 0.95, cowlX: 0.85, aTopX: 0.42, cTopX: -1.95, cBaseX: -2.45, rear: 'box',
    doorX0: -0.4, doorX1: 0.45, seams: [-0.44, -1.32], bPillar: true, rows: [{ x: -0.2, n: 2 }, { x: -1.05, n: 3 }],
  },
];
export const CAR_MODEL_COUNT = CAR_MODELS.length;
export const modelIndex = (id: string): number => Math.max(0, CAR_MODELS.findIndex((q) => q.id === id));

/** Sonderlackierung: Dienstfahrzeuge tragen Streifen, Schilder und Lichtbalken */
export type Livery = 'none' | 'police' | 'taxi' | 'ambulance';

export const modelOf = (i: number | undefined): CarModelSpec => CAR_MODELS[((i ?? 0) % CAR_MODEL_COUNT + CAR_MODEL_COUNT) % CAR_MODEL_COUNT];
const archR = (m: CarModelSpec) => m.wheelR + 0.07;
/** seitlicher Abstand der Radmitten */
export const wheelZ = (m: CarModelSpec) => m.W / 2 - 0.15;
/** Koordinaten der vier Radmitten: [x, z] */
export const wheelSpots = (m: CarModelSpec): [number, number][] => {
  const z = wheelZ(m);
  return [[m.frontAxle, z], [m.frontAxle, -z], [m.rearAxle, z], [m.rearAxle, -z]];
};
/** Türmitte und Scharnier (x) */
export const doorCenterX = (m: CarModelSpec) => (m.doorX0 + m.doorX1) / 2;
export const doorHingeX = (m: CarModelSpec) => m.doorX1 - 0.005;
const doorBottom = (m: CarModelSpec) => m.sill + 0.14;
const doorTop = (m: CarModelSpec) => m.belt - 0.04;
const DOOR_T = 0.05;

// --- Geometrie-Helfer ---------------------------------------------------------------------

function paintGeo(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = ng.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  ng.deleteAttribute('uv');
  return ng;
}

function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.deleteAttribute('uv');
  return ng;
}

function bx(w: number, h: number, d: number, x: number, y: number, z: number, hex?: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  return hex === undefined ? plain(g) : paintGeo(g, hex);
}

/** Box mit abgerundeten Kanten (Dach, Haube, Deckel): fängt Glanzlichter wie echtes Blech */
function rbx(w: number, h: number, d: number, x: number, y: number, z: number, radius: number): THREE.BufferGeometry {
  return plain(new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, h / 2 - 0.001)).translate(x, y, z));
}

/** Balken zwischen zwei Punkten der Seitenansicht (x,y), bei z */
function beam(x0: number, y0: number, x1: number, y1: number, thick: number, depth: number, z: number): THREE.BufferGeometry {
  const len = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0);
  return plain(new THREE.BoxGeometry(len, thick, depth).rotateZ(a).translate((x0 + x1) / 2, (y0 + y1) / 2, z));
}

/** Seitenprofil (x,y) um z zentriert ausgedehnt */
function extrudeXY(pts: [number, number][], depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return plain(g);
}

/** Seitenhaut: Umriss mit Radausschnitten, Türen als Löcher */
function skinGeo(m: CarModelSpec): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  const bedTop = m.belt - 0.1;
  const pts: [number, number][] = [[m.noseX, m.sill], [m.noseX, m.hoodFront], [m.cowlX, m.belt]];
  if (m.rear === 'trunk') pts.push([m.cBaseX, m.belt], [m.tailX, m.deck]);
  else if (m.rear === 'bed') pts.push([m.cBaseX, m.belt], [m.cBaseX - 0.04, bedTop], [m.tailX, bedTop]);
  else pts.push([m.tailX, m.belt]);
  pts.push([m.tailX, m.sill]);
  // Unterkante von hinten nach vorn mit Radbögen
  for (const a of [m.rearAxle, m.frontAxle]) {
    const R = archR(m);
    const phi0 = Math.asin(Math.max(-1, Math.min(1, (m.sill - m.wheelR) / R)));
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const phi = Math.PI - phi0 + (phi0 - (Math.PI - phi0)) * (i / N);
      pts.push([a + R * Math.cos(phi), m.wheelR + R * Math.sin(phi)]);
    }
  }
  pts.forEach(([x, y], i) => (i === 0 ? sh.moveTo(x, y) : sh.lineTo(x, y)));
  sh.closePath();
  const hole = new THREE.Path();
  const x0 = m.doorX0, x1 = m.doorX1, y0 = doorBottom(m), y1 = doorTop(m);
  hole.moveTo(x0, y0);
  hole.lineTo(x0, y1);
  hole.lineTo(x1, y1);
  hole.lineTo(x1, y0);
  hole.closePath();
  sh.holes.push(hole);
  // Kanten leicht gefast: Umriss bleibt gleich (Offset = −Fase), die Fläche wird um die Fase kleiner
  const B = 0.012;
  const g = new THREE.ExtrudeGeometry(sh, {
    depth: DOOR_T - 2 * B, bevelEnabled: true, bevelThickness: B, bevelSize: B, bevelOffset: -B, bevelSegments: 2,
  });
  return plain(g.translate(0, 0, B));
}

export interface CarGeos {
  spec: CarModelSpec;
  /** Karosserie des fahrbaren Autos (ohne Türen und Deckel) */
  paintStatic: THREE.BufferGeometry;
  /** parkende Autos: alles Lackierte inklusive geschlossener Türen und Deckel */
  parkedPaint: THREE.BufferGeometry;
  /** parkende Autos: alles Dunkle, Stoßstangen, Spiegel, Innenraum */
  parkedTrim: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  interior: THREE.BufferGeometry;
  under: THREE.BufferGeometry;
  bumperF: THREE.BufferGeometry;
  bumperR: THREE.BufferGeometry;
  mirrorL: THREE.BufferGeometry;
  mirrorR: THREE.BufferGeometry;
  wheel: THREE.BufferGeometry;
  /** Teile mit Ursprung im Scharnier */
  door: THREE.BufferGeometry;
  doorCard: THREE.BufferGeometry;
  doorHandle: THREE.BufferGeometry;
  hood: THREE.BufferGeometry;
  hoodHinge: THREE.Vector3;
  trunk: THREE.BufferGeometry | null;
  trunkHinge: THREE.Vector3;
}

const geoCache = new Map<string, CarGeos>();
const wheelCache = new Map<string, THREE.BufferGeometry>();

/** Rad: Lauffläche mit runden Schultern, Flanken, Felge mit Horn, vertiefter Schüssel, 5 Speichen, Nabe und Radmuttern; Achse = z, beidseitig gleich */
export function wheelGeo(r: number, w: number): THREE.BufferGeometry {
  const key = `${r}|${w}`;
  const hit = wheelCache.get(key);
  if (hit) return hit;
  const t = Math.min(0.05, w * 0.18); // Reifenschulter
  const rimR = r * 0.64;
  const parts: THREE.BufferGeometry[] = [
    paintGeo(new THREE.CylinderGeometry(r, r, w - 2 * t, 26, 1, true).rotateX(Math.PI / 2), 0x18181a), // Lauffläche
    paintGeo(new THREE.CylinderGeometry(rimR, rimR, w - 0.02, 20, 1, true).rotateX(Math.PI / 2), 0x9a9da3), // Felgenbett
  ];
  const facing = (g: THREE.BufferGeometry, sg: number, z: number) => (sg < 0 ? g.rotateY(Math.PI) : g).translate(0, 0, sg * z);
  for (const sg of [-1, 1]) {
    parts.push(
      paintGeo(new THREE.TorusGeometry(r - t, t, 6, 26).translate(0, 0, sg * (w / 2 - t)), 0x1c1c1e), // Schulter
      paintGeo(facing(new THREE.RingGeometry(rimR, r - t, 26, 1), sg, w / 2), 0x252528), // Flanke
      paintGeo(new THREE.TorusGeometry(rimR - 0.006, 0.013, 5, 24).translate(0, 0, sg * (w / 2 - 0.006)), 0xd4d7dc), // Felgenhorn
      paintGeo(facing(new THREE.CircleGeometry(rimR - 0.01, 24), sg, w / 2 - 0.05), 0x2c2e32), // dunkle Schüssel
      paintGeo(new THREE.CylinderGeometry(0.075, 0.085, 0.04, 14).rotateX(Math.PI / 2).translate(0, 0, sg * (w / 2 - 0.03)), 0xc3c6cb), // Nabe
    );
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const len = rimR - 0.06;
      parts.push(paintGeo(new THREE.BoxGeometry(len, 0.055, 0.03).translate(0.06 + len / 2, 0, 0).rotateZ(a).translate(0, 0, sg * (w / 2 - 0.035)), 0xaeb1b7));
      parts.push(paintGeo(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 6).rotateX(Math.PI / 2).translate(Math.cos(a + 0.63) * 0.05, Math.sin(a + 0.63) * 0.05, sg * (w / 2 - 0.01)), 0x6b6e73));
    }
  }
  const g = mergeGeometries(parts)!;
  wheelCache.set(key, g);
  return g;
}

export function carGeos(model: number): CarGeos {
  const m = modelOf(model);
  const hit = geoCache.get(m.id);
  if (hit) return hit;
  const g = buildGeos(m);
  geoCache.set(m.id, g);
  return g;
}

function buildGeos(m: CarModelSpec): CarGeos {
  const hc = m.W / 2 - 0.12; // halbe Breite der Fahrgastzelle
  const rearBase = m.belt;
  const dark = 0x1c1d20, chrome = 0xc9ccd1, plate = 0xe9e6d8;
  const R = archR(m);

  // --- lackierte Karosserieteile ---
  const skinR = skinGeo(m).translate(0, 0, m.W / 2 - DOOR_T);
  const skinL = skinGeo(m).translate(0, 0, -m.W / 2);
  const roofLen = m.aTopX - m.cTopX + 0.12;
  const roof = rbx(roofLen, 0.07, hc * 2 + 0.06, (m.aTopX + m.cTopX) / 2, m.roof - 0.035, 0, 0.03);
  const pillars: THREE.BufferGeometry[] = [];
  for (const sg of [-1, 1]) {
    const z = sg * (hc - 0.02);
    pillars.push(beam(m.cowlX, m.belt, m.aTopX + 0.01, m.roof - 0.03, 0.07, 0.06, z));
    pillars.push(beam(m.cBaseX, rearBase, m.cTopX - 0.01, m.roof - 0.03, 0.08, 0.06, z));
    if (m.bPillar) pillars.push(bx(0.09, m.roof - 0.05 - m.belt, 0.06, m.doorX0 - 0.05, (m.belt + m.roof - 0.05) / 2, z));
  }
  // Brüstungsleisten schließen die Lücke zwischen Haut und Fahrgastzelle
  const rails: THREE.BufferGeometry[] = [];
  for (const sg of [-1, 1]) {
    rails.push(bx(m.cowlX - m.cBaseX, 0.04, m.W / 2 - hc, (m.cowlX + m.cBaseX) / 2, m.belt - 0.02, sg * (hc + (m.W / 2 - hc) / 2)));
  }
  const tail: THREE.BufferGeometry[] = [];
  if (m.rear === 'box' || m.rear === 'hatch') tail.push(bx(0.05, m.belt - m.sill - 0.18, m.W - 0.11, m.tailX + 0.04, (m.sill + 0.14 + m.belt) / 2, 0));
  if (m.rear === 'bed') {
    tail.push(bx(0.05, m.belt - 0.1 - (m.bedFloor ?? 0.6), m.W - 0.11, m.tailX + 0.04, ((m.bedFloor ?? 0.6) + m.belt - 0.1) / 2, 0));
  }
  const paintStatic = mergeGeometries([skinR, skinL, roof, ...pillars, ...rails, ...tail])!;

  // Türen (Ursprung im Scharnier, Tür ragt nach hinten)
  const hingeX = doorHingeX(m);
  const doorW = m.doorX1 - m.doorX0 - 0.012, doorH = doorTop(m) - doorBottom(m) - 0.012;
  const doorCy = (doorBottom(m) + doorTop(m)) / 2;
  const doorMidX = (m.doorX0 + m.doorX1) / 2;
  const door = plain(new THREE.BoxGeometry(doorW, doorH, DOOR_T - 0.004).translate(doorMidX - hingeX, doorCy, 0));
  const doorCard = paintGeo(new THREE.BoxGeometry(doorW - 0.08, doorH - 0.08, 0.03).translate(doorMidX - hingeX, doorCy, -0.04), 0x5a4a3c);
  const doorHandle = paintGeo(new THREE.BoxGeometry(0.2, 0.03, 0.03).translate(m.doorX0 + 0.22 - hingeX, m.belt - 0.12, 0.035), chrome);

  // Motorhaube (Scharnier an der Frontscheibe)
  const hoodL = m.noseX - m.cowlX - 0.02;
  const hoodA = Math.atan2(m.hoodFront - m.belt, m.noseX - m.cowlX);
  const hoodHinge = new THREE.Vector3(m.cowlX, m.belt - 0.02, 0);
  const hood = rbx(hoodL, 0.045, m.W - 0.1, hoodL / 2, 0, 0, 0.02).rotateZ(hoodA);
  // Kofferraumdeckel (nur Limousine/Coupé), Scharnier vorn
  let trunk: THREE.BufferGeometry | null = null;
  const trunkHinge = new THREE.Vector3(m.cBaseX, m.belt - 0.02, 0);
  if (m.rear === 'trunk') {
    const tl = m.cBaseX - m.tailX - 0.02;
    const ta = Math.atan2(m.belt - m.deck, m.cBaseX - m.tailX);
    trunk = rbx(tl, 0.045, m.W - 0.1, -tl / 2, 0, 0, 0.02).rotateZ(ta);
  }

  const doorsClosed = [-1, 1].map((sg) => door.clone().translate(hingeX, 0, sg * (m.W / 2 - DOOR_T / 2)));
  const parkedPaint = mergeGeometries([
    paintStatic.clone(), ...doorsClosed, hood.clone().translate(hoodHinge.x, hoodHinge.y, 0), ...(trunk ? [trunk.clone().translate(trunkHinge.x, trunkHinge.y, 0)] : []),
  ])!;

  // Scheiben: Prisma in der Silhouette der Fahrgastzelle
  const glassShape: [number, number][] = [
    [m.cowlX + 0.02, m.belt], [m.aTopX + 0.03, m.roof - 0.045], [m.cTopX - 0.03, m.roof - 0.045], [m.cBaseX - 0.01, rearBase],
  ];
  const glass = extrudeXY(glassShape, (hc - 0.04) * 2);

  // --- Dunkles: Blöcke unter Haube/Heck, Boden, Schweller, Radhaus-Verkleidung, Fugen ---
  const darkParts: THREE.BufferGeometry[] = [];
  const blockW = m.W - 0.13;
  darkParts.push(paintGeo(extrudeXY([[m.cowlX, m.sill + 0.1], [m.noseX - 0.03, m.sill + 0.1], [m.noseX - 0.03, m.hoodFront - 0.06], [m.cowlX, m.belt - 0.06]], blockW), 0x26272a));
  if (m.rear === 'trunk') {
    darkParts.push(paintGeo(extrudeXY([[m.cBaseX, m.sill + 0.1], [m.tailX + 0.03, m.sill + 0.1], [m.tailX + 0.03, m.deck - 0.06], [m.cBaseX, m.belt - 0.06]], blockW), 0x26272a));
  } else if (m.rear === 'bed') {
    const bf = m.bedFloor ?? 0.6;
    darkParts.push(bx(m.cBaseX - m.tailX - 0.1, 0.05, m.W - 0.12, (m.cBaseX + m.tailX) / 2, bf, 0, 0x2e2f33));
    darkParts.push(bx(0.05, m.belt - 0.1 - bf, m.W - 0.12, m.cBaseX - 0.02, (bf + m.belt - 0.1) / 2, 0, 0x2e2f33));
    darkParts.push(bx(m.cBaseX - m.tailX - 0.1, 0.12, m.W - 0.1, (m.cBaseX + m.tailX) / 2, m.sill + 0.12, 0, 0x26272a));
  }
  const floorX0 = Math.min(m.cBaseX, m.tailX + 0.1), floorX1 = m.cowlX;
  darkParts.push(bx(floorX1 - floorX0, 0.05, m.W - 0.12, (floorX0 + floorX1) / 2, m.sill + 0.1, 0, 0x2a2a2d));
  // Schweller zwischen den Radbögen
  const rx0 = m.rearAxle + R + 0.02, rx1 = m.frontAxle - R - 0.02;
  darkParts.push(bx(rx1 - rx0, 0.1, m.W + 0.02, (rx0 + rx1) / 2, m.sill + 0.04, 0, dark));
  // Radhaus-Verkleidung innen an den Seiten
  for (const a of [m.frontAxle, m.rearAxle]) {
    for (const sg of [-1, 1]) {
      darkParts.push(paintGeo(new THREE.CylinderGeometry(R - 0.02, R - 0.02, 0.16, 18).rotateX(Math.PI / 2).translate(a, m.wheelR, sg * (m.W / 2 - 0.13)), 0x141416));
    }
  }
  // Türfugen
  for (const x of m.seams) {
    const inArch = [m.frontAxle, m.rearAxle].some((a) => Math.abs(x - a) < R);
    const a = [m.frontAxle, m.rearAxle].find((q) => Math.abs(x - q) < R);
    const low = inArch && a !== undefined ? m.wheelR + Math.sqrt(Math.max(0, R * R - (x - a) ** 2)) + 0.05 : m.sill + 0.14;
    const h = doorTop(m) - low;
    if (h < 0.1) continue;
    for (const sg of [-1, 1]) darkParts.push(bx(0.012, h, 0.012, x, low + h / 2, sg * (m.W / 2 + 0.002), dark));
  }
  // Fensterdichtung entlang der Brüstung: rahmt die Scheiben von oben sichtbar ein
  for (const sg of [-1, 1]) darkParts.push(bx(m.cowlX - m.cBaseX, 0.03, 0.04, (m.cowlX + m.cBaseX) / 2, m.belt + 0.012, sg * (hc - 0.005), 0x111113));
  const under = mergeGeometries(darkParts)!;

  // --- Stoßstangen, Spiegel ---
  const bumperY = m.sill + 0.16;
  const grilleY = Math.min(m.hoodFront - 0.12, bumperY + 0.26);
  const bumperFParts = [
    bx(0.24, 0.22, m.W - 0.04, m.noseX - 0.1, bumperY, 0, dark),
    bx(0.05, 0.14, m.W * 0.42, m.noseX - 0.02, grilleY, 0, dark),
    bx(0.06, 0.03, m.W * 0.42, m.noseX - 0.01, grilleY + 0.07, 0, chrome),
    bx(0.04, 0.12, 0.42, m.noseX + 0.01, bumperY, 0, plate),
    bx(0.08, 0.15, 0.4, m.noseX - 0.06, m.hoodFront - 0.1, m.W / 2 - 0.3, 0xfff1c8),
    bx(0.08, 0.15, 0.4, m.noseX - 0.06, m.hoodFront - 0.1, -(m.W / 2 - 0.3), 0xfff1c8),
    bx(0.06, 0.07, 0.08, m.noseX - 0.05, m.hoodFront - 0.1, m.W / 2 - 0.06, 0xe08a1c), // Blinker
    bx(0.06, 0.07, 0.08, m.noseX - 0.05, m.hoodFront - 0.1, -(m.W / 2 - 0.06), 0xe08a1c),
  ];
  const tailY = m.rear === 'trunk' ? m.deck - 0.1 : m.belt - 0.18;
  const bumperRParts = [
    bx(0.24, 0.22, m.W - 0.04, m.tailX + 0.1, bumperY, 0, dark),
    bx(0.04, 0.12, 0.42, m.tailX - 0.01, bumperY, 0, plate),
    bx(0.06, 0.13, 0.42, m.tailX + 0.05, tailY, m.W / 2 - 0.28, 0x9c1818),
    bx(0.06, 0.13, 0.42, m.tailX + 0.05, tailY, -(m.W / 2 - 0.28), 0x9c1818),
  ];
  const mirrorX = m.cowlX - 0.2, mirrorY = m.belt + 0.06;
  const mirrorL = bx(0.14, 0.1, 0.12, mirrorX, mirrorY, -(m.W / 2 + 0.06), dark);
  const mirrorR = bx(0.14, 0.1, 0.12, mirrorX, mirrorY, m.W / 2 + 0.06, dark);
  const bumperF = mergeGeometries(bumperFParts)!;
  const bumperR = mergeGeometries(bumperRParts)!;

  // --- Innenraum ---
  const seat = 0x6a5846, dashC = 0x3a3b40, lining = 0xcfc8b4;
  const k = Math.min(1, (m.roof - m.sill - 0.15) / 1.0);
  const base = m.sill + 0.25;
  const inter: THREE.BufferGeometry[] = [];
  inter.push(bx(floorX1 - floorX0, 0.02, m.W - 0.2, (floorX0 + floorX1) / 2, m.sill + 0.14, 0, 0x4a4741));
  for (const row of m.rows) {
    if (row.n === 3) {
      inter.push(bx(0.5, 0.12, 1.5, row.x, base, 0, seat));
      inter.push(paintGeo(new THREE.BoxGeometry(0.1, 0.52 * k, 1.5).rotateZ(0.2).translate(row.x - 0.3, base + 0.3 * k, 0), seat));
      for (const z of [-0.45, 0.45]) inter.push(bx(0.08, 0.17, 0.26, row.x - 0.38, base + 0.62 * k, z, seat));
    } else {
      const zs = row.n === 1 ? [0] : [-0.4, 0.4];
      for (const z of zs) {
        inter.push(bx(0.5, 0.12, 0.46, row.x, base, z, seat));
        inter.push(paintGeo(new THREE.BoxGeometry(0.1, 0.52 * k, 0.46).rotateZ(0.22).translate(row.x - 0.3, base + 0.3 * k, z), seat));
        inter.push(bx(0.08, 0.17, 0.26, row.x - 0.38, base + 0.62 * k, z, seat));
      }
    }
  }
  const dashX = m.cowlX - 0.55;
  inter.push(bx(0.4, 0.26, hc * 2 - 0.04, dashX, base + 0.25, 0, dashC));
  inter.push(bx(0.22, 0.08, 0.55, dashX - 0.08, base + 0.45, -0.4, dashC));
  inter.push(bx(0.62, 0.16, 0.22, m.cowlX - 0.97, base - 0.02, 0, dashC));
  inter.push(paintGeo(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6).rotateZ(Math.PI / 2 - 0.5).translate(dashX - 0.05, base + 0.31, -0.4), 0x111113));
  inter.push(paintGeo(new THREE.TorusGeometry(0.17, 0.022, 8, 16).rotateY(Math.PI / 2).rotateZ(0.5).translate(dashX - 0.16, base + 0.33, -0.4), 0x111113));
  inter.push(bx(roofLen - 0.2, 0.02, hc * 2 - 0.06, (m.aTopX + m.cTopX) / 2, m.roof - 0.065, 0, lining));
  const interior = mergeGeometries(inter)!;

  // Griffe, Platten für geparkte Autos
  const handlesParked = [-1, 1].map((sg) => doorHandle.clone().translate(hingeX, 0, sg * (m.W / 2 - DOOR_T / 2)).scale(1, 1, 1)).map((g, i) => (i === 0 ? g.translate(0, 0, -0.07) : g));
  const parkedTrim = mergeGeometries([
    under.clone(), bumperF.clone(), bumperR.clone(), mirrorL.clone(), mirrorR.clone(), interior.clone(), ...handlesParked.map((g) => paintGeo(g, chrome)),
  ])!;

  return {
    spec: m, paintStatic, parkedPaint, parkedTrim, glass, interior, under, bumperF, bumperR, mirrorL, mirrorR,
    wheel: wheelGeo(m.wheelR, m.wheelW), door, doorCard, doorHandle, hood, hoodHinge, trunk, trunkHinge,
  };
}

interface CarMats {
  glass: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  wheel: THREE.MeshStandardMaterial;
  paint: THREE.MeshPhysicalMaterial;
  /** weicher Kontaktschatten unter dem Auto (Fläche 1 x 1, auf Länge x Breite skaliert) */
  shadow: THREE.MeshBasicMaterial;
}
let matCache: CarMats | null = null;
export function carMats(): CarMats {
  if (matCache) return matCache;
  matCache = {
    // wenig Metall, viel Klarlack: die Szene hat nur schwaches Umgebungslicht, stark metallischer Lack wirkte grau und stumpf
    paint: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.34, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x18222e, roughness: 0.04, metalness: 0.4, transparent: true, opacity: 0.45, depthWrite: false }),
    trim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35 }),
    wheel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.3 }),
    shadow: new THREE.MeshBasicMaterial({
      color: 0x000000, map: streetTextures()?.blob ?? null, transparent: true, opacity: 0.6, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -6,
    }),
  };
  return matCache;
}

/** Fläche für den Kontaktschatten (1 x 1 m in XZ) */
export const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

// --- Lackierung, Rost und Dreck als Aufleger (für fahrbare und parkende Autos gleich) ----------------

const decalCache = new Map<string, THREE.BufferGeometry | null>();

/**
 * Flache Aufleger auf der Karosserie: Livery (Polizei/Taxi/Krankenwagen) und Verschleiß.
 * `tier` 0..3: 0 sauber, 1 Dreckband, 2 Rostflecken, 3 viel Rost. Gleiche Parameter ergeben dieselbe Geometrie.
 */
export function decalGeo(model: number, livery: Livery, tier: number): THREE.BufferGeometry | null {
  const key = `${model}|${livery}|${tier}`;
  if (decalCache.has(key)) return decalCache.get(key)!;
  const m = modelOf(model);
  const parts: THREE.BufferGeometry[] = [];
  const R = archR(m);
  const S = m.W / 2 + 0.008;
  const roofX = (m.aTopX + m.cTopX) / 2;
  const both = (fn: (sg: number) => void) => [-1, 1].forEach(fn);
  const bandY = Math.max(m.wheelR + R + 0.06, m.belt - 0.2);
  const lightBar = (a: number, b: number) => {
    parts.push(bx(0.26, 0.03, Math.min(1.1, m.W - 0.5), roofX, m.roof + 0.015, 0, 0x1a1b1e));
    parts.push(bx(0.24, 0.08, 0.4, roofX, m.roof + 0.07, -0.25, a));
    parts.push(bx(0.24, 0.08, 0.4, roofX, m.roof + 0.07, 0.25, b));
  };
  const spanX0 = m.tailX + 0.45, spanX1 = m.noseX - 0.45;

  if (livery === 'police') {
    both((sg) => {
      parts.push(bx(spanX1 - spanX0, 0.2, 0.012, (spanX0 + spanX1) / 2, bandY + 0.02, sg * S, 0xe9e9e6));
      parts.push(bx(spanX1 - spanX0, 0.035, 0.014, (spanX0 + spanX1) / 2, bandY + 0.15, sg * S, 0x2a4cc0));
    });
    parts.push(bx(0.9, 0.012, m.W - 0.5, (m.cowlX + m.noseX) / 2 - 0.1, m.hoodFront + 0.02, 0, 0xe9e9e6)); // weiße Haube
    lightBar(0xd02020, 0x2848d0);
  } else if (livery === 'taxi') {
    const n = Math.floor((spanX1 - spanX0) / 0.2);
    both((sg) => {
      for (let i = 0; i < n; i++) parts.push(bx(0.2, 0.1, 0.012, spanX0 + 0.2 * (i + 0.5), bandY + 0.08, sg * S, (i + (sg > 0 ? 1 : 0)) % 2 ? 0x1a1a1c : 0xecebe4));
    });
    parts.push(bx(0.24, 0.03, 0.62, roofX, m.roof + 0.015, 0, 0x1a1b1e));
    parts.push(bx(0.2, 0.13, 0.54, roofX, m.roof + 0.09, 0, 0xecd675));
  } else if (livery === 'ambulance') {
    both((sg) => {
      parts.push(bx(spanX1 - spanX0, 0.15, 0.012, (spanX0 + spanX1) / 2, bandY + 0.04, sg * S, 0xc02424));
      const cx = m.tailX + (m.noseX - m.tailX) * 0.3, cy = Math.min(m.roof - 0.4, bandY + 0.62);
      parts.push(bx(0.46, 0.14, 0.012, cx, cy, sg * S, 0xc02424), bx(0.14, 0.46, 0.012, cx, cy, sg * S, 0xc02424));
    });
    lightBar(0xd02020, 0xd02020);
  }

  // Verschleiß: Dreckband am Schweller und Rostflecken an unteren Blechen
  if (tier >= 1) {
    const rx0 = m.rearAxle + R + 0.02, rx1 = m.frontAxle - R - 0.02;
    both((sg) => parts.push(bx(rx1 - rx0, 0.12, 0.012, (rx0 + rx1) / 2, m.sill + 0.12, sg * S, 0x453a2c)));
  }
  if (tier >= 2) {
    let s = (model * 7919 + tier * 104729) >>> 0 || 1;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    const n = tier === 2 ? 4 : 9;
    for (let i = 0; i < n; i++) {
      const sg = rnd() < 0.5 ? -1 : 1;
      const x = m.tailX + 0.4 + rnd() * (m.len - 0.8);
      const y = m.sill + 0.16 + rnd() * (m.belt - m.sill - 0.4);
      parts.push(bx(0.14 + rnd() * 0.3, 0.08 + rnd() * 0.16, 0.012, x, y, sg * (S + 0.003), rnd() < 0.5 ? 0x7a4426 : 0x4f2c1a));
    }
    // Dach- und Haubenrost
    parts.push(bx(0.3 + tier * 0.1, 0.01, 0.4, roofX - 0.2, m.roof + 0.004, 0.2, 0x6a3c22));
    parts.push(bx(0.34, 0.01, 0.3, m.cowlX + 0.5, m.hoodFront + 0.01, -0.3, 0x6a3c22));
  }
  const out = parts.length ? mergeGeometries(parts) : null;
  decalCache.set(key, out);
  return out;
}

/** Lackfarbe mit Verschleiß: Rost und Sonne ziehen sie ins Braune */
export function weathered(color: number, tier: number): number {
  const rust = [0x7a4426, 0x6b3a22];
  const t = Math.min(1, tier * 0.12);
  const ch = (c: number, shift: number) => (c >> shift) & 255;
  const mix = (shift: number) => Math.round(ch(color, shift) * (1 - t) * (1 - tier * 0.04) + ch(rust[0], shift) * t);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

// --- Verformung ---------------------------------------------------------------------------

type Zones = { front: number; rear: number; left: number; right: number };

/**
 * Unterteilt Dreiecke für die Verformung, Normalen werden mit interpoliert. Geteilt wird jede Kante, die länger als
 * `maxEdge` ist: Nachbardreiecke teilen eine gemeinsame Kante also gleich, es entstehen keine Risse. Kleine Teile
 * (Fasen, Rundungen) bleiben grob, große Bleche werden fein genug, um sich weich einzudellen.
 */
function tessellate(g: THREE.BufferGeometry, iters: number, maxEdge = 0.14): THREE.BufferGeometry {
  let pos = Array.from(g.attributes.position.array as Float32Array);
  let nor = Array.from(g.attributes.normal.array as Float32Array);
  const P = (src: number[], i: number) => [src[i * 3], src[i * 3 + 1], src[i * 3 + 2]];
  const mid = (a: number[], b: number[], norm: boolean) => {
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    if (!norm) return m;
    const l = Math.hypot(m[0], m[1], m[2]) || 1;
    return [m[0] / l, m[1] / l, m[2] / l];
  };
  const long = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > maxEdge;
  for (let it = 0; it < iters; it++) {
    const np: number[] = [], nn: number[] = [];
    let changed = false;
    for (let t = 0; t < pos.length / 9; t++) {
      // Ecken und Kanten so drehen, dass die geteilten Kanten vorn liegen (Wicklung bleibt erhalten)
      let v = [0, 1, 2].map((k) => ({ p: P(pos, t * 3 + k), n: P(nor, t * 3 + k) }));
      let split = [long(v[0].p, v[1].p), long(v[1].p, v[2].p), long(v[2].p, v[0].p)];
      const cnt = split.filter(Boolean).length;
      const rot = cnt === 1 ? split.indexOf(true) : cnt === 2 ? (split.indexOf(false) + 1) % 3 : 0;
      v = [v[rot], v[(rot + 1) % 3], v[(rot + 2) % 3]];
      split = [split[rot], split[(rot + 1) % 3], split[(rot + 2) % 3]];
      const m = (i: number, j: number) => ({ p: mid(v[i].p, v[j].p, false), n: mid(v[i].n, v[j].n, true) });
      const A = v[0], B = v[1], C = v[2];
      let tris: (typeof A)[][];
      if (cnt === 0) tris = [[A, B, C]];
      else if (cnt === 1) {
        const ab = m(0, 1);
        tris = [[A, ab, C], [ab, B, C]];
      } else if (cnt === 2) {
        // geteilt: AB und BC
        const ab = m(0, 1), bc = m(1, 2);
        tris = [[ab, B, bc], [A, ab, bc], [A, bc, C]];
      } else {
        const ab = m(0, 1), bc = m(1, 2), ca = m(2, 0);
        tris = [[A, ab, ca], [ab, B, bc], [ca, bc, C], [ab, bc, ca]];
      }
      if (cnt) changed = true;
      for (const tri of tris) for (const q of tri) np.push(...q.p), nn.push(...q.n);
    }
    pos = np;
    nor = nn;
    if (!changed) break;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  return out;
}

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};
const hash = (x: number, y: number, z: number) => {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
};

/** Verschiebung eines Punktes (Auto-lokal) durch den Schaden; w = Stärke 0..1 */
function dent(m: CarModelSpec, x: number, y: number, z: number, zn: Zones, out: { dx: number; dy: number; dz: number; w: number }): void {
  const n = hash(Math.round(x * 20), Math.round(y * 20), Math.round(z * 20));
  let dx = 0, dy = 0, dz = 0, w = 0;
  const hi = y > m.sill + 0.35 ? 1 : 0.3;
  if (zn.front > 0) {
    const k = zn.front * smooth((x - m.noseX * 0.1) / (m.noseX * 0.9));
    dx -= k * (0.5 + 0.22 * n);
    dy -= k * 0.14 * (0.4 + n) * hi;
    dz -= Math.sign(z) * k * 0.12 * n;
    w = Math.max(w, k);
  }
  if (zn.rear > 0) {
    const k = zn.rear * smooth((-x - Math.abs(m.tailX) * 0.1) / (Math.abs(m.tailX) * 0.9));
    dx += k * (0.45 + 0.2 * n);
    dy -= k * 0.12 * (0.4 + n) * hi;
    dz -= Math.sign(z) * k * 0.1 * n;
    w = Math.max(w, k);
  }
  if (zn.left > 0) {
    const k = zn.left * smooth((-z - m.W * 0.08) / (m.W * 0.44)) * (0.55 + 0.45 * Math.sin(x * 2.1 + 1));
    dz += k * (0.3 + 0.1 * n);
    dy -= k * 0.06 * n;
    w = Math.max(w, k);
  }
  if (zn.right > 0) {
    const k = zn.right * smooth((z - m.W * 0.08) / (m.W * 0.44)) * (0.55 + 0.45 * Math.sin(x * 2.1 + 4));
    dz -= k * (0.3 + 0.1 * n);
    dy -= k * 0.06 * n;
    w = Math.max(w, k);
  }
  out.dx = dx; out.dy = dy; out.dz = dz; out.w = w;
}

export type PartName = 'hood' | 'trunk' | 'doorL' | 'doorR' | 'bumperF' | 'bumperR' | 'mirrorL' | 'mirrorR';

export interface CarRig {
  group: THREE.Group;
  spec: CarModelSpec;
  /** Vorderräder (Lenkung), drehen um y */
  steerPivots: THREE.Group[];
  /** alle vier Räder, rollen um z */
  wheels: THREE.Mesh[];
  tail: THREE.MeshBasicMaterial;
  head: THREE.MeshBasicMaterial;
  headLights: THREE.SpotLight[];
  setLights(on: boolean): void;
  setBraking(on: boolean): void;
  /** Tür öffnen/schließen (t 0..1); Fahrertür = links */
  setDoor(side: 'L' | 'R', t: number): void;
  /** Kofferraumdeckel oder Motorhaube aufklappen (t 0..1) */
  setLid(which: 'hood' | 'trunk', t: number): void;
  /** Verformung, Verschmutzung und Teilezustand nach Schaden */
  deform(zones: Zones): void;
  /** Teile ablösen, die zu stark beschädigt sind (gibt sie mit intakter Welttransformation zurück) */
  shedParts(zones: Zones, strength: number): THREE.Object3D[];
  /** Punkt des Autos in Weltkoordinaten (z. B. für Funken/Rauch) */
  localToWorld(x: number, y: number, z: number, out?: THREE.Vector3): THREE.Vector3;
}

/** Einzelnes, fahrbares Auto mit Lenkung, Türen, Rollen der Räder, Licht und Schaden. */
export function makeCar(color: number, model = 0, livery: Livery = 'none', tier = 0): CarRig {
  const geos = carGeos(model);
  const m = geos.spec;
  const mt = carMats();
  const g = new THREE.Group();

  // Lack: Karosserie mit Vertexfarben (Ruß/Kratzer), Anbauteile mit gleicher Grundfarbe
  const paintMat = mt.paint.clone();
  paintMat.color.setHex(color);
  paintMat.vertexColors = true;
  const partMat = mt.paint.clone();
  partMat.color.setHex(color);
  const glassMat = mt.glass.clone();

  const bodyGeo = tessellate(geos.paintStatic, 3);
  const bodyBase = Float32Array.from(bodyGeo.attributes.position.array as Float32Array);
  const bodyNorm = Float32Array.from(bodyGeo.attributes.normal.array as Float32Array);
  bodyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(bodyBase.length).fill(1), 3));
  const glassGeo = tessellate(geos.glass, 2);
  const glassBase = Float32Array.from(glassGeo.attributes.position.array as Float32Array);
  const glassNorm = Float32Array.from(glassGeo.attributes.normal.array as Float32Array);

  const body = new THREE.Mesh(bodyGeo, paintMat);
  const glass = new THREE.Mesh(glassGeo, glassMat);
  const under = new THREE.Mesh(geos.under, mt.trim);
  const inside = new THREE.Mesh(geos.interior, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }));
  for (const o of [body, under]) o.castShadow = true;
  glass.renderOrder = 2;
  const shadow = new THREE.Mesh(shadowGeo, mt.shadow);
  shadow.scale.set(m.len + 0.6, 1, m.W + 0.5);
  shadow.position.y = 0.06;
  g.add(shadow, body, inside, under, glass);
  const decals = decalGeo(model, livery, tier);
  if (decals) g.add(new THREE.Mesh(decals, mt.trim));

  const parts: Partial<Record<PartName, THREE.Object3D>> = {};
  const addPart = (name: PartName, o: THREE.Object3D) => {
    parts[name] = o;
    g.add(o);
  };

  // Motorhaube und Kofferraumdeckel
  const hoodPivot = new THREE.Group();
  hoodPivot.position.copy(geos.hoodHinge);
  const hood = new THREE.Mesh(geos.hood, partMat);
  hood.castShadow = true;
  hoodPivot.add(hood);
  addPart('hood', hoodPivot);
  if (geos.trunk) {
    const trunkPivot = new THREE.Group();
    trunkPivot.position.copy(geos.trunkHinge);
    const trunk = new THREE.Mesh(geos.trunk, partMat);
    trunk.castShadow = true;
    trunkPivot.add(trunk);
    addPart('trunk', trunkPivot);
  }

  // Vordertüren: bündig in der Seitenhaut, Scharnier vorn, öffnen nach außen
  const handleMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.4, metalness: 0.8 });
  const cardMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const doorPivots: Record<'L' | 'R', THREE.Group> = { L: new THREE.Group(), R: new THREE.Group() };
  for (const side of ['L', 'R'] as const) {
    const s = side === 'L' ? -1 : 1;
    const pv = doorPivots[side];
    pv.position.set(doorHingeX(m), 0, s * (m.W / 2 - DOOR_T / 2));
    const panel = new THREE.Mesh(geos.door, partMat);
    panel.castShadow = true;
    const card = new THREE.Mesh(geos.doorCard, cardMat);
    card.scale.z = s; // Verkleidung liegt innen (zur Fahrzeugmitte)
    const handle = new THREE.Mesh(geos.doorHandle, handleMat);
    handle.scale.z = s;
    pv.add(panel, card, handle);
    addPart(side === 'L' ? 'doorL' : 'doorR', pv);
  }

  // Stoßstangen (mit Leuchten) und Spiegel
  const trimMat = mt.trim;
  const bumperF = new THREE.Group(), bumperR = new THREE.Group();
  bumperF.add(new THREE.Mesh(geos.bumperF, trimMat));
  bumperR.add(new THREE.Mesh(geos.bumperR, trimMat));
  addPart('bumperF', bumperF);
  addPart('bumperR', bumperR);
  addPart('mirrorL', new THREE.Mesh(geos.mirrorL, trimMat));
  addPart('mirrorR', new THREE.Mesh(geos.mirrorR, trimMat));

  const wheels: THREE.Mesh[] = [];
  const steerPivots: THREE.Group[] = [];
  for (const [wx, wz] of wheelSpots(m)) {
    const w = new THREE.Mesh(geos.wheel, mt.wheel);
    w.castShadow = true;
    const pivot = new THREE.Group();
    pivot.position.set(wx, m.wheelR, wz);
    pivot.add(w);
    g.add(pivot);
    wheels.push(w);
    if (wx > 0) steerPivots.push(pivot);
  }

  // Leuchten (emissiv) sitzen an den Stoßstangen und fallen mit ihnen ab
  const tail = new THREE.MeshBasicMaterial({ color: 0x4a0808 });
  const head = new THREE.MeshBasicMaterial({ color: 0xcfc6a8 });
  const tailY = m.rear === 'trunk' ? m.deck - 0.1 : m.belt - 0.18;
  for (const z of [-(m.W / 2 - 0.28), m.W / 2 - 0.28]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.38), tail);
    t.position.set(m.tailX + 0.02, tailY, z);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.36), head);
    h.position.set(m.noseX - 0.01, m.hoodFront - 0.1, z * 1.03);
    bumperR.add(t);
    bumperF.add(h);
  }
  const headLights: THREE.SpotLight[] = [];
  for (const z of [-0.6, 0.6]) {
    const s = new THREE.SpotLight(0xfff1d0, 60, 28, 0.55, 0.6, 1.4);
    s.visible = false; // Lichter nur bei Bedarf in die Beleuchtung aufnehmen
    s.position.set(m.noseX - 0.1, m.hoodFront - 0.05, z);
    s.target.position.set(m.noseX + 8, 0.2, z * 1.4);
    g.add(s, s.target);
    headLights.push(s);
  }

  let lit = false, braking = false;
  const lid = { hood: 0, trunk: 0 };
  const dmg = { hood: 0, trunk: 0 };
  const tailColor = () => tail.color.setHex(braking ? 0xff2020 : lit ? 0x8a1010 : 0x4a0808);
  const shed = new Set<PartName>();
  const disp = { dx: 0, dy: 0, dz: 0, w: 0 };
  const tmp = new THREE.Vector3();
  const vtx = new THREE.Vector3();

  const deformGeo = (geo: THREE.BufferGeometry, base: Float32Array, baseN: Float32Array, zn: Zones, colors: boolean) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = colors ? (geo.attributes.color as THREE.BufferAttribute) : null;
    const wv = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
      dent(m, x, y, z, zn, disp);
      pos.setXYZ(i, x + disp.dx, y + disp.dy, z + disp.dz);
      wv[i] = disp.w;
      if (col) {
        const n = hash(Math.round(x * 13), Math.round(y * 13), Math.round(z * 13));
        const c = 1 - Math.min(0.78, disp.w * (0.45 + 0.5 * n));
        col.setXYZ(i, c, c * 0.93, c * 0.88);
      }
    }
    pos.needsUpdate = true;
    if (col) col.needsUpdate = true;
    // zerknitterte Flächen: Flachschattierung, intakte Bereiche behalten die glatten Normalen
    geo.computeVertexNormals();
    const nor = geo.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < nor.count; i++) {
      const k = Math.min(1, wv[i] * 4);
      vtx.set(nor.getX(i), nor.getY(i), nor.getZ(i)).multiplyScalar(k);
      tmp.set(baseN[i * 3], baseN[i * 3 + 1], baseN[i * 3 + 2]).multiplyScalar(1 - k).add(vtx).normalize();
      nor.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    nor.needsUpdate = true;
    geo.computeBoundingSphere();
  };

  const rig: CarRig = {
    group: g,
    spec: m,
    steerPivots,
    wheels,
    tail,
    head,
    headLights,
    setLights(on) {
      lit = on;
      head.color.setHex(on ? 0xfff6d8 : 0xcfc6a8);
      for (const s of headLights) s.visible = on;
      tailColor();
    },
    setBraking(on) {
      braking = on;
      tailColor();
    },
    setDoor(side, t) {
      if (shed.has(side === 'L' ? 'doorL' : 'doorR')) return;
      doorPivots[side].rotation.y = (side === 'L' ? -1 : 1) * 1.15 * t;
    },
    setLid(which, t) {
      lid[which] = t;
      const p = parts[which];
      if (!p || shed.has(which)) return;
      p.rotation.z = which === 'hood' ? dmg.hood + t * 0.95 : dmg.trunk - t * 1.1;
    },
    deform(zn) {
      deformGeo(bodyGeo, bodyBase, bodyNorm, zn, true);
      deformGeo(glassGeo, glassBase, glassNorm, zn, false);
      const worst = Math.max(zn.front, zn.rear, zn.left, zn.right);
      glassMat.color.setHex(0x1b2633).lerp(new THREE.Color(0xa4aab0), Math.min(1, worst * 1.2));
      glassMat.roughness = 0.05 + 0.5 * worst;
      glassMat.opacity = 0.3 + 0.55 * Math.min(1, worst * 1.3);
      // Stoßstangen hängen, Motorhaube springt auf
      const bf = parts.bumperF;
      if (bf && !shed.has('bumperF')) {
        bf.position.x = -0.22 * zn.front;
        bf.rotation.z = -0.1 * zn.front;
      }
      const br = parts.bumperR;
      if (br && !shed.has('bumperR')) {
        br.position.x = 0.22 * zn.rear;
        br.rotation.z = 0.1 * zn.rear;
      }
      const hd = parts.hood;
      if (hd && !shed.has('hood')) {
        dmg.hood = Math.max(0, zn.front - 0.35) * 0.55;
        hd.rotation.z = dmg.hood + lid.hood * 0.95;
        hd.position.x = geos.hoodHinge.x - 0.25 * zn.front;
      }
      const tk = parts.trunk;
      if (tk && !shed.has('trunk')) {
        dmg.trunk = -Math.max(0, zn.rear - 0.35) * 0.45;
        tk.rotation.z = dmg.trunk - lid.trunk * 1.1;
      }
    },
    shedParts(zn, strength) {
      const out: THREE.Object3D[] = [];
      const drop = (name: PartName, when: boolean) => {
        const p = parts[name];
        if (!when || shed.has(name) || !p) return;
        shed.add(name);
        out.push(p);
        g.updateWorldMatrix(true, true);
      };
      drop('bumperF', zn.front > 0.45 || (zn.front > 0.2 && strength > 14));
      drop('bumperR', zn.rear > 0.45 || (zn.rear > 0.2 && strength > 14));
      drop('hood', zn.front > 0.8 || (zn.front > 0.55 && strength > 20));
      drop('trunk', zn.rear > 0.8 || (zn.rear > 0.55 && strength > 20));
      drop('mirrorL', zn.left > 0.35 || zn.front > 0.6);
      drop('mirrorR', zn.right > 0.35 || zn.front > 0.6);
      drop('doorL', zn.left > 0.85 || (zn.left > 0.55 && strength > 18));
      drop('doorR', zn.right > 0.85 || (zn.right > 0.55 && strength > 18));
      return out;
    },
    localToWorld(x, y, z, out = new THREE.Vector3()) {
      g.updateWorldMatrix(true, false);
      return out.set(x, y, z).applyMatrix4(g.matrixWorld);
    },
  };
  return rig;
}
