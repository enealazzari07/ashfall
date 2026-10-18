import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RoofUnit } from './CityGenerator';

type Geo = THREE.BufferGeometry;
const C = new THREE.Color();

/** Kleiner Baukasten für zusammengesetzte Dachaufbauten mit Vertexfarben. */
class Kit {
  list: Geo[] = [];

  private add(g: Geo, hex: number, x: number, y: number, z: number): this {
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    C.setHex(hex);
    for (let i = 0; i < n; i++) a.set([C.r, C.g, C.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.translate(x, y, z);
    this.list.push(g);
    return this;
  }

  /** y = Unterkante */
  box(w: number, h: number, d: number, x: number, y: number, z: number, hex: number, rx = 0, ry = 0, rz = 0): this {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    if (rz) g.rotateZ(rz);
    return this.add(g, hex, x, y, z);
  }

  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, hex: number, seg = 12, rx = 0, rz = 0): this {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    g.translate(0, h / 2, 0);
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    return this.add(g, hex, x, y, z);
  }

  dome(r: number, x: number, y: number, z: number, hex: number, rx = 0, rz = 0, sy = 0.35): this {
    const g = new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(1, sy, 1);
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    return this.add(g, hex, x, y, z);
  }

  /** Strebe zwischen zwei Punkten */
  strut(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, t: number, hex: number): this {
    const dir = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0);
    const len = dir.length();
    const g = new THREE.BoxGeometry(t, t, len);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize()));
    return this.add(g, hex, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  }
}

const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

function airConditioner(k: Kit, w: number, d: number, h: number, seed: number): void {
  const body = [0xd8dcdf, 0xcdd2d6, 0xe3e5e2][Math.floor(hash(seed) * 3)];
  const steel = 0x3a3e44, dark = 0x2a2d32, grille = 0x6c727a;
  for (const sz of [-1, 1]) k.box(w + 0.14, 0.09, 0.12, 0, 0, sz * d * 0.32, steel); // Auflageschienen
  k.box(w, h - 0.12, d, 0, 0.1, 0, body);
  k.box(w + 0.03, 0.04, d + 0.03, 0, h - 0.06, 0, shade(body, 0.86)); // Deckelrand
  // Lamellen an Front und Seite
  for (let i = 0; i < 7; i++) {
    k.box(w * 0.74, 0.022, 0.018, 0, 0.22 + i * 0.085, d / 2 + 0.008, grille);
    k.box(0.018, 0.022, d * 0.7, -w / 2 - 0.008, 0.22 + i * 0.085, 0, grille);
  }
  // Ventilatoren oben mit Schutzgitter und Flügeln
  const fans = w > 1.3 ? [-1, 1] : [0];
  for (const sx of fans) {
    const fx = sx * w * 0.25, r = Math.min(d, w / (fans.length === 2 ? 2.2 : 1.1)) * 0.42;
    k.cyl(r, r, 0.05, fx, h - 0.03, 0, dark, 18);
    for (let b = 0; b < 4; b++) k.box(r * 1.6, 0.012, 0.07, fx, h + 0.02, 0, 0x8a9098, 0, (b * Math.PI) / 4 + 0.3);
    k.box(r * 2.05, 0.014, 0.02, fx, h + 0.045, 0, 0xa4aab2);
    k.box(0.02, 0.014, r * 2.05, fx, h + 0.045, 0, 0xa4aab2);
    k.cyl(0.04, 0.04, 0.05, fx, h + 0.02, 0, 0x3a3e44, 8);
  }
  // Kältemittelleitungen und Schaltkasten
  k.cyl(0.022, 0.022, 0.9, w / 2 + 0.06, 0.2, -d * 0.2, 0xb87a40, 8, 0);
  k.cyl(0.035, 0.035, 0.9, w / 2 + 0.14, 0.2, -d * 0.2, 0xe8e8e4, 8, 0);
  k.cyl(0.022, 0.022, 0.5, w / 2 + 0.06, 0.2, -d * 0.2, 0xb87a40, 8, Math.PI / 2, 0);
  k.box(0.2, 0.26, 0.1, w / 2 + 0.1, 0.35, d * 0.25, 0x9aa0a6);
}

function shade(hex: number, f: number): number {
  C.setHex(hex);
  C.multiplyScalar(f);
  return C.getHex();
}

function waterTower(k: Kit, w: number, h: number): void {
  const r = w * 0.44, legH = 1.35;
  const steel = 0x4a4f56, wood = 0x8a6a44, band = 0x2c2e32;
  const a = r * 0.72;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.13, legH, 0.13, sx * a, 0, sz * a, steel);
  // Diagonalstreben an allen vier Seiten
  k.strut(-a, 0.1, a, a, legH - 0.1, a, 0.05, steel);
  k.strut(a, 0.1, -a, -a, legH - 0.1, -a, 0.05, steel);
  k.strut(a, 0.1, a, a, legH - 0.1, -a, 0.05, steel);
  k.strut(-a, 0.1, -a, -a, legH - 0.1, a, 0.05, steel);
  k.cyl(r + 0.14, r + 0.14, 0.09, 0, legH, 0, 0x4a3a2a, 16);
  const th = h - legH - 0.6;
  k.cyl(r, r, th, 0, legH + 0.09, 0, wood, 18);
  for (let i = 0; i < 4; i++) k.cyl(r + 0.025, r + 0.025, 0.05, 0, legH + 0.09 + (th * (i + 0.5)) / 4 - 0.025, 0, band, 18);
  // Holzdauben als feine Rillen
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2;
    k.box(0.02, th, 0.02, Math.cos(ang) * (r + 0.005), legH + 0.09, Math.sin(ang) * (r + 0.005), shade(wood, 0.75));
  }
  k.cyl(0.02, r + 0.1, 0.55, 0, legH + 0.09 + th, 0, 0x5a4a34, 18); // Kegeldach
  k.cyl(0.07, 0.07, 0.1, 0, legH + 0.09 + th + 0.53, 0, 0x3a3a3e, 8);
  // Fallrohr und Leiter
  k.cyl(0.06, 0.06, legH, r * 0.55, 0, r * 0.55, 0x7a8086, 8);
  const lz = r + 0.2;
  for (const s of [-0.18, 0.18]) k.box(0.04, legH + th, 0.04, s, 0, lz, steel);
  for (let y = 0.25; y < legH + th; y += 0.3) k.box(0.4, 0.03, 0.03, 0, y, lz, steel);
}

function chimneySmall(k: Kit, w: number, d: number, h: number): void {
  k.box(w, h, d, 0, 0, 0, 0x8a4a3a);
  for (let y = 0.2; y < h - 0.1; y += 0.26) k.box(w + 0.015, 0.025, d + 0.015, 0, y, 0, 0xbaa898); // Mörtelfugen
  k.box(w + 0.16, 0.08, d + 0.16, 0, h - 0.04, 0, 0x6a6a68);
  k.box(w + 0.08, 0.06, d + 0.08, 0, h - 0.12, 0, 0x7a7a78);
  k.cyl(0.11, 0.17, 0.2, 0, h + 0.04, 0, 0x2a2a2e, 10);
  k.box(w * 0.9, 0.04, d * 0.9, 0, h + 0.3, 0, 0x4a4a4e); // Regenhaube
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.03, 0.12, 0.03, sx * w * 0.36, h + 0.18, sz * d * 0.36, 0x4a4a4e);
}

function industrialStack(k: Kit, w: number, h: number): void {
  const segs = 6, sh = h / segs;
  for (let i = 0; i < segs; i++) {
    const t0 = 1 - (i / segs) * 0.35, t1 = 1 - ((i + 1) / segs) * 0.35;
    k.cyl(w * 0.48 * t1, w * 0.48 * t0, sh, 0, i * sh, 0, i % 2 ? 0xe8e4dc : 0xb8402e, 16);
  }
  k.cyl(w * 0.34, w * 0.34, 0.12, 0, h, 0, 0x2a2a2e, 16);
  k.cyl(w * 0.52, w * 0.52, 0.12, 0, 0, 0, 0x6a6a68, 16);
  for (const s of [-0.12, 0.12]) k.box(0.03, h * 0.9, 0.03, s, 0.2, w * 0.5, 0x3a3a3e); // Steigleiter
  for (let y = 0.5; y < h * 0.9; y += 0.4) k.box(0.3, 0.025, 0.03, 0, y, w * 0.5, 0x3a3a3e);
  for (let y = h * 0.4; y < h; y += h * 0.3) k.cyl(w * 0.44, w * 0.44, 0.04, 0, y, 0, 0x2a2a2e, 16);
}

function ventPipe(k: Kit, w: number, h: number): void {
  const zinc = 0x9aa0a6;
  k.box(w * 0.7, 0.06, w * 0.7, 0, 0, 0, 0x6a6e74);
  k.cyl(w * 0.2, w * 0.2, h, 0, 0.06, 0, zinc, 12);
  k.cyl(w * 0.2, w * 0.2, 0.35, 0, h - 0.1, 0, zinc, 12, Math.PI / 2); // Krümmer
  k.cyl(0.02, w * 0.38, 0.18, w * 0.2, h - 0.2, 0, 0x6a7076, 12, 0, Math.PI / 2);
  k.cyl(w * 0.24, w * 0.24, 0.04, 0, 0.55, 0, 0x7a8086, 12); // Schelle
}

function dishAntenna(k: Kit): void {
  k.cyl(0.05, 0.06, 1.0, 0, 0, 0, 0x6a6e74, 8);
  k.box(0.3, 0.05, 0.3, 0, 0, 0, 0x4a4e54);
  k.dome(0.42, 0.08, 1.0, 0.05, 0xe8eaee, -0.9, 0, 0.4);
  k.cyl(0.015, 0.015, 0.5, 0.08, 1.1, 0.34, 0x2a2a2e, 6, 0.9);
  k.cyl(0.04, 0.04, 0.09, 0.08, 1.38, 0.46, 0x2a2a2e, 8, 0.9);
}

function tvAntenna(k: Kit): void {
  k.cyl(0.022, 0.03, 2.6, 0, 0, 0, 0x8a9096, 8);
  for (let i = 0; i < 6; i++) k.box(0.9 - i * 0.1, 0.018, 0.018, 0, 0.9 + i * 0.28, 0, 0xb4bac0);
  k.box(0.02, 0.02, 0.5, 0, 2.5, 0, 0xb4bac0);
  k.box(0.3, 0.05, 0.3, 0, 0, 0, 0x4a4e54);
}

function roofHatch(k: Kit, w: number, d: number): void {
  k.box(w, 0.75, d, 0, 0, 0, 0xb0b0aa);
  k.box(w + 0.1, 0.07, d + 0.1, 0, 0.75, 0, 0x8a8a86);
  k.box(w * 0.5, 0.62, 0.04, 0, 0, d / 2 + 0.015, 0x4a5a6a);
  k.box(0.06, 0.1, 0.05, w * 0.15, 0.3, d / 2 + 0.04, 0xc8c8c0);
}

function skylight(k: Kit, w: number, d: number): void {
  k.box(w, 0.2, d, 0, 0, 0, 0xa8aeb4);
  k.box(w - 0.24, 0.08, d - 0.24, 0, 0.2, 0, 0x6f90ae);
  k.box(0.04, 0.1, d - 0.24, 0, 0.2, 0, 0xd8dce0);
  k.box(w - 0.24, 0.1, 0.04, 0, 0.2, 0, 0xd8dce0);
}

function duct(k: Kit, w: number, d: number): void {
  const m = 0xaeb4ba;
  k.box(0.55, 0.5, d, 0, 0.1, 0, m);
  k.box(w, 0.5, 0.55, 0, 0.1, d / 2 - 0.27, m);
  for (let z = -d / 2 + 0.4; z < d / 2 - 0.2; z += 0.9) k.box(0.6, 0.55, 0.05, 0, 0.08, z, 0x7a8086);
  for (let x = -w / 2 + 0.5; x < w / 2; x += 0.9) k.box(0.05, 0.55, 0.6, x, 0.08, d / 2 - 0.27, 0x7a8086);
  for (const sz of [-1, 1]) k.box(0.1, 0.1, 0.1, 0, 0, sz * d * 0.4, 0x4a4e54);
  k.cyl(0.14, 0.14, 0.5, w / 2 - 0.3, 0.6, d / 2 - 0.27, 0x7a8086, 12); // Abzug
}

function solarArray(k: Kit, w: number, d: number): void {
  const n = Math.max(2, Math.round(w / 1.7));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / n;
    k.box(w / n - 0.1, 0.05, d, x, 0.35, 0, 0x1b2a46, -0.5);
    k.box(w / n - 0.04, 0.03, 0.06, x, 0.3, -d * 0.45, 0xc8ccd0, -0.5);
    k.box(0.04, 0.4, 0.04, x - (w / n) * 0.4, 0, -d * 0.3, 0x8a9096);
    k.box(0.04, 0.2, 0.04, x - (w / n) * 0.4, 0, d * 0.3, 0x8a9096);
    for (let c = 1; c < 4; c++) k.box(w / n - 0.12, 0.012, 0.012, x, 0.38 + c * 0.02, 0, 0x5a7aa0, -0.5);
  }
}

/** Zusammengesetztes Netz eines Dachaufbaus; Ursprung = Mitte der Grundfläche, y = Dachfläche. */
export function roofUnitGeometry(u: RoofUnit): Geo {
  const k = new Kit();
  const seed = u.x * 3.1 + u.z * 7.7;
  switch (u.kind) {
    case 'ac': airConditioner(k, u.w, u.d, u.h, seed); break;
    case 'tank': waterTower(k, u.w, u.h); break;
    case 'chimney': chimneySmall(k, u.w, u.d, u.h); break;
    case 'stack': industrialStack(k, u.w, u.h); break;
    case 'vent': ventPipe(k, u.w, u.h); break;
    case 'dish': dishAntenna(k); break;
    case 'antenna': tvAntenna(k); break;
    case 'hatch': roofHatch(k, u.w, u.d); break;
    case 'skylight': skylight(k, u.w, u.d); break;
    case 'duct': duct(k, u.w, u.d); break;
    default: solarArray(k, u.w, u.d);
  }
  const g = mergeGeometries(k.list, false)!;
  g.userData.ownGeo = true;
  return g;
}
