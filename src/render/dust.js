import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';

/**
 * Polvo en suspension.
 *
 * La bruma de fondo la hace la niebla exponencial de la escena; esto es la otra
 * mitad: las motas cercanas que el sol rasante enciende una por una. Sin ellas
 * el aire se ve limpio, y el aire de Marte nunca esta limpio.
 */

/**
 * Sprite redondo con caida suave.
 *
 * Imprescindible: PointsMaterial sin textura pinta CUADRADOS opacos, y a
 * tamaño visible el resultado parece confeti o nieve, no polvo. El degradado
 * radial es lo que convierte cada punto en una mota de luz.
 */
function dustSprite() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255, 228, 196, 1)');
  g.addColorStop(0.3, 'rgba(255, 206, 160, 0.38)');
  g.addColorStop(1.0, 'rgba(255, 190, 140, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createDust({ count = 3000, spread = 560, height = 110, seed = 5 } = {}) {
  const rand = mulberry32(seed);

  const positions = new Float32Array(count * 3);
  const drift = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (rand() - 0.5) * spread * 2;
    // El polvo se pega al suelo. Repartido por toda la altura salpicaba el
    // cielo entero y parecia una nevada.
    positions[i * 3 + 1] = rand() * height - 35;
    positions[i * 3 + 2] = (rand() - 0.5) * spread * 2;
    drift[i] = 2 + rand() * 9; // viento, en unidades por segundo
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    map: dustSprite(),
    color: 0xffcf9b,
    size: 2.4,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'polvo';

  const limit = spread;
  let elapsed = 0;

  function update(dt) {
    elapsed += dt;
    const p = geo.attributes.position.array;

    for (let i = 0; i < count; i++) {
      p[i * 3 + 0] += drift[i] * dt;
      // leve flotacion vertical, desfasada por particula
      p[i * 3 + 1] += Math.sin(elapsed * 0.6 + i * 0.37) * 0.04;
      if (p[i * 3 + 0] > limit) p[i * 3 + 0] -= spread * 2;
    }

    geo.attributes.position.needsUpdate = true;
  }

  return { points, update, count };
}
