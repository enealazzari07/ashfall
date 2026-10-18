import * as THREE from 'three';
import { CarModelSpec, modelOf } from '../render/CarModel';

export interface DriveInput {
  throttle: number; // 0..1
  brake: number; // 0..1 (S: bremst, steht das Auto, fährt es rückwärts)
  steer: number; // -1..1, positiv = links
  handbrake: boolean;
}

export type Zone = 'front' | 'rear' | 'left' | 'right';

export interface CrashEvent {
  /** Aufprallgeschwindigkeit entlang der Hindernisnormalen (m/s) */
  strength: number;
  zone: Zone;
  /** Normale vom Hindernis zum Auto */
  nx: number;
  nz: number;
  /** Kontaktpunkt (Welt) */
  x: number;
  z: number;
  /** abgezogene Gesundheit */
  damage: number;
}

const MAX_FWD = 33; // m/s ≈ 119 km/h
const MAX_REV = 7;
const ACCEL = 7.5;
const BRAKE = 15;
const HANDBRAKE = 10;
const ROLL = 0.5; // Ausrollen (m/s²)
const DRAG = 0.0022;
const BOUNCE = 0.42; // Rückprall-Anteil
const SAFE_IMPACT = 3; // m/s: darunter kein Schaden
const DAMAGE_PER_MS = 3.2;
/** Obergrenze je Gang (m/s) */
export const GEAR_MAX = [9, 16, 23, 30, 36];
export const IDLE_RPM = 850;
export const REDLINE = 6500;

export class Vehicle {
  /** rot: wie THREE-Rotation um y; Fahrtrichtung = (cos rot, -sin rot) */
  rot: number;
  speed = 0; // m/s, vorwärts positiv
  steerAngle = 0; // rad, positiv = links
  rpm = IDLE_RPM;
  /** -1 = R, 0 = N, 1..5 */
  gear = 0;
  odo = 0; // m
  lights = false;
  braking = false;
  handbrake = false;
  /** Seitliches Rutschen nach Stößen (m/s, Welt) */
  slide = { x: 0, z: 0 };
  /** Drehung nach Stößen (rad/s) */
  yawRate = 0;
  /** Motor läuft? Ohne Motor rollt das Auto nur aus. */
  engineOn = true;
  /** Leistungsfaktor aus dem Motorzustand (0..1) */
  engineFactor = 1;
  /** 100 = neu, 0 = Totalschaden */
  health = 100;
  zones: Record<Zone, number> = { front: 0, rear: 0, left: 0, right: 0 };
  /** Stärke des letzten Aufpralls (m/s), wird von außen gelesen und zurückgesetzt */
  impact = 0;
  /** Letzter Aufprall (von außen lesen und auf null setzen) */
  crash: CrashEvent | null = null;

  /** Maße des Modells: Kollisionskreise entlang der Länge, Radius, Achsstand */
  readonly dims: CarModelSpec;
  readonly bodyR: number;
  readonly offsets: number[];
  readonly wheelbase: number;

  constructor(public x: number, public z: number, rot: number, readonly color: number, readonly model = 0) {
    this.rot = rot;
    this.dims = modelOf(model);
    this.bodyR = this.dims.W / 2 + 0.04;
    this.offsets = [-this.dims.len * 0.3, 0, this.dims.len * 0.3];
    this.wheelbase = this.dims.frontAxle - this.dims.rearAxle;
  }

  get kmh(): number {
    return Math.abs(this.speed) * 3.6;
  }

  get totalled(): boolean {
    return this.health <= 0;
  }

  /** Bewegt es sich noch (Rollen, Rutschen, Drehen)? */
  get moving(): boolean {
    return Math.abs(this.speed) > 0.01 || Math.hypot(this.slide.x, this.slide.z) > 0.05 || Math.abs(this.yawRate) > 0.01;
  }

  forward(): { x: number; z: number } {
    return { x: Math.cos(this.rot), z: -Math.sin(this.rot) };
  }

  /** Geschwindigkeit in Weltkoordinaten */
  velocity(): { x: number; z: number } {
    const f = this.forward();
    return { x: f.x * this.speed + this.slide.x, z: f.z * this.speed + this.slide.z };
  }

  /** `resolve` schiebt einen Kreis (Radius r) aus Hindernissen heraus (wie ChunkManager.resolve). */
  update(dt: number, inp: DriveInput, resolve: (p: THREE.Vector3, r: number) => void = () => {}): void {
    const v = this.speed;
    this.handbrake = inp.handbrake;
    const dead = this.totalled;
    const power = dead || !this.engineOn ? 0 : (this.health < 50 ? 0.55 + (0.45 * this.health) / 50 : 1) * this.engineFactor;
    let a = 0;
    this.braking = false;

    if (inp.throttle > 0 && power > 0) {
      const room = v < 0 ? 1 : Math.max(0, 1 - (v / MAX_FWD) ** 2);
      a += inp.throttle * ACCEL * power * room * (v < 0 ? 2.2 : 1);
      if (v < 0) this.braking = true;
    }
    if (inp.brake > 0) {
      if (v > 0.4) {
        a -= inp.brake * BRAKE;
        this.braking = true;
      } else if (power > 0) {
        // Rückwärtsgang
        a -= inp.brake * ACCEL * 0.6 * power * Math.max(0, 1 - (-v / MAX_REV) ** 2);
        if (v > 0.05) this.braking = true;
      } else if (v < -0.05) {
        a += inp.brake * BRAKE;
        this.braking = true;
      }
    }
    if (inp.handbrake) {
      a -= Math.sign(v) * Math.min(Math.abs(v) / dt, HANDBRAKE);
      if (Math.abs(v) > 0.3) this.braking = true;
    }
    const coasting = inp.throttle === 0 || power === 0;
    if (coasting && inp.brake === 0) a -= Math.sign(v) * Math.min(Math.abs(v) / dt, ROLL);
    a -= DRAG * v * Math.abs(v);

    let nv = v + a * dt;
    // Bremsen/Rollen überschreitet nie die Null (kein Hin- und Herzittern)
    if ((inp.handbrake || (coasting && inp.brake === 0)) && Math.sign(nv) !== Math.sign(v) && v !== 0) nv = 0;
    this.speed = Math.max(-MAX_REV, Math.min(MAX_FWD, nv));

    // Lenkwinkel: bei Tempo weniger Einschlag; Frontschaden zieht das Auto zur beschädigten Seite
    const maxAngle = 0.62 / (1 + Math.abs(this.speed) / 11);
    const pull = (this.zones.right - this.zones.left) * 0.06 * Math.min(1, Math.abs(this.speed) / 6) + this.zones.front * 0.015 * Math.sign(this.zones.right - this.zones.left);
    const target = inp.steer * maxAngle + pull;
    this.steerAngle += (target - this.steerAngle) * Math.min(1, dt * 7);

    // Kinematisches Fahrradmodell + Rutschen und Drehung aus Stößen
    this.rot += (this.speed / this.wheelbase) * Math.tan(this.steerAngle) * dt + this.yawRate * dt;
    const f = this.forward();
    const dx = f.x * this.speed * dt + this.slide.x * dt, dz = f.z * this.speed * dt + this.slide.z * dt;
    this.x += dx;
    this.z += dz;
    this.odo += Math.hypot(f.x * this.speed * dt, f.z * this.speed * dt);
    const decay = Math.exp(-2.6 * dt);
    this.slide.x *= decay;
    this.slide.z *= decay;
    this.yawRate *= Math.exp(-3.4 * dt);

    this.collide(resolve);
    this.updateEngine();
  }

  /** Geschwindigkeitsänderung (Welt) an einem Punkt relativ zur Mitte: Tempo, Rutschen und Drehung */
  applyImpulse(dvx: number, dvz: number, rx: number, rz: number): void {
    const f = this.forward();
    const dvf = dvx * f.x + dvz * f.z;
    this.speed = Math.max(-MAX_REV * 2, Math.min(MAX_FWD, this.speed + dvf));
    this.slide.x += dvx - dvf * f.x;
    this.slide.z += dvz - dvf * f.z;
    const m = Math.hypot(this.slide.x, this.slide.z);
    if (m > 12) {
      this.slide.x *= 12 / m;
      this.slide.z *= 12 / m;
    }
    const spin = (rz * dvx - rx * dvz) * 0.12;
    this.yawRate = Math.max(-4, Math.min(4, this.yawRate + spin));
  }

  /** Schaden und Ereignis für einen Aufprall; n zeigt vom Hindernis zum Auto */
  hit(strength: number, nx: number, nz: number, cx: number, cz: number): void {
    this.impact = Math.max(this.impact, strength);
    const f = this.forward();
    const a = nx * f.x + nz * f.z;
    const b = nx * f.z - nz * f.x; // >0: Hindernis rechts (Auto wird nach links geschoben)
    const zone: Zone = Math.abs(a) >= Math.abs(b) ? (a < 0 ? 'front' : 'rear') : b > 0 ? 'right' : 'left';
    const damage = strength < SAFE_IMPACT ? 0 : (strength - SAFE_IMPACT) * DAMAGE_PER_MS;
    this.health = Math.max(0, this.health - damage);
    this.zones[zone] = Math.min(1, this.zones[zone] + damage / 40);
    if (!this.crash || strength > this.crash.strength) {
      this.crash = { strength, zone, nx, nz, x: cx, z: cz, damage };
    }
  }

  private collide(resolve: (p: THREE.Vector3, r: number) => void): void {
    const f = this.forward();
    const p = new THREE.Vector3();
    let px = 0, pz = 0;
    let bestPush = 0, bestO = 0;
    for (const o of this.offsets) {
      p.set(this.x + f.x * o, 0, this.z + f.z * o);
      const x0 = p.x, z0 = p.z;
      resolve(p, this.bodyR);
      const dx = p.x - x0, dz = p.z - z0;
      px += dx;
      pz += dz;
      const m = Math.hypot(dx, dz);
      if (m > bestPush) {
        bestPush = m;
        bestO = o;
      }
    }
    const total = Math.hypot(px, pz);
    if (total < 1e-4) return;
    this.x += px / this.offsets.length;
    this.z += pz / this.offsets.length;
    const nx = px / total, nz = pz / total;
    const vel = this.velocity();
    const vn = vel.x * nx + vel.z * nz;
    if (vn >= -0.4) return;
    const j = -(1 + BOUNCE) * vn;
    const rx = f.x * bestO - nx * this.bodyR, rz = f.z * bestO - nz * this.bodyR;
    this.applyImpulse(j * nx, j * nz, rx, rz);
    this.hit(-vn, nx, nz, this.x + rx, this.z + rz);
  }

  private updateEngine(): void {
    const s = Math.abs(this.speed);
    if (!this.engineOn) {
      this.gear = this.speed < -0.3 ? -1 : 0;
      this.rpm += (0 - this.rpm) * 0.15;
      return;
    }
    if (this.totalled) {
      this.gear = 0;
      this.rpm += (0 - this.rpm) * 0.1;
      return;
    }
    if (this.speed < -0.3) {
      this.gear = -1;
      this.rpm = IDLE_RPM + (s / MAX_REV) * 3000;
      return;
    }
    if (s < 0.3) {
      this.gear = 0;
      this.rpm += (IDLE_RPM - this.rpm) * 0.2;
      return;
    }
    let g = 0;
    while (g < GEAR_MAX.length - 1 && s > GEAR_MAX[g] * 0.92) g++;
    this.gear = g + 1;
    const lo = g === 0 ? 0 : GEAR_MAX[g - 1] * 0.62;
    const t = Math.min(1, (s - lo) / (GEAR_MAX[g] - lo));
    this.rpm = IDLE_RPM + Math.max(0.12, t) * (REDLINE - IDLE_RPM) * 0.9;
  }
}

/** Zwei Autos stoßen zusammen: auseinanderschieben, Impuls tauschen, beide nehmen Schaden. */
export function collideVehicles(a: Vehicle, b: Vehicle): boolean {
  const fa = a.forward(), fb = b.forward();
  const R = ((a.bodyR + b.bodyR) / 2) * 0.94;
  let pen = 0, bax = 0, baz = 0, bbx = 0, bbz = 0;
  for (const oa of a.offsets) {
    const ax = a.x + fa.x * oa, az = a.z + fa.z * oa;
    for (const ob of b.offsets) {
      const bx = b.x + fb.x * ob, bz = b.z + fb.z * ob;
      const p = 2 * R - Math.hypot(ax - bx, az - bz);
      if (p > pen) {
        pen = p;
        bax = ax; baz = az; bbx = bx; bbz = bz;
      }
    }
  }
  if (pen <= 0) return false;
  let nx = bax - bbx, nz = baz - bbz;
  const d = Math.hypot(nx, nz);
  if (d < 1e-6) {
    nx = -fa.x;
    nz = -fa.z;
  } else {
    nx /= d;
    nz /= d;
  }
  a.x += (nx * pen) / 2;
  a.z += (nz * pen) / 2;
  b.x -= (nx * pen) / 2;
  b.z -= (nz * pen) / 2;
  const va = a.velocity(), vb = b.velocity();
  const rel = (va.x - vb.x) * nx + (va.z - vb.z) * nz;
  if (rel >= -0.2) return true;
  const j = (-(1 + BOUNCE) * rel) / 2;
  const cx = (bax + bbx) / 2, cz = (baz + bbz) / 2;
  a.applyImpulse(j * nx, j * nz, cx - a.x, cz - a.z);
  b.applyImpulse(-j * nx, -j * nz, cx - b.x, cz - b.z);
  a.hit(-rel, nx, nz, cx, cz);
  b.hit(-rel, -nx, -nz, cx, cz);
  return true;
}
