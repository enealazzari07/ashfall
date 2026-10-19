import { forestLot, parkingBeside, parkingLot, restLot, yardClutter } from './Rural';
import { Stack } from '../data/items';
import { LotRect, gardenFor, makeBuilding, pruneTouchingWalls, tryGarage } from './Buildings';
import { farmLot } from './Farm';
import { PathSlice, cellOf, cityOf, clearance, edgeAlley, edgeRoad, hf, isCityChunk, isVillageChunk, poseAt, sliceDist, slicesFor } from './WorldMap';
import { lanePose } from '../render/RoadRibbon';
import { CAR_MODEL_COUNT, Livery, modelIndex, weathered } from '../render/CarModel';

export const CHUNK = 64;
export const ROAD = 10;
export const SIDEWALK = 3;
export const FLOOR_H = 3;
const LOT = (CHUNK - ROAD - 2 * SIDEWALK) / 2; // 26 m pro Grundstück
const LOT_START = ROAD + SIDEWALK;

/** Welt: Städte (höchstens 6 × 5 Chunks) in der Natur, verbunden durch kurvige Straßen, Autobahn und Bahn (siehe WorldMap). */
export type Land = 'town' | 'village' | 'farm' | 'forest' | 'rest' | 'meadow';
export const HIGHWAY_WIDTH = 22;

export interface Box {
  x: number; z: number; w: number; d: number; // Mittelpunkt + Größe (Weltkoordinaten)
  /** Nur auf diesem Stockwerk wirksam (0 = EG, 1 = OG); fehlt = alle Stockwerke */
  lv?: number;
  /** Ausgeschaltet (z. B. geöffnete Tür): blockiert nicht */
  off?: boolean;
  /** Überkletterbar: Dauer des Kletterns in Sekunden (Zäune, Hecken) */
  climb?: number;
  /** Wand: blockiert die Sicht (Zombies sehen nicht hindurch) */
  sight?: boolean;
}

export interface PropKind {
  id: 'shelf' | 'cabinet' | 'crate' | 'chest' | 'fridge' | 'table' | 'sofa' | 'bed' | 'stove' | 'toilet' | 'sink' | 'bathtub'
    | 'wardrobe' | 'desk' | 'counter' | 'rack' | 'machine' | 'barrel' | 'nightstand' | 'tvstand' | 'locker' | 'chair' | 'car'
    | 'dresser' | 'kitchenunit' | 'washer' | 'trashcan' | 'weaponcrate' | 'weaponcase' | 'cardbox' | 'whpallet' | 'whcrates' | 'whtruck' | 'whgas' | 'whladder' | 'whtable' | 'whstool';
  name: string;
  lootable: boolean;
  w: [number, number]; // Länge entlang der Wand
  d: [number, number]; // Tiefe
  h: [number, number];
  weight: number;
  color: number;
}

export const PROP_KINDS: PropKind[] = [
  { id: 'shelf', name: 'Regal', lootable: true, w: [1.3, 1.9], d: [0.4, 0.5], h: [1.8, 2.1], weight: 34, color: 0x7a5a3a },
  { id: 'cabinet', name: 'Schrank', lootable: true, w: [0.9, 1.3], d: [0.5, 0.6], h: [1.6, 1.9], weight: 14, color: 0x5a6b7a },
  { id: 'crate', name: 'Kiste', lootable: true, w: [0.8, 1.1], d: [0.8, 1.0], h: [0.7, 0.9], weight: 9, color: 0x8b6a3e },
  { id: 'chest', name: 'Truhe', lootable: true, w: [1.0, 1.2], d: [0.55, 0.65], h: [0.6, 0.7], weight: 7, color: 0x6a4a3a },
  { id: 'fridge', name: 'Kühlschrank', lootable: true, w: [0.7, 0.8], d: [0.7, 0.8], h: [1.7, 1.9], weight: 8, color: 0xe6e8ea },
  { id: 'table', name: 'Tisch', lootable: false, w: [1.4, 1.8], d: [0.9, 1.1], h: [0.74, 0.78], weight: 9, color: 0x8a6a45 },
  { id: 'sofa', name: 'Sofa', lootable: false, w: [1.9, 2.2], d: [0.9, 1.0], h: [0.85, 0.9], weight: 6, color: 0x6b7f8c },
  { id: 'bed', name: 'Doppelbett', lootable: false, w: [2.0, 2.0], d: [1.5, 1.6], h: [0.6, 0.6], weight: 5, color: 0x9aa8c0 },
  { id: 'stove', name: 'Herd', lootable: false, w: [0.8, 0.9], d: [0.6, 0.7], h: [0.9, 0.95], weight: 5, color: 0xd8d8d8 },
  { id: 'toilet', name: 'Toilette', lootable: false, w: [0.4, 0.45], d: [0.65, 0.75], h: [0.75, 0.8], weight: 1, color: 0xf0f0ee },
  { id: 'sink', name: 'Waschbecken', lootable: true, w: [0.55, 0.7], d: [0.45, 0.5], h: [0.85, 0.9], weight: 1, color: 0xf0f0ee },
  { id: 'bathtub', name: 'Badewanne', lootable: false, w: [1.6, 1.7], d: [0.72, 0.78], h: [0.55, 0.6], weight: 1, color: 0xf2f2f0 },
  { id: 'wardrobe', name: 'Kleiderschrank', lootable: true, w: [1.1, 1.6], d: [0.55, 0.65], h: [1.9, 2.1], weight: 1, color: 0x6b5238 },
  { id: 'desk', name: 'Schreibtisch', lootable: true, w: [1.3, 1.6], d: [0.7, 0.8], h: [0.74, 0.76], weight: 1, color: 0x8a6a45 },
  { id: 'counter', name: 'Theke', lootable: true, w: [2.2, 3.4], d: [0.65, 0.75], h: [1.0, 1.08], weight: 1, color: 0x6a4a32 },
  { id: 'rack', name: 'Lagerregal', lootable: true, w: [1.8, 2.4], d: [0.55, 0.65], h: [1.9, 2.2], weight: 1, color: 0x5a6068 },
  { id: 'machine', name: 'Maschine', lootable: false, w: [1.6, 2.8], d: [1.1, 1.8], h: [1.6, 2.2], weight: 1, color: 0x4a6a7a },
  { id: 'barrel', name: 'Fass', lootable: true, w: [0.6, 0.65], d: [0.6, 0.65], h: [0.9, 1.0], weight: 1, color: 0x3a5a7a },
  { id: 'nightstand', name: 'Nachttisch', lootable: true, w: [0.42, 0.5], d: [0.38, 0.42], h: [0.48, 0.55], weight: 1, color: 0x7a5a3a },
  { id: 'tvstand', name: 'Fernsehschrank', lootable: true, w: [1.1, 1.4], d: [0.42, 0.48], h: [0.5, 0.6], weight: 1, color: 0x3a3a3e },
  { id: 'locker', name: 'Spind', lootable: true, w: [0.45, 0.55], d: [0.45, 0.5], h: [1.8, 1.95], weight: 1, color: 0x5a6a5a },
  { id: 'chair', name: 'Stuhl', lootable: false, w: [0.42, 0.48], d: [0.42, 0.48], h: [0.88, 0.92], weight: 1, color: 0x7a5a3a },
  { id: 'dresser', name: 'Kommode', lootable: true, w: [0.9, 1.2], d: [0.45, 0.5], h: [0.8, 0.9], weight: 1, color: 0x7a5a3a },
  { id: 'kitchenunit', name: 'Küchenzeile', lootable: true, w: [1.2, 1.8], d: [0.6, 0.65], h: [0.9, 0.92], weight: 1, color: 0xc8c0a8 },
  { id: 'washer', name: 'Waschmaschine', lootable: false, w: [0.6, 0.65], d: [0.6, 0.65], h: [0.85, 0.9], weight: 1, color: 0xe8eaec },
  { id: 'trashcan', name: 'Mülleimer', lootable: true, w: [0.4, 0.45], d: [0.4, 0.45], h: [0.65, 0.75], weight: 1, color: 0x3a4a3e },
  { id: 'car', name: 'Auto (Kofferraum)', lootable: true, w: [4.0, 4.4], d: [1.8, 1.95], h: [1.4, 1.5], weight: 1, color: 0x8a3a3a },
  { id: 'weaponcrate', name: 'Waffenkiste', lootable: true, w: [0.85, 0.95], d: [0.62, 0.7], h: [0.66, 0.74], weight: 0, color: 0x6b5a3a },
  { id: 'whpallet', name: 'Palette', lootable: false, w: [1.05, 1.2], d: [0.76, 1.15], h: [0.13, 0.14], weight: 0, color: 0xa88a5a },
  { id: 'whcrates', name: 'Plastikkisten', lootable: true, w: [0.4, 0.42], d: [0.3, 0.32], h: [0.26, 0.28], weight: 0, color: 0x3a6a9a },
  { id: 'whtruck', name: 'Sackkarre', lootable: false, w: [0.5, 0.52], d: [0.6, 0.65], h: [1.0, 1.05], weight: 0, color: 0x6a6e76 },
  { id: 'whgas', name: 'Gasflasche', lootable: false, w: [0.3, 0.3], d: [0.3, 0.3], h: [0.45, 0.45], weight: 0, color: 0xc8a040 },
  { id: 'whladder', name: 'Leiter', lootable: false, w: [0.49, 0.5], d: [1.0, 1.08], h: [1.7, 1.75], weight: 0, color: 0x8a8a8e },
  { id: 'whtable', name: 'Werkbank', lootable: true, w: [1.5, 1.55], d: [0.86, 0.9], h: [0.76, 0.78], weight: 0, color: 0x6a6a68 },
  { id: 'whstool', name: 'Hocker', lootable: false, w: [0.38, 0.4], d: [0.34, 0.36], h: [0.57, 0.6], weight: 0, color: 0x6a5a4a },
  { id: 'cardbox', name: 'Karton', lootable: true, w: [0.8, 0.95], d: [1.1, 1.25], h: [0.75, 0.85], weight: 0, color: 0xb89870 },
  { id: 'weaponcase', name: 'Waffenkoffer', lootable: true, w: [1.35, 1.5], d: [0.7, 0.78], h: [0.28, 0.32], weight: 0, color: 0x5a6a80 },
];

export interface Prop extends Box {
  h: number;
  color: number;
  kind: number; // Index in PROP_KINDS
  loot: Stack[];
  level: number; // Stockwerk
  yaw: number; // Blickrichtung (Front zeigt in den Raum)
  lw: number; // Länge entlang der Wand
  ld: number; // Tiefe
}

/**
 * Zwei Treppenläufe nebeneinander: Lauf A (gerade Etagen 0→1, 2→3 …) steigt entlang +u,
 * Lauf B (1→2, 3→4 …) entlang -u. Dadurch liegt der Ausstieg eines Laufs direkt neben dem Einstieg des nächsten.
 * u ist die Laufrichtung (z bei axis 'z', x bei axis 'x'), v die Querrichtung.
 */
export interface StairPlan {
  axis: 'x' | 'z';
  u0: number;
  u1: number;
  lanes: [{ v0: number; v1: number }, { v0: number; v1: number }];
  /** Innenmaße des Hauses entlang u und v (für Podeste) */
  inner: { u0: number; u1: number; v0: number; v1: number };
}

export interface Rect { x0: number; x1: number; z0: number; z1: number }

/** Grundrechteck eines Treppenlaufs in Weltkoordinaten */
export function laneRect(p: StairPlan, lane: 0 | 1): Rect {
  const l = p.lanes[lane];
  return p.axis === 'z' ? { x0: l.v0, x1: l.v1, z0: p.u0, z1: p.u1 } : { x0: p.u0, x1: p.u1, z0: l.v0, z1: l.v1 };
}

export const STAIR_RISE = FLOOR_H;

/** Höhe der Treppe über dem Boden des Stockwerks `f` (Lauf f→f+1) an (x, z); null, wenn außerhalb des Laufs. */
export function rampHeight(p: StairPlan, f: number, x: number, z: number): number | null {
  const lane = (f % 2) as 0 | 1;
  const r = laneRect(p, lane);
  if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) return null;
  const u = p.axis === 'z' ? z : x;
  let t = (u - p.u0) / (p.u1 - p.u0);
  if (lane === 1) t = 1 - t;
  return f * FLOOR_H + STAIR_RISE * Math.max(0, Math.min(1, t));
}

export interface Partition {
  level: number;
  boxes: Box[];
  lintels: Box[]; // Sturz über den Türöffnungen
  /** Türöffnungen zwischen Zimmern: Wandachse (`orient`), Lage der Wand (`c`), Mitte der Öffnung (`g`), Breite und Wanddicke */
  doors?: { orient: 'x' | 'z'; c: number; g: number; w: number; t: number }[];
}

export type BuildingKind = 'house' | 'shop' | 'office' | 'apartment' | 'hotel' | 'industry' | 'garage' | 'barn';
export type DoorStyle = 'wood' | 'panel' | 'window' | 'glass' | 'steel';
export type WallStyle = 'brick' | 'darkbrick' | 'siding' | 'plaster' | 'concrete' | 'wood' | 'stone';
export type WindowState = 'glass' | 'broken' | 'boarded' | 'shutter' | 'roll';

export interface WindowSpec {
  side: 0 | 1 | 2 | 3;
  /** Versatz der Fenstermitte von der Wandmitte, entlang der lokalen Wandachse (siehe sideFrame) */
  u: number;
  floor: number;
  w: number;
  h: number;
  /** Unterkante in Metern über dem Boden */
  y0: number;
  state: WindowState;
  lit: boolean;
  storefront: boolean;
}

export interface RoofUnit {
  kind: 'ac' | 'chimney' | 'vent' | 'tank' | 'stack' | 'dish' | 'antenna' | 'hatch' | 'skylight' | 'duct' | 'solar';
  x: number; z: number; w: number; d: number; h: number;
  /** Unterkante in Metern */
  y0: number;
}

/** Rauch- bzw. Dampfquelle (Schornstein, Lüftung, Klimagerät) */
export interface Emitter { x: number; y: number; z: number; kind: 'smoke' | 'steam' }

export type RoomType =
  | 'living' | 'kitchen' | 'bedroom' | 'bath' | 'hall' | 'corridor' | 'storage' | 'shop' | 'office'
  | 'meeting' | 'lobby' | 'hotelroom' | 'factory' | 'garage' | 'barn';
export interface Room extends Rect { level: number; type: RoomType }

export type DecorKind =
  | 'paper' | 'carton' | 'bottle' | 'can' | 'books' | 'cloth' | 'trashbag' | 'bucket' | 'rug' | 'plant' | 'picture' | 'lamp' | 'plank' | 'hay' | 'sack';

/** Kleinkram ohne Kollision: Papier, Kartons, Flaschen, Bilder, Teppiche … */
export interface Decor {
  kind: DecorKind;
  x: number; y: number; z: number;
  yaw: number;
  /** Größenfaktor */
  s: number;
  level: number;
  /** Farbvariante 0..n */
  v: number;
}

/** Klimagerät an der Außenwand */
export interface WallAc { side: 0 | 1 | 2 | 3; u: number; floor: number; y: number }

export interface BuildingSpec {
  x: number; z: number; w: number; d: number; h: number;
  floors: number;
  kind: BuildingKind;
  style: WallStyle;
  trim: number; // Farbe von Rahmen/Absätzen
  windows: WindowSpec[];
  shopName: string | null;
  /** Polizeirevier (Büro mit Waffenkisten) */
  police: boolean;
  signColor: number;
  awning: number | null;
  /** Verbarrikadiert: fast alle Fenster im Erdgeschoss zugenagelt */
  fortified: boolean;
  /** Breite der Haupttür (Garage/Fabrik: Tor) */
  doorW: number;
  /** Aussehen der Haupttür */
  doorStyle: DoorStyle;
  roofUnits: RoofUnit[];
  emitters: Emitter[];
  acs: WallAc[];
  rooms: Room[];
  decor: Decor[];
  /** Zimmerwände mit Türöffnungen, pro Etage */
  partitions: Partition[];
  /** Zufahrt (Garage) */
  driveway: Box | null;
  /** Grundstück, auf dem das Gebäude steht */
  lot: LotRect | null;
  /** Breite von Weg/Vorplatz zur Straße */
  pathW?: number;
  door: 0 | 1 | 2 | 3; // 0=+z 1=-z 2=+x 3=-x
  /**
   * Zweiter Eingang (Eckhaus zur zweiten Straße) oder Durchgang zum anderen Flügel eines L-Hauses:
   * Seite, Lage entlang der Wand (u) und ob ein Türblatt eingebaut wird (sonst offener Durchgang).
   */
  door2?: { side: 0 | 1 | 2 | 3; u: number; leaf: boolean; passage?: boolean; /** Breite der Öffnung (sonst Türbreite) */ w?: number };
  /** Weg vom zweiten Eingang zum Gehweg */
  path2?: Box | null;
  color: number;
  props: Prop[];
  roof: 'gable' | 'flat';
  ridgeX: boolean; // First verläuft entlang X
  roofColor: number;
  stairs: StairPlan | null;
  /** Weg von der Haustür bis zum Gehweg */
  path: Box | null;
}

/** Lokales Koordinatensystem einer Außenwand: Mitte der Wandachse, Richtung entlang der Wand (a) und nach außen (n). */
export interface SideFrame { cx: number; cz: number; ax: number; az: number; nx: number; nz: number; len: number }

/** Seiten: 0 = +z, 1 = -z, 2 = +x, 3 = -x. Die x-Seiten sind um die Eckpfeiler verkürzt. */
export function sideFrame(b: { x: number; z: number; w: number; d: number }, s: number): SideFrame {
  switch (s) {
    case 0: return { cx: b.x, cz: b.z + b.d / 2 - WALL / 2, ax: 1, az: 0, nx: 0, nz: 1, len: b.w };
    case 1: return { cx: b.x, cz: b.z - b.d / 2 + WALL / 2, ax: -1, az: 0, nx: 0, nz: -1, len: b.w };
    case 2: return { cx: b.x + b.w / 2 - WALL / 2, cz: b.z, ax: 0, az: -1, nx: 1, nz: 0, len: b.d - 2 * WALL };
    default: return { cx: b.x - b.w / 2 + WALL / 2, cz: b.z, ax: 0, az: 1, nx: -1, nz: 0, len: b.d - 2 * WALL };
  }
}

export interface Lamp { x: number; z: number; dx: number; dz: number } // dx/dz: Richtung zur Straße
export interface Bush { x: number; z: number; s: number; color: number }
export interface Flower { x: number; z: number; color: number }
export interface Sign { x: number; z: number; rot: number; type: 'stop' | 'name' | 'cross' | 'gantry'; text?: string }
export interface Car { x: number; z: number; rot: number; color: number; model: number; livery?: Livery; /** Verschleiß 0..3 */ tier?: number } // rot 0 = entlang X, PI/2 = entlang Z
export interface Wagon { x: number; z: number; len: number; loco: boolean; color: number; rot: number }

export interface Bench { x: number; z: number; rot: number }

export type CropKind = 'corn' | 'cornYoung' | 'cornDouble' | 'cornYoungDouble';
/** Acker mit Pflanzen */
export interface Field { x: number; z: number; w: number; d: number; crop: CropKind }
/** Zaunzug von (x0,z0) nach (x1,z1); `gate`: Nummer des Abschnitts, der ein offenes Tor bleibt (-1 = keins) */
export interface Fence { x0: number; z0: number; x1: number; z1: number; tall: boolean; gate: number; seed: number }
export interface HayPile { x: number; z: number; rot: number; kind: 'single' | 'two' | 'stack' }
export interface Sack { x: number; z: number; rot: number; crate: boolean; loot: Stack[] }
export interface Ladder { x: number; z: number; rot: number; kind: 'straight' | 'stand' | 'standBroken'; h: number }
export interface Deck { x: number; z: number; w: number; d: number; variant: 'planks' | 'hole' | 'old' }

/** Modell aus dem Retro-Urban-Kit (GLB). `solid`: blockiert den Weg. */
export interface Model { name: string; x: number; z: number; rot: number; solid?: boolean }

/** Stellplatz-Markierung (Mitte); `alongX`: Platz ist entlang z lang */
export interface Stall { x: number; z: number; alongX: boolean }

export interface ChunkSpec {
  stalls: Stall[];
  land: Land;
  /** Straße am Chunk-Anfang entlang Z (roadV) bzw. X (roadH); auf dem Land schmal ohne Gehweg */
  roadV: boolean;
  roadH: boolean;
  /** Straße an der Ost- bzw. Südkante (gehört dem Nachbarchunk, wichtig für Gehwege) */
  roadE: boolean;
  roadS: boolean;
  /** Straße am Westende der Nordkante bzw. Nordende der Westkante (Querarme der Kreuzung) */
  armW: boolean;
  armN: boolean;
  /** Schmale Gasse statt Straße (endet im Hinterhof) an der West- bzw. Nordkante */
  alleyV: boolean;
  alleyH: boolean;
  /** Straße grenzt an die Stadt (breit, mit Bordstein) statt Landstraße */
  urbanV: boolean;
  urbanH: boolean;
  /** Kurvige Straßen, Autobahn und Gleise, die diesen Chunk berühren */
  paths: PathSlice[];
  /** Asphaltflächen (Raststätte, Hof) und GLB-Modelle */
  pads: Box[];
  models: Model[];
  /** Bauernhof: Hofflächen (Erde), Felder, Zäune, Heu, Säcke, Leitern, Holzdecks */
  yards: Box[];
  fields: Field[];
  fences: Fence[];
  hay: HayPile[];
  sacks: Sack[];
  ladders: Ladder[];
  decks: Deck[];
  /** Blumenbeete vor den Häusern */
  beds: Box[];
  /** Hecken an der Grundstücksgrenze */
  hedges: Box[];
  /** Baumscheiben (Beete) um Straßenbäume auf dem Gehweg */
  pits: { x: number; z: number }[];
  benches: Bench[];
  buildings: BuildingSpec[];
  trees: { x: number; z: number; s: number }[];
  bushes: Bush[];
  flowers: Flower[];
  lamps: Lamp[];
  signs: Sign[];
  cars: Car[];
  train: Wagon[];
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function chunkSeed(cx: number, cz: number): number {
  return (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) >>> 0;
}

const COLORS = [0xd9c7a8, 0xc9b8a0, 0xb4bcc4, 0xd8b9a0, 0xa9bda4, 0xe0d4b8];
const ROOF_COLORS = [0xc4684e, 0x6f7884, 0x7d5f4c, 0x9a4b3c, 0x5b6470];
/** Verwitterte Lackfarben: ausgeblichen, matt, ein paar Rostbraune – nichts glänzt neu */
const CAR_PALETTE = [
  0x9a3a36, 0x7a2e2c, 0x3f5f8a, 0x2f4666, 0xc9c6bc, 0xb4b2a8, 0x26272b, 0x3a4a3c, 0x5c7060, 0xb59a4a, 0x8a7a5e, 0x6b4a36,
  0x7a7f86, 0x9aa0a4, 0x5a3a2c, 0x7a8a92,
];
/** Ein parkendes Auto: Modell, Lack, selten Polizei/Taxi/Krankenwagen, dazu Verschleiß */
export function newCar(r: () => number, x: number, z: number, rot: number): Car {
  const v = r();
  let model = Math.floor(r() * CAR_MODEL_COUNT);
  let color = carPaint(r);
  let livery: Livery = 'none';
  const pickOf = (ids: string[]) => modelIndex(ids[Math.floor(r() * ids.length)]);
  if (v < 0.05) {
    livery = 'police';
    model = pickOf(['sedan', 'suv', 'coupe']);
    color = 0x1d2230;
  } else if (v < 0.09) {
    livery = 'taxi';
    model = pickOf(['sedan', 'wagon']);
    color = 0xd4a82a;
  } else if (v < 0.115) {
    livery = 'ambulance';
    model = modelIndex('van');
    color = 0xe6e6e2;
  }
  const t = r();
  const tier = t < 0.35 ? 0 : t < 0.65 ? 1 : t < 0.88 ? 2 : 3;
  return { x, z, rot, color: weathered(color, livery === 'none' ? tier : Math.min(tier, 1)), model, livery, tier };
}

/** Ein Autolack mit leichter Helligkeitsstreuung (Verschmutzung, Sonne) */
export function carPaint(r: () => number): number {
  const base = CAR_PALETTE[Math.floor(r() * CAR_PALETTE.length)];
  const k = 0.82 + r() * 0.26;
  const ch = (shift: number) => Math.max(0, Math.min(255, Math.round(((base >> shift) & 255) * k)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
const BUSH_COLORS = [0x3f7a43, 0x4c8a47, 0x35693c, 0x5a8f4a];
const FLOWER_COLORS = [0xf2d03b, 0xe86f9a, 0xf4f4f4, 0xd9432f, 0x9a6bd6];
const WAGON_COLORS = [0x8a2f2f, 0x2f5a8a, 0x5f6b3a, 0x6b6b70];
export const STREET_NAMES = ['Ashfall Ave', 'Oak Street', 'Mill Road', 'Station Way', 'Hill Street', 'Birch Lane'];
export const WALL = 0.4;
const PART_T = 0.2; // Dicke der Trennwände
export const DOOR_W = 2.2;
export const DOOR_H = 2.4;
export const GARAGE_DOOR_H = 2.4;
const GAP_W = 1.3; // Durchgang in Trennwänden
const PATH_W = 1.4;
const mod6 = (n: number) => ((n % 6) + 6) % 6;

const inBox = (b: { x: number; z: number; w: number; d: number }, x: number, z: number, pad: number) =>
  Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad;

const hit = (a: Box, b: Box, shrink = 0) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 - shrink && Math.abs(a.z - b.z) < (a.d + b.d) / 2 - shrink;

interface Line {
  ax: 'x' | 'z'; // Richtung, in der die Wand verläuft
  c: number; // Koordinate der Wandfläche (senkrecht zu ax)
  a0: number;
  a1: number;
  n: 1 | -1; // Richtung in den Raum
}

const hash2 = (x: number, z: number) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t: number) => t * t * (3 - 2 * t);
function vnoise(x: number, z: number): number {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = smooth(x - x0), fz = smooth(z - z0);
  const a = hash2(x0, z0), b = hash2(x0 + 1, z0), c = hash2(x0, z0 + 1), d = hash2(x0 + 1, z0 + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/**
 * 0 = Vorort, 1 = Innenstadt. Das Zentrum liegt nahe dem Startpunkt und franst mit Rauschen aus,
 * so dass es Hochhausviertel, Geschäftsstraßen und Wohngebiete gibt.
 */
export function urbanity(cx: number, cz: number): number {
  const c = cityOf(cellOf(cx, cz).rx, cellOf(cx, cz).rz);
  const d2 = ((cx + 0.5 - (c.cx0 + c.w / 2)) / (c.w / 4)) ** 2 + ((cz + 0.5 - (c.cz0 + c.h / 2)) / (c.h / 4)) ** 2;
  const core = Math.exp(-d2 * 0.5);
  const n = vnoise(cx / 2.2 + 7.1, cz / 2.2 + 3.3) * 0.7 + vnoise(cx / 0.9 + 1.7, cz / 0.9 + 8.8) * 0.3;
  return Math.max(0, Math.min(1, core * 0.85 + n * 0.2));
}

export function pick<T>(r: () => number, a: T[]): T {
  return a[Math.floor(r() * a.length)];
}

export type Zone = 'downtown' | 'mixed' | 'residential' | 'industrial' | 'farm';

/** Stadtviertel: Innenstadt um den Start, dazu Mischgebiete, Wohngebiete und Industrie. */
export function zoneOf(cx: number, cz: number): Zone {
  const u = urbanity(cx, cz);
  const ind = vnoise(cx / 2.6 + 31.7, cz / 2.6 + 12.9);
  if (u > 0.66) return 'downtown';
  if (u > 0.3) return ind > 0.6 ? 'industrial' : 'mixed';
  return ind > 0.7 ? 'industrial' : 'residential';
}

/** Landschaft: Stadtchunks, sonst Wald, Wiese, Felder mit Höfen und einzelne Raststätten. */
export function landOf(cx: number, cz: number): Land {
  if (isCityChunk(cx, cz)) return 'town';
  if (isVillageChunk(cx, cz)) return 'village';
  if (hash2(cx * 7 + 3, cz * 13 + 1) < 0.05) return 'rest';
  const a = vnoise(cx / 2.6 + 88.3, cz / 2.6 + 41.7);
  return a > 0.6 ? 'farm' : a < 0.34 ? 'meadow' : 'forest';
}

/** Deterministisch: gleiche Chunk-Koordinaten ergeben immer dieselbe Welt. */
export function generateChunk(cx: number, cz: number): ChunkSpec {
  const r = rng(chunkSeed(cx, cz));
  const ox = cx * CHUNK, oz = cz * CHUNK;
  const land = landOf(cx, cz);
  const roadV = edgeRoad('W', cx, cz), roadH = edgeRoad('N', cx, cz);
  const roadE = edgeRoad('W', cx + 1, cz), roadS = edgeRoad('N', cx, cz + 1);
  const slices = slicesFor(cx, cz);
  const spec: ChunkSpec = {
    land, stalls: [], roadV, roadH, roadE, roadS,
    armW: edgeRoad('N', cx - 1, cz), armN: edgeRoad('W', cx, cz - 1),
    alleyV: edgeAlley('W', cx, cz), alleyH: edgeAlley('N', cx, cz),
    urbanV: isCityChunk(cx, cz) || isCityChunk(cx - 1, cz), urbanH: isCityChunk(cx, cz) || isCityChunk(cx, cz - 1),
    paths: slices, pads: [], models: [], yards: [], fields: [], fences: [], hay: [], sacks: [], ladders: [], decks: [], beds: [], hedges: [], pits: [], benches: [], buildings: [], trees: [], bushes: [], flowers: [], lamps: [], signs: [], cars: [], train: [],
  };

  const addCar = (x: number, z: number, rot: number) => {
    if (spec.cars.some((c) => Math.hypot(c.x - x, c.z - z) < 6)) return;
    spec.cars.push(newCar(r, x, z, rot));
  };

  const blvd = slices.filter((sl) => sl.path.kind === 'boulevard');
  const blocked = (lot: Box, pad: number, list: PathSlice[] = slices): boolean => {
    if (!list.length) return false;
    for (const u of [-0.5, -0.25, 0, 0.25, 0.5]) {
      for (const v of [-0.5, -0.25, 0, 0.25, 0.5]) if (clearance(list, lot.x + u * lot.w, lot.z + v * lot.d) < pad) return true;
    }
    return false;
  };
  /** Grundstück, das die Hauptstraße geschluckt hat: kleiner Park */
  const parkBlock = (lot: Box) => {
    const n = 5 + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) spec.trees.push({ x: lot.x + (r() - 0.5) * (lot.w - 3), z: lot.z + (r() - 0.5) * (lot.d - 3), s: 0.8 + r() * 0.7 });
    for (let k = 0; k < 6; k++) spec.flowers.push({ x: lot.x + (r() - 0.5) * (lot.w - 4), z: lot.z + (r() - 0.5) * (lot.d - 4), color: FLOWER_COLORS[Math.floor(r() * FLOWER_COLORS.length)] });
    if (r() < 0.6) spec.benches.push({ x: lot.x + (r() - 0.5) * 8, z: lot.z + (r() - 0.5) * 8, rot: r() * 6.28 });
  };

  /** Dorfgrundstück: Haus mit der Tür zur Landstraße, sonst Wiese mit Bäumen */
  const villageLot = (lot: LotRect) => {
    let best = Infinity, bs = 0, bsl: PathSlice | null = null;
    for (const sl of slices) {
      if (sl.path.kind !== 'country') continue;
      const q = sliceDist(sl, lot.x, lot.z);
      if (q.d < best) {
        best = q.d;
        bs = q.s;
        bsl = sl;
      }
    }
    if (!bsl || best < 15 || best > 70 || blocked(lot, 2)) {
      forestLot(r, spec, lot, 0.3);
      return;
    }
    const ps = poseAt((bsl as PathSlice).path, bs);
    const vx = ps.x - lot.x, vz = ps.z - lot.z;
    const door = (Math.abs(vx) > Math.abs(vz) ? (vx > 0 ? 2 : 3) : vz > 0 ? 0 : 1) as 0 | 1 | 2 | 3;
    const b = makeBuilding(r, lot, door, 'residential', 0.2);
    spec.buildings.push(b);
    for (let k = 0; k < 3; k++) {
      spec.bushes.push({ x: lot.x + (r() - 0.5) * (lot.w - 4), z: lot.z + (r() - 0.5) * (lot.d - 4), s: 0.6 + r() * 0.5, color: BUSH_COLORS[Math.floor(r() * BUSH_COLORS.length)] });
    }
    if (r() < 0.5) spec.trees.push({ x: lot.x + (r() - 0.5) * (lot.w - 6), z: lot.z + (r() - 0.5) * (lot.d - 6), s: 0.9 + r() * 0.5 });
    if (r() < 0.4) parkingBeside(r, spec, lot, b, b.path ? [b.path] : [], 2);
  };

  // Gassen enden in einem Hinterhof mit Müllcontainer und Paletten
  if (spec.alleyV) {
    spec.pads.push({ x: ox + 5, z: oz + 50, w: 8, d: 8 });
    spec.models.push({ name: 'pallet', x: ox + 2.6, z: oz + 48, rot: r() * 3 });
  }
  if (spec.alleyH) {
    spec.pads.push({ x: ox + 50, z: oz + 5, w: 8, d: 8 });
    spec.models.push({ name: 'pallet', x: ox + 48, z: oz + 2.6, rot: r() * 3 });
  }

  {
    const urb = urbanity(cx, cz);
    const zone: Zone = land === 'town' ? zoneOf(cx, cz) : 'farm';
    const fill = zone === 'downtown' ? 0.95 : zone === 'mixed' ? 0.85 : zone === 'industrial' ? 0.8 : land === 'village' ? 0.5 : 0.7;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const lx = ox + LOT_START + i * LOT, lz = oz + LOT_START + j * LOT;
        const lotRect = { x: lx + LOT / 2, z: lz + LOT / 2, w: LOT, d: LOT };
        if (land === 'village') {
          villageLot(lotRect);
          continue;
        }
        if (land !== 'town') {
          if (land === 'rest' && !blocked(lotRect, 5)) restLot(r, spec, lotRect, i, j);
          else if (land === 'farm' && !blocked(lotRect, 7)) farmLot(r, spec, lotRect, i, j);
          else forestLot(r, spec, lotRect, land === 'meadow' || land === 'farm' ? 0.2 : 1);
          continue;
        }
        const spawnLot = cx === 0 && cz === 0 && i === 0 && j === 0;
        if (!spawnLot && blocked(lotRect, 4, blvd)) {
          parkBlock(lotRect);
          continue;
        }
        if (spawnLot || r() < fill) {
          // Tür zeigt zu einer der beiden Seiten des Grundstücks, an denen ein Gehweg liegt
          const roadSides = [i === 0 ? 3 : 2, j === 0 ? 1 : 0];
          const door = roadSides[r() < 0.5 ? 0 : 1] as 0 | 1 | 2 | 3;
          // Manche Grundstücke werden geteilt: schmale Häuserreihe entlang der Straße
          const split = (zone === 'downtown' || zone === 'mixed') && r() < 0.5;
          const lots: LotRect[] = split
            ? door <= 1
              ? [{ x: lx + LOT / 4, z: lz + LOT / 2, w: LOT / 2, d: LOT }, { x: lx + (LOT * 3) / 4, z: lz + LOT / 2, w: LOT / 2, d: LOT }]
              : [{ x: lx + LOT / 2, z: lz + LOT / 4, w: LOT, d: LOT / 2 }, { x: lx + LOT / 2, z: lz + (LOT * 3) / 4, w: LOT, d: LOT / 2 }]
            : [{ x: lx + LOT / 2, z: lz + LOT / 2, w: LOT, d: LOT }];
          // Bauformen (ohne Zufallsstrom, nur aus den Koordinaten): Reihenhäuser, L-Häuser (zwei Flügel um die Ecke) und Eckhäuser mit zwei Eingängen
          interface Plan { lot: LotRect; door: 0 | 1 | 2 | 3; tight: boolean; joinPrev?: boolean; force?: NonNullable<Parameters<typeof makeBuilding>[5]> }
          let plans: Plan[] = lots.map((lot) => ({ lot, door, tight: false }));
          const hz = hash2(cx * 31 + i * 7 + 5, cz * 17 + j * 11 + 3);
          const fullLot: LotRect = { x: lx + LOT / 2, z: lz + LOT / 2, w: LOT, d: LOT };
          if (!split && !spawnLot && zone !== 'industrial') {
            if (hz < 0.14) {
              // L-Haus: Flügel A an der Querstraße, Flügel B an der Längsstraße, dazwischen ein Durchgang
              const dA = 9.5 + hash2(cx * 5 + i, cz * 3 + j) * 2;
              const wB = 10 + hash2(cx * 3 + j, cz * 5 + i) * 3;
              const bd = LOT - dA;
              const A: LotRect = { x: lx + LOT / 2, z: j === 0 ? lz + dA / 2 : lz + LOT - dA / 2, w: LOT, d: dA };
              const B: LotRect = { x: i === 0 ? lx + wB / 2 : lx + LOT - wB / 2, z: j === 0 ? lz + dA + bd / 2 : lz + bd / 2, w: wB, d: bd };
              const kind = zone === 'downtown' ? 'apartment' : 'house';
              const sideA = (j === 0 ? 0 : 1) as 0 | 1, sideB = (j === 0 ? 1 : 0) as 0 | 1;
              const uA = (B.x - A.x) * (sideA === 0 ? 1 : -1);
              // ein einziges Haus: gleiche Höhe, Fassade und Dach, innen ein breiter offener Durchgang statt einer Tür
              plans = [
                { lot: A, door: (j === 0 ? 1 : 0) as 0 | 1, tight: true, force: { exact: true, kind, pathLot: fullLot, door2: { side: sideA, u: uA, leaf: false, passage: true, w: 2.4 } } },
                { lot: B, door: (i === 0 ? 3 : 2) as 2 | 3, tight: true, joinPrev: true, force: { exact: true, kind, pathLot: fullLot, door2: { side: sideB, u: 0, leaf: false, passage: true, w: 2.4 } } },
              ];
              // Der Winkel zwischen den Flügeln wird Garten
              const nx0 = i === 0 ? lx + wB : lx, nx1 = i === 0 ? lx + LOT : lx + LOT - wB;
              const nz0 = j === 0 ? lz + dA : lz, nz1 = j === 0 ? lz + LOT : lz + LOT - dA;
              for (let k = 0; k < 3; k++) {
                const gx = nx0 + 1.5 + hash2(cx * 11 + k, cz * 13 + i) * Math.max(0.1, nx1 - nx0 - 3);
                const gz = nz0 + 1.5 + hash2(cx * 17 + k, cz * 19 + j) * Math.max(0.1, nz1 - nz0 - 3);
                if (k === 0) spec.trees.push({ x: gx, z: gz, s: 0.8 + hash2(k + 3, cx + cz) * 0.5 });
                else spec.bushes.push({ x: gx, z: gz, s: 0.6 + hash2(k + 9, cx * 3 + cz) * 0.4, color: BUSH_COLORS[(k + i + j) % BUSH_COLORS.length] });
              }
            } else if (zone === 'residential' && hz < 0.34) {
              // Reihenhäuser: drei schmale Häuser Wand an Wand entlang der Straße
              const depth = 14, front = 1.5;
              plans = [0, 1, 2].map((k): Plan => {
                const rect: LotRect = door <= 1
                  ? { x: lx + ((k + 0.5) * LOT) / 3, z: door === 1 ? lz + depth / 2 + front : lz + LOT - depth / 2 - front, w: LOT / 3, d: depth }
                  : { x: door === 2 ? lx + LOT - depth / 2 - front : lx + depth / 2 + front, z: lz + ((k + 0.5) * LOT) / 3, w: depth, d: LOT / 3 };
                return { lot: rect, door, tight: true, force: { exact: true, kind: 'house', pathLot: fullLot } };
              });
            } else if (hz > 0.62) {
              // Eckhaus: zweiter Eingang an der anderen Straße
              const other = roadSides.find((sd) => sd !== door) as 0 | 1 | 2 | 3;
              plans[0].force = { door2: { side: other, u: 0, leaf: true }, pathLot: lots[0] };
            }
          }
          for (const plan of plans) {
            const lot = plan.lot;
            const door = plan.door;
            const b = makeBuilding(r, lot, door, zone, urb, plan.joinPrev ? { ...plan.force, copy: spec.buildings[spec.buildings.length - 1] } : plan.force);
            spec.buildings.push(b);
            let garage: BuildingSpec | null = null;
            if (b.kind === 'house' && !split && !plan.tight && r() < 0.55) {
              garage = tryGarage(r, lot, b, door);
              if (garage) spec.buildings.push(garage);
            }
            // Stellplätze neben dem Gebäude (nie auf Weg, Einfahrt oder Garage)
            if ((!split || b.kind === 'shop') && !plan.tight) {
              const avoid: Box[] = [];
              if (b.path) avoid.push(b.path);
              if (garage) avoid.push(garage);
              if (garage?.driveway) avoid.push(garage.driveway);
              if (b.driveway) avoid.push(b.driveway);
              const want = b.kind === 'house' ? (garage ? 0 : 0.35) : b.kind === 'apartment' ? 0.8 : 0.7;
              if (r() < want) parkingBeside(r, spec, lot, b, avoid, b.kind === 'house' ? 2 : 99);
            }
            // Pflanzbeete (Kübel) neben dem Eingang von Geschäften, Hotels und Büros
            if (b.kind === 'shop' || b.kind === 'hotel' || b.kind === 'office') {
              const fr = sideFrame(b, door);
              for (const side of [-1, 1]) {
                const u = side * (b.doorW / 2 + 1.1);
                const bed: Box = { x: fr.cx + fr.ax * u + fr.nx * (WALL / 2 + 0.75), z: fr.cz + fr.az * u + fr.nz * (WALL / 2 + 0.75), w: 1.0, d: 1.0 };
                spec.beds.push(bed);
                spec.bushes.push({ x: bed.x, z: bed.z, s: 0.55 + r() * 0.2, color: BUSH_COLORS[Math.floor(r() * BUSH_COLORS.length)] });
              }
            }
            // Sträucher am Haussockel (Wohnhäuser und Mehrfamilienhäuser)
            if ((b.kind === 'house' || b.kind === 'apartment') && zone !== 'downtown' && !plan.tight) {
              for (let s = 0; s < 4; s++) {
                const fr = sideFrame(b, s);
                for (let u = -fr.len / 2 + 1; u < fr.len / 2 - 0.8; u += 2.6 + r() * 1.8) {
                  if (s === door && Math.abs(u) < (b.pathW ?? 1.4) / 2 + 1.6) continue;
                  const px = fr.cx + fr.ax * u + fr.nx * (WALL / 2 + 0.65), pz = fr.cz + fr.az * u + fr.nz * (WALL / 2 + 0.65);
                  if (garage && inBox(garage, px, pz, 1.2)) continue;
                  spec.bushes.push({ x: px, z: pz, s: 0.5 + r() * 0.45, color: BUSH_COLORS[Math.floor(r() * BUSH_COLORS.length)] });
                }
              }
            }
            if (b.kind !== 'house' || plan.tight) continue; // nur freistehende Wohnhäuser haben Vorgärten
            const garden = gardenFor(r, b, lot, door, garage);
            spec.beds.push(...garden.beds);
            spec.hedges.push(...garden.hedges);
            for (const f of garden.flowers) spec.flowers.push({ x: f.x, z: f.z, color: FLOWER_COLORS[Math.floor(r() * FLOWER_COLORS.length)] });
            // Büsche und Blumenbeete rund ums Haus, nie auf dem Weg
            const blocked = (x: number, z: number, pad: number) =>
              inBox(b, x, z, pad) || (b.path !== null && inBox(b.path, x, z, 1.0)) ||
              (garage !== null && (inBox(garage, x, z, 1.5) || (garage.driveway !== null && inBox(garage.driveway, x, z, 1.0))));
            for (let k = 0; k < 3 + Math.floor(r() * 4); k++) {
              const x = lot.x - lot.w / 2 + 1.5 + r() * (lot.w - 3), z = lot.z - lot.d / 2 + 1.5 + r() * (lot.d - 3);
              if (blocked(x, z, 2.2)) continue;
              spec.bushes.push({ x, z, s: 0.7 + r() * 0.7, color: BUSH_COLORS[Math.floor(r() * BUSH_COLORS.length)] });
            }
            if (r() < 0.6) {
              const bx = lot.x - lot.w / 2 + 2 + r() * (lot.w - 4), bz = lot.z - lot.d / 2 + 2 + r() * (lot.d - 4);
              if (!blocked(bx, bz, 2.2)) {
                for (let k = 0; k < 7; k++) {
                  spec.flowers.push({ x: bx + (r() - 0.5) * 1.6, z: bz + (r() - 0.5) * 1.6, color: FLOWER_COLORS[Math.floor(r() * FLOWER_COLORS.length)] });
                }
              }
            }
          }
        } else {
          if (zone !== 'residential' && r() < 0.45) {
            parkingLot(r, spec, lotRect);
            continue;
          }
          if (zone === 'industrial') {
            yardClutter(r, spec, lotRect);
            continue;
          }
          if (land === 'town' && r() < 0.35) {
            spec.models.push({ name: 'pallet', x: lotRect.x + (r() - 0.5) * 14, z: lotRect.z + (r() - 0.5) * 14, rot: r() * 6 });
          }
          const n = zone === 'downtown' ? 2 + Math.floor(r() * 3) : 4 + Math.floor(r() * 6);
          for (let k = 0; k < n; k++) {
            spec.trees.push({ x: lx + 1.5 + r() * (LOT - 3), z: lz + 1.5 + r() * (LOT - 3), s: 0.8 + r() * 0.8 });
          }
        }
      }
    }

    // Häuser, die Wand an Wand stehen (Reihenhäuser, Flügel eines L-Hauses), haben dort keine Fenster
    pruneTouchingWalls(spec.buildings);

    // Straßenlaternen auf den straßennahen Gehwegen, Straßenbäume auf den fernen (nur in der Stadt)
    if (land === 'town') {
      for (let k = 0; k < 3; k++) {
        const t = ROAD + 8 + k * 18;
        if (roadH) spec.lamps.push({ x: ox + t, z: oz + ROAD + 0.7, dx: 0, dz: -1 });
        if (roadV) spec.lamps.push({ x: ox + ROAD + 0.7, z: oz + t, dx: -1, dz: 0 });
        // Baumscheiben: Beet mit Einfassung um jeden Straßenbaum
        if (roadS) {
          spec.trees.push({ x: ox + t + 7, z: oz + CHUNK - SIDEWALK / 2, s: 0.8 });
          spec.pits.push({ x: ox + t + 7, z: oz + CHUNK - SIDEWALK / 2 });
        }
        if (roadE) {
          spec.trees.push({ x: ox + CHUNK - SIDEWALK / 2, z: oz + t + 7, s: 0.8 });
          spec.pits.push({ x: ox + CHUNK - SIDEWALK / 2, z: oz + t + 7 });
        }
      }
      // Sitzbänke auf dem Gehweg an der Straße (zwischen den Laternen)
      if (zone !== 'industrial' && roadH) {
        for (const bx of [25, 43]) {
          if (r() < 0.55) spec.benches.push({ x: ox + bx, z: oz + ROAD + 1.3, rot: Math.PI });
        }
      }

      // Schilder: Stop + Straßennamen an den Kreuzungsecken (nur wo wirklich eine Kreuzung ist)
      const nameV = STREET_NAMES[mod6(cx)], nameH = STREET_NAMES[mod6(cz + 3)];
      const corners: [number, number][] = [];
      if (roadH && roadV) corners.push([ROAD + 0.7, ROAD + 0.7]);
      if (roadE && roadS && edgeRoad('W', cx + 1, cz + 1) && edgeRoad('N', cx + 1, cz + 1)) corners.push([CHUNK - 0.7, CHUNK - 0.7]);
      for (const [sx, sz] of corners) {
        spec.signs.push({ x: ox + sx, z: oz + sz, rot: Math.PI / 4, type: 'stop' });
        spec.signs.push({ x: ox + sx, z: oz + sz, rot: 0, type: 'name', text: nameH });
        spec.signs.push({ x: ox + sx, z: oz + sz, rot: Math.PI / 2, type: 'name', text: nameV });
      }
    }

    // Modelle aus dem Retro-Urban-Kit: Straßenbäume, Lampen, Bänke, Absperrungen, parkende Lkw
    if (land === 'town') {
      for (let k = 0; k < 3; k++) {
        const t = ROAD + 4 + k * 18;
        // gleiche Laternen und Bänke wie auf der Nordseite (leuchten nachts), nicht die Kit-Modelle
        if (roadS) spec.lamps.push({ x: ox + t + 9, z: oz + CHUNK - 0.7, dx: 0, dz: 1 });
        if (roadE) spec.lamps.push({ x: ox + CHUNK - 0.7, z: oz + t + 9, dx: 1, dz: 0 });
        if (roadS && r() < 0.3) spec.benches.push({ x: ox + t + 4, z: oz + CHUNK - 1.5, rot: 0 });
      }
      if (roadH && roadV && r() < 0.4) {
        spec.models.push({ name: 'detail-barrier-type-a', x: ox + ROAD + 2.2, z: oz + ROAD + 1.2, rot: 0, solid: true });
        spec.models.push({ name: 'detail-barrier-type-b', x: ox + ROAD + 4.4, z: oz + ROAD + 1.2, rot: 0, solid: true });
      }
    }

    // Geparkte Autos auf den Fahrbahnen (nie auf der Spawn-Kreuzung)
    for (let k = 0; k < Math.floor(r() * (land === 'town' ? 3 + urb * 5 : 0)); k++) {
      // Rechtsverkehr: Autos stehen in Fahrtrichtung ihres Fahrstreifens (gleiche Zufallsfolge wie zuvor)
      if (roadH && (r() < 0.5 || !roadV)) {
        const x = ox + 16 + r() * 44, north = r() < 0.5;
        addCar(x, oz + (north ? ROAD * 0.27 : ROAD * 0.73), north ? Math.PI : 0);
      } else if (roadV) {
        const west = r() < 0.5;
        addCar(ox + (west ? ROAD * 0.27 : ROAD * 0.73), oz + 16 + r() * 44, west ? -Math.PI / 2 : Math.PI / 2);
      }
    }
  }

  // --- Pfade: Verkehr, Portale, Bäume am Rand, Züge ---
  const inChunk = (x: number, z: number) => x >= ox && x < ox + CHUNK && z >= oz && z < oz + CHUNK;
  for (const sl of slices) {
    const pth = sl.path;
    const s0 = pth.cum[sl.i0], s1 = pth.cum[sl.i1];
    const sd = [...pth.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
    if (pth.kind === 'highway') {
      for (const off of [3.25, 6.75, -3.25, -6.75]) {
        for (let q = Math.ceil(s0 / 26) * 26; q <= s1; q += 26) {
          if (r() > 0.12) continue;
          const lp = lanePose(pth, q + r() * 20, off);
          if (inChunk(lp.x, lp.z)) addCar(lp.x, lp.z, off < 0 ? lp.rot + Math.PI : lp.rot);
        }
      }
      for (let q = Math.ceil(s0 / 640) * 640; q <= s1; q += 640) {
        const ps = poseAt(pth, q);
        if (inChunk(ps.x, ps.z)) spec.signs.push({ x: ps.x, z: ps.z, rot: Math.atan2(-ps.tz, ps.tx), type: 'gantry' });
      }
    }
    if (pth.kind === 'highway' || pth.kind === 'rail') {
      for (let q = Math.ceil(s0 / 9) * 9; q <= s1; q += 9) {
        for (const side of [-1, 1]) {
          if (r() > 0.55) continue;
          const lp = lanePose(pth, q, side * (pth.width / 2 + 6 + r() * 16));
          if (inChunk(lp.x, lp.z)) spec.trees.push({ x: lp.x, z: lp.z, s: 0.9 + r() * 0.7 });
        }
      }
    }
    if (pth.kind === 'rail') {
      // Gelegentlich steht ein Zug auf Gleis 1 (mit Lücken zum Durchlaufen)
      for (let w = Math.floor(s0 / 512); w * 512 <= s1; w++) {
        if (hf(sd, w, 77) > 0.5) continue;
        let q = w * 512 + 60 + hf(sd, w, 78) * 150;
        const n = 2 + Math.floor(hf(sd, w, 79) * 3);
        for (let k = 0; k < n; k++) {
          const loco = k === 0 && hf(sd, w, 80) < 0.5;
          const len = loco ? 10 : 12;
          const lp = lanePose(pth, q + len / 2, -2.5);
          if (inChunk(lp.x, lp.z)) spec.train.push({ x: lp.x, z: lp.z, len, loco, color: loco ? 0xb5392c : WAGON_COLORS[Math.floor(r() * WAGON_COLORS.length)], rot: lp.rot });
          q += len + 4;
        }
      }
    }
    if (pth.kind === 'country') {
      for (let q = Math.ceil(s0 / 70) * 70; q <= s1; q += 70) {
        if (r() > 0.18) continue;
        const side = r() < 0.5 ? -1 : 1;
        const lp = lanePose(pth, q, side * (pth.width / 2 - 1.8));
        if (inChunk(lp.x, lp.z)) addCar(lp.x, lp.z, side < 0 ? lp.rot + Math.PI : lp.rot);
      }
    }
    if (pth.kind === 'ramp' || pth.kind === 'service') {
      // Einbahnstraße: alle Autos fahren in Pfadrichtung; auf der Servicespur stehen Autos zum Parken
      for (let q = Math.ceil(s0 / 40) * 40; q <= s1; q += 40) {
        if (r() > (pth.kind === 'service' ? 0.5 : 0.12)) continue;
        if (q < 70 || q > pth.len - 70) continue;
        const lp = lanePose(pth, q, pth.kind === 'service' ? 0.2 : 0);
        if (inChunk(lp.x, lp.z)) addCar(lp.x, lp.z, lp.rot);
      }
    }
    if (pth.kind === 'boulevard' || (pth.kind === 'country' && land === 'village')) {
      for (let q = Math.ceil(s0 / 26) * 26; q <= s1; q += 26) {
        for (const side of [-1, 1]) {
          const lp = lanePose(pth, q, side * (pth.width / 2 + 1.6));
          if (inChunk(lp.x, lp.z)) spec.lamps.push({ x: lp.x, z: lp.z, dx: -side * Math.sin(lp.rot), dz: -side * Math.cos(lp.rot) });
        }
      }
    }
  }
  // nichts auf Fahrbahnen und Gleisen
  if (slices.length) {
    const ok = (x: number, z: number, pad: number) => clearance(slices, x, z) >= pad;
    spec.trees = spec.trees.filter((t) => ok(t.x, t.z, 2));
    spec.bushes = spec.bushes.filter((t) => ok(t.x, t.z, 1.4));
    spec.flowers = spec.flowers.filter((t) => ok(t.x, t.z, 1));
    spec.models = spec.models.filter((m) => ok(m.x, m.z, 1.6));
    spec.lamps = spec.lamps.filter((l) => ok(l.x, l.z, -1.2));
  }
  return spec;
}

/** Tür-Position (Mitte der Türöffnung) und Ausrichtung: lokal +x entlang der Wand, -z = ins Haus hinein. */
export function doorPlacement(b: BuildingSpec, side: 0 | 1 | 2 | 3 = b.door, u = 0): { x: number; z: number; rot: number } {
  const fr = sideFrame(b, side);
  const rot = side === 0 ? 0 : side === 1 ? Math.PI : side === 2 ? Math.PI / 2 : -Math.PI / 2;
  return { x: fr.cx + fr.ax * u, z: fr.cz + fr.az * u, rot };
}

/** Innenmaße (ohne Außenwände) */
export function innerRect(b: BuildingSpec): { x0: number; x1: number; z0: number; z1: number } {
  return { x0: b.x - b.w / 2 + WALL, x1: b.x + b.w / 2 - WALL, z0: b.z - b.d / 2 + WALL, z1: b.z + b.d / 2 - WALL };
}

/**
 * Zerlegt die Außenwände in Boxen. `withDoor` lässt im Erdgeschoss die Türöffnung frei;
 * obere Stockwerke haben durchgehende Wände.
 */
export function buildingWalls(b: BuildingSpec, withDoor = true): Box[] {
  const boxes: Box[] = [];
  const sides: { axis: 'x' | 'z'; sign: 1 | -1; id: number }[] = [
    { axis: 'z', sign: 1, id: 0 }, { axis: 'z', sign: -1, id: 1 },
    { axis: 'x', sign: 1, id: 2 }, { axis: 'x', sign: -1, id: 3 },
  ];
  for (const s of sides) {
    const alongZ = s.axis === 'z'; // Wand verläuft entlang X, wenn sie bei ±z liegt
    const len = alongZ ? b.w : b.d;
    const cx = alongZ ? b.x : b.x + s.sign * (b.w / 2 - WALL / 2);
    const cz = alongZ ? b.z + s.sign * (b.d / 2 - WALL / 2) : b.z;
    const make = (off: number, l: number): Box =>
      alongZ ? { x: cx + off, z: cz, w: l, d: WALL, sight: true } : { x: cx, z: cz + off, w: WALL, d: l, sight: true };
    // Lücken (Haupttür, zweiter Eingang) als Mitte entlang der Wand in Weltrichtung und Breite
    const fr = sideFrame(b, s.id);
    const gaps: { off: number; w: number }[] = [];
    if (withDoor && s.id === b.door) gaps.push({ off: 0, w: b.doorW });
    if (withDoor && b.door2 && s.id === b.door2.side) gaps.push({ off: b.door2.u * (alongZ ? fr.ax : fr.az), w: b.door2.w ?? b.doorW });
    if (!gaps.length) {
      boxes.push(make(0, len));
    } else {
      let cur = -len / 2;
      for (const g of gaps.sort((p, q) => p.off - q.off)) {
        if (g.off - g.w / 2 - cur > 0.02) boxes.push(make((cur + g.off - g.w / 2) / 2, g.off - g.w / 2 - cur));
        cur = g.off + g.w / 2;
      }
      if (len / 2 - cur > 0.02) boxes.push(make((cur + len / 2) / 2, len / 2 - cur));
    }
  }
  return boxes;
}
