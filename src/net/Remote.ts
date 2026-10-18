import * as THREE from 'three';
import { Outfit, animateCharacter, createCharacter, dressCharacter, swingCharacter } from '../render/Character';
import type { PeerInfo } from './NetClient';

/** Namensschild über dem Kopf: Text auf einem Sprite, immer zur Kamera gedreht */
export function nameTag(name: string, host: boolean): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  g.font = '600 28px system-ui, sans-serif';
  const w = Math.min(244, g.measureText(name).width + 28);
  g.fillStyle = 'rgba(6, 12, 24, 0.72)';
  g.strokeStyle = host ? '#ffd27a' : 'rgba(150, 190, 235, 0.8)';
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect((256 - w) / 2, 10, w, 44, 10);
  g.fill();
  g.stroke();
  g.fillStyle = '#f2f8ff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, 128, 33, 228);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  sp.scale.set(1.6, 0.4, 1);
  sp.position.y = 2.2;
  sp.renderOrder = 20;
  return sp;
}

/** Lage eines Spielers wie sie über das Netz kommt */
export interface PoseMsg {
  x: number;
  y: number;
  z: number;
  yaw: number;
  spd: number;
  sr: boolean;
  /** Schlagfortschritt 0..1, -1 = kein Schlag */
  sw: number;
  sl: string;
  dead?: boolean;
}

/** Ein Mitspieler in der Welt: Figur, Namensschild, weiche Bewegung zur zuletzt gemeldeten Lage */
export class RemotePlayer {
  readonly mesh = new THREE.Group();
  private body: THREE.Group;
  private target: PoseMsg | null = null;
  private lastOutfit = '';
  dead = false;

  constructor(readonly info: PeerInfo) {
    const l = info.look ?? {};
    this.body = createCharacter({ jacket: l.jacket ?? 0x3f6fa3, pants: l.pants, skin: l.skin, hair: l.hair, hairSeed: l.hairSeed, kit: true });
    this.mesh.add(this.body, nameTag(info.name, info.host));
    this.mesh.visible = false; // bis die erste Lage da ist
  }

  get x(): number {
    return this.mesh.position.x;
  }
  get z(): number {
    return this.mesh.position.z;
  }

  setOutfit(o: Outfit): void {
    const k = JSON.stringify(o);
    if (k === this.lastOutfit) return;
    this.lastOutfit = k;
    dressCharacter(this.body, o);
  }

  setPose(p: PoseMsg): void {
    this.target = p;
    this.dead = !!p.dead;
    this.mesh.visible = !p.dead;
    // erste Lage oder weiter Sprung: sofort hin
    if (Math.hypot(p.x - this.mesh.position.x, p.z - this.mesh.position.z) > 8 || this.mesh.position.lengthSq() === 0) this.mesh.position.set(p.x, p.y, p.z);
  }

  update(dt: number): void {
    const t = this.target;
    if (!t) return;
    const k = Math.min(1, dt * 12);
    const m = this.mesh;
    m.position.x += (t.x - m.position.x) * k;
    m.position.y += (t.y - m.position.y) * k;
    m.position.z += (t.z - m.position.z) * k;
    let dy = t.yaw - m.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    m.rotation.y += dy * Math.min(1, dt * 10);
    animateCharacter(this.body, t.spd, dt);
    if (t.sw >= 0) swingCharacter(this.body, t.sw, t.sl);
  }
}
