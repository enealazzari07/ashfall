/**
 * Abgleich veränderlicher Weltzustände zwischen Spielern (Türen, Fenster, Behälter, Haufen, Bauten):
 * Jeder Teilnehmer vergleicht regelmäßig seinen Zustand mit dem zuletzt gesendeten oder empfangenen
 * und schickt nur, was sich geändert hat. Letzte Änderung gewinnt.
 */
export class DynTracker {
  private last = new Map<string, string>();

  /** Einträge, die sich seit dem letzten Aufruf verändert haben (und merkt sie sich) */
  diff(entries: Iterable<[string, unknown]>): [string, unknown][] {
    const out: [string, unknown][] = [];
    for (const [k, v] of entries) {
      const j = JSON.stringify(v);
      if (this.last.get(k) !== j) {
        this.last.set(k, j);
        out.push([k, v]);
      }
    }
    return out;
  }

  /** Alles als bekannt vormerken, ohne zu senden (Ausgangslage beim Beitritt) */
  baseline(entries: Iterable<[string, unknown]>): void {
    for (const [k, v] of entries) this.last.set(k, JSON.stringify(v));
  }

  /** Empfangene Einträge als bekannt vormerken, damit sie nicht zurückgeschickt werden */
  known(entries: Iterable<[string, unknown]>): void {
    this.baseline(entries);
  }

  /** Schlüssel mit Präfix, die es nicht mehr gibt (z. B. abgeräumte Haufen); entfernt sie aus dem Gedächtnis */
  gone(prefix: string, current: Set<string>): string[] {
    const out: string[] = [];
    for (const k of [...this.last.keys()]) {
      if (k.startsWith(prefix) && !current.has(k.slice(prefix.length))) {
        this.last.delete(k);
        out.push(k.slice(prefix.length));
      }
    }
    return out;
  }

  /** Vergessen (z. B. nach einem Wechsel der Sitzung) */
  reset(): void {
    this.last.clear();
  }
}
