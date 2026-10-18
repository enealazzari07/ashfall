import * as THREE from 'three';
import { Box, FLOOR_H } from './CityGenerator';
import type { Stack } from '../data/items';
import { overlaps, pushOut } from './collision';
import { FIRE_MAX_FUEL, FIRE_START_FUEL, FUEL_PER_WOOD, PieceDef } from '../data/recipes';
import { textures } from '../render/Textures';
import { mats } from '../render/Materials';
import { makeBox } from '../render/geo';

export type Rot = 0 | 1;

export interface Piece {
  id: number;
  def: PieceDef;
  x: number;
  z: number;
  rot: Rot;
  footprint: Box;
  colliders: Box[];
  obj: THREE.Group;
  fuel: number; // nur Lagerfeuer, in Spielstunden
  flame: THREE.Object3D | null;
  /** Etage, auf der das Teil steht (0 = Erdgeschoss/draußen) */
  lv: number;
  /** Inhalt (Kiste, Schrank) */
  loot: Stack[];
}

/** Bauteile mit Fächern: man kann mit E Dinge hineinlegen und herausnehmen */
export const STORAGE_PIECES = new Set(['crate', 'cabinet']);

const WARM_RADIUS = 4;
const snap2 = (v: number) => 2 * Math.round(v / 2);

/** Rastet ein Bauteil ein. Wände liegen so, dass Ecken bei ungeraden Koordinaten zusammentreffen. */
export function snapPiece(def: PieceDef, px: number, pz: number, rot: Rot): { x: number; z: number } {
  if (def.id === 'wall' || def.id === 'door' || def.id === 'windowwall' || def.id === 'fence') {
    return rot === 0 ? { x: snap2(px), z: snap2(pz - 1) + 1 } : { x: snap2(px - 1) + 1, z: snap2(pz) };
  }
  if (def.id === 'bed') return { x: Math.round(px), z: Math.round(pz) };
  return { x: Math.round(px * 2) / 2, z: Math.round(pz * 2) / 2 };
}

export function footprintOf(def: PieceDef, x: number, z: number, rot: Rot): Box {
  return rot === 0 ? { x, z, w: def.w, d: def.d } : { x, z, w: def.d, d: def.w };
}

const woodMats = new Map<number, THREE.MeshStandardMaterial>();
function wood(color: number): THREE.MeshStandardMaterial {
  let m = woodMats.get(color);
  if (!m) woodMats.set(color, (m = new THREE.MeshStandardMaterial({ color, map: textures().floor, roughness: 0.85 })));
  return m;
}
const plain = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

function addBox(g: THREE.Group, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): void {
  const m = new THREE.Mesh(boxGeo, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
}

/** Wandstück aus weißem Putz wie die Zimmerwände der Häuser (gleiches Material), mit dunkler Fußleiste */
function plasterBox(g: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, skirting = true): void {
  const m = new THREE.Mesh(makeBox(w, h, d, 4, 2), mats().interior);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  if (skirting) addBox(g, plain(0x4a3a2c), w + 0.03, 0.1, d + 0.03, x, 0.05, z);
}

function buildMesh(def: PieceDef): { obj: THREE.Group; flame: THREE.Object3D | null } {
  const g = new THREE.Group(); // lokal: Länge entlang X
  let flame: THREE.Object3D | null = null;
  switch (def.id) {
    case 'wall':
      plasterBox(g, def.w, def.h, def.d, 0, def.h / 2, 0);
      break;
    case 'windowwall': {
      plasterBox(g, def.w, 0.9, def.d, 0, 0.45, 0); // Brüstung
      plasterBox(g, def.w, def.h - 1.9, def.d, 0, def.h - (def.h - 1.9) / 2, 0, false); // Sturz
      for (const sx of [-1, 1]) plasterBox(g, 0.5, 1.0, def.d, sx * 0.75, 1.4, 0, false);
      addBox(g, wood(0x5a4026), 1.2, 0.06, def.d + 0.1, 0, 0.93, 0); // Fensterbank
      break;
    }
    case 'barricade': {
      const m = wood(def.color);
      for (let i = 0; i < 4; i++) addBox(g, m, def.w, 0.22, 0.18, 0, 0.2 + i * 0.28, ((i % 2) - 0.5) * 0.1);
      for (const sx of [-0.8, 0.8]) addBox(g, wood(0x4a3420), 0.14, def.h, 0.14, sx, def.h / 2, 0.16);
      break;
    }
    case 'table': {
      const m = wood(def.color);
      addBox(g, m, def.w, 0.08, def.d, 0, def.h, 0);
      for (const [sx, sz] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]]) addBox(g, wood(0x5a4026), 0.09, def.h, 0.09, sx, def.h / 2, sz);
      break;
    }
    case 'workbench': {
      const m = wood(def.color), dk = wood(0x4a3420), iron = plain(0x6a6e74);
      addBox(g, dk, def.w, 0.1, def.d, 0, def.h, 0); // dicke Platte
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addBox(g, m, 0.12, def.h, 0.12, sx * (def.w / 2 - 0.1), def.h / 2, sz * (def.d / 2 - 0.1));
      addBox(g, m, def.w - 0.2, 0.05, def.d - 0.2, 0, 0.3, 0); // Ablage
      addBox(g, iron, 0.22, 0.14, 0.3, def.w / 2 - 0.3, def.h + 0.12, 0); // Schraubstock
      addBox(g, plain(0x8a8a90), 0.5, 0.03, 0.12, -0.3, def.h + 0.07, 0.1); // Werkzeug
      break;
    }
    case 'shelf': {
      // Regal: zwei Seitenwände, Rückwand, Bretter, oben eine Leiste; auf den Brettern ein paar Dosen und Kisten
      const m = wood(def.color), dk = wood(0x5a4026);
      for (const sx of [-1, 1]) addBox(g, dk, 0.05, def.h, def.d, sx * (def.w / 2 - 0.025), def.h / 2, 0);
      addBox(g, wood(0x4a3420), def.w - 0.1, def.h - 0.1, 0.02, 0, def.h / 2, -def.d / 2 + 0.01);
      const boards = [0.12, 0.6, 1.05, 1.5, def.h - 0.03];
      for (const y of boards) addBox(g, m, def.w - 0.1, 0.035, def.d - 0.02, 0, y, 0.005);
      const tin = plain(0xb9b4a0), box = plain(0x8b6b45), jar = plain(0x6f8a6a);
      const stuff: [THREE.MeshStandardMaterial, number, number, number, number][] = [[tin, 0.07, 0.11, -0.55, 0.62], [tin, 0.07, 0.11, -0.43, 0.62], [box, 0.26, 0.2, 0.2, 0.62], [jar, 0.09, 0.15, 0.55, 0.62], [box, 0.4, 0.26, -0.3, 1.07], [tin, 0.07, 0.11, 0.35, 1.07], [tin, 0.07, 0.11, 0.47, 1.07], [box, 0.3, 0.22, 0.1, 1.52]];
      for (const [mat, w, h, x, y] of stuff) addBox(g, mat, w, h, w > 0.2 ? 0.26 : w, x, y + h / 2, 0.02);
      break;
    }
    case 'chair': {
      const m = wood(def.color), dk = wood(0x5a4026);
      addBox(g, m, def.w, 0.05, def.d, 0, 0.45, 0);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addBox(g, dk, 0.05, 0.45, 0.05, sx * (def.w / 2 - 0.04), 0.225, sz * (def.d / 2 - 0.04));
      addBox(g, m, def.w, 0.34, 0.04, 0, 0.7, -def.d / 2 + 0.03);
      addBox(g, dk, def.w - 0.1, 0.04, 0.04, 0, 0.82, -def.d / 2 + 0.03);
      break;
    }
    case 'crate': {
      const m = wood(def.color), dk = wood(0x5a4026);
      addBox(g, m, def.w, def.h, def.d, 0, def.h / 2, 0);
      for (const y of [0.1, def.h - 0.1]) addBox(g, dk, def.w + 0.03, 0.08, def.d + 0.03, 0, y, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(g, dk, 0.08, def.h + 0.02, 0.08, sx * (def.w / 2 - 0.02), def.h / 2, sz * (def.d / 2 - 0.02));
      addBox(g, wood(0x9a7a50), def.w - 0.08, 0.03, def.d - 0.08, 0, def.h + 0.005, 0);
      break;
    }
    case 'cabinet': {
      const m = wood(def.color), dk = wood(0x4a3420), iron = plain(0x2e3236);
      addBox(g, m, def.w, def.h, def.d, 0, def.h / 2, 0);
      addBox(g, dk, def.w + 0.06, 0.05, def.d + 0.06, 0, def.h + 0.02, 0); // Deckplatte
      addBox(g, dk, def.w + 0.04, 0.08, def.d + 0.04, 0, 0.04, 0); // Sockel
      for (const sx of [-1, 1]) {
        addBox(g, dk, def.w / 2 - 0.05, def.h - 0.3, 0.03, sx * (def.w / 4), def.h / 2 + 0.03, def.d / 2 + 0.005); // Tür
        addBox(g, iron, 0.03, 0.14, 0.03, sx * 0.07, def.h / 2 + 0.03, def.d / 2 + 0.035); // Griff
      }
      break;
    }
    case 'fence': {
      const m = wood(def.color), dk = wood(0x5a4026);
      for (const sx of [-1, 1]) addBox(g, dk, 0.12, def.h, 0.12, sx * (def.w / 2 - 0.06), def.h / 2, 0);
      for (const y of [0.4, 0.8, 1.15]) addBox(g, m, def.w - 0.1, 0.07, 0.05, 0, y, 0.06);
      for (let i = 0; i < 7; i++) addBox(g, m, 0.09, def.h - 0.25, 0.03, -def.w / 2 + 0.25 + i * ((def.w - 0.5) / 6), (def.h - 0.25) / 2 + 0.05, -0.03);
      break;
    }
    case 'door': {
      const m = wood(def.color);
      addBox(g, m, 0.4, def.h, def.d, -0.8, def.h / 2, 0);
      addBox(g, m, 0.4, def.h, def.d, 0.8, def.h / 2, 0);
      addBox(g, m, def.w, 0.5, def.d, 0, def.h - 0.25, 0);
      break;
    }
    case 'bed': {
      addBox(g, wood(0x6b4a2e), 2, 0.3, 1, 0, 0.15, 0);
      addBox(g, plain(0xb9c4d6), 1.9, 0.18, 0.9, 0, 0.39, 0);
      addBox(g, plain(0xf2f2f2), 0.4, 0.12, 0.7, -0.7, 0.54, 0);
      addBox(g, wood(0x6b4a2e), 0.1, 0.55, 1, -1, 0.3, 0);
      break;
    }
    case 'fire': {
      const stone = plain(0x77777c);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), stone);
        s.position.set(Math.cos(a) * 0.38, 0.1, Math.sin(a) * 0.38);
        s.castShadow = true;
        g.add(s);
      }
      const logMat = plain(0x4a3220);
      for (let i = 0; i < 3; i++) {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6), logMat);
        l.rotation.z = Math.PI / 2;
        l.rotation.y = (i / 3) * Math.PI;
        l.position.y = 0.1;
        g.add(l);
      }
      flame = new THREE.Group();
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.65, 7), new THREE.MeshBasicMaterial({ color: 0xff7a1c }));
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 7), new THREE.MeshBasicMaterial({ color: 0xffd45c }));
      outer.position.y = 0.4;
      inner.position.y = 0.3;
      flame.add(outer, inner);
      g.add(flame);
      break;
    }
  }
  return { obj: g, flame };
}

export class Structures {
  readonly group = new THREE.Group();
  readonly light = new THREE.PointLight(0xff9a3c, 0, 18, 1.5);
  pieces: Piece[] = [];
  private nextId = 1;

  constructor() {
    this.group.add(this.light);
  }

  canPlace(def: PieceDef, x: number, z: number, rot: Rot, world: { overlapsWorld(b: Box, shrink?: number, level?: number): boolean; blocksOpening?(b: Box, level?: number): boolean }, lv = 0): boolean {
    const f = footprintOf(def, x, z, rot);
    if (this.pieces.some((p) => p.lv === lv && overlaps(f, p.footprint, 0.2))) return false;
    if (world.blocksOpening?.(f, lv)) return false;
    return !world.overlapsWorld(f, 0.2, lv);
  }

  place(def: PieceDef, x: number, z: number, rot: Rot, lv = 0, loot: Stack[] = []): Piece {
    const { obj, flame } = buildMesh(def);
    obj.position.set(x, lv * FLOOR_H, z);
    obj.rotation.y = rot === 1 ? Math.PI / 2 : 0;
    this.group.add(obj);

    const footprint = footprintOf(def, x, z, rot);
    let colliders: Box[] = [];
    if (def.id === 'fence') colliders = [{ ...footprint, climb: 1 }];
    else if (def.id === 'wall' || def.id === 'fire' || def.id === 'windowwall' || def.id === 'barricade' || def.id === 'table' || def.id === 'workbench' || def.id === 'shelf' || def.id === 'chair' || def.id === 'crate' || def.id === 'cabinet') colliders = [footprint];
    else if (def.id === 'door') {
      const post = (o: number): Box =>
        rot === 0 ? { x: x + o, z, w: 0.4, d: def.d } : { x, z: z + o, w: def.d, d: 0.4 };
      colliders = [post(-0.8), post(0.8)];
    }

    const piece: Piece = { id: this.nextId++, def, x, z, rot, footprint, colliders, obj, fuel: 0, flame, lv, loot };
    if (def.id === 'fire') this.setFuel(piece, FIRE_START_FUEL);
    this.pieces.push(piece);
    return piece;
  }

  /** Spielstand: Art, Ort, Drehung und Brennstoff der gebauten Teile */
  toJSON(): { id: string; x: number; z: number; rot: Rot; fuel: number; lv?: number; loot?: Stack[] }[] {
    return this.pieces.map((p) => ({ id: p.def.id, x: p.x, z: p.z, rot: p.rot, fuel: p.fuel, lv: p.lv || undefined, loot: p.loot.length ? p.loot.map((s) => ({ ...s })) : undefined }));
  }

  fromJSON(list: { id: string; x: number; z: number; rot: Rot; fuel: number; lv?: number; loot?: Stack[] }[], defs: PieceDef[]): void {
    for (const p of [...this.pieces]) this.remove(p);
    for (const e of list) {
      const def = defs.find((d) => d.id === e.id);
      if (!def) continue;
      const piece = this.place(def, e.x, e.z, e.rot, e.lv ?? 0, (e.loot ?? []).map((s) => ({ ...s })));
      if (piece.def.id === 'fire') this.setFuel(piece, e.fuel);
    }
  }

  remove(p: Piece): void {
    this.group.remove(p.obj);
    this.pieces = this.pieces.filter((x) => x !== p);
  }

  setFuel(p: Piece, hours: number): void {
    p.fuel = Math.min(FIRE_MAX_FUEL, Math.max(0, hours));
    if (p.flame) p.flame.visible = p.fuel > 0;
  }

  addWood(p: Piece): void {
    this.setFuel(p, p.fuel + FUEL_PER_WOOD);
  }

  pieceAt(x: number, z: number, lv = 0): Piece | null {
    const pt = { x, z, w: 0.01, d: 0.01 };
    return this.pieces.find((p) => p.lv === lv && overlaps(pt, p.footprint)) ?? null;
  }

  nearest(x: number, z: number, range: number, kinds: string[]): Piece | null {
    let best: Piece | null = null;
    let bestD = range * range;
    for (const p of this.pieces) {
      if (!kinds.includes(p.def.id)) continue;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  resolve(pos: THREE.Vector3, r: number, level?: number): void {
    for (const p of this.pieces) {
      if (level !== undefined && p.lv !== level) continue;
      // wer höher steht als das Teil (z. B. auf der Treppe über einer Kiste), wird nicht weggeschoben
      if (level !== undefined && pos.y > p.lv * FLOOR_H + p.def.h + 0.25) continue;
      for (const b of p.colliders) pushOut(pos, r, b);
    }
  }

  isWarm(x: number, z: number): boolean {
    return this.pieces.some((p) => p.fuel > 0 && (p.x - x) ** 2 + (p.z - z) ** 2 < WARM_RADIUS ** 2);
  }

  /** Brennt Holz ab, flackert und beleuchtet. Gibt die Zahl der gerade erloschenen Feuer zurück. */
  update(hours: number, night: number, focus: THREE.Vector3, t: number): number {
    let died = 0;
    let nearest: Piece | null = null;
    let nearestD = 30 * 30;
    for (const p of this.pieces) {
      if (p.def.id !== 'fire' || p.fuel <= 0) continue;
      p.fuel -= hours;
      if (p.fuel <= 0) {
        this.setFuel(p, 0);
        died++;
        continue;
      }
      if (p.flame) p.flame.scale.set(1, 0.85 + 0.2 * Math.sin(t * 11 + p.id), 1);
      const d = (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2;
      if (d < nearestD) {
        nearestD = d;
        nearest = p;
      }
    }
    if (nearest) {
      this.light.position.set(nearest.x, 0.9, nearest.z);
      this.light.intensity = (25 + 45 * night) * (0.92 + 0.08 * Math.sin(t * 13));
    } else this.light.intensity = 0;
    return died;
  }
}

const WALLISH = new Set(['wall', 'door', 'windowwall', 'fence']);

/**
 * Rastet Wände an vorhandenen Wänden ein (Außen-/Innenwände des Hauses und eigene Teile): am Ende eines Wandstücks
 * entweder verlängernd oder im rechten Winkel. Ohne Wand in der Nähe gilt das Raster.
 */
export function snapToWalls(def: PieceDef, px: number, pz: number, rot: Rot, anchors: Box[]): { x: number; z: number; rot: Rot } {
  if (!WALLISH.has(def.id)) return { ...snapPiece(def, px, pz, rot), rot };
  const half = def.w / 2;
  let best: { x: number; z: number; rot: Rot } | null = null;
  let bd = 2.2 * 2.2;
  const test = (x: number, z: number, r: Rot): void => {
    const d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < bd) {
      bd = d;
      best = { x, z, rot: r };
    }
  };
  for (const a of anchors) {
    const horiz = a.w >= a.d;
    const len = horiz ? a.w : a.d;
    for (const sgn of [-1, 1]) {
      const ex = horiz ? a.x + (sgn * len) / 2 : a.x;
      const ez = horiz ? a.z : a.z + (sgn * len) / 2;
      // Verlängerung in gleicher Richtung
      test(horiz ? ex + sgn * half : ex, horiz ? ez : ez + sgn * half, horiz ? 0 : 1);
      // rechter Winkel nach beiden Seiten
      for (const s2 of [-1, 1]) test(horiz ? ex : ex + s2 * half, horiz ? ez + s2 * half : ez, horiz ? 1 : 0);
    }
  }
  return best ?? { ...snapPiece(def, px, pz, rot), rot };
}
