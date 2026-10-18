/** Chat im Mehrspieler: Enter öffnet das Eingabefeld, Nachrichten blenden nach einiger Zeit aus. */
export class ChatUI {
  private el = document.createElement('div');
  private log = document.createElement('div');
  private input = document.createElement('input');
  private open = false;
  private active = false;

  constructor(private send: (text: string) => void) {
    this.el.id = 'chat';
    this.log.className = 'clog';
    this.input.type = 'text';
    this.input.maxLength = 200;
    this.input.placeholder = 'Nachricht … (Enter senden, Esc abbrechen)';
    this.input.autocomplete = 'off';
    this.el.append(this.log, this.input);
    document.body.append(this.el);
    // Tasten im Eingabefeld gehören dem Chat, nicht dem Spiel
    for (const ev of ['keydown', 'keyup']) {
      this.input.addEventListener(ev, (e) => {
        const k = e as KeyboardEvent;
        if (ev === 'keydown') {
          if (k.code === 'Enter' || k.code === 'NumpadEnter') {
            const t = this.input.value;
            this.close();
            if (t.trim()) this.send(t);
          } else if (k.code === 'Escape') this.close();
        }
        e.stopPropagation();
      });
    }
    window.addEventListener('keydown', (e) => {
      if (!this.active || this.open || e.code !== 'Enter') return;
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      e.preventDefault();
      this.show();
    });
  }

  /** Nur während einer Mehrspieler-Sitzung sichtbar und bedienbar */
  setActive(on: boolean): void {
    this.active = on;
    this.el.classList.toggle('on', on);
    if (!on) {
      this.close();
      this.log.innerHTML = '';
    }
  }

  get typing(): boolean {
    return this.open;
  }

  private show(): void {
    this.open = true;
    this.el.classList.add('typing');
    this.input.value = '';
    this.input.focus();
  }

  private close(): void {
    this.open = false;
    this.el.classList.remove('typing');
    this.input.blur();
  }

  add(name: string, text: string, own: boolean): void {
    this.line(`<b class="${own ? 'me' : ''}">${esc(name)}</b> ${esc(text)}`);
  }

  system(text: string): void {
    this.line(`<i>${esc(text)}</i>`);
  }

  private line(html: string): void {
    const d = document.createElement('div');
    d.className = 'cl';
    d.innerHTML = html;
    this.log.append(d);
    while (this.log.children.length > 40) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
    setTimeout(() => d.classList.add('old'), 9000);
  }
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
