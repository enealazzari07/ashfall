/**
 * PZ-Itemliste (Vorbild: https://pzwiki.net/wiki/PZwiki:Item_list) – ohne Kleidung und Rucksäcke.
 * Alle Ids tragen das Präfix `pz_`, damit nichts mit bestehenden Items kollidiert.
 * Waffen stehen in pzWeapons.ts, hier sind Munition, Essen, Medizin, Werkzeug, Material usw.
 */
import type { ItemDef, ItemUse, Category } from '../data/items';
import type { IconKind } from './pzIcons';
import { PZ_WEAPON_ITEMS, PZ_WEAPON_ICONS } from './pzWeapons';

export const PZ_ITEMS: Record<string, ItemDef> = {};
export const PZ_ICONS: Record<string, [IconKind, string]> = { ...PZ_WEAPON_ICONS };
for (const d of PZ_WEAPON_ITEMS) PZ_ITEMS[d.id] = d;

interface Opt {
  stack?: number;
  use?: ItemUse;
  tags?: string[];
  becomes?: string;
  light?: boolean;
}

function add(key: string, name: string, kind: IconKind, color: string, weight: number, value: number, category: Category, desc: string, o: Opt = {}): string {
  const id = `pz_${key}`;
  PZ_ITEMS[id] = {
    id, name, icon: '', weight, value, category, desc,
    maxStack: o.stack ?? (weight <= 0.1 ? 20 : weight <= 0.5 ? 8 : weight <= 2 ? 4 : 1),
    use: o.use, becomes: o.becomes, tags: o.tags,
    equip: o.light ? { slot: 'hand', light: true } : undefined,
  };
  PZ_ICONS[id] = [kind, color];
  return id;
}

/* ----------------------------------------------------------------- Munition */

const CAL: [key: string, label: string, color: string][] = [
  ['44', '.44 Magnum', '#c8963e'], ['9mm', '9x19mm', '#c8963e'], ['45', '.45 ACP', '#c8963e'], ['38', '.38 Special', '#c8963e'],
  ['357', '.357 Magnum', '#c8963e'], ['3030', '.30-30', '#b8863a'], ['556', '5.56x45mm', '#b0b4ba'], ['308', '7.62x51mm', '#b0b4ba'],
];
/** Schachtelinhalt: Box → Einzelpatrone, Anzahl. Karton = 5 Boxen. */
export const PZ_BOX_CONTENT: Record<string, [bullet: string, qty: number]> = {};
for (const [k, label, col] of CAL) {
  const b = add(`bullets_${k}`, `${label} Patrone`, 'bullet', col, 0.02, 1, 'misc', `Munition, Kaliber ${label}.`, { stack: 60, tags: ['ammo'] });
  const box = add(`box_${k}`, `Schachtel ${label}`, 'ammobox', col, 0.5, 20, 'misc', `20 Patronen ${label}. Zum Auspacken benutzen.`, { stack: 6, tags: ['ammo_box'] });
  const carton = add(`carton_${k}`, `Karton ${label}`, 'ammobox', col, 2.5, 100, 'misc', `5 Schachteln ${label}.`, { stack: 2, tags: ['ammo_carton'] });
  PZ_BOX_CONTENT[box] = [b, 20];
  PZ_BOX_CONTENT[carton] = [box, 5];
}
{
  const b = add('shells_12g', '12g Schrotpatrone', 'bullet', '#c0392b', 0.04, 2, 'misc', 'Schrotmunition, 12 Gauge.', { stack: 40, tags: ['ammo'] });
  const box = add('shells_12g_box', 'Schachtel 12g Schrot', 'ammobox', '#c0392b', 0.8, 25, 'misc', '10 Schrotpatronen. Zum Auspacken benutzen.', { stack: 6, tags: ['ammo_box'] });
  const carton = add('shells_12g_carton', 'Karton 12g Schrot', 'ammobox', '#c0392b', 4, 120, 'misc', '5 Schachteln 12g.', { stack: 2, tags: ['ammo_carton'] });
  PZ_BOX_CONTENT[box] = [b, 10];
  PZ_BOX_CONTENT[carton] = [box, 5];
}
/** Wechselmagazine: Id → (Kapazität, Kaliber-Patrone) */
export const PZ_MAGAZINES: Record<string, [cap: number, bullet: string]> = {};
for (const [key, name, cap, bullet] of [
  ['44', 'B-F Magazin', 12, 'pz_bullets_44'], ['9mm', 'M9 Magazin', 15, 'pz_bullets_9mm'], ['45', 'M1911 Magazin', 7, 'pz_bullets_45'],
  ['556', 'M16 Magazin', 30, 'pz_bullets_556'], ['m14', 'M1A Magazin', 20, 'pz_bullets_308'], ['js14', 'JS-14 Magazin', 20, 'pz_bullets_308'],
] as [string, string, number, string][]) {
  PZ_MAGAZINES[add(`mag_${key}`, name, 'magazine', '#3a3d44', 0.25, 12, 'misc', `Wechselmagazin für ${cap} Schuss.`, { stack: 4, tags: ['magazine'] })] = [cap, bullet];
}

/* Waffenteile */
for (const [k, n, kind, col, w, v, d] of [
  ['ammo_straps', 'Munitionsgurt', 'rope', '#4a4a3a', 0.2, 14, 'Gurt für Schrotpatronen an der Waffe.'],
  ['choke_full', 'Würgebohrung Voll', 'scope', '#5a5e66', 0.1, 24, 'Engere Streuung bei Schrotflinten.'],
  ['choke_improved', 'Würgebohrung Verbessert', 'scope', '#6a6e76', 0.1, 18, 'Leicht engere Streuung.'],
  ['gun_light', 'Waffenlicht', 'flashlight', '#2f3238', 0.2, 30, 'Lampe zum Aufstecken.'],
  ['laser', 'Lasermarkierer', 'scope', '#c0392b', 0.15, 36, 'Roter Punkt für präziseres Zielen.'],
  ['recoil_pad', 'Schulterpolster', 'sack', '#2a2a2e', 0.2, 16, 'Verringert den Rückstoß.'],
  ['red_dot', 'Rotpunktvisier', 'scope', '#c0392b', 0.3, 48, 'Schnelles Zielen ohne Vergrößerung.'],
  ['tritium_sights', 'Tritium-Kimme und Korn', 'scope', '#6fe0a0', 0.05, 40, 'Leuchtet im Dunkeln.'],
  ['scope_x2', 'Zielfernrohr 2x', 'scope', '#2f3238', 0.4, 60, 'Doppelte Vergrößerung.'],
  ['scope_x4', 'Zielfernrohr 4x', 'scope', '#2f3238', 0.5, 90, 'Vierfache Vergrößerung.'],
  ['scope_x8', 'Zielfernrohr 8x', 'scope', '#2f3238', 0.7, 140, 'Achtfache Vergrößerung für Scharfschützen.'],
] as [string, string, IconKind, string, number, number, string][]) add(k, n, kind, col, w, v, 'misc', d, { stack: 1, tags: ['weapon_part'] });

/* Sprengstoffe */
for (const [k, n, kind, col, w, v, d] of [
  ['molotov', 'Molotowcocktail', 'bottle', '#d9a441', 0.6, 20, 'Brandflasche. Anzünden und werfen.'],
  ['pipe_bomb', 'Rohrbombe', 'bomb', '#6a6e76', 1.2, 60, 'Laut und zerstörerisch.'],
  ['smoke_bomb', 'Rauchbombe', 'bomb', '#b8bcc4', 0.5, 30, 'Erzeugt eine dichte Rauchwolke.'],
  ['noise_trap', 'Lärmgenerator', 'bomb', '#d9a441', 0.6, 25, 'Lockt Zombies mit Krach an.'],
  ['aerosol_bomb', 'Spraydosenbombe', 'bomb', '#c0392b', 0.6, 30, 'Explodiert in einer Stichflamme.'],
  ['flame_trap', 'Brandbombe', 'bomb', '#e0702a', 0.9, 40, 'Setzt die Umgebung in Brand.'],
  ['firecrackers', 'Knallerbsen', 'bomb', '#d83a30', 0.1, 5, 'Kleine Knaller als Ablenkung.'],
  ['remote_controller', 'Fernzünder', 'radio', '#2f3238', 0.3, 35, 'Zündet Sprengfallen aus der Ferne.'],
] as [string, string, IconKind, string, number, number, string][]) add(k, n, kind, col, w, v, 'misc', d, { stack: 4, tags: ['explosive'] });

/* ------------------------------------------------------------------- Essen */

type Food = [key: string, name: string, kind: IconKind, color: string, hunger: number, thirst: number, weight: number, value: number, becomes?: string];

const FOODS: Food[] = [
  // Konserven
  ['canned_beans', 'Dosenbohnen (Weiß)', 'can', '#c08a4a', 30, 0, 0.4, 7], ['canned_carrots', 'Dosenkarotten', 'can', '#e0802a', 22, 2, 0.4, 6],
  ['canned_chili', 'Dosen-Chili', 'can', '#a8321e', 38, 0, 0.45, 9], ['canned_corn', 'Dosenmais', 'can', '#e8c840', 24, 2, 0.4, 6],
  ['canned_corned_beef', 'Corned Beef', 'can', '#b8584a', 36, 0, 0.4, 10], ['canned_dog_food', 'Hundefutter (Dose)', 'can', '#8a6a3a', 14, 0, 0.4, 3],
  ['canned_milk', 'Kondensmilch', 'can', '#e8e4d4', 18, 12, 0.4, 6], ['canned_fruit_drink', 'Fruchtsaft (Dose)', 'can', '#e0602a', 8, 26, 0.35, 5],
  ['canned_fruit_cocktail', 'Obstcocktail (Dose)', 'can', '#e8a040', 24, 8, 0.4, 7], ['canned_mushroom_soup', 'Pilzsuppe (Dose)', 'can', '#a8946a', 26, 10, 0.45, 7],
  ['canned_peaches', 'Pfirsiche (Dose)', 'can', '#f0a860', 24, 6, 0.4, 7], ['canned_peas', 'Erbsen (Dose)', 'can', '#6aa83a', 22, 2, 0.4, 5],
  ['canned_pineapple', 'Ananas (Dose)', 'can', '#e8c030', 22, 8, 0.4, 7], ['canned_potato', 'Kartoffeln (Dose)', 'can', '#c8a060', 28, 0, 0.45, 5],
  ['canned_sardines', 'Sardinen (Dose)', 'can', '#6a8aa8', 24, 0, 0.2, 6], ['canned_bolognese', 'Spaghetti Bolognese (Dose)', 'can', '#c0452e', 40, 0, 0.45, 9],
  ['canned_tomato', 'Tomaten (Dose)', 'can', '#c8281e', 20, 8, 0.4, 5], ['canned_tuna', 'Thunfisch (Dose)', 'can', '#4a7ab0', 28, 0, 0.25, 8],
  ['canned_veg_soup', 'Gemüsesuppe (Dose)', 'can', '#6aa84a', 28, 12, 0.45, 7], ['water_ration', 'Wasserration (Dose)', 'can', '#4a82c8', 0, 40, 0.4, 8],
  ['tin_can_oats', 'Haferflocken (Dose)', 'can', '#d8c08a', 30, 0, 0.5, 6],
  // Süßes & Snacks
  ['chocolate_bar', 'Schokoriegel', 'candy', '#6a3a1e', 14, 0, 0.1, 4], ['chocolate_candy', 'Schokobonbon', 'candy', '#6a3a1e', 4, 0, 0.03, 1],
  ['granola_bar', 'Müsliriegel', 'candy', '#c89a4a', 14, 0, 0.1, 4], ['crackers', 'Cracker', 'bread', '#d8b46a', 12, 0, 0.15, 3],
  ['chips_plain', 'Chips (Natur)', 'sack', '#e8c84a', 14, -4, 0.15, 4], ['chips_bbq', 'Chips (Barbecue)', 'sack', '#a8321e', 14, -4, 0.15, 4],
  ['chips_sour_cream', 'Chips (Sauerrahm)', 'sack', '#4a9a5a', 14, -4, 0.15, 4], ['popcorn', 'Mikrowellen-Popcorn', 'sack', '#e8d070', 12, -2, 0.15, 3],
  ['pretzels', 'Brezeln', 'bread', '#a8683a', 14, -2, 0.15, 3], ['peanuts', 'Erdnüsse', 'sack', '#c8a060', 16, -2, 0.15, 4],
  ['jerky', 'Trockenfleisch', 'meat', '#6a3a22', 22, -2, 0.1, 8], ['pork_rinds', 'Schweineschwarte', 'sack', '#d8a060', 14, -4, 0.15, 4],
  ['candy_cane', 'Zuckerstange', 'candy', '#d83a30', 4, 0, 0.03, 1], ['gummy_bears', 'Gummibärchen', 'candy', '#e8602a', 8, 0, 0.1, 2],
  ['lollipop', 'Lutscher', 'candy', '#d86aa8', 3, 0, 0.03, 1], ['jellybeans', 'Geleebohnen', 'candy', '#a84ad8', 6, 0, 0.08, 2],
  ['licorice', 'Lakritz', 'candy', '#22222a', 6, 0, 0.08, 2], ['marshmallows', 'Marshmallows', 'candy', '#f2e8f0', 8, 0, 0.12, 2],
  ['ice_cream', 'Eiscreme', 'candy', '#f0d0e0', 16, 4, 0.3, 5], ['popsicle', 'Eis am Stiel', 'candy', '#e85a6a', 6, 8, 0.1, 2],
  ['honey', 'Honig', 'jar', '#e0a020', 20, 0, 0.4, 12], ['maple_syrup', 'Ahornsirup', 'bottle', '#a85a1e', 14, 0, 0.4, 10],
  ['peanut_butter', 'Erdnussbutter', 'jar', '#c08a3a', 24, -2, 0.4, 8], ['fruit_jam', 'Marmelade', 'jar', '#a8322e', 16, 0, 0.35, 6],
  // Backwaren
  ['baguette', 'Baguette', 'bread', '#d8a050', 24, 0, 0.35, 5], ['bagel', 'Bagel', 'bread', '#d8a860', 16, 0, 0.2, 4],
  ['croissant', 'Croissant', 'bread', '#e0a848', 14, 0, 0.12, 4], ['donut', 'Donut', 'candy', '#e0a8c0', 12, 0, 0.1, 3],
  ['cupcake', 'Cupcake', 'cake', '#d86a9a', 12, 0, 0.12, 3], ['muffin', 'Muffin', 'cake', '#c8905a', 14, 0, 0.15, 3],
  ['cake_slice', 'Kuchenstück', 'cake', '#e8c890', 18, 0, 0.2, 5], ['pie_slice', 'Tortenstück', 'cake', '#c8905a', 20, 0, 0.2, 5],
  ['cookie', 'Keks', 'cake', '#b8803a', 6, 0, 0.05, 1], ['cinnamon_roll', 'Zimtschnecke', 'bread', '#c8803a', 18, 0, 0.15, 4],
  ['pancakes', 'Pfannkuchen', 'cake', '#e0b060', 22, 0, 0.3, 4], ['cornbread', 'Maisbrot', 'bread', '#e0c050', 22, 0, 0.3, 4],
  ['toast_slice', 'Brotscheibe', 'bread', '#d8b070', 6, 0, 0.05, 1], ['pizza_slice', 'Pizzastück', 'cake', '#e0a040', 24, 0, 0.25, 5],
  // Zubereitetes
  ['burger', 'Hamburger', 'bread', '#a8683a', 40, 0, 0.35, 9], ['hot_dog', 'Hot Dog', 'bread', '#c0602e', 30, 0, 0.25, 6],
  ['burrito', 'Burrito', 'bread', '#d8b070', 34, 0, 0.35, 7], ['fries', 'Pommes', 'sack', '#e8c040', 22, -2, 0.25, 4],
  ['fried_chicken', 'Brathähnchen', 'meat', '#b8702e', 36, 0, 0.4, 9], ['chicken_nuggets', 'Chicken Nuggets', 'meat', '#c8903a', 24, 0, 0.3, 6],
  ['omelette', 'Omelett', 'egg', '#f0d070', 26, 0, 0.3, 5], ['sushi', 'Sushi', 'fish', '#e8a08a', 22, 0, 0.2, 8],
  ['onigiri', 'Onigiri', 'bread', '#f0f0e8', 20, 0, 0.2, 5], ['mac_cheese', 'Makkaroni mit Käse', 'pot', '#f0b830', 34, 0, 0.4, 6],
  ['pasta_cooked', 'Nudeln (gekocht)', 'pot', '#e8c070', 30, 0, 0.4, 4], ['rice_cooked', 'Reis (gekocht)', 'pot', '#f4f0e0', 28, 0, 0.4, 3],
  ['soup_bowl', 'Suppe', 'pot', '#c8782e', 26, 14, 0.5, 6], ['stew_bowl', 'Eintopf', 'pot', '#8a5a2e', 40, 10, 0.5, 8],
  ['ramen', 'Ramen', 'pot', '#d8a850', 32, 8, 0.4, 6], ['oatmeal_bowl', 'Haferbrei', 'pot', '#d8c8a0', 26, 4, 0.4, 3],
  ['cereal_bowl', 'Müsli mit Milch', 'pot', '#e0c070', 22, 6, 0.4, 3], ['salad', 'Salat', 'fruitveg', '#6aa84a', 14, 8, 0.3, 4],
  // Fleisch & Fisch & Ei
  ['egg', 'Ei', 'egg', '#f0e4c8', 8, 0, 0.06, 2], ['bacon', 'Speck', 'meat', '#c0504a', 14, 0, 0.1, 4],
  ['ham', 'Schinken', 'meat', '#d8707a', 22, 0, 0.3, 6], ['sausage', 'Wurst', 'meat', '#b8503a', 18, 0, 0.15, 4],
  ['chicken', 'Hähnchen (roh)', 'meat', '#e8c0a0', 28, 0, 1.0, 7], ['pork_chop', 'Schweinekotelett', 'meat', '#d8807a', 26, 0, 0.4, 6],
  ['beef', 'Rindfleisch (roh)', 'meat', '#b8403a', 30, 0, 0.6, 8], ['ground_beef', 'Hackfleisch', 'meat', '#b8403a', 24, 0, 0.4, 6],
  ['fish_fillet', 'Fischfilet', 'fish', '#f0b0a0', 16, 0, 0.3, 6], ['fish', 'Fisch', 'fish', '#6a8aa8', 20, 0, 0.6, 5],
  ['frog_meat', 'Froschschenkel', 'meat', '#c8c070', 8, 0, 0.1, 3], ['crayfish', 'Flusskrebs', 'fish', '#c0452e', 10, 0, 0.15, 5],
  ['lobster', 'Hummer', 'fish', '#c8281e', 30, 0, 0.8, 18],
  // Obst, Gemüse, Pflanzen
  ['apple_red', 'Roter Apfel', 'fruitveg', '#c8281e', 10, 8, 0.2, 3], ['banana', 'Banane', 'fruitveg', '#f0d040', 12, 2, 0.2, 3],
  ['orange', 'Orange', 'fruitveg', '#f09020', 10, 10, 0.25, 3], ['lemon', 'Zitrone', 'fruitveg', '#f0e040', 4, 6, 0.15, 2],
  ['pear', 'Birne', 'fruitveg', '#a8c850', 10, 8, 0.2, 3], ['peach', 'Pfirsich', 'fruitveg', '#f0a870', 10, 8, 0.2, 3],
  ['grapes', 'Weintrauben', 'fruitveg', '#7a4a9a', 8, 8, 0.25, 4], ['cherry', 'Kirschen', 'fruitveg', '#a8142e', 6, 6, 0.1, 3],
  ['berries', 'Beeren', 'fruitveg', '#6a2a8a', 6, 6, 0.1, 3], ['pineapple', 'Ananas', 'fruitveg', '#e8c030', 20, 14, 1.0, 7],
  ['avocado', 'Avocado', 'fruitveg', '#5a8a3a', 14, 2, 0.25, 4], ['mango', 'Mango', 'fruitveg', '#f0a030', 14, 8, 0.3, 5],
  ['watermelon_slice', 'Wassermelonenstück', 'fruitveg', '#e84a5a', 10, 18, 0.4, 3], ['strawberry', 'Erdbeere', 'fruitveg', '#d82e3a', 4, 4, 0.05, 2],
  ['carrot', 'Karotte', 'fruitveg', '#e8802a', 10, 2, 0.15, 2], ['potato', 'Kartoffel', 'fruitveg', '#b89a60', 12, 0, 0.3, 2],
  ['tomato', 'Tomate', 'fruitveg', '#d8281e', 8, 6, 0.15, 2], ['cabbage', 'Kohl', 'fruitveg', '#8ac860', 12, 4, 0.8, 3],
  ['lettuce', 'Kopfsalat', 'fruitveg', '#7ac850', 6, 6, 0.3, 2], ['broccoli', 'Brokkoli', 'fruitveg', '#4a8a3a', 8, 4, 0.3, 3],
  ['cucumber', 'Gurke', 'fruitveg', '#4a9a4a', 6, 8, 0.3, 2], ['bell_pepper', 'Paprika', 'fruitveg', '#d8302e', 8, 4, 0.2, 3],
  ['onion', 'Zwiebel', 'fruitveg', '#d8a870', 6, 0, 0.15, 2], ['garlic', 'Knoblauch', 'fruitveg', '#f0ead8', 4, 0, 0.05, 2],
  ['pumpkin', 'Kürbis', 'fruitveg', '#e87820', 24, 6, 2.0, 5], ['mushrooms', 'Pilze', 'mushroom', '#c8b08a', 6, 2, 0.1, 3],
  ['edamame', 'Edamame', 'fruitveg', '#8ac860', 8, 2, 0.1, 3], ['olives', 'Oliven', 'jar', '#6a7a2a', 6, 0, 0.3, 4],
  ['pickle', 'Gewürzgurke', 'fruitveg', '#6a8a2a', 6, 2, 0.1, 2], ['acorn', 'Eichel', 'fruitveg', '#a8783a', 4, 0, 0.02, 0],
  ['dandelion', 'Löwenzahn', 'herb', '#e8d030', 4, 2, 0.02, 1], ['nettles', 'Brennnessel', 'herb', '#4a8a3a', 4, 2, 0.02, 1],
  // Zutaten
  ['flour', 'Mehl', 'sack', '#f4f0e8', 0, 0, 1.0, 4], ['sugar', 'Zucker', 'sack', '#f8f8f8', 0, 0, 1.0, 4], ['salt', 'Salz', 'jar', '#f0f0f0', 0, 0, 0.3, 3],
  ['butter', 'Butter', 'box', '#f0d860', 6, 0, 0.25, 4], ['cheese', 'Käse', 'cake', '#f0c030', 18, 0, 0.3, 6],
  ['milk_bottle', 'Milchflasche', 'bottle', '#f4f4f0', 10, 24, 1.0, 5, 'pz_glass_bottle'], ['olive_oil', 'Olivenöl', 'bottle', '#b8a82a', 0, 0, 0.8, 8],
  ['ketchup', 'Ketchup', 'bottle', '#c8281e', 3, 0, 0.5, 3], ['mustard', 'Senf', 'bottle', '#d8b020', 3, 0, 0.5, 3], ['mayonnaise', 'Mayonnaise', 'jar', '#f4ecc8', 5, 0, 0.5, 3],
  ['hot_sauce', 'Scharfe Soße', 'bottle', '#c8281e', 2, 0, 0.3, 4], ['cinnamon', 'Zimt', 'jar', '#a8581e', 0, 0, 0.1, 3], ['pepper', 'Pfeffer', 'jar', '#3a3a3a', 0, 0, 0.1, 3],
  ['cocoa', 'Kakaopulver', 'sack', '#5a3a22', 0, 0, 0.4, 4], ['rice_raw', 'Reis', 'sack', '#f4f0e0', 0, 0, 0.6, 3], ['pasta_raw', 'Nudeln', 'sack', '#e8c070', 0, 0, 0.5, 3],
  ['dough', 'Teig', 'bread', '#f0e0c0', 0, 0, 0.5, 2], ['tofu', 'Tofu', 'box', '#f0ecd8', 14, 0, 0.3, 4],
  ['cat_treats', 'Katzenleckerli', 'sack', '#c87a3a', 3, 0, 0.1, 2], ['dog_food_dry', 'Trockenhundefutter', 'sack', '#8a6a3a', 10, 0, 1.0, 3],
];
for (const [k, n, kind, col, hunger, thirst, w, v, becomes] of FOODS) {
  const use: ItemUse = {};
  if (hunger > 0) use.hunger = hunger;
  if (thirst > 0) use.thirst = thirst;
  add(k, n, kind, col, w, v, 'food', Object.keys(use).length ? 'Essbar.' : 'Zutat zum Kochen.', { use: Object.keys(use).length ? use : undefined, becomes, stack: 8, tags: ['food'] });
}

/* ---------------------------------------------------------------- Getränke */

type Drink = [key: string, name: string, kind: IconKind, color: string, thirst: number, energy: number, weight: number, value: number, becomes?: string];
for (const [k, n, kind, col, thirst, energy, w, v, becomes] of [
  ['soda_can', 'Limonade (Dose)', 'can', '#d83a30', 22, 4, 0.35, 4, 'pz_tin_can'], ['energy_drink', 'Energydrink', 'can', '#3ad0e0', 18, 40, 0.35, 6, 'pz_tin_can'],
  ['beer_can', 'Bier (Dose)', 'can', '#d8a830', 14, -6, 0.4, 4, 'pz_tin_can'], ['beer_bottle', 'Bier (Flasche)', 'bottle', '#8a5a1e', 14, -6, 0.5, 4, 'pz_glass_bottle'],
  ['red_wine', 'Rotwein', 'bottle', '#6a1428', 10, -10, 1.0, 14, 'pz_glass_bottle'], ['white_wine', 'Weißwein', 'bottle', '#d8d070', 10, -10, 1.0, 14, 'pz_glass_bottle'],
  ['plastic_water', 'Wasser (Plastikflasche)', 'bottle', '#7ab8e8', 40, 0, 0.5, 5, 'pz_plastic_bottle'], ['mug_coffee', 'Kaffeebecher', 'cup', '#5a3a22', 12, 30, 0.3, 6, 'pz_mug'],
  ['mug_tea', 'Teebecher', 'cup', '#a86a2a', 16, 8, 0.3, 4, 'pz_mug'], ['juice_bottle', 'Fruchtsaft', 'bottle', '#f09020', 28, 6, 0.6, 6, 'pz_plastic_bottle'],
  ['hot_drink', 'Heißgetränk', 'cup', '#7a4a2a', 18, 12, 0.3, 4, 'pz_mug'], ['tonic', 'Kräutertonikum', 'bottle', '#6a8a3a', 10, 22, 0.3, 12, 'pz_glass_bottle'],
] as Drink[]) add(k, n, kind, col, w, v, 'drink', 'Trinkbar.', { use: { thirst, energy: energy > 0 ? energy : undefined }, becomes, stack: 4, tags: ['drink'] });

/* Behälter */
for (const [k, n, kind, col, w, v, d] of [
  ['tin_can', 'Leere Konservendose', 'can', '#a8aeb6', 0.1, 1, 'Kann als Behälter oder Rohstoff dienen.'],
  ['glass_bottle', 'Leere Glasflasche', 'bottle', '#9ac8b0', 0.3, 2, 'Kann gefüllt werden.'],
  ['plastic_bottle', 'Leere Plastikflasche', 'bottle', '#bfe0f0', 0.05, 1, 'Leicht und leer.'],
  ['mug', 'Becher', 'cup', '#e8e4d8', 0.25, 2, 'Zum Trinken.'],
  ['jar_empty', 'Einmachglas', 'jar', '#cfe8e0', 0.3, 3, 'Fürs Einkochen und Lagern.'],
  ['canteen', 'Feldflasche', 'bottle', '#5a6a3a', 0.5, 14, 'Robuste Wasserflasche.'],
  ['bucket', 'Eimer', 'pot', '#7a8088', 0.8, 8, 'Zum Wasserholen.'],
  ['watering_can', 'Gießkanne', 'pot', '#3a7a4a', 1.0, 10, 'Zum Gießen von Pflanzen.'],
  ['hot_water_bottle', 'Wärmflasche', 'bottle', '#d86a8a', 0.4, 8, 'Wärmt in kalten Nächten.'],
  ['sports_bottle', 'Trinkflasche', 'bottle', '#3a7ad0', 0.15, 5, 'Sportflasche.'],
  ['leather_waterbag', 'Wasserschlauch aus Leder', 'sack', '#8a5a30', 0.3, 8, 'Einfacher Wasserbeutel.'],
] as [string, string, IconKind, string, number, number, string][]) add(k, n, kind, col, w, v, 'misc', d, { stack: 4, tags: ['container'] });

/* ----------------------------------------------------------------- Medizin */

for (const [k, n, kind, col, w, v, d, use] of [
  ['painkillers', 'Schmerztabletten', 'pills', '#e8e8e8', 0.05, 14, 'Lindern Schmerzen.', { heal: 4 }],
  ['antibiotics', 'Antibiotika', 'pills', '#e8c030', 0.05, 30, 'Gegen bakterielle Infektionen.', { heal: 6 }],
  ['antidepressants', 'Antidepressiva', 'pills', '#6ab8e8', 0.05, 16, 'Hellen die Stimmung auf.', undefined],
  ['beta_blockers', 'Betablocker', 'pills', '#d86aa8', 0.05, 16, 'Beruhigen den Puls.', undefined],
  ['sleeping_pills', 'Schlaftabletten', 'pills', '#8a6ad8', 0.05, 14, 'Helfen beim Einschlafen.', undefined],
  ['caffeine_pills', 'Koffeintabletten', 'pills', '#f0f0f0', 0.05, 12, 'Machen wach.', { energy: 30 }],
  ['alcohol_wipes', 'Alkoholtupfer', 'paper', '#f4f4f4', 0.02, 4, 'Zur Wunddesinfektion.', undefined],
  ['adhesive_bandage', 'Pflaster', 'paper', '#e8b890', 0.02, 3, 'Für kleine Kratzer.', undefined],
  ['cotton_balls', 'Wattebällchen', 'cloth', '#f8f8f8', 0.02, 2, 'Weich und saugfähig.', undefined],
  ['cold_pack', 'Kühlpack', 'box', '#6ab8e8', 0.3, 8, 'Kühlt Prellungen.', undefined],
  ['forceps', 'Pinzette (Chirurgisch)', 'pliers', '#b0b5bc', 0.05, 14, 'Zum Entfernen von Splittern und Kugeln.', undefined],
  ['tweezers', 'Pinzette', 'pliers', '#b0b5bc', 0.02, 5, 'Für feine Arbeiten.', undefined],
  ['medical_shears', 'Verbandsschere', 'pliers', '#b0b5bc', 0.1, 12, 'Schneidet Verbände und Kleidung.', undefined],
  ['stethoscope', 'Stethoskop', 'rope', '#3a3d44', 0.2, 24, 'Zum Abhören.', undefined],
  ['surgical_mask', 'OP-Maske', 'paper', '#9ad0e0', 0.02, 4, 'Schützt vor Spuren in der Luft.', undefined],
  ['surgical_gloves', 'OP-Handschuhe', 'cloth', '#e0e8f0', 0.02, 4, 'Sterile Handschuhe.', undefined],
  ['tongue_depressor', 'Zungenspatel', 'plank', '#e8c890', 0.01, 1, 'Aus Holz.', undefined],
  ['tissue', 'Taschentuch', 'paper', '#f8f8f8', 0.01, 1, 'Weiches Papier.', undefined],
  ['mortar_pestle', 'Mörser', 'pot', '#9a948a', 0.8, 12, 'Zum Zerreiben von Kräutern.', undefined],
  ['comfrey', 'Beinwell', 'herb', '#4a8a3a', 0.02, 3, 'Heilkraut für Knochen und Prellungen.', { heal: 2 }],
  ['plantain', 'Wegerich', 'herb', '#6aa84a', 0.02, 3, 'Lindert Entzündungen und Stiche.', { heal: 2 }],
  ['wild_garlic', 'Bärlauch', 'herb', '#5a9a4a', 0.02, 3, 'Antibakterielles Kraut.', { heal: 1, hunger: 2 }],
  ['black_sage', 'Schwarzer Salbei', 'herb', '#6a7a5a', 0.02, 3, 'Beruhigendes Kraut.', undefined],
  ['common_mallow', 'Malve', 'herb', '#c86aa8', 0.02, 3, 'Lindert Reizungen.', undefined],
  ['ginseng', 'Ginseng', 'herb', '#d8c8a0', 0.02, 8, 'Wurzel, die Kraft gibt.', { energy: 10 }],
  ['poultice', 'Kräuterumschlag', 'herb', '#6a8a3a', 0.1, 6, 'Heilsamer Wickel aus zerstoßenen Kräutern.', { heal: 6 }],
  ['sterile_bandage', 'Steriler Verband', 'tape', '#f4f8f8', 0.1, 14, 'Sauberer Verband.', undefined],
  ['dirty_bandage', 'Schmutziger Verband', 'tape', '#a8987a', 0.1, 1, 'Muss gewaschen werden.', undefined],
  ['sterile_rag', 'Steriler Lappen', 'cloth', '#e8ecec', 0.1, 4, 'Kochend abgewaschen.', undefined],
  ['suture_needle', 'Nahtnadel', 'pliers', '#c0c4cc', 0.02, 6, 'Chirurgische Nadel.', undefined],
  ['tissue_box', 'Taschentuchbox', 'box', '#cfe8f0', 0.2, 3, 'Papiertücher.', undefined],
] as [string, string, IconKind, string, number, number, string, ItemUse | undefined][]) add(k, n, kind, col, w, v, 'medical', d, { use, stack: 10, tags: ['medical'] });

/* ----------------------------------------------------------------- Werkzeug */

for (const [k, n, kind, col, w, v, d, tags] of [
  ['screwdriver', 'Schraubenzieher', 'screwdriver', '#c0392b', 0.2, 8, 'Zum Schrauben.', ['tool', 'screwdriver']],
  ['pliers', 'Zange', 'pliers', '#c0392b', 0.4, 10, 'Zum Greifen und Biegen.', ['tool']],
  ['vise_grips', 'Gripzange', 'pliers', '#8a8e96', 0.5, 14, 'Hält fest, was sie packt.', ['tool']],
  ['ratchet', 'Ratschenschlüssel', 'wrench', '#aeb3bb', 0.4, 12, 'Für Schrauben im Motorraum.', ['tool', 'mechanic']],
  ['multitool', 'Multitool', 'pliers', '#aeb3bb', 0.3, 24, 'Alles in einem.', ['tool']],
  ['hacksaw', 'Metallsäge', 'saw', '#aeb3bb', 0.5, 12, 'Schneidet Metall.', ['tool', 'saw']],
  ['wood_saw', 'Holzsäge', 'saw', '#c9a36a', 0.7, 14, 'Schneidet Bretter.', ['tool', 'saw']],
  ['flint_saw', 'Feuersteinsäge', 'saw', '#8a8478', 0.4, 6, 'Primitive Säge.', ['tool', 'saw']],
  ['hand_drill', 'Handbohrer', 'screwdriver', '#6a7a8a', 0.8, 18, 'Bohrt Löcher.', ['tool']],
  ['auger', 'Erdbohrer', 'screwdriver', '#6a7a8a', 2.0, 26, 'Zum Bohren großer Löcher.', ['tool']],
  ['file', 'Feile', 'screwdriver', '#aeb3bb', 0.3, 8, 'Schleift Metall.', ['tool']],
  ['chisel', 'Stechbeitel', 'screwdriver', '#aeb3bb', 0.2, 8, 'Für Holz.', ['tool']],
  ['masons_trowel', 'Maurerkelle', 'shovel', '#aeb3bb', 0.4, 8, 'Mörtel auftragen.', ['tool']],
  ['trowel', 'Pflanzkelle', 'shovel', '#3a7a4a', 0.3, 6, 'Zum Gärtnern.', ['tool']],
  ['shears', 'Gartenschere', 'pliers', '#3a7a4a', 0.5, 12, 'Schneidet Zweige.', ['tool']],
  ['tin_snips', 'Blechschere', 'pliers', '#c8a02a', 0.5, 12, 'Schneidet Blech.', ['tool']],
  ['tongs', 'Zange (Schmied)', 'pliers', '#5a5e66', 0.8, 10, 'Für heißes Metall.', ['tool']],
  ['smithing_hammer', 'Schmiedehammer', 'hammer', '#5a5e66', 1.8, 24, 'Zum Schmieden.', ['tool', 'hammer']],
  ['anvil', 'Amboss', 'ingot', '#4a4e56', 12, 60, 'Unverzichtbar für Schmiede.', ['tool']],
  ['bellows', 'Blasebalg', 'sack', '#8a5a30', 1.2, 20, 'Facht das Feuer an.', ['tool']],
  ['whetstone', 'Wetzstein', 'ingot', '#8a8478', 0.3, 10, 'Schärft Klingen.', ['tool']],
  ['steel_wool', 'Stahlwolle', 'rope', '#9a9ea6', 0.05, 3, 'Zum Polieren und Feueranzünden.', ['tool']],
  ['measuring_tape', 'Maßband', 'tape', '#e8c030', 0.2, 6, 'Zum Messen.', ['tool']],
  ['loupe', 'Lupe', 'cup', '#c8d0d8', 0.1, 8, 'Vergrößert.', ['tool']],
  ['needle', 'Nadel', 'pliers', '#c0c4cc', 0.01, 2, 'Zum Nähen.', ['tool', 'needle']],
  ['knitting_needles', 'Stricknadeln', 'screwdriver', '#c8a060', 0.1, 4, 'Zum Stricken.', ['tool']],
  ['thimble', 'Fingerhut', 'cup', '#c0c4cc', 0.01, 2, 'Schützt beim Nähen.', ['tool']],
  ['welding_torch', 'Schweißbrenner', 'screwdriver', '#c0392b', 1.5, 40, 'Verbindet Metall.', ['tool']],
  ['welder_mask', 'Schweißerhelm', 'cup', '#2f3238', 0.7, 20, 'Schützt die Augen.', ['tool']],
  ['paintbrush', 'Pinsel', 'screwdriver', '#c8a060', 0.1, 3, 'Zum Streichen.', ['tool']],
  ['funnel', 'Trichter', 'cup', '#c0c4cc', 0.1, 3, 'Zum Umfüllen.', ['tool']],
  ['rubber_hose', 'Gummischlauch', 'rope', '#2a2a2e', 0.3, 5, 'Zum Abzapfen von Benzin.', ['tool']],
  ['megaphone', 'Megaphon', 'radio', '#d8d8d8', 0.6, 20, 'Laut! Lockt Zombies.', ['tool']],
  ['zip_ties', 'Kabelbinder', 'tape', '#2a2a2e', 0.02, 2, 'Halten fast alles.', ['tool']],
  ['jack', 'Wagenheber', 'ingot', '#c0392b', 3.0, 30, 'Hebt Autos an.', ['tool', 'mechanic']],
  ['lug_wrench', 'Radmutternschlüssel', 'wrench', '#aeb3bb', 1.0, 14, 'Für Radwechsel.', ['tool', 'mechanic']],
  ['tire_pump', 'Reifenpumpe', 'wrench', '#c0392b', 1.0, 14, 'Pumpt Reifen auf.', ['tool', 'mechanic']],
  ['battery_charger', 'Batterieladegerät', 'box', '#c8a02a', 2.0, 30, 'Lädt Autobatterien.', ['tool', 'mechanic']],
  ['spare_engine_parts', 'Ersatzmotorteile', 'gear', '#8a8e96', 3.0, 28, 'Für Reparaturen am Motor.', ['enginepart']],
] as [string, string, IconKind, string, number, number, string, string[]][]) add(k, n, kind, col, w, v, 'misc', d, { tags, stack: 1 });

/* ------------------------------------------------------------ Camping etc. */

for (const [k, n, kind, col, w, v, d, tags, cat] of [
  ['sleeping_bag', 'Schlafsack', 'sleeping', '#3a6a9a', 1.5, 30, 'Warm und kompakt.', ['camping'], 'misc'],
  ['sleeping_bag_cheap', 'Billig-Schlafsack', 'sleeping', '#8a8e96', 1.2, 14, 'Dünn, aber besser als der Boden.', ['camping'], 'misc'],
  ['tent', 'Zelt', 'tent', '#c8a02a', 4.0, 60, 'Schutz vor Wetter.', ['camping'], 'build'],
  ['tent_kit', 'Zeltbausatz', 'tent', '#8a7a5a', 3.0, 40, 'Stangen und Plane.', ['camping'], 'build'],
  ['compass', 'Kompass', 'gear', '#c0392b', 0.1, 14, 'Zeigt nach Norden.', ['camping', 'nav'], 'misc'],
  ['insect_repellent', 'Insektenschutz', 'bottle', '#3a9a5a', 0.2, 6, 'Gegen Stechmücken.', ['camping'], 'misc'],
  ['purification_tablets', 'Wasserentkeimungstabletten', 'pills', '#6ab8e8', 0.05, 10, 'Macht Wasser trinkbar.', ['camping'], 'medical'],
  ['magnesium_firestarter', 'Magnesium-Feuerstarter', 'lighter', '#a8aeb6', 0.1, 10, 'Feuer ohne Streichholz.', ['fire'], 'misc'],
  ['firestarting_block', 'Anzündblock', 'plank', '#e8d8a0', 0.05, 3, 'Brennt lange.', ['fire'], 'misc'],
  ['twigs', 'Zweige', 'plank', '#8a6a3a', 0.1, 1, 'Anmachholz.', ['fuel'], 'material'],
  ['lighter', 'Feuerzeug', 'lighter', '#c0392b', 0.05, 5, 'Macht Feuer.', ['fire'], 'misc'],
  ['matchbox', 'Streichholzschachtel', 'lighter', '#d8c8a0', 0.05, 3, 'Streichhölzer.', ['fire'], 'misc'],
  ['matchbook', 'Streichholzbrief', 'paper', '#d8c8a0', 0.02, 2, 'Wenige Streichhölzer.', ['fire'], 'misc'],
  ['candle', 'Kerze', 'candle', '#f0e8c8', 0.1, 3, 'Spendet schwaches Licht.', ['light'], 'misc'],
  ['hurricane_lantern', 'Sturmlaterne', 'lantern', '#c8a02a', 0.8, 20, 'Öllampe, windfest.', ['light'], 'misc'],
  ['propane_lantern', 'Propanlaterne', 'lantern', '#3a6a4a', 1.2, 26, 'Helle Gaslampe.', ['light'], 'misc'],
  ['penlight', 'Stiftlampe', 'flashlight', '#aeb3bb', 0.1, 8, 'Kleine Lampe.', ['light'], 'misc'],
  ['flashlight_heavy', 'Schwere Taschenlampe', 'flashlight', '#2f3238', 0.8, 26, 'Hell und stabil.', ['light', 'tool'], 'gear'],
  ['umbrella', 'Regenschirm', 'gear', '#2a3a6a', 0.5, 10, 'Hält Regen ab.', [], 'misc'],
  ['alarm_clock', 'Wecker', 'gear', '#c0392b', 0.3, 8, 'Weckt dich (und Zombies).', [], 'misc'],
  ['soap', 'Seife', 'box', '#f0e8f0', 0.1, 3, 'Zum Waschen.', [], 'misc'],
  ['towel', 'Handtuch', 'cloth', '#6ab8e8', 0.4, 6, 'Trocknet ab.', [], 'misc'],
  ['rag', 'Lappen', 'cloth', '#c8b890', 0.1, 1, 'Allzweck-Stofffetzen.', ['fabric'], 'material'],
  ['extinguisher', 'Feuerlöscher', 'bottle', '#d83a30', 2.5, 28, 'Löscht Brände.', [], 'misc'],
  ['bleach', 'Bleichmittel', 'bottle', '#f0f0f8', 1.0, 6, 'Desinfiziert Wasser. Nicht trinken!', [], 'misc'],
  ['lighter_fluid', 'Feuerzeugbenzin', 'bottle', '#c8a02a', 0.2, 5, 'Brennbar.', ['fuel'], 'misc'],
  ['straight_razor', 'Rasiermesser', 'knife', '#aeb3bb', 0.1, 10, 'Scharf wie sonst nichts.', [], 'misc'],
  ['padlock', 'Vorhängeschloss', 'key', '#c8a02a', 0.2, 10, 'Sichert Türen.', ['lock'], 'misc'],
  ['key', 'Schlüssel', 'key', '#c8a02a', 0.02, 2, 'Passt irgendwo.', ['lock'], 'misc'],
  ['car_key', 'Fahrzeugschlüssel', 'key', '#3a3d44', 0.03, 6, 'Startet ein Auto.', ['lock'], 'misc'],
  ['map', 'Karte', 'map', '#e8d8a0', 0.05, 8, 'Stadtplan.', ['nav'], 'misc'],
] as [string, string, IconKind, string, number, number, string, string[], Category][]) add(k, n, kind, col, w, v, cat, d, { tags, light: k === 'penlight' || k === 'flashlight_heavy', stack: w <= 0.1 ? 8 : 1 });

/* ------------------------------------------------------------ Elektronik */

for (const [k, n, kind, col, w, v, d] of [
  ['battery_aa', 'Batterie', 'battery', '#c8a02a', 0.05, 4, 'Mignonzelle.'],
  ['light_bulb', 'Glühbirne', 'bulb', '#f8f0b0', 0.05, 4, 'Leuchtmittel.'],
  ['wire', 'Elektrokabel', 'rope', '#c0392b', 0.2, 4, 'Kabel zum Basteln.'],
  ['scrap_electronics', 'Elektroschrott', 'gear', '#3a6a4a', 0.4, 4, 'Platinen und Bauteile.'],
  ['radio', 'Radio', 'radio', '#5a3a22', 1.0, 40, 'Empfängt Sendungen.'],
  ['walkie_talkie', 'Walkie-Talkie', 'radio', '#2f3238', 0.4, 36, 'Funkgerät mit kurzer Reichweite.'],
  ['ham_radio', 'Amateurfunkgerät', 'radio', '#4a5a3a', 3.0, 90, 'Sendet und empfängt über weite Strecken.'],
  ['television', 'Fernseher', 'radio', '#3a3d44', 8.0, 40, 'Schwarzer Bildschirm. Vielleicht gibt es Strom?'],
  ['cd_player', 'CD-Player', 'radio', '#6a6e76', 0.6, 18, 'Spielt Musik.'],
  ['headphones', 'Kopfhörer', 'radio', '#2a2a2e', 0.2, 12, 'Hörer.'],
  ['speaker', 'Lautsprecher', 'radio', '#2a2a2e', 1.0, 20, 'Laut.'],
  ['microphone', 'Mikrofon', 'radio', '#4a4e56', 0.3, 14, 'Nimmt Ton auf.'],
  ['game_console', 'Handheld-Konsole', 'radio', '#6a3ad8', 0.3, 22, 'Zeitvertreib.'],
  ['hair_dryer', 'Haartrockner', 'radio', '#d86a8a', 0.5, 8, 'Für die Frisur.'],
  ['motion_sensor', 'Bewegungsmelder', 'radio', '#e8e8e8', 0.3, 20, 'Für Fallen.'],
  ['generator', 'Stromgenerator', 'box', '#c8a02a', 20.0, 120, 'Liefert Strom, solange Benzin da ist.'],
  ['power_bar', 'Steckdosenleiste', 'box', '#e8e8e0', 0.3, 6, 'Mehrere Anschlüsse.'],
  ['home_alarm', 'Alarmanlage', 'radio', '#c0392b', 0.8, 30, 'Schlägt Alarm.'],
  ['timer', 'Zeitschaltuhr', 'gear', '#e8e8e0', 0.2, 8, 'Zählt herunter.'],
] as [string, string, IconKind, string, number, number, string][]) add(k, n, kind, col, w, v, 'misc', d, { stack: w <= 0.1 ? 10 : 1, tags: ['electronic'] });

/* ----------------------------------------------------- Fischen, Fallen, Garten */

for (const [k, n, kind, col, w, v, d] of [
  ['fishing_rod', 'Angelrute', 'spear', '#8a5a30', 0.8, 24, 'Zum Angeln.'],
  ['fishing_hook', 'Angelhaken', 'pliers', '#c0c4cc', 0.01, 1, 'Spitz und klein.'],
  ['fishing_line', 'Angelschnur', 'rope', '#e8f0f0', 0.05, 3, 'Dünn und reißfest.'],
  ['fishing_net', 'Fischernetz', 'rope', '#8a7a5a', 1.0, 18, 'Fängt viele kleine Fische.'],
  ['fish_lure', 'Angelköder', 'fish', '#d86a2a', 0.02, 3, 'Lockt Fische an.'],
  ['bobber', 'Schwimmer', 'ball', '#d83a30', 0.01, 1, 'Zeigt Bisse an.'],
  ['mouse_trap', 'Mausefalle', 'trap', '#c9a36a', 0.1, 4, 'Fängt Mäuse.'],
  ['snare_trap', 'Schlingenfalle', 'trap', '#8a7a5a', 0.3, 6, 'Fängt Kleintiere.'],
  ['stick_trap', 'Stockfalle', 'trap', '#8a6a3a', 0.4, 6, 'Einfache Falle.'],
  ['box_trap', 'Kistenfalle', 'trap', '#c9a36a', 1.5, 12, 'Fängt Kaninchen.'],
  ['cage_trap', 'Käfigfalle', 'trap', '#8a8e96', 2.0, 20, 'Fängt größere Tiere.'],
  ['crate_trap', 'Fallkiste', 'trap', '#9a7448', 2.5, 16, 'Fängt Hühner und Kaninchen.'],
  ['fertilizer', 'Dünger', 'sack', '#6a5a3a', 2.0, 8, 'Lässt Pflanzen schneller wachsen.'],
  ['compost_bag', 'Kompostsack', 'sack', '#4a3a22', 2.0, 6, 'Nährstoffreiche Erde.'],
  ['sack_dirt', 'Sack Erde', 'sack', '#5a4630', 4.0, 4, 'Zum Anpflanzen.'],
  ['sack_sand', 'Sack Sand', 'sack', '#d8c08a', 4.0, 4, 'Zum Bauen und Barrikadieren.'],
  ['sack_gravel', 'Sack Kies', 'sack', '#8a8e96', 4.0, 4, 'Zum Bauen.'],
  ['sack_clay', 'Sack Ton', 'sack', '#b8785a', 4.0, 6, 'Zum Töpfern.'],
  ['spray_paint', 'Sprühfarbe', 'bottle', '#c0392b', 0.4, 8, 'Zum Markieren.'],
  ['paint_bucket', 'Farbeimer', 'pot', '#e8e8e8', 2.0, 10, 'Wandfarbe.'],
] as [string, string, IconKind, string, number, number, string][]) add(k, n, kind, col, w, v, 'misc', d, { stack: w <= 0.1 ? 10 : w <= 0.5 ? 4 : 1 });

/* Saatgut: ein Eintrag je Pflanze */
for (const [k, n, col] of [
  ['barley', 'Gerste', '#d8c070'], ['basil', 'Basilikum', '#4a9a4a'], ['bell_pepper', 'Paprika', '#d8302e'], ['broccoli', 'Brokkoli', '#4a8a3a'],
  ['cabbage', 'Kohl', '#8ac860'], ['carrot', 'Karotte', '#e8802a'], ['cauliflower', 'Blumenkohl', '#f0ecd8'], ['chamomile', 'Kamille', '#f0e8a0'],
  ['corn', 'Mais', '#e8c840'], ['cucumber', 'Gurke', '#4a9a4a'], ['garlic', 'Knoblauch', '#f0ead8'], ['kale', 'Grünkohl', '#3a7a3a'],
  ['leek', 'Lauch', '#7ac850'], ['lettuce', 'Salat', '#7ac850'], ['onion', 'Zwiebel', '#d8a870'], ['peas', 'Erbsen', '#6aa83a'],
  ['potato', 'Kartoffel', '#b89a60'], ['pumpkin', 'Kürbis', '#e87820'], ['radish', 'Radieschen', '#d8302e'], ['soybean', 'Sojabohne', '#c8b070'],
  ['spinach', 'Spinat', '#3a7a3a'], ['strawberry', 'Erdbeere', '#d82e3a'], ['sunflower', 'Sonnenblume', '#f0c020'], ['sweet_potato', 'Süßkartoffel', '#c0603a'],
  ['tomato', 'Tomate', '#d8281e'], ['turnip', 'Steckrübe', '#c8a8d8'], ['watermelon', 'Wassermelone', '#4aa85a'], ['wheat', 'Weizen', '#e0c060'], ['zucchini', 'Zucchini', '#3a8a3a'],
] as [string, string, string][]) add(`seeds_${k}`, `Saatgut: ${n}`, 'seeds', col, 0.01, 2, 'misc', `Samentüte für ${n}.`, { stack: 20, tags: ['seeds'] });

/* ----------------------------------------------------------------- Material */

for (const [k, n, kind, col, w, v, d, stack] of [
  ['nails_box', 'Schachtel Nägel', 'ammobox', '#a7abb3', 1.0, 20, 'Viele Nägel.', 4],
  ['screws', 'Schrauben', 'gear', '#b8bcc4', 0.02, 1, 'Zum Verschrauben.', 40],
  ['screws_box', 'Schachtel Schrauben', 'ammobox', '#b8bcc4', 1.0, 24, 'Viele Schrauben.', 4],
  ['nuts_bolts', 'Schrauben und Muttern', 'gear', '#b8bcc4', 0.05, 2, 'Beschläge.', 30],
  ['duct_tape', 'Panzerband', 'tape', '#9aa0a8', 0.2, 8, 'Hält alles zusammen.', 6],
  ['adhesive_tape', 'Klebeband', 'tape', '#e8e0c8', 0.1, 4, 'Dünnes Band.', 8],
  ['rope', 'Seil', 'rope', '#c8a460', 0.5, 8, 'Stabil und lang.', 6],
  ['twine', 'Garn', 'rope', '#d8c490', 0.1, 3, 'Dünne Schnur.', 10],
  ['string', 'Schnur', 'rope', '#e8dcc0', 0.05, 2, 'Zum Binden.', 20],
  ['thread', 'Faden', 'rope', '#d8d0c0', 0.01, 1, 'Zum Nähen.', 40],
  ['yarn', 'Wolle', 'rope', '#d83a5a', 0.1, 3, 'Zum Stricken.', 10],
  ['wire_roll', 'Draht', 'rope', '#a8aeb6', 0.2, 4, 'Biegsam.', 10],
  ['barbed_wire', 'Stacheldraht', 'rope', '#8a8e96', 0.6, 10, 'Gemein für Zombies.', 4],
  ['glue', 'Klebstoff', 'bottle', '#e8e8d0', 0.1, 4, 'Klebt fast alles.', 6],
  ['wood_glue', 'Holzleim', 'bottle', '#e8d8a0', 0.2, 5, 'Für Holz.', 4],
  ['epoxy', 'Epoxidharz', 'bottle', '#c8a02a', 0.2, 10, 'Härtet aus.', 4],
  ['log', 'Baumstamm', 'plank', '#7a5a34', 8.0, 12, 'Zum Verbrennen oder Sägen.', 1],
  ['plank_large', 'Große Planke', 'plank', '#b4894c', 3.0, 10, 'Breites Brett.', 3],
  ['firewood_bundle', 'Brennholzbündel', 'plank', '#7a5a34', 3.0, 10, 'Zum Heizen.', 2],
  ['charcoal', 'Holzkohle', 'ingot', '#2a2a2e', 0.5, 4, 'Brennt heiß.', 6],
  ['coke', 'Koks', 'ingot', '#3a3a3e', 0.6, 6, 'Zum Schmelzen von Eisen.', 6],
  ['brick', 'Ziegelstein', 'ingot', '#b8603a', 1.5, 4, 'Zum Mauern.', 6],
  ['clay', 'Ton', 'ingot', '#b8785a', 1.0, 3, 'Formbar.', 6],
  ['limestone', 'Kalkstein', 'ingot', '#d8d4c8', 1.5, 3, 'Für Zement.', 6],
  ['concrete_powder', 'Betonpulver', 'sack', '#9a9a9e', 5.0, 10, 'Zum Betonmischen.', 2],
  ['plaster_powder', 'Gipspulver', 'sack', '#f0f0ec', 5.0, 8, 'Zum Verputzen.', 2],
  ['glass_pane', 'Glasscheibe', 'plank', '#bfe0f0', 2.0, 12, 'Für Fenster.', 3],
  ['tarp', 'Plane', 'cloth', '#3a6a9a', 1.0, 10, 'Wasserdicht.', 3],
  ['sheet', 'Bettlaken', 'cloth', '#f0f0f0', 0.4, 4, 'Zum Zerreißen.', 6],
  ['pillow', 'Kissen', 'cloth', '#f4f0e8', 0.4, 5, 'Weich.', 2],
  ['burlap', 'Sackleinen', 'cloth', '#b89a60', 0.2, 3, 'Grober Stoff.', 8],
  ['cotton_roll', 'Baumwollstoffrolle', 'cloth', '#f0ecd8', 0.5, 8, 'Zum Nähen.', 4],
  ['denim_roll', 'Jeansstoffrolle', 'cloth', '#3f5a86', 0.6, 10, 'Robuster Stoff.', 4],
  ['leather_strips', 'Lederstreifen', 'hide', '#8a5a30', 0.1, 3, 'Zum Binden.', 10],
  ['leather_small', 'Kleines Leder', 'hide', '#8a5a30', 0.4, 8, 'Gegerbtes Leder.', 6],
  ['leather_medium', 'Mittleres Leder', 'hide', '#7a4a28', 0.8, 14, 'Gegerbtes Leder.', 4],
  ['leather_large', 'Großes Leder', 'hide', '#6a3a1e', 1.5, 24, 'Gegerbtes Leder.', 2],
  ['hide_small', 'Kleines Fell', 'hide', '#a87a4a', 0.5, 4, 'Ungegerbt.', 6],
  ['hide_medium', 'Mittleres Fell', 'hide', '#98683a', 1.0, 7, 'Ungegerbt.', 4],
  ['hide_large', 'Großes Fell', 'hide', '#885a30', 2.0, 12, 'Ungegerbt.', 2],
  ['iron_ingot', 'Eisenbarren', 'ingot', '#7a7e86', 2.0, 16, 'Zum Schmieden.', 4],
  ['steel_ingot', 'Stahlbarren', 'ingot', '#9aa0a8', 2.0, 28, 'Zum Schmieden.', 4],
  ['copper_ingot', 'Kupferbarren', 'ingot', '#c0703a', 2.0, 18, 'Zum Schmieden.', 4],
  ['brass_ingot', 'Messingbarren', 'ingot', '#d8b030', 2.0, 20, 'Zum Schmieden.', 4],
  ['gold_ingot', 'Goldbarren', 'ingot', '#f0c030', 2.0, 200, 'Wertvoll!', 4],
  ['silver_ingot', 'Silberbarren', 'ingot', '#d8dce0', 2.0, 100, 'Wertvoll.', 4],
  ['iron_ore', 'Eisenerz', 'ingot', '#6a5a52', 1.5, 6, 'Rohmaterial.', 6],
  ['copper_ore', 'Kupfererz', 'ingot', '#6a8a6a', 1.5, 6, 'Rohmaterial.', 6],
  ['iron_scrap', 'Eisenschrott', 'ingot', '#6a6e76', 0.5, 2, 'Zum Einschmelzen.', 10],
  ['steel_scrap', 'Stahlschrott', 'ingot', '#8a9098', 0.5, 3, 'Zum Einschmelzen.', 10],
  ['aluminum_scrap', 'Aluminiumschrott', 'ingot', '#c8ccd4', 0.2, 2, 'Leicht.', 10],
  ['copper_scrap', 'Kupferschrott', 'ingot', '#c0703a', 0.4, 3, 'Zum Einschmelzen.', 10],
  ['steel_sheet', 'Stahlblech', 'plank', '#9aa0a8', 3.0, 16, 'Für Platten und Beschläge.', 3],
  ['aluminum_foil', 'Alufolie', 'tape', '#d8dce0', 0.05, 3, 'Silbrig.', 8],
  ['gunpowder', 'Schwarzpulver', 'sack', '#2a2a2e', 0.2, 14, 'Sehr brennbar.', 6],
  ['propane_tank', 'Propantank', 'bottle', '#d8d8dc', 5.0, 30, 'Brennstoff für Gaslampe und Brenner.', 1],
  ['tire_piece', 'Reifenstück', 'tire', '#2a2a2e', 0.5, 2, 'Aus Gummi.', 4],
  ['door_hinge', 'Türscharnier', 'gear', '#8a8e96', 0.1, 2, 'Beschlag.', 10],
  ['doorknob', 'Türknauf', 'gear', '#c8a02a', 0.1, 2, 'Beschlag.', 10],
  ['stone', 'Stein', 'ingot', '#8a8e96', 1.0, 1, 'Ein ordentlicher Stein.', 6],
  ['flint_flake', 'Feuersteinsplitter', 'ingot', '#6a6e76', 0.05, 2, 'Scharf wie Glas.', 10],
] as [string, string, IconKind, string, number, number, string, number][]) add(k, n, kind, col, w, v, 'material', d, { stack });

/* ---------------------------------------------------------------- Bücher */

const SKILL_BOOKS: [string, string][] = [
  ['agriculture', 'Landwirtschaft'], ['aiming', 'Zielen'], ['animal_care', 'Tierpflege'], ['blacksmithing', 'Schmieden'], ['butchering', 'Schlachten'],
  ['carpentry', 'Tischlern'], ['carving', 'Schnitzen'], ['cooking', 'Kochen'], ['electrical', 'Elektrik'], ['first_aid', 'Erste Hilfe'],
  ['fishing', 'Angeln'], ['foraging', 'Sammeln'], ['glassmaking', 'Glasbläserei'], ['knapping', 'Steinschlagen'], ['long_blade', 'Langklinge'],
  ['maintenance', 'Instandhaltung'], ['masonry', 'Maurern'], ['mechanics', 'Mechanik'], ['pottery', 'Töpfern'], ['reloading', 'Nachladen'],
  ['tailoring', 'Schneidern'], ['tracking', 'Spurenlesen'], ['trapping', 'Fallenstellen'], ['welding', 'Schweißen'],
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const BOOK_COLORS = ['#8a3a2e', '#2e5a8a', '#3a7a4a', '#7a5a2e', '#5a3a7a'];
/** Fachbuch → (Fertigkeit, Stufe 1..5). Soll dem Skill-System die XP-Multiplikatoren liefern. */
export const PZ_SKILL_BOOKS: Record<string, [skill: string, level: number]> = {};
for (const [key, label] of SKILL_BOOKS) {
  for (let lv = 1; lv <= 5; lv++) {
    PZ_SKILL_BOOKS[add(`book_${key}_${lv}`, `${label} ${ROMAN[lv - 1]}`, 'book', BOOK_COLORS[lv - 1], 0.4, 20 + lv * 12, 'misc', `Fachbuch: ${label}, Stufe ${lv}. Wer es liest, lernt schneller.`, { stack: 1, tags: ['skillbook'] })] = [key, lv];
  }
}
for (const [k, n, kind, col, w, v, d] of [
  ['magazine', 'Zeitschrift', 'book', '#d86a8a', 0.2, 3, 'Bunte Zeitschrift.'],
  ['newspaper', 'Zeitung', 'paper', '#d8d4c8', 0.1, 1, 'Alte Nachrichten.'],
  ['comic', 'Comicheft', 'book', '#e8a02a', 0.1, 3, 'Zeitvertreib.'],
  ['notebook', 'Notizbuch', 'book', '#3a3d44', 0.2, 4, 'Zum Aufschreiben.'],
  ['paper', 'Papier', 'paper', '#f8f8f0', 0.01, 1, 'Ein Blatt.'],
  ['pen', 'Kugelschreiber', 'screwdriver', '#2a3a8a', 0.02, 1, 'Schreibt.'],
  ['playing_cards', 'Spielkarten', 'paper', '#f4f0e8', 0.05, 3, 'Ein Kartenspiel.'],
  ['dice', 'Würfel', 'ball', '#f4f0e8', 0.01, 1, 'Sechsseitig.'],
  ['guitar_pick', 'Plektrum', 'ball', '#d8302e', 0.01, 1, 'Für Gitarren.'],
  ['harmonica', 'Mundharmonika', 'radio', '#aeb3bb', 0.1, 10, 'Spielt traurige Melodien.'],
  ['whistle', 'Trillerpfeife', 'lighter', '#aeb3bb', 0.05, 4, 'Schrill. Lockt Zombies.'],
  ['baseball', 'Baseball', 'ball', '#f4f0e8', 0.15, 3, 'Harter Ball.'],
  ['basketball', 'Basketball', 'ball', '#d86a2a', 0.5, 6, 'Prall gefüllt.'],
  ['soccer_ball', 'Fußball', 'ball', '#f4f4f4', 0.4, 6, 'Rundes Leder.'],
  ['tennis_ball', 'Tennisball', 'ball', '#d8e830', 0.06, 1, 'Filzig.'],
  ['golf_ball', 'Golfball', 'ball', '#f8f8f8', 0.05, 1, 'Klein und hart.'],
  ['dart', 'Dartpfeil', 'knife', '#c0392b', 0.02, 1, 'Spitz.'],
  ['cigarettes', 'Zigarettenpackung', 'box', '#c0392b', 0.05, 8, 'Rauchwaren.'],
  ['cigar', 'Zigarre', 'candle', '#7a4a22', 0.03, 4, 'Edel.'],
  ['money_bundle', 'Geldbündel', 'paper', '#6aa86a', 0.1, 50, 'Wertlose Scheine – oder doch nicht?'],
  ['dog_tag', 'Erkennungsmarke', 'ingot', '#aeb3bb', 0.02, 2, 'Eines Soldaten.'],
  ['toilet_paper', 'Toilettenpapier', 'tape', '#f8f8f4', 0.2, 2, 'Wertvoll.'],
  ['toothbrush', 'Zahnbürste', 'screwdriver', '#6ab8e8', 0.02, 1, 'Hygiene.'],
  ['comb', 'Kamm', 'screwdriver', '#2a2a2e', 0.02, 1, 'Ordnet die Haare.'],
  ['camera', 'Kamera', 'gear', '#2f3238', 0.5, 24, 'Macht Fotos.'],
] as [string, string, IconKind, string, number, number, string][]) add(k, n, kind, col, w, v, 'misc', d, { stack: w <= 0.1 ? 10 : 4 });

/* ---------------------------------------------------------------- Fahrzeug */

for (const [k, n, kind, col, w, v, d] of [
  ['tire', 'Reifen', 'tire', '#2a2a2e', 9, 30, 'Autoreifen.'],
  ['car_battery', 'Autobatterie (PZ)', 'battery', '#3a3d44', 5, 30, 'Zum Anlassen.'],
  ['gas_tank_small', 'Kleiner Tank', 'bottle', '#c8a02a', 8, 24, 'Fasst wenig.'],
  ['gas_tank_big', 'Großer Tank', 'bottle', '#c8a02a', 14, 44, 'Fasst viel.'],
  ['muffler', 'Auspuff', 'screwdriver', '#6a6e76', 6, 22, 'Dämpft den Lärm.'],
  ['brake_pads', 'Bremsbeläge', 'gear', '#6a6e76', 3, 24, 'Bremsen halten.'],
  ['suspension', 'Federung', 'gear', '#8a8e96', 6, 30, 'Fahrwerk.'],
  ['car_seat', 'Autositz', 'box', '#3a3d44', 8, 14, 'Bequem.'],
  ['car_door', 'Autotür', 'plank', '#aeb3bb', 12, 24, 'Schwer.'],
  ['windshield', 'Windschutzscheibe', 'plank', '#bfe0f0', 9, 26, 'Zerbrechlich.'],
  ['jerry_can', 'Reservekanister', 'bottle', '#3a6a3a', 1, 18, 'Fasst Benzin.'],
] as [string, string, IconKind, string, number, number, string][]) add(`veh_${k}`, n, kind, col, w, v, 'material', d, { stack: 1, tags: ['vehicle'] });

/** Lootlisten zum Dazumischen (`registerPz` hängt sie an bestehende Listen oder legt neue an). */
export const PZ_LOOT_ADD: Record<string, [id: string, weight: number, min: number, max: number][]> = {
  food: [
    ['pz_canned_beans', 6, 1, 2], ['pz_canned_corn', 5, 1, 2], ['pz_canned_tuna', 5, 1, 2], ['pz_canned_sardines', 4, 1, 2], ['pz_canned_chili', 4, 1, 1],
    ['pz_canned_bolognese', 4, 1, 1], ['pz_canned_peaches', 3, 1, 1], ['pz_canned_veg_soup', 4, 1, 1], ['pz_soda_can', 5, 1, 2], ['pz_chips_plain', 4, 1, 1],
    ['pz_chocolate_bar', 4, 1, 2], ['pz_granola_bar', 4, 1, 2], ['pz_crackers', 3, 1, 1], ['pz_jerky', 2, 1, 1], ['pz_peanut_butter', 2, 1, 1],
    ['pz_plastic_water', 6, 1, 2],
  ],
  medical: [
    ['pz_painkillers', 4, 1, 1], ['pz_antibiotics', 2, 1, 1], ['pz_adhesive_bandage', 5, 1, 2], ['pz_alcohol_wipes', 4, 1, 2], ['pz_cotton_balls', 3, 1, 1],
    ['pz_tweezers', 2, 1, 1], ['pz_forceps', 1.2, 1, 1], ['pz_medical_shears', 1, 1, 1], ['pz_surgical_mask', 2, 1, 1], ['pz_surgical_gloves', 2, 1, 1],
    ['pz_sterile_bandage', 2, 1, 1], ['pz_suture_needle', 2, 1, 2], ['pz_cold_pack', 1, 1, 1],
  ],
  storage: [
    ['pz_screwdriver', 3, 1, 1], ['pz_pliers', 3, 1, 1], ['pz_wrench', 2, 1, 1], ['pz_duct_tape', 3, 1, 1], ['pz_rope', 3, 1, 1], ['pz_wire_roll', 3, 1, 2],
    ['pz_screws', 4, 3, 10], ['pz_hacksaw', 1.5, 1, 1], ['pz_wood_saw', 1.5, 1, 1], ['pz_tarp', 1.5, 1, 1], ['pz_glue', 2, 1, 1], ['pz_battery_aa', 3, 1, 3],
    ['pz_candle', 3, 1, 2], ['pz_lighter', 3, 1, 1], ['pz_matchbox', 3, 1, 1], ['pz_sack_sand', 1, 1, 1], ['pz_fertilizer', 1, 1, 1], ['pz_pickaxe', 0.6, 1, 1],
    ['pz_hatchet', 1, 1, 1], ['pz_claw_hammer', 1.5, 1, 1], ['pz_bucket', 1.5, 1, 1], ['pz_jack', 0.8, 1, 1], ['pz_lug_wrench', 0.8, 1, 1],
  ],
  office: [
    ['pz_pen', 6, 1, 2], ['pz_paper', 6, 1, 4], ['pz_notebook', 3, 1, 1], ['pz_mug_coffee', 3, 1, 1], ['pz_money_bundle', 0.6, 1, 1], ['pz_newspaper', 3, 1, 1], ['pz_magazine', 3, 1, 1],
  ],
  weapons: [
    ['pz_pistol_m9', 3, 1, 1], ['pz_pistol_m1911', 2, 1, 1], ['pz_revolver', 2, 1, 1], ['pz_shotgun', 1.5, 1, 1], ['pz_rifle_hunting', 0.8, 1, 1],
    ['pz_rifle_m16', 0.4, 1, 1], ['pz_nightstick', 2, 1, 1], ['pz_katana', 0.6, 1, 1], ['pz_hatchet', 2, 1, 1],
    ['pz_bullets_9mm', 6, 5, 15], ['pz_bullets_45', 4, 5, 15], ['pz_bullets_38', 4, 5, 12], ['pz_shells_12g', 5, 3, 10], ['pz_bullets_308', 2, 3, 10],
    ['pz_bullets_556', 1.5, 5, 20], ['pz_box_9mm', 2, 1, 1], ['pz_box_45', 1.5, 1, 1], ['pz_shells_12g_box', 1.5, 1, 1],
    ['pz_mag_9mm', 2, 1, 1], ['pz_mag_45', 1.5, 1, 1],
  ],
  books: SKILL_BOOKS.flatMap(([key]) => [[`pz_book_${key}_1`, 1, 1, 1], [`pz_book_${key}_2`, 0.5, 1, 1], [`pz_book_${key}_3`, 0.2, 1, 1]] as [string, number, number, number][]),
};
