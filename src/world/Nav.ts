import type { Box } from './CityGenerator';

/**
 * Wegfindung für Zombies auf dem Erdgeschoss: ein feines Raster pro Chunk (0,4 m), A* über mehrere Chunks.
 * Wände und Möbel sperren; Türen und überkletterbare Hindernisse (Fenster, Zäune) sind begehbar, kosten aber extra,
 * denn der Zombie muss sie erst einschlagen oder überklettern. So laufen Zombies durch Räume und Türen zum Ziel,
 * statt gegen die erste Wand zu rennen.
 */
export const CELL = 0.4;
const FREE = 0, SOLID = 1, DOOR = 2, CLIMB = 3;
/** Abstand, den ein Zombie zu Wänden braucht (Radius), minus etwas Spiel für schmale Durchgänge */
const PAD = 0.18;
const COST_DOOR = 10, COST_CLIMB = 6;
const MAX_REGION = 220; // Zellen je Seite (88 m)

export interface NavChunk {
  /** Kollisionsboxen des Chunks (alle Etagen; nur Erdgeschoss und etagenlose zählen) */
  colliders: Box[];
  /** Türsperren und Fensterkletterboxen: begehbar mit Aufpreis */
  soft: { box: Box; kind: 'door' | 'climb' }[];
}

export interface NavSource {
  chunkSize: number;
  /** Chunk mit Schlüssel `cx,cz`, falls geladen */
  chunk(cx: number, cz: number): NavChunk | undefined;
  /** Zählt hoch, wenn sich Hindernisse ändern (abgerissene Möbel …) */
  version(): number;
}

interface Grid {
  v: number;
  cells: Uint8Array;
}

export class NavGrid {
  private grids = new Map<string, Grid>();
  private readonly n: number;
  // Wiederverwendete Arbeitsfelder für A*
  private g = new Float32Array(MAX_REGION * MAX_REGION);
  private parent = new Int32Array(MAX_REGION * MAX_REGION);
  private state = new Uint8Array(MAX_REGION * MAX_REGION); // 0 unbekannt, 1 offen, 2 geschlossen
  private heap: number[] = [];
  private hf: number[] = [];

  constructor(private src: NavSource) {
    this.n = Math.round(src.chunkSize / CELL);
  }

  private grid(cx: number, cz: number): Grid | null {
    const ch = this.src.chunk(cx, cz);
    if (!ch) return null;
    const key = `${cx},${cz}`;
    const ver = this.src.version();
    let gr = this.grids.get(key);
    if (gr && gr.v === ver) return gr;
    const n = this.n;
    const cells = new Uint8Array(n * n);
    const x0 = cx * this.src.chunkSize, z0 = cz * this.src.chunkSize;
    // Eine Zelle gilt als gesperrt, wenn ihre Mitte im aufgeblähten Hindernis liegt (so bleiben schmale Türen begehbar)
    const mark = (b: Box, val: number, pad: number): void => {
      const lo = (v: number): number => Math.max(0, Math.ceil(v / CELL - 0.5));
      const hi = (v: number): number => Math.min(n - 1, Math.floor(v / CELL - 0.5));
      const ia = lo(b.x - b.w / 2 - pad - x0), ib = hi(b.x + b.w / 2 + pad - x0);
      const ja = lo(b.z - b.d / 2 - pad - z0), jb = hi(b.z + b.d / 2 + pad - z0);
      for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) if (val > cells[j * n + i] || cells[j * n + i] === FREE) cells[j * n + i] = val;
    };
    const softBoxes = new Set(ch.soft.map((q) => q.box));
    for (const b of ch.colliders) {
      if (b.lv !== undefined && b.lv !== 0) continue;
      if (b.climb) continue; // wird unten als überkletterbar eingetragen
      if (b.off || softBoxes.has(b)) continue; // Türsperren sind weiche Hindernisse (unten)
      mark(b, SOLID, PAD);
    }
    for (const s of ch.soft) {
      // weiche Hindernisse überschreiben die Sperre (die Tür steckt in der Wandlücke)
      const b = s.box;
      const ia = Math.max(0, Math.floor((b.x - b.w / 2 - x0) / CELL)), ib = Math.min(n - 1, Math.floor((b.x + b.w / 2 - x0) / CELL));
      const ja = Math.max(0, Math.floor((b.z - b.d / 2 - z0) / CELL)), jb = Math.min(n - 1, Math.floor((b.z + b.d / 2 - z0) / CELL));
      for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) cells[j * n + i] = s.kind === 'door' ? DOOR : CLIMB;
    }
    for (const b of ch.colliders) {
      if (b.climb && !b.off && (b.lv === undefined || b.lv === 0)) {
        const ia = Math.max(0, Math.floor((b.x - b.w / 2 - x0) / CELL)), ib = Math.min(n - 1, Math.floor((b.x + b.w / 2 - x0) / CELL));
        const ja = Math.max(0, Math.floor((b.z - b.d / 2 - z0) / CELL)), jb = Math.min(n - 1, Math.floor((b.z + b.d / 2 - z0) / CELL));
        for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) if (cells[j * n + i] === FREE) cells[j * n + i] = CLIMB;
      }
    }
    gr = { v: ver, cells };
    this.grids.set(key, gr);
    return gr;
  }

  /** Zelltyp an Zellkoordinaten; SOLID für nicht geladene Bereiche */
  private at(gx: number, gz: number): number {
    const n = this.n;
    const cx = Math.floor(gx / n), cz = Math.floor(gz / n);
    const gr = this.grid(cx, cz);
    if (!gr) return SOLID;
    return gr.cells[(gz - cz * n) * n + (gx - cx * n)];
  }

  /** Verwirft Raster entladener Chunks */
  forget(cx: number, cz: number): void {
    this.grids.delete(`${cx},${cz}`);
  }

  /** Nächste freie Zelle um (gx, gz) im Umkreis `r` Zellen (der Zombie kann in einer Sperrzone stehen) */
  private nearestFree(gx: number, gz: number, r = 4): [number, number] | null {
    if (this.at(gx, gz) !== SOLID) return [gx, gz];
    for (let d = 1; d <= r; d++) {
      for (let dz = -d; dz <= d; dz++) {
        for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
          if (this.at(gx + dx, gz + dz) !== SOLID) return [gx + dx, gz + dz];
        }
      }
    }
    return null;
  }

  /** Alle Zellen auf der Linie frei (nur Typ FREE)? Für das Glätten des Pfads. */
  private clearLine(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax, dz = bz - az;
    const steps = Math.max(Math.abs(dx), Math.abs(dz)) * 2;
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const x = Math.round(ax + dx * t), z = Math.round(az + dz * t);
      if (this.at(x, z) !== FREE) return false;
      // Ecken nicht schneiden: auch die Nachbarzellen quer zur Richtung müssen frei sein
      if (Math.abs(dx) > Math.abs(dz) ? this.at(x, z + 1) === SOLID || this.at(x, z - 1) === SOLID : this.at(x + 1, z) === SOLID || this.at(x - 1, z) === SOLID) return false;
    }
    return true;
  }

  /** Freie Linie (nur freie Zellen: keine Wand, kein Möbel, keine Tür) zwischen zwei Weltpunkten? */
  clearWorld(ax: number, az: number, bx: number, bz: number): boolean {
    return this.clearLine(Math.round(ax / CELL - 0.5), Math.round(az / CELL - 0.5), Math.round(bx / CELL - 0.5), Math.round(bz / CELL - 0.5));
  }

  /**
   * Weg von (sx, sz) nach (tx, tz) in Weltkoordinaten als Folge von Wegpunkten (ohne Startpunkt), oder null,
   * wenn keiner gefunden wurde (zu weit, eingeschlossen).
   */
  findPath(sx: number, sz: number, tx: number, tz: number): { x: number; z: number }[] | null {
    let sgx = Math.floor(sx / CELL), sgz = Math.floor(sz / CELL);
    let tgx = Math.floor(tx / CELL), tgz = Math.floor(tz / CELL);
    const s0 = this.nearestFree(sgx, sgz), t0 = this.nearestFree(tgx, tgz, 6);
    if (!s0 || !t0) return null;
    [sgx, sgz] = s0;
    [tgx, tgz] = t0;
    // Suchfenster um Start und Ziel
    const spanX = Math.abs(sgx - tgx), spanZ = Math.abs(sgz - tgz);
    const margin = Math.min(50, Math.floor((MAX_REGION - 2 - Math.max(spanX, spanZ)) / 2));
    if (margin < 12) return null;
    const minX = Math.min(sgx, tgx) - margin, minZ = Math.min(sgz, tgz) - margin;
    const W = Math.max(sgx, tgx) + margin - minX + 1, H = Math.max(sgz, tgz) + margin - minZ + 1;
    if (W > MAX_REGION || H > MAX_REGION) return null;
    const N = W * H;
    this.state.fill(0, 0, N);
    const heap = this.heap;
    heap.length = 0;
    const idx = (x: number, z: number): number => (z - minZ) * W + (x - minX);
    const hcost = (x: number, z: number): number => {
      const dx = Math.abs(x - tgx), dz = Math.abs(z - tgz);
      return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz);
    };
    // Binärer Heap aus (Kosten, Zelle)-Paaren; veraltete Einträge werden beim Entnehmen übersprungen
    const hf = this.hf, hi = heap;
    hf.length = 0;
    const push = (i: number, fv: number): void => {
      let c = hi.length;
      hi.push(i);
      hf.push(fv);
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (hf[p] <= hf[c]) break;
        [hf[p], hf[c]] = [hf[c], hf[p]];
        [hi[p], hi[c]] = [hi[c], hi[p]];
        c = p;
      }
    };
    const pop = (): number => {
      const top = hi[0];
      const lastI = hi.pop()!, lastF = hf.pop()!;
      if (hi.length) {
        hi[0] = lastI;
        hf[0] = lastF;
        let c = 0;
        for (;;) {
          const l = c * 2 + 1, r = l + 1;
          let m = c;
          if (l < hi.length && hf[l] < hf[m]) m = l;
          if (r < hi.length && hf[r] < hf[m]) m = r;
          if (m === c) break;
          [hf[m], hf[c]] = [hf[c], hf[m]];
          [hi[m], hi[c]] = [hi[c], hi[m]];
          c = m;
        }
      }
      return top;
    };
    const si = idx(sgx, sgz), ti = idx(tgx, tgz);
    this.g[si] = 0;
    this.parent[si] = -1;
    this.state[si] = 1;
    push(si, hcost(sgx, sgz));
    let found = false;
    let expanded = 0;
    const DIRS: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
    while (heap.length && expanded < 6000) {
      const cur = pop();
      if (this.state[cur] === 2) continue;
      this.state[cur] = 2;
      expanded++;
      if (cur === ti) {
        found = true;
        break;
      }
      const cx = (cur % W) + minX, cz = Math.floor(cur / W) + minZ;
      for (const [dx, dz, cost] of DIRS) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < minX || nz < minZ || nx >= minX + W || nz >= minZ + H) continue;
        const t = this.at(nx, nz);
        if (t === SOLID) continue;
        if (dx !== 0 && dz !== 0 && (this.at(cx + dx, cz) === SOLID || this.at(cx, cz + dz) === SOLID)) continue;
        const ni = idx(nx, nz);
        if (this.state[ni] === 2) continue;
        const ng = this.g[cur] + cost + (t === DOOR ? COST_DOOR : t === CLIMB ? COST_CLIMB : 0);
        if (this.state[ni] === 1 && ng >= this.g[ni]) continue;
        this.g[ni] = ng;
        this.parent[ni] = cur;
        this.state[ni] = 1;
        push(ni, ng + hcost(nx, nz));
      }
    }
    if (!found) return null;
    // Pfad rückwärts einsammeln
    const cellsPath: [number, number][] = [];
    for (let i = ti; i !== -1; i = this.parent[i]) cellsPath.push([(i % W) + minX, Math.floor(i / W) + minZ]);
    cellsPath.reverse();
    // Glätten: Wegpunkte überspringen, solange die Linie frei ist; Türen/Hindernisse bleiben Wegpunkte
    const out: [number, number][] = [];
    let a = 0;
    while (a < cellsPath.length - 1) {
      let b = cellsPath.length - 1;
      while (b > a + 1) {
        if (this.clearLine(cellsPath[a][0], cellsPath[a][1], cellsPath[b][0], cellsPath[b][1])) break;
        b--;
      }
      out.push(cellsPath[b]);
      a = b;
    }
    return out.map(([x, z]) => ({ x: (x + 0.5) * CELL, z: (z + 0.5) * CELL }));
  }

}
