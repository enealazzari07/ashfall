import * as THREE from 'three';

/**
 * Satteldach mit Überstand. Unterkante bei y = 0, First bei y = rise, zentriert auf (0, 0).
 * `ridgeX`: First läuft entlang X, sonst entlang Z. UVs sind in Metern gekachelt (tile m pro Textur).
 */
export function gableRoof(w: number, d: number, ridgeX: boolean, rise: number, over = 0.5, tile = 3): THREE.BufferGeometry {
  const L = (ridgeX ? w : d) + 2 * over; // Länge entlang des Firsts
  const S = (ridgeX ? d : w) + 2 * over; // Breite quer dazu
  const slope = Math.hypot(S / 2, rise);

  const pos: number[] = [];
  const uv: number[] = [];
  const quad = (a: number[], b: number[], c: number[], dd: number[], ul: number, vl: number) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...dd);
    uv.push(0, 0, ul / tile, 0, ul / tile, vl / tile, 0, 0, ul / tile, vl / tile, 0, vl / tile);
  };
  const tri = (a: number[], b: number[], c: number[], base: number, hgt: number) => {
    pos.push(...a, ...b, ...c);
    uv.push(0, 0, base / tile, 0, base / (2 * tile), hgt / tile);
  };

  const x0 = -L / 2, x1 = L / 2, z0 = -S / 2, z1 = S / 2;
  quad([x0, 0, z0], [x1, 0, z0], [x1, rise, 0], [x0, rise, 0], L, slope); // Nordseite
  quad([x1, 0, z1], [x0, 0, z1], [x0, rise, 0], [x1, rise, 0], L, slope); // Südseite
  // Giebelwände sitzen bündig über der Hauswand (Überstand nach innen versetzt)
  tri([x0 + over, 0, z1], [x0 + over, 0, z0], [x0 + over, rise, 0], S, rise); // Giebel links
  tri([x1 - over, 0, z0], [x1 - over, 0, z1], [x1 - over, rise, 0], S, rise); // Giebel rechts

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  if (!ridgeX) g.rotateY(Math.PI / 2);
  return g;
}
