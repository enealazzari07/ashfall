import type { EquipSlot } from '../data/items';
import { item } from '../data/items';

/**
 * Körpertemperatur pro Zone: Jede Zone kühlt zur Umgebung hin aus, gebremst von Kleidung (Isolation) und
 * schlechtem Wetter (Wind, Nässe). Aus den Zonen ergibt sich der Kälte-Index, der die Wärme des Körpers (Needs) steuert.
 */
export const ZONES = ['head', 'torso', 'arms', 'hands', 'legs', 'feet'] as const;
export type Zone = (typeof ZONES)[number];

export const ZONE_NAME: Record<Zone, string> = {
  head: 'Kopf',
  torso: 'Oberkörper',
  arms: 'Arme',
  hands: 'Hände',
  legs: 'Beine',
  feet: 'Füße',
};

/** Anteil der Zone an der mittleren Hauttemperatur */
export const ZONE_WEIGHT: Record<Zone, number> = { head: 0.15, torso: 0.4, arms: 0.15, hands: 0.05, legs: 0.15, feet: 0.1 };

/** Welche Zonen ein Kleidungsstück an diesem Platz bedeckt */
export const SLOT_ZONES: Record<EquipSlot, Zone[]> = {
  head: ['head'],
  body: ['torso', 'arms'],
  legs: ['legs'],
  feet: ['feet'],
  back: [],
  hand: [],
};

export const COMFORT_AIR = 22; // °C, ab hier friert man nicht
export const SKIN_OK = 33; // °C normale Hauttemperatur
const DEFICIT_K = 0.4; // wie stark ein Grad Kälte die Haut kühlt
const INS_GAIN = 1.5; // wie stark Isolation die Kälte abhält
const COOL_RATE = 4; // pro Stunde
const WARM_RATE = 6;
const WIND_K = 0.8; // °C gefühlte Abkühlung pro m/s Wind
const WET_RISE = 80; // Nässe pro Stunde bei Starkregen ohne Schutz
const DRY_INDOOR = 30; // im Haus trocknet Kleidung langsam, aber stetig
const DRY_OUTDOOR = 8;
const DRY_FIRE = 30;
const WET_INS = 0.6; // nasse Kleidung verliert so viel Isolation
const WET_SKIN = 0.04; // °C Abkühlung pro Nässeprozent
const HEAT_PER_ACTIVITY = 6; // °C „Gegenheizung“ bei voller Anstrengung
const MAX_INS = 0.8;

type PerZone = Record<Zone, number>;
const zero = (): PerZone => ({ head: 0, torso: 0, arms: 0, hands: 0, legs: 0, feet: 0 });

export interface Gear {
  /** 0..0.8 Kälteschutz */
  insulation: PerZone;
  /** 0..0.9 Schutz vor Wind */
  windproof: PerZone;
  /** 0..0.9 Schutz vor Regen */
  rainproof: PerZone;
}

/** Schutz je Zone aus der getragenen Ausrüstung: Isolation addiert sich, Wind- und Regenschutz zählt das beste Teil. */
export function gearFrom(equipment: Readonly<Record<EquipSlot, string | null>>): Gear {
  const g: Gear = { insulation: zero(), windproof: zero(), rainproof: zero() };
  for (const [slot, id] of Object.entries(equipment) as [EquipSlot, string | null][]) {
    const e = id ? item(id).equip : undefined;
    if (!e) continue;
    for (const z of SLOT_ZONES[slot]) {
      g.insulation[z] = Math.min(MAX_INS, g.insulation[z] + (e.warmth ?? 0));
      g.windproof[z] = Math.min(0.9, Math.max(g.windproof[z], e.windproof ?? 0));
      g.rainproof[z] = Math.min(0.9, Math.max(g.rainproof[z], e.rainproof ?? 0));
    }
  }
  return g;
}

export interface Env {
  /** Lufttemperatur am Standort in °C (ohne Wind) */
  air: number;
  outdoors: boolean;
  /** Windgeschwindigkeit in m/s (nur im Freien wirksam) */
  wind: number;
  /** Regenintensität 0..1 (nur im Freien wirksam) */
  rain: number;
  /** Wärmequelle (Lagerfeuer) in der Nähe */
  fire: boolean;
  /** Anstrengung 0..1 (Laufen wärmt) */
  activity: number;
  sleeping?: boolean;
  /** zusätzliche Kälte von unten (Schlafen auf dem Boden), in °C */
  floorChill?: number;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export class Thermo {
  readonly skin: PerZone = { head: SKIN_OK, torso: SKIN_OK, arms: SKIN_OK, hands: SKIN_OK, legs: SKIN_OK, feet: SKIN_OK };
  /** Nässe je Zone, 0..100 */
  readonly wet: PerZone = zero();

  /** Gleichgewichts-Hauttemperatur einer Zone unter diesen Bedingungen */
  target(z: Zone, env: Env, gear: Gear): number {
    let air = env.air;
    if (env.outdoors) air -= env.wind * WIND_K * (1 - gear.windproof[z]);
    let deficit = Math.max(0, COMFORT_AIR - air);
    deficit = Math.max(0, deficit - env.activity * HEAT_PER_ACTIVITY + (env.sleeping ? 2 : 0) + (env.floorChill ?? 0));
    const wet = this.wet[z];
    const ins = clamp(gear.insulation[z] * (1 - (WET_INS * wet) / 100), 0, MAX_INS);
    const f = Math.max(0.15, 1 - INS_GAIN * ins);
    const chilled = deficit * DEFICIT_K * f + wet * WET_SKIN * (deficit > 0 ? 1 : 0.3);
    return Math.max(15, SKIN_OK - chilled);
  }

  update(hours: number, env: Env, gear: Gear): void {
    const exposed = env.outdoors ? env.rain : 0;
    for (const z of ZONES) {
      // Nässe
      if (exposed > 0.05) this.wet[z] = Math.min(100, this.wet[z] + WET_RISE * exposed * (1 - gear.rainproof[z]) * hours);
      else {
        const dry = (env.outdoors ? DRY_OUTDOOR : DRY_INDOOR) + (env.fire ? DRY_FIRE : 0);
        this.wet[z] = Math.max(0, this.wet[z] - dry * hours);
      }
      // Hauttemperatur
      const t = this.target(z, env, gear);
      const rate = t < this.skin[z] ? COOL_RATE : WARM_RATE;
      this.skin[z] += (t - this.skin[z]) * (1 - Math.exp(-rate * hours));
    }
  }

  /** Mittlere Hauttemperatur nach Zonengewicht */
  get meanSkin(): number {
    return ZONES.reduce((s, z) => s + this.skin[z] * ZONE_WEIGHT[z], 0);
  }

  /** Kälte-Index 0 (angenehm) .. 1 (eisig) für die Wärme des Körpers */
  get cold(): number {
    return clamp((SKIN_OK - this.meanSkin) / 10, 0, 1);
  }

  /** Stärkste Nässe aller Zonen, 0..100 */
  get maxWet(): number {
    return Math.max(...ZONES.map((z) => this.wet[z]));
  }

  /** Kälteste Zone */
  get coldest(): Zone {
    return ZONES.reduce((a, z) => (this.skin[z] < this.skin[a] ? z : a), ZONES[0]);
  }

  tone(z: Zone): 'ok' | 'warn' | 'bad' {
    const t = this.skin[z];
    return t >= 31 ? 'ok' : t >= 27 ? 'warn' : 'bad';
  }
}
