import { REDLINE } from '../player/Vehicle';

const W = 460, H = 250;
const START = (135 * Math.PI) / 180; // 0 km/h unten links
const SPAN = (270 * Math.PI) / 180;

interface Dial {
  cx: number; cy: number; r: number; max: number; major: number; minor: number; labelStep: number; labelDiv: number; red: number; unit: string;
}

const SPEEDO: Dial = { cx: 230, cy: 128, r: 112, max: 240, major: 20, minor: 10, labelStep: 20, labelDiv: 1, red: 200, unit: 'km/h' };
const RPM: Dial = { cx: 86, cy: 160, r: 72, max: 8000, major: 1000, minor: 500, labelStep: 1000, labelDiv: 1000, red: REDLINE + 300, unit: 'x1000 U/min' };
const FUEL: Dial = { cx: 374, cy: 160, r: 72, max: 1, major: 0.5, minor: 0.25, labelStep: 0, labelDiv: 1, red: 2, unit: '' };

const angleOf = (d: Dial, v: number) => START + (Math.min(Math.max(v, 0), d.max) / d.max) * SPAN;

/** Analoges Kombiinstrument: Tacho in der Mitte, Drehzahlmesser links, Tank/Fahrtinfo rechts. */
export class Speedometer {
  readonly el = document.createElement('div');
  private cv = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private face: HTMLCanvasElement;
  private shown = 0;
  private shownRpm = 0;
  private shownFuel = 0.8;
  private dpr = Math.min(devicePixelRatio || 1, 2);

  constructor() {
    this.el.id = 'speedo';
    this.cv.width = W * this.dpr;
    this.cv.height = H * this.dpr;
    this.cv.style.width = `${W}px`;
    this.cv.style.height = `${H}px`;
    this.el.append(this.cv);
    document.body.append(this.el);
    this.ctx = this.cv.getContext('2d')!;
    this.face = this.buildFace();
  }

  show(on: boolean): void {
    this.el.classList.toggle('on', on);
  }

  /** speed in km/h, rpm in U/min, gear -1 = R, 0 = N; odo in m */
  update(dt: number, kmh: number, rpm: number, gear: number, odo: number, lights: boolean, handbrake: boolean, night: number, health = 100, fuel = 0.82, engineOn = true): void {
    // Nadeln laufen mit leichter Trägheit hinterher
    this.shown += (kmh - this.shown) * Math.min(1, dt * 9);
    this.shownRpm += (rpm - this.shownRpm) * Math.min(1, dt * 12);
    this.shownFuel += (fuel - this.shownFuel) * Math.min(1, dt * 4);
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.drawImage(this.face, 0, 0, W, H);

    // Beleuchtung bei Nacht: Zifferblatt hell, tagsüber blasser
    const glow = 0.25 + 0.75 * Math.max(night, lights ? 0.6 : 0);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = `rgba(120,200,255,${0.05 * glow})`;
    for (const d of [SPEEDO, RPM, FUEL]) {
      c.beginPath();
      c.arc(d.cx, d.cy, d.r, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();

    this.digits(odo, gear, lights, handbrake, health);
    this.needle(SPEEDO, this.shown, 1);
    this.needle(RPM, this.shownRpm, 0.8);
    this.needle(FUEL, this.shownFuel, 0.75);
    this.hub(SPEEDO, 11);
    this.hub(RPM, 7);
    this.hub(FUEL, 7);
    if (!engineOn || fuel < 0.1) {
      c.save();
      c.textAlign = 'center';
      c.font = '700 12px system-ui, sans-serif';
      c.fillStyle = fuel < 0.1 && engineOn ? '#ffb347' : '#ff5a4a';
      c.fillText(!engineOn ? (fuel <= 0 ? 'MOTOR AUS · TANK LEER' : 'MOTOR AUS · E = STARTEN') : 'TANK FAST LEER', SPEEDO.cx, SPEEDO.cy + 92);
      c.restore();
    }
    this.glass();
  }

  private digits(odo: number, gear: number, lights: boolean, handbrake: boolean, health: number): void {
    const c = this.ctx;
    // Kilometerzähler
    const km = (odo / 1000).toFixed(1).padStart(6, '0');
    c.fillStyle = '#0a0b0d';
    this.rr(SPEEDO.cx - 40, SPEEDO.cy + 52, 80, 20, 3);
    c.fill();
    c.strokeStyle = '#444850';
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = '#e8eef4';
    c.font = '600 14px ui-monospace, Consolas, monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(km, SPEEDO.cx, SPEEDO.cy + 63);
    c.fillStyle = '#9aa3ad';
    c.font = '10px system-ui, sans-serif';
    c.fillText('km', SPEEDO.cx + 50, SPEEDO.cy + 63);
    // Gang
    const g = gear === -1 ? 'R' : gear === 0 ? 'N' : `D${gear}`;
    c.font = '700 22px system-ui, sans-serif';
    c.fillStyle = gear === -1 ? '#ff9a3c' : '#e8eef4';
    c.fillText(g, SPEEDO.cx, SPEEDO.cy - 40);
    // Kontrollleuchten
    c.font = '700 11px system-ui, sans-serif';
    c.fillStyle = lights ? '#52d37a' : '#2a2e33';
    c.fillText('LICHT', FUEL.cx, FUEL.cy + 50);
    c.fillStyle = handbrake ? '#ff3b30' : '#2a2e33';
    c.fillText('(P)', RPM.cx, RPM.cy + 50);
    // Motor-/Schadenslampe
    const blink = health <= 0 ? Math.floor(performance.now() / 350) % 2 === 0 : true;
    c.fillStyle = health > 60 ? '#2a2e33' : health > 25 ? '#ffb020' : blink ? '#ff3b30' : '#4a1512';
    c.font = '700 11px system-ui, sans-serif';
    c.fillText(health <= 0 ? 'MOTOR AUS' : 'MOTOR', RPM.cx, RPM.cy - 30);
  }

  private rr(x: number, y: number, w: number, h: number, r: number): void {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  private needle(d: Dial, v: number, scale: number): void {
    const c = this.ctx;
    c.save();
    c.translate(d.cx, d.cy);
    c.rotate(angleOf(d, v));
    c.shadowColor = 'rgba(0,0,0,0.6)';
    c.shadowBlur = 5;
    c.shadowOffsetY = 2;
    const len = d.r * 0.9 * scale + d.r * 0.1;
    const grad = c.createLinearGradient(-16, 0, len, 0);
    grad.addColorStop(0, '#8d1010');
    grad.addColorStop(1, '#ff4a2e');
    c.fillStyle = grad;
    c.beginPath();
    c.moveTo(-d.r * 0.2, -2.6);
    c.lineTo(len, -0.9);
    c.lineTo(len, 0.9);
    c.lineTo(-d.r * 0.2, 2.6);
    c.closePath();
    c.fill();
    c.restore();
  }

  private hub(d: Dial, r: number): void {
    const c = this.ctx;
    const g = c.createRadialGradient(d.cx - r * 0.3, d.cy - r * 0.3, 1, d.cx, d.cy, r);
    g.addColorStop(0, '#e6e8ec');
    g.addColorStop(0.5, '#6b6f77');
    g.addColorStop(1, '#25272b');
    c.fillStyle = g;
    c.beginPath();
    c.arc(d.cx, d.cy, r, 0, Math.PI * 2);
    c.fill();
  }

  /** Dezenter Glasreflex über allem */
  private glass(): void {
    const c = this.ctx;
    const d = SPEEDO;
    c.save();
    c.beginPath();
    c.arc(d.cx, d.cy, d.r, 0, Math.PI * 2);
    c.clip();
    const g = c.createLinearGradient(d.cx - d.r, d.cy - d.r, d.cx + d.r * 0.4, d.cy);
    g.addColorStop(0, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(d.cx - 12, d.cy - d.r * 0.5, d.r * 0.95, d.r * 0.55, -0.15, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  // --- statisches Zifferblatt ------------------------------------------------------------

  private buildFace(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = W * this.dpr;
    cv.height = H * this.dpr;
    const c = cv.getContext('2d')!;
    c.scale(this.dpr, this.dpr);
    // Armaturenbrett-Blende hinter den Uhren
    const bar = c.createLinearGradient(0, 20, 0, H);
    bar.addColorStop(0, 'rgba(18,19,22,0.0)');
    bar.addColorStop(0.35, 'rgba(18,19,22,0.88)');
    bar.addColorStop(1, 'rgba(10,10,12,0.96)');
    c.fillStyle = bar;
    c.beginPath();
    c.moveTo(0, H);
    c.quadraticCurveTo(W / 2, 0, W, H);
    c.fill();
    for (const d of [RPM, FUEL, SPEEDO]) this.dialFace(c, d);
    this.drawLabels(c);
    return cv;
  }

  private dialFace(c: CanvasRenderingContext2D, d: Dial): void {
    // Chromring
    const ring = c.createLinearGradient(d.cx - d.r, d.cy - d.r, d.cx + d.r, d.cy + d.r);
    ring.addColorStop(0, '#f4f6f9');
    ring.addColorStop(0.35, '#7d828a');
    ring.addColorStop(0.6, '#d9dce1');
    ring.addColorStop(1, '#40434a');
    c.fillStyle = ring;
    c.beginPath();
    c.arc(d.cx, d.cy, d.r + 7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#0b0c0e';
    c.beginPath();
    c.arc(d.cx, d.cy, d.r + 2, 0, Math.PI * 2);
    c.fill();
    // Zifferblatt
    const face = c.createRadialGradient(d.cx, d.cy - d.r * 0.2, d.r * 0.1, d.cx, d.cy, d.r);
    face.addColorStop(0, '#23262c');
    face.addColorStop(1, '#0d0e11');
    c.fillStyle = face;
    c.beginPath();
    c.arc(d.cx, d.cy, d.r, 0, Math.PI * 2);
    c.fill();

    const rOut = d.r - 6;
    // roter Bereich
    if (d.red <= d.max) {
      c.strokeStyle = '#c4261b';
      c.lineWidth = 5;
      c.beginPath();
      c.arc(d.cx, d.cy, rOut - 2, angleOf(d, d.red), angleOf(d, d.max));
      c.stroke();
    }
    // Skala
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let v = 0; v <= d.max + 1e-9; v += d.minor) {
      const isMajor = Math.abs(v / d.major - Math.round(v / d.major)) < 1e-6;
      const a = angleOf(d, v);
      const len = isMajor ? d.r * 0.13 : d.r * 0.07;
      c.strokeStyle = v >= d.red ? '#ff6a5a' : '#eef2f6';
      c.lineWidth = isMajor ? 2.2 : 1.2;
      c.beginPath();
      c.moveTo(d.cx + Math.cos(a) * rOut, d.cy + Math.sin(a) * rOut);
      c.lineTo(d.cx + Math.cos(a) * (rOut - len), d.cy + Math.sin(a) * (rOut - len));
      c.stroke();
    }
    if (d.labelStep) {
      c.fillStyle = '#eef2f6';
      c.font = `600 ${Math.round(d.r * 0.14)}px system-ui, sans-serif`;
      for (let v = 0; v <= d.max + 1e-9; v += d.labelStep) {
        const a = angleOf(d, v);
        const rr = rOut - d.r * 0.27;
        c.fillStyle = v >= d.red ? '#ff6a5a' : '#eef2f6';
        c.fillText(String(Math.round(v / d.labelDiv)), d.cx + Math.cos(a) * rr, d.cy + Math.sin(a) * rr);
      }
    }
  }

  private drawLabels(c: CanvasRenderingContext2D): void {
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#9aa3ad';
    c.font = '600 12px system-ui, sans-serif';
    c.fillText('km/h', SPEEDO.cx, SPEEDO.cy + 22);
    c.font = '600 10px system-ui, sans-serif';
    c.fillText('x1000 U/min', RPM.cx, RPM.cy + 26);
    // Tankanzeige
    const f = FUEL;
    c.fillStyle = '#eef2f6';
    c.font = '700 13px system-ui, sans-serif';
    c.fillText('E', f.cx + Math.cos(angleOf(f, 0)) * 42, f.cy + Math.sin(angleOf(f, 0)) * 42);
    c.fillText('F', f.cx + Math.cos(angleOf(f, 1)) * 42, f.cy + Math.sin(angleOf(f, 1)) * 42);
    c.fillStyle = '#9aa3ad';
    c.font = '600 10px system-ui, sans-serif';
    c.fillText('Tank', f.cx, f.cy + 26);
    // kleine Zapfsäule
    c.fillStyle = '#eef2f6';
    c.fillRect(f.cx - 5, f.cy - 30, 8, 11);
    c.fillRect(f.cx + 3, f.cy - 28, 3, 2);
  }
}
