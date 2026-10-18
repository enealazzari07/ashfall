export interface Stack {
  id: string;
  qty: number;
}

export type Category = 'gear' | 'drink' | 'food' | 'medical' | 'material' | 'build' | 'misc';

export type EquipSlot = 'head' | 'body' | 'legs' | 'feet' | 'back' | 'hand';

/** Ausrüstung: wird am Körper getragen und zählt nicht gegen die Rucksack-Last. */
export interface ItemEquip {
  slot: EquipSlot;
  /** Rucksäcke: Fassungsvermögen des Behälters in kg */
  capacity?: number;
  /** Rucksäcke: Fassungsvermögen der Seitentaschen in kg */
  side?: number;
  /** Rucksäcke: Anteil 0..1, um den der Inhalt weniger wiegt (zählt gegen die Tragkraft) */
  reduce?: number;
  /** 0..1: Kälteschutz (Isolation der bedeckten Körperzonen) */
  warmth?: number;
  /** 0..1: Schutz vor Wind */
  windproof?: number;
  /** 0..1: Schutz vor Regen (hält die Kleidung trocken) */
  rainproof?: number;
  /** 0..100: Schutz vor Zombie-Angriffen am bedeckten Körperteil in Prozent */
  defense?: number;
  /** Lichtquelle in der Hand */
  light?: boolean;
}

export interface ItemUse {
  hunger?: number;
  thirst?: number;
  energy?: number;
  heal?: number;
  /** Behandlung einer Wunde (siehe player/Treatment.ts) */
  treat?: 'bandage' | 'disinfect' | 'stitch' | 'splint';
}

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  weight: number; // kg pro Stück
  value: number; // Basiswert in Münzen (Handel)
  maxStack: number;
  category: Category;
  desc: string;
  /** Eigenschaften, die Rezepte und Systeme abfragen (z. B. Werkzeug, Brennstoff) */
  tags?: string[];
  use?: ItemUse;
  becomes?: string; // Item, das nach Benutzung übrig bleibt
  equip?: ItemEquip;
  /** Bauteil: wird mit Rechtsklick in der Welt platziert (Id des Bauteils, siehe PIECES) */
  piece?: string;
}

export const COIN = 'coin';

export const ITEMS: Record<string, ItemDef> = {
  coin: { id: 'coin', name: 'Münzen', icon: '', weight: 0.005, value: 1, maxStack: 999, category: 'misc', desc: 'Gängige Währung der Überlebenden.' },
  water: { id: 'water', name: 'Wasserflasche', icon: '', weight: 0.5, value: 6, maxStack: 4, category: 'drink', desc: 'Stillt den Durst.', use: { thirst: 45 }, becomes: 'bottle' },
  bottle: { id: 'bottle', name: 'Leere Flasche', icon: '', weight: 0.1, value: 1, maxStack: 8, category: 'misc', desc: 'Kann später gefüllt werden.' },
  coffee: { id: 'coffee', name: 'Kaffee', icon: '', weight: 0.2, value: 8, maxStack: 4, category: 'drink', desc: 'Macht munter.', use: { energy: 35, thirst: 6 } },
  beans: { id: 'beans', name: 'Dosenbohnen', icon: '', weight: 0.4, value: 7, maxStack: 6, category: 'food', desc: 'Sättigend und haltbar.', use: { hunger: 30 } },
  bread: { id: 'bread', name: 'Brot', icon: '', weight: 0.3, value: 5, maxStack: 4, category: 'food', desc: 'Ein Laib Brot.', use: { hunger: 20 } },
  apple: { id: 'apple', name: 'Apfel', icon: '', weight: 0.2, value: 3, maxStack: 8, category: 'food', desc: 'Frisch und saftig.', use: { hunger: 10, thirst: 8 } },
  bar: { id: 'bar', name: 'Energieriegel', icon: '', weight: 0.1, value: 4, maxStack: 10, category: 'food', desc: 'Schnelle Energie.', use: { hunger: 12, energy: 25 } },
  sandwich: { id: 'sandwich', name: 'Bohnen-Sandwich', icon: '', weight: 0.5, value: 14, maxStack: 4, category: 'food', desc: 'Sättigend: Brot mit Bohnen.', use: { hunger: 45 } },
  bandage: { id: 'bandage', name: 'Verband', icon: '', weight: 0.1, value: 10, maxStack: 10, category: 'medical', desc: 'Stoppt eine Blutung, solange er hält. Danach muss er gewechselt werden.', use: { treat: 'bandage' } },
  disinfectant: { id: 'disinfectant', name: 'Desinfektionsmittel', icon: '', weight: 0.3, value: 12, maxStack: 4, category: 'medical', desc: 'Gegen Keime in offenen Wunden. Brennt.', use: { treat: 'disinfect' } },
  suture: { id: 'suture', name: 'Nähset', icon: '', weight: 0.1, value: 16, maxStack: 4, category: 'medical', desc: 'Nadel und Faden, um Schnitte und tiefe Wunden zu schließen.', use: { treat: 'stitch' } },
  splint: { id: 'splint', name: 'Schiene', icon: '', weight: 0.6, value: 10, maxStack: 3, category: 'medical', desc: 'Stabilisiert einen gebrochenen Knochen.', use: { treat: 'splint' } },
  cloth: { id: 'cloth', name: 'Stoff', icon: '', weight: 0.2, value: 3, maxStack: 10, category: 'material', desc: 'Zum Basteln.' },
  schoolbag: { id: 'schoolbag', name: 'Schulrucksack', icon: '', weight: 0.8, value: 18, maxStack: 1, category: 'gear', desc: 'Kleiner Rucksack: 50 kg im Hauptfach; der Inhalt wiegt 25 % weniger.', equip: { slot: 'back', capacity: 50, side: 2, reduce: 0.25 } },
  hikingpack: { id: 'hikingpack', name: 'Wanderrucksack', icon: '', weight: 1.6, value: 45, maxStack: 1, category: 'gear', desc: 'Großer Trekkingrucksack: 50 kg im Hauptfach, das Gepäck wiegt 50 % weniger und belastet dich kaum.', equip: { slot: 'back', capacity: 50, side: 4, reduce: 0.5 } },
  jacket: { id: 'jacket', name: 'Winterjacke', icon: '', weight: 1.2, value: 30, maxStack: 1, category: 'gear', desc: 'Gefütterte Jacke. Schützt stark vor Kälte und Regen.', equip: { slot: 'body', warmth: 0.35, windproof: 0.6, rainproof: 0.55, defense: 55 } },
  hoodie: { id: 'hoodie', name: 'Kapuzenpulli', icon: '', weight: 0.6, value: 12, maxStack: 1, category: 'gear', desc: 'Hält etwas warm.', equip: { slot: 'body', warmth: 0.18, windproof: 0.15, rainproof: 0.1, defense: 25 } },
  dress: { id: 'dress', name: 'Sommerkleid', icon: '', weight: 0.4, value: 12, maxStack: 1, category: 'gear', desc: 'Leichtes Kleid, das beim Gehen weht. Wärmt kaum.', equip: { slot: 'body', warmth: 0.08, windproof: 0.05, rainproof: 0.05, defense: 10 } },
  beanie: { id: 'beanie', name: 'Wollmütze', icon: '', weight: 0.15, value: 8, maxStack: 1, category: 'gear', desc: 'Über den Kopf geht viel Wärme verloren.', equip: { slot: 'head', warmth: 0.1, windproof: 0.2, rainproof: 0.15, defense: 20 } },
  jeans: { id: 'jeans', name: 'Jeans', icon: '', weight: 0.6, value: 14, maxStack: 1, category: 'gear', desc: 'Robuste Hose. Ein bisschen Schutz vor Kälte.', equip: { slot: 'legs', warmth: 0.08, windproof: 0.25, rainproof: 0.2, defense: 35 } },
  boots: { id: 'boots', name: 'Wanderstiefel', icon: '', weight: 1.1, value: 26, maxStack: 1, category: 'gear', desc: 'Feste Stiefel mit gutem Profil.', equip: { slot: 'feet', warmth: 0.07, windproof: 0.3, rainproof: 0.6, defense: 30 } },
  sweater: { id: 'sweater', name: 'Strickpullover', icon: '', weight: 0.7, value: 16, maxStack: 1, category: 'gear', desc: 'Dicker Pullover mit langen Ärmeln. Wärmt gut.', equip: { slot: 'body', warmth: 0.22, windproof: 0.2, rainproof: 0.1, defense: 30 } },
  plaid_jacket: { id: 'plaid_jacket', name: 'Karojacke', icon: '', weight: 1.0, value: 24, maxStack: 1, category: 'gear', desc: 'Dickes Karohemd als Jacke mit Knöpfen. Hält Wind und etwas Regen ab.', equip: { slot: 'body', warmth: 0.26, windproof: 0.35, rainproof: 0.2, defense: 40 } },
  leather_jacket: { id: 'leather_jacket', name: 'Lederjacke', icon: '', weight: 1.4, value: 40, maxStack: 1, category: 'gear', desc: 'Dickes Leder. Hält Wind ab und schützt vor Bissen.', equip: { slot: 'body', warmth: 0.28, windproof: 0.7, rainproof: 0.4, defense: 70 } },
  denim_jacket: { id: 'denim_jacket', name: 'Jeansjacke', icon: '', weight: 0.9, value: 22, maxStack: 1, category: 'gear', desc: 'Robuster Jeansstoff, gut für milde Tage.', equip: { slot: 'body', warmth: 0.2, windproof: 0.4, rainproof: 0.15, defense: 45 } },
  raincoat: { id: 'raincoat', name: 'Regenjacke', icon: '', weight: 0.6, value: 20, maxStack: 1, category: 'gear', desc: 'Gelbe Regenjacke. Hält Nässe fern, wärmt aber kaum.', equip: { slot: 'body', warmth: 0.12, windproof: 0.6, rainproof: 0.95, defense: 15 } },
  work_vest: { id: 'work_vest', name: 'Warnweste', icon: '', weight: 0.3, value: 10, maxStack: 1, category: 'gear', desc: 'Orange Weste mit Reflexstreifen. Leicht, aber auffällig.', equip: { slot: 'body', warmth: 0.05, windproof: 0.1, rainproof: 0.1, defense: 20 } },
  shirt_tie: { id: 'shirt_tie', name: 'Hemd mit Krawatte', icon: '', weight: 0.3, value: 10, maxStack: 1, category: 'gear', desc: 'Weißes Hemd mit Krawatte. Wärmt kaum, sieht aber ordentlich aus.', equip: { slot: 'body', warmth: 0.06, windproof: 0.02, rainproof: 0.02, defense: 8 } },
  tac_vest: { id: 'tac_vest', name: 'Einsatzweste', icon: '', weight: 2.4, value: 60, maxStack: 1, category: 'gear', desc: 'Weste mit Gurtzeug, Gürtel und Taschen. Schützt gut vor Bissen und Kratzern.', equip: { slot: 'body', warmth: 0.14, windproof: 0.3, rainproof: 0.25, defense: 75 } },
  cargo_pants: { id: 'cargo_pants', name: 'Einsatzhose', icon: '', weight: 0.9, value: 34, maxStack: 1, category: 'gear', desc: 'Feste Hose mit Knieschonern.', equip: { slot: 'legs', warmth: 0.1, windproof: 0.35, rainproof: 0.3, defense: 55 } },
  tac_boots: { id: 'tac_boots', name: 'Einsatzstiefel', icon: '', weight: 1.4, value: 40, maxStack: 1, category: 'gear', desc: 'Hohe, robuste Stiefel mit Profilsohle.', equip: { slot: 'feet', warmth: 0.08, windproof: 0.35, rainproof: 0.7, defense: 50 } },
  cap: { id: 'cap', name: 'Basecap', icon: '', weight: 0.15, value: 8, maxStack: 1, category: 'gear', desc: 'Kappe mit Schirm. Hält Regen aus den Augen.', equip: { slot: 'head', warmth: 0.04, windproof: 0.08, rainproof: 0.2, defense: 10 } },
  bat: { id: 'bat', name: 'Baseballschläger', icon: '', weight: 1.1, value: 22, maxStack: 1, category: 'gear', desc: 'Solide Holzwaffe. Zwei bis drei Treffer fällen einen Zombie.', equip: { slot: 'hand' } },
  pipe: { id: 'pipe', name: 'Eisenrohr', icon: '', weight: 1.6, value: 14, maxStack: 1, category: 'gear', desc: 'Schwer, laut und zuverlässig.', equip: { slot: 'hand' } },
  knife: { id: 'knife', name: 'Küchenmesser', icon: '', weight: 0.3, value: 10, maxStack: 1, category: 'gear', desc: 'Leise und schnell, aber kurz.', equip: { slot: 'hand' } },
  axe: { id: 'axe', name: 'Axt', icon: '', weight: 2, value: 38, maxStack: 1, category: 'gear', desc: 'Langsam, aber verheerend – trifft auch zwei Gegner.', equip: { slot: 'hand' } },
  machete: { id: 'machete', name: 'Machete', icon: '', weight: 0.9, value: 30, maxStack: 1, category: 'gear', desc: 'Lange, scharfe Klinge. Schnell und tödlich auf kurze Distanz.', equip: { slot: 'hand' } },
  crowbar: { id: 'crowbar', name: 'Brecheisen', icon: '', weight: 1.8, value: 24, maxStack: 1, category: 'gear', desc: 'Schwer und hart. Bricht Schädel und Türen.', equip: { slot: 'hand' } },
  flashlight: { id: 'flashlight', name: 'Taschenlampe', icon: '', weight: 0.4, value: 20, maxStack: 1, category: 'gear', desc: 'Leuchtet nachts den Weg vor dir aus.', equip: { slot: 'hand', light: true } },
  corn: { id: 'corn', name: 'Maiskolben', icon: '', weight: 0.25, value: 4, maxStack: 8, category: 'food', desc: 'Frischer Mais vom Feld. Sättigt und löscht etwas Durst.', use: { hunger: 14, thirst: 3 } },
  battery: { id: 'battery', name: 'Autobatterie', icon: '', weight: 5, value: 30, maxStack: 1, category: 'material', desc: 'Geladene Fahrzeugbatterie. Schwer, aber nötig zum Anlassen.' },
  flatbattery: { id: 'flatbattery', name: 'Leere Batterie', icon: '', weight: 5, value: 4, maxStack: 1, category: 'material', desc: 'Fast leer. Lädt sich im Auto bei laufendem Motor langsam wieder auf.' },
  gascan: { id: 'gascan', name: 'Benzinkanister', icon: '', weight: 6.5, value: 22, maxStack: 1, category: 'misc', desc: 'Zehn Liter Benzin. Entzündlich.' },
  emptycan: { id: 'emptycan', name: 'Leerer Kanister', icon: '', weight: 0.8, value: 3, maxStack: 2, category: 'misc', desc: 'Fasst zehn Liter, wenn man Benzin findet.' },
  enginepart: { id: 'enginepart', name: 'Motorteile', icon: '', weight: 3, value: 24, maxStack: 3, category: 'material', desc: 'Ersatzteile, mit denen sich ein Motor reparieren lässt.' },
  toolbox: { id: 'toolbox', name: 'Werkzeugkasten', icon: '', weight: 3, value: 28, maxStack: 1, category: 'misc', desc: 'Schraubenschlüssel und Zangen. Nötig für Arbeiten am Auto.' },
  hammer: { id: 'hammer', name: 'Hammer', icon: '', weight: 0.9, value: 14, maxStack: 1, category: 'gear', desc: 'Zum Bauen, Barrikadieren und Zerlegen von Möbeln. Spart Bauzeit.', equip: { slot: 'hand' } },
  sledgehammer: { id: 'sledgehammer', name: 'Vorschlaghammer', icon: '', weight: 5.5, value: 40, maxStack: 1, category: 'gear', desc: 'Schwer und laut. Reißt Wände, Türen und Möbel nieder.', equip: { slot: 'hand' } },
  nails: { id: 'nails', name: 'Nägel', icon: '', weight: 0.05, value: 1, maxStack: 40, category: 'material', desc: 'Zum Bauen und Barrikadieren.' },
  scrap: { id: 'scrap', name: 'Metallschrott', icon: '', weight: 0.4, value: 2, maxStack: 12, category: 'material', desc: 'Verbogenes Metall. Daraus werden Nägel, Werkzeug und Dietriche.' },
  lockpick: { id: 'lockpick', name: 'Dietrich', icon: '', weight: 0.05, value: 12, maxStack: 5, category: 'misc', desc: 'Knackt einfache Schlösser. Bricht manchmal ab.' },
  wood: { id: 'wood', name: 'Holzbrett', icon: '', weight: 1.5, value: 6, maxStack: 5, category: 'material', desc: 'Zum Bauen.' },
};

/** Bauteile: werden hergestellt, mit einer Zahltaste auf die Schnellleiste gelegt und mit Rechtsklick gesetzt */
const PIECE_ITEMS: [string, string, number, string][] = [
  ['wall', 'Holzwand', 3, 'Eine Wand aus Brettern. Mit Rechtsklick setzen, R dreht, Rastet an Wänden ein.'],
  ['door', 'Holztür', 4, 'Eine Tür zum Einbauen in Wandlücken.'],
  ['windowwall', 'Fensterwand', 3.5, 'Wand mit Fensteröffnung.'],
  ['barricade', 'Barrikade', 4, 'Hält Zombies auf. Kann überklettert werden.'],
  ['table', 'Tisch', 5, 'Ein stabiler Holztisch.'],
  ['chair', 'Stuhl', 1.5, 'Ein einfacher Stuhl.'],
  ['shelf', 'Regal', 5, 'Ein Regal mit Brettern.'],
  ['crate', 'Kiste', 4, 'Lagerkiste: Mit E öffnen und Dinge hineinlegen.'],
  ['cabinet', 'Schrank', 8, 'Schrank mit Fächern: Mit E öffnen und Dinge hineinlegen.'],
  ['windowbar', 'Fensterbarrikade', 3, 'Bretter für ein Fenster: im Inventar Rechtsklick auf „Bauen“ und vor ein Fenster setzen. Sie kommen immer außen an die Scheibe.'],
  ['fence', 'Zaun', 2.5, 'Ein niedriger Holzzaun. Man kann darüberklettern.'],
  ['workbench', 'Werkbank', 9, 'Hier stellst du Rezepte ab Stufe 2 her. Stehst du in der Nähe, werden sie frei, sobald du die nötige Charakterstufe hast.'],
  ['bed', 'Bett', 6, 'Zum Schlafen. Mit E benutzen.'],
  ['fire', 'Lagerfeuer', 2, 'Wärmt und kocht. Mit E Holz nachlegen.'],
];
for (const [kind, name, weight, desc] of PIECE_ITEMS) {
  ITEMS[`piece_${kind}`] = { id: `piece_${kind}`, name, icon: '', weight, value: Math.round(weight * 6), maxStack: 4, category: 'build', desc, piece: kind, tags: ['placeable'] };
}

export const CATEGORY_ORDER: Category[] = ['gear', 'drink', 'food', 'medical', 'material', 'build', 'misc'];

/**
 * Tags: jedes Item trägt seine Kategorie als Tag, dazu Eigenschaften, nach denen Rezepte und Systeme fragen
 * (Werkzeug, Brennstoff, Behälter …). So verlangen Rezepte eine Fähigkeit statt eines bestimmten Items.
 */
const EXTRA_TAGS: Record<string, string[]> = {
  wood: ['fuel'],
  cloth: ['fabric', 'fuel'],
  bottle: ['container'],
  flashlight: ['light', 'tool'],
  bandage: ['fabric', 'bandage'],
  disinfectant: ['disinfectant'],
  suture: ['needle'],
  battery: ['battery'],
  gascan: ['fuelcan'],
  enginepart: ['enginepart'],
  toolbox: ['tool', 'mechanic'],
  hammer: ['tool', 'hammer'],
  sledgehammer: ['tool', 'sledge', 'breaker'],
  axe: ['tool', 'breaker', 'chopper'],
  crowbar: ['tool', 'breaker', 'prybar'],
  lockpick: ['lockpick'],
};
for (const d of Object.values(ITEMS)) d.tags = [...new Set([d.category, ...(EXTRA_TAGS[d.id] ?? []), ...(d.tags ?? [])])];

export function item(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`Unbekanntes Item: ${id}`);
  return d;
}

export function hasTag(id: string, tag: string): boolean {
  return item(id).tags?.includes(tag) ?? false;
}

export const CATEGORY_NAME: Record<Category, string> = {
  gear: 'Ausrüstung', drink: 'Getränk', food: 'Nahrung', medical: 'Medizin', material: 'Material', build: 'Bauteil', misc: 'Sonstiges',
};
