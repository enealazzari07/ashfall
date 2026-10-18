import * as THREE from 'three';

/**
 * Rucksäcke: aus Querschnitten gezogene, abgerundete Körper (oben schmaler/breiter, unten eingezogen), Gewebe mit Nähten,
 * Deckelfach, Reißverschluss-Frontfach, Flaschentaschen, Kompressionsgurte, Isomatte und flache gepolsterte Trageriemen,
 * die über die Schulter laufen und am Körper anliegen. Hüftgurt beim Trekkingrucksack.
 * Koordinaten wie der Rückenplatz der Figur: die Rückenplatte liegt bei z = 0 und zeigt zum Körper (+z), der Packsack ragt nach -z.
 */

let fabricMap: THREE.CanvasTexture | null | undefined;
/** Ripstop-Gewebe: feines Raster mit verstärkten Fäden und leichtem Rauschen */
function fabric(): THREE.CanvasTexture | null {
  if (fabricMap !== undefined) return fabricMap;
  if (typeof document === 'undefined') return (fabricMap = null);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d6d6d6';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 2) {
    g.fillStyle = i % 16 === 0 ? '#a4a4a4' : '#cacaca';
    g.fillRect(i, 0, 1, 256);
    g.fillRect(0, i, 256, 1);
  }
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return (fabricMap = t);
}

const cloth = (color: number, rough = 0.88): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02, map: fabric(), bumpMap: fabric(), bumpScale: 0.8, side: THREE.DoubleSide });
const webbing = (color: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, bumpMap: fabric(), bumpScale: 0.5 });
const plastic = (color: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.15 });
const foam = (color: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });

const shade = <T extends THREE.Mesh>(o: T): T => {
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
};
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
  const o = shade(new THREE.Mesh(g, m));
  o.position.set(x, y, z);
  return o;
};

interface Section { y: number; w: number; d: number }

/**
 * Körper aus Querschnitten: abgerundetes Rechteck (Superellipse), Rückseite bei z = 0, Vorderseite bei z = -d.
 * `n` bestimmt die Rundung der Kanten (2 = Ellipse, 6 = fast eckig).
 */
function loft(sections: Section[], n = 3.6, seg = 40): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const e = 2 / n;
  const total = sections[sections.length - 1].y - sections[0].y || 1;
  sections.forEach((s, i) => {
    for (let k = 0; k <= seg; k++) {
      const t = (k / seg) * Math.PI * 2;
      const c = Math.cos(t), sn = Math.sin(t);
      const x = (s.w / 2) * Math.sign(c) * Math.abs(c) ** e;
      // Rückseite etwas flacher als die Vorderseite
      const zl = (s.d / 2) * Math.sign(sn) * Math.abs(sn) ** e;
      pos.push(x, s.y, -s.d / 2 + zl);
      uv.push(k / seg, (s.y - sections[0].y) / total);
    }
    if (i > 0) {
      const a = (i - 1) * (seg + 1), b = i * (seg + 1);
      for (let k = 0; k < seg; k++) idx.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
    }
  });
  // Deckel und Boden als Fächer
  const cap = (si: number, up: boolean): void => {
    const s = sections[si];
    const ci = pos.length / 3;
    pos.push(0, s.y, -s.d / 2);
    uv.push(0.5, up ? 1 : 0);
    const base = si * (seg + 1);
    for (let k = 0; k < seg; k++) idx.push(ci, up ? base + k + 1 : base + k, up ? base + k : base + k + 1);
  };
  cap(0, false);
  cap(sections.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Flacher Gurt entlang einer Kurve, liegt mit der Breitseite am Körper (`outward` liefert die Körpernormale an einem Punkt) */
function ribbon(points: THREE.Vector3[], width: number | ((u: number) => number), thick: number | ((u: number) => number), mat: THREE.Material, outward: (p: THREE.Vector3) => THREE.Vector3, lift = 0, closed = false): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.4);
  const N = 56;
  const pos: number[] = [], idx: number[] = [], uv: number[] = [];
  const p = new THREE.Vector3(), tg = new THREE.Vector3(), nrm = new THREE.Vector3(), side = new THREE.Vector3(), n2 = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, tg);
    nrm.copy(outward(p)).normalize();
    p.addScaledVector(nrm, lift);
    side.crossVectors(tg, nrm).normalize();
    n2.crossVectors(side, tg).normalize();
    const w = (typeof width === 'function' ? width(u) : width) / 2;
    const t = (typeof thick === 'function' ? thick(u) : thick) / 2;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(p.x + side.x * w * a + n2.x * t * b, p.y + side.y * w * a + n2.y * t * b, p.z + side.z * w * a + n2.z * t * b);
      uv.push(a > 0 ? 1 : 0, u * 8);
    }
    if (i > 0) {
      const o = (i - 1) * 4, q = i * 4;
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        idx.push(o + k, q + k, o + k2, o + k2, q + k, q + k2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return shade(new THREE.Mesh(g, mat));
}

/** Dünner Rundstrang (Reißverschluss, Nähte) entlang von Punkten */
function cord(points: THREE.Vector3[], r: number, mat: THREE.Material): THREE.Mesh {
  return shade(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, r, 5, false), mat));
}

function buckle(x: number, y: number, z: number, mat: THREE.Material, w = 0.04, h = 0.026): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(mesh(new THREE.BoxGeometry(w, h, 0.01), mat));
  g.add(mesh(new THREE.BoxGeometry(w * 0.55, h * 0.45, 0.014), foam(0x0c0c0e)));
  return g;
}

const cache = new Map<string, THREE.Group>();

/** 'hikingpack' = großer Trekkingrucksack (18 kg), 'schoolbag' = kleiner Tagesrucksack */
/** `bulk` = Dicke der Kleidung unter den Gurten in Metern (Jacke, Weste), damit die Gurte darauf statt darin liegen */
export function createBackpack(kind: 'hikingpack' | 'schoolbag', bulk = 0): THREE.Group {
  const ck = `${kind}|${Math.round(bulk * 200)}`;
  const hit = cache.get(ck);
  if (hit) return hit.clone();
  const g = new THREE.Group();
  const big = kind === 'hikingpack';
  const body = cloth(big ? 0x4d5b3d : 0x2f4a6e);
  const dark = cloth(big ? 0x353f2a : 0x20344f);
  const web = webbing(0x1b1b1d);
  const metal = plastic(0x17171b);
  const pad = foam(0x1e1f22);

  // --- Hauptkörper: unten eingezogen, in der Mitte am dicksten, oben leicht schmaler ---
  const H = big ? 0.6 : 0.4, W = big ? 0.33 : 0.29, D = big ? 0.2 : 0.14;
  const y0 = big ? -0.34 : -0.2; // Unterkante
  const main = loft([
    { y: y0, w: W * 0.8, d: D * 0.72 },
    { y: y0 + H * 0.08, w: W * 0.94, d: D * 0.9 },
    { y: y0 + H * 0.4, w: W, d: D },
    { y: y0 + H * 0.78, w: W * 0.97, d: D * 0.96 },
    { y: y0 + H, w: W * 0.88, d: D * 0.82 },
  ]);
  g.add(mesh(main, body));
  // Naht um den unteren Boden und senkrechte Mittelnaht vorn
  g.add(cord([new THREE.Vector3(0, y0 + H * 0.05, -D * 0.78), new THREE.Vector3(0, y0 + H * 0.5, -D - 0.002), new THREE.Vector3(0, y0 + H * 0.95, -D * 0.84)], 0.0035, dark));

  // --- Deckelfach ---
  const lidH = big ? 0.17 : 0.12;
  const lid = loft([
    { y: y0 + H - lidH * 0.55, w: W * 0.96, d: D * 1.02 },
    { y: y0 + H - lidH * 0.1, w: W * 1.02, d: D * 1.12 },
    { y: y0 + H + lidH * 0.35, w: W * 0.94, d: D * 1.06 },
    { y: y0 + H + lidH * 0.5, w: W * 0.74, d: D * 0.84 },
  ], 3.2);
  g.add(mesh(lid, dark));
  const lidFrontZ = -D * 1.12 + 0.005;
  // Deckelgurt mit Schnalle
  g.add(mesh(new THREE.BoxGeometry(0.045, lidH * 1.4, 0.008), web, 0, y0 + H - lidH * 0.35, lidFrontZ));
  g.add(buckle(0, y0 + H - lidH * 0.9, lidFrontZ - 0.006, metal));
  // Reißverschluss-Tasche im Deckel
  g.add(cord([new THREE.Vector3(-W * 0.3, y0 + H + lidH * 0.18, -D * 0.9), new THREE.Vector3(0, y0 + H + lidH * 0.3, -D * 1.0), new THREE.Vector3(W * 0.3, y0 + H + lidH * 0.18, -D * 0.9)], 0.003, metal));

  // --- Frontfach mit Reißverschluss ---
  const fy = y0 + H * 0.38, fh = H * 0.46, fd = big ? 0.06 : 0.045;
  const front = loft([
    { y: fy - fh / 2, w: W * 0.74, d: fd * 0.5 },
    { y: fy - fh * 0.3, w: W * 0.8, d: fd },
    { y: fy + fh * 0.3, w: W * 0.8, d: fd },
    { y: fy + fh / 2, w: W * 0.74, d: fd * 0.6 },
  ], 3);
  const fz = -D * 0.97;
  const frontMesh = mesh(front, dark, 0, 0, fz);
  g.add(frontMesh);
  g.add(cord([new THREE.Vector3(-W * 0.34, fy + fh * 0.34, fz - fd - 0.001), new THREE.Vector3(0, fy + fh * 0.4, fz - fd - 0.002), new THREE.Vector3(W * 0.34, fy + fh * 0.34, fz - fd - 0.001)], 0.0032, metal));
  g.add(mesh(new THREE.BoxGeometry(0.012, 0.028, 0.006), metal, W * 0.1, fy + fh * 0.37, fz - fd - 0.004));

  // --- Kompressionsgurte quer über Front ---
  for (const fyk of [0.28, 0.6]) {
    const yy = y0 + H * fyk;
    g.add(mesh(new THREE.BoxGeometry(W * 1.02, 0.026, 0.006), web, 0, yy, fz - fd - 0.003));
    for (const sx of [-1, 1]) g.add(buckle(sx * W * 0.5, yy, fz - fd - 0.006, metal, 0.034, 0.024));
  }

  if (big) {
    // --- Seitentaschen für Flaschen ---
    for (const sx of [-1, 1]) {
      const sp = loft([
        { y: -0.28, w: 0.075, d: 0.1 },
        { y: -0.26, w: 0.1, d: 0.13 },
        { y: -0.1, w: 0.105, d: 0.135 },
        { y: -0.02, w: 0.085, d: 0.11 },
      ], 3);
      const pocket = mesh(sp, dark, sx * (W / 2 + 0.035), 0, -0.03);
      g.add(pocket);
      const bottle = mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.19, 14), plastic(sx < 0 ? 0x2d6a8f : 0x8f8f94), sx * (W / 2 + 0.035), -0.06, -0.075);
      g.add(bottle);
      g.add(mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.03, 10), metal, sx * (W / 2 + 0.035), 0.05, -0.075));
    }
    // --- Isomatte unten, mit zwei Gurten ---
    const roll = mesh(new THREE.CylinderGeometry(0.078, 0.078, W * 1.06, 24), cloth(0x8a3a24, 0.7), 0, y0 - 0.04, -D * 0.5);
    roll.rotation.z = Math.PI / 2;
    g.add(roll);
    for (const x of [-W * 0.3, W * 0.3]) {
      const ring = mesh(new THREE.TorusGeometry(0.081, 0.011, 6, 20), web, x, y0 - 0.04, -D * 0.5);
      ring.rotation.y = Math.PI / 2;
      g.add(ring);
      g.add(buckle(x, y0 - 0.04 - 0.081, -D * 0.5 - 0.004, metal, 0.03, 0.02));
    }
  } else {
    // Tragegriff oben
    const handle = cord([new THREE.Vector3(-0.045, y0 + H + lidH * 0.3, -D * 0.5), new THREE.Vector3(0, y0 + H + lidH * 0.5 + 0.03, -D * 0.5), new THREE.Vector3(0.045, y0 + H + lidH * 0.3, -D * 0.5)], 0.007, web);
    g.add(handle);
  }

  // --- gepolsterte Rückenplatte (liegt am Körper) ---
  for (const sx of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(W * 0.34, H * 0.78, 0.022), pad, sx * W * 0.22, y0 + H * 0.5, 0.008));
  }

  // --- Trageriemen: vom oberen Rücken über die Schulter, an Brust und Seite wieder nach unten ---
  // Körperachse für die Lage der Gurte; Schulter und Brust liegen vor dem Rücken (+z)
  const top = y0 + H * 0.88;
  // über der Schulterlinie zeigt die Körpernormale nach oben, sonst von der Körperachse weg
  const axis = (p: THREE.Vector3): THREE.Vector3 => new THREE.Vector3(p.x * 1.2, Math.max(0, p.y - (top + 0.06)) * 4, p.z - 0.14);
  const sx = big ? 0.115 : 0.105;
  const strapW = (u: number): number => 0.062 - 0.012 * Math.min(1, Math.max(0, (u - 0.6) / 0.4));
  const strapT = (u: number): number => (u < 0.7 ? 0.022 : 0.012);
  for (const s of [-1, 1]) {
    const pts = [
      new THREE.Vector3(s * sx, top, 0.012),
      new THREE.Vector3(s * sx, top + 0.1, 0.03),
      new THREE.Vector3(s * (sx + 0.005), top + 0.17, 0.1),
      new THREE.Vector3(s * (sx + 0.02), top + 0.14, 0.15),
      new THREE.Vector3(s * (sx + 0.045), top + 0.02, 0.2),
      new THREE.Vector3(s * (sx + 0.075), top - 0.12, 0.215),
      new THREE.Vector3(s * (sx + 0.1), top - 0.26, 0.17),
      new THREE.Vector3(s * (sx + 0.1), top - 0.38, 0.07),
      new THREE.Vector3(s * (W * 0.46), y0 + H * 0.2, 0.02),
    ];
    g.add(ribbon(pts, strapW, strapT, web, axis, bulk));
  }
  // Brustgurt zwischen den Riemen
  const chestY = top - 0.07;
  g.add(ribbon([new THREE.Vector3(-(sx + 0.06), chestY, 0.215), new THREE.Vector3(0, chestY - 0.004, 0.235), new THREE.Vector3(sx + 0.06, chestY, 0.215)], 0.02, 0.008, web, (p) => new THREE.Vector3(p.x * 0.3, 0, 1), bulk));
  g.add(buckle(0, chestY - 0.004, 0.243 + bulk, metal, 0.036, 0.026));

  if (big) {
    // Hüftgurt: gepolstert, umschließt die Hüfte und schließt vorn mit Schnalle
    const hy = y0 + H * 0.2;
    const hip = (p: THREE.Vector3): THREE.Vector3 => new THREE.Vector3(p.x * 1.1, 0, p.z - 0.12);
    const hw = (u: number): number => 0.095 - 0.055 * Math.pow(Math.abs(u - 0.5) * 2, 1.6);
    const pts = [
      new THREE.Vector3(-W * 0.5, hy, 0.01),
      new THREE.Vector3(-0.2, hy - 0.01, 0.08),
      new THREE.Vector3(-0.16, hy - 0.02, 0.22),
      new THREE.Vector3(-0.08, hy - 0.025, 0.28),
      new THREE.Vector3(0.08, hy - 0.025, 0.28),
      new THREE.Vector3(0.16, hy - 0.02, 0.22),
      new THREE.Vector3(0.2, hy - 0.01, 0.08),
      new THREE.Vector3(W * 0.5, hy, 0.01),
    ];
    g.add(ribbon(pts, hw, (u) => 0.026 - 0.014 * Math.pow(Math.abs(u - 0.5) * 2, 1.4), pad, hip, bulk * 1.8 + (bulk > 0 ? 0.012 : 0)));
    g.add(buckle(0, hy - 0.025, 0.298 + bulk * 1.8 + (bulk > 0 ? 0.012 : 0), metal, 0.05, 0.034));
  }
  cache.set(ck, g);
  return g.clone();
}
