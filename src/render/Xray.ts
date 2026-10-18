import * as THREE from 'three';

/**
 * Sichtfenster wie in Project Zomboid: Alles, was zwischen Kamera und Spielfigur liegt
 * (Dächer, Wände, Bäume, Zugwaggons), wird in einem Kreis um die Figur ausgeblendet.
 * Draußen vor einem Haus bleibt es komplett geschlossen – nur wer dahinter steht, "scheint durch".
 */
const uniforms = {
  uXrayPos: { value: new THREE.Vector3() },
  uXrayR: { value: 3.8 },
};

const GLSL = /* glsl */ `
  {
    vec3 xv = -vXrayView;
    float xd = length(xv.xy - uXrayPos.xy);
    if (xd < uXrayR && xv.z > uXrayPos.z + 0.7) {
      float a = smoothstep(uXrayR * 0.4, uXrayR, xd);
      float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      if (a < n) discard;
    }
  }
`;

/** Bindet das Sichtfenster in einen Shader ein (eigene Varying, funktioniert mit jedem Standard-Material). */
function inject(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.uniforms.uXrayPos = uniforms.uXrayPos;
  shader.uniforms.uXrayR = uniforms.uXrayR;
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', 'varying vec3 vXrayView;\nvoid main() {')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvXrayView = mvPosition.xyz;');
  shader.fragmentShader = shader.fragmentShader.replace(
    'void main() {',
    `uniform vec3 uXrayPos;\nuniform float uXrayR;\nvarying vec3 vXrayView;\nvoid main() {\n${GLSL}`,
  );
}

export function applyXray<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = inject;
  mat.customProgramCacheKey = () => 'xray';
  mat.userData.xray = true;
  return mat;
}

/** Größe des Sichtfensters (Meter); im Auto größer, damit das Fahrzeug nicht unter Dächern verschwindet */
export function setXrayRadius(r: number): void {
  uniforms.uXrayR.value = r;
}

export function isXray(mat: THREE.Material): boolean {
  return mat.userData.xray === true;
}

const tmp = new THREE.Vector3();

/** Pro Frame aufrufen: Spielerposition (Torsohöhe) in den View-Space der Kamera übertragen. */
export function updateXray(camera: THREE.Camera, player: THREE.Vector3): void {
  camera.updateMatrixWorld();
  uniforms.uXrayPos.value.copy(tmp.set(player.x, player.y + 1, player.z).applyMatrix4(camera.matrixWorldInverse));
}
