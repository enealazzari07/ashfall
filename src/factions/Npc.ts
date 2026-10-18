import * as THREE from 'three';
import { FactionDef, FactionId } from '../data/factions';
import { animateCharacter, createCharacter } from '../render/Character';

export type NpcState = 'wander' | 'chase' | 'retreat' | 'travel' | 'talk';

export const WALK_SPEED = 1.3;
export const CHASE_SPEED = 3.9; // schneller als Gehen (3.5), langsamer als Sprinten (6.5)
const TRAVEL_SPEED = 2.6;
const ROB_RANGE = 1.6;
const WANDER_RADIUS = 4.5;

export interface NpcContext {
  player: THREE.Vector3;
  resolve: (pos: THREE.Vector3, radius: number) => void;
  /** Ein Plünderer hat den Spieler erreicht */
  onRob: (npc: Npc) => void;
  rand: () => number;
}

export class Npc {
  readonly mesh = new THREE.Group();
  state: NpcState = 'wander';
  home = new THREE.Vector3();
  /** Spielstunden bis zum Verschwinden; Infinity = bleibt (Lagerbewohner) */
  ttl = Infinity;
  warned = false;
  private body: THREE.Group;
  private target: THREE.Vector3 | null = null;
  private timer = 0;
  private lastPos = new THREE.Vector3();

  constructor(
    readonly id: number,
    readonly def: FactionDef,
    readonly name: string,
    x: number,
    z: number,
  ) {
    this.body = createCharacter({
      jacket: def.color,
      banner: def.color,
      pants: def.id === 'raiders' ? 0x222226 : 0x4a4538,
      hair: def.id === 'farmers' ? 0xb88a4a : 0x2a2018,
    });
    this.mesh.add(this.body);
    this.mesh.position.set(x, 0, z);
    this.home.set(x, 0, z);
    this.timer = Math.random() * 3;
  }

  get factionId(): FactionId {
    return this.def.id;
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  distanceTo(p: THREE.Vector3): number {
    return Math.hypot(this.mesh.position.x - p.x, this.mesh.position.z - p.z);
  }

  startChase(): void {
    this.state = 'chase';
    this.warned = false;
  }

  /** Läuft zu einem Ort und bleibt dort (z. B. Karawane). */
  travelTo(x: number, z: number): void {
    this.state = 'travel';
    this.target = new THREE.Vector3(x, 0, z);
  }

  startTalk(player: THREE.Vector3): void {
    this.state = 'talk';
    this.face(player);
  }

  endTalk(): void {
    if (this.state === 'talk') this.state = 'wander';
  }

  private face(p: THREE.Vector3): void {
    this.mesh.rotation.y = Math.atan2(p.x - this.mesh.position.x, p.z - this.mesh.position.z);
  }

  private walk(to: THREE.Vector3, speed: number, dt: number, ctx: NpcContext): boolean {
    const pos = this.mesh.position;
    const dx = to.x - pos.x, dz = to.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.15) return true;
    const step = Math.min(dist, speed * dt);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    const want = Math.atan2(dx, dz);
    let d = want - this.mesh.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.mesh.rotation.y += d * Math.min(1, dt * 10);
    ctx.resolve(pos, 0.4);
    return false;
  }

  update(dt: number, ctx: NpcContext): void {
    this.lastPos.copy(this.mesh.position);
    this.think(dt, ctx);
    const speed = dt > 0 ? this.lastPos.distanceTo(this.mesh.position) / dt : 0;
    animateCharacter(this.body, speed, dt);
  }

  private think(dt: number, ctx: NpcContext): void {
    const idle = () => {};
    switch (this.state) {
      case 'talk':
        this.face(ctx.player);
        idle();
        break;

      case 'chase':
        if (this.distanceTo(ctx.player) < ROB_RANGE) {
          ctx.onRob(this);
          this.state = 'retreat';
          this.timer = 12;
          break;
        }
        if (this.distanceTo(ctx.player) > 45) {
          this.state = 'wander';
          break;
        }
        this.walk(ctx.player, CHASE_SPEED, dt, ctx);
        break;

      case 'retreat':
        this.timer -= dt;
        if (this.walk(this.home, 3, dt, ctx) || this.timer <= 0) this.state = 'wander';
        break;

      case 'travel':
        if (this.target && this.walk(this.target, TRAVEL_SPEED, dt, ctx)) {
          this.home.copy(this.target);
          this.target = null;
          this.state = 'wander';
        }
        break;

      default: {
        this.timer -= dt;
        if (this.target) {
          if (this.walk(this.target, WALK_SPEED, dt, ctx)) this.target = null;
        } else {
          idle();
          if (this.timer <= 0) {
            const a = ctx.rand() * Math.PI * 2, r = ctx.rand() * WANDER_RADIUS;
            this.target = new THREE.Vector3(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
            this.timer = 3 + ctx.rand() * 6;
          }
        }
      }
    }
  }
}
