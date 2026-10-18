import * as THREE from 'three';
import { valueNoise2 } from '../core/noise.js';

/**
 * Fobos y Deimos.
 *
 * APROXIMACION DECLARADA: ambas estan sobredimensionadas a proposito.
 * A escala real, desde la superficie de Marte, Fobos se ve como un tercio del
 * ancho de nuestra Luna y Deimos es poco mas que una estrella brillante — en
 * una captura de 1600 px serian practicamente invisibles. Se agrandan para que
 * se lean en pantalla. Las formas irregulares si son fieles: ninguna de las dos
 * es esferica, son cuerpos pequeños sin gravedad suficiente para redondearse.
 *
 * Coherente con la regla del README: aproximar esta permitido, disfrazarlo de
 * dato real no.
 */

/** Cuerpo irregular: icosfera desplazada en dos escalas de ruido. */
function irregularBody(radius, detail, seed, amount) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const d = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    d.copy(v).normalize();
    const n1 = valueNoise2(d.x * 2.4 + 5, d.z * 2.4 + d.y * 1.9, seed);
    const n2 = valueNoise2(d.x * 7.1 + 29, d.z * 7.1 + d.y * 5.3, seed + 3);
    const k = 1 + (n1 - 0.5) * amount + (n2 - 0.5) * amount * 0.4;
    pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }

  geo.computeVertexNormals();
  return geo;
}

const BODIES = [
  {
    name: 'Fobos',
    radius: 78,
    position: [-1231, 1250, -3965],
    seed: 13,
    amount: 0.3,
    color: 0xbaa492,
  },
  {
    name: 'Deimos',
    radius: 40,
    position: [-2121, 1170, -4509],
    seed: 29,
    amount: 0.26,
    color: 0xc5b09c,
  },
];

export function createMoons() {
  const group = new THREE.Group();
  group.name = 'lunas';
  const names = [];

  for (const body of BODIES) {
    const mat = new THREE.MeshStandardMaterial({
      color: body.color,
      roughness: 1.0,
      metalness: 0.0,
      // CRITICO: con la niebla activa, a 4 km de distancia quedarian
      // completamente borradas por la bruma. La niebla es para el terreno.
      fog: false,
    });

    const mesh = new THREE.Mesh(irregularBody(body.radius, 3, body.seed, body.amount), mat);
    mesh.position.set(...body.position);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = body.name;

    group.add(mesh);
    names.push(body.name);
  }

  return { group, names };
}
