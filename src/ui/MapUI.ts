import './map.css';
import { BuildingKind, CHUNK, ChunkSpec, ROAD, SIDEWALK, generateChunk } from '../world/CityGenerator';
import { CELLS, Explored } from '../world/Explored';

const PX = 2; // Rasterpixel pro Meter

/** Palette einer alten Landkarte: Papier, Tinte, Rostrot für Straßen, blasse Flächen */
const PAL = {
  paper: '#e9dfc2',
  paperDark: '#cdbd96',
  land: '#d7d6a9',
  ink: '#3b2a1a',
  inkSoft: 'rgba(59,42,26,0.55)',
  roadFill: '#b9593c',
  roadEdge: '#6b3422',
  sidewalk: '#cfba92',
  lane: '#e9dfc2',
  highway: '#a3452b',
  rail: '#3b2a1a',
  tree: '#8da577',
  field: '#d9c987',
  fieldAlt: '#c9b873',
  furrow: 'rgba(120,98,40,0.45)',
  pad: '#bda98b',
  driveway: '#cdbd9c',
  player: '#b3261e',
  marker: '#3b2a1a',
};

const KIND_COLOR: Record<BuildingKind, string> = {
  house: '#bfa07a', apartment: '#a4624c', office: '#8f8776', hotel: '#9b7f8c', shop: '#c68b3c', industry: '#6f6a60', garage: '#8b8478', barn: '#8a5a3a',
};
const KIND_NAME: Record<BuildingKind, string> = {
  house: 'Wohnhaus', apartment: 'Mehrfamilienhaus', office: 'Büro', hotel: 'Hotel', shop: 'Geschäft', industry: 'Fabrik', garage: 'Garage', barn: 'Scheune',
};

export interface MapMarker { x: number; z: number; color: string; label?: string }

export interface MapHooks {
  /** Schon geladene Chunk-Daten, sonst wird neu erzeugt */
  specOf(cx: number, cz: number): ChunkSpec | undefined;
  markers(): MapMarker[];
}

interface Raster {
  canvas: HTMLCanvasElement;
  labels: { x: number; z: number; text: string }[];
}

/** Zeichnet einen Chunk von oben (nord-oben) im Stil einer alten Karte in ein Raster. */
function rasterize(spec: ChunkSpec, cx: number, cz: number): Raster {
  const c = document.createElement('canvas');
  c.width = c.height = CHUNK * PX;
  const g = c.getContext('2d')!;
  const ox = cx * CHUNK, oz = cz * CHUNK;
  g.scale(PX, PX);
  g.fillStyle = PAL.land;
  g.fillRect(0, 0, CHUNK, CHUNK);
  const labels: Raster['labels'] = [];

  for (const f of spec.fields) {
    const x0 = f.x - ox - f.w / 2, z0 = f.z - oz - f.d / 2;
    g.fillStyle = f.crop.startsWith('cornYoung') ? PAL.fieldAlt : PAL.field;
    g.fillRect(x0, z0, f.w, f.d);
    g.strokeStyle = PAL.furrow;
    g.lineWidth = 0.25;
    for (let x = x0 + 1.5; x < x0 + f.w; x += 1.8) {
      g.beginPath();
      g.moveTo(x, z0);
      g.lineTo(x, z0 + f.d);
      g.stroke();
    }
  }

  // Straßen: dunkler Rand, rostroter Belag, helle Mittellinie
  const road = (x: number, y: number, w: number, h: number, urban: boolean) => {
    const horizontal = w > h;
    if (urban) {
      g.fillStyle = PAL.sidewalk;
      g.fillRect(x - (horizontal ? 0 : SIDEWALK), y - (horizontal ? SIDEWALK : 0), w + (horizontal ? 0 : 2 * SIDEWALK), h + (horizontal ? 2 * SIDEWALK : 0));
      g.fillStyle = PAL.roadEdge;
      g.fillRect(x - (horizontal ? 0 : 0.5), y - (horizontal ? 0.5 : 0), w + (horizontal ? 0 : 1), h + (horizontal ? 1 : 0));
      g.fillStyle = PAL.roadFill;
      g.fillRect(x, y, w, h);
    } else {
      const t = (ROAD - 6) / 2;
      const rx = x + (horizontal ? 0 : t), ry = y + (horizontal ? t : 0), rw = horizontal ? w : 6, rh = horizontal ? 6 : h;
      g.fillStyle = PAL.roadEdge;
      g.fillRect(rx - (horizontal ? 0 : 0.6), ry - (horizontal ? 0.6 : 0), rw + (horizontal ? 0 : 1.2), rh + (horizontal ? 1.2 : 0));
      g.fillStyle = PAL.roadFill;
      g.fillRect(rx, ry, rw, rh);
    }
  };
  const line = (sl: ChunkSpec['paths'][number], width: number, color: string, dash: number[] = []) => {
    const { pts } = sl.path;
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'butt';
    g.lineJoin = 'round';
    g.setLineDash(dash);
    g.beginPath();
    for (let i = sl.i0; i <= sl.i1; i++) {
      if (i === sl.i0) g.moveTo(pts[i].x - ox, pts[i].z - oz);
      else g.lineTo(pts[i].x - ox, pts[i].z - oz);
    }
    g.stroke();
    g.setLineDash([]);
  };
  for (const sl of spec.paths) {
    const w = sl.path.width;
    switch (sl.path.kind) {
      case 'highway':
        line(sl, w + 2.4, PAL.roadEdge);
        line(sl, w, PAL.highway);
        line(sl, 0.7, PAL.lane, [3, 3]);
        break;
      case 'rail':
        line(sl, w * 0.8, PAL.sidewalk);
        line(sl, 0.9, PAL.rail, [2.2, 1.6]);
        break;
      case 'boulevard':
        line(sl, w + 3, PAL.sidewalk);
        line(sl, w + 1, PAL.roadEdge);
        line(sl, w, PAL.roadFill);
        break;
      default:
        line(sl, w + 1.2, PAL.roadEdge);
        line(sl, w, PAL.roadFill);
    }
  }
  if (spec.roadH) road(0, 0, CHUNK, ROAD, spec.urbanH);
  if (spec.roadV) road(0, 0, ROAD, CHUNK, spec.urbanV);
  for (const pd of spec.pads) {
    g.fillStyle = PAL.pad;
    g.fillRect(pd.x - ox - pd.w / 2, pd.z - oz - pd.d / 2, pd.w, pd.d);
  }
  if (spec.roadV && spec.roadH) {
    const urban = spec.urbanV && spec.urbanH;
    g.fillStyle = PAL.roadFill;
    g.fillRect(urban ? 0 : 1, urban ? 0 : 1, urban ? ROAD : 6, urban ? ROAD : 6);
  }

  for (const t of spec.trees) {
    g.fillStyle = PAL.tree;
    g.beginPath();
    g.arc(t.x - ox, t.z - oz, 1.4 * t.s, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(59,42,26,0.35)';
    g.lineWidth = 0.2;
    g.stroke();
  }

  for (const b of spec.buildings) {
    if (b.driveway) {
      g.fillStyle = PAL.driveway;
      g.fillRect(b.driveway.x - ox - b.driveway.w / 2, b.driveway.z - oz - b.driveway.d / 2, b.driveway.w, b.driveway.d);
    }
    const x = b.x - ox - b.w / 2, z = b.z - oz - b.d / 2;
    g.fillStyle = KIND_COLOR[b.kind];
    g.fillRect(x, z, b.w, b.d);
    // Schraffur wie bei alten Plänen
    g.save();
    g.beginPath();
    g.rect(x, z, b.w, b.d);
    g.clip();
    g.strokeStyle = 'rgba(59,42,26,0.35)';
    g.lineWidth = 0.18;
    for (let k = -b.d; k < b.w; k += 1.6) {
      g.beginPath();
      g.moveTo(x + k, z + b.d);
      g.lineTo(x + k + b.d, z);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = PAL.ink;
    g.lineWidth = 0.45;
    g.strokeRect(x, z, b.w, b.d);
    if (b.w * b.d > 150) labels.push({ x: b.x, z: b.z, text: KIND_NAME[b.kind] });
  }
  return { canvas: c, labels };
}

/** Kachelbares Papier mit Fasern und Flecken (einmal erzeugt) */
function makePaper(): HTMLCanvasElement {
  const n = 256;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = PAL.paper;
  g.fillRect(0, 0, n, n);
  let s = 1234567;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = `rgba(${150 + rnd() * 40},${120 + rnd() * 40},${70 + rnd() * 30},${0.02 + rnd() * 0.05})`;
    g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  g.strokeStyle = 'rgba(120,96,56,0.05)';
  for (let i = 0; i < 70; i++) {
    g.lineWidth = 0.5;
    g.beginPath();
    const x = rnd() * n, y = rnd() * n, a = rnd() * Math.PI;
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * (6 + rnd() * 18), y + Math.sin(a) * (6 + rnd() * 18));
    g.stroke();
  }
  return c;
}

/** Windrose in Tinte und Rostrot */
function compass(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.translate(x, y);
  g.strokeStyle = PAL.ink;
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(0, 0, r * 0.82, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const long = i % 2 === 0;
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const len = long ? r * 1.15 : r * 0.7;
    const w = long ? r * 0.16 : r * 0.1;
    g.fillStyle = i === 0 ? PAL.player : long ? PAL.ink : PAL.roadFill;
    g.beginPath();
    g.moveTo(Math.cos(a) * len, Math.sin(a) * len);
    g.lineTo(Math.cos(a + Math.PI / 2) * w, Math.sin(a + Math.PI / 2) * w);
    g.lineTo(0, 0);
    g.lineTo(Math.cos(a - Math.PI / 2) * w, Math.sin(a - Math.PI / 2) * w);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.fillStyle = PAL.ink;
  g.font = `700 ${Math.round(r * 0.5)}px Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('N', 0, -r * 1.5);
  g.restore();
}

/**
 * Minikarte (immer sichtbar, dreht sich mit der Kamera) und große Karte (M, Norden oben, ziehbar).
 * Beide zeigen nur, was der Spieler schon gesehen hat; der Rand zum Unbekannten verläuft weich ins Papier.
 */
export class MapUI {
  readonly explored = new Explored();
  private mini = document.createElement('canvas');
  private big = document.createElement('canvas');
  private overlay = document.createElement('div');
  private rasters = new Map<string, Raster>();
  /** fertige, mit der Maske verblendete Chunk-Bilder */
  private views = new Map<string, HTMLCanvasElement>();
  private pending = new Set<string>();
  private mask = document.createElement('canvas');
  private paper = makePaper();
  private frame = 0;
  private bigScale = 2;
  private miniScale = 1.4;
  /** Verschiebung der großen Karte durch Ziehen (Meter) */
  private pan = { x: 0, z: 0 };
  private dragging: { x: number; y: number } | null = null;
  private lastInfo = { px: 0, pz: 0, yaw: 0, facing: 0 };

  constructor(host: HTMLElement, private hooks: MapHooks) {
    this.mask.width = this.mask.height = CELLS + 2;
    this.mini.width = this.mini.height = 176;
    this.mini.id = 'minimap';
    this.mini.title = 'Karte (M)';
    host.append(this.mini);

    this.overlay.id = 'bigmap';
    this.overlay.className = 'panel';
    this.big.width = 900;
    this.big.height = 600;
    const legend = (Object.keys(KIND_COLOR) as BuildingKind[])
      .map((k) => `<span><i style="background:${KIND_COLOR[k]}"></i>${KIND_NAME[k]}</span>`)
      .join('');
    this.overlay.innerHTML = `<header><h3>Karte der Umgebung</h3><small>Ziehen = verschieben · Mausrad = Zoom · M oder Esc = schließen</small></header>`;
    this.overlay.append(this.big);
    const lg = document.createElement('div');
    lg.className = 'legend';
    lg.innerHTML = `${legend}<span><i class="dot" style="background:${PAL.player}"></i>Du</span><span><i class="dot" style="background:${PAL.marker}"></i>Fraktionen</span>`;
    this.overlay.append(lg);
    document.body.append(this.overlay);
    this.big.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.bigScale = Math.min(5, Math.max(0.5, this.bigScale * Math.exp(-e.deltaY * 0.0012)));
    });
    this.big.addEventListener('pointerdown', (e) => {
      this.dragging = { x: e.clientX, y: e.clientY };
      this.big.setPointerCapture(e.pointerId);
    });
    this.big.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const k = this.big.width / this.big.getBoundingClientRect().width;
      this.pan.x -= ((e.clientX - this.dragging.x) * k) / this.bigScale;
      this.pan.z -= ((e.clientY - this.dragging.y) * k) / this.bigScale;
      this.dragging = { x: e.clientX, y: e.clientY };
    });
    const stop = () => (this.dragging = null);
    this.big.addEventListener('pointerup', stop);
    this.big.addEventListener('pointercancel', stop);
    this.big.addEventListener('dblclick', () => (this.pan = { x: 0, z: 0 }));
    this.mini.addEventListener('click', () => this.toggle());
  }

  get isOpen(): boolean {
    return this.overlay.classList.contains('on');
  }

  toggle(force?: boolean): void {
    this.overlay.classList.toggle('on', force ?? !this.isOpen);
    if (this.isOpen) {
      this.pan = { x: 0, z: 0 };
      this.draw(this.big, this.bigScale, true);
    }
  }

  private raster(cx: number, cz: number): Raster {
    const key = Explored.key(cx, cz);
    let r = this.rasters.get(key);
    if (!r) {
      r = rasterize(this.hooks.specOf(cx, cz) ?? generateChunk(cx, cz), cx, cz);
      this.rasters.set(key, r);
    }
    return r;
  }

  /** Verblendet das Chunk-Bild mit seiner Erkundungsmaske (weicher Rand, Papier dahinter) */
  private buildView(key: string): void {
    const [cx, cz] = key.split(',').map(Number);
    const r = this.raster(cx, cz);
    let v = this.views.get(key);
    if (!v) {
      v = document.createElement('canvas');
      v.width = v.height = CHUNK * PX;
      this.views.set(key, v);
    }
    const mg = this.mask.getContext('2d')!;
    const n = CELLS + 2;
    const img = mg.createImageData(n, n);
    const m = this.explored.mask(cx, cz);
    for (let i = 0; i < m.length; i++) img.data[i * 4 + 3] = m[i];
    mg.putImageData(img, 0, 0);
    const g = v.getContext('2d')!;
    g.clearRect(0, 0, v.width, v.height);
    g.drawImage(r.canvas, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.imageSmoothingEnabled = true;
    g.filter = 'blur(2px)';
    const cell = (CHUNK * PX) / CELLS;
    g.drawImage(this.mask, -cell, -cell, (CELLS + 2) * cell, (CELLS + 2) * cell);
    g.filter = 'none';
    g.globalCompositeOperation = 'source-over';
  }

  /** px/pz: Spielerposition, yaw: Kamera, facing: Blickrichtung der Figur (Rad) */
  update(px: number, pz: number, yaw: number, facing: number): void {
    this.lastInfo = { px, pz, yaw, facing };
    this.frame++;
    this.explored.reveal(px, pz);
    for (const k of this.explored.takeDirty()) this.pending.add(k);
    let budget = 2;
    for (const k of this.pending) {
      if (budget-- <= 0) break;
      this.buildView(k);
      this.pending.delete(k);
    }
    if (this.frame % 3 === 0) this.draw(this.mini, this.miniScale, false);
    if (this.isOpen) this.draw(this.big, this.bigScale, true);
  }

  private draw(cv: HTMLCanvasElement, scale: number, big: boolean): void {
    const g = cv.getContext('2d')!;
    const { px: ppx, pz: ppz, facing } = this.lastInfo;
    // Große Karte: Norden oben und verschiebbar; Minikarte dreht sich mit der Kamera
    const yaw = big ? 0 : this.lastInfo.yaw;
    const cxw = big ? ppx + this.pan.x : ppx, czw = big ? ppz + this.pan.z : ppz;
    const w = cv.width, h = cv.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = g.createPattern(this.paper, 'repeat')!;
    g.fillRect(0, 0, w, h);
    g.save();
    if (!big) {
      g.beginPath();
      g.arc(w / 2, h / 2, w / 2 - 3, 0, Math.PI * 2);
      g.clip();
    }
    g.translate(w / 2, h / 2);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    g.transform(c * scale, s * scale, -s * scale, c * scale, 0, 0);
    g.translate(-cxw, -czw);
    const reach = Math.hypot(w, h) / 2 / scale;
    const r = Math.ceil(reach / CHUNK);
    const pcx = Math.floor(cxw / CHUNK), pcz = Math.floor(czw / CHUNK);
    g.imageSmoothingEnabled = true;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const v = this.views.get(Explored.key(pcx + dx, pcz + dz));
        if (v) g.drawImage(v, (pcx + dx) * CHUNK, (pcz + dz) * CHUNK, CHUNK, CHUNK);
      }
    }
    if (big && scale >= 1.6) {
      g.fillStyle = PAL.ink;
      g.font = '700 4.2px Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const ras = this.rasters.get(Explored.key(pcx + dx, pcz + dz));
          if (!ras) continue;
          for (const l of ras.labels) {
            if (this.explored.at(l.x, l.z) < 0.7) continue;
            g.lineWidth = 1.4;
            g.strokeStyle = 'rgba(233,223,194,0.85)';
            g.strokeText(l.text, l.x, l.z);
            g.fillText(l.text, l.x, l.z);
          }
        }
      }
    }
    for (const m of this.hooks.markers()) {
      if (this.explored.at(m.x, m.z) < 0.5) continue; // nur Eingetragenes zeigen
      g.fillStyle = PAL.marker;
      g.strokeStyle = PAL.paper;
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(m.x, m.z - 3);
      g.lineTo(m.x + 2.4, m.z);
      g.lineTo(m.x, m.z + 3);
      g.lineTo(m.x - 2.4, m.z);
      g.closePath();
      g.fill();
      g.stroke();
    }
    g.restore();

    // Spieler: roter Pfeil in Blickrichtung (auf der großen Karte dort, wo er steht)
    const fx = Math.sin(facing), fz = Math.cos(facing);
    const ang = Math.atan2(fx * s + fz * c, fx * c - fz * s);
    const sx = big ? w / 2 + (ppx - cxw) * scale : w / 2;
    const sy = big ? h / 2 + (ppz - czw) * scale : h / 2;
    g.save();
    g.translate(sx, sy);
    g.rotate(ang);
    g.fillStyle = PAL.player;
    g.strokeStyle = PAL.paper;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(10, 0);
    g.lineTo(-6, 6.5);
    g.lineTo(-3, 0);
    g.lineTo(-6, -6.5);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();

    if (big) {
      // Papier an den Rändern abdunkeln, Falzlinien, Windrose, Maßstab
      const vg = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
      vg.addColorStop(0, 'rgba(120,90,50,0)');
      vg.addColorStop(1, 'rgba(120,90,50,0.38)');
      g.fillStyle = vg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(90,66,36,0.13)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(w / 2, 0);
      g.lineTo(w / 2, h);
      g.moveTo(0, h / 2);
      g.lineTo(w, h / 2);
      g.stroke();
      compass(g, w - 70, 78, 30);
      const meters = scale >= 2 ? 50 : 100;
      const len = meters * scale;
      g.strokeStyle = PAL.ink;
      g.fillStyle = PAL.ink;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(24, h - 28);
      g.lineTo(24 + len, h - 28);
      g.moveTo(24, h - 33);
      g.lineTo(24, h - 23);
      g.moveTo(24 + len, h - 33);
      g.lineTo(24 + len, h - 23);
      g.stroke();
      g.font = '600 13px Georgia, serif';
      g.textAlign = 'left';
      g.fillText(`${meters} m`, 24, h - 40);
      return;
    }
    // Minikarte: Nordmarke am Rand (Norden = -z) und brauner Ring
    const na = Math.atan2(-c, s);
    const nr = w / 2 - 13;
    g.save();
    g.translate(w / 2 + Math.cos(na) * nr, h / 2 + Math.sin(na) * nr);
    g.fillStyle = PAL.paper;
    g.beginPath();
    g.arc(0, 0, 9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = PAL.ink;
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = PAL.player;
    g.font = '700 11px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', 0, 1);
    g.restore();
    const vg = g.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w / 2);
    vg.addColorStop(0, 'rgba(120,90,50,0)');
    vg.addColorStop(1, 'rgba(120,90,50,0.4)');
    g.fillStyle = vg;
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = PAL.ink;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    g.stroke();
  }
}
