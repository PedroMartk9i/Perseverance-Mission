import { mulberry32 } from './noise.js';
import { heightAt } from './terrain-height.js';

/**
 * El campo de rocas, como DATO y no como malla.
 *
 * Antes las rocas se generaban dentro de la capa de render, asi que la fisica
 * no sabia que existian y el rover las atravesaba. Ahora la colocacion vive en
 * el nucleo: render/rocks.js las dibuja y sim/rover.js choca con ellas, los dos
 * leyendo exactamente la misma lista.
 *
 * MATIZ a la regla del borde del crater ("si estorba, vive en heightAt"): esa
 * regla es para la SUPERFICIE del suelo. Una roca suelta de 3 m no es relieve,
 * es un objeto; meterla en la funcion de altura obligaria a deformar el terreno
 * bajo una malla que ya la dibuja. Lo que corresponde es colision.
 *
 * Y no todas estorban: con 52,5 cm de rueda y 55 cm de luz bajo el chasis, un
 * guijarro se pasa por encima. Solo son obstaculo las que sobresalen de verdad.
 */

const CELL = 10; // lado de celda de la rejilla espacial, en metros

/** A partir de esta altura sobre el suelo, una roca deja de ser un bache. */
const BLOCKING_HEIGHT = 0.55;

export function createRockField({ count = 1200, radius = 780, seed = 7 } = {}) {
  const rand = mulberry32(seed);
  const rocks = [];
  const grid = new Map();

  const key = (ix, iz) => `${ix},${iz}`;

  let maxBlockingRadius = 0;

  for (let i = 0; i < count; i++) {
    // sqrt() reparte uniforme por area en vez de apelotonar en el centro
    const angle = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radius;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r - 140; // sesgo hacia donde mira la camara

    // Mayoria de guijarros, unos pocos bloques grandes.
    const size = 0.3 + Math.pow(rand(), 2.4) * 3.6;

    const scaleX = size * (0.8 + rand() * 0.5);
    const scaleY = size * (0.6 + rand() * 0.5);
    const scaleZ = size * (0.8 + rand() * 0.5);

    const ground = heightAt(x, z);
    const y = ground - size * 0.22; // enterrada un poco en la arena

    // La geometria es un icosaedro de radio ~1 deformado por ruido, asi que la
    // extension real pasa algo de 1. Se redondea hacia arriba: mas vale una
    // colision un pelin generosa que una roca que se cuela.
    const collisionRadius = Math.max(scaleX, scaleZ) * 1.15;
    const top = y + Math.max(scaleY, collisionRadius * 0.74) - ground;

    const rock = {
      x,
      y,
      z,
      scaleX,
      scaleY,
      scaleZ,
      rotX: rand() * 3,
      rotY: rand() * 6.283,
      rotZ: rand() * 3,
      hue: 0.055 + rand() * 0.03,
      saturation: 0.3 + rand() * 0.18,
      lightness: 0.15 + rand() * 0.14,
      variant: rand() < 0.5 ? 0 : rand() < 0.64 ? 1 : 2,
      collisionRadius,
      top,
      blocking: top > BLOCKING_HEIGHT,
    };

    rocks.push(rock);

    if (rock.blocking) {
      maxBlockingRadius = Math.max(maxBlockingRadius, collisionRadius);

      const ix = Math.floor(x / CELL);
      const iz = Math.floor(z / CELL);
      const cell = grid.get(key(ix, iz));
      if (cell) cell.push(rock);
      else grid.set(key(ix, iz), [rock]);
    }
  }

  /**
   * Rocas que estorban cerca de un punto. Solo mira las celdas que el radio
   * pedido puede alcanzar, asi que no depende del tamaño del campo.
   */
  function near(x, z, reach) {
    const span = Math.ceil((reach + maxBlockingRadius) / CELL);
    const ix = Math.floor(x / CELL);
    const iz = Math.floor(z / CELL);
    const found = [];

    for (let dx = -span; dx <= span; dx++) {
      for (let dz = -span; dz <= span; dz++) {
        const cell = grid.get(key(ix + dx, iz + dz));
        if (cell) found.push(...cell);
      }
    }
    return found;
  }

  const blocking = rocks.filter((rock) => rock.blocking).length;

  return {
    rocks,
    near,
    total: rocks.length,
    blocking,
    maxBlockingRadius,
  };
}

/**
 * Instancia unica y compartida. Render y simulacion DEBEN ver las mismas
 * rocas: dos campos generados por separado serian dos mundos distintos, y el
 * rover chocaria con piedras invisibles.
 */
export const rockField = createRockField();
