import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { heightAt } from '../core/terrain-height.js';

/**
 * Camara orbital anclada al rover.
 *
 * El rover esta SIEMPRE en el centro: el objetivo de la orbita se mueve con el
 * y la camara se desplaza el mismo vector, asi que el angulo y la distancia que
 * elige el usuario se conservan mientras conduce.
 *
 * Arrastrar con el raton orbita. La rueda acerca y aleja, desde 3 m — distancia
 * de inspeccion de piezas — hasta 220 m. Hasta que el usuario toca el raton, la
 * camara se coloca sola detras del rover; con la tecla C vuelve ahi.
 *
 * TODO el trabajo se hace en coordenadas ESFERICAS alrededor del rover, y esa
 * es la leccion que costo un fallo: la version anterior recolocaba la camara
 * calculando un punto "detras, a esta distancia y a 3,6 m de altura", pero le
 * pasaba la distancia 3D como si fuera la horizontal. El punto destino quedaba
 * siempre un poco mas lejos que el actual — sqrt(d^2 + h^2) > d — y al repetirlo
 * cada frame la camara se alejaba sola, medio metro cada diez segundos, hasta
 * dejar el rover convertido en un punto. En esfericas el radio sencillamente no
 * se toca.
 */

const START_HORIZONTAL = 11; // metros por detras
const START_HEIGHT = 3.6; // metros por encima del punto de mira
const LOOK_HEIGHT = 1.4; // a que altura del rover se centra la orbita
const MIN_CLEARANCE = 0.8; // la camara no se mete bajo la arena

/** Interpola angulos por el camino corto. */
function approachAngle(current, goal, t) {
  let difference = goal - current;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  return current + difference * t;
}

export function createOrbitRig(camera, domElement) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 220;
  controls.minPolarAngle = 0.1;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.enablePan = false; // el centro es el rover, no se desplaza
  controls.rotateSpeed = 0.8;
  controls.zoomSpeed = 0.9;

  let manual = false;
  controls.addEventListener('start', () => {
    manual = true;
  });

  const target = new THREE.Vector3();
  const previous = new THREE.Vector3();
  const delta = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const spherical = new THREE.Spherical();

  let initialised = false;

  function update(dt, rover) {
    target.set(rover.x, rover.y + LOOK_HEIGHT, rover.z);

    if (!initialised) {
      // Detras del rover: forward = (-sin yaw, 0, -cos yaw), asi que "detras"
      // es (sin yaw, 0, cos yaw), cuyo azimut en esfericas es exactamente yaw.
      camera.position.set(
        target.x + Math.sin(rover.yaw) * START_HORIZONTAL,
        target.y + START_HEIGHT,
        target.z + Math.cos(rover.yaw) * START_HORIZONTAL,
      );
      controls.target.copy(target);
      previous.copy(target);
      controls.update();
      initialised = true;
      return;
    }

    // Solidaria con el rover: mismo desplazamiento para objetivo y camara. Esto
    // por si solo ya conserva radio y angulos exactamente.
    delta.subVectors(target, previous);
    camera.position.add(delta);
    controls.target.copy(target);
    previous.copy(target);

    offset.subVectors(camera.position, target);
    spherical.setFromVector3(offset);

    if (!manual) {
      // Solo se corrige el AZIMUT para quedar detras del rover. El radio y la
      // elevacion no se tocan, asi que el zoom del usuario sobrevive.
      spherical.theta = approachAngle(spherical.theta, rover.yaw, 1 - Math.exp(-2.5 * dt));
      offset.setFromSpherical(spherical);
      camera.position.copy(target).add(offset);
    }

    // Si la camara se hunde en una duna, se levanta cerrando el angulo polar
    // en vez de subir la Y a pelo: subir la Y cambiaria el radio y volveriamos
    // a tener una camara que se aleja sola.
    const floor = heightAt(camera.position.x, camera.position.z) + MIN_CLEARANCE;
    if (camera.position.y < floor) {
      offset.subVectors(camera.position, target);
      spherical.setFromVector3(offset);
      const wanted = Math.acos(
        THREE.MathUtils.clamp((floor - target.y) / spherical.radius, -1, 1),
      );
      spherical.phi = Math.min(spherical.phi, wanted);
      offset.setFromSpherical(spherical);
      camera.position.copy(target).add(offset);
    }

    controls.update();
  }

  /** Vuelve a colocarse detras del rover y reanuda el seguimiento automatico. */
  function recenter() {
    manual = false;
  }

  return {
    controls,
    update,
    recenter,
    get distance() {
      return camera.position.distanceTo(controls.target);
    },
    get manual() {
      return manual;
    },
  };
}
