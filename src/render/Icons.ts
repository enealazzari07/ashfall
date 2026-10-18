/**
 * Gemalte Item-Icons im Stil klassischer Survival-Spiele: kräftige dunkle Kontur,
 * weiche Verläufe, Glanzlichter und ein kleiner Bodenschatten. Alles wird zur Laufzeit gezeichnet und gecacht.
 */
import { pzIconURL } from '../pz';

type G = CanvasRenderingContext2D;

const INK = '#17130f';
const S = 128;

function lin(g: G, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}

/** Füllen + Kontur */
function shape(g: G, path: () => void, fill: string | CanvasGradient, lw = 5): void {
  g.beginPath();
  path();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = lw;
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.stroke();
}

const rr = (g: G, x: number, y: number, w: number, h: number, r: number) => () => g.roundRect(x, y, w, h, r);
const ell = (g: G, x: number, y: number, rx: number, ry: number) => () => g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);

function floorShadow(g: G, x = 64, y = 112, rx = 38, ry = 8): void {
  g.fillStyle = 'rgba(0,0,0,0.38)';
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

function gloss(g: G, x: number, y: number, w: number, h: number, a = 0.5): void {
  g.fillStyle = `rgba(255,255,255,${a})`;
  g.beginPath();
  g.roundRect(x, y, w, h, Math.min(w, h) / 2);
  g.fill();
}

function poly(g: G, pts: number[][]): () => void {
  return () => {
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  };
}

const DRAW: Record<string, (g: G) => void> = {
  coin(g) {
    floorShadow(g, 64, 100, 34, 8);
    shape(g, ell(g, 64, 66, 36, 36), lin(g, 30, 30, 98, 100, [[0, '#fff0a0'], [0.5, '#e8b33a'], [1, '#a8731a']]));
    shape(g, ell(g, 64, 66, 26, 26), lin(g, 40, 40, 90, 92, [[0, '#f4c84a'], [1, '#c58a22']]), 3);
    g.fillStyle = '#8a5a12';
    g.font = 'bold 30px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('$', 64, 68);
    gloss(g, 40, 40, 20, 8, 0.55);
  },
  water(g) {
    floorShadow(g);
    shape(g, rr(g, 40, 38, 48, 74, 14), lin(g, 40, 0, 88, 0, [[0, 'rgba(190,225,250,0.95)'], [0.5, 'rgba(120,180,235,0.95)'], [1, 'rgba(70,130,200,0.95)']]));
    shape(g, poly(g, [[48, 38], [80, 38], [74, 22], [54, 22]]), 'rgba(170,215,245,0.95)');
    shape(g, rr(g, 52, 8, 24, 16, 4), lin(g, 0, 8, 0, 24, [[0, '#ee5a4a'], [1, '#b02a22']]));
    shape(g, rr(g, 44, 66, 40, 22, 4), 'rgba(250,250,245,0.92)', 3);
    g.fillStyle = '#3a8ad0';
    g.fillRect(48, 74, 32, 5);
    gloss(g, 47, 44, 7, 52, 0.55);
  },
  bottle(g) {
    floorShadow(g);
    shape(g, rr(g, 40, 38, 48, 74, 14), lin(g, 40, 0, 88, 0, [[0, 'rgba(240,248,255,0.55)'], [0.5, 'rgba(210,225,240,0.4)'], [1, 'rgba(170,190,210,0.55)']]));
    shape(g, poly(g, [[48, 38], [80, 38], [74, 22], [54, 22]]), 'rgba(225,235,245,0.6)');
    shape(g, rr(g, 52, 8, 24, 16, 4), lin(g, 0, 8, 0, 24, [[0, '#ee5a4a'], [1, '#b02a22']]));
    gloss(g, 47, 44, 7, 52, 0.6);
  },
  coffee(g) {
    floorShadow(g);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 4;
    g.lineCap = 'round';
    for (const x of [52, 66, 80]) {
      g.beginPath();
      g.moveTo(x, 34);
      g.bezierCurveTo(x - 8, 26, x + 8, 20, x, 10);
      g.stroke();
    }
    shape(g, poly(g, [[34, 44], [94, 44], [86, 108], [42, 108]]), lin(g, 34, 0, 94, 0, [[0, '#fbf8f0'], [1, '#d6d0c0']]));
    shape(g, poly(g, [[38, 64], [90, 64], [88, 88], [40, 88]]), lin(g, 0, 64, 0, 88, [[0, '#a8683a'], [1, '#7a4422']]), 4);
    shape(g, rr(g, 30, 34, 68, 14, 5), lin(g, 0, 34, 0, 48, [[0, '#4a3a30'], [1, '#2a2018']]));
    gloss(g, 44, 52, 5, 10, 0.5);
  },
  beans(g) {
    floorShadow(g);
    shape(g, rr(g, 32, 38, 64, 72, 8), lin(g, 32, 0, 96, 0, [[0, '#7fc6c4'], [0.5, '#2f9a9a'], [1, '#1d6a70']]));
    shape(g, ell(g, 64, 40, 32, 9), lin(g, 32, 30, 96, 50, [[0, '#f2f4f4'], [1, '#aeb6ba']]));
    shape(g, rr(g, 32, 56, 64, 38, 2), lin(g, 0, 56, 0, 94, [[0, '#f4efe0'], [1, '#d8cfb4']]), 3);
    g.fillStyle = '#b6481e';
    for (const [x, y] of [[48, 68], [58, 74], [70, 66], [80, 74], [64, 82], [52, 84], [76, 84]]) {
      g.beginPath();
      g.ellipse(x, y, 5, 3.4, 0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#c84a2a';
    g.fillRect(32, 54, 64, 5);
    gloss(g, 38, 60, 6, 40, 0.35);
  },
  bread(g) {
    floorShadow(g, 64, 108, 44, 9);
    shape(g, () => {
      g.moveTo(22, 82);
      g.bezierCurveTo(14, 54, 38, 38, 64, 38);
      g.bezierCurveTo(92, 38, 114, 54, 106, 82);
      g.bezierCurveTo(104, 98, 90, 104, 64, 104);
      g.bezierCurveTo(38, 104, 24, 98, 22, 82);
    }, lin(g, 0, 38, 0, 104, [[0, '#e8aa5a'], [0.6, '#c27832'], [1, '#8a4c1e']]));
    g.strokeStyle = '#8a4a1a';
    g.lineWidth = 4;
    g.lineCap = 'round';
    for (const x of [42, 62, 82]) {
      g.beginPath();
      g.moveTo(x - 8, 68);
      g.quadraticCurveTo(x, 54, x + 8, 50);
      g.stroke();
    }
    gloss(g, 36, 50, 24, 7, 0.4);
  },
  apple(g) {
    floorShadow(g, 64, 108, 32, 8);
    shape(g, () => {
      g.moveTo(64, 44);
      g.bezierCurveTo(44, 30, 18, 46, 22, 76);
      g.bezierCurveTo(26, 100, 46, 112, 64, 104);
      g.bezierCurveTo(82, 112, 102, 100, 106, 76);
      g.bezierCurveTo(110, 46, 84, 30, 64, 44);
    }, lin(g, 30, 40, 100, 108, [[0, '#f0614a'], [0.5, '#c8281e'], [1, '#8a1410']]));
    shape(g, () => { g.moveTo(62, 44); g.quadraticCurveTo(62, 28, 70, 18); g.lineTo(76, 20); g.quadraticCurveTo(70, 30, 70, 44); }, '#6a4326', 4);
    shape(g, () => { g.moveTo(72, 30); g.quadraticCurveTo(92, 14, 106, 26); g.quadraticCurveTo(92, 42, 72, 30); }, lin(g, 72, 20, 106, 36, [[0, '#7ac250'], [1, '#3e8a2a']]), 4);
    gloss(g, 34, 54, 10, 22, 0.45);
  },
  bar(g) {
    floorShadow(g, 64, 106, 42, 8);
    g.save();
    g.translate(64, 70);
    g.rotate(-0.35);
    shape(g, rr(g, -44, -20, 88, 40, 6), lin(g, 0, -20, 0, 20, [[0, '#7a4a2a'], [1, '#3a2012']]));
    shape(g, rr(g, -44, -20, 54, 40, 6), lin(g, 0, -20, 0, 20, [[0, '#f0a63a'], [1, '#c4561e']]));
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.font = 'bold 15px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('POWER', -17, 0);
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 2;
    for (let x = 14; x < 44; x += 10) { g.beginPath(); g.moveTo(x, -18); g.lineTo(x, 18); g.stroke(); }
    gloss(g, -38, -16, 40, 6, 0.4);
    g.restore();
  },
  sandwich(g) {
    floorShadow(g, 64, 108, 44, 9);
    shape(g, () => { g.moveTo(20, 84); g.quadraticCurveTo(20, 100, 40, 100); g.lineTo(88, 100); g.quadraticCurveTo(108, 100, 108, 84); g.lineTo(108, 78); g.lineTo(20, 78); }, lin(g, 0, 78, 0, 100, [[0, '#d9a45a'], [1, '#a8702e']]));
    shape(g, rr(g, 18, 68, 92, 12, 6), '#6fae3a', 4);
    shape(g, rr(g, 20, 58, 88, 12, 6), '#e86a4a', 4);
    shape(g, rr(g, 22, 52, 84, 10, 5), '#e8c84a', 4);
    shape(g, () => { g.moveTo(20, 54); g.quadraticCurveTo(22, 26, 64, 26); g.quadraticCurveTo(106, 26, 108, 54); }, lin(g, 0, 26, 0, 54, [[0, '#e8b866'], [1, '#c68a40']]));
    g.fillStyle = '#f6e8c0';
    for (const [x, y] of [[48, 38], [62, 34], [78, 38], [70, 44], [54, 46]]) g.fillRect(x, y, 5, 3);
    gloss(g, 34, 32, 22, 6, 0.4);
  },
  corn(g) {
    floorShadow(g, 64, 108, 36, 8);
    g.save();
    g.translate(64, 66);
    g.rotate(-0.45);
    shape(g, () => { g.moveTo(-8, 52); g.quadraticCurveTo(-26, 30, -22, -6); g.quadraticCurveTo(-18, -44, 0, -52); g.quadraticCurveTo(18, -44, 22, -6); g.quadraticCurveTo(26, 30, 8, 52); g.closePath(); },
      lin(g, -24, 0, 24, 0, [[0, '#f2d24a'], [0.5, '#f8e070'], [1, '#d8a824']]));
    g.strokeStyle = 'rgba(150,100,10,0.55)';
    g.lineWidth = 1.6;
    for (let y = -40; y < 46; y += 9) { g.beginPath(); g.moveTo(-22, y); g.lineTo(22, y); g.stroke(); }
    for (let x = -14; x < 18; x += 9) { g.beginPath(); g.moveTo(x, -48); g.lineTo(x * 1.1, 50); g.stroke(); }
    shape(g, () => { g.moveTo(-6, 60); g.quadraticCurveTo(-46, 30, -38, -14); g.quadraticCurveTo(-24, 14, -4, 34); g.closePath(); }, lin(g, -40, 0, 0, 40, [[0, '#7fc257'], [1, '#3e8a2e']]), 4);
    shape(g, () => { g.moveTo(6, 60); g.quadraticCurveTo(46, 30, 38, -14); g.quadraticCurveTo(24, 14, 4, 34); g.closePath(); }, lin(g, 40, 0, 0, 40, [[0, '#6fb44c'], [1, '#2f7a28']]), 4);
    g.restore();
    gloss(g, 56, 30, 8, 30, 0.35);
  },
  bandage(g) {
    floorShadow(g, 64, 106, 36, 8);
    shape(g, poly(g, [[70, 78], [112, 96], [104, 106], [60, 90]]), '#f4efe6', 4);
    shape(g, rr(g, 20, 42, 64, 56, 10), lin(g, 20, 0, 84, 0, [[0, '#ffffff'], [1, '#d8d2c6']]));
    shape(g, ell(g, 52, 42, 32, 12), '#fcfaf4');
    shape(g, ell(g, 52, 42, 12, 5), '#bdb6a8', 3);
    g.fillStyle = '#d83a30';
    g.fillRect(46, 62, 12, 28);
    g.fillRect(38, 70, 28, 12);
    gloss(g, 26, 52, 5, 36, 0.6);
  },
  battery(g) {
    floorShadow(g, 64, 108, 40, 7);
    shape(g, rr(g, 24, 50, 80, 52, 6), lin(g, 0, 50, 0, 102, [[0, '#4a5560'], [1, '#262d34']]));
    shape(g, rr(g, 34, 38, 14, 14, 3), '#b8bcc4', 3);
    shape(g, rr(g, 80, 38, 14, 14, 3), '#b8bcc4', 3);
    g.fillStyle = '#d83a30';
    g.fillRect(37, 42, 8, 3);
    g.fillStyle = '#17130f';
    g.fillRect(83, 44, 8, 3);
    g.fillStyle = '#e8c840';
    g.fillRect(34, 66, 60, 12);
    gloss(g, 28, 54, 70, 4, 0.35);
  },
  flatbattery(g) {
    floorShadow(g, 64, 108, 40, 7);
    shape(g, rr(g, 24, 50, 80, 52, 6), lin(g, 0, 50, 0, 102, [[0, '#6a6e72'], [1, '#3a3d40']]));
    shape(g, rr(g, 34, 38, 14, 14, 3), '#8a8e94', 3);
    shape(g, rr(g, 80, 38, 14, 14, 3), '#8a8e94', 3);
    g.strokeStyle = '#d83a30';
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(48, 64); g.lineTo(80, 90); g.moveTo(80, 64); g.lineTo(48, 90); g.stroke();
  },
  gascan(g) {
    floorShadow(g, 64, 112, 38, 7);
    shape(g, rr(g, 32, 36, 64, 72, 8), lin(g, 32, 0, 96, 0, [[0, '#e0483a'], [0.5, '#c0352a'], [1, '#8a2018']]));
    shape(g, rr(g, 40, 22, 30, 18, 5), '#b82e24', 4);
    shape(g, rr(g, 76, 24, 14, 14, 4), '#2a2a2e', 3);
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 3;
    g.strokeRect(42, 52, 44, 44);
    g.beginPath(); g.moveTo(42, 74); g.lineTo(86, 74); g.stroke();
    gloss(g, 36, 44, 5, 56, 0.45);
  },
  emptycan(g) {
    floorShadow(g, 64, 112, 38, 7);
    shape(g, rr(g, 32, 36, 64, 72, 8), lin(g, 32, 0, 96, 0, [[0, '#a8605a'], [0.5, '#8a4a44'], [1, '#5e302c']]));
    shape(g, rr(g, 40, 22, 30, 18, 5), '#7a403a', 4);
    shape(g, rr(g, 76, 24, 14, 14, 4), '#2a2a2e', 3);
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 3;
    g.strokeRect(42, 52, 44, 44);
  },
  enginepart(g) {
    floorShadow(g, 64, 110, 40, 7);
    shape(g, rr(g, 34, 64, 60, 38, 6), lin(g, 0, 64, 0, 102, [[0, '#9aa0a8'], [1, '#5a6068']]));
    for (const x of [44, 64, 84]) shape(g, rr(g, x - 7, 34, 14, 34, 4), lin(g, 0, 34, 0, 68, [[0, '#d0d4da'], [1, '#8a9098']]), 4);
    shape(g, ell(g, 64, 86, 14, 14), '#3a3f46', 4);
    gloss(g, 38, 68, 52, 4, 0.4);
  },
  toolbox(g) {
    floorShadow(g, 64, 108, 44, 7);
    shape(g, rr(g, 20, 54, 88, 50, 6), lin(g, 0, 54, 0, 104, [[0, '#d8483a'], [1, '#8e2a22']]));
    shape(g, rr(g, 20, 54, 88, 14, 4), '#b8382e', 4);
    shape(g, rr(g, 44, 34, 40, 22, 8), 'rgba(0,0,0,0)', 6);
    shape(g, rr(g, 58, 66, 12, 12, 3), '#d8d8dc', 3);
    gloss(g, 26, 58, 76, 4, 0.4);
  },
  disinfectant(g) {
    floorShadow(g, 64, 112, 34, 7);
    shape(g, rr(g, 44, 46, 40, 66, 10), lin(g, 44, 0, 84, 0, [[0, '#f2f6fa'], [0.5, '#cfe0ee'], [1, '#9db6cc']]));
    shape(g, rr(g, 54, 30, 20, 20, 4), '#2f7fb8', 4);
    shape(g, rr(g, 58, 18, 12, 14, 3), '#d8dde2', 3);
    shape(g, rr(g, 48, 66, 32, 28, 3), '#ffffff', 2);
    g.fillStyle = '#d83a30';
    g.fillRect(61, 70, 6, 20);
    g.fillRect(54, 77, 20, 6);
    gloss(g, 50, 52, 5, 54, 0.55);
  },
  suture(g) {
    floorShadow(g, 64, 108, 40, 7);
    shape(g, rr(g, 22, 56, 84, 44, 8), lin(g, 0, 56, 0, 100, [[0, '#3f6a4a'], [1, '#243f2c']]));
    shape(g, rr(g, 30, 64, 68, 8, 3), '#e8e2cf', 3);
    g.strokeStyle = '#d8d8dc';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(36, 88); g.bezierCurveTo(54, 70, 70, 100, 96, 82); g.stroke();
    g.strokeStyle = '#17130f';
    g.lineWidth = 1.5;
    g.stroke();
    shape(g, poly(g, [[88, 30], [92, 30], [92, 56], [90, 62], [88, 56]]), '#c9ced4', 3);
    g.fillStyle = '#17130f';
    g.beginPath(); g.ellipse(90, 36, 1.6, 4, 0, 0, Math.PI * 2); g.fill();
    gloss(g, 28, 60, 40, 4, 0.35);
  },
  splint(g) {
    floorShadow(g, 64, 108, 44, 7);
    g.save();
    g.translate(64, 66);
    g.rotate(-0.5);
    shape(g, rr(g, -50, -12, 100, 24, 6), lin(g, 0, -12, 0, 12, [[0, '#c89a5e'], [1, '#8a6034']]));
    shape(g, rr(g, -40, -4, 80, 8, 3), '#6a4824', 2);
    for (const x of [-26, 0, 26]) shape(g, rr(g, x - 8, -18, 16, 36, 4), lin(g, 0, -18, 0, 18, [[0, '#f4efe6'], [1, '#cfc8b8']]), 3);
    g.restore();
  },
  cloth(g) {
    floorShadow(g, 64, 106, 42, 8);
    for (const [y, c1, c2] of [[78, '#c8b890', '#a89870'], [62, '#9ab0c8', '#6a8aaa'], [46, '#c89a8a', '#a8705e']] as const) {
      shape(g, rr(g, 20, y, 88, 28, 8), lin(g, 0, y, 0, y + 28, [[0, c1], [1, c2]]));
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      g.lineWidth = 2;
      for (let x = 34; x < 100; x += 14) { g.beginPath(); g.moveTo(x, y + 3); g.lineTo(x, y + 25); g.stroke(); }
    }
    gloss(g, 28, 50, 30, 5, 0.35);
  },
  wood(g) {
    floorShadow(g, 64, 108, 46, 8);
    for (const [y, rot] of [[84, -0.04], [66, 0.03], [48, -0.06]] as const) {
      g.save();
      g.translate(64, y);
      g.rotate(rot);
      shape(g, rr(g, -50, -9, 100, 18, 3), lin(g, 0, -9, 0, 9, [[0, '#c89a62'], [1, '#8a5e30']]));
      g.strokeStyle = 'rgba(70,40,15,0.45)';
      g.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(-44 + k * 8, -4 + k * 2); g.lineTo(20 + k * 18, -2 + k); g.stroke(); }
      g.fillStyle = '#6a4220';
      g.fillRect(-42, -2, 3, 3);
      g.fillRect(38, 0, 3, 3);
      g.restore();
    }
  },
  schoolbag(g) {
    floorShadow(g);
    shape(g, () => { g.moveTo(40, 36); g.quadraticCurveTo(64, 14, 88, 36); g.lineTo(90, 36); }, 'rgba(0,0,0,0)', 7);
    shape(g, rr(g, 30, 30, 68, 82, 18), lin(g, 30, 0, 98, 0, [[0, '#4a82c8'], [0.5, '#2f60a8'], [1, '#1c3f78']]));
    shape(g, rr(g, 40, 70, 48, 34, 10), lin(g, 0, 70, 0, 104, [[0, '#3a70b8'], [1, '#234c8a']]), 4);
    g.strokeStyle = '#d8dce2';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(44, 84); g.lineTo(84, 84); g.stroke();
    shape(g, rr(g, 54, 14, 20, 14, 7), '#2a2e36', 4);
    shape(g, rr(g, 48, 40, 32, 16, 6), '#e8b23a', 4);
    gloss(g, 36, 40, 7, 40, 0.3);
  },
  hikingpack(g) {
    floorShadow(g);
    shape(g, rr(g, 26, 16, 76, 22, 11), lin(g, 0, 16, 0, 38, [[0, '#6a7a52'], [1, '#3e4a2e']]));
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 2;
    for (let x = 36; x < 96; x += 10) { g.beginPath(); g.moveTo(x, 18); g.lineTo(x, 36); g.stroke(); }
    shape(g, rr(g, 30, 34, 68, 80, 14), lin(g, 30, 0, 98, 0, [[0, '#a8864e'], [0.5, '#7a5a30'], [1, '#4a3418']]));
    shape(g, rr(g, 38, 72, 52, 34, 8), lin(g, 0, 72, 0, 106, [[0, '#8a6a3c'], [1, '#5a4020']]), 4);
    shape(g, rr(g, 14, 56, 18, 40, 7), '#5a4020', 4);
    shape(g, rr(g, 96, 56, 18, 40, 7), '#5a4020', 4);
    for (const y of [48, 62]) { shape(g, rr(g, 28, y, 72, 6, 2), '#2a2218', 3); }
    shape(g, rr(g, 58, 60, 12, 12, 3), '#c8ccd0', 3);
    gloss(g, 36, 44, 7, 58, 0.25);
  },
  jacket(g) {
    floorShadow(g, 64, 112, 40, 8);
    shape(g, () => {
      g.moveTo(40, 30); g.lineTo(88, 30); g.lineTo(112, 52); g.lineTo(102, 94); g.lineTo(90, 90);
      g.lineTo(90, 110); g.lineTo(38, 110); g.lineTo(38, 90); g.lineTo(26, 94); g.lineTo(16, 52);
    }, lin(g, 16, 30, 112, 110, [[0, '#6a7a4a'], [0.5, '#4a5a34'], [1, '#2e3a20']]));
    shape(g, () => { g.moveTo(44, 30); g.quadraticCurveTo(64, 56, 84, 30); g.lineTo(78, 22); g.quadraticCurveTo(64, 14, 50, 22); }, '#3a4628', 4);
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(64, 48); g.lineTo(64, 110); g.stroke();
    shape(g, rr(g, 42, 80, 18, 18, 3), '#3e4a2a', 3);
    shape(g, rr(g, 68, 80, 18, 18, 3), '#3e4a2a', 3);
    gloss(g, 26, 52, 6, 28, 0.2);
  },
  hoodie(g) {
    floorShadow(g, 64, 112, 40, 8);
    shape(g, () => {
      g.moveTo(42, 32); g.lineTo(86, 32); g.lineTo(112, 56); g.lineTo(100, 96); g.lineTo(90, 92);
      g.lineTo(90, 108); g.lineTo(38, 108); g.lineTo(38, 92); g.lineTo(28, 96); g.lineTo(16, 56);
    }, lin(g, 16, 30, 112, 108, [[0, '#8a9098'], [0.5, '#656b74'], [1, '#42474f']]));
    shape(g, () => { g.moveTo(42, 32); g.quadraticCurveTo(64, 62, 86, 32); g.quadraticCurveTo(64, 10, 42, 32); }, '#54595f', 4);
    shape(g, () => { g.moveTo(44, 84); g.lineTo(84, 84); g.lineTo(88, 100); g.lineTo(40, 100); }, '#585d65', 3);
    g.strokeStyle = '#e8e8e8';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(56, 44); g.lineTo(56, 64); g.moveTo(72, 44); g.lineTo(72, 64); g.stroke();
    gloss(g, 26, 56, 6, 24, 0.2);
  },
  dress(g) {
    floorShadow(g, 64, 114, 38, 7);
    shape(g, () => {
      g.moveTo(48, 14); g.lineTo(56, 14); g.quadraticCurveTo(64, 28, 72, 14); g.lineTo(80, 14);
      g.lineTo(78, 46); g.lineTo(104, 112); g.quadraticCurveTo(64, 120, 24, 112); g.lineTo(50, 46);
    }, lin(g, 24, 14, 104, 118, [[0, '#d98aa8'], [0.5, '#b8617f'], [1, '#8a3f5a']]));
    shape(g, rr(g, 50, 42, 28, 6, 2), '#6e2e46', 3);
    gloss(g, 54, 20, 5, 22, 0.2);
  },
  beanie(g) {
    floorShadow(g, 64, 104, 38, 8);
    shape(g, () => { g.moveTo(26, 82); g.quadraticCurveTo(24, 30, 64, 28); g.quadraticCurveTo(104, 30, 102, 82); }, lin(g, 0, 28, 0, 82, [[0, '#d8543e'], [1, '#9a2a22']]));
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = 3;
    for (let x = 38; x < 100; x += 10) { g.beginPath(); g.moveTo(x, 80); g.quadraticCurveTo(x + (64 - x) * 0.3, 46, x + (64 - x) * 0.6, 30); g.stroke(); }
    shape(g, rr(g, 22, 76, 84, 26, 10), lin(g, 0, 76, 0, 102, [[0, '#c8402e'], [1, '#8a2018']]));
    shape(g, ell(g, 64, 26, 11, 9), '#f0e8d8', 4);
    gloss(g, 42, 40, 8, 22, 0.3);
  },
  flashlight(g) {
    floorShadow(g, 64, 108, 40, 7);
    g.save();
    g.translate(64, 64);
    g.rotate(-0.7);
    g.fillStyle = 'rgba(255,240,170,0.28)';
    g.beginPath(); g.moveTo(40, -9); g.lineTo(100, -26); g.lineTo(100, 26); g.lineTo(40, 9); g.fill();
    shape(g, rr(g, -46, -10, 70, 20, 5), lin(g, 0, -10, 0, 10, [[0, '#5a5e66'], [0.5, '#2c2f35'], [1, '#14161a']]));
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.lineWidth = 2;
    for (let x = -38; x < 16; x += 6) { g.beginPath(); g.moveTo(x, -8); g.lineTo(x, 8); g.stroke(); }
    shape(g, poly(g, [[24, -14], [46, -20], [46, 20], [24, 14]]), lin(g, 0, -20, 0, 20, [[0, '#d8dce0'], [1, '#8a9096']]));
    shape(g, ell(g, 46, 0, 5, 18), '#fff4c0', 3);
    shape(g, rr(g, -12, -14, 14, 6, 2), '#e8a030', 3);
    g.restore();
  },
  jeans(g) {
    floorShadow(g, 64, 114, 36, 7);
    shape(g, () => {
      g.moveTo(36, 16); g.lineTo(92, 16); g.lineTo(98, 112); g.lineTo(72, 112); g.lineTo(64, 56);
      g.lineTo(56, 112); g.lineTo(30, 112);
    }, lin(g, 30, 16, 98, 112, [[0, '#4a72a8'], [0.5, '#34568a'], [1, '#22385c']]));
    shape(g, rr(g, 36, 12, 56, 12, 3), '#2a4670', 4);
    g.strokeStyle = '#e8c26a';
    g.lineWidth = 2;
    g.setLineDash([4, 3]);
    g.beginPath(); g.moveTo(64, 26); g.lineTo(64, 56); g.moveTo(40, 30); g.lineTo(36, 110); g.moveTo(88, 30); g.lineTo(92, 110); g.stroke();
    g.setLineDash([]);
    shape(g, rr(g, 62, 14, 5, 8, 1), '#d8d8d8', 2);
    gloss(g, 40, 40, 5, 40, 0.18);
  },
  boots(g) {
    floorShadow(g, 64, 112, 44, 8);
    for (const [x, c] of [[26, 0], [64, 1]] as const) {
      shape(g, () => {
        g.moveTo(x, 20); g.lineTo(x + 28, 20); g.lineTo(x + 30, 78); g.quadraticCurveTo(x + 52, 82, x + 54, 100);
        g.lineTo(x + 54, 108); g.lineTo(x - 6, 108); g.lineTo(x - 6, 84);
      }, lin(g, x, 20, x + 50, 108, c ? [[0, '#8a5a30'], [1, '#52341a']] : [[0, '#946034'], [1, '#583a1e']]));
      shape(g, rr(g, x - 8, 100, 64, 12, 4), '#1e1a16', 4);
      g.strokeStyle = '#e8d8b0';
      g.lineWidth = 2;
      for (let y = 34; y < 74; y += 10) { g.beginPath(); g.moveTo(x + 8, y); g.lineTo(x + 22, y); g.stroke(); }
    }
  },
  machete(g) {
    floorShadow(g, 64, 112, 40, 7);
    g.save();
    g.translate(64, 64);
    g.rotate(-0.78);
    shape(g, poly(g, [[-8, -52], [8, -52], [10, 30], [-4, 40], [-8, 30]]), lin(g, -8, 0, 12, 0, [[0, '#e8ecf0'], [1, '#8a9096']]));
    shape(g, rr(g, -10, 34, 20, 8, 2), '#4a3a22', 3);
    shape(g, rr(g, -8, 40, 16, 34, 5), lin(g, -8, 0, 8, 0, [[0, '#3a2c1a'], [1, '#1a120a']]));
    g.restore();
  },
  crowbar(g) {
    floorShadow(g, 64, 112, 40, 7);
    g.save();
    g.translate(64, 64);
    g.rotate(-0.7);
    shape(g, rr(g, -5, -50, 10, 100, 4), lin(g, -5, 0, 5, 0, [[0, '#6a6e76'], [1, '#2a2c32']]));
    shape(g, () => { g.moveTo(-5, -50); g.quadraticCurveTo(-24, -52, -26, -34); g.lineTo(-18, -30); g.quadraticCurveTo(-16, -40, -5, -40); }, '#4a4e56', 4);
    shape(g, poly(g, [[-5, 44], [5, 44], [8, 56], [-8, 56]]), '#3a3d44', 3);
    g.restore();
  },
  sweater(g) {
    floorShadow(g, 64, 112, 40, 8);
    shape(g, () => {
      g.moveTo(44, 28); g.quadraticCurveTo(64, 40, 84, 28); g.lineTo(112, 58); g.lineTo(100, 96); g.lineTo(90, 90);
      g.lineTo(90, 108); g.lineTo(38, 108); g.lineTo(38, 90); g.lineTo(28, 96); g.lineTo(16, 58);
    }, lin(g, 16, 28, 112, 108, [[0, '#8f8a78'], [0.5, '#6e6a5a'], [1, '#4a4638']]));
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 2;
    for (let x = 44; x < 90; x += 6) { g.beginPath(); g.moveTo(x, 50); g.lineTo(x, 104); g.stroke(); }
    shape(g, rr(g, 38, 100, 52, 8, 3), '#5a5648', 3);
    shape(g, ell(g, 64, 30, 18, 7), '#58543f', 4);
    gloss(g, 26, 58, 6, 24, 0.2);
  },
  plaid_jacket(g) {
    floorShadow(g, 64, 112, 40, 8);
    shape(g, () => {
      g.moveTo(44, 24); g.lineTo(84, 24); g.lineTo(112, 54); g.lineTo(100, 96); g.lineTo(90, 90);
      g.lineTo(90, 108); g.lineTo(38, 108); g.lineTo(38, 90); g.lineTo(28, 96); g.lineTo(16, 54);
    }, lin(g, 16, 24, 112, 108, [[0, '#b8402e'], [1, '#7a2418']]));
    g.save();
    g.beginPath();
    g.moveTo(44, 24); g.lineTo(84, 24); g.lineTo(112, 54); g.lineTo(100, 96); g.lineTo(90, 90);
    g.lineTo(90, 108); g.lineTo(38, 108); g.lineTo(38, 90); g.lineTo(28, 96); g.lineTo(16, 54);
    g.clip();
    g.strokeStyle = 'rgba(20,16,12,0.55)';
    g.lineWidth = 5;
    for (let k = 10; k < 120; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 128); g.moveTo(0, k); g.lineTo(128, k); g.stroke(); }
    g.strokeStyle = 'rgba(240,230,200,0.35)';
    g.lineWidth = 2;
    for (let k = 18; k < 120; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 128); g.moveTo(0, k); g.lineTo(128, k); g.stroke(); }
    g.restore();
    shape(g, poly(g, [[44, 24], [64, 50], [84, 24], [74, 20], [64, 30], [54, 20]]), '#8a2a1e', 3);
    g.fillStyle = '#e8e0cc';
    for (const y of [60, 78, 96]) { g.beginPath(); g.arc(64, y, 3, 0, Math.PI * 2); g.fill(); }
  },
  shirt_tie(g) {
    floorShadow(g, 64, 112, 38, 8);
    shape(g, () => {
      g.moveTo(44, 22); g.lineTo(84, 22); g.lineTo(110, 48); g.lineTo(98, 66); g.lineTo(88, 60);
      g.lineTo(88, 108); g.lineTo(40, 108); g.lineTo(40, 60); g.lineTo(30, 66); g.lineTo(18, 48);
    }, lin(g, 18, 22, 110, 108, [[0, '#fbfaf5'], [1, '#cfccc0']]));
    shape(g, poly(g, [[44, 22], [64, 46], [52, 24]]), '#ffffff', 3);
    shape(g, poly(g, [[84, 22], [64, 46], [76, 24]]), '#ffffff', 3);
    shape(g, poly(g, [[60, 46], [68, 46], [72, 96], [64, 102], [56, 96]]), '#8a1f24', 3);
    gloss(g, 28, 44, 5, 16, 0.3);
  },
  tac_vest(g) {
    floorShadow(g, 64, 112, 38, 8);
    shape(g, () => {
      g.moveTo(38, 16); g.lineTo(54, 16); g.quadraticCurveTo(64, 34, 74, 16); g.lineTo(90, 16);
      g.lineTo(96, 40); g.lineTo(92, 104); g.lineTo(36, 104); g.lineTo(32, 40);
    }, lin(g, 32, 16, 96, 104, [[0, '#59604c'], [1, '#33382c']]));
    shape(g, rr(g, 38, 58, 22, 22, 3), '#3e4434', 3);
    shape(g, rr(g, 68, 58, 22, 22, 3), '#3e4434', 3);
    shape(g, rr(g, 36, 88, 56, 8, 2), '#1d1f1a', 3);
    gloss(g, 40, 22, 5, 30, 0.15);
  },
  cargo_pants(g) {
    floorShadow(g, 64, 114, 36, 7);
    shape(g, () => {
      g.moveTo(36, 16); g.lineTo(92, 16); g.lineTo(98, 112); g.lineTo(72, 112); g.lineTo(64, 56);
      g.lineTo(56, 112); g.lineTo(30, 112);
    }, lin(g, 30, 16, 98, 112, [[0, '#5a6048'], [0.5, '#434836'], [1, '#2c3024']]));
    shape(g, rr(g, 36, 12, 56, 12, 3), '#32362a', 4);
    shape(g, rr(g, 34, 66, 20, 14, 4), '#1f211a', 3);
    shape(g, rr(g, 74, 66, 20, 14, 4), '#1f211a', 3);
    gloss(g, 40, 40, 5, 20, 0.15);
  },
  tac_boots(g) {
    floorShadow(g, 64, 112, 44, 8);
    for (const x of [26, 64]) {
      shape(g, () => {
        g.moveTo(x, 16); g.lineTo(x + 28, 16); g.lineTo(x + 30, 78); g.quadraticCurveTo(x + 52, 82, x + 54, 100);
        g.lineTo(x + 54, 108); g.lineTo(x - 6, 108); g.lineTo(x - 6, 84);
      }, lin(g, x, 16, x + 50, 108, [[0, '#3a3a3e'], [1, '#17171a']]));
      shape(g, rr(g, x - 8, 100, 64, 12, 4), '#0c0c0e', 4);
      g.strokeStyle = '#8a8a90';
      g.lineWidth = 2;
      for (let y = 30; y < 74; y += 9) { g.beginPath(); g.moveTo(x + 8, y); g.lineTo(x + 22, y); g.stroke(); }
    }
  },
  cap(g) {
    floorShadow(g, 64, 104, 40, 8);
    shape(g, () => { g.moveTo(28, 78); g.quadraticCurveTo(26, 30, 66, 28); g.quadraticCurveTo(100, 30, 100, 78); }, lin(g, 0, 28, 0, 82, [[0, '#4a5a44'], [1, '#2e382a']]));
    shape(g, () => { g.moveTo(24, 78); g.quadraticCurveTo(70, 70, 110, 84); g.quadraticCurveTo(80, 100, 24, 90); }, '#262e22', 4);
    shape(g, ell(g, 64, 28, 6, 5), '#2e382a', 3);
    gloss(g, 44, 40, 8, 20, 0.22);
  },
};

/** Jacken-Icons: gleiche Schnittform, eigene Farbe, Kragen und Verschluss */
function jacketIcon(top: string, bottom: string, collar: string, zip: string, stitch?: string): (g: G) => void {
  return (g) => {
    floorShadow(g, 64, 112, 40, 8);
    const body = (): void => {
      g.moveTo(44, 24); g.lineTo(84, 24); g.lineTo(112, 54); g.lineTo(100, 96); g.lineTo(90, 90);
      g.lineTo(90, 108); g.lineTo(38, 108); g.lineTo(38, 90); g.lineTo(28, 96); g.lineTo(16, 54);
    };
    shape(g, body, lin(g, 16, 24, 112, 108, [[0, top], [1, bottom]]));
    shape(g, poly(g, [[44, 24], [64, 52], [84, 24], [74, 18], [64, 28], [54, 18]]), collar, 3);
    g.strokeStyle = zip;
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(64, 52); g.lineTo(64, 106); g.stroke();
    if (stitch) {
      g.strokeStyle = stitch;
      g.lineWidth = 1.5;
      g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(40, 40); g.lineTo(40, 104); g.moveTo(88, 40); g.lineTo(88, 104); g.stroke();
      g.setLineDash([]);
    }
    gloss(g, 26, 58, 6, 24, 0.2);
  };
}
DRAW.leather_jacket = jacketIcon('#4a3a32', '#1e1612', '#2c211b', '#9a9aa2');
DRAW.denim_jacket = jacketIcon('#7a96c0', '#3f5a86', '#5a78a4', '#c9a15a', '#d8c27a');
DRAW.raincoat = jacketIcon('#f0c93a', '#b88d12', '#d9ae26', '#6a5a1a');
DRAW.work_vest = (g) => {
  floorShadow(g, 64, 112, 38, 8);
  shape(g, () => {
    g.moveTo(38, 16); g.lineTo(54, 16); g.quadraticCurveTo(64, 34, 74, 16); g.lineTo(90, 16);
    g.lineTo(96, 40); g.lineTo(92, 104); g.lineTo(36, 104); g.lineTo(32, 40);
  }, lin(g, 32, 16, 96, 104, [[0, '#ff9a3a'], [1, '#d9570f']]));
  shape(g, rr(g, 34, 66, 60, 8, 2), '#e9edf0', 3);
  shape(g, rr(g, 34, 84, 60, 8, 2), '#e9edf0', 3);
  gloss(g, 40, 22, 5, 30, 0.25);
};

DRAW.hammer = (g) => {
  floorShadow(g, 64, 112, 38, 7);
  g.save(); g.translate(64, 64); g.rotate(0.6);
  shape(g, rr(g, -5, -30, 10, 82, 4), lin(g, -5, 0, 5, 0, [[0, '#b98a52'], [1, '#6a4a28']]));
  shape(g, rr(g, -26, -42, 52, 20, 4), lin(g, 0, -42, 0, -22, [[0, '#a9aeb6'], [1, '#5a5e66']]));
  gloss(g, -20, -39, 30, 4, 0.4);
  g.restore();
};
DRAW.sledgehammer = (g) => {
  floorShadow(g, 64, 114, 40, 7);
  g.save(); g.translate(64, 64); g.rotate(0.55);
  shape(g, rr(g, -4, -26, 8, 92, 3), lin(g, -4, 0, 4, 0, [[0, '#a07a48'], [1, '#5f4426']]));
  shape(g, rr(g, -30, -44, 60, 28, 5), lin(g, 0, -44, 0, -16, [[0, '#9aa0a8'], [1, '#3e4248']]));
  gloss(g, -24, -40, 36, 5, 0.4);
  g.restore();
};
DRAW.nails = (g) => {
  floorShadow(g, 64, 108, 34, 6);
  for (const [x, y, r] of [[44, 70, -0.5], [62, 60, 0.1], [80, 72, 0.6], [58, 86, -0.2]] as const) {
    g.save(); g.translate(x, y); g.rotate(r);
    shape(g, poly(g, [[-1.6, -26], [1.6, -26], [1.6, 24], [0, 30], [-1.6, 24]]), '#a7abb3', 2.5);
    shape(g, rr(g, -7, -30, 14, 5, 2), '#c2c6cd', 2.5);
    g.restore();
  }
};
DRAW.scrap = (g) => {
  floorShadow(g, 64, 108, 40, 7);
  shape(g, poly(g, [[22, 90], [34, 52], [70, 44], [82, 70], [60, 96]]), lin(g, 22, 44, 82, 96, [[0, '#8a8f98'], [1, '#4a4e56']]));
  shape(g, poly(g, [[56, 70], [78, 34], [104, 46], [98, 82], [76, 94]]), lin(g, 56, 34, 104, 94, [[0, '#9a8470'], [1, '#5a4636']]));
  gloss(g, 36, 56, 20, 4, 0.4);
};
DRAW.lockpick = (g) => {
  floorShadow(g, 64, 110, 34, 6);
  g.save(); g.translate(64, 64); g.rotate(-0.9);
  shape(g, rr(g, -3, -44, 6, 70, 2), '#aeb3bb', 3);
  shape(g, poly(g, [[-3, -44], [10, -44], [10, -36], [3, -36], [3, -30], [-3, -30]]), '#aeb3bb', 3);
  shape(g, rr(g, -8, 22, 16, 28, 6), '#2b2b30', 4);
  g.restore();
};

DRAW.bat = (g) => {
  floorShadow(g, 64, 112, 40, 7);
  g.save(); g.translate(64, 64); g.rotate(-0.75);
  shape(g, () => { g.moveTo(-4, 54); g.lineTo(4, 54); g.lineTo(5, 30); g.lineTo(9, 8); g.quadraticCurveTo(14, -30, 11, -48); g.quadraticCurveTo(0, -56, -11, -48); g.quadraticCurveTo(-14, -30, -9, 8); g.lineTo(-5, 30); }, lin(g, -12, 0, 12, 0, [[0, '#d8aa6a'], [1, '#8a5a2c']]));
  shape(g, rr(g, -6, 40, 12, 18, 3), '#2a2018', 3);
  gloss(g, -7, -36, 4, 40, 0.35);
  g.restore();
};
DRAW.pipe = (g) => {
  floorShadow(g, 64, 112, 40, 7);
  g.save(); g.translate(64, 64); g.rotate(-0.7);
  shape(g, rr(g, -7, -52, 14, 104, 5), lin(g, -7, 0, 7, 0, [[0, '#9aa0a8'], [0.5, '#6a6e76'], [1, '#3e4248']]));
  shape(g, rr(g, -9, -54, 18, 8, 3), '#4a4e56', 3);
  gloss(g, -4, -44, 3, 80, 0.4);
  g.restore();
};
DRAW.knife = (g) => {
  floorShadow(g, 64, 112, 34, 6);
  g.save(); g.translate(64, 64); g.rotate(-0.8);
  shape(g, () => { g.moveTo(-6, 4); g.lineTo(-6, -36); g.quadraticCurveTo(-4, -52, 6, -56); g.lineTo(6, 4); }, lin(g, -6, 0, 6, 0, [[0, '#f0f2f4'], [1, '#8a9096']]));
  shape(g, rr(g, -9, 4, 18, 6, 2), '#2a2a30', 3);
  shape(g, rr(g, -6, 10, 12, 36, 4), lin(g, -6, 0, 6, 0, [[0, '#6a4a2c'], [1, '#2a1a0c']]));
  g.restore();
};
DRAW.axe = (g) => {
  floorShadow(g, 64, 114, 40, 7);
  g.save(); g.translate(64, 64); g.rotate(0.7);
  shape(g, rr(g, -4, -48, 8, 104, 3), lin(g, -4, 0, 4, 0, [[0, '#b98a52'], [1, '#6a4a28']]));
  shape(g, () => { g.moveTo(4, -50); g.quadraticCurveTo(38, -58, 40, -26); g.quadraticCurveTo(26, -30, 4, -24); }, lin(g, 4, -50, 40, -24, [[0, '#d0d4da'], [1, '#6a6e76']]));
  shape(g, rr(g, -6, -52, 12, 10, 2), '#4a4e56', 3);
  g.restore();
};

/** Bauteile (`piece_<art>`): einfache gemalte Motive in Holzfarben */
const WOOD_L = '#c9a36a', WOOD_M = '#9a7448', WOOD_D = '#5e4426';
const woodG = (g: G, x0: number, y0: number, x1: number, y1: number): CanvasGradient => lin(g, x0, y0, x1, y1, [[0, WOOD_L], [1, WOOD_M]]);
function drawPiece(g: G, kind: string): void {
  floorShadow(g, 64, 112, 40, 7);
  switch (kind) {
    case 'wall':
      shape(g, rr(g, 20, 30, 88, 74, 4), woodG(g, 20, 30, 108, 104));
      g.strokeStyle = INK; g.lineWidth = 3;
      for (const y of [48, 66, 84]) { g.beginPath(); g.moveTo(20, y); g.lineTo(108, y); g.stroke(); }
      break;
    case 'door':
      shape(g, rr(g, 34, 16, 60, 92, 4), woodG(g, 34, 16, 94, 108));
      shape(g, rr(g, 44, 28, 40, 30, 3), WOOD_M, 3);
      shape(g, rr(g, 44, 64, 40, 34, 3), WOOD_M, 3);
      shape(g, ell(g, 84, 66, 4.5, 4.5), '#cfd3da', 3);
      break;
    case 'windowwall':
      shape(g, rr(g, 18, 26, 92, 80, 4), woodG(g, 18, 26, 110, 106));
      shape(g, rr(g, 40, 40, 48, 38, 2), '#a9d4ee', 4);
      g.strokeStyle = INK; g.lineWidth = 3;
      g.beginPath(); g.moveTo(64, 40); g.lineTo(64, 78); g.moveTo(40, 59); g.lineTo(88, 59); g.stroke();
      break;
    case 'windowbar':
      shape(g, rr(g, 24, 22, 80, 84, 4), '#a9d4ee', 4);
      for (const [y, a] of [[40, -0.08], [62, 0.06], [84, -0.05]] as [number, number][]) {
        g.save(); g.translate(64, y); g.rotate(a);
        shape(g, rr(g, -46, -8, 92, 16, 3), woodG(g, 0, -8, 0, 8), 4);
        g.restore();
      }
      break;
    case 'barricade':
      for (const [x, y, w, a] of [[22, 44, 84, -0.18], [22, 66, 84, 0.16], [22, 88, 84, -0.1]] as [number, number, number, number][]) {
        g.save(); g.translate(x + w / 2, y); g.rotate(a);
        shape(g, rr(g, -w / 2, -9, w, 18, 3), woodG(g, 0, -9, 0, 9), 4);
        g.restore();
      }
      shape(g, rr(g, 30, 30, 10, 76, 2), WOOD_D, 3);
      shape(g, rr(g, 88, 30, 10, 76, 2), WOOD_D, 3);
      break;
    case 'table':
      shape(g, rr(g, 16, 44, 96, 14, 3), woodG(g, 16, 44, 112, 58));
      for (const x of [24, 92]) shape(g, rr(g, x, 58, 12, 44, 2), WOOD_M, 3);
      break;
    case 'workbench':
      shape(g, rr(g, 14, 40, 100, 14, 3), woodG(g, 14, 40, 114, 54));
      for (const x of [20, 94]) shape(g, rr(g, x, 54, 12, 48, 2), WOOD_M, 3);
      shape(g, rr(g, 24, 82, 80, 7, 2), WOOD_M, 3);
      shape(g, rr(g, 86, 26, 18, 14, 2), '#6a6e74', 3);
      shape(g, rr(g, 30, 32, 34, 8, 2), '#8a8a90', 2);
      break;
    case 'chair':
      shape(g, rr(g, 38, 22, 48, 36, 4), woodG(g, 38, 22, 86, 58), 4);
      shape(g, rr(g, 34, 58, 56, 12, 3), woodG(g, 34, 58, 90, 70));
      for (const x of [38, 76]) shape(g, rr(g, x, 70, 10, 36, 2), WOOD_M, 3);
      break;
    case 'shelf':
      shape(g, rr(g, 24, 16, 80, 94, 3), WOOD_D, 4);
      for (const y of [44, 72]) shape(g, rr(g, 24, y, 80, 8, 2), woodG(g, 24, y, 104, y + 8), 3);
      shape(g, rr(g, 34, 28, 14, 16, 2), '#b9b4a0', 3);
      shape(g, rr(g, 56, 56, 26, 16, 2), '#8b6b45', 3);
      shape(g, rr(g, 40, 82, 22, 20, 2), '#6f8a6a', 3);
      break;
    case 'crate':
      shape(g, rr(g, 20, 34, 88, 68, 4), woodG(g, 20, 34, 108, 102));
      g.strokeStyle = INK; g.lineWidth = 3;
      for (const y of [56, 80]) { g.beginPath(); g.moveTo(20, y); g.lineTo(108, y); g.stroke(); }
      shape(g, rr(g, 20, 34, 88, 10, 3), WOOD_D, 3);
      break;
    case 'cabinet':
      shape(g, rr(g, 30, 12, 68, 98, 4), woodG(g, 30, 12, 98, 110));
      shape(g, rr(g, 36, 22, 26, 78, 2), WOOD_M, 3);
      shape(g, rr(g, 66, 22, 26, 78, 2), WOOD_M, 3);
      shape(g, ell(g, 58, 62, 3.5, 3.5), '#cfd3da', 2);
      shape(g, ell(g, 70, 62, 3.5, 3.5), '#cfd3da', 2);
      break;
    case 'fence':
      for (const x of [22, 40, 58, 76, 94]) shape(g, poly(g, [[x, 34], [x + 7, 26], [x + 14, 34], [x + 14, 104], [x, 104]]), woodG(g, x, 30, x + 14, 104), 3);
      shape(g, rr(g, 16, 50, 100, 10, 2), WOOD_M, 3);
      shape(g, rr(g, 16, 80, 100, 10, 2), WOOD_M, 3);
      break;
    case 'bed':
      shape(g, rr(g, 16, 58, 96, 36, 5), WOOD_D, 4);
      shape(g, rr(g, 22, 48, 84, 30, 6), '#b9c4d6', 4);
      shape(g, rr(g, 26, 40, 30, 16, 6), '#f2f2f2', 3);
      break;
    case 'fire':
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; shape(g, ell(g, 64 + Math.cos(a) * 34, 92 + Math.sin(a) * 10, 9, 7), '#77777c', 3); }
      shape(g, () => { g.moveTo(64, 28); g.quadraticCurveTo(96, 60, 82, 90); g.quadraticCurveTo(64, 100, 46, 90); g.quadraticCurveTo(34, 62, 64, 28); }, lin(g, 64, 28, 64, 96, [[0, '#ffd45c'], [1, '#ff7a1c']]), 4);
      break;
    default:
      shape(g, rr(g, 30, 30, 68, 68, 10), WOOD_M);
  }
}

const cache = new Map<string, string>();
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/** data-URL des gemalten Icons; fehlt ein Motiv, wird ein Platzhalter gezeichnet. */
export function iconURL(id: string): string {
  const hit = cache.get(id);
  if (hit) return hit;
  if (typeof document === 'undefined') return BLANK;
  const pz = pzIconURL(id);
  if (pz) {
    cache.set(id, pz);
    return pz;
  }
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const draw = DRAW[id];
  if (draw) draw(g);
  else if (id.startsWith('piece_')) drawPiece(g, id.slice(6));
  else {
    shape(g, rr(g, 30, 30, 68, 68, 10), '#6a6a72');
    g.fillStyle = '#fff';
    g.font = 'bold 40px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('?', 64, 66);
  }
  const url = c.toDataURL('image/png');
  cache.set(id, url);
  return url;
}

export const iconHtml = (id: string, cls = 'ic'): string => `<img class="${cls}" src="${iconURL(id)}" alt="" draggable="false">`;
