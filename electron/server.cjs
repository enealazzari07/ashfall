/**
 * Mehrspieler-Server: ein kleiner WebSocket-Hub ohne Fremdbibliothek (RFC 6455).
 * Er verteilt nur Nachrichten und führt die Spielerliste; die Spiellogik (Zombies, Welt) läuft im Spiel des Hosts.
 *
 * Protokoll (JSON-Textnachrichten):
 *   Client → Server  {t:'hello', name, role:'host'|'client', look?}   (erste Nachricht)
 *   Server → Client  {t:'welcome', id, hostId, players:[{id,name,look}]}  oder {t:'error', msg}
 *   Server → alle    {t:'join', player} / {t:'leave', id} / {t:'end', reason}
 *   alle anderen     werden weitergeleitet: `to` = 'host' | Spieler-Id → nur dorthin, sonst an alle außer dem Absender;
 *                    der Server setzt `from` auf die Id des Absenders.
 *
 * Start im Terminal:  node electron/server.cjs [port]
 */
const http = require('http');
const crypto = require('crypto');
const os = require('os');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PLAYERS = 8;
const MAX_FRAME = 16 * 1024 * 1024;
const DEFAULT_PORT = 7777;

/** Textrahmen (unmaskiert, wie der Server senden muss) */
function textFrame(str) {
  const payload = Buffer.from(str, 'utf8');
  const n = payload.length;
  let head;
  if (n < 126) head = Buffer.from([0x81, n]);
  else if (n < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x81;
    head[1] = 126;
    head.writeUInt16BE(n, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x81;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(n), 2);
  }
  return Buffer.concat([head, payload]);
}

function controlFrame(op, payload = Buffer.alloc(0)) {
  return Buffer.concat([Buffer.from([0x80 | op, payload.length]), payload]);
}

/** Zerlegt eingehende Bytes in Nachrichten; ruft onText(string), onPing(buf), onClose() */
class FrameParser {
  constructor({ onText, onPing, onClose, onError }) {
    this.buf = Buffer.alloc(0);
    this.frag = null;
    Object.assign(this, { onText, onPing, onClose, onError });
  }

  push(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_FRAME)) return this.onError('Nachricht zu groß');
        len = Number(big);
        off = 10;
      }
      if (len > MAX_FRAME) return this.onError('Nachricht zu groß');
      if (!masked) return this.onError('Client-Rahmen müssen maskiert sein');
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const data = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      if (op === 0x8) return this.onClose();
      if (op === 0x9) {
        this.onPing(data);
        continue;
      }
      if (op === 0xa) continue;
      if (op === 0x1 || op === 0x2 || op === 0x0) {
        if (op !== 0x0) this.frag = { text: op === 0x1, parts: [] };
        if (!this.frag) continue;
        this.frag.parts.push(data);
        if (this.frag.parts.reduce((n, p) => n + p.length, 0) > MAX_FRAME) return this.onError('Nachricht zu groß');
        if (fin) {
          const f = this.frag;
          this.frag = null;
          if (f.text) this.onText(Buffer.concat(f.parts).toString('utf8'));
        }
      }
    }
  }
}

/** Startet den Hub. Gibt {port, close, players} zurück oder wirft, wenn der Port belegt ist. */
function startServer({ port = DEFAULT_PORT, log = () => {} } = {}) {
  const clients = new Map();
  let nextId = 1;
  let hostId = null;

  const send = (c, obj) => {
    try {
      c.sock.write(textFrame(JSON.stringify(obj)));
    } catch {
      /* Verbindung weg */
    }
  };
  const roster = () => [...clients.values()].filter((c) => c.joined).map((c) => ({ id: c.id, name: c.name, look: c.look, host: c.id === hostId }));
  const broadcast = (obj, exceptId) => {
    for (const c of clients.values()) if (c.joined && c.id !== exceptId) send(c, obj);
  };
  const drop = (c, reason) => {
    if (!clients.has(c.id)) return;
    clients.delete(c.id);
    try {
      c.sock.destroy();
    } catch {
      /* egal */
    }
    if (!c.joined) return;
    log(`Spieler ${c.name} (#${c.id}) hat das Spiel verlassen${reason ? ': ' + reason : ''}`);
    if (c.id === hostId) {
      broadcast({ t: 'end', reason: 'Der Host hat das Spiel beendet.' }, c.id);
      for (const o of [...clients.values()]) drop(o, 'Host weg');
      hostId = null;
    } else broadcast({ t: 'leave', id: c.id });
  };

  const server = http.createServer((_req, res) => {
    res.writeHead(426, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Ashfall-Mehrspielerserver (WebSocket).');
  });

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket') {
      socket.destroy();
      return;
    }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.setNoDelay(true);
    const c = { id: nextId++, sock: socket, joined: false, name: '', look: null };
    clients.set(c.id, c);
    const timeout = setTimeout(() => {
      if (!c.joined) drop(c, 'kein Hallo');
    }, 8000);
    const parser = new FrameParser({
      onText: (text) => {
        let m;
        try {
          m = JSON.parse(text);
        } catch {
          return;
        }
        if (!m || typeof m.t !== 'string') return;
        if (!c.joined) {
          if (m.t !== 'hello') return;
          clearTimeout(timeout);
          const name = String(m.name ?? 'Spieler').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || 'Spieler';
          if (m.role === 'host') {
            if (hostId !== null) {
              send(c, { t: 'error', msg: 'Es läuft schon ein Host auf diesem Server.' });
              return drop(c, 'zweiter Host');
            }
            hostId = c.id;
          } else if (hostId === null) {
            send(c, { t: 'error', msg: 'Hier läuft noch kein Spiel.' });
            return drop(c, 'kein Host');
          }
          if (roster().length >= MAX_PLAYERS) {
            send(c, { t: 'error', msg: `Das Spiel ist voll (${MAX_PLAYERS} Spieler).` });
            return drop(c, 'voll');
          }
          c.joined = true;
          c.name = name;
          c.look = m.look ?? null;
          send(c, { t: 'welcome', id: c.id, hostId, players: roster() });
          broadcast({ t: 'join', player: { id: c.id, name: c.name, look: c.look, host: c.id === hostId } }, c.id);
          log(`Spieler ${name} (#${c.id}) ist beigetreten${c.id === hostId ? ' (Host)' : ''}`);
          return;
        }
        m.from = c.id;
        if (m.to === 'host') {
          const h = clients.get(hostId);
          if (h && h.id !== c.id) send(h, m);
        } else if (typeof m.to === 'number') {
          const o = clients.get(m.to);
          if (o && o.joined) send(o, m);
        } else broadcast(m, c.id);
      },
      onPing: (data) => {
        try {
          socket.write(controlFrame(0xa, data.subarray(0, 125)));
        } catch {
          /* egal */
        }
      },
      onClose: () => drop(c, 'getrennt'),
      onError: (why) => drop(c, why),
    });
    socket.on('data', (d) => parser.push(d));
    socket.on('close', () => drop(c, ''));
    socket.on('error', () => drop(c, 'Fehler'));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      const addr = server.address();
      log(`Server läuft auf Port ${addr.port}`);
      resolve({
        port: addr.port,
        players: () => roster(),
        close: () => {
          for (const c of [...clients.values()]) drop(c, 'Server beendet');
          server.close();
        },
      });
    });
  });
}

/** Lokale IPv4-Adressen für die Anzeige „Mitspieler verbinden sich mit …“ */
function localAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}

module.exports = { startServer, localAddresses, DEFAULT_PORT, MAX_PLAYERS };

if (require.main === module) {
  const port = Number(process.argv[2]) || DEFAULT_PORT;
  startServer({ port, log: (m) => console.log(m) })
    .then(() => console.log('Adressen:', localAddresses().map((a) => `${a}:${port}`).join(', ') || 'nur localhost'))
    .catch((e) => {
      console.error('Start fehlgeschlagen:', e.message);
      process.exit(1);
    });
}
