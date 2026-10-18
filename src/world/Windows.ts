import type { Box, WindowSpec } from './CityGenerator';

/** Zustand eines Erdgeschossfensters: Scheibe, Bretter (Barrikade) und Haltbarkeit. Reine Logik ohne Darstellung. */
export interface WinState {
  glass: boolean;
  /** Scheibenhaltbarkeit */
  hp: number;
  /** Bretter vor dem Fenster, 0..MAX_PLANKS */
  planks: number;
  /** Haltbarkeit des äußersten Bretts */
  plankHp: number;
}

export const GLASS_HP = 30;
export const PLANK_HP = 55;
export const MAX_PLANKS = 4;
/** Fenster, die man einschlagen, überklettern und verbarrikadieren kann */
export const CLIMB_SECONDS = 1.3;

/** Dynamische Fenster: Erdgeschoss, intakt oder zerbrochen, mit niedriger Brüstung */
export const isDynamicWindow = (w: WindowSpec): boolean => w.floor === 0 && (w.state === 'glass' || w.state === 'broken') && w.y0 <= 1.3;

export const initialWindow = (w: WindowSpec): WinState => ({ glass: w.state === 'glass', hp: GLASS_HP, planks: 0, plankHp: PLANK_HP });

/** Frei begehbar (überkletterbar): keine Scheibe, keine Bretter */
export const windowOpen = (s: WinState): boolean => !s.glass && s.planks === 0;

export type WindowHit = 'hit' | 'glass' | 'plank';

/** Schlag gegen das Fenster (Zombie oder Spieler): zuerst die Bretter, dann die Scheibe. Gibt zurück, was dabei kaputtging. */
export function strikeWindow(s: WinState, damage: number): WindowHit | null {
  if (s.planks > 0) {
    s.plankHp -= damage;
    if (s.plankHp > 0) return 'hit';
    s.planks--;
    s.plankHp = PLANK_HP;
    return 'plank';
  }
  if (s.glass) {
    s.hp -= damage;
    if (s.hp > 0) return 'hit';
    s.glass = false;
    return 'glass';
  }
  return null;
}

export function addPlank(s: WinState): boolean {
  if (s.glass || s.planks >= MAX_PLANKS) return false;
  s.planks++;
  if (s.planks === 1) s.plankHp = PLANK_HP;
  return true;
}

export function removePlank(s: WinState): boolean {
  if (s.planks <= 0) return false;
  s.planks--;
  s.plankHp = PLANK_HP;
  return true;
}

/** Kletterbox im Wandloch: nur wirksam, solange das Fenster offen ist */
export function syncBox(box: Box, s: WinState): void {
  box.off = !windowOpen(s);
}
