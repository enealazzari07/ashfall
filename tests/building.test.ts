import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Structures, footprintOf, snapPiece } from '../src/world/Structures';
import { PIECES } from '../src/data/recipes';
import { Inventory } from '../src/player/Inventory';
import { Needs } from '../src/player/Needs';

const piece = (id: string) => PIECES.find((p) => p.id === id)!;
const freeWorld = { overlapsWorld: () => false };

describe('Basisbau', () => {
  it('rastet Wände so ein, dass Ecken zusammentreffen', () => {
    const wall = piece('wall');
    const h = snapPiece(wall, 2.3, 0.4, 0); // waagerecht
    const v = snapPiece(wall, 0.6, 1.8, 1); // senkrecht
    expect(h).toEqual({ x: 2, z: 1 });
    expect(v).toEqual({ x: 1, z: 2 });
    // Ende der waagerechten Wand (3,1) = Ende der senkrechten Wand (1+?)
    const h2 = snapPiece(wall, 4.2, 0.9, 0);
    expect(h2.x - h.x).toBe(2); // Nachbar genau eine Wandlänge weiter
  });

  it('verhindert Überlappung, erlaubt aber Ecken-Anschluss', () => {
    const s = new Structures();
    const wall = piece('wall');
    s.place(wall, 0, 1, 0);
    expect(s.canPlace(wall, 0, 1, 0, freeWorld)).toBe(false); // gleiche Stelle
    expect(s.canPlace(wall, 2, 1, 0, freeWorld)).toBe(true); // Nachbar
    expect(s.canPlace(wall, 1, 0, 1, freeWorld)).toBe(true); // Ecke
  });

  it('respektiert Weltkollisionen', () => {
    const s = new Structures();
    expect(s.canPlace(piece('wall'), 0, 1, 0, { overlapsWorld: () => true })).toBe(false);
  });

  it('Wand blockiert den Spieler, Tür lässt ihn durch', () => {
    const s = new Structures();
    s.place(piece('wall'), 0, 1, 0);
    s.place(piece('door'), 4, 1, 0);
    const a = new Vector3(0, 0, 1.1);
    s.resolve(a, 0.4);
    expect(Math.abs(a.z - 1)).toBeGreaterThanOrEqual(0.5); // aus der Wand geschoben
    const b = new Vector3(4, 0, 1);
    s.resolve(b, 0.4);
    expect(b.x).toBe(4); // Türöffnung frei
    expect(b.z).toBe(1);
  });

  it('Lagerfeuer brennt ab und wärmt nur, solange es brennt', () => {
    const s = new Structures();
    const f = s.place(piece('fire'), 0, 0, 0);
    expect(s.isWarm(1, 1)).toBe(true);
    expect(s.isWarm(10, 0)).toBe(false);
    expect(s.update(9, 0, new Vector3(), 0)).toBe(1); // Startvorrat 8 h
    expect(f.fuel).toBe(0);
    expect(s.isWarm(1, 1)).toBe(false);
    s.addWood(f);
    expect(f.fuel).toBe(4);
    expect(s.isWarm(1, 1)).toBe(true);
  });

  it('Footprint dreht sich mit der Rotation', () => {
    const b = footprintOf(piece('bed'), 0, 0, 1);
    expect([b.w, b.d]).toEqual([1.5, 2]);
  });
});

describe('Inventory.consume', () => {
  it('zieht über mehrere Stacks ab und ändert nichts, wenn zu wenig da ist', () => {
    const inv = new Inventory(100);
    inv.add('wood', 7); // 5 + 2
    expect(inv.consume([{ id: 'wood', qty: 99 }])).toBe(false);
    expect(inv.count('wood')).toBe(7);
    expect(inv.consume([{ id: 'wood', qty: 6 }])).toBe(true);
    expect(inv.count('wood')).toBe(1);
  });

  it('canSwap prüft die Tragkraft nach dem Abzug', () => {
    const inv = new Inventory(0.5);
    inv.add('cloth', 2); // 0.4 kg von 0.5
    expect(inv.canSwap([{ id: 'cloth', qty: 2 }], { id: 'bandage', qty: 1 })).toBe(true); // 0.1 kg
    const full = new Inventory(0.5);
    full.add('cloth', 2);
    full.add('bandage', 1); // 0.5 kg: randvoll
    expect(full.canSwap([{ id: 'cloth', qty: 1 }], { id: 'wood', qty: 1 })).toBe(false); // 1.5 kg passen nicht
  });
});

describe('Schlaf', () => {
  it('gibt Energie zurück und spart Hunger/Durst', () => {
    const a = new Needs(), b = new Needs();
    a.values.energy = b.values.energy = 20;
    a.update(4, { sprinting: false, cold: 0, sleeping: true });
    b.update(4, { sprinting: false, cold: 0 });
    expect(a.values.energy).toBeGreaterThan(60);
    expect(b.values.energy).toBeLessThan(20);
    expect(a.values.hunger).toBeGreaterThan(b.values.hunger);
  });
});
