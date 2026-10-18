# Plan: Flacker beheben, Basisbau 2.0 (auch in Gebäuden), Zombies und Waffen

## Ist-Zustand (aus dem Code)
- **Basisbau** (`Structures.ts`, `data/recipes.ts`, `BuildUI.ts`, `Game.handleBuild`): nur 4 Teile (Wand, Tür, Bett, Lagerfeuer), nur am Boden (y = 0), kein Etagenbezug. In Gebäuden ist Bauen praktisch unmöglich, weil `overlapsWorld` jede Gebäudebox und jedes Möbel sperrt. Bauteile haben keine Lebenspunkte, keine Lagerung, kein Verrammeln.
- **Kampf**: Gibt es nicht. `Health.injure()` kennt nur Verletzungen durch Bedürfnisse, Splitter, Unfälle. Klicks mit der linken Maustaste außerhalb des Baumodus werden verworfen (`handleKeys`). Gegner sind nur die Fraktions-NPCs (`Npc.ts`), die berauben, aber nicht kämpfen.
- **Items** (`data/items.ts`): keine Waffen, keine Munition, `Inventory.equipment` hat nur Kleidungs-/Hand-Slots (`hand` = Taschenlampe).
- **Flackern**: Straßen wurden schon entschärft. Bekannte Restrisiken: Dekor und Flächen mit nur 1–3 mm Höhenabstand (Gehwegplatten, Stellplatzlinien, Pads, Hauswege, Einfahrten), Schattenkarte, die jetzt nur jedes zweite Bild aktualisiert wird, Baumsprites mit Alpha-Test.

## Teil A – Flacker-Audit (zuerst)
1. **Messwerkzeug (nur Entwicklung)**: rendert dieselbe Szene an zwei um Millimeter verschobenen Kamerapositionen und markiert Pixel, die sich unverhältnismäßig ändern (Z-Fighting, Schattenzittern). Dazu eine Liste von Prüforten (Kreuzung, Ringstraße, Stellplatz, Gasse/Hinterhof, Dorf, Hof, Autobahn, Rampe, Rastplatz, Gebäude innen/außen, Bahn). Jeder Treffer wird behoben.
2. **Systematische Maßnahmen**:
   - eine zentrale Höhentabelle `LAYER` (Boden 0, Erde, Straße, Gehweg, Pad, Markierung, Dekor …) mit mindestens 1,5 cm Abstand und `polygonOffset` bei Overlay-Material;
   - doppelte/überlappende Flächen entfernen (Pads gegen Wege, Einfahrten, Hauswege);
   - Sonnen-Schattenkamera auf das Texelraster einrasten (kein Wandern/Zittern beim Laufen) und Schatten wieder jedes Bild aktualisieren, wenn es nicht flackert (sonst Texel-Snapping + jedes 2. Bild);
   - Baumsprites: Mipmaps + Alpha-to-Coverage statt hartem Alpha-Test, damit Ränder nicht flimmern;
   - Test, der die Mindest-Höhenabstände aller Layer prüft.

## Teil B – Basisbau 2.0
**Neue Bauteile** (je mit Lebenspunkten und Baukosten):
Wand, **Fensterwand**, Tür, **Tor/Zaun**, **Boden**, **Dach/Decke**, **Sandsäcke**, **Lagerkiste** (echter Container mit Inventar, wie Möbel), **Werkbank** (schaltet Rezepte frei), Bett, Lagerfeuer, **Fackel**, **Regentonne**.
**Bauen in Gebäuden**:
- Bauen ist **etagenbewusst**: Das Bauteil bekommt `y` und `level` aus `levelAt/surfaceY`, die Kollision gilt nur auf dieser Etage (`Box.lv`).
- Statt ganzer Gebäudeboxen prüft der Platzcheck nur echte Hindernisse (Wände, Möbel, Treppen) auf der Etage. Innenräume sind bebaubar, Möbel lassen sich abbauen oder umstellen (Aufheben mit F).
- **Verrammeln**: Fenster und Türen eines Hauses können mit Brettern verbarrikadiert werden (nutzt den vorhandenen Fensterzustand "boarded"). Verrammelte Türen blockieren Zombies, bis sie zerstört sind.
- Einrasten auf ein 0,5-m-Raster, an Wänden/Ecken schlauer (Fluchten bleiben gerade), Geisterbild zeigt Etage, Kosten und Grund bei Fehlern.
- **Reparieren** (F mit Holz), **Abbauen** mit Teilerstattung, Kategorien im Baumenü, Tastenkürzel.
- Teile erhalten `hp`; Zombies greifen Hindernisse an, die ihnen den Weg zum Spieler versperren.

## Teil C – Zombies
- Neues Modul `src/zombies/` (`Zombie.ts`, `ZombieManager.ts`, `ZombieTypes.ts`), Figur aus `createCharacter` mit Verwesungsfarben, ausgestreckten Armen, Taumelgang, Angriffs- und Sterbeanimation.
- **Typen**: Läufer (langsam, 60 HP), Rennender (schnell, 30 HP, nur nachts/nach Lärm), Brocken (zäh, 150 HP, harter Treffer), Kriecher.
- **KI**: Zustände Umherirren, Aufmerksam (Sichtkegel + Hören: Laufen, Schüsse, Autos), Verfolgen (Hindernisse umgehen, `world.resolve`, Türen), Angriff (Nahkampf, Blutung, Schaden), Suchen, Sterben. Zombies in Gruppen/Horden, Lärm lockt aus ~40 m an, Autos überfahren sie (Schaden nach Geschwindigkeit).
- **Spawn**: nahe Spieler (35–60 m, außer Sicht), Dichte je Gebiet (Innenstadt hoch, Dorf mittel, Natur niedrig), nachts mehr, in Gebäuden, gelegentlich Horde als Ereignis. Obergrenze ~30 aktive, weit entfernte werden entladen.
- Zombies greifen Spieler und Basisteile an, nicht die Fraktionen (Fraktions-NPCs wehren sich mit Schlagwaffen, optional).
- Optionale einfache Geräusche per WebAudio (Stöhnen, Schüsse, Treffer).

## Teil D – Waffen
- **Slot** `weapon` in `Inventory.equipment`; Waffen sind normale Items (Schnellleiste 1–5 rüstet aus).
- **Nahkampf**: Baseballschläger, Messer, Axt, Brecheisen (Schaden, Reichweite, Ausdauerkosten, Haltbarkeit, Rückstoß). Linksklick schwingt in Richtung Maus, Treffer im Bogen, Treffer-Effekte (Blut, Funken), Zombies taumeln.
- **Schusswaffen**: Pistole, Schrotflinte, Jagdgewehr, Munition je Kaliber, Magazin/Nachladen mit `R`, Streuung, Rückstoß, Mündungsfeuer, Leuchtspur, Treffer-Marker, **Lärm** lockt Zombies an.
- **Gefunden/Hergestellt**: Waffen und Munition in Lootlisten (Läden, Schränke, Fabriken, Scheunen) und bei Händlern; Rezepte für Nagelbrett, Molotow (optional).
- **HUD**: Waffenname, Munition, Lebensbalken über Zombies, Zielkreuz, Treffermarker, Todeszähler.
- Autos können Zombies überfahren (Fahrzeugschaden gering, Spieler verletzt sich nicht).

## Tests
- Flacker: Layer-Abstände, Texel-Snapping.
- Zombies: KI-Zustandswechsel (Hören/Sehen → Verfolgen → Angriff), Schaden und Tod, Spawn-Regeln, Barrikade hält/bricht.
- Waffen: Schaden, Reichweite, Nachladen, Lärm, Haltbarkeit.
- Bauen: Platzcheck in Gebäuden und auf Etagen, Verrammeln, Reparieren, Abbau-Erstattung.
- Browser-Checks pro Teil, danach EXE neu bauen.

## Reihenfolge
1. Teil A (Flacker-Messwerkzeug + Fixes)
2. Teil B (Bauen in Gebäuden, neue Teile, Verrammeln)
3. Teil D Basis (Items, Slot, Nahkampf, Schießen) – testbar am Dummy
4. Teil C (Zombies: Figur, KI, Spawn, Angriff auf Spieler/Basis)
5. Feinschliff (HUD, Balancing, Geräusche), Tests, EXE bauen

## Annahmen (bitte sagen, wenn anders)
- Linke Maustaste = Angriff/Schuss (zielt auf die Mausposition), rechte Maustaste bleibt Kamera, `R` laden, `E` ist frei. Im Auto gibt es keine Waffen.
- Zombies sind **zusätzlich** zu den Fraktionen; Infektion/Verwandlung gibt es zunächst nicht (Bisse = Schaden + Blutung).
- Spielstand wird weiterhin nicht gespeichert (gibt es nicht).
- Schwierigkeit: mittel, später einstellbar im Optionsmenü.

## Freigabe
Antworte **"Yes"** oder nenne Änderungen (z. B. mit Infektion, andere Waffen, nur Nahkampf zuerst).
