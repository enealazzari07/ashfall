import { describe, expect, it } from 'vitest';
import { RAYS, Vision, angDiff } from '../src/render/Vision';

/** Strahlen mit gleichmäßig freier Sicht bis `d` */
function open(v: Vision, d: number): void {
  v.rays.fill(d);
}

describe('Sichtfeld', () => {
  it('vorn sichtbar, hinten außerhalb des Nahbereichs nicht', () => {
    const v = new Vision();
    v.facing = 0; // +z
    v.range = 18;
    open(v, 30);
    expect(v.sees(0, 10)).toBe(true);
    expect(v.sees(0, -10)).toBe(false);
    expect(v.sees(0, -1.5)).toBe(true); // dicht hinter dem Rücken bemerkt man noch etwas
  });

  it('seitlich im Kegel sichtbar, quer dazu nicht', () => {
    const v = new Vision();
    v.facing = 0;
    v.range = 18;
    open(v, 30);
    const a = (50 * Math.PI) / 180;
    expect(v.sees(Math.sin(a) * 8, Math.cos(a) * 8)).toBe(true); // 50° seitlich
    expect(v.sees(8, 0)).toBe(false); // 90° seitlich
  });

  it('Reichweite begrenzt die Sicht', () => {
    const v = new Vision();
    v.facing = 0;
    v.range = 10;
    open(v, 30);
    expect(v.sees(0, 8)).toBe(true);
    expect(v.sees(0, 14)).toBe(false);
  });

  it('eine Wand verdeckt, eine Lücke (Fenster) lässt durch', () => {
    const v = new Vision();
    v.facing = 0;
    v.range = 18;
    open(v, 30);
    // Wand in 5 m Abstand, außer im schmalen Winkel um 0 (Fenster)
    for (let i = 0; i < RAYS; i++) {
      const a = (i / RAYS) * Math.PI * 2;
      if (angDiff(a, 0) > 0.12) v.rays[i] = 5;
    }
    expect(v.sees(0, 10)).toBe(true); // durchs Fenster
    const a = 0.4;
    expect(v.sees(Math.sin(a) * 10, Math.cos(a) * 10)).toBe(false); // hinter der Wand
    expect(v.sees(Math.sin(a) * 3, Math.cos(a) * 3)).toBe(true); // davor
  });

  it('ausgeschaltet sieht man alles', () => {
    const v = new Vision();
    v.enabled = false;
    expect(v.sees(0, -50)).toBe(true);
  });
});
