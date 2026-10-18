import { describe, expect, it } from 'vitest';
import { COMFORT_AIR, Env, Thermo, ZONES, ZONE_WEIGHT, gearFrom } from '../src/sim/Thermo';
import { Mood, MoodInput } from '../src/sim/Mood';
import { BEDS, estimateRecovery, suggestedSleepHours } from '../src/data/beds';
import { Needs } from '../src/player/Needs';
import { Inventory } from '../src/player/Inventory';
import { levelById } from '../src/data/moodles';

const bare = gearFrom({ head: null, body: null, legs: null, feet: null, back: null, hand: null });
const winter = gearFrom({ head: 'beanie', body: 'jacket', legs: 'jeans', feet: 'boots', back: null, hand: null });
const env = (o: Partial<Env> = {}): Env => ({ air: 8, outdoors: true, wind: 0, rain: 0, fire: false, activity: 0, ...o });
const settle = (t: Thermo, e: Env, g = bare, hours = 12) => {
  for (let i = 0; i < hours * 4; i++) t.update(0.25, e, g);
  return t;
};

describe('Ausrüstung → Zonen', () => {
  it('Kleidungsstücke bedecken ihre Zonen, Rucksack und Hand keine', () => {
    const g = gearFrom({ head: null, body: 'hoodie', legs: null, feet: null, back: 'schoolbag', hand: 'flashlight' });
    expect(g.insulation.torso).toBeCloseTo(0.18);
    expect(g.insulation.arms).toBeCloseTo(0.18);
    expect(g.insulation.head).toBe(0);
    expect(g.insulation.hands).toBe(0);
  });

  it('Jacke schützt besser vor Wind und Regen als ein Pulli', () => {
    const j = gearFrom({ head: null, body: 'jacket', legs: null, feet: null, back: null, hand: null });
    const h = gearFrom({ head: null, body: 'hoodie', legs: null, feet: null, back: null, hand: null });
    expect(j.windproof.torso).toBeGreaterThan(h.windproof.torso);
    expect(j.rainproof.torso).toBeGreaterThan(h.rainproof.torso);
    expect(j.insulation.torso).toBeGreaterThan(h.insulation.torso);
  });

  it('Zonengewichte ergeben 1', () => {
    expect(ZONES.reduce((s, z) => s + ZONE_WEIGHT[z], 0)).toBeCloseTo(1);
  });
});

describe('Körpertemperatur', () => {
  it('bleibt bei angenehmer Luft bei 33 °C', () => {
    const t = settle(new Thermo(), env({ air: COMFORT_AIR }));
    for (const z of ZONES) expect(t.skin[z]).toBeCloseTo(33, 1);
    expect(t.cold).toBe(0);
  });

  it('kühlt bei Kälte aus; Kleidung hält wärmer', () => {
    const a = settle(new Thermo(), env());
    const b = settle(new Thermo(), env(), winter);
    expect(a.cold).toBeGreaterThan(0.3);
    expect(b.skin.torso).toBeGreaterThan(a.skin.torso);
    expect(b.cold).toBeLessThan(a.cold);
  });

  it('nur bedeckte Zonen sind wärmer', () => {
    const t = settle(new Thermo(), env(), winter);
    expect(t.skin.torso).toBeGreaterThan(t.skin.hands);
    expect(t.coldest).toBe('hands');
  });

  it('Wind kühlt zusätzlich, aber nur draußen und weniger mit winddichter Kleidung', () => {
    const calm = settle(new Thermo(), env({ wind: 0 }));
    const windy = settle(new Thermo(), env({ wind: 5 }));
    const inside = settle(new Thermo(), env({ wind: 5, outdoors: false }));
    const proof = settle(new Thermo(), env({ wind: 5 }), winter);
    expect(windy.cold).toBeGreaterThan(calm.cold);
    expect(inside.cold).toBeCloseTo(calm.cold, 5);
    const noWind = settle(new Thermo(), env({ wind: 0 }), winter);
    expect(proof.cold - noWind.cold).toBeLessThan(windy.cold - calm.cold);
  });

  it('Anstrengung wärmt, Schlaf kühlt aus, kalter Boden auch', () => {
    const rest = settle(new Thermo(), env());
    const run = settle(new Thermo(), env({ activity: 1 }));
    expect(run.cold).toBeLessThan(rest.cold);
    const sleep = settle(new Thermo(), env({ sleeping: true }));
    const floor = settle(new Thermo(), env({ sleeping: true, floorChill: BEDS.floor.chill }));
    expect(sleep.cold).toBeGreaterThan(rest.cold);
    expect(floor.cold).toBeGreaterThan(sleep.cold);
  });

  it('erwärmt sich wieder, wenn es warm wird', () => {
    const t = settle(new Thermo(), env());
    const cold = t.meanSkin;
    settle(t, env({ air: COMFORT_AIR }), bare, 6);
    expect(t.meanSkin).toBeGreaterThan(cold + 3);
  });

  it('große Zeitschritte verhalten sich wie viele kleine', () => {
    const a = new Thermo(), b = new Thermo();
    a.update(8, env(), bare);
    for (let i = 0; i < 32; i++) b.update(0.25, env(), bare);
    expect(a.skin.torso).toBeCloseTo(b.skin.torso, 1);
  });
});

describe('Nässe', () => {
  it('Regen durchnässt ungeschützte Zonen, Regenschutz hält trocken', () => {
    const wet = new Thermo(), dry = new Thermo();
    for (let i = 0; i < 4; i++) {
      wet.update(0.25, env({ air: 14, rain: 1 }), bare);
      dry.update(0.25, env({ air: 14, rain: 1 }), winter);
    }
    expect(wet.wet.torso).toBeGreaterThan(70);
    expect(dry.wet.torso).toBeLessThan(wet.wet.torso * 0.6);
    expect(dry.wet.feet).toBeLessThan(dry.wet.hands); // Stiefel schützen die Füße besser als nichts die Hände
  });

  it('nasse Kleidung isoliert schlechter und kühlt stärker aus', () => {
    const dryT = settle(new Thermo(), env({ air: 12 }), winter, 8);
    const wetT = new Thermo();
    for (const z of ZONES) wetT.wet[z] = 100;
    settle(wetT, env({ air: 12, outdoors: false }), winter, 0.5);
    expect(wetT.skin.torso).toBeLessThan(dryT.skin.torso);
  });

  it('trocknet drinnen schneller als draußen und am Feuer am schnellsten', () => {
    const dryAfter = (e: Env) => {
      const t = new Thermo();
      for (const z of ZONES) t.wet[z] = 80;
      t.update(1, e, bare);
      return t.wet.torso;
    };
    const out = dryAfter(env({ air: 14 }));
    const inn = dryAfter(env({ air: 14, outdoors: false }));
    const fire = dryAfter(env({ air: 14, outdoors: false, fire: true }));
    expect(inn).toBeLessThan(out);
    expect(fire).toBeLessThan(inn);
  });
});

describe('Wärme des Körpers (Needs)', () => {
  it('wird über den Kälte-Index gesteuert', () => {
    const t = settle(new Thermo(), env());
    const n = new Needs();
    n.update(5, { sprinting: false, cold: t.cold });
    expect(n.values.warmth).toBeLessThan(100);
    const warm = new Needs();
    warm.values.warmth = 50;
    warm.update(2, { sprinting: false, cold: 0 });
    expect(warm.values.warmth).toBeGreaterThan(50);
  });
});

describe('Schlaf', () => {
  it('Vorschlag: 7 Stunden, bei Müdigkeit bis 12', () => {
    expect(suggestedSleepHours(100)).toBe(7);
    expect(suggestedSleepHours(70)).toBe(7);
    expect(suggestedSleepHours(35)).toBeGreaterThan(7);
    expect(suggestedSleepHours(0)).toBe(12);
  });

  it('Bett-Qualität: Boden schlechter als einfaches Bett schlechter als gutes Bett', () => {
    expect(BEDS.good.discomfort).toBeLessThan(BEDS.bad.discomfort);
    expect(BEDS.bad.discomfort).toBeLessThan(BEDS.floor.discomfort);
    expect(BEDS.good.recovery).toBeGreaterThan(BEDS.floor.recovery);
  });

  it('Erholung im Schlaf hängt von Bett und Qualität ab', () => {
    const rest = (bed: keyof typeof BEDS, q: number) => {
      const n = new Needs();
      n.values.energy = 20;
      n.update(4, { sprinting: false, cold: 0, sleeping: true, sleepQuality: q * BEDS[bed].recovery });
      return n.values.energy;
    };
    expect(rest('good', 1)).toBeGreaterThan(rest('bad', 1));
    expect(rest('bad', 1)).toBeGreaterThan(rest('floor', 1));
    expect(rest('good', 1)).toBeGreaterThan(rest('good', 0.5));
  });

  it('Schätzung der Erholung ist begrenzt', () => {
    expect(estimateRecovery(95, 12, BEDS.good, 1)).toBe(5);
    expect(estimateRecovery(20, 4, BEDS.good, 1)).toBeCloseTo(48);
    expect(estimateRecovery(20, 4, BEDS.floor, 0.5)).toBeLessThan(estimateRecovery(20, 4, BEDS.good, 1));
  });
});

const calm = (o: Partial<MoodInput> = {}): MoodInput => ({
  sleeping: false, bedDiscomfort: 0, wetMax: 0, coldLevel: 0, load: 0.2, pain: 0, bleeding: false, activity: 'active', indoors: false, fed: true, ...o,
});

describe('Komfort', () => {
  it('steigt durch Nässe, Kälte, schwere Last und Schmerz; schlechtes Bett zählt nur im Schlaf', () => {
    const m = new Mood();
    expect(m.discomfortTarget(calm())).toBe(0);
    expect(m.discomfortTarget(calm({ wetMax: 80, coldLevel: 3, load: 0.95, pain: 40 }))).toBeGreaterThan(60);
    expect(m.discomfortTarget(calm({ bedDiscomfort: 0.5 }))).toBe(0);
    expect(m.discomfortTarget(calm({ sleeping: true, bedDiscomfort: 0.5 }))).toBe(50);
  });

  it('passt sich im Wachen langsam an, im Schlaf sofort', () => {
    const m = new Mood();
    m.update(0.5, calm({ wetMax: 90, coldLevel: 4 }));
    expect(m.discomfort).toBeGreaterThan(0);
    expect(m.discomfort).toBeLessThan(m.discomfortTarget(calm({ wetMax: 90, coldLevel: 4 })));
    const s = new Mood();
    s.update(0.1, calm({ sleeping: true, bedDiscomfort: 0.5 }));
    expect(s.discomfort).toBe(50);
  });

  it('sinkt schneller, als er steigt', () => {
    const m = new Mood();
    m.stats.set('discomfort', 50);
    m.update(0.5, calm());
    expect(m.discomfort).toBe(20);
    const up = new Mood();
    up.update(0.5, calm({ coldLevel: 4, wetMax: 95 }));
    expect(up.discomfort).toBeLessThanOrEqual(7);
  });
});

describe('Stress, Langeweile, Unglücklichkeit', () => {
  it('Langeweile wächst bei Untätigkeit (drinnen schneller), sinkt bei Aktivität und Gesellschaft', () => {
    const inside = new Mood(), outside = new Mood();
    inside.update(3, calm({ activity: 'idle', indoors: true }));
    outside.update(3, calm({ activity: 'idle', indoors: false }));
    expect(inside.boredom).toBeGreaterThan(outside.boredom);
    const busy = new Mood(), social = new Mood();
    busy.stats.set('boredom', 60);
    social.stats.set('boredom', 60);
    busy.update(2, calm({ activity: 'active' }));
    social.update(2, calm({ activity: 'social' }));
    expect(busy.boredom).toBeLessThan(60);
    expect(social.boredom).toBeLessThan(busy.boredom);
  });

  it('Langeweile wächst im Schlaf nicht', () => {
    const m = new Mood();
    m.update(8, calm({ sleeping: true, activity: 'idle', indoors: true }));
    expect(m.boredom).toBe(0);
  });

  it('Stress entsteht durch Schmerz, Blutung, Kälte und Unbehagen und klingt langsam ab', () => {
    const m = new Mood();
    m.update(2, calm({ pain: 70, bleeding: true, coldLevel: 3 }));
    expect(m.stress).toBeGreaterThan(20);
    const before = m.stress;
    m.update(2, calm());
    expect(m.stress).toBeLessThan(before);
    expect(m.stress).toBeGreaterThan(0);
  });

  it('Stress baut sich im Schlaf schneller ab', () => {
    const a = new Mood(), b = new Mood();
    a.stats.set('stress', 40);
    b.stats.set('stress', 40);
    a.update(2, calm());
    b.update(2, calm({ sleeping: true }));
    expect(b.stress).toBeLessThan(a.stress);
  });

  it('anhaltende Langeweile und Stress machen unglücklich, Zufriedenheit heilt langsam', () => {
    const m = new Mood();
    m.stats.set('boredom', 80);
    m.stats.set('stress', 60);
    m.update(3, calm({ activity: 'idle', indoors: true }));
    expect(m.unhappiness).toBeGreaterThan(10);
    const happy = new Mood();
    happy.stats.set('unhappiness', 30);
    happy.update(5, calm());
    expect(happy.unhappiness).toBeLessThan(30);
    const unfed = new Mood();
    unfed.stats.set('unhappiness', 30);
    unfed.update(5, calm({ fed: false }));
    expect(unfed.unhappiness).toBe(30);
  });

  it('Schlafqualität sinkt mit Unbehagen und Stress, nie unter 0.3', () => {
    const m = new Mood();
    expect(m.sleepQuality).toBe(1);
    m.stats.set('discomfort', 60);
    expect(m.sleepQuality).toBeCloseTo(0.7);
    m.stats.set('stress', 80);
    expect(m.sleepQuality).toBeCloseTo(0.4);
    m.stats.set('discomfort', 100);
    expect(m.sleepQuality).toBe(0.3);
  });

  it('Moodle-Stufen für die Anzeige', () => {
    expect(levelById('stress', 30)).toBe(1);
    expect(levelById('bored', 80)).toBe(3);
    expect(levelById('unhappy', 10)).toBe(0);
    expect(levelById('wet', 95)).toBe(4);
    expect(() => levelById('gibtsnicht', 1)).toThrow();
  });

  it('Ausstattung wirkt auf Nässe-Verlauf und Inventar-Hilfen', () => {
    const inv = new Inventory(14);
    inv.wear('jacket');
    expect(gearFrom(inv.equipment).rainproof.torso).toBeGreaterThan(0.4);
  });
});
