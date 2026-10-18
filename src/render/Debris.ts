import * as THREE from 'three';

interface Piece {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  ang: THREE.Vector3;
  age: number;
}

const MAX_PIECES = 110;
const LIFE = 22;
const box = new THREE.Box3();

/** Abgerissene Autoteile: fliegen, prallen auf dem Boden, rutschen aus und verschwinden nach einer Weile. */
export class Debris {
  readonly group = new THREE.Group();
  private pieces: Piece[] = [];

  /** `obj` behält seine Welttransformation (wird in die Trümmergruppe umgehängt). */
  add(obj: THREE.Object3D, vel: THREE.Vector3, ang: THREE.Vector3): void {
    this.group.attach(obj);
    this.pieces.push({ obj, vel, ang, age: 0 });
    while (this.pieces.length > MAX_PIECES) {
      const old = this.pieces.shift()!;
      this.group.remove(old.obj);
    }
  }

  update(dt: number): void {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.age += dt;
      if (p.age > LIFE) {
        this.group.remove(p.obj);
        this.pieces.splice(i, 1);
        continue;
      }
      p.vel.y -= 18 * dt;
      p.obj.position.addScaledVector(p.vel, dt);
      p.obj.rotation.x += p.ang.x * dt;
      p.obj.rotation.y += p.ang.y * dt;
      p.obj.rotation.z += p.ang.z * dt;
      p.obj.updateMatrixWorld(true);
      box.setFromObject(p.obj);
      const grounded = box.min.y <= 0.02;
      if (box.min.y < 0) {
        p.obj.position.y -= box.min.y;
        if (p.vel.y < 0) p.vel.y = -p.vel.y > 1.4 ? -p.vel.y * 0.38 : 0;
        p.vel.x *= 0.82;
        p.vel.z *= 0.82;
        p.ang.multiplyScalar(0.6);
      }
      if (grounded) {
        const f = Math.exp(-3.2 * dt);
        p.vel.x *= f;
        p.vel.z *= f;
        p.ang.multiplyScalar(Math.exp(-6 * dt));
      }
      if (p.age > LIFE - 2) p.obj.scale.multiplyScalar(Math.max(0, 1 - dt * 0.9));
    }
  }
}
