import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Neuer Spielercharakter aus dem "Quantum"-Baukasten (Unreal-Skelett, Maße in cm).
 *
 * So funktioniert der Baukasten:
 *  - `SKM_Body_Full.fbx` enthält das Skelett (66 Knochen), den nackten Körper samt Kopf und die Augen/Zähne.
 *  - Kleidung (Jeans, Hemd, Weste, Taschen, Holster) sind eigene SkinnedMeshes, die dieselben Knochennamen benutzen.
 *    Man zieht sie "an", indem man das Mesh an das Skelett des Körpers bindet (Knochen über den Namen zuordnen)
 *    und es ein- oder ausblendet. Kleidung wechseln = Meshes sichtbar/unsichtbar schalten.
 *  - Die Kappe und die Waffen sind starre Meshes und hängen an einem Knochen (Kopf, Hand).
 *  - Es gibt keine Animationen. Die Bewegung kommt deshalb von der bestehenden prozeduralen Figur (Laufen, Schlagen,
 *    Arbeiten): ihre Gelenkdrehungen werden jedes Bild auf die passenden Knochen übertragen (`KitBody.update`).
 */

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || './';
const SRC = `${BASE}models/kit/`;

/** Texturen je Material (ohne Endung, siehe public/models/kit/tex) */
const TEX: Record<string, { c: string; n?: string; orm?: string; alpha?: boolean }> = {
  M_Body: { c: 'body_c', n: 'body_n', orm: 'body_orm' },
  M_Head: { c: 'head_c', n: 'head_n', orm: 'head_orm' },
  M_Eyeball: { c: 'eye_c', n: 'eye_n' },
  M_Sclera: { c: 'sclera_c' },
  M_Eyelashesh: { c: 'lash_c', alpha: true },
  M_Teeth: { c: 'teeth_c', n: 'teeth_n' },
  M_Jeans: { c: 'jeans_c', n: 'jeans_n', orm: 'jeans_orm' },
  M_Shirt_RolledUp: { c: 'shirt_c', n: 'shirt_n', orm: 'shirt_orm' },
  M_Bulletproof_Light: { c: 'vest_c', n: 'vest_n', orm: 'vest_orm' },
  M_Drops_Tactical: { c: 'drops_c', n: 'drops_n', orm: 'drops_orm' },
  M_Holster_Hard: { c: 'holster_c', n: 'holster_n', orm: 'holster_orm' },
  M_Pistol: { c: 'pistol_c', n: 'pistol_n', orm: 'pistol_orm' },
  M_Cap: { c: 'cap_c', n: 'cap_n', orm: 'cap_orm' },
  Rifle: { c: 'rifle_c', n: 'rifle_n', orm: 'rifle_orm' },
};

/** Kleidungsstücke des Baukastens: Datei, Meshnamen darin */
export const KIT_PARTS: Record<string, { file: string; meshes: string[] }> = {
  jeans: { file: 'SKM_Jeans.fbx', meshes: ['Jeans_Tactic'] },
  shirt: { file: 'SKM_Shirt_RolledUp.fbx', meshes: ['Shirt_RolledUp'] },
  vest: { file: 'SKM_Bulletproof.fbx', meshes: ['Bulletproof'] },
  drops: { file: 'SKM_Drops_1.fbx', meshes: ['Drops_1'] },
  holster: { file: 'SKM_Holster_Hard.fbx', meshes: ['Holster_Hard', 'Pistol_Leg'] },
  cap: { file: 'SM_Cap.fbx', meshes: ['Cap'] },
};

/**
 * Pullover, Pulli, Jacken und Karohemd werden aus dem Baukasten-Hemd abgeleitet (gleiche Passform, Kragen, Naht, Falten):
 * eigene Farbe und Stoffmuster, optional ohne Kragen (Rundhals) und etwas weiter nach außen geschoben (dicker Stoff).
 * `sleeve` = Farbe der Haut-Ärmel darunter (Unterarme werden in Stofffarbe gezeichnet, so wirkt das Hemd langärmlig).
 */
export interface ShirtVariant { color: number; tex: 'knit' | 'plaid' | 'twill'; collar: boolean; push: number; rough: number; repeat: number }
export const SHIRT_VARIANTS: Record<string, ShirtVariant> = {
  sweater: { color: 0x59626e, tex: 'knit', collar: false, push: 0.7, rough: 0.97, repeat: 9 },
  hoodie: { color: 0x3c4658, tex: 'knit', collar: false, push: 0.9, rough: 0.95, repeat: 7 },
  plaid_jacket: { color: 0xffffff, tex: 'plaid', collar: true, push: 0.8, rough: 0.9, repeat: 3 },
  jacket: { color: 0x4a5640, tex: 'twill', collar: true, push: 1.7, rough: 0.82, repeat: 10 },
  leather_jacket: { color: 0x3b2e28, tex: 'twill', collar: true, push: 1.5, rough: 0.5, repeat: 14 },
  denim_jacket: { color: 0x7f9bc4, tex: 'twill', collar: true, push: 1.2, rough: 0.9, repeat: 12 },
  raincoat: { color: 0xf0c93a, tex: 'twill', collar: true, push: 2.1, rough: 0.35, repeat: 6 },
  /** T-Shirt in Spielerfarbe (Schlüssel `shirt:tee@RRGGBB`), Passform wie das Baukasten-Hemd */
  tee: { color: 0xc9c2b4, tex: 'twill', collar: true, push: 0.1, rough: 0.9, repeat: 14 },
};

/** Schlüssel mit Farbe: `shirt:sweater@8c3b34` oder `jeans@d8c39a` -> Grundname und Farbe */
function splitKey(key: string): { base: string; color?: number } {
  const [base, hex] = key.split('@');
  return { base, color: hex ? parseInt(hex, 16) : undefined };
}
const tintMats = new Map<string, THREE.Material>();
/** Kleidungsstück des Baukastens in anderer Farbe: Material kopieren, Farbe multipliziert die Textur */
function tintMaterial(key: string, src: THREE.Material | THREE.Material[], color: number): THREE.Material {
  let m = tintMats.get(key);
  if (!m) {
    const c = (Array.isArray(src) ? src[0] : src).clone() as THREE.MeshStandardMaterial;
    c.color.setHex(color);
    tintMats.set(key, (m = c));
  }
  return m;
}

/** Westen aus dem Baukasten-Modell, in anderer Farbe (Stoff statt Tarnmuster, Normalen und Taschen bleiben) */
const VEST_VARIANTS: Record<string, number> = { work: 0xff7a1a };
const vestMats = new Map<string, THREE.Material>();
function vestMaterial(key: string, src: THREE.Material | THREE.Material[], color: number): THREE.Material {
  let m = vestMats.get(key);
  if (!m) {
    const base = (Array.isArray(src) ? src[0] : src) as THREE.MeshStandardMaterial;
    const c = base.clone();
    c.map = null;
    c.color.setHex(color);
    c.metalness = 0;
    c.metalnessMap = null;
    c.roughness = 0.7;
    vestMats.set(key, (m = c));
  }
  return m;
}

const variantTex = new Map<string, THREE.CanvasTexture>();
function variantTexture(kind: ShirtVariant['tex']): THREE.CanvasTexture {
  let t = variantTex.get(kind);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = kind === 'plaid' ? '#8e2f2a' : '#c8c8c8';
  g.fillRect(0, 0, 128, 128);
  if (kind === 'knit') {
    // Rippenstrick: senkrechte Maschenreihen mit leichter Schattierung
    for (let x = 0; x < 128; x += 4) {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(x, 0, 1, 128);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x + 2, 0, 1, 128);
    }
    for (let y = 0; y < 128; y += 4) for (let x = 0; x < 128; x += 4) {
      g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.1})`;
      g.fillRect(x + 1, y, 2, 2);
    }
  } else if (kind === 'plaid') {
    g.fillStyle = 'rgba(20,20,24,0.55)';
    for (const p of [0, 64]) { g.fillRect(p, 0, 22, 128); g.fillRect(0, p, 128, 22); }
    g.fillStyle = 'rgba(235,225,200,0.35)';
    for (const p of [38, 102]) { g.fillRect(p, 0, 3, 128); g.fillRect(0, p, 128, 3); }
  } else {
    for (let i = -128; i < 128; i += 3) {
      g.strokeStyle = 'rgba(0,0,0,0.13)';
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 128, 128);
      g.stroke();
    }
  }
  t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  variantTex.set(kind, t);
  return t;
}

interface Template {
  body: THREE.Group;
  parts: Map<string, THREE.Mesh[]>;
  s: number;
  footY: number;
}

let tpl: Template | null = null;
let started: Promise<void> | null = null;
export const kitReady = (): boolean => tpl !== null;

const texLoader = new THREE.TextureLoader();
const texCache = new Map<string, Promise<THREE.Texture>>();
function loadTex(name: string, srgb: boolean): Promise<THREE.Texture> {
  const key = `${name}|${srgb}`;
  let p = texCache.get(key);
  if (!p) {
    p = new Promise<THREE.Texture>((resolve) => {
      const ext = name === 'lash_c' ? 'png' : 'jpg';
      texLoader.load(`${SRC}tex/${name}.${ext}`, (t) => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = 8;
        resolve(t);
      }, undefined, () => resolve(new THREE.Texture()));
    });
    texCache.set(key, p);
  }
  return p;
}

const matCache = new Map<string, THREE.Material>();
async function makeMaterial(name: string): Promise<THREE.Material> {
  let m = matCache.get(name);
  if (m) return m;
  const def = TEX[name];
  if (!def) {
    m = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 });
    matCache.set(name, m);
    return m;
  }
  const [c, n, orm] = await Promise.all([loadTex(def.c, true), def.n ? loadTex(def.n, false) : null, def.orm ? loadTex(def.orm, false) : null]);
  const mat = new THREE.MeshStandardMaterial({ map: c, roughness: orm ? 1 : 0.7, metalness: orm ? 1 : 0, side: THREE.DoubleSide });
  if (n) mat.normalMap = n;
  if (orm) {
    mat.roughnessMap = orm;
    mat.metalnessMap = orm;
    mat.aoMap = orm;
  }
  if (def.alpha) {
    mat.transparent = true;
    mat.alphaTest = 0.4;
    mat.depthWrite = false;
  }
  if (name === 'M_Sclera') {
    // Hornhaut: durchsichtig und glänzend, die Iris darunter bleibt sichtbar
    mat.transparent = true;
    mat.opacity = 0.14;
    mat.depthWrite = false;
    mat.roughness = 0.05;
    mat.metalness = 0;
    mat.side = THREE.FrontSide;
  }
  if (name === 'M_Eyeball') mat.side = THREE.FrontSide;
  matCache.set(name, mat);
  return mat;
}

async function retexture(root: THREE.Object3D): Promise<void> {
  const jobs: Promise<void>[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    const list = Array.isArray(m.material) ? m.material : [m.material];
    jobs.push(
      Promise.all(list.map((q) => makeMaterial(q.name))).then((mats) => {
        m.material = Array.isArray(m.material) ? mats : mats[0];
      }),
    );
  });
  await Promise.all(jobs);
}

export function preloadKit(): Promise<void> {
  if (started) return started;
  if (typeof document === 'undefined') return (started = Promise.resolve());
  return (started = (async () => {
    // FBXLoader meldet für jede Datei Dutzende harmlose Warnungen (nicht unterstützte Materialkarten): während des Ladens ausblenden
    const warn = console.warn;
    console.warn = (...a: unknown[]): void => {
      if (typeof a[0] === 'string' && /FBXLoader/i.test(a[0])) return;
      warn.apply(console, a);
    };
    try {
      const loader = new FBXLoader();
      const bodyP = loader.loadAsync(`${SRC}SKM_Body_Full.fbx`).then(async (b) => {
        await retexture(b);
        return b;
      });
      const partsP = Object.entries(KIT_PARTS).map(async ([key, def]) => {
        const obj = await new FBXLoader().loadAsync(`${SRC}${def.file}`);
        await retexture(obj);
        const meshes: THREE.Mesh[] = [];
        obj.traverse((o) => {
          if ((o as THREE.Mesh).isMesh && def.meshes.includes(o.name)) meshes.push(o as THREE.Mesh);
        });
        return [key, meshes] as const;
      });
      const [body, list] = await Promise.all([bodyP, Promise.all(partsP)]);
      body.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(body, true);
      const s = 1.86 / (box.max.y - box.min.y);
      const parts = new Map<string, THREE.Mesh[]>(list);
      tpl = { body, parts, s, footY: box.min.y };
    } catch (e) {
      console.warn('Charakter-Baukasten konnte nicht geladen werden', e);
    } finally {
      console.warn = warn;
    }
  })());
}

const variantGeos = new Map<string, THREE.BufferGeometry>();
function variantGeometry(key: string, src: THREE.BufferGeometry, v: ShirtVariant): THREE.BufferGeometry {
  let g = variantGeos.get(key);
  if (g) return g;
  g = src.clone();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute | undefined;
  if (nrm) for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) + nrm.getX(i) * v.push, pos.getY(i) + nrm.getY(i) * v.push, pos.getZ(i) + nrm.getZ(i) * v.push);
  pos.needsUpdate = true;
  if (!g.index) g.setIndex(Array.from({ length: pos.count }, (_, i) => i));
  const idx = g.index;
  if (!v.collar && idx) {
    // Rundhals ohne Knopfleiste: Kragenblätter (obere Dreiecke) und kleine lose Teile (Knöpfe, Tasche) entfernen
    g.computeBoundingBox();
    const top = g.boundingBox!.max.y; // Baukasten-Teile sind in cm und y-aufwärts
    const ia = idx.array;
    const nTri = ia.length / 3;
    // Dreiecke über gleiche Eckpunkt-Positionen zu zusammenhängenden Teilen verbinden
    const parent = Array.from({ length: nTri }, (_, i) => i);
    const find = (a: number): number => {
      while (parent[a] !== a) a = parent[a] = parent[parent[a]];
      return a;
    };
    const seen = new Map<string, number>();
    for (let t = 0; t < nTri; t++) {
      for (let k = 0; k < 3; k++) {
        const i = ia[t * 3 + k];
        const key = `${Math.round(pos.getX(i) * 20)},${Math.round(pos.getY(i) * 20)},${Math.round(pos.getZ(i) * 20)}`;
        const o = seen.get(key);
        if (o === undefined) seen.set(key, t);
        else parent[find(t)] = find(o);
      }
    }
    const size = new Map<number, number>();
    for (let t = 0; t < nTri; t++) size.set(find(t), (size.get(find(t)) ?? 0) + 1);
    const keep: number[] = [];
    for (let t = 0; t < nTri; t++) {
      const a = ia[t * 3], b = ia[t * 3 + 1], c = ia[t * 3 + 2];
      const lo = Math.min(pos.getY(a), pos.getY(b), pos.getY(c));
      if (lo >= top - COLLAR_CM || (size.get(find(t)) ?? 0) < 600) continue;
      keep.push(a, b, c);
    }
    g.setIndex(keep);
  }
  variantGeos.set(key, g);
  return g;
}
const COLLAR_CM = 4.5;

const variantMats = new Map<string, THREE.Material>();
function variantMaterial(key: string, v: ShirtVariant): THREE.Material {
  let m = variantMats.get(key);
  if (m) return m;
  const map = variantTexture(v.tex).clone();
  map.needsUpdate = true;
  map.repeat.set(v.repeat, v.repeat);
  m = new THREE.MeshStandardMaterial({ color: v.color, map, bumpMap: map, bumpScale: v.tex === 'knit' ? 1.4 : 0.5, roughness: v.rough, metalness: 0, side: THREE.DoubleSide });
  variantMats.set(key, m);
  return m;
}

// --- Instanz ------------------------------------------------------------------------------------------------------

/** Gelenke der prozeduralen Figur, aus denen die Bewegung kommt */
export interface DriverRig {
  hips: THREE.Object3D; torso: THREE.Object3D; head: THREE.Object3D;
  armL: THREE.Object3D; armR: THREE.Object3D; elbowL: THREE.Object3D; elbowR: THREE.Object3D;
  legL: THREE.Object3D; legR: THREE.Object3D; kneeL: THREE.Object3D; kneeR: THREE.Object3D;
}

interface BoneRec {
  bone: THREE.Bone;
  parent: BoneRec | null;
  restLocal: THREE.Quaternion;
  restWorld: THREE.Quaternion;
  restPos: THREE.Vector3;
  /** Zuordnung zur prozeduralen Figur */
  drive?: (w: Wset) => THREE.Quaternion;
  worldNew: THREE.Quaternion;
}

interface Wset {
  hips: THREE.Quaternion; torso: THREE.Quaternion; head: THREE.Quaternion;
  armPos: THREE.Quaternion; armNeg: THREE.Quaternion; elbowPos: THREE.Quaternion; elbowNeg: THREE.Quaternion;
  legPos: THREE.Quaternion; legNeg: THREE.Quaternion; kneePos: THREE.Quaternion; kneeNeg: THREE.Quaternion;
}

const qI = new THREE.Quaternion();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);

export class KitBody {
  readonly group = new THREE.Group();
  readonly scene: THREE.Object3D;
  readonly bones = new Map<string, THREE.Bone>();
  private recs: BoneRec[] = [];
  private byBone = new Map<THREE.Bone, BoneRec>();
  private garments = new Map<string, THREE.Object3D[]>();
  private skeleton: THREE.Skeleton;
  private pelvis!: BoneRec;
  private armAdj = { pos: new THREE.Quaternion(), neg: new THREE.Quaternion() };
  /** streckt den Unterarm aus der abgewinkelten Ruhehaltung des Baukastens fast gerade nach unten */
  private foreStraight = new THREE.Quaternion();
  readonly bodyMesh: THREE.SkinnedMesh;
  readonly s: number;
  /** Pro Knochen 1 = Haut dieses Knochens wird ausgeblendet (Kleidung deckt sie ab) */
  private topFlags = new Float32Array(80);
  private botFlags = new Float32Array(80);
  private topColor = new THREE.Color(0x222226);
  private botColor = new THREE.Color(0x6a6454);
  private w: Wset = {
    hips: new THREE.Quaternion(), torso: new THREE.Quaternion(), head: new THREE.Quaternion(), armPos: new THREE.Quaternion(), armNeg: new THREE.Quaternion(),
    elbowPos: new THREE.Quaternion(), elbowNeg: new THREE.Quaternion(), legPos: new THREE.Quaternion(), legNeg: new THREE.Quaternion(), kneePos: new THREE.Quaternion(), kneeNeg: new THREE.Quaternion(),
  };

  constructor() {
    const t = tpl!;
    this.s = t.s;
    this.scene = cloneSkinned(t.body);
    this.group.add(this.scene);
    this.group.scale.setScalar(t.s);
    this.group.position.y = -t.footY * t.s;
    let bodyMesh: THREE.SkinnedMesh | null = null;
    this.scene.traverse((o) => {
      const b = o as THREE.Bone;
      if (b.isBone && !this.bones.has(o.name)) this.bones.set(o.name, b);
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh && m.name === 'Body_Full') bodyMesh = m;
    });
    this.bodyMesh = bodyMesh!;
    this.skeleton = this.bodyMesh.skeleton;
    this.patchBodyMaterials();
    this.scene.updateMatrixWorld(true);
    this.setupBones();
  }

  private setupBones(): void {
    const wq = new THREE.Quaternion();
    const addRec = (bone: THREE.Bone, parent: BoneRec | null): BoneRec => {
      bone.getWorldQuaternion(wq);
      const r: BoneRec = { bone, parent, restLocal: bone.quaternion.clone(), restWorld: wq.clone(), restPos: bone.position.clone(), worldNew: wq.clone() };
      this.recs.push(r);
      this.byBone.set(bone, r);
      return r;
    };
    const walk = (o: THREE.Object3D, parent: BoneRec | null): void => {
      let p = parent;
      if ((o as THREE.Bone).isBone) p = addRec(o as THREE.Bone, parent);
      for (const c of o.children) walk(c, p);
    };
    walk(this.scene, null);
    // Seite eines Knochens: _l liegt bei +x, _r bei -x. In der prozeduralen Figur heißt die Seite bei -x "L".
    // Pos = Knochen bei +x (UE _l), Neg = Knochen bei -x (UE _r)
    const rec = (n: string): BoneRec | undefined => {
      const b = this.bones.get(n);
      return b ? this.byBone.get(b) : undefined;
    };
    this.pelvis = rec('pelvis')!;
    // Arm: Rest-Winkel zur Senkrechten bestimmen und ausgleichen (A-Pose -> hängend)
    const up = rec('upperarm_l'), lo = rec('lowerarm_l');
    if (up && lo) {
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      up.bone.getWorldPosition(a);
      lo.bone.getWorldPosition(b);
      const ang = Math.atan2(Math.abs(b.x - a.x), -(b.y - a.y));
      this.armAdj.pos.setFromAxisAngle(Z, -ang);
      this.armAdj.neg.setFromAxisAngle(Z, ang);
    }
    const hand = rec('hand_l');
    if (up && lo && hand) {
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      lo.bone.getWorldPosition(a);
      hand.bone.getWorldPosition(b);
      const v = b.sub(a).applyQuaternion(this.armAdj.pos); // Unterarmrichtung nach dem Absenken des Oberarms
      const bend = Math.atan2(v.z, -v.y); // Winkel nach vorn gegen die Senkrechte
      this.foreStraight.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.max(0, bend - 0.12));
    }
    const set = (names: string[], fn: (w: Wset) => THREE.Quaternion): void => {
      for (const n of names) {
        const r = rec(n);
        if (r) r.drive = fn;
      }
    };
    const adj = (r: THREE.Quaternion, pos: boolean, fore = false): THREE.Quaternion => {
      const q = r.clone();
      if (fore) q.multiply(this.foreStraight);
      return q.multiply(pos ? this.armAdj.pos : this.armAdj.neg);
    };
    set(['pelvis'], (w) => w.hips);
    set(['spine_01'], (w) => qa.slerpQuaternions(w.hips, w.torso, 0.3).clone());
    set(['spine_02'], (w) => qa.slerpQuaternions(w.hips, w.torso, 0.6).clone());
    set(['spine_03'], (w) => qa.slerpQuaternions(w.hips, w.torso, 0.85).clone());
    set(['spine_04', 'spine_05', 'clavicle_l', 'clavicle_r'], (w) => w.torso);
    set(['neck_01'], (w) => qa.slerpQuaternions(w.torso, w.head, 0.35).clone());
    set(['neck_02'], (w) => qa.slerpQuaternions(w.torso, w.head, 0.7).clone());
    set(['head'], (w) => w.head);
    set(['upperarm_l'], (w) => adj(w.armPos, true));
    set(['upperarm_r'], (w) => adj(w.armNeg, false));
    set(['lowerarm_l', 'hand_l'], (w) => adj(w.elbowPos, true, true));
    set(['lowerarm_r', 'hand_r'], (w) => adj(w.elbowNeg, false, true));
    set(['thigh_l'], (w) => w.legPos);
    set(['thigh_r'], (w) => w.legNeg);
    set(['calf_l'], (w) => w.kneePos);
    set(['calf_r'], (w) => w.kneeNeg);
    set(['foot_l', 'foot_r'], () => qI);
    // 'head' kommt mehrfach vor (Gesichtsknochen): nur der echte Kopf (Kind von neck_02) wird gesteuert
    for (const r of this.recs) if (r.bone.name === 'head' && r.parent?.bone.name !== 'neck_02') r.drive = undefined;
  }

  /** Bewegung der prozeduralen Figur auf das Skelett übertragen */
  update(d: DriverRig): void {
    const w = this.w;
    // Weltdrehungen der Gelenke relativ zur Figurwurzel (Kette der lokalen Drehungen)
    w.hips.copy(d.hips.quaternion);
    w.torso.copy(w.hips).multiply(d.torso.quaternion);
    w.head.copy(w.torso).multiply(d.head.quaternion);
    // armL/elbowL der prozeduralen Figur liegen bei -x = UE "_r" (Neg), armR bei +x (Pos)
    w.armNeg.copy(w.torso).multiply(d.armL.quaternion);
    w.armPos.copy(w.torso).multiply(d.armR.quaternion);
    w.elbowNeg.copy(w.armNeg).multiply(d.elbowL.quaternion);
    w.elbowPos.copy(w.armPos).multiply(d.elbowR.quaternion);
    w.legNeg.copy(w.hips).multiply(d.legL.quaternion);
    w.legPos.copy(w.hips).multiply(d.legR.quaternion);
    w.kneeNeg.copy(w.legNeg).multiply(d.kneeL.quaternion);
    w.kneePos.copy(w.legPos).multiply(d.kneeR.quaternion);

    for (const r of this.recs) {
      if (r.drive) {
        const dq = r.drive(w);
        r.worldNew.copy(dq).multiply(r.restWorld);
      } else if (r.parent) {
        r.worldNew.copy(r.parent.worldNew).multiply(r.restLocal);
      } else {
        r.worldNew.copy(r.restWorld);
      }
      // lokale Drehung = Elternwelt^-1 * Welt
      if (r.parent) r.bone.quaternion.copy(qb.copy(r.parent.worldNew).invert()).multiply(r.worldNew);
      else r.bone.quaternion.copy(r.restLocal);
    }
    // Hüfte hebt und senkt sich mit der prozeduralen Figur (Meter -> Zentimeter der Knochen)
    const dy = (d.hips.position.y - 0.92) / this.s;
    const p = this.pelvis;
    p.bone.position.copy(p.restPos);
    if (p.parent) p.bone.position.add(new THREE.Vector3(0, dy, 0).applyQuaternion(qb.copy(p.parent.worldNew).invert()));
    else p.bone.position.y += dy;
  }

  // --- Kleidung -------------------------------------------------------------------------------------------------

  /** Kleidungsstück an das Skelett binden (einmalig) und zurückgeben */
  private ensurePart(key: string): THREE.Object3D[] {
    let list = this.garments.get(key);
    if (list) return list;
    list = [];
    const t = tpl!;
    const { base: kbase, color: kcol } = splitKey(key);
    const baseVariant = kbase.startsWith('shirt:') ? SHIRT_VARIANTS[kbase.slice(6)] : undefined;
    const variant = baseVariant && kcol !== undefined ? { ...baseVariant, color: kcol } : baseVariant;
    const vestColor = kbase.startsWith('vest:') ? VEST_VARIANTS[kbase.slice(5)] : undefined;
    const src = t.parts.get(variant ? 'shirt' : vestColor !== undefined ? 'vest' : kbase) ?? [];
    for (const m of src) {
      const sm = m as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh) {
        // Knochen über den Namen dem Skelett dieser Figur zuordnen
        const bones = sm.skeleton.bones.map((b) => this.bones.get(b.name) ?? this.bones.get('pelvis')!);
        const skel = new THREE.Skeleton(bones, sm.skeleton.boneInverses);
        const copy = variant ? new THREE.SkinnedMesh(variantGeometry(kbase, sm.geometry, variant), variantMaterial(key, variant)) : new THREE.SkinnedMesh(sm.geometry, vestColor !== undefined ? vestMaterial(kbase, sm.material, vestColor) : kcol !== undefined ? tintMaterial(key, sm.material, kcol) : sm.material);
        copy.name = sm.name;
        copy.castShadow = true;
        copy.receiveShadow = true;
        copy.frustumCulled = false;
        this.scene.add(copy);
        copy.bind(skel, sm.bindMatrix);
        list.push(copy);
      } else {
        // starres Teil (Kappe): am Kopfknochen befestigen
        const copy = new THREE.Mesh(m.geometry, m.material);
        copy.castShadow = true;
        this.scene.add(copy);
        const head = [...this.recs].find((r) => r.bone.name === 'head' && r.parent?.bone.name === 'neck_02')?.bone;
        // Ausgangslage: Kappe sitzt oben auf dem Kopf (Maße in cm)
        copy.position.set(0, 168, 1.5);
        copy.updateMatrixWorld(true);
        head?.attach(copy);
        list.push(copy);
      }
    }
    this.garments.set(key, list);
    return list;
  }

  /**
   * Körpermaterialien je Figur kopieren und so erweitern, dass Haut über ausgeblendeten Knochen nicht gezeichnet wird.
   * So scheint unter Pullover und Hose keine Haut durch; sichtbar bleiben Hals, Unterarme/Hände und Füße.
   */
  private patchBodyMaterials(): void {
    const mats = (Array.isArray(this.bodyMesh.material) ? this.bodyMesh.material : [this.bodyMesh.material]) as THREE.MeshStandardMaterial[];
    const top = this.topFlags, bot = this.botFlags, tc = this.topColor, bc = this.botColor;
    const out = mats.map((m) => {
      const c = m.clone();
      c.onBeforeCompile = (sh) => {
        sh.uniforms.uTop = { value: top };
        sh.uniforms.uBot = { value: bot };
        sh.uniforms.uTopColor = { value: tc };
        sh.uniforms.uBotColor = { value: bc };
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
uniform float uTop[80];
uniform float uBot[80];
varying float vTop;
varying float vBot;
varying float vY;
varying float vX;`)
          .replace('#include <skinbase_vertex>', `#include <skinbase_vertex>
vTop = skinWeight.x * uTop[int(skinIndex.x)] + skinWeight.y * uTop[int(skinIndex.y)] + skinWeight.z * uTop[int(skinIndex.z)] + skinWeight.w * uTop[int(skinIndex.w)];
vBot = skinWeight.x * uBot[int(skinIndex.x)] + skinWeight.y * uBot[int(skinIndex.y)] + skinWeight.z * uBot[int(skinIndex.z)] + skinWeight.w * uBot[int(skinIndex.w)];
vY = position.z;
vX = position.x;`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
uniform vec3 uTopColor;
uniform vec3 uBotColor;
varying float vTop;
varying float vBot;
varying float vY;
varying float vX;`)
          .replace('#include <map_fragment>', `#include <map_fragment>
bool neckSkin = vY > 146.0 && abs(vX) < 8.5;
if (vTop > 0.5 && !neckSkin) diffuseColor.rgb = uTopColor;
else if (vBot > 0.5) diffuseColor.rgb = uBotColor;`);
      };
      c.customProgramCacheKey = () => 'kithide2';
      return c;
    });
    this.bodyMesh.material = Array.isArray(this.bodyMesh.material) ? out : out[0];
  }

  /**
   * Haut unter der Kleidung in Stofffarbe färben (statt sie zu zeigen): `top` gilt für Rumpf und Arme (nur unterhalb des Halsausschnitts),
   * `bottom` für Beine und Füße. Die Namen sind Anfänge von Knochennamen (z. B. 'spine', 'upperarm', 'thigh').
   * So bleiben Lücken im Stoffnetz (Schultern, Rücken) geschlossen und nirgends scheint Haut durch.
   */
  hideSkin(top: string[], bottom: string[], topColor?: THREE.Color, bottomColor?: THREE.Color): void {
    const bones = this.bodyMesh.skeleton.bones;
    for (let i = 0; i < 80; i++) {
      this.topFlags[i] = 0;
      this.botFlags[i] = 0;
    }
    bones.forEach((b, i) => {
      if (top.some((p) => b.name.startsWith(p))) this.topFlags[i] = 1;
      if (bottom.some((p) => b.name.startsWith(p))) this.botFlags[i] = 1;
    });
    if (topColor) this.topColor.copy(topColor);
    if (bottomColor) this.botColor.copy(bottomColor);
  }

  /** Durchschnittsfarbe eines Kleidungsteils des Baukastens (aus seiner Textur) */
  partColor(key: string): THREE.Color | null {
    const { base: kbase, color: kcol } = splitKey(key);
    const v = kbase.startsWith('shirt:') ? SHIRT_VARIANTS[kbase.slice(6)] : undefined;
    if (v) {
      const base = averageColor(variantTexture(v.tex)) ?? new THREE.Color(1, 1, 1);
      return base.clone().multiply(new THREE.Color(kcol ?? v.color));
    }
    const m = tpl?.parts.get(kbase)?.[0]?.material;
    const mat = (Array.isArray(m) ? m[0] : m) as THREE.MeshStandardMaterial | undefined;
    const avg = mat?.map ? averageColor(mat.map) : null;
    return avg && kcol !== undefined ? avg.clone().multiply(new THREE.Color(kcol)) : avg;
  }

  /** Genau diese Teile zeigen (z. B. ['jeans', 'shirt']), alle anderen verstecken */
  showParts(keys: string[]): void {
    for (const list of this.garments.values()) for (const o of list) o.visible = false;
    for (const k of keys) for (const o of this.ensurePart(k)) o.visible = true;
  }

  /** Haut des Körpers in Ruhehaltung (Meter, Füße bei y = 0) mit Gewichten auf die 11 Gelenke der prozeduralen Figur */
  surface(): { pos: Float32Array; sIdx: Uint16Array; sW: Float32Array; nrm: Float32Array } {
    this.update({
      hips: new THREE.Group(), torso: new THREE.Group(), head: new THREE.Group(), armL: new THREE.Group(), armR: new THREE.Group(),
      elbowL: new THREE.Group(), elbowR: new THREE.Group(), legL: new THREE.Group(), legR: new THREE.Group(), kneeL: new THREE.Group(), kneeR: new THREE.Group(),
    } as unknown as DriverRig);
    // update() braucht hips.position.y = 0.92 für Ruhe
    this.pelvis.bone.position.copy(this.pelvis.restPos);
    this.group.updateMatrixWorld(true);
    this.bodyMesh.skeleton.update();
    const g = this.bodyMesh.geometry;
    const n = g.attributes.position.count;
    const pos = new Float32Array(n * 3);
    const sIdx = new Uint16Array(n * 4);
    const sW = new Float32Array(n * 4);
    const v = new THREE.Vector3();
    const skinIdx = g.attributes.skinIndex as THREE.BufferAttribute;
    const skinW = g.attributes.skinWeight as THREE.BufferAttribute;
    const names = this.bodyMesh.skeleton.bones.map((b) => b.name);
    const map = names.map((nm, i) => oldBoneOf(nm, this.bodyMesh.skeleton.bones[i]));
    for (let i = 0; i < n; i++) {
      this.bodyMesh.getVertexPosition(i, v);
      v.applyMatrix4(this.bodyMesh.matrixWorld); // Meter, Füße bei y = 0
      pos[i * 3] = v.x;
      pos[i * 3 + 1] = v.y;
      pos[i * 3 + 2] = v.z;
      const acc = new Map<number, number>();
      for (let k = 0; k < 4; k++) {
        const b = map[skinIdx.getComponent(i, k)];
        acc.set(b, (acc.get(b) ?? 0) + skinW.getComponent(i, k));
      }
      const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      for (let k = 0; k < 4; k++) {
        sIdx[i * 4 + k] = top[k]?.[0] ?? 0;
        sW[i * 4 + k] = top[k]?.[1] ?? 0;
      }
    }
    // Normalen der Haut in dieser Haltung (für die Passform der Kleidung)
    const tmp = new THREE.BufferGeometry();
    tmp.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (g.index) tmp.setIndex(g.index);
    tmp.computeVertexNormals();
    const nrm = new Float32Array((tmp.attributes.normal as THREE.BufferAttribute).array);
    return { pos, sIdx, sW, nrm };
  }
}

/** UE-Knochen -> Gelenkindex der prozeduralen Figur (0 hips, 1 torso, 2 head, 3/4 Arm/Ellbogen bei -x, 5/6 bei +x, 7/8 Bein/Knie bei -x, 9/10 bei +x) */
function oldBoneOf(name: string, bone: THREE.Bone): number {
  const left = /_l$/.test(name); // UE _l = +x
  const right = /_r$/.test(name);
  void bone;
  if (name === 'pelvis' || name.startsWith('spine_01')) return 0;
  if (name.startsWith('spine') || name.startsWith('clavicle')) return 1;
  if (name.startsWith('neck') || name === 'head') return 2;
  if (name.startsWith('upperarm')) return left ? 5 : 3;
  if (name.startsWith('lowerarm') || name.startsWith('hand') || /^(index|middle|ring|pinky|thumb)/.test(name)) return left ? 6 : 4;
  if (name.startsWith('thigh')) return left ? 9 : 7;
  if (name.startsWith('calf') || name.startsWith('foot') || name.startsWith('ball')) return left ? 10 : 8;
  void right;
  return 1;
}

const avgCache = new WeakMap<THREE.Texture, THREE.Color>();
/** Mittlere Farbe einer Textur (über ein 8×8-Bild) */
export function averageColor(t: THREE.Texture): THREE.Color | null {
  const hit = avgCache.get(t);
  if (hit) return hit;
  try {
    const img = t.image as CanvasImageSource | undefined;
    if (!img || typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      gg += d[i + 1];
      b += d[i + 2];
    }
    const n = d.length / 4;
    const col = new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
    avgCache.set(t, col);
    return col;
  } catch {
    return null;
  }
}
