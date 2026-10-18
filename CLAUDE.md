# Perseverance — Simulador de exploración en Jezero

Instrucciones de proyecto para Claude Code. Léelas completas al inicio de cada sesión.

> No confundir con `mensaje perseverance.md`, que es un texto inspiracional y no
> tiene relación con el código.

---

## 1. Qué estamos construyendo

Un **simulador en tercera persona** donde el jugador conduce el rover
Perseverance por el cráter Jezero (Marte) y explora el terreno.

Contexto: esto acompaña un curso de Claude Code de Platzi. El profesor construye
un simulador equivalente y su resultado es bueno. **El objetivo declarado es
igualarlo y superarlo**, no imitarlo. La estrategia para superarlo no es "más
gráficos": es **profundidad real** — que el simulador enseñe algo verdadero sobre
la misión que el del profesor no cuenta.

---

## 2. Decisiones PENDIENTES — no las cierres por tu cuenta

### 2.1 Stack técnico — DECIDIDO (2026-10-18)

**Vite + Three.js + JavaScript ES modules.**

Versiones instaladas: `three` 0.186.1, `vite` 8.3.4, y `playwright-core` 1.64.1
como dependencia de desarrollo para `npm run check`. Entorno: Node v24.14.1,
npm 11.11.0, git 2.47.1, Windows 11, PowerShell.

Queda una reserva honesta: el usuario quería igualar el stack del profesor del
curso y todavía no lo ha visto. Vite + Three.js es la apuesta más probable, y
la decisión es barata de revisar — si resulta ser otro motor, lo que se pierde
es la capa de render, nunca el núcleo.

**JavaScript y no TypeScript**: decisión de velocidad para la primera entrega.
Vite transpila `.ts` sin configuración extra, así que migrar es poco más que
cambiar extensiones.

#### Trampas de three 0.186 ya encontradas

Dos APIs muy citadas en tutoriales ya no existen y **fallan en silencio**:

- `THREE.PCFSoftShadowMap` fue eliminado y hace fallback a PCF duro sin avisar
  más que por consola. Para sombras suaves hay que usar `THREE.VSMShadowMap`,
  el único tipo que todavía respeta `shadow.radius`.
- `THREE.Clock` está deprecado en favor de `THREE.Timer`. Aquí el delta se
  calcula directo del timestamp de `requestAnimationFrame`, sin ninguno de los dos.

### 2.3 Entorno — riesgo conocido

El proyecto vive **dentro de OneDrive**. `node_modules` se sincroniza, lo que
puede provocar errores de bloqueo de archivos (EPERM/EBUSY) en instalaciones y
HMR lento. No ha dado problemas hasta ahora; si aparecen, la salida es pausar
la sincronización de OneDrive mientras se trabaja.

### 2.2 Diferenciadores — SIN DEFINIR (excepto §3)

Se evaluaron cuatro ejes para "ser mejor". El usuario **solo confirmó uno**
(§3). Los otros tres quedan en espera y **no deben implementarse ni asumirse**:

- Terreno real de Jezero desde DEM de NASA — *pendiente*
- Suspensión rocker-bogie articulada de 6 ruedas — *pendiente*
- Fidelidad científica (gravedad, energía MMRTG, sol marciano) — *pendiente*

No los borres: es probable que entren después. Pregunta antes de activarlos.

---

## 3. Pilar CONFIRMADO: misiones e instrumentos con referencias reales

Esto es el corazón del proyecto y lo que lo vuelve mejor que el del profesor.

**La idea, en palabras del usuario:** usar detalles de misiones publicadas, su
referencia geográfica real, marcarla en un mapa, y que al llegar te dé una
**nota histórica** de lo que ocurrió ahí.

### 3.1 Cómo funciona

1. El cráter Jezero tiene **waypoints en sus coordenadas reales**, tomados del
   recorrido verdadero del rover desde 2021.
2. Cada waypoint arranca **bloqueado** en el mapa (solo silueta).
3. Al conducir físicamente hasta él (radio de proximidad configurable), se
   **desbloquea su ficha histórica**: qué pasó ahí, en qué sol, con qué
   instrumento, qué se encontró y por qué importó.
4. Un **mapa orbital** (tecla `M`) muestra el cráter, la trayectoria real, los
   pines y la posición actual del jugador.
5. Una **bitácora cronológica** acumula lo desbloqueado, para que el juego
   funcione también como museo recorrible.

### 3.2 Regla de oro: ningún dato sin fuente

**Cada afirmación histórica que vea el jugador lleva una URL de fuente oficial
en los datos.** Sin fuente verificada, la entrada se queda en
`"estado": "por-verificar"` y **no se muestra en el juego**.

No escribas notas históricas desde memoria — ni tú ni yo somos la fuente. Se
consultan y se citan. Esta regla es la que convierte el proyecto en algo
defendible frente a cualquier otro simulador.

### 3.3 Esquema de datos

`data/missions/waypoints.json` — una entrada por sitio:

```json
{
  "id": "octavia-e-butler-landing",
  "nombre": "Octavia E. Butler Landing",
  "sol": 0,
  "fechaTierra": "2021-02-18",
  "coordenadas": { "lat": 18.4447, "lon": 77.4508 },
  "unidadGeologica": "suelo del cráter",
  "instrumentos": ["Mastcam-Z", "MEDA"],
  "nota": "Qué ocurrió aquí, en 2-4 frases.",
  "porQueImporta": "Una frase sobre su relevancia científica.",
  "fuentes": [{ "titulo": "", "url": "", "consultado": "2026-10-18" }],
  "imagenes": [{ "url": "", "credito": "NASA/JPL-Caltech", "licencia": "" }],
  "estado": "por-verificar"
}
```

### 3.4 Conversión de coordenadas marcianas a mundo 3D

Plano tangente local centrado en el punto de aterrizaje. Constantes:

- Radio medio de Marte: `R = 3389500 m`
- Metros por grado de latitud: `R * PI/180` ≈ `59158 m`
- Metros por grado de longitud a la latitud de Jezero (~18.44°):
  `59158 * cos(18.4447°)` ≈ `56124 m`

Mantén esta conversión en **un solo módulo** y cúbrela con tests. Un error de
signo aquí desplaza todos los waypoints y es difícil de detectar a ojo.

### 3.5 Instrumentos como mecánicas

Cada instrumento real debe hacer algo distinto, no ser un botón decorativo:

| Instrumento | Mecánica propuesta |
|---|---|
| Mastcam-Z | Modo foto con zoom; FOV real; las fotos entran a la bitácora |
| SuperCam | Láser a distancia sobre un objetivo, devuelve composición |
| PIXL / SHERLOC | Montados en el brazo; requieren acercarse y desplegar |
| RIMFAX | Radar de subsuelo, corte transversal del terreno bajo el rover |
| MEDA | Lectura ambiental (temperatura, viento, presión, opacidad) |
| Taladro + tubos | Muestreo: perforar, sellar, registrar el tubo usado |

---

## 4. Fuentes oficiales (punto de partida para investigar)

- Misión: https://science.nasa.gov/mission/mars-2020-perseverance/
- Sitio de misión: https://mars.nasa.gov/mars2020/
- Dónde está el rover (trayectoria real): https://mars.nasa.gov/mars2020/mission/where-is-the-rover/
- Imágenes crudas: https://mars.nasa.gov/mars2020/multimedia/raw-images/
- Mapas y DEM de Marte: https://trek.nasa.gov/mars/
- DTM de HiRISE: https://www.uahirise.org/dtm/
- Analyst's Notebook (datos PDS): https://an.rsl.wustl.edu/
- Modelos 3D de NASA: https://science.nasa.gov/3d-resources/
- Portal de APIs: https://api.nasa.gov/

Los endpoints JSON exactos se descubren en el momento de implementar; **no
inventes URLs de API**. Si una fuente no responde, registra el fallo en el dato
en lugar de rellenar el hueco a mano.

**Créditos:** el material de NASA es de dominio público pero debe acreditarse
(`NASA/JPL-Caltech`, y el instrumento cuando aplique). Algunas imágenes tienen
restricciones de terceros: verifica antes de incluirlas.

---

## 5. Hoja de ruta

**Fase 0 — Capa de datos (agnóstica del stack). Se puede hacer YA.**
Investigar y construir `data/missions/waypoints.json` con waypoints reales
verificados y sus fuentes. Módulo de conversión de coordenadas + tests.
Esto no toca el motor, así que ningún trabajo se pierde cuando se decida §2.1.

**Fase 1 — Esqueleto jugable.** COMPLETA (2026-10-18). Escena, dunas
procedurales, rocas, cielo, polvo, iluminación, dos lunas, post-proceso,
`npm run check` como lazo de verificación por captura, y el rover oficial de la
NASA a escala real conducible con WASD, con suspensión de 6 puntos, huellas y
cámara en tercera persona.

Detalles de la ejecución y lo que quedó declarado como pendiente: ver `plan.md`.
Dos que conviene tener presentes al tocar el rover:

- El `.glb` de la NASA está **comprimido con Draco**. El decodificador se sirve
  desde `public/draco/`, que copia `npm run fetch:model`. Sin él, `GLTFLoader`
  falla con `No DRACOLoader instance provided`.
- `Wheels_objs` es **una sola malla**: las 6 ruedas no se pueden direccionar por
  separado y por eso no giran. La física de contacto sí es de 6 puntos.

**Fase 2 — Mapa y bitácora.** Mapa orbital, pines, proximidad, desbloqueo,
fichas históricas. Aquí aterriza §3.

**Fase 3 — Instrumentos.** Las mecánicas de §3.5.

**Fase 4 — Pulido.** Lo que decidamos de §2.2, audio, rendimiento, deploy.

Al cerrar cada fase, actualiza este archivo.

---

## 6. Barra de calidad

- **Honestidad por encima de espectáculo.** Si un dato no está verificado, no se
  muestra. Nada de cifras inventadas en el HUD.
- **El jugador aprende algo cierto.** Si alguien termina el simulador sabiendo
  cosas reales de Jezero, ganamos. Ahí es donde se supera al del profesor.
- **Nada de datos quemados en los componentes.** Misiones, coordenadas y notas
  viven en `data/`, nunca en el código de render.
- **Un módulo, una responsabilidad.** Conversión de coordenadas, carga de datos,
  física y UI separados y testeables por su cuenta.
- **Se juega en cada entrega.** Ninguna fase se declara lista sin verla correr.

---

## 7. Convenciones de trabajo

- Rutas con espacios: la carpeta padre es `Claude Code Course`. Entrecomilla
  siempre en la terminal.
- `git` está disponible pero **el proyecto aún no es un repo**. Ofrece
  `git init` cuando empiece a haber código; no lo hagas sin avisar.
- Shell: PowerShell como principal; Bash disponible. No mezclar sintaxis.
- Idioma: documentación, UI y notas históricas **en español**. Identificadores
  de código en inglés.
- Commits: solo cuando el usuario lo pida.

---

## 8. Anti-objetivos

- No copiar el proyecto del profesor. Referencia, no plantilla.
- No terreno procedural disfrazado de Marte real. O es dato de NASA, o se dice
  claramente que es una aproximación.
- No gamificación falsa (puntos, logros vacíos). La recompensa es el hallazgo.
- No scope creep hacia multijugador, VR o misiones ficticias mientras §3 no esté
  terminado y verificado.

---

## 9. Dudas abiertas para el usuario

1. ¿Cuál es el stack del profesor? (bloquea la Fase 1)
2. ¿Qué pasa con los tres diferenciadores en espera de §2.2?
3. ¿Hasta qué momento de la misión queremos cubrir? El rover sigue operando, así
   que hay que fijar un corte temporal y datarlo.
