import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';

/**
 * Nube de polvo que levantan las ruedas al correr.
 *
 * Solo emite con Shift y por encima de cierta velocidad: es el regalo visual de
 * ir rapido. Cada mota nace en el punto de contacto de una rueda trasera, sale
 * despedida hacia atras, se eleva, crece y se desvanece.
 *
 * Mezcla normal y no aditiva: el polvo marciano TAPA lo que hay detras, no
 * brilla. Con mezcla aditiva se veria como chispas.
 */

// Muchas motas pequeñas y tenues, no pocas y gordas: una nube de polvo se lee
// por ACUMULACION de particulas que se solapan. Con pocas y grandes se ven las
// bolas una a una y parece espuma.
const CAPACITY = 1400;
const LIFE_MIN = 0.7;
const LIFE_MAX = 1.9;

const vertexShader = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  varying float vAlpha;

  void main() {
    vAlpha = aAlpha;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (320.0 / max(-viewPosition.z, 0.001));
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;
    // borde suave: una mota de polvo no tiene contorno
    float soft = smoothstep(0.5, 0.06, r);
    gl_FragColor = vec4(uColor, vAlpha * soft);
  }
`;

export function createPlume() {
  const rand = mulberry32(1234);

  const positions = new Float32Array(CAPACITY * 3);
  const velocities = new Float32Array(CAPACITY * 3);
  const alphas = new Float32Array(CAPACITY);
  const sizes = new Float32Array(CAPACITY);
  const age = new Float32Array(CAPACITY);
  const life = new Float32Array(CAPACITY);

  // life = 0 marca "libre"
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xdcb085) } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.name = 'polvareda';

  let cursor = 0;
  let alive = 0;
  let pending = 0; // motas acumuladas entre frames, para no depender del fps

  /**
   * Pide polvo a lo largo del TRAMO que recorrio la rueda en este frame.
   *
   * Que sea un tramo y no un punto es lo que separa una nube de un reguero de
   * grumos: a 21 m/s la rueda avanza mas de un metro entre frames, y emitir
   * todo en la posicion instantanea deja bolsas de polvo separadas, con el
   * hueco vacio entre ellas. Repartiendolas por el tramo, el rastro es continuo
   * a cualquier velocidad — el mismo arreglo que necesitaron las huellas.
   */
  function emit(from, to, pushX, pushZ, rate, dt) {
    pending += rate * dt;
    const count = Math.floor(pending);
    pending -= count;

    for (let n = 0; n < count; n++) {
      const i = cursor;
      cursor = (cursor + 1) % CAPACITY;
      if (life[i] === 0) alive++;

      const t = rand();
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      const z = from.z + (to.z - from.z) * t;

      positions[i * 3 + 0] = x + (rand() - 0.5) * 1.3;
      positions[i * 3 + 1] = y + rand() * 0.3;
      positions[i * 3 + 2] = z + (rand() - 0.5) * 1.3;

      // Dispersion lateral amplia: si solo salen despedidas hacia atras, el
      // rastro queda en dos carriles rectos y se nota el truco.
      const spread = 3.0;
      velocities[i * 3 + 0] = pushX * (0.4 + rand() * 0.8) + (rand() - 0.5) * spread;
      velocities[i * 3 + 1] = 1.0 + rand() * 2.2;
      velocities[i * 3 + 2] = pushZ * (0.4 + rand() * 0.8) + (rand() - 0.5) * spread;

      age[i] = 0;
      life[i] = LIFE_MIN + rand() * (LIFE_MAX - LIFE_MIN);
      sizes[i] = 0.7 + rand() * 0.6;
      alphas[i] = 0;
    }
  }

  function update(dt) {
    let living = 0;

    for (let i = 0; i < CAPACITY; i++) {
      if (life[i] === 0) continue;

      age[i] += dt;
      if (age[i] >= life[i]) {
        life[i] = 0;
        alphas[i] = 0;
        sizes[i] = 0;
        continue;
      }

      living++;
      const t = age[i] / life[i];

      positions[i * 3 + 0] += velocities[i * 3 + 0] * dt;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;

      // El aire frena la mota y la deja flotando mientras se deshace.
      const drag = Math.exp(-2.2 * dt);
      velocities[i * 3 + 0] *= drag;
      velocities[i * 3 + 2] *= drag;
      velocities[i * 3 + 1] = velocities[i * 3 + 1] * drag - 0.35 * dt;

      // Crece al expandirse y se apaga. La opacidad por mota es baja a
      // proposito: la densidad la da el solape, no cada particula.
      sizes[i] = 0.8 + t * 3.2;
      alphas[i] = 0.12 * Math.min(1, t * 8) * (1 - t) * (1 - t);
    }

    alive = living;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aAlpha.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
  }

  return {
    points,
    emit,
    update,
    get alive() {
      return alive;
    },
    capacity: CAPACITY,
  };
}
