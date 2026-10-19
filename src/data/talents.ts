/**
 * Talentbaum: Jede Charakterstufe bringt Talentpunkte. Talente schalten Rezepte frei (Herstellen und Bauen zeigt nur,
 * was man kennt) oder geben dauerhafte Vorteile. Jeder Zweig entspricht einem Beruf; ein Talent braucht seine Vorgänger.
 */
export type BranchId = 'carpenter' | 'mechanic' | 'medic' | 'tailor' | 'fighter' | 'survivor';

export interface Perk {
  /** Faktor auf die Bauzeit (kleiner = schneller) */
  build?: number;
  /** Faktor auf die Arbeitszeit am Auto */
  mechTime?: number;
  /** Faktor auf die Reparaturleistung */
  repair?: number;
  /** Faktor auf die Behandlungsdauer */
  treat?: number;
  /** Zusätzliche Tragkraft in kg */
  carry?: number;
  /** Faktor auf den Nahkampfschaden */
  melee?: number;
}

export interface TalentDef {
  id: string;
  branch: BranchId;
  name: string;
  desc: string;
  /** Talentpunkte */
  cost: number;
  /** Vorgänger (alle nötig) */
  requires?: string[];
  /** Rezept-Ids (siehe data/recipes.ts), die das Talent freischaltet */
  recipes?: string[];
  perk?: Perk;
  /** Spalte und Reihe im Baum (Reihe 0 = Wurzel) */
  col: number;
  row: number;
}

export interface BranchDef {
  id: BranchId;
  name: string;
  /** Kurzer Hinweis, wofür der Zweig gut ist */
  blurb: string;
  color: string;
}

export const BRANCHES: BranchDef[] = [
  { id: 'carpenter', name: 'Tischler', blurb: 'Möbel, Betten und Verteidigung bauen', color: '#c89a5a' },
  { id: 'mechanic', name: 'Mechaniker', blurb: 'Werkzeug, Brecheisen und Autoreparatur', color: '#7fa3c9' },
  { id: 'medic', name: 'Sanitäter', blurb: 'Wunden versorgen, Nähen und Desinfizieren', color: '#e07a7a' },
  { id: 'tailor', name: 'Schneider', blurb: 'Kleidung und Rucksäcke nähen', color: '#b08ad0' },
  { id: 'fighter', name: 'Kämpfer', blurb: 'Nahkampfwaffen selbst herstellen', color: '#d8a24a' },
  { id: 'survivor', name: 'Überlebender', blurb: 'Allgemeine Vorteile', color: '#7fb08a' },
];

export const TALENTS: TalentDef[] = [
  // Tischler
  { id: 'carp_furniture', branch: 'carpenter', name: 'Möbelbau', desc: 'Tisch, Kiste und Zaun', cost: 1, recipes: ['piece_table', 'piece_crate', 'piece_fence'], col: 1, row: 0 },
  { id: 'carp_bed', branch: 'carpenter', name: 'Schlafplatz', desc: 'Bett', cost: 1, requires: ['carp_furniture'], recipes: ['piece_bed'], col: 0, row: 1 },
  { id: 'carp_defense', branch: 'carpenter', name: 'Verteidigung', desc: 'Barrikade, Fensterwand und Fensterbarrikade', cost: 2, requires: ['carp_furniture'], recipes: ['piece_barricade', 'piece_windowwall', 'piece_windowbar'], col: 1, row: 1 },
  { id: 'carp_storage', branch: 'carpenter', name: 'Lagerbau', desc: 'Regal und Schrank', cost: 2, requires: ['carp_furniture'], recipes: ['piece_shelf', 'piece_cabinet'], col: 2, row: 1 },
  { id: 'carp_fast', branch: 'carpenter', name: 'Zügig bauen', desc: 'Bauzeit −15 %', cost: 2, requires: ['carp_defense'], perk: { build: 0.85 }, col: 1, row: 2 },

  // Mechaniker
  { id: 'mech_pick', branch: 'mechanic', name: 'Dietriche', desc: 'Dietriche aus Schrott', cost: 1, recipes: ['lockpick'], col: 0, row: 0 },
  { id: 'mech_tools', branch: 'mechanic', name: 'Werkzeugbau', desc: 'Werkzeugkasten', cost: 1, recipes: ['toolbox'], col: 1, row: 0 },
  { id: 'mech_iron', branch: 'mechanic', name: 'Eisenwaren', desc: 'Brecheisen und Eisenrohr', cost: 2, requires: ['mech_tools'], recipes: ['crowbar', 'pipe'], col: 1, row: 1 },
  { id: 'mech_sledge', branch: 'mechanic', name: 'Schwere Arbeit', desc: 'Vorschlaghammer', cost: 2, requires: ['mech_iron'], recipes: ['sledgehammer'], col: 1, row: 2 },
  { id: 'mech_repair', branch: 'mechanic', name: 'Schrauber', desc: 'Reparaturen am Auto +20 %, Arbeitszeit −10 %', cost: 2, requires: ['mech_tools'], perk: { repair: 1.2, mechTime: 0.9 }, col: 2, row: 1 },

  // Sanitäter
  { id: 'med_suture', branch: 'medic', name: 'Nähen', desc: 'Nähset', cost: 1, recipes: ['suture'], col: 0, row: 0 },
  { id: 'med_disinfect', branch: 'medic', name: 'Hygiene', desc: 'Desinfektionsmittel', cost: 1, recipes: ['disinfectant'], col: 2, row: 0 },
  { id: 'med_speed', branch: 'medic', name: 'Ruhige Hand', desc: 'Behandlungen dauern 20 % kürzer', cost: 2, requires: ['med_suture', 'med_disinfect'], perk: { treat: 0.8 }, col: 1, row: 1 },

  // Schneider
  { id: 'tail_hat', branch: 'tailor', name: 'Kopfbedeckung', desc: 'Wollmütze und Basecap', cost: 1, recipes: ['beanie', 'cap'], col: 1, row: 0 },
  { id: 'tail_warm', branch: 'tailor', name: 'Warme Kleidung', desc: 'Kapuzenpulli und Strickpullover', cost: 2, requires: ['tail_hat'], recipes: ['hoodie', 'sweater'], col: 0, row: 1 },
  { id: 'tail_pants', branch: 'tailor', name: 'Hosen und Schuhe', desc: 'Jeans und Wanderstiefel', cost: 2, requires: ['tail_hat'], recipes: ['jeans', 'boots'], col: 1, row: 1 },
  { id: 'tail_pack1', branch: 'tailor', name: 'Rucksackbau', desc: 'Schulrucksack', cost: 2, requires: ['tail_hat'], recipes: ['schoolbag'], col: 2, row: 1 },
  { id: 'tail_coat', branch: 'tailor', name: 'Winterjacke', desc: 'Gefütterte Winterjacke', cost: 3, requires: ['tail_warm'], recipes: ['jacket'], col: 0, row: 2 },
  { id: 'tail_pack2', branch: 'tailor', name: 'Trekkingpacks', desc: 'Wanderrucksack', cost: 3, requires: ['tail_pack1'], recipes: ['hikingpack'], col: 2, row: 2 },

  // Kämpfer
  { id: 'fight_knife', branch: 'fighter', name: 'Klingenschmied', desc: 'Küchenmesser', cost: 1, recipes: ['knife'], col: 1, row: 0 },
  { id: 'fight_bat', branch: 'fighter', name: 'Knüppel', desc: 'Baseballschläger', cost: 1, requires: ['fight_knife'], recipes: ['bat'], col: 1, row: 1 },
  { id: 'fight_axe', branch: 'fighter', name: 'Schwere Waffen', desc: 'Axt und Machete', cost: 2, requires: ['fight_bat'], recipes: ['axe', 'machete'], col: 1, row: 2 },
  { id: 'fight_power', branch: 'fighter', name: 'Wucht', desc: 'Nahkampfschaden +10 %', cost: 2, requires: ['fight_axe'], perk: { melee: 1.1 }, col: 1, row: 3 },

  // Überlebender
  { id: 'surv_carry1', branch: 'survivor', name: 'Gepäck', desc: 'Tragkraft +3 kg', cost: 1, perk: { carry: 3 }, col: 1, row: 0 },
  { id: 'surv_carry2', branch: 'survivor', name: 'Lastenträger', desc: 'Tragkraft +4 kg', cost: 2, requires: ['surv_carry1'], perk: { carry: 4 }, col: 1, row: 1 },
];

export const talent = (id: string): TalentDef | undefined => TALENTS.find((t) => t.id === id);

/** Talentpunkte, die man auf Stufe `level` insgesamt bekommen hat: 1 je Stufe, dazu 2 Bonus alle 5 Stufen */
export const pointsForLevel = (level: number): number => Math.max(0, level - 1) + 2 * Math.floor(level / 5);
