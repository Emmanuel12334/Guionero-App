'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit, devices } = require('playwright');

const root = path.resolve(__dirname, '..');
const PORT = 4177;
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

const longBlocks = Array.from({ length:72 }, (_, index) => {
  const scene = index % 9 === 0;
  const text = scene
    ? 'INT. HABITACIÓN ' + (Math.ceil(index / 9) || 1) + ' - DÍA'
    : 'Enmanuel revisa el detalle número ' + (index + 1) + ' y continúa la escena sin interrumpir el ritmo.';
  return { type:scene ? 'SCENE' : 'ACTION', text, html:text };
});

async function boot(browser, options, label) {
  const context = await browser.newContext({ ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() =>
    !!window.GuioneroStudio &&
    document.getElementById('script') &&
    window.GuioneroStudioBooting !== true,
    null, { timeout:25000 });

  const model = await page.evaluate(() => window.GuioneroStudio.exportState());
  const id = 'mobile-management-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  model.pages = [{ id, created:Date.now(), enabled:true, blocks:longBlocks.map(block => ({ ...block })) }];
  model.pageIds = [id];
  model.connections = [{ id:'mobile-management-viewer', type:'write', fromNode:id, fromPort:'write-out', toNode:'viewer', toPort:'write-in' }];
  model.images = [];
  model.utilityNodes = [];
  model.backgrounds = [];
  model.orphanConnections = [];
  model.positions = { [id]:{x:80,y:100}, viewer:{x:520,y:100} };
  model.viewerManuallyDisconnected = false;
  await page.evaluate(value => window.GuioneroStudio.importState(value, { notifyCloud:false }), model);
  await page.waitForFunction(() => document.querySelectorAll('#script .script-line').length >= 70);
  await page.waitForFunction(() => document.getElementById('projectManagementDock') &&
    document.getElementById('guioneroManagementActions') &&
    document.getElementById('guioneroProjectPicker'));
  return { context, page, errors, label };
}

async function desktopMustRemainUnchanged(browser) {
  const session = await boot(browser, { viewport:{width:1440,height:960}, deviceScaleFactor:1 }, 'Windows desktop');
  const { page, context, errors } = session;
  try {
    const state = await page.evaluate(() => {
      const dock = document.getElementById('projectManagementDock');
      const card = document.querySelector('.project-card');
      return {
        mobile:window.__guioneroMobileTouchDevice === true,
        dockInProjectCard:!!dock && dock.parentElement === card,
        dockInSidebar:!!dock && dock.closest('#sidebar') !== null,
        dockInScript:!!dock && dock.closest('#paneScript') !== null,
        mobileToolbar:!!document.getElementById('guioneroMobileScriptToolbar'),
        menuDisplay:getComputedStyle(document.getElementById('mobileMenuBtn')).display,
        formatToolbar:!!document.getElementById('scriptFormatToolbar'),
        projectToolbar:!!document.getElementById('scriptProjectToolbar') &&
          document.getElementById('scriptProjectToolbar').closest('#projectManagementDock') === dock
      };
    });
    assert.equal(state.mobile, false, 'Windows no debe entrar en la ruta táctil móvil');
    assert.equal(state.dockInProjectCard, true, 'Windows conserva el panel de gestión en la tarjeta del proyecto');
    assert.equal(state.dockInSidebar, true, 'La tarjeta del proyecto sigue dentro de la barra lateral de escritorio');
    assert.equal(state.dockInScript, false, 'Windows no debe recibir el panel de gestión dentro de Script');
    assert.equal(state.mobileToolbar, false, 'Windows no debe recibir la barra móvil de siete formatos');
    assert.equal(state.menuDisplay, 'none', 'El botón hamburguesa continúa oculto en escritorio');
    assert.equal(state.formatToolbar, true, 'La barra de formato tradicional de escritorio permanece');
    assert.equal(state.projectToolbar, true, 'El mismo conjunto de controles de proyecto sigue montado en escritorio');
    assert.deepEqual(errors, [], 'Windows no debe generar errores JavaScript');
    console.log('PASS Mobile Script layout preserves Windows desktop');
  } finally {
    await context.close();
  }
}

async function assertToolbarGeometry(page, label) {
  const geometry = await page.evaluate(() => {
    const header = document.querySelector('.topbar');
    const bar = document.getElementById('guioneroMobileScriptToolbar');
    const workspace = document.getElementById('workspace');
    const paper = document.getElementById('paper');
    const rect = el => {
      const r=el.getBoundingClientRect();
      return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};
    };
    const buttons=[...bar.querySelectorAll('button')];
    return {
      header:rect(header),bar:rect(bar),workspace:rect(workspace),paper:rect(paper),
      scrollHeight:workspace.scrollHeight,clientHeight:workspace.clientHeight,
      buttonCount:buttons.length,buttonHeights:buttons.map(b=>b.getBoundingClientRect().height),
      scrollWidth:bar.scrollWidth,clientWidth:bar.clientWidth,
      barParent:bar.parentElement?.id,
      workspaceSibling:bar.nextElementSibling?.id
    };
  });
  const width = await page.evaluate(() => window.innerWidth);
  assert.equal(geometry.buttonCount, 7, label + ': debe mostrar los siete botones de formato');
  assert.ok(geometry.buttonHeights.every(h => h >= 44), label + ': todos los botones deben tener un área táctil de al menos 44 px');
  assert.ok(geometry.bar.top >= geometry.header.bottom - 2,
    label + ': la barra debe estar debajo de la cabecera principal');
  assert.ok(geometry.workspace.top >= geometry.bar.bottom - 1,
    label + ': la hoja debe comenzar debajo de la barra y no quedar tapada');
  assert.ok(geometry.bar.left >= 0 && geometry.bar.right <= width + 1,
    label + ': la barra no debe cortarse en los extremos de la pantalla');
  assert.equal(geometry.barParent, 'paneScript', label + ': la barra debe estar fuera del área desplazable del guion');
  assert.equal(geometry.workspaceSibling, 'workspace', label + ': el scroll del documento debe comenzar después de la barra');
  assert.ok(geometry.scrollHeight > geometry.clientHeight, label + ': el documento de prueba debe tener desplazamiento vertical');
}

async function mobileMenuAndKeyboard(browser, options, label) {
  const session = await boot(browser, options, label);
  const { page, context, errors } = session;
  try {
    await page.waitForSelector('#guioneroMobileScriptToolbar', { state:'visible' });
    const menu = page.locator('#mobileMenuBtn');
    const sidebar = page.locator('#sidebar');
    const dock = page.locator('#projectManagementDock');
    const toolbar = page.locator('#guioneroMobileScriptToolbar');

    const initial = await page.evaluate(() => {
      const panel=document.getElementById('projectManagementDock');
      const sidebar=document.getElementById('sidebar');
      const pane=document.getElementById('paneScript');
      return {
        mobile:window.__guioneroMobileTouchDevice===true,
        inSidebar:panel.closest('#sidebar')!==null,
        inScript:panel.closest('#paneScript')!==null,
        inWorkspace:panel.closest('#workspace')!==null,
        toggle:!!document.getElementById('androidProjectManagementToggle'),
        menuClosed:!sidebar.classList.contains('open'),
        panelBeforeCard:!!document.querySelector('#sidebar > #projectManagementDock + .project-card'),
        newScriptInside:panel.contains(document.getElementById('newScriptBtn')),
        allExistingActionsInside:[
          'scriptProjectToolbar','savedScriptsBrowseBtn','savedScriptSelect','projectImportBtn',
          'projectSaveBtn','scriptSaveIndicator','projectSaveAsBtn','guioneroStructureBtn',
          'guioneroSettingsBtn'
        ].every(id=>panel.contains(document.getElementById(id))),
        customToolbarInPane:document.getElementById('guioneroMobileScriptToolbar')?.parentElement===pane
      };
    });
    assert.equal(initial.mobile, true, label + ': debe activarse el modo táctil');
    assert.equal(initial.inSidebar, true, label + ': toda la gestión debe estar dentro del menú lateral');
    assert.equal(initial.inScript, false, label + ': el panel de gestión no debe ocupar espacio encima del guion');
    assert.equal(initial.inWorkspace, false, label + ': el panel de gestión no debe estar dentro del documento desplazable');
    assert.equal(initial.toggle, false, label + ': no debe quedar un segundo acordeón de Gestión de guiones');
    assert.equal(initial.menuClosed, true, label + ': el menú no debe ocupar espacio mientras está cerrado');
    assert.equal(initial.panelBeforeCard, true, label + ': la administración debe aparecer dentro del menú antes de los datos del proyecto');
    assert.equal(initial.newScriptInside, true, label + ': Nuevo proyecto conserva su botón original');
    assert.equal(initial.allExistingActionsInside, true, label + ': todas las opciones de gestión existentes deben trasladarse, no duplicarse');
    assert.equal(initial.customToolbarInPane, true, label + ': la barra de formatos queda bajo la cabecera y fuera del scroll de páginas');
    await assertToolbarGeometry(page, label + ' initial');

    // The hamburger opens and closes the one existing sidebar; the project controls are in that drawer.
    await menu.click();
    await page.waitForFunction(() => document.getElementById('sidebar')?.classList.contains('open') &&
      document.getElementById('mobileMenuBtn')?.getAttribute('aria-expanded') === 'true');
    assert.equal(await dock.isVisible(), true, label + ': las opciones de gestión aparecen dentro del menú');
    const managementIds = [
      'newScriptBtn','savedScriptsBrowseBtn','savedScriptSelect','projectImportBtn',
      'projectSaveBtn','projectSaveAsBtn','guioneroStructureBtn','guioneroSettingsBtn'
    ];
    for (const id of managementIds) {
      assert.equal(await page.locator('#sidebar').locator('#'+id).count(), 1, label + ': ' + id + ' debe existir una sola vez en el menú');
    }
    await menu.click();
    await page.waitForFunction(() => !document.getElementById('sidebar')?.classList.contains('open') &&
      document.getElementById('mobileMenuBtn')?.getAttribute('aria-expanded') === 'false');
    await menu.click();
    await page.waitForFunction(() => document.getElementById('sidebar')?.classList.contains('open'));
    // Simulate a real pointerdown on the uncovered page area; the drawer overlays the title field.
    await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles:true, pointerType:'touch', clientX:window.innerWidth-2, clientY:window.innerHeight/2
    })));
    await page.waitForFunction(() => !document.getElementById('sidebar')?.classList.contains('open'));
    await menu.click();
    await page.waitForFunction(() => document.getElementById('sidebar')?.classList.contains('open'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('sidebar')?.classList.contains('open'));

    // Saved scripts remains an existing library control in the drawer.
    await menu.click();
    const projectPicker = page.locator('#guioneroProjectPicker .guionero-project-trigger');
    await projectPicker.click();
    await page.waitForFunction(() => document.querySelector('#guioneroProjectPicker .guionero-project-menu:not([hidden])'));
    await page.locator('#guioneroProjectPicker .guionero-project-trigger').click();

    // Structure and Settings retain their original modal behavior and actions.
    await page.locator('#guioneroStructureBtn').click();
    await page.waitForFunction(() => document.getElementById('guioneroStructureModal')?.hidden === false);
    await page.locator('#guioneroStructureModal [data-close-structure]').click();
    await page.waitForFunction(() => document.getElementById('guioneroStructureModal')?.hidden === true);
    await dock.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.locator('#guioneroSettingsBtn').evaluate(el => el.scrollIntoView({block:'nearest',inline:'nearest'}));
    await page.locator('#guioneroSettingsBtn').click();
    await page.waitForFunction(() => document.getElementById('guioneroSettingsModal')?.hidden === false);
    await page.locator('#guioneroSettingsClose').click();
    await page.waitForFunction(() => document.getElementById('guioneroSettingsModal')?.hidden === true);

    // Saving remains operational from inside the drawer.
    await page.locator('#projectSaveBtn').click();
    await page.waitForFunction(() => document.getElementById('toast')?.textContent.includes('Proyecto guardado correctamente'));
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#projectSaveAsBtn').click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /\.guionero$/i, label + ': Guardar como debe exportar el proyecto Guionero');
    const exportedPath = await download.path();
    assert.ok(exportedPath && fs.existsSync(exportedPath), label + ': el archivo exportado debe existir para probar Importar');

    // Import reuses the same file control and native import path; it must be reachable from the drawer.
    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('#projectImportBtn').click();
    const chooser = await chooserPromise;
    await chooser.setFiles(exportedPath);
    await page.waitForSelector('.guionero-project-dialog-actions button.primary', { state:'visible' });
    await page.locator('.guionero-project-dialog-actions button.primary').click();
    await page.waitForFunction(() => !document.querySelector('.guionero-project-overlay'));
    assert.equal(await page.locator('#sidebar').locator('#projectImportBtn').count(), 1,
      label + ': Importar conserva su control original dentro del menú');

    // The document scrolls independently; the format rail remains at the same screen coordinate.
    await page.locator('#sidebar').evaluate(el=>el.classList.remove('open'));
    const beforeScroll = await toolbar.evaluate(el => el.getBoundingClientRect().top);
    await page.locator('#workspace').evaluate(el => { el.scrollTop = el.scrollHeight - el.clientHeight; });
    await page.waitForTimeout(100);
    const afterScroll = await toolbar.evaluate(el => el.getBoundingClientRect().top);
    assert.ok(Math.abs(afterScroll-beforeScroll)<=1,
      label + ': la barra debe permanecer fija mientras el guion se desplaza por varias páginas');
    await assertToolbarGeometry(page, label + ' scrolled');

    // Emulate the visual viewport shrinking when the virtual keyboard opens.
    // This validates the responsive browser layout; it is not a physical OS keyboard test.
    const base = await page.evaluate(() => ({ width:window.innerWidth,height:window.innerHeight }));
    const activeLine = page.locator('#script .script-line').nth(60);
    await activeLine.click();
    await page.setViewportSize({ width:base.width, height:Math.max(480,base.height-240) });
    await page.waitForFunction(() => document.body.classList.contains('android-keyboard-visible'));
    await activeLine.evaluate(el=>el.scrollIntoView({block:'nearest',inline:'nearest'}));
    const keyboardState = await page.evaluate(() => {
      const header=document.querySelector('.topbar').getBoundingClientRect();
      const bar=document.getElementById('guioneroMobileScriptToolbar').getBoundingClientRect();
      const line=document.querySelector('#script .script-line[data-active="true"]')?.getBoundingClientRect();
      const ws=document.getElementById('workspace');
      return {
        keyboard:document.body.classList.contains('android-keyboard-visible'),
        headerBottom:header.bottom,barTop:bar.top,barBottom:bar.bottom,
        viewportHeight:window.innerHeight,lineTop:line?.top??null,lineBottom:line?.bottom??null,
        workspaceScroll:ws.scrollTop
      };
    });
    assert.equal(keyboardState.keyboard,true,label + ': el cambio de viewport debe activar el estado de teclado');
    assert.ok(keyboardState.barTop>=keyboardState.headerBottom-2,
      label + ': la barra debe seguir bajo la cabecera con el teclado abierto');
    assert.ok(keyboardState.barBottom<keyboardState.viewportHeight,
      label + ': los botones deben permanecer por encima del teclado simulado');
    assert.ok(keyboardState.lineTop!==null && keyboardState.lineTop>=keyboardState.barBottom-2 &&
      keyboardState.lineBottom<=keyboardState.viewportHeight,
      label + ': la línea activa debe seguir visible debajo de la barra y antes del teclado');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Texto escrito con el viewport reducido.');
    assert.equal(await toolbar.isVisible(),true,label + ': la barra debe seguir visible al escribir y pulsar Enter');
    await assertToolbarGeometry(page, label + ' keyboard viewport');

    // New project remains the same real creation flow and still closes the drawer after completion.
    await page.locator('#sidebar').evaluate(el=>el.classList.add('open'));
    await page.locator('#newScriptBtn').click();
    await page.waitForSelector('.guionero-project-dialog-actions button.primary', { state:'visible' });
    const dialogTitle = await page.locator('#guionero-project-dialog-title').innerText();
    assert.equal(dialogTitle,'Crear un nuevo guion',label + ': Nuevo proyecto debe abrir el diálogo existente');
    await page.locator('.guionero-project-dialog-actions button.primary').click();
    await page.waitForFunction(() => !document.querySelector('.guionero-project-overlay') &&
      document.querySelectorAll('#script .script-line').length === 1, null, { timeout:20000 });
    assert.deepEqual(errors,[],label + ': no debe haber errores JavaScript');
    console.log('PASS mobile Script menu, admin actions, pinned format bar and keyboard viewport ' + label);
  } finally {
    await context.close();
  }
}

(async () => {
  const desktopOnly = process.argv.includes('--desktop-only');
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const chrome = await chromium.launch({ headless:true, args:['--no-sandbox'] });
  let safari = null;
  try {
    await desktopMustRemainUnchanged(chrome);
    if (!desktopOnly) {
      await mobileMenuAndKeyboard(chrome, devices['Pixel 7'], 'Android Pixel 7 emulation');
      safari = await webkit.launch({ headless:true });
      await mobileMenuAndKeyboard(safari, devices['iPhone 13'], 'iPhone 13 WebKit emulation');
    }
  } finally {
    if (safari) await safari.close();
    await chrome.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode=1; });
