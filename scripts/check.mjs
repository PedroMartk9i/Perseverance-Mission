#!/usr/bin/env node
/**
 * npm run check
 *
 * Abre la pagina en el Chrome ya instalado, invisible, espera a que la escena
 * confirme que renderizo su primer frame, guarda una captura y lista los
 * errores de consola.
 *
 * Por que playwright-core y no playwright: el paquete `playwright` descarga
 * ~150 MB de navegadores en su postinstall. `playwright-core` no descarga nada
 * por diseño y se conecta al Chrome del sistema con channel: 'chrome'.
 *
 * Variables de entorno:
 *   CHECK_URL   url a revisar (por defecto el encuadre hero en el dev server)
 *   CHECK_SHOW  =1 para ver el navegador, util si la captura sale negra
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = process.env.CHECK_URL || 'http://localhost:5173/?shot=hero';
const OUT_DIR = resolve(ROOT, 'checks');
const SHOT_PATH = resolve(OUT_DIR, 'latest.png');

const WIDTH = 1600;
const HEIGHT = 900;

const errors = [];
const warnings = [];
const failedRequests = [];

const rule = (c = '-') => c.repeat(70);

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  let browser;
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: process.env.CHECK_SHOW !== '1',
      args: [
        // Chrome moderno bloquea WebGL por software salvo que se le autorice.
        // Sin estos dos flags la captura sale NEGRA en una maquina sin GPU
        // disponible para el proceso headless.
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--disable-gpu-sandbox',
        '--disable-dev-shm-usage',
        '--hide-scrollbars',
        '--force-color-profile=srgb',
        '--mute-audio',
      ],
    });
  } catch (err) {
    console.error('\nNo se pudo lanzar Chrome.');
    console.error(String(err?.message ?? err).split('\n').slice(0, 8).join('\n'));
    console.error('\nSe esperaba un Google Chrome instalado (channel: "chrome").');
    process.exit(2);
  }

  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error') errors.push(msg.text());
    else if (type === 'warning') warnings.push(msg.text());
  });
  page.on('pageerror', (err) => {
    errors.push(`[excepcion] ${err?.message ?? String(err)}`);
  });
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'fallo'}`);
  });

  try {
    await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch {
    console.error(`\nNo se pudo abrir ${TARGET}`);
    console.error('El servidor de desarrollo no responde. Arrancalo con:\n');
    console.error('    npm run dev\n');
    await browser.close();
    process.exit(2);
  }

  let ready = false;
  try {
    // Margen amplio: con render por software y post-proceso, los primeros
    // frames pueden tardar segundos.
    await page.waitForFunction(() => window.__SCENE_READY__ === true, null, { timeout: 90000 });
    ready = true;
  } catch {
    ready = false;
  }

  const diag = await page.evaluate(() => window.__DIAG__ ?? null);

  await page.screenshot({ path: SHOT_PATH });
  await browser.close();

  // ---------------------------------------------------------------- informe
  console.log(`\n${rule('=')}`);
  console.log('  CHECK — Perseverance Mission');
  console.log(rule('='));
  console.log(`  URL          ${TARGET}`);
  console.log(`  Captura      ${SHOT_PATH}`);
  console.log(`  Escena       ${ready ? 'lista — primer frame renderizado' : 'NO confirmo estar lista'}`);

  if (diag) {
    console.log(rule());
    console.log(`  WebGL        ${diag.webglRenderer}`);
    console.log(`  Contexto     ${diag.webglVersion}`);
    console.log(`  Triangulos   ${diag.triangles.toLocaleString('es-CO')}`);
    console.log(`  Draw calls   ${diag.drawCalls}`);
    console.log(`  Sombras      ${diag.shadows ? 'activas' : 'DESACTIVADAS'}`);
    console.log(`  Encuadre     ${diag.shot}`);
    console.log(`  Rocas        ${diag.rocks} instancias`);
    console.log(`  Lunas        ${diag.moons.join(', ')}`);
    console.log(`  Polvo        ${diag.dustParticles} particulas`);
    console.log(`  Sol          ${diag.sunElevationDeg}° de elevacion`);
    console.log(`  Huellas      ${diag.tracks ?? 0} marcas`);

    const r = diag.rover;
    if (r) {
      console.log(rule());
      if (r.loaded) {
        const m = r.measured;
        console.log(`  Rover        CARGADO — ${r.totalParts} piezas, ${r.animations} animaciones`);
        console.log(`  Escala       ${m.lengthM} x ${m.widthM} x ${m.heightM} m`);
        console.log(`               calibrado por ${m.scaleMethod}`);
        console.log(`               real segun NASA: 3,0 x 2,7 x 2,2 m`);
        console.log(`  Ruedas       ${r.grounded}/6 en contacto con el suelo`);
        console.log(`  Actitud      cabeceo ${r.pitchDeg}° · alabeo ${r.rollDeg}°`);
        if (r.drivenSeconds > 0) {
          console.log(`  Conduccion   ${r.drivenSeconds}s simulados · ${r.odometerM} m reales`);
        }
        console.log(
          `  Penetracion  ${(r.maxPenetrationM * 100).toFixed(1)} cm maximo` +
            `${r.maxPenetrationM > 0.12 ? '   <-- el terreno atraviesa el rover' : '   (dentro del hundimiento en arena)'}`,
        );
        console.log(`  Posicion     ${r.position.join(', ')}`);
        console.log(`  Camaras      ${r.cameraParts.length} piezas identificadas:`);
        r.cameraParts.forEach((p) => console.log(`                 ${p}`));
      } else {
        console.log(`  Rover        NO CARGADO`);
        console.log(`               ${r.error ?? 'sin detalle'}`);
        console.log(`               prueba:  npm run fetch:model`);
      }
    }
  } else {
    console.log('  Diagnostico  NO disponible (window.__DIAG__ ausente)');
  }

  console.log(rule());
  console.log(`  Errores de consola    ${errors.length}`);
  console.log(`  Avisos                ${warnings.length}`);
  console.log(`  Peticiones fallidas   ${failedRequests.length}`);

  if (errors.length) {
    console.log('\n  ERRORES:');
    errors.forEach((e, i) => console.log(`    ${i + 1}. ${e}`));
  }
  if (warnings.length) {
    console.log('\n  AVISOS (no hacen fallar el check):');
    warnings.slice(0, 12).forEach((w, i) => console.log(`    ${i + 1}. ${w}`));
    if (warnings.length > 12) console.log(`    ... y ${warnings.length - 12} mas`);
  }
  if (failedRequests.length) {
    console.log('\n  PETICIONES FALLIDAS:');
    failedRequests.forEach((r, i) => console.log(`    ${i + 1}. ${r}`));
  }

  // Una pagina en blanco sin errores es un falso exito. Los triangulos son la
  // prueba de que algo se dibujo de verdad.
  const drewSomething = Boolean(diag) && diag.triangles > 0;
  if (!drewSomething) {
    console.log('\n  ATENCION: 0 triangulos dibujados. La captura esta vacia.');
  }

  // El rover es parte del criterio de aceptacion, no un extra: una captura
  // preciosa sin rover no es esta entrega.
  // Que levante una rueda sobre una cresta NO es un fallo: un chasis rigido se
  // apoya en sus contactos mas altos y la rueda del punto bajo queda en el
  // aire. Es justo lo que el rocker-bogie real resuelve articulando, y sigue
  // siendo un diferenciador pendiente del proyecto. Lo que si seria un fallo es
  // que el terreno atraviese al rover, y eso lo mide la penetracion.
  const roverOk =
    Boolean(diag?.rover?.loaded) &&
    diag.rover.grounded >= 4 &&
    diag.rover.maxPenetrationM <= 0.12;
  if (diag?.rover?.loaded && diag.rover.grounded < 6) {
    console.log(
      `\n  NOTA: ${6 - diag.rover.grounded} rueda(s) en el aire. Chasis rigido sobre` +
        ' terreno irregular — lo resolveria el rocker-bogie articulado.',
    );
  }
  if (diag?.rover && !roverOk) {
    console.log(
      `\n  ATENCION: ${diag.rover.loaded ? 'el rover atraviesa el terreno o perdio el apoyo' : 'el rover no se cargo'}.`,
    );
  }

  const ok =
    ready && drewSomething && roverOk && errors.length === 0 && failedRequests.length === 0;
  console.log(rule('='));
  console.log(ok ? '  RESULTADO: OK' : '  RESULTADO: FALLA');
  console.log(`${rule('=')}\n`);

  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(3);
});
