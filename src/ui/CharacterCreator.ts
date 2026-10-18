import './creator.css';
import { PROFESSIONS, profession } from '../data/professions';
import { SKILLS, skillName } from '../data/skills';
import { TRAITS, trait } from '../data/traits';
import { item } from '../data/items';
import { BASE_POINTS, Build, DEFAULT_BUILD, pointsLeft, randomBuild, validateBuild, whyNotTrait } from '../sim/Profile';

const KEY = 'ashfall.build';

function load(): Build {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const b = { ...DEFAULT_BUILD, ...(JSON.parse(raw) as Partial<Build>) };
      if (validateBuild(b).ok) return b;
    }
  } catch {
    /* ohne Speicher weiter */
  }
  return { ...DEFAULT_BUILD, traits: [] };
}

function save(b: Build): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    /* ignorieren */
  }
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Charaktererstellung: Name, Beruf und Eigenschaften mit Punktebudget */
export class CharacterCreator {
  private root: HTMLDivElement;
  private b: Build = load();
  private done: ((b: Build) => void) | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'creator';
    document.body.appendChild(this.root);
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'cc-name') {
        this.b.name = t.value.slice(0, 24);
        this.refreshFooter();
      }
    });
    // Tasten dürfen das Spiel nicht erreichen, solange die Maske offen ist
    this.root.addEventListener('keydown', (e) => e.stopPropagation());
  }

  get isOpen(): boolean {
    return this.root.classList.contains('on');
  }

  open(done: (b: Build) => void): void {
    this.done = done;
    this.b = load();
    this.root.classList.add('on');
    this.render();
  }

  close(): void {
    this.root.classList.remove('on');
  }

  private onClick(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const act = el.dataset.act!;
    if (act === 'prof') {
      this.b.profession = el.dataset.id!;
      // Eigenschaften, die das Budget sprengen würden, fallen wieder weg (zuletzt gewählte zuerst)
      while (pointsLeft(this.b) < 0 && this.b.traits.length) this.b.traits.pop();
    } else if (act === 'trait') {
      const id = el.dataset.id!;
      if (this.b.traits.includes(id)) {
        const without = { ...this.b, traits: this.b.traits.filter((t) => t !== id) };
        if (pointsLeft(without) >= 0) this.b.traits = without.traits;
      } else if (!whyNotTrait(this.b, id)) this.b.traits.push(id);
    } else if (act === 'look') {
      this.b.look = el.dataset.id === 'dress' ? 'dress' : 'standard';
    } else if (act === 'random') {
      this.b = randomBuild(Math.random, this.b.name);
    } else if (act === 'start') {
      const v = validateBuild(this.b);
      if (!v.ok) return;
      this.b.name = this.b.name.trim();
      save(this.b);
      this.close();
      this.done?.({ ...this.b, traits: [...this.b.traits] });
      return;
    }
    this.render();
  }

  private refreshFooter(): void {
    const v = validateBuild(this.b);
    const btn = this.root.querySelector<HTMLButtonElement>('[data-act="start"]');
    if (btn) btn.disabled = !v.ok;
    const msg = this.root.querySelector<HTMLElement>('.cc-msg');
    if (msg) msg.textContent = v.ok ? '' : v.reason ?? '';
  }

  private render(): void {
    const b = this.b;
    const points = pointsLeft(b);
    const prof = profession(b.profession);
    const profCards = PROFESSIONS.map((p) => {
      const boosts = Object.keys(p.boost).map((k) => skillName(k as never)).join(', ') || 'keine';
      return `<button class="card prof${p.id === b.profession ? ' sel' : ''}" data-act="prof" data-id="${p.id}">
        <b>${p.name}</b><i class="${p.cost > 0 ? 'cost' : p.cost < 0 ? 'gain' : ''}">${p.cost > 0 ? '−' + p.cost : p.cost < 0 ? '+' + -p.cost : '±0'}</i>
        <span>${p.desc}</span><em>Lernt schneller: ${boosts}</em></button>`;
    }).join('');
    const traitBtn = (id: string) => {
      const t = trait(id)!;
      const on = b.traits.includes(id);
      const why = on ? null : whyNotTrait(b, id);
      return `<button class="card tr${on ? ' sel' : ''}${why ? ' off' : ''}" data-act="trait" data-id="${id}" title="${esc(why ?? t.desc)}">
        <b>${t.name}</b><i class="${t.cost > 0 ? 'cost' : 'gain'}">${t.cost > 0 ? '−' + t.cost : '+' + -t.cost}</i><span>${t.desc}</span></button>`;
    };
    const good = TRAITS.filter((t) => t.cost > 0).map((t) => traitBtn(t.id)).join('');
    const bad = TRAITS.filter((t) => t.cost < 0).map((t) => traitBtn(t.id)).join('');
    const skillRows = SKILLS.filter((s) => (prof.start[s.id] ?? 0) > 0 || (prof.boost[s.id] ?? 0) > 0)
      .map((s) => `<li><span>${s.name}</span><b>Stufe ${prof.start[s.id] ?? 0}</b></li>`).join('');
    const items = prof.items.map((s) => `${s.qty}× ${item(s.id).name}`).join(', ') || 'nichts Besonderes';
    this.root.innerHTML = `
      <div class="cc-sheet">
        <header><h2>Neuer Überlebender</h2>
          <label>Name <input id="cc-name" maxlength="24" value="${esc(b.name)}" autocomplete="off"></label></header>
        <div class="cc-cols">
          <section><h3>Aussehen</h3><div class="cc-grid">
            <button class="card${b.look !== 'dress' ? ' sel' : ''}" data-act="look" data-id="standard"><b>Kapuzenpulli</b><span>Pulli und Hose, warm und praktisch.</span></button>
            <button class="card${b.look === 'dress' ? ' sel' : ''}" data-act="look" data-id="dress"><b>Kleid</b><span>Sommerkleid, das beim Gehen weht. Pulli kommt in den Rucksack.</span></button></div>
            <h3>Beruf</h3><div class="cc-grid">${profCards}</div></section>
          <section><h3>Vorteile</h3><div class="cc-grid">${good}</div><h3>Nachteile</h3><div class="cc-grid">${bad}</div></section>
          <aside><h3>Punkte</h3><div class="pts ${points < 0 ? 'neg' : ''}"><b>${points}</b><span>von ${BASE_POINTS}${prof.cost ? (prof.cost > 0 ? ` − ${prof.cost} Beruf` : ` + ${-prof.cost} Beruf`) : ''}</span></div>
            <h3>${prof.name}</h3><p>${prof.desc}</p>
            <h4>Startwissen</h4><ul class="sk">${skillRows || '<li><span>Keine Vorkenntnisse</span></li>'}</ul>
            <h4>Ausrüstung</h4><p>${items}</p>
          </aside>
        </div>
        <footer><span class="cc-msg"></span><button data-act="random">Zufall</button><button class="go" data-act="start">Überleben beginnen</button></footer>
      </div>`;
    this.refreshFooter();
  }
}
