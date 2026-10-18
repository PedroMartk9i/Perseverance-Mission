import * as THREE from 'three';

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // ACES es lo que evita que el sol y el cielo se quemen a blanco plano.
  // Es la mitad del "se ve de pelicula".
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  renderer.shadowMap.enabled = true;
  // VSM y no PCFSoft: three elimino PCFSoftShadowMap y hace fallback silencioso
  // a PCF duro. VSM es el unico tipo que todavia respeta shadow.radius, que es
  // lo que hace falta para las sombras suaves que pidio el usuario.
  renderer.shadowMap.type = THREE.VSMShadowMap;

  document.body.appendChild(renderer.domElement);
  return renderer;
}
