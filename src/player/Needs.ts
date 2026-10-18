import { StatRegister } from '../sim/StatRegister';

export const NEED_KEYS = ['hunger', 'thirst', 'energy', 'warmth'] as const;
export type NeedKey = (typeof NEED_KEYS)[number];
export type Level = 'ok' | 'low' | 'critical';

export const LOW = 35;
export const CRITICAL = 15;

/** Verlust pro Spielstunde (Standard: 1 Spielstunde = 1 reale Minute) */
const DECAY = { hunger: 2.5, thirst: 4, energy: 3 };
const SLEEP_GAIN = 12; // Energie pro Spielstunde Schlaf
/** Kälte ab dieser Schwelle (0..1) kühlt aus */
const COLD_THRESHOLD = 0.25;

const START: Record<NeedKey, number> = { hunger: 85, thirst: 85, energy: 90, warmth: 100 };

export interface NeedsContext {
  sprinting: boolean;
  /** Im Schlaf: Energie steigt, Hunger/Durst sinken langsamer */
  sleeping?: boolean;
  /** 0 = angenehm, 1 = eisig */
  cold: number;
  /** Faktor auf die Erholung im Schlaf (Bett, Komfort, Stress); Standard 1 */
  sleepQuality?: number;
}

/** Bedürfnisse: liegen im Werte-Register (0–100, begrenzt); `values` ist eine lesende/schreibende Sicht darauf. */
export class Needs {
  readonly stats = new StatRegister();
  /** Faktoren aus Eigenschaften (Hunger, Durst, Ermüdung) */
  rates = { hunger: 1, thirst: 1, fatigue: 1 };
  readonly values = {} as Record<NeedKey, number>;

  constructor() {
    for (const k of NEED_KEYS) {
      this.stats.define(k, 0, 100, START[k]);
      Object.defineProperty(this.values, k, {
        enumerable: true,
        get: () => this.stats.get(k),
        set: (v: number) => void this.stats.set(k, v),
      });
    }
  }

  update(hours: number, ctx: NeedsContext): void {
    const v = this.values;
    if (ctx.sleeping) {
      v.hunger -= DECAY.hunger * hours * 0.4 * this.rates.hunger;
      v.thirst -= DECAY.thirst * hours * 0.4 * this.rates.thirst;
      v.energy += SLEEP_GAIN * (ctx.sleepQuality ?? 1) * hours;
    } else {
      v.hunger -= DECAY.hunger * hours * (ctx.sprinting ? 1.5 : 1) * this.rates.hunger;
      v.thirst -= DECAY.thirst * hours * (ctx.sprinting ? 2 : 1) * this.rates.thirst;
      v.energy -= DECAY.energy * hours * (ctx.sprinting ? 1.8 : 1) * this.rates.fatigue;
    }
    if (ctx.cold > COLD_THRESHOLD) v.warmth -= (ctx.cold - COLD_THRESHOLD) * 20 * hours;
    else v.warmth += 8 * hours;
  }

  add(key: NeedKey, amount: number): void {
    this.stats.add(key, amount);
  }

  level(key: NeedKey): Level {
    const x = this.values[key];
    return x <= CRITICAL ? 'critical' : x <= LOW ? 'low' : 'ok';
  }
}
