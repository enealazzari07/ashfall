import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GameTime } from '../core/Time';
import { Weather } from './Weather';

const NIGHT = new THREE.Color(0x0a1022);
const DAY = new THREE.Color(0xa9c8e4);
const DUSK = new THREE.Color(0xe0a27a);
const GREY = new THREE.Color(0x7a8088);
const WARM = new THREE.Color(0xffc690);
const NOON = new THREE.Color(0xfff4e2);
const MOON = new THREE.Color(0x8fa6d8);

export class Lighting {
  readonly sun = new THREE.DirectionalLight(0xffffff, 2);
  readonly hemi = new THREE.HemisphereLight(0xbcd7ff, 0x4a4234, 0.5);
  /** Kühles Aufhelllicht von der Schattenseite (ohne Schatten): Schatten bleiben weich und farbig statt grau-schwarz */
  readonly fill = new THREE.DirectionalLight(0xaec6ff, 0);
  /** Schwaches Umgebungslicht um den Spieler (nachts / im Haus), damit man nicht im Schwarzen steht */
  readonly lantern = new THREE.PointLight(0xffc27a, 0, 14, 1.8);
  /** Taschenlampe: Lichtkegel in Blickrichtung */
  readonly flashlight = new THREE.SpotLight(0xfff1d6, 0, 26, 0.5, 0.45, 1.4);
  private sky = new THREE.Color();
  private fog: THREE.Fog;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    const c = this.sun.shadow.camera;
    c.left = c.bottom = -38;
    c.right = c.top = 38;
    c.near = 1;
    c.far = 160;
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.bias = -0.0005;
    this.flashlight.shadow.camera.near = 0.3;
    scene.add(this.fill.target);
    scene.add(this.sun, this.sun.target, this.hemi, this.fill, this.lantern, this.flashlight, this.flashlight.target);

    // Bildbasiertes Umgebungslicht: weiche Reflexionen und realistischere Materialien
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.fog = new THREE.Fog(0x9cb4cc, 70, 190);
    scene.fog = this.fog;
  }

  /** 0..1: wie weit der Spieler gerade "im Haus" ist (weiche Blende für das Innenlicht) */
  private inside = 0;
  /** 0 = Tag, 1 = Nacht – für Laternen */
  night = 0;

  update(
    scene: THREE.Scene, time: GameTime, weather: Weather, focus: THREE.Vector3, indoors = false,
    light?: { on: boolean; yaw: number },
  ): void {
    const a = time.dayFraction * Math.PI * 2 - Math.PI / 2;
    const elev = Math.sin(a);
    const day = Math.max(0, elev);
    const dim = 1 - weather.clouds * 0.6;
    // Morgen-/Abendrot: Sonne wird nahe am Horizont warm
    const low = Math.max(0, 1 - day * 3.2);
    const night = 1 - Math.min(1, day * 3);
    this.night = night;

    if (day > 0.02) {
      // Sonne: flacher Winkel morgens/abends -> lange Schatten
      this.sun.position.set(focus.x + Math.cos(a) * 60, focus.y + Math.max(elev, 0.18) * 60, focus.z + 25);
      this.sun.color.copy(NOON).lerp(WARM, low);
      this.sun.intensity = (0.5 + 3.4 * Math.min(1, day * 1.6)) * dim;
    } else {
      // Mond: kühles, schwaches Licht von schräg oben
      this.sun.position.set(focus.x - 30, focus.y + 50, focus.z - 20);
      this.sun.color.copy(MOON);
      this.sun.intensity = 0.35 * (1 - weather.clouds * 0.7);
    }
    this.sun.target.position.copy(focus);
    this.hemi.intensity = 0.2 + 0.35 * day * (0.6 + 0.4 * dim);
    this.hemi.color.setHex(0xbcd7ff).lerp(MOON, night);
    // Bodenfarbe der Hemisphäre nimmt die Sonnenfarbe als Rückstrahlung auf (warm bei Abendsonne)
    this.hemi.groundColor.setHex(0x4a4234).lerp(WARM, low * (1 - night) * 0.25);
    // Fülllicht gegenüber der Sonne; nachts aus
    this.fill.position.set(focus.x - (this.sun.position.x - focus.x), focus.y + 30, focus.z - (this.sun.position.z - focus.z));
    this.fill.target.position.copy(focus);
    this.fill.intensity = 0.55 * day * (0.5 + 0.5 * dim);
    this.fill.color.setHex(0xaec6ff).lerp(DUSK, low * 0.5);
    scene.environmentIntensity = 0.1 + 0.3 * Math.min(1, day * 2) * (0.7 + 0.3 * dim);

    // Im Haus liegt das Dach im Schatten – ein warmes Innenlicht folgt dem Spieler
    this.inside += ((indoors ? 1 : 0) - this.inside) * 0.08;
    this.lantern.position.set(focus.x, focus.y + 2.4, focus.z);
    this.lantern.intensity = 10 * Math.max(night * 0.6, this.inside * 0.8);

    const fl = light?.on ? 1 : 0;
    this.flashlight.intensity += (fl * 90 - this.flashlight.intensity) * 0.25;
    // Licht bleibt immer in der Szene (nur Intensität ändert sich), sonst kompilieren alle Shader neu
    if (light) {
      const dx = Math.sin(light.yaw), dz = Math.cos(light.yaw);
      this.flashlight.position.set(focus.x + dx * 0.35, focus.y + 1.25, focus.z + dz * 0.35);
      this.flashlight.target.position.set(focus.x + dx * 9, 0, focus.z + dz * 9);
    }

    this.sky.copy(NIGHT).lerp(DAY, Math.min(1, day * 2.5)).lerp(DUSK, low * (1 - night) * 0.55);
    this.sky.lerp(GREY.clone().multiplyScalar(0.25 + 0.75 * Math.min(1, day * 2)), weather.clouds * 0.75);
    scene.background = this.sky;
    this.fog.color.copy(this.sky);
    this.fog.near = 70 - 35 * weather.rain;
    this.fog.far = 190 - 90 * weather.rain;
  }
}
