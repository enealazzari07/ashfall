import type { Stack } from './items';
import type { SkillId } from './skills';

export interface ProfessionDef {
  id: string;
  name: string;
  desc: string;
  /** Punkte: positiv = kostet, negativ = gibt Punkte */
  cost: number;
  /** Boost-Stufen (0–3) je Fertigkeit */
  boost: Partial<Record<SkillId, number>>;
  /** Startstufen */
  start: Partial<Record<SkillId, number>>;
  /** Zusätzliche Startgegenstände im Rucksack */
  items: Stack[];
}

export const PROFESSIONS: ProfessionDef[] = [
  { id: 'unemployed', name: 'Arbeitslos', desc: 'Keine Vorkenntnisse, dafür mehr Punkte für Eigenschaften.', cost: -4, boost: {}, start: {}, items: [{ id: 'coin', qty: 4 }] },
  { id: 'construction', name: 'Bauarbeiter', desc: 'Kennt Holz und schwere Arbeit.', cost: 2, boost: { carpentry: 3, strength: 2 }, start: { carpentry: 2, strength: 1 }, items: [{ id: 'wood', qty: 2 }, { id: 'pipe', qty: 1 }] },
  { id: 'cook', name: 'Koch', desc: 'Weiß, was aus Vorräten wird, und kommt mit dem Messer klar.', cost: 2, boost: { cooking: 3, blade: 1 }, start: { cooking: 2, blade: 1 }, items: [{ id: 'knife', qty: 1 }, { id: 'bread', qty: 1 }, { id: 'beans', qty: 1 }] },
  { id: 'nurse', name: 'Krankenschwester', desc: 'Versorgt Wunden schnell und sicher.', cost: 4, boost: { firstaid: 3 }, start: { firstaid: 3 }, items: [{ id: 'bandage', qty: 3 }, { id: 'disinfectant', qty: 1 }, { id: 'suture', qty: 1 }] },
  { id: 'police', name: 'Polizist', desc: 'Geübt im Umgang mit Schlagstock und Taschenlampe.', cost: 4, boost: { blunt: 2, fitness: 1 }, start: { blunt: 2, fitness: 1 }, items: [{ id: 'flashlight', qty: 1 }, { id: 'pipe', qty: 1 }, { id: 'bandage', qty: 1 }] },
  { id: 'forester', name: 'Förster', desc: 'Fällt Bäume und läuft den ganzen Tag.', cost: 3, boost: { axe: 3, fitness: 2 }, start: { axe: 2, fitness: 1 }, items: [{ id: 'axe', qty: 1 }, { id: 'water', qty: 1 }] },
  { id: 'mechanic', name: 'Mechaniker', desc: 'Weiß, was unter einer Motorhaube steckt.', cost: 3, boost: { mechanics: 3, strength: 1 }, start: { mechanics: 2 }, items: [{ id: 'toolbox', qty: 1 }, { id: 'enginepart', qty: 1 }] },
  { id: 'burglar', name: 'Einbrecher', desc: 'Leise Schritte und flinke Finger.', cost: 3, boost: { sneak: 3, nimble: 2 }, start: { sneak: 2, nimble: 1 }, items: [{ id: 'flashlight', qty: 1 }, { id: 'knife', qty: 1 }] },
  { id: 'trainer', name: 'Fitnesstrainer', desc: 'Kraft und Ausdauer von Anfang an.', cost: 4, boost: { fitness: 3, strength: 2, sprinting: 1 }, start: { fitness: 3, strength: 1 }, items: [{ id: 'water', qty: 1 }, { id: 'bar', qty: 1 }] },
];

export const profession = (id: string): ProfessionDef => PROFESSIONS.find((p) => p.id === id) ?? PROFESSIONS[0];
