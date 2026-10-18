import * as THREE from 'three';

export const SKY_RADIUS = 9000;

/** Caramelo del horizonte. La niebla de la escena debe ir pegada a este valor. */
export const HORIZON_COLOR = 0xdf9a5e;
export const ZENITH_COLOR = 0x5d3826;

const vertexShader = /* glsl */ `
  varying vec3 vDir;

  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uSunDir;

  varying vec3 vDir;

  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, -1.0, 1.0);

    // Gradiente vertical: caramelo abajo, ocre profundo en el cenit.
    float t = pow(clamp(1.0 - max(h, 0.0), 0.0, 1.0), 2.1);
    vec3 col = mix(uZenith, uHorizon, t);

    // Banda de polvo suspendido pegada al horizonte: mas clara y mas densa.
    float band = exp(-abs(h) * 11.0);
    col += uHorizon * band * 0.38;

    // Angulo al sol. Se usa el angulo y no pow(dot) porque a estas escalas el
    // coseno pierde precision en float y el disco solar sale con bordes sucios.
    float ang = acos(clamp(dot(dir, normalize(uSunDir)), -1.0, 1.0));

    // Dispersion amplia por el polvo atmosferico. El cono se mantiene estrecho
    // a proposito: abierto a 83 grados blanqueaba medio encuadre y se perdia
    // el caramelo, que es el color que define esta escena.
    col += vec3(1.0, 0.72, 0.42) * (1.0 - smoothstep(0.0, 1.05, ang)) * 0.18;

    // Halo cercano.
    col += vec3(1.0, 0.80, 0.52) * (1.0 - smoothstep(0.0, 0.30, ang)) * 0.32;

    // Disco solar, difuminado por el polvo en suspension. Contenido: el sol de
    // Marte recibe menos de la mitad de luz que el de la Tierra y ademas lo
    // filtra una atmosfera cargada de polvo. No es un foco blanco.
    col += vec3(1.0, 0.91, 0.76) * (1.0 - smoothstep(0.009, 0.015, ang)) * 2.6;

    // Bajo el horizonte se mantiene el color de la bruma, para que el terreno
    // lejano se disuelva en el cielo sin una costura visible.
    col = mix(col, uHorizon * 0.9, 1.0 - smoothstep(-0.06, 0.0, h));

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createSky(sunDir) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uHorizon: { value: new THREE.Color(HORIZON_COLOR) },
      uZenith: { value: new THREE.Color(ZENITH_COLOR) },
      uSunDir: { value: sunDir.clone() },
    },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 64, 40), mat);
  mesh.renderOrder = -1000; // se pinta primero, todo lo demas va encima
  mesh.frustumCulled = false;
  mesh.name = 'cielo';

  return mesh;
}
