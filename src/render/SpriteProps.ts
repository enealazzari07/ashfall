import * as THREE from 'three';
import { Prop } from '../world/CityGenerator';

/**
 * Möbel als isometrische Sprites ("Isometric Kitchen Sprites"): jedes Stück hat vier Ansichten (a–d),
 * je nach Blickrichtung von Möbel und Kamera wird die passende gezeigt. Die Karte dreht sich zur Kamera.
 * Ansicht a: Front zeigt nach links unten, b: rechts unten, c: rechts oben, d: links oben.
 */
const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || './';

/** Möbelart (PropKind.id) -> Bildreihen in public/sprites */
export const SPRITE_SETS: Record<string, string[]> = {
  // Leer: Die Kamera dreht jetzt stufenlos mit der Maus, die vier festen Sprite-Ansichten passen dazu nicht.
  // Die Möbel kommen stattdessen als 3D-Modelle aus Props.ts.
};

interface SpriteSet { views: THREE.CanvasTexture[]; aspect: number; ready: boolean; waiting: (() => void)[] }
const sets = new Map<string, SpriteSet>();

function loadSet(name: string): SpriteSet {
  const hit = sets.get(name);
  if (hit) return hit;
  const set: SpriteSet = { views: [], aspect: 1, ready: false, waiting: [] };
  sets.set(name, set);
  if (typeof document === 'undefined') return set;
  const imgs = ['a', 'b', 'c', 'd'].map(() => new Image());
  let left = 4;
  const done = () => {
    if (--left > 0) return;
    // gemeinsamer sichtbarer Ausschnitt aller vier Ansichten
    let x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0;
    const datas = imgs.map((img) => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height);
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          const r = d.data[i], gr = d.data[i + 1], b = d.data[i + 2], a = d.data[i + 3];
          // weicher grauer Bodenschatten des Sprites fällt weg
          if (a < 200 && Math.abs(r - gr) < 14 && Math.abs(gr - b) < 14) {
            d.data[i + 3] = 0;
            continue;
          }
          if (a > 120) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      g.putImageData(d, 0, 0);
      return c;
    });
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    set.aspect = w / h;
    set.views = datas.map((src) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.drawImage(src, x0, y0, w, h, 0, 0, w, h);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    });
    set.ready = true;
    for (const fn of set.waiting) fn();
    set.waiting.length = 0;
  };
  imgs.forEach((img, i) => {
    img.onload = done;
    img.onerror = done;
    img.src = `${BASE}sprites/${name}${'abcd'[i]}.png`;
  });
  return set;
}

const planeGeo = (() => {
  const g = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); // wie eine Bodenfläche beleuchtet
  return g;
})();

/** Sprite-Möbelstück. Das Material wird mit zurückgegeben, damit Räume es abdunkeln können. */
export function spriteProp(kindId: string, p: Prop): { mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial } | null {
  const names = SPRITE_SETS[kindId];
  if (!names || typeof document === 'undefined') return null;
  const idx = Math.abs(Math.floor(p.x * 7 + p.z * 13)) % names.length;
  const set = loadSet(names[idx]);
  const mat = new THREE.MeshLambertMaterial({ alphaTest: 0.5, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(planeGeo, mat);
  mesh.userData.sprite = kindId;
  const H = p.h * 1.15;
  const place = () => {
    mesh.scale.set(H * set.aspect, H, 1);
    mesh.position.set(p.x, H * 0.06, p.z);
    mat.map = set.views[0];
    mat.needsUpdate = true;
  };
  mesh.position.set(p.x, 0, p.z);
  mesh.scale.set(0.001, 0.001, 1);
  if (set.ready) place();
  else set.waiting.push(place);
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  mesh.onBeforeRender = (_r, _s, camera) => {
    if (!set.ready) return;
    const e = camera.matrixWorld.elements;
    const rl = Math.hypot(e[0], e[2]) || 1, rx = e[0] / rl, rz = e[2] / rl;
    const dl = Math.hypot(e[8], e[10]) || 1, tx = e[8] / dl, tz = e[10] / dl; // Richtung zur Kamera
    mesh.rotation.y = Math.atan2(-rz, rx);
    mesh.updateMatrix();
    mesh.matrixWorld.copy(mesh.matrix);
    const a = Math.atan2(fx * rx + fz * rz, fx * tx + fz * tz);
    const v = a < 0 ? (a > -Math.PI / 2 ? 0 : 3) : a < Math.PI / 2 ? 1 : 2;
    if (mat.map !== set.views[v]) {
      mat.map = set.views[v];
      mat.needsUpdate = true;
    }
  };
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  return { mesh, mat };
}
