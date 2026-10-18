import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Vehicle, collideVehicles } from '../src/player/Vehicle';

const idle = { throttle: 0, brake: 0, steer: 0, handbrake: false };
const run = (v: Vehicle, s: number, inp: Partial<typeof idle> & object, resolve?: (p: THREE.Vector3, r: number) => void) => {
  for (let i = 0; i < s * 60; i++) v.update(1 / 60, { ...idle, ...inp }, resolve);
};
const wall = (p: THREE.Vector3, r: number) => {
  if (p.x + r > 20) p.x = 20 - r;
};

describe('Vehicle', () => {
  it('beschleunigt, bleibt unter der Höchstgeschwindigkeit und schaltet Gänge', () => {
    const v = new Vehicle(0, 0, 0, 0xff0000);
    run(v, 3, { throttle: 1 });
    expect(v.speed).toBeGreaterThan(10);
    expect(v.gear).toBeGreaterThanOrEqual(2);
    run(v, 60, { throttle: 1 });
    expect(v.kmh).toBeLessThan(125);
    expect(v.kmh).toBeGreaterThan(100);
    expect(v.x).toBeGreaterThan(100);
  });

  it('bremst bis zum Stillstand und fährt danach rückwärts', () => {
    const v = new Vehicle(0, 0, 0, 0);
    run(v, 5, { throttle: 1 });
    run(v, 6, { brake: 1 });
    expect(v.speed).toBeLessThanOrEqual(0.01);
    expect(v.speed).toBeGreaterThan(-8);
    run(v, 4, { brake: 1 });
    expect(v.speed).toBeLessThan(-2);
    expect(v.gear).toBe(-1);
  });

  it('lenkt im Stand nicht, in Fahrt nach links (positiv)', () => {
    const v = new Vehicle(0, 0, 0, 0);
    run(v, 2, { steer: 1 });
    expect(v.rot).toBe(0);
    run(v, 2, { throttle: 1 });
    run(v, 2, { throttle: 1, steer: 1 });
    expect(v.rot).toBeGreaterThan(0.2);
  });

  it('Handbremse hält an, ohne rückwärts zu rollen', () => {
    const v = new Vehicle(0, 0, 0, 0);
    run(v, 4, { throttle: 1 });
    run(v, 6, { handbrake: true });
    expect(v.speed).toBe(0);
  });

  it('Wand: Aufprall macht Schaden und das Auto prallt zurück', () => {
    const v = new Vehicle(0, 0, 0, 0);
    let hit = false;
    for (let i = 0; i < 60 * 12 && !hit; i++) {
      v.update(1 / 60, { ...idle, throttle: 1 }, wall);
      hit = v.crash !== null;
    }
    expect(hit).toBe(true);
    expect(v.crash!.zone).toBe('front');
    expect(v.crash!.strength).toBeGreaterThan(10);
    expect(v.health).toBeLessThan(80);
    expect(v.zones.front).toBeGreaterThan(0.3);
    expect(v.speed).toBeLessThan(0); // zurückgeprallt
    expect(v.x).toBeLessThan(20);
  });

  it('kleine Rempler verursachen keinen Schaden', () => {
    const v = new Vehicle(0, 0, 0, 0);
    v.speed = 2;
    run(v, 3, {}, wall);
    run(v, 0.1, { throttle: 0 }, wall);
    expect(v.health).toBe(100);
  });

  it('Totalschaden: kein Antrieb mehr, das Auto rollt aus', () => {
    const v = new Vehicle(0, 0, 0, 0);
    v.health = 0;
    run(v, 3, { throttle: 1 });
    expect(v.speed).toBe(0);
    v.speed = 10;
    run(v, 30, { throttle: 1 });
    expect(v.speed).toBe(0);
  });

  it('Auto gegen Auto: Impuls wird übertragen, beide nehmen Schaden', () => {
    const a = new Vehicle(0, 0, 0, 1);
    const b = new Vehicle(4.2, 0, 0, 2);
    a.speed = 20;
    let touched = false;
    for (let i = 0; i < 60 && !touched; i++) {
      a.update(1 / 60, { ...idle, throttle: 1 });
      touched = collideVehicles(a, b);
    }
    expect(touched).toBe(true);
    expect(b.speed).toBeGreaterThan(5);
    expect(a.speed).toBeLessThan(18);
    expect(a.health).toBeLessThan(100);
    expect(b.health).toBeLessThan(100);
    expect(b.crash!.zone).toBe('rear');
    expect(a.crash!.zone).toBe('front');
  });
});
