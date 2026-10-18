import * as THREE from 'three';
import { smokeUniforms } from './Smoke';

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  s0: number; s1: number;
  r: number; g: number; b: number; a: number;
  grav: number; drag: number;
}

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  uniform float uPx;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    gl_PointSize = max(1.0, aSize * uPx);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FRAG = /* glsl */ `
  varying vec4 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor.rgb, vColor.a * smoothstep(1.0, 0.25, d));
  }
`;

/** Punktpartikel mit eigenem Pool; additiv (Funken) oder normal (Rauch, Staub). */
class Pool {
  readonly points: THREE.Points;
  private list: P[] = [];
  private pos: Float32Array;
  private size: Float32Array;
  private col: Float32Array;
  private geo = new THREE.BufferGeometry();

  constructor(private max: number, additive: boolean) {
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.col = new Float32Array(max * 4);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uPx: smokeUniforms.uPx },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  emit(p: P): void {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push(p);
  }

  update(dt: number): void {
    const n = this.list.length;
    let w = 0;
    for (let i = 0; i < n; i++) {
      const p = this.list[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy -= p.grav * dt;
      const f = Math.exp(-p.drag * dt);
      p.vx *= f; p.vy *= f; p.vz *= f;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.03 && p.grav > 0) {
        p.y = 0.03;
        p.vy = Math.abs(p.vy) * 0.3;
        p.vx *= 0.7; p.vz *= 0.7;
      }
      const t = p.life / p.max;
      this.list[w++] = p;
      this.pos[(w - 1) * 3] = p.x;
      this.pos[(w - 1) * 3 + 1] = p.y;
      this.pos[(w - 1) * 3 + 2] = p.z;
      this.size[w - 1] = p.s0 + (p.s1 - p.s0) * t;
      this.col.set([p.r, p.g, p.b, p.a * (1 - t) * (1 - t * 0.3)], (w - 1) * 4);
    }
    this.list.length = w;
    for (let i = w; i < this.max; i++) {
      this.size[i] = 0;
      this.col[i * 4 + 3] = 0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.setDrawRange(0, w);
  }
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Crash-Effekte: Funken, Glassplitter, Staub, Rauch. */
export class CrashFx {
  readonly group = new THREE.Group();
  private sparks = new Pool(500, true);
  private smoke = new Pool(700, false);

  constructor() {
    this.group.add(this.smoke.points, this.sparks.points);
  }

  /** Funken in eine Richtung (nx,nz = vom Hindernis weg) */
  sparkBurst(x: number, y: number, z: number, nx: number, nz: number, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.atan2(nz, nx) + rnd(-1.4, 1.4);
      const s = rnd(0.35, 1) * speed;
      this.sparks.emit({
        x, y, z, vx: Math.cos(a) * s, vy: rnd(1, 5), vz: Math.sin(a) * s,
        life: 0, max: rnd(0.25, 0.7), s0: 0.1, s1: 0.04,
        r: 1, g: rnd(0.55, 0.85), b: 0.25, a: 1, grav: 14, drag: 0.8,
      });
    }
  }

  /** Glassplitter (heller, schwerer) */
  shards(x: number, y: number, z: number, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(0.2, 1) * speed;
      this.sparks.emit({
        x, y, z, vx: Math.cos(a) * s, vy: rnd(1.5, 6), vz: Math.sin(a) * s,
        life: 0, max: rnd(0.6, 1.4), s0: 0.09, s1: 0.06,
        r: 0.7, g: 0.9, b: 1, a: 0.9, grav: 16, drag: 0.3,
      });
    }
  }

  dust(x: number, z: number, count: number, spread: number): void {
    for (let i = 0; i < count; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(0.3, 1) * spread;
      this.smoke.emit({
        x, y: rnd(0.1, 0.5), z, vx: Math.cos(a) * s, vy: rnd(0.2, 1), vz: Math.sin(a) * s,
        life: 0, max: rnd(0.8, 1.6), s0: 0.6, s1: 2.4,
        r: 0.62, g: 0.58, b: 0.52, a: 0.5, grav: 0, drag: 2.2,
      });
    }
  }

  /** Eine Rauchfahne (aufrufen pro Frame); amount 0..1, dark = schwarzer Qualm */
  plume(x: number, y: number, z: number, amount: number, dt: number, dark: boolean): void {
    const n = amount * dt * 40;
    let k = Math.floor(n) + (Math.random() < n - Math.floor(n) ? 1 : 0);
    while (k-- > 0) {
      const c = dark ? rnd(0.08, 0.18) : rnd(0.55, 0.75);
      this.smoke.emit({
        x: x + rnd(-0.2, 0.2), y, z: z + rnd(-0.2, 0.2), vx: rnd(-0.3, 0.3), vy: rnd(1.4, 2.6), vz: rnd(-0.3, 0.3),
        life: 0, max: rnd(1.4, 2.6), s0: 0.35, s1: 1.8 + amount,
        r: c, g: c, b: c, a: 0.55, grav: -0.2, drag: 0.5,
      });
    }
  }

  update(dt: number): void {
    this.sparks.update(dt);
    this.smoke.update(dt);
  }
}
