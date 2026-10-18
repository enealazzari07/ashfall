/**
 * Spielstände: benannte Slots mit Vorschaubild. In der Desktop-App liegt je Slot eine Datei im Benutzerordner
 * (über die Preload-Schnittstelle `ashfallSaves`), im Browser wird `localStorage` benutzt.
 * Der Spielzustand selbst (`Snapshot`) wird in `Game.snapshot()` zusammengestellt und in `Game.restore()` eingelesen.
 */
export const SAVE_VERSION = 1;

export interface SaveMeta {
  id: string;
  name: string;
  /** Zeitpunkt des Speicherns (ms seit 1970) */
  savedAt: number;
  /** Spieltag und Uhrzeit (Sekunden seit Mitternacht) */
  day: number;
  seconds: number;
  /** Echte Spielzeit in Sekunden */
  playtime: number;
  hp: number;
  /** Name des Charakters */
  who: string;
  /** Vorschaubild (JPEG als data-URL, klein) */
  thumb: string;
  auto: boolean;
  version: number;
}

/** Beliebiger JSON-Inhalt; die Struktur legt `Game.snapshot()` fest */
export type Snapshot = Record<string, unknown>;

export interface SaveFile {
  meta: SaveMeta;
  data: Snapshot;
}

interface Bridge {
  list(): Promise<SaveMeta[]>;
  read(id: string): Promise<string | null>;
  write(id: string, json: string): Promise<boolean>;
  remove(id: string): Promise<boolean>;
}

declare global {
  interface Window {
    ashfallSaves?: Bridge;
  }
}

const LS_INDEX = 'ashfall.saves';
const LS_PREFIX = 'ashfall.save.';

const bridge = (): Bridge | null => (typeof window !== 'undefined' && window.ashfallSaves ? window.ashfallSaves : null);

function lsIndex(): SaveMeta[] {
  try {
    return JSON.parse(localStorage.getItem(LS_INDEX) ?? '[]') as SaveMeta[];
  } catch {
    return [];
  }
}

export const newSaveId = (): string => `s${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** Alle Spielstände, neueste zuerst */
export async function listSaves(): Promise<SaveMeta[]> {
  const b = bridge();
  const metas = b ? await b.list() : lsIndex();
  return [...metas].sort((a, c) => c.savedAt - a.savedAt);
}

export async function readSave(id: string): Promise<SaveFile | null> {
  const b = bridge();
  try {
    const raw = b ? await b.read(id) : localStorage.getItem(LS_PREFIX + id);
    if (!raw) return null;
    const f = JSON.parse(raw) as SaveFile;
    return f?.meta && f.data ? f : null;
  } catch {
    return null;
  }
}

/** Schreibt den Slot; gibt false zurück, wenn der Speicher voll oder gesperrt ist */
export async function writeSave(file: SaveFile): Promise<boolean> {
  const json = JSON.stringify(file);
  const b = bridge();
  if (b) return b.write(file.meta.id, json);
  try {
    localStorage.setItem(LS_PREFIX + file.meta.id, json);
    const idx = lsIndex().filter((m) => m.id !== file.meta.id);
    idx.push(file.meta);
    localStorage.setItem(LS_INDEX, JSON.stringify(idx));
    return true;
  } catch {
    return false;
  }
}

export async function deleteSave(id: string): Promise<void> {
  const b = bridge();
  if (b) {
    await b.remove(id);
    return;
  }
  try {
    localStorage.removeItem(LS_PREFIX + id);
    localStorage.setItem(LS_INDEX, JSON.stringify(lsIndex().filter((m) => m.id !== id)));
  } catch {
    /* ignorieren */
  }
}

export async function renameSave(id: string, name: string): Promise<boolean> {
  const f = await readSave(id);
  if (!f) return false;
  f.meta.name = cleanName(name) || f.meta.name;
  return writeSave(f);
}

/** Nur druckbare Zeichen, höchstens 32 */
export function cleanName(s: string): string {
  return s.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 32);
}

/** "Tag 4, 08:30" */
export function whenLabel(m: Pick<SaveMeta, 'day' | 'seconds'>): string {
  const h = Math.floor(m.seconds / 3600) % 24, min = Math.floor((m.seconds % 3600) / 60);
  return `Tag ${m.day}, ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** "2 Std. 05 Min." */
export function playLabel(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h} Std. ${String(m).padStart(2, '0')} Min.` : `${m} Min.`;
}

/** Gespeichert am 17.10.2026, 22:30 */
export function savedLabel(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
