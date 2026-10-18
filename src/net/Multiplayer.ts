import * as THREE from 'three';
import type { Outfit } from '../render/Character';
import type { NetZombie } from '../world/ZombieWorld';
import { NetClient, NetMsg, PeerInfo, PlayerLook } from './NetClient';
import { PoseMsg, RemotePlayer } from './Remote';
import { DynTracker } from './Sync';

/** Zustand beim Beitritt, den der Host an den neuen Mitspieler schickt */
export interface InitMsg {
  day: number;
  seconds: number;
  weather: string;
  dyn: [string, unknown][];
  pieces: unknown[];
  piles: unknown[];
}

/** Was das Spiel dem Mehrspieler-Teil liefert bzw. von ihm erfährt. Alles optional, damit Tests schlank bleiben. */
export interface MpHooks {
  /** Eigene Lage und Kleidung für die Mitspieler */
  pose?: () => { pose: PoseMsg; outfit: Outfit } | null;
  /** Host: Zustand für einen neuen Mitspieler zusammenstellen */
  makeInit?: () => InitMsg;
  /** Client: Zustand vom Host übernehmen */
  onInit?: (m: InitMsg) => void;
  /** Client: Zeit und Wetter vom Host */
  onTime?: (m: { day: number; seconds: number; weather: string }) => void;
  /** Host: aktuelle Zeit und Wetter */
  timeNow?: () => { day: number; seconds: number; weather: string };
  /** Veränderte Weltzustände (Türen, Fenster, Behälter, Abriss) */
  dynOut?: () => [string, unknown][];
  onDyn?: (e: [string, unknown][]) => void;
  /** Bauten und Haufen auf dem Boden: Gesamtliste, wenn sich etwas geändert hat */
  piecesOut?: () => unknown[];
  onPieces?: (list: unknown[]) => void;
  pilesOut?: () => unknown[];
  onPiles?: (list: unknown[]) => void;
  /** Host: Zombies für Mitspieler in der Nähe */
  zombiesOut?: (centers: { x: number; z: number }[]) => NetZombie[];
  /** Client: Zombies vom Host */
  onZombies?: (list: NetZombie[]) => void;
  /** Host: Mitspieler hat einen Zombie getroffen */
  onZombieHit?: (m: { id: number; d: number; px: number; pz: number; from?: { x: number; z: number } }) => void;
  /** Client: Der Host meldet einen Zombie-Schlag gegen mich */
  onStrike?: (zid: number) => void;
  /** Host: Geräusch eines Mitspielers */
  onNoise?: (x: number, z: number, r: number) => void;
  onChat?: (name: string, text: string, own: boolean) => void;
  onSystem?: (text: string) => void;
  /** Spiel zu Ende (Host weg oder Verbindung verloren) */
  onEnd?: (reason: string) => void;
}

const POSE_EVERY = 0.1;
const ZOMBIE_EVERY = 0.12;
const TIME_EVERY = 2;
const DYN_EVERY = 0.8;

/** Eine Mehrspieler-Sitzung: Verbindung, Mitspieler in der Welt, Abgleich von Zeit, Zombies, Welt und Bauten. */
export class Multiplayer {
  readonly net = new NetClient();
  /** Figuren der Mitspieler */
  readonly group = new THREE.Group();
  readonly remotes = new Map<number, RemotePlayer>();
  hooks: MpHooks = {};
  name = 'Spieler';
  private dynTrack = new DynTracker();
  private piecesKey = '';
  private pilesKey = '';
  private tPose = 0;
  private tZomb = 0;
  private tTime = 0;
  private tDyn = 0;
  /** Vor dem Spielstart eingetroffene Nachrichten, die erst dann angewendet werden können */
  private pending: NetMsg[] = [];
  ready = false;

  get isHost(): boolean {
    return this.net.isHost;
  }

  get connected(): boolean {
    return this.net.connected;
  }

  get id(): number {
    return this.net.id;
  }

  /** Verbindet und richtet alle Nachrichtenbehandlungen ein */
  async connect(url: string, name: string, role: 'host' | 'client', look: PlayerLook | null): Promise<void> {
    this.name = name;
    await this.net.connect(url, name, role, look);
    for (const p of this.net.peers.values()) if (p.id !== this.net.id) this.addRemote(p);
    this.net.onJoin = (p) => {
      this.addRemote(p);
      this.hooks.onSystem?.(`${p.name} ist beigetreten.`);
      // Host: neuen Spieler auf den Stand bringen
      if (this.isHost && this.ready && this.hooks.makeInit) this.net.to(p.id, { t: 'init', ...this.hooks.makeInit() });
    };
    this.net.onLeave = (p) => {
      const r = this.remotes.get(p.id);
      if (r) {
        this.group.remove(r.mesh);
        this.remotes.delete(p.id);
      }
      this.hooks.onSystem?.(`${p.name} hat das Spiel verlassen.`);
    };
    this.net.onEnd = (reason) => {
      this.clearRemotes();
      this.hooks.onEnd?.(reason);
    };
    const n = this.net;
    n.on('pose', (m) => {
      const r = this.remotes.get(m.from!);
      if (!r) return;
      r.setPose(m.pose as PoseMsg);
      if (m.outfit) r.setOutfit(m.outfit as Outfit);
    });
    n.on('chat', (m) => {
      const p = this.net.peers.get(m.from!);
      this.hooks.onChat?.(p?.name ?? 'Unbekannt', String(m.text ?? '').slice(0, 200), false);
    });
    for (const t of ['init', 'time', 'dyn', 'pieces', 'piles', 'zomb', 'zhit', 'strike', 'noise']) n.on(t, (m) => this.receive(m));
  }

  /** Nach dem Spielstart: aufgestaute Nachrichten abarbeiten, Host schickt allen Wartenden den Stand */
  markReady(): void {
    if (this.ready) return;
    this.ready = true;
    const baseline = this.hooks.dynOut?.() ?? [];
    this.dynTrack.baseline(baseline);
    for (const m of this.pending.splice(0)) this.receive(m);
    if (this.isHost && this.hooks.makeInit) for (const p of this.net.peers.values()) if (p.id !== this.net.id) this.net.to(p.id, { t: 'init', ...this.hooks.makeInit() });
    this.hooks.onSystem?.(this.isHost ? 'Du bist Host. Mitspieler können beitreten.' : 'Mit dem Host verbunden.');
  }

  private receive(m: NetMsg): void {
    if (!this.ready) {
      // Zeit, Zustand und Welt erst anwenden, wenn die Welt steht (nur das letzte Paket je Art behalten)
      this.pending = this.pending.filter((q) => q.t !== m.t || m.t === 'dyn');
      this.pending.push(m);
      return;
    }
    const h = this.hooks;
    switch (m.t) {
      case 'init': {
        const i = m as unknown as InitMsg;
        this.dynTrack.known(i.dyn);
        h.onInit?.(i);
        this.piecesKey = JSON.stringify(keyOf(h.piecesOut?.() ?? []));
        this.pilesKey = JSON.stringify(pileKey(h.pilesOut?.() ?? []));
        break;
      }
      case 'time':
        h.onTime?.(m as unknown as { day: number; seconds: number; weather: string });
        break;
      case 'dyn':
        this.dynTrack.known(m.e);
        h.onDyn?.(m.e);
        break;
      case 'pieces':
        this.piecesKey = JSON.stringify(keyOf(m.list));
        h.onPieces?.(m.list);
        break;
      case 'piles':
        this.pilesKey = JSON.stringify(pileKey(m.list));
        h.onPiles?.(m.list);
        break;
      case 'zomb':
        if (!this.isHost) h.onZombies?.(m.list as NetZombie[]);
        break;
      case 'zhit':
        if (this.isHost) h.onZombieHit?.({ id: m.id, d: m.d, px: m.px, pz: m.pz, from: m.from_pos });
        break;
      case 'strike':
        h.onStrike?.(m.zid);
        break;
      case 'noise':
        if (this.isHost) h.onNoise?.(m.x, m.z, m.r);
        break;
    }
  }

  private addRemote(p: PeerInfo): void {
    if (this.remotes.has(p.id)) return;
    const r = new RemotePlayer(p);
    this.remotes.set(p.id, r);
    this.group.add(r.mesh);
  }

  private clearRemotes(): void {
    for (const r of this.remotes.values()) this.group.remove(r.mesh);
    this.remotes.clear();
  }

  // --- Senden ---------------------------------------------------------------------------------------

  chat(text: string): void {
    const t = text.trim().slice(0, 200);
    if (!t) return;
    this.net.send({ t: 'chat', text: t });
    this.hooks.onChat?.(this.name, t, true);
  }

  hitZombie(id: number, d: number, px: number, pz: number, from?: { x: number; z: number }): void {
    this.net.toHost({ t: 'zhit', id, d, px, pz, from_pos: from });
  }

  strikePlayer(playerId: number, zid: number): void {
    this.net.to(playerId, { t: 'strike', zid });
  }

  noise(x: number, z: number, r: number): void {
    this.net.toHost({ t: 'noise', x, z, r });
  }

  /** Zu Spielern auf dem Host: Positionen der Mitspieler (für die Zombie-Steuerung) */
  others(): { id: number; x: number; z: number }[] {
    return [...this.remotes.values()].filter((r) => !r.dead && r.mesh.visible).map((r) => ({ id: r.info.id, x: r.x, z: r.z }));
  }

  /** Jeden Frame: eigene Lage senden, Mitspieler bewegen, regelmäßig Zustand abgleichen */
  tick(dt: number, localCenter: { x: number; z: number }): void {
    for (const r of this.remotes.values()) r.update(dt);
    if (!this.net.connected || !this.ready) return;
    const h = this.hooks;
    this.tPose += dt;
    if (this.tPose >= POSE_EVERY) {
      this.tPose = 0;
      const p = h.pose?.();
      if (p) this.net.send({ t: 'pose', pose: p.pose, outfit: p.outfit });
    }
    if (this.isHost) {
      this.tTime += dt;
      if (this.tTime >= TIME_EVERY && h.timeNow) {
        this.tTime = 0;
        this.net.send({ t: 'time', ...h.timeNow() });
      }
      this.tZomb += dt;
      if (this.tZomb >= ZOMBIE_EVERY && h.zombiesOut) {
        this.tZomb = 0;
        const centers = [localCenter, ...this.others()];
        this.net.send({ t: 'zomb', list: h.zombiesOut(centers) });
      }
    }
    this.tDyn += dt;
    if (this.tDyn >= DYN_EVERY) {
      this.tDyn = 0;
      const changed = h.dynOut ? this.dynTrack.diff(h.dynOut()) : [];
      if (changed.length) this.net.send({ t: 'dyn', e: changed });
      if (h.piecesOut) {
        const list = h.piecesOut();
        const k = JSON.stringify(keyOf(list));
        if (k !== this.piecesKey) {
          this.piecesKey = k;
          this.net.send({ t: 'pieces', list });
        }
      }
      if (h.pilesOut) {
        const list = h.pilesOut();
        const k = JSON.stringify(pileKey(list));
        if (k !== this.pilesKey) {
          this.pilesKey = k;
          this.net.send({ t: 'piles', list });
        }
      }
    }
  }

  close(): void {
    this.clearRemotes();
    this.net.close();
    this.ready = false;
  }
}

/** Vergleichsschlüssel für Bauten: Art, Ort und Drehung (Brennstoff ändert sich dauernd und zählt nicht) */
function keyOf(list: unknown[]): unknown[] {
  return (list as { id: string; x: number; z: number; rot: number }[]).map((p) => [p.id, p.x, p.z, p.rot]);
}

/** Vergleichsschlüssel für Haufen: Ort und Inhalt */
function pileKey(list: unknown[]): unknown[] {
  return (list as { x: number; z: number; loot: { id: string; qty: number }[] }[]).map((p) => [p.x.toFixed(1), p.z.toFixed(1), p.loot.map((s) => `${s.id}${s.qty}`).join(',')]);
}
