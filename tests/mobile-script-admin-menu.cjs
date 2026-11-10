'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit, devices } = require('playwright');

const root = path.resolve(__dirname, '..');
const mime = {
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml'
};
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
    res.writeHead(200, { 'content-type':mime[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-store' });
    res.end(data);
  });
});

async function openMobile(browser, options, label) {
  const context = await browser.newContext({ ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4177/', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.__guioneroMobileTouchDevice === true &&
    !!window.GuioneroStudio && !!document.getElementById('script'), null, { timeout:20000 });
  await page.waitForSelector('#guioneroMobileScriptToolbar', { state:'visible', timeout:10000 });
  await page.waitForFunction(() => {
    const dock=document.getElementById('projectManagementDock');
    return dock && dock.parentElement?.id==='sidebar' &&
      dock.querySelector('#newScriptBtn') &&
      dock.querySelector('#projectImportBtn') &&
      dock.querySelector('#projectSaveBtn') &&
      dock.querySelector('#projectSaveAsBtn') &&
      dock.querySelector('#guioneroStructureBtn') &&
      dock.querySelector('#guioneroSettingsBtn');
  }, null, { timeout:15000 });
  return { context, page, errors, label };
}

async function openDrawer(page) {
  await page.locator('#mobileMenuBtn').click();
  await page.waitForFunction(() => document.getElementById('sidebar')?.classList.contains('open') &&
    document.getElementById('mobileMenuBtn')?.getAttribute('aria-expanded')==='true', null, { timeout:3000 });
}

async function assertMobileShell(session) {
  const { page, label } = session;
  const state = await page.evaluate(() => {
    const bar=document.getElementById('guioneroMobileScriptToolbar');
    const workspace=document.getElementById('workspace');
    const topbar=document.querySelector('.topbar');
    const dock=document.getElementById('projectManagementDock');
    const sidebar=document.getElementById('sidebar');
    const ids=['newScriptBtn','savedScriptsBrowseBtn','savedScriptSelect','projectImportBtn',
      'projectSaveBtn','projectSaveAsBtn','projectFileInput','projectLibraryStatus',
      'guioneroStructureBtn','guioneroSettingsBtn'];
    const buttons=[...bar.querySelectorAll('button')];
    return {
      mobile:window.__guioneroMobileTouchDevice,
      mobileClass:document.body.classList.contains('guionero-mobile-device'),
      dockInDrawer:dock.parentElement===sidebar,
      dockInScript:document.getElementById('paneScript').contains(dock),
      legacyToggle:!!dock.querySelector('.android-project-toggle'),
      legacyCollapsedContent:!!dock.querySelector('.android-project-content'),
      dockTitle:dock.querySelector('.guionero-mobile-admin-heading')?.textContent||'',
      ids:Object.fromEntries(ids.map(id=>[id,dock.querySelectorAll('#'+id).length])),
      toolbarBeforeWorkspace:!!(bar.compareDocumentPosition(workspace)&Node.DOCUMENT_POSITION_FOLLOWING),
      toolbarTop:bar.getBoundingClientRect().top,
      toolbarBottom:bar.getBoundingClientRect().bottom,
      headerBottom:topbar.getBoundingClientRect().bottom,
      toolbarHeight:bar.getBoundingClientRect().height,
      buttonRects:buttons.map(button=>({
        type:button.dataset.scriptType,
        label:button.querySelector('.mobile-tool-label')?.textContent||'',
        aria:button.getAttribute('aria-label'),
        width:button.getBoundingClientRect().width,
        height:button.getBoundingClientRect().height
      })),
      pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
    };
  });
  assert.equal(state.mobile,true,label+': debe activarse la interfaz móvil');
  assert.equal(state.mobileClass,true,label+': debe activarse la clase móvil');
  assert.equal(state.dockInDrawer,true,label+': el panel original debe vivir en el menú lateral');
  assert.equal(state.dockInScript,false,label+': el panel ya no debe ocupar espacio en Script');
  assert.equal(state.legacyToggle,false,label+': no debe quedar el desplegable redundante Gestión de guiones');
  assert.equal(state.legacyCollapsedContent,false,label+': no debe quedar contenido de administración oculto');
  assert.match(state.dockTitle,/GESTIÓN DE GUIONES|GESTION DE GUIONES/i);
  for(const [id,count] of Object.entries(state.ids))assert.equal(count,1,label+': debe existir una sola instancia de '+id);
  assert.equal(state.toolbarBeforeWorkspace,true,label+': la barra debe estar fuera del área desplazable del documento');
  assert.ok(state.toolbarHeight>=44,label+': la barra debe conservar una altura táctil');
  assert.ok(state.toolbarTop>=state.headerBottom-1,label+': la barra debe quedar debajo de la cabecera principal');
  assert.equal(state.buttonRects.length,7,label+': deben existir los siete controles de tipo de guion');
  for(const button of state.buttonRects){
    assert.ok(button.width>=64,label+': el botón '+button.type+' debe conservar un ancho táctil');
    assert.ok(button.height>=44,label+': el botón '+button.type+' debe conservar una altura táctil');
    assert.equal(button.aria,button.label,label+': nombre visible y accesible deben coincidir');
  }
  assert.ok(state.pageOverflow<=2,label+': la página no debe desbordarse horizontalmente ('+state.pageOverflow+')');
}

async function testToolbarAndDrawer(session) {
  const { page, label, errors } = session;
  await assertMobileShell(session);
  const bar=page.locator('#guioneroMobileScriptToolbar');
  const workspace=page.locator('#workspace');

  // The long screenplay scrolls inside #workspace; the format bar must not move with it.
  await page.locator('#paper').evaluate(el=>{el.style.minHeight='2800px';});
  const before=await bar.evaluate(el=>el.getBoundingClientRect().top);
  await workspace.evaluate(el=>{el.scrollTop=900;});
  await page.waitForTimeout(80);
  const after=await bar.evaluate(el=>el.getBoundingClientRect().top);
  assert.ok(Math.abs(after-before)<=1,label+': la barra debe permanecer fija al recorrer páginas largas');

  // All seven controls remain reachable by horizontal scrolling without page overflow.
  const last=bar.locator('[data-script-type="TRANSITION"]');
  await bar.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
  const lastRect=await last.boundingBox();
  const barRect=await bar.boundingBox();
  assert.ok(lastRect && barRect && lastRect.x>=barRect.x-1 &&
    lastRect.x+lastRect.width<=barRect.x+barRect.width+1,
    label+': el último formato debe poder quedar completamente visible al desplazar la barra');
  await bar.evaluate(el=>{el.scrollLeft=0;});

  // Focus and writing must not displace the toolbar.
  const firstLine=page.locator('#script .script-line').first();
  await firstLine.click();
  await page.keyboard.type('Prueba de escritura');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Segunda línea');
  await page.waitForTimeout(100);
  const focusState=await page.evaluate(()=>({
    active:document.activeElement?.id,
    barVisible:document.getElementById('guioneroMobileScriptToolbar').getBoundingClientRect().height>0,
    workspaceScroll:document.getElementById('workspace').scrollTop
  }));
  assert.equal(focusState.active,'script',label+': el editor debe conservar el foco mientras se escribe');
  assert.equal(focusState.barVisible,true,label+': la barra no debe ocultarse al escribir o pulsar Enter');

  // A smaller visual viewport simulates the space reduction caused by the virtual keyboard.
  await page.setViewportSize({ width:390, height:500 });
  await page.waitForTimeout(160);
  await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
  await page.waitForFunction(()=>document.getElementById('projectManagementDock')?.parentElement?.id==='sidebar',null,{timeout:3000});
  const resized=await bar.evaluate(el=>({
    top:el.getBoundingClientRect().top,
    height:el.getBoundingClientRect().height,
    right:el.getBoundingClientRect().right,
    viewport:window.innerWidth
  }));
  assert.ok(resized.height>=44,label+': la barra debe seguir visible con la pantalla reducida');
  assert.ok(resized.top>=0 && resized.top<500,label+': la barra debe permanecer dentro del área visible');
  assert.ok(resized.right<=resized.viewport+1,label+': la barra no debe provocar desbordamiento lateral');
  assert.equal(await page.locator('#projectManagementDock').evaluate(el=>el.parentElement.id),'sidebar',
    label+': un resize del teclado no debe devolver Gestión de guiones al documento');

  // Hamburger opens the original sidebar; all the original management elements are available there.
  await openDrawer(page);
  const visibleIds=['newScriptBtn','savedScriptsBrowseBtn','savedScriptSelect','projectImportBtn',
    'projectSaveBtn','projectSaveAsBtn','guioneroStructureBtn','guioneroSettingsBtn'];
  for(const id of visibleIds)assert.equal(await page.locator('#sidebar #'+id).isVisible(),true,label+': '+id+' debe estar visible dentro del menú');
  assert.equal(await page.locator('#sidebar #projectManagementDock').count(),1,label+': no debe duplicarse el panel de gestión');
  assert.equal(await page.locator('#paneScript #projectManagementDock').count(),0,label+': no debe quedar un segundo acceso fuera del menú');

  // Toggle close.
  await page.locator('#mobileMenuBtn').click();
  await page.waitForFunction(()=>!document.getElementById('sidebar')?.classList.contains('open'));
  assert.equal(await page.locator('#mobileMenuBtn').getAttribute('aria-expanded'),'false',label+': el botón menú debe reflejar el cierre');

  // Outside tap closes the drawer.
  await openDrawer(page);
  await page.locator('#mainTitle').click();
  await page.waitForFunction(()=>!document.getElementById('sidebar')?.classList.contains('open'),null,{timeout:3000});

  // Escape closes the drawer.
  await openDrawer(page);
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.getElementById('sidebar')?.classList.contains('open'),null,{timeout:3000});

  assert.deepEqual(errors,[],label+': no debe haber errores JavaScript en la interfaz móvil');
}

async function testAdminActions(session) {
  const { page, label, errors } = session;

  // Manual save still calls the original save action.
  await openDrawer(page);
  await page.locator('#projectSaveBtn').click();
  await page.waitForFunction(()=>!document.getElementById('projectSaveBtn')?.disabled,null,{timeout:10000});
  await page.waitForFunction(()=>document.getElementById('toast')?.textContent.includes('Proyecto guardado correctamente'),null,{timeout:10000});
  assert.equal(await page.locator('#sidebar').evaluate(el=>el.classList.contains('open')),false,
    label+': Guardar debe devolver al editor cerrando el menú');

  // Save As is also the existing export-to-.guionero path.
  await openDrawer(page);
  const [download] = await Promise.all([
    page.waitForEvent('download',{timeout:10000}),
    page.locator('#projectSaveAsBtn').click()
  ]);
  const downloadedPath=await download.path();
  assert.ok(download.suggestedFilename().endsWith('.guionero'),label+': Guardar como debe exportar el proyecto Guionero');
  const projectBuffer=fs.readFileSync(downloadedPath);
  assert.ok(projectBuffer.length>0,label+': el archivo exportado debe contener el proyecto');

  // New project must execute the original project-switch routine and close the drawer.
  const previousId=await page.evaluate(()=>window.__guioneroSafeStorage.getItem('guionero_active_project_id'));
  await openDrawer(page);
  await page.locator('#newScriptBtn').click();
  await page.locator('.guionero-project-dialog button.primary').waitFor({state:'visible',timeout:5000});
  await page.locator('.guionero-project-dialog button.primary').click();
  await page.waitForFunction(oldId=>window.__guioneroSafeStorage.getItem('guionero_active_project_id')!==oldId,
    previousId,{timeout:15000});
  assert.equal(await page.locator('#sidebar').evaluate(el=>el.classList.contains('open')),false,
    label+': Nuevo proyecto debe cerrar el menú');

  // Import uses the original hidden input and importer, not a duplicate control.
  await openDrawer(page);
  const chooserPromise=page.waitForEvent('filechooser',{timeout:5000});
  await page.locator('#projectImportBtn').click();
  const chooser=await chooserPromise;
  await chooser.setFiles({
    name:'guionero-mobile-menu-test.guionero',
    mimeType:'application/x-guionero+json',
    buffer:projectBuffer
  });
  await page.locator('.guionero-project-dialog button.primary').waitFor({state:'visible',timeout:10000});
  assert.match(await page.locator('.guionero-project-dialog h2').innerText(),/Importar proyecto/i,
    label+': Importar debe abrir el diálogo original');
  const beforeImport=await page.evaluate(()=>window.__guioneroSafeStorage.getItem('guionero_active_project_id'));
  await page.locator('.guionero-project-dialog button.primary').click();
  await page.waitForFunction(oldId=>window.__guioneroSafeStorage.getItem('guionero_active_project_id')!==oldId,
    beforeImport,{timeout:20000});
  assert.equal(await page.locator('#sidebar').evaluate(el=>el.classList.contains('open')),false,
    label+': Importar debe cerrar el menú después de iniciar la importación');

  // Structure and settings open the original modals and return focus to the application.
  await openDrawer(page);
  await page.locator('#guioneroStructureBtn').click();
  await page.locator('#guioneroStructureModal').waitFor({state:'visible',timeout:5000});
  assert.equal(await page.locator('#sidebar').evaluate(el=>el.classList.contains('open')),false,
    label+': Estructura debe cerrar el menú');
  await page.locator('#guioneroStructureModal [data-close-structure]').click();

  await openDrawer(page);
  await page.locator('#guioneroSettingsBtn').click();
  await page.locator('#guioneroSettingsModal').waitFor({state:'visible',timeout:5000});
  assert.equal(await page.locator('#sidebar').evaluate(el=>el.classList.contains('open')),false,
    label+': Configuración debe cerrar el menú');
  await page.locator('#guioneroSettingsClose').click();

  assert.deepEqual(errors,[],label+': las acciones de administración no deben producir errores JavaScript');
  console.log('PASS mobile Script toolbar and project menu '+label);
}

async function desktopIsolation(browser) {
  const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto('http://127.0.0.1:4177/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!!window.GuioneroStudio && !!document.getElementById('script'),null,{timeout:20000});
    const state=await page.evaluate(()=>({
      mobileFlag:window.__guioneroMobileTouchDevice===true,
      mobileClass:document.body.classList.contains('guionero-mobile-device'),
      mobileToolbar:!!document.getElementById('guioneroMobileScriptToolbar'),
      menuDisplay:getComputedStyle(document.getElementById('mobileMenuBtn')).display,
      dockParent:document.getElementById('projectManagementDock')?.parentElement?.className||'',
      dockInsideProjectCard:!!document.querySelector('.project-card #projectManagementDock'),
      projectToolbar:!!document.querySelector('#projectManagementDock #scriptProjectToolbar'),
      newProject:!!document.querySelector('#projectManagementDock #newScriptBtn')
    }));
    assert.equal(state.mobileFlag,false,'Desktop must not activate the mobile bridge');
    assert.equal(state.mobileClass,false,'Desktop must not receive mobile-specific classes');
    assert.equal(state.mobileToolbar,false,'Desktop must not receive the seven-button mobile toolbar');
    assert.equal(state.menuDisplay,'none','Desktop hamburger must remain hidden');
    assert.equal(state.dockInsideProjectCard,true,'Desktop project management must remain in its original project card');
    assert.equal(state.projectToolbar,true,'Desktop keeps its original project controls');
    assert.equal(state.newProject,true,'Desktop keeps the original new-project button');
    assert.deepEqual(errors,[],'Desktop must not produce errors');
    console.log('PASS mobile admin isolation Windows/Desktop');
  }finally{await context.close();}
}

(async()=>{
  await new Promise(resolve=>server.listen(4177,'127.0.0.1',resolve));
  const chrome=await chromium.launch({headless:true,args:['--no-sandbox']});
  let safari=null;
  try{
    await desktopIsolation(chrome);
    const android=await openMobile(chrome,devices['Pixel 7'],'Android Pixel 7 emulation');
    try{await testToolbarAndDrawer(android);await testAdminActions(android);}finally{await android.context.close();}
    safari=await webkit.launch({headless:true});
    const iphone=await openMobile(safari,{
      ...devices['iPhone 13'],
      viewport:{width:390,height:844},
      deviceScaleFactor:3,
      isMobile:true,
      hasTouch:true,
      userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    },'iPhone 13 Safari WebKit emulation');
    try{await testToolbarAndDrawer(iphone);await testAdminActions(iphone);}finally{await iphone.context.close();}
  }finally{
    if(safari)await safari.close();
    await chrome.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
