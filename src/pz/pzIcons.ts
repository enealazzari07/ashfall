/**
 * Icons für die PZ-Items: im gleichen gemalten Stil wie render/Icons.ts (dunkle Kontur, Verlauf, Glanzlicht),
 * aber nach Motiv statt nach Item-Id. Jedes Item bekommt Motiv + Grundfarbe (siehe PZ_ICONS), die Farben
 * werden automatisch abgedunkelt/aufgehellt. Gezeichnet wird zur Laufzeit und gecacht.
 */
type G = CanvasRenderingContext2D;

export type IconKind =
  | 'sword' | 'spear' | 'club' | 'hammer' | 'knife' | 'axe' | 'pickaxe' | 'wrench' | 'pliers' | 'shovel' | 'screwdriver' | 'saw'
  | 'pistol' | 'revolver' | 'shotgun' | 'rifle' | 'bullet' | 'ammobox' | 'magazine' | 'scope' | 'bomb'
  | 'bottle' | 'can' | 'jar' | 'cup' | 'pot' | 'sack' | 'box' | 'pills' | 'paper' | 'book' | 'map'
  | 'candy' | 'bread' | 'cake' | 'meat' | 'fish' | 'egg' | 'fruitveg' | 'mushroom' | 'herb' | 'seeds'
  | 'cloth' | 'rope' | 'tape' | 'plank' | 'ingot' | 'hide' | 'gear' | 'tire'
  | 'flashlight' | 'lighter' | 'candle' | 'lantern' | 'battery' | 'bulb' | 'radio' | 'key' | 'ball' | 'trap' | 'tent' | 'sleeping';

export const INK = '#17130f';
const S = 128;

function clamp(n: number): number { return Math.max(0, Math.min(255, Math.round(n))); }
/** Farbe um `amt` (-1..1) aufhellen (+) oder abdunkeln (−) */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const f = (v: number): number => clamp(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export const lin = (g: G, x0: number, y0: number, x1: number, y1: number, a: string, b: string): CanvasGradient => {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, a);
  gr.addColorStop(1, b);
  return gr;
};
/** Standard-Verlauf in der Grundfarbe, von oben-links hell nach unten-rechts dunkel */
const body = (g: G, c: string, x0 = 0, y0 = 0, x1 = 128, y1 = 128): CanvasGradient => lin(g, x0, y0, x1, y1, shade(c, 0.35), shade(c, -0.35));

export function shape(g: G, path: () => void, fill: string | CanvasGradient, lw = 5): void {
  g.beginPath();
  path();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = lw;
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.stroke();
}
export const rr = (g: G, x: number, y: number, w: number, h: number, r: number) => () => g.roundRect(x, y, w, h, r);
export const ell = (g: G, x: number, y: number, rx: number, ry: number) => () => g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
export const poly = (g: G, pts: number[][]) => () => { pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
export function floor(g: G, y = 112, rx = 38): void {
  g.fillStyle = 'rgba(0,0,0,0.38)';
  g.beginPath();
  g.ellipse(64, y, rx, 8, 0, 0, Math.PI * 2);
  g.fill();
}
export function gloss(g: G, x: number, y: number, w: number, h: number, a = 0.45): void {
  g.fillStyle = `rgba(255,255,255,${a})`;
  g.beginPath();
  g.roundRect(x, y, w, h, Math.min(w, h) / 2);
  g.fill();
}
/** Zeichnet `fn` um den Mittelpunkt gedreht (für Waffen/Werkzeuge, die diagonal liegen) */
export function rot(g: G, a: number, fn: () => void): void {
  g.save();
  g.translate(64, 64);
  g.rotate(a);
  fn();
  g.restore();
}
const WOOD = '#9a7448';
const METAL = '#aeb3bb';
const DARK = '#2a2c32';

type Painter = (g: G, c: string) => void;

const P: Record<IconKind, Painter> = {
  sword(g, c) {
    rot(g, -0.78, () => {
      shape(g, poly(g, [[-7, -56], [7, -56], [9, 24], [-9, 24]]), lin(g, -8, 0, 9, 0, shade(c, 0.4), shade(c, -0.4)));
      shape(g, poly(g, [[0, -62], [7, -56], [-7, -56]]), shade(c, 0.3), 3);
      shape(g, rr(g, -22, 22, 44, 8, 3), '#7a6a3a', 3);
      shape(g, rr(g, -5, 30, 10, 24, 3), '#3a2a1a');
      shape(g, ell(g, 0, 56, 6, 5), '#7a6a3a', 3);
    });
  },
  spear(g, c) {
    rot(g, -0.8, () => {
      shape(g, rr(g, -3.5, -30, 7, 92, 3), lin(g, -4, 0, 4, 0, '#b98a52', '#6a4a28'));
      shape(g, poly(g, [[0, -60], [9, -30], [0, -26], [-9, -30]]), lin(g, -9, 0, 9, 0, shade(c, 0.4), shade(c, -0.4)), 4);
    });
  },
  club(g, c) {
    rot(g, -0.75, () => {
      shape(g, () => { g.moveTo(-4, 54); g.lineTo(4, 54); g.lineTo(6, 20); g.quadraticCurveTo(18, -10, 15, -42); g.quadraticCurveTo(0, -56, -15, -42); g.quadraticCurveTo(-18, -10, -6, 20); }, body(g, c, -16, 0, 16, 0));
      g.fillStyle = INK;
      for (const [x, y] of [[-8, -34], [8, -30], [-9, -16], [9, -12]]) { g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + (x < 0 ? -7 : 7), y); g.lineTo(x, y + 4); g.fill(); }
      shape(g, rr(g, -6, 40, 12, 16, 3), '#2a2018', 3);
    });
  },
  hammer(g, c) {
    rot(g, 0.6, () => {
      shape(g, rr(g, -5, -30, 10, 82, 4), lin(g, -5, 0, 5, 0, '#b98a52', '#6a4a28'));
      shape(g, rr(g, -26, -44, 52, 22, 4), body(g, '#8a8e96', 0, -44, 0, -22));
      gloss(g, -20, -40, 30, 4, 0.4);
    });
  },
  knife(g, c) {
    rot(g, -0.8, () => {
      shape(g, () => { g.moveTo(-6, 4); g.lineTo(-6, -36); g.quadraticCurveTo(-4, -52, 6, -56); g.lineTo(6, 4); }, lin(g, -6, 0, 6, 0, shade(c, 0.5), shade(c, -0.3)));
      shape(g, rr(g, -9, 4, 18, 6, 2), DARK, 3);
      shape(g, rr(g, -6, 10, 12, 36, 4), lin(g, -6, 0, 6, 0, '#6a4a2c', '#2a1a0c'));
    });
  },
  axe(g, c) {
    rot(g, 0.7, () => {
      shape(g, rr(g, -4, -48, 8, 104, 3), lin(g, -4, 0, 4, 0, '#b98a52', '#6a4a28'));
      shape(g, () => { g.moveTo(4, -50); g.quadraticCurveTo(38, -58, 40, -26); g.quadraticCurveTo(26, -30, 4, -24); }, lin(g, 4, -50, 40, -24, shade(c, 0.4), shade(c, -0.4)));
      shape(g, rr(g, -6, -52, 12, 10, 2), '#4a4e56', 3);
    });
  },
  pickaxe(g, c) {
    rot(g, 0.7, () => {
      shape(g, rr(g, -4, -44, 8, 100, 3), lin(g, -4, 0, 4, 0, '#b98a52', '#6a4a28'));
      shape(g, () => { g.moveTo(-40, -30); g.quadraticCurveTo(0, -60, 40, -30); g.lineTo(34, -26); g.quadraticCurveTo(0, -48, -34, -26); }, lin(g, 0, -60, 0, -26, shade(c, 0.4), shade(c, -0.4)));
    });
  },
  wrench(g, c) {
    rot(g, -0.7, () => {
      shape(g, rr(g, -6, -30, 12, 80, 5), body(g, c, -6, 0, 6, 0));
      shape(g, () => { g.arc(0, -40, 17, 0.5, Math.PI * 2 - 0.5 + Math.PI); g.closePath(); }, body(g, c, -16, -50, 16, -30));
      shape(g, rr(g, -4, -50, 8, 16, 2), 'rgba(0,0,0,0.6)', 2);
    });
  },
  pliers(g, c) {
    rot(g, -0.6, () => {
      shape(g, poly(g, [[-4, -50], [4, -50], [8, -8], [4, 12], [-4, 12], [-8, -8]]), body(g, METAL, -8, 0, 8, 0));
      shape(g, rr(g, -14, 12, 10, 44, 5), body(g, c, -14, 0, -4, 0));
      shape(g, rr(g, 4, 12, 10, 44, 5), body(g, c, 4, 0, 14, 0));
      shape(g, ell(g, 0, 6, 4, 4), '#555a62', 2);
    });
  },
  shovel(g, c) {
    rot(g, 0.5, () => {
      shape(g, rr(g, -3.5, -52, 7, 70, 3), lin(g, -4, 0, 4, 0, '#b98a52', '#6a4a28'));
      shape(g, () => { g.moveTo(-16, 14); g.quadraticCurveTo(0, 6, 16, 14); g.lineTo(12, 54); g.quadraticCurveTo(0, 66, -12, 54); g.closePath(); }, body(g, c, -16, 10, 16, 60));
    });
  },
  screwdriver(g, c) {
    rot(g, -0.8, () => {
      shape(g, rr(g, -8, 6, 16, 44, 7), body(g, c, -8, 0, 8, 0));
      shape(g, rr(g, -3, -44, 6, 52, 2), body(g, METAL, -3, 0, 3, 0), 3);
      shape(g, poly(g, [[-3, -44], [3, -44], [1, -50], [-1, -50]]), METAL, 2);
    });
  },
  saw(g, c) {
    rot(g, -0.3, () => {
      shape(g, poly(g, [[-46, -14], [40, -14], [40, 12], [-46, 4]]), body(g, METAL, 0, -14, 0, 12));
      g.fillStyle = INK;
      for (let x = -44; x < 38; x += 8) { g.beginPath(); g.moveTo(x, 6 - (x + 46) * 0.1); g.lineTo(x + 4, 14 - (x + 46) * 0.1); g.lineTo(x + 8, 6 - (x + 46) * 0.1); g.fill(); }
      shape(g, rr(g, 38, -20, 14, 36, 6), body(g, c, 38, 0, 52, 0), 4);
    });
  },
  pistol(g, c) {
    floor(g, 108, 36);
    shape(g, rr(g, 20, 34, 80, 24, 5), body(g, c, 0, 34, 0, 58));
    shape(g, rr(g, 36, 56, 22, 44, 5), lin(g, 36, 0, 58, 0, shade(c, 0.1), shade(c, -0.5)));
    shape(g, () => { g.moveTo(66, 58); g.quadraticCurveTo(70, 72, 82, 66); g.lineTo(82, 58); }, 'rgba(0,0,0,0)', 3);
    shape(g, rr(g, 96, 38, 12, 8, 2), '#15161a', 3);
    gloss(g, 26, 38, 60, 4, 0.35);
  },
  revolver(g, c) {
    floor(g, 108, 36);
    shape(g, rr(g, 52, 36, 52, 14, 3), body(g, c, 0, 36, 0, 50));
    shape(g, ell(g, 46, 48, 20, 17), body(g, shade(c, 0.1), 28, 30, 64, 66));
    g.fillStyle = INK;
    for (const [x, y] of [[40, 40], [52, 42], [36, 52], [52, 54], [44, 58]]) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
    shape(g, () => { g.moveTo(30, 54); g.lineTo(22, 98); g.lineTo(42, 100); g.lineTo(52, 62); }, lin(g, 22, 0, 52, 0, '#7a4a2c', '#3a2012'));
    gloss(g, 58, 38, 40, 3, 0.4);
  },
  shotgun(g, c) {
    rot(g, -0.3, () => {
      shape(g, rr(g, -56, -12, 112, 9, 4), body(g, '#4a4e56', 0, -12, 0, -3), 4);
      shape(g, rr(g, -30, -2, 52, 10, 4), body(g, '#6a4a2c', 0, -2, 0, 8), 4);
      shape(g, poly(g, [[-62, 4], [-30, -8], [-26, 6], [-50, 28], [-64, 22]]), lin(g, -60, 0, -26, 0, shade(c, 0.1), shade(c, -0.5)));
      shape(g, rr(g, -4, -10, 28, 8, 3), '#2a2c32', 3);
    });
  },
  rifle(g, c) {
    rot(g, -0.3, () => {
      shape(g, rr(g, -4, -9, 60, 7, 3), body(g, '#3a3d44', 0, -9, 0, -2), 4);
      shape(g, rr(g, -34, -12, 38, 13, 4), body(g, c, 0, -12, 0, 1), 4);
      shape(g, poly(g, [[-62, 6], [-34, -10], [-32, 4], [-48, 24], [-64, 20]]), lin(g, -62, 0, -32, 0, shade(c, 0.1), shade(c, -0.5)));
      shape(g, rr(g, -22, 1, 10, 24, 3), '#2a2c32', 3);
      shape(g, rr(g, -14, -20, 36, 7, 3), '#2a2c32', 3);
    });
  },
  bullet(g, c) {
    floor(g, 108, 24);
    for (const [x, r] of [[44, -0.15], [64, 0], [84, 0.15]] as [number, number][]) {
      g.save(); g.translate(x, 66); g.rotate(r);
      shape(g, rr(g, -8, -4, 16, 44, 3), lin(g, -8, 0, 8, 0, shade(c, 0.4), shade(c, -0.4)), 3);
      shape(g, () => { g.moveTo(-7, -4); g.quadraticCurveTo(-7, -30, 0, -38); g.quadraticCurveTo(7, -30, 7, -4); g.closePath(); }, lin(g, -7, 0, 7, 0, '#e0a060', '#9a5a22'), 3);
      g.restore();
    }
  },
  ammobox(g, c) {
    floor(g, 110, 40);
    shape(g, rr(g, 20, 46, 88, 56, 5), body(g, c, 0, 46, 0, 102));
    shape(g, rr(g, 20, 36, 88, 18, 4), body(g, shade(c, 0.2), 0, 36, 0, 54));
    shape(g, rr(g, 34, 66, 60, 22, 3), '#f4efe0', 3);
    g.fillStyle = '#2a2018';
    for (let i = 0; i < 5; i++) g.fillRect(40 + i * 11, 70, 6, 14);
    gloss(g, 26, 40, 74, 4, 0.35);
  },
  magazine(g, c) {
    floor(g, 112, 26);
    g.save(); g.translate(64, 64); g.rotate(0.12);
    shape(g, poly(g, [[-18, -50], [18, -50], [20, 48], [-16, 50]]), lin(g, -18, 0, 20, 0, shade(c, 0.3), shade(c, -0.5)));
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    for (let y = -34; y < 40; y += 14) { g.beginPath(); g.moveTo(-14, y); g.lineTo(14, y); g.stroke(); }
    shape(g, rr(g, -18, -56, 36, 10, 3), '#c8a05a', 3);
    g.restore();
  },
  scope(g, c) {
    rot(g, -0.5, () => {
      shape(g, rr(g, -46, -10, 92, 20, 8), body(g, c, 0, -10, 0, 10));
      shape(g, ell(g, -46, 0, 8, 16), '#6ab8e8', 4);
      shape(g, ell(g, 46, 0, 6, 12), '#3a7ac0', 4);
      shape(g, rr(g, -8, -18, 16, 10, 3), '#6a6e76', 3);
    });
  },
  bomb(g, c) {
    floor(g, 110, 34);
    shape(g, rr(g, 34, 44, 60, 58, 14), body(g, c, 30, 44, 94, 102));
    shape(g, rr(g, 50, 34, 28, 14, 4), '#4a4e56', 3);
    g.strokeStyle = INK; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(64, 36); g.quadraticCurveTo(66, 18, 84, 14); g.stroke();
    g.fillStyle = '#ffb030'; g.beginPath(); g.arc(86, 12, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 64, 74);
    gloss(g, 40, 50, 6, 36, 0.35);
  },
  bottle(g, c) {
    floor(g);
    shape(g, rr(g, 42, 40, 44, 72, 14), lin(g, 42, 0, 86, 0, shade(c, 0.5), shade(c, -0.3)));
    shape(g, poly(g, [[50, 40], [78, 40], [72, 22], [56, 22]]), shade(c, 0.3));
    shape(g, rr(g, 53, 8, 22, 16, 4), '#555a62');
    shape(g, rr(g, 46, 62, 36, 22, 3), 'rgba(250,250,245,0.9)', 3);
    gloss(g, 48, 46, 6, 50, 0.55);
  },
  can(g, c) {
    floor(g);
    shape(g, rr(g, 34, 34, 60, 76, 7), lin(g, 34, 0, 94, 0, shade(c, 0.45), shade(c, -0.35)));
    shape(g, ell(g, 64, 36, 30, 8), lin(g, 34, 28, 94, 44, '#f2f4f4', '#aeb6ba'));
    shape(g, rr(g, 34, 54, 60, 38, 2), 'rgba(250,246,230,0.92)', 3);
    g.fillStyle = shade(c, -0.2); g.fillRect(34, 66, 60, 8);
    gloss(g, 40, 56, 6, 44, 0.35);
  },
  jar(g, c) {
    floor(g);
    shape(g, rr(g, 36, 40, 56, 70, 12), 'rgba(205,230,225,0.55)');
    shape(g, rr(g, 42, 70, 44, 34, 8), lin(g, 0, 70, 0, 104, shade(c, 0.3), shade(c, -0.3)), 3);
    shape(g, rr(g, 40, 24, 48, 18, 4), '#c8a02a');
    gloss(g, 42, 46, 6, 50, 0.5);
  },
  cup(g, c) {
    floor(g, 112, 32);
    shape(g, poly(g, [[34, 44], [94, 44], [86, 106], [42, 106]]), body(g, c, 34, 0, 94, 0));
    shape(g, () => { g.moveTo(94, 56); g.quadraticCurveTo(116, 58, 108, 80); g.quadraticCurveTo(102, 90, 90, 88); }, 'rgba(0,0,0,0)', 5);
    shape(g, ell(g, 64, 46, 30, 7), '#5a3a22', 3);
    gloss(g, 42, 52, 5, 38, 0.4);
  },
  pot(g, c) {
    floor(g, 112, 42);
    shape(g, rr(g, 24, 50, 80, 56, 10), body(g, c, 24, 50, 104, 106));
    shape(g, ell(g, 64, 52, 40, 9), shade(c, -0.4), 4);
    shape(g, ell(g, 64, 52, 32, 6), shade(c, 0.1), 2);
    shape(g, rr(g, 12, 56, 14, 8, 3), '#2a2c32', 3);
    shape(g, rr(g, 102, 56, 14, 8, 3), '#2a2c32', 3);
    gloss(g, 30, 62, 5, 36, 0.35);
  },
  sack(g, c) {
    floor(g, 112, 38);
    shape(g, () => { g.moveTo(40, 40); g.quadraticCurveTo(14, 70, 28, 102); g.quadraticCurveTo(64, 116, 100, 102); g.quadraticCurveTo(114, 70, 88, 40); g.closePath(); }, body(g, c, 20, 40, 108, 108));
    shape(g, () => { g.moveTo(40, 40); g.quadraticCurveTo(64, 56, 88, 40); g.lineTo(84, 28); g.quadraticCurveTo(64, 38, 44, 28); g.closePath(); }, shade(c, -0.2), 4);
    shape(g, rr(g, 38, 66, 52, 22, 3), 'rgba(250,246,230,0.85)', 3);
    gloss(g, 34, 56, 6, 28, 0.3);
  },
  box(g, c) {
    floor(g, 112, 40);
    shape(g, rr(g, 24, 44, 80, 60, 5), body(g, c, 24, 44, 104, 104));
    shape(g, rr(g, 24, 34, 80, 16, 4), body(g, shade(c, 0.25), 0, 34, 0, 50));
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 3; g.beginPath(); g.moveTo(64, 50); g.lineTo(64, 104); g.stroke();
    gloss(g, 30, 54, 5, 38, 0.3);
  },
  pills(g, c) {
    floor(g, 112, 32);
    shape(g, rr(g, 38, 44, 52, 64, 10), 'rgba(235,175,70,0.9)');
    shape(g, rr(g, 34, 30, 60, 20, 6), '#f4f4f4');
    shape(g, rr(g, 44, 66, 40, 26, 3), '#fff', 3);
    g.fillStyle = c; g.fillRect(48, 74, 32, 6);
    for (const [x, y, r] of [[54, 56, 0], [70, 58, 1]]) { g.save(); g.translate(x, y); g.rotate(r); g.fillStyle = shade(c, 0.2); g.beginPath(); g.ellipse(0, 0, 5, 3, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
    gloss(g, 42, 48, 5, 50, 0.45);
  },
  paper(g, c) {
    floor(g, 112, 36);
    shape(g, poly(g, [[34, 24], [86, 24], [96, 36], [96, 104], [34, 104]]), body(g, c === '#f4f4f4' ? '#f4f4f0' : c, 34, 24, 96, 104));
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 3;
    for (let y = 44; y < 96; y += 12) { g.beginPath(); g.moveTo(42, y); g.lineTo(88, y); g.stroke(); }
    shape(g, poly(g, [[86, 24], [96, 36], [86, 36]]), 'rgba(0,0,0,0.12)', 2);
  },
  book(g, c) {
    floor(g, 112, 40);
    shape(g, rr(g, 30, 22, 68, 88, 4), body(g, c, 30, 22, 98, 110));
    shape(g, rr(g, 26, 22, 10, 88, 3), shade(c, -0.4), 3);
    shape(g, rr(g, 44, 34, 44, 24, 2), 'rgba(240,226,180,0.9)', 2);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(50, 42, 32, 3); g.fillRect(50, 49, 22, 3);
    gloss(g, 90, 30, 3, 70, 0.3);
  },
  map(g, c) {
    floor(g, 112, 40);
    shape(g, poly(g, [[20, 36], [48, 28], [80, 38], [108, 30], [108, 96], [80, 104], [48, 94], [20, 102]]), body(g, c, 20, 28, 108, 104));
    g.strokeStyle = 'rgba(60,40,20,0.55)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(48, 28); g.lineTo(48, 94); g.moveTo(80, 38); g.lineTo(80, 104); g.stroke();
    g.strokeStyle = '#c0392b'; g.lineWidth = 3; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(30, 84); g.quadraticCurveTo(60, 40, 96, 62); g.stroke(); g.setLineDash([]);
  },
  candy(g, c) {
    floor(g, 110, 34);
    shape(g, rr(g, 30, 50, 68, 34, 10), body(g, c, 30, 50, 98, 84));
    shape(g, poly(g, [[30, 58], [12, 46], [12, 88], [30, 76]]), shade(c, 0.3), 3);
    shape(g, poly(g, [[98, 58], [116, 46], [116, 88], [98, 76]]), shade(c, 0.3), 3);
    gloss(g, 38, 55, 40, 5, 0.5);
  },
  bread(g, c) {
    floor(g, 110, 42);
    shape(g, () => { g.moveTo(20, 84); g.bezierCurveTo(14, 52, 38, 38, 64, 38); g.bezierCurveTo(92, 38, 114, 52, 108, 84); g.bezierCurveTo(104, 100, 90, 104, 64, 104); g.bezierCurveTo(38, 104, 24, 100, 20, 84); }, lin(g, 0, 38, 0, 104, shade(c, 0.3), shade(c, -0.35)));
    g.strokeStyle = shade(c, -0.5); g.lineWidth = 4; g.lineCap = 'round';
    for (const x of [42, 62, 82]) { g.beginPath(); g.moveTo(x - 8, 70); g.quadraticCurveTo(x, 54, x + 8, 50); g.stroke(); }
    gloss(g, 36, 50, 24, 7, 0.4);
  },
  cake(g, c) {
    floor(g, 110, 40);
    shape(g, poly(g, [[24, 98], [24, 62], [108, 44], [108, 98]]), body(g, c, 24, 44, 108, 98));
    shape(g, poly(g, [[24, 62], [108, 44], [108, 56], [24, 74]]), '#f4e8d4', 4);
    shape(g, ell(g, 70, 44, 6, 6), '#d8302e', 3);
    gloss(g, 30, 80, 70, 4, 0.3);
  },
  meat(g, c) {
    floor(g, 110, 40);
    shape(g, () => { g.moveTo(24, 70); g.quadraticCurveTo(26, 36, 62, 36); g.quadraticCurveTo(104, 36, 106, 70); g.quadraticCurveTo(104, 100, 64, 100); g.quadraticCurveTo(28, 100, 24, 70); }, body(g, c, 24, 36, 106, 100));
    g.strokeStyle = 'rgba(255,240,230,0.7)'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(40, 66); g.quadraticCurveTo(62, 50, 88, 70); g.stroke();
    gloss(g, 36, 44, 24, 6, 0.4);
  },
  fish(g, c) {
    floor(g, 110, 40);
    shape(g, () => { g.moveTo(18, 66); g.quadraticCurveTo(50, 30, 92, 62); g.lineTo(112, 42); g.lineTo(108, 66); g.lineTo(112, 92); g.lineTo(92, 72); g.quadraticCurveTo(50, 102, 18, 66); }, lin(g, 0, 36, 0, 96, shade(c, 0.4), shade(c, -0.4)));
    g.fillStyle = INK; g.beginPath(); g.arc(34, 62, 4, 0, Math.PI * 2); g.fill();
    gloss(g, 40, 54, 36, 5, 0.4);
  },
  egg(g, c) {
    floor(g, 110, 26);
    shape(g, () => { g.moveTo(64, 28); g.bezierCurveTo(94, 28, 100, 72, 94, 88); g.bezierCurveTo(88, 108, 40, 108, 34, 88); g.bezierCurveTo(28, 72, 34, 28, 64, 28); }, lin(g, 34, 28, 94, 108, shade(c, 0.4), shade(c, -0.25)));
    gloss(g, 44, 42, 8, 24, 0.55);
  },
  fruitveg(g, c) {
    floor(g, 110, 32);
    shape(g, () => { g.moveTo(64, 44); g.bezierCurveTo(44, 30, 18, 46, 22, 76); g.bezierCurveTo(26, 100, 46, 112, 64, 104); g.bezierCurveTo(82, 112, 102, 100, 106, 76); g.bezierCurveTo(110, 46, 84, 30, 64, 44); }, lin(g, 30, 40, 100, 108, shade(c, 0.35), shade(c, -0.4)));
    shape(g, () => { g.moveTo(62, 44); g.quadraticCurveTo(62, 28, 70, 18); g.lineTo(76, 20); g.quadraticCurveTo(70, 30, 70, 44); }, '#6a4326', 4);
    shape(g, () => { g.moveTo(72, 30); g.quadraticCurveTo(92, 14, 106, 26); g.quadraticCurveTo(92, 42, 72, 30); }, lin(g, 72, 20, 106, 36, '#7ac250', '#3e8a2a'), 4);
    gloss(g, 34, 54, 10, 22, 0.45);
  },
  mushroom(g, c) {
    floor(g, 110, 30);
    shape(g, rr(g, 52, 62, 24, 42, 8), '#f0e8d4');
    shape(g, () => { g.moveTo(18, 70); g.quadraticCurveTo(20, 24, 64, 24); g.quadraticCurveTo(108, 24, 110, 70); g.closePath(); }, lin(g, 0, 24, 0, 70, shade(c, 0.3), shade(c, -0.4)));
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (const [x, y] of [[44, 46], [70, 38], [84, 54]]) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
  },
  herb(g, c) {
    floor(g, 112, 30);
    g.strokeStyle = '#3a5a2a'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(64, 108); g.quadraticCurveTo(60, 70, 64, 30); g.stroke();
    for (const [x, y, r] of [[40, 78, -0.9], [88, 70, 0.9], [44, 52, -0.7], [84, 44, 0.7], [64, 24, 0]]) {
      g.save(); g.translate(x, y); g.rotate(r);
      shape(g, () => { g.moveTo(0, 14); g.quadraticCurveTo(-18, -2, 0, -22); g.quadraticCurveTo(18, -2, 0, 14); }, lin(g, -14, 0, 14, 0, shade(c, 0.35), shade(c, -0.35)), 3);
      g.restore();
    }
  },
  seeds(g, c) {
    floor(g, 112, 36);
    shape(g, poly(g, [[34, 24], [94, 24], [98, 108], [30, 108]]), '#f4efe0');
    shape(g, rr(g, 30, 24, 68, 18, 3), c, 3);
    shape(g, () => { g.moveTo(64, 80); g.quadraticCurveTo(48, 60, 56, 50); g.quadraticCurveTo(64, 56, 64, 80); g.moveTo(64, 80); g.quadraticCurveTo(82, 60, 74, 50); g.quadraticCurveTo(64, 56, 64, 80); }, lin(g, 50, 50, 78, 80, shade(c, 0.3), shade(c, -0.3)), 3);
    g.fillStyle = INK; g.fillRect(44, 92, 40, 3); g.fillRect(48, 99, 32, 3);
  },
  cloth(g, c) {
    floor(g, 108, 40);
    for (const [y, k] of [[78, 0], [62, 0.2], [46, 0.4]] as [number, number][]) {
      shape(g, rr(g, 20, y, 88, 28, 8), lin(g, 0, y, 0, y + 28, shade(c, 0.3 - k * 0.3), shade(c, -0.3 - k * 0.2)));
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
      for (let x = 34; x < 100; x += 14) { g.beginPath(); g.moveTo(x, y + 3); g.lineTo(x, y + 25); g.stroke(); }
    }
  },
  rope(g, c) {
    floor(g, 110, 36);
    for (let i = 0; i < 3; i++) shape(g, ell(g, 64, 70, 38 - i * 6, 26 - i * 4), 'rgba(0,0,0,0)', 8);
    g.strokeStyle = c; g.lineWidth = 6;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(64, 70, 38 - i * 6, 26 - i * 4, 0, 0, Math.PI * 2); g.stroke(); }
    g.strokeStyle = shade(c, 0.4); g.lineWidth = 2;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(64, 68, 38 - i * 6, 26 - i * 4, 0, Math.PI, Math.PI * 1.6); g.stroke(); }
  },
  tape(g, c) {
    floor(g, 110, 34);
    shape(g, ell(g, 64, 70, 38, 34), body(g, c, 26, 36, 102, 104));
    shape(g, ell(g, 64, 70, 16, 14), '#d8d4c8', 4);
    gloss(g, 36, 48, 20, 6, 0.4);
  },
  plank(g, c) {
    floor(g, 108, 44);
    for (const [y, r] of [[84, -0.04], [66, 0.03], [48, -0.06]] as [number, number][]) {
      g.save(); g.translate(64, y); g.rotate(r);
      shape(g, rr(g, -50, -9, 100, 18, 3), lin(g, 0, -9, 0, 9, shade(c, 0.3), shade(c, -0.3)));
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(-44 + k * 8, -4 + k * 2); g.lineTo(20 + k * 18, -2 + k); g.stroke(); }
      g.restore();
    }
  },
  ingot(g, c) {
    floor(g, 112, 40);
    shape(g, poly(g, [[22, 90], [34, 54], [96, 54], [108, 90]]), body(g, c, 22, 54, 108, 90));
    shape(g, poly(g, [[34, 54], [46, 42], [84, 42], [96, 54]]), lin(g, 0, 42, 0, 54, shade(c, 0.5), shade(c, 0.1)), 4);
    shape(g, rr(g, 22, 90, 86, 10, 3), shade(c, -0.5), 4);
    gloss(g, 44, 62, 40, 5, 0.4);
  },
  hide(g, c) {
    floor(g, 110, 40);
    shape(g, () => { g.moveTo(30, 40); g.lineTo(52, 34); g.lineTo(64, 44); g.lineTo(78, 34); g.lineTo(100, 40); g.lineTo(96, 62); g.lineTo(108, 80); g.lineTo(90, 100); g.lineTo(64, 94); g.lineTo(38, 100); g.lineTo(20, 80); g.lineTo(32, 62); g.closePath(); }, body(g, c, 20, 34, 108, 100));
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(44, 56); g.quadraticCurveTo(64, 70, 84, 56); g.stroke();
  },
  gear(g, c) {
    floor(g, 110, 36);
    shape(g, () => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const b = a + Math.PI / 8;
        g.lineTo(64 + Math.cos(a) * 40, 68 + Math.sin(a) * 40);
        g.lineTo(64 + Math.cos(a + 0.18) * 40, 68 + Math.sin(a + 0.18) * 40);
        g.lineTo(64 + Math.cos(b) * 30, 68 + Math.sin(b) * 30);
        g.lineTo(64 + Math.cos(b + 0.18) * 30, 68 + Math.sin(b + 0.18) * 30);
      }
      g.closePath();
    }, body(g, c, 24, 28, 104, 108));
    shape(g, ell(g, 64, 68, 12, 12), '#2a2c32', 4);
    gloss(g, 40, 44, 20, 5, 0.35);
  },
  tire(g, c) {
    floor(g, 112, 40);
    shape(g, ell(g, 64, 66, 40, 40), body(g, c, 24, 26, 104, 106));
    shape(g, ell(g, 64, 66, 20, 20), '#8a8e96', 4);
    g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 3;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(64 + Math.cos(a) * 28, 66 + Math.sin(a) * 28); g.lineTo(64 + Math.cos(a) * 38, 66 + Math.sin(a) * 38); g.stroke(); }
  },
  flashlight(g, c) {
    rot(g, -0.7, () => {
      g.fillStyle = 'rgba(255,240,170,0.28)'; g.beginPath(); g.moveTo(40, -9); g.lineTo(100, -26); g.lineTo(100, 26); g.lineTo(40, 9); g.fill();
      shape(g, rr(g, -46, -10, 70, 20, 5), body(g, c, 0, -10, 0, 10));
      shape(g, poly(g, [[24, -14], [46, -20], [46, 20], [24, 14]]), lin(g, 0, -20, 0, 20, '#d8dce0', '#8a9096'));
      shape(g, ell(g, 46, 0, 5, 18), '#fff4c0', 3);
    });
  },
  lighter(g, c) {
    floor(g, 112, 26);
    shape(g, rr(g, 44, 46, 40, 62, 8), body(g, c, 44, 46, 84, 108));
    shape(g, rr(g, 44, 34, 40, 16, 4), '#c8ccd4', 3);
    shape(g, () => { g.moveTo(64, 14); g.quadraticCurveTo(76, 26, 66, 36); g.quadraticCurveTo(54, 28, 64, 14); }, lin(g, 0, 14, 0, 36, '#ffd45c', '#ff7a1c'), 3);
    gloss(g, 50, 52, 5, 48, 0.4);
  },
  candle(g, c) {
    floor(g, 112, 26);
    shape(g, rr(g, 48, 50, 32, 56, 4), body(g, c, 48, 50, 80, 106));
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(64, 50); g.lineTo(64, 42); g.stroke();
    shape(g, () => { g.moveTo(64, 14); g.quadraticCurveTo(76, 28, 64, 42); g.quadraticCurveTo(52, 28, 64, 14); }, lin(g, 0, 14, 0, 42, '#ffe070', '#ff8a2a'), 3);
    gloss(g, 52, 56, 4, 40, 0.4);
  },
  lantern(g, c) {
    floor(g, 112, 32);
    shape(g, rr(g, 38, 96, 52, 12, 4), body(g, c, 0, 96, 0, 108));
    shape(g, rr(g, 42, 40, 44, 58, 6), 'rgba(255,230,150,0.45)');
    shape(g, () => { g.moveTo(64, 56); g.quadraticCurveTo(76, 70, 64, 90); g.quadraticCurveTo(52, 70, 64, 56); }, lin(g, 0, 56, 0, 90, '#ffe070', '#ff8a2a'), 3);
    shape(g, poly(g, [[38, 40], [90, 40], [80, 26], [48, 26]]), body(g, c, 0, 26, 0, 40));
    g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.arc(64, 26, 12, Math.PI, 0); g.stroke();
  },
  battery(g, c) {
    floor(g, 112, 20);
    shape(g, rr(g, 46, 38, 36, 70, 6), lin(g, 46, 0, 82, 0, shade(c, 0.4), shade(c, -0.4)));
    shape(g, rr(g, 56, 28, 16, 12, 3), '#b8bcc4', 3);
    shape(g, rr(g, 46, 56, 36, 22, 2), '#2a2c32', 2);
    gloss(g, 50, 44, 4, 56, 0.4);
  },
  bulb(g, c) {
    floor(g, 112, 24);
    shape(g, rr(g, 50, 82, 28, 24, 4), '#aeb3bb', 3);
    shape(g, () => { g.moveTo(52, 82); g.bezierCurveTo(16, 56, 36, 14, 64, 14); g.bezierCurveTo(92, 14, 112, 56, 76, 82); g.closePath(); }, lin(g, 30, 14, 100, 82, shade(c, 0.5), shade(c, -0.1)));
    gloss(g, 44, 26, 8, 22, 0.55);
  },
  radio(g, c) {
    floor(g, 110, 42);
    shape(g, rr(g, 20, 44, 88, 58, 8), body(g, c, 20, 44, 108, 102));
    shape(g, ell(g, 46, 74, 16, 16), '#2a2c32', 4);
    shape(g, rr(g, 70, 54, 30, 14, 3), '#9ad0a8', 3);
    shape(g, ell(g, 84, 86, 6, 6), '#d8d8dc', 3);
    g.strokeStyle = INK; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(92, 44); g.lineTo(104, 14); g.stroke();
  },
  key(g, c) {
    rot(g, -0.7, () => {
      shape(g, ell(g, -22, -22, 16, 16), body(g, c, -38, -38, -6, -6));
      shape(g, ell(g, -22, -22, 6, 6), 'rgba(0,0,0,0.65)', 3);
      shape(g, rr(g, -10, -10, 70, 12, 3), body(g, c, 0, -10, 0, 2));
      shape(g, rr(g, 38, 0, 8, 14, 2), shade(c, -0.2), 3);
      shape(g, rr(g, 50, 0, 8, 10, 2), shade(c, -0.2), 3);
    });
  },
  ball(g, c) {
    floor(g, 112, 30);
    shape(g, ell(g, 64, 66, 34, 34), lin(g, 34, 34, 98, 98, shade(c, 0.5), shade(c, -0.35)));
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(64, 66, 34, 14, 0.6, 0, Math.PI * 2); g.stroke();
    gloss(g, 44, 42, 14, 6, 0.5);
  },
  trap(g, c) {
    floor(g, 112, 42);
    shape(g, rr(g, 20, 68, 88, 38, 4), body(g, c, 20, 68, 108, 106));
    shape(g, poly(g, [[28, 68], [100, 68], [86, 34], [42, 34]]), 'rgba(160,170,180,0.4)', 4);
    g.strokeStyle = INK; g.lineWidth = 3;
    for (let x = 46; x < 90; x += 10) { g.beginPath(); g.moveTo(x, 36); g.lineTo(x + (x - 64) * 0.3, 68); g.stroke(); }
  },
  tent(g, c) {
    floor(g, 112, 46);
    shape(g, poly(g, [[16, 104], [64, 24], [112, 104]]), body(g, c, 16, 24, 112, 104));
    shape(g, poly(g, [[50, 104], [64, 62], [78, 104]]), '#2a2c32', 4);
    gloss(g, 44, 54, 5, 30, 0.3);
  },
  sleeping(g, c) {
    floor(g, 110, 44);
    shape(g, rr(g, 16, 50, 96, 50, 24), body(g, c, 16, 50, 112, 100));
    shape(g, rr(g, 16, 50, 34, 50, 18), shade(c, -0.35), 4);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 3;
    for (let x = 60; x < 104; x += 14) { g.beginPath(); g.moveTo(x, 54); g.lineTo(x, 96); g.stroke(); }
    gloss(g, 26, 56, 5, 28, 0.3);
  },
};

const cache = new Map<string, string>();
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/** Zeichnet das Icon `kind` in Grundfarbe `color` auf ein 128×128-Canvas und gibt die data-URL zurück. */
export function pzIconFor(kind: IconKind, color: string): string {
  const key = `${kind}|${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return BLANK;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  (P[kind] ?? P.box)(g, color);
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/** Alle Icon-Motive (für Tests/Vorschau) */
export const ICON_KINDS = Object.keys(P) as IconKind[];
