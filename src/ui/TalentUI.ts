import './talents.css';
import { BRANCHES, TALENTS, TalentDef, pointsForLevel, talent } from '../data/talents';
import { RECIPES } from '../data/recipes';
import { item } from '../data/items';
import { MAX_LEVEL, SKILLS } from '../data/skills';
import { LEVEL_MAX } from '../sim/Level';
import { iconURL } from '../render/Icons';
import type { Talents } from '../sim/Talents';
import type { PlayerLevel } from '../sim/Level';
import type { Skills } from '../sim/Skills';

export interface TalentHooks {
  talents(): Talents;
  level(): PlayerLevel;
  skills(): Skills;
  unlock(id: string): void;
}

const NODE_DX = 118, NODE_DY = 112, R = 38;
const COLS = 3;
const CLUSTER_W = 3 * NODE_DX + 70;
const TOP = 30;
/** Reihen je Zweig bestimmen die Höhe der Zeile von Gruppen */
const rowsOf = (branch: string): number => 1 + Math.max(...TALENTS.filter((t) => t.branch === branch).map((t) => t.row));

/** Perk-Symbole für Talente ohne Rezept */
const PERK_GLYPH: Record<string, string> = { build: '⚒', mechTime: '⚙', repair: '⚙', treat: '✚', carry: '⇧', melee: '⚔' };

/**
 * Talentseite: eine ganze Seite des Inventars (die Kopfleiste bleibt, darüber kommt man zurück). Links der Baum aus
 * Sechsecken mit Beschreibung darunter, rechts Stufe, Talentpunkte und die Fertigkeiten.
 */
export class TalentUI {
  readonly el = document.createElement('div');
  private sel: string | null = null;

  constructor(private h: TalentHooks) {
    this.el.className = 'tpage';
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('dblclick', (e) => {
      const n = (e.target as HTMLElement).closest<HTMLElement>('[data-talent]');
      if (n) this.h.unlock(n.dataset.talent!);
    });
    this.el.addEventListener('pointerover', (e) => {
      const n = (e.target as HTMLElement).closest<HTMLElement>('[data-talent]');
      if (n && n.dataset.talent !== this.sel) {
        this.sel = n.dataset.talent!;
        this.renderDetail();
      }
    });
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const un = t.closest<HTMLElement>('[data-unlock]');
    if (un) return this.h.unlock(un.dataset.unlock!);
    const n = t.closest<HTMLElement>('[data-talent]');
    if (n) {
      this.sel = n.dataset.talent!;
      this.renderDetail();
    }
  }

  render(): void {
    const lv = this.h.level();
    const tl = this.h.talents();
    const w = COLS * CLUSTER_W + 20;
    const rowH = [0, 1].map((r) => Math.max(...BRANCHES.filter((_, i) => Math.floor(i / COLS) === r).map((b) => rowsOf(b.id))));
    const y0s = [TOP, TOP + 70 + rowH[0] * NODE_DY + 40];
    const hh = y0s[1] + 70 + rowH[1] * NODE_DY + 20;

    const pos = new Map<string, { x: number; y: number }>();
    const parts: string[] = [];
    const lines: string[] = [];
    const nodes: string[] = [];
    BRANCHES.forEach((b, i) => {
      const cx0 = 10 + (i % COLS) * CLUSTER_W, cy0 = y0s[Math.floor(i / COLS)];
      const list = TALENTS.filter((t) => t.branch === b.id);
      const got = list.filter((t) => tl.has(t.id)).length;
      parts.push(`<text class="bt" x="${cx0 + CLUSTER_W / 2 - 20}" y="${cy0 + 6}" text-anchor="middle" fill="${b.color}">${b.name.toUpperCase()}</text>
        <text class="bs" x="${cx0 + CLUSTER_W / 2 - 20}" y="${cy0 + 26}" text-anchor="middle">${b.blurb} · ${got}/${list.length}</text>
        <line x1="${cx0 + 30}" y1="${cy0 + 38}" x2="${cx0 + CLUSTER_W - 70}" y2="${cy0 + 38}" stroke="${b.color}" stroke-opacity="0.35"/>`);
      for (const t of list) pos.set(t.id, { x: cx0 + 60 + t.col * NODE_DX, y: cy0 + 100 + t.row * NODE_DY });
    });
    for (const t of TALENTS) {
      const p = pos.get(t.id)!;
      for (const r of t.requires ?? []) {
        const q = pos.get(r)!;
        const cls = tl.has(t.id) ? 'on' : tl.has(r) ? 'open' : 'off';
        lines.push(`<line class="ln ${cls}" x1="${q.x}" y1="${q.y}" x2="${p.x}" y2="${p.y}"/>`);
      }
      nodes.push(this.nodeSvg(t, p.x, p.y, tl, lv.level));
    }
    this.el.innerHTML = `<div class="tp-main">
        <div class="tmap"><svg viewBox="0 0 ${w} ${hh}" preserveAspectRatio="xMidYMid meet">${parts.join('')}${lines.join('')}${nodes.join('')}</svg></div>
        <div class="tdetail"></div>
      </div>
      <aside class="tp-side">${this.sideHtml()}</aside>`;
    if (!this.sel || !talent(this.sel)) this.sel = TALENTS.find((t) => tl.canUnlock(t, lv.level).ok)?.id ?? TALENTS[0].id;
    this.renderDetail();
  }

  /** Rechts: Stufe, Talentpunkte, Fertigkeiten */
  private sideHtml(): string {
    const lv = this.h.level();
    const tl = this.h.talents();
    const free = tl.free(lv.level);
    const C = 2 * Math.PI * 26;
    const next = lv.level >= LEVEL_MAX ? 0 : pointsForLevel(lv.level + 1) - pointsForLevel(lv.level);
    const sk = this.h.skills();
    const groups = [...new Set(SKILLS.map((x) => x.group))];
    const skills = groups.map((g) => {
      const cards = SKILLS.filter((x) => x.group === g).map((x) => {
        const l = sk.level(x.id);
        const seg = Array.from({ length: MAX_LEVEL }, (_, i) => `<u class="${i < l ? 'on' : i === l ? 'cur' : ''}"${i === l ? ` style="--f:${Math.round(sk.progress(x.id) * 100)}%"` : ''}></u>`).join('');
        return `<div class="sk${l >= MAX_LEVEL ? ' max' : ''}" title="${x.perk}"><div class="skt"><span>${x.name}</span><b>${l}</b></div><div class="seg">${seg}</div></div>`;
      }).join('');
      return `<h5>${g}</h5><div class="skgrid">${cards}</div>`;
    }).join('');
    return `<h3>Fortschritt</h3>
      <div class="lvl"><div class="ring"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" class="bg"/><circle cx="32" cy="32" r="26" class="fg" stroke-dasharray="${(C * lv.progress).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 32 32)"/></svg><div><small>Stufe</small><b>${lv.level}</b></div></div>
        <div class="lvl-b"><span class="lx">${lv.level >= LEVEL_MAX ? 'Höchste Stufe' : `${lv.toNext} XP bis Stufe ${lv.level + 1}`}${next ? ` · +${next} Punkt${next === 1 ? '' : 'e'}` : ''}</span>
        <div class="shards"><span>Talentpunkte</span><b>${free}</b></div>
        <small>${tl.spent} ausgegeben · ${pointsForLevel(lv.level)} bisher</small></div></div>
      <h3>Fertigkeiten</h3>${skills}`;
  }

  private hex(cx: number, cy: number, r: number): string {
    return Array.from({ length: 6 }, (_, i) => {
      const a = ((-90 + 60 * i) * Math.PI) / 180;
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
  }

  private nodeSvg(t: TalentDef, x: number, y: number, tl: Talents, level: number): string {
    const have = tl.has(t.id);
    const can = tl.canUnlock(t, level).ok;
    const state = have ? 'have' : can ? 'can' : tl.missing(t).length ? 'lock' : 'poor';
    const br = BRANCHES.find((b) => b.id === t.branch)!;
    const first = t.recipes?.[0];
    const out = first ? RECIPES.find((r) => r.id === first)?.output.id : undefined;
    const perkKey = t.perk ? Object.keys(t.perk)[0] : '';
    const icon = out
      ? `<image href="${iconURL(out)}" x="${x - 21}" y="${y - 25}" width="42" height="42" preserveAspectRatio="xMidYMid meet"/>`
      : `<text class="pg" x="${x}" y="${y + 11}" text-anchor="middle">${PERK_GLYPH[perkKey] ?? '★'}</text>`;
    return `<g class="node ${state}${this.sel === t.id ? ' sel' : ''}" data-talent="${t.id}" style="--bc:${br.color}">
      <polygon class="hx" points="${this.hex(x, y, R)}"/>
      <polygon class="hx2" points="${this.hex(x, y, R - 7)}"/>
      ${icon}
      <circle class="cost" cx="${x + R - 6}" cy="${y - R + 14}" r="11"/>
      <text class="ct" x="${x + R - 6}" y="${y - R + 18}" text-anchor="middle">${have ? '✓' : t.cost}</text>
      <text class="nm" x="${x}" y="${y + R + 20}" text-anchor="middle">${t.name}</text></g>`;
  }

  private renderDetail(): void {
    const box = this.el.querySelector<HTMLElement>('.tdetail');
    if (!box) return;
    this.el.querySelectorAll('.node.sel').forEach((n) => n.classList.remove('sel'));
    this.el.querySelector(`.node[data-talent="${this.sel}"]`)?.classList.add('sel');
    const t = this.sel ? talent(this.sel) : undefined;
    if (!t) return void (box.innerHTML = '');
    const tl = this.h.talents();
    const level = this.h.level().level;
    const br = BRANCHES.find((b) => b.id === t.branch)!;
    const res = tl.canUnlock(t, level);
    const have = tl.has(t.id);
    const rec = (t.recipes ?? [])
      .map((id) => RECIPES.find((r) => r.id === id))
      .filter((r) => !!r)
      .map((r) => `<span class="rc"><img src="${iconURL(r!.output.id)}" alt="">${item(r!.output.id).name}</span>`)
      .join('');
    const req = (t.requires ?? []).map((id) => `<span class="${tl.has(id) ? 'ok' : 'no'}">${talent(id)?.name ?? id}</span>`).join(' · ');
    box.innerHTML = `<div class="dn" style="--bc:${br.color}"><small>${br.name}</small><b>${t.name}</b></div>
      <div class="dd"><p>${t.desc}</p>${rec ? `<div class="rcs">${rec}</div>` : ''}${req ? `<p class="rq">Benötigt: ${req}</p>` : ''}</div>
      <div class="da">${have ? '<span class="got">Freigeschaltet</span>' : res.ok ? `<button data-unlock="${t.id}">Freischalten · ${t.cost} Punkt${t.cost === 1 ? '' : 'e'}</button>` : `<span class="why">${res.reason}</span>`}</div>`;
  }
}
