const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('disable-frame-rate-limit');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#000000',
    title: 'Ashfall',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.cjs') },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Selbsttest (nur für Entwickler): ASHFALL_SELFTEST=<png-pfad> speichert nach einigen Sekunden ein Bild und beendet
  if (process.env.ASHFALL_SELFTEST) {
    win.webContents.on('console-message', (e, level, msg) => console.log('[renderer] ' + String(msg ?? e.message).slice(0, 400)));
    win.webContents.on('render-process-gone', (_e, d) => console.log('[gone] ' + d.reason));
    win.webContents.on('did-fail-load', (_e, code, desc) => console.log(`[load-failed] ${code} ${desc}`));
    setTimeout(async () => {
      console.log('[canvas] ' + (await win.webContents.executeJavaScript('document.querySelectorAll("canvas").length + " canvases, hud=" + !!document.getElementById("needs") + ", saves=" + typeof window.ashfallSaves')));
      console.log('[saves] ' + (await win.webContents.executeJavaScript("(async()=>{const s=window.ashfallSaves;const ok=await s.write('selftest',JSON.stringify({meta:{id:'selftest',name:'t',savedAt:1,day:1,seconds:0,playtime:0,hp:1,who:'x',thumb:'',auto:false,version:1},data:{a:1}}));const l=(await s.list()).map(m=>m.id).join(',');const r=await s.read('selftest');await s.remove('selftest');const l2=(await s.list()).map(m=>m.id).join(',');const bad=await s.write('../evil','x');return [ok,l,r?r.length:0,l2,bad].join('|');})()")));
      const img = await win.webContents.capturePage();
      require('fs').writeFileSync(process.env.ASHFALL_SELFTEST, img.toPNG());
      console.log('[selftest] screenshot saved');
      app.quit();
    }, 9000);
  }

  // F11 = Vollbild, Strg+R / F5 neu laden, F12 Entwicklertools
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') win.setFullScreen(!win.isFullScreen());
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) win.webContents.reload();
    if (input.key === 'F12') win.webContents.toggleDevTools();
  });
  // keine Navigation weg vom Spiel
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

// --- Mehrspieler: der Host startet einen WebSocket-Hub im Hauptprozess ---
const { startServer, localAddresses } = require('./server.cjs');
let hub = null;
const dgram = require('dgram');
const DISCOVERY_PORT = 7778;
let hostName = 'Ashfall';
let upnp = null; // { client, port }

// Serverliste im lokalen Netz: der Host sendet alle 2 s ein kleines UDP-Paket, alle Spiele hören mit
const found = new Map(); // "ip:port" -> { name, ip, port, seen }
let beaconTimer = null;
function startListening() {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', () => {});
  sock.on('message', (buf, rinfo) => {
    try {
      const m = JSON.parse(buf.toString('utf8'));
      if (m.app !== 'ashfall' || !Number.isInteger(m.port)) return;
      found.set(`${rinfo.address}:${m.port}`, { name: String(m.name).slice(0, 24), ip: rinfo.address, port: m.port, players: Number(m.players) || 1, seen: Date.now() });
    } catch {
      /* fremdes Paket */
    }
  });
  sock.bind(DISCOVERY_PORT, () => {
    try {
      sock.setBroadcast(true);
    } catch {
      /* egal */
    }
  });
}
function startBeacon(port) {
  stopBeacon();
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', () => {});
  sock.bind(0, () => {
    try {
      sock.setBroadcast(true);
    } catch {
      return;
    }
    const send = () => {
      const msg = Buffer.from(JSON.stringify({ app: 'ashfall', name: hostName, port, players: hub ? hub.players().length : 1 }));
      // an alle Netzwerkkarten (Subnetz-Broadcast) und an den allgemeinen Broadcast
      const targets = new Set(['255.255.255.255']);
      for (const list of Object.values(require('os').networkInterfaces())) {
        for (const i of list ?? []) {
          if (i.family !== 'IPv4' || i.internal) continue;
          const ip = i.address.split('.').map(Number), mask = i.netmask.split('.').map(Number);
          targets.add(ip.map((b, k) => (b | (~mask[k] & 255))).join('.'));
        }
      }
      for (const t of targets) sock.send(msg, DISCOVERY_PORT, t, () => {});
    };
    send();
    beaconTimer = { sock, id: setInterval(send, 2000) };
  });
}
function stopBeacon() {
  if (!beaconTimer) return;
  clearInterval(beaconTimer.id);
  try {
    beaconTimer.sock.close();
  } catch {
    /* egal */
  }
  beaconTimer = null;
}
ipcMain.handle('net:servers', () => {
  const now = Date.now();
  for (const [k, s] of found) if (now - s.seen > 6500) found.delete(k);
  return [...found.values()].map(({ name, ip, port, players }) => ({ name, ip, port, players }));
});

// Internet: Port am Router automatisch freigeben (UPnP), soweit der Router das erlaubt
function openRouterPort(port) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    setTimeout(() => finish({ ok: false }), 5000);
    try {
      const client = require('nat-upnp').createClient();
      client.portMapping({ public: port, private: port, ttl: 7200, protocol: 'TCP', description: 'Ashfall' }, (err) => {
        if (err) return finish({ ok: false });
        upnp = { client, port };
        client.externalIp((e2, ip) => finish({ ok: true, ip: e2 ? null : ip }));
      });
    } catch {
      finish({ ok: false });
    }
  });
}
function closeRouterPort() {
  if (!upnp) return;
  try {
    upnp.client.portUnmapping({ public: upnp.port, protocol: 'TCP' }, () => {});
    upnp.client.close();
  } catch {
    /* egal */
  }
  upnp = null;
}

ipcMain.handle('net:host', async (_e, port, name) => {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1024 || p > 65535) return { ok: false, msg: 'Ungültiger Port (1024–65535).' };
  if (typeof name === 'string' && name.trim()) hostName = name.trim().slice(0, 24);
  if (hub) return { ok: true, port: hub.port, addresses: localAddresses() };
  try {
    hub = await startServer({ port: p });
    startBeacon(hub.port);
    const r = await openRouterPort(hub.port);
    return { ok: true, port: hub.port, addresses: localAddresses(), upnp: r.ok, publicIp: r.ip ?? null };
  } catch (e) {
    return { ok: false, msg: e && e.code === 'EADDRINUSE' ? 'Der Port ist schon belegt.' : 'Server konnte nicht starten.' };
  }
});
ipcMain.handle('net:stop', () => {
  stopBeacon();
  closeRouterPort();
  if (hub) hub.close();
  hub = null;
  return true;
});
app.on('before-quit', () => {
  stopBeacon();
  closeRouterPort();
  if (hub) hub.close();
});

// --- Spielstände: je Slot eine Datei im Benutzerordner (userData/saves) ---
const saveDir = () => path.join(app.getPath('userData'), 'saves');
const okId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(id);
ipcMain.handle('saves:list', () => {
  try {
    fs.mkdirSync(saveDir(), { recursive: true });
    return fs
      .readdirSync(saveDir())
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(saveDir(), f), 'utf8')).meta;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
});
ipcMain.handle('saves:read', (_e, id) => {
  if (!okId(id)) return null;
  try {
    return fs.readFileSync(path.join(saveDir(), id + '.json'), 'utf8');
  } catch {
    return null;
  }
});
ipcMain.handle('saves:write', (_e, id, json) => {
  if (!okId(id) || typeof json !== 'string' || json.length > 40 * 1024 * 1024) return false;
  fs.mkdirSync(saveDir(), { recursive: true });
  const file = path.join(saveDir(), id + '.json');
  fs.writeFileSync(file + '.tmp', json);
  fs.renameSync(file + '.tmp', file); // erst vollständig schreiben, dann ersetzen: ein Absturz zerstört keinen alten Stand
  return true;
});
ipcMain.handle('saves:remove', (_e, id) => {
  if (!okId(id)) return false;
  try {
    fs.unlinkSync(path.join(saveDir(), id + '.json'));
    return true;
  } catch {
    return false;
  }
});

// --- Auto-Update über GitHub Releases (nur in der installierten App, nicht bei `npm run electron`) ---
function setupAutoUpdate() {
  if (!app.isPackaged) return;
  const { autoUpdater } = require('electron-updater');
  const { dialog } = require('electron');
  const win = () => BrowserWindow.getAllWindows()[0];
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // sonst wird es beim nächsten normalen Beenden installiert
  autoUpdater.on('update-available', (i) => win()?.setTitle(`Ashfall – Update ${i.version} wird geladen …`));
  autoUpdater.on('update-not-available', () => win()?.setTitle('Ashfall'));
  autoUpdater.on('error', () => win()?.setTitle('Ashfall'));
  autoUpdater.on('update-downloaded', async (i) => {
    win()?.setTitle('Ashfall');
    const r = await dialog.showMessageBox(win(), {
      type: 'info',
      buttons: ['Jetzt neu starten', 'Später'],
      defaultId: 0,
      title: 'Update bereit',
      message: `Ashfall ${i.version} ist heruntergeladen.`,
      detail: 'Neu starten, um das Update zu installieren? Nicht gespeicherter Fortschritt geht verloren. Bei „Später“ wird es beim nächsten Beenden installiert.',
    });
    if (r.response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.checkForUpdates().catch(() => {});
}

app.whenReady().then(() => {
  createWindow();
  startListening();
  setupAutoUpdate();
});
app.on('window-all-closed', () => app.quit());
