'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, devices } = require('playwright');

const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });
});

async function seedScriptPage(page, id) {
  const raw = await page.evaluate(() => window.GuioneroStudio.exportState());
  raw.pages = [{
    id, created: Date.now(), enabled: true,
    blocks: [
      { type: 'CHARACTER', text: 'ENMANUEL', html: 'ENMANUEL' },
      { type: 'ACTION', text: '', html: '' }
    ]
  }];
  raw.pageIds = [id];
  raw.connections = [{ id: 'flow-to-viewer', type: 'write', fromNode: id, fromPort: 'write-out', toNode: 'viewer', toPort: 'write-in' }];
  raw.images = [];
  raw.utilityNodes = [];
  raw.backgrounds = [];
  raw.orphanConnections = [];
  raw.positions = { [id]: { x: 80, y: 100 }, viewer: { x: 520, y: 100 } };
  raw.camera = { zoom: .8, pan: { x: 55, y: 50 } };
  raw.viewerManuallyDisconnected = false;
  await page.evaluate(model => window.GuioneroStudio.importState(model, { notifyCloud: false }), raw);
}

async function testParenthetical(page, label) {
  await seedScriptPage(page, 'parenthetical-' + label);
  await page.locator('#tabScript').click();
  const line = page.locator('#script .script-line').last();
  await line.click();
  await page.keyboard.press('Tab');
  await page.locator('#picker [data-pick="PARENTHETICAL"]').click();
  const parenthetical = page.locator('#script .script-line[data-type="PARENTHETICAL"]').last();
  await page.keyboard.type('tembloroso');
  // The tool starts with (), so a manually typed closing bracket must only move the caret.
  await page.keyboard.press(')');
  assert.equal(await parenthetical.textContent(), '(tembloroso)', label + ': no debe duplicar el paréntesis de cierre');
  await page.keyboard.press('Enter');
  const result = await parenthetical.evaluate(el => ({
    text: el.textContent,
    type: el.dataset.type,
    nextText: el.nextElementSibling?.textContent ?? null,
    nextType: el.nextElementSibling?.dataset.type ?? null,
    whiteSpace: getComputedStyle(el).whiteSpace,
    overflowWrap: getComputedStyle(el).overflowWrap,
    textAlign: getComputedStyle(el).textAlign,
    marginLeft: getComputedStyle(el).marginLeft,
    parentLeft: el.getBoundingClientRect().left,
    characterLeft: el.parentElement.querySelector('[data-type="CHARACTER"]')?.getBoundingClientRect().left ?? null,
    dialogueLeft: el.nextElementSibling?.getBoundingClientRect().left ?? null
  }));
  assert.equal(result.text, '(tembloroso)', label + ': Enter conserva la parentética');
  assert.equal(result.type, 'PARENTHETICAL');
  assert.equal(result.nextType, 'DIALOGUE', label + ': crea línea vacía para diálogo, sin palabras');
  assert.equal(result.nextText, '');
  assert.equal(result.whiteSpace, 'pre-wrap');
  assert.equal(result.overflowWrap, 'anywhere');
  assert.equal(result.textAlign, 'left');
  assert.ok(parseFloat(result.marginLeft) > 0, label + ': parentética en columna intermedia');
  assert.ok(result.dialogueLeft < result.parentLeft && result.parentLeft < result.characterLeft,
    label + ': parentética entre el margen del diálogo y el del personaje');

  await page.evaluate(() => document.activeElement?.blur());
  await page.evaluate(async () => { await window.GuioneroSaveProject?.(); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.GuioneroStudio);
  await page.waitForFunction(() => document.querySelector('#script .script-line[data-type="PARENTHETICAL"]'));
  const restored = await page.locator('#script .script-line[data-type="PARENTHETICAL"]').last().textContent();
  assert.equal(restored, '(tembloroso)', label + ': parentética sobrevive Guardar y recargar');
  console.log('PASS Parentética Script ' + label);
}

async function touchTap(page, selector) {
  const target = page.locator(selector), rect = await target.boundingBox();
  assert.ok(rect, 'Elemento táctil visible: ' + selector);
  const cdp = await page.context().newCDPSession(page);
  try {
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 91, ...point }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await cdp.detach(); }
}

async function paintPointerDrag(page, useTouch, from, to) {
  if (!useTouch) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: from.x, y: from.y }] });
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.detach();
  }
}

async function testPaintText(page, label, useTouch) {
  await page.locator('#tabPaint').click();
  if (useTouch) {
    await page.locator('#androidPaintToolsToggle').waitFor({ state: 'visible' });
    await touchTap(page, '#androidPaintToolsToggle');
    await page.waitForFunction(() => document.getElementById('paintToolbar')?.classList.contains('android-paint-tools-open'));
  }
  const toolbar = page.locator('#paintToolbar');
  if (await toolbar.evaluate(el => el.classList.contains('paint-toolbar-collapsed'))) await page.locator('#paintToolbarToggle').click();
  await page.locator('#paintTextBtn').click();
  if (useTouch) {
    await page.waitForFunction(() => !document.getElementById('paintToolbar')?.classList.contains('android-paint-tools-open'));
    assert.equal(await page.locator('#paintTool').inputValue(), 'text', 'Android: la herramienta TEXTO queda seleccionada');
  }
  const box = await page.locator('#paintCanvas').boundingBox();
  assert.ok(box && box.width > 80 && box.height > 50, label + ': canvas Paint visible');
  const from = { x: box.x + 35, y: box.y + 35 };
  const to = { x: box.x + 190, y: box.y + 115 };
  await paintPointerDrag(page, useTouch, from, to);
  const textBox = page.locator('.paint-text-object .paint-text-content[contenteditable="true"]').last();
  await textBox.waitFor({ state: 'visible', timeout: 8000 });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'textbox', label + ': cursor focused in new text box');
  await textBox.fill('Primera línea\nSegunda línea');
  await page.evaluate(() => document.activeElement?.blur());
  if (useTouch) {
    await touchTap(page, '#androidPaintToolsToggle');
    await page.waitForFunction(() => document.getElementById('paintToolbar')?.classList.contains('android-paint-tools-open'));
  }
  await page.locator('#paintTextAlign').selectOption('center');
  await page.locator('#paintFontSize').fill('48');
  await page.locator('#paintFontSize').press('Tab');
  if (useTouch) {
    await touchTap(page, '#androidPaintToolsToggle');
    await page.waitForFunction(() => !document.getElementById('paintToolbar')?.classList.contains('android-paint-tools-open'));
  }
  const stateBefore = await page.evaluate(() => {
    const state = window.GuioneroStudio.exportState(), board = state.boards.find(b => b.id === state.activeBoard);
    const object = board?.objects.find(o => o.kind === 'text');
    return object ? { id: object.id, text: object.text, w: object.w, h: object.h, fontSize: object.fontSize, align: object.align, layerId: object.layerId, layerExists: board.layers.some(l => l.id === object.layerId) } : null;
  });
  assert.ok(stateBefore, label + ': objeto de texto persistido en Paint');
  assert.equal(stateBefore.text, 'Primera línea\nSegunda línea');
  assert.equal(stateBefore.fontSize, 48);
  assert.equal(stateBefore.align, 'center');
  assert.ok(stateBefore.layerExists, label + ': objeto asociado a una capa');

  const side = page.locator('[data-paint-object-id="' + stateBefore.id + '"] .paint-transform-handle.e');
  await side.waitFor({ state: 'visible' });
  const handle = await side.boundingBox();
  assert.ok(handle, label + ': tirador lateral disponible');
  const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  const end = { x: start.x + 42, y: start.y };
  await paintPointerDrag(page, useTouch, start, end);
  const stateAfter = await page.evaluate(id => {
    const state = window.GuioneroStudio.exportState(), board = state.boards.find(b => b.id === state.activeBoard);
    const object = board?.objects.find(o => o.id === id);
    return object ? { w: object.w, h: object.h, fontSize: object.fontSize, text: object.text } : null;
  }, stateBefore.id);
  assert.ok(stateAfter.w > stateBefore.w, label + ': el tirador cambia anchura');
  assert.equal(stateAfter.fontSize, stateBefore.fontSize, label + ': redimensionar no cambia fuente');
  await page.evaluate(() => window.GuioneroStudio.flushPersistence());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.GuioneroStudio);
  await page.locator('#tabPaint').click();
  const restored = await page.evaluate(id => {
    const state = window.GuioneroStudio.exportState(), board = state.boards.find(b => b.id === state.activeBoard);
    return board?.objects.find(o => o.id === id) || null;
  }, stateBefore.id);
  assert.ok(restored, label + ': el texto se recupera al abrir el proyecto');
  assert.equal(restored.text, 'Primera línea\nSegunda línea');
  assert.equal(restored.w, stateAfter.w);
  assert.equal(restored.fontSize, 48);
  const png = await page.evaluate(() => window.GuioneroStudio.composePaintBoard());
  assert.ok(png.startsWith('data:image/png;base64,'), label + ': compositor rasteriza el texto a PNG');
  console.log('PASS Paint texto ' + label);
}

async function seedGraph(page) {
  const raw = await page.evaluate(() => window.GuioneroStudio.exportState());
  raw.pages = [
    { id: 'edge-A', created: Date.now(), enabled: true, blocks: [{ type: 'ACTION', text: 'A' }] },
    { id: 'edge-B', created: Date.now(), enabled: true, blocks: [{ type: 'ACTION', text: 'B' }] }
  ];
  raw.pageIds = ['edge-A', 'edge-B'];
  raw.images = [];
  raw.utilityNodes = [];
  raw.backgrounds = [];
  raw.orphanConnections = [];
  raw.connections = [{ id: 'edge-A-B', type: 'write', fromNode: 'edge-A', fromPort: 'write-out', toNode: 'edge-B', toPort: 'write-in' }];
  raw.positions = { 'edge-A': { x: 100, y: 100 }, 'edge-B': { x: 500, y: 100 }, viewer: { x: 850, y: 350 } };
  raw.camera = { zoom: .8, pan: { x: 55, y: 50 } };
  raw.viewerManuallyDisconnected = true;
  await page.evaluate(model => window.GuioneroStudio.importState(model, { notifyCloud: false }), raw);
  await page.locator('#tabNote').click();
}

async function nodeDropPoint(page) {
  return page.evaluate(() => {
    const wrap = document.getElementById('noteCanvasWrap'), r = wrap.getBoundingClientRect();
    const state = window.GuioneroStudio.exportState(), zoom = state.camera?.zoom || .8, pan = state.camera?.pan || { x: 55, y: 50 };
    const world = { x: 425, y: 147 };
    return { x: r.left + pan.x + world.x * zoom, y: r.top + pan.y + world.y * zoom };
  });
}

async function dragNodeFromMenu(page, label, useTouch) {
  if (useTouch) {
    await page.locator('#noteAddNode').click();
  } else {
    await page.locator('#noteCanvasWrap').evaluate(el => el.focus());
    await page.keyboard.press('Shift+A');
  }
  const menu = page.locator('#nodeAddMenu');
  await menu.waitFor({ state: 'visible' });
  const choice = page.locator('#noteAddPageChoice');
  const b = await choice.boundingBox();
  const to = await nodeDropPoint(page);
  assert.ok(b, label + ': opción Página visible');
  const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  if (!useTouch) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    const during = await page.evaluate(() => window.GuioneroStudio.exportState().connections.map(c => c.id));
    assert.deepEqual(during, ['edge-A-B'], label + ': el grafo no cambia antes de soltar');
    assert.ok(await page.locator('.connection-visible.connection-insert-target').count(), label + ': conexión candidata resaltada');
    await page.mouse.up();
  } else {
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 2, x: from.x, y: from.y }] });
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 2, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }] });
      }
      const during = await page.evaluate(() => window.GuioneroStudio.exportState().connections.map(c => c.id));
      assert.deepEqual(during, ['edge-A-B'], label + ': el grafo no cambia antes de soltar');
      assert.ok(await page.locator('.connection-visible.connection-insert-target').count(), label + ': conexión candidata resaltada');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await cdp.detach(); }
  }
  await page.waitForFunction(() => window.GuioneroStudio.exportState().pages.length === 3);
  const result = await page.evaluate(() => {
    const state = window.GuioneroStudio.exportState();
    return { pages: state.pages.map(p => p.id), edges: state.connections.filter(c => c.type === 'write').map(c => [c.fromNode, c.toNode]) };
  });
  assert.equal(result.pages.length, 3, label + ': se creó el nodo soltado');
  assert.ok(!result.edges.some(([a, b]) => a === 'edge-A' && b === 'edge-B'), label + ': conexión original eliminada al soltar');
  const inserted = result.pages.find(id => id !== 'edge-A' && id !== 'edge-B');
  assert.ok(result.edges.some(([a, b]) => a === 'edge-A' && b === inserted), label + ': conexión de entrada creada');
  assert.ok(result.edges.some(([a, b]) => a === inserted && b === 'edge-B'), label + ': conexión de salida creada');
  console.log('PASS Node arrastre e inserción ' + label);
}

async function runContext(browser, options, label, useTouch) {
  const context = await browser.newContext({ acceptDownloads: true, ...options });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.GuioneroStudio && !!document.getElementById('script'));
    if (label === 'Android') {
      await page.waitForFunction(() => document.body.classList.contains('android-device'));
      assert.ok(await page.locator('#tabNote').isVisible(), 'Android: pestaña Node accesible');
      assert.ok(await page.locator('#tabPaint').isVisible(), 'Android: pestaña Paint accesible');
    }
    await testParenthetical(page, label);
    await testPaintText(page, label, useTouch);
    await seedGraph(page);
    await dragNodeFromMenu(page, label, useTouch);
    assert.deepEqual(runtimeErrors, [], label + ': sin errores de ejecución de página');
  } finally {
    await context.close();
  }
}

(async () => {
  await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    await runContext(browser, { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 }, 'Escritorio', false);
    const android = devices['Pixel 7'];
    await runContext(browser, android, 'Android', true);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
