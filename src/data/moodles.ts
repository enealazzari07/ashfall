/**
 * Moodles: Jeder Zustand hat vier Schwellen (Stufe 1–4). Anzeige und spätere Wirkungen lesen nur diese Tabelle.
 * `low`: schlechter, je kleiner der Wert · `high`: schlechter, je größer der Wert.
 */
export type MoodleDir = 'low' | 'high';
export type MoodleTone = 'warn' | 'bad';

export interface MoodleDef {
  id: string;
  dir: MoodleDir;
  /** Schwellen für Stufe 1..4 (bei `low` absteigend, bei `high` aufsteigend) */
  limits: readonly [number, number, number, number];
  labels: readonly [string, string, string, string];
  glyph: string;
}

export const MOODLES: readonly MoodleDef[] = [
  { id: 'hunger', dir: 'low', limits: [65, 50, 35, 15], labels: ['Etwas hungrig', 'Hungrig', 'Sehr hungrig', 'Verhungernd'], glyph: 'hunger' },
  { id: 'thirst', dir: 'low', limits: [65, 50, 35, 15], labels: ['Etwas durstig', 'Durstig', 'Sehr durstig', 'Verdurstend'], glyph: 'thirst' },
  { id: 'tired', dir: 'low', limits: [65, 50, 35, 15], labels: ['Etwas müde', 'Müde', 'Sehr müde', 'Erschöpft'], glyph: 'energy' },
  { id: 'cold', dir: 'low', limits: [65, 50, 35, 15], labels: ['Fröstelnd', 'Kalt', 'Unterkühlt', 'Erfrierend'], glyph: 'warmth' },
  { id: 'load', dir: 'high', limits: [0.7, 0.8, 0.9, 1], labels: ['Leicht beladen', 'Beladen', 'Schwer beladen', 'Überladen'], glyph: 'weight' },
  { id: 'bleeding', dir: 'high', limits: [1, 2, 3, 4], labels: ['Blutung', 'Starke Blutung', 'Schwere Blutung', 'Verblutend'], glyph: 'bleed' },
  { id: 'pain', dir: 'high', limits: [15, 30, 50, 75], labels: ['Leichter Schmerz', 'Schmerz', 'Starker Schmerz', 'Quälender Schmerz'], glyph: 'health' },
  { id: 'wet', dir: 'high', limits: [15, 40, 70, 90], labels: ['Feucht', 'Nass', 'Durchnässt', 'Triefend nass'], glyph: 'thirst' },
  { id: 'uncomfortable', dir: 'high', limits: [20, 40, 60, 80], labels: ['Unbequem', 'Unwohl', 'Sehr unwohl', 'Quälend unbequem'], glyph: 'body' },
  { id: 'stress', dir: 'high', limits: [25, 50, 75, 90], labels: ['Angespannt', 'Gestresst', 'Sehr gestresst', 'Am Limit'], glyph: 'energy' },
  { id: 'bored', dir: 'high', limits: [25, 50, 75, 90], labels: ['Gelangweilt', 'Sehr gelangweilt', 'Antriebslos', 'Apathisch'], glyph: 'hand' },
  { id: 'unhappy', dir: 'high', limits: [20, 45, 60, 80], labels: ['Bedrückt', 'Traurig', 'Sehr traurig', 'Verzweifelt'], glyph: 'person' },
  { id: 'infection', dir: 'high', limits: [10, 30, 60, 90], labels: ['Wunde gereizt', 'Wunde entzündet', 'Wundfieber', 'Blutvergiftung'], glyph: 'health' },
];

/** Stufe 0..4 eines Moodles nach seiner ID */
export function levelById(id: string, value: number): 0 | 1 | 2 | 3 | 4 {
  const def = MOODLES.find((m) => m.id === id);
  if (!def) throw new Error(`Unbekanntes Moodle: ${id}`);
  return moodleLevel(def, value);
}

export interface ActiveMoodle {
  id: string;
  level: 1 | 2 | 3 | 4;
  label: string;
  glyph: string;
}

/** 0 = kein Moodle, sonst Stufe 1..4 */
export function moodleLevel(def: MoodleDef, value: number): 0 | 1 | 2 | 3 | 4 {
  let level = 0;
  for (let i = 0; i < 4; i++) {
    const hit = def.dir === 'low' ? value <= def.limits[i] : value >= def.limits[i];
    if (hit) level = i + 1;
  }
  return level as 0 | 1 | 2 | 3 | 4;
}

/** Rechnet aus Werten (nach Moodle-ID) die aktiven Moodles aus, schlimmste zuerst. */
export function evalMoodles(values: Readonly<Record<string, number>>): ActiveMoodle[] {
  const out: ActiveMoodle[] = [];
  for (const def of MOODLES) {
    const v = values[def.id];
    if (v === undefined) continue;
    const level = moodleLevel(def, v);
    if (level === 0) continue;
    out.push({ id: def.id, level, label: def.labels[level - 1], glyph: def.glyph });
  }
  return out.sort((a, b) => b.level - a.level);
}

export function moodleTone(level: number): MoodleTone {
  return level >= 3 ? 'bad' : 'warn';
}
