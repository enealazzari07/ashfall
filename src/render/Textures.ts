import * as THREE from 'three';
import { paintAsphaltBase, tileNoise } from './StreetTextures';
import { WearKind, drawClinker, drawPanel, drawStucco, drawWear } from './WallTextures';

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

/** Gibt null zurück, wenn kein DOM vorhanden ist (z.B. in Tests). */
function make(w: number, h: number, draw: Draw): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  // Kleine Texturen werden doppelt so hoch aufgelöst gezeichnet (gleiches Muster, schärfere Linien, feines Korn darüber)
  const s = Math.max(w, h) >= 512 ? 1 : 2;
  const c = document.createElement('canvas');
  c.width = w * s;
  c.height = h * s;
  const g = c.getContext('2d')!;
  g.scale(s, s);
  draw(g, w, h);
  if (s > 1) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    // feines Korn: bricht die glatten Flächen auf, ohne das Muster zu verändern
    const n = Math.floor((c.width * c.height) / 14);
    g.fillStyle = 'rgba(0,0,0,0.055)';
    for (let i = 0; i < n; i++) g.fillRect(Math.random() * c.width, Math.random() * c.height, 1, 1);
    g.fillStyle = 'rgba(255,255,255,0.045)';
    for (let i = 0; i < n; i++) g.fillRect(Math.random() * c.width, Math.random() * c.height, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.s = s;
  return t;
}

let glassT: THREE.CanvasTexture | null | undefined;
/** Fensterglas: Grundton mit Streifenspiegelung, Schmutz an den Ecken und Rändern; Alpha steuert die Deckkraft (Streifen deckender) */
export function glassTexture(): THREE.CanvasTexture | null {
  if (glassT !== undefined) return glassT;
  if (typeof document === 'undefined') return (glassT = null);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(235,245,250,0.78)';
  g.fillRect(0, 0, 128, 128);
  // diagonale Lichtstreifen
  for (const [x, wdt, a] of [[20, 14, 0.5], [52, 6, 0.4], [84, 20, 0.3]] as const) {
    const gr = g.createLinearGradient(x, 0, x + wdt + 40, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, `rgba(255,255,255,${a + 0.4})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + wdt, 0);
    g.lineTo(x + wdt + 60, 128);
    g.lineTo(x + 60, 128);
    g.fill();
  }
  // Schmutz: Ecken und untere Kante dunkler, Regenspuren
  for (const [cx, cy] of [[0, 128], [128, 128], [0, 0], [128, 0]] as const) {
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 42);
    gr.addColorStop(0, 'rgba(110,120,115,0.45)');
    gr.addColorStop(1, 'rgba(110,120,115,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  g.strokeStyle = 'rgba(120,130,125,0.18)';
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * 128;
    g.beginPath();
    g.moveTo(x, 20 + Math.random() * 40);
    g.lineTo(x + (Math.random() - 0.5) * 6, 128);
    g.stroke();
  }
  glassT = new THREE.CanvasTexture(c);
  glassT.colorSpace = THREE.SRGBColorSpace;
  glassT.anisotropy = 4;
  return glassT;
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, colors: string[], max = 3): void {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length];
    const s = 1 + Math.random() * max;
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

export interface Textures {
  grass: THREE.CanvasTexture | null;
  asphalt: THREE.CanvasTexture | null;
  wall: THREE.CanvasTexture | null;
  brick: THREE.CanvasTexture | null;
  stone: THREE.CanvasTexture | null;
  tile: THREE.CanvasTexture | null;
  carpet: THREE.CanvasTexture | null;
  concreteFloor: THREE.CanvasTexture | null;
  siding: THREE.CanvasTexture | null;
  stucco: THREE.CanvasTexture | null;
  clinker: THREE.CanvasTexture | null;
  panel: THREE.CanvasTexture | null;
  concrete: THREE.CanvasTexture | null;
  metal: THREE.CanvasTexture | null;
  roof: THREE.CanvasTexture | null;
  floor: THREE.CanvasTexture | null;
  paving: THREE.CanvasTexture | null;
  gravel: THREE.CanvasTexture | null;
  highway: THREE.CanvasTexture | null;
  /** Asphalt ohne Linien, gleiche Farbe wie die Autobahn (Rampen, Servicespuren) */
  asphaltPlain: THREE.CanvasTexture | null;
  plaster: THREE.CanvasTexture | null;
  /** Holzmaserung für Möbel (Graustufen, über die Vertexfarbe gelegt) */
  grain: THREE.CanvasTexture | null;
}

/** Verschleiß an Hauswänden (Graffiti, Risse, abgeplatzter Putz …), Schlüssel `wear:<Art>:<Variante>` */
export function wearTexture(key: string): THREE.CanvasTexture | null {
  if (signCache.has(key)) return signCache.get(key)!;
  const [, kind, variant] = key.split(':');
  const tex = make(256, 256, drawWear(kind as WearKind, Number(variant)));
  if (tex) tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  signCache.set(key, tex);
  return tex;
}

/** Schilder: einmalig gezeichnet und gecacht. Schlüssel: stop | cross | gantry | name:<Text> */
const signCache = new Map<string, THREE.CanvasTexture | null>();
export function signTexture(key: string): THREE.CanvasTexture | null {
  if (signCache.has(key)) return signCache.get(key)!;
  const clamp = (t: THREE.CanvasTexture | null) => {
    if (t) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  };
  let tex: THREE.CanvasTexture | null = null;
  if (key === 'stop') {
    tex = make(128, 128, (g) => {
      const oct = (r: number, fill: string) => {
        g.fillStyle = fill;
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
      };
      oct(62, '#f4f4f4');
      oct(55, '#c4262e');
      g.fillStyle = '#fff';
      g.font = 'bold 34px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('STOP', 64, 66);
    });
  } else if (key === 'cross') {
    tex = make(128, 128, (g) => {
      g.translate(64, 64);
      for (const [col, wd] of [['#c4262e', 26], ['#ffffff', 16]] as const) {
        g.fillStyle = col;
        for (const a of [Math.PI / 4, -Math.PI / 4]) {
          g.save();
          g.rotate(a);
          g.fillRect(-60, -wd / 2, 120, wd);
          g.restore();
        }
      }
    });
  } else if (key === 'gantry') {
    tex = make(512, 128, (g, w, h) => {
      g.fillStyle = '#1d5fa8';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#fff';
      g.lineWidth = 5;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#fff';
      g.font = 'bold 40px sans-serif';
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.fillText('A9  ^  München', 24, 38);
      g.fillText('Nürnberg  >  A3', 24, 90);
    });
  } else if (key === 'pylon') {
    // Preismast der Tankstelle: Marke oben, darunter Preise in Leuchtziffern (manche Stellen sind ausgefallen)
    tex = make(256, 336, (g, w, h) => {
      g.fillStyle = '#f2f0ea';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#b8322a';
      g.fillRect(0, 0, w, 120);
      g.fillStyle = '#f2f0ea';
      g.beginPath();
      g.arc(w / 2, 58, 40, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#b8322a';
      g.font = 'bold 34px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('GAS', w / 2, 60);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 112, w, 6);
      const rows: [string, string][] = [['REGULAR', '3.4_9'], ['SUPER', '3.8_'], ['DIESEL', '_.99']];
      rows.forEach(([name, price], i) => {
        const y = 140 + i * 64;
        g.fillStyle = '#1b1d22';
        g.fillRect(10, y, w - 20, 54);
        g.fillStyle = '#d9d6cc';
        g.font = 'bold 18px sans-serif';
        g.textAlign = 'left';
        g.fillText(name, 20, y + 27);
        g.fillStyle = '#ff8a2a';
        g.font = 'bold 34px monospace';
        g.textAlign = 'right';
        g.fillText(price.replace(/_/g, ' '), w - 20, y + 29);
      });
      // Rost und Dreck
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(110,70,40,${Math.random() * 0.25})`;
        g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 8, 2 + Math.random() * 14);
      }
    });
  } else if (key.startsWith('shop:')) {
    const [name, col] = key.slice(5).split('|');
    tex = make(512, 96, (g, w, h) => {
      g.fillStyle = `#${col}`;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 5;
      g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = '#f6f1e2';
      g.font = 'bold 52px Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(name, w / 2, h / 2 + 3);
    });
  } else if (key.startsWith('name:')) {
    tex = make(256, 64, (g, w, h) => {
      g.fillStyle = '#1f6b46';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#fff';
      g.lineWidth = 3;
      g.strokeRect(3, 3, w - 6, h - 6);
      g.fillStyle = '#fff';
      g.font = 'bold 30px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(key.slice(5), w / 2, h / 2 + 2);
    });
  }
  signCache.set(key, clamp(tex));
  return signCache.get(key)!;
}

/**
 * Erzeugt aus einer Farbtextur eine Normal-Map (Helligkeit = Höhe, Sobel-Filter).
 * Fugen, Risse und Fensterrahmen bekommen dadurch echte Tiefe im Licht.
 */
const normalCache = new Map<THREE.Texture, THREE.CanvasTexture>();
export function normalMapOf(src: THREE.CanvasTexture | null, strength = 2): THREE.CanvasTexture | null {
  if (!src) return null;
  const hit = normalCache.get(src);
  if (hit) return hit;
  const img = src.image as HTMLCanvasElement;
  const w = img.width, h = img.height;
  strength *= (src.userData.s as number | undefined) ?? 1; // höhere Auflösung: Kanten sind breiter, Stärke ausgleichen
  const data = img.getContext('2d')!.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11) / 255;
  const at = (x: number, y: number) => lum[((y + h) % h) * w + ((x + w) % w)];
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const out = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * strength;
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * w + x) * 4;
      out.data[o] = (-dx / len) * 127.5 + 127.5;
      out.data[o + 1] = (dy / len) * 127.5 + 127.5;
      out.data[o + 2] = (1 / len) * 127.5 + 127.5;
      out.data[o + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  normalCache.set(src, t);
  return t;
}

let cache: Textures | null = null;

export function textures(): Textures {
  if (cache) return cache;
  cache = {
    grain: make(256, 256, (g, w, h) => {
      g.fillStyle = '#e6e6e6';
      g.fillRect(0, 0, w, h);
      // Längsfasern mit Jahresringen: dunkle und helle Streifen in leichter Welle
      for (let i = 0; i < 70; i++) {
        const y = Math.random() * h, amp = 1 + Math.random() * 3, ph = Math.random() * 6;
        g.strokeStyle = Math.random() < 0.5 ? 'rgba(90,90,90,0.22)' : 'rgba(255,255,255,0.25)';
        g.lineWidth = 0.6 + Math.random() * 1.6;
        g.beginPath();
        for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.04 + ph) * amp);
        g.stroke();
      }
      // Astlöcher
      for (let i = 0; i < 3; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        const gr = g.createRadialGradient(x, y, 0, x, y, 8);
        gr.addColorStop(0, 'rgba(70,70,70,0.45)');
        gr.addColorStop(1, 'rgba(70,70,70,0)');
        g.fillStyle = gr;
        g.fillRect(x - 8, y - 8, 16, 16);
      }
    }),
    // Kachel 8 m, nahtlos: Elemente am Rand werden auf der Gegenseite fortgesetzt. Großflächige Farbwechsel kommen
    // nicht aus der Kachel (die würden sich alle 8 m wiederholen), sondern aus dem Boden-Shader (siehe Materials.ts).
    grass: make(512, 512, (g, w, h) => {
      const img = g.createImageData(w, h);
      const r = (() => {
        let s = 99;
        return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
      })();
      const mid = tileNoise(w, 32, r), fine = tileNoise(w, 8, r);
      for (let i = 0; i < w * h; i++) {
        const v = (mid[i] - 0.5) * 18 + (fine[i] - 0.5) * 14 + (r() - 0.5) * 16;
        img.data[i * 4] = 82 + v * 0.8;
        img.data[i * 4 + 1] = 108 + v;
        img.data[i * 4 + 2] = 60 + v * 0.6;
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      /** zeichnet `fn` an (x, y) und – wenn es über den Rand ragt – auch versetzt auf der Gegenseite */
      const wrap = (x: number, y: number, m: number, fn: (x: number, y: number) => void) => {
        for (const dx of [-w, 0, w]) {
          for (const dy of [-h, 0, h]) {
            const xx = x + dx, yy = y + dy;
            if (xx > -m && xx < w + m && yy > -m && yy < h + m) fn(xx, yy);
          }
        }
      };
      // Halme als kurze, leicht gebogene Striche in mehreren Grüntönen
      const blades = ['rgba(34,66,26,0.55)', 'rgba(70,110,45,0.6)', 'rgba(112,150,70,0.6)', 'rgba(150,176,92,0.5)', 'rgba(92,120,52,0.55)'];
      for (let i = 0; i < 5200; i++) {
        const x = r() * w, y = r() * h, len = 4 + r() * 9, lean = (r() - 0.5) * 7, lw = 0.8 + r() * 0.9;
        g.strokeStyle = blades[i % blades.length];
        g.lineWidth = lw;
        wrap(x, y, 14, (xx, yy) => {
          g.beginPath();
          g.moveTo(xx, yy);
          g.quadraticCurveTo(xx + lean * 0.3, yy - len * 0.6, xx + lean, yy - len);
          g.stroke();
        });
      }
      // Kleeblätter und vereinzelte Blüten
      for (let i = 0; i < 70; i++) {
        const x = r() * w, y = r() * h;
        g.fillStyle = 'rgba(60,110,50,0.7)';
        wrap(x, y, 6, (xx, yy) => {
          for (let k = 0; k < 3; k++) {
            g.beginPath();
            g.arc(xx + Math.cos(k * 2.1) * 2.2, yy + Math.sin(k * 2.1) * 2.2, 2, 0, 6.3);
            g.fill();
          }
        });
      }
      for (let i = 0; i < 20; i++) {
        const x = r() * w, y = r() * h, rad = 1.6 + r() * 1.2;
        g.fillStyle = ['#f2f2ea', '#f3e27a', '#e6a8c4', '#ffffff'][i % 4];
        wrap(x, y, 4, (xx, yy) => {
          g.beginPath();
          g.arc(xx, yy, rad, 0, 6.3);
          g.fill();
        });
      }
    }),

    // Kachel 8 m (u), Textur-Höhe = Straßenbreite: feiner Asphalt, gestrichelte Mittellinie, Randlinien (kurvige Straßen)
    asphalt: make(512, 512, (g, w, h) => {
      paintAsphaltBase(g, w, 11);
      g.fillStyle = 'rgba(214,212,204,0.8)';
      g.fillRect(0, 14, w, 6);
      g.fillRect(0, h - 20, w, 6);
      g.fillStyle = 'rgba(217,185,74,0.9)';
      g.fillRect(0, h / 2 - 4, w * 0.4, 8);
      // Abrieb: Asphaltkörner über den Linien
      for (let i = 0; i < 900; i++) {
        const v = 50 + Math.random() * 30;
        g.fillStyle = `rgba(${v},${v},${v + 3},${0.3 + Math.random() * 0.5})`;
        const y = [17, h - 17, h / 2][i % 3] + (Math.random() - 0.5) * 9;
        g.fillRect(Math.random() * w, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
    }),

    // Kachel 4 m x 3 m: glatter Putz mit feinen Rissen und Flecken (Fenster sind echte Geometrie)
    wall: make(256, 192, (g, w, h) => {
      g.fillStyle = '#e4dfd3';
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 1400, ['#d8d2c5', '#ece7dc', '#cfc9bb', '#c4bdae'], 3);
      for (let i = 0; i < 9; i++) {
        const x = Math.random() * w;
        const grad = g.createLinearGradient(x, 0, x, h);
        grad.addColorStop(0, 'rgba(70,60,45,0.0)');
        grad.addColorStop(0.5, 'rgba(70,60,45,0.07)');
        grad.addColorStop(1, 'rgba(70,60,45,0.0)');
        g.fillStyle = grad;
        g.fillRect(x, 0, 3 + Math.random() * 6, h);
      }
      g.strokeStyle = 'rgba(70,60,50,0.22)';
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        let x = Math.random() * w, y = Math.random() * h * 0.6;
        g.moveTo(x, y);
        for (let k = 0; k < 6; k++) g.lineTo((x += (Math.random() - 0.5) * 10), (y += 4 + Math.random() * 8));
        g.stroke();
      }
    }),

    // Kachel 4 m x 3 m: Backstein im Läuferverband, Steinformat 24 x 8 cm
    brick: make(256, 192, (g, w, h) => {
      g.fillStyle = '#4a3a34';
      g.fillRect(0, 0, w, h);
      const bw = 15, bh = 5; // px (64 px = 1 m)
      const cols = ['#9a4a3a', '#a85644', '#8c4234', '#b0604c', '#843e32', '#a04c3c', '#946050'];
      for (let y = 0, row = 0; y < h; y += bh + 1, row++) {
        for (let x = -(row % 2) * (bw / 2); x < w; x += bw + 1) {
          g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
          g.fillRect(x, y, bw, bh);
          g.fillStyle = 'rgba(255,255,255,0.06)';
          g.fillRect(x, y, bw, 1);
          g.fillStyle = 'rgba(0,0,0,0.12)';
          g.fillRect(x, y + bh - 1, bw, 1);
        }
      }
      speckle(g, w, h, 500, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.05)'], 2);
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(20,15,10,0.28)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }),

    // Kachel 4 m x 3 m: Natursteinmauer aus behauenen Quadern in Grau und Braun (wie am Schornstein des Bauernhofs)
    stone: make(256, 192, (g, w, h) => {
      g.fillStyle = '#4e4c47';
      g.fillRect(0, 0, w, h);
      const greys = ['#8a8984', '#9a9892', '#7c7b76', '#a5a39b', '#85837c', '#928f86', '#77746d', '#a09b90'];
      let y = 0;
      let row = 0;
      while (y < h) {
        const rh = 26 + ((row * 7) % 4) * 6;
        let x = -((row * 37) % 50);
        while (x < w) {
          const sw = 38 + Math.random() * 54;
          const col = greys[Math.floor(Math.random() * greys.length)];
          const sx = x + 2, sy = y + 2, sww = sw - 3, shh = Math.min(rh, h - y) - 3;
          const grad = g.createLinearGradient(sx, sy, sx, sy + shh);
          grad.addColorStop(0, col);
          grad.addColorStop(1, 'rgba(60,58,54,0.55)');
          g.fillStyle = col;
          g.fillRect(sx, sy, sww, shh);
          g.fillStyle = grad;
          g.fillRect(sx, sy, sww, shh);
          g.fillStyle = 'rgba(255,255,255,0.16)';
          g.fillRect(sx, sy, sww, 2);
          g.fillStyle = 'rgba(0,0,0,0.22)';
          g.fillRect(sx, sy + shh - 2, sww, 2);
          for (let k = 0; k < 6; k++) {
            g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.1)';
            g.fillRect(sx + Math.random() * sww, sy + Math.random() * shh, 1 + Math.random() * 3, 1 + Math.random() * 2);
          }
          x += sw;
        }
        y += rh;
        row++;
      }
    }),

    // Kachel 4 m x 3 m: Holz-/Kunststoffverkleidung, Brett 16 cm
    siding: make(256, 192, (g, w, h) => {
      const bh = 10;
      for (let y = 0; y < h; y += bh) {
        g.fillStyle = y % (bh * 2) === 0 ? '#e6e3dc' : '#dedbd2';
        g.fillRect(0, y, w, bh);
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.fillRect(0, y + bh - 2, w, 2);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(0, y, w, 1);
      }
      speckle(g, w, h, 900, ['rgba(80,70,60,0.10)', 'rgba(255,255,255,0.08)'], 2);
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0.6, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(60,70,40,0.25)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }),

    stucco: make(256, 192, drawStucco),
    clinker: make(256, 192, drawClinker),
    panel: make(256, 192, drawPanel),

    // Kachel 4 m x 3 m: Betonfertigteile mit Fugen und Wasserflecken
    concrete: make(256, 192, (g, w, h) => {
      g.fillStyle = '#b9b8b2';
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 2200, ['#aeada7', '#c4c3bd', '#a4a39d'], 2);
      g.fillStyle = 'rgba(40,40,36,0.5)';
      for (let x = 0; x < w; x += 128) g.fillRect(x, 0, 2, h);
      for (let y = 0; y < h; y += 96) g.fillRect(0, y, w, 2);
      for (let i = 0; i < 14; i++) {
        const x = Math.random() * w;
        const grad = g.createLinearGradient(x, 0, x, h);
        grad.addColorStop(0, 'rgba(40,45,50,0.0)');
        grad.addColorStop(0.3, 'rgba(40,45,50,0.16)');
        grad.addColorStop(1, 'rgba(40,45,50,0.0)');
        g.fillStyle = grad;
        g.fillRect(x, 0, 2 + Math.random() * 5, h);
      }
    }),

    // Fliesen 2 m x 2 m: Raster 40 cm, abwechselnd hell/dunkel, Fugen und Abnutzung
    tile: make(256, 256, (g, w, h) => {
      const n = 5, s = w / n;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          g.fillStyle = (x + y) % 2 ? '#d7d6cf' : '#bfc3c2';
          g.fillRect(x * s, y * s, s, s);
        }
      }
      g.strokeStyle = 'rgba(60,60,58,0.55)';
      g.lineWidth = 2;
      for (let i = 0; i <= n; i++) {
        g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke();
      }
      speckle(g, w, h, 900, ['rgba(0,0,0,0.07)', 'rgba(255,255,255,0.1)'], 3);
    }),

    // Teppichboden: graublau mit feiner Körnung
    carpet: make(128, 128, (g, w, h) => {
      g.fillStyle = '#5a6272';
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 3200, ['#4e5666', '#667080', '#586070', '#505868'], 2);
    }),

    // Industrieboden 4 m x 4 m: Beton mit Rissen, Ölflecken und Fugen
    concreteFloor: make(256, 256, (g, w, h) => {
      g.fillStyle = '#8f8e88';
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 2500, ['#85847e', '#9a9992', '#7b7a74'], 3);
      g.fillStyle = 'rgba(30,30,30,0.5)';
      g.fillRect(0, 0, w, 2);
      g.fillRect(0, 0, 2, h);
      for (let i = 0; i < 4; i++) {
        const gr = g.createRadialGradient(Math.random() * w, Math.random() * h, 2, Math.random() * w, Math.random() * h, 28);
        gr.addColorStop(0, 'rgba(20,20,22,0.35)');
        gr.addColorStop(1, 'rgba(20,20,22,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      }
      g.strokeStyle = 'rgba(40,40,38,0.5)';
      g.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        let x = Math.random() * w, y = Math.random() * h;
        g.moveTo(x, y);
        for (let k = 0; k < 8; k++) g.lineTo((x += (Math.random() - 0.5) * 30), (y += (Math.random() - 0.3) * 24));
        g.stroke();
      }
    }),

    // Rollladen: waagerechte Lamellen
    metal: make(64, 64, (g, w, h) => {
      g.fillStyle = '#7c8186';
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 8) {
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(0, y, w, 2);
        g.fillStyle = 'rgba(0,0,0,0.32)';
        g.fillRect(0, y + 6, w, 2);
      }
      speckle(g, w, h, 160, ['rgba(70,40,20,0.35)', 'rgba(0,0,0,0.15)'], 2);
    }),

    roof: make(128, 128, (g, w, h) => {
      g.fillStyle = '#b4aea8'; // neutral hell, wird per Material eingefärbt
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 500, ['#a8a29c', '#c0bab4', '#9c968f'], 3);
      g.strokeStyle = 'rgba(40,20,15,0.45)';
      for (let y = 0, row = 0; y < h; y += 16, row++) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
        for (let x = (row % 2) * 16; x < w; x += 32) {
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x, y + 16);
          g.stroke();
        }
      }
    }),

    // Kachel 2 m x 2 m: Gehwegplatten
    paving: make(512, 512, (g, w, h) => {
      // 4 x 4 Platten (je 0,5 m): eigene Tönung, Feinkorn, Kantenlicht, Fugen mit Schmutz, Risse, Kaugummi-Flecken
      const n = 4, s = w / n;
      for (let py = 0; py < n; py++) {
        for (let px = 0; px < n; px++) {
          const v = 168 + Math.random() * 26, warm = Math.random() * 8;
          g.fillStyle = `rgb(${v + warm},${v + warm * 0.6},${v - 4})`;
          g.fillRect(px * s, py * s, s, s);
          // Wolkige Tönung innerhalb der Platte
          for (let k = 0; k < 5; k++) {
            const gr = g.createRadialGradient(px * s + Math.random() * s, py * s + Math.random() * s, 2, px * s + s / 2, py * s + s / 2, s * 0.7);
            gr.addColorStop(0, `rgba(${Math.random() < 0.5 ? '90,86,78' : '225,222,212'},0.10)`);
            gr.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = gr;
            g.fillRect(px * s, py * s, s, s);
          }
        }
      }
      speckle(g, w, h, 5200, ['#a8a59d', '#cfccc3', '#9a978f', '#b9b6ae', '#d8d5cc'], 2);
      // Kantenlicht oben/links, Schatten unten/rechts (Fase)
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          g.fillStyle = 'rgba(255,255,248,0.28)';
          g.fillRect(i * s + 3, j * s + 3, s - 6, 2);
          g.fillRect(i * s + 3, j * s + 3, 2, s - 6);
          g.fillStyle = 'rgba(40,38,34,0.22)';
          g.fillRect(i * s + 3, j * s + s - 5, s - 6, 2);
          g.fillRect(i * s + s - 5, j * s + 3, 2, s - 6);
        }
      }
      // Fugen
      g.strokeStyle = 'rgba(52,50,45,0.85)';
      g.lineWidth = 4;
      for (let i = 0; i <= n; i++) {
        g.beginPath();
        g.moveTo(i * s, 0);
        g.lineTo(i * s, h);
        g.moveTo(0, i * s);
        g.lineTo(w, i * s);
        g.stroke();
      }
      // Moos und Dreck in den Fugen
      for (let i = 0; i < 90; i++) {
        const gx = Math.random() < 0.5 ? Math.floor(Math.random() * n) * s : Math.random() * w;
        const gy = gx % s === 0 ? Math.random() * h : Math.floor(Math.random() * n) * s;
        g.fillStyle = Math.random() < 0.6 ? 'rgba(78,104,58,0.65)' : 'rgba(60,52,40,0.5)';
        g.fillRect(gx - 1.5, gy - 1.5, 3 + Math.random() * 5, 3 + Math.random() * 3);
      }
      // Risse
      g.strokeStyle = 'rgba(55,52,47,0.7)';
      g.lineWidth = 1.2;
      for (let i = 0; i < 7; i++) {
        let x = Math.random() * w, y = Math.random() * h;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 6; k++) {
          x += (Math.random() - 0.5) * 22;
          y += 6 + Math.random() * 12;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      // dunkle Flecken (Regen, Öl, Kaugummi)
      for (let i = 0; i < 18; i++) {
        g.fillStyle = `rgba(60,56,50,${0.08 + Math.random() * 0.14})`;
        g.beginPath();
        g.ellipse(Math.random() * w, Math.random() * h, 3 + Math.random() * 14, 3 + Math.random() * 10, Math.random() * 3, 0, 6.3);
        g.fill();
      }
    }),

    // Innenwand 4 m x 3 m: Putz mit Fußleiste und Stuckkante
    plaster: make(256, 192, (g, w, h) => {
      g.fillStyle = '#e9e3d6';
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 700, ['#dfd8c9', '#f1ece0', '#d6cfbf'], 3);
      g.fillStyle = '#b9b1a0';
      g.fillRect(0, h - 16, w, 16);
      g.fillStyle = '#a39b8a';
      g.fillRect(0, h - 18, w, 2);
      g.fillStyle = '#f4f0e6';
      g.fillRect(0, 0, w, 8);
      g.fillStyle = 'rgba(120,110,95,0.25)';
      g.fillRect(0, 8, w, 2);
    }),

    gravel: make(128, 128, (g, w, h) => {
      g.fillStyle = '#85827b';
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 1800, ['#6e6b65', '#9a978f', '#77746d', '#a6a39b', '#5e5c57'], 3);
    }),

    asphaltPlain: make(512, 512, (g, w) => paintAsphaltBase(g, w, 13)),

    // Kachel 8 m (u) x 22 m (v): 2x2 Spuren, Mittelstreifen, Seitenstreifen
    highway: make(128, 352, (g, w, h) => {
      const m = 16; // px pro Meter
      // feiner Asphalt (gleiche Körnung wie die Stadtstraßen): 128-px-Kachel nahtlos übereinander
      const base = document.createElement('canvas');
      base.width = base.height = 128;
      paintAsphaltBase(base.getContext('2d')!, 128, 19);
      for (let y = 0; y < h; y += 128) g.drawImage(base, 0, y);
      g.fillStyle = '#8f8d86'; // Mittelstreifen (Beton)
      g.fillRect(0, 9.5 * m, w, 3 * m);
      g.fillStyle = '#e8e8e8';
      for (const y of [2.5, 19.5]) g.fillRect(0, y * m - 2, w, 4); // Randlinien
      for (const y of [9.5, 12.5]) g.fillRect(0, y * m - 2, w, 4);
      for (const y of [6, 16]) {
        for (let x = 0; x < w; x += 64) g.fillRect(x, y * m - 2, 32, 4); // Trennlinien gestrichelt
      }
    }),

    floor: make(128, 128, (g, w, h) => {
      const cols = ['#a8814f', '#9a7545', '#b08a57', '#a07a49'];
      for (let x = 0, i = 0; x < w; x += 32, i++) {
        g.fillStyle = cols[i % cols.length];
        g.fillRect(x, 0, 32, h);
        g.fillStyle = 'rgba(60,35,15,0.5)';
        g.fillRect(x, 0, 2, h);
        for (let k = 0; k < 8; k++) {
          g.fillStyle = 'rgba(60,35,15,0.12)';
          g.fillRect(x + 4 + Math.random() * 22, Math.random() * h, 1, 10 + Math.random() * 20);
        }
      }
    }),
  };
  return cache;
}
