import * as THREE from 'three';
import { heightAt } from '../core/terrain-height.js';
import { applySandColors, sandMaterial } from './sand.js';

/**
 * Parche de terreno de alta resolucion que sigue al rover.
 *
 * EL PROBLEMA QUE RESUELVE: el terreno lejano son 6 km con 360 divisiones, o
 * sea cuadros de 16,7 m. La suspension del rover, en cambio, evalua la funcion
 * de altura EXACTA. Donde el triangulo gordo queda por encima de la curva
 * real, el suelo atraviesa el rover; y las huellas, que se colocan sobre la
 * curva exacta, quedan enterradas bajo la malla.
 *
 * No son dos fallos: es el mismo. La malla visible y la superficie fisica no
 * eran la misma cosa. Este parche las reconcilia donde importa — alrededor del
 * rover — con cuadros de 1 m, que es resolucion de sobra para las ondulaciones
 * metricas de la arena.
 *
 * Se reconstruye solo cuando el rover se aleja del centro, no cada frame.
 */

const SIZE = 170; // metros de lado
const SEGMENTS = 170; // 1 m por cuadro
const REBUILD_DISTANCE = 14; // cuanto puede alejarse el rover antes de rehacerlo
const SNAP = 2; // el centro se ajusta a una rejilla, para que no "nade"

export function createDetailTerrain() {
  const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
  geometry.rotateX(-Math.PI / 2);

  const material = sandMaterial({
    // Gana el z-fight contra el terreno lejano, que en esta zona es menos
    // preciso y deberia quedar debajo.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.name = 'dunas-detalle';

  // Posiciones base del plano, antes de desplazarlas. Se guardan porque hay
  // que reusarlas en cada reconstruccion.
  const base = geometry.attributes.position.array.slice();

  let centerX = Number.NaN;
  let centerZ = Number.NaN;
  let rebuilds = 0;

  function rebuild(cx, cz) {
    const pos = geometry.attributes.position;
    const array = pos.array;

    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3 + 0] + cx;
      const z = base[i * 3 + 2] + cz;
      array[i * 3 + 0] = x;
      array[i * 3 + 1] = heightAt(x, z);
      array[i * 3 + 2] = z;
    }

    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    applySandColors(geometry);
    geometry.computeBoundingSphere();

    centerX = cx;
    centerZ = cz;
    rebuilds++;
  }

  function update(x, z) {
    const dx = x - centerX;
    const dz = z - centerZ;

    if (Number.isNaN(centerX) || dx * dx + dz * dz > REBUILD_DISTANCE * REBUILD_DISTANCE) {
      rebuild(Math.round(x / SNAP) * SNAP, Math.round(z / SNAP) * SNAP);
    }
  }

  return {
    mesh,
    update,
    /** Centro actual del parche, para recortar ahi el terreno lejano. */
    get centerX() {
      return centerX;
    },
    get centerZ() {
      return centerZ;
    },
    get rebuilds() {
      return rebuilds;
    },
    get resolution() {
      return SIZE / SEGMENTS;
    },
    size: SIZE,
  };
}
