/**
 * Detaillierte 3D-Modelle der PZ-Waffen für die Hand der Spielfigur.
 *
 * Gleiche Konvention wie `TOOL_BUILD` in render/Character.ts: +y läuft am Griff entlang nach oben (die Faust sitzt bei y ≈ 0),
 * +z ist die Schneide bzw. Schlagfläche. Der Halter wird um `tilt` gekippt, damit das Teil schräg nach vorn-oben zeigt.
 * Schusswaffen: Lauf entlang +y, Oberseite −z, Griff hängt nach +z, Schaft liegt hinter der Hand (−y).
 *
 * Einbinden: in render/Character.ts `TOOL_BUILD` exportieren und einmalig `Object.assign(TOOL_BUILD, PZ_TOOL_BUILD)` aufrufen
 * (oder `PZ_TOOL_BUILD[outfit.hand]` vor dem Nachschlagen in TOOL_BUILD prüfen).
 */
import * as THREE from 'three';

/* ------------------------------------------------------------ Materialien */

const cache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, rough: number, metal: number): THREE.MeshStandardMaterial {
  const k = `${color}|${rough}|${metal}`;
  let m = cache.get(k);
  if (!m) cache.set(k, (m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })));
  return m;
}
const metal = (c: number): THREE.Material => mat(c, 0.32, 0.85);
const matte = (c: number): THREE.Material => mat(c, 0.82, 0.04);
const gloss = (c: number): THREE.Material => mat(c, 0.35, 0.1);
const glass = (c: number): THREE.Material => {
  const k = `glass${c}`;
  let m = cache.get(k);
  if (!m) cache.set(k, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.55 })));
  return m;
};

const STEEL = 0xc2c8d0, STEEL_MID = 0x8b8f97, STEEL_DARK = 0x4a4e56, GUNMETAL = 0x2d3036, BLACK = 0x17181c;
const WOOD = 0xb98a52, WOOD_MID = 0x8a5e34, WOOD_DARK = 0x5a3a1c, GRIP = 0x1c1c20, BRASS = 0xc8a02a, LEATHER = 0x4a2e1a, ROPE = 0xc8b27a;

/* --------------------------------------------------------------- Bausteine */

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}
function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.castShadow = true;
  o.receiveShadow = true;
  return at(o, x, y, z, rx, ry, rz);
}
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, rx, ry, rz);
/** Zylinder entlang y (r0 unten, r1 oben) */
const cyl = (r0: number, r1: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 12): THREE.Mesh => mesh(new THREE.CylinderGeometry(r1, r0, len, seg), m, x, y, z, rx, ry, rz);
/** Zylinder entlang z (r0 hinten, r1 vorn) */
const sph = (r: number, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1): THREE.Mesh => {
  const o = mesh(new THREE.SphereGeometry(r, 12, 9), m, x, y, z);
  o.scale.set(sx, sy, sz);
  return o;
};
const ring = (r: number, tube: number, m: THREE.Material, x = 0, y = 0, z = 0, rx = Math.PI / 2): THREE.Mesh => mesh(new THREE.TorusGeometry(r, tube, 6, 14), m, x, y, z, rx);

/** Flaches Profil in der (z,y)-Ebene, in x-Richtung `thick` dick und mittig. Schneide/Front = +z. */
function extr(pts: [number, number][], thick: number, m: THREE.Material, bevel = 0.35): THREE.Mesh {
  const s = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const b = thick * bevel;
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0005, thick - 2 * b), bevelEnabled: true, bevelSize: b * 0.8, bevelThickness: b, bevelSegments: 1, curveSegments: 6 });
  geo.rotateY(-Math.PI / 2); // Profil-x → +z, Extrusion → −x
  geo.translate(thick / 2 - b, 0, 0);
  return mesh(geo, m);
}

/** Drehkörper um die y-Achse aus (radius, y)-Punkten */
function lathe(pts: [number, number][], m: THREE.Material, seg = 14): THREE.Mesh {
  return mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), m);
}

/**
 * Kippung für Schusswaffen: bei ausgestrecktem Arm (siehe animateCharacter, handKind 'gun') zeigt der Lauf waagerecht nach vorn,
 * die Visierseite (−z im Modell) nach oben.
 */
const GUN_TILT = 2.95;
/** Einhändige Waffen: Griff in die Handfläche (die Handfläche liegt bei gestrecktem Arm über dem Halter-Ursprung) */
const PISTOL_DZ = 0.16;
const PISTOL_DY = -0.05;

/** Halter: gekippt, damit das Teil schräg nach vorn-oben zeigt */
function held(parts: THREE.Object3D[], tilt = 1.62, dy = -0.02, dz = 0.04): THREE.Object3D[] {
  const g = new THREE.Group();
  g.rotation.x = tilt;
  g.position.set(0, dy, dz);
  g.add(...parts);
  return [g];
}

/** Umwicklung (Leder/Seil) in Ringen */
function wraps(y0: number, y1: number, r: number, m: THREE.Material, step = 0.016): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  for (let y = y0; y <= y1; y += step) out.push(ring(r, 0.0035, m, 0, y, 0));
  return out;
}

/* ------------------------------------------------------------- Klingenwaffen */

interface BladeSpec {
  /** Klingenlänge, Breite (Schneide↔Rücken), Dicke, Krümmung der Spitze zum Rücken */
  bl: number; bw: number; bt: number; cur?: number; tip?: number;
  /** Griff: Länge, Radius, Farbe, Wicklung, Knauf */
  hl: number; hr: number; hc: number; wrap?: boolean; pommel?: number;
  /** Parierstange: Radius/Breite, Farbe, Art */
  g?: [number, number, 'cross' | 'disc' | 'bar'];
  steel?: number; fuller?: boolean; spine?: boolean;
}
const BLADES: Record<string, BladeSpec> = {
  pz_katana: { bl: 0.7, bw: 0.034, bt: 0.007, cur: 0.045, tip: 0.04, hl: 0.27, hr: 0.016, hc: 0x1c1a22, wrap: true, g: [0.036, BRASS, 'disc'], pommel: BRASS, fuller: true, spine: true },
  pz_sword: { bl: 0.62, bw: 0.054, bt: 0.008, tip: 0.05, hl: 0.2, hr: 0.016, hc: 0x4a2e1a, wrap: true, g: [0.09, BRASS, 'cross'], pommel: BRASS, fuller: true },
  pz_shortsword: { bl: 0.4, bw: 0.046, bt: 0.008, tip: 0.04, hl: 0.16, hr: 0.015, hc: 0x4a2e1a, wrap: true, g: [0.07, BRASS, 'cross'], pommel: BRASS, fuller: true },
  pz_crude_sword: { bl: 0.58, bw: 0.05, bt: 0.009, tip: 0.035, hl: 0.2, hr: 0.016, hc: 0x5a3a22, wrap: true, g: [0.06, STEEL_DARK, 'bar'], pommel: STEEL_DARK, steel: STEEL_MID },
  pz_crude_shortsword: { bl: 0.38, bw: 0.044, bt: 0.009, tip: 0.03, hl: 0.17, hr: 0.016, hc: 0x5a3a22, wrap: true, g: [0.055, STEEL_DARK, 'bar'], steel: STEEL_MID },
  pz_handguard_dagger: { bl: 0.3, bw: 0.036, bt: 0.007, tip: 0.04, hl: 0.14, hr: 0.013, hc: 0x2a1e16, wrap: true, g: [0.06, BRASS, 'cross'], pommel: BRASS, fuller: true },
  pz_fighting_knife: { bl: 0.2, bw: 0.034, bt: 0.006, tip: 0.04, hl: 0.13, hr: 0.015, hc: GRIP, wrap: true, g: [0.035, STEEL_DARK, 'bar'], steel: STEEL_MID, spine: true },
  pz_hunting_knife: { bl: 0.18, bw: 0.036, bt: 0.006, cur: 0.01, tip: 0.04, hl: 0.12, hr: 0.016, hc: 0x6a4426, g: [0.034, BRASS, 'bar'], pommel: BRASS, spine: true },
  pz_railroad_spike_knife: { bl: 0.2, bw: 0.016, bt: 0.012, tip: 0.04, hl: 0.12, hr: 0.014, hc: 0x3a2e22, wrap: true, g: [0.025, STEEL_DARK, 'bar'], steel: STEEL_DARK },
  pz_pocket_knife: { bl: 0.075, bw: 0.016, bt: 0.003, tip: 0.015, hl: 0.095, hr: 0.011, hc: 0xa02820, g: [0.016, STEEL, 'bar'], spine: true },
  pz_small_knife: { bl: 0.09, bw: 0.018, bt: 0.003, tip: 0.018, hl: 0.09, hr: 0.011, hc: 0x3a2e22, g: [0.018, STEEL_MID, 'bar'], spine: true },
  pz_large_knife: { bl: 0.2, bw: 0.04, bt: 0.004, tip: 0.04, hl: 0.12, hr: 0.015, hc: GRIP, wrap: true, g: [0.03, STEEL_MID, 'bar'], spine: true },
  pz_machete_knife: { bl: 0.3, bw: 0.05, bt: 0.004, cur: 0.015, tip: 0.04, hl: 0.14, hr: 0.016, hc: 0x2a2420, wrap: true, g: [0.03, STEEL_DARK, 'bar'], pommel: STEEL_DARK, spine: true },
  pz_butterfly_knife: { bl: 0.1, bw: 0.019, bt: 0.003, tip: 0.02, hl: 0.11, hr: 0.012, hc: STEEL, g: [0.012, STEEL_MID, 'bar'], spine: true },
  pz_switchblade: { bl: 0.09, bw: 0.019, bt: 0.003, tip: 0.02, hl: 0.11, hr: 0.012, hc: 0x2a2a30, g: [0.014, STEEL, 'bar'], spine: true },
};

function bladeModel(s: BladeSpec): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [];
  const steel = metal(s.steel ?? STEEL);
  const y0 = -0.1;
  const gy = y0 + s.hl; // Parierstange
  // Griff
  parts.push(cyl(s.hr * 0.9, s.hr, s.hl, matte(s.hc), 0, y0 + s.hl / 2, 0));
  if (s.wrap) parts.push(...wraps(y0 + 0.012, gy - 0.008, s.hr + 0.001, matte(0x0a0a0c), 0.017));
  if (s.pommel !== undefined) parts.push(sph(s.hr * 1.4, metal(s.pommel), 0, y0 - 0.004, 0));
  // Parierstange
  if (s.g) {
    const [gw, gc, kind] = s.g;
    if (kind === 'disc') parts.push(cyl(gw, gw, 0.008, metal(gc), 0, gy + 0.004, 0));
    else if (kind === 'bar') parts.push(box(s.bt + 0.012, 0.012, gw * 2, metal(gc), 0, gy + 0.005, 0));
    else {
      parts.push(box(s.bt + 0.012, 0.014, gw * 2, metal(gc), 0, gy + 0.006, 0));
      parts.push(sph(0.011, metal(gc), 0, gy + 0.006, gw), sph(0.011, metal(gc), 0, gy + 0.006, -gw));
    }
  }
  // Klinge als Profil
  const N = 8;
  const cur = s.cur ?? 0;
  const off = (i: number): number => -cur * Math.pow(i / N, 2);
  const spineP: [number, number][] = [];
  const edgeP: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const y = gy + (s.bl * i) / N;
    spineP.push([-s.bw / 2 + off(i), y]);
    edgeP.push([s.bw / 2 + off(i), y]);
  }
  const tip: [number, number] = [off(N), gy + s.bl + (s.tip ?? s.bw)];
  parts.push(extr([...spineP, tip, ...edgeP.reverse()], s.bt, steel));
  if (s.spine) parts.push(extr([[-s.bw / 2 - 0.0005, gy], ...spineP.slice(1).map(([z, y]) => [z - 0.0005, y] as [number, number]), [spineP[N][0] + s.bw * 0.22, gy + s.bl * 0.96], [-s.bw * 0.28, gy]], s.bt * 1.25, metal(STEEL_MID), 0.2));
  if (s.fuller) {
    for (const sx of [-1, 1]) parts.push(box(0.0012, s.bl * 0.72, s.bw * 0.16, metal(STEEL_DARK), sx * (s.bt / 2 + 0.0004), gy + s.bl * 0.42, 0));
  }
  if (s.steel === undefined) parts.push(box(s.bt + 0.001, s.bl * 0.9, 0.003, metal(0xf4f6f8), 0, gy + s.bl * 0.5, s.bw / 2 - 0.001)); // Schneidenglanz
  return parts;
}

/* ------------------------------------------------------------ Äxte, Hacken */

function axeModel(v: string): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [];
  const long = v === 'wood_axe' ? 0.9 : v === 'pickaxe' ? 0.85 : v === 'scythe' ? 1.25 : v === 'ice_axe' ? 0.52 : 0.38;
  const yh = long - 0.1;
  parts.push(cyl(0.017, 0.021, long + 0.02, matte(WOOD), 0, long / 2 - 0.08, 0)); // Stiel
  parts.push(cyl(0.0225, 0.0225, 0.2, matte(GRIP), 0, 0.0, 0)); // Griffband
  parts.push(...wraps(-0.1, 0.09, 0.0235, matte(0x0a0a0c), 0.02));
  parts.push(sph(0.026, matte(WOOD_DARK), 0, -0.105, 0, 1, 0.6, 1));
  const eye = (): void => { parts.push(box(0.05, 0.1, 0.06, metal(STEEL_DARK), 0, yh, 0)); };
  if (v === 'hatchet' || v === 'hand_axe' || v === 'wood_axe') {
    const k = v === 'wood_axe' ? 1.4 : 1;
    eye();
    parts.push(extr([[0.025, yh - 0.04], [0.085 * k, yh - 0.075 * k], [0.14 * k, yh - 0.115 * k], [0.15 * k, yh], [0.14 * k, yh + 0.115 * k], [0.085 * k, yh + 0.075 * k], [0.025, yh + 0.04]], 0.026, metal(STEEL)));
    parts.push(box(0.01, 0.2 * k, 0.012, metal(0xf4f6f8), 0, yh, 0.148 * k)); // Schneide
    parts.push(box(0.046, 0.075, 0.05, metal(STEEL_DARK), 0, yh, -0.05)); // Nacken
  } else if (v === 'pickaxe') {
    eye();
    for (const s of [1, -1]) {
      parts.push(mesh(new THREE.CylinderGeometry(0.004, 0.02, 0.22, 8), metal(STEEL), 0, yh - 0.012, s * 0.15, s * Math.PI / 2 + s * 0.28, 0, 0));
      parts.push(mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.07, 8), metal(STEEL_DARK), 0, yh, s * 0.045, s * Math.PI / 2, 0, 0));
    }
  } else if (v === 'ice_axe') {
    eye();
    parts.push(mesh(new THREE.CylinderGeometry(0.003, 0.016, 0.16, 8), metal(STEEL), 0, yh - 0.012, 0.1, Math.PI / 2 + 0.3, 0, 0));
    parts.push(extr([[-0.03, yh - 0.02], [-0.1, yh - 0.04], [-0.105, yh + 0.04], [-0.03, yh + 0.035]], 0.012, metal(STEEL)));
    parts.push(cyl(0.004, 0.012, 0.06, metal(STEEL_DARK), 0, -0.14, 0)); // Spitze unten
  } else {
    // Sense: sichelförmiges Blatt nach vorn
    const pts: [number, number][] = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([0.02 + t * 0.62, yh + 0.02 + Math.sin(t * 1.6) * 0.06 - t * t * 0.1]); }
    const back = pts.map(([z, y]) => [z, y - 0.045 * (1 - (z - 0.02) / 0.62)] as [number, number]).reverse();
    parts.push(extr([...pts, ...back], 0.005, metal(STEEL)));
    parts.push(box(0.03, 0.07, 0.07, metal(STEEL_DARK), 0, yh, 0));
    parts.push(box(0.03, 0.14, 0.015, matte(WOOD_DARK), 0, 0.35, 0.03)); // Zweiter Griff
  }
  return parts;
}

/* ------------------------------------------------------------ Keulen, Hämmer */

function batProfile(len: number, rMax: number): [number, number][] {
  const out: [number, number][] = [[0, -0.11]];
  for (let i = 0; i <= 10; i++) { const t = i / 10; out.push([0.014 + (rMax - 0.014) * Math.pow(t, 1.8), -0.1 + len * t]); }
  out.push([rMax * 0.85, -0.1 + len + 0.012], [rMax * 0.4, -0.1 + len + 0.02], [0, -0.1 + len + 0.022]);
  return out;
}
const cone = (r: number, len: number, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Mesh => mesh(new THREE.ConeGeometry(r, len, 6), m, x, y, z, rx, ry, rz);

function clubModel(v: string): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [];
  if (v === 'nightstick') {
    parts.push(cyl(0.017, 0.017, 0.58, gloss(0x15161a), 0, 0.2, 0));
    parts.push(cyl(0.02, 0.02, 0.2, matte(GRIP), 0, -0.01, 0));
    parts.push(...wraps(-0.1, 0.09, 0.0205, matte(0x050506), 0.018));
    parts.push(sph(0.019, gloss(0x15161a), 0, -0.115, 0));
    parts.push(sph(0.017, gloss(0x15161a), 0, 0.49, 0));
    parts.push(cyl(0.011, 0.011, 0.14, matte(GRIP), 0, 0.09, -0.08, 0, 0, Math.PI / 2)); // Seitengriff
    parts.push(cyl(0.02, 0.02, 0.012, metal(STEEL_DARK), 0, 0.11, 0));
    return parts;
  }
  if (v === 'fire_poker') {
    parts.push(cyl(0.008, 0.008, 0.7, metal(STEEL_DARK), 0, 0.25, 0));
    parts.push(ring(0.028, 0.0065, metal(STEEL_DARK), 0, -0.13, 0, 0));
    parts.push(cone(0.016, 0.07, metal(STEEL_DARK), 0, 0.64, 0, 0, 0, 0));
    parts.push(mesh(new THREE.TorusGeometry(0.035, 0.0065, 6, 10, Math.PI * 1.2), metal(STEEL_DARK), 0, 0.6, 0.036, 0, 0, 0));
    return parts;
  }
  if (v === 'mace' || v === 'mace_stone' || v === 'long_mace') {
    const len = v === 'long_mace' ? 1.05 : 0.8;
    parts.push(cyl(0.018, 0.022, len, matte(v === 'mace' ? WOOD_MID : WOOD), 0, len / 2 - 0.1, 0));
    parts.push(...wraps(-0.1, 0.12, 0.0235, matte(LEATHER), 0.02));
    const yh = len - 0.1;
    if (v === 'mace_stone') {
      const rock = mesh(new THREE.IcosahedronGeometry(0.075, 0), matte(0x8d877a), 0, yh + 0.05, 0);
      rock.scale.set(0.8, 1.15, 0.95);
      parts.push(rock);
      parts.push(...wraps(yh - 0.03, yh + 0.02, 0.03, matte(ROPE), 0.012));
    } else {
      parts.push(sph(0.058, metal(STEEL_MID), 0, yh + 0.05, 0, 1, 1.1, 1));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        parts.push(box(0.012, 0.09, 0.06, metal(STEEL), Math.cos(a) * 0.058, yh + 0.05, Math.sin(a) * 0.058, 0, -a, 0));
      }
      parts.push(cone(0.022, 0.06, metal(STEEL), 0, yh + 0.13, 0));
    }
    return parts;
  }
  if (v === 'long_spiked_club') {
    parts.push(lathe(batProfile(1.0, 0.07), matte(WOOD_MID)));
    parts.push(...wraps(-0.1, 0.1, 0.0235, matte(GRIP), 0.02));
    for (let i = 0; i < 14; i++) {
      const y = 0.45 + (i % 7) * 0.08;
      const a = i * 2.4;
      parts.push(cone(0.007, 0.05, metal(STEEL), Math.cos(a) * 0.06, y, Math.sin(a) * 0.06, Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4));
    }
    return parts;
  }
  const short = v.includes('short');
  const len = short ? 0.5 : 0.86;
  parts.push(lathe(batProfile(len, short ? 0.036 : 0.044), matte(0xd4a666)));
  parts.push(cyl(0.024, 0.024, 0.2, matte(GRIP), 0, -0.01, 0));
  parts.push(...wraps(-0.1, 0.09, 0.0245, matte(0x050506), 0.02));
  parts.push(sph(0.027, matte(WOOD_DARK), 0, -0.115, 0, 1, 0.6, 1));
  if (v === 'spiked_short_bat') for (let i = 0; i < 8; i++) { const a = i * 2.2; parts.push(cone(0.006, 0.035, metal(STEEL), Math.cos(a) * 0.035, 0.22 + i * 0.03, Math.sin(a) * 0.035, Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4)); }
  return parts;
}

function hammerModel(v: string): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [];
  const big = v === 'club_hammer' || v === 'smithing_hammer';
  const len = v === 'gavel' ? 0.26 : big ? 0.42 : 0.38;
  const yh = len - 0.08;
  parts.push(cyl(0.015, 0.019, len + 0.04, matte(v === 'wooden_mallet' ? 0xd4a666 : WOOD), 0, len / 2 - 0.1, 0));
  parts.push(cyl(0.021, 0.021, 0.14, matte(GRIP), 0, -0.04, 0));
  parts.push(...wraps(-0.1, 0.03, 0.0215, matte(0x050506), 0.02));
  if (v === 'wooden_mallet') {
    parts.push(cyl(0.04, 0.04, 0.13, matte(0xd4a666), 0, yh + 0.01, 0, 0, 0, Math.PI / 2));
    parts.push(ring(0.041, 0.004, metal(STEEL_DARK), -0.05, yh + 0.01, 0, Math.PI / 2));
  } else if (v === 'stone_hammer') {
    const rock = mesh(new THREE.IcosahedronGeometry(0.06, 0), matte(0x8d877a), 0, yh, 0);
    rock.scale.set(0.9, 0.8, 1.35);
    parts.push(rock);
    parts.push(...wraps(yh - 0.04, yh + 0.04, 0.026, matte(ROPE), 0.014));
  } else if (v === 'gavel') {
    parts.push(cyl(0.032, 0.032, 0.11, matte(0xa8723a), 0, yh, 0, 0, 0, Math.PI / 2));
    parts.push(cyl(0.034, 0.034, 0.012, metal(BRASS), -0.045, yh, 0, 0, 0, Math.PI / 2), cyl(0.034, 0.034, 0.012, metal(BRASS), 0.045, yh, 0, 0, 0, Math.PI / 2));
  } else if (v === 'claw_hammer') {
    parts.push(box(0.04, 0.045, 0.14, metal(STEEL_MID), 0, yh, 0.0));
    parts.push(cyl(0.026, 0.024, 0.028, metal(STEEL), 0, yh, 0.08, Math.PI / 2));
    for (const sx of [-0.009, 0.009]) parts.push(box(0.012, 0.03, 0.1, metal(STEEL), sx, yh - 0.01, -0.09, -0.4)); // Klaue
    parts.push(box(0.044, 0.02, 0.04, metal(STEEL_DARK), 0, yh - 0.03, 0));
  } else {
    const w = big ? 0.2 : 0.16;
    parts.push(box(0.06, 0.07, w, metal(STEEL_MID), 0, yh, 0));
    parts.push(cyl(0.036, 0.034, 0.03, metal(STEEL), 0, yh, w / 2 + 0.014, Math.PI / 2), cyl(0.036, 0.034, 0.03, metal(STEEL), 0, yh, -w / 2 - 0.014, Math.PI / 2));
    parts.push(box(0.064, 0.016, w * 0.96, metal(STEEL_DARK), 0, yh - 0.04, 0));
  }
  return parts;
}

function spearModel(long: boolean): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [];
  const len = long ? 1.25 : 1.0;
  parts.push(cyl(0.014, 0.017, len, matte(WOOD_MID), 0, len / 2 - 0.2, 0));
  parts.push(cyl(0.019, 0.019, 0.2, matte(GRIP), 0, 0, 0));
  parts.push(...wraps(-0.1, 0.1, 0.0195, matte(0x050506), 0.02));
  const ty = len - 0.2;
  parts.push(...wraps(ty - 0.05, ty + 0.01, 0.0185, matte(ROPE), 0.014));
  const hl = long ? 0.3 : 0.2;
  parts.push(extr([[0, ty], [0.03, ty + hl * 0.35], [0.026, ty + hl * 0.65], [0, ty + hl], [-0.026, ty + hl * 0.65], [-0.03, ty + hl * 0.35]], 0.008, metal(STEEL)));
  parts.push(box(0.003, hl * 0.7, 0.008, metal(STEEL_DARK), 0, ty + hl * 0.45, 0, 0, 0, 0));
  parts.push(cone(0.012, 0.04, metal(STEEL_DARK), 0, -0.22, 0, Math.PI));
  return parts;
}

function toolModel(v: string): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [];
  if (v === 'pipe_wrench' || v === 'wrench') {
    const red = v === 'pipe_wrench';
    const c = red ? 0xc8352a : 0xb4bac2;
    const len = red ? 0.46 : 0.28;
    parts.push(box(0.022, len, 0.04, metal(c), 0, len / 2 - 0.1, 0));
    parts.push(box(0.026, 0.1, 0.045, matte(GRIP), 0, -0.04, 0));
    const yh = len - 0.1;
    if (red) {
      parts.push(extr([[-0.03, yh - 0.03], [-0.05, yh + 0.06], [0.0, yh + 0.1], [0.05, yh + 0.07], [0.07, yh + 0.02], [0.02, yh + 0.01], [0.02, yh - 0.03]], 0.026, metal(c)));
      parts.push(box(0.02, 0.07, 0.025, metal(STEEL_MID), 0, yh + 0.03, 0.035)); // bewegliche Backe
      parts.push(cyl(0.02, 0.02, 0.03, metal(STEEL_DARK), 0, yh - 0.035, 0.03, 0, 0, Math.PI / 2));
    } else {
      parts.push(extr([[-0.032, yh - 0.01], [-0.045, yh + 0.07], [-0.014, yh + 0.1], [-0.01, yh + 0.045], [0.014, yh + 0.045], [0.014, yh + 0.1], [0.045, yh + 0.07], [0.032, yh - 0.01]], 0.018, metal(c)));
      parts.push(ring(0.02, 0.006, metal(c), 0, -0.1, 0, 0));
    }
    return parts;
  }
  if (v === 'bolt_cutters') {
    for (const s of [1, -1]) {
      parts.push(cyl(0.011, 0.011, 0.66, metal(0xc8352a), 0, 0.23, s * 0.03, 0, 0, 0));
      parts.push(cyl(0.015, 0.015, 0.2, matte(GRIP), 0, -0.01, s * 0.03));
    }
    parts.push(extr([[-0.06, 0.52], [-0.05, 0.64], [0.0, 0.68], [0.05, 0.64], [0.06, 0.52]], 0.03, metal(STEEL_MID)));
    parts.push(cyl(0.02, 0.02, 0.04, metal(STEEL_DARK), 0.0, 0.58, 0, 0, 0, Math.PI / 2));
    parts.push(extr([[0.0, 0.64], [0.03, 0.74], [0.0, 0.76]], 0.02, metal(STEEL)));
    parts.push(extr([[0.0, 0.64], [-0.03, 0.74], [0.0, 0.76]], 0.02, metal(STEEL)));
    return parts;
  }
  if (v === 'shovel') {
    parts.push(cyl(0.015, 0.017, 0.78, metal(STEEL_MID), 0, 0.3, 0));
    parts.push(cyl(0.02, 0.02, 0.16, matte(GRIP), 0, -0.04, 0));
    parts.push(mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), matte(GRIP), 0, -0.12, 0, 0, Math.PI / 2, 0));
    parts.push(extr([[-0.09, 0.66], [0.09, 0.66], [0.12, 0.88], [0.09, 1.0], [0.0, 1.06], [-0.09, 1.0], [-0.12, 0.88]], 0.006, metal(0x3a7ad0)));
    parts.push(box(0.02, 0.07, 0.04, metal(STEEL_DARK), 0, 0.68, 0));
    return parts;
  }
  // zerbrochene Flasche
  parts.push(cyl(0.035, 0.03, 0.2, glass(0x8ac8a8), 0, 0.0, 0));
  parts.push(cyl(0.03, 0.012, 0.08, glass(0x8ac8a8), 0, 0.14, 0));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    parts.push(cone(0.011, 0.06 + (i % 3) * 0.02, glass(0xb8e8d0), Math.cos(a) * 0.028, 0.14 + (i % 2) * 0.02, Math.sin(a) * 0.028, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3));
  }
  return parts;
}

/* ---------------------------------------------------------------- Schusswaffen */

function gunGrip(color: number, wood: boolean): THREE.Material { return wood ? matte(color) : mat(color, 0.9, 0); }

function pistolModel(v: string): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [];
  const big = v === 'pz_pistol_bf';
  const slideC = v === 'pz_pistol_m1911' ? 0x6a6e76 : big ? 0x8a8e96 : 0x2d3036;
  const L = big ? 0.27 : 0.22;
  // Griffstück
  parts.push(box(0.03, L - 0.03, 0.03, metal(0x2a2c31), 0, L / 2 - 0.1, 0.012));
  parts.push(box(0.032, 0.05, 0.115, v === 'pz_pistol_m1911' ? matte(0x8a5a30) : gunGrip(0x1c1c20, false), 0, -0.065, 0.075, 0.18)); // Griff (nach hinten geneigt)
  parts.push(box(0.034, 0.054, 0.012, metal(0x15161a), 0, -0.083, 0.134, 0.18)); // Magazinboden
  // Abzugsbügel + Abzug
  parts.push(mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 10, Math.PI), metal(0x2a2c31), 0, 0.03, 0.034, 0, Math.PI / 2, Math.PI));
  parts.push(box(0.006, 0.006, 0.02, metal(STEEL), 0, -0.01, 0.04));
  // Schlitten
  parts.push(box(0.03, L - 0.01, 0.034, metal(slideC), 0, L / 2 - 0.1, -0.02));
  for (let i = 0; i < 5; i++) parts.push(box(0.032, 0.0025, 0.036, metal(0x15161a), 0, -0.065 + i * 0.008, -0.02)); // Griffrillen am Schlitten
  parts.push(box(0.031, 0.05, 0.012, metal(0x0a0a0c), 0, 0.06, -0.026)); // Auswurffenster
  parts.push(cyl(0.008, 0.008, 0.012, metal(0x0a0a0c), 0, L - 0.095, -0.02)); // Mündung
  parts.push(box(0.006, 0.008, 0.01, metal(0x15161a), 0, L - 0.11, -0.042)); // Korn
  parts.push(box(0.016, 0.01, 0.01, metal(0x15161a), 0, -0.085, -0.042)); // Kimme
  if (v === 'pz_pistol_m1911') parts.push(box(0.006, 0.02, 0.016, metal(STEEL_DARK), 0, -0.1, -0.012, -0.5)); // Hahn
  if (v === 'pz_pistol_bf') parts.push(box(0.034, 0.012, 0.04, metal(0x15161a), 0, 0.09, -0.012)); // Schiene
  return held(parts, GUN_TILT, PISTOL_DY, PISTOL_DZ);
}

function revolverModel(v: string): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [];
  const L = v === 'pz_magnum' ? 0.26 : v === 'pz_revolver_short' ? 0.1 : 0.17;
  const c = v === 'pz_magnum' ? 0x2d3036 : v === 'pz_revolver_short' ? 0x7a7e86 : 0x4a4d54;
  parts.push(box(0.032, 0.1, 0.05, metal(c), 0, 0.0, -0.01)); // Rahmen
  parts.push(box(0.03, 0.07, 0.05, metal(c), 0, -0.04, 0.03)); // Rahmenhals
  parts.push(box(0.03, 0.05, 0.12, matte(0x8a5a30), 0, -0.058, 0.082, 0.3)); // Holzgriff
  parts.push(cyl(0.031, 0.031, 0.062, metal(c), 0, 0.06, -0.004, 0, 0, 0, 16)); // Trommel
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; parts.push(cyl(0.006, 0.006, 0.064, metal(0x0a0a0c), Math.cos(a) * 0.02, 0.06, -0.004 + Math.sin(a) * 0.02)); }
  parts.push(cyl(0.011, 0.011, L, metal(c), 0, 0.09 + L / 2, -0.02)); // Lauf
  parts.push(box(0.01, L * 0.9, 0.008, metal(c), 0, 0.1 + L / 2, -0.034)); // Laufschiene
  parts.push(box(0.006, 0.01, 0.012, metal(0x15161a), 0, 0.09 + L, -0.04)); // Korn
  parts.push(box(0.01, 0.016, 0.02, metal(STEEL_DARK), 0, -0.04, -0.04, -0.6)); // Hahn
  parts.push(mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 10, Math.PI), metal(c), 0, 0.03, 0.04, 0, Math.PI / 2, Math.PI));
  return held(parts, GUN_TILT, PISTOL_DY, PISTOL_DZ);
}

function shotgunModel(v: string): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [];
  const tactical = v === 'pz_shotgun_tactical';
  const dbl = v.includes('double');
  const sawn = v.includes('sawnoff');
  const woodC = tactical ? 0x1c1d20 : WOOD_MID;
  const wood = tactical ? mat(0x1c1d20, 0.85, 0.05) : matte(woodC);
  const bl = sawn ? 0.3 : 0.62; // Lauflänge
  // Schaft (hinter der Hand)
  if (sawn) {
    parts.push(box(0.04, 0.16, 0.05, wood, 0, -0.07, 0.07, 0.35));
  } else {
    parts.push(box(0.045, 0.38, 0.07, wood, 0, -0.27, 0.025, 0.08));
    parts.push(box(0.05, 0.04, 0.1, mat(0x2a2a2e, 0.9, 0), 0, -0.465, 0.04, 0.08)); // Schaftkappe
    parts.push(box(0.05, 0.05, 0.1, wood, 0, -0.075, 0.07, 0.3)); // Pistolengriff
  }
  // Gehäuse
  parts.push(box(0.04, 0.2, 0.06, metal(GUNMETAL), 0, 0.0, -0.01));
  parts.push(box(0.042, 0.06, 0.012, metal(0x0a0a0c), 0, 0.03, -0.034)); // Auswurf
  // Läufe
  if (dbl) {
    for (const sx of [-0.012, 0.012]) parts.push(cyl(0.012, 0.012, bl, metal(0x2a2c31), sx, 0.1 + bl / 2, -0.026));
    parts.push(box(0.012, bl, 0.01, metal(GUNMETAL), 0, 0.1 + bl / 2, -0.04)); // Schiene
    if (!sawn) parts.push(box(0.045, 0.2, 0.04, wood, 0, 0.2, 0.005)); // Vorderschaft
  } else {
    parts.push(cyl(0.013, 0.013, bl, metal(0x2a2c31), 0, 0.1 + bl / 2, -0.026));
    if (!sawn) {
      parts.push(cyl(0.011, 0.011, bl * 0.8, metal(0x3a3d44), 0, 0.1 + bl * 0.4, 0.002)); // Magazinrohr
      parts.push(box(0.044, 0.2, 0.04, wood, 0, 0.26, 0.0)); // Pumpgriff
      for (let i = 0; i < 7; i++) parts.push(box(0.046, 0.004, 0.042, mat(0x050506, 0.9, 0), 0, 0.17 + i * 0.026, 0.0));
    }
    if (tactical) parts.push(box(0.028, 0.3, 0.012, metal(0x3a3d44), 0, 0.28, -0.046)); // Hitzeschild
  }
  parts.push(sph(0.007, metal(0xf0e8d0), 0, 0.1 + bl, -0.04)); // Korn
  parts.push(mesh(new THREE.TorusGeometry(0.026, 0.004, 6, 10, Math.PI), metal(GUNMETAL), 0, -0.05, 0.024, 0, Math.PI / 2, Math.PI)); // Abzugsbügel
  return held(parts, GUN_TILT, 0, 0.03);
}

interface RifleSpec { stock: 'wood' | 'black' | 'm16'; bl: number; scope?: number; mag?: 'box' | 'curved'; lever?: boolean; bolt?: boolean; carry?: boolean; tube?: boolean; guard?: boolean; rail?: boolean }
const RIFLES: Record<string, RifleSpec> = {
  pz_rifle_m16: { stock: 'm16', bl: 0.5, mag: 'curved', carry: true, guard: true },
  pz_rifle_m1a: { stock: 'wood', bl: 0.56, mag: 'box', guard: true },
  pz_rifle_js14: { stock: 'wood', bl: 0.54, mag: 'box', guard: true, scope: 0.2 },
  pz_carbine_l92: { stock: 'wood', bl: 0.42, lever: true, tube: true },
  pz_rifle_l94: { stock: 'wood', bl: 0.56, lever: true, tube: true },
  pz_rifle_varmint: { stock: 'wood', bl: 0.6, bolt: true, scope: 0.22 },
  pz_rifle_hunting: { stock: 'wood', bl: 0.62, bolt: true, scope: 0.3 },
  pz_rifle_msr7t: { stock: 'black', bl: 0.62, bolt: true, scope: 0.32, guard: true, rail: true },
  pz_carbine_trapper: { stock: 'wood', bl: 0.38, lever: true, tube: true },
};

function rifleModel(id: string): THREE.Object3D[] {
  const s = RIFLES[id];
  const parts: THREE.Object3D[] = [];
  const wood = s.stock === 'wood' ? matte(WOOD_MID) : mat(0x1f2024, 0.8, 0.1);
  const dark = metal(0x2d3036);
  // Schaft
  if (s.stock === 'm16') {
    parts.push(cyl(0.017, 0.017, 0.2, dark, 0, -0.13, -0.002, 0, 0, 0, 10)); // Pufferrohr
    parts.push(box(0.04, 0.2, 0.06, wood, 0, -0.34, 0.01, 0.06));
    parts.push(box(0.044, 0.03, 0.09, mat(0x111113, 0.9, 0), 0, -0.45, 0.02, 0.06));
  } else {
    parts.push(box(0.042, 0.34, 0.062, wood, 0, -0.25, 0.02, 0.07));
    parts.push(box(0.046, 0.035, 0.1, mat(0x111113, 0.9, 0), 0, -0.425, 0.035, 0.07));
    parts.push(box(0.044, 0.05, 0.1, wood, 0, -0.07, 0.065, 0.3)); // Griffstück
  }
  // Gehäuse
  parts.push(box(0.04, 0.2, 0.055, dark, 0, 0.0, -0.012));
  parts.push(box(0.042, 0.06, 0.01, metal(0x0a0a0c), 0, 0.03, -0.036)); // Auswurf
  // Lauf + Handschutz
  parts.push(cyl(0.011, 0.011, s.bl, metal(0x34373d), 0, 0.1 + s.bl / 2, -0.02));
  parts.push(cyl(0.016, 0.016, 0.018, metal(0x15161a), 0, 0.1 + s.bl, -0.02)); // Mündungsbremse
  if (s.guard) parts.push(box(0.044, Math.min(0.3, s.bl * 0.6), 0.05, s.stock === 'wood' ? wood : mat(0x1f2024, 0.8, 0.1), 0, 0.2 + Math.min(0.3, s.bl * 0.6) / 2 - 0.05, -0.008));
  if (s.tube) parts.push(cyl(0.01, 0.01, s.bl * 0.8, metal(0x3a3d44), 0, 0.1 + s.bl * 0.4, 0.014));
  if (s.rail) parts.push(box(0.02, 0.32, 0.01, metal(0x15161a), 0, 0.13, -0.05));
  // Visierung
  parts.push(box(0.006, 0.012, 0.016, metal(0x15161a), 0, 0.1 + s.bl - 0.03, -0.04));
  if (s.carry) { parts.push(box(0.02, 0.2, 0.02, dark, 0, 0.04, -0.056)); parts.push(box(0.024, 0.03, 0.03, dark, 0, 0.14, -0.05)); }
  // Magazin
  if (s.mag === 'box') parts.push(box(0.032, 0.05, 0.12, mat(0x25272c, 0.5, 0.6), 0, 0.03, 0.07, -0.12));
  if (s.mag === 'curved') parts.push(box(0.03, 0.05, 0.14, mat(0x25272c, 0.5, 0.6), 0, 0.03, 0.08, -0.22));
  // Repetiermechanik
  if (s.bolt) { parts.push(cyl(0.006, 0.006, 0.07, metal(STEEL), 0.04, -0.01, -0.02, 0, 0, Math.PI / 2)); parts.push(sph(0.012, metal(STEEL), 0.078, -0.01, -0.02)); }
  if (s.lever) parts.push(mesh(new THREE.TorusGeometry(0.036, 0.0065, 6, 14), metal(0x6a6e76), 0, -0.03, 0.05, 0, Math.PI / 2, 0));
  parts.push(mesh(new THREE.TorusGeometry(0.026, 0.004, 6, 10, Math.PI), metal(0x2a2c31), 0, -0.03, 0.03, 0, Math.PI / 2, Math.PI)); // Abzugsbügel
  // Zielfernrohr
  if (s.scope) {
    const sy = 0.05 + s.scope / 2 - 0.05;
    parts.push(cyl(0.0225, 0.0225, s.scope, metal(0x1f2024), 0, sy + 0.05, -0.075, 0, 0, 0, 14));
    parts.push(cyl(0.03, 0.026, 0.035, metal(0x15161a), 0, sy + 0.05 + s.scope / 2, -0.075, 0, 0, 0, 14)); // Objektiv
    parts.push(cyl(0.026, 0.022, 0.03, metal(0x15161a), 0, sy + 0.05 - s.scope / 2, -0.075, 0, 0, 0, 14)); // Okular
    parts.push(cyl(0.023, 0.023, 0.003, glass(0x6ab8e8), 0, sy + 0.05 + s.scope / 2 + 0.018, -0.075));
    for (const fy of [-0.06, 0.06]) parts.push(box(0.012, 0.02, 0.04, metal(0x15161a), 0, sy + 0.05 + fy * s.scope * 2, -0.055)); // Montage
  }
  return held(parts, GUN_TILT, 0, 0.03);
}

/* ----------------------------------------------------------------- Zuordnung */

export const PZ_TOOL_BUILD: Record<string, () => THREE.Object3D[]> = {};
for (const [id, spec] of Object.entries(BLADES)) PZ_TOOL_BUILD[id] = () => held(bladeModel(spec), spec.bl > 0.35 ? 1.62 : 1.38);
for (const [id, v] of [['pz_hatchet', 'hatchet'], ['pz_hand_axe', 'hand_axe'], ['pz_wood_axe', 'wood_axe'], ['pz_pickaxe', 'pickaxe'], ['pz_ice_axe', 'ice_axe'], ['pz_scythe', 'scythe']]) PZ_TOOL_BUILD[id] = () => held(axeModel(v));
for (const [id, v] of [['pz_mace', 'mace'], ['pz_mace_stone', 'mace_stone'], ['pz_long_mace', 'long_mace'], ['pz_long_spiked_club', 'long_spiked_club'], ['pz_short_bat', 'short_bat'], ['pz_spiked_short_bat', 'spiked_short_bat'], ['pz_nightstick', 'nightstick'], ['pz_fire_poker', 'fire_poker']]) PZ_TOOL_BUILD[id] = () => held(clubModel(v));
for (const [id, v] of [['pz_claw_hammer', 'claw_hammer'], ['pz_club_hammer', 'club_hammer'], ['pz_stone_hammer', 'stone_hammer'], ['pz_wooden_mallet', 'wooden_mallet'], ['pz_gavel', 'gavel']]) PZ_TOOL_BUILD[id] = () => held(hammerModel(v));
PZ_TOOL_BUILD.pz_spear_short = () => held(spearModel(false));
PZ_TOOL_BUILD.pz_spear_long = () => held(spearModel(true));
for (const [id, v] of [['pz_pipe_wrench', 'pipe_wrench'], ['pz_wrench', 'wrench'], ['pz_bolt_cutters', 'bolt_cutters'], ['pz_snow_shovel', 'shovel'], ['pz_smashed_bottle', 'bottle']]) PZ_TOOL_BUILD[id] = () => held(toolModel(v));
for (const id of ['pz_pistol_bf', 'pz_pistol_m9', 'pz_pistol_m1911']) PZ_TOOL_BUILD[id] = () => pistolModel(id);
for (const id of ['pz_revolver', 'pz_revolver_short', 'pz_magnum']) PZ_TOOL_BUILD[id] = () => revolverModel(id);
for (const id of ['pz_shotgun', 'pz_shotgun_sawnoff', 'pz_shotgun_tactical', 'pz_shotgun_double', 'pz_shotgun_double_sawnoff']) PZ_TOOL_BUILD[id] = () => shotgunModel(id);
for (const id of Object.keys(RIFLES)) PZ_TOOL_BUILD[id] = () => rifleModel(id);
