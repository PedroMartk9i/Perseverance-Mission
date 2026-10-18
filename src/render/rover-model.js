import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { WHEEL_RADIUS } from '../sim/rover.js';

/**
 * Carga del modelo oficial de Perseverance publicado por la NASA.
 *
 * Fuente: nasa/NASA-3D-Resources (dominio publico, "free and without
 * copyright"). Se descarga con `npm run fetch:model`, no se versiona.
 * Credito: NASA/JPL-Caltech.
 */

export const MODEL_URL = '/models/perseverance.glb';
export const MODEL_CREDIT = 'NASA/JPL-Caltech';

/** Medidas reales publicadas por NASA, en metros. */
export const REAL_SIZE = { length: 3.0, width: 2.7, height: 2.2 };

/**
 * Familias de camara reales del rover. Perseverance lleva 23 camaras.
 * El patron se aplica a los nombres de nodo del glTF.
 */
const CAMERA_PATTERN = /cam|mast|nav|haz|sherloc|watson|supercam|rmi|pixl|cache|lens|optic/i;

/**
 * Herrajes que casan con el patron pero no sirven para montar una vista:
 * soportes, tapas, cableado y numeros de parte del despiece de ingenieria.
 * Se separan en vez de descartarse — siguen siendo contexto util.
 */
const HARDWARE_PATTERN = /bracket|cover|wiring|mount|^\d{6,}|_\d{5,}/i;

/** Para qué sirve cada familia, cuando el nombre la delata. */
const FAMILY_NOTES = [
  [/mastcam/i, 'Mastcam-Z — camaras estereo con zoom en el mastil'],
  [/navcam/i, 'Navcam — navegacion estereo'],
  [/hazcam/i, 'Hazcam — deteccion de obstaculos, delanteras y traseras'],
  [/supercam|rmi/i, 'SuperCam / RMI — laser y camara de alta resolucion'],
  [/watson|sherloc/i, 'SHERLOC / WATSON — camara de aproximacion del brazo'],
  [/pixl/i, 'PIXL — espectrometro de rayos X del brazo'],
  [/cache/i, 'CacheCam — inspeccion de los tubos de muestra'],
  [/lens|optic/i, 'optica (sin familia identificada en el nombre)'],
];

function describe(name) {
  for (const [pattern, note] of FAMILY_NOTES) {
    if (pattern.test(name)) return note;
  }
  return 'coincide con el patron, familia sin determinar';
}

/**
 * Escala el modelo calibrando contra el DIAMETRO DE RUEDA (52,5 cm).
 *
 * Es mas fiable que escalar por el largo total: el bounding box del modelo
 * completo incluye el brazo, cuya pose cambia el largo aparente. La rueda es
 * una pieza rigida de medida publicada, asi que es una regla de verdad.
 */
function calibrateScale(root) {
  const wheels = root.getObjectByName('Wheels_objs');

  if (wheels) {
    const box = new THREE.Box3().setFromObject(wheels);
    const diameter = box.max.y - box.min.y;
    if (diameter > 1e-4) {
      return { scale: (WHEEL_RADIUS * 2) / diameter, method: 'diametro de rueda (52,5 cm)' };
    }
  }

  // Respaldo: escalar por el largo total conocido.
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.z);
  return { scale: REAL_SIZE.length / longest, method: 'largo total (respaldo)' };
}

/** Vuelca en consola los nombres de las piezas que son camaras. */
function reportParts(names) {
  const matched = names.filter((n) => CAMERA_PATTERN.test(n));
  const cameras = matched.filter((n) => !HARDWARE_PATTERN.test(n));
  const hardware = matched.filter((n) => HARDWARE_PATTERN.test(n));

  console.group(
    `%cPerseverance — piezas de camara (${cameras.length} utiles de ${names.length} nodos)`,
    'color:#e8a775;font-weight:bold',
  );
  console.table(cameras.map((name) => ({ pieza: name, instrumento: describe(name) })));
  console.info(
    `Ademas hay ${hardware.length} herrajes asociados (soportes, tapas, cableado) ` +
      'en window.__ROVER_PARTS__.hardware',
  );
  console.info('Lista completa de nodos en window.__ROVER_PARTS__.all');
  console.info('Modelo: NASA-3D-Resources · credito NASA/JPL-Caltech');
  console.groupEnd();

  return { cameras, hardware };
}

export async function loadRover() {
  // El modelo de la NASA viene comprimido con Draco. El decodificador se sirve
  // en local desde public/draco/ (lo copia npm run fetch:model) para no
  // depender de un CDN externo en tiempo de ejecucion.
  const draco = new DRACOLoader().setDecoderPath('/draco/');
  const loader = new GLTFLoader().setDRACOLoader(draco);

  const gltf = await loader.loadAsync(MODEL_URL);
  draco.dispose();

  const root = gltf.scene;

  // --- escala real --------------------------------------------------------
  const { scale, method } = calibrateScale(root);
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);

  // --- origen en el punto de contacto, centrado en planta -----------------
  // Asi la capa de simulacion puede poner group.position.y a la altura del
  // suelo sin compensar nada.
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;

  const size = box.getSize(new THREE.Vector3());

  // --- sombras ------------------------------------------------------------
  const names = [];
  root.traverse((node) => {
    if (node.name) names.push(node.name);
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });

  const { cameras, hardware } = reportParts(names);

  const group = new THREE.Group();
  group.name = 'perseverance';
  group.add(root);

  window.__ROVER_PARTS__ = { all: names, cameras, hardware };

  return {
    group,
    cameras,
    hardware,
    partNames: names,
    animations: gltf.animations.length,
    measured: {
      scaleMethod: method,
      lengthM: Number(Math.max(size.x, size.z).toFixed(2)),
      widthM: Number(Math.min(size.x, size.z).toFixed(2)),
      heightM: Number(size.y.toFixed(2)),
    },
  };
}
