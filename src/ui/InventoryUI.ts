import './inventory.css';
import { EQUIP_SLOTS, HOTBAR_SIZE, Inventory, Where } from '../player/Inventory';
import { CATEGORY_NAME, CATEGORY_ORDER, Category, EquipSlot, Stack, item } from '../data/items';
import { ActiveMoodle, levelById, moodleTone } from '../data/moodles';
import { ZONES, ZONE_NAME, type Thermo } from '../sim/Thermo';
import type { Mood } from '../sim/Mood';
import { stashInto, weightOf } from '../player/Stacks';
import { WEAPONS } from '../data/weapons';
import type { Health } from '../player/Health';
import { PARTS, PART_NAME, PartId, WOUND_NAME, isBleeding, isDirty } from '../player/Body';
import { TREAT_ITEM, TREAT_NAME, TREAT_TIME, TreatAction, treat, whyNot, woundStatus } from '../player/Treatment';
import { equipTime, transferTime } from '../sim/Actions';
import { MAX_LEVEL, SKILLS, SKILL_FX, SkillId } from '../data/skills';
import { TRAITS, trait } from '../data/traits';
import { profession } from '../data/professions';
import type { Skills } from '../sim/Skills';
import { LEVEL_MAX, PlayerLevel } from '../sim/Level';
import type { Talents } from '../sim/Talents';
import { BRANCHES, TALENTS, TalentDef, pointsForLevel } from '../data/talents';
import type { Build } from '../sim/Profile';
import type { Container } from '../world/ChunkManager';
import type { ToastKind } from './HUD';
import { iconHtml } from '../render/Icons';
import { PIECES, RECIPES, Recipe, isKnown, missingFor, needsBench } from '../data/recipes';
import { glyph } from './Glyphs';
import { CharacterPreview } from './CharacterPreview';

export { stashInto } from '../player/Stacks';

export interface InventoryHooks {
  /** Rezept herstellen (Herstellen-Reiter) */
  craft(r: Recipe): void;
  /** Item aus Körper/Rucksack benutzen (essen, trinken, verbinden) */
  use(where: Where, index: number): void;
  /** Zeitaktion einreihen: dauert `seconds`, dann wird `run` ausgeführt */
  act(label: string, seconds: number, run: () => void): void;
  /** Fertigkeiten und Charakter */
  skills(): Skills;
  level(): PlayerLevel;
  talents(): Talents;
  /** Talent freischalten (kostet Talentpunkte) */
  unlockTalent(id: string): void;
  /** Steht eine Werkbank in Reichweite? */
  nearBench(): boolean;
  build(): Build;
  xp(id: SkillId, amount: number): void;
  /** Items fallen auf den Boden vor dem Spieler */
  dropToGround(stacks: Stack[]): void;
  /** Bodenhaufen in Reichweite (oder null) */
  ground(): Container | null;
  /** Aktive Zustände (Hunger, Last …) für den Charakter-Reiter */
  moodles(): ActiveMoodle[];
  /** Gesundheit des Spielers für den Gesundheits-Reiter */
  health(): Health;
  /** Körpertemperatur und Befinden für den Charakter-Reiter */
  thermo(): Thermo;
  mood(): Mood;
  /** Ein Item wurde aus einem Behälter genommen (z. B. Splitter-Risiko) */
  took(c: Container): void;
  toast(msg: string, kind?: ToastKind): void;
  /** Nach jeder Änderung: andere Panels aktualisieren, Bodenhaufen abgleichen */
  changed(): void;
}

type Kind = 'main' | 'bag' | 'side' | 'box' | 'ground' | 'eq' | 'hot';
type PKind = 'main' | 'bag' | 'side';
const isP = (k: string | undefined): k is PKind => k === 'main' || k === 'bag' || k === 'side';
const WHERE_NAME: Record<PKind, string> = { main: 'Taschen', bag: 'Rucksack', side: 'Seitentaschen' };
type SortBy = 'type' | 'name' | 'weight';
type PlayerTab = 'char' | 'skills' | 'talents' | 'body' | 'health';
type LootTab = 'box' | 'ground' | 'build';

interface Src {
  kind: Kind;
  /** Stack-Index (bei `eq` der Ausrüstungsplatz, bei `hot` der Leistenplatz) */
  i: number;
  key: string;
  /** gesetzt, wenn eine ganze Gruppe gleicher Items gezogen wird */
  group?: string;
}

interface Drag {
  src: Src;
  x: number;
  y: number;
  ghost: HTMLElement | null;
}

interface ListState {
  text: string;
  cat: Category | 'all';
  sort: SortBy;
  /** aufgeklappte Gruppen ("kind:itemId") */
  open: Set<string>;
}

interface WinEls {
  root: HTMLElement;
  title: HTMLElement;
  sub: HTMLElement;
  bar: HTMLElement;
  barFill: HTMLElement;
  tools: HTMLElement;
  list: HTMLElement;
  foot: HTMLElement;
  tabs: HTMLElement;
}

/** Mittleres Fenster: Rucksack und Seitentaschen */
interface PackEls {
  root: HTMLElement;
  title: HTMLElement;
  sub: HTMLElement;
  tools: HTMLElement;
  bagHead: HTMLElement;
  bagBar: HTMLElement;
  bagList: HTMLElement;
  sideHead: HTMLElement;
  sideBar: HTMLElement;
  sideList: HTMLElement;
  foot: HTMLElement;
}

const EQ_LABEL: Record<EquipSlot, [string, string]> = {
  head: ['Kopf', glyph('head')],
  body: ['Oberkörper', glyph('body')],
  legs: ['Beine', glyph('legs')],
  feet: ['Füße', glyph('feet')],
  back: ['Rücken', glyph('back')],
  hand: ['Hand', glyph('hand')],
};

const SORT_LABEL: Record<SortBy, string> = { type: 'Typ', name: 'Name', weight: 'Gewicht' };

const newState = (): ListState => ({ text: '', cat: 'all', sort: 'type', open: new Set() });

/**
 * Inventar rechts am Bildschirmrand: links die Umgebung (Behälter / Boden), rechts der Spieler
 * (Körper, Rucksack, Charakter). Listen mit Gruppen, Filter und Sortierung, dazu die Schnellleiste im HUD.
 */
export class InventoryUI {
  private root = document.createElement('div');
  private me: WinEls;
  private loot: WinEls;
  private pack: PackEls;
  private prev = new CharacterPreview();
  private hotEl = document.createElement('div');
  private tip = document.createElement('div');
  private menu = document.createElement('div');
  private container: Container | null = null;
  private tab: PlayerTab = 'char';
  private craftOpen = new Set<string>();
  private selPart: PartId | null = null;
  private ltab: LootTab = 'box';
  /** Mittlere Spalte: Ausrüstungsplätze links und rechts der Figur, darunter die Schnellleiste */
  private fig = document.createElement('div');
  private eqTop = document.createElement('div');
  private eqLeft = document.createElement('div');
  private eqRight = document.createElement('div');
  private hotWrap = document.createElement('div');
  private st = { me: newState(), loot: newState(), pack: newState() };
  private drag: Drag | null = null;
  private open = false;

  constructor(private inv: Inventory, private h: InventoryHooks) {
    this.root.id = 'inv2';
    this.loot = this.makeWin('loot');
    this.pack = this.makePack();
    this.me = this.makeWin('me');
    this.fig.className = 'figure';
    this.eqTop.className = 'eqgrid eqrow';
    this.eqLeft.className = 'eqgrid eqcol';
    this.eqRight.className = 'eqgrid eqcol';
    this.hotWrap.className = 'hotwrap';
    const figRow = document.createElement('div');
    figRow.className = 'figrow';
    figRow.append(this.eqLeft, this.prev.el, this.eqRight);
    this.fig.append(this.eqTop, figRow, this.hotWrap);
    this.root.append(this.loot.root, this.pack.root, this.fig, this.me.root);
    this.hotEl.id = 'hotbar';
    this.tip.id = 'itip';
    this.tip.className = 'panel';
    this.menu.id = 'imenu';
    this.menu.className = 'panel';
    document.body.append(this.root, this.hotEl, this.tip, this.menu);

    for (const el of [this.root, this.hotEl]) {
      el.addEventListener('pointerdown', (e) => this.onDown(e));
      el.addEventListener('dblclick', (e) => this.onDouble(e));
      el.addEventListener('contextmenu', (e) => this.onMenu(e));
      el.addEventListener('pointerover', (e) => this.onOver(e));
      el.addEventListener('pointerout', () => this.hideTip());
      el.addEventListener('click', (e) => this.onClick(e));
      el.addEventListener('input', (e) => this.onInput(e));
      el.addEventListener('change', (e) => this.onInput(e));
    }
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointerdown', (e) => {
      if (!(e.target as HTMLElement).closest('#imenu')) this.hideMenu();
    });
    this.renderHotbar();
    if (import.meta.env.DEV) (window as unknown as { __prev: CharacterPreview }).__prev = this.prev;
  }

  get inventoryOpen(): boolean {
    return this.open;
  }

  get openContainer(): Container | null {
    return this.container;
  }

  toggleInventory(c: Container | null = null): void {
    if (this.open) return this.closeAll();
    this.showContainer(c);
  }

  /** Öffnet das Fenster mit einem Behälter (oder dem Boden) daneben. */
  showContainer(c: Container | null): void {
    this.container = c;
    this.ltab = c && c.kind !== -1 ? 'box' : 'ground';
    this.open = true;
    this.hotWrap.append(this.hotEl); // Schnellleiste liegt im offenen Inventar unter der Figur
    this.root.classList.add('on');
    this.prev.start();
    this.refresh();
  }

  /** Öffnet das Inventar direkt im Reiter „Bauen“ neben dem Boden */
  openCraft(): void {
    if (this.open && this.ltab === 'build') return this.closeAll();
    if (!this.open) this.showContainer(null);
    this.ltab = 'build';
    this.refresh();
  }

  closeAll(): void {
    document.body.append(this.hotEl);
    this.container = null;
    this.open = false;
    this.root.classList.remove('on');
    this.prev.stop();
    this.hideTip();
    this.hideMenu();
    this.cancelDrag();
  }

  refresh(): void {
    this.renderHotbar();
    if (!this.open) return;
    this.prev.setOutfit(this.inv.equipment);
    this.renderEquip();
    this.renderMe();
    this.renderPack();
    this.renderLoot();
  }

  // --- Aufbau ---------------------------------------------------------------------

  private makeWin(which: 'me' | 'loot'): WinEls {
    const root = document.createElement('section');
    root.className = `iwin ${which}`;
    const catOpts = ['<option value="all">Alle</option>', ...CATEGORY_ORDER.map((c) => `<option value="${c}">${CATEGORY_NAME[c]}</option>`)].join('');
    const sortOpts = (Object.keys(SORT_LABEL) as SortBy[]).map((s) => `<option value="${s}">${SORT_LABEL[s]}</option>`).join('');
    root.innerHTML = `
      <div class="body">
        <header><h3></h3><span class="sub"></span></header>
        <div class="wbar"><div></div></div>
        <div class="tools" data-win="${which}">
          <label class="find">${glyph('search')}<input type="search" data-f="text" placeholder="Suchen …" autocomplete="off"></label>
          <select data-f="cat" title="Kategorie">${catOpts}</select>
          <select data-f="sort" title="Sortieren nach">${sortOpts}</select>
        </div>
        <div class="list" data-drop="${which === 'me' ? 'main' : 'box'}"></div>
        <footer></footer>
      </div>
      <nav class="tabs"></nav>`;
    const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
    return {
      root,
      title: q('h3'),
      sub: q('.sub'),
      bar: q('.wbar'),
      barFill: q('.wbar div'),
      tools: q('.tools'),
      list: q('.list'),
      foot: q('footer'),
      tabs: q('.tabs'),
    };
  }

  private makePack(): PackEls {
    const root = document.createElement('section');
    root.className = 'iwin pack';
    const catOpts = ['<option value="all">Alle</option>', ...CATEGORY_ORDER.map((c) => `<option value="${c}">${CATEGORY_NAME[c]}</option>`)].join('');
    const sortOpts = (Object.keys(SORT_LABEL) as SortBy[]).map((x) => `<option value="${x}">${SORT_LABEL[x]}</option>`).join('');
    root.innerHTML = `
      <div class="body">
        <header><h3>Rucksack</h3><span class="sub"></span></header>
        <div class="tools" data-win="pack">
          <label class="find">${glyph('search')}<input type="search" data-f="text" placeholder="Suchen …" autocomplete="off"></label>
          <select data-f="cat" title="Kategorie">${catOpts}</select>
          <select data-f="sort" title="Sortieren nach">${sortOpts}</select>
        </div>
        <div class="psec"><div class="phead"></div><div class="wbar"><div></div></div><div class="list" data-drop="bag"></div></div>
        <div class="psec small"><div class="phead"></div><div class="wbar"><div></div></div><div class="list" data-drop="side"></div></div>
        <footer></footer>
      </div>`;
    const q = <T extends HTMLElement>(sel: string, i = 0) => root.querySelectorAll<T>(sel)[i];
    return {
      root,
      title: q('h3'),
      sub: q('.sub'),
      tools: q('.tools'),
      bagHead: q('.phead', 0),
      bagBar: q('.wbar div', 0),
      bagList: q('.list', 0),
      sideHead: q('.phead', 1),
      sideBar: q('.wbar div', 1),
      sideList: q('.list', 1),
      foot: q('footer'),
    };
  }

  private onInput(e: Event): void {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const f = (t as HTMLElement).dataset.f;
    const win = (t as HTMLElement).closest<HTMLElement>('.tools')?.dataset.win as 'me' | 'loot' | 'pack' | undefined;
    if (!f || !win) return;
    const s = this.st[win];
    if (f === 'text') s.text = t.value.trim().toLowerCase();
    else if (f === 'cat') s.cat = t.value as Category | 'all';
    else if (f === 'sort') s.sort = t.value as SortBy;
    if (win === 'me') this.renderMe();
    else if (win === 'pack') this.renderPack();
    else this.renderLoot();
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const tab = t.closest<HTMLElement>('[data-tab]');
    if (tab && !tab.hasAttribute('disabled')) {
      const v = tab.dataset.tab!;
      if (tab.closest('.me')) this.tab = v as PlayerTab;
      else this.ltab = v as LootTab;
      return this.refresh();
    }
    const tn = t.closest<HTMLElement>('[data-talent]');
    if (tn) {
      this.h.unlockTalent(tn.dataset.talent!);
      return this.refresh();
    }
    const rc = t.closest<HTMLElement>('[data-recipe]');
    if (rc) {
      if (rc.classList.contains('no')) return;
      const r = RECIPES.find((x) => x.id === rc.dataset.recipe);
      if (r) this.h.craft(r);
      return;
    }
    const tr = t.closest<HTMLButtonElement>('[data-treat]');
    if (tr && !tr.disabled) {
      const part = tr.dataset.part as PartId, idx = Number(tr.dataset.i), action = tr.dataset.treat as TreatAction;
      const aid = this.h.skills().level('firstaid');
      this.h.act(TREAT_NAME[action], TREAT_TIME[action] * SKILL_FX.treatTime(aid) * this.h.talents().perks().treat, () => {
        const res = treat(this.h.health(), this.inv, part, idx, action, { doctor: aid });
        if (res.ok) this.h.xp('firstaid', action === 'stitch' ? 12 : action === 'splint' ? 9 : 6);
        this.h.toast(res.ok ? res.msg : res.reason, res.ok ? 'good' : 'warn');
        this.apply(() => {});
      });
      return;
    }
    const pr = t.closest<HTMLElement>('[data-part]');
    if (pr) {
      this.selPart = pr.dataset.part as PartId;
      return this.refresh();
    }
    const gid = t.closest<HTMLElement>('.row.g')?.dataset.gid;
    if (gid) {
      const win = t.closest('.me') ? this.st.me : t.closest('.pack') ? this.st.pack : this.st.loot;
      if (win.open.has(gid)) win.open.delete(gid);
      else win.open.add(gid);
      return this.refresh();
    }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    const win = t.closest<HTMLElement>('[data-w]')?.dataset.w;
    if (act === 'sort') {
      this.apply(() => {
        if (win === 'pack') {
          this.inv.sort('bag');
          this.inv.sort('side');
        } else this.inv.sort('main');
      });
    } else if (act === 'all') this.takeAll();
    else if (act === 'put') this.putAll(win === 'pack' ? ['bag', 'side'] : ['main']);
  }

  // --- Anzeige --------------------------------------------------------------------

  private passes(s: Stack, st: ListState): boolean {
    const d = item(s.id);
    return (st.cat === 'all' || d.category === st.cat) && (!st.text || d.name.toLowerCase().includes(st.text));
  }

  private lootStacks(kind: 'box' | 'ground'): Stack[] | null {
    const c = this.container;
    if (kind === 'box') return c && c.kind !== -1 ? c.loot : null;
    return c && c.kind === -1 ? c.loot : this.h.ground()?.loot ?? null;
  }

  private rows(list: Stack[], kind: PKind | 'box' | 'ground', st: ListState): string {
    const byId = new Map<string, number[]>();
    list.forEach((s, i) => {
      if (this.passes(s, st)) byId.set(s.id, [...(byId.get(s.id) ?? []), i]);
    });
    const groups = [...byId].map(([id, is]) => ({
      id,
      is,
      qty: is.reduce((n, i) => n + list[i].qty, 0),
      w: is.reduce((n, i) => n + item(id).weight * list[i].qty, 0),
    }));
    groups.sort((a, b) => {
      const da = item(a.id), db = item(b.id);
      if (st.sort === 'weight') return b.w - a.w || da.name.localeCompare(db.name);
      if (st.sort === 'name') return da.name.localeCompare(db.name);
      return CATEGORY_ORDER.indexOf(da.category) - CATEGORY_ORDER.indexOf(db.category) || da.name.localeCompare(db.name);
    });
    if (!groups.length) return `<div class="empty">${list.length ? 'Nichts gefunden' : 'Leer'}</div>`;
    return groups
      .map((g) => {
        if (g.is.length === 1) return row(kind, g.is[0], list[g.is[0]], false);
        const gid = `${kind}:${g.id}`;
        const open = st.open.has(gid);
        const d = item(g.id);
        const head = `<div class="row g c-${d.category}" data-gid="${gid}" data-src="${kind}" data-i="-1" data-group="${g.id}" data-item="${g.id}" data-qty="${g.qty}">
          <span class="chev ${open ? 'open' : ''}">${glyph('chev')}</span>${iconHtml(g.id)}<span class="nm">${d.name}</span><span class="q">×${g.qty}</span><span class="w">${fmt(g.w)}</span></div>`;
        return head + (open ? g.is.map((i) => row(kind, i, list[i], true)).join('') : '');
      })
      .join('');
  }

  private setBar(w: WinEls, ratio: number): void {
    const cls = ratio >= 1 ? 'full' : ratio > 0.7 ? 'heavy' : '';
    w.barFill.className = cls;
    w.barFill.style.width = `${Math.min(100, ratio * 100)}%`;
    w.sub.className = `sub ${cls}`;
  }

  private renderMe(): void {
    const inv = this.inv;
    const w = this.me;
    const scroll = w.list.scrollTop;

    w.tabs.innerHTML = [
      tabBtn('char', 'person', 'Person: Stufe, Beruf und Zustände', this.tab === 'char', false, 'Person'),
      tabBtn('skills', 'book', 'Fertigkeiten', this.tab === 'skills', false, 'Skills'),
      tabBtn('talents', 'star', `Talentbaum${this.freePoints() ? ` (${this.freePoints()} Punkte frei)` : ''}`, this.tab === 'talents', false, 'Talente'),
      tabBtn('body', 'temp', 'Körpertemperatur und Befinden', this.tab === 'body', false, 'Körper'),
      tabBtn('health', 'health', 'Gesundheit', this.tab === 'health', false, 'Gesund'),
    ].join('');

    // Körpertaschen gibt es nicht mehr: nur alte Spielstände können dort noch etwas liegen haben
    const legacy = inv.list('main').length > 0;
    const showList = this.tab === 'char' && legacy;
    w.bar.style.display = '';
    w.tools.style.display = w.foot.style.display = showList ? '' : 'none';
    w.list.dataset.drop = 'bag';
    w.list.classList.toggle('char', !showList);
    w.list.classList.toggle('bodyv', showList);

    if (this.tab === 'health') {
      const hp = this.h.health().hp;
      w.title.textContent = 'Gesundheit';
      w.sub.textContent = `${Math.round(hp)} / 100`;
      w.sub.className = `sub ${hp <= 15 ? 'full' : hp <= 40 ? 'heavy' : ''}`;
      w.bar.style.display = 'none';
      w.list.innerHTML = this.healthPage();
      w.list.scrollTop = scroll;
      return;
    }

    // Person: Stufe, Beruf, Zustände. Fertigkeiten, Talente und Körper haben eigene Reiter; die Kleidung liegt links und rechts der Figur.
    const pages: Partial<Record<PlayerTab, [string, () => string]>> = {
      skills: ['Fertigkeiten', () => this.skillsHtml()],
      talents: ['Talentbaum', () => this.talentsHtml()],
      body: ['Körper', () => `<h4>Körpertemperatur</h4><ul class="zones">${this.zonesHtml()}</ul><h4>Befinden</h4><ul class="zones feel">${this.feelHtml()}</ul>`],
    };
    const sub = pages[this.tab];
    if (sub) {
      w.title.textContent = sub[0];
      w.sub.textContent = this.tab === 'talents' ? `${this.freePoints()} Punkte frei` : '';
      w.sub.className = 'sub';
      w.bar.style.display = 'none';
      w.tools.style.display = w.foot.style.display = 'none';
      w.list.classList.add('char');
      w.list.classList.remove('bodyv');
      w.list.innerHTML = sub[1]();
      w.list.scrollTop = scroll;
      return;
    }
    w.title.textContent = 'Person';
    w.sub.textContent = '';
    w.bar.style.display = 'none';
    const old = legacy ? `<div class="sect">Übrig geblieben · ${inv.rawWeight('main').toFixed(1)} kg</div>${this.rows(inv.list('main'), 'main', this.st.me)}` : '';
    w.list.innerHTML = `${old}${this.charPage(false)}`;
    w.list.scrollTop = scroll;
    if (legacy) syncTools(w, this.st.me);
    const target = this.lootTarget().name;
    w.foot.innerHTML = legacy ? `<button class="btn" data-act="put" data-w="main" title="Alles in „${target}“ legen">${glyph('down')}Alles ablegen</button>` : '';
  }

  /** Ausrüstungsplätze: Kopf über der Figur, Körper, Beine und Füße links, Rücken und Hand rechts */
  private renderEquip(): void {
    const inv = this.inv;
    const slot = (es: (typeof EQUIP_SLOTS)[number]): string => {
      const id = inv.equipment[es];
      const [label, ph] = EQ_LABEL[es];
      return `<div class="eqslot s-${es}">${cell('eq', es, id ? { id, qty: 1 } : null, `data-drop="eq" data-es="${es}"`, ph)}<small>${label}</small></div>`;
    };
    this.eqTop.innerHTML = slot('head');
    this.eqLeft.innerHTML = ['body', 'legs', 'feet'].map((e) => slot(e as (typeof EQUIP_SLOTS)[number])).join('');
    this.eqRight.innerHTML = ['back', 'hand'].map((e) => slot(e as (typeof EQUIP_SLOTS)[number])).join('');
  }

  /** Mittleres Fenster: Rucksack (Hauptfach) und Seitentaschen als zwei Fächer */
  private renderPack(): void {
    const inv = this.inv;
    const p = this.pack;
    p.title.textContent = inv.bagName ?? 'Kein Rucksack';
    p.sub.textContent = inv.hasBag ? `zählt ×${(1 - this.reduce()).toFixed(2)}` : '';
    const section = (w: 'bag' | 'side', head: HTMLElement, bar: HTMLElement, list: HTMLElement): void => {
      const cap = inv.capacity(w), raw = inv.rawWeight(w);
      const ratio = cap ? raw / cap : 0;
      head.innerHTML = `<span>${WHERE_NAME[w]}</span><b class="${ratio >= 1 ? 'full' : ratio > 0.7 ? 'heavy' : ''}">${raw.toFixed(1)} / ${cap} kg</b>`;
      bar.className = ratio >= 1 ? 'full' : ratio > 0.7 ? 'heavy' : '';
      bar.style.width = `${Math.min(100, ratio * 100)}%`;
      const scroll = list.scrollTop;
      list.innerHTML = cap > 0 ? this.rows(inv.list(w), w, this.st.pack) : `<div class="empty">${inv.hasBag ? 'Keine Seitentaschen' : 'Lege einen Rucksack an'}</div>`;
      list.scrollTop = scroll;
      list.classList.toggle('off', cap <= 0);
    };
    section('bag', p.bagHead, p.bagBar, p.bagList);
    section('side', p.sideHead, p.sideBar, p.sideList);
    const w2 = { tools: p.tools } as WinEls;
    syncTools(w2, this.st.pack);
    const target = this.lootTarget().name;
    const has = inv.list('bag').length + inv.list('side').length > 0;
    p.foot.innerHTML = `<button class="btn" data-act="sort" data-w="pack" ${inv.hasBag ? '' : 'disabled'}>${glyph('sort')}Ordnen</button>
      <button class="btn" data-act="put" data-w="pack" title="Alles in „${target}“ legen" ${has ? '' : 'disabled'}>${glyph('down')}Alles ablegen</button>`;
  }

  /** Figur mit den sechs Ausrüstungsplätzen */
  private dollHtml(): string {
    const inv = this.inv;
    const slots = EQUIP_SLOTS.map((es) => {
      const id = inv.equipment[es];
      const [label, ph] = EQ_LABEL[es];
      return `<div class="eqslot s-${es}">${cell('eq', es, id ? { id, qty: 1 } : null, `data-drop="eq" data-es="${es}"`, ph)}<small>${label}</small></div>`;
    }).join('');
    return `<div class="eqgrid">${slots}</div>`;
  }

  private reduce(): number {
    const id = this.inv.equipment.back;
    return id ? item(id).equip?.reduce ?? 0 : 0;
  }

  private charPage(doll = true): string {
    const inv = this.inv;
    const warmth = Math.round(inv.warmth * 100);
    const speed = Math.round(inv.speedFactor * 100);
    const moods = this.h.moodles();
    const moodHtml = moods.length
      ? moods.map((m) => `<li class="${moodleTone(m.level)}">${glyph(m.glyph)}<span>${m.label}</span><i>${'●'.repeat(m.level)}${'○'.repeat(4 - m.level)}</i></li>`).join('')
      : '<li class="ok"><span>Dir geht es gut.</span></li>';
    const load = Math.round((inv.weight / inv.maxWeight) * 100);
    return `${doll ? this.dollHtml() : ''}
      ${this.buildHtml()}
      ${this.levelHtml()}
      <dl class="stats grid">
        <div><dt>Kälteschutz</dt><dd>${warmth} %</dd></div>
        <div><dt>Tempo</dt><dd class="${speed < 100 ? 'warn' : ''}">${speed} %</dd></div>
        <div><dt>Last</dt><dd class="${load >= 100 ? 'warn' : ''}">${load} %</dd></div>
        <div><dt>Licht</dt><dd>${inv.hasLight ? 'Lampe' : '–'}</dd></div>
      </dl>
      <h4>Zustände</h4><ul class="moods">${moodHtml}</ul>`;
  }

  private freePoints(): number {
    return this.h.talents().free(this.h.level().level);
  }

  /** Stufe, Erfahrungsbalken und freie Talentpunkte */
  private levelHtml(): string {
    const lv = this.h.level();
    const l = lv.level;
    const pts = this.freePoints();
    const info = l >= LEVEL_MAX ? 'Höchste Stufe erreicht' : `${lv.toNext} XP bis Stufe ${l + 1}`;
    const next = l >= LEVEL_MAX ? '' : pointsForLevel(l + 1) - pointsForLevel(l);
    return `<div class="lvl"><div class="lvl-n"><small>Stufe</small><b>${l}</b></div>
      <div class="lvl-b"><div class="xpbar"><i style="width:${Math.round(lv.progress * 100)}%"></i></div>
      <span>${info}${next ? ` · +${next} Punkt${next === 1 ? '' : 'e'}` : ''}</span>
      <button class="pts${pts ? ' has' : ''}" data-tab="talents" title="Zum Talentbaum">${pts ? `${pts} Talentpunkt${pts === 1 ? '' : 'e'} frei` : 'Keine Talentpunkte frei'}</button></div></div>`;
  }

  /** Talentbaum: je Beruf ein Zweig, Talente als Kacheln in Spalten und Reihen */
  private talentsHtml(): string {
    const t = this.h.talents();
    const level = this.h.level().level;
    const pts = t.free(level);
    const head = `<p class="tl-intro">Jede Stufe gibt Talentpunkte (alle 5 Stufen 2 Bonuspunkte). Talente schalten Rezepte und Vorteile frei. Ein Talent braucht seine Vorgänger.</p>
      <div class="tl-pts"><b>${pts}</b> frei · ${t.spent} ausgegeben · ${pointsForLevel(level)} gesamt</div>`;
    const branches = BRANCHES.map((br) => {
      const list = TALENTS.filter((x) => x.branch === br.id);
      const got = list.filter((x) => t.has(x.id)).length;
      const cells = list.map((x) => this.talentCell(x, t, level)).join('');
      return `<section class="branch" style="--bc:${br.color}">
        <header><b>${br.name}</b><span>${got}/${list.length}</span></header>
        <p class="blurb">${br.blurb}</p>
        <div class="tgrid">${cells}</div></section>`;
    }).join('');
    return head + branches;
  }

  private talentCell(x: TalentDef, t: Talents, level: number): string {
    const have = t.has(x.id);
    const can = t.canUnlock(x, level);
    const state = have ? 'have' : can.ok ? 'can' : t.missing(x).length ? 'lock' : 'poor';
    const names = (x.recipes ?? []).map((id) => item(RECIPES.find((r) => r.id === id)?.output.id ?? id).name);
    const why = have ? 'Freigeschaltet' : can.ok ? 'Klicken zum Freischalten' : can.reason;
    return `<button class="tnode ${state}" style="grid-column:${x.col + 1};grid-row:${x.row + 1}" ${state === 'can' ? `data-talent="${x.id}"` : ''} title="${why}">
      <span class="tn">${x.name}</span><span class="tc">${have ? '✓' : `${x.cost} P`}</span>
      <span class="td">${x.desc}</span>${names.length ? `<span class="tr">${names.join(', ')}</span>` : ''}</button>`;
  }

  private buildHtml(): string {
    const b = this.h.build();
    const chips = b.traits.map((id) => {
      const t = trait(id)!;
      return `<span class="chip ${t.cost < 0 ? 'warn' : 'good'}" title="${t.desc}">${t.name}</span>`;
    }).join('');
    return `<p class="who"><b>${b.name}</b> · ${profession(b.profession).name}</p><div class="chips">${chips || '<span class="chip">Keine besonderen Eigenschaften</span>'}</div>`;
  }

  private skillsHtml(): string {
    const sk = this.h.skills();
    const groups = [...new Set(SKILLS.map((s) => s.group))];
    return groups.map((g) => {
      const rows = SKILLS.filter((s) => s.group === g).map((s) => {
        const lvl = sk.level(s.id);
        const pips = Array.from({ length: MAX_LEVEL }, (_, i) => `<u class="${i < lvl ? 'on' : ''}"></u>`).join('');
        return `<li title="${s.perk}"><span>${s.name}</span><div class="pips">${pips}</div><div class="xpbar"><i style="width:${Math.round(sk.progress(s.id) * 100)}%"></i></div><b>${lvl}</b></li>`;
      }).join('');
      return `<h5>${g}</h5><ul class="skills">${rows}</ul>`;
    }).join('');
  }

  private zonesHtml(): string {
    const th = this.h.thermo();
    return ZONES.map((z) => {
      const t = th.skin[z];
      const wet = th.wet[z];
      return `<li class="${th.tone(z)}"><span>${ZONE_NAME[z]}</span><div class="tbar"><i style="width:${Math.max(0, Math.min(100, ((t - 20) / 13) * 100))}%"></i></div><b>${t.toFixed(1)}°</b>${wet >= 10 ? `<em>${Math.round(wet)} % nass</em>` : ''}</li>`;
    }).join('');
  }

  private feelHtml(): string {
    const m = this.h.mood();
    const rows: [string, string, number][] = [
      ['Unbehagen', 'uncomfortable', m.discomfort],
      ['Stress', 'stress', m.stress],
      ['Langeweile', 'bored', m.boredom],
      ['Unglücklich', 'unhappy', m.unhappiness],
    ];
    return rows
      .map(([name, id, v]) => {
        const lvl = levelById(id, v);
        return `<li class="${lvl >= 3 ? 'bad' : lvl >= 1 ? 'warn' : 'ok'}"><span>${name}</span><div class="tbar"><i style="width:${Math.min(100, v)}%"></i></div><b>${Math.round(v)}</b></li>`;
      })
      .join('');
  }

  /** Gruppe eines Rezepts in der Liste */
  private recipeGroup(r: Recipe): string {
    const d = item(r.output.id);
    if (d.piece) return 'Bauteile';
    if (d.category === 'gear') return d.equip?.slot === 'hand' ? 'Waffen und Werkzeug' : 'Kleidung und Rucksäcke';
    if (d.category === 'medical') return 'Medizin';
    if (d.category === 'food' || d.category === 'drink') return 'Essen';
    return 'Material und Sonstiges';
  }

  /** Herstellen-Reiter: alles, was man kennt (Grundrezepte und freigeschaltete Talente), nach Gruppen */
  private craftPage(): string {
    const inv = this.inv;
    const bench = this.h.nearBench();
    const unlocked = this.h.talents().knownRecipes();
    const known = RECIPES.filter((r) => isKnown(r, unlocked));
    const order = ['Bauteile', 'Waffen und Werkzeug', 'Kleidung und Rucksäcke', 'Medizin', 'Essen', 'Material und Sonstiges'];
    const groups = new Map<string, Recipe[]>(order.map((g) => [g, []]));
    for (const r of known) groups.get(this.recipeGroup(r))!.push(r);
    const row = (r: Recipe): string => {
      const miss = missingFor(r, inv);
      const noBench = needsBench(r) && !bench;
      const ok = !noBench && !miss.length && inv.canSwap(r.inputs, r.output);
      const out = item(r.output.id);
      const needTxt = r.inputs
        .map((i) => {
          const have = inv.count(i.id);
          return `<span class="${have >= i.qty ? 'have' : 'miss'}">${i.qty}× ${item(i.id).name} (${have})</span>`;
        })
        .join(' + ');
      const tools = (r.tools ?? []).map((tg) => `<span class="${inv.hasTag(tg) ? 'have' : 'miss'}">Werkzeug: ${TOOL_NAME[tg] ?? tg}</span>`).join(' ');
      return `<div class="recipe row2 ${ok ? '' : 'no'}" data-recipe="${r.id}" title="${noBench ? 'Dafür brauchst du eine Werkbank in der Nähe' : ok ? 'Herstellen' : 'Dir fehlt etwas'}">
        <span class="ic">${iconHtml(out.id, 'ico')}</span>
        <div><div class="nm">${out.name}${r.output.qty > 1 ? ` ×${r.output.qty}` : ''}${noBench ? ' <em class="lock">Werkbank</em>' : ''}</div><div class="req">${needTxt}${tools ? ` · ${tools}` : ''}</div></div></div>`;
    };
    const rows = order
      .filter((g) => groups.get(g)!.length)
      .map((g) => `<div class="sect">${g}</div>${groups.get(g)!.map(row).join('')}`)
      .join('');
    const more = RECIPES.length - known.length;
    return `${rows}
      <div class="hint">${more ? `<b>${more} weitere Rezepte</b> schaltest du im Talentbaum frei (Person → Talente). ` : 'Du kennst alle Rezepte. '}Alles außer den Grundrezepten stellst du an einer Werkbank her. Bauteile landen auf der Schnellleiste, Rechtsklick setzt sie, R dreht, Esc beendet. Wieder einpacken: Hammer, Axt oder Brecheisen in die Hand, Rechtsklick.</div>`;
  }

  /** Gesundheits-Reiter: Körperteile mit Wunden, darunter die Wunden des gewählten Teils mit Behandlungen. */
  private healthPage(): string {
    const hl = this.h.health();
    const worst = (id: PartId): 'bad' | 'warn' | 'hurt' | 'ok' => {
      const ws = hl.parts[id].wounds;
      if (ws.some(isBleeding)) return 'bad';
      if (ws.some((w) => w.infection > 0 || isDirty(w))) return 'warn';
      return ws.length ? 'hurt' : 'ok';
    };
    if (!this.selPart || (!hl.parts[this.selPart].wounds.length && hl.allWounds.length)) {
      this.selPart = hl.allWounds[0]?.part ?? this.selPart ?? 'torso';
    }
    const sel = this.selPart;
    const chips = [
      hl.bleedingCount ? `<span class="chip bad">${glyph('bleed')}Blutung ×${hl.bleedingCount}</span>` : '',
      hl.pain >= 10 ? `<span class="chip ${hl.pain >= 50 ? 'bad' : 'warn'}">Schmerz ${hl.pain}</span>` : '',
      hl.infection > 0 ? `<span class="chip ${hl.infection >= 60 ? 'bad' : 'warn'}">Entzündung ${hl.infection} %</span>` : '',
      hl.moveFactor < 1 ? `<span class="chip warn">Tempo ${Math.round(hl.moveFactor * 100)} %</span>` : '',
      hl.infected ? `<span class="chip bad">Infiziert – keine Heilung${(hl.virus ?? 99) < 8 ? ' · Fieber' : ''}</span>` : '',
    ].join('');
    const parts = PARTS.map((id) => {
      const ws = hl.parts[id].wounds;
      const names = ws.map((w) => WOUND_NAME[w.kind]).join(', ');
      return `<li class="part ${worst(id)}${id === sel ? ' sel' : ''}" data-part="${id}"><span class="pn">${PART_NAME[id]}</span><span class="ps">${names || 'unverletzt'}</span></li>`;
    }).join('');

    const wounds = hl.parts[sel].wounds;
    const acts: TreatAction[] = ['bandage', 'disinfect', 'stitch', 'splint', 'unbandage'];
    const cards = wounds.length
      ? wounds
          .map((w, i) => {
            const status = woundStatus(w).map((s) => `<span class="st ${s.tone}">${s.text}</span>`).join('');
            const buttons = acts
              .filter((a) => whyNot(w, a) === null)
              .map((a) => {
                const itemId = TREAT_ITEM[a];
                const have = itemId ? this.inv.count(itemId) : 1;
                const label = itemId ? `${TREAT_NAME[a]} (${have})` : TREAT_NAME[a];
                const tip = have ? '' : `Dir fehlt: ${item(itemId!).name}`;
                return `<button class="btn tbtn" data-treat="${a}" data-part="${sel}" data-i="${i}" title="${tip}" ${have ? '' : 'disabled'}>${label}</button>`;
              })
              .join('');
            return `<div class="wcard"><header><b>${WOUND_NAME[w.kind]}</b><small>${w.label}</small></header>
              <div class="sts">${status || '<span class="st warn">unversorgt</span>'}</div><div class="acts">${buttons}</div></div>`;
          })
          .join('')
      : '<div class="empty">Keine Wunden an diesem Körperteil.</div>';

    return `<div class="chips">${chips || '<span class="chip ok">Keine Beschwerden</span>'}</div>
      <ul class="parts">${parts}</ul>
      <h4>${PART_NAME[sel]}</h4>${cards}`;
  }

  private renderLoot(): void {
    const w = this.loot;
    const c = this.container;
    const scroll = w.list.scrollTop;
    const box = c && c.kind !== -1 ? c : null;

    const tabs: string[] = [];
    const trunk = !!box && box.key.startsWith('trunk:');
    if (box) tabs.push(tabBtn('box', 'box', box.name, this.ltab === 'box', false, trunk ? 'Kofferraum' : 'Lager'));
    tabs.push(tabBtn('ground', 'ground', 'Boden', this.ltab === 'ground' || (!box && this.ltab !== 'build'), false, 'Boden'));
    tabs.push(tabBtn('build', 'craft', 'Herstellen und Bauen', this.ltab === 'build', false, 'Bauen'));
    w.tabs.innerHTML = tabs.join('');
    if (!box && this.ltab === 'box') this.ltab = 'ground';

    if (this.ltab === 'build') {
      w.list.dataset.drop = 'ground';
      w.title.textContent = 'Herstellen und Bauen';
      w.sub.textContent = `Last ${this.inv.weight.toFixed(1)} / ${this.inv.maxWeight} kg`;
      w.bar.style.display = 'none';
      w.tools.style.display = w.foot.style.display = 'none';
      w.list.classList.add('char');
      w.list.innerHTML = this.craftPage();
      w.list.scrollTop = scroll;
      return;
    }
    w.tools.style.display = w.foot.style.display = '';
    w.list.classList.remove('char');

    const kind: 'box' | 'ground' = this.ltab === 'box' && box ? 'box' : 'ground';
    const list = this.lootStacks(kind) ?? [];
    w.list.dataset.drop = kind;
    w.title.textContent = kind === 'box' ? box!.name : 'Boden';
    w.sub.textContent = `${weightOf(list).toFixed(1)} kg`;
    this.setBar(w, 0);
    w.bar.style.display = 'none';
    w.list.innerHTML = this.rows(list, kind, this.st.loot);
    w.list.scrollTop = scroll;
    syncTools(w, this.st.loot);
    w.foot.innerHTML = `<button class="btn" data-act="all" ${list.length ? '' : 'disabled'}>${glyph('up')}Alles nehmen (E)</button>`;
  }

  private renderHotbar(): void {
    const inv = this.inv;
    this.hotEl.innerHTML = inv.hotbar
      .map((id, i) => {
        const n = id ? inv.count(id) + (Object.values(inv.equipment).includes(id) ? 1 : 0) : 0;
        const s = id ? { id, qty: n } : null;
        return `<div class="hk"><kbd>${i + 1}</kbd>${cell('hot', String(i), s, `data-drop="hot" data-i="${i}"`, '', !!id && n === 0)}</div>`;
      })
      .join('');
  }

  // --- Aktionen --------------------------------------------------------------------

  private apply(fn: () => void): void {
    fn();
    this.h.changed();
    this.refresh();
  }

  private lootTarget(): { name: string } {
    return this.curLootKind() === 'box' ? { name: this.container!.name } : { name: 'Boden' };
  }

  private curLootKind(): 'box' | 'ground' {
    return this.ltab === 'box' && this.container && this.container.kind !== -1 ? 'box' : 'ground';
  }

  /** Tempo-Faktor für Sammelaktionen (Alles nehmen/ablegen), damit sie nicht ewig dauern */
  private pace = 1;

  private act(label: string, secs: number, run: () => void): void {
    this.h.act(label, Math.max(0.15, secs * this.pace), run);
  }

  /** Körper/Rucksack → Behälter oder Boden (Zeitaktion). */
  private put(w: Where, i: number, kind: 'box' | 'ground', qty?: number): void {
    const s = this.inv.list(w)[i];
    if (s) this.putFrom(w, s.id, Math.min(qty ?? s.qty, s.qty), kind);
  }

  private putFrom(w: Where, id: string, qty: number, kind: 'box' | 'ground'): void {
    const d = item(id);
    this.act(`Ablegen: ${d.name}`, transferTime(d.weight * qty), () => {
      const list = this.inv.list(w);
      const i = list.findIndex((s) => s.id === id);
      if (i < 0) return;
      const n = Math.min(qty, list[i].qty);
      this.apply(() => {
        this.inv.removeFrom(w, i, n);
        const dst = kind === 'box' ? this.container?.loot : null;
        if (dst) stashInto(dst, id, n);
        else this.h.dropToGround([{ id, qty: n }]);
      });
    });
  }

  /** Wie `put`, aber nach Item-ID (für Ketten wie „ausziehen, dann ablegen“) */
  private putById(id: string, qty: number, kind: 'box' | 'ground'): void {
    this.putFrom(this.inv.find(id)?.where ?? 'main', id, qty, kind);
  }

  /** Behälter oder Boden → Körper/Rucksack (`to` = Zielbehälter, sonst der gezeigte). */
  private take(kind: 'box' | 'ground', i: number, qty?: number, to?: Where): void {
    const s = this.lootStacks(kind)?.[i];
    if (s) this.takeId(kind, s.id, Math.min(qty ?? s.qty, s.qty), to);
  }

  private takeId(kind: 'box' | 'ground', id: string, want: number, to?: Where): void {
    const d = item(id);
    this.act(`Nehmen: ${d.name}`, transferTime(d.weight * want), () => {
      const list = this.lootStacks(kind);
      const i = list ? list.findIndex((s) => s.id === id) : -1;
      if (!list || i < 0) return;
      const s = list[i];
      const w2 = Math.min(want, s.qty);
      // ohne Ziel: erst in die Körpertaschen, dann Rucksack, dann Seitentaschen
      const dst: Where = to ?? 'main';
      let left = this.inv.addTo(dst, id, w2);
      if (left > 0 && !to) left = this.inv.add(id, left, dst);
      const got = w2 - left;
      if (got > 0) {
        s.qty -= got;
        if (s.qty <= 0) list.splice(i, 1);
        this.h.toast(`+${got} ${d.name}`, 'good');
        if (kind === 'box' && this.container) this.h.took(this.container);
      } else this.h.toast('Das ist zu schwer oder passt nicht mehr hinein.', 'warn');
      this.apply(() => {});
    });
  }

  /** Gesamtdauer einer Sammelaktion auf etwa 4 Sekunden begrenzen */
  private paceFor(list: readonly Stack[]): void {
    const total = list.reduce((sum, s) => sum + transferTime(item(s.id).weight * s.qty), 0);
    this.pace = total > 4 ? 4 / total : 1;
  }

  takeAll(): void {
    const kind = this.curLootKind();
    const list = this.lootStacks(kind);
    if (!list) return;
    this.paceFor(list);
    for (let i = list.length - 1; i >= 0; i--) this.take(kind, i);
    this.pace = 1;
  }

  private putAll(wheres: Where[]): void {
    const kind = this.curLootKind();
    this.paceFor(wheres.flatMap((w) => this.inv.list(w)));
    for (const where of wheres) {
      const list = this.inv.list(where);
      for (let i = list.length - 1; i >= 0; i--) this.put(where, i, kind);
    }
    this.pace = 1;
  }

  /** Zwischen Körper und Rucksack umpacken (Zeitaktion) */
  private moveIdx(w: Where, i: number, to: Where, qty?: number): void {
    const s = this.inv.list(w)[i];
    if (!s) return;
    const id = s.id;
    const n = Math.min(qty ?? s.qty, s.qty);
    const d = item(id);
    this.act(`Umpacken: ${d.name}`, transferTime(d.weight * n) * 0.8, () => {
      const list = this.inv.list(w);
      const k = list.findIndex((x) => x.id === id);
      if (k >= 0) this.apply(() => void this.inv.move(w, k, to, n));
    });
  }

  private moveById(id: string, to: Where): void {
    const d = item(id);
    this.act(`Umpacken: ${d.name}`, transferTime(d.weight) * 0.8, () => {
      const f = this.inv.find(id);
      if (f && f.where !== to) this.apply(() => void this.inv.move(f.where, f.index, to, 1));
    });
  }

  private equip(w: Where, i: number): void {
    const id = this.inv.list(w)[i]?.id;
    if (id) this.equipById(id);
  }

  private equipById(id: string): void {
    const d = item(id);
    this.act(`Anlegen: ${d.name}`, equipTime(d.equip?.slot ?? 'body'), () => {
      const f = this.inv.find(id);
      if (!f) return this.h.toast(`Kein(e) ${d.name} im Inventar.`, 'warn');
      const r = this.inv.equip(f.where, f.index);
      if (!r.ok) return this.h.toast(r.reason, 'warn');
      this.apply(() => {});
      this.h.toast(`${d.name} angelegt`, 'good');
    });
  }

  private unequip(es: EquipSlot): void {
    const id = this.inv.equipment[es];
    if (!id) return;
    const d = item(id);
    this.act(`Ausziehen: ${d.name}`, equipTime(es) * 0.7, () => {
      const r = this.inv.unequip(es);
      if (!r.ok) return this.h.toast(r.reason, 'warn');
      this.apply(() => {});
      this.h.toast(`${d.name} abgelegt`, 'info');
    });
  }

  private bind(i: number, id: string | null): void {
    const hb = this.inv.hotbar;
    if (id) {
      const j = hb.indexOf(id);
      if (j >= 0) hb[j] = hb[i];
    }
    hb[i] = id;
    this.apply(() => {});
  }

  /** Taste 1–5: Item benutzen bzw. Ausrüstung an-/ablegen. */
  useHotbar(i: number): void {
    const id = this.inv.hotbar[i];
    if (!id) return;
    const d = item(id);
    if (d.equip) {
      if (this.inv.equipment[d.equip.slot] === id) {
        this.unequip(d.equip.slot);
      } else {
        const f = this.inv.find(id);
        if (!f) return this.h.toast(`Kein(e) ${d.name} im Inventar.`, 'warn');
        this.equip(f.where, f.index);
      }
      return;
    }
    const f = this.inv.find(id);
    if (!f) return this.h.toast(`Kein(e) ${d.name} mehr im Inventar.`, 'warn');
    this.h.use(f.where, f.index);
  }

  /** Shift+Klick: in den jeweils anderen Behälter */
  private quick(s: Src): void {
    if (isP(s.kind)) {
      if (this.open) this.moveGroupOrOne(s, (w, i, q) => this.put(w, i, this.curLootKind(), q));
    } else if (s.kind === 'box' || s.kind === 'ground') {
      this.moveGroupOrOne(s, (_w, i, q) => this.take(s.kind as 'box' | 'ground', i, q));
    } else if (s.kind === 'eq') this.unequip(s.key as EquipSlot);
  }

  /** Führt `fn` für einen Stack oder für alle Stacks einer Gruppe aus (von hinten, damit Indizes gültig bleiben). */
  private moveGroupOrOne(s: Src, fn: (w: Where, i: number, qty?: number) => void): void {
    const w: Where = isP(s.kind) ? s.kind : 'main';
    if (!s.group) return fn(w, s.i);
    const list = s.kind === 'box' || s.kind === 'ground' ? this.lootStacks(s.kind) : this.inv.list(w);
    if (!list) return;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].id === s.group) fn(w, i);
  }

  private primary(s: Src): void {
    if (isP(s.kind)) {
      const st = this.inv.list(s.kind)[s.i];
      if (!st) return;
      if (item(st.id).equip) this.equip(s.kind, s.i);
      else this.h.use(s.kind, s.i);
    } else if (s.kind === 'box' || s.kind === 'ground') this.take(s.kind, s.i);
    else if (s.kind === 'eq') this.unequip(s.key as EquipSlot);
    else if (s.kind === 'hot') this.useHotbar(s.i);
  }

  // --- Drag & Drop ------------------------------------------------------------------

  private srcOf(t: EventTarget | null): { src: Src; el: HTMLElement } | null {
    const el = (t as HTMLElement | null)?.closest?.<HTMLElement>('.row[data-src], .cell.full[data-src]');
    if (!el) return null;
    const kind = el.dataset.src as Kind;
    const key = el.dataset.key ?? el.dataset.i ?? '0';
    const i = kind === 'eq' ? 0 : Number(el.dataset.i ?? key);
    return { src: { kind, i, key, group: el.dataset.group }, el };
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const t = (e.target as HTMLElement).closest('input, select, button, .chev');
    if (t) return;
    const r = this.srcOf(e.target);
    if (!r) return;
    e.preventDefault();
    if (e.shiftKey) return this.quick(r.src);
    this.drag = { src: r.src, x: e.clientX, y: e.clientY, ghost: null };
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (!d.ghost) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
      const icon = this.iconOf(d.src);
      d.ghost = document.createElement('div');
      d.ghost.id = 'dragghost';
      d.ghost.innerHTML = icon;
      document.body.append(d.ghost);
      this.hideTip();
      document.body.classList.add('dragging');
    }
    d.ghost.style.transform = `translate(${e.clientX - 26}px, ${e.clientY - 26}px)`;
    document.querySelectorAll('.over').forEach((x) => x.classList.remove('over'));
    (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-drop]')?.classList.add('over');
  }

  private iconOf(s: Src): string {
    const id = this.idOf(s);
    return id ? iconHtml(id) : '';
  }

  private idOf(s: Src): string | null {
    if (s.group) return s.group;
    if (isP(s.kind)) return this.inv.list(s.kind)[s.i]?.id ?? null;
    if (s.kind === 'box' || s.kind === 'ground') return this.lootStacks(s.kind)?.[s.i]?.id ?? null;
    if (s.kind === 'eq') return this.inv.equipment[s.key as EquipSlot];
    return this.inv.hotbar[s.i];
  }

  private cancelDrag(): void {
    this.drag?.ghost?.remove();
    this.drag = null;
    document.body.classList.remove('dragging');
    document.querySelectorAll('.over').forEach((x) => x.classList.remove('over'));
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const moved = !!d.ghost;
    this.cancelDrag();
    if (!moved) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const target = el?.closest<HTMLElement>('[data-drop]');
    const outside = !el?.closest('#inv2, #hotbar, #imenu');
    this.dropOn(d.src, target?.dataset.drop as Kind | undefined, target, outside);
  }

  private dropOn(s: Src, to: Kind | undefined, el: HTMLElement | null | undefined, outside: boolean): void {
    const inv = this.inv;
    const id = this.idOf(s);
    if (!id) return;
    const ti = Number(el?.dataset.i ?? -1);

    if (s.kind === 'hot') {
      if (to === 'hot' && ti >= 0) {
        const hb = inv.hotbar;
        [hb[s.i], hb[ti]] = [hb[ti], hb[s.i]];
        return this.apply(() => {});
      }
      return this.bind(s.i, null);
    }
    if (outside && this.open) {
      // aus dem Fenster gezogen = auf den Boden werfen
      if (isP(s.kind)) return this.moveGroupOrOne(s, (w, i, q) => this.put(w, i, 'ground', q));
      if (s.kind === 'eq') {
        this.unequip(s.key as EquipSlot);
        this.putById(id, 1, 'ground');
      }
      return;
    }
    if (!to) return;
    if (to === 'hot') return this.bind(ti, id);
    if (to === 'eq') {
      const es = el!.dataset.es as EquipSlot;
      if (item(id).equip?.slot !== es) return this.h.toast(`${item(id).name} passt nicht auf „${EQ_LABEL[es][0]}“.`, 'warn');
      if (isP(s.kind)) return this.equip(s.kind, s.i);
      if (s.kind === 'box' || s.kind === 'ground') {
        this.take(s.kind, s.i, 1, 'main');
        this.equipById(id);
      }
      return;
    }

    if (isP(s.kind)) {
      if (isP(to)) {
        if (to === s.kind) return;
        if (this.inv.capacity(to) <= 0) return this.h.toast('Dafür brauchst du einen Rucksack.', 'warn');
        return this.moveGroupOrOne(s, (w, i, q) => this.moveIdx(w, i, to, q));
      }
      if (to === 'box' || to === 'ground') return this.moveGroupOrOne(s, (w, i, q) => this.put(w, i, to, q));
    }
    if (s.kind === 'box' || s.kind === 'ground') {
      if (isP(to)) return this.moveGroupOrOne(s, (_w, i, q) => this.take(s.kind as 'box' | 'ground', i, q, to));
      if (to === 'box' || to === 'ground') return;
    }
    if (s.kind === 'eq') {
      const es = s.key as EquipSlot;
      if (isP(to)) {
        this.unequip(es);
        if (to !== 'main') this.moveById(id, to);
        return;
      }
      if (to === 'box' || to === 'ground') {
        this.unequip(es);
        this.putById(id, 1, to);
      }
    }
  }

  private onDouble(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('input, select, button')) return;
    const r = this.srcOf(e.target);
    if (!r || r.el.classList.contains('g')) return;
    this.primary(r.src);
  }

  // --- Kontextmenü -------------------------------------------------------------------

  private onMenu(e: MouseEvent): void {
    e.preventDefault();
    const r = this.srcOf(e.target);
    if (!r) return this.hideMenu();
    const s = r.src;
    const id = this.idOf(s);
    if (!id) return this.hideMenu();
    const d = item(id);
    const opts: [string, () => void][] = [];
    if (isP(s.kind)) {
      // Bauteile: Rechtsklick auf „Bauen“ nimmt sie in die Hand, dann Rechtsklick in der Welt zum Setzen
      if (d.piece) {
        opts.push(['Bauen', () => {
          const f = this.inv.find(id);
          if (f) this.h.use(f.where, f.index);
        }]);
      }
      if (!s.group) {
        if (d.use) opts.push([d.category === 'drink' ? 'Trinken' : d.category === 'food' ? 'Essen' : 'Benutzen', () => this.h.use(s.kind as Where, s.i)]);
        if (d.equip) opts.push(['Anlegen', () => this.equip(s.kind as Where, s.i)]);
      }
      for (const other of ['main', 'bag', 'side'] as const) {
        if (other === s.kind || this.inv.capacity(other) <= 0) continue;
        opts.push([`In: ${WHERE_NAME[other]}`, () => this.moveGroupOrOne(s, (w, i, q) => this.moveIdx(w, i, other, q))]);
      }
      if (!this.inv.hotbar.includes(id)) {
        const free = this.inv.hotbar.indexOf(null);
        opts.push([`Auf Schnellleiste${free >= 0 ? ` (${free + 1})` : ''}`, () => this.bind(free >= 0 ? free : HOTBAR_SIZE - 1, id)]);
      }
      const kind = this.curLootKind();
      if (this.open) opts.push([`In „${kind === 'box' ? this.container!.name : 'Boden'}“ legen`, () => this.moveGroupOrOne(s, (w, i, q) => this.put(w, i, kind, q))]);
      if (!s.group && this.inv.list(s.kind)[s.i].qty > 1) opts.push(['1 ablegen', () => this.put(s.kind as Where, s.i, 'ground', 1)]);
      opts.push([s.group ? 'Alle ablegen' : 'Ablegen', () => this.moveGroupOrOne(s, (w, i, q) => this.put(w, i, 'ground', q))]);
    } else if (s.kind === 'box' || s.kind === 'ground') {
      const k = s.kind;
      opts.push(['Nehmen', () => this.moveGroupOrOne(s, (_w, i, q) => this.take(k, i, q))]);
      if (!s.group && (this.lootStacks(k)?.[s.i]?.qty ?? 0) > 1) opts.push(['1 nehmen', () => this.take(k, s.i, 1)]);
      opts.push(['Alles nehmen', () => this.takeAll()]);
    } else if (s.kind === 'eq') {
      opts.push(['Ausziehen', () => this.unequip(s.key as EquipSlot)]);
    } else if (s.kind === 'hot') {
      opts.push([d.piece ? 'Bauen' : 'Benutzen', () => this.useHotbar(s.i)]);
      opts.push(['Von Leiste entfernen', () => this.bind(s.i, null)]);
    }
    this.menu.innerHTML = opts.map(([l], k) => `<button data-k="${k}">${l}</button>`).join('');
    this.menu.onclick = (ev) => {
      const k = (ev.target as HTMLElement).closest<HTMLElement>('button')?.dataset.k;
      if (k === undefined) return;
      this.hideMenu();
      opts[Number(k)][1]();
    };
    this.hideTip();
    this.menu.classList.add('on');
    const rect = this.menu.getBoundingClientRect();
    this.menu.style.left = `${Math.min(e.clientX, innerWidth - rect.width - 8)}px`;
    this.menu.style.top = `${Math.min(e.clientY, innerHeight - rect.height - 8)}px`;
  }

  private hideMenu(): void {
    this.menu.classList.remove('on');
  }

  // --- Tooltip ---------------------------------------------------------------------------

  private onOver(e: PointerEvent): void {
    if (this.drag?.ghost || this.menu.classList.contains('on')) return;
    const c = (e.target as HTMLElement).closest<HTMLElement>('[data-item]');
    if (!c?.dataset.item) return this.hideTip();
    const d = item(c.dataset.item);
    const qty = Number(c.dataset.qty ?? 1);
    const fx: string[] = [];
    const u = d.use;
    if (u?.hunger) fx.push(`<span class="g">+${u.hunger} Sättigung</span>`);
    if (u?.thirst) fx.push(`<span class="g">+${u.thirst} Durst</span>`);
    if (u?.energy) fx.push(`<span class="g">+${u.energy} Energie</span>`);
    if (u?.heal) fx.push(`<span class="g">+${u.heal} Gesundheit</span>`);
    if (u?.treat) fx.push(`<span class="g">${TREAT_NAME[u.treat]}: Rechtsklick/Doppelklick oder im Gesundheits-Reiter</span>`);
    const e2 = d.equip;
    if (e2?.capacity) fx.push(`<span class="b">Fasst ${e2.capacity} kg${e2.side ? ` + ${e2.side} kg Seitentaschen` : ''}</span>`);
    if (e2?.reduce) fx.push(`<span class="b">Inhalt −${Math.round(e2.reduce * 100)} % Gewicht</span>`);
    if (e2?.warmth) fx.push(`<span class="b">+${Math.round(e2.warmth * 100)} % Kälteschutz</span>`);
    if (e2?.light) fx.push('<span class="b">Lichtquelle</span>');
    if (e2?.defense) fx.push(`<span class="b">Schutz vor Zombies ${e2.defense} %</span>`);
    const wp = WEAPONS[d.id];
    if (wp) fx.push(`<span class="g">Schaden ${wp.min}–${wp.max}</span>`, `<span class="b">Reichweite ${wp.range} m</span>`, `<span class="b">Lärm ${wp.noise} m</span>`);
    this.tip.innerHTML = `<b>${d.name}</b><small>${CATEGORY_NAME[d.category]}${e2 ? ` · ${EQ_LABEL[e2.slot][0]}` : ''}</small>
      <p>${d.desc}</p>${fx.length ? `<div class="fx">${fx.join('')}</div>` : ''}
      <div class="meta"><span>${glyph('weight')} ${(d.weight * qty).toFixed(2)} kg${qty > 1 ? ` (${d.weight} kg/Stk)` : ''}</span><span>${glyph('coin')} ${d.value}</span><span>Stapel ${d.maxStack}</span></div>`;
    this.tip.classList.add('on');
    const r = c.getBoundingClientRect();
    const tr = this.tip.getBoundingClientRect();
    let x = r.left - tr.width - 10; // Fenster liegen rechts, also links daneben
    if (x < 8) x = r.right + 10;
    this.tip.style.left = `${Math.max(8, x)}px`;
    this.tip.style.top = `${Math.max(8, Math.min(r.top, innerHeight - tr.height - 8))}px`;
  }

  private hideTip(): void {
    this.tip.classList.remove('on');
  }
}

const TOOL_NAME: Record<string, string> = { hammer: 'Hammer', mechanic: 'Werkzeugkasten', sledge: 'Vorschlaghammer', breaker: 'Axt/Brecheisen' };

const fmt = (w: number): string => (w >= 10 ? w.toFixed(1) : w.toFixed(2));

function tabBtn(tab: string, gl: string, title: string, on: boolean, disabled = false, label = ''): string {
  return `<button class="tabbtn${on ? ' on' : ''}${label ? ' lab' : ''}" data-tab="${tab}" title="${title}" ${disabled ? 'disabled' : ''}>${glyph(gl)}${label ? `<span class="tl">${label}</span>` : ''}</button>`;
}

/** Hält Suchfeld und Auswahlen mit dem Zustand in Einklang (ohne den Fokus zu stören). */
function syncTools(w: WinEls, st: ListState): void {
  const text = w.tools.querySelector<HTMLInputElement>('[data-f="text"]')!;
  const cat = w.tools.querySelector<HTMLSelectElement>('[data-f="cat"]')!;
  const sort = w.tools.querySelector<HTMLSelectElement>('[data-f="sort"]')!;
  if (document.activeElement !== text && text.value !== st.text) text.value = st.text;
  if (cat.value !== st.cat) cat.value = st.cat;
  if (sort.value !== st.sort) sort.value = st.sort;
}

function row(kind: PKind | 'box' | 'ground', i: number, s: Stack, sub: boolean): string {
  const d = item(s.id);
  return `<div class="row s c-${d.category}${sub ? ' sub' : ''}" data-src="${kind}" data-i="${i}" data-item="${s.id}" data-qty="${s.qty}">
    <span class="sp"></span>${iconHtml(s.id)}<span class="nm">${d.name}</span><span class="q">${s.qty > 1 ? `×${s.qty}` : ''}</span><span class="w">${fmt(d.weight * s.qty)}</span></div>`;
}

function cell(src: Kind, key: string, s: Stack | null, attrs: string, placeholder = '', dim = false): string {
  if (!s) {
    return `<div class="cell" data-src="${src}" data-key="${key}" ${attrs}>${placeholder ? `<span class="ph">${placeholder}</span>` : ''}</div>`;
  }
  const d = item(s.id);
  return `<div class="cell full c-${d.category}${dim ? ' dim' : ''}" data-src="${src}" data-key="${key}" data-item="${s.id}" data-qty="${s.qty}" ${attrs}>
    ${iconHtml(s.id)}${s.qty > 1 || src === 'hot' ? `<span class="q">${s.qty}</span>` : ''}
  </div>`;
}
