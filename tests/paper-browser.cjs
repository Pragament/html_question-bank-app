// Start a local server first. Firebase is mocked; this test never writes to the live project.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path=require('node:path'),os=require('node:os');
const output=process.env.PAPER_TEST_OUTPUT || require('node:fs').mkdtempSync(path.join(os.tmpdir(),'paper-editor-test-'));
const fs=require('fs');
(async()=>{
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE} : {})});const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log('BROWSER',m.text())});
await page.route('https://cdn.jsdelivr.net/**',route=>route.abort());
await page.route('https://www.gstatic.com/firebasejs/**',async route=>{
 const url=route.request().url();let body='';
 if(url.includes('firebase-app'))body='export const initializeApp=()=>({});';
 if(url.includes('firebase-auth'))body=`export const getAuth=()=>({});export class GoogleAuthProvider{};export const onAuthStateChanged=(a,cb)=>setTimeout(()=>cb({uid:'me',displayName:'Teacher'}),10);export const signInWithPopup=async()=>{};export const signOut=async()=>{};`;
 if(url.includes('firebase-firestore'))body=`
 const store=globalThis.__store ||= {qb_taxonomy_v1:{class_ix:{type:'class',label:'IX',parentId:''},subject_english:{type:'subject',label:'English',parentId:'class_ix'},chapter:{type:'chapter',label:'Reading',parentId:'subject_english'},topic:{type:'topic',label:'Reading comprehension',parentId:'chapter'}},qb_lists_v1:{},qb_questions_v1:{foreign:{type:'mcq',authorUid:'someone-else',authorName:'Other teacher',classId:'class_ix',subjectId:'subject_english',status:'published',promptHtml:'Other author question',options:['Red','Blue','Green','Yellow'].map((html,i)=>({html,correct:i===1}))}},qb_comprehensions_v1:{}};
 export const getFirestore=()=>({});export const collection=(db,name)=>({collection:name});
 let counter=0;export const doc=(db,c,id)=>db.collection?{collection:db.collection,id:'new-'+(++counter)}:{collection:c,id};
 export const where=(...args)=>({kind:'where',args});export const or=(...args)=>({kind:'or',args});export const and=(...args)=>({kind:'and',args});export const limit=(n)=>({kind:'limit',n});export const orderBy=()=>({});export const documentId=()=>'';export const startAfter=()=>({});export const query=(ref,...constraints)=>({...ref,constraints});
 const snap=(id,data)=>({id,exists:()=>!!data,data:()=>structuredClone(data)});
 export const getDoc=async ref=>snap(ref.id,store[ref.collection]?.[ref.id]);
 export const getDocs=async ref=>({docs:Object.entries(store[ref.collection]||{}).map(([id,data])=>snap(id,data))});
 export const serverTimestamp=()=>123;
 export const writeBatch=()=>{const writes=[];return{set:(ref,data,opts)=>writes.push({ref,data,opts}),commit:async()=>{globalThis.__writes ||= [];globalThis.__writes.push(writes);for(const {ref,data,opts}of writes)store[ref.collection][ref.id]=opts?.merge?{...store[ref.collection][ref.id],...structuredClone(data)}:structuredClone(data);}}};
 `;
 await route.fulfill({contentType:'application/javascript',body});
});
await page.goto(`${process.env.PAPER_TEST_URL || 'http://localhost:8000'}/question-paper.html`);await page.waitForFunction(()=>document.querySelector('#paperClass').options.length===2);
await page.selectOption('#paperClass','class_ix');await page.selectOption('#paperSubject','subject_english');await page.fill('#paperIdentifier','Set A');await page.fill('#paperDate','2026-10-24');
if(await page.inputValue('#paperName')!=='IX · English · 2026-10-24 · Set A')throw Error('Name generation');
await page.keyboard.press('Alt+n');
await page.locator('[data-field="promptHtml"]').first().fill('Which colours are primary?');
for(let i=0;i<4;i++)await page.locator(`[data-option-text="${i}"]`).first().fill(['Red','Blue','Green','Yellow'][i]);
const scoring=page.locator('[data-scoring-rules]').first();
if(await scoring.isVisible())throw Error('Scoring rules visible with no correct options');
await page.locator('[data-correct="0"]').first().check();
if(await scoring.isVisible())throw Error('Scoring rules visible with one correct option');
await page.locator('[data-correct="1"]').first().check();
if(!await scoring.isVisible())throw Error('Scoring rules hidden with two correct options');
await page.locator('[data-correct="1"]').first().uncheck();
if(await scoring.isVisible())throw Error('Scoring rules remain visible after reducing to one option');
await page.locator('[data-correct="1"]').first().check();await page.locator('[data-field="multipleCorrectMode"][value="any"]').first().check();
await page.locator('[data-option="0"] [data-action="optionDown"]').first().click();
await page.locator('summary').filter({hasText:'Optional settings'}).first().click();await page.locator('[data-layout]').first().selectOption('4x1');
await page.locator('[data-new-language]').first().fill('hi');await page.getByRole('button',{name:'Add translation',exact:true}).first().click();await page.locator('[data-translation-field="question"]').first().fill('Hindi question');
await page.locator('[data-field="promptHtml"]').first().focus();await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('saved.'));
let store=await page.evaluate(()=>globalThis.__store);let list=Object.values(store.qb_lists_v1)[0];if(list.questionIds.length!==1)throw Error('Save IDs');if(list.questionSettings[list.questionIds[0]].optionOrder.join()!=='1,0,2,3')throw Error('Option order persistence');
await page.fill('#reuseId','foreign');await page.click('#reuseQuestion');await page.waitForFunction(()=>document.querySelectorAll('.question-card').length===2);
if(await page.locator('.question-card').nth(1).locator('[data-field="promptHtml"]').getAttribute('contenteditable')!=='false')throw Error('Foreign author editable');
await page.keyboard.press('Alt+p');await page.waitForFunction(()=>document.querySelectorAll('.question-card').length===4);
await page.locator('[data-passage-text]').fill('Read this shared passage.');
for(let i=2;i<4;i++){let card=page.locator('.question-card').nth(i);await card.locator('[data-field="promptHtml"]').fill('Passage question '+i);for(let o=0;o<4;o++)await card.locator(`[data-option-text="${o}"]`).fill('Answer '+o);await card.locator('[data-correct="0"]').check();}
await page.click('#save');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('saved.'));
store=await page.evaluate(()=>globalThis.__store);if(Object.keys(store.qb_comprehensions_v1).length!==1)throw Error('Shared passage count');const linked=Object.values(store.qb_questions_v1).filter(q=>q.comprehensionId);if(linked.length!==2||linked.some(q=>q.promptHtml.includes('shared passage')))throw Error('Passage duplication');
const foreignWrites=await page.evaluate(()=>globalThis.__writes.flat().filter(w=>w.ref.collection==='qb_questions_v1'&&w.ref.id==='foreign'));if(foreignWrites.length)throw Error('Foreign question written');
await page.fill('#paperIdentifier','Set B');await page.locator('.question-card').first().locator('[data-action=down]').click();await page.click('#saveCopy');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Saved as another'));store=await page.evaluate(()=>globalThis.__store);if(Object.keys(store.qb_lists_v1).length!==2)throw Error('Copy list');
await page.locator('[data-passage-text]').fill('Edited shared passage for both paper sets.');await page.click('#save');
await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('saved.'));
const firstListId=Object.keys(store.qb_lists_v1)[0];await page.selectOption('#savedLists',firstListId);await page.click('#openList');
await page.waitForFunction(()=>document.querySelector('#status').textContent==='List loaded.');
if(!(await page.locator('[data-passage-text]').textContent()).includes('Edited shared passage'))throw Error('Shared edit not visible in original paper set');
if(await page.inputValue('#paperIdentifier')!=='Set A')throw Error('Original paper settings changed by copy');
if(await page.locator('[data-layout]').first().inputValue()!=='4x1')throw Error('Layout override lost on reopening');
const firstPrompt=page.locator('[data-field="promptHtml"]').first();await firstPrompt.focus();await page.keyboard.press('End');
await page.getByRole('button',{name:'Equation',exact:true}).click();await page.fill('#insertValue','x^2 + y^2');await page.locator('#insertForm button[type=submit]').click();
if(!(await firstPrompt.innerHTML()).includes('data-latex'))throw Error('Shared toolbar insertion');
const imageData=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=180;canvas.height=70;const ctx=canvas.getContext('2d');ctx.fillStyle='#eef6f4';ctx.fillRect(0,0,180,70);ctx.fillStyle='#155d58';ctx.font='18px sans-serif';ctx.fillText('Illustration',25,40);return canvas.toDataURL('image/png');});
await firstPrompt.focus();await page.getByRole('button',{name:'Image',exact:true}).click();await page.fill('#insertValue',imageData);await page.locator('#insertForm button[type=submit]').click();
await firstPrompt.focus();await page.getByRole('button',{name:'Table',exact:true}).click();await page.fill('#insertValue','2x2');await page.locator('#insertForm button[type=submit]').click();

await page.locator('#textSize').fill('12');await page.selectOption('#paperColumns','2');
const dl=page.waitForEvent('download');await page.click('#downloadDocx');const download=await dl;await download.saveAs(path.join(output,'paper-editor-test.docx'));
for(const columns of ['1','4']){await page.selectOption('#paperColumns',columns);const next=page.waitForEvent('download');await page.click('#downloadDocx');await(await next).saveAs(path.join(output,`paper-editor-${columns}-columns.docx`));}

const csv=page.waitForEvent('download');await page.click('#downloadCsv');await(await csv).saveAs(path.join(output,'paper-editor-test.csv'));
await page.screenshot({path:path.join(output,'paper-editor-mobile.png'),fullPage:true});
const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error('Phone viewport overflow');
await page.setViewportSize({width:1366,height:900});await page.screenshot({path:path.join(output,'paper-editor-desktop.png'),fullPage:true});
if(errors.length)throw Error(errors.join('\n'));console.log('PASS: phone layout, keyboard add/save, naming, translations, option reorder, save, foreign-author read-only, passage reference save, copy set, DOCX and CSV download.');
console.log('Test artifacts:',output);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
