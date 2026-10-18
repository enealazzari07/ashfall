/**
 * PZ-Waffen (Vorbild: PZwiki Item list): Nahkampf im Format von data/weapons.ts plus Schusswaffen mit
 * Magazin, Munition, Nachladen und Streuung. Alles reine Daten/Funktionen – keine Abhängigkeit zum Spiel-Code
 * außer den Typen. Eingebunden wird es über `registerPz()` (siehe pz/index.ts).
 */
import type { WeaponDef } from '../data/weapons';
import type { ItemDef } from '../data/items';
import type { IconKind } from './pzIcons';

/* ---------------------------------------------------------------- Nahkampf */

type M = [id: string, name: string, kind: IconKind, color: string, weight: number, value: number, w: Omit<WeaponDef, 'id' | 'name'>, desc: string];

const w = (min: number, max: number, range: number, arc: number, swing: number, noise: number, targets: number, push: number, energy: number, look: WeaponDef['look']): Omit<WeaponDef, 'id' | 'name'> =>
  ({ min, max, range, arc, swing, noise, targets, push, energy, look });

const MELEE: M[] = [
  ['pz_katana', 'Katana', 'sword', '#d9dde2', 1.1, 120, w(18, 26, 1.9, 140, 0.4, 5, 3, 0.3, 0.45, 'bat'), 'Japanisches Schwert. Schnell, scharf, tödlich.'],
  ['pz_sword', 'Schwert', 'sword', '#c4c9cf', 1.3, 80, w(16, 23, 1.9, 130, 0.5, 6, 2, 0.35, 0.5, 'bat'), 'Ein ordentliches Schwert.'],
  ['pz_shortsword', 'Kurzschwert', 'sword', '#c4c9cf', 0.9, 50, w(12, 18, 1.6, 110, 0.4, 5, 2, 0.25, 0.35, 'knife'), 'Kurz und handlich.'],
  ['pz_crude_sword', 'Einfaches Schwert', 'sword', '#8f949b', 1.4, 25, w(12, 18, 1.8, 120, 0.55, 6, 2, 0.35, 0.5, 'bat'), 'Grob geschmiedet, aber scharf genug.'],
  ['pz_crude_shortsword', 'Einfaches Kurzschwert', 'sword', '#8f949b', 1.0, 18, w(9, 14, 1.5, 100, 0.45, 5, 2, 0.25, 0.4, 'knife'), 'Roh geschmiedetes Kurzschwert.'],
  ['pz_spear_short', 'Speer mit Metallspitze', 'spear', '#9aa0a8', 1.4, 20, w(12, 17, 2.3, 40, 0.6, 5, 2, 0.5, 0.5, 'pipe'), 'Lange Reichweite, trifft in einer Linie.'],
  ['pz_spear_long', 'Speer mit langer Metallspitze', 'spear', '#b8bec6', 1.6, 26, w(14, 20, 2.5, 40, 0.65, 5, 2, 0.55, 0.55, 'pipe'), 'Noch mehr Reichweite.'],
  ['pz_mace', 'Streitkolben', 'club', '#7d8189', 2.4, 40, w(17, 25, 1.7, 110, 0.75, 11, 1, 0.7, 0.7, 'sledge'), 'Schwerer Metallkolben.'],
  ['pz_mace_stone', 'Steinkeule', 'club', '#8a8478', 2.6, 15, w(15, 22, 1.7, 110, 0.8, 10, 1, 0.7, 0.75, 'sledge'), 'Stein an einem Stiel.'],
  ['pz_long_mace', 'Lange Keule', 'club', '#7d8189', 3.0, 48, w(20, 30, 2.0, 110, 0.9, 12, 2, 0.9, 0.9, 'sledge'), 'Zweihändig, brutal.'],
  ['pz_long_spiked_club', 'Lange Stachelkeule', 'club', '#6b4a2c', 3.0, 40, w(19, 28, 2.0, 110, 0.9, 12, 2, 0.8, 0.9, 'sledge'), 'Holz mit Nägeln.'],
  ['pz_short_bat', 'Kurzer Schläger', 'club', '#c49a5e', 0.8, 10, w(8, 13, 1.5, 100, 0.4, 8, 1, 0.3, 0.3, 'bat'), 'Abgesägter Baseballschläger.'],
  ['pz_spiked_short_bat', 'Kurzer Schläger mit Stacheln', 'club', '#a47a44', 1.0, 18, w(11, 16, 1.5, 100, 0.45, 8, 1, 0.3, 0.35, 'bat'), 'Mit Nägeln gespickt.'],
  ['pz_nightstick', 'Schlagstock', 'club', '#222428', 0.6, 25, w(8, 12, 1.6, 100, 0.35, 6, 1, 0.35, 0.3, 'pipe'), 'Polizei-Schlagstock.'],
  ['pz_gavel', 'Richterhammer', 'hammer', '#8a5a30', 0.4, 6, w(5, 8, 1.3, 80, 0.4, 5, 1, 0.2, 0.25, 'pipe'), 'Eher symbolisch.'],
  ['pz_butterfly_knife', 'Balisong', 'knife', '#aeb3bb', 0.15, 14, w(5, 8, 1.2, 70, 0.28, 2, 1, 0.05, 0.12, 'knife'), 'Klappmesser, sehr schnell.'],
  ['pz_switchblade', 'Springmesser', 'knife', '#aeb3bb', 0.15, 14, w(5, 8, 1.2, 70, 0.28, 2, 1, 0.05, 0.12, 'knife'), 'Schnappt auf Knopfdruck auf.'],
  ['pz_fighting_knife', 'Kampfmesser', 'knife', '#8c9299', 0.4, 32, w(8, 12, 1.4, 80, 0.32, 3, 1, 0.1, 0.18, 'knife'), 'Robustes Messer.'],
  ['pz_hunting_knife', 'Jagdmesser', 'knife', '#8c9299', 0.4, 28, w(8, 12, 1.4, 80, 0.33, 3, 1, 0.1, 0.18, 'knife'), 'Zum Ausnehmen und Kämpfen.'],
  ['pz_handguard_dagger', 'Dolch', 'knife', '#8c9299', 0.4, 26, w(8, 11, 1.4, 80, 0.32, 3, 1, 0.1, 0.18, 'knife'), 'Dolch mit Parierstange.'],
  ['pz_railroad_spike_knife', 'Schienennagel-Messer', 'knife', '#6b6f76', 0.4, 8, w(6, 10, 1.3, 70, 0.33, 3, 1, 0.1, 0.18, 'knife'), 'Aus einem Schienennagel gefertigt.'],
  ['pz_pocket_knife', 'Taschenmesser', 'knife', '#b0b5bc', 0.1, 6, w(3, 6, 1.1, 60, 0.3, 2, 1, 0.05, 0.1, 'knife'), 'Klein. Besser als nichts.'],
  ['pz_small_knife', 'Kleines Messer', 'knife', '#b0b5bc', 0.15, 5, w(4, 7, 1.2, 70, 0.3, 2, 1, 0.05, 0.1, 'knife'), 'Kleines Messer.'],
  ['pz_large_knife', 'Großes Messer', 'knife', '#aeb3bb', 0.5, 18, w(8, 12, 1.5, 90, 0.38, 3, 1, 0.12, 0.22, 'knife'), 'Großes Küchenmesser.'],
  ['pz_machete_knife', 'Machetenmesser', 'knife', '#9aa0a8', 0.7, 16, w(9, 13, 1.6, 100, 0.4, 4, 1, 0.15, 0.25, 'knife'), 'Kurze Machete.'],
  ['pz_hatchet', 'Beil', 'axe', '#a6acb4', 1.2, 24, w(11, 16, 1.6, 100, 0.5, 8, 1, 0.4, 0.4, 'axe'), 'Handlich und kräftig.'],
  ['pz_hand_axe', 'Handaxt', 'axe', '#a6acb4', 1.1, 20, w(10, 15, 1.6, 100, 0.5, 8, 1, 0.4, 0.4, 'axe'), 'Alte Handaxt.'],
  ['pz_wood_axe', 'Holzfälleraxt', 'axe', '#b4bac2', 2.4, 36, w(17, 25, 1.9, 130, 0.8, 12, 2, 0.6, 0.75, 'axe'), 'Schwere Axt zum Fällen.'],
  ['pz_pickaxe', 'Spitzhacke', 'pickaxe', '#9aa0a8', 2.8, 34, w(16, 23, 1.9, 90, 0.85, 11, 1, 0.6, 0.8, 'axe'), 'Bricht Stein und Schädel.'],
  ['pz_ice_axe', 'Eispickel', 'pickaxe', '#9aa0a8', 0.8, 22, w(9, 14, 1.5, 90, 0.45, 5, 1, 0.2, 0.3, 'axe'), 'Leicht und spitz.'],
  ['pz_fire_poker', 'Kaminhaken', 'club', '#3a3d44', 0.9, 8, w(6, 10, 1.7, 90, 0.45, 6, 1, 0.25, 0.3, 'pipe'), 'Eiserner Schürhaken.'],
  ['pz_pipe_wrench', 'Rohrzange', 'wrench', '#c0392b', 1.7, 20, w(10, 15, 1.5, 90, 0.55, 10, 1, 0.4, 0.45, 'pipe'), 'Schwere Rohrzange.'],
  ['pz_wrench', 'Schraubenschlüssel', 'wrench', '#aeb3bb', 0.7, 10, w(6, 10, 1.4, 90, 0.4, 8, 1, 0.25, 0.25, 'pipe'), 'Maulschlüssel.'],
  ['pz_claw_hammer', 'Klauenhammer', 'hammer', '#8a5a30', 0.8, 14, w(8, 12, 1.4, 90, 0.45, 8, 1, 0.3, 0.3, 'pipe'), 'Hammer mit Nagelklaue.'],
  ['pz_club_hammer', 'Fäustel', 'hammer', '#8a5a30', 2.0, 22, w(12, 18, 1.5, 90, 0.65, 10, 1, 0.5, 0.55, 'pipe'), 'Kurzstieliger Schlaghammer.'],
  ['pz_stone_hammer', 'Steinhammer', 'hammer', '#8a8478', 1.4, 6, w(8, 13, 1.4, 90, 0.6, 8, 1, 0.35, 0.4, 'pipe'), 'Stein an einem Stock.'],
  ['pz_wooden_mallet', 'Holzschlägel', 'hammer', '#c49a5e', 1.0, 6, w(6, 10, 1.4, 90, 0.5, 6, 1, 0.3, 0.3, 'pipe'), 'Aus Holz, leise.'],
  ['pz_bolt_cutters', 'Bolzenschneider', 'pliers', '#c0392b', 2.0, 28, w(8, 12, 1.6, 90, 0.6, 9, 1, 0.3, 0.45, 'pipe'), 'Knackt Ketten und Vorhängeschlösser.'],
  ['pz_scythe', 'Sense', 'spear', '#8a8d94', 2.0, 28, w(14, 20, 2.1, 160, 0.8, 7, 3, 0.4, 0.65, 'axe'), 'Mäht in weitem Bogen.'],
  ['pz_snow_shovel', 'Schneeschaufel', 'shovel', '#3a7ad0', 1.4, 10, w(7, 11, 1.8, 100, 0.55, 8, 1, 0.4, 0.4, 'bat'), 'Breite Schaufel.'],
  ['pz_smashed_bottle', 'Zerbrochene Flasche', 'bottle', '#7fb3a0', 0.2, 1, w(5, 8, 1.1, 60, 0.35, 2, 1, 0.05, 0.12, 'knife'), 'Scharfe Scherben. Zerbricht schnell.'],
];

export const PZ_MELEE: Record<string, WeaponDef> = {};
for (const [id, name, , , , , stats] of MELEE) PZ_MELEE[id] = { id, name, ...stats };

/* ------------------------------------------------------------- Schusswaffen */

export type FireMode = 'semi' | 'auto' | 'bolt' | 'pump' | 'break' | 'lever' | 'revolver';

export interface FirearmDef {
  id: string;
  name: string;
  /** Item-Id der Einzelpatrone */
  ammo: string;
  /** Magazingröße (bzw. Trommel/Röhre) */
  mag: number;
  /** Item-Id des Wechselmagazins (leer bei Trommel/Röhre) */
  magItem?: string;
  min: number;
  max: number;
  /** Schüsse pro Auslösung (Schrot) */
  pellets: number;
  /** effektive Reichweite in Metern; darüber fällt der Schaden ab */
  range: number;
  /** Streuung in Grad (halber Öffnungswinkel) beim Zielen */
  spread: number;
  /** Mindestzeit zwischen zwei Schüssen in Sekunden */
  cooldown: number;
  /** Nachladezeit komplett in Sekunden (bei Röhren: pro Patrone) */
  reload: number;
  /** Lärmradius eines Schusses (lockt Zombies) in Metern */
  noise: number;
  mode: FireMode;
  /** Rückstoß-Schub nach hinten/Kamera in Grad */
  recoil: number;
  twoHanded: boolean;
}

type F = [def: Omit<FirearmDef, 'twoHanded'> & { twoHanded?: boolean }, kind: IconKind, color: string, weight: number, value: number, desc: string];

const GUNS: F[] = [
  [{ id: 'pz_pistol_bf', name: 'B-F Pistole', ammo: 'pz_bullets_44', mag: 12, magItem: 'pz_mag_44', min: 30, max: 42, pellets: 1, range: 24, spread: 3.2, cooldown: 0.28, reload: 1.8, noise: 60, mode: 'semi', recoil: 2.2 }, 'pistol', '#4a4d54', 1.2, 130, 'Schwere Pistole im Kaliber .44.'],
  [{ id: 'pz_pistol_m9', name: 'M9 Pistole', ammo: 'pz_bullets_9mm', mag: 15, magItem: 'pz_mag_9mm', min: 24, max: 34, pellets: 1, range: 22, spread: 3.4, cooldown: 0.22, reload: 1.6, noise: 55, mode: 'semi', recoil: 1.4 }, 'pistol', '#2f3238', 0.95, 110, 'Standard-Dienstpistole, 9 mm.'],
  [{ id: 'pz_pistol_m1911', name: 'M1911 Pistole', ammo: 'pz_bullets_45', mag: 7, magItem: 'pz_mag_45', min: 28, max: 38, pellets: 1, range: 22, spread: 3.6, cooldown: 0.26, reload: 1.7, noise: 58, mode: 'semi', recoil: 1.9 }, 'pistol', '#3a3d44', 1.1, 120, 'Klassiker im Kaliber .45 ACP.'],
  [{ id: 'pz_revolver', name: 'Dienstrevolver', ammo: 'pz_bullets_38', mag: 6, min: 24, max: 32, pellets: 1, range: 22, spread: 3.0, cooldown: 0.4, reload: 3.2, noise: 55, mode: 'revolver', recoil: 1.8 }, 'revolver', '#4a4d54', 1.0, 100, 'Sechsschüssiger Revolver, .38 Special.'],
  [{ id: 'pz_revolver_short', name: 'SN38 Revolver', ammo: 'pz_bullets_38', mag: 6, min: 22, max: 30, pellets: 1, range: 16, spread: 4.2, cooldown: 0.38, reload: 3.0, noise: 52, mode: 'revolver', recoil: 1.6 }, 'revolver', '#6a6e76', 0.7, 80, 'Kurzläufiger Revolver. Schnell gezogen, ungenau.'],
  [{ id: 'pz_magnum', name: 'Magnum', ammo: 'pz_bullets_357', mag: 6, min: 36, max: 50, pellets: 1, range: 30, spread: 2.8, cooldown: 0.55, reload: 3.4, noise: 75, mode: 'revolver', recoil: 3.8 }, 'revolver', '#2f3238', 1.4, 190, 'Langer Magnum-Revolver. Hoher Schaden, hoher Rückstoß.'],
  [{ id: 'pz_shotgun', name: 'JS-2000 Schrotflinte', ammo: 'pz_shells_12g', mag: 5, min: 9, max: 13, pellets: 9, range: 14, spread: 7.5, cooldown: 0.85, reload: 0.7, noise: 80, mode: 'pump', recoil: 4.5, twoHanded: true }, 'shotgun', '#5a3a22', 3.2, 170, 'Vorderschaftrepetierer. Verheerend auf kurze Distanz.'],
  [{ id: 'pz_shotgun_sawnoff', name: 'Abgesägte JS-2000', ammo: 'pz_shells_12g', mag: 2, min: 9, max: 13, pellets: 9, range: 9, spread: 11, cooldown: 0.7, reload: 0.9, noise: 82, mode: 'pump', recoil: 5.5, twoHanded: false }, 'shotgun', '#4a3022', 1.6, 90, 'Kurz und gemein. Streut weit.'],
  [{ id: 'pz_shotgun_tactical', name: 'JS-3T Taktikschrotflinte', ammo: 'pz_shells_12g', mag: 8, min: 9, max: 13, pellets: 9, range: 15, spread: 6.5, cooldown: 0.7, reload: 0.6, noise: 80, mode: 'pump', recoil: 4.0, twoHanded: true }, 'shotgun', '#2a2c30', 3.4, 260, 'Taktische Pumpgun mit großem Röhrenmagazin.'],
  [{ id: 'pz_shotgun_double', name: 'Doppelflinte', ammo: 'pz_shells_12g', mag: 2, min: 9, max: 13, pellets: 9, range: 13, spread: 7, cooldown: 0.5, reload: 2.4, noise: 82, mode: 'break', recoil: 5.0, twoHanded: true }, 'shotgun', '#6a4a2c', 3.0, 140, 'Zwei Läufe, zwei Schüsse.'],
  [{ id: 'pz_shotgun_double_sawnoff', name: 'Abgesägte Doppelflinte', ammo: 'pz_shells_12g', mag: 2, min: 9, max: 13, pellets: 9, range: 8, spread: 12, cooldown: 0.45, reload: 2.2, noise: 84, mode: 'break', recoil: 6.0 }, 'shotgun', '#5a3a22', 1.5, 80, 'Brutal auf Nahdistanz.'],
  [{ id: 'pz_rifle_m16', name: 'M16 Sturmgewehr', ammo: 'pz_bullets_556', mag: 30, magItem: 'pz_mag_556', min: 28, max: 40, pellets: 1, range: 45, spread: 2.4, cooldown: 0.09, reload: 2.4, noise: 90, mode: 'auto', recoil: 1.6, twoHanded: true }, 'rifle', '#2a2c30', 3.6, 340, 'Vollautomatisch. Sehr laut.'],
  [{ id: 'pz_rifle_m1a', name: 'M1A Gewehr', ammo: 'pz_bullets_308', mag: 20, magItem: 'pz_mag_m14', min: 42, max: 58, pellets: 1, range: 55, spread: 1.8, cooldown: 0.22, reload: 2.4, noise: 95, mode: 'semi', recoil: 3.0, twoHanded: true }, 'rifle', '#4a3a28', 4.5, 380, 'Halbautomatisches Gewehr im Kaliber 7,62 mm.'],
  [{ id: 'pz_rifle_js14', name: 'JS-14 Gewehr', ammo: 'pz_bullets_308', mag: 20, magItem: 'pz_mag_js14', min: 40, max: 56, pellets: 1, range: 55, spread: 1.9, cooldown: 0.24, reload: 2.4, noise: 95, mode: 'semi', recoil: 3.0, twoHanded: true }, 'rifle', '#3a3226', 4.2, 340, 'Halbautomatisches Selbstladegewehr.'],
  [{ id: 'pz_carbine_l92', name: 'L92 Karabiner', ammo: 'pz_bullets_9mm', mag: 10, min: 22, max: 32, pellets: 1, range: 28, spread: 2.8, cooldown: 0.45, reload: 2.6, noise: 62, mode: 'lever', recoil: 1.4, twoHanded: true }, 'rifle', '#6a4a2c', 2.8, 160, 'Handlicher Repetierkarabiner.'],
  [{ id: 'pz_rifle_l94', name: 'L94 Gewehr', ammo: 'pz_bullets_3030', mag: 8, min: 38, max: 52, pellets: 1, range: 48, spread: 2.0, cooldown: 0.55, reload: 0.8, noise: 85, mode: 'lever', recoil: 3.0, twoHanded: true }, 'rifle', '#6a4a2c', 3.4, 220, 'Unterhebelrepetierer, .30-30.'],
  [{ id: 'pz_rifle_varmint', name: 'MSR700 Gewehr', ammo: 'pz_bullets_556', mag: 5, min: 34, max: 46, pellets: 1, range: 60, spread: 1.2, cooldown: 0.9, reload: 2.6, noise: 85, mode: 'bolt', recoil: 2.6, twoHanded: true }, 'rifle', '#3a4a32', 3.4, 240, 'Präzises Repetiergewehr für Kleinwild.'],
  [{ id: 'pz_rifle_hunting', name: 'MSR788 Gewehr', ammo: 'pz_bullets_308', mag: 5, min: 50, max: 70, pellets: 1, range: 70, spread: 1.0, cooldown: 1.0, reload: 2.8, noise: 100, mode: 'bolt', recoil: 4.0, twoHanded: true }, 'rifle', '#5a3a22', 3.8, 300, 'Jagdgewehr mit enormer Reichweite.'],
  [{ id: 'pz_rifle_msr7t', name: 'MSR7T Taktikgewehr', ammo: 'pz_bullets_308', mag: 5, min: 52, max: 72, pellets: 1, range: 75, spread: 0.8, cooldown: 0.95, reload: 2.6, noise: 100, mode: 'bolt', recoil: 3.8, twoHanded: true }, 'rifle', '#2a2c30', 4.2, 420, 'Taktisches Präzisionsgewehr.'],
  [{ id: 'pz_carbine_trapper', name: 'Trapper-Karabiner', ammo: 'pz_bullets_3030', mag: 5, min: 34, max: 46, pellets: 1, range: 40, spread: 2.4, cooldown: 0.6, reload: 0.9, noise: 82, mode: 'lever', recoil: 2.6, twoHanded: true }, 'rifle', '#5a3a22', 2.6, 170, 'Kurzer Unterhebelkarabiner.'],
];

export const PZ_FIREARMS: Record<string, FirearmDef> = {};
for (const [d] of GUNS) PZ_FIREARMS[d.id] = { twoHanded: false, ...d };

export function firearmOf(handItem: string | null): FirearmDef | null {
  return (handItem && PZ_FIREARMS[handItem]) || null;
}

/** ItemDefs + Icon-Zuordnung aller Waffen */
/** Zusatz-Tags, nach denen Abriss, Türen und Rezepte fragen (wie bei den Basis-Werkzeugen) */
const MELEE_TAGS: Record<string, string[]> = {
  pz_claw_hammer: ['tool', 'hammer'], pz_club_hammer: ['tool', 'hammer'], pz_stone_hammer: ['tool', 'hammer'], pz_wooden_mallet: ['tool', 'hammer'],
  pz_hatchet: ['tool', 'breaker', 'chopper'], pz_hand_axe: ['tool', 'breaker', 'chopper'], pz_wood_axe: ['tool', 'breaker', 'chopper'],
  pz_pickaxe: ['tool', 'breaker'], pz_ice_axe: ['tool'], pz_pipe_wrench: ['tool'], pz_wrench: ['tool'], pz_bolt_cutters: ['tool'],
  pz_snow_shovel: ['tool'], pz_scythe: ['tool'],
};
export const PZ_WEAPON_ITEMS: ItemDef[] = [];
export const PZ_WEAPON_ICONS: Record<string, [IconKind, string]> = {};
for (const [id, name, kind, color, weight, value, , desc] of MELEE) {
  PZ_WEAPON_ITEMS.push({ id, name, icon: '', weight, value, maxStack: 1, category: 'gear', desc, equip: { slot: 'hand' }, tags: ['weapon', 'melee', ...(MELEE_TAGS[id] ?? [])] });
  PZ_WEAPON_ICONS[id] = [kind, color];
}
for (const [d, kind, color, weight, value, desc] of GUNS) {
  PZ_WEAPON_ITEMS.push({ id: d.id, name: d.name, icon: '', weight, value, maxStack: 1, category: 'gear', desc: `${desc} (${d.mag} Schuss)`, equip: { slot: 'hand' }, tags: ['weapon', 'firearm'] });
  PZ_WEAPON_ICONS[d.id] = [kind, color];
}

/* ------------------------------------------------------------------ Schießen */

export interface GunState {
  /** Patronen im Magazin/Lauf */
  loaded: number;
  /** Zeitpunkt (s), ab dem wieder geschossen werden darf */
  readyAt: number;
}

export const newGun = (def: FirearmDef, loaded = 0): GunState => ({ loaded: Math.min(loaded, def.mag), readyAt: 0 });

export interface Shot {
  /** Richtung in der XZ-Ebene (normiert) */
  dx: number;
  dz: number;
  damage: number;
}

export interface FireResult {
  fired: boolean;
  why?: 'empty' | 'cooldown';
  shots: Shot[];
  /** Lärmradius, den der Schuss erzeugt */
  noise: number;
  /** Kamera-/Waffenrückstoß in Grad */
  recoil: number;
}

/** Abzug ziehen. `aimX/aimZ` ist die Zielrichtung, `rng` liefert 0..1 (injizierbar für Tests). */
export function fire(state: GunState, def: FirearmDef, now: number, aimX: number, aimZ: number, rng: () => number = Math.random): FireResult {
  if (now < state.readyAt) return { fired: false, why: 'cooldown', shots: [], noise: 0, recoil: 0 };
  if (state.loaded <= 0) return { fired: false, why: 'empty', shots: [], noise: 0, recoil: 0 };
  state.loaded -= 1;
  state.readyAt = now + def.cooldown;
  const len = Math.hypot(aimX, aimZ) || 1;
  const bx = aimX / len;
  const bz = aimZ / len;
  const shots: Shot[] = [];
  for (let i = 0; i < def.pellets; i++) {
    const a = ((rng() * 2 - 1) * def.spread * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    shots.push({ dx: bx * c - bz * s, dz: bx * s + bz * c, damage: def.min + (def.max - def.min) * rng() });
  }
  return { fired: true, shots, noise: def.noise, recoil: def.recoil };
}

/** Schadensanteil in Abhängigkeit von der Entfernung: voll bis `range`, danach linear bis 25 % bei 2× range. */
export function falloff(def: FirearmDef, dist: number): number {
  if (dist <= def.range) return 1;
  return Math.max(0.25, 1 - ((dist - def.range) / def.range) * 0.75);
}

export interface ReloadResult {
  /** neue Patronenzahl in der Waffe */
  loaded: number;
  /** aus dem Vorrat verbrauchte Patronen */
  used: number;
  /** Dauer in Sekunden */
  time: number;
}

/**
 * Nachladen. Magazinwaffen füllen komplett (Rest bleibt im Magazin), Röhren/Trommeln laden Patrone für Patrone.
 * `reserve` = Patronen, die der Spieler dabei hat.
 */
export function reload(state: GunState, def: FirearmDef, reserve: number): ReloadResult {
  const free = def.mag - state.loaded;
  const take = Math.max(0, Math.min(free, reserve));
  if (take === 0) return { loaded: state.loaded, used: 0, time: 0 };
  const perRound = !def.magItem; // Röhre/Trommel/Lauf
  return { loaded: state.loaded + take, used: take, time: perRound ? def.reload * (def.mode === 'revolver' ? 1 : take) : def.reload };
}
