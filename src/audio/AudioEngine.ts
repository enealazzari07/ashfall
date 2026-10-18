/**
 * Klang des Spiels, komplett synthetisch (WebAudio): keine Audiodateien nötig.
 * Alle Klänge entstehen aus Rauschen, Schwingungen und Filtern. Ohne AudioContext (Tests, alte Umgebung)
 * tun alle Aufrufe nichts.
 */
export type Surface = 'asphalt' | 'concrete' | 'grass' | 'wood' | 'carpet';
export type ZombieVoice = 'shambler' | 'fast' | 'sprinter';
export type UiSound = 'click' | 'open' | 'close' | 'error' | 'pickup' | 'drop';

/** Reichweite in Metern, ab der Geräusche nicht mehr hörbar sind */
const HEAR = 38;

export interface ListenerPose {
  x: number;
  z: number;
  /** Blickrichtung der Kamera (Rad); bestimmt links/rechts */
  yaw: number;
}

export interface AmbientState {
  night: number;
  rain: number;
  clouds: number;
  indoors: boolean;
  /** 0..1: Bedrohung (Zombies verfolgen, nahe Zombies) */
  tension: number;
  /** Gesundheit 0..100 */
  hp: number;
  /** Zombie nahe und aktiv (für den Herzschlag) */
  chased: boolean;
  dt: number;
}

interface NoiseOpts {
  filter?: BiquadFilterType;
  f?: number;
  f2?: number;
  q?: number;
  gain?: number;
  attack?: number;
  pan?: number;
  bus?: 'sfx' | 'amb';
  delay?: number;
  /** Abklingform: 1 = linear, größer = schneller */
  curve?: number;
}

interface ToneOpts {
  type?: OscillatorType;
  f: number;
  f2?: number;
  gain?: number;
  attack?: number;
  pan?: number;
  bus?: 'sfx' | 'amb';
  delay?: number;
  detune?: number;
}

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** Lautstärke und Stereo-Position eines Geräuschs aus Sicht des Hörers */
export function spatial(l: ListenerPose, x: number, z: number): { gain: number; pan: number; dist: number } {
  const dx = x - l.x, dz = z - l.z;
  const dist = Math.hypot(dx, dz);
  const gain = clamp(1 - dist / HEAR, 0, 1) ** 1.6;
  // Blickrichtung f = (sin yaw, cos yaw); rechts davon (y oben) ist (-f.z, f.x)
  const side = dist > 0.001 ? (-dx * Math.cos(l.yaw) + dz * Math.sin(l.yaw)) / dist : 0;
  return { gain, pan: clamp(side * 0.85, -1, 1), dist };
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private music!: GainNode;
  private lowpass!: BiquadFilterNode;
  private reverb: ConvolverNode | null = null;
  private white!: AudioBuffer;
  private pink!: AudioBuffer;
  private brown!: AudioBuffer;
  private vol = { master: 0.8, music: 0.5, sfx: 0.9 };
  private pose: ListenerPose = { x: 0, z: 0, yaw: 0 };
  private lastUi = 0;
  private lastPick = 0;
  // Dauerklänge
  private wind: { g: GainNode; f: BiquadFilterNode } | null = null;
  private rain: GainNode | null = null;
  private padOsc: OscillatorNode[] = [];
  private padGain: GainNode | null = null;
  private tensionGain: GainNode | null = null;
  private tensionOsc: OscillatorNode[] = [];
  private car: { osc: OscillatorNode[]; g: GainNode; f: BiquadFilterNode } | null = null;
  // Zeitgeber für zufällige Ambient-Klänge
  private birdT = 4;
  private cricketT = 3;
  private heartT = 0;
  private chordT = 0;
  private chordI = 0;
  enabled = true;

  /** Bindet die Freigabe an die erste Eingabe (Browser erlauben Ton erst nach einer Geste) */
  init(): void {
    if (typeof window === 'undefined') return;
    const go = (): void => {
      this.unlock();
      if (this.ctx?.state === 'running') {
        window.removeEventListener('pointerdown', go, true);
        window.removeEventListener('keydown', go, true);
      }
    };
    window.addEventListener('pointerdown', go, true);
    window.addEventListener('keydown', go, true);
    // Klick-Geräusch für Bedienelemente
    window.addEventListener(
      'click',
      (e) => {
        const t = e.target as HTMLElement | null;
        if (t?.closest?.('button, li[data-i], .tabbtn, [data-act], .svslot, select')) this.ui('click');
      },
      true,
    );
  }

  private unlock(): void {
    if (!this.ctx) {
      const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      this.build();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Lautstärken 0..1 */
  setVolumes(master: number, music: number, sfx: number): void {
    this.vol = { master, music, sfx };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(master, t, 0.05);
    this.music.gain.setTargetAtTime(music * 0.5, t, 0.1);
    this.sfx.gain.setTargetAtTime(sfx, t, 0.05);
    this.amb.gain.setTargetAtTime(sfx * 0.9, t, 0.05);
  }

  setListener(x: number, z: number, yaw: number): void {
    this.pose = { x, z, yaw };
  }

  // --- Aufbau ----------------------------------------------------------------------------

  private build(): void {
    const c = this.ctx!;
    this.master = c.createGain();
    this.master.gain.value = this.vol.master;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 5;
    this.lowpass = c.createBiquadFilter(); // Wände dämpfen draußen Klänge, wenn man im Haus ist
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 20000;
    this.master.connect(this.lowpass).connect(comp).connect(c.destination);
    this.sfx = c.createGain();
    this.amb = c.createGain();
    this.music = c.createGain();
    this.sfx.gain.value = this.vol.sfx;
    this.amb.gain.value = this.vol.sfx * 0.9;
    this.music.gain.value = this.vol.music * 0.5;
    this.sfx.connect(this.master);
    this.amb.connect(this.master);
    this.music.connect(this.master);
    this.white = this.noiseBuffer('white');
    this.pink = this.noiseBuffer('pink');
    this.brown = this.noiseBuffer('brown');
    this.buildReverb();
    this.buildAmbient();
    this.buildMusic();
  }

  private noiseBuffer(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
    const c = this.ctx!;
    const len = c.sampleRate * 3;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  private buildReverb(): void {
    const c = this.ctx!;
    const len = Math.floor(c.sampleRate * 2.2);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    this.reverb = c.createConvolver();
    this.reverb.buffer = buf;
    const wet = c.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.music);
  }

  // --- Bausteine ---------------------------------------------------------------------------

  private bus(b: 'sfx' | 'amb' | undefined): GainNode {
    return b === 'amb' ? this.amb : this.sfx;
  }

  private out(node: AudioNode, pan: number, bus?: 'sfx' | 'amb'): void {
    const c = this.ctx!;
    if (pan !== 0 && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      node.connect(p).connect(this.bus(bus));
    } else node.connect(this.bus(bus));
  }

  /** Rauschstoß mit Filter und Abklingen */
  private noise(kind: 'white' | 'pink' | 'brown', dur: number, o: NoiseOpts = {}): void {
    const c = this.ctx;
    if (!c || !this.enabled) return;
    const t0 = c.currentTime + (o.delay ?? 0);
    const src = c.createBufferSource();
    src.buffer = kind === 'white' ? this.white : kind === 'pink' ? this.pink : this.brown;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = o.filter ?? 'lowpass';
    f.frequency.setValueAtTime(o.f ?? 1000, t0);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + dur);
    f.Q.value = o.q ?? 0.8;
    const g = c.createGain();
    const peak = o.gain ?? 0.5;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + (o.attack ?? 0.004));
    g.gain.setTargetAtTime(0.0001, t0 + (o.attack ?? 0.004), dur / (3 * (o.curve ?? 1)));
    src.connect(f).connect(g);
    this.out(g, o.pan ?? 0, o.bus);
    src.start(t0, Math.random() * 2);
    src.stop(t0 + dur + 0.1);
  }

  /** Ton mit optionaler Tonhöhenänderung */
  private tone(dur: number, o: ToneOpts): void {
    const c = this.ctx;
    if (!c || !this.enabled) return;
    const t0 = c.currentTime + (o.delay ?? 0);
    const osc = c.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.f2), t0 + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.gain ?? 0.3, t0 + (o.attack ?? 0.005));
    g.gain.setTargetAtTime(0.0001, t0 + (o.attack ?? 0.005), dur / 3);
    osc.connect(g);
    this.out(g, o.pan ?? 0, o.bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.1);
  }

  /** Stimme: gesägte Schwingung durch zwei Formantfilter, mit Vibrato */
  private voice(dur: number, f0: number, f1: number, formants: [number, number], gain: number, pan: number, rough = 0.3, delay = 0): void {
    const c = this.ctx;
    if (!c || !this.enabled) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const lfo = c.createOscillator();
    const lfoG = c.createGain();
    lfo.frequency.value = rand(4.5, 7.5);
    lfoG.gain.value = f0 * 0.04;
    lfo.connect(lfoG).connect(osc.frequency);
    const mix = c.createGain();
    for (const fc of formants) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fc;
      bp.Q.value = 5;
      osc.connect(bp).connect(mix);
    }
    // Atem/Rauheit
    if (rough > 0) {
      const n = c.createBufferSource();
      n.buffer = this.pink;
      n.loop = true;
      const nf = c.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = formants[0] * 1.3;
      nf.Q.value = 1.2;
      const ng = c.createGain();
      ng.gain.value = rough * 0.5;
      n.connect(nf).connect(ng).connect(mix);
      n.start(t0);
      n.stop(t0 + dur + 0.1);
    }
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + dur * 0.25);
    env.gain.linearRampToValueAtTime(gain * 0.7, t0 + dur * 0.7);
    env.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    mix.connect(env);
    this.out(env, pan);
    osc.start(t0);
    lfo.start(t0);
    osc.stop(t0 + dur + 0.1);
    lfo.stop(t0 + dur + 0.1);
  }

  // --- Ereignisse: Spieler ---------------------------------------------------------------------------

  footstep(surface: Surface, sprint: boolean, x?: number, z?: number): void {
    const s = x === undefined || z === undefined ? { gain: 1, pan: 0 } : spatial(this.pose, x, z);
    if (s.gain <= 0.01) return;
    const k = (sprint ? 1.25 : 0.85) * s.gain;
    const j = rand(0.88, 1.14);
    const pan = s.pan;
    switch (surface) {
      case 'asphalt':
        this.noise('white', 0.07, { filter: 'bandpass', f: 1100 * j, q: 1.4, gain: 0.32 * k, pan });
        this.tone(0.09, { f: 95 * j, f2: 50, gain: 0.3 * k, pan });
        break;
      case 'concrete':
        this.noise('white', 0.06, { filter: 'highpass', f: 1800 * j, gain: 0.26 * k, pan });
        this.tone(0.08, { f: 110 * j, f2: 55, gain: 0.26 * k, pan });
        break;
      case 'grass':
        this.noise('pink', 0.13, { filter: 'lowpass', f: 700 * j, f2: 300, gain: 0.34 * k, pan, attack: 0.012 });
        this.noise('white', 0.05, { filter: 'highpass', f: 3500, gain: 0.07 * k, pan });
        break;
      case 'wood':
        this.tone(0.09, { f: 190 * j, f2: 120, gain: 0.34 * k, type: 'triangle', pan });
        this.noise('white', 0.06, { filter: 'bandpass', f: 1600 * j, q: 2, gain: 0.2 * k, pan });
        break;
      case 'carpet':
        this.noise('pink', 0.1, { filter: 'lowpass', f: 380, gain: 0.2 * k, pan, attack: 0.01 });
        break;
    }
  }

  /** Schuss: scharfer Knall, tiefer Schlag, Hall */
  shot(heavy: boolean, x?: number, z?: number): void {
    const s = x === undefined || z === undefined ? { gain: 1, pan: 0 } : spatial(this.pose, x, z);
    const k = Math.max(0.4, s.gain);
    this.noise('white', heavy ? 0.5 : 0.32, { filter: 'lowpass', f: heavy ? 5200 : 4200, f2: 260, gain: (heavy ? 0.95 : 0.75) * k, pan: s.pan, attack: 0.002 });
    this.tone(0.24, { f: heavy ? 110 : 150, f2: 36, gain: 0.6 * k, pan: s.pan, type: 'triangle' });
    this.noise('brown', heavy ? 0.9 : 0.5, { filter: 'lowpass', f: 700, gain: 0.35 * k, pan: s.pan, delay: 0.04 });
  }

  /** Abzug ohne Munition */
  dryFire(): void {
    this.tone(0.04, { f: 1800, f2: 900, gain: 0.18, type: 'square' });
  }

  /** Magazin/Patrone einlegen */
  reloadClick(): void {
    this.tone(0.05, { f: 900, f2: 500, gain: 0.2, type: 'square' });
    this.noise('white', 0.05, { filter: 'bandpass', f: 2400, q: 2, gain: 0.2, delay: 0.06 });
  }

  swing(heavy: boolean): void {
    this.noise('white', heavy ? 0.26 : 0.17, { filter: 'bandpass', f: 380, f2: heavy ? 1100 : 1700, q: 0.9, gain: heavy ? 0.4 : 0.3, attack: 0.04 });
  }

  /** Treffer auf einen Zombie */
  hit(heavy: boolean, killed: boolean, x?: number, z?: number): void {
    const s = x === undefined || z === undefined ? { gain: 1, pan: 0 } : spatial(this.pose, x, z);
    const k = 0.9 * Math.max(0.35, s.gain);
    this.tone(0.16, { f: heavy ? 135 : 160, f2: 48, gain: 0.55 * k, pan: s.pan, type: 'triangle' });
    this.noise('pink', 0.14, { filter: 'lowpass', f: 900, f2: 200, gain: 0.5 * k, pan: s.pan });
    this.noise('white', 0.09, { filter: 'bandpass', f: 260, f2: 160, q: 3, gain: 0.35 * k, pan: s.pan, delay: 0.03 });
    if (heavy) this.tone(0.3, { f: 780, f2: 700, gain: 0.07 * k, pan: s.pan, delay: 0.01 });
    if (killed) {
      this.tone(0.5, { f: 70, f2: 28, gain: 0.5 * k, pan: s.pan, delay: 0.05 });
      this.noise('brown', 0.35, { filter: 'lowpass', f: 400, gain: 0.5 * k, pan: s.pan, delay: 0.06 });
    }
  }

  hurt(): void {
    this.voice(0.32, 210, 120, [650, 1150], 0.4, 0, 0.4);
    this.tone(0.2, { f: 80, f2: 40, gain: 0.4, type: 'triangle' });
    this.noise('pink', 0.1, { filter: 'lowpass', f: 600, gain: 0.3 });
  }

  bite(): void {
    for (let i = 0; i < 3; i++) this.noise('white', 0.07, { filter: 'bandpass', f: rand(700, 1400), q: 2, gain: 0.35, delay: i * 0.07 });
    this.tone(0.22, { f: 110, f2: 55, gain: 0.4, delay: 0.02 });
  }

  death(): void {
    this.tone(2.4, { f: 90, f2: 24, gain: 0.5, type: 'sawtooth', attack: 0.05 });
    this.noise('brown', 1.8, { filter: 'lowpass', f: 300, gain: 0.5, attack: 0.1 });
    this.voice(1.2, 180, 60, [500, 900], 0.35, 0, 0.5);
  }

  levelUp(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(0.5, { f, gain: 0.16, delay: i * 0.09, type: 'triangle' }));
  }

  // --- Ereignisse: Zombies ---------------------------------------------------------------------------

  zombieGroan(kind: ZombieVoice, x: number, z: number, angry = false): void {
    const s = spatial(this.pose, x, z);
    if (s.gain <= 0.015) return;
    const muffled = s.dist > 18 ? 0.7 : 1;
    const g = (angry ? 0.5 : 0.36) * s.gain * muffled;
    if (kind === 'sprinter') {
      this.voice(rand(0.8, 1.3), rand(250, 330), rand(160, 210), [900, 2100], g, s.pan, 0.55);
    } else if (kind === 'fast') {
      this.voice(rand(0.7, 1.1), rand(150, 190), rand(90, 120), [720, 1600], g, s.pan, 0.5);
    } else {
      this.voice(rand(1.0, 1.7), rand(95, 125), rand(55, 80), [520, 1050], g, s.pan, 0.35);
    }
  }

  zombieAttack(kind: ZombieVoice, x: number, z: number): void {
    const s = spatial(this.pose, x, z);
    if (s.gain <= 0.02) return;
    this.voice(0.45, kind === 'shambler' ? 130 : 200, kind === 'shambler' ? 80 : 120, [600, 1300], 0.55 * Math.max(0.4, s.gain), s.pan, 0.6);
    this.noise('pink', 0.08, { filter: 'bandpass', f: 500, q: 1, gain: 0.3 * s.gain, pan: s.pan, delay: 0.1 });
  }

  // --- Ereignisse: Welt --------------------------------------------------------------------------------

  doorOpen(x: number, z: number): void {
    const s = spatial(this.pose, x, z);
    if (s.gain <= 0.02) return;
    const f = rand(110, 150);
    this.tone(0.55, { type: 'sawtooth', f, f2: f * 1.5, gain: 0.07 * s.gain, pan: s.pan, attack: 0.08 });
    this.noise('pink', 0.5, { filter: 'bandpass', f: 600, f2: 1100, q: 6, gain: 0.12 * s.gain, pan: s.pan, attack: 0.08 });
    this.tone(0.06, { f: 220, f2: 140, gain: 0.25 * s.gain, pan: s.pan, type: 'triangle' }); // Klinke
  }

  doorClose(x: number, z: number): void {
    const s = spatial(this.pose, x, z);
    if (s.gain <= 0.02) return;
    this.tone(0.18, { f: 85, f2: 45, gain: 0.5 * s.gain, pan: s.pan, type: 'triangle' });
    this.noise('white', 0.07, { filter: 'bandpass', f: 800, q: 1.2, gain: 0.3 * s.gain, pan: s.pan });
  }

  doorBreak(x: number, z: number): void {
    const s = spatial(this.pose, x, z);
    if (s.gain <= 0.02) return;
    this.noise('white', 0.3, { filter: 'lowpass', f: 3000, f2: 300, gain: 0.7 * s.gain, pan: s.pan });
    this.tone(0.4, { f: 70, f2: 30, gain: 0.6 * s.gain, pan: s.pan, type: 'triangle' });
    for (let i = 0; i < 4; i++) this.noise('white', 0.05, { filter: 'bandpass', f: rand(300, 900), q: 3, gain: 0.3 * s.gain, pan: s.pan, delay: 0.05 + i * 0.05 });
  }

  glassBreak(x: number, z: number): void {
    const s = spatial(this.pose, x, z);
    if (s.gain <= 0.02) return;
    this.noise('white', 0.35, { filter: 'highpass', f: 3200, gain: 0.55 * s.gain, pan: s.pan, curve: 1.4 });
    for (let i = 0; i < 9; i++) this.tone(0.3, { f: rand(2200, 6500), gain: 0.07 * s.gain, pan: s.pan, delay: 0.02 + i * rand(0.02, 0.06) });
    this.tone(0.1, { f: 180, f2: 90, gain: 0.3 * s.gain, pan: s.pan, type: 'triangle' });
  }

  /** Brett hämmern oder splittern */
  wood(x: number, z: number, big = false): void {
    const s = spatial(this.pose, x, z);
    if (s.gain <= 0.02) return;
    this.tone(0.12, { f: big ? 150 : 230, f2: big ? 70 : 140, gain: 0.5 * s.gain, pan: s.pan, type: 'triangle' });
    this.noise('white', big ? 0.2 : 0.08, { filter: 'bandpass', f: 1300, q: 1.5, gain: 0.35 * s.gain, pan: s.pan });
  }

  crash(strength: number, x: number, z: number): void {
    const s = spatial(this.pose, x, z);
    if (s.gain <= 0.02) return;
    const k = clamp(strength / 14, 0.15, 1) * s.gain;
    this.noise('white', 0.4 * (0.5 + k), { filter: 'lowpass', f: 2800, f2: 200, gain: 0.8 * k, pan: s.pan });
    this.tone(0.5, { f: 60, f2: 25, gain: 0.8 * k, pan: s.pan, type: 'triangle' });
    for (let i = 0; i < 3 + Math.round(k * 4); i++) this.tone(0.4, { f: rand(300, 1400), f2: rand(250, 900), gain: 0.07 * k, pan: s.pan, delay: i * 0.04, type: 'square' });
  }

  // --- Ereignisse: Gegenstände und Oberfläche ---------------------------------------------------------------

  eat(): void {
    for (let i = 0; i < 4; i++) this.noise('white', 0.06, { filter: 'bandpass', f: rand(1400, 2600), q: 2.5, gain: 0.3, delay: i * 0.11 });
  }

  drink(): void {
    for (let i = 0; i < 4; i++) this.tone(0.1, { f: rand(280, 520), f2: rand(180, 320), gain: 0.18, delay: i * 0.15, type: 'sine' });
    this.noise('pink', 0.5, { filter: 'bandpass', f: 500, q: 2, gain: 0.08, delay: 0.05 });
  }

  bandage(): void {
    this.noise('white', 0.45, { filter: 'highpass', f: 1500, f2: 4500, gain: 0.3, attack: 0.1 });
    this.noise('pink', 0.2, { filter: 'lowpass', f: 600, gain: 0.2, delay: 0.5 });
  }

  /** Stoff rascheln (Taschen, Rucksack, Sachen aufheben) */
  rustle(): void {
    this.noise('pink', 0.16, { filter: 'bandpass', f: rand(1200, 2200), q: 1.2, gain: 0.22, attack: 0.03 });
    this.noise('white', 0.05, { filter: 'highpass', f: 3000, gain: 0.08, delay: 0.06 });
  }

  craft(): void {
    for (let i = 0; i < 3; i++) this.tone(0.09, { f: rand(190, 260), f2: 130, gain: 0.35, type: 'triangle', delay: i * 0.13 });
    this.noise('white', 0.05, { filter: 'bandpass', f: 1800, q: 2, gain: 0.18, delay: 0.02 });
  }

  ui(kind: UiSound): void {
    const c = this.ctx;
    if (!c) return;
    const now = c.currentTime;
    if (kind === 'click' && now - this.lastUi < 0.03) return;
    this.lastUi = now;
    switch (kind) {
      case 'click':
        this.tone(0.05, { f: 1050, f2: 780, gain: 0.07, type: 'triangle' });
        break;
      case 'open':
        this.tone(0.1, { f: 520, gain: 0.08, type: 'triangle' });
        this.tone(0.14, { f: 780, gain: 0.08, type: 'triangle', delay: 0.06 });
        break;
      case 'close':
        this.tone(0.1, { f: 700, gain: 0.07, type: 'triangle' });
        this.tone(0.14, { f: 460, gain: 0.07, type: 'triangle', delay: 0.06 });
        break;
      case 'error':
        this.tone(0.14, { f: 200, f2: 150, gain: 0.12, type: 'square' });
        break;
      case 'pickup':
        if (now - this.lastPick > 0.08) this.rustle();
        this.lastPick = now;
        break;
      case 'drop':
        this.tone(0.08, { f: 140, f2: 80, gain: 0.25, type: 'triangle' });
        this.rustle();
        break;
    }
  }

  // --- Auto ------------------------------------------------------------------------------------------------

  /** Dauerhafter Motorklang; `rpm` 700..6500, `throttle` 0..1. `on = false` stoppt ihn. */
  engine(on: boolean, rpm: number, throttle: number): void {
    const c = this.ctx;
    if (!c) return;
    if (!on) {
      if (this.car) {
        const car = this.car;
        car.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.12);
        window.setTimeout(() => {
          for (const o of car.osc) {
            try {
              o.stop();
            } catch {
              /* schon gestoppt */
            }
          }
        }, 600);
        this.car = null;
      }
      return;
    }
    if (!this.car) {
      const g = c.createGain();
      g.gain.value = 0.0001;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 400;
      f.Q.value = 2.5;
      const o1 = c.createOscillator();
      o1.type = 'sawtooth';
      const o2 = c.createOscillator();
      o2.type = 'square';
      const o3 = c.createOscillator();
      o3.type = 'sawtooth';
      const m = c.createGain();
      m.gain.value = 0.5;
      o1.connect(m);
      o2.connect(m);
      o3.connect(m);
      m.connect(f).connect(g).connect(this.sfx);
      o1.start();
      o2.start();
      o3.start();
      this.car = { osc: [o1, o2, o3], g, f };
    }
    const car = this.car;
    const base = 22 + (rpm / 60) * 0.55; // Zündfrequenz: Viertakter, 4 Zylinder: rpm/60*2
    const t = c.currentTime;
    car.osc[0].frequency.setTargetAtTime(base, t, 0.06);
    car.osc[1].frequency.setTargetAtTime(base * 0.5, t, 0.06);
    car.osc[2].frequency.setTargetAtTime(base * 2.01, t, 0.06);
    car.f.frequency.setTargetAtTime(260 + rpm * 0.35 + throttle * 700, t, 0.08);
    car.g.gain.setTargetAtTime(0.1 + throttle * 0.17 + clamp(rpm / 7000, 0, 1) * 0.06, t, 0.08);
  }

  engineStart(success: boolean): void {
    const n = success ? 5 : 4;
    for (let i = 0; i < n; i++) this.tone(0.11, { f: 58, f2: 46, gain: 0.36, type: 'square', delay: i * 0.15 });
    this.noise('brown', n * 0.15, { filter: 'lowpass', f: 250, gain: 0.3 });
    if (success) this.tone(0.9, { f: 40, f2: 62, gain: 0.3, type: 'sawtooth', delay: n * 0.15, attack: 0.1 });
  }

  horn(): void {
    this.tone(0.7, { f: 420, gain: 0.2, type: 'square', attack: 0.02 });
    this.tone(0.7, { f: 520, gain: 0.2, type: 'square', attack: 0.02 });
  }

  // --- Umgebung und Musik ---------------------------------------------------------------------------------

  private buildAmbient(): void {
    const c = this.ctx!;
    // Wind: braunes Rauschen, Filter und Lautstärke wandern langsam
    const w = c.createBufferSource();
    w.buffer = this.brown;
    w.loop = true;
    const wf = c.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 380;
    wf.Q.value = 0.7;
    const wg = c.createGain();
    wg.gain.value = 0.0001;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoG = c.createGain();
    lfoG.gain.value = 140;
    lfo.connect(lfoG).connect(wf.frequency);
    w.connect(wf).connect(wg).connect(this.amb);
    w.start();
    lfo.start();
    this.wind = { g: wg, f: wf };
    // Regen: rosa Rauschen, hoch gefiltert
    const r = c.createBufferSource();
    r.buffer = this.pink;
    r.loop = true;
    const rf = c.createBiquadFilter();
    rf.type = 'highpass';
    rf.frequency.value = 1200;
    const rl = c.createBiquadFilter();
    rl.type = 'lowpass';
    rl.frequency.value = 9000;
    const rg = c.createGain();
    rg.gain.value = 0.0001;
    r.connect(rf).connect(rl).connect(rg).connect(this.amb);
    r.start(0, 1);
    this.rain = rg;
  }

  private buildMusic(): void {
    const c = this.ctx!;
    // Flächenklang: vier leicht verstimmte Dreiecksschwingungen durch Tiefpass und Hall
    const g = c.createGain();
    g.gain.value = 0.0001;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 800;
    for (let i = 0; i < 4; i++) {
      const o = c.createOscillator();
      o.type = i % 2 ? 'sine' : 'triangle';
      o.frequency.value = 110;
      o.detune.value = (i - 1.5) * 7;
      o.connect(lp);
      o.start();
      this.padOsc.push(o);
    }
    lp.connect(g);
    g.connect(this.music);
    if (this.reverb) g.connect(this.reverb);
    this.padGain = g;
    // Spannungsschicht: tiefes Brummen mit Tritonus, pulsiert
    const tg = c.createGain();
    tg.gain.value = 0.0001;
    const tf = c.createBiquadFilter();
    tf.type = 'lowpass';
    tf.frequency.value = 260;
    for (const f of [55, 77.8]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(tf);
      o.start();
      this.tensionOsc.push(o);
    }
    const pulse = c.createOscillator();
    pulse.frequency.value = 1.1;
    const pg = c.createGain();
    pg.gain.value = 0.4;
    pulse.connect(pg).connect(tg.gain);
    pulse.start();
    tf.connect(tg).connect(this.music);
    this.tensionGain = tg;
  }

  /** Akkordfolge des Flächenklangs (Moll, tiefer nachts) */
  private nextChord(night: number): void {
    const c = this.ctx!;
    const roots = [110, 98, 87.31, 103.83];
    const root = roots[this.chordI++ % roots.length] * (night > 0.5 ? 0.5 : 1);
    const ratios = [1, 1.189, 1.498, 1.78]; // Moll mit kleiner Septime
    const t = c.currentTime;
    this.padOsc.forEach((o, i) => o.frequency.setTargetAtTime(root * ratios[i] * (i === 3 ? 0.5 : 1), t, 2.5));
  }

  /** Pro Bild aufrufen: Dauerklänge, Zufallsklänge und Musik der Lage anpassen */
  update(a: AmbientState): void {
    const c = this.ctx;
    if (!c || !this.enabled || c.state !== 'running') return;
    const t = c.currentTime;
    // Im Haus: Außenwelt gedämpft
    this.lowpass.frequency.setTargetAtTime(a.indoors ? 2600 : 20000, t, 0.25);
    const out = a.indoors ? 0.35 : 1;
    this.wind?.g.gain.setTargetAtTime((0.05 + 0.12 * a.clouds + 0.05 * a.rain) * out, t, 0.6);
    this.rain?.gain.setTargetAtTime(a.rain * 0.16 * (a.indoors ? 0.45 : 1), t, 0.5);
    // Musik: leise Fläche, bei Gefahr tritt die Spannung hervor
    this.padGain?.gain.setTargetAtTime(0.1 * (1 - a.tension * 0.6), t, 1.2);
    this.tensionGain?.gain.setTargetAtTime(a.tension * 0.2, t, 0.8);
    if ((this.chordT -= a.dt) <= 0) {
      this.chordT = 14;
      this.nextChord(a.night);
    }
    // Vögel am Tag, Grillen und Eulen nachts (nur draußen, kein Regen)
    if (!a.indoors && a.rain < 0.3) {
      if (a.night < 0.45 && (this.birdT -= a.dt) <= 0) {
        this.birdT = rand(3, 10);
        this.bird();
      }
      if (a.night > 0.6 && (this.cricketT -= a.dt) <= 0) {
        this.cricketT = rand(2, 5);
        this.crickets();
      }
    }
    // Herzschlag bei Verfolgung oder schwerer Verletzung
    const beat = a.hp < 35 || a.chased;
    if (beat && (this.heartT -= a.dt) <= 0) {
      this.heartT = a.hp < 20 ? 0.6 : a.chased ? 0.75 : 0.95;
      this.heartbeat(a.hp < 35 ? 0.5 : 0.32);
    }
  }

  private heartbeat(gain: number): void {
    this.tone(0.13, { f: 62, f2: 40, gain, type: 'sine' });
    this.tone(0.11, { f: 55, f2: 38, gain: gain * 0.75, type: 'sine', delay: 0.17 });
  }

  private bird(): void {
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = rand(2400, 4200);
    const pan = rand(-0.8, 0.8);
    for (let i = 0; i < notes; i++) {
      this.tone(0.09, { f: base * rand(0.9, 1.2), f2: base * rand(1.1, 1.6), gain: 0.05, pan, delay: i * rand(0.09, 0.16), bus: 'amb' });
    }
  }

  private crickets(): void {
    const pan = rand(-0.9, 0.9);
    for (let i = 0; i < 9; i++) this.tone(0.04, { f: 4300 + rand(-80, 80), gain: 0.025, pan, delay: i * 0.055, type: 'sine', bus: 'amb' });
    if (Math.random() < 0.08) {
      // Eule
      this.tone(0.35, { f: 420, f2: 360, gain: 0.07, pan, delay: 0.7, bus: 'amb' });
      this.tone(0.5, { f: 380, f2: 300, gain: 0.07, pan, delay: 1.2, bus: 'amb' });
    }
  }
}

/** Gemeinsame Instanz für das ganze Spiel */
export const audio = new AudioEngine();
