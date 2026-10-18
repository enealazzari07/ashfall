import { PROFESSIONS, profession } from '../data/professions';
import { SKILL_IDS, SkillId } from '../data/skills';
import { TRAITS, TraitFx, excludes, trait } from '../data/traits';
import type { Stack } from '../data/items';
import { Skills } from './Skills';

/** Was die Spielerin in der Charaktererstellung wählt */
export interface Build {
  name: string;
  profession: string;
  traits: string[];
  /** Kleidung zum Start: Kapuzenpulli (Standard) oder Kleid */
  look?: 'standard' | 'dress';
}

/** Punkte, mit denen man startet (Beruf und Eigenschaften werden davon bezahlt oder bringen welche) */
export const BASE_POINTS = 6;

export const DEFAULT_BUILD: Build = { name: 'Überlebender', profession: 'unemployed', traits: [] };

export function pointsLeft(b: Build): number {
  const traits = b.traits.reduce((s, id) => s + (trait(id)?.cost ?? 0), 0);
  return BASE_POINTS - profession(b.profession).cost - traits;
}

/** Warum diese Eigenschaft gerade nicht hinzugefügt werden kann (null = geht) */
export function whyNotTrait(b: Build, id: string): string | null {
  const t = trait(id);
  if (!t) return 'Unbekannte Eigenschaft.';
  if (b.traits.includes(id)) return 'Schon gewählt.';
  const clash = b.traits.find((o) => excludes(o, id));
  if (clash) return `Passt nicht zu „${trait(clash)!.name}“.`;
  if (pointsLeft(b) - t.cost < 0) return 'Zu wenig Punkte.';
  return null;
}

export function validateBuild(b: Build): { ok: boolean; reason?: string; points: number } {
  const points = pointsLeft(b);
  if (!b.name.trim()) return { ok: false, reason: 'Der Charakter braucht einen Namen.', points };
  if (!PROFESSIONS.some((p) => p.id === b.profession)) return { ok: false, reason: 'Unbekannter Beruf.', points };
  for (let i = 0; i < b.traits.length; i++) {
    if (!trait(b.traits[i])) return { ok: false, reason: 'Unbekannte Eigenschaft.', points };
    for (let j = i + 1; j < b.traits.length; j++) {
      if (excludes(b.traits[i], b.traits[j])) return { ok: false, reason: 'Widersprüchliche Eigenschaften.', points };
    }
  }
  if (points < 0) return { ok: false, reason: 'Mehr Punkte ausgegeben, als vorhanden sind.', points };
  return { ok: true, points };
}

export interface Fx {
  hunger: number;
  thirst: number;
  fatigue: number;
  noise: number;
  learn: number;
  carry: number;
  panic: number;
  damage: number;
  cold: number;
  sleep: number;
}

export const NEUTRAL_FX: Fx = { hunger: 1, thirst: 1, fatigue: 1, noise: 1, learn: 1, carry: 0, panic: 1, damage: 1, cold: 1, sleep: 1 };

/** Alle Eigenschaften zusammengerechnet: Faktoren multipliziert, Tragkraft addiert */
export function effectsOf(b: Build): Fx {
  const fx = { ...NEUTRAL_FX };
  for (const id of b.traits) {
    const f: TraitFx = trait(id)?.fx ?? {};
    for (const k of Object.keys(f) as (keyof TraitFx)[]) {
      if (k === 'carry') fx.carry += f.carry ?? 0;
      else fx[k] *= f[k] ?? 1;
    }
  }
  return fx;
}

/** Überträgt Beruf und Eigenschaften auf die Fertigkeiten: Boost-Stufen, Lernfaktor, Startstufen */
export function applyBuild(b: Build, skills: Skills): void {
  skills.reset();
  const prof = profession(b.profession);
  const boost: Partial<Record<SkillId, number>> = { ...prof.boost };
  for (const id of b.traits) {
    for (const [sk, tier] of Object.entries(trait(id)?.boost ?? {}) as [SkillId, number][]) boost[sk] = Math.min(3, (boost[sk] ?? 0) + tier);
  }
  skills.boost = boost;
  skills.learn = effectsOf(b).learn;
  for (const id of SKILL_IDS) if (prof.start[id]) skills.setLevel(id, prof.start[id]!);
}

export function startItems(b: Build): Stack[] {
  return profession(b.profession).items.map((s) => ({ ...s }));
}

/** Zufälliger gültiger Charakter (Knopf „Zufall“) */
export function randomBuild(r: () => number, name = DEFAULT_BUILD.name): Build {
  const prof = PROFESSIONS[Math.floor(r() * PROFESSIONS.length)];
  const b: Build = { name, profession: prof.id, traits: [] };
  const pool = [...TRAITS].sort(() => r() - 0.5);
  for (const t of pool) {
    if (r() < 0.45 && !whyNotTrait(b, t.id)) b.traits.push(t.id);
  }
  // Wer Punkte übrig hat, darf sie ruhig behalten; ungültig wird es nie, weil whyNotTrait prüft
  return b;
}
