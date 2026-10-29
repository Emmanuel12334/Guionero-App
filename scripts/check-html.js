#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.error('ERROR: no se encontró index.html en la raíz del proyecto.');
  process.exit(1);
}
const html = fs.readFileSync(htmlPath, 'utf8');
const requiredIds = [
  'newScriptBtn',
  'guioneroProjectPicker',
  'guioneroStructureBtn',
  'guioneroSettingsBtn',
];
const missing = requiredIds.filter((id) => !new RegExp(`\\bid=["']${id}["']`).test(html));
if (missing.length) {
  console.error(`ERROR: faltan elementos esenciales: ${missing.join(', ')}`);
  process.exit(1);
}

const initialMarkup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
const ids = [...initialMarkup.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]);
const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
if (duplicates.length) {
  console.error(`ERROR: identificadores HTML duplicados: ${duplicates.join(', ')}`);
  process.exit(1);
}

const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
let checked = 0;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guionero-js-check-'));
try {
  for (let i = 0; i < blocks.length; i += 1) {
    const attrs = blocks[i][1] || '';
    const source = blocks[i][2] || '';
    if (/\bsrc\s*=/.test(attrs)) continue;
    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
    const type = typeMatch ? typeMatch[1].toLowerCase() : 'text/javascript';
    if (!['text/javascript', 'application/javascript', 'module'].includes(type)) continue;
    const file = path.join(tempDir, `script-${i + 1}.js`);
    fs.writeFileSync(file, source, 'utf8');
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
      console.error(`ERROR: sintaxis incorrecta en el bloque <script> #${i + 1}.`);
      process.stderr.write(result.stderr || result.stdout || 'Node.js no proporcionó detalles.\n');
      process.exitCode = 1;
      break;
    }
    checked += 1;
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`OK: ${checked} bloques JavaScript revisados.`);
console.log(`OK: ${ids.length} atributos id sin duplicados.`);
console.log('OK: elementos principales de Guionero encontrados.');
