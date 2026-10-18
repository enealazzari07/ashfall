import { BOOST_MULT, MAX_LEVEL, SKILL_IDS, SkillId, XP_AT, levelOf } from '../data/skills';

export interface XpResult {
  /** Tatsächlich gutgeschriebene XP (nach Multiplikatoren) */
  gained: number;
  /** Neue Stufe, falls aufgestiegen */
  levelUp: number | null;
}

/** Fertigkeiten mit XP. Reine Logik, ohne Darstellung. */
export class Skills {
  private xp = new Map<SkillId, number>();
  /** Boost-Stufe 0–3 je Fertigkeit (Beruf + Eigenschaften) */
  boost: Partial<Record<SkillId, number>> = {};
  /** Allgemeiner Lernfaktor (Eigenschaften) */
  learn = 1;
  onLevel?: (id: SkillId, level: number) => void;

  constructor() {
    for (const id of SKILL_IDS) this.xp.set(id, 0);
  }

  xpOf(id: SkillId): number {
    return this.xp.get(id) ?? 0;
  }

  level(id: SkillId): number {
    return levelOf(this.xpOf(id));
  }

  /** Fortschritt zur nächsten Stufe 0..1 (auf Stufe 10: 1) */
  progress(id: SkillId): number {
    const l = this.level(id);
    if (l >= MAX_LEVEL) return 1;
    const from = l === 0 ? 0 : XP_AT[l - 1];
    return (this.xpOf(id) - from) / (XP_AT[l] - from);
  }

  /** Setzt die Fertigkeit auf mindestens diese Stufe (Startwerte) */
  setLevel(id: SkillId, level: number): void {
    const l = Math.max(0, Math.min(MAX_LEVEL, Math.floor(level)));
    const need = l === 0 ? 0 : XP_AT[l - 1];
    if (this.xpOf(id) < need) this.xp.set(id, need);
  }

  multiplier(id: SkillId): number {
    const tier = Math.max(0, Math.min(BOOST_MULT.length - 1, Math.round(this.boost[id] ?? 0)));
    return BOOST_MULT[tier] * this.learn;
  }

  /** XP aus einer Handlung. Deckel bei Stufe 10. */
  add(id: SkillId, amount: number): XpResult {
    const before = this.level(id);
    if (before >= MAX_LEVEL || amount <= 0) return { gained: 0, levelUp: null };
    const cap = XP_AT[MAX_LEVEL - 1];
    const have = this.xpOf(id);
    const next = Math.min(cap, have + amount * this.multiplier(id));
    this.xp.set(id, next);
    const after = levelOf(next);
    if (after > before) this.onLevel?.(id, after);
    return { gained: next - have, levelUp: after > before ? after : null };
  }

  /** Spielstand */
  toJSON(): { xp: [SkillId, number][]; boost: Partial<Record<SkillId, number>>; learn: number } {
    return { xp: [...this.xp], boost: { ...this.boost }, learn: this.learn };
  }

  fromJSON(j: { xp?: [SkillId, number][]; boost?: Partial<Record<SkillId, number>>; learn?: number }): void {
    this.reset();
    for (const [id, v] of j.xp ?? []) this.xp.set(id, v);
    this.boost = { ...(j.boost ?? {}) };
    this.learn = j.learn ?? 1;
  }

  /** Alles auf Anfang (neuer Charakter) */
  reset(): void {
    for (const id of SKILL_IDS) this.xp.set(id, 0);
    this.boost = {};
    this.learn = 1;
  }
}
