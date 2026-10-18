/**
 * Charakterstufe: sammelt Erfahrung aus allen Fertigkeiten und aus dem Herstellen.
 * Höhere Stufen schalten Rezepte frei (siehe `Recipe.level`). Reine Logik, ohne Darstellung.
 */
export const LEVEL_MAX = 20;

/** XP, die von Stufe `l` auf `l + 1` nötig sind (l ab 1) */
export const levelStep = (l: number): number => Math.round(80 + 40 * l + 6 * l * l);

/** Gesamt-XP, ab der Stufe `l` erreicht ist (Stufe 1 = 0 XP) */
export function xpForLevel(l: number): number {
  let sum = 0;
  for (let i = 1; i < l; i++) sum += levelStep(i);
  return sum;
}

export function levelFromXp(xp: number): number {
  let l = 1;
  while (l < LEVEL_MAX && xp >= xpForLevel(l + 1)) l++;
  return l;
}

export class PlayerLevel {
  xp = 0;

  get level(): number {
    return levelFromXp(this.xp);
  }

  /** XP bis zur nächsten Stufe (0 auf Maximalstufe) */
  get toNext(): number {
    const l = this.level;
    return l >= LEVEL_MAX ? 0 : xpForLevel(l + 1) - this.xp;
  }

  /** Fortschritt zur nächsten Stufe 0..1 */
  get progress(): number {
    const l = this.level;
    if (l >= LEVEL_MAX) return 1;
    return (this.xp - xpForLevel(l)) / levelStep(l);
  }

  /** Neue Stufe, falls aufgestiegen */
  add(amount: number): number | null {
    if (amount <= 0 || this.level >= LEVEL_MAX) return null;
    const before = this.level;
    this.xp = Math.min(xpForLevel(LEVEL_MAX), this.xp + amount);
    const after = this.level;
    return after > before ? after : null;
  }

  toJSON(): { xp: number } {
    return { xp: this.xp };
  }

  fromJSON(j?: { xp?: number }): void {
    this.xp = Math.max(0, j?.xp ?? 0);
  }

  reset(): void {
    this.xp = 0;
  }
}
