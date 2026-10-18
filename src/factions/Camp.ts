import * as THREE from 'three';
import { FactionDef } from '../data/factions';
import { Box } from '../world/CityGenerator';
import { campCenter } from './FactionWorld';

const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });

const tentGeo = new THREE.ConeGeometry(1.7, 2.1, 4).rotateY(Math.PI / 4).translate(0, 1.05, 0);
const crateGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9).translate(0, 0.45, 0);
const stoneGeo = new THREE.IcosahedronGeometry(0.14, 0);
const flameGeo = new THREE.ConeGeometry(0.2, 0.55, 6).translate(0, 0.3, 0);
const spikeGeo = new THREE.ConeGeometry(0.12, 1.1, 5).translate(0, 0.55, 0);
const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 4.2, 6).translate(0, 2.1, 0);
const flagGeo = new THREE.PlaneGeometry(1.4, 0.9);
const hayGeo = new THREE.CylinderGeometry(0.7, 0.8, 1.2, 10).translate(0, 0.6, 0);
const wagonGeo = new THREE.BoxGeometry(2.6, 1.1, 1.5).translate(0, 0.9, 0);
const canopyGeo = new THREE.BoxGeometry(2.7, 0.12, 1.7).translate(0, 2.0, 0);
const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.12, 12).rotateX(Math.PI / 2).translate(0, 0.45, 0);

function put(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, z: number, ry = 0, y = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}

/** Lagerdeko auf der Kreuzung des Fraktions-Chunks (8 x 8 m um die Mitte). */
export function buildCamp(group: THREE.Group, colliders: Box[], def: FactionDef): void {
  const { x, z } = campCenter(def);
  const cloth = std(def.color);
  const dark = std(0x3b342c);
  const wood = std(0x7a5a3a);

  // Feuerstelle (nur Deko, kein Licht)
  const stone = std(0x77777c);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    put(group, stoneGeo, stone, x + Math.cos(a) * 0.5, z + Math.sin(a) * 0.5, 0, 0.12);
  }
  put(group, flameGeo, new THREE.MeshBasicMaterial({ color: 0xff8a2a }), x, z);

  // Zelte in zwei Ecken
  for (const [dx, dz] of [[-2.7, -2.7], [2.7, -2.7]]) {
    put(group, tentGeo, cloth, x + dx, z + dz);
    colliders.push({ x: x + dx, z: z + dz, w: 2.2, d: 2.2 });
  }

  // Kisten
  for (const [dx, dz] of [[-3.2, 1.2], [-3.2, 2.2], [3.3, 2.0]]) {
    put(group, crateGeo, wood, x + dx, z + dz, dx);
    colliders.push({ x: x + dx, z: z + dz, w: 0.9, d: 0.9 });
  }

  // Fahne
  put(group, poleGeo, dark, x - 3.6, z);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshBasicMaterial({ color: def.color, side: THREE.DoubleSide }));
  flag.position.set(x - 3.6, 3.6, z + 0.7);
  group.add(flag);

  if (def.id === 'raiders') {
    for (let i = -3; i <= 3; i++) put(group, spikeGeo, dark, x + i * 1.0, z + 3.7, i * 0.4);
    colliders.push({ x, z: z + 3.7, w: 7, d: 0.4 });
  } else if (def.id === 'traders') {
    put(group, wagonGeo, wood, x + 1.2, z + 2.7);
    put(group, canopyGeo, cloth, x + 1.2, z + 2.7);
    put(group, wheelGeo, dark, x + 0.4, z + 3.5);
    put(group, wheelGeo, dark, x + 2.0, z + 3.5);
    colliders.push({ x: x + 1.2, z: z + 2.7, w: 2.6, d: 1.5 });
  } else {
    for (const [dx, dz] of [[1.6, 3.0], [3.0, 3.2]]) {
      put(group, hayGeo, std(0xd4b45a), x + dx, z + dz);
      colliders.push({ x: x + dx, z: z + dz, w: 1.4, d: 1.4 });
    }
  }
}
