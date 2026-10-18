import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isDynamicWindow } from './Windows';
import { BuildingSpec, DOOR_H, FLOOR_H, SideFrame, WALL, WindowSpec, rng, sideFrame } from './CityGenerator';
import { makeBox } from '../render/geo';
import { mats } from '../render/Materials';

type Geo = THREE.BufferGeometry;

/** Eine Außenwand des Erdgeschosses mit echten Fensteröffnungen. Wird bei Innenansicht abgesenkt. */
export interface SideView {
  /** Enthält `low` (unteres Drittel, bleibt immer) und `high` (oberer Teil, wird beim Schnitt ausgeblendet) */
  group: THREE.Group;
  low: THREE.Group;
  high: THREE.Group;
  /** Nach außen zeigende Normale (XZ) */
  nx: number;
  nz: number;
  /** 0 = voll sichtbar, 1 = abgesenkt */
  cut: number;
}

export interface Facade {
  /** Außenwände des Erdgeschosses */
  sides: SideView[];
  /** Vereinfachte Hülle der oberen Stockwerke (für die Ferne); wird durch echte Etagen ersetzt, sobald man nah ist */
  tower: THREE.Group;
  /** Dach: gehört dem Aufrufer, verschwindet beim Betreten */
  roof: THREE.Group;
  /** Echte Außenwände einer Etage mit Fensteröffnungen (Etage 0 ist `sides`) */
  floorSides(f: number): SideView[];
}

const WOOD = [0x8a6b48, 0x7a5d3e, 0x9a7a52, 0x6f553a, 0x836445];
const SHUTTER = [0x2f5a3a, 0x30445a, 0x6a2a24, 0x7a5a38, 0x4a5a3a];
const C = new THREE.Color();

/** Mischt zwei Farben (t = Anteil von b) */
export function mixColor(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function colored(g: Geo, hex: number): Geo {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  C.setHex(hex);
  for (let i = 0; i < n; i++) a.set([C.r, C.g, C.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** Box im lokalen Wandsystem: x entlang der Wand, y Höhe, z nach außen. */
function lbox(w: number, h: number, d: number, x: number, y: number, z: number, rotZ = 0): Geo {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotZ) g.rotateZ(rotZ);
  return g.translate(x, y, z);
}

/** UVs aus lokalen Koordinaten in Metern: Fugen laufen über Wandstücke hinweg durch. */
function metricUV(g: Geo, tu: number, tv: number): Geo {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), az = Math.abs(n.getZ(i));
    if (az > 0.5) uv.setXY(i, p.getX(i) / tu, p.getY(i) / tv);
    else if (ax > 0.5) uv.setXY(i, p.getZ(i) / tu, p.getY(i) / tv);
    else uv.setXY(i, p.getX(i) / tu, p.getZ(i) / tv);
  }
  return g;
}

function matrixOf(f: SideFrame): THREE.Matrix4 {
  return new THREE.Matrix4()
    .makeBasis(new THREE.Vector3(f.ax, 0, f.az), new THREE.Vector3(0, 1, 0), new THREE.Vector3(f.nx, 0, f.nz))
    .setPosition(f.cx, 0, f.cz);
}

function merged(list: Geo[], m: THREE.Matrix4 | null): Geo | null {
  if (!list.length) return null;
  const g = mergeGeometries(list, false);
  if (!g) return null;
  if (m) g.applyMatrix4(m);
  g.userData.ownGeo = true;
  return g;
}

function mesh(g: Geo | null, mat: THREE.Material | THREE.Material[], shadow = true): THREE.Mesh | null {
  if (!g) return null;
  const m = new THREE.Mesh(g, mat);
  m.userData.ownGeo = true;
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

interface Opening { a0: number; a1: number; y0: number; y1: number }

/** Wand von a = -half..half in Streifen mit Aussparungen; `lin` bekommt die Innenverkleidung. */
function wallStrips(out: Geo[], lin: Geo[], half: number, yMin: number, yMax: number, ops: Opening[], tu = 4): void {
  let cur = -half;
  const H = yMax;
  const push = (a0: number, a1: number, y0Raw: number, y1Raw: number) => {
    const y0 = Math.max(y0Raw, yMin), y1 = Math.min(y1Raw, yMax);
    if (a1 - a0 < 0.01 || y1 - y0 < 0.01) return;
    const w = a1 - a0, h = y1 - y0, cx = (a0 + a1) / 2, cy = (y0 + y1) / 2;
    out.push(metricUV(lbox(w, h, WALL, cx, cy, 0), tu, 3));
    lin.push(metricUV(lbox(w, h, 0.03, cx, cy, -(WALL / 2 + 0.015)), 4, 3));
  };
  for (const o of [...ops].sort((p, q) => p.a0 - q.a0)) {
    push(cur, o.a0, 0, H);
    push(o.a0, o.a1, 0, o.y0);
    push(o.a0, o.a1, o.y1, H);
    cur = o.a1;
  }
  push(cur, half, 0, H);
}

/** Bis zu dieser Höhe bleibt die Wand beim Schnitt stehen (ein Drittel) */
const LOW_H = FLOOR_H / 3;

interface Parts {
  glass: Geo[];
  trim: Geo[];
  lit: Geo[];
}

/** Fensterrahmen, Scheibe und je nach Zustand Bretter, Läden oder Rollladen im lokalen Wandsystem. */
const CURTAIN = [0xb85c4a, 0xd8c8a0, 0x5a7a9a, 0x8a9a6a, 0xcfc6b0, 0x7a4a5a];

function windowParts(P: Parts, win: WindowSpec, tower: boolean, rnd: () => number, trimColor: number): void {
  const { u, w, h, y0 } = win;
  const cy = y0 + h / 2;
  const zOut = WALL / 2; // Außenfläche
  const skin = zOut + 0.03; // Bretter/Läden liegen auf der Außenfläche
  const frameD = tower ? 0.08 : WALL + 0.1;
  const fz = tower ? zOut + 0.02 : 0;
  const bar = (bw: number, bh: number, x: number, y: number, c = trimColor) =>
    P.trim.push(colored(lbox(bw, bh, frameD, x, y, fz), c));

  // Rahmen
  if (win.state !== 'roll') {
    // Rahmen ragt 6 cm in die Öffnung und 4 cm in die Wand: keine deckungsgleichen Flächen (Flackern)
    bar(0.1, h + 0.1, u - w / 2 + 0.01, cy);
    bar(0.1, h + 0.1, u + w / 2 - 0.01, cy);
    bar(w + 0.12, 0.1, u, y0 + h - 0.01);
    bar(w + 0.12, 0.1, u, y0 + 0.01);
    // Fensterbank
    P.trim.push(colored(lbox(w + 0.3, 0.07, 0.3, u, y0 - 0.1, zOut + 0.1), trimColor));
  }

  // Gardinen innen: zwei Stoffbahnen und eine Stange
  if (!tower && (win.state === 'glass' || win.state === 'broken') && h >= 0.8 && rnd() < 0.5) {
    const cloth = CURTAIN[Math.floor(rnd() * CURTAIN.length)];
    const zi = -zOut - 0.035;
    for (const side of [-1, 1]) {
      const cw = w * (0.2 + rnd() * 0.08);
      P.trim.push(colored(lbox(cw, h + 0.2, 0.035, u + side * (w / 2 - cw / 2 + 0.03), cy + 0.05, zi), cloth));
    }
    P.trim.push(colored(lbox(w + 0.3, 0.025, 0.025, u, y0 + h + 0.12, zi - 0.03), 0x3a2e24));
  }

  switch (win.state) {
    case 'glass':
    case 'broken': {
      const broken = win.state === 'broken';
      const gz = tower ? zOut + 0.015 : 0;
      const dyn = isDynamicWindow(win); // Scheibe zeichnet dann ChunkManager (kann zerbrechen)
      if (dyn) {
        if (!tower && w > 2.0 && !win.storefront) bar(0.05, h, u, cy, trimColor);
        if (win.lit) P.lit.push(new THREE.PlaneGeometry(w * 0.92, h * 0.92).translate(u, cy, gz + 0.012));
      } else if (!broken) {
        const g = new THREE.PlaneGeometry(w, h).translate(u, cy, gz);
        P.glass.push(g);
        if (!tower) {
          // Sprossen
          if (w > 2.0 && !win.storefront) bar(0.05, h, u, cy, trimColor); // große Scheiben statt vieler kleiner Felder
        }
        if (win.lit) P.lit.push(new THREE.PlaneGeometry(w * 0.92, h * 0.92).translate(u, cy, gz + 0.012));
      } else {
        // zerbrochen: nur noch eine Ecke der Scheibe steht
        const sw = w * (0.3 + rnd() * 0.25), sh = h * (0.3 + rnd() * 0.3);
        const left = rnd() < 0.5;
        P.glass.push(new THREE.PlaneGeometry(sw, sh).translate(u + (left ? -1 : 1) * (w - sw) / 2, y0 + h - sh / 2, gz));
        if (!tower) bar(0.04, h, u, cy, trimColor);
      }
      break;
    }
    case 'boarded': {
      const n = Math.max(3, Math.round(h / 0.34));
      for (let i = 0; i < n; i++) {
        const y = y0 + 0.09 + ((h - 0.18) * (i + rnd() * 0.25)) / n + 0.05;
        const pw = w + 0.3 + rnd() * 0.14;
        const rot = (rnd() - 0.5) * 0.14;
        const g = lbox(pw, 0.19, 0.05, 0, 0, 0, rot).translate(u + (rnd() - 0.5) * 0.08, Math.min(y, y0 + h - 0.05), skin + 0.025);
        P.trim.push(colored(g, WOOD[Math.floor(rnd() * WOOD.length)]));
      }
      // Dunkles Loch hinter den Brettern: man sieht die Lücken, aber nicht hindurch
      if (!tower) P.trim.push(colored(lbox(w - 0.06, h - 0.06, 0.02, u, cy, 0.0), 0x14110e));
      break;
    }
    case 'shutter': {
      const col = SHUTTER[Math.floor(rnd() * SHUTTER.length)];
      for (const side of [-1, 1]) {
        const lw = w / 2 + 0.04;
        P.trim.push(colored(lbox(lw, h + 0.02, 0.045, u + (side * w) / 4, cy, skin + 0.02), col));
        for (let k = 0; k < 4; k++) {
          P.trim.push(colored(lbox(lw - 0.04, 0.025, 0.02, u + (side * w) / 4, y0 + (h * (k + 0.5)) / 4, skin + 0.055), 0x000000 + (col >> 1 & 0x7f7f7f)));
        }
      }
      break;
    }
    case 'roll': {
      // Rollladen: Kasten oben und Lamellen
      P.trim.push(colored(lbox(w + 0.2, 0.28, 0.22, u, y0 + h + 0.12, skin + 0.06), 0x6b7076));
      const dropped = 0.55 + rnd() * 0.45; // nicht immer ganz geschlossen
      const hh = h * dropped;
      for (let k = 0; k < Math.round(hh / 0.1); k++) {
        P.trim.push(colored(lbox(w + 0.1, 0.085, 0.04, u, y0 + h - 0.05 - k * 0.1, skin + 0.03), k % 2 ? 0x80858a : 0x73787d));
      }
      if (dropped < 0.99) P.glass.push(new THREE.PlaneGeometry(w, h - hh).translate(u, y0 + (h - hh) / 2, 0));
      break;
    }
  }
}

/** Vertikaler Streifen (Pilaster) oder Sims als Gestaltungsdetail. */
function trimBand(P: Parts, b: BuildingSpec, y: number, h: number, out: number): Geo {
  const g = new THREE.BoxGeometry(b.w + out * 2, h, b.d + out * 2);
  g.translate(b.x, y, b.z);
  P.trim.push(colored(g, b.trim));
  return g;
}

/** Eine Außenwand einer Etage. Etage 0 enthält Tür, Schild, Markise; obere Etagen sitzen auf Höhe f * FLOOR_H. */
function buildSide(b: BuildingSpec, s: number, f: number, rand: (k: number) => () => number, wallMat: THREE.Material): SideView {
  const M = mats();
  const fr = sideFrame(b, s);
  const half = fr.len / 2;
  const group = new THREE.Group();
  group.position.y = f * FLOOR_H;
  const ops: Opening[] = [];
  if (f === 0 && s === b.door) ops.push({ a0: -b.doorW / 2, a1: b.doorW / 2, y0: 0, y1: DOOR_H });
  if (f === 0 && b.door2 && s === b.door2.side) ops.push({ a0: b.door2.u - (b.door2.w ?? b.doorW) / 2, a1: b.door2.u + (b.door2.w ?? b.doorW) / 2, y0: 0, y1: DOOR_H });
  const wins = b.windows
    .filter((w) => w.side === s && w.floor === f)
    .map((w) => ({ ...w, y0: w.y0 - f * FLOOR_H }));
  for (const w of wins) ops.push({ a0: w.u - w.w / 2, a1: w.u + w.w / 2, y0: w.y0, y1: w.y0 + w.h });

  const wallLow: Geo[] = [], linLow: Geo[] = [], wallHigh: Geo[] = [], linHigh: Geo[] = [];
  const tu = b.style === 'wood' ? 2.4 : 4; // Holzpaneele: ein Feld je 2,4 m mit Pfosten
  wallStrips(wallLow, linLow, half, 0, LOW_H, ops, tu);
  wallStrips(wallHigh, linHigh, half, LOW_H, FLOOR_H, ops, tu);
  const P: Parts = { glass: [], trim: [], lit: [] };
  wins.forEach((w, i) => windowParts(P, w, false, rand(f * 1000 + s * 100 + i), b.trim));
  // Klimageräte unter einzelnen Fenstern
  for (const ac of b.acs) {
    if (ac.side !== s || ac.floor !== f) continue;
    const y = ac.y - f * FLOOR_H - 0.38;
    P.trim.push(colored(lbox(0.8, 0.5, 0.42, ac.u, y, WALL / 2 + 0.21), 0xd4d6d8));
    P.trim.push(colored(lbox(0.62, 0.3, 0.02, ac.u, y - 0.02, WALL / 2 + 0.43), 0x3a3c40));
    P.trim.push(colored(lbox(0.84, 0.05, 0.46, ac.u, y + 0.25, WALL / 2 + 0.23), 0xb8babc));
  }

  // Verwitterung und Zubehör: Schmutzband am Sockel, Läufer unter Fenstern, abgeplatzte Stellen, Regenrohr
  {
    const wr = rand(f * 7000 + s * 331 + 5);
    const dirt = mixColor(b.color, 0x1c1812, 0.34);
    const pale = mixColor(b.color, 0xffffff, 0.14);
    const gz = WALL / 2 + 0.006;
    if (f === 0) {
      const bandH = 0.3;
      const segs: [number, number][] = s === b.door ? [[-half, -b.doorW / 2], [b.doorW / 2, half]] : [[-half, half]];
      // (der zweite Eingang bekommt keine eigene Sockelunterbrechung: das Schmutzband läuft hinter der Tür durch)
      for (const [a0, a1] of segs) {
        if (a1 - a0 > 0.1) P.trim.push(colored(lbox(a1 - a0, bandH, 0.012, (a0 + a1) / 2, bandH / 2, gz), dirt));
      }
    }
    for (const w of wins) {
      if (w.storefront || w.state === 'roll') continue;
      const n = 1 + Math.floor(wr() * 2.4);
      for (let k = 0; k < n; k++) {
        const len = 0.5 + wr() * 1.1, y = w.y0 - 0.06 - len / 2;
        if (y - len / 2 < 0.34) continue;
        P.trim.push(colored(lbox(0.05 + wr() * 0.1, len, 0.012, w.u + (wr() - 0.5) * w.w * 0.8, y, gz + 0.002), mixColor(b.color, 0x1c1812, 0.2)));
      }
    }
    const patches = Math.floor(wr() * 3.2);
    for (let k = 0; k < patches; k++) {
      const pw = 0.4 + wr() * 0.8, ph = 0.3 + wr() * 0.7;
      const x = (wr() * 2 - 1) * Math.max(0.1, half - 0.9), y = 0.55 + wr() * Math.max(0.2, FLOOR_H - 1.5);
      if (ops.some((o) => x + pw / 2 > o.a0 - 0.15 && x - pw / 2 < o.a1 + 0.15 && y + ph / 2 > o.y0 - 0.15 && y - ph / 2 < o.y1 + 0.15)) continue;
      P.trim.push(colored(lbox(pw, ph, 0.012, x, y, gz + 0.004, (wr() - 0.5) * 0.2), wr() < 0.55 ? pale : dirt));
    }
    if (s === 0 && b.kind !== 'shop') P.trim.push(colored(lbox(0.09, FLOOR_H, 0.09, half - 0.16, FLOOR_H / 2, WALL / 2 + 0.07), 0x62666c));
  }

  if (f === 0 && s === b.door) {
    // Hausnummer neben der Tür und bei Wohnhäusern ein Vordach
    if (b.kind !== 'shop') {
      P.trim.push(colored(lbox(0.24, 0.15, 0.02, b.doorW / 2 + 0.42, 1.65, WALL / 2 + 0.012), 0xe6e2d2));
      P.trim.push(colored(lbox(0.12, 0.07, 0.022, b.doorW / 2 + 0.42, 1.65, WALL / 2 + 0.013), 0x2a2a2e));
    }
    if (b.kind === 'house') {
      const cw = b.doorW + 1.1;
      const g = new THREE.BoxGeometry(cw, 0.07, 1.05).rotateX(0.16).translate(0, DOOR_H + 0.34, WALL / 2 + 0.52);
      P.trim.push(colored(g, mixColor(b.trim, 0x000000, 0.25)));
      for (const sx of [-1, 1]) P.trim.push(colored(lbox(0.07, 0.34, 0.5, sx * (cw / 2 - 0.1), DOOR_H + 0.12, WALL / 2 + 0.26), b.trim));
    }
    // Türschwelle und Stufe
    P.trim.push(colored(lbox(b.doorW + 0.5, 0.14, 0.7, 0, 0.07, WALL / 2 + 0.35), 0x8d8a84));
    // Markise über dem Geschäft
    if (b.kind === 'shop' && b.awning !== null) {
      const aw = Math.min(fr.len - 0.8, 7.4);
      const stripes = Math.max(4, Math.round(aw / 0.5));
      for (let k = 0; k < stripes; k++) {
        const g = new THREE.BoxGeometry(aw / stripes, 0.05, 1.5).rotateX(0.34);
        g.translate(-aw / 2 + (aw * (k + 0.5)) / stripes, 2.62, WALL / 2 + 0.68);
        P.trim.push(colored(g, k % 2 ? b.awning : 0xeeeae0));
      }
      P.trim.push(colored(lbox(aw, 0.2, 0.04, 0, 2.34, WALL / 2 + 1.38), b.awning));
    }
  }

  const m = matrixOf(fr);
  const low = new THREE.Group(), high = new THREE.Group();
  group.add(low, high);
  const addWall = (to: THREE.Group, wall: Geo[], lin: Geo[]) => {
    const wg = merged(wall, m), lg = merged(lin, m);
    if (wg && lg) {
      const both = mergeGeometries([wg, lg], true);
      if (both) {
        both.userData.ownGeo = true;
        to.add(mesh(both, [wallMat, M.interior])!);
      }
    }
  };
  addWall(low, wallLow, linLow);
  addWall(high, wallHigh, linHigh);
  // Zubehör: was ganz im unteren Drittel liegt (Stufe, Fensterbank), bleibt; der Rest gehört zum oberen Teil
  const maxY = (g: Geo) => (g.boundingBox ?? (g.computeBoundingBox(), g.boundingBox))!.max.y;
  const trimLow = P.trim.filter((g) => maxY(g) <= LOW_H + 0.02), trimHigh = P.trim.filter((g) => maxY(g) > LOW_H + 0.02);
  for (const mm of [mesh(merged(trimLow, m), M.trim)]) if (mm) low.add(mm);
  for (const mm of [
    mesh(merged(trimHigh, m), M.trim),
    mesh(merged(P.glass, m), M.windowGlass, false),
    mesh(merged(P.lit, m), M.litWindow, false),
  ]) if (mm) high.add(mm);

  // Geschäftsschild über Tür und Schaufenstern
  if (f === 0 && s === b.door && b.shopName) {
    const sw = Math.min(fr.len - 1.2, 4.8);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(sw, 0.44),
      M.sign(`shop:${b.shopName}|${b.signColor.toString(16).padStart(6, '0')}`),
    );
    sign.userData.ownGeo = true;
    sign.position.set(fr.cx + fr.nx * (WALL / 2 + 0.06), 2.78, fr.cz + fr.nz * (WALL / 2 + 0.06));
    sign.rotation.y = Math.atan2(fr.nx, fr.nz);
    high.add(sign);
  }
  return { group, low, high, nx: fr.nx, nz: fr.nz, cut: 0 };
}

export function buildFacade(b: BuildingSpec, index: number): Facade {
  const M = mats();
  const wallMat = M.wallStyle(b.style, b.color);
  const rand = (k: number) => rng(((Math.floor(b.x * 131) ^ Math.floor(b.z * 71)) + index * 977 + k * 31337) >>> 0);
  const floorSides = (f: number) => [0, 1, 2, 3].map((s) => buildSide(b, s, f, rand, wallMat));
  const sides = floorSides(0);

  // --- Obere Stockwerke aus der Ferne: geschlossene Hülle mit aufgesetzten Fenstern -------------------
  const tower = new THREE.Group();
  if (b.floors > 1) {
    const hh = b.h - FLOOR_H;
    const shell = new THREE.Mesh(makeBox(b.w, hh, b.d, b.style === 'wood' ? 2.4 : 4, 3), wallMat);
    shell.userData.ownGeo = true;
    shell.position.set(b.x, FLOOR_H + hh / 2, b.z);
    shell.castShadow = shell.receiveShadow = true;
    tower.add(shell);

    const P: Parts = { glass: [], trim: [], lit: [] };
    const perSide: Parts[] = [0, 1, 2, 3].map(() => ({ glass: [], trim: [], lit: [] }));
    b.windows.forEach((w, i) => {
      if (w.floor === 0) return;
      windowParts(perSide[w.side], w, true, rand(500 + i), b.trim);
    });
    const partsOut: [Geo | null, Geo | null, Geo | null][] = [];
    for (let s = 0; s < 4; s++) {
      const m = matrixOf(sideFrame(b, s));
      partsOut.push([merged(perSide[s].trim, m), merged(perSide[s].glass, m), merged(perSide[s].lit, m)]);
    }
    trimBand(P, b, FLOOR_H, 0.22, 0.1);
    trimBand(P, b, b.h - 0.12, 0.24, 0.12);
    const trimAll = merged([...(partsOut.map((p) => p[0]).filter(Boolean) as Geo[]), ...P.trim], null);
    const glassAll = merged(partsOut.map((p) => p[1]).filter(Boolean) as Geo[], null);
    const litAll = merged(partsOut.map((p) => p[2]).filter(Boolean) as Geo[], null);
    for (const mm of [mesh(trimAll, M.trim), mesh(glassAll, M.towerGlass, false), mesh(litAll, M.litWindow, false)]) if (mm) tower.add(mm);
  }
  return { sides, tower, roof: new THREE.Group(), floorSides };
}
