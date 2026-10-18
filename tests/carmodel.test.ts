import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CAR_MODELS, CAR_MODEL_COUNT, carGeos, makeCar, wheelSpots } from '../src/render/CarModel';
import { Vehicle } from '../src/player/Vehicle';

describe('Automodelle', () => {
  it('es gibt mindestens 6 verschiedene Modelle, alle bauen fehlerfrei', () => {
    expect(CAR_MODEL_COUNT).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < CAR_MODEL_COUNT; i++) {
      const g = carGeos(i);
      for (const geo of [g.paintStatic, g.parkedPaint, g.parkedTrim, g.glass, g.under, g.interior]) {
        expect(geo.attributes.position.count).toBeGreaterThan(30);
        expect(Number.isFinite(geo.attributes.position.array[0] as number)).toBe(true);
      }
      const rig = makeCar(0xaa3333, i);
      rig.deform({ front: 0.6, rear: 0.3, left: 0.2, right: 0.5 });
      expect(rig.shedParts({ front: 1, rear: 0, left: 0, right: 0 }, 25).length).toBeGreaterThan(0);
    }
  });

  it('Modelle unterscheiden sich in Maßen und Sitzen', () => {
    const lens = new Set(CAR_MODELS.map((m) => m.len));
    expect(lens.size).toBeGreaterThanOrEqual(5);
    const seats = CAR_MODELS.map((m) => m.rows.reduce((a, r) => a + r.n, 0));
    expect(Math.max(...seats)).toBeGreaterThanOrEqual(7);
    expect(seats.filter((n) => n >= 4).length).toBeGreaterThanOrEqual(5);
  });

  it('Räder sitzen in den Radausschnitten und innerhalb der Karosserie', () => {
    for (const m of CAR_MODELS) {
      for (const [x, z] of wheelSpots(m)) {
        expect(Math.abs(z)).toBeLessThan(m.W / 2);
        expect(x).toBeLessThan(m.noseX);
        expect(x).toBeGreaterThan(m.tailX);
      }
      // Tür liegt vor dem hinteren und hinter dem vorderen Radausschnitt
      const R = m.wheelR + 0.07;
      expect(m.doorX1).toBeLessThan(m.frontAxle - R);
      expect(m.doorX0).toBeGreaterThan(m.rearAxle + R * 0.9 - 0.4);
    }
  });

  it('Dach schließt an die Säulen an: Glasbox liegt unter der Dachhöhe', () => {
    for (let i = 0; i < CAR_MODEL_COUNT; i++) {
      const g = carGeos(i);
      g.glass.computeBoundingBox();
      expect(g.glass.boundingBox!.max.y).toBeLessThanOrEqual(CAR_MODELS[i].roof);
      g.paintStatic.computeBoundingBox();
      expect(g.paintStatic.boundingBox!.max.y).toBeCloseTo(CAR_MODELS[i].roof, 1);
    }
  });

  it('Fahrzeugmaße kommen aus dem Modell', () => {
    const a = new Vehicle(0, 0, 0, 1, 0), b = new Vehicle(0, 0, 0, 1, 4);
    expect(b.dims.len).toBeGreaterThan(a.dims.len);
    expect(b.bodyR).toBeGreaterThan(a.bodyR);
    expect(new THREE.Vector3().length()).toBe(0);
  });
});
