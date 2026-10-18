/**
 * PZ-Erweiterung: neue Items (Vorbild PZwiki Item list), Schusswaffen, Icons und Loot – komplett getrennt vom
 * restlichen Code. Nichts hier verändert bestehende Dateien; erst `registerPz()` mischt die Daten in die
 * vorhandenen Tabellen.
 *
 * Einbinden (eine Stelle, z. B. in main.ts vor dem Spielstart):
 *
 *   import { ITEMS } from './data/items';
 *   import { WEAPONS } from './data/weapons';
 *   import { LOOT_LISTS } from './data/loot';
 *   import { registerPz } from './pz';
 *   registerPz({ items: ITEMS, weapons: WEAPONS, loot: LOOT_LISTS });
 *
 * Icons: `pzIconURL(id)` liefert das Bild eines PZ-Items (sonst null → normales iconURL benutzen).
 * Hand-Modelle: `PZ_TOOL_BUILD[id]()` liefert die 3D-Teile der Waffe (Format wie TOOL_BUILD in render/Character.ts).
 * Schießen: `firearmOf(handItem)` + `fire()` / `reload()` aus pzWeapons.ts.
 */
import type { ItemDef } from '../data/items';
import type { WeaponDef } from '../data/weapons';
import type { LootList } from '../data/loot';
import { PZ_ITEMS, PZ_ICONS, PZ_LOOT_ADD, PZ_BOX_CONTENT } from './pzItems';
import { PZ_MELEE } from './pzWeapons';
import { pzIconFor } from './pzIcons';
import { weaponIconURL } from './pzWeaponIcons';

export * from './pzWeapons';
export { PZ_ITEMS, PZ_ICONS, PZ_LOOT_ADD, PZ_BOX_CONTENT, PZ_MAGAZINES, PZ_SKILL_BOOKS } from './pzItems';
export { pzIconFor, ICON_KINDS } from './pzIcons';
export { weaponIconURL, WEAPON_ICON_IDS } from './pzWeaponIcons';
export { PZ_TOOL_BUILD } from './pzHandModels';
export type { IconKind } from './pzIcons';

export interface PzHost {
  items: Record<string, ItemDef>;
  weapons: Record<string, WeaponDef>;
  /** optional: Loot-Tabellen, in die die PZ-Items einsortiert werden */
  loot?: Record<string, LootList>;
}

/** Mischt Items, Nahkampfwaffen und Loot ein. Mehrfachaufruf ist harmlos. */
export function registerPz(host: PzHost): void {
  for (const d of Object.values(PZ_ITEMS)) {
    const tags = [...new Set([d.category, ...(d.tags ?? [])])];
    host.items[d.id] = { ...d, tags };
  }
  Object.assign(host.weapons, PZ_MELEE);
  if (!host.loot) return;
  for (const [list, entries] of Object.entries(PZ_LOOT_ADD)) {
    const target = (host.loot[list] ??= { rolls: [1, 2], empty: 0.3, items: [] });
    const have = new Set(target.items.map((e) => e[0]));
    for (const e of entries) if (!have.has(e[0])) target.items.push(e);
  }
}

/** data-URL des Icons eines PZ-Items oder null, wenn die Id nicht von hier stammt */
export function pzIconURL(id: string): string | null {
  const w = weaponIconURL(id);
  if (w) return w;
  const m = PZ_ICONS[id];
  return m ? pzIconFor(m[0], m[1]) : null;
}

/** Schachtel/Karton auspacken: liefert Item-Id und Anzahl des Inhalts (oder null) */
export function unpack(id: string): { id: string; qty: number } | null {
  const c = PZ_BOX_CONTENT[id];
  return c ? { id: c[0], qty: c[1] } : null;
}
