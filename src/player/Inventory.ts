import { CATEGORY_ORDER, EquipSlot, ItemDef, Stack, hasTag, item } from '../data/items';

export const EQUIP_SLOTS: EquipSlot[] = ['head', 'body', 'legs', 'feet', 'back', 'hand'];
export const HOTBAR_SIZE = 5;

/** Körper (Taschen), der getragene Rucksack oder dessen Seitentaschen */
export type Where = 'main' | 'bag' | 'side';
export const WHERES: Where[] = ['main', 'bag', 'side'];

export type Result = { ok: true } | { ok: false; reason: string };
const ok: Result = { ok: true };
const fail = (reason: string): Result => ({ ok: false, reason });

const EPS = 1e-9;
const r2 = (x: number): number => Math.round(x * 100) / 100;

interface State {
  main: Stack[];
  bag: Stack[];
  side: Stack[];
  equipment: Record<EquipSlot, string | null>;
}

/**
 * Inventar ohne Platzraster: drei Behälter (Körpertaschen, Rucksack, Seitentaschen des Rucksacks), nur durch Gewicht begrenzt.
 * Der Rucksack fasst `capacity` kg, die Seitentaschen `side` kg; der Inhalt zählt um `reduce` leichter gegen die Tragkraft des Körpers.
 */
export class Inventory {
  private lists: Record<Where, Stack[]> = { main: [], bag: [], side: [] };
  readonly equipment: Record<EquipSlot, string | null> = { head: null, body: null, legs: null, feet: null, back: null, hand: null };
  /** Schnellleiste (Tasten 1–5): gebundene Item-IDs */
  readonly hotbar: (string | null)[] = Array(HOTBAR_SIZE).fill(null);

  /** Fassungsvermögen der Körpertaschen in kg; undefiniert = so viel wie die Tragkraft (das Spiel setzt 0: Kleidung hat keine Taschen) */
  pockets: number | undefined;
  /** Seitentaschen hat man immer: mindestens so viele kg (ein Rucksack kann mehr bringen) */
  sideMin = 0;

  /** `carryLimit`: Tragkraft des Körpers in kg (auch das Limit für alles, was er insgesamt trägt) */
  constructor(public carryLimit = 14) {}

  // --- Behälter ------------------------------------------------------------------

  list(w: Where): Stack[] {
    return this.lists[w];
  }

  private get bagDef(): ItemDef | null {
    const id = this.equipment.back;
    return id && item(id).equip?.capacity ? item(id) : null;
  }

  get hasBag(): boolean {
    return this.bagDef !== null;
  }

  get bagName(): string | null {
    return this.bagDef?.name ?? null;
  }

  /** Fassungsvermögen in kg; ohne Rucksack hat der Rucksack-Behälter keinen Platz. */
  capacity(w: Where): number {
    if (w === 'main') return this.pockets ?? this.carryLimit;
    if (w === 'side') return Math.max(this.sideMin, this.bagDef?.equip?.side ?? 0);
    return this.bagDef?.equip?.capacity ?? 0;
  }

  /** Anteil des Gewichts, der gegen die Tragkraft zählt */
  private factor(w: Where): number {
    return w === 'main' ? 1 : 1 - (this.bagDef?.equip?.reduce ?? 0);
  }

  /** Echtes Gewicht eines Behälters in kg */
  rawWeight(w: Where): number {
    return r2(this.lists[w].reduce((s, st) => s + item(st.id).weight * st.qty, 0));
  }

  /** Alle Stacks: Körper, Rucksack, Seitentaschen */
  get stacks(): Stack[] {
    return [...this.lists.main, ...this.lists.bag, ...this.lists.side];
  }

  /** Gewicht, das gegen die Tragkraft zählt */
  get weight(): number {
    return r2(this.rawWeight('main') + (this.rawWeight('bag') + this.rawWeight('side')) * this.factor('bag'));
  }

  get maxWeight(): number {
    return this.carryLimit;
  }

  /** Bis 70 % Last normal, danach linear bis 0.7 bei voller Last */
  get speedFactor(): number {
    const load = this.weight / this.maxWeight;
    return load <= 0.7 ? 1 : Math.max(0.7, 1 - ((load - 0.7) / 0.3) * 0.3);
  }

  /** Summe des Kälteschutzes aller getragenen Teile (0..1) */
  get warmth(): number {
    return Math.min(0.8, Object.values(this.equipment).reduce((s, id) => s + (id ? item(id).equip?.warmth ?? 0 : 0), 0));
  }

  get hasLight(): boolean {
    const h = this.equipment.hand;
    return !!h && !!item(h).equip?.light;
  }

  // --- Abfragen ------------------------------------------------------------------

  count(id: string): number {
    return this.stacks.filter((s) => s.id === id).reduce((n, s) => n + s.qty, 0);
  }

  has(cost: Stack[]): boolean {
    return cost.every((c) => this.count(c.id) >= c.qty);
  }

  /** Erster Fundort eines Items (Körper vor Rucksack) */
  find(id: string): { where: Where; index: number } | null {
    for (const where of WHERES) {
      const index = this.lists[where].findIndex((s) => s.id === id);
      if (index >= 0) return { where, index };
    }
    return null;
  }

  /** Hat der Spieler ein Item mit diesem Tag (getragen oder eingepackt)? */
  hasTag(tag: string): boolean {
    return this.stacks.some((s) => hasTag(s.id, tag)) || Object.values(this.equipment).some((id) => !!id && hasTag(id, tag));
  }

  /** Wie viele Stück von `def` passen in `w` noch hinein (Behälter-Kapazität und Tragkraft)? */
  room(def: ItemDef, w: Where, extraWeight = 0): number {
    const cap = this.capacity(w);
    if (cap <= 0) return 0;
    const byBox = Math.floor((cap - this.rawWeight(w) - extraWeight + EPS) / def.weight);
    const byCarry = Math.floor((this.maxWeight - this.weight - extraWeight * this.factor(w) + EPS) / (def.weight * this.factor(w)));
    return Math.max(0, Math.min(byBox, byCarry));
  }

  // --- Hinzufügen / Entfernen ------------------------------------------------------

  /** Legt Items in einen bestimmten Behälter. Gibt die Menge zurück, die NICHT mehr hineinpasste. */
  addTo(w: Where, id: string, qty: number): number {
    const def = item(id);
    const list = this.lists[w];
    let left = qty;
    for (const s of list) {
      if (s.id !== id || left <= 0) continue;
      const n = Math.min(left, def.maxStack - s.qty, this.room(def, w));
      if (n > 0) {
        s.qty += n;
        left -= n;
      }
    }
    while (left > 0) {
      const n = Math.min(left, def.maxStack, this.room(def, w));
      if (n <= 0) break;
      list.push({ id, qty: n });
      left -= n;
    }
    return left;
  }

  /** Legt Items ab: zuerst in `prefer`, dann in den anderen Behälter. Gibt den Rest zurück. */
  add(id: string, qty: number, prefer: Where = 'main'): number {
    let left = this.addTo(prefer, id, qty);
    // sonst der Reihe nach in die übrigen Behälter (Körper, Rucksack, Seitentaschen)
    for (const w of WHERES) if (left > 0 && w !== prefer) left = this.addTo(w, id, left);
    return left;
  }

  /** Entfernt eine Menge aus dem Stack `index` des Behälters. */
  removeFrom(w: Where, index: number, qty = 1): boolean {
    const list = this.lists[w];
    const s = list[index];
    if (!s || s.qty < qty) return false;
    s.qty -= qty;
    if (s.qty === 0) list.splice(index, 1);
    return true;
  }

  /** Entfernt eine Menge aus dem n-ten Stack in `stacks` (Körper, dann Rucksack). */
  removeAt(index: number, qty = 1): boolean {
    let i = index;
    for (const w of WHERES) {
      const n = this.lists[w].length;
      if (i < n) return this.removeFrom(w, i, qty);
      i -= n;
    }
    return false;
  }

  /** Verschiebt bis zu `qty` Stück zwischen Körper und Rucksack. Gibt die tatsächlich verschobene Menge zurück. */
  move(from: Where, index: number, to: Where, qty?: number): number {
    const s = this.lists[from][index];
    if (!s || from === to) return 0;
    const want = Math.min(qty ?? s.qty, s.qty);
    const id = s.id;
    this.removeFrom(from, index, want);
    const left = this.addTo(to, id, want);
    if (left > 0) this.addTo(from, id, left); // passt nicht: zurücklegen
    return want - left;
  }

  /** Entfernt die Kosten über mehrere Stacks hinweg. false (und keine Änderung), wenn nicht genug da ist. */
  consume(cost: Stack[]): boolean {
    if (!this.has(cost)) return false;
    for (const c of cost) {
      let left = c.qty;
      for (const w of ['side', 'bag', 'main'] as Where[]) {
        const list = this.lists[w];
        for (let i = list.length - 1; i >= 0 && left > 0; i--) {
          if (list[i].id !== c.id) continue;
          const n = Math.min(left, list[i].qty);
          this.removeFrom(w, i, n);
          left -= n;
        }
      }
    }
    return true;
  }

  /** Würde `output` nach Abzug von `cost` noch hineinpassen? */
  canSwap(cost: Stack[], output: Stack): boolean {
    const t = this.clone();
    return t.consume(cost) && t.add(output.id, output.qty) === 0;
  }

  private clone(): Inventory {
    const t = new Inventory(this.carryLimit);
    t.pockets = this.pockets;
    t.sideMin = this.sideMin;
    t.restore(this.save());
    return t;
  }

  private save(): State {
    return {
      main: this.lists.main.map((s) => ({ ...s })),
      bag: this.lists.bag.map((s) => ({ ...s })),
      side: this.lists.side.map((s) => ({ ...s })),
      equipment: { ...this.equipment },
    };
  }

  private restore(st: State): void {
    this.lists.main = st.main.map((s) => ({ ...s }));
    this.lists.bag = st.bag.map((s) => ({ ...s }));
    this.lists.side = (st.side ?? []).map((s) => ({ ...s }));
    Object.assign(this.equipment, st.equipment);
  }

  /** Spielstand: Inhalt aller Behälter, Ausrüstung und Schnellleiste */
  toJSON(): State & { hotbar: (string | null)[] } {
    return { ...this.save(), hotbar: [...this.hotbar] };
  }

  fromJSON(j: Partial<State> & { hotbar?: (string | null)[] }): void {
    this.restore({
      main: j.main ?? [],
      bag: j.bag ?? [],
      side: j.side ?? [],
      equipment: { head: null, body: null, legs: null, feet: null, back: null, hand: null, ...(j.equipment ?? {}) },
    });
    for (let i = 0; i < this.hotbar.length; i++) this.hotbar[i] = j.hotbar?.[i] ?? null;
  }

  /** Gleiche Items zusammenführen, nach Kategorie und Name ordnen (ein Behälter oder beide). */
  sort(only?: Where): void {
    for (const w of only ? [only] : WHERES) {
      const merged = new Map<string, number>();
      for (const s of this.lists[w]) merged.set(s.id, (merged.get(s.id) ?? 0) + s.qty);
      const out: Stack[] = [];
      for (const [id, total] of merged) {
        let left = total;
        const max = item(id).maxStack;
        while (left > 0) {
          const n = Math.min(left, max);
          out.push({ id, qty: n });
          left -= n;
        }
      }
      out.sort((a, b) => {
        const da = item(a.id), db = item(b.id);
        return CATEGORY_ORDER.indexOf(da.category) - CATEGORY_ORDER.indexOf(db.category) || da.name.localeCompare(db.name);
      });
      this.lists[w] = out;
    }
  }

  // --- Ausrüstung --------------------------------------------------------------------

  /** Räumt nach einer Änderung auf: Rucksack-Inhalt, der nicht mehr hineinpasst, wandert in die Taschen. Sonst Fehler. */
  private settle(): boolean {
    const bag = this.lists.bag, side = this.lists.side;
    this.lists.bag = [];
    this.lists.side = [];
    for (const s of bag) if (this.add(s.id, s.qty, 'bag') > 0) return false;
    for (const s of side) if (this.add(s.id, s.qty, 'side') > 0) return false;
    return this.weight <= this.maxWeight + EPS;
  }

  /** Legt das Item aus `where`/`index` an; ein bereits getragenes Teil wandert in die Taschen. */
  equip(where: Where, index: number): Result {
    const s = this.lists[where][index];
    const e = s && item(s.id).equip;
    if (!s || !e) return fail('Das kann man nicht anziehen.');
    const before = this.save();
    const old = this.equipment[e.slot];
    this.removeFrom(where, index, 1);
    this.equipment[e.slot] = s.id;
    const failed = (reason: string): Result => {
      this.restore(before);
      return fail(reason);
    };
    if (e.slot === 'back' && !this.settle()) return failed('Der Inhalt passt nicht in den neuen Rucksack.');
    if (old && this.add(old, 1, 'main') > 0) return failed('Dafür ist nicht genug Platz in Rucksack und Seitentaschen.');
    return ok;
  }

  /** Legt ein getragenes Teil ab und packt es in die Taschen. */
  unequip(slot: EquipSlot): Result {
    const id = this.equipment[slot];
    if (!id) return fail('Dort ist nichts.');
    const before = this.save();
    this.equipment[slot] = null;
    const failed = (reason: string): Result => {
      this.restore(before);
      return fail(reason);
    };
    if (slot === 'back' && !this.settle()) return failed('Dafür ist nicht genug Platz in den Seitentaschen.');
    if (this.add(id, 1, 'main') > 0) return failed('Dafür ist nicht genug Platz in Rucksack und Seitentaschen.');
    return ok;
  }

  /**
   * Alte Spielstände: Inhalt der Körpertaschen in Rucksack und Seitentaschen umräumen, wenn es keine Taschen mehr gibt.
   * Was nirgends hineinpasst, wird zurückgegeben (der Aufrufer legt es auf den Boden).
   */
  rehome(): Stack[] {
    if (this.capacity('main') > 0) return [];
    const old = this.lists.main;
    this.lists.main = [];
    const rest: Stack[] = [];
    for (const s of old) {
      const left = this.add(s.id, s.qty, 'bag');
      if (left > 0) rest.push({ id: s.id, qty: left });
    }
    return rest;
  }

  /** Startausrüstung direkt anlegen (ohne Inventar-Umweg). */
  wear(id: string): void {
    const e = item(id).equip;
    if (e) this.equipment[e.slot] = id;
  }
}
