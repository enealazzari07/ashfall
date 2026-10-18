import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { isXray, applyXray } from './Xray';
import { RAYS, Vision } from './Vision';

/**
 * GTAO, dessen Normalen-/Tiefenpass das Sichtfenster (Xray) respektiert.
 * Statt eines globalen Override-Materials bekommt jedes Mesh ein passendes Normalen-Material.
 */
class XrayGTAOPass extends GTAOPass {
  private variants = new Map<string, THREE.MeshNormalMaterial>();
  private swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  private hidden: THREE.Object3D[] = [];

  private variant(src: THREE.Material): THREE.MeshNormalMaterial {
    const key = `${isXray(src)}|${src.side}`;
    let m = this.variants.get(key);
    if (!m) {
      m = new THREE.MeshNormalMaterial({ side: src.side, blending: THREE.NoBlending });
      if (isXray(src)) applyXray(m);
      this.variants.set(key, m);
    }
    return m;
  }

  override renderOverride(
    renderer: THREE.WebGLRenderer, _mat: THREE.MeshNormalMaterial, target: THREE.WebGLRenderTarget, clearColor: number, clearAlpha: number,
  ): void {
    this.scene.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      // Halbtransparentes (Lichtkegel, Glühen, Geister) trägt nicht zur Verdeckung bei
      if (mat.transparent || mat.blending === THREE.AdditiveBlending || mesh.userData.noAO) {
        this.hidden.push(mesh);
        return;
      }
      this.swapped.push([mesh, mesh.material]);
      mesh.material = this.variant(mat);
    });
    for (const o of this.hidden) o.visible = false;
    const prevColor = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevAuto = renderer.autoClear;
    renderer.setRenderTarget(target);
    renderer.autoClear = false;
    renderer.setClearColor(clearColor, clearAlpha);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = prevAuto;
    renderer.setClearColor(prevColor, prevAlpha);
    for (const o of this.hidden) o.visible = true;
    for (const [mesh, mat] of this.swapped) mesh.material = mat;
    this.swapped.length = this.hidden.length = 0;
  }
}

/** Farbkorrektur: Kontrast, Sättigung, Tönung nach Tageszeit, Vignette, leichtes Filmkorn. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uSat: { value: 1.08 },
    uContrast: { value: 1.1 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.025 },
    uTime: { value: 0 },
    // Sichtfeld
    uVisOn: { value: 0 },
    uInvVP: { value: new THREE.Matrix4() },
    uPlane: { value: 1 },
    uPlayer: { value: new THREE.Vector2() },
    uFacing: { value: 0 },
    uRange: { value: 18 },
    uCone: { value: new THREE.Vector4(1.22, 0.21, 3, 0.3) }, // halber Winkel, weicher Rand, Rundumradius, Restlicht
    uRay: { value: new Float32Array(RAYS) },
    uSpots: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uTint;
    uniform float uSat, uContrast, uVignette, uGrain, uTime;
    uniform float uVisOn, uPlane, uFacing, uRange;
    uniform mat4 uInvVP;
    uniform vec2 uPlayer;
    uniform vec4 uCone;
    uniform float uRay[${RAYS}];
    uniform vec3 uSpots[4];
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float clearance(float a) {
      float f = mod(a, 6.2831853) / 6.2831853 * ${RAYS}.0;
      int i = int(floor(f)); int j = i + 1; if (j >= ${RAYS}) j = 0; if (i >= ${RAYS}) i = 0;
      return min(uRay[i], uRay[j]);
    }
    // Sichtbarkeit des Bodenpunkts hinter diesem Pixel (Ebene in Torsohöhe), gleiche Rechnung wie Vision.visibility()
    float visibility() {
      vec4 n = uInvVP * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
      vec4 f = uInvVP * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
      vec3 p0 = n.xyz / n.w, p1 = f.xyz / f.w;
      float t = (uPlane - p0.y) / (p1.y - p0.y);
      vec3 w = p0 + (p1 - p0) * t;
      vec2 dd = w.xz - uPlayer;
      float d = length(dd);
      // aufgehellte Stellen, etwa ein Zombie nach seinem Angriff
      float spot = 0.0;
      for (int i = 0; i < 4; i++) spot = max(spot, uSpots[i].z * (1.0 - smoothstep(0.9, 2.6, length(w.xz - uSpots[i].xy))));
      if (d < 0.25) return 1.0;
      float a = atan(dd.x, dd.y);
      float free = clearance(a + 6.2831853);
      // Wandflächen ragen in der Ansicht über die Ebene hinaus: ihre Oberseiten fallen hinter die Wand, daher Spielraum
      float reach = 1.0 - smoothstep(free - 0.2, free + 1.4, d);
      float off = abs(mod(a - uFacing + 3.1415927, 6.2831853) - 3.1415927);
      float cone = 1.0 - smoothstep(uCone.x, uCone.x + uCone.y, off);
      float inRange = 1.0 - smoothstep(uRange * 0.8, uRange, d);
      float near = 1.0 - smoothstep(uCone.z * 0.7, uCone.z, d);
      return max(max(cone * inRange, near) * reach, spot);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * uTint;
      if (uVisOn > 0.5) {
        float v = visibility();
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        // außerhalb: dunkler, entsättigt, leicht bläulich
        vec3 dark = mix(vec3(lum), col, 0.45) * vec3(0.9, 0.95, 1.1) * uCone.w;
        col = mix(dark, col, v);
      }
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.18) * uContrast + 0.18;
      vec2 d = vUv - 0.5;
      col *= 1.0 - uVignette * smoothstep(0.25, 0.85, length(d * vec2(1.25, 1.0)));
      col += (hash(vUv * 1000.0 + uTime) - 0.5) * uGrain * (0.4 + l);
      gl_FragColor = vec4(max(col, 0.0), c.a);
    }
  `,
};

export class PostFX {
  readonly composer: EffectComposer;
  private gtao: XrayGTAOPass;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  enabled = true;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));

    this.gtao = new XrayGTAOPass(scene, camera, size.x, size.y);
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.6, thickness: 1.5, scale: 1.1, samples: 12 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.composer.addPass(this.gtao);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.35, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setSize(w: number, h: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  /** night: 0..1, clouds: 0..1 – steuert Bloom und Farbstimmung. */
  update(night: number, clouds: number, time: number): void {
    const u = this.grade.uniforms;
    u.uTime.value = time % 100;
    // Tag: leicht warm; Nacht: kühles Blau; Bewölkt: entsättigt
    (u.uTint.value as THREE.Color).setRGB(1.02 - 0.12 * night, 1.0 - 0.04 * night, 0.97 + 0.1 * night);
    u.uSat.value = 1.1 - 0.25 * clouds - 0.25 * night;
    u.uVignette.value = 0.3 + 0.2 * night;
    this.bloom.strength = 0.22 + 0.5 * night;
  }

  /** Sichtfeld an den Shader geben (nach dem Kameraupdate des Frames aufrufen) */
  setVision(v: Vision, camera: THREE.Camera, planeY: number): void {
    const u = this.grade.uniforms;
    // Das Sichtfeld läuft auch bei abgeschalteter Nachbearbeitung (Qualitätsstufe im Haus, niedrige Grafik)
    u.uVisOn.value = v.enabled ? 1 : 0;
    if (!u.uVisOn.value) return;
    camera.updateMatrixWorld();
    (u.uInvVP.value as THREE.Matrix4).multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
    u.uPlane.value = planeY;
    (u.uPlayer.value as THREE.Vector2).set(v.x, v.z);
    u.uFacing.value = v.facing;
    u.uRange.value = v.range;
    (u.uCone.value as THREE.Vector4).set(v.params.coneHalf, v.params.coneSoft, v.params.nearR, v.params.dim);
    (u.uRay.value as Float32Array).set(v.rays);
    const spots = u.uSpots.value as THREE.Vector3[];
    for (let i = 0; i < 4; i++) {
      const s = v.spots[i];
      spots[i].set(s ? s.x : 0, s ? s.z : 0, s ? s.k : 0);
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const vision = this.grade.uniforms.uVisOn.value > 0.5;
    // Ohne volle Nachbearbeitung laufen nur Rendern, Ausgabe und Farbpass (mit Sichtfeld); AO und Bloom sind dann aus
    this.gtao.enabled = this.bloom.enabled = this.enabled;
    if (this.enabled || vision) this.composer.render();
    else this.renderer.render(scene, camera);
  }
}
