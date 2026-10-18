# Plan: Autoschaden, Crash-Effekte, Abprallen, Türen

## Ist-Zustand
- `Vehicle.ts`: Kollision gegen Weltboxen, Aufprall bremst nur (`speed *= 0.35`), `impact` wird gemeldet. Kein Schaden, kein Abprallen, keine Auto-gegen-Auto-Kollision.
- `CarModel.ts`: Auto = gemergte Geometrien (paint/glass/trim), Räder als eigene Meshes. Einzelteile sind nicht abnehmbar.
- Einsteigen: Spieler wird sofort unsichtbar, Auto übernimmt, keine Animation.

## Änderungen

### [MODIFY] `src/player/Vehicle.ts`
- `health` (0–100) und Zonenschaden `zones` (front, rear, left, right, je 0–1), berechnet aus Aufprallstärke und -richtung.
- Abprallen: beim Aufprall wird die Geschwindigkeit entlang der Hindernisnormalen reflektiert (Restitution ~0.45) plus Drehimpuls (`yawRate`), das Auto "bounced" weg und dreht sich. Hohe Aufpralle schleudern es sichtbar zurück.
- Folgen des Schadens: ab 50 % Motorleistung sinkt, ab 25 % qualmt es, bei 0 % ist es Totalschaden (Motor aus, Auto rollt aus, kein Gas mehr). Lenkung zieht nach einer Seite bei Frontschaden.
- Auto-gegen-Auto: Kollision zwischen gesteuertem Auto und den abgestellten (`rides`) mit Impuls: das getroffene Auto bekommt Geschwindigkeit und rutscht weg.

### [MODIFY] `src/render/CarModel.ts` – zerlegbares Auto
- Das gefahrene Auto bekommt eigene, abnehmbare Teile: Motorhaube, Kofferraumklappe, 4 Türen (als Mesh mit Scharnier), 2 Stoßstangen, Spiegel, Scheinwerfer. Der Rest bleibt gemergt.
- `deform(zones)`: Karosserie-Vertices werden über einen Zonen-Falloff eingedellt (Verschiebung nach innen + leichtes Rauschen), Lack dunkler (Kratzer/Ruß über Vertexfarbe), Scheiben bei Schaden "zersplittert" (Glas-Material wird milchig/gerissen).
- `detachPart(part)`: Teil wird vom Auto gelöst und als eigenes Physikobjekt (`Debris`) in die Welt gesetzt.
- Türen: `openDoor(side, t)` dreht die Fahrertür (links) um das Scharnier.

### [NEW] `src/render/Debris.ts`
- Kleine Teilephysik: Schwerkraft, Bodenprallen (bounce), Rotation, Reibung, Ausblenden nach ~20 s. Wird für Türen, Hauben, Stoßstangen, Spiegel, Scheiben-Scherben und Radkappen genutzt.
- Teile lösen sich, wenn Zonenschaden > Schwelle (z. B. Stoßstange ab 0.5, Motorhaube ab 0.8, Tür ab 0.9) oder bei einem harten Einzelaufprall.

### [NEW] `src/render/CrashFx.ts`
- Funken (additive Partikel), Splitter (Glas), Rauchfahne bei < 25 % Gesundheit (nutzt vorhandene Smoke-Shader-Logik oder Sprite-Partikel), Staubwolke beim Aufprall, kurzer Kamera-Shake proportional zum Aufprall.

### [MODIFY] `src/core/Game.ts`
- Aufprall: `impact` ruft `crash(ride, strength, normal)`: Schaden anwenden, Teile ablösen, FX auslösen, Kamera-Shake, Verletzung des Spielers (wie bisher, abhängig vom Tempo).
- Abgestellte Autos werden bei Treffer physikalisch weitergeschoben (eigener Schritt für `rides` mit Geschwindigkeit ≠ 0, schon vorhanden).
- Einsteigen: Tür öffnet sich (0.35 s), Spieler läuft/blendet zur Tür, Tür schließt sich, danach Fahrt freigegeben. Aussteigen: Tür öffnet, Spieler erscheint, Tür schließt nach ~1 s. Geparkte Autos haben die Tür dann offen, bis sie schließt.
- Totalschaden: Motor aus, `F` aussteigen geht weiter, Rauch bleibt.

### [MODIFY] `src/ui/Speedometer.ts`
- Warnleuchte "Motor/Schaden" (rot/orange) je nach Gesundheit, ggf. flackernde Nadel bei Totalschaden.

### [NEW/MODIFY] Tests
- `tests/vehicle.test.ts`: Schaden steigt mit Aufprall, Abprallen kehrt die Geschwindigkeit um, Totalschaden = kein Antrieb, Auto-gegen-Auto überträgt Impuls.

## Reihenfolge
1. Vehicle: Schaden, Abprallen, Totalschaden, Auto-gegen-Auto + Tests
2. CarModel: zerlegbares Auto, Deformation, Türen
3. Debris + CrashFx
4. Game: Crash-Ablauf, Einsteigen mit Tür, Warnleuchte im Tacho
5. Typecheck, Tests, Browser-Check

## Annahmen (bitte sagen, wenn anders)
- Nur das **gefahrene/angefasste** Auto wird zerlegbar und verformt. Parkende Autos in der Stadt bleiben unverändert, bis du sie nimmst.
- Verformung ist visuell (Vertex-Dellen, abfallende Teile), keine echte Softbody-Simulation.
- Das Auto kann nicht repariert werden (ohne Reparatur-System im Spiel). Sag Bescheid, wenn es eine Reparatur geben soll.

## Freigabe
Antworte **"Yes"** oder nenne Änderungen.
