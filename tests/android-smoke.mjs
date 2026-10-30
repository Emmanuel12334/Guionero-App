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
async function boot(page) {
  await page.goto(url, {waitUntil:'domcontentloaded'});
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
  pass('Paint accordion, brush, color, brush size, undo and redo');

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
  await page.locator('#androidPaintUndo').click();
  await page.waitForTimeout(350);
  const hashAfterUndo=await canvasHash();
  assert.equal(hashAfterUndo,hashAfterPinch,'Undo should restore the previous drawing state');
  await page.locator('#androidPaintRedo').click();
  await page.waitForTimeout(350);
  const hashAfterRedo=await canvasHash();
  assert.equal(hashAfterRedo,hashAfterDraw,'Redo should restore the drawn state');
  const transformAfterDraw=await page.locator('#paintWorld').evaluate(el=>el.style.transform);
  assert.equal(transformAfterDraw,paintAfterPinch,'One-finger drawing should not move the canvas');
  pass('Paint pinch does not draw; one-finger draw, undo and redo work',paintBefore+' -> '+paintAfterPinch+'; canvas '+hashBeforePinch+' -> '+hashAfterPinch+' -> '+hashAfterDraw+' -> undo '+hashAfterUndo+' -> redo '+hashAfterRedo);

  assert.deepEqual(errors,[],'Runtime errors: '+errors.join(' | '));
  pass('Android runtime: no uncaught JavaScript errors');
  await mobile.close();

  const desktop=await browser.newContext({
    viewport:{width:1365,height:900},
    userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
    hasTouch:false
  });
  const desktopPage=await desktop.newPage(),desktopErrors=[];
  desktopPage.on('pageerror',e=>desktopErrors.push(e.message));
  await boot(desktopPage);
  const desktopState=await desktopPage.evaluate(()=>({
    classes:document.body.className,
    projectToggle:!!document.querySelector('#androidProjectManagementToggle'),
    nodeToggle:!!document.querySelector('#noteToolbarToggle'),
    paintTools:!!document.querySelector('#androidPaintTools'),
    width:document.documentElement.clientWidth,
    scrollWidth:document.documentElement.scrollWidth
  }));
  assert.doesNotMatch(desktopState.classes,/android-device/);
  assert.equal(desktopState.projectToggle,false);
  assert.equal(desktopState.nodeToggle,false);
  assert.equal(desktopState.paintTools,false);
  assert.ok(desktopState.scrollWidth<=desktopState.width+2,'Desktop page has horizontal overflow');
  assert.deepEqual(desktopErrors,[],'Desktop runtime errors: '+desktopErrors.join(' | '));
  pass('Desktop regression guard: no Android-only controls or runtime errors',JSON.stringify(desktopState));
  await desktop.close();

  console.log(JSON.stringify({result:'PASS',checks:report},null,2));
} catch (e) {
  console.error(JSON.stringify({result:'FAIL',checks:report,error:String(e.stack||e)},null,2));
  process.exitCode=1;
} finally {
  await browser.close();
}
