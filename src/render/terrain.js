import * as THREE from 'three';
import { heightAt } from '../core/terrain-height.js';
import { applySandColors, sandMaterial } from './sand.js';

// Reexportado para no romper a quien ya lo importaba desde aqui. La definicion
// vive en el nucleo porque la capa de simulacion tambien la necesita.
export { heightAt };

export const TERRAIN_SIZE = 6000;
const SEGMENTS = 360;

/**
 * Terreno lejano: 6 km con celdas de 16,7 m.
 *
 * LLEVA UN AGUJERO, y es la pieza clave. Con celdas de 16,7 m esta malla no
 * puede representar ni las ondulaciones de viento (9 m de onda) ni las dunas
 * menores (33 m): las interpola en linea recta y se queda hasta 2 m POR ENCIMA
 * de la superficie real en algunos sitios.
 *
 * Ahi estaba el origen de tres sintomas que parecian independientes:
 *   - manchas lisas sin grano, como charcos, que eran esta malla asomando
 *     por encima del parche de detalle
 *   - huellas que desaparecian, enterradas bajo esas manchas
 *   - llantas que atravesaban el suelo, porque la fisica usa la superficie
 *     real y lo dibujado estaba mas alto
 *
 * Ninguna cantidad de polygonOffset arregla eso: no es z-fighting, la malla
 * gruesa esta genuinamente delante. Lo que se hace es recortarla — descartar
 * sus fragmentos dentro del area que cubre el parche de detalle — para que
 * ahi solo exista la superficie buena.
 */
export function createTerrain() {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();
  applySandColors(geo);

  // Uniformes compartidos por referencia: mutando .value se mueve el agujero.
  const holeCenter = { value: new THREE.Vector2(0, 0) };
  const holeHalf = { value: 0 }; // 0 = sin agujero

  const material = sandMaterial();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHoleCenter = holeCenter;
    shader.uniforms.uHoleHalf = holeHalf;

    // La malla esta en el origen sin transformar, asi que position.xz ya son
    // coordenadas de mundo.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vTerrainXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vTerrainXZ = position.xz;');

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vTerrainXZ;\nuniform vec2 uHoleCenter;\nuniform float uHoleHalf;',
      )
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\n  if (uHoleHalf > 0.0 && abs(vTerrainXZ.x - uHoleCenter.x) < uHoleHalf && abs(vTerrainXZ.y - uHoleCenter.y) < uHoleHalf) discard;',
      );
  };

  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  // No proyecta sombra: el frustum de sombras solo cubre 60 m alrededor del
  // rover, y esa zona esta siempre dentro del parche de detalle. Dejarla
  // proyectar significaria proyectar desde una superficie equivocada.
  mesh.castShadow = false;
  mesh.name = 'dunas-lejanas';

  /** Mueve el recorte. `half` en metros; 0 lo desactiva. */
  function setHole(x, z, half) {
    holeCenter.value.set(x, z);
    holeHalf.value = half;
  }

  return { mesh, setHole };
}
