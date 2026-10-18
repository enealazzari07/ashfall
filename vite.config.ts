import { defineConfig } from 'vite';

// base './' damit das Spiel auch per file:// (Electron/EXE) lädt
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
});
