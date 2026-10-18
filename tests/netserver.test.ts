import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { startServer } = require('../electron/server.cjs') as {
  startServer(o: { port: number }): Promise<{ port: number; close(): void; players(): { id: number; name: string }[] }>;
};

/** Kleiner Test-Client (Node hat ab 22 einen eingebauten WebSocket) */
class C {
  ws: WebSocket;
  msgs: Record<string, unknown>[] = [];
  open: Promise<void>;
  constructor(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}`);
    this.open = new Promise((res) => (this.ws.onopen = () => res()));
    this.ws.onmessage = (e) => this.msgs.push(JSON.parse(String(e.data)));
  }
  send(o: object): void {
    this.ws.send(JSON.stringify(o));
  }
  async wait(pred: (m: Record<string, unknown>) => boolean, ms = 1500): Promise<Record<string, unknown>> {
    const t0 = Date.now();
    for (;;) {
      const f = this.msgs.find(pred);
      if (f) return f;
      if (Date.now() - t0 > ms) throw new Error('Zeitüberschreitung; empfangen: ' + JSON.stringify(this.msgs));
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  close(): void {
    this.ws.close();
  }
}

let srv: Awaited<ReturnType<typeof startServer>> | null = null;
const clients: C[] = [];
afterEach(() => {
  for (const c of clients.splice(0)) c.close();
  srv?.close();
  srv = null;
});

async function setup(): Promise<{ port: number; host: C }> {
  srv = await startServer({ port: 0 });
  const host = new C(srv.port);
  clients.push(host);
  await host.open;
  host.send({ t: 'hello', name: 'Hostie', role: 'host' });
  await host.wait((m) => m.t === 'welcome');
  return { port: srv.port, host };
}

describe('Mehrspieler-Server', () => {
  it('Host zuerst, danach treten Spieler bei und bekommen die Liste', async () => {
    const { port, host } = await setup();
    const a = new C(port);
    clients.push(a);
    await a.open;
    a.send({ t: 'hello', name: 'Anna', role: 'client' });
    const w = (await a.wait((m) => m.t === 'welcome')) as { id: number; hostId: number; players: { name: string }[] };
    expect(w.players.map((p) => p.name).sort()).toEqual(['Anna', 'Hostie']);
    expect(w.hostId).not.toBe(w.id);
    const j = (await host.wait((m) => m.t === 'join')) as { player: { name: string } };
    expect(j.player.name).toBe('Anna');
  });

  it('ohne Host kann niemand beitreten', async () => {
    srv = await startServer({ port: 0 });
    const a = new C(srv.port);
    clients.push(a);
    await a.open;
    a.send({ t: 'hello', name: 'Anna', role: 'client' });
    const e = (await a.wait((m) => m.t === 'error')) as { msg: string };
    expect(e.msg).toContain('noch kein Spiel');
  });

  it('ein zweiter Host wird abgelehnt', async () => {
    const { port } = await setup();
    const b = new C(port);
    clients.push(b);
    await b.open;
    b.send({ t: 'hello', name: 'Zweiter', role: 'host' });
    await b.wait((m) => m.t === 'error');
  });

  it('Nachrichten gehen an alle anderen, an den Host oder an eine Id', async () => {
    const { port, host } = await setup();
    const a = new C(port), b = new C(port);
    clients.push(a, b);
    await Promise.all([a.open, b.open]);
    a.send({ t: 'hello', name: 'Anna', role: 'client' });
    b.send({ t: 'hello', name: 'Ben', role: 'client' });
    const wa = (await a.wait((m) => m.t === 'welcome')) as { id: number };
    const wb = (await b.wait((m) => m.t === 'welcome')) as { id: number };

    a.send({ t: 'p', x: 1 });
    expect(((await host.wait((m) => m.t === 'p')) as { from: number }).from).toBe(wa.id);
    await b.wait((m) => m.t === 'p');
    expect(a.msgs.some((m) => m.t === 'p')).toBe(false); // nicht an den Absender zurück

    a.send({ t: 'hit', to: 'host' });
    await host.wait((m) => m.t === 'hit');
    expect(b.msgs.some((m) => m.t === 'hit')).toBe(false);

    host.send({ t: 'strike', to: wb.id });
    await b.wait((m) => m.t === 'strike');
    expect(a.msgs.some((m) => m.t === 'strike')).toBe(false);
  });

  it('verlässt ein Spieler das Spiel, erfahren es die anderen; geht der Host, endet das Spiel', async () => {
    const { port, host } = await setup();
    const a = new C(port);
    clients.push(a);
    await a.open;
    a.send({ t: 'hello', name: 'Anna', role: 'client' });
    const w = (await a.wait((m) => m.t === 'welcome')) as { id: number };
    a.close();
    const l = (await host.wait((m) => m.t === 'leave')) as { id: number };
    expect(l.id).toBe(w.id);

    const b = new C(port);
    clients.push(b);
    await b.open;
    b.send({ t: 'hello', name: 'Ben', role: 'client' });
    await b.wait((m) => m.t === 'welcome');
    host.close();
    await b.wait((m) => m.t === 'end');
  });

  it('große Nachrichten (Weltzustand) kommen heil an', async () => {
    const { port, host } = await setup();
    const a = new C(port);
    clients.push(a);
    await a.open;
    a.send({ t: 'hello', name: 'Anna', role: 'client' });
    await a.wait((m) => m.t === 'welcome');
    const big = 'x'.repeat(300_000);
    host.send({ t: 'state', big });
    const got = (await a.wait((m) => m.t === 'state', 4000)) as { big: string };
    expect(got.big.length).toBe(big.length);
  });
});
