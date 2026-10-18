import * as THREE from 'three';
import { Outfit, animateCharacter, createCharacter, dressCharacter } from '../render/Character';

/**
 * Figur im Inventar: eigene kleine Szene mit der echten Spielerfigur. Kleidung wird bei jedem Wechsel
 * übernommen, mit der Maus lässt sich die Figur drehen.
 */
export class CharacterPreview {
  readonly el = document.createElement('div');
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(26, 1, 0.1, 30);
  private body = createCharacter({ jacket: 0x3f6fa3, kit: true });
  private yaw = -0.45;
  private dragX: number | null = null;
  private raf = 0;
  private last = 0;
  private outfit: Outfit = {};

  constructor() {
    this.el.className = 'cpreview';
    this.scene.add(new THREE.HemisphereLight(0xcfdcf0, 0x20242c, 1.15));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.1);
    key.position.set(2.5, 3.5, 3);
    const rim = new THREE.DirectionalLight(0x8fb4ff, 1.4);
    rim.position.set(-3, 2.5, -2.5);
    this.scene.add(key, rim, this.body);
    this.camera.position.set(0, 1.12, 5.6);
    this.camera.lookAt(0, 0.98, 0);

    this.el.addEventListener('pointerdown', (e) => {
      this.dragX = e.clientX;
      this.el.setPointerCapture(e.pointerId);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (this.dragX === null) return;
      this.yaw += (e.clientX - this.dragX) * 0.012;
      this.dragX = e.clientX;
    });
    const end = () => (this.dragX = null);
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
  }

  setOutfit(o: Outfit): void {
    this.outfit = { ...o };
    dressCharacter(this.body, this.outfit);
  }

  start(): void {
    if (this.raf) return;
    if (!this.renderer) {
      try {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        return; // ohne WebGL bleibt die Fläche leer
      }
      this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.el.prepend(this.renderer.domElement);
    }
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(Math.min(0.1, (now - this.last) / 1000));
      this.last = now;
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame(dt: number): void {
    const r = this.renderer;
    if (!r) return;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (w < 10 || h < 10) return;
    if (r.domElement.width !== Math.round(w * r.getPixelRatio()) || r.domElement.height !== Math.round(h * r.getPixelRatio())) {
      r.setSize(w, h, false);
      r.domElement.style.width = '100%';
      r.domElement.style.height = '100%';
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (this.dragX === null) this.yaw += dt * 0.12;
    this.body.rotation.y = this.yaw;
    animateCharacter(this.body, 0, dt);
    r.render(this.scene, this.camera);
  }
}
