import { Perk, TALENTS, TalentDef, pointsForLevel, talent } from '../data/talents';

export type UnlockResult = { ok: true } | { ok: false; reason: string };

/** Freigeschaltete Talente. Punkte kommen aus der Charakterstufe (siehe `pointsForLevel`). Reine Logik. */
export class Talents {
  private have = new Set<string>();

  has(id: string): boolean {
    return this.have.has(id);
  }

  get list(): string[] {
    return [...this.have];
  }

  /** Ausgegebene Talentpunkte */
  get spent(): number {
    let n = 0;
    for (const id of this.have) n += talent(id)?.cost ?? 0;
    return n;
  }

  /** Noch freie Punkte auf dieser Charakterstufe */
  free(level: number): number {
    return Math.max(0, pointsForLevel(level) - this.spent);
  }

  /** Fehlende Vorgänger (Namen) */
  missing(t: TalentDef): string[] {
    return (t.requires ?? []).filter((r) => !this.have.has(r)).map((r) => talent(r)?.name ?? r);
  }

  canUnlock(t: TalentDef, level: number): UnlockResult {
    if (this.have.has(t.id)) return { ok: false, reason: 'Schon freigeschaltet.' };
    const miss = this.missing(t);
    if (miss.length) return { ok: false, reason: `Zuerst nötig: ${miss.join(', ')}` };
    if (this.free(level) < t.cost) return { ok: false, reason: `Dir fehlen Talentpunkte (${t.cost} nötig).` };
    return { ok: true };
  }

  unlock(id: string, level: number): UnlockResult {
    const t = talent(id);
    if (!t) return { ok: false, reason: 'Unbekanntes Talent.' };
    const c = this.canUnlock(t, level);
    if (c.ok) this.have.add(id);
    return c;
  }

  /** Rezept-Ids, die durch Talente bekannt sind */
  knownRecipes(): Set<string> {
    const out = new Set<string>();
    for (const id of this.have) for (const r of talent(id)?.recipes ?? []) out.add(r);
    return out;
  }

  /** Alle Vorteile zusammengerechnet (Faktoren multipliziert, Tragkraft addiert) */
  perks(): Required<Perk> {
    const p: Required<Perk> = { build: 1, mechTime: 1, repair: 1, treat: 1, carry: 0, melee: 1 };
    for (const id of this.have) {
      const q = talent(id)?.perk;
      if (!q) continue;
      p.build *= q.build ?? 1;
      p.mechTime *= q.mechTime ?? 1;
      p.repair *= q.repair ?? 1;
      p.treat *= q.treat ?? 1;
      p.melee *= q.melee ?? 1;
      p.carry += q.carry ?? 0;
    }
    return p;
  }

  toJSON(): { have: string[] } {
    return { have: this.list };
  }

  fromJSON(j?: { have?: string[] }): void {
    this.have = new Set((j?.have ?? []).filter((id) => TALENTS.some((t) => t.id === id)));
  }

  reset(): void {
    this.have.clear();
  }
}
