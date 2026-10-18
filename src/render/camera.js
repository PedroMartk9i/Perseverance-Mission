import * as THREE from 'three';

/**
 * 56 grados de campo: gran angular de paisaje. Tambien es lo que permite que
 * quepan en la misma toma el sol (azimut 48) y las dos lunas por la izquierda.
 */
export const FOV = 56;

export function createCamera() {
  return new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.5, 25000);
}
