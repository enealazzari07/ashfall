import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Decor, PROP_KINDS, Prop } from './CityGenerator';

type Geo = THREE.BufferGeometry;
const C = new THREE.Color();

/** Zusammengesetzte Möbelmodelle aus Quadern und Zylindern mit Vertexfarben (lokal: Rückwand bei -z, Front bei +z). */
/** Kleine Zufallszahl aus der Position: jedes Teil bekommt einen minimal anderen Farbton (kein flaches Einheitsgrau) */
const tone = (x: number, y: number, z: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return 0.94 + 0.12 * (s - Math.floor(s));
};

class Parts {
  list: Geo[] = [];

  private color(g: Geo, hex: number, k = 1): Geo {
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    C.setHex(hex);
    // leichte Helligkeit nach oben (Kanten fangen Licht), unten dunkler: gibt Plastizität ohne Beleuchtung
    g.computeBoundingBox();
    const y0 = g.boundingBox!.min.y, hh = Math.max(0.001, g.boundingBox!.max.y - y0);
    const p = g.attributes.position;
    for (let i = 0; i < n; i++) {
      const up = 0.93 + 0.1 * ((p.getY(i) - y0) / hh);
      a.set([C.r * k * up, C.g * k * up, C.b * k * up], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  }

  /**
   * Quader; ab 5 cm Kantenlänge mit abgerundeten Kanten (Fase), damit Möbel nicht wie harte Klötze wirken.
   * `radius` überschreibt die Rundung (z. B. weiche Polster).
   */
  box(w: number, h: number, d: number, x: number, y: number, z: number, hex: number, radius?: number): this {
    const m = Math.min(w, h, d);
    const rad = radius ?? (m >= 0.06 ? Math.min(0.012, m * 0.2) : 0);
    const g = rad > 0.0015 && m >= 0.06 ? new RoundedBoxGeometry(w, h, d, 1, Math.min(rad, m / 2 - 0.0005)) : new THREE.BoxGeometry(w, h, d);
    g.translate(x, y + h / 2, z);
    this.list.push(this.color(g, hex, tone(x, y, z)));
    return this;
  }

  /** Quader, um die z-Achse gekippt (angelehnte Bücher), Drehpunkt unten Mitte */
  boxTilt(w: number, h: number, d: number, x: number, y: number, z: number, hex: number, rz: number): this {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    g.rotateZ(rz);
    g.translate(x, y, z);
    this.list.push(this.color(g, hex, tone(x, y, z)));
    return this;
  }

  /**
   * Aufgeschwungene Tür: Teile sind relativ zum Scharnier (ox in Öffnungsrichtung `dir`) angegeben und
   * werden um die senkrechte Scharnierachse bei (hx, hz) um `yaw` gedreht.
   */
  hinged(parts: [number, number, number, number, number, number, number][], hx: number, y: number, hz: number, dir: 1 | -1, yaw: number): this {
    for (const [w, h, d, ox, oy, oz, hex] of parts) {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(dir * ox, oy + h / 2, oz);
      g.rotateY(yaw);
      g.translate(hx, y, hz);
      this.list.push(this.color(g, hex, tone(hx, y + oy, hz)));
    }
    return this;
  }

  /** Drehkörper aus Profil [Radius, Höhe] (Flaschen, Gläser, Vasen); Fuß bei y */
  lathe(profile: [number, number][], x: number, y: number, z: number, hex: number, seg = 12): this {
    const g = new THREE.LatheGeometry(profile.map(([r, hh]) => new THREE.Vector2(r, hh)), seg);
    g.translate(x, y, z);
    this.list.push(this.color(g, hex, tone(x, y, z)));
    return this;
  }

  /** Ellipsen-Zylinder (senkrechte Achse) mit Halbachsen rx, rz – für Becken, Schüsseln, Sockel */
  ell(rx: number, rz: number, h: number, x: number, y: number, z: number, hex: number, seg = 16): this {
    const g = new THREE.CylinderGeometry(1, 1, h, seg);
    g.scale(rx, 1, rz);
    g.translate(x, y + h / 2, z);
    this.list.push(this.color(g, hex));
    return this;
  }

  /** Zylinder mit senkrechter Achse (axis 'y') oder Achse entlang z/x */
  cyl(r: number, h: number, x: number, y: number, z: number, hex: number, axis: 'y' | 'x' | 'z' = 'y', seg = 12): this {
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    g.translate(x, y + (axis === 'y' ? h / 2 : r), z);
    this.list.push(this.color(g, hex));
    return this;
  }
}

function shade(hex: number, k: number): number {
  C.setHex(hex);
  C.multiplyScalar(k);
  return C.getHex();
}

const BOOK_COLORS = [0xb83a3a, 0x3a6fb8, 0xd8c24a, 0x4a8a5a, 0x8a4a8a, 0xd8d8d0, 0x6a5a4a];
const BOX_COLORS = [0xb08a5a, 0xc29a68, 0x9a7a4a, 0xd8d0c0, 0xa89070];

function rnd(seed: number): () => number {
  let a = (Math.floor(seed * 1000) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAN_COLORS = [0xc03a2a, 0x2a5ab0, 0x3a8a3a, 0xc8a82a, 0xd8d8d0, 0x8a3a8a];
const GLASS_COLORS = [0x3a7a4a, 0x8a5a2a, 0xc8d8e0, 0x2a4a8a];

/** Kleine Gegenstände (Dosen, Gläser, Flaschen, Bücher, Kartons) auf Regalbrettern */
const pickOf = <T,>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)];
const LABELS = [0xf0eee4, 0xe8d8a0, 0xe0b0a0, 0xc8dce8];
const BOTTLE_PROFILE: [number, number][] = [[0.001, 0], [0.03, 0], [0.034, 0.012], [0.035, 0.13], [0.03, 0.165], [0.015, 0.2], [0.0135, 0.27], [0.001, 0.27]];

/** Buch: farbiger Rücken mit Zierbändern und Titelfeld, heller Seitenschnitt oben; letzte Bücher lehnen schief */
function book(P: Parts, x: number, y: number, bw: number, bh: number, bd: number, color: number, lean: number, r: () => number): void {
  const z = 0.02;
  if (lean) P.boxTilt(bw, bh, bd, x, y, z, color, lean);
  else P.box(bw, bh, bd, x, y, z, color, 0.004);
  if (lean) return; // schief stehende Bücher brauchen keine Zierteile (zu klein zu sehen)
  P.box(bw - 0.008, 0.004, bd - 0.014, x, y + bh, z - 0.004, 0xe9e2cc, 0.001); // Seitenschnitt (Seiten) oben
  const band = shade(color, 1.45);
  P.box(bw + 0.001, 0.008, 0.004, x, y + bh * 0.82, z + bd / 2 + 0.001, band, 0.001);
  P.box(bw + 0.001, 0.008, 0.004, x, y + bh * 0.14, z + bd / 2 + 0.001, band, 0.001);
  if (bw > 0.034) P.box(bw * 0.6, bh * 0.22, 0.004, x, y + bh * 0.4, z + bd / 2 + 0.001, pickOf(r, LABELS), 0.001); // Titelschild
}

/** Pappkarton: Klappen mit Mittelfuge, Klebeband, Versandetikett */
function carton(P: Parts, cx: number, y: number, z: number, iw: number, ih: number, id: number, color: number, r: () => number): void {
  P.box(iw, ih, id, cx, y, z, color, 0.006);
  const flap = shade(color, 1.12);
  P.box(iw * 0.49, 0.008, id - 0.01, cx - iw * 0.25, y + ih, z, flap, 0.002);
  P.box(iw * 0.49, 0.008, id - 0.01, cx + iw * 0.25, y + ih, z, shade(color, 1.05), 0.002);
  P.box(0.045, 0.01, id + 0.004, cx, y + ih + 0.002, z, 0xd8c68a, 0.002); // Klebeband
  P.box(0.045, ih * 0.7, 0.004, cx, y + ih * 0.3, z + id / 2 + 0.001, 0xd8c68a, 0.001); // Band an der Front
  if (r() < 0.7) P.box(iw * 0.34, ih * 0.28, 0.004, cx + iw * 0.18, y + ih * 0.3, z + id / 2 + 0.002, 0xf2f0e6, 0.001); // Etikett
  P.box(iw + 0.004, 0.012, id + 0.004, cx, y, z, shade(color, 0.82), 0.002); // Bodenkante
}

/** Konservendose: Körper, Etikettband, Deckelrand und Bodenring */
function can(P: Parts, x: number, y: number, z: number, color: number, r: () => number): void {
  P.cyl(0.0335, 0.112, x, y, z, 0xb8bcc0, 'y', 12); // Blech
  P.cyl(0.0345, 0.078, x, y + 0.016, z, color, 'y', 12); // Etikett
  P.cyl(0.0345, 0.012, x, y + 0.058, z, r() < 0.5 ? 0xf0eee4 : shade(color, 1.4), 'y', 12); // Schriftband
  P.cyl(0.031, 0.005, x, y + 0.112, z, 0xd6d9dc, 'y', 12); // Deckel
}

/** Flasche aus Drehkörper mit Etikett und Kappe */
function bottle(P: Parts, x: number, y: number, z: number, color: number, r: () => number): void {
  P.lathe(BOTTLE_PROFILE, x, y, z, color, 12);
  P.cyl(0.0355, 0.07, x, y + 0.045, z, pickOf(r, LABELS), 'y', 12); // Etikett
  P.cyl(0.0155, 0.014, x, y + 0.266, z, 0xc4a040, 'y', 8); // Kappe
}

/** Einmachglas mit Inhalt und Deckel */
function jar(P: Parts, x: number, y: number, z: number, r: () => number): void {
  P.cyl(0.04, 0.12, x, y, z, 0xcfdad4, 'y', 12);
  P.cyl(0.036, 0.1, x, y + 0.006, z, pickOf(r, [0xb83a2a, 0xc8903a, 0x6a8a3a, 0x8a4a5a]), 'y', 12); // Inhalt (Marmelade, Gemüse)
  P.cyl(0.042, 0.016, x, y + 0.12, z, 0xb89a40, 'y', 12); // Deckel
  P.cyl(0.0415, 0.04, x, y + 0.04, z, pickOf(r, LABELS), 'y', 12); // Etikett
}

/**
 * Regalbrett bestücken: jedes Brett hat ein Thema (Bücher, Konserven, Kartons, Flaschen/Gläser, Mischung),
 * statt zufälligen Einheits-Klötzen.
 */
function items(P: Parts, w: number, d: number, y: number, r: () => number, palette: number[], big = false): void {
  const left = -w / 2 + 0.06, right = w / 2 - 0.06;
  if (big) {
    // Lagerregal: Kartons in unterschiedlichen Größen, teils gestapelt
    let x = left + 0.05;
    while (x < right - 0.25) {
      const iw = 0.28 + r() * 0.3, ih = 0.2 + r() * 0.22, id = Math.min(d - 0.08, 0.34 + r() * 0.14);
      if (r() < 0.85) {
        const c = pickOf(r, palette);
        carton(P, x + iw / 2, y, 0.02, iw, ih, id, c, r);
        if (r() < 0.3 && ih < 0.3) carton(P, x + iw / 2, y + ih + 0.01, 0.02, iw * 0.8, 0.16 + r() * 0.1, id * 0.9, pickOf(r, palette), r);
      }
      x += iw + 0.04;
    }
    return;
  }
  const theme = r();
  let x = left;
  if (theme < 0.4) {
    // Bücherreihe: Rücken nach vorn, unterschiedlich hoch und dick, am Ende angelehnt
    while (x < right - 0.04) {
      if (r() < 0.07) {
        x += 0.1 + r() * 0.1; // Lücke
        continue;
      }
      const bw = 0.024 + r() * 0.036, bh = 0.17 + r() * 0.15, bd = Math.min(d - 0.06, 0.13 + r() * 0.09);
      const lean = x > right - 0.3 && r() < 0.3 ? 0.2 + r() * 0.25 : 0;
      book(P, x + bw / 2, y, bw, bh, bd, pickOf(r, palette), lean, r);
      x += bw + 0.004 + (lean ? Math.sin(lean) * bh * 0.8 : 0);
    }
  } else if (theme < 0.62) {
    // Konserven in Reihen, Hintergrund eine zweite Reihe
    while (x < right - 0.08) {
      const c = pickOf(r, CAN_COLORS), n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n && x < right - 0.04; k++) {
        can(P, x + 0.035, y, 0.045, c, r);
        if (d > 0.3) can(P, x + 0.035, y, -0.03, c, r);
        if (k === 1 && r() < 0.5) can(P, x + 0.07, y + 0.113, 0.045, c, r); // zweite Lage
        x += 0.072;
      }
      x += 0.03;
    }
  } else if (theme < 0.78) {
    // Flaschen und Gläser
    while (x < right - 0.09) {
      if (r() < 0.55) bottle(P, x + 0.04, y, 0.03, pickOf(r, GLASS_COLORS), r);
      else jar(P, x + 0.045, y, 0.03, r);
      x += 0.1 + r() * 0.03;
    }
  } else if (theme < 0.9) {
    // kleine Kartons und Schachteln
    while (x < right - 0.14) {
      const iw = 0.12 + r() * 0.14, ih = 0.1 + r() * 0.14, id = Math.min(d - 0.08, 0.16 + r() * 0.12);
      carton(P, x + iw / 2, y, 0.02, iw, ih, id, pickOf(r, BOX_COLORS), r);
      x += iw + 0.025;
    }
  } else {
    // Mischung wie bei einem wirklich benutzten Regal: ein paar Bücher, eine Dose, ein Glas
    const bw = 0.03 + r() * 0.02;
    book(P, x + bw / 2, y, bw, 0.22 + r() * 0.1, 0.14, pickOf(r, palette), 0, r);
    x += bw + 0.06;
    can(P, x + 0.035, y, 0.04, pickOf(r, CAN_COLORS), r);
    x += 0.12;
    jar(P, x + 0.045, y, 0.03, r);
  }
}

/** Regalbrett-Inhalt, seitlich verschoben (für Fächer eines Schranks) */
function itemsAt(P: Parts, cx: number, w: number, d: number, y: number, r: () => number, palette: number[], big = false): void {
  const T = new Parts();
  items(T, w, d, y, r, palette, big);
  for (const g of T.list) {
    g.translate(cx, 0, 0);
    P.list.push(g);
  }
}

const GARMENTS = [0x3a5a8a, 0x8a3a3a, 0xc8b890, 0x4a4a4e, 0x6a8a5a, 0x8a6a9a, 0xd8d4c8];

/**
 * Geschlossener Schrank: hohler Korpus, Türen in `cols` Spalten und Reihen (Höhenanteile `rows`).
 * Alle Türen sind zu bis auf eine, die halb offen steht – dahinter sieht man Fächer mit Inhalt (oder Kleider).
 */
function cupboard(P: Parts, r: () => number, w: number, h: number, d: number, color: number, cols: number, rows: number[], clothes: boolean): void {
  const hw = w / 2, hd = d / 2, t = 0.025, skirt = 0.06;
  const dark = shade(color, 0.7), inner = shade(color, 0.5), front = shade(color, 1.08);
  const innerH = h - skirt - 0.04;
  P.box(w - 0.04, skirt, d - 0.04, 0, 0, 0, dark); // Sockel
  P.box(t, h - skirt, d, -hw + t / 2, skirt, 0, color);
  P.box(t, h - skirt, d, hw - t / 2, skirt, 0, color);
  P.box(w, h - skirt, 0.02, 0, skirt, -hd + 0.01, inner); // Rückwand
  P.box(w - 2 * t, 0.03, d - 0.02, 0, skirt, 0, dark); // Boden
  P.box(w + 0.02, 0.04, d + 0.02, 0, h - 0.04, 0, shade(color, 1.18), 0.012); // Deckplatte
  const cw = (w - 2 * t) / cols;
  for (let c = 1; c < cols; c++) P.box(0.02, innerH, d - 0.02, -hw + t + cw * c, skirt, 0, color);
  const cells: { cx: number; y0: number; rh: number; row: number; col: number }[] = [];
  let y = skirt;
  rows.forEach((f, row) => {
    const rh = innerH * f;
    if (row > 0) P.box(w - 2 * t, 0.025, d - 0.02, 0, y - 0.0125, 0, color); // Zwischenboden
    for (let col = 0; col < cols; col++) cells.push({ cx: -hw + t + cw * (col + 0.5), y0: y, rh, row, col });
    y += rh;
  });
  const open = cells[Math.floor(r() * cells.length)];
  for (const c of cells) {
    const dir: 1 | -1 = cols === 1 ? (r() < 0.5 ? 1 : -1) : c.col < cols / 2 ? 1 : -1; // Scharnier außen, Griff zur Mitte
    const dw = cw - 0.012, dh = c.rh - 0.02, hz = hd + 0.01;
    const handle = (ox: number): [number, number, number, number, number, number, number] => [0.02, Math.min(0.16, dh * 0.4), 0.025, ox, dh * 0.45, 0.02, 0xc8c8c0];
    if (c !== open) {
      P.box(dw, dh, 0.02, c.cx, c.y0 + 0.01, hz, front, 0.006);
      P.box(0.02, Math.min(0.16, dh * 0.4), 0.025, c.cx - dir * (dw / 2 - 0.05), c.y0 + 0.01 + dh * 0.45, hd + 0.03, 0xc8c8c0, 0.008);
      continue;
    }
    // offene Tür: halb aufgeschwungen, dahinter der Inhalt
    const yaw = (dir === 1 ? -1 : 1) * (0.9 + r() * 0.6);
    P.hinged([[dw, dh, 0.02, dw / 2, 0, 0, front], handle(dw - 0.05)], c.cx - dir * (dw / 2), c.y0 + 0.01, hz, dir, yaw);
    if (clothes && c.row === 0) {
      P.cyl(0.012, cw - 0.04, c.cx, c.y0 + dh - 0.06, 0, 0xb8bcc0, 'x', 8); // Kleiderstange
      let x = c.cx - cw / 2 + 0.05;
      while (x < c.cx + cw / 2 - 0.05) {
        const gh = dh * (0.45 + r() * 0.25);
        P.box(0.045 + r() * 0.03, gh, d * 0.5, x, c.y0 + dh - 0.06 - gh, 0, pickOf(r, GARMENTS), 0.015);
        x += 0.07;
      }
    } else {
      const mid = c.rh > 0.7;
      itemsAt(P, c.cx, cw - 0.04, d - 0.04, c.y0 + 0.03, r, BOOK_COLORS);
      if (mid) {
        P.box(cw - 0.02, 0.025, d - 0.04, c.cx, c.y0 + c.rh * 0.5, 0, color);
        itemsAt(P, c.cx, cw - 0.04, d - 0.04, c.y0 + c.rh * 0.5 + 0.025, r, BOOK_COLORS);
      }
    }
  }
}

function build(kind: string, w: number, d: number, h: number, color: number, seed: number): Parts {
  const P = new Parts();
  const r = rnd(seed);
  const hw = w / 2, hd = d / 2;
  const dark = shade(color, 0.7), light = shade(color, 1.18);
  switch (kind) {
    case 'bed': {
      const sheet = color;
      P.box(w, 0.28, d, 0, 0.08, 0, 0x6a4a30);
      P.box(w + 0.02, 0.5, 0.07, 0, 0.08, -hd + 0.035, 0x5a3e28); // Kopfteil
      P.box(w + 0.02, 0.28, 0.06, 0, 0.08, hd - 0.03, 0x5a3e28); // Fußteil
      for (const sx of [-1, 1]) P.box(0.06, 0.16, 0.06, sx * (hw - 0.03), 0, hd - 0.03, 0x4a3220); // Füße
      P.box(w - 0.1, 0.2, d - 0.14, 0, 0.36, 0.02, 0xe4e0d4, 0.05); // Matratze (weich gerundet)
      P.box(w - 0.08, 0.075, d * 0.58, 0, 0.55, hd * 0.32, sheet, 0.035); // Decke
      P.box(w - 0.06, 0.04, 0.08, 0, 0.6, hd * 0.05, shade(sheet, 1.12), 0.02); // Umschlag der Decke
      P.box(w * 0.34, 0.11, 0.34, -w * 0.22, 0.56, -hd + 0.3, 0xf2f0e8, 0.05);
      P.box(w * 0.34, 0.11, 0.34, w * 0.22, 0.56, -hd + 0.3, 0xf2f0e8, 0.05);
      break;
    }
    case 'sofa': {
      P.box(w, 0.42, d, 0, 0.08, 0, dark, 0.03);
      for (const sx of [-1, 1]) P.box(0.07, 0.1, 0.07, sx * (hw - 0.08), 0, hd - 0.08, 0x2a2420); // Füße
      P.box(w, 0.5, 0.24, 0, 0.42, -hd + 0.12, color, 0.06); // Rückenlehne
      P.box(0.22, 0.34, d - 0.1, -hw + 0.11, 0.42, 0.04, color, 0.07); // Armlehnen (gepolstert)
      P.box(0.22, 0.34, d - 0.1, hw - 0.11, 0.42, 0.04, color, 0.07);
      P.box((w - 0.5) / 2, 0.14, d - 0.34, -(w - 0.5) / 4, 0.42, 0.14, light, 0.06); // Sitzkissen
      P.box((w - 0.5) / 2, 0.14, d - 0.34, (w - 0.5) / 4, 0.42, 0.14, light, 0.06);
      P.box(0.5, 0.3, 0.12, -w * 0.3, 0.6, -hd + 0.28, shade(color, 0.85), 0.06); // Rückenkissen
      P.box(0.5, 0.3, 0.12, w * 0.12, 0.6, -hd + 0.28, shade(color, 0.92), 0.06);
      break;
    }
    case 'table': {
      P.box(w, 0.05, d, 0, h - 0.05, 0, color, 0.012);
      P.box(w - 0.16, 0.08, d - 0.16, 0, h - 0.13, 0, dark); // Zarge unter der Platte
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(0.07, h - 0.05, 0.07, sx * (hw - 0.08), 0, sz * (hd - 0.08), dark, 0.015);
      break;
    }
    case 'chair': {
      P.box(w, 0.05, d, 0, 0.42, 0, color, 0.015);
      for (let i = 0; i < 3; i++) P.box(w - 0.04, 0.09, 0.025, 0, 0.55 + i * 0.12, -hd + 0.03, color, 0.008); // Sprossen der Lehne
      for (const sx of [-1, 1]) P.box(0.04, 0.46, 0.04, sx * (hw - 0.04), 0.42, -hd + 0.04, dark, 0.01);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(0.04, 0.42, 0.04, sx * (hw - 0.04), 0, sz * (hd - 0.04), dark, 0.01);
      break;
    }
    case 'shelf': {
      if (r() < 0.4) {
        // geschlossenes Regal mit Türen, eine davon steht offen
        cupboard(P, r, w, h, d, color, w > 1.5 ? 3 : 2, [0.55, 0.45], false);
        if (r() < 0.5) itemsAt(P, 0, w - 0.1, d, h, r, BOX_COLORS, true); // Kartons obendrauf
        break;
      }
      P.box(0.04, h, d, -hw + 0.02, 0, 0, dark);
      P.box(0.04, h, d, hw - 0.02, 0, 0, dark);
      P.box(w, h, 0.03, 0, 0, -hd + 0.015, shade(color, 0.85));
      P.box(w - 0.04, 0.08, 0.02, 0, 0, hd - 0.03, dark); // Sockelblende
      const n = h > 1.95 ? 5 : 4;
      for (let i = 0; i < n; i++) {
        const y = 0.1 + ((h - 0.2) * i) / (n - 1);
        P.box(w - 0.04, 0.03, d, 0, y, 0, color);
        if (i < n - 1) items(P, w - 0.08, d, y + 0.03, r, BOOK_COLORS);
        else if (r() < 0.7) itemsAt(P, 0, w - 0.1, d, y + 0.03, r, BOX_COLORS, true); // oberstes Brett: Kartons
      }
      break;
    }
    case 'cabinet': {
      cupboard(P, r, w, h, d, color, w > 1.1 ? 2 : 1, [1], false);
      break;
    }
    case 'crate': {
      P.box(w, h, d, 0, 0, 0, color);
      for (const y of [0.02, h * 0.5 - 0.04, h - 0.1]) P.box(w + 0.02, 0.08, d + 0.02, 0, y, 0, dark);
      for (const sx of [-1, 1]) P.box(0.08, h, d + 0.02, sx * (hw - 0.04), 0, 0, dark);
      break;
    }
    case 'chest': {
      P.box(w, h * 0.7, d, 0, 0, 0, color);
      P.box(w + 0.02, h * 0.3, d + 0.02, 0, h * 0.7, 0, light);
      P.box(0.08, h, d + 0.04, -w * 0.3, 0, 0, 0x3a3a3a);
      P.box(0.08, h, d + 0.04, w * 0.3, 0, 0, 0x3a3a3a);
      P.box(0.1, 0.12, 0.04, 0, h * 0.62, hd + 0.02, 0xc8a84a);
      break;
    }
    case 'fridge': {
      const steel = 0xbfc3c8, inset = shade(color, 1.05);
      P.box(w - 0.04, 0.06, d - 0.06, 0, 0, -0.01, 0x3a3a3e); // Sockel
      P.box(w, h - 0.06, d, 0, 0.06, 0, color);
      P.box(w, 0.025, d, 0, h - 0.025, 0, shade(color, 0.88)); // Deckel
      P.box(w - 0.05, h * 0.6, 0.016, 0, 0.1, hd + 0.006, inset); // Tür unten
      P.box(w - 0.05, h * 0.27, 0.016, 0, h * 0.69, hd + 0.006, inset); // Gefrierfach-Tür
      P.box(w + 0.004, 0.014, 0.012, 0, h * 0.66, hd + 0.004, 0x2a2a2e); // Fuge
      P.box(0.026, h * 0.3, 0.035, hw - 0.1, h * 0.22, hd + 0.03, steel); // Griffe
      P.box(0.026, 0.22, 0.035, hw - 0.1, h * 0.7, hd + 0.03, steel);
      for (const sx of [-1, 1]) P.box(0.06, 0.04, 0.06, sx * (hw - 0.08), 0, hd - 0.08, 0x2a2a2e); // Füße
      break;
    }
    case 'stove': {
      P.box(w, h - 0.03, d, 0, 0, 0, color);
      P.box(w - 0.04, 0.03, d - 0.04, 0, h - 0.03, 0, 0x222226);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.cyl(0.09, 0.012, sx * w * 0.22, h, sz * d * 0.2, 0x4a4a50, 'y', 14);
      P.box(w * 0.7, 0.32, 0.015, 0, 0.18, hd + 0.005, 0x1a1a1e);
      P.box(w * 0.64, 0.022, 0.03, 0, 0.55, hd + 0.03, 0xc8c8c8); // Ofengriff
      for (let i = 0; i < 4; i++) P.box(0.05, 0.05, 0.03, -w * 0.33 + (w * 0.66 * i) / 3, h - 0.18, hd + 0.015, 0x333333);
      break;
    }
    case 'toilet': {
      const seat = 0xe9e2d0;
      P.ell(w * 0.24, d * 0.16, 0.27, 0, 0, d * 0.08, shade(color, 0.95), 14); // Sockel
      P.ell(w * 0.48, d * 0.33, 0.16, 0, 0.27, d * 0.15, color, 18); // Schüssel
      P.ell(w * 0.45, d * 0.3, 0.035, 0, 0.43, d * 0.15, seat, 18); // Sitz
      P.ell(w * 0.28, d * 0.19, 0.012, 0, 0.465, d * 0.17, 0x7fa0b4, 14); // Wasser
      P.box(w * 0.86, 0.4, 0.2, 0, 0.3, -hd + 0.1, color); // Spülkasten
      P.box(w * 0.92, 0.035, 0.22, 0, 0.7, -hd + 0.11, shade(color, 1.04)); // Deckel
      P.cyl(0.022, 0.02, 0, 0.735, -hd + 0.11, 0xc8c8c8, 'y', 8); // Spültaste
      break;
    }
    case 'sink': {
      const chrome = 0xc8ccd0;
      P.ell(0.07, 0.07, h - 0.2, 0, 0, -hd + 0.13, color, 12); // Säule
      P.box(w, 0.16, d, 0, h - 0.2, 0, color); // Beckenkörper
      P.box(w, 0.02, d, 0, h - 0.045, 0, light); // Rand
      P.box(w - 0.16, 0.012, d - 0.16, 0, h - 0.03, 0.02, 0xbcd2de); // Becken
      P.cyl(0.018, 0.1, 0, h - 0.02, -hd + 0.07, chrome, 'y', 8); // Armatur
      P.box(0.022, 0.02, 0.11, 0, h + 0.07, -hd + 0.12, chrome);
      P.box(0.04, 0.03, 0.04, 0.06, h - 0.02, -hd + 0.07, chrome);
      P.box(w * 0.94, 0.62, 0.025, 0, h + 0.2, -hd + 0.0125, 0x6a5a48); // Spiegelrahmen
      P.box(w * 0.94 - 0.07, 0.55, 0.012, 0, h + 0.235, -hd + 0.03, 0xb8d0e0); // Spiegel
      break;
    }
    case 'bathtub': {
      P.box(w, 0.12, d, 0, 0.04, 0, color);
      P.box(0.09, h - 0.08, d, -hw + 0.045, 0.08, 0, color);
      P.box(0.09, h - 0.08, d, hw - 0.045, 0.08, 0, color);
      P.box(w - 0.18, h - 0.08, 0.09, 0, 0.08, hd - 0.045, color);
      P.box(w - 0.18, h - 0.08, 0.09, 0, 0.08, -hd + 0.045, color);
      P.box(w - 0.2, 0.02, d - 0.2, 0, 0.14, 0, 0xa8c4d8);
      P.cyl(0.025, 0.2, -hw + 0.18, h, -hd + 0.1, 0xb0b0b0);
      break;
    }
    case 'wardrobe': {
      cupboard(P, r, w, h, d, color, 2, [0.7, 0.3], true);
      break;
    }
    case 'desk': {
      P.box(w, 0.04, d, 0, h - 0.04, 0, color);
      P.box(0.05, h - 0.04, d - 0.04, -hw + 0.03, 0, 0, dark);
      P.box(0.4, h - 0.04, d - 0.04, hw - 0.22, 0, 0, dark);
      P.box(0.3, 0.012, 0.012, hw - 0.22, h * 0.55, hd - 0.01, 0xc8c8c0);
      P.box(0.34, 0.24, 0.04, -w * 0.15, h, -hd + 0.2, 0x202226); // Monitor
      P.box(0.1, 0.12, 0.08, -w * 0.15, h, -hd + 0.2, 0x333333);
      break;
    }
    case 'counter': {
      P.box(w, h - 0.05, d, 0, 0, 0, color);
      P.box(w + 0.04, 0.05, d + 0.12, 0, h - 0.05, 0.03, light);
      P.box(0.4, 0.12, 0.32, -w * 0.3, h, 0, 0x2a2a2e); // Kasse
      P.box(0.3, 0.2, 0.04, -w * 0.3, h + 0.1, -0.1, 0x1a1a1e);
      P.box(w - 0.1, 0.04, 0.02, 0, 0.08, hd + 0.005, dark);
      break;
    }
    case 'rack': {
      const post = 0x4a5a78;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(0.06, h, 0.06, sx * (hw - 0.03), 0, sz * (hd - 0.03), post);
      const n = 4;
      for (let i = 0; i < n; i++) {
        const y = 0.14 + ((h - 0.3) * i) / (n - 1);
        P.box(w, 0.04, d, 0, y, 0, 0xd88a2a);
        if (i < n - 1) items(P, w - 0.12, d, y + 0.04, r, BOX_COLORS, true);
      }
      break;
    }
    case 'machine': {
      P.box(w, 0.35, d, 0, 0, 0, 0x2e3238);
      P.box(w * 0.82, h - 0.5, d * 0.8, 0, 0.35, 0, color);
      P.box(w * 0.82, 0.14, d * 0.8 + 0.02, 0, 0.55, 0, 0xd8b82a); // Warnstreifen
      P.box(w * 0.3, 0.4, 0.1, hw * 0.35, 0.9, hd * 0.8 + 0.03, 0x1e2024); // Bedienfeld
      P.box(0.05, 0.05, 0.03, hw * 0.35, 1.1, hd * 0.8 + 0.09, 0x44d86a);
      P.cyl(0.14, h * 0.5, -hw * 0.4, h - 0.2, -hd * 0.3, 0x8a8e94);
      P.cyl(0.22, 0.5, hw * 0.6, 0.2, 0, 0x3a3e44, 'x');
      break;
    }
    case 'barrel': {
      P.cyl(w / 2, h, 0, 0, 0, color, 'y', 14);
      P.cyl(w / 2 + 0.012, 0.05, 0, h * 0.2, 0, shade(color, 0.7), 'y', 14);
      P.cyl(w / 2 + 0.012, 0.05, 0, h * 0.7, 0, shade(color, 0.7), 'y', 14);
      P.cyl(w / 2 - 0.03, 0.02, 0, h, 0, shade(color, 1.3), 'y', 14);
      break;
    }
    case 'nightstand': {
      P.box(w, h, d, 0, 0, 0, color);
      P.box(w - 0.06, 0.012, 0.01, 0, h * 0.5, hd + 0.003, dark);
      P.box(0.05, 0.03, 0.03, 0, h * 0.7, hd + 0.015, 0xc8c8c0);
      P.cyl(0.07, 0.04, 0, h, 0, 0xd8c8a0, 'y', 10); // Lampenfuß
      P.cyl(0.11, 0.2, 0, h + 0.04, 0, 0xf0dca0, 'y', 10);
      break;
    }
    case 'tvstand': {
      P.box(w, h, d, 0, 0, 0, color);
      P.box(w * 0.75, 0.46, 0.07, 0, h + 0.08, 0, 0x16181c);
      P.box(w * 0.7, 0.4, 0.01, 0, h + 0.11, 0.04, 0x2a3a4a);
      P.box(0.2, 0.08, 0.14, 0, h, 0, 0x24262a);
      break;
    }
    case 'dresser': {
      P.box(w, h - 0.05, d, 0, 0.05, 0, color);
      P.box(w + 0.04, 0.04, d + 0.03, 0, h - 0.04, 0.005, light);
      for (const sx of [-1, 1]) P.box(0.05, 0.05, 0.05, sx * (hw - 0.05), 0, hd - 0.05, dark);
      const rows = 3, rh = (h - 0.2) / rows;
      for (let i = 0; i < rows; i++) {
        const y = 0.1 + i * rh;
        P.box(w - 0.08, rh - 0.03, 0.02, 0, y, hd + 0.005, shade(color, 1.1));
        P.box(0.16, 0.025, 0.03, 0, y + rh * 0.5, hd + 0.025, 0xc8c8c0);
      }
      P.box(0.28, 0.2, 0.05, -w * 0.25, h, -0.05, 0x8a7a5a); // Bilderrahmen
      break;
    }
    case 'kitchenunit': {
      P.box(w, h - 0.04, d, 0, 0.0, 0, color);
      P.box(w + 0.02, 0.04, d + 0.04, 0, h - 0.04, 0.015, 0x4a4c50); // Arbeitsplatte
      P.box(w - 0.04, 0.1, d - 0.02, 0, 0, 0.01, 0x2a2a2c); // Sockel
      const n = Math.max(2, Math.round(w / 0.5));
      for (let i = 0; i < n; i++) {
        const cx = -hw + (w / n) * (i + 0.5);
        P.box(w / n - 0.03, h - 0.24, 0.02, cx, 0.12, hd + 0.005, shade(color, 1.08));
        P.box(0.12, 0.025, 0.03, cx, h - 0.2, hd + 0.025, 0xc8c8c0);
      }
      P.box(0.5, 0.018, 0.36, -w * 0.22, h, 0, 0x9aa0a6); // Spüle
      P.cyl(0.015, 0.2, -w * 0.22, h, -hd + 0.1, 0xb8b8bc, 'y', 6);
      P.box(w - 0.04, 0.62, 0.3, 0, 1.38, -hd + 0.15, shade(color, 0.95)); // Hängeschränke
      for (let i = 1; i < n; i++) P.box(0.012, 0.6, 0.31, -hw + (w / n) * i, 1.39, -hd + 0.15, dark);
      break;
    }
    case 'washer': {
      P.box(w, h, d, 0, 0, 0, color);
      P.box(w - 0.04, 0.1, 0.02, 0, h - 0.12, hd + 0.003, 0xcfd2d6);
      P.cyl(0.19, 0.04, 0, h * 0.4, hd + 0.01, 0x9aa4b0, 'z', 18);
      P.cyl(0.14, 0.05, 0, h * 0.4, hd + 0.02, 0x2a3a4a, 'z', 18);
      for (let i = 0; i < 3; i++) P.cyl(0.018, 0.02, -0.14 + i * 0.07, h - 0.075, hd + 0.015, 0x44484c, 'z', 8);
      break;
    }
    case 'trashcan': {
      P.ell(hw * 0.95, hd * 0.95, h, 0, 0, 0, color, 14);
      P.ell(hw, hd, 0.04, 0, h, 0, shade(color, 1.25), 14);
      P.box(0.12, 0.03, 0.03, 0, h + 0.04, 0, 0x2a2a2e);
      break;
    }
    case 'locker': {
      P.box(w, h, d, 0, 0, 0, color);
      for (let i = 0; i < 4; i++) P.box(w * 0.6, 0.012, 0.01, 0, h * 0.82 + i * 0.03, hd + 0.003, 0x303830);
      P.box(0.03, 0.12, 0.03, hw * 0.55, h * 0.5, hd + 0.02, 0xc0c0b8);
      break;
    }
    case 'car': {
      const glass = 0x1a2430;
      P.box(w, 0.5, d, 0, 0.25, 0, color);
      P.box(w * 0.5, 0.5, d - 0.14, -w * 0.06, 0.75, 0, shade(color, 1.05));
      P.box(w * 0.5 + 0.01, 0.38, d - 0.1, -w * 0.06, 0.8, 0, glass);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.cyl(0.32, 0.24, sx * w * 0.32, 0, sz * (hd - 0.04), 0x151517, 'z', 14);
      P.box(0.05, 0.12, d * 0.7, w / 2 - 0.02, 0.4, 0, 0xf0e8b0); // Scheinwerfer
      P.box(0.05, 0.1, d * 0.7, -w / 2 + 0.02, 0.4, 0, 0xa02020);
      break;
    }
    default:
      P.box(w, h, d, 0, 0, 0, color);
  }
  return P;
}

/** Alle Möbel einer Etage zu einem Netz mit Vertexfarben verschmelzen (ein Draw-Call). */
export function propsGeometry(props: Prop[]): Geo | null {
  const geos: Geo[] = [];
  for (const p of props) {
    const k = PROP_KINDS[p.kind];
    const parts = build(k.id, p.lw, p.ld, p.h, p.color, p.x * 7 + p.z * 13);
    const m = new THREE.Matrix4().makeRotationY(p.yaw).setPosition(p.x, 0, p.z);
    for (const g of parts.list) {
      g.applyMatrix4(m);
      geos.push(g.index ? g.toNonIndexed() : g);
    }
  }
  if (!geos.length) return null;
  const out = mergeGeometries(geos, false);
  if (out) out.userData.ownGeo = true;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Kleinkram
// ---------------------------------------------------------------------------------------------------------------

const PAPER = [0xf2f0e6, 0xe8e4d4, 0xd8d4c4, 0xe6dcc0];
const CARDBOARD = [0xb08a5a, 0xc29a68, 0x9a7a4a, 0xa88a62];
const CLOTH = [0x3a5a8a, 0x8a3a3a, 0xc8b890, 0x4a4a4e, 0x6a8a5a, 0x8a6a9a];
const BUCKET = [0xc03a2a, 0x2a5ab0, 0x8a8e94, 0xd8a82a];
const RUG: [number, number][] = [[0x7a3a3a, 0xd8c8a0], [0x3a5a7a, 0xc8c0a8], [0x5a6a4a, 0xb8a880], [0x6a4a6a, 0xd0c0b0]];
const ART: [number, number][] = [[0xa8c8e0, 0x5a8a4a], [0xe8c890, 0x8a5a3a], [0x2a3a5a, 0xd8d0b0], [0xc84a3a, 0xe8e0c8]];

function buildDecor(kind: string, v: number, r: () => number, onSurface: boolean): Parts {
  const P = new Parts();
  switch (kind) {
    case 'paper': {
      const n = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const g = new THREE.BoxGeometry(0.21, 0.004, 0.297);
        g.rotateY((r() - 0.5) * 1.6);
        g.translate((r() - 0.5) * 0.12, 0.003 + i * 0.004, (r() - 0.5) * 0.12);
        const arr = new Float32Array(g.attributes.position.count * 3);
        C.setHex(PAPER[(v + i) % PAPER.length]);
        for (let k = 0; k < g.attributes.position.count; k++) arr.set([C.r, C.g, C.b], k * 3);
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        P.list.push(g);
      }
      break;
    }
    case 'carton': {
      const dims = [[0.5, 0.34, 0.4], [0.42, 0.28, 0.34], [0.6, 0.42, 0.45], [0.34, 0.24, 0.3]][v % 4];
      const c = CARDBOARD[v % CARDBOARD.length];
      P.box(dims[0], dims[1], dims[2], 0, 0, 0, c);
      P.box(dims[0] * 0.16, 0.006, dims[2] + 0.002, 0, dims[1], 0, 0xd8c8a0);
      P.box(dims[0] + 0.004, 0.01, 0.012, 0, dims[1] - 0.005, dims[2] / 2 - 0.1, shade(c, 0.78));
      if (v % 2) P.box(dims[0] * 0.7, dims[1] * 0.6, dims[2] * 0.7, 0.04, dims[1], -0.02, shade(c, 1.08)); // zweiter Karton obendrauf
      break;
    }
    case 'bottle': {
      const c = GLASS_COLORS[v % 4];
      P.cyl(0.035, 0.2, 0, 0, 0, c, 'y', 10);
      P.cyl(0.014, 0.08, 0, 0.2, 0, c, 'y', 8);
      P.cyl(0.017, 0.015, 0, 0.28, 0, 0xc0c0c0, 'y', 8);
      break;
    }
    case 'can': {
      P.cyl(0.033, 0.115, 0, 0, 0, CAN_COLORS[v % CAN_COLORS.length], 'y', 10);
      P.cyl(0.03, 0.006, 0, 0.115, 0, 0xc8c8c8, 'y', 10);
      break;
    }
    case 'books': {
      let y = 0;
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const g = new THREE.BoxGeometry(0.2 + r() * 0.04, 0.035 + r() * 0.025, 0.15 + r() * 0.04);
        g.rotateY((r() - 0.5) * 0.5);
        g.translate((r() - 0.5) * 0.03, y + 0.02, 0);
        y += 0.045;
        const arr = new Float32Array(g.attributes.position.count * 3);
        C.setHex(BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)]);
        for (let k = 0; k < g.attributes.position.count; k++) arr.set([C.r, C.g, C.b], k * 3);
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        P.list.push(g);
      }
      break;
    }
    case 'cloth': {
      for (let i = 0; i < 3; i++) {
        const g = new THREE.BoxGeometry(0.45 + r() * 0.2, 0.04 + i * 0.01, 0.35 + r() * 0.2);
        g.rotateY(r() * 3);
        g.translate((r() - 0.5) * 0.1, 0.02 + i * 0.03, (r() - 0.5) * 0.1);
        const arr = new Float32Array(g.attributes.position.count * 3);
        C.setHex(CLOTH[(v + i) % CLOTH.length]);
        for (let k = 0; k < g.attributes.position.count; k++) arr.set([C.r, C.g, C.b], k * 3);
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        P.list.push(g);
      }
      break;
    }
    case 'trashbag': {
      const g = new THREE.SphereGeometry(0.3, 10, 8);
      g.scale(1, 0.9, 0.85);
      g.translate(0, 0.27, 0);
      const arr = new Float32Array(g.attributes.position.count * 3);
      C.setHex(v % 2 ? 0x1c1e20 : 0x23302a);
      for (let k = 0; k < g.attributes.position.count; k++) arr.set([C.r, C.g, C.b], k * 3);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      P.list.push(g);
      P.cyl(0.05, 0.1, 0, 0.5, 0, 0x14161a, 'y', 8);
      break;
    }
    case 'bucket': {
      const c = BUCKET[v % BUCKET.length];
      P.cyl(0.15, 0.3, 0, 0, 0, c, 'y', 14);
      P.cyl(0.155, 0.03, 0, 0.27, 0, shade(c, 0.8), 'y', 14);
      P.cyl(0.125, 0.01, 0, 0.3, 0, 0x2a2a2e, 'y', 14);
      break;
    }
    case 'rug': {
      const [a, b] = RUG[v % RUG.length];
      P.box(2.1, 0.014, 1.5, 0, 0, 0, a);
      P.box(1.9, 0.017, 1.3, 0, 0, 0, b);
      P.box(1.5, 0.02, 0.9, 0, 0, 0, shade(a, 1.15));
      P.box(1.3, 0.022, 0.7, 0, 0, 0, b);
      break;
    }
    case 'plant': {
      P.cyl(0.17, 0.26, 0, 0, 0, 0xa8603a, 'y', 12);
      P.cyl(0.18, 0.03, 0, 0.24, 0, 0x8a4a2a, 'y', 12);
      P.cyl(0.15, 0.01, 0, 0.27, 0, 0x3a2a1a, 'y', 12);
      for (let i = 0; i < 6; i++) {
        const g = new THREE.SphereGeometry(0.2, 8, 6);
        g.scale(0.6, 1.1, 0.6);
        const a = (i / 6) * Math.PI * 2 + r();
        g.translate(Math.cos(a) * 0.1, 0.5 + r() * 0.3, Math.sin(a) * 0.1);
        const arr = new Float32Array(g.attributes.position.count * 3);
        C.setHex([0x3a7a3a, 0x4a8a3a, 0x2f6a34][i % 3]);
        for (let k = 0; k < g.attributes.position.count; k++) arr.set([C.r, C.g, C.b], k * 3);
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        P.list.push(g);
      }
      break;
    }
    case 'picture': {
      const [top, bot] = ART[v % ART.length];
      P.box(0.72, 0.52, 0.035, 0, -0.26, 0, 0x3a2a1e);
      P.box(0.62, 0.42, 0.04, 0, -0.21, 0.004, top);
      P.box(0.62, 0.2, 0.042, 0, -0.21, 0.004, bot);
      P.box(0.28, 0.12, 0.044, -0.1, -0.1, 0.004, shade(bot, 1.3));
      break;
    }
    case 'lamp': {
      if (onSurface) {
        P.cyl(0.07, 0.03, 0, 0, 0, 0x3a3a3e, 'y', 10);
        P.cyl(0.012, 0.22, 0, 0.03, 0, 0x8a8a8a, 'y', 6);
        P.cyl(0.11, 0.17, 0, 0.24, 0, 0xf0dca0, 'y', 10);
      } else {
        P.cyl(0.14, 0.03, 0, 0, 0, 0x2a2a2e, 'y', 12);
        P.cyl(0.012, 1.3, 0, 0.03, 0, 0x6a6a6a, 'y', 6);
        P.cyl(0.18, 0.24, 0, 1.24, 0, 0xf0dca0, 'y', 12);
      }
      break;
    }
    case 'hay': {
      const c = [0xd2b25a, 0xc8a64c, 0xdcc070][v % 3];
      P.box(1.1, 0.5, 0.7, 0, 0, 0, c);
      for (const x of [-0.3, 0.3]) P.box(0.04, 0.52, 0.72, x, 0, 0, 0x6a5430);
      for (let i = 0; i < 5; i++) P.box(1.0, 0.012, 0.012, 0, 0.1 + i * 0.09, 0.351, shade(c, 0.78));
      if (v % 2) P.box(1.0, 0.42, 0.6, 0.05, 0.5, 0, shade(c, 1.06));
      break;
    }
    case 'sack': {
      const c = [0xcdb98a, 0xc4af80, 0xd8c8a0][v % 3];
      const g = new THREE.SphereGeometry(0.28, 10, 8);
      g.scale(1, 1.15, 0.85);
      g.translate(0, 0.3, 0);
      const arr = new Float32Array(g.attributes.position.count * 3);
      C.setHex(c);
      for (let k = 0; k < g.attributes.position.count; k++) arr.set([C.r, C.g, C.b], k * 3);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      P.list.push(g);
      P.cyl(0.08, 0.1, 0, 0.58, 0, shade(c, 0.8), 'y', 8);
      P.box(0.14, 0.02, 0.02, 0, 0.64, 0, 0x6a5a3a);
      break;
    }
    default: { // plank
      const g = new THREE.BoxGeometry(1.2, 0.035, 0.12);
      g.rotateY(r() * 3);
      g.translate(0, 0.02, 0);
      const arr = new Float32Array(g.attributes.position.count * 3);
      C.setHex(0x8a6a44);
      for (let k = 0; k < g.attributes.position.count; k++) arr.set([C.r, C.g, C.b], k * 3);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      P.list.push(g);
    }
  }
  return P;
}

/** Kleinkram einer Etage als ein verschmolzenes Netz. */
export function decorGeometry(list: Decor[]): Geo | null {
  const geos: Geo[] = [];
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 1, 0);
  for (const d of list) {
    const parts = buildDecor(d.kind, d.v, rnd(d.x * 3.1 + d.z * 7.7), d.y > 0.05);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(d.x, d.y, d.z), q.setFromAxisAngle(axis, d.yaw), new THREE.Vector3(d.s, d.s, d.s),
    );
    for (const g of parts.list) {
      g.applyMatrix4(m);
      geos.push(g.index ? g.toNonIndexed() : g);
    }
  }
  if (!geos.length) return null;
  const out = mergeGeometries(geos, false);
  if (out) out.userData.ownGeo = true;
  return out;
}



