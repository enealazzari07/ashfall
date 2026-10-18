import { describe, expect, it } from 'vitest';
import { AudioEngine, spatial } from '../src/audio/AudioEngine';

describe('Klang: Raumposition', () => {
  const l = { x: 0, z: 0, yaw: 0 }; // Blick entlang +z

  it('nahe Geräusche sind laut, ferne leise, sehr ferne stumm', () => {
    expect(spatial(l, 0, 2).gain).toBeGreaterThan(0.85);
    expect(spatial(l, 0, 20).gain).toBeLessThan(spatial(l, 0, 8).gain);
    expect(spatial(l, 0, 60).gain).toBe(0);
  });

  it('links und rechts: Blick +z, ein Geräusch bei +x liegt links (Blick nach hinten gedreht)', () => {
    expect(spatial(l, 10, 0).pan).toBeLessThan(-0.5);
    expect(spatial(l, -10, 0).pan).toBeGreaterThan(0.5);
    expect(Math.abs(spatial(l, 0, 10).pan)).toBeLessThan(0.01); // genau voraus: Mitte
  });

  it('Drehung der Kamera dreht die Seiten mit', () => {
    const turned = { x: 0, z: 0, yaw: Math.PI }; // Blick entlang -z
    expect(spatial(turned, 10, 0).pan).toBeGreaterThan(0.5);
    expect(spatial(turned, -10, 0).pan).toBeLessThan(-0.5);
  });

  it('der Hörer steht nie auf einem NaN, auch auf der Quelle', () => {
    const s = spatial(l, 0, 0);
    expect(Number.isFinite(s.pan)).toBe(true);
    expect(s.gain).toBe(1);
  });
});

describe('Klang: ohne AudioContext', () => {
  it('alle Ereignisse sind harmlos, wenn es keinen Ton gibt', () => {
    const a = new AudioEngine();
    a.setVolumes(1, 1, 1);
    a.setListener(1, 2, 3);
    a.footstep('grass', true);
    a.swing(true);
    a.hit(true, true, 1, 1);
    a.hurt();
    a.bite();
    a.death();
    a.levelUp();
    a.zombieGroan('sprinter', 3, 3, true);
    a.zombieAttack('fast', 3, 3);
    a.doorOpen(1, 1);
    a.doorClose(1, 1);
    a.doorBreak(1, 1);
    a.glassBreak(1, 1);
    a.wood(1, 1, true);
    a.crash(10, 1, 1);
    a.eat();
    a.drink();
    a.bandage();
    a.rustle();
    a.craft();
    a.ui('click');
    a.engine(true, 3000, 0.5);
    a.engine(false, 0, 0);
    a.engineStart(true);
    a.horn();
    a.update({ night: 0.5, rain: 0, clouds: 0, indoors: false, tension: 0.5, hp: 100, chased: false, dt: 0.016 });
    expect(true).toBe(true);
  });
});
