import { Stack, item } from '../data/items';

/** Legt Items in eine Stapelliste (Bodenhaufen, Möbel). Behälter in der Welt haben kein Platzlimit. */
export function stashInto(list: Stack[], id: string, qty: number): void {
  const max = item(id).maxStack;
  let left = qty;
  for (const s of list) {
    if (s.id !== id || left <= 0) continue;
    const n = Math.min(left, max - s.qty);
    s.qty += n;
    left -= n;
  }
  while (left > 0) {
    const n = Math.min(left, max);
    list.push({ id, qty: n });
    left -= n;
  }
}

export function weightOf(list: readonly Stack[]): number {
  return Math.round(list.reduce((s, st) => s + item(st.id).weight * st.qty, 0) * 100) / 100;
}
