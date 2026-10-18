import * as THREE from 'three';
import { crestnessAt, grainAt } from '../core/terrain-height.js';

/**
 * Coloreado de la arena, compartido por el terreno lejano y el parche de
 * detalle cercano.
 *
 * Vive aparte justamente para que lo compartan: son dos mallas distintas que
 * se tocan, y si cada una calculara su color por su cuenta la costura entre
 * ambas seria visible como un cambio de tono.
 */
const CREST = new THREE.Color(0xc2884f);
const TROUGH = new THREE.Color(0x6b3d23);

export function applySandColors(geometry) {
  const pos = geometry.attributes.position;
  const nrm = geometry.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);

    // Las crestas barridas por el viento quedan claras; las laderas y los
    // valles en sombra, oscuros.
    const slope = Math.min(1, (1 - nrm.getY(i)) * 3.0);
    let t = crestnessAt(x, z) * 0.7 + grainAt(x, z) * 0.3 - slope * 0.45;
    t = Math.max(0, Math.min(1, t));

    tmp.copy(TROUGH).lerp(CREST, t);
    colors[i * 3 + 0] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export function sandMaterial(extra = {}) {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.0,
    dithering: true,
    ...extra,
  });
}
