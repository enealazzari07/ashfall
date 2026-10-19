/**
 * Zeichenfunktionen für Hauswände: drei weitere Wandarten (Rauputz, Klinker, Plattenbau) und Verschleiß
 * (Graffiti, Risse, abgeplatzter Putz, Flecken, Einschüsse, Ruß) als durchsichtige Fläche über der Wand.
 */
type G = CanvasRenderingContext2D;

function speckle(g: G, w: number, h: number, n: number, colors: string[], max = 3): void {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * (max - 1), 1 + Math.random() * (max - 1));
  }
}

/** Kachel 4 m x 3 m: Rauputz (Graustufen, wird eingefärbt) mit abgeplatzten Stellen, Rissen und Feuchte am Sockel */
export function drawStucco(g: G, w: number, h: number): void {
  g.fillStyle = '#d8d6d0';
  g.fillRect(0, 0, w, h);
  speckle(g, w, h, 2600, ['#c8c6c0', '#e6e4de', '#bcbab4', '#ecebe6'], 2);
  // abgeplatzte Stellen: darunter schaut der Backstein hervor
  for (let k = 0; k < 3; k++) {
    const cx = 30 + Math.random() * (w - 60), cy = 30 + Math.random() * (h - 80), rr = 12 + Math.random() * 16;
    g.save();
    g.beginPath();
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2, rad = rr * (0.6 + Math.random() * 0.6);
      g.lineTo(cx + Math.cos(ang) * rad * 1.4, cy + Math.sin(ang) * rad);
    }
    g.closePath();
    g.clip();
    g.fillStyle = '#6a4238';
    g.fillRect(cx - 40, cy - 30, 80, 60);
    for (let y = cy - 30, row = 0; y < cy + 30; y += 6, row++) {
      for (let x = cx - 40 - (row % 2) * 7; x < cx + 40; x += 15) {
        g.fillStyle = ['#9a4a3a', '#8c4234', '#a85644', '#843e32'][Math.floor(Math.random() * 4)];
        g.fillRect(x, y, 14, 5);
      }
    }
    g.restore();
    g.strokeStyle = 'rgba(40,36,30,0.55)';
    g.lineWidth = 1.5;
    g.stroke();
  }
  g.strokeStyle = 'rgba(40,36,30,0.45)';
  g.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    let x = Math.random() * w, y = Math.random() * h * 0.5;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 7; k++) g.lineTo((x += (Math.random() - 0.5) * 14), (y += 4 + Math.random() * 9));
    g.stroke();
  }
  const damp = g.createLinearGradient(0, h * 0.7, 0, h);
  damp.addColorStop(0, 'rgba(60,66,40,0)');
  damp.addColorStop(1, 'rgba(60,66,40,0.38)');
  g.fillStyle = damp;
  g.fillRect(0, 0, w, h);
}

/** Kachel 4 m x 3 m: Klinker, hell mit dunklen Brandsteinen und dunklen Zierschichten (wird eingefärbt) */
export function drawClinker(g: G, w: number, h: number): void {
  g.fillStyle = '#5a5650';
  g.fillRect(0, 0, w, h);
  const bw = 15, bh = 5;
  const cols = ['#c8c0b0', '#d4ccba', '#b8b0a0', '#a8a090', '#dcd4c2', '#6e665a', '#c0b8a8'];
  for (let y = 0, row = 0; y < h; y += bh + 1, row++) {
    for (let x = -(row % 2) * (bw / 2); x < w; x += bw + 1) {
      g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
      g.fillRect(x, y, bw, bh);
      g.fillStyle = 'rgba(255,255,255,0.1)';
      g.fillRect(x, y, bw, 1);
    }
    if (row % 8 === 7) {
      g.fillStyle = '#7a7266';
      g.fillRect(0, y, w, bh);
    }
  }
  speckle(g, w, h, 600, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.06)'], 2);
  const sooty = g.createLinearGradient(0, 0, 0, h);
  sooty.addColorStop(0, 'rgba(0,0,0,0.18)');
  sooty.addColorStop(0.3, 'rgba(0,0,0,0)');
  sooty.addColorStop(1, 'rgba(20,15,10,0.25)');
  g.fillStyle = sooty;
  g.fillRect(0, 0, w, h);
}

/** Kachel 4 m x 3 m: Betonplatten eines Plattenbaus mit Fugen, Schraubenköpfen und Rostfahnen */
export function drawPanel(g: G, w: number, h: number): void {
  g.fillStyle = '#c4c3bd';
  g.fillRect(0, 0, w, h);
  speckle(g, w, h, 2000, ['#b6b5af', '#cfcec8', '#aaa9a3'], 2);
  g.fillStyle = 'rgba(30,30,28,0.55)';
  g.fillRect(w / 2 - 1, 0, 3, h);
  g.fillRect(0, h / 2 - 1, w, 3);
  g.fillRect(0, h - 3, w, 3);
  g.fillStyle = 'rgba(70,70,66,0.55)';
  for (const [bx, by] of [[10, 10], [w / 2 - 12, 10], [w / 2 + 10, 10], [w - 10, 10], [10, h / 2 - 10], [w - 10, h / 2 - 10]]) {
    g.beginPath();
    g.arc(bx, by, 2, 0, 6.3);
    g.fill();
  }
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * w;
    const grad = g.createLinearGradient(x, 0, x, h);
    const rust = Math.random() < 0.35;
    grad.addColorStop(0, rust ? 'rgba(140,80,40,0)' : 'rgba(40,45,50,0)');
    grad.addColorStop(0.35, rust ? 'rgba(140,80,40,0.28)' : 'rgba(40,45,50,0.16)');
    grad.addColorStop(1, 'rgba(40,45,50,0)');
    g.fillStyle = grad;
    g.fillRect(x, 0, 2 + Math.random() * 6, h);
  }
}

export type WearKind = 'tag' | 'crack' | 'peel' | 'stain' | 'holes' | 'soot';
export const WEAR_VARIANTS = 12;

/** Verschleiß (256 x 256, durchsichtiger Hintergrund). Gleiche Variante = gleiches Bild. */
export function drawWear(kind: WearKind, variant: number): (g: G, w: number, h: number) => void {
  return (g, w, h) => {
    let a = ((variant + 1) * 2654435761) >>> 0;
    const rnd = (): number => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pickR = <T,>(l: T[]): T => l[Math.floor(rnd() * l.length)];
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (kind === 'tag') {
      const words = ['ASHFALL', 'RIP', 'HELP', 'DEAD', 'RUN', 'NO MORE', 'ZED', 'LIVE', 'EXIT', 'WHY'];
      const col = pickR(['#e03a3a', '#2fa8e0', '#e8d12a', '#44c46a', '#f2f2f2', '#e07a1c', '#b64ae0', '#151515']);
      const style = rnd();
      g.save();
      g.translate(w / 2, h / 2);
      g.rotate((rnd() - 0.5) * 0.4);
      if (style < 0.62) {
        const word = pickR(words);
        const size = word.length > 5 ? 54 : 84;
        g.font = `italic 900 ${size}px Impact, "Arial Black", sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 12;
        g.strokeStyle = col === '#151515' ? 'rgba(240,240,240,0.9)' : 'rgba(20,20,20,0.85)';
        g.strokeText(word, 0, 0);
        g.fillStyle = col;
        g.fillText(word, 0, 0);
        // Farbnasen unter den Buchstaben
        g.strokeStyle = col;
        g.lineWidth = 3;
        const half = g.measureText(word).width / 2;
        for (let i = 0; i < 5; i++) {
          const x = (rnd() * 2 - 1) * half * 0.9, y0 = size * 0.25;
          g.beginPath();
          g.moveTo(x, y0);
          g.lineTo(x, y0 + 14 + rnd() * 44);
          g.stroke();
        }
      } else if (style < 0.82) {
        g.strokeStyle = col;
        g.lineWidth = 12;
        g.beginPath();
        g.arc(0, 0, 80, 0, 6.3);
        g.stroke();
        g.beginPath();
        g.moveTo(-60, -60);
        g.lineTo(60, 60);
        g.moveTo(60, -60);
        g.lineTo(-60, 60);
        g.stroke();
      } else {
        g.strokeStyle = col;
        g.lineWidth = 11;
        g.beginPath();
        g.moveTo(-90, 30);
        g.bezierCurveTo(-40, -70, 20, 80, 80, -10);
        g.stroke();
        g.beginPath();
        g.moveTo(52, -26);
        g.lineTo(84, -10);
        g.lineTo(62, 18);
        g.stroke();
      }
      g.restore();
    } else if (kind === 'crack') {
      g.strokeStyle = 'rgba(25,22,18,0.8)';
      const x0 = 40 + rnd() * 170;
      for (let b = 0; b < 3; b++) {
        let cx = x0 + (b ? (rnd() - 0.5) * 30 : 0), cy = 6 + (b ? 50 + rnd() * 60 : 0);
        g.lineWidth = b === 0 ? 2.5 : 1.5;
        g.beginPath();
        g.moveTo(cx, cy);
        const steps = b === 0 ? 14 : 6;
        for (let k = 0; k < steps; k++) {
          cx += (rnd() - 0.5) * 30;
          cy += 10 + rnd() * 14;
          g.lineTo(cx, cy);
        }
        g.stroke();
      }
    } else if (kind === 'peel') {
      const cx = w / 2 + (rnd() - 0.5) * 40, cy = h / 2 + (rnd() - 0.5) * 40, rr = 60 + rnd() * 34;
      g.beginPath();
      for (let k = 0; k < 14; k++) {
        const ang = (k / 14) * Math.PI * 2, rad = rr * (0.55 + rnd() * 0.55);
        g.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.85);
      }
      g.closePath();
      g.save();
      g.clip();
      g.fillStyle = '#6a4238';
      g.fillRect(0, 0, w, h);
      for (let y = 0, row = 0; y < h; y += 12, row++) {
        for (let x = -(row % 2) * 15; x < w; x += 31) {
          g.fillStyle = pickR(['#9a4a3a', '#8c4234', '#a85644', '#843e32', '#7c3a30']);
          g.fillRect(x, y, 29, 10);
        }
      }
      g.restore();
      g.strokeStyle = 'rgba(230,226,214,0.9)';
      g.lineWidth = 5;
      g.stroke();
      g.strokeStyle = 'rgba(30,26,22,0.5)';
      g.lineWidth = 1.5;
      g.stroke();
    } else if (kind === 'stain') {
      for (let k = 0; k < 7; k++) {
        const x = 20 + rnd() * (w - 40), len = 90 + rnd() * 150, wd = 6 + rnd() * 18;
        const grad = g.createLinearGradient(0, 0, 0, len);
        const mold = rnd() < 0.3;
        grad.addColorStop(0, mold ? 'rgba(50,70,40,0.5)' : 'rgba(40,36,30,0.5)');
        grad.addColorStop(1, 'rgba(40,36,30,0)');
        g.save();
        g.translate(x, 0);
        g.fillStyle = grad;
        g.fillRect(-wd / 2, 0, wd, len);
        g.restore();
      }
    } else if (kind === 'holes') {
      for (let k = 0; k < 6 + Math.floor(rnd() * 6); k++) {
        const x = 40 + rnd() * 176, y = 40 + rnd() * 176;
        g.fillStyle = 'rgba(20,18,15,0.9)';
        g.beginPath();
        g.arc(x, y, 3 + rnd() * 3, 0, 6.3);
        g.fill();
        g.strokeStyle = 'rgba(30,26,22,0.55)';
        g.lineWidth = 1.5;
        for (let r2 = 0; r2 < 4; r2++) {
          const ang = rnd() * 6.3;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(ang) * (8 + rnd() * 14), y + Math.sin(ang) * (8 + rnd() * 14));
          g.stroke();
        }
      }
    } else {
      // Ruß: vom unteren Rand nach oben auslaufend
      const grad = g.createRadialGradient(w / 2, h, 4, w / 2, h * 0.7, h * 0.75);
      grad.addColorStop(0, 'rgba(16,14,12,0.85)');
      grad.addColorStop(0.6, 'rgba(16,14,12,0.4)');
      grad.addColorStop(1, 'rgba(16,14,12,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(w / 2, h * 0.75, w * 0.38, h * 0.52, 0, 0, 6.3);
      g.fill();
    }
  };
}
