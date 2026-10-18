/**
 * Sichtfeld wie in Project Zomboid: nur nach vorne und zu den Seiten sieht man alles (auch durch Fenster ins Haus),
 * hinten und hinter Wänden ist es dunkel und Figuren sind unsichtbar.
 * Die Form ist ein Strahlenfächer um den Spieler: je Winkel die freie Entfernung bis zur ersten Wand,
 * begrenzt auf die Sichtweite, gewichtet mit einem Kegel nach vorn und einem kleinen Rundumkreis.
 * Derselbe Fächer geht als Uniform an den Shader, `sees()` nutzt ihn für Zombies und NPCs.
 */
export const RAYS = 128;

export interface VisionParams {
  /** Halber Öffnungswinkel des Kegels (Rad) */
  coneHalf: number;
  /** Weicher Rand außerhalb des Kegels (Rad) */
  coneSoft: number;
  /** Rundumsicht in Metern, auch hinter dem Rücken */
  nearR: number;
  /** Helligkeit außerhalb des Sichtfelds (0 = schwarz, 1 = aus) */
  dim: number;
}

export const DEFAULT_VISION: VisionParams = {
  coneHalf: (70 * Math.PI) / 180,
  coneSoft: (12 * Math.PI) / 180,
  nearR: 3,
  dim: 0.3,
};

const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Kleinster Winkelabstand (0..π) */
export const angDiff = (a: number, b: number): number => {
  const d = Math.abs(((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI);
  return d;
};

export class Vision {
  readonly rays = new Float32Array(RAYS);
  /** Spielerposition und Blickrichtung (Rad, atan2(x, z)) */
  x = 0;
  z = 0;
  facing = 0;
  range = 18;
  enabled = true;
  /** Aufgehellte Stellen (z. B. Zombie, der gerade zugeschlagen hat), max. 4 */
  spots: { x: number; z: number; k: number }[] = [];
  params: VisionParams = { ...DEFAULT_VISION };

  /** Freie Entfernung in Blickrichtung `a` (linear zwischen den Strahlen) */
  clearance(a: number): number {
    const f = (((a % TAU) + TAU) % TAU) / TAU * RAYS;
    const i = Math.floor(f) % RAYS, j = (i + 1) % RAYS;
    // Von den beiden Nachbarstrahlen den kürzeren nehmen, damit Wandecken nicht durchscheinen
    return Math.min(this.rays[i], this.rays[j]);
  }

  /**
   * Sichtbarkeit eines Bodenpunkts 0..1 (derselbe Ablauf wie im Shader).
   * `slack`: wie weit hinter einer Wand noch hell ist (Shader: 1,4 m, weil Wandoberseiten dahinter landen; Figuren: eng).
   */
  visibility(x: number, z: number, slack = 1.4): number {
    if (!this.enabled) return 1;
    const dx = x - this.x, dz = z - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) return 1;
    const a = Math.atan2(dx, dz);
    const free = this.clearance(a);
    // hinter einer Wand
    const reach = 1 - smooth(free - 0.2, free + slack, d);
    const p = this.params;
    const off = angDiff(a, this.facing);
    const cone = 1 - smooth(p.coneHalf, p.coneHalf + p.coneSoft, off);
    const inRange = 1 - smooth(this.range * 0.8, this.range, d);
    const near = 1 - smooth(p.nearR * 0.7, p.nearR, d);
    // Rundumkreis wird ebenfalls von Wänden begrenzt, aber nicht abgedunkelt wie die Fernsicht
    return Math.max(cone * inRange, near) * reach;
  }

  /** Ist an dieser Stelle etwas zu sehen (für Zombies, NPCs, Marker)? */
  sees(x: number, z: number): boolean {
    return this.visibility(x, z, 0.3) > 0.35;
  }
}
