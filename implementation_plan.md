# Implementation Plan: "Ashfall" (Arbeitstitel)

Modernes 3D-Survival im Stil von Project Zomboid, ohne Zombies. Gegner/Druck = **Fraktionen** (andere Überlebende). Three.js + Vite, läuft im Browser.

## 1. Kritikpunkte an Project Zomboid -> unsere Antwort

| PZ-Kritik | Lösung in Ashfall |
|---|---|
| Steile Lernkurve, kein echtes Tutorial | Geführter Einstieg (erste 15 Min), kontextuelle Hinweise, durchsuchbares In-Game-Wiki |
| Umständliches Inventar / Looten (Mikromanagement) | Quick-Loot, Auto-Sortierung, Gewicht + Slots statt Pixel-Tetris, Mehrfach-Auswahl |
| Klobige Steuerung, träge Animationen | Responsive WASD + Maus, abbrechbare Aktionen, Aktionswarteschlange |
| Veraltete Optik (2.5D/isometrisch) | Echtes 3D, dynamisches Licht/Schatten, Tag/Nacht, Wetter |
| Unfaire Tode ("ein Fehler = Run weg") | Verletzungen mit Warnstufen, Autosave + optionaler Permadeath-Modus, klare Anzeige von Ursachen |
| Spielende ohne Ziel, Mid/Late-Game leer | Fraktions-Beziehungen, Territorien, Handelsrouten, Kampagnenziele + Sandbox |
| Performance/Bugs bei großer Karte | Chunk-Streaming, Instancing, LOD, Performance-Budget (60 FPS Ziel) |
| Repetitives Gameplay (Loot, Warten) | Dynamische Events, Fraktions-KI mit eigenen Zielen, Zeitbeschleunigung |
| Seltene Updates/Content | Datengetriebener Content (JSON), Mod-freundlich |
| UI-Überladung | Minimalistisches HUD, Kontextmenü am Objekt, Rebindbare Tasten |

## 2. Kernprinzip
Spieler startet allein in einer zerfallenen Stadt. Mehrere NPC-Fraktionen (z.B. Händler, Plünderer, Farmer-Kommune) mit **Ruf, Territorium, Ressourcenbedarf**. Überleben = Grundbedürfnisse (Hunger, Durst, Wärme, Müdigkeit, Gesundheit) + Beziehungen managen: Handeln, Verbünden, Verhandeln, Verteidigen. Konflikt ist mit Waffen **oder** Diplomatie lösbar.

## 3. Tech-Stack
- Vite + TypeScript, Three.js, Rapier (Physik, WASM), Zustand-ähnlicher eigener Store, Vitest
- Content als JSON (Items, Rezepte, Fraktionen, Events)

## 4. Dateien

### [NEW] Projekt-Setup
- `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`

### [NEW] Engine/Kern
- `src/main.ts` – Bootstrap, Game-Loop (Fixed Timestep)
- `src/core/Game.ts`, `Time.ts` (Tag/Nacht, Zeitbeschleunigung), `Input.ts` (rebindbar), `SaveSystem.ts` (Autosave, localStorage/IndexedDB)

### [NEW] Welt
- `src/world/ChunkManager.ts` – prozedurale Chunks, Streaming, LOD
- `src/world/CityGenerator.ts` – Gebäude, Straßen, begehbare Innenräume
- `src/world/Weather.ts`, `Lighting.ts` – Wetter, dynamisches Licht, Schatten

### [NEW] Spieler & Überleben
- `src/player/PlayerController.ts` – Third-Person-Kamera, Bewegung, abbrechbare Aktionen
- `src/player/Needs.ts` – Hunger/Durst/Wärme/Müdigkeit
- `src/player/Health.ts` – Verletzungen mit Warnstufen
- `src/player/Inventory.ts` – Gewicht/Slots, Quick-Loot, Auto-Sort

### [NEW] Fraktionen (neues Kernprinzip)
- `src/factions/Faction.ts`, `FactionAI.ts` – Ziele, Ressourcen, Patrouillen
- `src/factions/Reputation.ts`, `Diplomacy.ts`, `Trade.ts`
- `src/factions/Events.ts` – dynamische Ereignisse (Überfall, Handelskarawane, Hilferuf)

### [NEW] Crafting/Bauen
- `src/crafting/Recipes.ts`, `BuildSystem.ts` (Basisbau mit Raster-Snap)

### [NEW] UI
- `src/ui/HUD.ts`, `InventoryUI.ts`, `ContextMenu.ts`, `Tutorial.ts`, `Wiki.ts`, `Settings.ts`

### [NEW] Daten
- `data/items.json`, `recipes.json`, `factions.json`, `events.json`

### [NEW] Tests
- `tests/needs.test.ts`, `reputation.test.ts`, `inventory.test.ts`

## 5. Meilensteine (Checklist wird danach als `task.md` angelegt)
1. Setup + Game-Loop + Third-Person-Controller auf Testgelände
2. Chunk-Welt + Stadtgenerator + Tag/Nacht/Wetter
3. Needs, Gesundheit, Inventar (Quick-Loot)
4. Crafting + Basisbau
5. Fraktionen: KI, Ruf, Handel, Diplomatie, Events
6. Tutorial, Wiki, Settings, Save/Load
7. Performance-Pass (Instancing/LOD), Balancing

## 6. Umfang Version 1 (MVP)
Eine Stadt, 3 Fraktionen, ~40 Items, ~20 Rezepte, Basisbau, Tutorial. Danach erweiterbar.

## Freigabe
Antworte **"Yes"**, um mit Meilenstein 1 zu starten (oder nenne Änderungen: Setting, Fraktionen, Umfang).
