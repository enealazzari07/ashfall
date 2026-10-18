import * as THREE from 'three';
import type { Prop } from '../world/CityGenerator';
import { AMMOBOX, SUPPLY_CRATE } from '../world/crateModels';
import { worldMesh, worldModelsReady } from './WorldModels';

/**
 * Waffenkisten aus den "Supply Crates" von Vicevoxel: Munitionskiste aus Holz mit Schablonenschrift
 * und blauer Metallkoffer "Weapon Upgrade". Die Netze stammen aus den FBX-Dateien (normiert auf 1×1×1),
 * die Texturen aus den darin eingebetteten Bildern (public/models/crates).
 */
const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || './';

interface Def { data: { pos: number[]; uv: number[]; idx: number[] }; tex: string }
const DEFS: Record<string, Def> = {
  weaponcrate: { data: AMMOBOX, tex: 'ammobox.jpg' },
  weaponcase: { data: SUPPLY_CRATE, tex: 'supply.jpg' },
};

export const CRATE_KINDS = new Set(Object.keys(DEFS));

/** Regale, Spinde und Kartons aus world.glb: Modellname und Maße des Originals (Meter) */
type ModelDef = { name: string; w: number; h: number; d: number };
const pick = <T,>(p: Prop, list: T[]): T => list[Math.abs(Math.floor(p.x * 5 + p.z * 11)) % list.length];
const M = (name: string, w: number, h: number, d: number): ModelDef => ({ name, w, h, d });
// Lagerhaus-Modelle (warehouse_low): Maße in Metern
const BARRELS = [M('teraccgda', 0.58, 0.88, 0.58), M('teufceuda', 0.59, 0.88, 0.59), M('tewscfuda', 0.62, 0.88, 0.66), M('ui1maewga', 0.58, 0.89, 0.6), M('uizhacnga', 0.57, 0.88, 0.61), M('vgyiciqaw', 0.48, 0.64, 0.48), M('vijnbi3', 0.58, 0.84, 0.58), M('vijnbjz', 0.59, 0.85, 0.59), M('virvfjk', 0.48, 0.58, 0.34)];
const BIG_BOXES = [M('vgyidauaw', 1.24, 0.62, 0.84), M('vh3lbfy', 0.83, 0.77, 0.66), M('vhtibbe', 0.89, 0.73, 0.73)];
const RACKS = [M('wbslaikga', 1.58, 2.59, 1.04), M('vhtmaifaw', 2.03, 1.8, 0.76)];
const PALLETS = [M('vh1icei', 1.16, 0.13, 0.76), M('vh1jeck', 1.23, 0.14, 1.18), M('vh1jegi', 1.05, 0.13, 0.76)];
const CRATES = [M('vh2jfg1s', 0.61, 0.26, 0.42), M('vifpcdyaw', 0.4, 0.27, 0.31), M('vifpceyaw', 0.41, 0.27, 0.31), M('vifpcfpaw', 0.38, 0.25, 0.29)];

/** Regale, Spinde, Kartons und Lagerhaus-Objekte: Modell und Maße des Originals */
const MODELS: Record<string, (p: Prop) => ModelDef> = {
  shelf: () => M('rack', 1.73, 2.13, 1.21),
  rack: (p) => pick(p, RACKS),
  barrel: (p) => pick(p, BARRELS),
  crate: (p) => pick(p, BIG_BOXES),
  locker: (p) => (Math.abs(Math.floor(p.x * 5 + p.z * 11)) % 5 < 2 ? M('locker_o', 0.48, 1.99, 0.43) : M('locker_c', 0.48, 1.99, 0.43)),
  cardbox: () => M('cardbox', 1.37, 1.26, 1.91),
  whpallet: (p) => pick(p, PALLETS),
  whcrates: (p) => pick(p, CRATES),
  whtruck: () => M('virqcfw', 0.51, 1.05, 0.63),
  whgas: () => M('vizqehw', 0.3, 0.45, 0.3),
  whladder: () => M('vh2jfjes', 0.49, 1.72, 1.08),
  whtable: () => M('wbuidixga', 1.52, 0.77, 0.88),
  whstool: () => M('ukknbeyaw', 0.39, 0.58, 0.35),
};

/** Wird dieses Möbelstück als Modell gezeichnet (statt als einfache Boxen)? */
export const usesModel = (kindId: string): boolean => CRATE_KINDS.has(kindId) || (!!MODELS[kindId] && worldModelsReady());

const geos = new Map<string, THREE.BufferGeometry>();
const texs = new Map<string, THREE.Texture>();

function geoOf(kind: string): THREE.BufferGeometry {
  let g = geos.get(kind);
  if (!g) {
    const d = DEFS[kind].data;
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
    g.setIndex(d.idx);
    g.computeVertexNormals();
    geos.set(kind, g);
  }
  return g;
}

function texOf(kind: string): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  let t = texs.get(kind);
  if (!t) {
    t = new THREE.TextureLoader().load(`${BASE}models/crates/${DEFS[kind].tex}`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texs.set(kind, t);
  }
  return t;
}

/** Textur-Kiste für ein Möbelstück dieser Art (oder null). Das Material wird mit zurückgegeben, damit Räume es abdunkeln können. */
export function crateProp(kindId: string, p: Prop): { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial } | null {
  const md = MODELS[kindId];
  if (md && worldModelsReady()) {
    const def = md(p);
    const mesh = worldMesh(def.name);
    if (!mesh) return null;
    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
    mesh.material = mat;
    mesh.position.set(p.x, 0, p.z);
    mesh.rotation.y = p.yaw;
    mesh.scale.set(p.lw / def.w, p.h / def.h, p.ld / def.d);
    return { mesh, mat };
  }
  if (!CRATE_KINDS.has(kindId)) return null;
  const map = texOf(kindId);
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.78, metalness: kindId === 'weaponcase' ? 0.35 : 0.02, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geoOf(kindId), mat);
  mesh.position.set(p.x, 0, p.z);
  mesh.rotation.y = p.yaw;
  mesh.scale.set(p.lw, p.h, p.ld);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, mat };
}
