const { contextBridge, ipcRenderer } = require('electron');

// Schmale, feste Schnittstelle für Spielstände (keine freien Dateipfade aus dem Spiel heraus)
contextBridge.exposeInMainWorld('ashfallSaves', {
  list: () => ipcRenderer.invoke('saves:list'),
  read: (id) => ipcRenderer.invoke('saves:read', id),
  write: (id, json) => ipcRenderer.invoke('saves:write', id, json),
  remove: (id) => ipcRenderer.invoke('saves:remove', id),
});

// Mehrspieler: nur Server starten/stoppen; verbunden wird aus dem Spiel per WebSocket
contextBridge.exposeInMainWorld('ashfallNet', {
  host: (port, name) => ipcRenderer.invoke('net:host', port, name),
  servers: () => ipcRenderer.invoke('net:servers'),
  stop: () => ipcRenderer.invoke('net:stop'),
});
