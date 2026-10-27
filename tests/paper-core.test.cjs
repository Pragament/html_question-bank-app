const {test,before} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
let core;
before(async()=>{core=await import('data:text/javascript;base64,'+readFileSync(require('node:path').join(__dirname,'../paper-core.js')).toString('base64'));});
test('paper names use selected date and trimmed optional identifier',()=>{
    assert.equal(core.listName({className:'IX',subjectName:'English'}),'IX · English');
    assert.equal(core.listName({className:'IX',subjectName:'English',date:'2026-10-24',identifier:' Set B '}),'IX · English · 2026-10-24 · Set B');
});
test('scoring rejects any wrong selection in both modes',()=>{
    const q={options:[{correct:true},{correct:true},{correct:false},{correct:false}],multipleCorrectMode:'all'};
    assert.equal(core.earnsFullMarks(q,[0]),false);assert.equal(core.earnsFullMarks(q,[0,1]),true);assert.equal(core.earnsFullMarks(q,[0,1,2]),false);
    q.multipleCorrectMode='any';assert.equal(core.earnsFullMarks(q,[0]),true);assert.equal(core.earnsFullMarks(q,[0,2]),false);assert.equal(core.earnsFullMarks(q,[]),false);
});
test('moving options remaps displayed answer letters without changing canonical answers',()=>{
    const q={options:[{correct:true},{correct:false},{correct:false},{correct:true}]},order=[0,1,2,3];
    core.move(order,0,2);assert.deepEqual(core.correctLetters(q,order),['C','D']);assert.equal(q.options[0].correct,true);
    assert.deepEqual(core.optionOrder([0,0,2,3]),[0,1,2,3]);
});
test('randomization is a permutation and moving outside the list is harmless',()=>{
    const rows=[1,2,3,4];core.shuffle(rows,()=>0);assert.deepEqual([...rows].sort(),[1,2,3,4]);assert.notDeepEqual(rows,[1,2,3,4]);
    const original=[...rows];core.move(rows,0,-1);assert.deepEqual(rows,original);
});
test('CSV quotes commas, newlines, and quotation marks',()=>{assert.equal(core.csv([['a,b','c"d','e\nf']]),'\ufeff"a,b","c""d","e\nf"');});
test('DOCX ZIP contains local and central headers with valid boundaries',async()=>{
    const blob=core.zip({'word/document.xml':'<test>hello</test>','_rels/.rels':'relationships'}),bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer);
    assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint32(bytes.length-22,true),0x06054b50);assert.equal(view.getUint16(bytes.length-12,true),2);
    const centralOffset=view.getUint32(bytes.length-6,true);assert.equal(view.getUint32(centralOffset,true),0x02014b50);
});

test('saving visible MCQs preserves skipped references and applies edited order', () => {
    assert.deepEqual(core.preserveSkippedQuestions(['mcq2','new'], ['mcq1','short','mcq2','fib'], ['short','fib']), ['mcq2','short','new','fib']);
    assert.deepEqual(core.preserveSkippedQuestions([], ['mcq1','short'], ['short']), ['short']);
    assert.deepEqual(core.preserveSkippedQuestions(['new'], [], []), ['new']);
});

test('list loading keeps source option order unless that question has a valid explicit override', () => {
    const original = ['original A','original B','original C','original D'];
    for (const list of [{}, {questionSettings:{}}, {questionSettings:{q:{optionsLayout:'2x2'}}}, {questionSettings:{other:{optionOrder:[3,2,1,0]}}}, {questionSettings:{q:{optionOrder:[1,1,2,3]}}}]) {
        assert.deepEqual(core.listOptionOrder(list,'q').map(i=>original[i]),original);
    }
    assert.deepEqual(core.listOptionOrder({questionSettings:{q:{optionOrder:[2,0,3,1]}}},'q').map(i=>original[i]),['original C','original A','original D','original B']);
    assert.deepEqual(original,['original A','original B','original C','original D']);
});
