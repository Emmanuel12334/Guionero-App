import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:980}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
  window.__guioneroSavedEvents=[];
  window.addEventListener('guionero-project-saved',e=>window.__guioneroSavedEvents.push(e.detail||{}));
});
try {
  await page.goto(pathToFileURL(resolve('index.html')).href,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#script .script-line',{timeout:15000});
  await page.waitForFunction(()=>!!window.GuioneroStudio&&!!document.querySelector('#saveProjectBtn'),null,{timeout:15000});
  await page.waitForTimeout(700);

  const visibleText=await page.locator('body').innerText();
  for(const label of ['Borrador','Formato de guion','Enter para avanzar','Enter en el vacío abre opciones','Flechas para elegir','Los encabezados y personajes se organizan solos','Guardado en biblioteca']) {
    assert.equal(visibleText.includes(label),false,'UI copy should not be visible: '+label);
  }
  assert.equal(await page.locator('#saveIndicatorText').innerText(),'Guardado');
  assert.equal(await page.locator('#saveProjectBtn').isVisible(),true);
  assert.equal(await page.locator('.editor-help').count(),0);
  console.log('PASS: Script UI cleanup and visible real save indicator');

  async function activeLine(){
    const active=page.locator('#script .script-line[data-active="true"]');
    return await active.count()?active.last():page.locator('#script .script-line').last();
  }
  async function chooseType(type){
    const line=await activeLine();
    await line.click();
    await page.keyboard.press('Tab');
    await page.locator('#picker [data-pick="'+type+'"]').waitFor({state:'visible',timeout:3000});
    await page.locator('#picker [data-pick="'+type+'"]').click();
    await page.waitForTimeout(30);
    return activeLine();
  }
  async function enterNext(){
    const line=await activeLine();
    await line.press('Enter');
    await page.waitForTimeout(35);
    return activeLine();
  }
  async function fillActive(value){
    const line=await activeLine();
    await line.fill(value);
    return line;
  }
  async function saveProject(){
    await page.locator('#saveProjectBtn').click();
    await page.waitForFunction(()=>document.querySelector('#saveIndicatorText')?.textContent==='Guardado',null,{timeout:8000});
  }

  await chooseType('SCENE');
  await fillActive('EXT. PARQUE - TARDE');
  await enterNext();
  await chooseType('SCENE');
  await fillActive('INT. CASA - NOCHE');
  assert.equal(await page.locator('#saveIndicatorText').innerText(),'No guardado');
  await saveProject();
  let history=await page.evaluate(()=>{
    const safe=window.__guioneroSafeStorage,id=safe.getItem('guionero_active_project_id');
    const key='guionero_manual_history_v1_'+encodeURIComponent(id);
    return JSON.parse(safe.getItem(key)||'{}');
  });
  assert.deepEqual(history.scenes,['EXT. PARQUE - TARDE','INT. CASA - NOCHE']);
  console.log('PASS: scene history stored only after project save');

  await enterNext();
  await chooseType('SCENE');
  await page.waitForSelector('#picker .history-option',{timeout:3000});
  assert.equal(await page.locator('#picker .history-option').count(),2);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  assert.equal((await activeLine()).innerText(),'EXT. PARQUE - TARDE');
  console.log('PASS: scene suggestions navigate with arrows and select with Enter');

  await enterNext();
  await chooseType('SCENE');
  await page.waitForSelector('#picker .history-option');
  await fillActive('EXT. CALLE NUEVA - DÍA');
  assert.equal(await page.locator('#picker').evaluate(el=>el.classList.contains('visible')),false);
  assert.equal((await activeLine()).innerText(),'EXT. CALLE NUEVA - DÍA');
  console.log('PASS: typing a new scene closes suggestions without replacing text');

  await enterNext();
  await chooseType('CHARACTER');
  await fillActive('JULIO');
  await saveProject();
  history=await page.evaluate(()=>{
    const safe=window.__guioneroSafeStorage,id=safe.getItem('guionero_active_project_id');
    return JSON.parse(safe.getItem('guionero_manual_history_v1_'+encodeURIComponent(id))||'{}');
  });
  assert.deepEqual(history.characters,['JULIO']);
  await enterNext();
  assert.equal((await activeLine()).getAttribute('data-type'),'ACTION','Enter after a character must not choose Dialogue or Parenthetical');
  await chooseType('PARENTHETICAL');
  await fillActive('Está feliz, pero tembloroso');
  await enterNext();
  const parenthetical=page.locator('#script .script-line[data-type="PARENTHETICAL"]').last();
  assert.equal((await parenthetical.innerText()).trim(),'(Está feliz, pero tembloroso)');
  assert.equal((await activeLine()).getAttribute('data-type'),'ACTION','Enter after Parenthetical must not choose Dialogue');
  await saveProject();
  console.log('PASS: character history, manual Parenthetical and neutral Enter behavior');

  await enterNext();
  await chooseType('CHARACTER');
  await page.waitForSelector('#picker .history-option');
  assert.equal(await page.locator('#picker .history-option').count(),1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#picker').evaluate(el=>el.classList.contains('visible')),false);
  console.log('PASS: character suggestions dismiss with Escape');

  const savedEventsBefore=await page.evaluate(()=>window.__guioneroSavedEvents.length);
  await fillActive('AUTOGUARDADO VERIFICADO');
  assert.equal(await page.locator('#saveIndicatorText').innerText(),'No guardado');
  await page.evaluate(()=>{
    const original=window.setTimeout;
    window.setTimeout=function(callback,delay,...args){const adjusted=Number(delay)>=600000?45:delay;return original.call(this,callback,adjusted,...args);};
  });
  await page.waitForFunction(n=>window.__guioneroSavedEvents.length>n,savedEventsBefore,{timeout:8000});
  assert.equal(await page.locator('#saveIndicatorText').innerText(),'Guardado');
  console.log('PASS: 20-minute autosave path invoked and indicator returned to Guardado');

  await page.locator('#tabNote').click();
  await page.waitForFunction(()=>document.querySelector('#paneNote').classList.contains('active'));
  for(let i=0;i<3;i++){
    await page.locator('#noteAddPage').click();
    await page.locator('#inspectorClose').click();
  }
  const ids=await page.evaluate(()=>{
    const state=window.GuioneroStudio.exportState();
    const ids=state.pages.slice(-3).map(p=>p.id);
    const [a,b,c]=ids;
    state.connections=state.connections.filter(edge=>![a,b,c].includes(edge.fromNode)&&![a,b,c].includes(edge.toNode));
    state.connections.push({id:'regression-edge-a-b',type:'write',fromNode:a,fromPort:'write-out',toNode:b,toPort:'write-in'});
    state.positions=state.positions||{};
    state.positions[a]={x:40,y:150};state.positions[b]={x:700,y:150};state.positions[c]={x:400,y:450};
    state.camera={zoom:1,pan:{x:0,y:0}};
    window.GuioneroStudio.importState(state,{notifyCloud:false});
    return {a,b,c};
  });
  await page.waitForTimeout(200);
  const head=page.locator('.note-node[data-node-id="'+ids.c+'"] .note-node-head');
  const start=await head.boundingBox();
  assert.ok(start,'New page node should be rendered');
  const target=await page.evaluate(({worldX,worldY})=>{
    const wrap=document.getElementById('noteCanvasWrap'),world=document.getElementById('noteWorld'),r=wrap.getBoundingClientRect(),m=new DOMMatrixReadOnly(getComputedStyle(world).transform);
    return {x:r.left+m.e+worldX*m.a,y:r.top+m.f+worldY*m.d};
  },{worldX:(40+250+700)/2,worldY:150+47});
  await page.mouse.move(start.x+start.width/2,start.y+start.height/2);
  await page.mouse.down();
  await page.mouse.move(target.x,target.y,{steps:14});
  await page.mouse.up();
  await page.waitForTimeout(180);
  const edgeState=await page.evaluate(ids=>{
    const state=window.GuioneroStudio.exportState();
    return state.connections.filter(c=>c.type==='write'&&[ids.a,ids.b,ids.c].includes(c.fromNode)&&[ids.a,ids.b,ids.c].includes(c.toNode)).map(c=>[c.fromNode,c.toNode]);
  },ids);
  assert.ok(edgeState.some(([from,to])=>from===ids.a&&to===ids.c),'A -> C edge was not created');
  assert.ok(edgeState.some(([from,to])=>from===ids.c&&to===ids.b),'C -> B edge was not created');
  assert.equal(edgeState.some(([from,to])=>from===ids.a&&to===ids.b),false,'Original A -> B edge should be removed');
  console.log('PASS: Notes page inserted into a connection while retaining direction');

  await page.locator('#tabPaint').click();
  await page.waitForFunction(()=>document.querySelector('#panePaint').classList.contains('active'));
  assert.equal(await page.locator('#paintImport').innerText(),'IMPORTAR IMAGEN');
  assert.equal(await page.locator('#paintExport').innerText(),'EXPORTAR IMAGEN');
  await page.locator('#paintTextBtn').click();
  const canvas=page.locator('#paintCanvas');
  const box=await canvas.boundingBox();
  await page.mouse.click(box.x+box.width*.45,box.y+box.height*.35);
  const textObject=page.locator('.paint-text-content[contenteditable="true"]').last();
  await textObject.waitFor({state:'visible',timeout:3000});
  await textObject.fill('GUIONERO PNG EXPORT');
  const imageData=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=8;c.height=8;
    const x=c.getContext('2d');x.fillStyle='#d22';x.fillRect(0,0,8,8);
    return c.toDataURL('image/png').split(',')[1];
  });
  const imageChooserPromise=page.waitForEvent('filechooser');
  await page.locator('#paintImport').click();
  const imageChooser=await imageChooserPromise;
  await imageChooser.setFiles({name:'regression-red-square.png',mimeType:'image/png',buffer:Buffer.from(imageData,'base64')});
  await page.waitForFunction(()=>{
    const s=window.GuioneroStudio.exportState(),b=s.boards.find(x=>x.id===s.activeBoard);
    return b.objects.some(o=>o.kind!=='text'&&o.data);
  },null,{timeout:5000});
  let state=await page.evaluate(()=>window.GuioneroStudio.exportState());
  const activeBoard=state.boards.find(b=>b.id===state.activeBoard);
  assert.ok(activeBoard.objects.some(o=>o.kind==='text'&&o.text.includes('GUIONERO PNG EXPORT')),'Paint text should persist in the board model');
  assert.ok(activeBoard.objects.some(o=>o.kind!=='text'&&o.data),'Imported image should persist in the board model');
  const canvasSize={width:activeBoard.width,height:activeBoard.height};
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.locator('#paintExport').click()
  ]);
  assert.match(download.suggestedFilename(),/\.png$/i);
  const filePath=await download.path();
  const png=await readFile(filePath);
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a','Export must be a PNG, not a UI screenshot file');
  assert.ok(png.length>500,'PNG export should contain actual canvas artwork');
  assert.equal(png.readUInt32BE(16),canvasSize.width,'PNG width should match the artwork canvas, not the app viewport');
  assert.equal(png.readUInt32BE(20),canvasSize.height,'PNG height should match the artwork canvas, not the app viewport');
  console.log('PASS: Paint text, image import, and canvas-only PNG export');

  await page.locator('#saveProjectBtn').click();
  await page.waitForFunction(()=>document.querySelector('#saveIndicatorText')?.textContent==='Guardado');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.GuioneroStudio&&!!document.querySelector('#tabPaint'),null,{timeout:15000});
  await page.waitForTimeout(800);
  await page.locator('#tabPaint').click();
  await page.waitForFunction(()=>document.querySelector('#panePaint').classList.contains('active'));
  state=await page.evaluate(()=>window.GuioneroStudio.exportState());
  const restored=state.boards.find(b=>b.id===state.activeBoard);
  assert.ok(restored.objects.some(o=>o.kind==='text'&&o.text.includes('GUIONERO PNG EXPORT')),'Paint text object should survive project save/reload');
  console.log('PASS: Paint text persists after project reload');

  assert.deepEqual(errors,[],'Browser page errors: '+errors.join(' | '));
  console.log('PASS: no uncaught browser page errors');
} finally {
  await browser.close();
}
