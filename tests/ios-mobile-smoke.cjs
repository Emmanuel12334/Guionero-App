const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { webkit, devices } = require('playwright');

const root = process.cwd();
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const relative = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(root, '.' + relative);
  if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });
});

(async () => {
  await new Promise(resolve => server.listen(4174, '127.0.0.1', resolve));
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));

  try {
    await page.goto('http://127.0.0.1:4174/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__guioneroMobileTouchDevice === true && !!window.GuioneroStudio, null, { timeout: 20000 });
    await page.waitForSelector('#guioneroMobileScriptToolbar', { state: 'visible', timeout: 10000 });
    await page.waitForSelector('#androidPaintDock', { state: 'attached', timeout: 10000 });

    const shell = await page.evaluate(() => ({
      mobileFlag: window.__guioneroMobileTouchDevice,
      iosFlag: window.__guioneroIOSDevice,
      legacyTouchBridge: window.__guioneroAndroidTouchDevice,
      classes: document.body.className,
      tabs: [...document.querySelectorAll('.studio-tab')].map(el => ({
        name: el.textContent.trim(),
        display: getComputedStyle(el).display,
        height: el.getBoundingClientRect().height
      })),
      scriptToolbar: !!document.querySelector('#guioneroMobileScriptToolbar'),
      paintDock: !!document.querySelector('#androidPaintDock'),
      bottomNav: getComputedStyle(document.querySelector('.studio-tabs')).position,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    assert.equal(shell.mobileFlag, true, 'iPhone touch capability gate should activate');
    assert.equal(shell.iosFlag, true, 'iPhone user agent should be detected as iOS');
    assert.equal(shell.legacyTouchBridge, true, 'legacy touch handlers should remain enabled');
    assert.match(shell.classes, /guionero-ios-device/);
    assert.equal(shell.tabs.length, 3, 'Script, Node and Paint remain the only main tabs');
    for (const tab of shell.tabs) {
      assert.notEqual(tab.display, 'none', tab.name + ' should be visible');
      assert.ok(tab.height >= 40, tab.name + ' should have a touch-friendly height');
    }
    assert.equal(shell.bottomNav, 'fixed', 'the three tabs should stay reachable at the bottom');
    assert.ok(shell.horizontalOverflow <= 2, 'iPhone page must not overflow horizontally: ' + shell.horizontalOverflow);

    // Script's contextual buttons must use the real screenplay type picker.
    const tools = await page.locator('#guioneroMobileScriptToolbar button').evaluateAll(nodes => nodes.map(node => ({
      type: node.dataset.scriptType,
      label: node.querySelector('.mobile-tool-label')?.textContent || '',
      aria: node.getAttribute('aria-label') || ''
    })));
    const expectedLabels = [
      ['SCENE',['Scene','Escena']],
      ['ACTION',['Action','Acción']],
      ['INTRO',['Intro']],
      ['CHARACTER',['Character','Personaje']],
      ['PARENTHETICAL',['Parenthetical','Paréntesis','Parentética']],
      ['DIALOGUE',['Dialogue','Diálogo']],
      ['TRANSITION',['Transition','Transición']]
    ];
    for (const [type, labels] of expectedLabels) {
      assert.ok(tools.some(item => item.type === type && labels.includes(item.label) && item.aria === item.label),
        'Script toolbar must include localized visible/accessibility label for ' + type + ': ' + JSON.stringify(tools));
    }
    await page.locator('#guioneroMobileScriptToolbar [data-script-type="ACTION"]').tap();
    await page.waitForFunction(() => document.querySelector('#script .script-line[data-type="ACTION"]'), null, { timeout: 5000 });
    assert.ok(await page.locator('#script').evaluate(el => el.isContentEditable), 'Script editor must remain the original contenteditable document');
    const formatTopBefore = await page.locator('#guioneroMobileScriptToolbar').evaluate(el => el.getBoundingClientRect().top);
    await page.locator('#workspace').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(100);
    const formatAfterScroll = await page.locator('#guioneroMobileScriptToolbar').evaluate(el => ({
      top: el.getBoundingClientRect().top,
      height: el.getBoundingClientRect().height,
      display: getComputedStyle(el).display
    }));
    assert.ok(formatAfterScroll.height >= 48 && formatAfterScroll.display !== 'none', 'iPhone format bar must remain visible');
    assert.ok(Math.abs(formatAfterScroll.top - formatTopBefore) < 2, 'iPhone format bar must not scroll with the screenplay');

    // The hamburger drawer now owns the original project-management controls.
    const menuButton = page.locator('#mobileMenuBtn');
    await menuButton.tap();
    assert.ok(await page.locator('#sidebar').evaluate(el => el.classList.contains('open')), 'iPhone hamburger must open the drawer');
    assert.equal(await page.locator('#projectManagementDock').evaluate(el => el.parentElement.id), 'sidebar');
    assert.equal(await page.locator('#androidProjectManagementToggle').count(), 0, 'Old accordion must not be recreated');
    for (const id of ['#newScriptBtn','#savedScriptsBrowseBtn','#savedScriptSelect','#projectImportBtn','#projectSaveBtn','#projectSaveAsBtn','#guioneroStructureBtn','#guioneroSettingsBtn']) {
      assert.ok(await page.locator(id).isVisible(), id + ' must be accessible from the iPhone drawer');
    }
    await menuButton.tap();
    assert.equal(await page.locator('#sidebar').evaluate(el => el.classList.contains('open')), false, 'Hamburger must close the drawer');

    await page.locator('#script .script-line').last().tap();
    await page.setViewportSize({ width: 390, height: 570 });
    await page.waitForTimeout(180);
    assert.ok(await page.locator('#guioneroMobileScriptToolbar').isVisible(), 'iPhone format bar must remain visible while the virtual keyboard reduces the viewport');
    assert.ok(await page.locator('body').evaluate(el => el.classList.contains('android-keyboard-visible')), 'The iPhone keyboard-safe layout must activate when the visual viewport shrinks');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(120);


    // Node must remain a real tab, not a screenshot/placeholder.
    await page.locator('#tabNote').tap();
    await page.waitForFunction(() => document.querySelector('#paneNote').classList.contains('active'));
    await page.locator('#noteToolbarToggle').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#noteCanvasWrap').isVisible());
    await page.locator('#noteToolbarToggle').tap();
    assert.equal(await page.locator('#noteToolbarContent').isVisible(), true);
    await page.locator('#noteToolbarToggle').tap();
    assert.equal(await page.locator('#noteToolbarContent').isVisible(), false);

    // Two synthetic touch pointers exercise the same Pointer Events used by mobile Safari.
    const nodeBefore = await page.locator('#noteWorld').evaluate(el => el.style.transform);
    const noteRect = await page.locator('#noteCanvasWrap').boundingBox();
    await page.evaluate(({x, y}) => {
      const send = (type, id, cx, cy) => {
        const target = document.elementFromPoint(cx, cy) || document.getElementById('noteCanvasWrap');
        target.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch',
          isPrimary: id === 1, button: 0, clientX: cx, clientY: cy
        }));
      };
      const x1=x+120,y1=y+150,x2=x+190,y2=y+150;
      send('pointerdown',1,x1,y1); send('pointerdown',2,x2,y2);
      send('pointermove',1,x1-5,y1+8); send('pointermove',2,x2+50,y2+8);
      send('pointerup',1,x1-5,y1+8); send('pointerup',2,x2+50,y2+8);
    }, { x: noteRect.x, y: noteRect.y });
    await page.waitForTimeout(100);
    const nodeAfter = await page.locator('#noteWorld').evaluate(el => el.style.transform);
    assert.notEqual(nodeAfter, nodeBefore, 'Node pinch should update the graph camera');

    // Paint exposes the actual editor, image import, freehand tools and canvas view.
    await page.locator('#tabPaint').tap();
    await page.waitForFunction(() => document.querySelector('#panePaint').classList.contains('active'));
    assert.ok(await page.locator('#paintCanvas').isVisible());
    const workareaStyle = await page.locator('#paintWorkarea').evaluate(el => getComputedStyle(el).backgroundImage);
    assert.match(workareaStyle, /radial-gradient/i, 'Paint should show its dotted grid');
    for (const id of ['#guioneroMobilePaintDraw','#guioneroMobilePaintText','#guioneroMobilePaintImage','#guioneroMobilePaintPan','#guioneroMobilePaintGrid','#guioneroMobilePaintShapes']) {
      assert.ok(await page.locator(id).isVisible(), id + ' must be available in Paint dock');
    }

    await page.locator('#guioneroMobilePaintShapes').tap();
    assert.equal(await page.locator('#guioneroMobilePaintShapeMenu').isVisible(), true);
    await page.locator('#guioneroMobilePaintShapeMenu [data-paint-shape="rect"]').tap();
    assert.equal(await page.locator('#paintTool').inputValue(), 'rect');
    assert.ok(await page.locator('#guioneroMobilePaintShapeOpacity').isVisible());

    // Draw a rectangle on the selected layer and verify that the raster model persists it.
    const canvasRect = await page.locator('#paintCanvas').boundingBox();
    const drawResult = await page.evaluate(({x,y}) => {
      const canvas = document.getElementById('paintCanvas');
      const send = (type, id, cx, cy) => {
        canvas.dispatchEvent(new PointerEvent(type, {
          bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',isPrimary:true,
          button:0,clientX:cx,clientY:cy
        }));
      };
      const before = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      send('pointerdown',31,x+40,y+55);
      window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerId:31,pointerType:'touch',isPrimary:true,button:0,clientX:x+160,clientY:y+140}));
      window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerId:31,pointerType:'touch',isPrimary:true,button:0,clientX:x+160,clientY:y+140}));
      const after = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let changed=0; for(let i=0;i<after.length;i+=4) if(after[i]!==before[i]||after[i+1]!==before[i+1]||after[i+2]!==before[i+2]||after[i+3]!==before[i+3]) changed++;
      const model = window.GuioneroStudio.exportState();
      const board = model.boards.find(b=>b.id===model.activeBoard);
      return {changed,hasRasterLayer:!!board?.layers?.[0],tool:document.getElementById('paintTool').value};
    }, { x:canvasRect.x, y:canvasRect.y });
    assert.equal(drawResult.tool, 'rect');
    assert.ok(drawResult.changed > 0, 'shape gesture should add pixels to the active Paint layer');
    assert.ok(drawResult.hasRasterLayer, 'shape should remain part of the saved editable layer');

    // Grid toggle does not modify the project's objects.
    const objectCountBefore = await page.evaluate(() => {
      const s=window.GuioneroStudio.exportState(),b=s.boards.find(v=>v.id===s.activeBoard);
      return (b.objects||[]).length;
    });
    await page.locator('#guioneroMobilePaintGrid').tap();
    await page.waitForTimeout(40);
    const objectCountAfter = await page.evaluate(() => {
      const s=window.GuioneroStudio.exportState(),b=s.boards.find(v=>v.id===s.activeBoard);
      return (b.objects||[]).length;
    });
    assert.equal(objectCountAfter, objectCountBefore, 'Grid visibility must not alter Paint objects');

    assert.deepEqual(runtimeErrors, [], 'iOS WebKit mobile run should not log uncaught page errors');
    console.log('PASS iOS WebKit mobile shell, Script toolbar, Node touch camera, Paint dock/grid/shapes');
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
