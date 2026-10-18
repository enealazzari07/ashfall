import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  Box, CHUNK, Car, ChunkSpec, HIGHWAY_WIDTH, ROAD, SIDEWALK, Wagon, chunkSeed, rng,
} from './CityGenerator';
import { Inst, instanced, makeBox, mat4, planeXZ } from '../render/geo';
import { mats, windTime } from '../render/Materials';
import { URBAN, urbanClone } from '../render/UrbanAssets';
import { bushGeometry } from '../render/Trees';
import { buildTrees } from '../render/TreeMesh';
import { edgePoints, stripGeo } from '../render/RoadRibbon';
import { poseAt } from './WorldMap';
import { Livery, carGeos, carMats, decalGeo, modelOf, wheelSpots } from '../render/CarModel';

// --- gemeinsame Geometrien (Welt-weit geteilt, werden nie entladen) ---------
/** Autos, die schon gefahren wurden, werden in Chunks nicht mehr aufgestellt */
export const takenCars = new Set<string>();
export const carKey = (c: { x: number; z: number }) => `${c.x.toFixed(1)},${c.z.toFixed(1)}`;
/** Parkende Autos: je Modell eine Gruppe von Instanzen (Lack, Scheiben, Dunkles, Räder) */
export interface CarGroup {
  model: number;
  paint: THREE.InstancedMesh | null;
  glass: THREE.InstancedMesh | null;
  trim: THREE.InstancedMesh | null;
  wheels: THREE.InstancedMesh | null;
}
export interface CarSet {
  list: Car[];
  boxes: Box[];
  /** Platz jedes Autos: Modell und Instanznummer in dessen Gruppe */
  slot: { model: number; i: number; dkey: string | null; di: number }[];
  groups: CarGroup[];
  /** Lackierung/Verschleiß-Aufleger je Modell/Livery/Stufe */
  decals: { key: string; mesh: THREE.InstancedMesh | null }[];
}

const stallLineGeo = new THREE.BoxGeometry(0.1, 0.01, 5.2);
const padMat = new THREE.MeshStandardMaterial({ color: 0x4a4b50, roughness: 0.95 });
const stallPaint = new THREE.MeshStandardMaterial({ color: 0xe8e6dc, roughness: 0.9 });
const groundGeo = planeXZ(CHUNK, CHUNK, 8, 8);
const roadHGeo = planeXZ(CHUNK, ROAD, 8, ROAD); // Mittellinie läuft entlang X
const roadVGeo = planeXZ(CHUNK - ROAD, ROAD, 8, ROAD).rotateY(Math.PI / 2);
const walkH = makeBox(CHUNK - ROAD, 0.14, SIDEWALK, 2, 2);
const walkV = makeBox(SIDEWALK, 0.14, CHUNK - ROAD - 2 * SIDEWALK, 2, 2);
const roadVFullGeo = planeXZ(CHUNK, ROAD, 8, ROAD).rotateY(Math.PI / 2);
const railGeo = new THREE.BoxGeometry(2.1, 0.16, 0.1);
const sleeperGeo = new THREE.BoxGeometry(0.3, 0.12, 2.6);
const guardGeo = new THREE.BoxGeometry(4.2, 0.5, 0.08);
const guardPostGeo = new THREE.BoxGeometry(0.1, 0.8, 0.1);
const medianGeo = new THREE.BoxGeometry(4.2, 0.9, 0.6);

const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1.6, 6).translate(0, 0.8, 0);
const crownGeo = new THREE.IcosahedronGeometry(1.2, 1).translate(0, 2.5, 0);
const topGeo = new THREE.ConeGeometry(0.85, 1.6, 7).translate(0, 3.6, 0);
const bushGeo = bushGeometry();
/** Blume: Stiel mit Blatt (grün) und Blüte aus Blütenblättern um eine Mitte (Vertexfarben, Blüte wird per Instanzfarbe getönt) */
const colored = (g: THREE.BufferGeometry, r: number, gr: number, b: number): THREE.BufferGeometry => {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set([r, gr, b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  return g;
};
const flowerStemGeo = mergeGeometries([
  colored(new THREE.CylinderGeometry(0.008, 0.012, 0.34, 4).translate(0, 0.17, 0).toNonIndexed(), 0.2, 0.42, 0.14),
  colored(new THREE.SphereGeometry(0.035, 5, 3).scale(1.6, 0.35, 0.6).rotateZ(0.5).translate(0.04, 0.1, 0).toNonIndexed(), 0.22, 0.46, 0.16),
])!;
const flowerGeo = (() => {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const petal = new THREE.SphereGeometry(0.03, 5, 4).scale(1.5, 0.35, 0.8).translate(0.04, 0, 0).rotateY(a).translate(0, 0.34, 0).toNonIndexed();
    parts.push(colored(petal, 1, 1, 1));
  }
  parts.push(colored(new THREE.SphereGeometry(0.02, 5, 4).translate(0, 0.35, 0).toNonIndexed(), 0.95, 0.72, 0.1));
  return mergeGeometries(parts)!;
})();

/** Straßenlaterne: Sockel mit Manschette, konischer Mast, Ausleger mit Strebe, Schrauben */
const LAMP_S = 0.8; // Laternen sind insgesamt etwas kleiner als früher
/** Schwanenhals-Ausleger: steigt aus dem Mast, biegt sich über die Straße und senkt sich zur Leuchte */
const lampArm = () =>
  new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 4.62, 0), new THREE.Vector3(0.04, 5.0, 0), new THREE.Vector3(0.3, 5.25, 0),
      new THREE.Vector3(0.72, 5.27, 0), new THREE.Vector3(1.0, 5.14, 0),
    ]),
    16, 0.03, 7, false,
  );
const poleGeo = (() => {
  const g = mergeGeometries([
    new THREE.CylinderGeometry(0.19, 0.23, 0.14, 8).translate(0, 0.07, 0), // Fundamentplatte
    new THREE.CylinderGeometry(0.15, 0.2, 0.55, 12).translate(0, 0.42, 0), // Sockel, nach oben schlanker
    new THREE.CylinderGeometry(0.115, 0.115, 0.07, 12).translate(0, 0.72, 0), // Ring über dem Sockel
    new THREE.CylinderGeometry(0.052, 0.088, 4.1, 12).translate(0, 2.8, 0), // Mast, nach oben dünner
    new THREE.CylinderGeometry(0.075, 0.075, 0.05, 12).translate(0, 1.9, 0), // Zierband
    new THREE.CylinderGeometry(0.068, 0.068, 0.05, 12).translate(0, 4.5, 0), // Zierband oben
    new THREE.SphereGeometry(0.075, 10, 8).translate(0, 4.9, 0), // Mastkopf
    lampArm(),
    new THREE.BoxGeometry(0.1, 0.18, 0.025).translate(0.12, 1.05, 0).rotateY(0), // Wartungsklappe
  ])!;
  return g.scale(LAMP_S, LAMP_S, LAMP_S);
})();
/** Leuchtengehäuse (Metall): Kappe, Fassung und Rahmen um das Glas */
const lampHeadGeo = (() => {
  const g = mergeGeometries([
    new THREE.ConeGeometry(0.27, 0.12, 12).translate(1.0, 5.2, 0), // Dach
    new THREE.CylinderGeometry(0.13, 0.13, 0.04, 12).translate(1.0, 5.12, 0), // Fassung
    new THREE.TorusGeometry(0.15, 0.015, 6, 14).rotateX(Math.PI / 2).translate(1.0, 4.97, 0), // Haltering
    new THREE.CylinderGeometry(0.012, 0.012, 0.14, 4).translate(1.12, 5.04, 0.05), // Streben
    new THREE.CylinderGeometry(0.012, 0.012, 0.14, 4).translate(0.88, 5.04, -0.05),
  ])!;
  return g.scale(LAMP_S, LAMP_S, LAMP_S);
})();
/** Leuchtmittel: glühendes Glas, nachts warm (Material M.lampHead) */
const lampLensGeo = new THREE.SphereGeometry(0.14, 12, 9).scale(1, 0.8, 1).translate(1.0, 5.03, 0).scale(LAMP_S, LAMP_S, LAMP_S);
const LAMP_HEAD_Y = 5.0 * LAMP_S;
const LAMP_REACH = 1.0 * LAMP_S;
/** Lichtpfütze auf dem Boden: breit und weich */
const glowGeo = new THREE.PlaneGeometry(15, 15).rotateX(-Math.PI / 2);
/** Lichtkegel von der Lampe zum Boden (offen, additiv): macht das Licht in der Luft sichtbar */
const beamGeo = new THREE.ConeGeometry(2.8, LAMP_HEAD_Y, 28, 1, true).translate(0, LAMP_HEAD_Y / 2, 0).translate(LAMP_REACH, 0, 0);
/** Schein um die Lampe: zwei gekreuzte Flächen, von allen Seiten sichtbar */
const haloGeo = mergeGeometries([
  new THREE.PlaneGeometry(2.4, 2.4),
  new THREE.PlaneGeometry(2.4, 2.4).rotateY(Math.PI / 2),
  new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2),
])!.translate(LAMP_REACH, LAMP_HEAD_Y - 0.05, 0);
/** Runder Pflanzring: Steinwand mit Lippe, innen abgesetzt; darin eine gewölbte Erdschicht */
const planterRingGeo = new THREE.LatheGeometry(
  [[0.4, 0], [0.4, 0.22], [0.435, 0.235], [0.435, 0.28], [0.36, 0.28], [0.36, 0.12]].map(([x, y]) => new THREE.Vector2(x, y)),
  20,
);
const planterSoilGeo = new THREE.SphereGeometry(0.37, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.25, 1).translate(0, 0.17, 0);

/** Parkbank: Rahmen aus Gusseisen (Seitenteile mit Armlehnen, Querstreben), Sitz und Lehne aus Holzlatten */
const bx = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  return g.translate(x, y, z);
};
const benchIronGeo = (() => {
  const parts: THREE.BufferGeometry[] = [bx(1.26, 0.03, 0.03, 0, 0.34, 0.17), bx(1.26, 0.03, 0.03, 0, 0.34, -0.14)];
  for (const sx of [-0.62, 0.62]) {
    parts.push(
      bx(0.04, 0.4, 0.045, sx, 0.2, 0.17), // Vorderbein
      bx(0.04, 0.84, 0.045, sx, 0.42, -0.17, -0.2), // Hinterbein, geht in die Lehne über
      bx(0.045, 0.03, 0.42, sx, 0.62, 0.0), // Armlehne
      bx(0.03, 0.22, 0.03, sx, 0.51, 0.19), // Armlehnenstütze
      bx(0.08, 0.018, 0.14, sx, 0.009, 0.17), // Fußplatte vorn
      bx(0.08, 0.018, 0.14, sx, 0.009, -0.24), // Fußplatte hinten
    );
  }
  return mergeGeometries(parts)!;
})();
const benchWoodGeo = (() => {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) parts.push(bx(1.36, 0.035, 0.085, 0, 0.43, -0.15 + i * 0.115)); // Sitzlatten
  for (let i = 0; i < 3; i++) parts.push(bx(1.36, 0.08, 0.03, 0, 0.6 + i * 0.12, -0.22 - i * 0.045, -0.2)); // Lehnenlatten
  return mergeGeometries(parts)!;
})();
const signPoleGeo =new THREE.CylinderGeometry(0.04, 0.04, 2.9, 6).translate(0, 1.45, 0);


const gantryPostGeo = new THREE.CylinderGeometry(0.18, 0.18, 7, 8);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

function add(g: THREE.Object3D, ...o: (THREE.Object3D | null)[]): void {
  for (const x of o) if (x) g.add(x);
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = false): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  m.castShadow = shadow;
  return m;
}

function box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(boxGeo, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Schild, das von beiden Seiten lesbar ist (zwei Platten Rücken an Rücken). */
function plate(w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, rot: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, h);
  const front = new THREE.Mesh(geo, mat);
  front.position.z = 0.012;
  const back = new THREE.Mesh(geo, mat);
  back.position.z = -0.012;
  back.rotation.y = Math.PI;
  g.add(front, back);
  g.position.set(x, y, z);
  g.rotation.y = rot;
  return g;
}

function wagon(w: Wagon): THREE.Group {
  const M = mats();
  const g = new THREE.Group();
  g.position.set(w.x, 0, w.z);
  g.rotation.y = w.rot;
  add(
    g,
    box(M.metal, w.len, 0.5, 2.6, 0, 0.95, 0),
    box(M.train(w.color), w.len - 0.2, 2.5, 2.8, 0, 2.45, 0),
    box(M.train(0x777b80), w.len - 0.1, 0.25, 2.5, 0, 3.8, 0),
    box(M.metal, 2.6, 0.7, 2.2, -w.len * 0.3, 0.45, 0),
    box(M.metal, 2.6, 0.7, 2.2, w.len * 0.3, 0.45, 0),
    box(M.glass, w.len - 3.2, 0.7, 2.84, 0, 2.9, 0),
  );
  if (w.loco) {
    add(g, box(M.train(w.color), 3.2, 1.0, 2.7, w.len / 2 - 1.7, 4.2, 0), box(M.glass, 0.2, 0.6, 2.4, w.len / 2 - 0.08, 4.2, 0));
  }
  return g;
}

/** Baut alles außer den Gebäuden: Boden, Straßen, Gehwege, Laternen, Schilder, Pflanzen, Autos, Bahn, Autobahn. */
export function buildTerrain(spec: ChunkSpec, cx: number, cz: number, group: THREE.Group, colliders: Box[]): void {
  const M = mats();
  const ox = cx * CHUNK, oz = cz * CHUNK;

  add(group, mesh(groundGeo, M.ground, ox + CHUNK / 2, 0, oz + CHUNK / 2));

  // Landstraßen: schmaler Asphalt (6 m) auf einem Schotterstreifen, ohne Gehweg; an der Stadt voll breit
  const dirtStrip = (w: number, d: number, x: number, z: number) => {
    const m = new THREE.Mesh(makeBox(w, 0.02, d, 4, 4), M.floorDirt);
    m.userData.ownGeo = true;
    m.position.set(x, 0.012, z);
    m.receiveShadow = true;
    group.add(m);
  };
  if (spec.roadH) {
    const m = mesh(roadHGeo, M.road, ox + CHUNK / 2, 0.02, oz + ROAD / 2);
    if (!spec.urbanH) {
      m.scale.z = 0.75;
      dirtStrip(CHUNK, ROAD + 1.6, ox + CHUNK / 2, oz + ROAD / 2);
    }
    add(group, m);
  }
  if (spec.roadV) {
    // ohne Querstraße am Nordrand läuft die Straße bis zur Chunk-Kante (sonst endet sie an der Kreuzung)
    const full = !spec.roadH;
    const len = full ? CHUNK : CHUNK - ROAD;
    const cz0 = full ? oz + CHUNK / 2 : oz + ROAD + (CHUNK - ROAD) / 2;
    const m = mesh(full ? roadVFullGeo : roadVGeo, M.road, ox + ROAD / 2, 0.03, cz0);
    if (!spec.urbanV) {
      m.scale.x = 0.75;
      dirtStrip(ROAD + 1.6, len, ox + ROAD / 2, cz0);
    }
    add(group, m);
  }

  // Gassen: vier Meter breit, enden im Hinterhof
  const alley = (w: number, d: number, x: number, z: number) => {
    const m = new THREE.Mesh(makeBox(w, 0.03, d, 4, 4), M.road);
    m.userData.ownGeo = true;
    m.position.set(x, 0.025, z);
    m.receiveShadow = true;
    group.add(m);
  };
  if (spec.alleyV) {
    const z0 = spec.roadH ? ROAD : 0;
    alley(4, 46 - z0, ox + 5, oz + z0 + (46 - z0) / 2);
  }
  if (spec.alleyH) {
    const x0 = spec.roadV ? ROAD : 0;
    alley(46 - x0, 4, ox + x0 + (46 - x0) / 2, oz + 5);
  }

  // Asphaltflächen (Raststätte, Hof)
  for (const pd of spec.pads) {
    const m = new THREE.Mesh(makeBox(pd.w, 0.05, pd.d, 6, 6), padMat);
    m.userData.ownGeo = true;
    m.position.set(pd.x, 0.025, pd.z);
    m.receiveShadow = true;
    group.add(m);
  }

  // Stellplatzlinien: je Platz zwei weiße Striche
  const lines: Inst[] = [];
  for (const st of spec.stalls) {
    for (const o of [-1.4, 1.4]) {
      lines.push({ m: mat4(st.alongX ? st.x + o : st.x, 0.052, st.alongX ? st.z : st.z + o, st.alongX ? 0 : Math.PI / 2) });
    }
  }
  add(group, instanced(stallLineGeo, stallPaint, lines, false));

  // GLB-Modelle aus dem Retro-Urban-Kit
  for (const md of spec.models) {
    const o = urbanClone(md.name);
    if (!o) continue;
    o.position.set(md.x, 0.04, md.z);
    o.rotation.y = md.rot;
    group.add(o);
    if (md.solid) colliders.push({ x: md.x, z: md.z, w: URBAN[md.name].radius * 2, d: URBAN[md.name].radius * 2 });
  }

  // --- Gehwege (nur in der Stadt, nur an vorhandenen Straßen) ---
  if (spec.land === 'town') {
    const x0 = spec.roadV ? ox + ROAD : ox, x1 = ox + CHUNK;
    const hStrip = (z: number) => {
      const m = mesh(walkH, M.paving, (x0 + x1) / 2, 0.07, z);
      m.scale.x = (x1 - x0) / (CHUNK - ROAD);
      add(group, m);
    };
    if (spec.roadH) hStrip(oz + ROAD + SIDEWALK / 2);
    if (spec.roadS) hStrip(oz + CHUNK - SIDEWALK / 2);
    const z0 = spec.roadH ? oz + ROAD + SIDEWALK : oz, z1 = spec.roadS ? oz + CHUNK - SIDEWALK : oz + CHUNK;
    const vStrip = (x: number) => {
      const m = mesh(walkV, M.paving, x, 0.07, (z0 + z1) / 2);
      m.scale.z = (z1 - z0) / (CHUNK - ROAD - 2 * SIDEWALK);
      add(group, m);
    };
    if (spec.roadV) vStrip(ox + ROAD + SIDEWALK / 2);
    if (spec.roadE) vStrip(ox + CHUNK - SIDEWALK / 2);
  }

  // --- Kurvige Straßen, Autobahn, Bahn ---
  buildPaths(spec, group, ox, oz);
  for (const w of spec.train) {
    add(group, wagon(w));
    const tx = Math.cos(w.rot), tz = -Math.sin(w.rot);
    for (let t = -w.len / 2 + 1.6; t <= w.len / 2 - 1.5; t += 3) colliders.push({ x: w.x + tx * t, z: w.z + tz * t, w: 3.2, d: 3.2 });
  }

  // --- Laternen mit Lichtpfütze ---
  const poles: Inst[] = [], glows: Inst[] = [];
  for (const l of spec.lamps) {
    const rot = Math.atan2(-l.dz, l.dx);
    poles.push({ m: mat4(l.x, 0, l.z, rot) });
    glows.push({ m: mat4(l.x + l.dx * LAMP_REACH, 0.16, l.z + l.dz * LAMP_REACH) });
  }
  add(
    group,
    instanced(poleGeo, M.metal, poles),
    instanced(lampHeadGeo, M.metal, poles),
    instanced(lampLensGeo, M.lampHead, poles, false),
    instanced(glowGeo, M.glow, glows, false),
    instanced(beamGeo, M.beam, poles, false),
    instanced(haloGeo, M.halo, poles, false),
  );

  // --- Schilder ---
  const signPoles: Inst[] = [];
  const poleSeen = new Set<string>();
  for (const s of spec.signs) {
    if (s.type === 'gantry') {
      const tx = Math.cos(s.rot), tz = -Math.sin(s.rot);
      const nx = -tz, nz = tx;
      const half = HIGHWAY_WIDTH / 2 + 1.4;
      for (const sd of [-1, 1]) add(group, mesh(gantryPostGeo, M.metal, s.x + nx * sd * half, 3.5, s.z + nz * sd * half, true));
      const bar = box(M.metal, 0.4, 0.5, 2 * half, 0, 0, 0);
      const bg = new THREE.Group();
      bg.position.set(s.x, 6.8, s.z);
      bg.rotation.y = s.rot;
      bg.add(bar);
      group.add(bg);
      add(group, plate(9, 2.25, M.sign('gantry'), s.x - 0.25 * tx, 5.4, s.z - 0.25 * tz, s.rot + Math.PI / 2));
      continue;
    }
    const key = `${s.x},${s.z}`;
    if (!poleSeen.has(key)) {
      poleSeen.add(key);
      signPoles.push({ m: mat4(s.x, 0, s.z) });
    }
    const sz = s.type === 'name' ? [1.5, 0.38, 2.85] : s.type === 'stop' ? [0.75, 0.75, 2.1] : [1.1, 1.1, 2.3];
    add(group, plate(sz[0], sz[1], M.sign(s.type === 'name' ? `name:${s.text}` : s.type), s.x, sz[2], s.z, s.rot));
  }
  add(group, instanced(signPoleGeo, M.metal, signPoles));

  // --- Pflanzen ---
  buildTrees(spec.trees, group, spec.land === 'town' || spec.land === 'village');
  for (const t of spec.trees) colliders.push({ x: t.x, z: t.z, w: 0.4, d: 0.4 });
  add(
    group,
    instanced(bushGeo, M.bush, spec.bushes.map((b) => ({ m: mat4(b.x, 0, b.z, b.x, b.s * 0.8, b.s * 0.66, b.s * 0.8), color: b.color }))),
    instanced(flowerStemGeo, M.tuft, spec.flowers.map((f) => ({ m: mat4(f.x, 0, f.z) })), false),
    instanced(flowerGeo, M.flower, spec.flowers.map((f) => ({ m: mat4(f.x, 0, f.z), color: f.color })), false),
  );

  // --- Außenanlagen: Betonwege und Vorplätze, Beete, Hecken, Baumscheiben, Bänke ---
  const slab = (mat: THREE.Material, b: Box, y0: number, h: number, tile = 2) => {
    const m = new THREE.Mesh(makeBox(b.w, h, b.d, tile, tile), mat);
    m.userData.ownGeo = true;
    m.position.set(b.x, y0 + h / 2, b.z);
    m.receiveShadow = true;
    return m;
  };
  const soil = M.prop(0x3e2b1c), stone = M.prop(0xb9b4a8), hedgeMat = M.prop(0x3d7a40), wood = M.prop(0x8a6a45), iron = M.prop(0x2e3236);
  for (const b of spec.buildings) {
    if (b.path) add(group, slab(M.paving, b.path, 0.0, 0.1));
    if (b.path2) add(group, slab(M.paving, b.path2, 0.0, 0.1));
    // Fabrikhof: Beton über das ganze Grundstück
    if (b.kind === 'industry' && b.lot) {
      add(group, slab(M.floorConcrete, { x: b.lot.x, z: b.lot.z, w: b.lot.w - 0.4, d: b.lot.d - 0.4 }, 0.0, 0.045, 4));
    }
    if (b.driveway) add(group, slab(M.paving, b.driveway, 0.0, 0.09));
  }
  const edgeBox = (b: Box, mat: THREE.Material, t: number, h: number): THREE.Mesh[] => [
    box(mat, b.w + 2 * t, h, t, b.x, h / 2, b.z - b.d / 2 - t / 2),
    box(mat, b.w + 2 * t, h, t, b.x, h / 2, b.z + b.d / 2 + t / 2),
    box(mat, t, h, b.d, b.x - b.w / 2 - t / 2, h / 2, b.z),
    box(mat, t, h, b.d, b.x + b.w / 2 + t / 2, h / 2, b.z),
  ];
  for (const bed of spec.beds) {
    if (Math.max(bed.w, bed.d) <= 1.6) {
      // kleine Beete sind runde Pflanzringe: Steinring mit Lippe, Erde mit Kuppe, ein paar Kiesel
      const rad = Math.min(bed.w, bed.d) * 0.4;
      const ring = new THREE.Mesh(planterRingGeo, stone);
      ring.scale.set(rad / 0.4, 1, rad / 0.4);
      ring.position.set(bed.x, 0, bed.z);
      ring.castShadow = ring.receiveShadow = true;
      const earth = new THREE.Mesh(planterSoilGeo, soil);
      earth.scale.set(rad / 0.4, 1, rad / 0.4);
      earth.position.set(bed.x, 0, bed.z);
      earth.receiveShadow = true;
      add(group, ring, earth);
      continue;
    }
    add(group, box(soil, bed.w, 0.14, bed.d, bed.x, 0.07, bed.z), ...edgeBox(bed, stone, 0.1, 0.2));
  }
  for (const h of spec.hedges) {
    add(group, box(hedgeMat, h.w, 0.95, h.d, h.x, 0.475, h.z));
    colliders.push({ x: h.x, z: h.z, w: h.w, d: h.d, climb: 1 });
  }
  for (const p of spec.pits) {
    const pit: Box = { x: p.x, z: p.z, w: 1.5, d: 1.5 };
    add(group, box(soil, pit.w, 0.12, pit.d, p.x, 0.2, p.z), ...edgeBox({ ...pit, y: 0 } as Box, stone, 0.14, 0.3).map((m) => {
      m.position.y = 0.17;
      return m;
    }));
  }
  const benchIron: Inst[] = [], benchWood: Inst[] = [];
  for (const bn of spec.benches) {
    benchIron.push({ m: mat4(bn.x, 0.14, bn.z, bn.rot) });
    benchWood.push({ m: mat4(bn.x, 0.14, bn.z, bn.rot) });
    colliders.push({ x: bn.x, z: bn.z, w: 1.5, d: 0.5 });
  }
  add(group, instanced(benchIronGeo, M.metal, benchIron), instanced(benchWoodGeo, wood, benchWood));

  // --- Straßenmarkierungen, Bordsteine, Gullys, Risse, Straßenmöbel, Gras ---
  if (spec.land === 'town') streetDetails(spec, cx, cz, group, colliders);

  // --- Autos --- (einsteigbare Autos merken sich ihre Instanzen, siehe ChunkManager.takeCar)
  interface Grp { paint: Inst[]; glass: Inst[]; trim: Inst[]; wheels: Inst[] }
  const groups = new Map<number, Grp>();
  const built: Car[] = [];
  const slot: { model: number; i: number; dkey: string | null; di: number }[] = [];
  const decalInst = new Map<string, { model: number; livery: Livery; tier: number; list: Inst[] }>();
  const carBoxes: Box[] = [];
  for (const c of spec.cars) {
    if (takenCars.has(carKey(c))) continue;
    const md = modelOf(c.model);
    const mi = c.model ?? 0;
    let grp = groups.get(mi);
    if (!grp) groups.set(mi, (grp = { paint: [], glass: [], trim: [], wheels: [] }));
    built.push(c);
    const base = mat4(c.x, 0, c.z, c.rot);
    const lv = c.livery ?? 'none', tier = c.tier ?? 0;
    let dkey: string | null = null, di = 0;
    if (decalGeo(mi, lv, tier)) {
      dkey = `${mi}|${lv}|${tier}`;
      let d = decalInst.get(dkey);
      if (!d) decalInst.set(dkey, (d = { model: mi, livery: lv, tier, list: [] }));
      di = d.list.length;
      d.list.push({ m: base });
    }
    slot.push({ model: mi, i: grp.paint.length, dkey, di });
    grp.paint.push({ m: base, color: c.color });
    grp.glass.push({ m: base });
    grp.trim.push({ m: base });
    for (const [wx, wz] of wheelSpots(md)) grp.wheels.push({ m: base.clone().multiply(mat4(wx, md.wheelR, wz)) });
    const cc = Math.abs(Math.cos(c.rot)), sn = Math.abs(Math.sin(c.rot));
    const box: Box = { x: c.x, z: c.z, w: cc * md.len + sn * md.W, d: sn * md.len + cc * md.W };
    carBoxes.push(box);
    colliders.push(box);
  }
  const CM = carMats();
  const carGroups: CarGroup[] = [];
  for (const [mi, grp] of groups) {
    const G = carGeos(mi);
    const cg: CarGroup = {
      model: mi,
      paint: instanced(G.parkedPaint, CM.paint, grp.paint),
      glass: instanced(G.glass, CM.glass, grp.glass),
      trim: instanced(G.parkedTrim, CM.trim, grp.trim),
      wheels: instanced(G.wheel, CM.wheel, grp.wheels),
    };
    add(group, cg.paint, cg.glass, cg.trim, cg.wheels);
    carGroups.push(cg);
  }
  const decals: CarSet['decals'] = [];
  for (const [key, d] of decalInst) {
    const mesh = instanced(decalGeo(d.model, d.livery, d.tier)!, CM.trim, d.list);
    if (mesh) add(group, mesh);
    decals.push({ key, mesh });
  }
  group.userData.cars = { list: built, boxes: carBoxes, slot, groups: carGroups, decals } as CarSet;
}

/** Grasbüschel: viele schmale, gebogene Halme mit Farbverlauf (dunkel am Fuß, hell an der Spitze) */
function bladeCluster(count: number, minH: number, maxH: number, spread: number): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const SEG = 4;
  let seed = 1234 + count * 7;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let b = 0; b < count; b++) {
    const ang = rnd() * Math.PI * 2, rad = Math.sqrt(rnd()) * spread, face = rnd() * Math.PI;
    const h = minH + rnd() * (maxH - minH), bend = (rnd() - 0.3) * h * 0.9, w0 = 0.011 + rnd() * 0.01;
    const bx = Math.cos(ang) * rad, bz = Math.sin(ang) * rad;
    const dx = Math.cos(face), dz = Math.sin(face);
    const lean = Math.cos(ang + 1.3), lz = Math.sin(ang + 1.3);
    const base = pos.length / 3;
    const tone = 0.85 + rnd() * 0.3;
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG, w = w0 * (1 - t * 0.95);
      const y = h * t, off = bend * t * t;
      const cx = bx + lean * off, cz = bz + lz * off;
      pos.push(cx - dz * w, y, cz + dx * w, cx + dz * w, y, cz - dx * w);
      const shade = (0.42 + 0.58 * t) * tone;
      col.push(shade * 0.82, shade, shade * 0.78, shade * 0.82, shade, shade * 0.78);
    }
    for (let k = 0; k < SEG; k++) {
      const a = base + k * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const tuftGeo = bladeCluster(18, 0.16, 0.42, 0.1);
const tallGrassGeo = bladeCluster(12, 0.4, 0.8, 0.07);
const grassWind = (): void => {
  windTime.value = performance.now() / 1000;
};
const cylSmall = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);

/** Zebrastreifen, Haltelinien, Bordsteine, Gullys, Asphaltflicken, Risse, Hydranten, Mülleimer, Briefkästen, Grasbüschel. */
function streetDetails(spec: ChunkSpec, cx: number, cz: number, group: THREE.Group, colliders: Box[]): void {
  const M = mats();
  const ox = cx * CHUNK, oz = cz * CHUNK;
  const r = rng((chunkSeed(cx, cz) ^ 0x51ed270b) >>> 0);
  const paint = M.prop(0xe6e6de), curb = M.prop(0xb9b5aa), dark = M.prop(0x2b2b30), stain = M.prop(0x8c8a82), moss = M.prop(0x5b6e44);

  const items = new Map<THREE.Material, Inst[]>();
  const put = (mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rot = 0) => {
    const list = items.get(mat) ?? [];
    list.push({ m: mat4(x, y, z, rot, w, h, d) });
    items.set(mat, list);
  };
  const unit = boxGeo;

  // Fußgängerüberwege und Haltelinien an der Kreuzung (Ecke des Chunks)
  const stripes = (cxm: number, czm: number, alongX: boolean) => {
    for (let k = 0; k < ROAD - 1; k++) {
      if (alongX) put(paint, 2.8, 0.012, 0.5, cxm, 0.044, oz + 0.9 + k * 1.0);
      else put(paint, 0.5, 0.012, 2.8, ox + 0.9 + k * 1.0, 0.044, czm);
    }
  };
  if (spec.roadH && spec.roadV) {
    stripes(ox + ROAD + 2.6, 0, true); // Ostarm
    if (spec.armW) stripes(ox - 2.6, 0, true); // Westarm
    stripes(0, oz + ROAD + 2.6, false); // Südarm
    if (spec.armN) stripes(0, oz - 2.6, false); // Nordarm
    const lane = ROAD * 0.425; // Haltelinie über eine Fahrbahnhälfte
    put(paint, 0.4, 0.012, lane, ox + ROAD + 5.0, 0.044, oz + ROAD * 0.25 + lane / 2);
    if (spec.armW) put(paint, 0.4, 0.012, lane, ox - 5.0, 0.044, oz + ROAD * 0.75);
    put(paint, lane, 0.012, 0.4, ox + ROAD * 0.75, 0.044, oz + ROAD + 5.0);
    if (spec.armN) put(paint, lane, 0.012, 0.4, ox + ROAD * 0.25, 0.044, oz - 5.0);
  }

  // Bordsteine: helle Kante zwischen Straße und Gehweg
  const len = CHUNK - ROAD;
  if (spec.roadH) put(curb, len, 0.17, 0.14, ox + ROAD + len / 2, 0.085, oz + ROAD + 0.07);
  if (spec.roadS) put(curb, len, 0.17, 0.14, ox + ROAD + len / 2, 0.085, oz + CHUNK - 0.07);
  if (spec.roadV) put(curb, 0.14, 0.17, len - 2 * SIDEWALK, ox + ROAD + 0.07, 0.085, oz + ROAD + SIDEWALK + (len - 2 * SIDEWALK) / 2);
  if (spec.roadE) put(curb, 0.14, 0.17, len - 2 * SIDEWALK, ox + CHUNK - 0.07, 0.085, oz + ROAD + SIDEWALK + (len - 2 * SIDEWALK) / 2);
  // Fase und Rinne: helle Oberkante auf dem Bordstein, dunkle Rinne davor
  const lip = M.prop(0xd2cec2), gutter = M.prop(0x25252a);
  if (spec.roadH) {
    put(lip, len, 0.012, 0.16, ox + ROAD + len / 2, 0.171, oz + ROAD + 0.08);
    put(gutter, len, 0.006, 0.12, ox + ROAD + len / 2, 0.05, oz + ROAD - 0.06);
  }
  if (spec.roadS) {
    put(lip, len, 0.012, 0.16, ox + ROAD + len / 2, 0.171, oz + CHUNK - 0.08);
    put(gutter, len, 0.006, 0.12, ox + ROAD + len / 2, 0.05, oz + CHUNK + 0.06);
  }
  const sideLen = len - 2 * SIDEWALK, sideMid = oz + ROAD + SIDEWALK + sideLen / 2;
  if (spec.roadV) {
    put(lip, 0.16, 0.012, sideLen, ox + ROAD + 0.08, 0.171, sideMid);
    put(gutter, 0.12, 0.006, sideLen, ox + ROAD - 0.06, 0.05, sideMid);
  }
  if (spec.roadE) {
    put(lip, 0.16, 0.012, sideLen, ox + CHUNK - 0.08, 0.171, sideMid);
    put(gutter, 0.12, 0.006, sideLen, ox + CHUNK + 0.06, 0.05, sideMid);
  }

  // Gehwegplatten: Dehnungsfugen quer alle 2 m und eine Längsfuge in der Mitte
  const joint = M.prop(0x6a6861);
  const jx0 = spec.roadV ? ox + ROAD : ox;
  const jz0 = spec.roadH ? oz + ROAD + SIDEWALK : oz, jz1 = spec.roadS ? oz + CHUNK - SIDEWALK : oz + CHUNK;
  const slabsH = (zc: number) => {
    for (let x = jx0 + 1; x < ox + CHUNK; x += 2) put(joint, 0.03, 0.006, SIDEWALK, x, 0.1425, zc);
    put(joint, ox + CHUNK - jx0, 0.006, 0.025, (jx0 + ox + CHUNK) / 2, 0.1425, zc);
  };
  const slabsV = (xc: number) => {
    for (let z = jz0 + 1; z < jz1; z += 2) put(joint, SIDEWALK, 0.006, 0.03, xc, 0.1425, z);
    put(joint, 0.025, 0.006, jz1 - jz0, xc, 0.1425, (jz0 + jz1) / 2);
  };
  if (spec.roadH) slabsH(oz + ROAD + SIDEWALK / 2);
  if (spec.roadS) slabsH(oz + CHUNK - SIDEWALK / 2);
  if (spec.roadV) slabsV(ox + ROAD + SIDEWALK / 2);
  if (spec.roadE) slabsV(ox + CHUNK - SIDEWALK / 2);

  // Fahrbahnränder: durchgezogene weiße Linie neben der Rinne
  const ex0 = spec.roadV ? ox + ROAD : ox;
  if (spec.roadH) {
    put(paint, ox + CHUNK - ex0, 0.012, 0.12, (ex0 + ox + CHUNK) / 2, 0.044, oz + ROAD - 0.45);
    put(paint, ox + CHUNK - ex0, 0.012, 0.12, (ex0 + ox + CHUNK) / 2, 0.044, oz + 0.45);
  }

  // Asphalt: Flicken, Risse, Schlaglöcher, Kanaldeckel
  const onRoad = () => {
    if (spec.roadH && (!spec.roadV || r() < 0.5)) return { x: ox + 14 + r() * (CHUNK - 18), z: oz + 0.8 + r() * (ROAD - 1.6) };
    return { x: ox + 0.8 + r() * (ROAD - 1.6), z: oz + 14 + r() * (CHUNK - 18) };
  };
  const hasRoad = spec.roadH || spec.roadV;
  for (let i = 0; hasRoad && i < 9; i++) {
    const p = onRoad();
    put(dark, 1.4 + r() * 2.2, 0.01, 0.8 + r() * 1.3, p.x, 0.046, p.z, r() < 0.5 ? 0 : Math.PI / 2);
  }
  for (let i = 0; hasRoad && i < 14; i++) {
    const p = onRoad();
    put(dark, 1.2 + r() * 3, 0.012, 0.035, p.x, 0.05, p.z, r() * Math.PI);
  }
  for (let i = 0; hasRoad && i < 3; i++) {
    const p = onRoad();
    const rr = 0.3 + r() * 0.3;
    put(dark, rr * 2, 0.014, rr * 1.4, p.x, 0.052, p.z, r() * Math.PI);
  }
  const manholes: THREE.Mesh[] = [];
  for (let i = 0; hasRoad && i < 2; i++) {
    const p = onRoad();
    const m = new THREE.Mesh(cylSmall, M.metal);
    m.scale.set(0.9, 0.025, 0.9);
    m.position.set(p.x, 0.05, p.z);
    m.receiveShadow = true;
    manholes.push(m);
  }
  add(group, ...manholes);
  // Gullys am Bordstein
  for (let i = 0; spec.roadH && i < 4; i++) {
    const x = ox + 14 + r() * (CHUNK - 18);
    put(dark, 0.9, 0.02, 0.3, x, 0.052, r() < 0.5 ? oz + ROAD - 0.2 : oz + 0.2);
    for (let k = 0; k < 4; k++) put(stain, 0.04, 0.022, 0.3, x - 0.3 + k * 0.2, 0.053, oz + ROAD - 0.2);
  }

  // Gehwege: abgenutzte Platten, Flecken, Risse, Moos – nicht überall gleich
  const walkSides = [spec.roadH, spec.roadS, spec.roadV, spec.roadE].map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const onWalk = () => {
    const side = walkSides[Math.floor(r() * walkSides.length)];
    const t = 14 + r() * (CHUNK - 18);
    if (side === 0) return { x: ox + t, z: oz + ROAD + 0.4 + r() * (SIDEWALK - 0.8) };
    if (side === 1) return { x: ox + t, z: oz + CHUNK - SIDEWALK + 0.4 + r() * (SIDEWALK - 0.8) };
    if (side === 2) return { x: ox + ROAD + 0.4 + r() * (SIDEWALK - 0.8), z: oz + 14 + r() * (CHUNK - 18) };
    return { x: ox + CHUNK - SIDEWALK + 0.4 + r() * (SIDEWALK - 0.8), z: oz + 14 + r() * (CHUNK - 18) };
  };
  for (let i = 0; walkSides.length && i < 26; i++) {
    const p = onWalk();
    put(r() < 0.6 ? stain : paint, 0.8 + r() * 1.2, 0.006, 0.6 + r() * 0.9, p.x, 0.142, p.z, r() < 0.5 ? 0 : Math.PI / 2);
  }
  for (let i = 0; walkSides.length && i < 18; i++) {
    const p = onWalk();
    put(dark, 0.8 + r() * 1.4, 0.008, 0.03, p.x, 0.144, p.z, r() * Math.PI);
  }
  for (let i = 0; walkSides.length && i < 9; i++) {
    const p = onWalk();
    put(moss, 0.4 + r() * 0.7, 0.01, 0.2 + r() * 0.3, p.x, 0.145, p.z, r() * Math.PI);
  }

  for (const [mat, list] of items) {
    const im = instanced(unit, mat, list, false);
    if (im) add(group, im);
  }

  // Straßenmöbel auf dem Gehweg zur Straße
  const slots = [20, 29, 38, 47, 56].sort(() => r() - 0.5);
  const furnitureAt = (i: number) => ({ x: ox + slots[i] + (r() - 0.5), z: oz + ROAD + 0.9 });
  const hyd = furnitureAt(0);
  if (spec.roadH && r() < 0.8) {
    const g = new THREE.Group();
    g.position.set(hyd.x, 0.14, hyd.z);
    const bodyM = M.prop(0xb02a22);
    const body = new THREE.Mesh(cylSmall, bodyM);
    body.scale.set(0.26, 0.62, 0.26);
    body.position.y = 0.31;
    const cap = new THREE.Mesh(cylSmall, bodyM);
    cap.scale.set(0.32, 0.08, 0.32);
    cap.position.y = 0.66;
    const top = new THREE.Mesh(cylSmall, M.prop(0x8a1f19));
    top.scale.set(0.14, 0.1, 0.14);
    top.position.y = 0.74;
    for (const sx of [-1, 1]) {
      const n = new THREE.Mesh(cylSmall, M.prop(0xc8c8c0));
      n.scale.set(0.1, 0.16, 0.1);
      n.rotation.z = Math.PI / 2;
      n.position.set(sx * 0.17, 0.5, 0);
      g.add(n);
    }
    g.add(body, cap, top);
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    group.add(g);
    colliders.push({ x: hyd.x, z: hyd.z, w: 0.4, d: 0.4 });
  }
  const bin = furnitureAt(1);
  if (spec.roadH && r() < 0.75) {
    const m = new THREE.Mesh(cylSmall, M.prop(0x2f4a3a));
    m.scale.set(0.5, 0.85, 0.5);
    m.position.set(bin.x, 0.14 + 0.425, bin.z);
    const lid = new THREE.Mesh(cylSmall, M.prop(0x20332a));
    lid.scale.set(0.54, 0.06, 0.54);
    lid.position.set(bin.x, 0.14 + 0.88, bin.z);
    m.castShadow = lid.castShadow = true;
    add(group, m, lid);
    colliders.push({ x: bin.x, z: bin.z, w: 0.55, d: 0.55 });
  }
  const mail = furnitureAt(2);
  if (spec.roadH && r() < 0.6) {
    add(group, box(M.metal, 0.08, 1.0, 0.08, mail.x, 0.64, mail.z), box(M.prop(0x2a4f8a), 0.5, 0.42, 0.34, mail.x, 1.3, mail.z));
    colliders.push({ x: mail.x, z: mail.z, w: 0.3, d: 0.3 });
  }

  // Grasbüschel auf den Grundstücken (nicht auf Gebäuden, Wegen, Beeten)
  const tufts: Inst[] = [];
  const greens = [0x5f8a45, 0x6d9a4c, 0x4f7a3c, 0x7aa352, 0x86a95a];
  const inB = (b: Box, x: number, z: number, pad: number) => Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad;
  const tall: Inst[] = [], stems: Inst[] = [], heads: Inst[] = [];
  const blooms = [0xf4f1e6, 0xf3d84a, 0xe58aae, 0xb58ae0, 0xe8664a, 0x8ab4ee];
  const free = (x: number, z: number): boolean =>
    !spec.buildings.some((b) => inB(b, x, z, 0.9) || (b.path && inB(b.path, x, z, 0.5)) || (b.driveway && inB(b.driveway, x, z, 0.5)) || (b.kind === 'industry' && b.lot && inB({ x: b.lot.x, z: b.lot.z, w: b.lot.w, d: b.lot.d }, x, z, 0)))
    && !spec.beds.some((b) => inB(b, x, z, 0.4)) && !spec.hedges.some((b) => inB(b, x, z, 0.3));
  const span = CHUNK - ROAD - 2 * SIDEWALK - 1;
  for (let i = 0; i < 1100 && tufts.length < 520; i++) {
    const x = ox + ROAD + SIDEWALK + 0.5 + r() * span, z = oz + ROAD + SIDEWALK + 0.5 + r() * span;
    if (!free(x, z)) continue;
    const s = 0.7 + r() * 0.9, col = greens[Math.floor(r() * greens.length)];
    if (r() < 0.16) {
      const ts = 0.8 + r() * 0.7;
      tall.push({ m: mat4(x, 0, z, r() * 6.28, ts, ts * (0.8 + r() * 0.5), ts), color: col });
    } else {
      tufts.push({ m: mat4(x, 0, z, r() * 6.28, s, s * (0.7 + r() * 0.7), s), color: col });
    }
    // Wildblumen und Klee in kleinen Gruppen
    if (r() < 0.07) {
      const c = blooms[Math.floor(r() * blooms.length)];
      for (let k = 0, n = 2 + Math.floor(r() * 4); k < n; k++) {
        const fx = x + (r() - 0.5) * 1.1, fz = z + (r() - 0.5) * 1.1;
        if (!free(fx, fz)) continue;
        const fs = 0.8 + r() * 0.6;
        stems.push({ m: mat4(fx, 0, fz, r() * 6.28, fs, fs, fs) });
        heads.push({ m: stems[stems.length - 1].m, color: r() < 0.8 ? c : blooms[Math.floor(r() * blooms.length)] });
      }
    }
  }
  // Unkraut in den Fugen und am Bordstein des Gehwegs
  for (let i = 0; walkSides.length && i < 26; i++) {
    const p = onWalk();
    const s = 0.4 + r() * 0.5;
    tufts.push({ m: mat4(p.x, 0.14, p.z, r() * 6.28, s, s, s), color: greens[Math.floor(r() * greens.length)] });
  }
  for (const [geo, list] of [[tuftGeo, tufts], [tallGrassGeo, tall]] as const) {
    const tm = instanced(geo, M.tuft, list, false);
    if (tm) {
      tm.onBeforeRender = grassWind;
      add(group, tm);
    }
  }
  const fs = instanced(flowerStemGeo, M.tuft, stems, false);
  const fh = instanced(flowerGeo, M.flower, heads, false);
  if (fs) fs.onBeforeRender = grassWind;
  add(group, fs, fh);
}

/** Weicher Auslauf des Seitenstreifens ins Gras (Vertex-Alpha) */
let vergeMat: THREE.MeshStandardMaterial | null = null;

/** Kurvige Straßen, Rampen, Landstraßen, Autobahn und Gleise als Bänder entlang der Pfade. */
function buildPaths(spec: ChunkSpec, group: THREE.Group, ox: number, oz: number): void {
  const M = mats();
  const own = (x: number, z: number) => x >= ox && x < ox + CHUNK && z >= oz && z < oz + CHUNK;
  if (!vergeMat) {
    vergeMat = M.floorDirt.clone();
    vergeMat.vertexColors = true;
    vergeMat.transparent = true;
    vergeMat.depthWrite = false;
  }
  const strip = (
    sl: ChunkSpec['paths'][number], a: number, b: number, y: number, mat: THREE.Material, tileU: number, tileV: number, vShift = 0, taper?: { a: number; b: number },
    extra?: { wobble?: { amp: number; phase: number }; fade?: 'A' | 'B' },
  ) => {
    const g = stripGeo(sl, a, b, { y, tileU, tileV, vShift, own, taper, ...extra });
    if (!g) return;
    const m = new THREE.Mesh(g, mat);
    m.userData.ownGeo = true;
    m.receiveShadow = true;
    group.add(m);
  };
  const lineMat = M.prop(0xe6e6de);
  /** Erdstreifen mit unregelmäßiger Kante plus weich auslaufender Rand ins Gras, beidseitig */
  const verge = (sl: ChunkSpec['paths'][number], out: number, taper?: { a: number; b: number }) => {
    const seed = sl.path.id.length * 1.3 + (sl.path.id.charCodeAt(1) || 0);
    const wobble = { amp: 0.65, phase: seed };
    strip(sl, out, -out, 0.012, M.floorDirt, 4, 4, 0, taper, { wobble });
    strip(sl, out + 1.7, out, 0.011, vergeMat!, 4, 4, 0, taper, { wobble, fade: 'A' });
    strip(sl, -out, -(out + 1.7), 0.011, vergeMat!, 4, 4, 0, taper, { wobble, fade: 'B' });
  };
  const guards: Inst[] = [], posts: Inst[] = [], medians: Inst[] = [], rails: Inst[] = [], sleepers: Inst[] = [];
  for (const sl of spec.paths) {
    const p = sl.path;
    const w = p.width;
    switch (p.kind) {
      case 'highway': {
        verge(sl, w / 2 + 2.6);
        strip(sl, w / 2, -w / 2, 0.03, M.highway, 8, HIGHWAY_WIDTH, 0.5);
        for (const side of [-1, 1] as const) {
          const gaps = (p.gaps ?? []).filter((g) => g.side === side);
          const skip = (s: number) => gaps.some((g) => s >= g.s0 && s <= g.s1);
          for (const e of edgePoints(sl, side * (w / 2 + 0.4), 4.2, own, skip)) {
            guards.push({ m: mat4(e.x, 0.55, e.z, e.rot) });
            posts.push({ m: mat4(e.x, 0.4, e.z, e.rot) });
          }
        }
        for (const e of edgePoints(sl, 0, 4.2, own)) medians.push({ m: mat4(e.x, 0.45, e.z, e.rot) });
        break;
      }
      case 'ramp':
      case 'service': {
        // Einbahnstraße ohne Mittellinie, mit Randlinien; Anfang bzw. Ende läuft spitz in die Autobahnspur aus
        verge(sl, w / 2 + 1.4, p.taper);
        strip(sl, w / 2, -w / 2, 0.034, M.ramp, 8, 8, 0, p.taper);
        strip(sl, w / 2 - 0.22, w / 2 - 0.36, 0.0365, lineMat, 6, 0.14, 0, p.taper);
        strip(sl, -(w / 2 - 0.22), -(w / 2 - 0.36), 0.0365, lineMat, 6, 0.14, 0, p.taper);
        break;
      }
      case 'country':
        verge(sl, w / 2 + 1.6);
        strip(sl, w / 2, -w / 2, 0.022, M.road, 8, w, 0.5);
        break;
      case 'boulevard':
        strip(sl, w / 2 + 2, -(w / 2 + 2), 0.045, M.paving, 2, 2);
        strip(sl, w / 2, -w / 2, 0.05, M.road, 8, w, 0.5);
        break;
      case 'rail': {
        strip(sl, w / 2, -w / 2, 0.025, M.gravel, 4, 4);
        for (const off of [-2.5, 2.5]) {
          for (const s of [-0.72, 0.72]) for (const e of edgePoints(sl, off + s, 2.1, own)) rails.push({ m: mat4(e.x, 0.2, e.z, e.rot) });
          for (const e of edgePoints(sl, off, 0.8, own)) sleepers.push({ m: mat4(e.x, 0.09, e.z, e.rot) });
        }
        break;
      }
    }
  }
  add(
    group,
    instanced(guardGeo, M.metal, guards), instanced(guardPostGeo, M.metal, posts), instanced(medianGeo, M.concrete, medians),
    instanced(railGeo, M.rail, rails, false), instanced(sleeperGeo, M.sleeper, sleepers, false),
  );
}
