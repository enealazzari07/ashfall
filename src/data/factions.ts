import { Stack } from './items';

export type FactionId = 'traders' | 'raiders' | 'farmers';

export interface RequestDef {
  itemId: string;
  qty: number;
  coins: number;
  rep: number;
}

export interface FactionDef {
  id: FactionId;
  name: string;
  color: number;
  css: string;
  /** Chunk, dessen Kreuzung das Lager trägt (Mitte bei cx*64+4, cz*64+4) */
  camp: { cx: number; cz: number };
  baseRep: number;
  coins: number;
  stock: Stack[];
  /** Tägliche Produktion */
  production: Stack[];
  /** Zahlt dafür mehr */
  wants: string[];
  /** Tägliches Geschenk an Verbündete */
  gift: Stack[];
  requests: RequestDef[];
  names: string[];
  blurb: string;
  greet: { hostile: string; neutral: string; friendly: string };
}

export const FACTIONS: FactionDef[] = [
  {
    id: 'traders',
    name: 'Karawane der Neun Wege',
    color: 0xd9a441,
    css: '#d9a441',
    camp: { cx: 1, cz: 1 },
    baseRep: 15,
    coins: 120,
    stock: [
      { id: 'water', qty: 4 }, { id: 'beans', qty: 4 }, { id: 'bandage', qty: 3 }, { id: 'cloth', qty: 4 },
      { id: 'coffee', qty: 2 }, { id: 'wood', qty: 3 }, { id: 'bar', qty: 4 },
    ],
    production: [{ id: 'water', qty: 1 }, { id: 'beans', qty: 1 }, { id: 'bandage', qty: 1 }, { id: 'bar', qty: 1 }],
    wants: ['wood', 'cloth', 'bread'],
    gift: [{ id: 'coffee', qty: 1 }, { id: 'coin', qty: 10 }],
    requests: [
      { itemId: 'cloth', qty: 4, coins: 20, rep: 8 },
      { itemId: 'wood', qty: 3, coins: 24, rep: 8 },
    ],
    names: ['Mara', 'Jonas', 'Lena', 'Tarek', 'Ines'],
    blurb: 'Fahrende Händler. Handeln mit jedem, der zahlt – und der nicht stört.',
    greet: {
      hostile: 'Mit dir handeln wir nicht, solange du uns Ärger machst.',
      neutral: 'Willkommen! Schau dir meine Ware an.',
      friendly: 'Mein Freund! Für dich habe ich immer einen guten Preis.',
    },
  },
  {
    id: 'raiders',
    name: 'Aschewölfe',
    color: 0xb3392b,
    camp: { cx: -3, cz: -1 },
    css: '#b3392b',
    baseRep: -30,
    coins: 40,
    stock: [{ id: 'beans', qty: 3 }, { id: 'water', qty: 2 }, { id: 'bar', qty: 2 }, { id: 'wood', qty: 2 }],
    production: [{ id: 'bar', qty: 1 }],
    wants: ['bandage', 'water', 'coffee'],
    gift: [{ id: 'bar', qty: 2 }],
    requests: [],
    names: ['Kai', 'Brenner', 'Rusty', 'Vex', 'Narbe'],
    blurb: 'Plünderer. Respektieren Stärke und Tribut – wer zahlt, wird in Ruhe gelassen.',
    greet: {
      hostile: 'Ha! Frischfleisch. Her mit deinen Vorräten – oder zahl Tribut.',
      neutral: 'Du hast dich bewährt. Wir lassen dich vorerst in Ruhe.',
      friendly: 'Du gehörst fast zum Rudel. Fass dich nicht an unsere Beute.',
    },
  },
  {
    id: 'farmers',
    name: 'Grünhof-Kommune',
    color: 0x5fa04a,
    css: '#5fa04a',
    camp: { cx: -1, cz: 3 },
    baseRep: 5,
    coins: 60,
    stock: [{ id: 'bread', qty: 6 }, { id: 'apple', qty: 8 }, { id: 'beans', qty: 3 }, { id: 'water', qty: 3 }],
    production: [{ id: 'bread', qty: 2 }, { id: 'apple', qty: 2 }],
    wants: ['bandage', 'cloth', 'wood'],
    gift: [{ id: 'bread', qty: 2 }, { id: 'apple', qty: 2 }],
    requests: [
      { itemId: 'bandage', qty: 2, coins: 25, rep: 10 },
      { itemId: 'cloth', qty: 3, coins: 15, rep: 8 },
    ],
    names: ['Hanna', 'Willi', 'Greta', 'Otto', 'Elsa'],
    blurb: 'Friedliche Bauern. Haben Essen im Überfluss, aber kaum Medizin.',
    greet: {
      hostile: 'Geh weiter. Wir wollen keinen Ärger.',
      neutral: 'Guten Tag, Fremder. Was brauchst du?',
      friendly: 'Schön dich zu sehen! Setz dich, iss was mit uns.',
    },
  },
];

export function factionDef(id: FactionId): FactionDef {
  return FACTIONS.find((f) => f.id === id)!;
}
