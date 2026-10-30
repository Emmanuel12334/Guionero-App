import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const url = pathToFileURL(resolve('index.html')).href;
const report = [];
const errors = [];
const DESKTOP_BASELINE = '46e69883e55768b9afcc637e48fb5327e031d2bd';
let baselineDir = null;
const browser = await chromium.launch({ headless: true });
function pass(name, detail = '') { report.push({name, result:'PASS', detail}); }
function assertStep(name, fn) {
  try { return fn(); } catch (e) { report.push({name, result:'FAIL', detail:String(e.message || e)}); throw e; }
}
async function boot(page, target=url) {
  await page.goto(target, {waitUntil:'domcontentloaded'});
  await page.waitForSelector('#script', {timeout:15000});
  await page.waitForFunction(() => !!window.GuioneroStudio && !!document.querySelector('.studio-tabs'), null, {timeout:15000});
  await page.waitForTimeout(900);
}
async function touch(cdp, type, pts) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: pts.map(p => ({id:p.id, x:Math.round(p.x), y:Math.round(p.y), radiusX:3, radiusY:3, force:1}))
  });
}
async function desktopSnapshot(page) {
  const tabs=['#tabScript','#tabNote','#tabPaint'];
  const selectors=['.sidebar','.topbar','.studio-tabs','.workspace','#paper','#script','#scriptProjectToolbar','#scriptFormatToolbar','.note-toolbar','.note-layout','#noteCanvasWrap','#noteInspector','.paint-toolbar','#paintWorkarea','#paintLayersPanel','#paintViewport','#paintBoard','#paintCanvas'];
  const snapshots={};
  for(const tab of tabs){
    await page.locator(tab).click();
    const pane=await page.locator(tab).getAttribute('data-pane');
    await page.waitForFunction(id=>document.getElementById(id)?.classList.contains('active'),pane);
    snapshots[tab]=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>{
      const el=document.querySelector(id);if(!el)return[id,null];
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      return[id,{x:r.x,y:r.y,width:r.width,height:r.height,display:s.display,position:s.position,flex:s.flex,flexDirection:s.flexDirection,overflow:s.overflow,padding:s.padding,margin:s.margin,transform:s.transform,backgroundColor:s.backgroundColor}];
    })),selectors);
  }
  return snapshots;
}
async function center(page, selector) {
  return page.locator(selector).evaluate(el => {
    const r=el.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height,left:r.left,top:r.top};
  });
}
try {
  const touchlessAndroid=await browser.newContext({
    viewport:{width:393,height:852},deviceScaleFactor:1,isMobile:true,hasTouch:false,
    userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
  });
  const touchlessPage=await touchlessAndroid.newPage();
  await boot(touchlessPage);
  const touchless=await touchlessPage.evaluate(()=>({
    androidTouch:!!window.__guioneroAndroidTouch,
    touchCapable:!!window.__guioneroTouchCapable,
    androidClass:document.body.classList.contains('android-device'),
    paintControls:!!document.querySelector('#androidPaintControls')
  }));
  assert.equal(touchless.androidTouch,false,'Android UA without touch capability must not receive phone-only UI');
  assert.equal(touchless.androidClass,false);
  assert.equal(touchless.paintControls,false);
  pass('Android UA without touch capability keeps the desktop UI',JSON.stringify(touchless));
  await touchlessAndroid.close();

  const mobile = await browser.newContext({
    viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true,
    userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
  });
  const page = await mobile.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await boot(page);

  const inputProfile=await page.evaluate(()=>({
    android:!!window.__guioneroAndroidTouch,
    touch:!!window.__guioneroTouchCapable,
    platform:String(navigator.userAgentData?.platform||navigator.platform||'')
  }));
  assert.equal(inputProfile.android,true,'Android + touch capability must activate the mobile UI');
  assert.equal(inputProfile.touch,true,'Android emulation must expose touch capability');
  pass('Android platform and touch-capability detection',JSON.stringify(inputProfile));

  // Script remains the existing contenteditable document, including native selection and clipboard shortcuts.
  const scriptLine=page.locator('#script .script-line').first();
  await scriptLine.click();
  await page.keyboard.type('Texto móvil para comprobar el teclado');
  assert.match((await page.locator('#script').innerText()).toLocaleUpperCase(),/TEXTO MÓVIL PARA COMPROBAR EL TECLADO/);
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Control+C');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(120);
  const pastedText=await page.locator('#script').innerText();
  assert.ok(pastedText.length>35,'Script copy/paste should retain the selected text');
  await page.keyboard.press('Control+Z');
  const undoText=await page.locator('#script').innerText();
  assert.ok(undoText.length<=pastedText.length,'Script undo should reverse the previous edit');
  const focusToggle=page.locator('#androidScriptFocusToggle');
  await focusToggle.tap();
  assert.ok(await page.locator('body').evaluate(el=>el.classList.contains('android-script-focus')),'Script focus mode did not activate');
  await page.locator('#androidScriptFormatToggle').tap();
  assert.ok(await page.locator('body').evaluate(el=>el.classList.contains('android-script-format-open')),'Script format popover did not open');
  await page.keyboard.press('Escape');
  await focusToggle.tap();
  assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('android-script-focus')),false);
  pass('Script mobile focus mode, format popover, typing, selection, copy/paste and undo');

  const shell = await page.evaluate(() => ({
    classes:document.body.className,
    width:document.documentElement.clientWidth,
    scrollWidth:document.documentElement.scrollWidth,
    noteDisplay:getComputedStyle(document.querySelector('#tabNote')).display,
    paintDisplay:getComputedStyle(document.querySelector('#tabPaint')).display,
    dock:!!document.querySelector('#projectManagementDock')
  }));
  assert.match(shell.classes,/android-device/);
  assert.notEqual(shell.noteDisplay,'none');
  assert.notEqual(shell.paintDisplay,'none');
  assert.ok(shell.dock);
  assert.ok(shell.scrollWidth <= shell.width + 2, 'Android layout has horizontal page overflow: '+shell.scrollWidth+' vs '+shell.width);
  pass('Android detection and responsive shell',JSON.stringify(shell));

  const projToggle=page.locator('#androidProjectManagementToggle');
  await projToggle.waitFor({state:'visible',timeout:5000});
  const projPanel=page.locator('#androidProjectManagementContent');
  assert.equal(await projPanel.isHidden(),true);
  await projToggle.click();
  assert.equal(await projPanel.isVisible(),true);
  for (const id of ['#newScriptBtn','#projectImportBtn','#projectSaveAsBtn']) assert.ok(await page.locator(id).isVisible(), id+' must be accessible while expanded');
  await projToggle.click();
  assert.equal(await projPanel.isHidden(),true);
  pass('Script project accordion opens and closes');

  await page.locator('#tabNote').click();
  await page.waitForFunction(()=>document.querySelector('#paneNote').classList.contains('active'));
  const nodeToggle=page.locator('#noteToolbarToggle');
  await nodeToggle.waitFor({state:'visible',timeout:5000});
  const nodePanel=page.locator('#noteToolbarContent');
  assert.equal(await nodePanel.isHidden(),true);
  await nodeToggle.click();
  assert.equal(await nodePanel.isVisible(),true);
  await nodeToggle.click();
  assert.equal(await nodePanel.isHidden(),true);

  // Create two manual pages and verify that a real touchscreen drag joins compatible ports.
  await nodeToggle.click();
  await page.locator('#noteAddPage').click();
  const nodePageEditor=page.locator('.node-page-editor').first();
  await nodePageEditor.waitFor({state:'visible',timeout:5000});
  await nodePageEditor.fill('Texto de Notes desde Android');
  await page.waitForTimeout(100);
  const noteTextSaved=await page.evaluate(()=>window.GuioneroStudio.exportState().pages.some(p=>(p.blocks||[]).some(b=>String(b.text||'').includes('Texto de Notes desde Android'))));
  assert.equal(noteTextSaved,true,'Notes page editor should save text into the existing Node model');
  await page.locator('#inspectorClose').click();
  await page.locator('#noteAddPage').click();
  await page.locator('#inspectorClose').click();
  let pair = await page.evaluate(() => {
    const s=window.GuioneroStudio.exportState(), ids=s.pages.slice(-2).map(p=>p.id);
    s.positions=s.positions||{};
    s.positions[ids[0]]={x:0,y:70};
    s.positions[ids[1]]={x:280,y:110};
    window.GuioneroStudio.importState(s,{notifyCloud:false});
    return ids;
  });
  await page.waitForTimeout(220);
  const outputSelector='.note-node[data-node-id="'+pair[0]+'"] .node-port[data-port="write-out"]';
  const inputSelector='.note-node[data-node-id="'+pair[1]+'"] .node-port[data-port="write-in"]';
  const outBox=await page.locator(outputSelector).boundingBox();
  const inBox=await page.locator(inputSelector).boundingBox();
  assert.ok(outBox&&inBox,'Compatible page ports must be reachable in Node');
  const connectionCdp=await mobile.newCDPSession(page);
  await touch(connectionCdp,'touchStart',[{id:41,x:outBox.x+outBox.width/2,y:outBox.y+outBox.height/2}]);
  await touch(connectionCdp,'touchMove',[{id:41,x:inBox.x+inBox.width/2,y:inBox.y+inBox.height/2}]);
  await touch(connectionCdp,'touchEnd',[]);
  await page.waitForTimeout(250);
  const connected=await page.evaluate(ids=>{
    const s=window.GuioneroStudio.exportState();
    return s.connections.some(c=>c.type==='write'&&c.fromNode===ids[0]&&c.toNode===ids[1]&&c.fromPort==='write-out'&&c.toPort==='write-in');
  },pair);
  assert.equal(connected,true,'Touch drag should connect an output to a compatible input');
  pass('Node connects compatible ports with a one-finger touch drag');
  await connectionCdp.detach();

  const cdp=await mobile.newCDPSession(page);
  const noteBefore=await page.locator('#noteWorld').evaluate(el=>el.style.transform);
  const nr=await center(page,'#noteCanvasWrap');
  const np1={x:nr.left+nr.width*.8,y:nr.top+nr.height*.8};
  await touch(cdp,'touchStart',[{id:11,...np1}]);
  await touch(cdp,'touchStart',[{id:11,...np1},{id:12,x:np1.x+65,y:np1.y+5}]);
  await touch(cdp,'touchMove',[{id:11,x:np1.x-8,y:np1.y+20},{id:12,x:np1.x+145,y:np1.y+20}]);
  await touch(cdp,'touchEnd',[]);
  await page.waitForTimeout(200);
  const noteAfter=await page.locator('#noteWorld').evaluate(el=>el.style.transform);
  assert.notEqual(noteAfter,noteBefore,'Node pinch did not change zoom/pan');
  pass('Node collapsible toolbar and two-finger pan/zoom',noteBefore+' -> '+noteAfter);
  await cdp.detach();

  await page.locator('#tabPaint').click();
  await page.waitForFunction(()=>document.querySelector('#panePaint').classList.contains('active'));
  const initialBoard=await page.evaluate(()=>({
    bg:getComputedStyle(document.querySelector('#paintBoard')).backgroundColor,
    canvasAlpha:document.querySelector('#paintCanvas').getContext('2d').getImageData(0,0,1,1).data[3]
  }));
  assert.equal(initialBoard.bg,'rgb(255, 255, 255)','Paint board must stay white');
  assert.equal(initialBoard.canvasAlpha,0,'The active paint layer must retain real transparency');
  await page.locator('#themeBtn').click();
  assert.equal(await page.locator('body').getAttribute('data-theme'),'dark');
  assert.equal(await page.locator('#paintBoard').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)','Dark UI theme must not darken the Paint board');
  await page.locator('#themeBtn').click();

  const layerDrawer=page.locator('#androidPaintLayersToggle');
  await layerDrawer.tap();
  assert.ok(await page.locator('#paintWorkarea').evaluate(el=>el.classList.contains('android-paint-drawer-open')),'Paint layers drawer did not open');
  const tools=page.locator('#androidPaintTools');
  await tools.waitFor({state:'visible',timeout:5000});
  assert.equal(await tools.evaluate(el=>el.open),false);
  await tools.locator('summary').click();
  assert.equal(await tools.evaluate(el=>el.open),true);
  const toolPicker=page.locator('#androidPaintTool');
  const toolOptions=await toolPicker.locator('option').evaluateAll(ns=>ns.map(n=>n.value));
  assert.ok(toolOptions.length>=2,'Brush picker has fewer than two tools');
  const currentTool=await page.locator('#paintTool').inputValue();
  const nextTool=toolOptions.find(v=>v!==currentTool);
  await toolPicker.selectOption(nextTool);
  assert.equal(await page.locator('#paintTool').inputValue(),nextTool,'Brush selection did not update the real tool');
  const currentColor=await page.locator('#paintColor').inputValue();
  const nextColor=currentColor==='#202124'?'#db2777':'#202124';
  await page.locator('#androidPaintColor').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},nextColor);
  assert.equal(await page.locator('#paintColor').inputValue(),nextColor);
  const sizePicker=page.locator('#androidPaintSize');
  const currentSize=Number(await page.locator('#paintSize').inputValue());
  const min=Number(await sizePicker.getAttribute('min')||1),max=Number(await sizePicker.getAttribute('max')||24);
  const nextSize=String(currentSize<max?currentSize+1:Math.max(min,currentSize-1));
  await sizePicker.evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},nextSize);
  assert.equal(await page.locator('#paintSize').inputValue(),nextSize);
  assert.ok(await page.locator('#androidPaintUndo').isVisible());
  assert.ok(await page.locator('#androidPaintRedo').isVisible());
  pass('Paint drawer, brush, color, brush size, undo and redo');
  await page.locator('#androidPaintLayersClose').tap();
  assert.equal(await page.locator('#paintWorkarea').evaluate(el=>el.classList.contains('android-paint-drawer-open')),false);

  const zoomLabel=page.locator('#androidPaintZoomValue');
  const zoomStart=await zoomLabel.innerText();
  await page.locator('#androidPaintZoomIn').tap();
  const zoomIn=await zoomLabel.innerText();
  assert.notEqual(zoomIn,zoomStart,'Android Paint zoom in button did not update the percentage');
  await page.locator('#androidPaintZoomOut').tap();
  assert.equal(await zoomLabel.innerText(),zoomStart,'Android Paint zoom out should reverse one zoom step');
  await page.locator('#androidPaintReset').tap();
  assert.equal(await zoomLabel.innerText(),'100%','Android Paint reset should restore actual-size zoom');
  await page.locator('#androidPaintFit').tap();
  assert.ok(/%$/.test(await zoomLabel.innerText()),'Android Paint Fit should update the zoom readout');

  const paintCdp=await mobile.newCDPSession(page);
  async function canvasHash() {
    return page.locator('#paintCanvas').evaluate(el=>{
      const d=el.getContext('2d').getImageData(0,0,el.width,el.height).data;
      let h=2166136261;for(let i=0;i<d.length;i++)h=Math.imul(h^d[i],16777619)>>>0;return h;
    });
  }
  const hashBeforePinch=await canvasHash();
  const paintBefore=await page.locator('#paintWorld').evaluate(el=>el.style.transform);
  const vr=await center(page,'#paintViewport');
  const pp1={x:vr.left+Math.min(35,vr.width*.25),y:vr.top+Math.min(70,vr.height*.25)};
  await touch(paintCdp,'touchStart',[{id:21,...pp1}]);
  await touch(paintCdp,'touchStart',[{id:21,...pp1},{id:22,x:pp1.x+50,y:pp1.y+6}]);
  await touch(paintCdp,'touchMove',[{id:21,x:pp1.x-8,y:pp1.y+20},{id:22,x:pp1.x+115,y:pp1.y+20}]);
  await touch(paintCdp,'touchEnd',[]);
  await page.waitForTimeout(220);
  const paintAfterPinch=await page.locator('#paintWorld').evaluate(el=>el.style.transform);
  const hashAfterPinch=await canvasHash();
  assert.notEqual(paintAfterPinch,paintBefore,'Paint pinch did not change zoom/pan');
  assert.equal(hashAfterPinch,hashBeforePinch,'Two-finger navigation must not draw on the canvas');

  const cr=await page.locator('#paintCanvas').evaluate(el=>{
    const r=el.getBoundingClientRect(),v=document.querySelector('#paintViewport').getBoundingClientRect();
    const left=Math.max(r.left,v.left),top=Math.max(r.top,v.top),right=Math.min(r.right,v.right),bottom=Math.min(r.bottom,v.bottom);
    if(right-left<30||bottom-top<30)throw new Error('Paint canvas has no usable visible touch area');
    return{x:left+Math.min(45,(right-left)/2),y:top+Math.min(45,(bottom-top)/2)};
  });
  await touch(paintCdp,'touchStart',[{id:31,...cr}]);
  await touch(paintCdp,'touchMove',[{id:31,x:cr.x+40,y:cr.y+30}]);
  await touch(paintCdp,'touchMove',[{id:31,x:cr.x+75,y:cr.y+45}]);
  await touch(paintCdp,'touchEnd',[]);
  await page.waitForTimeout(350);
  const hashAfterDraw=await canvasHash();
  assert.notEqual(hashAfterDraw,hashAfterPinch,'One-finger touch did not draw on Paint');
  await layerDrawer.tap();
  if(!await tools.evaluate(el=>el.open))await tools.locator('summary').tap();
  await page.locator('#androidPaintUndo').click();
  await page.waitForTimeout(350);
  const hashAfterUndo=await canvasHash();
  assert.equal(hashAfterUndo,hashAfterPinch,'Undo should restore the previous drawing state');
  await page.locator('#androidPaintRedo').click();
  await page.waitForTimeout(350);
  const hashAfterRedo=await canvasHash();
  assert.equal(hashAfterRedo,hashAfterDraw,'Redo should restore the drawn state');
  await page.locator('#androidPaintLayersClose').tap();
  const transformAfterDraw=await page.locator('#paintWorld').evaluate(el=>el.style.transform);
  assert.equal(transformAfterDraw,paintAfterPinch,'One-finger drawing should not move the canvas');
  pass('Paint pinch does not draw; one-finger draw, undo and redo work',paintBefore+' -> '+paintAfterPinch+'; canvas '+hashBeforePinch+' -> '+hashAfterPinch+' -> '+hashAfterDraw+' -> undo '+hashAfterUndo+' -> redo '+hashAfterRedo);

  const stateBeforeExport=await page.evaluate(()=>window.GuioneroStudio.exportState());
  assert.equal(stateBeforeExport.version,7,'The existing project schema version must remain unchanged');
  const activeBoard=stateBeforeExport.boards.find(b=>b.id===stateBeforeExport.activeBoard);
  assert.equal(activeBoard.backgroundColor,'#ffffff','Paint board model background must stay white');
  const imageCountBefore=stateBeforeExport.images.length;
  await page.locator('#paintSend').click();
  await page.waitForFunction(count=>window.GuioneroStudio.exportState().images.length>count,imageCountBefore,{timeout:10000});
  const fullExport=await page.evaluate(async()=>{
    const s=window.GuioneroStudio.exportState(),image=s.images[s.images.length-1];
    const img=new Image();img.src=image.data;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);
    return {mode:image.sourceMode,pixel:Array.from(c.getContext('2d').getImageData(0,0,1,1).data)};
  });
  assert.equal(fullExport.mode,'full');
  assert.deepEqual(fullExport.pixel,[255,255,255,255],'Full-board export should include a white opaque backing');
  await page.locator('#tabPaint').click();
  await page.waitForFunction(()=>document.querySelector('#panePaint').classList.contains('active'));
  const layerImageCount=await page.evaluate(()=>window.GuioneroStudio.exportState().images.length);
  await page.locator('#paintSendLayer').click();
  await page.waitForFunction(count=>window.GuioneroStudio.exportState().images.length>count,layerImageCount,{timeout:10000});
  const layerExport=await page.evaluate(async()=>{
    const s=window.GuioneroStudio.exportState(),image=s.images[s.images.length-1];
    const img=new Image();img.src=image.data;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);
    return {mode:image.sourceMode,pixel:Array.from(c.getContext('2d').getImageData(0,0,1,1).data)};
  });
  assert.equal(layerExport.mode,'layer');
  assert.equal(layerExport.pixel[3],0,'Layer-only export must preserve transparent pixels');
  pass('Paint full export stays white; individual layer export preserves alpha');

  await page.locator('#tabPaint').click();
  await page.waitForFunction(()=>document.querySelector('#panePaint').classList.contains('active'));
  const objectId='android-touch-object-test';
  const objectStart=await page.evaluate(id=>{
    const s=window.GuioneroStudio.exportState(),b=s.boards.find(x=>x.id===s.activeBoard);
    const o={id,kind:'text',name:'Objeto táctil',text:'Objeto táctil',x:260,y:240,w:900,h:260,rotation:0,flipX:false,flipY:false,opacity:1,visible:true,layerId:b.activeLayerId,color:'#202124',fontFamily:'Arial',fontSize:64};
    b.objects.push(o);window.GuioneroStudio.importState(s,{notifyCloud:false});return{x:o.x,y:o.y};
  },objectId);
  await page.locator('#paintMode').selectOption('select');
  await page.locator('#paintFit').click();
  const objectLocator=page.locator('[data-paint-object-id="'+objectId+'"]');
  await objectLocator.waitFor({state:'visible',timeout:5000});
  const objectBox=await objectLocator.boundingBox();
  assert.ok(objectBox&&objectBox.width>50&&objectBox.height>20,'Paint object must have a reachable touch target');
  const objectCdp=await mobile.newCDPSession(page);
  const objectPoint={x:objectBox.x+objectBox.width/2,y:objectBox.y+objectBox.height/2};
  await touch(objectCdp,'touchStart',[{id:51,...objectPoint}]);
  await touch(objectCdp,'touchMove',[{id:51,x:objectPoint.x+36,y:objectPoint.y+18}]);
  await touch(objectCdp,'touchEnd',[]);
  await page.waitForTimeout(180);
  const objectAfterDrag=await page.evaluate(id=>{
    const s=window.GuioneroStudio.exportState(),b=s.boards.find(x=>x.id===s.activeBoard);const o=b.objects.find(x=>x.id===id);return{x:o.x,y:o.y};
  },objectId);
  assert.notEqual(objectAfterDrag.x,objectStart.x,'One-finger touch should move a selected Paint object');
  const movedBox=await objectLocator.boundingBox();
  const pinchPoint={x:movedBox.x+movedBox.width/2,y:movedBox.y+movedBox.height/2};
  const objectTransformBefore=await page.locator('#paintWorld').evaluate(el=>el.style.transform);
  await touch(objectCdp,'touchStart',[{id:61,...pinchPoint}]);
  await touch(objectCdp,'touchStart',[{id:61,...pinchPoint},{id:62,x:pinchPoint.x+28,y:pinchPoint.y+3}]);
  await touch(objectCdp,'touchMove',[{id:61,x:pinchPoint.x-10,y:pinchPoint.y+12},{id:62,x:pinchPoint.x+75,y:pinchPoint.y+12}]);
  await touch(objectCdp,'touchEnd',[]);
  await page.waitForTimeout(220);
  const objectAfterPinch=await page.evaluate(id=>{
    const s=window.GuioneroStudio.exportState(),b=s.boards.find(x=>x.id===s.activeBoard);const o=b.objects.find(x=>x.id===id);return{x:o.x,y:o.y};
  },objectId);
  const objectTransformAfter=await page.locator('#paintWorld').evaluate(el=>el.style.transform);
  assert.deepEqual(objectAfterPinch,objectAfterDrag,'Two-finger pan/zoom must cancel object movement');
  assert.notEqual(objectTransformAfter,objectTransformBefore,'Two-finger pinch over an object should still navigate Paint');
  pass('Paint one-finger object movement and two-finger cancellation do not conflict');
  await objectCdp.detach();

  assert.deepEqual(errors,[],'Runtime errors: '+errors.join(' | '));
  pass('Android runtime: no uncaught JavaScript errors');
  await mobile.close();


  // Broader phone layout matrix: compact/large portrait and a phone held horizontally.
  const phoneLayouts = [
    {name:'compact portrait',width:360,height:740,orientation:'portrait',kind:'phone'},
    {name:'medium portrait',width:393,height:852,orientation:'portrait',kind:'phone'},
    {name:'large portrait',width:412,height:915,orientation:'portrait',kind:'phone'},
    {name:'landscape phone',width:915,height:412,orientation:'landscape',kind:'phone'},
    {name:'portrait tablet',width:800,height:1280,orientation:'portrait',kind:'tablet'},
    {name:'landscape tablet',width:1280,height:800,orientation:'landscape',kind:'tablet'}
  ];
  for (const layout of phoneLayouts) {
    const context=await browser.newContext({
      viewport:{width:layout.width,height:layout.height},
      deviceScaleFactor:2,isMobile:true,hasTouch:true,
      userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
    });
    const phonePage=await context.newPage(),phoneErrors=[];
    phonePage.on('pageerror',e=>phoneErrors.push(e.message));
    await boot(phonePage);
    const tabs=await phonePage.evaluate(()=>({
      android:document.body.classList.contains('android-device'),
      androidStylesheet:!!document.querySelector('#guionero-android-phone-layout') && !!document.querySelector('#guionero-android-phone-layout').sheet,
      width:document.documentElement.clientWidth,
      scrollWidth:document.documentElement.scrollWidth,
      note:getComputedStyle(document.querySelector('#tabNote')).display,
      paint:getComputedStyle(document.querySelector('#tabPaint')).display,
      tabHeight:document.querySelector('#tabPaint').getBoundingClientRect().height,
      tabMinHeight:getComputedStyle(document.querySelector('#tabPaint')).minHeight,
      tabBoxSizing:getComputedStyle(document.querySelector('#tabPaint')).boxSizing,
      tabVisibility:getComputedStyle(document.querySelector('#tabPaint')).visibility
    }));
    assert.equal(tabs.android,true,layout.name+' must be detected as Android');
    assert.equal(tabs.androidStylesheet,true,layout.name+' Android stylesheet must be loaded');
    assert.notEqual(tabs.note,'none',layout.name+' must expose Node');
    assert.notEqual(tabs.paint,'none',layout.name+' must expose Paint');
    assert.ok(tabs.scrollWidth<=tabs.width+2,layout.name+' has horizontal page overflow');
    assert.ok(tabs.tabHeight>=40,layout.name+' tab is too small for touch: '+JSON.stringify(tabs));
    await phonePage.locator('#tabPaint').tap();
    await phonePage.waitForFunction(()=>document.querySelector('#panePaint').classList.contains('active'));
    const geometry=await phonePage.evaluate(()=> {
      const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();return{width:r.width,height:r.height,left:r.left,top:r.top};};
      return {
        direction:getComputedStyle(document.querySelector('#paintWorkarea')).flexDirection,
        work:rect('#paintWorkarea'),
        layers:rect('#paintLayersPanel'),
        viewport:rect('#paintViewport'),
        toolbarToggle:rect('#paintToolbarToggle'),
        fit:rect('#androidPaintFit'),
        layersToggle:rect('#androidPaintLayersToggle'),
        zoom:rect('#androidPaintZoomValue')
      };
    });
    assert.ok(geometry.work.width>0&&geometry.work.height>0,layout.name+' Paint workspace is not visible');
    assert.ok(geometry.toolbarToggle.height>=40,layout.name+' Paint toolbar toggle is too small');
    assert.ok(geometry.fit.height>=40,layout.name+' Paint Fit control is too small');
    assert.ok(geometry.layersToggle.height>=40,layout.name+' Paint layers control is too small');
    assert.ok(geometry.zoom.height>=18,layout.name+' Paint zoom percentage is too small');
    assert.ok(geometry.viewport.width>=geometry.work.width*.94,layout.name+' Paint viewport must preserve almost the entire width');
    const mobileDrawer=phonePage.locator('#androidPaintLayersToggle');
    await mobileDrawer.tap();
    assert.ok(await phonePage.locator('#paintWorkarea').evaluate(el=>el.classList.contains('android-paint-drawer-open')),layout.name+' Paint layer drawer did not open');
    assert.ok(await phonePage.locator('#paintLayersPanel').isVisible(),layout.name+' Paint layer drawer is not visible');
    await phonePage.locator('#androidPaintLayersClose').tap();
    assert.equal(await phonePage.locator('#paintWorkarea').evaluate(el=>el.classList.contains('android-paint-drawer-open')),false,layout.name+' Paint drawer did not close');
    if((layout.kind==='phone'&&layout.orientation==='landscape'&&layout.width<1000)||layout.kind==='tablet'){
      const menu=phonePage.locator('#mobileMenuBtn');
      assert.ok(await menu.isVisible(),layout.name+' navigation menu must remain reachable');
      await menu.tap();
      assert.ok(await phonePage.locator('#sidebar').evaluate(el=>el.classList.contains('open')),layout.name+' navigation drawer did not open');
      await menu.tap();
      assert.equal(await phonePage.locator('#sidebar').evaluate(el=>el.classList.contains('open')),false,layout.name+' navigation drawer did not close');
    }
    const toolbarToggle=phonePage.locator('#paintToolbarToggle');
    await toolbarToggle.tap();
    assert.ok(await phonePage.locator('#paintToolbar').evaluate(el=>el.classList.contains('paint-toolbar-collapsed')),'Paint toolbar did not collapse on touch');
    await toolbarToggle.tap();
    assert.equal(await phonePage.locator('#paintToolbar').evaluate(el=>el.classList.contains('paint-toolbar-collapsed')),false);
    const layersToggle=phonePage.locator('#androidPaintLayersToggle');
    await layersToggle.tap();
    assert.ok(await phonePage.locator('#paintWorkarea').evaluate(el=>el.classList.contains('android-paint-drawer-open')),'Paint layer drawer did not open on touch');
    await phonePage.locator('#androidPaintLayersClose').tap();
    assert.equal(await phonePage.locator('#paintWorkarea').evaluate(el=>el.classList.contains('android-paint-drawer-open')),false);
    await phonePage.locator('#paintFit').tap();
    assert.deepEqual(phoneErrors,[],layout.name+' runtime errors: '+phoneErrors.join(' | '));
    pass('Android '+layout.name+' responsive layout and Paint controls',JSON.stringify({tabs,geometry}));
    await context.close();
  }

  const desktop=await browser.newContext({
    viewport:{width:1365,height:900},
    userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
    hasTouch:false
  });
  const desktopPage=await desktop.newPage(),desktopErrors=[];
  desktopPage.on('pageerror',e=>desktopErrors.push(e.message));
  await boot(desktopPage);
  const currentDesktopSnapshot=await desktopSnapshot(desktopPage);

  // Compare the three desktop workspaces with the exact pre-update main-branch file.
  baselineDir=mkdtempSync(join(tmpdir(),'guionero-desktop-baseline-'));
  const baselinePath=join(baselineDir,'index.html');
  const baselineHtml=execFileSync('git',['show',DESKTOP_BASELINE+':index.html'],{encoding:'utf8'});
  writeFileSync(baselinePath,baselineHtml);
  const baselineContext=await browser.newContext({
    viewport:{width:1365,height:900},
    userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
    hasTouch:false
  });
  const baselinePage=await baselineContext.newPage(),baselineErrors=[];
  baselinePage.on('pageerror',e=>baselineErrors.push(e.message));
  await boot(baselinePage,pathToFileURL(baselinePath).href);
  const baselineDesktopSnapshot=await desktopSnapshot(baselinePage);
  assert.deepEqual(currentDesktopSnapshot,baselineDesktopSnapshot,'Desktop computed layout must match the previous main release in Script, Notes and Paint');
  assert.deepEqual(baselineErrors,[],'Baseline desktop runtime errors: '+baselineErrors.join(' | '));
  pass('Desktop visual-layout regression: identical computed geometry to baseline '+DESKTOP_BASELINE.slice(0,8));
  await baselineContext.close();

  const desktopState=await desktopPage.evaluate(()=>({
    classes:document.body.className,
    rootClasses:document.documentElement.className,
    projectToggle:!!document.querySelector('#androidProjectManagementToggle'),
    nodeToggle:!!document.querySelector('#noteToolbarToggle'),
    paintTools:!!document.querySelector('#androidPaintTools'),
    paintControls:!!document.querySelector('#androidPaintControls'),
    scriptFocus:!!document.querySelector('#androidScriptFocusToggle'),
    width:document.documentElement.clientWidth,
    scrollWidth:document.documentElement.scrollWidth
  }));
  assert.doesNotMatch(desktopState.classes,/android-device/);
  assert.doesNotMatch(desktopState.rootClasses,/android-touch-capable/);
  for(const key of ['projectToggle','nodeToggle','paintTools','paintControls','scriptFocus'])assert.equal(desktopState[key],false,'Desktop must not contain Android control: '+key);
  assert.ok(desktopState.scrollWidth<=desktopState.width+2,'Desktop page has horizontal overflow');
  await desktopPage.locator('#tabPaint').click();
  const paintTransformBefore=await desktopPage.locator('#paintWorld').evaluate(el=>el.style.transform);
  await desktopPage.locator('#paintZoomIn').click();
  assert.notEqual(await desktopPage.locator('#paintWorld').evaluate(el=>el.style.transform),paintTransformBefore,'Desktop mouse zoom must still work');
  await desktopPage.locator('#paintToolbarToggle').click();
  assert.ok(await desktopPage.locator('#paintToolbar').evaluate(el=>el.classList.contains('paint-toolbar-collapsed')));
  await desktopPage.locator('#paintToolbarToggle').click();
  await desktopPage.locator('#tabScript').click();
  await desktopPage.locator('#script .script-line').first().click();
  await desktopPage.keyboard.type('Desktop keyboard regression');
  assert.match((await desktopPage.locator('#script').innerText()).toLocaleUpperCase(),/DESKTOP KEYBOARD REGRESSION/);
  assert.deepEqual(desktopErrors,[],'Desktop runtime errors: '+desktopErrors.join(' | '));
  pass('Desktop controls: mouse zoom, toolbar collapse and Script keyboard input',JSON.stringify(desktopState));
  await desktop.close();

  console.log(JSON.stringify({result:'PASS',checks:report},null,2));
} catch (e) {
  console.error(JSON.stringify({result:'FAIL',checks:report,error:String(e.stack||e)},null,2));
  process.exitCode=1;
} finally {
  await browser.close();
  if(baselineDir)rmSync(baselineDir,{recursive:true,force:true});
}
