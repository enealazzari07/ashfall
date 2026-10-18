# Plan: Mehr Automodelle, saubere Karosserie (Dach, Türen, Radkästen)

## Probleme im Ist-Zustand (`src/render/CarModel.ts`)
- **Dach "fliegt"**: Die Dachplatte ist breiter als die Scheiben, die Säulen sind lose Balken und treffen das Dach nicht.
- **Türen sitzen nicht richtig**: Die Türplatte liegt 2,5 cm außerhalb der Karosserie und ist nicht bündig. Unten bleibt ein Spalt.
- **Keine Radkästen**: Die Räder stecken in der Seitenwand, es gibt keine Aussparung.
- Es gibt nur ein einziges Modell (eine Limousine).

## Umsetzung

### Parametrische Modelle (`CAR_MODELS` in `CarModel.ts`)
Jedes Modell ist ein Datensatz (Länge, Breite, Achsen, Raddurchmesser, Gürtellinie, Dachhöhe, Hauben-/Heckform, Türen, Sitzreihen). 7 Stück:
1. **Limousine** (4 Türen, 5 Sitze, Kofferraum)
2. **Kompakt / Steilheck** (kurz, 4 Türen, Heckklappe)
3. **Coupé** (2 lange Türen, flaches Dach, 2+2 Sitze)
4. **SUV / Geländewagen** (hoch, große Räder, 5 Sitze)
5. **Kleinbus** (hoch, 3 Sitzreihen = 7 Sitze, kurze Nase)
6. **Pick-up** (Kabine + offene Ladefläche)
7. **Kombi** (lang, 4 Türen, Heck mit Ladefläche)

### Neue Karosserie (gilt für alle Modelle)
- **Seitenhaut** als eigene dünne Platte je Seite (aus dem Seitenprofil gebaut) mit **echten Radausschnitten** (Bogen um das Rad) und **Türöffnungen** vorn. Dahinter dunkle Radhaus-Verkleidung → sichtbare Einhöhlung.
- **Türen bündig**: Türplatte genau in der Fläche der Seitenhaut, schmale Fuge, Scharnier vorn, Innenverkleidung dunkel. Hintertüren sind Blech mit Fugen und Griffen (nicht öffnbar).
- **Dach sauber**: Dachplatte exakt auf der Dachlinie, A-, B- und C-Säulen als Balken genau zwischen Fußpunkt und Dachkante, Scheiben passen in die Silhouette. Nichts schwebt.
- Räder sitzen leicht eingerückt im Radkasten.
- Motorhaube, Kofferraum/Heckklappe, Stoßstangen, Spiegel, Scheinwerfer an die Maße des Modells angepasst. Verformung und abfallende Teile funktionieren weiter.
- **Innenraum je Modell**: Sitzreihen (2–3), Armaturenbrett, Lenkrad, Dachhimmel.

### Einbau
- `Car` bekommt `model`, die Erzeugung (Stadt, Autobahn, Parkplätze) wählt zufällig ein Modell.
- Parkende Autos: Instanzen pro Modell. `takeCar` im `ChunkManager` passt dazu.
- `Vehicle` nutzt Länge/Breite/Achsstand des Modells (Kollisionskreise, Lenkung).
- `Game`: Einstieg/Tür-Position aus dem Modell, Kollisionsboxen nach Maßen.
- Tests: Alle Modelle bauen, Maße/Radausschnitte stimmen, Fahrphysik je Modell.

## Reihenfolge
1. Modelltabelle + Geometrie-Generator (Haut mit Radbögen/Türlöchern, Dach/Säulen, Türen, Innenraum)
2. Rig mit Deformation/Teilen auf den Generator umstellen
3. Parkende Autos pro Modell, `model` in der Welt, `Vehicle`-Maße
4. Browser-Check aller 7 Modelle (Test-Parkplatz), Tests

## Freigabe
Antworte **"Yes"** oder nenne Änderungen (andere Modelle, mehr/weniger Typen).
