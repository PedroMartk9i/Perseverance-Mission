/**
 * Ruido determinista y PRNG. Matematica pura, sin una sola dependencia del
 * motor de render: este modulo pertenece al nucleo del proyecto
 * (ver README, "Nucleo de dominio (sin motor)").
 *
 * Mismo seed => mismo terreno, siempre. Eso es lo que hace que las capturas
 * de distintas rondas de verificacion sean comparables entre si.
 */

/** Hash entero de dos coordenadas a [0,1). Math.imul evita perder precision. */
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Quintica de Perlin: primera y segunda derivada nulas en los extremos. */
const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

/** Value noise bilineal suavizado. Devuelve [0,1]. */
export function valueNoise2(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const u = smooth(x - x0);
  const v = smooth(y - y0);

  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x0 + 1, y0, seed);
  const n01 = hash2(x0, y0 + 1, seed);
  const n11 = hash2(x0 + 1, y0 + 1, seed);

  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
}

/** Ruido fractal sumado por octavas. Devuelve [0,1]. */
export function fbm2(x, y, { octaves = 4, lacunarity = 2.0, gain = 0.5, seed = 0 } = {}) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2(x * freq, y * freq, seed + i * 101) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }

  return sum / norm;
}

/**
 * Ruido ridged: pliega el ruido sobre si mismo y lo eleva al cuadrado, lo que
 * produce crestas afiladas en vez de colinas redondas. Es la diferencia entre
 * una duna y un monticulo. Devuelve [0,1].
 */
export function ridged2(x, y, { octaves = 3, lacunarity = 2.0, gain = 0.5, seed = 0 } = {}) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    const n = valueNoise2(x * freq, y * freq, seed + i * 211);
    const r = 1 - Math.abs(n * 2 - 1);
    sum += r * r * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }

  return sum / norm;
}

/** PRNG de 32 bits, rapido y reproducible. Para dispersar rocas y polvo. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
