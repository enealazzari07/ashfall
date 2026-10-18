import * as THREE from 'three';
import type { Emitter } from '../world/CityGenerator';

const PER_EMITTER = 22;

/** Gemeinsame Werte für alle Rauchfelder; Game setzt sie pro Frame. */
export const smokeUniforms = {
  uTime: { value: 0 },
  uPx: { value: 20 },
  uWind: { value: new THREE.Vector2(1.2, 0.5) },
  uNight: { value: 0 },
};

const material = new THREE.ShaderMaterial({
  uniforms: smokeUniforms,
  transparent: true,
  depthWrite: false,
  vertexShader: /* glsl */ `
    attribute float aPhase;
    attribute float aKind;
    uniform float uTime;
    uniform float uPx;
    uniform vec2 uWind;
    varying float vAlpha;
    varying float vKind;
    varying float vLife;
    void main() {
      float speed = mix(0.11, 0.2, aKind);
      float life = fract(uTime * speed + aPhase);
      float rise = mix(6.0, 2.4, aKind);
      vec3 p = position;
      p.y += life * rise;
      p.xz += uWind * life * life * mix(4.5, 1.6, aKind)
            + vec2(sin(aPhase * 40.0 + life * 5.0), cos(aPhase * 31.0 + life * 4.0)) * life * 0.5;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      float size = mix(0.5, 2.6, life) * mix(1.0, 0.3, aKind);
      gl_PointSize = size * uPx;
      vAlpha = (1.0 - life) * smoothstep(0.0, 0.07, life) * mix(0.6, 0.3, aKind);
      vKind = aKind;
      vLife = life;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uNight;
    varying float vAlpha;
    varying float vKind;
    varying float vLife;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.05, d) * vAlpha;
      if (a < 0.01) discard;
      vec3 smoke = mix(vec3(0.16, 0.16, 0.18), vec3(0.42, 0.42, 0.45), vLife);
      vec3 steam = vec3(0.92, 0.94, 0.97);
      vec3 col = mix(smoke, steam, vKind);
      col *= mix(1.0, 0.35, uNight);
      gl_FragColor = vec4(col, a);
    }
  `,
});

/** Rauch und Dampf aus Schornsteinen, Lüftungen und Klimageräten; wird komplett im Vertex-Shader animiert. */
export function createSmoke(emitters: Emitter[]): THREE.Points | null {
  if (!emitters.length) return null;
  const n = emitters.length * PER_EMITTER;
  const pos = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  const kind = new Float32Array(n);
  emitters.forEach((e, i) => {
    for (let k = 0; k < PER_EMITTER; k++) {
      const j = i * PER_EMITTER + k;
      pos.set([e.x, e.y, e.z], j * 3);
      phase[j] = k / PER_EMITTER + ((i * 0.37) % 1) * 0.05;
      kind[j] = e.kind === 'steam' ? 1 : 0;
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  const pts = new THREE.Points(geo, material);
  pts.frustumCulled = false;
  pts.userData.ownGeo = true;
  pts.renderOrder = 5;
  return pts;
}
