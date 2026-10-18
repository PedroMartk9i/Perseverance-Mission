import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Capa cinematografica: halo en las altas luces, viñeta y grano.
 *
 * El orden importa. RenderPass dibuja la escena en lineal (three desactiva el
 * tone mapping cuando se renderiza a un render target), el bloom trabaja sobre
 * esos valores HDR sin recortar, y OutputPass aplica ACES y el espacio sRGB al
 * final. Invertir ese orden produce un bloom lechoso sobre colores ya
 * comprimidos.
 */

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 1.15 },
    uGrain: { value: 0.045 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec4 c = texture2D(tDiffuse, vUv);

      // Viñeta: cierra las esquinas y empuja la mirada al centro del cuadro.
      vec2 d = vUv - 0.5;
      c.rgb *= clamp(1.0 - dot(d, d) * uVignette, 0.0, 1.0);

      // Grano fino animado. Rompe el bandeado de los degradados del cielo,
      // que en una atmosfera de un solo color se nota muchisimo.
      float g = hash(vUv * 1024.0 + uTime) - 0.5;
      c.rgb += g * uGrain;

      gl_FragColor = c;
    }
  `,
};

export function createPost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // Media resolucion: el bloom es el paso mas caro y a media resolucion es
  // indistinguible a simple vista. En render por software es la diferencia
  // entre fluido e inusable.
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(size.x * 0.5, size.y * 0.5),
    0.16, // fuerza: un velo, no un flash. A 0.42 el halo borraba el cielo entero
    0.5, // radio
    0.92, // umbral alto: solo el disco solar, no la mitad luminosa del cielo
  );
  composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  composer.addPass(new OutputPass());

  function setSize(width, height) {
    composer.setSize(width, height);
    bloom.setSize(width * 0.5, height * 0.5);
  }

  function render(dt) {
    grade.uniforms.uTime.value += dt;
    composer.render(dt);
  }

  return { composer, render, setSize, bloom, grade };
}
