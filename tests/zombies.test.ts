import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { ATTACK_RANGE, BrainWorld, Sound, ZTYPES, ZombieBrain, movementNoise, visionRange } from '../src/sim/ZombieAI';
import { Hittable, defenseOf, meleeTargets, pickPart, rollDamage, swingAt, zombieStrike } from '../src/sim/Combat';
import { FISTS, WEAPONS, weaponOf } from '../src/data/weapons';
import { Health } from '../src/player/Health';
import { Needs } from '../src/player/Needs';
import { ZombieWorld, baseCount, chunkRng, populationFactor } from '../src/world/ZombieWorld';
import { ChunkManager, climbTarget } from '../src/world/ChunkManager';
import { doorPlacement, generateChunk, rng } from '../src/world/CityGenerator';
import { Explored, CELLS } from '../src/world/Explored';
import { Mood } from '../src/sim/Mood';

const world = (o: Partial<BrainWorld> = {}): BrainWorld => ({
  player: { x: 0, z: 0 },
  vision: 18,
  raining: false,
  sounds: [],
  los: () => true,
  rand: () => 0.5,
  ...o,
});

/** Zombie an (x, z), dreht sich mit Blick (yaw) und wartet, bis er prüfen darf */
const zombie = (x: number, z: number, yaw = 0, type = ZTYPES.shambler) => {
  const b = new ZombieBrain(x, z, type, 0);
  b.yaw = yaw;
  return b;
};
const tick = (b: ZombieBrain, w: BrainWorld, seconds: number, dt = 0.05) => {
  let last = b.update(dt, w);
  for (let t = dt; t < seconds; t += dt) last = b.update(dt, w);
  return last;
};

describe('Sichtweite und Lärm', () => {
  it('Sicht sinkt nachts und bei Regen, bleibt in Grenzen', () => {
    expect(visionRange(0, 0)).toBe(18);
    expect(visionRange(1, 0)).toBeLessThan(visionRange(0, 0));
    expect(visionRange(0, 1)).toBeLessThan(visionRange(0, 0));
    expect(visionRange(1, 1, 1)).toBe(7);
  });
  it('Sprinten ist lauter als Gehen, Stehen lautlos', () => {
    expect(movementNoise(false, false)).toBe(0);
    expect(movementNoise(true, true)).toBeGreaterThan(movementNoise(true, false));
  });
});

describe('Sehen', () => {
  it('sieht den Spieler im Sichtkegel mit freier Sicht und jagt ihn', () => {
    const b = zombie(0, -10, 0); // schaut nach +z, Spieler bei z = 0
    tick(b, world(), 0.4);
    expect(b.seen).toBe(true);
    expect(b.state).toBe('chase');
  });

  it('sieht nicht hinter sich, nicht zu weit, nicht durch Wände', () => {
    const behind = zombie(0, -10, Math.PI);
    tick(behind, world(), 0.4);
    expect(behind.seen).toBe(false);
    const far = zombie(0, -30, 0);
    tick(far, world(), 0.4);
    expect(far.seen).toBe(false);
    const wall = zombie(0, -10, 0);
    tick(wall, world({ los: () => false }), 0.4);
    expect(wall.seen).toBe(false);
  });

  it('bemerkt den Spieler ganz in der Nähe auch im Rücken', () => {
    const b = zombie(0, -2, Math.PI);
    tick(b, world(), 0.4);
    expect(b.seen).toBe(true);
  });

  it('Dunkelheit verkürzt die Sicht', () => {
    const near = zombie(0, -12, 0);
    tick(near, world({ vision: 18 }), 0.4);
    const dark = zombie(0, -12, 0);
    tick(dark, world({ vision: visionRange(1, 0) }), 0.4);
    expect(near.seen).toBe(true);
    expect(dark.seen).toBe(false);
  });

  it('schnellere Typen sehen etwas weiter', () => {
    const w = world({ vision: 16 });
    const slow = zombie(0, -17, 0, ZTYPES.shambler);
    const fast = zombie(0, -17, 0, ZTYPES.sprinter);
    tick(slow, w, 0.4);
    tick(fast, w, 0.4);
    expect(slow.seen).toBe(false);
    expect(fast.seen).toBe(true);
  });
});

describe('Hören', () => {
  const far = (x = 0, z = 0): BrainWorld => world({ player: { x: 200, z: 200 }, sounds: [{ x, z, radius: 12 }] });

  it('geht zu einem Geräusch im Radius', () => {
    const b = zombie(8, 0, 0);
    const i = b.update(0.05, far());
    expect(b.state).toBe('investigate');
    expect(i.speed).toBeGreaterThan(0);
    expect(i.dx).toBeLessThan(0); // Richtung Geräusch (x = 0)
  });

  it('ignoriert ein Geräusch außerhalb des Radius', () => {
    const b = zombie(20, 0, 0);
    b.update(0.05, far());
    expect(b.state).toBe('idle');
  });

  it('Hörreichweite hängt vom Typ ab', () => {
    const slow = zombie(13, 0, 0, ZTYPES.shambler);
    const fast = zombie(13, 0, 0, ZTYPES.sprinter);
    slow.update(0.05, far());
    fast.update(0.05, far());
    expect(slow.state).toBe('idle');
    expect(fast.state).toBe('investigate');
  });

  it('ohne Sichtlinie ist der Ort ungenau, bei Regen noch ungenauer', () => {
    const rand = () => 1; // größtmöglicher Versatz
    const clear = zombie(8, 0, 0);
    clear.hear(0, 0, world({ rand }));
    expect(clear.target).toEqual({ x: 0, z: 0 });
    const walled = zombie(8, 0, 0);
    walled.hear(0, 0, world({ rand, los: () => false }));
    const rain = zombie(8, 0, 0);
    rain.hear(0, 0, world({ rand, los: () => false, raining: true }));
    expect(walled.target!.x).toBeCloseTo(2);
    expect(rain.target!.x).toBeCloseTo(5);
  });

  it('erreicht den Ort, schaut nach und gibt auf', () => {
    const b = zombie(4, 0, 0);
    const w = world({ player: { x: 200, z: 200 }, sounds: [{ x: 0, z: 0, radius: 12 }] });
    b.update(0.05, w);
    const quiet = world({ player: { x: 200, z: 200 } });
    for (let i = 0; i < 400 && b.state === 'investigate'; i++) {
      const it = b.update(0.05, quiet);
      b.x += it.dx * it.speed * 0.05;
      b.z += it.dz * it.speed * 0.05;
    }
    expect(b.state).toBe('idle');
  });
});

describe('Jagen, Angreifen, Vergessen', () => {
  it('läuft mit seinem Tempo auf den Spieler zu', () => {
    const b = zombie(0, -10, 0, ZTYPES.fast);
    const it = tick(b, world(), 0.5);
    expect(it.speed).toBeCloseTo(ZTYPES.fast.speed);
    expect(it.dz).toBeGreaterThan(0.9);
  });

  it('schlägt nach kurzem Ausholen zu, wenn der Spieler in Reichweite bleibt', () => {
    const b = zombie(0, -(ATTACK_RANGE - 0.2), 0);
    let strikes = 0;
    for (let t = 0; t < 2; t += 0.05) if (b.update(0.05, world()).strike) strikes++;
    expect(strikes).toBeGreaterThanOrEqual(1);
    const walkAway = zombie(0, -(ATTACK_RANGE - 0.2), 0);
    let hit = false;
    for (let t = 0; t < 2; t += 0.05) {
      const w = world({ player: { x: 0, z: t < 0.3 ? 0 : 5 } });
      if (walkAway.update(0.05, w).strike) hit = true;
    }
    expect(hit).toBe(false);
  });

  it('vergisst den Spieler nach einiger Zeit ohne Sicht', () => {
    const b = zombie(0, -10, 0);
    tick(b, world(), 0.5);
    expect(b.state).toBe('chase');
    const gone = world({ player: { x: 300, z: 300 }, los: () => false });
    for (let i = 0; i < 260 && b.state !== 'idle'; i++) {
      const it = b.update(0.05, gone);
      b.x += it.dx * it.speed * 0.05;
      b.z += it.dz * it.speed * 0.05;
    }
    expect(b.state).toBe('idle');
  });

  it('weicht bei Hindernissen seitlich aus', () => {
    const b = zombie(0, -10, 0);
    const straight = tick(b, world(), 0.5);
    b.detour = 1;
    const side = b.update(0.05, world());
    expect(Math.abs(side.dx)).toBeGreaterThan(Math.abs(straight.dx) + 0.5);
  });
});

describe('Treffer und Gruppen', () => {
  it('Schaden macht taumeln, genug Schaden tötet', () => {
    const b = zombie(0, 0);
    expect(b.hit(10, 0.3, 0)).toBe(false);
    expect(b.state).toBe('stagger');
    expect(b.x).toBeCloseTo(0.3);
    expect(b.update(0.05, world()).speed).toBe(0);
    expect(b.hit(100)).toBe(true);
    expect(b.alive).toBe(false);
    expect(b.hit(5)).toBe(false);
  });

  it('wer getroffen wird, weiß, woher der Schlag kam', () => {
    const b = zombie(10, 10, Math.PI);
    b.hit(5, 0, 0, { x: 0, z: 0 });
    tick(b, world({ player: { x: 300, z: 300 }, los: () => false }), 1);
    expect(b.state).toBe('chase');
    expect(b.target).toEqual({ x: 0, z: 0 });
  });

  it('Gruppenmitglieder folgen dem Anführer, wenn er etwas verfolgt', () => {
    const leader = zombie(0, -10, 0);
    const mate = zombie(3, -10, Math.PI);
    mate.leader = leader;
    const w = world({ player: { x: 0, z: 0 } });
    mate.update(0.05, world({ player: { x: 400, z: 400 } }));
    expect(mate.state).toBe('idle');
    tick(leader, w, 0.5);
    expect(leader.state).toBe('chase');
    tick(mate, world({ player: { x: 400, z: 400 } }), 2);
    expect(['investigate', 'chase']).toContain(mate.state);
  });
});

class Dummy implements Hittable {
  alive = true;
  hp: number;
  constructor(public x: number, public z: number, hp = 20) {
    this.hp = hp;
  }
  hit(d: number): boolean {
    this.hp -= d;
    if (this.hp <= 0) this.alive = false;
    return !this.alive;
  }
}

describe('Nahkampf', () => {
  it('Waffen: Fäuste ohne Waffe, Werte plausibel', () => {
    expect(weaponOf(null)).toBe(FISTS);
    expect(weaponOf('apple')).toBe(FISTS);
    expect(weaponOf('bat')).toBe(WEAPONS.bat);
    for (const w of Object.values(WEAPONS)) {
      expect(w.max).toBeGreaterThan(w.min);
      expect(w.min).toBeGreaterThan(FISTS.min);
    }
  });

  it('trifft nur im Bogen und in Reichweite, die nächsten zuerst', () => {
    const w = WEAPONS.axe; // 2 Ziele
    const front = new Dummy(0, 1.5);
    const near = new Dummy(0.2, 0.9);
    const side = new Dummy(1.8, 0);
    const tooFar = new Dummy(0, 4);
    const behind = new Dummy(0, -1.2);
    const list = meleeTargets(0, 0, 0, w, [front, near, side, tooFar, behind]);
    expect(list).toEqual([near, front]);
    expect(meleeTargets(0, 0, 0, WEAPONS.knife, [front, near]).length).toBe(1);
  });

  it('Schaden liegt in der Waffenspanne, Volltreffer verdoppelt', () => {
    for (let s = 0; s < 80; s++) {
      const r = rng(s);
      const roll = rollDamage(WEAPONS.bat, r);
      const base = roll.crit ? roll.damage / 2 : roll.damage;
      expect(base).toBeGreaterThanOrEqual(WEAPONS.bat.min - 1e-9);
      expect(base).toBeLessThanOrEqual(WEAPONS.bat.max + 1e-9);
    }
  });

  it('ein Schlag tötet schwache Gegner und meldet Treffer', () => {
    const weak = new Dummy(0, 1, 5);
    const r = swingAt(0, 0, 0, WEAPONS.bat, [weak], () => 0.5);
    expect(r.hits.length).toBe(1);
    expect(r.hits[0].killed).toBe(true);
    expect(swingAt(0, 0, 0, WEAPONS.bat, [weak], () => 0.5).hits.length).toBe(0); // tot
  });
});

describe('Zombie-Angriff', () => {
  const dressed = { head: 'beanie', body: 'jacket', legs: 'jeans', feet: 'boots', back: null, hand: null } as const;
  const naked = { head: null, body: null, legs: null, feet: null, back: null, hand: null } as const;
  const seq = (...v: number[]) => {
    let i = 0;
    return () => v[Math.min(i++, v.length - 1)];
  };

  it('kann danebengehen', () => {
    const h = new Health();
    expect(zombieStrike(h, naked, seq(0.05)).kind).toBe('miss');
    expect(h.allWounds.length).toBe(0);
  });

  it('Kleidung schützt den bedeckten Körperteil und reißt dabei nur', () => {
    const h = new Health();
    // Wurf 0.5 → Körperteil, dann 0.0 → unter dem Schutzwert
    const res = zombieStrike(h, dressed, seq(0.5, 0.0));
    expect(res.kind).toBe('blocked');
    expect(h.allWounds.length).toBe(0);
  });

  it('ohne Kleidung gibt es Kratzer, Schnitt oder Biss; nur der Biss infiziert', () => {
    const scratch = new Health(), cut = new Health(), bite = new Health();
    expect(zombieStrike(scratch, naked, seq(0.5, 0.5, 0.2)).kind).toBe('wound');
    expect(scratch.allWounds[0].wound.kind).toBe('scratch');
    expect(scratch.infected).toBe(false);
    zombieStrike(cut, naked, seq(0.5, 0.5, 0.7));
    expect(cut.allWounds[0].wound.kind).toBe('cut');
    const r = zombieStrike(bite, naked, seq(0.5, 0.5, 0.95));
    expect(r.kind === 'wound' && r.virus).toBe(true);
    expect(bite.allWounds[0].wound.kind).toBe('bite');
    expect(bite.infected).toBe(true);
  });

  it('Schutz richtet sich nach dem Körperteil', () => {
    expect(defenseOf('torso', dressed)).toBeGreaterThan(defenseOf('head', dressed));
    expect(defenseOf('handL', dressed)).toBe(0);
    expect(defenseOf('torso', naked)).toBe(0);
  });

  it('trifft über die Zeit alle Körperteile, der Oberkörper am häufigsten', () => {
    const count = new Map<string, number>();
    const r = rng(3);
    for (let i = 0; i < 2000; i++) count.set(pickPart(r), (count.get(pickPart(r)) ?? 0) + 1);
    expect(count.get('torso')!).toBeGreaterThan(count.get('head')!);
  });

  it('die Infektion tötet nach 24–48 Stunden, Wunden heilen sie nicht', () => {
    const h = new Health();
    h.infect(() => 0);
    expect(h.virus).toBe(24);
    const n = new Needs();
    h.update(23, n, () => 1);
    expect(h.dead).toBe(false);
    h.update(2, n, () => 1);
    expect(h.dead).toBe(true);
    expect(h.cause).toBe('Zombie-Infektion');
    const again = new Health();
    again.infect(() => 0.5);
    again.infect(() => 0.9);
    expect(again.virus).toBe(36); // zweiter Biss ändert nichts
  });

  it('Gefahr treibt den Stress hoch', () => {
    const calm = new Mood(), scared = new Mood();
    const base = { sleeping: false, bedDiscomfort: 0, wetMax: 0, coldLevel: 0, load: 0.2, pain: 0, bleeding: false, activity: 'active' as const, indoors: false, fed: true };
    calm.update(1, base);
    scared.update(1, { ...base, threat: 2 });
    expect(scared.stress).toBeGreaterThan(calm.stress + 20);
  });
});

describe('Bevölkerung', () => {
  it('wächst bis Tag 28 auf das Anderthalbfache und sinkt danach', () => {
    expect(populationFactor(1)).toBe(1);
    expect(populationFactor(28)).toBeCloseTo(1.5);
    expect(populationFactor(60)).toBeLessThan(populationFactor(28));
    expect(populationFactor(400)).toBe(0.6);
  });

  it('Chunk-Zufall ist stabil, Anzahl hängt vom Gelände ab', () => {
    expect(chunkRng(3, 4, 1)()).toBe(chunkRng(3, 4, 1)());
    expect(chunkRng(3, 4, 1)()).not.toBe(chunkRng(4, 3, 1)());
    const spec = generateChunk(0, 0);
    expect(baseCount(spec, 0, 0)).toEqual(baseCount(spec, 0, 0));
    expect(baseCount(spec, 0, 0).indoor.length).toBe(spec.buildings.length);
  });

  const env = {
    hasChunk: (cx: number, cz: number) => Math.abs(cx) < 20 && Math.abs(cz) < 20,
    specOf: (cx: number, cz: number) => generateChunk(cx, cz),
    resolve: () => {},
    lineClear: () => true,
    overlapsWorld: () => false,
    doorsNear: () => [],
    thumpDoor: () => false,
  };
  const ctx = (x: number, z: number) => ({ player: new Vector3(x, 0, z), night: 0, rain: 0, clouds: 0, day: 1, onStrike: () => {} });

  it('setzt Zombies in nahe Chunks, hält Abstand zum Spieler und füllt nicht doppelt', () => {
    const zw = new ZombieWorld(1);
    zw.update(0.016, env, ctx(0, 0));
    const first = zw.zombies.length;
    expect(first).toBeGreaterThan(0);
    for (const z of zw.zombies) expect(Math.hypot(z.x, z.z)).toBeGreaterThan(20);
    zw.update(0.016, env, ctx(0, 0));
    expect(zw.zombies.length).toBe(first);
  });

  it('Erschlagene kommen nicht wieder, wenn der Chunk neu gefüllt wird', () => {
    const zw = new ZombieWorld(2);
    zw.update(0.016, env, ctx(0, 0));
    const victim = zw.zombies[0];
    const key = victim.chunkKey;
    const planned = zw.planned(key);
    expect(zw.zombies.filter((z) => z.chunkKey === key).length).toBeLessThanOrEqual(planned);
    victim.hit(1000, 0, 0);
    zw.recordKill(victim);
    expect(zw.killedIn(key)).toBe(1);
    zw.update(0.016, env, ctx(10_000, 10_000)); // weit weg: alles wird geräumt
    expect(zw.zombies.length).toBeLessThan(2);
    zw.update(0.016, env, ctx(0, 0));
    const again = zw.zombies.filter((z) => z.chunkKey === key).length;
    expect(zw.planned(key)).toBe(planned); // Planung bleibt gleich
    expect(again).toBeLessThanOrEqual(planned - 1); // der Erschlagene fehlt
    expect(again).toBeGreaterThan(0);
  });

  it('ein Geräusch lockt Zombies aus der Umgebung an', () => {
    const zw = new ZombieWorld(3);
    zw.update(0.016, env, ctx(0, 0));
    const z = zw.zombies.find((q) => Math.hypot(q.x, q.z) < 50)!;
    expect(z).toBeDefined();
    zw.noise(z.x + 3, z.z, 20);
    zw.update(0.05, env, ctx(0, 0));
    expect(['investigate', 'chase']).toContain(z.brain.state);
  });
});

describe('Klettern', () => {
  const fence = { x: 0, z: 0, w: 3, d: 0.25, climb: 0.7 };

  it('springt über einen Zaun auf die andere Seite', () => {
    const t = climbTarget(0, 0.5, 0, -1, 0.4, fence)!;
    expect(t).not.toBeNull();
    expect(t.z).toBeLessThan(-0.3);
    expect(t.x).toBe(0);
    const back = climbTarget(0, -0.5, 0, 1, 0.4, fence)!;
    expect(back.z).toBeGreaterThan(0.3);
  });

  it('nur wenn man auf den Zaun zuläuft und nah genug ist', () => {
    expect(climbTarget(0, 0.5, 0, 1, 0.4, fence)).toBeNull(); // läuft weg
    expect(climbTarget(0, 0.5, 1, 0, 0.4, fence)).toBeNull(); // läuft daran entlang
    expect(climbTarget(0, 2, 0, -1, 0.4, fence)).toBeNull(); // noch zu weit
  });

  it('dicke Hindernisse lassen sich nicht überklettern', () => {
    expect(climbTarget(0, 1.4, 0, -1, 0.4, { x: 0, z: 0, w: 3, d: 2, climb: 1 })).toBeNull();
  });

  it('Zäune in der Welt sind als überkletterbar markiert', () => {
    const cm = new ChunkManager();
    let found = false;
    for (let cx = -3; cx <= 3 && !found; cx++) {
      for (let cz = -3; cz <= 3 && !found; cz++) {
        cm.update(cx * 64 + 32, cz * 64 + 32);
        for (const b of (cm as unknown as { chunks: Map<string, { colliders: { climb?: number }[] }> }).chunks.values()) {
          if (b.colliders.some((c) => c.climb)) found = true;
        }
      }
    }
    expect(found).toBe(true);
  });
});

describe('Türen', () => {
  const setup = () => {
    const cm = new ChunkManager();
    cm.update(4, 4);
    const b = generateChunk(0, 0).buildings[0];
    return { cm, b };
  };

  it('die Tür ist zu und sperrt den Durchgang, bis man sie öffnet', () => {
    const { cm, b } = setup();
    const [d] = cm.doorsNear(b.x, b.z, 80);
    expect(d).toBeDefined();
    expect(d.wanted).toBe(false);
    const p = new Vector3(d.x, 0.85, d.z);
    cm.resolve(p, 0.4);
    expect(Math.hypot(p.x - d.x, p.z - d.z)).toBeGreaterThan(0.1); // wird aus der Türlücke geschoben
    expect(cm.toggleDoor(d, 100, 100)).toBe('opened');
    for (let i = 0; i < 30; i++) cm.update(4, 4, 1 / 30);
    const q = new Vector3(d.x, 0.85, d.z);
    cm.resolve(q, 0.4);
    expect(q.x).toBeCloseTo(d.x);
    expect(q.z).toBeCloseTo(d.z);
  });

  it('Wer in der offenen Tür steht, kann sie nicht schließen', () => {
    const { cm, b } = setup();
    const [d] = cm.doorsNear(b.x, b.z, 80);
    cm.toggleDoor(d, 100, 100);
    expect(cm.toggleDoor(d, d.x, d.z)).toBe('blocked');
    expect(d.wanted).toBe(true);
    expect(cm.toggleDoor(d, d.x + 5, d.z + 5)).toBe('closed');
    expect(d.plug.off).toBe(false);
  });

  it('Zombies schlagen geschlossene Türen kaputt; kaputte Türen bleiben offen', () => {
    const { cm, b } = setup();
    const [d] = cm.doorsNear(b.x, b.z, 80);
    expect(cm.thumpDoor(d, 40)).toBe(false);
    expect(cm.thumpDoor(d, 70)).toBe(true);
    expect(d.broken).toBe(true);
    expect(d.wanted).toBe(true);
    expect(cm.toggleDoor(d, 100, 100)).toBe('blocked');
    expect(cm.thumpDoor(d, 10)).toBe(false);
  });

  it('Sichtlinie: Wände und geschlossene Türen versperren sie, offene nicht', () => {
    const { cm } = setup();
    // Wohngebäude mit massiver Tür (Büros und Läden haben Glastüren, die die Sicht nicht versperren)
    const b = generateChunk(0, 0).buildings.find((q) => q.kind === 'house' || q.kind === 'apartment')!;
    // die Tür des Hauses selbst (nicht irgendeine Tür der Umgebung)
    const dp = doorPlacement(b);
    const d = cm.doorsNear(b.x, b.z, 80).sort((p, q) => Math.hypot(p.x - dp.x, p.z - dp.z) - Math.hypot(q.x - dp.x, q.z - dp.z))[0];
    // von der Hausmitte zu einem Punkt weit hinter der Tür
    const out = { x: d.x + (d.x - b.x) * 3, z: d.z + (d.z - b.z) * 3 };
    expect(cm.lineClear(b.x, b.z, out.x, out.z, 0)).toBe(false);
    cm.toggleDoor(d, 100, 100);
    for (let i = 0; i < 30; i++) cm.update(4, 4, 1 / 30);
    // freie Fläche ohne Wand: immer frei
    expect(cm.lineClear(0, -40, 5, -40, 0)).toBe(true);
  });
});

describe('Erkundung (Karte)', () => {
  it('deckt die Umgebung auf, mit weichem Rand', () => {
    const e = new Explored();
    expect(e.reveal(10, 10)).toBe(true);
    expect(e.at(10, 10)).toBe(1);
    expect(e.at(10 + 30, 10)).toBeGreaterThan(0);
    expect(e.at(10 + 30, 10)).toBeLessThan(1);
    expect(e.at(10 + 60, 10)).toBe(0);
    expect(e.at(10 + 22, 10)).toBeGreaterThan(e.at(10 + 38, 10));
  });

  it('Erkundetes bleibt sichtbar und erkundet nur bei Bewegung neu', () => {
    const e = new Explored();
    e.reveal(0, 0);
    const before = e.cellsKnown;
    expect(e.reveal(0.4, 0.4)).toBe(false);
    expect(e.reveal(40, 0)).toBe(true);
    expect(e.cellsKnown).toBeGreaterThan(before);
    expect(e.at(0, 0)).toBe(1);
  });

  it('meldet geänderte Chunks und rechnet Nachbarn mit', () => {
    const e = new Explored();
    e.reveal(30, 30);
    const keys = e.takeDirty();
    expect(keys).toContain('0,0');
    expect(e.takeDirty()).toEqual([]);
    expect(e.has(0, 0)).toBe(true);
    expect(e.has(5, 5)).toBe(false);
  });

  it('Maske enthält einen Rand aus den Nachbar-Chunks', () => {
    const e = new Explored();
    e.reveal(63, 32); // an der rechten Chunk-Kante
    const m = e.mask(0, 0);
    const n = CELLS + 2;
    expect(m.length).toBe(n * n);
    expect(m[(16 + 1) * n + CELLS + 1]).toBeGreaterThan(0); // Randzelle des Nachbarn
  });

  it('Speichern und Laden', () => {
    const e = new Explored();
    e.reveal(100, -50);
    const data = e.save();
    const f = new Explored();
    f.load(data);
    expect(f.cellsKnown).toBe(e.cellsKnown);
    expect(f.at(100, -50)).toBe(1);
    f.clear();
    expect(f.cellsKnown).toBe(0);
  });
});

void ({} as Sound);

describe('Zombies klettern und öffnen Türen', () => {
  const baseEnv = {
    hasChunk: (cx: number, cz: number) => Math.abs(cx) < 20 && Math.abs(cz) < 20,
    specOf: (cx: number, cz: number) => generateChunk(cx, cz),
    lineClear: () => true,
    overlapsWorld: () => false,
  };
  const ctx = (x: number, z: number, extra: object = {}) => ({ player: new Vector3(x, 0, z), night: 0, rain: 0, clouds: 0, day: 1, onStrike: () => {}, ...extra });
  /** Zombie nahe (0,-1) mit Blick auf den Spieler bei (0, 6); eine Wand bei z = 0 hält ihn auf */
  const setup = (seed: number, idWanted: (id: number) => boolean) => {
    const zw = new ZombieWorld(seed);
    zw.update(0.016, { ...baseEnv, resolve: () => {}, doorsNear: () => [], thumpDoor: () => false }, ctx(0, 2));
    const z = zw.zombies.find((q) => idWanted(q.id))!;
    zw.zombies.filter((q) => q !== z).forEach((q) => zw.recordKill(q));
    z.brain.x = 0;
    z.brain.z = -1;
    z.brain.yaw = 0;
    // Er jagt den Spieler schon: Zustand, Ziel und Gedächtnis von außen setzen
    Object.assign(z.brain, { state: 'chase', target: { x: 0, z: 2 }, memory: 999, seen: true });
    return { zw, z };
  };
  const wall = (pos: Vector3) => {
    if (pos.z > -0.3) pos.z = -0.3;
  };

  it('steigt über ein offenes Fenster, wenn die Wand ihn aufhält', () => {
    const { zw, z } = setup(31, () => true);
    let climbed = 0;
    const way = { x: 0, z: 0.9, dur: 1.2, h: 1.2 };
    const env = { ...baseEnv, resolve: wall, doorsNear: () => [], thumpDoor: () => false, findClimb: () => way };
    for (let i = 0; i < 400 && (z.brain.z < 0.85 || z.climb); i++) {
      zw.update(0.05, env, ctx(0, 2, { onClimb: () => climbed++ }));
    }
    expect(climbed).toBeGreaterThan(0);
    expect(z.brain.z).toBeGreaterThan(0.6);
    expect(z.climb).toBeNull();
  });

  it('ohne Kletterweg bleibt er an der Wand', () => {
    const { zw, z } = setup(32, () => true);
    const env = { ...baseEnv, resolve: wall, doorsNear: () => [], thumpDoor: () => false, findClimb: () => null };
    for (let i = 0; i < 200; i++) zw.update(0.05, env, ctx(0, 2));
    expect(z.brain.z).toBeLessThan(0);
  });

  it('Zombies öffnen keine Türen, sie schlagen sie nur ein (und das dauert)', () => {
    const door = { x: 0, z: 0, wanted: false, broken: false } as never;
    const { zw } = setup(41, () => true);
    let opened = 0, damage = 0;
    const env = {
      ...baseEnv, resolve: wall, doorsNear: () => [door], thumpDoor: (_d: unknown, dmg: number) => { damage += dmg; return false; },
      openDoor: () => { opened++; return true; },
    };
    for (let i = 0; i < 120; i++) zw.update(0.05, env, ctx(0, 2, { onDoorOpened: () => opened++ }));
    expect(opened).toBe(0);
    expect(damage).toBeGreaterThan(0);
    // sechs Sekunden Dauerschlag richten bei weitem nicht die ganze Tür (100) zugrunde
    expect(damage).toBeLessThan(40);
  });
});
