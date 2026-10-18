import * as THREE from 'three';

import { createRenderer } from './render/renderer.js';
import { createSky, HORIZON_COLOR } from './render/sky.js';
import { createLighting, SUN_DIR, SUN_DISTANCE } from './render/lighting.js';
import { createTerrain } from './render/terrain.js';
import { createRocks } from './render/rocks.js';
import { createDust } from './render/dust.js';
import { createMoons } from './render/moons.js';
import { createCamera } from './render/camera.js';
import { createPost } from './render/post.js';
import { createTracks } from './render/tracks.js';
import { createOrbitRig } from './render/orbit-rig.js';
import { createDetailTerrain } from './render/detail-terrain.js';
import { createPlume } from './render/plume.js';
import { loadRover, MODEL_CREDIT } from './render/rover-model.js';

import { heightAt } from './core/terrain-height.js';
import { createInput } from './app/input.js';
import { createRover, TIME_WARP, TIME_WARP_BOOST, REAL_TOP_SPEED } from './sim/rover.js';

// ?shot=hero deja el rover aparcado y la camara congelada. Lo usa npm run check.
const hero = new URLSearchParams(location.search).get('shot') === 'hero';

const renderer = createRenderer();
const camera = createCamera();

const scene = new THREE.Scene();
// La niebla va pegada al caramelo del horizonte: asi el terreno lejano se
// disuelve en el cielo en vez de cortarse contra el.
scene.fog = new THREE.FogExp2(HORIZON_COLOR, 0.00055);

scene.add(createSky(SUN_DIR));

const lighting = createLighting(scene, new THREE.Vector3());

// Terreno lejano, con un recorte que se mueve con el rover.
const farTerrain = createTerrain();
scene.add(farTerrain.mesh);

// Parche de 1 m de resolucion que sigue al rover. Es lo que hace que la malla
// visible coincida con la superficie que evalua la fisica.
const detail = createDetailTerrain();
scene.add(detail.mesh);

// El recorte va un poco MAS PEQUEÑO que el parche: en esa franja de solape
// manda el test de profundidad normal, y asi no queda una grieta por la que se
// vea el cielo si las dos mallas no coinciden exactamente en el borde.
const HOLE_INSET = 7;
function syncHole() {
  farTerrain.setHole(detail.centerX, detail.centerZ, detail.size / 2 - HOLE_INSET);
}

const rocks = createRocks();
for (const mesh of rocks.meshes) scene.add(mesh);

const dust = createDust();
scene.add(dust.points);

const moons = createMoons();
scene.add(moons.group);

const tracks = createTracks();
scene.add(tracks.mesh);

const plume = createPlume();
scene.add(plume.points);

const input = createInput();

// ?at=x,z arranca el rover donde se quiera. Sirve para probar sitios concretos
// — el borde del crater, por ejemplo — sin tener que conducir 2 km hasta alli.
const atParam = new URLSearchParams(location.search).get('at');
const startAt = atParam
  ? { x: Number(atParam.split(',')[0]), z: Number(atParam.split(',')[1]) }
  : {};
const rover = createRover(startAt);
const rig = createOrbitRig(camera, renderer.domElement);

// C recoloca la camara detras del rover y reanuda el seguimiento automatico.
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyC') rig.recenter();
});

/**
 * ?drive=N conduce el rover N segundos antes de capturar.
 *
 * Existe para poder verificar el fallo que se reporto, que solo aparecia EN
 * MOVIMIENTO sobre terreno irregular. Una captura estatica no lo habria
 * detectado nunca: el encuadre fijo siempre cae en el mismo trozo de duna.
 */
const driveSeconds = Number(new URLSearchParams(location.search).get('drive') ?? 0);
if (driveSeconds > 0) {
  const step = 1 / 60;
  const scripted = { throttle: 1, steer: 0.3, boost: false };
  for (let t = 0; t < driveSeconds; t += step) {
    rover.update(step, scripted);
    const s = rover.state;
    tracks.trail('izquierda', s.contacts[4].x, s.contacts[4].z, s.yaw);
    tracks.trail('derecha', s.contacts[5].x, s.contacts[5].z, s.yaw);
  }
}

// El parche de detalle se genera antes del primer frame: si no, el rover
// aparece un instante sobre la malla gruesa y se ve el salto.
detail.update(rover.state.x, rover.state.z);
syncHole();

const post = createPost(renderer, scene, camera);

const hud = document.getElementById('hud');
const NEUTRAL = { throttle: 0, steer: 0, boost: false };

let roverModel = null;
let modelError = null;

/**
 * Siembra un rastro que llega hasta donde esta aparcado el rover.
 *
 * Sin esto, la captura de verificacion saldria sin huellas: el rover esta
 * quieto en el encuadre hero. Esto no es maquillaje, es el estado coherente
 * de un vehiculo que ha llegado conduciendo hasta ahi.
 */
function seedTrail() {
  const s = rover.state;
  const fx = -Math.sin(s.yaw);
  const fz = -Math.cos(s.yaw);
  const rx = Math.cos(s.yaw);
  const rz = -Math.sin(s.yaw);

  const path = [];
  const steps = 110;
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const back = t * 70;
    const drift = Math.sin(t * 2.4) * 8;
    path.push([s.x - fx * back + rx * drift, s.z - fz * back + rz * drift]);
  }

  for (let i = 0; i < path.length; i++) {
    const [x, z] = path[i];
    const next = path[Math.min(i + 1, path.length - 1)];
    const heading = Math.atan2(-(next[0] - x), -(next[1] - z));
    const hx = Math.cos(heading);
    const hz = -Math.sin(heading);
    tracks.trail('seed-izq', x - hx * 1.2, z - hz * 1.2, heading);
    tracks.trail('seed-der', x + hx * 1.2, z + hz * 1.2, heading);
  }
}

seedTrail();

loadRover()
  .then((model) => {
    roverModel = model;
    scene.add(model.group);
    updateHud(); // sin esto el HUD se queda en "Cargando" hasta el frame 10
  })
  .catch((err) => {
    modelError = err?.message ?? String(err);
    console.error(
      'No se pudo cargar el modelo del rover. Ejecuta: npm run fetch:model\n',
      err,
    );
  });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

function updateHud() {
  if (!hud) return;
  const s = rover.state;
  const warp = input.boost ? TIME_WARP_BOOST : TIME_WARP;
  const realCmS = ((Math.abs(s.speed) / warp) * 100).toFixed(1);

  hud.innerHTML = `
    <b>WASD</b> conducir · <b>Shift</b> acelerar · <b>arrastra</b> orbitar ·
    <b>rueda</b> zoom · <b>C</b> recentrar<br />
    ${Math.abs(s.speed).toFixed(1)} m/s en simulacion
    &nbsp;·&nbsp; <b>${realCmS} cm/s</b> reales (x${warp})<br />
    ruedas en contacto ${s.grounded}/6
    &nbsp;·&nbsp; recorrido ${s.odometer.toFixed(1)} m
    &nbsp;·&nbsp; camara ${rig.distance.toFixed(1)} m<br />
    <span class="credit">Modelo ${MODEL_CREDIT}</span>
  `;
}

/** Diagnostico que consume scripts/check.mjs. */
function publishDiagnostics() {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const s = rover.state;

  window.__DIAG__ = {
    webglRenderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    webglVersion: gl.getParameter(gl.VERSION),
    triangles: renderer.info.render.triangles,
    drawCalls: renderer.info.render.calls,
    shot: hero ? 'hero (congelado)' : 'libre',
    rocks: rocks.total,
    blockingRocks: rocks.blocking,
    moons: moons.names,
    dustParticles: dust.count,
    sunElevationDeg: Number(((Math.asin(SUN_DIR.y) * 180) / Math.PI).toFixed(2)),
    shadows: renderer.shadowMap.enabled,

    rover: {
      loaded: Boolean(roverModel),
      error: modelError,
      measured: roverModel?.measured ?? null,
      cameraParts: roverModel?.cameras ?? [],
      totalParts: roverModel?.partNames.length ?? 0,
      animations: roverModel?.animations ?? 0,
      grounded: s.grounded,
      position: [Number(s.x.toFixed(1)), Number(s.y.toFixed(1)), Number(s.z.toFixed(1))],
      pitchDeg: Number(((s.pitch * 180) / Math.PI).toFixed(1)),
      rollDeg: Number(((s.roll * 180) / Math.PI).toFixed(1)),
      maxPenetrationM: Number(s.maxPenetration.toFixed(3)),
      wheelGaps: s.contacts.map((c) => Number((c.gap ?? 0).toFixed(2))),
      chassisY: Number(s.y.toFixed(2)),
      averageGround: Number((s.averageGround ?? 0).toFixed(2)),
      drivenSeconds: driveSeconds,
      odometerM: Number(s.odometer.toFixed(1)),
      realTopSpeedCmS: REAL_TOP_SPEED * 100,
    },
    tracks: tracks.count,
    plumeAlive: plume.alive,
    detailTerrain: {
      resolutionM: detail.resolution,
      sizeM: detail.size,
      rebuilds: detail.rebuilds,
    },
    cameraDistanceM: Number(rig.distance.toFixed(1)),
  };

  window.__SCENE_READY__ = true;
}

// El composer renderiza varias pasadas por frame y cada una reinicia el
// contador. Sin autoReset=false, el diagnostico reportaria solo los 2
// triangulos del quad de salida en vez de la escena entera.
renderer.info.autoReset = false;

const probe = new THREE.Vector3();
// Posicion de las ruedas traseras en el frame anterior, para repartir el polvo
// a lo largo del tramo recorrido y no en un punto.
const lastWheel = [null, null];
let previous = performance.now();
let frames = 0;
let framesWithModel = 0;
let announced = false;

function tick(now) {
  // El limite inferior en 0 NO es paranoia: requestAnimationFrame puede
  // entregar una marca de tiempo ANTERIOR a un performance.now() llamado
  // despues de programar el frame. Con dt negativo, el suavizado exponencial
  // invierte el signo y se aleja de su objetivo en vez de acercarse — la
  // velocidad del rover llegaba a 20 m/s cuando su maximo son 5.
  const dt = Math.min(Math.max((now - previous) / 1000, 0), 0.05);
  previous = now;

  rover.update(dt, hero ? NEUTRAL : input);
  const s = rover.state;

  // Huellas: solo las dos ruedas traseras. Las seis van en linea por lado, asi
  // que el rover deja dos carriles, no seis.
  if (!hero) {
    const left = s.contacts[4];
    const right = s.contacts[5];
    tracks.trail('izquierda', left.x, left.z, s.yaw);
    tracks.trail('derecha', right.x, right.z, s.yaw);
  }

  if (roverModel) {
    roverModel.group.position.set(s.x, s.y, s.z);
    // Orden YXZ: rumbo, luego cabeceo, luego alabeo. Es el orden natural de un
    // vehiculo; con el orden por defecto el alabeo contamina el rumbo.
    roverModel.group.rotation.set(s.pitch, s.yaw, s.roll, 'YXZ');
    framesWithModel++;
  }

  detail.update(s.x, s.z);
  syncHole();

  // Polvareda: solo al correr con Shift y a buena velocidad. Sale despedida
  // hacia atras desde el contacto de las dos ruedas traseras.
  const boosting = !hero && input.boost && Math.abs(s.speed) > 6;
  if (boosting) {
    const backX = Math.sin(s.yaw);
    const backZ = Math.cos(s.yaw);
    const intensity = Math.min(1, Math.abs(s.speed) / 25);

    for (let lane = 0; lane < 2; lane++) {
      const c = s.contacts[4 + lane];
      const now = { x: c.x, y: c.ground, z: c.z };
      // Primer frame tras pisar Shift: sin tramo previo, se emite en el sitio.
      plume.emit(lastWheel[lane] ?? now, now, backX * 3, backZ * 3, 340 * intensity, dt);
      lastWheel[lane] = now;
    }
  } else {
    lastWheel[0] = null;
    lastWheel[1] = null;
  }
  plume.update(dt);

  rig.update(dt, s);

  // Estado vivo para diagnostico. Lo importante es `onScreen`: proyecta el
  // rover a coordenadas de pantalla, que es la unica forma de detectar
  // automaticamente "el rover desaparecio" sin mirar la imagen.
  if (roverModel) {
    probe.set(s.x, s.y + 1, s.z).project(camera);
    const cameraGround = heightAt(camera.position.x, camera.position.z);
    window.__LIVE__ = {
      onScreen:
        Math.abs(probe.x) <= 1 && Math.abs(probe.y) <= 1 && probe.z > -1 && probe.z < 1,
      ndc: [Number(probe.x.toFixed(2)), Number(probe.y.toFixed(2)), Number(probe.z.toFixed(3))],
      rover: [Number(s.x.toFixed(1)), Number(s.y.toFixed(1)), Number(s.z.toFixed(1))],
      camera: [
        Number(camera.position.x.toFixed(1)),
        Number(camera.position.y.toFixed(1)),
        Number(camera.position.z.toFixed(1)),
      ],
      cameraAboveGround: Number((camera.position.y - cameraGround).toFixed(2)),
      cameraDistance: Number(rig.distance.toFixed(1)),
      pitchDeg: Number(((s.pitch * 180) / Math.PI).toFixed(1)),
      rollDeg: Number(((s.roll * 180) / Math.PI).toFixed(1)),
      speed: Number(s.speed.toFixed(2)),
      grounded: s.grounded,
      boosting,
      plumeAlive: plume.alive,
      blocked: s.blocked,
      collisions: s.collisions,
      slopeDeg: Number(((Math.abs(s.pitch) * 180) / Math.PI).toFixed(1)),
    };
  }

  // La luz y el polvo siguen al rover: el mapa de sombras solo cubre 140 m y
  // las motas de polvo solo tienen sentido cerca de la camara.
  lighting.sun.target.position.set(s.x, s.y, s.z);
  lighting.sun.position.set(s.x, s.y, s.z).addScaledVector(SUN_DIR, SUN_DISTANCE);
  dust.points.position.set(s.x, s.y + 15, s.z);

  renderer.info.reset();
  post.render(dt);

  frames++;
  if (frames % 10 === 0) updateHud();

  // Listo = modelo cargado y ya dibujado unos cuantos frames. Si el modelo
  // fallo, se declara listo igual para que el check pueda reportar el fallo en
  // vez de morir por timeout sin decir por que.
  if (!announced && (framesWithModel >= 4 || (modelError && frames >= 6))) {
    announced = true;
    publishDiagnostics();
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
