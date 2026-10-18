import * as THREE from 'three';
import { Input } from '../core/Input';
import { WorkPose, animateCharacter, createCharacter, swingCharacter, workCharacter } from '../render/Character';

const WALK = 3.5;
const SPRINT = 6.5;
const CAM_DIST = 60;

export class PlayerController {
  readonly mesh = new THREE.Group();
  readonly body: THREE.Group;
  /** Von außen gesetzt: Last, Erschöpfung, Verletzung … */
  speedFactor = 1;
  moving = false;
  sprinting = false;
  /** Dauerlauf (Strg / Knopf links unten) */
  runMode = false;
  /** Im Auto: Bewegung kommt vom Fahrzeug, der Controller führt nur die Kamera */
  driving = false;

  /** Hindernis zum Überklettern direkt vor dem Spieler (Zaun, Hecke): Ziel, Dauer, Sprunghöhe */
  findClimb: (pos: THREE.Vector3, dirX: number, dirZ: number) => { x: number; z: number; dur: number; h: number } | null = () => null;
  private vault: { t: number; dur: number; h: number; fx: number; fz: number; tx: number; tz: number; y0: number } | null = null;
  /** Wie lange der Spieler schon gegen ein überkletterbares Hindernis läuft */
  private pushT = 0;

  /** Schlag in Arbeit: Fortschritt 0..1 (von außen gesetzt) und Waffenart für die Haltung */
  swingU: number | null = null;
  swingLook = 'fist';
  /** Zeitaktion in Arbeit: Haltung (von außen gesetzt) und Laufzeit */
  work: WorkPose | null = null;
  /** Faktor auf die Kletterdauer (Gewandtheit) und Rückruf beim Klettern */
  climbFactor = 1;
  onVault?: () => void;
  private workT = 0;

  /** Springt oder klettert der Spieler gerade über etwas? */
  get vaulting(): boolean {
    return this.vault !== null;
  }

  /** Wird nach jeder Bewegung aufgerufen, um Kollisionen aufzulösen. */
  collide: (pos: THREE.Vector3, radius: number) => void = () => {};
  /** Begehbare Höhe an einer Stelle (Etagenboden oder Treppenrampe) */
  surface: (x: number, z: number, y: number) => number = () => 0;

  constructor(private input: Input, private camera: THREE.OrthographicCamera) {
    this.body = createCharacter({ jacket: 0x3f6fa3, kit: true });
    this.mesh.add(this.body);
  }

  update(dt: number): void {
    if (this.driving) return this.follow();
    if (this.vault) return this.stepVault(dt);
    const i = this.input;
    const f = (i.down('KeyW') ? 1 : 0) - (i.down('KeyS') ? 1 : 0);
    const r = (i.down('KeyD') ? 1 : 0) - (i.down('KeyA') ? 1 : 0);
    const dir = new THREE.Vector3(r, 0, -f);
    this.moving = dir.lengthSq() > 0;
    this.sprinting = this.moving && (i.down('ShiftLeft') || this.runMode);
    const speed = (this.sprinting ? SPRINT : WALK) * this.speedFactor;
    if (this.moving) {
      dir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), i.yaw);
      this.mesh.position.addScaledVector(dir, speed * dt);
      // Läuft man gegen einen Zaun, geht es nach kurzem Druck darüber
      const climb = this.findClimb(this.mesh.position, dir.x, dir.z);
      if (climb) {
        this.pushT += dt;
        if (this.pushT > 0.12) {
          this.startVault(climb);
          return this.stepVault(0);
        }
      } else this.pushT = 0;
      // weich zur Laufrichtung drehen
      const target = Math.atan2(dir.x, dir.z);
      let d = target - this.mesh.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.mesh.rotation.y += d * Math.min(1, dt * 14);
    }

    if (!this.moving) this.pushT = 0;
    const before = this.mesh.position.clone();
    this.collide(this.mesh.position, 0.4);
    // gegen eine Wand laufen = nicht laufen
    const moved = this.moving ? Math.max(0, speed - before.sub(this.mesh.position).length() / dt) : 0;
    animateCharacter(this.body, moved, dt);
    if (this.work && this.swingU === null) {
      this.workT += dt;
      workCharacter(this.body, this.work, this.workT);
    } else this.workT = 0;

    if (this.swingU !== null) swingCharacter(this.body, this.swingU, this.swingLook);

    // Höhe folgt Boden bzw. Treppe
    const p0 = this.mesh.position;
    const wanted = this.surface(p0.x, p0.z, p0.y);
    p0.y += Math.max(-0.3, Math.min(0.3, wanted - p0.y));
    this.follow();
  }

  private startVault(c: { x: number; z: number; dur: number; h: number }): void {
    const p = this.mesh.position;
    this.pushT = 0;
    this.onVault?.();
    this.vault = { t: 0, dur: c.dur * this.climbFactor, h: c.h, fx: p.x, fz: p.z, tx: c.x, tz: c.z, y0: p.y };
    this.mesh.rotation.y = Math.atan2(c.x - p.x, c.z - p.z);
  }

  private stepVault(dt: number): void {
    const v = this.vault!;
    v.t += dt;
    const u = Math.min(1, v.t / v.dur);
    const e = u * u * (3 - 2 * u);
    const p = this.mesh.position;
    p.x = v.fx + (v.tx - v.fx) * e;
    p.z = v.fz + (v.tz - v.fz) * e;
    p.y = v.y0 + Math.sin(Math.PI * u) * v.h;
    animateCharacter(this.body, WALK, dt);
    if (u >= 1) {
      p.y = v.y0;
      this.vault = null;
    }
    this.follow();
  }

  private follow(): void {
    const i = this.input;
    const p = this.mesh.position;
    const cp = Math.cos(i.pitch);
    this.camera.position.set(
      p.x + Math.sin(i.yaw) * cp * CAM_DIST,
      p.y + Math.sin(i.pitch) * CAM_DIST,
      p.z + Math.cos(i.yaw) * cp * CAM_DIST,
    );
    this.camera.lookAt(p.x, p.y + 0.5, p.z);
  }
}
