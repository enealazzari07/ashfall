import { SPRITE_SETS, spriteProp } from '../render/SpriteProps';
import { crateProp, usesModel } from '../render/CrateProps';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  Box, BuildingSpec, DOOR_H, FLOOR_H, PROP_KINDS, Prop, Rect, Room, RoomType, STAIR_RISE, StairPlan, innerRect, laneRect,
} from './CityGenerator';
import { makeBox, planeXZ } from '../render/geo';
import { mats } from '../render/Materials';
import { decorGeometry, propsGeometry } from './Props';

export interface LevelBuild {
  /** Zimmerwände: der obere Teil (ab einem Drittel der Höhe) wird für Wände zur Kamera hin ausgeblendet */
  walls: { x: number; z: number; high: THREE.Object3D }[];
  /** Pro Raum die eigenen Materialien: Räume, in denen man nicht steht, werden abgedunkelt */
  rooms: { room: Room; mats: THREE.MeshStandardMaterial[]; dim: boolean }[];
  /** Boden, Möbel, Trennwand, Treppe, Geländer; Ursprung auf Höhe des Stockwerks */
  group: THREE.Group;
  colliders: Box[];
  /** Möbel dieses Stockwerks mit ihrem Index in `spec.props` */
  props: { index: number; prop: Prop }[];
}

const RAIL_H = 0.95;
const RAIL_T = 0.06;
const stepMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.7 }); // Trittflächen
const riserMat = new THREE.MeshStandardMaterial({ color: 0x2e2016, roughness: 0.9 }); // Setzstufen und Wangen
const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.7 }); // Pfosten, Sprossen
const handMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.55 }); // Handlauf
const trimMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.8 }); // Einfassung der Deckenöffnung

/** Balken von a nach b (w × h im Querschnitt) als Geometrie in Weltlage */
function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number): THREE.BufferGeometry {
  const dir = b.clone().sub(a);
  const len = Math.max(0.001, dir.length());
  const g = new THREE.BoxGeometry(w, h, len);
  // Querschnitt aufrecht halten: Balken um die z-Achse neigen, nicht verdrehen
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

interface RailSet { posts: THREE.BufferGeometry[]; hands: THREE.BufferGeometry[] }
const newRails = (): RailSet => ({ posts: [], hands: [] });

/**
 * Geländer von a nach b (a, b = Fußpunkte, y darf steigen): Pfosten an den Enden und alle ~1,2 m, Handlauf,
 * Fußleiste und senkrechte Sprossen. Eben für Deckenöffnungen, schräg für Treppen.
 */
function railing(set: RailSet, a: THREE.Vector3, b: THREE.Vector3, h = 0.95, openEnd = false): void {
  const len = a.distanceTo(b);
  const up = (v: THREE.Vector3, k: number): THREE.Vector3 => v.clone().add(new THREE.Vector3(0, k, 0));
  const at = (t: number): THREE.Vector3 => a.clone().lerp(b, t);
  const nPost = Math.max(1, Math.round(len / 1.2));
  for (let i = 0; i <= nPost; i++) {
    if (openEnd && i === nPost) continue;
    const p = at(i / nPost);
    set.posts.push(new THREE.BoxGeometry(0.08, h + 0.05, 0.08).translate(p.x, p.y + (h + 0.05) / 2, p.z));
  }
  set.hands.push(beam(up(a, h + 0.03), up(b, h + 0.03), 0.07, 0.05));
  set.posts.push(beam(up(a, 0.12), up(b, 0.12), 0.05, 0.05));
  const n = Math.floor(len / 0.15);
  for (let i = 1; i < n; i++) {
    const p = at(i / n);
    set.posts.push(new THREE.BoxGeometry(0.025, h - 0.12, 0.025).translate(p.x, p.y + 0.12 + (h - 0.12) / 2, p.z));
  }
}

function flushRails(group: THREE.Group, set: RailSet): void {
  for (const [list, mat] of [[set.posts, postMat], [set.hands, handMat]] as const) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list, false)!, mat);
    m.userData.ownGeo = true;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
}
const unit = new THREE.BoxGeometry(1, 1, 1);
const skirtingMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.8 });

type FloorKind = 'wood' | 'tile' | 'carpet' | 'concrete' | 'dirt' | 'planks';
const FLOOR_OF: Record<RoomType, FloorKind> = {
  living: 'wood', bedroom: 'wood', hall: 'wood', corridor: 'carpet', kitchen: 'tile', bath: 'tile', storage: 'concrete',
  shop: 'tile', office: 'carpet', meeting: 'carpet', lobby: 'tile', hotelroom: 'carpet', factory: 'concrete', garage: 'concrete', barn: 'dirt',
};

function ownBox(w: number, h: number, d: number, tu: number, tv: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(makeBox(w, h, d, tu, tv), mat);
  m.userData.ownGeo = true;
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Querschnitt-Geländer/Seitenwand entlang einer Linie: u-Bereich, fester v-Wert. */
function lineBox(plan: StairPlan, u0: number, u1: number, v: number, t: number, lv: number): Box {
  const len = u1 - u0, uc = (u0 + u1) / 2;
  return plan.axis === 'z' ? { x: v, z: uc, w: t, d: len, lv } : { x: uc, z: v, w: len, d: t, lv };
}

/** Quer über den Lauf (Geländer am unteren Ende des Lochs) */
function crossBox(plan: StairPlan, u: number, v0: number, v1: number, t: number, lv: number): Box {
  const vc = (v0 + v1) / 2, vl = v1 - v0;
  return plan.axis === 'z' ? { x: vc, z: u, w: vl, d: t, lv } : { x: u, z: vc, w: t, d: vl, lv };
}

/** Rechteck ohne die Öffnung `hole` (bis zu vier Streifen) */
function floorPieces(r: Rect, hole: Rect | null): Rect[] {
  if (!hole || hole.x1 <= r.x0 || hole.x0 >= r.x1 || hole.z1 <= r.z0 || hole.z0 >= r.z1) return [r];
  const hx0 = Math.max(r.x0, hole.x0), hx1 = Math.min(r.x1, hole.x1), hz0 = Math.max(r.z0, hole.z0), hz1 = Math.min(r.z1, hole.z1);
  return [
    { x0: r.x0, x1: r.x1, z0: r.z0, z1: hz0 },
    { x0: r.x0, x1: r.x1, z0: hz1, z1: r.z1 },
    { x0: r.x0, x1: hx0, z0: hz0, z1: hz1 },
    { x0: hx1, x1: r.x1, z0: hz0, z1: hz1 },
  ];
}

function place(mesh: THREE.Mesh, b: Box, y: number, h: number): THREE.Mesh {
  mesh.position.set(b.x, y + h / 2, b.z);
  return mesh;
}


/** Längster Wandabschnitt, der sich als Ganzes einschlagen lässt (Meter) */
export const WALL_SECTION = 3;

/**
 * Teilt eine Trennwand in Abschnitte: an Stellen, wo andere Wände im rechten Winkel anstoßen (dort endet ein Zimmer),
 * und höchstens WALL_SECTION m lang. Türöffnungen trennen Wandstücke schon von selbst.
 */
export function wallSections(box: Box, all: Box[]): Box[] {
  const alongX = box.w >= box.d;
  const len = alongX ? box.w : box.d;
  const c0 = (alongX ? box.x : box.z) - len / 2;
  const lineC = alongX ? box.z : box.x;
  const cuts: number[] = [];
  for (const o of all) {
    if (o === box || o.w >= o.d === alongX) continue; // nur Wände im rechten Winkel
    const across = alongX ? o.z : o.x;
    const half = (alongX ? o.d : o.w) / 2;
    if (Math.abs(across - lineC) > half + 0.3) continue; // trifft die Linie unserer Wand nicht
    const t = (alongX ? o.x : o.z) - c0;
    if (t > 0.6 && t < len - 0.6) cuts.push(Math.round(t * 20) / 20);
  }
  const pts = [0, ...[...new Set(cuts)].sort((a, b) => a - b), len];
  const out: Box[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = pts[i + 1] - pts[i];
    const n = Math.max(1, Math.ceil(seg / WALL_SECTION - 1e-6));
    for (let k = 0; k < n; k++) {
      const t0 = pts[i] + (seg * k) / n, t1 = pts[i] + (seg * (k + 1)) / n;
      out.push(alongX ? { ...box, x: c0 + (t0 + t1) / 2, w: t1 - t0 } : { ...box, z: c0 + (t0 + t1) / 2, d: t1 - t0 });
    }
  }
  return out;
}

const crumbleMat = new THREE.MeshStandardMaterial({ color: 0xcfc8ba, roughness: 1 });
const brickMat = new THREE.MeshStandardMaterial({ color: 0x8c5a48, roughness: 1 });

/**
 * Trennwand mit Loch: je mehr Treffer (`frac` 0..1), desto größer das Loch, es wächst vom Boden her.
 * Das Loch bleibt versperrt, bis es breit genug und nah genug am Boden ist, um durchzusteigen. Dazu Bruchkanten und Schutt.
 */
function holedWall(group: THREE.Group, walls: LevelBuild['walls'], colliders: Box[], box: Box, frac: number, wi: number, f: number, wallMat: THREE.Material, at = 0.5): void {
  const LOW = FLOOR_H / 3;
  const alongX = box.w >= box.d;
  const len = alongX ? box.w : box.d, th = alongX ? box.d : box.w;
  const hw = Math.min(len - 0.3, 0.45 + (len - 0.6) * frac); // Lochbreite entlang der Wand
  const hb = Math.max(0, 1.05 - frac * 1.5); // Unterkante des Lochs
  const ht = Math.min(FLOOR_H - 0.35, 1.7 + frac * 0.9); // Oberkante
  const seg = (t0: number, t1: number): Box | null =>
    t1 - t0 < 0.03 ? null : alongX ? { x: box.x - len / 2 + (t0 + t1) / 2, z: box.z, w: t1 - t0, d: box.d } : { x: box.x, z: box.z - len / 2 + (t0 + t1) / 2, w: box.w, d: t1 - t0 };
  // Mitte des Lochs dort, wo man hingeschlagen hat (`at` = Anteil entlang der Wand), mit etwas Rand zu den Enden
  const cc = Math.min(len - hw / 2 - 0.15, Math.max(hw / 2 + 0.15, at * len));
  const hc = cc - len / 2; // Mitte des Lochs relativ zur Wandmitte
  const a = cc - hw / 2, c = cc + hw / 2;
  for (const sd of [seg(0, a), seg(c, len)]) {
    if (!sd) continue;
    group.add(place(ownBox(sd.w, LOW, sd.d, 4, 1, wallMat), sd, 0, LOW));
    group.add(place(ownBox(sd.w + 0.03, 0.11, sd.d + 0.03, 1, 1, skirtingMat), sd, 0, 0.11));
    const high = place(ownBox(sd.w, FLOOR_H - LOW, sd.d, 4, 2, wallMat), sd, LOW, FLOOR_H - LOW);
    group.add(high);
    walls.push({ x: sd.x, z: sd.z, high });
    colliders.push({ ...sd, lv: f, sight: true });
  }
  const hs = seg(a, c);
  if (!hs) return;
  const top = place(ownBox(hs.w, FLOOR_H - ht, hs.d, 4, 1, wallMat), hs, ht, FLOOR_H - ht);
  group.add(top);
  walls.push({ x: hs.x, z: hs.z, high: top });
  if (hb > 0.02) group.add(place(ownBox(hs.w, hb, hs.d, 4, 1, wallMat), hs, 0, hb));
  // Das Loch bleibt zu, solange man nicht durchsteigen kann
  if (hb > 0.45 || hw < 0.95) colliders.push({ ...hs, lv: f });
  // Bruchkanten: helle Putzstücke und Ziegel rund um das Loch
  let seed = (wi + 1) * 7919 + Math.round(frac * 100) * 31;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const bits = 6 + Math.round(frac * 14);
  for (let i = 0; i < bits; i++) {
    const side = i % 4; // 0 oben, 1 unten, 2 links, 3 rechts
    if (side === 1 && hb <= 0.02) continue;
    const u = (rnd() - 0.5) * hw;
    const y = side === 0 ? ht : side === 1 ? hb : hb + rnd() * (ht - hb);
    const t = hc + (side === 2 ? -hw / 2 : side === 3 ? hw / 2 : u);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06 + rnd() * 0.16, 0.06 + rnd() * 0.12, th + 0.05 + rnd() * 0.06), rnd() < 0.35 ? brickMat : crumbleMat);
    m.userData.ownGeo = true;
    m.position.set(alongX ? box.x + t : box.x, y, alongX ? box.z : box.z + t);
    m.rotation.set(0, alongX ? 0 : Math.PI / 2, (rnd() - 0.5) * 1.2);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  // Schutt am Boden beidseits der Wand
  const rubble = 4 + Math.round(frac * 16);
  for (let i = 0; i < rubble; i++) {
    const t = hc + (rnd() - 0.5) * (hw + 0.8), off = (rnd() < 0.5 ? -1 : 1) * (th / 2 + 0.1 + rnd() * 0.45);
    const sz = 0.05 + rnd() * 0.14;
    const m = new THREE.Mesh(new THREE.BoxGeometry(sz, sz * 0.7, sz * (0.6 + rnd() * 0.8)), rnd() < 0.4 ? brickMat : crumbleMat);
    m.userData.ownGeo = true;
    m.position.set(alongX ? box.x + t : box.x + off, 0.06 + sz * 0.3, alongX ? box.z + off : box.z + t);
    m.rotation.set(rnd() * 0.6, rnd() * 3, rnd() * 0.6);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
}

/** Baut ein Stockwerk: Decke/Boden mit Treppenloch, Trennwand, Möbel und den Treppenlauf nach oben. */
/** `gone`: zerstörte Möbel (`<prefix>:<Index>`) und Trennwände (`<prefix>:w<Etage>:<Index>`), die nicht mehr aufgebaut werden */
export function buildLevel(b: BuildingSpec, f: number, gone?: Set<string>, prefix = '', damage?: Map<string, number>, holes?: Map<string, number>): LevelBuild {
  const M = mats();
  const group = new THREE.Group();
  group.position.y = f * FLOOR_H;
  const colliders: Box[] = [];
  const props: LevelBuild['props'] = [];
  const plan = b.stairs;

  // Boden der Etage (Erdgeschoss hat seine eigene Bodenplatte) mit Loch für die ankommende Treppe
  if (f >= 1) {
    const ir = innerRect(b);
    const hole: Rect | null = plan ? laneRect(plan, ((f - 1) % 2) as 0 | 1) : null;
    const strips: Rect[] = hole
      ? [
        { x0: ir.x0, x1: ir.x1, z0: ir.z0, z1: hole.z0 },
        { x0: ir.x0, x1: ir.x1, z0: hole.z1, z1: ir.z1 },
        { x0: ir.x0, x1: hole.x0, z0: hole.z0, z1: hole.z1 },
        { x0: hole.x1, x1: ir.x1, z0: hole.z0, z1: hole.z1 },
      ]
      : [{ x0: ir.x0, x1: ir.x1, z0: ir.z0, z1: ir.z1 }];
    for (const r of strips) {
      const w = r.x1 - r.x0, d = r.z1 - r.z0;
      if (w < 0.02 || d < 0.02) continue;
      const slab = ownBox(w, 0.22, d, 2, 2, M.floor);
      slab.position.set((r.x0 + r.x1) / 2, -0.11, (r.z0 + r.z1) / 2);
      group.add(slab);
    }
    // Geländer um das Treppenloch: Längsseiten und das untere Ende des Lochs; am Ausstieg bleibt es offen.
    // Kollision wie bisher als Linien, sichtbar als Geländer mit Pfosten, Handlauf und Sprossen.
    if (plan) {
      const lane = ((f - 1) % 2) as 0 | 1;
      const l = plan.lanes[lane];
      const bottom = lane === 0 ? plan.u0 : plan.u1;
      const top = lane === 0 ? plan.u1 : plan.u0;
      const rails: Box[] = [
        lineBox(plan, plan.u0, plan.u1, l.v0, RAIL_T, f),
        lineBox(plan, plan.u0, plan.u1, l.v1, RAIL_T, f),
        crossBox(plan, bottom, l.v0, l.v1, RAIL_T, f),
      ];
      for (const r of rails) colliders.push(r);
      const P = (v: number, u: number): THREE.Vector3 => (plan.axis === 'z' ? new THREE.Vector3(v, 0, u) : new THREE.Vector3(u, 0, v));
      const set = newRails();
      railing(set, P(l.v0, bottom), P(l.v0, top), RAIL_H, true);
      railing(set, P(l.v1, bottom), P(l.v1, top), RAIL_H, true);
      railing(set, P(l.v0, bottom), P(l.v1, bottom), RAIL_H);
      flushRails(group, set);
      // Einfassung der Öffnung: dunkle Leiste, damit der Boden sichtbar an der Treppe endet
      const trims: THREE.BufferGeometry[] = [];
      for (const v of [l.v0, l.v1]) trims.push(beam(P(v, plan.u0), P(v, plan.u1), 0.07, 0.04).translate(0, 0.02, 0));
      trims.push(beam(P(l.v0, bottom), P(l.v1, bottom), 0.07, 0.04).translate(0, 0.02, 0));
      const tm = new THREE.Mesh(mergeGeometries(trims, false)!, trimMat);
      tm.userData.ownGeo = true;
      tm.receiveShadow = true;
      group.add(tm);
    }
  }

  // Zimmerwände mit Türöffnungen
  const part = b.partitions.find((q) => q.level === f);
  const walls: LevelBuild['walls'] = [];
  const LOW = FLOOR_H / 3;
  if (part) {
    const solid = (b: Box): void => {
      group.add(place(ownBox(b.w, LOW, b.d, 4, 1, M.interior), b, 0, LOW));
      group.add(place(ownBox(b.w + 0.03, 0.11, b.d + 0.03, 1, 1, skirtingMat), b, 0, 0.11));
      const high = place(ownBox(b.w, FLOOR_H - LOW, b.d, 4, 2, M.interior), b, LOW, FLOOR_H - LOW);
      group.add(high);
      walls.push({ x: b.x, z: b.z, high });
      colliders.push({ ...b, lv: f, sight: true });
    };
    part.boxes.forEach((box, wi) => {
      const wkey = `${prefix}:w${f}:${wi}`;
      if (gone?.has(wkey)) return;
      // Eine lange Wand besteht aus Abschnitten (an Abzweigen und höchstens WALL_SECTION m lang): jeder lässt sich einzeln einschlagen
      const secs = wallSections(box, part.boxes);
      const keyOf = (j: number): string => (secs.length === 1 ? wkey : `${wkey}.${j}`);
      const touched = secs.some((_, j) => gone?.has(keyOf(j)) || (damage?.get(keyOf(j)) ?? 0) > 0);
      if (!touched) return solid(box);
      secs.forEach((sec, j) => {
        const k = keyOf(j);
        if (gone?.has(k)) return;
        const frac = damage?.get(k) ?? 0;
        if (frac > 0 && frac < 1) holedWall(group, walls, colliders, sec, frac, wi * 16 + j, f, M.interior, holes?.get(k) ?? 0.5);
        else solid(sec);
      });
    });
    for (const l of part.lintels) {
      const high = place(ownBox(l.w, FLOOR_H - DOOR_H, l.d, 4, 1, M.interior), l, DOOR_H, FLOOR_H - DOOR_H);
      group.add(high);
      walls.push({ x: l.x, z: l.z, high });
    }
  }

  // Pro Raum: Bodenbelag (Holz, Fliesen, Teppich, Beton), Möbel und Kleinkram als eigene Netze mit eigenen
  // Materialkopien. So lässt sich ein Raum abdunkeln, indem man nur die Farbe seiner Materialien dämpft.
  const FO = f === 0 ? 0.056 : 0.012;
  const floorMat = { wood: M.floor, tile: M.floorTile, carpet: M.floorCarpet, concrete: M.floorConcrete, dirt: M.floorDirt, planks: M.floorPlanks };
  const levelRooms = b.rooms.filter((r) => r.level === f);
  const roomOf = (x: number, z: number) => levelRooms.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) ?? null;
  const levelProps = b.props.map((p, index) => ({ p, index })).filter((e) => e.p.level === f && !gone?.has(`${prefix}:${e.index}`));
  const levelDecor = b.decor.filter((d) => d.level === f);
  const rooms: LevelBuild['rooms'] = [];
  const addMesh = (geo: THREE.BufferGeometry | null, mat: THREE.Material, shadow: boolean) => {
    if (!geo) return;
    const m = new THREE.Mesh(geo, mat);
    m.userData.ownGeo = true;
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
  };
  for (const room of levelRooms) {
    const w = room.x1 - room.x0, d = room.z1 - room.z0;
    if (w < 0.1 || d < 0.1) continue;
    const fk: FloorKind = room.type === 'barn' && room.level > 0 ? 'planks' : FLOOR_OF[room.type];
    const tile = fk === 'concrete' ? 4 : 2;
    const fm = floorMat[fk].clone();
    const pm = M.furniture.clone();
    // Über dem Treppenloch gibt es keinen Boden: der Belag wird um die Öffnung herum verlegt
    const hole = f >= 1 && plan ? laneRect(plan, ((f - 1) % 2) as 0 | 1) : null;
    for (const pc of floorPieces({ x0: room.x0, x1: room.x1, z0: room.z0, z1: room.z1 }, hole)) {
      const pw = pc.x1 - pc.x0, pd = pc.z1 - pc.z0;
      if (pw < 0.02 || pd < 0.02) continue;
      addMesh(planeXZ(pw, pd, Math.max(1, Math.round((tile * pw) / w)), Math.max(1, Math.round((tile * pd) / d))).translate((pc.x0 + pc.x1) / 2, FO, (pc.z0 + pc.z1) / 2), fm, false);
    }
    const roomProps = levelProps.filter((e) => roomOf(e.p.x, e.p.z) === room).map((e) => e.p);
    const spriteMats: THREE.MeshLambertMaterial[] = [];
    for (const sp of roomProps) {
      const s = spriteProp(PROP_KINDS[sp.kind].id, sp);
      if (!s) continue;
      s.mesh.position.y += FO;
      group.add(s.mesh);
      spriteMats.push(s.mat);
    }
    for (const cp of roomProps) {
      const c = crateProp(PROP_KINDS[cp.kind].id, cp);
      if (!c) continue;
      c.mesh.position.y += FO;
      group.add(c.mesh);
      spriteMats.push(c.mat as unknown as THREE.MeshLambertMaterial);
    }
    const pg = propsGeometry(roomProps.filter((q) => !SPRITE_SETS[PROP_KINDS[q.kind].id] && !usesModel(PROP_KINDS[q.kind].id)));
    pg?.translate(0, FO, 0);
    addMesh(pg, pm, true);
    const dg = decorGeometry(levelDecor.filter((x) => roomOf(x.x, x.z) === room));
    dg?.translate(0, FO, 0);
    addMesh(dg, pm, true);
    rooms.push({ room, mats: [fm, pm, ...spriteMats] as THREE.MeshStandardMaterial[], dim: false });
  }
  // Möbel und Kleinkram, die in keinem Raum liegen (Randfälle)
  for (const e of levelProps.filter((q) => !roomOf(q.p.x, q.p.z))) {
    const c = crateProp(PROP_KINDS[e.p.kind].id, e.p);
    if (c) {
      c.mesh.position.y += FO;
      group.add(c.mesh);
    }
  }
  const loose = propsGeometry(levelProps.filter((e) => !roomOf(e.p.x, e.p.z)).map((e) => e.p).filter((q) => !SPRITE_SETS[PROP_KINDS[q.kind].id] && !usesModel(PROP_KINDS[q.kind].id)));
  loose?.translate(0, FO, 0);
  addMesh(loose, M.furniture, true);
  const looseDecor = decorGeometry(levelDecor.filter((x) => !roomOf(x.x, x.z)));
  looseDecor?.translate(0, FO, 0);
  addMesh(looseDecor, M.furniture, true);
  for (const { p, index } of levelProps) {
    colliders.push(p);
    props.push({ index, prop: p });
  }

  // Treppenlauf hinauf zur nächsten Etage
  if (plan && f < b.floors - 1) buildFlight(group, colliders, plan, f);

  return { group, colliders, props, rooms, walls };
}

function buildFlight(group: THREE.Group, colliders: Box[], plan: StairPlan, f: number): void {
  const lane = (f % 2) as 0 | 1;
  const l = plan.lanes[lane];
  const n = 16, rise = STAIR_RISE / n, step = (plan.u1 - plan.u0) / n;
  const width = l.v1 - l.v0, vc = (l.v0 + l.v1) / 2;
  const axisZ = plan.axis === 'z';
  const treads: THREE.BufferGeometry[] = [];
  const bodies: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const top = (i + 1) * rise;
    const u = lane === 0 ? plan.u0 + (i + 0.5) * step : plan.u1 - (i + 0.5) * step;
    // Offene Treppe: Setzstufe (dünne Blende) vorn an jeder Stufe, darauf die helle Trittfläche mit kleiner Vorderkante
    const frontU = lane === 0 ? u - step / 2 + 0.02 : u + step / 2 - 0.02;
    const body = axisZ ? new THREE.BoxGeometry(width, rise, 0.04) : new THREE.BoxGeometry(0.04, rise, width);
    body.translate(axisZ ? vc : frontU, top - rise / 2, axisZ ? frontU : vc);
    bodies.push(body);
    const front = (lane === 0 ? -1 : 1) * 0.03; // Vorderkante steht etwas über
    const tread = axisZ ? new THREE.BoxGeometry(width, 0.05, step + 0.03) : new THREE.BoxGeometry(step + 0.03, 0.05, width);
    tread.translate(axisZ ? vc : u + front / 2, top - 0.025, axisZ ? u + front / 2 : vc);
    treads.push(tread);
  }
  for (const [list, mat] of [[bodies, riserMat], [treads, stepMat]] as const) {
    const m = new THREE.Mesh(mergeGeometries(list, false)!, mat);
    m.userData.ownGeo = true;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }

  // Wangen: schräge Seitenbretter außen am Lauf; darüber Geländer mit Handlauf und Sprossen
  const uStart = lane === 0 ? plan.u0 : plan.u1, uEnd = lane === 0 ? plan.u1 : plan.u0;
  const P = (v: number, u: number, y: number): THREE.Vector3 => (axisZ ? new THREE.Vector3(v, y, u) : new THREE.Vector3(u, y, v));
  const wangen: THREE.BufferGeometry[] = [];
  const set = newRails();
  for (const [v, inward] of [[l.v0, 1], [l.v1, -1]] as const) {
    wangen.push(beam(P(v + inward * 0.02, uStart, 0.12), P(v + inward * 0.02, uEnd, STAIR_RISE - 0.04), 0.05, 0.3));
    railing(set, P(v + inward * 0.05, uStart, 0.0), P(v + inward * 0.05, uEnd, STAIR_RISE), 0.9, true);
    for (const lv of [f, f + 1]) colliders.push(lineBox(plan, plan.u0, plan.u1, v, RAIL_T, lv));
  }
  const wm = new THREE.Mesh(mergeGeometries(wangen, false)!, riserMat);
  wm.userData.ownGeo = true;
  wm.castShadow = true;
  group.add(wm);
  flushRails(group, set);
}

