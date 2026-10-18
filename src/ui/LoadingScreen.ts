import './saves.css';

const TIPS = [
  'Zombies hören Lärm: Sprinten, Türen und Fensterscheiben locken sie an.',
  'Ein Rucksack mit Seitentaschen macht Last leichter – der Inhalt zählt weniger.',
  'Im Sichtkegel siehst du alles. Hinter dir lauert, was du nicht siehst.',
  'Autos haben einen Kofferraum. Dort lässt sich viel verstauen.',
  'Wunden verbinden, desinfizieren und nähen: Infektionen sind gefährlicher als ein Biss.',
  'Schlafen nur an sicheren Orten: Ein Bett erholt besser als der Boden.',
  'Fraktionen handeln mit dir. Ein guter Ruf öffnet Türen.',
  'Mit E durchsuchst du Regale, Schränke und Leichen.',
];

/** Ladebildschirm mit Logo, Fortschrittsbalken, kreisendem Ring und wechselnden Tipps */
export class LoadingScreen {
  private root = document.createElement('div');
  private bar: HTMLElement;
  private label: HTMLElement;
  private tip: HTMLElement;
  private shown = 0;
  private target = 0;
  private raf = 0;
  private tipTimer = 0;
  private startedAt = 0;

  constructor() {
    this.root.id = 'loading';
    this.root.innerHTML = `
      <div class="ld-bg"></div>
      <div class="ld-center">
        <div class="ld-logo"><span>ASHFALL</span><i>Überleben in der Stadt</i></div>
        <div class="ld-ring"><svg viewBox="0 0 100 100"><circle class="r1" cx="50" cy="50" r="42"/><circle class="r2" cx="50" cy="50" r="30"/><circle class="r3" cx="50" cy="50" r="18"/></svg></div>
        <div class="ld-bar"><div></div></div>
        <div class="ld-label">Welt wird geladen …</div>
      </div>
      <p class="ld-tip"></p>`;
    document.body.append(this.root);
    this.bar = this.root.querySelector('.ld-bar div')!;
    this.label = this.root.querySelector('.ld-label')!;
    this.tip = this.root.querySelector('.ld-tip')!;
  }

  get active(): boolean {
    return this.root.classList.contains('on');
  }

  /** Zeigt den Ladebildschirm; `text` steht unter dem Balken */
  show(text = 'Welt wird geladen …'): void {
    this.root.classList.remove('out');
    this.root.classList.add('on');
    this.label.textContent = text;
    this.shown = this.target = 0;
    this.startedAt = performance.now();
    this.nextTip();
    clearInterval(this.tipTimer);
    this.tipTimer = window.setInterval(() => this.nextTip(), 4200);
    cancelAnimationFrame(this.raf);
    const tick = (): void => {
      // Balken gleitet weich zum Ziel, auch wenn der Fortschritt in Sprüngen kommt
      this.shown += (this.target - this.shown) * 0.08 + 0.0006;
      this.shown = Math.min(this.shown, this.target > 0.995 ? 1 : Math.max(this.target, this.shown));
      this.bar.style.width = `${Math.round(Math.min(1, this.shown) * 100)}%`;
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  /** 0..1 */
  progress(p: number, text?: string): void {
    this.target = Math.max(this.target, Math.min(1, p));
    if (text) this.label.textContent = text;
  }

  /** Blendet nach mindestens `minMs` weich aus */
  finish(minMs = 900): void {
    const wait = Math.max(0, minMs - (performance.now() - this.startedAt));
    this.target = 1;
    this.label.textContent = 'Bereit';
    window.setTimeout(() => {
      this.root.classList.add('out');
      window.setTimeout(() => {
        this.root.classList.remove('on', 'out');
        clearInterval(this.tipTimer);
        cancelAnimationFrame(this.raf);
      }, 600);
    }, wait + 250);
  }

  private nextTip(): void {
    this.tip.classList.remove('in');
    window.setTimeout(() => {
      this.tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
      this.tip.classList.add('in');
    }, 180);
  }
}
