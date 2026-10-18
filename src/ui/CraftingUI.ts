import { Inventory } from '../player/Inventory';
import { RECIPES, Recipe, needsBench } from '../data/recipes';
import { item } from '../data/items';
import { iconHtml } from '../render/Icons';
import type { PlayerLevel } from '../sim/Level';

/** Herstellen-Panel (Taste C). Rezepte sind datengetrieben. */
export class CraftingUI {
  private el = document.createElement('div');

  constructor(private inv: Inventory, private level: PlayerLevel, private nearBench: () => boolean, private onCraft: (r: Recipe) => void) {
    this.el.className = 'panel inv craft';
    this.el.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.recipe');
      if (!row || row.classList.contains('no') || row.classList.contains('locked')) return;
      const r = RECIPES.find((x) => x.id === row.dataset.id);
      if (r) onCraft(r);
    });
    document.body.append(this.el);
    this.el.style.cssText = 'position:fixed;left:14px;top:90px;';
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
    const rows = RECIPES.map((r) => {
      const need = r.level ?? 1;
      const locked = need > this.level.level;
      const noBench = !locked && needsBench(r) && !this.nearBench();
      const ok = !locked && !noBench && this.inv.canSwap(r.inputs, r.output);
      const out = item(r.output.id);
      const reqTxt = r.inputs
        .map((i) => {
          const have = this.inv.count(i.id);
          return `<span class="${have >= i.qty ? 'have' : 'miss'}">${i.qty}× ${item(i.id).name} (${have})</span>`;
        })
        .join(' + ');
      return `<div class="recipe row2 ${ok ? '' : 'no'} ${locked ? 'locked' : ''}" data-id="${r.id}">
        <span class="ic">${iconHtml(out.id, "ico")}</span>
        <div><div class="nm">${out.name}${r.output.qty > 1 ? ` ×${r.output.qty}` : ''}${locked ? ` <em class="lock">Stufe ${need}</em>` : noBench ? ' <em class="lock">Werkbank</em>' : ''}</div><div class="req">${reqTxt}</div></div>
      </div>`;
    }).join('');
    this.el.innerHTML = `<header><h3>Herstellen <small>C</small></h3></header><div class="list">${rows}</div>
      <div class="hint">Klick = herstellen · Bauteile mit Rechtsklick setzen</div>`;
  }
}
