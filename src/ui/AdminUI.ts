import { CATEGORY_NAME, CATEGORY_ORDER, Category, ITEMS } from '../data/items';
import { iconHtml } from '../render/Icons';
import { glyph } from './Glyphs';

export interface AdminHooks {
  /** Items ins Inventar legen; was nicht passt, fällt auf den Boden. Gibt die Menge zurück, die im Inventar gelandet ist. */
  give(id: string, qty: number): number;
  /** Gesundheit und Bedürfnisse auffüllen */
  heal(): void;
  fillNeeds(): void;
  toast(msg: string): void;
}

/** Admin-Werkzeug (F9): Liste aller Gegenstände, per Klick ins Inventar legen. */
export class AdminUI {
  private el = document.createElement('div');
  private list = document.createElement('div');
  private text = '';
  private cat: Category | 'all' = 'all';
  private qty = 1;

  constructor(private h: AdminHooks) {
    this.el.id = 'admin';
    const catOpts = ['<option value="all">Alle</option>', ...CATEGORY_ORDER.map((c) => `<option value="${c}">${CATEGORY_NAME[c]}</option>`)].join('');
    this.el.innerHTML = `
      <header><h3>Admin-Werkzeug</h3><span class="hint">F9 oder Esc schließt</span><button data-act="close" title="Schließen">×</button></header>
      <div class="bar">
        <label class="find">${glyph('search')}<input type="search" data-f="text" placeholder="Gegenstand suchen …" autocomplete="off"></label>
        <select data-f="cat">${catOpts}</select>
        <label class="qty">Menge<input type="number" data-f="qty" min="1" max="999" value="1"></label>
      </div>
      <div class="quick">
        <button data-act="heal">Heilen</button>
        <button data-act="needs">Hunger, Durst, Energie, Wärme füllen</button>
      </div>
      <div class="list"></div>
      <footer><span class="count"></span></footer>`;
    this.list = this.el.querySelector<HTMLDivElement>('.list')!;
    document.body.append(this.el);

    // Tasten im Fenster gehören dem Fenster, nicht dem Spiel
    for (const ev of ['keydown', 'keyup']) {
      this.el.addEventListener(ev, (e) => {
        const k = e as KeyboardEvent;
        if (ev === 'keydown' && (k.code === 'Escape' || k.code === 'F9')) {
          k.preventDefault();
          this.toggle(false);
        }
        e.stopPropagation();
      });
    }
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F9') {
        e.preventDefault();
        this.toggle();
      }
    });
    this.el.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement | HTMLSelectElement;
      const f = t.dataset.f;
      if (f === 'text') this.text = t.value.trim().toLowerCase();
      else if (f === 'cat') this.cat = t.value as Category | 'all';
      else if (f === 'qty') this.qty = Math.max(1, Math.min(999, Math.floor(Number(t.value)) || 1));
      if (f !== 'qty') this.render();
    });
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'close') return this.toggle(false);
      if (act === 'heal') return this.h.heal();
      if (act === 'needs') return this.h.fillNeeds();
      const row = t.closest<HTMLElement>('[data-give]');
      if (!row) return;
      const id = row.dataset.give!;
      const mult = t.closest<HTMLElement>('[data-mult]')?.dataset.mult;
      const max = ITEMS[id].maxStack;
      const n = mult === 'stack' ? max : mult === 'one' ? 1 : this.qty;
      this.h.give(id, n);
    });
  }

  get isOpen(): boolean {
    return this.el.classList.contains('on');
  }

  toggle(force?: boolean): void {
    const on = force ?? !this.isOpen;
    this.el.classList.toggle('on', on);
    if (on) {
      this.render();
      this.el.querySelector<HTMLInputElement>('[data-f="text"]')?.focus();
    } else (document.activeElement as HTMLElement | null)?.blur?.();
  }

  private render(): void {
    const items = Object.values(ITEMS)
      .filter((d) => (this.cat === 'all' || d.category === this.cat) && (!this.text || d.name.toLowerCase().includes(this.text) || d.id.includes(this.text)))
      .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name));
    this.list.innerHTML = items
      .map(
        (d) => `<div class="arow" data-give="${d.id}">
          <span class="ic">${iconHtml(d.id, 'ico')}</span>
          <span class="nm">${d.name}<small>${d.id} · ${CATEGORY_NAME[d.category]} · ${d.weight} kg</small></span>
          <button data-mult="one">+1</button><button data-mult="qty" class="main">+ Menge</button>${d.maxStack > 1 ? `<button data-mult="stack">+ ${d.maxStack}</button>` : ''}
        </div>`,
      )
      .join('');
    (this.el.querySelector('.count') as HTMLElement).textContent = `${items.length} von ${Object.keys(ITEMS).length} Gegenständen`;
  }
}
