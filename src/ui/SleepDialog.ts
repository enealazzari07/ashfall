import './sleep.css';
import { BEDS, BedKind, MAX_SLEEP_HOURS, MIN_SLEEP_HOURS, estimateRecovery } from '../data/beds';

export interface SleepHooks {
  confirm(hours: number, bed: BedKind): void;
}

export interface SleepRequest {
  bed: BedKind;
  hours: number;
  /** aktuelle Energie 0..100 */
  energy: number;
  /** Schlafqualität 0..1 aus Komfort und Stress */
  quality: number;
  /** Uhrzeit in Spielsekunden seit Mitternacht */
  clock: number;
}

/** Schlaf-Dialog: Dauer wählen, Bett und erwartete Erholung ansehen. */
export class SleepDialog {
  private el = document.createElement('div');
  private req: SleepRequest | null = null;
  private hours = 7;

  constructor(private h: SleepHooks) {
    this.el.id = 'sleepdlg';
    this.el.className = 'panel sheet';
    document.body.append(this.el);
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const d = t.closest<HTMLElement>('[data-d]')?.dataset.d;
      if (d) return this.setHours(this.hours + Number(d));
      const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'go') this.confirm();
      else if (act === 'no') this.close();
    });
    this.el.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.type === 'range') this.setHours(Number(t.value));
    });
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Enter') this.confirm();
      else if (e.code === 'ArrowLeft') this.setHours(this.hours - 1);
      else if (e.code === 'ArrowRight') this.setHours(this.hours + 1);
    });
  }

  get isOpen(): boolean {
    return this.el.classList.contains('on');
  }

  open(req: SleepRequest): void {
    this.req = req;
    this.hours = Math.min(MAX_SLEEP_HOURS, Math.max(MIN_SLEEP_HOURS, req.hours));
    this.el.classList.add('on');
    this.render();
  }

  close(): void {
    this.el.classList.remove('on');
    this.req = null;
  }

  private setHours(n: number): void {
    this.hours = Math.min(MAX_SLEEP_HOURS, Math.max(MIN_SLEEP_HOURS, Math.round(n)));
    this.render();
  }

  private confirm(): void {
    if (!this.req) return;
    const { bed } = this.req;
    const hours = this.hours;
    this.close();
    this.h.confirm(hours, bed);
  }

  private render(): void {
    const r = this.req;
    if (!r) return;
    const bed = BEDS[r.bed];
    const wake = (r.clock + this.hours * 3600) % 86400;
    const hh = String(Math.floor(wake / 3600)).padStart(2, '0');
    const mm = String(Math.floor((wake % 3600) / 60)).padStart(2, '0');
    const gain = Math.round(estimateRecovery(r.energy, this.hours, bed, r.quality));
    const comfort = Math.round((1 - bed.discomfort) * 100);
    this.el.innerHTML = `
      <header><h3>Schlafen</h3><small>Enter = schlafen</small></header>
      <div class="sd-bed"><span>${bed.name}</span><div class="sd-bar"><i style="width:${comfort}%"></i></div><small>Komfort ${comfort} %</small></div>
      <div class="sd-spin"><button class="btn" data-d="-1" aria-label="Eine Stunde weniger">−</button>
        <b>${this.hours} ${this.hours === 1 ? 'Stunde' : 'Stunden'}</b><button class="btn" data-d="1" aria-label="Eine Stunde mehr">+</button></div>
      <input type="range" min="${MIN_SLEEP_HOURS}" max="${MAX_SLEEP_HOURS}" value="${this.hours}">
      <p class="sd-info">Aufwachen gegen <b>${hh}:${mm}</b> · Erholung etwa <b>+${gain}</b> Energie${r.quality < 0.8 ? ' <span class="warn">(Unbehagen oder Stress stören den Schlaf)</span>' : ''}</p>
      <footer><button class="btn" data-act="go">Schlafen</button><button class="btn" data-act="no">Abbrechen</button></footer>`;
  }
}
