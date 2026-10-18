import { heightAt } from '../core/terrain-height.js';
import { rockField } from '../core/rock-field.js';

/**
 * Simulacion del rover. Sin dependencias del motor de render: esta capa decide
 * donde esta el rover y como esta inclinado; otra capa lo dibuja.
 *
 * MEDIDAS REALES DE PERSEVERANCE (NASA):
 *   largo 3,0 m (sin el brazo) · ancho 2,7 m · alto 2,2 m · masa 1025 kg
 *   6 ruedas de 52,5 cm de diametro
 *   velocidad maxima en terreno llano y firme: 4,2 cm/s (152 m/h)
 */
export const WHEEL_RADIUS = 0.2625; // 52,5 cm de diametro
export const REAL_TOP_SPEED = 0.042; // m/s — la de verdad

/**
 * Aceleracion de tiempo. A velocidad real, recorrer su propio largo le toma a
 * Perseverance mas de un minuto: es fiel e injugable. Se acelera el tiempo y
 * se muestra en pantalla la velocidad REAL equivalente, declarada como tal.
 */
export const TIME_WARP = 120;
export const TIME_WARP_BOOST = 700; // Shift: el doble que antes

const WHEELBASE = 2.3; // separacion entre eje delantero y trasero
const TRACK = 2.4; // separacion entre ruedas izquierda y derecha

/**
 * Las 6 ruedas en coordenadas locales.
 *   f = adelante (+) / atras (-)
 *   s = derecha (+) / izquierda (-)
 */
export const WHEELS = [
  { name: 'delantera-izquierda', f: WHEELBASE / 2, s: -TRACK / 2 },
  { name: 'delantera-derecha', f: WHEELBASE / 2, s: TRACK / 2 },
  { name: 'central-izquierda', f: 0, s: -TRACK / 2 },
  { name: 'central-derecha', f: 0, s: TRACK / 2 },
  { name: 'trasera-izquierda', f: -WHEELBASE / 2, s: -TRACK / 2 },
  { name: 'trasera-derecha', f: -WHEELBASE / 2, s: TRACK / 2 },
];

/**
 * Sondas bajo el chasis. Las seis ruedas pueden estar perfectamente apoyadas y
 * aun asi una cresta entre ellas puede atravesar el vientre del rover.
 */
const BELLY_PROBES = [
  { f: 0.95, s: 0 },
  { f: 0, s: 0 },
  { f: -0.95, s: 0 },
  { f: 0.6, s: -0.95 },
  { f: 0.6, s: 0.95 },
  { f: -0.6, s: -0.95 },
  { f: -0.6, s: 0.95 },
];

/**
 * Luz exigida bajo el chasis. Conservadora a proposito: Perseverance tiene unos
 * 55 cm reales, pero exigirlos aqui convertia las sondas en un gato hidraulico.
 */
const BELLY_CLEARANCE = 0.32;

/**
 * Cuanto puede el vientre levantar el rover por encima de lo que piden las
 * ruedas.
 *
 * Sin este tope, una cresta bajo el chasis elevaba el vehiculo entero medio
 * metro y las SEIS ruedas quedaban en el aire — el rover flotaba. Las ruedas
 * mandan sobre la altura de marcha; el vientre solo puede corregirla un poco
 * para que una cresta no atraviese la panza.
 */
const BELLY_LIFT_LIMIT = 0.18;

/** Cuanto se hunden las ruedas en la arena. Sin esto parece ir sobre raíles. */
const SINK = 0.05;

/**
 * Gravedad efectiva para la caida del chasis, en m/s^2.
 *
 * NO son los 3,72 de Marte, y es deliberado. El mundo corre con el tiempo
 * acelerado x120, asi que para que la caida se vea coherente a esa velocidad
 * de reproduccion habria que escalar la aceleracion por el cuadrado del factor
 * — lo que la volveria instantanea y mataria toda la suspension. Este valor es
 * el punto medio: el rover corona una duna, despega un instante y se asienta
 * en unas decimas, en vez de quedarse flotando dos metros.
 *
 * Antes esta altura se suavizaba con una exponencial, y ese era el fallo: al
 * coronar una cresta a 18 km/h el suavizado bajaba el chasis mucho mas despacio
 * que el terreno, y las seis ruedas quedaban en el aire.
 */
const GRAVITY = 45;

/**
 * Radio del rover para chocar con rocas. 1,45 m es media eslora: aproximar el
 * vehiculo por un circulo es generoso en las esquinas, pero el error juega a
 * favor — antes se queda corto que dejandolo colarse dentro de un bloque.
 */
const ROVER_RADIUS = 1.45;

/** Cuanta velocidad se pierde al chocar de frente contra una roca. */
const IMPACT_SLOWDOWN = 0.45;

/** Suavizado exponencial independiente del framerate. */
const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));

export function createRover({ x = 24, z = -130, yaw = -0.21 } = {}) {
  const state = {
    x,
    z,
    yaw,
    y: heightAt(x, z),
    pitch: 0,
    roll: 0,
    speed: 0, // m/s en tiempo acelerado
    /** Contacto de cada rueda: altura del suelo y recorrido de suspension. */
    contacts: WHEELS.map(() => ({ x: 0, z: 0, ground: 0, travel: 0 })),
    grounded: 0,
    wheelSpin: 0,
    odometer: 0, // metros recorridos, en escala real
    vy: 0, // velocidad vertical del chasis
    airborne: false,
    blocked: false, // tocando una roca en este instante
    collisions: 0, // choques acumulados, para verificacion
    penetration: 0, // cuanto sube el terreno por encima del plano de apoyo
    maxPenetration: -Infinity, // el peor caso visto, para verificacion
  };

  function wheelWorld(wheel, out) {
    // Vectores de la base local, derivados solo del yaw. La inclinacion se
    // calcula DESPUES a partir de estos contactos, no al reves.
    const fx = -Math.sin(state.yaw);
    const fz = -Math.cos(state.yaw);
    const rx = Math.cos(state.yaw);
    const rz = -Math.sin(state.yaw);

    out.x = state.x + rx * wheel.s + fx * wheel.f;
    out.z = state.z + rz * wheel.s + fz * wheel.f;
    return out;
  }

  function update(dt, input) {
    const warp = input.boost ? TIME_WARP_BOOST : TIME_WARP;
    const maxSpeed = REAL_TOP_SPEED * warp;

    // --- traccion -------------------------------------------------------
    const throttle = input.throttle;
    const targetSpeed = throttle * maxSpeed * (throttle < 0 ? 0.55 : 1); // marcha atras mas lenta
    state.speed = damp(state.speed, targetSpeed, throttle === 0 ? 3.5 : 1.8, dt);
    if (Math.abs(state.speed) < 1e-4) state.speed = 0;

    // --- direccion ------------------------------------------------------
    // Un rover de 6 ruedas con traccion diferencial puede girar sobre si mismo,
    // asi que el giro no se anula a velocidad cero, solo se reduce.
    const pivoting = 0.35 + 0.65 * Math.min(1, Math.abs(state.speed) / maxSpeed);
    state.yaw += input.steer * 0.55 * pivoting * dt;

    // --- avance ---------------------------------------------------------
    const fx = -Math.sin(state.yaw);
    const fz = -Math.cos(state.yaw);
    const rx = Math.cos(state.yaw);
    const rz = -Math.sin(state.yaw);
    state.x += fx * state.speed * dt;
    state.z += fz * state.speed * dt;

    state.wheelSpin += (state.speed * dt) / WHEEL_RADIUS;
    state.odometer += (Math.abs(state.speed) * dt) / warp; // en metros reales

    // --- colision con las rocas que estorban ------------------------------
    //
    // Se resuelve ANTES de muestrear el terreno bajo las ruedas: si no, la
    // suspension se calcularia en una posicion que el rover no llega a ocupar.
    //
    // Empujar fuera en vez de frenar en seco es lo que permite deslizar a lo
    // largo de un bloque en vez de quedarse enganchado contra el.
    state.blocked = false;
    const nearby = rockField.near(state.x, state.z, ROVER_RADIUS);

    for (let i = 0; i < nearby.length; i++) {
      const rock = nearby[i];
      const dx = state.x - rock.x;
      const dz = state.z - rock.z;
      const minimum = rock.collisionRadius + ROVER_RADIUS;
      const squared = dx * dx + dz * dz;

      if (squared >= minimum * minimum) continue;

      const distance = Math.sqrt(squared);
      if (distance < 1e-5) {
        // Centros exactamente superpuestos: no hay direccion util, se sale
        // hacia adelante para no dividir por cero.
        state.x += fx * minimum;
        state.z += fz * minimum;
      } else {
        const push = (minimum - distance) / distance;
        state.x += dx * push;
        state.z += dz * push;
      }

      state.speed *= IMPACT_SLOWDOWN;
      state.blocked = true;
      state.collisions++;
    }

    // --- suspension: 6 rayos contra el terreno ---------------------------
    // El terreno es una funcion analitica exacta, asi que el "raycast" es una
    // evaluacion directa, sin error de interseccion ni coste de busqueda.
    let sum = 0;
    let front = 0;
    let rear = 0;
    let left = 0;
    let right = 0;

    for (let i = 0; i < WHEELS.length; i++) {
      const wheel = WHEELS[i];
      const contact = state.contacts[i];
      wheelWorld(wheel, contact);
      contact.ground = heightAt(contact.x, contact.z);

      sum += contact.ground;
      if (wheel.f > 0) front += contact.ground;
      else if (wheel.f < 0) rear += contact.ground;
      if (wheel.s < 0) left += contact.ground;
      else right += contact.ground;
    }

    const average = sum / WHEELS.length;
    front /= 2;
    rear /= 2;
    left /= 3;
    right /= 3;

    // La inclinacion sale de promedios: es la actitud general del chasis.
    //
    // SIN amortiguar, y es importante. Antes se suavizaba con una exponencial,
    // pero la altura del chasis se calcula A PARTIR de esta inclinacion y se
    // queda con el MAXIMO sobre todos los apoyos. Con la inclinacion retrasada,
    // cada retardo producia un pico en la altura exigida; el maximo convertia
    // ese pico en una subida instantanea, y la gravedad solo podia bajarlo
    // despacio. Resultado: un trinquete que elevaba el rover metro a metro
    // hasta dejarlo volando a 19 m del suelo.
    //
    // El terreno ya es suave — la onda mas corta es de 9 m sobre una distancia
    // entre ejes de 2,3 m — asi que la actitud sin filtrar no tiembla.
    state.pitch = Math.atan2(front - rear, WHEELBASE);
    state.roll = Math.atan2(right - left, TRACK);

    const tanPitch = Math.tan(state.pitch);
    const tanRoll = Math.tan(state.roll);

    // --- altura: la que NO deja ninguna rueda bajo tierra ------------------
    //
    // Antes se usaba la media de los seis contactos, y ese era el fallo: en
    // terreno irregular, la media deja por debajo a las ruedas que estan sobre
    // los puntos altos, y el terreno atraviesa el rover.
    //
    // Un chasis rigido se apoya en sus contactos MAS ALTOS, no en el promedio.
    // Para cada rueda, la altura minima del chasis que la deja justo tocando
    // el suelo es ground - (desplazamiento del plano en esa rueda); la buena
    // es la mayor de todas.
    let wheelRequired = -Infinity;
    for (let i = 0; i < WHEELS.length; i++) {
      const wheel = WHEELS[i];
      const offset = tanPitch * wheel.f + tanRoll * wheel.s;
      wheelRequired = Math.max(wheelRequired, state.contacts[i].ground - offset);
    }

    // Sondas bajo el vientre: una cresta entre ruedas tambien puede atravesar
    // el chasis aunque las seis ruedas esten bien apoyadas.
    let bellyRequired = -Infinity;
    for (let i = 0; i < BELLY_PROBES.length; i++) {
      const probe = BELLY_PROBES[i];
      const px = state.x + rx * probe.s + fx * probe.f;
      const pz = state.z + rz * probe.s + fz * probe.f;
      const offset = tanPitch * probe.f + tanRoll * probe.s;
      bellyRequired = Math.max(bellyRequired, heightAt(px, pz) - offset - BELLY_CLEARANCE);
    }

    // Las ruedas mandan; el vientre solo corrige, y con tope.
    const required =
      Math.max(wheelRequired, Math.min(bellyRequired, wheelRequired + BELLY_LIFT_LIMIT)) - SINK;

    state.liftedByBelly = Number(
      Math.max(0, Math.min(bellyRequired - wheelRequired, BELLY_LIFT_LIMIT)).toFixed(3),
    );

    // Subir es instantaneo: un muelle se comprime de golpe contra un bache, y
    // cualquier retardo aqui deja asomar el terreno a traves del rover.
    // Bajar es caida libre: el chasis no puede descender mas rapido que la
    // gravedad, y tampoco quedarse flotando por encima del suelo.
    if (required >= state.y) {
      state.y = required;
      state.vy = 0;
    } else {
      state.vy -= GRAVITY * dt;
      state.y += state.vy * dt;
      if (state.y <= required) {
        state.y = required;
        state.vy = 0;
      }
    }
    state.airborne = state.vy < -0.05;

    // Recorrido de cada rueda respecto al plano del chasis, y cuanto se
    // "come" el terreno al rover. Esta penetracion es la medida directa del
    // fallo que se corrigio: tiene que quedarse en el hundimiento en arena.
    let grounded = 0;
    let penetration = -Infinity;
    for (let i = 0; i < WHEELS.length; i++) {
      const wheel = WHEELS[i];
      const contact = state.contacts[i];
      const planeHeight = state.y + tanPitch * wheel.f + tanRoll * wheel.s;
      contact.gap = contact.ground - planeHeight; // negativo = rueda en el aire
      contact.travel = Math.max(-0.28, Math.min(0.28, contact.gap));
      penetration = Math.max(penetration, contact.gap);
      if (contact.gap > -0.45) grounded++;
    }
    state.grounded = grounded;
    state.averageGround = average;
    state.penetration = penetration;
    state.maxPenetration = Math.max(state.maxPenetration, penetration);
  }

  return {
    state,
    update,
    /** Velocidad equivalente en el Marte real, en cm/s. */
    get realSpeedCmS() {
      const warp = TIME_WARP; // referencia nominal
      return (Math.abs(state.speed) / warp) * 100;
    },
  };
}
