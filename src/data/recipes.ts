import { Stack } from './items';
import type { SkillId } from './skills';

export interface Recipe {
  id: string;
  inputs: Stack[];
  output: Stack;
  /** Werkzeuge als Item-Tags: werden gebraucht, aber nicht verbraucht */
  tools?: string[];
  /** Dauer in Spielminuten (Anzeige; Aktionen laufen später darüber) */
  time?: number;
  /** Erfahrung, die das Herstellen bringt */
  xp?: { skill: SkillId; amount: number };
  /** Charakterstufe, ab der das Rezept freigeschaltet ist (Standard 1) */
  level?: number;
}

export const RECIPES: Recipe[] = [
  { id: 'bandage', level: 1, inputs: [{ id: 'cloth', qty: 2 }], output: { id: 'bandage', qty: 1 }, time: 5, xp: { skill: 'firstaid', amount: 4 } },
  { id: 'splint', level: 1, inputs: [{ id: 'wood', qty: 1 }, { id: 'cloth', qty: 2 }], output: { id: 'splint', qty: 1 }, time: 10, xp: { skill: 'firstaid', amount: 6 } },
  { id: 'nails', level: 1, inputs: [{ id: 'scrap', qty: 1 }], output: { id: 'nails', qty: 6 }, tools: ['hammer'], time: 4, xp: { skill: 'carpentry', amount: 3 } },
  { id: 'lockpick', level: 2, inputs: [{ id: 'scrap', qty: 1 }], output: { id: 'lockpick', qty: 2 }, tools: ['mechanic'], time: 8, xp: { skill: 'carpentry', amount: 4 } },
  { id: 'hammer', level: 1, inputs: [{ id: 'scrap', qty: 2 }, { id: 'wood', qty: 1 }], output: { id: 'hammer', qty: 1 }, time: 10, xp: { skill: 'carpentry', amount: 6 } },
  { id: 'sledgehammer', level: 5, inputs: [{ id: 'scrap', qty: 4 }, { id: 'wood', qty: 2 }, { id: 'nails', qty: 4 }], output: { id: 'sledgehammer', qty: 1 }, tools: ['hammer'], time: 18, xp: { skill: 'carpentry', amount: 10 } },
  { id: 'sandwich', level: 1, inputs: [{ id: 'bread', qty: 1 }, { id: 'beans', qty: 1 }], output: { id: 'sandwich', qty: 1 }, time: 3, xp: { skill: 'cooking', amount: 6 } },
  { id: 'knife', level: 3, inputs: [{ id: 'scrap', qty: 2 }, { id: 'wood', qty: 1 }], output: { id: 'knife', qty: 1 }, tools: ['hammer'], time: 12, xp: { skill: 'carpentry', amount: 8 } },
  { id: 'suture', level: 4, inputs: [{ id: 'cloth', qty: 1 }, { id: 'scrap', qty: 1 }], output: { id: 'suture', qty: 1 }, time: 8, xp: { skill: 'firstaid', amount: 10 } },
  { id: 'beanie', level: 4, inputs: [{ id: 'cloth', qty: 3 }], output: { id: 'beanie', qty: 1 }, time: 12 },
  { id: 'cap', level: 4, inputs: [{ id: 'cloth', qty: 3 }, { id: 'scrap', qty: 1 }], output: { id: 'cap', qty: 1 }, time: 12 },
  { id: 'bat', level: 5, inputs: [{ id: 'wood', qty: 3 }, { id: 'nails', qty: 4 }], output: { id: 'bat', qty: 1 }, tools: ['hammer'], time: 16, xp: { skill: 'carpentry', amount: 12 } },
  { id: 'hoodie', level: 5, inputs: [{ id: 'cloth', qty: 6 }], output: { id: 'hoodie', qty: 1 }, time: 20 },
  { id: 'disinfectant', level: 5, inputs: [{ id: 'water', qty: 1 }, { id: 'cloth', qty: 1 }], output: { id: 'disinfectant', qty: 1 }, time: 10, xp: { skill: 'firstaid', amount: 12 } },
  { id: 'pipe', level: 6, inputs: [{ id: 'scrap', qty: 5 }], output: { id: 'pipe', qty: 1 }, tools: ['hammer'], time: 18, xp: { skill: 'carpentry', amount: 14 } },
  { id: 'machete', level: 6, inputs: [{ id: 'scrap', qty: 4 }, { id: 'wood', qty: 1 }, { id: 'cloth', qty: 2 }], output: { id: 'machete', qty: 1 }, tools: ['hammer'], time: 22, xp: { skill: 'carpentry', amount: 16 } },
  { id: 'jeans', level: 6, inputs: [{ id: 'cloth', qty: 8 }], output: { id: 'jeans', qty: 1 }, time: 24 },
  { id: 'axe', level: 7, inputs: [{ id: 'scrap', qty: 4 }, { id: 'wood', qty: 3 }], output: { id: 'axe', qty: 1 }, tools: ['hammer'], time: 26, xp: { skill: 'carpentry', amount: 20 } },
  { id: 'crowbar', level: 7, inputs: [{ id: 'scrap', qty: 6 }], output: { id: 'crowbar', qty: 1 }, tools: ['hammer'], time: 22, xp: { skill: 'carpentry', amount: 18 } },
  { id: 'sweater', level: 7, inputs: [{ id: 'cloth', qty: 10 }], output: { id: 'sweater', qty: 1 }, time: 28 },
  { id: 'schoolbag', level: 8, inputs: [{ id: 'cloth', qty: 12 }, { id: 'nails', qty: 4 }], output: { id: 'schoolbag', qty: 1 }, time: 30 },
  { id: 'toolbox', level: 8, inputs: [{ id: 'scrap', qty: 8 }, { id: 'nails', qty: 6 }], output: { id: 'toolbox', qty: 1 }, tools: ['hammer'], time: 30, xp: { skill: 'mechanics', amount: 20 } },
  { id: 'jacket', level: 10, inputs: [{ id: 'cloth', qty: 16 }, { id: 'scrap', qty: 2 }], output: { id: 'jacket', qty: 1 }, time: 40 },
  { id: 'boots', level: 10, inputs: [{ id: 'cloth', qty: 8 }, { id: 'scrap', qty: 4 }], output: { id: 'boots', qty: 1 }, time: 36 },
  { id: 'hikingpack', level: 12, inputs: [{ id: 'cloth', qty: 24 }, { id: 'scrap', qty: 6 }, { id: 'nails', qty: 6 }], output: { id: 'hikingpack', qty: 1 }, time: 50 },
];

/** Ab welcher Charakterstufe ein Bauteil hergestellt werden kann */
const PIECE_LEVEL: Record<string, number> = {
  workbench: 1, wall: 1, door: 1, fire: 1, chair: 1, crate: 2, table: 2, fence: 2, bed: 3,
  barricade: 3, shelf: 3, windowwall: 4, windowbar: 4, cabinet: 6,
};

export type PieceKind = 'wall' | 'door' | 'bed' | 'fire' | 'windowwall' | 'barricade' | 'table' | 'shelf' | 'chair' | 'crate' | 'cabinet' | 'fence' | 'windowbar' | 'workbench';

export interface PieceDef {
  id: PieceKind;
  name: string;
  icon: string;
  cost: Stack[];
  w: number; // Länge (bei rot 0 entlang X)
  d: number;
  h: number;
  color: number;
  /** Bauzeit in Sekunden */
  time: number;
}

export const PIECES: PieceDef[] = [
  { id: 'wall', name: 'Wand', icon: '', cost: [{ id: 'wood', qty: 2 }], w: 2, d: 0.3, h: 2.6, color: 0x8a6a45, time: 5 },
  { id: 'door', name: 'Tür', icon: '', cost: [{ id: 'wood', qty: 3 }], w: 2, d: 0.3, h: 2.6, color: 0x7a5a38, time: 7 },
  { id: 'windowwall', name: 'Fensterwand', icon: '', cost: [{ id: 'wood', qty: 3 }, { id: 'nails', qty: 4 }], w: 2, d: 0.3, h: 2.6, color: 0x8a6a45, time: 8 },
  { id: 'barricade', name: 'Barrikade', icon: '', cost: [{ id: 'wood', qty: 3 }, { id: 'nails', qty: 6 }], w: 2, d: 0.5, h: 1.2, color: 0x6a5035, time: 7 },
  { id: 'table', name: 'Tisch', icon: '', cost: [{ id: 'wood', qty: 3 }, { id: 'nails', qty: 3 }], w: 1.6, d: 0.9, h: 0.8, color: 0x7a5a38, time: 6 },
  { id: 'shelf', name: 'Regal', icon: '', cost: [{ id: 'wood', qty: 4 }, { id: 'nails', qty: 4 }], w: 1.6, d: 0.45, h: 1.9, color: 0x7a5a3a, time: 7 },
  { id: 'chair', name: 'Stuhl', icon: '', cost: [{ id: 'wood', qty: 1 }, { id: 'nails', qty: 2 }], w: 0.5, d: 0.5, h: 0.9, color: 0x7a5a38, time: 4 },
  { id: 'crate', name: 'Kiste', icon: '', cost: [{ id: 'wood', qty: 2 }, { id: 'nails', qty: 3 }], w: 0.9, d: 0.7, h: 0.7, color: 0x8a6a45, time: 5 },
  { id: 'cabinet', name: 'Schrank', icon: '', cost: [{ id: 'wood', qty: 4 }, { id: 'nails', qty: 6 }], w: 1.0, d: 0.55, h: 1.9, color: 0x6a4a2e, time: 8 },
  { id: 'fence', name: 'Zaun', icon: '', cost: [{ id: 'wood', qty: 2 }, { id: 'nails', qty: 2 }], w: 2, d: 0.15, h: 1.3, color: 0x8a6a45, time: 4 },
  { id: 'windowbar', name: 'Fensterbarrikade', icon: '', cost: [{ id: 'wood', qty: 3 }, { id: 'nails', qty: 4 }], w: 1.2, d: 0.2, h: 1.2, color: 0x6a5035, time: 6 },
  { id: 'workbench', name: 'Werkbank', icon: '', cost: [{ id: 'wood', qty: 6 }, { id: 'nails', qty: 6 }, { id: 'scrap', qty: 2 }], w: 1.8, d: 0.8, h: 0.95, color: 0x7a5a38, time: 10 },
  { id: 'bed', name: 'Bett', icon: '', cost: [{ id: 'wood', qty: 3 }, { id: 'cloth', qty: 2 }], w: 2, d: 1.5, h: 0.5, color: 0xb9c4d6, time: 8 },
  { id: 'fire', name: 'Lagerfeuer', icon: '', cost: [{ id: 'wood', qty: 2 }], w: 0.9, d: 0.9, h: 0.3, color: 0x555555, time: 4 },
];

/** Jedes Bauteil wird hergestellt (Herstellen-Reiter) und danach mit Rechtsklick gesetzt */
for (const p of PIECES) {
  RECIPES.push({ id: `piece_${p.id}`, inputs: p.cost, output: { id: `piece_${p.id}`, qty: 1 }, level: PIECE_LEVEL[p.id] ?? 1, time: p.time, xp: { skill: 'carpentry', amount: Math.round(p.time * 1.6) } });
}

RECIPES.sort((a, b) => (a.level ?? 1) - (b.level ?? 1));

/** Stufe 1 kann man im Inventar herstellen, alles darüber nur an einer Werkbank (und ab der nötigen Charakterstufe) */
export const BENCH_RANGE = 3.5;
export const needsBench = (r: Recipe): boolean => (r.level ?? 1) > 1;

/** Spielstunden Brenndauer pro Holz und Startvorrat */
export const FUEL_PER_WOOD = 4;
export const FIRE_START_FUEL = 8;
export const FIRE_MAX_FUEL = 24;

/** Was dem Inventar für das Rezept fehlt: Werkzeug-Tags und Zutaten. Leer = herstellbar (Platz wird separat geprüft). */
export function missingFor(r: Recipe, has: { count(id: string): number; hasTag(tag: string): boolean }): string[] {
  const out: string[] = [];
  for (const t of r.tools ?? []) if (!has.hasTag(t)) out.push(`Werkzeug: ${t}`);
  for (const i of r.inputs) if (has.count(i.id) < i.qty) out.push(i.id);
  return out;
}
