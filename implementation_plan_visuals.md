# Plan: Grafik-Überarbeitung (Gehweg, Gras, Straße, Bäume, Charakter)

## 1. Gehweg  — [MODIFY] `src/render/Textures.ts` (paving), `src/world/ChunkBuilder.ts`
- Textur `paving`: größere Platten (1 m) mit Fugen-Schatten, Kantenabnutzung, Farbvarianz pro Platte, feines Rauschen, Normal/Bump aus denselben Fugen.
- Bordstein: Fase (zwei Boxen: Kante + Oberseite) statt einer Box; Gullys bleiben.
- Gehweg-Deko (Flecken/Risse/Moos) behalten, Gras-/Unkrautbüschel in Fugen und am Bordstein ergänzen.

## 2. Rasen mit Pflanzen — [MODIFY] `src/world/ChunkBuilder.ts` (`tuftGeo`, Tuft-Loop), `src/render/Textures.ts` (grass), `src/render/Materials.ts`
- `tuftGeo`: statt 7 Kegel → ~18 dünne, gebogene Halme (3-Segment-Streifen, Spitze verjüngt) mit Vertexfarben (dunkel unten → hell oben).
- Dichte: ~90 → ~420 Büschel pro Chunk in 3 Größen-Klassen (kurzes Gras, hohes Gras, Gras-Cluster), Windschwingung per `onBeforeCompile` (Vertex-Sinus, billig).
- Neue Instanz-Gruppen: Wildblumen (Stiel + Blüte, 5 Farben), Klee-/Blattflecken (flache Blatt-Quads), kleine Farne/Büsche (vorhandene `bushGeo` skaliert).
- Bodentextur `grass`: mehr Detail (Halm-Striche, Erdflecken, Farbwolken).

## 3. Keine Lkw/Container auf der Straße — [MODIFY] `src/world/CityGenerator.ts`
- Zeilen 674–675 (Lkw auf Stadtstraßen) entfernen.
- Zeilen 676–679 (`detail-dumpster-closed` + Paletten am Gehweg) entfernen.
- `src/world/Rural.ts` (Raststätte Z.33–35, Industrieplatz Z.49): Lkw/Container ebenfalls entfernen, damit nirgends mehr welche stehen. (Bitte bestätigen, siehe Frage unten.)
- Müllcontainer im Hinterhof (CityGenerator ~Z.500) bleibt, da nicht auf der Straße.

## 4. Eigene Bäume, Optik wie bisher — [NEW] `src/render/TreeMesh.ts`, [MODIFY] `src/render/TreeSprite.ts`, `src/world/ChunkBuilder.ts`
- Bisher: 14 Sprite-Arten aus `public/trees.png`. Neu: echte 3D-Bäume, prozedural erzeugt (Stamm mit Rinde + Ästen, Laub aus vielen gekreuzten Blatt-Karten/Klumpen mit Vertexfarben-Verlauf), in denselben Arten und Proportionen (Höhe `treeCellHeight`, Artgewichte, Stadt-Filter `town`).
- Pro Art eine geteilte Geometrie, `InstancedMesh` je Art (günstig), Schatten über die bestehenden Schattenkreise.
- Farben aus dem Atlas gemessen (Mittelwert je Art), damit sie wie die jetzigen aussehen. Atlas bleibt als Referenz/Fallback.
- `buildTreeSprites(...)`-Aufruf bleibt API-kompatibel (`buildTrees`), nur Innenleben wechselt. Kollider unverändert.

## 5. Charakter: Realistischer, Kleidung mit Bewegung — [MODIFY] `src/render/Character.ts`
- Körperteile weicher: Beine/Arme als sich verjüngende, nahtlos verbundene Lathe-Geometrien statt getrennter Zylinder + Kugel-Gelenke; Hände mit Fingerblock + Daumen; Schuhe mit Kappe/Sohle.
- Gesicht: Augenlider, Nasenrücken, Lippen, bessere Haare (Strähnenkarten statt Kappe).
- Texturen: Canvas-Texturen für Stoff (Jeans-Köper, Jacken-Nähte, Falten-Bump), Haut (Farbvarianz), Leder (Schuhe); Normal-/Bumpmaps.
- Kleidung die sich bewegt: Jacken-/Hoodie-Saum und Parka-Schöße als eigene Gelenke, die in `animateCharacter` verzögert (Feder/Nachschwingen) auf Hüft-/Beinbewegung reagieren; lose Kordeln, Kapuze, Hosenbeine mit Schwung. Neue Outfits: Kleid (Rock mit mehreren Segmenten, wehend), Hemd, T-Shirt.
- Kompatibilität: `createCharacter`, `dressCharacter`, `animateCharacter`, `swingCharacter`, `workCharacter`, `createZombie` behalten Signatur (genutzt von `PlayerController`, `Npc`, `ZombieWorld`, `Game`).

## 6. Prüfung
- `npx tsc --noEmit`, `npx vitest run`, Dev-Server starten und per Screenshot Stadt, Gras, Bäume, Charakter kontrollieren; FPS-Check.

## Offene Fragen
1. Lkw/Container auch in Raststätte und Industrie entfernen (Rural.ts) — oder nur in der Stadt?
2. Kleid: für alle Charaktere als Auswahl im `CharacterCreator` oder nur als Kleidungsstück im Inventar?

## Freigabe
Antworte **„Yes"** (plus Antworten auf 1+2), dann lege ich `task.md` an und führe aus.
