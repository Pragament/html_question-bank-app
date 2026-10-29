// Runs against local pages with Firebase mocked. Real editor libraries load from CDNs.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs');
const base=process.env.PAPER_TEST_URL || 'http://localhost:8000';
const output=process.env.PAPER_TEST_OUTPUT || '/private/tmp';
const firestoreMock=`
const taxonomy={c:{type:'class',label:'IX',parentId:''},s:{type:'subject',label:'Mathematics',parentId:'c'},h:{type:'chapter',label:'Algebra',parentId:'s'},t:{type:'topic',label:'Equations',parentId:'h'}};
export const getFirestore=()=>({});export const collection=(_,name)=>({collection:name});let n=0;export const doc=(db,name,id)=>db.collection?{collection:db.collection,id:'auto-'+(++n)}:{collection:name,id};
export const query=(ref,...constraints)=>({...ref,constraints});export const where=(...a)=>({a});export const and=(...a)=>({a});export const or=(...a)=>({a});export const limit=()=>({});export const orderBy=()=>({});export const documentId=()=>'';export const startAfter=()=>({});export const arrayUnion=(...a)=>a;export const deleteField=()=>null;
const snapshot=ref=>({docs:ref.collection==='qb_taxonomy_v1'?Object.entries(taxonomy).map(([id,data])=>({id,data:()=>data})):[],forEach(){}});
export const getDocs=async ref=>snapshot(ref);export const onSnapshot=(ref,cb)=>{setTimeout(()=>cb(snapshot(ref)),0);return()=>{};};
export const serverTimestamp=()=>1;export const getDoc=async()=>({exists:()=>false});export const setDoc=async()=>{};export const updateDoc=async()=>{};
export const addDoc=async(ref,data)=>{(globalThis.__saved ||= []).push({ref,data});return{id:'created'};};
export const writeBatch=()=>({set(){},update(){},commit:async()=>{}});
`;
(async()=>{
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:950}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>localStorage.setItem('qb_hide_onboarding_prompt_v1','true'));
 await page.route('https://www.gstatic.com/firebasejs/**',async route=>{
  const url=route.request().url();const body=url.includes('firebase-app')?'export const initializeApp=()=>({});':url.includes('firebase-auth')?`export const getAuth=()=>({});export class GoogleAuthProvider{};export const onAuthStateChanged=(a,cb)=>setTimeout(()=>cb({uid:'me',displayName:'Teacher'}),10);export const signInWithPopup=async()=>{};export const signOut=async()=>{};`:firestoreMock;
  await route.fulfill({contentType:'application/javascript',body});
 });
 await page.goto(base+'/question-paper.html');
 await page.selectOption('#paperClass','c');await page.selectOption('#paperSubject','s');await page.click('#bulkAdd');
 const question=page.locator('[data-field="promptHtml"]').first(),option=page.locator('[data-option-text="0"]').first();
 await question.fill('beforeafter');
 await question.evaluate(async element=>{
  element.focus();const range=document.createRange();range.setStart(element.firstChild,6);range.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
  const canvas=document.createElement('canvas');canvas.width=80;canvas.height=40;const ctx=canvas.getContext('2d');ctx.fillStyle='#1769aa';ctx.fillRect(0,0,80,40);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve));const data=new DataTransfer();data.items.add(new File([blob],'clipboard.png',{type:'image/png'}));
  element.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
  document.querySelector('[data-option-text="0"]').focus();
 });
 await question.locator('img').waitFor();
 assert.equal(await option.locator('img').count(),0,'Asynchronous paste must use the original field');
 assert.deepEqual(await question.evaluate(el=>[el.firstChild.textContent,el.querySelector('img').nextSibling.textContent]),['before','after']);
 const libraryOption=page.locator('[data-option-text="1"]').first();
 await libraryOption.fill('beforeafter');
 await libraryOption.evaluate(element=>{element.focus();const range=document.createRange();range.setStart(element.firstChild,6);range.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});
 await page.locator('[data-format="image-library"]').click();
 assert.equal(await page.locator('#authoringInsert').isDisabled(),true);
 assert.match(await page.locator('#authoringImageGallery').textContent(),/No saved images/);
 const libraryImages=await page.evaluate(()=>{
  const original=document.querySelector('[data-field="promptHtml"] img').src;
  const canvas=document.createElement('canvas');canvas.width=80;canvas.height=40;const ctx=canvas.getContext('2d');ctx.fillStyle='#cc3333';ctx.fillRect(0,0,80,40);
  const images=[{id:'crop-geometry',name:'Geometry worksheet crop',width:80,height:40,original,image:canvas.toDataURL('image/png'),mode:'Black and white'}];
  localStorage.setItem('qb_image_crop_library_v1',JSON.stringify(images));return images;
 });
 await page.click('[data-author-action="refreshImages"]');await page.fill('#authoringImageSearch','geometry');
 await page.locator('input[name="authoringLibraryImage"]').check();
 await page.fill('#authoringLibraryAlt','Library geometry diagram');
 await page.screenshot({path:path.join(output,'authoring-image-library.png')});
 await page.click('#authoringInsert');
 assert.equal(await libraryOption.locator('img').getAttribute('src'),libraryImages[0].image);
 assert.equal(await libraryOption.locator('img').getAttribute('alt'),'Library geometry diagram');
 assert.deepEqual(await libraryOption.evaluate(el=>[el.firstChild.textContent,el.querySelector('img').nextSibling.textContent]),['before','after']);
 await libraryOption.focus();await page.locator('[data-format="image-library"]').click();await page.locator('input[name="authoringLibraryImage"]').check();
 await page.evaluate(()=>localStorage.removeItem('qb_image_crop_library_v1'));await page.click('[data-author-action="refreshImages"]');
 assert.equal(await page.locator('#authoringInsert').isDisabled(),true);await page.keyboard.press('Escape');
 await page.evaluate(images=>localStorage.setItem('qb_image_crop_library_v1',JSON.stringify(images)),libraryImages);
 await option.fill('Option ');await option.focus();
 await page.locator('[data-format="equation"]').click();
 await page.locator('[data-pick]').filter({hasText:'Fraction'}).first().click();
 await page.waitForSelector('#authoringMathfield');
 assert.equal(await page.locator('#authoringMathfield').evaluate(el=>el.value),'\\frac{a}{b}');
 await page.locator('#authoringMathfield').evaluate(el=>{el.value='\\sqrt{x}';el.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await page.inputValue('#authoringSource'),'\\sqrt{x}');
 await page.fill('#authoringSource','x^2 + y^2');
 assert.equal(await page.locator('#authoringMathfield').evaluate(el=>el.value),'x^2 + y^2');
 await page.locator('[data-favorite]').first().click();
 assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('qb_favorite_formulas_v1')).length>0));
 page.once('dialog',dialog=>dialog.accept('Saved test equation'));await page.click('[data-author-action="save"]');
 assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('qb_custom_formulas_v1')).some(item=>item.name==='Saved test equation')));
 await page.screenshot({path:path.join(output,'authoring-equation.png')});
 await page.click('#authoringInsert');assert.equal(await option.locator('[data-latex]').count(),1);assert.ok(await option.locator('.katex').count()>0);
 // A rerender must retain one formula, without copying the generated KaTeX HTML into stored source.
 await page.locator('[data-action="optionDown"]').first().click();
 assert.equal(await page.locator('[data-option-text="0"] [data-latex]').count(),1);
 await question.focus();await page.locator('[data-format="diagram"]').click();await page.waitForSelector('#authoringPreviewContent svg');
 await page.click('[data-author-action="zoomIn"]');assert.match(await page.locator('#authoringPreviewContent').getAttribute('style'),/1\.25/);await page.click('[data-author-action="fit"]');
 await page.screenshot({path:path.join(output,'authoring-diagram.png')});await page.click('#authoringInsert');
 await page.waitForFunction(()=>document.querySelectorAll('[data-field="promptHtml"] img').length===2);
 await question.focus();await page.locator('[data-format="table"]').click();await page.waitForSelector('#authoringToastHost .toastui-editor-defaultUI');
 assert.notEqual(await page.locator('#authoringToastHost .toastui-editor-toolbar-icons.bold').evaluate(el=>getComputedStyle(el).backgroundImage),'none','Toast UI toolbar icons must remain visible');

 await page.locator('.toastui-editor-mode-switch .tab-item').filter({hasText:'Markdown'}).click();
 await page.locator('.toastui-editor-md-container .ProseMirror').fill('| Name | Value |\n| --- | --- |\n| x | 2 |');
 await page.locator('.toastui-editor-mode-switch .tab-item').filter({hasText:'WYSIWYG'}).click();
 await page.screenshot({path:path.join(output,'authoring-markdown.png')});await page.click('#authoringInsert');assert.equal(await question.locator('table').count(),1);
 await page.setViewportSize({width:390,height:844});await option.focus();await page.locator('[data-format="equation"]').click();
 assert.equal(await page.evaluate(()=>document.querySelector('#richAuthoringDialog').scrollWidth>document.querySelector('#richAuthoringDialog').clientWidth),false);
 await page.screenshot({path:path.join(output,'authoring-mobile.png')});await page.keyboard.press('Escape');
 await page.fill('#bulkCount','0');await page.click('#bulkAdd');await page.waitForFunction(()=>document.querySelector('#status').classList.contains('error'));
 // Verify that the bank modal uses the same floating toolbar and permits nested insertion dialogs.
 page.once('dialog',dialog=>dialog.accept());await page.goto(base+'/index.html');await page.click('#newQuestionBtn');
 assert.equal(await page.locator('#questionFloatingToolbar').isVisible(),true);
 const bankPrompt=page.locator('#qPrompt');await bankPrompt.fill('Bank question ');await bankPrompt.focus();await page.locator('[data-author-insert="equation"]').click();await page.fill('#authoringSource','\\frac{3}{4}');await page.click('#authoringInsert');
 assert.equal(await bankPrompt.locator('[data-latex]').count(),1);assert.equal(await page.locator('#questionDialog').evaluate(el=>el.open),true);
 await bankPrompt.evaluate(async element=>{element.focus();const range=document.createRange();range.selectNodeContents(element);range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);const canvas=document.createElement('canvas');canvas.width=40;canvas.height=20;const blob=await new Promise(resolve=>canvas.toBlob(resolve));const data=new DataTransfer();data.items.add(new File([blob],'paste.png',{type:'image/png'}));element.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});
 await bankPrompt.locator('img').waitFor();
 await page.locator('#qExplanation').fill('Notes ');await page.locator('#qExplanation').focus();await page.locator('[data-author-insert="table"]').click();await page.waitForSelector('#authoringToastHost .toastui-editor-defaultUI');
 await page.locator('.toastui-editor-mode-switch .tab-item').filter({hasText:'Markdown'}).click();await page.locator('.toastui-editor-md-container .ProseMirror').fill('**Teacher notes**');await page.click('#authoringInsert');assert.match(await page.inputValue('#qExplanation'),/\*\*Teacher notes\*\*/);
 await page.locator('#option0').fill('Bank option ');await page.locator('#option0').focus();await page.locator('[data-author-insert="image-library"]').click();await page.locator('input[name="authoringLibraryImage"]').check();await page.click('#authoringInsert');
 assert.equal(await page.locator('#option0 img').count(),1);assert.equal(await page.locator('#option0 img').getAttribute('src'),libraryImages[0].image);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:path.join(output,'authoring-bank-mobile.png')});
 assert.deepEqual(errors,[]);console.log('PASS: real MathLive, synchronized LaTeX, favorites, saved equations, Mermaid previews/zoom/insertion, Toast UI Markdown/WYSIWYG tables, clipboard images at the saved cursor, responsive dialogs, saved image library selection/refresh/cursor placement, and bank floating toolbar.');
}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
