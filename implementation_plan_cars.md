# Plan: Fahrbare Autos, besseres Auto-Modell, realistischer Tacho

## Ist-Zustand (aus dem Code)
- Autos sind nur Deko: `ChunkBuilder.ts` stellt sie als Instanzen auf (Box + Kabine + 4 Zylinder). Kollisionsboxen sind vorhanden.
- `makeCarMesh()`, `takenCars`, `carKey`, `CarSet` (Zeile 14-52) sind vorbereitet, werden aber nirgends benutzt: kein Einsteigen, kein Fahren.
- Spieler: `PlayerController.update` (WASD, orthografische Kamera, Kamera folgt `mesh.position`).
- Interaktion: `F` in `Game.ts` (~Zeile 418-443), HUD-Prompt über `hud.prompt()`. `E`/`Q` drehen die Kamera.
- Chunks werden in `ChunkManager` gestreamt. `takeCar` wird im Kommentar erwähnt, existiert aber nicht.

## Änderungen

### [NEW] `src/render/CarModel.ts`
- Neues, detailliertes Auto-Modell: abgerundete Karosserie (extrudiertes Profil mit Motorhaube, Windschutzscheibe, Dach, Kofferraum), Glasflächen, Radkästen, Felgen mit Speichen, Reifen, Stoßstangen, Kühlergrill, Spiegel, Scheinwerfer/Rücklichter (emissiv), Türfugen, Kennzeichen.
- 2-3 Typen (Limousine, Kombi, Pickup), Lack mit `MeshPhysicalMaterial` (Clearcoat).
- `makeCarMesh()` (bisher in ChunkBuilder) zieht hierher um; Räder bleiben in `userData.wheels`, Vorderräder separat für die Lenkung.

### [MODIFY] `src/world/ChunkBuilder.ts`
- Parkende Autos nutzen das neue Modell. Wegen der Performance: gemeinsame Geometrien pro Typ, Instancing bleibt (Karosserie, Scheiben, Räder).
- `makeCarMesh` und die Auto-Geometrien entfernen oder aus `CarModel.ts` importieren.

### [NEW] `src/player/Vehicle.ts`
- Fahrphysik (Arcade-nah, aber glaubwürdig): Gas/Bremse/Rückwärts, Lenkwinkel geschwindigkeitsabhängig, Reibung/Auslaufen, Handbremse, max. ca. 120 km/h, Automatik mit 5 Gängen (liefert Drehzahl).
- Zustand: `speed`, `rpm`, `gear`, `steer`, `fuel`, `lights`.
- Kollision gegen die vorhandenen `colliders` (Boxen) mit Abprallen und Tempoverlust. Autos sind ca. 4,2 × 1,9 m, also OBB gegen Box.

### [MODIFY] `src/player/PlayerController.ts` und `src/core/Game.ts`
- `F` neben einem Auto: einsteigen, im Auto `F`: aussteigen (Spieler wird neben der Tür abgesetzt). Prompt "F Einsteigen".
- Beim Einsteigen: Auto aus der Chunk-Instanz entfernen (`takenCars`, `carKey`) und als eigenes Objekt spawnen. Beim Aussteigen bleibt es als Objekt stehen.
- Im Auto: WASD = Gas/Lenken/Bremse, Leertaste = Handbremse, `H` = Licht. Kollision mit Gebäuden und Hindernissen.
- Kamera folgt dem Auto, Lauf-Animation und Needs laufen weiter.
- Konflikt: `Space` pausiert aktuell die Zeit, dort gilt dann "Handbremse nur im Auto". `H` ist aktuell das Tipps-Panel. Siehe Fragen unten.

### [NEW] `src/ui/Speedometer.ts` (+ CSS in HUD)
- Echter Analog-Tacho unten in der Mitte (Canvas/SVG): Skala 0-240 km/h mit Haupt- und Nebenstrichen, rote Zone, Nadel mit weicher Dämpfung, Kilometerzähler. Daneben ein Drehzahlmesser (x1000 U/min), Ganganzeige (P/R/N/D 1-5), Tankanzeige, Kontrollleuchten (Licht, Handbremse).
- Wird nur im Auto eingeblendet, mit Chrom-Ring, Glasreflex und Hintergrundbeleuchtung bei Nacht.

### [NEW] `tests/vehicle.test.ts`
- Beschleunigung, Bremsweg, Lenkung bei Stillstand = 0, Gangwechsel, Kollision stoppt das Auto.

## Reihenfolge
1. `CarModel.ts` + Austausch in `ChunkBuilder.ts` (Optik, sofort sichtbar)
2. `Vehicle.ts` + Tests
3. Ein-/Aussteigen und Steuerung in `Game.ts` und `PlayerController.ts`
4. `Speedometer.ts` und HUD-Einbindung
5. Typecheck, Tests und Prüfung im Browser

## Fragen vor dem Start
1. Tasten: Soll `Space` im Auto die Handbremse sein (Zeit-Pause gilt dann nur zu Fuß)? Soll `H` im Auto das Licht schalten?
2. Soll der Tank begrenzt sein (Benzin finden/kanistern) oder unendlich?
3. Soll Überfahren von NPCs Schaden machen, oder weichen sie aus?

## Freigabe
Antworte **"Yes"** (oder nenne Änderungen). Dann lege ich `task.md` an und setze es der Reihe nach um.
