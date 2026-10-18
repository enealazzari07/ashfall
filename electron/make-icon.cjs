// Erzeugt build/icon.ico (PNG-in-ICO) aus einer gezeichneten Grafik. Aufruf: npx electron electron/make-icon.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 256, height: 256, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<canvas id=c width=256 height=256></canvas>');
  const dataUrl = await win.webContents.executeJavaScript(`(() => {
    const c = document.getElementById('c'), g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 256);
    bg.addColorStop(0, '#3a2c22'); bg.addColorStop(1, '#14100c');
    g.fillStyle = bg; g.beginPath(); g.roundRect(8, 8, 240, 240, 44); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#e08a2c'; g.stroke();
    const glow = g.createRadialGradient(128, 150, 10, 128, 150, 130);
    glow.addColorStop(0, 'rgba(240,150,50,0.55)'); glow.addColorStop(1, 'rgba(240,150,50,0)');
    g.fillStyle = glow; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#f0b366'; g.font = 'bold 170px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 10; g.shadowOffsetY = 6;
    g.fillText('A', 128, 134);
    g.shadowColor = 'transparent';
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(20 + Math.random() * 216, 20 + Math.random() * 216, 1 + Math.random() * 2.2, 0, 7); g.fill(); }
    return c.toDataURL('image/png');
  })()`);
  const png = Buffer.from(dataUrl.split(',')[1], 'base64');
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head[6] = 0; head[7] = 0; head[8] = 0; head[9] = 0; // 0 = 256 px
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.ico'), Buffer.concat([head, png]));
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), png);
  app.quit();
});
