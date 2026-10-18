# Project Zomboid – Inspirationssammlung (nur Ideen, kein Code kopieren)

Quelle: Spieldaten unter `D:\Steam\steamapps\common\ProjectZomboid\media` (Build 42-Struktur).
Alles unten ist **beobachtet** in Textdateien (Scripts/Lua), die das Spiel mitliefert. Die Java-Engine (`projectzomboid.jar`) wurde noch nicht dekompiliert – Aussagen über interne Berechnungen sind daher nicht belegt.

## 1. Item-System (datengetrieben)
Jedes Item ist ein Textblock mit einem `ItemType` und flachen Eigenschaften (`media/scripts/generated/items/*.txt`).
Gemeinsame Felder: `DisplayCategory`, `Weight`, `Icon`, `Tags`, Sounds (Open/Put/Drop/Equip), `WorldStaticModel`.

| Typ | Spannende Felder | Idee für dein Spiel |
|---|---|---|
| Container (Rucksack) | `Capacity`, `WeightReduction` (z.B. 85 %), `RunSpeedModifier` (0.94), `CanBeEquipped = back`, `AttachmentsProvided` | Tasche hat Kapazität UND macht Inhalt leichter, kostet aber Tempo. Sehr gutes Trade-off-Design |
| Waffe | `MinDamage/MaxDamage`, `CriticalChance`, `CritDmgMultiplier`, `ConditionMax`, `ConditionLowerChanceOneIn`, `MinRange/MaxRange`, `MaxHitcount`, `Swingtime`, `DoorDamage`, `TreeDamage`, `KnockdownMod` | Eine Axt ist gleichzeitig Waffe, Baum-Fäller, Tür-Brecher. Haltbarkeit sinkt zufällig (1-in-N) |
| Essen | `HungerChange`, `ThirstChange`, `Calories/Carbs/Lipids/Proteins`, `DaysFresh`, `DaysTotallyRotten`, `FoodType`, `EvolvedRecipe` | Verderben als Zeitfenster; echte Nährwerte; Zutat kann in mehreren Gerichten „Wert" haben (`Cake:16;Salad:8`) |
| Kleidung | Blutstellen, Löcher (`CanHaveHoles`), Slots | Schutz + Verschmutzung + Reparatur |

Tags statt harter Item-Namen (`base:saw`, `base:crudesaw`): Rezepte verlangen eine **Fähigkeit** („irgendeine Säge"), nicht ein bestimmtes Item. Macht Crafting flexibel und modbar.

## 2. Crafting (`craftRecipe`)
Rezept-Felder: `time`, `category`, `xpAward = Woodwork:5`, `inputs`, `outputs`, `Tags` (z.B. `InHandCraft`, `CanBeDoneFromFloor`).
- Inputs haben Modi: Item wird **verbraucht** oder `mode:keep` (Werkzeug bleibt, nimmt aber über `MayDegradeLight` etwas Haltbarkeit).
- `flags[InheritCondition]`: Zustand des Ausgangsmaterials geht auf das Ergebnis über.
- `itemMapper`: Eingabe A → Ausgabe X, Eingabe B → Ausgabe Y (ein Rezept, mehrere Varianten).
- Rezept-Dateien nach Themen: Schmieden/Schweißen, Schneidern (Leder, Rüstung, Stricken), Knapping (Steinwerkzeug), Töpfern, Glas, Fallen, Medizin, Radio, Konserven, Einmachen, Zerlegen (`disassembly`).
- Zerlegen von Dingen als eigene Rezeptfamilie → Ressourcenkreislauf.
- `Researchablerecipes` am Item: Ein Item kann ein Rezept „erforschen/freischalten".

Idee: Rezeptdaten als Textdateien, Fertigkeit gibt XP, Werkzeuge nutzen sich ab.

## 3. Inventar-UI (`lua/client/ISUI/ISInventoryPane.lua`, `ISInventoryPage.lua`)
Beobachtete Funktionen/Features:
- Mehrere Container nebeneinander als Reiter (Rucksack, Boden, Kiste, Auto), Wechsel per Buttons/Gamepad.
- Listen-Ansicht mit **zusammenklappbaren Gruppen** (`collapseAll/expandAll`), Sortierung nach Name/Typ/Gewicht, Filter-Menü.
- **Alles nehmen** (`lootAll`) / **Alles übertragen** (`transferAll`), Transfer nach Gewicht.
- Layout speichern/wiederherstellen, Spalten verschiebbar.
- Fortschrittsbalken pro Item (Frische, Haltbarkeit, Füllstand).
- **Welt-Highlight**: Beim Überfahren eines Items/Containers wird das Objekt in der Spielwelt hervorgehoben (`doWorldObjectHighlight`).
- Container-Reiter blinken bei Änderung, Pinnen, Einklappen, Öffnen/Schließen-Sounds.
- Item-Tooltip, Kontextmenü (riesig, ~230 KB Lua – fast jede Aktion hängt dort).
- Gelesene Bücher werden in der Liste markiert (`isLiteratureRead`).

## 4. Charakter
- **Berufe** (`Professions.lua`): Polizist, Förster, Bauarbeiter, Soldat, Koch, Arzt, Krankenschwester, Einbrecher, … mit `rare`-Wert (Seltenheit). Beruf = Start-Skills + Start-Ausrüstung.
- **Fitness** (`FitnessExercises.lua`): Übungen mit XP-Mod, Steifheit je Körperteil (Beine/Arme/Bauch), Stoffwechselstufe. Training hat Nebenwirkung = Muskelkater.
- Körperteile & Gesundheit (`HealthSystem/`, `ISUI/BodyParts`), Moodles (Status-Icons).

## 5. Weitere Systeme (Ordner unter `lua/`)
Farming, Fishing, Foraging (Sammeln), Traps, Camping, Mining, Vehicles, Radio/Media, Seasons/Climate, Animals, FeedingTrough, ProceduralBasements, WorldGen, Hotbar, LastStand (Wellen-Modus), SurvivalGuide, Tutorial.
Auch: `fluids.txt` – Flüssigkeiten als eigenes System (Getränke, Alkohol, Wasser mischen), `energies.txt`, `evolvedrecipes.txt` (Salat/Sandwich/Suppe Stück für Stück zusammenbauen).

## 6. Konkrete Mini-Features zum Nachbauen
1. Tags statt Item-Namen in Rezepten.
2. Rucksack = Kapazität + Gewichtsreduktion + Tempo-Malus.
3. Waffen-Haltbarkeit mit „1-in-N"-Chance pro Treffer.
4. Essen mit Frische-Timer + Nährwerten.
5. Inventar mit Reitern, Gruppen, Sortierung, „Alles nehmen".
6. Welt-Highlight beim Hover im Inventar.
7. Berufe mit Seltenheit.
8. Rezept: Werkzeug bleibt, nutzt sich ab.
9. `Researchablerecipes`: Rezepte freischalten durch Items/Bücher.

## 7. Gesundheit, Wunden, Infektion, Moodles (Vertiefung)
Quellen: `ISHealthPanel.lua`, `ISApplyBandage/ISStitch/ISDisinfect/ISSplint.lua`, `recipes_medical.txt`. Die eigentliche Heil-/Infektionsberechnung steckt in der Java-Engine (nicht gelesen) – hier nur, was die Lua-Aktionen verraten.

### Körperteil-Modell
Jedes Körperteil hat eigenen Zustand: Gesundheit, Kratzer-, Tiefenwunden-, Biss-, Bruch-, Blutungs-Zeit, `additionalPain`, `stiffness` (Muskelkater), `alcoholLevel`, `infectedWound`, plus Verband/Naht/Schiene. Das Panel zeigt pro Teil nur, was gerade relevant ist.
Idee: Verletzungen pro Körperteil mit Timern statt ein globaler HP-Balken.

### Behandlungs-Aktionen (jeweils eigene Dauer, Skill „Doctor")
| Aktion | Beobachtetes Verhalten | Idee |
|---|---|---|
| Verband | Haltbarkeit = Zufall zwischen `(Level+1)*0.5` und `(Level+1)*1.0` plus `BandagePower` des Items; **schmutziger Verband = 0** | Qualität des Materials + Skill bestimmen, wie lange es hält |
| Desinfizieren | Alkohol erhöht `alcoholLevel`, verursacht aber **Schmerz** (`Stärke*13 − Level/2`); Dauer `120 − Level*4` | Heilmittel mit Preis (Schmerz), Skill senkt ihn |
| Nähen | Basis-Schmerz 20 (10 mit Nadelhalter/Nadel), Abzug pro Level; Naht-Dauer skaliert mit Level; **Infektionschance** `1 von (5 + Level*2.5)` | Gutes Werkzeug + Skill = weniger Risiko, nie null |
| Schiene | Braucht Brett + Stoffstreifen; `splintFactor = (Level+1)/2`; Dauer `140 − Level*4` | Improvisiertes Material aus dem Inventar |
| Bandage/Naht entfernen | Eigene Aktion, weniger Schmerz | Rückbau ist auch Gameplay |

Weitere Details:
- XP gibt es nur beim **ersten** Behandeln einer Wunde (`isGetBandageXp` / `isGetStitchXp`) → verhindert Skill-Farmen.
- Hämophobie-Trait: Blut sehen = +50 Panik. Traits wirken direkt in Aktionen.
- Behandlung dauert, Patient darf sich nicht bewegen (`DidPatientMove` bricht ab). Man kann **andere Spieler** behandeln (Animation „Loot", Blickrichtung).
- Parallel-Schutz im Multiplayer: nur einer „manipuliert" ein Körperteil gleichzeitig.
- Ungenutzter Code: Kratzer durch kaputte Fenster (1 von 6, zufälliges Körperteil), im Spiel auskommentiert – hübsche Idee für Umgebungsgefahren.

### Kräutermedizin (Rezepte)
Spitzwegerich, Beinwell, Wilder Knoblauch → mit Mörser (bleibt erhalten) zu Umschlägen (`Cataplasm`). Rezept ist `NeedToBeLearn` und wird automatisch gelernt bei `Doctor:5` oder `PlantScavenging:5`. Alkohol-Lappen: Verband/Stoff + Flüssigkeit (`-fluid 0.1`) → desinfizierter Verband.
Idee: Wissen freischalten durch Skill statt durch Menü; Medizin aus Sammeln (Foraging) → Craften.

### Moodles (Status-Icons)
In Lua referenziert: Drunk, Endurance, Food Eaten, Heavy Load, Hyper-/Hypothermia, Pain, Panic, Stress, Tired, Unhappy (weitere, z.B. Hunger/Durst/Verletzung, vermutlich nur in Java). Icons liegen in `media/ui/Moodles`, Pfeile (`Moodle_chevron_up/down`) zeigen Trend.
Idee: Kleine Icons am Rand, mehrere Stufen pro Zustand, Pfeil = wird besser/schlechter. Zustände beeinflussen sich (Schmerz → Panik, Gewicht → Ausdauer).

### Mini-Features zum Nachbauen
10. Verletzungen pro Körperteil mit Timern.
11. Verbandhaltbarkeit = Skill + Materialqualität; dreckig = nutzlos.
12. Desinfizieren tut weh (Preis für Nutzen).
13. Naht-Infektionschance sinkt mit Skill, bleibt aber > 0.
14. XP nur bei erster Behandlung einer Wunde.
15. Moodle-Leiste mit Stufen und Trendpfeil.
## 8. Engine-Logik aus der JAR (dekompiliert mit Vineflower)
REA unterstützt keine Java-JARs (nur APK), daher: `projectzomboid.jar` (23.829 Klassen) → ausgewählte Klassen mit Vineflower 1.12.0 dekompiliert (Download von GitHub, nur lokal, nur zur Inspiration). Dekompilierter Code ist **Rekonstruktion**, keine Originalquelle. Zahlen unten sind gelesen, nicht im Spiel getestet. Nichts davon 1:1 übernehmen – nur als Design-Anregung.

### Infektion (Zombie-Virus)
- Infektion wird über `IsInfected(Körperteil)` ausgelöst (gelesen: Bissfall setzt den Biss-Zustand; ob Kratzer/Schnitte ausgeschlossen sind, habe ich im Code nicht geprüft). Sobald ein Körperteil infiziert ist: Infektionszeit wird gestartet und eine **Sterbedauer** gewürfelt (`pickMortalityDuration`).
- Sandbox „Mortalität" bestimmt die Dauer: sofort / 0–30 Sek. / 30–60 Sek. / 3–12 Std. / 2–3 Tage / 1–2 Wochen / nie. Trait „Resilient" ×1.25, „Anfällig" ×0.75.
- Es gibt **Fake-Infektion** (z.B. Verwechslung/Fieber): eigener Fieber-Wert wächst, erreicht Maximum, stoppt – Spieler weiß nicht, ob echt. Medizin (`ReduceInfectionPower`) verlangsamt/senkt den Wert.
- Idee: Unsicherheit als Spannungselement („bin ich infiziert?"), Schwierigkeitsregler für Sterbezeit.

### Biss / Kratzer / Schnitt (`BodyDamage`)
- Pro Zombie-Angriff: zufälliges Körperteil (kleine Chance Unterkörper, Zombie hinter dir → anderer Bereich).
- Würfel in **Stufen**: erst Basischance „Treffer überhaupt", dann ob Kratzer, dann Schnitt, dann Biss. `Kleidung` hat pro Körperteil eine **Verteidigung in %**; Wurf unter Verteidigung → kein Schaden, aber **Loch in der Kleidung**.
- Dornen/Stachel-Rüstung kann den Zombie zurückverletzen.
- Schaden: Zufall 0–1 × (10–19). Schaden/Schmerz/Blut-Splatter je nach Typ; Hals-Biss hat eigenen Sound und mehr Blut.
- Inaktive/„liegende" Zombies haben +20 auf die Chancen.

### Wundinfektion (`BodyPart`)
- Jede offene Wunde würfelt Infektion mit **1 aus N**, wobei N bei 40.000 startet und sinkt: unverbunden −10.000, Kratzer −20.000, Schnitt −25.000, tiefe Wunde −30.000, Glassplitter −24.000, Verbrennung −23.000, **schmutzige Kleidung −20.000**, **blutige −24.000**, Verband abgenutzt −35.000; Minimum 5.000. Alkohol-Verband verhindert es.
- Genähte Wunde: ohne Verband 1 aus 20.000, mit Verband 1 aus 80.000 (pro Tick).
- Alkohol senkt Wundinfektion langsam (`−0.0002` pro Tick).
- Idee: Infektionsrisiko = additive Faktorliste, Hygiene (Kleidung) spielt mit.

### Gesundheit & Statuseffekte
- Gesundheit regeneriert (Standard/reduziert/stark reduziert je nach Hunger-, Krank-, Durst-Stufe), im Schlaf schneller; bei Hunger/Durst Stufe 4 **keine** Regeneration.
- Schwere Moodle-Stufen (Hunger 4, Krank 4, Blutung 4, Durst 4, Schwerlast) **ziehen aktiv HP ab**.
- Blutung: Anzahl blutender Teile (×2) + Kratzer + Schnitte + Bisse (×6) → Blutungsstufe; Stufe steuert Blutflecken am Boden.
- Gift (`POISON`) und Lebensmittelvergiftung als eigene Werte; „Well fed" senkt Gift schneller.
- Moodle-Schwellen sind Tabellen (`MoodleStat`): z.B. Schwerlast bei Verhältnis 1.0 / 1.25 / 1.5 / 1.75.

### Zombie-Sinne
- **Sicht**: Sichtradius 20 − max(Dunkelheits-Malus, Regen + Nebel); begrenzt auf 10–20 Felder. Sandbox „Sicht": gut ×1.75, schlecht ×0.35. Getragene Gegenstände (z.B. Masken/Helme am Zombie) teilen den Radius. Frisst der Zombie gerade, halbiert sich die Sicht.
- **Gehör** (`WorldSoundManager`): Geräusche haben Position und **Radius**. Zombie, der es hört, läuft zum Geräusch. Ist die Linie zum Geräusch blockiert, kennt er nur ungefähr die Stelle: Versatz ±2 Felder (±5 bei Regen, ±0/±4 je nach Sandbox „Gehör"), Maximum ±10.
- Ein schwerer Radius (≥10) kann einen Zombie sogar vom Türschlagen abbringen, wenn er nicht gerade ein Ziel vor sich hat.
- Geräusche, die von Zombies selbst stammen (`sourceIsZombie`), unterbrechen kein Türschlagen.
- Pro Zombie zufällige Eigenschaften je Sandbox: Geschwindigkeit (Sprinter/Läufer/Schlurfer), Gedächtnis, Kognition, Zähigkeit, Sicht, Gehör (teilweise „zufällig").
- Idee: Lärm als sichtbarer Radius; Wetter verändert KI; Ziel „zuletzt gesehen"/„zuletzt gehört" als Pfadziel.

### Gewicht / Tragkraft
- Max. Tragkraft = `Basis × Gewichtsmodifikator − Anzahl Schwächungen`. Schwächungen aus Moodle-Stufen: Hunger 2→1, 3→2, 4→2; Durst 2→1, 3→2, 4→2; Krank 2→1, 3→2, 4→3; Blutung 2–4→1 je; Verletzt 2→1, 3→2, 4→3. Minimum 0.
- Schwerlast-Moodle aus `Gewicht / Maximum`: Stufen bei >1.0, ≥1.25, ≥1.5, ≥1.75.
- Ab Schwerlast Stufe 3: zufällige HP-Verluste und **Rückenzerrung** (`addBackMuscleStrain`), solange man nicht fährt/schläft/sitzt.
- Idee: Tragkraft sinkt mit Hunger/Verletzung – dein Inventar fühlt sich dadurch „lebendig" an.

### Kampf (`CombatManager`)
- Trefferchance = Waffenbasis (gedeckelt) + Aiming-Skill × Waffenmodifikator; Fahrzeug-Fahrerfenster eigene Winkel-Regeln.
- Schmerz in den Armen senkt Trefferchance; Bewegung vor Schuss senkt sie je nach Aiming/Nimble-Skill.
- Nahkampf: Schaden zufällig zwischen Min/Max der Waffe (aus Item-Script), Stärke-Skill erhöht Schadensverteilung (`+0.2 je Level`), Mehrfachtreffer mit abfallendem Schaden, Durchschlag bei Projektilen reduziert Schaden.
- Waffe mit Zustand ≤ 0 greift nicht mehr an. Ausdauer-Verbrauch hängt vom restlichen Schaden ab.
- Idee: Skills verschieben Würfel-Verteilungen statt feste Boni zu geben.

### Mini-Features (Fortsetzung)
16. Mortalitäts-Regler + Fake-Infektion für Spannung.
17. Kleidung mit %-Schutz pro Körperteil, Treffer lässt Löcher entstehen.
18. Infektionsrisiko als Summe von Faktoren (Wundart, Verband, Schmutz).
19. Zombie-Sicht schrumpft bei Regen/Nebel/Dunkelheit; Hören mit ungenauem Zielort hinter Wänden.
20. Tragkraft sinkt durch Hunger, Durst, Krankheit, Blutung.
21. Schwerlast → Rückenzerrung statt hartem Limit.
22. Waffen-Min/Max-Schaden + Skill verschiebt die Verteilung.
## 9. Fahrzeuge, Temperatur, Wetter, Ernährung (JAR + Lua)
Gleiche Methode wie Abschnitt 8: `Thermoregulator`, `Nutrition`, `ClimateManager`, `BaseVehicle` mit Vineflower rekonstruiert, dazu `media/lua/server/Vehicles/Vehicles.lua` und Fahrzeug-Templates. Alles gelesen, nichts im Spiel getestet; Zahlen nur als Anregung.

### Körpertemperatur (`Thermoregulator`)
- Kern-Solltemperatur 37 °C; **Krankheit/Fieber hebt den Sollwert** (bis +2 °C). Kerntemperatur hat 20–42 °C Anzeigebereich.
- Körper besteht aus **thermischen Knoten pro Körperteil** (Hautfläche, Haut-Temp. ~33 °C, Nässe von Körper und Kleidung, Isolation, Windschutz). Wärmefluss = Luft − Haut, gedämpft durch Isolation; **Nässe verstärkt Auskühlung ×(1+0.75·Nässe) und bremst Aufheizen**.
- Wind: gefühlte Temperatur wird je Knoten durch `Windschutz` der Kleidung abgemildert. Feuchte über 50 % verschlechtert die Schweißkühlung.
- Stoffwechsel: Ziel hängt von Aktivität ab (Gehen 2/5 km/h, Rennen 10/15 km/h, Sprint, Arbeiten, Fitness, Waffenart beim Angriff). Mehr Gewicht im Inventar erhöht den Umsatz (`1 + Last² · 0.35`). Erschöpfung (Ausdauer) senkt die Wärmeproduktion.
- Gewicht/Fitness des Körpers verschieben die Wärmebilanz um ±20 %.
- **Folgen**: Unterkühlung/Überhitzung Stufe 2/3/4 → **Bewegung ×0.66 / 0.33 / 0** und **Kampf ×0.66 / 0.33 / 0.1**. Stufe 4 + Frost/Hitze → kumulativer „Thermischer Schaden" (Erfrierung bis 100 %, Hitze gedeckelt bei 30 %), der sich bei Entspannung langsam abbaut.
- Erkältungsrisiko (`CatchACold`): hängt von kalter Haut ab, Nässe und nasse Kleidung verstärken, **Nacken ×8, Oberkörper ×16, Kopf ×4**.
- Zeitaktionen dauern bei Kälte länger (`TimedActionTimeModifier`); Energie-Multiplikator beeinflusst den Kalorienverbrauch.
- UI: Kern-Temperatur und Wärmeerzeugung als Balken, Trend als 1–3 Pfeile je nach Änderungsrate.
- Idee: Temperatur pro Körperteil mit Kleidung als Isolationswert; Nässe als eigener Faktor; Kälte schwächt Kampf und Tempo, nicht nur HP.

### Ernährung & Gewicht (`Nutrition`)
- Vier Werte: Kalorien, Kohlenhydrate, Fette, Eiweiß (Items haben genau diese Felder, siehe Abschnitt 1). Sie sinken stetig (pro Spielsekunde: Carbs −0.0035, Fett −0.00113, Eiweiß −0.00086).
- Kalorienverbrauch: Ruhe 0.016, Schlafen 0.003, Gehen ×0.6, Rennen 1.0, Sprint ×1.3 (Basis 0.13), **Schlagen/Klettern ×8**; skaliert mit Körpergewicht/80 und Kältefaktor.
- Gewicht ändert sich nur bei Überschuss (>~1000 kcal, höher bei schwerem Körper) oder Mangel; viel Carbs/Fett (>400/>700) verdoppelt/verdreifacht die Zunahme. Traits „leicht zunehmen/abnehmen" verschieben die Schwellen (700 / 1800).
- Gewicht erzeugt Traits (übergewichtig/untergewichtig) und beeinflusst Fitness-XP.
- Idee: Makronährstoffe statt nur „Hunger"; langsamer Gewichtsaufbau mit Konsequenzen.

### Wetter & Klima (`ClimateManager`)
- Werte: Temperatur, Luftfeuchte, Wind (Stärke/Richtung), Regen, Nebel, Wolken, Tag-/Nachtstärke, Jahreszeit mit Fortschritt (`ErosionSeason`). Tageslicht „hinkt" nach (`dayLightLagged`).
- **Lufttemperatur pro Feld**: Innenraum oder Fahrzeug nähert sich **22 °C** an (Faktor ≈0.4–0.6, je nach Tageslicht; Keller/Erdgeschoss stärker, Obergeschoss schwächer). **Strom an → Innen konstant 22 °C**. Außen kommt Windchill dazu. Heizquellen in der Nähe heben die Temperatur an; Fahrzeuginnenraum kann zusätzlich heizen/aufheizen (sonnenbeschienenes Auto wird heißer).
- Idee: Ein einziger Lufttemperatur-Aufruf je Standort, Räume puffern Wetter, Stromausfall ändert das Spielgefühl.

### Fahrzeuge
- **Teile-System**: Motor, Batterie, Tank, Reifen, Bremsen, Federung, Schalldämpfer, Türen, Scheiben, Scheinwerfer, Sitze, Kofferraum, Heizung. Jedes Teil ist ein Item mit **Zustand (0–100)**, eigenen Install-/Uninstall-Regeln (Werkzeug `tags`, Zeit, Skill-Risiko, Mindest-Teile) und Update-Funktion (`Update.Engine/Battery/GasTank …`).
- Skill erlaubt immer den Versuch, aber **Erfolg/Misserfolg wird gewürfelt** (kein hartes Gate). Der Schlüssel wird beim Spawn zufällig in der Umgebung versteckt oder fehlt.
- **Batterie**: Ladung nur, solange der Motor läuft (`+0.001 pro Minute`, Maximum 1.0); Licht/Radio ziehen Strom.
- **Tank**: Verbrauch = Basis (Teiler 90 000) abhängig von Motordrehzahl, **Motorqualität und Masse**; Heizung erhöht ihn.
- **Motor**: hat eine Temperatur; kaputte Motorhaube/Heizung kann ihn überhitzen und beschädigen. Motor mit Zustand 0 startet nicht.
- **Crash**: Schaden = Aufprallstärke / Modifikator (Sandbox: 0.9–1.9), vorne und hinten getrennt. Teile werden wahrscheinlicher beschädigt: Motorhaube zuerst, danach Motor (wenn Haube kaputt, 1 aus 4), Frontscheibe ab Schaden >12, Reifen, Scheinwerfer; hinten Ladefläche, Heck, Kofferraum, Heckscheibe. Schaden an Insassen separat. Anhänger übernehmen den Crash.
- **Geräusch**: laufender Motor/Sirene sendet Weltgeräusch (Radius 20) → lockt Zombies (siehe Abschnitt 8).
- Anhänger: bei Tempo >30 km/h und Zustand <50 % verliert er Ladung.
- Fußgänger-Treffer: Schaden hängt von Geschwindigkeit, Masse und Auftreffpunkt ab.
- Idee: Fahrzeug = Sammlung von Teile-Items mit Zustand; Reparaturen wiederverwenden dein Item-/Rezeptsystem; Lärm als Spielmechanik.

### Mini-Features (Fortsetzung)
23. Temperatur pro Körperteil mit Kleidungs-Isolation, Nässe, Wind.
24. Kälte/Hitze senken Kampf- und Bewegungsmultiplikator stufenweise.
25. Innenräume gleichen sich 22 °C an; Strom aus → kälter/wärmer.
26. Makronährstoffe + langsame Gewichtsänderung.
27. Fahrzeug aus Teile-Items, je mit Zustand und Install-Regeln.
28. Batterie lädt nur bei laufendem Motor; Tank-Verbrauch nach Qualität + Masse.
29. Crash beschädigt Teile in fester Reihenfolge mit Zufall.
30. Motorlärm als Weltgeräusch.
## 10. Farming, Foraging, Fischen, Fallen (Lua)
Alles in `media/lua/{server,shared,client}/{Farming,Foraging,Fishing,Traps}` im Klartext – hier musste ich die JAR nicht dekompilieren. Gelesen, nichts getestet. Ich habe vor allem Konfigurationsdateien und die Kernfunktionen gelesen, nicht jede Wachstumsformel.

### Farming
- **Pro Pflanze** (Plot) gespeichert: Zustand (`plow`/`seeded`/…/`dead`/`harvested`), `nbOfGrow` (Wachstumsstufe), `waterLvl` und `waterNeeded`, `health`, vier Schädlings-/Krankheitswerte (`mildew`, `aphid`, `flies`, `slugs`, je 0–100), `badCare`, `cursed`, `bonusYield`, `hasWeeds`. Wachstum ist **stündlich** getaktet (`nextGrowing = Stunde + timeToGrow`).
- **Pflanzen-Konfiguration** als Datentabelle (`farming_vegetableconf_*.lua`): `timeToGrow` (z.B. Gerste 432 h, Paprika 292 h), `waterLvl`/`waterNeeded` (Anfangs-/Soll-Wasser, ~70), `minVeg/maxVeg` (Ertrag), `mature`/`fullGrown` (Sprite-Stufe), `harvestLevel`, `seedTypes`, Ernte mit Sense (`scytheHarvest`), `coldHardy`.
- **Jahreszeiten-Mechanik**: `sowMonth` (Aussaat), `bestMonth` (Bonus), `riskMonth` (Risiko), `badMonth` (schlecht). Falscher Monat → Pflanze ist „verflucht" (`cursed`): schlechtere Start-Gesundheit (37–44 statt ~57–64) und mehr Krankheit. Bester Monat → Chance auf Zusatzertrag; Risiko-Monat → Chance auf Fluch, die mit dem Farming-Skill sinkt (`ZombRand(20) < 11 − skill`).
- **Krankheitswurf** (`defaultDiseaseCheck`): Würfel 1:200, Schwellwert = **fehlendes Wasser** (+/− Sandbox-Resilienz ±4/±8). Unkraut und Fluch halbieren das Würfelfeld (öfter krank), Bonus-Ertrag verdoppelt es. Krankheit steigt jede Stunde um 1 (0.5 wenn gut gewässert) bis 100. Blattläuse nur wenn nicht Winter und >10 °C; manche Pflanzen sind gegen Blattläuse immun.
- Behandlung: je Krankheit eigene Heilaktion (Spray usw.), Gießen, Düngen, Kompost. Wasser ≤ 0 oder Gesundheit ≤ 0 → Pflanze stirbt/vertrocknet.
- Idee: Pflanze = Daten + stündlicher Takt; Monat entscheidet über Qualität; Pflegefehler addieren sich; Skill verschiebt Würfel, nicht fix.

### Foraging (Sammeln)
- Eigenes **Suchmodus-System** (`ISSearchManager`): Symbole in der Welt erscheinen im Sichtbereich, Spieler läuft hin und sammelt.
- **Zonen** (`forageZones.lua`): Wald, Tiefer Wald, Farmland, Stadt, Trailerpark usw., jede mit `densityMin/Max` (Dichte 3–10) und `refillPercent` (3–7 %), skaliert über Sandbox „Natur-Reichtum".
- **Item-Definition** (`forageDefinitions.lua`): `type`, `minCount/maxCount`, benötigte `skill`/`perks`/`recipes`/`traits`, `xp`, Kategorien, **Wettermodifikatoren** (Regen, nach Regen, Schnee, Tag, Nacht), Zonen mit Anzahl Würfen, **Monate** (`months`, `bonusMonths`, `malusMonths`), `forceOutside`, Wasser-Flags, eigene Spawn-Funktion.
- **Skill-Profile** (`forageSkills.lua`): Berufe (Park Ranger, Veteran, Farmer, Holzfäller, Koch, Fischer …) geben `visionBonus` (Sichtweite ×1.0–2.0), Resistenz gegen Wetter/Dunkelheit, und **Spezialisierung pro Kategorie** (z.B. Ranger: Heilpflanzen 75, Wildpflanzen 50). Beruf = andere Sammel-Vorlieben.
- Kategorien: Beeren, Pilze, Kräuter, Heilpflanzen, Insekten, Knochen, Brennholz, Steine, Müll, Waffen-Schrott, Junk-Food, Medizin, Munition, Artefakte, Tierspuren …
- Idee: Loot nicht nur als Container, sondern **Welt-Sammelpunkte mit Dichte + Nachwuchsrate**; Wetter/Jahreszeit ändern die Chancen; Berufe ändern, was man überhaupt „sieht".

### Fischen
- **Köder (`lure`) × Gewässer**: Jede Fischart hat Flags `isRiver`/`isLake`/`isPredator`, `maxWeight` und eine Tabelle `lure[Köder] = Gewichtung`. Raubfische nur mit Rolle (`isReel`). Aus den erlaubten Fischen wird per **gewichteter Auswahl** gezogen.
- **Skill-Limit** (`skillSizeLimit[Level]`): max. Fischgewicht steigt mit Level. Müll-Wahrscheinlichkeit (`trashFactor`, pro Stelle aus `FishSchoolManager`) sinkt ab Level 5: ×0.8, ab 7 ×0.6, ab 9 ×0.2.
- **Fisch-Schwärme** (Fisch-Häufigkeit pro Karten-Position) und feste **Fluss-/Verbotszonen** (Rechtecke).
- **Fisch-Verhalten**: bewegt sich in 400-Tick-Zyklen mit Zufallsrichtung (kleiner je größer), planscht sichtbar; Spieler muss die Schnur mit **Spannungs-Anzeige** (`TensionUI`, Zeiger) halten.
- Idee: Fischen als Minispiel mit Spannungsanzeige; Sicht (Planschen) zeigt Fisch; Skill begrenzt Fischgröße und Müll.

### Fallen (`TrapDefinition`)
- Fallen-Typen: Kiste, Box, Käfig, Schlinge, Stock, Mausefalle – je mit `trapStrength` (Mausefalle 50, Käfig 20, Kiste/Box/Stock 15, Schlinge 10), Zerstör-Items (z.B. Holz, Nägel, Twine).
- **Tier-Definition**: `strength` (Stunden, bis es die Falle zerstört/entkommt), `item`, **Aktivzeit** (`minHour`–`maxHour`, Kaninchen 19–5 Uhr), `minSize/maxSize` (Nährwert), `zone[Zone] = Chance`, `traps[Falle] = Chance`, `baits[Köder] = Chance`, lebende Varianten (`rabbuck/rabdoe/rabkitten`) und Rassen.
- **Fangchance**: nur wenn Köder frisch ist **und** `Zufall(100) < Fallenchance + Köderchance + Fallen-Skill·1.5` **und** `Zufall(100) < Zonenchance + Skill·1.5`.
- **Stündlicher Check**: Tier kann Köder stehlen (`1 aus trapStrength+10`) oder (selten) die Falle zerstören; gefangenes Tier bleibt N Stunden (+0–15 Zufall) und kann sich befreien.
- Fang ist als Kadaver, Item oder lebendes Tier möglich (Tierhaltung). Fallen-Geräusche (`addSound`) locken Zombies (1 aus 4).
- Idee: Mehrfach-Würfel (Falle × Köder × Zone × Skill) statt einer Zahl; Tageszeit bestimmt, wer kommt; Zeitdruck durch Befreiungs-Timer.

### Mini-Features (Fortsetzung)
31. Pflanzen mit Aussaat-/Bestmonat und „verflucht" bei falscher Zeit.
32. Krankheitswurf = fehlendes Wasser + Unkraut + Resilienz-Sandbox.
33. Sammelpunkte mit Dichte, Nachwuchsrate und Wetter-/Monatsmodifikator.
34. Berufe geben Sicht- und Kategorie-Boni beim Sammeln.
35. Fischen mit Köder-Gewichtstabelle + Spannungs-Minispiel.
36. Fallen: Falle × Köder × Zone × Skill, Tier hat Aktivstunden.
37. Fangtiere entkommen nach einigen Stunden.
## 11. Bauen, Möbel, Camping, Feuer (Lua + Scripts)
Gelesen in `media/scripts/generated/entities/**`, `lua/server/Camping`, `lua/shared/Moveables`, `lua/server/BuildRecipeCode`, `lua/server/FireFighting`. JAR nicht nötig; nichts getestet. Hinweis: Das ist die neue „Entity"-Struktur (B42) – ältere Build-Skripte (`ISBuildingObject`) liegen noch daneben.

### Bauen als Daten („Entity")
- Ein baubares Objekt ist ein **Textblock** (`entity Piano { … }`) aus **Komponenten**: `SpriteConfig` (Bilder pro Himmelsrichtung `face N/E/S/W`, mehrere Kacheln als `layer`/`row`), `CraftRecipe` (Zeit, Kategorie, `inputs`, Tooltip), `UiConfig` (Menü-Skin). Ordner: Wände, Möbel, Zäune, Treppen, Barrikaden, Schmiede, Landwirtschaft, Tiere, Outdoor, Töpferei.
- **Gleiches Rezeptformat wie Crafting** (Abschnitt 2): `item 4 [Base.Nails]`, Werkzeug `tags[base:hammer] mode:keep` mit leichtem Verschleiß. Das Bauen ist also eine Rezeptsorte – ein einziges System für Items und Gebäude.
- **Lebenspunkte aus dem Skill**: `skillBaseHealth = 300`, `bonusHealth = 400` (Sandsackwand) – Stabilität wächst mit Schreiner-Level. Material verändert Gesundheit über `healthDefinitions` (Holz, Metall, …).
- **Stufen**: Möbel/Wände gibt es als `lvl1/lvl2/lvl3` (Stuhl, Regal, Bücherregal, Tür) – höhere Stufe = mehr Skill/Material.
- **Hooks**: `BuildRecipeCode.<typ>.OnIsValid` (darf hier gebaut werden?) und `OnCreate` (Nachbearbeitung). Beobachtete Typen: Barrikade, Treppe, Boden, Türrahmen, Lagerfeuer, Kompost, Fensterglas, Fass-Ofen, Futtertrog, Hühnerstall, Fleischerhaken, Lampe.
- Idee: Bauteile als Daten (Sprites je Ausrichtung + Rezept + Lebenspunkte), Spezialregeln als kleine Prüf-/Create-Funktionen.

### Möbel bewegen / abbauen („Moveables")
- Jedes Objekt hat Materialeigenschaften (Holz, Stahl, Stoff, Leder, Elektro, Sanitär, Log …) aus Tile-Properties (`ISMoveableSpriteProps.lua`, ~200 KB).
- **Werkzeug-Definitionen**: Hammer, Brechstange, Schraubenzieher, Messer/Schere, Schaufel, Schraubenschlüssel – je mit Skill (Zimmerei, Elektrik, Schweißen, Landwirtschaft), **Basis-Aktionszeit** (50–150) und Geräusch.
- **Material-Rückgabe beim Abbauen** (`addMaterialDefinition(Material, Item, MaxAnzahl, Chance%)`): z.B. Holz → bis 3 Bretter (Chance je 20 %) + Nägel; Stahl → Schrauben; Stoff → Faden/Stoffstreifen/Laken.
- Außerdem: Reparatur-Definitionen, Aufheben/Platzieren von Möbeln, Streichen, Tapezieren, Verputzen, Graffiti, Doppel-Kachel-Möbel, Rampen, Böden aus Erde/Kies/Sand.
- Idee: Abreißen gibt **zufällig** Material zurück (nie 100 %), abhängig von Skill und Werkzeug.

### Lagerfeuer
- Zustand: `isLit`, `fuelAmt` (in **Minuten Brenndauer**), `exterior`. Maximale Brennstärke bei 6 h (360 min).
- **Lichtradius = `max(2, maxRadius · Brennstoff/360)`**, `maxRadius` = 18 innen, 10 außen. Das Feuer wird also kleiner, wenn der Brennstoff schwindet.
- Brennstoff pro Item (`camping_fuel.lua`, Stunden): Log 6, Brett 2, Zweig 1, Stöckchen 0.25, Kohle 0.5, Laken 0.25 h, Papier/Geld/Karten ~5 min, Tüten ~1 min. Neuere Regel: Standard = **Gewicht × 2/3**, bei Kleidung/Literatur/Karten **Gewicht × 1/4**; Tag `IsFireFuel`, optional `FireFuelRatio`.
- **Anzünden** mit Zunder/Bogendrille: pro Tick sinkt die Ausdauer minimal; Erfolgschance 1 aus 150–300 pro Tick, Werkzeug kann zerbrechen (1 aus 300–450). Auch mit Literatur oder Benzin.
- Stündlicher Takt: Brennstoff sinkt; Innen mit Chance 1 aus 5 pro Tick **Brandgefahr** (brennbarer Boden prüfen). Ausgelöscht behält das Feuer 90 % des Brennstoffs.
- **Das Feuer macht Lärm**: lodernde Feuer senden alle paar Minuten ein Weltgeräusch (Radius = Feuer-Radius) → lockt Zombies.
- Feuerlöschen: Wasserquellen (Eimer, Flasche, Fluidcontainer mit Wasser/schmutzigem Wasser), Löschwerte pro Item (`getExtinguisherUses`).
- Idee: Feuerstärke als Zahl, die Licht, Lärm und Brandgefahr steuert; verschiedene Brennstoffe mit verschiedenen Brenndauern.

### Zelte
- Zelt = vier Kacheln (Vorder-/Rückseite, links/rechts) als **IsoThumpable** (kann kaputtgeschlagen werden), Gesundheit 10, blockiert die ganze Kachel. Varianten: Laken-Zelt und Planen-Zelt; Aufbau per Menü (`ISCampingMenu`).
- Idee: Unterschlupf als einfaches, zerstörbares Objekt mit wenig HP; Schlafen darin mit Komfortbonus.

### Mini-Features (Fortsetzung)
38. Baubares Objekt als Daten: Sprites je Ausrichtung + Rezept + Skill-abhängige HP.
39. Stufen (lvl1–3) für Möbel/Wände mit mehr Material und Skill.
40. Abreißen: zufällige Materialrückgabe nach Material und Werkzeug.
41. Lagerfeuer: Brennstoff in Minuten, Radius skaliert, innen kleiner als außen.
42. Brennwert aus Gewicht (Holz ≫ Papier), `IsFireFuel`-Tag.
43. Anzünden mit Zufall pro Tick, Werkzeug kann brechen.
44. Feuer macht Lärm; Innenfeuer hat Brandrisiko.
45. Zelt als zerstörbares Mehrfach-Kachel-Objekt.
## 12. Tiere, Tierhaltung, Zombie-Population
Quellen: `lua/shared/Definitions/animal/*.lua` (Tier-Daten im Klartext), Sandbox-Presets, dekompilierte `VirtualZombieManager`, `ZombieGroupManager`, `VirtualAnimal`, `AnimalPopulationManager`. **Grenze:** Die eigentliche Zombie-Bevölkerungssimulation (`ZombiePopulationManager`) ruft nur native Funktionen in `PZPopMan64.dll` auf – die Java-Seite reicht Parameter durch, die Formeln sind dort nicht lesbar. Nichts davon getestet.

### Tier-Datenmodell (alles Daten)
Ein Tier besteht aus **Stufen**, **Genom**, **Rassen** und **Tier-Eintrag**:
- **Stufen** (`stages`): z.B. Kaninchen `rabkitten` (4×30 Tage bis zur Reife) → `rabdoe`/`rabbuck`, jede Stufe mit Min-/Max-Gewicht. Kuh: Kalb braucht 360 Tage.
- **Tier-Eintrag**: Modell, Schatten, `minSize/maxSize` (wächst täglich, wenn gut gefüttert), `minAgeForBaby` (Kuh 12 Monate), `maxAgeGeriatric` (Kuh 12 Jahre – danach weniger Milch, keine Jungen), `pregnantPeriod` (Kuh 9 Monate + 10 Tage), `timeBeforeNextPregnancy` (70 Tage), `hungerMultiplier` (0.0035/h), `thirstMultiplier` (0.0065/h), `healthLossMultiplier` (0.01), `thirstHungerTrigger` (sucht Futter erst bei ≥ 0.3), `eatGrass`, `eatTypeTrough` (Futterliste), `canBeMilked`, `minMilk/maxMilk` (Kuh 10→50 l; +1 l pro 5 l Melken), `minWeight/maxWeight`, `minBlood/maxBlood`, `minEnclosureSize` (zu kleines Gehege → Tier wächst weniger), `dungChancePerDay`, `canBePet`, `canBeAttached` (Seil), `alwaysFleeHumans`, `wanderMul`, `attackDist`, `baseDmg`, `idleSoundRadius`.
- **Rassen** (`breeds`): Texturen/Icons je Geschlecht und Alter (lebendig, tot, Skelett) plus **erzwungene Genwerte** (z.B. Kaninchen: Milch 0.75–0.95).
- Spezies: Huhn, Kuh, Schaf, Schwein, Kaninchen, Truthahn, Reh, Waschbär, Maus, Ratte. Viele Tierarten teilen dasselbe Schema – neues Tier = neue Tabelle.
- Idee: Ein einziges Tier-Schema mit Stufen und Zahlenfeldern; Rassen nur als Texturen + Gen-Grenzen.

### Genetik
- Jedes Tier hat **Gene** mit zwei **Allelen** (Vater/Mutter): `maxSize`, `maxWeight`, `meatRatio`, `lifeExpectancy`, `resistance`, `strength`, `fertility`, `aggressiveness`, `hungerResistance`, `thirstResistance`, `ageToGrow`, `maxMilk`, `milkInc`, `maxWool`, `woolInc`, `eggSize`, `eggClutch`, `stress`.
- **Dominanz**: je näher ein Allel am Mittelwert, desto eher dominant. Dominantes Allel wird an die Jungen vererbt; bei zwei gleichen wird zufällig gewählt. **Mutationen** selten: ändern Werte stark, verstecken „Perks", machen rezessive Gene dominant; Werte driften leicht (±0.05).
- **Gen-Verhältnisse** (`ratio`): Milch/Wolle drücken das Fleisch (`meatRatio` −(ratio − Wert)) → Milchkuh gibt wenig Fleisch, Fleischrasse wenig Milch.
- **Erbkrankheiten** (nur aktiv, wenn beide Allele gleich): gefräßig, hoher Durst, zappelig, rüpelhaft, geringe Fruchtbarkeit, unfruchtbar, schwach, Zwerg, dünn, knochig, stirbt bei Geburt.
- Idee: Zucht mit Zahlen-Genen, Ziel-Tradeoffs und seltenen Defekten; das Gen-Verhältnis erzwingt Spezialisierung.

### Haltung & Alltag
- **Futtertrog** (Gras, Heu, Gemüse, Obst, Tierfutter), Wasser, Gehege-Größe, Kot (`Dung_Cow`) zum Aufsammeln und Kompostieren, Melken, Scheren, Eier, Brüten, Hühnerstall (`Hutch`), Fleischerhaken und **Schlachten** (`ButcheringUtil`, Körperteile mit Ausbeute).
- Bindet an Seil, Anhänger (`trailerBaseSize`), Lockfutter (`luredPossibleItems`), von Hand füttern (Animation).
- **Stress** als Wert (Gen), steigt in Fahrzeugen/Ort; Haustier-Status (`canBePet`).
- **Ranch-Zonen** (`RanchZoneDefinitions`): Gewichtetes Zufalls-Rezept pro Hof, z.B. „Huhn groß": 10–20 Hennen, 1 Hahn, 10 % Chance auf Küken je Henne; „Huhn klein" 1–5 Hennen. Welt bevölkert sich damit vor dem Start.
- Idee: Tier = Produktionskette mit Bedürfnissen; Gehege-Größe und Pflege begrenzen Wachstum.

### Wilde Tiere & Wanderung
- **Migrations-Gruppen** (Reh, Kaninchen …): `minAnimal/maxAnimal` weibliche Tiere + `maxMale`, `babyChance` (Reh 20 %, Kaninchen 40 %), Rasse, **Tagesablauf** (Schlaf: 1500–1900 min Wartezeit, Essen: 1200–1800 min, dazu Dauer 60/100 min), Geschwindigkeit, Spuren/Kot/Fell/Knickzweige/Grasspuren mit Chancen **pro Tick**.
- **Virtuelle Tiere** (`VirtualAnimal`): außerhalb des Sichtbereichs wird nur Position und Zustand (essen/schlafen/laufen) mit Zeitplan (`isTimeToSleep/Eat` nach Spielstunde) simuliert; nahe dem Spieler wird zum echten `IsoAnimal`. Zonen für Tierwege (`AnimalZones`, `AnimalsPathConfig`).
- **Spuren-Lesen**: Skill „Tracking" bestimmt, was man sieht (`trackSize` = „groß/mittel" statt Tiername bei niedrigem Level).
- Idee: Wildtiere „virtuell" nur als Position + Tagesplan simulieren, Spuren sind Spielinformation.

### Zombie-Spawn & Population
- **Sandbox-Parameter** (`ZombieConfig`): `PopulationMultiplier` (Apokalypse-Preset 0.65), `PopulationStartMultiplier` 1.0, `PopulationPeakMultiplier` 1.5, `PopulationPeakDay` 28, `RespawnHours`, `RespawnUnseenHours`, `RespawnMultiplier`, `RedistributeHours`, `FollowSoundDistance`, `RallyGroupSize`, `RallyGroupSeparation`, `RallyGroupRadius`, `RallyTravelDistance`. Dazu `ZombieRespawn`, `ZombieMigrate`, `ZombieVoronoiNoise` (Verteilung per Noise), `ZombieAttractionMultiplier`, `SirenEffectsZombies`, `AnimalSoundAttractZombies`, `ZombiesArmorFactor` (2.0), `ZombiesMaxDefense` (85 %), `ZombiesFallDamage`, `ZombiesDragDown`, `ZombiesFenceLunge`.
- **Zombie-Lore** (Presets): Geschwindigkeit, Zähigkeit, Gedächtnis, Kognition, Sicht, Gehör, Mortalität (siehe Abschnitt 8).
- **Zwei Ebenen**: Die nativen Bibliothek simuliert sehr viele **virtuelle Zombies** pro Kartenzelle (nur Position/Zustand); `VirtualZombieManager` erzeugt daraus **echte** `IsoZombie`-Objekte um den Spieler (`maxRealZombies` begrenzt die Zahl, Pool von wiederverwendbaren Zombies). Zonen: Innenräume bekommen Zombies pro Raum (`addZombiesToMap(nSize, room)`), auch **Tote** und **fressende Zombies an Leichen**.
- **Horde**: `createHordeFromTo(spawn, ziel, Anzahl)` und `n_spawnHorde`; Geräusche gehen als `n_worldSound` an die Population (virtuelle Zombies laufen zum Lärm, siehe Abschnitt 8).
- **Gruppenbildung** (`ZombieGroupManager`): Anführer mit Gruppe; ideale Gruppengröße = `RallyGroupSize × idealSizeFactor`; Mitglieder halten Abstand (`RallyGroupSeparation`) und bleiben im Radius (`RallyGroupRadius`) um den Anführer; zufälliger Zielpunkt im Radius; Gruppen suchen eine andere Gruppe in `RallyTravelDistance`.
- **Population über Zeit**: Start-Multiplikator, steigt bis zum **Peak-Tag** (Tag 28) auf Peak-Multiplikator (≈ „mehr Zombies mit der Zeit"), dann Rückgang; Respawn nur nach Sandbox-Stunden/„ungesehen"-Stunden.
- **Schlüssel**: Zombies können Schlüssel für Gebäude tragen (`spawnBuildingKeyOnZombie`, nach Berufs-Outfit).
- Idee: Zwei Simulationsstufen (viele billige virtuelle, wenige echte Objekte nahe am Spieler); Population als Kurve über die Zeit; Gruppenführer statt Einzelzombies.

### Mini-Features (Fortsetzung)
46. Tier-Schema aus Stufen, Genom, Rassen und Bedürfnis-Zahlen.
47. Gene mit zwei Allelen, Dominanz, Mutation, Erbkrankheiten.
48. Milch/Wolle senken Fleisch (Gen-Verhältnis).
49. Gehege-Größe begrenzt Wachstum; Kot als Ressource.
50. Wildtiere virtuell mit Tagesplan, Spuren als Info.
51. Ranch-Zonen als gewichtete Zufalls-Rezepte.
52. Zombies: virtuell (Masse) + echt (um Spieler), Pool zur Wiederverwendung.
53. Bevölkerungskurve mit Peak-Tag und Respawn-Regeln.
54. Zombie-Gruppen mit Anführer, Radius und Abstand.
## 13. Fertigkeiten, XP, Traits, Berufe
Quellen: `PerkFactory`, `IsoGameCharacter$XP` (JAR, dekompiliert), `lua/server/XpSystem/XpUpdate.lua`, `XPSystem_SkillBook.lua`, `scripts/generated/characters/character_traits.txt` und `character_professions.txt`. Gelesen, nichts getestet.

### Skill-Baum und Level-Kurve
- **Gruppen mit Unterfertigkeiten**: Kampf (Axt, Stumpf, Kleinstumpf, Langklinge, Kleinklinge, Speer, Wartung), Schusswaffen (Zielen, Nachladen), Handwerk (Tischlerei, Schnitzen, Kochen, Elektrik, Glasbläserei, Feuersteinschlagen, Maurern, Schmieden, Mechanik, Töpfern, Schneidern, Schweißen), Überleben (Fischen, Sammeln, Tracking, Trapping, **Doctor**), dazu passive Werte (Fitness, Strength) und Bewegungswerte (Sprinting, Nimble, Sneak, Lightfoot).
- Jeder Skill hat Level 0–10. Die **XP-Schwellen sind Daten**: `50, 100, 200, 500, 1000, 2000, 3000, 4000, 5000, 6000` (je Level), global ×**1.5** gestreckt. Fast alle Skills teilen dieselbe Kurve.
- Beim Levelup lösen **Events** Dinge aus: neue Rezepte (z.B. Farming 10 → alle Anbau-Zeiten, Mechanik 8/9/10 → Basis/Mittel/Fortgeschritten, Elektrik 3 → Generator), `getScriptManager():checkAutoLearn`.
- Idee: Eine Kurve als Tabelle, Skills als Eltern/Kind-Baum; Rezepte schalten sich über „AutoLearn" bei Skill-Stufen frei.

### XP vergeben (`AddXP`)
- XP kommt aus **Aktionen**, nicht Kampf allein: Rezept `xpAward = Woodwork:5`, Treffer (`onWeaponHitXp`), Bäume fällen (Strength +2), erstmaliges Behandeln einer Wunde (Doctor), Sammeln/Fischen/Fallen.
- **Zufalls-XP für Bewegung**: Rennen/Sprinten gibt mit kleiner Chance 1 XP in Fitness/Sprinting (`checkInterval 1000`, Chance 5 %), Zielen im Gehen → Nimble (nur wenn man sich wirklich bewegt – **Anti-AFK**), Tragen von > 50 % der Kapazität → Strength +2.
- **Multiplikator-Kette** pro XP-Gewinn:
  - Boost-Stufe aus Beruf/Trait: 0 → ×0.25, 1 → ×1.0 (Sprinting ×1.25), 2 → ×1.33, ≥3 → ×1.66; ohne Eintrag für den Skill ×0.25.
  - Trait „Fast Learner" ×1.3, „Slow Learner" ×0.7, „Pacifist" ×0.75 auf Kampfskills, „Crafty" ×1.3 auf Handwerk.
  - Temporärer Multiplikator pro Skill (aus Büchern, nur innerhalb eines Level-Bereichs, danach entfernt).
  - Sandbox-Globalfaktor oder pro-Skill-Faktor.
  - Strength: Protein 50–300 → ×1.5; Protein < −300 → ×0.7. Fitness-XP nur wenn Ernährung es zulässt.
  - Deckel bei Level 10 (kein XP darüber).
- **Skill-Verfall nur für Strength und Fitness**: Timer zählt im 10-Minuten-Takt hoch; ab ~20 000 beginnt Verlust (alle 1200 Ticks −XP), Level fällt zurück (`checkForLosingLevel`); Training senkt den Timer um 3000 pro XP-Gewinn; Deckel 31 000 (bei Rückkehr schnell wieder fit).
- **Strength/Fitness setzen Traits automatisch**: Strength 0–1 Schwach, 2–4 Kraftlos, 6–8 Kräftig, 9+ Stark; Fitness analog (Unfit, Out of Shape, Fit, Athletic). Der Zustand wird also als Trait *angezeigt* und kann sich ändern.
- **Skill-Bücher** (`XPSystem_SkillBook`): pro Skill Multiplikatoren je Level-Bereich (z.B. 3, 5, 8, 12, 16): das Buch beschleunigt XP, solange man im passenden Level-Bereich ist (Band 1: Level 1–2, …).
- Idee: Anti-Exploit-Prüfungen (Bewegung statt AFK), Boost-Stufen statt fixer Boni, Bücher als zeitlich begrenzter Multiplikator.

### Berufe (`character_profession_definition`)
- Felder: `Cost` (Punkte), `UIName`, `IconPathName`, `GrantedTraits`, `XPBoosts` (`Skill=Stufe;…`), `GrantedRecipes` (vorgelernte Rezepte), `UIDescription`.
- Kosten reichen von **−8 (Veteran)** und −6 (Einbrecher, Fitnesstrainer, Schmied) bis **+8 (Arbeitslos)**. Wer stark startet, bezahlt mit Punkten: Der Beruf ist ein Budget-Kauf.
- Beispiele (Boost): Zimmermann `Woodwork=4; Carving=1; SmallBlunt=1; Masonry=1; Maintenance=1` + Rezepte für Waffenverstärkung; Koch `Cooking=4; Butchering=2` + viele Back-/Sushi-Rezepte; Arzt `Doctor=6`; Elektriker `Electricity=5`; Einbrecher `Nimble=2; Sneak=2; Lightfoot=2` + Schlüssel-Kopieren, Behelfswaffen.
- Berufe wirken auch außerhalb der Fertigkeiten: Foraging-Boni (Abschnitt 10), Fahrzeugspawns, Startkleidung/-ausrüstung, Spawn-Outfits von Zombies (`professionVehicles`).
- Idee: Beruf = Datensatz aus Kosten, XP-Boost-Stufen, freigeschalteten Rezepten und Start-Traits.

### Traits (`character_trait_definition`)
- Felder: `Cost` (positiv = Vorteil kostet Punkte, negativ = Nachteil gibt Punkte), `IsProfessionTrait` (nur über Beruf), `MutuallyExclusiveTraits`, `XPBoosts`, `GrantedRecipes`, `DisabledInMultiplayer`.
- Kostenverteilung (Anzahl der Traits je Kostenwert): −12 (1), −10 (4), −8 (1), −6 (5), −5 (3), −4 (7), −3 (2), −2 (9), −1 (1), **0 (15)**, 1 (1), 2 (13), 3 (5), 4 (13), 5 (3), 6 (8), 8 (4), 10 (2).
- Beispiele: Athletic (+10, Fitness-Boost 4, schließt Übergewicht/Raucher aus), Adrenalinjunkie (+4, schließt Angst-Traits aus), Asthmatiker (−5), Agoraphobisch (−4), Grobmotorisch (−2, schließt Geschickt aus), Schmied (+6, schaltet ~80 Schmiede-Rezepte frei; zweite Variante als Berufs-Trait mit 0 Kosten).
- Ausschlüsse als Liste gegenseitig gepflegt (A schließt B aus und umgekehrt).
- Idee: Charakter-Erstellung mit **Punktebudget**: Nachteile finanzieren Vorteile, ausschließende Paare verhindern Widersprüche.

### Mini-Features (Fortsetzung)
55. Eine XP-Kurve (Tabelle), Skills als Baum mit Elternfertigkeit.
56. Rezepte schalten sich über Skill-Stufe frei (AutoLearn).
57. XP-Multiplikator-Kette: Boost-Stufe × Traits × Buch × Sandbox.
58. Zufalls-XP für Bewegung mit Anti-AFK-Prüfung.
59. Verfall nur für Körper-Skills (Strength/Fitness), mit Puffer und Deckel.
60. Körperzustand als Trait, der sich mit dem Level ändert.
61. Beruf als Punktekauf (−8 … +8) mit XP-Boosts und vorgelernten Rezepten.
62. Traits mit Kosten, Ausschlüssen und Mehrspieler-Sperre.
63. Skill-Bücher als Multiplikator pro Level-Bereich.
## 14. Welt, Loot-Verteilung, Raumtypen, Verstecke
Quellen: `lua/server/Items/Distributions.lua` (~630 KB), `ProceduralDistributions.lua` (~1 MB), `SuburbsDistributions.lua`, dekompilierte `ItemPickerJava`, `lua/server/WorldGen/*`, `lua/shared/StashDescriptions/*`, `RandomizedWorldContent`, `metazones`. Die handgebaute Karte (Kentucky: Muldraugh, Rosewood, Riverside, West Point …) liegt in Binärdateien unter `media/maps` – nicht gelesen. Nichts getestet.

### Loot: Raum → Container → Liste
- **Dreistufig**: `Distributions.lua` kennt **462 Raumtypen** (Küche, Schlafzimmer, Apotheke, Polizeiwache, Fabrik, Camping-Laden, Kirche, Gefängnis …). Jeder Raum nennt pro **Container-Typ** (Theke 202×, Regal, Metallregal, Kühlschrank, Gefrierschrank, Schreibtisch, Spind, Kleiderschrank, Schublade, Kiste, Werkzeugschrank …) entweder direkte `items` oder eine **prozedurale Liste** (`procList`).
- **Prozedurale Listen** (66+ Einträge in `ProceduralDistributions.list`, z.B. `BlacksmithTools`, `RangerLockers`, `KnappingBooks`, `PoliceLockers`): `rolls = N` und `items = { "Item", Gewicht, … }`, optional `junk = { rolls, items }` als zweiter Wurf (Krempel).
- **Tile-Zwang**: `forceForTiles` – bestimmte Möbel-Sprites bekommen immer eine bestimmte Liste (z.B. Salon-Theke). `weightChance` gewichtet mehrere Listen untereinander. Es gibt ein Feld `min/max` (Bereich), außerdem Räume ohne Container-Füllung (`NoContainerFillRooms`: Waffenladen, Camping, Pfandhaus … – dort füllen Regale/Auslagen separat).
- **Werkzeuge für Mods**: Hilfsfunktionen (`ClearAllDistributionItems`, `RemoveItemFromDistribution`) zeigen, dass das Ganze bewusst als **veränderbare Tabelle** gedacht ist.
- Zusatzregeln: Waffen bekommen mit Chance **Aufsätze** (`WeaponUpgrades`, z.B. Gewehr → Zielfernrohr, Rückstoßpad); Munition 90 % dazu; Getränke/Flaschen oft nur teilweise gefüllt; „Trash"-Items sind verdorben/kaputt (95 % Zustand gesenkt, Lebensmittel faulig, Waffen stumpf).
- Idee: Loot als Tabellen (Raum × Container → Liste mit Gewichten und Wurfzahl), jede Liste leicht auszutauschen; Krempel als zweiter Wurf.

### Loot: Wahrscheinlichkeitsformel (`ItemPickerJava`)
- Pro Wurf: `Zufall(10000) < getActualSpawnChance`.
- **Chance = (Basischance × 100 × LootModifier + Zombiedichte) × Zeit-Modifikator.**
  - Basischance: Gewicht des Eintrags (Listenwert), vom Spieler abhängig (z.B. Glück/Beruf).
  - **LootModifier pro Kategorie** (Sandbox): Essen, Konserven, Literatur, Medizin, Überlebensausrüstung, Waffen, Fernwaffen, Munition, Mechanik, Kleidung, Behälter, Schlüssel, Medien, Andenken, Kochgeschirr, Material, Landwirtschaft, Werkzeug, Skill-Bücher, Rezept-Ressourcen, Sonstiges. Voreinstellung Apokalypse: 0.6 für die meisten, 0.8 Essen/Sonstiges, 1.2 Fernwaffen, 0.4 Schlüssel. Wert 0 → Item spawnt nie (Entfernen-Liste).
  - **Seltenheitsfaktoren** der Sandbox: sehr selten 0.05, extrem selten 0.2, selten 0.6, normal 1.0, häufig 2.0, reichlich 3.0.
  - **Zombiedichte-Effekt**: Chunk-Wert `LootZombieIntensity` (gedeckelt) × Sandbox → mehr Loot dort, wo viele Zombies waren.
  - **Zeit-Modifikator** (`getCurrentLootMultiplier`): Loot nimmt ab, wenn Gebiet schon geplündert (`MaximumLooted`, `DaysUntilMaximumLooted` 90 Tage, ländlich 0.5×, maximaler Abzug nach 3650 Tagen).
- `rollsMultiplier` multipliziert die Wurfzahl, mindestens 1.
- **Respawn** von Loot ist abstellbar (Stunden, wenn Spieler weg war; nicht auf gebauten Flächen).
- Idee: Eine Formel aus vier Faktoren (Eintrag, Kategorie, Gebiet, Zeit) und ein Schalter pro Kategorie. Zum Tunen reicht ein Sandbox-Wert pro Kategorie.

### Besondere Fundorte
- **Verstecke / Stash-Karten** (`StashDescriptions`): Eine Karte als Item (z.B. „Rosewood-Karte") hat **Anmerkungen** (Stempel „X", „Ziel", Kreis, handschriftliche Textzeilen mit Farbe) und verweist auf ein Gebäude (`buildingX/Y`), einen Container (z.B. `GunBox` mit Sporttasche), eine **Spawn-Tabelle** (`GunCache1`, `ToolsCache1`), eine Zombie-Anzahl, Fallen/Barrikaden, Spawn-Tage (`daysToSpawn = "0-30"`), optional nur nach Zombie-Tod (`spawnOnlyOnZed`). Pro Stadt eigene Datei.
- **Story-Clutter** (`RandomizedWorldContent`): Zufällige Szenen wie Poker-Abend, Hauspartys, Mordszene, schäbiges Camp, Survivalisten-Camp, Fußballabend; Tisch-/Möbel-Listen je Szene (`BedClutter`, `KitchenSinkClutter`, `MedicalClutter`, `RichJerkClutter` …).
- **Zufalls-Welt-Ereignisse**: Metaevents, Hubschrauber (Sandbox `MetaEvent`), Schlüssel für Häuser/Autos, Alarm-Chance, verschlossene Häuser/Autos (Sandbox).
- **Keller** (`ProceduralBasements`), Spawn-Origin-Zonen, Mannequin-Zonen, Raum-Töne, Wasserfluss/-Zonen, Tierzonen (`metazoneHandler`).
- Idee: Verstecke als Daten (Karte + Stempel + Container + Loot-Tabelle); Szenen als zufällige „Geschichten" in Räumen.

### Prozedurale Weltgenerierung (`WorldGen`)
- Gedacht für die **Natur** (Vegetation, Erze, Wege) über der handgebauten Karte, nicht für Städte.
- **Auswahlachsen** (`Selection.lua`) als Rauschwert-Bereiche −1…1: Landschaft (Ebene/Lichter Wald/Wald), Pflanzen (Gras/Blumen), Büsche (üppig/normal/trocken), Temperatur (kalt/mittel/heiß), Feuchte (trocken/regen/überflutet), **Erz-Stufe** (keine … sehr hoch).
- **Biome** (`biomes/map/*.lua`): Birken-, Misch-, Tief-, Obst-, Primär-Wald, Büsche, Lehm-See/-Ufer, Erde, Vorgarten. Ein Biom erbt von einem Eltern-Biom, setzt **Platzierungsmuster** (Tile-Wildcards `blends_natural_01_*`, mit `!`-Ausschlüssen), **geschützte** Tiles (Landwirtschaft, Zierpflanzen, Innenpflanzen werden nicht überschrieben) und Features mit Wahrscheinlichkeit (z.B. Felsbrocken 0.001 bei Erz „sehr niedrig" … 0.04 bei „sehr hoch").
- **Adern** (`Veins.lua`): Eisen und Kupfer als Sternmuster: 3–6 Arme, 100–400 Felder lang, Winkelabweichung 5°, Armchance 0.25, Zentrum Radius 5; Basis-Wahrscheinlichkeit 1 %.
- **Straßen**: kleine Pfade als Feature mit Kantenfilter.
- Idee: Natur per Rauschen auf Achsen ablegen, Biome als Vererbungsbaum, Erz als Adern vom Zentrum aus.

### Mini-Features (Fortsetzung)
64. Loot-Tabellen: Raum × Container → Liste (Gewicht, Wurfzahl) + zweiter Junk-Wurf.
65. Loot-Chance = Eintrag × Kategorie × Gebiet × Zeit; Kategorie-Schalter.
66. Weniger Loot in oft geplünderten Gebieten (Abnahme über Tage).
67. Waffen bekommen zufällige Aufsätze; Munition fast immer dabei.
68. Versteck-Karten mit Anmerkungen, Container, Spawn-Tabelle und Tag-Fenster.
69. Zufalls-Szenen (Poker-Abend, Mordszene, Camp) als Raum-Dekor.
70. Natur per Rauschachsen; Biome mit Vererbung; Erz-Adern.
## 15. Schlaf, Müdigkeit, Stimmung, Wasser, Strom
Quellen: `ZomboidGlobals` (Zahlen in `lua/shared/defines.lua`), `CharacterStat`, `MoodleStat`, `BodyDamage.UpdateBoredom/UpdateDiscomfort`, `IsoGenerator` (JAR, dekompiliert), `ISSleepDialog`, `ISFixGenerator`, `SRainBarrelSystem`. Kein Eintrag für „Trauer" (Grief) gefunden – der nächste Wert ist **Unhappiness** (Unglücklichkeit). Nichts getestet.

### Alle Charakterwerte auf einen Blick (`CharacterStat`)
Jeder Wert hat Minimum, Maximum, Standard:
- 0–1: Anger (Wut), Endurance (Ausdauer, Start 1), **Fatigue (Müdigkeit)**, Hunger, Thirst, Idleness (Untätigkeit), Morale (Start 1), Sanity (Start 1), Sickness, Stress, Fitness (−1…1).
- 0–100: Boredom, Discomfort, FoodSickness, Intoxication, Pain, Panic, Poison, Unhappiness, Wetness, ZombieFever, ZombieInfection. Temperature 20–40 (Start 37). NicotineWithdrawal 0–0.51.
- Idee: ein einziges Register von Werten mit Grenzen und Standard; alles andere (Moodles, Effekte) liest nur daraus.

### Moodle-Stufen als Tabelle (`MoodleStat`)
Jeder Moodle hat **vier Schwellen** → Stufe 1–4. Beispiele:
| Moodle | Stufe 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| Müde | 0.6 | 0.7 | 0.8 | 0.9 |
| Hunger | 0.15 | 0.25 | 0.45 | 0.7 |
| Durst | 0.12 | 0.25 | 0.7 | 0.84 |
| Stress | 0.25 | 0.5 | 0.75 | 0.9 |
| Langeweile | 25 | 50 | 75 | 90 |
| Unglücklich | 20 | 45 | 60 | 80 |
| Schmerz | 10 | 20 | 50 | 75 |
| Nass | 15 | 40 | 70 | 90 |
| Panik | 6 | 30 | 65 | 80 |
| Ausdauer (fällt!) | 0.75 | 0.5 | 0.25 | 0.1 |
→ Eine Schwellentabelle genügt, um Anzeige und Wirkung zu steuern.

### Grundraten (`ZomboidGlobals`, pro Spieltick)
Müdigkeit +0.0000345; Schlaf-Erholung −0.000003; Hunger +0.0000096 (×2 bei Sport, fast 0 im Schlaf); Durst +0.000008 (im Schlaf 0.000001); Ausdauer: Rennen −0.000052, Sprinten −0.000455, Erholung im Stehen +0.000031; Stress −0.00003 pro Tick; Langeweile +0.001 / −0.0385; Unglücklichkeit +0.0005; Wut −0.0001; Nässe +0.015 / −0.01; Erkältung +0.003 / −0.175.
Faustregel: Hunger und Durst steigen langsam, Schlaf holt Müdigkeit nur langsam zurück, Langeweile geht schnell weg, wenn man etwas tut.

### Schlaf
- **Schlaf-Dialog** (`ISSleepDialog`): Standard 7 Stunden; bei Müdigkeit > 0.3 bis 12 Stunden (`7 + 5·(Müdigkeit−0.3)/0.7`). Der Spieler wählt die Dauer, das Spiel setzt eine **erzwungene Aufwachzeit** (Uhrzeit), `setAsleep(true)`.
- **Bett-Qualität** (`bedType`) erhöht **Discomfort** im Schlaf: schlechtes Bett 0.3, schlechtes Bett + Kissen 0.2, Boden 0.5, Boden + Kissen 0.4 (gutes Bett = 0).
- Im Schlaf: Gesundheit regeneriert schneller (zusätzlicher Bonus), Hunger/Durst steigen kaum, Kalorienverbrauch ×0.003 statt ×0.016, kein Langeweile-Aufbau.
- Müdigkeit > 0.5 wirkt auf andere Systeme (u.a. Zustand im Tick-Check).
- Schlaf mit Nässe, Kälte/Hitze, Verkleidung oder Alkohol verschlechtert Komfort; Alkohol dämpft Unbehagen (`drunkMod = 1 − 0.5·Rausch/100`).
- Idee: Schlafdauer wählbar, Müdigkeit verlängert die nötige Zeit; Bettqualität nur als Komfort-Wert.

### Stimmung: Langeweile, Stress, Unglücklichkeit
- **Langeweile** (`UpdateBoredom`): Im Freien sinkt sie langsam (×0.1 Rate). In Räumen steigt sie mit `IdleIncrease × Untätigkeit`; wer beschäftigt ist, verliert 0.5× Rate; Reden und Gesellschaft senken sie. Im stehenden Auto steigt sie; Lesen im Auto nur 1/5. Starke Panik (> 5) setzt sie auf 0 zurück, Alkohol (> 20) senkt sie.
- **Unglücklichkeit** wächst, solange Langeweile ≥ Stufe 2 oder Stress ≥ Stufe 2 (halbe Rate, je Stufe mal), und **nicht** beim Lesen. Das ist die langsame Folge schlechter Zustände – eine Art „Trauer"-Ersatz.
- **Stress**-Quellen (Konstanten): Geräusche (`StressFromSounds`), Biss/Kratzer (0.00005), Blutscheu (Hemophobic), **Unbehagen** (`Discomfort × Faktor`, ab Stufe „Uncomfortable"), Rauchentzug (steigt mit der Zeit seit der letzten Zigarette bis ×10). Sinkt langsam von allein (0.00003/Tick).
- **Unbehagen (Discomfort)** = Summe aus: Bett-Mali, Kleidung (`getClothingDiscomfortModifier`), Leichen ziehen (0.3), Unterkühlung/Überhitzung (je Stufe 0.1), Nässe (je Stufe 0.1), Fahrzeug (Übergewicht 0.25); wird mit Rausch-Faktor skaliert und **langsam** angeglichen (Zielwert ×0.005 pro Tick, aufwärts noch ×0.025 langsamer).
- Idee: Stimmung als Kette „Reize → Stress/Langeweile → Unglücklichkeit → Moodles", alles Zahlen mit Schwellen; Beschäftigung und Gesellschaft senken sie.

### Strom und Generator (`IsoGenerator`)
- **Sandbox-Stromausfall**: `ElecShut` / `WaterShut` (Preset 2) + `Modifier` 14 Tage: Netzstrom und Wasser enden nach der Frist. Im Stromnetz-Zustand zeigt `isHydroPowerOn` Innenräume auf 22 °C (siehe Abschnitt 9).
- **Generator**: Kraftstoff max. 10, Zustand 0–100. Verbrauch pro Tick = Gesamtleistung der angeschlossenen Geräte × Sandbox-Faktor (Basis 0.02, Rohr-Kraftstoff 0.03). Zustand sinkt zufällig (Standard 1 aus 30 pro Tick um 1–2).
- **Fehlerstufen**: Zustand ≤ 40 → Fehlzündung 1 aus 15; ≤ 30 → 1 aus 10; ≤ 20 → 1 aus 5. Bei ≤ 20 zusätzlich Zufall: 1 aus 10 **Feuer** (Zustand auf 0) oder 1 aus 20 **Explosion**.
- **Lärm**: laufender Generator sendet Weltgeräusch Radius **40**, Lautstärke **60** (lockt Zombies); Gebäude wird „toxisch" (Abgase) wenn drinnen betrieben.
- **Starten** nur wenn angeschlossen, Treibstoff > 0, Zustand > 0; bei Zustand ≤ 50 gibt es 1 aus 2 Fehlschlag. **Reparieren** mit Elektronikschrott: `+4 + Elektrik-Level/2` Zustand je Schrott.
- Idee: Strom ist ein Verbrauchswert pro Gerät; Lärm und Zustand machen Generatoren zum Risiko, nicht nur zur Ressource.

### Wasser: Regenfass
- Zwei Größen: klein 160, groß 400 Einheiten (Faktor 4 × 40/100). Alle **10 Minuten** prüft das System: Regnet es und ist das Fass nicht voll, kommen `+4` Einheiten dazu; das Wasser gilt als **verunreinigt** (`TaintedWater`), wenn es draußen steht und Wasser enthält. Das Sprite wechselt bei ≥ 75 % Füllstand.
- Fass hat Gesundheit (200 + 5·50 = 450 auf Zimmerei-Level 5). Wasser aus dem Fass muss abgekocht/gefiltert werden (schmutziges Wasser macht krank – siehe Gift/Lebensmittelvergiftung).
- Idee: Wasser sammeln per Regen, aber nicht trinkbar; Wasser wird erst durch Aufbereitung nützlich.

### Mini-Features (Fortsetzung)
71. Ein Register aller Werte (Min/Max/Standard); Moodles lesen nur daraus.
72. Moodle = vier Schwellen pro Wert.
73. Schlafdauer wählbar; Müdigkeit verlängert die Dauer; Bettqualität = Komfort.
74. Langeweile steigt bei Untätigkeit, fällt durch Aktivität/Gesellschaft; Unglücklichkeit als Folge.
75. Stress aus Geräuschen, Bissen, Unbehagen, Entzug; sinkt langsam.
76. Unbehagen als Summe (Bett, Kleidung, Kälte, Nässe), langsam angeglichen.
77. Generator: Verbrauch, Zufalls-Verschleiß, Fehlzündung → Feuer/Explosion, Lärmradius 40.
78. Netzstrom und Wasser enden nach Frist (Sandbox).
79. Regenfass füllt sich alle 10 Minuten, Wasser verunreinigt.
## Nächste Schritte (noch offen)
- Weitere Bereiche: Radio/Medien, Multiplayer/Server, Charaktererstellung-UI, Musik/Sound. (Native Zombie-Population steckt in PZPopMan64.dll und ist nur mit Native-Analyse lesbar.)


















