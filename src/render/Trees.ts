import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../world/CityGenerator';

type Geo = THREE.BufferGeometry;

export interface TreeVariant {
  trunk: Geo;
  /** Laub mit Vertexfarben (Hell-Dunkel-Verlauf); Instanzfarbe tönt es ein */
  foliage: Geo | null;
  /** Anteil am Wald */
  weight: number;
}

const hashPos = (x: number, y: number, z: number) => {
  let h = Math.imul(Math.round(x * 53), 374761393) ^ Math.imul(Math.round(y * 53), 668265263) ^ Math.imul(Math.round(z * 53), 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Unregelmäßiger Laubklumpen: verformtes Ikosaeder mit Helligkeitsverlauf von unten nach oben. */
function blob(radius: number, x: number, y: number, z: number, sy = 0.85, rough = 0.2): Geo {
  const g = new THREE.IcosahedronGeometry(radius, 2);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    const k = 1 + (hashPos(vx / radius, vy / radius, vz / radius) - 0.5) * rough * 2;
    p.setXYZ(i, vx * k, vy * k * sy, vz * k);
    const up = (vy / radius + 1) / 2;
    const shade = 0.5 + 0.5 * up + (hashPos(vx * 3, vy * 3, vz * 3) - 0.5) * 0.16;
    col.set([shade * 0.92, shade, shade * 0.9], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.translate(x, y, z);
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

function cone(r: number, h: number, y: number, rough = 0.12): Geo {
  const g = new THREE.ConeGeometry(r, h, 9, 3).toNonIndexed();
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    const k = 1 + (hashPos(vx, vy, vz) - 0.5) * rough * 2;
    p.setXYZ(i, vx * k, vy, vz * k);
    const up = (vy / h + 0.5);
    const shade = 0.45 + 0.55 * up + (hashPos(vx * 2, vy * 2, vz * 2) - 0.5) * 0.14;
    col.set([shade * 0.9, shade, shade * 0.9], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.translate(0, y, 0);
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

/** Stamm mit Verjüngung und Ästen, als nicht indizierte Geometrie (zum Zusammenfügen). */
function trunk(h: number, r0: number, r1: number, branches: [number, number, number, number][]): Geo {
  const parts: Geo[] = [];
  const t = new THREE.CylinderGeometry(r1, r0, h, 7, 3).toNonIndexed();
  const p = t.attributes.position;
  for (let i = 0; i < p.count; i++) {
    // leichte Unregelmäßigkeit
    const k = 1 + (hashPos(p.getX(i), p.getY(i), p.getZ(i)) - 0.5) * 0.12;
    p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
  }
  t.translate(0, h / 2, 0);
  parts.push(t);
  for (const [y, ang, len, tilt] of branches) {
    const b = new THREE.CylinderGeometry(r1 * 0.35, r1 * 0.7, len, 5).toNonIndexed();
    b.translate(0, len / 2, 0);
    b.rotateZ(-tilt);
    b.rotateY(ang);
    b.translate(0, y, 0);
    parts.push(b);
  }
  for (const g of parts) g.deleteAttribute('uv');
  const out = mergeGeometries(parts, false)!;
  out.computeVertexNormals();
  return out;
}

function merge(list: Geo[]): Geo {
  const g = mergeGeometries(list, false)!;
  return g;
}

let cache: TreeVariant[] | null = null;

/** Mehrere Baumsorten: Eichen, Kiefern und kahle tote Bäume. Einmal erzeugt, von allen Chunks geteilt. */
export function treeVariants(): TreeVariant[] {
  if (cache) return cache;
  const r = rng(4242);
  const oak = (seed: number): TreeVariant => {
    const rr = rng(seed);
    const blobs: Geo[] = [];
    const n = 6 + Math.floor(rr() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rr();
      const d = 0.5 + rr() * 0.7;
      blobs.push(blob(0.75 + rr() * 0.5, Math.cos(a) * d, 2.5 + rr() * 1.3, Math.sin(a) * d));
    }
    blobs.push(blob(1.0 + rr() * 0.3, 0, 3.6 + rr() * 0.4, 0));
    return {
      trunk: trunk(2.3, 0.22, 0.12, [[1.5, 0.5, 1.1, 0.9], [1.9, 2.6, 1.0, 0.8], [1.2, 4.4, 0.9, 0.7]]),
      foliage: merge(blobs),
      weight: 6,
    };
  };
  const pine = (): TreeVariant => ({
    trunk: trunk(1.5, 0.2, 0.1, []),
    foliage: merge([cone(1.45, 1.8, 2.0), cone(1.15, 1.7, 3.0), cone(0.85, 1.6, 4.0), cone(0.5, 1.4, 5.0)]),
    weight: 3,
  });
  const dead = (): TreeVariant => {
    const br: [number, number, number, number][] = [];
    for (let i = 0; i < 7; i++) br.push([1.4 + r() * 1.6, r() * Math.PI * 2, 0.9 + r() * 1.1, 0.5 + r() * 0.8]);
    return { trunk: trunk(3.2, 0.2, 0.08, br), foliage: null, weight: 1 };
  };
  cache = [oak(11), oak(23), oak(37), pine(), dead()];
  return cache;
}

/** Strauch aus drei Klumpen. */
export function bushGeometry(): Geo {
  // viele kleine, unregelmäßige Büschel statt weniger glatter Kugeln: wirkt wie Blattwerk
  const rr = rng(77);
  const parts: Geo[] = [blob(0.34, 0, 0.3, 0, 0.8, 0.34)];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rr() * 0.6, d = 0.22 + rr() * 0.22;
    parts.push(blob(0.17 + rr() * 0.12, Math.cos(a) * d, 0.17 + rr() * 0.22, Math.sin(a) * d, 0.8, 0.34));
  }
  return merge(parts);
}

export function pickVariant(vs: TreeVariant[], x: number, z: number): number {
  const total = vs.reduce((s, v) => s + v.weight, 0);
  let t = hashPos(x, 0, z) * total;
  for (let i = 0; i < vs.length; i++) if ((t -= vs[i].weight) < 0) return i;
  return 0;
}
