import { Vector3 } from 'three';
import { Box } from './CityGenerator';

/** Schiebt einen Kreis (Radius r) in der XZ-Ebene aus der Box heraus. */
export function pushOut(pos: Vector3, r: number, b: Box): void {
  if (b.off) return;
  const hx = b.w / 2 + r, hz = b.d / 2 + r;
  const ox = pos.x - b.x, oz = pos.z - b.z;
  if (Math.abs(ox) >= hx || Math.abs(oz) >= hz) return;
  const px = hx - Math.abs(ox), pz = hz - Math.abs(oz);
  if (px < pz) pos.x += Math.sign(ox || 1) * px;
  else pos.z += Math.sign(oz || 1) * pz;
}

/** AABB-Überlappung; `shrink` verkleinert beide Boxen, damit Kanten-an-Kante erlaubt bleibt. */
export function overlaps(a: Box, b: Box, shrink = 0): boolean {
  if (a.off || b.off) return false;
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 - shrink && Math.abs(a.z - b.z) < (a.d + b.d) / 2 - shrink
  );
}
