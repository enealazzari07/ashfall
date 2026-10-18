import { Inventory } from './Inventory';
import { Health } from './Health';
import { ALCOHOL_HOURS, BANDAGE_HOURS, PART_NAME, PartId, Wound, WOUND_NAME, isBleeding, isDirty } from './Body';

export type TreatAction = 'bandage' | 'disinfect' | 'stitch' | 'splint' | 'unbandage';

/** Welches Item eine Behandlung verbraucht (null = keines) */
export const TREAT_ITEM: Record<TreatAction, string | null> = {
  bandage: 'bandage',
  disinfect: 'disinfectant',
  stitch: 'suture',
  splint: 'splint',
  unbandage: null,
};

export const TREAT_NAME: Record<TreatAction, string> = {
  bandage: 'Verband',
  disinfect: 'Desinfizieren',
  stitch: 'Nähen',
  splint: 'Schiene',
  unbandage: 'Verband ab',
};

/** Dauer der Behandlung in Sekunden */
export const TREAT_TIME: Record<TreatAction, number> = { bandage: 3.5, disinfect: 2.5, stitch: 7, splint: 6, unbandage: 1.5 };

export type Outcome = { ok: true; msg: string } | { ok: false; reason: string };

export interface TreatOpts {
  /** Arzt-Fertigkeit 0..10 (kommt mit dem Fertigkeitensystem) */
  doctor?: number;
  r?: () => number;
}

/** Warum die Behandlung an dieser Wunde nicht geht (ohne Item-Prüfung); null = möglich. */
export function whyNot(w: Wound, action: TreatAction): string | null {
  switch (action) {
    case 'bandage':
      if (w.kind === 'fracture') return 'Einen Bruch verbindet man nicht, er braucht eine Schiene.';
      if (w.bandaged && !isDirty(w)) return 'Hier liegt schon ein sauberer Verband.';
      return null;
    case 'unbandage':
      return w.bandaged ? null : 'Hier liegt kein Verband.';
    case 'disinfect':
      if (w.kind === 'fracture') return 'Ein Bruch muss nicht desinfiziert werden.';
      return w.alcohol > 0 && w.infection <= 0 ? 'Die Wunde ist schon desinfiziert.' : null;
    case 'stitch':
      if (w.kind === 'scratch' || w.kind === 'fracture') return 'Das muss nicht genäht werden.';
      return w.stitched ? 'Die Wunde ist schon genäht.' : null;
    case 'splint':
      if (w.kind !== 'fracture') return 'Eine Schiene hilft nur bei einem Bruch.';
      return w.splint ? 'Der Bruch ist schon geschient.' : null;
  }
}

/** Behandelt eine Wunde: prüft Möglichkeit und Item, verbraucht das Item, ändert die Wunde. */
export function treat(health: Health, inv: Inventory, part: PartId, index: number, action: TreatAction, opts: TreatOpts = {}): Outcome {
  const w = health.parts[part].wounds[index];
  if (!w) return { ok: false, reason: 'Diese Wunde gibt es nicht mehr.' };
  const why = whyNot(w, action);
  if (why) return { ok: false, reason: why };
  const itemId = TREAT_ITEM[action];
  if (itemId && inv.count(itemId) < 1) return { ok: false, reason: `Dir fehlt: ${TREAT_NAME[action]}-Material.` };
  const doc = opts.doctor ?? 0;
  const r = opts.r ?? Math.random;
  const bp = health.parts[part];
  const where = `${WOUND_NAME[w.kind]} (${PART_NAME[part]})`;
  if (itemId) inv.consume([{ id: itemId, qty: 1 }]);

  switch (action) {
    case 'bandage': {
      w.bandaged = true;
      w.bandageLife = BANDAGE_HOURS * (1 + 0.1 * doc) * (0.8 + 0.4 * r());
      return { ok: true, msg: `Verband angelegt: ${where}, hält etwa ${Math.round(w.bandageLife)} h.` };
    }
    case 'unbandage': {
      w.bandaged = false;
      w.bandageLife = 0;
      return { ok: true, msg: `Verband abgenommen: ${where}.` };
    }
    case 'disinfect': {
      w.alcohol = ALCOHOL_HOURS;
      w.infection = Math.max(0, w.infection - 25);
      bp.extraPain += Math.max(4, 15 - doc);
      return { ok: true, msg: `Desinfiziert: ${where}. Das brennt.` };
    }
    case 'stitch': {
      w.stitched = true;
      bp.extraPain += Math.max(6, 20 - doc);
      // Nähen kann Keime einbringen – weniger mit Desinfektion und Erfahrung
      const risk = (0.2 / (1 + 0.25 * doc)) * (w.alcohol > 0 ? 0.25 : 1);
      if (w.infection <= 0 && r() < risk) w.infection = 5;
      return { ok: true, msg: `Genäht: ${where}.` };
    }
    case 'splint': {
      w.splint = true;
      return { ok: true, msg: `Geschient: ${where}.` };
    }
  }
}

/** Ziel für eine Schnellanwendung (Item benutzen): die dringendste Wunde, auf die die Behandlung passt. */
export function autoTarget(health: Health, action: TreatAction): { part: PartId; index: number } | null {
  const cand = health.allWounds.filter((x) => whyNot(x.wound, action) === null);
  if (!cand.length) return null;
  const score = (w: Wound): number => {
    switch (action) {
      case 'bandage':
        return (isBleeding(w) ? 100 : 0) + (isDirty(w) ? 30 : 0) + w.infection + (w.bandaged ? 0 : 10);
      case 'disinfect':
        return w.infection * 2 + (w.bandaged && !isDirty(w) ? 0 : 20) + (w.kind === 'deep' ? 5 : 0);
      case 'stitch':
        return (isBleeding(w) ? 100 : 0) + (w.kind === 'deep' ? 20 : 0);
      default:
        return 1;
    }
  };
  cand.sort((a, b) => score(b.wound) - score(a.wound));
  return { part: cand[0].part, index: cand[0].index };
}

/** Beschreibung des Zustands einer Wunde für die Anzeige */
export function woundStatus(w: Wound): { text: string; tone: 'ok' | 'warn' | 'bad' }[] {
  const out: { text: string; tone: 'ok' | 'warn' | 'bad' }[] = [];
  if (isBleeding(w)) out.push({ text: 'blutet', tone: 'bad' });
  if (w.bandaged) out.push(isDirty(w) ? { text: 'Verband abgelaufen', tone: 'warn' } : { text: `Verband ${Math.ceil(w.bandageLife)} h`, tone: 'ok' });
  if (w.stitched) out.push({ text: 'genäht', tone: 'ok' });
  if (w.splint) out.push({ text: 'geschient', tone: 'ok' });
  if (w.alcohol > 0) out.push({ text: `desinfiziert ${Math.ceil(w.alcohol)} h`, tone: 'ok' });
  if (w.infection > 0) out.push({ text: `entzündet ${Math.round(w.infection)} %`, tone: w.infection >= 60 ? 'bad' : 'warn' });
  return out;
}
