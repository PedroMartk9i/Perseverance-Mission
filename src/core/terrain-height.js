import { fbm2, ridged2 } from './noise.js';

/**
 * Altura del terreno en cualquier punto del mundo. Unidades: METROS.
 *
 * Es la unica fuente de verdad del relieve: la malla, las rocas, la camara y
 * la suspension del rover la consultan todas, asi que nada puede quedar
 * flotando ni enterrado.
 *
 * Vive en el nucleo y no en render/ porque es matematica pura: la capa de
 * simulacion depende de ella y no debe depender del motor (ver README).
 *
 * ESCALA: las amplitudes se recortaron al introducir el rover. Antes el
 * relieve tenia ondulaciones de +-120 m y dunas de 44 m, que al lado de un
 * vehiculo de 3 m no son dunas sino cordilleras. Ahora son +-35 m y 11 m, que
 * es el orden real de un campo de dunas marciano. El paisaje se ve igual
 * porque la escala es relativa; lo que cambia es que tiene sentido.
 *
 * Nota: relieve procedural. NO es el relieve real del crater Jezero. El
 * terreno real desde datos de NASA sigue siendo una decision abierta del
 * proyecto (ver README). Hasta entonces, aproximacion declarada.
 */
/** Anillo del borde del crater: radio, ancho de la campana y corte de calculo. */
const RIM_RADIUS = 2300;
const RIM_WIDTH = 620;
const RIM_INNER = 900;
const RIM_OUTER = 3800;

export function heightAt(x, z) {
  // 1. Ondulacion amplia: relieve de fondo y un horizonte que no es plano.
  let h = (fbm2(x * 0.0004, z * 0.0004, { octaves: 4, seed: 11 }) - 0.5) * 70;

  // 2. Cordones de duna: ruido ridged comprimido en X y estirado en Z, que es
  //    lo que produce crestas largas y paralelas en vez de bultos.
  h += ridged2(x * 0.005, z * 0.0012, { octaves: 3, seed: 23 }) * 11;

  // 3. Segunda familia de dunas, girada 30 grados, para romper el patron unico.
  const ax = x * 0.866 - z * 0.5;
  const az = x * 0.5 + z * 0.866;
  h += ridged2(ax * 0.003, az * 0.0009, { octaves: 2, seed: 37 }) * 5.5;

  // 4. Dunas menores, de unos 30 m de onda.
  //
  //    Esta banda y la siguiente existen por una razon de LUZ, no de forma: con
  //    el sol a 11 grados, una superficie horizontal recibe luz de refilon y se
  //    ve apagada. Son las caras inclinadas las que se encienden. Al bajar la
  //    amplitud del relieve para que encajara con un rover de 3 m, el terreno
  //    cercano quedo casi plano y la escena entera se oscurecio. El relieve de
  //    escala pequeña es lo que la devuelve a la vida.
  h += ridged2(x * 0.03, z * 0.009, { octaves: 2, seed: 61 }) * 2.6;

  // 5. Ondulaciones de viento: el detalle metrico de la arena.
  h += (fbm2(x * 0.11, z * 0.055, { octaves: 2, seed: 51 }) - 0.5) * 1.4;

  // 6. Borde del crater: un anillo de relieve a unos 2,3 km.
  //
  //    Esta AQUI, dentro de la funcion de altura, y no en mallas decorativas
  //    aparte — que es como estaba antes y fue un fallo serio. Aquellos cerros
  //    se dibujaban pero el terreno no sabia de su existencia, asi que el rover
  //    no los subia: se metia DENTRO de la montaña, y la camara con el. El
  //    vehiculo desaparecia de la pantalla, tapado por el interior del cerro.
  //
  //    Regla que deja esto: en este proyecto, todo lo que se ve con volumen es
  //    terreno conducible. Si algo tiene que estorbar, vive en heightAt().
  const distance2 = x * x + z * z;
  if (distance2 > RIM_INNER * RIM_INNER && distance2 < RIM_OUTER * RIM_OUTER) {
    const distance = Math.sqrt(distance2);
    const band = Math.exp(-(((distance - RIM_RADIUS) / RIM_WIDTH) ** 2));
    const angle = Math.atan2(z, x);
    // cos/sin como entrada hace el ruido periodico: no hay costura en +-PI
    const relief = fbm2(Math.cos(angle) * 2.4 + 10, Math.sin(angle) * 2.4 + 10, {
      octaves: 3,
      seed: 71,
    });
    h += band * (70 + relief * 150);
  }

  return h;
}

/**
 * Cuanto tiene de cresta de duna un punto. La usan el terreno lejano y el
 * parche de detalle para colorearse EXACTAMENTE igual: si cada uno calculara
 * su color por su cuenta, la costura entre ambos se veria.
 */
export function crestnessAt(x, z) {
  return ridged2(x * 0.005, z * 0.0012, { octaves: 3, seed: 23 });
}

/** Variacion fina del albedo de la arena. */
export function grainAt(x, z) {
  return fbm2(x * 0.02, z * 0.02, { octaves: 2, seed: 77 });
}

/**
 * Normal del terreno por diferencias finitas. La usan las huellas para
 * acostarse sobre la arena en vez de clavarse en ella.
 */
export function normalAt(x, z, eps = 0.6) {
  const hL = heightAt(x - eps, z);
  const hR = heightAt(x + eps, z);
  const hD = heightAt(x, z - eps);
  const hU = heightAt(x, z + eps);

  const nx = hL - hR;
  const nz = hD - hU;
  const ny = 2 * eps;

  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}
