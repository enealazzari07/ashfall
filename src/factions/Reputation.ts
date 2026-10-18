export const MIN_REP = -100;
export const MAX_REP = 100;
/** Ab hier lässt eine Fraktion mit sich handeln */
export const TRADE_MIN = -10;
/** Ab hier ist ein Bündnis möglich */
export const ALLY_MIN = 60;

export const clampRep = (r: number): number => Math.min(MAX_REP, Math.max(MIN_REP, r));

export function repLabel(rep: number): string {
  if (rep <= -50) return 'Todfeind';
  if (rep <= -20) return 'Feindlich';
  if (rep < 10) return 'Misstrauisch';
  if (rep < 40) return 'Neutral';
  if (rep < ALLY_MIN) return 'Freundlich';
  return 'Vertraut';
}

export type Mood = 'hostile' | 'neutral' | 'friendly';
export const moodOf = (rep: number): Mood => (rep >= 40 ? 'friendly' : rep >= TRADE_MIN ? 'neutral' : 'hostile');

/** Preisfaktor: 1.25 bei -10 Ruf, ab 60 Ruf nur noch 0.85 */
export function priceMod(rep: number): number {
  return Math.min(1.25, Math.max(0.85, 1.25 - ((rep + 10) / 70) * 0.4));
}
