/**
 * Detaillierte Waffen-Icons: jede Waffe hat ein eigenes Motiv mit Klingenschliff, Hohlkehle, Wicklung, Holzmaserung,
 * Schlitten, Trommel, Schaft, Magazin, Zielfernrohr usw. Ersetzt für Waffen die einfachen Motive aus pzIcons.ts
 * (siehe `pzIconURL` in index.ts).
 */
import { INK, shade, lin, shape, rr, ell, poly, floor, gloss, rot } from './pzIcons';

type G = CanvasRenderingContext2D;

/* --------------------------------------------------------------- Bausteine */

const STEEL = '#c9ced5';
const WOOD = '#9a6a3a';
const GRIP = '#25232a';

/** Klinge in Hilfskoordinaten: Heft bei y = 0, Spitze bei y = −len. `cur` krümmt die Spitze seitlich. */
function blade(g: G, len: number, w: number, o: { cur?: number; steel?: string; fuller?: boolean; single?: boolean; tip?: number; clip?: boolean } = {}): void {
  const c = o.cur ?? 0;
  const t = o.tip ?? w * 2.2;
  const st = o.steel ?? STEEL;
  const path = (): void => {
    g.moveTo(-w, 0);
    g.quadraticCurveTo(-w + c * 0.55, -len * 0.5, c - w * 0.7, -len);
    g.lineTo(c + (o.clip ? w * 0.2 : 0), -len - t);
    g.lineTo(c + w * 0.9, -len);
    g.quadraticCurveTo(w + c * 0.55, -len * 0.5, w, 0);
    g.closePath();
  };
  shape(g, path, lin(g, -w, 0, w, 0, shade(st, 0.35), shade(st, -0.45)), 4);
  // Schneidenfase: heller Streifen an der Schneide, dunkler Rücken
  g.save();
  g.beginPath();
  path();
  g.clip();
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath();
  g.moveTo(-w, 0); g.quadraticCurveTo(-w + c * 0.55, -len * 0.5, c - w * 0.7, -len); g.lineTo(c - w * 0.7 + w * 0.55, -len); g.quadraticCurveTo(-w * 0.45 + c * 0.55, -len * 0.5, -w * 0.45, 0);
  g.fill();
  if (o.single) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.moveTo(w * 0.35, 0); g.quadraticCurveTo(w * 0.35 + c * 0.55, -len * 0.5, c + w * 0.3, -len); g.lineTo(c + w, -len); g.quadraticCurveTo(w + c * 0.55, -len * 0.5, w, 0); g.fill(); }
  if (o.fuller) { g.strokeStyle = 'rgba(40,44,52,0.55)'; g.lineWidth = Math.max(1.6, w * 0.22); g.beginPath(); g.moveTo(w * 0.05, -4); g.quadraticCurveTo(w * 0.05 + c * 0.55, -len * 0.5, c, -len * 0.82); g.stroke(); }
  g.restore();
}

function handle(g: G, len: number, w: number, color: string, o: { wrap?: boolean; pommel?: string; y?: number } = {}): void {
  const y0 = o.y ?? 0;
  shape(g, rr(g, -w, y0, w * 2, len, w * 0.5), lin(g, -w, 0, w, 0, shade(color, 0.3), shade(color, -0.45)), 4);
  if (o.wrap) {
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2.4;
    for (let y = y0 + 3; y < y0 + len - 2; y += 6) { g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y + 3); g.stroke(); }
  }
  if (o.pommel) shape(g, ell(g, 0, y0 + len + 2, w * 1.25, w * 1.1), lin(g, -w, 0, w, 0, shade(o.pommel, 0.4), shade(o.pommel, -0.4)), 3.5);
}

function guard(g: G, w: number, color: string, kind: 'cross' | 'disc' | 'bar' = 'cross'): void {
  const f = lin(g, 0, -4, 0, 5, shade(color, 0.45), shade(color, -0.4));
  if (kind === 'disc') shape(g, ell(g, 0, 0, w, w * 0.34), f, 3.5);
  else if (kind === 'bar') shape(g, rr(g, -w, -3, w * 2, 6, 2), f, 3.5);
  else shape(g, () => { g.moveTo(-w, 2); g.quadraticCurveTo(-w * 0.9, -5, -w * 0.35, -3); g.lineTo(w * 0.35, -3); g.quadraticCurveTo(w * 0.9, -5, w, 2); g.quadraticCurveTo(w * 0.5, 5, 0, 4); g.quadraticCurveTo(-w * 0.5, 5, -w, 2); }, f, 3.5);
}

function woodGrain(g: G, x: number, y: number, w: number, h: number, vertical = true): void {
  g.save();
  g.strokeStyle = 'rgba(60,34,14,0.38)'; g.lineWidth = 1.4; g.lineCap = 'round';
  const n = 3;
  for (let i = 0; i < n; i++) {
    g.beginPath();
    if (vertical) { const gx = x + (w * (i + 1)) / (n + 1); g.moveTo(gx, y + 2); g.quadraticCurveTo(gx + 2, y + h / 2, gx - 1, y + h - 2); }
    else { const gy = y + (h * (i + 1)) / (n + 1); g.moveTo(x + 2, gy); g.quadraticCurveTo(x + w / 2, gy + 2, x + w - 2, gy - 1); }
    g.stroke();
  }
  g.restore();
}

/** Holzstiel mit Maserung, von (0,y0) bis (0,y1) */
function shaft(g: G, y0: number, y1: number, w: number, color = WOOD): void {
  shape(g, rr(g, -w, y0, w * 2, y1 - y0, w * 0.6), lin(g, -w, 0, w, 0, shade(color, 0.4), shade(color, -0.45)), 4);
  woodGrain(g, -w, y0, w * 2, y1 - y0);
}

function bind(g: G, y: number, w: number, color = '#c8b27a'): void {
  g.strokeStyle = INK; g.lineWidth = 1; g.fillStyle = color;
  for (let i = 0; i < 3; i++) { g.beginPath(); g.rect(-w - 1, y + i * 3.6, w * 2 + 2, 2.6); g.fill(); g.stroke(); }
}

/* ---------------------------------------------------------- Klingenwaffen */

interface BladeSpec { len: number; w: number; cur?: number; steel?: string; fuller?: boolean; single?: boolean; clip?: boolean; hl: number; hw: number; hc: string; wrap?: boolean; g?: [number, string, 'cross' | 'disc' | 'bar']; pommel?: string; tip?: number }
const BLADES: Record<string, BladeSpec> = {
  katana: { len: 70, w: 5, cur: 6, single: true, fuller: true, hl: 28, hw: 4.2, hc: '#1c1a22', wrap: true, g: [8, '#c8a02a', 'disc'], pommel: '#c8a02a', tip: 8 },
  sword: { len: 62, w: 7.5, fuller: true, hl: 20, hw: 4, hc: '#4a2e1a', wrap: true, g: [17, '#c8a02a', 'cross'], pommel: '#c8a02a' },
  shortsword: { len: 40, w: 6.5, fuller: true, hl: 17, hw: 4, hc: '#4a2e1a', wrap: true, g: [13, '#b8923a', 'cross'], pommel: '#b8923a' },
  crude: { len: 58, w: 7, steel: '#8f949b', hl: 20, hw: 4.2, hc: '#5a3a22', wrap: true, g: [12, '#6a6e76', 'bar'], pommel: '#6a6e76' },
  crude_short: { len: 38, w: 6.5, steel: '#8f949b', hl: 17, hw: 4.2, hc: '#5a3a22', wrap: true, g: [11, '#6a6e76', 'bar'], pommel: '#6a6e76' },
  dagger: { len: 34, w: 5.5, fuller: true, hl: 16, hw: 3.6, hc: '#2a1e16', wrap: true, g: [14, '#c8a02a', 'cross'], pommel: '#c8a02a' },
  fighting: { len: 38, w: 5.5, single: true, clip: true, steel: '#6a6f77', hl: 20, hw: 4.2, hc: GRIP, wrap: true, g: [9, '#4a4e56', 'bar'], pommel: '#4a4e56' },
  hunting: { len: 36, w: 6, single: true, cur: 3, hl: 22, hw: 4.4, hc: '#6a4426', wrap: false, g: [9, '#b8923a', 'bar'], pommel: '#b8923a' },
  spike: { len: 38, w: 3.6, steel: '#6b6f76', hl: 18, hw: 3.6, hc: '#3a2e22', wrap: true, g: [7, '#4a4e56', 'bar'] },
  pocket: { len: 22, w: 4.5, single: true, hl: 20, hw: 4.4, hc: '#a02820', g: [5, '#aeb3bb', 'bar'] },
  small: { len: 24, w: 4.6, single: true, hl: 18, hw: 4, hc: '#3a2e22', g: [6, '#8a8e96', 'bar'] },
  large: { len: 44, w: 6.5, single: true, hl: 24, hw: 4.6, hc: '#25232a', wrap: true, g: [8, '#6a6e76', 'bar'] },
  machete: { len: 54, w: 8, cur: 3, single: true, hl: 24, hw: 4.6, hc: '#2a2420', wrap: true, g: [8, '#4a4e56', 'bar'], pommel: '#4a4e56' },
  butterfly: { len: 30, w: 4.5, single: true, hl: 32, hw: 4.2, hc: '#aeb3bb', g: [4, '#8a8e96', 'bar'] },
  switch: { len: 30, w: 4.6, single: true, clip: true, hl: 30, hw: 4.6, hc: '#2a2a30', g: [5, '#c9ced5', 'bar'] },
};

function bladeIcon(g: G, v: string, angle = -0.78): void {
  const s = BLADES[v];
  floor(g, 114, 40);
  rot(g, angle, () => {
    const tip = s.tip ?? s.w * 2.2;
    const k = Math.min(1.35, 84 / (s.len + tip + s.hl));
    g.scale(k, k);
    g.translate(0, -(s.hl + 2 - s.len - tip) / 2);
    blade(g, s.len, s.w, { cur: s.cur, steel: s.steel, fuller: s.fuller, single: s.single, clip: s.clip, tip: s.tip });
    handle(g, s.hl, s.hw, s.hc, { wrap: s.wrap, pommel: s.pommel, y: 2 });
    if (s.g) guard(g, s.g[0], s.g[1], s.g[2]);
    if (v === 'butterfly') { shape(g, rr(g, -s.hw - 5, 4, 5, s.hl - 2, 2), lin(g, 0, 0, 0, 40, '#c9ced5', '#7a7e86'), 3); }
    if (v === 'pocket') { g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.arc(0, 12, 2.2, 0, 7); g.fill(); }
  });
}

/* ---------------------------------------------------------- Äxte und Hacken */

function axeIcon(g: G, v: string): void {
  floor(g, 114, 40);
  rot(g, 0.72, () => {
    const long = v === 'wood_axe' || v === 'pickaxe' ? 1 : v === 'scythe' ? 1.1 : 0.62;
    const top = -44 * long - 4;
    shaft(g, top, 56, v === 'scythe' ? 2.6 : 3.8);
    handle(g, 24, 4.1, '#2a1e16', { wrap: true, y: 34 });
    if (v === 'hatchet' || v === 'hand_axe' || v === 'wood_axe') {
      const big = v === 'wood_axe' ? 1.35 : 1;
      const y = top + 6;
      shape(g, poly(g, [[-6, y - 4], [6, y - 4], [8, y + 16], [-8, y + 16]]), lin(g, -8, 0, 8, 0, '#6a6e76', '#34373e'), 3.5);
      shape(g, () => { g.moveTo(6, y - 2); g.quadraticCurveTo(26 * big, y - 18 * big, 30 * big, y - 10 * big); g.quadraticCurveTo(34 * big, y + 8 * big, 30 * big, y + 24 * big); g.quadraticCurveTo(24 * big, y + 16, 6, y + 14); g.closePath(); }, lin(g, 6, y, 30 * big, y, shade(STEEL, 0.1), shade(STEEL, -0.4)), 4);
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(29 * big, y - 8 * big); g.quadraticCurveTo(32 * big, y + 8 * big, 29 * big, y + 22 * big); g.stroke();
      shape(g, rr(g, -10, y - 2, 8, 14, 2), lin(g, -10, 0, -2, 0, '#8a8e96', '#42454c'), 3.5);
    } else if (v === 'pickaxe') {
      const y = top + 8;
      shape(g, () => { g.moveTo(-44, y + 14); g.quadraticCurveTo(-30, y - 12, 0, y - 10); g.quadraticCurveTo(30, y - 12, 44, y + 14); g.quadraticCurveTo(28, y - 2, 0, y + 2); g.quadraticCurveTo(-28, y - 2, -44, y + 14); }, lin(g, 0, y - 12, 0, y + 14, shade(STEEL, 0.1), shade(STEEL, -0.45)), 4);
      shape(g, rr(g, -7, y - 8, 14, 16, 3), '#5a5e66', 3.5);
    } else if (v === 'ice_axe') {
      const y = top + 4;
      shape(g, () => { g.moveTo(-8, y + 10); g.quadraticCurveTo(-4, y - 2, 4, y - 6); g.lineTo(26, y + 2); g.lineTo(26, y + 8); g.quadraticCurveTo(10, y + 8, 6, y + 14); g.closePath(); }, lin(g, 0, y - 6, 0, y + 14, shade(STEEL, 0.1), shade(STEEL, -0.45)), 3.5);
      shape(g, poly(g, [[-8, y + 10], [-26, y + 4], [-26, y + 16]]), '#9aa0a8', 3);
    } else {
      const y = top;
      shape(g, () => { g.moveTo(2, y + 8); g.quadraticCurveTo(42, y - 22, 70, y + 18); g.quadraticCurveTo(46, y - 6, 2, y + 22); g.closePath(); }, lin(g, 0, y - 10, 0, y + 22, shade(STEEL, 0.2), shade(STEEL, -0.45)), 4);
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(8, y + 6); g.quadraticCurveTo(42, y - 16, 66, y + 16); g.stroke();
    }
    bind(g, top + 22, 4);
  });
}

/* ------------------------------------------------------- Keulen und Hämmer */

function nail(g: G, x: number, y: number, dx: number): void {
  g.fillStyle = '#d0d3d8'; g.strokeStyle = INK; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x + dx, y); g.lineTo(x, y + 3); g.closePath(); g.fill(); g.stroke();
}

function clubIcon(g: G, v: string): void {
  floor(g, 114, 40);
  rot(g, -0.72, () => {
    const short = v.includes('short_bat');
    const L = short ? 70 : 108;
    const top = -L * 0.55;
    if (v === 'nightstick') {
      shape(g, rr(g, -5, top + 10, 10, 88, 5), lin(g, -5, 0, 5, 0, '#4a4c54', '#101014'), 4);
      shape(g, rr(g, -5.5, 30, 11, 32, 4), lin(g, -5, 0, 5, 0, '#2a2a2e', '#0a0a0c'), 3.5);
      shape(g, rr(g, 3, 20, 20, 7, 3), lin(g, 0, 20, 0, 27, '#4a4c54', '#101014'), 3.5);
      gloss(g, -3, top + 14, 2.5, 66, 0.35);
      return;
    }
    if (v === 'fire_poker') {
      g.strokeStyle = INK; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 50); g.lineTo(0, top); g.stroke();
      g.strokeStyle = '#4a4d55'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, 50); g.lineTo(0, top); g.stroke();
      g.strokeStyle = INK; g.lineWidth = 8; g.beginPath(); g.moveTo(0, top); g.quadraticCurveTo(14, top - 4, 12, top + 16); g.stroke();
      g.strokeStyle = '#4a4d55'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, top); g.quadraticCurveTo(14, top - 4, 12, top + 16); g.stroke();
      shape(g, ell(g, 0, 56, 7, 7), '#2a2c32', 3.5);
      return;
    }
    if (v === 'mace' || v === 'mace_stone' || v === 'long_mace') {
      const len = v === 'long_mace' ? 120 : 96;
      const t = -len * 0.5 - 4;
      shaft(g, t, 54, 4.2, v === 'mace' ? '#7a5632' : WOOD);
      handle(g, 22, 4.4, '#2a1e16', { wrap: true, y: 34 });
      if (v === 'mace_stone') {
        shape(g, () => { g.moveTo(-15, t + 22); g.lineTo(-18, t + 6); g.lineTo(-6, t - 10); g.lineTo(12, t - 8); g.lineTo(19, t + 8); g.lineTo(14, t + 24); g.lineTo(0, t + 28); g.closePath(); }, lin(g, -18, t - 10, 19, t + 28, '#b8b0a0', '#6a6458'), 4);
        g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-8, t); g.lineTo(2, t + 10); g.lineTo(10, t + 2); g.stroke();
        bind(g, t + 26, 5, '#c8a45a');
      } else {
        shape(g, ell(g, 0, t + 8, 12, 14), lin(g, -12, t - 6, 12, t + 22, shade('#8a8e96', 0.3), shade('#8a8e96', -0.5)), 4);
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const px = Math.cos(a) * 11; const py = t + 8 + Math.sin(a) * 13; shape(g, poly(g, [[px * 0.6, py - 3 + (py - t - 8) * 0.0], [px * 1.9, py + (py - t - 8) * 0.55], [px * 0.6, py + 4]]), lin(g, 0, py - 4, px * 1.9, py + 4, '#b8bcc4', '#5a5e66'), 2.5); }
        shape(g, ell(g, 0, t + 8, 5, 6), '#aeb3bb', 2.5);
        gloss(g, -7, t - 2, 5, 12, 0.45);
      }
      return;
    }
    if (v === 'long_spiked_club') {
      shape(g, () => { g.moveTo(-5, 54); g.lineTo(5, 54); g.lineTo(7, 10); g.quadraticCurveTo(20, -20, 17, -54); g.quadraticCurveTo(0, -64, -17, -54); g.quadraticCurveTo(-20, -20, -7, 10); }, lin(g, -18, 0, 18, 0, '#9a6a3a', '#4a2e18'), 4);
      woodGrain(g, -12, -50, 24, 60);
      for (const [x, y, d] of [[-14, -48, -1], [14, -44, 1], [-15, -28, -1], [15, -24, 1], [-13, -10, -1], [13, -6, 1], [0, -58, 0]] as [number, number, number][]) nail(g, x, y, d * 8);
      handle(g, 22, 5.4, '#2a1e16', { wrap: true, y: 34 });
      return;
    }
    // Schläger (kurz, mit Stacheln)
    shape(g, () => { g.moveTo(-3.5, L * 0.45); g.lineTo(3.5, L * 0.45); g.lineTo(5, L * 0.1); g.quadraticCurveTo(14, -L * 0.2, 12, top); g.quadraticCurveTo(0, top - 10, -12, top); g.quadraticCurveTo(-14, -L * 0.2, -5, L * 0.1); }, lin(g, -13, 0, 13, 0, '#d4a666', '#7a4a22'), 4);
    woodGrain(g, -9, top, 18, L * 0.7);
    handle(g, short ? 18 : 24, 4.4, GRIP, { wrap: true, y: L * 0.45 - (short ? 18 : 24) + 4, pommel: '#3a3a40' });
    if (v === 'spiked_short_bat') for (const [x, y, d] of [[-11, top + 6, -1], [11, top + 12, 1], [-9, top + 22, -1], [10, top + 30, 1]] as [number, number, number][]) nail(g, x, y, d * 7);
    gloss(g, -8, top + 4, 3, L * 0.4, 0.3);
  });
}

function hammerIcon(g: G, v: string): void {
  floor(g, 114, 40);
  rot(g, 0.62, () => {
    const big = v === 'club_hammer' || v === 'smithing_hammer';
    const top = v === 'gavel' ? -22 : big ? -34 : -38;
    shaft(g, top + 8, 54, big ? 4.2 : 3.6, v === 'wooden_mallet' ? '#c49a5e' : WOOD);
    handle(g, 18, 4.2, '#2a1e16', { wrap: true, y: 38 });
    if (v === 'wooden_mallet') {
      shape(g, rr(g, -16, top - 8, 32, 26, 5), lin(g, -16, 0, 16, 0, '#d4a666', '#7a4a22'), 4);
      woodGrain(g, -14, top - 6, 28, 22, false);
      shape(g, rr(g, -17, top + 1, 34, 4, 1), '#5a5e66', 2.5);
    } else if (v === 'stone_hammer') {
      shape(g, () => { g.moveTo(-18, top + 4); g.lineTo(-12, top - 10); g.lineTo(14, top - 8); g.lineTo(20, top + 6); g.lineTo(10, top + 18); g.lineTo(-12, top + 16); g.closePath(); }, lin(g, -18, top - 10, 20, top + 18, '#b8b0a0', '#625c50'), 4);
      bind(g, top + 14, 4, '#c8a45a');
    } else if (v === 'claw_hammer') {
      shape(g, rr(g, -17, top - 2, 34, 16, 3), lin(g, 0, top - 2, 0, top + 14, shade(STEEL, 0.1), shade(STEEL, -0.45)), 4);
      shape(g, () => { g.moveTo(17, top); g.lineTo(26, top - 2); g.lineTo(26, top + 14); g.lineTo(17, top + 12); g.closePath(); }, '#8a8e96', 3.5);
      shape(g, () => { g.moveTo(-17, top + 2); g.quadraticCurveTo(-32, top - 4, -36, top - 16); g.lineTo(-30, top - 16); g.quadraticCurveTo(-24, top + 2, -17, top + 10); g.closePath(); }, lin(g, -36, 0, -17, 0, '#b0b5bc', '#5a5e66'), 3.5);
    } else if (v === 'gavel') {
      shape(g, rr(g, -17, top - 8, 34, 18, 4), lin(g, -17, 0, 17, 0, '#a8723a', '#4a2c14'), 4);
      shape(g, rr(g, -19, top - 6, 5, 14, 2), '#c8a02a', 2.5);
      shape(g, rr(g, 14, top - 6, 5, 14, 2), '#c8a02a', 2.5);
    } else {
      const w = big ? 20 : 17;
      shape(g, rr(g, -w, top - 4, w * 2, 20, 3), lin(g, 0, top - 4, 0, top + 16, shade(STEEL, 0.15), shade(STEEL, -0.5)), 4);
      shape(g, rr(g, -w - 3, top - 2, 5, 16, 2), '#8a8e96', 3);
      shape(g, rr(g, w - 2, top - 2, 5, 16, 2), '#8a8e96', 3);
      gloss(g, -w + 4, top, w, 4, 0.5);
    }
  });
}

function spearIcon(g: G, v: string): void {
  floor(g, 114, 40);
  rot(g, -0.78, () => {
    const long = v === 'long';
    const t = long ? -66 : -52;
    shaft(g, t + 20, 62, 3.4, '#8a5e34');
    handle(g, 22, 3.8, '#2a1e16', { wrap: true, y: 30 });
    bind(g, t + 24, 3.4);
    shape(g, () => { g.moveTo(0, t - (long ? 22 : 16)); g.quadraticCurveTo(12, t - 4, 7, t + 22); g.lineTo(-7, t + 22); g.quadraticCurveTo(-12, t - 4, 0, t - (long ? 22 : 16)); }, lin(g, -10, 0, 10, 0, shade(STEEL, 0.4), shade(STEEL, -0.45)), 4);
    g.strokeStyle = 'rgba(40,44,52,0.45)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, t - 8); g.lineTo(0, t + 18); g.stroke();
  });
}

function toolIcon(g: G, v: string): void {
  floor(g, 114, 40);
  if (v === 'bolt_cutters') {
    rot(g, -0.65, () => {
      for (const s of [-1, 1]) { g.save(); g.rotate(s * 0.12); shape(g, rr(g, s * 7 - 4, -4, 8, 74, 4), lin(g, -4, 0, 4, 0, '#d84a3a', '#7a1e16'), 4); handle(g, 26, 4.4, GRIP, { y: 48 }); g.restore(); }
      shape(g, () => { g.moveTo(-18, -4); g.quadraticCurveTo(-18, -34, -3, -40); g.lineTo(3, -40); g.quadraticCurveTo(18, -34, 18, -4); g.lineTo(8, -4); g.lineTo(0, -20); g.lineTo(-8, -4); g.closePath(); }, lin(g, -18, -40, 18, 0, '#aeb3bb', '#4a4e56'), 4);
      shape(g, ell(g, 0, -2, 5, 5), '#2a2c32', 3);
    });
    return;
  }
  if (v === 'pipe_wrench' || v === 'wrench') {
    rot(g, -0.7, () => {
      const c = v === 'pipe_wrench' ? '#d03a2a' : '#aeb3bb';
      shape(g, rr(g, -5.5, -8, 11, 82, 5), lin(g, -5, 0, 5, 0, shade(c, 0.35), shade(c, -0.45)), 4);
      if (v === 'pipe_wrench') {
        shape(g, () => { g.moveTo(-9, -8); g.lineTo(-12, -32); g.quadraticCurveTo(-4, -44, 10, -38); g.lineTo(14, -26); g.lineTo(4, -22); g.lineTo(6, -8); g.closePath(); }, lin(g, -12, -40, 14, -8, shade(c, 0.35), shade(c, -0.45)), 4);
        g.strokeStyle = INK; g.lineWidth = 1.6; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(5, -24 - i * 3); g.lineTo(10, -26 - i * 3); g.stroke(); }
        shape(g, rr(g, 8, -18, 7, 18, 3), '#8a8e96', 3);
      } else {
        shape(g, () => { g.arc(0, -14, 14, 0.7, Math.PI * 2 - 0.7 + Math.PI); g.closePath(); }, lin(g, -14, -28, 14, 0, shade(c, 0.4), shade(c, -0.45)), 4);
        shape(g, rr(g, -4, -26, 8, 14, 2), 'rgba(0,0,0,0.55)', 2);
        shape(g, ell(g, 0, 70, 7, 7), shade(c, -0.1), 3.5);
        shape(g, ell(g, 0, 70, 3, 3), 'rgba(0,0,0,0.6)', 2);
      }
    });
    return;
  }
  if (v === 'shovel') {
    rot(g, 0.5, () => {
      shaft(g, -54, 20, 3.4, '#8a8e96');
      handle(g, 22, 3.8, '#2a2a30', { y: -58 });
      shape(g, rr(g, -9, -62, 18, 7, 3), '#3a3d44', 3.5);
      shape(g, () => { g.moveTo(-18, 14); g.quadraticCurveTo(0, 4, 18, 14); g.lineTo(14, 56); g.quadraticCurveTo(0, 70, -14, 56); g.closePath(); }, lin(g, -18, 0, 18, 0, '#6aa8f0', '#1e4a90'), 4);
      g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-8, 22); g.lineTo(-6, 54); g.stroke();
    });
    return;
  }
  if (v === 'bottle') {
    g.save(); g.translate(64, 64); g.rotate(-0.4);
    shape(g, () => { g.moveTo(-14, 40); g.lineTo(-14, -6); g.lineTo(-8, -24); g.lineTo(-5, -50); g.lineTo(5, -50); g.lineTo(8, -24); g.lineTo(14, -6); g.lineTo(14, 8); g.lineTo(10, 14); g.lineTo(6, 6); g.lineTo(2, 20); g.lineTo(-3, 8); g.lineTo(-6, 22); g.lineTo(-10, 12); g.lineTo(-14, 26); g.closePath(); }, 'rgba(150,215,190,0.8)', 4);
    gloss(g, -9, -20, 3, 36, 0.55);
    g.restore();
  }
}

/* -------------------------------------------------------------- Schusswaffen */

/** Seitenansicht, Mündung rechts. Koordinaten im 128er-Raster. */
function gunBase(g: G): void { floor(g, 112, 46); }

function pistolIcon(g: G, v: string): void {
  gunBase(g);
  const big = v === 'bf';
  const slide = v === 'm1911' ? '#6a6e76' : v === 'bf' ? '#8a8e96' : '#2f3238';
  const x0 = 22, x1 = big ? 112 : 104;
  g.save(); g.translate(0, -2);
  // Griffstück + Griff
  shape(g, () => { g.moveTo(x0 + 8, 54); g.lineTo(x1 - 8, 54); g.lineTo(x1 - 8, 62); g.lineTo(x0 + 40, 62); g.lineTo(x0 + 44, 104); g.lineTo(x0 + 14, 104); g.lineTo(x0 + 4, 58); g.closePath(); }, lin(g, 0, 54, 0, 104, '#3c3f47', '#18191d'), 4.5);
  if (v === 'm1911') shape(g, poly(g, [[x0 + 18, 66], [x0 + 38, 66], [x0 + 40, 100], [x0 + 22, 100]]), lin(g, 0, 66, 0, 100, '#a8723a', '#5a3216'), 3);
  else { g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 2; for (let y = 68; y < 100; y += 5) { g.beginPath(); g.moveTo(x0 + 16, y); g.lineTo(x0 + 38, y + 1); g.stroke(); } }
  shape(g, rr(g, x0 + 12, 102, 34, 6, 2), '#15161a', 3);
  // Abzugsbügel + Abzug
  g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.moveTo(x0 + 46, 62); g.quadraticCurveTo(x0 + 70, 62, x0 + 66, 76); g.lineTo(x0 + 44, 74); g.stroke();
  g.strokeStyle = '#3c3f47'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 + 46, 62); g.quadraticCurveTo(x0 + 68, 62, x0 + 64, 75); g.lineTo(x0 + 45, 73); g.stroke();
  shape(g, poly(g, [[x0 + 52, 62], [x0 + 56, 62], [x0 + 54, 72]]), '#cfd3da', 2);
  // Schlitten
  shape(g, rr(g, x0, 38, x1 - x0, 20, 5), lin(g, 0, 38, 0, 58, shade(slide, 0.4), shade(slide, -0.5)), 4.5);
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
  for (let x = x0 + 6; x < x0 + 24; x += 4) { g.beginPath(); g.moveTo(x, 42); g.lineTo(x, 55); g.stroke(); }
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x0 + 40, 44, 24, 4); // Auswurffenster
  shape(g, rr(g, x1 - 4, 42, 8, 10, 2), '#0e0e12', 3); // Mündung
  shape(g, poly(g, [[x1 - 12, 38], [x1 - 6, 38], [x1 - 6, 33], [x1 - 11, 33]]), '#2a2c32', 2.5); // Korn
  shape(g, rr(g, x0 + 2, 33, 7, 6, 1), '#2a2c32', 2.5); // Kimme
  if (v === 'm1911') shape(g, poly(g, [[x0 - 2, 44], [x0 + 6, 38], [x0 + 6, 52]]), '#4a4e56', 2.5); // Hahn
  gloss(g, x0 + 12, 41, x1 - x0 - 30, 3, 0.4);
  g.restore();
}

function revolverIcon(g: G, v: string): void {
  gunBase(g);
  const L = v === 'long' ? 112 : v === 'short' ? 86 : 100;
  const col = v === 'long' ? '#2f3238' : v === 'short' ? '#6a6e76' : '#4a4d54';
  g.save(); g.translate(0, -2);
  // Griff (Holz)
  shape(g, () => { g.moveTo(22, 58); g.lineTo(44, 58); g.lineTo(46, 70); g.lineTo(34, 104); g.lineTo(12, 98); g.quadraticCurveTo(16, 76, 22, 58); }, lin(g, 12, 58, 46, 104, '#b87a40', '#4e2c14'), 4.5);
  woodGrain(g, 18, 62, 22, 38);
  // Rahmen + Lauf
  shape(g, rr(g, 38, 42, 28, 24, 6), lin(g, 0, 42, 0, 66, shade(col, 0.35), shade(col, -0.45)), 4.5);
  shape(g, rr(g, 62, 44, L - 62, 14, 3), lin(g, 0, 44, 0, 58, shade(col, 0.4), shade(col, -0.5)), 4.5);
  shape(g, rr(g, 64, 41, L - 66, 5, 2), shade(col, 0.1), 2.5); // Schiene
  shape(g, poly(g, [[L - 10, 41], [L - 4, 41], [L - 4, 34], [L - 9, 34]]), '#2a2c32', 2.5); // Korn
  shape(g, rr(g, L - 4, 48, 6, 6, 2), '#0e0e12', 2.5);
  // Trommel
  shape(g, rr(g, 40, 38, 30, 32, 8), lin(g, 40, 0, 70, 0, shade(col, 0.5), shade(col, -0.5)), 4.5);
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3;
  for (const x of [48, 56, 63]) { g.beginPath(); g.moveTo(x, 42); g.lineTo(x, 66); g.stroke(); }
  // Hahn + Abzug + Bügel
  shape(g, poly(g, [[38, 44], [28, 40], [30, 52], [38, 54]]), '#4a4e56', 3);
  g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.moveTo(50, 68); g.quadraticCurveTo(66, 70, 62, 84); g.quadraticCurveTo(52, 90, 44, 76); g.stroke();
  g.strokeStyle = shade(col, 0.1); g.lineWidth = 3; g.beginPath(); g.moveTo(50, 68); g.quadraticCurveTo(64, 70, 60, 82); g.quadraticCurveTo(52, 87, 46, 76); g.stroke();
  gloss(g, 68, 47, L - 82, 3, 0.4);
  g.restore();
}

type ShotSpec = { kind: 'pump' | 'double' | 'sawn' | 'sawn_double' | 'tactical' };
function shotgunIcon(g: G, v: string): void {
  gunBase(g);
  const k = v as ShotSpec['kind'];
  const wood = k === 'tactical' ? '#2a2c30' : '#9a6a3a';
  const sawn = k === 'sawn' || k === 'sawn_double';
  const bx0 = sawn ? 40 : 34;
  const bx1 = sawn ? 82 : 120;
  g.save(); g.translate(0, 2);
  // Schaft
  shape(g, sawn
    ? poly(g, [[bx0 + 4, 58], [30, 62], [20, 96], [32, 100], [48, 74]])
    : poly(g, [[bx0 + 8, 56], [14, 60], [6, 86], [16, 90], [bx0 + 12, 72]]), lin(g, 0, 56, 0, 96, shade(wood, 0.35), shade(wood, -0.5)), 4.5);
  if (k !== 'tactical') woodGrain(g, sawn ? 22 : 8, 62, 28, 24, false);
  if (k === 'tactical') shape(g, rr(g, 6, 58, 8, 28, 3), '#15161a', 3);
  // Lauf / Läufe
  if (k === 'double' || k === 'sawn_double') {
    shape(g, rr(g, bx0 + 8, 47, bx1 - bx0 - 8, 8, 3), lin(g, 0, 47, 0, 55, '#8a8e96', '#2a2c32'), 4);
    shape(g, rr(g, bx0 + 8, 54, bx1 - bx0 - 8, 8, 3), lin(g, 0, 54, 0, 62, '#7a7e86', '#1e2024'), 4);
    shape(g, ell(g, bx1, 51, 2.6, 3.6), '#0a0a0c', 1.5);
    shape(g, ell(g, bx1, 58, 2.6, 3.6), '#0a0a0c', 1.5);
    shape(g, rr(g, bx0 - 2, 44, 20, 20, 6), lin(g, 0, 44, 0, 64, '#8a8e96', '#3a3d44'), 4.5); // Kasten
    if (!sawn) shape(g, rr(g, bx0 + 30, 62, 34, 12, 5), lin(g, 0, 62, 0, 74, shade(wood, 0.3), shade(wood, -0.5)), 4); // Vorderschaft
  } else {
    shape(g, rr(g, bx0 + 8, 48, bx1 - bx0 - 8, 8, 3), lin(g, 0, 48, 0, 56, '#8a8e96', '#2a2c32'), 4);
    shape(g, ell(g, bx1, 52, 2.6, 4), '#0a0a0c', 1.5);
    if (!sawn) {
      shape(g, rr(g, bx0 + 8, 57, bx1 - bx0 - 22, 6, 3), lin(g, 0, 57, 0, 63, '#6a6e76', '#25272c'), 3.5); // Magazinrohr
      shape(g, rr(g, bx0 + 30, 62, 30, 13, 5), lin(g, 0, 62, 0, 75, shade(wood, 0.3), shade(wood, -0.5)), 4); // Pumpgriff
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2; for (let x = bx0 + 34; x < bx0 + 58; x += 4) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x, 73); g.stroke(); }
      if (k === 'tactical') shape(g, rr(g, bx0 + 28, 44, 50, 5, 2), '#3a3d44', 2.5); // Hitzeschild
    }
    shape(g, rr(g, bx0 - 2, 44, 28, 20, 5), lin(g, 0, 44, 0, 64, '#7a7e86', '#2e3036'), 4.5); // Gehäuse
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(bx0 + 6, 49, 14, 3);
  }
  // Abzugsbügel
  g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.moveTo(bx0 + 4, 64); g.quadraticCurveTo(bx0 + 14, 78, bx0 + 24, 64); g.stroke();
  g.strokeStyle = '#3c3f47'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(bx0 + 4, 64); g.quadraticCurveTo(bx0 + 14, 76, bx0 + 24, 64); g.stroke();
  shape(g, poly(g, [[bx1 - 6, 48], [bx1 - 1, 48], [bx1 - 2, 43], [bx1 - 5, 43]]), '#f0e8d0', 2);
  gloss(g, bx0 + 12, 49, bx1 - bx0 - 26, 2.5, 0.4);
  g.restore();
}

interface RifleSpec { stock: 'wood' | 'black' | 'm16'; barrel: number; scope?: 'small' | 'big'; mag?: 'box' | 'curved'; lever?: boolean; bolt?: boolean; carry?: boolean; tube?: boolean; guard?: boolean }
const RIFLES: Record<string, RifleSpec> = {
  m16: { stock: 'm16', barrel: 120, mag: 'curved', carry: true, guard: true },
  m1a: { stock: 'wood', barrel: 120, mag: 'box', guard: true },
  js14: { stock: 'wood', barrel: 116, mag: 'box', guard: true, scope: 'small' },
  l92: { stock: 'wood', barrel: 108, lever: true, tube: true },
  l94: { stock: 'wood', barrel: 120, lever: true, tube: true },
  varmint: { stock: 'wood', barrel: 120, bolt: true, scope: 'small' },
  hunting: { stock: 'wood', barrel: 120, bolt: true, scope: 'big' },
  msr7t: { stock: 'black', barrel: 120, bolt: true, scope: 'big', guard: true },
  trapper: { stock: 'wood', barrel: 104, lever: true, tube: true },
};

function rifleIcon(g: G, v: string): void {
  gunBase(g);
  const s = RIFLES[v];
  const wood = s.stock === 'wood' ? '#9a6a3a' : '#2b2d32';
  g.save(); g.translate(0, 4);
  // Schaft
  shape(g, s.stock === 'm16'
    ? poly(g, [[44, 52], [12, 56], [8, 66], [12, 74], [44, 66]])
    : poly(g, [[46, 54], [12, 58], [6, 84], [18, 88], [30, 70], [46, 70]]), lin(g, 0, 54, 0, 88, shade(wood, 0.35), shade(wood, -0.5)), 4.5);
  if (s.stock === 'wood') woodGrain(g, 12, 60, 30, 22, false);
  if (s.stock === 'm16') shape(g, rr(g, 6, 58, 6, 14, 2), '#15161a', 3);
  // Vorderschaft
  if (s.guard) shape(g, rr(g, 70, 52, s.stock === 'm16' ? 34 : 30, 16, 5), lin(g, 0, 52, 0, 68, shade(s.stock === 'm16' ? '#2b2d32' : wood, 0.35), shade(s.stock === 'm16' ? '#2b2d32' : wood, -0.5)), 4.5);
  // Lauf
  shape(g, rr(g, 70, 50, s.barrel - 70, 7, 3), lin(g, 0, 50, 0, 57, '#8a8e96', '#26282d'), 4);
  shape(g, ell(g, s.barrel, 53.5, 2.4, 3.6), '#0a0a0c', 1.5);
  if (s.tube) shape(g, rr(g, 70, 58, s.barrel - 80, 6, 3), lin(g, 0, 58, 0, 64, '#6a6e76', '#25272c'), 3.5);
  shape(g, poly(g, [[s.barrel - 8, 50], [s.barrel - 3, 50], [s.barrel - 4, 44], [s.barrel - 7, 44]]), '#2a2c32', 2.5);
  // Gehäuse
  shape(g, rr(g, 44, 46, 34, 22, 5), lin(g, 0, 46, 0, 68, shade(s.stock === 'wood' ? '#6a6e76' : '#3a3d44', 0.4), shade('#2a2c32', -0.3)), 4.5);
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(52, 51, 16, 3);
  if (s.bolt) { g.strokeStyle = INK; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(68, 55); g.lineTo(76, 66); g.stroke(); g.strokeStyle = '#cfd3da'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(68, 55); g.lineTo(76, 66); g.stroke(); shape(g, ell(g, 77, 67, 4, 4), '#cfd3da', 2.5); }
  if (s.carry) shape(g, () => { g.moveTo(48, 46); g.lineTo(48, 38); g.quadraticCurveTo(62, 32, 76, 38); g.lineTo(76, 46); g.lineTo(70, 46); g.lineTo(70, 42); g.quadraticCurveTo(62, 38, 54, 42); g.lineTo(54, 46); g.closePath(); }, '#2b2d32', 3.5);
  // Magazin
  if (s.mag === 'box') shape(g, poly(g, [[56, 68], [74, 68], [76, 94], [60, 96]]), lin(g, 0, 68, 0, 96, '#4a4e56', '#16171a'), 4);
  if (s.mag === 'curved') shape(g, () => { g.moveTo(56, 68); g.lineTo(72, 68); g.quadraticCurveTo(78, 86, 68, 100); g.lineTo(54, 98); g.quadraticCurveTo(62, 84, 56, 68); }, lin(g, 0, 68, 0, 100, '#4a4e56', '#16171a'), 4);
  // Griff + Abzugsbügel
  shape(g, poly(g, [[46, 68], [56, 68], [54, 90], [44, 90]]), lin(g, 0, 68, 0, 90, '#3a3d44', '#16171a'), 3.5);
  g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.moveTo(54, 68); g.quadraticCurveTo(62, 82, 70, 68); g.stroke();
  g.strokeStyle = '#3c3f47'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(54, 68); g.quadraticCurveTo(62, 80, 70, 68); g.stroke();
  if (s.lever) { g.strokeStyle = INK; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(52, 68); g.quadraticCurveTo(52, 90, 74, 86); g.quadraticCurveTo(80, 80, 72, 68); g.stroke(); g.strokeStyle = '#8a8e96'; g.lineWidth = 3; g.beginPath(); g.moveTo(52, 68); g.quadraticCurveTo(52, 88, 73, 84); g.quadraticCurveTo(77, 80, 71, 68); g.stroke(); }
  // Zielfernrohr
  if (s.scope) {
    const len = s.scope === 'big' ? 56 : 40;
    const x = 80 - len / 2 - 6;
    shape(g, rr(g, x, 34, len, s.scope === 'big' ? 11 : 9, 4), lin(g, 0, 34, 0, 45, '#4a4e56', '#14151a'), 4);
    shape(g, ell(g, x, 39, 4, s.scope === 'big' ? 8 : 7), '#6ab8e8', 3);
    shape(g, ell(g, x + len, 39, 3.4, 6), '#3a7ac0', 3);
    shape(g, rr(g, x + 8, 44, 6, 6, 1), '#2a2c32', 2.5);
    shape(g, rr(g, x + len - 14, 44, 6, 6, 1), '#2a2c32', 2.5);
    gloss(g, x + 6, 36, len - 14, 2, 0.45);
  }
  gloss(g, 78, 51, s.barrel - 94, 2, 0.4);
  g.restore();
}

/* ----------------------------------------------------------------- Zuordnung */

type Painter = (g: G, v: string) => void;
const BY_ID: Record<string, [Painter, string]> = {};
const reg = (p: Painter, pairs: [string, string][]): void => { for (const [id, v] of pairs) BY_ID[`pz_${id}`] = [p, v]; };
reg(bladeIcon, [['katana', 'katana'], ['sword', 'sword'], ['shortsword', 'shortsword'], ['crude_sword', 'crude'], ['crude_shortsword', 'crude_short'], ['handguard_dagger', 'dagger'], ['fighting_knife', 'fighting'], ['hunting_knife', 'hunting'], ['railroad_spike_knife', 'spike'], ['pocket_knife', 'pocket'], ['small_knife', 'small'], ['large_knife', 'large'], ['machete_knife', 'machete'], ['butterfly_knife', 'butterfly'], ['switchblade', 'switch']]);
reg(axeIcon, [['hatchet', 'hatchet'], ['hand_axe', 'hand_axe'], ['wood_axe', 'wood_axe'], ['pickaxe', 'pickaxe'], ['ice_axe', 'ice_axe'], ['scythe', 'scythe']]);
reg(clubIcon, [['mace', 'mace'], ['mace_stone', 'mace_stone'], ['long_mace', 'long_mace'], ['long_spiked_club', 'long_spiked_club'], ['short_bat', 'short_bat'], ['spiked_short_bat', 'spiked_short_bat'], ['nightstick', 'nightstick'], ['fire_poker', 'fire_poker']]);
reg(hammerIcon, [['claw_hammer', 'claw_hammer'], ['club_hammer', 'club_hammer'], ['stone_hammer', 'stone_hammer'], ['wooden_mallet', 'wooden_mallet'], ['gavel', 'gavel'], ['smithing_hammer', 'smithing_hammer']]);
reg(spearIcon, [['spear_short', 'short'], ['spear_long', 'long']]);
reg(toolIcon, [['bolt_cutters', 'bolt_cutters'], ['pipe_wrench', 'pipe_wrench'], ['wrench', 'wrench'], ['snow_shovel', 'shovel'], ['smashed_bottle', 'bottle']]);
reg(pistolIcon, [['pistol_bf', 'bf'], ['pistol_m9', 'm9'], ['pistol_m1911', 'm1911']]);
reg(revolverIcon, [['revolver', 'std'], ['revolver_short', 'short'], ['magnum', 'long']]);
reg(shotgunIcon, [['shotgun', 'pump'], ['shotgun_sawnoff', 'sawn'], ['shotgun_tactical', 'tactical'], ['shotgun_double', 'double'], ['shotgun_double_sawnoff', 'sawn_double']]);
reg(rifleIcon, [['rifle_m16', 'm16'], ['rifle_m1a', 'm1a'], ['rifle_js14', 'js14'], ['carbine_l92', 'l92'], ['rifle_l94', 'l94'], ['rifle_varmint', 'varmint'], ['rifle_hunting', 'hunting'], ['rifle_msr7t', 'msr7t'], ['carbine_trapper', 'trapper']]);

export const WEAPON_ICON_IDS = Object.keys(BY_ID);

const cache = new Map<string, string>();
/** data-URL des detaillierten Waffen-Icons oder null (keine Waffe / kein Canvas) */
export function weaponIconURL(id: string): string | null {
  const e = BY_ID[id];
  if (!e || typeof document === 'undefined') return null;
  const hit = cache.get(id);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  e[0](g, e[1]);
  const url = c.toDataURL('image/png');
  cache.set(id, url);
  return url;
}
