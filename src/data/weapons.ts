/**
 * Nahkampfwaffen: Schaden (Spanne), Reichweite, Schwungzeit, Lärm. Die Waffe liegt als Ausrüstung in der Hand;
 * ohne Waffe kämpft man mit den Fäusten.
 */
export type WeaponLook = 'fist' | 'bat' | 'knife' | 'axe' | 'pipe' | 'sledge';

export interface WeaponDef {
  id: string;
  name: string;
  min: number;
  max: number;
  /** Reichweite in Metern */
  range: number;
  /** Trefferbogen in Grad */
  arc: number;
  /** Dauer eines Schlags in Sekunden */
  swing: number;
  /** Lärmradius eines Schlags (lockt Zombies) in Metern */
  noise: number;
  /** wie viele Gegner ein Schlag trifft */
  targets: number;
  /** Rückstoß in Metern */
  push: number;
  /** Energie, die ein Schlag kostet (0..100) */
  energy: number;
  look: WeaponLook;
}

export const FISTS: WeaponDef = { id: 'fists', name: 'Fäuste', min: 3, max: 5, range: 1.3, arc: 100, swing: 0.45, noise: 4, targets: 1, push: 0.2, energy: 0.25, look: 'fist' };

export const WEAPONS: Record<string, WeaponDef> = {
  bat: { id: 'bat', name: 'Baseballschläger', min: 12, max: 18, range: 1.9, arc: 120, swing: 0.62, noise: 10, targets: 1, push: 0.5, energy: 0.5, look: 'bat' },
  pipe: { id: 'pipe', name: 'Eisenrohr', min: 9, max: 14, range: 1.8, arc: 110, swing: 0.55, noise: 11, targets: 1, push: 0.4, energy: 0.45, look: 'pipe' },
  knife: { id: 'knife', name: 'Küchenmesser', min: 6, max: 9, range: 1.4, arc: 80, swing: 0.38, noise: 4, targets: 1, push: 0.1, energy: 0.2, look: 'knife' },
  machete: { id: 'machete', name: 'Machete', min: 11, max: 16, range: 1.7, arc: 130, swing: 0.45, noise: 6, targets: 2, push: 0.3, energy: 0.4, look: 'bat' },
  crowbar: { id: 'crowbar', name: 'Brecheisen', min: 13, max: 19, range: 1.8, arc: 100, swing: 0.6, noise: 12, targets: 1, push: 0.5, energy: 0.55, look: 'pipe' },
  hammer: { id: 'hammer', name: 'Hammer', min: 8, max: 12, range: 1.5, arc: 90, swing: 0.5, noise: 9, targets: 1, push: 0.3, energy: 0.35, look: 'pipe' },
  sledgehammer: { id: 'sledgehammer', name: 'Vorschlaghammer', min: 20, max: 30, range: 1.8, arc: 110, swing: 1.0, noise: 16, targets: 2, push: 0.9, energy: 1.0, look: 'sledge' },
  axe: { id: 'axe', name: 'Axt', min: 16, max: 24, range: 1.9, arc: 130, swing: 0.78, noise: 12, targets: 2, push: 0.55, energy: 0.7, look: 'axe' },
};

/** Waffe in der Hand (Item-ID oder null) */
export function weaponOf(handItem: string | null): WeaponDef {
  return (handItem && WEAPONS[handItem]) || FISTS;
}

/** Anteil der Schwungzeit, an dem der Schlag trifft */
export const IMPACT_AT = 0.5;
export const CRIT_CHANCE = 0.1;
