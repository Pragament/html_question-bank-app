const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function fixture(overrides={}){
 const elements=new Map(),writes=[];
 const $=id=>{if(!elements.has(id))elements.set(id,{value:'',disabled:false,textContent:''});return elements.get(id);};
 $('csvPasteInput').value='current CSV';
 const ctx=vm.createContext({window:{confirm:()=>true},$,importPreviewVersion:0,importPreviewCsv:'current CSV',importPreviewUserUid:'me',importRows:[{taxonomyLabels:{className:'IX'},type:'short_answer'}],currentUser:{uid:'me',displayName:'Teacher'},els:{importPreview:{textContent:''},importListSelect:{value:''},importDialog:{close(){}}},COLLECTIONS:{questions:'qb_questions_v1'},db:{},collection:()=>({}),serverTimestamp:()=>0,taxonomyPathCacheKey:()=> 'path',ensureTaxonomyPath:async()=>({classId:'IX'}),addDoc:async(_,data)=>{writes.push(data);return{id:'created'};},toast(){},updateCsvLineCount(){},loadQuestionPage(){},...overrides});
 vm.runInContext(source.slice(source.indexOf('function invalidateImportPreview('),source.indexOf('async function previewImport('))+source.slice(source.indexOf('async function confirmImport('),source.indexOf('function renderImportListOptions(')),ctx);
 return{ctx,elements,writes};
}
test('import without preview cannot write',async()=>{const {ctx,writes}=fixture({importPreviewCsv:null});await ctx.confirmImport();assert.equal(writes.length,0);});
test('CSV edits and account changes require another preview',async()=>{for(const overrides of [{importPreviewCsv:'old CSV'},{importPreviewUserUid:'someone-else'}]){const{ctx,writes}=fixture(overrides);await ctx.confirmImport();assert.equal(writes.length,0);}});
test('preview permission is consumed before writes, preventing repeated import clicks',async()=>{const{ctx,writes}=fixture();await Promise.all([ctx.confirmImport(),ctx.confirmImport()]);assert.equal(writes.length,1);assert.equal(ctx.importPreviewCsv,null);assert.equal(ctx.$('confirmImportBtn').disabled,true);});
test('invalidating a preview clears all import authorization',()=>{const{ctx}=fixture();ctx.invalidateImportPreview();assert.equal(ctx.importPreviewCsv,null);assert.equal(ctx.importPreviewUserUid,null);assert.equal(ctx.importRows.length,0);assert.equal(ctx.importPreviewVersion,1);});

test('canceling import without a list preserves the preview and makes no writes',async()=>{
 const {ctx,writes}=fixture({window:{confirm:()=>false}});
 await ctx.confirmImport();assert.equal(writes.length,0);assert.equal(ctx.importPreviewCsv,'current CSV');assert.equal(ctx.importRows.length,1);assert.equal(ctx.importPreviewVersion,0);
});
test('importing without a list requires confirmation with the row count',async()=>{
 let message='';const {ctx,writes}=fixture({window:{confirm:text=>{message=text;return true;}}});
 await ctx.confirmImport();assert.match(message,/Import 1 valid row without adding to a list/);assert.equal(writes.length,1);
});
test('selected list imports do not ask for confirmation',async()=>{
 const {ctx,writes}=fixture({window:{confirm:()=>{throw new Error('Unexpected confirmation');}},doc:()=>({}),arrayUnion:(...ids)=>ids,updateDoc:async()=>{}});
 ctx.els.importListSelect.value='selected-list';await ctx.confirmImport();assert.equal(writes.length,1);
});
