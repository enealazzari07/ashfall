export type TimeEvent = 'minute' | 'hour' | 'day';

/** Pro `advance`-Aufruf werden höchstens so viele Ereignisse einer Art nachgeholt (z. B. bei sehr schneller Zeit). */
const MAX_CATCH_UP: Record<TimeEvent, number> = { minute: 1440, hour: 48, day: 3 };

/** Spielzeit: 1 reale Sekunde = timeScale Spielsekunden. */
export class GameTime {
  seconds = 8 * 3600;
  timeScale = 60;
  /** Tageszähler, beginnt bei Tag 1 */
  day = 1;
  private listeners: Record<TimeEvent, Array<() => void>> = { minute: [], hour: [], day: [] };

  /** Meldet sich für Minuten-, Stunden- oder Tageswechsel an. Gibt eine Abmelde-Funktion zurück. */
  on(kind: TimeEvent, fn: () => void): () => void {
    this.listeners[kind].push(fn);
    return () => {
      const l = this.listeners[kind];
      const i = l.indexOf(fn);
      if (i >= 0) l.splice(i, 1);
    };
  }

  /** Spielsekunden seit Beginn von Tag 1 */
  get absolute(): number {
    return (this.day - 1) * 86400 + this.seconds;
  }

  advance(dt: number): void {
    const before = this.absolute;
    this.seconds += dt * this.timeScale;
    while (this.seconds >= 86400) {
      this.seconds -= 86400;
      this.day++;
    }
    const after = this.absolute;
    this.fire('minute', Math.floor(after / 60) - Math.floor(before / 60));
    this.fire('hour', Math.floor(after / 3600) - Math.floor(before / 3600));
    this.fire('day', Math.floor(after / 86400) - Math.floor(before / 86400));
  }

  private fire(kind: TimeEvent, n: number): void {
    const count = Math.min(n, MAX_CATCH_UP[kind]);
    for (let i = 0; i < count; i++) for (const fn of [...this.listeners[kind]]) fn();
  }

  /** 0..1 über den Tag, 0.5 = Mittag */
  get dayFraction(): number {
    return this.seconds / 86400;
  }
}
