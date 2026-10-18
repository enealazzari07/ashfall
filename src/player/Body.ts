/**
 * Körperteile mit Wunden. Jede Wunde hat ihre eigene Blutung, Behandlung (Verband, Naht, Desinfektion, Schiene),
 * Heilung und Infektion. `Health` (Health.ts) rechnet das stündlich durch.
 */
export const PARTS = ['head', 'torso', 'armL', 'armR', 'handL', 'handR', 'legL', 'legR', 'footL', 'footR'] as const;
export type PartId = (typeof PARTS)[number];

export const PART_NAME: Record<PartId, string> = {
  head: 'Kopf',
  torso: 'Oberkörper',
  armL: 'Linker Arm',
  armR: 'Rechter Arm',
  handL: 'Linke Hand',
  handR: 'Rechte Hand',
  legL: 'Linkes Bein',
  legR: 'Rechtes Bein',
  footL: 'Linker Fuß',
  footR: 'Rechter Fuß',
};

export type WoundKind = 'scratch' | 'cut' | 'deep' | 'bite' | 'fracture';

export const WOUND_NAME: Record<WoundKind, string> = {
  scratch: 'Kratzer',
  cut: 'Schnitt',
  deep: 'Tiefe Wunde',
  bite: 'Biss',
  fracture: 'Knochenbruch',
};

export interface Wound {
  kind: WoundKind;
  label: string;
  /** Spielstunden seit der Verletzung, die schon als Heilung zählen */
  healed: number;
  /** Stunden, die die Wunde noch blutet (0 = blutet nicht) */
  bleed: number;
  /** Ein Verband liegt an (auch wenn er abgelaufen und damit schmutzig ist) */
  bandaged: boolean;
  /** Stunden, die der Verband noch hält */
  bandageLife: number;
  stitched: boolean;
  /** Stunden, in denen die Wunde desinfiziert und gegen Keime geschützt ist */
  alcohol: number;
  /** 0..100 */
  infection: number;
  splint: boolean;
}

export interface WoundSpec {
  /** Sofortschaden in HP */
  damage: number;
  /** Blutzeit in Stunden (min, max) */
  bleed: [number, number];
  /** HP-Verlust pro Stunde, solange die Wunde blutet */
  bleedRate: number;
  /** Heilungsdauer in Stunden */
  heal: number;
  /** Schmerz */
  pain: number;
  /** Infektionswahrscheinlichkeit pro Stunde einer offenen Wunde */
  infect: number;
}

export const WOUND: Record<WoundKind, WoundSpec> = {
  scratch: { damage: 2, bleed: [0.5, 1], bleedRate: 3, heal: 12, pain: 4, infect: 0.008 },
  cut: { damage: 6, bleed: [2, 4], bleedRate: 10, heal: 36, pain: 10, infect: 0.02 },
  deep: { damage: 14, bleed: [8, 12], bleedRate: 22, heal: 72, pain: 26, infect: 0.045 },
  bite: { damage: 8, bleed: [1.5, 3.5], bleedRate: 9, heal: 120, pain: 20, infect: 0.03 },
  fracture: { damage: 10, bleed: [0, 0], bleedRate: 0, heal: 288, pain: 38, infect: 0 },
};

/** Heilungsdauer eines Bruchs mit Schiene */
export const FRACTURE_HEAL_SPLINTED = 144;
export const BANDAGE_HOURS = 8;
export const ALCOHOL_HOURS = 4;

export interface BodyPart {
  id: PartId;
  wounds: Wound[];
  /** zusätzlicher Schmerz durch Behandlung (Nähen, Desinfizieren); klingt ab */
  extraPain: number;
}

export function newBody(): Record<PartId, BodyPart> {
  const body = {} as Record<PartId, BodyPart>;
  for (const id of PARTS) body[id] = { id, wounds: [], extraPain: 0 };
  return body;
}

export function makeWound(kind: WoundKind, label: string, r: () => number): Wound {
  const [lo, hi] = WOUND[kind].bleed;
  return {
    kind,
    label,
    healed: 0,
    bleed: hi > 0 ? lo + r() * (hi - lo) : 0,
    bandaged: false,
    bandageLife: 0,
    stitched: false,
    alcohol: 0,
    infection: 0,
    splint: false,
  };
}

/** Blutet die Wunde gerade? Verband (solange er hält) und Naht stoppen die Blutung. */
export function isBleeding(w: Wound): boolean {
  return w.bleed > 0 && !w.stitched && !(w.bandaged && w.bandageLife > 0);
}

/** Verband liegt an, ist aber abgelaufen */
export function isDirty(w: Wound): boolean {
  return w.bandaged && w.bandageLife <= 0;
}

export function healTime(w: Wound): number {
  if (w.kind === 'fracture') return w.splint ? FRACTURE_HEAL_SPLINTED : WOUND.fracture.heal;
  return WOUND[w.kind].heal * (w.stitched ? 0.6 : 1);
}

export function woundPain(w: Wound): number {
  const base = WOUND[w.kind].pain * (1 - Math.min(0.9, w.healed / healTime(w)) * 0.7);
  return base * (w.splint ? 0.5 : w.stitched ? 0.6 : 1);
}

export function partPain(p: BodyPart): number {
  return p.wounds.reduce((s, w) => s + woundPain(w), 0) + p.extraPain;
}
