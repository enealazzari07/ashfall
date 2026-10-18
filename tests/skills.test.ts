import { describe, expect, it } from 'vitest';
import { MAX_LEVEL, SKILL_FX, SKILL_IDS, XP_AT, levelOf } from '../src/data/skills';
import { PROFESSIONS } from '../src/data/professions';
import { TRAITS, excludes } from '../src/data/traits';
import { Skills } from '../src/sim/Skills';
import { BASE_POINTS, Build, applyBuild, effectsOf, pointsLeft, randomBuild, startItems, validateBuild, whyNotTrait } from '../src/sim/Profile';
import { item } from '../src/data/items';

const lcg = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

describe('XP-Kurve', () => {
  it('Stufen steigen mit den Schwellen und enden bei 10', () => {
    expect(levelOf(0)).toBe(0);
    expect(levelOf(XP_AT[0] - 1)).toBe(0);
    expect(levelOf(XP_AT[0])).toBe(1);
    expect(levelOf(XP_AT[9])).toBe(10);
    expect(levelOf(1e9)).toBe(MAX_LEVEL);
    for (let i = 1; i < XP_AT.length; i++) expect(XP_AT[i]).toBeGreaterThan(XP_AT[i - 1]);
  });
  it('Wirkungen wachsen monoton', () => {
    expect(SKILL_FX.damage(5)).toBeGreaterThan(SKILL_FX.damage(1));
    expect(SKILL_FX.buildTime(10)).toBeGreaterThan(0.4);
    expect(SKILL_FX.buildTime(10)).toBeLessThan(SKILL_FX.buildTime(1));
  });
});

describe('Skills', () => {
  it('XP mit Boost und Lernfaktor, Aufstieg löst Ereignis aus', () => {
    const s = new Skills();
    const ups: string[] = [];
    s.onLevel = (id, l) => ups.push(`${id}${l}`);
    s.add('carpentry', 60); // ungeübt ×0.5 → 30 XP
    expect(s.xpOf('carpentry')).toBe(30);
    expect(s.level('carpentry')).toBe(0);
    s.boost = { carpentry: 2 };
    const r = s.add('carpentry', 60); // ×1.3 → 78 → 108 → Stufe 1
    expect(r.levelUp).toBe(1);
    expect(ups).toEqual(['carpentry1']);
    s.learn = 1.3;
    const before = s.xpOf('carpentry');
    s.add('carpentry', 10);
    expect(s.xpOf('carpentry') - before).toBeCloseTo(10 * 1.3 * 1.3, 5);
  });
  it('Deckel bei Stufe 10 und Fortschrittsanzeige', () => {
    const s = new Skills();
    s.setLevel('fitness', 10);
    expect(s.level('fitness')).toBe(10);
    expect(s.add('fitness', 500).gained).toBe(0);
    expect(s.progress('fitness')).toBe(1);
    s.setLevel('strength', 2);
    expect(s.progress('strength')).toBe(0);
    s.boost = { strength: 1 };
    s.add('strength', 125 / 1);
    expect(s.progress('strength')).toBeGreaterThan(0.3);
  });
  it('setLevel senkt nie', () => {
    const s = new Skills();
    s.setLevel('axe', 4);
    s.setLevel('axe', 2);
    expect(s.level('axe')).toBe(4);
  });
});

describe('Charaktererstellung', () => {
  it('Punkte: Beruf und Eigenschaften werden verrechnet', () => {
    const b: Build = { name: 'A', profession: 'unemployed', traits: [] };
    expect(pointsLeft(b)).toBe(BASE_POINTS + 4);
    b.profession = 'nurse';
    expect(pointsLeft(b)).toBe(BASE_POINTS - 4);
    b.traits = ['slowlearner'];
    expect(pointsLeft(b)).toBe(BASE_POINTS - 4 + 4);
  });
  it('Ausschlüsse gelten in beide Richtungen und blockieren Eigenschaften', () => {
    expect(excludes('athletic', 'unfit')).toBe(true);
    expect(excludes('unfit', 'athletic')).toBe(true);
    const b: Build = { name: 'A', profession: 'unemployed', traits: ['athletic'] };
    expect(whyNotTrait(b, 'unfit')).toMatch(/Passt nicht/);
    expect(whyNotTrait(b, 'athletic')).toMatch(/Schon/);
    const poor: Build = { name: 'A', profession: 'trainer', traits: ['strong'] };
    expect(pointsLeft(poor)).toBe(BASE_POINTS - 4 - 4);
    expect(whyNotTrait(poor, 'fastlearner')).toMatch(/Punkte/);
    expect(whyNotTrait(poor, 'weak')).toMatch(/Passt nicht/);
  });
  it('validateBuild erkennt Fehler', () => {
    expect(validateBuild({ name: '', profession: 'cook', traits: [] }).ok).toBe(false);
    expect(validateBuild({ name: 'X', profession: 'nope', traits: [] }).ok).toBe(false);
    expect(validateBuild({ name: 'X', profession: 'cook', traits: ['athletic', 'unfit'] }).ok).toBe(false);
    expect(validateBuild({ name: 'X', profession: 'nurse', traits: ['strong', 'athletic'] }).ok).toBe(false);
    expect(validateBuild({ name: 'X', profession: 'cook', traits: ['frugal'] }).ok).toBe(true);
  });
  it('Zufalls-Charaktere sind immer gültig', () => {
    const r = lcg(99);
    for (let i = 0; i < 60; i++) expect(validateBuild(randomBuild(r, 'Z')).ok).toBe(true);
  });
  it('Eigenschaften wirken: Faktoren multiplizieren, Tragkraft addiert', () => {
    const fx = effectsOf({ name: 'A', profession: 'cook', traits: ['frugal', 'strong', 'lightfoot'] });
    expect(fx.hunger).toBeCloseTo(0.75);
    expect(fx.carry).toBe(3);
    expect(fx.noise).toBeCloseTo(0.7);
    const bad = effectsOf({ name: 'A', profession: 'cook', traits: ['hungry', 'weak'] });
    expect(bad.hunger).toBeGreaterThan(1);
    expect(bad.carry).toBe(-3);
  });
  it('Beruf setzt Startstufen und Boosts, Eigenschaften erhöhen sie', () => {
    const s = new Skills();
    applyBuild({ name: 'A', profession: 'nurse', traits: ['fastlearner'] }, s);
    expect(s.level('firstaid')).toBe(3);
    expect(s.boost.firstaid).toBe(3);
    expect(s.learn).toBeCloseTo(1.3);
    applyBuild({ name: 'A', profession: 'trainer', traits: ['athletic'] }, s);
    expect(s.boost.fitness).toBe(3); // 3 + 2, gedeckelt
    expect(s.level('nurse' as never)).toBe(0);
    expect(s.learn).toBe(1);
  });
  it('Daten sind stimmig: Items existieren, Fertigkeiten bekannt, keine doppelten IDs', () => {
    for (const p of PROFESSIONS) {
      for (const st of startItems({ name: 'x', profession: p.id, traits: [] })) expect(() => item(st.id), `${p.id}:${st.id}`).not.toThrow();
      for (const k of [...Object.keys(p.boost), ...Object.keys(p.start)]) expect(SKILL_IDS as string[]).toContain(k);
    }
    for (const t of TRAITS) {
      for (const o of t.excl ?? []) expect(TRAITS.some((q) => q.id === o), `${t.id}→${o}`).toBe(true);
      for (const k of Object.keys(t.boost ?? {})) expect(SKILL_IDS as string[]).toContain(k);
    }
    expect(new Set(TRAITS.map((t) => t.id)).size).toBe(TRAITS.length);
    expect(new Set(PROFESSIONS.map((t) => t.id)).size).toBe(PROFESSIONS.length);
  });
});
