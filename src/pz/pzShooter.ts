/**
 * Schießen im Spiel: verwaltet Munition je Waffe, Treffer entlang des Strahls (Wände halten Kugeln auf)
 * und Nachladen aus dem Rucksack. Reine Logik ohne Spiel-Abhängigkeit, das Spiel ruft nur `shoot` und `startReload` auf.
 */
import { FirearmDef, GunState, PZ_FIREARMS, falloff, fire, newGun, reload as reloadGun } from './pzWeapons';

export interface ShootTarget {
  x: number;
  z: number;
  alive: boolean;
  hit(damage: number, pushX: number, pushZ: number, from?: { x: number; z: number }): boolean;
}

/** Wandstück als Achsen-Box (Mitte + Größe), wie `Box` im Stadtgenerator */
export interface Blocker {
  x: number;
  z: number;
  w: number;
  d: number;
  off?: boolean;
}

/** Entfernung entlang des Strahls (ox,oz)+t·(dx,dz) bis zum Eintritt in die Box, oder null */
export function rayBox(ox: number, oz: number, dx: number, dz: number, b: Blocker): number | null {
  if (b.off) return null;
  const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
  let tmin = 0, tmax = Infinity;
  for (const [o, d, lo, hi] of [[ox, dx, x0, x1], [oz, dz, z0, z1]] as const) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
    } else {
      let a = (lo - o) / d, c = (hi - o) / d;
      if (a > c) [a, c] = [c, a];
      tmin = Math.max(tmin, a);
      tmax = Math.min(tmax, c);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

/** Nächstes Ziel auf dem Strahl (Treffer-Radius `rad`), das vor der nächsten Wand liegt */
export function rayTarget<T extends ShootTarget>(ox: number, oz: number, dx: number, dz: number, maxDist: number, targets: readonly T[], blockers: readonly Blocker[] = [], rad = 0.42): { target: T; dist: number } | null {
  let wall = maxDist;
  for (const b of blockers) {
    const t = rayBox(ox, oz, dx, dz, b);
    if (t !== null && t < wall) wall = t;
  }
  let best: { target: T; dist: number } | null = null;
  for (const t of targets) {
    if (!t.alive) continue;
    const vx = t.x - ox, vz = t.z - oz;
    const along = vx * dx + vz * dz;
    if (along < 0.2 || along > wall) continue;
    const perp = Math.abs(vx * dz - vz * dx);
    if (perp > rad) continue;
    if (!best || along < best.dist) best = { target: t, dist: along };
  }
  return best;
}

export interface ShotReport {
  fired: boolean;
  why?: 'empty' | 'cooldown';
  hits: { target: ShootTarget; damage: number; killed: boolean }[];
  noise: number;
  recoil: number;
  /** laute Waffe (Gewehr/Schrot) für den Knall */
  heavy: boolean;
}

export class Shooter {
  private guns = new Map<string, GunState>();

  /** Zustand der Waffe (legt sie leer an) */
  state(def: FirearmDef): GunState {
    let s = this.guns.get(def.id);
    if (!s) this.guns.set(def.id, (s = newGun(def)));
    return s;
  }

  loaded(id: string): number {
    return this.guns.get(id)?.loaded ?? 0;
  }

  /** Abzug: Kugeln fliegen in Zielrichtung `yaw` (Spielfigur schaut mit sin/cos), Treffer werden sofort angewandt. */
  shoot(def: FirearmDef, now: number, px: number, pz: number, yaw: number, targets: readonly ShootTarget[], rng: () => number, strength = 1, blockers: readonly Blocker[] = []): ShotReport {
    const st = this.state(def);
    const r = fire(st, def, now, Math.sin(yaw), Math.cos(yaw), rng);
    const out: ShotReport = { fired: r.fired, why: r.why, hits: [], noise: r.noise, recoil: r.recoil, heavy: def.noise >= 80 };
    if (!r.fired) return out;
    // Mündung etwas vor dem Körper
    const ox = px + Math.sin(yaw) * 0.5, oz = pz + Math.cos(yaw) * 0.5;
    for (const s of r.shots) {
      const h = rayTarget(ox, oz, s.dx, s.dz, def.range * 2, targets, blockers);
      if (!h) continue;
      const dmg = s.damage * falloff(def, h.dist) * strength;
      const killed = h.target.hit(dmg, s.dx * 0.25, s.dz * 0.25, { x: px, z: pz });
      out.hits.push({ target: h.target, damage: dmg, killed });
    }
    return out;
  }

  /**
   * Nachladen vorbereiten: `reserve` = Patronen im Rucksack. Liefert Dauer und Patronenzahl;
   * erst `finishReload` (nach Ablauf der Zeit) bucht sie um.
   */
  planReload(def: FirearmDef, reserve: number): { used: number; time: number; loaded: number } {
    return reloadGun(this.state(def), def, reserve);
  }

  finishReload(def: FirearmDef, loaded: number): void {
    this.state(def).loaded = Math.min(def.mag, loaded);
  }

  /** Für den Spielstand */
  save(): Record<string, number> {
    const o: Record<string, number> = {};
    for (const [id, s] of this.guns) if (s.loaded > 0) o[id] = s.loaded;
    return o;
  }

  load(data: Record<string, number> | undefined): void {
    this.guns.clear();
    for (const [id, n] of Object.entries(data ?? {})) {
      const def = PZ_FIREARMS[id];
      if (def) this.guns.set(id, newGun(def, n));
    }
  }
}
