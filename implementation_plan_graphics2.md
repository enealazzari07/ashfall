# Plan: Grafik-Runde 2 (Regale, Möbel, Material, Licht)

Schon erledigt in diesem Schritt: Wangen schwächer (Kiefer glatter), Haare aus ~190 feinen, verjüngten Bändern statt dicker Stäbe; Vorschau geprüft.

## Befund
- Regalinhalt (`Props.ts: items()`, `Furniture.ts: shelf()`) sind zufällige Quader/Zylinder in **einer** Farbe: Bücher ohne Rücken/Seiten, Kartons ohne Klebeband, Dosen ohne Rand/Etikett.
- Möbel (`Parts.box`) sind harte Quader mit flacher Vertexfarbe, ohne Fasen, ohne Maserung.
- Texturen sind kleine Canvas-Kacheln (128–256 px) mit Rauschen; Fenster ohne Rahmen-Tiefe.

## Änderungen

### 1. Regale, Bücher, Kartons, Dosen — [MODIFY] `src/world/Props.ts`, `src/world/Furniture.ts`
- Buch: Deckel + hellere Seitenkante (Seiten) + farbiger Rücken mit Streifen; unterschiedliche Höhen/Dicken, einzelne Bücher lehnen schief, Reihen mit Lücken, manche liegen gestapelt.
- Karton: Klappen oben, Klebeband-Streifen, Etikett, leicht verdreht, auch gestapelt.
- Dosen/Flaschen/Gläser als Drehkörper (Lathe) mit Etikettband, Deckel, Hals; Dosen in Pyramiden/Reihen.
- Mehr Ordnung statt Zufall: je Regalbrett ein Thema (Bücher / Konserven / Kartons).

### 2. Möbel — [MODIFY] `Props.ts`, `Furniture.ts`
- `RoundedBoxGeometry` mit kleinen Fasen statt harter Quader; Holzmaserung über Vertexfarben-Rauschen je Fläche; Griffe, Scharniere, Füße; Matratzen/Kissen gewölbt.

### 3. Materialien — [MODIFY] `src/render/Textures.ts`, `Materials.ts`
- Wand, Boden, Asphalt, Dach: 512-px-Texturen mit feinerem Detail, Normal-/Roughness-Karte, Nässe (Pfützen) bei Regen schon vorhanden → verfeinern.
- Fensterglas: leichte Spiegelung, Rahmen mit Tiefe, Sprossen.

### 4. Licht und Stimmung — [MODIFY] `src/world/Lighting.ts`, `PostFX.ts`
- Weichere Schattenkanten, Sonnenstand-abhängige Farbtemperatur, leichter Tiefennebel, bessere Dämmerung.

### 5. Weitere Objekte — [MODIFY] `CarModel.ts`, `ChunkBuilder.ts`
- Autos: Spiegel, Scheibenwischer, Nummernschild; Laternen und Zäune mit Fasen und Detail.

## Prüfung
`tsc`, `vitest`, Vorschau mit Screenshots (Regal, Zimmer, Straße), danach exe neu bauen.

## Freigabe
Antworte **„Yes"** (alles) oder nenne, womit ich anfangen soll (z. B. „nur 1 und 2").
