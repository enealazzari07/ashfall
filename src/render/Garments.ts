import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bodySurface } from './HumanBody';
import { averageColor } from './KitBody';

/**
 * Kleidungsstücke aus `public/models/clothes.glb` (aus dem Modell "biolab guard"): Pullover, Hemd, Krawatte, Weste,
 * Hose, Stiefel, Kappe usw. Die Teile sind bereits auf die Gelenke unserer Figur (11 Knochen) gewichtet,
 * in die Hängehaltung gedreht und auf den Körper angepasst.
 */
const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || './';

interface Piece { geo: THREE.BufferGeometry; mat: THREE.Material }
export type GarmentSetId = 'old' | 'kit';
/** Stücke je Körper: 'old' = human_body.glb (NPCs), 'kit' = Baukasten-Körper (Spieler) */
const sets: Record<GarmentSetId, Map<string, Piece>> = { old: new Map(), kit: new Map() };
let started: Promise<void> | null = null;

export const garmentsReady = (): boolean => sets.old.size > 0;

export function preloadGarments(): Promise<void> {
  if (started) return started;
  if (typeof document === 'undefined') return (started = Promise.resolve());
  const loadFile = (file: string, set: GarmentSetId): Promise<void> =>
    new Promise<void>((resolve) => {
      new GLTFLoader().load(
        `${BASE}models/${file}`,
        (gltf) => {
          gltf.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            const mat = m.material as THREE.MeshStandardMaterial;
            mat.roughness = 0.9;
            mat.metalness = 0;
            mat.side = THREE.DoubleSide;
            // Stoff gewinnt knapp gegen die Haut darunter (verhindert durchscheinende Hautflecken bei grobem Stoffnetz)
            mat.polygonOffset = true;
            mat.polygonOffsetFactor = -3;
            mat.polygonOffsetUnits = -3;
            sets[set].set(m.name, { geo: m.geometry, mat });
          });
          resolve();
        },
        undefined,
        () => resolve(),
      );
    });
  return (started = Promise.all([loadFile('clothes.glb', 'old'), loadFile('plaid.glb', 'old'), loadFile('clothes_kit.glb', 'kit'), loadFile('plaid_kit.glb', 'kit')]).then(() => undefined));
}

/** Schalen des Hautkörpers, die unter einem Kleidungsstück verschwinden */
export type Shell = 'shirt' | 'pants' | 'shoes' | 'upper' | 'fore';

export interface GarmentSet {
  /** Teile aus clothes.glb */
  parts: string[];
  /** Farbtönung der Textur (multipliziert) */
  tint?: number;
  /** Hautkörper-Hüllen, die verdeckt werden */
  hides: Shell[];
}

/** Welcher Gegenstand welche Teile zeigt */
export const GARMENT_SETS: Record<string, GarmentSet> = {
  hoodie: { parts: ['sweater'], hides: ['upper', 'fore'] },
  sweater: { parts: ['sweater'], hides: ['upper', 'fore'] },
  shirt_tie: { parts: ['shirt', 'tie'], hides: ['shirt'] },
  jacket: { parts: ['vest', 'vestcollar', 'harnessA', 'harnessB', 'harnessC', 'belt', 'pouchA', 'pouchB', 'elbowpads'], hides: [] },
  tac_vest: { parts: ['vest', 'vestcollar', 'harnessA', 'harnessB', 'harnessC', 'belt', 'pouchA', 'pouchB', 'elbowpads'], hides: [] },
  jeans: { parts: ['pants'], tint: 0x8da4d4, hides: ['pants'] },
  cargo_pants: { parts: ['pants', 'kneepads'], hides: ['pants'] },
  boots: { parts: ['boots'], tint: 0xb89878, hides: ['shoes'] },
  tac_boots: { parts: ['boots'], hides: ['shoes'] },
  cap: { parts: ['cap'], hides: [] },
  plaid_jacket: { parts: ['plaid', 'plaidbuttons'], hides: ['upper', 'fore'] },
  leather_jacket: { parts: ['sweater'], tint: 0x3a2e28, hides: ['upper', 'fore'] },
  denim_jacket: { parts: ['sweater'], tint: 0x6e8cba, hides: ['upper', 'fore'] },
  raincoat: { parts: ['sweater'], tint: 0xf0c93a, hides: ['upper', 'fore'] },
  work_vest: { parts: ['vest'], tint: 0xff8a2a, hides: [] },
};

export interface GarmentHost {
  set: GarmentSetId;
  root: THREE.Object3D;
  skeleton: THREE.Skeleton;
  shells: Record<Shell, THREE.Object3D>;
  cache: Map<string, THREE.SkinnedMesh[]>;
}

const tintMats = new Map<string, THREE.Material>();
function tinted(part: string, mat: THREE.Material, tint: number): THREE.Material {
  const k = `${part}|${tint}`;
  let m = tintMats.get(k);
  if (!m) {
    const c = (mat as THREE.MeshStandardMaterial).clone();
    c.color.setHex(tint);
    tintMats.set(k, (m = c));
  }
  return m;
}

/** Zeigt genau die Kleidungsstücke der angegebenen Gegenstände; Hautkörper-Hüllen werden bei Bedarf ausgeblendet */
export function showGarments(host: GarmentHost, ids: (string | null | undefined)[]): Set<Shell> {
  fitGarmentsToBody(host.set);
  for (const list of host.cache.values()) for (const m of list) m.visible = false;
  const hidden = new Set<Shell>();
  for (const id of ids) {
    const set = id ? GARMENT_SETS[id] : undefined;
    if (!set || !garmentsReady()) continue;
    let list = host.cache.get(id!);
    if (!list) {
      list = [];
      for (const name of set.parts) {
        const pc = sets[host.set].get(name);
        if (!pc) continue;
        const mat = set.tint !== undefined ? tinted(name, pc.mat, set.tint) : pc.mat;
        const sm = new THREE.SkinnedMesh(pc.geo, mat);
        sm.castShadow = true;
        sm.receiveShadow = true;
        sm.frustumCulled = false;
        host.root.add(sm);
        sm.bind(host.skeleton, new THREE.Matrix4());
        list.push(sm);
      }
      host.cache.set(id!, list);
    }
    for (const m of list) m.visible = true;
    for (const h of set.hides) hidden.add(h);
  }
  return hidden;
}

// --- Anpassung an den Körper -------------------------------------------------------------------------------------

/** Abstand zur Haut je Teil (Meter): Westen und Taschen liegen weiter außen als Stoff */
const MARGIN: Record<string, number> = {
  sweater: 0.016, shirt: 0.006, tie: 0.012, vest: 0.02, vestcollar: 0.016, harnessA: 0.024, harnessB: 0.024, harnessC: 0.026, belt: 0.026,
  pouchA: 0.024, pouchB: 0.024, pants: 0.006, kneepads: 0.014, elbowpads: 0.016, boots: 0.012, cap: 0.01, gloves: 0.008, watch: 0.008, plaid: 0.02, plaidbuttons: 0.026,
};

type Region = 0 | 1 | 2 | 3 | 4; // Rumpf+Kopf, Arm links, Arm rechts, Bein links, Bein rechts
const regionOfBone = (b: number): Region => (b <= 2 ? 0 : b <= 4 ? 1 : b <= 6 ? 2 : b <= 8 ? 3 : 4);
const YS = 0.03, NA = 24, NY = 66;

interface Profile { cx: Float32Array; cz: Float32Array; r: Float32Array }

const fitted: Record<GarmentSetId, boolean> = { old: false, kit: false };
let kitSurface: { pos: Float32Array; sIdx: Uint16Array; sW: Float32Array; nrm?: Float32Array } | null = null;
/** Körperoberfläche des Baukasten-Charakters (für die Passform seiner Kleidung) */
export const setKitSurface = (s: { pos: Float32Array; sIdx: Uint16Array; sW: Float32Array; nrm?: Float32Array }): void => {
  kitSurface = s;
};

function buildProfiles(set: GarmentSetId): Profile[] | null {
  const body = set === 'kit' ? kitSurface : bodySurface();
  if (!body) return null;
  const n = body.pos.length / 3;
  const prof: Profile[] = [];
  for (let r = 0; r < 5; r++) prof.push({ cx: new Float32Array(NY), cz: new Float32Array(NY), r: new Float32Array(NY * NA) });
  const cnt = [0, 1, 2, 3, 4].map(() => new Float32Array(NY));
  const reg = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    // dominante Gruppe nach Gewicht
    const acc = [0, 0, 0, 0, 0];
    for (let k = 0; k < 4; k++) acc[regionOfBone(body.sIdx[i * 4 + k])] += body.sW[i * 4 + k];
    let best = 0;
    for (let g = 1; g < 5; g++) if (acc[g] > acc[best]) best = g;
    reg[i] = acc[best] > 0.85 ? best : 7; // nur eindeutige Haut-Punkte zählen (Übergänge würden Ärmel und Hosenbeine aufblähen)
    if (reg[i] === 7) continue;
    const y = body.pos[i * 3 + 1];
    const yi = Math.min(NY - 1, Math.max(0, Math.floor(y / YS)));
    prof[best].cx[yi] += body.pos[i * 3];
    prof[best].cz[yi] += body.pos[i * 3 + 2];
    cnt[best][yi]++;
  }
  for (let g = 0; g < 5; g++) {
    for (let y = 0; y < NY; y++) {
      if (cnt[g][y]) {
        prof[g].cx[y] /= cnt[g][y];
        prof[g].cz[y] /= cnt[g][y];
      }
    }
    // Lücken mit dem nächsten gefüllten Wert schließen
    for (let y = 1; y < NY; y++) if (!cnt[g][y] && cnt[g][y - 1] !== 0) { prof[g].cx[y] = prof[g].cx[y - 1]; prof[g].cz[y] = prof[g].cz[y - 1]; cnt[g][y] = -1; }
    for (let y = NY - 2; y >= 0; y--) if (!cnt[g][y] && cnt[g][y + 1] !== 0) { prof[g].cx[y] = prof[g].cx[y + 1]; prof[g].cz[y] = prof[g].cz[y + 1]; cnt[g][y] = -1; }
  }
  for (let i = 0; i < n; i++) {
    const g = reg[i];
    if (g === 7) continue;
    const y = body.pos[i * 3 + 1];
    const yi = Math.min(NY - 1, Math.max(0, Math.floor(y / YS)));
    const dx = body.pos[i * 3] - prof[g].cx[yi], dz = body.pos[i * 3 + 2] - prof[g].cz[yi];
    const a = Math.floor(((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2)) * NA) % NA;
    const d = Math.hypot(dx, dz);
    const k = yi * NA + a;
    if (d > prof[g].r[k]) prof[g].r[k] = d;
  }
  // Maximum über Nachbarbereiche (Höhe ±1, Winkel ±1), damit keine Spitzen durchstechen
  for (const p of prof) {
    const src = p.r.slice();
    for (let y = 0; y < NY; y++) {
      for (let a = 0; a < NA; a++) {
        let m = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let da = -1; da <= 1; da++) {
            const yy = y + dy;
            if (yy < 0 || yy >= NY) continue;
            m = Math.max(m, src[yy * NA + ((a + da + NA) % NA)]);
          }
        }
        p.r[y * NA + a] = m;
      }
    }
  }
  return prof;
}

/** Schiebt die Stoffteile an allen Stellen nach außen, an denen sie im Körper stecken würden */
/**
 * Stoff an die Haut legen (nächster Hautpunkt + Normale): Teile, die in der Haut stecken oder knapp darüber liegen,
 * werden auf einen kleinen Abstand zur Haut gebracht, danach glättet sich die Verschiebung über die Nachbarn.
 * So liegen Pullover und Jacken an Armen und Schultern glatt an wie das normale T-Shirt, ohne dass Haut durchschaut.
 */
function wrapToSkin(): void {
  const body = kitSurface;
  if (!body || !body.nrm) return;
  const n = body.pos.length / 3;
  const CELL = 0.06;
  const grid = new Map<number, number[]>();
  const key = (x: number, y: number, z: number): number => ((Math.floor(x / CELL) + 512) * 1024 + (Math.floor(y / CELL) + 512)) * 1024 + (Math.floor(z / CELL) + 512);
  for (let i = 0; i < n; i++) {
    const k = key(body.pos[i * 3], body.pos[i * 3 + 1], body.pos[i * 3 + 2]);
    const l = grid.get(k);
    if (l) l.push(i);
    else grid.set(k, [i]);
  }
  const nearest = (x: number, y: number, z: number): number => {
    let best = -1, bd = 0.12 * 0.12;
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cz = Math.floor(z / CELL);
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
      const l = grid.get(((cx + dx + 512) * 1024 + (cy + dy + 512)) * 1024 + (cz + dz + 512));
      if (!l) continue;
      for (const i of l) {
        const ex = body.pos[i * 3] - x, ey = body.pos[i * 3 + 1] - y, ez = body.pos[i * 3 + 2] - z;
        const d = ex * ex + ey * ey + ez * ez;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    }
    return best;
  };
  for (const [name, pc] of sets.kit) {
    const margin = MARGIN[name] ?? 0.01;
    const pos = pc.geo.attributes.position as THREE.BufferAttribute;
    const idx = pc.geo.index;
    {
      // Die Stücke sind mit 0,7 rad abgewinkeltem Unterarm gebaut; der Körper hängt den Unterarm fast gerade: Ärmel entsprechend zurückdrehen
      const si = pc.geo.attributes.skinIndex as THREE.BufferAttribute, sw = pc.geo.attributes.skinWeight as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let we = 0, side = 0;
        for (let k = 0; k < 4; k++) {
          const b = si.getComponent(i, k);
          if (b === 4) { we += sw.getComponent(i, k); side = -1; }
          else if (b === 6) { we += sw.getComponent(i, k); side = 1; }
        }
        if (we <= 0) continue;
        const th = 0.58 * we, c = Math.cos(th), sn = Math.sin(th);
        const py = 1.186, pz = 0;
        void side;
        const dy = pos.getY(i) - py, dz = pos.getZ(i) - pz;
        pos.setY(i, py + dy * c - dz * sn);
        pos.setZ(i, pz + dy * sn + dz * c);
      }
    }
    const cnt = pos.count;
    const disp = new Float32Array(cnt * 3);
    const has = new Uint8Array(cnt);
    for (let i = 0; i < cnt; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const b = nearest(x, y, z);
      if (b < 0) continue;
      const nx = body.nrm![b * 3], ny = body.nrm![b * 3 + 1], nz = body.nrm![b * 3 + 2];
      const signed = (x - body.pos[b * 3]) * nx + (y - body.pos[b * 3 + 1]) * ny + (z - body.pos[b * 3 + 2]) * nz;
      let want = signed;
      if (signed < margin) want = margin; // in der Haut oder zu knapp darüber: nach außen schieben
      else if (signed < margin + 0.08) want = margin + (signed - margin) * 0.1; // locker anliegend: an die Haut ziehen
      const dd = want - signed;
      if (dd === 0) continue;
      disp[i * 3] = nx * dd;
      disp[i * 3 + 1] = ny * dd;
      disp[i * 3 + 2] = nz * dd;
      has[i] = 1;
    }
    // Verschiebung über die Nachbarn glätten
    if (idx) {
      const ia = idx.array;
      for (let it = 0; it < 5; it++) {
        const acc = new Float32Array(cnt * 3), w = new Float32Array(cnt);
        for (let t = 0; t < ia.length; t += 3) {
          const a = ia[t], b2 = ia[t + 1], c = ia[t + 2];
          for (const [p, q] of [[a, b2], [b2, c], [c, a]]) {
            for (let k = 0; k < 3; k++) {
              acc[p * 3 + k] += disp[q * 3 + k];
              acc[q * 3 + k] += disp[p * 3 + k];
            }
            w[p]++;
            w[q]++;
          }
        }
        for (let i = 0; i < cnt; i++) {
          if (!w[i]) continue;
          for (let k = 0; k < 3; k++) disp[i * 3 + k] = disp[i * 3 + k] * 0.5 + (acc[i * 3 + k] / w[i]) * 0.5;
        }
      }
    }
    for (let i = 0; i < cnt; i++) {
      if (!has[i] && disp[i * 3] === 0 && disp[i * 3 + 1] === 0 && disp[i * 3 + 2] === 0) continue;
      pos.setXYZ(i, pos.getX(i) + disp[i * 3], pos.getY(i) + disp[i * 3 + 1], pos.getZ(i) + disp[i * 3 + 2]);
    }
    pos.needsUpdate = true;
    pc.geo.computeVertexNormals();
    // Der Halsansatz bleibt frei: Kragenröhre oberhalb des Schulterniveaus abschneiden, dort zeigt sich die normale Haut des Halses
    if ((name === 'sweater' || name === 'plaid') && idx) {
      const keep: number[] = [];
      const ia = idx.array;
      for (let t = 0; t < ia.length; t += 3) {
        const lo = Math.min(pos.getY(ia[t]), pos.getY(ia[t + 1]), pos.getY(ia[t + 2]));
        const wide = Math.max(Math.abs(pos.getX(ia[t])), Math.abs(pos.getX(ia[t + 1])), Math.abs(pos.getX(ia[t + 2])));
        // nur die Kragenröhre in der Mitte entfernen, die Schultern bleiben
        if (lo < 1.47 || wide > 0.1) keep.push(ia[t], ia[t + 1], ia[t + 2]);
      }
      pc.geo.setIndex(keep);
    }
  }
}

export function fitGarmentsToBody(set: GarmentSetId): void {
  if (fitted[set] || !garmentsReady()) return;
  if (set === 'kit' && kitSurface?.nrm) {
    fitted.kit = true;
    wrapToSkin();
    return;
  }
  const prof = buildProfiles(set);
  if (!prof) return;
  fitted[set] = true;
  for (const [name, pc] of sets[set]) {
    const margin = MARGIN[name] ?? 0.012;
    const pos = pc.geo.attributes.position as THREE.BufferAttribute;
    const si = pc.geo.attributes.skinIndex as THREE.BufferAttribute;
    const sw = pc.geo.attributes.skinWeight as THREE.BufferAttribute;
    if (set === 'kit') {
      // Ärmel an die kräftigeren Arme des Baukasten-Körpers anpassen: seitlich und in der Tiefe aufweiten
      for (let i = 0; i < pos.count; i++) {
        let wl = 0, wr = 0;
        for (let k = 0; k < 4; k++) {
          const b = si.getComponent(i, k), w = sw.getComponent(i, k);
          if (b === 3 || b === 4) wl += w;
          else if (b === 5 || b === 6) wr += w;
        }
        const w = wl + wr;
        if (w <= 0) continue;
        const ax = (wl > wr ? -1 : 1) * 0.215;
        pos.setXYZ(i, ax + (pos.getX(i) - ax) * (1 + 0.38 * w), pos.getY(i), pos.getZ(i) * (1 + 0.38 * w));
      }
    }
    for (let i = 0; i < pos.count; i++) {
      const acc = [0, 0, 0, 0, 0];
      for (let k = 0; k < 4; k++) acc[regionOfBone(si.getComponent(i, k))] += sw.getComponent(i, k);
      let g = 0;
      for (let q = 1; q < 5; q++) if (acc[q] > acc[g]) g = q;
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const yi = Math.min(NY - 1, Math.max(0, Math.floor(y / YS)));
      const p = prof[g];
      const dx = x - p.cx[yi], dz = z - p.cz[yi];
      const d = Math.hypot(dx, dz);
      if (d < 1e-5) continue;
      const a = Math.floor(((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2)) * NA) % NA;
      const need = p.r[yi * NA + a];
      if (need <= 0) continue;
      // Die Verschiebung bleibt begrenzt, damit der Stoff seine Form behält (Ärmel und Hosenbeine reißen sonst auf)
      const want = Math.min(need + margin, d + (g === 0 ? 0.07 : 0.04));
      if (d < want) pos.setXYZ(i, p.cx[yi] + (dx / d) * want, y, p.cz[yi] + (dz / d) * want);
    }
    pos.needsUpdate = true;
    pc.geo.computeVertexNormals();
  }
}

/** Mittlere Stofffarbe eines Kleidungsstücks (für die Haut darunter) */
export function garmentColor(set: GarmentSetId, id: string | null | undefined): THREE.Color | null {
  const def = id ? GARMENT_SETS[id] : undefined;
  const pc = def ? sets[set].get(def.parts[0]) : undefined;
  if (!pc) return null;
  const map = (pc.mat as THREE.MeshStandardMaterial).map;
  const base = map ? averageColor(map) : null;
  if (!base) return null;
  return def!.tint !== undefined ? base.clone().multiply(new THREE.Color(def!.tint)) : base;
}
