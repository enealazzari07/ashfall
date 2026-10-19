import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  Box, CHUNK, Car, ChunkSpec, HIGHWAY_WIDTH, ROAD, SIDEWALK, Wagon, chunkSeed, landOf, rng,
} from './CityGenerator';
import { Inst, instanced, makeBox, mat4, planeXZ } from '../render/geo';
import { DecalName, mats, windTime } from '../render/Materials';
import { URBAN, urbanClone } from '../render/UrbanAssets';
import { bushGeometry } from '../render/Trees';
import { buildTrees } from '../render/TreeMesh';
import { edgePoints, lanePose, stripGeo } from '../render/RoadRibbon';
import { edgeRoad, poseAt, stationsNear } from './WorldMap';
import { Livery, carGeos, carMats, decalGeo, modelOf, shadowGeo, wheelSpots } from '../render/CarModel';

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
  /** Kontaktschatten, eine Instanz je Auto in der Reihenfolge von `list` */
  shadow: THREE.InstancedMesh | null;
}

const stallLineGeo = new THREE.BoxGeometry(0.1, 0.01, 5.2);
const stallPaint = new THREE.MeshStandardMaterial({ color: 0xe8e6dc, roughness: 0.9 });
const groundGeo = planeXZ(CHUNK, CHUNK, 8, 8);
/** Fläche 1 x 1 m in XZ (UV 0..1, v quer zur x-Achse): Straßen, Markierungen und Aufleger, per Instanz skaliert */
const unitPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
/** Gehwegstreifen 1 x 0,14 x 1 m, per Mesh skaliert (Textur in Weltkoordinaten, daher keine Verzerrung) */
const walkGeo = new THREE.BoxGeometry(1, 0.14, 1);
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

  // Straßen im Raster: Asphalt, Markierungen, Fahrspuren; in der Stadt Bordsteine, Rinnen und Gehwege
  gridRoads(spec, cx, cz, group);

  // Gassen: vier Meter breit, enden im Hinterhof
  const alley = (w: number, d: number, x: number, z: number) => {
    const m = new THREE.Mesh(makeBox(w, 0.03, d, 4, 4), M.street);
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
    const m = new THREE.Mesh(makeBox(pd.w, 0.05, pd.d, 6, 6), M.street);
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

  // --- Raststätten: Zufahrten, Tankdächer, Zapfsäulen, Preismasten, Picknicktische, Mülleimer ---
  stationParts(spec, group, colliders);

  // --- Straßenmarkierungen, Bordsteine, Gullys, Risse, Straßenmöbel, Gras ---
  if (spec.land === 'town') streetDetails(spec, cx, cz, group, colliders);

  // --- Autos --- (einsteigbare Autos merken sich ihre Instanzen, siehe ChunkManager.takeCar)
  interface Grp { paint: Inst[]; glass: Inst[]; trim: Inst[]; wheels: Inst[] }
  const groups = new Map<number, Grp>();
  const built: Car[] = [];
  const slot: { model: number; i: number; dkey: string | null; di: number }[] = [];
  const decalInst = new Map<string, { model: number; livery: Livery; tier: number; list: Inst[] }>();
  const carBoxes: Box[] = [];
  const shadows: Inst[] = [];
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
    shadows.push({ m: mat4(c.x, 0.06, c.z, c.rot, md.len + 0.6, 1, md.W + 0.5) });
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
  const shadowMesh = instanced(shadowGeo, CM.shadow, shadows, false);
  if (shadowMesh) add(group, shadowMesh);
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
  group.userData.cars = { list: built, boxes: carBoxes, slot, groups: carGroups, decals, shadow: shadowMesh } as CarSet;
}

/** Liegt an der Nordwest-Ecke von Chunk (a,b) eine Kreuzung oder Einmündung? */
const junctionAt = (a: number, b: number): boolean =>
  (edgeRoad('N', a, b) || edgeRoad('N', a - 1, b)) && (edgeRoad('W', a, b) || edgeRoad('W', a, b - 1));
/** Hat diese Kreuzung Zebrastreifen und Haltelinien (wie in streetDetails gezeichnet)? */
const crossingAt = (a: number, b: number): boolean => landOf(a, b) === 'town' && edgeRoad('N', a, b) && edgeRoad('W', a, b);

/** Bordsteinprofil (quer, Straßenseite bei 0): senkrechte Ansicht, Fase, Oberseite */
const CURB_PROFILE: [number, number][] = [[0, 0], [0, 0.115], [0.035, 0.15], [0.18, 0.15]];

/** Sammelt Bordsteine eines Chunks in einer Geometrie (UV in Metern: u längs, v übers Profil). */
class CurbBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];

  /**
   * Bordstein entlang einer Kante: (x, z) Startpunkt an der Straßenkante, (dx, dz) Laufrichtung,
   * (sx, sz) Querrichtung von der Straße zum Gehweg (beides Einheitsvektoren), len Länge in Metern.
   */
  add(x: number, z: number, dx: number, dz: number, sx: number, sz: number, len: number): void {
    const P = CURB_PROFILE;
    const W = (s: number, y: number, t: number): [number, number, number] => [x + dx * t + sx * s, y, z + dz * t + sz * s];
    let v = 0;
    for (let k = 0; k < P.length - 1; k++) {
      const [s0, y0] = P[k], [s1, y1] = P[k + 1];
      const segLen = Math.hypot(s1 - s0, y1 - y0);
      // Normale im Profil: (−dy, ds) → Welt
      const ns = -(y1 - y0) / segLen, ny = (s1 - s0) / segLen;
      const n: [number, number, number] = [sx * ns, ny, sz * ns];
      const A = W(s0, y0, 0), B = W(s0, y0, len), C = W(s1, y1, len), D = W(s1, y1, 0);
      const v1 = v + segLen / 0.3;
      this.quad(A, B, C, D, n, [0, v], [len, v], [len, v1], [0, v1]);
      v = v1;
    }
    // Stirnseiten
    const cap = (t: number, sign: number) => {
      const poly = [...P, [0.18, 0] as [number, number]];
      const n: [number, number, number] = [dx * sign, 0, dz * sign];
      for (let i = 1; i < poly.length - 1; i++) {
        const tri = [poly[0], poly[i], poly[i + 1]];
        const pts = tri.map(([s, y]) => W(s, y, t));
        this.tri(pts[0], pts[1], pts[2], n, tri.map(([s, y]) => [s / 0.3, y / 0.3] as [number, number]));
      }
    };
    cap(0, -1);
    cap(len, 1);
  }

  private tri(a: number[], b: number[], c: number[], n: [number, number, number], uv: [number, number][]): void {
    // Wicklung an der gewünschten Normale ausrichten
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0;
    const order = flip ? [0, 2, 1] : [0, 1, 2];
    const p = [a, b, c];
    for (const i of order) {
      this.pos.push(...p[i]);
      this.nor.push(...n);
      this.uv.push(...uv[i]);
    }
  }

  private quad(a: number[], b: number[], c: number[], d: number[], n: [number, number, number], ua: [number, number], ub: [number, number], uc: [number, number], ud: [number, number]): void {
    this.tri(a, b, c, n, [ua, ub, uc]);
    this.tri(a, c, d, n, [ua, uc, ud]);
  }

  build(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    return g;
  }
}

const WHITE_PAINT = 0xeeece4, YELLOW_PAINT = 0xe2b440;

/**
 * Straßen im Chunk-Raster: Asphaltflächen (Textur in Weltkoordinaten, daher nahtlos), Markierungen als eigene Flächen
 * (enden vor Kreuzungen und Zebrastreifen), abgefahrene Spuren; in der Stadt Gehwege, Bordsteine mit Fase und Pflasterrinnen.
 */
function gridRoads(spec: ChunkSpec, cx: number, cz: number, group: THREE.Group): void {
  const M = mats();
  const ox = cx * CHUNK, oz = cz * CHUNK;
  const tr = rng((chunkSeed(cx, cz) ^ 0x7ac3b1d5) >>> 0);
  const plane = (mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, y: number) => {
    const m = mesh(unitPlane, mat, (x0 + x1) / 2, y, (z0 + z1) / 2);
    m.scale.set(x1 - x0, 1, z1 - z0);
    group.add(m);
  };
  // Landstraßen: schmaler Asphalt (7,5 m) auf einem Schotterstreifen, ohne Gehweg; an der Stadt voll breit
  const dirtStrip = (x0: number, z0: number, x1: number, z1: number) => {
    const m = new THREE.Mesh(makeBox(x1 - x0, 0.02, z1 - z0, 4, 4), M.floorDirt);
    m.userData.ownGeo = true;
    m.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2);
    m.receiveShadow = true;
    group.add(m);
  };
  const halfH = spec.urbanH ? ROAD / 2 : ROAD * 0.375, halfV = spec.urbanV ? ROAD / 2 : ROAD * 0.375;
  const cH = oz + ROAD / 2, cV = ox + ROAD / 2;
  if (spec.roadH) {
    plane(M.street, ox, cH - halfH, ox + CHUNK, cH + halfH, 0.02);
    if (!spec.urbanH) dirtStrip(ox, oz - 0.8, ox + CHUNK, oz + ROAD + 0.8);
  }
  // Die Nord-Süd-Straße beginnt in der Kreuzungsmitte (überdeckt dort dieselbe Textur), sonst an der Chunk-Kante
  const vz0 = spec.roadH ? cH : oz;
  if (spec.roadV) {
    plane(M.street, cV - halfV, vz0, cV + halfV, oz + CHUNK, 0.03);
    if (!spec.urbanV) dirtStrip(ox - 0.8, vz0, ox + ROAD + 0.8, oz + CHUNK);
  }

  // Enden von Landstraßen und Rampen, die an der Stadtstraße beginnen (p: Endpunkt, n: Punkt etwas weiter auf dem Pfad)
  const joins = spec.paths
    .filter((q) => q.path.kind === 'country' || q.path.kind === 'ramp' || q.path.kind === 'lane')
    .flatMap((q) => {
      const pts = q.path.pts, last = pts.length - 1;
      const out: { p: { x: number; z: number }; n: { x: number; z: number }; w: number }[] = [];
      if (q.i0 === 0) out.push({ p: pts[0], n: pts[Math.min(3, last)], w: q.path.width });
      if (q.i1 === last) out.push({ p: pts[last], n: pts[Math.max(0, last - 3)], w: q.path.width });
      return out;
    });
  // Das Stück des Pfades, das auf der Stadtstraße liegt (samt seiner Randlinien), mit Asphalt abdecken
  for (const j of joins) {
    const inH = spec.roadH && j.p.x >= ox && j.p.x < ox + CHUNK && Math.abs(j.p.z - cH) < halfH;
    const inV = spec.roadV && j.p.z >= oz && j.p.z < oz + CHUNK && Math.abs(j.p.x - cV) < halfV;
    if (inH) {
      const sd = Math.sign(j.n.z - j.p.z), edge = cH + sd * halfH;
      const a = Math.min(edge, j.p.z - sd * 0.6), b = Math.max(edge, j.p.z - sd * 0.6);
      plane(M.street, j.p.x - j.w / 2 - 1, a, j.p.x + j.w / 2 + 1, b, 0.0395);
    } else if (inV) {
      const sd = Math.sign(j.n.x - j.p.x), edge = cV + sd * halfV;
      const a = Math.min(edge, j.p.x - sd * 0.6), b = Math.max(edge, j.p.x - sd * 0.6);
      plane(M.street, a, j.p.z - j.w / 2 - 1, b, j.p.z + j.w / 2 + 1, 0.0395);
    }
  }

  // --- Markierungen ---
  const paint: Inst[] = [], tracks: Inst[] = [];
  const line = (x0: number, z0: number, x1: number, z1: number, color: number, y = 0.045) => {
    if (x1 - x0 <= 0.01 || z1 - z0 <= 0.01) return;
    paint.push({ m: mat4((x0 + x1) / 2, y, (z0 + z1) / 2, 0, x1 - x0, 1, z1 - z0), color });
  };
  /** Markierung entlang einer Achse: a0..a1 längs, Querlage c ± w/2; `alongX` legt die Achse fest */
  const run = (alongX: boolean, a0: number, a1: number, c: number, w: number, color: number) =>
    alongX ? line(a0, c - w / 2, a1, c + w / 2, color) : line(c - w / 2, a0, c + w / 2, a1, color);
  const dashed = (alongX: boolean, a0: number, a1: number, c: number, w: number, color: number) => {
    // weltfest ausgerichtet (Periode 8 m: 3 m Strich, 5 m Lücke), damit die Striche über Chunkgrenzen weiterlaufen
    for (let s = Math.floor(a0 / 8) * 8; s < a1; s += 8) run(alongX, Math.max(a0, s), Math.min(a1, s + 3), c, w, color);
  };
  const cut = (junction: boolean, crossing: boolean, centre: boolean) => (!junction ? 0 : crossing ? (centre ? 5.3 : 4.2) : centre ? 0.8 : 0.4);
  const marks = (alongX: boolean, a0: number, a1: number, c: number, half: number, urban: boolean, jA: [boolean, boolean], jB: [boolean, boolean], nearSquare: number) => {
    // Mittellinie: in der Stadt doppelt durchgezogen, auf dem Land gestrichelt
    const m0 = a0 + (jA[0] ? nearSquare : 0) + cut(jA[0], jA[1], true), m1 = a1 - cut(jB[0], jB[1], true);
    if (urban) {
      run(alongX, m0, m1, c - 0.1, 0.1, YELLOW_PAINT);
      run(alongX, m0, m1, c + 0.1, 0.1, YELLOW_PAINT);
    } else {
      dashed(alongX, m0, m1, c, 0.13, YELLOW_PAINT);
    }
    // Randlinien neben Rinne bzw. Bankett, unterbrochen, wo eine Landstraße oder Rampe einmündet
    const e0 = a0 + (jA[0] ? nearSquare : 0) + cut(jA[0], jA[1], false), e1 = a1 - cut(jB[0], jB[1], false);
    const inset = urban ? 0.55 : 0.3;
    for (const sd of [-1, 1]) {
      const gaps = joins
        .filter((j) => {
          const along = alongX ? j.p.x : j.p.z, perp = alongX ? j.p.z : j.p.x, dir = (alongX ? j.n.z : j.n.x) - perp;
          return along > a0 - j.w && along < a1 + j.w && Math.abs(perp - c) < half + 3 && Math.sign(dir) === sd;
        })
        .map((j) => {
          const along = alongX ? j.p.x : j.p.z;
          return [along - j.w / 2 - 2.5, along + j.w / 2 + 2.5] as const;
        })
        .sort((p0, p1) => p0[0] - p1[0]);
      let from = e0;
      for (const [g0, g1] of gaps) {
        run(alongX, from, Math.min(e1, g0), c + sd * (half - inset), 0.12, WHITE_PAINT);
        from = Math.max(from, g1);
      }
      run(alongX, from, e1, c + sd * (half - inset), 0.12, WHITE_PAINT);
    }
    // Fahrspuren: abgefahrene Bänder je Rad, in Abschnitten mit wechselnder Stärke, Breite und Lage (nie überall gleich)
    for (const lane of [-1, 1]) {
      for (const wh of [-0.78, 0.78]) {
        for (let a = m0 + tr() * 6; a < m1 - 2; ) {
          const len = Math.min(m1 - a, 5 + tr() * 16);
          if (tr() < 0.72) {
            const off = c + lane * half * 0.5 + wh + (tr() - 0.5) * 0.35;
            const mid = a + len / 2, w = 0.5 + tr() * 0.45;
            const tone = [0x141416, 0x1d1d20, 0x2a2a2d, 0x3a3a3d][Math.floor(tr() * 4)];
            tracks.push({ m: alongX ? mat4(mid, 0.038, off, 0, len, 1, w) : mat4(off, 0.038, mid, Math.PI / 2, len, 1, w), color: tone });
          }
          a += len + tr() * 8;
        }
      }
    }
  };
  const jHere = junctionAt(cx, cz), xHere = crossingAt(cx, cz);
  if (spec.roadH) marks(true, ox, ox + CHUNK, cH, halfH, spec.urbanH, [jHere, xHere], [junctionAt(cx + 1, cz), crossingAt(cx + 1, cz)], ROAD);
  if (spec.roadV) {
    // beginnt die Straße an der Chunk-Kante ohne Kreuzung, laufen die Linien durch
    marks(false, oz, oz + CHUNK, cV, halfV, spec.urbanV, [jHere, xHere], [junctionAt(cx, cz + 1), crossingAt(cx, cz + 1)], ROAD);
  }
  // Zebrastreifen und Haltelinien an der Kreuzung (Ecke des Chunks)
  if (xHere) {
    const stripes = (cxm: number, czm: number, alongX: boolean) => {
      for (let k = 0; k < ROAD - 1; k++) {
        if (alongX) line(cxm - 1.4, oz + 0.65 + k, cxm + 1.4, oz + 1.15 + k, WHITE_PAINT, 0.046);
        else line(ox + 0.65 + k, czm - 1.4, ox + 1.15 + k, czm + 1.4, WHITE_PAINT, 0.046);
      }
    };
    stripes(ox + ROAD + 2.6, 0, true); // Ostarm
    if (spec.armW) stripes(ox - 2.6, 0, true); // Westarm
    stripes(0, oz + ROAD + 2.6, false); // Südarm
    if (spec.armN) stripes(0, oz - 2.6, false); // Nordarm
    // Haltelinien über die Fahrbahnhälfte, die auf die Kreuzung zufährt (Rechtsverkehr)
    const lane = ROAD * 0.425;
    line(ox + ROAD + 4.8, cH - 0.25 - lane, ox + ROAD + 5.2, cH - 0.25, WHITE_PAINT);
    if (spec.armW) line(ox - 5.2, cH + 0.25, ox - 4.8, cH + 0.25 + lane, WHITE_PAINT);
    line(cV + 0.25, oz + ROAD + 4.8, cV + 0.25 + lane, oz + ROAD + 5.2, WHITE_PAINT);
    if (spec.armN) line(cV - 0.25 - lane, oz - 5.2, cV - 0.25, oz - 4.8, WHITE_PAINT);
  }
  add(group, instanced(unitPlane, M.decal('track'), tracks, false), instanced(unitPlane, M.markPaint, paint, false));

  // --- Gehwege, Bordsteine und Pflasterrinnen (nur in der Stadt, nur an vorhandenen Straßen) ---
  if (spec.land !== 'town') return;
  const x0 = spec.roadV ? ox + ROAD : ox, x1 = ox + CHUNK;
  const z0 = spec.roadH ? oz + ROAD : oz, z1 = oz + CHUNK;
  const walk = (ax: number, az: number, bx: number, bz: number) => {
    const m = mesh(walkGeo, M.sidewalk, (ax + bx) / 2, 0.07, (az + bz) / 2);
    m.scale.set(bx - ax, 1, bz - az);
    group.add(m);
  };
  if (spec.roadH) walk(x0, oz + ROAD, x1, oz + ROAD + SIDEWALK);
  if (spec.roadS) walk(x0, oz + CHUNK - SIDEWALK, x1, oz + CHUNK);
  const wz0 = spec.roadH ? oz + ROAD + SIDEWALK : oz, wz1 = spec.roadS ? oz + CHUNK - SIDEWALK : oz + CHUNK;
  if (spec.roadV) walk(ox + ROAD, wz0, ox + ROAD + SIDEWALK, wz1);
  if (spec.roadE) walk(ox + CHUNK - SIDEWALK, wz0, ox + CHUNK, wz1);

  // Bordsteine laufen über die ganze Gehwegkante (auch um die Ecke an der Kreuzung); 1 cm vor der Gehwegkante gegen Flimmern
  const curbs = new CurbBuilder();
  const gutter: [number, number, number, number, number][] = [];
  const G = 0.3;
  // Rinnen laufen an Ecken um die Rinnenbreite weiter, damit sich die beiden Richtungen lückenlos treffen
  const gx0 = spec.roadV ? x0 - G : x0, gx1 = spec.roadE ? x1 + G : x1;
  const gz0 = spec.roadH ? z0 - G : z0, gz1 = spec.roadS ? z1 + G : z1;
  if (spec.roadH) {
    curbs.add(x0, oz + ROAD - 0.01, 1, 0, 0, 1, x1 - x0);
    gutter.push([gx0, oz + ROAD - G, gx1, oz + ROAD, 0.027]);
  }
  if (spec.roadS) {
    curbs.add(x1, oz + CHUNK + 0.01, -1, 0, 0, -1, x1 - x0);
    gutter.push([gx0, oz + CHUNK, gx1, oz + CHUNK + G, 0.027]);
  }
  if (spec.roadV) {
    curbs.add(ox + ROAD - 0.01, z1, 0, -1, 1, 0, z1 - z0);
    gutter.push([ox + ROAD - G, gz0, ox + ROAD, gz1, 0.037]);
  }
  if (spec.roadE) {
    curbs.add(ox + CHUNK + 0.01, z0, 0, 1, -1, 0, z1 - z0);
    gutter.push([ox + CHUNK, gz0, ox + CHUNK + G, gz1, 0.037]);
  }
  const cg = curbs.build();
  if (cg) {
    const m = new THREE.Mesh(cg, M.curb);
    m.userData.ownGeo = true;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  for (const [ax, az, bx, bz, y] of gutter) plane(M.gutter, ax, az, bx, bz, y);
}

/** Farbige Teilgeometrie (Vertexfarben, ohne UV) zum Zusammenfügen */
const tint = (g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
  const c = new THREE.Color(hex);
  return colored(g.index ? g.toNonIndexed() : g, c.r, c.g, c.b);
};
const cbox = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number) => tint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
const ccyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, hex: number, seg = 10) => tint(new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z), hex);

/** Zapfsäuleninsel: Betonsockel mit Rammschutz, zwei Säulen mit Anzeige, Schläuchen und Zapfpistolen (entlang z) */
const pumpIslandGeo = (() => {
  const parts: THREE.BufferGeometry[] = [
    cbox(1.2, 0.2, 5.4, 0, 0.1, 0, 0xb8b4aa), // Sockel
    cbox(1.24, 0.04, 5.44, 0, 0.21, 0, 0xd8d4ca), // Kante
  ];
  for (const z of [-2.55, 2.55]) {
    parts.push(ccyl(0.09, 0.09, 0.9, 0, 0.65, z, 0xe0b52c), ccyl(0.095, 0.095, 0.08, 0, 0.75, z, 0x1c1c1e)); // Rammpoller
  }
  for (const z of [-1.2, 1.2]) {
    parts.push(
      cbox(0.5, 1.6, 0.85, 0, 1.0, z, 0xe9e7e0), // Gehäuse
      cbox(0.52, 0.28, 0.87, 0, 1.92, z, 0xb8322a), // Kopf in Markenfarbe
      cbox(0.52, 0.06, 0.87, 0, 1.75, z, 0xf0f0ec),
      cbox(0.54, 0.3, 0.5, 0, 1.4, z, 0x16181c), // Anzeige (beidseitig)
      cbox(0.56, 0.07, 0.36, 0, 1.47, z, 0x8fbf6a),
      cbox(0.56, 0.24, 0.2, 0, 0.75, z - 0.24, 0x2a2b2e), // Zapfpistolen-Halter
      cbox(0.56, 0.24, 0.2, 0, 0.75, z + 0.24, 0x2a2b2e),
    );
    for (const sx of [-1, 1]) {
      // Schlauch: Bogen vom Kopf zum Halter
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx * 0.27, 1.75, z), new THREE.Vector3(sx * 0.42, 1.3, z + 0.1), new THREE.Vector3(sx * 0.36, 0.7, z + 0.05), new THREE.Vector3(sx * 0.29, 0.8, z - 0.24),
      ]);
      parts.push(tint(new THREE.TubeGeometry(curve, 10, 0.022, 5), 0x141416));
    }
  }
  return mergeGeometries(parts)!;
})();

/** Picknicktisch: Tischplatte und zwei Bänke aus Bohlen, Stahlbeine (entlang x) */
const picnicGeo = (() => {
  const wood = 0x8a6a45, plank = 0x7a5c3a, iron = 0x34383c;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) parts.push(cbox(1.9, 0.045, 0.17, 0, 0.75, -0.27 + i * 0.18, i % 2 ? wood : plank));
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 2; i++) parts.push(cbox(1.9, 0.04, 0.14, 0, 0.45, sz * (0.62 + i * 0.15), i ? wood : plank));
  }
  for (const sx of [-0.75, 0.75]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.BoxGeometry(0.05, 0.86, 0.06).rotateX(sz * 0.62).translate(sx, 0.4, sz * 0.36);
      parts.push(tint(leg, iron));
    }
    parts.push(cbox(0.05, 0.05, 1.7, sx, 0.42, 0, iron));
  }
  return mergeGeometries(parts)!;
})();

/** Mülleimer mit Deckel und Einwurf */
const binGeo = mergeGeometries([
  ccyl(0.27, 0.24, 0.85, 0, 0.425, 0, 0x2f4a3a, 14), ccyl(0.3, 0.3, 0.07, 0, 0.88, 0, 0x20332a, 14), ccyl(0.12, 0.12, 0.04, 0, 0.93, 0, 0x16181a, 10),
  cbox(0.3, 0.12, 0.05, 0, 0.72, 0.26, 0x16181a),
])!;

/** Getränkeautomat, Eistruhe und Luftdrucksäule (Front nach +z) */
const vendorGeo = {
  drinks: mergeGeometries([
    cbox(0.95, 1.9, 0.75, 0, 0.95, 0, 0xb8282a), cbox(0.6, 1.2, 0.04, -0.1, 1.15, 0.38, 0x9cc3d8), cbox(0.18, 0.5, 0.04, 0.33, 1.15, 0.38, 0x1a1a1c),
    cbox(0.97, 0.18, 0.77, 0, 1.82, 0, 0xf2f0ea),
  ])!,
  ice: mergeGeometries([
    cbox(1.3, 1.0, 0.75, 0, 0.5, 0, 0xeef3f6), cbox(1.1, 0.35, 0.04, 0, 0.7, 0.38, 0x2a72b8), cbox(1.32, 0.06, 0.77, 0, 1.02, 0, 0xc8ccd0),
  ])!,
  air: mergeGeometries([
    cbox(0.35, 1.3, 0.3, 0, 0.65, 0, 0x2a5aa8), cbox(0.3, 0.25, 0.04, 0, 1.05, 0.16, 0xe8e6de), ccyl(0.2, 0.2, 0.05, 0, 0.03, 0, 0x6a6c70),
    tint(new THREE.TorusGeometry(0.14, 0.018, 5, 14).translate(0, 0.6, 0.18), 0x111113),
  ])!,
};

/** Leitpfosten: weißer Pfosten mit schwarzem Band und Rückstrahler (Front entlang +z) */
const postGeo = mergeGeometries([
  cbox(0.12, 1.0, 0.1, 0, 0.5, 0, 0xeeeeea), cbox(0.125, 0.26, 0.105, 0, 0.85, 0, 0x1a1a1c),
  cbox(0.05, 0.1, 0.11, 0, 0.85, 0, 0xe8902a),
])!;

/** Preismast: zwei Stützen, Schild mit Marke und Preisen (beidseitig), Sockel */
function stationParts(spec: ChunkSpec, group: THREE.Group, colliders: Box[]): void {
  const M = mats();
  for (const a of spec.aprons) {
    const m = mesh(unitPlane, M.street, a.x, 0.016, a.z);
    m.scale.set(a.w, 1, a.d);
    group.add(m);
  }
  for (const c of spec.edgeCovers) {
    const m = mesh(unitPlane, M.street, c.x, c.y, c.z);
    m.scale.set(c.w, 1, c.d);
    m.rotation.y = c.rot;
    group.add(m);
  }
  // Tankdach: weiße Platte mit farbiger Blende, Leuchtfelder unten, Stützen mit Sockelverkleidung
  const roofMat = M.train(0xeceae4), bandMat = M.train(0xb8322a), stripeMat = M.train(0xf4f2ec), pillarMat = M.train(0x9a9ca0);
  const glows: Inst[] = [];
  for (const c of spec.canopies) {
    const y = 5.1;
    add(group, box(roofMat, c.w, 0.6, c.d, c.x, y, c.z));
    for (const [w, d, x, z] of [[c.w + 0.24, 0.12, c.x, c.z - c.d / 2 - 0.06], [c.w + 0.24, 0.12, c.x, c.z + c.d / 2 + 0.06], [0.12, c.d, c.x - c.w / 2 - 0.06, c.z], [0.12, c.d, c.x + c.w / 2 + 0.06, c.z]] as const) {
      add(group, box(bandMat, w, 0.62, d, x, y + 0.02, z), box(stripeMat, w + 0.02, 0.08, d + 0.02, x, y - 0.18, z));
    }
    for (let x = c.x - c.w / 2 + 2; x <= c.x + c.w / 2 - 2; x += 3.2) {
      for (const dz of [-c.d / 4, c.d / 4]) {
        const lamp = new THREE.Mesh(boxGeo, M.lampHead);
        lamp.scale.set(1.8, 0.04, 0.5);
        lamp.position.set(x, y - 0.32, c.z + dz);
        group.add(lamp);
        glows.push({ m: mat4(x, 0.07, c.z + dz, 0, 0.6, 1, 0.6) });
      }
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = c.x + sx * (c.w / 2 - 2.2), pz = c.z + sz * (c.d / 2 - 1.8);
        add(group, box(pillarMat, 0.42, y - 0.3, 0.42, px, (y - 0.3) / 2, pz), box(bandMat, 0.56, 1.1, 0.56, px, 0.55, pz));
        colliders.push({ x: px, z: pz, w: 0.6, d: 0.6 });
      }
    }
  }
  add(group, instanced(glowGeo, M.glow, glows, false));
  add(group, instanced(pumpIslandGeo, M.trim, spec.pumps.map((p) => ({ m: mat4(p.x, 0, p.z, p.rot) }))));
  for (const p of spec.pumps) colliders.push({ x: p.x, z: p.z, w: 1.4, d: 5.6 });
  for (const py of spec.pylons) {
    const legH = py.h - 3.4;
    for (const dx of [-1, 1]) add(group, box(M.metal, 0.22, legH, 0.22, py.x + dx * 1.1, legH / 2, py.z));
    add(group, box(M.prop(0xb8b4aa), 2.9, 0.4, 0.8, py.x, 0.2, py.z));
    add(group, box(M.prop(0x26282c), 2.8, 3.6, 0.3, py.x, legH + 1.7, py.z));
    // Schild beidseitig, Platten vor und hinter dem Kasten
    const sign = plate(2.6, 3.4, M.sign('pylon'), py.x, legH + 1.7, py.z, py.rot);
    sign.children.forEach((c) => (c.position.z = Math.sign(c.position.z) * 0.16));
    add(group, sign);
    colliders.push({ x: py.x, z: py.z, w: 3, d: 0.9 });
  }
  add(group, instanced(picnicGeo, M.trim, spec.picnics.map((p) => ({ m: mat4(p.x, 0, p.z, p.rot) }))));
  for (const p of spec.picnics) colliders.push({ x: p.x, z: p.z, w: 1.9, d: 1.9 });
  for (const kind of ['drinks', 'ice', 'air'] as const) {
    const list = spec.vendors.filter((v) => v.kind === kind);
    add(group, instanced(vendorGeo[kind], M.trim, list.map((v) => ({ m: mat4(v.x, 0.05, v.z, v.rot) }))));
    for (const v of list) colliders.push({ x: v.x, z: v.z, w: kind === 'ice' ? 1.4 : 0.9, d: 0.9 });
  }
  for (const sb of spec.slabs) {
    const m = new THREE.Mesh(makeBox(sb.w, 0.012, sb.d, 4, 4), M.floorConcrete);
    m.userData.ownGeo = true;
    m.position.set(sb.x, 0.054, sb.z);
    m.receiveShadow = true;
    group.add(m);
  }
  add(group, instanced(binGeo, M.trim, spec.bins.map((b) => ({ m: mat4(b.x, 0.05, b.z, (b.x * 7) % 6.28) }))));
  for (const b of spec.bins) colliders.push({ x: b.x, z: b.z, w: 0.6, d: 0.6 });
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

/** Plattenfugen, Asphaltflicken, Risse, Flecken, Kanaldeckel, Gullys, Hydranten, Mülleimer, Briefkästen, Grasbüschel. */
function streetDetails(spec: ChunkSpec, cx: number, cz: number, group: THREE.Group, colliders: Box[]): void {
  const M = mats();
  const ox = cx * CHUNK, oz = cz * CHUNK;
  const r = rng((chunkSeed(cx, cz) ^ 0x51ed270b) >>> 0);
  const items = new Map<THREE.Material, Inst[]>();
  const put = (mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rot = 0) => {
    const list = items.get(mat) ?? [];
    list.push({ m: mat4(x, y, z, rot, w, h, d) });
    items.set(mat, list);
  };
  const unit = boxGeo;

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

  // Aufleger: Flicken, Risse, Schlaglöcher, Ölflecken auf der Fahrbahn; Flecken, Risse, Moos und Kaugummi auf dem Gehweg
  const decals = new Map<Parameters<typeof M.decal>[0], Inst[]>();
  const dec = (name: Parameters<typeof M.decal>[0], x: number, y: number, z: number, w: number, d: number, rot: number, color: number) => {
    const list = decals.get(name) ?? [];
    list.push({ m: mat4(x, y, z, rot, w, 1, d), color });
    decals.set(name, list);
  };
  const onRoad = () => {
    if (spec.roadH && (!spec.roadV || r() < 0.5)) return { x: ox + 14 + r() * (CHUNK - 18), z: oz + 0.8 + r() * (ROAD - 1.6), h: true };
    return { x: ox + 0.8 + r() * (ROAD - 1.6), z: oz + 14 + r() * (CHUNK - 18), h: false };
  };
  const hasRoad = spec.roadH || spec.roadV;
  const right = (h: boolean) => (h ? 0 : Math.PI / 2) + (r() < 0.5 ? 0 : Math.PI);
  const along = (h: boolean) => (h ? 0 : Math.PI / 2);
  const pickOf = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  // Zustand der Straße je Chunk: von frisch saniert (0,4) bis völlig kaputt (1,6)
  const wear = 0.4 + r() * 1.2;
  const n = (k: number) => Math.round(k * wear * (0.7 + r() * 0.6));
  for (let i = 0; hasRoad && i < n(5); i++) {
    const p = onRoad();
    const tone = [0x45474b, 0x505257, 0x5c5e62][Math.floor(r() * 3)]; // frische Flicken dunkler, alte heller
    dec('patch', p.x, 0.039, p.z, 1.2 + r() * 2.6, 0.8 + r() * 1.5, right(p.h), tone);
  }
  if (hasRoad && r() < 0.35 * wear) {
    // aufgegrabene Leitung: langer, schmaler Flicken quer oder längs über die Fahrbahn
    const p = onRoad(), cross = r() < 0.5;
    const len = cross ? ROAD - 1 : 8 + r() * 18;
    const x = cross && !p.h ? ox + ROAD / 2 : p.x, z = cross && p.h ? oz + ROAD / 2 : p.z;
    dec('trench', x, 0.0395, z, len, 0.7 + r() * 0.5, along(p.h) + (cross ? Math.PI / 2 : 0), [0x3f4145, 0x4c4e52][Math.floor(r() * 2)]);
  }
  for (let i = 0; hasRoad && i < n(10); i++) {
    const p = onRoad();
    const name = pickOf<'crack' | 'crack2' | 'crack3' | 'tar'>(['crack', 'crack2', 'crack3', 'crack2', 'tar']);
    const tone = name === 'tar' ? 0x0c0c0d : 0x161617;
    dec(name, p.x, 0.041, p.z, 1.2 + r() * 3, name === 'crack3' ? 0.5 + r() * 0.3 : 0.3 + r() * 0.25, r() < 0.6 ? along(p.h) + (r() - 0.5) * 0.6 : r() * Math.PI, tone);
  }
  for (let i = 0; hasRoad && i < n(2); i++) {
    const p = onRoad();
    const s0 = 1 + r() * 1.8;
    dec('alligator', p.x, 0.0405, p.z, s0 * 1.3, s0, r() * Math.PI, 0x1a1a1c);
  }
  for (let i = 0; hasRoad && i < n(4); i++) {
    // Schlaglöcher: meist klein, selten groß, drei Formen
    const p = onRoad();
    const big = r() < 0.2, rr = big ? 0.8 + r() * 0.6 : 0.25 + r() * 0.45;
    dec(pickOf<'pothole' | 'pothole2' | 'pothole3'>(['pothole', 'pothole2', 'pothole3']), p.x, 0.042, p.z, rr * (1.1 + r() * 0.5), rr, r() * Math.PI, 0x3a3a3c);
  }
  for (let i = 0; hasRoad && i < n(5); i++) {
    // Ölflecken in der Mitte der Fahrstreifen, wo Autos stehen
    const p = onRoad();
    const lane = (r() < 0.5 ? -1 : 1) * ROAD * 0.25;
    const x = p.h ? p.x : ox + ROAD / 2 + lane, z = p.h ? oz + ROAD / 2 + lane : p.z;
    const s0 = 0.4 + r() * 1.1;
    dec('stain', x, 0.04, z, s0 * (1.2 + r() * 0.6), s0, r() * Math.PI, pickOf([0x141416, 0x1e1c1a, 0x26231f]));
  }
  for (let i = 0; hasRoad && i < 1 + Math.floor(r() * 3); i++) {
    // Bremsspuren in Fahrtrichtung, gern vor der Kreuzung
    const p = onRoad();
    const lane = (r() < 0.5 ? -1 : 1) * ROAD * 0.25;
    const x = p.h ? p.x : ox + ROAD / 2 + lane, z = p.h ? oz + ROAD / 2 + lane : p.z;
    dec('skid', x, 0.0415, z, 5 + r() * 12, 1.5, along(p.h) + (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 0.12, pickOf([0x0e0e10, 0x18181a]));
  }
  for (let i = 0; hasRoad && i < n(2); i++) {
    // Pfützen an der Rinne, wo das Wasser stehen bleibt
    const p = onRoad();
    const edge = (r() < 0.5 ? 0.9 : ROAD - 0.9);
    const x = p.h ? p.x : ox + edge, z = p.h ? oz + edge : p.z;
    dec('puddle', x, 0.043, z, 1.2 + r() * 2.2, 0.6 + r() * 0.7, along(p.h), 0x3c4249);
  }
  const manholes: THREE.Mesh[] = [];
  for (let i = 0; hasRoad && i < 2; i++) {
    const p = onRoad();
    const m = new THREE.Mesh(cylSmall, M.manhole);
    m.scale.set(0.9, 0.025, 0.9);
    m.position.set(p.x, 0.05, p.z);
    m.rotation.y = r() * Math.PI;
    m.receiveShadow = true;
    manholes.push(m);
  }
  add(group, ...manholes);
  // Gullys am Bordstein (in der Rinne)
  for (let i = 0; spec.roadH && i < 4; i++) {
    const x = ox + 14 + r() * (CHUNK - 18);
    dec('grate', x, 0.04, r() < 0.5 ? oz + ROAD - 0.22 : oz + 0.22, 0.9, 0.42, 0, 0xffffff);
  }
  for (let i = 0; spec.roadV && i < 3; i++) {
    const z = oz + 14 + r() * (CHUNK - 18);
    dec('grate', r() < 0.5 ? ox + ROAD - 0.22 : ox + 0.22, 0.042, z, 0.9, 0.42, Math.PI / 2, 0xffffff);
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
  for (let i = 0; walkSides.length && i < 20; i++) {
    const p = onWalk();
    const s0 = 0.5 + r() * 1.1;
    dec('stain', p.x, 0.1415, p.z, s0 * (1 + r()), s0, r() * Math.PI, r() < 0.7 ? 0x6a665e : 0x8a8478);
  }
  for (let i = 0; walkSides.length && i < 14; i++) {
    const p = onWalk();
    dec('crack', p.x, 0.142, p.z, 0.8 + r() * 1.4, 0.25 + r() * 0.2, r() * Math.PI, 0x3a3833);
  }
  for (let i = 0; walkSides.length && i < 9; i++) {
    const p = onWalk();
    const s0 = 0.4 + r() * 0.6;
    dec('stain', p.x, 0.1425, p.z, s0 * 1.6, s0, r() * Math.PI, 0x4e6a34);
  }
  for (let i = 0; walkSides.length && i < 30; i++) {
    const p = onWalk();
    const s0 = 0.07 + r() * 0.06;
    dec('stain', p.x, 0.143, p.z, s0, s0, 0, 0x2c2a28);
  }
  for (const [name, list] of decals) add(group, instanced(unitPlane, M.decal(name), list, false));

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
  const guards: Inst[] = [], posts: Inst[] = [], medians: Inst[] = [], rails: Inst[] = [], sleepers: Inst[] = [], reflectors: Inst[] = [];
  // Leitpfosten nicht in Einfahrten zu Nebenstraßen und Raststätten
  const laneStarts = spec.paths.filter((q) => q.path.kind === 'lane' && q.i0 === 0).map((q) => q.path.pts[0]);
  const stations = stationsNear(Math.floor(ox / CHUNK), Math.floor(oz / CHUNK), 8);
  const blockedPost = (x: number, z: number) =>
    laneStarts.some((p) => Math.hypot(p.x - x, p.z - z) < 9)
    || stations.some((st) => Math.abs(x - st.x) < st.w / 2 + 4 && Math.abs(z - st.z) < st.d / 2 + 12);
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
        // Leitpfosten alle 50 m, beidseitig versetzt, nicht an Einfahrten
        for (const side of [-1, 1]) {
          for (const e of edgePoints(sl, side * (w / 2 + 0.9), 50, (x, z) => own(x, z) && !blockedPost(x, z))) {
            reflectors.push({ m: mat4(e.x, 0, e.z, e.rot + (side > 0 ? Math.PI / 2 : -Math.PI / 2)) });
          }
        }
        break;
      case 'lane':
        // Nebenstraße: schmaler, alter Asphalt ohne Markierung auf einem Schotterbankett
        verge(sl, w / 2 + 0.35);
        strip(sl, w / 2, -w / 2, 0.021, M.street, 8, 8);
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
    instanced(postGeo, M.trim, reflectors),
  );
  pathWear(spec, group, ox, oz, own);
}

/**
 * Verschleiß auf kurvigen Straßen: Fahrspuren in Abschnitten (unterschiedlich stark, breit und versetzt),
 * Risse, Netzrisse, Flicken, Schlaglöcher, Ölflecken, Bremsspuren und Pfützen. Jedes Stück gehört genau einem Chunk.
 */
function pathWear(spec: ChunkSpec, group: THREE.Group, ox: number, oz: number, own: (x: number, z: number) => boolean): void {
  const M = mats();
  const rr = rng((chunkSeed(Math.floor(ox / CHUNK), Math.floor(oz / CHUNK)) ^ 0x3c6ef372) >>> 0);
  const decals = new Map<DecalName, Inst[]>();
  const put = (name: DecalName, x: number, y: number, z: number, w: number, d: number, rot: number, color: number) => {
    if (!own(x, z)) return;
    const list = decals.get(name) ?? [];
    list.push({ m: mat4(x, y, z, rot, w, 1, d), color });
    decals.set(name, list);
  };
  const pickOf = <T,>(a: T[]): T => a[Math.floor(rr() * a.length)];
  const BASE: Partial<Record<string, number>> = { highway: 0.03, country: 0.022, lane: 0.021, ramp: 0.034, service: 0.034, boulevard: 0.05 };
  for (const sl of spec.paths) {
    const p = sl.path;
    const y0 = BASE[p.kind];
    if (y0 === undefined) continue;
    const s0 = p.cum[sl.i0], s1 = p.cum[sl.i1];
    const w = p.width;
    // Fahrspuren je Fahrstreifen: Mitte der Spur, Räder 0,78 m daneben
    const laneCentres = p.kind === 'highway' ? [-6.75, -3.25, 3.25, 6.75] : p.kind === 'lane' || p.oneway ? [0] : [-w / 4, w / 4];
    for (const c of laneCentres) {
      for (const wh of [-0.78, 0.78]) {
        for (let s = s0 + rr() * 6; s < s1; ) {
          const run = 5 + rr() * 18;
          if (rr() < 0.7) {
            const tone = pickOf([0x141416, 0x1d1d20, 0x2a2a2d, 0x3a3a3d]), wd = 0.5 + rr() * 0.45, jit = (rr() - 0.5) * 0.35;
            for (let a = s; a < Math.min(s + run, s1); a += 6) {
              const L = Math.min(6, s + run - a, s1 - a);
              const q = lanePose(p, a + L / 2, c + wh + jit);
              put('track', q.x, y0 + 0.002, q.z, L + 0.4, wd, q.rot, tone);
            }
          }
          s += run + rr() * 8;
        }
      }
    }
    // Schäden: auf Nebenstraßen und Landstraßen mehr als auf der Autobahn
    const k = ((s1 - s0) / 64) * (p.kind === 'lane' ? 1.6 : p.kind === 'country' ? 1.2 : 0.8);
    const at = (spread: number) => {
      const q = lanePose(p, s0 + rr() * (s1 - s0), (rr() - 0.5) * spread);
      return q;
    };
    for (let i = 0; i < Math.round(6 * k); i++) {
      const q = at(w - 1);
      const name = pickOf<DecalName>(['crack', 'crack2', 'crack3', 'tar']);
      put(name, q.x, y0 + 0.004, q.z, 1.2 + rr() * 2.8, name === 'crack3' ? 0.5 : 0.35, q.rot + (rr() < 0.6 ? (rr() - 0.5) * 0.6 : rr() * 3), name === 'tar' ? 0x0c0c0d : 0x161617);
    }
    for (let i = 0; i < Math.round(1.6 * k * rr() * 2); i++) {
      const q = at(w - 1.5);
      // Flicken unterschiedlich: kleine Ausbesserungen, lange Streifen in der Fahrspur, selten große Flächen
      const kind = rr();
      const L = kind < 0.5 ? 0.8 + rr() * 1.2 : kind < 0.85 ? 3 + rr() * 6 : 2 + rr() * 2;
      const D = kind < 0.5 ? 0.6 + rr() * 0.8 : kind < 0.85 ? 0.7 + rr() * 0.5 : 1.8 + rr() * 1.4;
      put('patch', q.x, y0 + 0.003, q.z, L, D, q.rot + (kind < 0.5 ? rr() * 0.5 : 0), pickOf([0x2e3033, 0x383a3e, 0x44464a]));
    }
    for (let i = 0; i < Math.round(1.2 * k); i++) {
      const q = at(w - 1.5);
      const s = 1 + rr() * 1.6;
      put('alligator', q.x, y0 + 0.0035, q.z, s * 1.3, s, rr() * 3, 0x1a1a1c);
    }
    for (let i = 0; i < Math.round((p.kind === 'highway' ? 0.6 : 2.5) * k); i++) {
      const q = at(w - 1);
      const big = rr() < 0.2, r0 = big ? 0.8 + rr() * 0.5 : 0.25 + rr() * 0.45;
      put(pickOf<DecalName>(['pothole', 'pothole2', 'pothole3']), q.x, y0 + 0.005, q.z, r0 * (1.1 + rr() * 0.5), r0, rr() * 3, 0x3a3a3c);
    }
    for (let i = 0; i < Math.round(2 * k); i++) {
      const q = lanePose(p, s0 + rr() * (s1 - s0), pickOf(laneCentres));
      const s = 0.4 + rr();
      put('stain', q.x, y0 + 0.0045, q.z, s * 1.4, s, rr() * 3, pickOf([0x141416, 0x1e1c1a, 0x26231f]));
    }
    if (rr() < 0.45 * k) {
      const q = lanePose(p, s0 + rr() * (s1 - s0), pickOf(laneCentres));
      put('skid', q.x, y0 + 0.0042, q.z, 6 + rr() * 14, 1.5, q.rot + (rr() - 0.5) * 0.15, pickOf([0x0e0e10, 0x18181a]));
    }
    for (let i = 0; i < Math.round(0.8 * k); i++) {
      const q = at(w - 0.6);
      put('puddle', q.x, y0 + 0.0048, q.z, 1.2 + rr() * 2.4, 0.6 + rr() * 0.8, q.rot, 0x3c4249);
    }
  }
  for (const [name, list] of decals) add(group, instanced(unitPlane, M.decal(name), list, false));
}
