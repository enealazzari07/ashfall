import { Needs } from './Needs';
import { BodyPart, PARTS, PartId, WOUND, Wound, WoundKind, healTime, isBleeding, isDirty, makeWound, newBody, partPain } from './Body';

const STARVE = 4;
const DEHYDRATE = 8;
const FREEZE = 10;
const EXHAUST = 3;
const REGEN = 3;
/** Rechenschritt in Spielstunden: so entscheiden Zufallswürfe auch bei großen Zeitsprüngen sinnvoll */
const STEP = 0.25;
const EXTRA_PAIN_DECAY = 6; // pro Stunde

/** Infektionsstufe → HP-Verlust pro Stunde */
function infectionDrain(level: number): number {
  return level >= 90 ? 4 : level >= 60 ? 1.5 : level >= 30 ? 0.5 : 0;
}

export class Health {
  hp = 100;
  readonly parts: Record<PartId, BodyPart> = newBody();
  /** Letzte Ursache, die am meisten Schaden gemacht hat – wird beim Tod angezeigt. */
  cause: string | null = null;
  /** Stunden bis zum Tod durch die Zombie-Infektion (null = nicht infiziert). Es gibt keine Heilung. */
  virus: number | null = null;

  /** Spielstand */
  toJSON(): { hp: number; parts: Record<PartId, BodyPart>; cause: string | null; virus: number | null } {
    return { hp: this.hp, parts: JSON.parse(JSON.stringify(this.parts)), cause: this.cause, virus: this.virus };
  }

  fromJSON(j: { hp?: number; parts?: Record<PartId, BodyPart>; cause?: string | null; virus?: number | null }): void {
    this.hp = j.hp ?? 100;
    this.cause = j.cause ?? null;
    this.virus = j.virus ?? null;
    const fresh = newBody();
    for (const id of PARTS) this.parts[id] = j.parts?.[id] ? JSON.parse(JSON.stringify(j.parts[id])) : fresh[id];
  }

  get infected(): boolean {
    return this.virus !== null;
  }

  /** Beginnt die Infektion (nach einem Biss): 24 bis 48 Spielstunden bis zum Tod. */
  infect(r: () => number = Math.random): void {
    if (this.virus === null) this.virus = 24 + r() * 24;
  }

  get dead(): boolean {
    return this.hp <= 0;
  }

  get allWounds(): { part: PartId; index: number; wound: Wound }[] {
    return PARTS.flatMap((part) => this.parts[part].wounds.map((wound, index) => ({ part, index, wound })));
  }

  get bleedingCount(): number {
    return this.allWounds.filter((x) => isBleeding(x.wound)).length;
  }

  get bleeding(): boolean {
    return this.bleedingCount > 0;
  }

  /** Gesamtschmerz 0..100 */
  get pain(): number {
    return Math.min(100, Math.round(PARTS.reduce((s, p) => s + partPain(this.parts[p]), 0)));
  }

  /** Höchste Infektionsstufe aller Wunden (0..100) */
  get infection(): number {
    return Math.round(Math.max(0, ...this.allWounds.map((x) => x.wound.infection)));
  }

  /** Bewegungsfaktor: Beinbrüche und starke Schmerzen bremsen */
  get moveFactor(): number {
    let f = 1;
    for (const id of ['legL', 'legR', 'footL', 'footR'] as PartId[]) {
      for (const w of this.parts[id].wounds) if (w.kind === 'fracture') f = Math.min(f, w.splint ? 0.85 : 0.55);
    }
    const pain = this.pain;
    if (pain >= 75) f *= 0.7;
    else if (pain >= 50) f *= 0.85;
    return f;
  }

  /** Neue Wunde an einem Körperteil. Verursacht Sofortschaden. */
  wound(part: PartId, kind: WoundKind, label: string, r: () => number = Math.random): Wound {
    const w = makeWound(kind, label, r);
    this.parts[part].wounds.push(w);
    this.hurt(WOUND[kind].damage, label);
    return w;
  }

  /** Direkter Schaden ohne Wunde (z. B. Aufprall) */
  hurt(amount: number, label: string): void {
    this.hp = Math.max(0, this.hp - amount);
    if (this.dead) this.cause = label;
  }

  heal(amount: number): void {
    this.hp = Math.min(100, this.hp + amount);
  }

  update(hours: number, needs: Needs, r: () => number = Math.random): void {
    let left = hours;
    while (left > 1e-9 && !this.dead) {
      const dt = Math.min(STEP, left);
      this.step(dt, needs, r);
      left -= dt;
    }
  }

  private step(dt: number, needs: Needs, r: () => number): void {
    const drains: [number, string][] = [];
    const fed = needs.values.hunger > 40 && needs.values.thirst > 40 && needs.values.warmth > 40;

    let bleed = 0;
    let infect = 0;
    for (const { wound: w } of this.allWounds) {
      if (isBleeding(w)) {
        bleed += WOUND[w.kind].bleedRate * dt;
        w.bleed = Math.max(0, w.bleed - dt);
      }
      if (w.bandaged && w.bandageLife > 0) w.bandageLife = Math.max(0, w.bandageLife - dt);
      if (w.alcohol > 0) w.alcohol = Math.max(0, w.alcohol - dt);
      infect += infectionDrain(w.infection) * dt;
      this.stepInfection(w, dt, r);
      // Heilung: nur ohne Infektion, bei Mangel langsamer
      if (w.infection <= 0) w.healed += dt * (fed ? 1 : 0.3);
    }
    for (const p of PARTS) {
      const bp = this.parts[p];
      bp.extraPain = Math.max(0, bp.extraPain - EXTRA_PAIN_DECAY * dt);
      bp.wounds = bp.wounds.filter((w) => w.healed < healTime(w));
    }

    if (this.virus !== null) {
      this.virus -= dt;
      if (this.virus <= 0) {
        this.hp = 0;
        this.cause = 'Zombie-Infektion';
        return;
      }
    }
    if (bleed > 0) drains.push([bleed, 'Verblutet']);
    if (infect > 0) drains.push([infect, 'Wundinfektion']);
    const v = needs.values;
    if (v.hunger <= 0) drains.push([STARVE * dt, 'Verhungert']);
    if (v.thirst <= 0) drains.push([DEHYDRATE * dt, 'Verdurstet']);
    if (v.warmth <= 0) drains.push([FREEZE * dt, 'Erfroren']);
    if (v.energy <= 0) drains.push([EXHAUST * dt, 'Erschöpft zusammengebrochen']);

    if (drains.length) {
      this.hp = Math.max(0, this.hp - drains.reduce((s, d) => s + d[0], 0));
      if (this.dead) this.cause = drains.sort((a, b) => b[0] - a[0])[0][1];
    } else if (fed) {
      this.hp = Math.min(100, this.hp + REGEN * dt);
    }
  }

  /** Infektion entsteht aus mehreren Faktoren und wächst, solange nichts dagegen getan wird. */
  private stepInfection(w: Wound, dt: number, r: () => number): void {
    if (w.infection > 0) {
      if (w.alcohol > 0) w.infection = Math.max(0, w.infection - 3 * dt);
      else if (w.bandaged && !isDirty(w) && w.infection < 30) w.infection = Math.max(0, w.infection - 0.5 * dt);
      else w.infection = Math.min(100, w.infection + (isDirty(w) ? 4 : 2.5) * dt);
      return;
    }
    let p = WOUND[w.kind].infect;
    if (p <= 0) return;
    p *= w.bandaged ? (isDirty(w) ? 2 : 0.6) : 1.6;
    if (w.alcohol > 0) p *= 0.15;
    if (w.stitched) p *= 0.6;
    if (r() < p * dt) w.infection = 5;
  }
}
