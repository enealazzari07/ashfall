import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Menschlicher Körper aus `human_body.glb` (nur Gitter, keine Textur, keine Knochen).
 * Das Gitter wird beim Laden aufrecht gestellt, auf Spielergröße gebracht, die Arme werden nach unten gedreht,
 * und Gewichte binden es an die Gelenke der prozeduralen Figur. Hose, Oberteil, Ärmel und Schuhe sind
 * leicht aufgeblasene Hüllen auf dem Hautkörper, so folgen Farben und Kleidungswechsel der bestehenden Figur.
 */

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || './';

interface Prepared {
  /** Position, Normale, UV je Vertex (Meter, aufrecht, Blick +z) */
  pos: Float32Array;
  nrm: Float32Array;
  uv: Float32Array;
  index: Uint32Array;
  /** Knochenindizes und Gewichte (4 je Vertex), Reihenfolge siehe `BoneSet` */
  sIdx: Uint16Array;
  sW: Float32Array;
  /** Armanteil je Vertex (0 Rumpf … 1 Arm) und Seite */
  wa: Float32Array;
  headCenterY: number;
  /** Gesichtsfront (z) auf Augenhöhe */
  faceZ: number;
  headBox: { cx: number; cy: number; cz: number; hx: number; hy: number; hz: number };
}

let prepared: Prepared | null = null;
let started: Promise<void> | null = null;

export const humanBodyReady = (): boolean => prepared !== null;

/** Oberfläche des Körpers (Ruhehaltung) mit Knochengewichten, zum Anpassen der Kleidung */
export const bodySurface = (): { pos: Float32Array; sIdx: Uint16Array; sW: Float32Array } | null => (prepared ? { pos: prepared.pos, sIdx: prepared.sIdx, sW: prepared.sW } : null);

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Gelenkpositionen der prozeduralen Figur (Meter, Füße bei y = 0)
const HIPS_Y = 0.92, HIPJ_Y = 0.86, KNEE_Y = 0.44, SH_X = 0.272, SH_Y = 1.42;
const HEIGHT = 1.86;

export function preloadHumanBody(): Promise<void> {
  if (started) return started;
  if (typeof document === 'undefined') return (started = Promise.resolve());
  return (started = new Promise<void>((resolve) => {
    new GLTFLoader().load(
      `${BASE}models/human_body.glb`,
      (gltf) => {
        try {
          prepared = prepare(gltf.scene);
        } catch (e) {
          console.warn('human_body.glb konnte nicht vorbereitet werden', e);
        }
        resolve();
      },
      undefined,
      () => resolve(),
    );
  }));
}

function prepare(scene: THREE.Object3D): Prepared {
  scene.updateMatrixWorld(true);
  let src: THREE.Mesh | null = null;
  scene.traverse((o) => {
    if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh;
  });
  if (!src) throw new Error('kein Gitter');
  const mesh = src as THREE.Mesh;
  const geo = mesh.geometry.clone();
  geo.applyMatrix4(mesh.matrixWorld);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const s = HEIGHT / (bb.max.y - bb.min.y);
  const posA = geo.attributes.position as THREE.BufferAttribute;
  const n = posA.count;

  // Körpermitte in z: Rumpfbereich
  let zs = 0, zc = 0;
  for (let i = 0; i < n; i++) {
    const y = (posA.getY(i) - bb.min.y) * s;
    if (y > 0.9 && y < 1.4) {
      zs += posA.getZ(i);
      zc++;
    }
  }
  const z0 = zs / Math.max(1, zc);
  const cx = (bb.max.x + bb.min.x) / 2;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (posA.getX(i) - cx) * s;
    pos[i * 3 + 1] = (posA.getY(i) - bb.min.y) * s;
    pos[i * 3 + 2] = (posA.getZ(i) - z0) * s;
  }

  // Arm: Schulterpunkt und Richtung des Gitters (A-Pose, ca. 45° nach unten)
  const SM = new THREE.Vector2(0.265, 1.45);
  let tipX = 0, tipY = 0, tipN = 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(pos[i * 3]) > 0.66) {
      tipX += Math.abs(pos[i * 3]);
      tipY += pos[i * 3 + 1];
      tipN++;
    }
  }
  tipX = tipN ? tipX / tipN : 0.7;
  tipY = tipN ? tipY / tipN : 1.0;
  const dir = new THREE.Vector2(tipX - SM.x, tipY - SM.y).normalize();
  const fromDown = Math.atan2(dir.x, -dir.y);
  const target = 0.08; // Arm hängt leicht nach außen, wie das Gelenk der Figur
  const turn = fromDown - target;

  const wa = new Float32Array(n);
  const side = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1];
    const sg = x < 0 ? -1 : 1;
    side[i] = sg;
    const rx = (Math.abs(x) - SM.x), ry = y - SM.y;
    const u = rx * dir.x + ry * dir.y;
    const d = Math.abs(rx * dir.y - ry * dir.x);
    wa[i] = smooth(-0.03, 0.07, u) * (1 - smooth(0.075, 0.13, d)) * (y > 0.7 ? 1 : 0);
  }
  // Arme nach unten drehen (um den Schulterpunkt, gewichtet)
  for (let i = 0; i < n; i++) {
    if (wa[i] <= 0) continue;
    const sg = side[i];
    const ang = turn * wa[i];
    const rx = Math.abs(pos[i * 3]) - SM.x, ry = pos[i * 3 + 1] - SM.y;
    const c = Math.cos(ang), sn = Math.sin(ang);
    // Drehung zum Körper hin: x' = x cos - y sin ... (x nach außen positiv)
    const nx = rx * c + ry * sn, ny = -rx * sn + ry * c;
    pos[i * 3] = sg * (SM.x + nx);
    pos[i * 3 + 1] = SM.y + ny;
  }
  // Schulter an die Gelenkposition der Figur setzen
  const dx = SH_X - SM.x, dy = SH_Y - SM.y;
  for (let i = 0; i < n; i++) {
    if (wa[i] <= 0) continue;
    pos[i * 3] += side[i] * dx * wa[i];
    pos[i * 3 + 1] += dy * wa[i];
  }

  // Normalen neu berechnen
  const index = new Uint32Array((geo.index as THREE.BufferAttribute).array);
  const g2 = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g2.setIndex(new THREE.BufferAttribute(index, 1));
  g2.computeVertexNormals();
  const nrm = new Float32Array((g2.attributes.normal as THREE.BufferAttribute).array);
  const uvA = geo.attributes.uv as THREE.BufferAttribute;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = uvA.getX(i);
    uv[i * 2 + 1] = uvA.getY(i);
  }

  // Gewichte. Knochen: 0 hips, 1 torso, 2 head, 3 armL, 4 elbowL, 5 armR, 6 elbowR, 7 legL, 8 kneeL, 9 legR, 10 kneeR
  const sIdx = new Uint16Array(n * 4);
  const sW = new Float32Array(n * 4);
  let hy = 0, hn = 0;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1];
    const a = wa[i];
    const infl: [number, number][] = [];
    const sg = side[i];
    if (a > 0) {
      const drop = SH_Y - y;
      const eb = smooth(0.28, 0.4, drop);
      const sh = sg < 0 ? 3 : 5, el = sg < 0 ? 4 : 6;
      infl.push([sh, a * (1 - eb)], [el, a * eb]);
    }
    const r = 1 - a;
    if (r > 0) {
      const wl = 1 - smooth(0.82, 1.0, y);
      const wk = 1 - smooth(0.38, 0.5, y);
      const left = smooth(-0.04, 0.04, x); // 1 = rechte Seite (x > 0)
      const lw = wl * (1 - left), rw = wl * left;
      infl.push([7, r * lw * (1 - wk)], [8, r * lw * wk], [9, r * rw * (1 - wk)], [10, r * rw * wk]);
      const rest = r * (1 - wl);
      const wh = smooth(1.5, 1.6, y);
      const wHip = 1 - smooth(0.98, 1.1, y);
      infl.push([2, rest * wh], [0, rest * (1 - wh) * wHip], [1, rest * (1 - wh) * (1 - wHip)]);
      if (y > 1.6) {
        hy += y;
        hn++;
      }
    }
    infl.sort((p, q) => q[1] - p[1]);
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += infl[k]?.[1] ?? 0;
    for (let k = 0; k < 4; k++) {
      sIdx[i * 4 + k] = infl[k]?.[0] ?? 0;
      sW[i * 4 + k] = sum > 0 ? (infl[k]?.[1] ?? 0) / sum : k === 0 ? 1 : 0;
    }
  }
  const hc = hn ? hy / hn : 1.72;
  // Kopfquader (Vertices über dem Hals)
  let x0 = 9, x1 = -9, y0 = 9, y1 = -9, z0b = 9, z1b = -9;
  for (let i = 0; i < n; i++) {
    const y = pos[i * 3 + 1];
    if (y < 1.64) continue;
    x0 = Math.min(x0, pos[i * 3]); x1 = Math.max(x1, pos[i * 3]);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    z0b = Math.min(z0b, pos[i * 3 + 2]); z1b = Math.max(z1b, pos[i * 3 + 2]);
  }
  const headBox = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 - 0.01, cz: (z0b + z1b) / 2, hx: (x1 - x0) / 2, hy: (y1 - y0) / 2, hz: (z1b - z0b) / 2 };
  let faceZ = 0.1;
  for (let i = 0; i < n; i++) {
    if (Math.abs(pos[i * 3]) < 0.03 && Math.abs(pos[i * 3 + 1] - hc) < 0.04) faceZ = Math.max(faceZ, pos[i * 3 + 2]);
  }
  return { pos, nrm, uv, index, sIdx, sW, wa, headCenterY: hc, faceZ, headBox };
}

export interface BodyJoints {
  hips: THREE.Object3D; torso: THREE.Object3D; head: THREE.Object3D;
  armL: THREE.Object3D; elbowL: THREE.Object3D; armR: THREE.Object3D; elbowR: THREE.Object3D;
  legL: THREE.Object3D; kneeL: THREE.Object3D; legR: THREE.Object3D; kneeR: THREE.Object3D;
}

export interface BodyMats {
  skin: THREE.Material; shirt: THREE.Material; pants: THREE.Material; shoes: THREE.Material;
}

export interface BodyParts {
  meshes: THREE.SkinnedMesh[];
  skeleton: THREE.Skeleton;
  /** Hüllen nach Name: shirt, pants, shoes, upper, fore */
  shells: Record<Cat, THREE.SkinnedMesh>;
  /** Ärmel: Oberarm- und Unterarmhülle (Material wird je Ärmellänge gewechselt) */
  upper: THREE.SkinnedMesh;
  fore: THREE.SkinnedMesh;
  headCenterY: number;
  faceZ: number;
  headBox: Prepared['headBox'];
}

/** Kategorien der Hüllen */
type Cat = 'shirt' | 'pants' | 'shoes' | 'upper' | 'fore';

/**
 * Baut das Gitter als gebundene Meshes unter `root`. Muss aufgerufen werden, solange die Gelenke in Ruhehaltung stehen.
 */
export function buildHumanBody(root: THREE.Object3D, j: BodyJoints, m: BodyMats): BodyParts | null {
  const p = prepared;
  if (!p) return null;
  root.updateMatrixWorld(true);
  const bones = [j.hips, j.torso, j.head, j.armL, j.elbowL, j.armR, j.elbowR, j.legL, j.kneeL, j.legR, j.kneeR];
  const skeleton = new THREE.Skeleton(bones as THREE.Bone[]);
  const n = p.pos.length / 3;

  const mk = (positions: Float32Array, normals: Float32Array, uvs: Float32Array, idx: Uint16Array | Uint32Array | null, si: Uint16Array, sw: Float32Array, mat: THREE.Material, name: string): THREE.SkinnedMesh => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    if (idx) g.setIndex(new THREE.BufferAttribute(idx, 1));
    const sm = new THREE.SkinnedMesh(g, mat);
    sm.name = name;
    sm.castShadow = true;
    sm.receiveShadow = true;
    sm.frustumCulled = false;
    root.add(sm);
    sm.bind(skeleton, new THREE.Matrix4());
    return sm;
  };

  const meshes: THREE.SkinnedMesh[] = [];
  meshes.push(mk(p.pos, p.nrm, p.uv, p.index, p.sIdx, p.sW, m.skin, 'body-skin'));

  // Dreiecke den Hüllen zuordnen
  const buckets: Record<Cat, number[]> = { shirt: [], pants: [], shoes: [], upper: [], fore: [] };
  const P = p.pos;
  for (let t = 0; t < p.index.length; t += 3) {
    const a = p.index[t], b = p.index[t + 1], c = p.index[t + 2];
    const y = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
    const x = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
    const wa = (p.wa[a] + p.wa[b] + p.wa[c]) / 3;
    let cat: Cat | null = null;
    if (wa > 0.5) {
      const drop = SH_Y - y;
      if (drop < 0.3) cat = 'upper';
      else if (drop < 0.57) cat = 'fore';
    } else if (y < 0.1) cat = 'shoes';
    else if (y < 0.96) cat = 'pants';
    else if (y < 1.5 + 0.02 * Math.min(1, Math.abs(x) / 0.1)) cat = 'shirt';
    if (cat) buckets[cat].push(a, b, c);
  }
  const shell = (cat: Cat, off: number, mat: THREE.Material): THREE.SkinnedMesh => {
    const tris = buckets[cat];
    const cnt = tris.length;
    const positions = new Float32Array(cnt * 3), normals = new Float32Array(cnt * 3), uvs = new Float32Array(cnt * 2);
    const si = new Uint16Array(cnt * 4), sw = new Float32Array(cnt * 4);
    for (let k = 0; k < cnt; k++) {
      const v = tris[k];
      positions[k * 3] = p.pos[v * 3] + p.nrm[v * 3] * off;
      positions[k * 3 + 1] = p.pos[v * 3 + 1] + p.nrm[v * 3 + 1] * off;
      positions[k * 3 + 2] = p.pos[v * 3 + 2] + p.nrm[v * 3 + 2] * off;
      normals.set(p.nrm.subarray(v * 3, v * 3 + 3), k * 3);
      uvs.set(p.uv.subarray(v * 2, v * 2 + 2), k * 2);
      si.set(p.sIdx.subarray(v * 4, v * 4 + 4), k * 4);
      sw.set(p.sW.subarray(v * 4, v * 4 + 4), k * 4);
    }
    const sm = mk(positions, normals, uvs, null, si, sw, mat, `body-${cat}`);
    meshes.push(sm);
    return sm;
  };
  void n;
  shell('shirt', 0.008, m.shirt);
  shell('pants', 0.007, m.pants);
  shell('shoes', 0.012, m.shoes);
  const shirtShell = meshes[1], pantsShell = meshes[2], shoesShell = meshes[3];
  const upper = shell('upper', 0.008, m.shirt);
  const fore = shell('fore', 0.007, m.shirt);
  return {
    skeleton,
    shells: { shirt: shirtShell, pants: pantsShell, shoes: shoesShell, upper, fore }, meshes, upper, fore, headCenterY: p.headCenterY, faceZ: p.faceZ, headBox: p.headBox };
}
