/**
 * Autoteile: Tank, Batterie und Motorzustand. Reine Logik; Zufall nur über das übergebene RNG.
 * Die Zahlen sind eigene Startwerte (Spielbarkeit vor Realismus: ein Tank hält grob 130 km).
 */
export interface CarParts {
  /** Tankinhalt in Litern */
  fuel: number;
  /** Tankgröße in Litern */
  tank: number;
  /** Batterieladung 0..100, null = ausgebaut */
  battery: number | null;
  /** Motorzustand 0..100 */
  engine: number;
}

/** Verbrauch im Leerlauf (Liter pro Sekunde) und je gefahrenem Meter */
export const IDLE_FUEL_PER_S = 0.0008;
export const FUEL_PER_M = 0.0003;
/** Ladung pro Sekunde bei laufendem Motor, Verlust je Startversuch, Verbrauch durch Licht bei Motor aus */
export const CHARGE_PER_S = 0.35;
export const START_DRAIN = 6;
export const LIGHT_DRAIN_PER_S = 0.12;
/** Mindestladung zum Anlassen */
export const MIN_START_CHARGE = 12;
/** Ladung, ab der ein ausgebauter Akku noch als „geladen“ gilt, und Ladung neuer/leerer Akkus */
export const BATTERY_OK = 30;
export const BATTERY_FRESH = 85;
export const BATTERY_FLAT = 8;

export function newParts(r: () => number): CarParts {
  const tank = 40 + Math.round(r() * 30);
  const empty = r() < 0.2;
  const b = r();
  return {
    tank,
    fuel: empty ? 0 : tank * (0.05 + r() * 0.55),
    battery: b < 0.15 ? null : b < 0.4 ? 3 + r() * 14 : 45 + r() * 50,
    engine: r() < 0.1 ? 8 + r() * 20 : 45 + r() * 55,
  };
}

export const fuelFraction = (p: CarParts): number => (p.tank > 0 ? Math.max(0, Math.min(1, p.fuel / p.tank)) : 0);

/** Motorleistung 0..1 aus dem Zustand */
export const enginePower = (p: CarParts): number => (p.engine <= 0 ? 0 : 0.45 + 0.55 * (p.engine / 100));

export type StartKind = 'ok' | 'nobattery' | 'flat' | 'nofuel' | 'broken' | 'stutter';
export interface StartResult {
  ok: boolean;
  kind: StartKind;
  msg: string;
}

/** Anlassversuch: braucht Batterie mit Ladung, Sprit und einen halbwegs heilen Motor. Jeder Versuch kostet Ladung. */
export function tryStart(p: CarParts, r: () => number): StartResult {
  if (p.battery === null) return { ok: false, kind: 'nobattery', msg: 'Es ist keine Batterie eingebaut.' };
  if (p.battery < MIN_START_CHARGE) return { ok: false, kind: 'flat', msg: 'Die Batterie ist leer. Nur ein Klicken.' };
  p.battery = Math.max(0, p.battery - START_DRAIN);
  if (p.fuel <= 0) return { ok: false, kind: 'nofuel', msg: 'Der Motor dreht, aber der Tank ist leer.' };
  if (p.engine < 5) return { ok: false, kind: 'broken', msg: 'Der Motor ist hinüber.' };
  const chance = 0.55 + 0.45 * (p.engine / 100);
  if (r() > chance) return { ok: false, kind: 'stutter', msg: 'Der Motor stottert und springt nicht an.' };
  return { ok: true, kind: 'ok', msg: 'Der Motor springt an.' };
}

export interface TickResult {
  /** Der Tank ist gerade leer geworden */
  outOfFuel: boolean;
}

/** Ein Schritt bei laufendem Motor: Verbrauch nach Strecke und Leerlauf, Lichtmaschine lädt die Batterie. */
export function runTick(p: CarParts, dt: number, speedMs: number, throttle: number): TickResult {
  const use = IDLE_FUEL_PER_S * dt + FUEL_PER_M * Math.abs(speedMs) * dt * (0.7 + 0.3 * throttle);
  const had = p.fuel > 0;
  p.fuel = Math.max(0, p.fuel - use);
  if (p.battery !== null) p.battery = Math.min(100, p.battery + CHARGE_PER_S * dt);
  return { outOfFuel: had && p.fuel <= 0 };
}

/** Licht bei ausgeschaltetem Motor zieht die Batterie leer; false = Batterie fehlt oder leer */
export function lightDrain(p: CarParts, dt: number): boolean {
  if (p.battery === null || p.battery <= 0) return false;
  p.battery = Math.max(0, p.battery - LIGHT_DRAIN_PER_S * dt);
  return p.battery > 0;
}

/** Aufprall beschädigt den Motor (nur harte Treffer von vorn) */
export function crashEngine(p: CarParts, damage: number): void {
  if (damage <= 6) return;
  p.engine = Math.max(0, p.engine - damage * 0.7);
}

/** Tankt bis zu `liters`; gibt die tatsächlich getankte Menge zurück */
export function refuel(p: CarParts, liters: number): number {
  const add = Math.max(0, Math.min(liters, p.tank - p.fuel));
  p.fuel += add;
  return add;
}

export function repairEngine(p: CarParts, amount: number): number {
  const add = Math.max(0, Math.min(amount, 100 - p.engine));
  p.engine += add;
  return add;
}

/** Baut die Batterie aus und liefert die Ladung (null, wenn keine drin war) */
export function removeBattery(p: CarParts): number | null {
  const c = p.battery;
  p.battery = null;
  return c;
}

export function installBattery(p: CarParts, charge: number): boolean {
  if (p.battery !== null) return false;
  p.battery = charge;
  return true;
}
