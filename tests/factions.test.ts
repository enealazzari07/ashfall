import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { COIN, item } from '../src/data/items';
import { FactionWorld, TRIBUTE_COST } from '../src/factions/FactionWorld';
import { Npc, NpcContext } from '../src/factions/Npc';
import { moodOf, priceMod, repLabel } from '../src/factions/Reputation';
import { buyPrice, sellPrice } from '../src/factions/Trade';
import { Inventory } from '../src/player/Inventory';

const seeded = () => {
  let i = 0;
  return () => ((i = (i * 9301 + 49297) % 233280) / 233280 + 0.0001) % 1;
};
const fresh = () => ({ w: new FactionWorld(seeded()), inv: new Inventory(40) });

describe('Ruf', () => {
  it('benennt Stufen und Stimmung', () => {
    expect(repLabel(-70)).toBe('Todfeind');
    expect(repLabel(-30)).toBe('Feindlich');
    expect(repLabel(0)).toBe('Misstrauisch');
    expect(repLabel(20)).toBe('Neutral');
    expect(repLabel(65)).toBe('Vertraut');
    expect(moodOf(-30)).toBe('hostile');
    expect(moodOf(45)).toBe('friendly');
  });

  it('Preisfaktor sinkt mit besserem Ruf, bleibt begrenzt', () => {
    expect(priceMod(-10)).toBeCloseTo(1.25);
    expect(priceMod(100)).toBe(0.85);
    expect(priceMod(0)).toBeGreaterThan(priceMod(50));
  });

  it('Kaufpreis > Verkaufspreis, Verbündete zahlen weniger', () => {
    const d = item('bandage');
    expect(buyPrice(d, 20, false)).toBeGreaterThan(sellPrice(d, 20, false));
    expect(buyPrice(d, 20, true)).toBeLessThan(buyPrice(d, 20, false));
    expect(sellPrice(d, 20, true)).toBeGreaterThan(sellPrice(d, 20, false));
  });
});

describe('Handel', () => {
  it('Kaufen kostet Münzen, liefert die Ware und füllt die Kasse', () => {
    const { w, inv } = fresh();
    inv.add(COIN, 50);
    const before = w.state('traders').coins;
    const r = w.buy('traders', inv, 'bandage');
    expect(r.ok).toBe(true);
    expect(inv.count('bandage')).toBe(1);
    expect(inv.count(COIN)).toBeLessThan(50);
    expect(w.state('traders').coins).toBeGreaterThan(before);
  });

  it('ohne Geld kein Kauf', () => {
    const { w, inv } = fresh();
    expect(w.buy('traders', inv, 'bandage').ok).toBe(false);
  });

  it('Verkaufen bringt Münzen, Gesuchtes mehr', () => {
    const { w, inv } = fresh();
    inv.add('wood', 1);
    inv.add('apple', 1);
    expect(w.sellValue('traders', 'wood')).toBeGreaterThan(Math.floor(item('wood').value * 0.6));
    const r = w.sell('traders', inv, inv.stacks.findIndex((s) => s.id === 'wood'));
    expect(r.ok).toBe(true);
    expect(inv.count(COIN)).toBeGreaterThan(0);
    expect(inv.count('wood')).toBe(0);
  });

  it('Feindliche Fraktion handelt nicht', () => {
    const { w, inv } = fresh();
    inv.add(COIN, 100);
    expect(w.canTrade('raiders').ok).toBe(false);
    expect(w.buy('raiders', inv, 'beans').ok).toBe(false);
  });

  it('Geschenk erhöht den Ruf', () => {
    const { w, inv } = fresh();
    inv.add('bandage', 1);
    const rep = w.state('farmers').rep;
    expect(w.gift('farmers', inv, 0).ok).toBe(true);
    expect(w.state('farmers').rep).toBeGreaterThan(rep);
  });
});

describe('Diplomatie', () => {
  it('Tribut kauft Ruhe vor den Plünderern', () => {
    const { w, inv } = fresh();
    inv.add(COIN, TRIBUTE_COST);
    expect(w.isHostile('raiders', 1)).toBe(true);
    expect(w.payTribute('raiders', inv, 1).ok).toBe(true);
    expect(w.isHostile('raiders', 1)).toBe(false);
    expect(w.isHostile('raiders', 2)).toBe(false);
    expect(w.isHostile('raiders', 3)).toBe(w.state('raiders').rep < -10); // Schutz abgelaufen
  });

  it('Tribut ohne Münzen scheitert', () => {
    const { w, inv } = fresh();
    expect(w.payTribute('raiders', inv, 1).ok).toBe(false);
  });

  it('Bündnis erst ab genug Ansehen', () => {
    const { w } = fresh();
    expect(w.proposeAlliance('traders').ok).toBe(false);
    w.changeRep('traders', 60);
    expect(w.proposeAlliance('traders').ok).toBe(true);
    expect(w.state('traders').allied).toBe(true);
  });

  it('Auftrag: Ware abgeben gibt Münzen und Ruf', () => {
    const { w, inv } = fresh();
    w.state('farmers').request = { itemId: 'bandage', qty: 2, coins: 25, rep: 10, expires: 5 };
    expect(w.canTurnIn('farmers', inv)).toBe(false);
    inv.add('bandage', 2);
    expect(w.canTurnIn('farmers', inv)).toBe(true);
    const rep = w.state('farmers').rep;
    expect(w.turnInRequest('farmers', inv).ok).toBe(true);
    expect(inv.count(COIN)).toBe(25);
    expect(inv.count('bandage')).toBe(0);
    expect(w.state('farmers').rep).toBe(rep + 10);
    expect(w.state('farmers').request).toBeNull();
  });
});

describe('Tageslauf', () => {
  it('füllt Vorräte auf und meldet Geschenke Verbündeter', () => {
    const { w } = fresh();
    w.state('traders').allied = true;
    w.state('traders').stock = [];
    const out = w.dailyTick(2);
    expect(w.state('traders').stock.length).toBeGreaterThan(0);
    expect(out.gifts.some((g) => g.faction === 'traders')).toBe(true);
  });

  it('Ruf driftet zur Grundhaltung zurück', () => {
    const { w } = fresh();
    w.changeRep('raiders', 20); // -10
    w.dailyTick(2);
    expect(w.state('raiders').rep).toBeLessThan(-10);
  });

  it('Raid-Trupp und Karawane werden erzeugt', () => {
    const { w } = fresh();
    const before = w.npcs.length;
    const raiders = w.spawnRaid(new Vector3(0, 0, 0), 2);
    expect(raiders.every((n) => n.state === 'chase')).toBe(true);
    w.spawnCaravan(new Vector3(0, 0, 0));
    expect(w.npcs.length).toBe(before + 3);
  });
});

describe('NPC-KI', () => {
  const ctx = (player: Vector3, onRob = () => {}): NpcContext => ({
    player, resolve: () => {}, onRob, rand: seeded(),
  });
  const wolf = () => new Npc(1, new FactionWorld(seeded()).def('raiders'), 'Kai', 0, 0);

  it('Plünderer holt den Spieler ein und raubt ihn aus', () => {
    const n = wolf();
    n.startChase();
    let robbed = 0;
    const c = ctx(new Vector3(6, 0, 0), () => robbed++);
    for (let i = 0; i < 600 && n.state === 'chase'; i++) n.update(1 / 60, c);
    expect(robbed).toBe(1);
    expect(n.state).toBe('retreat');
  });

  it('Sprintender Spieler (6.5 m/s) entkommt', () => {
    const n = wolf();
    n.startChase();
    const player = new Vector3(6, 0, 0);
    let robbed = 0;
    for (let i = 0; i < 60 * 12; i++) {
      player.x += (6.5 / 60);
      n.update(1 / 60, ctx(player, () => robbed++));
    }
    expect(robbed).toBe(0);
  });

  it('Im Gespräch bleibt der NPC stehen', () => {
    const n = wolf();
    n.startChase();
    n.startTalk(new Vector3(3, 0, 0));
    const x = n.position.x;
    for (let i = 0; i < 120; i++) n.update(1 / 60, ctx(new Vector3(3, 0, 0)));
    expect(n.position.x).toBe(x);
    n.endTalk();
    expect(n.state).toBe('wander');
  });
});
