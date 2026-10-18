import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Türen, Regale, Spinde und Karton aus `public/models/world/world.glb`.
 * Türblätter: Scharnier bei x = 0, Breite 1, Höhe 1 (Dicke in Metern). Zargen: x -0.5..0.5, Höhe 1.
 * Möbel: Maße in Metern, Boden bei y = 0.
 */
const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || './';

export interface ModelPiece { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial }
const pieces = new Map<string, ModelPiece>();
let started: Promise<void> | null = null;

export const worldModel = (name: string): ModelPiece | undefined => pieces.get(name);
export const worldModelsReady = (): boolean => pieces.size > 0;

export function preloadWorldModels(): Promise<void> {
  if (started) return started;
  if (typeof document === 'undefined') return (started = Promise.resolve());
  const load = (file: string): Promise<void> =>
    new Promise<void>((resolve) => {
      new GLTFLoader().load(
        `${BASE}models/world/${file}`,
        (gltf) => {
          gltf.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            const mat = m.material as THREE.MeshStandardMaterial;
            mat.side = THREE.DoubleSide;
            if (mat.map) mat.map.anisotropy = 4;
            pieces.set(m.name, { geo: m.geometry, mat });
          });
          resolve();
        },
        undefined,
        () => resolve(),
      );
    });
  return (started = Promise.all([load('world.glb'), load('warehouse.glb')]).then(() => undefined));
}

/** Mesh aus dem Modellsatz (teilt Geometrie und Material) */
export function worldMesh(name: string): THREE.Mesh | null {
  const p = pieces.get(name);
  if (!p) return null;
  const m = new THREE.Mesh(p.geo, p.mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
