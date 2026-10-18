/**
 * Verbindung zum Mehrspieler-Server (WebSocket). Der Server (electron/server.cjs) leitet Nachrichten nur weiter;
 * Host-Spiel und Mitspieler sprechen über diese Klasse miteinander.
 */
export interface PlayerLook {
  jacket?: number;
  pants?: number;
  skin?: number;
  hair?: number;
  hairSeed?: number;
}

export interface PeerInfo {
  id: number;
  name: string;
  host: boolean;
  look?: PlayerLook | null;
}

export interface NetMsg {
  t: string;
  /** Absender (setzt der Server) */
  from?: number;
  /** Ziel: 'host' oder Spieler-Id; ohne Ziel gehen Nachrichten an alle anderen */
  to?: 'host' | number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

type Handler = (m: NetMsg) => void;

export class NetClient {
  private ws: WebSocket | null = null;
  id = 0;
  hostId = 0;
  readonly peers = new Map<number, PeerInfo>();
  private handlers = new Map<string, Handler>();
  /** Das Spiel ist zu Ende (Host weg, Verbindung verloren, Fehler) */
  onEnd: (reason: string) => void = () => {};
  onJoin: (p: PeerInfo) => void = () => {};
  onLeave: (p: PeerInfo) => void = () => {};
  private ended = false;

  get connected(): boolean {
    return !!this.ws && this.ws.readyState === 1 && !this.ended;
  }

  get isHost(): boolean {
    return this.id !== 0 && this.id === this.hostId;
  }

  /** Nachrichtenart → Behandlung (eine je Art) */
  on(t: string, h: Handler): void {
    this.handlers.set(t, h);
  }

  /** Verbindet und meldet sich an; löst auf, sobald der Server „welcome“ geschickt hat */
  connect(url: string, name: string, role: 'host' | 'client', look: PlayerLook | null = null, timeoutMs = 6000): Promise<void> {
    this.ended = false;
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (msg: string): void => {
        if (settled) return;
        settled = true;
        try {
          this.ws?.close();
        } catch {
          /* egal */
        }
        reject(new Error(msg));
      };
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        return fail('Ungültige Adresse.');
      }
      this.ws = ws;
      const timer = setTimeout(() => fail('Keine Antwort vom Server (Adresse, Port und Firewall prüfen).'), timeoutMs);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name, role, look }));
      ws.onerror = () => fail('Verbindung nicht möglich. Läuft das Spiel des Hosts, und stimmen Adresse und Port?');
      ws.onclose = () => {
        if (!settled) fail('Verbindung wurde geschlossen.');
        else this.end('Die Verbindung wurde getrennt.');
      };
      ws.onmessage = (e) => {
        let m: NetMsg;
        try {
          m = JSON.parse(String(e.data)) as NetMsg;
        } catch {
          return;
        }
        if (!settled) {
          if (m.t === 'welcome') {
            settled = true;
            clearTimeout(timer);
            this.id = m.id;
            this.hostId = m.hostId;
            this.peers.clear();
            for (const p of m.players as PeerInfo[]) this.peers.set(p.id, p);
            resolve();
          } else if (m.t === 'error') {
            clearTimeout(timer);
            fail(String(m.msg ?? 'Der Server hat die Verbindung abgelehnt.'));
          }
          return;
        }
        this.dispatch(m);
      };
    });
  }

  private dispatch(m: NetMsg): void {
    switch (m.t) {
      case 'join': {
        const p = m.player as PeerInfo;
        this.peers.set(p.id, p);
        this.onJoin(p);
        break;
      }
      case 'leave': {
        const p = this.peers.get(m.id);
        this.peers.delete(m.id);
        if (p) this.onLeave(p);
        break;
      }
      case 'end':
        this.end(String(m.reason ?? 'Das Spiel wurde beendet.'));
        break;
      default:
        this.handlers.get(m.t)?.(m);
    }
  }

  private end(reason: string): void {
    if (this.ended) return;
    this.ended = true;
    this.peers.clear();
    this.onEnd(reason);
  }

  send(m: NetMsg): void {
    if (this.connected) this.ws!.send(JSON.stringify(m));
  }

  toHost(m: NetMsg): void {
    this.send({ ...m, to: 'host' });
  }

  to(id: number, m: NetMsg): void {
    this.send({ ...m, to: id });
  }

  close(): void {
    this.ended = true;
    try {
      this.ws?.close();
    } catch {
      /* egal */
    }
    this.ws = null;
    this.peers.clear();
    this.id = this.hostId = 0;
  }
}
