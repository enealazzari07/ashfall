# Ashfall – Konzept: Project-Zomboid-Systeme selbst nachbauen

Dieses Dokument verdichtet [PZ_Ideen.md](PZ_Ideen.md) zu einem Bauplan für das vorhandene Projekt (Vite + TypeScript + Three.js + Electron, `package.json` → „ashfall").

## 1. Regeln für den Nachbau (Clean-Room)
Ziel: Die **Spielmechanik** soll sich so dicht wie möglich wie das Vorbild anfühlen. Der **Code, die Inhalte und die Optik** sind komplett eigen.

| Wird übernommen (Idee) | Wird nicht übernommen |
|---|---|
| Systemdesign: Körperteil-Wunden, Moodle-Stufen, Infektionslogik, Wetter pro Feld, Fahrzeug-Teile, Loot-Tabellen, XP-Boost-Stufen … | Quelltext: weder Lua noch dekompiliertes Java, auch nicht umformuliert Zeile für Zeile |
| Verhältnisse und Größenordnungen als **Startwerte zum Tunen** | Komplette Datentabellen (Itemlisten, Loot-Listen, Rezeptlisten, Berufsliste mit Kosten) 1:1 |
| Spielgefühl: Reaktionszeiten, Lärm lockt Zombies, Schlaf-Dialog … | Namen, Marken, Texte, Grafiken, Modelle, Icons, Sounds, Musik, Karte (Muldraugh usw.), Logo |

Praktisch heißt das: Ich lese Notizen (`PZ_Ideen.md`), nicht die Originaldateien, während ich programmiere. Eigene Namen für Items, Berufe, Orte, Zustände. Eigene Zahlen, die ich im Spiel teste und anpasse.
Grenze: „Fast eine Kopie" ist im Systemverhalten möglich, in Aussehen und Inhalt nicht.

## 2. Ist-Zustand in Ashfall (kurz geprüft)
Gelesen: `Needs.ts`, `Health.ts`, `loot.ts`, `recipes.ts`, Plan-Dateien. Der Rest nur nach Dateinamen.

| Bereich | Heute | Vorbild-System (Abschnitt in PZ_Ideen) |
|---|---|---|
| Bedürfnisse | 4 Werte 0–100 (Hunger, Durst, Energie, Wärme) mit linearem Verfall | Werte-Register mit Min/Max/Standard + Moodle-Schwellen (15) |
| Gesundheit | 1 HP-Wert, Liste von Wunden (blutet/nicht), Verband heilt alles | Verletzungen pro Körperteil, Behandlungen, Infektion (7, 8) |
| Loot | 1 flache Tabelle mit 20 Einträgen, 30 % leer | Raum × Container → Liste + Formel (14) |
| Crafting | 2 Rezepte | Daten-Rezepte mit Werkzeug-Tags, Zustand, XP (2) |
| Bauen | 4 Teile (Wand, Tür, Bett, Feuer) | Daten-Entitäten, Stufen, Abbau-Rückgabe (11) |
| Fraktionen/Handel | vorhanden (`factions/*`, `FactionUI`) | gibt es im Vorbild nicht – eigene Stärke von Ashfall |
| Welt/Stadt | Chunk-Generator, Gebäude, Innenräume, Landwirtschaft | Raumtypen, Natur-Achsen (14) |
| Fahrzeuge | Fahrmodell, Schaden-Plan in `implementation_plan_damage.md` | Teile mit Zustand, Batterie, Tank, Crash-Reihenfolge (9) |
| Zombies | nur geplant (`implementation_plan_zombies.md`) | Sinne, Gruppen, virtuell/echt (8, 12) |
| Skills/Berufe | nicht vorhanden | XP-Kette, Berufe als Punktekauf (13) |
| Inventar | `Inventory.ts` + `InventoryUI.ts` (groß) | Container-Reiter, Gruppierung, Sortierung (3) |

## 3. Zielbild und MVP
**Zielbild:** Ein dichtes Einzelspieler-Überlebensspiel in einer Stadt, Systeme wie im Vorbild, dazu Ashfall-Eigenes (Fraktionen, 3D-Optik).

**MVP (spielbar und testbar, ca. Phasen 1–4):**
- Werte-Register, Moodles mit Stufen, Schlaf mit Dauer, Temperatur und Nässe
- Verletzungen pro Körperteil, Verband/Naht/Desinfektion, Wundinfektion
- Datengetriebene Items, Rezepte, Loot-Tabellen nach Raumtyp
- Skill-Baum mit XP und Berufen, Charakter-Erstellung mit Punkten
- Zombies mit Sicht und Gehör, Lärm, Gruppen (einfach)
Nicht im MVP: Tiere/Genetik, Fahrzeug-Werkstatt, Multiplayer, Generator/Strom, Fischen/Fallen.

## 4. Reihenfolge (jede Phase endet mit lauffähigem Spiel + Vitest-Tests)
1. **Fundament:** `StatRegister` (Min/Max/Standard), Moodle-Schwellen als Daten, Spiel-Takt (Minute/Stunde/Tag-Events), Items/Rezepte/Loot aus Tabellen (eigene Listen), Tag-System für Werkzeuge. *Fertig, wenn:* alle Bedürfnisse über das Register laufen, Tests bestehen, HUD zeigt Moodle-Stufen.
2. **Körper:** Körperteile mit Wunden (Kratzer, Schnitt, Biss, Tiefe, Bruch), Blutung, Schmerz, Verband mit Haltbarkeit, Naht, Desinfektion, Schiene, Wundinfektion als Faktorsumme, Heilung abhängig von Hunger/Durst/Schlaf.
3. **Umwelt & Schlaf:** Temperatur pro Körperteil mit Kleidungs-Isolation, Nässe, Wind, Innenräume gleichen sich an; Schlaf-Dialog, Bett-Qualität, Komfort/Stress/Langeweile/Unglücklichkeit.
4. **Fortschritt:** Skill-Baum mit XP-Kette (Boost-Stufen, Traits, Bücher), Rezepte schalten sich über Skills frei, Berufe und Traits mit Punktebudget, Charakter-Erstellung.
5. **Gegner:** Zombies als virtuelle Masse + wenige echte Objekte, Sicht (Wetter/Dunkelheit), Gehör (Radius, Wand-Ungenauigkeit), Gruppen, Lärm-Quellen (Feuer, Auto, Schuss), Waffen mit Min/Max-Schaden und Zustand, Kleidung als Schutz pro Körperteil.
6. **Welt & Loot:** Raumtypen, Container-Tabellen, Loot-Formel (Eintrag × Kategorie × Gebiet × Zeit), Versteck-Karten, Schlüssel, Strom-/Wasser-Frist.
7. **Basis & Handwerk:** Bauen als Daten, Stufen, Abbau mit Zufalls-Rückgabe, Lagerfeuer-Radius, Zelt, Möbel verschieben; Landwirtschaft mit Monaten und Krankheiten.
8. **Fahrzeuge, Strom, Wasser:** Teile mit Zustand, Batterie/Tank, Crash-Reihenfolge, Generator mit Verschleiß und Lärm, Regenfass.
9. **Tiere, Fischen, Fallen, Sammeln:** Tier-Schema mit Genen, Wild-Wanderung, Köder-Tabellen, Sammel-Zonen.
10. **Fraktionen mit den neuen Systemen verbinden** (Handel mit eigenen Items, Konflikte durch Lärm/Territorium).

### Stand Phase 1 (umgesetzt)
- `src/sim/StatRegister.ts`: Werte mit Min/Max/Standard; `Needs` liegt darin.
- `src/data/moodles.ts`: Moodle-Schwellen (4 Stufen) als Tabelle; HUD-Chips und Charakter-Reiter lesen sie.
- `src/core/Time.ts`: Minuten-/Stunden-/Tages-Ereignisse (`time.on('hour', …)`); noch von keinem System genutzt.
- `src/data/items.ts` (Tags), `loot.ts` (Raum × Behälter → Liste, würfelt gewichtet), `recipes.ts` (Werkzeug-Tags, `missingFor`).
- `src/player/Inventory.ts`: gewichtsbasiert, Körper + Rucksack als eigene Behälter (Rucksack: Fassungsvermögen + Gewichtsrabatt).
- `src/ui/InventoryUI.ts` + `inventory.css`: Fenster rechts (Umgebung | Spieler), Gruppen, Suche, Kategorie, Sortierung, Reiter Körper/Rucksack/Charakter, Drag & Drop, Kontextmenü, Schnellleiste.
- Noch offen aus Phase 1: Rezepte nutzen `tools`/`time` im Spiel noch nicht; die Loot-Listen decken nur die vorhandenen 20 Items ab.

### Stand Phase 2 (umgesetzt)
- `src/player/Body.ts`: 10 Körperteile, Wunden (Kratzer, Schnitt, tiefe Wunde, Bruch) mit Blutzeit, Heilung, Schmerz, Verband, Naht, Schiene, Infektion.
- `src/player/Health.ts`: stündliche Berechnung in 0,25-h-Schritten; Blutung, Infektion als Faktorsumme (offen/verbunden/schmutzig/desinfiziert/genäht), Heilung ruht bei Infektion, Bewegungsfaktor durch Beinbruch und Schmerz.
- `src/player/Treatment.ts`: Verband, Desinfizieren, Nähen, Schiene, Verband ab; verbraucht Items nur bei Erfolg; `autoTarget` für Schnellanwendung; Arzt-Fertigkeit schon als Parameter.
- Neue Items: Desinfektionsmittel, Nähset, Schiene (Rezept: Holz + Stoff); Moodles für Schmerz und Entzündung.
- Inventar-Fenster: Reiter „Gesundheit“ mit Körperteilen, Wunden und Behandlungs-Buttons.
- Offen: Biss und Zombie-Infektion (Phase 5), Arzt-Skill (Phase 4), Verbrennungen und Glassplitter.

### Stand Phase 3 (umgesetzt)
- `src/sim/Thermo.ts`: 6 Körperzonen (Kopf, Oberkörper, Arme, Hände, Beine, Füße) mit Hauttemperatur und Nässe; Kleidung isoliert pro Zone, Wind und Regen werden durch `windproof`/`rainproof` der Teile gebremst; Anstrengung wärmt, Schlaf und kalter Boden kühlen. Der Kälte-Index steuert die Körperwärme (`Needs`).
- `src/sim/Mood.ts`: Unbehagen, Stress, Langeweile, Unglücklichkeit als Register-Werte; Schlafqualität daraus.
- `src/data/beds.ts` + `src/ui/SleepDialog.ts`: Schlafdauer wählbar (Vorschlag 7–12 h nach Müdigkeit), Bett-Qualität (gut/einfach/Boden), geschätzte Erholung; Taste Z = auf dem Boden schlafen, F am gebauten Bett.
- Charakter-Reiter: Körpertemperatur je Zone mit Nässe, Befinden-Balken; neue Moodles (nass, unbequem, Stress, Langeweile, Unglücklich).
- Offen: Handschuhe/Schal (Zone „Hände“ bleibt ohne Kleidung), Überhitzung, echte Betten in Gebäuden, Schlafen-Wirkung von Kissen.

### Stand Phase 5 (umgesetzt, vor Phase 4 vorgezogen)
- `src/sim/ZombieAI.ts`: Sicht (140°-Kegel, Reichweite nach Licht und Wetter, freie Sichtlinie), Gehör (Geräusche mit Radius, ungenauer Ort hinter Wänden und bei Regen), Gedächtnis, Angriff mit Ausholen, Taumeln, Gruppen mit Anführer, Umweg bei Hindernissen; drei Typen (Schlurfer, schnell, Sprinter).
- `src/world/ZombieWorld.ts`: Zombies je Chunk aus Gelände und Gebäudeart, Bevölkerung wächst bis Tag 28, erschlagene kommen nicht wieder, Räumen weit entfernter Chunks, Türen einschlagen.
- `src/sim/Combat.ts` + `src/data/weapons.ts`: Linksklick = Schlag (Fäuste, Baseballschläger, Eisenrohr, Messer, Axt), Bogen, Reichweite, Lärm, Energie; Zombie-Angriff mit Schutz der Kleidung pro Körperteil, Kratzer/Schnitt/Biss; Biss infiziert (Tod nach 24–48 Stunden, keine Heilung).
- Lärmquellen: Schritte (Sprinten laut), Schläge, Türen, Motor, Aufprall. Mood: Gefahr treibt den Stress hoch.
- Linksklick öffnet Türen und Möbel (Tür bleibt zu, bis man klickt); gegen Zäune und Hecken laufen = darüberklettern.
- Karte im Altpapier-Stil mit Erkundung: nur Gesehenes ist eingezeichnet, der Rand läuft weich ins Papier; große Karte ziehbar, Windrose, Maßstab, Beschriftungen.
- Offen: Waffenverschleiß, Feuer als Lärmquelle, Zombies klettern nicht und öffnen keine Türen (sie schlagen sie ein), Leichen durchsuchen, Zombie-Typen nach Spieltag.

## 5. Architektur-Regeln
- **Daten statt Code:** Items, Rezepte, Loot, Skills, Berufe, Wetter, Moodle-Schwellen als TypeScript-/JSON-Tabellen unter `src/data/`. Neue Inhalte brauchen keine neue Logik.
- **Ein Takt:** `Time.ts` liefert Ticks; Systeme registrieren sich für Minuten-/Stunden-Updates (wie `Needs.update(hours,…)` heute).
- **Reine Logik getrennt von Darstellung:** Systeme in `src/player/` und `src/sim/` ohne Three.js, damit Vitest sie testet (Vorlage: `tests/survival.test.ts`).
- **Events statt Querverweise:** z.B. `onWound`, `onSleep`, `onLevelUp` – statt dass jedes System jedes andere aufruft.
- **Seeds:** Zufall nur über übergebenes RNG (wie `rollLoot(r)`), damit Tests deterministisch sind.
- **Speichern:** Alle neuen Zustände in einem versionierten Save-Objekt.

## 6. Zahlen-Politik
- Startwerte stammen aus dem Gefühl der Notizen („Hunger steigt langsam, Schlaf holt langsam zurück"), nicht aus der Wertetabelle.
- Jeder Wert steht an **einer** Stelle (`src/data/balance.ts`) und wird im Spiel getestet.
- Spielbarkeits-Test vor Nachbau-Treue: Wenn etwas nervt, wird es angepasst.

## 7. Offene Entscheidungen
1. **Zombies:** Ashfall ist bisher „ohne Zombies" (Fraktionen), `implementation_plan_zombies.md` plant sie. Soll das Vorbild-Gefühl bedeuten: Zombies ja, Fraktionen zusätzlich?
2. **Skalierung:** ganz große offene Welt oder bei einer Stadt mit Umland bleiben?
3. **Multiplayer:** nein (empfohlen) – spart viel Aufwand.
4. **Reihenfolge:** Phase 1 zuerst, oder zuerst Gegner (5), weil das Spiel dadurch am meisten Gefühl bekommt?

## 8. Stand „mehr Klon" (Zeitaktionen, Look, Türen, Kofferraum)
- **Zeitaktionen** (`src/sim/Actions.ts`): Looten, Anlegen, Essen/Trinken, Behandeln und Bauen dauern und zeigen einen Fortschrittsbalken; Bewegen oder Treffer bricht ab.
- **Zombie-Look:** 7 Typen nach früherem Beruf (Zivilist, Büro, Polizei, Medizin, Arbeiter, Kapuze, Dicker) mit Verwesung, Blut, Wunden, selten fehlendem Unterarm.
- **Leichen:** durchsuchbar (eigene Beuteliste), Blutlache wächst, bleiben 240 s.
- **Türen:** Risse mit sinkender Haltbarkeit, Wackeln bei Schlägen, aufgebrochene Tür hängt schief.
- **Kofferraum:** je Auto ein Behälter mit Loot (deterministisch pro Position), `F` am Heck öffnet ihn, der Deckel klappt auf und beim Schließen zu. Parkende Autos werden dafür zum Fahrzeugobjekt.
- Offen: Motorhaube mit Teilen (Batterie/Sprit), Barrikaden/Fenster, mehr Animationen (Essen, Verbinden, Klettern), Waffenhaltbarkeit, Phase 4.

## 9. Stand Fenster & Haltungen
- **Fenster** (`src/world/Windows.ts`, reine Logik): Erdgeschossfenster mit niedriger Brüstung haben Scheibe (30 HP) und bis zu 4 Bretter (je 55 HP), Zustand bleibt über Chunk-Unloads erhalten.
- Spieler: `F` schlägt die Scheibe ein (laut, 35 % Schnitt an der Hand), `F` nagelt ein Holzbrett an (4 s, Lärm), `Shift+F` nimmt eins ab. Offenes Fenster = Kletterbox in der Wand (Vault 1,3 s), Bretter blockieren sie.
- Zombies, die an der Wand feststecken, zerschlagen Bretter, dann die Scheibe (Lärm, Hinweis). Sie klettern noch nicht durch.
- **Haltungen** (`workCharacter`): Hammer (Bauen/Bretter), Hocke (Looten/Umpacken), Essen, Behandeln, Anziehen, während die Zeitaktion läuft.
- Offen: Zombies klettern durch Fenster, Obergeschossfenster, Motorhaube/Autoteile, Waffenhaltbarkeit, Phase 4.

## 10. Stand Phase 4 (Fertigkeiten, Berufe, Eigenschaften)
- **Daten:** `src/data/skills.ts` (11 Fertigkeiten, Stufe 0–10, XP-Schwellen als Tabelle, Wirkungen als `SKILL_FX`), `traits.ts` (16 Eigenschaften mit Punktekosten, beidseitigen Ausschlüssen, Faktoren), `professions.ts` (8 Berufe: Kosten, Boost-Stufen, Startstufen, Startgegenstände).
- **Logik:** `src/sim/Skills.ts` (XP mit Boost-Stufe × Lernfaktor, Deckel bei 10, Level-Ereignis), `src/sim/Profile.ts` (Punktebudget 6 + Beruf, Validierung, Zufalls-Charakter, `applyBuild`).
- **Spiel:** Kampf (Schaden je Waffenskill, XP pro Treffer/Kill), Erste Hilfe (Behandlung schneller und besser, XP), Tischlerei (Bau- und Barrikadierzeit, XP), Kochen (Nährwert, XP über Rezepte), Kraft (Tragkraft), Ausdauer (Energie), Sprinten (Tempo), Schleichen (Schrittlärm), Gewandtheit (Kletterzeit). Passive XP nur bei echter Bewegung (Anti-AFK). Eigenschaften steuern Hunger, Durst, Müdigkeit, Lärm, Stress, Kälte, Schlaf, Tragkraft.
- **UI:** Charaktererstellung vor jedem Spielstart (`src/ui/CharacterCreator.ts`, letzter Charakter wird gemerkt), im Charakter-Reiter Beruf, Eigenschaften und Fertigkeiten mit Stufenbalken.
- Offen: Verfall von Kraft/Ausdauer, Skill-Bücher, Rezepte, die erst per Stufe freigeschaltet werden, weitere Fertigkeiten (Mechanik, Angeln, Sammeln), Speichern des Charakters im Spielstand.

## 11. Stand Autos in der Tiefe
- **Logik** (`src/sim/CarParts.ts`): Tank (Liter, Verbrauch im Leerlauf und je Meter), Batterie (Ladung, Anlassen kostet Ladung, Lichtmaschine lädt, Licht bei Motor aus entlädt), Motorzustand (Leistung, Startchance, Aufprallschaden von vorn). Startwerte je Auto deterministisch aus der Position: ein Teil der Autos ist leer, ohne Batterie oder hat einen schlechten Motor.
- **Spiel:** Motor muss mit `E` angelassen werden (Fehlschläge: keine Batterie, leer, kein Sprit, stottert). Tank leer = Motor geht aus, Tacho zeigt Füllstand und Hinweise. Motorhaube: `F` am Bug öffnet sie und das Fenster „Motorraum“ (Tanken aus Kanister, Batterie aus-/einbauen, Motor mit Motorteilen reparieren); alles Zeitaktionen mit Lärm.
- **Fertigkeit Mechanik** (Stufe 0–10): mehr Reparaturleistung, kürzere Arbeitszeit, XP aus Arbeiten; neuer Beruf Mechaniker. Neue Items: Autobatterie, leere Batterie, Benzinkanister, leerer Kanister, Motorteile, Werkzeugkasten (Tag `mechanic`), im Kofferraum, in Garagen und Lagern zu finden.
- Offen: Reifen und Öl, Sprit abzapfen, Starthilfe, Schlüssel und Kurzschließen, Zapfsäulen, Autoalarm.

## 12. Stand Zombies: Klettern und Türen
- Jagende Zombies, die an einem offenen Fenster oder Zaun hängen, steigen darüber (langsamer als der Spieler, 1,7-fache Kletterzeit, Bogen mit gestreckten Armen); geschlossene Fenster und Bretter werden vorher eingeschlagen.
- Türen: zwei von drei Zombies drücken nach knapp einer Sekunde die Klinke und öffnen sie (leises Geräusch, Hinweis), der Rest schlägt sie weiter ein. Der Zeitgeber läuft auch beim Umweg weiter, sodass Türen und Fenster zuverlässig fallen.
- Offen: Verriegeln/Abschließen, Zombies klettern nicht in Obergeschosse, Fenster mit Vorhang, Hunde.

## 13. Stand Fassaden
- Verwitterung an jeder Außenwand: Schmutzband am Sockel, Schmutzläufer unter Fenstern, abgeplatzte und aufgehellte Stellen (deterministisch je Seite), Regenrohr; Hausnummer neben jeder Tür außer bei Geschäften; Wohnhäuser bekommen ein Vordach mit Konsolen über der Tür.
- Offen: Vorgärten mit Briefkasten, Graffiti, Schaufensterwerbung, Dachrinnen entlang der Traufe, Verfall nach Spieltag.
