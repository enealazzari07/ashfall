import { Stack } from './items';

/** Ein Eintrag: Item, Gewichtung, Mindest- und Höchstmenge */
export type LootEntry = [id: string, weight: number, min: number, max: number];

export interface LootList {
  /** Anzahl Würfe (min..max) */
  rolls: [number, number];
  /** Wahrscheinlichkeit 0..1, dass der Behälter leer bleibt */
  empty: number;
  items: LootEntry[];
}

/** Loot als Tabellen: Raum und Behälter wählen eine Liste, jede Liste würfelt gewichtet. */
export const LOOT_LISTS: Record<string, LootList> = {
  generic: {
    rolls: [1, 3],
    empty: 0.3,
    items: [
      ['water', 10, 1, 2], ['beans', 8, 1, 2], ['bread', 8, 1, 2], ['apple', 8, 1, 3], ['bar', 6, 1, 3], ['coffee', 4, 1, 1],
      ['bandage', 6, 1, 2], ['disinfectant', 1.5, 1, 1], ['suture', 1, 1, 1], ['bottle', 5, 1, 2], ['cloth', 5, 1, 3], ['wood', 3, 1, 1], ['coin', 7, 3, 12],
      ['schoolbag', 1.2, 1, 1], ['hikingpack', 0.5, 1, 1], ['jacket', 1, 1, 1], ['hoodie', 1.5, 1, 1], ['beanie', 1.5, 1, 1],
      ['flashlight', 1.2, 1, 1], ['jeans', 1.2, 1, 1], ['corn', 3, 1, 2], ['boots', 1, 1, 1], ['sweater', 1, 1, 1], ['plaid_jacket', 1, 1, 1], ['cap', 0.8, 1, 1],
      ['bat', 0.9, 1, 1], ['knife', 1.2, 1, 1], ['pipe', 0.6, 1, 1],
    ],
  },
  food: {
    rolls: [1, 3],
    empty: 0.2,
    items: [['water', 8, 1, 2], ['beans', 10, 1, 3], ['bread', 9, 1, 2], ['apple', 8, 1, 3], ['bar', 5, 1, 2], ['coffee', 5, 1, 1], ['corn', 4, 1, 2], ['bottle', 3, 1, 1], ['knife', 1.5, 1, 1]],
  },
  medical: {
    rolls: [1, 2],
    empty: 0.3,
    items: [
      ['bandage', 12, 1, 2], ['disinfectant', 6, 1, 1], ['suture', 4, 1, 1], ['splint', 1.5, 1, 1],
      ['cloth', 6, 1, 2], ['water', 4, 1, 1], ['bottle', 3, 1, 1], ['coin', 2, 2, 6],
    ],
  },
  clothes: {
    rolls: [1, 2],
    empty: 0.3,
    items: [['hoodie', 6, 1, 1], ['jeans', 6, 1, 1], ['beanie', 5, 1, 1], ['jacket', 3, 1, 1], ['boots', 3, 1, 1], ['sweater', 4, 1, 1], ['plaid_jacket', 4, 1, 1], ['denim_jacket', 3, 1, 1], ['leather_jacket', 1.5, 1, 1], ['raincoat', 2.5, 1, 1], ['work_vest', 2, 1, 1], ['shirt_tie', 3, 1, 1], ['cap', 3, 1, 1], ['cargo_pants', 1.5, 1, 1], ['tac_boots', 1.2, 1, 1], ['tac_vest', 0.8, 1, 1], ['schoolbag', 2, 1, 1], ['hikingpack', 0.5, 1, 1], ['cloth', 4, 1, 2]],
  },
  storage: {
    rolls: [1, 3],
    empty: 0.25,
    items: [['wood', 8, 1, 2], ['cloth', 7, 1, 3], ['bottle', 4, 1, 2], ['flashlight', 2, 1, 1], ['hikingpack', 0.6, 1, 1], ['bandage', 2, 1, 1], ['coin', 3, 2, 8], ['pipe', 1.4, 1, 1], ['axe', 1, 1, 1], ['bat', 0.8, 1, 1], ['gascan', 1.2, 1, 1], ['emptycan', 1.2, 1, 1], ['toolbox', 1.4, 1, 1], ['nails', 5, 3, 12], ['scrap', 5, 1, 3], ['hammer', 1.2, 1, 1], ['lockpick', 0.9, 1, 1], ['sledgehammer', 0.5, 1, 1], ['enginepart', 1.2, 1, 1], ['battery', 0.8, 1, 1]],
  },
  office: {
    rolls: [1, 2],
    empty: 0.35,
    items: [['coin', 9, 3, 14], ['coffee', 6, 1, 1], ['bar', 5, 1, 2], ['flashlight', 2, 1, 1], ['schoolbag', 1.5, 1, 1], ['water', 4, 1, 1]],
  },
  /** Waffenkisten (Fabriken, Polizeireviere) */
  weapons: {
    rolls: [1, 3],
    empty: 0.12,
    items: [['bat', 6, 1, 1], ['pipe', 5, 1, 1], ['knife', 6, 1, 1], ['axe', 4, 1, 1], ['sledgehammer', 1.5, 1, 1], ['hammer', 2, 1, 1], ['machete', 4, 1, 1], ['crowbar', 5, 1, 1], ['tac_vest', 1.6, 1, 1], ['cargo_pants', 1.6, 1, 1], ['tac_boots', 1.6, 1, 1], ['cap', 2, 1, 1], ['bandage', 3, 1, 2], ['flashlight', 3, 1, 1]],
  },
  corpse: {
    rolls: [1, 2],
    empty: 0.5,
    items: [['coin', 8, 1, 6], ['bar', 4, 1, 1], ['bandage', 3, 1, 1], ['knife', 1.2, 1, 1], ['flashlight', 1, 1, 1], ['water', 2, 1, 1]],
  },
  vehicle: {
    rolls: [1, 2],
    empty: 0.35,
    items: [['water', 6, 1, 1], ['bandage', 4, 1, 1], ['flashlight', 3, 1, 1], ['coin', 5, 2, 8], ['cloth', 4, 1, 2], ['bar', 3, 1, 1], ['pipe', 1.5, 1, 1], ['bat', 1, 1, 1], ['battery', 1.5, 1, 1], ['gascan', 3, 1, 1], ['enginepart', 2, 1, 1], ['toolbox', 1.2, 1, 1]],
  },
};

/** Welche Liste gilt wo? Zuerst „Raum:Behälter“, dann Behälter, dann Raum, sonst `generic`. */
export const LOOT_ROUTES: Record<string, string> = {
  'kitchen': 'food',
  'bath': 'medical',
  'bedroom:wardrobe': 'clothes',
  'hotelroom:wardrobe': 'clothes',
  'bedroom:nightstand': 'medical',
  'storage': 'storage',
  'garage': 'storage',
  'factory': 'storage',
  'barn': 'storage',
  'office': 'office',
  'meeting': 'office',
  'lobby': 'office',
  'shop:fridge': 'food',
  'wardrobe': 'clothes',
  'dresser': 'clothes',
  'kitchenunit': 'food',
  'trashcan': 'storage',
  'locker': 'clothes',
  'car': 'vehicle',
  'corpse': 'corpse',
  'fridge': 'food',
  'barrel': 'storage',
  'cardbox': 'storage',
  'whcrates': 'storage',
  'whtable': 'storage',
  'weaponcrate': 'weapons',
  'weaponcase': 'weapons',
};

export function lootListFor(room?: string, container?: string): LootList {
  const keys = [room && container ? `${room}:${container}` : '', container ?? '', room ?? ''];
  for (const k of keys) {
    const name = k && LOOT_ROUTES[k];
    if (name) return LOOT_LISTS[name];
  }
  return LOOT_LISTS.generic;
}

/** Würfelt eine Liste aus (deterministisch über die übergebene RNG). */
export function rollList(list: LootList, r: () => number): Stack[] {
  if (r() < list.empty) return [];
  const total = list.items.reduce((s, e) => s + e[1], 0);
  const out = new Map<string, number>();
  const [lo, hi] = list.rolls;
  const n = lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < n; i++) {
    let x = r() * total;
    const e = list.items.find((t) => (x -= t[1]) < 0) ?? list.items[0];
    out.set(e[0], (out.get(e[0]) ?? 0) + e[2] + Math.floor(r() * (e[3] - e[2] + 1)));
  }
  return [...out].map(([id, qty]) => ({ id, qty }));
}

/** Inhalt eines Behälters; ohne Angaben gilt die allgemeine Liste. */
export function rollLoot(r: () => number, room?: string, container?: string): Stack[] {
  return rollList(lootListFor(room, container), r);
}
