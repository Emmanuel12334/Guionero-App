'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit, devices } = require('playwright');

const root = path.resolve(__dirname, '..');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-store' });
    res.end(data);
  });
});

const sampleBlocks = [
  { type:'SCENE', text:'INT. CASA - NOCHE' },
  { type:'CHARACTER', text:'LUNA' },
  { type:'DIALOGUE', text:'No quiero irme.' },
  { type:'DIALOGUE', text:'No sé qué decir.' },
  { type:'ACTION', text:'Ella se levanta.' },
  { type:'INTRO', text:'UNA HISTORIA DIFERENTE' },
  { type:'ACTION', text:'' }
];

async function boot(browser, options, label) {
  const context = await browser.newContext({ ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4176/', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => !!window.GuioneroStudio && !!document.getElementById('script') &&
    window.GuioneroStudioBooting !== true && typeof window.GuioneroApplyScriptElementType === 'function',
    null, { timeout:20000 });
  if (label.includes('Android') || label.includes('iPhone')) {
    await page.waitForSelector('#guioneroMobileScriptToolbar', { state:'visible', timeout:10000 });
    assert.equal(await page.evaluate(() => window.__guioneroMobileTouchDevice), true,
      label + ': debe activarse la experiencia táctil');
  }
  const model = await page.evaluate(() => window.GuioneroStudio.exportState());
  const id = 'format-autonomy-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  model.pages = [{ id, created:Date.now(), enabled:true,
    blocks:sampleBlocks.map(block => ({ type:block.type, text:block.text, html:block.text })) }];
  model.pageIds = [id];
  model.connections = [{ id:'format-autonomy-viewer', type:'write', fromNode:id, fromPort:'write-out', toNode:'viewer', toPort:'write-in' }];
  model.images = [];
  model.utilityNodes = [];
  model.backgrounds = [];
  model.orphanConnections = [];
  model.positions = { [id]:{x:80,y:100}, viewer:{x:520,y:100} };
  model.viewerManuallyDisconnected = false;
  await page.evaluate(value => window.GuioneroStudio.importState(value, { notifyCloud:false }), model);
  await page.locator('#tabScript').click();
  await page.waitForFunction(() => document.querySelectorAll('#script .script-line').length === 7 &&
    document.getElementById('paneScript')?.classList.contains('active'));
  return { context, page, errors, label };
}

async function lineSnapshot(locator) {
  return locator.evaluate(line => ({
    type:line.dataset.type,
    text:line.textContent,
    transform:getComputedStyle(line).textTransform
  }));
}

async function assertEditorCaret(page, expectedType, label) {
  const state = await page.evaluate(() => {
    const root = document.getElementById('script');
    const selection = window.getSelection();
    let line = selection?.rangeCount ? (selection.anchorNode?.nodeType===1 ? selection.anchorNode : selection.anchorNode?.parentElement) : null;
    while (line && line !== root && line.parentElement !== root) line = line.parentElement;
    return {
      active:document.activeElement?.id || '',
      inside:!!selection?.rangeCount && root.contains(selection.anchorNode),
      collapsed:!!selection?.rangeCount && selection.isCollapsed,
      type:line?.dataset?.type || null
    };
  });
  assert.equal(state.active, 'script', label + ': el editor debe conservar el foco');
  assert.equal(state.inside, true, label + ': el cursor debe permanecer dentro del documento');
  assert.equal(state.collapsed, true, label + ': la selección debe quedar como cursor');
  assert.equal(state.type, expectedType, label + ': el cursor debe permanecer en la línea convertida');
}

async function desktopContextMenu(browser) {
  const session = await boot(browser, { viewport:{width:1440,height:960}, deviceScaleFactor:1 }, 'Windows desktop');
  const page = session.page;
  try {
    const lines = page.locator('#script .script-line');
    const scene = lines.nth(0);
    await scene.click({ position:{x:35,y:10} });
    assert.equal(await page.locator('#scriptLineContextMenu').count(), 0,
      'Clic izquierdo no debe crear ni abrir el menú contextual');
    await assertEditorCaret(page, 'SCENE', 'Clic izquierdo sobre escena');

    await scene.click({ button:'right', position:{x:40,y:10} });
    const menu = page.locator('#scriptLineContextMenu');
    await menu.waitFor({ state:'visible', timeout:3000 });
    await page.locator('#mainTitle').click();
    assert.equal(await menu.isVisible(), false, 'Un clic fuera debe cerrar el menú contextual');
    await scene.click({ button:'right', position:{x:40,y:10} });
    await menu.waitFor({ state:'visible', timeout:3000 });
    const bounds = await menu.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 &&
      bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height,
      'El menú contextual debe permanecer dentro de la pantalla');
    await menu.locator('[data-context-type="ACTION"]').click();
    let state = await lineSnapshot(scene);
    assert.equal(state.type, 'ACTION', 'Escena debe convertirse en acción');
    assert.equal(state.text, 'INT. CASA - NOCHE', 'Escena -> Acción no debe alterar el texto');
    assert.equal(await menu.isVisible(), false, 'El menú debe cerrarse tras elegir un formato');
    await assertEditorCaret(page, 'ACTION', 'Escena -> Acción');

    const character = lines.nth(1);
    await character.click({ button:'right' });
    await menu.waitFor({ state:'visible' });
    await menu.locator('[data-context-type="DIALOGUE"]').click();
    state = await lineSnapshot(character);
    assert.deepEqual([state.type,state.text], ['DIALOGUE','LUNA'], 'Personaje -> Diálogo debe conservar el contenido');

    const dialogue = lines.nth(2);
    await dialogue.click({ button:'right' });
    await menu.waitFor({ state:'visible' });
    await menu.locator('[data-context-type="ACTION"]').click();
    state = await lineSnapshot(dialogue);
    assert.deepEqual([state.type,state.text], ['ACTION','No quiero irme.'], 'Diálogo -> Acción debe conservar el contenido');

    const secondDialogue = lines.nth(3);
    await secondDialogue.click({ button:'right' });
    await menu.waitFor({ state:'visible' });
    await menu.locator('[data-context-type="PARENTHETICAL"]').click();
    state = await lineSnapshot(secondDialogue);
    assert.deepEqual([state.type,state.text], ['PARENTHETICAL','No sé qué decir.'],
      'Diálogo -> Parentética debe conservar exactamente el texto');
    assert.equal(state.transform, 'none', 'Parentética debe conservar su tipografía sin forzar mayúsculas');

    const action = lines.nth(4);
    await action.click({ button:'right' });
    await menu.waitFor({ state:'visible' });
    await menu.locator('[data-context-type="SCENE"]').click();
    state = await lineSnapshot(action);
    assert.deepEqual([state.type,state.text], ['SCENE','Ella se levanta.'], 'Acción -> Escena debe conservar el contenido');
    assert.equal(state.transform, 'uppercase', 'Escena debe aplicar su formato visual en mayúsculas');

    const intro = lines.nth(5);
    await intro.click({ button:'right' });
    await menu.waitFor({ state:'visible' });
    await menu.locator('[data-context-type="TRANSITION"]').click();
    state = await lineSnapshot(intro);
    assert.deepEqual([state.type,state.text], ['TRANSITION','UNA HISTORIA DIFERENTE'], 'Intro -> Transición debe conservar el contenido');

    const empty = lines.nth(6);
    await empty.click({ button:'right' });
    await menu.waitFor({ state:'visible' });
    await menu.locator('[data-context-type="INTRO"]').click();
    state = await lineSnapshot(empty);
    assert.deepEqual([state.type,state.text], ['INTRO',''], 'El menú también debe convertir líneas vacías');
    await assertEditorCaret(page, 'INTRO', 'Conversión de línea vacía');

    await page.locator('#mainTitle').click({ button:'right' });
    assert.equal(await page.locator('#scriptLineContextMenu').isVisible().catch(() => false), false,
      'El menú nativo de otras zonas no debe sustituirse por el menú de formatos');
    assert.deepEqual(session.errors, [], 'No debe haber errores JavaScript en Windows desktop');
    console.log('PASS Script format context menu Windows desktop');
  } finally {
    await session.context.close();
  }
}

async function mobileToolbar(browser, options, label) {
  const session = await boot(browser, options, label);
  const page = session.page;
  try {
    const lines = page.locator('#script .script-line');
    const toolbar = page.locator('#guioneroMobileScriptToolbar');
    assert.equal(await toolbar.isVisible(), true, label + ': la barra superior debe estar visible');
    const scene = lines.nth(0);
    await scene.tap();
    await toolbar.locator('[data-script-type="ACTION"]').tap();
    let state = await lineSnapshot(scene);
    assert.deepEqual([state.type,state.text], ['ACTION','INT. CASA - NOCHE'],
      label + ': Escena -> Acción conserva el texto y no abre un selector');
    await assertEditorCaret(page, 'ACTION', label + ': botón Acción');

    const character = lines.nth(1);
    await character.tap();
    await toolbar.locator('[data-script-type="DIALOGUE"]').tap();
    state = await lineSnapshot(character);
    assert.deepEqual([state.type,state.text], ['DIALOGUE','LUNA'], label + ': Personaje -> Diálogo conserva el texto');

    const dialogue = lines.nth(2);
    await dialogue.tap();
    await toolbar.locator('[data-script-type="ACTION"]').tap();
    state = await lineSnapshot(dialogue);
    assert.deepEqual([state.type,state.text], ['ACTION','No quiero irme.'], label + ': Diálogo -> Acción conserva el texto');

    const otherDialogue = lines.nth(3);
    await otherDialogue.tap();
    await toolbar.locator('[data-script-type="PARENTHETICAL"]').tap();
    state = await lineSnapshot(otherDialogue);
    assert.deepEqual([state.type,state.text], ['PARENTHETICAL','No sé qué decir.'], label + ': Diálogo -> Parentética conserva el texto');

    const action = lines.nth(4);
    await action.tap();
    await toolbar.locator('[data-script-type="SCENE"]').tap();
    state = await lineSnapshot(action);
    assert.deepEqual([state.type,state.text], ['SCENE','Ella se levanta.'], label + ': Acción -> Escena conserva el texto');
    assert.equal(state.transform, 'uppercase', label + ': Escena debe adoptar el estilo visual correspondiente');

    const intro = lines.nth(5);
    await intro.tap();
    await toolbar.locator('[data-script-type="TRANSITION"]').tap();
    state = await lineSnapshot(intro);
    assert.deepEqual([state.type,state.text], ['TRANSITION','UNA HISTORIA DIFERENTE'], label + ': Intro -> Transición conserva el texto');

    const empty = lines.nth(6);
    await empty.tap();
    await toolbar.locator('[data-script-type="INTRO"]').tap();
    state = await lineSnapshot(empty);
    assert.deepEqual([state.type,state.text], ['INTRO',''], label + ': también se puede dar formato a una línea vacía');
    assert.equal(await page.locator('#picker').evaluate(el => el.classList.contains('visible')), false,
      label + ': los botones móviles no deben abrir el selector contextual');
    assert.equal(await page.locator('#scriptLineContextMenu').count(), 0,
      label + ': el menú contextual de escritorio no debe aparecer en móvil');
    await assertEditorCaret(page, 'INTRO', label + ': último botón de formato');

    const toolbarBefore = await toolbar.evaluate(el => el.getBoundingClientRect().top);
    const workspace = page.locator('#workspace');
    const beforeScroll = await workspace.evaluate(el => ({ scroll:el.scrollTop, max:el.scrollHeight-el.clientHeight }));
    await workspace.evaluate(el => { el.scrollTop = Math.min(280, el.scrollHeight-el.clientHeight); });
    await page.waitForTimeout(120);
    const toolbarAfter = await toolbar.evaluate(el => ({ top:el.getBoundingClientRect().top, height:el.getBoundingClientRect().height }));
    const afterScroll = await workspace.evaluate(el => el.scrollTop);
    assert.ok(beforeScroll.max>0 && afterScroll>0,
      label + ': el documento debe poder desplazarse para comprobar la barra');
    assert.ok(toolbarAfter.height>0 && Math.abs(toolbarAfter.top-toolbarBefore)<=1,
      label + ': la barra superior debe permanecer fija mientras se desplaza el documento');

    const saved = await page.evaluate(() => window.GuioneroStudio.exportState());
    const storedBlocks = saved.pages?.[0]?.blocks || [];
    assert.equal(storedBlocks.length, sampleBlocks.length, label + ': el número de líneas debe mantenerse');
    assert.deepEqual(storedBlocks.slice(0,6).map(block => block.text), sampleBlocks.slice(0,6).map(block => block.text),
      label + ': el contenido original debe persistir en el modelo del proyecto');
    assert.deepEqual(session.errors, [], label + ': no debe haber errores JavaScript');
    console.log('PASS Script format toolbar ' + label);
  } finally {
    await session.context.close();
  }
}

(async () => {
  const desktopOnly = process.argv.includes('--desktop-only');
  await new Promise(resolve => server.listen(4176, '127.0.0.1', resolve));
  const chrome = await chromium.launch({ headless:true, args:['--no-sandbox'] });
  let safari = null;
  try {
    await desktopContextMenu(chrome);
    if (!desktopOnly) {
      await mobileToolbar(chrome, devices['Pixel 7'], 'Android Pixel 7 emulation');
      safari = await webkit.launch({ headless:true });
      await mobileToolbar(safari, devices['iPhone 13'], 'iPhone 13 WebKit emulation');
    }
  } finally {
    if (safari) await safari.close();
    await chrome.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode=1; });
