/**
 * Fertigkeiten: Stufe 0–10, XP-Kurve als Tabelle. Wirkungen stehen als kleine Funktionen daneben,
 * damit Spielcode nur `SKILL_FX.xyz(level)` aufruft und alle Zahlen an einer Stelle liegen.
 */
export type SkillId =
  | 'blunt' | 'blade' | 'axe' | 'aiming'
  | 'carpentry' | 'cooking' | 'mechanics'
  | 'firstaid'
  | 'fitness' | 'strength'
  | 'sprinting' | 'sneak' | 'nimble';

export type SkillGroup = 'Kampf' | 'Handwerk' | 'Überleben' | 'Körper' | 'Bewegung';

export interface SkillDef {
  id: SkillId;
  name: string;
  group: SkillGroup;
  /** Was eine Stufe bringt (Anzeige) */
  perk: string;
}

export const SKILLS: SkillDef[] = [
  { id: 'blunt', name: 'Stumpfe Waffen', group: 'Kampf', perk: '+7 % Schaden je Stufe (Schläger, Rohr, Fäuste)' },
  { id: 'blade', name: 'Klingen', group: 'Kampf', perk: '+7 % Schaden je Stufe (Messer)' },
  { id: 'axe', name: 'Äxte', group: 'Kampf', perk: '+7 % Schaden je Stufe (Axt)' },
  { id: 'aiming', name: 'Schusswaffen', group: 'Kampf', perk: '+7 % Schaden je Stufe (Pistolen, Gewehre, Schrotflinten)' },
  { id: 'carpentry', name: 'Tischlerei', group: 'Handwerk', perk: '−4,5 % Bau- und Barrikadierzeit je Stufe' },
  { id: 'mechanics', name: 'Mechanik', group: 'Handwerk', perk: '+12 % Reparaturleistung und −4 % Arbeitszeit am Auto je Stufe' },
  { id: 'cooking', name: 'Kochen', group: 'Handwerk', perk: '+4 % Nährwert gekochter Speisen je Stufe' },
  { id: 'firstaid', name: 'Erste Hilfe', group: 'Überleben', perk: 'Verbände halten länger, Naht und Desinfektion sicherer, schnellere Behandlung' },
  { id: 'fitness', name: 'Ausdauer', group: 'Körper', perk: '−4 % Energieverbrauch je Stufe' },
  { id: 'strength', name: 'Kraft', group: 'Körper', perk: '+0,8 kg Tragkraft je Stufe' },
  { id: 'sprinting', name: 'Sprinten', group: 'Bewegung', perk: '+1,5 % Lauftempo je Stufe' },
  { id: 'sneak', name: 'Schleichen', group: 'Bewegung', perk: '−5 % Schrittlärm je Stufe' },
  { id: 'nimble', name: 'Gewandtheit', group: 'Bewegung', perk: '−4 % Kletterzeit je Stufe' },
];

export const SKILL_IDS = SKILLS.map((s) => s.id);
export const skillName = (id: SkillId): string => SKILLS.find((s) => s.id === id)?.name ?? id;

export const MAX_LEVEL = 10;
/** XP, die für die jeweils nächste Stufe nötig ist (Stufe 0→1, 1→2, …) */
export const XP_STEPS = [60, 130, 250, 450, 750, 1150, 1700, 2400, 3300, 4400];
/** Gesamt-XP, ab der eine Stufe erreicht ist */
export const XP_AT = XP_STEPS.reduce<number[]>((acc, s) => (acc.push((acc[acc.length - 1] ?? 0) + s), acc), []);

export function levelOf(xp: number): number {
  let l = 0;
  while (l < MAX_LEVEL && xp >= XP_AT[l]) l++;
  return l;
}

/** XP-Multiplikator nach Boost-Stufe (Beruf/Eigenschaft): ungeübt lernt man langsam */
export const BOOST_MULT = [0.5, 1, 1.3, 1.6];

/** Wirkungen je Stufe */
export const SKILL_FX = {
  /** Schadensfaktor einer Waffenfertigkeit */
  damage: (lvl: number) => 1 + 0.07 * lvl,
  /** Faktor auf die Bauzeit */
  buildTime: (lvl: number) => 1 - 0.045 * lvl,
  /** Faktor auf die Behandlungsdauer */
  treatTime: (lvl: number) => 1 - 0.04 * lvl,
  /** Reparaturleistung (Motorteile, Batterie) */
  repair: (lvl: number) => 1 + 0.12 * lvl,
  /** Faktor auf die Arbeitszeit am Auto */
  mechTime: (lvl: number) => 1 - 0.04 * lvl,
  /** Nährwert-Faktor für Essen */
  nutrition: (lvl: number) => 1 + 0.04 * lvl,
  /** Faktor auf den Energieverbrauch */
  energy: (lvl: number) => 1 - 0.04 * lvl,
  /** Zusätzliche Tragkraft in kg */
  carry: (lvl: number) => 0.8 * lvl,
  /** Faktor auf das Lauftempo beim Sprinten */
  sprint: (lvl: number) => 1 + 0.015 * lvl,
  /** Faktor auf den Schrittlärm */
  noise: (lvl: number) => 1 - 0.05 * lvl,
  /** Faktor auf die Kletterdauer */
  climb: (lvl: number) => 1 - 0.04 * lvl,
};
