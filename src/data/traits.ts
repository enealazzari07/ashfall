import type { SkillId } from './skills';

/** Wirkungen einer Eigenschaft: Faktoren werden multipliziert, `carry` addiert */
export interface TraitFx {
  hunger?: number;
  thirst?: number;
  fatigue?: number;
  /** Schrittlärm */
  noise?: number;
  /** XP-Faktor für alles */
  learn?: number;
  /** Zusätzliche Tragkraft in kg */
  carry?: number;
  /** Stress durch Gefahr */
  panic?: number;
  /** Nahkampfschaden */
  damage?: number;
  /** Kälteempfinden */
  cold?: number;
  /** Schlafqualität */
  sleep?: number;
}

export interface TraitDef {
  id: string;
  name: string;
  desc: string;
  /** Punkte: positiv = Vorteil (kostet), negativ = Nachteil (gibt Punkte) */
  cost: number;
  /** Schließt diese Eigenschaften aus (beidseitig gepflegt: siehe `excludes`) */
  excl?: string[];
  fx?: TraitFx;
  /** Boost-Stufen für Fertigkeiten */
  boost?: Partial<Record<SkillId, number>>;
}

export const TRAITS: TraitDef[] = [
  { id: 'athletic', name: 'Sportlich', desc: 'Ermüdet langsamer und lernt Ausdauer und Sprinten schneller.', cost: 4, excl: ['unfit'], fx: { fatigue: 0.88 }, boost: { fitness: 2, sprinting: 1 } },
  { id: 'strong', name: 'Kräftig', desc: 'Trägt mehr und lernt Kraft schneller.', cost: 4, excl: ['weak'], fx: { carry: 3 }, boost: { strength: 2 } },
  { id: 'fastlearner', name: 'Schneller Lerner', desc: 'Alle Fertigkeiten steigen 30 % schneller.', cost: 4, excl: ['slowlearner'], fx: { learn: 1.3 } },
  { id: 'frugal', name: 'Genügsam', desc: 'Hunger und Durst kommen langsamer.', cost: 3, excl: ['hungry'], fx: { hunger: 0.75, thirst: 0.8 } },
  { id: 'lightfoot', name: 'Leichtfüßig', desc: 'Schritte sind leiser.', cost: 3, excl: ['clumsy'], fx: { noise: 0.7 }, boost: { sneak: 1 } },
  { id: 'brave', name: 'Furchtlos', desc: 'Gefahr bringt weniger Stress.', cost: 3, excl: ['coward'], fx: { panic: 0.6 } },
  { id: 'handy', name: 'Handwerker', desc: 'Lernt Tischlerei schneller.', cost: 3, boost: { carpentry: 1 } },
  { id: 'warmblood', name: 'Warmblütig', desc: 'Kälte macht weniger aus.', cost: 2, excl: ['chilly'], fx: { cold: 0.8 } },
  { id: 'slowlearner', name: 'Langsamer Lerner', desc: 'Alle Fertigkeiten steigen 25 % langsamer.', cost: -4, excl: ['fastlearner'], fx: { learn: 0.75 } },
  { id: 'weak', name: 'Schwächlich', desc: 'Trägt weniger.', cost: -4, excl: ['strong'], fx: { carry: -3 } },
  { id: 'unfit', name: 'Unsportlich', desc: 'Ermüdet schneller.', cost: -4, excl: ['athletic'], fx: { fatigue: 1.15 } },
  { id: 'hungry', name: 'Starker Appetit', desc: 'Hunger und Durst kommen schneller.', cost: -3, excl: ['frugal'], fx: { hunger: 1.3, thirst: 1.2 } },
  { id: 'coward', name: 'Schreckhaft', desc: 'Gefahr bringt viel mehr Stress.', cost: -4, excl: ['brave'], fx: { panic: 1.5 } },
  { id: 'clumsy', name: 'Ungeschickt', desc: 'Schritte sind laut, Schläge etwas schwächer.', cost: -3, excl: ['lightfoot'], fx: { noise: 1.35, damage: 0.93 } },
  { id: 'chilly', name: 'Kälteempfindlich', desc: 'Friert schneller.', cost: -3, excl: ['warmblood'], fx: { cold: 1.25 } },
  { id: 'lightsleeper', name: 'Leichter Schlaf', desc: 'Schlaf erholt weniger.', cost: -2, fx: { sleep: 0.85 } },
];

export const trait = (id: string): TraitDef | undefined => TRAITS.find((t) => t.id === id);

/** Ausschluss gilt in beide Richtungen, auch wenn nur eine Seite ihn nennt */
export function excludes(a: string, b: string): boolean {
  return (trait(a)?.excl?.includes(b) ?? false) || (trait(b)?.excl?.includes(a) ?? false);
}
