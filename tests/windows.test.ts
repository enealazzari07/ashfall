import { describe, expect, it } from 'vitest';
import { MAX_PLANKS, PLANK_HP, GLASS_HP, WinState, addPlank, removePlank, strikeWindow, windowOpen } from '../src/world/Windows';
import { workCharacter, createCharacter } from '../src/render/Character';

const fresh = (glass = true): WinState => ({ glass, hp: GLASS_HP, planks: 0, plankHp: PLANK_HP });

describe('Fenster', () => {
  it('Scheibe hält Schläge aus und zerbricht dann', () => {
    const s = fresh();
    expect(windowOpen(s)).toBe(false);
    expect(strikeWindow(s, 10)).toBe('hit');
    expect(strikeWindow(s, 25)).toBe('glass');
    expect(s.glass).toBe(false);
    expect(windowOpen(s)).toBe(true);
    expect(strikeWindow(s, 50)).toBeNull();
  });

  it('Bretter gehen nur bei zerbrochener Scheibe und bis zum Maximum', () => {
    const s = fresh(true);
    expect(addPlank(s)).toBe(false);
    s.glass = false;
    for (let i = 0; i < MAX_PLANKS; i++) expect(addPlank(s)).toBe(true);
    expect(addPlank(s)).toBe(false);
    expect(windowOpen(s)).toBe(false);
  });

  it('Zombies brechen erst Bretter, dann ist das Fenster offen', () => {
    const s = fresh(false);
    addPlank(s);
    addPlank(s);
    expect(strikeWindow(s, PLANK_HP)).toBe('plank');
    expect(s.planks).toBe(1);
    expect(strikeWindow(s, PLANK_HP)).toBe('plank');
    expect(windowOpen(s)).toBe(true);
  });

  it('Brett abnehmen öffnet das Fenster wieder', () => {
    const s = fresh(false);
    addPlank(s);
    expect(removePlank(s)).toBe(true);
    expect(removePlank(s)).toBe(false);
    expect(windowOpen(s)).toBe(true);
  });
});

describe('Arbeitshaltungen', () => {
  it('alle Posen setzen Arme und laufen ohne Fehler', () => {
    const g = createCharacter({ jacket: 0x444444, pants: 0x222222, skin: 0xd0a080, hair: 0x221100 });
    for (const p of ['hammer', 'loot', 'eat', 'treat', 'dress'] as const) {
      expect(() => workCharacter(g, p, 1.3)).not.toThrow();
    }
  });
});
