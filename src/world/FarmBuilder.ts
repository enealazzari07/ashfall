import * as THREE from 'three';
import { Box, CropKind, ChunkSpec } from './CityGenerator';
import { mats } from '../render/Materials';
import { farmAspect, farmTexture } from '../render/FarmAssets';
import { Inst, instanced, makeBox, mat4 } from '../render/geo';

const SEG = 3; // Länge eines Zaunfeldes in Metern
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

/** Zwei gekreuzte Karten: von jeder Kameraseite sichtbar (Pflanzen, Säcke, Leitern). */
function crossed(width: number, height: number): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(width, height).translate(0, height / 2, 0);
  const b = a.clone().rotateY(Math.PI / 2);
  const out = new THREE.BufferGeometry();
  const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [];
  let off = 0;
  for (const g of [a, b]) {
    pos.push(...(g.attributes.position.array as Float32Array));
    uv.push(...(g.attributes.uv.array as Float32Array));
    nor.push(...(g.attributes.normal.array as Float32Array));
    idx.push(...Array.from(g.index!.array as Uint16Array).map((i) => i + off));
    off += g.attributes.position.count;
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

const cardCache = new Map<string, THREE.BufferGeometry>();
const card = (key: string, w: number, h: number, cross = true) => {
  let g = cardCache.get(key);
  if (!g) cardCache.set(key, (g = cross ? crossed(w, h) : new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0)));
  return g;
};

const CROP: Record<CropKind, { h: number; dz: number }> = {
  corn: { h: 2.3, dz: 1.5 }, cornYoung: { h: 1.1, dz: 1.2 }, cornDouble: { h: 2.7, dz: 1.7 }, cornYoungDouble: { h: 1.3, dz: 1.2 },
};

const hash = (n: number) => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

const ownBox = (mat: THREE.Material, b: Box, h: number, y0: number, tile = 2): THREE.Mesh => {
  const m = new THREE.Mesh(makeBox(b.w, h, b.d, tile, tile), mat);
  m.userData.ownGeo = true;
  m.position.set(b.x, y0 + h / 2, b.z);
  m.receiveShadow = true;
  return m;
};

const matCache = new Map<string, THREE.MeshStandardMaterial>();
const floorMat = (name: string) => {
  let m = matCache.get(name);
  if (!m) matCache.set(name, (m = new THREE.MeshStandardMaterial({ map: farmTexture(name, true), roughness: 0.9 })));
  return m;
};

/** Bauernhof-Zubehör eines Chunks: Hofflächen, Äcker mit Mais, Zäune, Heu, Säcke, Leitern, Holzdecks. */
export function buildFarm(spec: ChunkSpec, group: THREE.Group, colliders: Box[]): void {
  const M = mats();

  for (const y of spec.yards) group.add(ownBox(M.floorDirt, y, 0.03, 0, 2.4));

  // Äcker: gepflügte Erde und Maispflanzen als gekreuzte Karten (eine Instanz-Gruppe je Sorte)
  const crops = new Map<CropKind, Inst[]>();
  for (const f of spec.fields) {
    group.add(ownBox(M.fieldDirt, f, 0.045, 0, 2.4));
    const c = CROP[f.crop];
    const w = c.h * farmAspect(f.crop);
    const list = crops.get(f.crop) ?? [];
    for (let x = f.x - f.w / 2 + 0.7; x < f.x + f.w / 2 - 0.5; x += w * 0.92) {
      for (let z = f.z - f.d / 2 + 0.6; z < f.z + f.d / 2 - 0.5; z += c.dz) {
        const k = x * 7.3 + z * 3.1;
        const s = 0.85 + hash(k) * 0.35;
        list.push({ m: mat4(x + (hash(k + 1) - 0.5) * 0.3, 0.04, z + (hash(k + 2) - 0.5) * 0.3, hash(k + 3) * 0.8, s, s * (0.9 + hash(k + 4) * 0.25), s) });
      }
    }
    crops.set(f.crop, list);
  }
  for (const [crop, list] of crops) {
    const c = CROP[crop];
    const im = instanced(card(crop, c.h * farmAspect(crop), c.h), M.card(crop), list, false);
    if (im) group.add(im);
  }

  // Zäune: Karten mit dem Frontbild; kaputte Felder und Tore sind durchgängig
  const fenceInst = new Map<string, Inst[]>();
  for (const fe of spec.fences) {
    const len = Math.hypot(fe.x1 - fe.x0, fe.z1 - fe.z0);
    const n = Math.max(1, Math.round(len / SEG));
    const dx = (fe.x1 - fe.x0) / len, dz = (fe.z1 - fe.z0) / len;
    const ang = Math.atan2(-dz, dx);
    const sl = len / n;
    for (let i = 0; i < n; i++) {
      if (i === fe.gate) continue;
      const broken = hash(fe.seed + i * 7.7) < 0.16;
      const name = `${fe.tall ? 'fenceHigh' : 'fenceLow'}${broken ? 'Broken' : ''}`;
      const cx = fe.x0 + dx * sl * (i + 0.5), cz = fe.z0 + dz * sl * (i + 0.5);
      const list = fenceInst.get(name) ?? [];
      list.push({ m: mat4(cx, 0, cz, ang, sl / SEG, 1, 1) });
      fenceInst.set(name, list);
      if (!broken) {
        const along = Math.abs(dx) > 0.5;
        colliders.push({ x: cx, z: cz, w: along ? sl : 0.25, d: along ? 0.25 : sl, climb: fe.tall ? 1.1 : 0.7 });
      }
    }
  }
  for (const [name, list] of fenceInst) {
    const h = SEG / farmAspect(name);
    const im = instanced(card(name, SEG, h, false), M.card(name), list, true);
    if (im) group.add(im);
  }

  // Heuballen
  const bale = (x: number, y: number, z: number, rot: number, w = 1.2, h = 0.7, d = 0.8) => {
    const m = new THREE.Mesh(boxGeo, M.hay);
    m.scale.set(w, h, d);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = rot;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  };
  for (const h of spec.hay) {
    const c = Math.cos(h.rot), s = Math.sin(h.rot);
    bale(h.x, 0, h.z, h.rot);
    if (h.kind !== 'single') bale(h.x - s * 0.85, 0, h.z - c * 0.85, h.rot + 0.05);
    if (h.kind === 'stack') bale(h.x - s * 0.42, 0.7, h.z - c * 0.42, h.rot + 0.1);
    colliders.push({ x: h.x - s * 0.4, z: h.z - c * 0.4, w: 1.9, d: 1.9 });
  }

  // Säcke und Kisten mit Säcken (durchsuchbar, siehe ChunkManager)
  for (const sk of spec.sacks) {
    const name = sk.crate ? 'sacksCrate' : 'sack';
    const h = sk.crate ? 1.0 : 0.62;
    const mesh = new THREE.Mesh(card(name, h * farmAspect(name), h), M.card(name));
    mesh.position.set(sk.x, 0, sk.z);
    mesh.rotation.y = sk.rot;
    mesh.castShadow = true;
    group.add(mesh);
    colliders.push({ x: sk.x, z: sk.z, w: 0.7, d: 0.7 });
  }

  // Leitern
  for (const l of spec.ladders) {
    const name = l.kind === 'straight' ? 'ladderStraight' : l.kind === 'stand' ? 'ladderStand' : 'ladderStandBroken';
    const w = l.kind === 'straight' ? l.h * 0.4 : l.h * farmAspect(name);
    const mesh = new THREE.Mesh(card(`${name}${l.h.toFixed(1)}`, w, l.h, l.kind !== 'straight'), M.card(name));
    mesh.position.set(l.x, 0, l.z);
    mesh.rotation.y = l.rot;
    mesh.castShadow = true;
    group.add(mesh);
  }

  // Holzdecks (Veranda): Planken, alte Planken oder mit Loch
  for (const d of spec.decks) {
    const tex = d.variant === 'hole' ? 'planksHole' : d.variant === 'old' ? 'planksOld' : 'planks';
    const m = ownBox(floorMat(tex), d, 0.14, 0, 2.2);
    m.castShadow = true;
    group.add(m);
  }
}
