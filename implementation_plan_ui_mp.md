# Plan: Inventar, Startbildschirm + Speichern/Laden, Sound, Multiplayer

## Befund (Recherche)
- **Inventar** (`src/ui/InventoryUI.ts`, 1045 Zeilen): links ein Fenster „Behälter/Boden", rechts EIN Fenster mit Reitern Körper / Rucksack / Charakter / Gesundheit. Es gibt keinen Kofferraum und keine Seitentaschen. `Inventory.ts` kennt nur zwei Behälter (`main`, `bag`).
- **Speichern**: gibt es **nicht**. Das Spiel kennt nur Einstellungen (`localStorage`) und die Charakter-Vorlage. Die Welt ist per Seed/Chunk erzeugt, Zustand (Loot, Türen, Fenster, Autos, Bauten, Zombies) liegt im Speicher.
- **Startbildschirm** (`MainMenu.ts`): Weiter / Neues Spiel / Optionen / Credits; „Weiter" geht nur innerhalb derselben Sitzung.
- **Sound**: es gibt **keinen** (kein `AudioContext`, keine Audiodateien im Projekt).
- **Multiplayer**: nicht vorhanden. Electron-Hauptprozess (`electron/main.cjs`) ist 57 Zeilen, kann aber einen lokalen Server starten.

## Umfang in vier Teilen (jeder Teil lässt sich einzeln liefern)

### Teil A: Inventar neu — [MODIFY] `InventoryUI.ts`, `inventory.css`, `Inventory.ts`, `ChunkManager.ts`
Drei Spalten, von links nach rechts:
1. **Umgebung**: Reiter *Lager / Kofferraum / Boden* (je nachdem, was in Reichweite ist; Auto in der Nähe → Kofferraum).
2. **Rucksack-Box**: Rucksack plus weitere Taschen (Seitentaschen, Gürteltasche, Jackentaschen) als eigene Behälter mit Kapazität.
3. **Ganz rechts: Körper** (Figur mit Ausrüstungsplätzen) und darunter die **normale Tasche** (Hosen-/Jackentaschen).
- `Inventory.ts`: Behälter werden eine Liste (`main`, `bag`, `side1…`), jedes Item der Ausrüstung kann Taschen liefern; Gewicht und „Rucksack erleichtert" bleiben.
- Auto: neuer Container `trunk` (Kofferraum) je Fahrzeug, per `F` am Heck öffnen.
- Ziehen, Doppelklick, Sortieren, Filter bleiben erhalten.

### Teil B: Startbildschirm, Speichern, Laden, Ladeanimation — [NEW] `src/core/SaveSystem.ts`, `src/ui/SaveMenu.ts`, [MODIFY] `MainMenu.ts`, `Game.ts`
- Neuer Startbildschirm: größeres Logo, animierte Nacht-Szene (Parallax, Funken), Menü: Weiter, Neues Spiel, **Laden**, **Mehrspieler**, Optionen, Credits, Beenden.
- Speichern: benannte Spielstände (Name frei wählbar, Auto-Slot, bis ~20 Slots), je Slot Vorschaubild, Tag/Zeit, Spielzeit, Datum; Umbenennen, Löschen.
- Gespeichert wird: Welt-Seed, Zeit/Wetter, Spieler (Position, Werte, Gesundheit, Wunden, Fertigkeiten, Charakter), Inventar/Ausrüstung/Schnellleiste, geleerte Behälter, Türen/Fenster/Bretter, genommene Autos und Zustand, Bauten, Fraktions-Ruf. Zombies werden aus Seed und Zeit neu verteilt (Position der nahen werden gespeichert).
- Speicherort: Datei im Benutzerordner (Electron `userData/saves`) über einen sicheren Preload-Kanal; im Browser `localStorage`.
- Ladeanimation: Ladebildschirm mit Fortschrittsbalken und Tipps, während Chunks und Texturen entstehen; weiches Ein-/Ausblenden.

### Teil C: Sound — [NEW] `src/audio/AudioEngine.ts` (+ Aufrufe in `Game.ts`, `ZombieWorld.ts`, `PlayerController.ts`)
- Keine Audiodateien nötig: Klänge werden mit WebAudio erzeugt (Rauschen, Oszillatoren, Filter).
- Schritte je Untergrund (Asphalt, Gras, Holz, Beton), Laufen/Sprinten, Türen, Fenster klirren, Schläge/Treffer, Zombie-Stöhnen mit Entfernung und Richtung (3D-Panning), Schmerz, Herzschlag bei Gefahr, Regen und Wind, Vogelzirpen am Tag/Grillen nachts, Auto-Motor nach Drehzahl, Hupe, UI-Klicks, ruhige Hintergrundmusik, die bei Gefahr spannender wird.
- Optionen: Master-, Musik-, Effekte-Lautstärke.

### Teil D: Mehrspieler (lokal hosten, andere treten bei) — [NEW] `electron/server.cjs`, `src/net/*`, [MODIFY] `electron/main.cjs`, `Game.ts`, `MainMenu.ts`
- **Host**: im Menü „Spiel hosten" → startet im Electron-Hauptprozess einen WebSocket-Server (selbst geschrieben, keine Fremdbibliothek) auf einem Port (Standard 7777); zeigt die lokale IP + Code zum Beitreten.
- **Beitreten**: „Spiel beitreten" → IP:Port eingeben → Seed und Zeit vom Host, eigener Charakter.
- Synchronisiert wird: Spieler (Position, Blickrichtung, Animation, Kleidung, Name über dem Kopf), Uhrzeit/Wetter, **Zombies** (Host simuliert, Clients zeigen sie), Türen/Fenster/Loot-Behälter/Autos, Textchat. Schläge und Schaden laufen über den Host (Client schickt „Ich schlage Zombie X").
- Grenzen: nur im lokalen Netz (oder per Portfreigabe/VPN); bis ~8 Spieler; Host-Spielstand ist maßgeblich (Speichern nur beim Host).

## Reihenfolge und Aufwand
A (mittel) → B (mittel) → C (mittel) → D (groß, baut auf B auf, weil Seed und Zustand serialisiert werden müssen).

## Offene Fragen
1. Soll ich alles in einem Zug machen oder Teil für Teil mit exe nach jedem Teil? (Empfehlung: Teil für Teil.)
2. Multiplayer: Zombies vom Host simulieren (Empfehlung) oder jeder Client eigene Zombies?
3. Sound: nur synthetisch (ohne Dateien) ok? Echte Aufnahmen müsste ich von dir bekommen oder du gibst eine Quelle frei.

## Freigabe
Antworte **„Yes"** (mit Antworten auf 1–3 oder „wie empfohlen").
