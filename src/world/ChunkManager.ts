import * as THREE from 'three';
import { worldMesh, worldModelsReady } from '../render/WorldModels';
import {
  Box, BuildingSpec, CHUNK, ChunkSpec, DOOR_H, FLOOR_H, Room, PROP_KINDS, WALL, buildingWalls, doorPlacement, generateChunk, sideFrame,
} from './CityGenerator';
import { Stack } from '../data/items';
import { overlaps, pushOut } from './collision';
import { CLIMB_SECONDS, MAX_PLANKS, WinState, WindowHit, addPlank, initialWindow, isDynamicWindow, removePlank, strikeWindow as hitWindow, syncBox } from './Windows';
import { CarSet, buildTerrain, carKey, takenCars } from './ChunkBuilder';
import { FACTIONS } from '../data/factions';
import { buildCamp } from '../factions/Camp';
import { gableRoof } from './roofs';
import { makeBox, planeXZ } from '../render/geo';
import { mats } from '../render/Materials';
import { glassTexture } from '../render/Textures';
import { Facade, SideView, buildFacade } from './Facade';
import { createSmoke } from '../render/Smoke';
import { roofUnitGeometry } from './RoofParts';
import { buildFarm } from './FarmBuilder';
import { buildLevel, wallSections } from './Interior';
import { NavChunk, NavGrid } from './Nav';
import { Car, rampHeight } from './CityGenerator';

const LOAD_RADIUS = 1;
const UNLOAD_RADIUS = 2;
/** So viele neue Chunks pro Frame: verteilt die Last beim Laufen */
const LOADS_PER_FRAME = 1;
const DOOR_ANGLE = 1.5; // rad, Tür schwingt ins Haus hinein
const WALL_T = 0.4;
/** Wände zur Kamera hin sinken auf ein Drittel ihrer Höhe */
const CUT_DROP = 2 / 3;
/** Ab diesem Abstand zum Grundriss werden obere Etagen mit echten Wänden aufgebaut */
const NEAR_BUILD = 9;

export interface DoorView {
  pivot: THREE.Group;
  sliding: boolean;
  x: number;
  z: number;
  open: number; // 0..1
  /** Soll offen sein? Wird nur per Klick geändert. */
  wanted: boolean;
  /** Kollisionsbox, solange die Tür zu ist */
  plug: Box;
  key: string;
  /** Haltbarkeit: Zombies schlagen die Tür ein */
  hp: number;
  broken: boolean;
  /** Risse im Türblatt (erscheinen mit dem Schaden) */
  cracks: THREE.Object3D[];
  /** Restdauer des Wackelns nach einem Schlag */
  shake: number;
  fell: boolean;
  /** Abgerissen: Türblatt ist weg, der Durchgang bleibt offen */
  torn: boolean;
  /** abgeschlossen: öffnet sich erst mit Dietrich oder Gewalt */
  locked: boolean;
  /** Tür zwischen zwei Zimmern im Erdgeschoss (nicht die Haustür) */
  inner?: boolean;
}

/** Ein gebautes Stockwerk: Innenleben + echte Außenwände */
interface LevelView {
  interior: THREE.Group;
  sides: SideView[];
  rooms: { room: Room; mats: THREE.MeshStandardMaterial[]; dim: boolean }[];
  walls: { x: number; z: number; high: THREE.Object3D }[];
  /** Kollisionsboxen dieser Etage (Möbel, Trennwände): beim Neuaufbau werden sie ersetzt */
  colliders: Box[];
}

/** Möbelstück oder Zimmerwand, die sich mit Axt bzw. Vorschlaghammer abreißen lässt */
export interface Demolishable {
  key: string;
  kind: 'prop' | 'wall';
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  level: number;
  /** Holz: Axt oder Brecheisen genügen */
  wooden: boolean;
  /** Dauer des Abreißens mit dem passenden Werkzeug (Sekunden) */
  seconds: number;
  /** Material, das übrig bleibt */
  give: Stack[];
  /** Inhalt des Möbelstücks, der herausfällt */
  loot: Stack[];
  view: BuildingView;
  /** Wand: bisheriger Schaden 0..1 (Loch) */
  frac: number;
}

const WOODEN = new Set(['shelf', 'cabinet', 'crate', 'chest', 'table', 'sofa', 'bed', 'wardrobe', 'desk', 'counter', 'nightstand', 'tvstand', 'chair', 'dresser', 'kitchenunit', 'cardbox', 'whpallet', 'whtable', 'whstool', 'whcrates', 'whladder']);

/** Erdgeschossfenster: Scheibe, Bretter und Kletterbox */
export interface WindowView {
  key: string;
  x: number;
  z: number;
  w: number;
  h: number;
  y0: number;
  state: WinState;
  box: Box;
  pane: THREE.Mesh;
  planks: THREE.Mesh[];
}

interface BuildingView {
  spec: BuildingSpec;
  door: DoorView;
  /** Türen zwischen den Zimmern des Erdgeschosses */
  innerDoors: DoorView[];
  windows: WindowView[];
  facade: Facade;
  /** Spieler steht gerade im Haus */
  inside: boolean;
  /** Etage 0 sofort; obere Etagen entstehen erst, wenn man in die Nähe kommt */
  levels: LevelView[];
  index: number;
  keyPrefix: string;
  /** Behälter dieses Chunks (obere Etagen tragen sich hier ein) */
  chunk: { group: THREE.Group; colliders: Box[]; containers: Container[] };
}

/** Durchsuchbarer Behälter. `loot` ist der veränderliche Zustand und überlebt Chunk-Unloads. */
export interface Container {
  key: string;
  name: string;
  kind: number;
  x: number;
  z: number;
  loot: Stack[];
  marker: THREE.Mesh;
  /** Etage, auf der der Behälter steht */
  level: number;
}

const ROOM_NAME: Record<string, string> = {
  living: 'Wohnzimmer', kitchen: 'Küche', bedroom: 'Schlafzimmer', bath: 'Badezimmer', hall: 'Treppenhaus', corridor: 'Flur',
  storage: 'Lager', shop: 'Verkaufsraum', office: 'Büro', meeting: 'Besprechungsraum', lobby: 'Empfang', hotelroom: 'Hotelzimmer',
  factory: 'Fabrikhalle', garage: 'Garage',
};

interface Chunk {
  spec: ChunkSpec;
  group: THREE.Group;
  colliders: Box[];
  buildings: BuildingView[];
  containers: Container[];
}

const windowGlass = new THREE.MeshStandardMaterial({ color: 0xa9c6d4, transparent: true, opacity: 0.36, roughness: 0.06, metalness: 0.35, depthWrite: false, side: THREE.DoubleSide, map: glassTexture() });
const plankMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 0.9 });
const markerGeo = new THREE.OctahedronGeometry(0.16);
const markerMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const doorGlass = new THREE.MeshStandardMaterial({ color: 0xa9c6d4, transparent: true, opacity: 0.32, roughness: 0.08, metalness: 0.3, depthWrite: false });
const DOOR_PAINT = [0x6b4a2e, 0x3f5a3a, 0x2e4a6b, 0x8a2f2f, 0xd8d2c0, 0x2a2a2e, 0x8a6a3a];
const paintCache = new Map<number, THREE.MeshStandardMaterial>();
/** Holztüren in verschiedenen Farben (geteilte Materialien) */
function paintedDoor(seed: number): THREE.MeshStandardMaterial {
  const i = Math.abs(Math.floor(Math.sin(seed * 12.9898) * 43758.5453)) % DOOR_PAINT.length;
  let m = paintCache.get(i);
  if (!m) {
    m = mats().doorWood.clone();
    m.color.setHex(DOOR_PAINT[i]);
    paintCache.set(i, m);
  }
  return m;
}
const knobGeo = new THREE.BoxGeometry(0.1, 0.1, 0.16);

function ownBox(w: number, h: number, d: number, tu: number, tv: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(makeBox(w, h, d, tu, tv), mat);
  m.userData.ownGeo = true;
  m.castShadow = m.receiveShadow = true;
  return m;
}

function unitBox(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(boxGeo, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
const roofMats = new Map<number, THREE.MeshStandardMaterial>();
const roofMat = (c: number) => {
  let m = roofMats.get(c);
  if (!m) roofMats.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })));
  return m;
};

/** Detailliertes Dachaufbau-Modell (Klimagerät, Wasserturm, Schornstein, Schüssel …). */
function roofUnit(u: BuildingSpec['roofUnits'][number], M: ReturnType<typeof mats>): THREE.Object3D {
  if (u.kind === 'chimney') {
    // Schornstein aus Naturstein mit dem Originalbild des Pakets auf allen vier Seiten
    const side = u.w >= 0.85 ? M.chimneyWide : M.chimneyShaft;
    const top = new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 1 });
    const g = new THREE.Group();
    g.position.set(u.x, u.y0, u.z);
    const shaft = new THREE.Mesh(boxGeo, [side, side, top, top, side, side]);
    shaft.scale.set(u.w, u.h, u.d);
    shaft.position.y = u.h / 2;
    const crown = new THREE.Mesh(boxGeo, M.roofParts);
    crown.scale.set(u.w + 0.14, 0.1, u.d + 0.14);
    crown.position.y = u.h + 0.05;
    shaft.castShadow = shaft.receiveShadow = crown.castShadow = true;
    g.add(shaft, crown);
    return g;
  }
  const m = new THREE.Mesh(roofUnitGeometry(u), M.roofParts);
  m.position.set(u.x, u.y0, u.z);
  m.rotation.y = ((u.x * 31 + u.z * 17) % 4 | 0) * (Math.PI / 2);
  m.castShadow = m.receiveShadow = true;
  m.userData.ownGeo = true;
  return m;
}

/** Wie viele Türen von Anfang an abgeschlossen sind (je Gebäudeart), aus dem Türschlüssel ausgewürfelt */
const LOCK_CHANCE: Record<string, number> = { house: 0.3, apartment: 0.5, shop: 0.45, office: 0.55, hotel: 0.35, industry: 0.6, garage: 0.15, barn: 0.05 };
function lockedAtStart(kind: string, key: string): boolean {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000 < (LOCK_CHANCE[kind] ?? 0.3);
}

const SIGHT_SLOPE = Math.tan(0.62); // Neigung der Blicklinie zur Kamera (Input.PITCH)

/** Schneidet die Blicklinie vom Spieler (Kopfhöhe) zur Kamera das Gebäudevolumen? */
function occludes(px: number, pz: number, dx: number, dz: number, b: BuildingSpec, py = 0): boolean {
  let t0 = 0, t1 = 80;
  for (const [p, d, c, h] of [[px, dx, b.x, b.w / 2 + 0.3], [pz, dz, b.z, b.d / 2 + 0.3]] as const) {
    if (Math.abs(d) < 1e-6) {
      if (Math.abs(p - c) > h) return false;
    } else {
      const ta = (c - h - p) / d, tb = (c + h - p) / d;
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
    }
  }
  return t0 < t1 && py + 1.4 + t0 * SIGHT_SLOPE < b.h;
}

/**
 * Läuft der Spieler (Mitte pos, Radius r) gegen eine dünne Box, wohin springt er? Der Zielpunkt liegt auf der
 * anderen Seite der dünnen Achse; die Bewegungsrichtung muss deutlich auf die Box zeigen.
 */
export function climbTarget(px: number, pz: number, dirX: number, dirZ: number, r: number, b: Box): { x: number; z: number } | null {
  const reach = 0.14;
  const ox = px - b.x, oz = pz - b.z;
  if (Math.abs(ox) >= b.w / 2 + r + reach || Math.abs(oz) >= b.d / 2 + r + reach) return null;
  const thickness = Math.min(b.w, b.d);
  if (thickness > 1.4) return null;
  const crossZ = b.d <= b.w; // dünn in z: man springt in z-Richtung über
  const off = crossZ ? oz : ox;
  const dir = crossZ ? dirZ : dirX;
  const side = off >= 0 ? -1 : 1; // Richtung zur Box
  if (dir * side < 0.35) return null;
  const far = (crossZ ? b.z : b.x) + side * (thickness / 2 + r + 0.18);
  return crossZ ? { x: px, z: far } : { x: far, z: pz };
}

export class ChunkManager {
  private chunks = new Map<string, Chunk>();
  /** Verbleibender Inhalt je Behälter, bleibt erhalten wenn der Chunk entladen wird. */
  private lootState = new Map<string, Stack[]>();
  /** Türzustand (offen/zu) bleibt auch nach dem Entladen eines Chunks erhalten */
  private doorWanted = new Map<string, boolean>();
  private doorHp = new Map<string, number>();
  /** Abgeschlossene Türen (true) bzw. aufgeschlossene (false); fehlt der Eintrag, würfelt die Welt das Schloss */
  private doorLock = new Map<string, boolean>();
  /** Zerstörte Möbel und Trennwände (Schlüssel `<Haus>:<Index>` bzw. `<Haus>:w<Etage>:<Index>`) */
  private gone = new Set<string>();
  /** Schaden an Zimmerwänden (0..1): bei Treffern mit Hammer entsteht ein wachsendes Loch */
  private wallDamage = new Map<string, number>();
  /** Wo an der Wand (0..1 entlang des Abschnitts) das Loch sitzt: dort, wo zuerst hingeschlagen wurde */
  private wallHole = new Map<string, number>();
  /** Fensterzustand (Scheibe, Bretter) bleibt über Chunk-Unloads erhalten */
  private windowState = new Map<string, WinState>();
  readonly group = new THREE.Group();
  /** Wegfindung der Zombies: Raster je Chunk, neu berechnet, wenn sich Hindernisse ändern */
  private navVer = 0;
  private navSoft = new WeakMap<Chunk, NavChunk['soft']>();
  private readonly nav = new NavGrid({
    chunkSize: CHUNK,
    version: () => this.navVer,
    chunk: (cx, cz) => {
      const ch = this.chunks.get(`${cx},${cz}`);
      if (!ch) return undefined;
      let soft = this.navSoft.get(ch);
      if (!soft) {
        soft = [];
        for (const v of ch.buildings) {
          soft.push({ box: v.door.plug, kind: 'door' });
          for (const d of v.innerDoors) soft.push({ box: d.plug, kind: 'door' });
          for (const w of v.windows) soft.push({ box: w.box, kind: 'climb' });
        }
        this.navSoft.set(ch, soft);
      }
      return { colliders: ch.colliders, soft };
    },
  });

  /** Weg für einen Zombie durch Räume und Türen; null, wenn keiner gefunden wurde */
  navPath(sx: number, sz: number, tx: number, tz: number): { x: number; z: number }[] | null {
    return this.nav.findPath(sx, sz, tx, tz);
  }

  /** Freie Bahn (ohne Wand, Möbel, Tür) zwischen zwei Punkten auf dem Erdgeschoss */
  navClear(ax: number, az: number, bx: number, bz: number): boolean {
    return this.nav.clearWorld(ax, az, bx, bz);
  }

  // --- Mehrspieler: veränderliche Weltzustände abgleichen -------------------------------------------

  /** Alle veränderlichen Zustände (Behälter, Türen, Fenster, Abriss) als Einträge `art:schlüssel` */
  dynEntries(): [string, unknown][] {
    const out: [string, unknown][] = [];
    for (const [k, v] of this.lootState) out.push([`loot:${k}`, v]);
    const dk = new Set([...this.doorWanted.keys(), ...this.doorHp.keys(), ...this.doorLock.keys()]);
    for (const k of dk) out.push([`door:${k}`, { w: this.doorWanted.get(k) ?? false, hp: this.doorHp.get(k) ?? 100, l: this.doorLock.get(k) ?? null }]);
    for (const [k, v] of this.windowState) out.push([`win:${k}`, v]);
    for (const k of this.gone) out.push([`gone:${k}`, true]);
    for (const [k, v] of this.wallDamage) out.push([`dmg:${k}`, v]);
    for (const [k, v] of this.wallHole) out.push([`dmgp:${k}`, v]);
    return out;
  }

  /** Eintrag eines Mitspielers übernehmen (auch für noch nicht geladene Chunks: sie lesen später die Karten) */
  applyDyn(entries: [string, unknown][]): void {
    for (const [name, val] of entries) {
      const i = name.indexOf(':');
      const kind = name.slice(0, i), key = name.slice(i + 1);
      if (kind === 'loot') {
        const list = val as Stack[];
        const cur = this.lootState.get(key);
        if (cur) {
          cur.length = 0;
          for (const s of list) cur.push({ ...s });
        } else this.lootState.set(key, list.map((s) => ({ ...s })));
      } else if (kind === 'door') {
        const v = val as { w: boolean; hp: number; l: boolean | null };
        this.doorWanted.set(key, v.w);
        this.doorHp.set(key, v.hp);
        if (v.l !== null) this.doorLock.set(key, v.l);
        for (const d of this.allDoors()) {
          if (d.key !== key) continue;
          d.wanted = v.w;
          d.hp = v.hp;
          if (v.l !== null) d.locked = v.l && !v.w;
          d.broken = v.w && v.hp <= 0;
          d.torn = v.hp <= -1;
          d.pivot.visible = !d.torn;
          if (d.torn) d.plug.off = true;
          if (!d.wanted) d.plug.off = false;
        }
      } else if (kind === 'win') {
        const v = val as WinState;
        const cur = this.windowState.get(key);
        if (cur) Object.assign(cur, v);
        else this.windowState.set(key, { ...v });
        for (const ch of this.chunks.values()) for (const b of ch.buildings) for (const w of b.windows) if (w.key === key) this.syncWindow(w);
      } else if (kind === 'dmgp') {
        this.wallHole.set(key, val as number);
      } else if (kind === 'dmg') {
        const v = val as number;
        if (this.wallDamage.get(key) === v) continue;
        this.wallDamage.set(key, v);
        this.navVer++;
        this.rebuildForKey(key);
      } else if (kind === 'gone') {
        if (this.gone.has(key)) continue;
        this.gone.add(key);
        this.wallDamage.delete(key);
        this.wallHole.delete(key);
        this.navVer++;
        this.rebuildForKey(key);
      }
    }
  }

  /** Stockwerk neu bauen, zu dem ein Möbel- oder Wandschlüssel gehört (`<Haus>:<Index>` oder `<Haus>:w<Etage>:<Index>`) */
  private rebuildForKey(key: string): void {
    for (const ch of this.chunks.values()) {
      for (const b of ch.buildings) {
        if (!key.startsWith(`${b.keyPrefix}:`)) continue;
        const rest = key.slice(b.keyPrefix.length + 1);
        const lv = rest.startsWith('w') ? Number(rest.split(':')[0].slice(1)) : (b.spec.props[Number(rest)]?.level ?? 0);
        if (b.levels[lv]) this.rebuildLevel(b, lv);
      }
    }
  }

  private allDoors(): DoorView[] {
    const out: DoorView[] = [];
    for (const ch of this.chunks.values()) for (const b of ch.buildings) out.push(b.door, ...b.innerDoors);
    return out;
  }

  /** Spielstand: geleerte Behälter, Türen, Fenster und die aus der Welt genommenen Autos */
  exportState(): { loot: [string, Stack[]][]; doors: [string, boolean][]; doorHp: [string, number][]; locks: [string, boolean][]; gone: string[]; dmg: [string, number][]; dmgp: [string, number][]; windows: [string, WinState][]; cars: string[] } {
    return {
      loot: [...this.lootState].map(([k, v]) => [k, v.map((x) => ({ ...x }))]),
      doors: [...this.doorWanted],
      doorHp: [...this.doorHp],
      locks: [...this.doorLock],
      gone: [...this.gone],
      dmg: [...this.wallDamage],
      dmgp: [...this.wallHole],
      windows: [...this.windowState].map(([k, v]) => [k, { ...v }]),
      cars: [...takenCars],
    };
  }

  /** Muss vor dem ersten Laden von Chunks aufgerufen werden (Behälter teilen sich die Listen) */
  importState(j: Partial<ReturnType<ChunkManager['exportState']>>): void {
    this.lootState = new Map((j.loot ?? []).map(([k, v]) => [k, v.map((x) => ({ ...x }))]));
    this.doorWanted = new Map(j.doors ?? []);
    this.doorHp = new Map(j.doorHp ?? []);
    this.doorLock = new Map(j.locks ?? []);
    this.gone = new Set(j.gone ?? []);
    this.wallDamage = new Map(j.dmg ?? []);
    this.wallHole = new Map(j.dmgp ?? []);
    this.windowState = new Map((j.windows ?? []).map(([k, v]) => [k, { ...v }]));
    takenCars.clear();
    for (const k of j.cars ?? []) takenCars.add(k);
  }

  /** Türen in Reichweite (Meter) um einen Punkt */
  doorsNear(x: number, z: number, range: number, level = 0): DoorView[] {
    const out: DoorView[] = [];
    const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const b of this.chunks.get(`${pcx + dx},${pcz + dz}`)?.buildings ?? []) {
          if (Math.hypot(b.door.x - x, b.door.z - z) <= range) out.push(b.door);
          // Innentüren gibt es nur im Erdgeschoss: wer oben steht, erreicht sie nicht
          if (level === 0) for (const d of b.innerDoors) if (Math.hypot(d.x - x, d.z - z) <= range) out.push(d);
        }
      }
    }
    return out;
  }

  /** Fenster in Reichweite (Meter) um einen Punkt */
  windowsNear(x: number, z: number, range: number): WindowView[] {
    const out: WindowView[] = [];
    const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const b of this.chunks.get(`${pcx + dx},${pcz + dz}`)?.buildings ?? []) {
          for (const w of b.windows) if (Math.hypot(w.x - x, w.z - z) <= range) out.push(w);
        }
      }
    }
    return out;
  }

  private syncWindow(w: WindowView): void {
    w.pane.visible = w.state.glass;
    w.planks.forEach((p, i) => (p.visible = i < w.state.planks));
    syncBox(w.box, w.state);
  }

  /** Schlag gegen ein Fenster (Zombie oder Spieler); gibt zurück, was dabei zerbrach */
  strikeWindow(w: WindowView, damage: number): WindowHit | null {
    const r = hitWindow(w.state, damage);
    if (r === 'glass' || r === 'plank') this.syncWindow(w);
    return r;
  }

  /** Brett vor das Fenster nageln (false: Scheibe noch heil oder schon voll verbarrikadiert) */
  barricade(w: WindowView): boolean {
    const ok = addPlank(w.state);
    if (ok) this.syncWindow(w);
    return ok;
  }

  unbarricade(w: WindowView): boolean {
    const ok = removePlank(w.state);
    if (ok) this.syncWindow(w);
    return ok;
  }

  /** Tür öffnen oder schließen. Wer in der Tür steht, kann sie nicht schließen. */
  toggleDoor(d: DoorView, px: number, pz: number): 'opened' | 'closed' | 'blocked' | 'locked' {
    if (d.broken) return 'blocked';
    if (d.locked && !d.wanted) return 'locked';
    if (d.wanted && Math.hypot(px - d.x, pz - d.z) < 1.1) return 'blocked';
    d.wanted = !d.wanted;
    this.doorWanted.set(d.key, d.wanted);
    // geschlossen: sofort wieder fest; geöffnet: Box fällt weg, sobald die Tür aufschwingt (siehe animateDoor)
    if (!d.wanted) d.plug.off = false;
    return d.wanted ? 'opened' : 'closed';
  }

  /** Schloss öffnen (Dietrich oder Schlüssel) oder wieder abschließen */
  setLocked(d: DoorView, locked: boolean): void {
    d.locked = locked;
    this.doorLock.set(d.key, locked);
  }

  /** Tür aufbrechen (Brecheisen, Axt, Vorschlaghammer): sie geht auf und bleibt kaputt */
  forceDoor(d: DoorView): void {
    d.locked = false;
    this.doorLock.set(d.key, false);
    d.hp = 0;
    this.doorHp.set(d.key, 0);
    d.broken = true;
    d.wanted = true;
    this.doorWanted.set(d.key, true);
    d.shake = 0.3;
  }

  /** Tür abreißen (Axt, Hammer …): das Türblatt verschwindet, der Durchgang bleibt dauerhaft offen */
  tearDoor(d: DoorView): void {
    this.forceDoor(d);
    d.hp = -1;
    this.doorHp.set(d.key, -1);
    d.torn = true;
    d.pivot.visible = false;
    d.plug.off = true;
    d.shake = 0;
  }

  /** Zombie öffnet eine geschlossene, heile Tür (false: schon offen, kaputt oder abgeschlossen) */
  openDoor(d: DoorView): boolean {
    if (d.wanted || d.broken || d.locked) return false;
    d.wanted = true;
    this.doorWanted.set(d.key, true);
    return true;
  }

  /** Schlag gegen eine geschlossene Tür (Zombies). Bei 0 bricht sie auf und lässt sich nicht mehr schließen. */
  thumpDoor(d: DoorView, damage: number): boolean {
    if (d.wanted || d.broken) return false;
    d.shake = 0.2;
    d.hp -= damage;
    this.doorHp.set(d.key, d.hp);
    if (d.hp > 0) return false;
    d.broken = true;
    d.wanted = true;
    this.doorWanted.set(d.key, true);
    return true;
  }

  /** Alle Behälter (auch leere) in Reichweite auf der Etage `level` */
  containersNear(x: number, z: number, range: number, level = 0): Container[] {
    const out: Container[] = [];
    const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const c of this.chunks.get(`${pcx + dx},${pcz + dz}`)?.containers ?? []) {
          if (c.level === level && Math.hypot(c.x - x, c.z - z) <= range) out.push(c);
        }
      }
    }
    return out;
  }

  hasChunk(cx: number, cz: number): boolean {
    return this.chunks.has(`${cx},${cz}`);
  }

  /** Freie Sichtlinie zwischen zwei Punkten? Nur Wände (und geschlossene Türen) auf dieser Etage verdecken. */
  lineClear(ax: number, az: number, bx: number, bz: number, level = 0): boolean {
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz);
    const walls: Box[] = [];
    for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
      for (let cz = Math.floor(z0 / CHUNK); cz <= Math.floor(z1 / CHUNK); cz++) {
        for (const b of this.chunks.get(`${cx},${cz}`)?.colliders ?? []) {
          if (b.sight && !b.off && (b.lv === undefined || b.lv === level)) walls.push(b);
        }
      }
    }
    if (!walls.length) return true;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / 0.5));
    for (let i = 1; i < n; i++) {
      const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
      for (const b of walls) if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2) return false;
    }
    return true;
  }

  /**
   * Strahlenfächer für das Sichtfeld: Entfernung bis zur ersten Sicht-Wand je Winkel (Winkel = atan2(x, z), also 0 = +z).
   * Fenster sind Lücken in den Wänden, geschlossene Türen blockieren. Wände, in denen der Spieler selbst steht, zählen nicht.
   */
  sightRays(px: number, pz: number, range: number, level: number, out: Float32Array): void {
    const walls: Box[] = [];
    for (let cx = Math.floor((px - range) / CHUNK); cx <= Math.floor((px + range) / CHUNK); cx++) {
      for (let cz = Math.floor((pz - range) / CHUNK); cz <= Math.floor((pz + range) / CHUNK); cz++) {
        for (const b of this.chunks.get(`${cx},${cz}`)?.colliders ?? []) {
          if (!b.sight || b.off || (b.lv !== undefined && b.lv !== level)) continue;
          if (Math.abs(b.x - px) > range + b.w / 2 || Math.abs(b.z - pz) > range + b.d / 2) continue;
          walls.push(b);
        }
      }
    }
    const n = out.length;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      let d = range;
      for (const b of walls) {
        const hx = b.w / 2, hz = b.d / 2;
        let t0 = 0, t1 = d;
        // Schnitt mit den beiden Plattenpaaren (Slab-Methode)
        const ox = b.x - px, oz = b.z - pz;
        if (Math.abs(dx) < 1e-6) {
          if (Math.abs(ox) > hx) continue;
        } else {
          const a1 = (ox - hx) / dx, a2 = (ox + hx) / dx;
          t0 = Math.max(t0, Math.min(a1, a2));
          t1 = Math.min(t1, Math.max(a1, a2));
        }
        if (Math.abs(dz) < 1e-6) {
          if (Math.abs(oz) > hz) continue;
        } else {
          const c1 = (oz - hz) / dz, c2 = (oz + hz) / dz;
          t0 = Math.max(t0, Math.min(c1, c2));
          t1 = Math.min(t1, Math.max(c1, c2));
        }
        // t0 > 0: Wand liegt vor dem Spieler; steht er schon darin (t0 = 0), blockiert sie nicht
        if (t0 <= t1 && t0 > 0.001 && t0 < d) d = t0;
      }
      out[i] = d;
    }
  }

  /** Hindernis zum Überklettern direkt vor dem Spieler: Zielpunkt auf der anderen Seite, Dauer und Sprunghöhe. */
  findClimb(pos: THREE.Vector3, dirX: number, dirZ: number, r = 0.4, level = 0): { x: number; z: number; dur: number; h: number } | null {
    const pcx = Math.floor(pos.x / CHUNK), pcz = Math.floor(pos.z / CHUNK);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const b of this.chunks.get(`${pcx + dx},${pcz + dz}`)?.colliders ?? []) {
          if (!b.climb || b.off || (b.lv !== undefined && b.lv !== level)) continue;
          const hit = climbTarget(pos.x, pos.z, dirX, dirZ, r, b);
          if (hit) return { ...hit, dur: b.climb, h: b.climb >= 1 ? 1.2 : 0.75 };
        }
      }
    }
    return null;
  }

  /** Nächster Behälter mit Inhalt in Reichweite (Meter) auf der Etage `level`. */
  nearestContainer(x: number, z: number, range: number, level = 0): Container | null {
    const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
    let best: Container | null = null;
    let bestD = range * range;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const c of this.chunks.get(`${pcx + dx},${pcz + dz}`)?.containers ?? []) {
          if (!c.loot.length || c.level !== level) continue;
          const d = (c.x - x) ** 2 + (c.z - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
      }
    }
    return best;
  }

  /** Alle parkenden Autos in Reichweite (Meter) */
  carsNear(x: number, z: number, range: number): Car[] {
    const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
    const out: Car[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const set = this.chunks.get(`${pcx + dx},${pcz + dz}`)?.group.userData.cars as CarSet | undefined;
        for (const c of set?.list ?? []) {
          if (takenCars.has(carKey(c))) continue;
          if (Math.hypot(c.x - x, c.z - z) <= range) out.push(c);
        }
      }
    }
    return out;
  }

  /** Nächstes parkendes Auto in Reichweite (Meter) */
  nearestCar(x: number, z: number, range: number): Car | null {
    const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
    let best: Car | null = null;
    let bestD = range * range;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const set = this.chunks.get(`${pcx + dx},${pcz + dz}`)?.group.userData.cars as CarSet | undefined;
        for (const c of set?.list ?? []) {
          if (takenCars.has(carKey(c))) continue;
          const d = (c.x - x) ** 2 + (c.z - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
      }
    }
    return best;
  }

  /** Nimmt das Auto aus der Welt (wird zum fahrbaren Objekt): Instanzen ausblenden, Kollision entfernen. */
  takeCar(car: Car): void {
    takenCars.add(carKey(car));
    const cx = Math.floor(car.x / CHUNK), cz = Math.floor(car.z / CHUNK);
    const chunk = this.chunks.get(`${cx},${cz}`);
    const set = chunk?.group.userData.cars as CarSet | undefined;
    if (!chunk || !set) return;
    const i = set.list.indexOf(car);
    if (i < 0) return;
    const gone = new THREE.Matrix4().makeScale(0, 0, 0);
    const sl = set.slot[i];
    const grp = set.groups.find((q) => q.model === sl.model);
    if (grp) {
      for (const mm of [grp.paint, grp.glass, grp.trim]) {
        mm?.setMatrixAt(sl.i, gone);
        if (mm) mm.instanceMatrix.needsUpdate = true;
      }
      const dec = sl.dkey ? set.decals.find((q) => q.key === sl.dkey)?.mesh : null;
      if (dec) {
        dec.setMatrixAt(sl.di, gone);
        dec.instanceMatrix.needsUpdate = true;
      }
      for (let k = 0; k < 4; k++) grp.wheels?.setMatrixAt(sl.i * 4 + k, gone);
      if (grp.wheels) grp.wheels.instanceMatrix.needsUpdate = true;
    }
    const at = chunk.colliders.indexOf(set.boxes[i]);
    if (at >= 0) chunk.colliders.splice(at, 1);
  }

  private buildingAt(x: number, z: number): BuildingView | null {
    const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
    for (const b of this.chunks.get(`${pcx},${pcz}`)?.buildings ?? []) {
      if (Math.abs(x - b.spec.x) < b.spec.w / 2 && Math.abs(z - b.spec.z) < b.spec.d / 2) return b;
    }
    return null;
  }

  /** Etage, auf der man bei Höhe `y` steht (0 draußen). */
  levelAt(x: number, z: number, y: number): number {
    const b = this.buildingAt(x, z);
    if (!b || b.spec.floors < 2) return 0;
    return Math.max(0, Math.min(b.spec.floors - 1, Math.round(y / FLOOR_H)));
  }

  /** Begehbare Höhe an (x, z): Fußboden der Etage oder Rampe einer Treppe. `y` ist die aktuelle Höhe. */
  surfaceY(x: number, z: number, y: number): number {
    const b = this.buildingAt(x, z);
    if (!b || b.spec.floors < 2) return 0;
    const sp = b.spec;
    if (sp.stairs) {
      for (let f = 0; f < sp.floors - 1; f++) {
        if (y < f * FLOOR_H - 0.5 || y > (f + 1) * FLOOR_H + 0.5) continue;
        const h = rampHeight(sp.stairs, f, x, z);
        if (h !== null) return h;
      }
    }
    return Math.max(0, Math.min(sp.floors - 1, Math.round(y / FLOOR_H))) * FLOOR_H;
  }

  /** Schon erzeugte Chunk-Daten (für die Karte) */
  specOf(cx: number, cz: number): ChunkSpec | undefined {
    return this.chunks.get(`${cx},${cz}`)?.spec;
  }

  /** Gebäude, Etage und Raum an einer Stelle; null draußen. */
  buildingInfo(x: number, z: number, y: number): { floors: number; level: number; room: string } | null {
    const b = this.buildingAt(x, z);
    if (!b) return null;
    const sp = b.spec;
    const level = Math.max(0, Math.min(sp.floors - 1, Math.round(y / FLOOR_H)));
    const room = sp.rooms.find((r) => r.level === level && x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
    return { floors: sp.floors, level, room: ROOM_NAME[room?.type ?? 'hall'] ?? 'Raum' };
  }

  isInside(x: number, z: number): boolean {
    const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
    for (const b of this.chunks.get(`${pcx},${pcz}`)?.buildings ?? []) {
      if (Math.abs(x - b.spec.x) < b.spec.w / 2 && Math.abs(z - b.spec.z) < b.spec.d / 2) return true;
    }
    return false;
  }

  /** Lädt alle Chunks rund um die Position sofort (beim Start). */
  preload(px: number, pz: number): void {
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
    for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
      for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) this.ensure(pcx + dx, pcz + dz);
    }
  }

  private ensure(cx: number, cz: number): boolean {
    const key = `${cx},${cz}`;
    if (this.chunks.has(key)) return false;
    this.load(cx, cz, key);
    return true;
  }

  /**
   * yaw: Blickrichtung der Kamera. Steht der Spieler in einem Haus, sinken die Wände ab,
   * die zur Kamera zeigen; die Wände dahinter und die Rückseite bleiben stehen.
   */
  update(px: number, pz: number, dt = 1 / 60, yaw = Math.PI / 4, py = 0): void {
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
    // näheste fehlende Chunks zuerst
    const missing: [number, number, number][] = [];
    for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
      for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
        if (!this.chunks.has(`${pcx + dx},${pcz + dz}`)) missing.push([pcx + dx, pcz + dz, dx * dx + dz * dz]);
      }
    }
    missing.sort((a, b) => a[2] - b[2]);
    for (const [cx, cz] of missing.slice(0, LOADS_PER_FRAME)) this.ensure(cx, cz);

    const sx = Math.sin(yaw), sz = Math.cos(yaw);
    let floorBudget = 1; // höchstens eine neue Etage pro Frame
    for (const [key, chunk] of this.chunks) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > UNLOAD_RADIUS || Math.abs(cz - pcz) > UNLOAD_RADIUS) {
        this.unload(chunk);
        this.chunks.delete(key);
        this.nav.forget(cx, cz);
        continue;
      }
      if (Math.abs(cx - pcx) <= 1 && Math.abs(cz - pcz) <= 1) {
        for (const b of chunk.buildings) {
          this.animateDoor(b.door, dt);
          for (const d of b.innerDoors) this.animateDoor(d, dt);
          const sp = b.spec;
          b.inside = Math.abs(px - sp.x) < sp.w / 2 - 0.15 && Math.abs(pz - sp.z) < sp.d / 2 - 0.15;
          const near = Math.abs(px - sp.x) < sp.w / 2 + NEAR_BUILD && Math.abs(pz - sp.z) < sp.d / 2 + NEAR_BUILD;
          if (near && floorBudget > 0 && b.levels.length < sp.floors) {
            this.addLevel(b, b.levels.length);
            floorBudget--;
          }
          const ready = b.levels.length === sp.floors;
          // Steht ein Haus zwischen Kamera und Spieler, wird es genauso aufgeschnitten wie ein betretenes
          const occluding = !b.inside && occludes(px, pz, sx, sz, sp, py);
          const open = b.inside || occluding;
          // aktuelle Etage: im Haus die Etage des Spielers, bei Verdeckung nur das Erdgeschoss
          const top = b.inside ? Math.max(0, Math.min(sp.floors - 1, Math.round(py / FLOOR_H))) : occluding ? 0 : sp.floors - 1;
          b.facade.tower.visible = !open && !(near && ready);
          b.facade.roof.visible = !open;
          b.levels.forEach((lv, f) => {
            // Erdgeschoss-Inneres nur in der Nähe oder bei aufgeschnittenem Haus; von weitem zeigt der Turm das Gebäude
            const shown = f === 0 || (ready && near && f <= top);
            // Boden, Möbel und Zimmer des Erdgeschosses nur in der Nähe zeichnen; die Außenwände (sides) bleiben immer sichtbar
            lv.interior.visible = shown && (f > 0 || open || near);
            // Im Haus ist nur der eigene Raum hell; von außen wirkt ein aufgeschnittenes Haus ganz dunkel
            const here = b.inside && f === top
              ? sp.rooms.find((r) => r.level === f && px >= r.x0 && px <= r.x1 && pz >= r.z0 && pz <= r.z1)
              : undefined;
            // Zimmerwände zur Kamera hin (vom Spieler aus gesehen): nur das untere Drittel bleibt
            for (const w of lv.walls) w.high.visible = !(open && f <= top && (w.x - px) * sx + (w.z - pz) * sz > 0);
            for (const rm of lv.rooms) {
              const dim = shown && open && rm.room !== here;
              if (rm.dim === dim) continue;
              rm.dim = dim;
              for (const m of rm.mats) m.color.setScalar(dim ? 0.13 : 1);
            }
            for (const side of lv.sides) {
              side.group.visible = shown;
              // zur Kamera zeigende Wände: nur das untere Drittel bleibt stehen (nicht gestaucht, sondern abgeschnitten)
              side.cut = open && f <= top && side.nx * sx + side.nz * sz > 0.25 ? 1 : 0;
              side.high.visible = side.cut === 0;
            }
          });
        }
      }
      for (const c of chunk.containers) {
        c.marker.visible = false; // keine schwebenden Symbole über Möbeln
        c.marker.rotation.y += dt * 2;
      }
    }
  }

  /** Türen schwingen auf oder zu, je nachdem ob sie per Klick geöffnet wurden. */
  private animateDoor(d: DoorView, dt: number): void {
    const target = d.wanted ? 1 : 0;
    d.cracks[0].visible = d.hp < 72;
    d.cracks[1].visible = d.hp < 38;
    let shake = 0;
    if (d.shake > 0) {
      d.shake = Math.max(0, d.shake - dt);
      shake = Math.sin(performance.now() * 0.07) * 0.035 * (d.shake / 0.2);
    }
    if (d.open !== target) d.open += Math.sign(target - d.open) * Math.min(Math.abs(target - d.open), dt * 3);
    if (d.sliding) d.pivot.position.y = d.open * (DOOR_H - 0.1) + shake * 0.6;
    else d.pivot.rotation.y = d.open * DOOR_ANGLE + shake;
    // Der Durchgang ist frei, sobald die Tür halb offen ist
    if (d.wanted && d.open > 0.4) d.plug.off = true;
    // Aufgebrochene Tür hängt schief in den Angeln
    if (d.broken && !d.fell && d.open >= 1) {
      d.fell = true;
      if (!d.sliding) {
        d.pivot.rotation.z = 0.32;
        d.pivot.position.y = -0.07;
      }
    }
  }

  private unload(chunk: Chunk): void {
    this.group.remove(chunk.group);
    chunk.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.ownGeo) o.geometry.dispose();
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    });
  }

  /** Schiebt einen Kreis (Radius r) aus allen Kollisionsboxen in der Nähe heraus. */
  resolve(pos: THREE.Vector3, r: number, level = 0): void {
    const pcx = Math.floor(pos.x / CHUNK), pcz = Math.floor(pos.z / CHUNK);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const chunk = this.chunks.get(`${pcx + dx},${pcz + dz}`);
        if (!chunk) continue;
        for (const b of chunk.colliders) if (b.lv === undefined || b.lv === level) pushOut(pos, r, b);
      }
    }
  }

  /** Überschneidet die Box ein Gebäude, einen Baum oder Möbel? (für Basisbau) */
  overlapsWorld(box: Box, shrink = 0.2, level = 0): boolean {
    const pcx = Math.floor(box.x / CHUNK), pcz = Math.floor(box.z / CHUNK);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const b of this.chunks.get(`${pcx + dx},${pcz + dz}`)?.colliders ?? []) {
          // Draußen und im Erdgeschoss zählen auch Kollisionsboxen ohne Etage; oben nur die der eigenen Etage
          if ((b.lv === level || (level === 0 && b.lv === undefined)) && overlaps(box, b, shrink)) return true;
        }
      }
    }
    return false;
  }

  /** Dünne Wandstücke (Außen- und Innenwände) in der Nähe: Ankerpunkte, an die gebaute Wände einrasten */
  wallBoxesNear(x: number, z: number, r: number, level = 0): Box[] {
    const out: Box[] = [];
    const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const b of this.chunks.get(`${pcx + dx},${pcz + dz}`)?.colliders ?? []) {
          if (b.off || (b.lv !== undefined ? b.lv !== level : level !== 0)) continue;
          const lo = Math.min(b.w, b.d), hi = Math.max(b.w, b.d);
          if (lo > 0.5 || hi < 0.8) continue;
          if (Math.abs(b.x - x) < r + hi / 2 && Math.abs(b.z - z) < r + hi / 2) out.push(b);
        }
      }
    }
    return out;
  }

  /**
   * Türen, Türöffnungen zwischen Zimmern und Fenster müssen frei bleiben: dort darf keine Wand gebaut werden.
   * (Sonst steht eine Wand mitten in der Tür und das Haus ist nicht mehr begehbar.)
   */
  blocksOpening(box: Box, level = 0): boolean {
    const pcx = Math.floor(box.x / CHUNK), pcz = Math.floor(box.z / CHUNK);
    const grow = (o: Box, g: number): Box => ({ ...o, w: o.w + g * 2, d: o.d + g * 2 });
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const v of this.chunks.get(`${pcx + dx},${pcz + dz}`)?.buildings ?? []) {
          if (level === 0 && overlaps(box, grow(v.door.plug, 0.9), 0)) return true;
          if (level === 0) for (const w of v.windows) if (overlaps(box, grow(w.box, 0.15), 0)) return true;
          for (const part of v.spec.partitions) {
            if (part.level !== level) continue;
            for (const l of part.lintels) if (overlaps(box, grow(l, 0.5), 0)) return true;
          }
        }
      }
    }
    return false;
  }

  private load(cx: number, cz: number, key: string): void {
    const spec = generateChunk(cx, cz);
    const group = new THREE.Group();
    const colliders: Box[] = [];
    const buildings: BuildingView[] = [];
    const containers: Container[] = [];

    buildTerrain(spec, cx, cz, group, colliders);
    const camp = FACTIONS.find((f) => f.camp.cx === cx && f.camp.cz === cz);
    if (camp) buildCamp(group, colliders, camp);
    spec.buildings.forEach((b, i) => buildings.push(this.addBuilding(group, colliders, containers, b, `${key}:${i}`)));
    buildFarm(spec, group, colliders);
    spec.sacks.forEach((sk, i) => {
      const ckey = `${key}:sack${i}`;
      let loot = this.lootState.get(ckey);
      if (!loot) this.lootState.set(ckey, (loot = sk.loot.map((s) => ({ ...s }))));
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.set(sk.x, 1.1, sk.z);
      marker.visible = false;
      group.add(marker);
      containers.push({ key: ckey, name: sk.crate ? 'Kiste mit Säcken' : 'Getreidesack', kind: -2, x: sk.x, z: sk.z, loot, marker, level: 0 });
    });
    const smoke = createSmoke(spec.buildings.flatMap((b) => b.emitters));
    if (smoke) group.add(smoke);

    this.group.add(group);
    this.chunks.set(key, { spec, group, colliders, buildings, containers });
  }

  private addBuilding(
    group: THREE.Group,
    colliders: Box[],
    containers: Container[],
    b: BuildingSpec,
    keyPrefix: string,
  ): BuildingView {
    const M = mats();
    const wallMat = M.wallStyle(b.style, b.color);
    const facade = buildFacade(b, keyPrefix.length + Math.floor(b.x * 7 + b.z * 13));
    for (const side of facade.sides) group.add(side.group);
    group.add(facade.tower);

    // Kollision der Außenwände (mit Türlücke)
    for (const w of buildingWalls(b)) colliders.push(w);

    // Türrahmen-Pfosten und Türblatt (lokal: +x entlang der Wand, -z ins Haus); der Sturz steckt in der Wand.
    // Garagen- und Fabriktore sind breit und fahren nach oben statt aufzuschwingen.
    const dp = doorPlacement(b);
    // Fabrik: Brandschutztür als Zugang, daneben (im breiten Torausschnitt) feste Rolltor-Felder
    const fireDoor = b.kind === 'industry' && worldModelsReady();
    const DW = fireDoor ? 1.15 : b.doorW;
    const sliding = b.kind === 'garage' || b.kind === 'barn' || (b.kind === 'industry' && !fireDoor);
    // Modell-Tür (Holz für Wohnhaus, Wohnblock, Hotel; Bürotür; Brandschutztür) statt der Kisten-Tür, Geschäfte behalten ihre Glastür
    const modelLeaf: 'wood' | 'office' | 'fire' | null = !worldModelsReady() ? null
      : fireDoor ? 'fire'
      : b.kind === 'office' ? 'office'
      : b.kind === 'house' || b.kind === 'apartment' || b.kind === 'hotel' ? 'wood'
      : null;
    const doorGroup = new THREE.Group();
    doorGroup.position.set(dp.x, 0, dp.z);
    doorGroup.rotation.y = dp.rot;
    const ds = b.doorStyle;
    const wood = b.kind === 'barn' ? M.doorWood : paintedDoor(b.x * 3 + b.z);
    const frameMat = (sliding && b.kind !== 'barn') || ds === 'glass' || ds === 'steel' ? M.metal : wood;
    doorGroup.add(
      unitBox(frameMat, 0.1, DOOR_H, WALL_T + 0.06, -DW / 2 + 0.05, DOOR_H / 2, 0),
      unitBox(frameMat, 0.1, DOOR_H, WALL_T + 0.06, DW / 2 - 0.05, DOOR_H / 2, 0),
      unitBox(frameMat, DW, 0.1, WALL_T + 0.06, 0, DOOR_H - 0.05, 0),
    );
    const leafW = fireDoor ? 0.97 : DW - 0.2;
    const LH = fireDoor ? 2.1 : DOOR_H - 0.05;
    const pivot = new THREE.Group();
    pivot.position.set(sliding ? 0 : fireDoor ? -leafW / 2 : -DW / 2 + 0.1, 0, 0);
    const cx = sliding ? 0 : leafW / 2;
    if (modelLeaf) {
      const leafName = modelLeaf === 'wood' ? 'wood_leaf' : modelLeaf === 'office' ? 'office1_leaf' : 'fire_leaf';
      const leaf = worldMesh(leafName);
      if (leaf) {
        leaf.scale.set(leafW, LH, 1);
        pivot.add(leaf);
        const fr = modelLeaf === 'office' ? null : worldMesh(modelLeaf === 'wood' ? 'wood_frame' : 'fire_frame'); // Bürotür-Zarge ist mit 11 000 Dreiecken zu teuer: die einfache Zarge bleibt
        if (fr) {
          fr.scale.set(leafW + 0.18, LH + 0.06, 1);
          fr.position.set(cx, 0, 0);
          doorGroup.add(fr);
          fr.position.set(fireDoor ? 0 : -DW / 2 + 0.1 + cx, 0, 0);
        }
        // Griff
        if (modelLeaf !== 'fire') pivot.add(unitBox(M.metal, 0.05, 0.05, 0.14, leafW - 0.12, 1.0, 0));
      }
    } else if (sliding) {
      pivot.add(unitBox(b.kind !== 'barn' ? M.rollShutter : wood, leafW, LH, 0.08, cx, LH / 2, 0));
    } else if (ds === 'glass') {
      // Glastür: Metallrahmen, Scheibe, Mittelholm bei breiten Türen, Griffstangen
      pivot.add(unitBox(doorGlass, leafW, LH, 0.03, cx, LH / 2, 0));
      for (const y of [0.06, LH - 0.06]) pivot.add(unitBox(M.metal, leafW, 0.12, 0.06, cx, y, 0));
      for (const x of [0.06, leafW - 0.06]) pivot.add(unitBox(M.metal, 0.1, LH, 0.06, x, LH / 2, 0));
      if (DW > 1.5) pivot.add(unitBox(M.metal, 0.06, LH, 0.06, cx, LH / 2, 0));
      pivot.add(unitBox(M.metal, 0.03, 0.7, 0.03, leafW - 0.22, 1.0, 0.07), unitBox(M.metal, 0.03, 0.7, 0.03, leafW - 0.22, 1.0, -0.07));
    } else if (ds === 'steel') {
      pivot.add(unitBox(M.metal, leafW, LH, 0.07, cx, LH / 2, 0));
      pivot.add(unitBox(doorGlass, leafW * 0.45, 0.5, 0.08, cx, 1.6, 0));
      pivot.add(unitBox(M.metal, 0.04, 0.5, 0.04, leafW - 0.18, 1.0, 0.07));
    } else if (ds === 'window') {
      // Holztür mit Glasausschnitt im oberen Drittel
      pivot.add(unitBox(wood, leafW, LH * 0.6, 0.07, cx, LH * 0.3, 0));
      pivot.add(unitBox(wood, leafW, LH * 0.08, 0.07, cx, LH * 0.96, 0));
      for (const x of [0.07, leafW - 0.07]) pivot.add(unitBox(wood, 0.14, LH * 0.4, 0.07, x, LH * 0.8, 0));
      pivot.add(unitBox(doorGlass, leafW - 0.2, LH * 0.34, 0.03, cx, LH * 0.78, 0));
      pivot.add(unitBox(M.metal, 0.07, 0.07, 0.17, leafW - 0.18, 1.0, 0));
    } else {
      pivot.add(unitBox(wood, leafW, LH, 0.07, cx, LH / 2, 0));
      if (ds === 'panel') {
        for (const z of [0.04, -0.04]) {
          for (const [py, ph] of [[LH * 0.25, LH * 0.34], [LH * 0.72, LH * 0.34]] as const) {
            pivot.add(unitBox(M.doorPanel, leafW - 0.3, ph, 0.02, cx, py, z));
          }
        }
      }
      pivot.add(unitBox(M.metal, 0.07, 0.07, 0.17, leafW - 0.18, 1.0, 0));
    }
    // Risse, die mit dem Schaden an der Tür sichtbar werden
    const crackMat = new THREE.MeshBasicMaterial({ color: 0x120a05 });
    const crackAt = (cxm: number, y: number, len: number, ang: number): THREE.Mesh => {
      const m = unitBox(crackMat, len, 0.03, 0.012, cxm, y, 0);
      m.rotation.z = ang;
      return m;
    };
    const mid = sliding ? 0 : leafW / 2;
    const cracks = [new THREE.Group(), new THREE.Group()];
    for (const side of [0.045, -0.045]) {
      const c1 = crackAt(mid - 0.1, LH * 0.62, 0.5, 0.8), c2 = crackAt(mid + 0.15, LH * 0.35, 0.42, -0.6);
      const c3 = crackAt(mid - 0.2, LH * 0.25, 0.38, 1.2), c4 = crackAt(mid + 0.05, LH * 0.78, 0.45, -1.0), c5 = crackAt(mid + 0.2, LH * 0.55, 0.3, 0.4);
      for (const c of [c1, c2]) c.position.z = side;
      for (const c of [c3, c4, c5]) c.position.z = side;
      cracks[0].add(c1, c2);
      cracks[1].add(c3, c4, c5);
    }
    for (const c of cracks) {
      c.visible = false;
      pivot.add(c);
    }
    doorGroup.add(pivot);
    if (fireDoor) {
      // feste Rolltor-Felder links und rechts der Brandschutztür (füllen den breiten Torausschnitt)
      const seg = (b.doorW - DW) / 2;
      for (const sx of [-1, 1]) {
        const gx = sx * (DW / 2 + seg / 2);
        doorGroup.add(unitBox(M.rollShutter, seg, DOOR_H, 0.1, gx, DOOR_H / 2, 0));
        for (const y of [0.9, 1.7]) doorGroup.add(unitBox(M.metal, seg, 0.05, 0.14, gx, y, 0));
        const alongXg = Math.abs(Math.sin(dp.rot)) < 0.5;
        const wx = dp.x + Math.cos(dp.rot) * gx, wz = dp.z - Math.sin(dp.rot) * gx;
        colliders.push({ x: wx, z: wz, w: alongXg ? seg : WALL, d: alongXg ? WALL : seg, sight: true });
      }
    }
    group.add(doorGroup); // Türen sind nicht Teil der absenkbaren Wand: sie bleiben immer stehen

    // Boden des Erdgeschosses
    const floor = new THREE.Mesh(planeXZ(b.w, b.d, 2, 2), M.floor);
    floor.userData.ownGeo = true;
    floor.position.set(b.x, 0.05, b.z);
    floor.receiveShadow = true;
    group.add(floor);

    // Dach: verschwindet, sobald man im Haus ist
    const top = facade.roof;
    group.add(top);
    if (b.roof === 'gable') {
      const rise = Math.min(2.6, 0.32 * Math.min(b.w, b.d) + 0.5);
      const roof = new THREE.Mesh(gableRoof(b.w, b.d, b.ridgeX, rise), b.style === 'wood' ? M.roofWood : M.roof(b.roofColor));
      roof.userData.ownGeo = true;
      roof.position.set(b.x, b.h, b.z);
      roof.castShadow = roof.receiveShadow = true;
      top.add(roof);
    } else {
      const slab = ownBox(b.w + 0.5, 0.3, b.d + 0.5, 3, 3, M.roof(0x6b7078));
      slab.position.set(b.x, b.h + 0.15, b.z);
      top.add(slab);
      const t = 0.25, ph = 0.55;
      top.add(
        unitBox(wallMat, b.w + 0.5, ph, t, b.x, b.h + 0.3 + ph / 2, b.z + (b.d + 0.5) / 2 - t / 2),
        unitBox(wallMat, b.w + 0.5, ph, t, b.x, b.h + 0.3 + ph / 2, b.z - (b.d + 0.5) / 2 + t / 2),
        unitBox(wallMat, t, ph, b.d + 0.5, b.x + (b.w + 0.5) / 2 - t / 2, b.h + 0.3 + ph / 2, b.z),
        unitBox(wallMat, t, ph, b.d + 0.5, b.x - (b.w + 0.5) / 2 + t / 2, b.h + 0.3 + ph / 2, b.z),
      );
    }
    for (const u of b.roofUnits) top.add(roofUnit(u, M));
    if (b.driveway) {
      const dr = ownBox(b.driveway.w, 0.05, b.driveway.d, 2, 2, M.paving);
      dr.position.set(b.driveway.x, 0.03, b.driveway.z);
      dr.castShadow = false;
      group.add(dr);
    }

    // Die Türlücke ist durch eine Box gesperrt, bis die Tür geöffnet wird (Klick)
    const alongX = Math.abs(Math.sin(dp.rot)) < 0.5;
    const plug: Box = { x: dp.x, z: dp.z, w: alongX ? DW : WALL, d: alongX ? WALL : DW, sight: true };
    colliders.push(plug);
    const doorKey = `door:${keyPrefix}`;
    const wanted = this.doorWanted.get(doorKey) ?? false;
    if (wanted) {
      plug.off = true;
      if (sliding) pivot.position.y = DOOR_H - 0.1;
      else pivot.rotation.y = DOOR_ANGLE;
    }
    // Erdgeschossfenster: Scheibe, Bretter und eine Kletterbox in der Wand, die nur bei offenem Fenster zählt
    const windows: WindowView[] = [];
    b.windows.forEach((w, i) => {
      if (!isDynamicWindow(w)) return;
      const key = `win:${keyPrefix}:${i}`;
      let state = this.windowState.get(key);
      if (!state) this.windowState.set(key, (state = initialWindow(w)));
      const fr = sideFrame(b, w.side);
      const wx = fr.cx + fr.ax * w.u, wz = fr.cz + fr.az * w.u;
      const alongX = w.side <= 1;
      const box: Box = { x: wx, z: wz, w: alongX ? w.w : WALL, d: alongX ? WALL : w.w, lv: 0, climb: CLIMB_SECONDS };
      colliders.push(box);
      const holder = new THREE.Group();
      holder.position.set(wx, 0, wz);
      holder.rotation.y = Math.atan2(fr.nx, fr.nz);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.h), windowGlass);
      pane.position.y = w.y0 + w.h / 2;
      holder.add(pane);
      const planks: THREE.Mesh[] = [];
      for (let k = 0; k < MAX_PLANKS; k++) {
        const p = new THREE.Mesh(boxGeo, plankMat);
        p.scale.set(w.w + 0.3, 0.17, 0.05);
        p.position.set(((k * 37) % 5 - 2) * 0.02, w.y0 + 0.12 + (k * (w.h - 0.24)) / (MAX_PLANKS - 1), WALL / 2 + 0.05);
        p.rotation.z = (((k * 53) % 7) - 3) * 0.018;
        p.castShadow = true;
        holder.add(p);
        planks.push(p);
      }
      group.add(holder);
      const view: WindowView = { key, x: wx, z: wz, w: w.w, h: w.h, y0: w.y0, state, box, pane, planks };
      this.syncWindow(view);
      windows.push(view);
    });
    const view: BuildingView = {
      windows, spec: b, innerDoors: [], door: { pivot, sliding, x: dp.x, z: dp.z, open: wanted ? 1 : 0, wanted, plug, key: doorKey, hp: this.doorHp.get(doorKey) ?? 100, broken: this.doorWanted.get(doorKey) === true && (this.doorHp.get(doorKey) ?? 100) <= 0, cracks, shake: 0, fell: false, torn: (this.doorHp.get(doorKey) ?? 100) <= -1, locked: !wanted && (this.doorLock.get(doorKey) ?? lockedAtStart(b.kind, doorKey)) }, facade, inside: false, levels: [],
      index: keyPrefix.length + Math.floor(b.x * 7 + b.z * 13), keyPrefix, chunk: { group, colliders, containers },
    };
    if (view.door.torn) {
      pivot.visible = false;
      plug.off = true;
    }
    this.addLevel(view, 0);
    this.addInnerDoors(view, group, colliders);
    this.addSecondDoor(view, group, colliders);
    return view;
  }

  /** Türen in den Zimmerwänden des Erdgeschosses: Rahmen, Türblatt, Kollisionsbox; Zustand bleibt wie bei der Haustür erhalten */
  private addInnerDoors(v: BuildingView, group: THREE.Group, colliders: Box[]): void {
    const part = v.spec.partitions.find((q) => q.level === 0);
    (part?.doors ?? []).forEach((dd, n) => {
      const alongX = dd.orient === 'x';
      this.leafDoor(v, group, colliders, {
        x: alongX ? dd.g : dd.c, z: alongX ? dd.c : dd.g, rot: alongX ? 0 : Math.PI / 2, W: dd.w, t: dd.t, key: `door:${v.keyPrefix}:i${n}`, inner: true, glass: false, lv: 0,
      });
    });
  }

  /** Zweiter Eingang (Eckhaus): eigene Tür in der Außenwand; ohne Türblatt (`leaf: false`) bleibt es ein offener Durchgang zum anderen Flügel */
  private addSecondDoor(v: BuildingView, group: THREE.Group, colliders: Box[]): void {
    const b = v.spec;
    if (!b.door2?.leaf) return;
    const dp = doorPlacement(b, b.door2.side, b.door2.u);
    this.leafDoor(v, group, colliders, {
      x: dp.x, z: dp.z, rot: dp.rot, W: b.doorW, t: WALL_T, key: `door:${v.keyPrefix}:e2`, inner: false, glass: b.doorStyle === 'glass', lv: undefined,
    });
  }

  /** Eine Tür mit Zarge, Blatt, Klinke und Kollisionsbox; trägt sich in `v.innerDoors` ein (lokal: +x entlang der Wand, -z ins Haus) */
  private leafDoor(
    v: BuildingView, group: THREE.Group, colliders: Box[],
    o: { x: number; z: number; rot: number; W: number; t: number; key: string; inner: boolean; glass: boolean; lv: number | undefined },
  ): void {
    const M = mats();
    const wood = paintedDoor(v.spec.x * 3 + v.spec.z + 7);
    const { W, key } = o;
    const holder = new THREE.Group();
    holder.position.set(o.x, 0, o.z);
    holder.rotation.y = o.rot;
    const frameMat = o.glass ? M.metal : wood;
    const leafW = W - 0.08, LH = DOOR_H - 0.12;
    for (const sx of [-1, 1]) holder.add(unitBox(frameMat, 0.07, DOOR_H, o.t + 0.04, sx * (W / 2 - 0.035), DOOR_H / 2, 0));
    if (!o.inner) holder.add(unitBox(frameMat, W, 0.08, o.t + 0.04, 0, DOOR_H - 0.04, 0));
    const pivot = new THREE.Group();
    pivot.position.set(-W / 2 + 0.05, 0.02, 0);
    if (o.glass) {
      pivot.add(unitBox(doorGlass, leafW, LH, 0.03, leafW / 2, LH / 2, 0));
      for (const y of [0.06, LH - 0.06]) pivot.add(unitBox(M.metal, leafW, 0.12, 0.06, leafW / 2, y, 0));
      for (const x of [0.06, leafW - 0.06]) pivot.add(unitBox(M.metal, 0.1, LH, 0.06, x, LH / 2, 0));
    } else {
      pivot.add(unitBox(wood, leafW, LH, 0.05, leafW / 2, LH / 2, 0));
      for (const zz of [0.03, -0.03]) {
        for (const [py, ph] of [[LH * 0.26, LH * 0.34], [LH * 0.72, LH * 0.36]] as const) pivot.add(unitBox(M.doorPanel, leafW - 0.3, ph, 0.015, leafW / 2, py, zz));
      }
    }
    pivot.add(unitBox(M.metal, 0.06, 0.06, 0.13, leafW - 0.12, 1.0, 0));
    holder.add(pivot);
    group.add(holder);
    const alongX = Math.abs(Math.sin(o.rot)) < 0.5;
    const plug: Box = { x: o.x, z: o.z, w: alongX ? W : o.t, d: alongX ? o.t : W, sight: true };
    if (o.lv !== undefined) plug.lv = o.lv;
    colliders.push(plug);
    const wanted = this.doorWanted.get(key) ?? false;
    const hp = this.doorHp.get(key) ?? 100;
    const d: DoorView = {
      pivot, sliding: false, x: o.x, z: o.z, open: wanted ? 1 : 0, wanted, plug, key, hp, broken: wanted && hp <= 0, cracks: [new THREE.Group(), new THREE.Group()],
      shake: 0, fell: false, torn: hp <= -1, locked: !o.inner && !wanted && (this.doorLock.get(key) ?? lockedAtStart(v.spec.kind, key)), inner: true,
    };
    if (wanted) {
      plug.off = true;
      pivot.rotation.y = DOOR_ANGLE;
    }
    if (d.torn) {
      pivot.visible = false;
      plug.off = true;
    }
    v.innerDoors.push(d);
  }

  /** Baut Innenleben (und für obere Etagen auch die echten Außenwände) einer Etage. */
  private addLevel(v: BuildingView, f: number): void {
    const b = v.spec;
    const { group, colliders, containers } = v.chunk;
    const lvl = buildLevel(b, f, this.gone, v.keyPrefix, this.wallDamage, this.wallHole);
    group.add(lvl.group);
    colliders.push(...lvl.colliders);
    for (const { index, prop: p } of lvl.props) {
      const key = `${v.keyPrefix}:${index}`;
      let loot = this.lootState.get(key);
      if (!loot) this.lootState.set(key, (loot = p.loot.map((s) => ({ ...s }))));
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.set(p.x, p.h + 0.55, p.z);
      marker.visible = false;
      lvl.group.add(marker);
      containers.push({ key, name: PROP_KINDS[p.kind].name, kind: p.kind, x: p.x, z: p.z, loot, marker, level: f });
    }
    let sides = v.facade.sides;
    if (v.levels[f]) sides = v.levels[f].sides; // Neuaufbau: Außenwände bleiben
    else if (f > 0) {
      sides = v.facade.floorSides(f);
      for (const s of sides) group.add(s.group);
    }
    v.levels[f] = { interior: lvl.group, sides, rooms: lvl.rooms, walls: lvl.walls, colliders: lvl.colliders };
  }

  /** Baut das Innenleben einer Etage neu auf (nach dem Abriss von Möbeln oder Wänden) */
  private rebuildLevel(v: BuildingView, f: number): void {
    const old = v.levels[f];
    if (!old) return;
    v.chunk.group.remove(old.interior);
    old.interior.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.ownGeo) o.geometry.dispose();
    });
    const drop = new Set(old.colliders);
    const cols = v.chunk.colliders;
    for (let i = cols.length - 1; i >= 0; i--) if (drop.has(cols[i])) cols.splice(i, 1);
    const conts = v.chunk.containers;
    for (let i = conts.length - 1; i >= 0; i--) {
      if (conts[i].level === f && conts[i].key.startsWith(`${v.keyPrefix}:`) && /:\d+$/.test(conts[i].key)) conts.splice(i, 1);
    }
    this.addLevel(v, f);
  }

  /** Bett oder Sofa in Reichweite, auf dem man schlafen kann (nächstes zuerst) */
  sleepSpotNear(x: number, z: number, range: number, level: number): { x: number; z: number; name: string; good: boolean } | null {
    let best: { x: number; z: number; name: string; good: boolean } | null = null;
    let bd = range;
    const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const v of this.chunks.get(`${pcx + dx},${pcz + dz}`)?.buildings ?? []) {
          if (!v.levels[level]) continue;
          v.spec.props.forEach((p, i) => {
            const kind = PROP_KINDS[p.kind];
            if ((kind.id !== 'bed' && kind.id !== 'sofa') || p.level !== level || this.gone.has(`${v.keyPrefix}:${i}`)) return;
            const d = Math.hypot(Math.max(0, Math.abs(x - p.x) - p.w / 2), Math.max(0, Math.abs(z - p.z) - p.d / 2));
            if (d < bd) {
              bd = d;
              best = { x: p.x, z: p.z, name: kind.name, good: kind.id === 'bed' };
            }
          });
        }
      }
    }
    return best;
  }

  /**
   * Was sich in der Nähe abreißen lässt: Möbel und Zimmerwände des Stockwerks. Holzmöbel gehen mit Axt oder Brecheisen,
   * alles andere (Wände, Metall, Keramik) braucht den Vorschlaghammer.
   */
  demolishablesNear(x: number, z: number, range: number, level: number): Demolishable[] {
    const out: Demolishable[] = [];
    const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
    const gap = (b: Box): number => Math.hypot(Math.max(0, Math.abs(x - b.x) - b.w / 2), Math.max(0, Math.abs(z - b.z) - b.d / 2));
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const v of this.chunks.get(`${pcx + dx},${pcz + dz}`)?.buildings ?? []) {
          if (!v.levels[level]) continue;
          v.spec.props.forEach((p, i) => {
            const key = `${v.keyPrefix}:${i}`;
            if (p.level !== level || this.gone.has(key) || gap(p) > range) return;
            const kind = PROP_KINDS[p.kind];
            if (kind.id === 'car') return;
            const wooden = WOODEN.has(kind.id);
            const vol = p.w * p.d * p.h;
            const give: Stack[] = wooden
              ? [{ id: 'wood', qty: Math.max(1, Math.min(4, Math.round(vol * 1.1))) }, { id: 'nails', qty: Math.max(1, Math.round(vol * 2)) }]
              : [{ id: 'scrap', qty: Math.max(1, Math.min(4, Math.round(vol * 1.6))) }];
            if (kind.id === 'sofa' || kind.id === 'bed') give.push({ id: 'cloth', qty: kind.id === 'bed' ? 3 : 2 });
            out.push({ key, kind: 'prop', name: kind.name, x: p.x, z: p.z, w: p.w, d: p.d, h: p.h, level, wooden, seconds: wooden ? 2.5 + vol * 2.5 : 5 + vol * 3, give, loot: this.lootState.get(key) ?? p.loot, view: v, frac: 0 });
          });
          const part = v.spec.partitions.find((q) => q.level === level);
          part?.boxes.forEach((box, i) => {
            const base = `${v.keyPrefix}:w${level}:${i}`;
            if (this.gone.has(base)) return;
            // lange Wände bestehen aus Abschnitten (siehe wallSections), jeder ist ein eigenes Ziel
            const secs = wallSections(box, part.boxes);
            secs.forEach((bx, j) => {
              const key = secs.length === 1 ? base : `${base}.${j}`;
              if (this.gone.has(key) || gap(bx) > range) return;
              const len = Math.max(bx.w, bx.d);
              out.push({ key, kind: 'wall', name: 'Wandabschnitt', x: bx.x, z: bx.z, w: bx.w, d: bx.d, h: 2.7, level, wooden: false, seconds: 6 + len * 1.2, give: [{ id: 'wood', qty: Math.max(1, Math.round(len / 1.5)) }, { id: 'nails', qty: Math.round(len * 2) }], loot: [], view: v, frac: this.wallDamage.get(key) ?? 0 });
            });
          });
        }
      }
    }
    return out;
  }

  /** Wand beschädigt: Loch in der Größe von `frac` (0..1) einbauen */
  setWallDamage(d: Demolishable, frac: number, at?: number): void {
    // das Loch sitzt an der ersten Trefferstelle und wächst von dort
    if (at !== undefined && !this.wallHole.has(d.key)) this.wallHole.set(d.key, Math.min(1, Math.max(0, at)));
    this.wallDamage.set(d.key, frac);
    d.frac = frac;
    this.navVer++;
    this.rebuildLevel(d.view, d.level);
  }

  /** Abgerissen: aus der Welt nehmen (bleibt im Spielstand) und das Stockwerk neu aufbauen */
  demolish(d: Demolishable): void {
    this.gone.add(d.key);
    this.wallDamage.delete(d.key);
    this.wallHole.delete(d.key);
    this.navVer++;
    this.rebuildLevel(d.view, d.level);
  }
}
