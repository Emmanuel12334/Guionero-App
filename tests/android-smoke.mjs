import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const url = pathToFileURL(resolve('index.html')).href;
const report = [];
const errors = [];
const browser = await chromium.launch({ headless: true });
function pass(name, detail = '') { report.push({name, result:'PASS', detail}); }
function assertStep(name, fn) {
  try { return fn(); } catch (e) { report.push({name, result:'FAIL', detail:String(e.message || e)}); throw e; }
}
async function boot(page,target=url) {
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
async function center(page, selector) {
  return page.locator(selector).evaluate(el => {
    const r=el.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height,left:r.left,top:r.top};
  });
}
try {
  const mobile = await browser.newContext({
    viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true,
    userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
  });
  const page = await mobile.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await boot(page);

  const shell = await page.evaluate(() => ({
    classes:document.body.className,
    androidTouchFlag:window.__guioneroAndroidTouchDevice===true,
    width:document.documentElement.clientWidth,
    scrollWidth:document.documentElement.scrollWidth,
    noteDisplay:getComputedStyle(document.querySelector('#tabNote')).display,
    paintDisplay:getComputedStyle(document.querySelector('#tabPaint')).display,
    dock:!!document.querySelector('#projectManagementDock')
  }));
  assert.match(shell.classes,/android-device/);
  assert.equal(shell.androidTouchFlag,true,'Android should activate the platform+touch capability gate');
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

  const focusButton=page.locator('#androidScriptFocusButton');
  await focusButton.waitFor({state:'visible',timeout:5000});
  await focusButton.tap();
  assert.ok(await page.locator('body').evaluate(el=>el.classList.contains('android-script-focus')));
  assert.ok(await page.locator('#androidScriptRestoreButton').isVisible());
  await page.locator('#script').evaluate(el=>{
    const line=el.querySelector('.script-line');
    el.focus({preventScroll:true});
    const range=document.createRange();
    range.selectNodeContents(line||el);range.collapse(false);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
  });
  await page.keyboard.type('Android focus editor test');
  await page.waitForTimeout(250);
  const scriptTyping=await page.evaluate(()=>{
    const root=document.querySelector('#script');
    return {text:root.innerText,editable:root.isContentEditable,active:document.activeElement?.id,lineCount:root.querySelectorAll('.script-line').length};
  });
  assert.ok(scriptTyping.text.toUpperCase().includes('ANDROID FOCUS EDITOR TEST'),'Script should accept typing in focus mode: '+JSON.stringify(scriptTyping));
  await page.keyboard.press('Control+A');
  const selectedText=await page.evaluate(()=>window.getSelection()?.toString()||'');
  assert.ok(selectedText.toUpperCase().includes('ANDROID FOCUS EDITOR TEST'),'Script should allow selecting text');
  await page.locator('#androidScriptRestoreButton').tap();
  assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('android-script-focus')),false);
  const heightBeforeKeyboard=await page.evaluate(()=>window.visualViewport?.height||window.innerHeight);
  await page.locator('#script').click();
  await page.setViewportSize({width:393,height:Math.max(430,Math.round(heightBeforeKeyboard-230))});
  await page.waitForTimeout(160);
  assert.ok(await page.locator('body').evaluate(el=>el.classList.contains('android-keyboard-visible')),'Visual viewport reduction while editing should activate keyboard-safe layout');
  await page.setViewportSize({width:393,height:852});
  await page.waitForTimeout(160);
  assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('android-keyboard-visible')),false);
  pass('Script focus mode, typing, text selection and keyboard viewport adaptation');

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
  const noteInspector=page.locator('#noteInspector');
  await noteInspector.waitFor({state:'visible',timeout:5000});
  const inspectorRect=await noteInspector.boundingBox();
  assert.ok(inspectorRect&&inspectorRect.width<=393&&inspectorRect.height<=852,'Notes inspector must fit within the Android screen');
  const noteEditor=page.locator('#inspectorContent .node-page-editor');
  await noteEditor.waitFor({state:'visible',timeout:5000});
  await noteEditor.locator('.script-line').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('Notes Android edit test');
  await page.waitForTimeout(180);
  assert.ok((await noteEditor.innerText()).includes('Notes Android edit test'),'Notes page editor should accept keyboard input');
  await page.locator('#inspectorClose').tap();
  const noteModelText=await page.evaluate(()=>{
    const s=window.GuioneroStudio.exportState();
    const p=s.pages[s.pages.length-1];
    return (p?.blocks||[]).map(b=>b.text||'').join(' ');
  });
  assert.ok(noteModelText.includes('Notes Android edit test'),'Notes edit should sync back into the Node page model');
  await page.locator('#noteAddPage').click();
  await page.locator('#inspectorClose').tap();
  // Close the floating options sheet so it no longer overlays graph connectors.
  await nodeToggle.tap();
  assert.equal(await page.locator('#noteToolbarContent').isHidden(),true);
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
  const toolsToggle=page.locator('#androidPaintToolsToggle');
  await toolsToggle.waitFor({state:'visible',timeout:5000});
  await toolsToggle.tap();
  assert.ok(await page.locator('#paintToolbar').evaluate(el=>el.classList.contains('android-paint-tools-open')));
  const sourceTool=page.locator('#paintTool');
  const toolOptions=await sourceTool.locator('option').evaluateAll(ns=>ns.map(n=>n.value));
  assert.ok(toolOptions.length>=8,'All existing Paint tools must remain available');
  const currentTool=await sourceTool.inputValue();
  const nextTool=toolOptions.find(v=>v!==currentTool);
  await sourceTool.selectOption(nextTool);
  assert.equal(await sourceTool.inputValue(),nextTool);
  const currentColor=await page.locator('#paintColor').inputValue();
  const nextColor=currentColor==='#202124'?'#db2777':'#202124';
  await page.locator('#paintColor').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},nextColor);
  assert.equal(await page.locator('#paintColor').inputValue(),nextColor);
  const sizePicker=page.locator('#paintSize');
  const currentSize=Number(await sizePicker.inputValue()),min=Number(await sizePicker.getAttribute('min')||1),max=Number(await sizePicker.getAttribute('max')||64);
  const nextSize=String(currentSize<max?currentSize+1:Math.max(min,currentSize-1));
  await sizePicker.evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},nextSize);
  assert.equal(await sizePicker.inputValue(),nextSize);
  await page.locator('#paintUndo').scrollIntoViewIfNeeded();
  assert.ok(await page.locator('#paintUndo').isVisible(),'Undo should remain reachable inside the scrollable Paint tool drawer');
  assert.ok(await page.locator('#paintRedo').isVisible(),'Redo should remain reachable inside the scrollable Paint tool drawer');
  const imageImportChoice=await page.locator('#paintImport').isVisible();
  assert.equal(imageImportChoice,true,'Paint image import must remain available on Android');
  const chooserPromise=page.waitForEvent('filechooser');
  await page.locator('#paintImport').click();
  await chooserPromise;

  await page.locator('.android-paint-sheet-head button').tap();
  assert.equal(await page.locator('#paintToolbar').evaluate(el=>el.classList.contains('android-paint-tools-open')),false);
  await page.locator('#androidPaintLayersToggle').tap();
  assert.ok(await page.locator('#paintWorkarea').evaluate(el=>el.classList.contains('android-paint-layers-open')));
  assert.ok(await page.locator('#paintLayersPanel').isVisible());
  await page.locator('.android-paint-layers-close').tap();
  assert.equal(await page.locator('#paintWorkarea').evaluate(el=>el.classList.contains('android-paint-layers-open')),false);
  await page.locator('#androidPaintObjectsToggle').tap();
  assert.ok(await page.locator('#paintLayersPanel').isVisible(),'Objects button should open the existing layer/object drawer');
  await page.locator('.android-paint-layers-close').tap();
  pass('Paint tools/layers/objects drawers, full tool list, color, size, undo and redo');

  const initialPaintTheme=await page.locator('body').getAttribute('data-theme');
  const paintExportCheck=async()=>page.evaluate(async()=>{
    const board=document.querySelector('#paintBoard'),view=getComputedStyle(board).backgroundColor;
    const state=window.GuioneroStudio.exportState(),active=state.boards.find(b=>b.id===state.activeBoard);
    const [full,layer]=await Promise.all([
      window.GuioneroStudio.composePaintBoard(),
      window.GuioneroStudio.composePaintLayer(active.activeLayerId)
    ]);
    const rgba=async(src)=>{
      const img=new Image();img.src=src;await img.decode();
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
      const x=c.getContext('2d');x.drawImage(img,0,0);
      return [...x.getImageData(0,0,1,1).data];
    };
    return {view,backgroundColor:active.backgroundColor,fullPixel:await rgba(full),layerPixel:await rgba(layer)};
  });
  const lightWhite=await paintExportCheck();
  assert.equal(lightWhite.view,'rgb(255, 255, 255)','Paint display should have a white canvas');
  assert.equal(lightWhite.backgroundColor,'#ffffff');
  assert.deepEqual(lightWhite.fullPixel,[255,255,255,255],'Full Paint export should have a white background');
  assert.equal(lightWhite.layerPixel[3],0,'Layer-only export must keep transparent pixels');
  await page.locator('#themeBtn').click();
  await page.waitForTimeout(100);
  const darkWhite=await paintExportCheck();
  assert.equal(darkWhite.view,'rgb(255, 255, 255)','Paint must stay white in dark theme');
  assert.deepEqual(darkWhite.fullPixel,[255,255,255,255]);
  assert.equal(darkWhite.layerPixel[3],0,'Dark mode must not flatten transparent layer exports');
  if(initialPaintTheme==='light')await page.locator('#themeBtn').click();
  pass('Paint canvas stays white in light/dark themes; full export is white and layer export keeps alpha');
  
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
  const panStart=await page.locator('#paintWorld').evaluate(el=>el.style.transform);
  const panZoomBefore=await page.evaluate(()=>window.GuioneroStudio.getPaintView().zoom);
  const panCenter=await center(page,'#paintViewport');
  const panA={x:panCenter.left+panCenter.width*.4,y:panCenter.top+panCenter.height*.45};
  const panB={x:panA.x+72,y:panA.y};
  await touch(paintCdp,'touchStart',[{id:24,...panA}]);
  await touch(paintCdp,'touchStart',[{id:24,...panA},{id:25,...panB}]);
  await touch(paintCdp,'touchMove',[{id:24,x:panA.x+35,y:panA.y+24},{id:25,x:panB.x+35,y:panB.y+24}]);
  await touch(paintCdp,'touchEnd',[]);
  await page.waitForTimeout(150);
  const panEnd=await page.locator('#paintWorld').evaluate(el=>el.style.transform);
  const panZoomAfter=await page.evaluate(()=>window.GuioneroStudio.getPaintView().zoom);
  assert.notEqual(panEnd,panStart,'Two-finger drag should pan the canvas');
  assert.ok(Math.abs(panZoomAfter-panZoomBefore)<.02,'Two-finger translation should not change zoom');
  assert.equal(await canvasHash(),hashBeforePinch,'Two-finger pan must not draw');
  pass('Paint two-finger drag pans without changing zoom or pixels');

  // Existing image objects must still move and resize with one finger.
  const objectId=await page.evaluate(()=>{
    const api=window.GuioneroStudio,s=api.exportState(),b=s.boards.find(x=>x.id===s.activeBoard);
    const view=api.getPaintView(),v=document.querySelector('#paintViewport');
    const cx=(v.clientWidth/2-view.pan.x)/view.zoom,cy=(v.clientHeight/2-view.pan.y)/view.zoom;
    const id='android-touch-object-test';
    b.objects=(b.objects||[]).filter(o=>o.id!==id);
    b.objects.push({
      id,kind:'image',name:'Android touch test',
      data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5f7eoAAAAASUVORK5CYII=',
      x:cx-50,y:cy-40,w:100,h:80,rotation:0,flipX:false,flipY:false,
      opacity:1,visible:true,layerId:b.activeLayerId,crop:{left:0,right:0,top:0,bottom:0}
    });
    b.view=b.view||{};b.view.selectedObjectId=id;
    b.toolState={...(b.toolState||{}),mode:'select'};
    api.importState(s,{notifyCloud:false});
    return id;
  });
  await page.waitForTimeout(180);
  const objectSelector='#paintBoard [data-paint-object-id="'+objectId+'"]';
  let objectBox=await page.locator(objectSelector).boundingBox();
  assert.ok(objectBox,'Paint imported image object should be visible');
  const objectBefore=await page.evaluate(id=>{
    const o=window.GuioneroStudio.exportState().boards.flatMap(b=>b.objects||[]).find(x=>x.id===id);
    return {x:o.x,y:o.y,w:o.w,h:o.h};
  },objectId);
  const movePoint={x:objectBox.x+objectBox.width/2,y:objectBox.y+objectBox.height/2};
  await touch(paintCdp,'touchStart',[{id:51,...movePoint}]);
  await touch(paintCdp,'touchMove',[{id:51,x:movePoint.x+35,y:movePoint.y+22}]);
  await touch(paintCdp,'touchEnd',[]);
  await page.waitForTimeout(160);
  const objectMoved=await page.evaluate(id=>{
    const o=window.GuioneroStudio.exportState().boards.flatMap(b=>b.objects||[]).find(x=>x.id===id);
    return {x:o.x,y:o.y,w:o.w,h:o.h};
  },objectId);
  assert.ok(objectMoved.x>objectBefore.x+10&&objectMoved.y>objectBefore.y+5,'One-finger drag should move the selected object');

  // Drag the southeast transform handle to resize the image with one finger.
  const resizeBox=await page.locator(objectSelector+' .paint-transform-handle.se').boundingBox();
  assert.ok(resizeBox,'Selected Paint object should expose resize handles');
  await touch(paintCdp,'touchStart',[{id:52,x:resizeBox.x+resizeBox.width/2,y:resizeBox.y+resizeBox.height/2}]);
  await touch(paintCdp,'touchMove',[{id:52,x:resizeBox.x+resizeBox.width/2+30,y:resizeBox.y+resizeBox.height/2+25}]);
  await touch(paintCdp,'touchEnd',[]);
  await page.waitForTimeout(160);
  const objectResized=await page.evaluate(id=>{
    const o=window.GuioneroStudio.exportState().boards.flatMap(b=>b.objects||[]).find(x=>x.id===id);
    return {x:o.x,y:o.y,w:o.w,h:o.h};
  },objectId);
  assert.ok(objectResized.w>objectMoved.w&&objectResized.h>objectMoved.h,'One-finger handle drag should resize the selected object');

  // A second finger cancels an in-progress object gesture before the camera takes over.
  const beforePinchObject={...objectResized};
  objectBox=await page.locator(objectSelector).boundingBox();
  const objectTouch={x:objectBox.x+objectBox.width/2,y:objectBox.y+objectBox.height/2};
  const viewportBox=await page.locator('#paintViewport').boundingBox();
  // Place finger two on an empty canvas corner, above the floating dock (not on UI).
  const secondTouch={x:viewportBox.x+viewportBox.width-22,y:viewportBox.y+22};
  const objectHashBefore=await canvasHash();
  await touch(paintCdp,'touchStart',[{id:53,...objectTouch}]);
  await touch(paintCdp,'touchMove',[{id:53,x:objectTouch.x+18,y:objectTouch.y+10}]);
  await touch(paintCdp,'touchStart',[{id:53,x:objectTouch.x+18,y:objectTouch.y+10},{id:54,...secondTouch}]);
  await touch(paintCdp,'touchMove',[{id:53,x:objectTouch.x-10,y:objectTouch.y+25},{id:54,x:secondTouch.x+45,y:secondTouch.y+25}]);
  await touch(paintCdp,'touchEnd',[]);
  await page.waitForTimeout(160);
  const afterPinchObject=await page.evaluate(id=>{
    const o=window.GuioneroStudio.exportState().boards.flatMap(b=>b.objects||[]).find(x=>x.id===id);
    return {x:o.x,y:o.y,w:o.w,h:o.h};
  },objectId);
  assert.deepEqual(afterPinchObject,beforePinchObject,'Two-finger navigation must cancel object movement/resizing');
  assert.equal(await canvasHash(),objectHashBefore,'Pinch takeover must not add accidental paint strokes');

  // Return to drawing mode through the original Paint tool selector.
  await page.locator('#androidPaintToolsToggle').tap();
  await page.locator('#paintMode').selectOption('draw');
  await page.locator('.android-paint-sheet-head button').tap();
  pass('Paint one-finger object move/resize and safe two-finger gesture takeover');

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
  await page.locator('#androidPaintToolsToggle').tap();
  await page.locator('#androidPaintUndoQuick').tap();
  await page.locator('.android-paint-sheet-head > button[aria-label="Cerrar herramientas"]').tap();
  await page.waitForTimeout(350);
  const hashAfterUndo=await canvasHash();
  assert.equal(hashAfterUndo,hashAfterPinch,'Undo should restore the previous drawing state');
  await page.locator('#androidPaintToolsToggle').tap();
  await page.locator('#androidPaintRedoQuick').tap();
  await page.locator('.android-paint-sheet-head > button[aria-label="Cerrar herramientas"]').tap();
  await page.waitForTimeout(350);
  const hashAfterRedo=await canvasHash();
  assert.equal(hashAfterRedo,hashAfterDraw,'Redo should restore the drawn state');
  const transformAfterDraw=await page.locator('#paintWorld').evaluate(el=>el.style.transform);
  assert.equal(transformAfterDraw,paintAfterPinch,'One-finger drawing should not move the canvas');
  pass('Paint pinch does not draw; one-finger draw, undo and redo work',paintBefore+' -> '+paintAfterPinch+'; canvas '+hashBeforePinch+' -> '+hashAfterPinch+' -> '+hashAfterDraw+' -> undo '+hashAfterUndo+' -> redo '+hashAfterRedo);
  const zoomBefore=await page.evaluate(()=>window.GuioneroStudio.getPaintView().zoom);
  await page.locator('#androidPaintZoomIn').tap();
  await page.waitForFunction(()=>document.querySelector('#androidPaintZoomReadout').textContent!=='38%');
  const zoomLabel=await page.locator('#androidPaintZoomReadout').innerText();
  assert.match(zoomLabel,/^\d+%$/);
  await page.locator('#androidPaintToolsToggle').tap();
  await page.locator('#paintFit').tap();
  await page.locator('.android-paint-sheet-head button').tap();
  await page.waitForTimeout(100);
  const fitZoom=await page.evaluate(()=>window.GuioneroStudio.getPaintView().zoom);
  assert.ok(fitZoom>0&&fitZoom<=2,'Fit should calculate a valid zoom');
  await page.locator('#androidPaintReset').tap();
  await page.waitForTimeout(100);
  assert.ok(Math.abs((await page.evaluate(()=>window.GuioneroStudio.getPaintView().zoom))-1)<.001,'Reset should return to 100%');
  pass('Paint zoom readout, zoom in, Fit and 100% reset',Math.round(zoomBefore*100)+'% -> '+zoomLabel+' -> Fit '+Math.round(fitZoom*100)+'% -> 100%');

  assert.deepEqual(errors,[],'Runtime errors: '+errors.join(' | '));
  pass('Android runtime: no uncaught JavaScript errors');
  await mobile.close();


  // Broader phone layout matrix: compact/large portrait and a phone held horizontally.
  const phoneLayouts = [
    {name:'compact portrait',width:360,height:740,orientation:'portrait',form:'phone'},
    {name:'large portrait',width:412,height:915,orientation:'portrait',form:'phone'},
    {name:'landscape phone',width:915,height:412,orientation:'landscape',form:'phone'},
    {name:'tablet portrait',width:800,height:1280,orientation:'portrait',form:'tablet'},
    {name:'tablet landscape',width:1280,height:800,orientation:'landscape',form:'tablet'}
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
      formFactor:document.documentElement.dataset.androidFormFactor,
      androidStylesheet:!!document.querySelector('#guionero-android-complete-style') && !!document.querySelector('#guionero-android-complete-style').sheet,
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
    assert.equal(tabs.formFactor,layout.form,layout.name+' should be identified as '+layout.form);
    assert.notEqual(tabs.note,'none',layout.name+' must expose Node');
    assert.notEqual(tabs.paint,'none',layout.name+' must expose Paint');
    assert.ok(tabs.scrollWidth<=tabs.width+2,layout.name+' has horizontal page overflow');
    assert.ok(tabs.tabHeight>=40,layout.name+' tab is too small for touch: '+JSON.stringify(tabs));
    await phonePage.locator('#tabPaint').tap();
    await phonePage.waitForFunction(()=>document.querySelector('#panePaint').classList.contains('active'));
    const geometry=await phonePage.evaluate(()=> {
      const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();return{width:r.width,height:r.height};};
      return {
        work:rect('#paintWorkarea'),viewport:rect('#paintViewport'),
        dock:rect('#androidPaintDock'),
        tools:rect('#androidPaintToolsToggle'),
        layers:rect('#androidPaintLayersToggle'),
        background:getComputedStyle(document.querySelector('#paintBoard')).backgroundColor
      };
    });
    assert.ok(geometry.work.width>0&&geometry.work.height>0,layout.name+' Paint workspace must be visible');
    assert.ok(geometry.tools.height>=40&&geometry.layers.height>=40,layout.name+' Paint dock controls should be touch sized');
    assert.ok(geometry.viewport.width>=geometry.work.width*.98,layout.name+' Paint viewport should use full width');
    assert.ok(geometry.viewport.height>=geometry.work.height*.98,layout.name+' Paint viewport should use full height');
    assert.equal(geometry.background,'rgb(255, 255, 255)',layout.name+' Paint background must be white');
    assert.equal(await phonePage.locator('#paintLayersPanel').isVisible(),false,'Layers should remain hidden until requested');
    await phonePage.locator('#androidPaintToolsToggle').tap();
    assert.ok(await phonePage.locator('#paintToolbar').evaluate(el=>el.classList.contains('android-paint-tools-open')));
    assert.ok(await phonePage.locator('#paintFit').isVisible());
    await phonePage.locator('.android-paint-sheet-head button').tap();
    await phonePage.locator('#androidPaintLayersToggle').tap();
    assert.ok(await phonePage.locator('#paintWorkarea').evaluate(el=>el.classList.contains('android-paint-layers-open')));
    assert.ok(await phonePage.locator('#paintLayersPanel').isVisible());
    await phonePage.locator('.android-paint-layers-close').tap();
    assert.equal(await phonePage.locator('#paintWorkarea').evaluate(el=>el.classList.contains('android-paint-layers-open')),false);
    if(layout.orientation==='landscape'){
      const menu=phonePage.locator('#mobileMenuBtn');
      assert.ok(await menu.isVisible(),'Android menu should remain reachable in landscape');
      await menu.tap();
      assert.ok(await phonePage.locator('#sidebar').evaluate(el=>el.classList.contains('open')),'Android navigation drawer should open');
      await menu.tap();
      assert.equal(await phonePage.locator('#sidebar').evaluate(el=>el.classList.contains('open')),false);
    }
    await phonePage.locator('#androidPaintToolsToggle').tap();
    await phonePage.locator('#paintFit').tap();
    await phonePage.locator('.android-paint-sheet-head button').tap();
    assert.deepEqual(phoneErrors,[],layout.name+' runtime errors: '+phoneErrors.join(' | '));
    pass('Android '+layout.name+' full-canvas layout and Paint drawers',JSON.stringify({tabs,geometry}));
    await context.close();
  }

  const baselinePath=process.env.GUIONERO_DESKTOP_BASELINE;
  assert.ok(baselinePath,'Desktop comparison needs the pre-update main index.html baseline');
  const desktopOptions={
    viewport:{width:1365,height:900},
    userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
    hasTouch:false
  };
  const selectors=['.app','.sidebar','.main','.topbar','#mainTitle','.studio-tabs','#paneScript','#workspace','#scriptProjectToolbar','#scriptFormatToolbar','#paper','#script','#paneNote','.note-toolbar','.note-layout','#noteCanvasWrap','#noteInspector','#panePaint','#paintToolbar','#paintWorkarea','#paintLayersPanel','#paintViewport','#paintBoard','#paintCanvas'];
  const geometrySnapshot=page=>page.evaluate(list=>list.map(sel=>{
    const el=document.querySelector(sel);
    if(!el)return{sel,missing:true};
    const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    return{sel,rect:[r.x,r.y,r.width,r.height],display:s.display,position:s.position,flexDirection:s.flexDirection,overflow:s.overflow,background:s.backgroundColor,color:s.color};
  }),selectors);
  const baselineContext=await browser.newContext(desktopOptions);
  const baselinePage=await baselineContext.newPage(),baselineErrors=[];
  baselinePage.on('pageerror',e=>baselineErrors.push(e.message));
  await boot(baselinePage,pathToFileURL(resolve(baselinePath)).href);
  const baselineGeometry=await geometrySnapshot(baselinePage);
  assert.deepEqual(baselineErrors,[],'Pre-update desktop baseline runtime errors: '+baselineErrors.join(' | '));
  await baselinePage.locator('#tabPaint').click();
  await baselinePage.waitForFunction(()=>document.querySelector('#panePaint').classList.contains('active'));
  await baselinePage.locator('#paintZoomIn').click();
  const baselinePaintTransform=await baselinePage.locator('#paintWorld').evaluate(el=>el.style.transform);
  await baselinePage.locator('#tabNote').click();
  await baselinePage.waitForFunction(()=>document.querySelector('#paneNote').classList.contains('active'));
  await baselinePage.locator('#noteZoomIn').click();
  const baselineNoteTransform=await baselinePage.locator('#noteWorld').evaluate(el=>el.style.transform);
  await baselineContext.close();

  const desktop=await browser.newContext(desktopOptions);
  const desktopPage=await desktop.newPage(),desktopErrors=[];
  desktopPage.on('pageerror',e=>desktopErrors.push(e.message));
  await boot(desktopPage);
  const desktopState=await desktopPage.evaluate(()=>({
    classes:document.body.className,
    projectToggle:!!document.querySelector('#androidProjectManagementToggle'),
    nodeToggle:!!document.querySelector('#noteToolbarToggle'),
    paintTools:!!document.querySelector('#androidPaintTools'),
    paintDock:!!document.querySelector('#androidPaintDock'),
    width:document.documentElement.clientWidth,
    scrollWidth:document.documentElement.scrollWidth
  }));
  assert.doesNotMatch(desktopState.classes,/android-device/);
  assert.equal(desktopState.projectToggle,false);
  assert.equal(desktopState.nodeToggle,false);
  assert.equal(desktopState.paintTools,false);
  assert.equal(desktopState.paintDock,false);
  assert.ok(desktopState.scrollWidth<=desktopState.width+2,'Desktop page has horizontal overflow');
  assert.deepEqual(await geometrySnapshot(desktopPage),baselineGeometry,'Desktop geometry/computed styles differ from the pre-update main baseline');
  assert.deepEqual(desktopErrors,[],'Desktop runtime errors: '+desktopErrors.join(' | '));
  await desktopPage.locator('#tabPaint').click();
  await desktopPage.waitForFunction(()=>document.querySelector('#panePaint').classList.contains('active'));
  await desktopPage.locator('#paintZoomIn').click();
  const updatedPaintTransform=await desktopPage.locator('#paintWorld').evaluate(el=>el.style.transform);
  assert.equal(updatedPaintTransform,baselinePaintTransform,'Desktop Paint mouse zoom changed');
  await desktopPage.locator('#tabNote').click();
  await desktopPage.waitForFunction(()=>document.querySelector('#paneNote').classList.contains('active'));
  await desktopPage.locator('#noteZoomIn').click();
  const updatedNoteTransform=await desktopPage.locator('#noteWorld').evaluate(el=>el.style.transform);
  assert.equal(updatedNoteTransform,baselineNoteTransform,'Desktop Node mouse zoom changed');
  pass('Desktop baseline regression: interface metrics and Paint/Node mouse zoom unchanged',JSON.stringify(desktopState));
  await desktop.close();

  const windowsTouch=await browser.newContext({
    viewport:{width:1280,height:800},isMobile:true,hasTouch:true,
    userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'
  });
  const windowsTouchPage=await windowsTouch.newPage();
  await boot(windowsTouchPage);
  const windowsTouchState=await windowsTouchPage.evaluate(()=>({
    flag:window.__guioneroAndroidTouchDevice===true,
    androidClass:document.body.classList.contains('android-device'),
    androidDock:!!document.querySelector('#androidPaintDock')
  }));
  assert.deepEqual(windowsTouchState,{flag:false,androidClass:false,androidDock:false},'A non-Android touchscreen must not receive the Android workspace');
  pass('Capability gate does not mistake a Windows touchscreen for Android');
  await windowsTouch.close();

  console.log(JSON.stringify({result:'PASS',checks:report},null,2));
} catch (e) {
  console.error(JSON.stringify({result:'FAIL',checks:report,error:String(e.stack||e)},null,2));
  process.exitCode=1;
} finally {
  await browser.close();
}
