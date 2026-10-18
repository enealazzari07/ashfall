# Plan: Welt mit begrenzten Städten, kurvigen Straßen, Autobahn mit Auffahrten + Auto-Innenraum

## Ist-Zustand (aus dem Code)
- Die Welt ist ein unendliches Chunk-Raster (64 m). Jeder Chunk ist ein Block mit festen Straßen am Nord- und Westrand (`ChunkBuilder.buildTerrain`, `CityGenerator.generateChunk`). Straßen sind immer gerade Rechtecke.
- Jede 6. Chunk-Reihe ist fest Autobahn bzw. Bahnstrecke (`chunkKind(cz)`), und zwar quer durch die ganze Welt, ohne Auffahrten.
- Die "Stadt" wird nur durch Rauschen (`urbanity`, `landOf`) von Dorf/Feld/Wald abgegrenzt. Dadurch wirkt alles wie eine einzige große Stadt.
- Auto: `CarModel.makeCar` hat eine geschlossene Karosserie (extrudiertes Vollprofil) und undurchsichtige Scheiben. Offene Türen zeigen deshalb nur eine weiße/lackierte Fläche, innen ist nichts.

## Teil A – Autos: Innenraum, durchsichtige Scheiben, Türen (schnell, zuerst)

### [MODIFY] `src/render/CarModel.ts`
- Karosserie als **Hohlkörper**: Boden, Motorblock, Heck, Schweller und dünne Seitenwände (nur dort, wo Türen sind, bleibt die Tür selbst die Seitenwand). Ist die Tür offen, sieht man in den Innenraum.
- **Innenraum**: Boden, 2 Vordersitze (Sitz + Lehne + Kopfstütze), Rücksitzbank, Armaturenbrett, Lenkrad, Mittelkonsole, Dachhimmel (hell/dunkel), Türverkleidungen auf der Türinnenseite.
- **Scheiben durchsichtig** (transparent, leicht getönt, Fresnel/Reflexion), Frontscheibe und Seitenscheiben von außen mit Blick auf Sitze und Lenkrad. Bei Schaden wird die Scheibe weiter milchig/gesprungen (wie jetzt), aber nie komplett undurchsichtig.
- Tür: Außenblech lackiert, **Innenseite** dunkle Verkleidung (kein weißes Blech mehr), Fensterrahmen + Seitenscheibe in der Tür (öffnet mit).
- Parkende Autos (instanziert) bekommen die gleiche durchsichtige Scheibe mit einfachem Innenraum (Sitze + Armaturenbrett + Lenkrad) in einer zusammengeführten Geometrie.

## Teil B – Neue Weltstruktur

### Makro-Layout (deterministisch, `src/world/WorldMap.ts`, **[NEW]**)
- **Super-Zellen** von 18 × 16 Chunks. Pro Zelle genau **eine Stadt mit maximal 6 × 5 Chunks** (≈ 384 × 320 m, wie jetzt). Alles außerhalb ist Natur: Wald, Felder, Höfe, Rastplätze, vereinzelte Dörfer. Die Stadt am Start (Chunk 0,0) liegt in der Mitte von Zelle (0,0).
- Außerhalb der Stadt gibt es **keine Gitterstraßen** mehr, sondern geführte Straßen (siehe unten). Dazwischen: Wald, "nichts" (offene Wiese), Hügel/Baumgruppen.
- Funktionen: `cityRect(cell)`, `isCityChunk(cx,cz)`, `featuresIn(cx,cz)` → Liste der Straßen/Gleise/Rampen, die den Chunk berühren.

### Straßen als Bänder (`src/world/RoadPath.ts`, **[NEW]**)
- Eine Straße ist ein Pfad (Polylinie aus Bézier-/Sinus-Kurven) mit Breite, Typ (`highway`, `country`, `ramp`, `rail`) und Markierungen. Der Renderer erzeugt pro Chunk ein Band-Mesh (Asphalt, Mittellinie gestrichelt, Randlinien, Leitplanken, Bankett, ggf. Gleisbett).
- Die Pfade werden **global** berechnet; jeder Chunk zeichnet die Segmente, die ihn schneiden. So passen Chunk-Grenzen nahtlos.
- Bäume, Gebäude und Autos prüfen Abstand zu Pfaden (`distToRoads`), damit nichts auf der Fahrbahn steht.

### Autobahn, Auffahrten, Landstraßen
- **Autobahn**: O–W, 2 × 2 Spuren mit Mittelstreifen, **kurvig** (Sinus + Bézier-Bögen, Radius ≥ 150 m), läuft südlich an der Stadt vorbei und durch die Natur zur nächsten Zelle. Brücke/Unterführung ist nicht nötig, solange sich Pfade nicht kreuzen.
- **Auffahrten/Ausfahrten** (`ramp`): geschwungene Rampen (Bézier) von der Autobahn zur Ringstraße der Stadt, mit Beschleunigungs-/Verzögerungsstreifen und Schildern. Je Stadt 2 Anschlussstellen (West/Ost) plus 1 Ausfahrt zu einer Raststätte.
- **Landstraßen** (6 m, kurvig): verbinden Stadtring ↔ Dörfer ↔ Höfe ↔ Autobahnanschluss. Verlauf mit Kurven/Serpentinen, im Wald teils nur Waldweg.
- **Bahnstrecke**: bleibt, läuft aber als sanfte Kurve nördlich der Stadt und endet nicht abrupt.
- Wald-/Leerstrecken: lange Abschnitte nur Baum, Wiese und Straße ("man kann mal ne Strecke fahren").

### Stadt "verwinkelt" (`CityGenerator.ts`)
- Außenring: Die Stadt bekommt rundum eine **Ringstraße** (Bögen an den Ecken, keine harten Rechtecke). Anschlüsse zu Rampen und Landstraßen.
- Innen: einige Straßenzüge fallen weg (größere Blöcke, Plätze, Parks), manche Straßen werden **Sackgassen**/T-Kreuzungen, 1–2 **Diagonalen oder Kurven** (Boulevard als Bézier-Band). Grundstücke, die vom Band geschnitten werden, werden zu Park/Platz. Ränder bleiben Rechteck-Lots, das ist gewollt "gewachsen".
- Zonen (`downtown`, `residential`, `industrial`) bleiben, werden aber an den Stadtgrenzen schwächer (Vorort → Dorf-Rand → Land).

### Anpassungen
- `chunkKind` fällt weg bzw. wird "Region"-basiert. `ChunkSpec` bekommt `paths: RoadSegment[]`, `cityEdge`. `ChunkBuilder.buildTerrain` zeichnet Bänder statt fester Autobahn-/Bahn-Reihen.
- `MapUI`: Karte zeichnet Bänder, Stadtgrenze und Rampen.
- Autos spawnen auf Autobahn/Landstraße in Fahrtrichtung. Fahrspuren werden beim Spawnen respektiert.
- `tests/streets.test.ts` und `tests/city.test.ts` werden an das neue Layout angepasst.

## Reihenfolge
1. Teil A (Auto-Innenraum, Scheiben, Türen) und Browser-Check
2. `RoadPath` + Renderer + Test (gerade und kurvige Straße, Chunk-Nahtstellen)
3. `WorldMap` (Stadtrechteck 6×5, Natur außen), Umbau von `landOf`/`generateChunk`/`buildTerrain`
4. Autobahn (kurvig) + Auffahrten + Landstraßen + Schilder + Spawn der Autos
5. Stadtring und verwinkelte Straßen (Bögen, Sackgassen, Diagonale, Parks)
6. Karte, Tests, Browser-Fahrt (Autobahn entlangfahren, Rampe hoch, Landstraße, Stadtrand)

## Annahmen (bitte sagen, wenn anders)
- Es gibt weiter nur **eine Etage** Straße (keine Brücken/Tunnel). Auffahrten steigen nicht an, sie führen flach auf die Autobahn.
- Die Autobahn ist O–W und kurvig. Nord–Süd-Verbindungen laufen über Landstraßen.
- Städte sind unterschiedlich groß (4×3 bis 6×5 Chunks), 6×5 ist das Maximum.
- Die Startstadt behält ihr jetziges Layout in der Mitte, damit Spawn, Fraktionslager und Karte weiter funktionieren (Lager werden bei Bedarf ins neue Layout verschoben).

## Freigabe
Antworte **"Yes"** oder nenne Änderungen (z. B. mehrere Städte nah beieinander, Autobahn auch N–S, Städte kleiner).
