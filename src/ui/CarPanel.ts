import './car.css';

export type CarAct = 'bat-out' | 'bat-in' | 'fuel' | 'repair';

/** Was das Fenster über Auto und Inventar wissen muss */
export interface CarView {
  name: string;
  fuel: number;
  tank: number;
  /** Ladung 0..100, null = ausgebaut */
  battery: number | null;
  engine: number;
  body: number;
  hasTool: boolean;
  cans: number;
  engineParts: number;
  batteries: number;
  mechanics: number;
}

const bar = (v: number, tone: string): string => `<div class="cbar ${tone}"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></div>`;
const tone = (v: number): string => (v < 25 ? 'bad' : v < 55 ? 'warn' : 'ok');

/** Motorraum: Tank, Batterie, Motor mit Aktionen (die Zeitaktionen und Regeln liegen im Spiel) */
export class CarPanel {
  private el = document.createElement('div');
  onAct: (a: CarAct) => void = () => {};
  onClose: () => void = () => {};

  constructor() {
    this.el.id = 'carpanel';
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!b || (b as HTMLButtonElement).disabled) return;
      if (b.dataset.act === 'close') this.onClose();
      else this.onAct(b.dataset.act as CarAct);
    });
  }

  get isOpen(): boolean {
    return this.el.classList.contains('on');
  }

  open(v: CarView): void {
    this.el.classList.add('on');
    this.update(v);
  }

  close(): void {
    this.el.classList.remove('on');
  }

  update(v: CarView): void {
    if (!this.isOpen) return;
    const fuelPct = v.tank > 0 ? (v.fuel / v.tank) * 100 : 0;
    const dis = (cond: boolean) => (cond ? '' : ' disabled');
    const tool = v.hasTool ? '' : '<p class="hint">Für Arbeiten an Batterie und Motor brauchst du einen Werkzeugkasten.</p>';
    this.el.innerHTML = `
      <header><h3>Motorraum <small>${v.name}</small></h3><button data-act="close" title="Schließen (E)">✕</button></header>
      <div class="row"><span>Tank</span>${bar(fuelPct, tone(fuelPct))}<b>${v.fuel.toFixed(1)} / ${v.tank} l</b>
        <button data-act="fuel"${dis(v.cans > 0 && v.fuel < v.tank - 0.5)}>Tanken (Kanister)</button></div>
      <div class="row"><span>Batterie</span>${v.battery === null ? '<em>ausgebaut</em>' : bar(v.battery, tone(v.battery))}<b>${v.battery === null ? '–' : Math.round(v.battery) + ' %'}</b>
        ${v.battery === null
          ? `<button data-act="bat-in"${dis(v.hasTool && v.batteries > 0)}>Einbauen</button>`
          : `<button data-act="bat-out"${dis(v.hasTool)}>Ausbauen</button>`}</div>
      <div class="row"><span>Motor</span>${bar(v.engine, tone(v.engine))}<b>${Math.round(v.engine)} %</b>
        <button data-act="repair"${dis(v.hasTool && v.engineParts > 0 && v.engine < 99.5)}>Reparieren (Motorteile)</button></div>
      <div class="row"><span>Karosserie</span>${bar(v.body, tone(v.body))}<b>${Math.round(v.body)} %</b><i></i></div>
      <footer>${tool}<p class="hint">Mechanik Stufe ${v.mechanics}. Im Auto startet <kbd>E</kbd> den Motor.</p></footer>`;
  }
}
