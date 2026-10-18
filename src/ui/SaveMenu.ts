import './saves.css';
import { SaveMeta, cleanName, deleteSave, listSaves, playLabel, renameSave, savedLabel, whenLabel } from '../core/SaveSystem';

export interface SaveHooks {
  /** Spielstand laden (startet das Spiel mit diesem Slot neu) */
  load(id: string): void;
  /** Speichern; `id` = bestehenden Slot überschreiben. Gibt true zurück, wenn es geklappt hat. */
  save(name: string, id?: string): Promise<boolean>;
  /** Vorschlag für den Namen eines neuen Spielstands */
  suggest(): string;
  /** Meldung am Rand (z. B. "Gespeichert") */
  toast(msg: string, kind?: 'good' | 'warn' | 'info'): void;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Spielstände durchsuchen, laden, speichern, umbenennen und löschen */
export class SaveMenu {
  private root = document.createElement('div');
  private mode: 'load' | 'save' = 'load';
  private saves: SaveMeta[] = [];
  private sel = '';
  /** Slot, der gerade umbenannt oder dessen Löschen bestätigt wird */
  private editing: { id: string; kind: 'rename' | 'delete' } | null = null;
  private busy = false;
  onClose: () => void = () => {};

  constructor(private hooks: SaveHooks) {
    this.root.id = 'savemenu';
    document.body.append(this.root);
    this.root.addEventListener('click', (e) => void this.onClick(e));
    this.root.addEventListener('dblclick', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.svslot');
      if (card && this.mode === 'load') this.hooks.load(card.dataset.id!);
    });
    // Vor allen anderen Tastenhörern (Menü, Spiel) abfangen, damit Tippen in Textfeldern funktioniert
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.isOpen) return;
        e.stopPropagation();
        if (e.code === 'Escape') {
          e.preventDefault();
          if (this.editing) {
            this.editing = null;
            this.render();
          } else this.close();
        } else if (e.code === 'Enter') {
          const t = e.target as HTMLElement;
          if (t.matches('input[data-f="new"]')) void this.saveNew();
          else if (t.matches('input[data-f="rename"]')) void this.commitRename((t as HTMLInputElement).value);
        }
      },
      true,
    );
  }

  get isOpen(): boolean {
    return this.root.classList.contains('on');
  }

  async open(mode: 'load' | 'save'): Promise<void> {
    this.mode = mode;
    this.editing = null;
    this.root.classList.add('on');
    await this.reload();
  }

  close(): void {
    this.root.classList.remove('on');
    this.onClose();
  }

  private async reload(): Promise<void> {
    this.saves = await listSaves();
    if (!this.saves.some((s) => s.id === this.sel)) this.sel = this.saves[0]?.id ?? '';
    this.render();
  }

  private render(): void {
    const m = this.mode;
    const cards = this.saves.length
      ? this.saves
          .map((s) => {
            const on = s.id === this.sel;
            const ed = this.editing?.id === s.id ? this.editing.kind : null;
            const title =
              ed === 'rename'
                ? `<input data-f="rename" maxlength="32" value="${esc(s.name)}" autocomplete="off">`
                : `<b>${esc(s.name)}</b>${s.auto ? '<em>Auto</em>' : ''}`;
            const confirm =
              ed === 'delete'
                ? `<div class="svconfirm">Wirklich löschen? <button data-act="del-yes">Ja, löschen</button><button data-act="del-no">Abbrechen</button></div>`
                : '';
            return `<div class="svslot${on ? ' sel' : ''}" data-id="${s.id}">
              <div class="svthumb">${s.thumb ? `<img src="${s.thumb}" alt="">` : '<span>Kein Bild</span>'}</div>
              <div class="svinfo">${title}
                <span>${esc(s.who)} · ${whenLabel(s)} · ${playLabel(s.playtime)}</span>
                <small>${savedLabel(s.savedAt)} · Gesundheit ${s.hp} %</small>
                ${confirm}
              </div>
              <div class="svact">
                <button data-act="${m === 'load' ? 'load' : 'over'}" title="${m === 'load' ? 'Laden' : 'Überschreiben'}">${m === 'load' ? 'Laden' : 'Überschreiben'}</button>
                <button data-act="rename" title="Umbenennen">Umbenennen</button>
                <button data-act="del" class="danger" title="Löschen">Löschen</button>
              </div>
            </div>`;
          })
          .join('')
      : `<div class="svnone">${m === 'load' ? 'Noch keine Spielstände.' : 'Noch kein Spielstand – gib unten einen Namen ein.'}</div>`;
    const newRow =
      m === 'save'
        ? `<div class="svnew"><input data-f="new" maxlength="32" placeholder="Name des neuen Spielstands" value="${esc(this.hooks.suggest())}" autocomplete="off">
            <button data-act="new" class="go">Neu speichern</button></div>`
        : '';
    this.root.innerHTML = `<div class="svbox">
        <header><h2>${m === 'load' ? 'Spielstand laden' : 'Spiel speichern'}</h2><button data-act="close" class="x" title="Schließen (Esc)">×</button></header>
        <div class="svslots">${cards}</div>
        ${newRow}
        <footer><span>${m === 'load' ? 'Doppelklick lädt den Spielstand.' : 'Ein bestehender Slot wird überschrieben.'}</span><button data-act="close">Zurück</button></footer>
      </div>`;
    const inp = this.root.querySelector<HTMLInputElement>('input[data-f="rename"]');
    if (inp) {
      inp.focus();
      inp.select();
    }
  }

  private async onClick(e: MouseEvent): Promise<void> {
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    const card = t.closest<HTMLElement>('.svslot');
    const id = card?.dataset.id;
    if (card && id && id !== this.sel && !t.closest('input')) {
      this.sel = id;
      this.render();
      if (!act) return;
    }
    if (!act) return;
    if (this.busy) return;
    if (act === 'close') return this.close();
    if (act === 'load' && id) return this.hooks.load(id);
    if (act === 'new') return void this.saveNew();
    if (act === 'over' && id) return void this.overwrite(id);
    if (act === 'rename' && id) {
      this.editing = { id, kind: 'rename' };
      return this.render();
    }
    if (act === 'del' && id) {
      this.editing = { id, kind: 'delete' };
      return this.render();
    }
    if (act === 'del-no') {
      this.editing = null;
      return this.render();
    }
    if (act === 'del-yes' && id) {
      this.busy = true;
      await deleteSave(id);
      this.busy = false;
      this.editing = null;
      this.hooks.toast('Spielstand gelöscht', 'info');
      return this.reload();
    }
  }

  private async commitRename(name: string): Promise<void> {
    const ed = this.editing;
    if (!ed || ed.kind !== 'rename') return;
    const n = cleanName(name);
    this.editing = null;
    if (n) await renameSave(ed.id, n);
    await this.reload();
  }

  private async saveNew(): Promise<void> {
    const name = cleanName(this.root.querySelector<HTMLInputElement>('input[data-f="new"]')?.value ?? '') || this.hooks.suggest();
    await this.doSave(name);
  }

  private async overwrite(id: string): Promise<void> {
    const old = this.saves.find((s) => s.id === id);
    await this.doSave(old?.name ?? this.hooks.suggest(), id);
  }

  private async doSave(name: string, id?: string): Promise<void> {
    this.busy = true;
    const ok = await this.hooks.save(name, id);
    this.busy = false;
    this.hooks.toast(ok ? `Gespeichert: ${name}` : 'Speichern fehlgeschlagen (Speicher voll?)', ok ? 'good' : 'warn');
    if (ok) await this.reload();
  }
}
