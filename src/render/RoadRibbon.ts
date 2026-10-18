import * as THREE from 'three';
import { PathSlice, RoadPath, poseAt } from '../world/WorldMap';

const sm = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

export interface StripOpts {
  y: number;
  tileU: number;
  tileV: number;
  vShift?: number;
  /**
   * Nur Segmente, deren Mitte hier liegt, werden gebaut: Jedes Segment gehört genau einem Chunk,
   * so überlappen sich keine Bänder benachbarter Chunks (kein Flackern).
   */
  own?: (x: number, z: number) => boolean;
  /** Breite läuft am Pfadanfang (a Meter) bzw. -ende (b Meter) auf null zusammen (Einfädelspur) */
  taper?: { a: number; b: number };
  /** Unregelmäßiger Rand: beide Kanten wandern seitlich um bis zu amp Meter hin und her (nach außen/innen) */
  wobble?: { amp: number; phase: number };
  /** Weicher Auslauf: Eckpunkte dieser Seite werden durchsichtig (Vertexfarbe mit Alpha) */
  fade?: 'A' | 'B';
}

/** Gleichmäßiges, unregelmäßig wirkendes Rauschen in [-1, 1] entlang der Bogenlänge */
function wob(s: number, ph: number): number {
  return 0.5 * Math.sin(s * 0.17 + ph) + 0.35 * Math.sin(s * 0.43 + ph * 1.9) + 0.15 * Math.sin(s * 1.1 + ph * 0.7);
}

/** Breitenfaktor am Pfadpunkt bei Bogenlänge s */
export function widthMult(path: RoadPath, s: number, taper?: { a: number; b: number }): number {
  if (!taper) return 1;
  const a = taper.a > 0 ? sm(s / taper.a) : 1;
  const b = taper.b > 0 ? sm((path.len - s) / taper.b) : 1;
  return Math.min(a, b);
}

/** Kurvenband: Streifen zwischen den seitlichen Abständen offA (+ Seite) und offB (- Seite) neben der Mittellinie. */
export function stripGeo(sl: PathSlice, offA: number, offB: number, o: StripOpts): THREE.BufferGeometry | null {
  const path = sl.path;
  const { pts, cum } = path;
  const last = pts.length - 1;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [], col: number[] = [];
  const vs = o.vShift ?? 0;
  const shift = (s: number, off: number) => (o.wobble ? Math.sign(off) * o.wobble.amp * wob(s, o.wobble.phase + (off < 0 ? 2.7 : 0)) : 0);
  // Seitenrichtung aus den Nachbarpunkten des GANZEN Pfades: Eckpunkte stimmen in allen Chunks exakt überein
  const side = (i: number): [number, number] => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(last, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    return [-dz / l, dx / l];
  };
  let n = 0;
  for (let i = sl.i0; i < sl.i1; i++) {
    if (o.own && !o.own((pts[i].x + pts[i + 1].x) / 2, (pts[i].z + pts[i + 1].z) / 2)) continue;
    for (const k of [i, i + 1]) {
      const [nx, nz] = side(k);
      const m = widthMult(path, cum[k], o.taper);
      const p = pts[k];
      const a = (offA + shift(cum[k], offA)) * m, b = (offB + shift(cum[k], offB)) * m;
      pos.push(p.x + nx * a, o.y, p.z + nz * a, p.x + nx * b, o.y, p.z + nz * b);
      uv.push(cum[k] / o.tileU, offA / o.tileV + vs, cum[k] / o.tileU, offB / o.tileV + vs);
      if (o.fade) col.push(1, 1, 1, o.fade === 'A' ? 0 : 1, 1, 1, 1, o.fade === 'B' ? 0 : 1);
    }
    const b = n * 4;
    idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    n++;
  }
  if (!n) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (o.fade) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Punkte entlang einer Kante (z. B. für Leitplankenpfosten): x, z, Drehung um y */
export function edgePoints(
  sl: PathSlice, off: number, spacing: number, inside?: (x: number, z: number) => boolean, skip?: (s: number) => boolean,
): { x: number; z: number; rot: number }[] {
  const { path } = sl;
  const s0 = path.cum[sl.i0], s1 = path.cum[sl.i1];
  const out: { x: number; z: number; rot: number }[] = [];
  for (let s = Math.ceil(s0 / spacing) * spacing; s <= s1; s += spacing) {
    if (skip && skip(s + spacing / 2)) continue;
    const p = poseAt(path, s + spacing / 2);
    const nx = -p.tz, nz = p.tx;
    const x = p.x + nx * off, z = p.z + nz * off;
    if (inside && !inside(x, z)) continue;
    out.push({ x, z, rot: Math.atan2(-p.tz, p.tx) });
  }
  return out;
}

/** Pose auf einer Fahrspur: off > 0 = rechts (+z bei Fahrtrichtung +x), Fahrtrichtung = Pfadrichtung */
export function lanePose(path: RoadPath, s: number, off: number): { x: number; z: number; rot: number } {
  const p = poseAt(path, s);
  return { x: p.x - p.tz * off, z: p.z + p.tx * off, rot: Math.atan2(-p.tz, p.tx) };
}
