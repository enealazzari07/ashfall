import { ItemDef } from '../data/items';
import { priceMod } from './Reputation';

/** Was der Spieler beim Kauf bezahlt (Verbündete geben 20 % Rabatt). */
export function buyPrice(def: ItemDef, rep: number, allied: boolean): number {
  return Math.max(1, Math.round(def.value * 1.4 * priceMod(rep) * (allied ? 0.8 : 1)));
}

/** Was der Spieler beim Verkauf bekommt (gewünschte Ware bringt 40 % mehr). */
export function sellPrice(def: ItemDef, rep: number, wanted: boolean): number {
  return Math.max(1, Math.floor(def.value * 0.6 * (2 - priceMod(rep)) * (wanted ? 1.4 : 1)));
}
