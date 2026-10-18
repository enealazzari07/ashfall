import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PropKind, rng } from './CityGenerator';

/**
 * Möbel werden aus vielen kleinen Quadern/Zylindern zu EINEM Mesh mit Vertexfarben verschmolzen
 * (ein Draw-Call pro Möbelstück). Lokal: Länge entlang x, Front zeigt nach +z, Boden bei y = 0, zentriert.
 */
class Parts {
  private list: THREE.BufferGeometry[] = [];
  private c = new THREE.Color();

  private paint(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
    this.c.setHex(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([this.c.r, this.c.g, this.c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }

  /** Quader mit Mittelpunkt (x,y,z) */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): this {
    this.list.push(this.paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color));
    return this;
  }

  /** Stehender Zylinder */
  cyl(r: number, h: number, x: number, y: number, z: number, color: number, seg = 10): this {
    this.list.push(this.paint(new THREE.CylinderGeometry(r, r, h, seg).translate(x, y, z), color));
    return this;
  }

  /** Halbzylinder (Truhendeckel), Achse entlang x */
  halfCyl(r: number, len: number, x: number, y: number, z: number, color: number): this {
    const g = new THREE.CylinderGeometry(r, r, len, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
    this.list.push(this.paint(g.translate(x, y, z), color));
    return this;
  }

  build(): THREE.BufferGeometry {
    const m = mergeGeometries(this.list, false)!;
    this.list.forEach((g) => g.dispose());
    return m;
  }
}

const darken = (c: number, k: number) =>
  (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);

const ITEM_COLORS = [0xc2453d, 0x3d6fb5, 0xd9b53a, 0x5a9a56, 0xe8e2d2, 0x8a5a9a, 0xb87a3e];

function shelf(p: Parts, lw: number, ld: number, h: number, color: number, r: () => number): void {
  const dark = darken(color, 0.75);
  p.box(0.05, h, ld, -lw / 2 + 0.025, h / 2, 0, dark).box(0.05, h, ld, lw / 2 - 0.025, h / 2, 0, dark);
  p.box(lw - 0.1, h, 0.02, 0, h / 2, -ld / 2 + 0.01, darken(color, 0.55));
  const boards = h > 1.95 ? 5 : 4;
  for (let i = 0; i < boards; i++) {
    const y = 0.1 + (i * (h - 0.2)) / (boards - 1);
    p.box(lw - 0.05, 0.04, ld, 0, y, 0, color);
    if (i === boards - 1) continue; // oberstes Brett bleibt leer
    let x = -lw / 2 + 0.18;
    while (x < lw / 2 - 0.2) {
      const iw = 0.12 + r() * 0.22, ih = 0.1 + r() * 0.2, id = 0.12 + r() * 0.2;
      if (r() < 0.2) {
        x += iw + 0.05; // Lücke
        continue;
      }
      const col = ITEM_COLORS[Math.floor(r() * ITEM_COLORS.length)];
      if (r() < 0.45) p.cyl(Math.min(iw, id) / 2, ih, x + iw / 2, y + 0.02 + ih / 2, 0.02, col, 8);
      else p.box(iw, ih, id, x + iw / 2, y + 0.02 + ih / 2, 0.02, col);
      x += iw + 0.04;
    }
  }
}

function cabinet(p: Parts, lw: number, ld: number, h: number, color: number): void {
  p.box(lw, h - 0.06, ld, 0, (h - 0.06) / 2 + 0.06, 0, color);
  p.box(lw + 0.04, 0.05, ld + 0.03, 0, h - 0.025, 0.01, darken(color, 0.7)); // Platte
  p.box(lw - 0.04, 0.06, ld - 0.04, 0, 0.03, 0, darken(color, 0.5)); // Sockel
  const doors = lw > 1.1 ? 2 : 1;
  const dw = (lw - 0.1) / doors;
  for (let i = 0; i < doors; i++) {
    const cx = -lw / 2 + 0.05 + dw * (i + 0.5);
    p.box(dw - 0.03, h - 0.3, 0.025, cx, h / 2 + 0.02, ld / 2 + 0.005, darken(color, 1.15));
    const kx = doors === 2 ? cx + (i === 0 ? dw / 2 - 0.1 : -dw / 2 + 0.1) : cx + dw / 2 - 0.1;
    p.box(0.03, 0.16, 0.03, kx, h / 2, ld / 2 + 0.03, 0x2b2b2b);
  }
}

function crate(p: Parts, lw: number, ld: number, h: number, color: number): void {
  const dark = darken(color, 0.7);
  p.box(lw, h, ld, 0, h / 2, 0, color);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.09, h + 0.02, 0.09, sx * (lw / 2 - 0.04), h / 2, sz * (ld / 2 - 0.04), dark);
  for (let i = 1; i < 3; i++) {
    const y = (h * i) / 3;
    p.box(lw + 0.02, 0.045, ld + 0.02, 0, y, 0, dark);
  }
  p.box(lw - 0.1, 0.04, ld - 0.1, 0, h + 0.01, 0, darken(color, 1.1));
}

function chest(p: Parts, lw: number, ld: number, h: number, color: number): void {
  const bodyH = h * 0.62;
  p.box(lw, bodyH, ld, 0, bodyH / 2, 0, color);
  p.halfCyl(ld / 2, lw, 0, bodyH, 0, darken(color, 1.1));
  const band = 0x3a3d42;
  for (const x of [-lw / 2 + 0.12, lw / 2 - 0.12]) {
    p.box(0.07, bodyH + 0.02, ld + 0.02, x, bodyH / 2, 0, band);
    p.box(0.07, 0.03, ld + 0.02, x, bodyH + ld / 2 - 0.02, 0, band);
  }
  p.box(0.1, 0.12, 0.04, 0, bodyH - 0.02, ld / 2 + 0.02, 0xd0a840);
}

function fridge(p: Parts, lw: number, ld: number, h: number, color: number): void {
  p.box(lw, h, ld, 0, h / 2, 0, color);
  p.box(lw - 0.02, 0.012, 0.01, 0, h * 0.68, ld / 2 + 0.005, 0x9a9ea3); // Fuge
  p.box(0.035, 0.45, 0.04, lw / 2 - 0.09, h * 0.82, ld / 2 + 0.02, 0x7a7e83);
  p.box(0.035, 0.3, 0.04, lw / 2 - 0.09, h * 0.4, ld / 2 + 0.02, 0x7a7e83);
  p.box(lw, 0.04, ld, 0, h + 0.01, 0, darken(color, 0.92));
}

function table(p: Parts, lw: number, ld: number, h: number, color: number, r: () => number): void {
  p.box(lw, 0.06, ld, 0, h - 0.03, 0, color);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.07, h - 0.06, 0.07, sx * (lw / 2 - 0.08), (h - 0.06) / 2, sz * (ld / 2 - 0.08), darken(color, 0.7));
  p.cyl(0.07, 0.09, -lw * 0.2, h + 0.045, 0.05, 0xe8e2d2); // Becher
  p.box(0.3, 0.02, 0.3, lw * 0.15, h + 0.01, -0.05, ITEM_COLORS[Math.floor(r() * ITEM_COLORS.length)]);
}

function sofa(p: Parts, lw: number, ld: number, h: number, color: number): void {
  const dark = darken(color, 0.75);
  p.box(lw, 0.35, ld, 0, 0.275, 0, dark);
  const seats = lw > 2 ? 3 : 2;
  const sw = (lw - 0.5) / seats;
  for (let i = 0; i < seats; i++) p.box(sw - 0.03, 0.16, ld - 0.25, -lw / 2 + 0.25 + sw * (i + 0.5), 0.54, 0.1, color);
  p.box(lw, h - 0.4, 0.22, 0, 0.4 + (h - 0.4) / 2, -ld / 2 + 0.11, dark);
  for (const s of [-1, 1]) p.box(0.22, h - 0.25, ld, s * (lw / 2 - 0.11), 0.2 + (h - 0.25) / 2, 0, darken(color, 0.85));
  p.box(lw + 0.04, 0.08, ld + 0.04, 0, 0.04, 0, 0x2a2a2a);
}

function bed(p: Parts, lw: number, ld: number, h: number, color: number): void {
  const wood = 0x6b4a2e;
  p.box(lw, 0.28, ld, 0, 0.2, 0, wood);
  p.box(lw - 0.08, 0.2, ld - 0.08, 0, 0.42, 0, color);
  p.box(lw * 0.45, 0.06, ld - 0.14, lw * 0.2, 0.55, 0, darken(color, 0.8)); // Decke
  p.box(0.45, 0.12, ld * 0.7, -lw / 2 + 0.35, 0.58, 0, 0xf2f0ea); // Kissen
  p.box(0.08, h + 0.2, ld, -lw / 2 + 0.04, (h + 0.2) / 2 + 0.05, 0, wood); // Kopfteil
}

function stove(p: Parts, lw: number, ld: number, h: number, color: number): void {
  p.box(lw, h, ld, 0, h / 2, 0, color);
  p.box(lw - 0.04, 0.02, ld - 0.04, 0, h + 0.01, 0, 0x2a2a2e);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(0.09, 0.02, sx * lw * 0.22, h + 0.03, sz * ld * 0.22, 0x555559, 12);
  p.box(lw - 0.2, h * 0.45, 0.02, 0, h * 0.42, ld / 2 + 0.01, 0x2f2f33); // Ofentür
  p.box(lw - 0.3, 0.03, 0.03, 0, h * 0.68, ld / 2 + 0.035, 0x888888); // Griff
  for (let i = 0; i < 4; i++) p.cyl(0.02, 0.03, -lw / 2 + 0.15 + i * ((lw - 0.3) / 3), h * 0.82, ld / 2 + 0.01, 0x222222, 6);
}

/** Baut das Möbelstück als ein Mesh-Geometrie (siehe Kopfkommentar). `seed` macht das Regal-Inventar eindeutig. */
export function buildFurniture(kind: PropKind, lw: number, ld: number, h: number, color: number, seed: number): THREE.BufferGeometry {
  const p = new Parts();
  const r = rng(seed);
  switch (kind.id) {
    case 'shelf': shelf(p, lw, ld, h, color, r); break;
    case 'cabinet': cabinet(p, lw, ld, h, color); break;
    case 'crate': crate(p, lw, ld, h, color); break;
    case 'chest': chest(p, lw, ld, h, color); break;
    case 'fridge': fridge(p, lw, ld, h, color); break;
    case 'table': table(p, lw, ld, h, color, r); break;
    case 'sofa': sofa(p, lw, ld, h, color); break;
    case 'bed': bed(p, lw, ld, h, color); break;
    case 'stove': stove(p, lw, ld, h, color); break;
  }
  return p.build();
}
