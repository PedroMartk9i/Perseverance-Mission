import * as THREE from 'three';
import { heightAt, normalAt } from '../core/terrain-height.js';

/**
 * Huellas de las ruedas.
 *
 * Buffer circular de marcas instanciadas: al llenarse, las mas viejas se
 * sobrescriben. Con 900 marcas cada 0,45 m quedan unos 200 m de rastro por
 * carril, que es mas de lo que cabe en pantalla.
 *
 * DATO QUE NO VAMOS A INVENTAR: las ruedas que estampan "JPL" en codigo Morse
 * son las de CURIOSITY. Perseverance lleva un diseño distinto, con tacos rectos
 * y sin ese guiño. El patron de aqui son tacos, no letras.
 */

const SPACING = 0.45; // metros entre marcas consecutivas
const MARK_LENGTH = 0.56;
const MARK_WIDTH = 0.48;

function treadTexture() {
  const w = 64;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, w, h);

  // Surco: mas oscuro en el centro, difuminado en los bordes.
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0.0, 'rgba(52, 26, 13, 0)');
  g.addColorStop(0.16, 'rgba(52, 26, 13, 0.62)');
  g.addColorStop(0.84, 'rgba(52, 26, 13, 0.62)');
  g.addColorStop(1.0, 'rgba(52, 26, 13, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Tacos transversales.
  ctx.fillStyle = 'rgba(30, 14, 6, 0.72)';
  for (let y = 1; y < h; y += 7) {
    ctx.fillRect(5, y, w - 10, 4);
  }

  // Bordes del surco levantados: la arena que la rueda empuja a los lados.
  ctx.fillStyle = 'rgba(214, 160, 108, 0.5)';
  ctx.fillRect(2, 0, 3, h);
  ctx.fillRect(w - 5, 0, 3, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createTracks({ capacity = 1600 } = {}) {
  const geo = new THREE.PlaneGeometry(MARK_WIDTH, MARK_LENGTH);
  geo.rotateX(-Math.PI / 2); // tumbada sobre el suelo

  const mat = new THREE.MeshStandardMaterial({
    map: treadTexture(),
    transparent: true,
    depthWrite: false,
    roughness: 1.0,
    metalness: 0.0,
    polygonOffset: true, // evita el z-fighting contra la malla del terreno
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -6,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'huellas';

  // Todo oculto hasta que se use: una matriz a escala cero no dibuja nada.
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, hidden);
  mesh.instanceMatrix.needsUpdate = true;

  let cursor = 0;
  let placed = 0;

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const align = new THREE.Quaternion();
  const yawQuat = new THREE.Quaternion();

  /** Deja una marca en (x, z), orientada segun el rumbo y la pendiente. */
  function stamp(x, z, yaw) {
    const [nx, ny, nz] = normalAt(x, z);
    normal.set(nx, ny, nz);

    // Primero el rumbo, luego se acuesta sobre la pendiente del terreno.
    yawQuat.setFromAxisAngle(up, yaw);
    align.setFromUnitVectors(up, normal);
    quat.copy(align).multiply(yawQuat);

    position.set(x, heightAt(x, z) + 0.05, z);
    matrix.compose(position, quat, scale);

    mesh.setMatrixAt(cursor, matrix);
    cursor = (cursor + 1) % capacity;
    placed = Math.min(placed + 1, capacity);
    mesh.instanceMatrix.needsUpdate = true;
  }

  // Estado por carril: cuanto se ha avanzado desde la ultima marca.
  const lanes = new Map();

  /**
   * Avisa de donde esta cada rueda. Solo estampa cuando la rueda ha recorrido
   * SPACING desde su marca anterior: asi el rastro no depende del framerate.
   */
  function trail(laneId, x, z, yaw) {
    const previous = lanes.get(laneId);
    if (!previous) {
      lanes.set(laneId, { x, z });
      stamp(x, z, yaw);
      return;
    }

    const dx = x - previous.x;
    const dz = z - previous.z;
    const distance = Math.hypot(dx, dz);
    if (distance < SPACING) return;

    // Se rellena el hueco con marcas intermedias. A toda velocidad el rover
    // avanza varios metros entre frames, y una sola marca por frame dejaria el
    // rastro a trozos — o directamente invisible cuanto mas rapido se va.
    const steps = Math.min(Math.round(distance / SPACING), 32);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      stamp(previous.x + dx * t, previous.z + dz * t, yaw);
    }

    previous.x = x;
    previous.z = z;
  }

  return { mesh, trail, get count() { return placed; } };
}
