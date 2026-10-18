import './ui.css';
import { Level, NEED_KEYS, NeedKey } from '../player/Needs';
import { glyph } from './Glyphs';
import type { PartId } from '../player/Body';

export type PartState = 'ok' | 'hurt' | 'warn' | 'bad';

/** Körpersilhouette als ein einziger Pfad (ruhige Standfigur, Blick von vorn) */
const BODY_PATH = 'M27 0 C32 0 34.5 4 34.5 9.5 C34.5 15 32.5 19 30 21 L30 24.5 C30 26 37 26.5 41.5 28.5 C46.5 30 49.5 33.5 50 39 L51 52 C51.5 58 52 64 52 70 L53 77 C54 80 54 85 52 87 C50.5 88 48.5 86.5 48 83 L46.5 70 C46 64 45 58 44 50 L43.5 46.5 C42.5 54 41 58 40.5 63 C40.5 69 45 74 45 82 C45.5 92 45 100 43.5 110 C42.5 118 42 126 41 134 L40.5 140 C41 143 42.5 145 43 148 L43.5 150 L35 150 L34.5 148 C34 146 33.5 143 33.5 140 C33 128 32 118 30.5 108 C30 100 29 94 27.5 88 L27 87.5 L26.5 88 C25 94 24 100 23.5 108 C22 118 21 128 20.5 140 C20.5 143 20 146 19.5 148 L19 150 L10.5 150 L11 148 C11.5 145 13 143 13.5 140 L13 134 C12 126 11.5 118 10.5 110 C9 100 8.5 92 9 82 C9 74 13.5 69 13.5 63 C13 58 11.5 54 10.5 46.5 L10 50 C9 58 8 64 7.5 70 L6 83 C5.5 86.5 3.5 88 2 87 C0 85 0 80 1 77 L2 70 C2 64 2.5 58 3 52 L4 39 C4.5 33.5 7.5 30 12.5 28.5 C17 26.5 24 26 24 24.5 L24 21 C21.5 19 19.5 15 19.5 9.5 C19.5 4 22 0 27 0 Z';

/** Mittelpunkt der Verletzungspunkte je Körperteil */
const BODY_DOTS: Record<PartId, [number, number]> = {
  head: [27, 10], torso: [27, 45], armL: [5.5, 55], armR: [48.5, 55], handL: [4, 82], handR: [50, 82],
  legL: [19, 105], legR: [35, 105], footL: [15, 146], footR: [39, 146],
};

export type ToastKind = 'info' | 'good' | 'warn' | 'bad';

export interface HudHooks {
  restart(): void;
  inventory(): void;
  map(): void;
  build(): void;
  speed(n: number): void;
  run(on: boolean): void;
  quick(id: string): void;
}

const BARS: { key: NeedKey | 'health'; label: string }[] = [
  { key: 'health', label: 'Leben' },
  { key: 'hunger', label: 'Sättigung' },
  { key: 'thirst', label: 'Durst' },
  { key: 'energy', label: 'Ausdauer' },
  { key: 'warmth', label: 'Wärme' },
];

export interface LogEntry { time: string; msg: string; kind: ToastKind }

/** Bedienoberfläche im stahlblauen Stil: runde Uhr mit Tagesschild, Zustandsleisten mit gezeichneten Symbolen. */
export class HUD {
  /** Hier hängt die Minikarte */
  readonly minimapHost = el('div', '', 'minimapHost');
  private bars = new Map<string, { root: HTMLElement; fill: HTMLElement; val: HTMLElement }>();
  private bleed: HTMLElement;
  private promptEl: HTMLElement;
  private toasts: HTMLElement;
  private death: HTMLElement;
  private sleepEl: HTMLElement;
  private deathCause: HTMLElement;
  private dayEl: HTMLElement;
  private timeEl: HTMLElement;
  private needle: SVGGElement | Element;
  private badges: HTMLElement;
  private logPanel: HTMLElement;
  private tipsPanel: HTMLElement;
  private log: LogEntry[] = [];
  private clock = '08:00';
  private lastBadges = '';
  private loadEl: HTMLElement;
  private actionEl: HTMLElement;
  private actionFill: HTMLElement;
  private actionText: HTMLElement;
  private vit!: HTMLElement;
  private lastBody = '';
  private ammoEl: HTMLElement | null = null;
  private statsWrap: HTMLElement | null = null;

  constructor(hooks: HudHooks) {
    // --- Dock unten rechts (Vorlage 1:1): Symbolkacheln mit Füllstand, Kompassraute, Last, Uhrzeit, Tag, zwei Knöpfe ---
    const dock = el('div', '', 'dock');
    const tiles = el('div', '', 'dockTiles');
    for (const b of BARS) {
      const tile = el('div', 'vtile');
      tile.title = b.label;
      tile.innerHTML = `<div class="vfill"></div><div class="vgl">${glyph(b.key)}</div><i class="vdot"></i>`;
      tiles.append(tile);
      this.bars.set(b.key, { root: tile, fill: tile.querySelector('.vfill')!, val: tile.querySelector('.vdot')! });
    }
    // Neue Lebensanzeige: drei Ringe (Sättigung, Ausdauer, Wärme), Balken für Durst und Leben, Körperfigur mit Wunden
    const vit = el('div', '', 'vit2');
    const ring = (k: NeedKey, label: string): string =>
      `<div class="vc ok" data-k="${k}" title="${label}"><span class="vr"></span><i>${glyph(k)}</i><b class="arr">▼</b></div>`;
    const bar = (k: string, label: string, gl: string): string =>
      `<div class="vb ok" data-k="${k}" title="${label}"><i>${glyph(gl)}</i><div class="seg"><div class="f"></div></div></div>`;
    const shapes = `<path class="bsil" d="${BODY_PATH}"/>` + (Object.keys(BODY_DOTS) as PartId[]).map((p) => `<circle class="bd ok" data-p="${p}" cx="${BODY_DOTS[p][0]}" cy="${BODY_DOTS[p][1]}" r="4.2"/>`).join('');
    vit.innerHTML = `<div class="vleft"><div class="vcs">${ring('hunger', 'Sättigung')}${ring('thirst', 'Durst')}${ring('energy', 'Ausdauer')}</div>
      ${bar('warmth', 'Temperatur', 'temp')}${bar('health', 'Leben', 'health')}</div>
      <svg class="vbody" viewBox="-2 0 58 150" aria-hidden="true">${shapes}</svg>`;
    this.vit = vit;
    const emblem = el('div', '', 'emblem');
    emblem.title = 'Norden';
    emblem.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true">
      <path class="e1" d="M24 2l22 22-22 22L2 24z"/><path class="e2" d="M24 8l16 16-16 16L8 24z"/>
      <g class="needle"><path class="n1" d="M24 9l5 15h-10z"/><path class="n2" d="M24 39l-5-15h10z"/></g><circle class="e3" cx="24" cy="24" r="2.6"/></svg>`;
    this.needle = emblem.querySelector('.needle')!;
    void emblem; // Kompass entfernt

    const info = el('div', '', 'dockInfo');
    info.innerHTML = `<div class="dl"><svg class="rank" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l9 4v6c0 5-4 8.5-9 10-5-1.500-9-5-9-10V6z"/><path d="M7.500 11l4.500-3.500 4.500 3.500M7.500 15l4.500-3.500 4.500 3.500"/></svg><b id="dockLoad">0.00</b></div>
      <div class="dt"><b id="dockTime">08:00</b><span id="dockDay">Tag 1</span></div>`;
    this.timeEl = info.querySelector('#dockTime')!;
    this.dayEl = info.querySelector('#dockDay')!;
    this.loadEl = info.querySelector('#dockLoad')!;
    dock.append(tiles, vit, info);

    this.bleed = el('div', '', 'bleed');
    this.bleed.innerHTML = `${glyph('bleed')}<span>Blutung – Verband benutzen!</span>`;
    this.badges = el('div', '', 'badges');
    const statsWrap = el('div', '', 'statsWrap');
    this.statsWrap = statsWrap;
    statsWrap.append(this.badges, this.bleed, dock);

    this.actionEl = el('div', 'panel hudpanel', 'actionbar');
    this.actionEl.innerHTML = '<span class="at"></span><div class="ab"><i></i></div>';
    this.actionFill = this.actionEl.querySelector('i')!;
    this.actionText = this.actionEl.querySelector('.at')!;
    this.promptEl = el('div', 'panel hudpanel', 'prompt');
    this.toasts = el('div', '', 'toasts');
    this.death = el('div', '', 'death');
    this.death.innerHTML = '<div><h1>Du bist gestorben</h1><p></p><button class="btn">Neu starten</button></div>';
    this.deathCause = this.death.querySelector('p')!;
    this.death.querySelector('button')!.addEventListener('click', hooks.restart);
    this.sleepEl = el('div', '', 'sleep');
    this.sleepEl.innerHTML = '<div>Zzz …<small>Esc = aufwachen</small></div>';

    this.logPanel = el('div', 'panel hudpanel sheet', 'logpanel');
    this.tipsPanel = el('div', 'panel hudpanel sheet', 'tipspanel');
    this.tipsPanel.innerHTML = TIPS;

    document.body.append(
      this.minimapHost, statsWrap, this.actionEl, this.promptEl, this.toasts, this.logPanel, this.tipsPanel, this.sleepEl, this.death,
    );
  }

  // --- Anzeigen -----------------------------------------------------------------------------------

  /** Fortschritt der laufenden Zeitaktion (null = keine) */
  setAction(label: string | null, progress: number, waiting: number): void {
    this.actionEl.classList.toggle('on', label !== null);
    if (label === null) return;
    const t = waiting > 0 ? `${label} (+${waiting})` : label;
    if (this.actionText.textContent !== t) this.actionText.textContent = t;
    this.actionFill.style.width = `${Math.round(progress * 100)}%`;
  }

  /** Munitionsanzeige für die Schusswaffe in der Hand ('' blendet sie aus) */
  setAmmo(text: string): void {
    if (!this.ammoEl) {
      const e = document.createElement('div');
      e.id = 'pzAmmo';
      // ganz rechts, oberhalb von Blutung und Zuständen (erstes Element im rechten Stapel)
      e.style.cssText = 'align-self:flex-end;margin-right:18px;padding:5px 14px;border-radius:8px;background:rgba(14,18,24,.72);color:#f2e6c0;font:600 17px/1.2 system-ui,sans-serif;letter-spacing:.04em;pointer-events:none;display:none;border:1px solid rgba(255,255,255,.14)';
      if (this.statsWrap) this.statsWrap.prepend(e);
      else document.body.append(e);
      this.ammoEl = e;
    }
    if (this.ammoEl.dataset.t === text) return;
    this.ammoEl.dataset.t = text;
    this.ammoEl.textContent = text;
    this.ammoEl.style.display = text ? 'block' : 'none';
  }

  setSleeping(on: boolean): void {
    this.sleepEl.classList.toggle('on', on);
  }

  setBars(health: number, needs: Record<NeedKey, number>, levels: Record<NeedKey, Level>, bleeding: boolean): void {
    this.setBar('health', health, health <= 15 ? 'critical' : health <= 40 ? 'low' : 'ok');
    for (const k of NEED_KEYS) this.setBar(k, needs[k], levels[k]);
    this.bleed.classList.toggle('on', bleeding);
    // neue Anzeige: Ringe und Balken
    const lvl = (v: number, l: Level): Level => l;
    for (const k of ['hunger', 'thirst', 'energy'] as const) {
      const c = this.vit.querySelector<HTMLElement>(`.vc[data-k="${k}"]`)!;
      const v = Math.max(0, Math.min(100, needs[k]));
      c.className = `vc ${lvl(v, levels[k])}`;
      c.style.setProperty('--v', String(v));
    }
    const fill = (k: string, v: number, l: Level): void => {
      const b = this.vit.querySelector<HTMLElement>(`.vb[data-k="${k}"]`)!;
      b.className = `vb ${l}`;
      b.querySelector<HTMLElement>('.f')!.style.width = `${Math.max(0, Math.min(100, v))}%`;
      b.title = `${k === 'health' ? 'Leben' : 'Temperatur'}: ${Math.round(v)} / 100`;
    };
    fill('warmth', needs.warmth, levels.warmth);
    fill('health', health, health <= 15 ? 'critical' : health <= 40 ? 'low' : 'ok');
  }

  /** Körperfigur: Zustand je Körperteil (Wunden gelb, schmutzig/entzündet orange, blutend rot) */
  setBody(states: Record<PartId, PartState>): void {
    const key = (Object.keys(states) as PartId[]).map((p) => states[p]).join('');
    if (key === this.lastBody) return;
    this.lastBody = key;
    for (const p of Object.keys(states) as PartId[]) this.vit.querySelector<SVGElement>(`.bd[data-p="${p}"]`)!.setAttribute('class', `bd ${states[p]}`);
  }

  private setBar(key: string, value: number, level: Level): void {
    const b = this.bars.get(key)!;
    b.fill.style.height = `${Math.max(0, Math.min(100, value))}%`;
    b.root.className = `vtile ${key} ${level}`;
    b.root.title = `${BARS.find((x) => x.key === key)?.label ?? ''}: ${Math.round(value)} / 100`;
  }

  /** Uhrzeit und Tag im Dock */
  setClock(day: number, seconds: number, _weather?: string): void {
    void _weather;
    const sec = Math.floor(seconds);
    this.clock = `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`;
    if (this.timeEl.textContent !== this.clock) this.timeEl.textContent = this.clock;
    const d = `Tag ${day}`;
    if (this.dayEl.textContent !== d) this.dayEl.textContent = d;
  }

  /** Kompassnadel zeigt nach Norden (-z), dreht mit der Kamera */
  setCompass(yaw: number): void {
    void yaw;
    void this.needle;
  }

  /** Tragelast neben den Kacheln */
  setLoad(weight: number, _max: number): void {
    void _max;
    const t = weight.toFixed(2);
    if (this.loadEl.textContent !== t) this.loadEl.textContent = t;
  }

  setFloors(_info: unknown, _outsideTemp: number): void {
    void _info;
    void _outsideTemp;
  }

  /** Zustandsmarken (Schwer beladen, Blutung …) */
  setBadges(list: { text: string; kind: 'good' | 'warn' | 'bad' }[]): void {
    const key = list.map((b) => b.text).join('|');
    if (key === this.lastBadges) return;
    this.lastBadges = key;
    this.badges.innerHTML = list.map((b) => `<span class="badge ${b.kind}">${b.text}</span>`).join('');
  }

  setChips(_list: { id: string; label: string }[]): void {
    void _list;
  }

  /** 0 = Pause (Leertaste): zeigt nur noch eine Marke */
  setSpeed(n: number): void {
    document.body.classList.toggle('paused', n === 0);
  }

  setRun(_on: boolean): void {
    void _on;
  }

  // --- Panels ----------------------------------------------------------------------------------------

  get panelOpen(): boolean {
    return this.logPanel.classList.contains('on') || this.tipsPanel.classList.contains('on');
  }

  closePanels(): void {
    this.logPanel.classList.remove('on');
    this.tipsPanel.classList.remove('on');
  }

  togglePanel(which: 'log' | 'tips'): void {
    const p = which === 'log' ? this.logPanel : this.tipsPanel;
    const open = !p.classList.contains('on');
    this.closePanels();
    p.classList.toggle('on', open);
    if (open && which === 'log') this.renderLog();
  }

  private renderLog(): void {
    const rows = [...this.log].reverse().map((e) => `<div class="le ${e.kind}"><time>${e.time}</time><span>${e.msg}</span></div>`).join('');
    this.logPanel.innerHTML = `<header><h3>Protokoll</h3><small>L</small></header><div class="list">${rows || '<div class="empty">Noch keine Meldungen</div>'}</div>`;
  }

  prompt(html: string | null): void {
    if (html) this.promptEl.innerHTML = html;
    this.promptEl.classList.toggle('on', html !== null);
  }

  toast(msg: string, kind: ToastKind = 'info'): void {
    this.log.push({ time: this.clock, msg, kind });
    if (this.log.length > 150) this.log.shift();
    if (this.logPanel.classList.contains('on')) this.renderLog();
    const t = el('div', `panel hudpanel toast ${kind}`);
    t.textContent = msg;
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild!.remove();
    setTimeout(() => t.classList.add('out'), 3800);
    setTimeout(() => t.remove(), 4300);
  }

  showDeath(cause: string): void {
    this.deathCause.textContent = cause;
    this.death.classList.add('on');
  }
}

const TIPS = `
<header><h3>Überlebenstipps</h3><small>H</small></header>
<div class="tips">
  <h4>Steuerung</h4>
  <p><kbd>WASD</kbd> bewegen · <kbd>Shift</kbd> sprinten · <kbd>Strg</kbd> Dauerlauf · <kbd>Rechte Maustaste</kbd> halten + ziehen = Kamera drehen und neigen · <kbd>Mausrad</kbd> Zoom</p>
  <p><kbd>Linksklick</kbd> Tür, Möbel öffnen oder zuschlagen · gegen Zäune laufen = darüberklettern</p>
  <p><kbd>I</kbd> / <kbd>Tab</kbd> Inventar · <kbd>1</kbd>–<kbd>5</kbd> Schnellleiste · <kbd>E</kbd> benutzen, durchsuchen, sprechen</p>
  <p><kbd>Z</kbd> auf dem Boden schlafen · <kbd>C</kbd> herstellen · <kbd>V</kbd> Fraktionen · <kbd>M</kbd> Karte · <kbd>L</kbd> Protokoll · <kbd>Leertaste</kbd> Pause · <kbd>Esc</kbd> Menü</p>
  <h4>Überleben</h4>
  <p>Gelbe Rauten sind durchsuchbare Möbel. In Küchen findest du Essen, in Bädern Verbände, in Lagern Material.</p>
  <p>Ein Rucksack bringt mehr Platz und Tragkraft. Jacke, Mütze und Stiefel schützen vor Kälte.</p>
  <p>Nachts wird es kalt: such ein Haus oder entzünde ein Lagerfeuer. Mit der Taschenlampe siehst du mehr.</p>
  <p>In Häusern sinken die Wände zur Kamera auf ein Drittel ab. Mit Treppen kommst du in die Obergeschosse.</p>
</div>`;

function el(tag: string, cls = '', id = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (id) e.id = id;
  return e;
}
