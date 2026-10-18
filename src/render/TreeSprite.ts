import * as THREE from 'three';

/**
 * Bäume als Sprites aus den 14 Baumarten (_tree_01 … _tree_14, je 8 Ansichten im 45°-Abstand), zu einem Atlas
 * (public/trees.png: 8 Spalten = Ansichten, 14 Zeilen = Arten) zusammengesetzt. Die Karten drehen sich im
 * Vertex-Shader um die Hochachse zur Kamera und zeigen die Ansicht, die zum Kamerawinkel passt.
 */
const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || './';

const COLS = 8, ROWS = 14, CELL_W = 224, CELL_H = 256;
/** Höhe einer ganzen Atlaszelle in Originalpixeln je Art (Baumhöhe war ca. 740 px) */
const CELL_PX = [712.8, 681.0, 742.4, 737.3, 803.2, 691.7, 674.8, 672.8, 641.0, 590.8, 939.4, 901.9, 733.2, 720.9];
/** Meter je Originalpixel: ein 740 px hoher Baum ist ca. 8,5 m hoch */
const M_PER_PX = 8.5 / 740;
export const TREE_SPECIES = ROWS;
/** Häufigkeit je Art: Laub- und Nadelbäume oft, Palmen, kahle und orange Bäume selten */
const WEIGHT = [10, 8, 1, 1, 6, 0, 2, 8, 8, 1.5, 4, 4, 5, 1.5]; // Art 5 (herbstliche Trauerweide, ohne sichtbaren Stamm) entfällt
export function pickSpecies(h: number, town: boolean): number {
  // In der Stadt keine Palmen, kahlen oder orangen Bäume
  const w = (i: number) => (town && (i === 2 || i === 3 || i === 9 || i === 13) ? 0 : WEIGHT[i]);
  let sum = 0;
  for (let i = 0; i < ROWS; i++) sum += w(i);
  let t = (h % 1) * sum;
  for (let i = 0; i < ROWS; i++) {
    t -= w(i);
    if (t < 0) return i;
  }
  return 0;
}
export const treeCellHeight = (species: number): number => CELL_PX[species] * M_PER_PX;

let tex: THREE.Texture | null = null;
let mat: THREE.MeshLambertMaterial | null = null;
const uView = { value: 0 };
const uAspect = { value: CELL_W / CELL_H };

function atlas(): THREE.Texture {
  if (tex) return tex;
  tex = new THREE.TextureLoader().load(`${BASE}trees.png`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function treeMaterial(): THREE.MeshLambertMaterial {
  if (mat) return mat;
  mat = new THREE.MeshLambertMaterial({
    map: atlas(), alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: atlas(), emissiveIntensity: 0.45,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uAspect = uAspect;
    sh.uniforms.uView = uView;
    sh.vertexShader = `attribute float aSpecies;\nuniform float uAspect;\nuniform float uView;\n${sh.vertexShader}`
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        {
          float col = mod(uView, ${COLS}.0);
          vec2 cellUv = vec2((col + uv.x) / ${COLS}.0, 1.0 - (aSpecies + 1.0) / ${ROWS}.0 + uv.y / ${ROWS}.0);
          #ifdef USE_MAP
            vMapUv = cellUv;
          #endif
          #ifdef USE_EMISSIVEMAP
            vEmissiveMapUv = cellUv;
          #endif
        }`,
      )
      .replace(
        '#include <project_vertex>',
        `
        vec3 ip = vec3(instanceMatrix[3]);
        float sc = length(vec3(instanceMatrix[0]));
        vec3 camR = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
        vec4 mvPosition = viewMatrix * vec4(ip + camR * position.x * sc * uAspect + vec3(0.0, position.y * sc, 0.0), 1.0);
        gl_Position = projectionMatrix * mvPosition;
        `,
      );
  };
  return mat;
}

const shadowGeo = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x0a120a, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const cardGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);

export interface TreeSpot { x: number; z: number; s: number }

const TINTS = [0xffffff, 0xf2f6e8, 0xe8f0dc, 0xf6f0dc];

/** Baut Sprite-Bäume plus Schatten für eine Liste von Standorten. */
export function buildTreeSprites(trees: TreeSpot[], group: THREE.Group, town = false): void {
  if (!trees.length || typeof document === 'undefined') return;
  const geo = cardGeo.clone();
  const species = new Float32Array(trees.length);
  const im = new THREE.InstancedMesh(geo, treeMaterial(), trees.length);
  const sh = new THREE.InstancedMesh(shadowGeo, shadowMat, trees.length);
  const mtx = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion();
  trees.forEach((t, i) => {
    const h = Math.abs(Math.sin(t.x * 12.9898 + t.z * 78.233) * 43758.5453);
    const sp = pickSpecies(h, town);
    species[i] = sp;
    const H = treeCellHeight(sp) * t.s * 0.8;
    mtx.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(H, H, H));
    im.setMatrixAt(i, mtx);
    c.setHex(TINTS[Math.floor(h * 7) % TINTS.length]);
    im.setColorAt(i, c);
    const r = H * 0.2;
    mtx.compose(new THREE.Vector3(t.x, 0.05, t.z), q, new THREE.Vector3(r, 1, r));
    sh.setMatrixAt(i, mtx);
  });
  geo.setAttribute('aSpecies', new THREE.InstancedBufferAttribute(species, 1));
  // Ansicht nach Kamerawinkel (alle 45°)
  im.onBeforeRender = (_r, _s, camera) => {
    const e = camera.matrixWorld.elements;
    uView.value = ((Math.round(Math.atan2(e[8], e[10]) / (Math.PI / 4)) % COLS) + COLS) % COLS;
  };
  for (const m of [im, sh]) {
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = false;
    m.instanceMatrix.needsUpdate = true;
  }
  group.add(sh, im);
}
