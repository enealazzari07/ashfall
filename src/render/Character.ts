import { PZ_TOOL_BUILD } from '../pz/pzHandModels';
import { firearmOf } from '../pz/pzWeapons';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildHumanBody } from './HumanBody';
import { KitBody, SHIRT_VARIANTS, kitReady } from './KitBody';
import { createBackpack } from './Backpack';
import { animateZombieModel, createZombieModel } from './ZombieModel';
import { GarmentHost, garmentsReady, setKitSurface, showGarments } from './Garments';

export interface CharacterLook {
  jacket: number;
  pants?: number;
  pack?: number;
  hair?: number;
  /** Frisur-Variante 0..5 (Strähnenverlauf) */
  hairSeed?: number;
  /** Augenfarbe */
  eye?: number;
  skin?: number;
  /** kleine Fahne über dem Kopf, damit man die Fraktion erkennt */
  banner?: number;
  /** ohne GLB-Körper bauen (prozedurale Figur, z. B. Zombie-Ersatz) */
  plain?: boolean;
  /** neuer Charakter aus dem Baukasten (Spieler, Vorschau) */
  kit?: boolean;
}

/** Sichtbare Ausrüstung am Körper */
export interface Outfit {
  head?: string | null;
  body?: string | null;
  legs?: string | null;
  feet?: string | null;
  back?: string | null;
  hand?: string | null;
  /** Farben dieses Spielers für T-Shirt/Pulli (`top`) und Hose (`legs`), damit man Mitspieler unterscheidet */
  tint?: { top: number; legs: number; /** Pullover und Pulli: eine andere Farbe als das T-Shirt, damit man beim Ausziehen den Unterschied sieht */ outer?: number };
}

const TINT_TOPS = [0x8c3b34, 0x2f5d8a, 0x3f6f4a, 0xc9a23a, 0x6a4a82, 0x2f2f33, 0xd8d4c8, 0xc46a2f, 0x3a7a80];
const TINT_LEGS = [0xffffff, 0xd8c39a, 0x8a8a8a, 0x7a8a6a, 0xb8b8b8, 0xcaa070];
/** Kleiderfarben eines Spielers aus einer Zahl (z. B. der Spieler-Id): gleiche Zahl, gleiche Farben */
export function paletteFor(seed: number): { top: number; legs: number; outer: number } {
  const h = Math.imul(seed + 1, 2654435761) >>> 0;
  const ti = h % TINT_TOPS.length;
  // Pullover/Pulli: immer eine andere Farbe als das T-Shirt darunter
  const oi = (ti + 3 + ((h >>> 16) % (TINT_TOPS.length - 4))) % TINT_TOPS.length;
  return { top: TINT_TOPS[ti], legs: TINT_LEGS[(h >>> 8) % TINT_LEGS.length], outer: TINT_TOPS[oi === ti ? (oi + 1) % TINT_TOPS.length : oi] };
}

/** Schwingendes Kleidungsstück: Rocksegment (`ang` = Richtung um die Hüfte), Jackenschoß, Kordel, Haarsträhne */
interface Cloth {
  g: THREE.Group;
  kind: 'skirt' | 'cord' | 'hair';
  ang: number;
  base: number;
  /** Ausschlag durch die Beine (Rock weit, Jackenschoß eng) */
  k: number;
}

interface Rig {
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  jacket: THREE.MeshStandardMaterial;
  pants: THREE.MeshStandardMaterial;
  shoes: THREE.MeshStandardMaterial;
  basePants: number;
  baseJacket: number;
  slots: Record<'head' | 'back' | 'hand' | 'body', THREE.Group>;
  skinMat: THREE.MeshStandardMaterial;
  /** Unterarme und Manschetten: bei kurzen Ärmeln zeigen sie Haut */
  fore: THREE.Mesh[];
  cuffs: THREE.Mesh[];
  /** Oberarme samt Schultergelenk, Ellbogengelenke: ärmellos zeigen sie Haut */
  upper: THREE.Mesh[];
  elbowJ: THREE.Mesh[];
  skinHex: number;
  pantsMap: THREE.Texture | null;
  /** Wurzel für Stoffteile an der Hüfte (Rock, Jackenschoß) und schwingende Teile */
  clothRoot: THREE.Group;
  cloth: Cloth[];
  sway: number;
  swayV: number;
  prevY: number;
  /** Kleidung aus dem GLB (null ohne GLB-Körper) */
  garments: GarmentHost | null;
  hair: THREE.Object3D | null;
  kit: KitBody | null;
  /** Zufallswert je Figur: unregelmäßiger Gang */
  seed: number;
  /** Zombie-Gangart 0..3 (Schlurfen, Hinken, Greifen, hängender Arm) */
  zstyle: number;
  phase: number;
  amp: number;
  breathe: number;
  /** Was in der Hand liegt: Schusswaffe (einhändig/zweihändig) oder Werkzeug; bestimmt die Haltung */
  handKind?: 'gun' | 'gun2' | 'tool' | null;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, roughness = 0.85, metalness = 0): THREE.MeshStandardMaterial {
  const k = `${color}|${roughness}|${metalness}`;
  let m = matCache.get(k);
  if (!m) matCache.set(k, (m = new THREE.MeshStandardMaterial({ color, roughness, metalness })));
  return m;
}

const G = {
  capsule: (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 4, 10),
  box: (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d),
};
// Geometrien einmal anlegen und für alle Figuren teilen
const lathe = (pts: [number, number][], seg = 18) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
/** Gliedmaße mit runden Enden: die Kappen entsprechen dem Endradius, so verschmelzen Ober-/Unterarm und Ober-/Unterschenkel ohne Gelenkkugel */
function limbLathe(body: [number, number][], seg = 16): THREE.LatheGeometry {
  const pts: [number, number][] = [];
  const [r0, y0] = body[0], [r1, y1] = body[body.length - 1];
  const steps = 5;
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * (Math.PI / 2);
    pts.push([Math.max(0.001, r0 * Math.sin(t)), y0 - r0 * Math.cos(t)]);
  }
  pts.push(...body.slice(1, -1));
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * (Math.PI / 2);
    pts.push([Math.max(0.001, r1 * Math.cos(t)), y1 + r1 * Math.sin(t)]);
  }
  return lathe(pts, seg);
}
/** Hand hängt nach unten (-y): Handfläche, vier leicht gekrümmte Finger, Daumen nach vorn */
function makeHand(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const palm = new THREE.CapsuleGeometry(0.03, 0.04, 3, 8);
  palm.scale(1.25, 1, 0.7);
  palm.translate(0, -0.05, 0);
  parts.push(palm);
  const len = [0.05, 0.062, 0.058, 0.044];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.CapsuleGeometry(0.0095, len[i], 2, 6);
    f.translate(0, -len[i] / 2, 0);
    f.rotateX(-0.22);
    f.translate(-0.027 + i * 0.018, -0.088, 0.004);
    parts.push(f);
  }
  const th = new THREE.CapsuleGeometry(0.0105, 0.035, 2, 6);
  th.translate(0, -0.02, 0);
  th.rotateX(-0.9);
  th.rotateZ(0.35);
  th.translate(0.032, -0.03, 0.012);
  parts.push(th);
  return mergeGeometries(parts.map((g) => g.toNonIndexed()), false)!;
}
const rngOf = (seed: number) => {
  let s = (seed >>> 0) || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
};

/** Kopf: Ellipsoid mit schmalerem Kiefer, vorgeschobenem Kinn, flacherer Stirn und vollerem Hinterkopf. Gesichtsfront bei z ≈ 0,15. */
function makeHeadGeo(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 40, 32);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let X = x * 0.138, Y = y * 0.162, Z = z * 0.15;
    if (y < 0.15) {
      const t = Math.min(1, (0.15 - y) / 1.15);
      X *= 1 - 0.3 * Math.pow(t, 1.15); // Kiefer schmaler
      if (z > 0) Z += 0.016 * t * t - 0.004 * t; // Kinn nach vorn, Wangen glatt
      else Z *= 1 - 0.12 * t; // Nacken
    }
    if (z > 0 && y > 0.35) Z *= 0.96; // Stirn flacher
    if (z < 0) Z *= 1.06; // Hinterkopf voller
    // Wangenknochen
    if (z > 0.35 && Math.abs(y + 0.15) < 0.3 && Math.abs(x) > 0.45) Z += 0.0015 * (1 - Math.abs(y + 0.15) / 0.3); // Wangenknochen nur ganz dezent
    p.setXYZ(i, X, Y, Z);
  }
  g.computeVertexNormals();
  return g;
}

/** Nase: Nasenrücken, Spitze und Flügel (ein Stück, Hautmaterial) */
function makeNoseGeo(): THREE.BufferGeometry {
  const bridge = new THREE.CapsuleGeometry(0.0105, 0.05, 3, 8);
  bridge.rotateX(-0.28);
  bridge.translate(0, 0.002, 0.147);
  const tip = new THREE.SphereGeometry(0.0165, 10, 8);
  tip.scale(1, 0.85, 1.05);
  tip.translate(0, -0.046, 0.158);
  const parts = [bridge, tip];
  for (const sx of [-1, 1]) {
    const wing = new THREE.SphereGeometry(0.0115, 8, 6);
    wing.scale(1, 0.9, 0.9);
    wing.translate(sx * 0.0145, -0.044, 0.15);
    parts.push(wing);
  }
  return mergeGeometries(parts.map((q) => q.toNonIndexed()), false)!;
}

/**
 * Haare aus vielen flachen Strähnen, die von der Scheitelmitte nach unten fließen, auf einer dunkleren Kappe.
 * Vertexfarben variieren den Ton je Strähne. Kopfkoordinaten (Kopfmitte = 0, Gesicht +z).
 */
function makeHairGeo(seed: number, long: boolean): THREE.BufferGeometry {
  const rnd = rngOf(seed * 7919 + 17);
  const RX = 0.152, RY = 0.176, RZ = 0.163;
  const parts: THREE.BufferGeometry[] = [];
  const shade = (g: THREE.BufferGeometry, v: number): THREE.BufferGeometry => {
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set([v, v * 0.97, v * 0.94], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  // Unterschicht: Kappe über der Kopfhaut; vorn endet sie an der Haargrenze, hinten reicht sie tiefer
  const cap = new THREE.SphereGeometry(1, 36, 22, 0, Math.PI * 2, 0, Math.PI * (long ? 0.6 : 0.54));
  const cp = cap.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    let x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
    const frontLine = 0.52 + 0.12 * Math.min(1, Math.abs(x) / 0.8); // Haargrenze (in Einheitskugel), seitlich tiefer
    if (z > 0.1 && y < frontLine) {
      const k = Math.sqrt(Math.max(0.0001, 1 - frontLine * frontLine) / Math.max(0.0001, 1 - y * y));
      x *= k;
      z *= k;
      y = frontLine;
    }
    cp.setXYZ(i, x * (RX + 0.003), y * (RY + 0.003), z * (RZ + 0.003));
  }
  cap.computeVertexNormals();
  parts.push(shade(cap, 0.55));
  cap.deleteAttribute('uv');
  // Strähne als schmales, zur Spitze verjüngtes Band, das der Kopfform folgt und unter der Schwerkraft nach unten kippt
  const place = (pos: THREE.Vector3, dir: THREE.Vector3, nrm: THREE.Vector3, len: number, r: number, v: number): void => {
    parts.push(ribbon(pos, dir, nrm, len, r * 1.5, v, 0.5 + rnd() * 0.5, rnd));
  };
  const surf = (theta: number, phi: number) => {
    const sx = Math.sin(theta) * Math.sin(phi), sz = Math.sin(theta) * Math.cos(phi), sy = Math.cos(theta);
    const pos = new THREE.Vector3(sx * RX, sy * RY, sz * RZ);
    const nrm = new THREE.Vector3(sx / RX, sy / RY, sz / RZ).normalize();
    // Richtung nach unten entlang der Oberfläche (wachsendes theta)
    const tan = new THREE.Vector3(Math.cos(theta) * Math.sin(phi) * RX, -Math.sin(theta) * RY, Math.cos(theta) * Math.cos(phi) * RZ).normalize();
    return { pos, nrm, tan };
  };
  // Deckhaar: viele feine Strähnen
  for (let i = 0; i < 190; i++) {
    const theta = 0.12 + rnd() * 1.1, phi = rnd() * Math.PI * 2;
    const s = surf(theta, phi);
    const front = s.pos.z > 0.02;
    // vorn bleibt die Stirn frei: nur Strähnen oberhalb der Haargrenze, und kurz
    if (front && s.pos.y < 0.125) continue;
    // leichter Seitenscheitel: Strähnen driften nach einer Seite
    const around = new THREE.Vector3(Math.cos(phi) * RX, 0, -Math.sin(phi) * RZ).normalize();
    const dir = s.tan.clone().addScaledVector(around, 0.25 + rnd() * 0.15).normalize();
    place(s.pos, dir, s.nrm, (0.07 + rnd() * 0.06) * (front ? 0.55 : 1), 0.006 + rnd() * 0.005, 0.62 + rnd() * 0.5);
  }
  // Pony: kurze Strähnen an der Haargrenze, seitlich gescheitelt, lassen Stirn und Augenbrauen frei
  for (let i = 0; i < 16; i++) {
    const phi = (i / 15 - 0.5) * 1.5 + (rnd() - 0.5) * 0.1;
    const s = surf(0.74 + rnd() * 0.06, phi);
    const dir = s.tan.clone().add(new THREE.Vector3(0.35 * Math.sign(phi || 1), 0, 0.3)).normalize();
    place(s.pos, dir, s.nrm, 0.025 + rnd() * 0.02, 0.006 + rnd() * 0.003, 0.7 + rnd() * 0.4);
  }
  // Koteletten (kurz, hinter dem Wangenansatz) und Nacken
  for (const sg of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const s = surf(1.16 + k * 0.07, sg * (1.3 + rnd() * 0.2));
      place(s.pos, new THREE.Vector3(0, -1, 0), s.nrm, 0.03 + rnd() * 0.02, 0.006, 0.55 + rnd() * 0.3);
    }
  }
  for (let i = 0; i < 30; i++) {
    const s = surf(1.0 + rnd() * 0.55, Math.PI + (rnd() - 0.5) * 2.0);
    place(s.pos, long ? new THREE.Vector3(0, -1, -0.15) : s.tan, s.nrm, long ? 0.14 + rnd() * 0.1 : 0.05, 0.007, 0.55 + rnd() * 0.4);
  }
  return mergeGeometries(parts, false)!;
}

/**
 * Haarsträhne als Band mit 4 Segmenten: breit an der Wurzel, spitz am Ende, folgt zuerst der Kopfoberfläche und hängt dann durch.
 * Vertexfarbe: dunkel an der Wurzel (Schatten im Haar), hell zur Spitze. Beidseitig sichtbar.
 */
function ribbon(pos: THREE.Vector3, dir: THREE.Vector3, nrm: THREE.Vector3, len: number, width: number, tone: number, curl: number, rnd: () => number): THREE.BufferGeometry {
  const SEG = 4;
  const D = dir.clone().normalize();
  const N = nrm.clone().normalize();
  const side = new THREE.Vector3().crossVectors(D, N).normalize();
  const wob = (rnd() - 0.5) * 0.5 * curl;
  const p: number[] = [], c: number[] = [], idx: number[] = [];
  for (let k = 0; k <= SEG; k++) {
    const t = k / SEG;
    const pt = pos.clone().addScaledVector(D, len * t).addScaledVector(N, 0.0025 + 0.012 * Math.sin(t * Math.PI * 0.8))
      .addScaledVector(side, wob * t * t * len).add(new THREE.Vector3(0, -0.5 * len * t * t * 0.35, 0));
    const w = width * (1 - 0.85 * t * t);
    p.push(pt.x - side.x * w, pt.y - side.y * w, pt.z - side.z * w, pt.x + side.x * w, pt.y + side.y * w, pt.z + side.z * w);
    const s = tone * (0.7 + 0.35 * t);
    c.push(s, s * 0.97, s * 0.94, s, s * 0.97, s * 0.94);
  }
  for (let k = 0; k < SEG; k++) {
    const a = k * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Lange Haarpartie, die beim Gehen schwingt: Strähnen vom Hinterkopf bis zu den Schulterblättern, relativ zum Gelenk bei (0, 0.04, -0.1) */
function makeLongHairGeo(seed: number): THREE.BufferGeometry {
  const rnd = rngOf(seed * 104729 + 3);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 130; i++) {
    const phi = Math.PI + (rnd() - 0.5) * 2.7; // Rückseite des Kopfes, bis über die Ohren
    const theta = 0.9 + rnd() * 0.6;
    const x = Math.sin(theta) * Math.sin(phi) * 0.158, y = Math.cos(theta) * 0.18, z = Math.sin(theta) * Math.cos(phi) * 0.168;
    const len = 0.17 + rnd() * 0.22 + (Math.abs(Math.sin(phi)) < 0.5 ? 0.06 : 0);
    const nrm = new THREE.Vector3(x / 0.158, y / 0.18, z / 0.168).normalize();
    // fällt senkrecht, mit leichter Welle und etwas Abstand vom Rücken
    const g = ribbon(new THREE.Vector3(x, y, z), new THREE.Vector3(Math.sin(phi) * 0.12, -1, Math.cos(phi) * 0.1), nrm, len, 0.011 + rnd() * 0.006, 0.55 + rnd() * 0.5, 1 + rnd(), rnd);
    g.translate(0, -0.04, 0.1);
    parts.push(g);
  }
  return mergeGeometries(parts, false)!;
}

const hairCache = new Map<string, THREE.BufferGeometry>();
function hairGeo(seed: number, long: boolean): THREE.BufferGeometry {
  const k = `${seed % 6}|${long}`;
  let g = hairCache.get(k);
  if (!g) hairCache.set(k, (g = makeHairGeo(seed % 6, long)));
  return g;
}
let longHairG: THREE.BufferGeometry | null = null;

const GEO = {
  hipsRound: lathe([[0.001, -0.1], [0.12, -0.1], [0.15, -0.06], [0.155, 0.0], [0.15, 0.06], [0.13, 0.095], [0.001, 0.1]], 28),
  beltRing: new THREE.TorusGeometry(0.152, 0.014, 6, 32),
  head2: makeHeadGeo(),
  nose2: makeNoseGeo(),
  // Rumpf: Taille, Brust, Schultern, Halsansatz (später in x breiter, in z schmaler skaliert)
  // reicht bis über die Hüfte hinunter, damit Pullover und Hose ohne Lücke oder Bund-Streifen ineinander übergehen
  body: lathe([[0.001, -0.115], [0.168, -0.115], [0.172, -0.07], [0.173, 0.03], [0.182, 0.13], [0.2, 0.26], [0.216, 0.37], [0.21, 0.46], [0.18, 0.505], [0.12, 0.537], [0.075, 0.555], [0.001, 0.56]], 32),
  collar: new THREE.TorusGeometry(0.082, 0.03, 8, 16),
  /** Gerippter Pulloverbund am Saum */
  hem: new THREE.TorusGeometry(0.172, 0.017, 8, 32),
  belt: G.box(0.37, 0.045, 0.235),
  buckle: G.box(0.05, 0.035, 0.012),
  skull: new THREE.SphereGeometry(0.15, 22, 18),
  jaw: new THREE.SphereGeometry(0.1, 14, 10),
  ear: new THREE.SphereGeometry(0.03, 8, 6),
  brow: G.box(0.07, 0.012, 0.02),
  mouth: G.box(0.05, 0.01, 0.01),
  eyeWhite: new THREE.SphereGeometry(0.02, 8, 6),
  pupil: new THREE.SphereGeometry(0.011, 6, 4),
  fringe: G.box(0.28, 0.05, 0.1),
  hairBack: new THREE.SphereGeometry(0.15, 14, 10),
  // Gliedmaßen als Drehprofile mit Muskelbauch (Wade, Oberschenkel, Bizeps) statt gerader Zylinder
  // mit leichten Stoffwellen am Ellbogen und gestauchtem Stoff am Handgelenk (Pulloverärmel)
  upperArmT: limbLathe([[0.048, -0.16], [0.053, -0.13], [0.0505, -0.105], [0.06, -0.03], [0.067, 0.06], [0.066, 0.12], [0.058, 0.16]], 20),
  foreArmT: limbLathe([[0.04, -0.14], [0.0445, -0.125], [0.041, -0.11], [0.0455, -0.095], [0.0425, -0.08], [0.048, -0.05], [0.053, 0.0], [0.054, 0.05], [0.052, 0.09], [0.05, 0.115], [0.048, 0.14]], 20),
  /** Gerippter Ärmelbund */
  cuff: new THREE.CylinderGeometry(0.047, 0.044, 0.05, 16),
  joint: new THREE.SphereGeometry(0.056, 12, 10),
  thighT: limbLathe([[0.064, -0.22], [0.072, -0.17], [0.083, -0.05], [0.098, 0.07], [0.1, 0.14], [0.094, 0.22]], 20),
  shinT: limbLathe([[0.05, -0.21], [0.052, -0.18], [0.058, -0.1], [0.066, 0.01], [0.068, 0.07], [0.063, 0.14], [0.058, 0.21]], 20),
  lipU: new THREE.CapsuleGeometry(0.008, 0.04, 3, 6).rotateZ(Math.PI / 2),
  lipL: new THREE.CapsuleGeometry(0.01, 0.036, 3, 6).rotateZ(Math.PI / 2),
  lid: new THREE.SphereGeometry(0.024, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.45),
  lock: new THREE.CapsuleGeometry(0.03, 0.24, 3, 8),
  hairSheet: new THREE.CapsuleGeometry(0.115, 0.3, 4, 12),
  tongue: G.box(0.06, 0.03, 0.09),
  strap: G.box(0.035, 0.1, 0.018),
  boot: G.box(0.125, 0.1, 0.29),
  toe: new THREE.SphereGeometry(0.063, 10, 8),
  sole: G.box(0.135, 0.03, 0.3),
  shaft: new THREE.CylinderGeometry(0.062, 0.066, 0.12, 10),
  torso: G.capsule(0.2, 0.34),
  chest: G.box(0.44, 0.32, 0.25),
  hips: G.box(0.36, 0.18, 0.22),
  neck: new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8),
  head: new THREE.SphereGeometry(0.15, 16, 14),
  hair: new THREE.SphereGeometry(0.158, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
  upperArm: G.capsule(0.065, 0.24),
  foreArm: G.capsule(0.055, 0.22),
  hand: makeHand(),
  thigh: G.capsule(0.085, 0.3),
  shin: G.capsule(0.07, 0.3),
  shoe: G.box(0.13, 0.09, 0.27),
  nose: G.box(0.04, 0.05, 0.05),
  eye: new THREE.SphereGeometry(0.018, 6, 4),
  beanie: new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
  packS: G.box(0.34, 0.42, 0.16),
  packL: G.box(0.4, 0.62, 0.24),
  roll: new THREE.CylinderGeometry(0.07, 0.07, 0.42, 10),
  torch: new THREE.CylinderGeometry(0.028, 0.035, 0.22, 8),
  lens: new THREE.CircleGeometry(0.03, 10),
  blot: new THREE.SphereGeometry(1, 10, 8),
};

const OUTFIT_COLORS: Record<string, number> = {
  jacket: 0x3d4a35, // Parka oliv
  hoodie: 0x5d6168,
  dress: 0xc66d8c, // Sommerkleid rosé
  tac_vest: 0x4a5040,
  shirt_tie: 0xe8e6df,
  sweater: 0x6a6e74,
  plaid_jacket: 0x4a4e58,
  leather_jacket: 0x3a2e28,
  denim_jacket: 0x6e8cba,
  raincoat: 0xf0c93a,
  work_vest: 0xff8a2a,
};

/** Graustufen-Textur, die als Farbkarte (Muster auf der Grundfarbe) und als Bump dient */
function grayTex(size: number, repeat: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}
const gray = (g: CanvasRenderingContext2D, v: number, x: number, y: number, w: number, h: number): void => {
  g.fillStyle = `rgb(${v},${v},${v})`;
  g.fillRect(x, y, w, h);
};

let knitT: THREE.CanvasTexture | null | undefined;
/** Strickmuster (V-Maschen in Reihen) mit Faserrauschen: Pullover, Jacke, T-Shirt */
function knitTex(): THREE.CanvasTexture | null {
  if (knitT !== undefined) return knitT;
  return (knitT = grayTex(128, 4, (g, s) => {
    // feine senkrechte Rippen (Maschenreihen) statt Punktmuster, damit nichts wie Pixelrauschen wirkt
    gray(g, 236, 0, 0, s, s);
    for (let x = 0; x < s; x += 4) {
      gray(g, 250, x, 0, 1, s);
      gray(g, 214, x + 2, 0, 1, s);
    }
    for (let y = 0; y < s; y += 16) gray(g, 226, 0, y, s, 1);
  }));
}

let twillT: THREE.CanvasTexture | null | undefined;
/** Köperbindung mit Diagonalrippen und ausgewaschenen Stellen: Jeans und Hosen */
function twillTex(): THREE.CanvasTexture | null {
  if (twillT !== undefined) return twillT;
  return (twillT = grayTex(128, 3, (g, s) => {
    gray(g, 232, 0, 0, s, s);
    for (let i = -s; i < s * 2; i += 3) {
      g.strokeStyle = `rgba(${i % 6 ? 185 : 250},${i % 6 ? 185 : 250},${i % 6 ? 185 : 250},0.4)`;
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + s, s);
      g.stroke();
    }
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 6 + Math.random() * 18;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${0.08 + Math.random() * 0.1})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }));
}

let skinT: THREE.CanvasTexture | null | undefined;
/** Hautporen, Sommersprossen, leichte Rötung */
function skinTex(): THREE.CanvasTexture | null {
  if (skinT !== undefined) return skinT;
  return (skinT = grayTex(128, 2, (g, s) => {
    gray(g, 246, 0, 0, s, s);
    for (let i = 0; i < 12; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 10 + Math.random() * 20;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,200,190,0.14)');
      gr.addColorStop(1, 'rgba(255,200,190,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }));
}
const skinCache = new Map<number, THREE.MeshStandardMaterial>();
function skinMat(color: number): THREE.MeshStandardMaterial {
  let m = skinCache.get(color);
  if (!m) skinCache.set(color, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, map: skinTex() })));
  return m;
}

function part(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function joint(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** Figur mit Gelenken (Hüfte, Knie, Schulter, Ellbogen), Blickrichtung +z. */
export function createCharacter(look: CharacterLook): THREE.Group {
  const knit = knitTex(), twill = twillTex();
  const jacket = new THREE.MeshStandardMaterial({ color: look.jacket, roughness: 0.92, map: knit, bumpMap: knit, bumpScale: 0.5 });
  const skinHex = look.skin ?? 0xd9a888;
  const skin = skinMat(skinHex);
  const hair = new THREE.MeshStandardMaterial({ color: look.hair ?? 0x3a2a1e, roughness: 0.55, metalness: 0.08 });
  /** Frisur aus Strähnen: Vertexfarben variieren den Ton, Glanz wie echtes Haar */
  const hairStyle = new THREE.MeshStandardMaterial({ color: look.hair ?? 0x3a2a1e, vertexColors: true, roughness: 0.42, metalness: 0.12, side: THREE.DoubleSide });
  const basePants = look.pants ?? 0x343846;
  const pants = new THREE.MeshStandardMaterial({ color: basePants, roughness: 0.95, map: twill, bumpMap: twill, bumpScale: 0.5 });
  const shoes = new THREE.MeshStandardMaterial({ color: 0x231f1c, roughness: 0.55, metalness: 0.05 });
  const trim = mat(0x1c1c20, 0.85);
  const sole = mat(0x14120f, 0.95);
  const metal = mat(0xb8b8bc, 0.35, 0.8);
  const lip = mat(0x9a5a52, 0.6);

  const root = new THREE.Group();
  const hips = joint(root, 0, 0.92, 0);
  const clothRoot = joint(hips, 0, 0.02, 0);
  // Becken rund (Ellipse) statt Quader, sonst ragen die Ecken seitlich unter dem Pullover hervor
  const pelvis = part(GEO.hipsRound, pants);
  pelvis.scale.set(1.2, 1, 0.78);
  hips.add(pelvis);
  const beltRing = part(GEO.beltRing, trim, 0, 0.07, 0);
  beltRing.rotation.x = Math.PI / 2;
  beltRing.scale.set(1.2, 0.78, 1);
  hips.add(beltRing);
  hips.add(part(GEO.buckle, metal, 0, 0.07, 0.118));

  const torso = joint(hips, 0, 0.06, 0);
  const body = part(GEO.body, jacket, 0, 0, 0);
  body.scale.set(1.12, 1, 0.72);
  torso.add(body);
  // Saum: gerippter Bund, bündig über dem Hosenbund, kein dunkler Streifen
  const hemRing = part(GEO.hem, jacket, 0, -0.108, 0);
  hemRing.rotation.x = Math.PI / 2;
  hemRing.scale.set(1.12, 0.72, 1);
  torso.add(hemRing);
  const collar = part(GEO.collar, jacket, 0, 0.53, 0);
  collar.rotation.x = Math.PI / 2;
  collar.scale.set(1, 0.9, 1.2);
  torso.add(collar);
  torso.add(part(GEO.neck, skin, 0, 0.56, 0));
  const head = joint(torso, 0, 0.72, 0.01);
  head.add(part(GEO.head2, skin));
  for (const sx of [-1, 1]) {
    const ear = part(GEO.ear, skin, sx * 0.137, -0.012, -0.004);
    ear.scale.set(0.5, 1.25, 0.85);
    ear.rotation.z = sx * -0.15;
    head.add(ear);
  }
  const hs = hairStyle;
  const hairMesh = part(hairGeo(look.hairSeed ?? Math.floor(Math.random() * 6), false), hs);
  hairMesh.castShadow = false;
  head.add(hairMesh);
  head.add(part(GEO.nose2, skin));
  const eyeColor = mat(look.eye ?? 0x5a3a22, 0.35);
  const eyeDark = mat(0x0c0908, 0.3);
  const white = mat(0xf1eee8, 0.4);
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const sx of [-1, 1]) {
    // Auge: Augapfel, Iris mit Pupille und Lichtreflex, darüber Lider und Wimpern
    const ex = sx * 0.052;
    const ball = part(GEO.eyeWhite, white, ex, 0.02, 0.131);
    ball.scale.set(1, 0.9, 0.85);
    head.add(ball);
    const iris = part(new THREE.SphereGeometry(0.0125, 10, 8), eyeColor, ex, 0.02, 0.1465);
    iris.scale.set(1, 1, 0.45);
    head.add(iris);
    head.add(part(new THREE.SphereGeometry(0.0062, 8, 6), eyeDark, ex, 0.02, 0.1495));
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 6, 4), shine);
    glint.position.set(ex + 0.0045, 0.0245, 0.1515);
    head.add(glint);
    // Lider als flache Kappen: der obere deckt nur den oberen Rand des Augapfels, Iris bleibt frei
    const lid = part(GEO.lid, skin, ex, 0.0315, 0.1325);
    lid.rotation.x = -0.2;
    lid.scale.set(1.15, 0.85, 1);
    head.add(lid);
    const lower = part(GEO.lid, skin, ex, 0.0065, 0.1335);
    lower.rotation.x = Math.PI + 0.1;
    lower.scale.set(1.1, 0.6, 1);
    head.add(lower);
    const lash = part(G.box(0.036, 0.0045, 0.004), eyeDark, ex, 0.0345, 0.1505);
    lash.rotation.z = sx * -0.1;
    head.add(lash);
    // Augenbraue: leicht gebogener Streifen, außen etwas höher
    const brow = part(new THREE.CapsuleGeometry(0.0058, 0.044, 2, 6).rotateZ(Math.PI / 2), hair, sx * 0.055, 0.058, 0.1405);
    brow.scale.set(1, 1, 0.6);
    brow.rotation.z = sx * -0.16;
    head.add(brow);
  }
  head.add(part(GEO.lipU, lip, 0, -0.083, 0.147), part(GEO.lipL, lip, 0, -0.1, 0.145));
  head.add(part(G.box(0.044, 0.0035, 0.004), mat(0x3a1a18, 0.7), 0, -0.0915, 0.1485)); // Mundlinie

  const foreMeshes: THREE.Mesh[] = [], cuffMeshes: THREE.Mesh[] = [], upperMeshes: THREE.Mesh[] = [], elbowJoints: THREE.Mesh[] = [];
  const arm = (side: number) => {
    // Schulter sitzt tiefer und näher am Rumpf, damit der Arm nicht wie ein Polster über den Rumpf ragt
    const sh = joint(torso, side * 0.272, 0.44, 0);
    sh.add(part(GEO.joint, jacket, 0, 0, 0));
    const um = part(GEO.upperArmT, jacket, 0, -0.185, 0);
    sh.add(um);
    upperMeshes.push(um, sh.children[0] as THREE.Mesh);
    const el = joint(sh, 0, -0.34, 0);
    const fm = part(GEO.foreArmT, jacket, 0, -0.14, 0);
    const cm = part(GEO.cuff, jacket, 0, -0.268, 0);
    foreMeshes.push(fm);
    cuffMeshes.push(cm);
    el.add(fm, cm);
    el.add(part(GEO.hand, skin, 0, -0.27, 0.01));
    return [sh, el] as const;
  };
  const [armL, elbowL] = arm(-1);
  const [armR, elbowR] = arm(1);
  armL.rotation.z = -0.08;
  armR.rotation.z = 0.08;

  const leg = (side: number) => {
    const hp = joint(hips, side * 0.1, -0.06, 0);
    hp.add(part(GEO.thighT, pants, 0, -0.22, 0));
    const kn = joint(hp, 0, -0.42, 0);
    kn.add(part(GEO.shinT, pants, 0, -0.21, 0));
    kn.add(part(GEO.shaft, shoes, 0, -0.37, 0));
    kn.add(part(GEO.boot, shoes, 0, -0.415, 0.055));
    kn.add(part(GEO.toe, shoes, 0, -0.41, 0.2));
    kn.add(part(GEO.sole, sole, 0, -0.455, 0.05));
    kn.add(part(GEO.tongue, shoes, 0, -0.355, 0.1));
    const laces = part(G.box(0.07, 0.012, 0.012), mat(0xe6e2d6, 0.8), 0, -0.375, 0.135);
    kn.add(laces);
    return [hp, kn] as const;
  };
  const [legL, kneeL] = leg(-1);
  const [legR, kneeR] = leg(1);

  const slots = {
    head: joint(head, 0, 0, 0),
    back: joint(torso, 0, 0.3, -0.15),
    hand: joint(elbowR, 0, -0.32, 0.03),
    body: joint(torso, 0, 0, 0),
  };

  if (look.banner !== undefined) {
    const pole = part(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 5), mat(0x444444), 0.12, 0.45, -0.05);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.26), new THREE.MeshStandardMaterial({ color: look.banner, side: THREE.DoubleSide, roughness: 0.9 }));
    flag.position.set(0.32, 0.77, -0.05);
    flag.castShadow = true;
    slots.back.add(pole, flag);
  }
  if (look.pack !== undefined) slots.back.add(part(GEO.packS, mat(look.pack, 0.9), 0, 0, -0.06));

  const rig: Rig = {
    hips, torso, head, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR, jacket, pants, shoes, basePants,
    baseJacket: look.jacket, slots, skinMat: skin, fore: foreMeshes, cuffs: cuffMeshes, zstyle: 0, phase: Math.random() * 6, amp: 0, breathe: Math.random() * 6,
    upper: upperMeshes, elbowJ: elbowJoints, skinHex, pantsMap: twill, clothRoot, cloth: [], sway: 0, swayV: 0, prevY: 0.92, garments: null, hair: hairMesh, kit: null, seed: Math.random() * 100,
  };
  root.userData.rig = rig;
  if (look.kit && kitReady()) {
    const kb = new KitBody();
    root.add(kb.group);
    // prozedurale Körperteile ausblenden; die Figur dient nur noch als Bewegungsgeber, Zubehör bleibt
    root.traverse((o) => {
      const me = o as THREE.Mesh;
      if (!me.isMesh || kb.group.children.includes(o) || isInside(o, kb.group) || me === hairMesh) return;
      for (let a: THREE.Object3D | null = o; a; a = a.parent) if (a === slots.back || a === hairMesh) return;
      me.visible = false;
    });
    root.updateMatrixWorld(true);
    // Passform der Stoffteile an den neuen Körper
    setKitSurface(kb.surface());
    const dummy: Record<string, THREE.Object3D> = { shirt: new THREE.Object3D(), pants: new THREE.Object3D(), shoes: new THREE.Object3D(), upper: new THREE.Object3D(), fore: new THREE.Object3D() };
    root.updateMatrixWorld(true);
    const oldBones = [hips, torso, head, armL, elbowL, armR, elbowR, legL, kneeL, legR, kneeR] as unknown as THREE.Bone[];
    rig.garments = { set: 'kit', root, skeleton: new THREE.Skeleton(oldBones), shells: dummy as GarmentHost['shells'], cache: new Map() };
    rig.fore = [];
    rig.upper = [];
    rig.elbowJ = [];
    rig.cuffs = [];
    rig.kit = kb;
    slots.head.scale.setScalar(0.84);
    slots.head.position.set(0, -0.02, 0.0);
    hairMesh.visible = false; // prozedurales Haar passt nicht zum Kopf des Baukastens
    kb.update(rig);
  } else if (!look.plain) {
    const hb = buildHumanBody(root, { hips, torso, head, armL, elbowL, armR, elbowR, legL, kneeL, legR, kneeR }, { skin, shirt: jacket, pants, shoes });
    if (hb) {
      // prozedurale Körperteile ausblenden: Haare, Gepäck und Zubehör bleiben
      root.traverse((o) => {
        const me = o as THREE.Mesh;
        if (!me.isMesh || (me as THREE.SkinnedMesh).isSkinnedMesh || me === hairMesh) return;
        for (let a: THREE.Object3D | null = o; a; a = a.parent) if (a === slots.back || a === hairMesh) return;
        me.visible = false;
      });
      rig.garments = { set: 'old', root, skeleton: hb.skeleton, shells: hb.shells, cache: new Map() };
      rig.fore = [hb.fore];
      rig.upper = [hb.upper];
      rig.elbowJ = [];
      rig.cuffs = [];
      // Kopf des GLB-Körpers ist kleiner: Haare und Mützen im Maßstab angleichen
      const hbx = hb.headBox;
      const place = (o: THREE.Object3D): void => {
        o.position.set(hbx.cx, hbx.cy - 1.71, hbx.cz - 0.01);
        o.scale.set(hbx.hx / 0.138, hbx.hy / 0.162, hbx.hz / 0.15);
      };
      // Gesicht (Augen, Brauen, Lippen) auf die Kopfoberfläche des GLB-Körpers setzen
      const face = new THREE.Group();
      for (const c of [...head.children]) {
        const cm = c as THREE.Mesh;
        if (cm.isMesh && cm.geometry !== GEO.head2 && cm.geometry !== GEO.ear && cm.geometry !== GEO.nose2 && c !== hairMesh) {
          cm.visible = true;
          face.add(cm);
        }
      }
      head.add(face);
      for (const o of [face, hairMesh, slots.head]) place(o);
      face.position.z -= 0.014;
      hairMesh.scale.multiplyScalar(1.1);
      slots.body.scale.set(0.95, 1, 0.82);
    }
  }
  return root;
}

/** Lange, kurze oder keine Ärmel: kurz zeigt Haut am Unterarm, keine auch am Oberarm */
function setSleeves(r: Rig, mode: 'long' | 'short' | 'none'): void {
  for (const m of r.fore) m.material = mode === 'long' ? r.jacket : r.skinMat;
  for (const m of r.elbowJ) m.material = mode === 'long' ? r.jacket : r.skinMat;
  for (const m of r.upper) m.material = mode === 'none' ? r.skinMat : r.jacket;
  for (const c of r.cuffs) c.visible = mode === 'long';
}

function isInside(o: THREE.Object3D, anc: THREE.Object3D): boolean {
  for (let a: THREE.Object3D | null = o; a; a = a.parent) if (a === anc) return true;
  return false;
}

function rigOf(g: THREE.Object3D): Rig {
  return g.userData.rig as Rig;
}

/**
 * Laufanimation. speed in m/s (0 = steht), dt in Sekunden.
 * Beine pendeln gegengleich, Knie beugen sich in der Schwungphase, Arme schwingen gegen die Beine.
 */
export function animateCharacter(g: THREE.Object3D, speed: number, dt: number): void {
  const r = rigOf(g);
  const run = Math.min(1, Math.max(0, (speed - 3.6) / 2.5));
  const target = Math.min(1, speed / 3.5) * (1 + 0.35 * run);
  r.amp += (target - r.amp) * Math.min(1, dt * 10);
  r.phase += dt * (speed > 0.05 ? 2.4 + speed * 1.15 : 0);
  r.breathe += dt * 1.6;
  const a = r.amp;
  const s = Math.sin(r.phase);
  const c = Math.cos(r.phase);

  // Der Gang ist nie ganz gleichmäßig: Schrittlänge, Armschwung und Schulterlage schwanken langsam und unabhängig voneinander
  const sd = r.seed;
  const vL = 1 + 0.16 * Math.sin(r.phase * 0.43 + sd), vR = 1 + 0.16 * Math.sin(r.phase * 0.37 + sd * 1.7);
  const wob = Math.sin(r.phase * 0.21 + sd * 0.6);
  r.legL.rotation.x = s * 0.5 * a * vL;
  r.legR.rotation.x = -s * 0.5 * a * vR;
  r.kneeL.rotation.x = Math.max(0, -c) * 0.85 * a + 0.04;
  r.kneeR.rotation.x = Math.max(0, c) * 0.85 * a + 0.04;
  r.armL.rotation.x = -s * 0.36 * a * vR + 0.04 * wob * a;
  r.armR.rotation.x = s * 0.36 * a * vL - 0.03 * wob * a;
  r.armL.rotation.z = -0.08 - 0.05 * a * (0.5 + 0.5 * Math.sin(r.phase * 0.5 + sd));
  r.armR.rotation.z = 0.08 + 0.05 * a * (0.5 + 0.5 * Math.sin(r.phase * 0.5 + sd + 2));
  r.elbowL.rotation.x = -(0.15 + 0.4 * run) * a - 0.04;
  r.elbowR.rotation.x = -(0.15 + 0.4 * run) * a - 0.04;
  // Hände mit Lampe: rechter Arm zeigt nach vorn
  if (r.handKind === 'gun' || r.handKind === 'gun2') {
    // Schusswaffe: Arm gestreckt nach vorn, Lauf zeigt zum Ziel; Gewehre halten beide Hände
    r.armR.rotation.x = -1.4 + s * 0.02 * a;
    r.elbowR.rotation.x = -0.1;
    r.armR.rotation.z = 0.04;
    if (r.handKind === 'gun2') {
      r.armL.rotation.x = -1.25 + s * 0.02 * a;
      r.elbowL.rotation.x = -0.5;
      r.armL.rotation.z = 0.28;
    }
  } else if (r.slots.hand.children.length) {
    r.armR.rotation.x = -0.75 + s * 0.08 * a;
    r.elbowR.rotation.x = -0.35;
  }
  r.hips.position.y = 0.92 + Math.abs(c) * 0.045 * a - 0.02 * a + Math.sin(r.breathe) * 0.004;
  r.hips.rotation.y = s * 0.06 * a;
  r.torso.rotation.y = -s * 0.1 * a;
  r.torso.rotation.x = 0.04 * a + 0.1 * run + 0.012 * wob * a;
  r.torso.rotation.z = 0.02 * a * Math.sin(r.phase * 0.5 + sd);
  r.torso.scale.set(1, 1 + Math.sin(r.breathe) * 0.008, 1);
  r.head.rotation.x = -0.05 * a;
  clothSim(r, dt, a, speed);
  r.kit?.update(r);
}

/**
 * Stoff in Bewegung: eine gedämpfte Feder zieht Rock, Jackenschöße, Kordeln und Haare beim Laufen nach hinten.
 * Rocksegmente werden außerdem von den Beinen nach außen geschoben und wippen mit dem Schritt.
 */
function clothSim(r: Rig, dt: number, a: number, speed: number): void {
  if (!r.cloth.length) return;
  const step = Math.min(dt, 0.04);
  const vy = step > 0 ? (r.hips.position.y - r.prevY) / step : 0;
  r.prevY = r.hips.position.y;
  const target = Math.min(0.55, speed * 0.11);
  if (step > 0) {
    r.swayV += ((target - r.sway) * 70 - r.swayV * 8) * step;
    r.sway += r.swayV * step;
  }
  const bounce = Math.max(-0.25, Math.min(0.25, -vy * 0.06));
  const lx = r.legL.rotation.x, rx = r.legR.rotation.x;
  const fwd = Math.max(0, -lx, -rx), back = Math.max(0, lx, rx);
  const wave = r.phase * 2;
  for (const c of r.cloth) {
    if (c.kind === 'skirt') {
      const cs = Math.cos(c.ang), sn = Math.sin(c.ang);
      let f = c.base + c.k * (fwd * Math.max(0, cs) + back * 0.8 * Math.max(0, -cs) + 0.25 * (fwd + back) * Math.abs(sn));
      f += -r.sway * cs * 1.1 * (0.4 + c.k * 0.6) + bounce * 0.9 + Math.sin(wave + c.ang * 2) * 0.035 * a;
      c.g.rotation.x = -Math.max(-0.12, Math.min(1.05, f));
      c.g.rotation.z = sn * 0.04 * bounce;
    } else if (c.kind === 'cord') {
      c.g.rotation.x = -r.sway * 1.3 + bounce * 1.6 + Math.sin(wave + c.ang) * 0.08 * a;
      c.g.rotation.z = Math.sin(r.phase + c.ang) * 0.16 * a;
    } else {
      // Haar: hängt, wird beim Laufen nach hinten geweht und schwingt seitlich mit dem Oberkörper
      c.g.rotation.x = c.base + r.sway * 0.85 + bounce * 0.9;
      c.g.rotation.z = -r.torso.rotation.y * 0.9 + Math.sin(r.phase + c.ang) * 0.07 * a;
    }
  }
}

/** Rock aus Segmenten, die einzeln auf Beinbewegung reagieren (Rock: weit; Jackenschoß: eng und kurz) */
function skirt(r: Rig, mat: THREE.Material, radius: number, len: number, count: number, base: number, k: number, flareCurve = 0.1): void {
  const w = ((Math.PI * 2 * radius) / count) * 1.28;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    g.rotation.y = ang;
    const geo = new THREE.PlaneGeometry(w, len, 3, 4);
    const p = geo.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const t = (len / 2 - p.getY(v)) / len; // 0 oben, 1 unten
      // Saum wellt sich leicht, Fläche biegt sich nach außen
      const wave = t > 0.85 ? Math.sin(p.getX(v) * 40 + i) * 0.012 : 0;
      p.setZ(v, radius + t * t * flareCurve + wave);
      p.setY(v, p.getY(v) - len / 2);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    r.clothRoot.add(g);
    r.cloth.push({ g, kind: 'skirt', ang, base, k });
  }
}

/** Langes Haar: Schwall im Nacken plus Strähnen, hängt an einem Gelenk am Hinterkopf */
function longHair(r: Rig, hairColor: number): void {
  const m = new THREE.MeshStandardMaterial({ color: hairColor, vertexColors: true, roughness: 0.42, metalness: 0.12, side: THREE.DoubleSide });
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.04, -0.1);
  longHairG ??= makeLongHairGeo(1);
  const strands = part(longHairG, m);
  strands.castShadow = false;
  pivot.add(strands);
  r.slots.head.add(pivot);
  r.cloth.push({ g: pivot, kind: 'hair', ang: 0, base: 0.04, k: 0 });
}

/** Ausrüstung sichtbar machen: Mütze, Jacke/Pulli, Rucksack, Taschenlampe. */
export function dressCharacter(g: THREE.Object3D, outfit: Outfit): void {
  const r = rigOf(g);
  const key = JSON.stringify(outfit);
  if (g.userData.outfit === key) return;
  g.userData.outfit = key;
  for (const s of Object.values(r.slots)) s.clear();
  r.clothRoot.clear();
  r.cloth.length = 0;
  // Jackenschoß folgt dem schmalen Rumpf (Ellipse), Rock ist rund
  r.clothRoot.scale.set(1, 1, outfit.body === 'jacket' ? 0.78 : 1);

  // Das Sommerkleid ist für die alte Figur gebaut; am Baukasten-Körper (männlich) zeigt es sich wie normale Kleidung
  const dressed = outfit.body === 'dress' && !r.kit;
  r.jacket.color.setHex(outfit.body ? OUTFIT_COLORS[outfit.body] ?? r.baseJacket : 0xc9c2b4); // ohne Oberteil: helles T-Shirt
  setSleeves(r, dressed ? 'none' : outfit.body ? 'long' : 'short');
  const dark = mat(0x1c1c20, 0.8);
  if (dressed) {
    // Sommerkleid: Mieder mit Trägern und Gürtelband, darunter ein weiter Rock aus Segmenten, der beim Gehen weht
    for (const sx of [-1, 1]) r.slots.body.add(part(GEO.strap, r.jacket, sx * 0.1, 0.53, 0));
    r.slots.body.add(part(G.box(0.4, 0.045, 0.25), mat(0x7a3550, 0.8), 0, 0.02, 0));
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0xc66d8c, roughness: 0.88, side: THREE.DoubleSide, map: knitTex(), bumpMap: knitTex(), bumpScale: 0.5 });
    skirt(r, skirtMat, 0.2, 0.5, 12, 0.1, 0.55, 0.16);
    skirt(r, new THREE.MeshStandardMaterial({ color: 0xa8506e, roughness: 0.9, side: THREE.DoubleSide }), 0.185, 0.46, 12, 0.07, 0.5, 0.12);
    longHair(r, 0x4a2c1c);
  } else if (outfit.body === 'jacket' && !(r.garments && garmentsReady())) {
    // Parka: lang über die Hüfte, hoher Kragen, Reißverschluss, Taschen; der Saum schwingt als Rock aus Segmenten mit
    skirt(r, new THREE.MeshStandardMaterial({ color: OUTFIT_COLORS.jacket, roughness: 0.92, side: THREE.DoubleSide, map: knitTex(), bumpMap: knitTex(), bumpScale: 0.5 }), 0.205, 0.22, 12, 0.02, 0.28, 0.05);
    const high = part(new THREE.CylinderGeometry(0.095, 0.105, 0.07, 14, 1, true), r.jacket, 0, 0.58, 0);
    high.scale.set(1.1, 1, 1.05);
    r.slots.body.add(high, part(G.box(0.014, 0.5, 0.012), dark, 0, 0.27, 0.168));
    for (const sx of [-1, 1]) r.slots.body.add(part(G.box(0.11, 0.1, 0.02), dark, sx * 0.13, 0.05, 0.16));
  } else if (outfit.body === 'hoodie' && !(r.garments && garmentsReady())) {
    // Kapuze im Nacken, Känguru-Tasche, Kordeln
    const hood = part(GEO.hairBack, r.jacket, 0, 0.57, -0.1);
    hood.scale.set(1.15, 0.7, 0.85);
    r.slots.body.add(hood, part(G.box(0.27, 0.11, 0.02), r.jacket, 0, 0.1, 0.168));
    // Halsbund des Pullis
    const rib = part(new THREE.TorusGeometry(0.09, 0.022, 6, 14), r.jacket, 0, 0.545, 0.005);
    rib.rotation.x = Math.PI / 2;
    rib.scale.set(1.1, 1, 1);
    r.slots.body.add(rib);
    // Kordeln hängen frei und pendeln beim Gehen
    for (const sx of [-1, 1]) {
      const cord = new THREE.Group();
      cord.position.set(sx * 0.04, 0.46, 0.165);
      cord.add(part(G.box(0.012, 0.13, 0.012), mat(0xd8d4c8, 0.8), 0, -0.065, 0));
      cord.add(part(new THREE.SphereGeometry(0.012, 6, 4), mat(0xd8d4c8, 0.8), 0, -0.135, 0));
      r.slots.body.add(cord);
      r.cloth.push({ g: cord, kind: 'cord', ang: sx, base: 0, k: 0 });
    }
    // Kapuzenkragen rund um den Hals, Ärmel und Saum haben gerippte Bünde (Saum: Torus am Rumpf)
    const ring = part(new THREE.TorusGeometry(0.108, 0.042, 10, 22), r.jacket, 0, 0.565, -0.012);
    ring.rotation.x = Math.PI / 2.15;
    ring.scale.set(1.18, 1, 0.9);
    r.slots.body.add(ring);
  }
  // unter dem Kleid sind die Beine nackt
  r.pants.map = dressed ? null : r.pantsMap;
  r.pants.bumpMap = dressed ? null : r.pantsMap;
  r.pants.needsUpdate = true;
  if (dressed) r.pants.color.setHex(r.skinHex);
  else r.pants.color.setHex(outfit.legs === 'jeans' ? 0x34508a : outfit.legs ? 0x4a4a40 : r.basePants);
  r.shoes.color.setHex(outfit.feet === 'boots' ? 0x6a4424 : 0x231f1c);
  if (r.kit && r.garments) {
    // Baukasten-Kleidung: Hemd, Jeans, Weste, Taschen, Holster, Kappe; alles andere kommt aus den angepassten GLB-Stücken
    const parts: string[] = [];
    let oBody = outfit.body, oLegs = outfit.legs, oHead = outfit.head;
    // Das Hemd gibt es nur ohne Oberteil, mit Hemd/Krawatte und unter der Weste; unter Pullover und Jacke entfällt es (sonst schaut es durch)
    // Pullover, Pulli, Winterjacke und Karojacke sind Varianten des Baukasten-Hemds (gleiche Passform, eigene Farbe/Stoff)
    const tint = outfit.tint;
    const hex = (c: number) => c.toString(16).padStart(6, '0');
    const shirtKey = outfit.body && outfit.body in SHIRT_VARIANTS ? `shirt:${outfit.body}${tint && (outfit.body === 'sweater' || outfit.body === 'hoodie') ? '@' + hex(tint.outer ?? tint.top) : ''}` : null;
    // Hemd darunter: in Spielerfarbe, außer zur Krawatte (weißes Hemd)
    const teeKey = tint && outfit.body !== 'shirt_tie' ? `shirt:tee@${hex(tint.top)}` : 'shirt';
    const jeansKey = tint ? `jeans@${hex(tint.legs)}` : 'jeans';
    const topless = !outfit.body || outfit.body === 'shirt_tie' || outfit.body === 'tac_vest' || outfit.body === 'work_vest' || outfit.body === 'dress';
    if (!dressed && topless) parts.push(teeKey);
    if (shirtKey) {
      parts.push(shirtKey);
      oBody = null;
    } else if (outfit.body === 'tac_vest') {
      parts.push('vest', 'drops');
      oBody = null;
    } else if (outfit.body === 'work_vest') {
      parts.push('vest:work');
      oBody = null;
    } else if (!outfit.body || outfit.body === 'shirt_tie' || outfit.body === 'dress') oBody = null;
    if (!dressed && (!outfit.legs || outfit.legs === 'jeans')) {
      parts.push(jeansKey);
      oLegs = null;
    } else if (outfit.legs === 'cargo_pants') {
      parts.push(jeansKey, 'holster');
      oLegs = null;
    }
    if (outfit.head === 'cap') {
      parts.push('cap');
      oHead = null;
    }
    r.kit.showParts(parts);
    // Haut unter der Kleidung in Stofffarbe färben (Pullover: Rumpf, Schultern, Arme bis zum Handgelenk; Hemd: bis zum Ellbogen; Hose: Beine; Stiefel: Füße)
    const top: string[] = [], bottom: string[] = [];
    const longSleeves = shirtKey !== null;
    if (!dressed) {
      top.push('spine', 'clavicle', 'upperarm');
      if (longSleeves) top.push('lowerarm');
      if (!outfit.legs || outfit.legs === 'jeans' || outfit.legs === 'cargo_pants') bottom.push('pelvis', 'thigh', 'calf');
    }
    if (outfit.feet === 'boots' || outfit.feet === 'tac_boots') bottom.push('foot', 'ball');
    const topCol = r.kit.partColor(shirtKey ?? teeKey);
    const botCol = r.kit.partColor(jeansKey);
    r.kit.hideSkin(top, bottom, topCol ?? undefined, botCol ?? undefined);
    showGarments(r.garments, [oBody, oLegs, outfit.feet, oHead]);
  } else if (r.garments) {
    const hid = showGarments(r.garments, [outfit.body, outfit.legs, outfit.feet, outfit.head]);
    for (const k of Object.keys(r.garments.shells) as (keyof typeof r.garments.shells)[]) r.garments.shells[k].visible = !hid.has(k);
  }
  if (r.hair && !r.kit) r.hair.visible = outfit.head !== 'cap';
  if (outfit.head === 'beanie') r.slots.head.add(part(GEO.beanie, mat(0x8e2f2a, 0.95), 0, 0.03, -0.005));

  if (outfit.back === 'schoolbag' || outfit.back === 'hikingpack') {
    // Gurte liegen auf der Kleidung: dicke Jacken und Westen schieben sie nach außen
    const bulkOf = (id: string | null | undefined): number => (id && id in SHIRT_VARIANTS ? SHIRT_VARIANTS[id].push * 0.01 : id === 'tac_vest' || id === 'work_vest' ? 0.016 : 0);
    const pack = createBackpack(outfit.back, r.kit ? bulkOf(outfit.body) : 0.012);
    // Der Baukasten-Körper hat einen flacheren Rücken: Rucksack etwas näher heran
    if (r.kit) pack.position.z += 0.03;
    r.slots.back.add(pack);
  }
  const gunDef = firearmOf(outfit.hand ?? null);
  r.handKind = gunDef ? (gunDef.twoHanded ? 'gun2' : 'gun') : outfit.hand ? 'tool' : null;
  if (outfit.hand && TOOL_BUILD[outfit.hand]) r.slots.hand.add(...TOOL_BUILD[outfit.hand]());
  if (outfit.hand === 'flashlight') {
    const t = part(GEO.torch, mat(0x222428, 0.4, 0.6), 0, -0.02, 0.06);
    t.rotation.x = Math.PI / 2;
    const lens = new THREE.Mesh(GEO.lens, new THREE.MeshBasicMaterial({ color: 0xfff3c8 }));
    lens.position.set(0, -0.02, 0.175);
    r.slots.hand.add(t, lens);
  }
}

/**
 * Werkzeuge in der Faust. Jedes Werkzeug wird in einem eigenen Halter gebaut: +y läuft am Griff entlang nach oben (Griffende
 * bei y ≈ −0.12, dort sitzt die Hand), +z ist die Schneide bzw. die Schlagfläche. Der Halter wird einmal gekippt, so dass
 * das Werkzeug in der erhobenen Hand schräg nach vorn-oben zeigt, die Schneide nach vorn.
 */
const WOOD = 0xb98a52, WOOD_DARK = 0x6a4a28, STEEL = 0x8b8f97, STEEL_DARK = 0x4a4e56, GRIP = 0x1c1c20;
const tp = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Mesh => {
  const metal = color === STEEL || color === STEEL_DARK;
  const m = part(geo, mat(color, metal ? 0.35 : 0.75, metal ? 0.8 : 0.05), x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
};
const held = (parts: THREE.Object3D[], tilt = 1.62): THREE.Object3D[] => {
  const g = new THREE.Group();
  g.rotation.x = tilt;
  g.position.set(0, -0.02, 0.04);
  g.add(...parts);
  return [g];
};
const rod = (r0: number, r1: number, len: number): THREE.BufferGeometry => new THREE.CylinderGeometry(r1, r0, len, 10);
const TOOL_BUILD: Record<string, () => THREE.Object3D[]> = {
  bat: () =>
    held([
      tp(rod(0.02, 0.046, 0.86), WOOD, 0, 0.3, 0), // verdickt zum Schlagende
      tp(rod(0.024, 0.024, 0.2), GRIP, 0, -0.03, 0), // Griffband
      tp(new THREE.SphereGeometry(0.026, 8, 6), WOOD_DARK, 0, -0.13, 0),
    ]),
  pipe: () =>
    held([
      tp(rod(0.03, 0.03, 0.78), STEEL_DARK, 0, 0.27, 0),
      tp(rod(0.034, 0.034, 0.04), STEEL, 0, 0.66, 0),
      tp(rod(0.034, 0.034, 0.04), STEEL, 0, -0.1, 0),
    ]),
  knife: () =>
    held(
      [
        tp(rod(0.016, 0.016, 0.12), GRIP, 0, 0.0, 0), // Griff
        tp(new THREE.BoxGeometry(0.03, 0.012, 0.045), STEEL_DARK, 0, 0.07, 0), // Parierstange
        tp(new THREE.BoxGeometry(0.008, 0.21, 0.034), STEEL, 0, 0.18, 0.004), // Klinge, Schneide nach vorn
      ],
      1.35,
    ),
  machete: () =>
    held([
      tp(rod(0.016, 0.016, 0.14), GRIP, 0, -0.02, 0),
      tp(new THREE.BoxGeometry(0.03, 0.012, 0.05), STEEL_DARK, 0, 0.065, 0),
      tp(new THREE.BoxGeometry(0.008, 0.5, 0.075), STEEL, 0, 0.33, 0.012),
      tp(new THREE.BoxGeometry(0.01, 0.06, 0.09), STEEL, 0, 0.6, 0.02, 0.3), // Spitze
    ]),
  hammer: () =>
    held([
      tp(rod(0.016, 0.019, 0.36), WOOD, 0, 0.05, 0), // Stiel
      tp(new THREE.BoxGeometry(0.045, 0.05, 0.13), STEEL, 0, 0.27, 0.0), // Kopf
      tp(rod(0.03, 0.026, 0.035), STEEL, 0, 0.27, 0.085, Math.PI / 2), // Schlagfläche vorn
      tp(new THREE.BoxGeometry(0.022, 0.032, 0.1), STEEL, 0, 0.265, -0.1, -0.35), // Klaue hinten
    ]),
  sledgehammer: () =>
    held([
      tp(rod(0.021, 0.025, 1.0), WOOD, 0, 0.32, 0), // langer Stiel
      tp(rod(0.027, 0.027, 0.14), GRIP, 0, -0.05, 0),
      tp(new THREE.BoxGeometry(0.09, 0.1, 0.19), STEEL, 0, 0.84, 0), // schwerer Kopf
      tp(rod(0.055, 0.05, 0.04), STEEL, 0, 0.84, 0.115, Math.PI / 2), // Schlagfläche vorn
      tp(rod(0.055, 0.05, 0.04), STEEL, 0, 0.84, -0.115, Math.PI / 2), // und hinten
    ]),
  crowbar: () =>
    held([
      tp(rod(0.015, 0.015, 0.72), STEEL_DARK, 0, 0.26, 0),
      tp(new THREE.BoxGeometry(0.02, 0.1, 0.045), STEEL_DARK, 0, 0.64, 0.045, 0.7), // gebogenes Ende mit Klaue
      tp(new THREE.BoxGeometry(0.024, 0.07, 0.03), STEEL_DARK, 0, -0.1, 0.02, -0.5), // flaches Ende
    ]),
  axe: () =>
    held([
      tp(rod(0.019, 0.024, 0.86), WOOD, 0, 0.3, 0), // Stiel, am Ende leicht dicker
      tp(new THREE.BoxGeometry(0.05, 0.13, 0.05), STEEL_DARK, 0, 0.66, 0), // Öse auf dem Stiel
      tp(new THREE.BoxGeometry(0.034, 0.21, 0.16), STEEL, 0, 0.66, 0.1), // Blatt nach vorn
      tp(new THREE.BoxGeometry(0.012, 0.27, 0.03), STEEL, 0, 0.66, 0.19, 0.0), // Schneide
      tp(new THREE.BoxGeometry(0.04, 0.09, 0.07), STEEL_DARK, 0, 0.66, -0.05), // Nacken hinten
    ]),
};

// PZ-Waffen (Messer, Schwerter, Schusswaffen …) mit detaillierten Handmodellen
Object.assign(TOOL_BUILD, PZ_TOOL_BUILD);

/** Schlag: Ausholen (bis 40 %), Zuschlagen (bis 60 %), Zurückführen. u = 0..1. Nach `animateCharacter` aufrufen. */
export function swingCharacter(g: THREE.Object3D, u: number, look: string): void {
  const r = rigOf(g);
  const wind = Math.min(1, u / 0.4);
  const strike = u < 0.4 ? 0 : Math.min(1, (u - 0.4) / 0.2);
  const back = u > 0.6 ? Math.min(1, (u - 0.6) / 0.4) : 0;
  const up = look === 'knife' || look === 'fist' ? -1.5 : -2.5;
  const ang = u < 0.4 ? up * wind : up * (1 - strike) - 0.2 * strike;
  r.armR.rotation.x = ang * (1 - back);
  r.elbowR.rotation.x = -(0.3 + 0.5 * (1 - strike)) * (1 - back);
  const twist = (u < 0.4 ? 0.5 * wind : 0.5 - 1.3 * strike) * (1 - back);
  r.torso.rotation.y = twist;
  r.torso.rotation.x += 0.14 * strike * (1 - back);
  r.kit?.update(r);
}

/** Arbeitshaltung während einer Zeitaktion. `t` = laufende Sekunden. Nach `animateCharacter` aufrufen. */
export type WorkPose = 'hammer' | 'loot' | 'eat' | 'treat' | 'dress' | 'chop' | 'smash';

/** Takt eines Abbruch-Hiebs in Sekunden (die Wirkung im Spiel richtet sich danach) */
export const CHOP_PERIOD = 0.7;
export const SMASH_PERIOD = 1.1;
const ease = (u: number): number => u * u * (3 - 2 * u);
export function workCharacter(g: THREE.Object3D, pose: WorkPose, t: number): void {
  const r = rigOf(g);
  const s = Math.sin(t * 7);
  if (pose === 'chop' || pose === 'smash') {
    // Ein Hieb: ausholen (0–62 %), zuschlagen (62–72 %), kurz verharren, zurücknehmen. Der Treffer liegt bei 72 %.
    const period = pose === 'chop' ? CHOP_PERIOD : SMASH_PERIOD;
    const u = (t % period) / period;
    const wind = ease(Math.min(1, u / 0.62));
    const hit = ease(Math.min(1, Math.max(0, (u - 0.62) / 0.1)));
    const rec = ease(Math.min(1, Math.max(0, (u - 0.8) / 0.2)));
    const lift = wind * (1 - hit) + 0.0;
    const slam = hit * (1 - rec);
    if (pose === 'chop') {
      // Axt einhändig über die Schulter, dann schräg nach unten durchziehen
      r.armR.rotation.x = -0.4 - 2.2 * lift - 0.5 * slam;
      r.elbowR.rotation.x = -0.4 - 0.9 * lift - 0.2 * slam;
      r.armL.rotation.x = -0.5 - 0.5 * lift;
      r.elbowL.rotation.x = -0.6;
      r.torso.rotation.x = -0.14 * lift + 0.32 * slam;
      r.torso.rotation.y = 0.5 * lift - 0.45 * slam;
      r.hips.position.y = 0.92 - 0.06 * slam;
    } else {
      // Vorschlaghammer mit beiden Händen weit über den Kopf, mit dem ganzen Körper nach vorn
      r.armR.rotation.x = -0.3 - 2.55 * lift - 0.6 * slam;
      r.armL.rotation.x = -0.3 - 2.45 * lift - 0.6 * slam;
      r.elbowR.rotation.x = -0.35 - 0.5 * lift;
      r.elbowL.rotation.x = -0.4 - 0.5 * lift;
      r.torso.rotation.x = -0.3 * lift + 0.6 * slam;
      r.torso.rotation.y = 0.12 * lift;
      r.hips.position.y = 0.92 - 0.12 * slam;
      r.legL.rotation.x = -0.1 - 0.3 * slam;
      r.legR.rotation.x = 0.15 + 0.2 * slam;
      r.kneeL.rotation.x = 0.2 + 0.5 * slam;
      r.kneeR.rotation.x = 0.1 + 0.3 * slam;
    }
    r.head.rotation.x = 0.1 * slam;
  } else if (pose === 'hammer') {
    // linke Hand hält das Brett, rechte schlägt im Takt
    r.armL.rotation.x = -1.35;
    r.elbowL.rotation.x = -0.5;
    r.armR.rotation.x = -1.5 - 0.9 * Math.max(0, s);
    r.elbowR.rotation.x = -0.4 - 0.9 * Math.max(0, s);
    r.torso.rotation.x = 0.16 + 0.06 * Math.max(0, -s);
    r.torso.rotation.y = 0.15;
  } else if (pose === 'loot') {
    // in die Hocke, Arme greifen nach vorn unten
    const w = Math.sin(t * 3.2) * 0.2;
    r.hips.position.y = 0.66;
    r.legL.rotation.x = -1.05;
    r.legR.rotation.x = -0.95;
    r.kneeL.rotation.x = 1.9;
    r.kneeR.rotation.x = 1.85;
    r.armL.rotation.x = -1.2 + w;
    r.armR.rotation.x = -1.1 - w;
    r.elbowL.rotation.x = -0.5;
    r.elbowR.rotation.x = -0.5;
    r.torso.rotation.x = 0.45;
    r.head.rotation.x = -0.25;
  } else if (pose === 'eat') {
    const bite = 0.5 + 0.5 * Math.sin(t * 5);
    r.armR.rotation.x = -1.9 + 0.25 * bite;
    r.elbowR.rotation.x = -1.9 + 0.2 * bite;
    r.head.rotation.x = 0.1 + 0.08 * bite;
  } else if (pose === 'treat') {
    // Arm vorhalten, andere Hand verbindet
    r.armL.rotation.x = -1.0;
    r.elbowL.rotation.x = -0.9;
    r.armR.rotation.x = -1.1 + 0.2 * s;
    r.elbowR.rotation.x = -1.0 + 0.3 * Math.sin(t * 5);
    r.torso.rotation.x = 0.2;
    r.head.rotation.x = 0.25;
  } else {
    r.armL.rotation.x = -0.9 + 0.2 * s;
    r.armR.rotation.x = -0.9 - 0.2 * s;
    r.elbowL.rotation.x = -1.0;
    r.elbowR.rotation.x = -1.0;
    r.torso.rotation.x = 0.1;
  }
  r.kit?.update(r);
}

/** Zombie-Typen nach früherem Beruf: bestimmen Kleidung und Zubehör */
export type ZombieKind = 'civilian' | 'office' | 'police' | 'medical' | 'worker' | 'hoodie' | 'tank';
const ZOMBIE_KINDS: ZombieKind[] = ['civilian', 'civilian', 'civilian', 'office', 'police', 'medical', 'worker', 'hoodie', 'tank'];

export function zombieKind(seed: number): ZombieKind {
  return ZOMBIE_KINDS[Math.abs(Math.floor(seed)) % ZOMBIE_KINDS.length];
}

/** Zombie: fahle, fleckige Haut, zerrissene und blutige Kleidung; Aussehen nach `seed` (frühere Kleidung, Wunden) */
export function createZombie(seed: number): THREE.Group {
  seed = Math.abs(Math.floor(seed));
  const glb = createZombieModel(seed);
  if (glb) return glb;
  const kind = zombieKind(seed);
  const pick = <T,>(list: T[], shift: number): T => list[(seed >> shift) % list.length];
  const skin = pick([0x8c9a80, 0x93a08a, 0x7e8c76, 0x9aa18f, 0x8a8f78], 5);
  const looks: Record<ZombieKind, { jacket: number; pants: number }> = {
    civilian: { jacket: pick([0x4b4a3e, 0x3b4452, 0x5a3b34, 0x3e5040, 0x6a6558, 0x6b3a3a], 2), pants: pick([0x2b2d33, 0x3a3629, 0x30343c, 0x34508a], 3) },
    office: { jacket: 0xcfcabb, pants: 0x25262c },
    police: { jacket: 0x1f2a44, pants: 0x1a2236 },
    medical: { jacket: 0x4f8a8a, pants: 0x4a8080 },
    worker: { jacket: 0x5b5e63, pants: 0x3a3f4a },
    hoodie: { jacket: pick([0x5d6168, 0x3a3f4a, 0x6a3030], 4), pants: 0x2b2d33 },
    tank: { jacket: 0xc9c2b4, pants: pick([0x34508a, 0x3a3629], 6) },
  };
  const g = createCharacter({ ...looks[kind], skin, hair: pick([0x22201c, 0x3a2a1e, 0x8a7a5a, 0x5a5a5a], 7), hairSeed: seed % 6, eye: 0xc9d2a0, plain: true });
  decorateZombie(g, seed, kind, skin);
  // Statur: Größe und Breite variieren, Dicke sind massiger
  const r = rigOf(g);
  const height = 0.93 + ((seed * 7) % 15) / 100;
  const width = kind === 'tank' ? 1.2 : 0.92 + ((seed * 13) % 14) / 100;
  g.scale.set(width, height, width);
  r.zstyle = (seed >> 3) % 4;
  if ((kind === 'civilian' || kind === 'hoodie') && (seed >> 5) % 3 === 0) setSleeves(r, 'short'); // T-Shirt
  return g;
}

/** Verwesung und Zubehör: hohle Augen, blutiger Mund, Wunden und Flecken, zerrissene Kleidung */
function decorateZombie(g: THREE.Object3D, seed: number, kind: ZombieKind, skin: number): void {
  const r = rigOf(g);
  let st = (seed * 2654435761) % 4294967296 || 1;
  const rnd = (): number => {
    st = (Math.imul(st, 1664525) + 1013904223) >>> 0;
    return st / 4294967296;
  };
  const blood = mat(0x4a1010, 0.55), dried = mat(0x2b0f0d, 0.9), dark = mat(0x15110e, 0.95);
  // Flecken sind flache, unregelmäßige Ellipsen statt Rechtecke
  const blot = (m: THREE.Material, w: number, h: number, x: number, y: number, z: number, rot: number): THREE.Mesh => {
    const b = part(GEO.blot, m, x, y, z);
    b.scale.set(w, h, 0.012);
    b.rotation.z = rot;
    b.castShadow = false;
    return b;
  };
  const rotSkin = mat(new THREE.Color(skin).multiplyScalar(0.62).getHex(), 0.8);
  r.jacket.color.multiplyScalar(0.8);
  r.pants.color.multiplyScalar(0.76);

  // Gesicht: hohle Augen mit milchiger Iris, blutiger offener Mund, Wunden
  for (const sx of [-1, 1]) {
    const socket = part(GEO.eyeWhite, dark, sx * 0.055, 0.02, 0.138);
    socket.scale.set(1.7, 1.9, 1.2);
    r.head.add(socket, part(GEO.pupil, mat(0xc9d2a0, 0.4), sx * 0.055, 0.02, 0.153));
  }
  const mouth = part(GEO.mouth, blood, 0, -0.095, 0.143);
  mouth.scale.set(1.9, 2.6, 1);
  const chin = part(G.box(0.07, 0.1, 0.02), dried, 0, -0.14, 0.12);
  chin.rotation.x = -0.4;
  r.head.add(mouth, chin);
  if (rnd() < 0.6) {
    const cut = part(G.box(0.05, 0.035, 0.012), blood, (rnd() < 0.5 ? -1 : 1) * 0.07, 0.0, 0.146);
    cut.rotation.z = rnd() * 1.4;
    r.head.add(cut);
  }
  if (rnd() < 0.4) {
    const bald = part(GEO.ear, rotSkin, (rnd() - 0.5) * 0.1, 0.13, -0.02);
    bald.scale.set(1.8, 0.7, 1.8);
    r.head.add(bald);
  }

  // Blutflecken und freiliegende Haut am Oberkörper, Flecken an den Armen
  const stains = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < stains; i++) {
    const front = rnd() < 0.7;
    const bx = (rnd() - 0.5) * 0.3;
    r.torso.add(blot(rnd() < 0.5 ? blood : dried, 0.03 + rnd() * 0.06, 0.03 + rnd() * 0.07, bx, 0.1 + rnd() * 0.38, front ? 0.15 : -0.15, rnd() * 3));
    // Tropfspur nach unten
    if (rnd() < 0.5) r.torso.add(blot(blood, 0.012, 0.05 + rnd() * 0.05, bx, 0.06 + rnd() * 0.2, front ? 0.151 : -0.151, 0));
  }
  if (rnd() < 0.6) r.torso.add(blot(rotSkin, 0.05 + rnd() * 0.03, 0.04 + rnd() * 0.04, (rnd() - 0.5) * 0.26, 0.15 + rnd() * 0.25, 0.152, rnd() * 3));
  for (const arm of [r.armL, r.armR]) {
    if (rnd() < 0.7) {
      arm.add(blot(rnd() < 0.5 ? blood : dried, 0.025 + rnd() * 0.02, 0.04 + rnd() * 0.03, 0, -0.14 - rnd() * 0.1, 0.06, rnd()));
    }
  }
  // Fehlender Unterarm (selten): Stumpf mit Blut
  if (rnd() < 0.08) {
    const side = rnd() < 0.5 ? r.elbowL : r.elbowR;
    side.visible = false;
    const stump = part(GEO.joint, blood, 0, -0.33, 0);
    stump.scale.setScalar(0.85);
    (side === r.elbowL ? r.armL : r.armR).add(stump);
  }
  if (rnd() < 0.4) r.shoes.color.setHex(new THREE.Color(skin).multiplyScalar(0.7).getHex()); // barfuß

  // Zubehör nach früherem Beruf
  if (kind === 'police') {
    const cap = part(new THREE.CylinderGeometry(0.162, 0.168, 0.07, 14), mat(0x161d30, 0.8), 0, 0.125, 0);
    r.head.add(cap, part(G.box(0.2, 0.012, 0.1), mat(0x0e1220, 0.5), 0, 0.105, 0.14));
    r.torso.add(part(G.box(0.045, 0.05, 0.012), mat(0xc9a53a, 0.35, 0.8), 0.1, 0.4, 0.16));
  } else if (kind === 'office') {
    r.torso.add(part(G.box(0.045, 0.28, 0.012), mat(0x7a1f24, 0.8), 0, 0.34, 0.16));
  } else if (kind === 'medical') {
    const cap = part(GEO.beanie, mat(0x3f7676, 0.9), 0, 0.03, -0.005);
    r.head.add(cap);
  } else if (kind === 'worker') {
    const vest = part(G.box(0.5, 0.36, 0.33), mat(0xd9741c, 0.8), 0, 0.3, 0);
    r.torso.add(vest);
    for (const y of [0.22, 0.38]) r.torso.add(part(G.box(0.505, 0.035, 0.335), mat(0xcfd2c4, 0.6), 0, y, 0));
    r.torso.add(part(G.box(0.2, 0.16, 0.012), blood, 0.08, 0.3, 0.168));
  } else if (kind === 'hoodie') {
    const hood = part(GEO.hairBack, r.jacket, 0, -0.01, -0.06);
    hood.scale.set(1.2, 1.05, 1.05);
    r.head.add(hood);
  }
}

/** Zombie-Haltung: Arme nach vorn, Oberkörper gebeugt, Kopf pendelt. `lunge` 0..1 streckt sich beim Angriff vor. */
export function animateZombie(g: THREE.Object3D, speed: number, dt: number, lunge = 0): void {
  if (g.userData.glbZ || g.userData.bigZ) return animateZombieModel(g, speed, dt, lunge);
  animateCharacter(g, Math.min(speed * 1.1, 3.4), dt);
  const r = rigOf(g);
  const sway = Math.sin(r.phase * 0.5) * 0.12;
  const idle = Math.max(0, 1 - speed / 0.6);
  const t = r.breathe;
  r.armL.rotation.x = -1.35 - 0.5 * lunge + sway;
  r.armR.rotation.x = -1.25 - 0.5 * lunge - sway;
  r.armL.rotation.z = -0.12;
  r.armR.rotation.z = 0.12;
  r.elbowL.rotation.x = -0.25;
  r.elbowR.rotation.x = -0.3;
  // Seitenneigung jedes Bild neu aufbauen (sonst summiert sie sich auf und der Oberkörper kippt immer weiter)
  r.torso.rotation.z = 0;
  r.hips.rotation.z = 0;
  r.torso.rotation.x += 0.14 + 0.12 * lunge;
  r.torso.rotation.y *= 0.3;
  r.head.rotation.z = Math.sin(t * 0.7) * 0.07;
  r.head.rotation.x = 0.1;
  // Gangarten: jeder Zombie bewegt sich ein bisschen anders
  switch (r.zstyle) {
    case 1: // hinkt: ein Bein wird nachgezogen
      r.legR.rotation.x *= 0.35;
      r.kneeR.rotation.x = 0.04 + 0.1 * Math.abs(Math.sin(r.phase));
      r.hips.rotation.z = Math.sin(r.phase) * 0.06;
      r.hips.position.y -= 0.045;
      r.torso.rotation.z = -Math.sin(r.phase) * 0.06;
      break;
    case 2: // greift mit beiden Armen weit nach vorn
      r.armL.rotation.x = -1.65 - 0.4 * lunge + sway * 0.5;
      r.armR.rotation.x = -1.6 - 0.4 * lunge - sway * 0.5;
      r.elbowL.rotation.x = -0.08;
      r.elbowR.rotation.x = -0.08;
      r.head.rotation.x = 0.25;
      break;
    case 3: // ein Arm hängt schlaff, der Kopf kippt zur Seite
      r.armL.rotation.x = -0.15 + sway * 0.6;
      r.armL.rotation.z = -0.05;
      r.elbowL.rotation.x = -0.15;
      r.head.rotation.z = 0.2 + Math.sin(t * 0.7) * 0.05;
      r.torso.rotation.z = 0.05;
      break;
    default:
      break;
  }
  // Im Stand: schwankt, zuckt und lässt den Kopf hängen
  if (idle > 0) {
    r.torso.rotation.z += Math.sin(t * 0.9) * 0.03 * idle;
    r.torso.rotation.x += (0.03 + 0.02 * Math.sin(t * 1.7)) * idle;
    r.head.rotation.x += (0.06 + 0.03 * Math.sin(t * 0.5)) * idle;
    r.armL.rotation.x += Math.max(0, Math.sin(t * 3.1)) * 0.12 * idle;
  }
}

const easeIn = (x: number): number => x * x * (0.4 + 0.6 * x);

/**
 * Sturz (u = 0..1): erst knicken die Knie ein und der Oberkörper kippt, dann fällt die Figur beschleunigt
 * um die Füße nach hinten (oder vorn), schlägt auf, federt leicht nach und liegt leicht verdreht am Boden.
 */
export function fallCharacter(g: THREE.Object3D, u: number): void {
  const ud = g.userData as { fallDir?: number; fallTwist?: number };
  if (ud.fallDir === undefined) {
    const k = Math.sin((g.id + 1) * 12.9898) * 43758.5453;
    const f = k - Math.floor(k);
    ud.fallDir = f < 0.72 ? 1 : -1; // meist rücklings
    ud.fallTwist = (f - 0.5) * 0.5;
  }
  const dir = ud.fallDir;
  const wind = Math.min(1, u / 0.22); // Einknicken
  const drop = u < 0.22 ? 0 : Math.min(1, (u - 0.22) / 0.58); // freier Fall
  const fall = easeIn(drop);
  const hit = u > 0.8 ? Math.min(1, (u - 0.8) / 0.2) : 0;
  const bounce = Math.sin(hit * Math.PI) * 0.07 * (1 - hit * 0.4);
  g.rotation.x = dir * (-Math.PI / 2) * Math.min(1, fall + bounce) + dir * 0.18 * wind * (1 - fall);
  g.rotation.z = (ud.fallTwist ?? 0) * fall;
  g.position.y = -0.1 * wind * (1 - fall) + 0.13 * fall + bounce * 0.12;
  g.position.z = -dir * 0.08 * wind * (1 - fall);
}

/** Trefferreaktion: Oberkörper wirft sich zurück und zuckt (t = Sekunden seit dem Treffer; danach zurück in die Ruhe) */
export function reactZombie(g: THREE.Object3D, t: number): void {
  const T = 0.55;
  if (t >= T) {
    if (g.userData.reacting) {
      g.rotation.x = 0;
      g.rotation.z = 0;
      g.position.z = 0;
      g.userData.reacting = false;
    }
    return;
  }
  g.userData.reacting = true;
  const u = t / T;
  const kick = Math.sin(Math.min(1, u / 0.35) * Math.PI * 0.5) * (1 - Math.max(0, (u - 0.35) / 0.65));
  g.rotation.x = -0.42 * kick;
  g.rotation.z = Math.sin(t * 38) * 0.07 * (1 - u);
  g.position.z = -0.12 * kick;
}
