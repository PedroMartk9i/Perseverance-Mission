import * as THREE from 'three';

/**
 * Sol de tarde avanzada: elevacion de ~11 grados, azimut 48 grados a la
 * derecha del rumbo del rover.
 *
 * La elevacion baja es deliberada: a 11 grados, la sombra de una roca mide
 * cinco veces su altura. Eso es lo que produce las sombras largas que dibujan
 * el relieve de las dunas. Se subio desde 8.6 grados al bajar la amplitud del
 * terreno: un sol tan rasante sobre un terreno mas plano dejaba la escena
 * entera en penumbra.
 *
 * El azimut lateral tambien es deliberado. Con el sol justo delante, las lunas
 * quedarian a contraluz y se verian como manchas negras; a 48 grados de lado
 * reciben luz rasante y se leen como cuerpos con fase, que es mas bonito y
 * ademas correcto.
 *
 * Tarde, no atardecer: el cielo marciano real es caramelo de dia y se vuelve
 * AZUL junto al sol en el crepusculo. "Cielo caramelo con sol calido" solo es
 * coherente antes de la puesta.
 */
export const SUN_DIR = new THREE.Vector3(0.7294, 0.1908, -0.6568).normalize();

export const SUN_COLOR = 0xffb480;

/** Distancia a la que se coloca la luz direccional respecto a su foco. */
export const SUN_DISTANCE = 300;

export function createLighting(scene, focus = new THREE.Vector3()) {
  const sun = new THREE.DirectionalLight(SUN_COLOR, 3.4);
  sun.position.copy(SUN_DIR).multiplyScalar(SUN_DISTANCE).add(focus);
  sun.castShadow = true;

  sun.shadow.mapSize.set(2048, 2048);
  // El frustum cubre 140 m alrededor del rover y SIGUE al rover (ver main.js).
  // Antes eran 600 m porque la camara miraba desde 26 m de altura; con el
  // vehiculo a 3 m, ese tamaño gastaba casi todo el mapa de sombras en terreno
  // que no se ve.
  const d = 60;
  sun.shadow.camera.left = -d;
  sun.shadow.camera.right = d;
  sun.shadow.camera.top = d;
  sun.shadow.camera.bottom = -d;
  sun.shadow.camera.near = SUN_DISTANCE * 0.4;
  sun.shadow.camera.far = SUN_DISTANCE * 1.8;
  // VSM no necesita el bias negativo del PCF; con el aparecen sombras despegadas.
  sun.shadow.bias = 0;
  sun.shadow.normalBias = 0.5; // imprescindible sobre una malla desplazada
  sun.shadow.radius = 2.5; // suaves, pero no tanto como para borrar las rocas
  sun.shadow.blurSamples = 8;

  sun.target.position.copy(focus);
  scene.add(sun);
  scene.add(sun.target);

  // Relleno: el cielo caramelo rebotando desde arriba y la arena desde abajo.
  // Sin esto las zonas en sombra quedarian negras y no hay nada menos
  // atmosferico que una sombra negra en un planeta con atmosfera.
  // A 0.95 el relleno levantaba tanto las sombras que las rocas dejaban de
  // proyectar nada legible. 0.62 mantiene la sombra viva sin volverla negra.
  const bounce = new THREE.HemisphereLight(0xe8a775, 0x4a2a18, 0.80);
  scene.add(bounce);

  return { sun, bounce };
}
