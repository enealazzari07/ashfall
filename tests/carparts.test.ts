import { describe, expect, it } from 'vitest';
import {
  BATTERY_FRESH, CarParts, MIN_START_CHARGE, START_DRAIN, crashEngine, enginePower, fuelFraction, installBattery, lightDrain, newParts,
  refuel, removeBattery, repairEngine, runTick, tryStart,
} from '../src/sim/CarParts';
import { Vehicle } from '../src/player/Vehicle';
import { item } from '../src/data/items';

const lcg = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const good = (): CarParts => ({ fuel: 20, tank: 50, battery: 80, engine: 100 });

describe('Autoteile', () => {
  it('Startwerte sind plausibel und streuen', () => {
    const r = lcg(5);
    let empty = 0, nobat = 0, wrecks = 0;
    for (let i = 0; i < 300; i++) {
      const p = newParts(r);
      expect(p.fuel).toBeGreaterThanOrEqual(0);
      expect(p.fuel).toBeLessThanOrEqual(p.tank);
      if (p.fuel === 0) empty++;
      if (p.battery === null) nobat++;
      if (p.engine < 30) wrecks++;
    }
    expect(empty).toBeGreaterThan(20);
    expect(nobat).toBeGreaterThan(10);
    expect(wrecks).toBeGreaterThan(5);
    expect(wrecks).toBeLessThan(80);
  });

  it('Anlassen braucht Batterie, Ladung, Sprit und Motor', () => {
    const r = () => 0; // immer Glück
    expect(tryStart({ ...good(), battery: null }, r).kind).toBe('nobattery');
    const flat = { ...good(), battery: MIN_START_CHARGE - 1 };
    expect(tryStart(flat, r).kind).toBe('flat');
    expect(flat.battery).toBe(MIN_START_CHARGE - 1); // leere Batterie verliert nichts mehr
    const dry = { ...good(), fuel: 0 };
    expect(tryStart(dry, r).kind).toBe('nofuel');
    expect(dry.battery).toBe(80 - START_DRAIN);
    expect(tryStart({ ...good(), engine: 2 }, r).kind).toBe('broken');
    const ok = tryStart(good(), r);
    expect(ok.ok).toBe(true);
  });

  it('Schlechter Motor stottert öfter, jeder Versuch kostet Ladung', () => {
    const wins = (engine: number) => {
      const r = lcg(11);
      let n = 0;
      for (let i = 0; i < 400; i++) if (tryStart({ fuel: 10, tank: 50, battery: 100, engine }, r).ok) n++;
      return n;
    };
    expect(wins(100)).toBeGreaterThan(wins(15));
    const p = good();
    tryStart(p, () => 0.99);
    expect(p.battery).toBe(80 - START_DRAIN);
  });

  it('Verbrauch folgt Strecke und Leerlauf, Lichtmaschine lädt, leerer Tank meldet sich einmal', () => {
    const p = good();
    runTick(p, 10, 0, 0);
    const idle = 20 - p.fuel;
    expect(idle).toBeGreaterThan(0);
    const q = good();
    runTick(q, 10, 25, 1);
    expect(20 - q.fuel).toBeGreaterThan(idle * 3);
    expect(q.battery!).toBeGreaterThan(80);
    const t: CarParts = { fuel: 0.0005, tank: 50, battery: 50, engine: 100 };
    expect(runTick(t, 1, 5, 1).outOfFuel).toBe(true);
    expect(runTick(t, 1, 5, 1).outOfFuel).toBe(false);
    expect(t.fuel).toBe(0);
  });

  it('Licht zieht die Batterie leer, Aufprall und Reparatur ändern den Motor', () => {
    const p = { ...good(), battery: 0.05 };
    expect(lightDrain(p, 1)).toBe(false);
    expect(lightDrain({ ...good(), battery: null }, 1)).toBe(false);
    const c = good();
    crashEngine(c, 4);
    expect(c.engine).toBe(100);
    crashEngine(c, 20);
    expect(c.engine).toBe(86);
    expect(repairEngine(c, 30)).toBe(14);
    expect(c.engine).toBe(100);
    expect(enginePower({ ...c, engine: 0 })).toBe(0);
    expect(enginePower({ ...c, engine: 50 })).toBeCloseTo(0.725);
  });

  it('Tanken ist durch die Tankgröße begrenzt, Batterie lässt sich aus- und einbauen', () => {
    const p = good();
    expect(refuel(p, 100)).toBe(30);
    expect(fuelFraction(p)).toBe(1);
    expect(removeBattery(p)).toBe(80);
    expect(p.battery).toBeNull();
    expect(removeBattery(p)).toBeNull();
    expect(installBattery(p, BATTERY_FRESH)).toBe(true);
    expect(installBattery(p, 10)).toBe(false);
  });
});

describe('Fahrzeug ohne Motor', () => {
  const drive = (v: Vehicle, secs: number, throttle: number) => {
    for (let i = 0; i < secs * 60; i++) v.update(1 / 60, { throttle, brake: 0, steer: 0, handbrake: false });
  };
  it('beschleunigt nur mit laufendem Motor, rollt sonst aus', () => {
    const on = new Vehicle(0, 0, 0, 0xff0000, 0);
    drive(on, 3, 1);
    expect(on.kmh).toBeGreaterThan(20);
    const off = new Vehicle(0, 0, 0, 0xff0000, 0);
    off.engineOn = false;
    drive(off, 3, 1);
    expect(off.kmh).toBe(0);
    expect(off.rpm).toBeLessThan(100);
    off.speed = 10;
    drive(off, 1, 0);
    expect(off.speed).toBeLessThan(10);
    drive(off, 40, 0);
    expect(off.speed).toBe(0);
  });
  it('schwacher Motor bringt weniger Beschleunigung', () => {
    const a = new Vehicle(0, 0, 0, 0, 0), b = new Vehicle(0, 0, 0, 0, 0);
    b.engineFactor = 0.5;
    drive(a, 2, 1);
    drive(b, 2, 1);
    expect(b.speed).toBeLessThan(a.speed * 0.7);
  });
});

describe('Neue Items', () => {
  it('Autoteile existieren mit Tags', () => {
    for (const id of ['battery', 'flatbattery', 'gascan', 'emptycan', 'enginepart', 'toolbox']) expect(() => item(id)).not.toThrow();
    expect(item('toolbox').tags).toContain('mechanic');
    expect(item('gascan').tags).toContain('fuelcan');
  });
});
