import * as THREE from 'three';

/**
 * Bilder aus dem "Isometric Miniature Farm"-Paket von Kenney (CC0). Die Frontansichten (public/farm/a_*.png)
 * werden als Texturen und Kartenmodelle genutzt, die isometrischen Sprites (public/farm/i_*.png) als Symbole.
 * Pro Bild ist der sichtbare Ausschnitt bekannt: [x, y, Breite, Höhe] im 256x512-Bild.
 */
export const FARM_BOX: Record<string, [number, number, number, number]> = {
  chimneyBase: [66, 269, 167, 227], chimneyTop: [97, 269, 62, 227],
  cornDouble: [25, 211, 231, 290], cornYoungDouble: [44, 315, 175, 182], cornYoung: [44, 336, 175, 141], corn: [25, 232, 231, 248],
  dirtFarmland: [0, 319, 256, 193], dirt: [0, 319, 256, 193],
  fenceHighBroken: [0, 381, 256, 131], fenceHigh: [0, 381, 256, 131], fenceLowBroken: [0, 426, 256, 86], fenceLow: [0, 426, 256, 86],
  hayBalesStacked: [1, 323, 255, 133], hayBales: [57, 324, 162, 134], hay: [98, 357, 73, 96],
  ladderStandBroken: [90, 306, 137, 135], ladderStand: [90, 306, 137, 135], ladderStraight: [98, 231, 140, 196],
  planksCornerLeft: [0, 319, 256, 193], planksCornerRight: [0, 319, 256, 193], planksHighOld: [0, 297, 256, 212],
  planksHighSlope: [0, 321, 256, 188], planksHigh: [0, 297, 256, 212], planksHole: [0, 308, 256, 204], planksOld: [0, 308, 256, 204],
  planksSideVertical: [0, 308, 256, 204], planksSide: [0, 319, 256, 193], planks: [0, 308, 256, 204],
  roofCorner: [0, 322, 256, 190], roofInnerCorner: [0, 168, 256, 189], roofSingleWall: [0, 213, 256, 299], roofSingle: [0, 213, 256, 299],
  roof: [0, 168, 256, 344], sacksCrate: [65, 340, 144, 120], sack: [111, 380, 70, 52],
  woodWallCorner: [234, 306, 22, 206], woodWallCross: [0, 305, 256, 207], woodWallDiagional: [0, 305, 256, 207],
  woodWallDoorClosed: [0, 305, 256, 207], woodWallDoorOpen: [0, 280, 256, 232], woodWallDoorway: [0, 305, 256, 207],
  woodWallEmptyCross: [0, 305, 256, 207], woodWallEmptyDiagonal: [0, 305, 256, 207], woodWallEmptyOpen: [0, 305, 256, 207], woodWallEmpty: [0, 305, 256, 207],
  woodWallGateClosed: [0, 305, 256, 207], woodWallGateOpen: [0, 305, 256, 207], woodWallGateway: [0, 305, 256, 207],
  woodWallHoleCross: [0, 305, 256, 207], woodWallHoleDiagonal: [0, 305, 256, 207], woodWallHole: [0, 305, 256, 207],
  woodWallRoofLeft: [0, 331, 256, 181], woodWallRoofRight: [0, 331, 256, 181], woodWallSupport: [0, 305, 256, 207],
  woodWallWindowGlass: [0, 305, 256, 207], woodWallWindow: [0, 305, 256, 207], woodWall: [0, 305, 256, 207],
};

/** Seitenverhältnis (Breite / Höhe) des sichtbaren Ausschnitts */
export const farmAspect = (name: string): number => {
  const b = FARM_BOX[name];
  return b ? b[2] / b[3] : 1;
};

const BASE = (typeof import.meta !== 'undefined' && (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL) || './';
export const farmIconURL = (name: string): string => `${BASE}farm/i_${name}.png`;

const cache = new Map<string, THREE.Texture>();

/**
 * Zugeschnittene Textur eines Frontbildes. Sie ist sofort verwendbar und füllt sich, sobald das Bild geladen ist.
 * `repeat`: kachelbar (für Wände, Böden, Dächer).
 */
export function farmTexture(name: string, repeat = false): THREE.Texture {
  const key = `${name}|${repeat}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') {
    const t = new THREE.Texture();
    cache.set(key, t);
    return t;
  }
  const b = FARM_BOX[name];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  else {
    // Karten mit dünnen Strukturen (Mais, Zaun, Leiter) behalten ihren Alphakanal nur ohne Mipmaps
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
  }
  const img = new Image();
  img.onload = () => {
    canvas.width = b[2];
    canvas.height = b[3];
    canvas.getContext('2d')!.drawImage(img, b[0], b[1], b[2], b[3], 0, 0, b[2], b[3]);
    tex.dispose(); // Größe hat sich geändert: GPU-Textur neu anlegen
    tex.needsUpdate = true;
  };
  img.src = `${BASE}farm/a_${name}.png`;
  cache.set(key, tex);
  return tex;
}
