const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const context=vm.createContext({LABELS:['A','B','C','D'],esc:value=>String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;'),stripHtml:value=>String(value || '').replace(/<[^>]*>/g,'')});
for(const [start,end] of [
 ['const TEMPLATE_HEADERS =','const FORMULA_LIBRARY ='],
 ['function parseCsvQuestions(','function loadCsvFile('],
 ['function buildInvalidCsvSection(','async function confirmImport('],
 ['function normalizeType(','function normalize'],
 ['function splitMulti(','function downloadBlob(']
]){
 const a=source.indexOf(start);let b=end==='function normalize'?source.indexOf('\n}',a)+2:source.indexOf(end,a+start.length);
 vm.runInContext(source.slice(a,b),context);
}
const headers=vm.runInContext('TEMPLATE_HEADERS',context);
function row(overrides={}){return headers.map(h=>({type:'short_answer',class:'English',subject:'English Language',chapter:'A1',topic:'Food - Articles',difficulty:'Hard',question:'Complete: I would like _____ apple.',short_answer:'I would like an apple.',language:'Hindi',translated_question:'मैं एक सेब चाहूँगा।',translated_answer:'मैं एक सेब चाहूँगा।',verified:'false',explanation:'Use an before apple, because it begins with a vowel sound.',skill:'Writing',actfl_level:'Novice',actfl_sublevel:'High',actfl_mode:'Presentational',translated_explanation:'apple की शुरुआत स्वर ध्वनि से होती है।',...overrides})[h] ?? '');}
test('full-width CSV preserves quoted explanations and metadata alignment',()=>{
 const result=context.parseCsvQuestions(context.toCsv([headers,row()]));
 assert.equal(result.errors.length,0);assert.equal(result.rows[0].skill,'Writing');assert.equal(result.rows[0].actfl_level,'Novice');assert.match(result.rows[0].explanation, /apple, because/);
});
test('extra or missing cells produce a column-count error before misleading enum errors',()=>{
 for(const cells of [[...row(),'extra'],row().slice(0,-1)]){
  const result=context.parseCsvQuestions(context.toCsv([headers,cells]));
  assert.equal(result.rows.length,0);assert.equal(result.errors.length,1);assert.equal(result.errors[0].field,'CSV columns');assert.match(result.errors[0].message,/Expected 31 columns/);
 }
});
test('optional headers may be omitted globally, but duplicate headers are rejected',()=>{
 const minimal='type,class,subject,chapter,topic,question,short_answer\nshort_answer,English,English Language,A1,Food,Question,Answer';
 assert.equal(context.parseCsvQuestions(minimal).rows.length,1);
 assert.match(context.parseCsvQuestions('type,type\nmcq,mcq').errors[0],/Duplicate headers/);
});
test('invalid CSV copy contains the header and failed rows once, with no duplicated errors',()=>{
 const good=row(),bad=[...row(),'extra'];const csv=context.toCsv([headers,good,bad]);const errors=context.parseCsvQuestions(csv).errors;
 const copied=context.buildInvalidCsvSection(csv,errors);
 assert.equal(context.parseCsv(copied).length,2);assert.ok(!copied.includes('Validation errors:'));assert.ok(!copied.includes('Invalid CSV rows:'));
 assert.equal(context.formatImportErrors(['Row 3: bad','Row 3: bad']).split('Row 3: bad').length-1,1);
});

test('CSV line counts update for empty text, header-only, pasted data, and Windows line endings',()=>{
 for(const [input,total,data] of [['',0,0],['  ',0,0],['type,question',1,0],['type,question\nmcq,Q\n',2,1],['type,question\r\nmcq,Q\r\nfib,Q\r\n',3,2]]){
  const counts=context.countCsvInputLines(input);assert.equal(counts.total,total);assert.equal(counts.excludingHeader,data);
 }
});
