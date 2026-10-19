import * as THREE from 'three';
import { glassTexture, normalMapOf, signTexture, textures } from './Textures';
import { farmTexture } from './FarmAssets';
import { carMats } from './CarModel';
import { applyXray } from './Xray';
import { StreetTex, streetTextures } from './StreetTextures';

/** Windzeit für Gras und Blumen (Sekunden); wird beim Zeichnen der Büschel gesetzt */
export const windTime = { value: 0 };

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...o });

/**
 * Textur in Weltkoordinaten (x, -z) / tile Meter: nahtlos über Chunks, Kreuzungen und skalierte Instanzen,
 * ohne dass die Geometrie passende UVs braucht.
 */
function worldUV<T extends THREE.Material>(m: T, tile: number): T {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      {
        vec4 wq = vec4( position, 1.0 );
        #ifdef USE_INSTANCING
        wq = instanceMatrix * wq;
        #endif
        wq = modelMatrix * wq;
        vec2 wuv = vec2( wq.x, -wq.z ) / ${tile.toFixed(3)};
        #ifdef USE_MAP
        vMapUv = wuv;
        #endif
        #ifdef USE_NORMALMAP
        vNormalMapUv = wuv;
        #endif
      }`,
    );
  };
  m.customProgramCacheKey = () => `wuv${tile}`;
  return m;
}

/** Aufleger (Risse, Flicken, Flecken): durchsichtig, schreibt keine Tiefe, liegt per Polygon-Offset sicher oben */
const decal = (map: THREE.Texture | null, o: THREE.MeshStandardMaterialParameters = {}) =>
  std({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, ...o });

export interface Mats {
  ground: THREE.MeshStandardMaterial;
  road: THREE.MeshStandardMaterial;
  highway: THREE.MeshStandardMaterial;
  ramp: THREE.MeshStandardMaterial;
  paving: THREE.MeshStandardMaterial;
  gravel: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  trunk: THREE.MeshStandardMaterial;
  crown: THREE.MeshStandardMaterial; // Farbe pro Instanz
  bush: THREE.MeshStandardMaterial; // Farbe pro Instanz
  flower: THREE.MeshStandardMaterial; // Farbe pro Instanz
  metal: THREE.MeshStandardMaterial;
  rail: THREE.MeshStandardMaterial;
  sleeper: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  carBody: THREE.MeshStandardMaterial; // Farbe pro Instanz
  glass: THREE.MeshStandardMaterial;
  tyre: THREE.MeshStandardMaterial;
  doorWood: THREE.MeshStandardMaterial;
  doorPanel: THREE.MeshStandardMaterial;
  interior: THREE.MeshStandardMaterial; // Innenwände
  floorTile: THREE.MeshStandardMaterial;
  floorCarpet: THREE.MeshStandardMaterial;
  floorConcrete: THREE.MeshStandardMaterial;
  furniture: THREE.MeshStandardMaterial; // Vertexfarben
  lampHead: THREE.MeshBasicMaterial;
  glow: THREE.MeshBasicMaterial;
  /** Lichtkegel unter der Laterne und Schein um die Lampe (nur nachts sichtbar) */
  beam: THREE.MeshBasicMaterial;
  halo: THREE.MeshBasicMaterial;
  wall(color: number): THREE.MeshStandardMaterial;
  /** Außenwand je nach Baustil; Fenster sind Geometrie, nicht Textur */
  wallStyle(style: string, color: number): THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial; // Vertexfarben: Rahmen, Bretter, Läden
  boards: THREE.MeshStandardMaterial; // Vertexfarben, Holzbretter
  rollShutter: THREE.MeshStandardMaterial;
  windowGlass: THREE.MeshStandardMaterial; // durchsichtig
  towerGlass: THREE.MeshStandardMaterial; // dunkle Fassade für obere Stockwerke
  roofParts: THREE.MeshStandardMaterial; // Dachaufbauten (Vertexfarben)
  tuft: THREE.MeshStandardMaterial; // Grasbüschel (Instanzfarbe)
  roofWood: THREE.MeshStandardMaterial; // Bretterdach (Scheune, Bauernhaus)
  floorPlanks: THREE.MeshStandardMaterial;
  floorDirt: THREE.MeshStandardMaterial;
  fieldDirt: THREE.MeshStandardMaterial; // gepflügte Ackerfläche
  hay: THREE.MeshStandardMaterial;
  chimneyShaft: THREE.MeshStandardMaterial; // Schornstein aus Naturstein (Originalbild)
  chimneyWide: THREE.MeshStandardMaterial;
  /** Kartenmodell aus einem Frontbild (Mais, Zaun, Leiter, Säcke): beidseitig sichtbar, durchsichtiger Rand */
  card(name: string): THREE.MeshStandardMaterial;
  litWindow: THREE.MeshBasicMaterial; // nachts beleuchtete Fenster
  roof(color: number): THREE.MeshStandardMaterial;
  prop(color: number): THREE.MeshStandardMaterial;
  train(color: number): THREE.MeshStandardMaterial;
  sign(key: string): THREE.MeshBasicMaterial;
  /** Stadtstraße ohne Linien (Weltkoordinaten-UV, 8 m) */
  street: THREE.MeshStandardMaterial;
  /** Gehwegplatten in Weltkoordinaten (2 m): keine Verzerrung bei gestreckten Streifen */
  sidewalk: THREE.MeshStandardMaterial;
  curb: THREE.MeshStandardMaterial;
  /** Rinne aus Granitpflaster vor dem Bordstein */
  gutter: THREE.MeshStandardMaterial;
  /** Fahrbahnmarkierung mit Abrieb; Farbe (weiß/gelb) pro Instanz */
  markPaint: THREE.MeshStandardMaterial;
  manhole: THREE.MeshStandardMaterial;
  /** Aufleger je Textur, Farbe pro Instanz */
  decal(name: 'crack' | 'patch' | 'stain' | 'track' | 'pothole' | 'grate'): THREE.MeshStandardMaterial;
}

let cache: Mats | null = null;

/** Lichtpfütze: heller, warmer Kern und ein weiches Ausklingen wie bei echtem Licht (Abfall ungefähr quadratisch) */
function glowTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,226,160,0.95)');
  grad.addColorStop(0.12, 'rgba(255,214,140,0.62)');
  grad.addColorStop(0.3, 'rgba(255,196,110,0.3)');
  grad.addColorStop(0.55, 'rgba(255,184,96,0.1)');
  grad.addColorStop(0.8, 'rgba(255,176,90,0.025)');
  grad.addColorStop(1, 'rgba(255,170,85,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Lichtkegel: oben an der Lampe hell, nach unten und zum Rand hin ausklingend */
function beamTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,214,140,0.85)'); // Apex (v = 1) liegt oben im Bild
  grad.addColorStop(0.25, 'rgba(255,200,120,0.32)');
  grad.addColorStop(0.7, 'rgba(255,190,105,0.1)');
  grad.addColorStop(1, 'rgba(255,184,100,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 128);
  return new THREE.CanvasTexture(c);
}

export function mats(): Mats {
  if (cache) return cache;
  const t = textures();
  const walls = new Map<number, THREE.MeshStandardMaterial>();
  const styleWalls = new Map<string, THREE.MeshStandardMaterial>();
  const cards = new Map<string, THREE.MeshStandardMaterial>();
  const roofs = new Map<number, THREE.MeshStandardMaterial>();
  const props = new Map<number, THREE.MeshStandardMaterial>();
  const trains = new Map<number, THREE.MeshStandardMaterial>();
  const signs = new Map<string, THREE.MeshBasicMaterial>();
  const decals = new Map<string, THREE.MeshStandardMaterial>();
  const st: StreetTex | null = streetTextures();
  const memo = <K, V>(m: Map<K, V>, k: K, make: () => V): V => {
    let v = m.get(k);
    if (!v) m.set(k, (v = make()));
    return v;
  };

  const n = (tex: THREE.CanvasTexture | null, k = 2, scale = 1) => {
    const normalMap = normalMapOf(tex, k);
    return normalMap ? { normalMap, normalScale: new THREE.Vector2(scale, scale) } : {};
  };
  cache = {
    ground: std({ map: t.grass, roughness: 1, ...n(t.grass, 3, 0.8) }),
    road: std({ map: t.asphalt, roughness: 0.92, ...n(t.asphalt, 2, 0.4) }),
    highway: std({ map: t.highway, roughness: 0.92, ...n(t.highway, 2, 0.4) }),
    ramp: std({ map: t.asphaltPlain, roughness: 0.92, ...n(t.asphaltPlain, 2, 0.4) }),
    paving: std({ map: t.paving, ...n(t.paving, 3, 1) }),
    gravel: std({ map: t.gravel, roughness: 1, ...n(t.gravel, 3, 1.2) }),
    floor: std({ map: t.floor, roughness: 0.6, ...n(t.floor, 2, 0.6) }),
    trunk: applyXray(std({ color: 0x5b4330, roughness: 1, flatShading: true })),
    crown: applyXray(std({ color: 0xffffff, vertexColors: true, roughness: 0.95 })),
    bush: applyXray(std({ color: 0xffffff, vertexColors: true, roughness: 0.95 })),
    flower: std({ color: 0xffffff, vertexColors: true, roughness: 0.7 }),
    metal: std({ color: 0x3a3d42, metalness: 0.4, roughness: 0.6 }),
    rail: std({ color: 0x8a8e94, metalness: 0.6, roughness: 0.45 }),
    sleeper: std({ color: 0x4d3a2a }),
    concrete: std({ color: 0x9a9890 }),
    carBody: std({ color: 0xffffff, roughness: 0.5, metalness: 0.25 }),
    glass: std({ color: 0x1b2430, roughness: 0.2, metalness: 0.5 }),
    tyre: std({ color: 0x151517 }),
    doorWood: std({ color: 0x6b4a2e, map: t.floor }),
    doorPanel: std({ color: 0x4a3220, map: t.floor }),
    interior: std({ color: 0xffffff, map: t.plaster, ...n(t.plaster, 2, 0.6) }),
    furniture: std({ vertexColors: true, roughness: 0.78, map: t.grain, bumpMap: t.grain, bumpScale: 0.35 }),
    lampHead: new THREE.MeshBasicMaterial({ color: 0x777766 }),
    glow: new THREE.MeshBasicMaterial({
      map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }),
    beam: new THREE.MeshBasicMaterial({
      map: beamTexture(), color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true,
    }),
    halo: new THREE.MeshBasicMaterial({
      map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
    roofWood: std({ map: farmTexture('planksOld', true), roughness: 0.92, side: THREE.DoubleSide }),
    floorPlanks: std({ map: farmTexture('planksOld', true), roughness: 0.85 }),
    floorDirt: std({ map: farmTexture('dirt', true), roughness: 1 }),
    fieldDirt: std({ map: farmTexture('dirtFarmland', true), roughness: 1 }),
    hay: std({ map: farmTexture('hay'), roughness: 1 }),
    chimneyShaft: std({ map: farmTexture('chimneyTop'), roughness: 0.95 }),
    chimneyWide: std({ map: farmTexture('chimneyBase'), roughness: 0.95 }),
    card: (name) => memo(cards, name, () => std({ map: farmTexture(name), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1 })),
    tuft: (() => {
      const m = std({ color: 0xffffff, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uWind = windTime;
        sh.vertexShader = `uniform float uWind;\n${sh.vertexShader}`.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3]);
          float gust = sin(uWind * 1.5 + ip.x * 0.55 + ip.z * 0.4) * 0.6 + sin(uWind * 2.9 + ip.x * 1.7 - ip.z * 0.9) * 0.25;
          float bend = position.y * position.y;
          transformed.x += gust * bend * 0.9;
          transformed.z += gust * bend * 0.45;
          #endif`,
        );
      };
      return m;
    })(),
    roofParts: std({ vertexColors: true, roughness: 0.72, metalness: 0.12 }),
    floorTile: std({ map: t.tile, roughness: 0.35, ...n(t.tile, 2, 0.7) }),
    floorCarpet: std({ map: t.carpet, roughness: 1, ...n(t.carpet, 3, 0.5) }),
    floorConcrete: std({ map: t.concreteFloor, roughness: 0.9, ...n(t.concreteFloor, 2.5, 0.8) }),
    trim: std({ vertexColors: true, roughness: 0.75 }),
    boards: std({ vertexColors: true, roughness: 0.95, map: t.floor }),
    rollShutter: std({ color: 0xffffff, map: t.metal, metalness: 0.5, roughness: 0.55 }),
    windowGlass: new THREE.MeshStandardMaterial({
      color: 0x7a96a8, roughness: 0.04, metalness: 0.35, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, map: glassTexture(),
    }),
    towerGlass: std({ color: 0x232c38, roughness: 0.12, metalness: 0.55 }),
    litWindow: new THREE.MeshBasicMaterial({ color: 0xffd58a, transparent: true, opacity: 0, depthWrite: false }),
    wallStyle: (style, color) => memo(styleWalls, `${style}|${color}`, () => {
      if (style === 'wood') return std({ color, map: farmTexture('woodWall', true), roughness: 0.9 });
      const map = style === 'brick' || style === 'darkbrick' ? t.brick : style === 'siding' ? t.siding : style === 'concrete' ? t.concrete
        : style === 'stone' ? t.stone : t.wall;
      const k = style === 'siding' ? 1.2 : style === 'concrete' ? 1.6 : style === 'stone' ? 2.4 : 2.6;
      return std({ color, map, roughness: 0.88, ...n(map, k, 0.8) });
    }),
    wall: (color) => memo(walls, color, () => std({ color, map: t.wall, roughness: 0.85, ...n(t.wall, 2.5, 0.9) })),
    roof: (color) => memo(roofs, color, () => std({ color, map: t.roof, side: THREE.DoubleSide, ...n(t.roof, 3, 1) })),
    prop: (color) => memo(props, color, () => std({ color, roughness: 0.85 })),
    train: (color) => memo(trains, color, () => applyXray(std({ color, metalness: 0.2, roughness: 0.6 }))),
    street: worldUV(std({ map: st?.street ?? null, roughness: 0.93, ...n(st?.street ?? null, 2.2, 0.55) }), 8),
    sidewalk: worldUV(std({ map: t.paving, ...n(t.paving, 3, 1) }), 2),
    curb: std({ map: st?.curb ?? null, roughness: 0.85, ...n(st?.curb ?? null, 2, 0.6) }),
    gutter: worldUV(std({ map: st?.cobble ?? null, roughness: 0.9, ...n(st?.cobble ?? null, 3, 1) }), 1),
    markPaint: worldUV(decal(st?.paint ?? null, { roughness: 0.7 }), 5),
    manhole: std({ map: st?.manhole ?? null, metalness: 0.45, roughness: 0.65, ...n(st?.manhole ?? null, 3, 1) }),
    decal: (name) => memo(decals, name, () => decal(st?.[name] ?? null)),
    sign: (key) =>
      memo(signs, key, () => new THREE.MeshBasicMaterial({
        map: signTexture(key), transparent: true, alphaTest: 0.4, // FrontSide: Rückseite ist eine eigene Platte
      })),
  };
  return cache;
}

/** Nachts leuchten die Laternenköpfe und werfen Lichtpfützen. night: 0 = Tag, 1 = Nacht. */
export function setNightGlow(night: number): void {
  const m = mats();
  m.glow.opacity = night * 0.95;
  m.beam.opacity = night * 0.16;
  m.halo.opacity = night * 0.7;
  m.lampHead.color.setHex(0x777766).lerp(new THREE.Color(0xffe2a0), night);
  m.litWindow.opacity = Math.max(0, night - 0.25) * 1.2;
}

/** Regen macht Straßen und Gehwege nass: dunkler und glänzender. wet: 0..1 */
export function setWetness(wet: number): void {
  const m = mats();
  const darken = (mat: THREE.MeshStandardMaterial, k: number) => {
    const base = (mat.userData.base ??= mat.color.clone()) as THREE.Color;
    mat.color.copy(base).multiplyScalar(1 - k * wet);
  };
  for (const [mat, dry] of [
    [m.road, 0.92], [m.highway, 0.92], [m.ramp, 0.92], [m.paving, 0.9], [m.concrete, 0.9],
    [m.street, 0.93], [m.sidewalk, 0.9], [m.curb, 0.85], [m.gutter, 0.9],
  ] as const) {
    mat.roughness = dry - 0.6 * wet;
    darken(mat, 0.3);
  }
  darken(m.ground, 0.18);
  const cm = carMats();
  for (const r of [m.carBody, m.glass, cm.paint, cm.glass]) r.envMapIntensity = 1 + wet;
}
