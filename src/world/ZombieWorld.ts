import * as THREE from 'three';
import type { Vision } from '../render/Vision';
import { BrainWorld, Sound, ZTYPES, ZombieBrain, ZType, visionRange } from '../sim/ZombieAI';
import { Hittable } from '../sim/Combat';
import { animateZombie, createZombie, fallCharacter, reactZombie } from '../render/Character';
import { BuildingKind, CHUNK, ChunkSpec } from './CityGenerator';
import type { Container, DoorView, WindowView } from './ChunkManager';
import type { WindowHit } from './Windows';
import { rollLoot } from '../data/loot';

/** Was die Zombies von der Welt brauchen (ChunkManager) */
export interface ZombieEnv {
  hasChunk(cx: number, cz: number): boolean;
  specOf(cx: number, cz: number): ChunkSpec | undefined;
  resolve(pos: THREE.Vector3, r: number, level?: number): void;
  lineClear(ax: number, az: number, bx: number, bz: number, level?: number): boolean;
  overlapsWorld(box: { x: number; z: number; w: number; d: number }, shrink?: number): boolean;
  doorsNear(x: number, z: number, range: number): DoorView[];
  thumpDoor(d: DoorView, damage: number): boolean;
  /** Zombie öffnet die Tür, statt sie einzuschlagen */
  openDoor?(d: DoorView): boolean;
  /** Weg durch Räume und Türen (Wegpunkte) und Prüfung auf freie Bahn */
  navPath?(sx: number, sz: number, tx: number, tz: number): { x: number; z: number }[] | null;
  navClear?(ax: number, az: number, bx: number, bz: number): boolean;
  /** Hindernis zum Überklettern vor einem Punkt (Fenster, Zäune) */
  findClimb?(pos: THREE.Vector3, dirX: number, dirZ: number, r?: number, level?: number): { x: number; z: number; dur: number; h: number } | null;
  windowsNear?(x: number, z: number, range: number): WindowView[];
  strikeWindow?(w: WindowView, damage: number): WindowHit | null;
}

/** Zustand eines Zombies für Mitspieler: [Id, Aussehen, x, z, Blick, Zustand, Tempo, Leben 0..1, Art, Ausfall] */
export type NetZombie = [number, number, number, number, number, number, number, number, number, number];
export const NET_STATES = ['idle', 'investigate', 'chase', 'attack', 'stagger', 'dead'] as const;
const TYPE_IDS = ['shambler', 'fast', 'sprinter'] as const;

export interface ZombieCtx {
  player: THREE.Vector3;
  /** Mitspieler (Mehrspieler, nur beim Host): Zombies jagen den jeweils nächsten Spieler */
  others?: { id: number; x: number; z: number }[];
  night: number;
  rain: number;
  clouds: number;
  /** Spieltag (die Bevölkerung wächst bis etwa Tag 28) */
  day: number;
  /** Etage des Spielers (0 = Erdgeschoss). Zombies bleiben unten und greifen nur auf ihrer Etage an. */
  playerLevel?: number;
  /** Ein Zombie schlägt zu */
  onStrike(z: Zed): void;
  /** Eine Tür wurde eingeschlagen */
  onDoorBroken?(d: DoorView): void;
  /** Eine Tür wurde aufgemacht */
  onDoorOpened?(d: DoorView): void;
  /** Ein Zombie steigt über ein Hindernis */
  onClimb?(z: Zed): void;
  /** Ein Fenster oder Brett wurde eingeschlagen */
  onWindowBroken?(what: 'glass' | 'plank', w: WindowView): void;
}

const MAX_REAL = 60;
/** Dichte der Zombies gegenüber den Grundzahlen (Stufe „normal“) */
const DENSITY = 0.45;
const FAR_CHUNKS = 3;
/** Schaden pro Sekunde und Zombie gegen Türen (Haltbarkeit 100) und Fenster: eine Tür hält allein gut 25 s */
const DOOR_DPS = 4;
const WINDOW_DPS = 4;
const ANIM_RANGE = 55; // Zombies jenseits davon werden nicht animiert (nur ihre Position läuft weiter)
const SAFE_SPAWN = 30; // so nah am Spieler entsteht kein Zombie
const CORPSE_TIME = 240;
const poolGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
/** Blutlache: dunkelroter Kreis mit leicht welligem Rand und weichem Glanz */
function poolTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(64, 64);
  g.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r = 56 * (1 + 0.05 * Math.sin(a * 3 + 0.7) + 0.035 * Math.sin(a * 7 + 2.1) + 0.02 * Math.sin(a * 11));
    if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  const gr = g.createRadialGradient(-10, -12, 4, 0, 0, 58);
  gr.addColorStop(0, '#8a1414');
  gr.addColorStop(0.55, '#6e0e0e');
  gr.addColorStop(1, '#4a0808');
  g.fillStyle = gr;
  g.fill();
  const hl = g.createRadialGradient(-16, -18, 0, -16, -18, 22);
  hl.addColorStop(0, 'rgba(255,170,160,0.28)');
  hl.addColorStop(1, 'rgba(255,170,160,0)');
  g.fillStyle = hl;
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
const FALL_TIME = 1.15;

/** Anzahl Zombies je Gebäudeart (min, max) */
const INDOOR: Record<BuildingKind, [number, number]> = {
  house: [0, 2], apartment: [1, 4], office: [0, 3], hotel: [0, 3], shop: [0, 2], industry: [0, 3], garage: [0, 1], barn: [0, 1],
};

/** Bevölkerungsfaktor über die Zeit: Start 1.0, Höhepunkt 1.5 an Tag 28, danach langsamer Rückgang */
export function populationFactor(day: number): number {
  if (day <= 28) return 1 + (0.5 * (day - 1)) / 27;
  return Math.max(0.6, 1.5 - (0.9 * (day - 28)) / 90);
}

/** Zufall aus Chunk-Koordinaten: bei gleichem Chunk immer gleich */
export function chunkRng(cx: number, cz: number, salt = 0): () => number {
  let s = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ Math.imul(salt, 83492791)) >>> 0 || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 13), 3266489909);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  };
}

/** Wie viele Zombies ein Chunk grundsätzlich enthält (ohne Zeitfaktor) */
export function baseCount(spec: ChunkSpec, cx: number, cz: number): { outdoor: number; indoor: number[] } {
  const r = chunkRng(cx, cz, 5);
  const town = spec.land === 'town';
  const village = spec.land === 'village';
  const outdoor = town ? 2 + Math.floor(r() * 5) : village ? Math.floor(r() * 3) : spec.land === 'farm' ? (r() < 0.5 ? 1 : 0) : r() < 0.25 ? 1 : 0;
  const indoor = spec.buildings.map((b) => {
    const [lo, hi] = INDOOR[b.kind];
    return lo + Math.floor(r() * (hi - lo + 1));
  });
  return { outdoor, indoor };
}

let seq = 0;

/** Ein Zombie in der Welt: Gehirn (Verhalten) und Figur */
export class Zed implements Hittable {
  readonly id = ++seq;
  readonly mesh = new THREE.Group();
  readonly body: THREE.Group;
  /** Verbleibende Zeit bis zum Entfernen der Leiche */
  corpseT = CORPSE_TIME;
  deadT = 0;
  /** Sekunden seit dem letzten Treffer (Trefferreaktion) */
  hitT = 9;
  wasStagger = false;
  lunge = 0;
  /** Sekunden, die dieser Zombie nach einem Angriff sichtbar und angestrahlt bleibt, auch außerhalb des Sichtfelds */
  revealT = 0;
  blockedT = 0;
  detourT = 0;
  lastSpeed = 0;
  /** Leiche: durchsuchbare Taschen und Blutlache */
  container: Container | null = null;
  pool: THREE.Mesh | null = null;
  poolSize = 0.6;
  /** Klettert gerade über ein Hindernis (Fenster, Zaun) */
  climb: { t: number; dur: number; fx: number; fz: number; tx: number; tz: number; h: number } | null = null;
  /** Wie lange er schon an einer Tür herumdrückt */
  fumble = 0;
  /** Berechneter Weg zum Ziel (Wegpunkte), Alter, Ziel zur Berechnungszeit und Zeit bis zur nächsten Prüfung der freien Bahn */
  path: { x: number; z: number }[] | null = null;
  pathI = 0;
  pathAge = 0;
  pathGoal = { x: 0, z: 0 };
  directT = 0;
  direct = true;
  /** Nach einer erfolglosen Suche erst nach dieser Zeit (s) erneut suchen */
  pathFailT = 0;
  /** Seed für das Aussehen (wird Mitspielern mitgeteilt, damit alle denselben Zombie sehen) */
  readonly lookSeed: number;
  /** Wen er gerade jagt: 0 = der Host selbst, sonst Spieler-Id */
  targetId = 0;
  /** Mehrspieler (Client): Id beim Host, Sollzustand und letzter Empfang; `remote` meldet Treffer an den Host */
  netId = 0;
  netTarget: { x: number; z: number; yaw: number; speed: number; lunge: number } | null = null;
  lastSeen = 0;
  remote: ((damage: number, pushX: number, pushZ: number, from?: { x: number; z: number }) => void) | null = null;

  constructor(readonly brain: ZombieBrain, readonly chunkKey: string, lookSeed?: number) {
    this.lookSeed = lookSeed ?? this.id * 7 + Math.floor(brain.x);
    this.body = createZombie(this.lookSeed);
    this.mesh.add(this.body);
    this.mesh.position.set(brain.x, 0, brain.z);
    this.mesh.rotation.y = brain.yaw;
  }

  get x(): number {
    return this.brain.x;
  }
  get z(): number {
    return this.brain.z;
  }
  get alive(): boolean {
    return this.brain.alive;
  }

  hit(damage: number, pushX: number, pushZ: number, from?: { x: number; z: number }): boolean {
    // Beim Client entscheidet der Host über den Treffer
    if (this.remote) {
      this.remote(damage, pushX, pushZ, from);
      return false;
    }
    return this.brain.hit(damage, pushX, pushZ, from);
  }
}

export class ZombieWorld {
  readonly group = new THREE.Group();
  zombies: Zed[] = [];
  /** Geräusche dieses Bildes; werden nach dem Update geleert */
  private sounds: Sound[] = [];
  /** Wie viele Zombies ein Chunk bei der ersten Begegnung enthielt (bleibt gleich) */
  private totals = new Map<string, { outdoor: number; indoor: number[] }>();
  private killed = new Map<string, number>();
  private spawned = new Set<string>();
  private groupSeq = 1;
  private rand: () => number;
  /** Ein Zombie sieht oder jagt den Spieler gerade (für Stress) */
  threat = 0;

  constructor(seed = Date.now()) {
    this.rand = chunkRng(seed | 0, (seed / 1000) | 0, 9);
  }

  /** Mehrspieler (Client): Geräusche gehen an den Host, der die Zombies steuert */
  noiseHook: ((x: number, z: number, radius: number) => void) | null = null;

  /** Ein Geräusch: Zombies im Radius werden aufmerksam. */
  noise(x: number, z: number, radius: number): void {
    if (radius <= 0) return;
    if (this.noiseHook) this.noiseHook(x, z, radius);
    else this.sounds.push({ x, z, radius });
  }

  get alive(): Zed[] {
    return this.zombies.filter((z) => z.alive);
  }

  // --- Entstehen ------------------------------------------------------------------

  private pick(type: number): ZType {
    return type < 0.8 ? ZTYPES.shambler : type < 0.95 ? ZTYPES.fast : ZTYPES.sprinter;
  }

  private add(x: number, z: number, key: string, group: number, leader: Zed | null, r: () => number): Zed {
    const brain = new ZombieBrain(x, z, this.pick(r()), Math.floor(r() * 1000));
    brain.groupId = group;
    const zed = new Zed(brain, key);
    if (leader) brain.leader = leader.brain;
    this.zombies.push(zed);
    this.group.add(zed.mesh);
    return zed;
  }

  /** Setzt die Zombies eines Chunks ein (einmal, solange der Chunk nahe ist). */
  private spawnChunk(cx: number, cz: number, env: ZombieEnv, ctx: ZombieCtx): void {
    const key = `${cx},${cz}`;
    const spec = env.specOf(cx, cz);
    if (!spec) return;
    let total = this.totals.get(key);
    if (!total) {
      const f = populationFactor(ctx.day);
      const base = baseCount(spec, cx, cz);
      // zufällig auf- oder abrunden, damit auch kleine Zahlen (0.45) vorkommen
      const sr = chunkRng(cx, cz, 77);
      const scale = (n: number): number => Math.floor(n * f * DENSITY + sr());
      total = { outdoor: scale(base.outdoor), indoor: base.indoor.map(scale) };
      this.totals.set(key, total);
    }
    this.spawned.add(key);
    const r = chunkRng(cx, cz, 11 + this.killed.size + (this.killed.get(key) ?? 0));
    let toKill = this.killed.get(key) ?? 0; // wer schon erschlagen wurde, kommt nicht wieder
    const free = (x: number, z: number): boolean =>
      Math.hypot(x - ctx.player.x, z - ctx.player.z) > SAFE_SPAWN && !env.overlapsWorld({ x, z, w: 0.8, d: 0.8 }, 0);

    // in Gebäuden: eine Gruppe je Haus
    spec.buildings.forEach((b, i) => {
      const n = total!.indoor[i] ?? 0;
      const gid = this.groupSeq++;
      let leader: Zed | null = null;
      for (let k = 0; k < n; k++) {
        if (toKill > 0) {
          toKill--;
          continue;
        }
        for (let t = 0; t < 14; t++) {
          const x = b.x + (r() - 0.5) * (b.w - 2.4), z = b.z + (r() - 0.5) * (b.d - 2.4);
          if (!free(x, z)) continue;
          const zed = this.add(x, z, key, gid, leader, r);
          leader ??= zed;
          break;
        }
      }
    });

    // draußen: Einzelne und kleine Gruppen
    let left = total.outdoor;
    while (left > 0) {
      const size = Math.min(left, r() < 0.35 ? 2 + Math.floor(r() * 3) : 1);
      left -= size;
      const gid = this.groupSeq++;
      const ox = cx * CHUNK + 4 + r() * (CHUNK - 8), oz = cz * CHUNK + 4 + r() * (CHUNK - 8);
      let leader: Zed | null = null;
      for (let k = 0; k < size; k++) {
        if (toKill > 0) {
          toKill--;
          continue;
        }
        for (let t = 0; t < 14; t++) {
          const x = ox + (r() - 0.5) * 6, z = oz + (r() - 0.5) * 6;
          if (!free(x, z)) continue;
          const zed = this.add(x, z, key, gid, leader, r);
          leader ??= zed;
          break;
        }
      }
    }
  }

  /** Nur Zombies im Sichtfeld des Spielers sind zu sehen (auch Leichen); sonst bleibt höchstens das Geräusch */
  applyVision(v: Vision, dt: number): void {
    v.spots.length = 0;
    for (const z of this.zombies) {
      if (z.revealT > 0) {
        z.revealT -= dt;
        // Wer zugeschlagen hat, bleibt 5 s sichtbar und wird am Boden aufgehellt (in der letzten Sekunde ausblendend)
        if (v.spots.length < 4) v.spots.push({ x: z.mesh.position.x, z: z.mesh.position.z, k: Math.min(1, z.revealT) });
      }
      z.mesh.visible = !v.enabled || z.revealT > 0 || v.sees(z.mesh.position.x, z.mesh.position.z);
    }
  }

  // --- Wegfindung ---------------------------------------------------------------------

  /** Pro Bild werden höchstens so viele neue Wege berechnet (Rest folgt im nächsten Bild) */
  private pathBudget = 0;

  /**
   * Ist die Bahn zum Ziel nicht frei (Wände, Möbel, Türen dazwischen), folgt der Zombie einem berechneten Weg
   * durch Räume und Türen statt geradeaus gegen die erste Wand zu laufen.
   */
  private followPath(zed: Zed, intent: { dx: number; dz: number; speed: number; yaw?: number }, env: ZombieEnv, dt: number): void {
    const b = zed.brain;
    const t = b.target;
    if (intent.speed <= 0 || !t || (b.state !== 'chase' && b.state !== 'investigate') || !env.navPath || !env.navClear) {
      zed.path = null;
      return;
    }
    const dist = Math.hypot(t.x - b.x, t.z - b.z);
    if (dist < 1.6 || dist > 60) {
      zed.path = null;
      return;
    }
    zed.directT -= dt;
    if (zed.directT <= 0) {
      zed.directT = 0.3 + this.rand() * 0.25;
      zed.direct = env.navClear(b.x, b.z, t.x, t.z);
    }
    if (zed.direct) {
      zed.path = null;
      return;
    }
    zed.pathAge += dt;
    zed.pathFailT = Math.max(0, zed.pathFailT - dt);
    const stale = !zed.path || zed.pathAge > 2.5 || Math.hypot(t.x - zed.pathGoal.x, t.z - zed.pathGoal.z) > 3;
    if (stale && zed.pathFailT <= 0 && this.pathBudget > 0) {
      this.pathBudget--;
      zed.path = env.navPath(b.x, b.z, t.x, t.z);
      zed.pathI = 0;
      zed.pathAge = 0;
      zed.pathGoal = { x: t.x, z: t.z };
      if (!zed.path) zed.pathFailT = 3;
    }
    const path = zed.path;
    if (!path || zed.pathI >= path.length) return;
    let wp = path[zed.pathI];
    while (Math.hypot(wp.x - b.x, wp.z - b.z) < 0.5 && zed.pathI < path.length - 1) wp = path[++zed.pathI];
    const dx = wp.x - b.x, dz = wp.z - b.z, d = Math.hypot(dx, dz);
    if (d < 0.2) return;
    intent.dx = dx / d;
    intent.dz = dz / d;
    intent.yaw = Math.atan2(dx, dz);
    b.detour = 0;
  }

  // --- Update -------------------------------------------------------------------------

  update(dt: number, env: ZombieEnv, ctx: ZombieCtx): void {
    const pcx = Math.floor(ctx.player.x / CHUNK), pcz = Math.floor(ctx.player.z / CHUNK);
    this.pathBudget = 2;

    // Chunks in der Nähe füllen, weit entfernte räumen
    if (this.zombies.length < MAX_REAL) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const cx = pcx + dx, cz = pcz + dz;
          const key = `${cx},${cz}`;
          if (!this.spawned.has(key) && env.hasChunk(cx, cz)) this.spawnChunk(cx, cz, env, ctx);
        }
      }
    }
    for (const key of [...this.spawned]) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - pcx) > FAR_CHUNKS || Math.abs(cz - pcz) > FAR_CHUNKS) {
        this.spawned.delete(key);
        for (const z of this.zombies.filter((q) => q.chunkKey === key)) this.remove(z);
      }
    }

    const vision = visionRange(ctx.night, ctx.rain, ctx.clouds);
    const raining = ctx.rain > 0.3;
    this.threat = 0;
    const rand = this.rand;
    const world = (level: number): BrainWorld => ({
      player: { x: ctx.player.x, z: ctx.player.z },
      vision,
      raining,
      sounds: this.sounds,
      los: (ax, az, bx, bz) => env.lineClear(ax, az, bx, bz, level),
      rand,
      sameLevel: true,
    });
    const bw = world(0);
    const others = ctx.others ?? [];

    for (const zed of [...this.zombies]) {
      const b = zed.brain;
      if (!b.alive) {
        zed.deadT += dt;
        fallCharacter(zed.body, Math.min(1, zed.deadT / FALL_TIME));
        if (!zed.container) this.makeCorpse(zed);
        if (zed.pool) {
          // die Lache breitet sich zuerst schnell, dann immer langsamer aus
          const grow = 1 - Math.pow(1 - Math.min(1, zed.deadT / 14), 2.2);
          zed.pool.scale.setScalar(zed.poolSize * (0.05 + 0.95 * grow));
        }
        zed.corpseT -= dt;
        if (zed.corpseT <= 0) this.remove(zed, false);
        continue;
      }
      const dist = Math.hypot(b.x - ctx.player.x, b.z - ctx.player.z);
      // jagt den nächsten Spieler (Host oder Mitspieler)
      let tx = ctx.player.x, tz = ctx.player.z, td = dist;
      zed.targetId = 0;
      for (const o of others) {
        const d = Math.hypot(b.x - o.x, b.z - o.z);
        if (d < td) {
          tx = o.x;
          tz = o.z;
          td = d;
          zed.targetId = o.id;
        }
      }
      bw.player.x = tx;
      bw.player.z = tz;
      bw.sameLevel = zed.targetId !== 0 || (ctx.playerLevel ?? 0) === 0;
      if (td > 70) continue; // weit weg: steht still
      // Klettert gerade: Bogen über das Hindernis, langsam und mit gestreckten Armen
      if (zed.climb) {
        const c = zed.climb;
        c.t += dt;
        const u = Math.min(1, c.t / c.dur);
        const e = u * u * (3 - 2 * u);
        const p = zed.mesh.position;
        p.x = c.fx + (c.tx - c.fx) * e;
        p.z = c.fz + (c.tz - c.fz) * e;
        p.y = Math.sin(Math.PI * e) * c.h * 0.7;
        b.x = p.x;
        b.z = p.z;
        zed.mesh.rotation.y = Math.atan2(c.tx - c.fx, c.tz - c.fz);
        animateZombie(zed.body, 0.9, dt, 1);
        if (u >= 1) {
          zed.climb = null;
          p.y = 0;
        }
        continue;
      }
      const intent = b.update(dt, bw);
      this.followPath(zed, intent, env, dt);
      if (intent.strike) {
        zed.lunge = 1;
        ctx.onStrike(zed);
      }
      zed.lunge = Math.max(0, zed.lunge - dt * 3);
      if (b.state === 'attack') zed.lunge = Math.max(zed.lunge, Math.min(1, 0.4));

      // Bewegung mit Hindernis-Erkennung
      const pos = zed.mesh.position;
      pos.x = b.x;
      pos.z = b.z;
      let moved = 0;
      if (intent.speed > 0) {
        const step = intent.speed * dt;
        const bx = pos.x, bz = pos.z;
        pos.x += intent.dx * step;
        pos.z += intent.dz * step;
        env.resolve(pos, 0.4, 0);
        moved = Math.hypot(pos.x - bx, pos.z - bz);
        if (moved < step * 0.35) zed.blockedT += dt;
        else zed.blockedT = Math.max(0, zed.blockedT - dt * 2);
        b.x = pos.x;
        b.z = pos.z;
      } else zed.blockedT = 0;
      // Steht er vor einem offenen Fenster oder Zaun, steigt er darüber, bevor er den Umweg sucht
      if (b.state === 'chase' && zed.blockedT > 0.3 && env.findClimb) {
        const way = env.findClimb(zed.mesh.position, intent.dx, intent.dz, 0.4, 0);
        if (way) {
          zed.climb = { t: 0, dur: way.dur * 1.7 + 0.4, fx: b.x, fz: b.z, tx: way.x, tz: way.z, h: way.h };
          zed.blockedT = 0;
          ctx.onClimb?.(zed);
          continue;
        }
      }
      if (zed.blockedT > 0.4 && zed.detourT <= 0 && !zed.path) {
        b.detour = 1 + (zed.id % 2);
        zed.detourT = 1.1;
      }
      if (zed.detourT > 0) {
        zed.detourT -= dt;
        if (zed.detourT <= 0) b.detour = 0;
      }
      // Hindernisse beim Jagen: zwei von drei Zombies drücken die Klinke, die anderen schlagen auf Türen,
      // Fenster und Bretter werden eingeschlagen. Der Zeitgeber läuft weiter, auch wenn der Umweg ihn kurz wegführt.
      if (b.state === 'chase') {
        const closed = env.doorsNear(b.x, b.z, 1.8).filter((d) => !d.wanted && !d.broken);
        const wins = env.windowsNear?.(b.x, b.z, 1.6) ?? [];
        if ((closed.length || wins.length) && (zed.blockedT > 0.15 || zed.fumble > 0)) {
          zed.fumble += dt;
          // Zombies können keine Türklinke drücken: sie schlagen Türen und Fenster nur kaputt, und das dauert
          for (const d of closed) {
            if (zed.fumble > 0.6 && env.thumpDoor(d, dt * DOOR_DPS)) ctx.onDoorBroken?.(d);
          }
          for (const w of wins) {
            const hit = zed.fumble > 0.6 ? env.strikeWindow?.(w, dt * WINDOW_DPS) : null;
            if (hit === 'glass' || hit === 'plank') ctx.onWindowBroken?.(hit, w);
          }
        } else if (!closed.length && !wins.length) zed.fumble = 0;
      }
      // Blickrichtung
      const want = intent.yaw ?? (intent.speed > 0 ? Math.atan2(intent.dx, intent.dz) : b.yaw);
      let dyaw = want - b.yaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      b.yaw += dyaw * Math.min(1, dt * 7);
      zed.mesh.rotation.y = b.yaw;
      zed.lastSpeed = dt > 0 ? moved / dt : 0;
      // Gliederbewegung nur, wo man sie sieht: im Sichtfeld und in Reichweite der Kamera
      const shown = zed.mesh.visible && td < ANIM_RANGE;
      if (shown) animateZombie(zed.body, zed.lastSpeed, dt, zed.lunge);
      if (b.state === 'stagger' && !zed.wasStagger) zed.hitT = 0;
      zed.wasStagger = b.state === 'stagger';
      zed.hitT += dt;
      if (shown) reactZombie(zed.body, zed.hitT);
      if ((b.state === 'chase' || b.state === 'attack') && dist < 14) this.threat++;
    }

    // Anführer ersetzen, wenn er gestorben ist
    for (const z of this.zombies) {
      if (z.brain.leader && !z.brain.leader.alive) {
        const mate = this.zombies.find((q) => q.alive && q.brain.groupId === z.brain.groupId && q.brain.leader === null);
        z.brain.leader = mate && mate.brain !== z.brain ? mate.brain : null;
      }
    }
    this.sounds.length = 0;
  }

  // --- Mehrspieler ------------------------------------------------------------------------------------

  /** Zombies in der Nähe von Spielern, kompakt für das Netz (frisch Gestorbene noch kurz, damit der Sturz zu sehen ist) */
  snapshot(centers: { x: number; z: number }[], range = 80): NetZombie[] {
    const out: NetZombie[] = [];
    for (const z of this.zombies) {
      if (!z.alive && z.deadT > 5) continue;
      if (!centers.some((c) => Math.hypot(z.x - c.x, z.z - c.z) < range)) continue;
      const b = z.brain;
      const st = NET_STATES.indexOf(b.state as (typeof NET_STATES)[number]);
      out.push([
        z.id, z.lookSeed, +b.x.toFixed(2), +b.z.toFixed(2), +b.yaw.toFixed(2), st < 0 ? 0 : st,
        +z.lastSpeed.toFixed(2), +(Math.max(0, b.hp) / b.type.health).toFixed(2), Math.max(0, TYPE_IDS.indexOf(b.type.id)), +z.lunge.toFixed(2),
      ]);
    }
    return out;
  }

  /** Host: ein Mitspieler hat zugeschlagen */
  hitById(id: number, damage: number, pushX: number, pushZ: number, from?: { x: number; z: number }): boolean {
    const z = this.zombies.find((q) => q.id === id);
    if (!z || !z.alive) return false;
    const killed = z.hit(damage, pushX, pushZ, from);
    if (killed) this.recordKill(z);
    return killed;
  }

  /** Client: Zustand vom Host übernehmen (neue Zombies anlegen, vorhandene zum Sollwert gleiten lassen) */
  applyNet(list: NetZombie[], now: number, onHit: (z: Zed, damage: number, pushX: number, pushZ: number, from?: { x: number; z: number }) => void): void {
    for (const e of list) {
      const [id, seed, x, z, yaw, st, speed, hpf, ty, lunge] = e;
      let zed = this.zombies.find((q) => q.netId === id);
      if (!zed) {
        const brain = new ZombieBrain(x, z, ZTYPES[TYPE_IDS[ty] ?? 'shambler'], seed % 1000);
        zed = new Zed(brain, 'net', seed);
        zed.netId = id;
        zed.remote = (d, px, pz, from) => onHit(zed!, d, px, pz, from);
        this.zombies.push(zed);
        this.group.add(zed.mesh);
      }
      const b = zed.brain;
      zed.lastSeen = now;
      zed.netTarget = { x, z, yaw, speed, lunge };
      b.state = NET_STATES[st] ?? 'idle';
      b.hp = hpf * b.type.health;
      if (b.state === 'dead' && b.hp > 0) b.hp = 0;
    }
  }

  /** Client: Figuren bewegen, Lebende animieren, Gestürzte fallen lassen, Verschwundene entfernen */
  updateRemote(dt: number, now: number): void {
    for (const zed of [...this.zombies]) {
      if (!zed.netId) continue;
      const b = zed.brain;
      if (now - zed.lastSeen > 1.5) {
        this.remove(zed);
        continue;
      }
      const t = zed.netTarget;
      const pos = zed.mesh.position;
      if (!b.alive) {
        zed.deadT += dt;
        fallCharacter(zed.body, Math.min(1, zed.deadT / FALL_TIME));
        continue;
      }
      if (!t) continue;
      const k = Math.min(1, dt * 10);
      // sehr große Abstände (Spawn, Teleport) springen statt gleiten
      if (Math.hypot(t.x - pos.x, t.z - pos.z) > 6) pos.set(t.x, 0, t.z);
      else {
        pos.x += (t.x - pos.x) * k;
        pos.z += (t.z - pos.z) * k;
      }
      b.x = pos.x;
      b.z = pos.z;
      let dy = t.yaw - b.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      b.yaw += dy * Math.min(1, dt * 8);
      zed.mesh.rotation.y = b.yaw;
      zed.lastSpeed = t.speed;
      zed.lunge = t.lunge;
      animateZombie(zed.body, t.speed, dt, t.lunge);
    }
  }

  /** Geplante Zombies in einem Chunk (nach dem ersten Besuch festgelegt) */
  planned(key: string): number {
    const t = this.totals.get(key);
    return t ? t.outdoor + t.indoor.reduce((a, b) => a + b, 0) : 0;
  }

  killedIn(key: string): number {
    return this.killed.get(key) ?? 0;
  }

  /** Hat der Spieler einen Zombie erschlagen? Zählt für den Chunk (kommt nicht wieder). */
  recordKill(z: Zed): void {
    this.killed.set(z.chunkKey, (this.killed.get(z.chunkKey) ?? 0) + 1);
  }

  /** Beim Tod: Blutlache und durchsuchbare Taschen */
  private makeCorpse(z: Zed): void {
    const marker = new THREE.Mesh();
    marker.position.set(z.x, 0.3, z.z);
    z.container = {
      key: `corpse:${z.id}`, name: 'Zombie-Leiche', kind: -3, x: z.x, z: z.z, level: 0, marker,
      loot: rollLoot(chunkRng(z.id, 3, 21), undefined, 'corpse'),
    };
    z.poolSize = 0.55 + chunkRng(z.id, 5, 7)() * 0.45;
    z.pool = new THREE.Mesh(poolGeo, poolMat);
    z.pool.position.set(z.x, 0.04, z.z);
    z.pool.scale.setScalar(0.05);
    z.pool.rotation.y = chunkRng(z.id, 9, 3)() * 6.28;
    this.group.add(z.pool);
  }

  /** Durchsuchbare Leichen */
  get corpses(): Container[] {
    return this.zombies.filter((z) => !z.alive && z.container).map((z) => z.container!);
  }

  remove(z: Zed, alive = true): void {
    void alive;
    if (z.pool) this.group.remove(z.pool);
    this.group.remove(z.mesh);
    this.zombies = this.zombies.filter((q) => q !== z);
  }

  /** Wie viele Zombies noch leben */
  get livingCount(): number {
    return this.zombies.filter((z) => z.alive).length;
  }
}
