import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Modelle aus dem "Retro Urban Kit" von Kenney (CC0), als GLB in public/urban/.
 * Die Modelle sind klein modelliert (ein Lkw ist 0,8 Einheiten breit), `scale` bringt sie auf Weltmaß in Metern.
 */
export interface UrbanDef { scale: number; radius: number }

export const URBAN: Record<string, UrbanDef> = {
  'truck-flat': { scale: 3.4, radius: 3.0 }, 'truck-green-cargo': { scale: 3.4, radius: 3.0 }, 'truck-green': { scale: 3.4, radius: 2.0 },
  'truck-grey-cargo': { scale: 3.4, radius: 3.0 }, 'truck-grey': { scale: 3.4, radius: 2.0 },
  'detail-dumpster-closed': { scale: 3.4, radius: 1.1 }, 'detail-dumpster-open': { scale: 3.4, radius: 1.1 },
  pallet: { scale: 1.3, radius: 0.7 }, 'pallet-small': { scale: 1.3, radius: 0.5 },
  'detail-barrier-type-a': { scale: 4, radius: 0.9 }, 'detail-barrier-type-b': { scale: 4, radius: 0.9 }, 'detail-barrier-strong-type-a': { scale: 4, radius: 0.9 },
  'detail-light-double': { scale: 4.5, radius: 0.2 }, 'detail-light-single': { scale: 4.5, radius: 0.2 }, 'detail-light-traffic': { scale: 4.5, radius: 0.2 },
  'detail-bench': { scale: 3.2, radius: 1.0 },
  'tree-large': { scale: 4.2, radius: 0.5 }, 'tree-pine-large': { scale: 4.2, radius: 0.5 }, 'tree-pine-small': { scale: 3.6, radius: 0.4 },
  'tree-small': { scale: 3.6, radius: 0.4 }, 'tree-shrub': { scale: 3.2, radius: 0.0 }, 'tree-park-large': { scale: 4.2, radius: 0.5 },
  'scaffolding-structure': { scale: 3, radius: 1.5 }, 'detail-bricks-type-a': { scale: 3, radius: 0.6 }, 'detail-block': { scale: 3, radius: 0.7 },
  planks: { scale: 3, radius: 0.6 }, 'roof-metal-poles': { scale: 3, radius: 0.0 },
};

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || './';
const loaded = new Map<string, THREE.Object3D>();
let started: Promise<void> | null = null;

/** Lädt alle Modelle einmal; danach liefert `urbanClone` sofort Kopien. In Node (Tests) passiert nichts. */
export function preloadUrban(): Promise<void> {
  if (started) return started;
  if (typeof document === 'undefined') return (started = Promise.resolve());
  const loader = new GLTFLoader();
  const tasks = Object.keys(URBAN).map(
    (name) =>
      new Promise<void>((resolve) => {
        loader.load(
          `${BASE}urban/${name}.glb`,
          (gltf) => {
            gltf.scene.traverse((o) => {
              const m = o as THREE.Mesh;
              if (!m.isMesh) return;
              m.castShadow = m.receiveShadow = true;
              const mat = m.material as THREE.MeshStandardMaterial;
              mat.roughness = 0.9;
              mat.metalness = 0;
              if (mat.map) {
                mat.map.magFilter = THREE.NearestFilter; // Pixel-Paletten bleiben scharf
                mat.map.anisotropy = 4;
              }
            });
            loaded.set(name, gltf.scene);
            resolve();
          },
          undefined,
          () => resolve(),
        );
      }),
  );
  return (started = Promise.all(tasks).then(() => undefined));
}

/** Kopie eines Modells (geteilte Geometrie und Materialien) in Metern, oder null wenn es nicht geladen ist. */
export function urbanClone(name: string): THREE.Object3D | null {
  const src = loaded.get(name);
  if (!src) return null;
  const o = src.clone(true);
  const s = URBAN[name].scale;
  o.scale.setScalar(s);
  return o;
}
