import { StatRegister } from './StatRegister';
import { levelById } from '../data/moodles';

export type Activity = 'idle' | 'active' | 'social';

export interface MoodInput {
  sleeping: boolean;
  /** Unbehagen durch das Bett (0..1), nur im Schlaf */
  bedDiscomfort: number;
  /** stärkste Nässe aller Körperzonen, 0..100 */
  wetMax: number;
  /** Kälte-Moodle-Stufe 0..4 */
  coldLevel: number;
  /** Last / Tragkraft */
  load: number;
  pain: number;
  bleeding: boolean;
  activity: Activity;
  indoors: boolean;
  /** satt und nicht durstig */
  fed: boolean;
  /** Zahl der Zombies, die den Spieler gerade verfolgen oder ganz nah sind */
  threat?: number;
}

const levelOf = levelById;

const DISCOMFORT_UP = 14; // pro Stunde
const DISCOMFORT_DOWN = 60;

/**
 * Befinden: Komfort, Stress, Langeweile, Unglücklichkeit. Reize wirken auf Stress und Langeweile;
 * halten sie an, wird der Charakter unglücklich. Alle Werte liegen im Register (0..100).
 */
export class Mood {
  readonly stats = new StatRegister();

  constructor() {
    for (const id of ['discomfort', 'stress', 'boredom', 'unhappiness']) this.stats.define(id, 0, 100, 0);
  }

  get discomfort(): number { return this.stats.get('discomfort'); }
  get stress(): number { return this.stats.get('stress'); }
  get boredom(): number { return this.stats.get('boredom'); }
  get unhappiness(): number { return this.stats.get('unhappiness'); }

  /** Ziel-Unbehagen 0..100 aus den aktuellen Umständen */
  discomfortTarget(i: MoodInput): number {
    let d = i.sleeping ? i.bedDiscomfort : 0;
    d += 0.1 * levelOf('wet', i.wetMax);
    d += 0.1 * i.coldLevel;
    d += i.load > 0.9 ? 0.15 : i.load > 0.8 ? 0.08 : 0;
    d += i.pain >= 30 ? 0.1 : 0;
    return Math.min(1, Math.max(0, d)) * 100;
  }

  update(hours: number, i: MoodInput): void {
    const s = this.stats;

    // Komfort: im Schlaf sofort, sonst träge
    const target = this.discomfortTarget(i);
    if (i.sleeping) s.set('discomfort', target);
    else {
      const cur = s.get('discomfort');
      const step = (target > cur ? DISCOMFORT_UP : DISCOMFORT_DOWN) * hours;
      s.set('discomfort', cur + Math.max(-step, Math.min(step, target - cur)));
    }

    // Stress
    let stress = 0.25 * Math.max(0, s.get('discomfort') - 20);
    stress += (i.pain / 100) * 10;
    if (i.bleeding) stress += 8;
    if (i.coldLevel >= 3) stress += 6;
    stress += 18 * Math.min(3, i.threat ?? 0);
    stress -= 5 + (i.sleeping ? 5 : 0);
    s.add('stress', stress * hours);

    // Langeweile
    if (!i.sleeping) {
      let b = 0;
      if (i.activity === 'idle') b = i.indoors ? 12 : 6;
      else if (i.activity === 'active') b = -8;
      else b = -35;
      s.add('boredom', b * hours);
    }

    // Unglücklichkeit: Folge anhaltender Langeweile und anhaltenden Stresses
    const bored = levelOf('bored', s.get('boredom'));
    const stressed = levelOf('stress', s.get('stress'));
    let u = 0;
    if (bored >= 2) u += 3 * bored;
    if (stressed >= 2) u += 1.5 * stressed;
    if (u === 0 && bored < 1 && stressed < 1 && i.fed) u = -2;
    s.add('unhappiness', u * hours);
  }

  /** Faktor 0.3..1 auf die Erholung im Schlaf: Unbehagen und Stress stören */
  get sleepQuality(): number {
    const stress = this.stress;
    const q = 1 - (this.discomfort / 100) * 0.5 - (stress >= 75 ? 0.3 : stress >= 50 ? 0.15 : 0);
    return Math.max(0.3, q);
  }
}
