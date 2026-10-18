#!/usr/bin/env node
/**
 * npm run fetch:model
 *
 * Descarga el modelo oficial del rover Perseverance desde el repositorio
 * publico de recursos 3D de la NASA.
 *
 * El .glb NO se versiona en este repo: el .gitignore excluye *.glb y declara
 * que los activos pesados se descargan con scripts. Asi la procedencia del
 * modelo es una URL verificable y no un binario opaco en el historial.
 *
 * Fuente:  https://github.com/nasa/NASA-3D-Resources
 * Terminos: "These assets are free and without copyright" (README de NASA).
 * Credito: NASA/JPL-Caltech.
 */
import { createWriteStream, existsSync, statSync } from 'node:fs';
import { mkdir, cp } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEST_DIR = resolve(ROOT, 'public', 'models');
const DEST = resolve(DEST_DIR, 'perseverance.glb');

const SOURCE =
  'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/' +
  '3D%20Models/Mars%202020%20Perseverance%20Rover/' +
  'Mars%202020%20Perseverance%20Rover.glb';

const EXPECTED_BYTES = 4987176;

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

/**
 * El .glb de la NASA viene con compresion Draco — por eso 68 mallas caben en
 * 4,76 MB. GLTFLoader no sabe descomprimirlo solo: necesita el decodificador,
 * que three ya trae en su paquete. Se copia a public/ para servirlo en local y
 * no depender de un CDN externo en tiempo de ejecucion.
 */
async function copyDracoDecoder() {
  const from = resolve(ROOT, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco', 'gltf');
  const to = resolve(ROOT, 'public', 'draco');

  if (!existsSync(from)) {
    console.warn('AVISO: no se encontro el decodificador Draco en node_modules/three.');
    console.warn('       Ejecuta npm install antes que este script.');
    return;
  }

  await cp(from, to, { recursive: true });
  console.log('Decodificador Draco copiado a public/draco/');
}

async function main() {
  const force = process.argv.includes('--force');
  await copyDracoDecoder();

  if (existsSync(DEST) && !force) {
    console.log(`Ya existe: ${DEST} (${mb(statSync(DEST).size)})`);
    console.log('Usa --force para volver a descargarlo.');
    return;
  }

  await mkdir(DEST_DIR, { recursive: true });

  console.log('Descargando el modelo oficial de la NASA...');
  console.log(`  ${SOURCE}`);

  const res = await fetch(SOURCE);
  if (!res.ok) {
    console.error(`\nFallo la descarga: HTTP ${res.status} ${res.statusText}`);
    console.error('Revisa que la ruta en nasa/NASA-3D-Resources no haya cambiado.');
    process.exit(1);
  }

  await pipeline(Readable.fromWeb(res.body), createWriteStream(DEST));

  const size = statSync(DEST).size;
  console.log(`\nGuardado en public/models/perseverance.glb  (${mb(size)})`);

  if (size !== EXPECTED_BYTES) {
    console.warn(
      `AVISO: se esperaban ${EXPECTED_BYTES} bytes y llegaron ${size}. ` +
        'El archivo en NASA pudo cambiar; conviene revisarlo.',
    );
  }

  console.log('Credito obligatorio en pantalla: NASA/JPL-Caltech');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
