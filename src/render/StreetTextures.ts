import * as THREE from 'three';

/**
 * Prozedurale Texturen für Straßen und Gehwege: feiner Asphalt (kachelbar), Bordstein, Rinnenpflaster,
 * Aufleger mit Alpha (Risse, Flicken, Flecken, Fahrspuren, Farbabrieb), Kanaldeckel, Gully und Autoschatten.
 * Alle Aufleger sind hell gezeichnet und werden über die Instanzfarbe eingefärbt.
 */

/** Deterministischer Zufall: Texturen sehen bei jedem Start gleich aus */
function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Kachelbares Wertrauschen (n x n Pixel, Gitterweite `cell` Pixel), Werte 0..1 */
function tileNoise(n: number, cell: number, r: () => number): Float32Array {
  const L = Math.max(1, Math.round(n / cell));
  const lat = new Float32Array(L * L).map(() => r());
  const out = new Float32Array(n * n);
  const sm = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < n; y++) {
    const fy = (y / n) * L, y0 = Math.floor(fy), ty = sm(fy - y0);
    for (let x = 0; x < n; x++) {
      const fx = (x / n) * L, x0 = Math.floor(fx), tx = sm(fx - x0);
      const a = lat[(y0 % L) * L + (x0 % L)], b = lat[(y0 % L) * L + ((x0 + 1) % L)];
      const c = lat[((y0 + 1) % L) * L + (x0 % L)], d = lat[((y0 + 1) % L) * L + ((x0 + 1) % L)];
      out[y * n + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat: boolean, color = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Gewundene Linie (Riss) von (x0,y0) in Richtung a */
function crackPath(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, a: number, len: number, step: number): void {
  g.beginPath();
  g.moveTo(x, y);
  for (let s = 0; s < len; s += step) {
    a += (r() - 0.5) * 0.9;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    g.lineTo(x, y);
  }
  g.stroke();
}

/**
 * Asphalt-Grundfläche (kachelbar, 512 px für 8 m): Gesteinskörnung, Bindemittel, wolkige Alterung, feine Haarrisse.
 * Wird von den Straßen mit Weltkoordinaten-UV benutzt und ist auch die Basis der Pfadtextur mit Linien.
 */
export function paintAsphaltBase(g: CanvasRenderingContext2D, n: number, seed = 7): void {
  const r = rand(seed);
  const low = tileNoise(n, n / 4, r), mid = tileNoise(n, n / 16, r), fine = tileNoise(n, 6, r);
  const img = g.createImageData(n, n);
  const d = img.data;
  for (let i = 0; i < n * n; i++) {
    // Grundton: verwittertes Grau, großflächig leicht wolkig
    let v = 66 + (low[i] - 0.5) * 16 + (mid[i] - 0.5) * 10 + (fine[i] - 0.5) * 8 + (r() - 0.5) * 14;
    const k = r();
    if (k < 0.05) v += 26 + r() * 30; // helle Splittkörner
    else if (k < 0.1) v -= 14 + r() * 10; // Bindemittel / Poren
    const warm = (low[i] - 0.5) * 3;
    d[i * 4] = v + warm;
    d[i * 4 + 1] = v + warm * 0.6;
    d[i * 4 + 2] = v + 3;
    d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // feine Haarrisse und ein paar ausgewaschene Stellen
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    g.strokeStyle = `rgba(28,28,30,${0.25 + r() * 0.25})`;
    g.lineWidth = 0.8 + r() * 0.8;
    crackPath(g, r, r() * n, r() * n, r() * 6.3, 30 + r() * 70, 4);
  }
  for (let i = 0; i < 14; i++) {
    const x = r() * n, y = r() * n, rad = 6 + r() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const light = r() < 0.5;
    gr.addColorStop(0, light ? 'rgba(150,148,140,0.10)' : 'rgba(20,20,22,0.14)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

export interface StreetTex {
  /** Asphalt ohne Linien, 8 m Kachel (Weltkoordinaten) */
  street: THREE.CanvasTexture;
  /** Bordstein: 1 m lang (u), Profil 0,3 m (v), Stoßfuge am Rand */
  curb: THREE.CanvasTexture;
  /** Rinne aus Granitpflaster, 1 m Kachel (Weltkoordinaten) */
  cobble: THREE.CanvasTexture;
  /** Farbabrieb für Markierungen, 5 m Kachel (Weltkoordinaten); Alpha = Deckkraft */
  paint: THREE.CanvasTexture;
  crack: THREE.CanvasTexture;
  patch: THREE.CanvasTexture;
  stain: THREE.CanvasTexture;
  track: THREE.CanvasTexture;
  pothole: THREE.CanvasTexture;
  grate: THREE.CanvasTexture;
  manhole: THREE.CanvasTexture;
  /** weicher Kontaktschatten unter Autos (Alpha) */
  blob: THREE.CanvasTexture;
}

let cache: StreetTex | null | undefined;

/** Gibt null zurück, wenn kein DOM vorhanden ist (Tests). */
export function streetTextures(): StreetTex | null {
  if (cache !== undefined) return cache;
  if (typeof document === 'undefined') return (cache = null);
  const r = rand(4242);

  // --- Asphalt ---
  const [sc, sg] = canvas(512, 512);
  paintAsphaltBase(sg, 512);

  // --- Bordstein: heller Beton mit Körnung, dunkle Stoßfuge, unten schmutziger ---
  const [cc, cg] = canvas(256, 96);
  {
    const fine = tileNoise(256, 8, r);
    const img = cg.createImageData(256, 96);
    for (let y = 0; y < 96; y++) {
      for (let x = 0; x < 256; x++) {
        const i = y * 256 + x;
        let v = 182 + (fine[(y % 96) * 256 + x] - 0.5) * 18 + (r() - 0.5) * 16;
        if (r() < 0.04) v -= 30;
        v -= Math.max(0, (y - 52) / 44) * 46; // Spritzwasser an der Straßenseite (unten im Profil)
        img.data[i * 4] = v + 2;
        img.data[i * 4 + 1] = v;
        img.data[i * 4 + 2] = v - 5;
        img.data[i * 4 + 3] = 255;
      }
    }
    cg.putImageData(img, 0, 0);
    cg.fillStyle = 'rgba(40,38,34,0.85)';
    cg.fillRect(0, 0, 3, 96);
    cg.fillStyle = 'rgba(255,255,250,0.25)';
    cg.fillRect(3, 0, 2, 96);
    cg.fillStyle = 'rgba(70,90,50,0.35)';
    for (let i = 0; i < 6; i++) cg.fillRect(r() * 256, 60 + r() * 30, 2 + r() * 6, 2 + r() * 4);
  }

  // --- Rinne: Granitpflaster 0,125 m im Reihenverband ---
  const [kc, kg] = canvas(256, 256);
  {
    kg.fillStyle = '#4a4844';
    kg.fillRect(0, 0, 256, 256);
    const s = 32;
    for (let row = 0; row < 8; row++) {
      const off = row % 2 ? s / 2 : 0;
      for (let col = -1; col < 8; col++) {
        const x = col * s + off, y = row * s;
        const v = 110 + r() * 45;
        kg.fillStyle = `rgb(${v + 4},${v},${v - 6})`;
        kg.beginPath();
        kg.roundRect(x + 2, y + 2, s - 4, s - 4, 6);
        kg.fill();
        kg.fillStyle = 'rgba(255,255,250,0.18)';
        kg.fillRect(x + 5, y + 4, s - 12, 3);
        for (let k = 0; k < 18; k++) {
          kg.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.12)';
          kg.fillRect(x + 3 + r() * (s - 6), y + 3 + r() * (s - 6), 1.5, 1.5);
        }
      }
    }
  }

  // --- Farbabrieb: meist deckend, mit Löchern, Kornstruktur und ausgefransten Stellen ---
  const [pc, pg] = canvas(256, 256);
  {
    const low = tileNoise(256, 48, r), mid = tileNoise(256, 12, r);
    const img = pg.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const wear = low[i] * 0.6 + mid[i] * 0.4;
      let a = 0.95 - Math.max(0, wear - 0.55) * 1.6;
      if (r() < 0.1) a *= 0.55;
      const v = 235 - r() * 25;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = a * 255;
    }
    pg.putImageData(img, 0, 0);
  }

  // --- Riss: verzweigte Linie quer über die Kachel ---
  const [rc, rg] = canvas(256, 64);
  {
    rg.lineCap = rg.lineJoin = 'round';
    rg.strokeStyle = 'rgba(255,255,255,0.95)';
    rg.lineWidth = 2.4;
    const pts: [number, number][] = [];
    let x = 6, y = 32, a = 0;
    rg.beginPath();
    rg.moveTo(x, y);
    while (x < 250) {
      a = Math.max(-0.7, Math.min(0.7, a + (r() - 0.5) * 0.8));
      x += 6;
      y = Math.max(8, Math.min(56, y + Math.sin(a) * 6));
      rg.lineTo(x, y);
      pts.push([x, y]);
    }
    rg.stroke();
    rg.lineWidth = 1.2;
    rg.strokeStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 6; i++) {
      const [bx, by] = pts[Math.floor(r() * pts.length)];
      crackPath(rg, r, bx, by, (r() < 0.5 ? -1 : 1) * (0.8 + r() * 0.8), 10 + r() * 24, 4);
    }
  }

  // --- Flicken: unregelmäßiges Rechteck, frischerer Asphalt, dunkle Vergussfuge ---
  const [fc, fg] = canvas(256, 256);
  {
    const poly: [number, number][] = [];
    const corners: [number, number][] = [[14, 14], [242, 14], [242, 242], [14, 242]];
    for (let c = 0; c < 4; c++) {
      const [x0, y0] = corners[c], [x1, y1] = corners[(c + 1) % 4];
      for (let t = 0; t < 1; t += 0.125) poly.push([x0 + (x1 - x0) * t + (r() - 0.5) * 12, y0 + (y1 - y0) * t + (r() - 0.5) * 12]);
    }
    fg.beginPath();
    poly.forEach(([x, y], i) => (i ? fg.lineTo(x, y) : fg.moveTo(x, y)));
    fg.closePath();
    fg.save();
    fg.clip();
    const img = fg.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      let v = 205 + (r() - 0.5) * 40;
      if (r() < 0.04) v += 30;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    const [tc, tg] = canvas(256, 256);
    tg.putImageData(img, 0, 0);
    fg.drawImage(tc, 0, 0);
    fg.restore();
    fg.strokeStyle = 'rgba(90,90,92,1)';
    fg.lineWidth = 7;
    fg.stroke();
  }

  // --- Fleck (Öl, Wasser): weicher, ausgefranster Klecks ---
  const [oc, og] = canvas(128, 128);
  {
    for (let i = 0; i < 7; i++) {
      const x = 64 + (r() - 0.5) * 40, y = 64 + (r() - 0.5) * 40, rad = 18 + r() * 26;
      const gr = og.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)');
      gr.addColorStop(0.6, 'rgba(255,255,255,0.3)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      og.fillStyle = gr;
      og.fillRect(0, 0, 128, 128);
    }
  }

  // --- Fahrspur: abgefahrenes, dunkleres Band, quer (v) weich auslaufend ---
  const [tc2, tg2] = canvas(8, 64);
  {
    const gr = tg2.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.3, 'rgba(255,255,255,0.32)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.32)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    tg2.fillStyle = gr;
    tg2.fillRect(0, 0, 8, 64);
  }

  // --- Schlagloch: dunkle Mulde mit aufgebrochenem Rand und Splitt ---
  const [hc, hg] = canvas(128, 128);
  {
    hg.beginPath();
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, rad = 38 + r() * 18;
      const x = 64 + Math.cos(a) * rad, y = 64 + Math.sin(a) * rad * 0.8;
      i ? hg.lineTo(x, y) : hg.moveTo(x, y);
    }
    hg.closePath();
    hg.fillStyle = 'rgba(150,150,150,1)';
    hg.fill();
    hg.lineWidth = 5;
    hg.strokeStyle = 'rgba(255,255,255,0.9)';
    hg.stroke();
    const gr = hg.createRadialGradient(64, 64, 4, 64, 64, 46);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    hg.fillStyle = gr;
    hg.fill();
    for (let i = 0; i < 40; i++) {
      hg.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '40,40,40'},0.7)`;
      hg.fillRect(20 + r() * 88, 20 + r() * 88, 2 + r() * 2, 2 + r() * 2);
    }
  }

  // --- Gully: Rahmen mit Schlitzen ---
  const [gc, gg] = canvas(128, 64);
  {
    gg.fillStyle = '#9a9a9c';
    gg.fillRect(0, 0, 128, 64);
    gg.fillStyle = '#5c5d60';
    gg.fillRect(6, 6, 116, 52);
    gg.fillStyle = '#161618';
    for (let x = 12; x < 116; x += 12) gg.fillRect(x, 11, 6, 42);
    gg.fillStyle = 'rgba(120,80,40,0.35)';
    for (let i = 0; i < 12; i++) gg.fillRect(r() * 128, r() * 64, 4 + r() * 6, 2 + r() * 4);
  }

  // --- Kanaldeckel: Gusseisen mit Ring, Noppenmuster und Rost ---
  const [mc, mg] = canvas(256, 256);
  {
    mg.fillStyle = '#4a4b4f';
    mg.fillRect(0, 0, 256, 256);
    mg.beginPath();
    mg.arc(128, 128, 122, 0, Math.PI * 2);
    mg.fillStyle = '#2e2f33';
    mg.fill();
    mg.beginPath();
    mg.arc(128, 128, 108, 0, Math.PI * 2);
    mg.fillStyle = '#3d3e42';
    mg.fill();
    mg.save();
    mg.clip();
    mg.fillStyle = '#56575c';
    for (let y = 26; y < 240; y += 16) {
      for (let x = 26 + ((y / 16) % 2) * 8; x < 240; x += 16) {
        mg.fillRect(x - 3, y - 3, 6, 6);
      }
    }
    for (let i = 0; i < 16; i++) {
      const x = 30 + r() * 196, y = 30 + r() * 196, rad = 6 + r() * 22;
      const gr = mg.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(120,70,35,0.45)');
      gr.addColorStop(1, 'rgba(120,70,35,0)');
      mg.fillStyle = gr;
      mg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    mg.restore();
    mg.strokeStyle = 'rgba(150,150,155,0.55)';
    mg.lineWidth = 3;
    mg.beginPath();
    mg.arc(128, 128, 108, 0, Math.PI * 2);
    mg.stroke();
    mg.fillStyle = '#2a2b2e';
    for (const a of [0.4, 0.4 + Math.PI]) {
      mg.beginPath();
      mg.ellipse(128 + Math.cos(a) * 80, 128 + Math.sin(a) * 80, 10, 5, a, 0, Math.PI * 2);
      mg.fill();
    }
  }

  // --- Kontaktschatten: abgerundetes Rechteck, nach außen weich ---
  const [bc, bg] = canvas(128, 128);
  {
    const img = bg.createImageData(128, 128);
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const dx = Math.max(0, Math.abs(x - 63.5) - 30) / 34, dy = Math.max(0, Math.abs(y - 63.5) - 22) / 42;
        const d = Math.min(1, Math.hypot(dx, dy));
        const a = (1 - d) * (1 - d);
        const i = (y * 128 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = a * 255;
      }
    }
    bg.putImageData(img, 0, 0);
  }

  cache = {
    street: tex(sc, true), curb: tex(cc, true), cobble: tex(kc, true), paint: tex(pc, true),
    crack: tex(rc, false), patch: tex(fc, false), stain: tex(oc, false), track: tex(tc2, true), pothole: tex(hc, false),
    grate: tex(gc, false), manhole: tex(mc, false), blob: tex(bc, false),
  };
  return cache;
}
