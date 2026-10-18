import type { EquipSlot } from '../data/items';
import { item } from '../data/items';
import { CRIT_CHANCE, WeaponDef } from '../data/weapons';
import type { Health } from '../player/Health';
import type { PartId, WoundKind } from '../player/Body';

export interface Hittable {
  x: number;
  z: number;
  alive: boolean;
  /** true, wenn das Ziel dabei stirbt */
  hit(damage: number, pushX: number, pushZ: number, from?: { x: number; z: number }): boolean;
}

/** Gegner, die ein Schlag trifft: in Reichweite und im Trefferbogen, die nächsten zuerst. */
export function meleeTargets<T extends Hittable>(px: number, pz: number, yaw: number, w: WeaponDef, list: readonly T[]): T[] {
  const half = ((w.arc / 2) * Math.PI) / 180;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const out: { t: T; d: number }[] = [];
  for (const t of list) {
    if (!t.alive) continue;
    const dx = t.x - px, dz = t.z - pz;
    const d = Math.hypot(dx, dz);
    if (d > w.range) continue;
    // ganz nah (innerhalb von 0.5 m) trifft man immer
    if (d > 0.5) {
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d)));
      if (ang > half) continue;
    }
    out.push({ t, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, w.targets).map((x) => x.t);
}

export interface Roll {
  damage: number;
  crit: boolean;
}

export function rollDamage(w: WeaponDef, r: () => number, strength = 1): Roll {
  const base = w.min + r() * (w.max - w.min);
  const crit = r() < CRIT_CHANCE;
  return { damage: base * strength * (crit ? 2 : 1), crit };
}

/** Führt einen Schlag aus: trifft die Ziele, die der Schlag erreicht, und liefert Treffer und Kills. */
export function swingAt<T extends Hittable>(
  px: number,
  pz: number,
  yaw: number,
  w: WeaponDef,
  list: readonly T[],
  r: () => number,
  strength = 1,
): { hits: { target: T; damage: number; crit: boolean; killed: boolean }[] } {
  const hits = meleeTargets(px, pz, yaw, w, list).map((t) => {
    const roll = rollDamage(w, r, strength);
    const dx = t.x - px, dz = t.z - pz;
    const d = Math.hypot(dx, dz) || 1;
    const killed = t.hit(roll.damage, (dx / d) * w.push, (dz / d) * w.push, { x: px, z: pz });
    return { target: t, damage: roll.damage, crit: roll.crit, killed };
  });
  return { hits };
}

// --- Zombie schlägt zu ----------------------------------------------------------

/** Welcher Ausrüstungsplatz schützt welches Körperteil */
export const PART_SLOT: Partial<Record<PartId, EquipSlot>> = {
  head: 'head',
  torso: 'body',
  armL: 'body',
  armR: 'body',
  legL: 'legs',
  legR: 'legs',
  footL: 'feet',
  footR: 'feet',
};

/** Trefferwahrscheinlichkeit je Körperteil (Gewicht) */
const PART_WEIGHT: [PartId, number][] = [
  ['torso', 28], ['armL', 17], ['armR', 17], ['legL', 10], ['legR', 10], ['head', 6], ['handL', 4], ['handR', 4], ['footL', 2], ['footR', 2],
];

export type StrikeResult =
  | { kind: 'miss' }
  | { kind: 'blocked'; part: PartId }
  | { kind: 'wound'; part: PartId; wound: WoundKind; virus: boolean };

/** Schutz in Prozent, den die Kleidung am Körperteil bietet */
export function defenseOf(part: PartId, equipment: Readonly<Record<EquipSlot, string | null>>): number {
  const slot = PART_SLOT[part];
  const id = slot ? equipment[slot] : null;
  return id ? item(id).equip?.defense ?? 0 : 0;
}

export function pickPart(r: () => number): PartId {
  const total = PART_WEIGHT.reduce((s, p) => s + p[1], 0);
  let x = r() * total;
  for (const [id, w] of PART_WEIGHT) if ((x -= w) < 0) return id;
  return 'torso';
}

/**
 * Ein Zombie greift an: kann danebengehen, an der Kleidung abprallen (sie reißt nur) oder verletzen:
 * meist Kratzer, manchmal Schnitt, selten ein Biss (der infiziert).
 */
export function zombieStrike(health: Health, equipment: Readonly<Record<EquipSlot, string | null>>, r: () => number = Math.random): StrikeResult {
  if (r() < 0.15) return { kind: 'miss' };
  const part = pickPart(r);
  if (r() * 100 < defenseOf(part, equipment)) return { kind: 'blocked', part };
  const roll = r();
  const wound: WoundKind = roll < 0.55 ? 'scratch' : roll < 0.8 ? 'cut' : 'bite';
  health.wound(part, wound, 'Zombie-Angriff', r);
  const virus = wound === 'bite';
  if (virus) health.infect(r);
  return { kind: 'wound', part, wound, virus };
}
