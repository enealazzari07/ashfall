import * as THREE from 'three';

/** Box, deren UVs in Metern gekachelt sind (tileU x tileV Meter pro Textur). */
export function makeBox(w: number, h: number, d: number, tileU: number, tileV: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // Face-Reihenfolge: +x, -x, +y, -y, +z, -z (je 4 Vertices)
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tileU, (uv.getY(i) * dims[f][1]) / tileV);
    }
  }
  return g;
}

export function planeXZ(w: number, d: number, tileU: number, tileV: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tileU, (uv.getY(i) * d) / tileV);
  return g;
}

const q = new THREE.Quaternion();
const e = new THREE.Euler();
const p = new THREE.Vector3();
const s = new THREE.Vector3();
const c = new THREE.Color();

export function mat4(x: number, y: number, z: number, rotY = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  e.set(0, rotY, 0);
  q.setFromEuler(e);
  return new THREE.Matrix4().compose(p.set(x, y, z), q, s.set(sx, sy, sz));
}

export interface Inst {
  m: THREE.Matrix4;
  color?: number;
}

/** Viele gleiche Objekte in einem Draw-Call. Gibt null zurück, wenn es nichts zu zeichnen gibt. */
export function instanced(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  items: Inst[],
  castShadow = true,
): THREE.InstancedMesh | null {
  if (!items.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    im.setMatrixAt(i, it.m);
    if (it.color !== undefined) im.setColorAt(i, c.setHex(it.color));
  });
  im.castShadow = castShadow;
  im.receiveShadow = true;
  im.frustumCulled = false;
  im.instanceMatrix.needsUpdate = true;
  return im;
}
