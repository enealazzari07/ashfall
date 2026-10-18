import * as THREE from 'three';
import { rng } from './CityGenerator';

export type WeatherState = 'clear' | 'overcast' | 'rain';

const TARGET: Record<WeatherState, { clouds: number; rain: number }> = {
  clear: { clouds: 0, rain: 0 },
  overcast: { clouds: 0.6, rain: 0 },
  rain: { clouds: 1, rain: 1 },
};

const DROPS = 3500;
const AREA = 40;
const HEIGHT = 25;
const FALL = 24; // m/s
const STREAK = 0.55; // Länge eines Regenstrichs in Metern

export class Weather {
  state: WeatherState = 'clear';
  /** 0..1 – dämpft Licht, verdichtet Nebel */
  clouds = 0;
  /** 0..1 – Regenintensität */
  rain = 0;
  /** 0..1 – wie nass Straßen sind (trocknet langsam ab) */
  wetness = 0;
  /** Regenstriche statt Punkte: wirken mit Wind deutlich echter */
  readonly points: THREE.LineSegments;
  private pos: Float32Array;
  private mat: THREE.LineBasicMaterial;
  private wind = new THREE.Vector2(3, 1.5);
  private timer = 60;
  private rand = rng(Date.now());

  constructor() {
    this.pos = new Float32Array(DROPS * 6);
    for (let i = 0; i < DROPS; i++) {
      const x = (Math.random() - 0.5) * AREA * 2, y = Math.random() * HEIGHT, z = (Math.random() - 0.5) * AREA * 2;
      this.pos.set([x, y, z, x, y + STREAK, z], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xb8cbe0, transparent: true, opacity: 0.5, depthWrite: false });
    this.points = new THREE.LineSegments(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  /** Windgeschwindigkeit in m/s */
  get windSpeed(): number {
    return this.wind.length();
  }

  setState(s: WeatherState): void {
    this.state = s;
  }

  update(dt: number, center: THREE.Vector3, indoors = false): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      const r = this.rand();
      this.state = r < 0.5 ? 'clear' : r < 0.8 ? 'overcast' : 'rain';
      this.timer = 45 + this.rand() * 90;
      const a = this.rand() * Math.PI * 2;
      this.wind.set(Math.cos(a), Math.sin(a)).multiplyScalar(1 + this.rand() * 4);
    }
    const t = TARGET[this.state];
    const k = Math.min(1, dt * 0.2);
    this.clouds += (t.clouds - this.clouds) * k;
    this.rain += (t.rain - this.rain) * k;
    this.wetness += ((this.rain > 0.3 ? 1 : 0) - this.wetness) * Math.min(1, dt * (this.rain > 0.3 ? 0.08 : 0.012));

    this.points.visible = this.rain > 0.05 && !indoors; // im Haus fällt kein Regen
    if (!this.points.visible) return;
    this.mat.opacity = 0.45 * this.rain;
    this.points.position.set(center.x, 0, center.z);
    const active = Math.floor(DROPS * this.rain);
    this.points.geometry.setDrawRange(0, active * 2);
    const wx = this.wind.x, wz = this.wind.y;
    const sx = (wx / FALL) * STREAK, sz = (wz / FALL) * STREAK;
    const p = this.pos;
    for (let i = 0; i < active; i++) {
      const o = i * 6;
      let x = p[o] + wx * dt, y = p[o + 1] - FALL * dt, z = p[o + 2] + wz * dt;
      if (y < 0) {
        y += HEIGHT;
        x = (Math.random() - 0.5) * AREA * 2;
        z = (Math.random() - 0.5) * AREA * 2;
      }
      p[o] = x;
      p[o + 1] = y;
      p[o + 2] = z;
      p[o + 3] = x - sx;
      p[o + 4] = y + STREAK;
      p[o + 5] = z - sz;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
