import { Inventory } from '../player/Inventory';
import { RECIPES, Recipe, isKnown, needsBench } from '../data/recipes';
import { item } from '../data/items';
import { iconHtml } from '../render/Icons';
import type { Talents } from '../sim/Talents';

/** Herstellen-Panel (Taste C). Rezepte sind datengetrieben. */
export class CraftingUI {
  private el = document.createElement('div');

  constructor(private inv: Inventory, private talents: Talents, private nearBench: () => boolean, private onCraft: (r: Recipe) => void) {
    this.el.className = 'panel inv craft';
    this.el.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.recipe');
      if (!row || row.classList.contains('no')) return;
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
    const unlocked = this.talents.knownRecipes();
    const rows = RECIPES.filter((r) => isKnown(r, unlocked)).map((r) => {
      const noBench = needsBench(r) && !this.nearBench();
      const ok = !noBench && this.inv.canSwap(r.inputs, r.output);
      const out = item(r.output.id);
      const reqTxt = r.inputs
        .map((i) => {
          const have = this.inv.count(i.id);
          return `<span class="${have >= i.qty ? 'have' : 'miss'}">${i.qty}× ${item(i.id).name} (${have})</span>`;
        })
        .join(' + ');
      return `<div class="recipe row2 ${ok ? '' : 'no'}" data-id="${r.id}">
        <span class="ic">${iconHtml(out.id, "ico")}</span>
        <div><div class="nm">${out.name}${r.output.qty > 1 ? ` ×${r.output.qty}` : ''}${noBench ? ' <em class="lock">Werkbank</em>' : ''}</div><div class="req">${reqTxt}</div></div>
      </div>`;
    }).join('');
    this.el.innerHTML = `<header><h3>Herstellen <small>C</small></h3></header><div class="list">${rows}</div>
      <div class="hint">Klick = herstellen · Bauteile mit Rechtsklick setzen</div>`;
  }
}
