/**
 * Verhalten eines Zombies, unabhängig von Grafik und Welt (leicht zu testen):
 * Sicht (Sichtkegel, Reichweite nach Licht und Wetter, freie Sichtlinie), Gehör (Geräusche mit Radius, ungenauer Ort
 * hinter Wänden), Gedächtnis und Gruppen mit Anführer.
 */
export type ZState = 'idle' | 'investigate' | 'chase' | 'attack' | 'stagger' | 'dead';

export interface ZType {
  id: 'shambler' | 'fast' | 'sprinter';
  /** Tempo beim Verfolgen in m/s */
  speed: number;
  health: number;
  /** Faktor auf Hörreichweite und Sichtreichweite */
  hearing: number;
  sight: number;
}

export const ZTYPES: Record<ZType['id'], ZType> = {
  shambler: { id: 'shambler', speed: 1.5, health: 28, hearing: 1, sight: 1 },
  fast: { id: 'fast', speed: 2.7, health: 24, hearing: 1.1, sight: 1.1 },
  sprinter: { id: 'sprinter', speed: 4.4, health: 20, hearing: 1.2, sight: 1.2 },
};

export const WANDER_SPEED = 0.7;
export const ATTACK_RANGE = 1.15;
const ATTACK_WINDUP = 0.65;
const ATTACK_COOLDOWN = 1.3;
const CONE_COS = Math.cos((70 * Math.PI) / 180); // 140° Sichtkegel
const NOTICE_NEAR = 2.4; // so nah bemerkt man auch Dinge im Rücken
const SIGHT_MEMORY = 8; // Sekunden, die man der letzten Sicht folgt
const SOUND_MEMORY = 12;
const SENSE_EVERY = 0.25;
const STAGGER_TIME = 0.55;

/** Sichtweite in Metern: hell und klar bis 18, nachts, bei Regen und Wolken weniger */
export function visionRange(night: number, rain: number, clouds = 0): number {
  return Math.min(18, Math.max(7, 18 - 7 * night - 4 * rain - 2 * clouds));
}

/** Lärm des Spielers beim Bewegen (Radius in Metern) */
export function movementNoise(moving: boolean, sprinting: boolean): number {
  return !moving ? 0 : sprinting ? 14 : 5;
}

export interface Sound {
  x: number;
  z: number;
  radius: number;
}

export interface BrainWorld {
  player: { x: number; z: number };
  /** Sichtweite des Spielers für diesen Zombie (siehe `visionRange`) */
  vision: number;
  raining: boolean;
  /** Geräusche seit dem letzten Bild */
  sounds: readonly Sound[];
  /** freie Sichtlinie zwischen zwei Punkten? */
  los(ax: number, az: number, bx: number, bz: number): boolean;
  rand(): number;
  /** Der Spieler steht auf der Etage des Zombies (Zombies schlagen nicht durch die Decke) */
  sameLevel?: boolean;
}

export interface Intent {
  /** Wunschrichtung (normiert) und Tempo in m/s; speed 0 = steht */
  dx: number;
  dz: number;
  speed: number;
  /** Blickrichtung (Rad), wenn gesetzt */
  yaw?: number;
  /** Der Schlag trifft jetzt */
  strike: boolean;
}

export class ZombieBrain {
  state: ZState = 'idle';
  yaw = 0;
  hp: number;
  /** Anführer der Gruppe (null = allein oder selbst Anführer) */
  leader: ZombieBrain | null = null;
  groupId = -1;
  /** Ziel, dem der Zombie gerade folgt (zuletzt gesehen oder gehört) */
  target: { x: number; z: number } | null = null;
  seen = false;
  private memory = 0;
  private senseT: number;
  private soundCooldown = 0;
  private atkT = 0;
  private atkCool = 0;
  private stagger = 0;
  private wanderT = 0;
  private wander: { x: number; z: number } | null = null;
  private react = 0;
  private home: { x: number; z: number };
  /** Vom Weltcode gesetzt: Stand der Bewegung (Hindernis) für das Umgehen */
  detour = 0;

  constructor(
    public x: number,
    public z: number,
    readonly type: ZType,
    seed = 0,
  ) {
    this.hp = type.health;
    this.home = { x, z };
    this.senseT = (seed % 10) * 0.025;
    this.yaw = (seed % 628) / 100;
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  distanceTo(x: number, z: number): number {
    return Math.hypot(this.x - x, this.z - z);
  }

  /** Schaden. Gibt true zurück, wenn der Zombie dabei stirbt. `push`: Richtung des Stoßes. */
  hit(damage: number, pushX = 0, pushZ = 0, from?: { x: number; z: number }): boolean {
    if (!this.alive) return false;
    this.hp -= damage;
    if (this.hp <= 0) {
      this.state = 'dead';
      return true;
    }
    this.state = 'stagger';
    this.stagger = STAGGER_TIME;
    if (from) {
      // wer getroffen wird, weiß, wo der Angreifer steht
      this.target = { x: from.x, z: from.z };
      this.memory = SIGHT_MEMORY;
      this.seen = true;
    }
    this.atkT = 0;
    this.x += pushX;
    this.z += pushZ;
    return false;
  }

  /** Hat etwas gehört: geht dorthin (ungenauer Ort, wenn die Sichtlinie fehlt). */
  hear(x: number, z: number, w: BrainWorld): void {
    const clear = w.los(this.x, this.z, x, z);
    const spread = clear ? 0 : w.raining ? 5 : 2;
    this.target = { x: x + (w.rand() * 2 - 1) * spread, z: z + (w.rand() * 2 - 1) * spread };
    if (this.state !== 'chase' && this.state !== 'attack') this.state = 'investigate';
    this.memory = SOUND_MEMORY;
  }

  update(dt: number, w: BrainWorld): Intent {
    const none: Intent = { dx: 0, dz: 0, speed: 0, strike: false };
    if (this.state === 'dead') return none;
    this.atkCool = Math.max(0, this.atkCool - dt);
    this.soundCooldown = Math.max(0, this.soundCooldown - dt);
    this.react = Math.max(0, this.react - dt);

    if (this.state === 'stagger') {
      this.stagger -= dt;
      if (this.stagger <= 0) this.state = this.seen ? 'chase' : 'idle';
      return none;
    }

    const px = w.player.x, pz = w.player.z;
    const dist = Math.hypot(px - this.x, pz - this.z);

    // Sicht (nicht in jedem Bild prüfen)
    this.senseT -= dt;
    if (this.senseT <= 0) {
      this.senseT = SENSE_EVERY;
      const range = w.vision * this.type.sight;
      let sees = false;
      if (dist <= range) {
        const dirx = (px - this.x) / (dist || 1), dirz = (pz - this.z) / (dist || 1);
        const inCone = Math.sin(this.yaw) * dirx + Math.cos(this.yaw) * dirz >= CONE_COS;
        if ((inCone || dist < NOTICE_NEAR) && w.sameLevel !== false && w.los(this.x, this.z, px, pz)) sees = true;
      }
      this.seen = sees;
      if (sees) {
        this.target = { x: px, z: pz };
        this.memory = SIGHT_MEMORY;
        if (this.state !== 'attack') this.state = 'chase';
      }
    }

    // Gehör
    if (this.soundCooldown <= 0) {
      for (const s of w.sounds) {
        if (Math.hypot(s.x - this.x, s.z - this.z) <= s.radius * this.type.hearing) {
          this.hear(s.x, s.z, w);
          this.soundCooldown = 0.8;
          break;
        }
      }
    }

    // Gruppe: folgt dem Anführer, wenn der etwas verfolgt
    if (this.leader && this.leader.alive && this.state === 'idle' && this.leader.target && (this.leader.state === 'chase' || this.leader.state === 'investigate')) {
      if (this.react <= 0 && !this.target) {
        this.react = 0.4 + w.rand() * 0.8;
        this.target = { x: this.leader.target.x + (w.rand() * 2 - 1) * 3, z: this.leader.target.z + (w.rand() * 2 - 1) * 3 };
        this.state = 'investigate';
        this.memory = SOUND_MEMORY;
      }
    }

    switch (this.state) {
      case 'chase':
      case 'investigate': {
        this.memory -= dt;
        const t = this.target;
        if (!t || this.memory <= 0) {
          this.state = 'idle';
          this.target = null;
          this.home = { x: this.x, z: this.z };
          return none;
        }
        const dx = t.x - this.x, dz = t.z - this.z;
        const d = Math.hypot(dx, dz);
        if (this.state === 'chase' && this.seen && dist <= ATTACK_RANGE && this.atkCool <= 0) {
          this.state = 'attack';
          this.atkT = 0;
          this.yaw = Math.atan2(px - this.x, pz - this.z);
          return { dx: 0, dz: 0, speed: 0, yaw: this.yaw, strike: false };
        }
        if (d < 0.8 && this.state === 'investigate') {
          this.state = 'idle';
          this.target = null;
          return none;
        }
        if (this.state === 'chase' && dist <= ATTACK_RANGE * 0.9) return { dx: 0, dz: 0, speed: 0, yaw: Math.atan2(px - this.x, pz - this.z), strike: false };
        const speed = this.state === 'chase' ? this.type.speed : Math.min(this.type.speed, 1.2);
        const yaw = Math.atan2(dx, dz);
        return this.steer(dx / (d || 1), dz / (d || 1), speed, yaw);
      }

      case 'attack': {
        this.atkT += dt;
        this.yaw = Math.atan2(px - this.x, pz - this.z);
        if (this.atkT >= ATTACK_WINDUP) {
          this.atkCool = ATTACK_COOLDOWN;
          this.state = this.seen ? 'chase' : 'idle';
          return { dx: 0, dz: 0, speed: 0, yaw: this.yaw, strike: dist <= ATTACK_RANGE + 0.35 && w.sameLevel !== false };
        }
        return { dx: 0, dz: 0, speed: 0, yaw: this.yaw, strike: false };
      }

      default: {
        // Umherirren: langsam zu zufälligen Punkten nahe dem Ausgangsort, in der Gruppe nahe beim Anführer
        this.wanderT -= dt;
        const anchor = this.leader && this.leader.alive ? { x: this.leader.x, z: this.leader.z } : this.home;
        if (!this.wander || this.wanderT <= 0) {
          if (w.rand() < 0.45) {
            this.wander = null;
            this.wanderT = 1 + w.rand() * 3;
          } else {
            const a = w.rand() * Math.PI * 2, r = 1 + w.rand() * 5;
            this.wander = { x: anchor.x + Math.cos(a) * r, z: anchor.z + Math.sin(a) * r };
            this.wanderT = 3 + w.rand() * 5;
          }
        }
        if (!this.wander) return none;
        const dx = this.wander.x - this.x, dz = this.wander.z - this.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.5) {
          this.wander = null;
          return none;
        }
        return this.steer(dx / d, dz / d, WANDER_SPEED, Math.atan2(dx, dz));
      }
    }
  }

  /** Weicht bei Hindernissen seitlich aus (`detour` setzt die Welt, wenn der Zombie festhängt). */
  private steer(dx: number, dz: number, speed: number, yaw: number): Intent {
    if (this.detour > 0) {
      const a = (this.detour % 2 === 0 ? 1 : -1) * 1.15;
      const c = Math.cos(a), s = Math.sin(a);
      return { dx: dx * c - dz * s, dz: dx * s + dz * c, speed, yaw, strike: false };
    }
    return { dx, dz, speed, yaw, strike: false };
  }
}
