import { COIN, item } from '../data/items';
import { FACTIONS, FactionId } from '../data/factions';
import { FactionWorld, Result, TRIBUTE_COST } from '../factions/FactionWorld';
import { ALLY_MIN, repLabel } from '../factions/Reputation';
import { Inventory } from '../player/Inventory';
import { iconHtml } from '../render/Icons';
import { glyph } from './Glyphs';
import { Npc } from '../factions/Npc';

export interface DialogHooks {
  toast: (msg: string, kind: 'info' | 'good' | 'warn' | 'bad') => void;
  /** Rucksack/Handwerk/Bauleiste neu zeichnen */
  refresh: () => void;
  day: () => number;
  onClose: (npc: Npc) => void;
}

const bar = (rep: number, color: string) =>
  `<div class="repbar"><div style="left:${50 + Math.min(0, rep) / 2}%;width:${Math.abs(rep) / 2}%;background:${color}"></div></div>`;

/** Gespräch mit einem NPC: Hauptmenü und Handelsansicht. */
export class DialogUI {
  private el = document.createElement('div');
  private npc: Npc | null = null;
  private mode: 'main' | 'trade' = 'main';
  private note = '';

  constructor(private world: FactionWorld, private inv: Inventory, private hooks: DialogHooks) {
    this.el.id = 'dialog';
    this.el.className = 'panel';
    document.body.append(this.el);
    this.el.addEventListener('click', (e) => this.onClick(e.target as HTMLElement));
  }

  get isOpen(): boolean {
    return this.npc !== null;
  }

  get current(): Npc | null {
    return this.npc;
  }

  open(npc: Npc): void {
    this.npc = npc;
    this.mode = 'main';
    this.note = '';
    this.el.classList.add('on');
    this.render();
  }

  close(): void {
    if (!this.npc) return;
    const n = this.npc;
    this.npc = null;
    this.el.classList.remove('on');
    this.hooks.onClose(n);
  }

  refresh(): void {
    if (this.npc) this.render();
  }

  private apply(r: Result): void {
    this.note = r.msg;
    this.hooks.toast(r.msg, r.ok ? 'good' : 'warn');
    this.hooks.refresh();
    this.render();
  }

  private onClick(t: HTMLElement): void {
    const btn = t.closest<HTMLElement>('[data-act]');
    if (!btn || btn.hasAttribute('disabled') || !this.npc) return;
    const id = this.npc.factionId;
    const act = btn.dataset.act!;
    const i = Number(btn.dataset.i);
    switch (act) {
      case 'close': return this.close();
      case 'trade': this.mode = 'trade'; this.note = ''; return this.render();
      case 'back': this.mode = 'main'; this.note = ''; return this.render();
      case 'tribute': return this.apply(this.world.payTribute(id, this.inv, this.hooks.day()));
      case 'request': return this.apply(this.world.turnInRequest(id, this.inv));
      case 'ally': return this.apply(this.world.proposeAlliance(id));
      case 'buy': return this.apply(this.world.buy(id, this.inv, btn.dataset.item!));
      case 'sell': return this.apply(this.world.sell(id, this.inv, i));
      case 'gift': return this.apply(this.world.gift(id, this.inv, i));
    }
  }

  private render(): void {
    const npc = this.npc;
    if (!npc) return;
    const id = npc.factionId;
    const def = npc.def;
    const s = this.world.state(id);
    const header = `
      <header>
        <h3><span class="dot" style="background:${def.css}"></span>${npc.name} <small>${def.name}${s.allied ? ' · Verbündet' : ''}</small></h3>
        <div class="rep"><span>${repLabel(s.rep)} (${Math.round(s.rep)})</span>${bar(s.rep, def.css)}</div>
      </header>`;
    this.el.innerHTML = header + (this.mode === 'main' ? this.main(id) : this.trade(id)) + (this.note ? `<div class="note">${this.note}</div>` : '');
  }

  private main(id: FactionId): string {
    const s = this.world.state(id);
    const canTrade = this.world.canTrade(id);
    const req = s.request;
    const coins = this.inv.count(COIN);
    const reqBtn = req
      ? `<button class="btn" data-act="request" ${this.world.canTurnIn(id, this.inv) ? '' : 'disabled'}>Auftrag: ${req.qty}× ${item(req.itemId).name} abgeben (+${req.coins} ${glyph('coin')}, +${req.rep} Ansehen)</button>`
      : '';
    const allyBtn = s.allied
      ? '<button class="btn" disabled>Bündnis besteht</button>'
      : `<button class="btn" data-act="ally" ${s.rep >= ALLY_MIN ? '' : 'disabled'}>Bündnis vorschlagen (ab ${ALLY_MIN} Ansehen)</button>`;
    return `
      <p class="say">„${this.world.greeting(id)}“</p>
      <div class="choices">
        <button class="btn" data-act="trade" ${canTrade.ok ? '' : 'disabled'}>Handeln${canTrade.ok ? '' : ' (verweigert)'}</button>
        ${reqBtn}
        <button class="btn" data-act="tribute" ${coins >= TRIBUTE_COST ? '' : 'disabled'}>${id === 'raiders' ? 'Tribut zahlen' : 'Spenden'} (${TRIBUTE_COST} ${glyph('coin')})</button>
        ${allyBtn}
        <button class="btn" data-act="close">Gehen</button>
      </div>`;
  }

  private trade(id: FactionId): string {
    const s = this.world.state(id);
    const offers = this.world
      .offers(id)
      .map((o) => {
        const d = item(o.itemId);
        return `<div class="row" data-act="buy" data-item="${o.itemId}" title="${d.desc}">
          <span class="ic">${iconHtml(d.id, "ico")}</span><span class="nm">${d.name}</span><span class="q">×${o.qty}</span><span class="w">${o.price} ${glyph('coin')}</span><span></span></div>`;
      })
      .join('');
    const mine = this.inv.stacks
      .map((st, i) => {
        if (st.id === COIN) return '';
        const d = item(st.id);
        const wanted = this.world.def(id).wants.includes(st.id);
        return `<div class="row" data-act="sell" data-i="${i}" title="Klick = verkaufen">
          <span class="ic">${iconHtml(d.id, "ico")}</span><span class="nm">${d.name}${wanted ? ' ' + glyph('star') : ''}</span><span class="q">×${st.qty}</span>
          <span class="w">${this.world.sellValue(id, st.id)} ${glyph('coin')}</span>
          <button class="drop" data-act="gift" data-i="${i}" title="Verschenken (+Ansehen)">${glyph('gift')}</button></div>`;
      })
      .join('');
    return `
      <div class="coins">Du: <b>${this.inv.count(COIN)} ${glyph('coin')}</b> · Sie: <b>${Math.round(s.coins)} ${glyph('coin')}</b> · Stern = gesucht (mehr Geld) · Geschenk = verschenken</div>
      <div class="cols">
        <div><h4>Sie verkaufen</h4><div class="list">${offers || '<div class="empty">Ausverkauft</div>'}</div></div>
        <div><h4>Dein Rucksack</h4><div class="list">${mine || '<div class="empty">Leer</div>'}</div></div>
      </div>
      <div class="choices"><button class="btn" data-act="back">Zurück</button></div>`;
  }
}

/** Übersicht aller Fraktionen (Taste V). */
export class FactionsPanel {
  private el = document.createElement('div');

  constructor(private world: FactionWorld, private day: () => number) {
    this.el.className = 'panel inv factions';
    document.body.append(this.el);
  }

  get isOpen(): boolean {
    return this.el.classList.contains('on');
  }

  toggle(force?: boolean): void {
    this.el.classList.toggle('on', force ?? !this.isOpen);
    this.refresh();
  }

  refresh(): void {
    if (!this.isOpen) return;
    const day = this.day();
    const rows = FACTIONS.map((f) => {
      const s = this.world.state(f.id);
      const req = s.request ? `<div class="req">Gesucht: ${s.request.qty}× ${item(s.request.itemId).name} → ${s.request.coins} ${glyph('coin')}</div>` : '';
      const status =
        f.id === 'raiders' && s.protectedUntil > day ? ' · Tribut bezahlt'
        : this.world.isHostile(f.id, day) ? ' · greift dich an' : '';
      return `<div class="fac">
        <h4><span class="dot" style="background:${f.css}"></span>${f.name}${s.allied ? ' · Verbündet' : ''}</h4>
        <div class="rep"><span>${repLabel(s.rep)} (${Math.round(s.rep)})${status}</span>${bar(s.rep, f.css)}</div>
        <div class="req">${f.blurb}</div>${req}
      </div>`;
    }).join('');
    const news = this.world.log.length
      ? this.world.log.map((n) => `<div class="news">• ${n}</div>`).join('')
      : '<div class="empty">Keine Neuigkeiten.</div>';
    this.el.innerHTML = `<header><h3>Fraktionen <small>V · Tag ${day}</small></h3></header>
      <div class="list">${rows}<h4 class="nh">Neuigkeiten</h4>${news}</div>`;
  }
}
