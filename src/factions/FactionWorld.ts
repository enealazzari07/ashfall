import * as THREE from 'three';
import { COIN, Stack, item } from '../data/items';
import { FACTIONS, FactionDef, FactionId, factionDef } from '../data/factions';
import { Inventory } from '../player/Inventory';
import { CHUNK } from '../world/CityGenerator';
import type { Vision } from '../render/Vision';
import { Npc, NpcContext } from './Npc';
import { ALLY_MIN, TRADE_MIN, clampRep, moodOf } from './Reputation';
import { buyPrice, sellPrice } from './Trade';

export interface Request {
  itemId: string;
  qty: number;
  coins: number;
  rep: number;
  expires: number; // Tag
}

export interface FactionState {
  id: FactionId;
  rep: number;
  stock: Stack[];
  coins: number;
  allied: boolean;
  /** Plünderer lassen den Spieler bis zu diesem Tag (ausschließlich) in Ruhe */
  protectedUntil: number;
  request: Request | null;
}

export interface Result {
  ok: boolean;
  msg: string;
}

export interface DailyOutcome {
  gifts: { faction: FactionId; stacks: Stack[] }[];
  raid: boolean;
  caravan: boolean;
}

export const TRIBUTE_COST = 25;
const STOCK_CAP = 12;
const COIN_CAP = 250;

const fail = (msg: string): Result => ({ ok: false, msg });
const done = (msg: string): Result => ({ ok: true, msg });

export function campCenter(def: FactionDef): { x: number; z: number } {
  return { x: def.camp.cx * CHUNK + 4, z: def.camp.cz * CHUNK + 4 };
}

export class FactionWorld {
  readonly group = new THREE.Group();
  readonly states = {} as Record<FactionId, FactionState>;
  npcs: Npc[] = [];
  /** Gerüchte und Nachrichten, neueste zuerst */
  log: string[] = [];
  private nextId = 1;

  constructor(private rand: () => number = Math.random) {
    for (const f of FACTIONS) {
      this.states[f.id] = {
        id: f.id,
        rep: f.baseRep,
        stock: f.stock.map((s) => ({ ...s })),
        coins: f.coins,
        allied: false,
        protectedUntil: 0,
        request: null,
      };
      const c = campCenter(f);
      const n = f.id === 'raiders' ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.5;
        this.spawn(f.id, c.x + Math.cos(a) * 2.4, c.z + Math.sin(a) * 2.4);
      }
    }
  }

  state(id: FactionId): FactionState {
    return this.states[id];
  }

  def(id: FactionId): FactionDef {
    return factionDef(id);
  }

  private spawn(id: FactionId, x: number, z: number, ttl = Infinity): Npc {
    const def = factionDef(id);
    const name = def.names[Math.floor(this.rand() * def.names.length)];
    const npc = new Npc(this.nextId++, def, name, x, z);
    npc.ttl = ttl;
    this.npcs.push(npc);
    this.group.add(npc.mesh);
    return npc;
  }

  private say(msg: string): void {
    this.log.unshift(msg);
    this.log.length = Math.min(this.log.length, 8);
  }

  // --- Beziehung ---------------------------------------------------------------

  changeRep(id: FactionId, delta: number): void {
    const s = this.states[id];
    s.rep = clampRep(s.rep + delta);
  }

  greeting(id: FactionId): string {
    return factionDef(id).greet[moodOf(this.states[id].rep)];
  }

  /** Greifen Plünderer den Spieler gerade an? */
  isHostile(id: FactionId, day: number): boolean {
    const s = this.states[id];
    return id === 'raiders' && s.rep < TRADE_MIN && day >= s.protectedUntil && !s.allied;
  }

  // --- Handel ------------------------------------------------------------------

  canTrade(id: FactionId): Result {
    return this.states[id].rep >= TRADE_MIN ? done('') : fail('Sie wollen nicht mit dir handeln. Bessere erst dein Ansehen.');
  }

  offers(id: FactionId): { itemId: string; qty: number; price: number }[] {
    const s = this.states[id];
    return s.stock.filter((x) => x.qty > 0).map((x) => ({ itemId: x.id, qty: x.qty, price: buyPrice(item(x.id), s.rep, s.allied) }));
  }

  sellValue(id: FactionId, itemId: string): number {
    const s = this.states[id];
    return sellPrice(item(itemId), s.rep, factionDef(id).wants.includes(itemId));
  }

  buy(id: FactionId, inv: Inventory, itemId: string): Result {
    const t = this.canTrade(id);
    if (!t.ok) return t;
    const s = this.states[id];
    const slot = s.stock.find((x) => x.id === itemId && x.qty > 0);
    if (!slot) return fail('Ausverkauft.');
    const price = buyPrice(item(itemId), s.rep, s.allied);
    if (inv.count(COIN) < price) return fail('Du hast nicht genug Münzen.');
    if (!inv.canSwap([{ id: COIN, qty: price }], { id: itemId, qty: 1 })) return fail('Kein Platz im Rucksack.');
    inv.consume([{ id: COIN, qty: price }]);
    inv.add(itemId, 1);
    slot.qty--;
    s.coins = Math.min(COIN_CAP, s.coins + price);
    this.changeRep(id, price / 40);
    return done(`${item(itemId).name} gekauft (−${price} Münzen)`);
  }

  sell(id: FactionId, inv: Inventory, index: number): Result {
    const t = this.canTrade(id);
    if (!t.ok) return t;
    const st = inv.stacks[index];
    if (!st || st.id === COIN) return fail('Das kann man nicht verkaufen.');
    const s = this.states[id];
    const price = this.sellValue(id, st.id);
    if (s.coins < price) return fail('Sie können sich das gerade nicht leisten.');
    const itemId = st.id;
    inv.removeAt(index, 1);
    inv.add(COIN, price);
    s.coins -= price;
    this.addStock(s, itemId, 1);
    this.changeRep(id, price / 60);
    return done(`${item(itemId).name} verkauft (+${price} Münzen)`);
  }

  gift(id: FactionId, inv: Inventory, index: number): Result {
    const st = inv.stacks[index];
    if (!st || st.id === COIN) return fail('Das kannst du nicht verschenken.');
    const itemId = st.id;
    const wanted = factionDef(id).wants.includes(itemId);
    const gain = Math.max(1, Math.round((item(itemId).value / 3) * (wanted ? 1.6 : 1)));
    inv.removeAt(index, 1);
    this.addStock(this.states[id], itemId, 1);
    this.changeRep(id, gain);
    return done(`${item(itemId).name} geschenkt (+${gain} Ansehen)`);
  }

  /** Beute, die Plünderer dem Spieler abgenommen haben, landet in ihrem Lager. */
  receiveLoot(itemId: string, qty: number): void {
    this.addStock(this.states.raiders, itemId, qty);
  }

  private addStock(s: FactionState, itemId: string, qty: number): void {
    const slot = s.stock.find((x) => x.id === itemId);
    if (slot) slot.qty = Math.min(STOCK_CAP + 6, slot.qty + qty);
    else s.stock.push({ id: itemId, qty });
  }

  // --- Diplomatie --------------------------------------------------------------

  /** Tribut (Plünderer) bzw. Spende (andere): kauft Ansehen und bei Plünderern 2 Tage Ruhe. */
  payTribute(id: FactionId, inv: Inventory, day: number): Result {
    if (!inv.consume([{ id: COIN, qty: TRIBUTE_COST }])) return fail(`Dafür brauchst du ${TRIBUTE_COST} Münzen.`);
    const s = this.states[id];
    s.coins = Math.min(COIN_CAP, s.coins + TRIBUTE_COST);
    if (id === 'raiders') {
      this.changeRep(id, 12);
      s.protectedUntil = day + 2;
      return done('Die Aschewölfe nehmen den Tribut. Sie lassen dich 2 Tage in Ruhe.');
    }
    this.changeRep(id, 8);
    return done('Deine Spende wird dankbar angenommen. (+8 Ansehen)');
  }

  canTurnIn(id: FactionId, inv: Inventory): boolean {
    const r = this.states[id].request;
    return !!r && inv.has([{ id: r.itemId, qty: r.qty }]);
  }

  turnInRequest(id: FactionId, inv: Inventory): Result {
    const s = this.states[id];
    const r = s.request;
    if (!r) return fail('Es gibt keinen Auftrag.');
    if (!inv.canSwap([{ id: r.itemId, qty: r.qty }], { id: COIN, qty: r.coins })) return fail('Dir fehlt das Material (oder Platz für die Belohnung).');
    inv.consume([{ id: r.itemId, qty: r.qty }]);
    inv.add(COIN, r.coins);
    this.changeRep(id, r.rep);
    s.request = null;
    return done(`Auftrag erfüllt: +${r.coins} Münzen, +${r.rep} Ansehen.`);
  }

  proposeAlliance(id: FactionId): Result {
    const s = this.states[id];
    if (s.allied) return fail('Ihr seid bereits verbündet.');
    if (s.rep < ALLY_MIN) return fail(`Ein Bündnis setzt ${ALLY_MIN} Ansehen voraus.`);
    s.allied = true;
    this.say(`Du bist jetzt mit ${factionDef(id).name} verbündet.`);
    return done(`Bündnis geschlossen! ${factionDef(id).name} gibt dir Rabatt und schickt täglich Vorräte.`);
  }

  // --- Tageslauf & Ereignisse --------------------------------------------------

  /** Einmal pro Spieltag (um Mitternacht). */
  dailyTick(day: number): DailyOutcome {
    const out: DailyOutcome = { gifts: [], raid: false, caravan: false };

    for (const f of FACTIONS) {
      const s = this.states[f.id];
      for (const p of f.production) this.addStock(s, p.id, p.qty);
      for (const x of s.stock) x.qty = Math.min(x.qty, STOCK_CAP);
      s.coins = Math.min(COIN_CAP, s.coins + 8);
      // Ansehen driftet langsam zurück (Tribut-Frieden verfällt, Groll auch)
      if (!s.allied) s.rep += Math.sign(f.baseRep - s.rep) * Math.min(1, Math.abs(f.baseRep - s.rep));

      if (s.request && day > s.request.expires) s.request = null;
      if (!s.request && f.requests.length && this.rand() < 0.5) {
        const r = f.requests[Math.floor(this.rand() * f.requests.length)];
        s.request = { ...r, expires: day + 3 };
        this.say(`${f.name} sucht ${r.qty}× ${item(r.itemId).name} (Belohnung ${r.coins} Münzen).`);
      }
      if (s.allied) out.gifts.push({ faction: f.id, stacks: f.gift.map((g) => ({ ...g })) });
    }

    // Die Aschewölfe überfallen manchmal die Kommune – das verschiebt das Gleichgewicht.
    if (this.rand() < 0.25) {
      const farm = this.states.farmers, wolves = this.states.raiders;
      for (const x of farm.stock) {
        const loss = Math.floor(x.qty / 2);
        x.qty -= loss;
        this.addStock(wolves, x.id, loss);
      }
      this.say('Gerücht: Die Aschewölfe haben Grünhof geplündert. Dort wird das Essen knapp.');
    }

    out.raid = this.isHostile('raiders', day) && this.rand() < 0.45;
    out.caravan = this.states.traders.rep >= TRADE_MIN && this.rand() < 0.3;
    return out;
  }

  /** Plünderer-Trupp, der den Spieler verfolgt. */
  spawnRaid(near: THREE.Vector3, count = 2): Npc[] {
    const list: Npc[] = [];
    for (let i = 0; i < count; i++) {
      const a = this.rand() * Math.PI * 2;
      const npc = this.spawn('raiders', near.x + Math.cos(a) * 30, near.z + Math.sin(a) * 30, 8);
      npc.startChase();
      list.push(npc);
    }
    this.say('Ein Trupp Aschewölfe ist auf der Jagd nach Beute.');
    return list;
  }

  /** Händler, der in die Nähe des Spielers kommt und dort eine Weile bleibt. */
  spawnCaravan(near: THREE.Vector3): Npc {
    const a = this.rand() * Math.PI * 2;
    const npc = this.spawn('traders', near.x + Math.cos(a) * 28, near.z + Math.sin(a) * 28, 6);
    npc.travelTo(near.x + Math.cos(a + 1) * 5, near.z + Math.sin(a + 1) * 5);
    this.say('Eine Handelskarawane zieht durch die Gegend.');
    return npc;
  }

  nearestNpc(p: THREE.Vector3, range: number): Npc | null {
    let best: Npc | null = null;
    let bd = range;
    for (const n of this.npcs) {
      const d = n.distanceTo(p);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  /** Nur NPCs im Sichtfeld sind zu sehen (wer im Gespräch ist, bleibt sichtbar) */
  applyVision(v: Vision): void {
    for (const n of this.npcs) {
      if (n.mesh.visible && v.enabled && n.state !== 'talk') n.mesh.visible = v.sees(n.mesh.position.x, n.mesh.position.z);
    }
  }

  update(
    dt: number,
    hours: number,
    day: number,
    ctx: Omit<NpcContext, 'rand'> & { onWarn: (npc: Npc) => void },
  ): void {
    const full: NpcContext = { ...ctx, rand: this.rand };
    for (const n of [...this.npcs]) {
      n.ttl -= hours;
      if (n.ttl <= 0 && n.state !== 'talk') {
        this.group.remove(n.mesh);
        this.npcs = this.npcs.filter((x) => x !== n);
        continue;
      }
      n.mesh.visible = n.distanceTo(ctx.player) < 90;

      const d = n.distanceTo(ctx.player);
      if (n.def.id === 'raiders' && (n.state === 'wander' || n.state === 'travel') && d < 22 && this.isHostile('raiders', day)) {
        n.startChase();
      }
      if (n.state === 'chase' && !n.warned && d < 18) {
        n.warned = true;
        ctx.onWarn(n);
      }
      n.update(dt, full);
    }
  }
}
