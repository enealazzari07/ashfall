import { glyph } from './Glyphs';
import { CHANGELOG, KIND_LABEL, VERSION } from '../data/changelog';
import { SaveMeta, listSaves, playLabel, savedLabel, whenLabel } from '../core/SaveSystem';
import './menu.css';

export interface Settings {
  quality: 'high' | 'low';
  /** Auflösungsfaktor 0.5 .. 1.25 */
  scale: number;
  /** Belichtung 0.7 .. 1.4 */
  brightness: number;
  /** Echte Minuten pro Spieltag */
  dayLength: number;
  /** Sichtfeld: nur vorn und seitlich sieht man alles */
  vision: boolean;
  /** Restlicht außerhalb des Sichtfelds, 0..0.8 */
  visionDim: number;
  /** Lautstärken 0..1 */
  audioMaster: number;
  audioMusic: number;
  audioSfx: number;
}

export const DEFAULT_SETTINGS: Settings = { quality: 'high', scale: 1, brightness: 1, dayLength: 24, vision: true, visionDim: 0.3, audioMaster: 0.8, audioMusic: 0.5, audioSfx: 0.9 };

const KEY = 'ashfall.settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ohne Speicher weiterspielen */
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignorieren */
  }
}

/** Stand einer laufenden Mehrspieler-Sitzung für die Anzeige im Menü */
export interface MpInfo {
  host: boolean;
  /** Namen aller Spieler, der eigene zuerst */
  players: string[];
  /** Adressen, unter denen Mitspieler den Host erreichen (nur beim Host) */
  addresses: string[];
  port: number;
  /** Hinweis zu Netzwerk/Router (nur beim Host) */
  hint?: string;
}

export interface MenuHooks {
  newGame(): void;
  resume(): void;
  quit(): void;
  apply(s: Settings): void;
  canResume(): boolean;
  /** Speichern-Dialog öffnen (nur im laufenden Spiel) */
  save(): void;
  /** Laden-Dialog öffnen */
  load(): void;
  /** Einen bestimmten Spielstand laden */
  loadSave(id: string): void;
  /** Mehrspieler: Fehlermeldung oder null bei Erfolg */
  hostGame(name: string, port: number): Promise<string | null>;
  joinGame(name: string, address: string): Promise<string | null>;
  leaveGame(): void;
  mpInfo(): MpInfo | null;
  /** Im lokalen Netz gefundene Spiele */
  servers(): Promise<{ name: string; ip: string; port: number; players: number }[]>;
}

interface Row {
  label: string;
  desc: string;
  kind: 'slider' | 'choice' | 'toggle' | 'info';
  value?: () => string;
  /** Schieber */
  min?: number; max?: number; step?: number; get?: () => number; set?: (v: number) => void;
  /** Auswahl / Schalter */
  next?: (dir: number) => void;
}

/** Deterministischer Zufall für das gemalte Titelbild */
function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nebliger, abgebrannter Wald: blaugrüner Dunst, ferner Berg, kahle Stämme in Schichten, dunkle Fichten vorn, Filmkorn. */
function paintBackdrop(cv: HTMLCanvasElement): void {
  const w = (cv.width = innerWidth), h = (cv.height = innerHeight);
  const g = cv.getContext('2d')!;
  const r = rand(4711);
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#86a6a8');
  sky.addColorStop(0.5, '#6f9195');
  sky.addColorStop(1, '#3f5d62');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  // ferner Berg im Dunst
  const hill = (peakX: number, peakY: number, spread: number, col0: string, col1: string, blur: number): void => {
    g.save();
    g.filter = `blur(${blur}px)`;
    const gr = g.createLinearGradient(0, peakY, 0, h);
    gr.addColorStop(0, col0);
    gr.addColorStop(1, col1);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(peakX - spread, h);
    g.bezierCurveTo(peakX - spread * 0.7, peakY + h * 0.35, peakX - spread * 0.25, peakY, peakX, peakY);
    g.bezierCurveTo(peakX + spread * 0.3, peakY + h * 0.02, peakX + spread * 0.7, peakY + h * 0.3, peakX + spread, h);
    g.closePath();
    g.fill();
    g.restore();
  };
  hill(w * 0.62, h * 0.24, w * 0.55, '#5f8387', '#496a6f', 7);
  hill(w * 0.9, h * 0.45, w * 0.4, '#58797d', '#43646a', 5);

  // kahle Stämme in Tiefenschichten (hinten hell und klein, vorn dunkel)
  const trunks = (n: number, yMin: number, yMax: number, hMin: number, hMax: number, wMin: number, wMax: number, col: string, alpha: number): void => {
    for (let i = 0; i < n; i++) {
      const x = r() * w, base = yMin + r() * (yMax - yMin), th = hMin + r() * (hMax - hMin), tw = wMin + r() * (wMax - wMin);
      g.strokeStyle = col.replace('A', String(alpha * (0.6 + r() * 0.4)));
      g.lineWidth = tw;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, base);
      g.lineTo(x + (r() - 0.5) * tw * 2, base - th);
      g.stroke();
      // kurze Aststümpfe
      const nb = Math.floor(th / 28);
      for (let k = 0; k < nb; k++) {
        const by = base - th * (0.25 + r() * 0.7), len = 6 + r() * (th * 0.08);
        g.lineWidth = Math.max(0.8, tw * 0.45);
        g.beginPath();
        g.moveTo(x, by);
        g.lineTo(x + (r() < 0.5 ? -1 : 1) * len, by - len * (0.4 + r() * 0.8));
        g.stroke();
      }
    }
  };
  g.filter = 'blur(1.6px)';
  trunks(120, h * 0.5, h * 0.66, h * 0.1, h * 0.22, 1.2, 2.2, 'rgba(80,115,120,A)', 0.42);
  g.filter = 'none';
  fog(g, w, h, r, 0.55, h * 0.58);
  g.filter = 'blur(0.8px)';
  trunks(70, h * 0.56, h * 0.74, h * 0.14, h * 0.3, 1.8, 3.2, 'rgba(45,75,82,A)', 0.62);
  g.filter = 'none';
  fog(g, w, h, r, 0.42, h * 0.68);
  trunks(26, h * 0.66, h * 0.9, h * 0.26, h * 0.5, 3, 5.5, 'rgba(18,36,42,A)', 0.9);
  fog(g, w, h, r, 0.25, h * 0.8);

  // Boden im Dunkel
  const ground = g.createLinearGradient(0, h * 0.78, 0, h);
  ground.addColorStop(0, 'rgba(8,20,24,0)');
  ground.addColorStop(1, 'rgba(6,14,18,0.95)');
  g.fillStyle = ground;
  g.fillRect(0, h * 0.78, w, h * 0.22);

  // Fichten vorn: links groß, unten verteilt, rechts unten klein
  const conifer = (x: number, base: number, ht: number, wd: number, col: string): void => {
    g.fillStyle = col;
    const tiers = Math.max(6, Math.round(ht / 34));
    for (let t = 0; t < tiers; t++) {
      const u = t / tiers;
      const y = base - ht * u;
      const bw = wd * (1 - u * 0.85) * (0.8 + r() * 0.4);
      g.beginPath();
      g.moveTo(x, y - ht / tiers * 1.5);
      g.lineTo(x + bw, y + 6);
      g.lineTo(x + bw * 0.4, y + 2);
      g.lineTo(x - bw * 0.4, y + 2);
      g.lineTo(x - bw, y + 6);
      g.closePath();
      g.fill();
    }
    g.fillRect(x - wd * 0.04, base - 6, wd * 0.08, 30);
  };
  conifer(w * 0.02, h * 1.02, h * 0.95, w * 0.17, '#0b1a1e');
  conifer(w * 0.13, h * 1.05, h * 0.72, w * 0.13, '#0d1f24');
  conifer(w * 0.24, h * 1.04, h * 0.55, w * 0.1, '#102429');
  conifer(w * 0.07, h * 1.08, h * 0.5, w * 0.08, '#08151a');
  for (let i = 0; i < 9; i++) conifer(w * (0.3 + r() * 0.7), h * (1.04 + r() * 0.05), h * (0.1 + r() * 0.18), w * (0.03 + r() * 0.04), '#0a181c');
  conifer(w * 0.93, h * 1.06, h * 0.28, w * 0.08, '#0a181c');

  // Filmkorn
  const grain = g.getImageData(0, 0, w, h);
  const d = grain.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 22;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(grain, 0, 0);
}

/** Weiche Dunstbänder */
function fog(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, alpha: number, y: number): void {
  g.save();
  g.filter = 'blur(26px)';
  for (let i = 0; i < 10; i++) {
    g.fillStyle = `rgba(150,185,188,${alpha * (0.3 + r() * 0.5)})`;
    g.beginPath();
    g.ellipse(r() * w, y + (r() - 0.5) * h * 0.14, w * (0.12 + r() * 0.2), h * (0.03 + r() * 0.05), 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

const KEYS: [string, string][] = [
  ['W A S D', 'Bewegen'], ['Shift', 'Sprinten'], ['Strg', 'Dauerlauf umschalten'], ['Rechte Maus ziehen', 'Kamera drehen/neigen'], ['Mausrad', 'Zoom'],
  ['I / Tab', 'Inventar'], ['1 – 5', 'Schnellleiste'], ['F', 'Benutzen, Durchsuchen, Sprechen'], ['C', 'Herstellen und Bauen'], ['B', 'Bauen'],
  ['Rechtsklick', 'Mit Axt/Hammer abreißen'], ['V', 'Fraktionen'], ['M', 'Karte'], ['L', 'Protokoll'], ['H', 'Überlebenstipps'], ['Leertaste', 'Pause'],
  ['G', 'Grafik umschalten'], ['Enter', 'Chat (Mehrspieler)'], ['F9', 'Admin-Werkzeug (Items geben)'], ['Esc', 'Menü'],
];

const SIDE_DESC: Record<string, string> = {
  resume: 'Zurück ins Spiel',
  save: 'Aktuellen Stand sichern',
  new: 'Neuer Überlebender, neue Stadt',
  load: 'Spielstand fortsetzen',
  multi: 'Zusammen überleben',
  options: 'Grafik, Ton, Spielfluss',
  news: 'Was ist neu?',
  credits: 'Über das Spiel',
  quit: 'Spiel schließen',
};

const SIDE_ICON: Record<string, string> = { resume: 'compass', save: 'down', new: 'star', load: 'box', multi: 'person', options: 'craft', news: 'book', credits: 'gift', quit: 'up' };
const LABEL: Record<string, string> = { resume: 'Weiter', save: 'Speichern', new: 'Neues Spiel', load: 'Laden', multi: 'Mehrspieler', join: 'Server beitreten', options: 'Optionen', news: 'Neuigkeiten', credits: 'Credits', quit: 'Beenden' };

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const store = {
  get(k: string, d: string): string {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  },
  set(k: string, v: string): void {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ohne Speicher */
    }
  },
};

/** Hauptmenü und Pausenmenü: Liste links unter der Vorschau, Verweise oben rechts, Seiten als Fenster darüber. */
export class MainMenu {
  private root = document.createElement('div');
  private bg = document.createElement('canvas');
  private fx = document.createElement('canvas');
  private fxRaf = 0;
  private list = document.createElement('nav');
  private top = document.createElement('nav');
  private thumb = document.createElement('div');
  private stage = document.createElement('main');
  private panel = document.createElement('section');
  private ids: string[] = [];
  private sel = 0;
  /** Geöffnete Seite (null = Hauptbild) */
  private page: string | null = null;
  private pause = false;
  private tab = 0;
  private optRow = 0;
  private stageFocus = false;
  private saves: SaveMeta[] = [];
  private mpTab: 'host' | 'join' = 'join';
  private mpBusy = false;
  private mpMsg = '';

  constructor(private hooks: MenuHooks, private settings: Settings) {
    this.root.id = 'menu';
    this.bg.id = 'menubg';
    this.fx.id = 'menufx';
    const vig = document.createElement('div');
    vig.id = 'menuvig';
    const mm = document.createElement('div');
    mm.id = 'mm';
    this.top.className = 'mm-top';
    this.thumb.className = 'mm-thumb';
    this.list.className = 'mm-list';
    const left = document.createElement('div');
    left.className = 'mm-left';
    const logo = document.createElement('div');
    logo.className = 'mm-logo';
    logo.innerHTML = '<span class="l1">ASHFALL</span><span class="l2">Überleben in der Stadt</span>';
    left.append(logo, this.thumb, this.list);
    this.panel.className = 'mm-panel';
    this.panel.innerHTML = '<button class="mm-close" data-act="back">‹ Zurück</button>';
    this.stage.className = 'mm-stage';
    this.panel.append(this.stage);
    const ver = document.createElement('div');
    ver.className = 'mm-ver';
    ver.textContent = `Version ${VERSION}`;
    mm.append(this.top, left, this.panel, ver);
    this.root.append(this.bg, this.fx, vig, mm);
    document.body.append(this.root);

    this.list.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (b && !b.classList.contains('off')) this.activate(b.dataset.id!);
    });
    this.list.addEventListener('mousemove', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
      if (b && !b.classList.contains('off') && Number(b.dataset.i) !== this.sel) this.setSel(Number(b.dataset.i));
    });
    this.top.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (b) this.activate(b.dataset.id!);
    });
    this.panel.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-act="back"]')) return this.closePage();
      this.onStageClick(e);
    });
    this.stage.addEventListener('input', (e) => this.onStageInput(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.open && paintBackdrop(this.bg));
  }

  get open(): boolean {
    return this.root.classList.contains('on');
  }

  show(pause: boolean): void {
    this.pause = pause;
    this.root.classList.add('on');
    this.root.classList.toggle('pause', pause);
    paintBackdrop(this.bg);
    this.mpMsg = '';
    this.page = null;
    this.panel.classList.remove('on');
    this.build();
    this.sel = 0;
    this.renderAll();
    void listSaves().then((l) => {
      this.saves = l;
      if (this.open && !this.page) {
        this.build();
        this.renderAll();
      }
    });
    this.startEmbers();
  }

  hide(): void {
    this.root.classList.remove('on');
    cancelAnimationFrame(this.fxRaf);
  }

  /** Nebel- und Staubteilchen über dem Wald (läuft nur, solange das Menü offen ist) */
  private startEmbers(): void {
    cancelAnimationFrame(this.fxRaf);
    const cv = this.fx;
    const g = cv.getContext('2d')!;
    let w = (cv.width = innerWidth), h = (cv.height = innerHeight);
    const P = Array.from({ length: 60 }, () => ({ x: Math.random() * w, y: Math.random() * h, r: 0.6 + Math.random() * 1.6, v: 3 + Math.random() * 10, d: 4 + Math.random() * 14, a: Math.random() * 6.28 }));
    const step = (): void => {
      if (!this.open) return;
      if (cv.width !== innerWidth || cv.height !== innerHeight) {
        w = cv.width = innerWidth;
        h = cv.height = innerHeight;
      }
      g.clearRect(0, 0, w, h);
      for (const p of P) {
        p.y -= p.v / 60;
        p.x += (p.d + Math.sin(p.a) * 6) / 60;
        p.a += 0.012;
        if (p.y < -10 || p.x > w + 10) {
          p.y = h + 10;
          p.x = Math.random() * w;
        }
        g.fillStyle = `rgba(215,235,235,${0.1 + 0.16 * (0.5 + 0.5 * Math.sin(p.a * 2))})`;
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, 6.283);
        g.fill();
      }
      this.fxRaf = requestAnimationFrame(step);
    };
    step();
  }

  // --- Liste und Verweise ---------------------------------------------------------------------------

  private build(): void {
    const can = this.hooks.canResume();
    const hasResume = can || this.saves.length > 0;
    // Ohne Spielstand ist „Neues Spiel“ der Haupteintrag, sonst „Weiter“
    this.ids = hasResume ? ['resume', 'multi', 'join', 'new', 'load'] : ['new', 'multi', 'join', 'load'];
    if (can) this.ids.push('save');
  }

  private renderAll(): void {
    const mp = this.hooks.mpInfo();
    const big = new Set([this.ids[0], 'multi']);
    const gapBefore = this.ids[this.ids.indexOf('join') + 1];
    this.list.innerHTML = this.ids
      .map((id, i) => {
        const label = id === 'multi' && mp ? (mp.host ? 'Mehrspieler · Host' : 'Mehrspieler · verbunden') : LABEL[id];
        return `${id === gapBefore ? '<div class="gap"></div>' : ''}<button data-i="${i}" data-id="${id}" class="mm-entry ${big.has(id) ? 'big' : 'small'}${i === this.sel ? ' sel' : ''}">${label}</button>`;
      })
      .join('');
    const dot = '<span class="dot"></span>';
    this.top.innerHTML = `<button data-id="news">Neuigkeiten${dot}</button><button data-id="credits">Credits</button><button data-id="options"><i>${glyph('craft')}</i>Optionen</button><button data-id="quit"><i>${glyph('up')}</i>${this.pause ? 'Zum Desktop' : 'Beenden'}</button>`;
    const s = this.saves[0];
    this.thumb.innerHTML = s?.thumb ? `<img src="${s.thumb}" alt="">` : '<svg viewBox="0 0 100 56" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="0" x2="100" y2="56"/></svg>';
    this.thumb.title = s ? `${s.name} · ${whenLabel(s)}` : '';
  }

  private setSel(i: number): void {
    this.sel = i;
    this.list.querySelectorAll('.mm-entry').forEach((b, k) => b.classList.toggle('sel', k === i));
  }

  /** Eintrag der Liste oder oberen Leiste auslösen */
  private activate(id: string): void {
    if (id === 'resume') return this.hooks.canResume() ? this.hooks.resume() : void this.loadLatest();
    if (id === 'save') return this.hooks.save();
    if (id === 'new') return this.hooks.newGame();
    if (id === 'quit') return this.hooks.quit();
    if (id === 'join') {
      this.mpTab = 'join';
      return this.openPage('multi');
    }
    if (id === 'multi') {
      if (!this.hooks.mpInfo()) this.mpTab = 'join';
      return this.openPage('multi');
    }
    this.openPage(id);
  }

  private openPage(id: string): void {
    this.page = id;
    this.stageFocus = id === 'options';
    this.panel.classList.add('on');
    this.root.classList.add('paged');
    this.renderStage();
    if (id === 'multi') {
      this.focusMpField();
      this.pollServers();
    }
  }

  /** Cursor in das Feld, das man als Nächstes braucht (Adresse beim Beitreten, Port beim Hosten), nicht in den Namen */
  private focusMpField(): void {
    this.stage.querySelector<HTMLInputElement>(this.mpTab === 'host' ? '[data-f="port"]' : '[data-f="addr"]')?.focus();
  }

  private closePage(): void {
    this.page = null;
    window.clearInterval(this.srvTimer);
    this.stageFocus = false;
    this.panel.classList.remove('on');
    this.root.classList.remove('paged');
    this.build();
    this.renderAll();
  }

  private loadLatest(): void {
    const s = this.saves[0];
    if (s) this.hooks.loadSave(s.id);
  }

  // --- Seiten ----------------------------------------------------------------------------------------

  private renderStage(): void {
    const id = this.page ?? '';
    this.stage.classList.remove('swap');
    void this.stage.offsetWidth;
    this.stage.classList.add('swap');
    this.stage.dataset.page = id;
    let html = '';
    switch (id) {
      case 'resume':
        html = this.pageResume();
        break;
      case 'save':
        html = `<h2>Speichern</h2><p class="lead">Sichere deinen Fortschritt in einem Slot. Du kannst später jederzeit weiterspielen.</p><button class="mm-btn big" data-act="save">Spielstand speichern</button>`;
        break;
      case 'new':
        html = `<h2>Neues Spiel</h2><p class="lead">Erstelle einen Überlebenden mit Beruf und Eigenschaften und beginne in einer zerfallenen Stadt. Hunger, Durst, Kälte, Zombies und andere Überlebende sind dein Problem.</p>
          <button class="mm-btn big" data-act="new">Charakter erstellen</button>${this.pause ? '<p class="warn">Achtung: Das laufende Spiel wird dabei beendet. Speichere vorher.</p>' : ''}`;
        break;
      case 'load':
        html = this.pageLoad();
        break;
      case 'multi':
        html = this.pageMulti();
        break;
      case 'options':
        html = this.pageOptions();
        break;
      case 'news':
        html = this.pageNews();
        break;
      case 'credits':
        html = `<h2>Credits</h2><p class="lead">Ashfall – Überleben in einer zerfallenen Stadt.</p><p>Grafik: Three.js. Alle Symbole, Texturen und Modelle sind im Spiel selbst gezeichnet oder gebaut.</p><p>Mehrspieler: eigener WebSocket-Server, kein Fremdcode.</p>`;
        break;
      case 'quit':
        html = `<h2>Beenden</h2><p class="lead">Das Spiel schließen? Nicht gespeicherter Fortschritt geht verloren.</p><button class="mm-btn big danger" data-act="quit">Spiel beenden</button>`;
        break;
    }
    this.stage.innerHTML = html;
  }

  private card(s: SaveMeta, act: string): string {
    return `<button class="save" data-act="${act}" data-id="${esc(s.id)}">
      <span class="th">${s.thumb ? `<img src="${s.thumb}" alt="">` : ''}</span>
      <span class="in"><b>${esc(s.name)}</b><small>${esc(s.who)} · ${whenLabel(s)}</small><small>Spielzeit ${playLabel(s.playtime)} · ${savedLabel(s.savedAt)}</small></span></button>`;
  }

  private pageResume(): string {
    if (this.hooks.canResume()) {
      return `<h2>Weiter</h2><p class="lead">Dein Spiel läuft noch. Kehre zurück, wo du aufgehört hast.</p><button class="mm-btn big" data-act="resume">Weiterspielen</button>`;
    }
    const s = this.saves[0];
    if (!s) return `<h2>Weiter</h2><p class="lead">Noch kein Spielstand. Starte ein neues Spiel.</p>`;
    return `<h2>Weiter</h2><p class="lead">Dein zuletzt gespeichertes Spiel:</p>${this.card(s, 'loadsave')}<button class="mm-btn big" data-act="loadsave" data-id="${esc(s.id)}">Weiterspielen</button>`;
  }

  private pageLoad(): string {
    const list = this.saves.slice(0, 5).map((s) => this.card(s, 'loadsave')).join('');
    return `<h2>Laden</h2>${list || '<p class="lead">Noch keine Spielstände.</p>'}<button class="mm-btn" data-act="load">Alle Spielstände verwalten</button>`;
  }

  private pageNews(): string {
    const rel = CHANGELOG.map((r, idx) => {
      const groups = r.groups
        .map((g) => `<h4>${g.title}</h4><ul>${g.items.map((i) => `<li><b class="k-${i.kind}">${KIND_LABEL[i.kind]}</b>${i.text}</li>`).join('')}</ul>`)
        .join('');
      return `<article class="rel${idx === 0 ? ' cur' : ''}"><header><span class="rv">${r.version}</span><span class="rn">${r.name}</span><span class="rd">${r.date}</span></header>${groups}</article>`;
    }).join('');
    return `<h2>Neuigkeiten</h2><div class="scroll">${rel}</div>`;
  }

  // --- Mehrspieler -----------------------------------------------------------------------------------

  private pageMulti(): string {
    const info = this.hooks.mpInfo();
    if (info) {
      const addr = info.host && info.addresses.length ? info.addresses.map((a) => `${a}:${info.port}`).join('   ·   ') : info.host ? `localhost:${info.port}` : '';
      return `<h2>Mehrspieler</h2>
        <div class="mp-status"><span class="dot"></span><b>${info.host ? 'Du bist Host' : 'Mit dem Host verbunden'}</b></div>
        ${info.host ? `<p class="lead">Mitspieler verbinden sich mit:</p><div class="addr">${addr || 'Adresse nicht ermittelbar'}</div><p class="hint">${esc(info.hint ?? 'Im selben Netzwerk oder per VPN. Für das Internet muss der Port am Router freigegeben sein.')}</p>` : ''}
        <h4>Spieler (${info.players.length})</h4><ul class="players">${info.players.map((n, i) => `<li>${esc(n)}${i === 0 ? ' <small>(du)</small>' : ''}</li>`).join('')}</ul>
        <p class="hint">Im Spiel: <kbd>Enter</kbd> öffnet den Chat.</p>
        <button class="mm-btn danger" data-act="leave">Sitzung verlassen</button>`;
    }
    const name = esc(store.get('ashfall.mpname', 'Überlebender'));
    const addr = esc(store.get('ashfall.mpaddr', ''));
    const port = esc(store.get('ashfall.mpport', '7777'));
    const host = this.mpTab === 'host';
    return `<h2>Mehrspieler</h2>
      <p class="lead">Spielt zusammen in derselben Stadt: gleiche Welt, gemeinsame Zombies, Türen, Fenster und Beute. Der Host steuert die Zombies.</p>
      <label class="fld">Dein Name<input type="text" data-f="name" maxlength="24" value="${name}" autocomplete="off"></label>
      <div class="mp-tabs"><button data-act="mptab" data-tab="join" class="${host ? '' : 'on'}">Beitreten</button><button data-act="mptab" data-tab="host" class="${host ? 'on' : ''}">Hosten</button></div>
      ${
        host
          ? `<label class="fld">Port<input type="text" data-f="port" maxlength="5" value="${port}" autocomplete="off"></label>
             <p class="hint">Die App startet den Server selbst. Danach zeigt dir diese Seite die Adresse für deine Mitspieler.</p>
             <button class="mm-btn big" data-act="host" ${this.mpBusy ? 'disabled' : ''}>${this.mpBusy ? 'Starte …' : 'Hosten und spielen'}</button>`
          : `<h4>Spiele im Netzwerk</h4><div class="srv" data-role="servers"><p class="hint">Suche …</p></div>
             <label class="fld">Oder Adresse eintippen<input type="text" data-f="addr" maxlength="60" placeholder="192.168.0.12:7777" value="${addr}" autocomplete="off"></label>
             <button class="mm-btn big" data-act="join" ${this.mpBusy ? 'disabled' : ''}>${this.mpBusy ? 'Verbinde …' : 'Beitreten'}</button>`
      }
      <p class="msg ${this.mpMsg ? 'on' : ''}">${esc(this.mpMsg)}</p>`;
  }

  private srvTimer = 0;

  /** Serverliste im Beitreten-Tab: alle 2 s aktualisieren, ohne die Eingabefelder neu zu zeichnen */
  private pollServers(): void {
    window.clearInterval(this.srvTimer);
    this.srvTimer = 0;
    if (this.page !== 'multi' || this.mpTab !== 'join' || this.hooks.mpInfo()) return;
    const tick = async (): Promise<void> => {
      const box = this.stage.querySelector<HTMLElement>('[data-role="servers"]');
      if (!box || !this.open || this.page !== 'multi') {
        window.clearInterval(this.srvTimer);
        this.srvTimer = 0;
        return;
      }
      const list = await this.hooks.servers();
      const box2 = this.stage.querySelector<HTMLElement>('[data-role="servers"]');
      if (!box2) return;
      box2.innerHTML = list.length
        ? list.map((s) => `<button class="srv-row" data-act="joinsrv" data-addr="${esc(`${s.ip}:${s.port}`)}"><b>${esc(s.name)}</b><span>${esc(s.ip)}:${s.port} · ${s.players} Spieler</span></button>`).join('')
        : '<p class="hint">Kein Spiel gefunden. Der Host muss im selben WLAN/LAN sein und „Hosten“ gedrückt haben. Sonst unten die Adresse eintippen.</p>';
    };
    void tick();
    this.srvTimer = window.setInterval(() => void tick(), 2000);
  }

  private async mpStart(host: boolean, addrOverride?: string): Promise<void> {
    if (this.mpBusy) return;
    const name = (this.stage.querySelector<HTMLInputElement>('[data-f="name"]')?.value ?? '').trim() || 'Überlebender';
    store.set('ashfall.mpname', name);
    this.mpBusy = true;
    this.mpMsg = '';
    this.renderStage();
    let err: string | null;
    if (host) {
      const port = Number(this.stage.querySelector<HTMLInputElement>('[data-f="port"]')?.value ?? '7777') || 7777;
      store.set('ashfall.mpport', String(port));
      err = await this.hooks.hostGame(name, port);
    } else {
      const addr = addrOverride ?? this.stage.querySelector<HTMLInputElement>('[data-f="addr"]')?.value ?? '';
      store.set('ashfall.mpaddr', addr);
      err = await this.hooks.joinGame(name, addr);
    }
    this.mpBusy = false;
    this.mpMsg = err ?? '';
    if (this.open) {
      this.renderAll();
      this.renderStage();
    }
  }

  // --- Optionen --------------------------------------------------------------------------------------

  private pageOptions(): string {
    const tabs = ['Spiel', 'Steuerung', 'Anzeige'];
    const rows = this.rows();
    if (this.optRow >= rows.length) this.optRow = 0;
    const cur = rows[this.optRow];
    const html = rows
      .map((r, i) => {
        let ctl = '';
        if (r.kind === 'slider') {
          ctl = `<input type="range" data-i="${i}" min="${r.min}" max="${r.max}" step="${r.step}" value="${r.get!()}"><span class="ov">${r.value!()}</span>`;
        } else if (r.kind === 'choice' || r.kind === 'toggle') {
          ctl = `<button class="oc" data-act="next" data-i="${i}">&lt;</button><span class="ov">${r.value!()}</span><button class="oc" data-act="next" data-i="${i}">&gt;</button>`;
        } else ctl = `<span class="ov key">${r.value!()}</span>`;
        return `<div class="orow${i === this.optRow && this.stageFocus ? ' sel' : ''}" data-i="${i}"><label>${r.label}</label><div class="octl">${ctl}</div></div>`;
      })
      .join('');
    return `<h2>Optionen</h2><header class="otabs">${tabs.map((t, i) => `<button data-act="otab" data-tab="${i}" class="${i === this.tab ? 'on' : ''}">${t}</button>`).join('')}</header>
      <div class="obody"><div class="olist">${html}</div><aside class="odesc"><h4>${cur?.label ?? ''}</h4><p>${cur?.desc ?? ''}</p></aside></div>`;
  }

  private rerenderOptions(): void {
    if (this.page !== 'options') return;
    const scroll = this.stage.querySelector<HTMLElement>('.olist')?.scrollTop ?? 0;
    this.stage.innerHTML = this.pageOptions();
    const l = this.stage.querySelector<HTMLElement>('.olist');
    if (l) l.scrollTop = scroll;
  }

  private rows(): Row[] {
    const s = this.settings;
    const apply = () => {
      saveSettings(s);
      this.hooks.apply(s);
    };
    if (this.tab === 0) {
      return [
        {
          label: 'Tageslänge', kind: 'slider', min: 8, max: 60, step: 2, get: () => s.dayLength, set: (v) => { s.dayLength = v; apply(); },
          value: () => `${s.dayLength} Min.`,
          desc: 'So viele echte Minuten dauert ein Spieltag. Kürzere Tage bedeuten schnellere Bedürfnisse und mehr Druck.',
        },
        {
          label: 'Gesamtlautstärke', kind: 'slider', min: 0, max: 100, step: 5, get: () => Math.round(s.audioMaster * 100), set: (v) => { s.audioMaster = v / 100; apply(); },
          value: () => `${Math.round(s.audioMaster * 100)} %`, desc: 'Lautstärke von allem: Effekte, Umgebung und Musik.',
        },
        {
          label: 'Effekte', kind: 'slider', min: 0, max: 100, step: 5, get: () => Math.round(s.audioSfx * 100), set: (v) => { s.audioSfx = v / 100; apply(); },
          value: () => `${Math.round(s.audioSfx * 100)} %`, desc: 'Schritte, Kampf, Türen, Zombies, Umgebung (Wind, Regen, Vögel).',
        },
        {
          label: 'Musik', kind: 'slider', min: 0, max: 100, step: 5, get: () => Math.round(s.audioMusic * 100), set: (v) => { s.audioMusic = v / 100; apply(); },
          value: () => `${Math.round(s.audioMusic * 100)} %`, desc: 'Dunkle Flächenklänge, die bei Gefahr bedrohlicher werden.',
        },
        { label: 'Zeit anhalten', kind: 'info', value: () => 'Leertaste', desc: 'Mit der Leertaste pausierst du das Spiel jederzeit.' },
        { label: 'Dauerlauf', kind: 'info', value: () => 'Strg', desc: 'Strg schaltet den Dauerlauf um. Rennen macht schneller durstig und müde.' },
      ];
    }
    if (this.tab === 1) return KEYS.map(([k, d]) => ({ label: d, kind: 'info' as const, value: () => k, desc: 'Tastenbelegung (nicht änderbar).' }));
    return [
      {
        label: 'Grafikqualität', kind: 'choice', value: () => (s.quality === 'high' ? 'Hoch' : 'Niedrig'),
        next: () => { s.quality = s.quality === 'high' ? 'low' : 'high'; apply(); },
        desc: 'Hoch: Umgebungsverdeckung, Leuchteffekte und Farbkorrektur. Niedrig: schneller auf schwachen Rechnern.',
      },
      {
        label: 'Auflösung', kind: 'slider', min: 50, max: 125, step: 5, get: () => Math.round(s.scale * 100), set: (v) => { s.scale = v / 100; apply(); },
        value: () => `${Math.round(s.scale * 100)} %`,
        desc: 'Renderauflösung relativ zum Bildschirm. Weniger ist schneller, mehr ist schärfer.',
      },
      {
        label: 'Helligkeit', kind: 'slider', min: 70, max: 140, step: 5, get: () => Math.round(s.brightness * 100), set: (v) => { s.brightness = v / 100; apply(); },
        value: () => `${Math.round(s.brightness * 100)} %`,
        desc: 'Belichtung der Welt. Erhöhe sie, wenn die Nächte zu dunkel sind.',
      },
      {
        label: 'Sichtfeld', kind: 'toggle', value: () => (s.vision ? 'An' : 'Aus'),
        next: () => { s.vision = !s.vision; apply(); },
        desc: 'An: nur vor dir und seitlich ist es hell, dort siehst du auch Zombies und durch Fenster. Dahinter und hinter Wänden ist es dunkel.',
      },
      {
        label: 'Dunkelheit außerhalb', kind: 'slider', min: 0, max: 80, step: 5, get: () => Math.round(s.visionDim * 100), set: (v) => { s.visionDim = v / 100; apply(); },
        value: () => `${Math.round(s.visionDim * 100)} % Restlicht`,
        desc: 'Wie hell der Bereich außerhalb deines Sichtfelds noch ist. 0 % ist komplett schwarz.',
      },
      {
        label: 'Vollbild', kind: 'toggle', value: () => (document.fullscreenElement ? 'An' : 'Aus'),
        next: () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.(); setTimeout(() => this.rerenderOptions(), 250); },
        desc: 'Vollbild ein- oder ausschalten (F11 funktioniert ebenfalls).',
      },
    ];
  }

  private setSlider(row: Row, v: number): void {
    const c = Math.max(row.min ?? 0, Math.min(row.max ?? 100, v));
    row.set?.(c);
  }

  // --- Eingaben --------------------------------------------------------------------------------------

  private onStageClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>('[data-act]');
    const row = t.closest<HTMLElement>('.orow');
    if (row) {
      this.optRow = Number(row.dataset.i);
      this.stageFocus = true;
    }
    if (!act) return row ? this.rerenderOptions() : undefined;
    const a = act.dataset.act;
    if (a === 'resume') this.hooks.resume();
    else if (a === 'save') this.hooks.save();
    else if (a === 'new') this.hooks.newGame();
    else if (a === 'load') this.hooks.load();
    else if (a === 'quit') this.hooks.quit();
    else if (a === 'loadsave') this.hooks.loadSave(act.dataset.id!);
    else if (a === 'leave') {
      this.hooks.leaveGame();
      this.renderAll();
      this.renderStage();
    } else if (a === 'mptab') {
      this.mpTab = act.dataset.tab === 'host' ? 'host' : 'join';
      this.mpMsg = '';
      this.renderStage();
      this.focusMpField();
      this.pollServers();
    } else if (a === 'host') void this.mpStart(true);
    else if (a === 'join') void this.mpStart(false);
    else if (a === 'joinsrv') void this.mpStart(false, act.dataset.addr ?? '');
    else if (a === 'otab') {
      this.tab = Number(act.dataset.tab);
      this.optRow = 0;
      this.rerenderOptions();
    } else if (a === 'next') {
      const r = this.rows()[Number(act.dataset.i)];
      r.next?.(act.textContent === '<' ? -1 : 1);
      this.rerenderOptions();
    }
  }

  private onStageInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    if (t.type !== 'range') return;
    const r = this.rows()[Number(t.dataset.i)];
    this.optRow = Number(t.dataset.i);
    this.setSlider(r, Number(t.value));
    const ov = t.parentElement?.querySelector('.ov');
    if (ov) ov.textContent = r.value!();
    const d = this.stage.querySelector('.odesc');
    if (d) d.innerHTML = `<h4>${r.label}</h4><p>${r.desc}</p>`;
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.open) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    const typing = tag === 'INPUT' && (e.target as HTMLInputElement).type !== 'range';
    if (typing) {
      // Eingabefelder behalten ihre Tasten; Enter startet die Aktion, Esc verlässt das Feld
      e.stopPropagation();
      if (e.code === 'Enter') void this.mpStart(this.mpTab === 'host');
      else if (e.code === 'Escape') (e.target as HTMLElement).blur();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (this.page) {
      if (this.page === 'options') {
        const rows = this.rows();
        const row = rows[this.optRow];
        if (e.code === 'ArrowUp') this.optRow = (this.optRow - 1 + rows.length) % rows.length;
        else if (e.code === 'ArrowDown') this.optRow = (this.optRow + 1) % rows.length;
        else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
          const d = e.code === 'ArrowLeft' ? -1 : 1;
          if (row?.kind === 'slider' && row.get && row.set) this.setSlider(row, row.get() + d * (row.step ?? 1));
          else row?.next?.(d);
        } else if (e.code === 'Tab' || e.code === 'KeyQ' || e.code === 'KeyE') {
          this.tab = (this.tab + (e.code === 'KeyQ' || e.shiftKey ? -1 : 1) + 3) % 3;
          this.optRow = 0;
        } else if (e.code === 'Escape') return this.closePage();
        return this.rerenderOptions();
      }
      if (e.code === 'Escape') return this.closePage();
      if (e.code === 'PageDown' || e.code === 'PageUp' || e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        const box = this.stage.querySelector<HTMLElement>('.scroll') ?? this.stage;
        box.scrollBy({ top: (e.code === 'PageDown' ? 300 : e.code === 'PageUp' ? -300 : e.code === 'ArrowDown' ? 60 : -60) });
      }
      return;
    }
    const n = this.ids.length;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') this.setSel((this.sel - 1 + n) % n);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.setSel((this.sel + 1) % n);
    else if (e.code === 'Enter' || e.code === 'Space') this.activate(this.ids[this.sel]);
    else if (e.code === 'Escape' && this.pause) this.hooks.resume();
  }
}
