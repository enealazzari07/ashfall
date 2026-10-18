/** Schlafplätze: Komfort (Unbehagen), Erholung und Kälte von unten. */
export type BedKind = 'good' | 'bad' | 'floor';

export interface BedDef {
  id: BedKind;
  name: string;
  /** Unbehagen 0..1 während des Schlafs */
  discomfort: number;
  /** Faktor auf die Erholung (Energie pro Stunde) */
  recovery: number;
  /** zusätzliche Kälte von unten in °C */
  chill: number;
}

export const BEDS: Record<BedKind, BedDef> = {
  good: { id: 'good', name: 'Gutes Bett', discomfort: 0, recovery: 1, chill: 0 },
  bad: { id: 'bad', name: 'Einfaches Bett', discomfort: 0.3, recovery: 0.85, chill: 1 },
  floor: { id: 'floor', name: 'Boden', discomfort: 0.5, recovery: 0.6, chill: 3 },
};

/** Vorgeschlagene Schlafdauer in Stunden: 7, bei Müdigkeit bis 12 (Energie 0..100). */
export function suggestedSleepHours(energy: number): number {
  const fatigue = 1 - Math.min(100, Math.max(0, energy)) / 100;
  const hours = fatigue > 0.3 ? 7 + (12 - 7) * ((fatigue - 0.3) / 0.7) : 7;
  return Math.ceil(hours);
}

/** Geschätzte Erholung (Energiepunkte) nach `hours` Schlaf; Energie steigt im Schlaf um 12 pro Stunde. */
export function estimateRecovery(energy: number, hours: number, bed: BedDef, quality: number): number {
  return Math.min(100 - energy, 12 * bed.recovery * quality * hours);
}

export const MIN_SLEEP_HOURS = 1;
export const MAX_SLEEP_HOURS = 12;
