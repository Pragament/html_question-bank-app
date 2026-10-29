const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const context=vm.createContext({sanitizeInlineSvg:()=>'',LABELS:['A','B','C','D'],esc:value=>String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),stripHtml:value=>String(value || '').replace(/<[^>]*>/g,'')});
for(const [start,end] of [
 ['const TEMPLATE_HEADERS =','const FORMULA_LIBRARY ='],
 ['function csvRichText(','function loadCsvFile('],
 ['function buildInvalidCsvSection(','async function confirmImport('],
 ['function normalizeType(','function normalize'],
 ['function splitMulti(','function downloadBlob(']
]){
 const a=source.indexOf(start);let b=end==='function normalize'?source.indexOf('\n}',a)+2:source.indexOf(end,a+start.length);
 vm.runInContext(source.slice(a,b),context);
}
vm.runInContext(fs.readFileSync(path.join(__dirname,'../csv-images.js'),'utf8').replace('export function','function'),context);
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

test('CSV math and Mermaid markers become safe rich tokens while plain HTML stays text',()=>{
 const input=String.raw`Find \(\frac{1}{2}\) and \[x^2\]. [mermaid]flowchart LR; A[Water] --> B[Steam];[/mermaid] <script>alert(1)</script>`;
 const html=context.csvRichText(input);
 assert.match(html,/class="math-token"/);assert.match(html,/data-display="block"/);assert.match(html,/data-latex="\\frac/);assert.match(html,/class="mermaid-token"/);assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
 const result=context.parseCsvQuestions(context.toCsv([headers,row({question:input,short_answer:String.raw`\(x=2\)`})]));
 assert.equal(result.errors.length,0);assert.match(result.rows[0].promptHtml,/mermaid-token/);assert.match(result.rows[0].shortAnswerHtml,/math-token/);
});

test('preview table keeps renderable notation in questions, options, answers, explanations, and translations',()=>{
 context.sanitizeRich=value=>String(value || '');
 vm.runInContext(source.slice(source.indexOf('function answerHtml('),source.indexOf('function answerText('))+source.slice(source.indexOf('function renderValidImportTable('),source.indexOf('function renderImportTaxonomyPlan(')),context);
 const result=context.parseCsvQuestions(context.toCsv([headers,row({type:'mcq',question:String.raw`Find \(x\). [mermaid]flowchart LR; A-->B;[/mermaid]`,option_a:String.raw`\(1\)`,option_b:'2',option_c:'3',option_d:'4',correct_options:'A',explanation:String.raw`Solve \(2x=2\).`,translated_question:String.raw`ज्ञात करें \(x\).`,translated_explanation:'[mermaid]flowchart LR; C-->D;[/mermaid]'})]));
 assert.equal(result.errors.length,0);
 const html=context.renderValidImportTable(result.rows);
 assert.match(html,/<span class="math-token"/);
 assert.match(html,/<div class="mermaid-token"/);
 assert.ok(!html.includes('&lt;span class='));
 assert.match(html,/import-translation/);
 assert.match(html,/<strong>\(correct\)<\/strong>/);
});

test('preview rendering populates KaTeX and Mermaid tokens',async()=>{
 const math={dataset:{latex:'x^2',display:'block'},innerHTML:''};
 const diagram={dataset:{code:'flowchart LR; A-->B;'},innerHTML:''};
 context.window={katex:{renderToString:(latex,options)=>`<math>${latex}:${options.displayMode}</math>`},mermaid:{render:async(id,code)=>({svg:`<svg>${code}</svg>`})}};
 vm.runInContext(source.slice(source.indexOf('async function renderMathAndDiagrams('),source.indexOf('function invalidateImportPreview(')),context);
 await context.renderMathAndDiagrams({querySelectorAll:selector=>selector==='.math-token'?[math]:[diagram]});
 assert.equal(math.innerHTML,'<math>x^2:true</math>');assert.match(diagram.innerHTML,/<svg>flowchart LR/);
});


test('parenthesized LaTeX fallback renders degree options without changing ordinary prose',()=>{
 const html=context.csvRichText(String.raw`One angle is (70^\circ), find (x). Options: (x=90^\circ), (x=110^\circ), (x=100^\circ), (x=120^\circ). Keep (correct) and (for example) as text.`);
 assert.equal((html.match(/class="math-token"/g) || []).length,5);
 assert.match(html,/data-latex="x=110\^\\circ"/);
 assert.ok(html.includes('(x)'));assert.ok(html.includes('(correct)'));assert.ok(html.includes('(for example)'));
 const diagram=context.csvRichText('[mermaid]flowchart LR; A[Text (x^2)]-->B;[/mermaid]');
 assert.ok(!diagram.includes('class="math-token"'));
});

test('CSV Markdown image-only MCQ options render while raw HTML images and SVG stay escaped',()=>{
 const image='![Diagram](data:image/png;base64,iVBORw0KGgo=)';
 const result=context.parseCsvQuestions(context.toCsv([headers,row({type:'mcq',question:'Choose: '+image,option_a:image,option_b:'B',option_c:'C',option_d:'D',correct_options:'A'})]));
 assert.equal(result.errors.length,0);assert.match(result.rows[0].promptHtml,/<img class="csv-embedded-image"/);
 const raw=context.csvRichText('<img src="data:image/png;base64,iVBORw0KGgo="><svg><circle r="10"/></svg>');
 assert.ok(!raw.includes('<img'));assert.ok(!raw.includes('<svg'));assert.ok(raw.includes('&lt;img'));assert.ok(raw.includes('&lt;svg'));
});

test('each prompt diagram choice requests only the selected representation',()=>{
 vm.runInContext(source.slice(source.indexOf('function promptDiagramRequirement('),source.indexOf('function selectedPromptLabel(')),context);
 for(const [format,label] of [['mermaid','Mermaid'],['base64','Base64 image in Markdown'],['svg','SVG image in Markdown']]){
  const prompt=context.promptDiagramRequirement(format);assert.ok(prompt.includes('Selected diagram format: '+label));assert.ok(prompt.includes('Never output raw HTML'));
 }
 assert.ok(context.promptDiagramRequirement('base64').includes('never invent base64'));
});

test('none or missing diagram format adds no prompt instructions',()=>{
 vm.runInContext(source.slice(source.indexOf('function promptDiagramRequirement('),source.indexOf('function selectedPromptLabel(')),context);
 for(const value of ['none',undefined,'']){
  assert.equal(context.promptDiagramRequirement(value),'');
 }
});
