export interface StatDef {
  id: string;
  min: number;
  max: number;
  /** Startwert und Wert nach `reset` */
  def: number;
}

/**
 * Zentrales Register aller Charakterwerte. Jeder Wert hat Grenzen und einen Standard;
 * alles andere (Moodles, Wirkungen, Anzeige) liest nur von hier.
 */
export class StatRegister {
  private defs = new Map<string, StatDef>();
  private vals = new Map<string, number>();

  define(id: string, min: number, max: number, def = min): void {
    if (this.defs.has(id)) throw new Error(`Wert doppelt definiert: ${id}`);
    if (!(min <= def && def <= max)) throw new Error(`Standardwert von ${id} liegt außerhalb der Grenzen`);
    this.defs.set(id, { id, min, max, def });
    this.vals.set(id, def);
  }

  /** Alle Werte als einfaches Objekt (für Spielstände) */
  toJSON(): Record<string, number> {
    return Object.fromEntries(this.vals);
  }

  /** Werte aus einem Spielstand setzen (unbekannte Schlüssel werden ignoriert) */
  fromJSON(j: Record<string, number> | undefined): void {
    if (!j) return;
    for (const [k, v] of Object.entries(j)) if (this.has(k) && Number.isFinite(v)) this.set(k, v);
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  ids(): string[] {
    return [...this.defs.keys()];
  }

  def(id: string): StatDef {
    const d = this.defs.get(id);
    if (!d) throw new Error(`Unbekannter Wert: ${id}`);
    return d;
  }

  get(id: string): number {
    this.def(id);
    return this.vals.get(id)!;
  }

  /** Setzt den Wert (begrenzt). Gibt true zurück, wenn er sich geändert hat. */
  set(id: string, value: number): boolean {
    const d = this.def(id);
    const v = Math.min(d.max, Math.max(d.min, value));
    const changed = v !== this.vals.get(id);
    this.vals.set(id, v);
    return changed;
  }

  add(id: string, amount: number): boolean {
    return this.set(id, this.get(id) + amount);
  }

  remove(id: string, amount: number): boolean {
    return this.add(id, -amount);
  }

  reset(id: string): boolean {
    return this.set(id, this.def(id).def);
  }

  resetAll(): void {
    for (const id of this.defs.keys()) this.reset(id);
  }

  isAtMin(id: string): boolean {
    return this.get(id) <= this.def(id).min;
  }

  isAtMax(id: string): boolean {
    return this.get(id) >= this.def(id).max;
  }

  /** Anteil 0..1 zwischen Minimum und Maximum */
  ratio(id: string): number {
    const d = this.def(id);
    return d.max === d.min ? 0 : (this.get(id) - d.min) / (d.max - d.min);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.vals);
  }

  restore(data: Record<string, number>): void {
    for (const [id, v] of Object.entries(data)) if (this.has(id)) this.set(id, v);
  }
}
