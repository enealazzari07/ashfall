/**
 * Zeitaktionen: Looten, Anziehen, Essen, Verbinden, Bauen … dauern und laufen nacheinander ab.
 * Läuft der Spieler los oder wird er getroffen, bricht die Warteschlange ab.
 */
export interface GameAction {
  label: string;
  /** Dauer in Sekunden */
  duration: number;
  /** Wird beim Abschluss ausgeführt */
  run(): void;
  /** Bricht ab, wenn der Spieler sich bewegt (Standard: ja) */
  stay?: boolean;
}

export interface ActionStep {
  /** Diese Aktion wurde gerade abgeschlossen */
  done: GameAction | null;
  /** Die Warteschlange wurde abgebrochen */
  cancelled: boolean;
}

/** So weit darf sich der Spieler während einer Aktion bewegen (Meter) */
export const MOVE_LIMIT = 0.9;

export class ActionQueue {
  private list: GameAction[] = [];
  private t = 0;
  private origin: { x: number; z: number } | null = null;

  get current(): GameAction | null {
    return this.list[0] ?? null;
  }

  /** Fortschritt der laufenden Aktion 0..1 */
  get progress(): number {
    const c = this.current;
    return c ? Math.min(1, this.t / c.duration) : 0;
  }

  /** Wartende Aktionen (ohne die laufende) */
  get waiting(): number {
    return Math.max(0, this.list.length - 1);
  }

  get busy(): boolean {
    return this.list.length > 0;
  }

  add(a: GameAction): void {
    this.list.push(a);
  }

  clear(): void {
    this.list = [];
    this.t = 0;
    this.origin = null;
  }

  /** `pos`: aktuelle Spielerposition. Gibt zurück, was in diesem Schritt geschah. */
  update(dt: number, pos: { x: number; z: number }): ActionStep {
    const c = this.current;
    if (!c) return { done: null, cancelled: false };
    this.origin ??= { x: pos.x, z: pos.z };
    if (c.stay !== false && Math.hypot(pos.x - this.origin.x, pos.z - this.origin.z) > MOVE_LIMIT) {
      this.clear();
      return { done: null, cancelled: true };
    }
    this.t += dt;
    if (this.t < c.duration) return { done: null, cancelled: false };
    this.list.shift();
    this.t = 0;
    this.origin = null;
    c.run();
    return { done: c, cancelled: false };
  }
}

/** Übertragungszeit eines Stapels in Sekunden: wenig Grundzeit, schwere Dinge dauern länger */
export function transferTime(weightKg: number): number {
  return 0.3 + 0.18 * Math.min(weightKg, 5);
}

/** Anziehen: Kopf und Hand schnell, Körper und Rucksack langsamer */
export function equipTime(slot: string): number {
  return slot === 'hand' ? 0.8 : slot === 'head' || slot === 'feet' ? 1.4 : slot === 'back' ? 2 : 1.8;
}
