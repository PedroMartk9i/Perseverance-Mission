# Planes del proyecto

Registro de lo planeado y lo pendiente. Un pedido por sección.

---

# Pedido 1 — El paisaje de Marte

**Estado: EJECUTADO (2026-10-18).** Check en verde, los seis elementos en la captura.

## Contexto

El repo existía con su arquitectura documentada pero **sin una línea de código**:
la decisión del motor bloqueaba todo (`CLAUDE.md` §2.1). Este pedido cerró esa
decisión — **Vite + Three.js** — y desbloqueó la Fase 1.

Objetivo doble:

1. **Primera luz en menos de 2 minutos** tras aprobar: paisaje marciano
   cinematográfico con dunas, rocas, cielo caramelo con polvo, sol de tarde
   cálido con sombras suaves y las dos lunas.
2. **Un lazo de verificación propio** (`npm run check`): abre la página en un
   Chrome invisible con Playwright usando el Chrome ya instalado — sin descargar
   navegadores —, guarda una captura y lista los errores de consola. Se corre
   tras cada mejora grande, **se mira la captura** y se corrige. Máximo 3 rondas.

Listo = cero errores de consola **y** la captura muestra los seis elementos.

La carpeta **no estaba vacía** (tenía el repo git y los documentos). Por eso no
se usó `npm create vite`, que es interactivo y se atasca pidiendo permiso para
sobrescribir: los archivos se escribieron a mano, que además fue más rápido.

## Decisiones tomadas sin consultar

Se preguntaron y el usuario pidió avanzar sin responder.

| Decisión | Elección | Por qué |
|---|---|---|
| Escala de las lunas | Intermedia: sobredimensionadas lo justo para leerse | A escala real Deimos es indistinguible de una estrella y la captura fallaría el criterio de aceptación |
| Cámara | Travelling lento que cede a órbita libre al primer input | Efecto "de película" al abrir, sin perder la inspección |
| Grading | Cinematográfico: ACES, bloom, viñeta, grano | Lo pidió explícitamente |
| Lenguaje | JavaScript ES modules, no TypeScript | Cero fricción para la meta de 2 minutos |
| Hora del día | Tarde avanzada, **no** atardecer | El cielo marciano real es caramelo de día y se vuelve **azul** junto al sol en el crepúsculo |

## Secuencia ejecutada

Orden optimizado para la promesa de los 2 minutos: **nada que no fuera
indispensable para el primer pixel fue antes del primer pixel.**

1. **Escribir todos los archivos** sin instalar nada, respetando la arquitectura
   del README (núcleo puro sin motor, render aparte).
2. **Instalar lo mínimo** (`three`, `vite`) y **prender el servidor**. Aquí se
   cumplió la promesa. La instalación corrió en segundo plano mientras se
   escribía la escena.
3. **Instalar `playwright-core`** — no `playwright`, que descarga ~150 MB de
   navegadores en su postinstall — y construir `npm run check`.
4. **Rondas de mejora**, máximo 3.
5. **Actualizar la documentación** del proyecto.

## Claves técnicas de la escena

- **Dunas**: desplazamiento por ruido *ridged* anisotrópico (comprimido en X,
  estirado en Z), que es lo que produce crestas largas en vez de colinas.
- **Cielo caramelo**: esfera invertida con shader propio y gradiente vertical.
- **Polvo**: `FogExp2` ocre más una capa de motas en suspensión.
- **Sol de tarde**: direccional cálido a 8.6° de elevación — a esa altura la
  sombra de una roca mide más de seis veces su altura.
- **Azimut del sol a 48° de lado**: deliberado. Con el sol de frente, las lunas
  quedaban a contraluz como manchas negras.
- **Señal `window.__SCENE_READY__`** tras varios frames ya renderizados: una
  captura tomada antes del primer frame sale negra, y una captura negra sin
  errores de consola es el peor resultado posible porque parece éxito.

## Las tres rondas, y qué enseñó cada una

| Ronda | Qué reveló la captura | Corrección |
|---|---|---|
| 1 | El polvo eran **cuadrados blancos**: parecía confeti. Más 404 de favicon y dos APIs muertas | Sprite radial; favicon embebido; `PCFSoftShadowMap` → `VSMShadowMap`; fuera `THREE.Clock` |
| 2 | El **bloom se comió el cielo**: sol blanco quemado y caramelo lavado a crema | Bloom 0.42 → 0.16, umbral 0.92, cono de dispersión de 83° a 60°, disco solar 5.5 → 2.6 |
| 3 | — | Verde |

La ronda 2 pasó el check limpia y aun así fue una **regresión visual**. Por eso
el criterio incluía mirar la imagen y no solo el log: una captura puede salir
técnicamente perfecta y verse peor.

## Resultado

- 0 errores, 0 avisos, 0 peticiones fallidas.
- 841.449 triángulos, 30 draw calls, 1200 rocas, 3000 partículas, dos lunas.
- WebGL por SwiftShader en headless: Chrome no toma la RTX 4050 en este portátil
  híbrido. En el navegador normal se ve igual pero mucho más fluido.

---

# Pedido 2 — El rover de verdad

**Estado: EJECUTADO (2026-10-18).** Check en verde. Tres rondas, el presupuesto
completo. Lo que se encontró por el camino está al final, en "Hallazgos".

## Contexto

Hoy el proyecto es un paisaje: se controla la cámara, no un vehículo. Este
pedido trae el rover real y lo convierte en algo conducible. Cierra la parte que
quedó marcada como *parcial* en la Fase 1 del `CLAUDE.md`.

## La fuente, ya verificada

No hay que convertir nada desde Blender. La NASA publica el `.glb`:

| Dato | Valor |
|---|---|
| Repo | `nasa/NASA-3D-Resources`, rama `master` |
| Ruta | `3D Models/Mars 2020 Perseverance Rover/Mars 2020 Perseverance Rover.glb` |
| Tamaño | 4.76 MB, glTF binario |
| Licencia | "These assets are free and without copyright" (README de NASA) |
| Crédito | `NASA/JPL-Caltech` |

**No se versiona en el repo.** El `.gitignore` ya excluye `*.glb` y declara que
los activos pesados se descargan con scripts. Se añade
`npm run fetch:model`, que lo baja a `public/models/perseverance.glb`. Así el
repo queda ligero y la procedencia del activo es una URL, no un binario opaco.

## Las dos sorpresas de escala

Esto es lo que no se ve venir hasta que se pone el rover en el terreno, y
cambia el plan entero.

**1. A escala real, el rover es diminuto.** Perseverance mide ~3 m de largo,
2.7 m de ancho y 2.2 m de alto. El encuadre actual tiene la cámara a 26 m de
altura mirando a 400 m: el rover sería una mota de pocos píxeles. La cámara de
seguimiento tiene que ir a ~9 m detrás y ~4 m arriba, y el encuadre de las
capturas hay que rehacerlo.

**2. A escala real, las dunas son montañas.** El terreno actual tiene
ondulaciones de ±120 m y dunas de 44 m. Al lado de un vehículo de 3 m eso no son
dunas, son cordilleras. **Propuesta: bajar la amplitud del relieve** a ~35 m de
ondulación y ~9 m de duna. El paisaje se ve igual de bien porque la escala es
relativa — lo único que cambia es que empieza a tener sentido.

**3. A velocidad real, es injugable.** Perseverance avanza a 4,2 cm/s: recorrer
su propio largo le toma más de un minuto. Habrá aceleración de tiempo con la
velocidad real mostrada en pantalla, declarada como tal, no disimulada.

## Alcance

### a. Cargar el modelo

`GLTFLoader`, medir el `Box3` del modelo y **escalarlo para que el largo real
sea 3 m**, verificando contra el diámetro de rueda conocido (52,5 cm). No se
confía en las unidades internas del archivo: se miden.

### b. Nombres de las piezas cámara en consola

Recorrer el grafo del glTF y volcar **todos** los nombres de nodo, resaltando
los que casen con las familias reales de cámaras del rover: Mastcam-Z, Navcam,
Hazcam, SuperCam/RMI, SHERLOC/WATSON, PIXL, CacheCam. Perseverance lleva 23
cámaras en total. Se publican en `window.__ROVER_PARTS__` para que el check los
capture.

**Riesgo honesto:** puede que el modelo tenga nombres genéricos tipo `mesh_014`.
Por eso se vuelca la lista completa y no solo los filtrados — si no hay nombres
útiles, lo sabremos en el primer minuto y lo diremos, en vez de inventar un
mapeo.

### c. Física en las llantas

**Suspensión por raycast, sin motor de física.** Cada una de las 6 ruedas lanza
un rayo hacia abajo contra `heightAt()` y aplica un muelle-amortiguador; el
chasis deriva su inclinación de los puntos de contacto. Las ruedas giran en
proporción a la velocidad.

Por qué no Rapier: el terreno es una **función analítica exacta**, así que el
raycast es trivial y sin error. Un motor de física tendría que aproximar esa
misma función con un heightfield y añadiría una dependencia WASM. Rapier se
justifica cuando queramos colisión rover-contra-roca y articulaciones
rocker-bogie reales — que es justamente el diferenciador pendiente del README,
y este raycast es su cimiento, no un desvío.

### d. Conducción WASD

`W`/`S` acelerar y retroceder, `A`/`D` girar, `Shift` aceleración de tiempo.
Giro diferencial de 6 ruedas, no de coche.

### e. Huellas

Pool de quads planos instanciados, soltados en el punto de contacto de cada
rueda, alineados a la normal del terreno y desvaneciéndose con la distancia.

**Dato que no vamos a inventar:** las ruedas de *Curiosity* estampan "JPL" en
código Morse. Las de *Perseverance* no — es un diseño distinto. La huella será
el patrón de tacos real, sin el guiño que no le corresponde.

### f. Cámara que lo sigue

Rig en tercera persona con muelle-amortiguador, detrás y por encima, mirando
algo por delante del rover. Se conserva `?shot=hero` para las capturas, con
encuadre nuevo que ahora debe **mostrar el rover**.

## Archivos

Respetando la arquitectura publicada en el README:

```
scripts/fetch-model.mjs          descarga del .glb desde NASA
src/app/input.js                 estado del teclado
src/sim/rover.js                 suspensión de 6 ruedas, dirección, velocidad
src/render/rover-model.js        carga del glTF, escalado, descubrimiento de piezas
src/render/tracks.js             huellas
src/render/follow-camera.js      cámara en tercera persona
```

Tocados: `src/main.js`, `src/render/terrain.js` (amplitud), `scripts/check.mjs`,
`package.json`, `CLAUDE.md`.

## Verificación

Mismo lazo que el pedido 1: máximo 3 rondas, y **se mira la captura**.

1. `npm run check` sale con código 0.
2. El diagnóstico confirma: modelo cargado, 6 ruedas en contacto, lista de
   piezas volcada, escala del rover entre 2,8 y 3,2 m.
3. Reviso la captura contra esta lista:
   - [ ] El rover se reconoce como Perseverance, no como una caja
   - [ ] Apoyado en el suelo, sin flotar ni hundirse
   - [ ] Tamaño creíble contra las rocas del entorno
   - [ ] Huellas visibles detrás
   - [ ] El paisaje del pedido 1 sigue intacto
4. Conducción real en el navegador: WASD, inclinación sobre las dunas, cámara
   siguiendo sin tirones.

**Riesgo principal:** que el `.glb` venga con la geometría muy densa o con
nombres inservibles. Si pesa demasiado para el render por software, el check
puede necesitar más margen de tiempo — pero eso afecta a la verificación, no a
lo que tú ves en pantalla.

## Hallazgos de la ejecución

### 1. El `.glb` viene comprimido con Draco

Por eso 68 mallas caben en 4,76 MB. `GLTFLoader` no lo descomprime solo y falla
con `No DRACOLoader instance provided`. El decodificador ya viene dentro del
paquete `three`; `npm run fetch:model` lo copia a `public/draco/` para servirlo
en local y no depender de un CDN externo en tiempo de ejecución.

### 2. Las 6 ruedas son UNA sola malla

`Wheels_objs` es un único nodo con una única malla, sin hijos. No se pueden
direccionar las ruedas por separado, así que **no giran individualmente**.

Lo que sí hay es física real de 6 puntos: cada rueda evalúa el terreno en su
posición y el chasis deriva su altura, cabeceo y alabeo de esos seis contactos,
con muelle amortiguado. El rover se inclina de verdad al subir una duna.

Separar las ruedas exigiría partir la malla agrupando vértices, y el ancho de
vía (2,4 m) y la distancia entre ejes (2,3 m) son casi iguales, así que no hay
forma fiable de deducir qué eje horizontal es cuál. Queda como trabajo del
diferenciador rocker-bogie del README, que es donde de verdad corresponde.

### 3. Aplanar el terreno apagó la escena

Al bajar la amplitud del relieve para que encajara con un rover de 3 m, la
imagen se volvió oscura y sucia. La causa no era la exposición: con el sol a
8,6°, una superficie horizontal recibe luz **de refilón** y apenas se ilumina.
Eran las caras inclinadas de las dunas grandes las que encendían la escena.

Se arregló devolviendo relieve de escala pequeña — dunas de ~30 m de onda y
ondulaciones de viento métricas — y subiendo el sol a 11°. El relieve pequeño
no es decoración: es lo que le da superficies a la luz.

### 4. La altura medida no cuadra

Calibrando por diámetro de rueda, el modelo da **3,1 × 2,7 × 1,84 m** contra los
3,0 × 2,7 × 2,2 m publicados. Largo y ancho encajan, así que la escala es
correcta. La altura se queda corta, probablemente porque el mástil está modelado
en una pose más baja que la desplegada. **No verificado** — queda anotado.

### 5. El patrón de "cámara" pescaba tornillos

El filtro por nombre devolvía 29 piezas, pero la mayoría eran soportes y tapas
con número de parte (`10461516-101_A3-FRONT_HAZCAM_LENS_COVER_MOUNTING_BRACKET…`).
Se separaron los herrajes y quedan **9 piezas utilizables**: `lens`,
`Mastcam_Z_cams`, `NavCams`, `hazcams_front`, `hazcams_rear`, `PIXL`, `WATSON`,
`Up_Look_Camera`, `Down_Look_Camera`.

## Pendiente, declarado

- **Las ruedas no giran** (ver hallazgo 2).
- En el encuadre congelado de la captura, **Fobos queda recortado** en la
  esquina superior izquierda. Es un problema de ese plano fijo, no del juego:
  conduciendo, las lunas entran en cuadro en cuanto el rover gira.

---

# Pedido 3 — Correcciones: el rover atravesaba el terreno

**Estado: EJECUTADO (2026-10-18).** Verificado con 10 recorridos distintos.

Reportado: el rover atraviesa el terreno al cambiar de altura, las huellas no se
notan, y falta poder orbitar la cámara con el ratón y hacer zoom.

## La causa común de los dos primeros

No eran dos fallos, era uno: **la malla visible y la superficie física no eran
la misma cosa.** El terreno se dibujaba con cuadros de 16,7 m (6 km / 360
divisiones) mientras la suspensión evaluaba la función de altura exacta. Donde
el triángulo gordo quedaba por encima de la curva real, el suelo asomaba a
través del rover; y las huellas, colocadas sobre la curva exacta, quedaban
enterradas bajo la malla.

Solución: un **parche de 170 m con resolución de 1 m que sigue al rover**
(`detail-terrain.js`) y se reconstruye cuando el vehículo se aleja 22 m. El
coloreado se extrajo a `sand.js` para que ambas mallas lo compartan — si cada
una calculara su color por separado, la costura entre ellas se vería.

## Tres fallos encadenados en la suspensión

Cada arreglo destapó el siguiente. Los tres se encontraron **midiendo**, no
mirando: con un modo `?drive=N` que conduce el rover N segundos antes de
capturar, porque el fallo solo aparecía en movimiento y una captura estática
siempre cae en el mismo trozo de duna.

1. **El chasis se apoyaba en el PROMEDIO de los seis contactos.** En terreno
   irregular eso deja por debajo a las ruedas de los puntos altos. Un chasis
   rígido se apoya en sus contactos más altos. Corregido con el máximo, más
   sondas bajo el vientre.

2. **Las sondas del vientre hacían de gato hidráulico.** Pedían 55 cm de luz en
   puntos que caían por fuera de la distancia entre ejes, así que en una cresta
   levantaban el vehículo entero medio metro y las seis ruedas quedaban en el
   aire. Corregido metiendo las sondas dentro de la batalla y limitando a 18 cm
   cuánto puede el vientre corregir la altura que piden las ruedas.

3. **Un trinquete entre la inclinación y la altura.** La inclinación iba
   amortiguada, pero la altura se calculaba *a partir de* esa inclinación
   retrasada y se quedaba con el máximo. Cada retardo producía un pico; el
   máximo lo convertía en subida instantánea y la gravedad solo podía bajarlo
   despacio. El rover se trepaba solo hasta volar a 19 m del suelo. Corregido
   quitando la amortiguación de la actitud: la altura no puede depender de un
   valor con retardo.

También se cambió el suavizado exponencial de la altura por **caída con
gravedad**: subir es instantáneo (un muelle se comprime de golpe contra un
bache) y bajar es caída libre.

## Un bug encontrado de rebote

El HUD marcaba **20,7 m/s** cuando el máximo posible son 5,04. Una amortiguación
exponencial no puede sobrepasar su objetivo — salvo con `dt` negativo, y
`requestAnimationFrame` puede entregar una marca de tiempo anterior a un
`performance.now()` llamado después de programar el frame. Con `dt` negativo el
suavizado invierte el signo y se aleja de su objetivo. Corregido acotando `dt`
por abajo a cero.

## Cámara

`orbit-rig.js` reemplaza a la antigua cámara de seguimiento. El rover está
siempre en el centro: el objetivo de la órbita se mueve con él y la cámara se
desplaza el mismo vector, así que el ángulo y el zoom elegidos se conservan
mientras se conduce. Zoom de 3 m (inspección de piezas) a 220 m. Hasta que el
usuario toca el ratón, la cámara se coloca sola detrás; con **C** vuelve ahí.

## Verificación

`?drive=N` más una sonda sobre 10 duraciones (0 a 300 s):

| Métrica | Resultado |
|---|---|
| Ruedas apoyadas | **6/6 en los 10 casos** |
| Penetración máxima | **5,0 cm clavados** — el hundimiento en arena previsto |
| Peor separación rueda-suelo | 17 cm |
| Velocidades imposibles | ninguna |
| Errores de consola | 0 |

---

# Pedido 4 — "No aparece el rover en pantalla"

**Estado: EJECUTADO (2026-10-18).** Tres rondas. Check en verde.

## Ronda 1 — reproducir, no suponer

Abriendo la URL tal cual (sin parámetros) el rover **sí aparecía**, sin errores.
Así que el fallo era durante la conducción. Para poder detectarlo sin depender
de mirar la imagen, se añadió `window.__LIVE__`, que **proyecta el rover a
coordenadas de pantalla** cada frame: `onScreen` es la medida objetiva de "el
rover desapareció".

Conduciendo con el teclado de verdad (no simulado) apareció un primer fallo: la
**cámara se alejaba sola**, 12,5 → 13,5 m en veinte segundos y subiendo. Al
recolocarse detrás del rover usaba la distancia **3D** como si fuera la
horizontal, y como `sqrt(d² + h²) > d`, el punto destino quedaba siempre un poco
más lejos que el actual. Un bucle que se realimenta. Reescrito en coordenadas
**esféricas**, donde solo se corrige el azimut y el radio sencillamente no se
toca. Deriva medida después: **0,00 m**.

## Ronda 2 — la causa real

La pista era "al tocar montaña". Los cerros del horizonte eran **mallas
decorativas que el terreno no conocía**: uno de 946 m de ancho y 202 m de alto
en (1790, 65), donde `heightAt` devolvía −7,4 m de llanura. El rover no subía la
montaña: **entraba dentro**, y la cámara con él. El vehículo quedaba tapado por
el interior del cerro.

Arreglo: el borde del cráter pasa a ser **parte de la función de altura** — un
anillo a 2,3 km, de 70 a 220 m de alto — y las mallas decorativas se eliminan
(`horizon.js` borrado).

**La regla que deja esto, y que conviene no olvidar:** en este proyecto, todo lo
que se ve con volumen es terreno conducible. Si algo tiene que estorbar, vive en
`heightAt()`. Dibujar un obstáculo que la física desconoce es dibujar una
mentira.

Se añadió `?at=x,z` para arrancar el rover donde se quiera y poder probar sitios
concretos sin conducir 2 km hasta ellos.

## Ronda 3 — verificación

| Sitio | Altura | Resultado |
|---|---|---|
| Llano de partida | 16 m | rover en pantalla, 6/6 ruedas |
| Falda del borde | 72 m | rover en pantalla, 6/6 ruedas |
| Cima del borde | 152 m | rover en pantalla, 6/6 ruedas |
| Borde opuesto | 181 m | rover en pantalla, 6/6 ruedas |

Cero errores de consola, deriva de cámara 0,00 m, penetración 5,0 cm.

## Pendiente, declarado

**Las rocas siguen sin colisión.** Es exactamente la misma clase de fallo que se
acaba de corregir, a menor escala: hay bloques de hasta 3,9 m que el rover
atraviesa. No se tocó porque el presupuesto de rondas se agotó en el fallo
reportado, pero la deuda queda anotada.

---

# Pedido 5 — Shift al doble, polvareda y terreno

**Estado: EJECUTADO (2026-10-18).** Tres rondas. Check en verde.

## Los "charcos", las huellas y las llantas eran UN solo fallo

Las manchas lisas sin grano que parecían charcos **eran el terreno lejano
asomando por encima del parche de detalle**. Con celdas de 16,7 m esa malla no
puede representar ni las ondulaciones de viento (9 m de onda) ni las dunas
menores (33 m): las interpola en línea recta y se queda hasta ~2 m por encima
de la superficie real.

De ahí salían los tres síntomas:

- **Charcos**: donde la malla gruesa gana el test de profundidad, se ve una
  superficie lisa, sin el grano fino de la arena.
- **Huellas que desaparecen**: quedaban enterradas bajo esas manchas.
- **Llantas que traspasan**: la física usa la superficie real; lo dibujado
  estaba más alto.

`polygonOffset` no podía arreglarlo porque **no era z-fighting**: la malla
gruesa estaba genuinamente delante. La solución es recortarla — descartar sus
fragmentos dentro del área que cubre el parche — con un `discard` inyectado por
`onBeforeCompile`. El recorte va 7 m más pequeño que el parche para que en esa
franja de solape mande el test de profundidad normal y no quede una grieta.

Como el recorte deja un agujero, el terreno lejano **ya no proyecta sombra**: el
frustum de sombras cubre 60 m alrededor del rover y esa zona está siempre dentro
del parche, así que proyectaría desde una superficie equivocada.

## Huellas a alta velocidad

A 21 m/s el rover avanza más de un metro entre frames, y se estampaba **una sola
marca por frame**: el rastro salía a trozos, y cuanto más rápido, más invisible.
Ahora se rellena el hueco con marcas intermedias interpoladas.

## Polvareda

`plume.js`: motas instanciadas con shader propio, nacen en el contacto de las
ruedas traseras, salen despedidas hacia atrás, suben, crecen y se desvanecen.
Mezcla normal y no aditiva — el polvo marciano tapa, no brilla.

Dos iteraciones hicieron falta, y las dos por la misma razón de fondo:

1. **Pocas y grandes** parecían palomitas. Una nube se lee por acumulación de
   partículas que se solapan, no por partículas individuales.
2. **Emitidas en un punto** dejaban grumos separados cada metro. Se reparten a
   lo largo del tramo que recorrió la rueda en ese frame — exactamente el mismo
   arreglo que necesitaron las huellas.

## Velocidad

`TIME_WARP_BOOST` de 350 a **700**. Shift pasa de 14,7 a 29,4 m/s simulados,
que son 4,2 cm/s reales acelerados — la velocidad real del rover no cambia,
solo el factor de reproducción, y el HUD lo declara.

## Nota de medición

Las capturas se toman con render por software, donde el `dt` va topado a 0,05 s
y el tiempo simulado avanza unas diez veces más lento que el real. La polvareda
se ve más granulada ahí que en una GPU a 60 fps, donde la emisión cae mucho más
junta. Lo que se mide (motas vivas, continuidad del rastro) sí es fiable.
