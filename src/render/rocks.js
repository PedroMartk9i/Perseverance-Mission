import * as THREE from 'three';
import { valueNoise2 } from '../core/noise.js';
import { rockField } from '../core/rock-field.js';

/**
 * Dibuja el campo de rocas. NO decide donde estan: eso lo hace
 * core/rock-field.js, que es tambien quien consulta la simulacion para chocar.
 * Una sola lista para los dos, o el rover chocaria con piedras invisibles.
 */

/**
 * Geometria de roca: icosaedro con los vertices desplazados por ruido.
 *
 * El desplazamiento se calcula a partir de la POSICION del vertice y no de un
 * random: IcosahedronGeometry no esta indexada, asi que un vertice compartido
 * aparece duplicado por cada cara. Con un random cada copia se iria por su
 * lado y la roca se rompería en facetas sueltas.
 */
function rockGeometry(detail, seed, amount) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n1 = valueNoise2(v.x * 2.3 + 7, v.z * 2.3 + v.y * 1.8, seed);
    const n2 = valueNoise2(v.x * 6.9 + 31, v.z * 6.9 + v.y * 5.1, seed + 3);
    const k = 1 + (n1 - 0.5) * amount + (n2 - 0.5) * amount * 0.35;
    // El 0.74 en Y achata la roca: las rocas se asientan, no son pelotas.
    pos.setXYZ(i, v.x * k, v.y * k * 0.74, v.z * k);
  }

  geo.computeVertexNormals();
  return geo;
}

export function createRocks() {
  const variants = [
    { geo: rockGeometry(1, 3, 0.5), flat: true },
    { geo: rockGeometry(2, 9, 0.52), flat: false },
    { geo: rockGeometry(2, 21, 0.64), flat: false },
  ];

  const buckets = variants.map(() => []);
  for (const rock of rockField.rocks) buckets[rock.variant].push(rock);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const color = new THREE.Color();

  const meshes = [];

  variants.forEach((variant, index) => {
    const list = buckets[index];
    if (list.length === 0) return;

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff, // blanco: el color real llega por instancia
      roughness: 0.9,
      metalness: 0.0,
      flatShading: variant.flat,
    });

    const mesh = new THREE.InstancedMesh(variant.geo, material, list.length);

    list.forEach((rock, i) => {
      position.set(rock.x, rock.y, rock.z);
      euler.set(rock.rotX, rock.rotY, rock.rotZ);
      quaternion.setFromEuler(euler);
      scale.set(rock.scaleX, rock.scaleY, rock.scaleZ);

      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);

      // Basalto marciano: ocres oscuros con algo de variacion.
      color.setHSL(rock.hue, rock.saturation, rock.lightness);
      mesh.setColorAt(i, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // el bounding de la geometria no cubre instancias
    mesh.name = `rocas-${index + 1}`;

    meshes.push(mesh);
  });

  return { meshes, total: rockField.total, blocking: rockField.blocking };
}
