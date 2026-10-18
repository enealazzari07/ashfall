import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Bäume aus `public/models/trees.glb`: vier Bäume aus der "Low Poly Tree Scene" (Rinde + Laub)
 * und zwei Low-Poly-Bäume. Jeder Baum ist auf 10 Einheiten Höhe normiert, der Fuß liegt bei y = 0.
 */
const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || './';

export interface GlbTree { parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] }

let trees: GlbTree[] = [];
let started: Promise<void> | null = null;

export const glbTrees = (): GlbTree[] => trees;

export function preloadGlbTrees(): Promise<void> {
  if (started) return started;
  if (typeof document === 'undefined') return (started = Promise.resolve());
  return (started = new Promise<void>((resolve) => {
    new GLTFLoader().load(
      `${BASE}models/trees.glb`,
      (gltf) => {
        const out: GlbTree[] = [];
        for (const node of gltf.scene.children) {
          const parts: GlbTree['parts'] = [];
          node.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            const mat = m.material as THREE.MeshStandardMaterial;
            mat.roughness = 0.95;
            mat.metalness = 0;
            if (mat.map) {
              mat.map.anisotropy = 4;
              mat.map.colorSpace = THREE.SRGBColorSpace;
            }
            parts.push({ geo: m.geometry, mat });
          });
          if (parts.length) out.push({ parts });
        }
        trees = out;
        resolve();
      },
      undefined,
      () => resolve(),
    );
  }));
}
