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

async function boot(page, label) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4175/', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => !!window.GuioneroStudio && !!document.getElementById('script') && window.GuioneroStudioBooting !== true, null, { timeout:20000 });
  const model = await page.evaluate(() => window.GuioneroStudio.exportState());
  const id = 'enter-flow-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  model.pages = [{ id, created:Date.now(), enabled:true, blocks:[{ type:'SCENE', text:'' }] }];
  model.pageIds = [id];
  model.connections = [{ id:'enter-flow-viewer', type:'write', fromNode:id, fromPort:'write-out', toNode:'viewer', toPort:'write-in' }];
  model.images = [];
  model.utilityNodes = [];
  model.backgrounds = [];
  model.orphanConnections = [];
  model.positions = { [id]:{x:80,y:100}, viewer:{x:520,y:100} };
  model.viewerManuallyDisconnected = false;
  await page.evaluate(value => window.GuioneroStudio.importState(value, { notifyCloud:false }), model);
  await page.locator('#tabScript').click();
  await page.waitForFunction(() => {
    const script = document.getElementById('script');
    return script && script.querySelector('.script-line[data-type="SCENE"]') && script.isContentEditable &&
      document.getElementById('paneScript')?.classList.contains('active');
  }, null, { timeout:10000 });
  return errors;
}

async function lineState(page) {
  return page.evaluate(() => {
    const root = document.getElementById('script');
    const sel = window.getSelection();
    let block = sel?.rangeCount ? (sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement) : null;
    while (block && block !== root && block.parentElement !== root) block = block.parentElement;
    const selected = block && block !== root && block.parentElement === root ? block : null;
    return {
      lines:[...root.children].filter(el => el.classList.contains('script-line')).map(el => ({
        type:el.dataset.type,
        text:el.innerText.replace(/\u00a0/g,' ').replace(/\r/g,'')
      })),
      activeElement:document.activeElement?.id || document.activeElement?.tagName || '',
      editable:root.isContentEditable,
      selectionCollapsed:!!sel?.rangeCount && sel.isCollapsed,
      selectionType:selected?.dataset.type || null,
      selectionInsideScript:!!sel?.rangeCount && root.contains(sel.anchorNode),
      pickerVisible:document.getElementById('picker')?.classList.contains('visible') || false
    };
  });
}

async function assertCaret(page, expectedType, label) {
  const state = await lineState(page);
  assert.equal(state.activeElement, 'script', label + ': el foco debe permanecer en el editor');
  assert.equal(state.editable, true, label + ': el documento debe seguir editable');
  assert.equal(state.selectionCollapsed, true, label + ': el cursor debe ser una selección colapsada');
  assert.equal(state.selectionInsideScript, true, label + ': la selección debe permanecer dentro de Script');
  assert.equal(state.selectionType, expectedType, label + ': el cursor debe estar en el nuevo tipo de elemento');
  assert.equal(state.pickerVisible, false, label + ': no debe abrirse el selector al continuar escribiendo');
  return state;
}

async function selectTypeWithPicker(page, type) {
  const line = page.locator('#script .script-line').last();
  await line.click();
  await page.keyboard.press('Tab');
  await page.locator('#picker [data-pick="' + type + '"]').click();
  await page.waitForFunction(expected => {
    const sel = window.getSelection(), root = document.getElementById('script');
    let node = sel?.rangeCount ? (sel.anchorNode?.nodeType===1?sel.anchorNode:sel.anchorNode?.parentElement) : null;
    while(node&&node!==root&&node.parentElement!==root)node=node.parentElement;
    return node?.dataset?.type===expected && document.activeElement===root;
  }, type);
}

async function runScriptFlow(browser, options, label, withUndoRedo) {
  const context = await browser.newContext({ ...options });
  const page = await context.newPage();
  const errors = await boot(page, label);
  try {
    // Empty-line Enter may offer the type picker, but it must not move focus out of Script.
    await page.locator('#script .script-line').first().click();
    await page.keyboard.press('Enter');
    let state = await lineState(page);
    assert.equal(state.pickerVisible, true, label + ': una línea vacía puede abrir el selector');
    assert.equal(state.activeElement, 'script', label + ': Enter en línea vacía no debe enfocar un botón');
    assert.equal(state.selectionInsideScript, true, label + ': la selección debe seguir dentro de Script');
    await page.keyboard.press('Escape');
    await assertCaret(page, 'SCENE', label + ': salir del selector de línea vacía');

    // Choose a CHARACTER, then write continuously through the automatic screenplay sequence.
    await selectTypeWithPicker(page, 'CHARACTER');
    await page.keyboard.type('LUNA');
    await page.keyboard.press('Enter');
    await assertCaret(page, 'DIALOGUE', label + ': CHARACTER -> DIALOGUE');
    await page.keyboard.type('No puedo creer que esto esté sucediendo.');
    await page.keyboard.press('Enter');
    await assertCaret(page, 'ACTION', label + ': DIALOGUE -> ACTION');
    await page.keyboard.type('Se levanta y mira hacia la puerta.');
    await page.keyboard.press('Enter');
    await assertCaret(page, 'ACTION', label + ': ACTION -> ACTION');
    await page.keyboard.type('La puerta se cierra lentamente.');

    state = await lineState(page);
    assert.deepEqual(state.lines.map(line => [line.type,line.text]), [
      ['CHARACTER','LUNA'],
      ['DIALOGUE','No puedo creer que esto esté sucediendo.'],
      ['ACTION','Se levanta y mira hacia la puerta.'],
      ['ACTION','La puerta se cierra lentamente.']
    ], label + ': secuencia automática sin líneas duplicadas ni contenido perdido');

    // Exercise browser undo/redo on an Enter-generated paragraph on desktop.
    if (withUndoRedo) {
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await assertCaret(page, 'ACTION', label + ': nueva línea antes de deshacer');
      await page.keyboard.press('Control+Z');
      await page.waitForTimeout(80);
      const undone = await lineState(page);
      assert.equal(undone.lines.length, 4, label + ': Deshacer debe retirar la división');
      assert.equal(undone.lines[3].text, 'La puerta se cierra lentamente.');
      await page.keyboard.press('Control+Shift+Z');
      await page.waitForTimeout(80);
      const redone = await lineState(page);
      assert.equal(redone.lines.length, 5, label + ': Rehacer debe restaurar una sola línea nueva');
      assert.equal(redone.lines[4].type, 'ACTION', label + ': Rehacer debe conservar el tipo de acción');
      await assertCaret(page, 'ACTION', label + ': cursor después de Rehacer');
      await page.keyboard.type('Una luz se enciende.');
    }

    // Start a fresh empty action block before explicitly choosing a parenthetical.
    await page.keyboard.press('Enter');
    await assertCaret(page, 'ACTION', label + ': tercera acción lista para cambiar de tipo');

    // Parenthetical remains independent and keeps its current formatting/continuation behavior.
    await selectTypeWithPicker(page, 'PARENTHETICAL');
    const parenthetical = page.locator('#script .script-line[data-type="PARENTHETICAL"]').last();
    const formatBefore = await parenthetical.evaluate(el => ({
      width:getComputedStyle(el).width,
      marginLeft:getComputedStyle(el).marginLeft,
      textAlign:getComputedStyle(el).textAlign,
      whiteSpace:getComputedStyle(el).whiteSpace
    }));
    await page.keyboard.type('susurrando');
    await page.keyboard.press(')');
    await page.keyboard.press('Enter');
    await assertCaret(page, 'DIALOGUE', label + ': parenthetical -> DIALOGUE');
    const parentheticalState = await parenthetical.evaluate(el => ({
      text:el.textContent,
      type:el.dataset.type,
      width:getComputedStyle(el).width,
      marginLeft:getComputedStyle(el).marginLeft,
      textAlign:getComputedStyle(el).textAlign,
      whiteSpace:getComputedStyle(el).whiteSpace,
      nextType:el.nextElementSibling?.dataset.type || null
    }));
    assert.equal(parentheticalState.text, '(susurrando)', label + ': el texto parentético se conserva');
    assert.equal(parentheticalState.type, 'PARENTHETICAL');
    assert.equal(parentheticalState.nextType, 'DIALOGUE', label + ': parentética sigue creando diálogo');
    assert.deepEqual({
      width:parentheticalState.width,marginLeft:parentheticalState.marginLeft,
      textAlign:parentheticalState.textAlign,whiteSpace:parentheticalState.whiteSpace
    }, formatBefore, label + ': el formato de parentética no cambia al pulsar Enter');

    // Continue typing in the new dialogue without tapping the editor again.
    await page.keyboard.type('No es el momento.');
    await assertCaret(page, 'DIALOGUE', label + ': escritura inmediata tras parentética');
    await page.evaluate(() => {
      window.GuioneroSaveScriptState?.();
      return window.GuioneroStudio?.flushPersistence?.();
    });
    await page.waitForTimeout(450);
    const beforeReload = await lineState(page);
    await page.reload({ waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => !!window.GuioneroStudio && !!document.querySelector('#script .script-line'), null, { timeout:20000 });
    await page.waitForTimeout(500);
    const afterReload = await lineState(page);
    assert.deepEqual(afterReload.lines, beforeReload.lines, label + ': Guardar, cerrar y abrir conserva contenido y formatos');
    assert.equal(afterReload.lines.filter(line => line.type==='PARENTHETICAL').length, 1, label + ': no duplica parentéticas');
    assert.deepEqual(errors, [], label + ': sin excepciones de JavaScript');
    console.log('PASS Script Enter and continuous typing ' + label);
  } finally {
    await context.close();
  }
}

(async () => {
  const desktopOnly = process.argv.includes('--desktop-only');
  await new Promise(resolve => server.listen(4175, '127.0.0.1', resolve));
  const chrome = await chromium.launch({ headless:true, args:['--no-sandbox'] });
  let safari = null;
  try {
    await runScriptFlow(chrome, { viewport:{width:1440,height:1000}, deviceScaleFactor:1 }, 'Windows Chromium desktop', true);
    if (!desktopOnly) {
      await runScriptFlow(chrome, devices['Pixel 7'], 'Android touch emulation', false);
      safari = await webkit.launch({ headless:true });
      await runScriptFlow(safari, devices['iPhone 13'], 'iPhone WebKit emulation', false);
    }
  } finally {
    if (safari) await safari.close();
    await chrome.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode=1; });
