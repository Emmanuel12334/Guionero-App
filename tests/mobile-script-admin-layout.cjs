'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit, devices } = require('playwright');

const root = path.resolve(__dirname, '..');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.guionero':'application/x-guionero+json' };
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

async function openApp(browser, options, label) {
  const context = await browser.newContext({ ...options, acceptDownloads:true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4177/', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() =>
    !!window.GuioneroStudio &&
    !!document.getElementById('script') &&
    !!document.getElementById('projectManagementDock') &&
    !!document.getElementById('guioneroManagementActions') &&
    window.GuioneroStudioBooting !== true,
    null, { timeout:25000 });
  await page.locator('#tabScript').click();
  if (label.includes('Android') || label.includes('iPhone')) {
    await page.waitForSelector('#guioneroMobileScriptToolbar', { state:'visible', timeout:10000 });
    await page.waitForFunction(() =>
      document.body.classList.contains('guionero-mobile-device') &&
      document.getElementById('projectManagementDock')?.classList.contains('project-management-in-drawer'));
    assert.equal(await page.evaluate(() => window.__guioneroMobileTouchDevice), true,
      label + ': debe activarse la experiencia móvil táctil');
  }
  return { context, page, errors, label };
}

async function mobileLayoutAndAdmin(browser, options, label) {
  const session = await openApp(browser, options, label);
  const { page, context, errors } = session;
  try {
    const structure = await page.evaluate(() => {
      const bar = document.getElementById('guioneroMobileScriptToolbar');
      const menu = document.getElementById('mobileMenuBtn');
      const topbar = document.querySelector('.topbar');
      const dock = document.getElementById('projectManagementDock');
      const sidebar = document.getElementById('sidebar');
      const workspace = document.getElementById('workspace');
      const scriptPane = document.getElementById('paneScript');
      const ids = ['newScriptBtn','savedScriptsBrowseBtn','savedScriptSelect','projectImportBtn',
        'projectSaveBtn','projectSaveAsBtn','guioneroStructureBtn','guioneroSettingsBtn'];
      return {
        menuIsFirst:topbar?.firstElementChild===menu,
        menuParent:menu?.parentElement?.className || '',
        menuDisplay:getComputedStyle(menu).display,
        toolbarParent:bar?.parentElement?.id || '',
        toolbarBeforeWorkspace:!!bar && bar.nextElementSibling===workspace,
        toolbarButtonCount:bar?.querySelectorAll('button').length || 0,
        dockInsideSidebar:!!dock && sidebar.contains(dock),
        dockOutsideScript:!!dock && !scriptPane.contains(dock),
        dockClass:dock?.className || '',
        drawerAccordion:!!dock?.querySelector('.android-project-toggle'),
        controls:ids.map(id=>({id,inside:!!dock?.contains(document.getElementById(id))})),
        workspaceContainsProjectPanel:!!workspace?.querySelector('#scriptProjectToolbar'),
        bodyDrawerActive:document.body.classList.contains('project-management-active')
      };
    });
    assert.equal(structure.menuIsFirst, true, label + ': el botón ☰ debe estar arriba a la izquierda');
    assert.equal(structure.toolbarParent, 'paneScript', label + ': la barra debe vivir debajo de la cabecera');
    assert.equal(structure.toolbarBeforeWorkspace, true, label + ': la barra debe estar fuera del scroll del documento');
    assert.equal(structure.toolbarButtonCount, 7, label + ': deben estar los siete botones de formato');
    assert.equal(structure.dockInsideSidebar, true, label + ': toda la gestión debe vivir en el cajón lateral');
    assert.equal(structure.dockOutsideScript, true, label + ': la gestión no debe ocupar el editor');
    assert.equal(structure.drawerAccordion, false, label + ': no debe quedar un segundo acordeón de gestión');
    assert.equal(structure.workspaceContainsProjectPanel, false, label + ': el panel antiguo no debe quedar en el documento');
    assert.deepEqual(structure.controls.map(x=>x.inside), Array(8).fill(true),
      label + ': el menú debe contener Nuevo, Buscar, Biblioteca, Importar, Guardar, Guardar como, Estructura y Configuración');

    const menu = page.locator('#mobileMenuBtn');
    const sidebar = page.locator('#sidebar');
    await menu.click();
    await page.waitForFunction(() => document.getElementById('sidebar')?.classList.contains('open'));
    const drawerVisibility = await page.evaluate(() => {
      const dock=document.getElementById('projectManagementDock');
      const sidebar=document.getElementById('sidebar');
      const actions=sidebar?.querySelector('.sidebar-actions');
      const describe=el=>{if(!el)return null;const r=el.getBoundingClientRect(),cs=getComputedStyle(el);return {
        id:el.id,className:el.className,display:cs.display,visibility:cs.visibility,position:cs.position,
        width:r.width,height:r.height,top:r.top,left:r.left,opacity:cs.opacity,overflow:cs.overflow,
        hidden:el.hidden
      };};
      return {
        bodyClasses:document.body.className,
        sidebar:describe(sidebar),
        sidebarActions:describe(actions),
        dock:describe(dock),
        dockChildren:Array.from(dock?.children||[]).map(describe),
        mobileClass:dock?.classList.contains('project-management-in-drawer')
      };
    });
    assert.equal(await page.locator('#projectManagementDock').isVisible(), true,
      label + ': el panel de gestión debe verse al abrir ☰. Estado: '+JSON.stringify(drawerVisibility));
    assert.equal(await menu.getAttribute('aria-expanded'), 'true', label + ': ☰ debe reflejar el estado abierto');
    await page.locator('#mainTitle').click();
    await page.waitForFunction(() => !document.getElementById('sidebar')?.classList.contains('open'));
    assert.equal(await menu.getAttribute('aria-expanded'), 'false', label + ': un toque fuera debe cerrar el cajón');

    await menu.click();
    await sidebar.waitFor({ state:'visible' });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('sidebar')?.classList.contains('open'));

    // Guardar conserva el handler real; se fuerza un cambio antes de pulsar el control.
    await page.locator('#script').click();
    await page.keyboard.type('Prueba de guardado móvil.');
    await menu.click();
    await page.locator('#projectSaveBtn').click();
    await page.waitForFunction(() => document.getElementById('saveStatus')?.textContent==='Guardado',
      null, { timeout:10000 });
    await page.waitForFunction(() => !document.getElementById('sidebar')?.classList.contains('open'));

    // Guardar como exporta un proyecto completo reutilizable como fixture real de Importar.
    await menu.click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#projectSaveAsBtn').click();
    const download = await downloadPromise;
    const exportedPath = await download.path();
    assert.ok(exportedPath && fs.statSync(exportedPath).size>0,
      label + ': Guardar como debe generar un archivo de proyecto');
    const exportedBuffer = fs.readFileSync(exportedPath);
    const exportedObject = JSON.parse(exportedBuffer.toString('utf8'));
    assert.ok(Array.isArray(exportedObject.pages) && Array.isArray(exportedObject.connections),
      label + ': el archivo exportado debe preservar la estructura del proyecto');
    await page.waitForFunction(() => !document.getElementById('sidebar')?.classList.contains('open'));

    // Importar proyecto usa el selector real del dispositivo y el diálogo de confirmación existente.
    const previousId = await page.evaluate(() => window.__guioneroSafeStorage.getItem('guionero_active_project_id'));
    await menu.click();
    const importChooserPromise = page.waitForEvent('filechooser');
    await page.locator('#projectImportBtn').click();
    const importChooser = await importChooserPromise;
    await importChooser.setFiles({name:'guionero-import-test.guionero',mimeType:'application/x-guionero+json',buffer:exportedBuffer});
    const importDialog = page.locator('.guionero-project-dialog');
    await importDialog.waitFor({state:'visible',timeout:8000});
    await importDialog.getByRole('button',{name:'Importar y abrir'}).click();
    await page.waitForFunction(id => window.__guioneroSafeStorage.getItem('guionero_active_project_id')!==id,
      previousId, {timeout:20000});
    await page.waitForFunction(() => !document.querySelector('.guionero-project-overlay'));
    await page.waitForFunction(() => !document.getElementById('sidebar')?.classList.contains('open'));

    // Buscar archivos sigue usando el mismo selector; se cancela la importación posterior.
    await menu.click();
    const browseChooserPromise = page.waitForEvent('filechooser');
    await page.locator('#savedScriptsBrowseBtn').click();
    const browseChooser = await browseChooserPromise;
    await browseChooser.setFiles({name:'guionero-browse-test.guionero',mimeType:'application/x-guionero+json',buffer:exportedBuffer});
    await importDialog.waitFor({state:'visible',timeout:8000});
    await importDialog.getByRole('button',{name:'Cancelar'}).click();
    await page.waitForFunction(() => !document.querySelector('.guionero-project-overlay'));

    // Nuevo proyecto utiliza el diálogo real y debe activar un proyecto distinto.
    const beforeNewId = await page.evaluate(() => window.__guioneroSafeStorage.getItem('guionero_active_project_id'));
    await menu.click();
    await page.locator('#newScriptBtn').click();
    const newDialog = page.locator('.guionero-project-dialog');
    await newDialog.waitFor({state:'visible',timeout:8000});
    await newDialog.getByRole('button',{name:'Sí, crear nuevo'}).click();
    await page.waitForFunction(id => window.__guioneroSafeStorage.getItem('guionero_active_project_id')!==id,
      beforeNewId, {timeout:20000});
    await page.waitForFunction(() => !document.querySelector('.guionero-project-overlay'));

    // Estructura y Configuración deben abrir sus diálogos y permitir volver al editor.
    await menu.click();
    await page.locator('#guioneroStructureBtn').click();
    await page.locator('#guioneroStructureModal').waitFor({state:'visible',timeout:5000});
    await page.locator('#guioneroStructureModal [data-close-structure]').click();
    await menu.click();
    await page.locator('#guioneroSettingsBtn').click();
    await page.locator('#guioneroSettingsModal').waitFor({state:'visible',timeout:5000});
    await page.locator('#guioneroSettingsClose').click();
    await page.waitForFunction(() => !document.getElementById('sidebar')?.classList.contains('open'));

    // Llenar el documento con líneas y probar scroll + teclado (visual viewport reducido).
    await page.locator('#script').click();
    await page.keyboard.type('INT. CASA - DÍA');
    for (let i=0;i<18;i++) {
      await page.keyboard.press('Enter');
      await page.keyboard.type(('Acción '+i+' — una línea larga para probar el espacio de escritura. ').repeat(3));
    }
    const toolbar = page.locator('#guioneroMobileScriptToolbar');
    const workspace = page.locator('#workspace');
    const before = await toolbar.evaluate(el => el.getBoundingClientRect().top);
    await workspace.evaluate(el => { el.scrollTop=el.scrollHeight; });
    await page.waitForTimeout(80);
    const afterScroll = await toolbar.evaluate(el => el.getBoundingClientRect().top);
    assert.ok(Math.abs(afterScroll-before)<=1,label+': la barra no debe desplazarse con el documento');
    const longScroll = await workspace.evaluate(el => ({scroll:el.scrollTop,max:el.scrollHeight-el.clientHeight}));
    assert.ok(longScroll.max>0 && longScroll.scroll>0,label+': el documento debe poder desplazarse sin mover la barra');

    const initialSize = page.viewportSize();
    await page.setViewportSize({width:initialSize.width,height:Math.max(360,Math.round(initialSize.height*0.48))});
    await page.waitForTimeout(180);
    const keyboardState = await page.evaluate(() => {
      const bar=document.getElementById('guioneroMobileScriptToolbar');
      const topbar=document.querySelector('.topbar');
      const area=document.getElementById('workspace');
      const selection=window.getSelection();
      let line=selection?.anchorNode?.nodeType===1?selection.anchorNode:selection?.anchorNode?.parentElement;
      const root=document.getElementById('script');
      while(line&&line!==root&&line.parentElement!==root)line=line.parentElement;
      const b=bar.getBoundingClientRect(),h=topbar.getBoundingClientRect(),w=area.getBoundingClientRect();
      const r=line?.getBoundingClientRect?.();
      return {
        keyboardClass:document.body.classList.contains('android-keyboard-visible'),
        toolbarVisible:b.height>0&&b.top>=h.bottom-1&&b.bottom<=window.innerHeight,
        toolbarAboveWorkspace:b.bottom<=w.top+1,
        workspaceVisible:w.height>80&&w.bottom<=window.innerHeight+1,
        activeLineVisible:!!r&&r.height>0&&r.bottom>w.top&&r.top<w.bottom,
        allButtons:Array.from(bar.querySelectorAll('button')).map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))
      };
    });
    assert.equal(keyboardState.toolbarVisible,true,label+': la barra debe seguir visible debajo del encabezado con el teclado');
    assert.equal(keyboardState.toolbarAboveWorkspace,true,label+': la barra no debe cubrir la hoja');
    assert.equal(keyboardState.workspaceVisible,true,label+': el área de escritura debe adaptarse al viewport reducido');
    assert.equal(keyboardState.activeLineVisible,true,label+': la línea activa debe continuar visible');
    assert.equal(keyboardState.allButtons.length,7,label+': los siete botones deben seguir presentes');
    assert.ok(keyboardState.allButtons.every(button=>button.width>=64&&button.height>=44),
      label+': los botones deben conservar un tamaño táctil cómodo');

    // Confirmar que también se puede alcanzar el último botón sin cortar extremos.
    await toolbar.evaluate(el => { el.scrollLeft=el.scrollWidth; });
    const lastButton = await toolbar.locator('button').last().boundingBox();
    const toolbarBox = await toolbar.boundingBox();
    assert.ok(lastButton && toolbarBox && lastButton.x>=toolbarBox.x-1 &&
      lastButton.x+lastButton.width<=toolbarBox.x+toolbarBox.width+1,
      label+': el último botón debe ser accesible mediante scroll horizontal');
    assert.deepEqual(errors,[],label+': no debe haber errores JavaScript');
    console.log('PASS mobile Script fixed toolbar + admin drawer ' + label);
  } finally {
    await context.close();
  }
}

async function desktopUnchanged(browser) {
  const session = await openApp(browser, {viewport:{width:1440,height:960},deviceScaleFactor:1}, 'Windows desktop');
  const page = session.page;
  try {
    const state = await page.evaluate(() => {
      const topbar=document.querySelector('.topbar');
      const menu=document.getElementById('mobileMenuBtn');
      const dock=document.getElementById('projectManagementDock');
      const card=document.querySelector('.project-card');
      return {
        mobileClass:document.body.classList.contains('guionero-mobile-device'),
        firstHeaderChild:topbar?.firstElementChild?.className || '',
        menuParent:menu?.parentElement?.className || '',
        menuDisplay:getComputedStyle(menu).display,
        noMobileToolbar:!document.getElementById('guioneroMobileScriptToolbar'),
        dockInOriginalProjectCard:!!dock&&card.contains(dock),
        projectToolbarInDock:!!dock?.contains(document.getElementById('scriptProjectToolbar')),
        paneStartsWithWorkspace:document.getElementById('paneScript')?.firstElementChild?.id==='workspace'
      };
    });
    assert.equal(state.mobileClass,false,'Windows no debe activar clases móviles');
    assert.ok(state.firstHeaderChild.includes('doc-heading'),'El encabezado de escritorio debe conservar su orden');
    assert.equal(state.menuParent,'top-actions','El menú móvil no debe moverse en escritorio');
    assert.equal(state.menuDisplay,'none','El botón móvil debe permanecer oculto en escritorio');
    assert.equal(state.noMobileToolbar,true,'No debe inyectarse la barra móvil en escritorio');
    assert.equal(state.dockInOriginalProjectCard,true,'La gestión de escritorio debe permanecer en su ubicación previa');
    assert.equal(state.projectToolbarInDock,true,'El bloque de gestión no debe sacarse del panel de escritorio');
    assert.equal(state.paneStartsWithWorkspace,true,'Script de escritorio debe conservar el orden original');
    assert.deepEqual(session.errors,[],'No debe haber errores JavaScript en Windows');
    console.log('PASS mobile-only isolation; desktop Script unchanged');
  } finally {
    await session.context.close();
  }
}

(async () => {
  const desktopOnly=process.argv.includes('--desktop-only');
  await new Promise(resolve => server.listen(4177,'127.0.0.1',resolve));
  const chrome=await chromium.launch({headless:true,args:['--no-sandbox']});
  let safari=null;
  try {
    await desktopUnchanged(chrome);
    if(!desktopOnly){
      await mobileLayoutAndAdmin(chrome,devices['Pixel 7'],'Android Pixel 7 emulation');
      safari=await webkit.launch({headless:true});
      await mobileLayoutAndAdmin(safari,devices['iPhone 13'],'iPhone 13 WebKit Safari emulation');
    }
  } finally {
    if(safari)await safari.close();
    await chrome.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
