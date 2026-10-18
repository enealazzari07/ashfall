const PITCH = 0.62; // ~35° – klassische Iso-Neigung
const PITCH_MIN = 0.4, PITCH_MAX = 0.95; // Kamera lässt sich leicht flacher oder steiler stellen

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  pitch = PITCH;
  targetPitch = PITCH;
  /** Kamera-Drehung per Maus (rechte Taste halten und ziehen), yaw läuft weich hinterher */
  targetYaw = Math.PI / 4;
  yaw = Math.PI / 4;
  zoom = 1;
  /** Mausposition in Normalized Device Coordinates (-1..1) */
  mouse = { x: 0, y: 0 };
  private clicks: number[] = [];
  /** Rechte Maustaste gedrückt: Ziehen dreht die Kamera, ein kurzer Klick bleibt ein Rechtsklick */
  private drag: { x: number; y: number; moved: boolean } | null = null;

  constructor() {
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / innerWidth) * 2 - 1;
      this.mouse.y = -((e.clientY / innerHeight) * 2 - 1);
      const d = this.drag;
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) d.moved = true;
      if (d.moved) {
        this.targetYaw -= e.movementX * 0.006;
        this.targetPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.targetPitch + e.movementY * 0.003));
      }
    });
    window.addEventListener('mousedown', (e) => {
      const el = e.target as HTMLElement;
      // nur Klicks auf die Spielwelt, nicht auf Minikarte oder Kartenfenster
      if (el.tagName !== 'CANVAS' || el.closest('#minimapHost, #bigmap')) return;
      if (e.button === 2) this.drag = { x: e.clientX, y: e.clientY, moved: false };
      else this.clicks.push(e.button);
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button !== 2 || !this.drag) return;
      if (!this.drag.moved) this.clicks.push(2);
      this.drag = null;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.drag = null;
    });
    window.addEventListener('wheel', (e) => {
      this.zoom = Math.min(2.2, Math.max(0.6, this.zoom * Math.exp(-e.deltaY * 0.001)));
    });
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  /** Nächster Mausklick auf die Spielwelt (0 = links, 2 = rechts) oder null. */
  nextClick(): number | null {
    return this.clicks.shift() ?? null;
  }

  /** Einmalige Tastendrücke (I, F, Esc …): true genau einmal pro Druck. */
  consume(code: string): boolean {
    return this.pressed.delete(code);
  }

  update(dt: number): void {
    this.pressed.clear();
    this.yaw += (this.targetYaw - this.yaw) * Math.min(1, dt * 14);
    this.pitch += (this.targetPitch - this.pitch) * Math.min(1, dt * 14);
  }
}
