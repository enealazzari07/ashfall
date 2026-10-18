# Plan: Sichtfeld (Sichtkegel wie Project Zomboid)

Ziel: Nur nach vorne und zu den Seiten ist es hell und man sieht alles (auch durch Fenster ins Haus, auch Zombies). Hinten und hinter Wänden ist es abgedunkelt, Zombies/NPCs sind dort unsichtbar. Man „sieht, wo man hinschaut“.

## Befund (Recherche)
- Blickrichtung: `player.mesh.rotation.y` (Figur blickt +z), Kamera ist orthographisch (`Game.ts`).
- Sichtlinie existiert schon: `ChunkManager.lineClear()` (Wände mit `sight: true`, geschlossene Türen); Außenwände haben Lücken an Fenstern → Strahlen gehen durch Fenster, Sicht ins Haus funktioniert damit automatisch.
- Zombie-Sichtkegel für die KI existiert (`ZombieAI.ts`, 140°, `visionRange()`), aber nur für die KI, nicht für die Darstellung.
- Nachbearbeitung läuft über `PostFX.ts` (`GradeShader`); Sichtfenster der Dächer ist `Xray.ts` (bleibt unberührt).

## Änderungen

### [NEW] `src/render/Vision.ts`
- `class Vision`: pro Frame (20 Hz) 128 Strahlen um den Spieler, je Strahl Entfernung bis zur ersten Sicht-Wand (Strahl-gegen-Box-Schnitt statt Schrittprobe, günstig) begrenzt auf `visionRange(night, rain, clouds)` (+ Taschenlampe).
- Sichtform: Kegel ±70° nach vorn (weicher Rand ±10°), zusätzlich Rundumsicht ~3 m (hört/spürt man hinten), beides durch Wände begrenzt.
- `sees(x, z): boolean` für Zombies, NPCs, Autos usw. (gleiche Logik wie im Shader).
- Aus/Ein-Schalter, Sichtkegel abgeschaltet beim Fahren? (Standard: bleibt an, Kegel zeigt in Fahrtrichtung.)

### [MODIFY] `src/world/ChunkManager.ts`
- Neu: `sightRays(x, z, level, range, out: Float32Array, n)` – sammelt Wände im Umkreis einmal und schneidet n Strahlen.

### [MODIFY] `src/render/PostFX.ts`
- `GradeShader` bekommt Uniforms: `uInvVP`, `uPlayer`, `uFacing`, `uRay[128]`, `uCone`, `uDim`. Pro Pixel: Bodenpunkt (Ebene in Torsohöhe) aus der Kamera zurückrechnen, Winkel zum Spieler → Strahlentabelle → Sichtbarkeit 0..1 (weicher Rand) → Helligkeit `mix(uDim, 1, vis)`, außerhalb leicht entsättigt/bläulich.
- `PostFX.setVision(...)` zum Setzen der Uniforms.

### [MODIFY] `src/core/Game.ts`
- Pro Frame: `vision.update(...)`, danach `fx.setVision(...)`; nicht aktiv beim Tod/Schlafen/Hauptmenü.
- Zombies und NPCs: `mesh.visible = vision.sees(x, z)` (Leichen ebenso); Loot-Marker außerhalb ebenfalls ausblenden.

### [MODIFY] `src/world/ZombieWorld.ts`, `src/factions/FactionWorld.ts`
- Sichtbarkeit je Figur pro Frame setzen (Zombies hinter dir sind unsichtbar, nur Geräusch/Warnung bleibt).

### [MODIFY] `src/ui/MainMenu.ts` (Optionen) + Settings
- Schalter „Sichtfeld“ (an/aus) und Regler „Abdunklung außerhalb“.

### [NEW] `tests/vision.test.ts`
- Kegel vorne sichtbar, hinten nicht (außer Nahbereich), Wand blockiert, Lücke (Fenster) lässt durch.

## Annahmen (bitte sagen, falls anders)
- Kegel 140° vorn, 3 m Rundumsicht, außerhalb ~30 % Helligkeit (nicht komplett schwarz, damit man sich orientieren kann).
- Gebäude/Gelände bleiben außerhalb leicht sichtbar (wie „erinnert“), Figuren dort nicht.

## Freigabe
Antworte **„Yes"** (oder nenne Änderungen: Winkel, Dunkelheit, komplett schwarz außerhalb).
