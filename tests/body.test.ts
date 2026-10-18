import { describe, expect, it } from 'vitest';
import { Health } from '../src/player/Health';
import { Needs } from '../src/player/Needs';
import { Inventory } from '../src/player/Inventory';
import { WOUND, isBleeding, isDirty } from '../src/player/Body';
import { TREAT_ITEM, TreatAction, autoTarget, treat, whyNot, woundStatus } from '../src/player/Treatment';
import { evalMoodles } from '../src/data/moodles';
import { ITEMS, item } from '../src/data/items';
import { rng } from '../src/world/CityGenerator';

const never = () => 1; // Würfel: nie ein Ereignis
const always = () => 0; // Würfel: immer ein Ereignis
const fit = () => new Needs();

describe('Wunden', () => {
  it('verursachen Sofortschaden, Blutung und Schmerz', () => {
    const h = new Health();
    h.wound('legL', 'cut', 'Glas', () => 0);
    expect(h.hp).toBe(100 - WOUND.cut.damage);
    expect(h.bleedingCount).toBe(1);
    expect(h.pain).toBeGreaterThan(0);
  });

  it('Blutzeit liegt im Bereich der Wundart und Brüche bluten nicht', () => {
    const h = new Health();
    const a = h.wound('armL', 'cut', 'x', () => 0);
    const b = h.wound('armR', 'cut', 'x', () => 1);
    expect(a.bleed).toBe(WOUND.cut.bleed[0]);
    expect(b.bleed).toBe(WOUND.cut.bleed[1]);
    expect(isBleeding(h.wound('legR', 'fracture', 'x', () => 0.5))).toBe(false);
  });

  it('Blutung kostet HP, endet nach der Blutzeit und die Wunde heilt später ab', () => {
    const h = new Health();
    h.wound('armL', 'scratch', 'Kratzer', () => 1); // blutet 1 h
    const before = h.hp;
    h.update(2, fit(), never);
    expect(h.bleeding).toBe(false);
    expect(h.hp).toBeGreaterThan(before - 5); // nur wenig Verlust, danach Regeneration
    h.update(WOUND.scratch.heal + 1, fit(), never);
    expect(h.allWounds.length).toBe(0);
  });

  it('Heilung ruht bei Infektion und läuft bei Mangel langsamer', () => {
    const a = new Health(), b = new Health();
    const wa = a.wound('armL', 'cut', 'x', () => 0);
    const wb = b.wound('armL', 'cut', 'x', () => 0);
    wa.bleed = wb.bleed = 0;
    const hungry = new Needs();
    hungry.values.hunger = 20;
    a.update(10, fit(), never);
    b.update(10, hungry, never);
    expect(wa.healed).toBeGreaterThan(wb.healed);
    wb.infection = 50;
    const h0 = wb.healed;
    b.update(1, fit(), never);
    expect(wb.healed).toBe(h0);
  });

  it('Gesamtschmerz und Bewegung: Beinbruch bremst, Schiene lindert', () => {
    const h = new Health();
    expect(h.moveFactor).toBe(1);
    const w = h.wound('legL', 'fracture', 'Sturz', () => 0);
    const painUnsplinted = h.pain;
    expect(h.moveFactor).toBeCloseTo(0.55);
    w.splint = true;
    expect(h.moveFactor).toBeCloseTo(0.85);
    expect(h.pain).toBeLessThan(painUnsplinted);
    const arm = new Health();
    arm.wound('armL', 'fracture', 'Sturz', () => 0); // ein Armbruch bremst das Gehen nicht
    expect(arm.moveFactor).toBe(1);
  });
});

describe('Verband', () => {
  it('stoppt die Blutung, solange er hält, danach blutet die Wunde weiter', () => {
    const h = new Health();
    const w = h.wound('torso', 'deep', 'x', () => 1); // 12 h Blutzeit
    const inv = new Inventory(14);
    inv.add('bandage', 1);
    const r = treat(h, inv, 'torso', 0, 'bandage', { r: () => 0.5 });
    expect(r.ok).toBe(true);
    expect(inv.count('bandage')).toBe(0);
    expect(h.bleeding).toBe(false);
    h.update(6, fit(), never);
    expect(h.bleeding).toBe(false);
    h.update(5, fit(), never); // Verband (≈ 8 h) abgelaufen
    expect(isDirty(w)).toBe(true);
    expect(h.bleeding).toBe(true);
  });

  it('wird mit Arztfertigkeit haltbarer und lässt sich abnehmen', () => {
    const inv = new Inventory(14);
    inv.add('bandage', 2);
    const a = new Health(), b = new Health();
    const wa = a.wound('armL', 'cut', 'x', () => 0);
    const wb = b.wound('armL', 'cut', 'x', () => 0);
    treat(a, inv, 'armL', 0, 'bandage', { doctor: 0, r: () => 0.5 });
    treat(b, inv, 'armL', 0, 'bandage', { doctor: 5, r: () => 0.5 });
    expect(wb.bandageLife).toBeGreaterThan(wa.bandageLife);
    expect(treat(a, inv, 'armL', 0, 'bandage').ok).toBe(false); // sauberer Verband liegt schon an
    expect(treat(a, inv, 'armL', 0, 'unbandage').ok).toBe(true);
    expect(wa.bandaged).toBe(false);
  });
});

describe('Desinfektion', () => {
  it('senkt die Infektion, schützt eine Weile und tut weh', () => {
    const h = new Health();
    const w = h.wound('armL', 'cut', 'x', () => 0);
    w.infection = 40;
    const inv = new Inventory(14);
    inv.add('disinfectant', 1);
    expect(treat(h, inv, 'armL', 0, 'disinfect').ok).toBe(true);
    expect(w.infection).toBe(15);
    expect(w.alcohol).toBeGreaterThan(0);
    expect(h.parts.armL.extraPain).toBeGreaterThan(0);
    expect(inv.count('disinfectant')).toBe(0);
    h.update(3, fit(), never); // Infektion sinkt weiter, solange der Schutz wirkt
    expect(w.infection).toBeCloseTo(6);
  });

  it('desinfizierte Wunden stecken sich viel seltener an', () => {
    let plain = 0, treated = 0;
    for (let s = 0; s < 400; s++) {
      const r = rng(s * 7919 + 13);
      const a = new Health(), b = new Health();
      const wa = a.wound('armL', 'deep', 'x', () => 1);
      const wb = b.wound('armL', 'deep', 'x', () => 1);
      wa.bleed = wb.bleed = 0;
      wb.alcohol = 4;
      a.update(4, fit(), r);
      b.update(4, fit(), r);
      plain += wa.infection > 0 ? 1 : 0;
      treated += wb.infection > 0 ? 1 : 0;
    }
    expect(plain).toBeGreaterThan(treated * 3);
  });
});

describe('Infektion', () => {
  it('entsteht aus Faktoren: offen > verbunden, tief > Kratzer, Brüche nie', () => {
    const open = new Health(), covered = new Health(), fracture = new Health();
    const a = open.wound('armL', 'deep', 'x', () => 1);
    const b = covered.wound('armL', 'deep', 'x', () => 1);
    b.bandaged = true;
    b.bandageLife = 8;
    fracture.wound('armL', 'fracture', 'x', () => 1);
    for (const h of [open, covered, fracture]) for (const x of h.allWounds) x.wound.bleed = 0;
    const r = () => 0.01; // zwischen den Schritt-Wahrscheinlichkeiten von „verbunden“ (0.007) und „offen“ (0.018)
    open.update(0.25, fit(), r);
    covered.update(0.25, fit(), r);
    fracture.update(0.25, fit(), always);
    expect(a.infection).toBeGreaterThan(0);
    expect(b.infection).toBe(0);
    expect(fracture.infection).toBe(0);
  });

  it('wächst ohne Behandlung und schneller unter schmutzigem Verband', () => {
    const grow = (setup: (w: ReturnType<Health['wound']>) => void): number => {
      const h = new Health();
      const w = h.wound('legR', 'cut', 'x', () => 0);
      w.bleed = 0;
      w.infection = 5;
      setup(w);
      h.update(10, fit(), never);
      return w.infection;
    };
    const open = grow(() => {});
    const dirty = grow((w) => {
      w.bandaged = true;
      w.bandageLife = 0;
    });
    expect(open).toBeGreaterThan(25);
    expect(dirty).toBeGreaterThan(open);
  });

  it('starke Infektion kostet HP', () => {
    const h = new Health();
    const w = h.wound('legR', 'cut', 'x', () => 0);
    w.bleed = 0;
    w.infection = 95;
    const before = h.hp;
    h.update(1, fit(), never);
    expect(h.hp).toBeLessThan(before - 3);
  });

  it('kann tödlich enden und nennt „Wundinfektion“ als Ursache', () => {
    const h = new Health();
    const w = h.wound('torso', 'cut', 'x', () => 0);
    w.bleed = 0;
    w.infection = 95;
    h.hp = 20;
    h.update(30, fit(), never);
    expect(h.dead).toBe(true);
    expect(h.cause).toBe('Wundinfektion');
  });

  it('leichte Infektion unter sauberem Verband klingt langsam ab', () => {
    const h = new Health();
    const w = h.wound('armR', 'scratch', 'x', () => 0);
    w.bleed = 0;
    w.bandaged = true;
    w.bandageLife = 8;
    w.infection = 10;
    h.update(4, fit(), never);
    expect(w.infection).toBeLessThan(10);
  });
});

describe('Nähen und Schienen', () => {
  it('Naht stoppt die Blutung, beschleunigt die Heilung und verursacht Schmerz', () => {
    const h = new Health();
    h.wound('armL', 'deep', 'x', () => 1);
    const inv = new Inventory(14);
    inv.add('suture', 1);
    const r = treat(h, inv, 'armL', 0, 'stitch', { r: never });
    expect(r.ok).toBe(true);
    expect(h.bleeding).toBe(false);
    expect(h.parts.armL.extraPain).toBeGreaterThan(0);
    expect(h.allWounds[0].wound.stitched).toBe(true);
    expect(treat(h, inv, 'armL', 0, 'stitch').ok).toBe(false);
  });

  it('Nähen kann Keime einbringen; Desinfektion und Erfahrung senken das Risiko', () => {
    const run = (alcohol: number, doctor: number) => {
      let n = 0;
      for (let s = 0; s < 300; s++) {
        const r = rng(s * 104729 + 5);
        const h = new Health();
        h.wound('armL', 'deep', 'x', () => 1);
        h.parts.armL.wounds[0].alcohol = alcohol;
        const inv = new Inventory(14);
        inv.add('suture', 1);
        treat(h, inv, 'armL', 0, 'stitch', { doctor, r });
        if (h.parts.armL.wounds[0].infection > 0) n++;
      }
      return n;
    };
    const base = run(0, 0);
    expect(base).toBeGreaterThan(20);
    expect(run(4, 0)).toBeLessThan(base);
    expect(run(0, 8)).toBeLessThan(base);
  });

  it('Schiene nur bei Bruch und braucht das Item', () => {
    const h = new Health();
    h.wound('legL', 'fracture', 'x', () => 0);
    h.wound('armL', 'cut', 'x', () => 0);
    const inv = new Inventory(14);
    expect(treat(h, inv, 'legL', 0, 'splint').ok).toBe(false); // kein Item
    inv.add('splint', 1);
    expect(treat(h, inv, 'armL', 0, 'splint').ok).toBe(false); // falsche Wunde
    expect(inv.count('splint')).toBe(1);
    expect(treat(h, inv, 'legL', 0, 'splint').ok).toBe(true);
    expect(h.moveFactor).toBeCloseTo(0.85);
  });
});

describe('Behandlungsregeln', () => {
  it('verbraucht ohne Möglichkeit nichts', () => {
    const h = new Health();
    h.wound('armL', 'scratch', 'x', () => 0);
    const inv = new Inventory(14);
    inv.add('suture', 1);
    expect(treat(h, inv, 'armL', 0, 'stitch').ok).toBe(false);
    expect(inv.count('suture')).toBe(1);
    expect(treat(h, inv, 'head', 0, 'bandage').ok).toBe(false); // keine Wunde
  });

  it('autoTarget wählt die dringendste Wunde', () => {
    const h = new Health();
    h.wound('armL', 'scratch', 'x', () => 0);
    h.wound('torso', 'deep', 'x', () => 1);
    h.parts.armL.wounds[0].bleed = 0;
    expect(autoTarget(h, 'bandage')).toEqual({ part: 'torso', index: 0 });
    expect(autoTarget(h, 'stitch')).toEqual({ part: 'torso', index: 0 });
    expect(autoTarget(h, 'splint')).toBeNull();
    h.parts.armL.wounds[0].infection = 40;
    expect(autoTarget(h, 'disinfect')).toEqual({ part: 'armL', index: 0 });
  });

  it('woundStatus beschreibt den Zustand', () => {
    const h = new Health();
    const w = h.wound('armL', 'cut', 'x', () => 1);
    expect(woundStatus(w).map((s) => s.text)).toEqual(['blutet']);
    w.bandaged = true;
    w.bandageLife = 5;
    w.alcohol = 2;
    expect(woundStatus(w).map((s) => s.text)).toEqual(['Verband 5 h', 'desinfiziert 2 h']);
  });

  it('jede Behandlung kennt ein vorhandenes Item', () => {
    for (const [a, id] of Object.entries(TREAT_ITEM) as [TreatAction, string | null][]) {
      if (id) expect(ITEMS[id], a).toBeDefined();
    }
    expect(item('bandage').use?.treat).toBe('bandage');
    expect(whyNot(new Health().wound('armL', 'cut', 'x', () => 0), 'stitch')).toBeNull();
  });
});

describe('Anzeige', () => {
  it('Schmerz und Infektion erscheinen als Moodles', () => {
    const list = evalMoodles({ pain: 55, infection: 35, bleeding: 1 });
    expect(list.map((m) => m.id).sort()).toEqual(['bleeding', 'infection', 'pain']);
    expect(list.find((m) => m.id === 'pain')!.level).toBe(3);
    expect(list.find((m) => m.id === 'infection')!.level).toBe(2);
  });
});
