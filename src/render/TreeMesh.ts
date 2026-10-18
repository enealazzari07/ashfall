import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mats } from './Materials';
import { glbTrees } from './GlbTrees';
import { TREE_SPECIES, TreeSpot, pickSpecies, treeCellHeight } from './TreeSprite';

/**
 * Eigene 3D-Bäume im Aussehen der bisherigen Sprite-Bäume (gleiche 14 Arten, Größen, Farben).
 * Je Art eine Geometrie mit Vertexfarben (Rinde + Laub), normiert auf 10 Einheiten Höhe,
 * als InstancedMesh gezeichnet. Laub: facettierte Klumpen, Nadeln: gestufte Kegel, Palmen: Wedel, Trauerweide: Hängezweige.
 */
type Geo = THREE.BufferGeometry;

const hash = (x: number, y: number, z: number): number => {
  let h = Math.imul(Math.round(x * 97), 374761393) ^ Math.imul(Math.round(y * 97), 668265263) ^ Math.imul(Math.round(z * 97), 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const seeded = (seed: number) => {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
};

const col = (hex: number): THREE.Color => new THREE.Color(hex);
const tmp = new THREE.Color();

/** Geometrie fertigstellen: ohne UV, nicht indiziert, mit Normalen */
function fin(g: Geo): Geo {
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g.index ? g.toNonIndexed() : g;
}

function paint(g: Geo, fn: (x: number, y: number, z: number) => THREE.Color): Geo {
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = fn(p.getX(i), p.getY(i), p.getZ(i));
    c[i * 3] = k.r;
    c[i * 3 + 1] = k.g;
    c[i * 3 + 2] = k.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** Laubklumpen: verformtes Ikosaeder, hell oben und außen, dunkel unten und innen */
function blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, dark: number, light: number, rough = 0.3): Geo {
  // gemeinsame Ecken verschweißen, damit die Normalen weich werden und das Laub rund statt kantig wirkt
  const raw = new THREE.IcosahedronGeometry(1, 1);
  raw.deleteAttribute('uv');
  raw.deleteAttribute('normal');
  const g = mergeVertices(raw);
  const p = g.attributes.position;
  const n = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (hash(x, y, z) - 0.5) * rough * 2;
    n[i] = hash(x * 3, y * 3, z * 3);
    p.setXYZ(i, cx + x * rx * k, cy + y * ry * k, cz + z * rz * k);
  }
  const d = col(dark), l = col(light);
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const up = Math.min(1, Math.max(0, ((p.getY(i) - cy) / ry + 1) / 2));
    const outer = Math.min(1, Math.hypot(p.getX(i) - cx, p.getZ(i) - cz) / Math.max(rx, rz));
    tmp.copy(d).lerp(l, Math.min(1, Math.max(0, up * 0.6 + outer * 0.15 + (n[i] - 0.5) * 0.5 - 0.05))).multiplyScalar(0.8);
    c.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return fin(g);
}

/** Ast oder Stammstück zwischen zwei Punkten */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, hex: number, seg = 7): Geo {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  const bark = col(hex);
  paint(g, (x, y, z) => tmp.copy(bark).multiplyScalar(0.75 + 0.5 * hash(x * 2, y * 0.3, z * 2)));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (hash(p.getX(i), p.getY(i), p.getZ(i)) - 0.5) * 0.18;
    p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
  }
  return fin(g);
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Gebogener Streifen (Palmwedel, Weidenzweig), beidseitig sichtbar */
function strip(points: THREE.Vector3[], widths: number[], side: THREE.Vector3, top: number, bottom: number): Geo {
  const pos: number[] = [], cs: number[] = [], idx: number[] = [];
  const a = col(top), b = col(bottom);
  points.forEach((p, i) => {
    const w = widths[i], t = i / (points.length - 1);
    pos.push(p.x - side.x * w, p.y - side.y * w, p.z - side.z * w, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
    tmp.copy(b).lerp(a, 1 - t * 0.55);
    cs.push(tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b);
  });
  for (let i = 0; i < points.length - 1; i++) {
    const k = i * 2;
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2, k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3));
  g.setIndex(idx);
  return fin(g);
}

function frond(base: THREE.Vector3, ang: number, len: number, lift: number, top: number, bottom: number): Geo {
  const pts: THREE.Vector3[] = [], ws: number[] = [];
  const dx = Math.cos(ang), dz = Math.sin(ang);
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(V(base.x + dx * len * t, base.y + len * (lift * Math.sin(t * 1.6) - 0.55 * t * t), base.z + dz * len * t));
    ws.push((i % 2 ? 0.34 : 0.62) * Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.08)));
  }
  return strip(pts, ws, V(-dz, 0.25, dx).normalize(), top, bottom);
}

const BARK = 0x6a4f38;

/** Verzweigter Stamm und Äste; gibt die Astspitzen zurück (für Laub) */
function branches(out: Geo[], from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number, rnd: () => number, hex: number, tips: THREE.Vector3[]): void {
  const to = from.clone().addScaledVector(dir, len);
  out.push(limb(from, to, r, r * 0.68, hex, depth > 1 ? 6 : 5));
  if (depth === 0) {
    tips.push(to);
    return;
  }
  const kids = depth === 3 ? 3 : 2;
  for (let i = 0; i < kids; i++) {
    const a = rnd() * Math.PI * 2, spread = 0.45 + rnd() * 0.5;
    const nd = dir.clone().multiplyScalar(1 - spread * 0.5).add(V(Math.cos(a) * spread, 0.35, Math.sin(a) * spread)).normalize();
    branches(out, to, nd, len * (0.62 + rnd() * 0.18), r * 0.62, depth - 1, rnd, hex, tips);
  }
}

/** Laubbaum: kurzer Stamm, Äste, Laubklumpen in einer Hüllform */
function leafy(seed: number, o: { trunk: number; rx: number; y0: number; y1: number; count: number; dark: number; light: number; shape: 'dome' | 'oval' | 'cone' | 'columnar' | 'umbrella'; bark?: number; blobR: number }): Geo {
  const rnd = seeded(seed);
  const parts: Geo[] = [];
  const tips: THREE.Vector3[] = [];
  const bark = o.bark ?? BARK;
  parts.push(limb(V(0, 0, 0), V(0, o.trunk * 0.55, 0), 0.5, 0.36, bark, 8));
  branches(parts, V(0, o.trunk * 0.5, 0), V(0, 1, 0), o.trunk * 0.6, 0.36, 3, rnd, bark, tips);
  for (let i = 0; i < o.count; i++) {
    const t = i / (o.count - 1);
    const a = rnd() * Math.PI * 2 + i * 2.4;
    let y = o.y0 + (o.y1 - o.y0) * Math.pow(rnd(), o.shape === 'cone' ? 1.3 : 1);
    const u = (y - o.y0) / (o.y1 - o.y0);
    let rad: number;
    switch (o.shape) {
      case 'cone': rad = o.rx * (1 - u) * (0.2 + 0.8 * Math.sqrt(rnd())); break;
      case 'oval': rad = o.rx * Math.sin(Math.PI * (0.12 + 0.8 * u)) * Math.sqrt(rnd()); break;
      case 'columnar': rad = o.rx * (0.55 + 0.45 * Math.sin(Math.PI * u)) * Math.sqrt(rnd()); break;
      case 'umbrella': rad = o.rx * (0.15 + 0.85 * Math.sqrt(rnd())) * (0.7 + 0.3 * (1 - u)); y = o.y0 + (o.y1 - o.y0) * (0.25 + 0.75 * Math.pow(1 - (rad / o.rx) ** 2, 0.7)) * (0.65 + 0.35 * rnd()); break;
      default: rad = o.rx * Math.sin(Math.PI * (0.1 + 0.8 * u)) * Math.sqrt(rnd());
    }
    const r = o.blobR * (0.75 + rnd() * 0.55) * (o.shape === 'cone' ? 0.6 + 0.6 * (1 - u) : 1);
    const wide = o.shape === 'umbrella' ? 1.25 : 1;
    parts.push(blob(Math.cos(a) * rad, y, Math.sin(a) * rad, r * wide, r * 0.82, r * wide, o.dark, o.light));
    void t;
  }
  for (const tip of tips.slice(0, 6)) parts.push(blob(tip.x, Math.max(tip.y, o.y0 + 0.3), tip.z, o.blobR * 0.8, o.blobR * 0.65, o.blobR * 0.8, o.dark, o.light));
  return mergeGeometries(parts, false)!;
}

/** Fichte/Kiefer: gestufte, hängende Nadelkegel */
function conifer(tiers: number, baseR: number, y0: number, dark: number, light: number, seed: number): Geo {
  const rnd = seeded(seed);
  const parts: Geo[] = [limb(V(0, 0, 0), V(0, y0 + 1.5, 0), 0.34, 0.2, 0x4a3a2a, 7)];
  const d = col(dark), l = col(light);
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = baseR * Math.pow(1 - t, 0.85) + 0.3;
    const h = 2.6 - t * 0.6;
    const y = y0 + t * (10 - y0 - h * 0.55);
    const g = new THREE.ConeGeometry(r, h, 11, 2, true);
    g.translate(0, y + h / 2, 0);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), yy = p.getY(k), z = p.getZ(k);
      const low = 1 - (yy - y) / h;
      const jag = 1 + (hash(x * 4, yy * 4, z * 4) - 0.5) * 0.35 * low;
      p.setXYZ(k, x * jag, yy - low * 0.35 * (hash(x * 9, 0, z * 9) - 0.2), z * jag);
    }
    paint(g, (x, yy, z) => tmp.copy(d).lerp(l, Math.min(1, ((yy - y) / h) * 0.9 + (hash(x * 5, yy * 5, z * 5) - 0.5) * 0.4)).multiplyScalar(0.82 + 0.2 * t));
    g.rotateY(rnd() * 6);
    parts.push(fin(g));
  }
  return mergeGeometries(parts, false)!;
}

function palm(seed: number, twin: boolean): Geo {
  const rnd = seeded(seed);
  const parts: Geo[] = [];
  const trunks = twin ? [-1, 1] : [0];
  for (const side of trunks) {
    const lean = twin ? side * 1.1 : 0.5, hgt = twin ? 6.6 : 7.8;
    let prev = V(twin ? side * 0.25 : 0, 0, 0);
    let top = prev;
    for (let i = 1; i <= 7; i++) {
      const t = i / 7;
      const p = V((twin ? side * 0.25 : 0) + lean * t * t * 1.6, hgt * t, 0.3 * Math.sin(t * 2.4));
      parts.push(limb(prev, p, 0.3 - (i - 1) * 0.022, 0.3 - i * 0.022, twin ? 0x8a6a4a : 0xa05a2a, 6));
      prev = p;
      top = p;
    }
    const n = twin ? 9 : 12;
    for (let i = 0; i < n; i++) {
      parts.push(frond(top.clone(), (i / n) * Math.PI * 2 + rnd() * 0.3, 3.0 + rnd() * 0.8, 0.5 + rnd() * 0.5, 0xb6d23a, 0x6a9a14));
    }
  }
  return mergeGeometries(parts, false)!;
}

function willow(seed: number, hex: [number, number]): Geo {
  const rnd = seeded(seed);
  const parts: Geo[] = [limb(V(0, 0, 0), V(0, 3, 0), 0.5, 0.34, BARK, 8)];
  const tips: THREE.Vector3[] = [];
  branches(parts, V(0, 2.6, 0), V(0, 1, 0), 2.2, 0.34, 2, rnd, BARK, tips);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rnd();
    const rad = 1 + rnd() * 2.2;
    parts.push(blob(Math.cos(a) * rad, 6.6 + rnd() * 1.6, Math.sin(a) * rad, 2.0, 1.4, 2.0, hex[1], hex[0], 0.25));
  }
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, rad = 2.2 + rnd() * 2.4, top = 7 + rnd() * 1.2 - rad * 0.28, len = 3 + rnd() * 3.2;
    const dx = Math.cos(a), dz = Math.sin(a), pts: THREE.Vector3[] = [], ws: number[] = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      pts.push(V(dx * (rad + 0.35 * t), top - len * t, dz * (rad + 0.35 * t)));
      ws.push(0.2 * (1 - t * 0.8));
    }
    parts.push(strip(pts, ws, V(-dz, 0, dx), hex[0], hex[1]));
  }
  return mergeGeometries(parts, false)!;
}

function dead(seed: number): Geo {
  const rnd = seeded(seed);
  const parts: Geo[] = [];
  const tips: THREE.Vector3[] = [];
  branches(parts, V(0, 0, 0), V(0, 1, 0), 3.2, 0.45, 4, rnd, 0x7a6a60, tips);
  return mergeGeometries(parts, false)!;
}

/** Art → Geometrie (Höhe 10), Anteil der Zellhöhe, den der Baum im Sprite einnahm */
const SPEC: { geo: () => Geo; frac: number }[] = [
  { frac: 0.85, geo: () => leafy(11, { trunk: 3.4, rx: 4.3, y0: 4.4, y1: 9.3, count: 20, dark: 0x1d3d10, light: 0x4a7a22, shape: 'dome', blobR: 2.0 }) },
  { frac: 0.95, geo: () => conifer(9, 2.9, 0.9, 0x143418, 0x3a6a2c, 5) },
  { frac: 0.9, geo: () => palm(3, false) },
  { frac: 0.9, geo: () => palm(7, true) },
  { frac: 0.75, geo: () => willow(9, [0x7aa83a, 0x3c6a1a]) },
  { frac: 0.9, geo: () => willow(13, [0xc9a02a, 0x7a5a14]) },
  { frac: 0.95, geo: () => leafy(17, { trunk: 2.6, rx: 2.9, y0: 2.4, y1: 9.7, count: 20, dark: 0x6a4c14, light: 0xd2a838, shape: 'cone', blobR: 1.6 }) },
  { frac: 0.95, geo: () => leafy(19, { trunk: 2.2, rx: 3.1, y0: 2.6, y1: 9.7, count: 20, dark: 0x2c5412, light: 0x6aa22a, shape: 'oval', blobR: 1.6 }) },
  { frac: 0.95, geo: () => leafy(23, { trunk: 1.8, rx: 4.0, y0: 1.8, y1: 9.7, count: 24, dark: 0x1a3c10, light: 0x4a7e24, shape: 'cone', blobR: 1.9 }) },
  { frac: 0.95, geo: () => dead(29) },
  { frac: 0.6, geo: () => leafy(31, { trunk: 2.0, rx: 5.4, y0: 3.0, y1: 8.4, count: 20, dark: 0x244a12, light: 0x56882a, shape: 'umbrella', blobR: 1.9 }) },
  { frac: 0.6, geo: () => leafy(37, { trunk: 2.6, rx: 5.0, y0: 3.2, y1: 8.8, count: 18, dark: 0x1f4210, light: 0x4f8226, shape: 'umbrella', blobR: 2.0 }) },
  { frac: 0.95, geo: () => leafy(41, { trunk: 2.2, rx: 2.5, y0: 2.4, y1: 9.7, count: 18, dark: 0x1f4412, light: 0x4e8426, shape: 'columnar', blobR: 1.5 }) },
  { frac: 0.85, geo: () => leafy(43, { trunk: 2.6, rx: 3.4, y0: 2.8, y1: 9.5, count: 22, dark: 0x8a2c0c, light: 0xe0662a, shape: 'oval', blobR: 1.7 }) },
];

const cache: (Geo | null)[] = new Array(TREE_SPECIES).fill(null);
const geoOf = (i: number): Geo => cache[i] ?? (cache[i] = SPEC[i].geo());

const shadowGeo = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x0a120a, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const TINTS = [0xffffff, 0xf2f6e8, 0xe8f0dc, 0xf6f0dc];

/** Baut 3D-Bäume plus weiche Bodenschatten für eine Liste von Standorten. */
export function buildTrees(trees: TreeSpot[], group: THREE.Group, town = false): void {
  if (!trees.length) return;
  const bySpecies = new Map<number, { t: TreeSpot; h: number }[]>();
  // nur die detaillierten Bäume (Rinde + Laub); die zwei Low-Poly-Bäume und die selbstgebauten Klumpenbäume wirkten wie Cartoon
  const glb = glbTrees().filter((t) => t.parts.length > 1);
  const byGlb = new Map<number, { t: TreeSpot; h: number; sp: number }[]>();
  for (const t of trees) {
    const h = Math.abs(Math.sin(t.x * 12.9898 + t.z * 78.233) * 43758.5453);
    const sp = pickSpecies(h, town);
    // Laub-, Nadel- und Trauerbäume werden durch die GLB-Modelle ersetzt; Palmen und kahle Bäume bleiben
    if (glb.length && ![2, 3, 9].includes(sp)) {
      const gi = Math.floor(((h * 53) % 1) * glb.length);
      const l = byGlb.get(gi) ?? [];
      l.push({ t, h, sp });
      byGlb.set(gi, l);
      continue;
    }
    const list = bySpecies.get(sp) ?? [];
    list.push({ t, h });
    bySpecies.set(sp, list);
  }
  const sh = new THREE.InstancedMesh(shadowGeo, shadowMat, trees.length);
  const mtx = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(), e = new THREE.Euler();
  let si = 0;
  const M = mats();
  for (const [sp, list] of bySpecies) {
    const im = new THREE.InstancedMesh(geoOf(sp), M.crown, list.length);
    list.forEach(({ t, h }, i) => {
      const H = treeCellHeight(sp) * t.s * 0.8 * SPEC[sp].frac;
      const k = H / 10, wide = 0.9 + ((h * 31) % 1) * 0.25;
      e.set(0, (h * 977) % (Math.PI * 2), 0);
      q.setFromEuler(e);
      mtx.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(k * wide, k, k * wide));
      im.setMatrixAt(i, mtx);
      c.setHex(TINTS[Math.floor(h * 7) % TINTS.length]);
      im.setColorAt(i, c);
      const r = H * (sp >= 10 ? 0.3 : 0.2);
      mtx.compose(new THREE.Vector3(t.x, 0.05, t.z), new THREE.Quaternion(), new THREE.Vector3(r, 1, r));
      sh.setMatrixAt(si++, mtx);
    });
    im.frustumCulled = false;
    im.castShadow = false;
    im.receiveShadow = false;
    im.instanceMatrix.needsUpdate = true;
    group.add(im);
  }
  // GLB-Bäume: je Teil (Rinde, Laub) ein InstancedMesh
  for (const [gi, list] of byGlb) {
    for (const part of glb[gi].parts) {
      const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      list.forEach(({ t, h, sp }, i) => {
        const H = treeCellHeight(sp) * t.s * 0.8 * SPEC[sp].frac;
        const k = H / 10, wide = 0.9 + ((h * 31) % 1) * 0.25;
        e.set(0, (h * 977) % (Math.PI * 2), 0);
        q.setFromEuler(e);
        mtx.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(k * wide, k, k * wide));
        im.setMatrixAt(i, mtx);
        c.setHex(TINTS[Math.floor(h * 7) % TINTS.length]);
        im.setColorAt(i, c);
      });
      im.frustumCulled = false;
      im.castShadow = false;
      im.receiveShadow = false;
      im.instanceMatrix.needsUpdate = true;
      group.add(im);
    }
    for (const { t, h, sp } of list) {
      const H = treeCellHeight(sp) * t.s * 0.8 * SPEC[sp].frac;
      const r = H * 0.22;
      mtx.compose(new THREE.Vector3(t.x, 0.05, t.z), new THREE.Quaternion(), new THREE.Vector3(r, 1, r));
      sh.setMatrixAt(si++, mtx);
      void h;
    }
  }
  sh.count = si;
  sh.frustumCulled = false;
  sh.instanceMatrix.needsUpdate = true;
  group.add(sh);
}
