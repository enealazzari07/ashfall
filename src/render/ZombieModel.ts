import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Zombies aus `zombie_2.glb` (Skelett, 11 Animationen, Texturen je Körperteil).
 * Jeder Zombie bekommt eigene Materialien: Hauttöne, Kleidungsfarben, Blutflecken (Shader), eigene Größe und Gangart.
 */

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || './';

interface Template {
  scene: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
  /** Maßstab und Fußversatz, damit die Figur 1,8 m hoch auf y = 0 steht */
  k: number;
  offset: THREE.Vector3;
}

let tpl: Template | null = null;
let started: Promise<void> | null = null;

export const zombieModelReady = (): boolean => tpl !== null;

export function preloadZombieModel(): Promise<void> {
  if (started) return started;
  if (typeof document === 'undefined') return (started = Promise.resolve());
  return (started = new Promise<void>((resolve) => {
    new GLTFLoader().load(
      `${BASE}models/zombie_2.glb`,
      (gltf) => {
        try {
          tpl = prepare(gltf);
        } catch (e) {
          console.warn('zombie_2.glb konnte nicht vorbereitet werden', e);
        }
        resolve();
      },
      undefined,
      () => resolve(),
    );
  }));
}

function prepare(gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] }): Template {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh) m.skeleton.update();
  });
  const box = new THREE.Box3().setFromObject(scene, true);
  const h = box.max.y - box.min.y;
  const k = 1.78 / (h > 0 ? h : 1.78);
  const offset = new THREE.Vector3(-(box.max.x + box.min.x) / 2, -box.min.y, -(box.max.z + box.min.z) / 2);
  const clips = new Map<string, THREE.AnimationClip>();
  for (const c of gltf.animations) clips.set(c.name, c);
  return { scene, clips, k, offset };
}

/** Zufall aus einer Zahl */
const rngOf = (seed: number) => {
  let s = (seed >>> 0) || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
};

const SKIN_TONES = [0xb7c2a4, 0xa9b59a, 0x9fa88f, 0xc4c9b0, 0x8f9a86, 0xb0a99a, 0x9db0a8, 0xa7a28a];
const CLOTH_TONES = [0x3a4a66, 0x56603f, 0x6b6e75, 0x5a4636, 0x23262c, 0xd6d0c0, 0xb8b09a, 0x2f4a3c, 0x6a2c2c, 0x7d8aa0, 0x4b4b3a, 0xc9b27a];

/** Blutflecken und Schmutz als Shader-Erweiterung: Muster aus UV-Rauschen, je Material eigener Startwert */
function addBlood(m: THREE.MeshStandardMaterial, seed: number, amount: number, tint: THREE.Color | null): void {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSeed = { value: seed };
    sh.uniforms.uBlood = { value: amount };
    sh.uniforms.uTint = { value: tint ? new THREE.Vector3(tint.r, tint.g, tint.b) : new THREE.Vector3(1, 1, 1) };
    sh.uniforms.uRecolor = { value: tint ? 1 : 0 };
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uSeed; uniform float uBlood; uniform vec3 uTint; uniform float uRecolor;
        float zh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float zn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(zh(i), zh(i+vec2(1,0)), f.x), mix(zh(i+vec2(0,1)), zh(i+vec2(1,1)), f.x), f.y); }
        float zf(vec2 p){ return 0.55*zn(p) + 0.3*zn(p*2.3+7.1) + 0.15*zn(p*5.1+3.3); }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          float luma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(luma * 1.35) * uTint, uRecolor);
          vec2 q = vMapUv * 6.0 + vec2(uSeed * 13.7, uSeed * 7.3);
          float b = zf(q);
          float splat = smoothstep(0.72 - uBlood * 0.1, 0.82 - uBlood * 0.08, b) * 0.6;
          float dry = smoothstep(0.5, 0.75, zf(q * 0.6 + 11.0)) * 0.5;
          vec3 blood = mix(vec3(0.16, 0.12, 0.09), vec3(0.08, 0.07, 0.06), dry); // Schmutz statt Blutflecken: Blut liegt nur als Lache am Boden
          diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - dry * uBlood * 0.5), blood, splat * 0.9);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'zblood';
  m.needsUpdate = true;
}

interface ZState {
  mixer: THREE.AnimationMixer;
  actions: Record<'idle' | 'walk' | 'limp' | 'run', THREE.AnimationAction>;
  cur: THREE.AnimationAction | null;
  walkBias: 'walk' | 'limp';
  pace: number;
  roots: { bone: THREE.Object3D; pos: THREE.Vector3 }[];
}

/** Zombie aus dem GLB; null, solange das Modell nicht geladen ist */
export function createZombieModel(seed: number): THREE.Group | null {
  if (!tpl) return null;
  // jeder neunte (Typ "tank") ist der schwere Zombie, sobald dessen Modell geladen ist
  if (Math.abs(Math.floor(seed)) % 9 === 8 && big) return createBigZombie(seed);
  const rnd = rngOf(Math.abs(Math.floor(seed)) * 2654435761 + 12345);
  const root = new THREE.Group();
  const inner = cloneSkinned(tpl.scene);
  const wrap = new THREE.Group();
  wrap.add(inner);
  inner.position.copy(tpl.offset);
  wrap.scale.setScalar(tpl.k);
  root.add(wrap);

  // Eigene Materialien je Zombie
  const skin = new THREE.Color(SKIN_TONES[Math.floor(rnd() * SKIN_TONES.length)]);
  const cloth = new THREE.Color(CLOTH_TONES[Math.floor(rnd() * CLOTH_TONES.length)]);
  const cloth2 = new THREE.Color(CLOTH_TONES[Math.floor(rnd() * CLOTH_TONES.length)]);
  const blood = 0.25 + rnd() * 0.75;
  const bseed = rnd() * 50;
  let torsoMat: THREE.MeshStandardMaterial | null = null;
  inner.traverse((o) => {
    const me = o as THREE.SkinnedMesh;
    if (!me.isSkinnedMesh) return;
    me.castShadow = true;
    me.receiveShadow = true;
    me.frustumCulled = false;
    const src = me.material as THREE.MeshStandardMaterial;
    const m = src.clone();
    const nm = src.name;
    let tint: THREE.Color | null = null;
    if (nm === 'HEAD2' || nm === 'HANDS') m.color.copy(skin);
    else if (nm === 'TorsoA2' || nm === 'ArmsA2') tint = cloth;
    else if (nm === 'LegsA2') tint = cloth2;
    m.roughness = 0.9;
    m.metalness = 0;
    addBlood(m, bseed + (nm.length % 7), blood, tint);
    if (nm === 'TorsoA2') torsoMat = m;
    me.material = m;
    if (nm === 'CasualBrownShoes' && rnd() < 0.35) me.visible = false; // barfuß (Füße gehören zum Beingitter)
  });
  void torsoMat;

  // Statur
  const h = 0.92 + rnd() * 0.2;
  const w = (0.9 + rnd() * 0.22) * (rnd() < 0.12 ? 1.18 : 1);
  root.scale.set(w, h, w);

  // Animationen
  const mixer = new THREE.AnimationMixer(inner);
  const get = (n: string): THREE.AnimationAction => {
    const clip = tpl!.clips.get(n) ?? tpl!.clips.get('walk')!;
    const a = mixer.clipAction(clip);
    a.enabled = true;
    return a;
  };
  const actions = { idle: get(rnd() < 0.5 ? 'ZombieIdleB' : 'idle'), walk: get('walk'), limp: get('ZombieLimpWalkHandsOut'), run: get('run') };
  for (const a of Object.values(actions)) {
    a.setEffectiveWeight(0);
    a.play();
    a.time = rnd() * a.getClip().duration;
  }
  // Wurzelbewegung der Clips wird unterdrückt (Zombie läuft über die Spielwelt, nicht über die Animation)
  const roots: ZState['roots'] = [];
  inner.traverse((o) => {
    if (o.name === 'Bip01' || o.name === 'Bip01_Pelvis') roots.push({ bone: o, pos: o.position.clone() });
  });
  const st: ZState = { mixer, actions, cur: null, walkBias: rnd() < 0.35 ? 'limp' : 'walk', pace: 0.85 + rnd() * 0.3, roots };
  root.userData.glbZ = st;
  return root;
}

/** Gangart nach Tempo wählen, weich überblenden und die Animation vorrücken */
export function animateZombieModel(g: THREE.Object3D, speed: number, dt: number, lunge: number): void {
  if (g.userData.bigZ) return animateBigZombie(g, speed, dt, lunge);
  const st = g.userData.glbZ as ZState | undefined;
  if (!st) return;
  const want = speed < 0.12 ? st.actions.idle : speed > 2.3 ? st.actions.run : st.actions[st.walkBias];
  if (want !== st.cur) {
    st.cur = want;
  }
  // inaktive Aktionen ausblenden
  for (const a of Object.values(st.actions)) {
    if (a === want) a.setEffectiveWeight(Math.min(1, a.getEffectiveWeight() + dt * 4));
    else a.setEffectiveWeight(Math.max(0, a.getEffectiveWeight() - dt * 4));
  }
  const natural = want === st.actions.run ? 3.4 : 1.1;
  want.timeScale = want === st.actions.idle ? 1 : Math.min(2.2, Math.max(0.5, (speed / natural) * st.pace + lunge * 0.3));
  st.mixer.update(dt);
  for (const r of st.roots) r.bone.position.copy(r.pos);
}


// --- Schwerer Zombie aus `zombie_game_character.glb` (Mixamo-Skelett, ohne Animationen, große Texturen) ---------------

interface BigTemplate { scene: THREE.Object3D; k: number; offset: THREE.Vector3 }
let big: BigTemplate | null = null;
let bigStarted: Promise<void> | null = null;

export const bigZombieReady = (): boolean => big !== null;

/** Verkleinert eine Textur auf höchstens `max` Pixel Kantenlänge (spart Grafikspeicher) */
function shrink(t: THREE.Texture | null, max: number): void {
  if (!t || !t.image) return;
  const img = t.image as { width: number; height: number };
  const sc = Math.min(1, max / Math.max(img.width, img.height));
  if (sc >= 1) return;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * sc));
  c.height = Math.max(1, Math.round(img.height * sc));
  c.getContext('2d')!.drawImage(t.image as CanvasImageSource, 0, 0, c.width, c.height);
  (t.image as { close?: () => void }).close?.();
  t.image = c;
  t.needsUpdate = true;
}

/** Lädt das große Modell im Hintergrund (42 MB), ohne den Spielstart zu blockieren */
export function preloadBigZombie(): Promise<void> {
  if (bigStarted) return bigStarted;
  if (typeof document === 'undefined') return (bigStarted = Promise.resolve());
  return (bigStarted = new Promise<void>((resolve) => {
    new GLTFLoader().load(
      `${BASE}models/zombie_game_character.glb`,
      (gltf) => {
        try {
          const scene = gltf.scene;
          scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            const mat = m.material as THREE.MeshStandardMaterial;
            for (const t of [mat.map, mat.normalMap, mat.metalnessMap, mat.roughnessMap, mat.aoMap, mat.emissiveMap]) shrink(t, 1024);
          });
          scene.updateMatrixWorld(true);
          scene.traverse((o) => {
            const m = o as THREE.SkinnedMesh;
            if (m.isSkinnedMesh) m.skeleton.update();
          });
          const box = new THREE.Box3().setFromObject(scene, true);
          const h = box.max.y - box.min.y;
          big = {
            scene,
            k: 1.9 / (h > 0 ? h : 1.9),
            offset: new THREE.Vector3(-(box.max.x + box.min.x) / 2, -box.min.y, -(box.max.z + box.min.z) / 2),
          };
        } catch (e) {
          console.warn('zombie_game_character.glb konnte nicht vorbereitet werden', e);
        }
        resolve();
      },
      undefined,
      () => resolve(),
    );
  }));
}

interface BigState { bones: Record<string, THREE.Object3D>; rest: Record<string, THREE.Quaternion>; t: number; pace: number; style: number }
const BIG_BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg'];

export function createBigZombie(seed: number): THREE.Group | null {
  if (!big) return null;
  const rnd = rngOf(Math.abs(Math.floor(seed)) * 40503 + 99);
  const root = new THREE.Group();
  const inner = cloneSkinned(big.scene);
  const wrap = new THREE.Group();
  wrap.add(inner);
  inner.position.copy(big.offset);
  wrap.scale.setScalar(big.k);
  root.add(wrap);
  const skin = new THREE.Color(SKIN_TONES[Math.floor(rnd() * SKIN_TONES.length)]).lerp(new THREE.Color(0xffffff), 0.35);
  const blood = 0.3 + rnd() * 0.7;
  const bseed = rnd() * 50;
  inner.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh) return;
    me.castShadow = true;
    me.receiveShadow = true;
    me.frustumCulled = false;
    const m = (me.material as THREE.MeshStandardMaterial).clone();
    if (m.name.startsWith('01') || m.name.startsWith('04')) m.color.copy(skin);
    m.roughness = Math.max(m.roughness, 0.8);
    m.metalness = 0;
    addBlood(m, bseed + m.name.length, blood, null);
    me.material = m;
  });
  const bones: Record<string, THREE.Object3D> = {};
  const rest: Record<string, THREE.Quaternion> = {};
  inner.traverse((o) => {
    for (const n of BIG_BONES) {
      if (o.name.startsWith(`mixamorig${n}_`) || o.name.startsWith(`mixamorig:${n}_`)) {
        bones[n] = o;
        rest[n] = o.quaternion.clone();
      }
    }
  });
  const w = 1.05 + rnd() * 0.2;
  root.scale.set(w, 0.97 + rnd() * 0.1, w);
  root.userData.bigZ = { bones, rest, t: rnd() * 10, pace: 0.8 + rnd() * 0.3, style: Math.floor(rnd() * 3) } as BigState;
  return root;
}

const AX = new THREE.Vector3(1, 0, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const qTmp = new THREE.Quaternion();
const rot = (st: BigState, name: string, x: number, z = 0): void => {
  const b = st.bones[name];
  if (!b) return;
  b.quaternion.copy(st.rest[name]);
  if (x) b.quaternion.multiply(qTmp.setFromAxisAngle(AX, x));
  if (z) b.quaternion.multiply(qTmp.setFromAxisAngle(AZ, z));
};

/** Gehen als Pendelbewegung der Mixamo-Gelenke: Arme nach vorn, Oberkörper gebeugt, Kopf hängt */
export function animateBigZombie(g: THREE.Object3D, speed: number, dt: number, lunge: number): void {
  const st = g.userData.bigZ as BigState | undefined;
  if (!st) return;
  const a = Math.min(1, speed / 1.2);
  st.t += dt * (1.6 + speed * 2.2) * st.pace;
  const s = Math.sin(st.t), c = Math.cos(st.t);
  rot(st, 'LeftUpLeg', s * 0.55 * a);
  rot(st, 'RightUpLeg', -s * 0.55 * a);
  rot(st, 'LeftLeg', Math.max(0, -c) * 0.8 * a);
  rot(st, 'RightLeg', Math.max(0, c) * 0.8 * a);
  const reach = 1.35 + 0.4 * lunge;
  rot(st, 'LeftArm', -reach + s * 0.1);
  rot(st, 'RightArm', -reach - s * 0.1);
  rot(st, 'LeftForeArm', -0.2);
  rot(st, 'RightForeArm', -0.25);
  rot(st, 'Spine', 0.1 + 0.08 * lunge);
  rot(st, 'Spine1', 0.08);
  rot(st, 'Head', 0.18 + Math.sin(st.t * 0.4) * 0.05);
}
