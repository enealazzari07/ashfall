import { CHUNK } from './CityGenerator';

/** Rastergröße der Erkundungskarte in Metern und Zellen pro Chunk-Seite */
export const CELL = 2;
export const CELLS = CHUNK / CELL;
/** Zellen rund um den Spieler, die ganz aufgedeckt werden, und Ende des weichen Rands (Meter) */
const INNER = 22;
const OUTER = 42;
/** Neu aufdecken erst nach dieser Strecke (Meter) */
const STEP = 1.5;

/**
 * Was der Spieler schon gesehen hat. Jeder Chunk hat ein Raster aus Zellen (0 = unbekannt, 255 = ganz bekannt);
 * der Rand der aufgedeckten Fläche fällt weich ab. Die Karte zeigt nur, was hier steht.
 */
export class Explored {
  private chunks = new Map<string, Uint8Array>();
  private dirtyKeys = new Set<string>();
  private last: [number, number] | null = null;

  /** Spielstand: Chunk-Raster als Base64 */
  toJSON(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of this.chunks) {
      let bin = '';
      for (let i = 0; i < v.length; i++) bin += String.fromCharCode(v[i]);
      out[k] = btoa(bin);
    }
    return out;
  }

  fromJSON(j: Record<string, string> | undefined): void {
    this.chunks.clear();
    this.last = null;
    for (const [k, b64] of Object.entries(j ?? {})) {
      const bin = atob(b64);
      const a = new Uint8Array(CELLS * CELLS);
      for (let i = 0; i < a.length && i < bin.length; i++) a[i] = bin.charCodeAt(i);
      this.chunks.set(k, a);
      this.dirtyKeys.add(k);
    }
  }

  static key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  /** Deckt die Umgebung um (x, z) auf. Gibt true zurück, wenn sich etwas geändert hat. */
  reveal(x: number, z: number, inner = INNER, outer = OUTER): boolean {
    if (this.last && Math.hypot(x - this.last[0], z - this.last[1]) < STEP) return false;
    this.last = [x, z];
    let changed = false;
    const c0x = Math.floor((x - outer) / CHUNK), c1x = Math.floor((x + outer) / CHUNK);
    const c0z = Math.floor((z - outer) / CHUNK), c1z = Math.floor((z + outer) / CHUNK);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const key = Explored.key(cx, cz);
        let cells = this.chunks.get(key);
        let touched = false;
        for (let iz = 0; iz < CELLS; iz++) {
          const wz = cz * CHUNK + (iz + 0.5) * CELL;
          if (Math.abs(wz - z) > outer) continue;
          for (let ix = 0; ix < CELLS; ix++) {
            const wx = cx * CHUNK + (ix + 0.5) * CELL;
            const d = Math.hypot(wx - x, wz - z);
            if (d >= outer) continue;
            const v = d <= inner ? 255 : Math.round(255 * (1 - (d - inner) / (outer - inner)) ** 1.4);
            if (v <= 0) continue;
            cells ??= new Uint8Array(CELLS * CELLS);
            const i = iz * CELLS + ix;
            if (v > cells[i]) {
              cells[i] = v;
              touched = true;
            }
          }
        }
        if (cells && !this.chunks.has(key)) this.chunks.set(key, cells);
        if (touched) {
          this.dirtyKeys.add(key);
          // Die Nachbarn zeichnen ihren Rand mit: sie müssen mit neu gerechnet werden
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nk = Explored.key(cx + dx, cz + dz);
            if (this.chunks.has(nk)) this.dirtyKeys.add(nk);
          }
          changed = true;
        }
      }
    }
    return changed;
  }

  has(cx: number, cz: number): boolean {
    return this.chunks.has(Explored.key(cx, cz));
  }

  /** Wert 0..255 an einer Zelle; außerhalb bekannter Chunks 0 (Indizes dürfen über den Chunk hinausgehen) */
  value(cx: number, cz: number, ix: number, iz: number): number {
    if (ix < 0) return this.value(cx - 1, cz, ix + CELLS, iz);
    if (ix >= CELLS) return this.value(cx + 1, cz, ix - CELLS, iz);
    if (iz < 0) return this.value(cx, cz - 1, ix, iz + CELLS);
    if (iz >= CELLS) return this.value(cx, cz + 1, ix, iz - CELLS);
    return this.chunks.get(Explored.key(cx, cz))?.[iz * CELLS + ix] ?? 0;
  }

  /** Bekanntheit an einem Weltpunkt, 0..1 */
  at(x: number, z: number): number {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const ix = Math.floor((x - cx * CHUNK) / CELL), iz = Math.floor((z - cz * CHUNK) / CELL);
    return this.value(cx, cz, ix, iz) / 255;
  }

  /** Maske eines Chunks samt einem Zellenrand der Nachbarn: (CELLS+2)² Werte, Zeile für Zeile */
  mask(cx: number, cz: number): Uint8ClampedArray {
    const n = CELLS + 2;
    const out = new Uint8ClampedArray(n * n);
    for (let iz = -1; iz <= CELLS; iz++) {
      for (let ix = -1; ix <= CELLS; ix++) out[(iz + 1) * n + ix + 1] = this.value(cx, cz, ix, iz);
    }
    return out;
  }

  /** Chunks, deren Maske sich seit dem letzten Aufruf geändert hat */
  takeDirty(): string[] {
    const keys = [...this.dirtyKeys];
    this.dirtyKeys.clear();
    return keys;
  }

  /** Alle Chunks, in denen etwas aufgedeckt ist */
  keys(): string[] {
    return [...this.chunks.keys()];
  }

  /** Anteil bekannter Zellen (0..255 gewichtet) in Zellen, zum Anzeigen/Testen */
  get cellsKnown(): number {
    let n = 0;
    for (const c of this.chunks.values()) for (const v of c) if (v > 0) n++;
    return n;
  }

  clear(): void {
    this.chunks.clear();
    this.dirtyKeys.clear();
    this.last = null;
  }

  /** Für späteres Speichern */
  save(): Record<string, number[]> {
    return Object.fromEntries([...this.chunks].map(([k, v]) => [k, [...v]]));
  }

  load(data: Record<string, number[]>): void {
    this.clear();
    for (const [k, v] of Object.entries(data)) {
      if (v.length !== CELLS * CELLS) continue;
      this.chunks.set(k, Uint8Array.from(v));
      this.dirtyKeys.add(k);
    }
  }
}
